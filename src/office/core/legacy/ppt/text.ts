/**
 * PowerPoint text ([MS-PPT] 2.9): the characters of a text (TextCharsAtom / TextBytesAtom, paragraphs end with
 * CR), its paragraph and character runs (StyleTextPropAtom: TextPFException / TextCFException), the master text
 * styles (TxMasterStyleAtom, per text type and indent level), rulers, fields and hyperlinked ranges.
 */
import { Rec, RT } from './records'

/** paragraph properties (lengths in master units, 576 per inch) */
export interface PF {
  bullet?: boolean
  bulletHasFont?: boolean
  bulletHasColor?: boolean
  bulletHasSize?: boolean
  bulletChar?: number
  bulletFont?: number
  /** percent of the text size (negative: points) */
  bulletSize?: number
  /** ColorIndexStruct */
  bulletColor?: number
  /** 0 left, 1 center, 2 right, 3 justify, 4 distributed, 5 Thai distributed, 6 justify low */
  align?: number
  /** percent of a line (100 single), negative: master units */
  lineSpacing?: number
  spaceBefore?: number
  spaceAfter?: number
  /** where the text starts */
  leftMargin?: number
  /** where the first line (the bullet) starts */
  indent?: number
  defaultTab?: number
  tabs?: { pos: number; type: number }[]
  textDirection?: number
}

/** character properties */
export interface CF {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  shadow?: boolean
  font?: number
  eaFont?: number
  symbolFont?: number
  /** points */
  size?: number
  /** ColorIndexStruct */
  color?: number
  /** superscript (positive) / subscript (negative) percent */
  position?: number
  /** index of the run's extra properties in the PowerPoint 2000 StyleTextProp9Atom */
  pp9rt?: number
}

/** PowerPoint 2000 paragraph extras (TextPFException9): automatic numbering */
export interface PF9 {
  /** numbering scheme and start, null: bullets without numbers */
  num?: { scheme: number; start: number } | null
}

export interface MasterLevel {
  pf: PF
  cf: CF
}

/** text types of TextHeaderAtom / TxMasterStyleAtom */
export const TX = { title: 0, body: 1, notes: 2, other: 4, centerBody: 5, centerTitle: 6, halfBody: 7, quarterBody: 8 }

/** reads a TextPFException at `k`; returns it with the offset after it */
export function readPF(r: Rec, k: number): [PF, number] {
  const pf: PF = {}
  const m = r.u32(k)
  k += 4
  if (m & 0xf) {
    const f = r.u16(k)
    k += 2
    if (m & 1) pf.bullet = !!(f & 1)
    if (m & 2) pf.bulletHasFont = !!(f & 2)
    if (m & 4) pf.bulletHasColor = !!(f & 4)
    if (m & 8) pf.bulletHasSize = !!(f & 8)
  }
  if (m & 0x80) (pf.bulletChar = r.u16(k)), (k += 2)
  if (m & 0x10) (pf.bulletFont = r.u16(k)), (k += 2)
  if (m & 0x40) (pf.bulletSize = r.i16(k)), (k += 2)
  if (m & 0x20) (pf.bulletColor = r.u32(k)), (k += 4)
  if (m & 0x800) (pf.align = r.u16(k)), (k += 2)
  if (m & 0x1000) (pf.lineSpacing = r.i16(k)), (k += 2)
  if (m & 0x2000) (pf.spaceBefore = r.i16(k)), (k += 2)
  if (m & 0x4000) (pf.spaceAfter = r.i16(k)), (k += 2)
  if (m & 0x100) (pf.leftMargin = r.i16(k)), (k += 2)
  if (m & 0x400) (pf.indent = r.i16(k)), (k += 2)
  if (m & 0x8000) (pf.defaultTab = r.u16(k)), (k += 2)
  if (m & 0x100000) {
    const n = Math.min(r.u16(k), 256)
    k += 2
    pf.tabs = []
    for (let i = 0; i < n; i++, k += 4) pf.tabs.push({ pos: r.i16(k), type: r.u16(k + 2) })
  }
  if (m & 0x10000) k += 2
  if (m & 0xe0000) k += 2
  if (m & 0x200000) (pf.textDirection = r.u16(k)), (k += 2)
  return [pf, k]
}

/** reads a TextCFException at `k`; returns it with the offset after it */
export function readCF(r: Rec, k: number): [CF, number] {
  const cf: CF = {}
  const m = r.u32(k)
  k += 4
  if (m & 0xffff) {
    const f = r.u16(k)
    k += 2
    if (m & 1) cf.bold = !!(f & 1)
    if (m & 2) cf.italic = !!(f & 2)
    if (m & 4) cf.underline = !!(f & 4)
    if (m & 0x10) cf.shadow = !!(f & 0x10)
    if (m & 0x3c00) cf.pp9rt = (f >> 10) & 0xf
  }
  if (m & 0x10000) (cf.font = r.u16(k)), (k += 2)
  if (m & 0x200000) (cf.eaFont = r.u16(k)), (k += 2)
  if (m & 0x400000) k += 2
  if (m & 0x800000) (cf.symbolFont = r.u16(k)), (k += 2)
  if (m & 0x20000) (cf.size = r.u16(k)), (k += 2)
  if (m & 0x40000) (cf.color = r.u32(k)), (k += 4)
  if (m & 0x80000) (cf.position = r.i16(k)), (k += 2)
  return [cf, k]
}

/** a TxMasterStyleAtom: the styles of indent levels 0-4 */
export function readMasterStyle(r: Rec): MasterLevel[] {
  const out: MasterLevel[] = []
  const n = Math.min(r.u16(0), 9)
  let k = 2
  for (let i = 0; i < n && k < r.len; i++) {
    let level = i
    if (r.inst >= 5) (level = r.u16(k)), (k += 2)
    const [pf, k2] = readPF(r, k)
    const [cf, k3] = readCF(r, k2)
    k = k3
    if (level < 9) out[level] = { pf, cf }
  }
  return out
}

/** StyleTextProp9Atom: per run group, the numbering of its paragraphs (character and spelling extras skipped) */
export function readStyle9(r: Rec): PF9[] {
  const out: PF9[] = []
  let k = 0
  while (k + 12 <= r.len && out.length < 10000) {
    const m = r.u32(k)
    k += 4
    const pf: PF9 = {}
    if (m & 0x800000) k += 2
    let has: boolean | undefined
    if (m & 0x2000000) (has = !!r.u16(k)), (k += 2)
    let scheme: { scheme: number; start: number } | undefined
    if (m & 0x1000000) (scheme = { scheme: r.u16(k), start: r.u16(k + 2) }), (k += 4)
    if (has !== undefined) pf.num = has ? (scheme ?? { scheme: 3, start: 1 }) : null
    // TextCFException9
    const cm = r.u32(k)
    k += 4
    if (cm & 0x100000) k += 4
    // TextSIException
    const sm = r.u32(k)
    k += 4
    for (const bit of [0, 1, 2, 6]) if (sm & (1 << bit)) k += 2
    if (sm & 0x20) k += 4
    if (sm & 0x200) k += 4 + Math.min(r.u32(k), 10000) * 4
    out.push(pf)
  }
  return out
}

/** the records of a container's programmable binary tag ("___PPT9": PowerPoint 2000 extensions, "___PPT10": 2002) */
export function progTag(container: Rec | undefined, name: string): Rec[] {
  for (const tags of container?.all(0x1388) ?? []) {
    for (const tag of tags.all(0x138a)) {
      if (tag.kid(RT.CString)?.utf16() !== name) continue
      const blob = tag.kid(0x138b)
      if (blob) return blob.kids()
    }
  }
  return []
}

export const ppt9 = (container: Rec | undefined) => progTag(container, '___PPT9')

/** TextRulerAtom: per-level margins and tabs */
export interface Ruler {
  defaultTab?: number
  tabs?: { pos: number; type: number }[]
  leftMargin: (number | undefined)[]
  indent: (number | undefined)[]
}

export function readRuler(r: Rec): Ruler {
  const m = r.u32(0)
  let k = 4
  const out: Ruler = { leftMargin: [], indent: [] }
  for (const bit of [1, 0, 2, 3, 8, 4, 9, 5, 10, 6, 11, 7, 12]) {
    if (!(m & (1 << bit))) continue
    if (bit === 0) out.defaultTab = r.u16(k)
    else if (bit === 2) {
      const n = Math.min(r.u16(k), 256)
      out.tabs = []
      for (let i = 0; i < n; i++) out.tabs.push({ pos: r.i16(k + 2 + i * 4), type: r.u16(k + 4 + i * 4) })
      k += n * 4
    } else if (bit >= 3 && bit <= 7) out.leftMargin[bit - 3] = r.i16(k)
    else if (bit >= 8) out.indent[bit - 8] = r.i16(k)
    k += 2
  }
  return out
}

export type FieldKind = 'slidenum' | 'date' | 'footer' | 'header'

/** a field character; dates may carry their format (DateTimeMCAtom), others use the headers and footers format */
export interface Field {
  kind: FieldKind
  format?: number
}

/** a text with its runs, as stored */
export interface TextBlock {
  /** TextHeaderAtom text type */
  type: number
  text: string
  pfRuns: { count: number; level: number; pf: PF }[]
  cfRuns: { count: number; cf: CF }[]
  /** MasterTextPropAtom levels (when there are no paragraph runs) */
  levels: { count: number; level: number }[]
  ruler?: Ruler
  /** hyperlinked ranges: [start, end) with the InteractiveInfo container */
  links: { start: number; end: number; info: Rec }[]
  /** a field character (slide number, date, header, footer) by position */
  fields: Map<number, Field>
  /** numbering by run group (CF pp9rt) */
  pf9?: PF9[]
}

/** Reads the text records of a ClientTextbox or of a SlideListWithText entry (several sources may be combined). */
export function readText(...sources: Rec[][]): TextBlock | undefined {
  let header: Rec | undefined
  let chars: string | undefined
  let style: Rec | undefined
  const block: TextBlock = { type: TX.other, text: '', pfRuns: [], cfRuns: [], levels: [], links: [], fields: new Map() }
  for (const recs of sources) {
    let info: Rec | undefined
    for (const r of recs) {
      switch (r.type) {
        case RT.TextHeaderAtom:
          header ??= r
          break
        case RT.TextCharsAtom:
          chars ??= r.utf16Raw()
          break
        case RT.TextBytesAtom:
          chars ??= latin1(r.bytes())
          break
        case RT.StyleTextPropAtom:
          style ??= r
          break
        case RT.MasterTextPropAtom:
          if (!block.levels.length) for (let k = 0; k + 6 <= r.len && block.levels.length < 10000; k += 6) block.levels.push({ count: r.u32(k), level: r.u16(k + 4) })
          break
        case RT.TextRulerAtom:
          block.ruler ??= readRuler(r)
          break
        case RT.InteractiveInfo:
          info = r.inst === 0 ? r : info
          break
        case RT.TxInteractiveInfoAtom:
          if (info && r.inst === 0) block.links.push({ start: r.u32(0), end: r.u32(4), info })
          break
        case RT.SlideNumberMCAtom:
          block.fields.set(r.u32(0), { kind: 'slidenum' })
          break
        case RT.DateTimeMCAtom:
          block.fields.set(r.u32(0), { kind: 'date', format: r.u8(4) })
          break
        case RT.RTFDateTimeMCAtom:
          block.fields.set(r.u32(0), { kind: 'date', format: 0 })
          break
        case RT.GenericDateMCAtom:
          block.fields.set(r.u32(0), { kind: 'date' })
          break
        case RT.HeaderMCAtom:
          block.fields.set(r.u32(0), { kind: 'header' })
          break
        case RT.FooterMCAtom:
          block.fields.set(r.u32(0), { kind: 'footer' })
          break
      }
    }
  }
  if (chars === undefined) return undefined
  block.type = header?.u32(0) ?? TX.other
  block.text = chars
  if (style) readStyleRuns(style, chars.length + 1, block)
  return block
}

function latin1(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192))
  return s
}

/** StyleTextPropAtom: paragraph runs, then character runs, each covering `total` characters */
function readStyleRuns(r: Rec, total: number, block: TextBlock) {
  let k = 0
  for (let covered = 0; covered < total && k + 6 <= r.len && block.pfRuns.length < 100000; ) {
    const count = r.u32(k)
    const level = r.u16(k + 4)
    const [pf, k2] = readPF(r, k + 6)
    k = k2
    block.pfRuns.push({ count, level: Math.min(level, 8), pf })
    covered += Math.max(1, count)
  }
  for (let covered = 0; covered < total && k + 4 <= r.len && block.cfRuns.length < 100000; ) {
    const count = r.u32(k)
    const [cf, k2] = readCF(r, k + 4)
    k = k2
    block.cfRuns.push({ count, cf })
    covered += Math.max(1, count)
  }
}
