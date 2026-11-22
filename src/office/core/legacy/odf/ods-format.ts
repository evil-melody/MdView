/**
 * OpenDocument data styles (number:number-style, currency-style, percentage-style, date-style, time-style,
 * boolean-style, text-style, with their style:map conditions) → Excel number format codes.
 */
import { children, textContent, type OdfStyles, type ONode } from './common'

/** Excel's named format colors */
const COLOR: Record<string, string> = {
  '000000': 'Black',
  FFFFFF: 'White',
  FF0000: 'Red',
  '00FF00': 'Green',
  '0000FF': 'Blue',
  FFFF00: 'Yellow',
  FF00FF: 'Magenta',
  '00FFFF': 'Cyan',
}

const flag = (v: string | undefined) => v === 'true'
const int = (v: string | undefined, def = 0) => {
  const n = Number.parseInt(v ?? '', 10)
  return Number.isFinite(n) ? n : def
}

/** a literal in a format code: characters that mean nothing in a code stay as they are, the rest is quoted */
export function literal(s: string, date = false): string {
  if (!s) return ''
  const safe = date ? /^[ \-/:(),]+$/ : /^[ \-():]+$/
  if (safe.test(s)) return s
  return s
    .split('"')
    .map((p) => (p ? `"${p}"` : ''))
    .join('\\"')
}

/** "#,##0" style integer digits: `min` zeros, grouped by thousands when asked */
function intDigits(min: number, grouping: boolean): string {
  if (!grouping) return min > 0 ? '0'.repeat(Math.min(min, 30)) : '#'
  const d = ('#'.repeat(Math.max(0, 4 - min)) + '0'.repeat(Math.min(min, 30))).split('')
  d.splice(d.length - 3, 0, ',')
  return d.join('')
}

/** a number:number element: integer digits, decimals, embedded texts, display factor */
function numberPart(n: ONode): string {
  const decimals = n.attrs['number:decimal-places']
  const minInt = int(n.attrs['number:min-integer-digits'], decimals === undefined ? 1 : 0)
  const grouping = flag(n.attrs['number:grouping'])
  const embedded = children(n, 'number:embedded-text')
  let int_: string
  if (embedded.length) {
    // texts at digit positions (counted leftwards from the decimal separator)
    const at = new Map<number, string>()
    let far = 0
    for (const e of embedded) {
      const p = int(e.attrs['number:position'])
      at.set(p, (at.get(p) ?? '') + textContent(e))
      far = Math.max(far, p)
    }
    const digits = Math.max(minInt, far, 1)
    int_ = ''
    for (let p = digits; p >= 0; p--) {
      if (at.has(p) && p > 0) int_ += literal(at.get(p)!)
      if (p > 0) int_ += p > minInt ? '#' : '0'
      if (grouping && p > 1 && (p - 1) % 3 === 0 && !at.size) int_ += ','
    }
    if (at.has(0)) int_ += literal(at.get(0)!)
  } else int_ = intDigits(minInt, grouping)
  let code = int_
  if (decimals === undefined) {
    // general decimals: "General" when nothing else is asked
    if (!grouping && minInt <= 1 && !embedded.length) return 'General'
  } else {
    const d = Math.min(int(decimals), 30)
    const min = Math.min(int(n.attrs['loext:min-decimal-places'] ?? n.attrs['number:min-decimal-places'], d), d)
    if (n.attrs['number:decimal-replacement'] !== undefined && d > 0 && min === d) code += '.' + '0'.repeat(d)
    else if (d > 0) code += '.' + '0'.repeat(min) + '#'.repeat(d - min)
  }
  const factor = Number(n.attrs['number:display-factor'] ?? 1)
  if (factor > 1) code += ','.repeat(Math.max(0, Math.min(4, Math.round(Math.log10(factor) / 3))))
  return code
}

function scientificPart(n: ONode): string {
  const d = Math.min(int(n.attrs['number:decimal-places']), 30)
  const minInt = Math.max(1, int(n.attrs['number:min-integer-digits'], 1))
  const interval = int(n.attrs['loext:exponent-interval'] ?? n.attrs['number:exponent-interval'], 1)
  const ip = interval > 1 ? '#'.repeat(Math.max(0, interval - minInt)) + '0'.repeat(minInt) : '0'.repeat(minInt)
  const e = Math.max(1, int(n.attrs['number:min-exponent-digits'], 2))
  return ip + (d ? '.' + '0'.repeat(d) : '') + 'E+' + '0'.repeat(Math.min(e, 5))
}

function fractionPart(n: ONode): string {
  const whole = n.attrs['number:min-integer-digits'] !== undefined ? '# ' : ''
  const num = Math.max(1, Math.min(int(n.attrs['number:min-numerator-digits'], 1), 5))
  const fixed = int(n.attrs['number:denominator-value'])
  const den = fixed > 0 ? String(fixed) : '?'.repeat(Math.max(1, Math.min(int(n.attrs['number:min-denominator-digits'], 1), 5)))
  return `${whole}${'?'.repeat(num)}/${den}`
}

/** the code of one data style (its own elements, not its maps) */
function section(el: ONode): string {
  const kind = el.name.slice('number:'.length)
  const date = kind === 'date-style' || kind === 'time-style'
  // durations: hours (or minutes) above their range
  let elapsed = kind === 'time-style' && el.attrs['number:truncate-on-overflow'] === 'false'
  let code = ''
  let color = ''
  for (const k of children(el)) {
    const long = k.attrs['number:style'] === 'long'
    switch (k.name) {
      case 'style:text-properties': {
        const c = (k.attrs['fo:color'] ?? '').replace('#', '').toUpperCase()
        if (COLOR[c]) color = `[${COLOR[c]}]`
        break
      }
      case 'number:number':
        code += numberPart(k)
        break
      case 'number:scientific-number':
        code += scientificPart(k)
        break
      case 'number:fraction':
        code += fractionPart(k)
        break
      case 'number:currency-symbol': {
        const sym = textContent(k).trim()
        if (sym) code += /[\]\-"]/.test(sym) ? literal(sym) : `[$${sym}]`
        break
      }
      case 'number:text': {
        const t = textContent(k)
        const blank = k.attrs['loext:blank-width-char']
        if (blank && /^\s*$/.test(t)) code += `_${blank[0]}`
        else if (kind === 'percentage-style' && t.includes('%')) code += t.split('%').map((p) => literal(p)).join('%')
        else code += literal(t, date)
        break
      }
      case 'number:text-content':
        code += '@'
        break
      case 'number:fill-character':
      case 'loext:fill-character': {
        const c = textContent(k)[0]
        if (c) code += `*${c}`
        break
      }
      case 'number:day':
        code += long ? 'dd' : 'd'
        break
      case 'number:month':
        code += flag(k.attrs['number:textual']) ? (long ? 'mmmm' : 'mmm') : long ? 'mm' : 'm'
        break
      case 'number:year':
        code += long ? 'yyyy' : 'yy'
        break
      case 'number:day-of-week':
        code += long ? 'dddd' : 'ddd'
        break
      case 'number:hours':
        code += elapsed ? (long ? '[hh]' : '[h]') : long ? 'hh' : 'h'
        elapsed = false
        break
      case 'number:minutes':
        code += elapsed ? (long ? '[mm]' : '[m]') : long ? 'mm' : 'm'
        elapsed = false
        break
      case 'number:seconds': {
        const d = Math.min(int(k.attrs['number:decimal-places']), 3)
        code += (elapsed ? (long ? '[ss]' : '[s]') : long ? 'ss' : 's') + (d ? '.' + '0'.repeat(d) : '')
        elapsed = false
        break
      }
      case 'number:am-pm':
        code += 'AM/PM'
        break
      case 'number:boolean':
        return '"TRUE";"TRUE";"FALSE"'
      // eras, quarters and weeks have no Excel code
    }
  }
  if (kind === 'percentage-style' && !code.includes('%')) code += '%'
  return color + (code || 'General')
}

/** "value()>=0" → [">=", 0] */
function condition(c: string | undefined): [string, number] | undefined {
  const m = /^\s*value\(\)\s*(>=|<=|!=|<>|=|<|>)\s*(-?[\d.]+(?:[eE][+-]?\d+)?)\s*$/.exec(c ?? '')
  if (!m) return undefined
  const n = Number(m[2])
  return Number.isFinite(n) ? [m[1] === '!=' ? '<>' : m[1], n] : undefined
}

/**
 * The Excel format code of a data style, undefined for none (or General). Conditions (style:map) become the
 * sections of the code: "≥0" makes the usual positive;negative pair, others become [condition] sections.
 */
export function excelFormat(styles: OdfStyles, name: string | undefined): string | undefined {
  const el = name ? styles.dataStyles.get(name) : undefined
  if (!el) return undefined
  const main = section(el)
  // the styles conditions apply are sections themselves (their own conditions are not followed)
  const sub = (n: string | undefined) => {
    const s = n ? styles.dataStyles.get(n) : undefined
    return s ? section(s) : 'General'
  }
  const maps = children(el, 'style:map')
    .map((m) => ({ cond: condition(m.attrs['style:condition']), code: sub(m.attrs['style:apply-style-name']) }))
    .filter((m): m is { cond: [string, number]; code: string } => !!m.cond)
    .slice(0, 2)
  let code = main
  if (maps.length === 1) {
    const [op, v] = maps[0].cond
    // the main style is the one for the numbers no condition takes
    if (op === '>=' && v === 0) code = `${maps[0].code};${main}`
    else if (op === '>' && v === 0) code = `[>0]${maps[0].code};${main}`
    else if (op === '<' && v === 0) code = `${main};${maps[0].code}`
    else code = `[${op}${v}]${maps[0].code};${main}`
  } else if (maps.length === 2) {
    const ops = maps.map((m) => `${m.cond[0]}${m.cond[1]}`)
    const pos = ops.indexOf('>0')
    const neg = ops.indexOf('<0')
    if (pos >= 0 && neg >= 0) code = `${maps[pos].code};${maps[neg].code};${main}`
    else code = `[${ops[0]}]${maps[0].code};[${ops[1]}]${maps[1].code};${main}`
  }
  // Excel takes codes of up to 255 characters
  return code === 'General' || code.length > 255 ? undefined : code
}

const SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', INR: '₹', KRW: '₩', RUB: '₽', VND: '₫', CHF: 'CHF' }

/** the format of a value with no data style that Excel would otherwise show as a bare number */
export function fallbackFormat(valueType: string, value: number, currency?: string): string | undefined {
  switch (valueType) {
    case 'date':
      return value % 1 ? 'yyyy\\-mm\\-dd hh:mm:ss' : 'yyyy\\-mm\\-dd'
    case 'time':
      return '[hh]:mm:ss'
    case 'percentage':
      return '0.00%'
    case 'currency': {
      const sym = currency && /^[A-Z]{3}$/.test(currency) ? (SYMBOL[currency] ?? currency) : undefined
      return sym ? `[$${sym}]#,##0.00` : '#,##0.00'
    }
  }
  return undefined
}
