/**
 * Drawings of a page for the ODP → PPTX conversion: text frames and placeholders, custom shapes and the basic
 * shapes, lines, pictures, groups, tables and embedded objects → PresentationML shape tree elements.
 */
import { escAttr } from '../../raw'
import { child, children, isEl, textContent, toHex, toPt, type ONode } from './common'
import { customGeom, ellipseGeom, frameBox, linePoints, polyGeom, rectGeom, regularGeom, svgPathBounds, svgPathGeom, RECT, type Box, type Geom } from './odp-geom'
import { emu, fillXml, fraction, lineXml, isDark, noProps, overlay, shadowXml, solid, type FillEnv, type Props } from './odp-style'
import { bodyPrXml, fitScale, padding, paragraphsXml, rPrXml, shrinks, type ParaMetric, type TextEnv, type TextFrame } from './odp-text'

/** an image file in the package, with its relationship in the current part */
export interface Img {
  rid: string
  ext: string
  /** natural size (pt) */
  w?: number
  h?: number
}

/** what drawings need from the converter */
export interface DrawEnv extends TextEnv, FillEnv {
  masterName: string
  /** layers not shown */
  hidden: Set<string>
  /** shape ids in the current part */
  ids: { n: number }
  image(el: ONode): Promise<Img | undefined>
  /** a file of the package by path */
  file(path: string): Promise<Uint8Array | undefined>
  /** geometry of a placeholder (by presentation class) for frames without their own */
  placeholderBox(cls: string): Box | undefined
  /** p:ph of a presentation class in this part (undefined: drawn as a plain shape) */
  ph(cls: string): string | undefined
}

/** a converted drawing: shape tree XML and its frame (for groups) */
export interface Drawn {
  xml: string
  box?: Box
}

const MAX_NEST = 16
const WEB = new Set(['png', 'jpeg', 'gif', 'bmp', 'svg', 'webp'])
const OFFICE = new Set(['emf', 'wmf', 'tiff'])

/** the style family and name of a drawing: presentation style for placeholders, graphic style for the others */
export function styleOf(el: ONode, masterName: string): ['presentation' | 'graphic', string | undefined] {
  const cls = el.attrs['presentation:class']
  if (el.attrs['presentation:style-name']) return ['presentation', el.attrs['presentation:style-name']]
  if (cls && !el.attrs['draw:style-name']) {
    const suffix = cls === 'outline' ? 'outline1' : cls === 'title' || cls === 'subtitle' || cls === 'notes' ? cls : 'backgroundobjects'
    return ['presentation', `${masterName}-${suffix}`]
  }
  return ['graphic', el.attrs['draw:style-name']]
}

export function xfrm(b: Box, tag = 'a:xfrm'): string {
  const rot = Math.round(b.rot * 60000) % 21600000
  const attrs = (rot ? ` rot="${rot}"` : '') + (b.flipH ? ' flipH="1"' : '') + (b.flipV ? ' flipV="1"' : '')
  const clampPos = (v: number) => Math.max(-27273042316900, Math.min(27273042316900, emu(v)))
  return `<${tag}${attrs}><a:off x="${clampPos(b.x)}" y="${clampPos(b.y)}"/><a:ext cx="${Math.max(0, emu(b.w))}" cy="${Math.max(0, emu(b.h))}"/></${tag}>`
}

/** a box's bounds with its rotation */
function bounds(b: Box): [number, number, number, number] {
  if (!b.rot) return [b.x, b.y, b.x + b.w, b.y + b.h]
  const r = (b.rot * Math.PI) / 180
  const cw = Math.abs(b.w * Math.cos(r)) + Math.abs(b.h * Math.sin(r))
  const ch = Math.abs(b.w * Math.sin(r)) + Math.abs(b.h * Math.cos(r))
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  return [cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2]
}

const descrOf = (el: ONode) => {
  const t = (child(el, 'svg:desc') ?? child(el, 'svg:title'))
  const s = t ? textContent(t).trim() : ''
  return s ? ` descr="${escAttr(s.slice(0, 1000))}"` : ''
}

/** "rect(top, right, bottom, left)" of fo:clip */
function clipOf(v: string | undefined): [number, number, number, number] | undefined {
  const m = /rect\(([^)]*)\)/.exec(v ?? '')
  if (!m) return undefined
  const p = m[1].split(/[\s,]+/).filter(Boolean).map((x) => (x === 'auto' ? 0 : (toPt(x) ?? 0)))
  return p.length === 4 ? [p[0], p[1], p[2], p[3]] : undefined
}

export class Drawer {
  constructor(private env: DrawEnv) {}

  private nv(tag: string, el: ONode | undefined, kind: string, extra: string, ph?: string): string {
    const id = ++this.env.ids.n
    const name = el?.attrs['draw:name'] || `${kind} ${id}`
    return `<p:nv${tag}Pr><p:cNvPr id="${id}" name="${escAttr(name)}"${el ? descrOf(el) : ''}/>${extra}<p:nvPr>${ph ?? ''}</p:nvPr></p:nv${tag}Pr>`
  }

  /** the drawings of a page (or group), back to front */
  async drawables(parent: ONode, nest = 0): Promise<Drawn[]> {
    const out: Drawn[] = []
    for (const el of children(parent)) {
      try {
        const d = await this.drawable(el, nest)
        if (d?.xml) out.push(d)
      } catch {
        // a single malformed drawing must not lose the page
      }
    }
    return out
  }

  async drawable(el: ONode, nest = 0): Promise<Drawn | undefined> {
    if (nest > MAX_NEST) return undefined
    if (el.attrs['draw:layer'] && this.env.hidden.has(el.attrs['draw:layer'])) return undefined
    if (el.attrs['draw:display'] === 'none' || el.attrs['draw:display'] === 'printer') return undefined
    switch (el.name) {
      case 'draw:frame':
        return this.frame(el)
      case 'draw:custom-shape':
      case 'draw:rect':
      case 'draw:ellipse':
      case 'draw:circle':
      case 'draw:polygon':
      case 'draw:polyline':
      case 'draw:path':
      case 'draw:regular-polygon':
      case 'draw:caption':
        return this.shape(el)
      case 'draw:line':
      case 'draw:connector':
      case 'draw:measure':
        return this.line(el)
      case 'draw:g':
        return this.group(el, nest)
      case 'draw:a': {
        // a linked drawing: the drawing itself
        const inner = children(el).find((k) => k.name.startsWith('draw:'))
        return inner ? this.drawable(inner, nest + 1) : undefined
      }
      default:
        return undefined
    }
  }

  // ---- text

  /** the text frame of a drawing: its properties per outline level (outline placeholders use the master's level styles) */
  private textFrame(el: ONode, props: Props): TextFrame {
    const { styles, master, masterName } = this.env
    const cls = el.attrs['presentation:class']
    const levels = new Map<number, Props>()
    const name = el.attrs['presentation:style-name']
    // the automatic style of a placeholder over its master style: its own properties
    const node = styles.node('presentation', name, master)
    const ownOnly = node?.attrs['style:parent-style-name'] ? propsOfNode(node) : undefined
    return {
      textStyle: el.attrs['draw:text-style-name'],
      level: (n: number) => {
        if (cls !== 'outline' || n === 1) return props
        let p = levels.get(n)
        if (!p) {
          const lvName = `${masterName}-outline${n}`
          p = styles.node('presentation', lvName, false) ? styles.full('presentation', lvName) : props
          if (ownOnly) p = overlay(p, ownOnly)
          levels.set(n, p)
        }
        return p
      },
    }
  }

  /** the a:p elements of a text frame (speaker notes) */
  paragraphs(el: ONode): string {
    const [family, name] = styleOf(el, this.env.masterName)
    const props = this.env.styles.full(family, name, this.env.master)
    return paragraphsXml(child(el, 'draw:text-box') ?? el, this.textFrame(el, props), this.env)
  }

  /** a txBody: body properties, paragraphs ('' when there is no text and `keep` is not set) */
  private txBody(container: ONode, el: ONode, props: Props, box: Box, frame: boolean, fill: string | undefined, keep: boolean): string {
    const env = this.envFor(fill)
    const metrics: ParaMetric[] | undefined = shrinks(props.g) ? [] : undefined
    let paras = paragraphsXml(container, this.textFrame(el, props), env, metrics)
    let scale: [number, number] | undefined
    if (metrics) {
      const [l, t, r, b] = padding(props.g)
      scale = fitScale(metrics, box.w - l - r, box.h - t - b)
    }
    if (!/<a:(r|fld)[ >]/.test(paras)) {
      if (!keep) return ''
      if (!paras) paras = `<a:p>${rPrXml('endParaRPr', props.t, env)}</a:p>`
    }
    const auto = frame && !el.attrs['presentation:class']
    return `<p:txBody>${bodyPrXml(props.g, props.p, { frame, autoGrow: auto, scale })}<a:lstStyle/>${paras}</p:txBody>`
  }

  /** the text environment with the automatic font color of a shape's own fill */
  private envFor(fill: string | undefined): TextEnv {
    const hex = fill && /^<a:solidFill><a:srgbClr val="([0-9A-F]{6})"/.exec(fill)?.[1]
    return hex ? { ...this.env, dark: isDark(hex) } : this.env
  }

  // ---- frames

  private async frame(el: ONode): Promise<Drawn | undefined> {
    const { env } = this
    const cls = el.attrs['presentation:class']
    let box = frameBox(el)
    if (!box || (!box.w && !box.h && cls)) box = (cls && env.placeholderBox(cls)) || box
    if (!box) return undefined
    const [family, name] = styleOf(el, env.masterName)
    const props = env.styles.full(family, name, env.master)
    const table = child(el, 'table:table')
    if (table) return { xml: await this.table(el, table, box), box }
    const textBox = child(el, 'draw:text-box')
    if (textBox) return this.textBox(el, textBox, box, props)
    const object = child(el, 'draw:object') ?? child(el, 'draw:object-ole')
    const images = children(el, 'draw:image')
    const plugin = child(el, 'draw:plugin')
    if (images.length) {
      const pic = await this.picture(el, images, box, props)
      if (pic) return { xml: pic, box }
    }
    if (object || plugin || child(el, 'draw:applet') || child(el, 'draw:floating-frame')) {
      if (cls && el.attrs['presentation:placeholder'] === 'true' && !object && !plugin) return undefined
      const label = plugin ? 'Media' : cls === 'chart' || (object && (await this.isChart(object))) ? 'Chart' : 'Object'
      return { xml: this.objectBox(el, box, label), box }
    }
    return undefined
  }

  private async isChart(object: ONode): Promise<boolean> {
    if (descendantsHas(object, 'office:chart')) return true
    const href = object.attrs['xlink:href']
    if (!href) return false
    const bytes = await this.env.file(href.replace(/^\.\//, '').replace(/\/$/, '') + '/content.xml')
    return !!bytes && new TextDecoder().decode(bytes.subarray(0, 8192)).includes('office:chart')
  }

  /** a gray box with a label, where a chart or an embedded object (not converted) was */
  private objectBox(el: ONode, box: Box, label: string): string {
    // the label fits small frames
    const sz = Math.round(Math.max(4, Math.min(14, box.h * 0.4, box.w / (label.length * 0.7))) * 100)
    return (
      `<p:sp>${this.nv('Sp', el, label, '<p:cNvSpPr/>')}<p:spPr>${xfrm(box)}${RECT}${solid('F3F4F6')}<a:ln w="9525">${solid('9CA3AF')}<a:prstDash val="dash"/></a:ln></p:spPr>` +
      `<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr" anchorCtr="1"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="${sz}">${solid('6B7280')}</a:rPr><a:t>${label}</a:t></a:r></a:p></p:txBody></p:sp>`
    )
  }

  private async textBox(el: ONode, textBox: ONode, box: Box, props: Props): Promise<Drawn | undefined> {
    const { env } = this
    const cls = el.attrs['presentation:class']
    const ph = cls ? env.ph(cls) : undefined
    const fill = await fillXml(props.g, env, 'none', [box.w, box.h])
    const ln = lineXml(props.g, env.styles, 'none')
    const body = this.txBody(textBox, el, props, box, true, fill, !!ph)
    if (!body && !ph && !fill && ln.includes('noFill')) return undefined
    const txBox = !ph && !fill && ln.includes('noFill') ? ' txBox="1"' : ''
    const locks = ph ? '<a:spLocks noGrp="1"/>' : ''
    const kind = ph ? 'Placeholder' : 'Text Box'
    const xml =
      `<p:sp>${this.nv('Sp', el, kind, `<p:cNvSpPr${txBox}>${locks}</p:cNvSpPr>`, ph)}` +
      `<p:spPr>${xfrm(box)}${RECT}${fill ?? '<a:noFill/>'}${ln}${shadowXml(props.g)}</p:spPr>${body || `<p:txBody>${bodyPrXml(props.g, props.p, { frame: true, autoGrow: false })}<a:lstStyle/><a:p>${rPrXml('endParaRPr', props.t, env)}</a:p></p:txBody>`}</p:sp>`
    return { xml, box }
  }

  /** a picture: the first image a browser shows (else one Office shows), cropped by fo:clip */
  private async picture(el: ONode, images: ONode[], box: Box, props: Props): Promise<string | undefined> {
    const { env } = this
    const found: Img[] = []
    for (const im of images.slice(0, 4)) {
      const img = await env.image(im)
      if (img) found.push(img)
    }
    const raster = found.find((i) => WEB.has(i.ext) && i.ext !== 'svg')
    const svg = found.find((i) => i.ext === 'svg')
    const main = raster ?? svg ?? found.find((i) => OFFICE.has(i.ext))
    if (!main) return undefined
    let crop = ''
    const clip = clipOf(props.g['fo:clip'])
    if (clip && main.w && main.h) {
      const [t, r, b, l] = clip
      const f = (v: number, of: number) => Math.round(Math.max(-1, Math.min(0.99, v / of)) * 100000)
      if (t || r || b || l) crop = `<a:srcRect l="${f(l, main.w)}" t="${f(t, main.h)}" r="${f(r, main.w)}" b="${f(b, main.h)}"/>`
    }
    const svgExt = svg && main !== svg ? `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${svg.rid}"/></a:ext></a:extLst>` : ''
    const alpha = fraction(props.g['draw:image-opacity'] ?? props.g['draw:opacity'])
    let amt = alpha !== undefined && alpha < 1 ? `<a:alphaModFix amt="${Math.round(alpha * 100000)}"/>` : ''
    // color modes and adjustments
    const mode = props.g['draw:color-mode']
    if (mode === 'greyscale') amt += '<a:grayscl/>'
    else if (mode === 'mono') amt += '<a:biLevel thresh="50000"/>'
    else if (mode === 'watermark') amt += '<a:lum bright="70000" contrast="-70000"/>'
    const pct = (v: string | undefined) => Math.round(Math.max(-100, Math.min(100, parseFloat(v ?? '0') || 0)) * 1000)
    const bright = pct(props.g['draw:luminance'])
    const contrast = pct(props.g['draw:contrast'])
    if (mode !== 'watermark' && (bright || contrast)) amt += `<a:lum${bright ? ` bright="${bright}"` : ''}${contrast ? ` contrast="${contrast}"` : ''}/>`
    const ln = lineXml(props.g, env.styles, 'none')
    const mirror = props.g['style:mirror'] ?? ''
    const b = { ...box, flipH: box.flipH !== /horizontal/.test(mirror), flipV: box.flipV !== /vertical/.test(mirror) }
    return (
      `<p:pic>${this.nv('Pic', el, 'Picture', '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>')}` +
      `<p:blipFill><a:blip r:embed="${main.rid}">${amt}${svgExt}</a:blip>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
      `<p:spPr>${xfrm(b)}${RECT}${ln.includes('noFill') ? '' : ln}${shadowXml(props.g)}</p:spPr></p:pic>`
    )
  }

  // ---- shapes

  private async shape(el: ONode): Promise<Drawn | undefined> {
    const { env } = this
    const box = frameBox(el)
    if (!box) return undefined
    let geom: Geom | undefined
    switch (el.name) {
      case 'draw:custom-shape':
        geom = customGeom(child(el, 'draw:enhanced-geometry'), box.w, box.h)
        break
      case 'draw:rect':
        geom = rectGeom(el, box.w, box.h)
        break
      case 'draw:ellipse':
      case 'draw:circle':
        geom = ellipseGeom(el, box.w, box.h)
        break
      case 'draw:polygon':
      case 'draw:polyline':
        geom = polyGeom(el, box.w, box.h, el.name === 'draw:polygon')
        break
      case 'draw:path':
        geom = svgPathGeom(el, box.w, box.h)
        break
      case 'draw:regular-polygon':
        geom = regularGeom(el, box.w, box.h)
        break
      default:
        geom = { xml: RECT, flipH: false, flipV: false, open: false }
    }
    if (!geom) return undefined
    const [family, name] = styleOf(el, env.masterName)
    const props = env.styles.full(family, name, env.master)
    const eg = child(el, 'draw:enhanced-geometry')
    if (eg?.attrs['draw:text-path'] === 'true' || eg?.attrs['draw:type']?.startsWith('fontwork-')) return this.fontwork(el, box, props)
    const fill = geom.open ? undefined : await fillXml(props.g, env, 'solid', [box.w, box.h])
    const ln = lineXml(props.g, env.styles, 'solid')
    const b = { ...box, flipH: box.flipH !== geom.flipH, flipV: box.flipV !== geom.flipV, rot: geom.turn ? (360 - box.rot) % 360 : box.rot }
    // the shape's text area inside its frame
    const area = geom.textArea
    const textProps = area ? { ...props, g: { ...props.g, ...Object.fromEntries(['left', 'top', 'right', 'bottom'].map((side, k) => [`fo:padding-${side}`, `${(toPt(props.g[`fo:padding-${side}`]) ?? toPt(props.g['fo:padding']) ?? 0) + area[k]}pt`])) } } : props
    const body = this.txBody(el, el, textProps, box, false, fill, false)
    if (!body && !fill && ln.includes('noFill')) return undefined
    const xml =
      `<p:sp>${this.nv('Sp', el, 'Shape', '<p:cNvSpPr/>')}<p:spPr>${xfrm(b)}${geom.xml}${fill ?? '<a:noFill/>'}${ln}${shadowXml(props.g)}</p:spPr>` +
      `${body}</p:sp>`
    return { xml, box }
  }

  /**
   * Fontwork: text drawn along the shape's path in its fill. Approximated by the text alone, centered, colored
   * with the fill and sized to fill the frame.
   */
  private fontwork(el: ONode, box: Box, props: Props): Drawn | undefined {
    const lines = [...el.kids].filter((k): k is ONode => isEl(k) && (k.name === 'text:p' || k.name === 'text:list')).flatMap((k) => textContent(k).split('\n'))
    const longest = Math.max(1, ...lines.map((l) => l.trim().length))
    if (!lines.some((l) => l.trim())) return undefined
    const g = props.g
    const gradient = g['draw:fill'] === 'gradient' ? this.env.styles.gradients.get(g['draw:fill-gradient-name'] ?? '')?.attrs['draw:start-color'] : undefined
    const fill = g['draw:fill'] === 'none' || g['draw:fill'] === 'bitmap' ? undefined : (gradient ?? g['draw:fill-color'])
    const color = fill ?? (g['draw:stroke'] !== 'none' ? g['svg:stroke-color'] : undefined) ?? '#000000'
    const sz = Math.max(4, Math.min(400, Math.min((box.h / lines.length) * 0.8, box.w / (longest * 0.62))))
    const env: TextEnv = { ...this.env, force: { 'fo:font-size': `${sz}pt`, 'fo:color': color, 'style:use-window-font-color': 'false' } }
    const frame: TextFrame = { level: () => overlay(props, { ...noProps(), p: { 'fo:text-align': 'center', 'fo:margin-left': '0cm', 'fo:text-indent': '0cm', 'fo:margin-top': '0cm', 'fo:margin-bottom': '0cm', 'fo:line-height': '100%' } }) }
    const paras = paragraphsXml(el, frame, env)
    const xml =
      `<p:sp>${this.nv('Sp', el, 'Fontwork', '<p:cNvSpPr/>')}<p:spPr>${xfrm(box)}${RECT}<a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>` +
      `<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr" anchorCtr="1" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`
    return { xml, box }
  }

  private async line(el: ONode): Promise<Drawn | undefined> {
    const { env } = this
    const [family, name] = styleOf(el, env.masterName)
    const props = env.styles.full(family, name, env.master)
    // a routed connector with its path (in 1/100 mm on the page)
    if (el.name === 'draw:connector' && el.attrs['svg:d']) {
      const b = svgPathBounds(el.attrs['svg:d'])
      if (b) {
        const k = 72 / 2540
        const box: Box = { x: b[0] * k, y: b[1] * k, w: (b[2] - b[0]) * k, h: (b[3] - b[1]) * k, rot: 0, flipH: false, flipV: false }
        const geom = svgPathGeom(el, box.w, box.h, [b[0], b[1], b[2] - b[0], b[3] - b[1]])
        if (geom) {
          const xml = `<p:cxnSp>${this.nv('CxnSp', el, 'Connector', '<p:cNvCxnSpPr/>')}<p:spPr>${xfrm(box)}${geom.xml}<a:noFill/>${lineXml(props.g, env.styles, 'solid')}</p:spPr></p:cxnSp>`
          return { xml, box }
        }
      }
    }
    const [x1, y1, x2, y2] = linePoints(el)
    const box: Box = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), rot: 0, flipH: x2 < x1, flipV: y2 < y1 }
    const ln = lineXml(props.g, env.styles, 'solid')
    const xml = `<p:cxnSp>${this.nv('CxnSp', el, el.name === 'draw:line' ? 'Line' : 'Connector', '<p:cNvCxnSpPr/>')}<p:spPr>${xfrm(box)}<a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:noFill/>${ln}</p:spPr></p:cxnSp>`
    return { xml, box }
  }

  private async group(el: ONode, nest: number): Promise<Drawn | undefined> {
    const kids = await this.drawables(el, nest + 1)
    if (!kids.length) return undefined
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const k of kids) {
      if (!k.box) continue
      const [a, b, c, d] = bounds(k.box)
      x0 = Math.min(x0, a)
      y0 = Math.min(y0, b)
      x1 = Math.max(x1, c)
      y1 = Math.max(y1, d)
    }
    if (!Number.isFinite(x0)) x0 = y0 = x1 = y1 = 0
    const box: Box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, rot: 0, flipH: false, flipV: false }
    const off = `<a:off x="${emu(box.x)}" y="${emu(box.y)}"/><a:ext cx="${emu(box.w)}" cy="${emu(box.h)}"/>`
    const xml =
      `<p:grpSp>${this.nv('GrpSp', el, 'Group', '<p:cNvGrpSpPr/>')}<p:grpSpPr><a:xfrm>${off}${off.replace('<a:off', '<a:chOff').replace('<a:ext', '<a:chExt')}</a:xfrm></p:grpSpPr>` +
      `${kids.map((k) => k.xml).join('')}</p:grpSp>`
    return { xml, box }
  }

  // ---- tables

  private async table(el: ONode, table: ONode, box: Box): Promise<string> {
    const { env } = this
    const { styles, master } = env
    // columns and rows, repeated ones expanded
    const cols: { width?: number; cell?: string }[] = []
    const colEls = [...children(table, 'table:table-column'), ...children(child(table, 'table:table-columns'), 'table:table-column'), ...children(child(table, 'table:table-header-columns'), 'table:table-column')]
    for (const c of colEls) {
      const n = Math.min(64, Math.max(1, Number(c.attrs['table:number-columns-repeated'] ?? 1) || 1))
      const w = toPt(styles.props('table-column', c.attrs['table:style-name'], master).c['style:column-width'])
      for (let k = 0; k < n && cols.length < 64; k++) cols.push({ width: w, cell: c.attrs['table:default-cell-style-name'] })
    }
    const rowEls: ONode[] = []
    const addRows = (parent: ONode | undefined) => {
      for (const r of children(parent)) {
        if (r.name === 'table:table-row') {
          const n = Math.min(200, Math.max(1, Number(r.attrs['table:number-rows-repeated'] ?? 1) || 1))
          for (let k = 0; k < n && rowEls.length < 200; k++) rowEls.push(r)
        } else if (r.name === 'table:table-header-rows' || r.name === 'table:table-rows' || r.name === 'table:table-row-group') addRows(r)
      }
    }
    addRows(table)
    const grid = rowEls.map((r) => {
      const cells: ONode[] = []
      for (const c of children(r)) {
        if (c.name !== 'table:table-cell' && c.name !== 'table:covered-table-cell') continue
        const n = Math.min(64, Math.max(1, Number(c.attrs['table:number-columns-repeated'] ?? 1) || 1))
        for (let k = 0; k < n && cells.length < 64; k++) cells.push(c)
      }
      return cells
    })
    const nCols = Math.max(cols.length, ...grid.map((r) => r.length), 1)
    while (cols.length < nCols) cols.push({})
    const known = cols.reduce((a, c) => a + (c.width ?? 0), 0)
    const unknown = cols.filter((c) => !c.width).length
    const rest = unknown ? Math.max(0, box.w - known) / unknown : 0
    const widths = cols.map((c) => Math.max(0, c.width ?? (rest || box.w / nCols)))
    const heights = rowEls.map((r) => {
      const c = styles.props('table-row', r.attrs['table:style-name'], master).c
      return toPt(c['style:row-height']) ?? toPt(c['style:min-row-height'])
    })
    const knownH = heights.reduce<number>((a, h) => a + (h ?? 0), 0)
    const missing = heights.filter((h) => h === undefined).length
    const restH = missing ? Math.max(0, box.h - knownH) / missing : 0
    // table template styles by position
    const tpl = styles.templates.get(table.attrs['table:template-name'] ?? '')
    const flag = (k: string) => table.attrs[`table:use-${k}-styles`] === 'true'
    const tplStyle = (r: number, c: number): string | undefined => {
      if (!tpl) return undefined
      const part = (n: string) => child(tpl, `table:${n}`)?.attrs['table:style-name']
      if (flag('first-row') && r === 0) return part('first-row')
      if (flag('last-row') && r === rowEls.length - 1) return part('last-row')
      if (flag('first-column') && c === 0) return part('first-column')
      if (flag('last-column') && c === nCols - 1) return part('last-column')
      const br = r - (flag('first-row') ? 1 : 0)
      if (flag('banding-rows') && br % 2 === 0) return part('odd-rows') ?? part('body')
      const bc = c - (flag('first-column') ? 1 : 0)
      if (flag('banding-columns') && bc % 2 === 0) return part('odd-columns') ?? part('body')
      return part('body')
    }
    // merged cells: the anchor covering each position
    const anchor: ([number, number] | undefined)[][] = rowEls.map(() => new Array(nCols).fill(undefined))
    grid.forEach((cells, r) =>
      cells.forEach((c, k) => {
        if (c.name !== 'table:table-cell' || anchor[r][k]) return
        const rs = Math.min(rowEls.length - r, Math.max(1, Number(c.attrs['table:number-rows-spanned'] ?? 1) || 1))
        const cs = Math.min(nCols - k, Math.max(1, Number(c.attrs['table:number-columns-spanned'] ?? 1) || 1))
        for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) if (!anchor[r + i][k + j]) anchor[r + i][k + j] = [r, k]
      }),
    )
    let rows = ''
    for (let r = 0; r < rowEls.length; r++) {
      rows += `<a:tr h="${Math.max(0, emu(heights[r] ?? (restH || box.h / Math.max(1, rowEls.length))))}">`
      for (let c = 0; c < nCols; c++) {
        const cell = grid[r][c]
        const a = anchor[r][c]
        let attrs = ''
        let content: ONode | undefined
        if (a && a[0] === r && a[1] === c && cell) {
          const cs = Number(cell.attrs['table:number-columns-spanned'] ?? 1) || 1
          const rs = Number(cell.attrs['table:number-rows-spanned'] ?? 1) || 1
          if (cs > 1) attrs += ` gridSpan="${Math.min(cs, nCols - c)}"`
          if (rs > 1) attrs += ` rowSpan="${Math.min(rs, rowEls.length - r)}"`
          content = cell
        } else if (a) {
          if (a[1] !== c) attrs += ' hMerge="1"'
          if (a[0] !== r) attrs += ' vMerge="1"'
        }
        // the template's style for the position, the column's and row's default cell style, the cell's own
        let props = overlay(styles.defaults('table-cell'), styles.props('table-cell', tplStyle(r, c), master))
        for (const name of [cols[c].cell, rowEls[r].attrs['table:default-cell-style-name'], (content ?? cell)?.attrs['table:style-name']]) {
          if (name) props = overlay(props, styles.props('table-cell', name, master))
        }
        rows += `<a:tc${attrs}>${await this.cellXml(content, props)}</a:tc>`
      }
      rows += '</a:tr>'
    }
    const tblBox = { ...box, rot: 0, flipH: false, flipV: false }
    return (
      `<p:graphicFrame>${this.nv('GraphicFrame', el, 'Table', '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>')}${xfrm(tblBox, 'p:xfrm')}` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr${flag('first-row') ? ' firstRow="1"' : ''}${flag('banding-rows') ? ' bandRow="1"' : ''}/>` +
      `<a:tblGrid>${widths.map((w) => `<a:gridCol w="${emu(w)}"/>`).join('')}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
    )
  }

  private async cellXml(cell: ONode | undefined, props: Props): Promise<string> {
    const { env } = this
    const g = props.g
    const fill = await fillXml(g, env, 'none')
    const frame: TextFrame = { level: () => props }
    // the automatic text color follows the page, not the cell fill
    let paras = cell ? paragraphsXml(cell, frame, env) : ''
    if (!paras) paras = `<a:p>${rPrXml('endParaRPr', props.t, env)}</a:p>`
    const pad = (side: string, def: number) => emu(Math.max(0, toPt(g[`fo:padding-${side}`]) ?? toPt(g['fo:padding']) ?? toPt(props.c[`fo:padding-${side}`]) ?? def))
    const anchor = { middle: 'ctr', bottom: 'b' }[g['draw:textarea-vertical-align'] ?? props.c['style:vertical-align'] ?? ''] ?? 't'
    const border = (side: string, tag: string) => {
      const v = props.p[`fo:border-${side}`] ?? props.p['fo:border'] ?? props.c[`fo:border-${side}`] ?? props.c['fo:border']
      const m = /^\s*(\S+)\s+(\S+)\s+(#[0-9a-fA-F]{6})\s*$/.exec(v ?? '')
      if (!m || m[2] === 'none' || m[2] === 'hidden') return `<a:${tag} w="0"><a:noFill/></a:${tag}>`
      const w = Math.max(0.25, toPt(m[1]) ?? (m[1] === 'thick' ? 3 : m[1] === 'medium' ? 1.5 : 0.75))
      const dash = m[2] === 'dashed' ? '<a:prstDash val="dash"/>' : m[2] === 'dotted' ? '<a:prstDash val="sysDot"/>' : ''
      return `<a:${tag} w="${emu(w)}">${solid(toHex(m[3])!)}${dash}</a:${tag}>`
    }
    return (
      `<a:txBody><a:bodyPr/><a:lstStyle/>${paras}</a:txBody>` +
      `<a:tcPr marL="${pad('left', 7.2)}" marR="${pad('right', 7.2)}" marT="${pad('top', 3.6)}" marB="${pad('bottom', 3.6)}" anchor="${anchor}">` +
      `${border('left', 'lnL')}${border('right', 'lnR')}${border('top', 'lnT')}${border('bottom', 'lnB')}${fill ?? '<a:noFill/>'}</a:tcPr>`
    )
  }
}

/** the own properties of a style (not inherited) */
function propsOfNode(s: ONode): Props {
  const p = noProps()
  for (const g of children(s)) {
    const key = g.name === 'style:paragraph-properties' ? 'p' : g.name === 'style:text-properties' ? 't' : g.name.endsWith('graphic-properties') ? 'g' : undefined
    if (key) Object.assign(p[key], g.attrs)
  }
  return p
}

function descendantsHas(n: ONode, name: string, depth = 0): boolean {
  if (depth > 6) return false
  return n.kids.some((k) => isEl(k) && (k.name === name || descendantsHas(k, name, depth + 1)))
}

