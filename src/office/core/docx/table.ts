/**
 * 表格布局内核 —— sdkjs word/Editor/Table*.js 列宽/行高结算的 TS 等价（路线图 P3）。
 *
 * 权威对照（release/v10.0.0 原文，逐行核实）：
 *  - 列宽两阶段（TableRecalculate.js private_RecalculateGrid :254-816）：
 *      Phase 1 固定网格 :259-440 —— 种子网格 = private_GetAdjustedTableGridToCells
 *        (:818-863，gridSpan=1 单元格显式宽取 max，缺失回退声明网格 TableGrid)，
 *        前缀和 arrSumGrid 逐行逐格撑开（显式宽 + spacing 首末 1.5×/中间 1×，
 *        :362-389），末尾 Internal_ScaleTableWidth（Table.js:16540-16608：迭代比例
 *        压缩，跌破 private_GetMinGrid :16470-16538 边距最小列的列锁死退出集合）
 *        或 MinWidth 兜底 (:420-423)；
 *      Phase 2 AutoFit :443-816（顶层看自身 tblLayout，嵌套看【父表】tblLayout :443）
 *        —— private_RecalculateGridMinContent (:864-1201) 算五数组（minMargin/
 *        minContent/maxContent/preferred/minNoPref），合并首选宽按 span 升序迭代摊分
 *        (:1051-1090)，合并列后处理按 margins→min→minNoPref→max 序撑开 (:1092-1200)；
 *        max≥min 夹 + 558.7mm 上限 (:468-482)；nMaxTableW = XLimit−X−TableInd (:550)；
 *        六大分支分配列宽 (:573-811)。
 *  - 内容度量链（宽度无关，单次测量）：单元格 = DocumentContent 逐块 max
 *    (DocumentContent.js:1393-1425) → 0.1mm 下限 (TableCell.js:1012) → +nAdd
 *    （有 spacing = 左右 margin + 左右 single 边框；无 = 逐边 max(margin, 边框/2)，
 *    :1017-1061）→ ContentMin 快照 (:1066) → 显式宽（dxa/pct）夹 min/max (:1069-1086)；
 *    段落 = 词边界扫描（Paragraph.js:2275-2317 + Run.js:5683-5941）：空格结算词入 min、
 *    空格宽缓存不入 curMax（尾随不计，:5778-5781）、'\n' 结算行并清缓存（:5895-5910）、
 *    缩进（L+R+FirstLine）只在非零时加（:2289-2298）、出口 +0.001（:2312-2316）；
 *  - 行高（TableRecalculate.js:2690-3390）：rv = trHeight + MaxBotMargin[合并末行] +
 *    MaxTopMargin (:2719)，有 spacing 减 spacing (:2724)，exact 再减 MaxTopBorder
 *    (:2728)；exact → 行底 = Y + rv (:3009)，无 spacing 时行高回补顶边 (:3379)；
 *    atLeast/auto → max(rv, 内容底) (:3289-3296) + 顶边（无 spacing）+ 底边；
 *    竖合并格内容不足 → 差额摊到合并末行（:3176-3190 Diff 卷回）；
 *  - 单元格内容宽（:1515-1651）：格宽 − spacing − nAdd（nAdd 语义同度量链）。
 *
 * v1 裁决（ponytail）：layoutCoeff=1（无打印缩放，DocumentContentElementBase.js:1552）；
 * offsetCorrections=0（Word15+ 恒 0，Table.js:2706-2761）；gridBefore/gridAfter 无模型
 * 字段 → 忽略；noWrap / 竖排 / presentation 模式无字段 → 不实现；嵌套表内 pct 宽按
 * TableWidthRange=0 处理（内容驱动，升级路径 = 迭代两遍）；边框极值用 parser 折叠后的
 * 有效边框（冲突解析 private_ResolveBordersConflict 的近似）。
 * 单位：全链路 pt。558.7mm ≡ 1584.06pt；0.1mm ≡ 0.2835pt。
 */
import { splitWords } from '../font/wrap'
import { layoutParagraph, type ParaMeasure, type ParaRun } from './layout'
import type { Block, CellBorders, Paragraph, Table, TableCell } from './types'

const EPS = 1e-3
/** Word 的列内容上限 558.7mm（:468-482） */
export const MAX_COL_W = (558.7 * 72) / 25.4
/** MSWord 单元格最小宽 0.1mm（TableCell.js:1011-1013） */
export const CELL_MIN_W = (0.1 * 72) / 25.4
/** 网格缺列补 20pt（:355-359 "2 см"） */
const FILL_COL = 20

// ── 输入契约 ───────────────────────────────────────────────────────────────

export interface TableGeom {
  /** 可用宽（pt，栏宽 / 父格内容宽，未扣 tblInd）= TableWidthRange（:3242） */
  avail: number
  /** tblInd（pt） */
  ind: number
}

export interface TableCtx {
  /** 表格几何：默认 = 传入 avail，tblInd 直读 */
  geom?(t: Table, avail: number, depth: number): TableGeom
  /** 段落测量快照（调用方异步预热后同步供给；含 marker 伪 run 的偏移面） */
  pm(p: Paragraph): ParaMeasure
  /** 段尾标记字号（空段撑高） */
  markSz(p: Paragraph): number
  /** w:tblCellSpacing（pt；无 = undefined）。默认无 */
  spacing?(t: Table): number | undefined
  /** w:tblLayout。缺省 = autofit（ECMA + sdkjs Styles.js:11142 默认） */
  layout?(t: Table): 'autoFit' | 'fixed' | undefined
}

const ctxGeom = (ctx: TableCtx, t: Table, avail: number, depth: number): TableGeom =>
  ctx.geom ? ctx.geom(t, avail, depth) : { avail, ind: t.indL ?? 0 }

const autofitOf = (ctx: TableCtx, t: Table): boolean => (ctx.layout?.(t) ?? t.layout ?? 'autoFit') === 'autoFit'

const spacingOf = (ctx: TableCtx, t: Table): number | undefined => ctx.spacing?.(t) ?? t.cellSpacing

/** 单元格度量面（TableCell.js:990-1111 出口） */
export interface CellMM {
  /** 内容最小宽 + nAdd + spacing 附加 */
  min: number
  /** 内容最大宽 + nAdd + spacing 附加 */
  max: number
  /** 夹显式宽之前的 Min + spacing 附加（:1066 → minNoPref 来源） */
  contentMin: number
  /** nSpacingAdd + 左右 margin（:949，arrMinMargin 来源，不含边框） */
  margins: number
}

export interface GridArrays {
  minMargin: number[]
  minContent: number[]
  maxContent: number[]
  preferred: number[]
  minNoPref: number[]
}

export interface TableLayout {
  /** 最终列宽（pt） */
  cols: number[]
  /** 最终行高（pt，含边框/边距结算） */
  rows: number[]
  /** [ri][ci] 单元格内容度量 */
  cells: CellMM[][]
  /** [ri][ci] 单元格内容可用宽（断行 xLimit） */
  contentX: number[][]
  /** Phase 2 五数组（分配前快照） */
  arrays: GridArrays
  /** 表总宽 */
  sum: number
  /** 本次是否走了 Phase 2 内容分配 */
  autofit: boolean
}

// ── 边框 / 间距 / 显式宽原语 ───────────────────────────────────────────────

/** CSS 边框串（parser.borderCss 产物）→ 线宽 pt；'none'/缺失 = 0 */
export function bw(css: string | undefined): number {
  if (!css || css === 'none') return 0
  const w = parseFloat(css)
  return Number.isFinite(w) ? w : 0
}

const side = (c: TableCell, s: keyof CellBorders): number => bw(c.borders[s])

/** spacing 附加：首末格 1.5×、中间 1×（:948 / :370-379） */
const spacingAdd = (ci: number, n: number, sp: number | undefined): number =>
  sp === undefined ? 0 : ci === 0 || ci === n - 1 ? 1.5 * sp : sp

/** 单元格 nAdd（TableCell.js:1017-1061） */
function cellNAdd(c: TableCell, sp: number | undefined): number {
  const ml = c.pad[3]
  const mr = c.pad[1]
  if (sp !== undefined) return ml + mr + side(c, 'l') + side(c, 'r')
  return Math.max(ml, side(c, 'l') / 2) + Math.max(mr, side(c, 'r') / 2)
}

/** 显式宽结算（CTableMeasurement.GetCalculatedValue，Styles.js:10891）：dxa 直取，pct 按比例 */
function calcW(c: TableCell, pctW: number): number {
  if (c.w !== undefined) return c.w
  if (c.wPct !== undefined && pctW > 0) return (pctW * c.wPct) / 100
  return 0
}

/** 声明表宽结算（:297-317；auto/nil → 0） */
function calcTableW(t: Table, pctW: number): number {
  if (t.w !== undefined) return t.w
  if (t.wPct !== undefined && pctW > 0) return (pctW * t.wPct) / 100
  return 0
}

// ── 段落 / 单元格 min-max 内容宽（宽度无关） ───────────────────────────────

/**
 * ParaRun.RecalculateMinMaxContentWidth（Run.js:5683-5941）+ Paragraph 出口
 * （:2275-2317）的等价。词切分复用 wrap.ts splitWords（与断行引擎同一词面 →
 * min 宽 = 最长词，断行不越列）；splitWords 把空格并入前词尾，此处拆回：
 * 非空格前缀 = 词宽（结算入 min），空格后缀 = 缓存（不入 curMax，尾随不计）。
 * 对象占位 0xFFFC 按 pm.width 计宽（inline 图 = 图宽；域结果未知 = 0，同 flow 快照）。
 * para_Tab（:5875-5884）：tab 并入当前词后**立即结算入 min 并清词** → 词分隔符。
 * ponytail: para_Tab 的制表位宽未建模（记字符 advance）；升级 = tabs 面。
 */
export function paraMinMax(p: Paragraph, ctx: TableCtx): { min: number; max: number } {
  const pm = ctx.pm(p)
  // 文本面与 flow.ts 的快照同构：marker 作首伪 run，非文本 run 占 1 位（\uFFFC）
  let text = p.marker ? p.marker.text + (p.marker.tab ? '\t' : '') : ''
  for (const r of p.runs) text += r.t === 'text' || r.t === 'ref' ? r.text : '\uFFFC'
  let min = 0
  let max = 0
  let curMax = 0
  let spaceLen = 0
  const segs = text.split('\n')
  let base = 0
  for (let si = 0; si < segs.length; si++) {
    const cps = [...segs[si]!]
    const start = base
    base += cps.length + 1 // +1：\n 占位（末段越界无害）
    for (const [s0, e0] of splitWords(segs[si]!)) {
      // 拆词：[s0,ts) 非空格词干，[ts,e0) 空格后缀
      let ts = e0
      while (ts > s0 && cps[ts - 1] === ' ') ts--
      if (ts > s0) {
        if (cps.slice(s0, ts).includes('\t')) {
          // 词干含 tab：逐字切分结算（para_Tab :5875-5884 并入词后立即结算清词）
          let wordAcc = 0
          for (let k = s0; k < ts; k++) {
            const chW = pm.width(start + k, start + k + 1)
            if (spaceLen > 0) {
              curMax += spaceLen
              spaceLen = 0
            }
            curMax += chW
            wordAcc += chW
            if (cps[k] === '\t') {
              if (wordAcc > min) min = wordAcc
              wordAcc = 0
            }
          }
          if (wordAcc > min) min = wordAcc
        } else {
          const stemW = pm.width(start + s0, start + ts)
          if (stemW > min) min = stemW // :5718 词结算（空格到达 / 连字符后）
          if (spaceLen > 0) {
            curMax += spaceLen
            spaceLen = 0
          }
          curMax += stemW
        }
      }
      if (ts < e0) spaceLen += pm.width(start + ts, start + e0) // :5781 空格缓存，尾随不计 max
    }
    // para_NewLine / para_End（:5895-5925）：行结算 + 清缓存
    if (curMax > max) max = curMax
    curMax = 0
    spaceLen = 0
  }
  const ind = (p.ps.indL ?? 0) + (p.ps.indR ?? 0) + (p.ps.indFirst ?? 0)
  if (min > EPS || max > EPS) {
    min += ind
    max += ind
  }
  return { min: min > 0 ? min + 0.001 : 0, max: max > 0 ? max + 0.001 : 0 }
}

/** 表内块序列 min/max（DocumentContent.js:1393-1425：逐块 max，非求和） */
function blocksMinMax(blocks: Block[], ctx: TableCtx, depth: number, pctW: number): { min: number; max: number } {
  let min = 0
  let max = 0
  for (const b of blocks) {
    let r: { min: number; max: number }
    if (b.t === 'p') r = paraMinMax(b, ctx)
    else if (b.t === 'tbl') r = tableMinMax(b, ctx, depth + 1, pctW)
    else r = { min: 0, max: 0 }
    if (r.min > min) min = r.min
    if (r.max > max) max = r.max
  }
  return { min, max }
}

/**
 * CTableCell.RecalculateMinMaxContentWidth（:990-1111）：块 max → 0.1mm 下限 →
 * +nAdd → ContentMin 快照 → 显式宽夹（:1069-1086）。spacing 附加由列数组口径累加
 * （:951-952）。ponytail: noWrap（:1088-1101 ContentMin=Max 语义）无模型字段。
 */
export function cellMinMax(t: Table, ri: number, ci: number, ctx: TableCtx, depth: number, pctW: number): CellMM {
  const c = t.rows[ri]!.cells[ci]!
  const sp = spacingOf(ctx, t)
  const inner = blocksMinMax(c.blocks, ctx, depth, pctW)
  let min = inner.min
  let max = inner.max
  if (min < CELL_MIN_W) min = CELL_MIN_W
  const nAdd = cellNAdd(c, sp)
  min += nAdd
  max += nAdd
  const contentMin = min
  const pref = calcW(c, pctW)
  if (pref > 0) {
    if (min < pref) min = pref
    if (max < pref) max = pref
  }
  const sa = spacingAdd(ci, t.rows[ri]!.cells.length, sp)
  return {
    min: min + sa,
    max: max + sa,
    contentMin: contentMin + sa,
    margins: c.pad[3] + c.pad[1] + sa,
  }
}

// ── 网格定位（parser 折叠后无 gs 字段 → 前缀和唯一权威） ───────────────────

const gsOf = (t: Table, ri: number, ci: number): number => {
  let g = 0
  for (let k = 0; k < ci; k++) g += t.rows[ri]!.cells[k]!.colSpan
  return g
}

/** 网格列数 = max(声明网格, 各行跨度和)（:853-855 / :685） */
function gridCols(t: Table): number {
  let n = t.cols.length
  for (const row of t.rows) {
    let g = 0
    for (const c of row.cells) g += c.colSpan
    if (g > n) n = g
  }
  return Math.max(1, n)
}

/** 跨越列宽之和 */
export function spanWidth(colWs: number[], t: Table, ri: number, ci: number): number {
  const c = t.rows[ri]!.cells[ci]!
  let w = 0
  for (let k = gsOf(t, ri, ci); k < gsOf(t, ri, ci) + c.colSpan; k++) w += colWs[k] ?? 0
  return w
}

// ── Phase 1：固定网格 ─────────────────────────────────────────────────────

/** private_GetAdjustedTableGridToCells（:818-863） */
function adjustedGrid(t: Table, pctW: number): number[] {
  const grid: number[] = []
  for (const row of t.rows) {
    let g = 0
    for (const c of row.cells) {
      if (c.colSpan === 1) {
        while (grid.length <= g) grid.push(0)
        const w = calcW(c, pctW)
        if (w !== 0 && w > grid[g]!) grid[g] = w
      }
      g += c.colSpan
    }
  }
  while (grid.length < t.cols.length) grid.push(0)
  for (let i = 0; i < t.cols.length; i++) if (grid[i] === 0) grid[i] = t.cols[i]!
  return grid
}

/** 前缀和网格（sum[-1]=0 语义：a[0] ≡ sum[-1]） */
class SumGrid {
  a: number[] = [0]
  get(i: number): number {
    return i < 0 ? 0 : this.a[i + 1] ?? this.total()
  }
  set(i: number, v: number): void {
    if (i >= 0) this.a[i + 1] = v
  }
  /** 从 i 起全体 +diff（:332-335 / :385-387） */
  shiftFrom(i: number, diff: number): void {
    for (let k = Math.max(0, i); k < this.count(); k++) this.a[k + 1]! += diff
  }
  count(): number {
    return this.a.length - 1
  }
  /** 缺列补 20pt（:353-360） */
  ensure(idx: number): void {
    while (this.count() <= idx) this.a.push(this.total() + FILL_COL)
  }
  toCols(): number[] {
    const n = this.count()
    const out: number[] = []
    for (let i = 0; i < n; i++) out.push(this.a[i + 1]! - this.a[i]!)
    return out
  }
  total(): number {
    return this.a[this.a.length - 1]!
  }
}

const sumOf = (vals: number[]): SumGrid => {
  const s = new SumGrid()
  let acc = 0
  for (let i = 0; i < vals.length; i++) {
    acc += vals[i]!
    s.set(i, acc)
  }
  return s
}

/** private_GetTableMinWidth（Table.js:16439-16465） */
export function tableMinWidth(t: Table, sp: number | undefined): number {
  let min = 0
  for (const row of t.rows) {
    let w = (sp ?? 0) * (row.cells.length + 1)
    for (const c of row.cells) w += c.pad[3] + c.pad[1]
    if (w > min) min = w
  }
  return min
}

/** private_GetMinGrid（Table.js:16470-16538）：边距最小宽按 span 分组撑开 */
export function gridMinWidths(t: Table, sp: number | undefined, nCols: number): number[] {
  const sum = new SumGrid()
  for (let i = 0; i < nCols; i++) sum.set(i, 0)
  const bySpan: { col: number; w: number }[][] = []
  for (const row of t.rows) {
    let g = 0
    row.cells.forEach((c, ci) => {
      const s = c.colSpan
      const mw = c.pad[3] + c.pad[1] + spacingAdd(ci, row.cells.length, sp ?? 0)
      ;(bySpan[s] ??= []).push({ col: g, w: mw })
      g += s
    })
  }
  for (let s = 0; s < bySpan.length; s++) {
    const arr = bySpan[s]
    if (!arr) continue
    for (const { col, w } of arr) {
      const end = col + s - 1
      if (sum.get(end) < sum.get(col - 1) + w) {
        sum.ensure(end)
        sum.shiftFrom(end, sum.get(col - 1) + w - sum.get(end))
      }
    }
  }
  return sum.toCols()
}

/**
 * Internal_ScaleTableWidth（Table.js:16540-16608）：迭代比例压缩 ——
 * Koef = TableW/CurrentW 逐可缩放列乘；跌破 minGrid 的列锁死为最小值、退出集合、
 * 重算 Koef；直到全部满足或无可缩放列。
 */
export function scaleTableWidth(sum: SumGrid, tableW: number, minGrid: number[]): number[] {
  let grid = sum.toCols()
  const scalable: boolean[] = grid.map(() => true)
  let count = grid.length
  let currentW = sum.total()
  let targetW = tableW
  while (count > 0 && currentW > EPS) {
    const koef = targetW / currentW
    const cur = grid.map((w, i) => (scalable[i] ? w * koef : w))
    let brk = true
    for (let i = 0; i < cur.length; i++) {
      if (scalable[i]! && cur[i]! - (minGrid[i] ?? 0) < EPS) {
        brk = false
        scalable[i] = false
        count--
        currentW -= grid[i]!
        targetW -= minGrid[i] ?? 0
        grid[i] = minGrid[i] ?? 0
      }
    }
    if (brk) {
      for (let i = 0; i < cur.length; i++) if (scalable[i]) grid[i] = cur[i]
      break
    }
  }
  return grid
}

/** Phase 1（:259-440）：种子网格 → 逐行逐格撑开 → 声明宽 / MinWidth 缩放 → TableGridCalc */
function phase1Grid(t: Table, ctx: TableCtx, geom: TableGeom, pctW: number): number[] {
  const sp = spacingOf(ctx, t)
  const seed = adjustedGrid(t, pctW)
  let sum = sumOf(seed)
  const minWidth = tableMinWidth(t, sp)
  let nTableW = calcTableW(t, pctW)
  if (nTableW > 0) {
    if (nTableW < 0.001) nTableW = 0
    else if (nTableW < minWidth) nTableW = minWidth // :315-316
  }
  for (const row of t.rows) {
    let g = 0
    row.cells.forEach((c, ci) => {
      const span = c.colSpan
      sum.ensure(g + span - 1)
      const cw0 = calcW(c, pctW)
      if (cw0 > 0) {
        let cw = cw0
        if (sp !== undefined) {
          if (ci === 0) cw += sp / 2
          cw += sp
          if (ci === row.cells.length - 1) cw += sp / 2
        }
        if (cw + sum.get(g - 1) > sum.get(g + span - 1)) {
          sum.shiftFrom(g + span - 1, cw + sum.get(g - 1) - sum.get(g + span - 1)) // :381-388
        }
      }
      g += span
    })
  }
  // :420-423 缩放结算
  const minGrid = gridMinWidths(t, sp, sum.count())
  if (nTableW > 0 && Math.abs(sum.total() - nTableW) > 0.01) {
    sum = sumOf(scaleTableWidth(sum, nTableW, minGrid))
  } else if (minWidth > sum.total()) {
    sum = sumOf(scaleTableWidth(sum, sum.total(), minGrid))
  }
  return sum.toCols()
}

// ── Phase 2：AutoFit 内容约束 ──────────────────────────────────────────────

interface MergedEntry {
  start: number
  min: number
  max: number
  preferred: number
  margins: number
  grid: number
  minNoPref: number
}

/**
 * private_RecalculateGridMinContent（:864-1201）：逐行逐格累加五数组（span=1 直并，
 * span>1 入合并表）；合并首选宽按 span 升序迭代摊分（:1051-1090，一轮无进展即停）；
 * 合并列后处理按 margins→min→minNoPref→max 序撑开（:1092-1200，minNoPref 摊分用
 * 【撑开后】的 minContent 比例 —— :1165 原文如此）；出口 max≥min 夹 + 558.7mm 上限。
 * ponytail: gridBefore/gridAfter 宽撑开（:893-1048）无模型字段 → 忽略。
 */
function gridMinContent(t: Table, ctx: TableCtx, nCols: number, depth: number, pctW: number): GridArrays {
  const A: GridArrays = {
    minMargin: new Array(nCols).fill(0),
    minContent: new Array(nCols).fill(0),
    maxContent: new Array(nCols).fill(0),
    preferred: new Array(nCols).fill(0),
    minNoPref: new Array(nCols).fill(0),
  }
  const merged: MergedEntry[] = []
  const mergedPref: { start: number; w: number }[][] = []
  let prefCount = 0
  for (let ri = 0; ri < t.rows.length; ri++) {
    const row = t.rows[ri]!
    row.cells.forEach((c, ci) => {
      const gs = gsOf(t, ri, ci)
      const span = c.colSpan
      const mm = cellMinMax(t, ri, ci, ctx, depth, pctW)
      const preferred = calcW(c, pctW)
      if (span === 1) {
        if (A.minContent[gs]! < mm.min) A.minContent[gs] = mm.min // :962
        if (preferred && A.preferred[gs]! < preferred) A.preferred[gs] = preferred // :965
        if (A.preferred[gs]! > 0) A.maxContent[gs] = A.preferred[gs] // :968 首选覆盖
        else if (A.maxContent[gs]! < mm.max) A.maxContent[gs] = mm.max // :970
        if (A.minMargin[gs]! < mm.margins) A.minMargin[gs] = mm.margins // :973
        if (A.minNoPref[gs]! < mm.contentMin) A.minNoPref[gs] = mm.contentMin // :976
      } else if (span > 1) {
        merged.push({ start: gs, min: mm.min, max: mm.max, preferred, margins: mm.margins, grid: span, minNoPref: mm.contentMin })
        if (preferred > EPS) {
          ;(mergedPref[span] ??= []).push({ start: gs, w: preferred })
          prefCount++
        }
      }
    })
  }
  // :1051-1090 合并首选宽迭代
  while (prefCount > 0) {
    const prev = prefCount
    for (let span = 2; span < mergedPref.length; span++) {
      const arr = mergedPref[span]
      if (!arr) continue
      for (let idx = arr.length - 1; idx >= 0; idx--) {
        const start = arr[idx]!.start
        const pref = arr[idx]!.w
        let sumPref = 0
        for (let k = start; k < start + span - 1; k++) {
          if (A.preferred[k]! > 0) sumPref += A.preferred[k]!
          else {
            sumPref = -1
            break
          }
        }
        if (sumPref !== -1 && pref > sumPref && A.preferred[start + span - 1]! < pref - sumPref) {
          A.preferred[start + span - 1] = pref - sumPref
          if (A.minContent[start + span - 1]! < A.preferred[start + span - 1]!) A.minContent[start + span - 1] = A.preferred[start + span - 1]
          arr.splice(idx, 1)
          prefCount--
        }
      }
    }
    if (prev <= prefCount) break
  }
  // :1092-1200 合并列后处理
  for (const m of merged) {
    const { start, grid: span } = m
    let sMin = 0
    let sMax = 0
    let sMargin = 0
    let sMinNoPref = 0
    for (let k = start; k < start + span; k++) {
      sMin += A.minContent[k]!
      sMax += A.maxContent[k]!
      sMargin += A.minMargin[k]!
      sMinNoPref += A.minNoPref[k]!
    }
    if (m.margins > sMargin) {
      if (sMargin < EPS) for (let k = start; k < start + span; k++) A.minMargin[k] = m.margins / span
      else for (let k = start; k < start + span; k++) A.minMargin[k] = A.minMargin[k]! * m.margins / sMargin
    }
    if (m.min > sMin) {
      if (sMin < EPS) for (let k = start; k < start + span; k++) A.minContent[k] = m.min / span
      else for (let k = start; k < start + span; k++) A.minContent[k] = A.minContent[k]! * m.min / sMin
    }
    if (m.minNoPref > sMinNoPref) {
      if (sMin < EPS) for (let k = start; k < start + span; k++) A.minNoPref[k] = m.minNoPref / span
      else for (let k = start; k < start + span; k++) A.minNoPref[k] = A.minContent[k]! * m.minNoPref / sMin
    }
    if (m.max > sMax) {
      let sMax2 = 0
      for (let k = start; k < start + span; k++) if (A.preferred[k]! < EPS) sMax2 += A.maxContent[k]!
      if (sMax2 > EPS) {
        for (let k = start; k < start + span; k++) {
          if (A.preferred[k]! < EPS) {
            A.maxContent[k] = A.maxContent[k]! * (sMax - m.max + sMax2) / sMax2
            if (m.preferred > EPS) A.preferred[k] = A.maxContent[k]
          }
        }
      }
    }
  }
  // :468-482 max≥min 夹 + 上限
  for (let k = 0; k < nCols; k++) {
    if (A.maxContent[k]! < A.minContent[k]!) A.maxContent[k] = A.minContent[k]
    if (A.minNoPref[k]! > MAX_COL_W) A.minNoPref[k] = MAX_COL_W
    if (A.minContent[k]! > MAX_COL_W) A.minContent[k] = MAX_COL_W
    if (A.maxContent[k]! > MAX_COL_W) A.maxContent[k] = MAX_COL_W
  }
  return A
}

/**
 * Phase 2 分配（:550-811）：nMaxTableW 与 Σmin/Σmax/首选宽的六大分支。
 * declared = tblW 为 dxa/pct（:570 IsMM||IsPercent；auto/nil → false）。
 */
function allocate(t: Table, A: GridArrays, geom: TableGeom, nTableW: number): number[] {
  const n = A.minContent.length
  const cols = new Array<number>(n).fill(0)
  const maxOverMin: number[] = []
  let sumMaxOverMin = 0
  let sumMin = 0
  let sumMinMargin = 0
  let sumMax = 0
  for (let k = 0; k < n; k++) {
    maxOverMin[k] = Math.max(0, A.maxContent[k]! - A.minContent[k]!)
    sumMin += A.minContent[k]!
    sumMaxOverMin += maxOverMin[k]!
    sumMinMargin += A.minMargin[k]!
    sumMax += A.minContent[k]! + maxOverMin[k]!
  }
  const declared = t.w !== undefined || t.wPct !== undefined
  let maxTableW = geom.avail - geom.ind // :550
  const maxTableWOrigin = maxTableW
  if (declared && maxTableW < nTableW) maxTableW = nTableW // :570-571

  if (sumMin < maxTableW) {
    if (sumMax <= maxTableW || sumMaxOverMin < EPS) {
      for (let k = 0; k < n; k++) cols[k] = Math.max(A.minContent[k]!, A.maxContent[k]!) // :577-580
    } else {
      for (let k = 0; k < n; k++) cols[k] = A.minContent[k]! + ((maxTableW - sumMin) * maxOverMin[k]!) / sumMaxOverMin // :584-587
    }
    if (declared) {
      if (sumMin < EPS && sumMax < EPS) {
        for (let k = 0; k < n; k++) cols[k] = nTableW / n // :594-599 空表等分
      } else if (sumMin >= nTableW) {
        // :601-628 内容最小和超声明宽：按 minNoPref（无首选底线）摊分
        const prefOver: number[] = []
        let sumPrefOver = 0
        let sumMinContent = 0
        for (let k = 0; k < n; k++) {
          prefOver[k] = Math.max(0, A.minContent[k]! - A.minNoPref[k]!)
          sumPrefOver += prefOver[k]!
          sumMinContent += A.minNoPref[k]!
        }
        if (sumMinContent >= nTableW) for (let k = 0; k < n; k++) cols[k] = A.minNoPref[k]
        else for (let k = 0; k < n; k++) cols[k] = A.minNoPref[k]! + (prefOver[k]! * (nTableW - sumMinContent)) / sumPrefOver
      } else {
        // :630-706 有自由空间：首选列不动，只拉非首选列
        let sumNoPrefOver = 0
        let allPreferred = true
        let sumNonPrefMax = 0
        let sumPrefMin = 0
        let sumNoPrefMin = 0
        const noPrefOver: number[] = []
        for (let k = 0; k < n; k++) {
          if (A.preferred[k]! < EPS) {
            allPreferred = false
            const mn = A.minContent[k]!
            const mx = Math.max(A.maxContent[k]!, mn)
            noPrefOver[k] = mx - mn
            sumNoPrefOver += mx - mn
            sumNonPrefMax += mx
            sumNoPrefMin += mn
          } else {
            sumPrefMin += A.minContent[k]!
            noPrefOver[k] = 0
          }
        }
        if (allPreferred) {
          for (let k = 0; k < n; k++) cols[k] = (A.minContent[k]! * nTableW) / sumMin // :668-674
        } else if (sumNonPrefMax < maxTableW - sumMin && sumNonPrefMax > EPS) {
          for (let k = 0; k < n; k++) cols[k] = A.preferred[k]! < EPS ? (A.maxContent[k]! * (nTableW - sumPrefMin)) / sumNonPrefMax : A.minContent[k]!
        } else if (sumNoPrefOver > EPS) {
          for (let k = 0; k < n; k++) cols[k] = A.minContent[k]! + ((nTableW - sumMin) * noPrefOver[k]!) / sumNoPrefOver
        } else if (sumNoPrefMin > EPS) {
          for (let k = 0; k < n; k++) cols[k] = A.preferred[k]! < EPS ? (A.minContent[k]! * (nTableW - sumPrefMin)) / sumNoPrefMin : A.minContent[k]!
        }
      }
    }
  } else {
    // :709-810 内容最小和 ≥ 上限
    if (maxTableW - sumMinMargin < EPS) {
      for (let k = 0; k < n; k++) cols[k] = A.minMargin[k] // :714-719 margin 兜底
    } else {
      const prefOver: number[] = []
      let sumPrefOver = 0
      let sumMinContent = 0
      for (let k = 0; k < n; k++) {
        prefOver[k] = Math.max(0, A.minContent[k]! - A.minNoPref[k]!)
        sumPrefOver += prefOver[k]!
        sumMinContent += A.minNoPref[k]!
      }
      if (sumMinContent > maxTableW) {
        if (nTableW > maxTableWOrigin) {
          for (let k = 0; k < n; k++) cols[k] = A.minNoPref[k] // :737-743
        } else {
          const overMargin: number[] = []
          let sumOverMargin = 0
          for (let k = 0; k < n; k++) {
            overMargin[k] = Math.max(A.minNoPref[k]! - A.minMargin[k]!, 0)
            sumOverMargin += overMargin[k]!
          }
          if (sumOverMargin > EPS) {
            for (let k = 0; k < n; k++) cols[k] = A.minMargin[k]! + (overMargin[k]! * (maxTableW - sumMinMargin)) / sumOverMargin // :755-761
          }
        }
      } else if (declared && nTableW < sumMinContent) {
        for (let k = 0; k < n; k++) cols[k] = A.minNoPref[k] // :773-779
      } else {
        const target = declared ? nTableW : maxTableWOrigin // :782
        if (sumPrefOver > EPS) {
          for (let k = 0; k < n; k++) cols[k] = A.minNoPref[k]! + (prefOver[k]! * (target - sumMinContent)) / sumPrefOver // :793-798
        } else {
          for (let k = 0; k < n; k++) cols[k] = A.minNoPref[k] // :800-807
        }
      }
    }
  }
  return cols
}

// ── 行高结算 ───────────────────────────────────────────────────────────────

/**
 * 段落进格高（含 Before/After；行级切段留 P4）。flat run 面与 ctx.pm 快照同构
 * （flow.ts snapOf：marker 作首伪 run，非文本 run 占 1 位）—— 偏移序一致是
 * width(from,to) 正确的前提。
 */
function cellParaH(b: Paragraph, ctx: TableCtx, xLimit: number): number {
  const pm = ctx.pm(b)
  const runs: ParaRun[] = []
  if (b.marker) runs.push({ t: 'text', text: b.marker.text + (b.marker.tab ? '\t' : ''), sz: b.marker.s.sz })
  for (const r of b.runs) {
    const sz = 's' in r ? r.s.sz : undefined
    if (r.t === 'text' || r.t === 'ref') runs.push({ t: 'text', text: r.text, sz })
    else runs.push({ t: 'obj', sz })
  }
  // 格内缩进在内容区内再扣（sdkjs：Ind 于 X_content 范围内移位）
  const avail = Math.max(10, xLimit - (b.ps.indL ?? 0) - (b.ps.indR ?? 0))
  const L = layoutParagraph(runs, pm, { xLimit: avail, ps: b.ps, markSz: ctx.markSz(b) })
  return L.content + L.before + L.after
}

/** 格内块总高（段落 + 嵌套表行高和；sect 无形块 0）。嵌套表沿用父表 autofit 裁决（:443） */
function cellBlocksH(c: TableCell, ctx: TableCtx, xLimit: number, depth: number, parentAutofit: boolean): number {
  let h = 0
  for (const b of c.blocks) {
    if (b.t === 'p') h += cellParaH(b, ctx, xLimit)
    else if (b.t === 'tbl') h += layoutTable(b, ctx, xLimit, depth + 1, parentAutofit).rows.reduce((s, x) => s + x, 0)
  }
  return h
}

/**
 * 行高结算（:2690-3390）：
 *  rv = trHeight + MaxBotMargin[合并末行] + MaxTopMargin（:2719），有 spacing 减 spacing
 *  （:2723-2724），exact 再减顶边（:2727-2728）；
 *  exact → 行高 = rv +（无 spacing 回补顶边 :3379）；
 *  atLeast/auto → max(rv, 内容高) + 顶边（无 spacing :3376-3379）+ 底边（:3386-3389）；
 *  竖合并格内容不足 → 差额摊到合并末行（:3176-3190）。
 * ponytail: 无边距兜底 4.5mm（:3005-3006 全竖排行特例）与脚注限高不参与（无模型字段）；
 * 边框极值用折叠后的有效边框（spacing 行 sdkjs 用格自身边 :1304-1311，无 spacing 行走
 * 冲突解析 :1317-1338 —— parser 已折叠，两者同源近似）。
 */
function rowHeights(
  t: Table,
  ctx: TableCtx,
  cols: number[],
  depth: number,
  parentAutofit: boolean,
): { rows: number[]; cells: CellMM[][]; contentX: number[][] } {
  const sp = spacingOf(ctx, t)
  const nRows = t.rows.length
  const nCols = cols.length
  const maxTopMargin = new Array(nRows).fill(0)
  const botMarginEnd = new Array(nRows).fill(0)
  const maxTopBorder = new Array(nRows).fill(0)
  const maxBotBorder = new Array(nRows).fill(0)
  const cells: CellMM[][] = []
  const contentX: number[][] = []
  for (let ri = 0; ri < nRows; ri++) {
    const row = t.rows[ri]!
    const mmRow: CellMM[] = []
    const cxRow: number[] = []
    row.cells.forEach((c, ci) => {
      const end = Math.min(ri + c.rowSpan - 1, nRows - 1)
      if (c.pad[0] > maxTopMargin[ri]!) maxTopMargin[ri] = c.pad[0]
      if (c.pad[2] > botMarginEnd[end]!) botMarginEnd[end] = c.pad[2]
      const bt = side(c, 't')
      if (bt > maxTopBorder[ri]!) maxTopBorder[ri] = bt
      const bb = side(c, 'b')
      if (bb > maxBotBorder[end]!) maxBotBorder[end] = bb
      mmRow.push(cellMinMax(t, ri, ci, ctx, depth, 0))
      cxRow.push(Math.max(1, spanWidth(cols, t, ri, ci) - (sp ?? 0) - cellNAdd(c, sp)))
    })
    cells.push(mmRow)
    contentX.push(cxRow)
  }
  void nCols
  // 单格行内容高
  const needOf = (ri: number, ci: number): number => {
    const c = t.rows[ri]!.cells[ci]!
    return c.pad[0] + c.pad[2] + cellBlocksH(c, ctx, contentX[ri]![ci]!, depth, parentAutofit)
  }
  const content = new Array(nRows).fill(0)
  for (let ri = 0; ri < nRows; ri++) {
    const row = t.rows[ri]!
    row.cells.forEach((c, ci) => {
      if (c.rowSpan === 1) {
        const h = needOf(ri, ci)
        if (h > content[ri]!) content[ri] = h
      }
    })
  }
  // 竖合并：不足额摊到合并末行（:3176-3190 Diff 卷回语义的单遍近似）
  for (let ri = 0; ri < nRows; ri++) {
    const row = t.rows[ri]!
    row.cells.forEach((c, ci) => {
      if (c.rowSpan <= 1) return
      const end = Math.min(ri + c.rowSpan - 1, nRows - 1)
      let sum = 0
      for (let k = ri; k <= end; k++) sum += content[k]!
      const deficit = needOf(ri, ci) - sum
      if (deficit > 0) content[end]! += deficit
    })
  }
  const rows: number[] = []
  for (let ri = 0; ri < nRows; ri++) {
    const row = t.rows[ri]!
    const exact = row.exact === true && row.h !== undefined
    let rv = (row.h ?? 0) + botMarginEnd[ri]! + maxTopMargin[ri]! // :2719
    if (sp !== undefined) rv -= sp // :2723-2724
    if (exact) rv -= maxTopBorder[ri]! // :2727-2728
    let h: number
    if (exact) {
      h = rv + (sp === undefined ? maxTopBorder[ri]! : 0) // :3009 + :3379
    } else {
      h = Math.max(rv, content[ri]!) // :3289-3296
      if (sp === undefined) h += maxTopBorder[ri]! // :3376-3379
      h += maxBotBorder[ri]! // :3386-3389
    }
    rows.push(h)
  }
  return { rows, cells, contentX }
}

// ── 入口 ───────────────────────────────────────────────────────────────────

/**
 * 嵌套表内容度量（Table.js:3370-3475 非旋转支）：Σ minNoPref / Σ maxContent +
 * 声明表宽夹。度量链宽度无关 → 不需父 avail（pct 显式宽除外 → pctW=0 保守）。
 */
export function tableMinMax(t: Table, ctx: TableCtx, depth: number, pctW: number): { min: number; max: number } {
  const nCols = gridCols(t)
  const A = gridMinContent(t, ctx, nCols, depth, pctW)
  let min = 0
  let max = 0
  for (let k = 0; k < nCols; k++) {
    min += A.minNoPref[k]!
    max += A.maxContent[k]!
  }
  const declared = calcTableW(t, pctW)
  if (declared > 0) {
    if (min < declared) min = declared
    if (max < declared) max = declared
  }
  return { min, max }
}

/**
 * 表格全结算入口：Phase 1 固定网格 →（autofit：顶层看自身、嵌套看父表 :443）
 * Phase 2 内容分配 → 单元格内容宽 → 行高。
 * @param avail 可用宽（pt，栏宽或父格内容宽）
 * @param depth 嵌套深度（0 = 顶层）
 * @param parentAutofit 父表是否 autofit（嵌套表 Phase 2 的判据）
 */
export function layoutTable(t: Table, ctx: TableCtx, avail: number, depth = 0, parentAutofit = true): TableLayout {
  const geom = ctxGeom(ctx, t, avail, depth)
  const pctW = geom.avail // private_RecalculatePercentWidth（:3907，校=0）
  const autofit = depth === 0 ? autofitOf(ctx, t) : parentAutofit
  const cols0 = phase1Grid(t, ctx, geom, pctW)
  const nCols = Math.max(cols0.length, gridCols(t))
  const A = gridMinContent(t, ctx, nCols, depth, pctW)
  const sp = spacingOf(ctx, t)
  let nTableW = calcTableW(t, pctW)
  if (nTableW > 0 && nTableW < tableMinWidth(t, sp)) nTableW = tableMinWidth(t, sp)
  const cols = autofit ? allocate(t, A, geom, nTableW) : cols0
  const { rows, cells, contentX } = rowHeights(t, ctx, cols, depth, autofit)
  return { cols, rows, cells, contentX, arrays: A, sum: cols.reduce((s, x) => s + x, 0), autofit }
}
