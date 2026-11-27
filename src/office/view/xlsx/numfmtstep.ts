/**
 * 「增加/减少小数位数」的增量推导（Excel 语义）：
 * 从单元格当前 numFmt 出发，在小数段末尾 +0 / -0；整数段的千分位逗号、
 * 百分号、货币符号、日期等非数值段全部保留。读不到当前格式（新格 / 通用格式）
 * 时回落 Excel 同命令的默认起点：增加 → 0.0，减少 → 0。
 */

/** 小数段 = 第一个由 '.' 引导的 0/# 串（引号/转义内容先行剔除，索引与原串对齐） */
function decimalsOf(fmt: string): { start: number; end: number } | null {
  const clean = fmt.replace(/"[^"]*"/g, (s) => ' '.repeat(s.length)).replace(/\\\S/g, ' ')
  const dot = clean.indexOf('.')
  if (dot < 0) return null
  let end = dot + 1
  while (end < clean.length && (clean[end] === '0' || clean[end] === '#')) end++
  return end > dot + 1 ? { start: dot + 1, end } : null
}

/** d>0 增加一位、d<0 减少一位；已是边界时返回 null（= 不写格式） */
export function stepDecimalFmt(current: string | undefined, d: number): string | null {
  const base = current && current.trim() && current !== 'General' ? current : ''
  if (!base) return d > 0 ? '0.0' : '0'
  // 日期/时间格式（含 y/m/d/h/s 令牌）不参与小数位增减——Excel 同命令对它们就是空操作
  const literals = base.replace(/"[^"]*"/g, '').replace(/\\\S/g, '')
  if (/[ymdhsYMDHS]/.test(literals)) return null
  const dec = decimalsOf(base)
  if (!dec) {
    // 无小数段：增加 → 补 .0；减少 → 整数格式已是下限
    return d > 0 ? `${base}.0` : null
  }
  if (d > 0) return base.slice(0, dec.end) + '0' + base.slice(dec.end)
  if (dec.end - dec.start <= 1) return base.slice(0, dec.start - 1) + base.slice(dec.end)
  return base.slice(0, dec.end - 1) + base.slice(dec.end)
}
