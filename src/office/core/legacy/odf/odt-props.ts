/**
 * OpenDocument text → WordprocessingML: character and paragraph properties, borders and style names.
 * The mapping works on one property element at a time (`style:text-properties`, `style:paragraph-properties`…), so
 * shorthands (fo:margin, fo:border) and their specific forms resolve the way the element says.
 */
import { escAttr } from '../../raw'
import { child, children, type ONode, toHex, toPt } from './common'

export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

/** points → twentieths of a point */
export const tw = (pt: number) => Math.round(pt * 20)
/** points → EMUs */
export const emu = (pt: number) => Math.round(pt * 12700)

const onOff = (tag: string, v: boolean | undefined) => (v === undefined ? '' : v ? `<w:${tag}/>` : `<w:${tag} w:val="0"/>`)

// ---------------------------------------------------------------- run properties

/** run properties in WordprocessingML terms (sizes and lengths in points) */
export interface RP {
  font?: string
  fontEa?: string
  fontCs?: string
  b?: boolean
  bCs?: boolean
  i?: boolean
  iCs?: boolean
  caps?: boolean
  smallCaps?: boolean
  strike?: boolean
  dstrike?: boolean
  outline?: boolean
  shadow?: boolean
  emboss?: boolean
  imprint?: boolean
  vanish?: boolean
  /** RRGGBB or 'auto' */
  color?: string
  spacing?: number
  /** horizontal scale, percent */
  w?: number
  /** raised (+) or lowered (-) by points */
  position?: number
  sz?: number
  szCs?: number
  /** w:u value */
  u?: string
  uColor?: string
  /** character border (one for all sides) */
  bdr?: Bdr
  /** RRGGBB, or 'auto' for none */
  shd?: string
  va?: 'superscript' | 'subscript' | 'baseline'
  lang?: string
  langEa?: string
  langCs?: string
}

const unquote = (v: string | undefined) => v?.split(',')[0].trim().replace(/^['"]|['"]$/g, '') || undefined

/** a font size: absolute, or a percentage of `base` */
export function fontSize(v: string | undefined, base: number): number | undefined {
  if (!v) return undefined
  const pct = /^\s*([\d.]+)\s*%\s*$/.exec(v)
  const n = pct ? (base * Number(pct[1])) / 100 : toPt(v)
  return n !== undefined && Number.isFinite(n) && n > 0 ? Math.min(n, 1638) : undefined
}

function underline(a: Record<string, string>): string | undefined {
  let style = a['style:text-underline-style']
  let type = a['style:text-underline-type']
  // OpenOffice.org 1.x: style:text-underline="single | double | dotted | bold…"
  const old = a['style:text-underline']
  if (style === undefined && type === undefined && old !== undefined) {
    if (old === 'none') return 'none'
    if (old === 'double') return 'double'
    if (/dot/.test(old)) return 'dotted'
    if (/dash/.test(old)) return 'dash'
    if (/wave/.test(old)) return 'wave'
    return /bold/.test(old) ? 'thick' : 'single'
  }
  if (style === undefined && type === undefined) return undefined
  if (style === 'none' || type === 'none') return 'none'
  style ??= 'solid'
  type ??= 'single'
  const width = a['style:text-underline-width'] ?? 'auto'
  const bold = width === 'bold' || width === 'thick' || width === 'medium'
  const dbl = type === 'double'
  switch (style) {
    case 'dotted':
      return bold ? 'dottedHeavy' : 'dotted'
    case 'dash':
      return bold ? 'dashedHeavy' : 'dash'
    case 'long-dash':
      return bold ? 'dashLongHeavy' : 'dashLong'
    case 'dot-dash':
      return bold ? 'dashDotHeavy' : 'dotDash'
    case 'dot-dot-dash':
      return bold ? 'dashDotDotHeavy' : 'dotDotDash'
    case 'wave':
      return dbl ? 'wavyDouble' : bold ? 'wavyHeavy' : 'wave'
    default:
      if (a['style:text-underline-mode'] === 'skip-white-space') return 'words'
      return dbl ? 'double' : bold ? 'thick' : 'single'
  }
}

/**
 * The run properties a `style:text-properties` element sets. `base` is the font size a percentage size is relative to;
 * `font` resolves a style:font-name to its family.
 */
export function textProps(el: ONode | undefined, base: number, font: (name: string | undefined) => string | undefined): RP {
  const r: RP = {}
  const a = el?.attrs
  if (!a) return r
  const f = font(a['style:font-name']) ?? unquote(a['fo:font-family'])
  if (f) r.font = f
  const fe = font(a['style:font-name-asian']) ?? unquote(a['style:font-family-asian'])
  if (fe) r.fontEa = fe
  const fc = font(a['style:font-name-complex']) ?? unquote(a['style:font-family-complex'])
  if (fc) r.fontCs = fc
  const weight = (v: string | undefined) => (v === undefined ? undefined : v === 'bold' || Number(v) >= 600)
  const italic = (v: string | undefined) => (v === undefined ? undefined : v === 'italic' || v === 'oblique')
  const b = weight(a['fo:font-weight'])
  if (b !== undefined) r.b = b
  const bCs = weight(a['style:font-weight-complex'])
  if (bCs !== undefined) r.bCs = bCs
  const i = italic(a['fo:font-style'])
  if (i !== undefined) r.i = i
  const iCs = italic(a['style:font-style-complex'])
  if (iCs !== undefined) r.iCs = iCs
  const sz = fontSize(a['fo:font-size'], base)
  if (sz) r.sz = sz
  const szCs = fontSize(a['style:font-size-complex'], base)
  if (szCs) r.szCs = szCs
  const variant = a['fo:font-variant']
  if (variant === 'small-caps') r.smallCaps = true
  else if (variant === 'normal') r.smallCaps = false
  const tt = a['fo:text-transform']
  if (tt === 'uppercase') r.caps = true
  else if (tt === 'none') r.caps = false
  if (a['style:use-window-font-color'] === 'true') r.color = 'auto'
  else {
    const c = toHex(a['fo:color'])
    if (c) r.color = c
  }
  const u = underline(a)
  if (u) {
    r.u = u
    const uc = toHex(a['style:text-underline-color'])
    if (uc && u !== 'none') r.uColor = uc
  }
  const ls = a['style:text-line-through-style']
  const lt = a['style:text-line-through-type']
  const crossing = a['style:text-crossing-out']
  if (ls === 'none' || lt === 'none' || crossing === 'none') {
    r.strike = false
    r.dstrike = false
  } else if (ls !== undefined || lt !== undefined) {
    if (lt === 'double') r.dstrike = true
    else r.strike = true
  } else if (crossing) {
    if (crossing === 'double-line') r.dstrike = true
    else r.strike = true
  }
  const bg = a['fo:background-color']
  const shd = bg === 'transparent' ? 'auto' : toHex(bg)
  if (shd) r.shd = shd
  const cb = border(a['fo:border'] ?? a['fo:border-top'], a['style:border-line-width'], toPt(a['fo:padding'] ?? a['fo:padding-top']))
  if (cb) r.bdr = cb
  const pos = a['style:text-position']
  if (pos) {
    const [p0, s0] = pos.trim().split(/\s+/)
    const p = p0 === 'super' ? 33 : p0 === 'sub' ? -33 : parseFloat(p0)
    const s = s0 ? parseFloat(s0) : p0 === 'super' || p0 === 'sub' ? 58 : 100
    if (!p) r.va = 'baseline'
    else if (Number.isFinite(p)) {
      if (s < 100) r.va = p > 0 ? 'superscript' : 'subscript'
      else r.position = (p / 100) * (r.sz ?? base)
    }
  }
  const spacing = a['fo:letter-spacing']
  if (spacing === 'normal') r.spacing = 0
  else if (spacing !== undefined) {
    const n = toPt(spacing)
    if (n !== undefined) r.spacing = n
  }
  const scale = parseFloat(a['style:text-scale'] ?? '')
  if (scale > 0 && scale !== 100) r.w = Math.min(600, Math.max(1, Math.round(scale)))
  const shadow = a['fo:text-shadow']
  if (shadow) r.shadow = shadow !== 'none'
  if (a['style:text-outline']) r.outline = a['style:text-outline'] === 'true'
  const relief = a['style:font-relief']
  if (relief === 'embossed') r.emboss = true
  else if (relief === 'engraved') r.imprint = true
  else if (relief === 'none') {
    r.emboss = false
    r.imprint = false
  }
  const display = a['text:display']
  if (display === 'none') r.vanish = true
  else if (display === 'true') r.vanish = false
  const lang = (l: string | undefined, c: string | undefined) => (l && l !== 'none' && l !== 'zxx' ? (c && c !== 'none' ? `${l}-${c}` : l) : undefined)
  const la = lang(a['fo:language'], a['fo:country'])
  if (la) r.lang = la
  const le = lang(a['style:language-asian'], a['style:country-asian'])
  if (le) r.langEa = le
  const lc = lang(a['style:language-complex'], a['style:country-complex'])
  if (lc) r.langCs = lc
  return r
}

/** w:rPr of run properties (elements in schema order); '' when there is nothing to say */
export function rPrXml(r: RP, rStyle?: string): string {
  let x = rStyle ? `<w:rStyle w:val="${escAttr(rStyle)}"/>` : ''
  if (r.font || r.fontEa || r.fontCs) {
    let f = ''
    if (r.font) f += ` w:ascii="${escAttr(r.font)}" w:hAnsi="${escAttr(r.font)}"`
    if (r.fontEa) f += ` w:eastAsia="${escAttr(r.fontEa)}"`
    if (r.fontCs) f += ` w:cs="${escAttr(r.fontCs)}"`
    x += `<w:rFonts${f}/>`
  }
  x += onOff('b', r.b) + onOff('bCs', r.bCs) + onOff('i', r.i) + onOff('iCs', r.iCs) + onOff('caps', r.caps) + onOff('smallCaps', r.smallCaps)
  x += onOff('strike', r.strike) + onOff('dstrike', r.dstrike) + onOff('outline', r.outline) + onOff('shadow', r.shadow)
  x += onOff('emboss', r.emboss) + onOff('imprint', r.imprint) + onOff('vanish', r.vanish)
  if (r.color) x += `<w:color w:val="${r.color}"/>`
  if (r.spacing !== undefined) x += `<w:spacing w:val="${Math.max(-31680, Math.min(31680, tw(r.spacing)))}"/>`
  if (r.w) x += `<w:w w:val="${r.w}"/>`
  if (r.position) x += `<w:position w:val="${Math.round(r.position * 2)}"/>`
  if (r.sz) x += `<w:sz w:val="${Math.max(2, Math.round(r.sz * 2))}"/>`
  if (r.szCs ?? r.sz) x += `<w:szCs w:val="${Math.max(2, Math.round((r.szCs ?? r.sz)! * 2))}"/>`
  if (r.u) x += `<w:u w:val="${r.u}"${r.uColor ? ` w:color="${r.uColor}"` : ''}/>`
  if (r.bdr) x += bdrXml('bdr', r.bdr)
  if (r.shd) x += `<w:shd w:val="clear" w:color="auto" w:fill="${r.shd}"/>`
  if (r.va) x += `<w:vertAlign w:val="${r.va}"/>`
  if (r.lang || r.langEa || r.langCs)
    x += `<w:lang${r.lang ? ` w:val="${escAttr(r.lang)}"` : ''}${r.langEa ? ` w:eastAsia="${escAttr(r.langEa)}"` : ''}${r.langCs ? ` w:bidi="${escAttr(r.langCs)}"` : ''}/>`
  return x ? `<w:rPr>${x}</w:rPr>` : ''
}

// ---------------------------------------------------------------- borders

/** a WordprocessingML border: w:val 'nil' for none; sz in eighths of a point */
export interface Bdr {
  val: string
  sz: number
  color: string
  space: number
}

const BORDER_STYLE: Record<string, string> = {
  solid: 'single',
  double: 'double',
  'double-thin': 'double',
  dotted: 'dotted',
  dashed: 'dashed',
  'fine-dashed': 'dashSmallGap',
  'dash-dot': 'dotDash',
  'dash-dot-dot': 'dotDotDash',
  groove: 'threeDEngrave',
  ridge: 'threeDEmboss',
  inset: 'inset',
  outset: 'outset',
}

const NONE: Bdr = { val: 'nil', sz: 0, color: 'auto', space: 0 }

/** an fo:border value ("0.5pt solid #000000", "none"); `lineWidth` is style:border-line-width for double lines */
export function border(v: string | undefined, lineWidth?: string, pad?: number): Bdr | undefined {
  if (v === undefined) return undefined
  let w = 0.75
  let style = 'solid'
  let color = '000000'
  for (const t of v.trim().split(/\s+/)) {
    if (t.startsWith('#')) color = toHex(t) ?? color
    else if (t === 'none' || t === 'hidden') return NONE
    else if (t in BORDER_STYLE) style = t
    else if (t === 'thin') w = 0.5
    else if (t === 'medium') w = 1.5
    else if (t === 'thick') w = 3
    else {
      const n = toPt(t)
      if (n !== undefined) w = n
    }
  }
  if (!(w > 0)) return NONE
  if (style === 'double' || style === 'double-thin') {
    const parts = (lineWidth ?? '').trim().split(/\s+/).map(toPt)
    // each line of a double border is about a third of the whole
    const line = parts.length === 3 && parts[0] !== undefined ? Math.max(parts[0], parts[2] ?? 0) : w / 3
    w = line
  }
  return { val: BORDER_STYLE[style] ?? 'single', sz: Math.max(2, Math.min(96, Math.round(w * 8))), color, space: Math.max(0, Math.min(31, Math.round(pad ?? 0))) }
}

export type Side = 'top' | 'left' | 'bottom' | 'right'
export const SIDES: Side[] = ['top', 'left', 'bottom', 'right']

/** the four borders (and paddings) an element's fo:border / fo:border-* / fo:padding attributes set */
export function borders(a: Record<string, string>): { bdr: Partial<Record<Side, Bdr>>; pad: Partial<Record<Side, number>> } {
  const bdr: Partial<Record<Side, Bdr>> = {}
  const pad: Partial<Record<Side, number>> = {}
  const allPad = toPt(a['fo:padding'])
  for (const s of SIDES) {
    const p = toPt(a[`fo:padding-${s}`]) ?? allPad
    if (p !== undefined) pad[s] = Math.max(0, p)
    const b = border(a[`fo:border-${s}`] ?? a['fo:border'], a[`style:border-line-width-${s}`] ?? a['style:border-line-width'], p)
    if (b) bdr[s] = b
  }
  return { bdr, pad }
}

export const bdrXml = (tag: string, b: Bdr) =>
  b.val === 'nil' ? `<w:${tag} w:val="nil"/>` : `<w:${tag} w:val="${b.val}" w:sz="${b.sz}" w:space="${b.space}" w:color="${b.color}"/>`

// ---------------------------------------------------------------- paragraph properties

export interface Tab {
  val: 'left' | 'center' | 'right' | 'decimal' | 'clear'
  /** points from the paragraph's left indent */
  pos: number
  leader?: string
}

/** paragraph properties in WordprocessingML terms (lengths in points) */
export interface PP {
  keepNext?: boolean
  keepLines?: boolean
  pbb?: boolean
  widow?: boolean
  bdr?: Partial<Record<Side, Bdr>>
  shd?: string
  /** tab stops (replacing the inherited ones) */
  tabs?: Tab[]
  before?: number
  after?: number
  line?: { v: number; rule: 'auto' | 'exact' | 'atLeast' }
  /** style:line-spacing: leading added to the normal line height */
  leading?: number
  left?: number
  right?: number
  /** first line indent; negative: hanging */
  first?: number
  contextual?: boolean
  jc?: string
  bidi?: boolean
  outline?: number
  // not WordprocessingML paragraph properties: handled by the converter
  breakBefore?: 'column'
  breakAfter?: 'page' | 'column'
  pageNumber?: number
}

const TAB_TYPE: Record<string, Tab['val']> = { left: 'left', center: 'center', right: 'right', char: 'decimal' }

const LEADER: Record<string, string> = { '.': 'dot', '-': 'hyphen', _: 'underscore', '·': 'middleDot', '…': 'dot' }

/** The paragraph properties a `style:paragraph-properties` element sets. */
export function paraProps(el: ONode | undefined): PP {
  const p: PP = {}
  const a = el?.attrs
  if (!a) return p
  const len = (v: string | undefined) => (v === undefined || v.includes('%') ? undefined : toPt(v))
  const m = len(a['fo:margin'])
  const left = len(a['fo:margin-left']) ?? m
  const right = len(a['fo:margin-right']) ?? m
  const top = len(a['fo:margin-top']) ?? m
  const bottom = len(a['fo:margin-bottom']) ?? m
  if (left !== undefined) p.left = left
  if (right !== undefined) p.right = right
  if (top !== undefined) p.before = Math.max(0, top)
  if (bottom !== undefined) p.after = Math.max(0, bottom)
  const indent = len(a['fo:text-indent'])
  if (indent !== undefined) p.first = indent
  switch (a['fo:text-align']) {
    case 'start':
    case 'left':
      p.jc = 'left'
      break
    case 'end':
    case 'right':
      p.jc = 'right'
      break
    case 'center':
      p.jc = 'center'
      break
    case 'justify':
      p.jc = 'both'
      break
  }
  const lh = a['fo:line-height']
  if (lh === 'normal') p.line = { v: 1, rule: 'auto' }
  else if (lh) {
    const pct = /^\s*([\d.]+)\s*%/.exec(lh)
    if (pct) p.line = { v: Math.max(0.06, Number(pct[1]) / 100), rule: 'auto' }
    else {
      const n = toPt(lh)
      if (n !== undefined && n > 0) p.line = { v: n, rule: 'exact' }
    }
  }
  const least = len(a['style:line-height-at-least'])
  if (least !== undefined && least > 0) p.line = { v: least, rule: 'atLeast' }
  const leading = len(a['style:line-spacing'])
  if (leading !== undefined && leading !== 0) p.leading = leading
  const keep = (v: string | undefined) => (v === undefined ? undefined : v === 'always')
  const kn = keep(a['fo:keep-with-next'])
  if (kn !== undefined) p.keepNext = kn
  const kt = keep(a['fo:keep-together'])
  if (kt !== undefined) p.keepLines = kt
  const bb = a['fo:break-before']
  if (bb === 'page' || bb === 'even-page' || bb === 'odd-page') p.pbb = true
  else if (bb === 'column') p.breakBefore = 'column'
  else if (bb === 'auto') p.pbb = false
  const ba = a['fo:break-after']
  if (ba === 'page' || ba === 'even-page' || ba === 'odd-page') p.breakAfter = 'page'
  else if (ba === 'column') p.breakAfter = 'column'
  const widows = a['fo:widows'] ?? a['fo:orphans']
  if (widows !== undefined) p.widow = Number(widows) > 0
  const { bdr } = borders(a)
  if (Object.keys(bdr).length) p.bdr = bdr
  const bg = a['fo:background-color']
  const shd = bg === 'transparent' ? 'auto' : toHex(bg)
  if (shd) p.shd = shd
  const tabsEl = child(el, 'style:tab-stops')
  if (tabsEl) {
    p.tabs = children(tabsEl, 'style:tab-stop').flatMap((t): Tab[] => {
      const pos = toPt(t.attrs['style:position'])
      if (pos === undefined) return []
      const tab: Tab = { val: TAB_TYPE[t.attrs['style:type'] ?? 'left'] ?? 'left', pos }
      const lt = t.attrs['style:leader-text'] ?? t.attrs['style:leader-char']
      const lstyle = t.attrs['style:leader-style']
      if (lt && lt !== ' ') tab.leader = LEADER[lt] ?? 'dot'
      else if (lstyle && lstyle !== 'none') tab.leader = lstyle === 'solid' ? 'underscore' : lstyle === 'dash' || lstyle === 'long-dash' ? 'hyphen' : 'dot'
      return [tab]
    })
  }
  const ctx = a['style:contextual-spacing'] ?? a['loext:contextual-spacing']
  if (ctx !== undefined) p.contextual = ctx === 'true'
  const wm = a['style:writing-mode']
  if (wm === 'rl-tb' || wm === 'rl') p.bidi = true
  else if (wm === 'lr-tb' || wm === 'lr') p.bidi = false
  const pn = Number(a['style:page-number'])
  if (Number.isInteger(pn) && pn > 0) p.pageNumber = pn
  return p
}

/** merges paragraph properties: later ones win (borders side by side) */
export function mergePP(...list: PP[]): PP {
  const out: PP = {}
  for (const p of list) {
    const bdr = out.bdr && p.bdr ? { ...out.bdr, ...p.bdr } : (p.bdr ?? out.bdr)
    Object.assign(out, p)
    if (bdr) out.bdr = bdr
  }
  return out
}

export interface PPExtra {
  style?: string
  numPr?: string
  /** replaces the indent (list paragraphs) */
  ind?: { left: number; hanging?: number; first?: number }
  /** tab stops of the paragraph style chain the paragraph's own replace (cleared) */
  inheritedTabs?: Tab[]
  /** left indent tab stop positions are relative to; undefined: positions are from the margin */
  tabBase?: number
  /** font size, to turn style:line-spacing into a line height */
  sz?: number
  outline?: number
  markRPr?: string
  sectPr?: string
}

/** w:pPr of paragraph properties (elements in schema order); '' when there is nothing to say */
export function pPrXml(p: PP, e: PPExtra = {}): string {
  let x = e.style ? `<w:pStyle w:val="${escAttr(e.style)}"/>` : ''
  x += onOff('keepNext', p.keepNext) + onOff('keepLines', p.keepLines) + onOff('pageBreakBefore', p.pbb) + onOff('widowControl', p.widow)
  if (e.numPr) x += e.numPr
  if (p.bdr) {
    const b = p.bdr
    const sides = SIDES.filter((s) => b[s])
    if (sides.length) x += `<w:pBdr>${sides.map((s) => bdrXml(s, b[s]!)).join('')}</w:pBdr>`
  }
  if (p.shd) x += `<w:shd w:val="clear" w:color="auto" w:fill="${p.shd}"/>`
  if (p.tabs || e.inheritedTabs?.length) {
    const base = e.tabBase ?? 0
    const own = (p.tabs ?? []).map((t) => ({ ...t, pos: t.pos + base }))
    const clear = p.tabs ? (e.inheritedTabs ?? []).filter((t) => !own.some((o) => Math.abs(o.pos - t.pos) < 0.5)) : []
    const all = [...own, ...clear.map((t): Tab => ({ val: 'clear', pos: t.pos }))].sort((u, v) => u.pos - v.pos)
    const tabs = all.slice(0, 60).map((t) => `<w:tab w:val="${t.val}"${t.leader ? ` w:leader="${t.leader}"` : ''} w:pos="${tw(t.pos)}"/>`)
    if (tabs.length) x += `<w:tabs>${tabs.join('')}</w:tabs>`
  }
  if (p.bidi !== undefined) x += onOff('bidi', p.bidi)
  let sp = ''
  if (p.before !== undefined) sp += ` w:before="${tw(p.before)}"`
  if (p.after !== undefined) sp += ` w:after="${tw(p.after)}"`
  if (p.line) sp += ` w:line="${p.line.rule === 'auto' ? Math.round(p.line.v * 240) : Math.max(1, tw(p.line.v))}" w:lineRule="${p.line.rule}"`
  else if (p.leading && e.sz) {
    const normal = e.sz * 1.17
    sp += ` w:line="${Math.max(24, Math.round(((normal + p.leading) / normal) * 240))}" w:lineRule="auto"`
  }
  if (sp) x += `<w:spacing${sp}/>`
  if (e.ind) {
    const { left, hanging, first } = e.ind
    let ind = ` w:left="${tw(left)}"`
    if (p.right !== undefined) ind += ` w:right="${tw(p.right)}"`
    if (hanging !== undefined && hanging > 0) ind += ` w:hanging="${tw(hanging)}"`
    else if (hanging !== undefined && hanging < 0) ind += ` w:firstLine="${tw(-hanging)}"`
    else if (first !== undefined) ind += first < 0 ? ` w:hanging="${tw(-first)}"` : ` w:firstLine="${tw(first)}"`
    x += `<w:ind${ind}/>`
  } else if (p.left !== undefined || p.right !== undefined || p.first !== undefined) {
    let ind = ''
    if (p.left !== undefined) ind += ` w:left="${tw(p.left)}"`
    if (p.right !== undefined) ind += ` w:right="${tw(p.right)}"`
    if (p.first !== undefined) ind += p.first < 0 ? ` w:hanging="${tw(-p.first)}"` : ` w:firstLine="${tw(p.first)}"`
    x += `<w:ind${ind}/>`
  }
  x += onOff('contextualSpacing', p.contextual)
  if (p.jc) x += `<w:jc w:val="${p.jc}"/>`
  const outline = e.outline ?? p.outline
  if (outline !== undefined) x += `<w:outlineLvl w:val="${outline}"/>`
  if (e.markRPr) x += e.markRPr
  if (e.sectPr) x += e.sectPr
  return x ? `<w:pPr>${x}</w:pPr>` : ''
}

// ---------------------------------------------------------------- style names

/** "Heading_20_1" → "Heading 1": the _xx_ escapes of style names decoded */
export const decodeName = (n: string) => n.replace(/_([0-9a-fA-F]{2,4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))

/** the name a user sees for a style */
export const displayName = (s: ONode) => s.attrs['style:display-name'] || decodeName(s.attrs['style:name'] ?? '')

/** OpenDocument (LibreOffice) style names → Word built-in style id and name */
const BUILTIN: Record<string, [string, string]> = {
  standard: ['Normal', 'Normal'],
  'default paragraph style': ['Normal', 'Normal'],
  'default style': ['Normal', 'Normal'],
  'text body': ['BodyText', 'Body Text'],
  'body text': ['BodyText', 'Body Text'],
  title: ['Title', 'Title'],
  subtitle: ['Subtitle', 'Subtitle'],
  header: ['Header', 'header'],
  footer: ['Footer', 'footer'],
  footnote: ['FootnoteText', 'footnote text'],
  endnote: ['EndnoteText', 'endnote text'],
  caption: ['Caption', 'caption'],
  'contents heading': ['TOCHeading', 'TOC Heading'],
  'internet link': ['Hyperlink', 'Hyperlink'],
  'visited internet link': ['FollowedHyperlink', 'FollowedHyperlink'],
  'footnote anchor': ['FootnoteReference', 'footnote reference'],
  'endnote anchor': ['EndnoteReference', 'endnote reference'],
  'strong emphasis': ['Strong', 'Strong'],
  emphasis: ['Emphasis', 'Emphasis'],
  'list paragraph': ['ListParagraph', 'List Paragraph'],
}

/** the Word style id and name an OpenDocument style name maps to */
export function wordStyleName(display: string): [string, string] {
  const lower = display.toLowerCase().trim()
  const hit = BUILTIN[lower]
  if (hit) return hit
  const h = /^heading (\d)$/.exec(lower)
  if (h && +h[1] >= 1) return [`Heading${h[1]}`, `heading ${h[1]}`]
  const toc = /^contents (\d)$/.exec(lower)
  if (toc && +toc[1] >= 1) return [`TOC${toc[1]}`, `toc ${toc[1]}`]
  const id = display.replace(/[^A-Za-z0-9]/g, '') || 'Style'
  return [/^[0-9]/.test(id) ? 'S' + id : id, display]
}
