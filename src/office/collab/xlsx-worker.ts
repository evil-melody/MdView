/**
 * Worker side of XLSX collaboration: runs operations on the XlsxEditor without its undo
 * history, keeping one exact record per applied operation (for rebasing and shared undo).
 */
import type { Change, XlsxEditor } from '../core/xlsx/editor'
import type { BookOp, SheetProgress, XlsxEditResult } from '../core/xlsx/types'
import type { XlsxWorkbook } from '../core/xlsx/workbook'
import { STRUCTURAL, type XOp } from './xlsx-ops'

interface Rec {
  ch?: Change
  /** style table sizes before the op, when the op derived new styles (dropped again when it is undone) */
  styles?: Record<string, number>
  op: string
}

const MAX_RECS = 400

export class XlsxCollabWorker {
  private recs = new Map<number, Rec>()
  /** op id → record of its latest application */
  private byOp = new Map<string, number>()
  private seq = 0

  constructor(
    private ed: XlsxEditor,
    private wb: XlsxWorkbook,
    private emit: (p: SheetProgress) => void,
  ) {}

  private index(path: string): number {
    const i = this.wb.sheets.findIndex((s) => s.path === path)
    if (i < 0) throw new SkipOp()
    return i
  }

  private async sheet(path: string): Promise<number> {
    const i = this.index(path)
    await this.wb.loadSheet(i, this.emit)
    return i
  }

  /** forgets the records of a sheet (null: all), whose cell keys / indexes changed under them */
  private dropSheet(i: number | null) {
    for (const [id, r] of this.recs) {
      if (i === null || r.ch?.sheet === i) {
        this.recs.delete(id)
        this.byOp.delete(r.op)
      }
    }
  }

  async apply(op: XOp): Promise<{ res: XlsxEditResult | null; rec: number | null }> {
    const styles = await this.ed.styleMark()
    let res: XlsxEditResult | null
    try {
      res = await this.run(op)
    } catch (e) {
      if (e instanceof SkipOp) return { res: null, rec: null }
      throw e
    }
    const ch = this.ed.takeRecord()
    const after = await this.ed.styleMark()
    // only an op that grew the style table may shrink it back: styles derived later by others must stay
    const grew = Object.keys(after).some((k) => after[k] !== styles[k])
    if (op.t === 'book') {
      this.dropSheet(null)
      return { res, rec: null }
    }
    if (op.t === 'sheet' && STRUCTURAL.has(op.op.op)) {
      // formulas of every sheet were rewritten: older records would restore stale ones
      this.dropSheet(null)
      return { res, rec: null }
    }
    const id = ++this.seq
    this.recs.set(id, { ch, styles: grew ? styles : undefined, op: op.id })
    this.byOp.set(op.id, id)
    if (this.recs.size > MAX_RECS) {
      const [old, r] = this.recs.entries().next().value as [number, Rec]
      this.recs.delete(old)
      if (this.byOp.get(r.op) === old) this.byOp.delete(r.op)
    }
    return { res, rec: id }
  }

  private async run(op: XOp): Promise<XlsxEditResult | null> {
    const ed = this.ed
    switch (op.t) {
      // comments are set through the engine (main-thread adapter)
      case 'comment':
        return null
      case 'set':
        return ed.setCells(await this.sheet(op.sheet), op.cells)
      case 'fmt':
        return ed.format(await this.sheet(op.sheet), op.range, op.patch)
      case 'sheet':
        return ed.sheetOp(await this.sheet(op.sheet), op.op)
      case 'replace':
        return ed.replace(await this.sheet(op.sheet), op.query, op.by, op.opts, op.at)
      case 'book': {
        const o = op.op
        let b: BookOp
        if (o.op === 'add') b = { op: 'add', name: o.name, after: o.after ? this.index(o.after) : undefined }
        else if (o.op === 'rename') b = { op: 'rename', index: this.index(o.path), name: o.name }
        else if (o.op === 'delete') b = { op: 'delete', index: this.index(o.path) }
        else b = { op: 'move', from: this.index(o.path), to: Math.max(0, Math.min(o.to, this.wb.sheets.length - 1)) }
        try {
          return await ed.bookOp(b)
        } catch {
          // e.g. a concurrent rename to the same name: skipped everywhere alike
          throw new SkipOp()
        }
      }
      case 'revert': {
        const id = this.byOp.get(op.target)
        const r = id !== undefined ? this.recs.get(id) : undefined
        if (!r?.ch) throw new SkipOp()
        return ed.restoreRecord(r.ch, op.which)
      }
    }
  }

  /** exactly undoes an applied operation (rebase) */
  async revert(id: number): Promise<XlsxEditResult | null> {
    const r = this.recs.get(id)
    if (!r) return null
    this.recs.delete(id)
    if (this.byOp.get(r.op) === id) this.byOp.delete(r.op)
    const res = r.ch ? this.ed.revertRecord(r.ch) : null
    if (r.styles) await this.ed.styleTruncate(r.styles)
    return res
  }
}

class SkipOp extends Error {}
