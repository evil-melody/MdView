/** Lookup & reference functions. */
import { A, flat, type Ev, type FnDef } from './fn'
import { parseRefText } from './lexer'
import type { RefAddr } from './refs'
import { ERR, FormulaError, MAX_COL, MAX_ROW, type Value } from './types'
import { ArrayV, bool, compare, hasWildcard, int, num, RangeV, str, UnionV, valueEq, wildcardRe, type Val } from './values'

/** Index of the first exact match (case-insensitive; wildcards when `wild` and x is text), -1 if none. */
function findExact(list: Value[], x: Value, wild: boolean): number {
  if (wild && typeof x === 'string' && hasWildcard(x)) {
    const re = wildcardRe(x)
    return list.findIndex((v) => typeof v === 'string' && re.test(v))
  }
  return list.findIndex((v) => valueEq(v, x))
}

/**
 * Approximate match on sorted data. dir=1: last value <= x (ascending); dir=-1: last value >= x (descending).
 * Values of another type are skipped, like Excel's binary search on well-formed data.
 */
function findApprox(list: Value[], x: Value, dir: 1 | -1): number {
  let best = -1
  for (let i = 0; i < list.length; i++) {
    const v = list[i]
    if (v === null || v instanceof FormulaError || typeof v !== typeof x) continue
    const c = compare(v, x)
    if (dir === 1 ? c <= 0 : c >= 0) best = i
    else break
  }
  return best
}

function lookupValue(v: Val, ev: Ev): Value {
  const x = ev.scalar(v)
  if (x instanceof FormulaError) throw x
  return x
}

function grid(v: Val, ev: Ev): Value[][] {
  if (v instanceof UnionV) throw ERR.VALUE
  return ev.toArray(v)
}

function vhlookup(a: Val[], ev: Ev, vertical: boolean): Value {
  const x = lookupValue(a[0], ev)
  const d = grid(a[1], ev)
  const idx = int(ev.scalar(a[2]))
  const approx = a.length > 3 ? bool(ev.scalar(a[3])) : true
  const size = vertical ? d[0].length : d.length
  if (idx < 1) throw ERR.VALUE
  if (idx > size) throw ERR.REF
  const keys = vertical ? d.map((row) => row[0]) : d[0]
  const i = approx ? findApprox(keys, x, 1) : findExact(keys, x, true)
  if (i < 0) throw ERR.NA
  return vertical ? d[i][idx - 1] : d[idx - 1][i]
}

function match(a: Val[], ev: Ev): number {
  const x = lookupValue(a[0], ev)
  const d = grid(a[1], ev)
  if (d.length > 1 && d[0].length > 1) throw ERR.NA
  const list = flat(d)
  const type = a.length > 2 ? Math.sign(num(ev.scalar(a[2]))) : 1
  const i = type === 0 ? findExact(list, x, true) : findApprox(list, x, type as 1 | -1)
  if (i < 0) throw ERR.NA
  return i + 1
}

/** Row i (vertical) or column i of a range/array, as a reference when possible. */
function slice(v: Val, d: Value[][], i: number, vertical: boolean): Val {
  if (v instanceof RangeV)
    return vertical ? new RangeV(v.sheet, v.r0 + i, v.c0, v.r0 + i, v.c1) : new RangeV(v.sheet, v.r0, v.c0 + i, v.r1, v.c0 + i)
  const out = vertical ? [d[i]] : d.map((row) => [row[i]])
  return out[0].length === 1 && out.length === 1 ? out[0][0] : new ArrayV(out)
}

function xlookup(a: Val[], ev: Ev): Val {
  const x = lookupValue(a[0], ev)
  const look = grid(a[1], ev)
  const ret = grid(a[2], ev)
  const vertical = look[0].length === 1
  if (!vertical && look.length !== 1) throw ERR.VALUE
  if (vertical ? ret.length !== look.length : ret[0].length !== look[0].length) throw ERR.VALUE
  const notFound = a.length > 3 && a[3] !== null ? a[3] : undefined
  const mode = a.length > 4 ? int(ev.scalar(a[4])) : 0
  const search = a.length > 5 ? int(ev.scalar(a[5])) : 1
  let list = flat(look)
  const rev = search < 0
  if (rev) list = [...list].reverse()
  let i = -1
  if (mode === 0 || mode === 2) i = findExact(list, x, mode === 2)
  else if (mode === 1 || mode === -1) {
    i = findExact(list, x, false)
    if (i < 0) {
      // next larger (1) / next smaller (-1)
      let best: Value = null
      for (let k = 0; k < list.length; k++) {
        const v = list[k]
        if (v === null || v instanceof FormulaError || typeof v !== typeof x) continue
        const c = compare(v, x)
        if (mode === 1 ? c > 0 && (best === null || compare(v, best) < 0) : c < 0 && (best === null || compare(v, best) > 0)) {
          best = v
          i = k
        }
      }
    }
  } else throw ERR.VALUE
  if (i < 0) {
    if (notFound !== undefined) return notFound
    throw ERR.NA
  }
  if (rev) i = list.length - 1 - i
  return slice(a[2], ret, i, vertical)
}

function lookup(a: Val[], ev: Ev): Value {
  const x = lookupValue(a[0], ev)
  const d = grid(a[1], ev)
  let keys: Value[]
  let vals: Value[]
  if (a.length > 2) {
    keys = flat(d)
    vals = flat(grid(a[2], ev))
  } else if (d[0].length > d.length) {
    keys = d[0]
    vals = d[d.length - 1]
  } else {
    keys = d.map((r) => r[0])
    vals = d.map((r) => r[r.length - 1])
  }
  const i = findApprox(keys, x, 1)
  if (i < 0 || i >= vals.length) throw ERR.NA
  return vals[i]
}

function index(a: Val[], ev: Ev): Val {
  let src = a[0]
  if (src instanceof UnionV) {
    const k = a.length > 3 ? int(ev.scalar(a[3])) : 1
    if (k < 1 || k > src.areas.length) throw ERR.REF
    src = src.areas[k - 1]
  }
  const h = src instanceof RangeV || src instanceof ArrayV ? src.h : 1
  const w = src instanceof RangeV || src instanceof ArrayV ? src.w : 1
  let r = int(ev.scalar(a[1]))
  let c: number
  if (a.length > 2) c = int(ev.scalar(a[2]))
  else if (h === 1) [r, c] = [1, r]
  else if (w === 1) c = 1
  else c = 0
  if (r < 0 || c < 0 || r > h || c > w) throw ERR.REF
  if (src instanceof RangeV) {
    const [r0, r1] = r ? [src.r0 + r - 1, src.r0 + r - 1] : [src.r0, src.r1]
    const [c0, c1] = c ? [src.c0 + c - 1, src.c0 + c - 1] : [src.c0, src.c1]
    return new RangeV(src.sheet, r0, c0, r1, c1)
  }
  if (src instanceof ArrayV) {
    const rows = r ? [src.data[r - 1]] : src.data
    const out = rows.map((row) => (c ? [row[c - 1]] : row))
    return out.length === 1 && out[0].length === 1 ? out[0][0] : new ArrayV(out)
  }
  return src
}

function offset(a: Val[], ev: Ev): Val {
  const ref = a[0]
  if (!(ref instanceof RangeV)) throw ERR.VALUE
  const dr = int(ev.scalar(a[1]))
  const dc = int(ev.scalar(a[2]))
  const h = a.length > 3 && a[3] !== null ? int(ev.scalar(a[3])) : ref.h
  const w = a.length > 4 && a[4] !== null ? int(ev.scalar(a[4])) : ref.w
  if (h === 0 || w === 0) throw ERR.REF
  let r0 = ref.r0 + dr
  let c0 = ref.c0 + dc
  let r1 = r0 + h - 1
  let c1 = c0 + w - 1
  if (h < 0) [r0, r1] = [r0 + h + 1, r0]
  if (w < 0) [c0, c1] = [c0 + w + 1, c0]
  if (r0 < 0 || c0 < 0 || r1 > MAX_ROW || c1 > MAX_COL) throw ERR.REF
  return new RangeV(ref.sheet, r0, c0, r1, c1)
}

/** R1C1 text (absolute R2C3 or relative R[1]C[-1]) relative to the formula cell. */
function parseR1C1(text: string, ev: Ev): RefAddr | null {
  const m = /^(?:(?:'((?:[^']|'')+)'|([^'!]+))!)?(R(\[-?\d+\]|\d*)C(\[-?\d+\]|\d*))(?::(R(\[-?\d+\]|\d*)C(\[-?\d+\]|\d*)))?$/i.exec(text.trim())
  if (!m) return null
  const part = (t: string, base: number) => (t === '' ? base : t[0] === '[' ? base + Number(t.slice(1, -1)) : Number(t) - 1)
  const r0 = part(m[4], ev.r)
  const c0 = part(m[5], ev.c)
  const r1 = m[6] ? part(m[7], ev.r) : r0
  const c1 = m[6] ? part(m[8], ev.c) : c0
  const sheet = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]
  return {
    sheet,
    kind: 'area',
    r0: Math.min(r0, r1),
    c0: Math.min(c0, c1),
    r1: Math.max(r0, r1),
    c1: Math.max(c0, c1),
    ar0: true,
    ac0: true,
    ar1: true,
    ac1: true,
  }
}

function indirect(a: Val[], ev: Ev): Val {
  const text = str(ev.scalar(a[0]))
  const a1 = a.length > 1 ? bool(ev.scalar(a[1])) : true
  const ref = a1 ? parseRefText(text) : parseR1C1(text, ev)
  if (!ref || ref.r0 < 0 || ref.c0 < 0 || ref.r1 > MAX_ROW || ref.c1 > MAX_COL) throw ERR.REF
  if (ref.sheet !== undefined && !ev.hasSheet(ref.sheet)) throw ERR.REF
  return new RangeV(ref.sheet ?? ev.sheet, ref.r0, ref.c0, ref.r1, ref.c1)
}

function rowcol(a: Val[], ev: Ev, top: boolean, isRow: boolean): Val {
  if (!a.length || a[0] === null) return (isRow ? ev.r : ev.c) + 1
  const v = a[0]
  if (!(v instanceof RangeV)) throw ERR.VALUE
  const start = isRow ? v.r0 : v.c0
  const n = isRow ? v.h : v.w
  if (n === 1 || top) return start + 1
  const seq = Array.from({ length: n }, (_, k) => start + k + 1)
  return new ArrayV(isRow ? seq.map((x) => [x]) : [seq])
}

function dims(v: Val, rows: boolean): number {
  if (v instanceof RangeV || v instanceof ArrayV) return rows ? v.h : v.w
  if (v instanceof UnionV) throw ERR.REF
  if (v instanceof FormulaError) throw v
  return 1
}

export const LOOKUP: Record<string, FnDef> = {
  VLOOKUP: A(3, 4, (a, ev) => vhlookup(a, ev, true)),
  HLOOKUP: A(3, 4, (a, ev) => vhlookup(a, ev, false)),
  XLOOKUP: A(3, 6, xlookup),
  MATCH: A(2, 3, match),
  LOOKUP: A(2, 3, lookup),
  INDEX: A(2, 4, index),
  OFFSET: A(3, 5, offset),
  INDIRECT: A(1, 2, indirect),
  ROW: A(0, 1, (a, ev, top) => rowcol(a, ev, top, true)),
  COLUMN: A(0, 1, (a, ev, top) => rowcol(a, ev, top, false)),
  ROWS: A(1, 1, ([v]) => dims(v, true)),
  COLUMNS: A(1, 1, ([v]) => dims(v, false)),
}
