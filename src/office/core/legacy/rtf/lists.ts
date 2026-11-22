/** `\listtable` / `\listoverridetable` and legacy `\pn` paragraph numbering → numbering.xml. */
import { escAttr } from '../../raw'
import { levelInd, rPrSet, type Chp, type Pap, type Pn, type Tables } from './props'

export interface Level {
  nfc?: number
  jc?: number
  follow?: number
  start?: number
  legal?: boolean
  norestart?: boolean
  /** \leveltext as read: its length, then the text with level placeholders \'00-\'08 */
  text?: string
  ch: Chp
  pp: Pap
}

export interface ListDef {
  id?: number
  levels: Level[]
}

export interface Override {
  listid?: number
  ls?: number
  /** start-at overrides by level */
  starts: Map<number, number>
  /** \lfolevel groups seen */
  lfo: number
}

/** \levelnfc → w:numFmt */
const NFC: Record<number, string> = {
  0: 'decimal', 1: 'upperRoman', 2: 'lowerRoman', 3: 'upperLetter', 4: 'lowerLetter', 5: 'ordinal', 6: 'cardinalText',
  7: 'ordinalText', 10: 'japaneseCounting', 11: 'aiueo', 12: 'iroha', 13: 'decimalFullWidth', 14: 'decimalHalfWidth',
  16: 'japaneseDigitalTenThousand', 17: 'decimalEnclosedCircle', 18: 'decimalFullWidth2', 19: 'aiueoFullWidth',
  20: 'irohaFullWidth', 22: 'decimalZero', 23: 'bullet', 24: 'ganada', 25: 'chosung', 26: 'decimalEnclosedFullstop',
  27: 'decimalEnclosedParen', 28: 'decimalEnclosedCircleChinese', 29: 'ideographEnclosedCircle', 30: 'ideographTraditional',
  31: 'ideographZodiac', 32: 'ideographZodiacTraditional', 33: 'taiwaneseCounting', 34: 'ideographLegalTraditional',
  35: 'taiwaneseCountingThousand', 36: 'taiwaneseDigital', 37: 'chineseCounting', 38: 'chineseLegalSimplified',
  39: 'chineseCountingThousand', 41: 'koreanDigital', 42: 'koreanCounting', 43: 'koreanLegal', 44: 'koreanDigital2',
  45: 'hebrew1', 46: 'arabicAlpha', 47: 'hebrew2', 48: 'arabicAbjad', 49: 'hindiVowels', 50: 'hindiConsonants',
  51: 'hindiNumbers', 52: 'hindiCounting', 53: 'thaiLetters', 54: 'thaiNumbers', 55: 'thaiCounting', 56: 'vietnameseCounting',
  57: 'numberInDash', 58: 'russianLower', 59: 'russianUpper', 255: 'none',
}

const PN_FMT: Record<string, string> = {
  pndec: 'decimal', pnucrm: 'upperRoman', pnlcrm: 'lowerRoman', pnucltr: 'upperLetter', pnlcltr: 'lowerLetter',
  pnord: 'ordinal', pncard: 'cardinalText', pnordt: 'ordinalText', pndecd: 'decimalZero',
}
export const pnFormat = (w: string) => PN_FMT[w]

/** symbol-font bullets: their bytes as Word's U+F0xx code points */
function symbolText(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    out += c >= 0x20 && c < 0x100 ? String.fromCharCode(0xf000 + c) : ch
  }
  return out
}

function lvlText(lv: Level, symbol: boolean): string {
  const raw = lv.text ?? ''
  let body = raw.length ? raw.slice(1, 1 + raw.charCodeAt(0)) : ''
  if (raw.length && raw.charCodeAt(0) > raw.length - 1) body = raw.slice(1)
  let out = ''
  for (const ch of body) {
    const c = ch.charCodeAt(0)
    out += c < 9 ? `%${c + 1}` : symbol && c >= 0x20 && c < 0x100 ? String.fromCharCode(0xf000 + c) : ch
  }
  return out
}

export class Numbering {
  readonly lists: ListDef[] = []
  readonly overrides = new Map<number, Override>()
  /** \pnseclvlN: legacy outline numbering levels */
  readonly pnSec: Pn[] = []
  private pnAbstract = new Map<string, number>()
  private pnLevels: string[] = []
  private pnNums: string[] = []
  private nextPn = 0

  constructor(private t: Tables) {}

  private isSymbol(f: number | undefined): boolean {
    return f !== undefined && this.t.fonts.get(f)?.charset === 2
  }

  /** a paragraph's list (\lsN) exists */
  has(ls: number): boolean {
    const o = this.overrides.get(ls)
    return !!o && this.lists.some((l) => l.id === o.listid)
  }

  private levelXml(lv: Level, k: number): string {
    const fmt = NFC[lv.nfc ?? 0] ?? 'decimal'
    let text = lvlText(lv, this.isSymbol(lv.ch.f))
    if (fmt === 'bullet' && !text) text = '•'
    const suff = lv.follow === 1 ? 'space' : lv.follow === 2 ? 'nothing' : 'tab'
    const jc = lv.jc === 1 ? 'center' : lv.jc === 2 ? 'right' : 'left'
    const ind = levelInd(lv.pp) || `<w:ind w:left="${720 * (k + 1)}" w:hanging="360"/>`
    const rPr = rPrSet(this.t, lv.ch)
    return (
      `<w:lvl w:ilvl="${k}"><w:start w:val="${lv.start ?? 1}"/><w:numFmt w:val="${fmt}"/>` +
      (lv.norestart ? '<w:lvlRestart w:val="0"/>' : '') +
      (lv.legal ? '<w:isLgl/>' : '') +
      (suff !== 'tab' ? `<w:suff w:val="${suff}"/>` : '') +
      `<w:lvlText w:val="${escAttr(text)}"/><w:lvlJc w:val="${jc}"/><w:pPr>${ind}</w:pPr>` +
      (rPr ? `<w:rPr>${rPr}</w:rPr>` : '') +
      '</w:lvl>'
    )
  }

  /** numId of a legacy `\pn` paragraph, or undefined (\pnlvlcont: no number) */
  pn(pn: Pn, prev: { key?: string; num?: number }): { num: number; ilvl: number } | undefined {
    if (pn.lvl === 'cont' || pn.lvl === undefined) return undefined
    if (!this.nextPn) this.nextPn = Math.max(0, ...this.overrides.keys()) + 1
    const outline = typeof pn.lvl === 'number'
    const ilvl = outline ? Math.max(0, Math.min(8, (pn.lvl as number) - 1)) : 0
    const key = outline ? 'outline' : JSON.stringify({ ...pn, start: undefined })
    let abs = this.pnAbstract.get(key)
    if (abs === undefined) {
      abs = this.lists.length + this.pnAbstract.size
      this.pnAbstract.set(key, abs)
      let levels = ''
      for (let k = 0; k < 9; k++) {
        const p: Pn = outline ? { ...this.pnSec[k + 1], ...(k === ilvl ? pn : {}) } : k === 0 ? pn : {}
        levels += this.pnLevel(p, k, outline || k === 0)
      }
      this.pnLevels.push(`<w:abstractNum w:abstractNumId="${abs}"><w:multiLevelType w:val="${outline ? 'multilevel' : 'singleLevel'}"/>${levels}</w:abstractNum>`)
    }
    if (prev.key === key && prev.num !== undefined) return { num: prev.num, ilvl }
    const num = this.nextPn++
    this.pnNums.push(`<w:num w:numId="${num}"><w:abstractNumId w:val="${abs}"/>${pn.start !== undefined && pn.start !== 1 ? `<w:lvlOverride w:ilvl="${ilvl}"><w:startOverride w:val="${pn.start}"/></w:lvlOverride>` : ''}</w:num>`)
    prev.key = key
    prev.num = num
    return { num, ilvl }
  }

  private pnLevel(p: Pn, k: number, real: boolean): string {
    const bullet = p.lvl === 'blt'
    const fmt = bullet ? 'bullet' : (p.fmt ?? 'decimal')
    const sym = this.isSymbol(p.f)
    let text = bullet ? (p.before ?? '•') : `${p.before ?? ''}%${k + 1}${p.after ?? ''}`
    if (bullet && sym) text = symbolText(text)
    const ch: Chp = { f: p.f, fs: p.fs, b: p.b, i: p.i }
    const rPr = real ? rPrSet(this.t, ch) : ''
    const indent = p.indent && p.indent > 0 ? p.indent : 360
    return (
      `<w:lvl w:ilvl="${k}"><w:start w:val="${p.start ?? 1}"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${escAttr(text)}"/><w:lvlJc w:val="left"/>` +
      `<w:pPr><w:ind w:left="${indent * (k + 1)}" w:hanging="${indent}"/></w:pPr>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}</w:lvl>`
    )
  }

  /** numbering.xml content, or undefined when the document has no lists */
  xml(): string | undefined {
    let abs = ''
    let nums = ''
    const listIndex = new Map<number, number>()
    this.lists.forEach((l, k) => {
      if (l.id === undefined || listIndex.has(l.id)) return
      listIndex.set(l.id, k)
      const levels = l.levels.slice(0, 9).map((lv, i) => this.levelXml(lv, i)).join('')
      abs += `<w:abstractNum w:abstractNumId="${k}"><w:multiLevelType w:val="${l.levels.length > 1 ? 'hybridMultilevel' : 'singleLevel'}"/>${levels}</w:abstractNum>`
    })
    for (const [ls, o] of this.overrides) {
      const k = o.listid === undefined ? undefined : listIndex.get(o.listid)
      if (k === undefined || ls <= 0) continue
      let over = ''
      for (const [lvl, start] of o.starts) over += `<w:lvlOverride w:ilvl="${lvl}"><w:startOverride w:val="${start}"/></w:lvlOverride>`
      nums += `<w:num w:numId="${ls}"><w:abstractNumId w:val="${k}"/>${over}</w:num>`
    }
    abs += this.pnLevels.join('')
    nums += this.pnNums.join('')
    if (!nums) return undefined
    return abs + nums
  }
}
