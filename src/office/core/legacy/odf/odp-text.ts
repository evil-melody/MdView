/**
 * Text for the ODP → PPTX conversion: paragraphs (text:p, text:h, nested text:list with their outline levels)
 * → a:p with explicit paragraph and run properties, bullets and numbering from list styles, fields, links;
 * text body properties; master text styles.
 */
import { escAttr, escText } from '../../raw'
import { children, toHex, toPt, type ONode } from './common'
import { attr, emu, fontName, isDark, overlay, solid, type OdpStyles, type Props } from './odp-style'

/** what text needs from the converter */
export interface TextEnv {
  styles: OdpStyles
  /** converting a master page: automatic styles of styles.xml */
  master: boolean
  /** 1-based slide number for page number fields; 0 on masters (the field shows ‹#›) */
  slideNo: number
  slideCount: number
  slideName?: string
  /** texts of presentation:footer, presentation:header and presentation:date-time fields */
  footer?: string
  header?: string
  dateTime?: string
  /** automatic font color: white on dark backgrounds */
  dark: boolean
  /** relationship id of a link (an external URL or a slide) */
  link(href: string): string | undefined
  /** text properties over every run's (fontwork: the size and color of the shape) */
  force?: Record<string, string>
}

/** a text frame: its properties by outline level, its paragraph style, its list style */
export interface TextFrame {
  /** default + frame style properties of paragraphs at an outline level (1-based) */
  level(n: number): Props
  /** draw:text-style-name */
  textStyle?: string
}

const MAX_PARAS = 5000
const MAX_DEPTH = 10

interface Para {
  el: ONode
  /** list nesting (0: not in a list) */
  depth: number
  list?: ONode
  /** the first paragraph of a list item (it gets the label) */
  label: boolean
  /** the item restarts the numbering */
  start?: number
}

/** the paragraphs of a text container in order, with their list nesting */
function collect(container: ONode, out: Para[], depth: number, list: ONode | undefined, styles: OdpStyles, master: boolean, nest = 0): void {
  if (nest > 40) return
  for (const k of children(container)) {
    if (out.length >= MAX_PARAS) return
    switch (k.name) {
      case 'text:p':
      case 'text:h':
        out.push({ el: k, depth, list, label: false })
        break
      case 'text:list': {
        const own = styles.list(k.attrs['text:style-name'], master)
        const ls = own ?? list
        for (const item of children(k)) {
          if (item.name !== 'text:list-item' && item.name !== 'text:list-header') continue
          const start = out.length
          collect(item, out, Math.min(MAX_DEPTH, depth + 1), ls, styles, master, nest + 1)
          // the first paragraph directly in a list item carries its label
          const first = out[start]
          if (item.name === 'text:list-item' && first && first.depth === Math.min(MAX_DEPTH, depth + 1) && children(item)[0] === first.el) {
            first.label = true
            const start = Number(item.attrs['text:start-value'])
            if (Number.isInteger(start) && start > 0 && start < 32768) first.start = start
          }
        }
        break
      }
      case 'text:section':
      case 'text:soft-page-break':
        collect(k, out, depth, list, styles, master, nest + 1)
        break
    }
  }
}

// ---------------------------------------------------------------- list labels

interface Label {
  kind: 'bullet' | 'number' | 'none'
  char?: string
  font?: string
  color?: string
  /** size relative to the text (1 = 100%) */
  size?: number
  autoType?: string
  start?: number
  /** text:space-before, text:min-label-width (pt) */
  before: number
  width: number
  /** label alignment mode: text start and first line indent */
  align?: [number, number]
}

const NUM: Record<string, string> = { '1': 'arabic', a: 'alphaLc', A: 'alphaUc', i: 'romanLc', I: 'romanUc' }
const SYMBOL_FONTS = /^(open|star)symbol$/i

function levelStyle(list: ONode | undefined, depth: number): ONode | undefined {
  if (!list || depth < 1) return undefined
  const levels = children(list).filter((l) => l.name.startsWith('text:list-level-style-'))
  return levels.find((l) => Number(l.attrs['text:level'] ?? 1) === depth)
}

function labelOf(ls: ONode | undefined, styles: OdpStyles): Label | undefined {
  if (!ls) return undefined
  const lp = children(ls, 'style:list-level-properties')[0]
  const la = children(lp, 'style:list-level-label-alignment')[0]
  const out: Label = { kind: 'none', before: toPt(lp?.attrs['text:space-before']) ?? 0, width: toPt(lp?.attrs['text:min-label-width']) ?? 0 }
  if (lp?.attrs['text:list-level-position-and-space-mode'] === 'label-alignment' && la) out.align = [toPt(la.attrs['fo:margin-left']) ?? 0, toPt(la.attrs['fo:text-indent']) ?? 0]
  const tp = children(ls, 'style:text-properties')[0]?.attrs ?? {}
  if (tp['style:use-window-font-color'] !== 'true') out.color = toHex(tp['fo:color'])
  const rel = tp['fo:font-size'] ?? ls.attrs['text:bullet-relative-size']
  if (rel?.endsWith('%')) out.size = parseFloat(rel) / 100
  // a label sized next to nothing is not seen
  if (out.size !== undefined && out.size < 0.1) return out
  const font = fontName(tp['fo:font-family'] ?? styles.st.font(tp['style:font-name']))
  switch (ls.name) {
    case 'text:list-level-style-bullet': {
      let ch = ls.attrs['text:bullet-char'] ?? ''
      if (!ch) return out
      // private-use symbols of OpenSymbol have no common equivalent
      if (/[\ue000-\uf8ff]/.test(ch) && (!font || SYMBOL_FONTS.test(font))) ch = '•'
      out.kind = 'bullet'
      out.char = [...ch][0]
      out.font = !font || SYMBOL_FONTS.test(font) ? 'Arial' : font
      return out
    }
    case 'text:list-level-style-number': {
      const fmt = ls.attrs['style:num-format'] ?? ''
      const prefix = ls.attrs['style:num-prefix'] ?? ''
      const suffix = ls.attrs['style:num-suffix'] ?? ''
      const base = NUM[fmt]
      if (!base) {
        if (prefix || suffix) {
          out.kind = 'bullet'
          out.char = [...(prefix + suffix).trim()][0] ?? '•'
          out.font = font ?? 'Arial'
        }
        return out
      }
      out.kind = 'number'
      out.autoType = base + (suffix.startsWith(')') ? (prefix.endsWith('(') ? 'ParenBoth' : 'ParenR') : suffix.startsWith('.') || base !== 'arabic' ? 'Period' : 'Plain')
      const start = Number(ls.attrs['text:start-value'] ?? 1)
      if (Number.isInteger(start) && start > 0 && start < 32768) out.start = start
      return out
    }
    case 'text:list-level-style-image':
      out.kind = 'bullet'
      out.char = '•'
      out.font = 'Arial'
      return out
  }
  return out
}

/** marL / indent (pt) of a paragraph: its margins, and the list level's label space when in a list */
function indents(pp: Props, label: Label | undefined, labeled: boolean): [number, number] {
  const ml = toPt(pp.p['fo:margin-left']) ?? 0
  const ti = toPt(pp.p['fo:text-indent']) ?? 0
  let marL = ml
  let indent = ti
  if (label?.align) {
    marL = label.align[0]
    indent = labeled ? label.align[1] : 0
  } else if (label) {
    marL = ml + label.before + label.width
    indent = labeled ? ti - label.width : ti
  }
  // DrawingML's ranges: up to 4032 pt
  marL = Math.min(4032, Math.max(0, marL))
  indent = Math.min(4032, Math.max(-marL, indent))
  return [marL, indent]
}

// ---------------------------------------------------------------- runs

const UNDERLINE: Record<string, string> = { solid: 'sng', dotted: 'dotted', dash: 'dash', 'long-dash': 'dashLong', 'dot-dash': 'dotDash', 'dot-dot-dash': 'dotDotDash', wave: 'wavy' }
const HEAVY: Record<string, string> = { sng: 'heavy', dotted: 'dottedHeavy', dash: 'dashHeavy', dashLong: 'dashLongHeavy', dotDash: 'dotDashHeavy', dotDotDash: 'dotDotDashHeavy', wavy: 'wavyHeavy' }

/** the text color: its own, else automatic (white on a dark highlight or background) */
function textColor(t: Record<string, string>, env: TextEnv): string {
  const own = t['style:use-window-font-color'] === 'true' ? undefined : toHex(t['fo:color'])
  if (own) return own
  const hl = toHex(t['fo:background-color'])
  return (hl ? isDark(hl) : env.dark) ? 'FFFFFF' : '000000'
}

export const fontSize = (t: Record<string, string>) => {
  const v = toPt(t['fo:font-size'])
  return v !== undefined && v > 0 ? Math.min(4000, Math.max(1, v)) : 18
}

/** run properties (a:rPr, a:endParaRPr, a:defRPr) of text properties */
export function rPrXml(tag: string, t: Record<string, string>, env: TextEnv, link?: string): string {
  if (env.force) t = { ...t, ...env.force }
  const auto = t['style:use-window-font-color'] === 'true' || !toHex(t['fo:color'])
  const sz = fontSize(t)
  let a = ''
  const lang = t['fo:language'] && /^[a-z]{2,3}$/i.test(t['fo:language']) ? t['fo:language'] + (t['fo:country'] && /^[a-z]{2}$/i.test(t['fo:country']) ? '-' + t['fo:country'].toUpperCase() : '') : undefined
  if (lang) a += ` lang="${lang}"`
  a += ` sz="${Math.round(sz * 100)}"`
  const w = t['fo:font-weight']
  a += ` b="${w === 'bold' || Number(w) >= 600 ? 1 : 0}"`
  a += ` i="${t['fo:font-style'] === 'italic' || t['fo:font-style'] === 'oblique' ? 1 : 0}"`
  const ustyle = t['style:text-underline-style'] ?? (t['style:text-underline'] && t['style:text-underline'] !== 'none' ? 'solid' : 'none')
  if (ustyle !== 'none' && t['style:text-underline-type'] !== 'none') {
    let u = t['style:text-underline-type'] === 'double' ? (ustyle === 'wave' ? 'wavyDbl' : 'dbl') : (UNDERLINE[ustyle] ?? 'sng')
    if (t['style:text-underline-width'] === 'bold' && HEAVY[u]) u = HEAVY[u]
    a += ` u="${u}"`
  } else a += ' u="none"'
  const strike = t['style:text-line-through-style'] ?? (t['style:text-crossing-out'] && t['style:text-crossing-out'] !== 'none' ? 'solid' : 'none')
  // every property is written: nothing must come from the master text styles
  a += ` strike="${strike !== 'none' && t['style:text-line-through-type'] !== 'none' ? (t['style:text-line-through-type'] === 'double' ? 'dblStrike' : 'sngStrike') : 'noStrike'}"`
  const spc = toPt(t['fo:letter-spacing'])
  if (spc) a += ` spc="${Math.max(-400000, Math.min(400000, Math.round(spc * 100)))}"`
  const pos = (t['style:text-position'] ?? '').trim().split(/\s+/)[0]
  const raise = pos === 'super' ? 33 : pos === 'sub' ? -33 : parseFloat(pos)
  a += ` baseline="${raise && Number.isFinite(raise) ? Math.round(Math.max(-100, Math.min(100, raise)) * 1000) : 0}"`
  a += ` cap="${t['fo:text-transform'] === 'uppercase' ? 'all' : t['fo:font-variant'] === 'small-caps' ? 'small' : 'none'}"`
  // a link in the automatic color takes the theme's link color
  let x = link && auto ? '<a:solidFill><a:schemeClr val="hlink"/></a:solidFill>' : solid(textColor(t, env))
  const hl = toHex(t['fo:background-color'])
  if (hl) x += `<a:highlight><a:srgbClr val="${hl}"/></a:highlight>`
  const font = (name: string | undefined, family: string | undefined) => fontName(family ?? env.styles.st.font(name))
  const latin = font(t['style:font-name'], t['fo:font-family'])
  const ea = font(t['style:font-name-asian'], t['style:font-family-asian'])
  const cs = font(t['style:font-name-complex'], t['style:font-family-complex'])
  if (latin) x += `<a:latin typeface="${escAttr(latin)}"/>`
  if (ea) x += `<a:ea typeface="${escAttr(ea)}"/>`
  if (cs) x += `<a:cs typeface="${escAttr(cs)}"/>`
  if (link) x += link
  return `<a:${tag}${a}>${x}</a:${tag}>`
}

interface Seg {
  text: string
  t: Record<string, string>
  href?: string
  field?: 'slidenum' | 'datetime'
  br?: boolean
  /** from text:s / text:tab (kept as is) */
  raw?: boolean
}

const SKIP = new Set(['text:number', 'text:note', 'office:annotation', 'office:annotation-end', 'text:ruby-text', 'text:bookmark', 'text:bookmark-start', 'text:bookmark-end', 'text:soft-page-break', 'text:reference-mark', 'text:reference-mark-start', 'text:reference-mark-end', 'text:toc-mark', 'text:alphabetical-index-mark', 'text:change', 'text:change-start', 'text:change-end', 'draw:frame', 'draw:a', 'draw:custom-shape', 'presentation:notes'])

/** the runs of a paragraph: text with its properties, ODF white-space collapsed */
function segments(p: ONode, base: Record<string, string>, env: TextEnv): Seg[] {
  const out: Seg[] = []
  let space = true
  const textProps = (t: Record<string, string>, name: string | undefined) => (name ? overlay({ g: {}, p: {}, t, c: {} }, env.styles.props('text', name, env.master)).t : t)
  const walk = (n: ONode, t: Record<string, string>, href: string | undefined, nest: number) => {
    if (nest > 30) return
    for (const k of n.kids) {
      if (out.length > 20000) return
      if (typeof k === 'string') {
        let s = k.replace(/[ \t\r\n]+/g, ' ')
        if (space && s.startsWith(' ')) s = s.slice(1)
        if (!s) continue
        out.push({ text: s, t, href })
        space = s.endsWith(' ')
        continue
      }
      switch (k.name) {
        case 'text:span':
          walk(k, textProps(t, k.attrs['text:style-name']), href, nest + 1)
          break
        case 'text:a':
          walk(k, textProps(t, k.attrs['text:style-name']), k.attrs['xlink:href'] ?? href, nest + 1)
          break
        case 'text:s':
          out.push({ text: ' '.repeat(Math.min(1000, Math.max(1, Number(k.attrs['text:c'] ?? 1) || 1))), t, href, raw: true })
          space = false
          break
        case 'text:tab':
          out.push({ text: '\t', t, href, raw: true })
          space = false
          break
        case 'text:line-break':
          out.push({ text: '', t, br: true })
          space = true
          break
        case 'text:page-number':
          out.push({ text: env.slideNo ? String(env.slideNo) : '‹#›', t, field: 'slidenum', raw: true })
          space = false
          break
        case 'text:page-count':
          out.push({ text: String(env.slideCount), t, raw: true })
          space = false
          break
        case 'text:page-name':
        case 'loext:page-name':
          if (env.slideName) out.push({ text: env.slideName, t, raw: true }), (space = false)
          break
        case 'presentation:footer':
        case 'presentation:header':
        case 'presentation:date-time': {
          const v = k.name === 'presentation:footer' ? env.footer : k.name === 'presentation:header' ? env.header : env.dateTime
          if (v) out.push({ text: v, t, field: k.name === 'presentation:date-time' && env.slideNo ? 'datetime' : undefined, raw: true }), (space = false)
          break
        }
        default:
          if (SKIP.has(k.name)) break
          walk(k, t, href, nest + 1)
      }
    }
  }
  walk(p, base, undefined, 0)
  // trailing white space of the paragraph
  const last = out[out.length - 1]
  if (last && !last.raw && !last.br) last.text = last.text.replace(/ $/, '')
  return out.filter((s) => s.text || s.br)
}

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '')

let fieldSeq = 0
const fieldId = () => `{6A0D3C52-8F14-4B2E-9C1D-${String(++fieldSeq % 1e12).padStart(12, '0')}}`

function runsXml(segs: Seg[], env: TextEnv): string {
  let out = ''
  for (const s of segs) {
    const link = s.href ? env.link(s.href) : undefined
    const click = link ? `<a:hlinkClick r:id="${link}"${s.href!.startsWith('#') ? ' action="ppaction://hlinksldjump"' : ''}/>` : undefined
    const rPr = rPrXml('rPr', s.t, env, click)
    if (s.br) out += `<a:br>${rPrXml('rPr', s.t, env)}</a:br>`
    else if (s.field) out += `<a:fld id="${fieldId()}" type="${s.field === 'slidenum' ? 'slidenum' : 'datetime1'}">${rPr}<a:t>${escText(clean(s.text))}</a:t></a:fld>`
    else {
      // line breaks inside a text (declared footer texts…) become a:br
      s.text.split(/\r\n|[\r\n\u2028]/).forEach((part, k) => {
        if (k) out += `<a:br>${rPrXml('rPr', s.t, env)}</a:br>`
        const t = clean(part)
        if (t) out += `<a:r>${rPr}<a:t>${escText(t)}</a:t></a:r>`
      })
    }
  }
  return out
}

// ---------------------------------------------------------------- paragraphs

const ALGN: Record<string, string> = { start: 'l', left: 'l', center: 'ctr', end: 'r', right: 'r', justify: 'just' }

/** paragraph properties: attributes and children (spacing, bullet) of a:pPr / a:lvlNpPr */
/** paragraph properties; `color` is the color of the text a label without its own takes */
function pPrParts(pp: Props, label: Label | undefined, labeled: boolean, sz: number, color: string): { attrs: string; kids: string } {
  const [marL, indent] = indents(pp, label, labeled)
  let attrs = ` marL="${emu(marL)}" indent="${emu(indent)}"`
  attrs += ` algn="${ALGN[pp.p['fo:text-align'] ?? ''] ?? 'l'}"`
  if (pp.p['style:writing-mode']?.startsWith('rl')) attrs += ' rtl="1"'
  let kids = ''
  const lh = pp.p['fo:line-height']
  if (lh?.endsWith('%')) {
    const v = parseFloat(lh)
    if (v > 0) kids += `<a:lnSpc><a:spcPct val="${Math.round(Math.min(v, 13200) * 1000)}"/></a:lnSpc>`
  } else if ((toPt(lh) ?? 0) > 0) kids += `<a:lnSpc><a:spcPts val="${Math.round(Math.min(1584, toPt(lh)!) * 100)}"/></a:lnSpc>`
  else if (toPt(pp.p['style:line-height-at-least'])) {
    const least = toPt(pp.p['style:line-height-at-least'])!
    if (least > sz * 1.2) kids += `<a:lnSpc><a:spcPts val="${Math.round(Math.min(1584, least) * 100)}"/></a:lnSpc>`
  }
  if (!kids) kids = '<a:lnSpc><a:spcPct val="100000"/></a:lnSpc>'
  const before = toPt(pp.p['fo:margin-top'])
  const after = toPt(pp.p['fo:margin-bottom'])
  kids += `<a:spcBef><a:spcPts val="${Math.round(Math.min(1584, Math.max(0, before ?? 0)) * 100)}"/></a:spcBef>`
  kids += `<a:spcAft><a:spcPts val="${Math.round(Math.min(1584, Math.max(0, after ?? 0)) * 100)}"/></a:spcAft>`
  if (label && labeled && label.kind !== 'none') {
    // written even when they follow the text: a master text style must not give its own
    kids += `<a:buClr><a:srgbClr val="${label.color ?? color}"/></a:buClr>`
    kids += `<a:buSzPct val="${Math.round(Math.min(4, Math.max(0.25, label.size ?? 1)) * 100000)}"/>`
    if (label.kind === 'bullet') kids += `<a:buFont typeface="${escAttr(label.font ?? 'Arial')}"/><a:buChar char="${escAttr(label.char ?? '•')}"/>`
    else kids += `<a:buAutoNum type="${label.autoType}"${label.start && label.start !== 1 ? ` startAt="${label.start}"` : ''}/>`
  } else kids += '<a:buNone/>'
  return { attrs, kids }
}

/** the a:p elements of a text container (draw:text-box, a shape, a table cell); '' without paragraphs */
/** what the height of a paragraph is estimated from (shrinking text to fit its frame) */
export interface ParaMetric {
  /** widths of the lines between forced breaks, in ems × font size (pt) */
  widths: number[]
  sz: number
  /** line height: proportional (1 = single) or exact (pt) */
  lnPct?: number
  lnPts?: number
  before: number
  after: number
  marL: number
  indent: number
}

/** a character's approximate advance in ems (proportional sans-serif) */
function advance(ch: string): number {
  const c = ch.codePointAt(0) ?? 0
  if (c === 32) return 0.28
  if (c >= 0x2e80) return 1
  if (/[A-Z0-9]/.test(ch)) return 0.65
  if (/[mwMW]/.test(ch)) return 0.85
  if (/[iljtfr.,;:'!|]/.test(ch)) return 0.3
  return 0.52
}

export function paragraphsXml(container: ONode, frame: TextFrame, env: TextEnv, metrics?: ParaMetric[]): string {
  const { styles, master } = env
  const paras: Para[] = []
  collect(container, paras, 0, undefined, styles, master)
  const cache = new Map<string, Props>()
  let out = ''
  for (const para of paras) {
    const level = Math.max(1, Math.min(9, para.depth || 1))
    const pName = para.el.attrs['text:style-name']
    const key = `${level}/${pName ?? ''}`
    let pp = cache.get(key)
    if (!pp) {
      pp = frame.level(level)
      if (frame.textStyle) pp = overlay(pp, styles.props('paragraph', frame.textStyle, master))
      if (pName) pp = overlay(pp, styles.props('paragraph', pName, master))
      cache.set(key, pp)
    }
    let label: Label | undefined
    if (para.depth > 0) {
      const list = para.list ?? styles.list(pp.listName, master) ?? pp.list
      label = labelOf(levelStyle(list, Math.min(MAX_DEPTH, para.depth)), styles)
      if (label?.kind === 'number' && para.start) label = { ...label, start: para.start }
    }
    const segs = segments(para.el, pp.t, env)
    const sz = fontSize(pp.t)
    const first = segs.find((g) => g.text.trim())
    const { attrs, kids } = pPrParts(pp, label, para.label, sz, textColor(first?.t ?? pp.t, env))
    const lvl = para.depth > 1 ? ` lvl="${Math.min(8, para.depth - 1)}"` : ''
    if (metrics) {
      const widths = [0]
      let maxSz = 0
      for (const g of segs) {
        if (g.br) {
          widths.push(0)
          continue
        }
        const gs = fontSize(g.t)
        maxSz = Math.max(maxSz, gs)
        for (const ch of g.text) widths[widths.length - 1] += advance(ch) * gs
      }
      const lh = pp.p['fo:line-height']
      const [marL, indent] = indents(pp, label, para.label)
      metrics.push({
        widths,
        sz: maxSz || sz,
        lnPct: lh?.endsWith('%') ? parseFloat(lh) / 100 || undefined : undefined,
        lnPts: lh && !lh.endsWith('%') ? toPt(lh) : undefined,
        before: Math.max(0, toPt(pp.p['fo:margin-top']) ?? 0),
        after: Math.max(0, toPt(pp.p['fo:margin-bottom']) ?? 0),
        marL,
        indent,
      })
    }
    out += `<a:p><a:pPr${lvl}${attrs}>${kids}</a:pPr>${runsXml(segs, env)}${rPrXml('endParaRPr', pp.t, env)}</a:p>`
  }
  return out
}

/**
 * Font scale (0.25…1) and line spacing reduction that make estimated text fit a w × h area, as
 * shrink-on-overflow autofit does: [1, 0] when it fits already. Paragraph spacing is not scaled.
 */
export function fitScale(metrics: ParaMetric[], w: number, h: number): [number, number] {
  if (!metrics.length || w <= 0 || h <= 0) return [1, 0]
  const height = (s: number, r: number) => {
    let total = 0
    metrics.forEach((m, k) => {
      const sz = m.sz * s
      const line = m.lnPts !== undefined ? m.lnPts : sz * 1.2 * (m.lnPct ?? 1) * (1 - r)
      let lines = 0
      for (const [i, width] of m.widths.entries()) {
        const avail = Math.max(sz, w - m.marL - (i === 0 ? m.indent : 0))
        // wrapping at word boundaries wastes part of each line
        lines += Math.max(1, Math.ceil((width * s * 1.04) / avail - 1e-9))
      }
      total += (k ? m.before : 0) + lines * line + m.after
    })
    return total
  }
  if (height(1, 0) <= h) return [1, 0]
  const solve = (r: number) => {
    let lo = 0.25
    let hi = 1
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2
      if (height(mid, r) <= h) lo = mid
      else hi = mid
    }
    return Math.max(0.25, Math.floor(lo * 40) / 40)
  }
  let r = 0
  let s = solve(r)
  if (s < 0.9) s = solve((r = 0.1))
  if (s < 0.8) s = solve((r = 0.2))
  return [s, r]
}

/** a:lvlNpPr of a master text style: paragraph properties, label of the list level and default run properties */
export function lvlXml(n: number, pp: Props, list: ONode | undefined, env: TextEnv, labeled = true): string {
  const label = labelOf(levelStyle(list, n), env.styles)
  const { attrs, kids } = pPrParts(pp, label, labeled, fontSize(pp.t), textColor(pp.t, env))
  return `<a:lvl${n}pPr${attrs}>${kids}${rPrXml('defRPr', pp.t, env)}</a:lvl${n}pPr>`
}

const ANCHOR: Record<string, string> = { top: 't', middle: 'ctr', bottom: 'b', justify: 'ctr' }

/**
 * a:bodyPr of graphic properties: insets, anchoring, wrapping, autofit. `frame`: a text frame (draw:frame), whose
 * text wraps at its width unless it grows with its text.
 */
/** text shrinks on overflow (autofit) */
export const shrinks = (g: Record<string, string>) => g['style:shrink-to-fit'] === 'true' || ['shrink-to-fit', 'true', 'all'].includes(g['draw:fit-to-size'] ?? '')

/** the padding of a text frame (pt): left, top, right, bottom */
export const padding = (g: Record<string, string>) => ['left', 'top', 'right', 'bottom'].map((side) => Math.max(0, toPt(g[`fo:padding-${side}`]) ?? toPt(g['fo:padding']) ?? 0))

export function bodyPrXml(g: Record<string, string>, p: Record<string, string>, opts: { frame: boolean; autoGrow: boolean; scale?: [number, number] }): string {
  const pads = padding(g)
  const pad = (side: string) => emu(pads[['left', 'top', 'right', 'bottom'].indexOf(side)])
  const anchor = ANCHOR[g['draw:textarea-vertical-align'] ?? ''] ?? 't'
  const wrap = opts.frame ? g['draw:auto-grow-width'] !== 'true' : g['fo:wrap-option'] !== 'no-wrap'
  const mode = g['loext:writing-mode'] ?? g['style:writing-mode'] ?? g['draw:writing-mode'] ?? p['loext:writing-mode'] ?? p['style:writing-mode']
  const vert = mode === 'tb-rl90' ? 'vert' : mode === 'bt-lr' ? 'vert270' : mode?.startsWith('tb') ? 'eaVert' : undefined
  const center = g['draw:textarea-horizontal-align'] === 'center' && !wrap
  let fit = '<a:noAutofit/>'
  const grow = g['draw:auto-grow-height'] ?? (opts.autoGrow ? 'true' : 'false')
  if (shrinks(g)) {
    const [scale, reduce] = opts.scale ?? [1, 0]
    fit = scale < 1 ? `<a:normAutofit fontScale="${Math.round(scale * 100000)}"${reduce ? ` lnSpcReduction="${Math.round(reduce * 100000)}"` : ''}/>` : '<a:normAutofit/>'
  }
  else if (grow === 'true') fit = '<a:spAutoFit/>'
  return (
    `<a:bodyPr${vert ? attr('vert', vert) : ''} wrap="${wrap ? 'square' : 'none'}" lIns="${pad('left')}" tIns="${pad('top')}" rIns="${pad('right')}" bIns="${pad('bottom')}" ` +
    `anchor="${anchor}"${center ? ' anchorCtr="1"' : ''} rtlCol="0">${fit}</a:bodyPr>`
  )
}
