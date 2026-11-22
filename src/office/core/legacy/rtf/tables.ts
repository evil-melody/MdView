/** RTF table rows (`\trowd … \cellx … \row`) → w:tbl: a column grid from every row's cell boundaries, merges, borders, shading. */
import { borderXml, shadeFill, shdXml, type Border, type Shade, type Side, type Tables } from './props'

export interface Pad {
  t?: number
  l?: number
  b?: number
  r?: number
}

export interface CellDef {
  /** right boundary (twips from the left margin) */
  x: number
  mgf?: boolean
  mrg?: boolean
  vmgf?: boolean
  vmrg?: boolean
  va?: 'top' | 'center' | 'bottom'
  brdr: Partial<Record<Side, Border>>
  shd?: Shade
  pad: Pad
  noWrap?: boolean
  dir?: string
}

export interface RowDef {
  /** half the space between cells: the cells' left / right padding */
  gaph?: number
  /** left edge of the row */
  left: number
  /** height: > 0 at least, < 0 exactly */
  rh?: number
  hdr?: boolean
  keep?: boolean
  jc?: 'center' | 'right'
  brdr: Partial<Record<Side, Border>>
  pad: Pad
  cells: CellDef[]
  auto?: boolean
}

export const newRow = (): RowDef => ({ left: 0, brdr: {}, pad: {}, cells: [] })
export const newCell = (): CellDef => ({ x: 0, brdr: {}, pad: {} })

/** a table being read (one per nesting level) */
export class TableLevel {
  rows: { def: RowDef; cells: string[] }[] = []
  /** finished cells of the current row */
  cells: string[] = []
  /** blocks of the current cell */
  cur: string[] = []
  /** the last row definition seen (rows without one of their own repeat it) */
  def?: RowDef
}

/** cell content: ends with a paragraph */
function cellBody(x: string): string {
  if (!x) return '<w:p/>'
  return x.endsWith('</w:tbl>') ? x + '<w:p/>' : x
}

const SIDE_TAG: [Side, string][] = [['t', 'top'], ['l', 'left'], ['b', 'bottom'], ['r', 'right']]

function padXml(tag: string, p: Pad): string {
  let x = ''
  for (const [k, name] of [['t', 'top'], ['l', 'left'], ['b', 'bottom'], ['r', 'right']] as const) {
    const n = p[k]
    if (n !== undefined) x += `<w:${name} w:w="${Math.max(0, n)}" w:type="dxa"/>`
  }
  return x ? `<w:${tag}>${x}</w:${tag}>` : ''
}

/** The table's XML ('' when it has no cells). Cells and rows still open are closed. */
export function tableXml(t: Tables, lvl: TableLevel): string {
  if (lvl.cur.length) {
    lvl.cells.push(lvl.cur.join(''))
    lvl.cur = []
  }
  if (lvl.cells.length) {
    lvl.rows.push({ def: lvl.def ?? newRow(), cells: lvl.cells })
    lvl.cells = []
  }
  const rows = lvl.rows.filter((r) => r.cells.length)
  if (!rows.length) return ''

  // each row's cell boundaries (as many as it has cells: missing ones get the width of the last one)
  const bounds = rows.map(({ def, cells }) => {
    const n = Math.max(cells.length, def.cells.length)
    const xs: number[] = []
    let prev = def.left
    for (let k = 0; k < n; k++) {
      const d = def.cells[k]
      const last = k ? xs[k - 1] - (k > 1 ? xs[k - 2] : def.left) : 1440
      const x = d ? Math.max(d.x, prev + 15) : prev + Math.max(360, last)
      xs.push(x)
      prev = x
    }
    return xs
  })
  const all = new Set<number>()
  rows.forEach((r, k) => {
    all.add(r.def.left)
    for (const x of bounds[k]) all.add(x)
  })
  const grid = [...all].sort((a, b) => a - b)
  const at = new Map(grid.map((x, k) => [x, k]))
  const widths = grid.slice(1).map((x, k) => x - grid[k])

  const first = rows[0].def
  const pad: Pad = { l: first.pad.l ?? first.gaph ?? 0, r: first.pad.r ?? first.gaph ?? 0, t: first.pad.t, b: first.pad.b }
  let tblBorders = ''
  for (const [side, tag] of [['t', 'top'], ['l', 'left'], ['b', 'bottom'], ['r', 'right'], ['h', 'insideH'], ['v', 'insideV']] as const) {
    if (first.brdr[side]) tblBorders += borderXml(t, tag, first.brdr[side])
  }
  let x =
    `<w:tbl><w:tblPr><w:tblW w:w="${grid[grid.length - 1] - grid[0]}" w:type="dxa"/>` +
    (first.jc ? `<w:jc w:val="${first.jc}"/>` : '') +
    `<w:tblInd w:w="${grid[0]}" w:type="dxa"/>` +
    (tblBorders ? `<w:tblBorders>${tblBorders}</w:tblBorders>` : '') +
    `<w:tblLayout w:type="${first.auto ? 'autofit' : 'fixed'}"/>` +
    padXml('tblCellMar', pad) +
    `</w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`

  rows.forEach(({ def, cells }, ri) => {
    const xs = bounds[ri]
    const startCol = at.get(def.left)!
    // merged cells (\clmgf / \clmrg) join the first one
    const out: { d?: CellDef; body: string; from: number; to: number }[] = []
    let col = startCol
    for (let k = 0; k < xs.length; k++) {
      const end = at.get(xs[k])!
      const d = def.cells[k]
      const prev = out[out.length - 1]
      if (d?.mrg && prev && !prev.d?.mrg) prev.to = end
      else out.push({ d, body: cells[k] ?? '', from: col, to: end })
      col = end
    }
    let trPr = ''
    if (startCol > 0) trPr += `<w:gridBefore w:val="${startCol}"/>`
    const after = grid.length - 1 - col
    if (after > 0) trPr += `<w:gridAfter w:val="${after}"/>`
    if (startCol > 0) trPr += `<w:wBefore w:w="${def.left - grid[0]}" w:type="dxa"/>`
    if (after > 0) trPr += `<w:wAfter w:w="${grid[grid.length - 1] - xs[xs.length - 1]}" w:type="dxa"/>`
    if (def.keep) trPr += '<w:cantSplit/>'
    if (def.rh) trPr += `<w:trHeight w:val="${Math.abs(def.rh)}" w:hRule="${def.rh < 0 ? 'exact' : 'atLeast'}"/>`
    if (def.hdr) trPr += '<w:tblHeader/>'
    if (def.jc && def.jc !== first.jc) trPr += `<w:jc w:val="${def.jc}"/>`
    x += `<w:tr>${trPr ? `<w:trPr>${trPr}</w:trPr>` : ''}`
    for (const c of out) {
      const d = c.d
      const span = c.to - c.from
      let tcPr = `<w:tcW w:w="${grid[c.to] - grid[c.from]}" w:type="dxa"/>`
      if (span > 1) tcPr += `<w:gridSpan w:val="${span}"/>`
      if (d?.vmgf) tcPr += '<w:vMerge w:val="restart"/>'
      else if (d?.vmrg) tcPr += '<w:vMerge/>'
      if (d) {
        let b = ''
        for (const [side, tag] of SIDE_TAG) if (d.brdr[side]) b += borderXml(t, tag, d.brdr[side])
        if (b) tcPr += `<w:tcBorders>${b}</w:tcBorders>`
        const fill = shadeFill(t, d.shd)
        if (fill) tcPr += shdXml(fill)
        if (d.noWrap) tcPr += '<w:noWrap/>'
        tcPr += padXml('tcMar', d.pad)
        if (d.dir) tcPr += `<w:textDirection w:val="${d.dir}"/>`
        if (d.va && d.va !== 'top') tcPr += `<w:vAlign w:val="${d.va}"/>`
      }
      x += `<w:tc><w:tcPr>${tcPr}</w:tcPr>${cellBody(c.body)}</w:tc>`
    }
    x += '</w:tr>'
  })
  return x + '</w:tbl>'
}
