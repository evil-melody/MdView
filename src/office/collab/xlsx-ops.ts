/** XLSX collaboration operations (shared by the main-thread adapter and the worker) + their transforms. */
import type { CellInput, FindOptions, FmtPatch, Range, SheetOp } from '../core/xlsx/types'
import type { CommentOp } from './comments'

/** sheets are addressed by part path: indexes move when sheets are added / reordered */
export type PBookOp =
  | { op: 'add'; name?: string; after?: string }
  | { op: 'rename'; path: string; name: string }
  | { op: 'delete'; path: string }
  | { op: 'move'; path: string; to: number }

export type XOp =
  | { t: 'set'; id: string; sheet: string; cells: CellInput[] }
  | { t: 'fmt'; id: string; sheet: string; range: Range; patch: FmtPatch }
  | { t: 'sheet'; id: string; sheet: string; op: SheetOp }
  | { t: 'replace'; id: string; sheet: string; query: string; by: string; opts?: FindOptions; at?: { r: number; c: number } }
  | { t: 'book'; id: string; op: PBookOp }
  /** sets the cells changed by op `target` back to their state before (`prev`) or after (`next`) it */
  | { t: 'revert'; id: string; target: string; which: 'prev' | 'next' }
  /** a comment set / deleted; a thread's cell moves with inserted / deleted rows and columns */
  | (CommentOp & { id: string })

export const STRUCTURAL = new Set<SheetOp['op']>(['insertRows', 'deleteRows', 'insertCols', 'deleteCols'])

export const isStructural = (o: XOp) => o.t === 'book' || (o.t === 'sheet' && STRUCTURAL.has(o.op.op))

// ---------------------------------------------------------------- index shifting

/** index after `n` items were inserted (n > 0) or deleted (n < 0) at `at`; null when deleted */
export function shiftIdx(x: number, at: number, n: number): number | null {
  if (n >= 0) return x >= at ? x + n : x
  const d = -n
  return x < at ? x : x < at + d ? null : x - d
}

/** inclusive span [a, b] after an insert / delete; null when entirely deleted */
export function shiftSpan(a: number, b: number, at: number, n: number): [number, number] | null {
  if (n >= 0) return [a >= at ? a + n : a, b >= at ? b + n : b]
  const d = -n
  if (b < at) return [a, b]
  if (a >= at + d) return [a - d, b - d]
  const na = a < at ? a : at
  const nb = b < at + d ? at - 1 : b - d
  return nb < na ? null : [na, nb]
}

function shiftRange(r: Range, axis: 'row' | 'col', at: number, n: number): Range | null {
  const s = axis === 'row' ? shiftSpan(r.r0, r.r1, at, n) : shiftSpan(r.c0, r.c1, at, n)
  if (!s) return null
  return axis === 'row' ? { ...r, r0: s[0], r1: s[1] } : { ...r, c0: s[0], c1: s[1] }
}

function shiftSheetOp(op: SheetOp, axis: 'row' | 'col', at: number, n: number): SheetOp | null {
  const span = (a: number, b: number, ax: 'row' | 'col') => (ax === axis ? shiftSpan(a, b, at, n) : ([a, b] as [number, number]))
  switch (op.op) {
    case 'insertRows':
    case 'insertCols': {
      if ((op.op === 'insertRows') !== (axis === 'row')) return op
      // concurrent insert at the same place: the one sequenced first stays first
      const x = n >= 0 ? (op.at >= at ? op.at + n : op.at) : op.at < at ? op.at : op.at < at - n ? at : op.at + n
      return x === op.at ? op : { ...op, at: x }
    }
    case 'deleteRows':
    case 'deleteCols': {
      if ((op.op === 'deleteRows') !== (axis === 'row')) return op
      const s = shiftSpan(op.at, op.at + op.n - 1, at, n)
      return s ? { ...op, at: s[0], n: s[1] - s[0] + 1 } : null
    }
    case 'merge':
    case 'unmerge':
    case 'fill': {
      const range = shiftRange(op.range, axis, at, n)
      return range ? { ...op, range } : null
    }
    case 'sort': {
      const range = shiftRange(op.range, axis, at, n)
      if (!range) return null
      const col = axis === 'col' ? shiftIdx(op.col, at, n) : op.col
      return col === null ? null : { ...op, range, col }
    }
    case 'hideRows':
    case 'hideCols': {
      const s = span(op.a, op.b, op.op === 'hideRows' ? 'row' : 'col')
      return s ? { ...op, a: s[0], b: s[1] } : null
    }
    case 'colWidth': {
      const s = span(op.c0, op.c1, 'col')
      return s ? { ...op, c0: s[0], c1: s[1] } : null
    }
    case 'rowHeight': {
      const s = span(op.r0, op.r1, 'row')
      return s ? { ...op, r0: s[0], r1: s[1] } : null
    }
    default:
      return op
  }
}

/** `op` adjusted to apply after `prior` (deterministic) */
export function transformX(op: XOp, prior: XOp): XOp | null {
  if (op.t === 'comment') return transformComment(op, prior)
  if (prior.t === 'book') {
    if (prior.op.op === 'delete' && 'sheet' in op && op.sheet === prior.op.path) return null
    return op
  }
  if (prior.t !== 'sheet' || !STRUCTURAL.has(prior.op.op) || !('sheet' in op) || op.sheet !== prior.sheet) return op
  const p = prior.op as { op: string; at: number; n: number }
  const axis = p.op.endsWith('Rows') ? 'row' : 'col'
  const n = p.op.startsWith('insert') ? p.n : -p.n
  switch (op.t) {
    case 'set': {
      const cells: CellInput[] = []
      for (const c of op.cells) {
        const x = shiftIdx(axis === 'row' ? c.r : c.c, p.at, n)
        if (x !== null) cells.push(axis === 'row' ? { ...c, r: x } : { ...c, c: x })
      }
      return cells.length ? { ...op, cells } : null
    }
    case 'fmt': {
      const range = shiftRange(op.range, axis, p.at, n)
      return range ? { ...op, range } : null
    }
    case 'sheet': {
      const next = shiftSheetOp(op.op, axis, p.at, n)
      return next === op.op ? op : next ? { ...op, op: next } : null
    }
    case 'replace': {
      if (!op.at) return op
      const x = shiftIdx(axis === 'row' ? op.at.r : op.at.c, p.at, n)
      return x === null ? null : { ...op, at: axis === 'row' ? { ...op.at, r: x } : { ...op.at, c: x } }
    }
  }
  return op
}

/** a comment op after `prior`: its cell moved by inserted / deleted rows and columns; dropped with its cell or sheet */
function transformComment(op: Extract<XOp, { t: 'comment' }>, prior: XOp): XOp | null {
  const at = op.c?.at
  if (!at || !('sheet' in at)) return op
  if (prior.t === 'book') return prior.op.op === 'delete' && prior.op.path === at.sheet ? null : op
  if (prior.t !== 'sheet' || !STRUCTURAL.has(prior.op.op) || prior.sheet !== at.sheet) return op
  const p = prior.op as { op: string; at: number; n: number }
  const row = p.op.endsWith('Rows')
  const x = shiftIdx(row ? at.r : at.c, p.at, p.op.startsWith('insert') ? p.n : -p.n)
  if (x === null) return null
  if (x === (row ? at.r : at.c)) return op
  return { ...op, c: { ...op.c!, at: row ? { ...at, r: x } : { ...at, c: x } } }
}

// ---------------------------------------------------------------- footprint (for conflict detection)

const ALL: Range = { r0: 0, c0: 0, r1: Number.MAX_SAFE_INTEGER, c1: Number.MAX_SAFE_INTEGER }

export function footprint(op: XOp): { sheet: string; range: Range } | null {
  switch (op.t) {
    case 'set': {
      let r0 = Infinity
      let c0 = Infinity
      let r1 = -1
      let c1 = -1
      for (const c of op.cells) {
        r0 = Math.min(r0, c.r)
        c0 = Math.min(c0, c.c)
        r1 = Math.max(r1, c.r)
        c1 = Math.max(c1, c.c)
      }
      return { sheet: op.sheet, range: { r0, c0, r1, c1 } }
    }
    case 'fmt':
      return { sheet: op.sheet, range: op.range }
    case 'replace':
      return { sheet: op.sheet, range: op.at ? { r0: op.at.r, c0: op.at.c, r1: op.at.r, c1: op.at.c } : ALL }
    case 'sheet': {
      const o = op.op
      if ('range' in o) return { sheet: op.sheet, range: o.range }
      if (o.op === 'hideRows') return { sheet: op.sheet, range: { ...ALL, r0: o.a, r1: o.b } }
      if (o.op === 'hideCols') return { sheet: op.sheet, range: { ...ALL, c0: o.a, c1: o.b } }
      if (o.op === 'colWidth') return { sheet: op.sheet, range: { ...ALL, c0: o.c0, c1: o.c1 } }
      if (o.op === 'rowHeight') return { sheet: op.sheet, range: { ...ALL, r0: o.r0, r1: o.r1 } }
      return { sheet: op.sheet, range: ALL }
    }
    default:
      return null
  }
}

const overlap = (a: Range, b: Range) => a.r0 <= b.r1 && b.r0 <= a.r1 && a.c0 <= b.c1 && b.c0 <= a.c1

/** whether remote ops interact with pending local ones (→ rebase) */
export function conflictsX(pending: XOp[], remote: XOp[]): boolean {
  if (remote.some((o) => isStructural(o) || o.t === 'revert')) return true
  // the same comment set on both sides: the one sequenced first is applied first everywhere
  const cids = new Set(pending.flatMap((o) => (o.t === 'comment' ? [o.cid] : [])))
  if (remote.some((o) => o.t === 'comment' && cids.has(o.cid))) return true
  if (pending.some((o) => o.t === 'revert' || isStructural(o))) return true
  // derived styles are appended to one table: keep its order identical everywhere
  const styles = (o: XOp) => o.t === 'fmt' && o.patch.xf === undefined && !o.patch.clear
  if (pending.some(styles) && remote.some(styles)) return true
  const fp = remote.map(footprint)
  return pending.some((p) => {
    const a = footprint(p)
    return !!a && fp.some((b) => !!b && b.sheet === a.sheet && overlap(a.range, b.range))
  })
}
