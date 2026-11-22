/**
 * Drawing anchor geometry helpers (xlsx floating pictures).
 *
 * `posTo` is the exact inverse of the `absX` / `absY` walks used when reading anchors back, so deriving the
 * far corner with it makes the px → cell-anchor → px round trip lossless. Deriving it from the *cell index*
 * instead (ignoring the `from` EMU offset) silently drops that offset on every write, which compounds into a
 * picture shrinking a little more each time it is dragged until it disappears.
 */
import { EMU_PER_PX } from './rowpatch'

export interface Pt {
  idx: number
  off: number
}

export interface Corner {
  col: number
  colOff: number
  row: number
  rowOff: number
}

/** the axis index + EMU offset an absolute px position lands on (hidden rows/cols measure 0) */
export function posTo(px: number, size: (i: number) => number, max: number): Pt {
  let acc = 0
  for (let i = 0; i < max; i++) {
    const s = size(i)
    if (acc + s > px) return { idx: i, off: Math.round((px - acc) * EMU_PER_PX) }
    acc += s
  }
  return { idx: max - 1, off: Math.round((px - acc) * EMU_PER_PX) }
}

/**
 * Rewrites one anchor's geometry in place: `from` and `to` are replaced with fresh cell corners, and the
 * cached `a:ext` (cx/cy EMU) is refreshed so the two never disagree — real Office trusts `to` for
 * twoCellAnchor but keeps `ext` as a hint.
 */
export function rewriteAnchor(
  text: string,
  fx: Pt,
  fy: Pt,
  to: Corner,
  wPx: number,
  hPx: number,
): string {
  const P = /<(\w+:)?from>/.exec(text)?.[1] ?? ''
  const fromXml =
    `<${P}from><${P}col>${fx.idx}</${P}col><${P}colOff>${fx.off}</${P}colOff><${P}row>${fy.idx}</${P}row><${P}rowOff>${fy.off}</${P}rowOff></${P}from>`
  let out = text.replace(/<(\w+:)?from>[\s\S]*?<\/(\w+:)?from>/, fromXml)
  const toRe = /<(\w+:)?to>[\s\S]*?<\/(\w+:)?to>/
  if (toRe.test(out)) {
    out = out.replace(
      toRe,
      `<${P}to><${P}col>${to.col}</${P}col><${P}colOff>${to.colOff}</${P}colOff><${P}row>${to.row}</${P}row><${P}rowOff>${to.rowOff}</${P}rowOff></${P}to>`,
    )
  }
  const extRe = /(<(\w+:)?ext\s+[^>]*?cx=")\d+("[^>]*?cy=")\d+/
  if (extRe.test(out)) {
    out = out.replace(extRe, `$1${Math.round(wPx * EMU_PER_PX)}$2${Math.round(hPx * EMU_PER_PX)}`)
  }
  return out
}
