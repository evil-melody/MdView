/**
 * 序列公式化（第九批）：把「序列…」对话框与「以序列方式填充」的结果从静态值升级为
 * 真实 OOXML 公式（相对引用 + T_NUM 缓存值），源格改动后由 calc.ts 自动重算跟随。
 *
 * 纯函数层，无 IO / 无内核依赖；由 editor.ts 的 seriesCells() / fill() 调用，
 * 使已贴顶的 editor.ts（1993 行）不必再增长。
 *
 * 写入约定（与 parseInput / translateFormula / rowpatch.cellXml 一致）：
 *  - d.formulas 里存的是**不带前导 '='** 的公式文本；xlsx.cell 读回时才拼 '='。
 *  - 目标格落 T_NUM + 缓存值；recalc 后 calc.store() 会用引擎值覆写并保留样式槽。
 *  - 日期序列必须用 T_NUM + 起始格的日期 numFmt 样式：内核 T_DATE 是 ISO 字符串语义，
 *    block 会对数值调 .replace 抛错，故绝不能把公式结果写成 T_DATE。
 */

import type { SeriesType, SeriesUnit } from './types'
import { a1, seriesFormulaAt } from './fillformula'

/** seriesFormulaAt 返回展示用 `=A1+1`；d.formulas 存的是去掉前导 '=' 的裸文本。 */
const bare = (text: string) => (text.startsWith('=') ? text.slice(1) : text)

export interface SeriesCellSpec {
  type: SeriesType
  unit: SeriesUnit
  /** 实际步长（auto 类型已由调用方从第二格推导出来） */
  step: number
  /** 本行/列的序列起点（0 基） */
  sr: number
  sc: number
  /** 当前格坐标（0 基） */
  r: number
  c: number
  /** 当前格在序列中的序号，起点为 0，第一个目标格为 1 */
  i: number
  /** 序列布局方向：'col' 纵向、'row' 横向 */
  dir: 'col' | 'row'
  /** 起点是 T_DATE（ISO 字符串）时不能写公式：引擎 value() 会把它当字符串 */
  srcIsIsoDate?: boolean
}

/**
 * 目标格应写的公式文本（无 '='）。
 * 返回 null 表示引擎无法精确复现静态语义 —— 调用方保留静态值，绝不写“看起来像公式”的错值。
 *
 * 方案：
 *  - linear / auto：链式引用序列前一格 `=A1+step`、`=A2+step`…（Excel 填充柄的惯用法）。
 *  - growth：链式 `=A1*ratio`、`=A2*ratio`…，等于 start*ratio^i。
 *  - date/day：同样按 serial 链式 `=A1+step`（保留起始格日期 numFmt）。
 *  - date/month、date/year：必须**从起点**计算（EDATE 自带月末回退）。链式 EDATE 会让
 *    1/31 → 2/28 → 3/28，丢掉静态语义的 3/31；起点格用相对引用，整段平移时引用随格一起平移。
 *  - date/weekday：引擎无 WORKDAY，链式表达式只能精确表达 step=1，其余会偏离
 *    「从起点推进 step*i 个工作日」的静态语义，故保留静态值（Excel 工作日序列本身也是静态日期）。
 */
export function seriesCellFormula(s: SeriesCellSpec): string | null {
  if (s.srcIsIsoDate) return null
  // 链式相对引用由第六批纯函数层生成：=A1+step / =A1*ratio（前一格随方向自动判定）；
  // 整段搬移、插删行列时 translateFormula / shiftFormula 会同步平移，链结构保持不变。
  const chained = (kind: 'arith' | 'growth') => bare(seriesFormulaAt(kind, s.step, s.sr, s.sc, s.r, s.c))
  if (s.type === 'growth') return chained('growth')
  if (s.type === 'date') {
    if (s.unit === 'day') return chained('arith') // 日期 serial 的 `=A1+1`
    if (s.unit === 'month' || s.unit === 'year') {
      const months = (s.unit === 'year' ? 12 : 1) * s.step * s.i
      return `EDATE(${a1(s.sr, s.sc)},${months})`
    }
    return null // weekday：引擎无 WORKDAY，保留静态值
  }
  return chained('arith') // linear / auto
}

/**
 * 「以序列方式填充」目标格的公式：引用填充方向上的前一格（源边格或已填好的上一目标格）。
 * step 为 fillTrendStep() 给出的**带符号**趋势步长（向上/向左填充时为负）。
 */
export function fillSeriesFormula(
  dir: 'down' | 'up' | 'right' | 'left',
  r: number,
  c: number,
  step: number,
): string {
  // 把「填充方向前一格」伪装成 seriesFormulaAt 的 start：目标在后 → 引前一格，目标在前 → 引后一格。
  const sr = dir === 'down' ? r - 1 : dir === 'up' ? r + 1 : r
  const sc = dir === 'right' ? c - 1 : dir === 'left' ? c + 1 : c
  return bare(seriesFormulaAt('arith', step, sr, sc, r, c))
}
