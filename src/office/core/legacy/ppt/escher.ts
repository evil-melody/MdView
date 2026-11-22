/**
 * OfficeArt drawings ([MS-ODRAW]): shape property tables (FOPT) with their master shape's as fallback,
 * colors (OfficeArtCOLORREF), the picture store (BStore → FBSE → BLIP, embedded or in the Pictures stream),
 * preset shape types and freeform paths (vertices and segments).
 */
import { Rec, RT } from './records'

/** property ids */
export const P = {
  rotation: 0x0004,
  lTxid: 0x0080,
  dxTextLeft: 0x0081,
  dyTextTop: 0x0082,
  dxTextRight: 0x0083,
  dyTextBottom: 0x0084,
  wrapText: 0x0085,
  anchorText: 0x0087,
  txflTextFlow: 0x0088,
  textBooleans: 0x00bf,
  gtextUNICODE: 0x00c0,
  gtextFont: 0x00c5,
  cropFromTop: 0x0100,
  cropFromBottom: 0x0101,
  cropFromLeft: 0x0102,
  cropFromRight: 0x0103,
  pib: 0x0104,
  geoLeft: 0x0140,
  geoTop: 0x0141,
  geoRight: 0x0142,
  geoBottom: 0x0143,
  pVertices: 0x0145,
  pSegmentInfo: 0x0146,
  adjustValue: 0x0147,
  fillType: 0x0180,
  fillColor: 0x0181,
  fillOpacity: 0x0182,
  fillBackColor: 0x0183,
  fillBackOpacity: 0x0184,
  fillBlip: 0x0186,
  fillAngle: 0x018b,
  fillFocus: 0x018c,
  fillShadeColors: 0x0197,
  fillBooleans: 0x01bf,
  lineColor: 0x01c0,
  lineOpacity: 0x01c1,
  lineBackColor: 0x01c2,
  lineWidth: 0x01cb,
  lineStyle: 0x01cd,
  lineDashing: 0x01ce,
  lineStartArrowhead: 0x01d0,
  lineEndArrowhead: 0x01d1,
  lineStartArrowWidth: 0x01d2,
  lineStartArrowLength: 0x01d3,
  lineEndArrowWidth: 0x01d4,
  lineEndArrowLength: 0x01d5,
  lineBooleans: 0x01ff,
  hspMaster: 0x0301,
  shapeName: 0x0380,
  description: 0x0381,
  groupBooleans: 0x03bf,
} as const

/** properties whose complex data is an IMsoArray (its stored length may leave out the 6-byte header) */
const ARRAYS = new Set([0x0145, 0x0146, 0x0151, 0x0153, 0x0154, 0x0155, 0x0156, 0x0157, 0x0158, 0x0197, 0x01cf, 0x0383])

interface Prop {
  value: number
  complex?: Uint8Array
}

/** reads an OfficeArtFOPT (or secondary / tertiary FOPT) into a property map */
export function readFopt(r: Rec, into = new Map<number, Prop>()): Map<number, Prop> {
  const n = Math.min(r.inst, Math.floor(r.len / 6))
  let c = n * 6
  for (let i = 0; i < n; i++) {
    const opid = r.u16(i * 6)
    const op = r.u32(i * 6 + 2)
    const pid = opid & 0x3fff
    const p: Prop = { value: op }
    if (opid & 0x8000) {
      let size = op
      if (ARRAYS.has(pid) && size && c + 6 <= r.len) {
        const elems = r.u16(c)
        const raw = r.i16(c + 4)
        const elem = raw < 0 ? -raw >> 2 : raw
        if (elems * elem === size) size += 6
      }
      size = Math.max(0, Math.min(size, r.len - c))
      p.complex = r.bytes(c, size)
      c += size
    }
    if (!into.has(pid)) into.set(pid, p)
  }
  return into
}

/** A shape's properties, falling back to its master shape's (placeholders and shapes that follow a master shape). */
export class Props {
  constructor(
    readonly own: Map<number, Prop>,
    readonly master?: Props,
    private depth = 0,
  ) {}

  has(pid: number): boolean {
    return this.own.has(pid) || (this.depth < 4 && !!this.master?.has(pid))
  }

  get(pid: number): number | undefined {
    const p = this.own.get(pid)
    if (p) return p.value
    return this.depth < 4 ? this.master?.get(pid) : undefined
  }

  num(pid: number, def: number): number {
    return this.get(pid) ?? def
  }

  /** signed 32-bit */
  int(pid: number, def: number): number {
    const v = this.get(pid)
    return v === undefined ? def : v | 0
  }

  /** a 16.16 fixed-point value */
  fixed(pid: number, def: number): number {
    const v = this.get(pid)
    return v === undefined ? def : (v | 0) / 65536
  }

  complex(pid: number): Uint8Array | undefined {
    const p = this.own.get(pid)
    if (p) return p.complex
    return this.depth < 4 ? this.master?.complex(pid) : undefined
  }

  /** a UTF-16 string property */
  str(pid: number): string | undefined {
    const b = this.complex(pid)
    if (!b) return undefined
    let s = ''
    for (let i = 0; i + 1 < b.length; i += 2) {
      const ch = b[i] | (b[i + 1] << 8)
      if (!ch) break
      s += String.fromCharCode(ch)
    }
    return s
  }

  /**
   * A bit of a boolean property set: bit `bit` with its "use" bit at `bit + 16`. Writers that set no use bits at
   * all store plain values.
   */
  flag(pid: number, bit: number, def: boolean): boolean {
    const p = this.own.get(pid)
    if (p) {
      const v = p.value
      if (!(v >>> 16)) return !!(v & (1 << bit))
      if (v & (1 << (bit + 16))) return !!(v & (1 << bit))
    }
    return this.depth < 4 && this.master ? this.master.flag(pid, bit, def) : def
  }

  /** these properties over a master shape's */
  over(master: Props | undefined): Props {
    return new Props(this.own, master, this.depth + 1)
  }
}

/** an IMsoArray: its elements as byte slices */
export function msoArray(b: Uint8Array | undefined): Uint8Array[] {
  if (!b || b.length < 6) return []
  const n = b[0] | (b[1] << 8)
  const raw = ((b[4] | (b[5] << 8)) << 16) >> 16
  const size = raw < 0 ? -raw >> 2 : raw
  if (!size) return []
  const out: Uint8Array[] = []
  for (let i = 0; i < n && 6 + (i + 1) * size <= b.length; i++) out.push(b.subarray(6 + i * size, 6 + (i + 1) * size))
  return out
}

// ---------------------------------------------------------------- colors

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase()
export const rgbHex = (r: number, g: number, b: number) => hex2(r) + hex2(g) + hex2(b)

/** Windows system colors (GetSysColor indexes) */
const SYS: Record<number, string> = {
  0: 'C0C0C0', 1: '008080', 2: '000080', 3: '808080', 4: 'C0C0C0', 5: 'FFFFFF', 6: '000000', 7: '000000', 8: '000000', 9: 'FFFFFF',
  10: 'C0C0C0', 11: 'C0C0C0', 12: '808080', 13: '000080', 14: 'FFFFFF', 15: 'C0C0C0', 16: '808080', 17: '808080', 18: '000000',
  19: 'C0C0C0', 20: 'FFFFFF', 21: '000000', 22: 'DFDFDF', 23: '000000', 24: 'FFFFE1',
}

/** colors a scheme-relative color can refer to (the shape's own fill and line colors) */
export interface ColorCtx {
  /** the slide's color scheme: background, text, shadow, title, fill, accent, hyperlink, followed hyperlink */
  scheme: string[]
  fill?: string
  line?: string
  fillBack?: string
  lineBack?: string
  shadow?: string
}

/** OfficeArtCOLORREF → RRGGBB */
export function colorRef(v: number | undefined, ctx: ColorCtx): string | undefined {
  if (v === undefined) return undefined
  const r = v & 0xff
  const g = (v >>> 8) & 0xff
  const b = (v >>> 16) & 0xff
  const flags = v >>> 24
  if (flags & 0x08) return ctx.scheme[r] ?? ctx.scheme[1]
  if (flags & 0x10) {
    // a system or shape-relative color, modified
    const idx = v & 0xffff
    let base: string | undefined
    if (r >= 0xf0) {
      base = [ctx.fill, ctx.line ?? ctx.fill, ctx.line, ctx.shadow, ctx.fill, ctx.fillBack, ctx.lineBack, ctx.fill ?? ctx.line][r - 0xf0]
      base ??= r === 0xf2 || r === 0xf1 ? '000000' : 'FFFFFF'
    } else base = SYS[idx & 0xff] ?? '000000'
    return modify(base, g, b)
  }
  return rgbHex(r, g, b)
}

/** sysIndex color functions: darken, lighten, add / subtract gray, threshold; invert */
function modify(base: string, param: number, fn: number): string {
  const c = [0, 2, 4].map((i) => parseInt(base.slice(i, i + 2), 16))
  const out = c.map((x) => {
    switch (fn & 0x0f) {
      case 1:
        return (x * param) / 255
      case 2:
        return 255 - ((255 - x) * param) / 255
      case 3:
        return x + param
      case 4:
        return x - param
      case 5:
        return param - x
      case 6:
        return x < param ? 0 : 255
      default:
        return x
    }
  })
  const inv = out.map((x) => (fn & 0x20 ? 255 - x : fn & 0x40 ? x ^ 0x80 : x))
  return rgbHex(inv[0], inv[1], inv[2])
}

// ---------------------------------------------------------------- pictures

export interface Blip {
  ext: string
  data: Uint8Array
}

const BLIP_FIRST = 0xf018
const BLIP_LAST = 0xf117

/** The picture store: FBSE entries of the drawing group, their BLIPs embedded or in the Pictures stream. */
export class BlipStore {
  private entries: Rec[] = []
  private cache = new Map<number, Promise<Blip | undefined>>()

  constructor(
    dgg: Rec | undefined,
    private pictures: Uint8Array | undefined,
  ) {
    const store = dgg?.kid(RT.BStoreContainer)
    if (store) this.entries = store.kids()
  }

  /** the picture of a 1-based BLIP index */
  get(pib: number | undefined): Promise<Blip | undefined> {
    if (!pib || pib < 1 || pib > this.entries.length) return Promise.resolve(undefined)
    let p = this.cache.get(pib)
    if (!p) {
      p = this.load(this.entries[pib - 1]).catch(() => undefined)
      this.cache.set(pib, p)
    }
    return p
  }

  private async load(e: Rec): Promise<Blip | undefined> {
    if (e.type >= BLIP_FIRST && e.type <= BLIP_LAST) return blipOf(e)
    if (e.type !== RT.FBSE) return undefined
    const nameLen = e.u8(33)
    const at = 36 + nameLen
    if (e.len >= at + 8) {
      const inner = Rec.at(e.buf, e.start + at, e.end)
      if (inner && inner.type >= BLIP_FIRST && inner.type <= BLIP_LAST) return blipOf(inner)
    }
    const off = e.u32(28)
    if (!this.pictures || !e.u32(20)) return undefined
    const r = Rec.at(this.pictures, off)
    return r && r.type >= BLIP_FIRST && r.type <= BLIP_LAST ? blipOf(r) : undefined
  }
}

/** an OfficeArtBlip record → image bytes */
async function blipOf(r: Rec): Promise<Blip | undefined> {
  const uids = r.inst & 1 ? 32 : 16
  switch (r.type) {
    case 0xf01a:
    case 0xf01b: {
      const h = uids
      const size = r.u32(h)
      const saved = r.u32(h + 28)
      const compressed = r.u8(h + 32) === 0
      let data = r.bytes(h + 34, saved || r.len)
      if (compressed) data = await inflate(data, size)
      if (r.type === 0xf01b) return { ext: 'wmf', data: placeable(data, r, h) }
      return { ext: 'emf', data }
    }
    case 0xf01d:
    case 0xf02a:
      return { ext: 'jpg', data: r.bytes(uids + 1) }
    case 0xf01e:
      return { ext: 'png', data: r.bytes(uids + 1) }
    case 0xf01f:
      return bmp(r.bytes(uids + 1))
    case 0xf029:
      return { ext: 'tiff', data: r.bytes(uids + 1) }
  }
  return undefined
}

async function inflate(data: Uint8Array, size: number): Promise<Uint8Array> {
  for (const format of ['deflate', 'deflate-raw'] as const) {
    try {
      const out = await new Response(new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream(format))).arrayBuffer()
      if (out.byteLength) return new Uint8Array(out, 0, size && size < out.byteLength ? size : out.byteLength)
    } catch {
      // try the next format
    }
  }
  return data
}

/** a WMF without its placeable header gets one (from the BLIP's bounds and size) */
function placeable(data: Uint8Array, r: Rec, h: number): Uint8Array {
  if (data.length >= 4 && data[0] === 0xd7 && data[1] === 0xcd && data[2] === 0xc6 && data[3] === 0x9a) return data
  const [left, top, right, bottom] = [r.i32(h + 4), r.i32(h + 8), r.i32(h + 12), r.i32(h + 16)]
  const emuW = r.i32(h + 20)
  const inch = emuW > 0 && right > left ? Math.max(1, Math.min(0xffff, Math.round(((right - left) * 914400) / emuW))) : 1440
  const head = new Uint8Array(22)
  const dv = new DataView(head.buffer)
  dv.setUint32(0, 0x9ac6cdd7, true)
  dv.setInt16(6, left, true)
  dv.setInt16(8, top, true)
  dv.setInt16(10, right, true)
  dv.setInt16(12, bottom, true)
  dv.setUint16(14, inch, true)
  let sum = 0
  for (let i = 0; i < 20; i += 2) sum ^= dv.getUint16(i, true)
  dv.setUint16(20, sum, true)
  const out = new Uint8Array(22 + data.length)
  out.set(head)
  out.set(data, 22)
  return out
}

/** a DIB (BITMAPINFOHEADER + pixels) as a .bmp file */
function bmp(dib: Uint8Array): Blip | undefined {
  if (dib.length < 16) return undefined
  const dv = new DataView(dib.buffer, dib.byteOffset, dib.byteLength)
  const hsize = dv.getUint32(0, true)
  if (hsize < 12 || hsize > dib.length) return undefined
  const bits = hsize === 12 ? dv.getUint16(10, true) : dv.getUint16(14, true)
  const compression = hsize >= 20 ? dv.getUint32(16, true) : 0
  const used = hsize >= 36 ? dv.getUint32(32, true) : 0
  const colors = used || (bits <= 8 ? 1 << bits : 0)
  const masks = compression === 3 && hsize === 40 ? 12 : 0
  const out = new Uint8Array(14 + dib.length)
  const ov = new DataView(out.buffer)
  out[0] = 0x42
  out[1] = 0x4d
  ov.setUint32(2, out.length, true)
  ov.setUint32(10, Math.min(out.length, 14 + hsize + colors * (hsize === 12 ? 3 : 4) + masks), true)
  out.set(dib, 14)
  return { ext: 'bmp', data: out }
}

/** a two-color pattern bitmap (1 bit per pixel) recolored with the fill's colors, as a 24-bit .bmp */
export function patternBmp(blip: Blip | undefined, fore: string, back: string): Uint8Array | undefined {
  const b = blip?.ext === 'bmp' ? blip.data : undefined
  if (!b || b.length < 62) return undefined
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const w = dv.getInt32(18, true)
  const rawH = dv.getInt32(22, true)
  const h = Math.abs(rawH)
  if (dv.getUint16(28, true) !== 1 || w <= 0 || h <= 0 || w > 64 || h > 64) return undefined
  const lum = (k: number) => b[54 + k * 4] * 0.11 + b[55 + k * 4] * 0.59 + b[56 + k * 4] * 0.3
  // the darker palette entry is the foreground
  const foreBit = lum(0) <= lum(1) ? 0 : 1
  const rgb = (hex: string) => [parseInt(hex.slice(4, 6), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(0, 2), 16)]
  const [f, g] = [rgb(fore), rgb(back)]
  const src = dv.getUint32(10, true)
  const inStride = ((w + 31) >> 5) * 4
  const outStride = (w * 3 + 3) & ~3
  if (src + inStride * h > b.length) return undefined
  const out = new Uint8Array(54 + outStride * h)
  const ov = new DataView(out.buffer)
  out[0] = 0x42
  out[1] = 0x4d
  ov.setUint32(2, out.length, true)
  ov.setUint32(10, 54, true)
  ov.setUint32(14, 40, true)
  ov.setInt32(18, w, true)
  ov.setInt32(22, rawH, true)
  ov.setUint16(26, 1, true)
  ov.setUint16(28, 24, true)
  ov.setUint32(34, outStride * h, true)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bit = (b[src + y * inStride + (x >> 3)] >> (7 - (x & 7))) & 1
      out.set(bit === foreBit ? f : g, 54 + y * outStride + x * 3)
    }
  }
  return out
}

// ---------------------------------------------------------------- shape types

/** MSOSPT shape type → DrawingML preset geometry */
const PRESETS: Record<number, string> = {
  1: 'rect', 2: 'roundRect', 3: 'ellipse', 4: 'diamond', 5: 'triangle', 6: 'rtTriangle', 7: 'parallelogram', 8: 'trapezoid', 9: 'hexagon',
  10: 'octagon', 11: 'plus', 12: 'star5', 13: 'rightArrow', 14: 'rightArrow', 15: 'homePlate', 16: 'cube', 17: 'wedgeRoundRectCallout',
  18: 'star16', 19: 'arc', 20: 'line', 21: 'plaque', 22: 'can', 23: 'donut', 32: 'straightConnector1', 33: 'bentConnector2',
  34: 'bentConnector3', 35: 'bentConnector4', 36: 'bentConnector5', 37: 'curvedConnector2', 38: 'curvedConnector3', 39: 'curvedConnector4',
  40: 'curvedConnector5', 41: 'callout1', 42: 'callout2', 43: 'callout3', 44: 'accentCallout1', 45: 'accentCallout2', 46: 'accentCallout3',
  47: 'borderCallout1', 48: 'borderCallout2', 49: 'borderCallout3', 50: 'accentBorderCallout1', 51: 'accentBorderCallout2',
  52: 'accentBorderCallout3', 53: 'ribbon', 54: 'ribbon2', 55: 'chevron', 56: 'pentagon', 57: 'noSmoking', 58: 'star8', 59: 'star16',
  60: 'star32', 61: 'wedgeRectCallout', 62: 'wedgeRoundRectCallout', 63: 'wedgeEllipseCallout', 64: 'wave', 65: 'foldedCorner',
  66: 'leftArrow', 67: 'downArrow', 68: 'upArrow', 69: 'leftRightArrow', 70: 'upDownArrow', 71: 'irregularSeal1', 72: 'irregularSeal2',
  73: 'lightningBolt', 74: 'heart', 75: 'rect', 76: 'quadArrow', 77: 'leftArrowCallout', 78: 'rightArrowCallout', 79: 'upArrowCallout',
  80: 'downArrowCallout', 81: 'leftRightArrowCallout', 82: 'upDownArrowCallout', 83: 'quadArrowCallout', 84: 'bevel', 85: 'leftBracket',
  86: 'rightBracket', 87: 'leftBrace', 88: 'rightBrace', 89: 'leftUpArrow', 90: 'bentUpArrow', 91: 'bentArrow', 92: 'star24',
  93: 'stripedRightArrow', 94: 'notchedRightArrow', 95: 'blockArc', 96: 'smileyFace', 97: 'verticalScroll', 98: 'horizontalScroll',
  99: 'circularArrow', 100: 'circularArrow', 101: 'uturnArrow', 102: 'curvedRightArrow', 103: 'curvedLeftArrow', 104: 'curvedUpArrow',
  105: 'curvedDownArrow', 106: 'cloudCallout', 107: 'ellipseRibbon', 108: 'ellipseRibbon2', 109: 'flowChartProcess',
  110: 'flowChartDecision', 111: 'flowChartInputOutput', 112: 'flowChartPredefinedProcess', 113: 'flowChartInternalStorage',
  114: 'flowChartDocument', 115: 'flowChartMultidocument', 116: 'flowChartTerminator', 117: 'flowChartPreparation',
  118: 'flowChartManualInput', 119: 'flowChartManualOperation', 120: 'flowChartConnector', 121: 'flowChartPunchedCard',
  122: 'flowChartPunchedTape', 123: 'flowChartSummingJunction', 124: 'flowChartOr', 125: 'flowChartCollate', 126: 'flowChartSort',
  127: 'flowChartExtract', 128: 'flowChartMerge', 129: 'flowChartOfflineStorage', 130: 'flowChartOnlineStorage',
  131: 'flowChartMagneticTape', 132: 'flowChartMagneticDisk', 133: 'flowChartMagneticDrum', 134: 'flowChartDisplay', 135: 'flowChartDelay',
  176: 'flowChartAlternateProcess', 177: 'flowChartOffpageConnector', 178: 'callout1', 179: 'accentCallout1', 180: 'borderCallout1',
  181: 'accentBorderCallout1', 182: 'leftRightUpArrow', 183: 'sun', 184: 'moon', 185: 'bracketPair', 186: 'bracePair', 187: 'star4',
  188: 'doubleWave', 189: 'actionButtonBlank', 190: 'actionButtonHome', 191: 'actionButtonHelp', 192: 'actionButtonInformation',
  193: 'actionButtonForwardNext', 194: 'actionButtonBackPrevious', 195: 'actionButtonEnd', 196: 'actionButtonBeginning',
  197: 'actionButtonReturn', 198: 'actionButtonDocument', 199: 'actionButtonSound', 200: 'actionButtonMovie', 202: 'rect',
}

/** the preset geometry of a shape type (WordArt and unknown types: a rectangle) */
export const presetOf = (spt: number): string => PRESETS[spt] ?? 'rect'

/** shape types drawn as lines (connectors) */
export const isLineType = (spt: number) => spt === 20 || (spt >= 32 && spt <= 40)

/**
 * Adjust values (in the shape's 21600 coordinate space) → DrawingML guide values, for the presets whose meaning maps
 * directly; others keep their defaults.
 */
export function adjustments(spt: number, props: Props, w: number, h: number): string {
  const adj = (i: number) => props.get(P.adjustValue + i)
  const gd = (name: string, v: number) => `<a:gd name="${name}" fmla="val ${Math.round(v)}"/>`
  const ss = Math.max(1, Math.min(w, h))
  const a = adj(0)
  switch (spt) {
    case 2:
    case 176:
      return a === undefined ? '' : gd('adj', Math.max(0, Math.min(50000, ((a | 0) / 21600) * 100000)))
    case 5:
      return a === undefined ? '' : gd('adj', Math.max(0, Math.min(100000, ((a | 0) / 21600) * 100000)))
    case 13:
    case 14:
    case 66: {
      // head length (x of the head's base) and shaft (y of its top edge)
      const head = adj(0)
      const shaft = adj(1)
      let out = ''
      if (shaft !== undefined) out += gd('adj1', Math.max(0, Math.min(100000, ((21600 - 2 * (shaft | 0)) / 21600) * 100000)))
      else out += gd('adj1', 50000)
      if (head !== undefined) {
        const len = spt === 66 ? head | 0 : 21600 - (head | 0)
        out += gd('adj2', Math.max(0, ((len / 21600) * w * 100000) / ss))
      }
      return out
    }
    case 67:
    case 68: {
      const head = adj(0)
      const shaft = adj(1)
      let out = ''
      if (shaft !== undefined) out += gd('adj1', Math.max(0, Math.min(100000, ((21600 - 2 * (shaft | 0)) / 21600) * 100000)))
      else out += gd('adj1', 50000)
      if (head !== undefined) {
        const len = spt === 68 ? head | 0 : 21600 - (head | 0)
        out += gd('adj2', Math.max(0, ((len / 21600) * h * 100000) / ss))
      }
      return out
    }
  }
  return ''
}

/**
 * An arc (shape type 19): part of an ellipse from the start to the end angle (clockwise degrees, adjust values 1
 * and 2). Its frame is the box of the arc itself, not of the whole ellipse, so the path is written in that box.
 */
export function arcPath(props: Props, filled: boolean): string {
  const angle = (pid: number, def: number) => {
    const v = props.get(pid)
    const a = v === undefined ? def : (v | 0) / 65536
    return ((a % 360) + 360) % 360
  }
  const st = angle(P.adjustValue, 270)
  const en = angle(P.adjustValue + 1, 0)
  let sweep = (en - st + 360) % 360
  if (sweep < 1e-6) sweep = 360
  const R = 21600
  const at = (deg: number): [number, number] => [R * Math.cos((deg * Math.PI) / 180), R * Math.sin((deg * Math.PI) / 180)]
  const pts = [at(st), at(st + sweep)]
  for (let k = Math.ceil(st / 90) * 90; k < st + sweep; k += 90) pts.push(at(k))
  const minX = Math.min(...pts.map((p) => p[0]))
  const minY = Math.min(...pts.map((p) => p[1]))
  const w = Math.max(1, Math.round(Math.max(...pts.map((p) => p[0])) - minX))
  const h = Math.max(1, Math.round(Math.max(...pts.map((p) => p[1])) - minY))
  const pt = (p: [number, number]) => `<a:pt x="${Math.round(p[0] - minX)}" y="${Math.round(p[1] - minY)}"/>`
  const arc = `<a:moveTo>${pt(pts[0])}</a:moveTo><a:arcTo wR="${R}" hR="${R}" stAng="${Math.round(st * 60000)}" swAng="${Math.round(sweep * 60000)}"/>`
  const line = `<a:path w="${w}" h="${h}" fill="none">${arc}</a:path>`
  const pie = filled ? `<a:path w="${w}" h="${h}" stroke="0">${arc}<a:lnTo>${pt([0, 0])}</a:lnTo><a:close/></a:path>` : ''
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst>${pie}${line}</a:pathLst></a:custGeom>`
}

/** a freeform: vertices and segments (in the geometry's coordinate space) → custGeom path commands */
export function freeformPath(props: Props): { d: string; w: number; h: number; closed: boolean } | undefined {
  const verts = msoArray(props.complex(P.pVertices)).map((e) => (e.length >= 8 ? [i32(e, 0), i32(e, 4)] : [i16(e, 0), i16(e, 2)]))
  if (!verts.length) return undefined
  const left = props.int(P.geoLeft, 0)
  const top = props.int(P.geoTop, 0)
  const w = Math.max(1, props.int(P.geoRight, 21600) - left)
  const h = Math.max(1, props.int(P.geoBottom, 21600) - top)
  const pt = (k: number) => {
    const v = verts[Math.min(k, verts.length - 1)]
    return `<a:pt x="${clampCoord(v[0] - left)}" y="${clampCoord(v[1] - top)}"/>`
  }
  let segs = msoArray(props.complex(P.pSegmentInfo)).map((e) => e[0] | (e[1] << 8))
  if (!segs.length) segs = [0x4000, 0x2000 | (verts.length - 1), 0x8000]
  let d = ''
  let k = 0
  let closed = false
  for (const s of segs) {
    if (k >= verts.length && (s >> 13) !== 3 && (s >> 13) !== 4) break
    const type = s >> 13
    const count = s & 0x1fff
    switch (type) {
      case 0: // lineTo
        for (let i = 0; i < Math.max(1, count) && k < verts.length; i++) d += `<a:lnTo>${pt(k++)}</a:lnTo>`
        break
      case 1: // curveTo
        for (let i = 0; i < Math.max(1, count) && k + 2 < verts.length; i++) {
          d += `<a:cubicBezTo>${pt(k)}${pt(k + 1)}${pt(k + 2)}</a:cubicBezTo>`
          k += 3
        }
        break
      case 2: // moveTo
        d += `<a:moveTo>${pt(k++)}</a:moveTo>`
        break
      case 3: // close
        d += '<a:close/>'
        closed = true
        break
      case 4: // end
        break
      case 5: {
        // escapes: some consume vertices
        const esc = (s >> 8) & 0x1f
        const n = s & 0xff
        if (esc === 0x09) {
          // quadratic Bézier
          for (let i = 0; i < Math.max(1, n / 2) && k + 1 < verts.length; i++) {
            d += `<a:quadBezTo>${pt(k)}${pt(k + 1)}</a:quadBezTo>`
            k += 2
          }
        } else k += n
        break
      }
    }
  }
  if (!d.startsWith('<a:moveTo>')) d = `<a:moveTo>${pt(0)}</a:moveTo>` + d
  return { d, w, h, closed }
}

const clampCoord = (v: number) => Math.max(-27273042, Math.min(27273042, Math.round(v)))
const i16 = (b: Uint8Array, k: number) => ((b[k] | (b[k + 1] << 8)) << 16) >> 16
const i32 = (b: Uint8Array, k: number) => b[k] | (b[k + 1] << 8) | (b[k + 2] << 16) | (b[k + 3] << 24)
