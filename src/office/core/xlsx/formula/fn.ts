/** Function-definition plumbing: evaluator interface, arity, array lifting, argument visitors. */
import type { Ast } from './parser'
import { ERR, FormulaError, type Value } from './types'
import { ArrayV, RangeV, UnionV, toNum, type Val } from './values'

/** What a function implementation may ask of the evaluator. */
export interface Ev {
  readonly sheet: string | undefined
  /** 0-based formula cell position */
  readonly r: number
  readonly c: number
  eval(ast: Ast, top: boolean): Val
  cell(sheet: string | undefined, r: number, c: number): Value
  /** visit cells of a range (whole-row/col ranges clipped to the provider's bounds) */
  forEach(rg: RangeV, cb: (v: Value, i: number, j: number) => void): void
  /** 2-D values of a range/array/scalar (clipped like forEach); unions -> #VALUE! thrown */
  toArray(v: Val): Value[][]
  /** single value: 1x1 range -> cell, larger range -> implicit intersection, array -> top-left */
  scalar(v: Val): Value
  /** operator operand: scalar, or 2-D data when array-evaluated (top=false) */
  operand(v: Val, top: boolean): Value | Value[][]
  hasSheet(name: string): boolean
  now(): Date
}

export type EagerFn = (args: Val[], ev: Ev, top: boolean) => Val
export type LazyFn = (args: Ast[], ev: Ev, top: boolean) => Val

export type FnDef =
  /** args evaluated first; `scalarArgs` => args inherit the caller's top-level (implicit intersection) context */
  | { kind: 'eager'; min: number; max: number; scalarArgs: boolean; fn: EagerFn }
  /** receives unevaluated args (IF, IFERROR, CHOOSE, ...) */
  | { kind: 'lazy'; min: number; max: number; fn: LazyFn }

export const INF = Number.POSITIVE_INFINITY

/** Run f, converting a thrown FormulaError into a value. */
export function guard<T>(f: () => T): T | FormulaError {
  try {
    return f()
  } catch (e) {
    if (e instanceof FormulaError) return e
    throw e
  }
}

/** Pick (i,j) from 2-D data with 1-row/1-col broadcasting; out of shape -> #N/A. */
export function pick(d: Value[][], i: number, j: number): Value {
  const r = d.length === 1 ? 0 : i
  const c = d[0].length === 1 ? 0 : j
  return r < d.length && c < d[0].length ? d[r][c] : ERR.NA
}

/**
 * Scalar function, lifted element-wise over array arguments (array formulas / SUMPRODUCT(LEN(A1:A3))).
 * At the formula top level a multi-cell range argument is implicitly intersected instead.
 */
export function S(min: number, max: number, f: (a: Value[], ev: Ev) => Value): FnDef {
  return {
    kind: 'eager',
    min,
    max,
    scalarArgs: true,
    fn: (args, ev, top) => {
      let h = 1
      let w = 1
      let lifted = false
      const xs = args.map((a): Value | Value[][] => {
        if (a instanceof RangeV) {
          if (a.h === 1 && a.w === 1) return ev.cell(a.sheet, a.r0, a.c0)
          if (top) return ev.scalar(a)
        } else if (a instanceof ArrayV) {
          if (a.h === 1 && a.w === 1) return a.data[0][0]
        } else if (a instanceof UnionV) return ERR.VALUE
        else return a
        const d = ev.toArray(a)
        lifted = true
        h = Math.max(h, d.length)
        w = Math.max(w, d[0].length)
        return d
      })
      if (!lifted) return guard(() => f(xs as Value[], ev))
      const out: Value[][] = []
      for (let i = 0; i < h; i++) {
        const row: Value[] = []
        for (let j = 0; j < w; j++) {
          const vals = xs.map((x) => (Array.isArray(x) ? pick(x, i, j) : x))
          row.push(guard(() => f(vals, ev)))
        }
        out.push(row)
      }
      return new ArrayV(out)
    },
  }
}

/** Function taking ranges/arrays as-is (args evaluated in array context). */
export function A(min: number, max: number, fn: EagerFn): FnDef {
  return { kind: 'eager', min, max, scalarArgs: false, fn }
}

/** Lazy function (receives ASTs). */
export function L(min: number, max: number, fn: LazyFn): FnDef {
  return { kind: 'lazy', min, max, fn }
}

/** Visit every value of an argument: cells/array items via `inRange`, direct scalars via `direct`. */
export function visit(a: Val, ev: Ev, inRange: (v: Value) => void, direct: (v: Value) => void): void {
  if (a instanceof RangeV) ev.forEach(a, inRange)
  else if (a instanceof UnionV) for (const r of a.areas) ev.forEach(r, inRange)
  else if (a instanceof ArrayV) for (const row of a.data) for (const v of row) inRange(v)
  else direct(a)
}

/** Numbers of aggregate args: ranges contribute numbers only, direct scalars coerce; errors throw. */
export function eachNum(args: Val[], ev: Ev, cb: (n: number) => void): void {
  for (const a of args)
    visit(
      a,
      ev,
      (v) => {
        if (typeof v === 'number') cb(v)
        else if (v instanceof FormulaError) throw v
      },
      (v) => {
        const n = toNum(v)
        if (n instanceof FormulaError) throw n
        cb(n)
      },
    )
}

export function nums(args: Val[], ev: Ev): number[] {
  const out: number[] = []
  eachNum(args, ev, (n) => out.push(n))
  return out
}

/** Flatten a range/array to a row-major list. */
export function flat(d: Value[][]): Value[] {
  return d.length === 1 ? d[0] : d.flat()
}

/** Optional numeric arg i (missing argument => 0 like Excel; absent => def). */
export function opt(a: Value[], i: number, def: number): number {
  if (a.length <= i) return def
  const n = toNum(a[i])
  if (n instanceof FormulaError) throw n
  return n
}
