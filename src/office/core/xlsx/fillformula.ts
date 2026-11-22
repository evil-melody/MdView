/**
 * 填充 / 序列「写公式」的纯函数层（core/xlsx/fillformula.ts）。
 *
 * 背景（第六批调查结论）：
 *  - 「拖拽填充柄 → 相对引用平移后的公式」这条链路内核**已经实现**（editor.fill → translateFormula），
 *    本模块不重复实现，只把「相对引用生成」这件事显式化，便于独立验证与后续方案复用。
 *  - 「序列…」对话框与「以序列方式填充」自第九批起写**真实相对引用公式**（A2=`=A1+1`、
 *    A3=`=A2+1` …），由 core/xlsx/seriesformula.ts 调用本模块的 a1() 生成引用，源格改动后自动重算跟随。
 *  - 「拖拽填充柄」的**默认复制**（copyValues）仍按 Excel 语义：数值源写静态值、公式源写平移后的公式；
 *    v29 的 `numericFillStaysStatic` 守的就是这条边界，不受序列公式化影响。
 *
 * 纯函数，无内核/IO 依赖，可在探针里逐条断言。
 */
import { colName, translateFormula } from './formula'

/** 单元格地址文本：A1 / $A$1（absR 行绝对、absC 列绝对）。行列号 0 基。 */
export function a1(r: number, c: number, absR = false, absC = false): string {
  return `${absC ? '$' : ''}${colName(c)}${absR ? '$' : ''}${r + 1}`
}

/**
 * 相对引用生成器：源格引用在**目标格**里「长什么样」。
 * 相对部分按 (dstR-srcR, dstC-srcC) 平移，绝对部分（$）不动 —— 与内核 translateFormula 的规则一致。
 * 例：src=A1 → dst=A2 得 'A2'；src=A1 → dst=B1 得 'B1'；绝对引用两种情况都是 '$A$1'。
 */
export function shiftedRef(srcR: number, srcC: number, dstR: number, dstC: number, absR = false, absC = false): string {
  const r = absR ? srcR : srcR + (dstR - srcR)
  const c = absC ? srcC : srcC + (dstC - srcC)
  return a1(r, c, absR, absC)
}

/** 序列公式的种类：等差（+step）/ 等比（×step）。 */
export type FillSeriesKind = 'arith' | 'growth'

/** 步长文本：整数不带小数点（1 / -1），小数照原样（1.5 / 0.25）。 */
export function stepText(step: number): string {
  return String(step)
}

/**
 * 链式序列公式：目标格引用**序列的前一格**（不是源格）。
 *  向下填（目标行更大）→ 引用上一行；向右填（目标列更大）→ 引用左边一格；
 *  向上/向左填（目标在源之上/左）→ 引用下一行/右边一格（方向相反）。
 *  例：等差 step=1 → '=A1+1'；等比 step=2 → '=A1*2'；再往下一格 → '=A2+1' / '=A2*2'。
 */
export function seriesFormulaAt(
  kind: FillSeriesKind,
  step: number,
  startR: number,
  startC: number,
  targetR: number,
  targetC: number,
): string {
  const byRow = targetR !== startR
  const prevR = byRow ? (targetR > startR ? targetR - 1 : targetR + 1) : targetR
  const prevC = byRow ? targetC : (targetC > startC ? targetC - 1 : targetC + 1)
  const ref = a1(prevR, prevC)
  return kind === 'growth' ? `=${ref}*${stepText(step)}` : `=${ref}+${stepText(step)}`
}

/**
 * 一整段序列的公式（不含起点格）：从 startR/startC 沿 dir 方向 count 个目标格的公式文本。
 * 例：seriesFormulaList('arith', 1, 0, 0, 'down', 3) → ['=A1+1', '=A2+1', '=A3+1']。
 */
export function seriesFormulaList(
  kind: FillSeriesKind,
  step: number,
  startR: number,
  startC: number,
  dir: 'down' | 'up' | 'right' | 'left',
  count: number,
): string[] {
  const out: string[] = []
  for (let i = 1; i <= count; i++) {
    const r = dir === 'down' ? startR + i : dir === 'up' ? startR - i : startR
    const c = dir === 'right' ? startC + i : dir === 'left' ? startC - i : startC
    out.push(seriesFormulaAt(kind, step, startR, startC, r, c))
  }
  return out
}

/**
 * 拖拽填充时把源公式按 (dr, dc) 平移（相对引用递增、$ 绝对引用不动）。
 * 转调内核公式层，保持单一实现（editor.fill 用的就是它）。
 */
export function shiftFillFormula(text: string, dr: number, dc: number): string {
  return translateFormula(text, dr, dc)
}
