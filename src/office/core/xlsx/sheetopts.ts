/**
 * 工作表级 / 工作簿级「选项」：页面设置（纸张、方向、页边距、打印网格线、页眉页脚）、工作表保护、
 * 定义名称、工作簿保护、只读建议、统计信息、公式清单。
 *
 * 这些设置都落到真实的 OOXML 元素上——sheet 的 `sheetProtection` / `printOptions` / `pageMargins` /
 * `pageSetup` / `headerFooter`，workbook 的 `definedNames` / `workbookProtection` / `fileSharing`——
 * 不是只改视图状态（保存后由 Excel 打开也还在）。
 */
import { clone, el, escText, getAttr, isNode, kidOf, kidsOf, local, setAttr, setOrdered, type RNode } from '../raw'
import type { BookOp, DefinedName, XlsxPageSetup, XlsxFormulaCell, XlsxStats } from './types'
import { MAX_COL, T_EMPTY, type SheetData } from './workbook'
import { translateFormula } from './formula'

/** workbook.xml 的子元素顺序（CT_Workbook） */
export const WB_ORDER = [
  'fileVersion', 'fileSharing', 'workbookPr', 'workbookProtection', 'bookViews', 'sheets', 'functionGroups', 'externalReferences',
  'definedNames', 'calcPr', 'oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing',
  'fileRecoveryPr', 'webPublishObjects', 'extLst',
]

/** worksheet 尾部元素的 schema 顺序（页面设置相关元素在其中的位置） */
const WS_ORDER = [
  'sheetCalcPr', 'sheetProtection', 'protectedRanges', 'scenarios', 'autoFilter', 'sortState', 'dataConsolidate',
  'customSheetViews', 'mergeCells', 'phoneticPr', 'conditionalFormatting', 'dataValidations', 'hyperlinks',
  'printOptions', 'pageMargins', 'pageSetup', 'headerFooter', 'rowBreaks', 'colBreaks', 'customProperties',
  'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'drawingHF',
  'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst',
]

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
/** 磅 → 英寸（OOXML 的页边距单位） */
const inch = (pt: number) => +(pt / 72).toFixed(4)

export interface PageParts {
  protection?: string
  printOptions?: string
  pageMargins?: string
  pageSetup?: string
  headerFooter?: string
}

/** 页面设置 → sheet XML 片段（没设置的项不产生元素） */
export function pageParts(P: string, cfg: XlsxPageSetup): PageParts {
  const out: PageParts = {}
  if (cfg.protect) out.protection = `<${P}sheetProtection sheet="1" objects="1" scenarios="1"/>`
  if (cfg.gridLines) out.printOptions = `<${P}printOptions gridLines="1"/>`
  const m = cfg.margins
  if (m) {
    out.pageMargins =
      `<${P}pageMargins left="${inch(num(m.left, 50.4))}" right="${inch(num(m.right, 50.4))}"` +
      ` top="${inch(num(m.top, 54))}" bottom="${inch(num(m.bottom, 54))}"` +
      ` header="${inch(num(m.header, 21.6))}" footer="${inch(num(m.footer, 21.6))}"/>`
  }
  if (cfg.paper || cfg.orientation) {
    const a: string[] = []
    if (cfg.paper) a.push(`paperSize="${cfg.paper}"`)
    a.push(`orientation="${cfg.orientation ?? 'portrait'}"`)
    out.pageSetup = `<${P}pageSetup ${a.join(' ')}/>`
  }
  if (cfg.header || cfg.footer) {
    const parts: string[] = []
    if (cfg.header) parts.push(`<${P}oddHeader>${escText(cfg.header)}</${P}oddHeader>`)
    if (cfg.footer) parts.push(`<${P}oddFooter>${escText(cfg.footer)}</${P}oddFooter>`)
    out.headerFooter = `<${P}headerFooter>${parts.join('')}</${P}headerFooter>`
  }
  return out
}

function stripTag(xml: string, tag: string): string {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>|<(?:\\w+:)?${tag}\\b[^>]*/>`, 'g')
  return xml.replace(re, '')
}

/** 按 schema 顺序把元素插到第一个「更靠后」的兄弟之前 */
function insertOrdered(xml: string, tag: string, elem: string): string {
  const rank = WS_ORDER.indexOf(tag)
  let at = -1
  for (let i = rank + 1; i < WS_ORDER.length; i++) {
    const m = new RegExp(`<(?:\\w+:)?${WS_ORDER[i]}\\b`).exec(xml)
    if (m && (at < 0 || m.index < at)) at = m.index
  }
  if (at < 0) {
    const close = /<\/([\w.-]+:)?worksheet\s*>/.exec(xml)
    at = close ? close.index : xml.length
  }
  return xml.slice(0, at) + elem + xml.slice(at)
}

/**
 * 把页面设置写进 sheet XML：先去掉文件里原有的这些元素，再按 schema 顺序插入新的。
 * `xml` 可以是整张 sheet，也可以只是它 `</sheetData>` 之后的尾部（尾部里含 `</worksheet>`）。
 */
export function injectPageElements(xml: string, opts: { prefix: string; page?: XlsxPageSetup }): string {
  const P = opts.prefix
  let out = xml
  for (const tag of ['sheetProtection', 'printOptions', 'pageMargins', 'pageSetup', 'headerFooter']) out = stripTag(out, tag)
  if (!opts.page) return out
  const parts = pageParts(P, opts.page)
  const order: [keyof PageParts, string][] = [
    ['protection', 'sheetProtection'], ['printOptions', 'printOptions'],
    ['pageMargins', 'pageMargins'], ['pageSetup', 'pageSetup'], ['headerFooter', 'headerFooter'],
  ]
  for (const [k, tag] of order) {
    const elem = parts[k]
    if (elem) out = insertOrdered(out, tag, elem)
  }
  return out
}

/** 页面设置写进工作表模型（保存时由 rowpatch 写进 sheet XML） */
export function applyPageSetup(d: SheetData, setup: XlsxPageSetup): void {
  const cur = d.page ?? {}
  d.page = { ...cur, ...setup, margins: setup.margins ?? cur.margins }
  d.dirtyPage = true
}

/** 保护工作簿结构 / 建议只读打开：workbook.xml 的 workbookProtection 与 fileSharing */
export function setWorkbookProtection(root: RNode, P: string, lock: boolean): void {
  const node = lock ? el(P + 'workbookProtection', { workbookPassword: '', lockStructure: '1' }) : undefined
  setOrdered(root, node, 'workbookProtection', WB_ORDER)
}

export function setFileSharing(root: RNode, P: string, readOnly: boolean): void {
  const node = readOnly ? el(P + 'fileSharing', { readOnlyRecommended: '1' }) : undefined
  setOrdered(root, node, 'fileSharing', WB_ORDER)
}

/** 定义名称的增删：workbook.xml 的 <definedNames> */
export function definedNameOp(root: RNode, P: string, op: Extract<BookOp, { op: 'defineName' | 'deleteName' }>): void {
  let dn = kidOf(root, 'definedNames')
  if (!dn) {
    dn = el(P + 'definedNames')
    setOrdered(root, dn, 'definedNames', WB_ORDER)
  }
  const scope = op.scope
  const same = (c: unknown) =>
    isNode(c as never) && local((c as RNode).q) === 'definedName' &&
    getAttr(c as RNode, 'name') === op.name &&
    (scope === undefined || getAttr(c as RNode, 'localSheetId') === String(scope))
  dn.c = dn.c.filter((c) => !same(c))
  if (op.op === 'defineName') {
    const attrs = scope === undefined ? { name: op.name } : { name: op.name, localSheetId: String(scope) }
    const node = el(P + 'definedName', attrs)
    node.c = [escText(op.refersTo)]
    node.self = false
    dn.c.push(node)
  }
  dn.self = dn.c.length === 0
  if (!dn.c.length) root.c = root.c.filter((c) => c !== dn)
}

/** 读取工作簿里的定义名称 */
export function readDefinedNames(root: RNode): DefinedName[] {
  const dn = kidOf(root, 'definedNames')
  if (!dn) return []
  const out: DefinedName[] = []
  for (const c of kidsOf(dn, 'definedName')) {
    const name = getAttr(c, 'name')
    if (!name) continue
    const scopeAttr = getAttr(c, 'localSheetId')
    out.push({
      name,
      refersTo: c.c.filter((x): x is string => typeof x === 'string').join(''),
      scope: scopeAttr === undefined ? undefined : Number(scopeAttr)
    })
  }
  return out
}

/** 工作簿统计信息：已用行列数、非空单元格数、公式单元格数 */
export function statsOf(d: SheetData | undefined, sheet: number): XlsxStats {
  if (!d) return { sheet, rows: 0, cols: 0, cells: 0, formulas: 0 }
  let cells = 0
  for (const row of d.rows) {
    if (!row) continue
    for (let k = 0; k < row.length; k += 4) if ((row[k + 1] as number) !== T_EMPTY) cells++
  }
  return { sheet, rows: Math.max(0, d.maxRow + 1), cols: Math.max(0, d.maxCol + 1), cells, formulas: d.formulas.size }
}

/** 公式清单（供「显示公式」用）：共享公式在这里还原成每个单元格自己的引用 */
export function formulasIn(d: SheetData | undefined, r0: number, r1: number): XlsxFormulaCell[] {
  const out: XlsxFormulaCell[] = []
  if (!d) return out
  for (const [key, f] of d.formulas) {
    const r = Math.floor(key / MAX_COL)
    if (r < r0 || r > r1) continue
    out.push({ r, c: key % MAX_COL, f })
  }
  for (const [key, si] of d.depOf) {
    const g = d.shared.get(si)
    if (!g || d.formulas.has(key)) continue
    const r = Math.floor(key / MAX_COL)
    if (r < r0 || r > r1) continue
    const dr = Math.floor(key / MAX_COL) - Math.floor(g.master / MAX_COL)
    const dc = (key % MAX_COL) - (g.master % MAX_COL)
    out.push({ r, c: key % MAX_COL, f: translateFormula(g.text, dr, dc) })
  }
  return out
}

/** 复制一份定义名称节点（复制到别的表时用） */
export function cloneName(n: RNode): RNode {
  return clone(n)
}

/** 给工作表节点补一个属性（隐藏工作表用） */
export function setSheetState(node: RNode, state: 'hidden' | 'visible'): void {
  setAttr(node, 'state', state === 'hidden' ? 'hidden' : undefined)
}
