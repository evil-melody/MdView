/** `\stylesheet` entries → Word styles (paragraph and character), and the formatting each style gives. */
import { escAttr } from '../../raw'
import { pPrDiff, rPrDiff, rPrOwn, type Chp, type Pap, type Tables } from './props'

export interface StyleDef {
  num: number
  /** p: paragraph, c: character, t: table, d: section */
  kind: 'p' | 'c' | 't' | 'd'
  name: string
  basedOn?: number
  next?: number
  link?: number
  qformat?: boolean
  semiHidden?: boolean
  unhide?: boolean
  hidden?: boolean
  priority?: number
  ch: Chp
  pp: Pap
}

/** Word's ids of built-in styles, by (lower-case) name */
const BUILTIN: Record<string, string> = {
  normal: 'Normal', title: 'Title', subtitle: 'Subtitle', 'default paragraph font': 'DefaultParagraphFont',
  'footnote text': 'FootnoteText', 'footnote reference': 'FootnoteReference', 'endnote text': 'EndnoteText',
  'endnote reference': 'EndnoteReference', header: 'Header', footer: 'Footer', hyperlink: 'Hyperlink',
  'list paragraph': 'ListParagraph', caption: 'Caption', 'no spacing': 'NoSpacing', quote: 'Quote',
}

function styleId(name: string): string {
  const k = name.toLowerCase()
  if (BUILTIN[k]) return BUILTIN[k]
  const h = /^heading\s*(\d)$/.exec(k)
  if (h) return `Heading${h[1]}`
  const toc = /^toc\s*(\d)$/.exec(k)
  if (toc) return `TOC${toc[1]}`
  return name
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
    .replace(/[^A-Za-z0-9]/g, '')
}

export class RtfStyles {
  readonly para = new Map<number, StyleDef>()
  readonly char = new Map<number, StyleDef>()
  private ids = new Map<StyleDef, string>()
  private used = new Set<string>()
  private paraCache = new Map<number, { ch: Chp; pp: Pap }>()
  private runCache = new Map<string, Chp>()
  /** styles added for content the stylesheet does not cover (footnotes) */
  private extra: string[] = []
  defChp: Chp = {}
  defPap: Pap = {}

  constructor(private t: Tables) {}

  /** the document defaults (\deff, \defchp, \defpap) */
  setDefaults(ch: Chp, pp: Pap) {
    this.defChp = ch
    this.defPap = pp
    this.paraCache.clear()
    this.runCache.clear()
  }

  add(d: StyleDef) {
    if (d.kind === 'p') {
      if (!this.para.has(d.num)) this.para.set(d.num, d)
    } else if (d.kind === 'c' && !this.char.has(d.num)) this.char.set(d.num, d)
  }

  /** gives every style its id (once the stylesheet is read); paragraphs without \s are style 0, Word's Normal */
  finish() {
    if (!this.para.has(0)) this.para.set(0, { num: 0, kind: 'p', name: 'Normal', ch: {}, pp: {} })
    const normal = this.para.get(0)!
    if (!this.ids.has(normal)) this.assign(normal, 'Normal')
    for (const d of [...this.para.values(), ...this.char.values()]) {
      if (this.ids.has(d)) continue
      let id = styleId(d.name.split(',')[0].trim()) || (d.kind === 'p' ? `Style${d.num}` : `CharStyle${d.num}`)
      if (/^\d/.test(id)) id = 'S' + id
      this.assign(d, id)
    }
    this.paraCache.clear()
    this.runCache.clear()
  }

  private assign(d: StyleDef, id: string) {
    let x = id
    for (let k = 2; this.used.has(x.toLowerCase()); k++) x = `${id}${k}`
    this.used.add(x.toLowerCase())
    this.ids.set(d, x)
  }

  /** w:styleId of paragraph style `num` (undefined: the default style) */
  paraId(num: number | undefined): string | undefined {
    if (!num) return undefined
    const d = this.para.get(num)
    return d ? this.ids.get(d) : undefined
  }

  charId(num: number | undefined): string | undefined {
    if (num === undefined) return undefined
    const d = this.char.get(num)
    return d ? this.ids.get(d) : undefined
  }

  /** a style chain, the root first */
  private chain(map: Map<number, StyleDef>, num: number | undefined): StyleDef[] {
    const out: StyleDef[] = []
    const seen = new Set<number>()
    let d = num === undefined ? undefined : map.get(num)
    while (d && !seen.has(d.num) && out.length < 32) {
      seen.add(d.num)
      out.unshift(d)
      d = d.basedOn === undefined || d.basedOn === d.num ? undefined : map.get(d.basedOn)
    }
    return out
  }

  /**
   * what paragraph style `num` gives (complete): Word and LibreOffice write each paragraph style in full, so what its
   * entry leaves out is the RTF default, not its parent's value
   */
  paraBase(num: number | undefined): { ch: Chp; pp: Pap } {
    const key = num !== undefined && this.para.has(num) ? num : 0
    let r = this.paraCache.get(key)
    if (r) return r
    const d = this.para.get(key)
    r = { ch: { ...this.defChp, ...d?.ch }, pp: { ...this.defPap, ...d?.pp } }
    this.paraCache.set(key, r)
    return r
  }

  /** what text in paragraph style `para` and character style `cs` gets from them (complete) */
  runBase(para: number | undefined, cs: number | undefined): Chp {
    const key = `${para ?? 0}:${cs ?? ''}`
    let r = this.runCache.get(key)
    if (r) return r
    r = { ...this.paraBase(para).ch }
    for (const d of this.chain(this.char, cs)) Object.assign(r, d.ch)
    delete r.cs
    this.runCache.set(key, r)
    return r
  }

  /** a style the document needs that the stylesheet may lack */
  ensure(id: string, xml: string) {
    if (this.used.has(id.toLowerCase())) return
    this.used.add(id.toLowerCase())
    this.extra.push(xml)
  }

  has(id: string): boolean {
    return this.used.has(id.toLowerCase())
  }

  /** the w:style elements */
  xml(): string {
    const t = this.t
    let out = ''
    const meta = (d: StyleDef, map: Map<number, StyleDef>) => {
      const ref = (n: number | undefined) => {
        const s = n === undefined ? undefined : map.get(n)
        return s && s !== d ? this.ids.get(s) : undefined
      }
      const basedOn = ref(d.basedOn)
      const next = d.kind === 'p' ? ref(d.next) : undefined
      const linked = d.link === undefined ? undefined : (d.kind === 'p' ? this.char : this.para).get(d.link)
      const link = linked ? this.ids.get(linked) : undefined
      return (
        `<w:name w:val="${escAttr(d.name.split(',')[0].trim() || this.ids.get(d)!)}"/>` +
        (basedOn ? `<w:basedOn w:val="${basedOn}"/>` : '') +
        (next ? `<w:next w:val="${next}"/>` : '') +
        (link ? `<w:link w:val="${link}"/>` : '') +
        (d.hidden ? '<w:hidden/>' : '') +
        (d.priority !== undefined ? `<w:uiPriority w:val="${d.priority}"/>` : '') +
        (d.semiHidden ? '<w:semiHidden/>' : '') +
        (d.unhide ? '<w:unhideWhenUsed/>' : '') +
        (d.qformat || d.num === 0 ? '<w:qFormat/>' : '')
      )
    }
    const NOT_PPR = ['s', 'intbl', 'itap', 'ls', 'ilvl', 'pn'] as const
    const ppr = (p: Pap) => {
      const x = { ...p }
      for (const k of NOT_PPR) delete x[k]
      return x
    }
    for (const d of this.para.values()) {
      const own = this.paraBase(d.num)
      const parent = d.basedOn !== undefined && d.basedOn !== d.num && this.para.has(d.basedOn) ? this.paraBase(d.basedOn) : { ch: this.defChp, pp: this.defPap }
      const pPr = pPrDiff(t, ppr(own.pp), ppr(parent.pp)).replace(/^<w:pPr>|<\/w:pPr>$/g, '')
      const ls = own.pp.ls
      const numPr = ls !== undefined && (ls !== parent.pp.ls || own.pp.ilvl !== parent.pp.ilvl) ? `<w:numPr>${own.pp.ilvl !== undefined ? `<w:ilvl w:val="${own.pp.ilvl}"/>` : ''}<w:numId w:val="${ls}"/></w:numPr>` : ''
      const rPr = rPrDiff(t, { ...own.ch, cs: undefined }, parent.ch)
      out +=
        `<w:style w:type="paragraph"${d.num === 0 ? ' w:default="1"' : ''} w:styleId="${this.ids.get(d)}">${meta(d, this.para)}` +
        (pPr || numPr ? `<w:pPr>${injectNumPr(pPr, numPr)}</w:pPr>` : '') +
        (rPr ? `<w:rPr>${rPr}</w:rPr>` : '') +
        '</w:style>'
    }
    const hasDefaultChar = [...this.char.values()].some((d) => this.ids.get(d) === 'DefaultParagraphFont')
    for (const d of this.char.values()) {
      const parent = d.basedOn !== undefined && d.basedOn !== d.num && this.char.has(d.basedOn) ? this.runBase(undefined, d.basedOn) : this.defChp
      const own = { ...d.ch }
      delete own.cs
      const rPr = rPrOwn(t, own, parent)
      const isDefault = this.ids.get(d) === 'DefaultParagraphFont'
      out +=
        `<w:style w:type="character"${isDefault ? ' w:default="1"' : ''} w:styleId="${this.ids.get(d)}">${meta(d, this.char)}` +
        (rPr ? `<w:rPr>${rPr}</w:rPr>` : '') +
        '</w:style>'
    }
    if (!hasDefaultChar)
      out += '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>'
    return out + this.extra.join('')
  }
}

/** w:numPr goes after keepNext / keepLines / pageBreakBefore / widowControl */
function injectNumPr(pPr: string, numPr: string): string {
  if (!numPr) return pPr
  const m = /^((?:<w:(?:keepNext|keepLines|pageBreakBefore|widowControl)[^>]*\/>)*)/.exec(pPr)
  const head = m ? m[1] : ''
  return head + numPr + pPr.slice(head.length)
}
