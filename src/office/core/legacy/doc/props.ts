/**
 * Character, paragraph, table and section properties of a Word binary document, and the property modifiers
 * (sprms) that build them: a style's or a run's list of sprms applied in order onto the properties it is based on.
 */
import { Bytes } from './bin'

// ---------------------------------------------------------------- values

/** a border: line type, width (eighths of a point), color (hex or "auto"), space (pt); null = no border */
export type Brc = { t: number; w: number; c: string; sp: number; sh: boolean } | null

/** color indices (ico) */
export const ICO = ['auto', '000000', '0000FF', '00FFFF', '00FF00', 'FF00FF', 'FF0000', 'FFFF00', 'FFFFFF', '000080', '008080', '008000', '800080', '800000', '808000', '808080', 'C0C0C0']

const hex2 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase()

/** COLORREF (red, green, blue, fAuto) */
export function cv(b: Bytes, o: number): string {
  if (b.u8(o + 3) === 0xff) return 'auto'
  return hex2(b.u8(o)) + hex2(b.u8(o + 1)) + hex2(b.u8(o + 2))
}

const ico = (n: number) => ICO[n] ?? 'auto'

/** Brc80 (4 bytes): width, type, ico, space / shadow */
export function brc80(b: Bytes, o: number): Brc {
  if (b.u32(o) === 0xffffffff) return null
  const t = b.u8(o + 1)
  if (t === 0 || t === 0xff) return null
  return { w: b.u8(o), t, c: ico(b.u8(o + 2)), sp: b.u8(o + 3) & 0x1f, sh: !!(b.u8(o + 3) & 0x20) }
}

/** Brc (8 bytes): COLORREF, width, type, space / shadow */
export function brc(b: Bytes, o: number): Brc {
  const t = b.u8(o + 5)
  if (t === 0 || t === 0xff) return null
  return { c: cv(b, o), w: b.u8(o + 4), t, sp: b.u8(o + 6) & 0x1f, sh: !!(b.u8(o + 6) & 0x20) }
}

/** shading percentages of the ipat patterns */
const PCT: Record<number, number> = { 2: 5, 3: 10, 4: 20, 5: 25, 6: 30, 7: 40, 8: 50, 9: 60, 10: 70, 11: 75, 12: 80, 13: 90, 35: 2.5, 36: 7.5, 37: 12.5, 38: 15, 39: 17.5, 40: 22.5, 41: 27.5, 42: 32.5, 43: 35, 44: 37.5, 45: 42.5, 46: 45, 47: 47.5, 48: 52.5, 49: 55, 50: 57.5, 51: 62.5, 52: 65, 53: 67.5, 54: 72.5, 55: 77.5, 56: 82.5, 57: 85, 58: 87.5, 59: 92.5, 60: 95, 61: 97.5, 62: 97 }

/** the fill a shading shows ('' = none): patterns blend the foreground into the background */
export function shdFill(fore: string, back: string, ipat: number): string {
  if (ipat === 0) return back === 'auto' ? '' : back
  if (ipat === 0xffff || ipat === 0x3f) return ''
  const f = fore === 'auto' ? '000000' : fore
  if (ipat === 1) return f
  const pct = PCT[ipat] ?? 25
  const bk = back === 'auto' ? 'FFFFFF' : back
  let out = ''
  for (let k = 0; k < 6; k += 2) {
    const x = parseInt(f.slice(k, k + 2), 16)
    const y = parseInt(bk.slice(k, k + 2), 16)
    out += hex2(Math.round(y + ((x - y) * pct) / 100))
  }
  return out
}

/** Shd80 (2 bytes): icoFore, icoBack, ipat */
export const shd80 = (v: number) => shdFill(ico(v & 0x1f), ico((v >> 5) & 0x1f), (v >> 10) & 0x3f)

/** Shd (10 bytes): cvFore, cvBack, ipat */
export const shd = (b: Bytes, o: number) => shdFill(cv(b, o), cv(b, o + 4), b.u16(o + 8))

// ---------------------------------------------------------------- property sets

export interface Chp {
  istd: number
  b: boolean
  i: boolean
  bCs: boolean
  iCs: boolean
  strike: boolean
  dstrike: boolean
  caps: boolean
  smallCaps: boolean
  vanish: boolean
  outline: boolean
  shadow: boolean
  emboss: boolean
  imprint: boolean
  kul: number
  color: string
  hps: number
  hpsBi: number
  /** font indices: ASCII, East Asian, other (high ANSI), complex script */
  f0: number
  f1: number
  f2: number
  fBi: number
  iss: number
  pos: number
  space: number
  kern: number
  scale: number
  hl: number
  shd: string
  brc: Brc
  rtl: boolean
  noProof: boolean
  webHidden: boolean
  specVanish: boolean
  cvUl: string
  kcd: number
  // per-run properties (special characters, revisions)
  spec: boolean
  pic: number
  ole2: boolean
  obj: boolean
  data: boolean
  fldVanish: boolean
  sym: number
  symFtc: number
  rmIns: boolean
  rmDel: boolean
  ibst: number
  dttm: number
  ibstDel: number
  dttmDel: number
}

export const DEFAULT_CHP: Chp = {
  istd: 10, b: false, i: false, bCs: false, iCs: false, strike: false, dstrike: false, caps: false, smallCaps: false, vanish: false,
  outline: false, shadow: false, emboss: false, imprint: false, kul: 0, color: 'auto', hps: 20, hpsBi: 20, f0: 0, f1: 0, f2: 0, fBi: 0,
  iss: 0, pos: 0, space: 0, kern: 0, scale: 100, hl: 0, shd: '', brc: null, rtl: false, noProof: false, webHidden: false, specVanish: false,
  cvUl: 'auto', kcd: 0, spec: false, pic: -1, ole2: false, obj: false, data: false, fldVanish: false, sym: -1, symFtc: 0,
  rmIns: false, rmDel: false, ibst: 0, dttm: 0, ibstDel: 0, dttmDel: 0,
}

/** properties that belong to one run, not to styles */
export const RUN_ONLY: (keyof Chp)[] = ['spec', 'pic', 'ole2', 'obj', 'data', 'fldVanish', 'sym', 'symFtc', 'rmIns', 'rmDel', 'ibst', 'dttm', 'ibstDel', 'dttmDel']

export interface Tab {
  pos: number
  jc: number
  tlc: number
}

export interface Pap {
  istd: number
  jc: number
  keep: boolean
  keepNext: boolean
  pbb: boolean
  widow: boolean
  noLnn: boolean
  noHyph: boolean
  bidi: boolean
  ctxSp: boolean
  mirror: boolean
  left: number
  right: number
  first: number
  before: number
  after: number
  beforeAuto: boolean
  afterAuto: boolean
  line: number
  lineMult: boolean
  inTable: boolean
  ttp: boolean
  itap: number
  innerCell: boolean
  innerTtp: boolean
  ilfo: number
  ilvl: number
  outLvl: number
  tabs: Tab[]
  bTop: Brc
  bLeft: Brc
  bBottom: Brc
  bRight: Brc
  bBetween: Brc
  bBar: Brc
  shd: string
  /** a frame (absolutely positioned paragraph): anchors (sprmPPc), position, size, wrapping, distance from text */
  pc: number
  xAbs: number
  yAbs: number
  wAbs: number
  hAbs: number
  wr: number
  fromX: number
  fromY: number
}

export const DEFAULT_PAP: Pap = {
  istd: 0, jc: 0, keep: false, keepNext: false, pbb: false, widow: false, noLnn: false, noHyph: false, bidi: false, ctxSp: false, mirror: false,
  left: 0, right: 0, first: 0, before: 0, after: 0, beforeAuto: false, afterAuto: false, line: 240, lineMult: true,
  inTable: false, ttp: false, itap: 0, innerCell: false, innerTtp: false, ilfo: 0, ilvl: 0, outLvl: 9, tabs: [],
  bTop: null, bLeft: null, bBottom: null, bRight: null, bBetween: null, bBar: null, shd: '',
  pc: 0, xAbs: 0, yAbs: 0, wAbs: 0, hAbs: 0, wr: 0, fromX: 0, fromY: 0,
}

/** a table cell (TC) */
export interface Tc {
  /** horizontal merge: bit 0 first merged cell, bit 1 merged into the one before */
  hm: number
  /** vertical merge: 0 none, 1 continues the cell above, 3 starts a merge */
  vm: number
  va: number
  vertical: boolean
  brc: (Brc | undefined)[]
  shd?: string
  w?: number
  pad: (number | undefined)[]
}

export interface Tap {
  jc: number
  gapHalf: number
  rowH: number
  cantSplit: boolean
  header: boolean
  bidi: boolean
  centers: number[]
  tc: Tc[]
  /** top, left, bottom, right, insideH, insideV (undefined: not set) */
  brc: (Brc | undefined)[]
  widthFts: number
  width: number
  pad: (number | undefined)[]
  wBefore: number
}

export interface Sep {
  bkc: number
  titlePg: boolean
  w: number
  h: number
  landscape: boolean
  left: number
  right: number
  top: number
  bottom: number
  gutter: number
  hdrTop: number
  hdrBottom: number
  cols: number
  colSpace: number
  evenly: boolean
  colW: Map<number, { w?: number; sp?: number }>
  lBetween: boolean
  pgnStart: number
  pgnRestart: boolean
  nfcPgn: number
  vjc: number
  bidi: boolean
  rtlGutter: boolean
  lnnMod: number
  dxaLnn: number
  lnc: number
  lnnMin: number
  pgBrc: Brc[]
  pgbProp: number
}

export const defaultSep = (): Sep => ({
  bkc: 2, titlePg: false, w: 12240, h: 15840, landscape: false, left: 1800, right: 1800, top: 1440, bottom: 1440, gutter: 0, hdrTop: 720, hdrBottom: 720,
  cols: 1, colSpace: 720, evenly: true, colW: new Map(), lBetween: false, pgnStart: 1, pgnRestart: false, nfcPgn: 0, vjc: 0, bidi: false, rtlGutter: false,
  lnnMod: 0, dxaLnn: 0, lnc: 0, lnnMin: 0, pgBrc: [null, null, null, null], pgbProp: 0,
})

export const emptyTap = (): Tap => ({ jc: 0, gapHalf: 0, rowH: 0, cantSplit: false, header: false, bidi: false, centers: [], tc: [], brc: [], widthFts: 0, width: 0, pad: [], wBefore: 0 })

const newTc = (): Tc => ({ hm: 0, vm: 0, va: 0, vertical: false, brc: [], pad: [] })

// ---------------------------------------------------------------- sprm iteration

/** bytes of a sprm's operand (variable operands include their size field) */
function operandLen(op: number, b: Bytes, p: number): number {
  switch (op >> 13) {
    case 0:
    case 1:
      return 1
    case 2:
    case 4:
    case 5:
      return 2
    case 3:
      return 4
    case 7:
      return 3
    default:
      if (op === 0xd608 || op === 0xd606) return 1 + Math.max(1, b.u16(p))
      if (op === 0xc615) {
        const cb = b.u8(p)
        if (cb !== 255) return 1 + cb
        const del = b.u8(p + 1)
        return 1 + 2 + 4 * del + 3 * b.u8(p + 2 + 4 * del)
      }
      return 1 + b.u8(p)
  }
}

/** Calls `fn` for each sprm of a grpprl (opcode, the bytes, the operand's offset). Stops at a truncated one. */
export function eachSprm(g: Uint8Array, fn: (op: number, b: Bytes, at: number) => void): void {
  const b = new Bytes(g)
  let p = 0
  while (p + 2 <= g.length) {
    const op = b.u16(p)
    p += 2
    const len = operandLen(op, b, p)
    if (p + len > g.length) break
    fn(op, b, p)
    p += len
  }
}

/** the sprm group: 1 paragraph, 2 character, 3 picture, 4 section, 5 table */
export const sgc = (op: number) => (op >> 10) & 7

// ---------------------------------------------------------------- character sprms

function toggle(v: number, style: boolean): boolean {
  if (v === 0x80) return style
  if (v === 0x81) return !style
  return !!(v & 1)
}

export interface ChpContext {
  /** the paragraph style's properties (sprmCPlain) */
  para: Chp
  /** the properties a character style sets */
  charStyle(istd: number): Partial<Chp> | undefined
}

/**
 * Applies the character sprms of a grpprl. `c` may be partial (a style's own properties); `style` holds the values
 * toggles flip (the styles' properties).
 */
export function applyChp(c: Chp, g: Uint8Array, style: Chp, ctx?: ChpContext): void {
  eachSprm(g, (op, b, p) => {
    if (sgc(op) !== 2) return
    switch (op) {
      case 0x0800: c.rmDel = !!b.u8(p); break
      case 0x0801: c.rmIns = !!b.u8(p); break
      case 0x0802: c.fldVanish = !!b.u8(p); break
      case 0x6a03: c.pic = b.u32(p); break
      case 0x4804: c.ibst = b.u16(p); break
      case 0x6805: c.dttm = b.u32(p); break
      case 0x0806: c.data = !!b.u8(p); break
      case 0x6a09: c.symFtc = b.u16(p); c.sym = b.u16(p + 2); break
      case 0x080a: c.ole2 = !!b.u8(p); break
      case 0x2a0c: c.hl = b.u8(p); break
      case 0x0811: c.webHidden = toggle(b.u8(p), style.webHidden); break
      case 0x0818: c.specVanish = !!b.u8(p); break
      case 0x4a30: {
        const istd = b.u16(p)
        c.istd = istd
        const cs = ctx?.charStyle(istd)
        if (cs) {
          Object.assign(c, cs)
          if (ctx) style = { ...ctx.para, ...cs }
        }
        break
      }
      case 0x2a33:
        if (ctx) {
          const keep: Partial<Chp> = {}
          for (const k of RUN_ONLY) (keep as Record<string, unknown>)[k] = c[k]
          Object.assign(c, ctx.para, keep)
          style = ctx.para
        }
        break
      case 0x2a34: c.kcd = b.u8(p); break
      case 0x0835: c.b = toggle(b.u8(p), style.b); break
      case 0x0836: c.i = toggle(b.u8(p), style.i); break
      case 0x0837: c.strike = toggle(b.u8(p), style.strike); break
      case 0x0838: c.outline = toggle(b.u8(p), style.outline); break
      case 0x0839: c.shadow = toggle(b.u8(p), style.shadow); break
      case 0x083a: c.smallCaps = toggle(b.u8(p), style.smallCaps); break
      case 0x083b: c.caps = toggle(b.u8(p), style.caps); break
      case 0x083c: c.vanish = toggle(b.u8(p), style.vanish); break
      case 0x2a3e: c.kul = b.u8(p); break
      case 0x8840: c.space = b.i16(p); break
      case 0x2a42: c.color = ico(b.u8(p)); break
      case 0x4a43: c.hps = Math.max(2, b.u16(p)); break
      case 0x2a44: c.hps = Math.max(2, (c.hps ?? 20) + (((b.u8(p) << 24) >> 24) * 2)); break
      case 0x4845: c.pos = b.i16(p); break
      case 0x2a48: c.iss = b.u8(p); break
      case 0x484b: c.kern = b.u16(p); break
      case 0x4a4f: c.f0 = b.u16(p); break
      case 0x4a50: c.f1 = b.u16(p); break
      case 0x4a51: c.f2 = b.u16(p); break
      case 0x4a3d: c.f0 = c.f2 = b.u16(p); break
      case 0x4852: c.scale = b.u16(p); break
      case 0x2a53: c.dstrike = toggle(b.u8(p), style.dstrike); break
      case 0x0854: c.imprint = toggle(b.u8(p), style.imprint); break
      case 0x0855: c.spec = !!b.u8(p); break
      case 0x0856: c.obj = !!b.u8(p); break
      case 0x0858: c.emboss = toggle(b.u8(p), style.emboss); break
      case 0x085a: c.rtl = !!b.u8(p); break
      case 0x085c: c.bCs = toggle(b.u8(p), style.bCs); break
      case 0x085d: c.iCs = toggle(b.u8(p), style.iCs); break
      case 0x4a5e: c.fBi = b.u16(p); break
      case 0x4a61: c.hpsBi = Math.max(2, b.u16(p)); break
      case 0x4863: c.ibstDel = b.u16(p); break
      case 0x6864: c.dttmDel = b.u32(p); break
      case 0x6865: c.brc = brc80(b, p); break
      case 0x4866: c.shd = shd80(b.u16(p)); break
      case 0x6870: c.color = cv(b, p); break
      case 0xca71: c.shd = shd(b, p + 1); break
      case 0xca72: c.brc = brc(b, p + 1); break
      case 0x0875: c.noProof = toggle(b.u8(p), style.noProof); break
      case 0x6877: c.cvUl = cv(b, p); break
    }
  })
}

// ---------------------------------------------------------------- paragraph sprms

/** sprmPChgTabs / sprmPChgTabsPapx: removes and adds tab stops */
function chgTabs(tabs: Tab[], b: Bytes, p: number, close: boolean): Tab[] {
  let q = p + 1
  const nDel = b.u8(q++)
  const del: number[] = []
  for (let k = 0; k < nDel; k++) del.push(b.i16(q + k * 2))
  q += nDel * 2
  const near: number[] = []
  if (close) {
    for (let k = 0; k < nDel; k++) near.push(Math.abs(b.i16(q + k * 2)))
    q += nDel * 2
  }
  const nAdd = b.u8(q++)
  const add: Tab[] = []
  for (let k = 0; k < nAdd; k++) {
    const tbd = b.u8(q + nAdd * 2 + k)
    add.push({ pos: b.i16(q + k * 2), jc: tbd & 7, tlc: (tbd >> 3) & 7 })
  }
  let out = tabs.filter((t) => !del.some((d, k) => Math.abs(t.pos - d) <= (close ? near[k] : 0)))
  out = out.filter((t) => !add.some((a) => a.pos === t.pos))
  return [...out, ...add].sort((x, y) => x.pos - y.pos)
}

/** Applies the paragraph sprms of a grpprl. */
export function applyPap(a: Pap, g: Uint8Array): void {
  eachSprm(g, (op, b, p) => {
    if (sgc(op) !== 1) return
    switch (op) {
      case 0x4600: a.istd = b.u16(p); break
      case 0x2602: a.ilvl = Math.max(0, Math.min(8, a.ilvl + ((b.u8(p) << 24) >> 24))); break
      case 0x2403:
      case 0x2461: a.jc = b.u8(p); break
      case 0x2405: a.keep = !!b.u8(p); break
      case 0x2406: a.keepNext = !!b.u8(p); break
      case 0x2407: a.pbb = !!b.u8(p); break
      case 0x260a: a.ilvl = Math.min(8, b.u8(p)); break
      case 0x460b: a.ilfo = b.i16(p); break
      case 0x240c: a.noLnn = !!b.u8(p); break
      case 0xc60d: a.tabs = chgTabs(a.tabs, b, p, false); break
      case 0xc615: a.tabs = chgTabs(a.tabs, b, p, true); break
      case 0x840e:
      case 0x845d: a.right = b.i16(p); break
      case 0x840f:
      case 0x845e: a.left = b.i16(p); break
      case 0x4610:
      case 0x465f: a.left = Math.max(0, a.left + b.i16(p)); break
      case 0x8411:
      case 0x8460: a.first = b.i16(p); break
      case 0x6412: {
        const v = b.i16(p)
        a.lineMult = !!b.i16(p + 2)
        a.line = a.lineMult ? (v > 0 ? v : 240) : v
        // "at least 0" is single spacing
        if (!a.lineMult && v === 0) {
          a.line = 240
          a.lineMult = true
        }
        break
      }
      case 0xa413: a.before = b.u16(p); break
      case 0xa414: a.after = b.u16(p); break
      case 0x2416: a.inTable = !!b.u8(p); break
      case 0x261b: a.pc = b.u8(p) | 0x100; break
      case 0x8418: a.xAbs = b.i16(p); break
      case 0x8419: a.yAbs = b.i16(p); break
      case 0x841a: a.wAbs = b.i16(p); break
      case 0x442b: a.hAbs = b.u16(p); break
      case 0x2423: a.wr = b.u8(p); break
      case 0x842f: a.fromX = b.i16(p); break
      case 0x842e: a.fromY = b.i16(p); break
      case 0x2417: a.ttp = !!b.u8(p); break
      case 0x6424: a.bTop = brc80(b, p); break
      case 0x6425: a.bLeft = brc80(b, p); break
      case 0x6426: a.bBottom = brc80(b, p); break
      case 0x6427: a.bRight = brc80(b, p); break
      case 0x6428: a.bBetween = brc80(b, p); break
      case 0x6629: a.bBar = brc80(b, p); break
      case 0x242a: a.noHyph = !!b.u8(p); break
      case 0x442d: a.shd = shd80(b.u16(p)); break
      case 0x2431: a.widow = !!b.u8(p); break
      case 0x2640: a.outLvl = b.u8(p); break
      case 0x2441: a.bidi = !!b.u8(p); break
      case 0x6649: a.itap = b.i32(p); break
      case 0x664a: a.itap = Math.max(0, a.itap + b.i32(p)); break
      case 0x244b: a.innerCell = !!b.u8(p); break
      case 0x244c: a.innerTtp = !!b.u8(p); break
      case 0xc64d: a.shd = shd(b, p + 1); break
      case 0xc64e: a.bTop = brc(b, p + 1); break
      case 0xc64f: a.bLeft = brc(b, p + 1); break
      case 0xc650: a.bBottom = brc(b, p + 1); break
      case 0xc651: a.bRight = brc(b, p + 1); break
      case 0xc652: a.bBetween = brc(b, p + 1); break
      case 0xc653: a.bBar = brc(b, p + 1); break
      case 0x245b: a.beforeAuto = !!b.u8(p); break
      case 0x245c: a.afterAuto = !!b.u8(p); break
      case 0x246d: a.ctxSp = !!b.u8(p); break
      case 0x2470: a.mirror = !!b.u8(p); break
    }
  })
}

/** Replaces sprmPHugePapx (a grpprl too long for its page, kept in the Data stream) by that grpprl. */
export function expandHuge(g: Uint8Array, data: Bytes | undefined): Uint8Array {
  let off = -1
  eachSprm(g, (op, b, p) => {
    if (op === 0x6646 || op === 0x6645) off = b.u32(p)
  })
  if (off < 0 || !data) return g
  const cb = data.u16(off)
  return data.sub(off + 2, cb)
}

// ---------------------------------------------------------------- table sprms

/** Applies the table sprms of a row's grpprl (the row-end paragraph's properties). */
export function applyTap(t: Tap, g: Uint8Array): void {
  // cell definitions first: shading and borders address the cells it defines
  const later: [number, Bytes, number][] = []
  let dxaLeft: number | undefined
  eachSprm(g, (op, b, p) => {
    if (sgc(op) !== 5) return
    switch (op) {
      case 0xd608: {
        const n = Math.min(63, b.u8(p + 2))
        const len = b.u16(p) - 1
        t.centers = []
        for (let k = 0; k <= n; k++) t.centers.push(b.i16(p + 3 + k * 2))
        const tcAt = p + 3 + (n + 1) * 2
        const nTc = Math.max(0, Math.min(n, Math.floor((len - 1 - (n + 1) * 2) / 20)))
        t.tc = []
        for (let k = 0; k < n; k++) {
          const tc = newTc()
          if (k < nTc) {
            const o = tcAt + k * 20
            const f = b.u16(o)
            tc.hm = f & 3
            tc.vertical = !!(f & 4)
            tc.vm = (f >> 5) & 3
            tc.va = (f >> 7) & 3
            tc.brc = [0, 1, 2, 3].map((s) => brc80(b, o + 4 + s * 4))
          }
          t.tc.push(tc)
        }
        break
      }
      case 0x5400:
      case 0x548a: t.jc = b.u16(p) & 3; break
      case 0x9601: dxaLeft = b.i16(p); break
      case 0x9602: t.gapHalf = b.i16(p); break
      case 0x3403:
      case 0x3466: t.cantSplit = !!b.u8(p); break
      case 0x3404: t.header = !!b.u8(p); break
      case 0x9407: t.rowH = b.i16(p); break
      case 0x560b:
      case 0x5664: t.bidi = !!b.u16(p); break
      case 0xf614: t.widthFts = b.u8(p); t.width = b.i16(p + 1); break
      case 0xf617: t.wBefore = b.u8(p) === 3 ? b.i16(p + 1) : 0; break
      default: later.push([op, b, p])
    }
  })
  const n = t.tc.length
  const cells = (first: number, lim: number) => t.tc.slice(Math.min(first, n), Math.min(lim, n))
  for (const [op, b, p] of later) {
    switch (op) {
      case 0xd605:
        for (let k = 0; k < 6; k++) t.brc[k] = brc80(b, p + 1 + k * 4)
        break
      case 0xd613:
        for (let k = 0; k < 6; k++) t.brc[k] = brc(b, p + 1 + k * 8)
        break
      case 0xd609: {
        const cnt = Math.floor(b.u8(p) / 2)
        for (let k = 0; k < Math.min(cnt, n); k++) t.tc[k].shd = shd80(b.u16(p + 1 + k * 2))
        break
      }
      case 0xd612:
      case 0xd616:
      case 0xd60c: {
        const start = op === 0xd612 ? 0 : op === 0xd616 ? 22 : 44
        const cnt = Math.floor(b.u8(p) / 10)
        for (let k = 0; k < cnt && start + k < n; k++) t.tc[start + k].shd = shd(b, p + 1 + k * 10)
        break
      }
      case 0xd620:
      case 0xd62f: {
        const flags = b.u8(p + 3)
        const v = op === 0xd620 ? brc80(b, p + 4) : brc(b, p + 4)
        for (const tc of cells(b.u8(p + 1), b.u8(p + 2))) for (let s = 0; s < 4; s++) if (flags & (1 << s)) tc.brc[s] = v
        break
      }
      case 0xd61a:
      case 0xd61b:
      case 0xd61c:
      case 0xd61d: {
        // border colors of each cell (top, left, bottom, right)
        const side = op - 0xd61a
        const cnt = Math.floor(b.u8(p) / 4)
        for (let k = 0; k < Math.min(cnt, n); k++) {
          const v = t.tc[k].brc[side]
          if (v) t.tc[k].brc[side] = { ...v, c: cv(b, p + 1 + k * 4) }
        }
        break
      }
      case 0xd62b: {
        const tc = t.tc[b.u8(p + 1)]
        if (tc) tc.vm = b.u8(p + 2) & 3
        break
      }
      case 0xd62c:
        for (const tc of cells(b.u8(p + 1), b.u8(p + 2))) tc.va = b.u8(p + 3) & 3
        break
      case 0xd62d:
        for (const tc of cells(b.u8(p + 1), b.u8(p + 2))) tc.shd = shd(b, p + 3)
        break
      case 0xd634:
      case 0xd632: {
        if (b.u8(p) !== 6 || b.u8(p + 4) !== 3) break
        const sides = b.u8(p + 3)
        const v = b.u16(p + 5)
        if (op === 0xd634) {
          for (let s = 0; s < 4; s++) if (sides & (1 << s)) t.pad[s] = v
        } else for (const tc of cells(b.u8(p + 1), b.u8(p + 2))) for (let s = 0; s < 4; s++) if (sides & (1 << s)) tc.pad[s] = v
        break
      }
      case 0xd635:
        for (const tc of cells(b.u8(p + 1), b.u8(p + 2))) if (b.u8(p + 3) === 3) tc.w = b.i16(p + 4)
        break
      case 0x7621: {
        // sprmTInsert: ctc new cells of width dxaCol at itcInsert
        const at = b.u8(p)
        const ctc = b.u8(p + 1)
        const w = b.i16(p + 2)
        if (!t.centers.length) t.centers.push(0)
        while (t.tc.length < at) {
          t.tc.push(newTc())
          t.centers.push(t.centers[t.centers.length - 1] + w)
        }
        const x0 = t.centers[at]
        const ins = Array.from({ length: ctc }, (_, k) => x0 + k * w)
        t.centers = [...t.centers.slice(0, at), ...ins, ...t.centers.slice(at).map((x) => x + ctc * w)]
        t.tc.splice(at, 0, ...Array.from({ length: ctc }, newTc))
        break
      }
      case 0x5622: {
        const first = b.u8(p)
        const lim = Math.min(b.u8(p + 1), t.tc.length)
        if (first >= lim) break
        const cut = t.centers[lim] - t.centers[first]
        t.centers = [...t.centers.slice(0, first), ...t.centers.slice(lim).map((x) => x - cut)]
        t.tc.splice(first, lim - first)
        break
      }
      case 0x7623: {
        const first = b.u8(p)
        const lim = Math.min(b.u8(p + 1), t.tc.length)
        const w = b.i16(p + 2)
        for (let k = first; k < lim; k++) {
          const d = w - (t.centers[k + 1] - t.centers[k])
          for (let j = k + 1; j < t.centers.length; j++) t.centers[j] += d
        }
        break
      }
      case 0x5624: {
        const c = cells(b.u8(p), b.u8(p + 1))
        c.forEach((tc, k) => (tc.hm = k ? 2 : 1))
        break
      }
      case 0x5625:
        for (const tc of cells(b.u8(p), b.u8(p + 1))) tc.hm = 0
        break
    }
  }
  if (dxaLeft !== undefined && t.centers.length) {
    const d = dxaLeft - (t.centers[0] + t.gapHalf)
    t.centers = t.centers.map((x) => x + d)
  }
}

// ---------------------------------------------------------------- section sprms

/** Applies the section sprms of a SEPX grpprl. */
export function applySep(s: Sep, g: Uint8Array): void {
  eachSprm(g, (op, b, p) => {
    if (sgc(op) !== 4) return
    switch (op) {
      case 0xf203: {
        const k = b.u8(p)
        s.colW.set(k, { ...s.colW.get(k), w: b.u16(p + 1) })
        break
      }
      case 0xf204: {
        const k = b.u8(p)
        s.colW.set(k, { ...s.colW.get(k), sp: b.u16(p + 1) })
        break
      }
      case 0x3005: s.evenly = !!b.u8(p); break
      case 0x3009: s.bkc = b.u8(p); break
      case 0x300a: s.titlePg = !!b.u8(p); break
      case 0x500b: s.cols = Math.max(1, Math.min(45, b.u16(p) + 1)); break
      case 0x900c: s.colSpace = Math.max(0, b.i16(p)); break
      case 0x300e: s.nfcPgn = b.u8(p); break
      case 0x3011: s.pgnRestart = !!b.u8(p); break
      case 0x3013: s.lnc = b.u8(p); break
      case 0x5015: s.lnnMod = b.u16(p); break
      case 0x9016: s.dxaLnn = b.i16(p); break
      case 0xb017: s.hdrTop = b.u16(p); break
      case 0xb018: s.hdrBottom = b.u16(p); break
      case 0x3019: s.lBetween = !!b.u8(p); break
      case 0x301a: s.vjc = b.u8(p); break
      case 0x501b: s.lnnMin = b.u16(p); break
      case 0x501c: s.pgnStart = b.u16(p); break
      case 0x7044: s.pgnStart = b.u32(p); break
      case 0x301d: s.landscape = b.u8(p) === 2; break
      case 0xb01f: s.w = b.u16(p); break
      case 0xb020: s.h = b.u16(p); break
      case 0xb021: s.left = b.u16(p); break
      case 0xb022: s.right = b.u16(p); break
      case 0x9023: s.top = b.i16(p); break
      case 0x9024: s.bottom = b.i16(p); break
      case 0xb025: s.gutter = b.u16(p); break
      case 0x3228: s.bidi = !!b.u8(p); break
      case 0x322a: s.rtlGutter = !!b.u8(p); break
      case 0x702b:
      case 0x702c:
      case 0x702d:
      case 0x702e: s.pgBrc[op - 0x702b] = brc80(b, p); break
      case 0xd234:
      case 0xd235:
      case 0xd236:
      case 0xd237: s.pgBrc[op - 0xd234] = brc(b, p + 1); break
      case 0x522f: s.pgbProp = b.u16(p); break
    }
  })
}

/** Prm0 (a piece's single sprm): its isprm → sprm opcode */
export const PRM0: number[] = [
  0, 0, 0, 0, 0x2602, 0x2403, 0, 0x2405, 0x2406, 0x2407, 0, 0, 0x260a, 0, 0x240c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x2416, 0x2417, 0, 0, 0, 0x261b, 0, 0,
  0, 0, 0, 0, 0, 0x2423, 0, 0, 0, 0, 0, 0, 0x242a, 0, 0, 0, 0, 0, 0x2430, 0x2431, 0, 0x2433, 0x2434, 0x2435, 0x2436, 0x2437, 0x2438, 0, 0, 0, 0, 0,
  0, 0x0800, 0x0801, 0x0802, 0, 0, 0, 0x0806, 0, 0, 0, 0x080a, 0, 0x2a0c, 0x0858, 0x2859, 0, 0, 0, 0x2a33, 0, 0x0835, 0x0836, 0x0837, 0x0838, 0x0839, 0x083a, 0x083b,
  0x083c, 0, 0x2a3e, 0, 0, 0, 0x2a42, 0, 0x2a44, 0, 0x2a46, 0, 0x2a48, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x2a53, 0x0854, 0x0855, 0x0856, 0, 0x2640, 0x2441, 0, 0,
  0, 0, 0, 0,
]
