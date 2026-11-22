import type { Block, Table } from '../../core/docx/types'

/** one page's fragment of a split table: rows [r0, r1) plus repeated header rows */
export interface RowFrag {
  r0: number
  r1: number
  /** original row indices of the header rows prepended on a continuation page */
  repeat: number[]
}

/** the blocks [start, end) of a page and the height they take */
export interface PageSlice {
  start: number
  end: number
  used: number
  /** table row fragments on this page, keyed by the absolute block index */
  frags?: Record<number, RowFrag>
}

/**
 * Cuts the blocks into pages. With text columns (`cols` > 1) a page holds `cols` columns of `avail`: a block that does
 * not fit what is left of a column starts the next one, and `used` is the tallest column.
 *
 * A table taller than a whole page is split row by row across pages (single-column layout only): each continuation
 * page repeats the leading `w:tblHeader` rows and keeps the same columns / borders. Short tables and paragraphs keep
 * the original "block is never split" behaviour. `rowHeights` holds the measured height of each row (pt); until the
 * DOM has been measured an even share of the block height is used.
 */
export function paginate(
  blocks: Block[], heights: WeakMap<Block, number>, count: number, avail: number, cols = 1,
  lastKind = 'nextPage', rowHeights?: WeakMap<Block, number[]>,
): PageSlice[] {
  // a section's type says how it starts: the break after a section is the next section's ('continuous': no new page);
  // the last section's is the body's (known once loaded)
  const breakAfter = new Map<number, string>()
  let nextKind = lastKind
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]
    if (b.t !== 'sect') continue
    breakAfter.set(i, nextKind)
    nextKind = b.kind
  }
  const pages: PageSlice[] = []
  let cur: PageSlice = { start: 0, end: 0, used: 0 }
  let col = 0
  let inCol = 0
  const next = (start: number) => {
    pages.push(cur)
    cur = { start, end: start, used: 0 }
    col = 0
    inCol = 0
  }
  const headersOf = (t: Table): number[] => {
    const h: number[] = []
    for (let r = 0; r < t.rows.length && t.rows[r].header; r++) h.push(r)
    return h
  }
  const rowH = (b: Block, n: number): number[] | undefined => {
    const m = rowHeights?.get(b)
    if (m && m.length === n) return m
    if (b.t === 'tbl') {
      const h = heights.get(b) ?? 0
      return new Array(n).fill(n ? h / n : 0)
    }
    return undefined
  }
  for (let i = 0; i < count; i++) {
    const b = blocks[i]
    const h = heights.get(b) ?? 0
    if (b.t === 'sect') {
      cur.end = i + 1
      if (breakAfter.get(i) !== 'continuous') next(i + 1)
      continue
    }
    const forced = b.t === 'p' && b.pb && cur.end > cur.start
    if (forced) next(i)

    // long table (higher than a full page): split by rows, single-column layout only
    if (b.t === 'tbl' && cols === 1 && b.rows.length > 1 && h > avail) {
      const rh = rowH(b, b.rows.length)
      if (rh) {
        const headers = headersOf(b)
        let r0 = 0
        while (r0 < b.rows.length) {
          const repeat = r0 > 0 ? headers : []
          const repH = repeat.reduce((s, r) => s + Math.max(0, rh[r] ?? 0), 0)
          const space = avail - inCol - repH
          let r1 = r0
          let acc = 0
          while (r1 < b.rows.length) {
            const line = Math.max(0, rh[r1] ?? 0)
            // always place at least one row so a tiny remaining space can't loop forever
            if (r1 > r0 && acc + line > space) break
            acc += line
            r1++
          }
          ;(cur.frags ??= {})[i] = { r0, r1, repeat }
          inCol += acc + repH
          cur.used = inCol
          cur.end = i + 1
          r0 = r1
          if (r0 < b.rows.length) next(i)
        }
        continue
      }
    }

    // ordinary block: paragraph, short table, section — never split
    if (!forced && inCol > 0 && inCol + h > avail) {
      if (col + 1 < cols) {
        col++
        inCol = 0
      } else next(i)
    }
    cur.end = i + 1
    inCol += h
    cur.used = Math.max(cur.used, cols > 1 ? Math.min(inCol, avail) : inCol)
  }
  if (cur.end > cur.start || !pages.length) pages.push(cur)
  return pages
}
