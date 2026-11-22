/**
 * OpenDocument drawing objects in text → DrawingML in WordprocessingML: pictures (draw:frame / draw:image, also the
 * replacement images of embedded objects), text frames (draw:text-box) and simple shapes with text, inline (anchored
 * as a character) or floating (anchored to a paragraph, character or the page).
 */
import { escAttr } from '../../raw'
import type { Part } from '../../iwork/ooxml'
import { child, children, isEl, type ONode, textContent, toHex, toPt } from './common'
import { border, borders, emu } from './odt-props'

// ---------------------------------------------------------------- media

const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  tiff: 'image/tiff',
  wmf: 'image/x-wmf',
  emf: 'image/x-emf',
}

/** the image format of some bytes (undefined: not one Word or a browser shows, e.g. StarView metafiles) */
export function sniffImage(b: Uint8Array): string | undefined {
  if (b.length < 8) return undefined
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif'
  if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a)) return 'tiff'
  if (b[0] === 0xd7 && b[1] === 0xcd && b[2] === 0xc6 && b[3] === 0x9a) return 'wmf'
  if ((b[0] === 1 || b[0] === 2) && b[1] === 0 && b[2] === 9 && b[3] === 0) return 'wmf'
  if (b[0] === 1 && b[1] === 0 && b[2] === 0 && b[3] === 0 && b[40] === 0x20 && b[41] === 0x45 && b[42] === 0x4d && b[43] === 0x46) return 'emf'
  const head = new TextDecoder().decode(b.subarray(0, 1024)).replace(/^﻿/, '').trimStart()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg')) || (head.startsWith('<!') && head.includes('<svg'))) return 'svg'
  return undefined
}

const RASTER = new Set(['png', 'jpeg', 'gif', 'bmp', 'webp'])

/** pixel size of PNG, JPEG and GIF images (for frames without a size) */
function pixelSize(b: Uint8Array, ext: string): { w: number; h: number } | undefined {
  const u16 = (o: number) => (b[o] << 8) | b[o + 1]
  if (ext === 'png' && b.length > 24) return { w: (u16(16) << 16) | u16(18), h: (u16(20) << 16) | u16(22) }
  if (ext === 'gif' && b.length > 10) return { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) }
  if (ext === 'jpeg') {
    for (let o = 2, n = 0; o + 9 < b.length && n < 1000; n++) {
      if (b[o] !== 0xff) return undefined
      const m = b[o + 1]
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: u16(o + 7), h: u16(o + 5) }
      o += 2 + u16(o + 2)
    }
  }
  return undefined
}

/** Images put into word/media: one file per source image. */
export class OdtMedia {
  /** package path → bytes */
  readonly files = new Map<string, Uint8Array>()
  private names = new Map<Uint8Array, string>()

  /** name (in word/media) of an image, undefined for formats nobody shows */
  add(bytes: Uint8Array): { name: string; ext: string } | undefined {
    const ext = sniffImage(bytes)
    if (!ext) return undefined
    let name = this.names.get(bytes)
    if (!name) {
      name = `image${this.names.size + 1}.${ext === 'jpeg' ? 'jpeg' : ext}`
      this.names.set(bytes, name)
      this.files.set(`word/media/${name}`, bytes)
    }
    return { name, ext }
  }

  /** `<Default>` content types of the media files */
  types(): string {
    const exts = new Set([...this.files.keys()].map((n) => n.split('.').pop()!))
    return [...exts].map((e) => `<Default Extension="${e}" ContentType="${EXT_MIME[e] ?? 'application/octet-stream'}"/>`).join('')
  }
}

// ---------------------------------------------------------------- drawings

/** what the drawing converter needs from the document converter */
export interface DrawHost {
  /** the part relationships are added to (document, header, footnotes…) */
  readonly part: Part
  readonly media: OdtMedia
  /** bytes of a draw:image (loaded before the conversion) */
  imageBytes(el: ONode): Uint8Array | undefined
  /** the graphic-properties of a graphic style, with what it inherits */
  graphicProps(name: string | undefined): Record<string, string>
  /** WordprocessingML blocks of a text box's content, `width` points wide */
  boxBlocks(nodes: (ONode | string)[], width: number): string
  /** width of the text column, points */
  readonly columnWidth: number
  /** the target of a link (relationship id or bookmark) */
  link(href: string): { rid?: string; anchor?: string }
}

const SHAPES = new Set(['draw:custom-shape', 'draw:rect', 'draw:ellipse', 'draw:circle', 'draw:polygon', 'draw:regular-polygon'])

const H_REL: Record<string, string> = {
  page: 'page',
  'page-content': 'margin',
  'page-start-margin': 'leftMargin',
  'page-end-margin': 'rightMargin',
  'paragraph-start-margin': 'leftMargin',
  'paragraph-end-margin': 'rightMargin',
  char: 'character',
}

const V_REL: Record<string, string> = {
  page: 'page',
  'page-content': 'margin',
  char: 'line',
  line: 'line',
  baseline: 'line',
  text: 'line',
}

const PRESET: Record<string, string> = {
  rectangle: 'rect',
  ellipse: 'ellipse',
  circle: 'ellipse',
  'round-rectangle': 'roundRect',
  'round-square': 'roundRect',
  square: 'rect',
  diamond: 'diamond',
  'isosceles-triangle': 'triangle',
  'right-triangle': 'rtTriangle',
  parallelogram: 'parallelogram',
  trapezoid: 'trapezoid',
  hexagon: 'hexagon',
  octagon: 'octagon',
  pentagon: 'pentagon',
  'right-arrow': 'rightArrow',
  'left-arrow': 'leftArrow',
  'up-arrow': 'upArrow',
  'down-arrow': 'downArrow',
  star5: 'star5',
  heart: 'heart',
  smiley: 'smileyFace',
  cloud: 'cloud',
}

const A_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'

/** Converts drawing objects to w:drawing runs. */
export class OdtDraw {
  private id = 0
  /** text boxes being converted (Word has no text boxes in text boxes) */
  private boxDepth = 0

  constructor(private host: DrawHost) {}

  get inBox(): boolean {
    return this.boxDepth > 0
  }

  /** the run(s) of a drawing object in a paragraph; `rPr` is the run's properties, `href` a link around it */
  object(el: ONode, rPr: string, href?: string): string {
    switch (el.name) {
      case 'draw:a': {
        const link = el.attrs['xlink:href']
        return children(el).map((c) => this.object(c, rPr, link ?? href)).join('')
      }
      case 'draw:g':
        return children(el).map((c) => this.object(c, rPr, href)).join('')
      case 'draw:frame':
        return this.frame(el, rPr, href)
      default:
        return SHAPES.has(el.name) ? this.shape(el, rPr) : ''
    }
  }

  private size(el: ONode, inner?: ONode): { w: number; h: number } {
    const a = el.attrs
    const cw = this.host.columnWidth
    const rel = (v: string | undefined) => {
      const m = /^([\d.]+)%$/.exec(v ?? '')
      return m ? (cw * Number(m[1])) / 100 : undefined
    }
    // a width that grows with the content (only a minimum given): as wide as the column
    const min = toPt(a['fo:min-width']) ?? toPt(inner?.attrs['fo:min-width'])
    const w = toPt(a['svg:width']) ?? rel(a['style:rel-width']) ?? (min !== undefined ? Math.max(min, inner ? cw : min) : 0)
    const h = toPt(a['svg:height']) ?? toPt(a['fo:min-height']) ?? toPt(inner?.attrs['fo:min-height']) ?? 0
    return { w: Math.max(0, Math.min(w, 22 * 72)), h: Math.max(0, Math.min(h, 22 * 72)) }
  }

  private frame(fr: ONode, rPr: string, href?: string): string {
    const box = child(fr, 'draw:text-box')
    if (box) return this.textBox(fr, box, rPr)
    // the picture: the frame's images (several: an SVG with a PNG fallback), else an object's replacement image
    const images = children(fr, 'draw:image')
    let pick: { bytes: Uint8Array; name: string; ext: string } | undefined
    let svg: { name: string } | undefined
    for (const im of images) {
      const bytes = this.host.imageBytes(im)
      const m = bytes && this.host.media.add(bytes)
      if (!m || !bytes) continue
      if (m.ext === 'svg') svg ??= m
      if (!pick || (pick.ext === 'svg' && m.ext !== 'svg') || (!RASTER.has(pick.ext) && RASTER.has(m.ext))) pick = { bytes, ...m }
    }
    if (!pick) return ''
    let { w, h } = this.size(fr)
    if (!w || !h) {
      const px = pixelSize(pick.bytes, pick.ext)
      if (px && px.w > 0 && px.h > 0) {
        if (!w && !h) [w, h] = [px.w * 0.75, px.h * 0.75]
        else if (!w) w = (h * px.w) / px.h
        else h = (w * px.h) / px.w
      }
      w ||= 72
      h ||= 72
    }
    const part = this.host.part
    const rid = part.rel('image', 'media/' + pick.name)
    const svgExt =
      svg && svg.name !== pick.name
        ? `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${part.rel('image', 'media/' + svg.name)}"/></a:ext></a:extLst>`
        : ''
    const n = ++this.id
    const title = textContent(child(fr, 'svg:title') ?? '').trim()
    const desc = textContent(child(fr, 'svg:desc') ?? '').trim() || title
    const g = this.host.graphicProps(fr.attrs['draw:style-name'])
    const ln = this.line(g)
    const graphic =
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
      `<pic:nvPicPr><pic:cNvPr id="${n}" name="Image ${n}"${desc ? ` descr="${escAttr(desc)}"` : ''}/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}">${svgExt}</a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${ln ?? ''}</pic:spPr>` +
      '</pic:pic></a:graphicData></a:graphic>'
    const name = fr.attrs['draw:name'] || `Image ${n}`
    return this.drawing(fr, g, { w, h, n, name, descr: desc, graphic, href })
  }

  /** a:ln of a frame's border (undefined: none said) */
  private line(g: Record<string, string>): string | undefined {
    const stroke = g['draw:stroke']
    if (stroke === 'solid' || stroke === 'dash') {
      const c = toHex(g['svg:stroke-color']) ?? '000000'
      const w = toPt(g['svg:stroke-width']) || 0.75
      return `<a:ln w="${emu(w)}"><a:solidFill><a:srgbClr val="${c}"/></a:solidFill></a:ln>`
    }
    const b = border(g['fo:border'] ?? g['fo:border-top'])
    if (b && b.val !== 'nil') return `<a:ln w="${emu(b.sz / 8)}"><a:solidFill><a:srgbClr val="${b.color}"/></a:solidFill></a:ln>`
    if (stroke === 'none' || g['fo:border'] === 'none') return '<a:ln><a:noFill/></a:ln>'
    return undefined
  }

  private fill(g: Record<string, string>): string | undefined {
    const bg = g['fo:background-color']
    if (g['draw:fill'] === 'none') return '<a:noFill/>'
    const c = g['draw:fill'] === 'solid' || g['draw:fill'] === undefined ? toHex(g['draw:fill-color']) : undefined
    if (g['draw:fill'] === 'solid' && c) return `<a:solidFill><a:srgbClr val="${c}"/></a:solidFill>`
    if (bg === 'transparent') return '<a:noFill/>'
    const h = toHex(bg)
    if (h) return `<a:solidFill><a:srgbClr val="${h}"/></a:solidFill>`
    if (g['draw:fill'] === 'gradient' || g['draw:fill'] === 'hatch' || g['draw:fill'] === 'bitmap') {
      const fc = toHex(g['draw:fill-color'])
      if (fc) return `<a:solidFill><a:srgbClr val="${fc}"/></a:solidFill>`
    }
    return undefined
  }

  private textBox(fr: ONode, box: ONode, rPr: string): string {
    if (this.boxDepth > 0) return this.flatText(box, rPr)
    const { w: w0, h: h0 } = this.size(fr, box)
    const w = w0 || this.host.columnWidth
    const h = h0 || 14
    const g = this.host.graphicProps(fr.attrs['draw:style-name'])
    const { pad } = borders(g)
    this.boxDepth++
    let body: string
    try {
      body = this.host.boxBlocks(box.kids, Math.max(12, w - (pad.left ?? 0) - (pad.right ?? 0)))
    } finally {
      this.boxDepth--
    }
    const n = ++this.id
    const auto = !toPt(fr.attrs['svg:height']) || g['draw:auto-grow-height'] === 'true'
    const va = g['draw:textarea-vertical-align']
    const anchor = va === 'middle' ? 'ctr' : va === 'bottom' ? 'b' : 't'
    const ins = (s: 'left' | 'top' | 'right' | 'bottom') => emu(pad[s] ?? 0)
    const graphic = this.wsp(w, h, 'rect', this.fill(g) ?? '<a:noFill/>', this.line(g) ?? '<a:ln><a:noFill/></a:ln>', body || '<w:p/>', `lIns="${ins('left')}" tIns="${ins('top')}" rIns="${ins('right')}" bIns="${ins('bottom')}" anchor="${anchor}"`, auto)
    return this.drawing(fr, g, { w, h, n, name: fr.attrs['draw:name'] || `Text Box ${n}`, graphic })
  }

  /** a text box inside a text box: its text as line-broken runs */
  private flatText(box: ONode, rPr: string): string {
    const lines: string[] = []
    const walk = (n: ONode) => {
      for (const k of children(n)) {
        if (k.name === 'text:p' || k.name === 'text:h') lines.push(textContent(k))
        else walk(k)
      }
    }
    walk(box)
    const t = lines.join('\n').trim()
    if (!t) return ''
    return t
      .split('\n')
      .map((line, k) => `<w:r>${rPr}${k ? '<w:br/>' : ''}<w:t xml:space="preserve">${escAttr(line)}</w:t></w:r>`)
      .join('')
  }

  private shape(el: ONode, rPr: string): string {
    const { w, h } = this.size(el)
    if (!w || !h) return ''
    const g = this.host.graphicProps(el.attrs['draw:style-name'])
    const hasText = children(el).some((k) => k.name === 'text:p' || k.name === 'text:h' || k.name === 'text:list')
    const fill = this.fill(g)
    if (!hasText && !fill) return ''
    if (hasText && this.boxDepth > 0) return this.flatText(el, rPr)
    const kind = child(el, 'draw:enhanced-geometry')?.attrs['draw:type']
    const prst = el.name === 'draw:ellipse' || el.name === 'draw:circle' ? 'ellipse' : (PRESET[kind ?? ''] ?? 'rect')
    let body = ''
    if (hasText) {
      this.boxDepth++
      try {
        body = this.host.boxBlocks(el.kids.filter((k) => !isEl(k) || k.name.startsWith('text:') || k.name === 'table:table'), w)
      } finally {
        this.boxDepth--
      }
    }
    const n = ++this.id
    const va = g['draw:textarea-vertical-align']
    const anchor = va === 'middle' || !va ? 'ctr' : va === 'bottom' ? 'b' : 't'
    const graphic = this.wsp(w, h, prst, fill ?? '<a:noFill/>', this.line(g) ?? (g['draw:stroke'] === 'none' ? '<a:ln><a:noFill/></a:ln>' : '<a:ln w="9525"><a:solidFill><a:srgbClr val="3465A4"/></a:solidFill></a:ln>'), hasText ? body || '<w:p/>' : undefined, `anchor="${anchor}"`, false)
    return this.drawing(el, g, { w, h, n, name: el.attrs['draw:name'] || `Shape ${n}`, graphic })
  }

  private wsp(w: number, h: number, prst: string, fill: string, ln: string, body: string | undefined, bodyAttrs: string, auto: boolean): string {
    return (
      `<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr${body !== undefined ? ' txBox="1"' : ''}/>` +
      `<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>${fill}${ln}</wps:spPr>` +
      (body !== undefined ? `<wps:txbx><w:txbxContent>${body}</w:txbxContent></wps:txbx>` : '') +
      `<wps:bodyPr rot="0" vert="horz" wrap="square" ${bodyAttrs}>${auto ? '<a:spAutoFit/>' : '<a:noAutofit/>'}</wps:bodyPr></wps:wsp></a:graphicData></a:graphic>`
    )
  }

  /** the w:drawing run: inline for objects anchored as characters, floating otherwise */
  private drawing(el: ONode, g: Record<string, string>, o: { w: number; h: number; n: number; name: string; descr?: string; graphic: string; href?: string }): string {
    const ext = `<wp:extent cx="${emu(o.w)}" cy="${emu(o.h)}"/>`
    let click = ''
    if (o.href) {
      const l = this.host.link(o.href)
      if (l.rid) click = `<a:hlinkClick ${A_NS} r:id="${l.rid}"/>`
    }
    const docPr = `<wp:docPr id="${o.n}" name="${escAttr(o.name)}"${o.descr ? ` descr="${escAttr(o.descr)}"` : ''}${click ? `>${click}</wp:docPr>` : '/>'}`
    const frameNs = `<wp:cNvGraphicFramePr><a:graphicFrameLocks ${A_NS}${o.graphic.includes('/picture"') ? ' noChangeAspect="1"' : ''}/></wp:cNvGraphicFramePr>`
    const anchorType = el.attrs['text:anchor-type']
    if (anchorType === 'as-char' || this.boxDepth > 0 || anchorType === undefined) {
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">${ext}<wp:effectExtent l="0" t="0" r="0" b="0"/>${docPr}${frameNs}${o.graphic}</wp:inline></w:drawing></w:r>`
    }
    const a = el.attrs
    const page = anchorType === 'page'
    const hPos = g['style:horizontal-pos'] ?? (a['svg:x'] !== undefined ? 'from-left' : 'center')
    const hRel = H_REL[g['style:horizontal-rel'] ?? (page ? 'page' : 'paragraph')] ?? 'column'
    const vPos = g['style:vertical-pos'] ?? (a['svg:y'] !== undefined ? 'from-top' : 'top')
    const vRel = V_REL[g['style:vertical-rel'] ?? (page ? 'page' : 'paragraph')] ?? 'paragraph'
    const hAlign: Record<string, string> = { left: 'left', center: 'center', right: 'right', inside: 'inside', outside: 'outside' }
    const vAlign: Record<string, string> = { top: 'top', middle: 'center', center: 'center', bottom: 'bottom', below: 'bottom' }
    const posH = hAlign[hPos] ? `<wp:align>${hAlign[hPos]}</wp:align>` : `<wp:posOffset>${emu(toPt(a['svg:x']) ?? 0)}</wp:posOffset>`
    // Word aligns nothing to a paragraph vertically: there the frame goes to the paragraph's top
    const posV = vAlign[vPos] && vRel !== 'paragraph' ? `<wp:align>${vAlign[vPos]}</wp:align>` : `<wp:posOffset>${vAlign[vPos] ? 0 : emu(toPt(a['svg:y']) ?? 0)}</wp:posOffset>`
    const wrapMode = g['style:wrap'] ?? 'none'
    const behind = wrapMode === 'run-through' && g['style:run-through'] === 'background'
    let wrap: string
    switch (wrapMode) {
      case 'run-through':
        wrap = '<wp:wrapNone/>'
        break
      case 'left':
      case 'right':
        wrap = `<wp:wrapSquare wrapText="${wrapMode}"/>`
        break
      case 'parallel':
        wrap = '<wp:wrapSquare wrapText="bothSides"/>'
        break
      case 'dynamic':
      case 'biggest':
        wrap = '<wp:wrapSquare wrapText="largest"/>'
        break
      default:
        wrap = '<wp:wrapTopAndBottom/>'
    }
    const m = (k: string) => emu(Math.max(0, toPt(g[`fo:margin-${k}`] ?? g['fo:margin']) ?? 0))
    const z = Math.max(0, Math.min(1e6, Number(a['draw:z-index']) || 0))
    return (
      `<w:r><w:drawing><wp:anchor distT="${m('top')}" distB="${m('bottom')}" distL="${m('left')}" distR="${m('right')}" simplePos="0" relativeHeight="${251658240 + z * 1024}" ` +
      `behindDoc="${behind ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>` +
      `<wp:positionH relativeFrom="${hRel}">${posH}</wp:positionH><wp:positionV relativeFrom="${vRel}">${posV}</wp:positionV>` +
      `${ext}<wp:effectExtent l="0" t="0" r="0" b="0"/>${wrap}${docPr}${frameNs}${o.graphic}</wp:anchor></w:drawing></w:r>`
    )
  }
}
