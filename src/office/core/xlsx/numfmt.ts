/** Excel number-format subset: General, fixed/grouped/percent/scientific/fraction, dates & times, sections & colors. */

export const BUILTIN_FORMATS: Record<number, string> = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00',
  12: '# ?/?', 13: '# ??/??', 14: 'm/d/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM',
  19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yyyy h:mm', 37: '#,##0 ;(#,##0)',
  38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)', 45: 'mm:ss',
  46: '[h]:mm:ss', 47: 'mmss.0', 48: '##0.0E+0', 49: '@',
  // common locale-dependent ids
  27: 'yyyy"年"m"月"', 30: 'm/d/yy', 31: 'yyyy"年"m"月"d"日"', 50: 'yyyy"年"m"月"', 57: 'yyyy"年"m"月"', 58: 'm"月"d"日"',
}

type Tok =
  | { k: 'lit'; v: string }
  | { k: 'digit'; v: '0' | '#' | '?' }
  | { k: 'dot' }
  | { k: 'comma' }
  | { k: 'pct' }
  | { k: 'exp'; sign: boolean }
  | { k: 'slash' }
  | { k: 'date'; v: string }
  | { k: 'text' }
  | { k: 'elapsed'; v: 'h' | 'm' | 's' }

interface Section {
  toks: Tok[]
  color?: string
  isDate: boolean
  cond?: { op: string; v: number }
  hasDigits: boolean
}

const COLORS: Record<string, string> = {
  black: '#000000', red: '#ff0000', green: '#00a000', blue: '#0000ff', yellow: '#c0c000', magenta: '#ff00ff',
  cyan: '#00c0c0', white: '#ffffff',
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function splitSections(fmt: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  let br = false
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i]
    if (c === '\\' && !q) {
      cur += c + (fmt[i + 1] ?? '')
      i++
      continue
    }
    if (c === '"') q = !q
    else if (!q && c === '[') br = true
    else if (!q && c === ']') br = false
    if (c === ';' && !q && !br) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

function parseSection(src: string): Section {
  const toks: Tok[] = []
  let color: string | undefined
  let cond: Section['cond']
  let isDate = false
  let i = 0
  const lit = (v: string) => {
    const last = toks[toks.length - 1]
    if (last?.k === 'lit') last.v += v
    else toks.push({ k: 'lit', v })
  }
  const lower = src.toLowerCase()
  while (i < src.length) {
    const c = src[i]
    const lc = lower[i]
    if (c === '"') {
      const e = src.indexOf('"', i + 1)
      lit(src.slice(i + 1, e < 0 ? undefined : e))
      i = e < 0 ? src.length : e + 1
    } else if (c === '\\') {
      lit(src[i + 1] ?? '')
      i += 2
    } else if (c === '_') {
      lit(' ')
      i += 2
    } else if (c === '*') {
      i += 2
    } else if (c === '[') {
      const e = src.indexOf(']', i)
      const body = src.slice(i + 1, e < 0 ? undefined : e)
      const bl = body.toLowerCase()
      if (COLORS[bl]) color = COLORS[bl]
      else if (/^color\s*\d+$/.test(bl)) color = undefined
      else if (/^(h+|m+|s+)$/.test(bl)) {
        toks.push({ k: 'elapsed', v: bl[0] as 'h' | 'm' | 's' })
        isDate = true
      } else if (body.startsWith('$')) {
        const sym = body.slice(1).split('-')[0]
        if (sym) lit(sym)
      } else {
        const m = /^(<=|>=|<>|<|>|=)\s*(-?[\d.]+)$/.exec(body)
        if (m) cond = { op: m[1], v: Number(m[2]) }
      }
      i = e < 0 ? src.length : e + 1
    } else if (c === '0' || c === '#' || c === '?') {
      toks.push({ k: 'digit', v: c })
      i++
    } else if (c === '.') {
      // ".0" after seconds = fractional seconds; treat as date token
      if (isDate && src[i + 1] === '0') {
        let j = i + 1
        while (src[j] === '0') j++
        toks.push({ k: 'date', v: src.slice(i, j) })
        i = j
      } else {
        toks.push({ k: 'dot' })
        i++
      }
    } else if (c === ',') {
      toks.push({ k: 'comma' })
      i++
    } else if (c === '%') {
      toks.push({ k: 'pct' })
      i++
    } else if ((lc === 'e') && (src[i + 1] === '+' || src[i + 1] === '-')) {
      toks.push({ k: 'exp', sign: src[i + 1] === '+' })
      i += 2
    } else if (c === '/' && toks.some((t) => t.k === 'digit')) {
      toks.push({ k: 'slash' })
      i++
    } else if (c === '@') {
      toks.push({ k: 'text' })
      i++
    } else if (lower.startsWith('am/pm', i)) {
      // the marker keeps the code's case: "am/pm" shows "pm"
      toks.push({ k: 'date', v: src[i] === 'a' ? 'am/pm' : 'AM/PM' })
      isDate = true
      i += 5
    } else if (lower.startsWith('a/p', i)) {
      toks.push({ k: 'date', v: src[i] === 'a' ? 'a/p' : 'A/P' })
      isDate = true
      i += 3
    } else if ('ymdhs'.includes(lc) || (lc === 'g' && lower.startsWith('ge', i)) || lc === 'b') {
      let j = i
      while (lower[j] === lc) j++
      if (lc === 'b' || lc === 'g') lit('')
      else {
        toks.push({ k: 'date', v: lower.slice(i, j) })
        isDate = true
      }
      i = j
    } else {
      lit(c)
      i++
    }
  }
  return { toks, color, isDate, cond, hasDigits: toks.some((t) => t.k === 'digit') }
}

const cache = new Map<string, Section[]>()

function compile(fmt: string): Section[] {
  let s = cache.get(fmt)
  if (!s) {
    s = splitSections(fmt).map(parseSection)
    if (cache.size > 2000) cache.clear()
    cache.set(fmt, s)
  }
  return s
}

export function isDateFormat(fmt: string): boolean {
  if (!fmt || fmt === 'General') return false
  return compile(fmt)[0].isDate
}

export function formatGeneral(v: number): string {
  if (!Number.isFinite(v)) return String(v)
  if (Number.isInteger(v) && Math.abs(v) < 1e11) return String(v)
  const a = Math.abs(v)
  if (a >= 1e11 || (a < 1e-9 && a !== 0)) {
    const [m, e] = v.toExponential(5).split('e')
    const mant = m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m
    return mant + 'E' + (e[0] === '-' ? '-' : '+') + e.replace(/^[+-]/, '').padStart(2, '0')
  }
  const digits = Math.max(0, 10 - Math.floor(Math.log10(a || 1)))
  let s = v.toFixed(Math.min(digits, 15))
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '')
  return s
}

function group(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function formatNumber(v: number, sec: Section): string {
  const toks = sec.toks
  let val = Math.abs(v)
  const pctCount = toks.filter((t) => t.k === 'pct').length
  val *= Math.pow(100, pctCount)
  const dotIdx = toks.findIndex((t) => t.k === 'dot')
  const expIdx = toks.findIndex((t) => t.k === 'exp')
  const slashIdx = toks.findIndex((t) => t.k === 'slash')
  const firstDigit = toks.findIndex((t) => t.k === 'digit')
  let lastDigit = -1
  toks.forEach((t, i) => t.k === 'digit' && (lastDigit = i))

  // trailing commas after last digit placeholder scale by 1000
  let scale = 0
  for (let i = lastDigit + 1; i < toks.length && toks[i].k === 'comma'; i++) scale++
  val /= Math.pow(1000, scale)
  const grouping = toks.some((t, i) => t.k === 'comma' && i > firstDigit && i < lastDigit)

  if (slashIdx >= 0) return formatFraction(val, sec, v < 0)

  const intEnd = dotIdx >= 0 ? dotIdx : expIdx >= 0 ? expIdx : lastDigit + 1
  const decToks = dotIdx >= 0 ? toks.slice(dotIdx + 1, expIdx >= 0 ? expIdx : undefined).filter((t) => t.k === 'digit') : []
  const decCount = decToks.length

  let mant = val
  let exp = 0
  if (expIdx >= 0) {
    const intPlaces = toks.slice(0, intEnd).filter((t) => t.k === 'digit').length || 1
    if (mant !== 0) {
      exp = Math.floor(Math.log10(mant))
      // engineering-style when multiple int placeholders (##0.0E+0)
      if (intPlaces > 1) exp = Math.floor(exp / intPlaces) * intPlaces
      mant = mant / Math.pow(10, exp)
    }
  }
  let fixed = mant.toFixed(decCount)
  if (expIdx >= 0 && Number(fixed) >= 10 && toks.slice(0, intEnd).filter((t) => t.k === 'digit').length <= 1) {
    exp += 1
    fixed = (mant / 10).toFixed(decCount)
  }
  let [intPart, decPart = ''] = fixed.split('.')
  // decimals: # trims trailing zeros, ? pads with spaces
  if (decCount) {
    const chars = decPart.split('')
    for (let i = decCount - 1; i >= 0; i--) {
      if (chars[i] !== '0') break
      const ph = (decToks[i] as { v: string }).v
      if (ph === '#') chars[i] = ''
      else if (ph === '?') chars[i] = ' '
      else break
    }
    decPart = chars.join('')
  }

  const intToks = toks.slice(0, intEnd)
  const intDigitToks = intToks.filter((t) => t.k === 'digit') as { k: 'digit'; v: string }[]
  const minInt = intDigitToks.filter((t) => t.v === '0').length
  if (intPart === '0' && minInt === 0) intPart = ''
  while (intPart.length < minInt) intPart = '0' + intPart
  const hasInnerLit = intToks.some((t, i) => t.k === 'lit' && i > firstDigit && i < intEnd)

  let out = ''
  if (!hasInnerLit) {
    let placed = false
    const body = grouping ? group(intPart) : intPart
    for (let i = 0; i < intEnd; i++) {
      const t = toks[i]
      if (t.k === 'digit') {
        if (!placed) {
          out += body
          placed = true
        }
      } else if (t.k === 'lit') out += t.v
      else if (t.k === 'pct') out += '%'
    }
    if (!placed) out += body
  } else {
    // right-to-left fill (phone-number style patterns)
    let digits = intPart
    let res = ''
    for (let i = intEnd - 1; i >= 0; i--) {
      const t = toks[i]
      if (t.k === 'digit') {
        if (digits.length) {
          res = digits[digits.length - 1] + res
          digits = digits.slice(0, -1)
        } else if (t.v === '0') res = '0' + res
        else if (t.v === '?') res = ' ' + res
        if (i === firstDigit && digits.length) {
          res = digits + res
          digits = ''
        }
      } else if (t.k === 'lit') res = t.v + res
      else if (t.k === 'pct') res = '%' + res
    }
    out = res
  }
  if (dotIdx >= 0) {
    out += decPart.length || decToks.some((t) => (t as { v: string }).v === '0') ? '.' + decPart : decCount ? '.' : ''
  }
  const tailStart = expIdx >= 0 ? expIdx : dotIdx >= 0 ? dotIdx + 1 : intEnd
  for (let i = tailStart; i < toks.length; i++) {
    const t = toks[i]
    if (t.k === 'exp') {
      const expDigits = toks.slice(i + 1).filter((x) => x.k === 'digit').length || 1
      out += 'E' + (exp < 0 ? '-' : t.sign ? '+' : '') + String(Math.abs(exp)).padStart(expDigits, '0')
      // skip exponent digit tokens
      while (i + 1 < toks.length && toks[i + 1].k === 'digit') i++
    } else if (t.k === 'lit') out += t.v
    else if (t.k === 'pct') out += '%'
  }
  return out
}

function formatFraction(val: number, sec: Section, neg: boolean): string {
  const toks = sec.toks
  const slash = toks.findIndex((t) => t.k === 'slash')
  const denToks = toks.slice(slash + 1).filter((t) => t.k === 'digit')
  const fixedDen = toks.slice(slash + 1).find((t) => t.k === 'lit' && /^\d+$/.test(t.v.trim())) as { v: string } | undefined
  const maxDen = fixedDen ? Number(fixedDen.v) : Math.pow(10, denToks.length || 1) - 1
  const hasWhole = toks.slice(0, slash).some((t) => t.k === 'lit' && t.v.includes(' '))
  const whole = hasWhole ? Math.floor(val) : 0
  const frac = val - whole
  let bestN = 0
  let bestD = 1
  if (fixedDen) {
    bestD = maxDen
    bestN = Math.round(frac * maxDen)
  } else {
    let err = Infinity
    for (let d = 1; d <= maxDen; d++) {
      const n = Math.round(frac * d)
      const e = Math.abs(frac - n / d)
      if (e < err - 1e-12) {
        err = e
        bestN = n
        bestD = d
      }
    }
  }
  const sign = neg ? '-' : ''
  if (bestN === 0) return sign + (hasWhole ? String(whole) : '0')
  if (bestN === bestD) return sign + String(whole + 1)
  return sign + (hasWhole && whole ? whole + ' ' : '') + bestN + '/' + bestD
}

/**
 * 序列值 → UTC Date（dateToSerial 的逆换算）。1904 系统 epoch=1904-01-01；
 * 1900 系统 serial 1=1900-01-01，serial 60 是 Excel 虚构的 1900-02-29（JS Date 无此日，
 * 这里与 serial 61 一并落到 1900-03-01），serial≥61 才与真实公历一致。
 */
export function serialToDate(serial: number, date1904 = false): Date {
  let days = Math.floor(serial)
  const ms = Math.round((serial - days) * 86400000)
  let base: number
  if (date1904) base = Date.UTC(1904, 0, 1)
  else if (days < 60) base = Date.UTC(1899, 11, 31)
  else {
    base = Date.UTC(1899, 11, 30)
    if (days === 60) days = 61
  }
  return new Date(base + days * 86400000 + ms)
}

function formatDate(v: number, sec: Section, date1904: boolean): string {
  const d = serialToDate(v, date1904)
  const toks = sec.toks
  const hasAmPm = toks.some((t) => t.k === 'date' && /^(am\/pm|a\/p)$/i.test(t.v ?? ''))
  const Y = d.getUTCFullYear()
  const M = d.getUTCMonth()
  const D = d.getUTCDate()
  const H = d.getUTCHours()
  const Mi = d.getUTCMinutes()
  const S = d.getUTCSeconds()
  const msec = d.getUTCMilliseconds()
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  let out = ''
  // decide month vs minute for 'm'/'mm'
  const isMinute = (idx: number) => {
    for (let j = idx - 1; j >= 0; j--) {
      const t = toks[j]
      if (t.k === 'date') return t.v[0] === 'h'
      if (t.k === 'elapsed') return t.v === 'h'
    }
    for (let j = idx + 1; j < toks.length; j++) {
      const t = toks[j]
      if (t.k === 'date') return t.v[0] === 's'
      if (t.k === 'elapsed') return t.v === 's'
    }
    return false
  }
  toks.forEach((t, idx) => {
    if (t.k === 'lit') return (out += t.v)
    if (t.k === 'elapsed') {
      const total = v * 86400
      if (t.v === 'h') out += Math.floor(total / 3600)
      else if (t.v === 'm') out += Math.floor(total / 60)
      else out += Math.round(total)
      return
    }
    if (t.k !== 'date') {
      if (t.k === 'digit') out += t.v === '0' ? '0' : ''
      else if (t.k === 'dot') out += '.'
      else if (t.k === 'comma') out += ','
      else if (t.k === 'pct') out += '%'
      else if (t.k === 'slash') out += '/'
      return
    }
    const tv = t.v
    switch (tv[0] === 'a' ? 'A' : tv[0]) {
      case 'y':
        out += tv.length <= 2 ? pad(Y % 100) : String(Y)
        break
      case 'm':
        if (tv.length <= 2 && isMinute(idx)) out += tv.length === 2 ? pad(Mi) : String(Mi)
        else if (tv.length === 1) out += M + 1
        else if (tv.length === 2) out += pad(M + 1)
        else if (tv.length === 3) out += MONTHS[M].slice(0, 3)
        else if (tv.length === 5) out += MONTHS[M][0]
        else out += MONTHS[M]
        break
      case 'd':
        if (tv.length === 1) out += D
        else if (tv.length === 2) out += pad(D)
        else if (tv.length === 3) out += DAYS[d.getUTCDay()].slice(0, 3)
        else out += DAYS[d.getUTCDay()]
        break
      case 'h': {
        let h = H
        if (hasAmPm) h = h % 12 || 12
        out += tv.length >= 2 ? pad(h) : String(h)
        break
      }
      case 's':
        out += tv.length >= 2 ? pad(S) : String(S)
        break
      case '.':
        out += '.' + pad(Math.floor(msec / Math.pow(10, 3 - (tv.length - 1))), tv.length - 1)
        break
      case 'A':
        {
          const m = tv.length > 3 ? (H < 12 ? 'AM' : 'PM') : H < 12 ? 'A' : 'P'
          out += tv[0] === 'a' ? m.toLowerCase() : m
        }
        break
    }
  })
  return out
}

export interface Formatted {
  text: string
  color?: string
}

export function formatValue(v: number, fmt: string | undefined, date1904 = false): Formatted {
  if (!fmt || fmt === 'General' || fmt === 'general') return { text: formatGeneral(v) }
  const secs = compile(fmt)
  let sec = secs[0]
  let val = v
  const hasCond = secs.some((s) => s.cond)
  if (hasCond) {
    const test = (s: Section) => {
      if (!s.cond) return false
      const { op, v: c } = s.cond
      return op === '<' ? v < c : op === '<=' ? v <= c : op === '>' ? v > c : op === '>=' ? v >= c : op === '=' ? v === c : v !== c
    }
    sec = secs.find(test) ?? secs.find((s) => !s.cond) ?? secs[0]
  } else if (secs.length >= 3 && v === 0 && secs[2].toks.length) sec = secs[2]
  else if (secs.length >= 2 && v < 0 && secs[1].toks.length) {
    sec = secs[1]
    val = -v
  }
  if (sec.isDate) {
    if (v < 0 || v > 2958465) return { text: '#'.repeat(8) }
    return { text: formatDate(v, sec, date1904), color: sec.color }
  }
  if (!sec.hasDigits) {
    // pure literal / text section ("-" for zero etc.)
    const lit = sec.toks.map((t) => (t.k === 'lit' ? t.v : t.k === 'pct' ? '%' : t.k === 'text' ? formatGeneral(val) : '')).join('')
    if (sec.toks.some((t) => t.k === 'text') || lit) return { text: lit, color: sec.color }
    return { text: formatGeneral(v), color: sec.color }
  }
  const neg = val < 0
  let text = formatNumber(val, sec)
  if (neg) text = '-' + text
  return { text, color: sec.color }
}

export function formatText(s: string, fmt: string | undefined): string {
  if (!fmt || !fmt.includes('@')) return s
  const secs = compile(fmt)
  const sec = secs.length >= 4 ? secs[3] : secs.find((x) => x.toks.some((t) => t.k === 'text'))
  if (!sec) return s
  return sec.toks.map((t) => (t.k === 'lit' ? t.v : t.k === 'text' ? s : '')).join('')
}
