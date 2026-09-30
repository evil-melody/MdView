/**
 * Table cell geometry + content access for the pptx editor.
 *
 * The engine model stores `colWidths` / `rowHeights` in EMU, but a slide's table is frequently
 * **scaled** into a frame of a different size (PowerPoint resizes the whole table, the stored grid
 * keeps its own EMU total). Cell rects are therefore derived from *ratios* of the declared grid,
 * never from a raw EMU→px conversion — that also keeps them correct when the table is a group child.
 *
 * Merged cells: the model keeps the placeholder cells (`merged: true`) aligned with the grid, and
 * the anchor carries `gridSpan` / `rowSpan`. The overlay must not draw a hit target over a covered
 * placeholder, so those are reported with `merged: true` and filtered by the caller.
 */
import type { TableElement } from '@genoffice/pptx-engine'
import type { ElementBox } from './document'

type CellModel = TableElement['rows'][number][number]

/** One addressable grid cell, in document-space px. */
export interface TableCellBox {
  row: number
  col: number
  x: number
  y: number
  w: number
  h: number
  /** covered by a merge: the anchor draws it, the placeholder must not be hit-tested */
  merged: boolean
  text: string
  fontFamily: string
  fontSizePx: number
  bold: boolean
  italic: boolean
  color: string
  align: 'left' | 'center' | 'right' | 'justify'
  /** direct cell fill (tcPr solidFill), null when the cell inherits the table style */
  fillHex: string | null
}

const PT_PER_PX = 0.75

/** Cumulative grid boundaries as fractions of the table frame (length = count + 1). */
function fractions(sizes: number[], fallbackCount: number): number[] {
  const clean = sizes.length ? sizes : new Array(fallbackCount).fill(1)
  const total = clean.reduce((a, b) => a + (b > 0 ? b : 0), 0)
  if (!total) return Array.from({ length: clean.length + 1 }, (_, i) => i / clean.length)
  const out = [0]
  let acc = 0
  for (const s of clean) {
    acc += s > 0 ? s : 0
    out.push(acc / total)
  }
  return out
}

function plainText(cell: CellModel | undefined): string {
  const paras = cell?.text?.paragraphs ?? []
  return paras.map((p) => p.runs.map((r) => r.text).join('')).join('\n')
}

/** First run of the first paragraph — the cell editor overlay borrows its typography. */
function firstRun(cell: CellModel | undefined) {
  return cell?.text?.paragraphs?.[0]?.runs?.[0]
}

/** Cell rects for one table element, relative to the document origin (table frame + cell offsets). */
export function tableCells(box: ElementBox, el: TableElement): TableCellBox[] {
  const rows = el.rows?.length ?? 0
  if (!rows) return []
  const cols = Math.max(el.colWidths?.length ?? 0, ...el.rows.map((r) => r.length), 1)
  const colFrac = fractions(el.colWidths ?? [], cols)
  const rowFrac = fractions(el.rowHeights ?? [], rows)
  const out: TableCellBox[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < (el.rows[r]?.length ?? 0); c++) {
      const cell = el.rows[r]![c]
      const span = Math.max(1, cell?.gridSpan ?? 1)
      const rowSpan = Math.max(1, cell?.rowSpan ?? 1)
      const c0 = colFrac[Math.min(c, colFrac.length - 1)] ?? 0
      const c1 = colFrac[Math.min(c + span, colFrac.length - 1)] ?? 1
      const r0 = rowFrac[Math.min(r, rowFrac.length - 1)] ?? 0
      const r1 = rowFrac[Math.min(r + rowSpan, rowFrac.length - 1)] ?? 1
      const run = firstRun(cell)
      const para = cell?.text?.paragraphs?.[0]
      const sizePt = Number(run?.fontSize ?? 0)
      out.push({
        row: r,
        col: c,
        x: box.x + (c1 - c0) * box.w,
        y: box.y + (r1 - r0) * box.h,
        w: (c1 - c0) * box.w,
        h: (r1 - r0) * box.h,
        merged: cell?.merged === true,
        text: plainText(cell),
        fontFamily: String(run?.fontFamily ?? ''),
        fontSizePx: sizePt > 0 ? sizePt / PT_PER_PX : 18,
        bold: run?.bold === true,
        italic: run?.italic === true,
        color: String(run?.color ?? '#000000'),
        align: (para?.align ?? 'left') as TableCellBox['align'],
        fillHex: cell?.fill?.type === 'solid' ? String(cell.fill.color) : null
      })
    }
  }
  return out
}

/** Topmost non-merged cell containing the point, or null. */
export function hitCell(cells: TableCellBox[], x: number, y: number): TableCellBox | null {
  let hit: TableCellBox | null = null
  for (const c of cells) {
    if (c.merged) continue
    if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) hit = c
  }
  return hit
}
