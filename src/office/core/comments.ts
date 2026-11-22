/**
 * Comments, the same way for every format: threads of plain-text comments kept by the worker and written into the
 * file the way Word, Excel and PowerPoint store them (DOCX `comments.xml`, XLSX threaded comments, PPTX modern
 * comments). A thread is a root comment and its replies (`parent`).
 *
 * Where a thread points: DOCX — the text marked with its id (`cm` on runs, it moves with the text); XLSX — a cell;
 * PPTX — a point on a slide.
 */

/** someone who writes or is mentioned in comments; `id`: the host app's user id, when known */
export interface CommentUser {
  name: string
  id?: string
  initials?: string
}

export type CommentMention = CommentUser

/** XLSX: a cell of the sheet stored at part `sheet`; PPTX: a point (slide px, 96 per inch) on the slide stored at part `slide` */
export type CommentAnchor = { sheet: string; r: number; c: number } | { slide: string; x: number; y: number }

export interface DocComment {
  /** durable id: the same after saving and reopening (DOCX durableId, XLSX / PPTX GUID) */
  id: string
  /** id of the thread's root comment, for replies */
  parent?: string
  author: CommentUser
  /** ISO 8601 */
  time: string
  /** plain text, lines separated by '\n'; mentions are written in it as "@Name" */
  text: string
  /** people mentioned in `text` */
  mentions?: CommentMention[]
  /** the thread is resolved (root comments) */
  done?: boolean
  /** where the thread points (XLSX / PPTX root comments) */
  at?: CommentAnchor
}

/** A thread as views list it: the root, its replies in time order */
export interface CommentThread {
  root: DocComment
  replies: DocComment[]
}

/** the threads of a comment list (replies whose root is gone are left out), roots in list order */
export function threadsOf(list: Iterable<DocComment>): CommentThread[] {
  const out: CommentThread[] = []
  const byId = new Map<string, CommentThread>()
  const replies: DocComment[] = []
  for (const c of list) {
    if (c.parent) replies.push(c)
    else {
      const t = { root: c, replies: [] }
      byId.set(c.id, t)
      out.push(t)
    }
  }
  for (const r of replies) byId.get(r.parent!)?.replies.push(r)
  for (const t of out) t.replies.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
  return out
}

/**
 * The people `text` mentions ("@Name"), among `people` (formats that keep no mention of their own — DOCX, PPTX — list
 * the people mentioned with the authors, and get the mentions back this way when the file is read again)
 */
export function mentionsIn(text: string, people: CommentUser[]): CommentUser[] | undefined {
  if (!text.includes('@')) return undefined
  const out: CommentUser[] = []
  let rest = text
  for (const u of [...people].sort((a, b) => b.name.length - a.name.length)) {
    if (!u.name || !rest.includes('@' + u.name) || out.some((m) => (m.id ?? m.name) === (u.id ?? u.name))) continue
    out.push(u.id ? { name: u.name, id: u.id } : { name: u.name })
    // a longer name taken first keeps its shorter prefixes from matching it again
    rest = rest.split('@' + u.name).join('\u0000')
  }
  return out.length ? out : undefined
}

/** initials for an avatar: "Ann Lee" → "AL" */
export function initialsOf(name: string): string {
  const words = name.trim().split(/[\s._@-]+/).filter(Boolean)
  if (!words.length) return '?'
  const first = [...words[0]][0] ?? ''
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? '') : ''
  return (first + last).toUpperCase()
}

const hex = (n: number) => {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** a GUID the way Office writes them: {8-4-4-4-12}, upper case */
export function newGuid(): string {
  const h = hex(16)
  // version 4, variant 10xx
  const v = h.slice(0, 12) + '4' + h.slice(13, 16) + ((parseInt(h[16], 16) & 3) | 8).toString(16).toUpperCase() + h.slice(17)
  return `{${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}}`
}

/** a DOCX durable id: 8 hex digits, below 0x7FFFFFFF as Word requires */
export function newDurableId(): string {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return ((a[0] % 0x7ffffffe) + 1).toString(16).toUpperCase().padStart(8, '0')
}

/** a new comment id for a document of `kind` */
export function newCommentId(kind: 'docx' | 'xlsx' | 'pptx'): string {
  return kind === 'docx' ? newDurableId() : newGuid()
}

/** `c` with only well-formed fields (it may come from a collaborator); null when it is not a comment */
export function checkedComment(c: unknown): DocComment | null {
  if (!c || typeof c !== 'object') return null
  const x = c as Record<string, unknown>
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : undefined)
  const user = (v: unknown): CommentUser | undefined => {
    if (!v || typeof v !== 'object') return undefined
    const u = v as Record<string, unknown>
    const name = str(u.name, 200)
    if (name === undefined) return undefined
    const out: CommentUser = { name }
    const id = str(u.id, 200)
    if (id) out.id = id
    const ini = str(u.initials, 10)
    if (ini) out.initials = ini
    return out
  }
  const id = str(x.id, 100)
  const author = user(x.author)
  const time = str(x.time, 40)
  const text = str(x.text, 100_000)
  if (!id || !/^[\w{}-]+$/.test(id) || !author || time === undefined || text === undefined) return null
  const out: DocComment = { id, author, time, text }
  const parent = str(x.parent, 100)
  if (parent) out.parent = parent
  if (Array.isArray(x.mentions)) {
    const ms = x.mentions.map(user).filter((m): m is CommentUser => !!m)
    if (ms.length) out.mentions = ms.slice(0, 100)
  }
  if (x.done === true) out.done = true
  const at = x.at as Record<string, unknown> | undefined
  if (at && typeof at === 'object') {
    const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
    if (typeof at.sheet === 'string' && n(at.r) && n(at.c)) out.at = { sheet: at.sheet, r: Math.max(0, Math.floor(at.r as number)), c: Math.max(0, Math.floor(at.c as number)) }
    else if (typeof at.slide === 'string' && n(at.x) && n(at.y)) out.at = { slide: at.slide, x: at.x as number, y: at.y as number }
  }
  return out
}

/** ISO time without milliseconds (what Office writes) */
export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

/**
 * The comments of a document as the worker keeps them. Formats keep what they need to write a comment back as it was
 * read (`orig`) and mark what changed.
 */
export class CommentStore<Orig = unknown> {
  readonly map = new Map<string, DocComment>()
  /** what each comment was read from (formats write untouched comments back from it) */
  readonly orig = new Map<string, Orig>()
  /** comments that changed since the document was opened */
  readonly touched = new Set<string>()
  /** set once anything changed */
  dirty = false
  /** every change (the engine tells the views) */
  onChange?: (id: string, c: DocComment | null) => void

  list(): DocComment[] {
    return [...this.map.values()]
  }

  get(id: string): DocComment | undefined {
    return this.map.get(id)
  }

  /** sets (null: deletes) comment `id`; returns what it was */
  set(id: string, c: DocComment | null): DocComment | null {
    const prev = this.map.get(id) ?? null
    if (c) this.map.set(id, c)
    else this.map.delete(id)
    this.touched.add(id)
    this.dirty = true
    this.onChange?.(id, c)
    return prev
  }

  /** whether `c` is the comment as read (not changed since) */
  pristine(id: string): boolean {
    return !this.touched.has(id) && this.orig.has(id)
  }

  /** the thread roots, and the replies of each root that is there, in time order */
  threads(): CommentThread[] {
    return threadsOf(this.map.values())
  }
}
