/**
 * Walks a TSWP.StorageArchive: its text split into paragraphs, each with its styles and its pieces
 * (text runs, attachments, footnote marks).
 *
 * The storage keeps one string; formatting lives in attribute tables of (character index → object) entries.
 * Indices count UTF-16 code units, like JS strings. A paragraph-style entry without object keeps the previous
 * style; a character-style entry without object ends the character style.
 */
import type { IworkPackage } from './iwa'
import type { Msg } from './proto'

export const STORAGE = new Set([2001, 2005])
const HYPERLINK = 2032

export type Seg =
  | { t: 'text'; text: string; charId?: number; href?: string }
  /** U+FFFC: a drawable, field or other attachment object */
  | { t: 'att'; id: number; charId?: number; href?: string }
  /** a footnote mark (TSWP.FootnoteReferenceAttachmentArchive) */
  | { t: 'note'; id: number; charId?: number }

export interface TextPara {
  paraId?: number
  listId?: number
  /** list level, 0-8 */
  level: number
  /** a page / section break comes before it */
  pageBreak: boolean
  segs: Seg[]
}

interface Entry {
  i: number
  ref?: number
}

/** TSWP.ObjectAttributeTable / ParaDataAttributeTable entries, in text order */
function entries(m: Msg | undefined, value: (e: Msg) => number | undefined = (e) => e.ref(2)): Entry[] {
  const out: Entry[] = []
  for (const e of m?.msgs(1) ?? []) {
    const i = e.u(1)
    if (i !== undefined) out.push({ i, ref: value(e) })
  }
  return out.sort((a, b) => a.i - b.i)
}

/** the entry in force at `pos` (last one starting at or before it) */
export function at(list: Entry[], pos: number): Entry | undefined {
  let lo = 0
  let hi = list.length - 1
  let found: Entry | undefined
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (list[mid].i <= pos) {
      found = list[mid]
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

/** entries starting in [a, b) */
function within(list: Entry[], a: number, b: number): Entry[] {
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (list[mid].i < a) lo = mid + 1
    else hi = mid
  }
  const out: Entry[] = []
  for (let k = lo; k < list.length && list[k].i < b; k++) out.push(list[k])
  return out
}

const VISIBLE = /[^\s\u0004\u0005]/g
/** paragraph ends: newline, paragraph separator, page break (5), section break (4) */
const PARA_END = /[\n\u2029\u0004\u0005]/g

/** the section (TP.SectionArchive) in force at the start of a storage */
export function firstSection(s: Msg | undefined): number | undefined {
  return at(entries(s?.msg(17)), 0)?.ref
}

/** Paragraphs of a text storage. */
export function paragraphs(pkg: IworkPackage, s: Msg): TextPara[] {
  const text = s.strs(3).join('')
  const paras: Entry[] = []
  let prev: number | undefined
  for (const e of entries(s.msg(5))) {
    prev = e.ref ?? prev
    paras.push({ i: e.i, ref: prev })
  }
  const lists = entries(s.msg(7))
  const levels = entries(s.msg(6), (e) => e.u(2) ?? 0)
  const chars = entries(s.msg(8))
  const atts = entries(s.msg(9))
  const links = entries(s.msg(11))
  const notes = entries(s.msg(16))
  const attAt = new Map(atts.map((e) => [e.i, e.ref]))
  const noteAt = new Map(notes.map((e) => [e.i, e.ref]))
  const linkAt = (pos: number): string | undefined => {
    const e = at(links, pos)
    if (!e?.ref || pkg.type(e.ref) !== HYPERLINK) return undefined
    const url = pkg.get(e.ref)?.str(2)
    return url && /^(https?|mailto|ftp|tel):/i.test(url) ? url : undefined
  }

  const out: TextPara[] = []
  let start = 0
  let pageBreak = false
  for (;;) {
    PARA_END.lastIndex = start
    const m = PARA_END.exec(text)
    const end = m ? m.index : text.length
    // the text ends with a paragraph mark: no paragraph after it (an empty storage still has one)
    if (start === text.length && out.length) break

    const cuts = new Set<number>([start, end])
    for (const list of [chars, links]) for (const e of within(list, start + 1, end)) cuts.add(e.i)
    for (const list of [atts, notes]) {
      for (const e of within(list, start, end)) {
        cuts.add(e.i)
        cuts.add(e.i + 1)
      }
    }
    const bounds = [...cuts].filter((x) => x <= end).sort((a, b) => a - b)
    const segs: Seg[] = []
    for (let k = 0; k + 1 < bounds.length; k++) {
      const a = bounds[k]
      const b = bounds[k + 1]
      const charId = at(chars, a)?.ref
      if (b === a + 1 && attAt.get(a) !== undefined) segs.push({ t: 'att', id: attAt.get(a)!, charId, href: linkAt(a) })
      else if (b === a + 1 && noteAt.get(a) !== undefined) segs.push({ t: 'note', id: noteAt.get(a)!, charId })
      else segs.push({ t: 'text', text: text.slice(a, b), charId, href: linkAt(a) })
    }
    out.push({ paraId: at(paras, start)?.ref, listId: at(lists, start)?.ref, level: Math.min(8, at(levels, start)?.ref ?? 0), pageBreak, segs })

    if (!m) break
    start = end + 1
    // a page / section break char starts the next paragraph on a new page (none after the last text)
    VISIBLE.lastIndex = start
    pageBreak = (m[0] === '\u0005' || m[0] === '\u0004') && VISIBLE.test(text)
  }
  return out
}

/** characters of a text run that have no place in the output (controls, object marks, lone surrogates) */
export function cleanText(t: string): string {
  return t.replace(/[\u0000-\u0008\u000e-\u001f\ufffc\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '')
}
