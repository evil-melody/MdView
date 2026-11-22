/**
 * Keynote presentations (iWork '13+) → PPTX, for viewing. Master slides become layouts (their objects drawn
 * under the slides'), slides keep their objects at their place: text boxes and placeholders, shapes (preset
 * or custom paths), images (cropped by their mask), groups, tables and the slide background. Every property
 * is written on the element itself, so nothing depends on PowerPoint placeholder inheritance.
 */
import { THEME } from '../convert'
import { escAttr, escText } from '../raw'
import { writeZip, type PartData } from '../zipwrite'
import type { IworkPackage } from './iwa'
import { imageData, Media, mediaTypes, Part, XML_HEAD } from './ooxml'
import type { Msg } from './proto'
import { fillColor, hangOf, hexColor, IworkStyles, type CharProps } from './styles'
import { anchors, readTable, tableLook, type CellStroke, type IworkTable } from './table'
import { paragraphs, STORAGE } from './text'

// message types
const PLACEHOLDER = 7
const NUMBER_ATTACHMENT = 2043
const TEXTUAL_ATTACHMENT = new Set([14, 2004, 2007, 2009])
const SHAPE_INFO = 2011
const SHAPE_STYLE = 2025
const SHAPE = 3004
const IMAGE = 3005
const MOVIE = 3007
const GROUP = 3008
const CONNECTION_LINE = 3009
const CHART = 5021
const TABLE_INFO = 6000

const MAX_DEPTH = 8

const emu = (pt: number) => Math.round(pt * 12700)
const AUTONUM = [
  ['arabicPeriod', 'arabicParenBoth', 'arabicParenR'],
  ['romanUcPeriod', 'romanUcParenBoth', 'romanUcParenR'],
  ['romanLcPeriod', 'romanLcParenBoth', 'romanLcParenR'],
  ['alphaUcPeriod', 'alphaUcParenBoth', 'alphaUcParenR'],
  ['alphaLcPeriod', 'alphaLcParenBoth', 'alphaLcParenR'],
]
const ALGN: Record<string, string> = { left: 'l', right: 'r', center: 'ctr', both: 'just' }
const ANCHOR = ['t', 'ctr', 'b', 't']
const U: Record<string, string> = { single: 'sng', double: 'dbl', wave: 'wavy', none: 'none' }
const POLYGON: Record<number, string> = { 3: 'triangle', 4: 'diamond', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 10: 'decagon', 12: 'dodecagon' }

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const GRP =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

/** frame of a drawable (pt) */
interface Frame {
  x: number
  y: number
  w: number
  h: number
  /** clockwise degrees */
  rot: number
  flipH: boolean
  flipV: boolean
  /** TSD geometry flags: 1 width set, 2 height set (else the text sizes the box), 4 horizontal flip */
  flags: number
}

function frameOf(drawable: Msg | undefined): Frame | undefined {
  const g = drawable?.msg(1)
  const pos = g?.msg(1)
  const size = g?.msg(2)
  if (!g || !size) return undefined
  const flags = g.u(3) ?? 0
  // iWork angles turn counterclockwise
  const rot = (((-(g.float(4) ?? 0)) % 360) + 360) % 360
  return { x: pos?.float(1) ?? 0, y: pos?.float(2) ?? 0, w: Math.max(0, size.float(1) ?? 0), h: Math.max(0, size.float(2) ?? 0), rot, flipH: !!(flags & 4), flipV: false, flags }
}

function xfrm(f: Frame, tag = 'a:xfrm'): string {
  const attrs = (f.rot ? ` rot="${Math.round(f.rot * 60000)}"` : '') + (f.flipH ? ' flipH="1"' : '') + (f.flipV ? ' flipV="1"' : '')
  return `<${tag}${attrs}><a:off x="${emu(f.x)}" y="${emu(f.y)}"/><a:ext cx="${emu(f.w)}" cy="${emu(f.h)}"/></${tag}>`
}

const solid = (c: string) => `<a:solidFill><a:srgbClr val="${c}"/></a:solidFill>`

/** TSD.FillArchive → DrawingML fill (image fills through `image`) */
function fillXml(m: Msg | undefined, image: (dataId: number) => string | undefined): string | undefined {
  if (!m) return undefined
  const color = hexColor(m.msg(1))
  if (color) return solid(color)
  const grad = m.msg(2)
  if (grad) {
    const stops = grad.msgs(2).flatMap((s) => {
      const c = hexColor(s.msg(1))
      return c ? [`<a:gs pos="${Math.round(Math.min(1, Math.max(0, s.float(2) ?? 0)) * 100000)}"><a:srgbClr val="${c}"/></a:gs>`] : []
    })
    if (stops.length === 1) return stops[0].replace(/<a:gs [^>]*>(.*)<\/a:gs>/, '<a:solidFill>$1</a:solidFill>')
    if (stops.length > 1) {
      if (grad.u(1) === 1) return `<a:gradFill><a:gsLst>${stops.join('')}</a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>`
      const rad = grad.msg(5)?.float(2) ?? 0
      const ang = (((-rad * 180) / Math.PI) % 360 + 360) % 360
      return `<a:gradFill><a:gsLst>${stops.join('')}</a:gsLst><a:lin ang="${Math.round(ang * 60000)}" scaled="0"/></a:gradFill>`
    }
  }
  const img = m.msg(3)
  const did = img && (img.msg(6)?.u(1) ?? img.msg(7)?.u(1))
  if (did !== undefined) {
    const rid = image(did)
    if (rid) return `<a:blipFill><a:blip r:embed="${rid}"/>${img!.u(2) === 2 ? '<a:tile/>' : '<a:stretch><a:fillRect/></a:stretch>'}</a:blipFill>`
  }
  return m.has(1) || m.has(2) || m.has(3) ? '<a:noFill/>' : undefined
}

/** TSD.StrokeArchive → a:ln (undefined: no line) */
function lineXml(m: Msg | undefined, ends?: { head?: Msg; tail?: Msg }): string | undefined {
  if (!m || m.msg(6)?.u(1) === 2) return undefined
  const color = hexColor(m.msg(1))
  if (!color) return undefined
  const w = m.float(2) ?? 1
  const pattern = m.msg(6)
  const dashes = pattern?.u(1) === 0 ? pattern.floats(4).slice(0, pattern.u(3) ?? 0) : []
  const dash = dashes.length ? (dashes[0] <= 1.5 ? 'sysDot' : 'dash') : undefined
  const end = (tag: string, e: Msg | undefined) => {
    const id = e?.str(5) ?? ''
    if (!e || !id || /none/i.test(id)) return ''
    const type = /circle/i.test(id) ? 'oval' : /square|diamond/i.test(id) ? 'diamond' : /open|line/i.test(id) ? 'arrow' : 'triangle'
    return `<a:${tag} type="${type}"/>`
  }
  return `<a:ln w="${emu(w)}">${solid(color)}${dash ? `<a:prstDash val="${dash}"/>` : ''}${end('headEnd', ends?.head)}${end('tailEnd', ends?.tail)}</a:ln>`
}

/** TSP.Path (in a natural size) → custGeom path commands */
function pathCommands(path: Msg | undefined): { d: string; closed: boolean } {
  let d = ''
  let closed = false
  const pt = (p: Msg) => `<a:pt x="${emu(p.float(1) ?? 0)}" y="${emu(p.float(2) ?? 0)}"/>`
  for (const e of path?.msgs(1) ?? []) {
    const pts = e.msgs(2)
    switch (e.u(1)) {
      case 1:
        if (pts[0]) d += `<a:moveTo>${pt(pts[0])}</a:moveTo>`
        break
      case 2:
        if (pts[0]) d += `<a:lnTo>${pt(pts[0])}</a:lnTo>`
        break
      case 3:
        if (pts.length >= 2) d += `<a:quadBezTo>${pt(pts[0])}${pt(pts[1])}</a:quadBezTo>`
        break
      case 4:
        if (pts.length >= 3) d += `<a:cubicBezTo>${pt(pts[0])}${pt(pts[1])}${pt(pts[2])}</a:cubicBezTo>`
        break
      case 5:
        d += '<a:close/>'
        closed = true
        break
    }
  }
  return { d, closed }
}

/** TSD.EditableBezierPathSourceArchive → custGeom path commands */
function editableCommands(src: Msg): { d: string; closed: boolean } {
  let d = ''
  let closed = false
  const pt = (p: Msg | undefined) => `<a:pt x="${emu(p?.float(1) ?? 0)}" y="${emu(p?.float(2) ?? 0)}"/>`
  for (const sp of src.msgs(1)) {
    const nodes = sp.msgs(1)
    if (!nodes.length) continue
    d += `<a:moveTo>${pt(nodes[0].msg(2))}</a:moveTo>`
    const seg = (a: Msg, b: Msg) => `<a:cubicBezTo>${pt(a.msg(3) ?? a.msg(2))}${pt(b.msg(1) ?? b.msg(2))}${pt(b.msg(2))}</a:cubicBezTo>`
    for (let k = 1; k < nodes.length; k++) d += seg(nodes[k - 1], nodes[k])
    if (sp.bool(2)) {
      d += seg(nodes[nodes.length - 1], nodes[0]) + '<a:close/>'
      closed = true
    }
  }
  return { d, closed }
}

/** is this path the frame's rectangle? */
function isRect(path: Msg | undefined, w: number, h: number): boolean {
  const els = path?.msgs(1) ?? []
  if (els.some((e) => e.u(1) === 3 || e.u(1) === 4)) return false
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5
  const corners = new Set<string>()
  for (const e of els) {
    const p = e.msgs(2)[0]
    if (!p || (e.u(1) !== 1 && e.u(1) !== 2)) continue
    const x = p.float(1) ?? 0
    const y = p.float(2) ?? 0
    if (!(near(x, 0) || near(x, w)) || !(near(y, 0) || near(y, h))) return false
    corners.add(`${near(x, 0)}${near(y, 0)}`)
  }
  return corners.size === 4
}

interface Geometry {
  /** prstGeom / custGeom element */
  xml: string
  /** open path: a line, without fill */
  open: boolean
  flipH: boolean
  flipV: boolean
}

/** TSD.PathSourceArchive → shape geometry */
function geometry(src: Msg | undefined, w: number, h: number): Geometry {
  const flipH = !!src?.bool(1)
  const flipV = !!src?.bool(2)
  const prst = (name: string, adj = '') => ({ xml: `<a:prstGeom prst="${name}"><a:avLst>${adj}</a:avLst></a:prstGeom>`, open: false, flipH, flipV })
  const custom = (cmds: { d: string; closed: boolean }, nw: number, nh: number): Geometry => ({
    xml: `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${emu(nw)}" h="${emu(nh)}"${cmds.closed ? '' : ' fill="none"'}>${cmds.d}</a:path></a:pathLst></a:custGeom>`,
    open: !cmds.closed,
    flipH,
    flipV,
  })
  if (!src) return prst('rect')
  const scalar = src.msg(4)
  if (scalar) {
    const v = scalar.float(2) ?? 0
    switch (scalar.u(1) ?? 0) {
      case 0: {
        const r = Math.min(50000, Math.round((Math.max(0, v) / Math.max(1, Math.min(w, h))) * 100000))
        return r ? prst('roundRect', `<a:gd name="adj" fmla="val ${r}"/>`) : prst('rect')
      }
      case 1:
        return prst(POLYGON[Math.round(v)] ?? 'ellipse')
      case 2:
        return prst('chevron')
    }
  }
  const point = src.msg(3)
  if (point) {
    const t = point.u(1) ?? 0
    return prst(t === 0 ? 'leftArrow' : t === 1 ? 'rightArrow' : t === 10 ? 'leftRightArrow' : t === 100 ? 'star5' : 'plus')
  }
  if (src.msg(6)) return prst('wedgeRoundRectCallout')
  const bezier = src.msg(5) ?? src.msg(7)?.msg(1)
  if (bezier) {
    const ns = bezier.msg(2)
    const nw = ns?.float(1) || w
    const nh = ns?.float(2) || h
    if (isRect(bezier.msg(3), nw, nh)) return prst('rect')
    const cmds = pathCommands(bezier.msg(3))
    if (cmds.d) return custom(cmds, nw, nh)
  }
  const editable = src.msg(8)
  if (editable) {
    const ns = editable.msg(2)
    const cmds = editableCommands(editable)
    if (cmds.d) return custom(cmds, ns?.float(1) || w, ns?.float(2) || h)
  }
  return prst('rect')
}

/** DrawingML run properties */
function rPrXml(c: CharProps, sz: number, tag: string, link?: string): string {
  let a = ` lang="en-US" sz="${Math.round(sz * 100)}"`
  if (c.b !== undefined) a += ` b="${c.b ? 1 : 0}"`
  if (c.i !== undefined) a += ` i="${c.i ? 1 : 0}"`
  if (c.u && c.u !== 'none') a += ` u="${U[c.u] ?? 'sng'}"`
  if (c.strike && c.strike !== 'none') a += ` strike="${c.strike === 'double' ? 'dblStrike' : 'sngStrike'}"`
  if (c.va === 'superscript') a += ' baseline="30000"'
  else if (c.va === 'subscript') a += ' baseline="-25000"'
  else if (c.shift) a += ` baseline="${Math.round((c.shift / sz) * 100000)}"`
  if (c.caps === 'caps') a += ' cap="all"'
  else if (c.caps === 'smallCaps') a += ' cap="small"'
  if (c.track) a += ` spc="${Math.round(c.track * sz * 100)}"`
  let x = c.color ? solid(c.color) : ''
  if (c.shd) x += `<a:highlight><a:srgbClr val="${c.shd}"/></a:highlight>`
  if (c.font) {
    const f = escAttr(c.font)
    x += `<a:latin typeface="${f}"/><a:ea typeface="${f}"/><a:cs typeface="${f}"/>`
  }
  if (link) x += `<a:hlinkClick r:id="${link}"/>`
  return `<a:${tag}${a}>${x}</a:${tag}>`
}

/** text of a run: line breaks split it (they become a:br), control characters go */
function runsXml(text: string, rPr: string): string {
  let out = ''
  const parts = text.split(/[\r\u000b\u000c\u2028]/)
  parts.forEach((part, k) => {
    if (k) out += `<a:br>${rPr.replace(/<a:hlinkClick [^>]*\/>/, '')}</a:br>`
    const t = part.replace(/[\u0000-\u0008\u000e-\u001f\ufffc\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '')
    if (t) out += `<a:r>${rPr}<a:t>${escText(t)}</a:t></a:r>`
  })
  return out
}

interface TextOpts {
  /** paragraph style of paragraphs without one */
  baseStyle?: number
}

// ---------------------------------------------------------------- converter

export class KeynoteConverter {
  private st: IworkStyles
  private media: Media
  private part!: Part
  private ids = 1
  private depth = 0
  private slideIndex = 0

  constructor(private pkg: IworkPackage) {
    this.st = new IworkStyles(pkg)
    this.media = new Media(pkg, 'ppt/media')
  }

  private image(dataId: number): string {
    return this.part.rel('image', '../media/' + this.media.name(dataId))
  }

  // ---- text

  /** a:p elements of a text storage */
  private storage(id: number | undefined, opts: TextOpts = {}): string {
    const s = this.pkg.get(id)
    if (!s || !STORAGE.has(this.pkg.type(id) ?? 0) || this.depth > MAX_DEPTH) return ''
    this.depth++
    try {
      let out = ''
      let prevAfter = 0
      for (const p of paragraphs(this.pkg, s)) {
        const paraId = p.paraId ?? opts.baseStyle
        const { pFull, cFull, sz } = this.st.resolved(paraId)
        // paragraph properties
        let attrs = ` algn="${ALGN[pFull.align ?? 'left'] ?? 'l'}"`
        let kids = ''
        if (pFull.line) kids += pFull.line.rule === 'auto' ? `<a:lnSpc><a:spcPct val="${Math.round(pFull.line.v * 100000)}"/></a:lnSpc>` : `<a:lnSpc><a:spcPts val="${Math.round(pFull.line.v * 100)}"/></a:lnSpc>`
        // between two paragraphs Keynote leaves the larger of the space after and the space before (DrawingML adds them)
        const after = pFull.after ?? 0
        const before = Math.max(0, (pFull.before ?? 0) - prevAfter)
        prevAfter = after
        kids += `<a:spcBef><a:spcPts val="${Math.round(before * 100)}"/></a:spcBef><a:spcAft><a:spcPts val="${Math.round(after * 100)}"/></a:spcAft>`
        const left = pFull.left ?? 0
        const lv = this.st.list(p.listId ?? pFull.list)?.[p.level]
        const hasText = p.segs.some((g) => g.t !== 'text' || /\S/.test(g.text))
        if (lv && lv.kind !== 'none' && hasText) {
          const hang = hangOf(lv, sz)
          attrs += ` marL="${emu(left + lv.indent + hang)}" indent="${emu(-hang)}" lvl="${p.level}"`
          if (lv.kind === 'bullet') kids += `<a:buFont typeface="Arial"/><a:buChar char="${escAttr(lv.text)}"/>`
          else kids += `<a:buAutoNum type="${AUTONUM[lv.fmt]?.[lv.punct] ?? 'arabicPeriod'}"/>`
        } else {
          attrs += ` marL="${emu(left)}" indent="${emu((pFull.first ?? left) - left)}"`
          kids += '<a:buNone/>'
        }
        let runs = ''
        for (const seg of p.segs) {
          const c: CharProps = { ...cFull, ...this.st.charFull(seg.charId) }
          const size = c.sz ?? sz
          if (seg.t === 'text') {
            const link = seg.href ? this.part.rel('hyperlink', seg.href, true) : undefined
            runs += runsXml(seg.text, rPrXml(c, size, 'rPr', link))
          } else if (seg.t === 'att') runs += this.field(seg.id, rPrXml(c, size, 'rPr'))
        }
        out += `<a:p><a:pPr${attrs}>${kids}</a:pPr>${runs}${rPrXml(cFull, sz, 'endParaRPr')}</a:p>`
      }
      return out
    } finally {
      this.depth--
    }
  }

  /** a text attachment: the slide number field (others have no text of their own here) */
  private field(id: number, rPr: string): string {
    const type = this.pkg.type(id)
    const m = this.pkg.get(id)
    if (!m || !(type === NUMBER_ATTACHMENT || (type !== undefined && TEXTUAL_ATTACHMENT.has(type)))) return ''
    if ((m.msg(1)?.u(2) ?? m.u(2)) !== 0) return ''
    const n = this.slideIndex + 1
    return `<a:fld id="{5C2D6F14-7E0B-4C3A-9D1E-${String(n).padStart(12, '0')}}" type="slidenum">${rPr}<a:t>${n}</a:t></a:fld>`
  }

  private hasText(id: number | undefined): boolean {
    const s = this.pkg.get(id)
    return !!s && /\S/.test(s.strs(3).join('').replace(/[\u0000-\u001f]/g, ''))
  }

  // ---- drawables

  private nv(tag: string, name: string, extra = '', descr?: string): string {
    const id = ++this.ids
    return `<p:nv${tag}Pr><p:cNvPr id="${id}" name="${escAttr(name)} ${id}"${descr ? ` descr="${escAttr(descr)}"` : ''}/>${extra}<p:nvPr/></p:nv${tag}Pr>`
  }

  /** the TSD.DrawableArchive inside a drawable object */
  private drawableArchive(id: number): Msg | undefined {
    const m = this.pkg.get(id)
    switch (this.pkg.type(id)) {
      case PLACEHOLDER:
        return m?.msg(1)?.msg(1)?.msg(1)
      case SHAPE_INFO:
      case CONNECTION_LINE:
        return m?.msg(1)?.msg(1)
      default:
        return m?.msg(1)
    }
  }

  /** spTree content of a drawable; `offset` moves a group's children */
  drawable(id: number | undefined, offset = { x: 0, y: 0 }): string {
    const type = this.pkg.type(id)
    const m = this.pkg.get(id)
    if (!m || this.depth > MAX_DEPTH) return ''
    this.depth++
    try {
      switch (type) {
        case PLACEHOLDER:
          return this.shape(m.msg(1), true, offset, true)
        case SHAPE_INFO:
          return this.shape(m, true, offset)
        case SHAPE:
        case CONNECTION_LINE:
          return this.shape(type === CONNECTION_LINE ? m.msg(1) : m, false, offset)
        case IMAGE:
          return this.picture(m, offset)
        case MOVIE:
          return this.picture(m, offset, 15)
        case GROUP:
          return this.group(m, offset)
        case TABLE_INFO: {
          const t = readTable(this.pkg, m.ref(2)!)
          const f = frameOf(m.msg(1))
          return t && f ? this.table(t, { ...f, x: f.x + offset.x, y: f.y + offset.y }) : ''
        }
        case CHART: {
          const f = frameOf(m.msg(1))
          if (!f) return ''
          const box = { ...f, x: f.x + offset.x, y: f.y + offset.y }
          return (
            `<p:sp>${this.nv('Sp', 'Chart', '<p:cNvSpPr/>')}<p:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${solid('F3F4F6')}<a:ln w="9525">${solid('9CA3AF')}<a:prstDash val="dash"/></a:ln></p:spPr>` +
            `<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="1400">${solid('6B7280')}</a:rPr><a:t>Chart</a:t></a:r></a:p></p:txBody></p:sp>`
          )
        }
        default:
          return ''
      }
    } finally {
      this.depth--
    }
  }

  /** a text box, placeholder or shape (TSWP.ShapeInfoArchive or TSD.ShapeArchive) */
  private shape(info: Msg | undefined, withText: boolean, offset: { x: number; y: number }, placeholder = false): string {
    const shapeArchive = withText ? info?.msg(1) : info
    const f = frameOf(shapeArchive?.msg(1))
    if (!info || !shapeArchive || !f) return ''
    const box = { ...f, x: f.x + offset.x, y: f.y + offset.y }
    const storage = withText ? (info.ref(4) ?? info.ref(2)) : undefined
    if (placeholder && !this.hasText(storage)) return ''

    // look: TSWP.ShapeStyleArchive (text shapes) wraps a TSD.ShapeStyleArchive (fill, stroke)
    const styleId = shapeArchive.ref(2)
    const wp = this.pkg.type(styleId) === SHAPE_STYLE
    let fill: string | undefined
    let line: Msg | undefined
    let valign: number | undefined
    let pad: Msg | undefined
    let paraStyle: number | undefined
    for (const st of this.st.chain(styleId, wp ? 2 : 1)) {
      const props = wp ? st.msg(1)?.msg(11) : st.msg(11)
      if (props && fill === undefined && props.has(1)) fill = fillXml(props.msg(1), (d) => this.image(d)) ?? '<a:noFill/>'
      if (props && !line && props.has(2)) line = props.msg(2)
      // TSWP.ShapeStylePropertiesArchive: vertical alignment, padding, paragraph style of new text
      const text = wp ? st.msg(11) : undefined
      if (text) {
        if (valign === undefined && text.has(2)) valign = text.u(2)
        if (!pad && text.has(6)) pad = text.msg(6)
        if (paraStyle === undefined && text.has(10)) paraStyle = text.ref(10)
      }
    }
    const geom = geometry(shapeArchive.msg(3), box.w, box.h)
    box.flipH = box.flipH !== geom.flipH
    box.flipV = geom.flipV
    const ln = lineXml(line, { head: shapeArchive.msg(4), tail: shapeArchive.msg(5) })
    const body = storage !== undefined ? this.storage(storage, { baseStyle: paraStyle }) : ''
    const textOk = /<a:(r|fld)>/.test(body)
    // a box sized by its text is placed by the point its text is aligned to (center, right / bottom edge)
    if (textOk && !(f.flags & 1)) {
      const s = this.pkg.get(storage)
      const first = s && paragraphs(this.pkg, s)[0]
      const align = this.st.resolved(first?.paraId ?? paraStyle).pFull.align
      if (align === 'center') box.x -= box.w / 2
      else if (align === 'right') box.x -= box.w
    }
    if (textOk && !(f.flags & 2)) {
      if (valign === 1) box.y -= box.h / 2
      else if (valign === 2) box.y -= box.h
    }
    if (!textOk && (!fill || fill === '<a:noFill/>' || geom.open) && !ln) return ''
    const ins = (k: number) => emu(pad?.float(k) ?? 4)
    const txBody = textOk
      ? `<p:txBody><a:bodyPr wrap="square" lIns="${ins(1)}" tIns="${ins(2)}" rIns="${ins(3)}" bIns="${ins(4)}" anchor="${ANCHOR[valign ?? 0] ?? 't'}" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>${body}</p:txBody>`
      : ''
    const spFill = geom.open ? '<a:noFill/>' : (fill ?? '<a:noFill/>')
    return (
      `<p:sp>${this.nv('Sp', placeholder ? 'Placeholder' : textOk ? 'Text Box' : 'Shape', `<p:cNvSpPr${textOk && !fill ? ' txBox="1"' : ''}/>`)}` +
      `<p:spPr>${xfrm(box)}${geom.xml}${spFill}${ln ?? '<a:ln><a:noFill/></a:ln>'}</p:spPr>${txBody}</p:sp>`
    )
  }

  /** an image (or a movie's poster frame), cropped by its mask */
  private picture(m: Msg, offset: { x: number; y: number }, posterField?: number): string {
    const f = frameOf(m.msg(1))
    const did = posterField ? m.msg(posterField)?.u(1) : imageData(this.pkg, m)
    if (!f || did === undefined || !this.pkg.dataPath(did) || !f.w || !f.h) return ''
    let box: Frame = { ...f, x: f.x + offset.x, y: f.y + offset.y }
    let crop = ''
    // the mask's frame is relative to the image's: the visible part
    const mask = posterField ? undefined : frameOf(this.pkg.get(m.ref(5))?.msg(1))
    if (mask && mask.w > 0 && mask.h > 0) {
      const frac = (v: number, of: number) => Math.round(Math.max(0, v / of) * 100000)
      const l = frac(mask.x, f.w)
      const t = frac(mask.y, f.h)
      const r = frac(f.w - mask.x - mask.w, f.w)
      const b = frac(f.h - mask.y - mask.h, f.h)
      if (l || t || r || b) crop = `<a:srcRect l="${l}" t="${t}" r="${r}" b="${b}"/>`
      box = { ...box, x: box.x + mask.x, y: box.y + mask.y, w: mask.w, h: mask.h }
    }
    let ln: string | undefined
    for (const st of this.st.chain(m.ref(3))) {
      const stroke = st.msg(11)?.msg(1)
      if (stroke) {
        ln = lineXml(stroke)
        break
      }
    }
    const descr = m.msg(1)?.str(8)
    return (
      `<p:pic>${this.nv('Pic', posterField ? 'Movie' : 'Picture', '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>', descr)}` +
      `<p:blipFill><a:blip r:embed="${this.image(did)}"/>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
      `<p:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${ln ?? ''}</p:spPr></p:pic>`
    )
  }

  /**
   * A group: children are drawn at their own place. Their frames are in the group's coordinates when they fall
   * inside the group's size but not inside its frame on the slide.
   */
  private group(m: Msg, offset: { x: number; y: number }): string {
    const f = frameOf(m.msg(1))
    const kids = m.refs(2)
    if (!f) return kids.map((k) => this.drawable(k, offset)).join('')
    const frames = kids.map((k) => frameOf(this.drawableArchive(k)))
    const inside = (ox: number, oy: number) => frames.every((c) => !c || (c.x >= ox - 1 && c.y >= oy - 1 && c.x + c.w <= ox + f.w + 1 && c.y + c.h <= oy + f.h + 1))
    const relative = !inside(f.x, f.y) && inside(0, 0)
    const at = relative ? { x: offset.x + f.x, y: offset.y + f.y } : offset
    return kids.map((k) => this.drawable(k, at)).join('')
  }

  private cellFill(id: number | undefined): string | undefined {
    for (const st of this.st.chain(id)) {
      const f = st.msg(11)?.msg(1)
      if (f) return fillColor(f)
    }
    return undefined
  }

  private table(t: IworkTable, f: Frame): string {
    const m = t.model
    const total = t.colWidths.reduce((a, b) => a + b, 0)
    const sx = total > 0 && f.w > 0 ? f.w / total : 1
    const widths = t.colWidths.map((w) => w * sx)
    // rows fill the frame when their sizes are not stored
    const tall = t.rowHeights.reduce((a, b) => a + b, 0)
    const heights = tall > 0 && f.h > tall ? t.rowHeights.map((h) => (h * f.h) / tall) : t.rowHeights
    const anchor = anchors(t)
    const look = tableLook(this.pkg, t, (id) => this.st.chain(id), hexColor, fillColor)
    const edge = (tag: string, s: CellStroke | null | undefined) => (s ? `<a:${tag} w="${emu(s.width)}">${solid(s.color)}</a:${tag}>` : `<a:${tag} w="0"><a:noFill/></a:${tag}>`)
    let rows = ''
    for (let r = 0; r < t.rows; r++) {
      const header = r < t.headerRows
      const footer = !header && r >= t.rows - t.footerRows
      rows += `<a:tr h="${emu(heights[r])}">`
      for (let c = 0; c < t.cols; c++) {
        const a = anchor[r][c]
        const src = a ? t.cells[a[0]][a[1]] : t.cells[r][c]
        let attrs = ''
        if (a && a[0] === r && a[1] === c) {
          if ((src?.colSpan ?? 1) > 1) attrs += ` gridSpan="${src!.colSpan}"`
          if ((src?.rowSpan ?? 1) > 1) attrs += ` rowSpan="${src!.rowSpan}"`
        } else if (a) {
          if (a[1] !== c) attrs += ' hMerge="1"'
          if (a[0] !== r) attrs += ' vMerge="1"'
        }
        const region = header ? m.ref(19) : footer ? m.ref(21) : c < t.headerCols ? m.ref(20) : m.ref(18)
        const banded = look.band && !header && !footer && (r - t.headerRows) % 2 === 1 ? look.band : undefined
        const fill = this.cellFill(src?.cellStyle) ?? banded ?? this.cellFill(region)
        const textStyle = src?.textStyle ?? (header ? m.ref(25) : footer ? m.ref(27) : c < t.headerCols ? m.ref(26) : m.ref(24))
        // the edges of the cell (of the whole range for a merged one)
        const [r0, c0] = a ?? [r, c]
        const rs = a ? (src?.rowSpan ?? 1) : 1
        const cs = a ? (src?.colSpan ?? 1) : 1
        const lines = edge('lnL', look.v[r0][c0]) + edge('lnR', look.v[r0][c0 + cs]) + edge('lnT', look.h[r0][c0]) + edge('lnB', look.h[r0 + rs]?.[c0])
        let body = ''
        if (!a || (a[0] === r && a[1] === c)) {
          if (src?.storage !== undefined) body = this.storage(src.storage, { baseStyle: textStyle })
          else if (src?.text) body = this.plain(src.text, textStyle)
        }
        if (!body) body = this.plain('', textStyle)
        rows +=
          `<a:tc${attrs}><a:txBody><a:bodyPr/><a:lstStyle/>${body}</a:txBody>` +
          `<a:tcPr marL="50800" marR="50800" marT="38100" marB="38100" anchor="ctr">${lines}${fill ? solid(fill) : '<a:noFill/>'}</a:tcPr></a:tc>`
      }
      rows += '</a:tr>'
    }
    return (
      `<p:graphicFrame>${this.nv('GraphicFrame', 'Table', '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>')}${xfrm({ ...f, rot: 0 }, 'p:xfrm')}` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr${t.headerRows ? ' firstRow="1"' : ''}/>` +
      `<a:tblGrid>${widths.map((w) => `<a:gridCol w="${emu(w)}"/>`).join('')}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
    )
  }

  /** paragraphs of plain text in a paragraph style */
  private plain(text: string, styleId: number | undefined): string {
    const { pFull, cFull, sz } = this.st.resolved(styleId)
    const rPr = rPrXml(cFull, sz, 'rPr')
    return text
      .split(/\r?\n|\u2029/)
      .map((line) => `<a:p><a:pPr algn="${ALGN[pFull.align ?? 'left'] ?? 'l'}"><a:buNone/></a:pPr>${runsXml(line, rPr)}${rPrXml(cFull, sz, 'endParaRPr')}</a:p>`)
      .join('')
  }

  // ---- slides

  /** p:bg of a slide (its style's fill, else its master's) */
  private background(slide: Msg, master: Msg | undefined): string {
    for (const s of [slide, master]) {
      for (const st of this.st.chain(s?.ref(1))) {
        const fill = st.msg(11)?.msg(1)
        if (!fill) continue
        const xml = fillXml(fill, (d) => this.image(d))
        if (xml) return `<p:bg><p:bgPr>${xml}<a:effectLst/></p:bgPr></p:bg>`
      }
    }
    return `<p:bg><p:bgPr>${solid('FFFFFF')}<a:effectLst/></p:bgPr></p:bg>`
  }

  /** drawables of a slide, back to front */
  private order(slide: Msg): number[] {
    const owned = slide.refs(7)
    const z = slide.refs(42)
    if (!z.length) return owned
    const set = new Set(owned)
    return [...z.filter((d) => set.has(d)), ...owned.filter((d) => !z.includes(d))]
  }

  /** the slides in show order, with their skipped flag */
  private slideList(show: Msg): { slide: number; hidden: boolean }[] {
    const out: { slide: number; hidden: boolean }[] = []
    const seen = new Set<number>()
    const visit = (nodeId: number | undefined) => {
      if (nodeId === undefined || seen.has(nodeId)) return
      seen.add(nodeId)
      const node = this.pkg.get(nodeId)
      if (!node) return
      const slide = node.ref(2)
      if (slide !== undefined && this.pkg.get(slide)) out.push({ slide, hidden: !!node.bool(4) })
      for (const c of node.refs(1)) visit(c)
    }
    const tree = show.msg(3)
    const flat = tree?.refs(2) ?? []
    if (flat.length) flat.forEach(visit)
    else visit(tree?.ref(1))
    return out
  }

  async convert(): Promise<Blob> {
    const { pkg } = this
    const doc = pkg.get(1)
    const show = pkg.get(doc?.ref(2))
    if (!show) throw new Error('Not a Keynote presentation')
    const size = show.msg(4)
    const W = size?.float(1) || 1024
    const H = size?.float(2) || 768
    const files = new Map<string, PartData>()
    const PML = 'application/vnd.openxmlformats-officedocument.presentationml'
    let overrides = `<Override PartName="/ppt/presentation.xml" ContentType="${PML}.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${PML}.slideMaster+xml"/>`
    overrides += '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'

    // masters → layouts (their own objects, placeholders aside)
    const layouts = new Map<number | undefined, number>()
    const layoutParts: Part[] = []
    const layoutOf = (masterId: number | undefined): number => {
      let n = layouts.get(masterId)
      if (n) return n
      n = layouts.size + 1
      layouts.set(masterId, n)
      const part = new Part(`ppt/slideLayouts/slideLayout${n}.xml`)
      part.rel('slideMaster', '../slideMasters/slideMaster1.xml')
      this.part = part
      this.ids = 1
      const master = pkg.get(masterId)
      const shapes = master ? this.order(master).filter((d) => pkg.type(d) !== PLACEHOLDER).map((d) => this.drawable(d)).join('') : ''
      const name = escAttr(master?.str(10) || `Layout ${n}`)
      files.set(part.path, `${XML_HEAD}<p:sldLayout ${NS} preserve="1"><p:cSld name="${name}"><p:spTree>${GRP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`)
      layoutParts.push(part)
      overrides += `<Override PartName="/${part.path}" ContentType="${PML}.slideLayout+xml"/>`
      return n
    }

    const slides = this.slideList(show)
    const presRels = new Part('ppt/presentation.xml')
    presRels.rel('slideMaster', 'slideMasters/slideMaster1.xml')
    let sldIds = ''
    slides.forEach(({ slide: slideId, hidden }, k) => {
      const slide = pkg.get(slideId)!
      const masterId = slide.ref(17)
      const layout = layoutOf(masterId)
      const part = new Part(`ppt/slides/slide${k + 1}.xml`)
      part.rel('slideLayout', `../slideLayouts/slideLayout${layout}.xml`)
      this.part = part
      this.ids = 1
      this.slideIndex = k
      const bg = this.background(slide, pkg.get(masterId))
      const shapes = this.order(slide).map((d) => this.drawable(d)).join('')
      files.set(part.path, `${XML_HEAD}<p:sld ${NS}${hidden ? ' show="0"' : ''}><p:cSld>${bg}<p:spTree>${GRP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`)
      files.set(part.relsPath, part.relsXml())
      overrides += `<Override PartName="/${part.path}" ContentType="${PML}.slide+xml"/>`
      sldIds += `<p:sldId id="${256 + k}" r:id="${presRels.rel('slide', `slides/slide${k + 1}.xml`)}"/>`
    })
    if (!layouts.size) layoutOf(undefined)
    presRels.rel('theme', 'theme/theme1.xml')
    for (const part of layoutParts) files.set(part.relsPath, part.relsXml())

    const master = new Part('ppt/slideMasters/slideMaster1.xml')
    const layoutIds = layoutParts.map((_, k) => `<p:sldLayoutId id="${2147483649 + k}" r:id="${master.rel('slideLayout', `../slideLayouts/slideLayout${k + 1}.xml`)}"/>`).join('')
    master.rel('theme', '../theme/theme1.xml')
    files.set(
      master.path,
      `${XML_HEAD}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr>${solid('FFFFFF')}<a:effectLst/></p:bgPr></p:bg><p:spTree>${GRP}</p:spTree></p:cSld>` +
        '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
        `<p:sldLayoutIdLst>${layoutIds}</p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2400"/></a:lvl1pPr></p:bodyStyle>` +
        '<p:otherStyle><a:lvl1pPr><a:buNone/><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>',
    )
    files.set(master.relsPath, master.relsXml())
    files.set('ppt/theme/theme1.xml', THEME)
    files.set(
      'ppt/presentation.xml',
      `${XML_HEAD}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
        `${sldIds ? `<p:sldIdLst>${sldIds}</p:sldIdLst>` : ''}<p:sldSz cx="${emu(W)}" cy="${emu(H)}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    )
    files.set(presRels.relsPath, presRels.relsXml())
    files.set(
      '_rels/.rels',
      `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    )
    for (const [name, bytes] of await this.media.bytes()) files.set(name, bytes)
    files.set(
      '[Content_Types].xml',
      `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${mediaTypes(this.media.files.keys())}${overrides}</Types>`,
    )
    return writeZip(files, `${PML}.presentation`)
  }
}

/** Converts an opened Keynote package to a PPTX file. */
export function keynoteToPptx(pkg: IworkPackage): Promise<Blob> {
  return new KeynoteConverter(pkg).convert()
}
