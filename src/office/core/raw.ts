/**
 * Byte-faithful XML tree: keeps qualified names, raw attribute text and raw
 * (still-escaped) text, so untouched parts serialize back exactly as read.
 */
export interface RNode {
  q: string
  a: string
  c: RChild[]
  self: boolean
}
export type RChild = RNode | string

export const isNode = (x: RChild | undefined): x is RNode => typeof x === 'object' && x !== null

export function parseRaw(xml: string): RChild[] {
  const root: RChild[] = []
  const stack: RNode[] = []
  const push = (x: RChild) => (stack.length ? stack[stack.length - 1].c : root).push(x)
  let i = 0
  const n = xml.length
  while (i < n) {
    const lt = xml.indexOf('<', i)
    if (lt < 0) {
      push(xml.slice(i))
      break
    }
    if (lt > i) push(xml.slice(i, lt))
    const c = xml[lt + 1]
    if (c === '!' || c === '?') {
      let end: number
      if (xml.startsWith('<!--', lt)) end = xml.indexOf('-->', lt) + 3
      else if (xml.startsWith('<![CDATA[', lt)) end = xml.indexOf(']]>', lt) + 3
      else if (c === '?') end = xml.indexOf('?>', lt) + 2
      else end = xml.indexOf('>', lt) + 1
      if (end <= 0) end = n
      push(xml.slice(lt, end))
      i = end
      continue
    }
    if (c === '/') {
      const gt = xml.indexOf('>', lt)
      stack.pop()
      i = gt < 0 ? n : gt + 1
      continue
    }
    let gt = -1
    let q = ''
    for (let j = lt + 1; j < n; j++) {
      const ch = xml[j]
      if (q) {
        if (ch === q) q = ''
      } else if (ch === '"' || ch === "'") q = ch
      else if (ch === '>') {
        gt = j
        break
      }
    }
    if (gt < 0) gt = n - 1
    let body = xml.slice(lt + 1, gt)
    const self = body.endsWith('/')
    if (self) body = body.slice(0, -1)
    const m = /^[^\s/>]+/.exec(body)
    const qn = m ? m[0] : body
    const node: RNode = { q: qn, a: body.slice(qn.length), c: [], self }
    push(node)
    if (!self) stack.push(node)
    i = gt + 1
  }
  return root
}

export function serialize(x: RChild | RChild[]): string {
  if (Array.isArray(x)) {
    let s = ''
    for (const c of x) s += serialize(c)
    return s
  }
  if (typeof x === 'string') return x
  if (x.self && !x.c.length) return `<${x.q}${x.a}/>`
  return `<${x.q}${x.a}>${serialize(x.c)}</${x.q}>`
}

export const local = (q: string) => q.slice(q.indexOf(':') + 1)
export const prefixOf = (q: string) => (q.includes(':') ? q.slice(0, q.indexOf(':') + 1) : '')

export function rootEl(nodes: RChild[]): RNode | undefined {
  return nodes.find(isNode)
}

export function kidsOf(n: RNode | undefined, loc?: string): RNode[] {
  if (!n) return []
  return n.c.filter((c): c is RNode => isNode(c) && (!loc || local(c.q) === loc))
}

export function kidOf(n: RNode | undefined, loc: string): RNode | undefined {
  if (!n) return undefined
  for (const c of n.c) if (isNode(c) && local(c.q) === loc) return c
  return undefined
}

const ATTR_RE = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g

/** Attribute value by exact qualified name, or by local name when `loose`. */
export function getAttr(n: RNode, name: string, loose = false): string | undefined {
  ATTR_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ATTR_RE.exec(n.a))) {
    if (m[1] === name || (loose && local(m[1]) === name)) return unescape(m[3] ?? m[4] ?? '')
  }
  return undefined
}

export function setAttr(n: RNode, name: string, value: string | undefined): void {
  ATTR_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ATTR_RE.exec(n.a))) {
    if (m[1] === name) {
      const repl = value === undefined ? '' : `${name}="${escAttr(value)}"`
      n.a = n.a.slice(0, m.index) + repl + n.a.slice(m.index + m[0].length)
      if (value === undefined) n.a = n.a.replace(/\s+$/, '').replace(/\s{2,}/g, ' ')
      return
    }
  }
  if (value !== undefined) n.a = `${n.a.replace(/\s+$/, '')} ${name}="${escAttr(value)}"`
}

export function el(q: string, attrs: Record<string, string | undefined> = {}, children: RChild[] = []): RNode {
  let a = ''
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) a += ` ${k}="${escAttr(v)}"`
  return { q, a, c: children, self: children.length === 0 }
}

export function clone<T extends RChild>(x: T): T {
  if (typeof x === 'string') return x
  const n = x as RNode
  return { q: n.q, a: n.a, self: n.self, c: n.c.map(clone) } as T
}

export function removeKids(n: RNode, loc: string | ((l: string) => boolean)): void {
  const test = typeof loc === 'string' ? (l: string) => l === loc : loc
  n.c = n.c.filter((c) => !(isNode(c) && test(local(c.q))))
}

/**
 * Replaces (or inserts) the child with local name `loc`, keeping schema order:
 * the new child goes before the first existing sibling that comes later in `order`.
 */
export function setOrdered(parent: RNode, child: RNode | undefined, loc: string, order: string[]): void {
  const idx = parent.c.findIndex((c) => isNode(c) && local(c.q) === loc)
  if (idx >= 0) {
    if (child) parent.c[idx] = child
    else parent.c.splice(idx, 1)
    parent.self = parent.c.length === 0
    return
  }
  if (!child) return
  const rank = order.indexOf(loc)
  let at = parent.c.length
  for (let i = 0; i < parent.c.length; i++) {
    const c = parent.c[i]
    if (!isNode(c)) continue
    const r = order.indexOf(local(c.q))
    if (r > rank) {
      at = i
      break
    }
  }
  parent.c.splice(at, 0, child)
  parent.self = false
}

export function escText(s: string): string {
  // strip characters that are illegal in XML 1.0
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\uFFFE\uFFFF]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function escAttr(s: string): string {
  return escText(s).replace(/"/g, '&quot;')
}

function unescape(s: string): string {
  return s.indexOf('&') < 0 ? s : s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (m, e: string) => {
    switch (e) {
      case 'lt': return '<'
      case 'gt': return '>'
      case 'amp': return '&'
      case 'quot': return '"'
      case 'apos': return "'"
    }
    const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : m
  })
}

export function textContent(n: RChild): string {
  if (typeof n === 'string') return n.startsWith('<') ? '' : unescape(n)
  return n.c.map(textContent).join('')
}

/**
 * Preorder walk mirroring TreeBuilder semantics: mc:Fallback skipped, only the first
 * mc:Choice of an mc:AlternateContent is visited. `visit` returns true to stop descending.
 */
export function walkOoxml(n: RNode, visit: (node: RNode, parent: RNode, index: number) => boolean | void): void {
  const rec = (node: RNode) => {
    let choiceSeen = false
    const isAlt = local(node.q) === 'AlternateContent'
    for (let i = 0; i < node.c.length; i++) {
      const c = node.c[i]
      if (!isNode(c)) continue
      const l = local(c.q)
      if (l === 'Fallback') continue
      if (isAlt && l === 'Choice') {
        if (choiceSeen) continue
        choiceSeen = true
        rec(c)
        continue
      }
      if (l === 'AlternateContent') {
        rec(c)
        continue
      }
      if (visit(c, node, i)) continue
      rec(c)
    }
  }
  rec(n)
}

const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** attributes for an `r:id`-style reference that are valid whatever prefixes the root declared */
export function relIdAttrs(root: RNode, local = 'id', value: string): Record<string, string> {
  const m = new RegExp(`xmlns:([\\w.-]+)="${REL_NS.replace(/[.]/g, '\\.')}"`).exec(root.a)
  if (m) return { [`${m[1]}:${local}`]: value }
  return { 'xmlns:r': REL_NS, [`r:${local}`]: value }
}
