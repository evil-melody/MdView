/** Pictures and shapes of a Word binary document → DrawingML (inline pictures, anchored pictures, text boxes, shapes). */
import { escAttr, escText } from '../../raw'
import { placeable, readPicf, type Blip, type Shape } from './art'
import type { Chp } from './props'
import { clean } from './wml'
import type { StoryKind, Writer } from './writer'

const EMU = 635

/** OfficeArt shape types → DrawingML preset geometries */
const GEOMETRY: Record<number, string> = {
  1: 'rect', 2: 'roundRect', 3: 'ellipse', 4: 'diamond', 5: 'triangle', 6: 'rtTriangle', 7: 'parallelogram', 8: 'trapezoid', 9: 'hexagon',
  10: 'octagon', 11: 'plus', 12: 'star5', 13: 'rightArrow', 15: 'homePlate', 16: 'cube', 21: 'plaque', 22: 'can', 23: 'donut',
  55: 'chevron', 56: 'pentagon', 61: 'wedgeRectCallout', 62: 'wedgeRoundRectCallout', 63: 'wedgeEllipseCallout', 64: 'wave',
  65: 'foldedCorner', 66: 'leftArrow', 67: 'downArrow', 68: 'upArrow', 69: 'leftRightArrow', 70: 'upDownArrow', 73: 'lightningBolt',
  74: 'heart', 92: 'star24', 96: 'smileyFace', 109: 'flowChartProcess', 110: 'flowChartDecision', 111: 'flowChartInputOutput',
  114: 'flowChartDocument', 116: 'flowChartTerminator', 120: 'flowChartConnector', 183: 'sun', 184: 'moon', 202: 'rect',
}

export interface MediaFile {
  name: string
  blip: Blip
}

/** Writes the pictures and shapes of the stories a Writer writes; collects the media files. */
export class Pictures {
  readonly media: MediaFile[] = []
  private mediaByData = new WeakMap<Uint8Array, string>()
  private docPr = 0

  constructor(private w: Writer) {}

  private mediaName(blip: Blip): string {
    let name = this.mediaByData.get(blip.data)
    if (!name) {
      name = `image${this.media.length + 1}.${blip.ext === 'jpeg' ? 'jpeg' : blip.ext}`
      this.media.push({ name, blip })
      this.mediaByData.set(blip.data, name)
    }
    return name
  }

  /** the a:graphic of a picture */
  private picGraphic(blip: Blip, cx: number, cy: number, n: number, crop?: { l: number; t: number; r: number; b: number }): string {
    const rid = this.w.part.rel('image', 'media/' + this.mediaName(blip))
    const pct = (v: number) => Math.round(v * 100000)
    const src = crop ? `<a:srcRect l="${pct(crop.l)}" t="${pct(crop.t)}" r="${pct(crop.r)}" b="${pct(crop.b)}"/>` : ''
    return (
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
      `<pic:nvPicPr><pic:cNvPr id="${n < 0 ? '%ID%' : n}" name="Picture"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}"/>${src}<a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      '</pic:pic></a:graphicData></a:graphic>'
    )
  }

  private inline(graphic: string, cx: number, cy: number, n: number, name: string, rPr: string): string {
    return (
      `<w:r>${rPr}<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
      `<wp:docPr id="${n}" name="${name} ${n}"/><wp:cNvGraphicFramePr/>${graphic}</wp:inline></w:drawing></w:r>`
    )
  }

  /** an inline picture (0x01 with sprmCPicLocation): from the Data stream, or an OLE object's preview */
  inlinePicture(chp: Chp, rPr: string): string {
    let pic = undefined as ReturnType<typeof readPicf>
    if (chp.ole2) pic = this.olePicture(chp.pic)
    if (!pic && this.w.m.data) pic = readPicf(this.w.m.data, chp.pic)
    if (pic && !pic.blip && pic.pib) pic.blip = this.w.m.drawings?.blip(pic.pib)
    if (!pic?.blip || pic.w < 1 || pic.h < 1) return ''
    const cx = Math.round(pic.w * EMU)
    const cy = Math.round(pic.h * EMU)
    const n = ++this.docPr
    return this.inline(this.picGraphic(pic.blip, cx, cy, n, pic.crop), cx, cy, n, 'Picture', rPr)
  }

  /** the picture an embedded object shows: its size (\x03PIC) and metafile (\x03META) in the ObjectPool */
  private olePicture(id: number): ReturnType<typeof readPicf> {
    const dir = `ObjectPool/_${id}`
    const cfb = this.w.m.cfb
    if (!cfb.has(dir)) return undefined
    const pic = cfb.stream(dir + '/\u0003PIC')
    const meta = cfb.stream(dir + '/\u0003META')
    if (!pic || !meta || meta.length < 18) return undefined
    const b = new DataView(pic.buffer, pic.byteOffset, pic.byteLength)
    if (pic.length < 36) return undefined
    const mx = b.getUint16(32, true) || 1000
    const my = b.getUint16(34, true) || 1000
    const w = (b.getInt16(28, true) * mx) / 1000
    const h = (b.getInt16(30, true) * my) / 1000
    if (w <= 0 || h <= 0) return undefined
    return { w, h, blip: { ext: 'wmf', data: placeable(meta, w, h) } }
  }

  /** a floating shape (0x08): pictures, text boxes and filled shapes (each shape of a group), anchored where the original is */
  floating(cp: number, kind: StoryKind, rPr: string): string {
    const m = this.w.m
    const fspa = kind === 'main' ? m.spa.get(cp) : kind === 'hdr' ? m.spaHdr.get(cp) : undefined
    const dr = m.drawings
    if (!fspa || !dr) return ''
    const shape = dr.shape0(fspa.spid)
    if (!shape || shape.hidden) return ''
    // a WordArt watermark behind the page's text
    if (shape.text !== undefined && kind === 'hdr' && fspa.below) return ''
    // the shapes of a group, placed in the group's area
    const leaves: { s: Shape; l: number; t: number; r: number; b: number }[] = []
    const collect = (s: Shape, l: number, t: number, r: number, b: number, depth: number) => {
      if (!s.kids?.length || depth > 8) {
        leaves.push({ s, l, t, r, b })
        return
      }
      const g = s.group ?? { l: 0, t: 0, r: 1, b: 1 }
      const sx = (r - l) / (g.r - g.l || 1)
      const sy = (b - t) / (g.b - g.t || 1)
      for (const k of s.kids) {
        if (k.hidden) continue
        const c = k.child ?? g
        collect(k, l + (c.l - g.l) * sx, t + (c.t - g.t) * sy, l + (c.r - g.l) * sx, t + (c.b - g.t) * sy, depth + 1)
      }
    }
    collect(shape, fspa.l, fspa.t, fspa.r, fspa.b, 0)
    const relH = ['margin', 'page', 'column'][fspa.bx] ?? 'column'
    const relV = ['margin', 'page', 'paragraph'][fspa.by] ?? 'paragraph'
    const side = ['bothSides', 'left', 'right', 'largest'][fspa.wrk] ?? 'bothSides'
    const wrap = fspa.wr === 1 ? '<wp:wrapTopAndBottom/>' : fspa.wr === 3 ? '<wp:wrapNone/>' : `<wp:wrapSquare wrapText="${side}"/>`
    let out = ''
    for (const leaf of leaves) {
      // decoration behind the text (not pictures, not text)
      if (fspa.below && !leaf.s.pib && leaf.s.txid === undefined) continue
      const cx = Math.max(1, Math.round((leaf.r - leaf.l) * EMU))
      const cy = Math.max(1, Math.round((leaf.b - leaf.t) * EMU))
      const content = this.shapeGraphic(leaf.s, cx, cy, kind)
      if (!content) continue
      const n = ++this.docPr
      out +=
        `<w:r>${rPr}<w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="${n}" behindDoc="${fspa.below && fspa.wr === 3 ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1">` +
        `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="${relH}"><wp:posOffset>${Math.round(leaf.l * EMU)}</wp:posOffset></wp:positionH>` +
        `<wp:positionV relativeFrom="${relV}"><wp:posOffset>${Math.round(leaf.t * EMU)}</wp:posOffset></wp:positionV>` +
        `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>${wrap}` +
        `<wp:docPr id="${n}" name="${content.name} ${n}"/><wp:cNvGraphicFramePr/>${content.xml.replace('%ID%', String(n))}</wp:anchor></w:drawing></w:r>`
    }
    return out
  }

  /** the graphic of a shape: a picture, WordArt text, or a box (with the text of its text box) */
  private shapeGraphic(s: Shape, cx: number, cy: number, kind: StoryKind): { xml: string; name: string } | undefined {
    if (s.pib) {
      const blip = this.w.m.drawings!.blip(s.pib)
      if (blip) return { xml: this.picGraphic(blip, cx, cy, -1), name: 'Picture' }
    }
    if (s.text !== undefined) {
      // WordArt: its text in a box without fill or line
      const font = s.font ? `<w:rFonts w:ascii="${escAttr(s.font)}" w:hAnsi="${escAttr(s.font)}"/>` : ''
      const color = s.fill ? `<w:color w:val="${s.fill}"/>` : ''
      const lines = clean(s.text).split(/\r\n|\r|\n/)
      const body = lines.map((l) => `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr>${font}${color}<w:sz w:val="36"/></w:rPr><w:t xml:space="preserve">${escText(l)}</w:t></w:r></w:p>`).join('')
      return { name: 'WordArt', xml: this.boxGraphic(body, cx, cy, undefined, undefined, 0, 1) }
    }
    if (s.txid !== undefined || s.fill || s.line) {
      if (s.type === 20 || s.type === 32) return undefined
      const story = s.txid !== undefined ? this.txbxStory(s, kind) : undefined
      const body = story ? this.w.story(story[0], story[1], 'txbx') : ''
      if (!body && !s.fill && !s.line) return undefined
      // a shape without text still gets an (empty) text box: views show its box
      return { name: body ? 'Text Box' : 'Shape', xml: this.boxGraphic(body || '<w:p/>', cx, cy, s.fill, s.line, s.lineW ?? 9525, s.type) }
    }
    return undefined
  }

  /** a shape (wps:wsp) of a preset geometry, holding `body` as its text box */
  private boxGraphic(body: string, cx: number, cy: number, fill: string | undefined, line: string | undefined, lineW: number, type: number): string {
    const ln = line ? `<a:ln w="${lineW}"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>'
    const fl = fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>'
    const geom = GEOMETRY[type] ?? 'rect'
    return (
      `<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr${body ? ' txBox="1"' : ''}/>` +
      `<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom>${fl}${ln}</wps:spPr>` +
      (body ? `<wps:txbx><w:txbxContent>${body}</w:txbxContent></wps:txbx>` : '') +
      '<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="t"><a:noAutofit/></wps:bodyPr>' +
      '</wps:wsp></a:graphicData></a:graphic>'
    )
  }

  private txbxStory(s: Shape, kind: StoryKind): [number, number] | undefined {
    const m = this.w.m
    const byId = kind === 'hdr' ? m.hdrTxbx : m.txbx
    const list = kind === 'hdr' ? m.hdrTxbxList : m.txbxList
    const hit = byId.get(s.spid)
    if (hit) return hit
    if (s.txid === undefined) return undefined
    return list[(s.txid >>> 16) - 1]
  }
}
