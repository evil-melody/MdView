/**
 * Pictures of a Word binary document: inline pictures (a PICF header and OfficeArt records in the Data stream) and
 * floating shapes (FSPA anchors in the text, OfficeArt drawings and the BLIP store in the table stream).
 */
import { Bytes } from './bin'

export interface Blip {
  ext: 'png' | 'jpeg' | 'gif' | 'bmp' | 'emf' | 'wmf' | 'pict' | 'tiff'
  data: Uint8Array
  /** the data is zlib-compressed (metafiles) */
  deflated?: boolean
  /** a metafile's bounds (logical units) and size (EMU): a Windows metafile gets its placeable header from them */
  bounds?: { l: number; t: number; r: number; b: number; cx: number; cy: number }
}

/** an image's content type */
export const IMAGE_TYPES: Record<Blip['ext'], string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  emf: 'image/x-emf',
  wmf: 'image/x-wmf',
  pict: 'image/pict',
  tiff: 'image/tiff',
}

const MAX_DEPTH = 12

/** A BLIP record (OfficeArtBlip*) at `off` → the image bytes. */
export function readBlip(b: Bytes, off: number, end = b.length): Blip | undefined {
  const inst = b.u16(off) >> 4
  const type = b.u16(off + 2)
  const len = b.u32(off + 4)
  const start = off + 8
  const stop = Math.min(end, b.length, start + len)
  if (stop <= start) return undefined
  const uids = inst & 1 ? 2 : 1
  switch (type) {
    case 0xf01a:
    case 0xf01b:
    case 0xf01c: {
      const p = start + 16 * uids
      const size = b.u32(p + 28)
      const comp = b.u8(p + 32)
      const data = b.sub(p + 34, Math.min(size, stop - p - 34))
      if (!data.length) return undefined
      const ext = type === 0xf01a ? 'emf' : type === 0xf01b ? 'wmf' : 'pict'
      const bounds = { l: b.i32(p + 4), t: b.i32(p + 8), r: b.i32(p + 12), b: b.i32(p + 16), cx: b.i32(p + 20), cy: b.i32(p + 24) }
      return { ext, data, deflated: comp === 0, bounds }
    }
    case 0xf01d:
    case 0xf01e:
    case 0xf01f:
    case 0xf029:
    case 0xf02a: {
      const p = start + 16 * uids + 1
      const data = b.sub(p, stop - p)
      if (!data.length) return undefined
      if (type === 0xf01f) return dibToBmp(data)
      const ext = type === 0xf01e ? 'png' : type === 0xf029 ? 'tiff' : 'jpeg'
      return { ext: sniff(data) ?? ext, data }
    }
  }
  return undefined
}

/** the actual format of image bytes (some files label PNG / GIF data as JPEG) */
function sniff(d: Uint8Array): Blip['ext'] | undefined {
  if (d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47) return 'png'
  if (d[0] === 0xff && d[1] === 0xd8) return 'jpeg'
  if (d[0] === 0x47 && d[1] === 0x49 && d[2] === 0x46) return 'gif'
  return undefined
}

/** a device-independent bitmap (header, palette, pixels) → a .bmp file */
function dibToBmp(dib: Uint8Array): Blip | undefined {
  const d = new Bytes(dib)
  const hdr = d.u32(0)
  if (hdr < 12 || hdr > dib.length) return undefined
  let palette = 0
  if (hdr === 12) {
    const bits = d.u16(10)
    if (bits <= 8) palette = (1 << bits) * 3
  } else {
    const bits = d.u16(14)
    const compression = d.u32(16)
    const used = d.u32(32)
    if (bits <= 8) palette = (used || 1 << bits) * 4
    else if (used) palette = used * 4
    if (compression === 3 && hdr === 40) palette += 12
    if (compression === 6 && hdr === 40) palette += 16
  }
  const out = new Uint8Array(14 + dib.length)
  const v = new DataView(out.buffer)
  out[0] = 0x42
  out[1] = 0x4d
  v.setUint32(2, out.length, true)
  v.setUint32(10, Math.min(out.length, 14 + hdr + palette), true)
  out.set(dib, 14)
  return { ext: 'bmp', data: out }
}

/** OfficeArt records in [start, end): calls `fn` with each record's header fields and body offset */
export function records(b: Bytes, start: number, end: number, fn: (type: number, inst: number, body: number, len: number) => void | false): void {
  let p = start
  let guard = 0
  while (p + 8 <= end && guard++ < 100_000) {
    const vi = b.u16(p)
    const type = b.u16(p + 2)
    const len = b.u32(p + 4)
    if (type < 0xf000) break
    const bodyEnd = Math.min(end, p + 8 + len)
    if (fn(type, vi >> 4, p + 8, bodyEnd - p - 8) === false) break
    p = p + 8 + len
    if ((vi & 0xf) === 0xf && len === 0) continue
  }
}

/** shape properties (FOPT): property id → value; complex values become their data offsets */
export function fopt(b: Bytes, body: number, len: number, count: number): Map<number, number> {
  const out = new Map<number, number>()
  let complex = body + count * 6
  for (let k = 0; k < count && body + k * 6 + 6 <= body + len; k++) {
    const id = b.u16(body + k * 6)
    const v = b.u32(body + k * 6 + 2)
    const pid = id & 0x3fff
    if (id & 0x8000) {
      out.set(pid, complex)
      out.set(pid | 0x10000, v)
      complex += v
    } else out.set(pid, v)
  }
  return out
}

export interface Picf {
  /** shown size, twips */
  w: number
  h: number
  /** crop (fractions of the full image, 0-1) */
  crop?: { l: number; t: number; r: number; b: number }
  blip?: Blip
  /** the picture is in the document's BLIP store (1-based index) */
  pib?: number
}

/** A picture in the Data stream at `fc` (the target of sprmCPicLocation). */
export function readPicf(data: Bytes, fc: number): Picf | undefined {
  const lcb = data.i32(fc)
  const cbHeader = data.u16(fc + 4)
  if (lcb <= 0 || cbHeader < 0x44 || fc + cbHeader > data.length) return undefined
  const end = Math.min(data.length, fc + lcb)
  const mm = data.i16(fc + 6)
  const goalW = data.i16(fc + 28)
  const goalH = data.i16(fc + 30)
  const mx = data.u16(fc + 32) || 1000
  const my = data.u16(fc + 34) || 1000
  const cl = data.i16(fc + 36)
  const ct = data.i16(fc + 38)
  const cr = data.i16(fc + 40)
  const cb = data.i16(fc + 42)
  const w = Math.max(0, ((goalW - cl - cr) * mx) / 1000)
  const h = Math.max(0, ((goalH - ct - cb) * my) / 1000)
  const pic: Picf = { w, h }
  if ((cl || ct || cr || cb) && goalW > 0 && goalH > 0) pic.crop = { l: cl / goalW, t: ct / goalH, r: cr / goalW, b: cb / goalH }
  let p = fc + cbHeader
  if (mm === 0x66) p += 1 + data.u8(p)
  if (mm !== 0x64 && mm !== 0x66) {
    // an old-style picture: a Windows metafile right after the header
    const bytes = data.sub(p, end - p)
    if (bytes.length > 18) pic.blip = { ext: 'wmf', data: placeable(bytes, w, h) }
    return pic
  }
  records(data, p, end, (type, _inst, body, len) => {
    if (type === 0xf004) {
      // the shape's properties: a picture kept in the BLIP store
      records(data, body, body + len, (t, inst, b2, l2) => {
        if (t === 0xf00b) {
          const pib = fopt(data, b2, l2, inst).get(0x104)
          if (pib) pic.pib = pib
        }
      })
    } else if (type === 0xf007) {
      const blip = fbseBlip(data, body, len)
      if (blip) {
        pic.blip = blip
        return false
      }
    } else if (type >= 0xf018 && type <= 0xf117) {
      const blip = readBlip(data, body - 8, end)
      if (blip) {
        pic.blip = blip
        return false
      }
    }
  })
  return pic
}

/** the BLIP embedded in an FBSE record (undefined when it is stored elsewhere) */
function fbseBlip(b: Bytes, body: number, len: number): Blip | undefined {
  const cbName = b.u8(body + 33)
  const at = body + 36 + cbName
  if (at + 8 > body + len) return undefined
  return readBlip(b, at, body + len)
}

/**
 * A Windows metafile without its placeable header → one Word and image tools read. The bounding box is in the
 * metafile's logical units (twips when not given), `inch` the logical units per inch.
 */
export function placeable(wmf: Uint8Array, w: number, h: number, box?: { l: number; t: number; r: number; b: number }, inch = 1440): Uint8Array {
  if (wmf[0] === 0xd7 && wmf[1] === 0xcd && wmf[2] === 0xc6 && wmf[3] === 0x9a) return wmf
  const out = new Uint8Array(22 + wmf.length)
  const v = new DataView(out.buffer)
  const clamp = (n: number) => Math.max(-32768, Math.min(32767, Math.round(n)))
  v.setUint32(0, 0x9ac6cdd7, true)
  v.setInt16(6, clamp(box?.l ?? 0), true)
  v.setInt16(8, clamp(box?.t ?? 0), true)
  v.setInt16(10, clamp(box?.r ?? w), true)
  v.setInt16(12, clamp(box?.b ?? h), true)
  v.setUint16(14, Math.max(1, Math.min(65535, Math.round(inch))), true)
  let sum = 0
  for (let k = 0; k < 20; k += 2) sum ^= v.getUint16(k, true)
  v.setUint16(20, sum, true)
  out.set(wmf, 22)
  return out
}

// ---------------------------------------------------------------- floating shapes

export interface Shape {
  spid: number
  /** shape type (msospt: 75 picture frame, 202 text box, 1 rectangle…) */
  type: number
  /** BLIP store index (1-based) of a picture */
  pib?: number
  /** text box id (lTxid) */
  txid?: number
  fill?: string
  line?: string
  lineW?: number
  /** WordArt: its text and font */
  text?: string
  font?: string
  /** a group's shapes */
  kids?: Shape[]
  /** child anchor (in the group's coordinates) */
  child?: { l: number; t: number; r: number; b: number }
  /** group coordinate space */
  group?: { l: number; t: number; r: number; b: number }
  hidden?: boolean
}

/** The OfficeArt content of the table stream: the BLIP store and the shapes of the main text and of the headers. */
export class Drawings {
  /** the BLIP store: offsets of the FBSE records' bodies */
  private bstore: { body: number; len: number }[] = []
  private shapes = new Map<number, Shape>()
  private cache = new Map<number, Blip | null>()

  constructor(
    private tbl: Bytes,
    private wd: Bytes,
    fc: number,
    lcb: number,
  ) {
    if (lcb < 8) return
    const end = Math.min(tbl.length, fc + lcb)
    let p = fc
    // OfficeArtDggContainer, then (dgglbl byte, OfficeArtDgContainer) for the main text and the headers
    if (tbl.u16(p + 2) === 0xf000) {
      const len = tbl.u32(p + 4)
      records(tbl, p + 8, Math.min(end, p + 8 + len), (type, _i, body, blen) => {
        if (type === 0xf001) records(tbl, body, body + blen, (t, _j, b2, l2) => void (t === 0xf007 && this.bstore.push({ body: b2, len: l2 })))
      })
      p += 8 + len
    }
    let guard = 0
    while (p + 9 <= end && guard++ < 16) {
      p++
      if (tbl.u16(p + 2) !== 0xf002) break
      const len = tbl.u32(p + 4)
      records(tbl, p + 8, Math.min(end, p + 8 + len), (type, _i, body, blen) => {
        if (type === 0xf003) this.group(body, body + blen, 0)
      })
      p += 8 + len
    }
  }

  /** reads a group container (OfficeArtSpgrContainer): its shapes and sub-groups */
  private group(start: number, end: number, depth: number): Shape | undefined {
    if (depth > MAX_DEPTH) return undefined
    let head: Shape | undefined
    const kids: Shape[] = []
    records(this.tbl, start, end, (type, _i, body, len) => {
      let s: Shape | undefined
      if (type === 0xf004) s = this.shape(body, body + len)
      else if (type === 0xf003) s = this.group(body, body + len, depth + 1)
      if (!s) return
      if (!head) head = s
      else kids.push(s)
    })
    if (head) head.kids = kids
    return head
  }

  private shape(start: number, end: number): Shape | undefined {
    const b = this.tbl
    let s: Shape | undefined
    let props: Map<number, number> | undefined
    let child: Shape['child']
    let group: Shape['group']
    records(b, start, end, (type, inst, body, len) => {
      if (type === 0xf00a) s = { spid: b.u32(body), type: inst }
      else if (type === 0xf00b) props = fopt(b, body, len, inst)
      else if (type === 0xf00f) child = { l: b.i32(body), t: b.i32(body + 4), r: b.i32(body + 8), b: b.i32(body + 12) }
      else if (type === 0xf009) group = { l: b.i32(body), t: b.i32(body + 4), r: b.i32(body + 8), b: b.i32(body + 12) }
    })
    if (!s) return undefined
    if (props) {
      const pib = props.get(0x104)
      if (pib) s.pib = pib
      const tx = props.get(0x80)
      if (tx !== undefined) s.txid = tx
      const fillBools = props.get(0x1bf)
      const filled = fillBools === undefined ? true : !(fillBools & 0x100000) || !!(fillBools & 0x10)
      const fill = props.get(0x181)
      if (filled && fill !== undefined && fill >>> 24 === 0) s.fill = rgb(fill)
      else if (filled && (fill === undefined || fill >>> 24 !== 0) && s.type !== 75 && s.type !== 0) s.fill = 'FFFFFF'
      const lineBools = props.get(0x1ff)
      const lined = lineBools === undefined ? s.type !== 75 && s.type !== 0 : !(lineBools & 0x80000) || !!(lineBools & 0x8)
      const line = props.get(0x1c0)
      if (lined) s.line = line !== undefined && line >>> 24 === 0 ? rgb(line) : '000000'
      const lw = props.get(0x1cb)
      if (lw !== undefined) s.lineW = lw
      // WordArt (text effect shapes): the text and its font
      const gtext = props.get(0xc0)
      if (s.type >= 136 && s.type <= 175 && gtext !== undefined) {
        s.text = utf16z(b, gtext, props.get(0x100c0) ?? 0)
        const font = props.get(0xc5)
        if (font !== undefined) s.font = utf16z(b, font, props.get(0x100c5) ?? 0)
      }
      const grp = props.get(0x3bf)
      if (grp !== undefined && grp & 0x20000 && grp & 0x2) s.hidden = true
    }
    if (child) s.child = child
    if (group) s.group = group
    this.shapes.set(s.spid, s)
    return s
  }

  shape0(spid: number): Shape | undefined {
    return this.shapes.get(spid)
  }

  /** the image of a BLIP store entry (1-based), from the FBSE or the WordDocument stream it points into */
  blip(pib: number): Blip | undefined {
    const hit = this.cache.get(pib)
    if (hit !== undefined) return hit ?? undefined
    const e = this.bstore[pib - 1]
    let out: Blip | undefined
    if (e) {
      out = fbseBlip(this.tbl, e.body, e.len)
      if (!out) {
        const fo = this.tbl.u32(e.body + 28)
        const size = this.tbl.u32(e.body + 20)
        if (fo !== 0xffffffff && fo < this.wd.length) out = readBlip(this.wd, fo, Math.min(this.wd.length, fo + Math.max(size, 8)))
      }
    }
    this.cache.set(pib, out ?? null)
    return out
  }
}

/** a zero-terminated UTF-16 string of `len` bytes at most */
function utf16z(b: Bytes, at: number, len: number): string {
  let out = ''
  for (let k = 0; k + 1 < len && k < 4096; k += 2) {
    const c = b.u16(at + k)
    if (!c) break
    out += String.fromCharCode(c)
  }
  return out
}

/** an OfficeArt color (0x00BBGGRR) → hex */
function rgb(v: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0').toUpperCase()
  return h(v & 0xff) + h((v >> 8) & 0xff) + h((v >> 16) & 0xff)
}

/** a floating shape's anchor (FSPA) */
export interface Fspa {
  spid: number
  l: number
  t: number
  r: number
  b: number
  /** horizontal position relative to: 0 margin, 1 page, 2 column */
  bx: number
  /** vertical position relative to: 0 margin, 1 page, 2 paragraph */
  by: number
  /** wrapping: 0/2 square, 1 top and bottom, 3 none, 4 tight, 5 through */
  wr: number
  wrk: number
  below: boolean
}

export function readFspa(b: Bytes, o: number): Fspa {
  const f = b.u16(o + 20)
  return { spid: b.u32(o), l: b.i32(o + 4), t: b.i32(o + 8), r: b.i32(o + 12), b: b.i32(o + 16), bx: (f >> 1) & 3, by: (f >> 3) & 3, wr: (f >> 5) & 0xf, wrk: (f >> 9) & 0xf, below: !!(f & 0x4000) }
}

/** zlib data → bytes (undefined when it does not inflate) */
export async function inflate(data: Uint8Array): Promise<Uint8Array | undefined> {
  try {
    const ds = new DecompressionStream('deflate')
    const out = new Response(new Blob([data as Uint8Array]).stream().pipeThrough(ds as unknown as TransformStream<Uint8Array, Uint8Array>))
    return new Uint8Array(await out.arrayBuffer())
  } catch {
    return undefined
  }
}

/** the bytes of an image file: metafiles inflated, Windows metafiles with a placeable header */
export async function imageBytes(blip: Blip): Promise<Uint8Array> {
  let data = blip.data
  if (blip.deflated) data = (await inflate(data)) ?? data
  const bd = blip.bounds
  if (blip.ext === 'wmf' && bd && bd.r > bd.l && bd.b > bd.t) {
    const inches = bd.cx > 0 ? bd.cx / 914400 : (bd.r - bd.l) / 1440
    data = placeable(data, 0, 0, bd, inches > 0 ? (bd.r - bd.l) / inches : 1440)
  }
  return data
}
