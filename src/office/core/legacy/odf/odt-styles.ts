/**
 * The styles of an OpenDocument text document as the DOCX converter uses them: named (common) styles become Word
 * styles, the automatic styles of paragraphs and spans direct formatting resolved on top of them.
 */
import { escAttr } from '../../raw'
import { child, children, type OdfPackage, type ONode } from './common'
import { decodeName, displayName, fontSize, mergePP, paraProps, pPrXml, type PP, rPrXml, type RP, type Tab, textProps, wordStyleName, XML_HEAD } from './odt-props'

/** how a paragraph style resolves: the Word style and the direct formatting of its automatic styles */
export interface ParaInfo {
  styleId: string
  pp: PP
  /** the run properties text in the paragraph starts from */
  rc: RunCtx
  /** effective font size, points */
  sz: number
  /** style:master-page-name ('' = none) */
  master?: string
  /** style:list-style-name ('' = none) */
  listStyle?: string
  /** style:default-outline-level of the style chain (1-based) */
  outline?: number
  /** left indent with everything inherited, points (tab stops and old-style lists are relative to it) */
  left: number
  /** first line indent with everything inherited */
  first: number
  /** a named style sets an indent below the one giving the list style (LibreOffice then keeps it over the list's) */
  styleIndent: boolean
  /** tab stops of the named style chain (Word coordinates), cleared by the paragraph's own */
  tabs?: Tab[]
}

/** run properties in effect while walking a paragraph's content */
export interface RunCtx {
  rp: RP
  rStyle?: string
  rStyleNode?: ONode
  sz: number
  /** cached w:rPr */
  x?: string
}

const omit = (rp: RP, keys: string[]): RP => {
  const out = { ...rp } as Record<string, unknown>
  for (const k of keys) delete out[k]
  return out as RP
}

export class OdtStyles {
  readonly st: OdfPackage['styles']
  /** styles of office:styles: the others are automatic (direct formatting) */
  readonly common = new Set<ONode>()
  /** Word style id of each named style */
  readonly styleIds = new Map<ONode, string>()
  /** ids of the styles some content uses */
  readonly usedIds = new Set<string>()
  readonly outlineStyle?: ONode
  readonly defaultSize: number
  /** tab stop positions are relative to the paragraph indent (LibreOffice's default) */
  readonly tabsRelative: boolean
  /** converting master page content (headers, footers): styles.xml's automatic styles come first */
  inMaster = false
  private takenIds = new Set<string>()
  private takenNames = new Set<string>()
  private names = new Map<ONode, string>()
  private synth = new Map<string, string>()
  private paraCache = new Map<string, ParaInfo>()
  private spanCache = new WeakMap<RunCtx, Map<string, RunCtx>>()
  private charCache = new Map<string, RP>()

  constructor(pkg: OdfPackage) {
    this.st = pkg.styles
    const office = child(pkg.stylesRoot, 'office:styles')
    for (const s of children(office)) if (s.name === 'style:style') this.common.add(s)
    this.outlineStyle = child(office, 'text:outline-style')
    const defText = child(this.st.defaults.get('paragraph'), 'style:text-properties')
    this.defaultSize = fontSize(defText?.attrs['fo:font-size'], 12) ?? 12
    this.tabsRelative = pkg.setting('TabsRelativeToIndent') !== 'false'
    this.assignStyleIds()
  }

  /** the Word style id of a named text style (marked used) */
  textStyleId(name: string | undefined): string | undefined {
    const s = name ? this.look('text', name) : undefined
    const id = s && this.styleIds.get(s)
    if (id) this.usedIds.add(id)
    return id
  }

  look(family: string, name: string | undefined): ONode | undefined {
    if (!name) return undefined
    const key = `${family}/${name}`
    return (this.inMaster ? this.st.masterAuto.get(key) : undefined) ?? this.st.styles.get(key)
  }

  /** a style and the styles it inherits from (not the default style) */
  chain(family: string, name: string | undefined): ONode[] {
    const out: ONode[] = []
    for (let s = this.look(family, name); s && out.length < 32 && !out.includes(s); s = this.look(family, s.attrs['style:parent-style-name'])) out.push(s)
    return out
  }

  /** a property group of a style with what it inherits (the family's default style first) */
  props(family: string, name: string | undefined, group: string): Record<string, string> {
    const out: Record<string, string> = { ...child(this.st.defaults.get(family), group)?.attrs }
    for (const s of this.chain(family, name).reverse()) Object.assign(out, child(s, group)?.attrs)
    return out
  }

  readonly font = (name: string | undefined) => this.st.font(name)

  private assignStyleIds() {
    const take = (s: ONode, family: string) => {
      let [id, name] = wordStyleName(displayName(s))
      if (family === 'text' && this.takenIds.has(id)) id += 'Char'
      for (let n = 2, base = id; this.takenIds.has(id); n++) id = base + n
      for (let n = 2, base = name; this.takenNames.has(name.toLowerCase()); n++) name = `${base} ${n}`
      this.takenIds.add(id)
      this.takenNames.add(name.toLowerCase())
      this.styleIds.set(s, id)
      return name
    }
    for (const family of ['paragraph', 'text']) for (const s of this.common) if (s.attrs['style:family'] === family) this.names.set(s, take(s, family))
    if (!this.takenIds.has('Normal')) {
      this.takenIds.add('Normal')
      this.takenNames.add('normal')
    }
  }

  /** effective font size along a style chain (style first), from the default size */
  private chainSize(chain: ONode[], base = this.defaultSize): number {
    let sz = base
    for (const s of [...chain].reverse()) sz = fontSize(child(s, 'style:text-properties')?.attrs['fo:font-size'], sz) ?? sz
    return sz
  }

  /** a missing heading style ("Heading_20_2" referenced but not defined): Word's look of one */
  private synthHeading(name: string | undefined, level: number | undefined): string | undefined {
    const m = /^heading (\d)$/i.exec(decodeName(name ?? ''))
    const n = m ? Number(m[1]) : level
    if (!n || n < 1 || n > 9) return undefined
    const id = `Heading${n}`
    if (this.takenIds.has(id) && !this.synth.has(id)) {
      // a named style already maps to it
      for (const [s, sid] of this.styleIds) if (sid === id && s.attrs['style:family'] === 'paragraph') return id
      return undefined
    }
    if (!this.synth.has(id)) {
      const sz = [0, 18, 16, 14, 13, 12, 12, 12, 12, 12][n]
      this.synth.set(
        id,
        `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
          `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="${sz * 2}"/><w:szCs w:val="${sz * 2}"/></w:rPr></w:style>`,
      )
      this.takenIds.add(id)
    }
    return id
  }

  /** how a paragraph style resolves (cached per style and context) */
  para(name: string | undefined, heading?: number): ParaInfo {
    const key = `${this.inMaster ? 'm' : 'b'}:${heading ?? ''}:${name ?? ''}`
    let info = this.paraCache.get(key)
    if (info) return info
    const chain = this.chain('paragraph', name)
    const k = chain.findIndex((s) => this.common.has(s))
    const autos = k < 0 ? chain : chain.slice(0, k)
    const named = k < 0 ? undefined : chain[k]
    const styleId = named ? this.styleIds.get(named)! : ((heading || !chain.length ? this.synthHeading(name, heading) : undefined) ?? 'Normal')
    let sz = this.chainSize(k < 0 ? [] : chain.slice(k))
    let rp: RP = {}
    let pp: PP = {}
    for (const s of [...autos].reverse()) {
      const t = textProps(child(s, 'style:text-properties'), sz, this.font)
      rp = { ...rp, ...t }
      if (t.sz) sz = t.sz
      pp = mergePP(pp, paraProps(child(s, 'style:paragraph-properties')))
    }
    const attr = (a: string) => chain.find((s) => s.attrs[a] !== undefined)?.attrs[a]
    const full = mergePP(paraProps(child(this.st.defaults.get('paragraph'), 'style:paragraph-properties')), ...[...chain].reverse().map((s) => paraProps(child(s, 'style:paragraph-properties'))))
    const namedChain = k < 0 ? [] : chain.slice(k)
    const outline = Number(attr('style:default-outline-level'))
    info = {
      styleId,
      pp,
      rc: { rp, sz },
      sz,
      master: autos.find((s) => s.attrs['style:master-page-name'] !== undefined)?.attrs['style:master-page-name'] ?? named?.attrs['style:master-page-name'],
      listStyle: attr('style:list-style-name'),
      outline: outline > 0 ? outline : undefined,
      left: full.left ?? 0,
      first: full.first ?? 0,
      styleIndent: this.styleIndent(namedChain),
      tabs: this.styleTabs(namedChain),
    }
    this.usedIds.add(styleId)
    this.paraCache.set(key, info)
    return info
  }

  /** whether a style chain (style first) sets an indent before (or without) a style giving a list style */
  private styleIndent(chain: ONode[]): boolean {
    for (const s of chain) {
      if (s.attrs['style:list-style-name']) return false
      const a = child(s, 'style:paragraph-properties')?.attrs
      if (a && (a['fo:margin-left'] !== undefined || a['fo:text-indent'] !== undefined || a['fo:margin'] !== undefined)) return true
    }
    return false
  }

  /** tab stops (Word coordinates) a style chain (style first) ends up with */
  private styleTabs(chain: ONode[]): Tab[] | undefined {
    const k = chain.findIndex((s) => child(child(s, 'style:paragraph-properties'), 'style:tab-stops'))
    if (k < 0) return undefined
    const tabs = paraProps(child(chain[k], 'style:paragraph-properties')).tabs ?? []
    const base = this.tabsRelative ? (mergePP(...[...chain.slice(k)].reverse().map((s) => paraProps(child(s, 'style:paragraph-properties')))).left ?? 0) : 0
    return tabs.map((t) => ({ ...t, pos: t.pos + base }))
  }

  /** run properties of a character style with what it inherits (list labels; outer spans) */
  charProps(name: string | undefined, base = this.defaultSize): RP {
    const chain = this.chain('text', name)
    const key = `${this.inMaster}:${name}:${base}`
    let rp = this.charCache.get(key)
    if (rp) return { ...rp }
    rp = {}
    let sz = base
    for (const s of [...chain].reverse()) {
      const t = textProps(child(s, 'style:text-properties'), sz, this.font)
      rp = { ...rp, ...t }
      if (t.sz) sz = t.sz
    }
    this.charCache.set(key, rp)
    return { ...rp }
  }

  /** the run context inside a span (or link) with a text style */
  span(rc: RunCtx, name: string | undefined): RunCtx {
    if (!name) return rc
    let cache = this.spanCache.get(rc)
    if (!cache) this.spanCache.set(rc, (cache = new Map()))
    const key = (this.inMaster ? 'm:' : 'b:') + name
    let out = cache.get(key)
    if (out) return out
    const chain = this.chain('text', name)
    const k = chain.findIndex((s) => this.common.has(s))
    const autos = k < 0 ? chain : chain.slice(0, k)
    const named = k < 0 ? undefined : chain[k]
    let { rp, rStyle, rStyleNode, sz } = rc
    if (named) {
      const full = this.charProps(named.attrs['style:name'], sz)
      // an outer span's character style becomes direct formatting (a run has one style)
      if (rStyleNode && rStyleNode !== named) rp = { ...rp, ...this.charProps(rStyleNode.attrs['style:name'], sz) }
      rp = omit(rp, Object.keys(full))
      rStyle = this.styleIds.get(named)
      rStyleNode = named
      if (rStyle) this.usedIds.add(rStyle)
      if (full.sz) sz = full.sz
    }
    for (const s of [...autos].reverse()) {
      const t = textProps(child(s, 'style:text-properties'), sz, this.font)
      rp = { ...rp, ...t }
      if (t.sz) sz = t.sz
    }
    out = { rp, rStyle, rStyleNode, sz }
    cache.set(key, out)
    return out
  }

  rPr(rc: RunCtx): string {
    return (rc.x ??= rPrXml(rc.rp, rc.rStyle))
  }

  /** a list style by name */
  lists(name: string | undefined): ONode | undefined {
    if (!name) return undefined
    // headings' styles name the outline style ("Outline") as their list style
    return this.st.lists.get(name) ?? (this.outlineStyle?.attrs['style:name'] === name ? this.outlineStyle : undefined)
  }

  /** word/styles.xml: document defaults, the named styles, heading styles made up for missing ones */
  stylesXml(ns: string): string {
    const def = this.st.defaults.get('paragraph')
    const defRp = textProps(child(def, 'style:text-properties'), 12, this.font)
    defRp.sz ??= 12
    if (!defRp.font) defRp.font = 'Times New Roman'
    const defPp = paraProps(child(def, 'style:paragraph-properties'))
    delete defPp.tabs
    const pPrDef = pPrXml(mergePP({ after: 0, line: { v: 1, rule: 'auto' } }, defPp))
    let x = `<w:docDefaults><w:rPrDefault>${rPrXml(defRp) || '<w:rPr/>'}</w:rPrDefault><w:pPrDefault>${pPrDef || '<w:pPr/>'}</w:pPrDefault></w:docDefaults>`
    let normal = false
    for (const [s, id] of this.styleIds) {
      const family = s.attrs['style:family']
      const name = this.names.get(s) ?? id
      const parent = this.look(family, s.attrs['style:parent-style-name'])
      const basedOn = parent && this.common.has(parent) ? this.styleIds.get(parent) : undefined
      const chain = this.chain(family, s.attrs['style:name'])
      const parentSz = this.chainSize(chain.slice(1))
      const rp = textProps(child(s, 'style:text-properties'), parentSz, this.font)
      const used = this.usedIds.has(id)
      if (family === 'paragraph') {
        const isNormal = id === 'Normal'
        normal ||= isNormal
        const next = this.look('paragraph', s.attrs['style:next-style-name'])
        const nextId = next && this.styleIds.get(next)
        const pp = paraProps(child(s, 'style:paragraph-properties'))
        const lvl = Number(s.attrs['style:default-outline-level'])
        const base = this.tabsRelative ? (mergePP(...[...chain].reverse().map((c) => paraProps(child(c, 'style:paragraph-properties')))).left ?? 0) : 0
        const pPr = pPrXml(pp, { outline: lvl >= 1 && lvl <= 9 ? lvl - 1 : undefined, tabBase: base, inheritedTabs: this.styleTabs(chain.slice(1)), sz: this.chainSize(chain) })
        const quick = used || isNormal || lvl > 0 || id === 'Title' || id === 'Subtitle'
        x +=
          `<w:style w:type="paragraph"${isNormal ? ' w:default="1"' : ''} w:styleId="${escAttr(id)}"><w:name w:val="${escAttr(name)}"/>` +
          (basedOn && !isNormal ? `<w:basedOn w:val="${escAttr(basedOn)}"/>` : '') +
          (nextId ? `<w:next w:val="${escAttr(nextId)}"/>` : '') +
          (quick ? '<w:qFormat/>' : '') +
          pPr +
          rPrXml(rp) +
          '</w:style>'
      } else {
        x +=
          `<w:style w:type="character" w:styleId="${escAttr(id)}"><w:name w:val="${escAttr(name)}"/>` +
          (basedOn ? `<w:basedOn w:val="${escAttr(basedOn)}"/>` : '') +
          (used ? '<w:qFormat/>' : '') +
          rPrXml(rp) +
          '</w:style>'
      }
    }
    if (!normal) x += '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    x += [...this.synth.values()].join('')
    return `${XML_HEAD}<w:styles ${ns}>${x}</w:styles>`
  }
}
