/**
 * PowerPoint 97-2003 → PPTX package. Each main master (with the color scheme its slides use) becomes a slide master
 * with its own theme; title masters become "Title Slide" layouts (their shapes and background, the master's hidden),
 * other layouts carry the master's placeholders. Slides keep their shapes, background, hidden flag, headers and
 * footers (copies of the master's placeholders) and notes. Colors are written as RGB, resolved with the scheme of
 * the slide, so per-slide schemes keep their look.
 */
import { THEME } from '../../convert'
import { Part, XML_HEAD } from '../../iwork/ooxml'
import { escAttr, escText } from '../../raw'
import { writeZip, type PartData } from '../../zipwrite'
import type { Cfb } from '../cfb'
import { PptDocument, type HeadersFooters, type SlideRef } from './document'
import { BlipStore, patternBmp, type Props } from './escher'
import { dateText, emu, lvlXml, TextStyles, type TextEnv } from './paragraphs'
import { Rec, RT } from './records'
import { allShapes, drawingOf, DrawingWriter, shapeInfo, type ShapeInfo } from './shapes'
import { progTag, TX, type TextBlock } from './text'

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const GRP =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
const CLR_MAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
const PML = 'application/vnd.openxmlformats-officedocument.presentationml'
/** PowerPoint's default scheme: background, text, shadow, title, fill, accent, hyperlink, followed hyperlink */
const DEFAULT_SCHEME = ['FFFFFF', '000000', '808080', '000000', '00CC99', '3333CC', 'CCCCFF', 'B2B2B2']
const JUMPS = ['', 'nextslide', 'previousslide', 'firstslide', 'lastslide', 'lastslideviewed', 'endshow']
const MEDIA_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', bmp: 'image/bmp', gif: 'image/gif', emf: 'image/x-emf', wmf: 'image/x-wmf', tiff: 'image/tiff' }

/** placeholder types: footers on masters, title / body on masters and title masters */
const FOOTER_PH = new Set([7, 8, 9])

interface MasterRec {
  ref: SlideRef
  rec: Rec
  main: boolean
  /** a title master's main master */
  mainId?: number
  /** SlideAtom flags: 1 master objects, 2 master scheme, 4 master background */
  flags: number
}

type LayoutKind = 'title' | 'obj' | 'blank' | `t${number}`

interface OutMaster {
  n: number
  main: MasterRec | undefined
  scheme: string[]
  layouts: Map<LayoutKind, number>
}

interface OutLayout {
  n: number
  master: OutMaster
  kind: LayoutKind
}

const solid = (c: string) => `<a:solidFill><a:srgbClr val="${c}"/></a:solidFill>`
const bgXml = (fill: string) => `<p:bg><p:bgPr>${fill}<a:effectLst/></p:bgPr></p:bg>`

export class PptConverter {
  private doc: PptDocument
  private blips: BlipStore
  private files = new Map<string, PartData>()
  private overrides: string[] = []
  private masterRecs = new Map<number, MasterRec>()
  private mainMasters: MasterRec[] = []
  private masterShapes = new Map<number, Props>()
  private outMasters = new Map<string, OutMaster>()
  private outLayouts: OutLayout[] = []
  private styleCache = new Map<number, TextStyles>()
  private mediaNames = new Map<number, Promise<string | undefined>>()
  private mediaExts = new Set<string>()
  /** output slide number by PPT slide id */
  private slideNumbers = new Map<number, number>()
  /** comment authors (name and initials) by name */
  private authors = new Map<string, { id: number; initials: string; last: number }>()

  constructor(cfb: Cfb) {
    this.doc = new PptDocument(cfb)
    const dgg = this.doc.doc.kid(RT.PPDrawingGroup)?.kid(RT.DggContainer)
    this.blips = new BlipStore(dgg, this.doc.pictures)
  }

  private styles(m: MasterRec | undefined): TextStyles {
    const key = m?.ref.slideId ?? -1
    let s = this.styleCache.get(key)
    if (!s) this.styleCache.set(key, (s = new TextStyles(this.doc, m?.rec)))
    return s
  }

  private media = (pib: number): Promise<string | undefined> => {
    let p = this.mediaNames.get(pib)
    if (!p) {
      p = this.blips.get(pib).then((b) => {
        if (!b || !MEDIA_TYPES[b.ext] || !b.data.length) return undefined
        const name = `image${pib}.${b.ext}`
        this.files.set(`ppt/media/${name}`, b.data)
        this.mediaExts.add(b.ext)
        return name
      })
      this.mediaNames.set(pib, p)
    }
    return p
  }

  private patterns = new Map<string, Promise<string | undefined>>()

  private pattern = (pib: number, fore: string, back: string): Promise<string | undefined> => {
    const key = `${pib}-${fore}-${back}`
    let p = this.patterns.get(key)
    if (!p) {
      p = this.blips.get(pib).then((b) => {
        const data = patternBmp(b, fore, back)
        if (!data) return undefined
        const name = `pattern${this.patterns.size}.bmp`
        this.files.set(`ppt/media/${name}`, data)
        this.mediaExts.add('bmp')
        return name
      })
      this.patterns.set(key, p)
    }
    return p
  }

  /** hlinkClick of an InteractiveInfo container */
  private link(info: Rec, part: Part): string {
    const atom = info.kid(RT.InteractiveInfoAtom)
    if (!atom) return ''
    const action = atom.u8(8)
    if (action === 4) {
      const l = this.doc.links.get(atom.u32(4))
      const url = l?.url?.replace(/[\u0000-\u001f\u007f]/g, '').trim()
      if (url) return `<a:hlinkClick r:id="${part.rel('hyperlink', url, true)}"/>`
      const id = Number(l?.location?.split(',')[0])
      const n = this.slideNumbers.get(id)
      if (n) return `<a:hlinkClick r:id="${part.rel('slide', `../slides/slide${n}.xml`)}" action="ppaction://hlinksldjump"/>`
    }
    if (action === 3) {
      const j = JUMPS[atom.u8(10)]
      if (j) return `<a:hlinkClick r:id="" action="ppaction://hlinkshowjump?jump=${j}"/>`
    }
    return ''
  }

  /** the 8 colors of a container's own scheme */
  private ownScheme(rec: Rec | undefined): string[] | undefined {
    const s = rec?.kid(RT.ColorSchemeAtom, 1)
    if (!s || s.len < 32) return undefined
    return Array.from({ length: 8 }, (_, i) => [s.u8(i * 4), s.u8(i * 4 + 1), s.u8(i * 4 + 2)].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase())
  }

  /** the scheme in effect on a master (a title master may follow its main master's) */
  private schemeOf(m: MasterRec | undefined, depth = 0): string[] {
    if (!m) return DEFAULT_SCHEME
    if (!m.main && m.flags & 2 && depth < 2) return this.schemeOf(this.masterRecs.get(m.mainId ?? -1), depth + 1)
    return this.ownScheme(m.rec) ?? (m.main ? DEFAULT_SCHEME : this.schemeOf(this.masterRecs.get(m.mainId ?? -1), depth + 1))
  }

  private env(part: Part, m: MasterRec | undefined, scheme: string[], slideNumber?: number, values?: TextEnv['values']): TextEnv {
    return { doc: this.doc, styles: this.styles(m), scheme, link: (info) => this.link(info, part), slideNumber, values }
  }

  private writer(part: Part, env: TextEnv, extra: Partial<ConstructorParameters<typeof DrawingWriter>[0]> = {}): DrawingWriter {
    return new DrawingWriter({ doc: this.doc, blips: this.blips, media: this.media, pattern: this.pattern, part, env, masters: this.masterShapes, ids: { n: 1 }, ...extra })
  }

  async convert(): Promise<Blob> {
    const doc = this.doc
    for (const ref of doc.masters) {
      if (!ref.rec || (ref.rec.type !== RT.MainMaster && ref.rec.type !== RT.Slide)) continue
      const atom = ref.rec.kid(RT.SlideAtom)
      const main = ref.rec.type === RT.MainMaster
      const m: MasterRec = { ref, rec: ref.rec, main, mainId: main ? undefined : atom?.u32(12), flags: atom?.u16(20) ?? 7 }
      this.masterRecs.set(ref.slideId, m)
      if (main) this.mainMasters.push(m)
    }
    // master shapes, which placeholders and other shapes take their properties from (main masters first)
    const notesMaster = doc.get(doc.doc.kid(RT.DocumentAtom)?.u32(24) ?? 0)
    const sources = [...this.mainMasters.map((m) => m.rec), ...[...this.masterRecs.values()].filter((m) => !m.main).map((m) => m.rec), notesMaster]
    for (const rec of sources) {
      for (const sp of allShapes(drawingOf(rec))) {
        const s = shapeInfo(sp, this.masterShapes)
        if (s.spid && !this.masterShapes.has(s.spid)) this.masterShapes.set(s.spid, s.props)
      }
    }

    const slides = doc.slides.filter((s) => s.rec?.type === RT.Slide)
    slides.forEach((s, k) => this.slideNumbers.set(s.slideId, k + 1))
    const presRels = new Part('ppt/presentation.xml')
    const slideIds: string[] = []
    const notes: { n: number; xml: string; part: Part }[] = []
    for (let k = 0; k < slides.length; k++) {
      const r = await this.slide(slides[k], k)
      if (r.notes) notes.push({ n: k + 1, ...r.notes })
    }
    if (!this.mainMasters.length && !this.outMasters.size) this.outMaster(undefined, DEFAULT_SCHEME)
    if (!this.outMasters.size) this.outMaster(this.mainMasters[0], this.schemeOf(this.mainMasters[0]))

    // layouts every master offers (title, title and content, blank)
    for (const om of this.outMasters.values()) {
      const kinds = [...om.layouts.keys()]
      if (!kinds.some((k) => k === 'title' || k.startsWith('t'))) this.layout(om, 'title')
      this.layout(om, 'obj')
      this.layout(om, 'blank')
    }
    let nextId = 2147483648
    const masterIds: string[] = []
    for (const om of this.outMasters.values()) {
      masterIds.push(`<p:sldMasterId id="${nextId++}" r:id="${presRels.rel('slideMaster', `slideMasters/slideMaster${om.n}.xml`)}"/>`)
      nextId = await this.masterXml(om, nextId)
    }
    for (const l of this.outLayouts) await this.layoutXml(l)
    for (let k = 0; k < slides.length; k++) slideIds.push(`<p:sldId id="${256 + k}" r:id="${presRels.rel('slide', `slides/slide${k + 1}.xml`)}"/>`)

    let notesMasterLst = ''
    if (notes.length) {
      const nm = new Part('ppt/notesMasters/notesMaster1.xml')
      const theme = this.outMasters.size + 1
      nm.rel('theme', `../theme/theme${theme}.xml`)
      this.files.set(`ppt/theme/theme${theme}.xml`, THEME)
      this.overrides.push(`<Override PartName="/ppt/theme/theme${theme}.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`)
      this.files.set(nm.path, this.notesMasterXml())
      this.files.set(nm.relsPath, nm.relsXml())
      this.overrides.push(`<Override PartName="/${nm.path}" ContentType="${PML}.notesMaster+xml"/>`)
      notesMasterLst = `<p:notesMasterIdLst><p:notesMasterId r:id="${presRels.rel('notesMaster', 'notesMasters/notesMaster1.xml')}"/></p:notesMasterIdLst>`
      for (const n of notes) {
        this.files.set(n.part.path, n.xml)
        this.files.set(n.part.relsPath, n.part.relsXml())
        this.overrides.push(`<Override PartName="/${n.part.path}" ContentType="${PML}.notesSlide+xml"/>`)
      }
    }
    for (const om of this.outMasters.values()) presRels.rel('theme', `theme/theme${om.n}.xml`)
    if (this.authors.size) {
      const list = [...this.authors].map(([name, a]) => `<p:cmAuthor id="${a.id}" name="${escAttr(name)}" initials="${escAttr(a.initials)}" lastIdx="${a.last}" clrIdx="${a.id % 8}"/>`)
      this.files.set('ppt/commentAuthors.xml', `${XML_HEAD}<p:cmAuthorLst ${NS}>${list.join('')}</p:cmAuthorLst>`)
      this.overrides.push(`<Override PartName="/ppt/commentAuthors.xml" ContentType="${PML}.commentAuthors+xml"/>`)
      presRels.rel('commentAuthors', 'commentAuthors.xml')
    }

    const size = (v: number) => Math.max(914400, Math.min(51206400, emu(v)))
    this.files.set(
      'ppt/presentation.xml',
      `${XML_HEAD}<p:presentation ${NS} saveSubsetFonts="1"${doc.firstSlideNumber !== 1 ? ` firstSlideNum="${doc.firstSlideNumber}"` : ''}><p:sldMasterIdLst>${masterIds.join('')}</p:sldMasterIdLst>${notesMasterLst}` +
        `${slideIds.length ? `<p:sldIdLst>${slideIds.join('')}</p:sldIdLst>` : ''}<p:sldSz cx="${size(doc.width)}" cy="${size(doc.height)}"/>` +
        `<p:notesSz cx="${size(doc.notesWidth)}" cy="${size(doc.notesHeight)}"/></p:presentation>`,
    )
    this.files.set(presRels.relsPath, presRels.relsXml())
    this.files.set(
      '_rels/.rels',
      `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    )
    const defaults = [...this.mediaExts].map((e) => `<Default Extension="${e}" ContentType="${MEDIA_TYPES[e]}"/>`).join('')
    this.files.set(
      '[Content_Types].xml',
      `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>${defaults}<Override PartName="/ppt/presentation.xml" ContentType="${PML}.presentation.main+xml"/>${this.overrides.join('')}</Types>`,
    )
    return writeZip(this.files, `${PML}.presentation`)
  }

  /** the output master of a main master with a scheme */
  private outMaster(main: MasterRec | undefined, scheme: string[]): OutMaster {
    const key = `${main?.ref.slideId ?? 'none'}|${scheme.join(',')}`
    let om = this.outMasters.get(key)
    if (!om) {
      om = { n: this.outMasters.size + 1, main: main ?? this.mainMasters[0], scheme, layouts: new Map() }
      this.outMasters.set(key, om)
    }
    return om
  }

  private layout(om: OutMaster, kind: LayoutKind): number {
    let n = om.layouts.get(kind)
    if (!n) {
      n = this.outLayouts.length + 1
      om.layouts.set(kind, n)
      this.outLayouts.push({ n, master: om, kind })
    }
    return n
  }

  /** writes a slide; returns its notes page */
  private async slide(s: SlideRef, k: number): Promise<{ notes?: { xml: string; part: Part } }> {
    const rec = s.rec!
    const atom = rec.kid(RT.SlideAtom)
    const flags = atom?.u16(20) ?? 7
    let m = this.masterRecs.get(atom?.u32(12) ?? -1)
    let title: MasterRec | undefined
    if (m && !m.main) {
      title = m
      m = this.masterRecs.get(m.mainId ?? -1)
    }
    m ??= this.mainMasters[0]
    const shown = title ?? m
    const scheme = flags & 2 ? this.schemeOf(shown) : (this.ownScheme(rec) ?? this.schemeOf(shown))
    const om = this.outMaster(m, scheme)
    const geom = atom?.u32(0)
    const layout = this.layout(om, title ? `t${title.ref.slideId}` : geom === 0x10 ? 'blank' : geom === 0 ? 'title' : 'obj')

    const n = k + 1
    const part = new Part(`ppt/slides/slide${n}.xml`)
    part.rel('slideLayout', `../slideLayouts/slideLayout${layout}.xml`)
    const number = k + this.doc.firstSlideNumber
    const hf = this.doc.headersFooters(rec)
    const values = hfValues(hf)
    const env = this.env(part, m, scheme, number, values)
    const ids = { n: 1 }
    const w = this.writer(part, env, { slide: s, ids })
    const dg = drawingOf(rec)
    let bg = ''
    if (!(flags & 4)) {
      const f = await w.background(dg)
      if (f) bg = bgXml(f)
    }
    let shapes = await w.drawing(dg)

    // headers and footers: the master's placeholders, with this slide's values
    const own = new Set(allShapes(dg).map((sp) => shapeInfo(sp).ph?.type).filter((t) => t !== undefined))
    if (hf && !(title && this.doc.omitTitlePlace)) {
      const want = new Set<number>()
      if (hf.date && values?.date) want.add(7)
      if (hf.slideNumber) want.add(8)
      if (hf.footer && values?.footer) want.add(9)
      for (const t of own) want.delete(t!)
      if (want.size) {
        const fw = this.writer(part, env, {
          ids,
          skip: (sh) => !sh.ph || !want.has(sh.ph.type),
          textFor: (sh, block) => footerText(sh, block, values),
        })
        shapes += await fw.drawing(drawingOf(shown?.rec))
      }
    }
    const hidden = !!((rec.kid(RT.SlideShowSlideInfoAtom)?.u16(10) ?? 0) & 4)
    const attrs = (hidden ? ' show="0"' : '') + (flags & 1 ? '' : ' showMasterSp="0"')
    this.files.set(part.path, `${XML_HEAD}<p:sld ${NS}${attrs}><p:cSld>${bg}<p:spTree>${GRP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`)
    this.overrides.push(`<Override PartName="/${part.path}" ContentType="${PML}.slide+xml"/>`)
    this.comments(rec, part, n)

    // notes
    let notes: { xml: string; part: Part } | undefined
    const notesRef = this.doc.notes.find((x) => x.slideId === atom?.u32(16) && x.rec?.type === RT.Notes)
    if (notesRef?.rec) {
      const np = new Part(`ppt/notesSlides/notesSlide${n}.xml`)
      np.rel('notesMaster', '../notesMasters/notesMaster1.xml')
      np.rel('slide', `../slides/slide${n}.xml`)
      const nw = this.writer(np, this.env(np, m, this.ownScheme(notesRef.rec) ?? scheme, number, values))
      const ndg = drawingOf(notesRef.rec)
      const hasText = allShapes(ndg).some((sp) => {
        const sh = shapeInfo(sp)
        return sh.ph && (sh.ph.type === 12 || sh.ph.type === 6) && /\S/.test(nw.textOf(sh)?.text ?? '')
      })
      if (hasText) {
        const body = await nw.drawing(ndg)
        notes = { part: np, xml: `${XML_HEAD}<p:notes ${NS}><p:cSld><p:spTree>${GRP}${body}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>` }
        part.rel('notesSlide', `../notesSlides/notesSlide${n}.xml`)
      }
    }
    this.files.set(part.relsPath, part.relsXml())
    return { notes }
  }

  /** a slide's comments (PowerPoint 2002 Comment10 records) as legacy PPTX comments */
  private comments(rec: Rec, part: Part, n: number) {
    let out = ''
    for (const c of progTag(rec, '___PPT10').filter((r) => r.type === 0x2ee0)) {
      const atom = c.kid(0x2ee1)
      const name = c.kid(RT.CString, 0)?.utf16() || 'Unknown'
      const text = c.kid(RT.CString, 1)?.utf16() ?? ''
      let a = this.authors.get(name)
      if (!a) this.authors.set(name, (a = { id: this.authors.size, initials: c.kid(RT.CString, 2)?.utf16() || name.slice(0, 1), last: 0 }))
      a.last++
      const t = (k: number) => String(atom?.u16(4 + k * 2) ?? 0).padStart(2, '0')
      const year = atom?.u16(4) || 2000
      const dt = `${year}-${t(1)}-${t(3)}T${t(4)}:${t(5)}:${t(6)}.000`
      const x = Math.max(0, atom?.i32(20) ?? 0)
      const y = Math.max(0, atom?.i32(24) ?? 0)
      out += `<p:cm authorId="${a.id}" dt="${dt}" idx="${a.last}"><p:pos x="${x}" y="${y}"/><p:text>${escText(text.replace(/\r\n?/g, '\n'))}</p:text></p:cm>`
    }
    if (!out) return
    const path = `ppt/comments/comment${n}.xml`
    part.rel('comments', `../comments/comment${n}.xml`)
    this.files.set(path, `${XML_HEAD}<p:cmLst ${NS}>${out}</p:cmLst>`)
    this.overrides.push(`<Override PartName="/${path}" ContentType="${PML}.comments+xml"/>`)
  }

  /** a slide master: background, shapes (placeholders included), text styles, theme; returns the next free id */
  private async masterXml(om: OutMaster, nextId: number): Promise<number> {
    const part = new Part(`ppt/slideMasters/slideMaster${om.n}.xml`)
    const m = om.main
    const env = this.env(part, m, om.scheme)
    const w = this.writer(part, env)
    const dg = drawingOf(m?.rec)
    const bg = (await w.background(dg)) ?? solid(om.scheme[0])
    const shapes = await w.drawing(dg)
    const ids = [...om.layouts.values()].sort((a, b) => a - b).map((n) => `<p:sldLayoutId id="${nextId++}" r:id="${part.rel('slideLayout', `../slideLayouts/slideLayout${n}.xml`)}"/>`)
    part.rel('theme', `../theme/theme${om.n}.xml`)
    const styles = this.styles(m)
    const lv = (type: number, count: number) => Array.from({ length: count }, (_, i) => lvlXml(i + 1, styles.pf(type, i), styles.cf(type, i), env)).join('')
    const txStyles = `<p:txStyles><p:titleStyle>${lv(TX.title, 1)}</p:titleStyle><p:bodyStyle>${lv(TX.body, 5)}</p:bodyStyle><p:otherStyle>${lv(styles.has(TX.other) ? TX.other : TX.body, 5)}</p:otherStyle></p:txStyles>`
    this.files.set(
      part.path,
      `${XML_HEAD}<p:sldMaster ${NS}><p:cSld>${bgXml(bg)}<p:spTree>${GRP}${shapes}</p:spTree></p:cSld>${CLR_MAP}<p:sldLayoutIdLst>${ids.join('')}</p:sldLayoutIdLst>${txStyles}</p:sldMaster>`,
    )
    this.files.set(part.relsPath, part.relsXml())
    this.overrides.push(`<Override PartName="/${part.path}" ContentType="${PML}.slideMaster+xml"/>`)
    const font = (type: number) => this.doc.font(styles.cf(type, 0).font) ?? 'Arial'
    this.files.set(`ppt/theme/theme${om.n}.xml`, themeXml(`Theme ${om.n}`, om.scheme, font(TX.title), font(TX.body)))
    this.overrides.push(`<Override PartName="/ppt/theme/theme${om.n}.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`)
    return nextId
  }

  /** a layout: a title master's look, or the main master's placeholders */
  private async layoutXml(l: OutLayout): Promise<void> {
    const part = new Part(`ppt/slideLayouts/slideLayout${l.n}.xml`)
    part.rel('slideMaster', `../slideMasters/slideMaster${l.master.n}.xml`)
    const om = l.master
    const title = l.kind.startsWith('t') && l.kind !== 'title' ? this.masterRecs.get(Number(l.kind.slice(1))) : undefined
    const env = this.env(part, om.main, om.scheme)
    let bg = ''
    let shapes = ''
    let attrs = ''
    let name: string
    let type: string
    if (title) {
      const w = this.writer(part, env)
      const dg = drawingOf(title.rec)
      if (!(title.flags & 4)) {
        const f = await w.background(dg)
        if (f) bg = bgXml(f)
      }
      shapes = await w.drawing(dg)
      if (!(title.flags & 1)) attrs = ' showMasterSp="0"'
      name = 'Title Slide'
      type = 'title'
    } else {
      // the master's placeholders (title / body as title slide placeholders on a title layout)
      const keep = l.kind === 'blank' ? FOOTER_PH : new Set([1, 2, ...FOOTER_PH])
      const w = this.writer(part, env, { skip: (s) => !s.ph || !keep.has(s.ph.type) })
      const remap = l.kind === 'title'
      shapes = await w.drawing(drawingOf(om.main?.rec))
      if (remap) shapes = shapes.replace('<p:ph type="title"/>', '<p:ph type="ctrTitle"/>').replace('<p:ph type="body" idx="1"/>', '<p:ph type="subTitle" idx="1"/>')
      name = l.kind === 'blank' ? 'Blank' : l.kind === 'title' ? 'Title Slide' : 'Title and Content'
      type = l.kind
    }
    this.files.set(
      part.path,
      `${XML_HEAD}<p:sldLayout ${NS} type="${type}" preserve="1"${attrs}><p:cSld name="${escAttr(name)}">${bg}<p:spTree>${GRP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
    )
    this.files.set(part.relsPath, part.relsXml())
    this.overrides.push(`<Override PartName="/${part.path}" ContentType="${PML}.slideLayout+xml"/>`)
  }

  private notesMasterXml(): string {
    const w = emu(this.doc.notesWidth)
    const h = emu(this.doc.notesHeight)
    const ph = (id: number, name: string, type: string, x: number, y: number, cx: number, cy: number) =>
      `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="${type}"${type === 'body' ? ' idx="1"' : ''}/></p:nvPr></p:nvSpPr>` +
      `<p:spPr><a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(cx)}" cy="${Math.round(cy)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
      `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`
    return (
      `${XML_HEAD}<p:notesMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GRP}` +
      ph(2, 'Slide Image Placeholder 1', 'sldImg', w * 0.15, h * 0.08, w * 0.7, h * 0.38) +
      ph(3, 'Notes Placeholder 2', 'body', w * 0.1, h * 0.48, w * 0.8, h * 0.42) +
      `</p:spTree></p:cSld>${CLR_MAP}<p:notesStyle><a:lvl1pPr marL="0" algn="l"><a:defRPr sz="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`
    )
  }
}

/** field values of a slide's headers and footers */
function hfValues(hf: HeadersFooters | undefined): TextEnv['values'] {
  if (!hf) return undefined
  const format = Math.max(0, Math.min(12, hf.format))
  return { date: hf.userDate && !hf.todayDate ? (hf.userDateText ?? '') : dateText(format), footer: hf.footerText ?? '', header: hf.headerText ?? '', dateFormat: format }
}

/** a master footer placeholder's text on a slide: its fields filled, or its text replaced by the slide's value */
function footerText(s: ShapeInfo, block: TextBlock | undefined, values: TextEnv['values']): TextBlock | undefined {
  if (!block) return block
  const kind = s.ph?.type === 9 ? 'footer' : s.ph?.type === 7 ? 'date' : undefined
  if (!kind || [...block.fields.values()].some((f) => f.kind === kind)) return block
  const value = values?.[kind]
  if (value === undefined) return block
  return { ...block, text: value, fields: new Map(), links: [] }
}

/** a theme with the presentation's color scheme and fonts */
function themeXml(name: string, scheme: string[], major: string, minor: string): string {
  const [bg, text, shadow, title, fill, accent, link, followed] = scheme
  const c = (slot: string, v: string) => `<a:${slot}><a:srgbClr val="${v}"/></a:${slot}>`
  const colors =
    c('dk1', text) + c('lt1', bg) + c('dk2', title) + c('lt2', shadow) + c('accent1', fill) + c('accent2', accent) + c('accent3', link) +
    c('accent4', followed) + c('accent5', shadow) + c('accent6', title) + c('hlink', link) + c('folHlink', followed)
  const fmt = THEME.slice(THEME.indexOf('<a:fmtScheme'), THEME.indexOf('</a:themeElements>'))
  return (
    `${XML_HEAD}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${escAttr(name)}"><a:themeElements><a:clrScheme name="${escAttr(name)}">${colors}</a:clrScheme>` +
    `<a:fontScheme name="${escAttr(name)}"><a:majorFont><a:latin typeface="${escAttr(major)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
    `<a:minorFont><a:latin typeface="${escAttr(minor)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>${fmt}</a:themeElements></a:theme>`
  )
}
