/** Date & time functions (serial numbers; 1900 system with Lotus bug or 1904). */
import { dateToSerial, daysInMonth, serialSeconds, serialToYmd, ymdToSerial } from './dates'
import { A, nums, opt, S, type FnDef } from './fn'
import { ERR, type Value } from './types'
import { num, str } from './values'

function serial(v: Value): number {
  const n = num(v)
  if (n < 0) throw ERR.NUM
  return n
}
const day = (v: Value) => Math.floor(serial(v))

function addMonths(start: number, months: number, eom: boolean): number {
  const p = serialToYmd(start)
  const total = p.y * 12 + (p.m - 1) + Math.trunc(months)
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  const d = eom ? daysInMonth(y, m) : Math.min(p.d, daysInMonth(y, m))
  const s = ymdToSerial(y, m, d)
  if (s < 0) throw ERR.NUM
  return s
}

const WEEKDAY_START: Record<number, [number, number]> = {
  // type: [day the week starts on (0=Sun), number of the first day]
  1: [0, 1],
  2: [1, 1],
  3: [1, 0],
  11: [1, 1],
  12: [2, 1],
  13: [3, 1],
  14: [4, 1],
  15: [5, 1],
  16: [6, 1],
  17: [0, 1],
}

function datedif(s: number, e: number, unit: string): number {
  if (s > e) throw ERR.NUM
  const a = serialToYmd(s)
  const b = serialToYmd(e)
  const months = (b.y - a.y) * 12 + (b.m - a.m) - (b.d < a.d ? 1 : 0)
  switch (unit.toUpperCase()) {
    case 'D':
      return e - s
    case 'M':
      return months
    case 'Y':
      return Math.floor(months / 12)
    case 'YM':
      return months % 12
    case 'MD': {
      if (b.d >= a.d) return b.d - a.d
      const pm = b.m === 1 ? 12 : b.m - 1
      const py = b.m === 1 ? b.y - 1 : b.y
      return daysInMonth(py, pm) - a.d + b.d
    }
    case 'YD': {
      let anniv = ymdToSerial(b.y, a.m, Math.min(a.d, daysInMonth(b.y, a.m)))
      if (anniv > e) anniv = ymdToSerial(b.y - 1, a.m, Math.min(a.d, daysInMonth(b.y - 1, a.m)))
      return e - anniv
    }
  }
  throw ERR.NUM
}

function networkdays(s: number, e: number, holidays: Set<number>): number {
  const sign = s <= e ? 1 : -1
  const [lo, hi] = s <= e ? [s, e] : [e, s]
  let n = 0
  for (let d = lo; d <= hi; d++) {
    const dow = serialToYmd(d).dow
    if (dow !== 0 && dow !== 6 && !holidays.has(d)) n++
  }
  return sign * n
}

/**
 * WORKDAY(start, days, [holidays])：sdkjs cWORKDAY.Calculate（dateandtimeFunctions.js:2455-2505）。
 * 逐日 ±1 步进、跳过周末与节假日，累计到 |days| 个工作日为止；days=0 原样返回起点；
 * floor(days)；起点 <0 由 `day()` 抛 NUM、结果 <0 抛 NUM（对齐 `val0<0 / val<0 → not_numeric`）。
 * 周末判定走 `serialToYmd().dow`（0=周日 / 6=周六）——与 networkdays **同一原语**，禁造第二套。
 * serial<60 的 1900 虚构闰日偏移：serialToYmd 的 dow=((n-1)%7) 与 sdkjs calcDate 的
 * `argVal0<60 → getUTCDay()-1` 修正**全域恒等**（n≥61 时 (n-1)%7 ≡ 真实 getUTCDay；n<60 两者
 * 同幅平移），也与 series.ts dateStepValue 的纯 serial%7 递推（sat=0/sun=1）逐点一致——
 * x23 B 节静态回环锁死这条恒等。
 */
function workday(start: number, days: number, holidays: Set<number>): number {
  const t = Math.floor(days)
  const diff = Math.sign(t)
  let cur = start
  let cnt = 0
  while (cnt !== t) {
    cur += diff
    const dow = serialToYmd(cur).dow
    if (dow !== 0 && dow !== 6 && !holidays.has(cur)) cnt += diff
  }
  if (cur < 0) throw ERR.NUM
  return cur
}

export const DATE: Record<string, FnDef> = {
  TODAY: A(0, 0, (_a, ev) => Math.floor(dateToSerial(ev.now()))),
  NOW: A(0, 0, (_a, ev) => dateToSerial(ev.now())),
  DATE: S(3, 3, ([y, m, d]) => {
    let yy = Math.trunc(num(y))
    if (yy >= 0 && yy < 1900) yy += 1900
    if (yy < 0 || yy > 9999) throw ERR.NUM
    const s = ymdToSerial(yy, Math.trunc(num(m)), Math.trunc(num(d)))
    if (s < 0) throw ERR.NUM
    return s
  }),
  TIME: S(3, 3, ([h, m, s]) => {
    const t = Math.trunc(num(h)) * 3600 + Math.trunc(num(m)) * 60 + Math.trunc(num(s))
    if (t < 0) throw ERR.NUM
    return (t % 86400) / 86400
  }),
  YEAR: S(1, 1, ([x]) => serialToYmd(day(x)).y),
  MONTH: S(1, 1, ([x]) => serialToYmd(day(x)).m),
  DAY: S(1, 1, ([x]) => serialToYmd(day(x)).d),
  HOUR: S(1, 1, ([x]) => Math.floor(serialSeconds(serial(x)) / 3600)),
  MINUTE: S(1, 1, ([x]) => Math.floor((serialSeconds(serial(x)) % 3600) / 60)),
  SECOND: S(1, 1, ([x]) => serialSeconds(serial(x)) % 60),
  WEEKDAY: S(1, 2, (a) => {
    const dow = serialToYmd(day(a[0])).dow
    const spec = WEEKDAY_START[Math.trunc(opt(a, 1, 1))]
    if (!spec) throw ERR.NUM
    return ((dow - spec[0] + 7) % 7) + spec[1]
  }),
  EDATE: S(2, 2, ([s, m]) => addMonths(day(s), num(m), false)),
  EOMONTH: S(2, 2, ([s, m]) => addMonths(day(s), num(m), true)),
  DATEDIF: S(3, 3, ([s, e, u]) => datedif(day(s), day(e), str(u))),
  DAYS: S(2, 2, ([e, s]) => Math.floor(num(e)) - Math.floor(num(s))),
  NETWORKDAYS: A(2, 3, (a, ev) => {
    const hol = new Set(a.length > 2 ? nums([a[2]], ev).map(Math.floor) : [])
    return networkdays(day(ev.scalar(a[0])), day(ev.scalar(a[1])), hol)
  }),
  WORKDAY: A(2, 3, (a, ev) => {
    const hol = new Set(a.length > 2 ? nums([a[2]], ev).map(Math.floor) : [])
    return workday(day(ev.scalar(a[0])), num(ev.scalar(a[1])), hol)
  }),
}
