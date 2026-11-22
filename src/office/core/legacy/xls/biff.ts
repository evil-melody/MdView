/**
 * BIFF records ([MS-XLS]): the record ids read, a reader over a record and its CONTINUE records, the string forms of
 * BIFF8 (16-bit or "compressed" 8-bit characters) and BIFF5 (8-bit characters in the workbook's code page).
 */

/** record ids */
export const R = {
  FORMULA: 0x0006,
  EOF: 0x000a,
  HEADER: 0x0014,
  FOOTER: 0x0015,
  EXTERNSHEET: 0x0017,
  NAME: 0x0018,
  VERTICALPAGEBREAKS: 0x001a,
  HORIZONTALPAGEBREAKS: 0x001b,
  NOTE: 0x001c,
  DATEMODE: 0x0022,
  EXTERNNAME: 0x0023,
  LEFTMARGIN: 0x0026,
  RIGHTMARGIN: 0x0027,
  TOPMARGIN: 0x0028,
  BOTTOMMARGIN: 0x0029,
  PRINTHEADERS: 0x002a,
  PRINTGRIDLINES: 0x002b,
  FILEPASS: 0x002f,
  FONT: 0x0031,
  CONTINUE: 0x003c,
  WINDOW1: 0x003d,
  PANE: 0x0041,
  CODEPAGE: 0x0042,
  DEFCOLWIDTH: 0x0055,
  OBJ: 0x005d,
  PROTECT: 0x0012,
  PASSWORD: 0x0013,
  COLINFO: 0x007d,
  WSBOOL: 0x0081,
  HCENTER: 0x0083,
  VCENTER: 0x0084,
  BOUNDSHEET: 0x0085,
  PALETTE: 0x0092,
  AUTOFILTERINFO: 0x009d,
  STANDARDWIDTH: 0x0099,
  SCL: 0x00a0,
  SETUP: 0x00a1,
  MULRK: 0x00bd,
  MULBLANK: 0x00be,
  RSTRING: 0x00d6,
  XF: 0x00e0,
  MERGECELLS: 0x00e5,
  SST: 0x00fc,
  LABELSST: 0x00fd,
  SUPBOOK: 0x01ae,
  TXO: 0x01b6,
  HLINK: 0x01b8,
  BLANK: 0x0201,
  NUMBER: 0x0203,
  LABEL: 0x0204,
  BOOLERR: 0x0205,
  STRING: 0x0207,
  ROW: 0x0208,
  ARRAY: 0x0221,
  DEFAULTROWHEIGHT: 0x0225,
  WINDOW2: 0x023e,
  RK: 0x027e,
  STYLE: 0x0293,
  FORMAT: 0x041e,
  SHRFMLA: 0x04bc,
  HLINKTOOLTIP: 0x0800,
  BOF: 0x0809,
  SHEETEXT: 0x0862,
  XFEXT: 0x087d,
  CONTINUEFRT12: 0x087f,
  THEME: 0x0896,
} as const

/** BIFF error codes → their text */
export const ERRORS: Record<number, string> = {
  0x00: '#NULL!',
  0x07: '#DIV/0!',
  0x0f: '#VALUE!',
  0x17: '#REF!',
  0x1d: '#NAME?',
  0x24: '#NUM!',
  0x2a: '#N/A',
  0x2b: '#N/A',
}

/** the value of an RK number (a 30-bit integer or the high bits of a double, optionally ×100) */
export function rkValue(rk: number): number {
  let v: number
  if (rk & 2) v = rk >> 2
  else {
    RK_VIEW.setUint32(0, 0, true)
    RK_VIEW.setUint32(4, (rk & 0xfffffffc) >>> 0, true)
    v = RK_VIEW.getFloat64(0, true)
  }
  return rk & 1 ? v / 100 : v
}
const RK_VIEW = new DataView(new ArrayBuffer(8))

const ENCODINGS: Record<number, string> = {
  437: 'windows-1252',
  850: 'windows-1252',
  866: 'ibm866',
  874: 'windows-874',
  932: 'shift_jis',
  936: 'gbk',
  949: 'euc-kr',
  950: 'big5',
  1200: 'utf-16le',
  1250: 'windows-1250',
  1251: 'windows-1251',
  1252: 'windows-1252',
  1253: 'windows-1253',
  1254: 'windows-1254',
  1255: 'windows-1255',
  1256: 'windows-1256',
  1257: 'windows-1257',
  1258: 'windows-1258',
  10000: 'macintosh',
  10007: 'x-mac-cyrillic',
  32768: 'macintosh',
  32769: 'windows-1252',
}

/** a decoder of 8-bit text in a Windows code page (BIFF5 strings); Latin-1 when the code page is unknown */
export function codepageDecoder(cp: number): (b: Uint8Array) => string {
  const label = ENCODINGS[cp] ?? 'windows-1252'
  let td: TextDecoder | undefined
  try {
    td = new TextDecoder(label === 'utf-16le' ? 'windows-1252' : label)
  } catch {
    td = undefined
  }
  return td ? (b) => td!.decode(b) : latin1
}

/** 8-bit characters as their code points (BIFF8 "compressed" strings: the low bytes of UTF-16) */
export function latin1(b: Uint8Array, start = 0, n = b.length - start): string {
  if (n < 32) {
    let s = ''
    for (let i = 0; i < n; i++) s += String.fromCharCode(b[start + i])
    return s
  }
  const parts: string[] = []
  for (let i = 0; i < n; i += 8192) parts.push(String.fromCharCode.apply(null, b.subarray(start + i, start + Math.min(n, i + 8192)) as unknown as number[]))
  return parts.join('')
}

const UTF16 = new TextDecoder('utf-16le', { ignoreBOM: true })

/** 16-bit characters (little-endian) */
export function utf16(b: Uint8Array, start: number, n: number): string {
  if (n < 16) {
    let s = ''
    for (let i = 0; i < n; i++) s += String.fromCharCode(b[start + 2 * i] | (b[start + 2 * i + 1] << 8))
    return s
  }
  return UTF16.decode(b.subarray(start, start + 2 * n))
}

/** a string of a BIFF8 record (no CONTINUE): `cch` characters at `at` after a flag byte, 16-bit when its bit 0 is set */
export function str8At(b: Uint8Array, at: number, cch: number): { text: string; end: number } {
  if (at >= b.length) return { text: '', end: at }
  const flags = b[at]
  let p = at + 1
  let runs = 0
  let ext = 0
  if (flags & 8) {
    runs = b[p] | (b[p + 1] << 8)
    p += 2
  }
  if (flags & 4) {
    ext = (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0
    p += 4
  }
  const high = flags & 1
  const n = Math.max(0, Math.min(cch, Math.floor((b.length - p) / (high ? 2 : 1))))
  const text = high ? utf16(b, p, n) : latin1(b, p, n)
  return { text, end: p + n * (high ? 2 : 1) + runs * 4 + ext }
}

/**
 * A record's data and the CONTINUE records after it, read as one: numbers and raw bytes run on into the next part,
 * while the characters of a BIFF8 string start each part with a new flag byte (8-bit or 16-bit).
 */
export class Parts {
  private k = 0
  private pos = 0
  private cur: Uint8Array

  constructor(private parts: Uint8Array[]) {
    this.cur = parts[0] ?? new Uint8Array(0)
  }

  /** nothing left to read */
  get eof(): boolean {
    while (this.pos >= this.cur.length) if (!this.next()) return true
    return false
  }

  /** at the end of the current part */
  get atPartEnd(): boolean {
    return this.pos >= this.cur.length
  }

  private next(): boolean {
    if (this.k + 1 >= this.parts.length) return false
    this.cur = this.parts[++this.k]
    this.pos = 0
    return true
  }

  u8(): number {
    while (this.pos >= this.cur.length) if (!this.next()) return 0
    return this.cur[this.pos++]
  }

  u16(): number {
    if (this.pos + 2 <= this.cur.length) {
      const v = this.cur[this.pos] | (this.cur[this.pos + 1] << 8)
      this.pos += 2
      return v
    }
    return this.u8() | (this.u8() << 8)
  }

  u32(): number {
    return (this.u16() + this.u16() * 0x10000) >>> 0
  }

  f64(): number {
    const b = this.bytes(8)
    return b.length === 8 ? new DataView(b.buffer, b.byteOffset, 8).getFloat64(0, true) : 0
  }

  skip(n: number): void {
    while (n > 0) {
      const avail = this.cur.length - this.pos
      if (avail <= 0) {
        if (!this.next()) return
        continue
      }
      const take = Math.min(avail, n)
      this.pos += take
      n -= take
    }
  }

  bytes(n: number): Uint8Array {
    if (this.pos + n <= this.cur.length) {
      const b = this.cur.subarray(this.pos, this.pos + n)
      this.pos += n
      return b
    }
    const out: number[] = []
    for (let i = 0; i < n && !this.eof; i++) out.push(this.u8())
    return Uint8Array.from(out)
  }

  /** `n` characters, 16-bit when `high`: a part boundary in between starts with a flag byte giving the new width */
  chars(n: number, high: boolean): string {
    let out = ''
    for (let guard = 0; n > 0 && guard <= this.parts.length; ) {
      const avail = this.cur.length - this.pos
      const fit = high ? avail >> 1 : avail
      if (fit <= 0) {
        if (!this.next()) break
        guard++
        high = (this.cur[this.pos++] & 1) === 1
        continue
      }
      const take = Math.min(n, fit)
      out += high ? utf16(this.cur, this.pos, take) : latin1(this.cur, this.pos, take)
      this.pos += high ? take * 2 : take
      n -= take
    }
    return out
  }

  /**
   * A BIFF8 string with its header (`lenBytes`: 1 or 2 bytes of length) and the rich-text runs ([character, font]) and
   * phonetic data after it (skipped).
   */
  str(lenBytes: 1 | 2): { text: string; runs?: number[] } {
    const cch = lenBytes === 1 ? this.u8() : this.u16()
    const flags = this.u8()
    const nRuns = flags & 8 ? this.u16() : 0
    const ext = flags & 4 ? this.u32() : 0
    const text = this.chars(cch, (flags & 1) === 1)
    let runs: number[] | undefined
    if (nRuns) {
      runs = []
      for (let i = 0; i < nRuns && !this.eof; i++) runs.push(this.u16(), this.u16())
    }
    this.skip(ext)
    return runs ? { text, runs } : { text }
  }
}
