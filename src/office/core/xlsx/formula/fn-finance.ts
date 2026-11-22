/** Financial functions: PMT / FV / PV / NPER / RATE / NPV / IRR (Excel semantics, `type` = 0 end / 1 beginning). */
import { A, S, eachNum, type Ev, type FnDef } from './fn'
import { ERR } from './types'
import { num, type Val } from './values'
import type { Value } from './types'

/** scalar argument → number (errors propagate)
 *  S() 已经把区间/数组折算成标量再传进来，运行时这里总是 Value。 */
function sc(v: Val): number {
  return num(v as Value)
}

/** 0 = 期末（默认），1 = 期初 */
function when(t: Val | undefined): number {
  if (t === undefined) return 0
  const n = sc(t)
  return n === 0 ? 0 : 1
}

/** (1+r)^n */
function pow1(r: number, n: number): number {
  return Math.pow(1 + r, n)
}

/** PMT = -(pv*(1+r)^n + fv) * r / ((1+r)^n - 1) / (1 + r*type) */
function pmt(r: number, n: number, pv: number, fv: number, type: number): number {
  if (r === 0) return -(pv + fv) / n
  const p = pow1(r, n)
  return (-(pv * p + fv) * r) / ((p - 1) * (1 + r * type))
}

/** FV = -(pv*(1+r)^n + pmt*(1+r*type)*((1+r)^n - 1)/r) */
function fv(r: number, n: number, p: number, pv: number, type: number): number {
  if (r === 0) return -(pv + p * n)
  const g = pow1(r, n)
  return -(pv * g + p * (1 + r * type) * ((g - 1) / r))
}

/** PV = -(fv + pmt*(1+r*type)*((1+r)^n - 1)/r) / (1+r)^n */
function pv(r: number, n: number, p: number, f: number, type: number): number {
  if (r === 0) return -(f + p * n)
  const g = pow1(r, n)
  return -(f + p * (1 + r * type) * ((g - 1) / r)) / g
}

/** NPER: number of periods for an investment */
function nper(r: number, p: number, pv0: number, f: number, type: number): number {
  if (r === 0) return -(pv0 + f) / p
  const k = p * (1 + r * type)
  const top = k - f * r
  const bot = k + pv0 * r
  if (top / bot <= 0) throw ERR.NUM
  return Math.log(top / bot) / Math.log(1 + r)
}

/** RATE: the interest rate of an annuity (Newton with a numeric derivative) */
function rate(n: number, p: number, pv0: number, f: number, type: number, guess: number): number {
  const f0 = (r: number) => pv0 * pow1(r, n) + p * (1 + r * type) * ((pow1(r, n) - 1) / (r === 0 ? 1e-12 : r)) + f
  let r = guess
  for (let i = 0; i < 200; i++) {
    const y = f0(r)
    if (!Number.isFinite(y)) throw ERR.NUM
    if (Math.abs(y) < 1e-9) return r
    const d = 1e-6
    const y2 = f0(r + d)
    const der = (y2 - y) / d
    if (!Number.isFinite(der) || der === 0) break
    const next = r - y / der
    if (!Number.isFinite(next)) break
    if (Math.abs(next - r) < 1e-12) return next
    r = next
    if (r <= -0.999999) r = -0.999999
  }
  // fallback: bisection on the bracket around the guess
  let lo = Math.max(-0.999999, guess - 1)
  let hi = guess + 1
  let flo = f0(lo)
  let fhi = f0(hi)
  for (let i = 0; i < 200 && flo * fhi > 0; i++) {
    hi = guess + (hi - guess) * 2
    if (hi > 1000) break
    fhi = f0(hi)
  }
  if (flo * fhi > 0) throw ERR.NUM
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const y = f0(mid)
    if (Math.abs(y) < 1e-10) return mid
    if (flo * y <= 0) { hi = mid; fhi = y } else { lo = mid; flo = y }
  }
  return (lo + hi) / 2
}

/** the numbers of a range argument (NPV / IRR take ranges) */
function numsOf(args: Val[], ev: Ev, from: number): number[] {
  const out: number[] = []
  eachNum(args.slice(from), ev, (n) => out.push(n))
  return out
}

export const FINANCE: Record<string, FnDef> = {
  PMT: S(3, 5, (a) => pmt(sc(a[0]), sc(a[1]), sc(a[2]), a.length > 3 ? sc(a[3]) : 0, a.length > 4 ? when(a[4]) : 0)),
  FV: S(3, 5, (a) => fv(sc(a[0]), sc(a[1]), sc(a[2]), a.length > 3 ? sc(a[3]) : 0, a.length > 4 ? when(a[4]) : 0)),
  PV: S(3, 5, (a) => pv(sc(a[0]), sc(a[1]), sc(a[2]), a.length > 3 ? sc(a[3]) : 0, a.length > 4 ? when(a[4]) : 0)),
  NPER: S(3, 5, (a) => nper(sc(a[0]), sc(a[1]), sc(a[2]), a.length > 3 ? sc(a[3]) : 0, a.length > 4 ? when(a[4]) : 0)),
  RATE: S(3, 6, (a) =>
    rate(sc(a[0]), sc(a[1]), sc(a[2]), a.length > 3 ? sc(a[3]) : 0, a.length > 4 ? when(a[4]) : 0, a.length > 5 ? sc(a[5]) : 0.1),
  ),
  NPV: A(2, 255, (args, ev) => {
    const r = sc(args[0])
    if (r <= -1) throw ERR.NUM
    const vals = numsOf(args, ev, 1)
    let sum = 0
    for (let i = 0; i < vals.length; i++) sum += vals[i] / Math.pow(1 + r, i + 1)
    return sum
  }),
  IRR: A(1, 2, (args, ev) => {
    const vals = numsOf(args, ev, 0)
    if (vals.length < 2) throw ERR.NUM
    const guess = args.length > 1 ? sc(args[1]) : 0.1
    const f = (r: number) => {
      let s = 0
      for (let i = 0; i < vals.length; i++) s += vals[i] / Math.pow(1 + r, i)
      return s
    }
    let r = guess
    for (let i = 0; i < 200; i++) {
      const y = f(r)
      if (Math.abs(y) < 1e-10) return r
      const d = 1e-6
      const der = (f(r + d) - y) / d
      if (!Number.isFinite(der) || der === 0) break
      const next = r - y / der
      if (!Number.isFinite(next)) break
      if (Math.abs(next - r) < 1e-12) return next
      r = next
      if (r <= -0.999999) r = -0.999999
    }
    // bisection fallback around the guess
    let lo = Math.max(-0.999999, guess - 0.9)
    let hi = guess + 0.9
    let flo = f(lo)
    let fhi = f(hi)
    for (let i = 0; i < 100 && flo * fhi > 0; i++) {
      lo = Math.max(-0.999999, lo - 0.5)
      flo = f(lo)
      if (flo * fhi <= 0) break
    }
    if (flo * fhi > 0) throw ERR.NUM
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2
      const y = f(mid)
      if (Math.abs(y) < 1e-10) return mid
      if (flo * y <= 0) { hi = mid; fhi = y } else { lo = mid; flo = y }
    }
    return (lo + hi) / 2
  }),
}
