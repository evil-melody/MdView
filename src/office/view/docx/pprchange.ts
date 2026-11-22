/**
 * Paragraph-level format revisions (Word's w:pPrChange). Kept out of DocxEditor so the editor stays
 * under the single-file limit. A revision is anchored to the paragraph's format *before* the first
 * change:
 *  - `pc.old.s` is the paragraph's look at that moment (the rendering is restored from it on reject);
 *  - `pc.old.d` is the base-relative ParaDirty that writes that look back — the kernel writes the
 *    old format as `basePPr(src) + applyParaDirty(d)`, so the edit path and the read-back path
 *    produce the same XML;
 *  - `pc.old.st` is the comparable state the format now is measured against.
 *
 * The same three rules as the run level (fmtchange.ts) drive it:
 *  1. net-zero diff dissolves the revision (centre → left → no w:pPrChange);
 *  2. every change is measured against the anchor, never accumulated;
 *  3. reject restores the look and the increment together, so the view and the written XML agree.
 */
import type { PPrChange, ParaDirty, ParaFmtState, ParaStyle, Paragraph } from '../../core/docx/types'

export type ParaMark = { author?: string; date?: string }

/** the tracked paragraph-format keys */
const KEYS = ['align', 'indL', 'before', 'after', 'line', 'style', 'list', 'ilvl', 'pageBreak'] as const
type Key = (typeof KEYS)[number]

const LABEL: Record<Key, string> = {
  align: '对齐',
  indL: '缩进',
  before: '段前间距',
  after: '段后间距',
  line: '行距',
  style: '段落样式',
  list: '编号',
  ilvl: '列表级别',
  pageBreak: '分页',
}

/** The paragraph's comparable format state: the values it really shows. */
export function stateOf(p: Paragraph): ParaFmtState {
  return {
    align: p.ps.align ?? 'left',
    indL: p.ps.indL,
    before: p.ps.before,
    after: p.ps.after,
    line: p.ps.line,
    style: p.sid,
    list: p.lst,
    ilvl: p.ilvl,
    pageBreak: p.pb === true || p.pd?.pageBreak === true,
  }
}

/**
 * The state a paragraph-format patch leads to. A null means "the style decides now", which is not
 * known here: the value the paragraph showed is kept (the difference is invisible anyway).
 */
export function stateWith(st: ParaFmtState, patch: ParaDirty): ParaFmtState {
  const out: ParaFmtState = { ...st }
  if (patch.align) out.align = patch.align
  if (patch.indL !== undefined && patch.indL !== null) out.indL = patch.indL
  if (patch.before !== undefined && patch.before !== null) out.before = patch.before
  if (patch.after !== undefined && patch.after !== null) out.after = patch.after
  if (patch.line !== undefined && patch.line !== null) out.line = patch.line
  if (patch.style !== undefined) out.style = patch.style || undefined
  if (patch.list !== undefined) out.list = patch.list === 'none' ? undefined : patch.list
  if (patch.ilvl !== undefined) out.ilvl = patch.ilvl
  if (patch.pageBreak !== undefined) out.pageBreak = patch.pageBreak
  return out
}

/** One key of two states compared the way it shows. */
function sameKey(a: ParaFmtState, b: ParaFmtState, k: Key): boolean {
  switch (k) {
    case 'align': return (a.align ?? 'left') === (b.align ?? 'left')
    case 'style': return (a.style ?? '') === (b.style ?? '')
    case 'list': return (a.list ?? '') === (b.list ?? '')
    case 'ilvl': return (a.ilvl ?? 0) === (b.ilvl ?? 0)
    case 'pageBreak': return !!a.pageBreak === !!b.pageBreak
    default: return (a[k] ?? 0) === (b[k] ?? 0)
  }
}

/** True when the two states show the same format (an empty diff dissolves the revision). */
export function stateSame(a: ParaFmtState, b: ParaFmtState): boolean {
  return KEYS.every((k) => sameKey(a, b, k))
}

/** The labels of the properties that differ. */
export function fmtDiff(a: ParaFmtState, b: ParaFmtState): string[] {
  return KEYS.filter((k) => !sameKey(a, b, k)).map((k) => LABEL[k])
}

/** Hover title of the rendered paragraph revision. */
export function pprChangeDesc(a: ParaFmtState, b: ParaFmtState): string {
  const parts = fmtDiff(a, b)
  return parts.length ? `段落格式已更改：${parts.join('、')}` : '段落格式已更改'
}

/** The look a paragraph-format patch gives the paragraph (the style's own values are not known here). */
function paraPatchStyle(patch: ParaDirty): Partial<ParaStyle> {
  const out: Partial<ParaStyle> = {}
  if (patch.align !== undefined) out.align = patch.align ?? undefined
  if (patch.indL !== undefined) out.indL = patch.indL ?? undefined
  if (patch.before !== undefined) out.before = patch.before ?? undefined
  if (patch.after !== undefined) out.after = patch.after ?? undefined
  if (patch.line !== undefined) out.line = patch.line ?? undefined
  return out
}

/**
 * The paragraph with a format change applied. The revision is captured once — the first change
 * anchors the format the paragraph had before it — and every later change is measured against that
 * anchor. A net-zero diff dissolves the revision again.
 */
export function applyParaPatch(p: Paragraph, patch: ParaDirty, optimistic: Partial<ParaStyle> = {}, mark?: ParaMark): Paragraph {
  const pd: ParaDirty = { ...(p.pd ?? {}), ...patch }
  const ps: ParaStyle = { ...p.ps, ...paraPatchStyle(patch), ...optimistic }
  const out: Paragraph = { ...p, pd, ps, sid: patch.style ?? p.sid, edited: true }
  if (!mark) return out
  const pc = p.pc
  const now = stateWith(pc?.cur ?? stateOf(p), patch)
  if (pc) {
    // the anchor stays: the change is measured against the format it captured
    if (stateSame(pc.old.st, now)) {
      const { pc: _pc, ...plain } = out
      return plain as Paragraph
    }
    return { ...out, pc: { ...pc, cur: now } }
  }
  // the first change anchors the format the paragraph had before it
  const anchor: PPrChange = {
    author: mark.author,
    date: mark.date,
    old: { s: { ...p.ps }, d: { ...(p.pd ?? {}) }, sid: p.sid, st: stateOf(p) },
    cur: now,
  }
  return { ...out, pc: anchor }
}

/**
 * Accepts (drops the revision, the new format stays) or rejects (restores the look and the
 * increment in pair, so the view and the written XML agree) a paragraph-format revision.
 */
export function resolvePara(p: Paragraph, accept: boolean): Paragraph {
  const pc = p.pc
  if (!pc) return p
  const { pc: _pc, ...plain } = p
  if (accept) return plain as Paragraph
  return { ...plain, ps: { ...pc.old.s }, pd: { ...pc.old.d }, sid: pc.old.sid ?? plain.sid } as Paragraph
}
