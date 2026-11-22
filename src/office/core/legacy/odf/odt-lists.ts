/** OpenDocument list styles (text:list-style, text:outline-style) → WordprocessingML numbering definitions. */
import { escAttr } from '../../raw'
import { child, children, type ONode, toPt } from './common'
import { rPrXml, tw, type RP } from './odt-props'

/** what a list level does to its paragraphs */
export interface Level {
  /** shows a label (bullet or number) */
  labeled: boolean
  /** left indent of the text and hanging of the label (negative: first line indent), points */
  left: number
  hanging: number
  /** label-width-and-position mode: the indents add to the paragraph's own left margin */
  relative: boolean
  start: number
}

const NUM_FMT: Record<string, string> = { '1': 'decimal', a: 'lowerLetter', A: 'upperLetter', i: 'lowerRoman', I: 'upperRoman', '': 'none' }

function numFmt(f: string | undefined): string {
  if (f === undefined) return 'decimal'
  if (f in NUM_FMT) return NUM_FMT[f]
  if (/^0+1\b/.test(f)) return 'decimalZero'
  if (/^1st/i.test(f)) return 'ordinal'
  if (/^one\b/i.test(f)) return 'cardinalText'
  if (/^first\b/i.test(f)) return 'ordinalText'
  if (/^a\b/.test(f)) return 'lowerLetter'
  if (/^A\b/.test(f)) return 'upperLetter'
  return 'decimal'
}

const LEVEL_KINDS = new Set(['text:list-level-style-number', 'text:outline-level-style', 'text:list-level-style-bullet', 'text:list-level-style-image'])

/** symbol fonts whose private-use characters Word shows (others' become a plain bullet) */
const SYMBOL_FONT = /^(symbol|wingdings.*|webdings)$/i

interface Abstract {
  id: number
  levels: Level[]
}

/** The numbering part being built: one abstract numbering per list style, instances (w:num) per list. */
export class OdtNumbering {
  private abs = new Map<ONode, Abstract>()
  private absXml: string[] = []
  private nums: { abs: number; starts: Record<number, number> | null }[] = []
  private shared = new Map<ONode, number>()

  /** `charProps`: the run properties of a character style (bullet and number labels) */
  constructor(private charProps: (name: string | undefined) => RP) {}

  private abstract(ls: ONode): Abstract {
    let a = this.abs.get(ls)
    if (a) return a
    const defs = new Map<number, ONode>()
    for (const el of children(ls)) {
      if (!LEVEL_KINDS.has(el.name)) continue
      const l = Number(el.attrs['text:level'] ?? 1) - 1
      if (l >= 0 && l < 9 && !defs.has(l)) defs.set(l, el)
    }
    const levels: Level[] = []
    let xml = ''
    for (let l = 0; l < 9; l++) {
      const { level, lvl } = this.level(defs.get(l), l)
      levels.push(level)
      xml += lvl
    }
    a = { id: this.absXml.length + 1, levels }
    this.absXml.push(`<w:abstractNum w:abstractNumId="${a.id}"><w:multiLevelType w:val="multilevel"/>${xml}</w:abstractNum>`)
    this.abs.set(ls, a)
    return a
  }

  private level(el: ONode | undefined, l: number): { level: Level; lvl: string } {
    if (!el) {
      const left = 36 * (l + 1)
      return {
        level: { labeled: false, left, hanging: 0, relative: false, start: 1 },
        lvl: `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="none"/><w:lvlText w:val=""/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${tw(left)}" w:hanging="0"/></w:pPr></w:lvl>`,
      }
    }
    const a = el.attrs
    const propsEl = child(el, 'style:list-level-properties')
    const p = propsEl?.attrs ?? {}
    let left: number
    let hanging: number
    let relative = false
    let suff = 'tab'
    let tabPos: number | undefined
    if (p['text:list-level-position-and-space-mode'] === 'label-alignment') {
      const la = child(propsEl, 'style:list-level-label-alignment')?.attrs ?? {}
      left = toPt(la['fo:margin-left']) ?? 0
      hanging = -(toPt(la['fo:text-indent']) ?? 0)
      const follow = la['text:label-followed-by']
      suff = follow === 'space' ? 'space' : follow === 'nothing' ? 'nothing' : 'tab'
      tabPos = toPt(la['text:list-tab-stop-position'])
    } else {
      const before = toPt(p['text:space-before']) ?? 0
      const width = toPt(p['text:min-label-width']) ?? 0
      left = before + width
      hanging = width
      relative = true
    }
    const align = p['fo:text-align']
    const jc = align === 'end' || align === 'right' ? 'right' : align === 'center' ? 'center' : 'left'
    let fmt: string
    let text: string
    let start = 1
    let rp = this.charProps(a['text:style-name'])
    if (el.name === 'text:list-level-style-bullet' || el.name === 'text:list-level-style-image') {
      fmt = 'bullet'
      text = el.name === 'text:list-level-style-image' ? '•' : (a['text:bullet-char'] ?? '•').slice(0, 2) || '•'
      const code = text.charCodeAt(0)
      if (code >= 0xe000 && code <= 0xf8ff && !SYMBOL_FONT.test(rp.font ?? '')) {
        text = '•'
        rp = { ...rp, font: undefined }
      } else if (!(code >= 0xe000 && code <= 0xf8ff)) rp = { ...rp, font: undefined }
    } else {
      fmt = numFmt(a['style:num-format'])
      const sv = Math.floor(Number(a['text:start-value'] ?? 1))
      start = Number.isFinite(sv) && sv >= 0 ? Math.min(sv, 32767) : 1
      const shown = Math.max(1, Math.min(l + 1, Number(a['text:display-levels'] ?? 1) || 1))
      const nums = fmt === 'none' ? '' : Array.from({ length: shown }, (_, k) => `%${l + 2 - shown + k}`).join('.')
      text = (a['style:num-prefix'] ?? '') + nums + (a['style:num-suffix'] ?? '')
    }
    const labeled = fmt !== 'none' || text !== ''
    delete rp.u
    const ind = hanging > 0 ? ` w:hanging="${tw(hanging)}"` : hanging < 0 ? ` w:firstLine="${tw(-hanging)}"` : ' w:hanging="0"'
    const tabs = suff === 'tab' && tabPos !== undefined && Math.abs(tabPos - left) > 0.5 && tabPos > left - hanging ? `<w:tabs><w:tab w:val="num" w:pos="${tw(tabPos)}"/></w:tabs>` : ''
    const lvl =
      `<w:lvl w:ilvl="${l}"><w:start w:val="${start}"/><w:numFmt w:val="${fmt}"/>${suff !== 'tab' ? `<w:suff w:val="${suff}"/>` : ''}` +
      `<w:lvlText w:val="${escAttr(text)}"/><w:lvlJc w:val="${jc}"/><w:pPr>${tabs}<w:ind w:left="${tw(left)}"${ind}/></w:pPr>${rPrXml(rp)}</w:lvl>`
    return { level: { labeled, left, hanging, relative, start }, lvl }
  }

  /** the levels of a list style */
  levels(ls: ONode): Level[] {
    return this.abstract(ls).levels
  }

  /** a new instance of a list style, numbered from the level starts (or `starts` for some levels) */
  restart(ls: ONode, starts: Record<number, number> = {}): number {
    const a = this.abstract(ls)
    const all: Record<number, number> = {}
    a.levels.forEach((lv, l) => (all[l] = starts[l] ?? lv.start))
    this.nums.push({ abs: a.id, starts: all })
    return this.nums.length
  }

  /** the one instance of a list style whose numbers never restart (bullet lists) */
  share(ls: ONode): number {
    let n = this.shared.get(ls)
    if (n === undefined) {
      this.nums.push({ abs: this.abstract(ls).id, starts: null })
      n = this.nums.length
      this.shared.set(ls, n)
    }
    return n
  }

  /** changes where an instance starts at a level (before any of its paragraphs is numbered there) */
  setStart(numId: number, level: number, start: number) {
    const n = this.nums[numId - 1]
    if (n?.starts) n.starts[level] = start
  }

  /** whether a list style numbers a level (not bullets nor nothing) */
  numbered(ls: ONode, level: number): boolean {
    const el = children(ls).find((e) => LEVEL_KINDS.has(e.name) && Number(e.attrs['text:level'] ?? 1) - 1 === level)
    return !!el && (el.name === 'text:list-level-style-number' || el.name === 'text:outline-level-style') && numFmt(el.attrs['style:num-format']) !== 'none'
  }

  get empty(): boolean {
    return !this.nums.length
  }

  xml(ns: string): string {
    const nums = this.nums.map(({ abs, starts }, k) => {
      const over = starts ? Object.entries(starts).map(([l, v]) => `<w:lvlOverride w:ilvl="${l}"><w:startOverride w:val="${v}"/></w:lvlOverride>`).join('') : ''
      return `<w:num w:numId="${k + 1}"><w:abstractNumId w:val="${abs}"/>${over}</w:num>`
    })
    return `<w:numbering ${ns}>${this.absXml.join('')}${nums.join('')}</w:numbering>`
  }
}
