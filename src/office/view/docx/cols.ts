/**
 * Column-aware hit testing for the CSS multi-column body (`.de-page-inner.de-cols`).
 *
 * The third batch rendered `w:cols` with `column-count` / `column-gap` and left caret placement to the
 * browser. This module adds an *explicit* geometric correction: it works out which column a click's
 * x-coordinate falls in from `column-count` / `column-gap` and the content box, finds the `[data-pa]`
 * paragraph that actually lives in that column at the click's y, and can relocate the caret into it.
 *
 * Honest boundary: a browser's contenteditable caret is still placed by the browser. We only correct
 * the case where its paragraph is clearly in a *different* column than the one clicked; the exact
 * character offset inside the target paragraph is best-effort (paragraph start). Column balancing,
 * tables and floating pictures can make visual columns differ from the ideal equal-width geometry,
 * so this is a paragraph-level hit correction, not character-exact placement. All functions are pure
 * DOM geometry helpers and are gated in the view behind `hasCols` (single-column docs are untouched).
 */

export interface ColumnGeom {
  count: number
  /** viewport px — all values below are viewport coordinates (zoom applied) */
  left: number
  top: number
  gap: number
  colWidth: number
  height: number
  /** the `.de-page` rect origin, for converting a rect to page-relative px (overlay positioning) */
  pageX: number
  pageY: number
}

/** Column band in page-relative px (for an absolutely-positioned highlight overlay in `.de-page`). */
export interface ColumnRect {
  index: number
  left: number
  top: number
  width: number
  height: number
}

/** Reads the current column geometry of a `.de-cols` inner element. Null when it is not multi-column. */
export function columnGeometry(inner: HTMLElement, page: HTMLElement): ColumnGeom | null {
  const cs = getComputedStyle(inner)
  const count = parseInt(cs.columnCount, 10)
  if (!Number.isFinite(count) || count < 2) return null
  const rect = inner.getBoundingClientRect()
  const pr = page.getBoundingClientRect()
  // the inner is scaled by `transform: scale(zoom)`; computed padding / gap are unscaled CSS px
  const scale = inner.offsetWidth ? rect.width / inner.offsetWidth : 1
  const pL = (parseFloat(cs.paddingLeft) || 0) * scale
  const pR = (parseFloat(cs.paddingRight) || 0) * scale
  const pT = (parseFloat(cs.paddingTop) || 0) * scale
  const pB = (parseFloat(cs.paddingBottom) || 0) * scale
  const gapRaw = parseFloat(cs.columnGap)
  const gap = (Number.isFinite(gapRaw) ? gapRaw : 0) * scale
  const contentWidth = Math.max(0, rect.width - pL - pR)
  const colWidth = Math.max(1, (contentWidth - gap * (count - 1)) / count)
  return {
    count,
    left: rect.left + pL,
    top: rect.top + pT,
    gap,
    colWidth,
    height: Math.max(0, rect.height - pT - pB),
    pageX: pr.left,
    pageY: pr.top,
  }
}

/** Index of the column a viewport x-coordinate falls in (0-based); the gap belongs to the column on its left. */
export function columnAtX(g: ColumnGeom, clientX: number): number {
  const stride = g.colWidth + g.gap
  const local = clientX - g.left
  if (local <= 0) return 0
  return Math.max(0, Math.min(g.count - 1, Math.floor(local / stride)))
}

/** The hit column's band, in page-relative px (for an overlay inside `.de-page`). */
export function columnRect(g: ColumnGeom, index: number): ColumnRect {
  const i = Math.max(0, Math.min(g.count - 1, index))
  return {
    index: i,
    left: g.left + i * (g.colWidth + g.gap) - g.pageX,
    top: g.top - g.pageY,
    width: g.colWidth,
    height: g.height,
  }
}

/** Viewport x-range of a column (used to test whether a paragraph's box lies inside it). */
export function columnXRange(g: ColumnGeom, index: number): [number, number] {
  const left = g.left + index * (g.colWidth + g.gap)
  return [left, left + g.colWidth]
}

/**
 * The `[data-pa]` paragraph whose box lies in column `index` and is vertically closest to `clientY`.
 * Returns its `data-pa` address and the element, or null when no paragraph is in that column.
 */
export function paragraphInColumn(
  inner: HTMLElement,
  g: ColumnGeom,
  index: number,
  clientY: number,
): { pa: string; el: HTMLElement } | null {
  const [x0, x1] = columnXRange(g, index)
  let best: { pa: string; el: HTMLElement; d: number } | null = null
  for (const el of Array.from(inner.querySelectorAll<HTMLElement>('[data-pa]'))) {
    const r = el.getBoundingClientRect()
    // a paragraph box overlaps the column band horizontally
    if (r.right < x0 + 0.5 || r.left > x1 - 0.5) continue
    const cy = (r.top + r.bottom) / 2
    const d = clientY >= r.top && clientY <= r.bottom ? 0 : Math.abs(clientY - cy)
    if (!best || d < best.d) best = { pa: el.dataset.pa!, el, d }
  }
  return best ? { pa: best.pa, el: best.el } : null
}

/** Which column a `[data-pa]` paragraph's box sits in, or -1 when it can't be placed. */
export function columnOfParagraph(g: ColumnGeom, el: HTMLElement): number {
  const r = el.getBoundingClientRect()
  const cx = (r.left + r.right) / 2
  for (let i = 0; i < g.count; i++) {
    const [x0, x1] = columnXRange(g, i)
    if (cx >= x0 - 1 && cx <= x1 + 1) return i
  }
  // fall back to the left edge when a wide box spans several columns
  return Math.max(0, Math.min(g.count - 1, Math.floor((r.left - g.left) / (g.colWidth + g.gap))))
}
