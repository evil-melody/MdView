/**
 * XLSX editing: cell values/formats live in the worker's SheetData; on save each
 * edited sheet is streamed through a rewriter that only touches edited rows.
 */
import { dirOf, mimeOf, relOfType, relativeTarget, relsPathFor } from '../opc'
import type { DocComment } from '../comments'
import { writeXlsxComments } from './comments'
import {
  clone, el, escText, relIdAttrs, getAttr, isNode, kidOf, kidsOf, local, parseRaw, prefixOf, rootEl, serialize, setAttr, setOrdered,
  type RChild, type RNode,
} from '../raw'
import { parseXml } from '../xml'
import { BUILTIN_FORMATS, formatValue, isDateFormat } from './numfmt'
import { fillTrendStep, seriesValueAt } from './series'
import { fillSeriesFormula, seriesCellFormula } from './seriesformula'
import {
  EMU_PER_PX, RowPatcher, appendAnchor, applyLayout, borderSides, drawingDoc, hideCols,
  insertDrawing, layoutState, needsWrite, nextPicId, twoCellAnchor,
} from './rowpatch'
import { posTo, rewriteAnchor } from './drawanchor'
import { parseSheetStyles } from './styles'
import { MAX_ROW_H_PX, autoFitColPx, ptToPx, pxToPt } from './colwidth'
import type { BookOp, BorderKind, CellInput, ColInfo, DefinedName, FillMode, FindOptions, FmtPatch, Merge, Range, SeriesType, SeriesUnit, SheetOp, SheetProgress, XlsxDrawingInfo, XlsxDrawingOp, XlsxDrawingsResult, XlsxEditResult, XlsxFormulaCell, XlsxImageOp, XlsxImageResult, XlsxStats } from './types'
import { materializeShared, restore, setColWidth, setMerge, setRowHeight, shiftSheet, snapshot, type Snapshot } from './structure'
import { renameSheetInFormula, translateFormula } from './formula'
import {
  WB_ORDER, applyPageSetup, definedNameOp, formulasIn, readDefinedNames, setFileSharing, setSheetState,
  setWorkbookProtection, statsOf,
} from './sheetopts'
import { loadDelimited, type DelimitedImport } from './import'
import {
  colName, MAX_COL, MAX_ROWS, parseRef, rowSizesOf, SheetData, T_BOOL, T_DATE, T_EMPTY, T_ERR, T_NUM, T_SST, T_STR, XlsxWorkbook,
} from './workbook'
import type { PartData } from '../zipwrite'
import { chartDataOf } from './features'
import {
  CT_CHART, CT_DRAWING, CT_PIVOT_CACHE_DEF, CT_PIVOT_CACHE_REC, CT_PIVOT_TABLE, CT_SLICER, CT_SLICER_CACHE,
  REL_CHART, REL_DRAWING, REL_PIVOT_CACHE_DEF, REL_PIVOT_CACHE_REC, REL_PIVOT_TABLE, REL_SLICER, REL_SLICER_CACHE,
  SIDECAR, SIDECAR_CT, NS_R, NS_X14, NS_MC, chartPartName, chartRid, pivotCacheDefName, pivotCacheRecName, pivotCacheRid,
  pivotCachesEl, pivotTableName, pivotTableRid, slicerCachePartName, slicerCacheRid, slicerCachesExt, slicerListExt,
  slicerPartName, slicerRid, parseSidecar, emptyFeatures, partPathsOf, relsPath, chartSpaceXml, graphicFrameXml,
  dxfsSection, condFmtBlocks, dataValidationsXml, slicerCacheXml, slicerViewXml, pivotCacheDefXml,
  pivotCacheRecordsXml, pivotTableXml, mergeRels, stripChartFrames, appendToDrawing, injectSheetElements,
  rangeRef, type Sidecar, type RelEntry,
} from './features'
import type {
  ChartAddOp, ChartFeature, CondFmtRule, PivotAddOp, PivotFeature, SeriesFeature, SeriesListResult, SheetFeatures, SlicerAddOp, SlicerFeature, ValidationRule,
} from './types'

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

type Entry = [number, unknown, number]
interface CellChange {
  key: number
  prev: Entry | null
  prevF?: string
  next: Entry | null
  nextF?: string
}
interface LayoutState {
  merges?: Merge[]
  colInfo?: ColInfo[]
  rowAttrs?: [number, { ht?: number; hidden?: boolean }][]
  frozen?: { rows: number; cols: number }
  gridLines?: boolean
}

export interface Change {
  sheet: number
  cells: CellChange[]
  range: Range
  /** cheap layout state (merges, sizes, panes) before/after */
  lay?: { before: LayoutState; after: LayoutState }
  /** whole-sheet snapshots (row/column insert/delete) */
  full?: { before: Snapshot; after: Snapshot }
  /** comments the change moved or took away (inserted / deleted rows and columns): their values before / after */
  cm?: { before: [string, DocComment | null][]; after: [string, DocComment | null][] }
  /** image insertion: each touched part's content before (undo) and after (redo); null = absent */
  image?: {
    before: { path: string; data: PartData | null }[]
    after: { path: string; data: PartData | null }[]
    /** when the sheet XML itself was modified, its path and whether it was already in `newSheets` */
    sheetPath?: string
    sheetWasNew?: boolean
  }
}

const FONT_ORDER = ['b', 'i', 'strike', 'condense', 'extend', 'outline', 'shadow', 'u', 'vertAlign', 'sz', 'color', 'name', 'family', 'charset', 'scheme']
const SS_ORDER = ['numFmts', 'fonts', 'fills', 'borders', 'cellStyleXfs', 'cellXfs', 'cellStyles', 'dxfs', 'tableStyles', 'colors', 'extLst']

// ---------------------------------------------------------------- cell storage helpers

function rowOf(d: SheetData, r: number, create: boolean): unknown[] | undefined {
  let row = d.rows[r]
  if (!row && create) d.rows[r] = row = []
  return row
}

export function getEntry(d: SheetData, r: number, c: number): Entry | null {
  const row = d.rows[r]
  if (!row) return null
  for (let k = 0; k < row.length; k += 4) if (row[k] === c) return [row[k + 1] as number, row[k + 2], row[k + 3] as number]
  return null
}

function setEntry(d: SheetData, r: number, c: number, e: Entry | null) {
  // the file does not have this row's edit: its page stays in memory (and must be there: a fresh row would lose the rest)
  if (d.pages && !d.pages.has(r)) throw new Error('Row not in memory')
  d.pages?.pin(r)
  const row = rowOf(d, r, !!e)
  if (!row) return
  let k = 0
  for (; k < row.length; k += 4) if ((row[k] as number) >= c) break
  const exists = k < row.length && row[k] === c
  if (!e) {
    if (exists) row.splice(k, 4)
    if (!row.length) d.rows[r] = undefined
    return
  }
  if (exists) {
    row[k + 1] = e[0]
    row[k + 2] = e[1]
    row[k + 3] = e[2]
  } else row.splice(k, 0, c, e[0], e[1], e[2])
  if (r > d.maxRow) d.maxRow = r
  if (c > d.maxCol) d.maxCol = c
}

function dateSerial(t: string, date1904 = false): number | undefined {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t)
  let y: number, mo: number, d: number
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t)
    if (!m) return undefined
    ;[d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  }
  const ms = Date.UTC(y, mo - 1, d, Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0))
  if (!Number.isFinite(ms)) return undefined
  // 1970-01-01：1900 系统 serial 25569、1904 系统 24107（相差 1462 天）
  return ms / 86400000 + (date1904 ? 24107 : 25569)
}

function parseInput(input: string, style: number, isDate = false, date1904 = false): { e: Entry | null; f?: string } {
  if (input === '') return { e: style ? [T_EMPTY, '', style] : null }
  if (input.startsWith('=') && input.length > 1) return { e: [T_STR, input, style], f: input.slice(1) }
  const t = input.trim()
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return { e: [T_NUM, Number(t), style] }
  if (/^[-+]?(\d+\.?\d*|\.\d+)%$/.test(t)) return { e: [T_NUM, Number(t.slice(0, -1)) / 100, style] }
  if (/^(true|false)$/i.test(t)) return { e: [T_BOOL, /^true$/i.test(t) ? 1 : 0, style] }
  if (isDate) {
    const serial = dateSerial(t, date1904)
    if (serial !== undefined) return { e: [T_NUM, serial, style] }
  }
  return { e: [T_STR, input, style] }
}

// ---------------------------------------------------------------- styles

class StyleEditor {
  nodes: RChild[]
  root: RNode
  P: string
  private cache = new Map<string, number>()
  /**
   * per section: serialized entry → first index. Derived entries reuse identical ones, so derivation
   * depends only on the table's content — a saved and reopened workbook derives the same indexes
   * as the live one (collaboration snapshots rely on it).
   */
  private found = new Map<string, Map<string, number>>()
  changed = false

  constructor(xml: string) {
    this.nodes = parseRaw(xml)
    this.root = rootEl(this.nodes)!
    this.P = prefixOf(this.root.q)
  }

  private section(name: string): RNode {
    let n = kidOf(this.root, name)
    if (!n) {
      n = el(this.P + name, { count: '0' })
      setOrdered(this.root, n, name, SS_ORDER)
    }
    return n
  }

  private append(sectionName: string, node: RNode): number {
    const sec = this.section(sectionName)
    sec.c.push(node)
    sec.self = false
    const n = kidsOf(sec).length
    setAttr(sec, 'count', String(n))
    this.changed = true
    return n - 1
  }

  private lookup(sectionName: string): Map<string, number> {
    let m = this.found.get(sectionName)
    if (!m) {
      const idx = new Map<string, number>()
      kidsOf(kidOf(this.root, sectionName)).forEach((k, i) => {
        const s = serialize([k])
        if (!idx.has(s)) idx.set(s, i)
      })
      this.found.set(sectionName, (m = idx))
    }
    return m
  }

  /** index of an entry equal to `node`, appended when there is none */
  private intern(sectionName: string, node: RNode): number {
    const s = serialize([node])
    const m = this.lookup(sectionName)
    const hit = m.get(s)
    if (hit !== undefined) return hit
    const i = this.append(sectionName, node)
    m.set(s, i)
    return i
  }

  private numFmtId(code: string): number {
    for (const [id, c] of Object.entries(BUILTIN_FORMATS)) if (c === code) return Number(id)
    const sec = kidOf(this.root, 'numFmts')
    let max = 163
    for (const f of kidsOf(sec, 'numFmt')) {
      const id = Number(getAttr(f, 'numFmtId'))
      if (getAttr(f, 'formatCode') === code) return id
      max = Math.max(max, id)
    }
    this.append('numFmts', el(this.P + 'numFmt', { numFmtId: String(max + 1), formatCode: code }))
    return max + 1
  }

  derive(xfIndex: number, patch: FmtPatch): number {
    const key = xfIndex + JSON.stringify(patch)
    const hit = this.cache.get(key)
    if (hit !== undefined) return hit
    const P = this.P
    const xfs = kidsOf(this.section('cellXfs'), 'xf')
    const xf = clone(xfs[xfIndex] ?? xfs[0] ?? el(P + 'xf', { numFmtId: '0', fontId: '0', fillId: '0', borderId: '0' }))
    const fontKeys = ['b', 'i', 'u', 'strike', 'color', 'sz', 'font'] as const
    if (fontKeys.some((k) => k in patch)) {
      const fonts = kidsOf(this.section('fonts'), 'font')
      const font = clone(fonts[Number(getAttr(xf, 'fontId') ?? 0)] ?? fonts[0] ?? el(P + 'font'))
      const put = (l: string, n: RNode | undefined) => setOrdered(font, n, l, FONT_ORDER)
      if (patch.b !== undefined) put('b', patch.b ? el(P + 'b') : undefined)
      if (patch.i !== undefined) put('i', patch.i ? el(P + 'i') : undefined)
      if (patch.strike !== undefined) put('strike', patch.strike ? el(P + 'strike') : undefined)
      if (patch.u !== undefined) put('u', patch.u ? el(P + 'u') : undefined)
      if (patch.sz !== undefined) put('sz', el(P + 'sz', { val: String(patch.sz) }))
      if ('color' in patch) put('color', patch.color ? el(P + 'color', { rgb: 'FF' + patch.color.replace('#', '').toUpperCase() }) : undefined)
      if (patch.font) {
        put('name', el(P + 'name', { val: patch.font }))
        put('scheme', undefined)
      }
      setAttr(xf, 'fontId', String(this.intern('fonts', font)))
      setAttr(xf, 'applyFont', '1')
    }
    if ('fill' in patch) {
      if (!patch.fill) setAttr(xf, 'fillId', '0')
      else {
        const fill = parseRaw(
          `<${P}fill><${P}patternFill patternType="solid"><${P}fgColor rgb="FF${patch.fill.replace('#', '').toUpperCase()}"/><${P}bgColor indexed="64"/></${P}patternFill></${P}fill>`,
        )[0] as RNode
        setAttr(xf, 'fillId', String(this.intern('fills', fill)))
      }
      setAttr(xf, 'applyFill', '1')
    }
    if (patch.border) {
      const sides = (patch as FmtPatch & { sides?: Record<string, boolean> }).sides ?? {}
      const borders = kidsOf(this.section('borders'), 'border')
      const b = clone(borders[Number(getAttr(xf, 'borderId') ?? 0)] ?? borders[0] ?? el(P + 'border'))
      const color = (patch.borderColor ?? '#000000').replace('#', '').toUpperCase()
      const order = ['left', 'start', 'right', 'end', 'top', 'bottom', 'diagonal', 'vertical', 'horizontal']
      for (const side of ['left', 'right', 'top', 'bottom']) {
        if (!(side in sides)) continue
        const node = sides[side] ? el(P + side, { style: patch.borderStyle ?? 'thin' }, [el(P + 'color', { rgb: 'FF' + color })]) : el(P + side)
        setOrdered(b, node, side, order)
      }
      if (!kidOf(b, 'diagonal')) setOrdered(b, el(P + 'diagonal'), 'diagonal', order)
      setAttr(xf, 'borderId', String(this.intern('borders', b)))
      setAttr(xf, 'applyBorder', '1')
    }
    if ('align' in patch || 'wrap' in patch || 'valign' in patch || 'rotate' in patch || 'indent' in patch) {
      const al = clone(kidOf(xf, 'alignment') ?? el(P + 'alignment'))
      if ('align' in patch) setAttr(al, 'horizontal', patch.align ?? undefined)
      if ('indent' in patch) {
        const cur = Number(getAttr(al, 'indent') ?? '0') || 0
        const next = cur + (patch.indent ?? 0)
        setAttr(al, 'indent', next > 0 ? String(next) : undefined)
      }
      if ('valign' in patch) setAttr(al, 'vertical', patch.valign && patch.valign !== 'bottom' ? patch.valign : undefined)
      if ('wrap' in patch) setAttr(al, 'wrapText', patch.wrap ? '1' : undefined)
      if ('rotate' in patch) {
        const v = patch.rotate
        // OOXML: 1-90 counter-clockwise, 91-180 clockwise (90 + deg), 255 vertical
        setAttr(al, 'textRotation', !v ? undefined : v === 255 ? '255' : v > 0 ? String(Math.min(90, v)) : String(90 + Math.min(90, -v)))
      }
      setOrdered(xf, al.a.trim() ? al : undefined, 'alignment', ['alignment', 'protection', 'extLst'])
      setAttr(xf, 'applyAlignment', '1')
    }
    if (patch.numFmt !== undefined) {
      setAttr(xf, 'numFmtId', String(this.numFmtId(patch.numFmt)))
      setAttr(xf, 'applyNumberFormat', '1')
    }
    const idx = this.intern('cellXfs', xf)
    this.cache.set(key, idx)
    return idx
  }

  xml() {
    return serialize(this.nodes)
  }

  /** Replace the <dxfs> section (native conditional-formatting differential styles). */
  setDxfs(sectionXml: string | null) {
    const existing = kidOf(this.root, 'dxfs')
    if (existing) this.root.c = this.root.c.filter((c) => c !== existing)
    if (sectionXml) {
      const node = rootEl(parseRaw(sectionXml))
      if (node) setOrdered(this.root, node, 'dxfs', SS_ORDER)
    }
    this.root.self = this.root.c.length === 0
    this.changed = true
    this.found.delete('dxfs')
  }

  /** collaboration: sizes of the growing sections (to drop what a rolled-back operation derived) */
  mark(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const name of ['numFmts', 'fonts', 'fills', 'borders', 'cellXfs']) out[name] = kidsOf(kidOf(this.root, name)).length
    return out
  }

  truncate(m: Record<string, number>) {
    for (const [name, len] of Object.entries(m)) {
      const sec = kidOf(this.root, name)
      const kids = kidsOf(sec)
      if (!sec || kids.length <= len) continue
      const drop = new Set<RChild>(kids.slice(len))
      sec.c = sec.c.filter((c) => !drop.has(c))
      setAttr(sec, 'count', String(len))
      const idx = this.found.get(name)
      if (idx) for (const [k, v] of idx) if (v >= len) idx.delete(k)
    }
    for (const [k, v] of this.cache) if (v >= m.cellXfs) this.cache.delete(k)
  }
}

// ---------------------------------------------------------------- editor

export class XlsxEditor {
  private undoStack: Change[] = []
  private redoStack: Change[] = []
  private styleEd?: StyleEditor
  private stylesPath?: string
  private formulaTouched = false

  constructor(private wb: XlsxWorkbook) {}

  get dirty() {
    return [...this.wb.sheetsData.values()].some(needsWrite) || !!this.styleEd?.changed || this.bookChanged || this.wb.comments.dirty || this.wb.pkg.dirty
  }

  /**
   * Comments of sheet `path` after `n` rows / columns were inserted (n > 0) or deleted (n < 0) at `at`: they move with
   * their cell, and go with it. Returns what changed (for undo).
   */
  private shiftComments(path: string, axis: 'row' | 'col', at: number, n: number): Change['cm'] {
    const store = this.wb.comments
    const before: [string, DocComment | null][] = []
    const after: [string, DocComment | null][] = []
    const set = (id: string, c: DocComment | null) => {
      before.push([id, store.get(id) ?? null])
      after.push([id, c])
      store.set(id, c)
    }
    for (const t of store.threads()) {
      const a = t.root.at
      if (!a || !('sheet' in a) || a.sheet !== path) continue
      const x = axis === 'row' ? a.r : a.c
      const y = n >= 0 ? (x >= at ? x + n : x) : x < at ? x : x < at - n ? null : x + n
      if (y === x) continue
      if (y === null) {
        for (const r of t.replies) set(r.id, null)
        set(t.root.id, null)
      } else set(t.root.id, { ...t.root, at: axis === 'row' ? { ...a, r: y } : { ...a, c: y } })
    }
    return before.length ? { before, after } : undefined
  }

  private sheet(i: number): SheetData {
    const d = this.wb.sheetsData.get(i)
    if (!d || !d.done) throw new Error('Sheet is still loading')
    return d
  }

  private lastRecalc: number[] = []

  private apply(d: SheetData, cells: CellChange[], which: 'prev' | 'next') {
    const sheet = [...this.wb.sheetsData].find(([, x]) => x === d)?.[0] ?? 0
    const formulaKeys: { sheet: number; key: number }[] = []
    this.applyRaw(d, cells, which)
    for (const ch of cells) {
      const f0 = which === 'prev' ? ch.nextF : ch.prevF
      const f1 = which === 'prev' ? ch.prevF : ch.nextF
      if (f0 !== f1) this.wb.calc.formulaChanged(sheet, ch.key)
      if (f1) formulaKeys.push({ sheet, key: ch.key })
    }
    // only value changes matter for dependents (formatting doesn't)
    const changed = cells.filter((c) => {
      if (which === 'prev' ? c.prevF : c.nextF) return false
      const a = c.prev
      const b = c.next
      return !a || !b || a[0] !== b[0] || a[1] !== b[1] || c.prevF !== c.nextF
    })
    this.lastRecalc = changed.length || formulaKeys.length ? [...this.wb.calc.recalc(changed.map((c) => ({ sheet, key: c.key })), formulaKeys)] : []
  }

  private applyRaw(d: SheetData, cells: CellChange[], which: 'prev' | 'next') {
    for (const ch of cells) {
      const r = Math.floor(ch.key / MAX_COL)
      const c = ch.key % MAX_COL
      setEntry(d, r, c, which === 'prev' ? ch.prev : ch.next)
      const f = which === 'prev' ? ch.prevF : ch.nextF
      if (f) d.formulas.set(ch.key, f)
      else d.formulas.delete(ch.key)
      d.edited.add(ch.key)
      if (ch.prevF || ch.nextF) this.formulaTouched = true
    }
  }

  private record(sheet: number, cells: CellChange[], range: Range): XlsxEditResult {
    this.undoStack.push({ sheet, cells, range })
    if (this.undoStack.length > 200) this.undoStack.shift()
    this.redoStack = []
    return { sheet, range, recalc: this.lastRecalc }
  }

  /** after rows/columns moved: rebuild the dependency graph and recompute every formula */
  private recalcAll(): number[] {
    this.wb.calc.invalidate()
    const all: { sheet: number; key: number }[] = []
    for (const [sheet, d] of this.wb.sheetsData) for (const key of d.formulas.keys()) all.push({ sheet, key })
    return [...this.wb.calc.recalc([], all)]
  }

  async setCells(sheet: number, inputs: CellInput[]): Promise<XlsxEditResult> {
    const d = this.sheet(sheet)
    await this.prepare(sheet, d, inputs)
    const changes: CellChange[] = []
    const range = { r0: Infinity, c0: Infinity, r1: -1, c1: -1 }
    for (const { r, c, input } of inputs) {
      const key = r * MAX_COL + c
      const prev = getEntry(d, r, c)
      const st = prev?.[2] ?? 0
      const { e, f } = parseInput(input, st, isDateFormat(this.wb.styles.xfs[st]?.numFmt ?? ''), this.wb.date1904)
      changes.push({ key, prev, prevF: d.formulas.get(key), next: e, nextF: f })
      range.r0 = Math.min(range.r0, r)
      range.c0 = Math.min(range.c0, c)
      range.r1 = Math.max(range.r1, r)
      range.c1 = Math.max(range.c1, c)
    }
    this.apply(d, changes, 'next')
    return this.record(sheet, changes, range)
  }

  /**
   * Sheets read from their file by pages: the rows an edit touches, and the rows read by the formulas it adds or
   * whose value it changes, are in memory first (throws when they cannot all be).
   */
  private async prepare(sheet: number, d: SheetData, inputs: CellInput[]): Promise<void> {
    let paged = false
    for (const x of this.wb.sheetsData.values()) if (x.pages) paged = true
    if (!paged) return
    // the rows edited, in runs (an edit far down and one at the top are two)
    const rows = [...new Set(inputs.map((i) => i.r))].sort((a, b) => a - b)
    const gap = d.pages?.size ?? 1
    for (let i = 0; i < rows.length; ) {
      let j = i
      while (j + 1 < rows.length && rows[j + 1] - rows[j] <= gap) j++
      await this.wb.ensure(d, rows[i], rows[j])
      i = j + 1
    }
    const changed = inputs.map((i) => ({ sheet, key: i.r * MAX_COL + i.c }))
    const added = inputs.filter((i) => i.input.length > 1 && i.input.startsWith('=')).map((i) => ({ sheet, key: i.r * MAX_COL + i.c, text: i.input.slice(1) }))
    for (const need of this.wb.calc.reads(changed, added)) {
      const x = this.wb.sheetsData.get(need.sheet)
      if (x?.pages) await this.wb.ensure(x, need.r0, need.r1)
    }
    // later rows may have pushed earlier ones out again
    if (d.pages) for (const r of rows) if (!d.pages.has(r)) throw new Error(`More rows at once than a sheet of ${(d.maxRow + 1).toLocaleString()} rows can hold in memory`)
  }

  private async styles(): Promise<StyleEditor> {
    if (!this.styleEd) {
      const rel = relOfType(this.wb.rels, 'styles')
      this.stylesPath = rel?.target ?? 'xl/styles.xml'
      const xml = this.wb.pkg.has(this.stylesPath)
        ? await this.wb.pkg.text(this.stylesPath)
        : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>'
      this.styleEd = new StyleEditor(xml)
    }
    return this.styleEd
  }

  async format(sheet: number, range: Range, patch: FmtPatch): Promise<XlsxEditResult> {
    const d = this.sheet(sheet)
    const ed = await this.styles()
    const r1 = Math.min(range.r1, range.r0 + 200_000)
    await this.wb.ensure(d, range.r0, r1)
    const before = this.wb.styles.xfs.length
    const changes: CellChange[] = []
    let budget = 300_000
    for (let r = range.r0; r <= r1 && budget > 0; r++) {
      for (let c = range.c0; c <= range.c1 && budget > 0; c++, budget--) {
        const key = r * MAX_COL + c
        const prev = getEntry(d, r, c)
        const cellPatch = patch.border ? { ...patch, sides: borderSides(patch.border, range, r, c) } : patch
        if (patch.border && !Object.keys((cellPatch as { sides: object }).sides).length) continue
        const s = patch.clear ? 0 : patch.xf !== undefined ? patch.xf : ed.derive(prev?.[2] ?? 0, cellPatch)
        const next: Entry = prev ? [prev[0], prev[1], s] : [T_EMPTY, '', s]
        const f = d.formulas.get(key)
        changes.push({ key, prev, prevF: f, next, nextF: f })
      }
    }
    this.apply(d, changes, 'next')
    // re-derive css for the grown style table
    const xml = ed.xml()
    this.wb.pkg.setPart(this.stylesPath!, xml)
    this.wb.styles = parseSheetStyles(parseXml(xml), this.wb.theme)
    const res = this.record(sheet, changes, range)
    res.styles = this.wb.styles.xfs.slice(before).map((x, i) => ({ index: before + i, css: x.css, format: x.numFmt }))
    return res
  }

  private step(ch: Change, which: 'prev' | 'next'): XlsxEditResult {
    const d = this.sheet(ch.sheet)
    this.lastRecalc = []
    if (ch.full) restore(d, which === 'prev' ? ch.full.before : ch.full.after)
    if (ch.cm) for (const [id, c] of which === 'prev' ? [...ch.cm.before].reverse() : ch.cm.after) this.wb.comments.set(id, c)
    if (ch.image) {
      const st = which === 'prev' ? ch.image.before : ch.image.after
      for (const p of st) this.wb.pkg.setPart(p.path, p.data)
      if (ch.image.sheetPath !== undefined) {
        if (which === 'prev') {
          if (ch.image.sheetWasNew) this.newSheets.delete(ch.image.sheetPath)
          else this.newSheets.set(ch.image.sheetPath, (ch.image.before.find((p) => p.path === ch.image!.sheetPath)?.data as string) ?? '')
        } else {
          this.newSheets.set(ch.image.sheetPath, (ch.image.after.find((p) => p.path === ch.image!.sheetPath)?.data as string) ?? '')
        }
      }
    }
    this.apply(d, ch.cells, which)
    if (ch.lay) applyLayout(d, which === 'prev' ? ch.lay.before : ch.lay.after)
    const recalc = ch.full ? this.recalcAll() : this.lastRecalc
    return { sheet: ch.sheet, range: ch.range, layout: ch.full || ch.lay ? this.layout(ch.sheet) : undefined, recalc }
  }

  undo(): XlsxEditResult | null {
    const ch = this.undoStack.pop()
    if (!ch) return null
    this.redoStack.push(ch)
    return this.step(ch, 'prev')
  }

  redo(): XlsxEditResult | null {
    const ch = this.redoStack.pop()
    if (!ch) return null
    this.undoStack.push(ch)
    return this.step(ch, 'next')
  }

  // ---------------------------------------------------------------- images (drawing anchored to a cell)

  /** column width of column `c` in px (mirrors how the viewer sizes columns) */
  private colPx(d: SheetData, c: number): number {
    for (const ci of d.colInfo) if (c >= ci.min && c <= ci.max) return ci.w || (d.defaultColW ?? 64)
    return d.defaultColW ?? 64
  }

  /** row height of row `r` in px (mirrors rowSizesOf; ht→px 走 colwidth.ptToPx) */
  private rowPx(d: SheetData, r: number): number {
    const a = d.rowAttrs.get(r)
    if (a) return a.hidden ? 0 : a.ht !== undefined ? ptToPx(a.ht) : (d.autoRowH.get(r) ?? d.defaultRowH ?? 20)
    return d.autoRowH.get(r) ?? d.defaultRowH ?? 20
  }

  /** the cell + EMU offset that the image's far edge lands on, given a start cell + EMU offset and a pixel size */
  private anchorTo(d: SheetData, col: number, colOff: number, row: number, rowOff: number, wPx: number, hPx: number): { col: number; colOff: number; row: number; rowOff: number } {
    let rem = colOff / EMU_PER_PX + wPx
    let c = col
    let toCol = col
    let toColOff = 0
    while (rem > 0 && c < MAX_COL) {
      const w = this.colPx(d, c)
      if (w <= 0) { c++; continue }
      if (w >= rem) { toCol = c; toColOff = Math.round(rem * EMU_PER_PX); rem = 0 }
      else { rem -= w; c++ }
    }
    if (rem > 0) { toCol = MAX_COL - 1; toColOff = Math.round(rem * EMU_PER_PX) }
    let rrem = rowOff / EMU_PER_PX + hPx
    let r = row
    let toRow = row
    let toRowOff = 0
    while (rrem > 0 && r < MAX_ROWS) {
      const h = this.rowPx(d, r)
      if (h <= 0) { r++; continue }
      if (h >= rrem) { toRow = r; toRowOff = Math.round(rrem * EMU_PER_PX); rrem = 0 }
      else { rrem -= h; r++ }
    }
    if (rrem > 0) { toRow = MAX_ROWS - 1; toRowOff = Math.round(rrem * EMU_PER_PX) }
    return { col: toCol, colOff: toColOff, row: toRow, rowOff: toRowOff }
  }

  /**
   * Inserts an image as a floating drawing anchored to `op.anchor`'s cell. Writes `xl/media/imageN.ext`, a
   * `xl/drawings/drawingN.xml` (`xdr:twoCellAnchor`) and the relationship glue, and points the sheet at it.
   * The first image on a sheet creates the drawing part; later images append an anchor to it (Excel allows one
   * `<drawing>` per sheet). Returns the image relationship id.
   */
  async image(sheet: number, op: XlsxImageOp): Promise<XlsxImageResult> {
    const d = this.sheet(sheet)
    const pkg = this.wb.pkg
    const sheetPath = this.wb.sheets[sheet].path
    const ext = op.ext.toLowerCase().replace(/^jpe?g$/, 'jpg')
    const bytes = op.bytes instanceof Uint8Array ? op.bytes : new Uint8Array(op.bytes)
    const DRAWING_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing'
    const IMG_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
    const DRAWING_CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.drawing+xml'
    const CT = '[Content_Types].xml'

    const before: { path: string; data: PartData | null }[] = []
    const after: { path: string; data: PartData | null }[] = []
    before.push({ path: CT, data: pkg.has(CT) ? await pkg.text(CT) : null })

    // media part (always new)
    const mediaPath = pkg.freeName('xl/media', 'image', ext)
    before.push({ path: mediaPath, data: null })
    after.push({ path: mediaPath, data: bytes })
    pkg.setPart(mediaPath, bytes)
    await pkg.ensureDefaultType(ext, mimeOf(mediaPath))

    // 「置于单元格」：先把宿主格撑到图片尺寸，锚点收敛为单格规范跨度（Excel 365 语义，图片不自由漂浮）
    const layBefore = op.placeInCell ? layoutState(d) : null
    const ac = op.anchor.col
    const ar = op.anchor.row
    const a = op.placeInCell
      ? (setColWidth(d, ac, ac, op.anchor.wPx), setRowHeight(d, ar, ar, op.anchor.hPx),
        { col: ac, colOff: Math.round(this.colPx(d, ac) * EMU_PER_PX), row: ar, rowOff: Math.round(this.rowPx(d, ar) * EMU_PER_PX) })
      : this.anchorTo(d, ac, 0, ar, 0, op.anchor.wPx, op.anchor.hPx)
    const aw = op.placeInCell ? this.colPx(d, ac) : op.anchor.wPx
    const ah = op.placeInCell ? this.rowPx(d, ar) : op.anchor.hPx
    const sheetRels = await pkg.rels(sheetPath)
    const existing = [...sheetRels.values()].find((r) => r.type === DRAWING_REL)
    let imgRid: string
    let sheetWasNew = false

    if (existing) {
      const drawingPath = existing.target
      const drawingBefore = await pkg.text(drawingPath)
      const dRelPath = relsPathFor(drawingPath)
      before.push({ path: dRelPath, data: pkg.has(dRelPath) ? await pkg.text(dRelPath) : null })
      imgRid = await pkg.addRel(drawingPath, IMG_REL, mediaPath)
      after.push({ path: dRelPath, data: pkg.has(dRelPath) ? await pkg.text(dRelPath) : null })
      const picId = nextPicId(drawingBefore)
      const anchor = twoCellAnchor(ac, 0, a.col, a.colOff, ar, 0, a.row, a.rowOff, aw, ah, imgRid, picId, op.placeInCell ? 'oneCell' : undefined)
      const drawingAfter = appendAnchor(drawingBefore, anchor)
      before.push({ path: drawingPath, data: drawingBefore })
      after.push({ path: drawingPath, data: drawingAfter })
      pkg.setPart(drawingPath, drawingAfter)
    } else {
      const drawingPath = pkg.freeName('xl/drawings', 'drawing', 'xml')
      const dRelPath = relsPathFor(drawingPath)
      const sRelPath = relsPathFor(sheetPath)
      before.push({ path: sRelPath, data: pkg.has(sRelPath) ? await pkg.text(sRelPath) : null })
      const drawRid = await pkg.addRel(sheetPath, DRAWING_REL, drawingPath)
      after.push({ path: sRelPath, data: pkg.has(sRelPath) ? await pkg.text(sRelPath) : null })
      before.push({ path: dRelPath, data: pkg.has(dRelPath) ? await pkg.text(dRelPath) : null })
      imgRid = await pkg.addRel(drawingPath, IMG_REL, mediaPath)
      after.push({ path: dRelPath, data: pkg.has(dRelPath) ? await pkg.text(dRelPath) : null })
      const drawingXml = drawingDoc(twoCellAnchor(ac, 0, a.col, a.colOff, ar, 0, a.row, a.rowOff, aw, ah, imgRid, 1, op.placeInCell ? 'oneCell' : undefined))
      before.push({ path: drawingPath, data: null })
      after.push({ path: drawingPath, data: drawingXml })
      pkg.setPart(drawingPath, drawingXml)
      await pkg.setContentType(drawingPath, DRAWING_CT)
      // the sheet XML itself gains a <drawing> element: keep it both as a part (no cell edits) and as the
      // rewrite base (so the kernel's row-patcher preserves it when cells are later edited and the sheet is rewritten)
      const sheetBefore = this.newSheets.get(sheetPath) ?? (pkg.has(sheetPath) ? await pkg.text(sheetPath) : '')
      const sheetAfter = insertDrawing(sheetBefore, drawRid)
      before.push({ path: sheetPath, data: sheetBefore })
      after.push({ path: sheetPath, data: sheetAfter })
      pkg.setPart(sheetPath, sheetAfter)
      sheetWasNew = !this.newSheets.has(sheetPath)
      this.newSheets.set(sheetPath, sheetAfter)
    }

    after.push({ path: CT, data: await pkg.text(CT) })

    const range: Range = { r0: op.anchor.row, c0: op.anchor.col, r1: op.anchor.row, c1: op.anchor.col }
    const ch: Change = {
      sheet,
      cells: [],
      range,
      image: {
        before,
        after,
        sheetPath: existing ? undefined : sheetPath,
        sheetWasNew: existing ? false : sheetWasNew,
      },
    }
    if (layBefore) ch.lay = { before: layBefore, after: layoutState(d) }
    this.undoStack.push(ch)
    this.redoStack = []
    return { rid: imgRid, layout: layBefore ? this.layout(sheet) : undefined }
  }

  /**
   * Reads a sheet's floating pictures (`xdr:twoCellAnchor`/`oneCellAnchor` → `xdr:pic`) with absolute px
   * geometry computed by the same colPx/rowPx walk `anchorTo` uses, so the view renders images exactly
   * where real Office does; hidden rows/cols contribute 0 and shrink the geometry accordingly.
   * Charts (`graphicFrame`) and plain shapes (`xdr:sp`) are skipped — pictures only for now.
   */
  async drawings(sheet: number): Promise<XlsxDrawingsResult> {
    const parts = await this.pictureAnchors(sheet)
    if (!parts) return { drawings: [] }
    const out: XlsxDrawingInfo[] = []
    for (const it of parts.items) {
      const dot = it.media.lastIndexOf('.')
      out.push({
        id: it.id,
        rid: it.embed,
        media: it.media,
        ext: dot >= 0 ? it.media.slice(dot + 1).toLowerCase() : 'png',
        cell: it.cell,
        host: it.host,
        x: Math.round(it.x * 100) / 100,
        y: Math.round(it.y * 100) / 100,
        w: Math.round(it.w * 100) / 100,
        h: Math.round(it.h * 100) / 100,
      })
    }
    return { drawings: out }
  }

  /**
   * Parses a sheet's drawing part into its picture anchors (in the exact order `drawings()` reports them,
   * so `drawingOp` indexes match). Keeps each anchor's span in the XML for splice-based edits.
   */
  private async pictureAnchors(sheet: number): Promise<{
    xml: string
    drawingPath: string
    items: { start: number; end: number; text: string; embed: string; media: string; id: number; cell: boolean; host: { row: number; col: number }; x: number; y: number; w: number; h: number }[]
  } | null> {
    const DRAWING_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing'
    const d = this.sheet(sheet)
    const pkg = this.wb.pkg
    const sheetRels = await pkg.rels(this.wb.sheets[sheet].path)
    const dr = [...sheetRels.values()].find((r) => r.type === DRAWING_REL)
    if (!dr) return null
    const xml = pkg.has(dr.target) ? await pkg.text(dr.target) : ''
    if (!xml) return null
    const dRels = await pkg.rels(dr.target)

    const block = (name: string, s: string): string => {
      const m = new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(s)
      return m?.[1] ?? ''
    }
    const v = (name: string, s: string): number => Number(new RegExp(`<(?:\\w+:)?${name}>(-?\\d+)</(?:\\w+:)?${name}>`).exec(s)?.[1] ?? 0)
    // absolute px of an anchor edge: sum cell sizes before it, then the EMU offset (mirrors anchorTo)
    const absX = (c: number, offEmu: number) => {
      let s = 0
      for (let i = 0; i < Math.min(c, MAX_COL); i++) s += this.colPx(d, i)
      return s + offEmu / EMU_PER_PX
    }
    const absY = (r: number, offEmu: number) => {
      let s = 0
      for (let i = 0; i < Math.min(r, MAX_ROWS); i++) s += this.rowPx(d, i)
      return s + offEmu / EMU_PER_PX
    }

    const items: { start: number; end: number; text: string; embed: string; media: string; id: number; cell: boolean; host: { row: number; col: number }; x: number; y: number; w: number; h: number }[] = []
    const re = /<(?:\w+:)?(twoCellAnchor|oneCellAnchor)\b[^>]*>([\s\S]*?)<\/(?:\w+:)?\1>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(xml))) {
      const body = m[2]
      const embed = /r:embed="([^"]+)"/.exec(body)?.[1]
      if (!embed) continue
      const rel = dRels.get(embed)
      if (!rel) continue
      const from = block('from', body)
      const to = block('to', body)
      const ext = /<(?:\w+:)?ext\s+[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(body)
      const fc = v('col', from), fco = v('colOff', from), fr = v('row', from), fro = v('rowOff', from)
      const x = absX(fc, fco)
      const y = absY(fr, fro)
      let w = 0, h = 0
      if (to) {
        w = absX(v('col', to), v('colOff', to)) - x
        h = absY(v('row', to), v('rowOff', to)) - y
      } else if (ext) {
        w = Number(ext[1]) / EMU_PER_PX
        h = Number(ext[2]) / EMU_PER_PX
      }
      if (!(w > 0 && h > 0)) continue
      items.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        embed,
        media: rel.target,
        id: Number(/cNvPr[^>]*\bid="(\d+)"/.exec(body)?.[1] ?? items.length + 1),
        cell: /editAs="oneCell"/.test(m[0]),
        host: { row: fr, col: fc },
        x, y, w, h,
      })
    }
    return { xml, drawingPath: dr.target, items }
  }

  /** does any drawing part other than `skipDrawing` still reference the media part? */
  private async mediaUsedElsewhere(media: string, skipDrawing: string): Promise<boolean> {
    const DRAWING_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing'
    const pkg = this.wb.pkg
    const used = async (part: string) => {
      for (const r of (await pkg.rels(part)).values()) if (r.type.endsWith('/image') && r.target.toLowerCase() === media.toLowerCase()) return true
      return false
    }
    for (const s of this.wb.sheets) {
      for (const r of (await pkg.rels(s.path)).values()) {
        if (!r.type.endsWith('/drawing') || r.target.toLowerCase() === skipDrawing.toLowerCase()) continue
        if (await used(r.target)) return true
      }
    }
    return false
  }

  /**
   * Moves / resizes / deletes one floating picture by its `drawings()` index. px geometry is converted back
   * to twoCellAnchor cell anchors (same colPx/rowPx math the viewer renders with), so real Office opens the
   * picture at the same place; delete cleans the image rel and the orphaned media part. Recorded as a part
   * snapshot Change (the same mechanism `image()` uses) for undo/redo.
   *
   * 「置于单元格」pictures (`editAs="oneCell"`) follow Excel 365 semantics instead of free-floating: the anchor
   * always spans exactly one cell, so `move` re-hosts to the cell the box lands in and `resize` grows that
   * cell's column width / row height (returned as `layout` so the view stretches the grid with the picture).
   */
  async drawingOp(sheet: number, op: XlsxDrawingOp): Promise<XlsxEditResult> {
    const parts = await this.pictureAnchors(sheet)
    const it = parts?.items[op.index]
    if (!parts || !it) throw new Error(`No picture at index ${op.index}`)
    const d = this.sheet(sheet)
    const pkg = this.wb.pkg
    const drawingPath = parts.drawingPath
    let anchorText = it.text
    let range: Range = { r0: 0, c0: 0, r1: 0, c1: 0 }
    const layBefore = it.cell && op.kind !== 'delete' ? layoutState(d) : null
    if (op.kind !== 'delete') {
      const x = Math.max(0, op.x)
      const y = Math.max(0, op.y)
      const w = Math.max(1, op.kind === 'resize' ? op.w : it.w)
      const h = Math.max(1, op.kind === 'resize' ? op.h : it.h)
      const fx = posTo(x, (c) => this.colPx(d, c), MAX_COL)
      const fy = posTo(y, (r) => this.rowPx(d, r), MAX_ROWS)
      if (it.cell) {
        // 格内图：宿主格 = 落点格。move 让图片贴合该格现尺寸（不撑格）；resize 把该格撑到拖出的尺寸
        if (op.kind === 'resize') {
          setColWidth(d, fx.idx, fx.idx, w)
          setRowHeight(d, fy.idx, fy.idx, h)
        }
        const cw = this.colPx(d, fx.idx)
        const rh = this.rowPx(d, fy.idx)
        const to = { col: fx.idx, colOff: Math.round(cw * EMU_PER_PX), row: fy.idx, rowOff: Math.round(rh * EMU_PER_PX) }
        anchorText = rewriteAnchor(anchorText, { idx: fx.idx, off: 0 }, { idx: fy.idx, off: 0 }, to, cw, rh)
        range = { r0: fy.idx, c0: fx.idx, r1: fy.idx, c1: fx.idx }
      } else {
        const to = this.anchorTo(d, fx.idx, fx.off, fy.idx, fy.off, w, h)
        anchorText = rewriteAnchor(anchorText, fx, fy, to, w, h)
        range = { r0: fy.idx, c0: fx.idx, r1: to.row, c1: to.col }
      }
    }
    const xmlAfter = parts.xml.slice(0, it.start) + anchorText + parts.xml.slice(it.end)
    const before: { path: string; data: PartData | null }[] = [{ path: drawingPath, data: parts.xml }]
    const after: { path: string; data: PartData | null }[] = []

    if (op.kind === 'delete') {
      const dRelPath = relsPathFor(drawingPath)
      before.push({ path: dRelPath, data: pkg.has(dRelPath) ? await pkg.text(dRelPath) : null })
      await pkg.removeRelsTo(drawingPath, it.media)
      after.push({ path: dRelPath, data: pkg.has(dRelPath) ? await pkg.text(dRelPath) : null })
      // the media part goes away when no other drawing of any sheet still references it
      if (!(await this.mediaUsedElsewhere(it.media, drawingPath))) {
        before.push({ path: it.media, data: pkg.has(it.media) ? new Uint8Array(await (await pkg.blob(it.media)).arrayBuffer()) : null })
        after.push({ path: it.media, data: null })
        pkg.setPart(it.media, null)
      }
    }
    after.push({ path: drawingPath, data: xmlAfter })
    pkg.setPart(drawingPath, xmlAfter)

    const ch: Change = { sheet, cells: [], range, image: { before, after } }
    if (layBefore) ch.lay = { before: layBefore, after: layoutState(d) }
    this.undoStack.push(ch)
    this.redoStack = []
    return { sheet, range, layout: layBefore ? this.layout(sheet) : undefined, recalc: [] }
  }

  // ---------------------------------------------------------------- native OOXML features (chart / condFmt / validation / slicer / pivot)

  private async readSidecar(): Promise<Sidecar> {
    const pkg = this.wb.pkg
    return parseSidecar(pkg.has(SIDECAR) ? await pkg.text(SIDECAR) : null)
  }

  /** the sheet's drawing part (shared with xlsx.image) — read-only here */
  private async drawingPathFor(sheet: number): Promise<{ path: string; rid: string; existing: boolean }> {
    const pkg = this.wb.pkg
    const sheetPath = this.wb.sheets[sheet].path
    const dr = [...(await pkg.rels(sheetPath)).values()].find((r) => r.type === REL_DRAWING)
    if (dr) return { path: dr.target, rid: dr.id, existing: true }
    return { path: pkg.freeName('xl/drawings', 'drawing', 'xml'), rid: '', existing: false }
  }

  private async sheetXml(sheet: number): Promise<string> {
    const pkg = this.wb.pkg
    const path = this.wb.sheets[sheet].path
    return this.newSheets.get(path) ?? (pkg.has(path) ? await pkg.text(path) : '')
  }

  /** absolute layout px of a cell anchor (same walk as drawings()) */
  private anchorGeom(sheet: number, a: { row: number; col: number; wPx: number; hPx: number }) {
    const d = this.sheet(sheet)
    const absX = (c: number, off = 0) => { let s = 0; for (let i = 0; i < Math.min(c, MAX_COL); i++) s += this.colPx(d, i); return s + off / EMU_PER_PX }
    const absY = (r: number, off = 0) => { let s = 0; for (let i = 0; i < Math.min(r, MAX_ROWS); i++) s += this.rowPx(d, i); return s + off / EMU_PER_PX }
    return { x: absX(a.col), y: absY(a.row), w: a.wPx, h: a.hPx, to: this.anchorTo(d, a.col, 0, a.row, 0, a.wPx, a.hPx) }
  }

  /** read back every native feature of a sheet (geometry recomputed to match the current layout) */
  async features(sheet: number): Promise<SheetFeatures> {
    const all = await this.readSidecar()
    const f: SheetFeatures = { ...emptyFeatures(), ...(all[this.wb.sheets[sheet].path] ?? {}) }
    f.charts = (f.charts ?? []).map((c) => { const g = this.anchorGeom(sheet, c.anchor); return { ...c, x: g.x, y: g.y, w: g.w, h: g.h } })
    f.slicers = (f.slicers ?? []).map((s) => { const g = this.anchorGeom(sheet, { row: s.anchor.row, col: s.anchor.col, wPx: 180, hPx: 96 }); return { ...s, x: g.x, y: g.y } })
    f.series = f.series ?? []
    return f
  }

  /** ids of our own deterministic relationships in an existing rels part */
  private ourRelIds(existing: string | null, prefixes: string[]): string[] {
    const ids: string[] = []
    if (!existing) return ids
    const re = /<Relationship\b[^>]*\/>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(existing))) {
      const id = /\bId="([^"]+)"/.exec(m[0])?.[1] ?? ''
      if (prefixes.some((p) => id.startsWith(p))) ids.push(id)
    }
    return ids
  }

  private async writeRels(part: string, add: RelEntry[], prefixes: string[]): Promise<void> {
    const pkg = this.wb.pkg
    const rp = relsPath(part)
    const existing = pkg.has(rp) ? await pkg.text(rp) : null
    pkg.setPart(rp, mergeRels(existing, add, this.ourRelIds(existing, prefixes)))
  }

  /**
   * Writes all native features for `after` and snapshots every touched part (before/after) into one
   * undoable Change. The sidecar is authoritative for readback; the SpreadsheetML parts are what
   * real Office opens. `newSheets` is kept seeded so a later cell rewrite never drops our tail parts.
   */
  private async featureMutation(
    sheet: number,
    mutate: (f: SheetFeatures, ctx: { drawingPath: string; sheetPath: string; sheetName: string }) => CellChange[] | void | Promise<CellChange[] | void>,
    /** 序列定义只写 sidecar + 单元格，不生成任何 OOXML part：跳过 regenerateFeatures 以免重写
     *  styles/rels/workbook 引入无关改动；sidecar 与单元格的 before/after 仍照常进单步 undo。 */
    opts?: { skipRegenerate?: boolean },
  ): Promise<XlsxEditResult> {
    const pkg = this.wb.pkg
    const sheetPath = this.wb.sheets[sheet].path
    const sheetName = this.wb.sheets[sheet].name
    const mainPath = this.wb.mainPath
    const stylesPath = relOfType(this.wb.rels, 'styles')?.target ?? 'xl/styles.xml'
    const dp = await this.drawingPathFor(sheet)
    const ctx = { drawingPath: dp.path, sheetPath, sheetName }

    const all = await this.readSidecar()
    const before: SheetFeatures = JSON.parse(JSON.stringify(all[sheetPath] ?? emptyFeatures()))
    const after: SheetFeatures = JSON.parse(JSON.stringify(before))
    const cells = (await mutate(after, ctx)) || []
    all[sheetPath] = after

    // Every part this write can touch. A series (skipRegenerate) creates no OOXML part, so only the
    // sidecar, [Content_Types].xml (json default) and the sheet XML itself can differ — snapshotting
    // the full chart/pivot part set would just re-decompress parts that provably never change.
    const touched = opts?.skipRegenerate
      ? new Set<string>(['[Content_Types].xml', SIDECAR, sheetPath])
      : new Set<string>([
          ...partPathsOf(before, sheetPath, dp.path, stylesPath, mainPath),
          ...partPathsOf(after, sheetPath, dp.path, stylesPath, mainPath),
        ])
    const snapBefore = new Map<string, PartData | null>()
    for (const p of touched) snapBefore.set(p, pkg.has(p) ? await pkg.text(p) : null)

    await pkg.ensureDefaultType('json', SIDECAR_CT)
    pkg.setPart(SIDECAR, JSON.stringify(all))
    if (!opts?.skipRegenerate) await this.regenerateFeatures(sheet, before, after, ctx, dp)

    // A part setPart never touched still holds exactly its snapBefore text — re-reading it through
    // the ZIP (DecompressionStream) is pure waste. For parts actually written, pkg.text() returns
    // the setPart value directly (no decompression); everything else reuses its before snapshot.
    const current = async (p: string): Promise<PartData | null> =>
      pkg.changed(p) !== undefined ? (pkg.has(p) ? await pkg.text(p) : null) : (snapBefore.get(p) ?? null)
    const sheetAfter = await current(sheetPath)
    const partBefore: { path: string; data: PartData | null }[] = []
    const partAfter: { path: string; data: PartData | null }[] = []
    for (const p of touched) {
      const b = snapBefore.get(p) ?? null
      const a = await current(p)
      if (b !== a) { partBefore.push({ path: p, data: b }); partAfter.push({ path: p, data: a }) }
    }
    // the sheet XML must always be in the snapshot so undo/redo re-seeds newSheets correctly
    if (!partBefore.some((x) => x.path === sheetPath)) {
      partBefore.push({ path: sheetPath, data: snapBefore.get(sheetPath) ?? null })
      partAfter.push({ path: sheetPath, data: sheetAfter })
    }

    if (cells.length) {
      const d = this.sheet(sheet)
      this.apply(d, cells, 'next')
    }
    const range: Range = { r0: 0, c0: 0, r1: 0, c1: 0 }
    this.undoStack.push({ sheet, cells, range, image: { before: partBefore, after: partAfter, sheetPath, sheetWasNew: false } })
    this.redoStack = []
    return { sheet, range, recalc: this.lastRecalc }
  }

  /** regenerate every real OOXML part from `after` (and clean parts that disappeared) */
  private async regenerateFeatures(
    sheet: number,
    before: SheetFeatures,
    after: SheetFeatures,
    ctx: { drawingPath: string; sheetPath: string; sheetName: string },
    dp: { path: string; rid: string; existing: boolean },
  ): Promise<void> {
    const pkg = this.wb.pkg
    const { drawingPath, sheetPath, sheetName } = ctx
    const mainPath = this.wb.mainPath

    // ---- sheet XML tail: conditionalFormatting / dataValidations / slicerList / drawing ----
    const sheetBefore = await this.sheetXml(sheet)
    const pm = /<([\w.-]+:)?worksheet\b/.exec(sheetBefore)
    const prefix = pm?.[1] ?? ''
    const needDrawing = after.charts.length > 0 && !dp.existing
    const drawingRid = needDrawing ? 'rIdDrawingMdview' : undefined
    const sheetAfter = injectSheetElements(sheetBefore, {
      condFmt: condFmtBlocks(after.condFmt),
      validations: dataValidationsXml(after.validations),
      slicerList: slicerListExt(after.slicers),
      drawingRid,
      prefix,
    })
    pkg.setPart(sheetPath, sheetAfter)
    this.newSheets.set(sheetPath, sheetAfter)

    // ---- styles.xml <dxfs> (through StyleEditor so later format() calls keep them) ----
    const ed = await this.styles()
    ed.setDxfs(after.condFmt.length ? dxfsSection(after.condFmt) : null)
    const stylesPath = this.stylesPath!
    pkg.setPart(stylesPath, ed.xml())
    await pkg.setContentType(stylesPath, 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml')

    // ---- sheet rels: drawing / slicers / pivot tables ----
    const sheetRels: RelEntry[] = []
    if (needDrawing) sheetRels.push({ id: 'rIdDrawingMdview', type: REL_DRAWING, target: relativeTarget(dirOf(sheetPath), drawingPath) })
    for (const s of after.slicers) sheetRels.push({ id: slicerRid(s.id), type: REL_SLICER, target: relativeTarget(dirOf(sheetPath), s.slicerPart) })
    for (const p of after.pivots) sheetRels.push({ id: pivotTableRid(p.id), type: REL_PIVOT_TABLE, target: relativeTarget(dirOf(sheetPath), p.tablePart) })
    await this.writeRels(sheetPath, sheetRels, ['rIdDrawingMdview', 'rIdSlicer', 'rIdPivot'])

    // ---- workbook rels: styles / slicer caches / pivot cache definitions ----
    const wbRels: RelEntry[] = []
    const hasStylesRel = [...(await pkg.rels(mainPath)).values()].some((r) => r.type.endsWith('/styles'))
    if (!hasStylesRel) wbRels.push({ id: 'rIdStylesMdview', type: NS_R + '/styles', target: relativeTarget(dirOf(mainPath), stylesPath) })
    for (const s of after.slicers) wbRels.push({ id: slicerCacheRid(s.id), type: REL_SLICER_CACHE, target: relativeTarget(dirOf(mainPath), s.cachePart) })
    for (const p of after.pivots) wbRels.push({ id: pivotCacheRid(p.cacheId), type: REL_PIVOT_CACHE_DEF, target: relativeTarget(dirOf(mainPath), p.cacheDefPart) })
    await this.writeRels(mainPath, wbRels, ['rIdStylesMdview', 'rIdSlicerCache', 'rIdPivotCache'])

    // ---- charts: chart parts + graphicFrames in the drawing part ----
    const beforeChartParts = new Set(before.charts.map((c) => c.chartPart))
    const afterChartParts = new Set(after.charts.map((c) => c.chartPart))
    for (const c of after.charts) {
      pkg.setPart(c.chartPart, chartSpaceXml(c, sheetName))
      await pkg.setContentType(c.chartPart, CT_CHART)
    }
    for (const p of beforeChartParts) if (!afterChartParts.has(p)) { pkg.setPart(p, null); await pkg.setContentType(p, null) }
    if (after.charts.length || before.charts.length) {
      let drawing = pkg.has(drawingPath) ? await pkg.text(drawingPath) : drawingDoc('')
      drawing = stripChartFrames(drawing)
      const frames = after.charts.map((c) => {
        const g = this.anchorGeom(sheet, c.anchor)
        return graphicFrameXml(c, c.anchor.col, 0, c.anchor.row, 0, g.to.col, g.to.colOff, g.to.row, g.to.rowOff, c.anchor.wPx, c.anchor.hPx)
      }).join('')
      drawing = appendToDrawing(drawing, frames)
      pkg.setPart(drawingPath, drawing)
      await pkg.setContentType(drawingPath, CT_DRAWING)
      const dRels: RelEntry[] = after.charts.map((c) => ({ id: c.rid, type: REL_CHART, target: relativeTarget(dirOf(drawingPath), c.chartPart) }))
      await this.writeRels(drawingPath, dRels, ['rIdChart'])
    }

    // ---- slicers: cache part + slicer part ----
    const beforeSlicerParts = new Set(before.slicers.flatMap((s) => [s.cachePart, s.slicerPart]))
    const afterSlicerParts = new Set(after.slicers.flatMap((s) => [s.cachePart, s.slicerPart]))
    for (const p of beforeSlicerParts) if (!afterSlicerParts.has(p)) { pkg.setPart(p, null); await pkg.setContentType(p, null) }
    for (const s of after.slicers) {
      pkg.setPart(s.cachePart, slicerCacheXml(s))
      pkg.setPart(s.slicerPart, slicerViewXml(s))
      await pkg.setContentType(s.cachePart, CT_SLICER_CACHE)
      await pkg.setContentType(s.slicerPart, CT_SLICER)
    }

    // ---- pivots: cache definition + cache records + table definition (+ their rels) ----
    const beforePivotParts = new Set(before.pivots.flatMap((p) => [p.cacheDefPart, p.cacheRecPart, p.tablePart, relsPath(p.cacheDefPart), relsPath(p.tablePart)]))
    const afterPivotParts = new Set(after.pivots.flatMap((p) => [p.cacheDefPart, p.cacheRecPart, p.tablePart, relsPath(p.cacheDefPart), relsPath(p.tablePart)]))
    for (const p of beforePivotParts) if (!afterPivotParts.has(p)) { pkg.setPart(p, null); await pkg.setContentType(p, null) }
    for (const p of after.pivots) {
      const { records, header, outR, outC } = await this.pivotData(sheet, p)
      pkg.setPart(p.cacheDefPart, pivotCacheDefXml(p, sheetName, records.length, header))
      pkg.setPart(p.cacheRecPart, pivotCacheRecordsXml(records))
      pkg.setPart(p.tablePart, pivotTableXml(p, sheetName, outR, outC, header.length))
      await pkg.setContentType(p.cacheDefPart, CT_PIVOT_CACHE_DEF)
      await pkg.setContentType(p.cacheRecPart, CT_PIVOT_CACHE_REC)
      await pkg.setContentType(p.tablePart, CT_PIVOT_TABLE)
      await this.writeRels(p.cacheDefPart, [{ id: 'rId1', type: REL_PIVOT_CACHE_REC, target: relativeTarget(dirOf(p.cacheDefPart), p.cacheRecPart) }], ['rId1'])
      await this.writeRels(p.tablePart, [{ id: 'rId1', type: REL_PIVOT_CACHE_DEF, target: relativeTarget(dirOf(p.tablePart), p.cacheDefPart) }], ['rId1'])
    }

    // ---- workbook.xml: <pivotCaches> + x14 slicerCaches extLst ----
    await this.writeWorkbookFeatures(after)
  }

  /** read a pivot's source matrix and compute the cross-tab geometry (records = raw data rows) */
  private async pivotData(sheet: number, p: PivotFeature): Promise<{ records: string[][]; header: string[]; outR: number; outC: number }> {
    const blk = await this.wb.block(sheet, p.source.r0, p.source.r1 + 1)
    const width = p.source.c1 - p.source.c0 + 1
    const m = new Map<number, string[]>()
    for (const row of blk.rows) {
      const arr = new Array(width).fill('')
      for (const cell of row.cells) { const c = cell[0] as number; if (c >= p.source.c0 && c <= p.source.c1) arr[c - p.source.c0] = String(cell[1] ?? '') }
      m.set(row.r, arr)
    }
    const header = m.get(p.source.r0) ?? new Array(width).fill('')
    const records: string[][] = []
    for (let r = p.source.r0 + 1; r <= p.source.r1; r++) { const v = m.get(r); if (v && v.some((x) => x !== '')) records.push(v) }
    const rowKeys = new Set<string>()
    const colKeys = new Set<string>()
    for (const row of records) {
      if (p.rows.length) rowKeys.add(p.rows.map((f) => row[f] ?? '').filter(Boolean).join(' / ') || '(空白)')
      if (p.cols.length) colKeys.add(p.cols.map((f) => row[f] ?? '').filter(Boolean).join(' / ') || '(空白)')
    }
    const outR = Math.max(1, rowKeys.size) + 2
    const outC = Math.max(1, colKeys.size) + 2
    return { records, header, outR, outC }
  }

  /** add <pivotCaches> and the x14 slicerCaches <extLst> to workbook.xml */
  private async writeWorkbookFeatures(after: SheetFeatures): Promise<void> {
    const pkg = this.wb.pkg
    const mainPath = this.wb.mainPath
    const xml = pkg.has(mainPath) ? await pkg.text(mainPath) : ''
    const nodes = parseRaw(xml)
    const root = rootEl(nodes)
    if (!root) return
    const P = prefixOf(root.q)
    const pc = pivotCachesEl(after.pivots)
    const sc = slicerCachesExt(after.slicers)
    // drop our previous versions
    root.c = root.c.filter((c) => !(isNode(c) && (local(c.q) === 'pivotCaches' || local(c.q) === 'extLst')))
    if (pc) setOrdered(root, rootEl(parseRaw(pc))!, 'pivotCaches', WB_ORDER)
    if (sc) {
      setOrdered(root, rootEl(parseRaw(sc))!, 'extLst', WB_ORDER)
      // ensure x14 / mc namespaces + mc:Ignorable on the workbook root
      if (!/xmlns:x14=/.test(root.a)) root.a += ` xmlns:x14="${NS_X14}"`
      if (!/xmlns:mc=/.test(root.a)) root.a += ` xmlns:mc="${NS_MC}"`
      const ig = /mc:Ignorable="([^"]*)"/.exec(root.a)
      const list = ig ? ig[1].split(/\s+/).filter(Boolean) : []
      if (!list.includes('x14')) list.push('x14')
      if (ig) root.a = root.a.replace(/mc:Ignorable="[^"]*"/, `mc:Ignorable="${list.join(' ')}"`)
      else root.a += ` mc:Ignorable="${list.join(' ')}"`
    }
    root.self = root.c.length === 0
    pkg.setPart(mainPath, serialize(nodes))
  }

  /** build the cross-tab result cells for a pivot (values written into sheetData, real cells) */
  private async pivotCells(sheet: number, p: PivotFeature): Promise<CellChange[]> {
    const d = this.sheet(sheet)
    const blk = await this.wb.block(sheet, p.source.r0, p.source.r1 + 1)
    const width = p.source.c1 - p.source.c0 + 1
    const m = new Map<number, string[]>()
    for (const row of blk.rows) {
      const arr = new Array(width).fill('')
      for (const cell of row.cells) { const c = cell[0] as number; if (c >= p.source.c0 && c <= p.source.c1) arr[c - p.source.c0] = String(cell[1] ?? '') }
      m.set(row.r, arr)
    }
    const header = m.get(p.source.r0) ?? new Array(width).fill('')
    const name = (c: number) => (header[c] ?? '').trim() || colName(c)
    const valFs = p.values
    const grid = new Map<string, number[][]>()
    const rowKeys: string[] = [], colKeys: string[] = []
    for (let r = p.source.r0 + 1; r <= p.source.r1; r++) {
      const row = m.get(r)
      if (!row || !row.some((x) => x !== '')) continue
      const rk = p.rows.length ? p.rows.map((f) => (row[f] ?? '').trim()).filter(Boolean).join(' / ') || '(空白)' : '全部'
      const ck = p.cols.length ? p.cols.map((f) => (row[f] ?? '').trim()).filter(Boolean).join(' / ') || '(空白)' : '全部'
      if (!rowKeys.includes(rk)) rowKeys.push(rk)
      if (!colKeys.includes(ck)) colKeys.push(ck)
      const k = `${rk}\u0000${ck}`
      if (!grid.has(k)) grid.set(k, valFs.map(() => [] as number[]))
      valFs.forEach((v, vi) => { const n = Number((row[v.c] ?? '').replace(/[,¥$\s%]/g, '')); grid.get(k)![vi].push(Number.isFinite(n) ? n : 0) })
    }
    const agg = (xs: number[], how: string) => {
      if (!xs.length) return 0
      if (how === 'count') return xs.length
      if (how === 'avg') return xs.reduce((a, b) => a + b, 0) / xs.length
      if (how === 'max') return Math.max(...xs)
      if (how === 'min') return Math.min(...xs)
      return xs.reduce((a, b) => a + b, 0)
    }
    const out: { r: number; c: number; text: string }[] = []
    const r0 = p.location.r0, c0 = p.location.c0
    const W = Math.max(1, colKeys.length) + (p.cols.length ? 1 : 0)
    out.push({ r: r0, c: c0, text: (p.rows.length ? p.rows.map(name).join(' / ') : '全部') + ' ／ ' + (p.cols.length ? p.cols.map(name).join(' / ') : '全部') })
    valFs.forEach((v, vi) => {
      const b0 = c0 + 1 + vi * W
      colKeys.forEach((ck, ci) => out.push({ r: r0, c: b0 + ci, text: p.cols.length ? ck : name(v.c) }))
      if (p.cols.length) out.push({ r: r0, c: b0 + colKeys.length, text: '总计' })
      rowKeys.forEach((rk, ri) => {
        const r = r0 + 1 + ri
        if (vi === 0) out.push({ r, c: c0, text: rk })
        const all: number[] = []
        colKeys.forEach((ck, ci) => { const xs = (grid.get(`${rk}\u0000${ck}`) ?? [])[vi] ?? []; all.push(...xs); out.push({ r, c: b0 + ci, text: xs.length ? String(agg(xs, v.agg)) : '' }) })
        if (p.cols.length) out.push({ r, c: b0 + colKeys.length, text: String(agg(all, v.agg)) })
      })
    })
    if (p.rows.length) {
      const tr = r0 + 1 + rowKeys.length
      out.push({ r: tr, c: c0, text: '总计' })
    }
    // ensure the target rows are in memory (paged sheets) before setEntry
    if (out.length) await this.wb.ensure(d, r0, r0 + 2 + rowKeys.length)
    const cc = (o: { r: number; c: number; text: string }): CellChange => {
      const key = o.r * MAX_COL + o.c
      const prev = getEntry(d, o.r, o.c)
      const isNum = o.text !== '' && Number.isFinite(Number(o.text))
      const next: Entry = isNum ? [T_NUM, Number(o.text), 0] : [T_STR, o.text, 0]
      return { key, prev, prevF: d.formulas.get(key), next, nextF: undefined }
    }
    return out.map(cc)
  }

  // ---- public write operations -------------------------------------------------

  async chartAdd(sheet: number, op: ChartAddOp): Promise<XlsxEditResult> {
    return this.featureMutation(sheet, (f, ctx) => {
      const id = Math.max(0, ...f.charts.map((c) => c.id)) + 1
      const chart: ChartFeature = {
        id, kind: op.kind, title: op.title, source: op.source, data: op.data, anchor: op.anchor,
        chartPart: chartPartName(id), drawingPart: ctx.drawingPath, rid: chartRid(id),
      }
      f.charts.push(chart)
    })
  }

  async chartRefresh(sheet: number, id: number): Promise<XlsxEditResult> {
    return this.featureMutation(sheet, async (f) => {
      const c = f.charts.find((x) => x.id === id)
      if (!c) return
      const blk = await this.wb.block(sheet, c.source.r0, c.source.r1 + 1)
      const width = c.source.c1 - c.source.c0 + 1
      const matrix: string[][] = []
      for (let r = c.source.r0; r <= c.source.r1; r++) {
        const row = blk.rows.find((x) => x.r === r)
        const arr = new Array(width).fill('')
        if (row) for (const cell of row.cells) { const col = cell[0] as number; if (col >= c.source.c0 && col <= c.source.c1) arr[col - c.source.c0] = String(cell[1] ?? '') }
        matrix.push(arr)
      }
      const data = chartDataOf(matrix)
      if (data) c.data = data
    })
  }

  async condFmtSet(sheet: number, rules: CondFmtRule[]): Promise<XlsxEditResult> {
    return this.featureMutation(sheet, (f) => { f.condFmt = rules })
  }

  async validationSet(sheet: number, rules: ValidationRule[]): Promise<XlsxEditResult> {
    return this.featureMutation(sheet, (f) => { f.validations = rules })
  }

  async slicerAdd(sheet: number, op: SlicerAddOp): Promise<XlsxEditResult> {
    return this.featureMutation(sheet, (f) => {
      const id = Math.max(0, ...f.slicers.map((s) => s.id)) + 1
      f.slicers.push({ id, ...op, selected: [], cachePart: slicerCachePartName(id), slicerPart: slicerPartName(id) })
    })
  }

  async slicerSelect(sheet: number, id: number, selected: string[]): Promise<XlsxEditResult> {
    return this.featureMutation(sheet, (f) => {
      const s = f.slicers.find((x) => x.id === id)
      if (s) s.selected = selected
    })
  }

  async pivotAdd(sheet: number, op: PivotAddOp): Promise<XlsxEditResult> {
    const id = Math.max(0, ...(await this.readSidecar())[this.wb.sheets[sheet].path]?.pivots?.map((p) => p.id) ?? [0]) + 1
    const cacheId = 100 + id
    const p: PivotFeature = {
      id, ...op, cacheId,
      cacheDefPart: pivotCacheDefName(cacheId), cacheRecPart: pivotCacheRecName(cacheId), tablePart: pivotTableName(id),
    }
    return this.featureMutation(sheet, async (f) => { f.pivots.push(p); return this.pivotCells(sheet, p) })
  }

  async pivotRefresh(sheet: number, id: number): Promise<XlsxEditResult> {
    return this.featureMutation(sheet, async (f) => {
      const p = f.pivots.find((x) => x.id === id)
      return p ? this.pivotCells(sheet, p) : []
    })
  }

  /** 源数据改动后按定义重算写回：结果仍是普通单元格值；sidecar 与单元格同进单步 undo。 */
  async seriesRefresh(sheet: number, id: number): Promise<XlsxEditResult> {
    const d = this.sheet(sheet)
    const all = await this.readSidecar()
    const def = all[this.wb.sheets[sheet].path]?.series?.find((s) => s.id === id)
    if (def) await this.wb.ensure(d, def.range.r0, def.range.r1)
    return this.featureMutation(sheet, (f) => {
      const cur = f.series.find((s) => s.id === id)
      return cur ? this.seriesCells(d, cur) : []
    }, { skipRegenerate: true })
  }

  /** 读回本 sheet 的序列定义列表（私有 sidecar，供视图 / ribbon 刷新入口使用）。 */
  async seriesList(sheet: number): Promise<SeriesListResult> {
    const all = await this.readSidecar()
    return [...(all[this.wb.sheets[sheet].path]?.series ?? [])]
  }

  // ---------------------------------------------------------------- collaboration

  /** takes the change recorded by the last operation out of the (unused) undo history */
  takeRecord(): Change | undefined {
    const ch = this.undoStack.pop()
    this.undoStack = []
    this.redoStack = []
    return ch
  }

  /** exactly undoes a recorded change (rolling back an unconfirmed operation) */
  revertRecord(ch: Change): XlsxEditResult {
    return this.step(ch, 'prev')
  }

  /** sets the cells / layout touched by `ch` to its `which` state, recorded as a new change */
  restoreRecord(ch: Change, which: 'prev' | 'next'): XlsxEditResult {
    const d = this.sheet(ch.sheet)
    const cells: CellChange[] = ch.cells.map((c) => ({
      key: c.key,
      prev: getEntry(d, Math.floor(c.key / MAX_COL), c.key % MAX_COL),
      prevF: d.formulas.get(c.key),
      next: which === 'prev' ? c.prev : c.next,
      nextF: which === 'prev' ? c.prevF : c.nextF,
    }))
    const counter: Change = {
      sheet: ch.sheet,
      cells,
      range: ch.range,
      lay: ch.lay ? { before: layoutState(d), after: which === 'prev' ? ch.lay.before : ch.lay.after } : undefined,
      full: ch.full ? { before: snapshot(d), after: which === 'prev' ? ch.full.before : ch.full.after } : undefined,
      cm: ch.cm
        ? { before: ch.cm.before.map(([id]) => [id, this.wb.comments.get(id) ?? null]), after: which === 'prev' ? [...ch.cm.before].reverse() : ch.cm.after }
        : undefined,
    }
    const res = this.step(counter, 'next')
    this.undoStack.push(counter)
    return res
  }

  /** style table sizes before an operation */
  async styleMark(): Promise<Record<string, number>> {
    return (await this.styles()).mark()
  }

  /** drops styles derived after `m` (the operations that used them were rolled back) */
  async styleTruncate(m: Record<string, number>) {
    const ed = await this.styles()
    const before = ed.xml()
    ed.truncate(m)
    const xml = ed.xml()
    if (xml === before) return
    this.wb.pkg.setPart(this.stylesPath!, xml)
    this.wb.styles = parseSheetStyles(parseXml(xml), this.wb.theme)
  }

  /** style index of a cell (0 when empty) */
  styleAt(sheet: number, r: number, c: number): number {
    return getEntry(this.sheet(sheet), r, c)?.[2] ?? 0
  }

  /** current layout of a sheet (after structural edits) */
  layout(sheet: number): SheetProgress {
    const d = this.sheet(sheet)
    const rowSizes = rowSizesOf(d)
    return {
      sheet, rows: d.maxRow + 1, cols: d.maxCol + 1, rowSizes, done: true, colInfo: d.colInfo, defaultColW: d.defaultColW,
      defaultRowH: d.defaultRowH, frozen: d.frozen, gridLines: d.gridLines, merges: d.merges,
    }
  }

  /** 单元格显示文本（tm.width 的测量对象；sdkjs measureString 吃的是格式化后的显示串） */
  private shownText(d: SheetData, e: Entry | null): string {
    if (!e) return ''
    const t = e[0]
    if (t === T_SST) return this.wb.sst[e[1] as number] ?? ''
    if (t === T_BOOL) return e[1] ? 'TRUE' : 'FALSE'
    if (t === T_NUM) return formatValue(e[1] as number, this.wb.styles.xfs[e[2] as number]?.numFmt, this.wb.date1904).text
    if (t === T_ERR || t === T_DATE) return String(e[1])
    return String(e[1] ?? '')
  }

  /**
   * P5 autoFit 列宽（_autoFitColumnWidth WorksheetView.js:19335-19432，无合并/旋转支）：
   * 逐格 tm.width = 内核 textPx（显示串 × 格字号），列取 max → +ppb → chars → clamp 255
   * → mcw → px。仅当结果 > 现状才写（sdkjs 同规：autoFit 语义 = 撑到容得下）。
   */
  private async autoFitCols(sheet: number, c0: number, c1: number): Promise<XlsxEditResult> {
    const d = this.sheet(sheet)
    const m = d.metrics
    if (!m) throw new Error('metrics not ready (import path)')
    await this.wb.ensure(d, 0, Math.max(0, d.maxRow))
    const before = layoutState(d)
    const maxR = Math.max(0, d.maxRow)
    for (let c = c0; c <= c1; c++) {
      let tmw = 0
      for (let r = 0; r <= maxR; r++) {
        const row = d.rows[r]
        if (!row) continue
        for (let k = 0; k < row.length; k += 4) {
          if (row[k] !== c) continue
          const e: Entry = [row[k + 1] as number, row[k + 2], row[k + 3] as number]
          const text = this.shownText(d, e)
          if (!text) continue
          const pt = this.wb.styles.xfs[e[2]]?.fontPt ?? m.basePt
          const w = m.textPx(text, pt)
          if (w > tmw) tmw = w
        }
      }
      if (!tmw) continue
      const px = autoFitColPx(tmw, m.conv)
      const cur = this.colPx(d, c)
      if (px > cur) setColWidth(d, c, c, px)
    }
    const ch: Change = { sheet, cells: [], range: { r0: 0, c0, r1: Math.max(0, d.maxRow), c1 }, lay: { before, after: layoutState(d) } }
    this.undoStack.push(ch)
    this.redoStack = []
    return { sheet, range: ch.range, layout: this.layout(sheet) }
  }

  /**
   * P5 autoFit 行高（_updateRowHeight WorksheetView.js:10430-10499 的显式触发版）：
   * 无 customHeight 行 → newHeight = min(maxRowH, max(oldH, tm.height))。tm.height =
   * 行内逐格 max（字号 th × 显示串 \n 段数；v1 wrap 折行未接 —— 升级路径：接 flow 断行）。
   * autoFit 命令语义 = 强制重算（与加载侧自适应同式，只是无视「只增不减」的旧高缓存）。
   */
  private async autoFitRows(sheet: number, r0: number, r1: number): Promise<XlsxEditResult> {
    const d = this.sheet(sheet)
    const m = d.metrics
    if (!m) throw new Error('metrics not ready (import path)')
    await this.wb.ensure(d, r0, r1)
    const before = layoutState(d)
    for (let r = r0; r <= r1; r++) {
      const a = d.rowAttrs.get(r)
      if (a?.hidden) continue
      const row = d.rows[r]
      let tm = 0
      if (row) {
        for (let k = 0; k < row.length; k += 4) {
          const e: Entry = [row[k + 1] as number, row[k + 2], row[k + 3] as number]
          const text = this.shownText(d, e)
          if (!text) continue
          const pt = this.wb.styles.xfs[e[2]]?.fontPt ?? m.basePt
          const lines = text.split('\n').length
          const h = m.rowH(pt) * lines
          if (h > tm) tm = h
        }
      }
      const oldH = a?.ht !== undefined ? ptToPx(a.ht) : (d.autoRowH.get(r) ?? d.defaultRowH)
      const nh = Math.min(MAX_ROW_H_PX, Math.max(oldH, tm))
      if (nh === oldH) continue
      if (a?.ht !== undefined) d.rowAttrs.set(r, { ...a, ht: pxToPt(nh) })
      else d.autoRowH.set(r, nh)
      d.dirtyRows.add(r)
    }
    const ch: Change = { sheet, cells: [], range: { r0, c0: 0, r1, c1: Math.max(0, d.maxCol) }, lay: { before, after: layoutState(d) } }
    this.undoStack.push(ch)
    this.redoStack = []
    return { sheet, range: ch.range, layout: this.layout(sheet) }
  }

  private async allSheets(): Promise<{ name: string; d: SheetData }[]> {
    await Promise.all(this.wb.sheets.map((s) => this.wb.loadSheet(s.index, () => {})))
    return this.wb.sheets.map((s) => ({ name: s.name, d: this.wb.sheetsData.get(s.index)! }))
  }

  async sheetOp(sheet: number, op: SheetOp): Promise<XlsxEditResult> {
    const d = this.sheet(sheet)
    const name = this.wb.sheets[sheet].name
    const all: Range = { r0: 0, c0: 0, r1: Math.max(0, d.maxRow + 50), c1: Math.max(0, d.maxCol + 10) }
    const lay = (fn: () => void, range = all): XlsxEditResult => {
      const before = layoutState(d)
      fn()
      const ch: Change = { sheet, cells: [], range, lay: { before, after: layoutState(d) } }
      this.undoStack.push(ch)
      this.redoStack = []
      return { sheet, range, layout: this.layout(sheet) }
    }
    switch (op.op) {
      case 'insertRows':
      case 'deleteRows':
      case 'insertCols':
      case 'deleteCols': {
        if (d.pages) throw new Error(`Rows and columns cannot be inserted or deleted in a sheet of ${(d.maxRow + 1).toLocaleString()} rows (its rows are read from the file as they are shown)`)
        const others = await this.allSheets()
        const before = snapshot(d)
        const axis = op.op.endsWith('Rows') ? 'row' : 'col'
        shiftSheet(d, name, axis, op.at, op.op.startsWith('insert') ? op.n : -op.n, others)
        const cm = this.shiftComments(this.wb.sheets[sheet].path, axis, op.at, op.op.startsWith('insert') ? op.n : -op.n)
        this.formulaTouched = true
        const recalc = this.recalcAll()
        const ch: Change = { sheet, cells: [], range: all, full: { before, after: snapshot(d) }, cm }
        this.undoStack.push(ch)
        this.redoStack = []
        return { sheet, range: all, layout: this.layout(sheet), recalc }
      }
      case 'merge':
      case 'unmerge': {
        const R = op.range
        const blocks: Range[] =
          op.op === 'unmerge' || !op.mode || op.mode === 'all'
            ? [R]
            : op.mode === 'across'
              ? Array.from({ length: R.r1 - R.r0 + 1 }, (_, i) => ({ r0: R.r0 + i, r1: R.r0 + i, c0: R.c0, c1: R.c1 }))
              : Array.from({ length: R.c1 - R.c0 + 1 }, (_, i) => ({ r0: R.r0, r1: R.r1, c0: R.c0 + i, c1: R.c0 + i }))
        const res = lay(() => {
          setMerge(d, R, false)
          if (op.op === 'merge') for (const b of blocks) setMerge(d, b, true)
        }, R)
        if (op.op === 'merge') {
          // like Excel: only the top-left value of each merged block survives
          const clear: CellInput[] = []
          for (const b of blocks)
            for (let r = b.r0; r <= b.r1; r++)
              for (let c = b.c0; c <= b.c1; c++) if ((r !== b.r0 || c !== b.c0) && getEntry(d, r, c) && getEntry(d, r, c)?.[1] !== '') clear.push({ r, c, input: '' })
          if (clear.length) {
            await this.setCells(sheet, clear)
            const last = this.undoStack.pop()!
            this.undoStack[this.undoStack.length - 1].cells = last.cells
          }
        }
        return res
      }
      case 'hideRows':
        return lay(() => {
          for (let r = op.a; r <= op.b; r++) {
            const cur = d.rowAttrs.get(r)
            if (op.hidden) d.rowAttrs.set(r, { ...(cur ?? {}), hidden: true })
            else if (cur) {
              // 保留空对象（不 delete）：rowSizesOf 会为它回传默认行高，否则取消隐藏的行
              // 不在 layout.rowSizes 里，视图增量 applyProgress 会让它们仍是 0 高度（数据已恢复、视觉仍隐藏）。
              const { hidden: _h, ...rest } = cur
              d.rowAttrs.set(r, rest)
            }
            d.dirtyRows.add(r)
          }
        })
      case 'hideCols':
        return lay(() => hideCols(d, op.a, op.b, op.hidden))
      case 'gridlines':
        return lay(() => {
          d.gridLines = op.show
          d.dirtyView = true
        })
      case 'colWidth':
        return lay(() => setColWidth(d, op.c0, op.c1, op.px))
      case 'colWidthChars':
        // chars → mcw → px 三段式（setColWidth Workbook.js:8863：width=charCountToModelColWidth(chars)
        // → 0 即隐藏；渲染 px = modelColWidthToColWidth(mcw)）
        return lay(() => {
          const m = d.metrics
          const px = m ? m.conv.toPx(op.chars) : Math.max(1, Math.floor(op.chars * 7 + 5))
          if (op.chars <= 0 || px <= 0) hideCols(d, op.c0, op.c1, true)
          else setColWidth(d, op.c0, op.c1, px)
        })
      case 'rowHeight':
        return lay(() => setRowHeight(d, op.r0, op.r1, op.px))
      case 'autoFitCols':
        return this.autoFitCols(sheet, op.c0, op.c1)
      case 'autoFitRows':
        return this.autoFitRows(sheet, op.r0, op.r1)
      case 'freeze':
        return lay(() => {
          d.frozen = { rows: op.rows, cols: op.cols }
          d.dirtyView = true
        })
      case 'pageSetup':
        return lay(() => {
          applyPageSetup(d, op.setup)
        })
      case 'fill':
        await this.wb.ensure(d, op.range.r0, op.range.r1)
        return this.fill(sheet, d, op.range, op.dir, op.mode, op.src)
      case 'series':
        await this.wb.ensure(d, op.range.r0, op.range.r1)
        return this.series(sheet, d, op.range, op.dir, op.type, op.unit ?? 'day', op.step, op.stop)
      case 'moveRange':
        await this.wb.ensure(d, Math.min(op.from.r0, op.from.r0 + op.dr), Math.max(op.from.r1, op.from.r1 + op.dr))
        return this.moveRange(sheet, d, op.from, op.dr, op.dc)
      case 'sort':
        await this.wb.ensure(d, op.range.r0, op.range.r1)
        return this.sort(sheet, d, op.range, op.col, !!op.desc)
    }
  }

  /** replaces `query` in matching cells (one undo step); `at` limits it to one cell */
  async replace(sheet: number, query: string, by: string, opts: FindOptions = {}, at?: { r: number; c: number }): Promise<XlsxEditResult | null> {
    const d = this.sheet(sheet)
    const re = new RegExp(opts.whole ? `^${escRe(query)}$` : escRe(query), opts.matchCase ? 'g' : 'gi')
    const inputs: CellInput[] = []
    const cells = at ? [at] : await this.wb.find(sheet, query, opts, 1e9)
    for (const { r, c } of cells) {
      const f = d.formulas.get(r * MAX_COL + c)
      const raw = opts.formulas && f ? '=' + f : (await this.wb.cell(sheet, r, c))?.value
      if (raw === undefined || (f && !opts.formulas)) continue
      const next = raw.replace(re, by)
      if (next !== raw) inputs.push({ r, c, input: next })
    }
    return inputs.length ? this.setCells(sheet, inputs) : null
  }

  /** 数值格取数（T_NUM/T_DATE），非数值返回 null */
  private numOf(e: Entry | null): number | null {
    return e && (e[0] === T_NUM || e[0] === T_DATE) ? (e[1] as number) : null
  }

  /**
   * 填充：默认（copyValues）从源边行/列整格复制（值+公式平移+样式）。
   * mode 另支持 Office「自动填充选项」的重算：
   *  - fillSeries：沿每条线按源区段的线性趋势递推（src 指明拖拽前的源选区；无 src 时步长回退 1）
   *  - fillFormats：只把源样式落到目标（保留目标值）
   *  - fillWithoutFormat：复制值+公式平移，但保留目标自身样式
   */
  private fill(sheet: number, d: SheetData, range: Range, dir: 'down' | 'right' | 'up' | 'left', mode: FillMode = 'copyValues', src?: Range): XlsxEditResult {
    materializeShared(d)
    const { r0, r1, c0, c1 } = range
    const changes: CellChange[] = []
    // fillSeries 的源区段边界：down→[r0, src.r1]，up→[src.r0, r1]……（无 src 时退化为单格边）
    const segA = dir === 'down' ? r0 : dir === 'up' ? (src?.r0 ?? r1) : dir === 'right' ? c0 : (src?.c0 ?? c1)
    const segB = dir === 'down' ? (src?.r1 ?? r0) : dir === 'up' ? r1 : dir === 'right' ? (src?.c1 ?? c0) : c1
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        // 源行/列：down→首行，up→末行；right→首列，left→末列
        const sr = dir === 'down' ? r0 : dir === 'up' ? r1 : r
        const sc = dir === 'right' ? c0 : dir === 'left' ? c1 : c
        // 跳过源自身（填充不覆盖源）
        const isSource =
          (dir === 'down' && r === r0) || (dir === 'up' && r === r1) ||
          (dir === 'right' && c === c0) || (dir === 'left' && c === c1)
        if (isSource) continue
        const key = r * MAX_COL + c
        const srcE = getEntry(d, sr, sc)
        const sf = d.formulas.get(sr * MAX_COL + sc)
        const nf = sf ? translateFormula(sf, r - sr, c - sc) : undefined
        const cur = getEntry(d, r, c)
        if (mode === 'fillFormats') {
          // 仅填充格式：目标值不动，样式换成源样式
          const st = srcE ? srcE[2] : 0
          changes.push({ key, prev: cur, prevF: d.formulas.get(key), next: cur ? [cur[0], cur[1], st] : [T_EMPTY, '', st], nextF: undefined })
          continue
        }
        if (mode === 'fillSeries') {
          // 只写目标区（src 指明拖拽前的源选区，源区段不重写）
          const inTarget = dir === 'down' ? r > (src?.r1 ?? r0)
            : dir === 'up' ? r < (src?.r0 ?? r1)
              : dir === 'right' ? c > (src?.c1 ?? c0)
                : c < (src?.c0 ?? c1)
          if (!inTarget) continue
          const span = Math.abs(segB - segA)
          const a = this.numOf(getEntry(d, dir === 'down' || dir === 'up' ? segA : r, dir === 'left' || dir === 'right' ? segA : c))
          const b = this.numOf(getEntry(d, dir === 'down' || dir === 'up' ? segB : r, dir === 'left' || dir === 'right' ? segB : c))
          // 源区段都是数值时按线性趋势递推（沿填充方向递增）；否则按复制处理
          const stepV = fillTrendStep(a, b, span, dir === 'up' || dir === 'left')
          if (stepV !== null && Number.isFinite(stepV)) {
            const baseV = (dir === 'down' || dir === 'right' ? b : a) as number
            const dist = dir === 'down' ? r - (src?.r1 ?? r0) : dir === 'up' ? (src?.r0 ?? r1) - r : dir === 'right' ? c - (src?.c1 ?? c0) : (src?.c0 ?? c1) - c
            // 第九批：序列填充写「引用前一格」的相对引用公式；T_NUM + 源样式保留日期 numFmt
            // （T_DATE 在内核是 ISO 字符串语义，公式结果绝不能写成 T_DATE）。
            changes.push({ key, prev: cur, prevF: d.formulas.get(key), next: [T_NUM, baseV + stepV * dist, cur ? cur[2] : srcE ? srcE[2] : 0], nextF: fillSeriesFormula(dir, r, c, stepV) })
            continue
          }
        }
        const keepStyle = mode === 'fillWithoutFormat'
        const st = keepStyle ? (cur ? cur[2] : 0) : srcE ? srcE[2] : 0
        changes.push({ key, prev: cur, prevF: d.formulas.get(key), next: srcE ? [srcE[0], nf ? '=' + nf : srcE[1], st] : null, nextF: nf })
      }
    }
    this.apply(d, changes, 'next')
    return this.record(sheet, changes, range)
  }

  /**
   * 「序列」对话框：把序列参数作为可刷新定义存入私有 sidecar，并按参数沿行/列写入序列值。
   * 走 featureMutation（skipRegenerate：序列定义无额外 OOXML part），于是 sidecar 与单元格的
   * before/after 快照一起进单步 undo；save→重开后 xlsx.seriesList 可读回，seriesRefresh 可重算。
   */
  private async series(sheet: number, d: SheetData, range: Range, dir: 'row' | 'col', type: SeriesType, unit: SeriesUnit, step: number, stop?: number): Promise<XlsxEditResult> {
    const def: SeriesFeature = {
      id: 0, range, dir, type, unit, step, stop,
      start: this.numOf(getEntry(d, range.r0, range.c0)) ?? 0,
      date1904: this.wb.date1904,
    }
    return this.featureMutation(sheet, (f) => {
      const same = (a: Range, b: Range) => a.r0 === b.r0 && a.r1 === b.r1 && a.c0 === b.c0 && a.c1 === b.c1
      const list = (f.series ?? []).filter((s) => !same(s.range, range))
      def.id = Math.max(0, ...list.map((s) => s.id)) + 1
      f.series = [...list, def]
      return this.seriesCells(d, def)
    }, { skipRegenerate: true })
  }

  /** 按序列定义从当前源格重算写回的 CellChange[]（不 apply / 不 record，供 featureMutation 使用）。
   *  start 始终从起始格现读，故源数据改动后 seriesRefresh 能跟随；日期换算用定义里的 date1904。 */
  private seriesCells(d: SheetData, def: SeriesFeature): CellChange[] {
    materializeShared(d)
    const { range, dir, type, unit, step, stop, date1904 } = def
    const changes: CellChange[] = []
    const lines = dir === 'row' ? range.r1 - range.r0 + 1 : range.c1 - range.c0 + 1
    const len = dir === 'row' ? range.c1 - range.c0 + 1 : range.r1 - range.r0 + 1
    for (let li = 0; li < lines; li++) {
      const lr = dir === 'row' ? range.r0 + li : range.r0
      const lc = dir === 'row' ? range.c0 : range.c0 + li
      const first = getEntry(d, lr, lc)
      const start = this.numOf(first) ?? 0
      let st = step
      if (type === 'auto') {
        st = 1
        if (len >= 2) {
          const second = this.numOf(getEntry(d, dir === 'row' ? lr : lr + 1, dir === 'row' ? lc + 1 : lc))
          if (second !== null) st = second - start
        }
      }
      const srcStyle = first ? first[2] : 0
      for (let i = 1; i < len; i++) {
        const v = seriesValueAt(start, type, unit, st, i, date1904)
        if (stop !== undefined && Number.isFinite(stop) && v > stop) break
        const r = dir === 'row' ? lr : lr + i
        const c = dir === 'row' ? lc + i : lc
        const key = r * MAX_COL + c
        const cur = getEntry(d, r, c)
        const style = cur ? cur[2] : srcStyle
        // 第九批：引擎能精确复现的序列写真实相对引用公式；工作日 / ISO 日期源保留静态值。
        const f = seriesCellFormula({ type, unit, step: st, sr: lr, sc: lc, r, c, i, dir, srcIsIsoDate: first?.[0] === T_DATE })
        // 日期序列按「数值 + 起始格日期 numFmt 样式」落盘（T_DATE 在内核是 ISO 字符串语义）
        changes.push({ key, prev: cur, prevF: d.formulas.get(key), next: [T_NUM, v, style], nextF: f ?? undefined })
      }
    }
    return changes
  }

  /** 拖动选区外框搬移内容：携带公式与样式（非仅显示文本）。一次写回 + 单步撤销。 */
  private moveRange(sheet: number, d: SheetData, from: Range, dr: number, dc: number): XlsxEditResult {
    materializeShared(d)
    const changes: CellChange[] = []
    const srcCells: { key: number; tr: number; tc: number; e: ReturnType<typeof getEntry>; f: string | undefined }[] = []
    for (let r = from.r0; r <= from.r1; r++) {
      for (let c = from.c0; c <= from.c1; c++) {
        const key = r * MAX_COL + c
        const e = getEntry(d, r, c)
        const f = d.formulas.get(key)
        const tr = r + dr
        const tc = c + dc
        if (tr < 0 || tc < 0) continue
        const tk = tr * MAX_COL + tc
        const nf = f ? translateFormula(f, dr, dc) : undefined
        changes.push({ key: tk, prev: getEntry(d, tr, tc), prevF: d.formulas.get(tk), next: e ? [e[0], nf ? '=' + nf : e[1], e[2]] : null, nextF: nf })
        srcCells.push({ key, tr, tc, e, f })
      }
    }
    // 源单元格清空（读取值已在上面快照，顺序无关）
    for (const s of srcCells) {
      changes.push({ key: s.key, prev: s.e, prevF: s.f, next: null, nextF: undefined })
    }
    this.apply(d, changes, 'next')
    const range: Range = {
      r0: Math.min(from.r0, from.r0 + dr), c0: Math.min(from.c0, from.c0 + dc),
      r1: Math.max(from.r1, from.r1 + dr), c1: Math.max(from.c1, from.c1 + dc)
    }
    return this.record(sheet, changes, range)
  }

  private sort(sheet: number, d: SheetData, range: Range, col: number, desc: boolean): XlsxEditResult {
    materializeShared(d)
    const rows: { r: number; cells: (Entry | null)[]; f: (string | undefined)[]; key: unknown }[] = []
    for (let r = range.r0; r <= range.r1; r++) {
      const cells: (Entry | null)[] = []
      const f: (string | undefined)[] = []
      for (let c = range.c0; c <= range.c1; c++) {
        cells.push(getEntry(d, r, c))
        f.push(d.formulas.get(r * MAX_COL + c))
      }
      const e = getEntry(d, r, col)
      const v = e ? (e[0] === T_SST ? this.wb.sst[e[1] as number] : e[1]) : null
      rows.push({ r, cells, f, key: v === '' ? null : v })
    }
    const cmp = (a: unknown, b: unknown) => {
      if (a === null || a === undefined) return 1
      if (b === null || b === undefined) return -1
      if (typeof a === 'number' && typeof b === 'number') return a - b
      if (typeof a === 'number') return -1
      if (typeof b === 'number') return 1
      return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true })
    }
    const sorted = [...rows].sort((a, b) => {
      const k = cmp(a.key, b.key)
      return desc && a.key !== null && b.key !== null ? -k : k
    })
    const changes: CellChange[] = []
    sorted.forEach((src, i) => {
      const r = range.r0 + i
      for (let c = range.c0; c <= range.c1; c++) {
        const k = c - range.c0
        const key = r * MAX_COL + c
        const nf = src.f[k] ? translateFormula(src.f[k]!, r - src.r, 0) : undefined
        const e = src.cells[k]
        changes.push({ key, prev: getEntry(d, r, c), prevF: d.formulas.get(key), next: e ? [e[0], nf ? '=' + nf : e[1], e[2]] : null, nextF: nf })
      }
    })
    this.apply(d, changes, 'next')
    return this.record(sheet, changes, range)
  }

  // ---------------------------------------------------------------- workbook (sheet list)

  async bookOp(op: BookOp): Promise<XlsxEditResult> {
    const pkg = this.wb.pkg
    const nodes = parseRaw(await pkg.text(this.wb.mainPath))
    const root = rootEl(nodes)!
    const P = prefixOf(root.q)
    const sheetsEl = kidOf(root, 'sheets')!
    const entries = kidsOf(sheetsEl, 'sheet')
    const sheets = this.wb.sheets
    const remap = (order: number[]) => {
      // order[newIndex] = oldIndex
      const data = new Map(this.wb.sheetsData)
      this.wb.sheetsData.clear()
      order.forEach((old, i) => {
        const d = data.get(old)
        if (d) this.wb.sheetsData.set(i, d)
      })
      const next = order.map((old, i) => ({ ...sheets[old], index: i }))
      sheets.splice(0, sheets.length, ...next)
    }
    switch (op.op) {
      case 'add': {
        const path = pkg.freeName('xl/worksheets', 'sheet', 'xml')
        this.newSheets.set(path, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData/></worksheet>')
        pkg.setPart(path, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData/></worksheet>')
        await pkg.setContentType(path, 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml')
        const rid = await pkg.addRel(this.wb.mainPath, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet', path)
        const ids = entries.map((e) => Number(getAttr(e, 'sheetId') ?? 0))
        let name = op.name ?? `Sheet${sheets.length + 1}`
        while (sheets.some((s) => s.name.toLowerCase() === name.toLowerCase())) name += '_'
        const node = el(P + 'sheet', { name, sheetId: String(Math.max(0, ...ids) + 1), ...relIdAttrs(root, 'id', rid) })
        const after = op.after ?? sheets.length - 1
        const at = after + 1 >= entries.length ? sheetsEl.c.length : sheetsEl.c.indexOf(entries[after + 1])
        sheetsEl.c.splice(at, 0, node)
        sheetsEl.self = false
        const info = { name, index: after + 1, path, hidden: false }
        const order = sheets.map((_, i) => i)
        sheets.push({ ...info, index: sheets.length })
        order.splice(after + 1, 0, sheets.length - 1)
        remap(order)
        break
      }
      case 'rename': {
        const old = sheets[op.index]
        const name = op.name.trim().slice(0, 31).replace(/[\\/?*[\]:]/g, '_')
        if (!old || !name || sheets.some((s, i) => i !== op.index && s.name.toLowerCase() === name.toLowerCase())) throw new Error('Invalid sheet name')
        setAttr(entries[op.index], 'name', name)
        for (const s of await this.allSheets()) {
          for (const [k, f] of s.d.formulas) {
            const g = renameSheetInFormula(f, old.name, name)
            if (g !== f) {
              s.d.formulas.set(k, g)
              s.d.edited.add(k)
            }
          }
        }
        old.name = name
        break
      }
      case 'delete': {
        if (sheets.length <= 1) throw new Error('A workbook needs at least one sheet')
        const s = sheets[op.index]
        // its comments go with it
        for (const t of this.wb.comments.threads()) {
          const a = t.root.at
          if (!a || !('sheet' in a) || a.sheet !== s.path) continue
          for (const r of t.replies) this.wb.comments.set(r.id, null)
          this.wb.comments.set(t.root.id, null)
        }
        sheetsEl.c.splice(sheetsEl.c.indexOf(entries[op.index]), 1)
        pkg.setPart(s.path, null)
        if (pkg.has(relsPathFor(s.path))) pkg.setPart(relsPathFor(s.path), null)
        await pkg.removeRelsTo(this.wb.mainPath, s.path)
        await pkg.setContentType(s.path, null)
        remap(sheets.map((_, i) => i).filter((i) => i !== op.index))
        // localSheetId indexes in definedNames would now be off; drop the ones of the deleted sheet
        const dn = kidOf(root, 'definedNames')
        if (dn) dn.c = dn.c.filter((c) => !(isNode(c) && getAttr(c, 'localSheetId') === String(op.index)))
        break
      }
      case 'move': {
        const node = entries[op.from]
        sheetsEl.c.splice(sheetsEl.c.indexOf(node), 1)
        const rest = kidsOf(sheetsEl, 'sheet')
        sheetsEl.c.splice(op.to >= rest.length ? sheetsEl.c.length : sheetsEl.c.indexOf(rest[op.to]), 0, node)
        const order = sheets.map((_, i) => i)
        order.splice(op.from, 1)
        order.splice(op.to, 0, op.from)
        remap(order)
        break
      }
      case 'hide':
      case 'unhide': {
        const s = sheets[op.index]
        if (!s) break
        if (op.op === 'hide') {
          if (sheets.filter((x) => !x.hidden).length <= 1) throw new Error('A workbook needs at least one visible sheet')
          setSheetState(entries[op.index], 'hidden')
          s.hidden = true
        } else {
          setSheetState(entries[op.index], 'visible')
          s.hidden = false
        }
        break
      }
      case 'defineName':
      case 'deleteName':
        definedNameOp(root, P, op)
        break
      case 'protectWorkbook':
        setWorkbookProtection(root, P, op.lock)
        break
      case 'readOnlyRecommended':
        setFileSharing(root, P, op.on)
        break
    }
    pkg.setPart(this.wb.mainPath, serialize(nodes))
    this.bookChanged = true
    this.undoStack = []
    this.redoStack = []
    return { sheet: 0, range: { r0: 0, c0: 0, r1: 0, c1: 0 }, sheets: sheets.map((s) => ({ ...s })) }
  }

  /** 工作簿统计信息（审阅 › 工作簿统计信息） */
  stats(sheet: number): XlsxStats {
    return statsOf(this.wb.sheetsData.get(sheet), sheet)
  }

  /** 公式清单（公式 › 显示公式）：含共享公式还原后的每个单元格引用 */
  formulas(sheet: number, r0: number, r1: number): XlsxFormulaCell[] {
    return formulasIn(this.wb.sheetsData.get(sheet), r0, r1)
  }

  /** 定义名称（公式 › 名称管理器） */
  async names(): Promise<DefinedName[]> {
    const nodes = parseRaw(await this.wb.pkg.text(this.wb.mainPath))
    const root = rootEl(nodes)
    return root ? readDefinedNames(root) : []
  }

  private bookChanged = false
  /** XML of sheets created in this session (no original to stream from) */
  private newSheets = new Map<string, string>()

  /**
   * Adds a sheet after `after` holding the rows of a delimited text file (CSV / TSV): they stream into the sheet
   * when it is loaded, like a sheet's XML does. `name` defaults to the file's name.
   */
  async importText(after: number, imp: DelimitedImport, name?: string): Promise<XlsxEditResult> {
    const base = (name ?? imp.source.name ?? '').replace(/\.[^./\\]+$/, '').replace(/[\\/?*[\]:]/g, '_').slice(0, 31).trim() || 'Imported'
    const res = await this.bookOp({ op: 'add', name: base, after })
    this.wb.loaders.set(this.wb.sheets[after + 1].path, (d, report) => loadDelimited(d, imp, report))
    return res
  }

  // ---------------------------------------------------------------- save

  async save(): Promise<Blob> {
    // rows still to come from an import are in the model before the sheets are written
    await this.wb.loadPending()
    const pkg = this.wb.pkg
    let any = false
    for (const [index, d] of this.wb.sheetsData) {
      if (d.maxRow >= MAX_ROWS) {
        throw new Error(
          `Sheet “${this.wb.sheets[index].name}” has ${(d.maxRow + 1).toLocaleString()} rows: an Excel workbook holds at most ${MAX_ROWS.toLocaleString()}. Save the sheet as CSV instead.`,
        )
      }
      if (!needsWrite(d)) continue
      any = true
      const info = this.wb.sheets[index]
      pkg.setPart(info.path, () => this.rewrite(info.path, d))
    }
    if (any) {
      // stale cached values / calc chain: let Excel recalculate on open
      const wbNodes = parseRaw(await pkg.text(this.wb.mainPath))
      const root = rootEl(wbNodes)!
      const P = prefixOf(root.q)
      const calc = clone(kidOf(root, 'calcPr') ?? el(P + 'calcPr'))
      setAttr(calc, 'fullCalcOnLoad', '1')
      setOrdered(root, calc, 'calcPr', WB_ORDER)
      pkg.setPart(this.wb.mainPath, serialize(wbNodes))
      const chain = relOfType(this.wb.rels, 'calcChain')
      if (chain && this.formulaTouched && pkg.has(chain.target)) {
        pkg.setPart(chain.target, null)
        await pkg.removeRelsTo(this.wb.mainPath, chain.target)
        await pkg.setContentType(chain.target, null)
      }
    }
    // after the sheets: a sheet given comments here links its drawing of them
    if (this.wb.comments.dirty) await writeXlsxComments(pkg, this.wb.mainPath, this.wb.comments, this.wb.sheets)
    return pkg.save(XLSX_MIME)
  }

  /** Streams the original sheet XML, patching only rows that contain edits. */
  private rewrite(path: string, d: SheetData): ReadableStream<Uint8Array> {
    const pkg = this.wb.pkg
    const wb = this.wb
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    // shared formula groups whose master was overwritten → dependents get explicit formulas
    const fix = new Map<number, string>()
    const broken = new Set<number>()
    for (const [si, g] of d.shared) if (d.edited.has(g.master)) broken.add(si)
    if (broken.size) {
      for (const [key, si] of d.depOf) {
        if (!broken.has(si) || d.edited.has(key)) continue
        const g = d.shared.get(si)!
        const dr = Math.floor(key / MAX_COL) - Math.floor(g.master / MAX_COL)
        const dc = (key % MAX_COL) - (g.master % MAX_COL)
        fix.set(key, translateFormula(g.text, dr, dc))
      }
    }
    const rowCols = new Map<number, Set<number>>()
    for (const r of d.dirtyRows) if (!rowCols.has(r)) rowCols.set(r, new Set())
    for (const key of [...d.edited, ...fix.keys()]) {
      const r = Math.floor(key / MAX_COL)
      let s = rowCols.get(r)
      if (!s) rowCols.set(r, (s = new Set()))
      s.add(key % MAX_COL)
    }
    const rows = [...rowCols.keys()].sort((a, b) => a - b)
    const enc = new TextEncoder()
    return new ReadableStream<Uint8Array>({
      async start(ctrl) {
        const rw = new RowPatcher(rows, rowCols, d, fix, wb)
        const base = self.newSheets.get(path)
        const reader = (base !== undefined ? new Blob([base]).stream() : await pkg.zip.stream(path)).getReader()
        const dec = new TextDecoder()
        for (;;) {
          const { done, value } = await reader.read()
          const text = done ? dec.decode() : dec.decode(value, { stream: true })
          for (const part of await rw.push(text, done)) if (part) ctrl.enqueue(enc.encode(part))
          if (done) break
        }
        ctrl.close()
      },
    })
  }
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
