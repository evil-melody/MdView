/**
 * 插入函数向导的循环引用检测（Excel 语义，报障 P18-C）：
 * 公式写进目标格之前，用内核公式引擎（parseFormula → references）枚举静态引用，
 * 任一引用解析后覆盖目标格 → 判定循环：弹「循环引用」警告且不落格（Excel 同语义，
 * 旧实现直接写入 → 求值 #REF! 静默落格）。区域引用判**包含关系**不只判相等
 * （=SUM(C1:C20) 写进 C12 同样是循环）。跨表引用（限定名 ≠ 本表）不构成自引用。
 * INDIRECT/OFFSET 的动态引用静态枚举不到，与 Excel 检测边界一致。
 */
import { parseFormula, references, type CellRef, type RangeRef } from '../../core/xlsx/formula'

export interface CircTarget { r: number; c: number }

/** formula 的任一（本表）引用覆盖 {r,c} 时返回该引用的 A1 文本，否则 null */
export function circularRef(formula: string, sheetName: string, target: CircTarget): string | null {
  let ast
  try {
    ast = parseFormula(formula)
  } catch {
    return null // 语法错误交给内核求值报错，不在这里拦
  }
  for (const ref of references(ast)) {
    if (ref.sheet && ref.sheet.toLowerCase() !== sheetName.toLowerCase()) continue
    const r0 = 'r' in ref ? ref.r : ref.r0
    const r1 = 'r' in ref ? ref.r : ref.r1
    const c0 = 'r' in ref ? ref.c : ref.c0
    const c1 = 'r' in ref ? ref.c : ref.c1
    if (target.r >= Math.min(r0, r1) && target.r <= Math.max(r0, r1) &&
        target.c >= Math.min(c0, c1) && target.c <= Math.max(c0, c1))
      return refText(ref)
  }
  return null
}

const COL = (c: number) => {
  let s = ''
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}
const a1 = (r: number, c: number) => `${COL(c)}${r + 1}`

function refText(ref: CellRef | RangeRef): string {
  return 'r' in ref ? a1(ref.r, ref.c) : `${a1(ref.r0, ref.c0)}:${a1(ref.r1, ref.c1)}`
}
