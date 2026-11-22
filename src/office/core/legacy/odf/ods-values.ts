/** Reading OpenDocument spreadsheet cells: dates, durations, errors, text, links; Excel's names for sheets and names. */
import { descendants, textContent, type ONode } from './common'

/** a repeat count attribute (1 when absent or not one) */
export const rep = (v: string | undefined) => {
  if (v === undefined) return 1
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/** day count of an ISO date (and time) since `base` (ms); undefined when not one */
export function serial(v: string | undefined, base: number): number | undefined {
  const m = /^(-?\d{1,6})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d)(?::(\d\d)(?:[.,](\d+))?)?)?/.exec(v ?? '')
  if (!m) return undefined
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), m[7] ? Math.round(Number(`0.${m[7]}`) * 1000) : 0)
  if (!Number.isFinite(ms)) return undefined
  const d = (ms - base) / 86_400_000
  return Math.round(d * 1e10) / 1e10
}

/** an ISO 8601 duration ("PT13H45M00S", "-P1DT2H") in days */
export function duration(v: string | undefined): number | undefined {
  const m = /^\s*(-)?P(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?\s*$/.exec(v ?? '')
  if (!m) return undefined
  const n = (s: string | undefined) => (s ? Number(s.replace(',', '.')) : 0)
  const d = n(m[2]) + n(m[3]) / 24 + n(m[4]) / 1440 + n(m[5]) / 86400
  return Number.isFinite(d) ? (m[1] ? -d : d) : undefined
}

const ERRORS = new Set(['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A'])
/** a LibreOffice error text as an Excel error */
export const excelError = (t: string) => {
  const s = t.trim().toUpperCase()
  if (ERRORS.has(s)) return s
  if (s === 'ERR:525') return '#NAME?'
  if (s === 'ERR:532') return '#DIV/0!'
  if (s === 'ERR:524') return '#REF!'
  if (s === 'ERR:502' || s === 'ERR:503' || s === 'ERR:523') return '#NUM!'
  return '#VALUE!'
}

/** Excel sheet names: no []:*?/\, at most 31 characters, unique */
export function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, '_').replace(/^'+|'+$/g, '').slice(0, 31).trim() || 'Sheet'
  let out = base
  for (let k = 2; used.has(out.toLowerCase()); k++) out = `${base.slice(0, 31 - ` (${k})`.length)} (${k})`
  used.add(out.toLowerCase())
  return out
}

/** a defined name as Excel takes it */
export function definedName(name: string): string {
  let n = name.replace(/[^\w.\\\u00c0-\uffff]/g, '_')
  if (!/^[A-Za-z_\\\u00c0-\uffff]/.test(n) || /^[A-Za-z]{1,3}\d+$/.test(n) || /^[RC]$/i.test(n) || /^R\d*C\d*$/i.test(n)) n = '_' + n
  return n.slice(0, 255)
}

/** text of the paragraphs of a cell or annotation */
export function paragraphs(n: ONode): string[] {
  const out: string[] = []
  for (const k of n.kids) {
    if (typeof k === 'string') continue
    // most paragraphs are one run of text
    if (k.name === 'text:p' || k.name === 'text:h') out.push(k.kids.length === 1 && typeof k.kids[0] === 'string' ? k.kids[0] : textContent(k))
    else if (k.name === 'text:list') for (const p of descendants(k, 'text:p')) out.push(textContent(p))
  }
  return out
}

/** the target of the first link in a cell's paragraphs */
export function linkOf(n: ONode): string | undefined {
  for (const k of n.kids) {
    if (typeof k === 'string' || (k.name !== 'text:p' && k.name !== 'text:h')) continue
    const a = descendants(k, 'text:a')[0]
    if (a?.attrs['xlink:href']) return a.attrs['xlink:href']
  }
  return undefined
}

const CONTENT = new Set(['text:p', 'text:h', 'text:list', 'office:annotation'])

/** a cell with something to show (a value, a formula, text, a comment, a merge) */
export function hasContent(k: ONode): boolean {
  const a = k.attrs
  if (a['office:value-type'] || a['table:formula'] || rep(a['table:number-columns-spanned']) > 1 || rep(a['table:number-rows-spanned']) > 1) return true
  for (const x of k.kids) if (typeof x !== 'string' && CONTENT.has(x.name)) return true
  return false
}
