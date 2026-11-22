/** Text functions. */
import { A, INF, opt, S, visit, type FnDef } from './fn'
import { formatText } from './format'
import { ERR, FormulaError, type Value } from './types'
import { bool, num, parseNumberText, str, wildcardRe } from './values'

const MAX_TEXT = 32767

function len(n: number): number {
  const k = Math.trunc(n)
  if (k < 0) throw ERR.VALUE
  return k
}

function proper(s: string): string {
  let out = ''
  let prevLetter = false
  for (const ch of s) {
    const isLetter = ch.toLowerCase() !== ch.toUpperCase()
    out += isLetter ? (prevLetter ? ch.toLowerCase() : ch.toUpperCase()) : ch
    prevLetter = isLetter
  }
  return out
}

function find(needle: string, hay: string, start: number, ci: boolean): number {
  if (start < 1 || start > hay.length + 1) throw ERR.VALUE
  if (needle === '') return start
  if (!ci) {
    const i = hay.indexOf(needle, start - 1)
    if (i < 0) throw ERR.VALUE
    return i + 1
  }
  const re = wildcardRe(needle, false)
  const m = re.exec(hay.slice(start - 1))
  if (!m) throw ERR.VALUE
  return m.index + start
}

export const TEXT: Record<string, FnDef> = {
  CONCATENATE: S(1, INF, (a) => a.map(str).join('')),
  CONCAT: A(1, INF, (a, ev) => {
    let s = ''
    const add = (v: Value) => (s += str(v))
    for (const x of a) visit(x, ev, add, add)
    if (s.length > MAX_TEXT) throw ERR.VALUE
    return s
  }),
  TEXTJOIN: A(3, INF, (a, ev) => {
    const delim = str(ev.scalar(a[0]))
    const skipEmpty = bool(ev.scalar(a[1]))
    const parts: string[] = []
    const add = (v: Value) => {
      const s = str(v)
      if (!skipEmpty || s !== '') parts.push(s)
    }
    for (const x of a.slice(2)) visit(x, ev, add, add)
    const s = parts.join(delim)
    if (s.length > MAX_TEXT) throw ERR.VALUE
    return s
  }),
  LEFT: S(1, 2, (a) => str(a[0]).slice(0, len(opt(a, 1, 1)))),
  RIGHT: S(1, 2, (a) => {
    const s = str(a[0])
    return s.slice(Math.max(0, s.length - len(opt(a, 1, 1))))
  }),
  MID: S(3, 3, ([t, st, n]) => {
    const start = Math.trunc(num(st))
    if (start < 1) throw ERR.VALUE
    return str(t).substr(start - 1, len(num(n)))
  }),
  LEN: S(1, 1, ([x]) => str(x).length),
  UPPER: S(1, 1, ([x]) => str(x).toUpperCase()),
  LOWER: S(1, 1, ([x]) => str(x).toLowerCase()),
  PROPER: S(1, 1, ([x]) => proper(str(x))),
  TRIM: S(1, 1, ([x]) => str(x).replace(/ {2,}/g, ' ').replace(/^ | $/g, '')),
  SUBSTITUTE: S(3, 4, (a) => {
    const s = str(a[0])
    const from = str(a[1])
    const to = str(a[2])
    if (from === '') return s
    if (a.length < 4) return s.split(from).join(to)
    const nth = Math.trunc(num(a[3]))
    if (nth < 1) throw ERR.VALUE
    let idx = -1
    for (let k = 0; k < nth; k++) {
      idx = s.indexOf(from, idx + (k ? from.length : 1))
      if (idx < 0) return s
    }
    return s.slice(0, idx) + to + s.slice(idx + from.length)
  }),
  REPLACE: S(4, 4, ([t, st, n, nw]) => {
    const s = str(t)
    const start = Math.trunc(num(st))
    if (start < 1) throw ERR.VALUE
    const k = len(num(n))
    return s.slice(0, start - 1) + str(nw) + s.slice(start - 1 + k)
  }),
  REPT: S(2, 2, ([t, n]) => {
    const s = str(t)
    const k = len(num(n))
    if (s.length * k > MAX_TEXT) throw ERR.VALUE
    return s.repeat(k)
  }),
  FIND: S(2, 3, (a) => find(str(a[0]), str(a[1]), Math.trunc(opt(a, 2, 1)), false)),
  SEARCH: S(2, 3, (a) => find(str(a[0]), str(a[1]), Math.trunc(opt(a, 2, 1)), true)),
  EXACT: S(2, 2, ([x, y]) => str(x) === str(y)),
  // the link itself is not followed: the cell shows the friendly name, else the address
  HYPERLINK: S(1, 2, (a) => (a.length > 1 && a[1] !== null ? a[1] : str(a[0]))),
  VALUE: S(1, 1, ([x]) => {
    if (typeof x === 'number') return x
    if (x === null) return 0
    if (typeof x !== 'string') throw x instanceof FormulaError ? x : ERR.VALUE
    const n = parseNumberText(x)
    if (n === null) throw ERR.VALUE
    return n
  }),
  TEXT: S(2, 2, ([v, f]) => formatText(v, str(f))),
  CHAR: S(1, 1, ([x]) => {
    const n = Math.trunc(num(x))
    if (n < 1 || n > 255) throw ERR.VALUE
    return String.fromCharCode(n)
  }),
  CODE: S(1, 1, ([x]) => {
    const s = str(x)
    if (!s) throw ERR.VALUE
    return s.charCodeAt(0)
  }),
}
