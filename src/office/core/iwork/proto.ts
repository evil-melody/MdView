/**
 * Schema-less protobuf reader: iWork archives are protobuf messages whose .proto files Apple does not publish,
 * so fields are read by number (see the reverse-engineered schemas cited in iwork/README notes).
 */

const utf8 = new TextDecoder()

/** one field occurrence: a varint / fixed value, or the bytes of a length-delimited one */
type Val = number | Uint8Array

/** position after the last varint read by readVarint */
let pos = 0

/** varint at `p` (sets `pos` after it); negative int32 / int64 (ten-byte varints) come back signed */
function readVarint(buf: Uint8Array, p: number): number {
  const n = buf.length
  let lo = 0
  let hi = 0
  let shift = 0
  for (;;) {
    if (p >= n) throw new Error('Truncated protobuf varint')
    const b = buf[p++]
    if (shift < 28) lo |= (b & 0x7f) << shift
    else if (shift === 28) {
      lo |= (b & 0x0f) << 28
      hi |= (b & 0x7f) >>> 4
    } else hi |= (b & 0x7f) << (shift - 32)
    if (b < 0x80) break
    shift += 7
  }
  pos = p
  if (hi & 0x80000000) return (hi | 0) * 0x100000000 + (lo >>> 0)
  return (hi >>> 0) * 0x100000000 + (lo >>> 0)
}

/** the value of the field at `p` (wire type `wt`); sets `pos` after it */
function readValue(buf: Uint8Array, p: number, wt: number, keep: boolean): Val {
  const n = buf.length
  if (wt === 0) return readVarint(buf, p)
  if (wt === 2) {
    const len = readVarint(buf, p)
    const start = pos
    if (start + len > n) throw new Error('Truncated protobuf field')
    pos = start + len
    return keep ? buf.subarray(start, start + len) : 0
  }
  if (wt === 5) {
    if (p + 4 > n) throw new Error('Truncated protobuf field')
    pos = p + 4
    return (buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24)) >>> 0
  }
  if (wt === 1) {
    // kept as the raw 8 bytes: a double or a fixed64
    pos = p + 8
    return keep ? buf.subarray(p, p + 8) : 0
  }
  throw new Error(`Unsupported protobuf wire type ${wt}`)
}

export class Msg {
  /** field number, wire type and value of each occurrence, in order (indexed after a few lookups) */
  private nums?: number[]
  private wts?: number[]
  private vals?: Val[]
  /** lookups answered by scanning (small messages read once need no index) */
  private scans = 0

  constructor(readonly buf: Uint8Array) {}

  private index(): void {
    if (this.nums) return
    const nums: number[] = []
    const wts: number[] = []
    const vals: Val[] = []
    const buf = this.buf
    let p = 0
    while (p < buf.length) {
      const key = readVarint(buf, p)
      const wt = key & 7
      vals.push(readValue(buf, pos, wt, true))
      p = pos
      nums.push(Math.floor(key / 8))
      wts.push(wt)
    }
    this.nums = nums
    this.wts = wts
    this.vals = vals
  }

  /** last occurrence of a field, found by scanning: [wire type, value], or undefined */
  private scan(f: number): [number, Val] | undefined {
    const buf = this.buf
    let p = 0
    let found: [number, Val] | undefined
    while (p < buf.length) {
      const key = readVarint(buf, p)
      const wt = key & 7
      const mine = Math.floor(key / 8) === f
      const v = readValue(buf, pos, wt, mine)
      p = pos
      if (mine) found = [wt, v]
    }
    return found
  }

  /** position of the last occurrence of a field (-1: absent) */
  private at(f: number): number {
    this.index()
    const nums = this.nums!
    for (let k = nums.length - 1; k >= 0; k--) if (nums[k] === f) return k
    return -1
  }

  private all(f: number): Val[] {
    this.index()
    const out: Val[] = []
    const nums = this.nums!
    for (let k = 0; k < nums.length; k++) if (nums[k] === f) out.push(this.vals![k])
    return out
  }

  has(f: number): boolean {
    if (!this.nums && ++this.scans <= 3) return this.scan(f) !== undefined
    return this.at(f) >= 0
  }

  /** field numbers present (for debugging) */
  keys(): number[] {
    this.index()
    return [...new Set(this.nums)]
  }

  private last(f: number): Val | undefined {
    if (!this.nums && ++this.scans <= 3) return this.scan(f)?.[1]
    const k = this.at(f)
    return k < 0 ? undefined : this.vals![k]
  }

  private wire(f: number): number | undefined {
    if (!this.nums && ++this.scans <= 3) return this.scan(f)?.[0]
    const k = this.at(f)
    return k < 0 ? undefined : this.wts![k]
  }

  /** varint (uint32 / uint64 / int32 / enum / bool); fixed32 read as an unsigned number */
  u(f: number): number | undefined {
    const v = this.last(f)
    return typeof v === 'number' ? v : undefined
  }

  bool(f: number): boolean | undefined {
    const v = this.u(f)
    return v === undefined ? undefined : v !== 0
  }

  float(f: number): number | undefined {
    if (this.wire(f) !== 5) return undefined
    const v = this.last(f) as number
    const dv = new DataView(new ArrayBuffer(4))
    dv.setUint32(0, v, true)
    return dv.getFloat32(0, true)
  }

  double(f: number): number | undefined {
    const v = this.last(f)
    if (!(v instanceof Uint8Array) || this.wire(f) !== 1) return undefined
    return new DataView(v.buffer, v.byteOffset, 8).getFloat64(0, true)
  }

  bytes(f: number): Uint8Array | undefined {
    const v = this.last(f)
    return v instanceof Uint8Array ? v : undefined
  }

  str(f: number): string | undefined {
    const b = this.bytes(f)
    return b && utf8.decode(b)
  }

  strs(f: number): string[] {
    return this.all(f).flatMap((v) => (v instanceof Uint8Array ? [utf8.decode(v)] : []))
  }

  msg(f: number): Msg | undefined {
    const b = this.bytes(f)
    return b && new Msg(b)
  }

  msgs(f: number): Msg[] {
    return this.all(f).flatMap((v) => (v instanceof Uint8Array ? [new Msg(v)] : []))
  }

  /** repeated varints, packed or not */
  us(f: number): number[] {
    const out: number[] = []
    for (const v of this.all(f)) {
      if (typeof v === 'number') out.push(v)
      else {
        let p = 0
        while (p < v.length) {
          let x = 0
          for (let shift = 0; ; shift += 7) {
            const b = v[p++]
            x += (b & 0x7f) * 2 ** shift
            if (b < 0x80 || p >= v.length) break
          }
          out.push(x)
        }
      }
    }
    return out
  }

  /** repeated floats (packed or not) */
  floats(f: number): number[] {
    const out: number[] = []
    for (const v of this.all(f)) {
      if (typeof v === 'number') {
        const dv = new DataView(new ArrayBuffer(4))
        dv.setUint32(0, v, true)
        out.push(dv.getFloat32(0, true))
      } else {
        const dv = new DataView(v.buffer, v.byteOffset, v.byteLength)
        for (let p = 0; p + 4 <= v.length; p += 4) out.push(dv.getFloat32(p, true))
      }
    }
    return out
  }

  /** TSP.Reference field: the identifier of the object it points to */
  ref(f: number): number | undefined {
    return this.msg(f)?.u(1)
  }

  refs(f: number): number[] {
    return this.msgs(f).flatMap((m) => {
      const id = m.u(1)
      return id === undefined ? [] : [id]
    })
  }
}
