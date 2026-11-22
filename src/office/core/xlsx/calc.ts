/**
 * Workbook recalculation: formula values are kept in the cell entries; after an edit
 * only the dependents (transitively) of the changed cells are re-evaluated.
 */
import { evaluate, FormulaError, parseFormula, references, type Ast, type CellProvider, type Value } from './formula'
import { MAX_COL, T_BOOL, T_EMPTY, T_ERR, T_NUM, T_SST, T_STR, type SheetData, type XlsxWorkbook } from './workbook'

type Id = string // `${sheet}:${key}`
const idOf = (sheet: number, key: number) => `${sheet}:${key}`

interface RangeDep {
  sheet: number
  r0: number
  c0: number
  r1: number
  c1: number
  dep: Id
}

export class Calc {
  private asts = new Map<Id, Ast | null>()
  private cellDeps = new Map<Id, Set<Id>>()
  private rangeDeps: RangeDep[] = []
  private indexed = false

  constructor(private wb: XlsxWorkbook) {}

  invalidate() {
    this.indexed = false
    this.asts.clear()
    this.cellDeps.clear()
    this.rangeDeps = []
  }

  private sheetIndex(name: string | undefined, self: number): number {
    if (!name) return self
    const i = this.wb.sheets.findIndex((s) => s.name.toLowerCase() === name.toLowerCase())
    return i
  }

  private ast(sheet: number, key: number): Ast | null {
    const id = idOf(sheet, key)
    let a = this.asts.get(id)
    if (a === undefined) {
      const f = this.wb.sheetsData.get(sheet)?.formulas.get(key)
      try {
        a = f ? parseFormula(f) : null
      } catch {
        a = null
      }
      this.asts.set(id, a)
    }
    return a
  }

  private index() {
    if (this.indexed) return
    this.indexed = true
    for (const [sheet, d] of this.wb.sheetsData) {
      for (const key of d.formulas.keys()) this.addDeps(sheet, key)
    }
  }

  private addDeps(sheet: number, key: number) {
    const a = this.ast(sheet, key)
    if (!a) return
    const dep = idOf(sheet, key)
    for (const ref of references(a)) {
      const s = this.sheetIndex(ref.sheet, sheet)
      if (s < 0) continue
      if ('r' in ref) {
        const id = idOf(s, ref.r * MAX_COL + ref.c)
        let set = this.cellDeps.get(id)
        if (!set) this.cellDeps.set(id, (set = new Set()))
        set.add(dep)
      } else this.rangeDeps.push({ sheet: s, r0: ref.r0, c0: ref.c0, r1: ref.r1, c1: ref.c1, dep })
    }
  }

  /** a formula was added / changed / removed at (sheet, key) */
  formulaChanged(sheet: number, key: number) {
    if (!this.indexed) return
    const id = idOf(sheet, key)
    this.asts.delete(id)
    for (const set of this.cellDeps.values()) set.delete(id)
    this.rangeDeps = this.rangeDeps.filter((r) => r.dep !== id)
    this.addDeps(sheet, key)
  }

  /** current value of a cell as the formula engine sees it */
  private value(sheet: number, r: number, c: number): Value {
    const d = this.wb.sheetsData.get(sheet)
    // a row of a page not in memory (a sheet read from its file by pages): the formula gets #VALUE!, not a blank
    if (d?.pages && !d.pages.has(r)) throw new Error('Row not in memory')
    const row = d?.rows[r]
    if (!row) return null
    for (let k = 0; k < row.length; k += 4) {
      if (row[k] !== c) continue
      const t = row[k + 1] as number
      const v = row[k + 2]
      switch (t) {
        case T_NUM:
          return v as number
        case T_SST:
          return this.wb.sst[v as number] ?? ''
        case T_STR:
          return String(v)
        case T_BOOL:
          return !!v
        case T_ERR:
          return new FormulaError(String(v) as ConstructorParameters<typeof FormulaError>[0])
        case T_EMPTY:
          return null
        default:
          return String(v)
      }
    }
    return null
  }

  private provider(pending: Set<Id>, visiting: Set<Id>): CellProvider {
    return {
      value: (sheetName, r, c) => {
        const s = this.sheetIndex(sheetName, this.cur)
        if (s < 0) return new FormulaError('#REF!')
        const id = idOf(s, r * MAX_COL + c)
        // circular reference: an error, not the cell's previous value (which would make results depend on history)
        if (visiting.has(id)) return new FormulaError('#REF!')
        if (pending.has(id)) this.compute(id, pending, visiting)
        return this.value(s, r, c)
      },
      bounds: (sheetName) => {
        const d = this.wb.sheetsData.get(this.sheetIndex(sheetName, this.cur))
        return { rows: (d?.maxRow ?? -1) + 1, cols: (d?.maxCol ?? -1) + 1 }
      },
      hasSheet: (name) => this.sheetIndex(name, -1) >= 0,
      date1904: this.wb.date1904,
    }
  }

  private cur = 0

  private compute(id: Id, pending: Set<Id>, visiting: Set<Id>) {
    pending.delete(id)
    const [sheet, key] = id.split(':').map(Number)
    const d = this.wb.sheetsData.get(sheet)
    if (!d || !d.formulas.has(key)) return
    if (visiting.has(id)) {
      store(d, key, new FormulaError('#REF!'))
      return
    }
    visiting.add(id)
    const a = this.ast(sheet, key)
    const prev = this.cur
    this.cur = sheet
    let v: Value
    try {
      v = a ? evaluate(a, { provider: this.provider(pending, visiting), sheet: this.wb.sheets[sheet]?.name, r: Math.floor(key / MAX_COL), c: key % MAX_COL }) : new FormulaError('#NAME?')
    } catch {
      v = new FormulaError('#VALUE!')
    }
    this.cur = prev
    visiting.delete(id)
    store(d, key, v)
  }

  /**
   * The rows that computing the formulas a change touches would read: the formulas given (added: their text, not yet
   * in the sheet) and those depending on the changed cells. For sheets read from their file by pages, to have those
   * rows in memory first.
   */
  reads(changed: { sheet: number; key: number }[], added: { sheet: number; key: number; text: string }[]): { sheet: number; r0: number; r1: number }[] {
    this.index()
    const out: { sheet: number; r0: number; r1: number }[] = []
    const collect = (a: Ast, self: number) => {
      for (const ref of references(a)) {
        const s = this.sheetIndex(ref.sheet, self)
        if (s < 0) continue
        const max = this.wb.sheetsData.get(s)?.maxRow ?? -1
        if ('r' in ref) out.push({ sheet: s, r0: ref.r, r1: ref.r })
        else out.push({ sheet: s, r0: ref.r0, r1: Math.min(ref.r1, max) })
      }
    }
    for (const f of added) {
      try {
        collect(parseFormula(f.text), f.sheet)
      } catch {
        // not a formula after all: nothing read
      }
    }
    for (const id of this.affected(changed, [])) {
      const [s, key] = id.split(':').map(Number)
      const a = this.ast(s, key)
      if (a) collect(a, s)
    }
    return out
  }

  /** the formula cells to compute after `changed` cells change: the given ones, then every dependent (transitively) */
  private affected(changed: { sheet: number; key: number }[], formulas: { sheet: number; key: number }[]): Id[] {
    const pending = new Set<Id>()
    const queue: Id[] = []
    const push = (id: Id) => {
      if (pending.has(id)) return
      pending.add(id)
      queue.push(id)
    }
    for (const f of formulas) push(idOf(f.sheet, f.key))
    const seen = new Set<Id>()
    const visit = (id: Id) => {
      if (seen.has(id)) return
      seen.add(id)
      const [s, key] = id.split(':').map(Number)
      const r = Math.floor(key / MAX_COL)
      const c = key % MAX_COL
      for (const dep of this.cellDeps.get(id) ?? []) {
        push(dep)
        visit(dep)
      }
      for (const rd of this.rangeDeps) {
        if (rd.sheet === s && r >= rd.r0 && r <= rd.r1 && c >= rd.c0 && c <= rd.c1) {
          push(rd.dep)
          visit(rd.dep)
        }
      }
    }
    for (const ch of changed) visit(idOf(ch.sheet, ch.key))
    for (const f of formulas) visit(idOf(f.sheet, f.key))
    return queue
  }

  /** Evaluates the given formula cells and everything that depends on the changed cells. */
  recalc(changed: { sheet: number; key: number }[], formulas: { sheet: number; key: number }[] = []): Set<number> {
    this.index()
    const queue = this.affected(changed, formulas)
    const pending = new Set<Id>(queue)
    const sheets = new Set<number>()
    const visiting = new Set<Id>()
    for (const id of queue) {
      if (!pending.has(id)) continue
      this.compute(id, pending, visiting)
      sheets.add(Number(id.split(':')[0]))
    }
    return sheets
  }

  /** formulas whose value is missing (files written without cached values) */
  computeMissing(sheet: number, keys: number[]) {
    if (!keys.length) return
    this.recalc([], keys.map((key) => ({ sheet, key })))
  }
}

function store(d: SheetData, key: number, v: Value) {
  const r = Math.floor(key / MAX_COL)
  const c = key % MAX_COL
  // a formula cell was edited: its page is in memory for good
  if (d.pages && !d.pages.has(r)) throw new Error('Row not in memory')
  d.pages?.pin(r)
  let row = d.rows[r]
  if (!row) d.rows[r] = row = []
  let t: number
  let val: unknown
  if (v instanceof FormulaError) {
    t = T_ERR
    val = v.code
  } else if (typeof v === 'number') {
    t = T_NUM
    val = Number.isFinite(v) ? v : 0
  } else if (typeof v === 'boolean') {
    t = T_BOOL
    val = v ? 1 : 0
  } else if (v === null) {
    t = T_NUM
    val = 0
  } else {
    t = T_STR
    val = v
  }
  for (let k = 0; k < row.length; k += 4) {
    if (row[k] === c) {
      row[k + 1] = t
      row[k + 2] = val
      return
    }
  }
  let k = 0
  while (k < row.length && (row[k] as number) < c) k += 4
  row.splice(k, 0, c, t, val, 0)
}
