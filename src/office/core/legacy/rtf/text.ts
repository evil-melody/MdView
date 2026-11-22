/** Text of RTF groups: destinations, run text buffers, w:r output. */
import { decode } from './codepage'

// destinations: where a group's text goes
export const D_STORY = 0
export const D_NONE = 1
export const D_TEXT = 2
export const D_FONT = 3
export const D_COLOR = 4
export const D_PICT = 5
export const D_UPR = 6
export const D_STYLE = 7
export const D_SHEET = 8

/** small text (font and style names, field instructions, bookmark names, list level text) */
export class TextAcc {
  private parts: string[] = []
  private bytes: number[] = []
  private cp = 1252

  byte(b: number, cp: number) {
    if (this.bytes.length && cp !== this.cp) this.flush()
    this.cp = cp
    if (this.bytes.length < 1 << 20) this.bytes.push(b)
  }

  str(s: string) {
    this.flush()
    if (this.parts.length < 1 << 16) this.parts.push(s)
  }

  private flush() {
    if (!this.bytes.length) return
    this.parts.push(decode(Uint8Array.from(this.bytes), this.cp))
    this.bytes = []
  }

  text(): string {
    this.flush()
    return this.parts.join('')
  }
}

/** text of the run being read: bytes (decoded at the end, so double-byte characters stay whole) and characters */
export class RunBuf {
  private b = new Uint8Array(4096)
  private n = 0
  private cp = 1252
  private parts: string[] = []

  get empty() {
    return this.n === 0 && this.parts.length === 0
  }

  bytes(src: Uint8Array, s: number, e: number, cp: number) {
    if (this.n && cp !== this.cp) this.flushBytes()
    this.cp = cp
    const k = e - s
    if (this.n + k > this.b.length) {
      let size = this.b.length * 2
      while (size < this.n + k) size *= 2
      const next = new Uint8Array(size)
      next.set(this.b.subarray(0, this.n))
      this.b = next
    }
    this.b.set(src.subarray(s, e), this.n)
    this.n += k
  }

  byte(v: number, cp: number) {
    if (this.n && cp !== this.cp) this.flushBytes()
    this.cp = cp
    if (this.n >= this.b.length) {
      const next = new Uint8Array(this.b.length * 2)
      next.set(this.b)
      this.b = next
    }
    this.b[this.n++] = v
  }

  str(s: string) {
    this.flushBytes()
    this.parts.push(s)
  }

  private flushBytes() {
    if (!this.n) return
    this.parts.push(decode(this.b.subarray(0, this.n), this.cp))
    this.n = 0
  }

  take(): string {
    this.flushBytes()
    const s = this.parts.length === 1 ? this.parts[0] : this.parts.join('')
    this.parts = []
    return s
  }
}

const SPECIAL = /[\t\n\u000b\u00ad\u2011\u0000-\u0008\u000c-\u001f\ud800-\udfff\ufffe\uffff&<>]/
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** a w:r of text: tabs, breaks and hyphens become their elements; characters XML cannot hold are dropped */
export function runXml(text: string, rPr: string): string {
  if (!SPECIAL.test(text)) return `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>`
  let out = ''
  let buf = ''
  const flush = () => {
    if (buf) out += `<w:t xml:space="preserve">${esc(buf)}</w:t>`
    buf = ''
  }
  for (let k = 0; k < text.length; k++) {
    const c = text.charCodeAt(k)
    if (c === 9) {
      flush()
      out += '<w:tab/>'
    } else if (c === 10 || c === 11) {
      flush()
      out += '<w:br/>'
    } else if (c === 0xad) {
      flush()
      out += '<w:softHyphen/>'
    } else if (c === 0x2011) {
      flush()
      out += '<w:noBreakHyphen/>'
    } else if (c < 0x20 || c === 0xfffe || c === 0xffff) continue
    else if (c >= 0xd800 && c <= 0xdbff) {
      const d = text.charCodeAt(k + 1)
      if (d >= 0xdc00 && d <= 0xdfff) {
        buf += text[k] + text[k + 1]
        k++
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) continue
    else buf += text[k]
  }
  flush()
  return out ? `<w:r>${rPr}${out}</w:r>` : ''
}
