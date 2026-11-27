/**
 * 插入图表的数据区规划（Excel 语义，报障 P18-B）：
 *  - 多格选区原样使用；
 *  - 单格选区 → 向外扩展「当前连续数据区」（同 Excel Ctrl+*：相邻行/列只要有任一非空格即并入，
 *    整行整列皆空即分隔停止；行列交替生长直到稳定）。
 * 纯函数：矩阵由调用方经内核 block 能力（readMatrix）取回，这里不发 RPC、不逐格扫全表。
 * 扩展后仍凑不出「至少两行数值」的可绘图数据时 chartDataOf 返回 null，由视图提示。
 */
import type { BlockOut } from '../../core/xlsx/types'
import type { Matrix } from './analysis'

export interface ChartRange { r0: number; c0: number; r1: number; c1: number }

const MAX_GROW_ROWS = 5000
const MAX_GROW_COLS = 100

const nonblank = (m: Matrix, r: number, c: number): boolean => {
  const row = m.m[r]
  return !!row && String(row[c] ?? '').trim() !== ''
}
/** 行 r 在列区间 [c0,c1] 内是否有任一非空格 */
const rowAny = (m: Matrix, r: number, c0: number, c1: number): boolean => {
  if (r < 0 || r > m.lastR) return false
  for (let c = c0; c <= c1; c++) if (nonblank(m, r, c)) return true
  return false
}
/** 列 c 在行区间 [r0,r1] 内是否有任一非空格 */
const colAny = (m: Matrix, c: number, r0: number, r1: number): boolean => {
  if (c < 0 || c > m.lastC) return false
  for (let r = r0; r <= r1; r++) if (nonblank(m, r, c)) return true
  return false
}

/** 单格 → 连续数据区；多格原样。活动格本身为空时不扩展（后续 chartDataOf 会给提示）。 */
export function chartSourceRange(g: ChartRange, m: Matrix): ChartRange {
  if (g.r0 !== g.r1 || g.c0 !== g.c1) return g
  if (!nonblank(m, g.r0, g.c0)) return g
  let r0 = g.r0, r1 = g.r0, c0 = g.c0, c1 = g.c0
  for (;;) {
    let grew = false
    while (r0 - 1 >= 0 && r1 - r0 + 1 < MAX_GROW_ROWS && rowAny(m, r0 - 1, c0, c1)) { r0--; grew = true }
    while (r1 + 1 <= m.lastR && r1 - r0 + 1 < MAX_GROW_ROWS && rowAny(m, r1 + 1, c0, c1)) { r1++; grew = true }
    while (c0 - 1 >= 0 && c1 - c0 + 1 < MAX_GROW_COLS && colAny(m, c0 - 1, r0, r1)) { c0--; grew = true }
    while (c1 + 1 <= m.lastC && c1 - c0 + 1 < MAX_GROW_COLS && colAny(m, c1 + 1, r0, r1)) { c1++; grew = true }
    if (!grew) break
  }
  return { r0, c0, r1, c1 }
}

/** 行块 → 区域矩阵（g 的相对坐标；缺格留空串位，保持宽高） */
export function matrixOfBlock(block: BlockOut, g: ChartRange): string[][] {
  const matrix: string[][] = Array.from({ length: g.r1 - g.r0 + 1 }, () => [])
  for (const row of block.rows) {
    if (row.r < g.r0 || row.r > g.r1) continue
    for (const v of row.cells) if (v[0] >= g.c0 && v[0] <= g.c1) matrix[row.r - g.r0][v[0] - g.c0] = String(v[1] ?? '')
  }
  return matrix
}
