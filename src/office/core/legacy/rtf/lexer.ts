/** RTF tokenizer: groups, control words / symbols, text, `\'hh` bytes and `\bin` data, read from the file's bytes. */

export const END = 0
export const OPEN = 1
export const CLOSE = 2
export const WORD = 3
export const SYMBOL = 4
export const TEXT = 5
export const HEX = 6
export const BIN = 7

const isLetter = (c: number) => (c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a)
const isDigit = (c: number) => c >= 0x30 && c <= 0x39

const HEXV = new Int8Array(256).fill(-1)
for (let k = 0; k < 10; k++) HEXV[0x30 + k] = k
for (let k = 0; k < 6; k++) HEXV[0x41 + k] = HEXV[0x61 + k] = 10 + k
export { HEXV }

/** control word names (interned: a file has a few hundred distinct ones) */
const names = new Map<number, string[]>()
function nameOf(b: Uint8Array, s: number, e: number): string {
  let h = e - s
  for (let k = s; k < e; k++) h = (h * 31 + b[k]) | 0
  let bucket = names.get(h)
  if (bucket) {
    for (const x of bucket) {
      if (x.length !== e - s) continue
      let k = 0
      while (k < x.length && x.charCodeAt(k) === b[s + k]) k++
      if (k === x.length) return x
    }
  } else names.set(h, (bucket = []))
  const x = String.fromCharCode(...b.subarray(s, e))
  if (bucket.length < 8) bucket.push(x)
  return x
}

export class Lexer {
  pos = 0
  /** WORD / SYMBOL: the name ('par', '~', '*', '\n'…) */
  word = ''
  /** WORD: the numeric parameter (0 when none); HEX: the byte */
  param = 0
  hasParam = false
  /** TEXT: bytes [start, end) of the file; BIN: the data */
  start = 0
  end = 0

  constructor(readonly b: Uint8Array) {}

  next(): number {
    const b = this.b
    const n = b.length
    let p = this.pos
    while (p < n && (b[p] === 13 || b[p] === 10)) p++
    if (p >= n) {
      this.pos = n
      return END
    }
    const c = b[p]
    if (c === 0x7b) {
      this.pos = p + 1
      return OPEN
    }
    if (c === 0x7d) {
      this.pos = p + 1
      return CLOSE
    }
    if (c === 0x5c) {
      p++
      if (p >= n) {
        this.pos = n
        return END
      }
      const d = b[p]
      if (isLetter(d)) {
        const s = p
        while (p < n && isLetter(b[p])) p++
        // names are at most 32 letters; longer runs are junk, cut so interning stays cheap
        this.word = nameOf(b, s, Math.min(p, s + 32))
        let neg = false
        if (b[p] === 0x2d && p + 1 < n && isDigit(b[p + 1])) {
          neg = true
          p++
        }
        if (p < n && isDigit(b[p])) {
          let v = 0
          let k = 0
          while (p < n && isDigit(b[p])) {
            if (k++ < 10) v = v * 10 + (b[p] - 0x30)
            p++
          }
          // 32-bit: larger values (dates with the weekday bits set) wrap as Word reads them
          if (v > 2147483647) v |= 0
          this.param = neg ? -v : v
          this.hasParam = true
        } else {
          this.param = 0
          this.hasParam = false
        }
        if (p < n && b[p] === 0x20) p++
        if (this.word === 'bin' && this.hasParam) {
          const len = Math.max(0, Math.min(this.param, n - p))
          this.start = p
          this.end = p + len
          this.pos = p + len
          return BIN
        }
        this.pos = p
        return WORD
      }
      if (d === 0x27) {
        p++
        let v = 0
        let k = 0
        while (k < 2 && p < n && HEXV[b[p]] >= 0) {
          v = v * 16 + HEXV[b[p]]
          p++
          k++
        }
        this.pos = p
        if (!k) {
          this.word = "'"
          return SYMBOL
        }
        this.param = v
        return HEX
      }
      this.word = String.fromCharCode(d)
      this.pos = p + 1
      return SYMBOL
    }
    const s = p
    while (p < n) {
      const x = b[p]
      if (x === 0x5c || x === 0x7b || x === 0x7d || x === 13 || x === 10) break
      p++
    }
    this.start = s
    this.end = p
    this.pos = p
    return TEXT
  }

  /** Skips the rest of the current group, its closing brace included (binary data and escaped braces are stepped over). */
  skipGroup(): void {
    const b = this.b
    const n = b.length
    let p = this.pos
    let depth = 1
    while (p < n) {
      const c = b[p++]
      if (c === 0x7b) depth++
      else if (c === 0x7d) {
        if (--depth === 0) break
      } else if (c === 0x5c && p < n) {
        if (isLetter(b[p])) {
          const s = p
          while (p < n && isLetter(b[p])) p++
          const bin = p - s === 3 && b[s] === 0x62 && b[s + 1] === 0x69 && b[s + 2] === 0x6e
          let v = 0
          let has = false
          if (b[p] === 0x2d) p++
          while (p < n && isDigit(b[p])) {
            if (v < 1e10) v = v * 10 + (b[p] - 0x30)
            has = true
            p++
          }
          if (p < n && b[p] === 0x20) p++
          if (bin && has) p = Math.min(n, p + v)
        } else p++
      }
    }
    this.pos = Math.min(p, n)
  }
}

/** Collects hexadecimal picture data (whitespace between digits ignored). */
export class HexSink {
  buf: Uint8Array
  len = 0
  private half = -1

  constructor(size = 1 << 16) {
    this.buf = new Uint8Array(size)
  }

  private room(k: number) {
    if (this.len + k <= this.buf.length) return
    let size = this.buf.length * 2
    while (size < this.len + k) size *= 2
    const next = new Uint8Array(size)
    next.set(this.buf.subarray(0, this.len))
    this.buf = next
  }

  hex(src: Uint8Array, s: number, e: number) {
    this.room(((e - s) >> 1) + 1)
    const buf = this.buf
    let len = this.len
    let half = this.half
    for (let k = s; k < e; k++) {
      const v = HEXV[src[k]]
      if (v < 0) continue
      if (half < 0) half = v
      else {
        buf[len++] = (half << 4) | v
        half = -1
      }
    }
    this.len = len
    this.half = half
  }

  raw(src: Uint8Array, s: number, e: number) {
    this.room(e - s)
    this.buf.set(src.subarray(s, e), this.len)
    this.len += e - s
    this.half = -1
  }

  bytes(): Uint8Array {
    return this.buf.subarray(0, this.len)
  }
}
