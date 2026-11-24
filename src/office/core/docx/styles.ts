import { cssFont } from '../fonts'
import { resolveColor, type Theme } from '../theme'
import { kid, kids, num, onOff, path, type XEl } from '../xml'
import { cutBasedOnCycles, missingDefaultStyles } from './postload'
import type { Border, CanonStyle, ParaDirty, ParaStyle, RunSet, RunStyle, StyleInfo, Tag } from './types'

export const HIGHLIGHT: Record<string, string> = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000',
  darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000',
  darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff',
}

export const hexColor = (v: string | undefined): string | undefined =>
  v && v !== 'auto' && /^[0-9a-fA-F]{6}$/.test(v) ? '#' + v.toLowerCase() : undefined

export function shading(el: XEl | undefined): string | undefined {
  if (!el) return undefined
  return hexColor(el.a.fill) ?? (el.a.val === 'solid' ? hexColor(el.a.color) : undefined)
}

const BORDER_STYLE: Record<string, string> = {
  single: 'solid', thick: 'solid', double: 'double', dotted: 'dotted', dashed: 'dashed', dotDash: 'dashed',
  dotDotDash: 'dotted', triple: 'double', thinThickSmallGap: 'double', thickThinSmallGap: 'double',
  wave: 'solid', dashSmallGap: 'dashed', outset: 'outset', inset: 'inset',
}

export function border(el: XEl | undefined): Border | undefined | null {
  if (!el) return undefined
  const v = el.a.val
  if (!v || v === 'nil' || v === 'none') return null
  const w = Math.max(0.5, (num(el.a.sz) ?? 4) / 8)
  return { w: v === 'double' ? Math.max(w, 2.25) : w, style: BORDER_STYLE[v] ?? 'solid', color: hexColor(el.a.color) ?? '#000000' }
}

export const borderCss = (b: Border | null | undefined): string | undefined =>
  b === null ? 'none' : b ? `${b.w}pt ${b.style} ${b.color}` : undefined

/**
 * the font an rFonts element names for `script` (theme fonts resolved).
 * ascii / hAnsi / cs 走 latin 槽（sdkjs 同构）；eastAsia 走 CJK 槽；
 * 请求 'eastAsia' 而元素无 w:eastAsia → 回退 latin 槽（sdkjs 同规）。
 */
export function fontName(rf: XEl, theme: Theme, script: 'ascii' | 'hAnsi' | 'cs' | 'eastAsia' = 'ascii'): string | undefined {
  if (script === 'eastAsia') {
    if (rf.a.eastAsia) return rf.a.eastAsia
    const eh = rf.a.eastAsiaTheme
    if (eh) return eh.startsWith('major') ? theme.majorEA : theme.minorEA
    // 无 CJK 槽 → latin 回退
  }
  const th = rf.a.asciiTheme ?? rf.a.hAnsiTheme
  if (th) return th.startsWith('major') ? theme.major : theme.minor
  return rf.a.ascii ?? rf.a.hAnsi ?? rf.a.cs ?? rf.a.eastAsia
}

const fontOf = (rf: XEl, theme: Theme, script?: 'ascii' | 'hAnsi' | 'cs' | 'eastAsia'): string | undefined => cssFont(fontName(rf, theme, script))

export function readRPr(rPr: XEl | undefined, theme: Theme): RunStyle {
  const s: RunStyle = {}
  if (!rPr) return s
  for (const c of rPr.c) {
    switch (c.n) {
      case 'b': s.b = onOff(c); break
      case 'i': s.i = onOff(c); break
      case 'strike': s.strike = onOff(c); break
      case 'dstrike': s.dstrike = onOff(c); break
      case 'caps': s.caps = onOff(c); break
      case 'smallCaps': s.smallCaps = onOff(c); break
      case 'vanish': s.vanish = onOff(c); break
      case 'u': s.u = c.a.val ?? 'single'; break
      case 'color': { const col = resolveColor(c, theme); if (col) s.color = col; break }
      case 'sz': { const v = num(c.a.val); if (v) s.sz = v / 2; break }
      case 'rFonts': {
        const raw = fontName(c, theme)
        const f = fontOf(c, theme)
        if (f) s.font = f
        if (raw) s.rfont = raw
        // 纯 CJK 槽（无 latin 回退）：度量内核按字符集选面时用
        const eh = c.a.eastAsiaTheme
        const ea = c.a.eastAsia ?? (eh ? (eh.startsWith('major') ? theme.majorEA : theme.minorEA) : undefined)
        if (ea) s.rfontEA = ea
        break
      }
      case 'highlight': { const h = HIGHLIGHT[c.a.val]; if (h) s.hl = h; break }
      case 'shd': { const h = shading(c); if (h) s.shd = h; break }
      case 'vertAlign': s.va = c.a.val === 'superscript' ? 'sup' : c.a.val === 'subscript' ? 'sub' : undefined; break
      case 'spacing': { const v = num(c.a.val); if (v) s.spacing = v / 20; break }
    }
  }
  return s
}

/**
 * Base-relative RunSet that turns `base`'s look into `target`'s look. Used on read-back to rebuild a
 * FmtChange's `d`: when a file with w:rPrChange is reopened, `base` is the outer (new-format) rPr and
 * `target` is the snapshot inside w:rPrChange (the old format); applying the result with applyRunSet
 * to the outer rPr reproduces exactly that snapshot, so re-saving writes the same XML.
 */
export function rPrDelta(base: XEl | undefined, target: XEl | undefined, theme: Theme): RunSet {
  const d: RunSet = {}
  if (!base && !target) return d
  const kidOf = (el: XEl | undefined, n: string) => (el ? kid(el, n) : undefined)
  const boolKey = (key: 'b' | 'i' | 'strike', n: string) => {
    const a = onOff(kidOf(base, n)) ?? false
    const b = onOff(kidOf(target, n)) ?? false
    if (a !== b) d[key] = b || null
  }
  boolKey('b', 'b')
  boolKey('i', 'i')
  boolKey('strike', 'strike')
  {
    const a = kidOf(base, 'u'), b = kidOf(target, 'u')
    const av = a ? (a.a.val ?? 'single') : undefined
    const bv = b ? (b.a.val ?? 'single') : undefined
    if (av !== bv) d.u = bv && bv !== 'none' ? bv : null
  }
  {
    const av = hexColor(kidOf(base, 'color')?.a.val)
    const bv = hexColor(kidOf(target, 'color')?.a.val)
    if (av !== bv) d.color = bv ?? null
  }
  {
    const av = num(kidOf(base, 'sz')?.a.val)
    const bv = num(kidOf(target, 'sz')?.a.val)
    if (av !== bv) d.sz = bv !== undefined ? bv / 2 : null
  }
  {
    const a = kidOf(base, 'rFonts'), b = kidOf(target, 'rFonts')
    const av = a ? fontName(a, theme) : undefined
    const bv = b ? fontName(b, theme) : undefined
    if (av !== bv) d.font = bv ?? null
  }
  {
    const av = HIGHLIGHT[kidOf(base, 'highlight')?.a.val ?? '']
    const bv = HIGHLIGHT[kidOf(target, 'highlight')?.a.val ?? '']
    if (av !== bv) d.hl = bv ?? null
  }
  {
    const va = (el: XEl | undefined) => (el ? (el.a.val === 'superscript' ? 'sup' : el.a.val === 'subscript' ? 'sub' : undefined) : undefined)
    const av = va(kidOf(base, 'vertAlign')), bv = va(kidOf(target, 'vertAlign'))
    if (av !== bv) d.va = bv ?? null
  }
  return d
}

export interface NumPr {
  numId: string
  ilvl: number
}

export interface PPrResult {
  ps: ParaStyle
  styleId?: string
  numPr?: NumPr
  sectPr?: XEl
}

export function readPPr(pPr: XEl | undefined): PPrResult {
  const ps: ParaStyle = {}
  const out: PPrResult = { ps }
  if (!pPr) return out
  for (const c of pPr.c) {
    switch (c.n) {
      case 'pStyle': out.styleId = c.a.val; break
      case 'numPr': {
        const id = kid(c, 'numId')?.a.val
        if (id !== undefined) out.numPr = { numId: id, ilvl: num(kid(c, 'ilvl')?.a.val, 0)! }
        break
      }
      case 'jc': {
        const v = c.a.val
        ps.align = v === 'center' ? 'center' : v === 'right' || v === 'end' ? 'right' : v === 'both' || v === 'distribute' ? 'justify' : 'left'
        break
      }
      case 'ind': {
        const l = num(c.a.left ?? c.a.start)
        const r = num(c.a.right ?? c.a.end)
        if (l !== undefined) ps.indL = l / 20
        if (r !== undefined) ps.indR = r / 20
        const hang = num(c.a.hanging)
        const first = num(c.a.firstLine)
        if (hang !== undefined) ps.indFirst = -hang / 20
        else if (first !== undefined) ps.indFirst = first / 20
        break
      }
      case 'spacing': {
        const b = num(c.a.before)
        const a = num(c.a.after)
        if (c.a.beforeAutospacing === '1' || c.a.beforeAutospacing === 'true') ps.before = 14
        else if (b !== undefined) ps.before = b / 20
        if (c.a.afterAutospacing === '1' || c.a.afterAutospacing === 'true') ps.after = 14
        else if (a !== undefined) ps.after = a / 20
        const line = num(c.a.line)
        if (line !== undefined) {
          const rule = (c.a.lineRule as ParaStyle['lineRule']) ?? 'auto'
          ps.lineRule = rule
          ps.line = rule === 'auto' ? line / 240 : line / 20
        }
        break
      }
      case 'shd': { const h = shading(c); if (h) ps.shd = h; break }
      case 'pBdr': {
        const t = border(kid(c, 'top'))
        const b = border(kid(c, 'bottom'))
        const l = border(kid(c, 'left') ?? kid(c, 'start'))
        const r = border(kid(c, 'right') ?? kid(c, 'end'))
        if (t) ps.bTop = t
        if (b) ps.bBottom = b
        if (l) ps.bLeft = l
        if (r) ps.bRight = r
        break
      }
      case 'keepNext': ps.keepNext = onOff(c); break
      case 'keepLines': ps.keepLines = onOff(c); break
      case 'widowControl': ps.widow = onOff(c); break
      case 'snapToGrid': ps.snapGrid = onOff(c); break
      case 'autoNameSpace': ps.autoNameSpace = onOff(c); break
      case 'contextualSpacing': ps.contextual = onOff(c); break
      case 'pageBreakBefore': ps.pageBreakBefore = onOff(c); break
      case 'outlineLvl': ps.outline = num(c.a.val); break
      case 'tabs': {
        const list: Tag[] = []
        for (const t of kids(c, 'tab')) {
          const al = t.a.val
          if (al === 'clear') continue
          const pos = num(t.a.pos)
          if (pos === undefined) continue
          list.push({ pos: pos / 20, al: al as Tag['al'] | undefined, leader: t.a.leader as Tag['leader'] | undefined })
        }
        if (list.length) ps.tabs = list
        break
      }
      case 'sectPr': out.sectPr = c; break
    }
  }
  return out
}

export const merge = <T extends object>(...parts: (T | undefined)[]): T => Object.assign({}, ...parts.filter(Boolean)) as T

/**
 * Base-relative ParaDirty that turns `base`'s own properties into `target`'s. Used on read-back to rebuild
 * a PPrChange's `d`: the outer pPr holds the new format, the snapshot inside w:pPrChange the old one;
 * applying the result with applyParaDirty to the outer pPr reproduces that snapshot, so re-saving writes
 * the same XML.
 *
 * Only the properties the editor can change are covered: the paragraph style, the alignment, the left
 * indent, the spacing, the list level and the page break before. The list itself (which numId) and the
 * right / first-line indents stay the base pPr's.
 */
export function pPrDelta(base: XEl | undefined, target: XEl | undefined): ParaDirty {
  const d: ParaDirty = {}
  if (!base && !target) return d
  const b = readPPr(base)
  const t = readPPr(target)
  if ((b.styleId ?? '') !== (t.styleId ?? '')) d.style = t.styleId ?? ''
  if ((b.ps.align ?? 'left') !== (t.ps.align ?? 'left')) d.align = t.ps.align ?? null
  if ((b.ps.indL ?? 0) !== (t.ps.indL ?? 0)) d.indL = t.ps.indL ?? null
  if ((b.ps.before ?? 0) !== (t.ps.before ?? 0)) d.before = t.ps.before ?? null
  if ((b.ps.after ?? 0) !== (t.ps.after ?? 0)) d.after = t.ps.after ?? null
  // the line spacing as a multiple only: the exact / at-least rules are not written by the editor
  if (b.ps.lineRule === 'auto' && t.ps.lineRule === 'auto' && (b.ps.line ?? 0) !== (t.ps.line ?? 0)) d.line = t.ps.line ?? null
  if (b.numPr && t.numPr && b.numPr.ilvl !== t.numPr.ilvl) d.ilvl = t.numPr.ilvl
  if (!!b.ps.pageBreakBefore !== !!t.ps.pageBreakBefore) d.pageBreak = !!t.ps.pageBreakBefore
  return d
}

// ---------------------------------------------------------------------------

interface StyleDef {
  id: string
  type: string
  basedOn?: string
  el: XEl
  isDefault: boolean
  name: string
  next?: string
  quick: boolean
  hidden: boolean
  /** w:link —— 段落样式绑定的字符样式 id（hyperlink run 走它） */
  link?: string
}

export interface ResolvedParaStyle {
  ps: ParaStyle
  rs: RunStyle
  numPr?: NumPr
}

/** 编号层 pPr 提供者（Numbering 实例的鸭子型；StyleSheet 不直接依赖 numbering 模块） */
export interface NumProvider {
  level(numId: string, ilvl: number): { ps: ParaStyle; rs: RunStyle } | undefined
}

export interface CondFormat {
  rs: RunStyle
  shd?: string
}

export interface ResolvedTableStyle {
  ps: ParaStyle
  rs: RunStyle
  borders: Record<string, Border | null | undefined>
  cellMar: Partial<Record<'top' | 'left' | 'bottom' | 'right', number>>
  shd?: string
  cond: Record<string, CondFormat>
}

const CANON_BY_NAME: Record<string, CanonStyle> = {
  normal: 'normal',
  title: 'title',
  subtitle: 'subtitle',
  'heading 1': 'h1',
  'heading 2': 'h2',
  'heading 3': 'h3',
  'heading 4': 'h4',
  'heading 5': 'h5',
  'heading 6': 'h6',
  heading1: 'h1',
  heading2: 'h2',
  heading3: 'h3',
  heading4: 'h4',
  heading5: 'h5',
  heading6: 'h6',
}

function readDef(s: XEl): StyleDef | undefined {
  const id = s.a.styleId
  if (!id) return undefined
  return {
    id,
    type: s.a.type ?? 'paragraph',
    basedOn: kid(s, 'basedOn')?.a.val,
    el: s,
    isDefault: s.a.default === '1' || s.a.default === 'true',
    name: kid(s, 'name')?.a.val ?? id,
    next: kid(s, 'next')?.a.val,
    quick: !!kid(s, 'qFormat'),
    hidden: !!kid(s, 'semiHidden') || !!kid(s, 'hidden'),
    link: kid(s, 'link')?.a.val,
  }
}

export class StyleSheet {
  private defs = new Map<string, StyleDef>()
  private paraCache = new Map<string, ResolvedParaStyle>()
  private charCache = new Map<string, RunStyle>()
  private tblCache = new Map<string, ResolvedTableStyle>()
  defaultPara?: string
  defaultTable?: string
  defaultChar?: string
  defaultHyperlink?: string
  docRs: RunStyle = {}
  docPs: ParaStyle = {}
  /** 编号层 pPr 提供者，parser 构造 Numbering 后注入（链内应用，sdkjs 同规） */
  private numProv?: NumProvider

  constructor(root: XEl | undefined, private theme: Theme) {
    if (!root) return
    const dd = kid(root, 'docDefaults')
    this.docRs = readRPr(path(dd, 'rPrDefault', 'rPr'), theme)
    this.docPs = readPPr(path(dd, 'pPrDefault', 'pPr')).ps
    for (const s of kids(root, 'style')) {
      const def = readDef(s)
      if (!def) continue
      this.defs.set(def.id, def)
      if (def.isDefault && def.type === 'paragraph') this.defaultPara = def.id
      if (def.isDefault && def.type === 'table') this.defaultTable = def.id
      if (def.isDefault && def.type === 'character') this.defaultChar = def.id
      const nm = def.name.toLowerCase().replace(/\s/g, '')
      if (nm === 'hyperlink' && def.type === 'character') this.defaultHyperlink = def.id
    }
  }

  setNumbering(n: NumProvider) {
    this.numProv = n
  }

  /** registers a style element added to styles.xml, or the new definition of a style that changed */
  add(s: XEl) {
    const def = readDef(s)
    if (!def) return
    this.defs.set(def.id, def)
    this.paraCache.clear()
    this.charCache.clear()
    this.tblCache.clear()
  }

  /**
   * PostLoadPrepare 二段装配（P7，postload.ts 头注有完整裁决）：
   *  ① 四个缺省样式缺失时注入并落 default 槽（Get_Pr:8117-8119 的槽位语义——
   *     StyleId 空 → Default.Table/Paragraph/Character；Normal Table 是表距链层的
   *     恒在来源，缺它则自定义表样式直接吃 compat 种子）；
   *  ② 灰标法环检测，环成员 BasedOn 切断（计算面；文件面透传不动）。
   * 调用点：DocxDocument.open()，settings.xml 解析后、任何样式计算前。
   */
  applyPostload() {
    const names = [...this.defs.values()].map((d) => d.name)
    for (const spec of missingDefaultStyles(names)) {
      const def = readDef(spec.el)
      if (!def) continue
      this.defs.set(def.id, def)
      if (def.isDefault && def.type === 'paragraph' && !this.defaultPara) this.defaultPara = def.id
      if (def.isDefault && def.type === 'table' && !this.defaultTable) this.defaultTable = def.id
      if (def.isDefault && def.type === 'character' && !this.defaultChar) this.defaultChar = def.id
    }
    const links = new Map<string, string | undefined>()
    for (const d of this.defs.values()) links.set(d.id, d.basedOn)
    for (const id of cutBasedOnCycles(links)) {
      const d = this.defs.get(id)
      if (d) d.basedOn = undefined
    }
    this.paraCache.clear()
    this.charCache.clear()
    this.tblCache.clear()
  }

  /** the element of paragraph style `id`: what the style says itself, nothing inherited */
  own(id: string): XEl | undefined {
    const d = this.defs.get(id)
    return d?.type === 'paragraph' ? d.el : undefined
  }

  /** what paragraph style `id` gets from the styles it is based on and the document defaults, its own properties left out */
  inherited(id: string): ResolvedParaStyle {
    const d = this.defs.get(id)
    const acc: ResolvedParaStyle = { ps: merge(this.docPs), rs: merge(this.docRs) }
    if (d?.basedOn) this.calcInto(acc, d.basedOn, 'paragraph', false, new Set([id]))
    return acc
  }

  /** paragraph style `id` and every paragraph style based on it, directly or not */
  family(id: string): string[] {
    const out: string[] = []
    for (const d of this.defs.values()) if (d.type === 'paragraph' && this.chain(d.id).some((x) => x.id === id)) out.push(d.id)
    return out
  }

  /** ids of the built-in paragraph styles present in the document (matched by name, any locale id) */
  canonical(): Partial<Record<CanonStyle, string>> {
    const out: Partial<Record<CanonStyle, string>> = {}
    if (this.defaultPara) out.normal = this.defaultPara
    for (const d of this.defs.values()) {
      if (d.type !== 'paragraph') continue
      const k = CANON_BY_NAME[d.name.toLowerCase()] ?? CANON_BY_NAME[d.id.toLowerCase()]
      if (k && !out[k]) out[k] = d.id
    }
    return out
  }

  has(id: string): boolean {
    return this.defs.has(id)
  }

  /** Paragraph styles offered in the style picker (Normal, Title, Heading 1…). */
  quickStyles(): StyleInfo[] {
    const pretty = (n: string) => n.replace(/^heading (\d)$/i, 'Heading $1').replace(/^\w/, (c) => c.toUpperCase())
    const canon = this.canonical()
    const canonOf = new Map(Object.entries(canon).map(([k, id]) => [id, k as CanonStyle]))
    return [...this.defs.values()]
      .filter((d) => d.type === 'paragraph' && (d.isDefault || canonOf.has(d.id) || (d.quick && !d.hidden)))
      .map((d) => {
        const r = this.para(d.id)
        const { b, i, color, sz, font } = r.rs
        return { id: d.id, name: pretty(d.name), next: d.next, canon: canonOf.get(d.id), outline: r.ps.outline, preview: { b, i, color, sz, font } }
      })
  }

  private chain(id: string | undefined): StyleDef[] {
    const out: StyleDef[] = []
    const seen = new Set<string>()
    let cur = id ? this.defs.get(id) : undefined
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      out.unshift(cur)
      cur = cur.basedOn ? this.defs.get(cur.basedOn) : undefined
    }
    return out
  }

  /**
   * sdkjs CStyles.Internal_Get_Pr（Styles.js:8238）的 TS 等价：沿 BasedOn 链递归，
   * 先祖先、再编号层、后自身，逐层 merge 进 acc。语义逐条对齐：
   *  - 环保护：passed 命中即返回；
   *  - 类型过滤：Style 存在但 Type 不符 → 视为缺失；
   *  - StyleId 空 / Style 缺失：useDefault 时并入 default 样式【自身声明】
   *    （不是 docDefaults——那是种子层的职责；也不递归它的 BasedOn）；
   *  - BasedOn === null：段落 / 表格不再并入 default（注释掉的 ivanova_veronica
   *    案例）；字符并入 Default.Character 自身声明；
   *  - BasedOn 有效：递归它，useDefault=false；
   *  - 编号：Style.pPr 带 numPr 且 numId≠0 → 并入编号层 ps/rs；numId=0 →
   *    清 numPr + indL=0 + indFirst=0（Word 对 numId 0 的语义）；
   *  - 最后并入当前样式自身的 pPr/rPr（表格再叠 tblPr 面）。
   * 调用方负责种子（docDefaults / 表格样式替代）。
   */
  private calcInto(acc: ResolvedParaStyle, styleId: string | undefined, type: string, useDefault: boolean, passed: Set<string>): void {
    if (!styleId || passed.has(styleId)) return
    passed.add(styleId)
    let d = this.defs.get(styleId)
    if (d && d.type !== type) d = undefined
    if (!d) {
      if (useDefault) {
        const defId = type === 'paragraph' ? this.defaultPara : type === 'table' ? this.defaultTable : this.defaultChar
        const def = defId ? this.defs.get(defId) : undefined
        if (def) this.mergeOwn(acc, def)
      }
      return
    }
    if (!d.basedOn) {
      // 根样式：段落/表格不叠 default；字符叠 Default.Character 自身声明
      if (useDefault && type === 'character' && this.defaultChar && this.defaultChar !== d.id) {
        const dc = this.defs.get(this.defaultChar)
        if (dc && dc.type === 'character') this.mergeOwn(acc, dc)
      }
    } else {
      this.calcInto(acc, d.basedOn, type, false, passed)
    }
    // 编号层（段落与表格型样式才生效）。sdkjs 只并 GetParaPr（Styles.js:8389）——
    // 编号层的 rPr（项目符号字体/字号）属于 marker，绝不进段落 run 面
    const own = readPPr(kid(d.el, 'pPr'))
    if (own.numPr && (type === 'paragraph' || type === 'table')) {
      if (own.numPr.numId !== '0') {
        const lv = this.numProv?.level(own.numPr.numId, own.numPr.ilvl)
        if (lv) acc.ps = merge(acc.ps, lv.ps)
      } else {
        acc.numPr = undefined
        acc.ps.indL = 0
        acc.ps.indFirst = 0
      }
    }
    if (own.numPr && own.numPr.numId !== '0') acc.numPr = own.numPr
    this.mergeOwn(acc, d)
  }

  /** 样式自身声明并入（pPr/rPr） */
  private mergeOwn(acc: ResolvedParaStyle, d: StyleDef): void {
    const p = readPPr(kid(d.el, 'pPr'))
    acc.ps = merge(acc.ps, p.ps)
    if (p.numPr && p.numPr.numId !== '0') acc.numPr = p.numPr
    acc.rs = merge(acc.rs, readRPr(kid(d.el, 'rPr'), this.theme))
  }

  /**
   * 段落样式 `id` 的计算面（Get_Pr + Internal_Get_Pr 根调用等价）。种子规则对齐
   * Get_Pr（Styles.js:8083-8160）：
   *  - 普通段落：docDefaults（docPs/docRs），useDefault=true；
   *  - 表格内段落：种子 = 表格面（table() 自带 docDefaults 打底 + 表格样式链声明，
   *    即 styletype_Table 的 Get_Pr 结果），useDefault=false —— Normal 不再作为
   *    「缺失回退」并入，但 StyleId 缺省时仍解析为 Default.Paragraph 走完整链
   *    （bug 31469 只把 Normal 挡在表格面之外）；
   *  - id 缺失（普通段落）→ defaultPara 的完整链。
   * 缓存键含种子身份（表格样式 id），不同宿主表不串。
   */
  para(id: string | undefined, tblSeed?: string): ResolvedParaStyle {
    const key = `${id ?? this.defaultPara ?? ''}|${tblSeed ?? ''}`
    let r = this.paraCache.get(key)
    if (r) return r
    if (tblSeed) {
      const ts = this.table(tblSeed)
      r = { ps: merge(ts.ps), rs: merge(ts.rs) }
    } else {
      r = { ps: merge(this.docPs), rs: merge(this.docRs) }
    }
    this.calcInto(r, id ?? this.defaultPara, 'paragraph', !tblSeed, new Set())
    this.paraCache.set(key, r)
    return r
  }

  /** 字符样式 `id` 的计算面：种子空（styletype_Character 不并 Default.TextPr），链上算 */
  char(id: string | undefined): RunStyle {
    if (!id) return {}
    let r = this.charCache.get(id)
    if (r) return r
    const acc: ResolvedParaStyle = { ps: {}, rs: {} }
    this.calcInto(acc, id, 'character', true, new Set())
    r = acc.rs
    this.charCache.set(id, r)
    return r
  }

  /**
   * 超链接 run 的字符面 = Default.Hyperlink（sdkjs GetDefaultHyperlink，
   * Paragraph.js:8099 HyperRun.Set_RStyle 同语义）。段落样式的 w:link 是
   * 「字符/段落样式配对」的另一回事，不参与超链接 run，故此处不读它。
   */
  hyperlink(): RunStyle | undefined {
    return this.defaultHyperlink ? this.char(this.defaultHyperlink) : undefined
  }

  table(id: string | undefined): ResolvedTableStyle {
    const key = id ?? this.defaultTable ?? ''
    let r = this.tblCache.get(key)
    if (r) return r
    // styletype_Table 的种子是 Default.TextPr/ParaPr 的副本（Get_Pr:8122-8124），
    // 即 docDefaults —— 表内段落经由这张面间接吃到 docDefaults
    r = { ps: merge(this.docPs), rs: merge(this.docRs), borders: {}, cellMar: {}, cond: {} }
    for (const d of this.chain(key)) {
      r.ps = merge(r.ps, readPPr(kid(d.el, 'pPr')).ps)
      r.rs = merge(r.rs, readRPr(kid(d.el, 'rPr'), this.theme))
      const tblPr = kid(d.el, 'tblPr')
      Object.assign(r.borders, readTableBorders(kid(tblPr, 'tblBorders')))
      Object.assign(r.cellMar, readMargins(kid(tblPr, 'tblCellMar')))
      const shd = shading(path(d.el, 'tcPr', 'shd'))
      if (shd) r.shd = shd
      for (const c of kids(d.el, 'tblStylePr')) {
        const type = c.a.type
        if (!type) continue
        const prev = r.cond[type] ?? { rs: {} }
        r.cond[type] = {
          rs: merge(prev.rs, readRPr(kid(c, 'rPr'), this.theme)),
          shd: shading(path(c, 'tcPr', 'shd')) ?? prev.shd,
        }
      }
    }
    this.tblCache.set(key, r)
    return r
  }
}

export function readTableBorders(el: XEl | undefined): Record<string, Border | null | undefined> {
  const out: Record<string, Border | null | undefined> = {}
  if (!el) return out
  for (const c of el.c) {
    const k = c.n === 'start' ? 'left' : c.n === 'end' ? 'right' : c.n
    const b = border(c)
    if (b !== undefined) out[k] = b
  }
  return out
}

export function readMargins(el: XEl | undefined): Partial<Record<'top' | 'left' | 'bottom' | 'right', number>> {
  const out: Partial<Record<'top' | 'left' | 'bottom' | 'right', number>> = {}
  if (!el) return out
  for (const c of el.c) {
    const k = (c.n === 'start' ? 'left' : c.n === 'end' ? 'right' : c.n) as 'top' | 'left' | 'bottom' | 'right'
    const w = num(c.a.w)
    if (w !== undefined && (c.a.type === undefined || c.a.type === 'dxa')) out[k] = w / 20
  }
  return out
}
