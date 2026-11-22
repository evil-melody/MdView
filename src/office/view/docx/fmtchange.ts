/**
 * Run-level character-format revisions (Word's w:rPrChange). Kept out of DocxEditor so the editor stays
 * under the single-file limit. A revision is anchored to the run's look *before* the first change:
 *  - `fc.s` is that old look (rendered style, used to restore on reject and to describe the change);
 *  - `fc.d` is the base-relative RunSet that writes that old look back (see FmtChange in core/docx/types).
 *
 * Three rules drive the helpers here:
 *  1. net-zero diff dissolves the revision (bold then unbold → no w:rPrChange);
 *  2. every edit recomputes the diff against the anchor, never accumulates an operation log;
 *  3. reject restores `s` and `d` together, so the view and the written XML agree.
 */
import type { FmtChange, RunSet, RunStyle } from '../../core/docx/types'
import { normalize, splitRuns, type RRun } from '../edit/rich'

export type FmtMark = { author?: string; date?: string }

const FMT_KEYS = ['b', 'i', 'u', 'strike', 'color', 'sz', 'font', 'hl', 'va'] as const
type FmtKey = (typeof FMT_KEYS)[number]

/** Normalised value of one tracked-format key; "off" and "not set" collapse to undefined. */
function canon(s: RunStyle | undefined, k: FmtKey): unknown {
  if (!s) return undefined
  switch (k) {
    case 'b':
    case 'i':
    case 'strike':
      return s[k] ? true : undefined
    case 'u':
      return s.u && s.u !== 'none' ? s.u : undefined
    case 'color':
      return s.color && s.color !== 'auto' ? s.color.toLowerCase() : undefined
    case 'sz':
      return s.sz
    case 'font':
      return s.font
    case 'hl':
      return s.hl || undefined
    case 'va':
      return s.va
  }
}

/** True when the old and the new look are effectively the same on every tracked-format key. */
export function fmtChangeEmpty(oldS: RunStyle | undefined, newS: RunStyle | undefined): boolean {
  return FMT_KEYS.every((k) => canon(oldS, k) === canon(newS, k))
}

const LABEL: Record<FmtKey, string> = {
  b: '加粗',
  i: '斜体',
  u: '下划线',
  strike: '删除线',
  color: '颜色',
  sz: '字号',
  font: '字体',
  hl: '突出显示',
  va: '上下标',
}

/** Hover title for the rendered revision marker. */
export function fmtChangeDesc(oldS: RunStyle | undefined, newS: RunStyle | undefined): string {
  const parts = FMT_KEYS.filter((k) => canon(oldS, k) !== canon(newS, k)).map((k) => LABEL[k])
  return parts.length ? `格式已更改：${parts.join('、')}` : '格式已更改'
}

/**
 * Applies a formatting change to runs [a, b) while tracking it. When `mark` is absent this is plain
 * formatRange behaviour. When present, the first change captures the old look into `fc`; later changes
 * keep that anchor and only re-test whether the net diff is still non-empty.
 */
export function formatRangeFmt<R extends RRun>(runs: R[], a: number, b: number, s: object, d: object, mark?: FmtMark): R[] {
  const [l, rest] = splitRuns(runs, a)
  const [mid, r] = splitRuns(rest, b - a)
  const fmt = mid.map((x) => {
    if (x.t !== 'text') return x
    const out = { ...x, s: { ...(x.s ?? {}), ...s }, d: { ...(x.d ?? {}), ...d } } as R & { fc?: FmtChange; s?: RunStyle; d?: RunSet }
    if (mark) {
      const prev = (x as R & { fc?: FmtChange }).fc
      const fc: FmtChange = prev ?? {
        author: mark.author,
        date: mark.date,
        s: { ...((x as R & { s?: RunStyle }).s ?? {}) } as RunStyle,
        d: { ...((x as R & { d?: RunSet }).d ?? {}) } as RunSet,
      }
      if (fmtChangeEmpty(fc.s, out.s)) delete out.fc
      else out.fc = fc
    }
    return out
  })
  return normalize([...l, ...fmt, ...r] as R[])
}

/** Accepts (drops the marker, keeps the new look) or rejects (restores `s` and `d` in pair) a format revision. */
export function resolveFmt(x: RRun, accept: boolean): RRun {
  const fc = (x as RRun & { fc?: FmtChange }).fc
  if (!fc) return x
  if (accept) {
    const { fc: _fc, ...plain } = x as RRun & { fc?: FmtChange }
    return plain as RRun
  }
  const { fc: _fc, ...plain } = x as RRun & { fc?: FmtChange }
  return { ...plain, s: { ...(fc.s ?? {}) }, d: { ...(fc.d ?? {}) } } as RRun
}
