import type { DocKind } from '../opc'
import type { DocComment } from '../comments'
import type { PlainFormat } from '../plain'
import type { LegacyFormat } from '../legacy'
import type { XOp } from '../../collab/xlsx-ops'
import type { POp } from '../../collab/pptx-ops'
import type { PptxCollabResult } from '../../collab/pptx-worker'
import type { CanonStyle, DocxMeta, Block, EditOp, EditResult, HFSet, HFSetResult, PageSet, PageSetResult, ParaSpec, StyleInfo, StyleLook, StyleSetResult, TableOp } from '../docx/types'
import type { BlockOut, BookOp, CellDetail, CellInput, DefinedName, FindMatch, FindOptions, FmtPatch, Range, SheetOp, SheetProgress, WorkbookMeta, XlsxDrawingOp, XlsxDrawingsResult, XlsxEditResult, XlsxFormulaCell, XlsxImageOp, XlsxImageResult, XlsxStats } from '../xlsx/types'
import type { ChartAddOp, CondFmtRule, FeaturesResult, PivotAddOp, SeriesListResult, SlicerAddOp, ValidationRule } from '../xlsx/types'
import type { PParaSpec, PresentationMeta, ShapeOp, SlideModel, SlideOp } from '../pptx/types'

export interface OpenParams {
  name?: string
  headers?: Record<string, string>
  credentials?: RequestCredentials
  /**
   * CSV / TSV: cells kept in memory at a time (default 12 million, about 300 MB); the rows past them are read from
   * the file as they are shown, edited, searched or saved
   */
  residentCells?: number
  /** CSV / TSV: rows read from the file at a time past `residentCells` (default 1024) */
  pageRows?: number
}

export interface OpenResult {
  kind: DocKind
  name?: string
  size: number
  /** the file was converted from another format (shown read-only): Apple Pages (as docx), Keynote (as pptx), Numbers (as xlsx) */
  from?: 'pages' | 'keynote' | 'numbers'
  /** built from a plain file, editable: CSV / TSV (as xlsx), text / Markdown / HTML (as docx); saving writes the Office format */
  imported?: PlainFormat
  /**
   * converted from another format, editable: Word / Excel / PowerPoint 97-2003 (doc, xls, ppt), RTF, OpenDocument
   * (odt, ods, odp); saving writes the Office Open XML file (docx, xlsx, pptx)
   */
  converted?: LegacyFormat
  xlsx?: WorkbookMeta
  pptx?: PresentationMeta
}

export interface Methods {
  open(src: Blob | ArrayBuffer | string, params: OpenParams): OpenResult
  part(path: string): Blob
  /** the text of a plain file opened as a document (Markdown, HTML, diagrams), null otherwise */
  'plain.source'(): string | null
  'docx.start'(): void
  'docx.edit'(op: EditOp): EditResult
  'docx.table'(op: TableOp): void
  'docx.image'(bytes: ArrayBuffer, ext: string): { rid: string; path: string }
  'docx.link'(url: string): string
  /** id of a built-in paragraph style, created in styles.xml when missing */
  'docx.style'(kind: CanonStyle): { id: string; styles: StyleInfo[] }
  /** gives paragraph style `id` a look ("update style to match"); only the document's own styles part is written */
  'docx.styleSet'(id: string, look: StyleLook): StyleSetResult
  /** changes the page setup of every section (size, orientation, margins, columns) */
  'docx.page'(set: PageSet): PageSetResult
  /** changes the headers / footers (text, page numbers, different first page) */
  'docx.hf'(set: HFSet): HFSetResult
  /** the blocks each paragraph converts to with the styles as they are now; `bare`: as it looks outside its table */
  'docx.convert'(specs: ParaSpec[], bare?: boolean): Block[][]
  /** the document's comments (threads: roots and their replies) */
  'comments.list'(): DocComment[]
  /** sets comment `id` (null deletes it; a root's replies are left out of the file with it); returns what it was */
  'comments.set'(id: string, c: DocComment | null): DocComment | null
  /** builds the edited file */
  save(): Blob
  dirty(): boolean
  'xlsx.load'(sheet: number): void
  'xlsx.block'(sheet: number, r0: number, r1: number): BlockOut
  'xlsx.cell'(sheet: number, r: number, c: number): CellDetail | undefined
  /** cells whose shown value (or formula) contains the text */
  'xlsx.find'(sheet: number, query: string, opts?: FindOptions): FindMatch[]
  /** the sheet as delimited text (the values as shown): `sep` a comma (with a byte order mark) or a tab */
  'xlsx.text'(sheet: number, sep: string): Blob
  /** replaces text in matching cells (or only `at`); null when nothing changed */
  'xlsx.replace'(sheet: number, query: string, by: string, opts?: FindOptions, at?: { r: number; c: number }): XlsxEditResult | null
  'xlsx.set'(sheet: number, cells: CellInput[]): XlsxEditResult
  'xlsx.format'(sheet: number, range: Range, patch: FmtPatch): XlsxEditResult
  'xlsx.sheetOp'(sheet: number, op: SheetOp): XlsxEditResult
  'xlsx.bookOp'(op: BookOp): XlsxEditResult
  /** inserts an image anchored to a cell as a floating drawing; returns the image relationship id */
  'xlsx.image'(sheet: number, op: XlsxImageOp): XlsxImageResult
  'xlsx.drawings'(sheet: number): XlsxDrawingsResult
  /** moves / resizes / deletes one floating picture by its `xlsx.drawings` index (undoable, saved into the file) */
  'xlsx.drawingOp'(sheet: number, op: XlsxDrawingOp): XlsxEditResult
  /**
   * a new sheet after `after` holding the rows of a delimited text file (CSV / TSV), streamed in when the sheet is
   * loaded; `sep` is detected from the first line when missing, `name` defaults to the file's
   */
  'xlsx.import'(after: number, src: Blob | ArrayBuffer | string, params?: { name?: string; sep?: string; residentCells?: number; pageRows?: number }): XlsxEditResult
  'xlsx.undo'(): XlsxEditResult | null
  'xlsx.redo'(): XlsxEditResult | null
  /** native OOXML features (chart / conditional formatting / validation / slicer / pivot) */
  'xlsx.features'(sheet: number): FeaturesResult
  'xlsx.chartAdd'(sheet: number, op: ChartAddOp): XlsxEditResult
  'xlsx.chartRefresh'(sheet: number, id: number): XlsxEditResult
  'xlsx.condFmtSet'(sheet: number, rules: CondFmtRule[]): XlsxEditResult
  'xlsx.validationSet'(sheet: number, rules: ValidationRule[]): XlsxEditResult
  'xlsx.slicerAdd'(sheet: number, op: SlicerAddOp): XlsxEditResult
  'xlsx.slicerSelect'(sheet: number, id: number, selected: string[]): XlsxEditResult
  'xlsx.pivotAdd'(sheet: number, op: PivotAddOp): XlsxEditResult
  'xlsx.pivotRefresh'(sheet: number, id: number): XlsxEditResult
  /** 可刷新序列对象：按源数据/定义重算写回 / 读回定义列表 */
  'xlsx.seriesRefresh'(sheet: number, id: number): XlsxEditResult
  'xlsx.seriesList'(sheet: number): SeriesListResult
  /** 工作簿统计信息：已用行列数、非空单元格数、公式单元格数 */
  'xlsx.stats'(sheet: number): XlsxStats
  /** 公式清单（显示公式）：每行区间的公式单元格 */
  'xlsx.formulas'(sheet: number, r0: number, r1: number): XlsxFormulaCell[]
  /** 定义名称（名称管理器） */
  'xlsx.names'(): DefinedName[]
  'pptx.slide'(index: number): SlideModel
  'pptx.setText'(index: number, sid: number, paras: PParaSpec[]): SlideModel
  'pptx.shapes'(index: number, ops: ShapeOp[]): SlideModel
  'pptx.slides'(op: SlideOp): PresentationMeta
  'pptx.image'(index: number, bytes: ArrayBuffer, ext: string): string
  /** writes the speaker notes of a slide (creates the notesSlide part when missing) */
  'pptx.notes'(index: number, text: string): SlideModel
  /** undo (or redo) the last shape edit */
  'pptx.undo'(redo?: boolean): { index: number; model: SlideModel } | null
  /** collaboration (src/collab): a shared XLSX operation, outside the undo history; `rec` reverts it */
  'collab.xlsx.apply'(op: XOp): { res: XlsxEditResult | null; rec: number | null }
  'collab.xlsx.revert'(rec: number): XlsxEditResult | null
  /** collaboration: a shared PPTX operation (recorded as slide snapshots) */
  'collab.pptx.apply'(op: POp): { res: PptxCollabResult; rec: number | null }
  'collab.pptx.revert'(rec: number): PptxCollabResult
}

export interface Events {
  progress: { phase: string; loaded: number; total: number }
  'docx:blocks': Block[]
  'docx:meta': DocxMeta
  'docx:done': { error?: string }
  'xlsx:progress': SheetProgress
  /** collaboration: remote (or rebased) XLSX changes applied on this client */
  'collab:xlsx': XlsxEditResult
  /** collaboration: a slide (or the slide list) changed remotely */
  'collab:pptx': PptxCollabResult
  /** a comment was set or deleted (by this client or a collaborator) */
  comment: { id: string; c: DocComment | null }
}

export type Req = { id: number; method: keyof Methods; args: unknown[] }
export type Res = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string }
export type Evt = { event: keyof Events; data: unknown }
