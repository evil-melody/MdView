/**
 * XLSX comments: threaded comments (`xl/threadedComments/*.xml`, authors in `xl/persons/person.xml`) and, for every
 * thread, the legacy comment Excel keeps next to it (`xl/comments*.xml` + its VML shape) so older readers show it too.
 * Notes (legacy comments without a thread) are read as one-comment threads; once a note is answered or changed it is
 * written as a threaded comment, with an id derived from where it was so it keeps that id.
 */
import { CommentStore, type DocComment } from '../comments'
import { relOfType, relsOfType, relsPathFor, type OpcPackage, type Rels } from '../opc'
import { escAttr, escText } from '../raw'
import type { PartData } from '../zipwrite'
import { kid, kids, textOf, type XEl } from '../xml'
import type { SheetInfo } from './types'
import { colName, parseRef } from './workbook'

const REL_THREADED = 'http://schemas.microsoft.com/office/2017/10/relationships/threadedComment'
const REL_PERSON = 'http://schemas.microsoft.com/office/2017/10/relationships/person'
const REL_COMMENTS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments'
const REL_VML = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing'
const CT_THREADED = 'application/vnd.ms-excel.threadedcomments+xml'
const CT_PERSON = 'application/vnd.ms-excel.person+xml'
const CT_COMMENTS = 'application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml'
const CT_VML = 'application/vnd.openxmlformats-officedocument.vmlDrawing'
const TC_NS = 'http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments'
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'

interface Person {
  id: string
  name: string
  userId?: string
  providerId?: string
}

/** what a comment was read from: a note keeps its own element (rich text) and author */
interface XlsxOrig {
  sheet: string
  note?: { xml: string; author: string }
}

export class XlsxComments extends CommentStore<XlsxOrig> {
  /** persons as read (and added), by GUID */
  readonly persons = new Map<string, Person>()
  personsPath?: string
  /** sheet path → its comment parts as found / written (`linked`: the sheet's <legacyDrawing> was added here) */
  readonly parts = new Map<string, { threaded?: string; legacy?: string; vml?: string; vmlRid?: string; linked?: boolean }>()
}

/** the <comment> elements of a legacy comments part as source text, by cell */
function rawNotes(xml: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /<(\w+:)?comment\b[^>]*?(\/>|>[\s\S]*?<\/\1comment>)/g
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const ref = /\sref="([^"]+)"/.exec(m[0].slice(0, m[0].indexOf('>') + 1))
    if (ref) out.set(ref[1].toUpperCase(), m[0])
  }
  return out
}

/** a GUID for a note at `ref` of `sheet`: the same every time the file is read */
function noteId(sheet: string, ref: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (const ch of `${sheet}!${ref}`) {
    const c = ch.codePointAt(0)!
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0
  }
  const x = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + (h1 ^ h2).toString(16).padStart(8, '0')).toUpperCase()
  return `{${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-8${x.slice(17, 20)}-${x.slice(20, 24)}00000000}`
}

/** Excel's dates have no zone and are UTC */
const readTime = (v: string | undefined) => (v ? (/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : v.replace(/(\.\d+)?$/, 'Z')) : '')
const writeTime = (v: string) => (v ? v.replace(/(\.\d+)?Z$/, '.00') : '')

/** text of a legacy comment: its runs; Excel puts the author's name first ("Ann:\n") */
const legacyText = (c: XEl) => {
  const t = kid(c, 'text')
  if (!t) return ''
  const rs = kids(t, 'r')
  return rs.length ? rs.map((r) => textOf(kid(r, 't'))).join('') : textOf(kid(t, 't'))
}

export async function readXlsxComments(pkg: OpcPackage, wbPath: string, wbRels: Rels, sheets: SheetInfo[]): Promise<XlsxComments> {
  const store = new XlsxComments()
  const pr = relOfType(wbRels, 'person')
  if (pr && !pr.external && pkg.has(pr.target)) {
    store.personsPath = pr.target
    for (const p of kids(await pkg.xml(pr.target), 'person')) if (p.a.id) store.persons.set(p.a.id, { id: p.a.id, name: p.a.displayName ?? '', userId: p.a.userId, providerId: p.a.providerId })
  }
  void wbPath
  const author = (personId: string | undefined) => {
    const p = personId ? store.persons.get(personId) : undefined
    if (!p) return { name: 'Unknown' }
    return p.userId && p.providerId === 'None' && p.userId !== p.name ? { name: p.name, id: p.userId } : { name: p.name }
  }
  for (const s of sheets) {
    const rels = await pkg.rels(s.path)
    const part = (type: string) => {
      const r = [...rels.values()].find((x) => x.type === type && !x.external && pkg.has(x.target))
      return r?.target
    }
    const threaded = relsOfType(rels, 'threadedComment').filter((r) => !r.external && pkg.has(r.target))
    const legacy = part(REL_COMMENTS)
    const vmlRel = [...rels.values()].find((x) => x.type === REL_VML)
    store.parts.set(s.path, { threaded: threaded[0]?.target, legacy, vml: vmlRel?.target, vmlRid: vmlRel?.id })
    const refs = new Set<string>()
    for (const r of threaded) {
      for (const c of kids(await pkg.xml(r.target), 'threadedComment')) {
        const id = c.a.id
        const ref = c.a.ref
        if (!id || !ref || store.map.has(id)) continue
        const [row, col] = parseRef(ref)
        const text = textOf(kid(c, 'text'))
        const dc: DocComment = { id, author: author(c.a.personId), time: readTime(c.a.dT), text }
        if (c.a.parentId) dc.parent = c.a.parentId
        else dc.at = { sheet: s.path, r: row, c: col }
        if (c.a.done === '1' || c.a.done === 'true') dc.done = true
        const ms = kids(kid(c, 'mentions'), 'mention')
          .map((m) => store.persons.get(m.a.mentionpersonId ?? ''))
          .filter((p): p is Person => !!p)
          .map((p) => author(p.id))
        if (ms.length) dc.mentions = ms
        store.map.set(id, dc)
        store.orig.set(id, { sheet: s.path })
        refs.add(ref.toUpperCase())
      }
    }
    if (legacy) {
      const raw = rawNotes(await pkg.text(legacy))
      const root = await pkg.xml(legacy)
      const authors = kids(kid(root, 'authors'), 'author').map((a) => a.t)
      for (const c of kids(kid(root, 'commentList'), 'comment')) {
        const ref = c.a.ref
        if (!ref || refs.has(ref.toUpperCase())) continue
        const name = authors[Number(c.a.authorId)] ?? ''
        // the legacy copy of a threaded comment whose thread part is missing: not a note of its own
        if (name.startsWith('tc=')) continue
        const id = noteId(s.path, ref.toUpperCase())
        const [row, col] = parseRef(ref)
        let text = legacyText(c)
        // "Ann:\n…": the author's name is part of a note's text
        if (name && text.startsWith(name + ':')) text = text.slice(name.length + 1).replace(/^\r?\n/, '')
        store.map.set(id, { id, author: { name: name || 'Unknown' }, time: '', text, at: { sheet: s.path, r: row, c: col } })
        const xml = raw.get(ref.toUpperCase())
        store.orig.set(id, xml ? { sheet: s.path, note: { xml, author: name } } : { sheet: s.path })
      }
    }
  }
  return store
}

// ---------------------------------------------------------------- writing

const guidRe = /^\{[0-9A-F-]{36}\}$/i
const randGuid = () => {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  const h = [...a].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `{${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}}`
}

/** the person (GUID) of a comment author, added to the list when new */
function personOf(store: XlsxComments, u: { name: string; id?: string }): string {
  const uid = u.id ?? u.name
  for (const p of store.persons.values()) if (p.name === u.name && (p.userId ?? p.name) === uid) return p.id
  if (!u.id) for (const p of store.persons.values()) if (p.name === u.name) return p.id
  const id = randGuid()
  store.persons.set(id, { id, name: u.name, userId: uid, providerId: 'None' })
  return id
}

const LEGACY_NOTE =
  'Your version of Excel allows you to read this threaded comment; however, any edits to it will get removed if the file is opened in a newer version of Excel. Learn more: https://go.microsoft.com/fwlink/?linkid=870924'

function legacyBody(root: DocComment, replies: DocComment[]): string {
  let t = `[Threaded comment]\n\n${LEGACY_NOTE}\n\nComment:\n    ${root.text}`
  for (const r of replies) t += `\nReply:\n    ${r.text}`
  return t
}

function vmlShape(n: number, r: number, c: number): string {
  return (
    `<v:shape id="_x0000_s${n}" type="#_x0000_t202" style="position:absolute;margin-left:59.25pt;margin-top:1.5pt;width:108pt;height:59.25pt;z-index:${n % 1024};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto">` +
    `<v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/>` +
    `<v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox>` +
    `<x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>${c + 1}, 15, ${r}, 2, ${c + 3}, 15, ${r + 4}, 16</x:Anchor>` +
    `<x:AutoFill>False</x:AutoFill><x:Row>${r}</x:Row><x:Column>${c}</x:Column></x:ClientData></v:shape>`
  )
}

const VML_HEAD = (block: number) =>
  `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
  `<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="${block}"/></o:shapelayout>` +
  `<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>`

/** VML of a sheet with its note shapes replaced by `shapes` (other drawings in it stay) */
function vmlWith(old: string | undefined, shapes: string, block: number): string {
  if (!old) return `${VML_HEAD(block)}${shapes}</xml>`
  const kept = old.replace(/<v:shape\b(?:(?!<\/v:shape>)[\s\S])*?ObjectType="Note"[\s\S]*?<\/v:shape>/g, '')
  const end = kept.lastIndexOf('</xml>')
  if (end < 0) return `${VML_HEAD(block)}${shapes}</xml>`
  const head = /<v:shapetype\b[^>]*\bid="_x0000_t202"/.test(kept) ? '' : VML_HEAD(block).replace(/^<xml[^>]*>/, '').replace(/<o:shapelayout[\s\S]*?<\/o:shapelayout>/, '')
  return kept.slice(0, end) + head + shapes + kept.slice(end)
}

const TAIL_BEFORE = ['legacyDrawingHF', 'drawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst']

/** the part of a sheet after </sheetData> with its <legacyDrawing> pointing at `rid` (null: none) */
function fixTail(tail: string, P: string, rid: string | null): string {
  const re = /<(\w+:)?legacyDrawing\b[^>]*?\/>|<(\w+:)?legacyDrawing\b[^>]*>[\s\S]*?<\/(\w+:)?legacyDrawing>/
  const xml = rid ? `<${P}legacyDrawing r:id="${rid}"/>` : ''
  if (re.test(tail)) return tail.replace(re, xml)
  if (!rid) return tail
  let at = -1
  for (const name of TAIL_BEFORE) {
    const m = new RegExp(`<(\\w+:)?${name}\\b`).exec(tail)
    if (m && (at < 0 || m.index < at)) at = m.index
  }
  if (at < 0) at = tail.lastIndexOf('</')
  return tail.slice(0, at) + xml + tail.slice(at)
}

/** a stream of `src` with the text after </sheetData> passed through `fix` (and the root given the r: namespace) */
function patchTail(src: () => Promise<ReadableStream<Uint8Array>>, fix: (tail: string, P: string) => string): () => ReadableStream<Uint8Array> {
  return () => {
    const enc = new TextEncoder()
    return new ReadableStream<Uint8Array>({
      async start(ctrl) {
        const reader = (await src()).getReader()
        const dec = new TextDecoder()
        let head = true
        let buf = ''
        let P = ''
        let rootFixed = false
        for (;;) {
          const { done, value } = await reader.read()
          buf += done ? dec.decode() : dec.decode(value, { stream: true })
          if (!rootFixed) {
            const m = /<([\w.-]+:)?worksheet\b[^>]*>/.exec(buf)
            if (!m) {
              if (!done) continue
            } else {
              rootFixed = true
              P = m[1] ?? ''
              if (!/\sxmlns:r="/.test(m[0])) buf = buf.slice(0, m.index) + m[0].replace(/(\/?)>$/, ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"$1>') + buf.slice(m.index + m[0].length)
            }
          }
          if (head) {
            const close = new RegExp(`</${P.replace('.', '\\.')}sheetData>|<${P.replace('.', '\\.')}sheetData\\b[^>]*/>`).exec(buf)
            if (close) {
              ctrl.enqueue(enc.encode(buf.slice(0, close.index + close[0].length)))
              buf = buf.slice(close.index + close[0].length)
              head = false
            } else if (buf.length > 64 && !done) {
              // keep enough to find a closing tag cut between chunks
              ctrl.enqueue(enc.encode(buf.slice(0, buf.length - 64)))
              buf = buf.slice(buf.length - 64)
            }
          }
          if (done) break
        }
        ctrl.enqueue(enc.encode(head ? buf : fix(buf, P)))
        ctrl.close()
      },
    })
  }
}

/** sheet parts this module wrapped, and what each wrapped: saving again starts from that, not from the wrapper */
const wrapped = new WeakMap<object, PartData | undefined>()

function toStream(d: PartData): Promise<ReadableStream<Uint8Array>> {
  if (typeof d === 'function') return Promise.resolve(d())
  const bytes = typeof d === 'string' ? new TextEncoder().encode(d) : d
  return Promise.resolve(
    new ReadableStream({
      start(c) {
        c.enqueue(bytes)
        c.close()
      },
    }),
  )
}

/** points sheet `path` at its legacy drawing `rid` (null: none) */
function linkSheet(pkg: OpcPackage, path: string, rid: string | null) {
  let cur = pkg.changed(path)
  if (cur === null) return
  if (cur !== undefined && typeof cur === 'function' && wrapped.has(cur)) cur = wrapped.get(cur)
  const base = cur
  const fn = patchTail(() => (base === undefined ? pkg.zip.stream(path) : toStream(base)), (tail, P) => fixTail(tail, P, rid))
  wrapped.set(fn, base)
  pkg.setPart(path, fn)
}

/**
 * Writes the comments of every sheet that has (or had) some: threaded comments, persons, the legacy comments with their
 * VML. Sheets that keep no comment lose those parts.
 */
export async function writeXlsxComments(pkg: OpcPackage, wbPath: string, store: XlsxComments, sheets: SheetInfo[]): Promise<void> {
  const threads = store.threads()
  const bySheet = new Map<string, typeof threads>()
  for (const t of threads) {
    const at = t.root.at
    if (!at || !('sheet' in at) || !sheets.some((s) => s.path === at.sheet)) continue
    let list = bySheet.get(at.sheet)
    if (!list) bySheet.set(at.sheet, (list = []))
    list.push(t)
  }
  let block = 0
  for (const s of sheets) {
    block++
    const list = (bySheet.get(s.path) ?? []).sort((a, b) => {
      const x = a.root.at as { r: number; c: number }
      const y = b.root.at as { r: number; c: number }
      return x.r - y.r || x.c - y.c
    })
    const parts = store.parts.get(s.path) ?? {}
    store.parts.set(s.path, parts)
    if (!list.length && !parts.threaded && !parts.legacy) continue
    if (!list.length) {
      // the sheet's last comment went; a drawing that also holds other shapes (form controls) stays, without the notes
      const oldVml = parts.vml && pkg.has(parts.vml) ? await pkg.text(parts.vml) : undefined
      const rest = oldVml && vmlWith(oldVml, '', block)
      const keepVml = !!rest && /<v:shape\b/.test(rest)
      for (const p of [parts.threaded, parts.legacy, keepVml ? undefined : parts.vml]) {
        if (!p) continue
        pkg.setPart(p, null)
        await pkg.removeRelsTo(s.path, p)
        await pkg.setContentType(p, null)
      }
      if (keepVml) {
        pkg.setPart(parts.vml!, rest)
        store.parts.set(s.path, { vml: parts.vml, vmlRid: parts.vmlRid })
      } else {
        store.parts.set(s.path, {})
        linkSheet(pkg, s.path, null)
      }
      continue
    }
    // one thread per cell: a second root on a cell answers the first (Excel shows one)
    const cells = new Map<string, { root: DocComment; replies: DocComment[] }>()
    for (const t of list) {
      const at = t.root.at as { r: number; c: number }
      const ref = colName(at.c) + (at.r + 1)
      const had = cells.get(ref)
      if (had) had.replies.push({ ...t.root, parent: had.root.id }, ...t.replies)
      else cells.set(ref, { root: t.root, replies: [...t.replies] })
    }
    let tc = ''
    let legacy = ''
    let vml = ''
    const authors: string[] = []
    let shape = block * 1024
    for (const [ref, { root, replies }] of cells) {
      const [r, c] = parseRef(ref)
      vml += vmlShape(++shape, r, c)
      // a note nobody answered or changed stays a note
      const note = !replies.length && store.pristine(root.id) ? store.orig.get(root.id)?.note : undefined
      if (note) {
        let k = authors.indexOf(note.author)
        if (k < 0) k = authors.push(note.author) - 1
        legacy += note.xml.replace(/\sauthorId="\d+"/, ` authorId="${k}"`)
        continue
      }
      for (const c of [root, ...replies]) {
        const pid = personOf(store, c.author)
        const id = guidRe.test(c.id) ? c.id : randGuid()
        let mentions = ''
        for (const m of c.mentions ?? []) {
          const i = c.text.indexOf('@' + m.name)
          if (i < 0) continue
          mentions += `<mention mentionpersonId="${personOf(store, m)}" mentionId="${randGuid()}" startIndex="${i}" length="${m.name.length + 1}"/>`
        }
        tc +=
          `<threadedComment ref="${ref}" dT="${escAttr(writeTime(c.time))}" personId="${pid}" id="${id}"${c === root ? '' : ` parentId="${root.id}"`}${c === root && c.done ? ' done="1"' : ''}>` +
          `<text>${escText(c.text)}</text>${mentions ? `<mentions>${mentions}</mentions>` : ''}</threadedComment>`
      }
      const tcAuthor = `tc=${root.id}`
      authors.push(tcAuthor)
      legacy += `<comment ref="${ref}" authorId="${authors.length - 1}" shapeId="0"><text><t xml:space="preserve">${escText(legacyBody(root, replies))}</t></text></comment>`
    }
    const threadedXml = `${XML_HEAD}<ThreadedComments xmlns="${TC_NS}" xmlns:x="${MAIN_NS}">${tc}</ThreadedComments>`
    const legacyXml = `${XML_HEAD}<comments xmlns="${MAIN_NS}"><authors>${authors.map((a) => `<author>${escText(a)}</author>`).join('')}</authors><commentList>${legacy}</commentList></comments>`
    if (tc) {
      if (!parts.threaded) {
        parts.threaded = pkg.freeName('xl/threadedComments', 'threadedComment', 'xml')
        await pkg.addRel(s.path, REL_THREADED, parts.threaded)
        await pkg.setContentType(parts.threaded, CT_THREADED)
      }
      pkg.setPart(parts.threaded, threadedXml)
    } else if (parts.threaded) {
      pkg.setPart(parts.threaded, null)
      await pkg.removeRelsTo(s.path, parts.threaded)
      await pkg.setContentType(parts.threaded, null)
      parts.threaded = undefined
    }
    if (!parts.legacy) {
      parts.legacy = pkg.freeName('xl', 'comments', 'xml')
      await pkg.addRel(s.path, REL_COMMENTS, parts.legacy)
      await pkg.setContentType(parts.legacy, CT_COMMENTS)
    }
    pkg.setPart(parts.legacy, legacyXml)
    const oldVml = parts.vml && pkg.has(parts.vml) ? await pkg.text(parts.vml) : undefined
    if (!parts.vml) {
      parts.vml = pkg.freeName('xl/drawings', 'vmlDrawing', 'vml')
      parts.vmlRid = await pkg.addRel(s.path, REL_VML, parts.vml)
      await pkg.ensureDefaultType('vml', CT_VML)
      parts.linked = true
    } else if (!parts.vmlRid) {
      parts.vmlRid = [...(await pkg.rels(s.path)).values()].find((x) => x.type === REL_VML)?.id
    }
    // a sheet written again from its source (edited cells) needs the link again
    if (parts.linked && parts.vmlRid) linkSheet(pkg, s.path, parts.vmlRid)
    pkg.setPart(parts.vml, vmlWith(oldVml, vml, block))
  }
  // persons: everyone who wrote or is mentioned
  if (store.persons.size) {
    const xml = `${XML_HEAD}<personList xmlns="${TC_NS}" xmlns:x="${MAIN_NS}">${[...store.persons.values()]
      .map((p) => `<person displayName="${escAttr(p.name)}" id="${p.id}"${p.userId ? ` userId="${escAttr(p.userId)}"` : ''}${p.providerId ? ` providerId="${escAttr(p.providerId)}"` : ''}/>`)
      .join('')}</personList>`
    if (!store.personsPath) {
      store.personsPath = 'xl/persons/person.xml'
      if (pkg.has(store.personsPath)) store.personsPath = pkg.freeName('xl/persons', 'person', 'xml')
      await pkg.addRel(wbPath, REL_PERSON, store.personsPath)
      await pkg.setContentType(store.personsPath, CT_PERSON)
    }
    pkg.setPart(store.personsPath, xml)
  }
  void relsPathFor
}
