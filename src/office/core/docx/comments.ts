/**
 * DOCX comments: `word/comments.xml` (the comments), `commentsExtended.xml` (threads: reply → parent, resolved),
 * `commentsIds.xml` (durable ids), `commentsExtensible.xml` (UTC dates) and `people.xml` (authors).
 *
 * In the body a comment covers the text between `commentRangeStart` and `commentRangeEnd` of its id, followed by a run
 * holding its `commentReference`. Paragraph models carry that as `cm` (thread root ids) on the runs it covers, so it
 * follows the text through every edit. Generated paragraphs mark their own part of each range (with the root id as
 * `cm:<id>`); `fixCommentMarks` then turns the marks of the whole body into one range per thread when the document is
 * saved, with the replies' ranges at the same place, as Word writes them.
 */
import { CommentStore, initialsOf, mentionsIn, type CommentUser, type DocComment } from '../comments'
import { relOfType, type OpcPackage, type Rels } from '../opc'
import { escAttr, escText } from '../raw'
import { kid, kids, parseXml, type XEl } from '../xml'

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments'
const REL_EX = 'http://schemas.microsoft.com/office/2011/relationships/commentsExtended'
const REL_IDS = 'http://schemas.microsoft.com/office/2016/09/relationships/commentsIds'
const REL_EXT = 'http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible'
const REL_PEOPLE = 'http://schemas.microsoft.com/office/2011/relationships/people'
const CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.'

const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  w14: 'http://schemas.microsoft.com/office/word/2010/wordml',
  w15: 'http://schemas.microsoft.com/office/word/2012/wordml',
  w16cid: 'http://schemas.microsoft.com/office/word/2016/wordml/cid',
  w16cex: 'http://schemas.microsoft.com/office/word/2018/wordml/cex',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
}
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'

/** what a comment was read from */
export interface DocxCommentOrig {
  /** w:id in the file */
  num: number
  /** its <w:comment> element, as read */
  xml: string
  text: string
  /** w14:paraId of its last paragraph */
  paraId?: string
}

export class DocxComments extends CommentStore<DocxCommentOrig> {
  /** w:id in the file → comment id */
  readonly byNum = new Map<number, string>()
  /** w:id given to comments that were not read from the file */
  readonly nums = new Map<string, number>()
  /** thread roots whose range was found in the body when it was read */
  readonly inBody = new Set<string>()
  /** start tag of the comments part as read (its namespace declarations) */
  rootTag?: string
  /** the parts were found in the package (paths) */
  paths: { comments?: string; ex?: string; ids?: string; ext?: string; people?: string } = {}
  /** w:id of a comment in the body while reading → its thread root (replies mark nothing themselves) */
  rootOfNum(num: string | undefined): string | undefined {
    const id = num === undefined ? undefined : this.byNum.get(Number(num))
    if (id === undefined) return undefined
    return this.map.get(id)?.parent ?? id
  }
}

const paraText = (p: XEl): string => {
  let s = ''
  const rec = (n: XEl) => {
    for (const c of n.c) {
      if (c.n === 't') s += c.t
      else if (c.n === 'tab') s += '\t'
      else if (c.n === 'br' || c.n === 'cr') s += '\n'
      else if (c.n !== 'rPr' && c.n !== 'pPr' && c.n !== 'del' && c.n !== 'instrText') rec(c)
    }
  }
  rec(p)
  return s
}

/** a durable id for a comment the file gives none (the same every time the file is read) */
const synthId = (num: number) => (0x10000000 + (num % 0x60000000)).toString(16).toUpperCase()

/** the <w:comment> elements of comments.xml as source text, by w:id */
function rawComments(xml: string): Map<number, string> {
  const out = new Map<number, string>()
  const re = /<(\w+:)?comment\b[^>]*?(\/>|>[\s\S]*?<\/\1comment>)/g
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const id = /\s(?:\w+:)?id="(-?\d+)"/.exec(m[0].slice(0, m[0].indexOf('>') + 1))
    if (id) out.set(Number(id[1]), m[0])
  }
  return out
}

export async function readDocxComments(pkg: OpcPackage, mainPath: string, rels: Rels): Promise<DocxComments> {
  const store = new DocxComments()
  const part = (suffix: string) => {
    const r = relOfType(rels, suffix)
    return r && !r.external && pkg.has(r.target) ? r.target : undefined
  }
  const paths = (store.paths = { comments: part('comments'), ex: part('commentsExtended'), ids: part('commentsIds'), ext: part('commentsExtensible'), people: part('people') })
  void mainPath
  if (!paths.comments) return store
  const xml = await pkg.text(paths.comments)
  store.rootTag = /<(\w+:)?comments\b[^>]*>/.exec(xml)?.[0]
  const raw = rawComments(xml)
  const root = parseXml(xml)
  // paraId → durable id / date (UTC) / parent paraId / done
  const durable = new Map<string, string>()
  const ext = new Map<string, string>()
  const parentOf = new Map<string, string>()
  const done = new Set<string>()
  if (paths.ids) for (const c of kids(await pkg.xml(paths.ids), 'commentId')) if (c.a.paraId && c.a.durableId) durable.set(c.a.paraId.toUpperCase(), c.a.durableId.toUpperCase())
  if (paths.ext) for (const c of kids(await pkg.xml(paths.ext), 'commentExtensible')) if (c.a.durableId && c.a.dateUtc) ext.set(c.a.durableId.toUpperCase(), c.a.dateUtc)
  if (paths.ex)
    for (const c of kids(await pkg.xml(paths.ex), 'commentEx')) {
      const pid = c.a.paraId?.toUpperCase()
      if (!pid) continue
      if (c.a.paraIdParent) parentOf.set(pid, c.a.paraIdParent.toUpperCase())
      if (c.a.done === '1' || c.a.done === 'true') done.add(pid)
    }
  const people = new Map<string, string>()
  const persons: CommentUser[] = []
  if (paths.people)
    for (const p of kids(await pkg.xml(paths.people), 'person')) {
      const info = kid(p, 'presenceInfo')
      const uid = info?.a.userId
      if (!p.a.author) continue
      const own = uid && info?.a.providerId === 'None' && uid !== p.a.author ? uid : undefined
      if (own) people.set(p.a.author, own)
      persons.push(own ? { name: p.a.author, id: own } : { name: p.a.author })
    }
  const byPara = new Map<string, string>()
  for (const c of kids(root, 'comment')) {
    const num = Number(c.a.id)
    if (!Number.isFinite(num) || store.byNum.has(num)) continue
    const paras = kids(c, 'p')
    const paraId = paras.length ? paras[paras.length - 1].a.paraId?.toUpperCase() : undefined
    const id = (paraId && durable.get(paraId)) || synthId(num)
    if (store.map.has(id)) continue
    const text = paras.map(paraText).join('\n')
    const name = c.a.author || 'Unknown'
    const author: DocComment['author'] = { name }
    if (c.a.initials) author.initials = c.a.initials
    const uid = people.get(name)
    if (uid) author.id = uid
    const dateUtc = ext.get(id)
    const mentions = mentionsIn(text, persons)
    store.map.set(id, { id, author, time: dateUtc ?? c.a.date ?? '', text, ...(mentions ? { mentions } : {}) })
    store.orig.set(id, { num, xml: raw.get(num) ?? '', text, paraId })
    store.byNum.set(num, id)
    if (paraId) byPara.set(paraId, id)
  }
  // threads: a reply points at the paragraph of the comment it answers; Word keeps them one level deep
  for (const [id, c] of store.map) {
    const pid = store.orig.get(id)?.paraId
    let parent = pid ? parentOf.get(pid) : undefined
    let root: string | undefined
    for (let guard = 0; parent && guard < 50; guard++) {
      root = byPara.get(parent)
      const up = root ? store.orig.get(root)?.paraId : undefined
      parent = up ? parentOf.get(up) : undefined
    }
    if (root && root !== id) c.parent = root
    else if (pid && done.has(pid)) c.done = true
  }
  return store
}

// ---------------------------------------------------------------- body marks

/** the start / end marks and reference runs of comments in body XML */
const MARK_RE = /<(\w+:)?(commentRangeStart|commentRangeEnd)\b([^>]*?)\/?>(?:<\/\1\2>)?|<(\w+:)?r(?:\s[^>]*)?>(?:(?!<\/?\4r[\s>])[\s\S])*?<\4commentReference\b([^>]*?)\/?>(?:(?!<\/?\4r[\s>])[\s\S])*?<\/\4r>/g
const ID_RE = /\s(?:\w+:)?id="([^"]*)"/

/** what the save of the body found: thread roots with a range in it */
export interface FixResult {
  xml: string
  found: Set<string>
}

/**
 * One range per thread in body XML: the first start and the last end of each root's marks stay (the replies' marks
 * join them there), every other mark goes, so do the marks of comments that are no longer there. `num` gives each
 * comment its w:id in the saved file.
 */
export function fixCommentMarks(xml: string, store: DocxComments, num: (id: string) => number): FixResult {
  type Tok = { at: number; end: number; kind: 's' | 'e' | 'r'; root?: string; W: string }
  const toks: Tok[] = []
  const rootOf = (v: string | undefined): string | undefined => {
    if (v === undefined) return undefined
    if (v.startsWith('cm:')) {
      const id = v.slice(3)
      const c = store.get(id)
      return c && !c.parent ? id : undefined
    }
    const id = store.byNum.get(Number(v))
    const c = id !== undefined ? store.get(id) : undefined
    // replies' own marks: they are written again next to their root's
    return c && !c.parent ? id : undefined
  }
  MARK_RE.lastIndex = 0
  for (let m = MARK_RE.exec(xml); m; m = MARK_RE.exec(xml)) {
    if (m[2]) toks.push({ at: m.index, end: m.index + m[0].length, kind: m[2] === 'commentRangeStart' ? 's' : 'e', root: rootOf(ID_RE.exec(m[3])?.[1]), W: m[1] ?? '' })
    else toks.push({ at: m.index, end: m.index + m[0].length, kind: 'r', root: rootOf(ID_RE.exec(m[5])?.[1]), W: m[4] ?? '' })
  }
  if (!toks.length) return { xml, found: new Set() }
  const first = new Map<string, Tok>()
  const lastE = new Map<string, Tok>()
  const lastR = new Map<string, Tok>()
  for (const t of toks) {
    if (!t.root) continue
    if (t.kind === 's' && !first.has(t.root)) first.set(t.root, t)
    if (t.kind === 'e') lastE.set(t.root, t)
    if (t.kind === 'r') lastR.set(t.root, t)
  }
  const found = new Set<string>()
  for (const root of [...first.keys(), ...lastE.keys(), ...lastR.keys()]) found.add(root)
  // replies after their root, oldest first
  const thread = new Map<string, string[]>()
  for (const t of store.threads()) if (found.has(t.root.id)) thread.set(t.root.id, [t.root.id, ...t.replies.map((r) => r.id)])
  const out: string[] = []
  let pos = 0
  for (const t of toks) {
    out.push(xml.slice(pos, t.at))
    pos = t.end
    const ids = t.root ? thread.get(t.root) : undefined
    if (!ids || !t.root) continue
    const W = t.W
    if (t.kind === 's' && first.get(t.root) === t) out.push(ids.map((id) => `<${W}commentRangeStart ${W}id="${num(id)}"/>`).join(''))
    if (t.kind === 'e' && lastE.get(t.root) === t) {
      out.push(ids.map((id) => `<${W}commentRangeEnd ${W}id="${num(id)}"/>`).join(''))
      // no reference anywhere: it follows the end
      if (!lastR.has(t.root)) out.push(ids.map((id) => refRun(W, num(id))).join(''))
    }
    if (t.kind === 'r' && lastR.get(t.root) === t) out.push(ids.map((id) => refRun(W, num(id))).join(''))
  }
  out.push(xml.slice(pos))
  return { xml: out.join(''), found }
}

const refRun = (W: string, n: number) => `<${W}r><${W}commentReference ${W}id="${n}"/></${W}r>`

/** the start / end marks and reference run a generated paragraph puts around its part of a thread's range */
export const markStart = (W: string, id: string) => `<${W}commentRangeStart ${W}id="cm:${id}"/>`
export const markEnd = (W: string, id: string) => `<${W}commentRangeEnd ${W}id="cm:${id}"/><${W}r><${W}commentReference ${W}id="cm:${id}"/></${W}r>`

// ---------------------------------------------------------------- writing

const randHex = () => {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return ((a[0] % 0x7ffffffe) + 1).toString(16).toUpperCase().padStart(8, '0')
}

/**
 * w:id of every comment in the saved file: those read keep theirs, new ones come after (and keep the one they got
 * for later saves, whose body is read back from the first)
 */
export function numbering(store: DocxComments): (id: string) => number {
  return (id) => {
    const o = store.orig.get(id)
    if (o) return o.num
    let n = store.nums.get(id)
    if (n === undefined) {
      n = Math.max(-1, ...store.byNum.keys()) + 1
      store.nums.set(id, n)
      store.byNum.set(n, id)
    }
    return n
  }
}

function commentXml(c: DocComment, n: number, paraIds: string[]): string {
  const lines = c.text.split('\n')
  const ini = c.author.initials ?? initialsOf(c.author.name)
  const date = c.time ? ` w:date="${escAttr(c.time)}"` : ''
  let body = ''
  lines.forEach((line, i) => {
    const runs = line
      .split('\t')
      .map((s, k) => (k ? '<w:r><w:tab/></w:r>' : '') + (s ? `<w:r><w:t xml:space="preserve">${escText(s)}</w:t></w:r>` : ''))
      .join('')
    body += `<w:p w14:paraId="${paraIds[i]}" w14:textId="77777777">${i === 0 ? '<w:r><w:annotationRef/></w:r>' : ''}${runs}</w:p>`
  })
  return `<w:comment w:id="${n}" w:author="${escAttr(c.author.name)}"${date} w:initials="${escAttr(ini)}">${body}</w:comment>`
}

/** a comment element read from the file, with its id set to `n` and its last paragraph given `paraId` when it had none */
function keepXml(xml: string, n: number, paraId: string, had: boolean): string {
  let out = xml.replace(/^(<(?:\w+:)?comment\b[^>]*?\s(?:\w+:)?id=")-?\d+"/, `$1${n}"`)
  if (!had) {
    let at = -1
    const re = /<w:p(?=[\s>/])/g
    for (let m = re.exec(out); m; m = re.exec(out)) at = m.index
    if (at >= 0) out = out.slice(0, at) + `<w:p w14:paraId="${paraId}"` + out.slice(at + 4)
  }
  return out
}

/** the comments part's start tag: the one read (its namespaces kept) with w14 declared, else a new one */
function commentsRoot(tag: string | undefined, decl: (k: (keyof typeof NS)[]) => string, ignorable: (k: string[]) => string): string {
  if (!tag || !/^<w:comments[\s>]/.test(tag) || !tag.includes(`xmlns:w="${NS.w}"`)) return `<w:comments${decl(['w', 'w14', 'mc'])}${ignorable(['w14'])}>`
  let t = tag.replace(/\/?>$/, '')
  if (!/\sxmlns:w14="/.test(t)) t += decl(['w14'])
  if (!/\sxmlns:mc="/.test(t)) t += decl(['mc'])
  const ig = /\smc:Ignorable="([^"]*)"/.exec(t)
  if (!ig) t += ignorable(['w14'])
  else if (!ig[1].split(/\s+/).includes('w14')) t = t.replace(ig[0], ` mc:Ignorable="${(ig[1] + ' w14').trim()}"`)
  return t + '>'
}

/** the comments of the thread roots `keep` (and of what the body never had), written into the package */
export async function writeDocxComments(pkg: OpcPackage, mainPath: string, store: DocxComments, num: (id: string) => number, found: Set<string>): Promise<void> {
  // threads that were in the body and are no longer there go; those that never were (headers, footnotes) stay
  const live = store.threads().filter((t) => found.has(t.root.id) || (store.orig.has(t.root.id) && !store.inBody.has(t.root.id)))
  const list: DocComment[] = live.flatMap((t) => [t.root, ...t.replies])
  const paraOf = new Map<string, string>()
  let comments = ''
  for (const c of list) {
    const o = store.orig.get(c.id)
    const n = num(c.id)
    if (o && o.xml && o.text === c.text && o.xml.includes('<w:')) {
      const pid = o.paraId ?? randHex()
      paraOf.set(c.id, pid)
      comments += keepXml(o.xml, n, pid, !!o.paraId)
    } else {
      const ids = c.text.split('\n').map(() => randHex())
      paraOf.set(c.id, ids[ids.length - 1])
      comments += commentXml(c, n, ids)
    }
  }
  const decl = (keys: (keyof typeof NS)[]) => keys.map((k) => ` xmlns:${k}="${NS[k]}"`).join('')
  const ignorable = (keys: string[]) => ` mc:Ignorable="${keys.join(' ')}"`
  const files: { key: 'comments' | 'ex' | 'ids' | 'ext' | 'people'; name: string; rel: string; ct: string; xml: string }[] = [
    { key: 'comments', name: 'comments', rel: REL, ct: CT + 'comments+xml', xml: `${XML_HEAD}${commentsRoot(store.rootTag, decl, ignorable)}${comments}</w:comments>` },
    {
      key: 'ex', name: 'commentsExtended', rel: REL_EX, ct: CT + 'commentsExtended+xml',
      xml: `${XML_HEAD}<w15:commentsEx${decl(['w15', 'mc'])}${ignorable(['w15'])}>${list
        .map((c) => `<w15:commentEx w15:paraId="${paraOf.get(c.id)}"${c.parent && paraOf.has(c.parent) ? ` w15:paraIdParent="${paraOf.get(c.parent)}"` : ''} w15:done="${c.done ? 1 : 0}"/>`)
        .join('')}</w15:commentsEx>`,
    },
    {
      key: 'ids', name: 'commentsIds', rel: REL_IDS, ct: CT + 'commentsIds+xml',
      xml: `${XML_HEAD}<w16cid:commentsIds${decl(['w16cid', 'mc'])}${ignorable(['w16cid'])}>${list
        .map((c) => `<w16cid:commentId w16cid:paraId="${paraOf.get(c.id)}" w16cid:durableId="${c.id}"/>`)
        .join('')}</w16cid:commentsIds>`,
    },
    {
      key: 'ext', name: 'commentsExtensible', rel: REL_EXT, ct: CT + 'commentsExtensible+xml',
      xml: `${XML_HEAD}<w16cex:commentsExtensible${decl(['w16cex', 'mc'])}${ignorable(['w16cex'])}>${list
        .filter((c) => /Z$/.test(c.time))
        .map((c) => `<w16cex:commentExtensible w16cex:durableId="${c.id}" w16cex:dateUtc="${escAttr(c.time)}"/>`)
        .join('')}</w16cex:commentsExtensible>`,
    },
  ]
  // authors, and the people mentioned (their mentions are found again in the text when the file is read)
  const authors = new Map<string, string | undefined>()
  for (const u of list.flatMap((c) => [c.author, ...(c.mentions ?? [])])) if (!authors.has(u.name) || u.id) authors.set(u.name, u.id)
  files.push({
    key: 'people', name: 'people', rel: REL_PEOPLE, ct: CT + 'people+xml',
    xml: `${XML_HEAD}<w15:people${decl(['w15', 'mc'])}${ignorable(['w15'])}>${[...authors]
      .map(([name, id]) => `<w15:person w15:author="${escAttr(name)}"><w15:presenceInfo w15:providerId="None" w15:userId="${escAttr(id ?? name)}"/></w15:person>`)
      .join('')}</w15:people>`,
  })
  for (const f of files) {
    let path = store.paths[f.key]
    if (!path) {
      path = (store.paths[f.key] = `word/${f.name}.xml`)
      if (pkg.has(path)) path = store.paths[f.key] = pkg.freeName('word', f.name, 'xml')
      await pkg.addRel(mainPath, f.rel, path)
      await pkg.setContentType(path, f.ct)
    }
    pkg.setPart(path, f.xml)
  }
}

/** the comment ids a block list marks (roots), in document order */
export function markedIds(runs: { cm?: string[] }[], into: string[] = []): string[] {
  for (const r of runs) for (const id of r.cm ?? []) if (!into.includes(id)) into.push(id)
  return into
}
