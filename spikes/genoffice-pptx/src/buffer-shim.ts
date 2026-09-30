// Browser shim for Node's global `Buffer`. GenOffice's pptx-engine uses Buffer in ~84
// places (archive read/write, base64 transport, utf8 conversion). esbuild `inject`
// rewrites the free `Buffer` identifier to this module, so nothing leaks to globalThis.
//
// Only the members the engine actually touches are implemented; unknown encodings fall
// back to utf8 rather than throwing, so a parse path never dies on a cosmetic mismatch.
import { base64Encode, base64Decode } from './media'

const UTF8 = new TextEncoder()
const UTF8_DEC = new TextDecoder('utf-8')
const LATIN1_DEC = new TextDecoder('latin1')

const HEX = '0123456789abcdef'

function bytesFromLatin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

function toBytes(input: unknown, enc?: string, byteOffset?: number, length?: number): Uint8Array {
  if (typeof input === 'string') {
    const e = (enc ?? 'utf8').toLowerCase()
    if (e === 'base64') return base64Decode(input)
    if (e === 'hex') {
      const n = input.length >> 1
      const out = new Uint8Array(n)
      for (let i = 0; i < n; i++) out[i] = parseInt(input.substr(i * 2, 2), 16)
      return out
    }
    if (e === 'binary' || e === 'latin1') return bytesFromLatin1(input)
    return UTF8.encode(input)
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input, byteOffset ?? 0, length ?? input.byteLength - (byteOffset ?? 0))
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array((input as ArrayBufferView).buffer, (input as ArrayBufferView).byteOffset, (input as ArrayBufferView).byteLength)
  }
  if (input == null) return new Uint8Array(0)
  if (typeof input === 'number') return new Uint8Array(input)
  return new Uint8Array(input as ArrayLike<number>)
}

export class Buffer extends Uint8Array {
  static from(input: unknown, enc?: string | number, length?: number): Buffer {
    if (typeof enc === 'number' || (enc as unknown) === undefined) {
      const off = typeof enc === 'number' ? enc : undefined
      const b = toBytes(input, undefined, off, length)
      return new Buffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
    }
    const b = toBytes(input, enc as string)
    return new Buffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
  }

  static alloc(size: number, fill = 0): Buffer {
    const b = new Buffer(size)
    if (fill) b.fill(fill)
    return b
  }

  static allocUnsafe(size: number): Buffer {
    return new Buffer(size)
  }

  static concat(list: ArrayLike<Uint8Array>, totalLength?: number): Buffer {
    const arrs = Array.from(list)
    const total = totalLength ?? arrs.reduce((n, a) => n + a.length, 0)
    const out = new Buffer(total)
    let off = 0
    for (const a of arrs) {
      out.set(a.subarray(0, Math.max(0, Math.min(a.length, total - off))), off)
      off += a.length
    }
    return out
  }

  static isBuffer(x: unknown): x is Buffer {
    return x instanceof Uint8Array
  }

  static byteLength(input: string | ArrayBufferView, enc?: string): number {
    return typeof input === 'string' ? toBytes(input, enc).length : input.byteLength
  }

  toString(enc = 'utf8'): string {
    const e = enc.toLowerCase()
    if (e === 'base64') return base64Encode(this)
    if (e === 'binary' || e === 'latin1') return LATIN1_DEC.decode(this)
    if (e === 'hex') {
      let s = ''
      for (let i = 0; i < this.length; i++) s += HEX[this[i] >> 4] + HEX[this[i] & 15]
      return s
    }
    return UTF8_DEC.decode(this)
  }

  equals(other: Uint8Array): boolean {
    if (this.length !== other.length) return false
    for (let i = 0; i < this.length; i++) if (this[i] !== other[i]) return false
    return true
  }

  /** Uint8Array#includes is inherited; kept explicit for clarity in Buffer-shaped call sites. */
  includes(value: number | Uint8Array, fromIndex?: number): boolean {
    if (typeof value === 'number') return super.includes(value, fromIndex)
    const needle = value
    if (!needle.length) return true
    outer: for (let i = fromIndex ?? 0; i <= this.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) if (this[i + j] !== needle[j]) continue outer
      return true
    }
    return false
  }
}
