import { OpcPackage, relOfType, type Rels } from '../opc'
import { readXlsxComments, XlsxComments } from './comments'
import type { LoadReport, RowPages, SheetLoader } from './import'
import { toCsv } from '../convert'
import { parseTheme, type Theme } from '../theme'
import { Calc } from './calc'
import { kid, kids, num, parseXmlStream, type Attrs, type SaxHandler } from '../xml'
import { formatValue, formatText } from './numfmt'
import { parseSheetStyles, type SheetStyles } from './styles'
import { MAX_ROW_H_PX, defaultColWidthPx, defaultRowHeightPx, makeCellMetrics, ptToPx, type CellMetrics } from './colwidth'
import type { BlockOut, CellDetail, CellOut, ColInfo, FindMatch, FindOptions, Merge, XlsxPageSetup, RowOut, SheetInfo, SheetProgress, WorkbookMeta } from './types'

export const T_NUM = 0
export const T_SST = 1
export const T_STR = 2
export const T_BOOL = 3
export const T_ERR = 4
export const T_DATE = 5
export const T_EMPTY = 6

export const MAX_COL = 16384
/** rows a worksheet holds (Excel's limit): a sheet with more cannot be saved as a workbook */
export const MAX_ROWS = 1_048_576

const decodeX = (s: string) => (s.indexOf('_x') >= 0 ? s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))) : s)

export function colIndex(letters: string): number {
  let c = 0
  for (let i = 0; i < letters.length; i++) {
    const code = letters.charCodeAt(i)
    if (code < 65) break
    c = c * 26 + ((code & ~32) - 64)
  }
  return c - 1
}

export function colName(c: number): string {
  let s = ''
  c++
  while (c > 0) {
    const m = (c - 1) % 26
    s = String.fromCharCode(65 + m) + s
    c = Math.floor((c - 1) / 26)
  }
  return s
}


export function parseRef(ref: string): [number, number] {
  let i = 0
  while (i < ref.length && ref.charCodeAt(i) >= 65) i++
  return [Number(ref.slice(i)) - 1, colIndex(ref.slice(0, i))]
}

export function parseRange(ref: string): Merge | undefined {
  const [a, b] = ref.replace(/\$/g, '').split(':')
  if (!a) return undefined
  const [r0, c0] = parseRef(a)
  const [r1, c1] = b ? parseRef(b) : [r0, c0]
  return { r0, c0, r1, c1 }
}

export class SheetData {
  /** shared formula groups: si → master cell key + formula text */
  shared = new Map<number, { master: number; text: string }>()
  /** dependent cell key → shared formula si */
  depOf = new Map<number, number>()
  /** edited cell keys (r * MAX_COL + c) */
  edited = new Set<number>()
  /** row heights in pt / hidden flags (from the file or the editor) */
  rowAttrs = new Map<number, { ht?: number; hidden?: boolean }>()
  /** rows grown to fit a large font (no explicit height in the file): px */
  autoRowH = new Map<number, number>()
  /** whole-sheet rewrite needed (rows/cols inserted or deleted) */
  structural = false
  /** sections to regenerate on save */
  dirtyCols = false
  dirtyMerges = false
  dirtyView = false
  /** 页面设置（写进 sheet 的 pageSetup / pageMargins / printOptions / headerFooter / sheetProtection） */
  page?: XlsxPageSetup
  /** 页面设置变了：sheet XML 需要重写 */
  dirtyPage = false
  /** rows whose height/visibility changed */
  dirtyRows = new Set<number>()
  /** formulas rewritten because another sheet changed */
  formulaChanged = false
  /** formula cells stored without a cached value (to compute after load) */
  uncached: number[] = []
  rows: (unknown[] | undefined)[] = []
  /** a sheet too large for memory: its rows are read from the file by pages, those in memory being in `rows` */
  pages?: RowPages
  maxRow = -1
  maxCol = -1
  formulas = new Map<number, string>()
  merges: Merge[] = []
  colInfo: ColInfo[] = []
  defaultColW = 64
  defaultRowH = 20
  /** P5 单元格度量门面（列宽三段式 conv / 行高 rowH / 文本宽 textPx）；import loader 路径可为空 */
  metrics?: CellMetrics
  frozen = { rows: 0, cols: 0 }
  gridLines = true
  done = false
  error?: string
  loading?: Promise<void>
}

class SheetHandler implements SaxHandler {
  private row = -1
  private rowCells: unknown[] | null = null
  private col = -1
  private cType = ''
  private cStyle = 0
  private val = ''
  private formula = ''
  private hasVal = false
  private capture = 0 // 1 v, 2 f, 3 inline t
  private fShared = -1
  private inIs = false
  newSizes: [number, number][] = []
  headerReady = false
  private rowHasHt = false
  private rowMaxPt = 0

  /** metrics: P5 单元格度量门面（列宽/行高/文本宽的权威口径）；fontPt: 每 cell format 字号 */
  constructor(private d: SheetData, private metrics: CellMetrics, private fontPt: number[] = []) {
    this.d.metrics = metrics
    // 无 sheetFormatPr 时的基准：sdkjs :623-643 总是计算（base=8 → 64px、度量 th → 默认行高）
    this.d.defaultColW = defaultColWidthPx(metrics.conv, undefined, undefined)
    this.d.defaultRowH = defaultRowHeightPx(false, undefined, metrics.baseThPx)
  }

  open(name: string, a: Attrs): boolean | void {
    switch (name) {
      case 'c': {
        const r = a.r
        this.col = r ? parseRef(r)[1] : this.col + 1
        this.cType = a.t ?? ''
        this.cStyle = a.s ? Number(a.s) : 0
        this.val = ''
        this.formula = ''
        this.hasVal = false
        return
      }
      case 'v':
        this.capture = 1
        this.hasVal = true
        return
      case 'f':
        this.capture = 2
        this.fShared = a.t === 'shared' && a.si !== undefined ? Number(a.si) : -1
        return
      case 'is':
        this.inIs = true
        this.hasVal = true
        return
      case 't':
        if (this.inIs) this.capture = 3
        return
      case 'rPh':
        return true
      case 'row': {
        this.headerReady = true
        this.row = a.r ? Number(a.r) - 1 : this.row + 1
        this.col = -1
        this.rowCells = []
        const hidden = a.hidden === '1' || a.hidden === 'true'
        if (hidden || a.ht) this.d.rowAttrs.set(this.row, { ht: a.ht ? Number(a.ht) : undefined, hidden: hidden || undefined })
        this.rowHasHt = hidden || !!a.ht
        this.rowMaxPt = 0
        if (hidden) this.newSizes.push([this.row, 0])
        else if (a.ht) {
          // ht（pt）→ px：convertPtToPx trunc 口径（utils.js:182-186），非 Math.round 近似
          const px = ptToPx(Number(a.ht))
          if (px !== this.d.defaultRowH) this.newSizes.push([this.row, px])
        }
        return
      }
      case 'sheetFormatPr': {
        // 默认行高：customHeight="1" 时 defaultRowHeight（pt）主导，否则 = 默认字体度量 th
        // （WorksheetView.js:641-643 / getDefaultHeight Workbook.js:9262-9269）
        this.d.defaultRowH = defaultRowHeightPx(
          a.customHeight === '1' || a.customHeight === 'true',
          num(a.defaultRowHeight),
          this.metrics.baseThPx,
        )
        // 默认列宽：defaultColWidth（chars）存在 → 三段式覆盖；否则 base(||8) → ceil8（:623-631）
        this.d.defaultColW = defaultColWidthPx(this.metrics.conv, num(a.baseColWidth), num(a.defaultColWidth))
        return
      }
      case 'col': {
        const min = Number(a.min) - 1
        const max = Math.min(Number(a.max) - 1, MAX_COL - 1)
        const hidden = a.hidden === '1' || a.hidden === 'true'
        // width 属性 = ECMA chars 口径 → 三段式 chars→px（initColumn Workbook.js:7668 同式）
        const w = hidden ? 0 : a.width ? this.metrics.conv.toPx(Number(a.width)) : this.d.defaultColW
        this.d.colInfo.push({ min, max, w })
        return
      }
      case 'pane':
        if (a.state === 'frozen' || a.state === 'frozenSplit') {
          this.d.frozen = { rows: Math.round(num(a.ySplit, 0)!), cols: Math.round(num(a.xSplit, 0)!) }
        }
        return
      case 'sheetView':
        if (a.showGridLines === '0' || a.showGridLines === 'false') this.d.gridLines = false
        return
      case 'sheetData':
        this.headerReady = true
        return
      case 'mergeCell': {
        const m = a.ref ? parseRange(a.ref) : undefined
        if (m) this.d.merges.push(m)
        return
      }
      case 'extLst':
      case 'conditionalFormatting':
      case 'dataValidations':
      case 'headerFooter':
        return true
    }
  }

  close(name: string): void {
    switch (name) {
      case 'v':
      case 'f':
      case 't':
        this.capture = 0
        return
      case 'is':
        this.inIs = false
        return
      case 'c': {
        const cells = this.rowCells
        if (!cells) return
        const c = this.col
        if (c > this.d.maxCol) this.d.maxCol = c
        const key = this.row * MAX_COL + c
        if (this.formula) this.d.formulas.set(key, this.formula)
        if (this.fShared >= 0) {
          if (this.formula) this.d.shared.set(this.fShared, { master: key, text: this.formula })
          else this.d.depOf.set(key, this.fShared)
          this.fShared = -1
        }
        if (!this.hasVal || (this.formula && this.val === '' && this.cType !== 'str')) {
          if (this.formula) {
            this.d.uncached.push(this.row * MAX_COL + c)
            cells.push(c, T_EMPTY, '', this.cStyle)
          } else if (this.cStyle) cells.push(c, T_EMPTY, '', this.cStyle)
          return
        }
        let type = T_NUM
        let v: unknown
        switch (this.cType) {
          case 's':
            type = T_SST
            v = Number(this.val)
            break
          case 'str':
          case 'inlineStr':
            type = T_STR
            v = decodeX(this.val)
            break
          case 'b':
            type = T_BOOL
            v = this.val === '1' || this.val === 'true' ? 1 : 0
            break
          case 'e':
            type = T_ERR
            v = this.val
            break
          case 'd':
            type = T_DATE
            v = this.val
            break
          default: {
            const n = Number(this.val)
            if (this.val === '' || Number.isNaN(n)) {
              type = this.val === '' ? T_EMPTY : T_STR
              v = this.val
            } else v = n
          }
        }
        cells.push(c, type, v, this.cStyle)
        if (!this.rowHasHt) {
          const pt = this.fontPt[this.cStyle] ?? this.metrics.basePt
          if (pt > this.rowMaxPt) this.rowMaxPt = pt
        }
        return
      }
      case 'row': {
        // 行高自适应（_updateRowHeight WorksheetView.js:10483-10489）：无 customHeight 且
        // 非跨行合并 → newHeight = min(maxRowH, max(oldH, tm.height))。oldH = 默认行高
        // （无显式 ht 时）；tm.height = 行内最大字号的单行度量 th（v1：wrap 折行未接，
        // 显式 \n 段数在编辑侧 autoFitRows 处理）。启发式 rowMaxPt*(4/3)*1.3+3 作废。
        if (!this.rowHasHt) {
          const pt = this.rowMaxPt || this.metrics.basePt
          const tm = Math.min(MAX_ROW_H_PX, this.metrics.rowH(pt))
          const oldH = this.d.defaultRowH
          const nh = Math.min(MAX_ROW_H_PX, Math.max(oldH, tm))
          if (nh !== oldH) {
            this.newSizes.push([this.row, nh])
            this.d.autoRowH.set(this.row, nh)
          }
        }
        if (this.rowCells && this.rowCells.length) this.d.rows[this.row] = this.rowCells
        if (this.row > this.d.maxRow) this.d.maxRow = this.row
        this.rowCells = null
        return
      }
    }
  }

  text(t: string): void {
    if (this.capture === 1) this.val += t
    else if (this.capture === 2) this.formula += t
    else if (this.capture === 3) this.val += t
  }
}

class SstHandler implements SaxHandler {
  strings: string[] = []
  private cur = ''
  private capture = false
  open(name: string): boolean | void {
    if (name === 'si') this.cur = ''
    else if (name === 't') this.capture = true
    else if (name === 'rPh' || name === 'phoneticPr') return true
  }
  close(name: string): void {
    if (name === 't') this.capture = false
    else if (name === 'si') this.strings.push(decodeX(this.cur))
  }
  text(t: string): void {
    if (this.capture) this.cur += t
  }
}

export class XlsxWorkbook {
  sheetsData = new Map<number, SheetData>()
  /** the comments (read in `open`) */
  comments = new XlsxComments()
  readonly calc = new Calc(this)
  sst: string[] = []
  private sstLoading?: Promise<void>
  /** sheets filled from something else than their XML (a text file being imported), by sheet path: run when the sheet loads */
  readonly loaders = new Map<string, SheetLoader>()

  private constructor(
    readonly pkg: OpcPackage,
    readonly mainPath: string,
    readonly rels: Rels,
    readonly sheets: SheetInfo[],
    public styles: SheetStyles,
    readonly date1904: boolean,
    readonly theme: Theme,
  ) {}

  static async open(pkg: OpcPackage, mainPath: string): Promise<XlsxWorkbook> {
    const root = await pkg.xml(mainPath)
    const rels = await pkg.rels(mainPath)
    const sheets: SheetInfo[] = []
    for (const s of kids(kid(root, 'sheets'), 'sheet')) {
      const rel = rels.get(s.a['r:id'])
      if (!rel || !rel.type.endsWith('/worksheet')) continue
      sheets.push({ name: s.a.name ?? `Sheet${sheets.length + 1}`, index: sheets.length, path: rel.target, hidden: !!s.a.state && s.a.state !== 'visible' })
    }
    const themeRel = relOfType(rels, 'theme')
    const theme = parseTheme(themeRel ? await pkg.xml(themeRel.target) : undefined)
    const stylesRel = relOfType(rels, 'styles')
    const styles = parseSheetStyles(stylesRel ? await pkg.xml(stylesRel.target) : undefined, theme)
    const pr = kid(root, 'workbookPr')
    const date1904 = pr?.a.date1904 === '1' || pr?.a.date1904 === 'true'
    const wb = new XlsxWorkbook(pkg, mainPath, rels, sheets, styles, date1904, theme)
    wb.comments = await readXlsxComments(pkg, mainPath, rels, sheets).catch((e: Error) => {
      console.warn('[office] comments not read:', e.message)
      return new XlsxComments()
    })
    return wb
  }

  meta(): WorkbookMeta {
    return {
      sheets: this.sheets,
      styles: this.styles.xfs.map((x) => x.css),
      formats: this.styles.xfs.map((x) => x.numFmt),
      baseFont: this.styles.baseFont,
      date1904: this.date1904,
    }
  }

  private loadSst(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    if (!this.sstLoading) {
      this.sstLoading = (async () => {
        const rel = relOfType(this.rels, 'sharedStrings')
        if (!rel || !this.pkg.has(rel.target)) return
        const h = new SstHandler()
        this.sst = h.strings
        await parseXmlStream(await this.pkg.stream(rel.target, onProgress), h)
      })()
    }
    return this.sstLoading
  }

  /**
   * Streams a sheet into memory, reporting progress so the UI can grow while parsing.
   * Calling again for a loaded sheet replays its state; for a sheet still parsing (for another caller) the state is
   * reported once the parse is done — its header isn't known before, and the view keeps the first header it gets.
   */
  loadSheet(index: number, emit: (p: SheetProgress) => void, onBytes?: (phase: string, loaded: number, total: number) => void): Promise<void> {
    const existing = this.sheetsData.get(index)
    if (existing) {
      if (existing.loading && !existing.done) return existing.loading.then(() => emit(this.snapshot(index, existing, rowSizesOf(existing), true)))
      emit(this.snapshot(index, existing, rowSizesOf(existing), true))
      return existing.loading ?? Promise.resolve()
    }
    const d = new SheetData()
    this.sheetsData.set(index, d)
    d.loading = (async () => {
      const info = this.sheets[index]
      if (!info) throw new Error(`No sheet #${index}`)
      try {
        await this.loadSst((l, t) => onBytes?.('strings', l, t))
        let sentHeader = false
        let last = 0
        let stale = false
        // the view grows while the sheet parses: the header as soon as it is known, then every 150 ms
        const report = async (ready: boolean, sizes: () => [number, number][]) => {
          const now = Date.now()
          if (!sentHeader && ready) {
            sentHeader = true
            emit(this.snapshot(index, d, sizes(), true))
            last = now
            await new Promise((r) => setTimeout(r, 0))
          } else if (now - last > 150) {
            last = now
            emit(this.snapshot(index, d, sizes(), false))
            await new Promise((r) => setTimeout(r, 0))
          }
        }
        const loader = this.loaders.get(info.path)
        let sizes: [number, number][] = []
        // P5：默认字体 + 出现过的字号集一次性预热度量门面，解析全程同步消费
        const metrics = await makeCellMetrics(this.styles.baseFontName, this.styles.basePt, this.styles.xfs.map((x) => x.fontPt))
        if (loader) {
          // the rows come from somewhere else than the sheet's XML (a text file being imported)
          d.metrics = metrics
          d.defaultColW = defaultColWidthPx(metrics.conv, undefined, undefined)
          d.defaultRowH = defaultRowHeightPx(false, undefined, metrics.baseThPx)
          const rep: LoadReport = {
            chunk: () => report(true, () => []),
            reset: () => {
              stale = true
            },
            bytes: (l, t) => onBytes?.('sheet', l, t),
          }
          await loader(d, rep)
        } else {
          const h = new SheetHandler(d, metrics, this.styles.xfs.map((x) => x.fontPt))
          await parseXmlStream(await this.pkg.stream(info.path, (l, t) => onBytes?.('sheet', l, t)), h, {
            onChunk: () => report(h.headerReady, () => h.newSizes.splice(0)),
          })
          sizes = h.newSizes.splice(0)
        }
        d.done = true
        emit({ ...this.snapshot(index, d, sizes, !sentHeader), merges: d.merges, ...(stale ? { recalc: true } : {}) })
        if (d.uncached.length) {
          // files written by libraries often omit cached formula results: compute them (other sheets may be referenced)
          const keys = d.uncached.splice(0)
          void (async () => {
            await Promise.all(this.sheets.map((s) => (s.index === index ? null : this.loadSheet(s.index, () => {}))))
            this.calc.invalidate()
            this.calc.computeMissing(index, keys)
            emit({ ...this.snapshot(index, d, [], false), recalc: true })
          })()
        }
      } catch (e) {
        d.done = true
        d.error = (e as Error).message
        emit({ ...this.snapshot(index, d, [], true), error: d.error })
      }
    })()
    return d.loading
  }

  /** loads the sheets whose rows come from a loader (an imported text file) and are not in yet: saving writes them from the model */
  async loadPending(): Promise<void> {
    const pending = this.sheets.filter((s) => this.loaders.has(s.path) && !this.sheetsData.get(s.index)?.done)
    await Promise.all(pending.map((s) => this.loadSheet(s.index, () => {})))
  }

  private snapshot(sheet: number, d: SheetData, rowSizes: [number, number][], header: boolean): SheetProgress {
    const p: SheetProgress = { sheet, rows: d.maxRow + 1, cols: d.maxCol + 1, rowSizes, done: d.done }
    if (header) {
      p.colInfo = d.colInfo
      p.defaultColW = d.defaultColW
      p.defaultRowH = d.defaultRowH
      p.frozen = d.frozen
      p.gridLines = d.gridLines
    }
    if (d.done) p.merges = d.merges
    if (d.error) p.error = d.error
    return p
  }

  /** rows [r0, r1] of a sheet in memory (a sheet whose rows are read from its file by pages); throws when they cannot all be */
  async ensure(d: SheetData, r0: number, r1: number): Promise<void> {
    if (d.pages) await d.pages.ensure(Math.max(0, r0), r1)
  }

  /** Formatted cells for rows [r0, r1). */
  async block(sheet: number, r0: number, r1: number): Promise<BlockOut> {
    const d = this.sheetsData.get(sheet)
    const rows: RowOut[] = []
    if (!d) return { sheet, r0, r1, rows, complete: false }
    await this.ensure(d, r0, r1 - 1)
    const xfs = this.styles.xfs
    const end = Math.min(r1, Math.max(d.maxRow + 1, d.rows.length))
    for (let r = r0; r < end; r++) {
      const row = d.rows[r]
      if (!row) continue
      const cells: CellOut[] = []
      for (let k = 0; k < row.length; k += 4) {
        const c = row[k] as number
        const t = row[k + 1] as number
        const v = row[k + 2]
        const s = row[k + 3] as number
        const xf = xfs[s] ?? xfs[0]
        switch (t) {
          case T_NUM: {
            const f = formatValue(v as number, xf.numFmt, this.date1904)
            cells.push(f.color ? [c, f.text, s, 1, f.color] : [c, f.text, s, 1])
            break
          }
          case T_SST:
            cells.push([c, formatText(this.sst[v as number] ?? '', xf.numFmt), s, 0])
            break
          case T_STR:
            cells.push([c, formatText(v as string, xf.numFmt), s, 0])
            break
          case T_BOOL:
            cells.push([c, v ? 'TRUE' : 'FALSE', s, 2])
            break
          case T_ERR:
            cells.push([c, v as string, s, 2])
            break
          case T_DATE:
            cells.push([c, (v as string).replace('T00:00:00', '').replace('T', ' ').replace(/Z$/, ''), s, 1])
            break
          default:
            cells.push([c, '', s, 0])
        }
      }
      rows.push({ r, cells })
    }
    // rows of a page the scan has not passed yet are not known
    const known = d.pages && !d.pages.complete ? Math.min(d.maxRow, d.pages.scanned - 1) : d.maxRow
    return { sheet, r0, r1, rows, complete: d.done || r1 <= known }
  }

  /**
   * The sheet as delimited text (the values as shown), a line per row of the used range less the rows and columns
   * with nothing shown at its end. A Blob: it can be larger than a string should be.
   */
  async text(sheet: number, sep: string): Promise<Blob> {
    const d = this.sheetsData.get(sheet)
    if (!d?.done) throw new Error('Sheet is still loading')
    let lastR = d.maxRow
    let lastC = d.maxCol
    if (!d.pages) {
      lastR = lastC = -1
      const last = Math.max(d.maxRow, d.rows.length - 1)
      for (let r = 0; r <= last; r++) {
        const row = d.rows[r]
        if (!row) continue
        for (let k = 0; k < row.length; k += 4) {
          const t = row[k + 1]
          if ((t === T_EMPTY || (t === T_STR && row[k + 2] === '')) && !d.formulas.has(r * MAX_COL + (row[k] as number))) continue
          lastR = r
          if ((row[k] as number) > lastC) lastC = row[k] as number
        }
      }
    }
    // the text goes into Blobs every few MB: a Blob lives outside the heap (and on disk, when large), a string does not
    const blobs: Blob[] = []
    let parts: string[] = [sep === ',' ? '\uFEFF' : '']
    let held = 0
    const step = d.pages?.size ?? 4096
    const blank = () => new Array<string>(lastC + 1).fill('')
    for (let r0 = 0; r0 <= lastR; r0 += step) {
      const r1 = Math.min(r0 + step, lastR + 1)
      const b = await this.block(sheet, r0, r1)
      const lines: string[][] = []
      let next = r0
      for (const row of b.rows) {
        for (; next < row.r; next++) lines.push(blank())
        const line = blank()
        for (const c of row.cells) if (c[0] <= lastC) line[c[0]] = c[1]
        lines.push(line)
        next++
      }
      for (; next < r1; next++) lines.push(blank())
      const piece = toCsv(lines, sep)
      parts.push(piece)
      held += piece.length
      if (held > 1 << 23) {
        blobs.push(new Blob(parts))
        parts = []
        held = 0
      }
    }
    if (parts.length) blobs.push(new Blob(parts))
    return new Blob(blobs, { type: sep === '\t' ? 'text/tab-separated-values' : 'text/csv' })
  }

  /** cells whose shown value (or formula) contains `query`, in row order */
  async find(sheet: number, query: string, opts: FindOptions = {}, limit = 20_000): Promise<FindMatch[]> {
    const d = this.sheetsData.get(sheet)
    const out: FindMatch[] = []
    if (!d || !query) return out
    const norm = (t: string) => (opts.matchCase ? t : t.toLowerCase())
    const q = norm(query)
    const xfs = this.styles.xfs
    const scan = (r: number, row: unknown[]) => {
      for (let k = 0; k < row.length && out.length < limit; k += 4) {
        const c = row[k] as number
        const t = row[k + 1] as number
        const v = row[k + 2]
        const f = opts.formulas ? d.formulas.get(r * MAX_COL + c) : undefined
        let text: string
        if (f) text = '=' + f
        else if (t === T_NUM) text = formatValue(v as number, (xfs[row[k + 3] as number] ?? xfs[0])?.numFmt, this.date1904).text
        else if (t === T_SST) text = this.sst[v as number] ?? ''
        else if (t === T_BOOL) text = v ? 'TRUE' : 'FALSE'
        else if (t === T_EMPTY) text = ''
        else text = String(v)
        if (!text) continue
        const h = norm(text)
        if (opts.whole ? h === q : h.includes(q)) out.push({ r, c, text })
      }
    }
    const last = Math.max(d.maxRow, d.rows.length - 1)
    if (!d.pages) {
      for (let r = 0; r <= last && out.length < limit; r++) {
        const row = d.rows[r]
        if (row) scan(r, row)
      }
    } else {
      // page by page, each read for the look only
      const size = d.pages.size
      for (let p = 0; p * size <= last && out.length < limit; p++) {
        const rows = await d.pages.peek(p)
        for (let k = 0; k < rows.length && out.length < limit; k++) {
          const row = rows[k]
          if (row) scan(p * size + k, row)
        }
      }
    }
    return out
  }

  async cell(sheet: number, r: number, c: number): Promise<CellDetail | undefined> {
    const d = this.sheetsData.get(sheet)
    if (d) await this.ensure(d, r, r)
    const row = d?.rows[r]
    const formula = d?.formulas.get(r * MAX_COL + c)
    if (!row) return formula ? { value: '', formula: '=' + formula, type: 'formula' } : undefined
    for (let k = 0; k < row.length; k += 4) {
      if (row[k] !== c) continue
      const t = row[k + 1] as number
      const v = row[k + 2]
      const value = t === T_SST ? this.sst[v as number] ?? '' : t === T_BOOL ? (v ? 'TRUE' : 'FALSE') : String(v)
      const type = ['number', 'string', 'string', 'boolean', 'error', 'date', 'empty'][t]
      return { value, formula: formula ? '=' + formula : undefined, type }
    }
    return formula ? { value: '', formula: '=' + formula, type: 'formula' } : undefined
  }

  unload(sheet: number) {
    const d = this.sheetsData.get(sheet)
    if (d?.done) this.sheetsData.delete(sheet)
  }
}

/** pixel heights of every non-default row: explicit heights / hidden rows win over font-grown ones */
export function rowSizesOf(d: SheetData): [number, number][] {
  const out: [number, number][] = []
  for (const [r, px] of d.autoRowH) if (!d.rowAttrs.has(r)) out.push([r, px])
  // ht（pt）→ px 走 convertPtToPx trunc 口径（colwidth.ptToPx 单一实现，非 Math.round 近似）
  for (const [r, a] of d.rowAttrs) out.push([r, a.hidden ? 0 : a.ht !== undefined ? ptToPx(a.ht) : (d.autoRowH.get(r) ?? d.defaultRowH)])
  return out
}
