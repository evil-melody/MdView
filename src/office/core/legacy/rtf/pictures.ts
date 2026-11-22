/** `\pict` data → images a browser shows (PNG, JPEG, GIF, BMP from a DIB), their size, and DrawingML for them. */
import { crc32 } from '../../zipwrite'
import { escAttr } from '../../raw'
import { HexSink } from './lexer'

export interface Pict {
  /** blip kind: png, jpeg, emf, wmf, dib, bmp, mac, other */
  kind?: string
  data: HexSink
  picw?: number
  pich?: number
  goalw?: number
  goalh?: number
  scalex?: number
  scaley?: number
  cropl?: number
  cropr?: number
  cropt?: number
  cropb?: number
}

export interface Image {
  ext: string
  bytes: Uint8Array
  /** shown size (twips) */
  w: number
  h: number
  /** a:srcRect (1/1000 %) */
  crop?: { l: number; t: number; r: number; b: number }
}

const u16 = (b: Uint8Array, k: number) => b[k] | (b[k + 1] << 8)
const u32 = (b: Uint8Array, k: number) => (b[k] | (b[k + 1] << 8) | (b[k + 2] << 16) | (b[k + 3] << 24)) >>> 0
const be16 = (b: Uint8Array, k: number) => (b[k] << 8) | b[k + 1]
const be32 = (b: Uint8Array, k: number) => ((b[k] << 24) | (b[k + 1] << 16) | (b[k + 2] << 8) | b[k + 3]) >>> 0

/** pixel size of a PNG, JPEG, GIF or BMP */
function pixels(b: Uint8Array, ext: string): { w: number; h: number } | undefined {
  if (ext === 'png' && b.length >= 24) return { w: be32(b, 16), h: be32(b, 20) }
  if (ext === 'gif' && b.length >= 10) return { w: u16(b, 6), h: u16(b, 8) }
  if (ext === 'bmp' && b.length >= 26) return { w: u32(b, 18), h: Math.abs(u32(b, 22) | 0) }
  if (ext === 'jpg') {
    let k = 2
    for (let guard = 0; k + 9 < b.length && guard < 10000; guard++) {
      if (b[k] !== 0xff) {
        k++
        continue
      }
      const m = b[k + 1]
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) {
        k += m === 0xff ? 1 : 2
        continue
      }
      if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: be16(b, k + 7), h: be16(b, k + 5) }
      k += 2 + be16(b, k + 2)
    }
  }
  return undefined
}

/** a packed DIB (BITMAPINFOHEADER + colors + bits) as a .bmp file */
export function dibToBmp(d: Uint8Array): Uint8Array | undefined {
  if (d.length < 16) return undefined
  const hdr = u32(d, 0)
  if (hdr !== 12 && hdr !== 40 && hdr !== 52 && hdr !== 56 && hdr !== 108 && hdr !== 124) return undefined
  const bits = hdr === 12 ? u16(d, 10) : u16(d, 14)
  const compression = hdr === 12 ? 0 : u32(d, 16)
  const used = hdr === 12 ? 0 : u32(d, 32)
  const colors = used || (bits <= 8 ? 1 << bits : 0)
  const masks = hdr === 40 && (compression === 3 || compression === 6) ? (compression === 3 ? 12 : 16) : 0
  const off = 14 + hdr + masks + colors * (hdr === 12 ? 3 : 4)
  if (off > 14 + d.length) return undefined
  const out = new Uint8Array(14 + d.length)
  out[0] = 0x42
  out[1] = 0x4d
  const size = out.length
  out[2] = size & 0xff
  out[3] = (size >> 8) & 0xff
  out[4] = (size >> 16) & 0xff
  out[5] = (size >>> 24) & 0xff
  out[10] = off & 0xff
  out[11] = (off >> 8) & 0xff
  out[12] = (off >> 16) & 0xff
  out.set(d, 14)
  return out
}

/** the bitmap a metafile only wraps (one StretchDIBits / BitBlt record and no text), as a .bmp file */
function metafileBitmap(b: Uint8Array, kind: 'wmf' | 'emf'): Uint8Array | undefined {
  let found: Uint8Array | undefined
  let count = 0
  if (kind === 'emf') {
    // EMR_STRETCHDIBITS (81): offBmiSrc at 48; EMR_BITBLT (76) / EMR_STRETCHBLT (77): at 84
    let k = 0
    for (let guard = 0; k + 8 <= b.length && guard < 200000; guard++) {
      const type = u32(b, k)
      const size = u32(b, k + 4)
      if (size < 8 || k + size > b.length) break
      if (type === 83 || type === 84 || type === 96 || type === 97) return undefined
      const at = type === 81 ? 48 : type === 76 || type === 77 ? 84 : 0
      if (at && k + at + 16 <= b.length) {
        const offBmi = u32(b, k + at)
        const cbBmi = u32(b, k + at + 4)
        const offBits = u32(b, k + at + 8)
        const cbBits = u32(b, k + at + 12)
        if (cbBmi && cbBits && offBits + cbBits <= size && offBmi + cbBmi <= size) {
          count++
          const dib = new Uint8Array(cbBmi + cbBits)
          dib.set(b.subarray(k + offBmi, k + offBmi + cbBmi))
          dib.set(b.subarray(k + offBits, k + offBits + cbBits), cbBmi)
          found = dibToBmp(dib)
        }
      }
      if (type === 14) break
      k += size
    }
    return count === 1 ? found : undefined
  }
  // WMF: optional placeable header, 18-byte header, then records (size in words, function)
  let k = u32(b, 0) === 0x9ac6cdd7 ? 22 : 0
  if (k + 18 > b.length) return undefined
  k += u16(b, k + 2) * 2
  for (let guard = 0; k + 6 <= b.length && guard < 200000; guard++) {
    const size = u32(b, k) * 2
    const fn = u16(b, k + 4)
    if (size < 6 || k + size > b.length) break
    if (fn === 0x0521 || fn === 0x0a32) return undefined
    // META_STRETCHDIB: 22 bytes of parameters before the DIB; META_DIBSTRETCHBLT: 20; META_DIBBITBLT: 16
    const skip = fn === 0x0f43 ? 22 : fn === 0x0b41 ? 20 : fn === 0x0940 ? 16 : 0
    if (skip && size > 6 + skip + 40) {
      count++
      found = dibToBmp(b.subarray(k + 6 + skip, k + size))
    }
    if (fn === 0) break
    k += size
  }
  return count === 1 ? found : undefined
}

/** the image of a picture, or undefined when it is not one a browser shows */
export function pictImage(p: Pict): Image | undefined {
  let bytes: Uint8Array = p.data.bytes()
  if (bytes.length < 8) return undefined
  let ext: string | undefined
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) ext = 'png'
  else if (bytes[0] === 0xff && bytes[1] === 0xd8) ext = 'jpg'
  else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) ext = 'gif'
  else if (bytes[0] === 0x42 && bytes[1] === 0x4d && p.kind !== 'dib') ext = 'bmp'
  else if (p.kind === 'dib') {
    const bmp = dibToBmp(bytes)
    if (bmp) [bytes, ext] = [bmp, 'bmp']
  } else if (p.kind === 'wmf' || p.kind === 'emf') {
    const bmp = metafileBitmap(bytes, p.kind)
    if (bmp) [bytes, ext] = [bmp, 'bmp']
  }
  if (!ext) return undefined
  bytes = bytes.slice()
  const px = pixels(bytes, ext)
  const bitmap = p.kind !== 'wmf' && p.kind !== 'emf'
  // \picw / \pich: pixels for bitmaps, 0.01 mm for metafiles
  const fromPic = (v: number | undefined) => (v && v > 0 ? (bitmap ? v * 15 : Math.round((v * 1440) / 2540)) : undefined)
  let w = (p.goalw && p.goalw > 0 ? p.goalw : undefined) ?? fromPic(p.picw) ?? (px ? px.w * 15 : 1440)
  let h = (p.goalh && p.goalh > 0 ? p.goalh : undefined) ?? fromPic(p.pich) ?? (px ? px.h * 15 : 1440)
  const cl = Math.max(0, p.cropl ?? 0)
  const cr = Math.max(0, p.cropr ?? 0)
  const ct = Math.max(0, p.cropt ?? 0)
  const cb = Math.max(0, p.cropb ?? 0)
  let crop: Image['crop']
  if ((cl || cr || ct || cb) && cl + cr < w && ct + cb < h) {
    crop = { l: Math.round((cl / w) * 100000), r: Math.round((cr / w) * 100000), t: Math.round((ct / h) * 100000), b: Math.round((cb / h) * 100000) }
    w -= cl + cr
    h -= ct + cb
  }
  const sx = p.scalex && p.scalex > 0 ? p.scalex : 100
  const sy = p.scaley && p.scaley > 0 ? p.scaley : 100
  w = Math.max(1, Math.min(31680 * 4, Math.round((w * sx) / 100)))
  h = Math.max(1, Math.min(31680 * 4, Math.round((h * sy) / 100)))
  return { ext, bytes, w, h, crop }
}

/** Media of the package: images by content (the same picture used twice is stored once). */
export class Media {
  readonly files = new Map<string, Uint8Array>()
  private byKey = new Map<string, string>()
  private docPr = 0

  /** file name (in word/media) of an image */
  name(img: Image): string {
    const key = `${img.ext}:${img.bytes.length}:${crc32(img.bytes)}`
    let name = this.byKey.get(key)
    if (!name) {
      name = `image${this.byKey.size + 1}.${img.ext}`
      this.byKey.set(key, name)
      this.files.set(`word/media/${name}`, img.bytes)
    }
    return name
  }

  /** a new drawing object id */
  id(): number {
    return ++this.docPr
  }
}

const emu = (twips: number) => Math.round(twips * 635)

/** where a floating object sits (`\shp` properties) */
export interface Anchor {
  x: number
  y: number
  relH: string
  relV: string
  wrap: number
  wrapSide?: number
  behind: boolean
  z: number
}

function wrapXml(a: Anchor): string {
  if (a.behind || a.wrap === 3) return '<wp:wrapNone/>'
  if (a.wrap === 1) return '<wp:wrapTopAndBottom/>'
  const side = ['bothSides', 'left', 'right', 'largest'][a.wrapSide ?? 0] ?? 'bothSides'
  return `<wp:wrapSquare wrapText="${side}"/>`
}

/** a wp:inline / wp:anchor around a graphic */
export function drawingXml(id: number, w: number, h: number, graphic: string, name: string, anchor?: Anchor, descr?: string): string {
  const ext = `<wp:extent cx="${emu(w)}" cy="${emu(h)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`
  const docPr = `<wp:docPr id="${id}" name="${name} ${id}"${descr ? ` descr="${escAttr(descr)}"` : ''}/>`
  if (!anchor)
    return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">${ext}${docPr}<wp:cNvGraphicFramePr/>${graphic}</wp:inline></w:drawing>`
  return (
    `<w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="${Math.max(0, Math.min(0x7ffffff, anchor.z))}" ` +
    `behindDoc="${anchor.behind ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="${anchor.relH}"><wp:posOffset>${emu(anchor.x)}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="${anchor.relV}"><wp:posOffset>${emu(anchor.y)}</wp:posOffset></wp:positionV>` +
    `${ext}${wrapXml(anchor)}${docPr}<wp:cNvGraphicFramePr/>${graphic}</wp:anchor></w:drawing>`
  )
}

/** the a:graphic of a picture */
export function pictureGraphic(id: number, rid: string, img: Image, w = img.w, h = img.h): string {
  const c = img.crop
  return (
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="Picture ${id}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/>${c ? `<a:srcRect l="${c.l}" t="${c.t}" r="${c.r}" b="${c.b}"/>` : ''}<a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic>'
  )
}

/** the a:graphic of a text box */
export function textBoxGraphic(w: number, h: number, body: string, fill: string | undefined, line: string | undefined, lineW: number, ins: [number, number, number, number]): string {
  return (
    '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp>' +
    `<wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    (fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>') +
    (line ? `<a:ln w="${Math.round(lineW)}"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>') +
    `</wps:spPr><wps:txbx><w:txbxContent>${body || '<w:p/>'}</w:txbxContent></wps:txbx>` +
    `<wps:bodyPr wrap="square" lIns="${ins[0]}" tIns="${ins[1]}" rIns="${ins[2]}" bIns="${ins[3]}"><a:noAutofit/></wps:bodyPr>` +
    '</wps:wsp></a:graphicData></a:graphic>'
  )
}
