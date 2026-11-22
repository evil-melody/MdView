/**
 * Delimited text (CSV / TSV) streamed into a sheet. The bytes are read in chunks, cut at row ends, and the rows go
 * straight into the sheet's model, the way a worksheet's XML does, so a file of a million rows is never a string, a
 * table of strings or a workbook XML on the way in. The sheet is marked structural: saving writes every row from the
 * model.
 *
 * Past a budget of cells the rows stay in the file: the loader keeps where each page of rows starts and goes on
 * counting rows, and a page is read again when its rows are shown, edited, searched or saved, the least recently
 * used pages making room (`RowPages`). A sheet under the budget is not affected: all its rows are in memory.
 */
import { detectSeparator, fieldValue } from '../convert'
import type { ByteSource } from '../source'
import type { ColInfo } from './types'
import { MAX_COL, T_BOOL, T_NUM, T_STR, type SheetData } from './workbook'

export interface DelimitedImport {
  /** the text's bytes (a File, a buffer, a URL) */
  source: ByteSource
  /** field separator: a tab, a semicolon or a comma; detected from the first line when missing */
  sep?: string
  /** cells kept in memory at a time (RESIDENT_CELLS); past it the rows are read from the file as they are needed */
  budget?: number
  /** rows read from the file at a time, past the budget (PAGE_ROWS) */
  pageRows?: number
}

/** what a loader reports while it fills a sheet */
export interface LoadReport {
  /** rows came in (the first call also means the header — column widths — is known); lets the view catch up */
  chunk(): Promise<void>
  /** the rows reported so far were dropped and are being read again (another encoding): cached rows are stale */
  reset(): void
  bytes?(loaded: number, total: number): void
}

/** fills a sheet from something else than its XML (a text file being imported) */
export type SheetLoader = (d: SheetData, report: LoadReport) => Promise<void>

/** cells a sheet holds in memory: a million rows of 12 columns (about 300 MB in Chrome, three times that in Safari) */
export const RESIDENT_CELLS = 12_000_000
/** rows per page read from the file */
export const PAGE_ROWS = 1024
/** rows read before the header (column widths) is reported, when the file has that many */
const HEADER_ROWS = 5000
/** texts this short are shared between the cells holding the same one */
const INTERN_MAX = 40
const POOL_MAX = 100_000

class BadEncoding extends Error {}

interface Encoding {
  label: string
  /** bytes of a byte order mark */
  skip: number
  /** a guess: decoding fails on bytes that are not UTF-8 (the file is then read as Windows-1252) */
  strict: boolean
  /** bytes per code unit (2 for UTF-16), and their order */
  unit: 1 | 2
  le: boolean
}

/** byte order mark, then the declared charset, then UTF-8 (Windows-1252 when the bytes are not UTF-8: Excel's CSV on Windows) */
function encodingOf(head: Uint8Array, type?: string): Encoding {
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) return { label: 'utf-8', skip: 3, strict: false, unit: 1, le: true }
  if (head[0] === 0xff && head[1] === 0xfe) return { label: 'utf-16le', skip: 2, strict: false, unit: 2, le: true }
  if (head[0] === 0xfe && head[1] === 0xff) return { label: 'utf-16be', skip: 2, strict: false, unit: 2, le: false }
  const charset = /;\s*charset=["']?([^;"'\s]+)/i.exec(type ?? '')?.[1]
  if (charset) {
    try {
      new TextDecoder(charset)
      const utf16 = /^utf-?16/i.test(charset)
      return { label: charset, skip: 0, strict: false, unit: utf16 ? 2 : 1, le: !utf16 || !/be$/i.test(charset) }
    } catch {
      // unknown label: guess below
    }
  }
  return { label: 'utf-8', skip: 0, strict: true, unit: 1, le: true }
}

/** where parsed rows go: the sheet, or a page of it */
export interface RowSink {
  rows: (unknown[] | undefined)[]
  maxRow: number
  maxCol: number
}

/** Streams a delimited text file into `d`; the rows are reported as they come. */
export async function loadDelimited(d: SheetData, imp: DelimitedImport, report: LoadReport): Promise<void> {
  const src = imp.source
  let enc = encodingOf(src.size ? await src.read(0, Math.min(src.size, 3)) : new Uint8Array(0), src.type)
  for (;;) {
    try {
      await parseStream(d, imp, enc, report)
      return
    } catch (e) {
      if (!(e instanceof BadEncoding)) throw e
      // not UTF-8 after all: start over as Windows-1252
      d.rows = []
      d.maxRow = -1
      d.maxCol = -1
      d.colInfo = []
      d.pages = undefined
      report.reset()
      enc = { label: 'windows-1252', skip: 0, strict: false, unit: 1, le: true }
    }
  }
}

async function parseStream(d: SheetData, imp: DelimitedImport, enc: Encoding, report: LoadReport): Promise<void> {
  const src = imp.source
  const total = src.size
  const budget = imp.budget ?? RESIDENT_CELLS
  const page = imp.pageRows ?? PAGE_ROWS
  const decoder = new TextDecoder(enc.label, { fatal: enc.strict })
  const decode = (b: Uint8Array): string => {
    try {
      return decoder.decode(b)
    } catch {
      throw new BadEncoding()
    }
  }
  const reader = src.stream(enc.skip, total - enc.skip).getReader()
  const pool = new Map<string, string>()
  /** bytes scanned but not yet parsed (parsing stops at row ends, and at the first page that stays in the file) */
  const queue = new ByteQueue(enc.skip)
  let scanner: RowScanner | null = null
  let parser: Parser | null = null
  let sep = ','
  let loaded = enc.skip
  let header = false
  /** the first page whose rows stay in the file (-1: every row so far is in memory) */
  let stop = -1
  /** rows of pages from `stop` on, read from the file when needed */
  const readPage = async (p: number): Promise<(unknown[] | undefined)[]> => {
    const a = scanner!.starts[p]
    const b = scanner!.starts[p + 1]
    const sink: RowSink = { rows: [], maxRow: -1, maxCol: -1 }
    const ps = new Parser(sink, sep, pool, false)
    ps.push(new TextDecoder(enc.label).decode(await src.read(a, b - a)))
    ps.end()
    return sink.rows
  }
  let head: Uint8Array[] = []
  let headLen = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (value) {
      loaded += value.length
      if (!scanner) {
        // the separator comes from the first line
        head.push(value)
        headLen += value.length
        if (!done && value.indexOf(10) < 0 && value.indexOf(13) < 0 && headLen < 1 << 16) continue
      }
    }
    if (!scanner) {
      const bytes = concat(head)
      head = []
      sep = imp.sep ?? detectSeparator(new TextDecoder(enc.label).decode(bytes))
      scanner = new RowScanner(sep.charCodeAt(0), enc.unit, enc.le, page, enc.skip)
      parser = new Parser(d, sep, pool, true)
      scanner.scan(bytes, enc.skip)
      queue.push(bytes)
    } else if (value) {
      scanner.scan(value, loaded - value.length)
      if (!d.pages) queue.push(value)
    }
    if (done) scanner.end(total)
    if (!d.pages) {
      // the complete rows so far, up to the page that stays in the file (its start, once the scan reached it)
      const limit = stop >= 0 && scanner.starts.length > stop ? scanner.starts[stop] : Infinity
      const to = Math.min(scanner.cut, limit)
      if (to > queue.start) parser!.push(decode(queue.take(to)))
      if (stop < 0 && parser!.cells > budget) stop = Math.ceil(parser!.r / page)
      if (stop >= 0 && queue.start >= limit && !(done && scanner.starts.length <= stop + 1)) {
        // from here on the rows stay in the file: the pages read so far are the first ones in memory
        queue.clear()
        d.pages = new RowPages(d, page, budget, scanner.starts, readPage)
        d.pages.adopt(stop)
      }
    }
    if (d.pages) {
      if (scanner.lastContent > d.maxRow) d.maxRow = scanner.lastContent
      if (scanner.maxFields - 1 > d.maxCol) d.maxCol = scanner.maxFields - 1
    }
    if (done) break
    report.bytes?.(loaded, total)
    if (header || parser!.r >= HEADER_ROWS) {
      if (!header) {
        d.colInfo = parser!.header()
        header = true
      }
      await report.chunk()
    }
  }
  parser!.end()
  if (!header) d.colInfo = parser!.header()
  d.pages?.finish()
  // no XML to patch: saving writes every row (and the column widths) from the model
  d.structural = true
  d.dirtyCols = true
}

function concat(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0]
  let n = 0
  for (const p of parts) n += p.length
  const out = new Uint8Array(n)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** bytes held from offset `start` on, handed out up to an offset */
class ByteQueue {
  private parts: Uint8Array[] = []
  constructor(public start: number) {}

  push(b: Uint8Array): void {
    if (b.length) this.parts.push(b)
  }

  /** the bytes before offset `to` (the rest stays) */
  take(to: number): Uint8Array {
    const n = to - this.start
    this.start = to
    const first = this.parts[0]
    if (this.parts.length === 1 && n <= first.length) {
      const rest = first.subarray(n)
      this.parts = rest.length ? [rest] : []
      return first.subarray(0, n)
    }
    const out = new Uint8Array(n)
    let o = 0
    while (o < n) {
      const p = this.parts[0]
      const k = Math.min(p.length, n - o)
      out.set(p.subarray(0, k), o)
      o += k
      if (k === p.length) this.parts.shift()
      else this.parts[0] = p.subarray(k)
    }
    return out
  }

  clear(): void {
    this.parts = []
  }
}

/**
 * Finds the row ends in the bytes (the same rules as `Parser`: a quote opens a quoted field only when the field is
 * still empty, `""` in it is a quote, CR, LF and CR LF end a row) and where each page of rows starts.
 */
class RowScanner {
  /** rows ended so far: the index of the row in progress */
  rows = 0
  /** the last row with something in it */
  lastContent = -1
  maxFields = 0
  /** byte offset of each page's first row; one more, the end, once the scan is done */
  readonly starts: number[] = []
  /** the start of the row after the last complete one: parsing can go this far */
  cut: number
  private quoted = false
  /** in a quoted field, a quote was the last unit: an escaped quote if the next one is a quote, else the closing one */
  private pendingQuote = false
  private skipLF = false
  private fieldEmpty = true
  private rowContent = false
  private fields = 1
  private inRow = false
  private startedPage = false
  /** the first byte of a 2-byte unit split between chunks */
  private half = -1

  constructor(
    private readonly sep: number,
    private readonly unit: 1 | 2,
    private readonly le: boolean,
    private readonly page: number,
    first: number,
  ) {
    this.cut = first
  }

  /** `base`: the offset of `b[0]` in the source */
  scan(b: Uint8Array, base: number): void {
    const n = b.length
    const unit = this.unit
    let i = 0
    if (unit === 1) {
      for (; i < n; i++) this.step(b[i], base + i)
      return
    }
    if (this.half >= 0 && n) {
      this.step(this.le ? this.half | (b[0] << 8) : (this.half << 8) | b[0], base - 1)
      this.half = -1
      i = 1
    }
    for (; i + 1 < n; i += 2) this.step(this.le ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1], base + i)
    if (i < n) this.half = b[i]
  }

  private step(code: number, at: number): void {
    if (this.skipLF) {
      this.skipLF = false
      if (code === 10) return
    }
    if (!this.inRow) {
      this.inRow = true
      if (this.rows % this.page === 0) {
        this.starts.push(at)
        this.startedPage = true
      }
    }
    if (this.quoted) {
      if (this.pendingQuote) {
        this.pendingQuote = false
        if (code === 34) {
          this.content()
          return
        }
        // the quote closed the field; this unit is plain
        this.quoted = false
      } else {
        if (code === 34) this.pendingQuote = true
        else this.content()
        return
      }
    }
    if (code === 34 && this.fieldEmpty) {
      this.quoted = true
      return
    }
    if (code === this.sep) {
      this.fields++
      this.fieldEmpty = true
      return
    }
    if (code === 10 || code === 13) {
      this.endRow(at + this.unit)
      if (code === 13) this.skipLF = true
      return
    }
    this.content()
  }

  private content(): void {
    this.fieldEmpty = false
    this.rowContent = true
  }

  private endRow(next: number): void {
    if (this.rowContent) this.lastContent = this.rows
    this.rows++
    if (this.fields > this.maxFields) this.maxFields = this.fields
    this.fields = 1
    this.fieldEmpty = true
    this.rowContent = false
    this.quoted = false
    this.pendingQuote = false
    this.inRow = false
    this.startedPage = false
    this.cut = next
  }

  /** the end of the bytes (`at`): a last line without a line break is a row too, when there is something on it */
  end(at: number): void {
    if (this.pendingQuote) {
      this.pendingQuote = false
      this.quoted = false
    }
    if (this.inRow && (this.fields > 1 || !this.fieldEmpty)) this.endRow(at)
    else if (this.startedPage) this.starts.pop()
    this.inRow = false
    this.cut = at
    this.starts.push(at)
  }
}

/** RFC 4180 state machine fed the text in pieces (a quote or CR ending a piece waits for the next one) */
class Parser {
  private readonly sepCode: number
  private readonly decimalComma: boolean
  private field = ''
  private quoted = false
  /** a quote ended the piece: an escaped quote if the next piece starts with one, else the closing quote */
  private pendingQuote = false
  /** a CR ended the piece: a LF starting the next one belongs to it */
  private skipLF = false
  private row: unknown[] = []
  private c = 0
  /** lines seen (the next row's index) */
  r = 0
  /** cells stored */
  cells = 0
  /** longest text per column, until the header is reported */
  private widths: number[] | null

  constructor(
    private sink: RowSink,
    sep: string,
    private pool: Map<string, string>,
    widths: boolean,
  ) {
    this.sepCode = sep.charCodeAt(0)
    this.decimalComma = sep === ';'
    this.widths = widths ? [] : null
  }

  push(s: string): void {
    const n = s.length
    if (!n) return
    let i = 0
    if (this.skipLF) {
      this.skipLF = false
      if (s.charCodeAt(0) === 10) i = 1
    }
    if (this.pendingQuote) {
      this.pendingQuote = false
      if (i < n && s.charCodeAt(i) === 34) {
        this.field += '"'
        i++
      } else this.quoted = false
    }
    const sep = this.sepCode
    while (i < n) {
      if (this.quoted) {
        const q = s.indexOf('"', i)
        if (q < 0) {
          this.field += s.slice(i)
          return
        }
        if (q > i) this.field += s.slice(i, q)
        if (q + 1 >= n) {
          this.pendingQuote = true
          return
        }
        if (s.charCodeAt(q + 1) === 34) {
          this.field += '"'
          i = q + 2
        } else {
          this.quoted = false
          i = q + 1
        }
        continue
      }
      let ch = s.charCodeAt(i)
      // a quote opens a quoted field only at the field's start (parseCsv does the same)
      if (ch === 34 && this.field === '') {
        this.quoted = true
        i++
        continue
      }
      let j = i
      while (j < n) {
        ch = s.charCodeAt(j)
        if (ch === sep || ch === 10 || ch === 13) break
        j++
      }
      if (j > i) this.field += s.slice(i, j)
      if (j >= n) return
      i = j + 1
      if (ch === sep) this.pushField()
      else {
        this.endRow()
        if (ch === 13) {
          if (i < n) {
            if (s.charCodeAt(i) === 10) i++
          } else this.skipLF = true
        }
      }
    }
  }

  private pushField(): void {
    const v = this.field
    this.field = ''
    const c = this.c++
    if (v === '' || c >= MAX_COL) return
    const k = fieldValue(v, this.decimalComma)
    if (k === null) {
      let text = v
      if (v.length <= INTERN_MAX) {
        const shared = this.pool.get(v)
        if (shared !== undefined) text = shared
        else if (this.pool.size < POOL_MAX) this.pool.set(v, v)
      }
      this.row.push(c, T_STR, text, 0)
    } else if (typeof k === 'boolean') this.row.push(c, T_BOOL, k ? 1 : 0, 0)
    else this.row.push(c, T_NUM, k, 0)
    this.cells++
    if (c > this.sink.maxCol) this.sink.maxCol = c
    const w = this.widths
    if (w && v.length > (w[c] ?? 0)) {
      // a multi-line text is as wide as its longest line
      const len = v.includes('\n') ? Math.max(...v.split('\n').map((l) => l.length)) : v.length
      if (len > (w[c] ?? 0)) w[c] = len
    }
  }

  private endRow(): void {
    this.pushField()
    if (this.row.length) {
      this.sink.rows[this.r] = this.row
      this.sink.maxRow = this.r
      this.row = []
    }
    this.c = 0
    this.r++
  }

  /** the end of the text: a last line without a line break is a row too */
  end(): void {
    if (this.pendingQuote) {
      this.pendingQuote = false
      this.quoted = false
    }
    if (this.field !== '' || this.c > 0) this.endRow()
  }

  /** the column widths from the rows so far; later rows leave them alone */
  header(): ColInfo[] {
    const w = this.widths
    this.widths = null
    const info: ColInfo[] = []
    w?.forEach((len, c) => {
      if (len > 9) info.push({ min: c, max: c, w: Math.round(Math.min(60, len + 2) * 7) })
    })
    return info
  }
}

/**
 * The rows of a sheet too large for memory, by pages: the pages in memory are in `d.rows` like any row, the others
 * are read from the file when `ensure`d, the least recently used ones leaving when the cells in memory pass the budget.
 * Pages with edits are pinned: they never leave (the file does not have their rows).
 */
export class RowPages {
  /** cells in memory, over the pages here */
  cells = 0
  /** all the rows are counted and every page can be read */
  complete = false
  /** page → its cells, in order of use (the first is the least recently used) */
  private resident = new Map<number, number>()
  private pinned = new Set<number>()
  private loading = new Map<number, Promise<void>>()
  private readPages = 0
  private readCells = 0

  constructor(
    private d: SheetData,
    /** rows per page */
    readonly size: number,
    /** cells to hold at most (pinned pages may exceed it) */
    readonly budget: number,
    /** byte offset of each page's first row; one more, the end, once the file is scanned */
    readonly starts: number[],
    private read: (p: number) => Promise<(unknown[] | undefined)[]>,
  ) {}

  pageOf(r: number): number {
    return Math.floor(r / this.size)
  }

  /** the pages in memory */
  get count(): number {
    return this.resident.size
  }

  /** rows that can be read now: every row once the scan is done, else those of the pages the scan passed */
  get scanned(): number {
    return this.complete ? this.d.maxRow + 1 : Math.max(0, (this.starts.length - 1) * this.size)
  }

  finish(): void {
    this.complete = true
  }

  /** row `r` is in memory (rows past the file's are: they are only ever edits) */
  has(r: number): boolean {
    return r > this.d.maxRow || this.resident.has(this.pageOf(r))
  }

  /** the row's page never leaves memory (an edit went in) */
  pin(r: number): void {
    if (r <= this.d.maxRow) this.pinned.add(this.pageOf(r))
  }

  /** the first `n` pages, read while the file streamed in, are in memory */
  adopt(n: number): void {
    for (let p = 0; p < n; p++) {
      const cells = this.countCells(p)
      this.resident.set(p, cells)
      this.cells += cells
      this.readPages++
      this.readCells += cells
    }
  }

  private countCells(p: number): number {
    let cells = 0
    const end = (p + 1) * this.size
    for (let r = p * this.size; r < end; r++) {
      const row = this.d.rows[r]
      if (row) cells += row.length >> 2
    }
    return cells
  }

  /** what a page costs, from those read so far (else the sheet's width) */
  private perPage(): number {
    return this.readPages ? Math.max(1, this.readCells / this.readPages) : (this.d.maxCol + 1) * this.size
  }

  /**
   * Rows [r0, r1] in memory (r1 clipped to what can be read), the least recently used other pages leaving once the
   * cells pass the budget. Throws when the rows cannot all be held.
   */
  async ensure(r0: number, r1: number): Promise<void> {
    const last = Math.min(r1, this.scanned - 1)
    if (last < r0) return
    const p0 = this.pageOf(Math.max(0, r0))
    const p1 = this.pageOf(last)
    const need: number[] = []
    let keep = 0
    for (let p = p0; p <= p1; p++) {
      const c = this.resident.get(p)
      if (c === undefined) need.push(p)
      else keep += c
    }
    if (need.length) {
      let pinnedOutside = 0
      for (const p of this.pinned) if (p < p0 || p > p1) pinnedOutside += this.resident.get(p) ?? 0
      const per = this.perPage()
      if (keep + pinnedOutside + need.length * per > this.budget) {
        const fit = Math.max(this.size, Math.floor(((this.budget - pinnedOutside) / per) * this.size))
        throw new Error(`More rows at once than a sheet of ${(this.d.maxRow + 1).toLocaleString()} rows can hold in memory (about ${fit.toLocaleString()} rows)`)
      }
      for (let i = 0; i < need.length; i += 4) await Promise.all(need.slice(i, i + 4).map((p) => this.load(p)))
    }
    for (let p = p0; p <= p1; p++) this.touch(p)
    this.evict(p0, p1)
  }

  private load(p: number): Promise<void> {
    let job = this.loading.get(p)
    if (!job) {
      job = this.read(p)
        .then((rows) => this.install(p, rows))
        .finally(() => this.loading.delete(p))
      this.loading.set(p, job)
    }
    return job
  }

  private install(p: number, rows: (unknown[] | undefined)[]): void {
    if (this.resident.has(p)) return
    let cells = 0
    const base = p * this.size
    for (let k = 0; k < rows.length; k++) {
      const row = rows[k]
      if (!row) continue
      this.d.rows[base + k] = row
      cells += row.length >> 2
    }
    this.resident.set(p, cells)
    this.cells += cells
    this.readPages++
    this.readCells += cells
  }

  private touch(p: number): void {
    const c = this.resident.get(p)
    if (c === undefined) return
    this.resident.delete(p)
    this.resident.set(p, c)
  }

  /** the least recently used pages outside [keep0, keep1] leave until the cells are within the budget */
  private evict(keep0: number, keep1: number): void {
    if (this.cells <= this.budget) return
    for (const [p, c] of this.resident) {
      if (this.pinned.has(p) || (p >= keep0 && p <= keep1)) continue
      const end = (p + 1) * this.size
      for (let r = p * this.size; r < end; r++) if (this.d.rows[r] !== undefined) delete this.d.rows[r]
      this.resident.delete(p)
      this.cells -= c
      if (this.cells <= this.budget) return
    }
  }

  /** the rows of page `p` for a look (a search, the save) without keeping them: those in memory, else read */
  async peek(p: number): Promise<(unknown[] | undefined)[]> {
    if (this.resident.has(p) || p * this.size > this.d.maxRow) {
      const base = p * this.size
      const out: (unknown[] | undefined)[] = []
      for (let k = 0; k < this.size; k++) out.push(this.d.rows[base + k])
      return out
    }
    return this.read(p)
  }
}
