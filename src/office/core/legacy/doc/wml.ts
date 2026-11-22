/** Word binary properties → WordprocessingML: run (w:rPr), paragraph (w:pPr), section (w:sectPr) and list levels. */
import { escAttr } from '../../raw'
import { applyPap, DEFAULT_PAP, type Brc, type Chp, type Pap, type Sep, type Tab } from './props'
import type { Font, Lvl } from './styles'

/** brcType → w:val */
const BRC: Record<number, string> = {
  1: 'single', 2: 'thick', 3: 'double', 5: 'single', 6: 'dotted', 7: 'dashed', 8: 'dotDash', 9: 'dotDotDash', 10: 'triple',
  11: 'thinThickSmallGap', 12: 'thickThinSmallGap', 13: 'thinThickThinSmallGap', 14: 'thinThickMediumGap', 15: 'thickThinMediumGap',
  16: 'thinThickThinMediumGap', 17: 'thinThickLargeGap', 18: 'thickThinLargeGap', 19: 'thinThickThinLargeGap', 20: 'wave',
  21: 'doubleWave', 22: 'dashSmallGap', 23: 'dashDotStroked', 24: 'threeDEmboss', 25: 'threeDEngrave', 26: 'outset', 27: 'inset',
}

/** a border element (`w:val="nil"` for none) */
export function brcXml(tag: string, b: Brc): string {
  if (!b) return `<w:${tag} w:val="nil"/>`
  const val = BRC[b.t] ?? 'single'
  const sz = b.t === 5 ? 2 : Math.max(2, Math.min(96, b.w || 4))
  return `<w:${tag} w:val="${val}" w:sz="${sz}" w:space="${Math.min(31, b.sp)}" w:color="${b.c}"${b.sh ? ' w:shadow="1"' : ''}/>`
}

const sameBrc = (a: Brc | undefined, b: Brc | undefined) =>
  a === b || (!!a && !!b && a.t === b.t && a.w === b.w && a.c === b.c && a.sp === b.sp && a.sh === b.sh) || (!a && !b)

const HIGHLIGHT = ['none', 'black', 'blue', 'cyan', 'green', 'magenta', 'red', 'yellow', 'white', 'darkBlue', 'darkCyan', 'darkGreen', 'darkMagenta', 'darkRed', 'darkYellow', 'darkGray', 'lightGray']

/** kul → w:u val */
const UNDERLINE: Record<number, string> = {
  0: 'none', 1: 'single', 2: 'words', 3: 'double', 4: 'dotted', 6: 'thick', 7: 'dash', 9: 'dotDash', 10: 'dotDotDash', 11: 'wave',
  20: 'dottedHeavy', 23: 'dashedHeavy', 25: 'dashDotHeavy', 26: 'dashDotDotHeavy', 27: 'wavyHeavy', 39: 'dashLong', 43: 'wavyDouble', 55: 'dashLongHeavy',
}

const EM = ['none', 'dot', 'comma', 'circle', 'underDot']

const onOff = (tag: string, v: boolean) => (v ? `<w:${tag}/>` : `<w:${tag} w:val="0"/>`)

export const fontName = (fonts: Font[], i: number) => fonts[i]?.name ?? fonts[0]?.name ?? 'Times New Roman'

/**
 * w:rPr content of a run whose properties are `c`, written as the differences from `base` (what the styles give).
 * `extra` goes first (w:rStyle).
 */
export function rPrInner(c: Chp, base: Chp, fonts: Font[], extra = ''): string {
  let x = extra
  if (c.f0 !== base.f0 || c.f1 !== base.f1 || c.f2 !== base.f2 || c.fBi !== base.fBi) {
    const f = (i: number) => escAttr(fontName(fonts, i))
    let a = ''
    if (c.f0 !== base.f0) a += ` w:ascii="${f(c.f0)}"`
    if (c.f2 !== base.f2) a += ` w:hAnsi="${f(c.f2)}"`
    if (c.f1 !== base.f1) a += ` w:eastAsia="${f(c.f1)}"`
    if (c.fBi !== base.fBi) a += ` w:cs="${f(c.fBi)}"`
    x += `<w:rFonts${a}/>`
  }
  if (c.b !== base.b) x += onOff('b', c.b)
  if (c.bCs !== base.bCs) x += onOff('bCs', c.bCs)
  if (c.i !== base.i) x += onOff('i', c.i)
  if (c.iCs !== base.iCs) x += onOff('iCs', c.iCs)
  if (c.caps !== base.caps) x += onOff('caps', c.caps)
  if (c.smallCaps !== base.smallCaps) x += onOff('smallCaps', c.smallCaps)
  if (c.strike !== base.strike) x += onOff('strike', c.strike)
  if (c.dstrike !== base.dstrike) x += onOff('dstrike', c.dstrike)
  if (c.outline !== base.outline) x += onOff('outline', c.outline)
  if (c.shadow !== base.shadow) x += onOff('shadow', c.shadow)
  if (c.emboss !== base.emboss) x += onOff('emboss', c.emboss)
  if (c.imprint !== base.imprint) x += onOff('imprint', c.imprint)
  if (c.noProof !== base.noProof) x += onOff('noProof', c.noProof)
  if (c.vanish !== base.vanish) x += onOff('vanish', c.vanish)
  if (c.webHidden !== base.webHidden) x += onOff('webHidden', c.webHidden)
  if (c.color !== base.color) x += `<w:color w:val="${c.color}"/>`
  if (c.space !== base.space) x += `<w:spacing w:val="${c.space}"/>`
  if (c.scale !== base.scale && c.scale > 0 && c.scale <= 600) x += `<w:w w:val="${c.scale}"/>`
  if (c.kern !== base.kern) x += `<w:kern w:val="${c.kern}"/>`
  if (c.pos !== base.pos) x += `<w:position w:val="${c.pos}"/>`
  if (c.hps !== base.hps) x += `<w:sz w:val="${c.hps}"/>`
  if (c.hpsBi !== base.hpsBi) x += `<w:szCs w:val="${c.hpsBi}"/>`
  if (c.hl !== base.hl) x += `<w:highlight w:val="${HIGHLIGHT[c.hl] ?? 'none'}"/>`
  if (c.kul !== base.kul || (c.kul && c.cvUl !== base.cvUl)) x += `<w:u w:val="${UNDERLINE[c.kul] ?? 'single'}"${c.kul && c.cvUl !== 'auto' ? ` w:color="${c.cvUl}"` : ''}/>`
  if (!sameBrc(c.brc, base.brc)) x += brcXml('bdr', c.brc)
  if (c.shd !== base.shd) x += `<w:shd w:val="clear" w:color="auto" w:fill="${c.shd || 'auto'}"/>`
  if (c.iss !== base.iss) x += `<w:vertAlign w:val="${c.iss === 1 ? 'superscript' : c.iss === 2 ? 'subscript' : 'baseline'}"/>`
  if (c.rtl !== base.rtl) x += onOff('rtl', c.rtl)
  if (c.kcd !== base.kcd) x += `<w:em w:val="${EM[c.kcd] ?? 'none'}"/>`
  if (c.specVanish !== base.specVanish) x += onOff('specVanish', c.specVanish)
  return x
}

export const rPrXml = (c: Chp, base: Chp, fonts: Font[], extra = '') => {
  const x = rPrInner(c, base, fonts, extra)
  return x ? `<w:rPr>${x}</w:rPr>` : ''
}

const TAB_JC = ['left', 'center', 'right', 'decimal', 'bar', 'left', 'num', 'left']
const TAB_LEADER = ['none', 'dot', 'hyphen', 'underscore', 'heavy', 'middleDot', 'none', 'none']

function tabsXml(tabs: Tab[], base: Tab[]): string {
  let x = ''
  const all = new Map<number, string>()
  for (const t of base) if (!tabs.some((u) => u.pos === t.pos && u.jc === t.jc && u.tlc === t.tlc)) all.set(t.pos, `<w:tab w:val="clear" w:pos="${t.pos}"/>`)
  for (const t of tabs) {
    if (base.some((u) => u.pos === t.pos && u.jc === t.jc && u.tlc === t.tlc)) continue
    all.set(t.pos, `<w:tab w:val="${TAB_JC[t.jc]}"${t.tlc ? ` w:leader="${TAB_LEADER[t.tlc]}"` : ''} w:pos="${t.pos}"/>`)
  }
  for (const k of [...all.keys()].sort((a, b) => a - b)) x += all.get(k)
  return x ? `<w:tabs>${x}</w:tabs>` : ''
}

const JC = ['left', 'center', 'right', 'both', 'distribute', 'both', 'left', 'both', 'both', 'thaiDistribute']

const X_ALIGN: Record<number, string> = { [-4]: 'center', [-8]: 'right', [-12]: 'inside', [-16]: 'outside' }
const Y_ALIGN: Record<number, string> = { [-4]: 'top', [-8]: 'center', [-12]: 'bottom', [-16]: 'inside', [-20]: 'outside' }

/** w:framePr of a positioned paragraph (a frame), '' for others */
function framePr(a: Pap): string {
  if (!a.pc && !a.xAbs && !a.yAbs && !a.wAbs) return ''
  const pc = a.pc & 0xff
  const v = ['margin', 'page', 'text'][(pc >> 4) & 3] ?? 'text'
  const h = ['text', 'margin', 'page'][(pc >> 6) & 3] ?? 'text'
  let x = ''
  if (a.wAbs > 0) x += ` w:w="${a.wAbs}"`
  if (a.hAbs & 0x7fff) x += ` w:h="${a.hAbs & 0x7fff}" w:hRule="${a.hAbs & 0x8000 ? 'atLeast' : 'exact'}"`
  if (a.fromX) x += ` w:hSpace="${a.fromX}"`
  if (a.fromY) x += ` w:vSpace="${a.fromY}"`
  x += ` w:wrap="${a.wr === 1 ? 'notBeside' : a.wr === 3 ? 'none' : a.wr === 4 ? 'tight' : a.wr === 5 ? 'through' : 'around'}"`
  x += ` w:vAnchor="${v}" w:hAnchor="${h}"`
  x += X_ALIGN[a.xAbs] ? ` w:xAlign="${X_ALIGN[a.xAbs]}"` : ` w:x="${a.xAbs}"`
  x += Y_ALIGN[a.yAbs] ? ` w:yAlign="${Y_ALIGN[a.yAbs]}"` : ` w:y="${a.yAbs}"`
  return `<w:framePr${x}/>`
}

export interface PExtra {
  style?: string
  numPr?: string
  markRPr?: string
  sectPr?: string
  /** keep with next (table rows that hold together) */
  keepNext?: boolean
}

/** w:pPr of a paragraph whose properties are `a`, written as the differences from `base` */
export function pPrXml(a: Pap, base: Pap, e: PExtra = {}): string {
  let x = e.style ? `<w:pStyle w:val="${e.style}"/>` : ''
  if (a.keepNext !== base.keepNext) x += onOff('keepNext', a.keepNext)
  if (a.keep !== base.keep) x += onOff('keepLines', a.keep)
  if (a.pbb !== base.pbb) x += onOff('pageBreakBefore', a.pbb)
  const frame = framePr(a)
  if (frame && frame !== framePr(base)) x += frame
  if (a.widow !== base.widow) x += onOff('widowControl', a.widow)
  if (e.numPr) x += e.numPr
  if (a.noLnn !== base.noLnn) x += onOff('suppressLineNumbers', a.noLnn)
  const sides: [keyof Pap, string][] = [['bTop', 'top'], ['bLeft', 'left'], ['bBottom', 'bottom'], ['bRight', 'right'], ['bBetween', 'between'], ['bBar', 'bar']]
  let bdr = ''
  for (const [k, tag] of sides) if (!sameBrc(a[k] as Brc, base[k] as Brc)) bdr += brcXml(tag, a[k] as Brc)
  if (bdr) x += `<w:pBdr>${bdr}</w:pBdr>`
  if (a.shd !== base.shd) x += `<w:shd w:val="clear" w:color="auto" w:fill="${a.shd || 'auto'}"/>`
  x += tabsXml(a.tabs, base.tabs)
  if (a.noHyph !== base.noHyph) x += onOff('suppressAutoHyphens', a.noHyph)
  if (a.bidi !== base.bidi) x += onOff('bidi', a.bidi)
  let sp = ''
  if (a.before !== base.before) sp += ` w:before="${a.before}"`
  if (a.beforeAuto !== base.beforeAuto) sp += ` w:beforeAutospacing="${a.beforeAuto ? 1 : 0}"`
  if (a.after !== base.after) sp += ` w:after="${a.after}"`
  if (a.afterAuto !== base.afterAuto) sp += ` w:afterAutospacing="${a.afterAuto ? 1 : 0}"`
  if (a.line !== base.line || a.lineMult !== base.lineMult) {
    const rule = a.lineMult ? 'auto' : a.line < 0 ? 'exact' : 'atLeast'
    sp += ` w:line="${Math.abs(a.line)}" w:lineRule="${rule}"`
  }
  if (sp) x += `<w:spacing${sp}/>`
  let ind = ''
  if (a.left !== base.left) ind += ` w:left="${a.left}"`
  if (a.right !== base.right) ind += ` w:right="${a.right}"`
  if (a.first !== base.first) ind += a.first < 0 ? ` w:hanging="${-a.first}"` : ` w:firstLine="${a.first}"`
  if (ind) x += `<w:ind${ind}/>`
  if (a.ctxSp !== base.ctxSp) x += onOff('contextualSpacing', a.ctxSp)
  if (a.mirror !== base.mirror) x += onOff('mirrorIndents', a.mirror)
  if (a.jc !== base.jc) x += `<w:jc w:val="${JC[a.jc] ?? 'left'}"/>`
  if (a.outLvl !== base.outLvl && a.outLvl >= 0 && a.outLvl <= 9) x += `<w:outlineLvl w:val="${a.outLvl}"/>`
  if (e.markRPr) x += e.markRPr
  if (e.sectPr) x += e.sectPr
  return x ? `<w:pPr>${x}</w:pPr>` : ''
}

// ---------------------------------------------------------------- sections

const PGN_FMT = ['decimal', 'upperRoman', 'lowerRoman', 'upperLetter', 'lowerLetter']
const BKC = ['continuous', 'nextColumn', 'nextPage', 'evenPage', 'oddPage']
const VJC = ['top', 'center', 'both', 'bottom']

/** w:sectPr of a section (`refs`: its header / footer references) */
export function sectPrXml(s: Sep, refs: string, first: boolean): string {
  let x = refs
  if (!first || s.bkc !== 2) x += `<w:type w:val="${BKC[s.bkc] ?? 'nextPage'}"/>`
  const w = Math.max(144, s.w)
  const h = Math.max(144, s.h)
  x += `<w:pgSz w:w="${w}" w:h="${h}"${s.landscape || w > h ? ' w:orient="landscape"' : ''}/>`
  x += `<w:pgMar w:top="${s.top}" w:right="${s.right}" w:bottom="${s.bottom}" w:left="${s.left}" w:header="${s.hdrTop}" w:footer="${s.hdrBottom}" w:gutter="${s.gutter}"/>`
  if (s.pgBrc.some(Boolean)) {
    const from = (s.pgbProp >> 5) & 7 ? 'page' : 'text'
    const display = ['allPages', 'firstPage', 'notFirstPage'][s.pgbProp & 7] ?? 'allPages'
    x += `<w:pgBorders w:display="${display}" w:offsetFrom="${from}">${['top', 'left', 'bottom', 'right'].map((t, k) => (s.pgBrc[k] ? brcXml(t, s.pgBrc[k]) : '')).join('')}</w:pgBorders>`
  }
  if (s.lnnMod > 0) x += `<w:lnNumType w:countBy="${s.lnnMod}"${s.dxaLnn ? ` w:distance="${s.dxaLnn}"` : ''}${s.lnnMin ? ` w:start="${s.lnnMin}"` : ''} w:restart="${['newPage', 'newSection', 'continuous'][s.lnc] ?? 'newPage'}"/>`
  if (s.nfcPgn || s.pgnRestart) x += `<w:pgNumType${s.nfcPgn ? ` w:fmt="${PGN_FMT[s.nfcPgn] ?? 'decimal'}"` : ''}${s.pgnRestart ? ` w:start="${s.pgnStart}"` : ''}/>`
  if (s.cols > 1) {
    let cols = ''
    if (!s.evenly)
      for (let k = 0; k < s.cols; k++) {
        const c = s.colW.get(k)
        cols += `<w:col w:w="${c?.w ?? 0}"${k < s.cols - 1 ? ` w:space="${c?.sp ?? s.colSpace}"` : ''}/>`
      }
    x += `<w:cols w:num="${s.cols}" w:space="${s.colSpace}"${s.lBetween ? ' w:sep="1"' : ''}${s.evenly ? '' : ' w:equalWidth="0"'}>${cols}</w:cols>`
  } else x += `<w:cols w:space="${s.colSpace}"/>`
  if (s.vjc) x += `<w:vAlign w:val="${VJC[s.vjc] ?? 'top'}"/>`
  if (s.titlePg) x += '<w:titlePg/>'
  if (s.bidi) x += '<w:bidi/>'
  if (s.rtlGutter) x += '<w:rtlGutter/>'
  return `<w:sectPr>${x}</w:sectPr>`
}

// ---------------------------------------------------------------- lists

/** nfc → w:numFmt */
const NFC = [
  'decimal', 'upperRoman', 'lowerRoman', 'upperLetter', 'lowerLetter', 'ordinal', 'cardinalText', 'ordinalText', 'hex', 'chicago',
  'ideographDigital', 'japaneseCounting', 'aiueo', 'iroha', 'decimalFullWidth', 'decimalHalfWidth', 'japaneseLegal', 'japaneseDigitalTenThousand',
  'decimalEnclosedCircle', 'decimalFullWidth2', 'aiueoFullWidth', 'irohaFullWidth', 'decimalZero', 'bullet', 'ganada', 'chosung',
  'decimalEnclosedFullstop', 'decimalEnclosedParen', 'decimalEnclosedCircleChinese', 'ideographEnclosedCircle', 'ideographTraditional',
  'ideographZodiac', 'ideographZodiacTraditional', 'taiwaneseCounting', 'ideographLegalTraditional', 'taiwaneseCountingThousand',
  'taiwaneseDigital', 'chineseCounting', 'chineseLegalSimplified', 'chineseCountingThousand', 'decimal', 'koreanDigital', 'koreanCounting',
  'koreanLegal', 'koreanDigital2', 'hebrew1', 'arabicAlpha', 'hebrew2', 'arabicAbjad', 'hindiVowels', 'hindiConsonants', 'hindiNumbers',
  'hindiCounting', 'thaiLetters', 'thaiNumbers', 'thaiCounting', 'vietnameseCounting', 'numberInDash', 'russianLower', 'russianUpper',
]

/** a list level's paragraph properties (its indents and tab) */
export function lvlPap(l: Lvl): Pap {
  const p: Pap = { ...DEFAULT_PAP, tabs: [] }
  applyPap(p, l.papx)
  return p
}

/** a w:lvl element */
export function lvlXml(ilvl: number, l: Lvl, rPr: string, pStyle?: string): string {
  const fmt = l.nfc === 255 ? 'none' : (NFC[l.nfc] ?? 'decimal')
  const suff = ['tab', 'space', 'nothing'][l.follow] ?? 'tab'
  const jc = ['left', 'center', 'right'][l.jc] ?? 'left'
  const pPr = pPrXml(lvlPap(l), DEFAULT_PAP)
  return (
    `<w:lvl w:ilvl="${ilvl}"><w:start w:val="${Math.max(0, l.start)}"/><w:numFmt w:val="${fmt}"/>` +
    (l.noRestart ? `<w:lvlRestart w:val="${l.restartLim}"/>` : '') +
    (pStyle ? `<w:pStyle w:val="${pStyle}"/>` : '') +
    (l.legal ? '<w:isLgl/>' : '') +
    `<w:suff w:val="${suff}"/><w:lvlText w:val="${escAttr(l.text)}"/><w:lvlJc w:val="${jc}"/>${pPr}${rPr}</w:lvl>`
  )
}

/** namespaces of the WordprocessingML parts */
export const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" ' +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="wps"'

/** text for w:t: lone surrogates and characters XML cannot hold are dropped */
export function clean(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '')
}
