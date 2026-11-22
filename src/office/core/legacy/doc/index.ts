/**
 * Word 97-2003 binary documents (.doc, MS-DOC) → DOCX: the text with its character, paragraph and section
 * properties, styles, lists, tables, fields, pictures, headers / footers, notes and comments become WordprocessingML.
 */
import { escAttr } from '../../raw'
import { Part, XML_HEAD } from '../../iwork/ooxml'
import { writeZip, type PartData } from '../../zipwrite'
import type { Cfb } from '../cfb'
import { IMAGE_TYPES, imageBytes } from './art'
import { DocModel } from './model'
import { applyChp, DEFAULT_PAP, type Chp } from './props'
import { lvlXml, NS, pPrXml, rPrXml, sectPrXml } from './wml'
import { Writer } from './writer'

const WML = 'application/vnd.openxmlformats-officedocument.wordprocessingml'
const HF_TYPES = ['even', 'default', 'even', 'default', 'first', 'first']
const FAMILY = ['auto', 'roman', 'swiss', 'modern', 'script', 'decorative', 'auto', 'auto']
const PITCH = ['default', 'fixed', 'variable', 'default']

/** a part's content ends with a paragraph (headers, notes, cells) */
const endPara = (xml: string) => (!xml ? '<w:p/>' : xml.endsWith('</w:tbl>') ? xml + '<w:p/>' : xml)

class Packager {
  private doc = new Part('word/document.xml')
  private w: Writer
  private files = new Map<string, PartData>()
  private overrides: string[] = []

  constructor(private m: DocModel) {
    this.w = new Writer(m, this.doc)
  }

  private add(path: string, xml: string, type: string, part?: Part) {
    this.files.set(path, xml)
    this.overrides.push(`<Override PartName="/${path}" ContentType="${type}"/>`)
    if (part?.rels.length) this.files.set(part.relsPath, part.relsXml())
  }

  /** writes a story into its own part (its pictures and links are that part's relationships) */
  private inPart<T>(part: Part, fn: () => T): T {
    const saved = this.w.part
    this.w.part = part
    try {
      return fn()
    } finally {
      this.w.part = saved
    }
  }

  async pack(): Promise<Blob> {
    const { m, w } = this
    const hf = new Map<string, string>()
    let nHdr = 0
    let nFtr = 0
    // headers / footers: a section without its own takes the previous section's
    const eff: ([number, number] | undefined)[] = [undefined, undefined, undefined, undefined, undefined, undefined]
    const sectPrs = new Map<number, string>()
    let finalSect = ''
    m.sections.forEach((sec, i) => {
      let refs = ''
      for (let k = 0; k < 6; k++) {
        const s = m.headerStory(i, k)
        if (s) eff[k] = s
        const story = eff[k]
        if (!story || ((k === 0 || k === 2) && !m.facingPages)) continue
        const key = `${story[0]}:${story[1]}`
        let rid = hf.get(key)
        const header = k % 4 < 2
        if (!rid) {
          const name = header ? `header${++nHdr}.xml` : `footer${++nFtr}.xml`
          const part = new Part('word/' + name)
          const body = this.inPart(part, () => w.story(story[0], story[1], 'hdr'))
          const tag = header ? 'hdr' : 'ftr'
          this.add(`word/${name}`, `${XML_HEAD}<w:${tag} ${NS}>${endPara(body)}</w:${tag}>`, `${WML}.${header ? 'header' : 'footer'}+xml`, part)
          rid = this.doc.rel(header ? 'header' : 'footer', name)
          hf.set(key, rid)
        }
        refs += `<w:${header ? 'header' : 'footer'}Reference w:type="${HF_TYPES[k]}" r:id="${rid}"/>`
      }
      // header references first, then footer references (schema order: any order among them is accepted)
      const xml = sectPrXml(sec.sep, refs, i === 0)
      if (i === m.sections.length - 1) finalSect = xml
      else sectPrs.set(sec.cp1, xml)
    })

    const body = w.story(0, m.fib.ccpText, 'main', sectPrs)
    const documentXml = `${XML_HEAD}<w:document ${NS}><w:body>${body || '<w:p/>'}${finalSect}</w:body></w:document>`

    // notes and comments
    const sep = (type: string, id: number, el: string) =>
      `<w:${type} w:type="${el === 'separator' ? 'separator' : 'continuationSeparator'}" w:id="${id}"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:${el}/></w:r></w:p></w:${type}>`
    for (const [kind, notes] of [['footnote', m.footnotes], ['endnote', m.endnotes]] as const) {
      if (!notes.length) continue
      const part = new Part(`word/${kind}s.xml`)
      let xml = sep(kind, -1, 'separator') + sep(kind, 0, 'continuationSeparator')
      notes.forEach((n, k) => {
        const story = this.inPart(part, () => w.story(n.cp0, n.cp1, kind === 'footnote' ? 'ftn' : 'edn'))
        xml += `<w:${kind} w:id="${k + 1}">${endPara(story)}</w:${kind}>`
      })
      this.add(`word/${kind}s.xml`, `${XML_HEAD}<w:${kind}s ${NS}>${xml}</w:${kind}s>`, `${WML}.${kind}s+xml`, part)
      this.doc.rel(`${kind}s`, `${kind}s.xml`)
    }
    if (m.comments.length) {
      const part = new Part('word/comments.xml')
      let xml = ''
      m.comments.forEach((c, k) => {
        const story = this.inPart(part, () => w.story(c.cp0, c.cp1, 'atn'))
        xml += `<w:comment w:id="${k}" w:author="${escAttr(c.author || 'Unknown')}"${c.initials ? ` w:initials="${escAttr(c.initials)}"` : ''}>${endPara(story)}</w:comment>`
      })
      this.add('word/comments.xml', `${XML_HEAD}<w:comments ${NS}>${xml}</w:comments>`, `${WML}.comments+xml`, part)
      this.doc.rel('comments', 'comments.xml')
    }

    this.add('word/styles.xml', this.stylesXml(), `${WML}.styles+xml`)
    this.doc.rel('styles', 'styles.xml')
    const numbering = this.numberingXml()
    if (numbering) {
      this.add('word/numbering.xml', numbering, `${WML}.numbering+xml`)
      this.doc.rel('numbering', 'numbering.xml')
    }
    this.add('word/settings.xml', this.settingsXml(), `${WML}.settings+xml`)
    this.doc.rel('settings', 'settings.xml')
    this.add('word/fontTable.xml', this.fontsXml(), `${WML}.fontTable+xml`)
    this.doc.rel('fontTable', 'fontTable.xml')

    // media
    const exts = new Set<string>()
    for (const f of w.pics.media) {
      this.files.set('word/media/' + f.name, await imageBytes(f.blip))
      exts.add(f.name.slice(f.name.lastIndexOf('.') + 1))
    }
    const defaults = [...exts].map((e) => `<Default Extension="${e}" ContentType="${IMAGE_TYPES[(e === 'jpeg' ? 'jpeg' : e) as keyof typeof IMAGE_TYPES] ?? 'application/octet-stream'}"/>`).join('')

    this.files.set('word/document.xml', documentXml)
    this.overrides.unshift(`<Override PartName="/word/document.xml" ContentType="${WML}.document.main+xml"/>`)
    this.files.set(this.doc.relsPath, this.doc.relsXml())
    this.files.set(
      '[Content_Types].xml',
      `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${defaults}${this.overrides.join('')}</Types>`,
    )
    this.files.set(
      '_rels/.rels',
      `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    )
    return writeZip(this.files, `${WML}.document`)
  }

  private stylesXml(): string {
    const { m } = this
    const st = m.styles
    const root = st.root
    const fonts = m.fonts
    const f = (i: number) => escAttr(fonts[i]?.name ?? 'Times New Roman')
    let out =
      `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${f(root.f0)}" w:hAnsi="${f(root.f2)}" w:eastAsia="${f(root.f1)}" w:cs="${f(root.fBi)}"/>` +
      `<w:sz w:val="${root.hps}"/><w:szCs w:val="${root.hpsBi}"/></w:rPr></w:rPrDefault>` +
      '<w:pPrDefault/></w:docDefaults>'
    for (const s of st.styles) {
      if (!s || (s.stk !== 1 && s.stk !== 2)) continue
      const base = st.baseOf(s.istd)
      const baseId = base >= 0 ? st.style(base)?.id : undefined
      let head = `<w:name w:val="${escAttr(s.name)}"/>`
      if (s.aliases) head += `<w:aliases w:val="${escAttr(s.aliases)}"/>`
      if (baseId) head += `<w:basedOn w:val="${baseId}"/>`
      if (s.stk === 1) {
        const next = st.style(s.next)
        if (next && next.stk === 1 && s.next !== s.istd) head += `<w:next w:val="${next.id}"/>`
        if (s.hidden) head += '<w:hidden/>'
        if (s.sti <= 9 || s.sti === 62 || s.sti === 74) head += '<w:qFormat/>'
        const pap = st.pap(s.istd)
        const bp = base >= 0 ? st.pap(base) : DEFAULT_PAP
        let numPr: string | undefined
        if (pap.ilfo !== bp.ilfo || pap.ilvl !== bp.ilvl) {
          const id = this.w.numId(pap.ilfo)
          numPr = `<w:numPr>${pap.ilvl ? `<w:ilvl w:val="${pap.ilvl}"/>` : ''}<w:numId w:val="${id}"/></w:numPr>`
        }
        const pPr = pPrXml({ ...pap, inTable: false }, bp, { numPr })
        const rPr = rPrXml(st.chp(s.istd), base >= 0 ? st.chp(base) : root, fonts)
        out += `<w:style w:type="paragraph" w:styleId="${s.id}"${s.istd === 0 ? ' w:default="1"' : ''}>${head}${pPr}${rPr}</w:style>`
      } else {
        if (s.sti === 65) head += '<w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/>'
        else if (s.hidden) head += '<w:hidden/>'
        const own: Chp = { ...root, ...st.charDelta(s.istd) }
        const parent: Chp = { ...root, ...(base >= 0 ? st.charDelta(base) : {}) }
        out += `<w:style w:type="character" w:styleId="${s.id}"${s.sti === 65 ? ' w:default="1"' : ''}>${head}${rPrXml(own, parent, fonts)}</w:style>`
      }
    }
    return `${XML_HEAD}<w:styles ${NS}>${out}</w:styles>`
  }

  private numberingXml(): string | undefined {
    const { m } = this
    if (!m.lsts.length || !m.lfos.length) return undefined
    const st = m.styles
    const root = m.styles.root
    const rPr = (chpx: Uint8Array) => {
      const c: Chp = { ...root }
      applyChp(c, chpx, root)
      return rPrXml(c, root, m.fonts)
    }
    let abs = ''
    m.lsts.forEach((l, k) => {
      let lvls = ''
      l.lvls.forEach((lvl, i) => {
        const istd = l.istds[i]
        const ps = istd !== 0xfff ? st.style(istd) : undefined
        lvls += lvlXml(i, lvl, rPr(lvl.chpx), ps && ps.stk === 1 ? ps.id : undefined)
      })
      const type = l.simple ? 'singleLevel' : l.hybrid ? 'hybridMultilevel' : 'multilevel'
      abs += `<w:abstractNum w:abstractNumId="${k}"><w:nsid w:val="${(l.lsid >>> 0).toString(16).toUpperCase().padStart(8, '0')}"/><w:multiLevelType w:val="${type}"/>${lvls}</w:abstractNum>`
    })
    let nums = ''
    m.lfos.forEach((lfo, k) => {
      let a = m.lsts.findIndex((l) => l.lsid === lfo.lsid)
      if (a < 0) a = 0
      let ov = ''
      for (const o of lfo.overrides) {
        if (o.ilvl > 8) continue
        let x = ''
        if (o.start !== undefined) x += `<w:startOverride w:val="${Math.max(0, o.start)}"/>`
        if (o.lvl) x += lvlXml(o.ilvl, o.lvl, rPr(o.lvl.chpx))
        if (x) ov += `<w:lvlOverride w:ilvl="${o.ilvl}">${x}</w:lvlOverride>`
      }
      nums += `<w:num w:numId="${k + 1}"><w:abstractNumId w:val="${a}"/>${ov}</w:num>`
    })
    return `${XML_HEAD}<w:numbering ${NS}>${abs}${nums}</w:numbering>`
  }

  private settingsXml(): string {
    const { m } = this
    let x = ''
    if (m.mirrorMargins) x += '<w:mirrorMargins/>'
    x += `<w:defaultTabStop w:val="${m.defaultTab}"/>`
    if (m.facingPages) x += '<w:evenAndOddHeaders/>'
    x += '<w:characterSpacingControl w:val="doNotCompress"/>'
    if (m.footnotes.length) x += '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>'
    if (m.endnotes.length) x += '<w:endnotePr><w:endnote w:id="-1"/><w:endnote w:id="0"/></w:endnotePr>'
    x += '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>'
    return `${XML_HEAD}<w:settings ${NS}>${x}</w:settings>`
  }

  private fontsXml(): string {
    const seen = new Set<string>()
    let x = ''
    for (const f of this.m.fonts) {
      if (seen.has(f.name)) continue
      seen.add(f.name)
      x +=
        `<w:font w:name="${escAttr(f.name)}">${f.alt ? `<w:altName w:val="${escAttr(f.alt)}"/>` : ''}` +
        `<w:charset w:val="${f.charset.toString(16).toUpperCase().padStart(2, '0')}"/><w:family w:val="${FAMILY[f.family]}"/><w:pitch w:val="${PITCH[f.pitch]}"/></w:font>`
    }
    return `${XML_HEAD}<w:fonts ${NS}>${x}</w:fonts>`
  }
}

/** Converts the Word document in a compound file to a DOCX file. */
export async function docToDocx(cfb: Cfb): Promise<Blob> {
  return new Packager(new DocModel(cfb)).pack()
}
