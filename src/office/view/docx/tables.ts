import type { Block, Paragraph, Table, TableCell, TableRow } from '../../core/docx/types'

export interface GridCell {
  ri: number
  ci: number
  g: number
  cell: TableCell
}

/** Grid positions of every cell (row spans occupy following rows). */
export function gridOf(t: Table): { cells: GridCell[]; nCols: number; at: (ri: number, g: number) => GridCell | undefined } {
  const occ: boolean[][] = []
  const cells: GridCell[] = []
  t.rows.forEach((row, ri) => {
    let g = 0
    row.cells.forEach((cell, ci) => {
      while (occ[ri]?.[g]) g++
      for (let r = ri; r < ri + Math.max(1, cell.rowSpan); r++) for (let k = g; k < g + Math.max(1, cell.colSpan); k++) (occ[r] ??= [])[k] = true
      cells.push({ ri, ci, g, cell })
      g += Math.max(1, cell.colSpan)
    })
  })
  const nCols = Math.max(t.cols.length, ...cells.map((c) => c.g + c.cell.colSpan))
  const at = (ri: number, g: number) => cells.find((c) => ri >= c.ri && ri < c.ri + c.cell.rowSpan && g >= c.g && g < c.g + c.cell.colSpan)
  return { cells, nCols, at }
}

export type NewPara = (template: TableCell) => Paragraph

function blankCell(tpl: TableCell, mk: NewPara, colSpan = 1): TableCell {
  return { ...tpl, blocks: [mk(tpl)], colSpan, rowSpan: 1 }
}

function scaleCols(cols: number[], total: number): number[] {
  const sum = cols.reduce((a, b) => a + b, 0) || 1
  return cols.map((w) => +((w * total) / sum).toFixed(2))
}

export function insertRow(t: Table, ri: number, below: boolean, mk: NewPara): Table {
  const { cells, nCols, at } = gridOf(t)
  const target = below ? ri + 1 : ri
  const rows = t.rows.map((r) => ({ ...r, cells: [...r.cells] }))
  const newCells: TableCell[] = []
  for (let g = 0; g < nCols; ) {
    const above = at(below ? ri : ri, g)
    if (!above) {
      g++
      continue
    }
    const spansInto = above.ri < target && above.ri + above.cell.rowSpan > target
    if (spansInto) {
      const r = rows[above.ri]
      r.cells[above.ci] = { ...r.cells[above.ci], rowSpan: r.cells[above.ci].rowSpan + 1 }
    } else newCells.push(blankCell(above.cell, mk, above.cell.colSpan))
    g += above.cell.colSpan
  }
  void cells
  const tplRow = t.rows[ri]
  const row: TableRow = { ...tplRow, cells: newCells }
  rows.splice(target, 0, row)
  return { ...t, rows }
}

export function deleteRow(t: Table, ri: number): Table | null {
  if (t.rows.length <= 1) return null
  const { cells } = gridOf(t)
  const rows = t.rows.map((r) => ({ ...r, cells: [...r.cells] }))
  for (const c of cells) {
    if (c.ri < ri && c.ri + c.cell.rowSpan > ri) rows[c.ri].cells[c.ci] = { ...rows[c.ri].cells[c.ci], rowSpan: c.cell.rowSpan - 1 }
  }
  rows.splice(ri, 1)
  return { ...t, rows }
}

export function insertCol(t: Table, g0: number, right: boolean, mk: NewPara): Table {
  const { cells, nCols } = gridOf(t)
  const g = right ? g0 + 1 : g0
  const rows = t.rows.map((r) => ({ ...r, cells: [...r.cells] }))
  const total = t.cols.reduce((a, b) => a + b, 0)
  t.rows.forEach((_, ri) => {
    const rowCells = cells.filter((c) => c.ri === ri)
    const crossing = cells.find((c) => c.ri <= ri && ri < c.ri + c.cell.rowSpan && c.g < g && c.g + c.cell.colSpan > g)
    if (crossing) {
      if (crossing.ri === ri) rows[ri].cells[crossing.ci] = { ...rows[ri].cells[crossing.ci], colSpan: crossing.cell.colSpan + 1 }
      return
    }
    const covered = cells.find((c) => c.ri < ri && ri < c.ri + c.cell.rowSpan && c.g + c.cell.colSpan === g)
    if (covered && !rowCells.length) return
    const before = rowCells.filter((c) => c.g < g).length
    const tpl = rowCells[Math.max(0, before - 1)]?.cell ?? rowCells[0]?.cell
    if (tpl) rows[ri].cells.splice(before, 0, blankCell(tpl, mk))
  })
  const cols = [...(t.cols.length ? t.cols : new Array(nCols).fill(total / Math.max(1, nCols)))]
  cols.splice(g, 0, cols[Math.min(g0, cols.length - 1)] ?? 72)
  return { ...t, rows, cols: total ? scaleCols(cols, total) : cols }
}

export function deleteCol(t: Table, g: number): Table | null {
  const { cells, nCols } = gridOf(t)
  if (nCols <= 1) return null
  const rows = t.rows.map((r) => ({ ...r, cells: [...r.cells] }))
  const remove = new Set<string>()
  for (const c of cells) {
    if (g < c.g || g >= c.g + c.cell.colSpan) continue
    if (c.cell.colSpan > 1) rows[c.ri].cells[c.ci] = { ...rows[c.ri].cells[c.ci], colSpan: c.cell.colSpan - 1 }
    else remove.add(`${c.ri}:${c.ci}`)
  }
  rows.forEach((r, ri) => (r.cells = r.cells.filter((_, ci) => !remove.has(`${ri}:${ci}`))))
  const total = t.cols.reduce((a, b) => a + b, 0)
  const cols = [...t.cols]
  cols.splice(g, 1)
  return { ...t, rows: rows.filter((r) => r.cells.length), cols: total && cols.length ? scaleCols(cols, total) : cols }
}

/** New table model (rows × cols) with simple single borders. */
export function newTable(rowsN: number, colsN: number, width: number, mk: () => Paragraph): Table {
  const border = '0.5pt solid #000000'
  const w = +(width / colsN).toFixed(2)
  return {
    t: 'tbl',
    cols: new Array(colsN).fill(w),
    rows: Array.from({ length: rowsN }, () => ({
      cells: Array.from({ length: colsN }, () => ({ blocks: [mk()], colSpan: 1, rowSpan: 1, borders: { t: border, r: border, b: border, l: border }, pad: [0, 5.4, 0, 5.4] as [number, number, number, number] })),
    })),
  }
}

// ---------------------------------------------------------------- cell ranges (merge, borders, shading)

/** a rectangle of grid positions, inclusive */
export interface CellRect {
  r0: number
  g0: number
  r1: number
  g1: number
}

/** The rectangle spanned by two cells, grown until no merged cell sticks out of it. */
export function rectOf(t: Table, a: [number, number], b: [number, number]): CellRect | null {
  const { cells } = gridOf(t)
  const ca = cells.find((c) => c.ri === a[0] && c.ci === a[1])
  const cb = cells.find((c) => c.ri === b[0] && c.ci === b[1])
  if (!ca || !cb) return null
  const r: CellRect = {
    r0: Math.min(ca.ri, cb.ri),
    g0: Math.min(ca.g, cb.g),
    r1: Math.max(ca.ri + ca.cell.rowSpan, cb.ri + cb.cell.rowSpan) - 1,
    g1: Math.max(ca.g + ca.cell.colSpan, cb.g + cb.cell.colSpan) - 1,
  }
  for (let grown = true; grown; ) {
    grown = false
    for (const c of cells) {
      const cr1 = c.ri + c.cell.rowSpan - 1
      const cg1 = c.g + c.cell.colSpan - 1
      if (c.ri > r.r1 || cr1 < r.r0 || c.g > r.g1 || cg1 < r.g0) continue
      if (c.ri < r.r0 || cr1 > r.r1 || c.g < r.g0 || cg1 > r.g1) {
        r.r0 = Math.min(r.r0, c.ri)
        r.r1 = Math.max(r.r1, cr1)
        r.g0 = Math.min(r.g0, c.g)
        r.g1 = Math.max(r.g1, cg1)
        grown = true
      }
    }
  }
  return r
}

/** cells whose top-left corner lies in the rectangle, in reading order */
export function cellsIn(t: Table, r: CellRect): GridCell[] {
  return gridOf(t).cells.filter((c) => c.ri >= r.r0 && c.ri <= r.r1 && c.g >= r.g0 && c.g <= r.g1)
}

const blankPara = (p: Block) => p.t === 'p' && !p.runs.some((x) => x.t !== 'text' || x.text.length > 0)

/** Merges every cell of the rectangle into its top-left one (contents kept, in reading order). Null: nothing to merge. */
export function mergeCells(t: Table, r: CellRect): Table | null {
  const inside = cellsIn(t, r)
  if (inside.length < 2) return null
  const first = inside[0]
  if (first.ri !== r.r0 || first.g !== r.g0) return null
  const filled = inside.filter((c) => !c.cell.blocks.every(blankPara))
  const blocks = filled.length ? filled.flatMap((c) => c.cell.blocks) : first.cell.blocks
  const drop = new Set(inside.slice(1).map((c) => `${c.ri}:${c.ci}`))
  const rows = t.rows.map((row, ri) => ({
    ...row,
    cells: row.cells.flatMap((cell, ci) => {
      if (drop.has(`${ri}:${ci}`)) return []
      if (ri === first.ri && ci === first.ci) {
        const last = inside.find((c) => c.ri === r.r0 && c.g + c.cell.colSpan - 1 === r.g1)?.cell ?? cell
        const bottom = inside.find((c) => c.ri + c.cell.rowSpan - 1 === r.r1)?.cell ?? cell
        return [{ ...cell, blocks, colSpan: r.g1 - r.g0 + 1, rowSpan: r.r1 - r.r0 + 1, borders: { ...cell.borders, r: last.borders.r, b: bottom.borders.b } }]
      }
      return [cell]
    }),
  }))
  return { ...t, rows }
}

/** Splits a merged cell back into single cells (the content stays in the top-left one). Null: the cell isn't merged. */
export function unmergeCell(t: Table, ri: number, ci: number, mk: NewPara): Table | null {
  const { cells } = gridOf(t)
  const gc = cells.find((c) => c.ri === ri && c.ci === ci)
  if (!gc || (gc.cell.colSpan <= 1 && gc.cell.rowSpan <= 1)) return null
  const { colSpan, rowSpan } = gc.cell
  const rows = t.rows.map((r) => ({ ...r, cells: [...r.cells] }))
  // the new cells look like the merged one (its properties as template, its changes marked to be written)
  const blank = (): TableCell => ({ ...gc.cell, blocks: [mk(gc.cell)], colSpan: 1, rowSpan: 1 })
  rows[ri].cells.splice(ci, 1, { ...gc.cell, colSpan: 1, rowSpan: 1 }, ...Array.from({ length: colSpan - 1 }, blank))
  for (let r = ri + 1; r < ri + rowSpan && r < rows.length; r++) {
    const at = cells.filter((c) => c.ri === r && c.g < gc.g).length
    rows[r].cells.splice(at, 0, ...Array.from({ length: colSpan }, blank))
  }
  return { ...t, rows }
}

export type BorderPreset = 'all' | 'outer' | 'inner' | 'none' | 'top' | 'bottom' | 'left' | 'right'

const SIDES = ['t', 'r', 'b', 'l'] as const
type Side = (typeof SIDES)[number]
const OPP: Record<Side, Side> = { t: 'b', b: 't', l: 'r', r: 'l' }

/**
 * Sets the borders of the cells in the rectangle. `css`: the line drawn ('0.5pt solid #000000').
 * Lines on the edge of the rectangle are also set on the neighbouring cells, so both sides agree.
 */
export function setBorders(t: Table, r: CellRect, preset: BorderPreset, css: string): Table {
  const { cells } = gridOf(t)
  const rows = t.rows.map((row) => ({ ...row, cells: [...row.cells] }))
  const put = (gc: GridCell, side: Side, v: string) => {
    const c = rows[gc.ri].cells[gc.ci]
    rows[gc.ri].cells[gc.ci] = { ...c, borders: { ...c.borders, [side]: v }, set: { ...c.set, borders: true } }
  }
  for (const gc of cellsIn(t, r)) {
    const edge: Record<Side, boolean> = {
      t: gc.ri === r.r0,
      b: gc.ri + gc.cell.rowSpan - 1 === r.r1,
      l: gc.g === r.g0,
      r: gc.g + gc.cell.colSpan - 1 === r.g1,
    }
    for (const side of SIDES) {
      let v: string | undefined
      if (preset === 'all') v = css
      else if (preset === 'none') v = 'none'
      else if (preset === 'outer') v = edge[side] ? css : undefined
      else if (preset === 'inner') v = edge[side] ? undefined : css
      else v = side === preset[0] && edge[side] ? css : undefined
      if (v === undefined) continue
      put(gc, side, v)
      if (!edge[side]) continue
      // the cells across that edge
      for (const n of cells) {
        const nr1 = n.ri + n.cell.rowSpan - 1
        const ng1 = n.g + n.cell.colSpan - 1
        const rowsMeet = n.ri <= gc.ri + gc.cell.rowSpan - 1 && nr1 >= gc.ri
        const colsMeet = n.g <= gc.g + gc.cell.colSpan - 1 && ng1 >= gc.g
        const touches =
          (side === 't' && nr1 === gc.ri - 1 && colsMeet) ||
          (side === 'b' && n.ri === gc.ri + gc.cell.rowSpan && colsMeet) ||
          (side === 'l' && ng1 === gc.g - 1 && rowsMeet) ||
          (side === 'r' && n.g === gc.g + gc.cell.colSpan && rowsMeet)
        if (touches) put(n, OPP[side], v)
      }
    }
  }
  return { ...t, rows }
}

/** Gives every cell of the rectangle the change `patch` (shading, vertical alignment). */
export function patchCells(t: Table, r: CellRect, patch: (c: TableCell) => TableCell): Table {
  const hit = new Set(cellsIn(t, r).map((c) => `${c.ri}:${c.ci}`))
  return { ...t, rows: t.rows.map((row, ri) => ({ ...row, cells: row.cells.map((c, ci) => (hit.has(`${ri}:${ci}`) ? patch(c) : c)) })) }
}

/** Same total width, columns of the rectangle (or all) made equal. */
export function distributeCols(t: Table, r?: CellRect): Table {
  const { nCols } = gridOf(t)
  const cols = t.cols.length === nCols ? [...t.cols] : new Array(nCols).fill(t.cols.reduce((a, b) => a + b, 0) / Math.max(1, nCols))
  const g0 = r && r.g1 > r.g0 ? r.g0 : 0
  const g1 = r && r.g1 > r.g0 ? r.g1 : nCols - 1
  const sum = cols.slice(g0, g1 + 1).reduce((a, b) => a + b, 0)
  for (let g = g0; g <= g1; g++) cols[g] = +(sum / (g1 - g0 + 1)).toFixed(2)
  return { ...t, cols }
}
