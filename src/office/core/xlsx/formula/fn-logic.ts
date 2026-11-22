/** Logical and information functions. */
import { A, INF, L, pick, S, visit, type Ev, type FnDef } from './fn'
import type { Ast } from './parser'
import { ERR, ERROR_CODES, FormulaError, type Value } from './types'
import { ArrayV, bool, compare, int, num, toBool, valueEq, type Val } from './values'

/** Evaluate an argument of a pass-through function (missing => 0). */
const arg = (a: Ast, ev: Ev, top: boolean): Val => (a.type === 'missing' ? 0 : ev.eval(a, top))

function logicals(args: Val[], ev: Ev): boolean[] {
  const out: boolean[] = []
  for (const a of args)
    visit(
      a,
      ev,
      (v) => {
        if (typeof v === 'boolean') out.push(v)
        else if (typeof v === 'number') out.push(v !== 0)
        else if (v instanceof FormulaError) throw v
      },
      (v) => out.push(bool(v)),
    )
  if (!out.length) throw ERR.VALUE
  return out
}

/** IF; element-wise when the condition is an array (array formulas). */
const IF = L(2, 3, (a, ev, top) => {
  const cond = ev.operand(ev.eval(a[0], top), top)
  const thenA = a[1]
  const elseA = a[2] as Ast | undefined
  if (!Array.isArray(cond)) {
    const b = toBool(cond)
    if (b instanceof FormulaError) return b
    if (b) return arg(thenA, ev, top)
    return elseA ? arg(elseA, ev, top) : false
  }
  const t = ev.operand(arg(thenA, ev, false), false)
  const f = elseA ? ev.operand(arg(elseA, ev, false), false) : false
  const out = cond.map((row, i) =>
    row.map((c, j): Value => {
      const b = toBool(c)
      if (b instanceof FormulaError) return b
      const src = b ? t : f
      return Array.isArray(src) ? pick(src, i, j) : src
    }),
  )
  return new ArrayV(out)
})

/** IFERROR / IFNA; element-wise over arrays. */
function iferror(naOnly: boolean) {
  return L(2, 2, (a, ev, top) => {
    const raw = ev.eval(a[0], top)
    const v = ev.operand(raw, top)
    const hit = (x: Value) => x instanceof FormulaError && (!naOnly || x.code === '#N/A')
    if (Array.isArray(v)) {
      if (!v.some((row) => row.some(hit))) return raw
      const alt = ev.scalar(arg(a[1], ev, false))
      return new ArrayV(v.map((row) => row.map((x) => (hit(x) ? alt : x))))
    }
    return hit(v) ? arg(a[1], ev, top) : v
  })
}

export const LOGIC: Record<string, FnDef> = {
  IF,
  IFS: L(2, INF, (a, ev, top) => {
    if (a.length % 2) return ERR.VALUE
    for (let i = 0; i < a.length; i += 2) {
      const c = ev.scalar(ev.eval(a[i], top))
      if (c instanceof FormulaError) return c
      if (bool(c)) return arg(a[i + 1], ev, top)
    }
    return ERR.NA
  }),
  IFERROR: iferror(false),
  IFNA: iferror(true),
  AND: A(1, INF, (a, ev) => logicals(a, ev).every(Boolean)),
  OR: A(1, INF, (a, ev) => logicals(a, ev).some(Boolean)),
  XOR: A(1, INF, (a, ev) => logicals(a, ev).filter(Boolean).length % 2 === 1),
  NOT: S(1, 1, ([x]) => !bool(x)),
  TRUE: A(0, 0, () => true),
  FALSE: A(0, 0, () => false),
  SWITCH: L(3, INF, (a, ev, top) => {
    const x = ev.scalar(ev.eval(a[0], top))
    if (x instanceof FormulaError) return x
    let i = 1
    for (; i + 1 < a.length; i += 2) {
      const v = ev.scalar(arg(a[i], ev, top))
      if (v instanceof FormulaError) return v
      if (valueEq(x, v) || (x === null && compare(x, v) === 0)) return arg(a[i + 1], ev, top)
    }
    return i < a.length ? arg(a[i], ev, top) : ERR.NA
  }),
  CHOOSE: L(2, INF, (a, ev, top) => {
    const i = int(ev.scalar(ev.eval(a[0], top)))
    if (i < 1 || i >= a.length) return ERR.VALUE
    return arg(a[i], ev, top)
  }),

  ISBLANK: S(1, 1, ([x]) => x === null),
  ISNUMBER: S(1, 1, ([x]) => typeof x === 'number'),
  ISTEXT: S(1, 1, ([x]) => typeof x === 'string'),
  ISNONTEXT: S(1, 1, ([x]) => typeof x !== 'string'),
  ISLOGICAL: S(1, 1, ([x]) => typeof x === 'boolean'),
  ISERROR: S(1, 1, ([x]) => x instanceof FormulaError),
  ISERR: S(1, 1, ([x]) => x instanceof FormulaError && x.code !== '#N/A'),
  ISNA: S(1, 1, ([x]) => x instanceof FormulaError && x.code === '#N/A'),
  ISEVEN: S(1, 1, ([x]) => Math.trunc(num(x)) % 2 === 0),
  ISODD: S(1, 1, ([x]) => Math.abs(Math.trunc(num(x))) % 2 === 1),
  NA: A(0, 0, () => ERR.NA),
  'ERROR.TYPE': S(1, 1, ([x]) => (x instanceof FormulaError ? ERROR_CODES.indexOf(x.code) + 1 : ERR.NA)),
  N: S(1, 1, ([x]) => {
    if (x instanceof FormulaError) return x
    return typeof x === 'number' ? x : typeof x === 'boolean' ? (x ? 1 : 0) : 0
  }),
  T: S(1, 1, ([x]) => (x instanceof FormulaError ? x : typeof x === 'string' ? x : '')),
}
