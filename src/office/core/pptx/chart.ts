/**
 * PPT 原生图表（DrawingML chart part）解析与写回。
 *
 * 解析：`p:graphicFrame` → `a:graphic/a:graphicData/c:chart@r:id` → slide part 的 rels
 * 找到 `ppt/charts/chartN.xml`，解析 `c:chartSpace/c:chart/c:plotArea` 下的图表组
 * （barChart / lineChart / pieChart 等），逐个 `c:ser` 读 `c:tx`（系列名）、`c:cat`
 * （分类）、`c:val`（数值）。引用来源有 strRef / numRef / strLit / numLit /
 * multiLvlStrRef，优先用缓存值（strCache / numCache / multiLvlStrCache）渲染，
 * 同时记下 `c:f` 公式（写回时用它定位源单元格）。
 *
 * 写回：改 chart part 的 `c:pt`（重排 idx、更新 `c:v`、`c:ptCount`），点数变化时同步
 * 调整 `c:f` 指向的区域；并把新值写进 `c:f` 指向的源区域 —— 即嵌入工作簿
 * （`ppt/embeddings/*.xlsx`）里对应工作表的单元格，与真实 Excel 的「编辑数据」语义
 * 一致（跨 sheet 也能定位）。
 *
 * 诚实边界：不支持 3D 图、组合图（同一 plotArea 多组图表）、次坐标轴、数据标签逐项格式化、
 * chart style / colors part；非 bar/line/pie 的类型降级为「未识别图表类型」标签（仍可保存）。
 */
import { OpcPackage } from '../opc'
import { BufferSource } from '../source'
import { el, escText, getAttr, isNode, kidOf, kidsOf, local, parseRaw, prefixOf, rootEl, serialize, setAttr, textContent, type RNode } from '../raw'
import { rebuildZip } from '../zipwrite'
import { ZipArchive } from '../zip'
import type { ChartData, ChartSeries, ChartType } from './types'

/** textContent 的安全包装：kidOf 可能返回 undefined */
const txt = (n: RNode | undefined): string => (n ? textContent(n) : '')

/** 图表组标签 → 支持的类型；其余标签降级为 other */
const GROUP_TAGS: Record<string, ChartType> = {
  barChart: 'bar',
  lineChart: 'line',
  pieChart: 'pie',
}

// ---------------------------------------------------------------- 解析

/** 缓存里的点：idx + 文本值 */
interface Pt {
  idx: number
  v: string
}

/** 读取缓存（strCache / numCache / lit）里的 c:pt 列表，按 idx 升序 */
function ptsOf(cache: RNode | undefined): Pt[] {
  if (!cache) return []
  return kidsOf(cache, 'pt')
    .map((p) => ({ idx: Number(getAttr(p, 'idx') ?? '0') || 0, v: txt(kidOf(p, 'v')) }))
    .sort((a, b) => a.idx - b.idx)
}

/** 缓存里的第一个值（系列名用） */
function firstPt(cache: RNode | undefined): string {
  return ptsOf(cache)[0]?.v ?? ''
}

/** c:tx 的系列名与它的引用公式 */
function readSeriesName(tx: RNode | undefined): { name: string; ref?: string } {
  if (!tx) return { name: '' }
  const strRef = kidOf(tx, 'strRef')
  if (strRef) {
    const f = txt(kidOf(strRef, 'f'))
    return { name: firstPt(kidOf(strRef, 'strCache')), ref: f || undefined }
  }
  const lit = kidOf(tx, 'v')
  if (lit) return { name: textContent(lit) }
  const rich = kidOf(tx, 'rich')
  if (rich) return { name: textContent(rich) }
  return { name: '' }
}

/** c:cat 的分类值与引用公式 */
function readCat(cat: RNode | undefined): { values: string[]; ref?: string } {
  if (!cat) return { values: [] }
  const strRef = kidOf(cat, 'strRef')
  if (strRef) return { values: ptsOf(kidOf(strRef, 'strCache')).map((p) => p.v), ref: txt(kidOf(strRef, 'f')) || undefined }
  const numRef = kidOf(cat, 'numRef')
  if (numRef) return { values: ptsOf(kidOf(numRef, 'numCache')).map((p) => p.v), ref: txt(kidOf(numRef, 'f')) || undefined }
  const multi = kidOf(cat, 'multiLvlStrRef')
  if (multi) {
    const cache = kidOf(multi, 'multiLvlStrCache')
    const lvl = kidsOf(cache, 'lvl')[0]
    return { values: ptsOf(lvl).map((p) => p.v), ref: txt(kidOf(multi, 'f')) || undefined }
  }
  const strLit = kidOf(cat, 'strLit')
  if (strLit) return { values: ptsOf(strLit).map((p) => p.v) }
  const numLit = kidOf(cat, 'numLit')
  if (numLit) return { values: ptsOf(numLit).map((p) => p.v) }
  return { values: [] }
}

/** c:val 的数值与引用公式 */
function readVal(val: RNode | undefined): { values: number[]; ref?: string } {
  if (!val) return { values: [] }
  const numRef = kidOf(val, 'numRef')
  if (numRef) return { values: ptsOf(kidOf(numRef, 'numCache')).map((p) => Number(p.v) || 0), ref: txt(kidOf(numRef, 'f')) || undefined }
  const numLit = kidOf(val, 'numLit')
  if (numLit) return { values: ptsOf(numLit).map((p) => Number(p.v) || 0) }
  return { values: [] }
}

/** 轴标题（c:catAx / c:valAx 的 c:title） */
function axisTitle(ax: RNode | undefined): string | undefined {
  const title = kidOf(ax, 'title')
  if (!title) return undefined
  const tx = kidOf(title, 'tx')
  if (!tx) return undefined
  const rich = kidOf(tx, 'rich')
  const strRef = kidOf(tx, 'strRef')
  const text = rich ? textContent(rich) : strRef ? firstPt(kidOf(strRef, 'strCache')) : textContent(tx)
  return text.trim() || undefined
}

/**
 * 解析 chart part（c:chartSpace 根节点）→ 图表数据。
 * 未识别的图表类型返回 type='other' 并带上原始标签（视图显示「未识别图表类型」）。
 */
export function parseChart(chartSpace: RNode): ChartData {
  const chart = kidOf(chartSpace, 'chart')
  const plotArea = kidOf(chart, 'plotArea')
  const groupTag = kidsOf(plotArea).map((c) => local(c.q)).find((n) => n.endsWith('Chart')) ?? ''
  const group = kidsOf(plotArea).find((c) => local(c.q) === groupTag)
  const type = GROUP_TAGS[groupTag] ?? 'other'
  const sers = group ? kidsOf(group, 'ser') : []
  const series: ChartSeries[] = sers.map((ser) => {
    const nm = readSeriesName(kidOf(ser, 'tx'))
    const cat = readCat(kidOf(ser, 'cat'))
    const val = readVal(kidOf(ser, 'val'))
    return { name: nm.name, nameRef: nm.ref, cat, val }
  })
  const barDir = kidOf(group, 'barDir')
  const horizontal = type === 'bar' && (barDir ? getAttr(barDir, 'val') : 'col') === 'bar'
  return {
    type,
    series,
    catAxisTitle: axisTitle(kidOf(plotArea, 'catAx')),
    valAxisTitle: axisTitle(kidOf(plotArea, 'valAx')),
    horizontal: horizontal || undefined,
    rawType: type === 'other' ? groupTag : undefined,
  }
}

/** 读 chart part 文本并解析 */
export async function readChartPart(pkg: OpcPackage, path: string): Promise<ChartData | undefined> {
  try {
    const root = rootEl(parseRaw(await pkg.text(path)))
    if (!root) return undefined
    return parseChart(root)
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------- 引用公式

/** 单元格坐标（0 基列号、1 基行号） */
export interface Cell {
  col: number
  row: number
}

/** 解析出的区域引用 */
export interface RefRange {
  /** 工作表名（已去掉引号） */
  sheet: string
  /** 原始工作表写法（可能带引号），用于原样重建公式 */
  sheetRaw: string
  start: Cell
  end: Cell
}

function colOf(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function colName(col: number): string {
  let n = col + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** 解析 `Sheet1!$A$2:$A$5` / `'我的 表'!$B$1` 形式的引用 */
export function parseRef(formula: string): RefRange | undefined {
  const f = formula.trim().replace(/^\[[^\]]*\]\s*/, '')
  const bang = f.lastIndexOf('!')
  if (bang < 0) return undefined
  const sheetRaw = f.slice(0, bang).trim()
  let sheet = sheetRaw
  if (sheet.startsWith("'") && sheet.endsWith("'")) sheet = sheet.slice(1, -1).replace(/''/g, "'")
  const rest = f.slice(bang + 1).trim()
  const parts = rest.split(':')
  const cell = (s: string): Cell | undefined => {
    const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(s.trim())
    if (!m) return undefined
    return { col: colOf(m[1]), row: Number(m[2]) }
  }
  const a = cell(parts[0])
  if (!a) return undefined
  const b = parts.length > 1 ? cell(parts[1]) : a
  if (!b) return undefined
  return { sheet, sheetRaw, start: a, end: b }
}

/** 区域里的单元格（按行优先） */
export function cellsOf(range: RefRange): Cell[] {
  const out: Cell[] = []
  for (let r = Math.min(range.start.row, range.end.row); r <= Math.max(range.start.row, range.end.row); r++) {
    for (let c = Math.min(range.start.col, range.end.col); c <= Math.max(range.start.col, range.end.col); c++) out.push({ col: c, row: r })
  }
  return out
}

/** 重建公式文本（保持 $ 绝对标记与工作表引号） */
function refText(range: RefRange, abs = true): string {
  const d = abs ? '$' : ''
  const a = `${d}${colName(range.start.col)}${d}${range.start.row}`
  const b = `${d}${colName(range.end.col)}${d}${range.end.row}`
  return a === b ? `${range.sheetRaw}!${a}` : `${range.sheetRaw}!${a}:${b}`
}

/**
 * 点数变化时把引用区域改成覆盖新点数的范围：
 * 单列区域改行数、单行区域改列数、二维区域按行扩展。
 */
export function retargetRef(formula: string, count: number): string | undefined {
  const range = parseRef(formula)
  if (!range) return undefined
  const n = Math.max(1, count)
  const sameCol = range.start.col === range.end.col
  const sameRow = range.start.row === range.end.row
  if (sameCol && sameRow) {
    // 单格引用：按列方向展开（分类/数值列的常见形态）
    range.end = { col: range.start.col, row: range.start.row + n - 1 }
  } else if (sameCol) {
    range.end = { col: range.start.col, row: range.start.row + n - 1 }
  } else if (sameRow) {
    range.end = { col: range.start.col + n - 1, row: range.start.row }
  } else {
    range.end = { col: range.start.col, row: range.start.row + n - 1 }
  }
  return refText(range)
}

/** 引用区域整体右移 n 列（新系列用） */
function shiftRefCols(formula: string, delta: number): string | undefined {
  const range = parseRef(formula)
  if (!range) return undefined
  range.start = { ...range.start, col: range.start.col + delta }
  range.end = { ...range.end, col: range.end.col + delta }
  return refText(range)
}

// ---------------------------------------------------------------- 写回：chart part

/** 收集一个系列里各类引用的公式（写回源单元格时用） */
export interface SeriesRefs {
  nameRef?: string
  catRef?: string
  valRef?: string
}

/** 读某个 c:ser 上的引用公式 */
function refsOfSer(ser: RNode): SeriesRefs {
  const tx = kidOf(ser, 'tx')
  const nameRef = tx ? txt(kidOf(kidOf(tx, 'strRef'), 'f')) || undefined : undefined
  const cat = kidOf(ser, 'cat')
  const catRef = cat
    ? txt(kidOf(kidOf(cat, 'strRef'), 'f')) ||
      txt(kidOf(kidOf(cat, 'numRef'), 'f')) ||
      txt(kidOf(kidOf(cat, 'multiLvlStrRef'), 'f')) ||
      undefined
    : undefined
  const val = kidOf(ser, 'val')
  const valRef = val ? txt(kidOf(kidOf(val, 'numRef'), 'f')) || undefined : undefined
  return { nameRef, catRef, valRef }
}

/** 重写缓存里的点：按值数量重排 idx、更新 c:v 与 c:ptCount */
function writeCache(cache: RNode, values: (string | number)[], prefix: string, countNode?: RNode): void {
  const count = countNode ?? kidOf(cache, 'ptCount')
  if (count) setAttr(count, 'val', String(values.length))
  const pts = values.map((v, i) => el(prefix + 'pt', { idx: String(i) }, [el(prefix + 'v', {}, [escText(String(v))])]))
  // 保留 formatCode / extLst 等非点节点，点按 schema 顺序插在 extLst 之前
  const rest = cache.c.filter((c) => !(isNode(c) && local(c.q) === 'pt'))
  const at = rest.findIndex((c) => isNode(c) && local(c.q) === 'extLst')
  cache.c = at < 0 ? [...rest, ...pts] : [...rest.slice(0, at), ...pts, ...rest.slice(at)]
  cache.self = false
}

/** 找到 c:cat / c:val 下承载点数据的缓存节点（strCache / numCache / lit / multiLvlStrCache） */
function cacheOf(node: RNode | undefined): RNode | undefined {
  if (!node) return undefined
  const strRef = kidOf(node, 'strRef')
  if (strRef) return kidOf(strRef, 'strCache')
  const numRef = kidOf(node, 'numRef')
  if (numRef) return kidOf(numRef, 'numCache')
  const multi = kidOf(node, 'multiLvlStrRef')
  if (multi) {
    const cache = kidOf(multi, 'multiLvlStrCache')
    return kidOf(cache, 'lvl')
  }
  const strLit = kidOf(node, 'strLit')
  if (strLit) return strLit
  const numLit = kidOf(node, 'numLit')
  if (numLit) return numLit
  return undefined
}

/** c:cat / c:val 下的引用包装节点（strRef / numRef / multiLvlStrRef） */
function refWrapperOf(node: RNode | undefined): RNode | undefined {
  if (!node) return undefined
  return kidOf(node, 'strRef') ?? kidOf(node, 'numRef') ?? kidOf(node, 'multiLvlStrRef')
}

/** 改系列名（c:tx）：strRef 缓存 / 字面值 / rich 文本三种写法 */
function writeSeriesName(ser: RNode, name: string): void {
  const tx = kidOf(ser, 'tx')
  if (!tx) return
  const strRef = kidOf(tx, 'strRef')
  if (strRef) {
    const cache = kidOf(strRef, 'strCache')
    if (cache) {
      writeCache(cache, [name], prefixOf(cache.q) || 'c:')
      return
    }
  }
  const lit = kidOf(tx, 'v')
  if (lit) {
    lit.c = [escText(name)]
    lit.self = false
    return
  }
  const rich = kidOf(tx, 'rich')
  if (!rich) return
  // rich：改第一个 a:t 的文本，其余保持原样
  let done = false
  const walk = (n: RNode) => {
    for (const c of n.c) {
      if (!isNode(c) || done) continue
      if (local(c.q) === 't') {
        c.c = [escText(name)]
        c.self = false
        done = true
        continue
      }
      walk(c)
    }
  }
  walk(rich)
}

/**
 * 写一个系列的分类 / 数值：更新缓存点，点数变化时同步调整 c:f 区域。
 * 返回写回后的引用公式。
 */
function writeSeriesPoints(ser: RNode, which: 'cat' | 'val', values: (string | number)[], prefix: string): string | undefined {
  const holder = kidOf(ser, which)
  if (!holder) return undefined
  const cache = cacheOf(holder)
  const wrapper = refWrapperOf(holder)
  let formula: string | undefined
  if (wrapper) {
    const f = kidOf(wrapper, 'f')
    const cur = txt(f)
    if (cur) {
      const range = parseRef(cur)
      const oldCount = range ? cellsOf(range).length : 0
      let next: string | undefined
      if (oldCount !== values.length) {
        next = retargetRef(cur, values.length)
        if (next && f) {
          f.c = [escText(next)]
          f.self = false
        }
      }
      formula = next ?? cur
    }
  }
  if (cache) {
    // multiLvlStrRef 的 ptCount 在 multiLvlStrCache 上（点却在 lvl 里）
    const multi = kidOf(holder, 'multiLvlStrRef')
    const countNode = multi ? kidOf(kidOf(multi, 'multiLvlStrCache'), 'ptCount') : undefined
    writeCache(cache, values, prefixOf(cache.q) || prefix, countNode)
  }
  return formula || undefined
}

/** c:ser 的 c:idx / c:order（schema 要求 idx、order 在最前） */
function setSerOrder(ser: RNode, prefix: string, i: number): void {
  const idx = kidOf(ser, 'idx')
  const order = kidOf(ser, 'order')
  if (idx) setAttr(idx, 'val', String(i))
  else ser.c.unshift(el(prefix + 'idx', { val: String(i) }))
  if (order) setAttr(order, 'val', String(i))
  else ser.c.splice(1, 0, el(prefix + 'order', { val: String(i) }))
  ser.self = false
}

/**
 * 新建一个 c:ser（新增系列）：tx/cat/val 用引用 + 缓存；
 * 引用推不出来时只写缓存（c:f 在 schema 里是可选的）。
 */
function createSer(prefix: string, i: number, name: string, cats: string[], vals: number[], refs: SeriesRefs): RNode {
  const strCache = (values: string[]) => {
    const cache = el(prefix + 'strCache', {}, [el(prefix + 'ptCount', { val: String(values.length) })])
    writeCache(cache, values, prefix)
    return cache
  }
  const numCache = (values: number[]) => {
    const cache = el(prefix + 'numCache', {}, [el(prefix + 'ptCount', { val: String(values.length) })])
    writeCache(cache, values, prefix)
    return cache
  }
  const tx = refs.nameRef
    ? el(prefix + 'tx', {}, [
        el(prefix + 'strRef', {}, [el(prefix + 'f', {}, [escText(refs.nameRef)]), strCache([name])]),
      ])
    : el(prefix + 'tx', {}, [el(prefix + 'v', {}, [escText(name)])])
  const cat = refs.catRef
    ? el(prefix + 'cat', {}, [
        el(prefix + 'strRef', {}, [el(prefix + 'f', {}, [escText(refs.catRef)]), strCache(cats)]),
      ])
    : el(prefix + 'cat', {}, [
        el(prefix + 'strLit', {}, [el(prefix + 'ptCount', { val: String(cats.length) })]),
      ])
  if (!refs.catRef) writeCache(kidOf(cat, 'strLit')!, cats, prefix)
  const val = refs.valRef
    ? el(prefix + 'val', {}, [
        el(prefix + 'numRef', {}, [el(prefix + 'f', {}, [escText(refs.valRef)]), numCache(vals)]),
      ])
    : el(prefix + 'val', {}, [
        el(prefix + 'numLit', {}, [el(prefix + 'ptCount', { val: String(vals.length) })]),
      ])
  if (!refs.valRef) writeCache(kidOf(val, 'numLit')!, vals, prefix)
  return el(prefix + 'ser', {}, [
    el(prefix + 'idx', { val: String(i) }),
    el(prefix + 'order', { val: String(i) }),
    tx,
    cat,
    val,
  ])
}

/**
 * 把新数据写进 chart part（就地修改 chartSpace 树）。
 * 系列数变化时增删 c:ser 并重排 c:idx / c:order。
 * 返回按系列顺序收集到的引用公式（写回源工作簿时用）。
 */
export function applyChartData(chartSpace: RNode, data: ChartData): SeriesRefs[] {
  const chart = kidOf(chartSpace, 'chart')
  const plotArea = kidOf(chart, 'plotArea')
  const groupTag = kidsOf(plotArea).map((c) => local(c.q)).find((n) => n.endsWith('Chart')) ?? ''
  const group = kidsOf(plotArea).find((c) => local(c.q) === groupTag)
  if (!group) return []
  const prefix = prefixOf(group.q) || 'c:'
  const sers = kidsOf(group, 'ser')
  const refs: SeriesRefs[] = sers.map(refsOfSer)
  // 删除多余系列
  for (let i = data.series.length; i < sers.length; i++) {
    group.c = group.c.filter((c) => c !== sers[i])
  }
  sers.length = Math.min(sers.length, data.series.length)
  refs.length = sers.length
  // 写已有系列
  sers.forEach((ser, i) => {
    const s = data.series[i]
    if (!s) return
    writeSeriesName(ser, s.name)
    const catRef = writeSeriesPoints(ser, 'cat', s.cat.values, prefix)
    const valRef = writeSeriesPoints(ser, 'val', s.val.values, prefix)
    refs[i] = { ...refs[i], catRef: catRef ?? refs[i].catRef, valRef: valRef ?? refs[i].valRef }
  })
  // 补齐新系列（引用按最后一个系列的区域右移推算）
  for (let i = sers.length; i < data.series.length; i++) {
    const s = data.series[i]
    const last = refs[refs.length - 1]
    const first = refs[0]
    const newRefs: SeriesRefs = { catRef: first?.catRef }
    if (last?.valRef) {
      const shifted = shiftRefCols(last.valRef, 1)
      if (shifted) {
        newRefs.valRef = shifted
        const catRange = first?.catRef ? parseRef(first.catRef) : undefined
        const valRange = parseRef(shifted)
        if (catRange && valRange && valRange.start.row > 1) {
          newRefs.nameRef = `${valRange.sheetRaw}!$${colName(valRange.start.col)}$${valRange.start.row - 1}`
        }
      }
    }
    const ser = createSer(prefix, i, s.name, s.cat.values, s.val.values, newRefs)
    group.c.push(ser)
    sers.push(ser)
    refs.push(newRefs)
  }
  sers.forEach((ser, i) => setSerOrder(ser, prefix, i))
  return refs
}

// ---------------------------------------------------------------- 写回：源工作簿

/** rels XML → id → target */
function relTargets(text: string): Map<string, string> {
  const map = new Map<string, string>()
  const root = rootEl(parseRaw(text))
  if (!root) return map
  for (const r of kidsOf(root, 'Relationship')) {
    const id = getAttr(r, 'Id')
    const target = getAttr(r, 'Target')
    if (id && target) map.set(id, target)
  }
  return map
}

/** 相对 xl/ 的 target → part 路径 */
function xlPath(target: string): string {
  const base = 'xl'
  const out = base ? base.split('/') : []
  for (const seg of target.split('/')) {
    if (seg === '..') out.pop()
    else if (seg && seg !== '.') out.push(seg)
  }
  return out.join('/')
}

/** 在工作表 XML 里写一个单元格（不存在则按行列顺序插入） */
function setCell(sheetRoot: RNode, col: number, row: number, value: string | number): void {
  const sheetData = kidOf(sheetRoot, 'sheetData')
  if (!sheetData) return
  const rowNum = String(row)
  let rowEl = kidsOf(sheetData, 'row').find((r) => getAttr(r, 'r') === rowNum)
  const rp = prefixOf(rowEl?.q ?? sheetData.q)
  if (!rowEl) {
    rowEl = el(rp + 'row', { r: rowNum })
    const rows = kidsOf(sheetData, 'row')
    const at = rows.findIndex((r) => Number(getAttr(r, 'r') ?? '0') > row)
    sheetData.c.splice(at < 0 ? sheetData.c.length : sheetData.c.indexOf(rows[at]), 0, rowEl)
    sheetData.self = false
  }
  const ref = colName(col) + row
  const cp = prefixOf(rowEl.q)
  let cell = kidsOf(rowEl, 'c').find((c) => getAttr(c, 'r') === ref)
  if (!cell) {
    cell = el(cp + 'c', { r: ref })
    const cells = kidsOf(rowEl, 'c')
    const at = cells.findIndex((c) => colOf((getAttr(c, 'r') ?? 'A1').replace(/\d+/g, '')) > col)
    rowEl.c.splice(at < 0 ? rowEl.c.length : rowEl.c.indexOf(cells[at]), 0, cell)
    rowEl.self = false
  }
  cell.c = []
  if (typeof value === 'number') {
    setAttr(cell, 't', undefined)
    cell.c.push(el(cp + 'v', {}, [escText(String(value))]))
  } else {
    setAttr(cell, 't', 'inlineStr')
    cell.c.push(el(cp + 'is', {}, [el(cp + 't', {}, [escText(value)])]))
  }
  cell.self = false
}

/** 一个系列要写进源工作簿的内容 */
interface SourceWrite {
  ref?: string
  values: (string | number)[]
}

/**
 * 把新数据写进嵌入工作簿的源单元格（`c:f` 指向的区域）。
 * 找不到嵌入工作簿 / 工作表 / 公式不可解析时返回 undefined（chart part 的缓存仍然会更新）。
 */
export async function updateChartSources(pkg: OpcPackage, wbPath: string, writes: SourceWrite[]): Promise<Uint8Array | undefined> {
  let before: Uint8Array
  try {
    before = new Uint8Array(await (await pkg.blob(wbPath)).arrayBuffer())
  } catch {
    return undefined
  }
  const zip = await ZipArchive.open(new BufferSource(before))
  let workbookXml: string
  try {
    workbookXml = await zip.text('xl/workbook.xml')
  } catch {
    return undefined
  }
  const wbRoot = rootEl(parseRaw(workbookXml))
  if (!wbRoot) return undefined
  const relsText = await zip.text('xl/_rels/workbook.xml.rels').catch(() => '')
  const rels = relTargets(relsText)
  const sheetPathByName = new Map<string, string>()
  for (const s of kidsOf(kidOf(wbRoot, 'sheets'), 'sheet')) {
    const name = getAttr(s, 'name')
    const rid = getAttr(s, 'r:id') ?? getAttr(s, 'id', true)
    if (!name || !rid) continue
    const target = rels.get(rid)
    if (target) sheetPathByName.set(name, xlPath(target))
  }
  // 按工作表分组要写的单元格
  const bySheet = new Map<string, { col: number; row: number; value: string | number }[]>()
  for (const w of writes) {
    if (!w.ref || !w.values.length) continue
    const range = parseRef(w.ref)
    if (!range) continue
    const path = sheetPathByName.get(range.sheet)
    if (!path) continue
    const list = bySheet.get(path) ?? []
    const cells = cellsOf(range)
    w.values.forEach((v, i) => {
      const cell = cells[i]
      if (cell) list.push({ col: cell.col, row: cell.row, value: v })
    })
    bySheet.set(path, list)
  }
  if (!bySheet.size) return undefined
  const changes = new Map<string, string>()
  for (const [path, list] of bySheet) {
    let xml: string
    try {
      xml = await zip.text(path)
    } catch {
      continue
    }
    const root = rootEl(parseRaw(xml))
    if (!root) continue
    for (const c of list) setCell(root, c.col, c.row, c.value)
    changes.set(path, serialize(root))
  }
  if (!changes.size) return undefined
  const blob = await rebuildZip(zip, changes)
  return new Uint8Array(await blob.arrayBuffer())
}

/** 由图表数据与引用公式生成源工作簿的写入清单 */
export function sourceWrites(data: ChartData, refs: SeriesRefs[]): SourceWrite[] {
  const out: SourceWrite[] = []
  data.series.forEach((s, i) => {
    const r = refs[i]
    if (!r) return
    if (r.nameRef) out.push({ ref: r.nameRef, values: [s.name] })
    if (r.catRef) out.push({ ref: r.catRef, values: s.cat.values })
    if (r.valRef) out.push({ ref: r.valRef, values: s.val.values })
  })
  return out
}
