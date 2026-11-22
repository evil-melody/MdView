/**
 * PPTX comments: modern comments (`ppt/comments/modernComment_*.xml` per slide, authors in `ppt/authors.xml`) with
 * replies and resolved state; legacy comments (`ppt/comments/comment*.xml`, `ppt/commentAuthors.xml`) are read as
 * one-comment threads. A slide's comments are written back as modern comments only (PowerPoint repairs a file that has
 * both for the same slide).
 *
 * A thread points at a point of its slide, in slide pixels (96 per inch, as the slide model).
 */
import { CommentStore, mentionsIn, type DocComment } from '../comments'
import { relsOfType, type OpcPackage, type Rels } from '../opc'
import { escAttr, escText } from '../raw'
import { EMU_PER_PX } from '../units'
import { kid, kids, num, textOf, type XEl } from '../xml'

const P188 = 'http://schemas.microsoft.com/office/powerpoint/2018/8/main'
const PC = 'http://schemas.microsoft.com/office/powerpoint/2013/main/command'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const REL_MODERN = 'http://schemas.microsoft.com/office/2018/10/relationships/comments'
const REL_AUTHORS = 'http://schemas.microsoft.com/office/2018/10/relationships/authors'
const REL_LEGACY = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments'
const CT_MODERN = 'application/vnd.ms-powerpoint.comments+xml'
const CT_AUTHORS = 'application/vnd.ms-powerpoint.authors+xml'
const EXT_URI = '{6950BFC3-D8DA-4A85-94F7-54DA5524770B}'
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'

interface Author {
  id: string
  name: string
  initials?: string
  userId?: string
  providerId?: string
}

/** what a modern comment was read from: its anchor and position as written (they may point at a shape) */
interface PptxOrig {
  slide: string
  anchor?: string
  pos?: string
  /** the position read, in slide px (the anchor is written back while the thread stays there) */
  x?: number
  y?: number
}

export class PptxComments extends CommentStore<PptxOrig> {
  readonly authors = new Map<string, Author>()
  authorsPath?: string
}

const isModern = (type: string) => type === REL_MODERN
const isLegacy = (type: string) => type === REL_LEGACY

/** plain text of a DrawingML text body: paragraphs joined by new lines */
const bodyText = (tx: XEl | undefined) =>
  kids(tx, 'p')
    .map((p) => p.c.map((r) => (r.n === 'r' || r.n === 'fld' ? textOf(kid(r, 't')) : r.n === 'br' ? '\n' : '')).join(''))
    .join('\n')

const readTime = (v: string | undefined) => (v ? (/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : v.replace(/(\.\d+)?$/, 'Z')) : '')
const writeTime = (v: string) => (v ? v.replace(/(\.\d+)?Z$/, '.000') : '')

/** a GUID for a legacy comment: the same every time the file is read */
function legacyId(slide: string, key: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (const ch of `${slide}#${key}`) {
    const c = ch.codePointAt(0)!
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0
  }
  const x = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + (h1 ^ h2).toString(16).padStart(8, '0')).toUpperCase()
  return `{${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-9${x.slice(17, 20)}-${x.slice(20, 24)}00000000}`
}

/** the top left corner (px) of the shape a moniker list names (`id` of its cNvPr), if the slide has it */
function shapeOrigin(slideXml: string, anchor: string): { x: number; y: number } | null {
  const m = /<(?:\w+:)?(?:sp|pic|grpSp|graphicFrame|cxnSp)Mk\b[^>]*\sid="(\d+)"/.exec(anchor)
  if (!m) return null
  const at = new RegExp(`<(?:\\w+:)?cNvPr\\b[^>]*\\sid="${m[1]}"`).exec(slideXml)
  if (!at) return null
  const off = /<(?:\w+:)?off\b[^>]*\sx="(-?\d+)"[^>]*\sy="(-?\d+)"/.exec(slideXml.slice(at.index))
  return off ? { x: Number(off[1]) / EMU_PER_PX, y: Number(off[2]) / EMU_PER_PX } : null
}

export async function readPptxComments(pkg: OpcPackage, presRels: Rels, slides: { path: string }[], size: { w: number; h: number }): Promise<PptxComments> {
  const store = new PptxComments()
  const ar = relsOfType(presRels, 'authors').find((r) => r.type === REL_AUTHORS && !r.external && pkg.has(r.target))
  if (ar) {
    store.authorsPath = ar.target
    for (const a of kids(await pkg.xml(ar.target), 'author')) if (a.a.id) store.authors.set(a.a.id, { id: a.a.id, name: a.a.name ?? '', initials: a.a.initials, userId: a.a.userId, providerId: a.a.providerId })
  }
  const legacyAuthors = new Map<string, { name: string; initials?: string }>()
  const la = relsOfType(presRels, 'commentAuthors').find((r) => !r.external && pkg.has(r.target))
  if (la) for (const a of kids(await pkg.xml(la.target), 'cmAuthor')) legacyAuthors.set(a.a.id ?? '', { name: a.a.name ?? '', initials: a.a.initials })
  const author = (id: string | undefined) => {
    const a = id ? store.authors.get(id) : undefined
    if (!a) return { name: 'Unknown' }
    const u: DocComment['author'] = { name: a.name }
    if (a.initials) u.initials = a.initials
    if (a.userId && a.providerId === 'None' && a.userId !== a.name) u.id = a.userId
    return u
  }
  const clampX = (x: number) => Math.max(0, Math.min(size.w - 1, x))
  const clampY = (y: number) => Math.max(0, Math.min(size.h - 1, y))
  for (const s of slides) {
    const rels = [...(await pkg.rels(s.path)).values()].filter((r) => !r.external && pkg.has(r.target))
    let slideXml: string | undefined
    for (const r of rels.filter((x) => isModern(x.type))) {
      const text = await pkg.text(r.target)
      for (const cm of kids(await pkg.xml(r.target), 'cm')) {
        const id = cm.a.id
        if (!id || store.map.has(id)) continue
        const raw = new RegExp(`<(\\w+:)?cm\\b[^>]*\\sid="${id.replace(/[{}]/g, '\\$&')}"[\\s\\S]*?<\\/\\1cm>`).exec(text)?.[0] ?? ''
        const anchor = /<(\w+:)?(sldMkLst|deMkLst|txMkLst|unknownAnchor)\b(?:[^>]*\/>|[\s\S]*?<\/\1\2>)/.exec(raw)?.[0]
        const posRaw = /<(\w+:)?pos\b[^>]*\/>/.exec(raw.replace(/<(\w+:)?replyLst\b[\s\S]*?<\/\1replyLst>/, ''))?.[0]
        const pos = kid(cm, 'pos')
        let x = num(pos?.a.x, 0)! / EMU_PER_PX
        let y = num(pos?.a.y, 0)! / EMU_PER_PX
        if (anchor && !/sldMkLst/.test(anchor.slice(0, 20))) {
          // the position is relative to the shape the comment points at
          slideXml ??= await pkg.text(s.path)
          const o = shapeOrigin(slideXml, anchor)
          if (o) {
            x += o.x
            y += o.y
          }
        }
        x = clampX(x)
        y = clampY(y)
        const root: DocComment = { id, author: author(cm.a.authorId), time: readTime(cm.a.created), text: bodyText(kid(cm, 'txBody')), at: { slide: s.path, x, y } }
        if (cm.a.status === 'resolved' || cm.a.status === 'closed') root.done = true
        store.map.set(id, root)
        store.orig.set(id, { slide: s.path, anchor, pos: posRaw, x, y })
        for (const rp of kids(kid(cm, 'replyLst'), 'reply')) {
          if (!rp.a.id || store.map.has(rp.a.id)) continue
          store.map.set(rp.a.id, { id: rp.a.id, parent: id, author: author(rp.a.authorId), time: readTime(rp.a.created), text: bodyText(kid(rp, 'txBody')) })
          store.orig.set(rp.a.id, { slide: s.path })
        }
      }
    }
    for (const r of rels.filter((x) => isLegacy(x.type))) {
      for (const cm of kids(await pkg.xml(r.target), 'cm')) {
        const id = legacyId(s.path, `${cm.a.authorId}:${cm.a.idx}`)
        if (store.map.has(id)) continue
        const pos = kid(cm, 'pos')
        const a = legacyAuthors.get(cm.a.authorId ?? '')
        const u: DocComment['author'] = { name: a?.name || 'Unknown' }
        if (a?.initials) u.initials = a.initials
        // legacy positions are in master units (576 per inch)
        const x = clampX((num(pos?.a.x, 0)! * 96) / 576)
        const y = clampY((num(pos?.a.y, 0)! * 96) / 576)
        store.map.set(id, { id, author: u, time: readTime(cm.a.dt), text: textOf(kid(cm, 'text')), at: { slide: s.path, x, y } })
        store.orig.set(id, { slide: s.path })
      }
    }
  }
  // the people mentioned are listed with the authors
  const people = [...store.authors.values()].map((a) => author(a.id))
  for (const c of store.map.values()) {
    const m = mentionsIn(c.text, people)
    if (m) c.mentions = m
  }
  return store
}

// ---------------------------------------------------------------- writing

const randGuid = () => {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  const h = [...a].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `{${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}}`
}

function authorOf(store: PptxComments, u: DocComment['author']): string {
  const uid = u.id ?? u.name
  for (const a of store.authors.values()) if (a.name === u.name && (a.userId ?? a.name) === uid) return a.id
  if (!u.id) for (const a of store.authors.values()) if (a.name === u.name) return a.id
  const id = randGuid()
  store.authors.set(id, { id, name: u.name, initials: u.initials, userId: uid, providerId: 'None' })
  return id
}

const txBody = (text: string) =>
  `<p188:txBody><a:bodyPr/><a:lstStyle/>${text
    .split('\n')
    .map((l) => (l ? `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escText(l)}</a:t></a:r></a:p>` : '<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>'))
    .join('')}</p188:txBody>`

/** slide id (presentation.xml) and creation id (slide extension) PowerPoint names a slide by */
async function slideMonikers(pkg: OpcPackage, presPath: string, slide: string): Promise<{ sldId: string; cId: string }> {
  const pres = await pkg.text(presPath)
  const rels = await pkg.rels(presPath)
  let sldId = '256'
  for (const m of pres.matchAll(/<(?:\w+:)?sldId\b[^>]*>/g)) {
    const rid = /\s(?:\w+:)?id="(rId[^"]*)"/.exec(m[0])?.[1] ?? /\sr:id="([^"]*)"/.exec(m[0])?.[1]
    if (rid && rels.get(rid)?.target === slide) sldId = /\sid="(\d+)"/.exec(m[0])?.[1] ?? sldId
  }
  const cId = /creationId\b[^>]*\sval="(\d+)"/.exec(await pkg.text(slide))?.[1]
  let h = 0
  for (const ch of slide) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0
  return { sldId, cId: cId ?? String(h % 4_000_000_000) }
}

/** the slide's extension list pointing at its comments part `rid` (null: at none) */
function linkSlide(xml: string, rid: string | null): string {
  const ext = new RegExp(`<(\\w+:)?ext\\b[^>]*uri="${EXT_URI.replace(/[{}]/g, '\\$&')}"[\\s\\S]*?<\\/\\1ext>`)
  const mine = (P: string) => `<${P}ext uri="${EXT_URI}"><p188:commentRel xmlns:p188="${P188}" r:id="${rid}"/></${P}ext>`
  const root = /<(\w+:)?sld\b[^>]*>/.exec(xml)
  if (!root) return xml
  const P = root[1] ?? ''
  if (ext.test(xml)) return xml.replace(ext, rid ? mine(P) : '').replace(new RegExp(`<${P}extLst>\\s*</${P}extLst>`), '')
  if (!rid) return xml
  let out = xml
  if (!/\sxmlns:r="/.test(root[0])) out = out.replace(root[0], root[0].replace(/>$/, ` xmlns:r="${R}">`))
  const close = out.lastIndexOf(`</${P}sld>`)
  const before = out.slice(0, close).trimEnd()
  const lst = `</${P}extLst>`
  if (before.endsWith(lst)) {
    const at = before.length - lst.length
    return out.slice(0, at) + mine(P) + out.slice(at)
  }
  return out.slice(0, close) + `<${P}extLst>${mine(P)}</${P}extLst>` + out.slice(close)
}

/** writes the comments of every slide that has (or had) some, as modern comments */
export async function writePptxComments(pkg: OpcPackage, presPath: string, store: PptxComments, slides: { path: string }[]): Promise<void> {
  const threads = store.threads()
  for (const s of slides) {
    const list = threads.filter((t) => t.root.at && 'slide' in t.root.at && t.root.at.slide === s.path)
    const rels = [...(await pkg.rels(s.path)).values()].filter((r) => !r.external)
    const modern = rels.filter((r) => isModern(r.type))
    const legacy = rels.filter((r) => isLegacy(r.type))
    if (!list.length && !modern.length && !legacy.length) continue
    // legacy parts go: the slide's comments are written as modern ones
    for (const r of [...legacy, ...(list.length ? modern.slice(1) : modern)]) {
      pkg.setPart(r.target, null)
      await pkg.removeRelsTo(s.path, r.target)
      await pkg.setContentType(r.target, null)
    }
    if (!list.length) {
      pkg.setPart(s.path, linkSlide(await pkg.text(s.path), null))
      continue
    }
    const { sldId, cId } = await slideMonikers(pkg, presPath, s.path)
    let body = ''
    for (const t of list) {
      const root = t.root
      const at = root.at as { x: number; y: number }
      const o = store.orig.get(root.id)
      // the anchor read stays while the thread stays where it was (it may point at a shape)
      const same = o?.anchor && o.x !== undefined && Math.abs(o.x - at.x) < 0.5 && Math.abs(o.y! - at.y) < 0.5
      const anchor = same
        ? o!.anchor! + (o!.pos ?? '')
        : `<pc:sldMkLst xmlns:pc="${PC}"><pc:docMk/><pc:sldMk cId="${cId}" sldId="${sldId}"/></pc:sldMkLst><p188:pos x="${Math.round(at.x * EMU_PER_PX)}" y="${Math.round(at.y * EMU_PER_PX)}"/>`
      const replies = t.replies.length
        ? `<p188:replyLst>${t.replies.map((r) => `<p188:reply id="${r.id}" authorId="${authorOf(store, r.author)}" created="${escAttr(writeTime(r.time))}">${txBody(r.text)}</p188:reply>`).join('')}</p188:replyLst>`
        : ''
      // people mentioned join the authors (their mentions are found again in the text when the file is read)
      for (const c of [root, ...t.replies]) for (const u of c.mentions ?? []) authorOf(store, u)
      body += `<p188:cm id="${root.id}" authorId="${authorOf(store, root.author)}"${root.done ? ' status="resolved"' : ''} created="${escAttr(writeTime(root.time))}">${anchor}${replies}${txBody(root.text)}</p188:cm>`
    }
    const xml = `${XML_HEAD}<p188:cmLst xmlns:a="${A}" xmlns:r="${R}" xmlns:p188="${P188}">${body}</p188:cmLst>`
    let path = modern[0]?.target
    let rid = modern[0]?.id
    if (!path) {
      path = `ppt/comments/modernComment_${sldId}_${Number(cId).toString(16).toUpperCase().padStart(8, '0')}.xml`
      if (pkg.has(path)) path = pkg.freeName('ppt/comments', `modernComment_${sldId}_`, 'xml')
      rid = await pkg.addRel(s.path, REL_MODERN, path)
      await pkg.setContentType(path, CT_MODERN)
    }
    pkg.setPart(path, xml)
    pkg.setPart(s.path, linkSlide(await pkg.text(s.path), rid!))
  }
  if (store.authors.size) {
    const xml = `${XML_HEAD}<p188:authorLst xmlns:a="${A}" xmlns:r="${R}" xmlns:p188="${P188}">${[...store.authors.values()]
      .map(
        (a) =>
          `<p188:author id="${a.id}" name="${escAttr(a.name)}" initials="${escAttr(a.initials ?? '')}" userId="${escAttr(a.userId ?? a.name)}" providerId="${escAttr(a.providerId ?? 'None')}"/>`,
      )
      .join('')}</p188:authorLst>`
    if (!store.authorsPath) {
      store.authorsPath = pkg.has('ppt/authors.xml') ? pkg.freeName('ppt', 'authors', 'xml') : 'ppt/authors.xml'
      await pkg.addRel(presPath, REL_AUTHORS, store.authorsPath)
      await pkg.setContentType(store.authorsPath, CT_AUTHORS)
    }
    pkg.setPart(store.authorsPath, xml)
  }
}

/** the comment parts of a slide (left out of a copy of it, removed with it) */
export function isCommentRel(type: string): boolean {
  return isModern(type) || isLegacy(type)
}

export const COMMENT_EXT_RE = new RegExp(`<(\\w+:)?ext\\b[^>]*uri="${EXT_URI.replace(/[{}]/g, '\\$&')}"[\\s\\S]*?<\\/\\1ext>`)
