/**
 * Tracked changes ("suggesting"): an edit made while tracking is turned into marks. Text taken out stays, marked
 * deleted (text the author had inserted is really removed); text put in is marked inserted. Works on the result of any
 * edit (typing, Backspace / Delete, paste, replacing a selection, several paragraphs) by comparing the paragraphs
 * before and after it, so every editing path is covered without touching them.
 *
 * Not tracked: formatting, paragraph marks (Enter, joining paragraphs), pictures and other objects (removed for real;
 * one already deleted in the file stays deleted).
 */
import type { Inline, Paragraph, TrackMark } from '../../core/docx/types'
import { normalize, plen, shiftPa, splitRuns, type RRun, type Sel } from '../edit/rich'
import { resolveFmt } from './fmtchange'

type Tok = { b: true } | { b?: false; ch: string; run: Inline; tc?: TrackMark; obj?: boolean }

const isText = (t: Tok): t is Extract<Tok, { b?: false }> => !t.b

function flatten(paras: Paragraph[]): Tok[] {
  const out: Tok[] = []
  paras.forEach((p, i) => {
    if (i > 0) out.push({ b: true })
    for (const r of p.runs) {
      if (r.t === 'text') for (const ch of r.text.split('')) out.push({ ch, run: r, tc: r.tc })
      else out.push({ ch: '￼', run: r, obj: true, tc: r.tc })
    }
  })
  return out
}

const same = (a: Tok, b: Tok) => (a.b || b.b ? !!a.b && !!b.b : a.ch === b.ch && (!a.obj || a.run === b.run))
const high = (t: Tok | undefined) => !!t && isText(t) && /[\uD800-\uDBFF]/.test(t.ch)

/** global offset of a position in a list of paragraphs addressed from `pa0` (paragraph marks count one) */
function globalOf(paras: Paragraph[], pa0: string, pa: string, o: number): number | undefined {
  let g = 0
  for (let j = 0; j < paras.length; j++) {
    if (shiftPa(pa0, j) === pa) return g + o
    g += plen(paras[j].runs as RRun[]) + 1
  }
  return undefined
}

function localOf(lens: number[], pa0: string, g: number): { pa: string; o: number } {
  for (let j = 0; j < lens.length; j++) {
    if (g <= lens[j] || j === lens.length - 1) return { pa: shiftPa(pa0, j), o: Math.min(g, lens[j]) }
    g -= lens[j] + 1
  }
  return { pa: pa0, o: 0 }
}

/** rebuilds runs from tokens: characters of the same source run with the same mark join */
function runsOf(toks: Extract<Tok, { b?: false }>[]): Inline[] {
  const out: Inline[] = []
  let cur: { run: Inline; tc?: TrackMark; text: string } | null = null
  const flush = () => {
    if (!cur) return
    const { tc: _old, ...rest } = cur.run as Inline & { tc?: TrackMark }
    out.push({ ...(rest as Inline & { t: 'text' }), text: cur.text, ...(cur.tc ? { tc: cur.tc } : {}) })
    cur = null
  }
  for (const t of toks) {
    if (t.obj) {
      flush()
      out.push(t.tc === (t.run as { tc?: TrackMark }).tc ? t.run : ({ ...t.run, tc: t.tc } as Inline))
      continue
    }
    if (cur && cur.run === t.run && cur.tc === t.tc) cur.text += t.ch
    else {
      flush()
      cur = { run: t.run, tc: t.tc, text: t.ch }
    }
  }
  flush()
  return normalize(out as RRun[]) as Inline[]
}

/**
 * The edit `before` → `next` (paragraphs at `pa0`, the caret `sel` after it, `selBefore` before it) made by the author
 * of `mark`, as tracked changes.
 */
export function trackEdit(before: Paragraph[], next: Paragraph[], pa0: string, sel: Sel, selBefore: Sel | null, mark: TrackMark): { next: Paragraph[]; sel: Sel } {
  const B = flatten(before)
  const N = flatten(next)
  // the edit happened at the selection it was made on: the unchanged start / end can't reach into it
  // (else "24%" → "31%" would read as "24" → "31", the "%" matched on the wrong side)
  const ga = selBefore ? globalOf(before, pa0, selBefore.a.pa, selBefore.a.o) : undefined
  const gf = selBefore ? globalOf(before, pa0, selBefore.f.pa, selBefore.f.o) : undefined
  const maxP = ga !== undefined && gf !== undefined ? Math.min(ga, gf) : B.length
  const maxS = ga !== undefined && gf !== undefined ? B.length - Math.max(ga, gf) : B.length
  let p = 0
  while (p < maxP && p < B.length && p < N.length && same(B[p], N[p])) p++
  if (high(B[p - 1])) p--
  let s = 0
  while (s < maxS && s < B.length - p && s < N.length - p && same(B[B.length - 1 - s], N[N.length - 1 - s])) s++
  if (s > 0 && /[\uDC00-\uDFFF]/.test((B[B.length - s] as { ch?: string }).ch ?? '')) s--
  const removed = B.slice(p, B.length - s)
  const inserted = N.slice(p, N.length - s)
  if (!removed.some(isText) && !inserted.some(isText)) return { next, sel }

  // what stays of the removed text: deleted marks. The author's own insertion taken out again is gone for good;
  // someone else's becomes a deletion, so the reviewer still sees it. Objects go for real, unless already deleted.
  const kept: Extract<Tok, { b?: false }>[] = []
  for (const t of removed) {
    if (!isText(t)) continue
    if (t.tc?.k === 'del' || t.tc?.k === 'moveFrom') kept.push(t)
    else if (t.obj) continue
    else if ((t.tc?.k === 'ins' || t.tc?.k === 'moveTo') && t.tc.author === mark.author) continue
    else kept.push({ ...t, tc: { ...mark, k: 'del' } })
  }
  const ins: TrackMark = { ...mark, k: 'ins' }

  // the paragraphs of `next`, the kept text put back where the removal was, the new text marked
  const paras: Extract<Tok, { b?: false }>[][] = [[]]
  N.forEach((t, i) => {
    if (i === p) paras[paras.length - 1].push(...kept)
    if (!isText(t)) {
      paras.push([])
      return
    }
    paras[paras.length - 1].push(i >= p && i < N.length - s && !t.obj ? { ...t, tc: ins } : t)
  })
  if (p >= N.length) paras[paras.length - 1].push(...kept)
  const out = next.map((q, j) => ({ ...q, runs: runsOf(paras[j] ?? []), edited: true }))

  // the caret: after the kept text when it was past the removal (typing over a selection, Delete), else where it was
  const fwd =
    !!selBefore &&
    selBefore.a.pa === selBefore.f.pa &&
    selBefore.a.o === selBefore.f.o &&
    globalOf(before, pa0, selBefore.a.pa, selBefore.a.o) === p
  const lens = out.map((q) => plen(q.runs as RRun[]))
  const move = (pos: Sel['a']) => {
    const g = globalOf(next, pa0, pos.pa, pos.o)
    if (g === undefined) return pos
    return localOf(lens, pa0, g > p || (g === p && fwd) ? g + kept.length : g)
  }
  return { next: out, sel: { a: move(sel.a), f: move(sel.f) } }
}

/** runs [a, b) with their changes accepted (inserted text stays, deleted text goes) or rejected (the other way round) */
export function resolveRuns(runs: Inline[], a: number, b: number, accept: boolean): Inline[] {
  const [l, rest] = splitRuns(runs as RRun[], a)
  const [mid, r] = splitRuns(rest, b - a)
  const kept = (mid as Inline[]).flatMap((x) => {
    let y: Inline | undefined = x
    if (y.tc) {
      // moveFrom behaves like a deletion, moveTo like an insertion: a whole move resolves on both sides
      const goes = accept ? y.tc.k === 'del' || y.tc.k === 'moveFrom' : y.tc.k === 'ins' || y.tc.k === 'moveTo'
      if (goes) return []
      const { tc: _tc, ...plain } = y
      y = plain as Inline
    }
    if ((y as Inline & { fc?: unknown }).fc) y = resolveFmt(y as RRun, accept) as Inline
    return y ? [y] : []
  })
  return normalize([...l, ...kept, ...r] as RRun[]) as Inline[]
}

export const hasChanges = (p: Paragraph) => !!p.pc || p.runs.some((r) => !!r.tc || !!(r as Inline & { fc?: unknown }).fc)

/** [start, end) of each run of tracked change in a paragraph (format revisions included) */
export function changeSpans(p: Paragraph): { a: number; b: number; tc: TrackMark; fmt?: boolean; ppr?: boolean }[] {
  const out: { a: number; b: number; tc: TrackMark; fmt?: boolean; ppr?: boolean }[] = []
  // a paragraph-format revision covers the whole paragraph (w:pPrChange is a property of w:pPr)
  if (p.pc) out.push({ a: 0, b: plen(p.runs as RRun[]), tc: { k: 'ins' }, ppr: true })
  let o = 0
  for (const r of p.runs) {
    const n = r.t === 'text' ? r.text.length : 1
    if (r.tc) {
      const last = out[out.length - 1]
      if (last && last.b === o && !last.fmt && last.tc.k === r.tc.k && last.tc.author === r.tc.author) last.b = o + n
      else out.push({ a: o, b: o + n, tc: r.tc })
    } else if ((r as Inline & { fc?: unknown }).fc) {
      const last = out[out.length - 1]
      if (last && last.b === o && last.fmt) last.b = o + n
      else out.push({ a: o, b: o + n, tc: { k: 'ins' }, fmt: true })
    }
    o += n
  }
  return out
}
