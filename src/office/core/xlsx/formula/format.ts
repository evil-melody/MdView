/** Small number-format engine for TEXT(): 0, 0.00, #,##0, 0%, literals, sections, dates/times. */
import { formatDate, isDateFormat, splitSections } from './dates'
import { ERR, FormulaError, type Value } from './types'
import { numToText, parseNumberText } from './values'

/** Round half away from zero to d decimals, removing binary noise first. */
export function roundHalf(x: number, d: number): number {
  if (d > 15) return x
  const f = Math.pow(10, Math.abs(d))
  const ax = Math.abs(x)
  let y = d >= 0 ? ax * f : ax / f
  y = Math.floor(Number(y.toPrecision(15)) + 0.5)
  const r = d >= 0 ? y / f : y * f
  return x < 0 ? -r : r
}

function formatNumber(x: number, sec: string, signed: boolean): string {
  let prefix = ''
  let suffix = ''
  let pattern = ''
  let pct = 0
  const lit = (s: string) => {
    if (pattern) suffix += s
    else prefix += s
  }
  for (let i = 0; i < sec.length; i++) {
    const c = sec[i]
    if (c === '"') {
      const j = sec.indexOf('"', i + 1)
      const end = j < 0 ? sec.length : j
      lit(sec.slice(i + 1, end))
      i = end
    } else if (c === '\\') lit(sec[++i] ?? '')
    else if (c === '_') {
      lit(' ')
      i++
    } else if (c === '*') i++
    else if (c === '[') {
      const j = sec.indexOf(']', i)
      i = j < 0 ? sec.length : j
    } else if ('0#?'.includes(c) || ((c === '.' || c === ',') && !suffix)) pattern += c
    else {
      if (c === '%') pct++
      lit(c)
    }
  }
  let p = pattern
  let v = x * Math.pow(100, pct)
  while (p.endsWith(',')) {
    p = p.slice(0, -1)
    v /= 1000
  }
  const dot = p.indexOf('.')
  const ip = dot < 0 ? p : p.slice(0, dot)
  const dp = dot < 0 ? '' : p.slice(dot + 1)
  const decs = (dp.match(/[0#?]/g) ?? []).length
  const minDec = (dp.match(/[0?]/g) ?? []).length
  const minInt = (ip.match(/[0?]/g) ?? []).length
  const r = roundHalf(Math.abs(v), decs)
  let [is, ds = ''] = r.toFixed(decs).split('.')
  if (is === '0' && minInt === 0) is = ''
  is = is.padStart(minInt, '0')
  if (ip.includes(',')) is = is.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  while (ds.length > minDec && ds.endsWith('0')) ds = ds.slice(0, -1)
  const body = p === '' ? '' : is + (dot >= 0 ? `.${ds}` : '')
  const neg = signed && v < 0 && r !== 0
  return (neg ? '-' : '') + prefix + body + suffix
}

/** TEXT(value, format). Throws FormulaError on invalid input. */
export function formatText(v: Value, fmt: string): string {
  if (v instanceof FormulaError) throw v
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  let n: number
  const sections = splitSections(fmt)
  if (typeof v === 'string') {
    const p = parseNumberText(v)
    if (p === null) {
      const textSec = sections.length > 3 ? sections[3] : sections.find((s) => s.includes('@'))
      return textSec === undefined ? v : textSec.replace(/"([^"]*)"/g, '$1').replace(/@/g, v)
    }
    n = p
  } else n = v ?? 0
  let sec = sections[0]
  let signed = true
  if (n < 0 && sections.length > 1 && sections[1] !== '') {
    sec = sections[1]
    signed = false
  } else if (n === 0 && sections.length > 2 && sections[2] !== '') sec = sections[2]
  if (/^\s*general\s*$/i.test(sec) || sec === '') return numToText(signed ? n : Math.abs(n))
  if (isDateFormat(sec)) {
    if (n < 0) throw ERR.VALUE
    return formatDate(n, sec)
  }
  return formatNumber(signed ? n : Math.abs(n), sec, signed)
}
