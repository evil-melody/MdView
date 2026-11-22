/**
 * PowerPoint binary records ([MS-PPT] 2.3, [MS-ODRAW] 2.1): an 8-byte header (version, instance, type, length),
 * then the body; containers (version 0xF) hold more records. Every read is bounds-checked: out-of-range reads give 0.
 */

/** record types used by the converter */
export const RT = {
  Document: 0x03e8,
  DocumentAtom: 0x03e9,
  Slide: 0x03ee,
  SlideAtom: 0x03ef,
  Notes: 0x03f0,
  NotesAtom: 0x03f1,
  Environment: 0x03f2,
  SlidePersistAtom: 0x03f3,
  MainMaster: 0x03f8,
  SlideShowSlideInfoAtom: 0x03f9,
  ExObjList: 0x0409,
  PPDrawingGroup: 0x040b,
  PPDrawing: 0x040c,
  List: 0x07d0,
  FontCollection: 0x07d5,
  ColorSchemeAtom: 0x07f0,
  OEPlaceholderAtom: 0x0bc3,
  OutlineTextRefAtom: 0x0f9e,
  TextHeaderAtom: 0x0f9f,
  TextCharsAtom: 0x0fa0,
  StyleTextPropAtom: 0x0fa1,
  MasterTextPropAtom: 0x0fa2,
  TxMasterStyleAtom: 0x0fa3,
  TextCFExceptionAtom: 0x0fa4,
  TextPFExceptionAtom: 0x0fa5,
  TextRulerAtom: 0x0fa6,
  TextBytesAtom: 0x0fa8,
  TextSpecInfoAtom: 0x0faa,
  CString: 0x0fba,
  FontEntityAtom: 0x0fb7,
  ExHyperlinkAtom: 0x0fd3,
  ExHyperlink: 0x0fd7,
  SlideNumberMCAtom: 0x0fd8,
  HeadersFooters: 0x0fd9,
  HeadersFootersAtom: 0x0fda,
  TxInteractiveInfoAtom: 0x0fdf,
  InteractiveInfo: 0x0ff2,
  InteractiveInfoAtom: 0x0ff3,
  UserEditAtom: 0x0ff5,
  CurrentUserAtom: 0x0ff6,
  DateTimeMCAtom: 0x0ff7,
  GenericDateMCAtom: 0x0ff8,
  HeaderMCAtom: 0x0ff9,
  FooterMCAtom: 0x0ffa,
  RTFDateTimeMCAtom: 0x1015,
  PersistDirectoryAtom: 0x1772,
  CryptSession10Container: 0x2f14,
  // OfficeArt
  DggContainer: 0xf000,
  BStoreContainer: 0xf001,
  DgContainer: 0xf002,
  SpgrContainer: 0xf003,
  SpContainer: 0xf004,
  FBSE: 0xf007,
  FSPGR: 0xf009,
  FSP: 0xf00a,
  FOPT: 0xf00b,
  ClientTextbox: 0xf00d,
  ChildAnchor: 0xf00f,
  ClientAnchor: 0xf010,
  ClientData: 0xf011,
  SecondaryFOPT: 0xf121,
  TertiaryFOPT: 0xf122,
} as const

const MAX_KIDS = 200000

/** A record: its header fields and its body inside a buffer (the body is cut to the buffer's end). */
export class Rec {
  private kidList?: Rec[]

  constructor(
    readonly buf: Uint8Array,
    /** offset of the header in `buf` */
    readonly at: number,
    readonly ver: number,
    readonly inst: number,
    readonly type: number,
    /** offset of the body in `buf` */
    readonly start: number,
    /** body length, cut to what the buffer holds */
    readonly len: number,
  ) {}

  /** the record at an offset of a buffer, or undefined when its header does not fit before `end` */
  static at(buf: Uint8Array, off: number, end = buf.length): Rec | undefined {
    if (off < 0 || off + 8 > end) return undefined
    const vi = buf[off] | (buf[off + 1] << 8)
    const type = buf[off + 2] | (buf[off + 3] << 8)
    const declared = (buf[off + 4] | (buf[off + 5] << 8) | (buf[off + 6] << 16) | (buf[off + 7] << 24)) >>> 0
    return new Rec(buf, off, vi & 0xf, vi >> 4, type, off + 8, Math.min(declared, end - off - 8))
  }

  /** offset just after the record */
  get end(): number {
    return this.start + this.len
  }

  get isContainer(): boolean {
    return this.ver === 0xf
  }

  u8(k: number): number {
    return k >= 0 && k < this.len ? this.buf[this.start + k] : 0
  }
  u16(k: number): number {
    return k >= 0 && k + 2 <= this.len ? this.buf[this.start + k] | (this.buf[this.start + k + 1] << 8) : 0
  }
  i16(k: number): number {
    return (this.u16(k) << 16) >> 16
  }
  u32(k: number): number {
    return k >= 0 && k + 4 <= this.len ? (this.buf[this.start + k] | (this.buf[this.start + k + 1] << 8) | (this.buf[this.start + k + 2] << 16) | (this.buf[this.start + k + 3] << 24)) >>> 0 : 0
  }
  i32(k: number): number {
    return this.u32(k) | 0
  }

  /** body bytes from `k` (to the end, or `n` bytes) */
  bytes(k = 0, n = this.len - k): Uint8Array {
    const a = Math.max(0, Math.min(this.len, k))
    return this.buf.subarray(this.start + a, this.start + Math.max(a, Math.min(this.len, a + Math.max(0, n))))
  }

  /** the records in the body (a container's children; any record's body can be read as records) */
  kids(): Rec[] {
    if (this.kidList) return this.kidList
    const out: Rec[] = []
    let off = this.start
    const end = this.end
    while (off + 8 <= end && out.length < MAX_KIDS) {
      const r = Rec.at(this.buf, off, end)
      if (!r) break
      out.push(r)
      off = r.end
    }
    this.kidList = out
    return out
  }

  /** the first child of a type (and instance) */
  kid(type: number, inst?: number): Rec | undefined {
    return this.kids().find((r) => r.type === type && (inst === undefined || r.inst === inst))
  }

  /** the children of a type */
  all(type: number, inst?: number): Rec[] {
    return this.kids().filter((r) => r.type === type && (inst === undefined || r.inst === inst))
  }

  /** the whole body as UTF-16LE (text atoms) */
  utf16Raw(): string {
    const b = this.bytes()
    const n = b.length >> 1
    const codes = new Uint16Array(n)
    for (let i = 0; i < n; i++) codes[i] = b[2 * i] | (b[2 * i + 1] << 8)
    let s = ''
    for (let i = 0; i < n; i += 8192) s += String.fromCharCode(...codes.subarray(i, i + 8192))
    return s
  }

  /** a UTF-16LE string body (CString), to the first NUL */
  utf16(k = 0, n = this.len - k): string {
    const b = this.bytes(k, n)
    let s = ''
    for (let i = 0; i + 1 < b.length; i += 2) {
      const c = b[i] | (b[i + 1] << 8)
      if (!c) break
      s += String.fromCharCode(c)
    }
    return s
  }
}
