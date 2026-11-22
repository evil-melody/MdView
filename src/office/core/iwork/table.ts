/**
 * iWork tables (TST.TableModelArchive): the cell grid with each cell's shown value.
 * Cells live in tiles of row buffers; a cell record starts with its storage version and type, then a flag word
 * telling which values / table-list keys follow. Two layouts exist: pre-BNC (iWork '13–'14, versions 3 and 4)
 * and the current one (version 5).
 */
import { lowerAmPm, shownText, type CellKind } from './format'
import type { IworkPackage } from './iwa'
import type { Msg } from './proto'

export interface IworkCell {
  kind?: CellKind
  /** number, boolean (0 / 1), duration (seconds) or date (seconds from 2001-01-01 UTC) */
  value?: number
  /** TSK.FormatStructArchive of the value */
  format?: Msg
  /** plain text shown */
  text?: string
  /** TSWP storage of a rich text cell */
  storage?: number
  /** cell style (TST.CellStyleArchive) and paragraph style of the text */
  cellStyle?: number
  textStyle?: number
  /** merged range anchored here */
  rowSpan?: number
  colSpan?: number
  /** covered by a merged range */
  merged?: boolean
}

export interface IworkTable {
  rows: number
  cols: number
  colWidths: number[]
  rowHeights: number[]
  headerRows: number
  headerCols: number
  footerRows: number
  /** hidden (by the user or a filter) */
  hiddenRows: Set<number>
  hiddenCols: Set<number>
  /** [row][col] */
  cells: (IworkCell | undefined)[][]
  model: Msg
}

const DECIMAL128_BIAS = 0x1820
/** TSK.FormatStructArchive.format_type of a pop-up menu */
const POPUP = 266
/** formats whose text has no Excel equivalent: fraction, checkbox, rating, other base */
const TEXT_ONLY = new Set([262, 263, 267, 269])
const MAX_CELLS = 200_000

/** key → entry of a TST.TableDataList (entries may be split into segments) */
function dataList(pkg: IworkPackage, id: number | undefined): Map<number, Msg> {
  const out = new Map<number, Msg>()
  const list = pkg.get(id)
  if (!list) return out
  const add = (m: Msg) => {
    for (const e of m.msgs(3)) {
      const k = e.u(1)
      if (k !== undefined) out.set(k, e)
    }
  }
  add(list)
  for (const seg of list.refs(4)) {
    const s = pkg.get(seg)
    if (s) add(s)
  }
  return out
}

function decimal128(b: Uint8Array, o: number): number {
  const exp = (((b[o + 15] & 0x7f) << 7) | (b[o + 14] >> 1)) - DECIMAL128_BIAS
  let mantissa = b[o + 14] & 1
  for (let i = 13; i >= 0; i--) mantissa = mantissa * 256 + b[o + i]
  const v = mantissa * 10 ** exp
  return b[o + 15] & 0x80 ? -v : v
}



interface Lists {
  strings: Map<number, Msg>
  rich: Map<number, Msg>
  styles: Map<number, Msg>
  /** cell formats (current, pre-BNC) */
  formats: Map<number, Msg>
  formatsPre: Map<number, Msg>
  /** the document's locale writes "pm" */
  lower: boolean
  /** pop-up menus (TST.PopUpMenuModel) */
  choices: Map<number, Msg>
  /** compute the text of every value (else only of those an Excel format can't show) */
  texts: boolean
  /** style object of a style-table key, format of a format-table key (read once) */
  style(key: number): number | undefined
  format(key: number, pre: boolean): Msg | undefined
}

/** one cell record of a tile row buffer */
function readCell(buf: Uint8Array, dv: DataView, o: number, end: number, lists: Lists, pkg: IworkPackage): IworkCell | undefined {
  if (o + 12 > end) return undefined
  const version = buf[o]
  let type: number
  let num: number | undefined
  let date: number | undefined
  let strKey: number | undefined
  let richKey: number | undefined
  let cellStyleKey: number | undefined
  let textStyleKey: number | undefined
  /** format keys: number, currency, date, duration, text, boolean (current layout) or the one pre-BNC key */
  const fmt: (number | undefined)[] = []
  let fmtPre: number | undefined
  let p: number
  const u32 = () => {
    const v = p + 4 <= end ? dv.getUint32(p, true) : undefined
    p += 4
    return v
  }
  const f64 = () => {
    const v = p + 8 <= end ? dv.getFloat64(p, true) : undefined
    p += 8
    return v
  }
  if (version >= 5) {
    type = buf[o + 1]
    const flags = dv.getUint32(o + 8, true)
    p = o + 12
    if (flags & 0x1) {
      num = p + 16 <= end ? decimal128(buf, p) : undefined
      p += 16
    }
    if (flags & 0x2) num = f64()
    if (flags & 0x4) date = f64()
    if (flags & 0x8) strKey = u32()
    if (flags & 0x10) richKey = u32()
    if (flags & 0x20) cellStyleKey = u32()
    if (flags & 0x40) textStyleKey = u32()
    // conditional style, conditional rule, formula, control, formula error, suggestion
    for (const bit of [0x80, 0x100, 0x200, 0x400, 0x800, 0x1000]) if (flags & bit) p += 4
    for (const bit of [0x2000, 0x4000, 0x8000, 0x10000, 0x20000, 0x40000]) fmt.push(flags & bit ? u32() : undefined)
  } else {
    // pre-BNC: version 3 is a 16-bit version then the type; version 4 has the type in the second byte
    type = version >= 4 ? buf[o + 1] : buf[o + 2]
    const flags = dv.getUint16(o + 4, true)
    p = o + 12
    if (flags & 0x2) cellStyleKey = u32()
    if (flags & 0x80) textStyleKey = u32()
    if (flags & 0x800) p += 4 // conditional style
    if (flags & 0x400) p += 4
    if (flags & 0x4) fmtPre = u32()
    if (flags & 0x8) p += 4 // formula
    if (flags & 0x1000) p += 4 // comment
    if (flags & 0x10) strKey = u32()
    if (flags & 0x20) num = f64()
    if (flags & 0x40) date = f64()
    if (flags & 0x200) richKey = u32()
  }
  const cell: IworkCell = {}
  const styleRef = (k: number | undefined) => (k === undefined ? undefined : lists.style(k))
  cell.cellStyle = styleRef(cellStyleKey)
  cell.textStyle = styleRef(textStyleKey)
  const format = (k: number | undefined, pre = false) => (k === undefined ? undefined : lists.format(k, pre))
  const [numFmt, curFmt, dateFmt, durFmt, , boolFmt] = fmt
  const value = (kind: CellKind, v: number | undefined, key: number | undefined) => {
    if (v === undefined || !isFinite(v)) return
    cell.kind = kind
    cell.value = v
    cell.format = fmtPre !== undefined ? format(fmtPre, true) : format(key)
    if (lists.texts || kind === 'duration' || TEXT_ONLY.has(cell.format?.u(1) ?? 0)) cell.text = shownText(kind, v, cell.format, lists.lower)
    // a pop-up menu cell: the value is the index of the chosen item
    if (cell.format?.u(1) === POPUP) {
      const menu = pkg.get(lists.choices.get(cell.format.u(39) ?? -1)?.ref(4))
      const item = menu?.msgs(2)[v] ?? menu?.msgs(1)[v]
      const str = item?.msg(5)?.str(1)
      const n = item?.msg(4)?.double(1)
      if (str !== undefined) {
        cell.kind = 'text'
        cell.text = str
      } else if (n !== undefined) {
        cell.value = n
        cell.text = shownText('number', n, item?.msg(4)?.msg(3), lists.lower)
      } else cell.text = ''
    }
  }
  switch (type) {
    case 0:
      break
    case 2:
    case 10:
      value('number', num, type === 10 ? (curFmt ?? numFmt) : (numFmt ?? curFmt))
      break
    case 3:
      cell.kind = 'text'
      cell.text = strKey !== undefined ? (lists.strings.get(strKey)?.str(3) ?? '') : ''
      break
    case 5:
      value('date', date, dateFmt)
      break
    case 6:
      value('bool', num, boolFmt ?? numFmt)
      break
    case 7:
      value('duration', num, durFmt)
      break
    case 8:
      cell.kind = 'error'
      cell.text = '#ERROR'
      break
    case 9: {
      const payload = richKey === undefined ? undefined : pkg.get(lists.rich.get(richKey)?.ref(9))
      cell.kind = 'rich'
      cell.storage = payload?.ref(1)
      break
    }
    default:
      if (strKey !== undefined) {
        cell.kind = 'text'
        cell.text = lists.strings.get(strKey)?.str(3)
      }
  }
  return cell
}

/** column offsets of a row buffer (0xffff: no cell) */
function offsets(bytes: Uint8Array, scale: number): number[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: number[] = []
  for (let i = 0; i + 2 <= bytes.length; i += 2) {
    const v = dv.getUint16(i, true)
    out.push(v === 0xffff ? -1 : v * scale)
  }
  return out
}

/** sizes of the rows (or columns) from TST.HeaderStorageBucket objects */
function headerSizes(pkg: IworkPackage, buckets: number[], count: number, def: number, hidden: Set<number>): number[] {
  const out = new Array<number>(count).fill(def)
  for (const id of buckets) {
    for (const h of pkg.get(id)?.msgs(2) ?? []) {
      const i = h.u(1)
      if (i === undefined || i >= count) continue
      const size = h.float(2)
      if (size && size > 0) out[i] = size
      if (h.u(3)) hidden.add(i)
    }
  }
  return out
}

/**
 * Reads a TST.TableModelArchive. `texts`: the shown text of every value; without it only values an Excel number
 * format can't show (durations, fractions, other bases, checkboxes, ratings, pop-up menus) get one.
 */
export function readTable(pkg: IworkPackage, modelId: number, maxCells = MAX_CELLS, texts = true): IworkTable | undefined {
  const model = pkg.get(modelId)
  if (!model) return undefined
  const rows = model.u(6) ?? 0
  const cols = model.u(7) ?? 0
  if (!rows || !cols || rows * cols > maxCells) return undefined
  const store = model.msg(4)
  const hiddenRows = new Set<number>()
  const hiddenCols = new Set<number>()
  const table: IworkTable = {
    rows,
    cols,
    colWidths: headerSizes(pkg, store?.has(2) ? [store.ref(2)!] : [], cols, model.double(17) ?? 100, hiddenCols),
    rowHeights: headerSizes(pkg, store?.msg(1)?.refs(2) ?? [], rows, model.double(16) ?? 20, hiddenRows),
    hiddenRows,
    hiddenCols,
    headerRows: Math.min(rows, model.u(9) ?? 0),
    headerCols: Math.min(cols, model.u(10) ?? 0),
    footerRows: Math.min(rows, model.u(11) ?? 0),
    cells: Array.from({ length: rows }, () => new Array<IworkCell | undefined>(cols)),
    model,
  }
  if (!store) return table
  const styleRefs = new Map<number, number | undefined>()
  const formatMsgs = new Map<number, Msg | undefined>()
  const lists: Lists = {
    strings: dataList(pkg, store.ref(4)),
    rich: dataList(pkg, store.ref(17)),
    styles: dataList(pkg, store.ref(5)),
    formats: dataList(pkg, store.ref(22)),
    formatsPre: dataList(pkg, store.ref(11)),
    lower: lowerAmPm(pkg.locale()),
    choices: dataList(pkg, store.ref(16)),
    texts,
    style: (key) => {
      if (!styleRefs.has(key)) styleRefs.set(key, lists.styles.get(key)?.ref(4))
      return styleRefs.get(key)
    },
    format: (key, pre) => {
      const k = pre ? -key - 1 : key
      if (!formatMsgs.has(k)) formatMsgs.set(k, (pre ? lists.formatsPre : lists.formats).get(key)?.msg(6))
      return formatMsgs.get(k)
    },
  }
  const tiles = store.msg(3)
  const tileSize = tiles?.u(2) || 256
  for (const t of tiles?.msgs(1) ?? []) {
    const tile = pkg.get(t.ref(2))
    if (!tile) continue
    const base = (t.u(1) ?? 0) * tileSize
    for (const ri of tile.msgs(5)) {
      const r = base + (ri.u(1) ?? 0)
      if (r >= rows) continue
      // current layout first (6/7, offsets in 4-byte units when wide), else pre-BNC (3/4)
      let buf = ri.bytes(6)
      let offs = ri.bytes(7)
      let scale = ri.bool(8) ? 4 : 1
      if (!buf?.length || !offs?.length) {
        buf = ri.bytes(3)
        offs = ri.bytes(4)
        scale = 1
      }
      if (!buf || !offs) continue
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
      const starts = offsets(offs, scale)
      for (let c = 0; c < Math.min(cols, starts.length); c++) {
        const o = starts[c]
        if (o < 0 || o >= buf.length) continue
        let end = buf.length
        for (let k = c + 1; k < starts.length; k++) {
          if (starts[k] > o) {
            end = starts[k]
            break
          }
        }
        try {
          table.cells[r][c] = readCell(buf, dv, o, end, lists, pkg)
        } catch {
          // an unreadable cell stays empty
        }
      }
    }
  }
  // merged ranges: CellID packs (column << 16 | row), TableSize (columns << 16 | rows)
  for (const range of pkg.get(store.ref(13))?.msgs(1) ?? []) {
    const origin = range.msg(1)?.u(1)
    const size = range.msg(2)?.u(1)
    if (origin === undefined || size === undefined) continue
    const r0 = origin & 0xffff
    const c0 = origin >>> 16
    const nr = size & 0xffff
    const nc = size >>> 16
    if (r0 >= rows || c0 >= cols || (nr < 2 && nc < 2)) continue
    for (let r = r0; r < Math.min(rows, r0 + nr); r++) {
      for (let c = c0; c < Math.min(cols, c0 + nc); c++) {
        if (r === r0 && c === c0) continue
        table.cells[r][c] = { ...table.cells[r][c], merged: true }
      }
    }
    table.cells[r0][c0] = { ...table.cells[r0][c0], rowSpan: Math.min(nr, rows - r0), colSpan: Math.min(nc, cols - c0) }
  }
  return table
}

/** merged ranges: the anchor [row, col] of every covered position */
export function anchors(t: IworkTable): ([number, number] | undefined)[][] {
  const out: ([number, number] | undefined)[][] = t.cells.map((row) => row.map(() => undefined))
  t.cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (!cell?.rowSpan && !cell?.colSpan) return
      for (let rr = r; rr < Math.min(t.rows, r + (cell.rowSpan ?? 1)); rr++)
        for (let cc = c; cc < Math.min(t.cols, c + (cell.colSpan ?? 1)); cc++) out[rr][cc] = [r, c]
    }),
  )
  return out
}

export interface CellStroke {
  /** rrggbb */
  color: string
  /** pt */
  width: number
}

/** borders and banding of a table: what each cell edge shows (null: no line) */
export interface TableLook {
  /** h[r][c]: line above row r (r = rows: below the last row), over column c */
  h: (CellStroke | null)[][]
  /** v[r][c]: line left of column c (c = cols: right of the last column), along row r */
  v: (CellStroke | null)[][]
  /** fill of every second body row */
  band?: string
}

type Chain = (id: number | undefined) => Msg[]

/** TSD.StrokeArchive → line (null: none). A hairline (under 1 pt) shows lighter, as on screen. */
function cellStroke(m: Msg | undefined, color: (c: Msg | undefined) => string | undefined): CellStroke | null {
  if (!m || m.msg(6)?.u(1) === 2) return null
  const c = color(m.msg(1))
  const w = m.float(2) ?? 1
  if (!c || !(w > 0)) return null
  if (w >= 1) return { color: c, width: w }
  const mix = (k: number) => Math.round(parseInt(c.slice(k, k + 2), 16) * w + 255 * (1 - w)).toString(16).padStart(2, '0')
  return { color: (mix(0) + mix(2) + mix(4)).toUpperCase(), width: w }
}

/**
 * Lines and banding: the table style's (body, border and header strokes with their visibility switches), then
 * the lines set on the table itself (current files: stroke runs per row / column edge in its stroke sidecar).
 */
export function tableLook(pkg: IworkPackage, t: IworkTable, chain: Chain, color: (c: Msg | undefined) => string | undefined, fill: (f: Msg | undefined) => string | undefined): TableLook {
  const { rows, cols, model } = t
  const h = Array.from({ length: rows + 1 }, () => new Array<CellStroke | null>(cols).fill(null))
  const v = Array.from({ length: rows }, () => new Array<CellStroke | null>(cols + 1).fill(null))
  // table style properties, nearest style first
  const props = chain(model.ref(3)).map((s) => s.msg(11)).filter((p): p is Msg => !!p)
  const prop = <T>(get: (p: Msg) => T | undefined): T | undefined => {
    for (const p of props) {
      const x = get(p)
      if (x !== undefined) return x
    }
    return undefined
  }
  const look: TableLook = { h, v }
  if (prop((p) => p.bool(1))) look.band = prop((p) => (p.has(2) ? fill(p.msg(2)) : undefined))

  const stroke = (f: number) => cellStroke(prop((p) => p.msg(f)), color)
  const shown = (f: number) => prop((p) => p.bool(f)) !== false
  const bodyH = shown(34) ? stroke(60) : null
  const bodyV = shown(33) ? stroke(61) : null
  const border = shown(38)
  const borderH = border ? stroke(58) : null
  const borderV = border ? stroke(59) : null
  const hr = t.headerRows
  const hc = t.headerCols
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows) h[r][c] = r === 0 && hr ? (stroke(47) ?? borderH) : borderH
      else if (hr && r === hr) h[r][c] = shown(35) && shown(43) ? (stroke(46) ?? bodyH) : null
      else if (r < hr) h[r][c] = stroke(48) ?? bodyH
      else if (t.footerRows && r === rows - t.footerRows) h[r][c] = shown(37) && shown(44) ? (stroke(54) ?? bodyH) : null
      else h[r][c] = c < hc ? (stroke(52) ?? bodyH) : bodyH
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      if (c === 0 || c === cols) v[r][c] = borderV
      else if (hc && c === hc) v[r][c] = shown(36) && shown(42) ? (stroke(51) ?? bodyV) : null
      else if (r < hr) v[r][c] = stroke(49) ?? bodyV
      else v[r][c] = c < hc ? (stroke(53) ?? bodyV) : bodyV
    }
  }
  // a table without any line style: a light grid, so cells stay readable
  if (!props.length) {
    const grid = { color: 'A6A6A6', width: 0.5 }
    for (const row of h) row.fill(grid)
    for (const row of v) row.fill(grid)
  }
  // lines set on the table itself (current files) over the style's
  const sidecar = pkg.get(model.ref(49))
  if (sidecar) {
    const layers = (f: number) => sidecar.refs(f).map((id) => pkg.get(id)).filter((l): l is Msg => !!l)
    const apply = (f: number, edge: (k: number) => number, vertical: boolean) => {
      for (const layer of layers(f)) {
        const at = edge(layer.u(1) ?? 0)
        for (const run of layer.msgs(2)) {
          const s = cellStroke(run.msg(3), color)
          const from = Math.max(0, run.u(1) ?? 0)
          for (let k = from; k < from + (run.u(2) ?? 0); k++) {
            if (vertical && at <= cols && k < rows) v[k][at] = s
            else if (!vertical && at <= rows && k < cols) h[at][k] = s
          }
        }
      }
    }
    apply(4, (c) => c, true)
    apply(5, (c) => c + 1, true)
    apply(6, (r) => r, false)
    apply(7, (r) => r + 1, false)
  }

  return look
}
