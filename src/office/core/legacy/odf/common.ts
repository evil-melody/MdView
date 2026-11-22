/**
 * OpenDocument plumbing shared by the text, spreadsheet and presentation converters: the package (ZIP or flat XML),
 * an element tree with mixed content kept in order, styles with their inheritance, lengths.
 */
import { decodeEntities } from '../../xml'
import type { ZipArchive } from '../../zip'

/** an element: qualified name with the usual ODF prefix (office:, style:, text:, table:, draw:, fo:…), attributes decoded */
export interface ONode {
  name: string
  attrs: Record<string, string>
  /** child elements and text, in document order (text decoded; whitespace kept as is) */
  kids: (ONode | string)[]
}

/** the prefixes used for the ODF namespaces whatever a file declares */
const CANON: Record<string, string> = {
  'urn:oasis:names:tc:opendocument:xmlns:office:1.0': 'office',
  'urn:oasis:names:tc:opendocument:xmlns:style:1.0': 'style',
  'urn:oasis:names:tc:opendocument:xmlns:text:1.0': 'text',
  'urn:oasis:names:tc:opendocument:xmlns:table:1.0': 'table',
  'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0': 'draw',
  'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0': 'fo',
  'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0': 'svg',
  'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0': 'number',
  'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0': 'presentation',
  'urn:oasis:names:tc:opendocument:xmlns:meta:1.0': 'meta',
  'urn:oasis:names:tc:opendocument:xmlns:chart:1.0': 'chart',
  'urn:oasis:names:tc:opendocument:xmlns:dr3d:1.0': 'dr3d',
  'urn:oasis:names:tc:opendocument:xmlns:form:1.0': 'form',
  'urn:oasis:names:tc:opendocument:xmlns:script:1.0': 'script',
  'urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0': 'smil',
  'urn:oasis:names:tc:opendocument:xmlns:animation:1.0': 'anim',
  'urn:oasis:names:tc:opendocument:xmlns:config:1.0': 'config',
  'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0': 'loext',
  'http://openoffice.org/2009/office': 'officeooo',
  'http://www.w3.org/1999/xlink': 'xlink',
  'http://purl.org/dc/elements/1.1/': 'dc',
  'http://www.w3.org/1998/Math/MathML': 'math',
}

const ATTR = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

/**
 * Parses XML into ONodes (the root element); namespace prefixes are made the canonical ODF ones. One pass straight
 * to the tree (a large spreadsheet's content.xml is 100 MB and more); a namespace scope is copied only by the
 * elements that declare one.
 */
export function parseOdfXml(xml: string): ONode {
  const base = new Map<string, string>()
  const stack: { node: ONode; scope: Map<string, string> }[] = []
  let scope = base
  let root: ONode | undefined
  /** prefix → canonical prefix, per scope (most files declare every namespace once, on the root) */
  const canonOf = new WeakMap<Map<string, string>, Map<string, string>>()
  const fix = (q: string) => {
    const i = q.indexOf(':')
    if (i < 0) return q
    let memo = canonOf.get(scope)
    if (!memo) canonOf.set(scope, (memo = new Map()))
    const prefix = q.slice(0, i)
    let canon = memo.get(prefix)
    if (canon === undefined) memo.set(prefix, (canon = CANON[scope.get(prefix) ?? ''] ?? prefix))
    return canon === prefix ? q : canon + q.slice(i)
  }
  const n = xml.length
  let i = 0
  while (i < n) {
    const lt = xml.indexOf('<', i)
    const top = stack[stack.length - 1]
    if (lt < 0) {
      if (top) top.node.kids.push(decodeEntities(xml.slice(i)))
      break
    }
    if (lt > i && top) top.node.kids.push(decodeEntities(xml.slice(i, lt)))
    const c = xml.charCodeAt(lt + 1)
    // comments, CDATA, declarations, processing instructions
    if (c === 33 || c === 63) {
      let end: number
      if (xml.startsWith('<!--', lt)) end = xml.indexOf('-->', lt) + 3
      else if (xml.startsWith('<![CDATA[', lt)) {
        end = xml.indexOf(']]>', lt) + 3
        if (top) top.node.kids.push(xml.slice(lt + 9, end > 2 ? end - 3 : n))
      } else if (c === 63) end = xml.indexOf('?>', lt) + 2
      else end = xml.indexOf('>', lt) + 1
      i = end <= 2 ? n : end
      continue
    }
    if (c === 47) {
      const gt = xml.indexOf('>', lt)
      stack.pop()
      scope = stack.length ? stack[stack.length - 1].scope : base
      i = gt < 0 ? n : gt + 1
      continue
    }
    // the tag ends at the first ">" outside quotes
    let gt = -1
    let q = 0
    for (let j = lt + 1; j < n; j++) {
      const ch = xml.charCodeAt(j)
      if (q) {
        if (ch === q) q = 0
      } else if (ch === 34 || ch === 39) q = ch
      else if (ch === 62) {
        gt = j
        break
      }
    }
    if (gt < 0) gt = n
    const self = xml.charCodeAt(gt - 1) === 47
    const body = xml.slice(lt + 1, self ? gt - 1 : gt)
    const nameEnd = body.search(/[\s/>]|$/)
    const qname = body.slice(0, nameEnd)
    const pairs: [string, string][] = []
    let own = scope
    if (nameEnd < body.length) {
      for (const m of body.slice(nameEnd).matchAll(ATTR)) {
        const v = decodeEntities(m[2] ?? m[3] ?? '')
        if (m[1].startsWith('xmlns:')) {
          if (own === scope) own = new Map(scope)
          own.set(m[1].slice(6), v)
        } else pairs.push([m[1], v])
      }
    }
    scope = own
    const node: ONode = { name: fix(qname), attrs: {}, kids: [] }
    for (const [k, v] of pairs) node.attrs[fix(k)] = v
    if (top) top.node.kids.push(node)
    else root ??= node
    if (self) scope = top ? top.scope : base
    else stack.push({ node, scope })
    i = gt + 1
  }
  if (!root) throw new Error('Empty XML document')
  return root
}

export const isEl = (x: ONode | string | undefined): x is ONode => typeof x === 'object' && x !== null

/** the first child element with the name */
export const child = (n: ONode | undefined, name: string): ONode | undefined => n?.kids.find((k): k is ONode => isEl(k) && k.name === name)

/** the child elements (with the name, when given) */
export const children = (n: ONode | undefined, name?: string): ONode[] => (n ? n.kids.filter((k): k is ONode => isEl(k) && (!name || k.name === name)) : [])

/** every descendant element with the name (not looking inside a match) */
export function descendants(n: ONode | undefined, name: string, out: ONode[] = []): ONode[] {
  for (const k of children(n)) {
    if (k.name === name) out.push(k)
    else descendants(k, name, out)
  }
  return out
}

/** the text of an element and its descendants (text:s, text:tab, text:line-break as the characters they stand for) */
export function textContent(n: ONode | string): string {
  if (typeof n === 'string') return n
  if (n.name === 'text:s') return ' '.repeat(Number(n.attrs['text:c'] ?? 1) || 1)
  if (n.name === 'text:tab') return '\t'
  if (n.name === 'text:line-break') return '\n'
  if (n.name === 'text:note' || n.name === 'office:annotation') return ''
  return n.kids.map(textContent).join('')
}

/** a length in points: "2.5cm", "12pt", "0.5in", "10mm", "1pc", "96px"; undefined for none or a percentage */
export function toPt(v: string | undefined): number | undefined {
  const m = /^\s*(-?[\d.]+(?:e-?\d+)?)\s*(cm|mm|in|inch|pt|pc|px|em)?\s*$/i.exec(v ?? '')
  if (!m) return undefined
  const n = Number(m[1])
  if (!Number.isFinite(n)) return undefined
  switch ((m[2] ?? 'pt').toLowerCase()) {
    case 'cm':
      return (n * 72) / 2.54
    case 'mm':
      return (n * 72) / 25.4
    case 'in':
    case 'inch':
      return n * 72
    case 'pc':
      return n * 12
    case 'px':
      return (n * 72) / 96
    case 'em':
      return n * 12
    default:
      return n
  }
}

/** "#rrggbb" → "RRGGBB" (OOXML); undefined for "transparent" or anything else */
export const toHex = (v: string | undefined) => (/^#[0-9a-f]{6}$/i.test(v ?? '') ? v!.slice(1).toUpperCase() : undefined)

/** a style's property groups merged with those it inherits: group ("style:text-properties"…) → attribute → value */
export type StyleProps = Record<string, Record<string, string>>

/**
 * The styles of a document: named styles (styles.xml office:styles), automatic styles (content.xml and styles.xml),
 * default styles per family, list styles, number (data) styles, page layouts and master pages.
 */
export class OdfStyles {
  /** `${family}/${name}` → style:style; automatic content styles override styles.xml ones of the same name */
  readonly styles = new Map<string, ONode>()
  /** automatic styles of styles.xml only (used by master pages, headers and footers) */
  readonly masterAuto = new Map<string, ONode>()
  readonly defaults = new Map<string, ONode>()
  /** text:list-style by name */
  readonly lists = new Map<string, ONode>()
  /** number:number-style, number:date-style, number:currency-style… by name */
  readonly dataStyles = new Map<string, ONode>()
  /** style:page-layout by name */
  readonly pageLayouts = new Map<string, ONode>()
  /** style:master-page by name, in document order */
  readonly masterPages = new Map<string, ONode>()
  /** office:font-face-decls: font name → family ("Liberation Serif" → svg:font-family without quotes) */
  readonly fonts = new Map<string, string>()

  constructor(stylesRoot: ONode | undefined, contentRoot: ONode | undefined) {
    const add = (container: ONode | undefined, master: boolean) => {
      for (const s of children(container)) {
        const name = s.attrs['style:name']
        switch (s.name) {
          case 'style:style':
            if (name) {
              const key = `${s.attrs['style:family']}/${name}`
              if (master) this.masterAuto.set(key, s)
              if (!master || !this.styles.has(key)) this.styles.set(key, s)
            }
            break
          case 'style:default-style':
            this.defaults.set(s.attrs['style:family'], s)
            break
          case 'text:list-style':
            if (name) this.lists.set(name, s)
            break
          case 'style:page-layout':
            if (name) this.pageLayouts.set(name, s)
            break
          case 'style:master-page':
            if (name) this.masterPages.set(name, s)
            break
          default:
            if (s.name.startsWith('number:') && name) this.dataStyles.set(name, s)
        }
      }
    }
    for (const root of [stylesRoot, contentRoot]) {
      for (const f of children(child(root, 'office:font-face-decls'), 'style:font-face')) {
        const fam = (f.attrs['svg:font-family'] ?? f.attrs['style:name'] ?? '').replace(/^['"]|['"]$/g, '')
        if (f.attrs['style:name']) this.fonts.set(f.attrs['style:name'], fam)
      }
    }
    add(child(stylesRoot, 'office:styles'), false)
    add(child(stylesRoot, 'office:automatic-styles'), true)
    add(child(stylesRoot, 'office:master-styles'), false)
    // content automatic styles win over styles.xml ones of the same name
    for (const s of children(child(contentRoot, 'office:automatic-styles'))) {
      const name = s.attrs['style:name']
      if (s.name === 'style:style' && name) this.styles.set(`${s.attrs['style:family']}/${name}`, s)
      else if (s.name === 'text:list-style' && name) this.lists.set(name, s)
      else if (s.name.startsWith('number:') && name) this.dataStyles.set(name, s)
      else if (s.name === 'style:page-layout' && name) this.pageLayouts.set(name, s)
    }
  }

  get(family: string, name: string | undefined): ONode | undefined {
    return name ? this.styles.get(`${family}/${name}`) : undefined
  }

  /** the inheritance chain of a style, the style itself first (parents after, default style last) */
  chain(family: string, name: string | undefined): ONode[] {
    const out: ONode[] = []
    const seen = new Set<string>()
    for (let s = this.get(family, name); s && out.length < 32; s = this.get(family, s.attrs['style:parent-style-name'])) {
      const key = s.attrs['style:name']
      if (seen.has(key)) break
      seen.add(key)
      out.push(s)
    }
    const def = this.defaults.get(family)
    if (def) out.push(def)
    return out
  }

  /** the properties of a style with what it inherits (parents, then the family's default style) */
  props(family: string, name: string | undefined): StyleProps {
    const out: StyleProps = {}
    for (const s of this.chain(family, name).reverse()) {
      for (const g of children(s)) {
        if (!g.name.endsWith('-properties')) continue
        Object.assign((out[g.name] ??= {}), g.attrs)
      }
    }
    return out
  }

  /** the font family a style:font-name refers to (the name itself when no font face declares it) */
  font(name: string | undefined): string | undefined {
    if (!name) return undefined
    return this.fonts.get(name) ?? name
  }
}

/** An OpenDocument file: its content, styles, settings and other parts. */
export class OdfPackage {
  private constructor(
    readonly content: ONode,
    readonly stylesRoot: ONode | undefined,
    readonly settings: ONode | undefined,
    readonly meta: ONode | undefined,
    private zip: ZipArchive | null,
  ) {
    this.styles = new OdfStyles(stylesRoot, content)
  }

  readonly styles: OdfStyles

  /** Reads a package (ZIP) or a flat XML document (where content, styles, settings and meta are one document). */
  static async open(src: ZipArchive | string): Promise<OdfPackage> {
    if (typeof src === 'string') {
      const root = parseOdfXml(src)
      return new OdfPackage(root, root, child(root, 'office:settings') ? root : undefined, root, null)
    }
    // the document's parts encrypted with a password: their manifest entries say how (manifest:encryption-data);
    // a password on something else (a macro library) leaves the document readable
    if (src.has('META-INF/manifest.xml')) {
      const manifest = parseOdfXml(await src.text('META-INF/manifest.xml'))
      for (const e of children(manifest)) {
        const path = Object.entries(e.attrs).find(([k]) => k.endsWith(':full-path'))?.[1]
        if ((path === 'content.xml' || path === 'styles.xml') && children(e).some((k) => k.name.endsWith(':encryption-data'))) {
          throw new Error('Password-protected OpenDocument files are not supported')
        }
      }
    }
    const read = async (p: string) => (src.has(p) ? parseOdfXml(await src.text(p)) : undefined)
    const content = await read('content.xml')
    if (!content) throw new Error('OpenDocument package without content.xml')
    return new OdfPackage(content, await read('styles.xml'), await read('settings.xml'), await read('meta.xml'), src)
  }

  /** office:body's document element: office:text, office:spreadsheet or office:presentation */
  body(kind: 'text' | 'spreadsheet' | 'presentation'): ONode | undefined {
    return child(child(this.content, 'office:body'), `office:${kind}`)
  }

  /**
   * The bytes of a file an element points to (draw:image, draw:object…): `xlink:href` into the package, or
   * office:binary-data (flat XML). Undefined for external links and missing parts.
   */
  async file(el: ONode): Promise<Uint8Array | undefined> {
    const bin = child(el, 'office:binary-data')
    if (bin) {
      const b64 = textContent(bin).replace(/\s+/g, '')
      try {
        const s = atob(b64)
        const out = new Uint8Array(s.length)
        for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
        return out
      } catch {
        return undefined
      }
    }
    const href = el.attrs['xlink:href']
    if (!href || !this.zip || /^[a-z][a-z0-9+.-]*:/i.test(href)) return undefined
    const path = decodeURIComponent(href.replace(/^\.\//, '').replace(/^\//, ''))
    return this.zip.has(path) ? this.zip.bytes(path) : undefined
  }

  /** a config:config-item of settings.xml by name (the first found, for the first view) */
  setting(name: string): string | undefined {
    for (const it of descendants(this.settings, 'config:config-item')) if (it.attrs['config:name'] === name) return textContent(it)
    return undefined
  }
}
