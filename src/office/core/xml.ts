/**
 * Minimal streaming XML tokenizer tailored to OOXML (works inside Web Workers,
 * where DOMParser is unavailable). Element names are reduced to local names;
 * attributes too, except relationship-namespace ones which become `r:<local>`.
 */
export type Attrs = Record<string, string>

export interface SaxHandler {
  /** Return `true` to skip the element's whole subtree (no `close` is emitted then). */
  open(name: string, attrs: Attrs, selfClosing: boolean): boolean | void
  close(name: string): void
  text(text: string): void
}

const REL_NS = new Set([
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  'http://purl.oclc.org/ooxml/officeDocument/relationships',
])

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

export function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e] ?? m
  })
}

const isWs = (c: number) => c === 32 || c === 9 || c === 10 || c === 13

export class SaxParser {
  private buf = ''
  private depth = 0
  private skipDepth = -1
  private relPrefixes = new Set<string>(['r'])

  /**
   * @param raw optional tap receiving every consumed source segment verbatim (tags, text, comments…),
   *   called right before the matching handler event. Used for byte-preserving rewrites.
   */
  constructor(
    private h: SaxHandler,
    private raw?: (segment: string) => void,
  ) {}

  write(chunk: string): void {
    this.buf = this.buf.length ? this.buf + chunk : chunk
    this.run(false)
  }

  end(): void {
    this.run(true)
    this.buf = ''
  }

  private run(final: boolean) {
    const s = this.buf
    const n = s.length
    let i = 0
    while (i < n) {
      const lt = s.indexOf('<', i)
      if (lt < 0) {
        if (final) {
          const seg = s.substring(i)
          this.raw?.(seg)
          this.onText(seg)
          i = n
        }
        break
      }
      if (lt > i) {
        const seg = s.substring(i, lt)
        this.raw?.(seg)
        this.onText(seg)
      }
      i = lt
      if (lt + 1 >= n) break
      const c = s.charCodeAt(lt + 1)
      if (c === 47) {
        const gt = s.indexOf('>', lt + 2)
        if (gt < 0) break
        this.raw?.(s.substring(lt, gt + 1))
        this.onClose(s.substring(lt + 2, gt))
        i = gt + 1
        continue
      }
      if (c === 63) {
        const e = s.indexOf('?>', lt + 2)
        if (e < 0) break
        this.raw?.(s.substring(lt, e + 2))
        i = e + 2
        continue
      }
      if (c === 33) {
        if (n - lt < 9 && !final) break
        if (s.startsWith('<!--', lt)) {
          const e = s.indexOf('-->', lt + 4)
          if (e < 0) break
          this.raw?.(s.substring(lt, e + 3))
          i = e + 3
          continue
        }
        if (s.startsWith('<![CDATA[', lt)) {
          const e = s.indexOf(']]>', lt + 9)
          if (e < 0) break
          this.raw?.(s.substring(lt, e + 3))
          if (this.skipDepth < 0) this.h.text(s.substring(lt + 9, e))
          i = e + 3
          continue
        }
        const e = s.indexOf('>', lt + 2)
        if (e < 0) break
        this.raw?.(s.substring(lt, e + 1))
        i = e + 1
        continue
      }
      let gt = -1
      let q = 0
      for (let j = lt + 1; j < n; j++) {
        const cc = s.charCodeAt(j)
        if (q !== 0) {
          if (cc === q) q = 0
        } else if (cc === 34 || cc === 39) q = cc
        else if (cc === 62) {
          gt = j
          break
        }
      }
      if (gt < 0) break
      this.raw?.(s.substring(lt, gt + 1))
      this.onOpen(s, lt + 1, gt)
      i = gt + 1
    }
    this.buf = i >= n ? '' : s.substring(i)
  }

  private onText(raw: string) {
    if (this.skipDepth >= 0 || this.depth === 0) return
    this.h.text(raw.indexOf('&') >= 0 ? decodeEntities(raw) : raw)
  }

  private onOpen(s: string, start: number, end: number) {
    let stop = end
    let self = false
    if (s.charCodeAt(end - 1) === 47) {
      self = true
      stop = end - 1
    }
    if (this.skipDepth >= 0) {
      if (!self) this.depth++
      return
    }
    let k = start
    while (k < stop && !isWs(s.charCodeAt(k))) k++
    const qname = s.substring(start, k)
    const colon = qname.indexOf(':')
    const name = colon < 0 ? qname : qname.substring(colon + 1)
    const attrs: Attrs = {}
    while (k < stop) {
      if (isWs(s.charCodeAt(k))) {
        k++
        continue
      }
      const eq = s.indexOf('=', k)
      if (eq < 0 || eq >= stop) break
      let an = s.substring(k, eq).trim()
      let v = eq + 1
      while (v < stop && s.charCodeAt(v) !== 34 && s.charCodeAt(v) !== 39) v++
      if (v >= stop) break
      const ve = s.indexOf(s[v], v + 1)
      if (ve < 0) break
      const raw = s.substring(v + 1, ve)
      k = ve + 1
      const ac = an.indexOf(':')
      if (ac >= 0) {
        const pfx = an.substring(0, ac)
        const local = an.substring(ac + 1)
        if (pfx === 'xmlns') {
          if (REL_NS.has(raw)) this.relPrefixes.add(local)
          continue
        }
        an = this.relPrefixes.has(pfx) ? 'r:' + local : local
      } else if (an === 'xmlns') continue
      attrs[an] = raw.indexOf('&') >= 0 ? decodeEntities(raw) : raw
    }
    const skip = this.h.open(name, attrs, self)
    if (self) {
      if (!skip) this.h.close(name)
      return
    }
    this.depth++
    if (skip) this.skipDepth = this.depth
  }

  private onClose(qname: string) {
    if (this.skipDepth >= 0) {
      if (this.depth === this.skipDepth) this.skipDepth = -1
      this.depth--
      return
    }
    this.depth--
    const t = qname.trim()
    const colon = t.indexOf(':')
    this.h.close(colon < 0 ? t : t.substring(colon + 1))
  }
}

export class AbortedError extends Error {
  constructor() {
    super('aborted')
    this.name = 'AbortError'
  }
}

export interface StreamParseOptions {
  signal?: AbortSignal
  /** verbatim source tap, see SaxParser */
  raw?: (segment: string) => void
  /** Called after each chunk (decompressed byte count); may return a promise to yield. */
  onChunk?: (bytes: number) => void | Promise<void>
}

export async function parseXmlStream(stream: ReadableStream<Uint8Array>, h: SaxHandler, opts: StreamParseOptions = {}): Promise<void> {
  const reader = stream.getReader()
  const dec = new TextDecoder()
  const p = new SaxParser(h, opts.raw)
  try {
    for (;;) {
      if (opts.signal?.aborted) throw new AbortedError()
      const { done, value } = await reader.read()
      if (done) break
      p.write(dec.decode(value, { stream: true }))
      if (opts.onChunk) await opts.onChunk(value.length)
    }
    p.write(dec.decode())
    p.end()
  } catch (e) {
    reader.cancel().catch(() => {})
    throw e
  }
}

// ---------------------------------------------------------------------------
// Lightweight element tree

export interface XEl {
  n: string
  a: Attrs
  c: XEl[]
  t: string
}

const TRANSPARENT = 0
const SHALLOW = 1
type Frame = XEl | typeof TRANSPARENT | typeof SHALLOW

export interface TreeBuilderOptions {
  /** When set, elements at this depth are built and emitted one by one; ancestors are not kept. */
  emitDepth?: number
  onElement?: (el: XEl) => void
  onShallowOpen?: (name: string, attrs: Attrs, depth: number) => void
  /** Element local names whose subtree is dropped. */
  skip?: Set<string>
}

/** Builds XEl trees; resolves mc:AlternateContent by taking the first mc:Choice. */
export class TreeBuilder implements SaxHandler {
  root: XEl | null = null
  private stack: Frame[] = []
  private parents: XEl[] = []
  private depth = 0
  private alt: boolean[] = []

  constructor(private o: TreeBuilderOptions = {}) {}

  open(name: string, a: Attrs): boolean | void {
    if (name === 'Fallback' || this.o.skip?.has(name)) return true
    if (name === 'AlternateContent') {
      this.alt.push(false)
      this.stack.push(TRANSPARENT)
      return
    }
    if (name === 'Choice' && this.alt.length) {
      const top = this.alt.length - 1
      if (this.alt[top]) return true
      this.alt[top] = true
      this.stack.push(TRANSPARENT)
      return
    }
    const d = this.depth++
    if (this.o.emitDepth !== undefined && d < this.o.emitDepth) {
      this.o.onShallowOpen?.(name, a, d)
      this.stack.push(SHALLOW)
      return
    }
    const el: XEl = { n: name, a, c: [], t: '' }
    const parent = this.parents[this.parents.length - 1]
    if (parent) parent.c.push(el)
    this.parents.push(el)
    this.stack.push(el)
  }

  close(name: string): void {
    const top = this.stack.pop()
    if (top === TRANSPARENT) {
      if (name === 'AlternateContent') this.alt.pop()
      return
    }
    this.depth--
    if (top === SHALLOW || top === undefined) return
    this.parents.pop()
    if (this.parents.length === 0) {
      if (this.o.emitDepth !== undefined) this.o.onElement?.(top)
      else this.root = top
    }
  }

  text(t: string): void {
    const p = this.parents[this.parents.length - 1]
    if (p) p.t += t
  }
}

export function parseXml(xml: string, skip?: Set<string>): XEl {
  const tb = new TreeBuilder({ skip })
  const p = new SaxParser(tb)
  p.write(xml)
  p.end()
  if (!tb.root) throw new Error('Empty XML document')
  return tb.root
}

// ---------------------------------------------------------------------------
// Tree helpers

export function kid(el: XEl | undefined, name: string): XEl | undefined {
  if (!el) return undefined
  for (const c of el.c) if (c.n === name) return c
  return undefined
}

export function kids(el: XEl | undefined, name: string): XEl[] {
  return el ? el.c.filter((c) => c.n === name) : []
}

export function path(el: XEl | undefined, ...names: string[]): XEl | undefined {
  let cur = el
  for (const n of names) {
    cur = kid(cur, n)
    if (!cur) return undefined
  }
  return cur
}

export function desc(el: XEl | undefined, name: string): XEl | undefined {
  if (!el) return undefined
  for (const c of el.c) {
    if (c.n === name) return c
    const r = desc(c, name)
    if (r) return r
  }
  return undefined
}

export function descAll(el: XEl | undefined, name: string, out: XEl[] = []): XEl[] {
  if (!el) return out
  for (const c of el.c) {
    if (c.n === name) out.push(c)
    else descAll(c, name, out)
  }
  return out
}

export function num(v: string | undefined, def?: number): number | undefined {
  if (v === undefined || v === '') return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

/** OOXML on/off value: absent element → undefined, `<x/>` → true. */
export function onOff(el: XEl | undefined, attr = 'val'): boolean | undefined {
  if (!el) return undefined
  const v = el.a[attr]
  if (v === undefined) return true
  return !(v === '0' || v === 'false' || v === 'off' || v === 'none')
}

export function textOf(el: XEl | undefined): string {
  if (!el) return ''
  if (!el.c.length) return el.t
  let s = ''
  for (const c of el.c) s += c.n === 't' ? c.t : textOf(c)
  return s
}
