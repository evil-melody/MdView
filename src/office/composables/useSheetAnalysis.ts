/**
 * Excel「数据分析」簇的编排（分类汇总 / 数据透视表 / 大纲折叠）——从 OfficeSheetView 抽离，
 * 保持视图 ≤2000 行。计算在 view/xlsx/analysis（纯函数），这里只做对话框状态与 RPC 编排
 * （插行 / 写值 / 加粗 / hideRows 大纲）。
 * 报障③：分类汇总的字段探测与写回范围恒用全表区——Excel 语义作用于整个数据列表，
 * 不收窄到当前选区（单选数值列单格时找不到文本分组列 → 误报「未找到数值列」）。
 */
import { reactive, shallowRef } from 'vue'
import {
  AGGS, computePivot, computeSubtotal, guessFields, inferFields, sheetFields,
  type Matrix, type OutlineGroup, type SheetFieldInfo
} from '../view/xlsx/analysis'
import { officeAlert } from '../components/officePrompt'

type Grid = { r0: number; c0: number; r1: number; c1: number }

export interface SheetAnalysisCtx {
  /** 读全表矩阵（视图 readAll = readMatrix(client, sheet, progress.rows)） */
  readAll: () => Promise<Matrix>
  /** 表结构操作（插行 / hideRows），视图侧带缓存失效与重绘 */
  sheetOp: (op: Record<string, unknown>) => Promise<unknown>
  /** 批量写值（视图 commands.setCells，单格走验证门、批量不拦的语义在视图） */
  setCells: (cells: { r: number; c: number; input: string }[]) => Promise<void>
  /** 区域格式写回（xlsx.format） */
  format: (g: Grid, patch: Record<string, unknown>) => Promise<unknown>
  /** 格式写回后的本地刷新（blockCache 失效 + loadVisible） */
  refresh: () => void
  /** 滚动到指定格 */
  reveal: (r: number, c: number) => void
  /** 无数据提示（视图 noData，文案与其余分析命令同源） */
  noData: (name: string) => void
  /** 当前范围选区（透视默认字段猜测用） */
  range: () => Grid
}

export function useSheetAnalysis(ctx: SheetAnalysisCtx) {
  /** 分类汇总大纲：前端 hideRows 模拟，非真 xlsx 大纲（需内核 group RPC 才能落盘）。
   *  groups 存每组明细行区间 + 小计行（最终行号）；点击 +/- 或级别按钮折叠/展开明细行（小计行保持可见）。 */
  const outline = reactive({ active: false, groups: [] as OutlineGroup[], total: -1, level: 2 })

  async function fmtRangeCells(r0: number, c0: number, r1: number, c1: number, patch: Record<string, unknown>) {
    await ctx.format({ r0, c0, r1, c1 }, patch)
    ctx.refresh()
  }
  async function applyOutline() {
    for (const grp of outline.groups) {
      if (!grp.detail.length) continue
      await ctx.sheetOp({ op: 'hideRows', a: grp.detail[0], b: grp.detail[grp.detail.length - 1], hidden: grp.collapsed })
    }
  }
  function toggleGroup(i: number) {
    const grp = outline.groups[i]
    if (!grp) return
    grp.collapsed = !grp.collapsed
    void applyOutline()
  }
  function setLevel(L: number) {
    outline.level = L
    for (const grp of outline.groups) grp.collapsed = grp.level >= L
    void applyOutline()
  }

  /** Excel「数据>分级>组合」（报障⑧）：选区各行并成一组大纲（落 hideRows，行头出 −/+ 折叠柄）。
   *  折叠柄放在组尾下一行（Excel 同款：+/− 作用于其上方的组）。 */
  async function group(g: Grid): Promise<{ ok: boolean; msg: string }> {
    if (g.r1 <= g.r0) return { ok: false, msg: '组合：请先选中要分组的连续多行' }
    const detail: number[] = []
    for (let r = g.r0; r <= g.r1; r++) detail.push(r)
    outline.groups.push({ key: `组${outline.groups.length + 1}`, detail, subtotal: g.r1 + 1, level: 1, collapsed: false })
    outline.active = true
    if (outline.level < 2) outline.level = 2
    await applyOutline()
    return { ok: true, msg: `组合：第 ${g.r0 + 1}-${g.r1 + 1} 行已分为一组（行头 −/+ 折叠）` }
  }
  /** 「取消组合」：移除与选区重叠的大纲组并恢复其明细行显示。 */
  async function ungroup(g: Grid): Promise<{ ok: boolean; msg: string }> {
    const hit = outline.groups.filter((gp) => gp.detail.some((r) => r >= g.r0 && r <= g.r1))
    if (!hit.length) return { ok: false, msg: '取消组合：选区里没有已组合的行' }
    for (const gp of hit) {
      await ctx.sheetOp({ op: 'hideRows', a: gp.detail[0], b: gp.detail[gp.detail.length - 1], hidden: false })
    }
    outline.groups = outline.groups.filter((gp) => !hit.includes(gp))
    if (!outline.groups.length) outline.active = false
    return { ok: true, msg: `取消组合：已移除 ${hit.length} 组并恢复行显示` }
  }

  /** 分类汇总对话框：打开时快照矩阵，确认后按用户选择写回 */
  let subCtx: Matrix | null = null
  const subtotalDlg = shallowRef<{ fields: SheetFieldInfo[]; initial: { groupCol: number; agg: string; valueCols: number[] } } | null>(null)
  /** 分类汇总（Office 式对话框）：字段推断后弹出面板，用户选定分组列/方式/汇总项/方向 */
  async function openSubtotal() {
    const d = await ctx.readAll()
    if (d.lastR < 1 || d.lastC < 0) return ctx.noData('分类汇总')
    // 报障③：字段探测恒用全表区（对话框字段清单铺满全表列，与写回范围同口径）
    const g = { r0: 0, c0: 0, r1: d.lastR, c1: d.lastC }
    const { gc, vcs } = inferFields(d, g)
    if (!vcs.length) return void officeAlert('分类汇总', '未找到数值列，请选中含数据的区域或改列')
    subCtx = d
    subtotalDlg.value = { fields: sheetFields(d), initial: { groupCol: gc, agg: '求和', valueCols: vcs } }
  }
  async function onSubtotalConfirm(p: { groupCol: number; agg: string; valueCols: number[]; below: boolean }) {
    const d = subCtx
    subCtx = null
    subtotalDlg.value = null
    if (d) await runSubtotal(d, p.groupCol, AGGS[p.agg] ?? 'sum', p.valueCols, p.below)
  }
  /** 分类汇总写回编排：计算在 view/xlsx/analysis.computeSubtotal，这里只做 RPC（插行/写值/加粗/大纲） */
  async function runSubtotal(d: Matrix, gcol: number, how: string, vcs: number[], below: boolean) {
    if (!vcs.length) return void officeAlert('分类汇总', '请至少选择一个汇总项')
    // 报障③：写回范围与探测范围同口径 = 整个数据列表
    const g = { r0: 0, c0: 0, r1: d.lastR, c1: d.lastC }
    const plan = computeSubtotal(d, g, gcol, how, vcs, below)
    if (!plan.ok) return void officeAlert('分类汇总', '没有可汇总的数据行')
    for (const job of plan.jobs) {
      await ctx.sheetOp({ op: 'insertRows', at: job.at, n: 1 })
      await ctx.setCells(job.cells.map((x) => ({ ...x, r: job.at })))
      await fmtRangeCells(job.at, plan.left, job.at, plan.right, { b: true })
    }
    outline.groups = plan.outline
    outline.total = plan.total
    outline.active = true
    outline.level = 2
    ctx.reveal(plan.top, gcol)
  }

  /** 数据透视表对话框：打开时快照矩阵（guessFields 提供默认摆放） */
  let pivotCtx: Matrix | null = null
  const pivotDlg = shallowRef<{ fields: SheetFieldInfo[]; initial: { rows: number[]; cols: number[]; values: { c: number; agg: string }[] } } | null>(null)
  /** 数据透视表（Office 式字段面板）：默认按 guessFields 预填，用户调整行/列/值后生成交叉表 */
  async function openPivot() {
    const d = await ctx.readAll()
    if (d.lastR < 1 || d.lastC < 0) return ctx.noData('数据透视表')
    const f = guessFields(d, ctx.range())
    pivotCtx = d
    pivotDlg.value = {
      fields: sheetFields(d),
      initial: {
        rows: [f.gc],
        cols: [f.gc + 1 <= d.lastC ? f.gc + 1 : Math.max(0, f.gc - 1)],
        values: [{ c: f.vc, agg: '求和' }]
      }
    }
  }
  async function onPivotConfirm(p: { rows: number[]; cols: number[]; values: { c: number; agg: string }[] }) {
    const d = pivotCtx
    pivotCtx = null
    pivotDlg.value = null
    if (d) await runPivot(d, p.rows, p.cols, p.values.map((v) => ({ c: v.c, agg: AGGS[v.agg] ?? 'sum' })))
  }
  /** 透视写回编排：计算在 view/xlsx/analysis.computePivot（交叉表 + 总计），这里只写回 */
  async function runPivot(d: Matrix, rowFs: number[], colFs: number[], valFs: { c: number; agg: string }[]) {
    const plan = computePivot(d, rowFs, colFs, valFs)
    if (!plan.ok) {
      if (plan.reason === 'valueField') return void officeAlert('数据透视表', '请至少放置一个值字段')
      return void officeAlert('数据透视表', '指定的字段没有数据，请把选区放在数据区域内或改字段名')
    }
    await ctx.setCells(plan.cells)
    ctx.reveal(0, plan.start)
  }

  return {
    outline, setLevel, toggleGroup, group, ungroup,
    subtotalDlg, openSubtotal, onSubtotalConfirm,
    pivotDlg, openPivot, onPivotConfirm
  }
}
