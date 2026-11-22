/**
 * PowerPoint text → DrawingML paragraphs. Properties are resolved the way PowerPoint does (document defaults, the
 * master's text style of the text type and indent level, lower levels, the base type, the ruler, the runs' own) and
 * written on every paragraph and run, so the result does not depend on placeholder inheritance.
 */
import { escAttr, escText } from '../../raw'
import type { PptDocument } from './document'
import { Rec, RT } from './records'
import { readCF, readMasterStyle, readPF, TX, type CF, type Field, type MasterLevel, type PF, type TextBlock } from './text'

/** master units (576 per inch) → EMU */
export const emu = (mu: number) => Math.round(mu * 1587.5)

/** the text style a text type falls back to */
const BASE: Record<number, number> = { [TX.centerBody]: TX.body, [TX.halfBody]: TX.body, [TX.quarterBody]: TX.body, [TX.centerTitle]: TX.title }

/** The text styles in effect for a main master: document defaults and the master's TxMasterStyleAtoms. */
export class TextStyles {
  private levels = new Map<number, MasterLevel[]>()
  private docPF: PF = {}
  private docCF: CF = {}

  constructor(doc: PptDocument, master: Rec | undefined) {
    const env = doc.doc.kid(RT.Environment)
    const cf = env?.kid(RT.TextCFExceptionAtom)
    if (cf) this.docCF = readCF(cf, 0)[0]
    const pf = env?.kid(RT.TextPFExceptionAtom)
    if (pf) this.docPF = readPF(pf, 2)[0]
    for (const r of env?.all(RT.TxMasterStyleAtom) ?? []) this.levels.set(r.inst, readMasterStyle(r))
    for (const r of master?.all(RT.TxMasterStyleAtom) ?? []) this.levels.set(r.inst, readMasterStyle(r))
  }

  /** master style records from least to most specific for a text type and level */
  private chain(type: number, level: number): MasterLevel[] {
    const out: MasterLevel[] = []
    const add = (t: number) => {
      const lv = this.levels.get(t)
      if (lv) for (let i = 0; i <= level && i < lv.length; i++) if (lv[i]) out.push(lv[i])
    }
    const base = BASE[type]
    if (base !== undefined) add(base)
    add(type)
    return out
  }

  pf(type: number, level: number): PF {
    return Object.assign({}, this.docPF, ...this.chain(type, level).map((l) => l.pf))
  }

  cf(type: number, level: number): CF {
    return Object.assign({ size: 18 }, this.docCF, ...this.chain(type, level).map((l) => l.cf))
  }

  has(type: number): boolean {
    return this.levels.has(type)
  }
}

export interface TextEnv {
  doc: PptDocument
  styles: TextStyles
  /** the color scheme in effect */
  scheme: string[]
  /** hlinkClick for an InteractiveInfo container ('' when none) */
  link: (info: Rec) => string
  /** the slide number (undefined on masters and layouts: a slide number field) */
  slideNumber?: number
  /** values of the date, footer and header fields; the headers and footers date format */
  values?: { date?: string; footer?: string; header?: string; dateFormat?: number }
}

/** ColorIndexStruct → RRGGBB */
export function colorIndex(v: number | undefined, scheme: string[]): string | undefined {
  if (v === undefined) return undefined
  const idx = v >>> 24
  if (idx === 0xfe) return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()
  if (idx < 8) return scheme[idx]
  return undefined
}

const ALGN = ['l', 'ctr', 'r', 'just', 'dist', 'thaiDist', 'justLow']
const TAB = ['l', 'ctr', 'r', 'dec']

/** symbol-font bullet characters → Unicode (shown in any font) */
const WINGDINGS: Record<number, string> = {
  0x6c: '●', 0x6e: '■', 0x6f: '□', 0x70: '▫', 0x71: '❑', 0x72: '❒', 0x73: '⬧', 0x74: '⧫', 0x75: '◆',
  0x76: '❖', 0x77: '⬥', 0x9f: '•', 0xa1: '○', 0xa7: '▪', 0xa8: '◻', 0xd8: '➢', 0xe0: '→', 0xe8: '➔',
  0xf0: '⇨', 0xfb: '✗', 0xfc: '✔', 0xfe: '☑', 0x4a: '☺', 0x7a: '⌘', 0xab: '★', 0x3e: '✆', 0xb2: '✧',
}
const SYMBOL: Record<number, string> = { 0xb7: '•', 0xa8: '♦', 0xa7: '♣', 0xa9: '♥', 0xaa: '♠', 0xae: '→', 0xde: '⇒', 0xe0: '◊', 0x2d: '−', 0xb0: '°', 0x2a: '∗', 0xd7: '⋅' }
const DINGBATS: Record<number, string> = { 0x6c: '●', 0x6e: '■', 0x6f: '❏', 0x71: '❑', 0x73: '▲', 0x74: '▼', 0x75: '◆', 0x76: '❖', 0x48: '★', 0x33: '✓', 0x34: '✔' }

/** a bullet character in its font → [character, font to write] */
export function bulletChar(code: number | undefined, font: string | undefined): [string, string | undefined] {
  let c = code || 0x2022
  if (c >= 0xf000 && c <= 0xf0ff) c -= 0xf000
  const f = (font ?? '').toLowerCase()
  const map = f.startsWith('wingdings') ? WINGDINGS : f === 'symbol' ? SYMBOL : f.includes('dingbats') || f.includes('sorts') ? DINGBATS : undefined
  if (map) return [map[c] ?? '•', 'Arial']
  if (c < 0x20 || (c >= 0x7f && c < 0xa0)) return ['•', font]
  return [String.fromCharCode(c), font]
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** spacing (percent of a line, or negative: master units) */
function spacing(tag: string, v: number | undefined): string {
  if (v === undefined) return ''
  if (v >= 0) return `<a:${tag}><a:spcPct val="${clamp(Math.round(v * 1000), 0, tag === 'lnSpc' ? 13200000 : 13200000)}"/></a:${tag}>`
  return `<a:${tag}><a:spcPts val="${clamp(Math.round(-v * 12.5), 0, 158400)}"/></a:${tag}>`
}

/** automatic numbering schemes (ANM) → DrawingML */
const AUTONUM = [
  'alphaLcPeriod', 'alphaUcPeriod', 'arabicParenR', 'arabicPeriod', 'romanLcParenBoth', 'romanLcParenR', 'romanLcPeriod', 'romanUcPeriod',
  'alphaLcParenBoth', 'alphaLcParenR', 'alphaUcParenBoth', 'alphaUcParenR', 'arabicParenBoth', 'arabicPlain', 'romanUcParenBoth', 'romanUcParenR',
  'ea1ChsPlain', 'ea1ChsPeriod', 'circleNumDbPlain', 'circleNumWdWhitePlain', 'circleNumWdBlackPlain', 'thaiAlphaPeriod', 'thaiAlphaParenR',
  'thaiAlphaParenBoth', 'thaiNumPeriod', 'thaiNumParenR', 'thaiNumParenBoth', 'hindiAlphaPeriod', 'hindiNumPeriod', 'ea1JpnChsDbPeriod',
  'ea1ChtPlain', 'ea1ChtPeriod', 'arabic1Minus', 'arabic2Minus', 'hebrew2Minus', 'ea1JpnKorPlain', 'ea1JpnKorPeriod', 'arabicDbPlain', 'arabicDbPeriod',
]

/** pPr attributes and children for resolved paragraph properties; `cf` gives the bullet's default font, size and color */
function pPrParts(pf: PF, cf: CF, level: number, env: TextEnv, hasText: boolean, num?: { scheme: number; start: number }): { attrs: string; kids: string } {
  const left = pf.leftMargin ?? 0
  const first = pf.indent ?? 0
  let attrs = ` marL="${clamp(emu(left), 0, 51206400)}" indent="${clamp(emu(first - left), -51206400, 51206400)}"`
  if (level) attrs += ` lvl="${Math.min(level, 8)}"`
  attrs += ` algn="${ALGN[pf.align ?? 0] ?? 'l'}"`
  if (pf.textDirection === 1) attrs += ' rtl="1"'
  if (pf.defaultTab) attrs += ` defTabSz="${clamp(emu(pf.defaultTab), 0, 51206400)}"`
  let kids = spacing('lnSpc', pf.lineSpacing) + spacing('spcBef', pf.spaceBefore) + spacing('spcAft', pf.spaceAfter)
  if (pf.bullet && hasText) {
    const color = pf.bulletHasColor ? colorIndex(pf.bulletColor, env.scheme) : undefined
    if (color) kids += `<a:buClr><a:srgbClr val="${color}"/></a:buClr>`
    if (pf.bulletHasSize && pf.bulletSize && pf.bulletSize > 0) kids += `<a:buSzPct val="${clamp(pf.bulletSize * 1000, 25000, 400000)}"/>`
    const font = pf.bulletHasFont ? env.doc.font(pf.bulletFont) : env.doc.font(cf.font)
    if (num) {
      if (pf.bulletHasFont && font) kids += `<a:buFont typeface="${escAttr(font)}"/>`
      kids += `<a:buAutoNum type="${AUTONUM[num.scheme] ?? 'arabicPeriod'}"${num.start > 1 ? ` startAt="${Math.min(num.start, 32767)}"` : ''}/>`
    } else {
      const [ch, buFont] = bulletChar(pf.bulletChar, font)
      if (buFont) kids += `<a:buFont typeface="${escAttr(buFont)}"/>`
      kids += `<a:buChar char="${escAttr(ch)}"/>`
    }
  } else kids += '<a:buNone/>'
  if (pf.tabs?.length) {
    const tabs = pf.tabs.slice(0, 32).map((t) => `<a:tab pos="${clamp(emu(t.pos), 0, 51206400)}" algn="${TAB[t.type] ?? 'l'}"/>`)
    kids += `<a:tabLst>${tabs.join('')}</a:tabLst>`
  }
  return { attrs, kids }
}

/** run properties (`tag`: rPr, endParaRPr or defRPr); `link` an hlinkClick element */
export function rPrXml(cf: CF, env: TextEnv, tag: string, link = ''): string {
  let a = tag === 'defRPr' ? '' : ' lang="en-US"'
  if (cf.size) a += ` sz="${clamp(Math.round(cf.size * 100), 100, 400000)}"`
  if (cf.bold !== undefined) a += ` b="${cf.bold ? 1 : 0}"`
  if (cf.italic !== undefined) a += ` i="${cf.italic ? 1 : 0}"`
  if (cf.underline || link) a += ' u="sng"'
  else if (cf.underline === false && tag !== 'defRPr') a += ' u="none"'
  if (cf.position) a += ` baseline="${clamp(cf.position * 1000, -100000, 100000)}"`
  if (tag !== 'defRPr') a += ' dirty="0"'
  const color = link ? (env.scheme[6] ?? colorIndex(cf.color, env.scheme)) : colorIndex(cf.color, env.scheme)
  let x = color ? `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` : ''
  const font = env.doc.font(cf.font)
  if (font) {
    const f = escAttr(font)
    const ea = escAttr(env.doc.font(cf.eaFont) ?? font)
    x += `<a:latin typeface="${f}"/><a:ea typeface="${ea}"/><a:cs typeface="${f}"/>`
  }
  if (tag === 'rPr') x += link
  return x ? `<a:${tag}${a}>${x}</a:${tag}>` : `<a:${tag}${a}/>`
}

/** the a:lvlNpPr of a master text style level */
export function lvlXml(n: number, pf: PF, cf: CF, env: TextEnv): string {
  const { attrs, kids } = pPrParts(pf, cf, 0, env, true)
  return `<a:lvl${n}pPr${attrs}>${kids}${rPrXml(cf, env, 'defRPr')}</a:lvl${n}pPr>`
}

/** characters removed from run text (fields and breaks are handled before) */
const CONTROL = /[\u0000-\u0008\u000c\u000e-\u001f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g

let fieldSeq = 0

/** the a:p elements of a text */
export function paragraphsXml(block: TextBlock, env: TextEnv): string {
  const text = block.text
  // run boundaries: paragraph runs, character runs, links
  const pfAt = runIndex(block.pfRuns.length ? block.pfRuns : block.levels.map((l) => ({ ...l, pf: {} as PF })))
  const cfAt = runIndex(block.cfRuns)
  const linkAt = (i: number) => block.links.find((l) => i >= l.start && i < l.end)
  let out = ''
  let start = 0
  const paras = text.split('\r')
  for (let pi = 0; pi < paras.length; pi++) {
    const para = paras[pi]
    const end = start + para.length
    const pr = pfAt(start)
    const level = Math.min(pr?.level ?? 0, 8)
    const ruler = block.ruler
    const pfRuler: PF = {}
    if (ruler) {
      const lv = Math.min(level, 4)
      if (ruler.leftMargin[lv] !== undefined) pfRuler.leftMargin = ruler.leftMargin[lv]
      if (ruler.indent[lv] !== undefined) pfRuler.indent = ruler.indent[lv]
      if (ruler.defaultTab !== undefined) pfRuler.defaultTab = ruler.defaultTab
      if (ruler.tabs?.length) pfRuler.tabs = ruler.tabs
    }
    const pf: PF = { ...env.styles.pf(block.type, level), ...pfRuler, ...(pr?.pf ?? {}) }
    const baseCF = env.styles.cf(block.type, level)
    const cfOf = (i: number): CF => ({ ...baseCF, ...(cfAt(i)?.cf ?? {}) })

    // segments of equal character properties and link
    let runs = ''
    let i = start
    while (i < end) {
      const field = block.fields.get(i)
      const cf = cfOf(i)
      const link = linkAt(i)
      const linkXml = link ? env.link(link.info) : ''
      if (field) {
        runs += fieldXml(field, cf, env, linkXml)
        i++
        continue
      }
      const ch = text[i]
      if (ch === '\u000b') {
        runs += `<a:br>${rPrXml(cf, env, 'rPr')}</a:br>`
        i++
        continue
      }
      let j = i + 1
      const runEnd = cfAt(i)?.end ?? end
      while (j < end && j < runEnd && text[j] !== '\u000b' && !block.fields.has(j) && linkAt(j) === link) j++
      const t = text.slice(i, j).replace(CONTROL, '')
      if (t) runs += `<a:r>${rPrXml(cf, env, 'rPr', linkXml)}<a:t>${escText(t)}</a:t></a:r>`
      i = j
    }
    const hasText = /<a:(r|fld)[ >]/.test(runs)
    const firstCF = cfOf(start)
    const pp9 = cfAt(start)?.cf.pp9rt ?? 0
    const num = pp9 !== undefined ? block.pf9?.[pp9]?.num : undefined
    const { attrs, kids } = pPrParts(pf, firstCF, level, env, hasText, num ?? undefined)
    out += `<a:p><a:pPr${attrs}>${kids}</a:pPr>${runs}${rPrXml(cfOf(end), env, 'endParaRPr')}</a:p>`
    start = end + 1
  }
  return out
}

/** a field: the slide number, a date, the footer or header text */
function fieldXml(field: Field, cf: CF, env: TextEnv, link: string): string {
  const rPr = rPrXml(cf, env, 'rPr', link)
  const id = `{B6F15528-21DE-4FAA-801E-${(++fieldSeq).toString(16).padStart(12, '0').toUpperCase()}}`
  if (field.kind === 'slidenum') return `<a:fld id="${id}" type="slidenum">${rPr}<a:t>${env.slideNumber ?? '‹#›'}</a:t></a:fld>`
  if (field.kind === 'date') {
    // a footer's date on a slide: the slide's value (a fixed date, or today's)
    if (field.format === undefined && env.slideNumber !== undefined && env.values?.date !== undefined) {
      const t = env.values.date
      return t ? `<a:r>${rPr}<a:t>${escText(t)}</a:t></a:r>` : ''
    }
    const format = Math.min(12, field.format ?? env.values?.dateFormat ?? 0)
    return `<a:fld id="${id}" type="datetime${format + 1}">${rPr}<a:t>${escText(dateText(format))}</a:t></a:fld>`
  }
  const t = field.kind === 'footer' ? env.values?.footer : env.values?.header
  return t ? `<a:r>${rPr}<a:t>${escText(t)}</a:t></a:r>` : ''
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** a date in one of PowerPoint's 13 date / time formats (US English) */
export function dateText(format = 0, d = new Date()): string {
  const M = d.getMonth() + 1
  const D = d.getDate()
  const Y = d.getFullYear()
  const yy = String(Y).slice(2)
  const p2 = (n: number) => String(n).padStart(2, '0')
  const H = d.getHours()
  const h = H % 12 || 12
  const ap = H < 12 ? 'AM' : 'PM'
  const mm = p2(d.getMinutes())
  const ss = p2(d.getSeconds())
  const month = MONTHS[M - 1]
  switch (format) {
    case 1:
      return `${DAYS[d.getDay()]}, ${month} ${p2(D)}, ${Y}`
    case 2:
      return `${D} ${month} ${Y}`
    case 3:
      return `${month} ${D}, ${Y}`
    case 4:
      return `${D}-${month.slice(0, 3)}-${yy}`
    case 5:
      return `${month} ${yy}`
    case 6:
      return `${month.slice(0, 3)}-${yy}`
    case 7:
      return `${M}/${D}/${Y} ${h}:${mm} ${ap}`
    case 8:
      return `${M}/${D}/${Y} ${h}:${mm}:${ss} ${ap}`
    case 9:
      return `${H}:${mm}`
    case 10:
      return `${H}:${mm}:${ss}`
    case 11:
      return `${h}:${mm} ${ap}`
    case 12:
      return `${h}:${mm}:${ss} ${ap}`
    default:
      return `${M}/${D}/${Y}`
  }
}

/** a lookup of the run covering a character (runs given by their lengths); the last run extends to the end */
function runIndex<T extends { count: number }>(runs: T[]): (i: number) => (T & { end: number }) | undefined {
  const ends: number[] = []
  let at = 0
  for (const r of runs) ends.push((at += Math.max(0, r.count)))
  return (i: number) => {
    if (!runs.length) return undefined
    let lo = 0
    let hi = runs.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (ends[mid] > i) hi = mid
      else lo = mid + 1
    }
    return { ...runs[lo], end: lo === runs.length - 1 ? Infinity : ends[lo] }
  }
}
