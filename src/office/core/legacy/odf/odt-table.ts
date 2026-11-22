/** OpenDocument tables in text (table:table) → WordprocessingML tables: column grid, spans, borders, shading, padding. */
import { children, type ONode, toHex, toPt } from './common'
import { bdrXml, borders, type Bdr, SIDES, tw, type Side } from './odt-props'

/** what the table converter needs from the document converter */
export interface TableHost {
  /** an element's property group (e.g. 'style:table-cell-properties') of a style, with what the style inherits */
  props(family: string, name: string | undefined, group: string): Record<string, string>
  /** the blocks of a cell (ending with a paragraph); `pbb`: its first paragraph starts a page */
  cellBlocks(cell: ONode, width: number, pbb: boolean): string
}

/** Word's limit */
const MAX_COLS = 63
const MAX_ROWS = 20000
const MAX_REPEAT = 1000

interface Entry {
  node: ONode
  covered: boolean
  cs: number
  rs: number
}

interface Row {
  node: ONode
  header: boolean
  cells: Entry[]
}

function readColumns(el: ONode, out: ONode[]) {
  for (const k of children(el)) {
    if (k.name === 'table:table-column') {
      const n = Math.min(MAX_COLS, Math.max(1, Number(k.attrs['table:number-columns-repeated'] ?? 1) || 1))
      for (let i = 0; i < n && out.length < MAX_COLS; i++) out.push(k)
    } else if (k.name === 'table:table-columns' || k.name === 'table:table-header-columns' || k.name === 'table:table-column-group') readColumns(k, out)
  }
}

function readRows(el: ONode, out: Row[], header: boolean) {
  for (const k of children(el)) {
    if (out.length >= MAX_ROWS) return
    if (k.name === 'table:table-row') {
      const cells: Entry[] = []
      for (const c of children(k)) {
        if (c.name !== 'table:table-cell' && c.name !== 'table:covered-table-cell') continue
        const covered = c.name === 'table:covered-table-cell'
        const rep = Math.max(1, Math.min(MAX_REPEAT, Number(c.attrs['table:number-columns-repeated'] ?? 1) || 1))
        const cs = covered ? 1 : Math.max(1, Math.min(MAX_COLS, Number(c.attrs['table:number-columns-spanned'] ?? 1) || 1))
        const rs = covered ? 1 : Math.max(1, Math.min(MAX_ROWS, Number(c.attrs['table:number-rows-spanned'] ?? 1) || 1))
        for (let i = 0; i < rep && cells.length < MAX_COLS * 2; i++) cells.push({ node: c, covered, cs, rs })
      }
      const rep = Math.max(1, Math.min(MAX_REPEAT, Number(k.attrs['table:number-rows-repeated'] ?? 1) || 1))
      for (let i = 0; i < rep && out.length < MAX_ROWS; i++) out.push({ node: k, header, cells })
    } else if (k.name === 'table:table-header-rows') readRows(k, out, true)
    else if (k.name === 'table:table-rows' || k.name === 'table:table-row-group') readRows(k, out, header)
  }
}

/** Converts a table to w:tbl; `avail` is the width (points) between the margins (or of the cell around it). */
export function tableXml(host: TableHost, t: ONode, avail: number, pbb = false): string {
  const tp = host.props('table', t.attrs['table:style-name'], 'style:table-properties')
  const colEls: ONode[] = []
  readColumns(t, colEls)
  const rows: Row[] = []
  readRows(t, rows, false)
  if (!rows.length) return ''
  // the grid position of every cell (the covered cells of a cell spanning columns go with it)
  const placed = rows.map((row) => {
    const out = new Map<number, Entry>()
    let c = 0
    for (let k = 0; k < row.cells.length && c < MAX_COLS; ) {
      const e = row.cells[k++]
      out.set(c, e)
      if (e.covered) c++
      else {
        for (let s = 1; s < e.cs && row.cells[k]?.covered; s++) k++
        c += e.cs
      }
    }
    return { out, end: c }
  })
  const ncols = Math.min(MAX_COLS, Math.max(colEls.length, ...placed.map((p) => p.end)))
  if (!ncols) return ''

  // widths
  const ml = toPt(tp['fo:margin-left']) ?? 0
  const mr = toPt(tp['fo:margin-right']) ?? 0
  const align = tp['table:align'] ?? 'margins'
  const relW = /^([\d.]+)%$/.exec(tp['style:rel-width'] ?? '')
  let width = toPt(tp['style:width']) ?? (relW ? (avail * Number(relW[1])) / 100 : avail - Math.max(0, ml) - Math.max(0, mr))
  width = Math.max(12, Math.min(width, 22 * 72))
  const cp = colEls.map((c) => host.props('table-column', c.attrs['table:style-name'], 'style:table-column-properties'))
  const rel = cp.map((p) => parseFloat(p['style:rel-column-width'] ?? ''))
  const abs = cp.map((p) => toPt(p['style:column-width']))
  let widths: number[]
  if (cp.length >= ncols && rel.slice(0, ncols).every((v) => v > 0)) {
    const sum = rel.slice(0, ncols).reduce((a, b) => a + b, 0)
    widths = rel.slice(0, ncols).map((v) => (v / sum) * width!)
  } else if (cp.length >= ncols && abs.slice(0, ncols).every((v) => v !== undefined && v > 0)) {
    widths = abs.slice(0, ncols) as number[]
    const sum = widths.reduce((a, b) => a + b, 0)
    if (!toPt(tp['style:width'])) width = sum
    else if (Math.abs(sum - width) > 1) widths = widths.map((v) => (v / sum) * width!)
  } else widths = Array.from({ length: ncols }, () => width! / ncols)
  const grid = widths.map((w) => Math.max(1, tw(w)))

  // the grid positions under a cell spanning rows
  const nrows = rows.length
  const below: ({ cs: number; node: ONode } | undefined)[][] = rows.map(() => [])
  placed.forEach(({ out }, r) => {
    for (const [c, e] of out) {
      if (e.covered || e.rs < 2 || c >= ncols) continue
      const cs = Math.min(e.cs, ncols - c)
      for (let rr = r + 1; rr < Math.min(nrows, r + e.rs); rr++) below[rr][c] = { cs, node: e.node }
    }
  })

  const rowBg = (row: Row) => toHex(host.props('table-row', row.node.attrs['table:style-name'], 'style:table-row-properties')['fo:background-color'])
  const tableBg = toHex(tp['fo:background-color'])
  // what a cell style says, worked out once per style
  const looks = new Map<string, { borders: string; fill?: string; clear: boolean; rest: string; pad: Partial<Record<Side, number>> }>()
  const lookOf = (name: string | undefined) => {
    let l = looks.get(name ?? '')
    if (l) return l
    const p = host.props('table-cell', name, 'style:table-cell-properties')
    const { bdr, pad } = borders(p)
    const sides = SIDES.filter((s) => bdr[s])
    let rest = ''
    const mar = SIDES.filter((s) => pad[s])
    if (mar.length) rest += `<w:tcMar>${mar.map((s) => `<w:${s} w:w="${tw(pad[s]!)}" w:type="dxa"/>`).join('')}</w:tcMar>`
    const wm = p['style:writing-mode']
    if (wm === 'tb-rl' || wm === 'tb') rest += '<w:textDirection w:val="tbRl"/>'
    else if (wm === 'bt-lr') rest += '<w:textDirection w:val="btLr"/>'
    const va = p['style:vertical-align']
    if (va === 'middle' || va === 'bottom') rest += `<w:vAlign w:val="${va === 'middle' ? 'center' : 'bottom'}"/>`
    l = {
      borders: sides.length ? `<w:tcBorders>${sides.map((s) => bdrXml(s, bdr[s] as Bdr)).join('')}</w:tcBorders>` : '',
      fill: toHex(p['fo:background-color']),
      clear: p['fo:background-color'] === 'transparent',
      rest,
      pad,
    }
    looks.set(name ?? '', l)
    return l
  }
  const cellPr = (node: ONode, w: number, cs: number, merge: string, bg: string | undefined) => {
    const l = lookOf(node.attrs['table:style-name'])
    const fill = l.clear ? undefined : (l.fill ?? bg)
    const x = `<w:tcW w:w="${w}" w:type="dxa"/>${cs > 1 ? `<w:gridSpan w:val="${cs}"/>` : ''}${merge}${l.borders}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}${l.rest}`
    return { x, pad: l.pad }
  }

  let first = pbb
  let body = ''
  rows.forEach((row, r) => {
    const rp = host.props('table-row', row.node.attrs['table:style-name'], 'style:table-row-properties')
    const exact = toPt(rp['style:row-height'])
    const min = toPt(rp['style:min-row-height'])
    let trPr = ''
    if (rp['fo:keep-together'] === 'always') trPr += '<w:cantSplit/>'
    if (exact && exact > 0) trPr += `<w:trHeight w:val="${tw(exact)}" w:hRule="exact"/>`
    else if (min && min > 0) trPr += `<w:trHeight w:val="${tw(min)}" w:hRule="atLeast"/>`
    if (row.header) trPr += '<w:tblHeader/>'
    const bg = rowBg(row) ?? tableBg
    let x = `<w:tr>${trPr ? `<w:trPr>${trPr}</w:trPr>` : ''}`
    const cells = placed[r].out
    for (let c = 0; c < ncols; ) {
      const e = cells.get(c)
      const span = below[r][c]
      if (e && !e.covered) {
        const cs = Math.min(e.cs, ncols - c)
        const w = grid.slice(c, c + cs).reduce((a, b) => a + b, 0)
        const { x: pr, pad } = cellPr(e.node, w, cs, e.rs > 1 && r + 1 < nrows ? '<w:vMerge w:val="restart"/>' : '', bg)
        const inner = Math.max(12, w / 20 - (pad.left ?? 0) - (pad.right ?? 0))
        x += `<w:tc><w:tcPr>${pr}</w:tcPr>${host.cellBlocks(e.node, inner, first)}</w:tc>`
        first = false
        c += cs
      } else if (span) {
        // under a cell spanning rows: the vertical merge goes on
        const w = grid.slice(c, c + span.cs).reduce((a, b) => a + b, 0)
        x += `<w:tc><w:tcPr>${cellPr(span.node, w, span.cs, '<w:vMerge/>', bg).x}</w:tcPr><w:p/></w:tc>`
        c += span.cs
      } else {
        // a covered cell nothing spans into, or a short row: an empty cell
        x += `<w:tc><w:tcPr>${e ? cellPr(e.node, grid[c], 1, '', bg).x : `<w:tcW w:w="${grid[c]}" w:type="dxa"/>`}</w:tcPr><w:p/></w:tc>`
        c++
      }
    }
    body += x + '</w:tr>'
  })

  const total = grid.reduce((a, b) => a + b, 0)
  let tblPr = `<w:tblW w:w="${total}" w:type="dxa"/>`
  if (align === 'center') tblPr += '<w:jc w:val="center"/>'
  else if (align === 'right') tblPr += '<w:jc w:val="right"/>'
  else if (ml) tblPr += `<w:tblInd w:w="${tw(ml)}" w:type="dxa"/>`
  tblPr +=
    '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>' +
    '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>'
  return `<w:tbl><w:tblPr>${tblPr}</w:tblPr><w:tblGrid>${grid.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${body}</w:tbl>`
}
