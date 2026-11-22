/**
 * iWork cell formats (TSK.FormatStructArchive) as Excel number format codes, and the text a cell shows with them.
 * Numbers write the code into the converted workbook; Pages and Keynote tables only need the shown text.
 */
import { formatGeneral, formatValue } from '../xlsx/numfmt'
import type { Msg } from './proto'

export type CellKind = 'number' | 'text' | 'date' | 'bool' | 'duration' | 'error' | 'rich'

/** TSK.FormatStructArchive.format_type */
export const FMT = {
  BOOLEAN: 1,
  DECIMAL: 256,
  CURRENCY: 257,
  PERCENT: 258,
  SCIENTIFIC: 259,
  TEXT: 260,
  DATE: 261,
  FRACTION: 262,
  CHECKBOX: 263,
  RATING: 267,
  DURATION: 268,
  BASE: 269,
} as const

/** iWork dates count seconds from 2001-01-01 UTC; Excel serials days from 1899-12-30 */
const EPOCH_DAYS = 36892
export const toSerial = (seconds: number) => EPOCH_DAYS + seconds / 86400

const CURRENCY: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', VND: '₫', KRW: '₩', INR: '₹', RUB: '₽', BRL: 'R$', CHF: 'CHF ', CAD: 'CA$', AUD: 'A$', HKD: 'HK$', SGD: 'S$', THB: '฿', ILS: '₪', TRY: '₺', PHP: '₱', NGN: '₦', UAH: '₴', PLN: 'zł',
}

/** decimal places "auto" */
const AUTO = 253

/** ICU date pattern ("MMM d, yyyy h:mm a") → Excel date code */
export function excelDate(icu: string, lower = false): string {
  let out = ''
  let hasAmPm = /a/.test(icu.replace(/'[^']*'/g, ''))
  for (let i = 0; i < icu.length; ) {
    const ch = icu[i]
    if (ch === "'") {
      const end = icu.indexOf("'", i + 1)
      const lit = end < 0 ? icu.slice(i + 1) : icu.slice(i + 1, end)
      out += lit ? `"${lit.replace(/"/g, '')}"` : "'"
      i = end < 0 ? icu.length : end + 1
      continue
    }
    let n = 1
    while (icu[i + n] === ch) n++
    i += n
    switch (ch) {
      case 'y':
      case 'Y':
      case 'u':
        out += n === 2 ? 'yy' : 'yyyy'
        break
      case 'M':
      case 'L':
        out += n >= 4 ? 'mmmm' : n === 3 ? 'mmm' : n === 2 ? 'mm' : 'm'
        break
      case 'd':
        out += n >= 2 ? 'dd' : 'd'
        break
      case 'E':
      case 'e':
      case 'c':
        out += n >= 4 ? 'dddd' : 'ddd'
        break
      case 'H':
      case 'k':
        out += n >= 2 ? 'hh' : 'h'
        break
      case 'h':
      case 'K':
        out += n >= 2 ? 'hh' : 'h'
        hasAmPm = true
        break
      case 'm':
        out += n >= 2 ? 'mm' : 'm'
        break
      case 's':
        out += n >= 2 ? 'ss' : 's'
        break
      case 'S':
        out += '.' + '0'.repeat(Math.min(3, n))
        break
      case 'a':
        out += lower ? 'am/pm' : 'AM/PM'
        break
      case 'G':
      case 'z':
      case 'Z':
      case 'v':
      case 'V':
      case 'w':
      case 'W':
      case 'D':
      case 'F':
      case 'Q':
      case 'q':
        break
      default:
        out += /[A-Za-z]/.test(ch) ? '' : ch.repeat(n).replace(/"/g, '')
    }
  }
  // a 12-hour clock without its marker would read as 24-hour
  if (hasAmPm && !/am\/pm/i.test(out) && /h/.test(out)) out += lower ? ' am/pm' : ' AM/PM'
  return out.trim() || 'yyyy-mm-dd'
}

const KINDS: CellKind[] = ['number', 'text', 'date', 'bool', 'duration', 'error', 'rich']
const codes = new WeakMap<Msg, (string | undefined | null)[]>()

/** a format's Excel code; undefined: General (or no Excel equivalent). Cached per format object. */
export function excelFormat(f: Msg | undefined, kind: CellKind, lower = false, value?: number): string | undefined {
  if (!f) return kind === 'date' ? 'yyyy-mm-dd' : undefined
  // the code depends on the value only for "auto" decimal places (whole or not)
  const t = f.u(1)
  const whole = value === undefined || Number.isInteger(t === FMT.PERCENT ? Math.round(value * 1e10) / 1e8 : value)
  const slot = KINDS.indexOf(kind) * 4 + (lower ? 2 : 0) + (whole ? 1 : 0)
  let cached = codes.get(f)
  if (!cached) codes.set(f, (cached = []))
  const hit = cached[slot]
  if (hit !== undefined) return hit ?? undefined
  const code = formatCode(f, kind, lower, whole)
  cached[slot] = code ?? null
  return code
}

function formatCode(f: Msg, kind: CellKind, lower: boolean, whole: boolean): string | undefined {
  if (f.has(41) || f.has(42)) return kind === 'date' ? 'yyyy-mm-dd' : undefined
  const type = f.u(1)
  const decimals = f.u(2)
  const dec = (d = decimals) => (d !== undefined && d !== AUTO && d > 0 ? '.' + '0'.repeat(Math.min(d, 15)) : '')
  // negative numbers: minus, red, (parentheses), red (parentheses); a currency symbol stays outside
  const negative = (base: string, symbol = '') => {
    switch (f.u(4) ?? 0) {
      case 1:
        return `${symbol}${base};[Red]${symbol}${base}`
      case 2:
        return `${symbol}${base};${symbol}(${base})`
      case 3:
        return `${symbol}${base};[Red]${symbol}(${base})`
      default:
        return symbol ? `${symbol}${base};${symbol}-${base}` : base
    }
  }
  // "auto" decimal places (`whole`): as many as the value has, no trailing point on whole numbers
  const int = f.bool(5) ? '#,##0' : '0'
  switch (type) {
    case FMT.DECIMAL:
      if (decimals === AUTO || decimals === undefined) return f.bool(5) ? negative(whole ? '#,##0' : '#,##0.##########') : undefined
      return negative(int + dec())
    case FMT.CURRENCY: {
      const code = f.str(3) ?? 'USD'
      const sym = CURRENCY[code] ?? `${code} `
      const sep = f.has(5) && !f.bool(5) ? '0' : '#,##0'
      const auto = decimals === AUTO || decimals === undefined
      return negative(auto ? (whole ? sep : `${sep}.##########`) : sep + dec(), `"${sym}"`)
    }
    case FMT.PERCENT:
      if (decimals === AUTO || decimals === undefined) return negative(whole ? `${int}%` : `${int}.##########%`)
      return negative(`${int}${dec()}%`)
    case FMT.SCIENTIFIC:
      return `0${dec(decimals === AUTO || decimals === undefined ? 2 : decimals)}E+00`
    case FMT.FRACTION:
      return '# ?/?'
    case FMT.DATE: {
      const icu = f.str(14)
      return icu ? excelDate(icu, lower) : 'yyyy-mm-dd'
    }
    default:
      return kind === 'date' ? 'yyyy-mm-dd' : undefined
  }
}

const WEEK = 1
const DAY = 2
const HOUR = 4
const MINUTE = 8
const SECOND = 16
const MS = 32

/** units of an automatic duration format: the largest the value reaches, the smallest it needs */
function autoUnits(v: number): [number, number] {
  if (v === 0) return [DAY, DAY]
  const largest = v >= 604800 ? WEEK : v >= 86400 ? DAY : v >= 3600 ? HOUR : v >= 60 ? MINUTE : v >= 1 ? SECOND : MS
  let smallest = largest
  if (Math.floor(v) !== v) smallest = MS
  else if (v % 60) smallest = SECOND
  else if (v % 3600) smallest = MINUTE
  else if (v % 86400) smallest = HOUR
  else if (v % 604800) smallest = DAY
  return [largest, Math.max(smallest, largest)]
}

/** a duration as Numbers shows it: compact "1:02:03", short "1h 2m 3s" or long "1 hour 2 minutes 3 seconds" */
export function durationText(value: number, f: Msg | undefined): string {
  const style = f?.u(7) ?? 0
  let [largest, smallest] = f?.bool(40) || !f ? autoUnits(value) : [f.u(15) ?? HOUR, f.u(16) ?? SECOND]
  if (smallest < largest) [largest, smallest] = [smallest, largest]
  const label = (name: string, n: number, short = name[0]) => (style === 0 ? '' : style === 1 ? short : ` ${name}${n === 1 ? '' : 's'}`)
  const within = (u: number) => largest <= u && u <= smallest
  const pad = (n: number, u: number) => (smallest === u && largest === u) || n >= 10
  let d = value
  const out: string[] = []
  const unit = (u: number, size: number, name: string) => {
    const n = Math.trunc(d / size)
    if (smallest > u) d -= size * n
    out.push(style === 0 && u >= MINUTE ? (pad(n, u) ? '' : '0') + n : n + label(name, n))
  }
  if (largest === WEEK) {
    const n = Math.trunc(d / 604800)
    if (smallest !== WEEK) d -= 604800 * n
    out.push(n + label('week', n))
  }
  if (within(DAY)) unit(DAY, 86400, 'day')
  if (within(HOUR)) unit(HOUR, 3600, 'hour')
  if (within(MINUTE)) unit(MINUTE, 60, 'minute')
  if (within(SECOND)) unit(SECOND, 1, 'second')
  if (smallest >= MS) {
    const n = Math.round(1000 * d)
    out.push(style === 0 ? String(n).padStart(3, '0') : n + label('millisecond', n, 'ms'))
  }
  const text = out.join(style === 0 ? ':' : ' ')
  return style === 0 ? text.replace(/:(\d\d\d)$/, '.$1') : text
}

/** a number in base 2-36 ("FF", two's complement for negative binary / octal / hex without a minus sign) */
function baseText(value: number, f: Msg): string {
  const base = f.u(8) ?? 10
  const places = f.u(9) ?? 0
  if (base < 2 || base > 36) return formatGeneral(value)
  if (value === 0) return '0'.padStart(places, '0')
  let v = Math.round(value)
  if (v < 0 && !f.bool(10) && (base === 2 || base === 8 || base === 16)) {
    const bits = Math.max(32, Math.ceil(Math.log2(Math.abs(v))) + 1)
    const s = (BigInt(1) << BigInt(bits)) + BigInt(v)
    return base === 2 ? s.toString(2).padStart(bits, '1') : s.toString(base).toUpperCase()
  }
  const neg = v < 0
  v = Math.abs(v)
  const s = v.toString(base).toUpperCase().padStart(places, '0')
  return neg ? '-' + s : s
}

/** the closest fraction with a denominator up to `max` (continued fractions) */
function limitDenominator(x: number, max: number): [number, number] {
  let [p0, q0, p1, q1] = [0, 1, 1, 0]
  let n = x
  for (let k = 0; k < 64; k++) {
    const a = Math.floor(n)
    const q2 = q0 + a * q1
    if (q2 > max) break
    ;[p0, q0, p1, q1] = [p1, q1, p0 + a * p1, q2]
    const rest = n - a
    if (rest < 1e-12) break
    n = 1 / rest
  }
  // the last convergent or the best semiconvergent below the limit
  const k = Math.floor((max - q0) / q1)
  const [bp, bq] = [p0 + k * p1, q0 + k * q1]
  return Math.abs(bp / bq - x) <= Math.abs(p1 / q1 - x) ? [bp, bq] : [p1, q1]
}

/** halves to the even neighbour, as Numbers rounds fractions */
function roundEven(v: number): number {
  const r = Math.round(v)
  return Math.abs(v % 1) === 0.5 && r % 2 ? r - 1 : r
}

/** a fraction: "1 1/4"; accuracy a fixed denominator, or (0xFFFFFFFF…) up to 1-3 digits */
function fractionText(value: number, f: Msg): string {
  const acc = f.u(11) ?? 0xffffffff
  const x = Math.abs(value)
  let num: number
  let den: number
  if (acc >= 0xff000000) {
    ;[num, den] = limitDenominator(x, 10 ** (0x100000000 - acc) - 1)
  } else {
    den = Math.max(1, acc)
    num = roundEven(x * den)
  }
  const whole = Math.floor(num / den)
  const rest = num - whole * den
  const text = rest ? (whole ? `${whole} ${rest}/${den}` : `${rest}/${den}`) : String(whole)
  return value < 0 && text !== '0' ? '-' + text : text
}

const LOWER_AM_PM = /^en_(GB|AU|NZ|IE|ZA|IN|SG|MT)/

/** a document's locale writes "pm" rather than "PM" */
export const lowerAmPm = (locale: string | undefined) => !!locale && LOWER_AM_PM.test(locale)

/** the text a cell shows */
export function shownText(kind: CellKind, value: number, f: Msg | undefined, lower = false): string {
  const type = f?.u(1)
  if (kind === 'duration') return durationText(value, f)
  if (f && type === FMT.FRACTION) return fractionText(value, f)
  if (f && type === FMT.BASE) return baseText(value, f)
  if (kind === 'bool' || type === FMT.CHECKBOX) {
    if (type === FMT.CHECKBOX) return value ? '☑' : '☐'
    return value ? (f?.str(44) ?? 'TRUE') : (f?.str(45) ?? 'FALSE')
  }
  if (type === FMT.RATING) return '★'.repeat(Math.max(0, Math.min(5, Math.round(value))))
  if (kind === 'date') return formatValue(toSerial(value), excelFormat(f, kind, lower)).text
  const code = excelFormat(f, kind, lower, value)
  return code ? formatValue(value, code).text : formatGeneral(value)
}
