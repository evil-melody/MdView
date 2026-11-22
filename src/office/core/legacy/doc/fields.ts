/** Fields of a Word binary document: their instructions, HYPERLINK targets, form field values; revision dates. */
import type { Bytes } from './bin'

export interface FieldInfo {
  sep: number
  end: number
  instr: string
  /** fields inside the instruction */
  nested: boolean
}

export interface Frame {
  begin: number
  mode: 'link' | 'complex' | 'drop'
  phase: 'instr' | 'result'
  link?: string
  /** the instruction was written whole at the start: its characters are skipped */
  skip?: boolean
  /** a form field's data (FFData offset in the Data stream) */
  form?: number
  instr?: string
}

/** field types (flt) → field names, for files that store localized names */
export const FLT: Record<number, string> = {
  3: 'REF', 10: 'STYLEREF', 12: 'SEQ', 13: 'TOC', 17: 'AUTHOR', 21: 'CREATEDATE', 22: 'SAVEDATE', 26: 'NUMPAGES', 29: 'FILENAME',
  31: 'DATE', 32: 'TIME', 33: 'PAGE', 37: 'PAGEREF', 58: 'EMBED', 59: 'MERGEFIELD', 66: 'SECTIONPAGES', 67: 'INCLUDEPICTURE',
  68: 'INCLUDETEXT', 70: 'FORMTEXT', 71: 'FORMCHECKBOX', 72: 'NOTEREF', 83: 'FORMDROPDOWN', 85: 'DOCPROPERTY', 88: 'HYPERLINK', 95: 'SHAPE',
}
export const FIELD_NAMES = new Set([...Object.values(FLT), 'IF', 'SET', 'ASK', 'FILLIN', 'SYMBOL', 'EQ', 'QUOTE', 'MACROBUTTON', 'GOTOBUTTON', 'LISTNUM', 'TC', 'XE', 'INDEX', 'TOA', 'TA', 'RD', 'PRINTDATE', 'EDITTIME', 'TITLE', 'SUBJECT', 'KEYWORDS', 'COMMENTS', 'LASTSAVEDBY', 'NUMWORDS', 'NUMCHARS', 'TEMPLATE', 'USERNAME', 'USERINITIALS', 'DOCVARIABLE', 'FILESIZE', 'SECTION', 'ADVANCE', 'BIDIOUTLINE', 'PRIVATE', 'ADDIN', 'CONTROL', 'LINK', 'INFO', 'REVNUM', 'NEXT', 'NEXTIF', 'SKIPIF', 'MERGEREC', 'MERGESEQ', 'DDE', 'DDEAUTO', 'AUTONUM', 'AUTONUMLGL', 'AUTONUMOUT', 'AUTOTEXT', 'AUTOTEXTLIST', 'BARCODE', 'COMPARE', 'DATABASE', 'GREETINGLINE', 'ADDRESSBLOCK', 'HTMLCONTROL', 'IMPORT', 'INCLUDE', 'GLOSSARY', 'PRINT', 'USERADDRESS'])

/** a form field's shown value: a check box's glyph, a drop-down's chosen entry (FFData in the Data stream) */
export function formValue(data: Bytes | undefined, fc: number): string | undefined {
  if (!data) return undefined
  const p0 = fc + data.u16(fc + 4)
  if (data.u32(p0) !== 0xffffffff) return undefined
  const bits = data.u16(p0 + 4)
  const type = bits & 3
  let res = (bits >> 2) & 0x1f
  let p = p0 + 10
  const skipXstz = () => (p += 2 + data.u16(p) * 2 + 2)
  skipXstz()
  if (type === 0) return undefined
  const def = data.u16(p)
  p += 2
  if (res === 25) res = def
  if (type === 1) return res ? '☒' : '☐'
  for (let k = 0; k < 5; k++) skipXstz()
  if (data.u16(p) !== 0xffff) return undefined
  const n = data.u16(p + 2)
  p += 6
  for (let k = 0; k < n && k < 1000; k++) {
    const cch = data.u16(p)
    if (k === res) return data.utf16(p + 2, cch)
    p += 2 + cch * 2
  }
  return undefined
}

/** DTTM (packed minutes / hours / day / month / year) → ISO date */
export function dttm(v: number): string | undefined {
  if (!v) return undefined
  const mi = v & 0x3f
  const hr = (v >> 6) & 0x1f
  const dom = (v >> 11) & 0x1f
  const mon = (v >>> 16) & 0xf
  const yr = 1900 + ((v >>> 20) & 0x1ff)
  if (!mon || mon > 12 || !dom) return undefined
  const p = (n: number) => String(n).padStart(2, '0')
  return `${yr}-${p(mon)}-${p(dom)}T${p(hr)}:${p(mi)}:00Z`
}

/** HYPERLINK instruction → target URL and / or bookmark */
export function hyperlink(instr: string): { url?: string; anchor?: string; tip?: string } | undefined {
  const m = /^\s*HYPERLINK\b([\s\S]*)$/i.exec(instr)
  if (!m) return undefined
  const toks = [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"|(\\[a-zA-Z])|(\S+)/g)].map((t) =>
    t[2] ? { sw: t[2].toLowerCase() } : { v: (t[1] ?? t[3] ?? '').replace(/\\(.)/g, '$1') },
  )
  const out: { url?: string; anchor?: string; tip?: string } = {}
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]
    if ('sw' in t) {
      const arg = toks[k + 1]
      if (t.sw === '\\m' || t.sw === '\\n') continue
      if (arg && 'v' in arg) {
        if (t.sw === '\\l') out.anchor = arg.v
        else if (t.sw === '\\o') out.tip = arg.v
        k++
      }
    } else if (out.url === undefined) out.url = t.v
  }
  return out.url || out.anchor ? out : undefined
}
