/**
 * The text of a Word binary document: the piece table (Clx) maps character positions (CPs) to file offsets (FCs) of
 * 8-bit or UTF-16 text; the formatted disk pages (FKPs) hold the character (CHPX) and paragraph (PAPX) properties of
 * FC ranges.
 */
import { Bytes, cp1252, lastLE, utf16 } from './bin'
import type { Fib } from './fib'
import { FC } from './fib'
import { PRM0 } from './props'

export interface Piece {
  cp0: number
  cp1: number
  /** byte offset of the text in the WordDocument stream */
  fc: number
  /** 1 byte per character (cp1252) instead of 2 (UTF-16) */
  comp: boolean
  /** the piece's own sprms (Prm) */
  prm: Uint8Array
}

/** properties of an FC range from the FKPs */
interface FkpRun {
  fc0: number
  fc1: number
  g: Uint8Array
  /** paragraph style (PAPX only) */
  istd: number
}

/** a range of characters with the same CHPX and piece */
export interface Seg {
  cp0: number
  cp1: number
  chpx: Uint8Array
  prm: Uint8Array
  /** cache key of the formatting */
  key: string
}

const EMPTY: Uint8Array = new Uint8Array(0)

export class DocText {
  readonly pieces: Piece[] = []
  private pieceStarts: number[] = []
  readonly text: string
  private chpx: FkpRun[] = []
  private chpxStarts: number[] = []
  private papx: FkpRun[] = []
  private papxStarts: number[] = []

  constructor(
    wd: Bytes,
    tbl: Bytes,
    fib: Fib,
  ) {
    this.readPieces(tbl, fib)
    // the text of all pieces, in CP order (a damaged piece table cannot claim more text than the stream could hold)
    const limit = 2 * wd.length + 4096
    const parts: string[] = []
    let cp = 0
    let kept = 0
    for (const p of this.pieces) {
      if (p.cp0 >= limit) break
      p.cp1 = Math.min(p.cp1, limit)
      if (p.cp0 > cp) parts.push(' '.repeat(p.cp0 - cp))
      const n = p.cp1 - p.cp0
      const bytes = wd.sub(p.fc, p.comp ? n : n * 2)
      let s = p.comp ? cp1252(bytes) : utf16(bytes)
      if (s.length < n) s += ' '.repeat(n - s.length)
      parts.push(s)
      cp = p.cp1
      kept++
    }
    this.pieces.length = kept
    this.pieceStarts.length = kept
    this.text = parts.join('')
    this.chpx = this.readFkps(wd, tbl, fib.fc(FC.plcfBteChpx), false)
    this.chpxStarts = this.chpx.map((r) => r.fc0)
    this.papx = this.readFkps(wd, tbl, fib.fc(FC.plcfBtePapx), true)
    this.papxStarts = this.papx.map((r) => r.fc0)
  }

  private readPieces(tbl: Bytes, fib: Fib) {
    const { fc, lcb } = fib.fc(FC.clx)
    if (!lcb) throw new Error('Word document without a piece table')
    const end = Math.min(tbl.length, fc + lcb)
    const prcs: Uint8Array[] = []
    let p = fc
    let pcd: { at: number; lcb: number } | undefined
    while (p < end) {
      const t = tbl.u8(p)
      if (t === 1) {
        const cb = tbl.i16(p + 1)
        if (cb < 0) break
        prcs.push(tbl.sub(p + 3, cb))
        p += 3 + cb
      } else if (t === 2) {
        pcd = { at: p + 5, lcb: tbl.u32(p + 1) }
        break
      } else break
    }
    if (!pcd) throw new Error('Word document: damaged piece table')
    const n = Math.max(0, Math.floor((Math.min(pcd.lcb, tbl.length - pcd.at) - 4) / 12))
    const cps: number[] = []
    for (let i = 0; i <= n; i++) cps.push(tbl.u32(pcd.at + i * 4))
    const dataAt = pcd.at + (n + 1) * 4
    let last = 0
    for (let i = 0; i < n; i++) {
      const cp0 = cps[i]
      const cp1 = cps[i + 1]
      if (cp1 <= cp0 || cp0 < last) continue
      last = cp1
      const o = dataAt + i * 8
      const raw = tbl.u32(o + 2)
      const comp = !!(raw & 0x40000000)
      const fc = comp ? (raw & 0x3fffffff) / 2 : raw & 0x3fffffff
      const prm = tbl.u16(o + 6)
      let g = EMPTY
      if (prm & 1) g = prcs[prm >> 1] ?? EMPTY
      else {
        const op = PRM0[(prm >> 1) & 0x7f]
        if (op && prm >> 8) g = Uint8Array.of(op & 0xff, op >> 8, prm >> 8)
      }
      this.pieces.push({ cp0, cp1, fc, comp, prm: g })
    }
    this.pieceStarts = this.pieces.map((x) => x.cp0)
  }

  private readFkps(wd: Bytes, tbl: Bytes, at: { fc: number; lcb: number }, papx: boolean): FkpRun[] {
    const runs: FkpRun[] = []
    if (at.lcb < 4) return runs
    const n = Math.floor((Math.min(at.lcb, tbl.length - at.fc) - 4) / 8)
    const pagesAt = at.fc + (n + 1) * 4
    const seen = new Set<number>()
    for (let i = 0; i < n; i++) {
      const pn = tbl.u32(pagesAt + i * 4) & 0x3fffff
      if (seen.has(pn)) continue
      seen.add(pn)
      const page = new Bytes(wd.sub(pn * 512, 512))
      if (page.length < 512) continue
      const count = page.u8(511)
      if (count * (papx ? 17 : 5) + 4 > 511) continue
      for (let k = 0; k < count; k++) {
        const fc0 = page.u32(k * 4)
        const fc1 = page.u32(k * 4 + 4)
        if (fc1 <= fc0) continue
        if (papx) {
          const off = page.u8((count + 1) * 4 + k * 13) * 2
          if (!off) {
            runs.push({ fc0, fc1, g: EMPTY, istd: 0 })
            continue
          }
          let cb = page.u8(off)
          let start = off + 1
          if (cb === 0) {
            cb = page.u8(off + 1) * 2
            start = off + 2
          } else cb = cb * 2 - 1
          const data = page.sub(start, cb)
          runs.push({ fc0, fc1, g: data.subarray(2), istd: data.length >= 2 ? data[0] | (data[1] << 8) : 0 })
        } else {
          const off = page.u8((count + 1) * 4 + k) * 2
          runs.push({ fc0, fc1, g: off ? page.sub(off + 1, page.u8(off)) : EMPTY, istd: 0 })
        }
      }
    }
    runs.sort((a, b) => a.fc0 - b.fc0)
    return runs
  }

  get length(): number {
    return this.text.length
  }

  pieceIndex(cp: number): number {
    return lastLE(this.pieceStarts, cp)
  }

  /** the file offset of a character, and its piece */
  fcOf(cp: number): { fc: number; piece?: Piece } {
    const i = this.pieceIndex(cp)
    const p = this.pieces[i]
    if (!p || cp >= p.cp1) return { fc: -1 }
    return { fc: p.fc + (cp - p.cp0) * (p.comp ? 1 : 2), piece: p }
  }

  /** paragraph properties (style, grpprl, the piece's sprms) of the paragraph whose mark is at `cp` */
  papAt(cp: number): { istd: number; g: Uint8Array; prm: Uint8Array } {
    const { fc, piece } = this.fcOf(cp)
    const prm = piece?.prm ?? EMPTY
    const i = lastLE(this.papxStarts, fc)
    const r = this.papx[i]
    if (!r || fc >= r.fc1) return { istd: 0, g: EMPTY, prm }
    return { istd: r.istd, g: r.g, prm }
  }

  /** the character formatting ranges of [cp0, cp1) */
  segs(cp0: number, cp1: number): Seg[] {
    const out: Seg[] = []
    let pi = Math.max(0, this.pieceIndex(cp0))
    for (; pi < this.pieces.length; pi++) {
      const p = this.pieces[pi]
      if (p.cp0 >= cp1) break
      if (p.cp1 <= cp0) continue
      const w = p.comp ? 1 : 2
      const a = Math.max(cp0, p.cp0)
      const b = Math.min(cp1, p.cp1)
      const fcA = p.fc + (a - p.cp0) * w
      const fcB = p.fc + (b - p.cp0) * w
      let i = lastLE(this.chpxStarts, fcA)
      let pos = fcA
      let guard = 0
      while (pos < fcB && guard++ < 1_000_000) {
        const r = this.chpx[i]
        let end: number
        let g = EMPTY
        let key = `${pi}:-1`
        if (r && r.fc0 <= pos && pos < r.fc1) {
          end = Math.min(fcB, r.fc1)
          g = r.g
          key = `${pi}:${i}`
          i++
        } else {
          const next = this.chpx[i + 1]
          end = next && next.fc0 > pos ? Math.min(fcB, next.fc0) : fcB
          if (next && next.fc0 <= pos) {
            i++
            continue
          }
        }
        const c0 = p.cp0 + Math.floor((pos - p.fc) / w)
        const c1 = end >= fcB ? b : p.cp0 + Math.ceil((end - p.fc) / w)
        if (c1 > c0) out.push({ cp0: c0, cp1: c1, chpx: g, prm: p.prm, key })
        if (end <= pos) break
        pos = end
      }
    }
    return out
  }
}
