/**
 * OpenDocument presentations (.odp, also templates and flat XML) → PPTX. Each master page becomes a slide
 * master (its drawings, background, placeholder frames and outline styles as master text styles) with
 * title-and-content, title and blank layouts; each page a slide with its drawings at their place and every
 * property written on them; footers, dates and slide numbers the master shows as placeholders; speaker notes as
 * notes slides.
 */
import { THEME } from '../../convert'
import { Part, XML_HEAD } from '../../iwork/ooxml'
import { escAttr, escText } from '../../raw'
import { writeZip, type PartData } from '../../zipwrite'
import { child, children, descendants, textContent, toHex, toPt, type ONode, type OdfPackage } from './common'
import { Drawer, styleOf, xfrm, type DrawEnv } from './odp-draw'
import { frameBox, RECT, type Box } from './odp-geom'
import { Media } from './odp-media'
import { emu, fillXml, fontName, isDark, OdpStyles, solid, type Props } from './odp-style'
import { bodyPrXml, lvlXml, rPrXml, type TextEnv } from './odp-text'

const PML = 'application/vnd.openxmlformats-officedocument.presentationml'
const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const GRP =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
const CLRMAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
const MAX_SLIDES = 5000
const MAX_MASTERS = 200

/** placeholder types of the master's frames */
const PH: Record<string, string> = {
  'date-time': '<p:ph type="dt" sz="half" idx="10"/>',
  footer: '<p:ph type="ftr" sz="quarter" idx="11"/>',
  'page-number': '<p:ph type="sldNum" sz="quarter" idx="12"/>',
}
const FOOTERS = ['date-time', 'footer', 'page-number']

type LayoutKind = 'obj' | 'title' | 'blank'

interface Master {
  name: string
  node: ONode
  /** slideMasterN.xml */
  n: number
  layouts: Map<LayoutKind, number>
  /** the first frame of each presentation class */
  frames: Map<string, ONode>
  /** p:bg */
  bg: string
  dark: boolean
  /** page size (pt) */
  size?: [number, number]
}

const isDefaultName = (s: string | undefined) => !s || /^page\d+$/i.test(s)

export class OdpConverter {
  private styles: OdpStyles
  private media: Media
  private files = new Map<string, PartData>()
  private overrides: string[] = []
  private masters: Master[] = []
  private hidden = new Set<string>()
  private pages: ONode[] = []
  /** slide index by page name ("page2", "Slide 2", custom names) */
  private pageIndex = new Map<string, number>()
  private decls = new Map<string, Map<string, ONode>>()
  private layoutCount = 0
  private themeCount = 0
  private W = 0
  private H = 0

  constructor(private pkg: OdfPackage) {
    this.styles = new OdpStyles(pkg)
    this.media = new Media(pkg)
  }

  // ---- environments

  private file = (path: string) => this.pkg.file({ name: 'draw:image', attrs: { 'xlink:href': path }, kids: [] })

  private env(part: Part, master: Master, opts: Partial<DrawEnv> & { master: boolean }): DrawEnv {
    const media = this.media
    const env: DrawEnv = {
      styles: this.styles,
      slideNo: 0,
      slideCount: this.pages.length,
      dark: master.dark,
      masterName: master.name,
      hidden: this.hidden,
      ids: { n: 1 },
      link: (href) => this.link(part, href),
      image: async (el) => {
        const f = await media.get(el)
        return f ? { rid: part.rel('image', '../media/' + f.name), ext: f.type, w: f.w, h: f.h } : undefined
      },
      file: this.file,
      placeholderBox: (cls) => this.placeholderBox(master, cls),
      ph: () => undefined,
      ...opts,
    }
    return env
  }

  private link(part: Part, href: string): string | undefined {
    if (href.startsWith('#')) {
      let name = href.slice(1)
      try {
        name = decodeURIComponent(name)
      } catch {
        // kept as written
      }
      const k = this.pageIndex.get(name) ?? this.pageIndex.get(name.toLowerCase())
      if (k === undefined) return undefined
      return part.rel('slide', part.path.startsWith('ppt/slides/') ? `slide${k + 1}.xml` : `../slides/slide${k + 1}.xml`)
    }
    // web and mail links only (no scripts, no local files)
    if (!/^(https?|mailto|ftp|tel):/i.test(href.trim())) return undefined
    return part.rel('hyperlink', href.trim(), true)
  }

  private placeholderBox(master: Master, cls: string): Box | undefined {
    const frame = master.frames.get(cls === 'subtitle' ? 'outline' : cls) ?? (cls === 'outline' ? master.frames.get('subtitle') : undefined)
    return frame ? frameBox(frame) : undefined
  }

  // ---- masters

  private readMasters() {
    const nodes = [...this.styles.st.masterPages.values()].slice(0, MAX_MASTERS)
    if (!nodes.length) nodes.push({ name: 'style:master-page', attrs: { 'style:name': 'Default' }, kids: [] })
    for (const node of nodes) {
      const name = node.attrs['style:name'] ?? 'Default'
      const frames = new Map<string, ONode>()
      for (const f of children(node)) {
        const cls = f.attrs['presentation:class']
        if (cls && !frames.has(cls)) frames.set(cls, f)
      }
      const layout = this.styles.st.pageLayouts.get(node.attrs['style:page-layout-name'] ?? '')
      const lp = child(layout, 'style:page-layout-properties')?.attrs ?? {}
      const pw = toPt(lp['fo:page-width'])
      const ph = toPt(lp['fo:page-height'])
      this.masters.push({ name, node, n: this.masters.length + 1, layouts: new Map(), frames, bg: '', dark: false, size: pw && ph ? [pw, ph] : undefined })
    }
  }

  private masterOf(page: ONode): Master {
    return this.masters.find((m) => m.name === page.attrs['draw:master-page-name']) ?? this.masters[0]
  }

  /** the background of a master: its drawing-page style over its "-background" presentation style */
  private async masterBackground(m: Master): Promise<void> {
    const part = new Part(`ppt/slideMasters/slideMaster${m.n}.xml`)
    const env = this.env(part, m, { master: true })
    const bgStyle = this.styles.props('presentation', `${m.name}-background`, false).g
    const page = this.styles.props('drawing-page', m.node.attrs['draw:style-name'], true).g
    const g = page['draw:fill'] && page['draw:fill'] !== 'none' ? { ...page } : { ...bgStyle, ...Object.fromEntries(Object.entries(page).filter(([k]) => !k.startsWith('draw:fill'))) }
    // no fill style at all: LibreOffice's default, solid in the default fill color (older files)
    const def = this.styles.defaults('graphic').g['draw:fill-color']
    if (!page['draw:fill'] && !bgStyle['draw:fill'] && !g['draw:fill-color'] && def) g['draw:fill-color'] = def
    const fill = (await fillXml(g, env, page['draw:fill'] || bgStyle['draw:fill'] || !g['draw:fill-color'] ? 'none' : 'solid', [this.W, this.H])) ?? solid('FFFFFF')
    m.bg = `<p:bg><p:bgPr>${fill}<a:effectLst/></p:bgPr></p:bg>`
    m.dark = darkFill(fill)
    // the relationships of a background image are the master's: kept for writing it
    this.masterParts.set(m.n, part)
  }

  private masterParts = new Map<number, Part>()

  /** a placeholder shape of a master or layout */
  private phShape(env: DrawEnv, ph: string, name: string, box: Box | undefined, body: string): string {
    const id = ++env.ids.n
    const spPr = box ? `<p:spPr>${xfrm(box)}${RECT}<a:noFill/></p:spPr>` : '<p:spPr/>'
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escAttr(name)} ${id}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${ph}</p:nvPr></p:nvSpPr>${spPr}${body}</p:sp>`
  }

  private styleProps(m: Master, frame: ONode | undefined, fallback: string): Props {
    if (frame) {
      const [family, name] = styleOf(frame, m.name)
      return this.styles.full(family, name, true)
    }
    return this.styles.full('presentation', `${m.name}-${fallback}`)
  }

  private async writeMaster(m: Master): Promise<void> {
    const part = this.masterParts.get(m.n)!
    const env = this.env(part, m, { master: true })
    const drawer = new Drawer(env)
    // placeholders: title, body, date, footer, slide number
    let shapes = ''
    const W = this.W
    const H = this.H
    const titleBox = this.placeholderBox(m, 'title') ?? { x: W * 0.05, y: H * 0.04, w: W * 0.9, h: H * 0.17, rot: 0, flipH: false, flipV: false }
    const bodyBox = this.placeholderBox(m, 'outline') ?? { x: W * 0.05, y: H * 0.23, w: W * 0.9, h: H * 0.66, rot: 0, flipH: false, flipV: false }
    const titleProps = this.styleProps(m, m.frames.get('title'), 'title')
    const bodyProps = this.styleProps(m, m.frames.get('outline'), 'outline1')
    const empty = (p: Props, frame: boolean) => `<p:txBody>${bodyPrXml(p.g, p.p, { frame, autoGrow: false })}<a:lstStyle/><a:p>${rPrXml('endParaRPr', p.t, env)}</a:p></p:txBody>`
    shapes += this.phShape(env, '<p:ph type="title"/>', 'Title Placeholder', titleBox, empty(titleProps, true))
    shapes += this.phShape(env, '<p:ph type="body" idx="1"/>', 'Text Placeholder', bodyBox, empty(bodyProps, true))
    for (const cls of FOOTERS) {
      const f = m.frames.get(cls)
      const box = f && frameBox(f)
      if (!f || !box) continue
      const props = this.styleProps(m, f, 'backgroundobjects')
      const paras = drawer.paragraphs(f) || `<a:p>${rPrXml('endParaRPr', props.t, env)}</a:p>`
      shapes += this.phShape(env, PH[cls], cls === 'footer' ? 'Footer Placeholder' : cls === 'date-time' ? 'Date Placeholder' : 'Slide Number Placeholder', box, `<p:txBody>${bodyPrXml(props.g, props.p, { frame: true, autoGrow: false })}<a:lstStyle/>${paras}</p:txBody>`)
    }
    // the master's own drawings
    const own = children(m.node).filter((k) => !k.attrs['presentation:class'] || !['title', 'outline', 'subtitle', 'notes', 'date-time', 'footer', 'page-number', 'header', 'handout', 'page'].includes(k.attrs['presentation:class']))
    const holder: ONode = { name: 'draw:g', attrs: {}, kids: own }
    for (const d of await drawer.drawables(holder)) shapes += d.xml

    // text styles: title, outline levels, other text
    const tenv: TextEnv = { ...env, master: false }
    const titleFull = this.styles.full('presentation', `${m.name}-title`)
    const title = lvlXml(1, titleFull, undefined, tenv, false)
    const outline1 = this.styles.full('presentation', `${m.name}-outline1`)
    const list = outline1.list ?? this.styles.list(outline1.listName, false)
    let body = ''
    let prev = outline1
    for (let n = 1; n <= 9; n++) {
      const name = `${m.name}-outline${n}`
      const p = this.styles.node('presentation', name, false) ? this.styles.full('presentation', name) : prev
      body += lvlXml(n, p, p.list ?? list, tenv)
      prev = p
    }
    const other = lvlXml(1, this.styles.full('graphic', 'standard'), undefined, tenv, false)
    const ids = [...m.layouts.values()]
      .map((n) => `<p:sldLayoutId id="${this.nextLayoutId++}" r:id="${part.rel('slideLayout', `../slideLayouts/slideLayout${n}.xml`)}"/>`)
      .join('')
    part.rel('theme', `../theme/theme${this.writeTheme(m, titleFull, outline1)}.xml`)
    this.files.set(
      part.path,
      `${XML_HEAD}<p:sldMaster ${NS}><p:cSld>${m.bg}<p:spTree>${GRP}${shapes}</p:spTree></p:cSld>${CLRMAP}` +
        `<p:sldLayoutIdLst>${ids}</p:sldLayoutIdLst><p:txStyles><p:titleStyle>${title}</p:titleStyle><p:bodyStyle>${body}</p:bodyStyle><p:otherStyle>${other}</p:otherStyle></p:txStyles></p:sldMaster>`,
    )
    this.files.set(part.relsPath, part.relsXml())
    this.overrides.push(`<Override PartName="/${part.path}" ContentType="${PML}.slideMaster+xml"/>`)
  }

  private nextLayoutId = 0

  /** a layout of a master: title and content, title (with a subtitle), blank */
  private layout(m: Master, kind: LayoutKind): number {
    let n = m.layouts.get(kind)
    if (n) return n
    n = ++this.layoutCount
    m.layouts.set(kind, n)
    const part = new Part(`ppt/slideLayouts/slideLayout${n}.xml`)
    part.rel('slideMaster', `../slideMasters/slideMaster${m.n}.xml`)
    const env = this.env(part, m, { master: true })
    const p = '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>'
    let shapes = ''
    if (kind === 'obj') {
      shapes += this.phShape(env, '<p:ph type="title"/>', 'Title', this.placeholderBox(m, 'title'), p)
      shapes += this.phShape(env, '<p:ph idx="1"/>', 'Content Placeholder', this.placeholderBox(m, 'outline'), p)
    } else if (kind === 'title') {
      shapes += this.phShape(env, '<p:ph type="ctrTitle"/>', 'Title', this.placeholderBox(m, 'title'), p)
      // the subtitle's look: the master's subtitle style
      const sub = this.styles.full('presentation', `${m.name}-subtitle`)
      const lst = `<a:lstStyle>${lvlXml(1, sub, undefined, { ...env, master: false }, false)}</a:lstStyle>`
      shapes += this.phShape(env, '<p:ph type="subTitle" idx="1"/>', 'Subtitle', this.placeholderBox(m, 'outline'), `<p:txBody>${bodyPrXml(sub.g, sub.p, { frame: true, autoGrow: false })}${lst}<a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>`)
    }
    for (const cls of FOOTERS) if (m.frames.has(cls)) shapes += this.phShape(env, PH[cls], cls, undefined, p)
    const names: Record<LayoutKind, string> = { obj: 'Title and Content', title: 'Title Slide', blank: 'Blank' }
    this.files.set(
      part.path,
      `${XML_HEAD}<p:sldLayout ${NS} type="${kind}" preserve="1"><p:cSld name="${names[kind]}"><p:spTree>${GRP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
    )
    this.files.set(part.relsPath, part.relsXml())
    this.overrides.push(`<Override PartName="/${part.path}" ContentType="${PML}.slideLayout+xml"/>`)
    return n
  }

  /** a theme for a master: its LibreOffice theme colors, the title and body fonts */
  private writeTheme(m: Master | undefined, title?: Props, body?: Props): number {
    const n = ++this.themeCount
    let xml = THEME
    const colors = m && descendants(child(m.node, 'loext:theme'), 'loext:color')
    if (colors?.length) {
      const map: Record<string, string> = { dark1: 'dk1', light1: 'lt1', dark2: 'dk2', light2: 'lt2', hyperlink: 'hlink', 'followed-hyperlink': 'folHlink' }
      for (const c of colors) {
        const key = map[c.attrs['loext:name']] ?? (/^accent[1-6]$/.test(c.attrs['loext:name']) ? c.attrs['loext:name'] : undefined)
        const hex = toHex(c.attrs['loext:color'])
        if (key && hex) xml = xml.replace(new RegExp(`<a:${key}>.*?</a:${key}>`), `<a:${key}><a:srgbClr val="${hex}"/></a:${key}>`)
      }
    }
    const font = (p: Props | undefined) => fontName(p?.t['fo:font-family'] ?? this.styles.st.font(p?.t['style:font-name']))
    const major = font(title)
    const minor = font(body)
    if (major) xml = xml.replace('<a:latin typeface="Calibri Light"/>', `<a:latin typeface="${escAttr(major)}"/>`)
    if (minor) xml = xml.replace('<a:minorFont><a:latin typeface="Calibri"/>', `<a:minorFont><a:latin typeface="${escAttr(minor)}"/>`)
    this.files.set(`ppt/theme/theme${n}.xml`, xml)
    this.overrides.push(`<Override PartName="/ppt/theme/theme${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`)
    return n
  }

  // ---- slides

  private decl(kind: string, name: string | undefined): ONode | undefined {
    return name ? this.decls.get(kind)?.get(name) : undefined
  }

  private async writeSlide(page: ONode, k: number): Promise<{ notes?: [Part, string] }> {
    const m = this.masterOf(page)
    const part = new Part(`ppt/slides/slide${k + 1}.xml`)
    const dp = this.styles.props('drawing-page', page.attrs['draw:style-name'], false).g
    // the slide's background: its own fill, else the master's
    const probe = this.env(part, m, { master: false })
    const own = ['solid', 'gradient', 'bitmap', 'hatch'].includes(dp['draw:fill'] ?? '') ? await fillXml(dp, probe, 'none', [this.W, this.H]) : undefined
    const bg = own ? `<p:bg><p:bgPr>${own}<a:effectLst/></p:bgPr></p:bg>` : dp['presentation:background-visible'] === 'false' ? `<p:bg><p:bgPr>${solid('FFFFFF')}<a:effectLst/></p:bgPr></p:bg>` : ''
    const dark = own ? darkFill(own) : dp['presentation:background-visible'] === 'false' ? false : m.dark
    // footer, date and time texts
    const footer = this.decl('footer', page.attrs['presentation:use-footer-name'])
    const dtDecl = this.decl('date-time', page.attrs['presentation:use-date-time-name'])
    const header = this.decl('header', page.attrs['presentation:use-header-name'])
    let dateTime = dtDecl ? textContent(dtDecl).trim() : undefined
    if (dtDecl?.attrs['presentation:source'] === 'current-date') dateTime = new Date().toLocaleDateString('en-US')
    let bodyIdx = 0
    const ph = (cls: string) => {
      switch (cls) {
        case 'title':
          return '<p:ph type="title"/>'
        case 'subtitle':
          return `<p:ph type="subTitle" idx="${++bodyIdx}"/>`
        case 'outline':
          return `<p:ph idx="${++bodyIdx}"/>`
        default:
          return PH[cls]
      }
    }
    const name = page.attrs['draw:name']
    const env = this.env(part, m, { master: false, slideNo: k + 1, dark, ph, footer: footer && textContent(footer).trim(), header: header && textContent(header).trim(), dateTime, slideName: isDefaultName(name) ? `Slide ${k + 1}` : name })
    const drawer = new Drawer(env)
    let shapes = (await drawer.drawables(page)).map((d) => d.xml).join('')
    // the master's date, footer and slide number where the page shows them
    const show = (flag: string, def: boolean) => (dp[flag] === undefined ? def : dp[flag] === 'true')
    const onPage = new Set(children(page).map((c) => c.attrs['presentation:class']))
    const footers: [string, boolean][] = [
      ['date-time', show('presentation:display-date-time', true) && !!dateTime],
      ['footer', show('presentation:display-footer', true) && !!env.footer],
      ['page-number', show('presentation:display-page-number', false)],
    ]
    for (const [cls, on] of footers) {
      const f = m.frames.get(cls)
      if (!on || !f || onPage.has(cls)) continue
      const d = await new Drawer({ ...env, master: true }).drawable(f)
      if (d) shapes += d.xml
    }
    // layout: title slide (subtitle), title and content, blank
    const classes = children(page).map((c) => c.attrs['presentation:class'])
    const kind: LayoutKind = classes.includes('subtitle') ? 'title' : classes.includes('title') || classes.includes('outline') ? 'obj' : 'blank'
    part.rel('slideLayout', `../slideLayouts/slideLayout${this.layout(m, kind)}.xml`)
    const hidden = (dp['presentation:visibility'] ?? page.attrs['presentation:visibility']) === 'hidden'
    const noMaster = dp['presentation:background-objects-visible'] === 'false'
    const nameAttr = isDefaultName(name) ? '' : ` name="${escAttr(name!)}"`
    // speaker notes
    const notesEl = child(page, 'presentation:notes')
    const notesFrame = children(notesEl).find((f) => f.attrs['presentation:class'] === 'notes' && child(f, 'draw:text-box'))
    let notes: [Part, string] | undefined
    if (notesFrame && /\S/.test(textContent(notesFrame))) {
      const notesPart = new Part(`ppt/notesSlides/notesSlide${k + 1}.xml`)
      const paras = new Drawer(this.env(notesPart, m, { master: false, slideNo: k + 1, dark: false })).paragraphs(notesFrame)
      if (/<a:(r|fld)[ >]/.test(paras)) notes = [notesPart, paras]
    }
    if (notes) part.rel('notesSlide', `../notesSlides/notesSlide${k + 1}.xml`)
    this.comments(page, part, k)
    this.files.set(
      part.path,
      `${XML_HEAD}<p:sld ${NS}${hidden ? ' show="0"' : ''}${noMaster ? ' showMasterSp="0"' : ''}><p:cSld${nameAttr}>${bg}<p:spTree>${GRP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
    )
    this.files.set(part.relsPath, part.relsXml())
    this.overrides.push(`<Override PartName="/${part.path}" ContentType="${PML}.slide+xml"/>`)
    return { notes }
  }

  // ---- comments

  /** comment authors by name: id, initials, comment count */
  private authors = new Map<string, { id: number; initials: string; count: number }>()

  /** the annotations of a page → its (legacy) PowerPoint comments, positions in 1/576 inch */
  private comments(page: ONode, part: Part, k: number): void {
    const notes = children(page).filter((c) => c.name === 'officeooo:annotation' || c.name === 'office:annotation')
    if (!notes.length) return
    let list = ''
    for (const a of notes.slice(0, 1000)) {
      const name = textContent(child(a, 'dc:creator') ?? '').trim() || 'Author'
      let author = this.authors.get(name)
      if (!author) {
        const initials = textContent(child(a, 'meta:creator-initials') ?? '').trim() || name.split(/\s+/).map((w) => [...w][0] ?? '').join('').slice(0, 4)
        author = { id: this.authors.size, initials, count: 0 }
        this.authors.set(name, author)
      }
      author.count++
      const date = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?/.exec(textContent(child(a, 'dc:date') ?? '').trim())?.[0]
      const text = children(a, 'text:p').map((p) => textContent(p)).join('\n')
      const pos = (v: string | undefined) => Math.max(0, Math.round((toPt(v) ?? 0) * 8))
      list +=
        `<p:cm authorId="${author.id}"${date ? ` dt="${date.length === 16 ? date + ':00' : date}.000"` : ''} idx="${author.count}">` +
        `<p:pos x="${pos(a.attrs['svg:x'])}" y="${pos(a.attrs['svg:y'])}"/><p:text>${escText(text)}</p:text></p:cm>`
    }
    const path = `ppt/comments/comment${k + 1}.xml`
    part.rel('comments', `../comments/comment${k + 1}.xml`)
    this.files.set(path, `${XML_HEAD}<p:cmLst ${NS}>${list}</p:cmLst>`)
    this.overrides.push(`<Override PartName="/${path}" ContentType="${PML}.comments+xml"/>`)
  }

  // ---- notes

  private notesMaster(theme: number, W: number, H: number): void {
    const part = new Part('ppt/notesMasters/notesMaster1.xml')
    part.rel('theme', `../theme/theme${theme}.xml`)
    const img = { x: W * 0.15, y: H * 0.08, w: W * 0.7, h: H * 0.36, rot: 0, flipH: false, flipV: false }
    const body = { x: W * 0.1, y: H * 0.48, w: W * 0.8, h: H * 0.42, rot: 0, flipH: false, flipV: false }
    this.files.set(
      part.path,
      `${XML_HEAD}<p:notesMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GRP}` +
        `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr>` +
        `<p:spPr>${xfrm(img)}${RECT}<a:noFill/><a:ln w="12700"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln></p:spPr></p:sp>` +
        `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr>` +
        `<p:spPr>${xfrm(body)}${RECT}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>` +
        `</p:spTree></p:cSld>${CLRMAP}<p:notesStyle><a:lvl1pPr marL="0" algn="l"><a:defRPr sz="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`,
    )
    this.files.set(part.relsPath, part.relsXml())
    this.overrides.push(`<Override PartName="/${part.path}" ContentType="${PML}.notesMaster+xml"/>`)
  }

  private notesSlide(k: number, part: Part, paras: string): void {
    part.rel('notesMaster', '../notesMasters/notesMaster1.xml')
    part.rel('slide', `../slides/slide${k + 1}.xml`)
    this.files.set(
      part.path,
      `${XML_HEAD}<p:notes ${NS}><p:cSld><p:spTree>${GRP}` +
        '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>' +
        `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>` +
        '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>',
    )
    this.files.set(part.relsPath, part.relsXml())
    this.overrides.push(`<Override PartName="/${part.path}" ContentType="${PML}.notesSlide+xml"/>`)
  }

  // ---- the package

  async convert(): Promise<Blob> {
    const body = this.pkg.body('presentation')
    if (!body) throw new Error('Not an OpenDocument presentation (no presentation content: damaged or encrypted file)')
    this.pages = children(body, 'draw:page').slice(0, MAX_SLIDES)
    this.pages.forEach((p, k) => {
      const name = p.attrs['draw:name']
      if (name) this.pageIndex.set(name, k)
      this.pageIndex.set(`page${k + 1}`, k)
      this.pageIndex.set(`slide ${k + 1}`, k)
      if (!this.pageIndex.has(`Slide ${k + 1}`)) this.pageIndex.set(`Slide ${k + 1}`, k)
    })
    for (const d of children(body)) {
      const kind = d.name === 'presentation:footer-decl' ? 'footer' : d.name === 'presentation:date-time-decl' ? 'date-time' : d.name === 'presentation:header-decl' ? 'header' : undefined
      if (!kind || !d.attrs['presentation:name']) continue
      if (!this.decls.has(kind)) this.decls.set(kind, new Map())
      this.decls.get(kind)!.set(d.attrs['presentation:name'], d)
    }
    // hidden layers
    for (const root of [this.pkg.stylesRoot, this.pkg.content]) {
      for (const l of descendants(child(root, 'office:master-styles'), 'draw:layer')) if (l.attrs['draw:display'] === 'none' && l.attrs['draw:name']) this.hidden.add(l.attrs['draw:name'])
    }
    this.readMasters()
    // slide size: the page layout of the first slide's master
    const first = this.pages.length ? this.masterOf(this.pages[0]) : this.masters[0]
    const size = first.size ?? this.masters.find((m) => m.size)?.size ?? [(28 * 72) / 2.54, (15.75 * 72) / 2.54]
    const clampEmu = (pt: number) => Math.min(51206400, Math.max(914400, emu(pt)))
    const cx = clampEmu(size[0])
    const cy = clampEmu(size[1])
    this.W = cx / 12700
    this.H = cy / 12700
    for (const m of this.masters) await this.masterBackground(m)

    const pres = new Part('ppt/presentation.xml')
    const notes: [number, Part, string][] = []
    let sldIds = ''
    for (let k = 0; k < this.pages.length; k++) {
      const { notes: n } = await this.writeSlide(this.pages[k], k)
      if (n) notes.push([k, ...n])
    }
    // masters (with the layouts their slides use; every master has one), after the slides
    let masterIds = ''
    this.nextLayoutId = 2147483648 + this.masters.length
    for (const m of this.masters) {
      if (!m.layouts.size) this.layout(m, 'obj')
      masterIds += `<p:sldMasterId id="${2147483648 + m.n - 1}" r:id="${pres.rel('slideMaster', `slideMasters/slideMaster${m.n}.xml`)}"/>`
    }
    // layout ids follow all master ids
    for (const m of this.masters) await this.writeMaster(m)
    let notesIds = ''
    if (notes.length) {
      const theme = this.writeTheme(undefined)
      this.notesMaster(theme, 6858000 / 12700, 9144000 / 12700)
      notesIds = `<p:notesMasterIdLst><p:notesMasterId r:id="${pres.rel('notesMaster', 'notesMasters/notesMaster1.xml')}"/></p:notesMasterIdLst>`
      for (const [k, part, paras] of notes) this.notesSlide(k, part, paras)
    }
    this.pages.forEach((_, k) => (sldIds += `<p:sldId id="${256 + k}" r:id="${pres.rel('slide', `slides/slide${k + 1}.xml`)}"/>`))
    pres.rel('theme', 'theme/theme1.xml')
    if (this.authors.size) {
      pres.rel('commentAuthors', 'commentAuthors.xml')
      const list = [...this.authors].map(([name, a]) => `<p:cmAuthor id="${a.id}" name="${escAttr(name)}" initials="${escAttr(a.initials)}" lastIdx="${a.count}" clrIdx="${a.id % 8}"/>`).join('')
      this.files.set('ppt/commentAuthors.xml', `${XML_HEAD}<p:cmAuthorLst ${NS}>${list}</p:cmAuthorLst>`)
      this.overrides.push(`<Override PartName="/ppt/commentAuthors.xml" ContentType="${PML}.commentAuthors+xml"/>`)
    }
    this.files.set(
      pres.path,
      `${XML_HEAD}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst>${masterIds}</p:sldMasterIdLst>${notesIds}` +
        `${sldIds ? `<p:sldIdLst>${sldIds}</p:sldIdLst>` : ''}<p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    )
    this.files.set(pres.relsPath, pres.relsXml())
    this.files.set(
      '_rels/.rels',
      `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    )
    for (const [name, bytes] of this.media.files) this.files.set(`ppt/media/${name}`, bytes)
    this.files.set(
      '[Content_Types].xml',
      `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>${this.media.contentTypes()}<Override PartName="/ppt/presentation.xml" ContentType="${PML}.presentation.main+xml"/>${this.overrides.join('')}</Types>`,
    )
    return writeZip(this.files, `${PML}.presentation`)
  }
}

/** a fill is dark (automatic text color white) */
function darkFill(fill: string): boolean {
  const colors = [...fill.matchAll(/<a:srgbClr val="([0-9A-F]{6})"/g)].map((m) => m[1])
  if (!colors.length || fill.startsWith('<a:blipFill')) return false
  // a gradient: its middle color
  return isDark(colors[Math.floor(colors.length / 2)])
}

/** Converts an OpenDocument presentation to a PPTX file. */
export async function odpToPptx(pkg: OdfPackage): Promise<Blob> {
  return new OdpConverter(pkg).convert()
}
