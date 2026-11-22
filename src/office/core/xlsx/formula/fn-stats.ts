/** Aggregate, statistical and criteria (*IF/*IFS) functions. */
import { A, eachNum, flat, INF, nums, visit, type Ev, type FnDef } from './fn'
import { ERR, FormulaError, type Value } from './types'
import { ArrayV, criteria, num, parseNumberText, RangeV, UnionV, type Val } from './values'

function sum(xs: number[]): number {
  let s = 0
  for (const x of xs) s += x
  return s
}

function mean(xs: number[]): number {
  if (!xs.length) throw ERR.DIV0
  return sum(xs) / xs.length
}

function variance(xs: number[], sample: boolean): number {
  const n = xs.length
  if (n < (sample ? 2 : 1)) throw ERR.DIV0
  const m = sum(xs) / n
  let ss = 0
  for (const x of xs) ss += (x - m) * (x - m)
  return ss / (sample ? n - 1 : n)
}

function median(xs: number[]): number {
  if (!xs.length) throw ERR.NUM
  const s = [...xs].sort((a, b) => a - b)
  const h = s.length >> 1
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2
}

function mode(xs: number[]): number {
  const counts = new Map<number, number>()
  let best = 0
  let bestN = 1
  for (const x of xs) {
    const n = (counts.get(x) ?? 0) + 1
    counts.set(x, n)
    if (n > bestN) {
      best = x
      bestN = n
    }
  }
  if (bestN < 2) throw ERR.NA
  // first value reaching the max count in order of appearance
  for (const x of xs) if (counts.get(x) === bestN) return x
  return best
}

/** Numbers from a single range/array argument (k-th largest etc.). */
function rangeNums(a: Val, ev: Ev): number[] {
  return nums([a], ev)
}

function kth(a: Val[], ev: Ev, largest: boolean): number {
  const xs = rangeNums(a[0], ev)
  const k = Math.ceil(num(ev.scalar(a[1])))
  if (k < 1 || k > xs.length) throw ERR.NUM
  xs.sort((x, y) => (largest ? y - x : x - y))
  return xs[k - 1]
}

function rank(a: Val[], ev: Ev): number {
  const x = num(ev.scalar(a[0]))
  const xs = rangeNums(a[1], ev)
  const asc = a.length > 2 && num(ev.scalar(a[2])) !== 0
  if (!xs.includes(x)) throw ERR.NA
  let r = 1
  for (const y of xs) if (asc ? y < x : y > x) r++
  return r
}

/** 2-D data of a criteria/value range argument. */
function grid(v: Val, ev: Ev): Value[][] {
  if (v instanceof UnionV) throw ERR.VALUE
  return ev.toArray(v)
}

/** Value range of SUMIF/AVERAGEIF: resized to the criteria range's shape from its top-left. */
function resized(v: Val, h: number, w: number, ev: Ev): Value[][] {
  if (v instanceof RangeV) return ev.toArray(new RangeV(v.sheet, v.r0, v.c0, v.r0 + h - 1, v.c0 + w - 1))
  return grid(v, ev)
}

/** Values of `values` where every (range, criteria) pair matches. Shapes must agree (#VALUE!). */
function matched(values: Value[][] | null, pairs: Val[], ev: Ev, base?: Value[][]): Value[] {
  const ranges: Value[][][] = []
  const tests: ((v: Value) => boolean)[] = []
  for (let i = 0; i < pairs.length; i += 2) {
    ranges.push(i === 0 && base ? base : grid(pairs[i], ev))
    tests.push(criteria(ev.scalar(pairs[i + 1])))
  }
  const h = ranges[0].length
  const w = ranges[0][0].length
  for (const r of ranges) if (r.length !== h || r[0].length !== w) throw ERR.VALUE
  if (values && (values.length !== h || values[0].length !== w)) throw ERR.VALUE
  const out: Value[] = []
  for (let i = 0; i < h; i++)
    for (let j = 0; j < w; j++) {
      let ok = true
      for (let k = 0; ok && k < ranges.length; k++) ok = tests[k](ranges[k][i][j])
      if (ok) out.push(values ? values[i][j] : true)
    }
  return out
}

/** Numbers among matched values (errors propagate). */
function numsOf(vs: Value[]): number[] {
  const out: number[] = []
  for (const v of vs) {
    if (typeof v === 'number') out.push(v)
    else if (v instanceof FormulaError) throw v
  }
  return out
}

/** *IF(range, criteria, [value_range]) */
function ifOne(a: Val[], ev: Ev): number[] {
  const base = grid(a[0], ev)
  const values = a.length > 2 && a[2] !== null ? resized(a[2], base.length, base[0].length, ev) : base
  return numsOf(matched(values, [a[0], a[1]], ev, base))
}

/** *IFS(value_range, range1, crit1, ...) */
function ifMany(a: Val[], ev: Ev): number[] {
  if (a.length % 2 === 0) throw ERR.VALUE
  return numsOf(matched(grid(a[0], ev), a.slice(1), ev))
}

function sumproduct(a: Val[], ev: Ev): number {
  const arrays = a.map((v) => grid(v, ev))
  const h = arrays[0].length
  const w = arrays[0][0].length
  for (const d of arrays) if (d.length !== h || d[0].length !== w) throw ERR.VALUE
  let s = 0
  for (let i = 0; i < h; i++)
    for (let j = 0; j < w; j++) {
      let p = 1
      for (const d of arrays) {
        const v = d[i][j]
        if (v instanceof FormulaError) throw v
        p *= typeof v === 'number' ? v : 0
      }
      s += p
    }
  return s
}

function minmax(xs: number[], max: boolean): number {
  if (!xs.length) return 0
  let m = xs[0]
  for (const x of xs) if (max ? x > m : x < m) m = x
  return m
}

export const STATS: Record<string, FnDef> = {
  SUM: A(0, INF, (a, ev) => {
    let s = 0
    eachNum(a, ev, (n) => (s += n))
    return s
  }),
  PRODUCT: A(0, INF, (a, ev) => {
    const xs = nums(a, ev)
    return xs.length ? xs.reduce((p, x) => p * x, 1) : 0
  }),
  AVERAGE: A(1, INF, (a, ev) => mean(nums(a, ev))),
  MIN: A(1, INF, (a, ev) => {
    let m = INF
    eachNum(a, ev, (n) => (m = Math.min(m, n)))
    return m === INF ? 0 : m
  }),
  MAX: A(1, INF, (a, ev) => {
    let m = -INF
    eachNum(a, ev, (n) => (m = Math.max(m, n)))
    return m === -INF ? 0 : m
  }),
  COUNT: A(0, INF, (a, ev) => {
    let n = 0
    for (const x of a)
      visit(
        x,
        ev,
        (v) => typeof v === 'number' && n++,
        (v) =>
          (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && parseNumberText(v) !== null)) &&
          n++,
      )
    return n
  }),
  COUNTA: A(1, INF, (a, ev) => {
    let n = 0
    for (const x of a)
      visit(
        x,
        ev,
        (v) => v !== null && n++,
        () => n++,
      )
    return n
  }),
  COUNTBLANK: A(1, 1, ([x], ev) => {
    if (x instanceof RangeV) {
      let seen = 0
      let blanks = 0
      ev.forEach(x, (v) => {
        seen++
        if (v === null || v === '') blanks++
      })
      return blanks + (x.h * x.w - seen)
    }
    if (x instanceof ArrayV) return flat(x.data).filter((v) => v === null || v === '').length
    throw ERR.VALUE
  }),
  MEDIAN: A(1, INF, (a, ev) => median(nums(a, ev))),
  MODE: A(1, INF, (a, ev) => mode(nums(a, ev))),
  'MODE.SNGL': A(1, INF, (a, ev) => mode(nums(a, ev))),
  STDEV: A(1, INF, (a, ev) => Math.sqrt(variance(nums(a, ev), true))),
  'STDEV.S': A(1, INF, (a, ev) => Math.sqrt(variance(nums(a, ev), true))),
  'STDEV.P': A(1, INF, (a, ev) => Math.sqrt(variance(nums(a, ev), false))),
  STDEVP: A(1, INF, (a, ev) => Math.sqrt(variance(nums(a, ev), false))),
  VAR: A(1, INF, (a, ev) => variance(nums(a, ev), true)),
  'VAR.S': A(1, INF, (a, ev) => variance(nums(a, ev), true)),
  'VAR.P': A(1, INF, (a, ev) => variance(nums(a, ev), false)),
  VARP: A(1, INF, (a, ev) => variance(nums(a, ev), false)),
  LARGE: A(2, 2, (a, ev) => kth(a, ev, true)),
  SMALL: A(2, 2, (a, ev) => kth(a, ev, false)),
  RANK: A(2, 3, rank),
  'RANK.EQ': A(2, 3, rank),
  SUMPRODUCT: A(1, INF, sumproduct),
  SUMIF: A(2, 3, (a, ev) => sum(ifOne(a, ev))),
  SUMIFS: A(3, INF, (a, ev) => sum(ifMany(a, ev))),
  AVERAGEIF: A(2, 3, (a, ev) => mean(ifOne(a, ev))),
  AVERAGEIFS: A(3, INF, (a, ev) => mean(ifMany(a, ev))),
  COUNTIF: A(2, 2, (a, ev) => matched(null, a, ev).length),
  COUNTIFS: A(2, INF, (a, ev) => {
    if (a.length % 2) throw ERR.VALUE
    return matched(null, a, ev).length
  }),
  MINIFS: A(3, INF, (a, ev) => minmax(ifMany(a, ev), false)),
  MAXIFS: A(3, INF, (a, ev) => minmax(ifMany(a, ev), true)),
}
