/**
 * DOCX write-back: edited paragraphs are regenerated from their original XML
 * (pPr / rPr / inline objects copied verbatim, only changed properties patched);
 * everything else is written back byte-for-byte.
 */
import { relOfType } from '../opc'
import { cssFont } from '../fonts'
import {
  clone, el, getAttr, isNode, kidOf, kidsOf, local, parseRaw, prefixOf, removeKids, rootEl, serialize, setAttr, setOrdered, walkOoxml,
  escText, type RChild, type RNode,
} from '../raw'
import type { Theme } from '../theme'
import { kid, parseXml, type XEl } from '../xml'
import { Numbering } from './numbering'
import { fixCommentMarks, markEnd, markStart, numbering as commentNumbering, writeDocxComments } from './comments'
import type { DocxDocument, GenRun } from './parser'
import { fontName, HIGHLIGHT, readPPr, readRPr } from './styles'
import { planBuiltinWrite, serializeBuiltinStyle, serializeBuiltinStyles, type ExistingStyle } from './builtin'
import type {
  Block, CanonStyle, CellSpec, Crop, EditOp, EditResult, ParaDirty, ParaSpec, ParaStyle, Paragraph, RunSet, RunStyle, SpecRun, SrcRef, StyleInfo, StyleLook, StyleSetResult,
  TableOp, TableSpec, PageSet, PageSetResult, PageSetup, HFKind, HFLine, HFSet, HFSetResult, TrackMark, WrapSpec,
} from './types'

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const NUMBERING_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering'
const NUMBERING_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml'

const PPR_ORDER = [
  'pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd',
  'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi',
  'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection',
  'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange',
]
const RPR_ORDER = [
  'rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint',
  'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u',
  'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath', 'rPrChange',
]
// move ranges are dropped: a regenerated paragraph writes moved text back as plain w:ins / w:del
const START_MARKS = new Set(['bookmarkStart', 'commentRangeStart', 'permStart'])
const END_MARKS = new Set(['bookmarkEnd', 'commentRangeEnd', 'permEnd'])
const RUN_STOP = new Set(['p', 'oMath', 'oMathPara', 'pPr', 'rPr', 'r'])
const HL_NAME: Record<string, string> = Object.fromEntries(Object.entries(HIGHLIGHT).map(([k, v]) => [v, k]))

interface ParaLoc {
  node: RNode
  list: RChild[]
  index: number
}

/** Paragraphs of a body item in the same preorder the converter uses. */
export function collectParasRaw(nodes: RChild[]): ParaLoc[] {
  const out: ParaLoc[] = []
  nodes.forEach((n, i) => {
    if (!isNode(n)) return
    if (local(n.q) === 'p') out.push({ node: n, list: nodes, index: i })
    walkOoxml(n, (c, parent, idx) => {
      if (local(c.q) === 'p') out.push({ node: c, list: parent.c, index: idx })
    })
  })
  return out
}

export function collectRunsRaw(p: RNode): RNode[] {
  const out: RNode[] = []
  walkOoxml(p, (c) => {
    const l = local(c.q)
    if (l === 'r') out.push(c)
    return RUN_STOP.has(l)
  })
  return out
}

// ---------------------------------------------------------------- source lookup

const itemCache = new WeakMap<DocxDocument, Map<number, ParaLoc[]>>()

function itemParas(doc: DocxDocument, item: number): ParaLoc[] {
  let m = itemCache.get(doc)
  if (!m) itemCache.set(doc, (m = new Map()))
  let paras = m.get(item)
  if (!paras) {
    paras = collectParasRaw(parseRaw(doc.items[item] ?? ''))
    if (m.size > 64) m.delete(m.keys().next().value as number)
    m.set(item, paras)
  }
  return paras
}

export function origPara(doc: DocxDocument, pid: number): RNode | undefined {
  const loc = doc.origLoc.get(pid)
  if (!loc) return undefined
  return itemParas(doc, loc.item)[loc.ord]?.node
}

const runCache = new WeakMap<RNode, RNode[]>()
function origRun(doc: DocxDocument, src: SrcRef | undefined): RNode | undefined {
  if (!src) return undefined
  const p = origPara(doc, src[0])
  if (!p) return undefined
  let runs = runCache.get(p)
  if (!runs) runCache.set(p, (runs = collectRunsRaw(p)))
  return runs[src[1]]
}

// ---------------------------------------------------------------- generation

function applyRunSet(rPr: RNode, set: RunSet, W: string) {
  const val = W + 'val'
  const put = (l: string, node: RNode | undefined) => setOrdered(rPr, node, l, RPR_ORDER)
  // null: the element goes, the property comes from the style again
  const toggle = (l: string, on: boolean | null) => put(l, on === null ? undefined : on ? el(W + l) : el(W + l, { [val]: '0' }))
  if (set.b !== undefined) {
    toggle('b', set.b)
    toggle('bCs', set.b)
  }
  if (set.i !== undefined) {
    toggle('i', set.i)
    toggle('iCs', set.i)
  }
  if (set.strike !== undefined) {
    toggle('strike', set.strike)
    if (set.strike) put('dstrike', undefined)
  }
  if (set.u !== undefined) put('u', set.u === null ? undefined : el(W + 'u', { [val]: set.u && set.u !== 'none' ? set.u : 'none' }))
  if ('color' in set) put('color', set.color ? el(W + 'color', { [val]: set.color === 'auto' ? 'auto' : set.color.replace('#', '').toUpperCase() }) : undefined)
  if (set.sz !== undefined) {
    const v = set.sz === null ? undefined : String(Math.round(set.sz * 2))
    put('sz', v ? el(W + 'sz', { [val]: v }) : undefined)
    put('szCs', v ? el(W + 'szCs', { [val]: v }) : undefined)
  }
  if (set.font !== undefined) {
    const f = set.font
    put('rFonts', f === null ? undefined : el(W + 'rFonts', { [W + 'ascii']: f, [W + 'hAnsi']: f, [W + 'eastAsia']: f, [W + 'cs']: f }))
  }
  if ('hl' in set) {
    const name = set.hl ? HL_NAME[set.hl.toLowerCase()] : undefined
    if (!set.hl) {
      put('highlight', undefined)
      put('shd', undefined)
    } else if (name) put('highlight', el(W + 'highlight', { [val]: name }))
    else put('shd', el(W + 'shd', { [val]: 'clear', [W + 'color']: 'auto', [W + 'fill']: set.hl.replace('#', '').toUpperCase() }))
  }
  if ('va' in set) put('vertAlign', set.va ? el(W + 'vertAlign', { [val]: set.va === 'sup' ? 'superscript' : 'subscript' }) : undefined)
}

/**
 * Paragraph spacing attributes: a number sets one (pt; `line` counted as `rule` says: a multiple when 'auto'),
 * null removes it, undefined leaves it.
 */
function putSpacing(pPr: RNode, W: string, v: { before?: number | null; after?: number | null; line?: number | null }, rule: NonNullable<ParaStyle['lineRule']> = 'auto') {
  if (v.line === undefined && v.before === undefined && v.after === undefined) return
  const sp = clone(kidOf(pPr, 'spacing') ?? el(W + 'spacing'))
  const twips = (x: number | null) => (x === null ? undefined : String(Math.round(x * 20)))
  if (v.before !== undefined) {
    setAttr(sp, W + 'before', twips(v.before))
    setAttr(sp, W + 'beforeAutospacing', undefined)
  }
  if (v.after !== undefined) {
    setAttr(sp, W + 'after', twips(v.after))
    setAttr(sp, W + 'afterAutospacing', undefined)
  }
  if (v.line !== undefined) {
    setAttr(sp, W + 'line', v.line === null ? undefined : String(Math.round(v.line * (rule === 'auto' ? 240 : 20))))
    setAttr(sp, W + 'lineRule', v.line === null ? undefined : rule)
  }
  setOrdered(pPr, sp.a.trim() ? sp : undefined, 'spacing', PPR_ORDER)
}

const jcEl = (W: string, align: NonNullable<ParaStyle['align']>) => el(W + 'jc', { [W + 'val']: align === 'justify' ? 'both' : align })

function textContentXml(text: string, W: string): string {
  let out = ''
  for (const piece of text.split(/(\t|\n)/)) {
    if (!piece) continue
    if (piece === '\t') out += `<${W}tab/>`
    else if (piece === '\n') out += `<${W}br/>`
    else out += `<${W}t xml:space="preserve">${escText(piece)}</${W}t>`
  }
  return out
}

function abstractXml(W: string, id: number, kind: 'bullet' | 'number'): string {
  const bullets = ['•', '◦', '▪']
  const fmts = ['decimal', 'lowerLetter', 'lowerRoman']
  let lv = ''
  for (let l = 0; l < 9; l++) {
    const fmt = kind === 'bullet' ? 'bullet' : fmts[l % 3]
    const text = kind === 'bullet' ? bullets[l % 3] : `%${l + 1}.`
    lv +=
      `<${W}lvl ${W}ilvl="${l}"><${W}start ${W}val="1"/><${W}numFmt ${W}val="${fmt}"/><${W}lvlText ${W}val="${text}"/>` +
      `<${W}lvlJc ${W}val="left"/><${W}pPr><${W}ind ${W}left="${720 * (l + 1)}" ${W}hanging="360"/></${W}pPr></${W}lvl>`
  }
  return `<${W}abstractNum ${W}abstractNumId="${id}"><${W}multiLevelType ${W}val="hybridMultilevel"/>${lv}</${W}abstractNum>`
}

const STYLES_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles'
const STYLES_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml'

/** styles part 路径（无 rel 时按 Word 惯例合成 word/styles.xml，与旧 ensureStyle 同径） */
const stylesPath = (doc: DocxDocument): string => relOfType(doc.rels, 'styles')?.target ?? 'word/styles.xml'

/**
 * 内置样式全量写回（P8 / x22）——**单一来源**：saveDocx 与 ensureStyle 共走此路，
 * 旧 canonDef（硬编码 Title/Heading 观感，与注册表色值/字号分歧）整删，杜绝双分页/双颜色源。
 *
 * 查重读 styles part 的**文件既有** (styleId ∪ 归一化名字)，而非活动视图：活动视图被
 * postload 计算面注入了 `normal`/`NormalTable`（x21 B28/B29 锁的薄态合成 id），若按它查重，
 * 名字命中会把注册表富态 Normal/TableNormal 误判为「已在」→ 不落文件 → 重开不收敛。文件面
 * 才是重开时 missingDefaultStyles 查重的对象，自洽且跨多次保存幂等。
 *
 * 写回**字符串级插入**到根闭合前（自关闭根先展开为成对标签），既有字节零扰动——saveDocx
 * 每次保存都跑，重排整个 part 会扰动未触碰的 styles（违 P7 透传不变式）。写回条目同时
 * 登记进活动 StyleSheet（`add()` 只入 defs、不动 defaultPara 槽，postload 计算面默认仍在，
 * ensureStyle 的 canonical() 据此立即命中）。
 *
 * 幂等闭环：首存后文件全量 → 再存文件既有覆盖全部注册表 → 写回集空 → 直接返回；重开时
 * missingDefaultStyles 按同一归一化名字查重命中 4 缺省 → 注入集空 → 读写两侧收敛。
 * 无 part：合成最小根并补 rel/content-type（与旧 ensureStyle 同径）。
 */
async function writebackBuiltins(doc: DocxDocument): Promise<void> {
  const path = stylesPath(doc)
  const hasPart = doc.pkg.has(path)
  const xml = hasPart ? await doc.pkg.text(path) : ''
  const nodes = xml.trim() ? parseRaw(xml) : []
  const root = rootEl(nodes)
  const W = root ? prefixOf(root.q) || 'w:' : 'w:'
  const existing: ExistingStyle[] = []
  if (root) {
    for (const s of kidsOf(root, 'style')) {
      const id = getAttr(s, 'styleId', true)
      if (!id) continue
      const nm = kidOf(s, 'name')
      existing.push({ id, name: (nm ? getAttr(nm, 'val', true) : undefined) ?? id })
    }
  }
  const plan = planBuiltinWrite(existing)
  if (!plan.length) return
  const content = serializeBuiltinStyles(plan, W, doc.theme)
  // 登记进活动视图：与落文件同径（带 theme 解析 flat hex），使本会话内引用这些内置样式的
  // 段落即刻按富态渲染，且与重开后 StyleSheet 从文件重建的结果一致。
  for (const e of plan) doc.styles.add(parseStyle(serializeBuiltinStyle(e, W, doc.theme), W))
  if (!root) {
    // 无 part / 空根：合成完整根，并按需登记 rel + content-type
    const pfx = W.slice(0, -1) || 'w'
    doc.pkg.setPart(path, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<${pfx}:styles xmlns:${pfx}="${WML}">${content}</${pfx}:styles>`)
    if (!relOfType(doc.rels, 'styles')) {
      await doc.pkg.addRel(doc.mainPath, STYLES_REL, path)
      await doc.pkg.setContentType(path, STYLES_CT)
      doc.rels = await doc.pkg.rels(doc.mainPath)
    }
    return
  }
  const close = `</${root.q}>`
  const ci = xml.lastIndexOf(close)
  if (ci >= 0) {
    // 常规成对根：插到闭合标签前，前后字节原样保留
    doc.pkg.setPart(path, xml.slice(0, ci) + content + xml.slice(ci))
  } else {
    // 自关闭根 `<x:styles .../>` → `<x:styles ...>content</x:styles>`（属性串原样搬移）
    const q = root.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    doc.pkg.setPart(path, xml.replace(new RegExp(`<${q}\\b([^>]*?)/>`), (_m, a: string) => `<${root.q}${a}>${content}</${root.q}>`))
  }
}

/**
 * Id of a built-in paragraph style (Title, Heading 1…), added to styles.xml when the document
 * lacks it. 收敛后 = 全量写回的单条特例：跑一次 writebackBuiltins（文件既有缺啥补啥，含本
 * canonical 与其 basedOn/next/link 依赖），再从 canonical() 读回注册表 id（本地化文件亦正确）。
 */
export async function ensureStyle(doc: DocxDocument, kind: CanonStyle): Promise<{ id: string; styles: StyleInfo[] }> {
  const have = doc.styles.canonical()[kind]
  if (have || kind === 'normal') return { id: have ?? '', styles: doc.styles.quickStyles() }
  await writebackBuiltins(doc)
  const id = doc.styles.canonical()[kind] ?? ''
  if (id) doc.markEdited()
  return { id, styles: doc.styles.quickStyles() }
}

// ---------------------------------------------------------------- style look ("update style to match")

const STYLE_ORDER = [
  'name', 'aliases', 'basedOn', 'next', 'link', 'autoRedefine', 'hidden', 'uiPriority', 'semiHidden', 'unhideWhenUsed', 'qFormat', 'locked',
  'personal', 'personalCompose', 'personalReply', 'rsid', 'pPr', 'rPr', 'tblPr', 'trPr', 'tcPr', 'tblStylePr',
]
/** run properties of a look → the rPr elements holding them */
const RUN_ELS = { b: ['b', 'bCs'], i: ['i', 'iCs'], u: ['u'], strike: ['strike'], color: ['color'], sz: ['sz', 'szCs'], font: ['rFonts'] } as const
const LOOK_KEYS = ['b', 'i', 'u', 'strike', 'color', 'sz', 'font', 'align', 'line', 'before', 'after'] as const
type LookKey = (typeof LOOK_KEYS)[number]

/** a resolved style as a look: every property has a value (the font as the CSS stack it renders with) */
function resolvedLook({ rs, ps }: { rs: RunStyle; ps: ParaStyle }): StyleLook {
  return {
    b: !!rs.b, i: !!rs.i, u: rs.u ?? 'none', strike: !!rs.strike, color: rs.color ?? 'auto', sz: rs.sz ?? 10, font: rs.font ?? null,
    align: ps.align ?? 'left', line: ps.line ?? 1, lineRule: ps.lineRule === 'exact' || ps.lineRule === 'atLeast' ? ps.lineRule : undefined,
    before: ps.before ?? 0, after: ps.after ?? 0,
  }
}

/** what a style element says itself about the properties of a look; one it leaves to the style it is based on is absent */
function ownLook(s: XEl, theme: Theme): StyleLook {
  const out: StyleLook = {}
  const rPr = kid(s, 'rPr')
  const rs = readRPr(rPr, theme)
  if (kid(rPr, 'b')) out.b = !!rs.b
  if (kid(rPr, 'i')) out.i = !!rs.i
  if (kid(rPr, 'u')) out.u = rs.u ?? 'none'
  if (kid(rPr, 'strike')) out.strike = !!rs.strike
  if (kid(rPr, 'color')) out.color = rs.color ?? 'auto'
  if (rs.sz !== undefined) out.sz = rs.sz
  const rf = kid(rPr, 'rFonts')
  const font = rf && fontName(rf, theme)
  if (font) out.font = font
  const pPr = kid(s, 'pPr')
  const ps = readPPr(pPr).ps
  if (kid(pPr, 'jc')) out.align = ps.align
  if (ps.before !== undefined) out.before = ps.before
  if (ps.after !== undefined) out.after = ps.after
  if (ps.line !== undefined) {
    out.line = ps.line
    if (ps.lineRule === 'exact' || ps.lineRule === 'atLeast') out.lineRule = ps.lineRule
  }
  return out
}

/** a property of a look in the form two looks are compared in; `css`: its font already is a CSS stack */
function lookValue(k: LookKey, o: StyleLook, css = false): unknown {
  const v = o[k]
  if (v === undefined || v === null) return v
  if (k === 'font') return css ? v : cssFont(v as string)
  if (k === 'line') return `${o.lineRule ?? 'auto'} ${Math.round((v as number) * 100) / 100}`
  return typeof v === 'number' ? Math.round(v * 100) / 100 : v
}

/** `look` with only the values a look can hold (it may come from a collaborator) */
function checkedLook(look: StyleLook): StyleLook {
  const out: Record<string, unknown> = {}
  const ok: Record<LookKey, (v: unknown) => boolean> = {
    b: (v) => typeof v === 'boolean',
    i: (v) => typeof v === 'boolean',
    strike: (v) => typeof v === 'boolean',
    u: (v) => typeof v === 'string' && /^[A-Za-z]{1,24}$/.test(v),
    color: (v) => typeof v === 'string' && /^(#[0-9a-fA-F]{6}|auto)$/.test(v),
    sz: (v) => typeof v === 'number' && v >= 1 && v <= 1638,
    font: (v) => typeof v === 'string' && v.length > 0 && v.length <= 100,
    align: (v) => v === 'left' || v === 'center' || v === 'right' || v === 'justify',
    line: (v) => typeof v === 'number' && v > 0 && v <= 1584,
    before: (v) => typeof v === 'number' && v >= 0 && v <= 1584,
    after: (v) => typeof v === 'number' && v >= 0 && v <= 1584,
  }
  for (const k of LOOK_KEYS) if (look?.[k] === null || (look?.[k] !== undefined && ok[k](look[k]))) out[k] = look[k]
  if (out.line && (look?.lineRule === 'exact' || look?.lineRule === 'atLeast')) out.lineRule = look.lineRule
  return out as StyleLook
}

const WML = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const parseStyle = (xml: string, W: string) => parseXml(W ? xml.replace(`<${W}style`, `<${W}style xmlns:${W.slice(0, -1)}="${WML}"`) : xml)

/**
 * Gives paragraph style `id` a look, in the document's own styles part: every paragraph of that style, and of the
 * styles based on it, follows. The style only defines what differs from the style it is based on.
 */
export async function setStyleLook(doc: DocxDocument, id: string, asked: StyleLook): Promise<StyleSetResult> {
  const look = checkedLook(asked)
  const styles = doc.styles
  const rel = relOfType(doc.rels, 'styles')
  const x = styles.own(id)
  const nodes = rel && x && doc.pkg.has(rel.target) ? parseRaw(await doc.pkg.text(rel.target)) : []
  const root = rootEl(nodes)
  const node = kidsOf(root, 'style').find((n) => getAttr(n, 'styleId', true) === id)
  if (!rel || !x || !root || !node) return { styles: styles.quickStyles(), changed: [], undo: {}, missing: true }
  const W = prefixOf(root.q)
  // the definition the file came with: a property going back to the value it had there gets its elements back as
  // they were (theme fonts and colours stay tied to the theme)
  let orig = doc.styleOrig.get(id)
  if (!orig) doc.styleOrig.set(id, (orig = { x, raw: clone(node) }))
  const first = ownLook(orig.x, doc.theme)
  const mine = ownLook(x, doc.theme)
  const from = resolvedLook(styles.inherited(id))
  const rPr = clone(kidOf(node, 'rPr') ?? el(W + 'rPr'))
  const pPr = clone(kidOf(node, 'pPr') ?? el(W + 'pPr'))
  const undo: StyleLook = {}
  const set: RunSet = {}
  const back: (keyof typeof RUN_ELS)[] = []
  for (const k of LOOK_KEYS) {
    if (look[k] === undefined) continue
    const want = lookValue(k, look)
    // what the style it is based on gives anyway is not repeated in it
    const keep = want !== null && want !== lookValue(k, from, true)
    const had = lookValue(k, mine)
    if (keep ? had === want : had === undefined) continue
    ;(undo as Record<string, unknown>)[k] = mine[k] ?? null
    if (k === 'line' && mine.lineRule) undo.lineRule = mine.lineRule
    if (k === 'align') setOrdered(pPr, keep ? jcEl(W, look.align!) : undefined, 'jc', PPR_ORDER)
    else if (k === 'line' || k === 'before' || k === 'after') putSpacing(pPr, W, { [k]: keep ? look[k] : null }, look.lineRule ?? 'auto')
    else {
      ;(set as Record<string, unknown>)[k] = keep ? look[k] : null
      if (keep && lookValue(k, first) === want) back.push(k)
    }
  }
  if (!Object.keys(undo).length) return { styles: styles.quickStyles(), changed: [], undo }
  applyRunSet(rPr, set, W)
  const origRPr = kidOf(orig.raw, 'rPr')
  for (const k of back) for (const l of RUN_ELS[k]) setOrdered(rPr, kidOf(origRPr, l) && clone(kidOf(origRPr, l)!), l, RPR_ORDER)
  setOrdered(node, kidsOf(pPr).length ? pPr : undefined, 'pPr', STYLE_ORDER)
  setOrdered(node, kidsOf(rPr).length ? rPr : undefined, 'rPr', STYLE_ORDER)
  doc.pkg.setPart(rel.target, serialize(nodes))
  styles.add(parseStyle(serialize(node), W))
  doc.markEdited()
  return { styles: styles.quickStyles(), changed: styles.family(id), undo, headers: await doc.headers() }
}

/** Finds (or creates in numbering.xml) a list definition of the given kind. */
async function ensureList(doc: DocxDocument, kind: 'bullet' | 'number'): Promise<string> {
  const found = doc.numbering.findList(kind)
  if (found) return found
  const rel = relOfType(doc.rels, 'numbering')
  const path = rel?.target ?? 'word/numbering.xml'
  const xml = doc.pkg.has(path)
    ? await doc.pkg.text(path)
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:numbering>'
  const nodes = parseRaw(xml)
  const root = rootEl(nodes)!
  const W = prefixOf(root.q)
  const { abstract, num } = doc.numbering.ids()
  const absNode = parseRaw(abstractXml(W, abstract, kind))[0] as RNode
  const numNode = parseRaw(`<${W}num ${W}numId="${num}"><${W}abstractNumId ${W}val="${abstract}"/></${W}num>`)[0] as RNode
  const idxOf = (l: string, last: boolean) => {
    let at = -1
    root.c.forEach((c, i) => {
      if (isNode(c) && local(c.q) === l && (last || at < 0)) at = i
    })
    return at
  }
  const lastAbs = idxOf('abstractNum', true)
  const firstNum = idxOf('num', false)
  root.c.splice(lastAbs >= 0 ? lastAbs + 1 : firstNum >= 0 ? firstNum : root.c.length, 0, absNode)
  const lastNum = idxOf('num', true)
  const cleanup = idxOf('numIdMacAtCleanup', false)
  root.c.splice(lastNum >= 0 ? lastNum + 1 : cleanup >= 0 ? cleanup : root.c.length, 0, numNode)
  root.self = false
  const out = serialize(nodes)
  doc.pkg.setPart(path, out)
  if (!rel) {
    await doc.pkg.addRel(doc.mainPath, NUMBERING_REL, path)
    await doc.pkg.setContentType(path, NUMBERING_CT)
    doc.rels = await doc.pkg.rels(doc.mainPath)
  }
  doc.numbering = new Numbering(parseXml(out), doc.theme)
  return String(num)
}

async function applyParaDirty(doc: DocxDocument, pPr: RNode, pd: ParaDirty, W: string) {
  const val = W + 'val'
  const put = (l: string, node: RNode | undefined) => setOrdered(pPr, node, l, PPR_ORDER)
  if (pd.style !== undefined) put('pStyle', pd.style && pd.style !== doc.styles.defaultPara ? el(W + 'pStyle', { [val]: pd.style }) : undefined)
  if (pd.align !== undefined) put('jc', pd.align ? jcEl(W, pd.align) : undefined)
  putSpacing(pPr, W, pd)
  if (pd.pageBreak !== undefined) put('pageBreakBefore', pd.pageBreak ? el(W + 'pageBreakBefore') : undefined)
  if (pd.indL !== undefined) {
    if (pd.indL === null) {
      // the paragraph stops setting the left indent itself; the style's indent takes over again
      const ind = kidOf(pPr, 'ind')
      if (ind) {
        setAttr(ind, W + 'left', undefined)
        setAttr(ind, W + 'start', undefined)
        if (!ind.a.trim()) put('ind', undefined)
      }
    } else {
      const ind = clone(kidOf(pPr, 'ind') ?? el(W + 'ind'))
      setAttr(ind, W + 'start', undefined)
      setAttr(ind, W + 'left', String(Math.max(0, Math.round(pd.indL * 20))))
      put('ind', ind)
    }
  }
  const styleNum = doc.styles.para(readStyle(pPr)).numPr
  const numPr = (numId: string, ilvl: number) =>
    el(W + 'numPr', {}, [el(W + 'ilvl', { [val]: String(ilvl) }), el(W + 'numId', { [val]: numId })])
  if (pd.list === 'none') put('numPr', styleNum ? numPr('0', 0) : undefined)
  else if (pd.list) put('numPr', numPr(await ensureList(doc, pd.list), pd.ilvl ?? 0))
  else if (pd.ilvl !== undefined) {
    const cur = kidOf(pPr, 'numPr')
    const numId = (cur && attrOf(kidOf(cur, 'numId'), val)) ?? styleNum?.numId
    if (numId && numId !== '0') put('numPr', numPr(numId, pd.ilvl))
  }
}

function attrOf(n: RNode | undefined, q: string): string | undefined {
  if (!n) return undefined
  const m = new RegExp(`(?:^|\\s)${q.replace(':', '\\:')}="([^"]*)"`).exec(n.a)
  return m?.[1]
}

function readStyle(pPr: RNode): string | undefined {
  const ps = kidOf(pPr, 'pStyle')
  return ps ? /="([^"]*)"/.exec(ps.a)?.[1] : undefined
}

/** the source paragraph's own properties, without the revision it may hold (the template for a w:pPrChange snapshot) */
function basePPr(src: RNode | undefined, W: string): RNode | undefined {
  const p = kidOf(src, 'pPr')
  if (!p) return undefined
  const c = clone(p)
  c.q = W + 'pPr'
  removeKids(c, 'pPrChange')
  return c
}

/** deleted text: w:delText instead of w:t */
function delTextXml(text: string, W: string): string {
  return textContentXml(text, W)
    .replace(new RegExp(`<${W}t([ >])`, 'g'), `<${W}delText$1`)
    .replace(new RegExp(`</${W}t>`, 'g'), `</${W}delText>`)
}

/** a run wrapped in its tracked change (fresh ids: a change split by editing must not repeat one) */
function trackXml(doc: DocxDocument, W: string, tc: TrackMark, run: string): string {
  const tag = tc.k
  const id = doc.nextTrackId++
  const attrs = ` ${W}id="${id}"` + (tc.author ? ` ${W}author="${escText(tc.author).replace(/"/g, '&quot;')}"` : '') + (tc.date ? ` ${W}date="${escText(tc.date)}"` : '') + (tc.name ? ` ${W}name="${escText(tc.name).replace(/"/g, '&quot;')}"` : '')
  const wrapped = `<${W}${tag}${attrs}>${run}</${W}${tag}>`
  // move ranges: Word pairs the two halves by w:name; the optional range start / end mark the moved span
  if (tc.k === 'moveFrom' || tc.k === 'moveTo') {
    const range = `${tag}Range`
    return `<${W}${range}Start${attrs}/>${wrapped}<${W}${range}End ${W}id="${id}"/>`
  }
  return wrapped
}

export async function genParagraph(doc: DocxDocument, spec: ParaSpec): Promise<{ xml: string; map: GenRun[] }> {
  const tpl = origPara(doc, spec.from)
  const pq = tpl?.q ?? 'w:p'
  const W = prefixOf(pq) || 'w:'
  const pPr = clone(kidOf(tpl, 'pPr') ?? el(W + 'pPr'))
  if (spec.pd) await applyParaDirty(doc, pPr, spec.pd, W)
  const keepSect = spec.keepSect ?? spec.pid === spec.from
  if (!keepSect) removeKids(pPr, 'sectPr')
  // paragraph-level format revision: the old pPr is the last child of w:pPr (OOXML order)
  if (spec.pc) {
    const oldPPr = basePPr(tpl, W) ?? el(W + 'pPr')
    oldPPr.q = W + 'pPr'
    removeKids(oldPPr, (l) => l === 'sectPr' || l === 'rPr')
    if (spec.pc.old.d && Object.keys(spec.pc.old.d).length) await applyParaDirty(doc, oldPPr, spec.pc.old.d, W)
    const attrs: Record<string, string> = { [W + 'id']: String(doc.nextTrackId++) }
    if (spec.pc.author) attrs[W + 'author'] = spec.pc.author
    if (spec.pc.date) attrs[W + 'date'] = spec.pc.date
    setOrdered(pPr, el(W + 'pPrChange', attrs, [oldPPr]), 'pPrChange', PPR_ORDER)
  }
  const markRPr = kidOf(pPr, 'rPr')

  const map: GenRun[] = []
  let body = ''
  let openLink: string | undefined
  const closeLink = () => {
    if (openLink !== undefined) body += `</${W}hyperlink>`
    openLink = undefined
  }
  const runXml = (rPr: RNode | undefined, content: string) => `<${W}r>${rPr && rPr.c.length ? serialize(rPr) : ''}${content}</${W}r>`
  const baseRPr = (src: SrcRef | undefined) => {
    const sr = origRun(doc, src)
    const r = kidOf(sr, 'rPr') ?? markRPr
    if (!r) return undefined
    const c = clone(r)
    c.q = W + 'rPr'
    removeKids(c, (l) => l === 'rPrChange' || l === 'ins' || l === 'del' || l === 'moveFrom' || l === 'moveTo')
    return c
  }

  // comment ranges: each thread's part of its range starts before the first run it covers here and ends after the last
  const firstAt = new Map<string, SpecRun>()
  const lastAt = new Map<string, SpecRun>()
  for (const part of spec.parts)
    for (const run of part as SpecRun[]) {
      if (!run.cm || !('obj' in run || run.text)) continue
      for (const id of run.cm) {
        if (!firstAt.has(id)) firstAt.set(id, run)
        lastAt.set(id, run)
      }
    }
  const openMarks = (run: SpecRun) => {
    for (const id of run.cm ?? []) if (firstAt.get(id) === run) body += markStart(W, id)
  }
  const closeMarks = (run: SpecRun) => {
    for (const id of run.cm ?? []) {
      if (lastAt.get(id) !== run) continue
      closeLink()
      body += markEnd(W, id)
      map.push({})
    }
  }

  spec.parts.forEach((part, pi) => {
    if (pi > 0) {
      closeLink()
      body += `<${W}r><${W}br ${W}type="page"/></${W}r>`
      map.push({})
    }
    for (const run of part as SpecRun[]) {
      if ('obj' in run) {
        closeLink()
        openMarks(run)
        if (run.obj === 'field') {
          let rPr = baseRPr(undefined)
          if (run.set) applyRunSet((rPr ??= el(W + 'rPr')), run.set, W)
          body += `<${W}fldSimple ${W}instr=" ${run.kind} ">${runXml(rPr, `<${W}t>1</${W}t>`)}</${W}fldSimple>`
          map.push({ d: run.set })
        } else if (run.obj === 'image') {
          body += imageRunXml(W, run.rid, run.w, run.h, run.name, run.alt, run.wrap, run.rot, run.crop)
          map.push({ cm: run.cm })
        } else {
          const src = origRun(doc, run.src)
          if (src) {
            const rotSet = run.rot !== undefined
            const cropSet = run.crop !== undefined
            if (run.size || run.alt !== undefined || run.rid || run.wrap !== undefined || rotSet || cropSet) {
              const r = clone(src)
              const cx = run.size && String(Math.round(run.size[0] * 12700))
              const cy = run.size && String(Math.round(run.size[1] * 12700))
              walkOoxml(r, (n) => {
                const l = local(n.q)
                if (cx && cy && (l === 'extent' || (l === 'ext' && /\scx=/.test(n.a)))) {
                  setAttr(n, 'cx', cx)
                  setAttr(n, 'cy', cy)
                }
                if (run.alt !== undefined && (l === 'docPr' || (l === 'cNvPr' && /\sid=/.test(n.a)))) setAttr(n, 'descr', run.alt || undefined)
                if (run.rid && l === 'blip') {
                  const m = /([\w.-]+):embed="/.exec(n.a)
                  setAttr(n, m ? `${m[1]}:embed` : 'r:embed', run.rid)
                }
              })
              // rotation: a:xfrm/@rot = deg * 60000 (existing picture's spPr is preserved)
              if (rotSet) setXfrmRot(r, run.rot!)
              // crop: a:srcRect in pic:blipFill (null: no crop any more)
              if (cropSet) setSrcRect(r, run.crop ?? null)
              // wrap change: inline -> wp:anchor (or anchor -> inline), after the geometry patches
              if (run.wrap !== undefined) setRunWrap(r, run.wrap)
              body += run.tc ? trackXml(doc, W, run.tc, serialize(r)) : serialize(r)
            } else body += run.tc ? trackXml(doc, W, run.tc, serialize(src)) : serialize(src)
            map.push({ src: run.src, cm: run.cm })
          }
        }
        closeMarks(run)
        continue
      }
      if (run.lk !== openLink) {
        closeLink()
        if (run.lk) {
          const attr = run.lk.startsWith('r:') ? `r:id="${run.lk.slice(2)}"` : `${W}anchor="${escText(run.lk.slice(2))}"`
          body += `<${W}hyperlink ${attr}>`
          openLink = run.lk
        }
      }
      let rPr = baseRPr(run.src)
      if (run.set && Object.keys(run.set).length) applyRunSet((rPr ??= el(W + 'rPr')), run.set, W)
      if (!run.text) continue
      // run-level format revision: old look = base rPr brought back with fc.d, nested in the last child of rPr
      if (run.fc) {
        rPr ??= el(W + 'rPr')
        rPr.q = W + 'rPr'
        const oldRPr = baseRPr(run.src) ?? el(W + 'rPr')
        oldRPr.q = W + 'rPr'
        if (run.fc.d && Object.keys(run.fc.d).length) applyRunSet(oldRPr, run.fc.d, W)
        const attrs: Record<string, string> = { [W + 'id']: String(doc.nextTrackId++) }
        if (run.fc.author) attrs[W + 'author'] = run.fc.author
        if (run.fc.date) attrs[W + 'date'] = run.fc.date
        setOrdered(rPr, el(W + 'rPrChange', attrs, [oldRPr]), 'rPrChange', RPR_ORDER)
      }
      openMarks(run)
      const deleted = run.tc?.k === 'del' || run.tc?.k === 'moveFrom'
      body += run.tc ? trackXml(doc, W, run.tc, runXml(rPr, deleted ? delTextXml(run.text, W) : textContentXml(run.text, W))) : runXml(rPr, textContentXml(run.text, W))
      map.push({ src: run.src, d: run.set, cm: run.cm })
      closeMarks(run)
    }
  })
  closeLink()

  // bookmarks (and other ranges) of the source paragraphs; comment ranges come from the runs' marks
  let starts = ''
  let ends = ''
  const orig = spec.orig ?? (spec.pid === spec.from ? [spec.from] : [])
  for (const pid of orig) {
    const op = origPara(doc, pid)
    if (!op) continue
    for (const c of kidsOf(op)) {
      const l = local(c.q)
      if (l === 'commentRangeStart' || l === 'commentRangeEnd') continue
      if (START_MARKS.has(l)) starts += serialize(c)
      else if (END_MARKS.has(l)) ends += serialize(c)
    }
  }

  let attrs = tpl?.a ?? ''
  if (spec.pid !== spec.from) attrs = attrs.replace(/\s+w14:(paraId|textId)="[^"]*"/g, '')
  const ppr = pPr.c.length ? serialize(pPr) : ''
  return { xml: `<${pq}${attrs}>${ppr}${starts}${body}${ends}</${pq}>`, map }
}

/** the XML a paragraph is written as: its source untouched when nothing changed, else generated */
async function paraXml(doc: DocxDocument, spec: ParaSpec): Promise<{ xml: string; map: GenRun[] }> {
  const orig = spec.pristine && spec.pid === spec.from ? origPara(doc, spec.pid) : undefined
  if (!orig) return genParagraph(doc, spec)
  return { xml: serialize(orig), map: collectRunsRaw(orig).map((_, k) => ({ src: [spec.pid, k] as SrcRef })) }
}

/**
 * The blocks each paragraph converts to with the styles as they are now (after a style changed), in the order
 * given. The document stays as it is, but for the look of list markers, which follows the paragraphs'.
 * `bare`: as the paragraphs look outside their table (nothing taken from a table style).
 */
export async function convertParas(doc: DocxDocument, specs: ParaSpec[], bare = false): Promise<Block[][]> {
  if (!doc.ready) throw new Error('Document is still loading')
  const out: Block[][] = []
  for (const spec of specs) {
    const { xml, map } = await paraXml(doc, spec)
    const blocks = doc.reconvert(spec.pid, xml, map, bare ? undefined : doc.info.get(spec.from)?.layer).blocks
    const paras = blocks.filter((b): b is Paragraph => b.t === 'p')
    // numbering is the document's: the marker keeps its text, and takes the look the paragraph gives it now
    const look = paras[0]?.marker?.s
    for (const p of paras) {
      delete p.marker
      delete p.lst
    }
    const inf = doc.info.get(spec.pid)
    if (inf?.marker && paras[0]) {
      // (a paragraph tried with another style, or outside its table, is not the document's)
      if (look && !bare && paras[0].sid === inf.sid) {
        const { u: _u, hl: _hl, ...s } = look
        inf.marker = { ...inf.marker, s }
      }
      paras[0].marker = inf.marker
      paras[0].lst = inf.lst
    }
    out.push(blocks)
  }
  return out
}

// ---------------------------------------------------------------- edit operations

function groupFor(doc: DocxDocument, key: string): number[] {
  let g = doc.groups.get(key)
  if (!g) {
    const p = doc.ordPid.get(key)
    g = p !== undefined ? [p] : []
    doc.groups.set(key, g)
  }
  return g
}

function detach(doc: DocxDocument, pid: number) {
  const inf = doc.info.get(pid)
  if (!inf) return
  const g = groupFor(doc, `${inf.item}:${inf.ord}`)
  const i = g.indexOf(pid)
  if (i >= 0) g.splice(i, 1)
}

export async function applyEdit(doc: DocxDocument, op: EditOp): Promise<EditResult> {
  if (!doc.ready) throw new Error('Document is still loading')
  const anchor = doc.info.get(op.anchor)
  if (!anchor) throw new Error(`Unknown paragraph ${op.anchor}`)
  doc.markEdited()
  // list numbering only needs recomputing when list paragraphs or paragraph properties are involved
  const involved = [op.anchor, ...op.list.map((x) => x.pid), ...(op.remove ?? [])]
  const listy = op.list.some((x) => x.pd) || involved.some((pid) => doc.info.get(pid)?.num)
  const item = anchor.item
  const ord = anchor.ord
  const listPids = op.list.map((s) => s.pid)
  for (const pid of [...listPids, ...(op.remove ?? [])]) if (pid !== op.anchor) detach(doc, pid)
  const group = groupFor(doc, `${item}:${ord}`)
  const idx = group.indexOf(op.anchor)
  if (idx >= 0) {
    // nothing takes its place: remember where it stood
    if (!listPids.length) doc.gone.set(op.anchor, group[idx - 1])
    group.splice(idx, 1, ...listPids)
  } else {
    // removed on its own, it comes back the same way (collaboration reverting that removal: tables around it, no
    // paragraph to place it by): to where it stood
    if (!doc.gone.has(op.anchor) || !listPids.includes(op.anchor)) throw new Error(`Paragraph ${op.anchor} is not in the document`)
    const after = doc.gone.get(op.anchor)
    doc.gone.delete(op.anchor)
    group.splice(after === undefined ? 0 : group.indexOf(after) + 1, 0, ...listPids)
  }
  for (const pid of [op.anchor, ...(op.remove ?? [])]) if (!listPids.includes(pid)) doc.genXml.delete(pid)

  const blocks: Record<number, Block[]> = {}
  for (const spec of op.list) {
    const tplInfo = doc.info.get(spec.from) ?? anchor
    const prev = doc.info.get(spec.pid)
    const { xml, map } = await paraXml(doc, spec)
    doc.genXml.set(spec.pid, xml)
    const { blocks: bl, rec } = doc.reconvert(spec.pid, xml, map, tplInfo.layer, prev?.marker)
    doc.info.set(spec.pid, { ...rec, item, ord, marker: prev?.marker, lst: prev?.lst })
    if (op.want) blocks[spec.pid] = bl
  }
  const listy2 = listy || op.list.some((x) => doc.info.get(x.pid)?.num)
  const changed = listy2 ? doc.recomputeMarkers() : new Map()
  const markers: EditResult['markers'] = {}
  for (const [pid, inf] of changed) markers[pid] = inf.marker ? { ...inf.marker, lst: inf.lst } : null
  // returned blocks carry the final markers
  for (const [pid, bl] of Object.entries(blocks)) {
    const inf = doc.info.get(Number(pid))
    bl.filter((b): b is Paragraph => b.t === 'p').forEach((p, i) => {
      delete p.marker
      delete p.lst
      if (i === 0 && inf?.marker) {
        p.marker = inf.marker
        p.lst = inf.lst
      }
    })
  }
  return { blocks, markers }
}

/** CT_Anchor child order — position / wrap nodes must sit between extent and docPr. */
const ANCHOR_ORDER = ['simplePos', 'positionH', 'positionV', 'extent', 'effectExtent', 'wrapSquare', 'wrapTight', 'wrapTopAndBottom', 'wrapThrough', 'wrapNone', 'docPr', 'cNvGraphicFramePr', 'graphic', 'relativeWidth', 'relativeHeight']
const WRAP_KIDS = ['simplePos', 'positionH', 'positionV', 'wrapSquare', 'wrapTight', 'wrapTopAndBottom', 'wrapThrough', 'wrapNone', 'relativeWidth', 'relativeHeight']

const emu = (pt?: number) => String(Math.round((pt ?? 0) * 12700))

/** one wp:wrap* element for the given kind */
function wrapNode(pfx: string, kind: WrapSpec['kind']): RNode {
  if (kind === 'square') return el(pfx + 'wrapSquare', { wrapText: 'bothSides' })
  if (kind === 'tight')
    return el(pfx + 'wrapTight', { wrapText: 'bothSides' }, [
      el(pfx + 'wrapPolygon', { edited: '0' }, [
        el(pfx + 'start', { x: '0', y: '0' }),
        el(pfx + 'lineTo', { x: '0', y: '21600' }),
        el(pfx + 'lineTo', { x: '21600', y: '21600' }),
        el(pfx + 'lineTo', { x: '21600', y: '0' }),
        el(pfx + 'lineTo', { x: '0', y: '0' }),
      ]),
    ])
  return el(pfx + 'wrapNone', {})
}

/** one wp:positionH / wp:positionV (align or absolute posOffset) */
function posNode(pfx: string, axis: 'H' | 'V', pos: WrapSpec['pos']): RNode {
  const rel = axis === 'H' ? pos.hRel : pos.vRel
  const align = axis === 'H' ? pos.hAlign : pos.vAlign
  const off = axis === 'H' ? pos.hOff : pos.vOff
  const child = align ? el(pfx + 'align', {}, [align]) : el(pfx + 'posOffset', {}, [emu(off)])
  return el(pfx + 'position' + axis, { relativeFrom: rel }, [child])
}

/**
 * Turns a drawing's wp:inline into a real wp:anchor (or back), writing position,
 * wrap and distance. `wrap === null` restores an inline picture. Mutates the cloned run.
 */
function setRunWrap(r: RNode, wrap: WrapSpec | null): void {
  let box: RNode | undefined
  walkOoxml(r, (n) => {
    if (local(n.q) === 'inline' || local(n.q) === 'anchor') {
      box = n
      return true
    }
  })
  if (!box) return
  const b: RNode = box
  const pfx = prefixOf(b.q) || 'wp:'
  removeKids(b, (l) => WRAP_KIDS.includes(l))
  if (!wrap) {
    b.q = pfx + 'inline'
    for (const k of ['simplePos', 'relativeHeight', 'behindDoc', 'locked', 'layoutInCell', 'allowOverlap']) setAttr(b, k, undefined)
    return
  }
  b.q = pfx + 'anchor'
  setAttr(b, 'distT', emu(wrap.distT))
  setAttr(b, 'distB', emu(wrap.distB))
  setAttr(b, 'distL', emu(wrap.distL))
  setAttr(b, 'distR', emu(wrap.distR))
  setAttr(b, 'simplePos', '0')
  setAttr(b, 'relativeHeight', '251658240')
  setAttr(b, 'behindDoc', wrap.kind === 'behindDoc' ? '1' : '0')
  setAttr(b, 'locked', '0')
  setAttr(b, 'layoutInCell', '1')
  setAttr(b, 'allowOverlap', '1')
  setOrdered(b, el(pfx + 'simplePos', { x: '0', y: '0' }), 'simplePos', ANCHOR_ORDER)
  setOrdered(b, posNode(pfx, 'H', wrap.pos), 'positionH', ANCHOR_ORDER)
  setOrdered(b, posNode(pfx, 'V', wrap.pos), 'positionV', ANCHOR_ORDER)
  setOrdered(b, wrapNode(pfx, wrap.kind), wrap.kind === 'square' ? 'wrapSquare' : wrap.kind === 'tight' ? 'wrapTight' : 'wrapNone', ANCHOR_ORDER)
}

let drawingId = 7000

/** Sets a picture's rotation (a:xfrm/@rot, in 1/60000 of a degree) on a cloned run. Mutates the run. */
function setXfrmRot(r: RNode, deg: number): void {
  walkOoxml(r, (n) => {
    if (local(n.q) === 'xfrm' && prefixOf(n.q) === 'a:') {
      setAttr(n, 'rot', String(Math.round(deg * 60000)))
      return true
    }
  })
}

/** children of pic:blipFill in schema order (srcRect sits between the blip and the fill mode) */
const BLIPFILL_ORDER = ['blip', 'srcRect', 'tile', 'stretch']

/**
 * Sets the picture's crop (a:srcRect in pic:blipFill) on a cloned run; `null` removes it.
 * The model keeps per-mille sides, the attribute is 1/1000 of a percent (10% = "10000"). Mutates the run.
 */
function setSrcRect(r: RNode, crop: Crop | null): void {
  let fill: RNode | undefined
  walkOoxml(r, (n) => {
    if (local(n.q) === 'blipFill' && prefixOf(n.q) === 'pic:') {
      fill = n
      return true
    }
  })
  if (!fill) return
  if (!crop) {
    removeKids(fill, 'srcRect')
    return
  }
  const pct = (v: number | undefined) => (v !== undefined && v > 0 ? String(Math.round(v * 100)) : undefined)
  const node = el('a:srcRect', { 'a:l': pct(crop.l), 'a:t': pct(crop.t), 'a:r': pct(crop.r), 'a:b': pct(crop.b) })
  setOrdered(fill, node, 'srcRect', BLIPFILL_ORDER)
}

function imageRunXml(W: string, rid: string, w: number, h: number, name = 'Picture', alt?: string, wrap?: WrapSpec | null, rot?: number, crop?: Crop): string {
  const cx = Math.round(w * 12700)
  const cy = Math.round(h * 12700)
  const id = ++drawingId
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
  const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture'
  const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
  const n = escText(name)
  const descr = alt ? ` descr="${escText(alt).replace(/"/g, '&quot;')}"` : ''
  // a:xfrm/@rot is in 1/60000 of a degree
  const rotAttr = rot !== undefined ? ` rot="${Math.round(rot * 60000)}"` : ''
  // a:srcRect sides are 1/1000 of a percent (the model keeps per-mille)
  const srcRect = crop && (crop.l || crop.t || crop.r || crop.b)
    ? `<a:srcRect${crop.l ? ` l="${Math.round(crop.l * 100)}"` : ''}${crop.t ? ` t="${Math.round(crop.t * 100)}"` : ''}${crop.r ? ` r="${Math.round(crop.r * 100)}"` : ''}${crop.b ? ` b="${Math.round(crop.b * 100)}"` : ''}/>`
    : ''
  const xml =
    `<${W}r><${W}drawing><wp:inline xmlns:wp="${WP}" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${n} ${id}"${descr}/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${A}" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="${A}"><a:graphicData uri="${PIC}"><pic:pic xmlns:pic="${PIC}"><pic:nvPicPr><pic:cNvPr id="${id}" name="${n}"${descr}/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/>${srcRect}<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm${rotAttr}><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></${W}drawing></${W}r>`
  if (!wrap) return xml
  // wrap: convert the generated inline into a real wp:anchor (same construction as an edited picture)
  const nodes = parseRaw(xml)
  const run = rootEl(nodes)
  if (run) setRunWrap(run, wrap)
  return serialize(nodes)
}

const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
const HYPERLINK_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink'
const IMG_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' }

/** Adds an image part to the document; returns its relationship id and part path. */
export async function addImage(doc: DocxDocument, bytes: Uint8Array, ext: string): Promise<{ rid: string; path: string }> {
  ext = ext.toLowerCase().replace('jpeg', 'jpg')
  if (!IMG_TYPES[ext]) throw new Error(`Unsupported image type .${ext}`)
  const path = doc.pkg.freeName('word/media', 'image', ext)
  doc.pkg.setPart(path, bytes)
  await doc.pkg.ensureDefaultType(ext, IMG_TYPES[ext])
  const rid = await doc.pkg.addRel(doc.mainPath, IMAGE_REL, path)
  doc.rels = await doc.pkg.rels(doc.mainPath)
  doc.markEdited()
  return { rid, path }
}

/** External hyperlink relationship; returns the run link key ('r:rIdN'). */
export async function addLink(doc: DocxDocument, url: string): Promise<string> {
  const rid = await doc.pkg.addRel(doc.mainPath, HYPERLINK_REL, url, true)
  doc.rels = await doc.pkg.rels(doc.mainPath)
  return 'r:' + rid
}

// ---------------------------------------------------------------- tables

const CSS_TO_LINE: Record<string, string> = { solid: 'single', dashed: 'dashed', dotted: 'dotted', double: 'double' }

/** a border element from a CSS line ('0.5pt solid #000000', 'none') */
export function borderXml(W: string, side: string, css: string): string {
  const m = /^([\d.]+)pt\s+(\w+)\s+(#[0-9a-fA-F]{6}|\w+)/.exec(css.trim())
  if (!m || css.trim() === 'none') return `<${W}${side} ${W}val="nil"/>`
  const sz = Math.max(2, Math.min(96, Math.round(Number(m[1]) * 8)))
  const color = m[3].startsWith('#') ? m[3].slice(1).toUpperCase() : 'auto'
  return `<${W}${side} ${W}val="${CSS_TO_LINE[m[2]] ?? 'single'}" ${W}sz="${sz}" ${W}space="0" ${W}color="${color}"/>`
}

const TCPR_ORDER = ['cnfStyle', 'tcW', 'gridSpan', 'hMerge', 'vMerge', 'tcBorders', 'shd', 'noWrap', 'tcMar', 'textDirection', 'tcFitText', 'vAlign', 'hideMark']
/** CT_TrPr 子元素规范顺序（trHeight 落位用） */
const TRPR_ORDER = ['cnfStyle', 'divId', 'gridBefore', 'gridAfter', 'wBefore', 'wAfter', 'cantSplit', 'trHeight', 'tblHeader', 'tblCellSpacing', 'jc', 'hidden']

function rawRows(tbl: RNode): RNode[] {
  const out: RNode[] = []
  const rec = (n: RNode) => {
    for (const c of kidsOf(n)) {
      const l = local(c.q)
      if (l === 'tr') out.push(c)
      else if (l === 'sdt' || l === 'sdtContent' || l === 'customXml') rec(c)
    }
  }
  rec(tbl)
  return out
}

function rawCells(tr: RNode): RNode[] {
  const out: RNode[] = []
  const rec = (n: RNode) => {
    for (const c of kidsOf(n)) {
      const l = local(c.q)
      if (l === 'tc') out.push(c)
      else if (l === 'sdt' || l === 'sdtContent' || l === 'customXml') rec(c)
    }
  }
  rec(tr)
  return out
}

/** Regenerates a whole table from the editor model, reusing original row/cell properties. */
export async function genTable(doc: DocxDocument, spec: TableSpec): Promise<string> {
  let orig: RNode | undefined
  if (spec.item !== undefined) {
    const nodes = parseRaw(doc.items[spec.item] ?? '')
    const top = rootEl(nodes)
    if (top) {
      if (local(top.q) === 'tbl') orig = top
      else walkOoxml(top, (n) => {
        if (!orig && local(n.q) === 'tbl') orig = n
        return !!orig
      })
    }
  }
  const W = orig ? prefixOf(orig.q) || 'w:' : 'w:'
  const val = W + 'val'
  const rows = orig ? rawRows(orig) : []
  let tblPr = orig ? kidOf(orig, 'tblPr') : undefined
  if (!tblPr) {
    const style = doc.styles.has('TableGrid') ? `<${W}tblStyle ${val}="TableGrid"/>` : ''
    const borders = style
      ? ''
      : `<${W}tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<${W}${b} ${val}="single" ${W}sz="4" ${W}space="0" ${W}color="auto"/>`).join('')}</${W}tblBorders>`
    tblPr = parseRaw(`<${W}tblPr>${style}<${W}tblW ${W}w="0" ${W}type="auto"/>${borders}<${W}tblLook ${val}="04A0" ${W}firstRow="1" ${W}lastRow="0" ${W}firstColumn="1" ${W}lastColumn="0" ${W}noHBand="0" ${W}noVBand="1"/></${W}tblPr>`)[0] as RNode
  }
  const grid = `<${W}tblGrid>${spec.cols.map((w) => `<${W}gridCol ${W}w="${Math.round(w * 20)}"/>`).join('')}</${W}tblGrid>`
  const firstTcPr = rows.length ? kidOf(rawCells(rows[0])[0], 'tcPr') : undefined
  const nCols = spec.cols.length
  const cont: ({ left: number; span: number; src?: [number, number]; cell?: CellSpec } | undefined)[] = []
  let out = `<${W}tbl${orig?.a ?? ''}>${serialize(tblPr)}${grid}`
  const tcPrFor = (src: [number, number] | undefined, g: number, span: number, vm?: 'restart' | 'continue', shd?: string, cell?: CellSpec) => {
    const tpl = src ? kidOf(rawCells(rows[src[0]] ?? ({ c: [] } as unknown as RNode))[src[1]], 'tcPr') : undefined
    const pr = clone(tpl ?? firstTcPr ?? el(W + 'tcPr'))
    pr.q = W + 'tcPr'
    removeKids(pr, (l) => l === 'gridSpan' || l === 'vMerge' || l === 'hMerge')
    const w = spec.cols.slice(g, g + span).reduce((a, b) => a + b, 0)
    setOrdered(pr, el(W + 'tcW', { [W + 'w']: String(Math.round(w * 20)), [W + 'type']: 'dxa' }), 'tcW', TCPR_ORDER)
    if (span > 1) setOrdered(pr, el(W + 'gridSpan', { [val]: String(span) }), 'gridSpan', TCPR_ORDER)
    if (vm) setOrdered(pr, el(W + 'vMerge', vm === 'restart' ? { [val]: 'restart' } : {}), 'vMerge', TCPR_ORDER)
    if (shd !== undefined) setOrdered(pr, shd ? el(W + 'shd', { [val]: 'clear', [W + 'color']: 'auto', [W + 'fill']: shd === 'none' ? 'auto' : shd.replace('#', '').toUpperCase() }) : undefined, 'shd', TCPR_ORDER)
    if (cell?.borders) {
      const lines = (['t', 'l', 'b', 'r'] as const).map((k) => [{ t: 'top', l: 'left', b: 'bottom', r: 'right' }[k], cell.borders![k]] as const)
      const xml = lines.filter(([, css]) => css !== undefined).map(([side, css]) => borderXml(W, side, css!)).join('')
      setOrdered(pr, xml ? (parseRaw(`<${W}tcBorders>${xml}</${W}tcBorders>`)[0] as RNode) : undefined, 'tcBorders', TCPR_ORDER)
    }
    if (cell?.vAlign) setOrdered(pr, el(W + 'vAlign', { [val]: cell.vAlign === 'middle' ? 'center' : cell.vAlign }), 'vAlign', TCPR_ORDER)
    return serialize(pr)
  }
  for (const row of spec.rows) {
    const trSrc = row.src !== undefined ? rows[row.src] : undefined
    let trPr = kidOf(trSrc, 'trPr')
    // 拖行边界改行高：覆盖/注入 trHeight（h 为 pt，trHeight 用 twips；未给 h 的行保留原 trPr）
    if (row.h !== undefined) {
      const pr = trPr ? clone(trPr) : el(W + 'trPr')
      setOrdered(pr, el(W + 'trHeight', { [W + 'val']: String(Math.round(row.h * 20)), ...(row.exact ? { [W + 'hRule']: 'exact' } : { [W + 'hRule']: 'atLeast' }) }), 'trHeight', TRPR_ORDER)
      trPr = pr
    }
    // 表头行跨页重复：模型标了 header 但原 trPr 没有时注入 w:tblHeader（有则原样复用）
    if (row.header && !kidOf(trPr, 'tblHeader')) {
      const pr = trPr ? clone(trPr) : el(W + 'trPr')
      setOrdered(pr, el(W + 'tblHeader', {}), 'tblHeader', TRPR_ORDER)
      trPr = pr
    }
    out += `<${W}tr${trSrc?.a ?? ''}>${trPr ? serialize(trPr) : ''}`
    let g = 0
    let k = 0
    const cells: CellSpec[] = row.cells
    while (g < nCols && (k < cells.length || cont[g])) {
      const c = cont[g]
      if (c && c.left > 0) {
        // the merged cell's properties (Word draws its sides and bottom from the continuation cells)
        out += `<${W}tc>${tcPrFor(c.src, g, c.span, 'continue', c.cell?.shd, c.cell)}<${W}p/></${W}tc>`
        c.left--
        if (!c.left) cont[g] = undefined
        g += c.span
        continue
      }
      const cell = cells[k++]
      if (!cell) break
      const span = Math.max(1, Math.min(cell.colSpan, nCols - g))
      let paras = ''
      for (const p of cell.paras) {
        const orig = p.pristine && p.pid === p.from ? origPara(doc, p.pid) : undefined
        paras += orig ? serialize(orig) : (await genParagraph(doc, p)).xml
      }
      out += `<${W}tc>${tcPrFor(cell.src, g, span, cell.rowSpan > 1 ? 'restart' : undefined, cell.shd, cell)}${paras || `<${W}p/>`}</${W}tc>`
      if (cell.rowSpan > 1) cont[g] = { left: cell.rowSpan - 1, span, src: cell.src, cell }
      g += span
    }
    out += `</${W}tr>`
  }
  return out + `</${W}tbl>`
}

export async function applyTable(doc: DocxDocument, op: TableOp): Promise<void> {
  if (!doc.ready) throw new Error('Document is still loading')
  doc.markEdited()
  const xml = op.spec ? await genTable(doc, op.spec) : ''
  if (op.item !== undefined) {
    doc.itemXml.set(op.item, xml)
    return
  }
  // new table living inside a paragraph group
  let key: string | undefined
  for (const [k, g] of doc.groups) if (g.includes(op.tid)) key = k
  if (!op.spec) {
    if (key) doc.groups.get(key)!.splice(doc.groups.get(key)!.indexOf(op.tid), 1)
    doc.genXml.delete(op.tid)
    return
  }
  if (!key) {
    const anchor = op.anchor !== undefined ? doc.info.get(op.anchor) : undefined
    if (!anchor || op.anchor === undefined) throw new Error('Table anchor paragraph not found')
    const g = groupFor(doc, `${anchor.item}:${anchor.ord}`)
    g.splice(g.indexOf(op.anchor) + 1, 0, op.tid)
  }
  doc.genXml.set(op.tid, xml)
}

// ---------------------------------------------------------------- page setup

const SECT_ORDER = [
  'headerReference', 'footerReference', 'footnotePr', 'endnotePr', 'type', 'pgSz', 'pgMar', 'paperSrc', 'pgBorders', 'lnNumType', 'pgNumType', 'cols',
  'formProt', 'vAlign', 'noEndnote', 'titlePg', 'textDirection', 'bidi', 'rtlGutter', 'docGrid', 'printerSettings', 'sectPrChange',
]

/** Changes the page setup ("whole document"): resolves to the new setup and the change that undoes it. */
export async function setPage(doc: DocxDocument, set: PageSet): Promise<PageSetResult> {
  if (!doc.ready) throw new Error('Document is still loading')
  const ok = (v: number | undefined, min: number, max: number) => v === undefined || (Number.isFinite(v) && v >= min && v <= max)
  if (!ok(set.w, 72, 1584) || !ok(set.h, 72, 1584) || ![set.mt, set.mr, set.mb, set.ml].every((m) => ok(m, 0, 432)) || !ok(set.cols, 1, 12) || !ok(set.colGap, 0, 288))
    throw new Error('Invalid page setup')
  const cur: PageSetup = { ...doc.page, ...doc.pageSet }
  const undo: PageSet = {}
  for (const k of Object.keys(set) as (keyof PageSet)[]) undo[k] = k === 'cols' ? (cur.cols ?? 1) : k === 'colGap' ? (cur.colGap ?? 36) : cur[k]
  const merged: PageSet = { ...doc.pageSet, ...set }
  // a value back to what the file had (undo) is no change: the sections keep their own values on save
  const orig: Required<PageSet> = { w: doc.page.w, h: doc.page.h, mt: doc.page.mt, mr: doc.page.mr, mb: doc.page.mb, ml: doc.page.ml, cols: doc.page.cols ?? 1, colGap: doc.page.colGap ?? 36 }
  for (const k of Object.keys(merged) as (keyof PageSet)[]) if (Math.abs((merged[k] as number) - orig[k]) < 0.01) delete merged[k]
  doc.pageSet = Object.keys(merged).length ? merged : undefined
  doc.sectTouched = true
  doc.markEdited()
  const page: PageSetup = { ...doc.page, ...doc.pageSet }
  if (!page.cols || page.cols <= 1) delete page.cols
  if (page.cols && page.colGap === undefined) page.colGap = 36
  if (!page.cols) delete page.colGap
  return { page, undo }
}

/** every sectPr element (outermost only) of `xml`, rewritten by `fn` */
function rewriteSects(xml: string, fn: (sect: RNode) => void): string {
  const open = /<([\w.-]+:)?sectPr\b/g
  let out = ''
  let from = 0
  for (let m = open.exec(xml); m; m = open.exec(xml)) {
    const q = `${m[1] ?? ''}sectPr`
    // matching end tag, nested sectPr (inside sectPrChange) counted
    let depth = 0
    let end = -1
    const tag = new RegExp(`<(/?)${q.replace('.', '\\.')}\\b[^>]*?(/?)>`, 'g')
    tag.lastIndex = m.index
    for (let t = tag.exec(xml); t; t = tag.exec(xml)) {
      if (t[1]) depth--
      else if (!t[2]) depth++
      if (depth === 0) {
        end = t.index + t[0].length
        break
      }
    }
    if (end < 0) break
    const node = rootEl(parseRaw(xml.slice(m.index, end)))
    if (!node) continue
    fn(node)
    out += xml.slice(from, m.index) + serialize(node)
    from = end
    open.lastIndex = end
  }
  return out + xml.slice(from)
}

/** the document with a final (body-level) sectPr: an empty one is added before </w:body> when it has none */
function withBodySect(xml: string): string {
  const end = /<\/([\w.-]+:)?body>/.exec(xml)
  if (!end) return xml
  const before = xml.slice(0, end.index).trimEnd()
  const W = end[1] ?? ''
  if (new RegExp(`(</${W}sectPr>|<${W}sectPr\\b[^>]*/>)$`).test(before)) return xml
  return xml.slice(0, end.index) + `<${W}sectPr/>` + xml.slice(end.index)
}

function applyPageSet(sect: RNode, set: PageSet, page: PageSetup) {
  const W = prefixOf(sect.q)
  const tw = (v: number) => String(Math.round(v * 20))
  if (set.w !== undefined || set.h !== undefined) {
    const sz = kidOf(sect, 'pgSz') ?? el(W + 'pgSz')
    setAttr(sz, W + 'w', tw(page.w))
    setAttr(sz, W + 'h', tw(page.h))
    setAttr(sz, W + 'orient', page.w > page.h ? 'landscape' : undefined)
    setOrdered(sect, sz, 'pgSz', SECT_ORDER)
  }
  if (set.mt !== undefined || set.mr !== undefined || set.mb !== undefined || set.ml !== undefined) {
    const mar = kidOf(sect, 'pgMar') ?? el(W + 'pgMar', { [W + 'header']: tw(page.header), [W + 'footer']: tw(page.footer), [W + 'gutter']: '0' })
    for (const [k, v] of [['top', set.mt], ['right', set.mr], ['bottom', set.mb], ['left', set.ml]] as const) if (v !== undefined) setAttr(mar, W + k, tw(v))
    setOrdered(sect, mar, 'pgMar', SECT_ORDER)
  }
  if (set.cols !== undefined || set.colGap !== undefined) {
    const cols = kidOf(sect, 'cols') ?? el(W + 'cols')
    const n = set.cols ?? page.cols ?? 1
    setAttr(cols, W + 'num', n > 1 ? String(n) : undefined)
    setAttr(cols, W + 'space', tw(set.colGap ?? page.colGap ?? 36))
    // column widths of unequal columns no longer fit: equal columns
    setAttr(cols, W + 'equalWidth', undefined)
    cols.c = []
    cols.self = true
    setOrdered(sect, cols, 'cols', SECT_ORDER)
  }
}

// ---------------------------------------------------------------- headers / footers

const HF_REL = { header: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header', footer: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer' }
const HF_CT = {
  header: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml',
  footer: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml',
}
const SETTINGS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings'
const SETTINGS_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml'
const SETTINGS_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const HF_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const isFooter = (k: HFKind) => k === 'footer' || k === 'firstFooter' || k === 'evenFooter'
const hfType = (k: HFKind) => (k === 'firstHeader' || k === 'firstFooter' ? 'first' : k === 'evenHeader' || k === 'evenFooter' ? 'even' : 'default')

/** a header / footer paragraph; {PAGE} / {NUMPAGES} become fields Word updates */
function hfParaXml(doc: DocxDocument, k: HFKind, line: HFLine): string {
  const style = isFooter(k) ? 'Footer' : 'Header'
  const ppr = (doc.styles.has(style) ? `<w:pStyle w:val="${style}"/>` : '') + (line.align && line.align !== 'left' ? `<w:jc w:val="${line.align}"/>` : '')
  const rpr = (line.b ? '<w:b/>' : '') + (line.sz ? `<w:sz w:val="${Math.round(line.sz * 2)}"/><w:szCs w:val="${Math.round(line.sz * 2)}"/>` : '')
  const R = rpr ? `<w:rPr>${rpr}</w:rPr>` : ''
  let runs = ''
  for (const part of line.text.split(/(\{PAGE\}|\{NUMPAGES\})/)) {
    if (!part) continue
    if (part === '{PAGE}' || part === '{NUMPAGES}') runs += `<w:fldSimple w:instr=" ${part.slice(1, -1)} "><w:r>${R}<w:t>1</w:t></w:r></w:fldSimple>`
    else runs += `<w:r>${R}${textContentXml(part, 'w:')}</w:r>`
  }
  return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${runs}</w:p>`
}

/** the whole part: the original root element (namespaces) kept when there is one */
function hfXml(doc: DocxDocument, k: HFKind, lines: HFLine[], was?: string): string {
  const tag = isFooter(k) ? 'w:ftr' : 'w:hdr'
  // an empty part may be a self-closing root: reopen it
  const head = was ? (/^[\s\S]*?<w:(hdr|ftr)\b[^>]*>/.exec(was)?.[0] ?? '').replace(/\s*\/>$/, '>') : ''
  const open = head || `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<${tag} ${HF_NS}>`
  const end = head ? `</w:${/<w:(hdr|ftr)\b/.exec(head)![1]}>` : `</${tag}>`
  return open + (lines.length ? lines.map((l) => hfParaXml(doc, k, l)).join('') : '<w:p/>') + end
}

/** Changes the headers / footers ("different first page" too); resolves to them converted again and the undo. */
export async function setHeaderFooter(doc: DocxDocument, set: HFSet): Promise<HFSetResult> {
  if (!doc.ready) throw new Error('Document is still loading')
  const kinds = new Set<HFKind>([...(Object.keys(set.parts ?? {}) as HFKind[]), ...(Object.keys(set.raw ?? {}) as HFKind[])])
  for (const k of kinds) if (!['header', 'footer', 'firstHeader', 'firstFooter', 'evenHeader', 'evenFooter'].includes(k)) throw new Error('Invalid header / footer')
  for (const lines of Object.values(set.parts ?? {}))
    if (!Array.isArray(lines) || lines.length > 20 || lines.some((l) => typeof l?.text !== 'string' || l.text.length > 2000 || (l.sz !== undefined && !(l.sz >= 4 && l.sz <= 96))))
      throw new Error('Invalid header / footer')
  doc.hfRefs ??= { header: undefined, footer: undefined, firstHeader: undefined, firstFooter: undefined, evenHeader: undefined, evenFooter: undefined }
  const undo: HFSet = {}
  for (const k of kinds) {
    let rid = doc.hfRefs[k]
    const rel = rid ? doc.rels.get(rid) : undefined
    const was = rel ? await doc.pkg.text(rel.target) : undefined
    if (was !== undefined) (undo.raw ??= {})[k] = was
    else (undo.parts ??= {})[k] = []
    const raw = set.raw?.[k]
    const xml = raw !== undefined ? raw : hfXml(doc, k, set.parts![k]!, was)
    if (rel) {
      doc.pkg.setPart(rel.target, xml)
      continue
    }
    const f = isFooter(k) ? 'footer' : 'header'
    const path = doc.pkg.freeName('word', f, 'xml')
    doc.pkg.setPart(path, xml)
    await doc.pkg.setContentType(path, HF_CT[f])
    rid = await doc.pkg.addRel(doc.mainPath, HF_REL[f], path)
    doc.rels = await doc.pkg.rels(doc.mainPath)
    doc.hfRefs[k] = rid
    doc.hfNew.set(k, rid)
  }
  const titleWas = doc.titlePgSet ?? doc.titlePg
  if (set.titlePg !== undefined) {
    undo.titlePg = titleWas
    // back to the file's own setting: left as it is in every section
    doc.titlePgSet = set.titlePg === doc.titlePg ? undefined : set.titlePg
  }
  const evenWas = doc.evenOddSet ?? doc.evenOdd
  if (set.evenAndOddHeaders !== undefined) {
    undo.evenAndOddHeaders = evenWas
    doc.evenOddSet = set.evenAndOddHeaders === doc.evenOdd ? undefined : set.evenAndOddHeaders
  } else if ([...kinds].some((k) => k === 'evenHeader' || k === 'evenFooter') && !evenWas) {
    // editing an even-page part implies turning the switch on (otherwise Word would not show it)
    undo.evenAndOddHeaders = evenWas
    doc.evenOddSet = true
  }
  if (set.trackChanges !== undefined) {
    undo.trackChanges = doc.trackSet ?? doc.track
    // stays defined once touched: reverting to the file's value must still remove an element an earlier save wrote
    doc.trackSet = set.trackChanges
  }
  doc.sectTouched = true
  doc.markEdited()
  const headers = (await doc.headers()) ?? {}
  return { headers, titlePg: doc.titlePgSet ?? doc.titlePg, evenAndOddHeaders: doc.evenOddSet ?? doc.evenOdd, trackChanges: doc.trackSet ?? doc.track, undo }
}

/** writes w:evenAndOddHeaders / w:trackChanges into settings.xml (creating the part / rel / content type when missing) */
async function applySettings(doc: DocxDocument): Promise<void> {
  if (doc.evenOddSet === undefined && doc.trackSet === undefined) return
  const path = doc.settingsPath ?? 'word/settings.xml'
  let created = false
  if (!doc.settingsPath || !doc.pkg.has(path)) {
    doc.pkg.setPart(path, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings ${SETTINGS_NS}/>`)
    await doc.pkg.setContentType(path, SETTINGS_CT)
    await doc.pkg.addRel(doc.mainPath, SETTINGS_REL, path)
    doc.settingsPath = path
    created = true
  }
  const nodes = parseRaw(await doc.pkg.text(path))
  const root = rootEl(nodes)
  if (!root) return
  const W = prefixOf(root.q) || 'w:'
  if (doc.evenOddSet !== undefined) {
    removeKids(root, 'evenAndOddHeaders')
    if (doc.evenOddSet) root.c.push(el(W + 'evenAndOddHeaders'))
  }
  if (doc.trackSet !== undefined) {
    removeKids(root, 'trackChanges')
    if (doc.trackSet) {
      // CT_Settings puts trackChanges ahead of evenAndOddHeaders
      const at = root.c.findIndex((c) => isNode(c) && local(c.q) === 'evenAndOddHeaders')
      const node = el(W + 'trackChanges')
      if (at < 0) root.c.push(node)
      else root.c.splice(at, 0, node)
    }
  }
  root.self = false
  doc.pkg.setPart(path, serialize(nodes))
  if (created) doc.rels = await doc.pkg.rels(doc.mainPath)
}

/** references to the headers / footers the editor created, and "different first page", in every section */
function applyHF(sect: RNode, doc: DocxDocument) {
  const W = prefixOf(sect.q)
  for (const [k, rid] of doc.hfNew) {
    const tag = isFooter(k) ? 'footerReference' : 'headerReference'
    const type = hfType(k)
    const refs = sect.c.filter((c): c is RNode => isNode(c) && local(c.q) === tag)
    if (refs.some((r) => (getAttr(r, W + 'type') ?? 'default') === type)) continue
    const node = el(W + tag, { [W + 'type']: type, 'r:id': rid })
    // references come first, headers before footers
    const at = sect.c.findIndex((c) => isNode(c) && (tag === 'headerReference' ? local(c.q) !== 'headerReference' : !['headerReference', 'footerReference'].includes(local(c.q))))
    if (at < 0) sect.c.push(node)
    else sect.c.splice(at, 0, node)
    sect.self = false
  }
  if (doc.titlePgSet !== undefined) setOrdered(sect, doc.titlePgSet ? el(W + 'titlePg') : undefined, 'titlePg', SECT_ORDER)
}

export async function saveDocx(doc: DocxDocument): Promise<Blob> {
  if (!doc.ready) throw new Error('Document is still loading')
  await applySettings(doc)
  const comments = doc.comments
  let body: string | undefined
  if (doc.groups.size || doc.itemXml.size) {
    const touched = new Set<number>()
    for (const key of doc.groups.keys()) touched.add(Number(key.split(':')[0]))
    const out: string[] = [doc.prefix]
    for (let i = 0; i < doc.items.length; i++) {
      const whole = doc.itemXml.get(i)
      if (whole !== undefined) {
        // keep whitespace that followed the item
        out.push(whole + (/\s*$/.exec(doc.items[i])?.[0] ?? ''))
        continue
      }
      if (!touched.has(i)) {
        out.push(doc.items[i])
        continue
      }
      const nodes = parseRaw(doc.items[i])
      const paras = collectParasRaw(nodes)
      for (let o = 0; o < paras.length; o++) {
        const g = doc.groups.get(`${i}:${o}`)
        if (!g) continue
        const loc = paras[o]
        loc.list[loc.index] = g.map((pid) => doc.genXml.get(pid) ?? (origPara(doc, pid) ? serialize(origPara(doc, pid)!) : '')).join('')
      }
      out.push(serialize(nodes))
    }
    out.push(doc.suffix)
    body = out.join('')
  }
  // comments: one range per thread in the body, then the comment parts when they changed
  if (body !== undefined || comments.dirty) {
    const num = commentNumbering(comments)
    const fixed = fixCommentMarks(body ?? (await doc.pkg.text(doc.mainPath)), comments, num)
    body = fixed.xml
    const lost = [...comments.inBody].some((id) => !fixed.found.has(id))
    if (comments.dirty || lost) await writeDocxComments(doc.pkg, doc.mainPath, comments, num, fixed.found)
  }
  // section properties are rebuilt from the file as opened on every save: the package's main part may hold a
  // previous save's, and a change undone since must not stay in it
  if (doc.sectTouched) body ??= doc.prefix + doc.items.join('') + doc.suffix
  // a body without a final sectPr (allowed: Word's defaults apply) gets one, or the changes below would be lost
  if (doc.hfNew.size || doc.titlePgSet !== undefined || doc.pageSet) body = withBodySect(body!)
  if (doc.hfNew.size || doc.titlePgSet !== undefined) body = rewriteSects(body!, (sect) => applyHF(sect, doc))
  if (doc.pageSet) {
    const set = doc.pageSet
    const page: PageSetup = { ...doc.page, ...set }
    body = rewriteSects(body!, (sect) => applyPageSet(sect, set, page))
  }
  if (body !== undefined) doc.pkg.setPart(doc.mainPath, body)
  // 内置样式全量写回（P8 / x22）：每次保存把文件缺失的注册表条目补进 styles part，
  // 与 sdkjs WriteStyles 全表写回同义；已全量则写回集空、直接短路。
  await writebackBuiltins(doc)
  return doc.pkg.save(DOCX_MIME)
}
