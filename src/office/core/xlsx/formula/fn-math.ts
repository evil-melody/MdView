/** Math functions. */
import { A, INF, nums, opt, S, type Ev, type FnDef } from './fn'
import { roundHalf } from './format'
import { ERR } from './types'
import { int, num, type Val } from './values'

/** Remove binary noise (15 significant digits). */
const clean = (x: number) => Number(x.toPrecision(15))

function roundDir(x: number, d: number, up: boolean): number {
  if (d > 15) return x
  const f = Math.pow(10, Math.abs(d))
  const ax = Math.abs(x)
  let y = clean(d >= 0 ? ax * f : ax / f)
  y = up ? Math.ceil(y) : Math.floor(y)
  const r = d >= 0 ? y / f : y * f
  return x < 0 ? -r : r
}

function finite(x: number): number {
  if (!Number.isFinite(x)) throw ERR.NUM
  return x
}

/** multiple of `sig` via ceil/floor of the (noise-free) quotient */
const multiple = (x: number, sig: number, up: boolean) => clean((up ? Math.ceil : Math.floor)(clean(x / sig)) * sig)

function gcd2(a: number, b: number): number {
  while (b) [a, b] = [b, a % b]
  return a
}

function intArgs(args: Val[], ev: Ev): number[] {
  return nums(args, ev).map((n) => {
    if (n < 0) throw ERR.NUM
    return Math.trunc(n)
  })
}

export const MATH: Record<string, FnDef> = {
  ABS: S(1, 1, ([x]) => Math.abs(num(x))),
  ROUND: S(2, 2, ([x, d]) => roundHalf(num(x), int(d))),
  ROUNDUP: S(2, 2, ([x, d]) => roundDir(num(x), int(d), true)),
  ROUNDDOWN: S(2, 2, ([x, d]) => roundDir(num(x), int(d), false)),
  TRUNC: S(1, 2, (a) => roundDir(num(a[0]), Math.trunc(opt(a, 1, 0)), false)),
  INT: S(1, 1, ([x]) => Math.floor(num(x))),
  MOD: S(2, 2, ([x, y]) => {
    const n = num(x)
    const d = num(y)
    if (d === 0) throw ERR.DIV0
    return clean(n - d * Math.floor(n / d))
  }),
  POWER: S(2, 2, ([x, y]) => {
    const b = num(x)
    const e = num(y)
    if (b === 0 && e === 0) throw ERR.NUM
    if (b === 0 && e < 0) throw ERR.DIV0
    const r = Math.pow(b, e)
    if (Number.isNaN(r)) throw ERR.NUM
    return finite(r)
  }),
  SQRT: S(1, 1, ([x]) => {
    const n = num(x)
    if (n < 0) throw ERR.NUM
    return Math.sqrt(n)
  }),
  EXP: S(1, 1, ([x]) => finite(Math.exp(num(x)))),
  LN: S(1, 1, ([x]) => {
    const n = num(x)
    if (n <= 0) throw ERR.NUM
    return Math.log(n)
  }),
  LOG: S(1, 2, (a) => {
    const n = num(a[0])
    const b = opt(a, 1, 10)
    if (n <= 0 || b <= 0) throw ERR.NUM
    if (b === 1) throw ERR.DIV0
    return clean(Math.log(n) / Math.log(b))
  }),
  LOG10: S(1, 1, ([x]) => {
    const n = num(x)
    if (n <= 0) throw ERR.NUM
    return Math.log10(n)
  }),
  PI: A(0, 0, () => Math.PI),
  SIGN: S(1, 1, ([x]) => Math.sign(num(x))),
  CEILING: S(1, 2, (a) => {
    const x = num(a[0])
    const sig = opt(a, 1, 1)
    if (sig === 0 || x === 0) return 0
    if (x > 0 && sig < 0) throw ERR.NUM
    return multiple(x, sig, true)
  }),
  FLOOR: S(1, 2, (a) => {
    const x = num(a[0])
    const sig = opt(a, 1, 1)
    if (sig === 0) throw ERR.DIV0
    if (x > 0 && sig < 0) throw ERR.NUM
    return multiple(x, sig, false)
  }),
  'CEILING.MATH': S(1, 3, (a) => {
    const x = num(a[0])
    const sig = Math.abs(opt(a, 1, 1))
    if (sig === 0 || x === 0) return 0
    if (x < 0 && opt(a, 2, 0) !== 0) return -multiple(-x, sig, true)
    return multiple(x, sig, true)
  }),
  'FLOOR.MATH': S(1, 3, (a) => {
    const x = num(a[0])
    const sig = Math.abs(opt(a, 1, 1))
    if (sig === 0 || x === 0) return 0
    if (x < 0 && opt(a, 2, 0) !== 0) return -multiple(-x, sig, false)
    return multiple(x, sig, false)
  }),
  RAND: A(0, 0, () => Math.random()),
  RANDBETWEEN: S(2, 2, ([a, b]) => {
    const lo = Math.ceil(num(a))
    const hi = Math.floor(num(b))
    if (lo > hi) throw ERR.NUM
    return lo + Math.floor(Math.random() * (hi - lo + 1))
  }),
  FACT: S(1, 1, ([x]) => {
    const n = Math.trunc(num(x))
    if (n < 0) throw ERR.NUM
    let r = 1
    for (let i = 2; i <= n; i++) r *= i
    return finite(r)
  }),
  EVEN: S(1, 1, ([x]) => {
    const n = num(x)
    const v = Math.ceil(clean(Math.abs(n) / 2)) * 2
    return n < 0 ? -v : v
  }),
  ODD: S(1, 1, ([x]) => {
    const n = num(x)
    let v = Math.ceil(clean(Math.abs(n)))
    if (v % 2 === 0) v++
    return n < 0 ? -v : v
  }),
  GCD: A(1, INF, (a, ev) => intArgs(a, ev).reduce((g, n) => gcd2(g, n), 0)),
  LCM: A(1, INF, (a, ev) =>
    finite(intArgs(a, ev).reduce((l, n) => (l === 0 || n === 0 ? 0 : (l / gcd2(l, n)) * n), 1)),
  ),
}
