/**
 * 序列 / 填充递推的纯函数层（从 editor.ts 拆出，行为不变）。
 * 日期序列换算、第 i 步序列值、拖拽填充的线性趋势步长都在这里；editor.ts 只做单元格写回编排。
 *
 * 两套 Excel 日期系统：
 *  - 1900 系统：serial 1 = 1900-01-01；Excel 错把 1900 当年闰，serial 60 = 虚构的 1900-02-29，
 *    serial 61 = 1900-03-01 起才与真实公历一致。JS Date 没有 1900-02-29 这一天，故
 *    1900-02-28 → serial 59、1900-03-01 → serial 61，二者之间不存在可表示的真实日期。
 *  - 1904 系统：serial 0 = 1904-01-01，与 1900 系统相差 1462 天，且没有虚构闰日。
 */
import { serialToDate } from './numfmt'
import type { SeriesType, SeriesUnit } from './types'

/** UTC Date → 日期序列值（serialToDate 的逆换算）。 */
export function dateToSerial(dt: Date, date1904: boolean): number {
  if (date1904) return (dt.getTime() - Date.UTC(1904, 0, 1)) / 86400000
  // 相对 1899-12-30 的天数 d：真实 1900-02-28 → d=60，1900-03-01 → d=61。
  // d ≤ 60 用 1899-12-31 基准（serial = d-1，落在 1..59）；d ≥ 61 时 serial = d。
  // 于是 1900-02-28=59、1900-03-01=61，正好跳过 Excel 虚构的 serial 60；与 serialToDate 互逆。
  const d1900 = (dt.getTime() - Date.UTC(1899, 11, 30)) / 86400000
  return d1900 <= 60 ? d1900 - 1 : d1900
}

/** 序列对话框的日期递推：第 i 步（i≥1）的序列值。工作日跳过周末；月/年溢出回退到月末（1/31 + 1月 → 2/28） */
export function dateStepValue(start: number, unit: SeriesUnit, step: number, i: number, date1904: boolean): number {
  if (unit === 'day') return start + step * i
  if (unit === 'weekday') {
    // 周六/周日在两套系统里的 serial%7 基准相差 1462 天（1462%7=6）：
    // 1900 系统 25569(1970-01-01 周四)%7=5 → 周六=0、周日=1；
    // 1904 系统 → 周六=1、周日=2。用纯 serial 递推可避开 1900 虚构闰日的 Date 往返。
    const sat = date1904 ? 1 : 0
    const sun = date1904 ? 2 : 1
    let v = start
    for (let k = 0; k < Math.max(1, Math.round(step)) * i; k++) {
      v += 1
      const wd = ((v % 7) + 7) % 7
      if (wd === sat) v += 2       // 周六 → 周一
      else if (wd === sun) v += 1  // 周日 → 周一
    }
    return v
  }
  const dt = serialToDate(start, date1904)
  const day = dt.getUTCDate()
  if (unit === 'month') dt.setUTCMonth(dt.getUTCMonth() + step * i)
  else dt.setUTCFullYear(dt.getUTCFullYear() + step * i)
  if (dt.getUTCDate() !== day) dt.setUTCDate(0)
  return dateToSerial(dt, date1904)
}

/** 「序列」第 i 步的值（i≥0）：等差 start + step*i、等比 start*step^i、日期按单位递增 */
export function seriesValueAt(start: number, type: SeriesType, unit: SeriesUnit, step: number, i: number, date1904: boolean): number {
  if (type === 'growth') return start * Math.pow(step || 1, i)
  if (type === 'date') return dateStepValue(start, unit, step, i, date1904)
  return start + step * i
}

/** 拖拽「以序列方式填充」的线性步长：源区段首尾差 / 跨度；up/left 沿填充方向反号。非数值回退 null（按复制处理） */
export function fillTrendStep(a: number | null, b: number | null, span: number, backward: boolean): number | null {
  if (a === null || b === null) return null
  // 单格源没有趋势可推：Office 式默认沿填充方向 ±1 递增
  if (span <= 0) return backward ? -1 : 1
  return (backward ? a - b : b - a) / span
}
