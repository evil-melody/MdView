/**
 * Pure run-level text operations shared by the DOCX and PPTX editors.
 * A run is either text ({ t: 'text', text }) or an atomic object counting as one character.
 */
export interface RRun {
  t: string
  text?: string
  s?: object
  d?: object
  src?: unknown
  href?: string
  lk?: string
  /** comment threads covering the run (DOCX) */
  cm?: string[]
  /** tracked change the run belongs to (DOCX) */
  tc?: object
  /** tracked character-format revision the run belongs to (DOCX) */
  fc?: object
}

export interface Pos {
  /** paragraph address (container path; last segment = index in container) */
  pa: string
  o: number
}

export interface Sel {
  a: Pos
  f: Pos
}

export const rlen = (r: RRun) => (r.t === 'text' ? r.text!.length : 1)
export const plen = (runs: RRun[]) => runs.reduce((n, r) => n + rlen(r), 0)
export const collapsed = (s: Sel) => s.a.pa === s.f.pa && s.a.o === s.f.o
export const shiftPa = (pa: string, d: number) => pa.replace(/(\d+)$/, (n) => String(Number(n) + d))

export function runsText(runs: RRun[]): string {
  return runs.map((r) => (r.t === 'text' ? r.text : '\uFFFC')).join('')
}

function shallowEq(a: object | undefined, b: object | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return !a && !b
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  for (const k of ka) if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false
  return true
}

export const sameMarks = (a: string[] | undefined, b: string[] | undefined) => (a?.length ?? 0) === (b?.length ?? 0) && (!a || a.every((x, i) => b![i] === x))

const sameText = (a: RRun, b: RRun) =>
  a.t === 'text' && b.t === 'text' && a.href === b.href && a.lk === b.lk && shallowEq(a.s, b.s) && shallowEq(a.d, b.d) && sameMarks(a.cm, b.cm) && shallowEq(a.tc, b.tc) && shallowEq(a.fc, b.fc)

/**
 * Comment threads text inserted at `o` joins: those covering both the character before and the one after (typing at
 * the edge of a commented range does not extend it).
 */
export function marksAt(runs: RRun[], o: number): string[] | undefined {
  let before: string[] | undefined
  let after: string[] | undefined
  let pos = 0
  for (const r of runs) {
    const n = rlen(r)
    if (pos < o && o <= pos + n) before = r.cm
    if (pos <= o && o < pos + n) {
      after = r.cm
      break
    }
    pos += n
  }
  const both = before?.filter((id) => after?.includes(id))
  return both?.length ? both : undefined
}

/** `run` covered by exactly the comment threads `cm` */
export function withMarks<R extends RRun>(run: R, cm: string[] | undefined): R {
  if (sameMarks(run.cm, cm)) return run
  const out = { ...run }
  if (cm?.length) out.cm = cm
  else delete out.cm
  return out
}

/** Merges adjacent identical text runs and drops empty ones. */
export function normalize<R extends RRun>(runs: R[]): R[] {
  const out: R[] = []
  for (const r of runs) {
    if (r.t === 'text' && !r.text) continue
    const last = out[out.length - 1]
    if (last && sameText(last, r)) out[out.length - 1] = { ...last, text: last.text! + r.text! }
    else out.push(r)
  }
  return out
}

/** Splits runs at offset o (text runs are cut). */
export function splitRuns<R extends RRun>(runs: R[], o: number): [R[], R[]] {
  const left: R[] = []
  const right: R[] = []
  let pos = 0
  for (const r of runs) {
    const n = rlen(r)
    if (pos + n <= o) left.push(r)
    else if (pos >= o) right.push(r)
    else {
      const cut = o - pos
      left.push({ ...r, text: r.text!.slice(0, cut) })
      right.push({ ...r, text: r.text!.slice(cut) })
    }
    pos += n
  }
  return [left, right]
}

export function sliceRuns<R extends RRun>(runs: R[], a: number, b: number): R[] {
  return splitRuns(splitRuns(runs, b)[0], a)[1]
}

/** Text run whose style applies at offset o (left affinity). */
export function runAt<R extends RRun>(runs: R[], o: number): R | undefined {
  const [l, r] = splitRuns(runs, o)
  for (let i = l.length - 1; i >= 0; i--) if (l[i].t === 'text') return l[i]
  return r.find((x) => x.t === 'text')
}

export function insertText<R extends RRun>(runs: R[], o: number, text: string, style?: Partial<R>, fallback?: Partial<R>): R[] {
  if (!text) return runs
  const [l, r] = splitRuns(runs, o)
  const base = runAt(runs, o)
  let run = { t: 'text', ...(base ?? fallback ?? {}), ...(style ?? {}), text } as R
  // the look of the neighbouring run, not its tracked change: tracking marks new text itself
  if (!style?.tc) delete run.tc
  if (style?.s && base?.s) run.s = { ...base.s, ...style.s }
  if (style?.d || base?.d) run.d = { ...(base?.d ?? {}), ...(style?.d ?? {}) }
  if (run.d && !Object.keys(run.d).length) delete run.d
  run = withMarks(run, marksAt(runs, o))
  return normalize([...l, run, ...r])
}

export function deleteRange<R extends RRun>(runs: R[], a: number, b: number): R[] {
  if (b <= a) return runs
  return normalize([...splitRuns(runs, a)[0], ...splitRuns(runs, b)[1]])
}

/** runs [a, b) join (`on`) or leave comment thread `id` */
export function markRange<R extends RRun>(runs: R[], a: number, b: number, id: string, on: boolean): R[] {
  const [l, rest] = splitRuns(runs, a)
  const [mid, r] = splitRuns(rest, b - a)
  const marked = mid.map((x) => {
    if (x.t !== 'text' && x.t !== 'img') return x
    const has = !!x.cm?.includes(id)
    if (has === on) return x
    return withMarks(x, on ? [...(x.cm ?? []), id] : x.cm!.filter((c) => c !== id))
  })
  return normalize([...l, ...marked, ...r])
}

export function formatRange<R extends RRun>(runs: R[], a: number, b: number, s: object, d: object): R[] {
  const [l, rest] = splitRuns(runs, a)
  const [mid, r] = splitRuns(rest, b - a)
  const fmt = mid.map((x) => (x.t === 'text' ? { ...x, s: { ...(x.s ?? {}), ...s }, d: { ...(x.d ?? {}), ...d } } : x))
  return normalize([...l, ...fmt, ...r])
}

/** Previous grapheme boundary (surrogate pairs + combining marks). */
export function prevBoundary(text: string, o: number): number {
  if (o <= 0) return 0
  type Seg = { segment(s: string): Iterable<{ index: number }> }
  const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => Seg }).Segmenter
  if (Segmenter) {
    let last = 0
    for (const s of new Segmenter(undefined, { granularity: 'grapheme' }).segment(text.slice(0, o))) last = s.index
    return last
  }
  const c = text.charCodeAt(o - 1)
  return c >= 0xdc00 && c <= 0xdfff && o >= 2 ? o - 2 : o - 1
}

export function nextBoundary(text: string, o: number): number {
  if (o >= text.length) return text.length
  type Seg = { segment(s: string): Iterable<{ index: number; segment: string }> }
  const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => Seg }).Segmenter
  if (Segmenter) {
    for (const s of new Segmenter(undefined, { granularity: 'grapheme' }).segment(text.slice(o))) return o + s.segment.length
  }
  const c = text.charCodeAt(o)
  return c >= 0xd800 && c <= 0xdbff ? o + 2 : o + 1
}
