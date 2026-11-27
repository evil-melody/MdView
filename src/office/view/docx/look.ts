/**
 * 「外观」比较与换皮（"update style to match" / 样式联动重转换的纯逻辑）。
 * 从 DocxEditor 抽出，使编辑器留在单文件上限内；这里没有 this，全部是可独立测试的函数。
 */
import type { Inline, ParaStyle, Paragraph, RunStyle } from '../../core/docx/types'
import { normalize, runsText, splitRuns, type RRun, type Sel } from '../edit/rich'

/** the properties "update style to match" moves from the text into the style */
export const RUN_LOOK = ['b', 'i', 'u', 'strike', 'color', 'sz', 'font'] as const
export const PARA_LOOK = ['align', 'line', 'before', 'after'] as const

/** a run's look, property by property, in the form two runs are compared in */
export const runLook = (s: RunStyle | undefined) => ({
  b: !!s?.b,
  i: !!s?.i,
  u: s?.u && s.u !== 'none' ? s.u : 'none',
  strike: !!s?.strike,
  color: s?.color ?? 'auto',
  sz: s?.sz,
  font: s?.font,
})

export const paraLook = (ps: ParaStyle) => ({
  align: ps.align ?? 'left',
  // a multiple of the line height only: fixed heights are not part of the look taken over
  line: !ps.lineRule || ps.lineRule === 'auto' ? (ps.line ?? 1) : undefined,
  before: ps.before ?? 0,
  after: ps.after ?? 0,
})

/** the look of each character of a paragraph (an object counts as one) */
export const charLooks = (p: Paragraph) =>
  p.runs.flatMap((r) => (r.t === 'text' ? Array<string>(r.text.length).fill(JSON.stringify(runLook(r.s))) : ['']))

/** the font a CSS stack starts with */
export const firstFont = (css: string | undefined) => (css ? (/^\s*"?([^",]+)/.exec(css)?.[1] ?? css) : undefined)

/**
 * `was` with the look of `now`: the same paragraph converted again after its style changed. Content, source
 * references and the user's own formatting stay those of `was`; null when the two do not hold the same content.
 */
export function reskin(was: Paragraph, now: Paragraph): Paragraph | null {
  if (runsText(was.runs as RRun[]) !== runsText(now.runs as RRun[])) return null
  const runs: Inline[] = []
  let j = 0
  let o = 0
  // the run of `now` at the position reached (text runs already used up are passed)
  const at = () => {
    for (let n = now.runs[j]; n && n.t === 'text' && o >= n.text.length; n = now.runs[j]) {
      j++
      o = 0
    }
    return now.runs[j]
  }
  for (const w of was.runs) {
    if (w.t !== 'text') {
      const n = at()
      if (!n || n.t !== w.t) return null
      runs.push(w.t === 'box' && n.t === 'box' ? { ...w, blocks: n.blocks } : (w.t === 'field' || w.t === 'ref') && 's' in n ? { ...w, s: n.s } : w)
      j++
      o = 0
      continue
    }
    for (let rest = w.text; rest; ) {
      const n = at()
      if (!n || n.t !== 'text') return null
      const take = Math.min(rest.length, n.text.length - o)
      runs.push({ ...w, text: rest.slice(0, take), s: n.s })
      rest = rest.slice(take)
      o += take
    }
  }
  const marker = was.marker && now.marker ? { ...was.marker, s: now.marker.s } : was.marker
  return { ...was, ps: now.ps, runs: normalize(runs as RRun[]) as Inline[], markSz: now.markSz, markFont: now.markFont, marker }
}

/** selection recorded around address `from`, re-based onto `to` (same container) */
export function moveSel(sel: Sel, from: string, to: string): Sel {
  if (from === to) return sel
  const dir = (pa: string) => pa.replace(/\.?\d+$/, '')
  const d = Number(to.split('.').pop()) - Number(from.split('.').pop())
  const mv = (p: Sel['a']) => (dir(p.pa) === dir(from) ? { ...p, pa: dir(to) ? `${dir(to)}.${Number(p.pa.split('.').pop()) + d}` : String(Number(p.pa.split('.').pop()) + d) } : p)
  return { a: mv(sel.a), f: mv(sel.f) }
}

/** the runs of `p` between offsets [a, b) */
export const sliceRunsOf = (p: Paragraph, a: number, b: number) => splitRuns(splitRuns(p.runs as RRun[], b)[0], a)[1] as Inline[]
