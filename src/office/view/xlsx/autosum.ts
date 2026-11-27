/**
 * Excel 自动求和语义（Office 行为）：从选区推断「结果写哪里 + 写什么公式」。
 * 纯函数层，视图只负责读矩阵 / RPC 写回 / 选中目标格。
 *
 * 规则：
 *  - 单列多行 → 选区下方第一个空行写 =FN(列区域)（截图 G2:G20 → G21）
 *  - 单行多列 → 选区右侧一格写 =FN(行区域)
 *  - 单格 → 先探测上方连续数值，再探测左侧连续数值，命中则原位写公式
 *  - 孤立空格 → 返回 caret 模板 =FN()（vendored gridcraft 同款：光标落括号内）
 *  - 多行多列 → 每列各写一个结果
 */
import type { RibbonRange } from './ribbon-extra'

export interface AutoSumCell { r: number; c: number; input: string }
export interface AutoSumPlan { cells: AutoSumCell[]; caret?: string; /** 找不到空结果格时的提示（这些列跳过，绝不覆盖原数据） */ warn?: string }

/** 列号 → 列字母（A / AA …） */
const colName = (c: number) => {
  let s = ''
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}
const isNum = (s: string | undefined) =>
  !!s && !!s.trim() && !s.trim().startsWith('=') && Number.isFinite(Number(s.replace(/[,¥$\s%]/g, '')))

/** 从 start 往下找第一个空格；start 已在矩阵外 → 直接用（矩阵外的行必空）。
 *  扫描到末行仍无空格 → -1（调用方提示，绝不覆盖末行原数据——报障⑨根因）。 */
function emptyBelow(m: string[][], c: number, start: number) {
  if (start >= m.length) return start
  let r = start
  while (r < m.length && m[r]?.[c] && String(m[r][c]).trim()) r++
  return r < m.length ? r : -1
}

export function autoSumPlan(m: string[][], g: RibbonRange, fn = 'SUM'): AutoSumPlan {
  const name = /^[A-Za-z]+$/.test(fn) ? fn.toUpperCase() : 'SUM'
  const a1 = (r: number, c: number) => `${colName(c)}${r + 1}`
  const span = (r0: number, c0: number, r1: number, c1: number) =>
    r0 === r1 && c0 === c1 ? a1(r0, c0) : `${a1(r0, c0)}:${a1(r1, c1)}`
  const cell = (r: number, c: number, r0: number, c0: number, r1: number, c1: number): AutoSumCell =>
    ({ r, c, input: `=${name}(${span(r0, c0, r1, c1)})` })
  const skipped: string[] = []
  const push = (r: number, c: number, r0: number, c0: number, r1: number, c1: number, cells: AutoSumCell[]) => {
    if (r < 0) { skipped.push(a1(r1 + 1, c)); return }
    cells.push(cell(r, c, r0, c0, r1, c1))
  }
  const warnOf = (cells: AutoSumCell[]): AutoSumPlan =>
    ({ cells, warn: skipped.length ? `以下列紧邻数据被占满，找不到空的求和格，已跳过：${skipped.join('、')}` : undefined })

  if (g.c0 === g.c1 && g.r0 !== g.r1) {
    const cells: AutoSumCell[] = []
    push(emptyBelow(m, g.c0, g.r1 + 1), g.c0, g.r0, g.c0, g.r1, g.c0, cells)
    return warnOf(cells)
  }
  if (g.r0 === g.r1 && g.c0 !== g.c1)
    return { cells: [cell(g.r0, g.c1 + 1, g.r0, g.c0, g.r0, g.c1)] }
  if (g.r0 === g.r1 && g.c0 === g.c1) {
    const r = g.r0
    const c = g.c0
    let top = r - 1
    while (top >= 0 && isNum(m[top]?.[c])) top--
    if (top < r - 1) return { cells: [cell(r, c, top + 1, c, r - 1, c)] }
    let left = c - 1
    while (left >= 0 && isNum(m[r]?.[left])) left--
    if (left < c - 1) return { cells: [cell(r, c, r, left + 1, r, c - 1)] }
    return { cells: [], caret: `=${name}()` }
  }
  const cells: AutoSumCell[] = []
  for (let c = g.c0; c <= g.c1; c++) push(emptyBelow(m, c, g.r1 + 1), c, g.r0, c, g.r1, c, cells)
  return warnOf(cells)
}
