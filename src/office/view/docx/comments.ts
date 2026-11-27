/**
 * 批注范围模型（线程 ↔ 文档位置）。从 DocxEditor 抽出，使编辑器留在单文件上限内。
 * 全部走宿主的窄接口（CommentHost）：地址换算、段落替换都在宿主里，这里只管「哪段文字被哪条线程盖住」。
 */
import type { Block, Paragraph } from '../../core/docx/types'
import { collapsed, markRange, plen, runsText, type Pos, type RRun, type Sel } from '../edit/rich'

/** a place in a paragraph that survives edits elsewhere: paragraph id, page-break part, offset */
export interface ParaPos {
  pid: number
  k: number
  o: number
}

/** what a new comment would cover */
export interface CommentRange {
  a: ParaPos
  f: ParaPos
  /** the text covered */
  quote: string
}

/** where a comment thread is in the document */
export interface CommentPlace {
  /** first paragraph (block address) holding its text, and the offset there */
  pa: string
  o: number
  /** the text it covers (paragraphs joined by spaces), shortened */
  quote: string
}

const QUOTE_MAX = 200
const WORD = /[\p{L}\p{N}_'’-]/u

/** the subset of DocxEditor the comment layer drives */
export interface CommentHost {
  blocks: Block[]
  para(pa: string): Paragraph | undefined
  withRuns(p: Paragraph, runs: RRun[]): Paragraph
  replace(pas: string[], next: Paragraph[], sel: Sel, opts?: { label?: string }): void
  /** pid → the addresses holding it now (page-break parts, cell paragraphs), document order */
  locate(pid: number): { pa: string }[]
  selectedParas(sel: Sel): { pas: string[]; s: Pos; e: Pos } | null
  input: { sel(): Sel | null; lastSel: Sel | null }
}

/** comment threads the runs mark */
export const marksOf = (ps: Paragraph[]) => {
  const out = new Set<string>()
  for (const p of ps) for (const r of p.runs) if (r.t === 'text' || r.t === 'img') for (const id of r.cm ?? []) out.add(id)
  return out
}

/** the block address and offset of `d` now; null when its paragraph is gone */
export function posOf(host: CommentHost, d: ParaPos): Pos | null {
  const locs = host.locate(d.pid)
  const l = locs[Math.min(d.k, locs.length - 1)]
  const p = l && host.para(l.pa)
  return p ? { pa: l.pa, o: Math.min(d.o, plen(p.runs as RRun[])) } : null
}

const paraPos = (host: CommentHost, p: Pos): ParaPos | null => {
  const para = host.para(p.pa)
  if (!para || para.pid === undefined) return null
  const k = host.locate(para.pid).findIndex((l) => l.pa === p.pa)
  return k < 0 ? null : { pid: para.pid, k, o: p.o }
}

const shorten = (q: string) => (q.length > QUOTE_MAX ? q.slice(0, QUOTE_MAX - 1) + '…' : q)

/** what a new comment covers: the selection, or the word at the caret; null when there is no text there */
export function commentRange(host: CommentHost, sel: Sel | null = host.input.sel() ?? host.input.lastSel): CommentRange | null {
  if (!sel) return null
  const r = host.selectedParas(sel)
  if (!r) return null
  let { s, e } = r
  if (collapsed(sel)) {
    const t = runsText(host.para(s.pa)!.runs as RRun[])
    let a = s.o
    let b = s.o
    while (a > 0 && WORD.test(t[a - 1])) a--
    while (b < t.length && WORD.test(t[b])) b++
    if (a === b) return null
    s = { pa: s.pa, o: a }
    e = { pa: s.pa, o: b }
  }
  let quote = ''
  r.pas.forEach((pa, i) => {
    const t = runsText(host.para(pa)!.runs as RRun[])
    quote += (i ? ' ' : '') + t.slice(pa === s.pa ? s.o : 0, pa === e.pa ? e.o : t.length)
  })
  quote = quote.replace(/\uFFFC/g, '').replace(/\s+/g, ' ').trim()
  const a = paraPos(host, s)
  const f = paraPos(host, e)
  if (!a || !f || !quote) return null
  return { a, f, quote: shorten(quote) }
}

/** marks `range` as covered by comment thread `id` (one undo step); false when its text is gone */
export function markComment(host: CommentHost, id: string, range: CommentRange): boolean {
  const s = posOf(host, range.a)
  const e = posOf(host, range.f)
  if (!s || !e) return false
  const sel = { a: s, f: e }
  const r = host.selectedParas(sel)
  if (!r) return false
  let any = false
  const next = r.pas.map((pa, i) => {
    const p = host.para(pa)!
    const a = pa === r.s.pa ? r.s.o : 0
    const b = pa === r.e.pa ? r.e.o : plen(p.runs as RRun[])
    if (b > a) any = true
    return host.withRuns(p, markRange(p.runs as RRun[], a, b, id, true))
  })
  if (!any) return false
  host.replace(r.pas, next, { a: r.e, f: r.e }, { label: 'comment' })
  return true
}

/** the first place of each comment thread the document marks, in document order */
export function commentPlaces(host: CommentHost): Map<string, CommentPlace> {
  const out = new Map<string, CommentPlace>()
  const quotes = new Map<string, string>()
  const add = (id: string, text: string) => {
    const q = quotes.get(id)
    if (q !== undefined && q.length >= QUOTE_MAX) return
    quotes.set(id, q === undefined ? text : q + text)
  }
  const para = (p: Paragraph, pa: string) => {
    let o = 0
    const seen = new Set<string>()
    for (const r of p.runs) {
      if (r.t === 'box') for (const b of r.blocks) if (b.t === 'p') para(b, pa)
      if ((r.t === 'text' || r.t === 'img') && r.cm) {
        for (const id of r.cm) {
          if (!out.has(id)) out.set(id, { pa, o, quote: '' })
          // paragraphs are joined by a space
          if (!seen.has(id) && quotes.has(id)) add(id, ' ')
          seen.add(id)
          if (r.t === 'text') add(id, r.text)
        }
      }
      o += r.t === 'text' ? r.text.length : 1
    }
  }
  host.blocks.forEach((b, bi) => {
    if (b.t === 'p') para(b, String(bi))
    else if (b.t === 'tbl') b.rows.forEach((r, ri) => r.cells.forEach((c, ci) => c.blocks.forEach((x, pi) => x.t === 'p' && para(x, `${bi}.${ri}.${ci}.${pi}`))))
  })
  for (const [id, place] of out) place.quote = shorten((quotes.get(id) ?? '').replace(/\s+/g, ' ').trim())
  return out
}
