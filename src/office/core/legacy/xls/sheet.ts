/**
 * A worksheet substream (BOF … EOF) read into a sheet model: cells with their values, formulas and formats, rows,
 * columns, merged cells, the sheet view (frozen panes, gridlines, zoom), page setup, hyperlinks and comments.
 */
import { colName } from '../../xlsx/workbook'
import { ERRORS, Parts, R, rkValue, str8At } from './biff'
import type { FormulaEnv } from './formula'
import type { Palette, XlsxStyles } from './styles'

/** columns of an XLSX sheet */
export const MAX_COL = 16384

/** cell kinds */
export const NUM = 0
export const SST = 1
export const STR = 2
export const BOOL = 3
export const ERR = 4
export const BLANK = 5
export const FORMULA = 6
export const RICH = 7

/** a formula cell: its tokens and the value Excel computed */
export interface FormulaCell {
  rgce: Uint8Array
  extra?: Uint8Array
  /** 0 number, 1 string, 2 boolean, 3 error, 4 empty string */
  kind: number
  value: number | string
}

export interface SharedFormula {
  r1: number
  r2: number
  c1: number
  c2: number
  rgce: Uint8Array
  extra?: Uint8Array
}

export interface RowInfo {
  ht?: number
  custom: boolean
  hidden: boolean
  level: number
  collapsed: boolean
  xf?: number
}

export interface ColInfo {
  first: number
  last: number
  width: number
  xf: number
  hidden: boolean
  level: number
  collapsed: boolean
}

export interface Link {
  ref: string
  target?: string
  location?: string
  display?: string
  tooltip?: string
}

export interface Note {
  r: number
  c: number
  author: string
  text: string
  show: boolean
}

/** what the workbook gives every sheet */
export interface SheetEnv {
  biff: 5 | 8
  styles: XlsxStyles
  palette: Palette
  formulas: FormulaEnv
  /** the index of a string in the shared strings (added when new) */
  string(text: string, runs?: number[]): number
  /** the number of strings in the BIFF SST */
  sstCount: number
  text8(b: Uint8Array): string
}

/** a worksheet as read */
export interface SheetModel {
  /** cells in the order read: row, column, XF, kind, value */
  cr: number[]
  cc: number[]
  cx: number[]
  ck: number[]
  cv: unknown[]
  /** the cells are in row, then column order */
  sorted: boolean
  rows: Map<number, RowInfo>
  cols: ColInfo[]
  /** merged ranges: first row, last row, first column, last column */
  merges: number[]
  /** SHRFMLA / ARRAY records by their first cell (and the cell before them) */
  shared: Map<number, SharedFormula>
  arrays: Map<number, SharedFormula>
  links: Link[]
  notes: Note[]
  defColWidth?: number
  stdWidth?: number
  defRowHeight?: number
  defRowFlags: number
  window2?: number
  topRow: number
  leftCol: number
  /** PANE: columns, rows (or twips when split), top row, left column */
  pane?: number[]
  zoom?: number
  tabColor?: string
  wsBool: number
  margins: Record<string, number>
  setup?: Uint8Array
  header: string
  footer: string
  printGrid: boolean
  printHeadings: boolean
  hCenter: boolean
  vCenter: boolean
  protect: boolean
  password: number
  rowBreaks: number[]
  colBreaks: number[]
  /** AutoFilter buttons are shown (the range is the sheet's _FilterDatabase name) */
  autoFilter: boolean
}

const names: string[] = []
/** column letters, cached */
export const col = (c: number) => names[c] ?? (names[c] = colName(c))

const u16 = (b: Uint8Array, o: number) => (o + 1 < b.length ? b[o] | (b[o + 1] << 8) : 0)
const u32 = (b: Uint8Array, o: number) => (u16(b, o) + u16(b, o + 2) * 0x10000) >>> 0

/** a bounds-checked reader of a record (hyperlinks) */
class ByteReader {
  pos = 0
  constructor(private b: Uint8Array) {}
  need(n: number) {
    if (n < 0 || this.pos + n > this.b.length) throw new Error('Record ends early')
  }
  u16() {
    this.need(2)
    this.pos += 2
    return u16(this.b, this.pos - 2)
  }
  u32() {
    this.need(4)
    this.pos += 4
    return u32(this.b, this.pos - 4)
  }
  skip(n: number) {
    this.need(n)
    this.pos += n
  }
  bytes(n: number) {
    this.need(n)
    this.pos += n
    return this.b.subarray(this.pos - n, this.pos)
  }
  /** UTF-16 text of `n` characters, cut at the first NUL */
  utf16(n: number) {
    const b = this.bytes(n * 2)
    let s = ''
    for (let i = 0; i + 1 < b.length; i += 2) {
      const ch = b[i] | (b[i + 1] << 8)
      if (!ch) break
      s += String.fromCharCode(ch)
    }
    return s
  }
}

const URL_MONIKER = 'e0c9ea79f9bace118c8200aa004ba90b'
const FILE_MONIKER = '0303000000000000c000000000000046'
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

/** an HLINK record ([MS-OSHARED] hyperlink object) */
function readLink(b: Uint8Array, text8: (b: Uint8Array) => string): Link | undefined {
  const rd = new ByteReader(b)
  const r1 = rd.u16()
  const r2 = rd.u16()
  const c1 = rd.u16()
  const c2 = rd.u16()
  rd.skip(16 + 4)
  const flags = rd.u32()
  const hstr = () => {
    const n = rd.u32()
    return rd.utf16(Math.min(n, 0x10000))
  }
  const link: Link = { ref: r1 === r2 && c1 === c2 ? `${col(c1)}${r1 + 1}` : `${col(c1)}${r1 + 1}:${col(c2)}${r2 + 1}` }
  if (flags & 0x10) link.display = hstr()
  if (flags & 0x80) hstr()
  if (flags & 1) {
    if (flags & 0x100) link.target = hstr()
    else {
      const clsid = hex(rd.bytes(16))
      if (clsid === URL_MONIKER) {
        const n = rd.u32()
        const start = rd.pos
        link.target = rd.utf16(Math.floor(Math.min(n, b.length - start) / 2))
        rd.pos = Math.min(b.length, start + n)
      } else if (clsid === FILE_MONIKER) {
        const up = rd.u16()
        const ansi = text8(rd.bytes(rd.u32())).replace(/\0.*$/s, '')
        rd.skip(2 + 2 + 16 + 4)
        const size = rd.u32()
        let path = ansi
        if (size) {
          const n = rd.u32()
          rd.skip(2)
          path = rd.utf16(Math.floor(n / 2))
        }
        link.target = '..\\'.repeat(Math.min(up, 64)) + path
      } else return undefined
    }
  }
  if (flags & 0x08) link.location = hstr()
  if (!link.target && !link.location) return undefined
  return link
}

/** Reads a worksheet substream from `start` (its BOF). */
export function readSheet(env: SheetEnv, data: Uint8Array, start: number): SheetModel {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const end = data.length
  const b8 = env.biff === 8

  const m: SheetModel = {
    cr: [],
    cc: [],
    cx: [],
    ck: [],
    cv: [],
    sorted: true,
    rows: new Map(),
    cols: [],
    merges: [],
    shared: new Map(),
    arrays: new Map(),
    links: [],
    notes: [],
    defRowFlags: 0,
    topRow: 0,
    leftCol: 0,
    wsBool: 0,
    margins: {},
    header: '',
    footer: '',
    printGrid: false,
    printHeadings: false,
    hCenter: false,
    vCenter: false,
    protect: false,
    password: 0,
    rowBreaks: [],
    colBreaks: [],
    autoFilter: false,
  }
  const { cr, cc, cx, ck, cv, rows, cols, merges, shared, arrays, links, notes } = m
  let lastKey = -1
  const add = (r: number, c: number, xf: number, kind: number, v: unknown) => {
    if (c >= MAX_COL) return
    const key = r * MAX_COL + c
    if (key < lastKey) m.sorted = false
    lastKey = key
    cr.push(r)
    cc.push(c)
    cx.push(xf)
    ck.push(kind)
    cv.push(v)
  }
  const texts = new Map<number, string>()
  let lastObj = -1
  let pendingString: FormulaCell | undefined
  let lastFormulaKey = -1

  let pos = start
  /** the CONTINUE records at the read position, which moves past them */
  const continues = (): Uint8Array[] => {
    const out: Uint8Array[] = []
    while (pos + 4 <= end && dv.getUint16(pos, true) === R.CONTINUE) {
      const len = dv.getUint16(pos + 2, true)
      out.push(data.subarray(pos + 4, Math.min(end, pos + 4 + len)))
      pos += 4 + len
    }
    return out
  }
  /** a record's data with its CONTINUE records */
  const joined = (first: Uint8Array): Uint8Array => {
    const more = continues()
    if (!more.length) return first
    const out = new Uint8Array(first.length + more.reduce((s, p) => s + p.length, 0))
    out.set(first)
    let o = first.length
    for (const p of more) {
      out.set(p, o)
      o += p.length
    }
    return out
  }

  let depth = 0
  while (pos + 4 <= end) {
    const type = dv.getUint16(pos, true)
    const len = dv.getUint16(pos + 2, true)
    const o = pos + 4
    pos = o + len
    if (pos > end) pos = end
    const n = pos - o
    if (type === R.BOF) {
      depth++
      continue
    }
    if (type === R.EOF) {
      if (--depth <= 0) break
      continue
    }
    // embedded charts
    if (depth > 1) continue
    switch (type) {
      case R.LABELSST:
        if (n >= 10) add(dv.getUint16(o, true), dv.getUint16(o + 2, true), dv.getUint16(o + 4, true), SST, dv.getUint32(o + 6, true))
        break
      case R.NUMBER:
        if (n >= 14) add(dv.getUint16(o, true), dv.getUint16(o + 2, true), dv.getUint16(o + 4, true), NUM, dv.getFloat64(o + 6, true))
        break
      case R.RK:
        if (n >= 10) add(dv.getUint16(o, true), dv.getUint16(o + 2, true), dv.getUint16(o + 4, true), NUM, rkValue(dv.getUint32(o + 6, true)))
        break
      case R.MULRK: {
        const r = dv.getUint16(o, true)
        const c0 = dv.getUint16(o + 2, true)
        const count = Math.floor((n - 6) / 6)
        for (let k = 0; k < count; k++) add(r, c0 + k, dv.getUint16(o + 4 + k * 6, true), NUM, rkValue(dv.getUint32(o + 6 + k * 6, true)))
        break
      }
      case R.BLANK:
        if (n >= 6) add(dv.getUint16(o, true), dv.getUint16(o + 2, true), dv.getUint16(o + 4, true), BLANK, 0)
        break
      case R.MULBLANK: {
        const r = dv.getUint16(o, true)
        const c0 = dv.getUint16(o + 2, true)
        const count = Math.floor((n - 6) / 2)
        for (let k = 0; k < count; k++) add(r, c0 + k, dv.getUint16(o + 4 + k * 2, true), BLANK, 0)
        break
      }
      case R.BOOLERR:
        if (n >= 8) {
          const v = data[o + 6]
          if (data[o + 7]) add(dv.getUint16(o, true), dv.getUint16(o + 2, true), dv.getUint16(o + 4, true), ERR, ERRORS[v] ?? '#N/A')
          else add(dv.getUint16(o, true), dv.getUint16(o + 2, true), dv.getUint16(o + 4, true), BOOL, v ? 1 : 0)
        }
        break
      case R.LABEL:
      case R.RSTRING: {
        if (n < 8) break
        const rec = data.subarray(o, pos)
        const more = b8 ? continues() : []
        const cch = u16(rec, 6)
        let text: string
        let runs: number[] | undefined
        if (b8) {
          const p = new Parts([rec.subarray(8), ...more])
          const flags = p.u8()
          const nRich = flags & 8 ? p.u16() : 0
          const ext = flags & 4 ? p.u32() : 0
          text = p.chars(cch, (flags & 1) === 1)
          if (nRich) {
            runs = []
            for (let i = 0; i < nRich && !p.eof; i++) runs.push(p.u16(), p.u16())
          }
          p.skip(ext)
          if (type === R.RSTRING && !p.eof) {
            const count = p.u16()
            runs = []
            for (let i = 0; i < count && !p.eof; i++) runs.push(p.u16(), p.u16())
          }
        } else {
          text = env.text8(rec.subarray(8, 8 + cch))
          if (type === R.RSTRING && 8 + cch < rec.length) {
            const count = rec[8 + cch]
            runs = []
            for (let i = 0; i < count && 8 + cch + 1 + i * 2 + 1 < rec.length; i++) runs.push(rec[9 + cch + i * 2], rec[10 + cch + i * 2])
          }
        }
        add(u16(rec, 0), u16(rec, 2), u16(rec, 4), runs?.length ? RICH : STR, runs?.length ? { text, runs } : text)
        break
      }
      case R.FORMULA:
      // FORMULA with the ids of older BIFF versions, as some writers put them
      case 0x0206:
      case 0x0406: {
        if (n < 22) break
        const rec = joined(data.subarray(o, pos))
        const cce = u16(rec, 20)
        const f: FormulaCell = { rgce: rec.subarray(22, 22 + cce), kind: 0, value: 0 }
        if (rec.length > 22 + cce) f.extra = rec.subarray(22 + cce)
        if (u16(rec, 12) === 0xffff) {
          const t = rec[6]
          if (t === 0) {
            f.kind = 1
            f.value = ''
            pendingString = f
          } else if (t === 1) {
            f.kind = 2
            f.value = rec[8] ? 1 : 0
          } else if (t === 2) {
            f.kind = 3
            f.value = ERRORS[rec[8]] ?? '#N/A'
          } else {
            f.kind = 4
            f.value = ''
          }
        } else f.value = new DataView(rec.buffer, rec.byteOffset + 6, 8).getFloat64(0, true)
        const r = u16(rec, 0)
        const c = u16(rec, 2)
        lastFormulaKey = r * MAX_COL + c
        add(r, c, u16(rec, 4), FORMULA, f)
        break
      }
      case R.STRING: {
        const rec = data.subarray(o, pos)
        const more = b8 ? continues() : []
        if (!pendingString) break
        pendingString.value = b8 ? new Parts([rec, ...more]).str(2).text : env.text8(rec.subarray(2, 2 + u16(rec, 0)))
        pendingString = undefined
        break
      }
      case R.SHRFMLA:
      case R.ARRAY: {
        if (n < 10) break
        const rec = joined(data.subarray(o, pos))
        const at = type === R.SHRFMLA ? 10 : 14
        const cce = u16(rec, at - 2)
        const sf: SharedFormula = { r1: u16(rec, 0), r2: u16(rec, 2), c1: rec[4], c2: rec[5], rgce: rec.subarray(at, at + cce) }
        if (rec.length > at + cce) sf.extra = rec.subarray(at + cce)
        const map = type === R.SHRFMLA ? shared : arrays
        map.set(sf.r1 * MAX_COL + sf.c1, sf)
        if (lastFormulaKey >= 0 && !map.has(lastFormulaKey)) map.set(lastFormulaKey, sf)
        break
      }
      case R.ROW: {
        if (n < 16) break
        const r = dv.getUint16(o, true)
        const h = dv.getUint16(o + 6, true)
        const fl = data[o + 12]
        const xfw = dv.getUint16(o + 14, true)
        rows.set(r, {
          ht: h & 0x8000 ? undefined : (h & 0x7fff) / 20,
          custom: !!(fl & 0x40),
          hidden: !!(fl & 0x20),
          level: fl & 7,
          collapsed: !!(fl & 0x10),
          xf: fl & 0x80 ? xfw & 0xfff : undefined,
        })
        break
      }
      case R.COLINFO:
        if (n >= 10) {
          const fl = dv.getUint16(o + 8, true)
          cols.push({
            first: dv.getUint16(o, true),
            last: dv.getUint16(o + 2, true),
            width: dv.getUint16(o + 4, true) / 256,
            xf: dv.getUint16(o + 6, true),
            hidden: !!(fl & 1),
            level: (fl >> 8) & 7,
            collapsed: !!(fl & 0x1000),
          })
        }
        break
      case R.DEFCOLWIDTH:
        if (n >= 2) m.defColWidth = dv.getUint16(o, true)
        break
      case R.STANDARDWIDTH:
        if (n >= 2) m.stdWidth = dv.getUint16(o, true) / 256
        break
      case R.DEFAULTROWHEIGHT:
        if (n >= 4) {
          m.defRowFlags = dv.getUint16(o, true)
          m.defRowHeight = dv.getUint16(o + 2, true) / 20
        }
        break
      case R.MERGECELLS: {
        const count = Math.min(dv.getUint16(o, true), Math.floor((n - 2) / 8))
        for (let k = 0; k < count; k++) {
          const p = o + 2 + k * 8
          merges.push(dv.getUint16(p, true), dv.getUint16(p + 2, true), dv.getUint16(p + 4, true), dv.getUint16(p + 6, true))
        }
        break
      }
      case R.WINDOW2:
        if (n >= 6) {
          m.window2 = dv.getUint16(o, true)
          m.topRow = dv.getUint16(o + 2, true)
          m.leftCol = dv.getUint16(o + 4, true)
        }
        break
      case R.PANE:
        if (n >= 8) m.pane = [dv.getUint16(o, true), dv.getUint16(o + 2, true), dv.getUint16(o + 4, true), dv.getUint16(o + 6, true)]
        break
      case R.SCL:
        if (n >= 4 && dv.getUint16(o + 2, true)) m.zoom = Math.round((dv.getUint16(o, true) * 100) / dv.getUint16(o + 2, true))
        break
      case R.SHEETEXT:
        if (n >= 20) m.tabColor = env.palette.rgb(dv.getUint32(o + 16, true) & 0x7f)
        break
      case R.WSBOOL:
        if (n >= 2) m.wsBool = dv.getUint16(o, true)
        break
      case R.LEFTMARGIN:
      case R.RIGHTMARGIN:
      case R.TOPMARGIN:
      case R.BOTTOMMARGIN:
        if (n >= 8) {
          const v = dv.getFloat64(o, true)
          if (Number.isFinite(v) && v >= 0 && v < 50) m.margins[{ [R.LEFTMARGIN]: 'left', [R.RIGHTMARGIN]: 'right', [R.TOPMARGIN]: 'top', [R.BOTTOMMARGIN]: 'bottom' }[type]!] = v
        }
        break
      case R.SETUP:
        if (n >= 34) m.setup = data.subarray(o, pos)
        break
      case R.HEADER:
      case R.FOOTER: {
        let t = ''
        if (b8) {
          if (n >= 3) t = str8At(data.subarray(0, pos), o + 2, dv.getUint16(o, true)).text
        } else if (n >= 1) t = env.text8(data.subarray(o + 1, Math.min(pos, o + 1 + data[o])))
        if (type === R.HEADER) m.header = t
        else m.footer = t
        break
      }
      case R.PRINTGRIDLINES:
        m.printGrid = n >= 2 && !!dv.getUint16(o, true)
        break
      case R.PRINTHEADERS:
        m.printHeadings = n >= 2 && !!dv.getUint16(o, true)
        break
      case R.HCENTER:
        m.hCenter = n >= 2 && !!dv.getUint16(o, true)
        break
      case R.VCENTER:
        m.vCenter = n >= 2 && !!dv.getUint16(o, true)
        break
      case R.AUTOFILTERINFO:
        m.autoFilter = true
        break
      case R.PROTECT:
        m.protect = n >= 2 && !!dv.getUint16(o, true)
        break
      case R.PASSWORD:
        if (n >= 2) m.password = dv.getUint16(o, true)
        break
      case R.HORIZONTALPAGEBREAKS:
      case R.VERTICALPAGEBREAKS: {
        const size = b8 ? 6 : 2
        const count = Math.min(dv.getUint16(o, true), Math.floor((n - 2) / size))
        for (let k = 0; k < count; k++) (type === R.HORIZONTALPAGEBREAKS ? m.rowBreaks : m.colBreaks).push(dv.getUint16(o + 2 + k * size, true))
        break
      }
      case R.HLINK:
        if (b8) {
          try {
            const l = readLink(joined(data.subarray(o, pos)), env.text8)
            if (l) links.push(l)
          } catch {
            // a damaged link: left out
          }
        }
        break
      case R.HLINKTOOLTIP:
        if (n > 10 && links.length) {
          let t = ''
          for (let p = o + 10; p + 1 < pos; p += 2) {
            const ch = dv.getUint16(p, true)
            if (!ch) break
            t += String.fromCharCode(ch)
          }
          links[links.length - 1].tooltip = t
        }
        break
      case R.OBJ:
        // ftCmo: object type 0x19 is a comment
        lastObj = n >= 8 && dv.getUint16(o, true) === 0x15 && dv.getUint16(o + 4, true) === 0x19 ? dv.getUint16(o + 6, true) : -1
        break
      case R.TXO: {
        const more = continues()
        if (lastObj >= 0 && n >= 14) {
          const cch = dv.getUint16(o + 10, true)
          texts.set(lastObj, cch ? new Parts([new Uint8Array(0), ...more]).chars(cch, false) : '')
        }
        lastObj = -1
        break
      }
      case R.NOTE: {
        if (n < 6) break
        const r = dv.getUint16(o, true)
        const c = dv.getUint16(o + 2, true)
        if (b8) {
          if (n < 10) break
          const id = dv.getUint16(o + 6, true)
          const author = str8At(data.subarray(0, pos), o + 10, dv.getUint16(o + 8, true)).text
          notes.push({ r, c, author, text: texts.get(id) ?? '', show: !!(dv.getUint16(o + 4, true) & 2) })
        } else if (r !== 0xffff) {
          // BIFF5: the text here, continued in NOTE records with row 0xFFFF
          const total = dv.getUint16(o + 4, true)
          const parts = [data.subarray(o + 6, pos)]
          let got = parts[0].length
          while (got < total && pos + 10 <= end && dv.getUint16(pos, true) === R.NOTE && dv.getUint16(pos + 4, true) === 0xffff) {
            const l = dv.getUint16(pos + 2, true)
            const p = data.subarray(pos + 10, Math.min(end, pos + 4 + l))
            parts.push(p)
            got += p.length
            pos += 4 + l
          }
          const all = new Uint8Array(got)
          let k = 0
          for (const p of parts) {
            all.set(p, k)
            k += p.length
          }
          notes.push({ r, c, author: '', text: env.text8(all.subarray(0, total)), show: false })
        }
        break
      }
    }
  }
  return m
}
