/**
 * OfficeArt shapes of a PowerPoint drawing → PresentationML shapes: groups (their child coordinate space kept),
 * preset and freeform geometry, fills (solid, gradient, picture), lines, pictures, placeholders, text bodies,
 * click actions. Positions are master units (576 per inch) or a group's child units, scaled to EMU alike.
 */
import type { Part } from '../../iwork/ooxml'
import { escAttr, escText } from '../../raw'
import type { PptDocument, SlideRef } from './document'
import { adjustments, arcPath, colorRef, freeformPath, isLineType, P, presetOf, Props, readFopt, type BlipStore, type ColorCtx } from './escher'
import { emu, paragraphsXml, type TextEnv } from './paragraphs'
import { Rec, RT } from './records'
import { ppt9, readStyle9, readText, type TextBlock } from './text'

const MAX_DEPTH = 32

export interface ShapeInfo {
  sp: Rec
  spid: number
  /** shape type (MSOSPT) */
  spt: number
  /** FSP flags: 1 group, 2 child, 4 patriarch, 8 deleted, 0x10 OLE, 0x40 flipH, 0x80 flipV, 0x400 background */
  flags: number
  props: Props
  /** left, top, right, bottom (child anchor in groups, else the client anchor) */
  anchor?: [number, number, number, number]
  clientData?: Rec
  textbox?: Rec
  /** OEPlaceholderAtom: placement id and placeholder type */
  ph?: { pos: number; type: number }
}

/** reads a shape container (the master shapes table resolves hspMaster: properties it does not set) */
export function shapeInfo(sp: Rec, masters?: Map<number, Props>, child = false): ShapeInfo {
  const fsp = sp.kid(RT.FSP)
  const own = new Map<number, { value: number; complex?: Uint8Array }>()
  for (const r of sp.kids()) if (r.type === RT.FOPT || r.type === RT.SecondaryFOPT || r.type === RT.TertiaryFOPT) readFopt(r, own)
  const hsp = own.get(P.hspMaster)?.value
  const props = new Props(own, hsp !== undefined ? masters?.get(hsp) : undefined)
  const ca = sp.kid(RT.ChildAnchor)
  const cl = sp.kid(RT.ClientAnchor)
  let anchor: ShapeInfo['anchor']
  if (ca && (child || !cl)) anchor = [ca.i32(0), ca.i32(4), ca.i32(8), ca.i32(12)]
  else if (cl) anchor = cl.len >= 16 ? [cl.i32(4), cl.i32(0), cl.i32(8), cl.i32(12)] : [cl.i16(2), cl.i16(0), cl.i16(4), cl.i16(6)]
  else if (ca) anchor = [ca.i32(0), ca.i32(4), ca.i32(8), ca.i32(12)]
  const clientData = sp.kid(RT.ClientData)
  const pa = clientData?.kid(RT.OEPlaceholderAtom)
  return {
    sp,
    spid: fsp?.u32(0) ?? 0,
    spt: fsp?.inst ?? 0,
    flags: fsp?.u32(4) ?? 0,
    props,
    anchor,
    clientData,
    textbox: sp.kid(RT.ClientTextbox),
    ph: pa ? { pos: pa.i32(0), type: pa.u8(4) } : undefined,
  }
}

/** every shape container of a drawing (groups included), depth-first */
export function allShapes(dg: Rec | undefined, out: Rec[] = [], depth = 0): Rec[] {
  if (!dg || depth > MAX_DEPTH) return out
  for (const k of dg.kids()) {
    if (k.type === RT.SpContainer) out.push(k)
    else if (k.type === RT.SpgrContainer || k.type === RT.DgContainer) allShapes(k, out, depth + 1)
  }
  return out
}

/** the OfficeArtDgContainer of a slide, master or notes container */
export const drawingOf = (rec: Rec | undefined) => rec?.kid(RT.PPDrawing)?.kid(RT.DgContainer)

/** PresentationML placeholder of an OEPlaceholderAtom type: [type (none = object), idx from the placement id] */
const PH: Record<number, [string | undefined, 'pos' | number | undefined]> = {
  1: ['title', undefined], 2: ['body', 1], 3: ['ctrTitle', undefined], 4: ['subTitle', 1], 5: ['sldImg', undefined], 6: ['body', 1],
  7: ['dt', 10], 8: ['sldNum', 12], 9: ['ftr', 11], 10: ['hdr', 13], 11: ['sldImg', undefined], 12: ['body', 1],
  13: ['title', undefined], 14: ['body', 'pos'], 15: ['ctrTitle', undefined], 16: ['subTitle', 'pos'], 17: ['title', undefined],
  18: ['body', 'pos'], 19: [undefined, 'pos'], 20: ['chart', 'pos'], 21: ['tbl', 'pos'], 22: ['clipArt', 'pos'], 23: ['dgm', 'pos'],
  24: ['media', 'pos'], 25: [undefined, 'pos'], 26: ['pic', 'pos'],
}

/** the p:ph element of a placeholder (undefined: not one) */
export function phXml(ph: ShapeInfo['ph']): string | undefined {
  const m = ph && PH[ph.type]
  if (!m) return undefined
  const idx = m[1] === 'pos' ? Math.max(1, ph!.pos) : m[1]
  const vert = ph!.type === 17 || ph!.type === 18 || ph!.type === 25 ? ' orient="vert"' : ''
  return `<p:ph${m[0] ? ` type="${m[0]}"` : ''}${vert}${idx !== undefined ? ` idx="${idx}"` : ''}/>`
}


export interface DrawCtx {
  doc: PptDocument
  blips: BlipStore
  /** media file name of a picture (undefined: none a viewer can hold) */
  media: (pib: number) => Promise<string | undefined>
  /** media file name of a pattern bitmap in two colors */
  pattern: (pib: number, fore: string, back: string) => Promise<string | undefined>
  part: Part
  env: TextEnv
  /** the slide's text list (OutlineTextRefAtom indexes into it) */
  slide?: SlideRef
  masters: Map<number, Props>
  /** cNvPr ids */
  ids: { n: number }
  /** shapes left out (placeholders of a master shown elsewhere…) */
  skip?: (s: ShapeInfo) => boolean
  /** a replacement text for a shape (footer values) */
  textFor?: (s: ShapeInfo, block: TextBlock | undefined) => TextBlock | undefined
}

interface Box {
  x: number
  y: number
  w: number
  h: number
  rot: number
  flipH: boolean
  flipV: boolean
}

/** the shape's frame (rotated by 45-135 or 225-315 degrees the anchor holds the turned box: width and height swap) */
function frameOf(s: ShapeInfo): Box | undefined {
  if (!s.anchor) return undefined
  const [l, t, r, b] = s.anchor
  let w = Math.max(0, r - l)
  let h = Math.max(0, b - t)
  let x = l
  let y = t
  let rot = s.props.fixed(P.rotation, 0) % 360
  if (rot < 0) rot += 360
  if (!Number.isFinite(rot)) rot = 0
  const quadrant = Math.floor((rot + 45) / 90) % 4
  if (quadrant === 1 || quadrant === 3) {
    const cx = x + w / 2
    const cy = y + h / 2
    ;[w, h] = [h, w]
    x = cx - w / 2
    y = cy - h / 2
  }
  return { x, y, w, h, rot, flipH: !!(s.flags & 0x40), flipV: !!(s.flags & 0x80) }
}

const C = 27273042316900
const coord = (v: number) => Math.max(-C, Math.min(C, emu(v)))
const ext = (v: number) => Math.max(0, Math.min(C, emu(v)))

function xfrmXml(b: Box, tag = 'a:xfrm', child?: [number, number, number, number]): string {
  const rot = Math.round(b.rot * 60000) % 21600000
  const attrs = (rot ? ` rot="${rot}"` : '') + (b.flipH ? ' flipH="1"' : '') + (b.flipV ? ' flipV="1"' : '')
  const ch = child ? `<a:chOff x="${coord(child[0])}" y="${coord(child[1])}"/><a:chExt cx="${ext(child[2])}" cy="${ext(child[3])}"/>` : ''
  return `<${tag}${attrs}><a:off x="${coord(b.x)}" y="${coord(b.y)}"/><a:ext cx="${ext(b.w)}" cy="${ext(b.h)}"/>${ch}</${tag}>`
}

const solid = (c: string, alpha?: number) => `<a:solidFill><a:srgbClr val="${c}"${alpha !== undefined && alpha < 1 ? `><a:alpha val="${Math.round(Math.max(0, alpha) * 100000)}"/></a:srgbClr>` : '/>'}</a:solidFill>`
const srgb = (c: string, alpha?: number) => `<a:srgbClr val="${c}"${alpha !== undefined && alpha < 1 ? `><a:alpha val="${Math.round(Math.max(0, alpha) * 100000)}"/></a:srgbClr>` : '/>'}`

const DASH = ['solid', 'sysDash', 'sysDot', 'sysDashDot', 'sysDashDotDot', 'dot', 'dash', 'lgDash', 'dashDot', 'lgDashDot', 'lgDashDotDot']
const CMPD = ['sng', 'dbl', 'thickThin', 'thinThick', 'tri']
const ARROW = ['none', 'triangle', 'stealth', 'diamond', 'oval', 'arrow', 'arrow', 'arrow']
const SIZE = ['sm', 'med', 'lg']
const ANCHOR = ['t', 'ctr', 'b', 't', 'ctr', 'b', 't', 'b', 't', 'b']
const FLOW: Record<number, string> = { 1: 'vert', 2: 'vert270', 3: 'vert', 5: 'eaVert' }

/** Writes the shapes of drawings into one part (a slide, layout, master or notes page). */
export class DrawingWriter {
  constructor(private c: DrawCtx) {}

  /** the color context of a shape (its own fill and line colors for colors defined relative to them) */
  private colors(p: Props): ColorCtx {
    const base: ColorCtx = { scheme: this.c.env.scheme }
    const fill = colorRef(p.get(P.fillColor) ?? 0xffffff, base)
    const line = colorRef(p.get(P.lineColor) ?? 0, base)
    return { ...base, fill, line, fillBack: colorRef(p.get(P.fillBackColor) ?? 0xffffff, { ...base, fill, line }), lineBack: colorRef(p.get(P.lineBackColor) ?? 0xffffff, base), shadow: '808080' }
  }

  /** DrawingML fill of a shape (undefined: not filled) */
  async fill(p: Props, picture = true): Promise<string | undefined> {
    if (!p.flag(P.fillBooleans, 4, true)) return undefined
    const ctx = this.colors(p)
    const color = ctx.fill ?? 'FFFFFF'
    const alpha = p.fixed(P.fillOpacity, 1)
    const type = p.num(P.fillType, 0)
    switch (type) {
      case 1: {
        // a pattern: its bitmap in the fill's colors, tiled
        const name = picture ? await this.c.pattern(p.num(P.fillBlip, 0), color, ctx.fillBack ?? 'FFFFFF') : undefined
        if (name) return `<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${this.c.part.rel('image', `../media/${name}`)}"/><a:srcRect/><a:tile tx="0" ty="0" sx="100000" sy="100000" flip="none" algn="tl"/></a:blipFill>`
        return solid(color, alpha)
      }
      case 2:
      case 3: {
        const name = picture ? await this.c.media(p.num(P.fillBlip, 0)) : undefined
        if (name) {
          const rid = this.c.part.rel('image', `../media/${name}`)
          return `<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${rid}"/><a:srcRect/>${type === 2 ? '<a:tile tx="0" ty="0" sx="100000" sy="100000" flip="none" algn="tl"/>' : '<a:stretch><a:fillRect/></a:stretch>'}</a:blipFill>`
        }
        return solid(color, alpha)
      }
      case 4:
      case 5:
      case 6:
      case 7:
      case 8:
        return this.gradient(p, ctx, type)
      case 9:
        return undefined
      default:
        return solid(color, alpha)
    }
  }

  /** shaded fills: a linear gradient along the fill angle, or from the center (the focus says where the fill color sits) */
  private gradient(p: Props, ctx: ColorCtx, type: number): string {
    const a = ctx.fill ?? 'FFFFFF'
    const b = ctx.fillBack ?? 'FFFFFF'
    const alphaA = p.fixed(P.fillOpacity, 1)
    const alphaB = p.fixed(P.fillBackOpacity, 1)
    let focus = p.int(P.fillFocus, 0)
    let [fill, back, fa, ba] = [a, b, alphaA, alphaB]
    if (focus < 0) {
      focus = -focus
      ;[fill, back, fa, ba] = [back, fill, ba, fa]
    }
    const gs = (pos: number, c: string, al: number) => `<a:gs pos="${pos}">${srgb(c, al)}</a:gs>`
    // preset shade colors (positions along the gradient)
    const shades = (p.complex(P.fillShadeColors) && shadeStops(p.complex(P.fillShadeColors)!, ctx)) || undefined
    if (type === 5 || type === 6) {
      const stops = focus >= 50 ? gs(0, fill, fa) + gs(100000, back, ba) : gs(0, back, ba) + gs(100000, fill, fa)
      return `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst><a:path path="${type === 6 ? 'shape' : 'rect'}"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>`
    }
    let angle = p.fixed(P.fillAngle, 0)
    if (angle < 0) angle += 180
    const ang = Math.round((((270 + angle) % 360) + 360) % 360) * 60000
    let stops: string
    if (shades && shades.length > 1) stops = shades.map(([pos, c]) => gs(Math.round(pos * 100000), c, 1)).join('')
    else if (focus > 40 && focus < 60) stops = gs(0, back, ba) + gs(50000, fill, fa) + gs(100000, back, ba)
    else if (focus >= 50) stops = gs(0, back, ba) + gs(100000, fill, fa)
    else stops = gs(0, fill, fa) + gs(100000, back, ba)
    return `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst><a:lin ang="${ang}" scaled="1"/></a:gradFill>`
  }

  /** DrawingML line (undefined: no line); `explicitOnly`: only a line turned on explicitly (pictures) */
  line(p: Props, explicitOnly = false): string | undefined {
    const on = explicitOnly ? lineExplicit(p) : p.flag(P.lineBooleans, 3, true)
    if (!on) return undefined
    const ctx = this.colors(p)
    const color = ctx.line ?? '000000'
    const w = Math.max(0, Math.min(20116800, p.num(P.lineWidth, 9525)))
    const style = p.num(P.lineStyle, 0)
    const dash = DASH[p.num(P.lineDashing, 0)] ?? 'solid'
    const end = (tag: string, type: number, wp: number, lp: number) => {
      const t = ARROW[p.num(type, 0)] ?? 'none'
      if (t === 'none') return ''
      return `<a:${tag} type="${t}" w="${SIZE[p.num(wp, 1)] ?? 'med'}" len="${SIZE[p.num(lp, 1)] ?? 'med'}"/>`
    }
    return (
      `<a:ln w="${w}"${style ? ` cmpd="${CMPD[style] ?? 'sng'}"` : ''}>${solid(color, p.fixed(P.lineOpacity, 1))}<a:prstDash val="${dash}"/><a:round/>` +
      end('headEnd', P.lineStartArrowhead, P.lineStartArrowWidth, P.lineStartArrowLength) +
      end('tailEnd', P.lineEndArrowhead, P.lineEndArrowWidth, P.lineEndArrowLength) +
      '</a:ln>'
    )
  }

  /** an outer shadow (effectLst) when the shape has one */
  private shadow(p: Props): string {
    if (!p.flag(0x023f, 1, false)) return ''
    const ctx = this.colors(p)
    const color = colorRef(p.get(0x0201) ?? 0x808080, ctx) ?? '808080'
    const dx = p.int(0x0205, 25400)
    const dy = p.int(0x0206, 25400)
    const dist = Math.round(Math.min(2147483647, Math.hypot(dx, dy)))
    const dir = Math.round(((((Math.atan2(dy, dx) * 180) / Math.PI) % 360) + 360) % 360) * 60000
    return `<a:effectLst><a:outerShdw dist="${dist}" dir="${dir % 21600000}" algn="ctr" rotWithShape="0">${srgb(color, p.fixed(0x0204, 1))}</a:outerShdw></a:effectLst>`
  }

  /** the shapes of a drawing (its group tree) */
  async drawing(dg: Rec | undefined): Promise<string> {
    const top = dg?.kid(RT.SpgrContainer)
    return top ? this.children(top, false, 0) : ''
  }

  /** the background shape's fill of a drawing */
  async background(dg: Rec | undefined): Promise<string | undefined> {
    const bg = dg?.kids().find((k) => k.type === RT.SpContainer)
    if (!bg) return undefined
    const s = shapeInfo(bg, this.c.masters)
    return this.fill(s.props)
  }

  private async children(grp: Rec, inGroup: boolean, depth: number): Promise<string> {
    if (depth > MAX_DEPTH) return ''
    let out = ''
    const kids = grp.kids()
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i]
      // the first shape of a group container describes the group itself
      if (i === 0 && k.type === RT.SpContainer) continue
      try {
        if (k.type === RT.SpgrContainer) out += await this.group(k, inGroup, depth + 1)
        else if (k.type === RT.SpContainer) out += await this.shape(shapeInfo(k, this.c.masters, inGroup))
      } catch {
        // a malformed shape must not break the slide
      }
    }
    return out
  }

  private nv(tag: string, s: ShapeInfo | undefined, name: string, extra: string, nvPr = '<p:nvPr/>'): string {
    const id = ++this.c.ids.n
    const own = s?.props.str(P.shapeName)
    const descr = s?.props.str(P.description)
    const click = s ? this.click(s) : ''
    const nm = escAttr(own || `${name} ${id}`)
    const cNvPr = `<p:cNvPr id="${id}" name="${nm}"${descr ? ` descr="${escAttr(descr)}"` : ''}${click ? `>${click}</p:cNvPr>` : '/>'}`
    return `<p:nv${tag}Pr>${cNvPr}${extra}${nvPr}</p:nv${tag}Pr>`
  }

  /** a shape's click action (hlinkClick) */
  private click(s: ShapeInfo): string {
    const info = s.clientData?.kid(RT.InteractiveInfo, 0)
    return info ? this.c.env.link(info) : ''
  }

  private async group(grp: Rec, inGroup: boolean, depth: number): Promise<string> {
    const first = grp.kids()[0]
    if (!first || first.type !== RT.SpContainer) return this.children(grp, inGroup, depth)
    const s = shapeInfo(first, this.c.masters, inGroup)
    if (this.hidden(s) || (this.c.skip && this.c.skip(s))) return ''
    const f = frameOf(s)
    const kids = await this.children(grp, true, depth)
    if (!kids) return ''
    const spgr = first.kid(RT.FSPGR)
    if (!f) return kids
    let child: [number, number, number, number] = [f.x, f.y, f.w, f.h]
    if (spgr) {
      const [l, t, r, b] = [spgr.i32(0), spgr.i32(4), spgr.i32(8), spgr.i32(12)]
      if (r > l && b > t) child = [l, t, r - l, b - t]
    }
    return `<p:grpSp>${this.nv('GrpSp', s, 'Group', '<p:cNvGrpSpPr/>')}<p:grpSpPr>${xfrmXml(f, 'a:xfrm', child)}</p:grpSpPr>${kids}</p:grpSp>`
  }

  private hidden(s: ShapeInfo): boolean {
    return !!(s.flags & 0x8) || s.props.flag(P.groupBooleans, 1, false)
  }

  /** the text of a shape: its own text records, or its slide's placeholder text */
  textOf(s: ShapeInfo): TextBlock | undefined {
    const tb = s.textbox
    let block: TextBlock | undefined
    if (tb) {
      const ref = tb.kid(RT.OutlineTextRefAtom)
      const group = ref ? this.c.slide?.texts[ref.u32(0)] : undefined
      block = readText(group ?? [], tb.kids())
      if (block) {
        const own = ppt9(s.clientData).find((r) => r.type === 0x0fac)
        const outline = ref && !own ? this.c.doc.outline9.get(this.c.slide?.slideId ?? -1)?.find((o) => o.type === block!.type)?.style : undefined
        const style = own ?? outline
        if (style) block.pf9 = readStyle9(style)
      }
    }
    return this.c.textFor ? this.c.textFor(s, block) : block
  }

  async shape(s: ShapeInfo): Promise<string> {
    if (this.hidden(s) || (this.c.skip && this.c.skip(s))) return ''
    const f = frameOf(s)
    if (!f) return ''
    const p = s.props
    const ph = phXml(s.ph)
    const pib = p.get(P.pib)
    if (pib) {
      const pic = await this.picture(s, f, pib)
      if (pic) return pic
    }
    // a picture frame or object whose picture is missing (or one no viewer shows) is left out
    if ((s.spt === 75 || s.flags & 0x10) && !s.textbox) return ''
    const block = this.textOf(s)
    const wordArt = s.spt >= 136 && s.spt <= 175 ? p.str(P.gtextUNICODE) : undefined
    const body = block && block.text.length ? paragraphsXml(block, this.c.env) : wordArt ? this.wordArt(s, wordArt, f) : ''
    const hasText = /<a:(r|fld)[ >]/.test(body)

    // geometry
    let geom: string
    const free = s.spt === 0 ? freeformPath(p) : undefined
    const fill = s.spt >= 136 && s.spt <= 175 && wordArt && !(block && block.text.length) ? undefined : await this.fill(p)
    if (s.spt === 19) geom = arcPath(p, !!fill)
    else if (free) {
      geom = `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path w="${free.w}" h="${free.h}">${free.d}</a:path></a:pathLst></a:custGeom>`
    } else {
      const prst = presetOf(s.spt)
      geom = `<a:prstGeom prst="${prst}"><a:avLst>${adjustments(s.spt, p, f.w, f.h)}</a:avLst></a:prstGeom>`
    }
    // WordArt: the fill and line color the letters, not the frame
    const glyphs = !!wordArt && !(block && block.text.length)
    const ln = glyphs ? undefined : this.line(p)
    const line = isLineType(s.spt) && !hasText
    if (line) {
      if (!ln) return ''
      return `<p:cxnSp>${this.nv('CxnSp', s, 'Connector', '<p:cNvCxnSpPr/>')}<p:spPr>${xfrmXml(f)}${geom}${ln}${this.shadow(p)}</p:spPr></p:cxnSp>`
    }
    if (!ph && !hasText && !fill && !ln) return ''
    const txBody = hasText || ph ? `<p:txBody>${this.bodyPr(p, block === undefined && !!wordArt)}<a:lstStyle/>${body || '<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>'}</p:txBody>` : ''
    const nvPr = ph ? `<p:nvPr>${ph}</p:nvPr>` : '<p:nvPr/>'
    const locks = ph ? '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' : `<p:cNvSpPr${hasText && !fill && !ln ? ' txBox="1"' : ''}/>`
    const kind = ph ? 'Placeholder' : hasText ? 'TextBox' : 'Shape'
    return (
      `<p:sp>${this.nv('Sp', s, kind, locks, nvPr)}<p:spPr>${xfrmXml(f)}${geom}${fill ?? '<a:noFill/>'}${ln ?? '<a:ln><a:noFill/></a:ln>'}${this.shadow(p)}</p:spPr>` +
      `${txBody}</p:sp>`
    )
  }

  /** a text body's bodyPr from the shape's text properties */
  private bodyPr(p: Props, wordArt = false): string {
    const ins = (pid: number, def: number) => Math.max(0, Math.min(51206400, p.int(pid, def)))
    const anchor = p.num(P.anchorText, 0)
    let a = ` wrap="${p.num(P.wrapText, 0) === 2 ? 'none' : 'square'}" lIns="${ins(P.dxTextLeft, 91440)}" tIns="${ins(P.dyTextTop, 45720)}" rIns="${ins(P.dxTextRight, 91440)}" bIns="${ins(P.dyTextBottom, 45720)}"`
    a += ` anchor="${wordArt ? 'ctr' : (ANCHOR[anchor] ?? 't')}"`
    if (anchor >= 3 && anchor <= 5) a += ' anchorCtr="1"'
    const vert = FLOW[p.num(P.txflTextFlow, 0)]
    if (vert) a += ` vert="${vert}"`
    const fit = p.flag(P.textBooleans, 1, false)
    return `<a:bodyPr${a} rtlCol="0">${fit ? '<a:spAutoFit/>' : '<a:noAutofit/>'}</a:bodyPr>`
  }

  /** WordArt: its text in its font, colored like the shape's fill, sized to the frame */
  private wordArt(s: ShapeInfo, text: string, f: Box): string {
    const p = s.props
    const font = p.str(P.gtextFont)
    const color = this.colors(p).fill ?? '000000'
    const lines = text.replace(/[\r\n]+$/, '').split(/\r\n|\r|\n|\u000b/)
    const size = Math.max(1, Math.min(4000, Math.round((f.h / 8 / Math.max(1, lines.length)) * 0.8)))
    const latin = font ? `<a:latin typeface="${escAttr(font)}"/>` : ''
    const bold = p.flag(0x00ff, 5, false) ? ' b="1"' : ''
    const italic = p.flag(0x00ff, 4, false) ? ' i="1"' : ''
    return lines
      .map((l) => `<a:p><a:pPr algn="ctr"><a:buNone/></a:pPr>${l ? `<a:r><a:rPr lang="en-US" sz="${size * 100}"${bold}${italic} dirty="0">${solid(color)}${latin}</a:rPr><a:t>${escText(l)}</a:t></a:r>` : ''}<a:endParaRPr lang="en-US" sz="${size * 100}" dirty="0"/></a:p>`)
      .join('')
  }

  /** a picture (also an OLE object's preview); undefined when its image is missing or not one Office or a browser shows */
  private async picture(s: ShapeInfo, f: Box, pib: number): Promise<string | undefined> {
    const name = await this.c.media(pib)
    if (!name) return undefined
    const p = s.props
    const rid = this.c.part.rel('image', `../media/${name}`)
    const crop = (pid: number) => Math.round(Math.max(-1, Math.min(1, p.fixed(pid, 0))) * 100000)
    const [t, b, l, r] = [crop(P.cropFromTop), crop(P.cropFromBottom), crop(P.cropFromLeft), crop(P.cropFromRight)]
    const src = t || b || l || r ? `<a:srcRect l="${l}" t="${t}" r="${r}" b="${b}"/>` : ''
    const ln = this.line(p, true)
    const ph = phXml(s.ph)
    return (
      `<p:pic>${this.nv('Pic', s, s.flags & 0x10 ? 'Object' : 'Picture', '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>', ph ? `<p:nvPr>${ph}</p:nvPr>` : '<p:nvPr/>')}` +
      `<p:blipFill><a:blip r:embed="${rid}"/>${src}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
      `<p:spPr>${xfrmXml(f)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${ln ?? '<a:ln><a:noFill/></a:ln>'}${this.shadow(p)}</p:spPr></p:pic>`
    )
  }
}

/** a picture's line only when it is turned on explicitly */
function lineExplicit(p: Props): boolean {
  return p.flag(P.lineBooleans, 3, false) && (p.has(P.lineBooleans) || p.has(P.lineColor))
}

/** fillShadeColors: [position 0-1, color] pairs */
function shadeStops(b: Uint8Array, ctx: ColorCtx): [number, string][] | undefined {
  if (b.length < 6) return undefined
  const n = b[0] | (b[1] << 8)
  const size = b[4] | (b[5] << 8)
  if (size !== 8) return undefined
  const out: [number, string][] = []
  for (let i = 0; i < n && 6 + (i + 1) * 8 <= b.length; i++) {
    const k = 6 + i * 8
    const v = (b[k] | (b[k + 1] << 8) | (b[k + 2] << 16) | (b[k + 3] << 24)) >>> 0
    const pos = (b[k + 4] | (b[k + 5] << 8) | (b[k + 6] << 16) | (b[k + 7] << 24)) / 65536
    const c = colorRef(v, ctx)
    if (c) out.push([Math.max(0, Math.min(1, pos)), c])
  }
  return out.length ? out : undefined
}
