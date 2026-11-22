/**
 * Structural sheet edits on the in-memory SheetData: insert/delete rows & columns,
 * merges, sizes. Formulas (this sheet and others pointing at it) are shifted.
 */
import { shiftFormula, translateFormula } from './formula'
import type { ColInfo, Merge, Range } from './types'
import { MAX_COL, type SheetData } from './workbook'

export interface Snapshot {
  rows: (unknown[] | undefined)[]
  formulas: Map<number, string>
  merges: Merge[]
  colInfo: ColInfo[]
  rowAttrs: Map<number, { ht?: number; hidden?: boolean }>
  autoRowH: Map<number, number>
  maxRow: number
  maxCol: number
  frozen: { rows: number; cols: number }
}

export function snapshot(d: SheetData): Snapshot {
  return {
    rows: d.rows.map((r) => (r ? r.slice() : r)),
    formulas: new Map(d.formulas),
    merges: d.merges.map((m) => ({ ...m })),
    colInfo: d.colInfo.map((c) => ({ ...c })),
    rowAttrs: new Map([...d.rowAttrs].map(([k, v]) => [k, { ...v }])),
    autoRowH: new Map(d.autoRowH),
    maxRow: d.maxRow,
    maxCol: d.maxCol,
    frozen: { ...d.frozen },
  }
}

export function restore(d: SheetData, s: Snapshot) {
  d.rows = s.rows.map((r) => (r ? r.slice() : r))
  d.formulas = new Map(s.formulas)
  d.merges = s.merges.map((m) => ({ ...m }))
  d.colInfo = s.colInfo.map((c) => ({ ...c }))
  d.rowAttrs = new Map([...s.rowAttrs].map(([k, v]) => [k, { ...v }]))
  d.autoRowH = new Map(s.autoRowH)
  d.maxRow = s.maxRow
  d.maxCol = s.maxCol
  d.frozen = { ...s.frozen }
  d.structural = true
  d.dirtyCols = d.dirtyMerges = d.dirtyView = true
}

/** shared formulas → explicit per-cell formulas (needed before rows/cols move) */
export function materializeShared(d: SheetData) {
  for (const [key, si] of d.depOf) {
    const g = d.shared.get(si)
    if (!g || d.formulas.has(key)) continue
    const dr = Math.floor(key / MAX_COL) - Math.floor(g.master / MAX_COL)
    const dc = (key % MAX_COL) - (g.master % MAX_COL)
    d.formulas.set(key, translateFormula(g.text, dr, dc))
  }
  d.depOf.clear()
  d.shared.clear()
}

function shiftMerges(ms: Merge[], axis: 'row' | 'col', at: number, delta: number): Merge[] {
  const out: Merge[] = []
  for (const m of ms) {
    let [a0, a1] = axis === 'row' ? [m.r0, m.r1] : [m.c0, m.c1]
    if (delta > 0) {
      if (a0 >= at) a0 += delta
      if (a1 >= at) a1 += delta
    } else {
      const end = at - delta // exclusive end of deleted band
      const cut = (v: number) => (v < at ? v : v >= end ? v + delta : at)
      if (a0 >= at && a1 < end) continue
      a0 = cut(a0)
      a1 = a1 >= end ? a1 + delta : a1 >= at ? at - 1 : a1
      if (a1 < a0) continue
    }
    const n = axis === 'row' ? { ...m, r0: a0, r1: a1 } : { ...m, c0: a0, c1: a1 }
    if (n.r0 === n.r1 && n.c0 === n.c1) continue
    out.push(n)
  }
  return out
}

/** Moves rows or columns; delta > 0 inserts at `at`, delta < 0 deletes -delta starting at `at`. */
export function shiftSheet(d: SheetData, sheetName: string, axis: 'row' | 'col', at: number, delta: number, others: { name: string; d: SheetData }[]) {
  materializeShared(d)
  const end = at - delta
  if (axis === 'row') {
    if (delta > 0) d.rows.splice(at, 0, ...new Array<undefined>(delta).fill(undefined))
    else d.rows.splice(at, -delta)
    d.maxRow = Math.max(-1, d.maxRow + (d.maxRow >= at ? delta : 0))
    const attrs = new Map<number, { ht?: number; hidden?: boolean }>()
    for (const [r, v] of d.rowAttrs) {
      if (delta < 0 && r >= at && r < end) continue
      attrs.set(r >= at ? r + delta : r, v)
    }
    d.rowAttrs = attrs
    const auto = new Map<number, number>()
    for (const [r, px] of d.autoRowH) {
      if (delta < 0 && r >= at && r < end) continue
      auto.set(r >= at ? r + delta : r, px)
    }
    d.autoRowH = auto
  } else {
    for (let r = 0; r < d.rows.length; r++) {
      const row = d.rows[r]
      if (!row) continue
      const out: unknown[] = []
      for (let k = 0; k < row.length; k += 4) {
        const c = row[k] as number
        if (delta < 0 && c >= at && c < end) continue
        out.push(c >= at ? c + delta : c, row[k + 1], row[k + 2], row[k + 3])
      }
      d.rows[r] = out.length ? out : undefined
    }
    d.maxCol = Math.max(-1, d.maxCol + (d.maxCol >= at ? delta : 0))
    const cols: ColInfo[] = []
    for (const ci of d.colInfo) {
      let { min, max } = ci
      if (delta > 0) {
        if (min >= at) min += delta
        if (max >= at) max += delta
      } else {
        if (min >= at && max < end) continue
        min = min < at ? min : min >= end ? min + delta : at
        max = max >= end ? max + delta : max >= at ? at - 1 : max
        if (max < min) continue
      }
      cols.push({ ...ci, min, max })
    }
    d.colInfo = cols
    d.dirtyCols = true
  }
  // formulas of this sheet: move keys + rewrite references
  const op = { sheet: sheetName, formulaSheet: sheetName, axis, at, delta }
  const formulas = new Map<number, string>()
  for (const [key, f] of d.formulas) {
    let r = Math.floor(key / MAX_COL)
    let c = key % MAX_COL
    const v = axis === 'row' ? r : c
    if (delta < 0 && v >= at && v < end) continue
    if (v >= at) {
      if (axis === 'row') r += delta
      else c += delta
    }
    formulas.set(r * MAX_COL + c, shiftFormula(f, op))
  }
  d.formulas = formulas
  for (const o of others) {
    if (o.d === d) continue
    let changed = false
    for (const [key, f] of o.d.formulas) {
      const g = shiftFormula(f, { ...op, formulaSheet: o.name })
      if (g !== f) {
        o.d.formulas.set(key, g)
        o.d.edited.add(key)
        changed = true
      }
    }
    if (changed) o.d.formulaChanged = true
  }
  d.merges = shiftMerges(d.merges, axis, at, delta)
  if (axis === 'row' && d.frozen.rows > at) d.frozen = { ...d.frozen, rows: Math.max(0, d.frozen.rows + (delta > 0 ? delta : Math.max(delta, at - d.frozen.rows))) }
  if (axis === 'col' && d.frozen.cols > at) d.frozen = { ...d.frozen, cols: Math.max(0, d.frozen.cols + (delta > 0 ? delta : Math.max(delta, at - d.frozen.cols))) }
  d.structural = true
  d.dirtyMerges = true
  d.dirtyView = true
}

export function setMerge(d: SheetData, range: Range, merge: boolean) {
  const hit = (m: Merge) => m.r1 >= range.r0 && m.r0 <= range.r1 && m.c1 >= range.c0 && m.c0 <= range.c1
  d.merges = d.merges.filter((m) => !hit(m))
  if (merge && (range.r0 !== range.r1 || range.c0 !== range.c1)) d.merges.push({ ...range })
  d.dirtyMerges = true
}

export function setColWidth(d: SheetData, c0: number, c1: number, px: number) {
  const out: ColInfo[] = []
  for (const ci of d.colInfo) {
    if (ci.max < c0 || ci.min > c1) out.push(ci)
    else {
      if (ci.min < c0) out.push({ ...ci, max: c0 - 1 })
      if (ci.max > c1) out.push({ ...ci, min: c1 + 1 })
    }
  }
  out.push({ min: c0, max: c1, w: Math.max(0, Math.round(px)) })
  d.colInfo = out.sort((a, b) => a.min - b.min)
  d.dirtyCols = true
}

export function setRowHeight(d: SheetData, r0: number, r1: number, px: number) {
  for (let r = r0; r <= r1; r++) {
    d.rowAttrs.set(r, px > 0 ? { ht: +(px * 0.75).toFixed(2) } : { ...(d.rowAttrs.get(r) ?? {}), hidden: true })
    d.dirtyRows.add(r)
  }
}
