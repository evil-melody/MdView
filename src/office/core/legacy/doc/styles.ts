/** The stylesheet (STSH), the font table (SttbfFfn) and the list tables (PlfLst / PlfLfo) of a Word binary document. */
import { Bytes } from './bin'
import { applyChp, applyPap, DEFAULT_CHP, DEFAULT_PAP, type Chp, type Pap } from './props'

/** English names of the built-in styles by sti (Word writes these names in OOXML whatever the UI language) */
const STI_NAMES = [
  'Normal', 'heading 1', 'heading 2', 'heading 3', 'heading 4', 'heading 5', 'heading 6', 'heading 7', 'heading 8', 'heading 9',
  'index 1', 'index 2', 'index 3', 'index 4', 'index 5', 'index 6', 'index 7', 'index 8', 'index 9',
  'toc 1', 'toc 2', 'toc 3', 'toc 4', 'toc 5', 'toc 6', 'toc 7', 'toc 8', 'toc 9',
  'Normal Indent', 'footnote text', 'annotation text', 'header', 'footer', 'index heading', 'caption', 'table of figures',
  'envelope address', 'envelope return', 'footnote reference', 'annotation reference', 'line number', 'page number',
  'endnote reference', 'endnote text', 'table of authorities', 'macro', 'toa heading', 'List', 'List Bullet', 'List Number',
  'List 2', 'List 3', 'List 4', 'List 5', 'List Bullet 2', 'List Bullet 3', 'List Bullet 4', 'List Bullet 5',
  'List Number 2', 'List Number 3', 'List Number 4', 'List Number 5', 'Title', 'Closing', 'Signature', 'Default Paragraph Font',
  'Body Text', 'Body Text Indent', 'List Continue', 'List Continue 2', 'List Continue 3', 'List Continue 4', 'List Continue 5',
  'Message Header', 'Subtitle', 'Salutation', 'Date', 'Body Text First Indent', 'Body Text First Indent 2', 'Note Heading',
  'Body Text 2', 'Body Text 3', 'Body Text Indent 2', 'Body Text Indent 3', 'Block Text', 'Hyperlink', 'FollowedHyperlink',
  'Strong', 'Emphasis', 'Document Map', 'Plain Text',
]

/** style ids Word gives built-in styles whose id is not their name without spaces */
const STYLE_IDS: Record<string, string> = {
  'annotation text': 'CommentText',
  'annotation reference': 'CommentReference',
  'Normal Table': 'TableNormal',
  'toa heading': 'TOAHeading',
}

export interface Style {
  istd: number
  sti: number
  /** 1 paragraph, 2 character, 3 table, 4 list */
  stk: number
  base: number
  next: number
  name: string
  aliases?: string
  id: string
  hidden: boolean
  papx?: Uint8Array
  chpx?: Uint8Array
}

/** A font of the font table */
export interface Font {
  name: string
  alt?: string
  charset: number
  family: number
  pitch: number
}

/** Reads the font table. */
export function readFonts(tbl: Bytes, fc: number, lcb: number): Font[] {
  const out: Font[] = []
  if (lcb < 4) return out
  const end = Math.min(tbl.length, fc + lcb)
  const count = tbl.u16(fc)
  let p = fc + 4
  for (let i = 0; i < count && p < end; i++) {
    const cb = tbl.u8(p)
    const f = p + 1
    const ffid = tbl.u8(f)
    const nameAt = f + 39
    const lim = Math.min(f + cb, end)
    let name = ''
    let q = nameAt
    for (; q + 1 < lim; q += 2) {
      const ch = tbl.u16(q)
      if (!ch) break
      name += String.fromCharCode(ch)
    }
    const altAt = nameAt + tbl.u8(f + 4) * 2
    let alt = ''
    if (tbl.u8(f + 4) && altAt < lim) for (let r = altAt; r + 1 < lim; r += 2) {
      const ch = tbl.u16(r)
      if (!ch) break
      alt += String.fromCharCode(ch)
    }
    out.push({ name: name || 'Times New Roman', ...(alt ? { alt } : {}), charset: tbl.u8(f + 3), family: (ffid >> 4) & 7, pitch: ffid & 3 })
    p += 1 + cb
  }
  return out
}

/** Reads the stylesheet and resolves each style's properties through its basedOn chain. */
export class StyleSheet {
  readonly styles: (Style | undefined)[] = []
  /** default fonts (ASCII, East Asian, other, complex script) */
  ftc = [0, 0, 0, 0]
  private paps = new Map<number, Pap>()
  private chps = new Map<number, Chp>()
  private charDeltas = new Map<number, Partial<Chp>>()
  readonly root: Chp

  constructor(tbl: Bytes, fc: number, lcb: number) {
    const end = Math.min(tbl.length, fc + lcb)
    if (lcb >= 2) this.read(tbl, fc, end)
    this.root = { ...DEFAULT_CHP, f0: this.ftc[0], f1: this.ftc[1], f2: this.ftc[2], fBi: this.ftc[3] }
    const used = new Set<string>()
    for (const s of this.styles) {
      if (!s) continue
      const words = s.name.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      let id = STYLE_IDS[s.name] ?? (words.join('').replace(/[^A-Za-z0-9]/g, '') || `Style${s.istd}`)
      if (/^toc\d$/.test(s.name)) id = 'TOC' + s.name.slice(3)
      if (/^[0-9]/.test(id)) id = 'S' + id
      let k = 1
      const base = id
      while (used.has(id.toLowerCase())) id = `${base}${++k}`
      used.add(id.toLowerCase())
      s.id = id
    }
  }

  private read(tbl: Bytes, fc: number, end: number) {
    const cbStshi = tbl.u16(fc)
    const si = fc + 2
    const cstd = tbl.u16(si)
    const cbBase = tbl.u16(si + 2) || 10
    this.ftc = [tbl.u16(si + 12), tbl.u16(si + 14), tbl.u16(si + 16), cbStshi >= 20 ? tbl.u16(si + 18) : tbl.u16(si + 12)]
    let p = si + cbStshi
    for (let istd = 0; istd < cstd && p + 2 <= end; istd++) {
      const cb = tbl.u16(p)
      const at = p + 2
      p = at + cb
      if (!cb || p > end) {
        this.styles.push(undefined)
        continue
      }
      this.styles.push(this.readStd(tbl, istd, at, cb, cbBase))
    }
  }

  private readStd(tbl: Bytes, istd: number, at: number, cb: number, cbBase: number): Style | undefined {
    const std = new Bytes(tbl.sub(at, cb))
    const w0 = std.u16(0)
    const sti = w0 & 0xfff
    const w1 = std.u16(2)
    const stk = w1 & 0xf
    const base = w1 >> 4
    const w2 = std.u16(4)
    const cupx = w2 & 0xf
    const next = w2 >> 4
    const grf = std.u16(8)
    // the name: a length-prefixed UTF-16 string with a terminating zero
    let p = cbBase
    const cch = std.u16(p)
    let name = std.utf16(p + 2, cch)
    p += 2 + cch * 2 + 2
    if (p & 1) p++
    let papx: Uint8Array | undefined
    let chpx: Uint8Array | undefined
    for (let k = 0; k < cupx && p + 2 <= std.length; k++) {
      const len = std.u16(p)
      const data = std.sub(p + 2, len)
      p += 2 + len
      if (p & 1) p++
      if (stk === 1 && k === 0) papx = data.subarray(2)
      else if ((stk === 1 && k === 1) || (stk === 2 && k === 0)) chpx = data
      else if (stk === 4 && k === 0) papx = data.subarray(2)
    }
    if (stk !== 1 && stk !== 2 && stk !== 3 && stk !== 4) return undefined
    let aliases: string | undefined
    if (sti < STI_NAMES.length) {
      name = STI_NAMES[sti]
    } else {
      const comma = name.indexOf(',')
      if (comma > 0) {
        aliases = name.slice(comma + 1)
        name = name.slice(0, comma)
      }
    }
    if (sti === 4094 || sti >= STI_NAMES.length) name = name.trim() || `Style ${istd}`
    return { istd, sti, stk, base: base === 0xfff ? -1 : base, next: next === 0xfff ? istd : next, name, ...(aliases ? { aliases } : {}), id: '', hidden: !!(grf & 0x2), papx, chpx }
  }

  style(istd: number): Style | undefined {
    return this.styles[istd]
  }

  /** a paragraph style that exists (Normal when it does not) */
  paraIstd(istd: number): number {
    const s = this.styles[istd]
    return s && s.stk === 1 ? istd : 0
  }

  /** the base style of a style, when it is of the same kind */
  baseOf(istd: number): number {
    const s = this.styles[istd]
    if (!s || s.base < 0) return -1
    const b = this.styles[s.base]
    return b && b.stk === s.stk ? s.base : -1
  }

  /** resolved paragraph properties of a paragraph style */
  pap(istd: number, depth = 0): Pap {
    const hit = this.paps.get(istd)
    if (hit) return hit
    const s = this.styles[istd]
    const base = this.baseOf(istd)
    const out: Pap = { ...(base >= 0 && depth < 20 ? this.pap(base, depth + 1) : DEFAULT_PAP) }
    out.tabs = [...out.tabs]
    if (s?.papx) applyPap(out, s.papx)
    out.istd = istd
    out.inTable = out.ttp = out.innerCell = out.innerTtp = false
    out.itap = 0
    this.paps.set(istd, out)
    return out
  }

  /** resolved character properties of a paragraph style */
  chp(istd: number, depth = 0): Chp {
    const hit = this.chps.get(istd)
    if (hit) return hit
    const s = this.styles[istd]
    const base = this.baseOf(istd)
    const parent = base >= 0 && depth < 20 ? this.chp(base, depth + 1) : this.root
    const out: Chp = { ...parent }
    if (s?.chpx && s.stk === 1) applyChp(out, s.chpx, parent)
    out.istd = 10
    this.chps.set(istd, out)
    return out
  }

  /** the character properties a character style sets (through its basedOn chain) */
  charDelta(istd: number, depth = 0): Partial<Chp> | undefined {
    const s = this.styles[istd]
    if (!s || s.stk !== 2) return undefined
    const hit = this.charDeltas.get(istd)
    if (hit) return hit
    const base = this.baseOf(istd)
    const parent = base >= 0 && depth < 20 ? (this.charDelta(base, depth + 1) ?? {}) : {}
    const out = { ...parent } as Chp
    if (s.chpx) applyChp(out, s.chpx, { ...this.root, ...parent })
    delete (out as Partial<Chp>).istd
    this.charDeltas.set(istd, out)
    return out
  }
}

// ---------------------------------------------------------------- lists

export interface Lvl {
  start: number
  nfc: number
  jc: number
  legal: boolean
  noRestart: boolean
  follow: number
  /** level text with placeholders as %1..%9 */
  text: string
  restartLim: number
  papx: Uint8Array
  chpx: Uint8Array
}

export interface Lst {
  lsid: number
  simple: boolean
  hybrid: boolean
  istds: number[]
  lvls: Lvl[]
}

export interface Lfo {
  lsid: number
  overrides: { ilvl: number; start?: number; lvl?: Lvl }[]
}

/** Reads an LVL at `p`; returns it and the offset after it. */
function readLvl(tbl: Bytes, p: number): [Lvl, number] {
  const start = tbl.i32(p)
  const nfc = tbl.u8(p + 4)
  const flags = tbl.u8(p + 5)
  const nums: number[] = []
  for (let k = 0; k < 9; k++) {
    const v = tbl.u8(p + 6 + k)
    if (v) nums.push(v)
  }
  const follow = tbl.u8(p + 15)
  const cbChpx = tbl.u8(p + 24)
  const cbPapx = tbl.u8(p + 25)
  const restartLim = tbl.u8(p + 26)
  let q = p + 28
  const papx = tbl.sub(q, cbPapx)
  q += cbPapx
  const chpx = tbl.sub(q, cbChpx)
  q += cbChpx
  const cch = Math.min(tbl.u16(q), 0x200)
  const raw = tbl.utf16(q + 2, cch)
  q += 2 + cch * 2
  // placeholders: the positions in rgbxchNums hold a level number (0-8)
  const holders = new Set(nums.map((n) => n - 1))
  let text = ''
  for (let k = 0; k < raw.length; k++) {
    const c = raw.charCodeAt(k)
    if (holders.has(k) && c < 9) text += `%${c + 1}`
    else text += raw[k]
  }
  return [{ start, nfc, jc: flags & 3, legal: !!(flags & 4), noRestart: !!(flags & 8), follow, text, restartLim, papx, chpx }, q]
}

/** Reads the list definitions (PlfLst) and the list instances (PlfLfo). */
export function readLists(tbl: Bytes, lst: { fc: number; lcb: number }, lfo: { fc: number; lcb: number }): { lsts: Lst[]; lfos: Lfo[] } {
  const lsts: Lst[] = []
  const lfos: Lfo[] = []
  if (lst.lcb >= 2) {
    const n = Math.max(0, tbl.i16(lst.fc))
    const end = Math.min(tbl.length, lst.fc + lst.lcb)
    let p = lst.fc + 2
    for (let i = 0; i < n && p + 28 <= end; i++, p += 28) {
      const flags = tbl.u8(p + 26)
      const istds: number[] = []
      for (let k = 0; k < 9; k++) istds.push(tbl.u16(p + 8 + k * 2))
      lsts.push({ lsid: tbl.i32(p), simple: !!(flags & 1), hybrid: !!(flags & 0x10), istds, lvls: [] })
    }
    // the levels follow the PlfLst (outside its size): 9 per list, 1 for a simple list
    for (const l of lsts) {
      const count = l.simple ? 1 : 9
      for (let k = 0; k < count && p + 28 <= tbl.length; k++) {
        const [lvl, q] = readLvl(tbl, p)
        l.lvls.push(lvl)
        p = q
      }
    }
  }
  if (lfo.lcb >= 4) {
    const end = Math.min(tbl.length, lfo.fc + lfo.lcb)
    const n = Math.max(0, Math.min(tbl.i32(lfo.fc), Math.floor((lfo.lcb - 4) / 16)))
    let p = lfo.fc + 4
    const counts: number[] = []
    for (let i = 0; i < n; i++, p += 16) {
      lfos.push({ lsid: tbl.i32(p), overrides: [] })
      counts.push(tbl.u8(p + 12))
    }
    // LFOData of each LFO: a CP (ignored), then its level overrides
    for (let i = 0; i < n && p < end; i++) {
      const c = counts[i]
      p += 4
      for (let k = 0; k < c && p + 8 <= end; k++) {
        const start = tbl.i32(p)
        const f = tbl.u32(p + 4)
        p += 8
        const ov: Lfo['overrides'][number] = { ilvl: f & 0xf }
        if (f & 0x10) ov.start = start
        if (f & 0x20) {
          const [lvl, q] = readLvl(tbl, p)
          ov.lvl = lvl
          p = q
        }
        lfos[i].overrides.push(ov)
      }
    }
  }
  return { lsts, lfos }
}

/** a Xst (length-prefixed UTF-16) or, for old tables, ANSI text */
export function xst(b: Bytes, p: number): string {
  return b.utf16(p + 2, b.u16(p))
}

