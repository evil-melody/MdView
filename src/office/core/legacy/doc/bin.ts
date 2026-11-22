/** Bounds-checked little-endian reads for the Word binary structures: a read past the end gives 0, never throws. */

export class Bytes {
  readonly dv: DataView
  constructor(readonly b: Uint8Array) {
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  }

  get length(): number {
    return this.b.length
  }

  u8(o: number): number {
    return o >= 0 && o < this.b.length ? this.b[o] : 0
  }

  u16(o: number): number {
    return o >= 0 && o + 2 <= this.b.length ? this.dv.getUint16(o, true) : 0
  }

  i16(o: number): number {
    return o >= 0 && o + 2 <= this.b.length ? this.dv.getInt16(o, true) : 0
  }

  u32(o: number): number {
    return o >= 0 && o + 4 <= this.b.length ? this.dv.getUint32(o, true) : 0
  }

  i32(o: number): number {
    return o >= 0 && o + 4 <= this.b.length ? this.dv.getInt32(o, true) : 0
  }

  /** `n` bytes at `o`, cut to what the array holds */
  sub(o: number, n: number): Uint8Array {
    const a = Math.max(0, Math.min(o, this.b.length))
    return this.b.subarray(a, Math.max(a, Math.min(this.b.length, o + Math.max(0, n))))
  }

  /** UTF-16LE text of `n` characters at `o` */
  utf16(o: number, n: number): string {
    return utf16(this.sub(o, n * 2))
  }
}

const UTF16 = new TextDecoder('utf-16le')
const CP1252 = new TextDecoder('windows-1252')

export const utf16 = (b: Uint8Array) => UTF16.decode(b.length & 1 ? b.subarray(0, b.length - 1) : b)
export const cp1252 = (b: Uint8Array) => CP1252.decode(b)

/** A PLC: n + 1 character positions and n data elements of `cb` bytes. */
export class Plc {
  readonly cps: number[] = []
  readonly n: number
  private dataAt: number

  constructor(
    readonly b: Bytes,
    fc: number,
    lcb: number,
    readonly cb: number,
  ) {
    const len = Math.max(0, Math.min(lcb, b.length - fc))
    this.n = len >= 4 ? Math.max(0, Math.floor((len - 4) / (4 + cb))) : 0
    for (let i = 0; i <= this.n && len >= 4; i++) this.cps.push(b.u32(fc + i * 4))
    this.dataAt = fc + (this.n + 1) * 4
  }

  /** offset of data element i */
  at(i: number): number {
    return this.dataAt + i * this.cb
  }

  /** index of the element whose start CP is `cp` (-1 when none) */
  find(cp: number): number {
    let lo = 0
    let hi = this.n - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const v = this.cps[mid]
      if (v === cp) return mid
      if (v < cp) lo = mid + 1
      else hi = mid - 1
    }
    return -1
  }
}

/** A string table (STTB): its strings and the extra data of each. */
export function sttb(b: Bytes, fc: number, lcb: number): { strs: string[]; extra: number[] } {
  const strs: string[] = []
  const extra: number[] = []
  if (lcb < 4 || fc < 0 || fc >= b.length) return { strs, extra }
  const end = Math.min(b.length, fc + lcb)
  const ext = b.u16(fc) === 0xffff
  let p = fc + (ext ? 2 : 0)
  const cData = b.u16(p)
  const cbExtra = b.u16(p + 2)
  p += 4
  for (let i = 0; i < cData && p < end; i++) {
    if (ext) {
      const cch = b.u16(p)
      strs.push(b.utf16(p + 2, cch))
      p += 2 + cch * 2
    } else {
      const cch = b.u8(p)
      strs.push(cp1252(b.sub(p + 1, cch)))
      p += 1 + cch
    }
    extra.push(p)
    p += cbExtra
  }
  return { strs, extra }
}

/** Last index i with arr[i] <= v (-1 when v is before the first). */
export function lastLE(arr: ArrayLike<number>, v: number): number {
  let lo = 0
  let hi = arr.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] <= v) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}
