/** Formula text rewriting (fill/copy, row/col insert/delete, sheet rename) and dependency extraction. */
import { tokenize, type Token } from './lexer'
import type { Ast } from './parser'
import { fmtRef, normalizeRef, quoteSheet, refInBounds, sameSheet, type RefAddr } from './refs'
import { MAX_COL, MAX_ROW, type CellRef, type RangeRef } from './types'

/** Re-emit `text`, replacing tokens for which `map` returns a string. Unlexable text is returned unchanged. */
function rewrite(text: string, map: (t: Token) => string | undefined): string {
  const lead = text.startsWith('=') ? '=' : ''
  const src = text.slice(lead.length)
  let toks: Token[]
  try {
    toks = tokenize(src)
  } catch {
    return text
  }
  let out = lead
  let pos = 0
  for (const t of toks) {
    const rep = map(t)
    if (rep === undefined) continue
    out += src.slice(pos, t.s) + rep
    pos = t.e
  }
  return out + src.slice(pos)
}

const refError = (t: Token & { t: 'ref' }) => (t.ref.sheet === undefined ? '' : `${t.sheetText ?? quoteSheet(t.ref.sheet)}!`) + '#REF!'

/** Copy/fill: shift relative parts of every reference by (dr, dc). Out-of-sheet results become #REF!. */
export function translateFormula(text: string, dr: number, dc: number): string {
  if (!dr && !dc) return text
  return rewrite(text, (t) => {
    if (t.t !== 'ref') return undefined
    const a: RefAddr = { ...t.ref }
    if (a.kind !== 'cols') {
      if (!a.ar0) a.r0 += dr
      if (!a.ar1) a.r1 += dr
    }
    if (a.kind !== 'rows') {
      if (!a.ac0) a.c0 += dc
      if (!a.ac1) a.c1 += dc
    }
    if (!refInBounds(a)) return refError(t)
    return fmtRef(normalizeRef(a), t.sheetText)
  })
}

/** New [lo, hi] after inserting (delta>0) / deleting (delta<0) at `at`; null when entirely deleted. */
function shiftSpan(lo: number, hi: number, at: number, delta: number, max: number): [number, number] | null {
  if (delta > 0) {
    if (lo >= at) lo += delta
    if (hi >= at) hi += delta
    if (lo > max) return null
    return [lo, Math.min(hi, max)]
  }
  const n = -delta
  const end = at + n
  if (hi < at) return [lo, hi]
  if (lo >= end) return [lo - n, hi - n]
  if (lo >= at && hi < end) return null
  return [lo < at ? lo : at, hi >= end ? hi - n : at - 1]
}

export interface ShiftOp {
  /** sheet whose rows/cols change (undefined: the formula's own sheet) */
  sheet?: string
  /** sheet the formula lives on (unqualified refs belong to it; undefined: same as `sheet`) */
  formulaSheet?: string
  axis: 'row' | 'col'
  /** 0-based index of the first inserted/deleted row/col */
  at: number
  /** >0 insert count, <0 delete count */
  delta: number
}

/** Rewrite references after inserting/deleting rows or columns. */
export function shiftFormula(text: string, op: ShiftOp): string {
  if (!op.delta) return text
  const affects = (refSheet: string | undefined): boolean => {
    if (op.sheet === undefined) return refSheet === undefined || (op.formulaSheet !== undefined && sameSheet(refSheet, op.formulaSheet))
    const s = refSheet ?? op.formulaSheet
    return s === undefined || sameSheet(s, op.sheet)
  }
  return rewrite(text, (t) => {
    if (t.t !== 'ref' || !affects(t.ref.sheet)) return undefined
    const a: RefAddr = { ...t.ref }
    if (op.axis === 'row') {
      if (a.kind === 'cols') return undefined
      const s = shiftSpan(a.r0, a.r1, op.at, op.delta, MAX_ROW)
      if (!s) return refError(t)
      ;[a.r0, a.r1] = s
    } else {
      if (a.kind === 'rows') return undefined
      const s = shiftSpan(a.c0, a.c1, op.at, op.delta, MAX_COL)
      if (!s) return refError(t)
      ;[a.c0, a.c1] = s
    }
    if (a.r0 === t.ref.r0 && a.r1 === t.ref.r1 && a.c0 === t.ref.c0 && a.c1 === t.ref.c1) return undefined
    return fmtRef(a, t.sheetText)
  })
}

/** Rename sheet qualifiers (`Old!A1`, `'Old'!A1:B2`, `Old!#REF!`, `Old!Name`). */
export function renameSheetInFormula(text: string, oldName: string, newName: string): string {
  const pre = `${quoteSheet(newName)}!`
  return rewrite(text, (t) => {
    if (t.t === 'ref' && t.ref.sheet !== undefined && sameSheet(t.ref.sheet, oldName))
      return fmtRef({ ...t.ref, sheet: newName })
    if ((t.t === 'err' || t.t === 'name') && t.sheet !== undefined && sameSheet(t.sheet, oldName)) return pre + t.v
    return undefined
  })
}

function toRef(a: RefAddr): CellRef | RangeRef {
  const sheet = a.sheet === undefined ? {} : { sheet: a.sheet }
  if (a.kind === 'cell') return { ...sheet, r: a.r0, c: a.c0, absR: a.ar0, absC: a.ac0 }
  return { ...sheet, r0: a.r0, c0: a.c0, r1: a.r1, c1: a.c1 }
}

/** Every cell/range the formula reads directly (static references; INDIRECT/OFFSET targets are dynamic). */
export function references(ast: Ast): (CellRef | RangeRef)[] {
  const out: (CellRef | RangeRef)[] = []
  const walk = (n: Ast): void => {
    switch (n.type) {
      case 'ref':
        out.push(toRef(n.ref))
        break
      case 'range':
        if (n.left.type === 'ref' && n.right.type === 'ref' && sameSheet(n.left.ref.sheet, n.right.ref.sheet)) {
          const l = n.left.ref
          const r = n.right.ref
          out.push(
            toRef({ ...l, kind: 'area', r0: Math.min(l.r0, r.r0), c0: Math.min(l.c0, r.c0), r1: Math.max(l.r1, r.r1), c1: Math.max(l.c1, r.c1) }),
          )
        } else {
          walk(n.left)
          walk(n.right)
        }
        break
      case 'unary':
      case 'percent':
        walk(n.arg)
        break
      case 'binary':
        walk(n.left)
        walk(n.right)
        break
      case 'union':
        n.items.forEach(walk)
        break
      case 'call':
        n.args.forEach(walk)
        break
    }
  }
  walk(ast)
  return out
}
