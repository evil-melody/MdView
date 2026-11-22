/**
 * Tracked "move" edits (Word's w:moveFrom / w:moveTo).
 *
 * While suggesting, cutting a text selection and pasting it elsewhere is turned into a paired
 * change: the source text stays on screen (marked `moveFrom`, struck through + grey), the pasted
 * copy is marked `moveTo` (underlined + green). Both halves share a `name` (w:name) so accepting /
 * rejecting resolves the whole move together (see track.ts resolveRuns). The worker writes the four
 * w:id / w:author / w:date / w:name attributes plus optional w:moveFromRangeStart|End and
 * w:moveToRangeStart|End markers (writer.ts trackXml).
 *
 * Scope / boundaries (documented on purpose):
 *  - text only: a selection containing an inline object (image, field, …) is not converted to a move
 *    (it falls through to the normal tracked delete + insert).
 *  - the source selection must lie within one paragraph; the target is a collapsed caret, anywhere.
 *  - the model keeps the source text (that is what a tracked deletion looks like), so offsets do not
 *    shift and no address recomputation is needed.
 *  - keyboard wiring intercepts Ctrl+X / Ctrl+V at keydown while tracking (Chromium's default
 *    clipboard action and its `insertFromPaste` beforeinput are suppressed by preventDefault).
 *    Context-menu paste / external clipboard content and drag-to-move are NOT routed through here;
 *    use the explicit moveRange / cutForMove / pasteForMove API for those cases.
 */
import type { Inline, Paragraph, TrackMark } from '../../core/docx/types'
import { normalize, runsText, splitRuns, type RRun, type Sel } from '../edit/rich'

export interface MoveReplaceOpts {
  label?: string
  history?: boolean
  want?: boolean
  remount?: boolean
}

/** the subset of DocxEditor this module drives */
export interface MoveHost {
  tracking: boolean
  author: () => string
  input: {
    sel(): Sel | null
    restore(sel: Sel | null, focus?: boolean): boolean
    lastSel: Sel | null
  }
  para(pa: string): Paragraph | undefined
  replace(pas: string[], next: Paragraph[], sel: Sel, opts?: MoveReplaceOpts): void
  shortcut?: (e: KeyboardEvent) => boolean
  // installed by installMove (kept optional so a plain DocxEditor structurally matches)
  moveRange?: (from: Sel, to: Sel) => boolean
  cutForMove?: () => Sel | null
  pasteForMove?: (to: Sel) => boolean
}

let seq = 0
function moveMarks(author: string, date: string): { from: TrackMark; to: TrackMark } {
  const name = `MdvMove${++seq}_${Date.now().toString(36)}`
  return { from: { k: 'moveFrom', author, date, name }, to: { k: 'moveTo', author, date, name } }
}

const ordered = (s: Sel) => (s.a.o <= s.f.o ? [s.a, s.f] as const : [s.f, s.a] as const)
const collapsedFrom = (s: Sel) => s.a.pa === s.f.pa && s.a.o === s.f.o

/** Only plain text can be moved; an object (image/field) would need a different tracked representation. */
function movable(p: Paragraph, a: number, b: number): { text: string; style: object; d?: object } | null {
  const [, rest] = splitRuns(p.runs as RRun[], a)
  const [mid] = splitRuns(rest, b - a)
  if (!mid.length) return null
  if (mid.some((r) => r.t !== 'text')) return null
  const text = runsText(mid)
  return text ? { text, style: (mid[0].s as object) ?? {}, d: mid[0].d } : null
}

/**
 * Applies one tracked move `from` → `to` in the model (two `replace` calls, both labelled `move`
 * so trackEdit does not re-wrap them as plain ins/del). Returns false when it is not applicable.
 */
export function applyMove(host: MoveHost, from: Sel, to: Sel): boolean {
  if (!host.tracking) return false
  if (collapsedFrom(from) || from.a.pa !== from.f.pa) return false
  if (to.a.pa !== to.f.pa || to.a.o !== to.f.o) return false
  const [s, e] = ordered(from)
  const src = host.para(s.pa)
  if (!src) return false
  const mv = movable(src, s.o, e.o)
  if (!mv) return false

  const { from: fm, to: tm } = moveMarks(host.author(), new Date().toISOString().replace(/\.\d+Z$/, 'Z'))

  // (1) source: keep the text, mark it moveFrom
  const [left, rest] = splitRuns(src.runs as RRun[], s.o)
  const [mid, right] = splitRuns(rest, e.o - s.o)
  const marked: RRun[] = mid.map((r) => ({ ...r, tc: fm }))
  const srcNext: Paragraph = { ...src, runs: normalize([...left, ...marked, ...right]) as Inline[], edited: true }
  const caret1: Sel = { a: { pa: s.pa, o: s.o }, f: { pa: s.pa, o: s.o } }
  host.replace([s.pa], [srcNext], caret1, { label: 'move', remount: true })

  // (2) target: insert the moved text marked moveTo. A target inside the source span is clamped
  // to just after it (pasting into the middle of the struck-through source is meaningless).
  const tgt = host.para(to.a.pa)
  if (!tgt) return false
  let o = to.a.o
  if (to.a.pa === s.pa && o >= s.o && o < e.o) o = e.o
  const [tl, tr] = splitRuns(tgt.runs as RRun[], o)
  const ins: RRun = { t: 'text', text: mv.text, s: mv.style, ...(mv.d ? { d: mv.d } : {}), tc: tm }
  const tgtNext: Paragraph = { ...tgt, runs: normalize([...tl, ins, ...tr]) as Inline[], edited: true }
  const caret2: Sel = { a: { pa: to.a.pa, o: o + mv.text.length }, f: { pa: to.a.pa, o: o + mv.text.length } }
  host.replace([to.a.pa], [tgtNext], caret2, { label: 'move', remount: true })
  return true
}

/** Installs the tracked-move API and the Ctrl+X / Ctrl+V shortcut on a DocxEditor. */
export function installMove(host: MoveHost): void {
  let clip: Sel | null = null

  const cutForMove = (): Sel | null => {
    if (!host.tracking) return null
    const sel = host.input.sel()
    if (!sel || collapsedFrom(sel) || sel.a.pa !== sel.f.pa) return null
    const [s, e] = ordered(sel)
    const p = host.para(s.pa)
    if (!p || !movable(p, s.o, e.o)) return null
    clip = { a: { pa: s.pa, o: s.o }, f: { pa: e.pa, o: e.o } }
    // keep the text visible until the paste completes; collapse the caret at the source start
    host.input.restore({ a: { pa: s.pa, o: s.o }, f: { pa: s.pa, o: s.o } })
    return clip
  }

  const pasteForMove = (to: Sel): boolean => {
    if (!clip) return false
    const ok = applyMove(host, clip, to)
    clip = null
    return ok
  }

  const moveRange = (from: Sel, to: Sel): boolean => applyMove(host, from, to)

  host.moveRange = moveRange
  host.cutForMove = cutForMove
  host.pasteForMove = pasteForMove
  host.shortcut = (e: KeyboardEvent): boolean => {
    if (!host.tracking || !(e.metaKey || e.ctrlKey) || e.altKey) return false
    const k = e.key.toLowerCase()
    if (k === 'x') return cutForMove() !== null
    if (k === 'v' && clip) {
      const sel = host.input.sel()
      if (!sel) return false
      return pasteForMove({ a: { ...sel.a }, f: { ...sel.a } })
    }
    return false
  }
}
