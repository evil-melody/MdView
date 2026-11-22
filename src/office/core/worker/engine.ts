import { DocxDocument } from '../docx/parser'
import { addImage, addLink, applyEdit, applyTable, convertParas, ensureStyle, saveDocx, setHeaderFooter, setPage, setStyleLook } from '../docx/writer'
import type { CanonStyle, EditOp, HFSet, PageSet, ParaSpec, StyleLook, TableOp } from '../docx/types'
import { OpcPackage, type DocKind } from '../opc'
import { PptxPresentation } from '../pptx/parser'
import { BlobSource, openSource, type DocSource } from '../source'
import { decodeText, extOf, HAS_SOURCE, mayBePlain, plainFormat, plainToOffice, ungzipped } from '../plain'
import { XlsxWorkbook } from '../xlsx/workbook'
import { XlsxEditor } from '../xlsx/editor'
import { loadDelimited } from '../xlsx/import'
import type { BookOp, CellInput, FindOptions, FmtPatch, Range, SheetOp, XlsxDrawingOp, XlsxImageOp, XlsxImageResult, ChartAddOp, CondFmtRule, ValidationRule, SlicerAddOp, PivotAddOp } from '../xlsx/types'
import type { PParaSpec, ShapeOp, SlideOp } from '../pptx/types'
import { addSlideImage, shapeOps, slideOp, undoShapes } from '../pptx/edit'
import { setNotes } from '../pptx/notes'
import { ZipArchive } from '../zip'
import { isIworkZip, isLegacyIwork, openIwork } from '../iwork'
import { convertBiff, convertCfb, convertFlatOdf, convertOdfZip, convertRtf, LEGACY_EXT, legacyFormatOf, type Converted } from '../legacy'
import { XlsxCollabWorker } from '../../collab/xlsx-worker'
import type { XOp } from '../../collab/xlsx-ops'
import { PptxCollabWorker } from '../../collab/pptx-worker'
import type { POp } from '../../collab/pptx-ops'
import type { Events, Methods, OpenParams, OpenResult } from './protocol'
import { checkedComment, type CommentStore } from '../comments'
import { toCsv } from '../convert'

const WRITES = new Set<string>([
  'comments.set',
  // `docx.convert` only reads, but what it reads (styles, lists) is what the writes before it set
  'docx.edit', 'docx.table', 'docx.image', 'docx.link', 'docx.style', 'docx.styleSet', 'docx.page', 'docx.hf', 'docx.convert', 'save',
  'xlsx.set', 'xlsx.format', 'xlsx.sheetOp', 'xlsx.bookOp', 'xlsx.import', 'xlsx.replace', 'xlsx.undo', 'xlsx.redo', 'xlsx.image', 'xlsx.drawingOp',
  'xlsx.chartAdd', 'xlsx.chartRefresh', 'xlsx.condFmtSet', 'xlsx.validationSet', 'xlsx.slicerAdd', 'xlsx.slicerSelect', 'xlsx.pivotAdd', 'xlsx.pivotRefresh', 'xlsx.seriesRefresh',
  'collab.xlsx.apply', 'collab.xlsx.revert',
  'pptx.setText', 'pptx.shapes', 'pptx.slides', 'pptx.image', 'pptx.notes', 'pptx.undo', 'collab.pptx.apply', 'collab.pptx.revert',
])

type Emit = <K extends keyof Events>(event: K, data: Events[K]) => void

/** Format-agnostic engine; runs inside the worker (or directly, e.g. in tests). */
export class Engine {
  private pkg?: OpcPackage
  private kind?: DocKind
  private docx?: DocxDocument
  private xlsx?: XlsxWorkbook
  /** 原始导入格式（csv/tsv 等）；保存时据此写回原格式而非 xlsx */
  private imported: string | null = null
  private xlsxEd?: XlsxEditor
  private pptx?: PptxPresentation
  private abort = new AbortController()
  private plainText: string | null = null

  constructor(private emit: Emit) {}

  async open(src: DocSource, params: OpenParams = {}): Promise<OpenResult> {
    let source = await openSource(src, {
      ...params,
      signal: this.abort.signal,
      onProgress: (loaded, total) => this.emit('progress', { phase: 'download', loaded, total }),
    })
    const name = params.name ?? source.name
    const size = source.size
    // the first bytes say the format, unless the name says an Office Open XML or iWork package
    const head = mayBePlain(name) || LEGACY_EXT[extOf(name)] ? await source.read(0, Math.min(source.size, 4096)) : null
    // Word / Excel / PowerPoint 97-2003, RTF, flat OpenDocument: converted to the Office Open XML file they open as (editable)
    const legacy = head && legacyFormatOf(head)
    let converted: Converted | null = null
    if (legacy) {
      const bytes = await source.read(0, source.size)
      converted = legacy === 'cfb' ? await convertCfb(bytes) : legacy === 'rtf' ? await convertRtf(bytes) : legacy === 'biff' ? await convertBiff(bytes) : await convertFlatOdf(bytes)
    }
    // CSV / TSV / text / Markdown / HTML / SVG / diagrams: converted to a workbook / document
    const imported = head && !converted ? plainFormat(name, source.type, head, source.size <= 4096) : null
    // gzip-compressed (.svgz, .csv.gz): unpacked whole, then read like the file inside
    if (imported) source = await ungzipped(source)
    // CSV / TSV: an empty workbook whose sheet streams the rows in when it is loaded (the text is never read whole)
    const tabular = imported === 'csv' || imported === 'tsv'
    const text = imported && !tabular ? decodeText(await source.read(0, source.size), source.type) : null
    // kept for the source view: formats whose text is worth reading next to the document
    this.plainText = imported && HAS_SOURCE.has(imported) ? text : null
    let zip = converted
      ? await ZipArchive.open(new BlobSource(converted.file))
      : imported
        ? await ZipArchive.open(new BlobSource(await plainToOffice(text ?? '', imported, name)))
        : await ZipArchive.open(source)
    // OpenDocument text / spreadsheet / presentation packages
    if (!converted && !imported) {
      converted = await convertOdfZip(zip)
      if (converted) zip = await ZipArchive.open(new BlobSource(converted.file))
    }
    let from: OpenResult['from']
    // Apple Pages / Keynote / Numbers: converted to a Word document / PowerPoint presentation / Excel workbook, shown read-only
    if (isIworkZip(zip)) ({ zip, from } = await openIwork(zip))
    else if (isLegacyIwork(zip)) throw new Error('iWork ’09 (and older) Pages, Keynote and Numbers files are not supported')
    const pkg = (this.pkg = new OpcPackage(zip))
    const main = await pkg.mainPart()
    this.kind = main.kind
    this.imported = imported
    const res: OpenResult = { kind: main.kind, name, size, ...(from ? { from } : {}), ...(imported ? { imported } : {}), ...(converted ? { converted: converted.format } : {}) }
    if (main.kind === 'docx') this.docx = await DocxDocument.open(pkg, main.path)
    else if (main.kind === 'xlsx') {
      const wb = (this.xlsx = await XlsxWorkbook.open(pkg, main.path))
      if (tabular) {
        const imp = { source, sep: imported === 'tsv' ? '\t' : undefined, budget: params.residentCells, pageRows: params.pageRows }
        wb.loaders.set(wb.sheets[0].path, (d, report) => loadDelimited(d, imp, report))
      }
      res.xlsx = wb.meta()
    }
    else res.pptx = (this.pptx = await PptxPresentation.open(pkg, main.path)).meta
    // comment changes (also those made by edits, like rows deleted) reach the views
    this.comments()
    return res
  }

  private writes: Promise<unknown> = Promise.resolve()

  call<M extends keyof Methods>(method: M, args: unknown[]): Promise<unknown> {
    // document writes run one at a time, in call order: they await internally (list / style
    // parts, sheet loading) and a later edit reads state (paragraph locations…) the previous one sets
    if (!WRITES.has(method)) return this.dispatch(method, args)
    const run = this.writes.then(() => this.dispatch(method, args))
    this.writes = run.catch(() => {})
    return run
  }

  private async dispatch<M extends keyof Methods>(method: M, args: unknown[]): Promise<unknown> {
    switch (method) {
      case 'open':
        return this.open(args[0] as DocSource, args[1] as OpenParams)
      case 'part':
        return this.need(this.pkg).blob(args[0] as string)
      case 'plain.source':
        return this.plainText
      case 'docx.start': {
        const doc = this.need(this.docx)
        try {
          await doc.stream({
            signal: this.abort.signal,
            onBlocks: (b) => this.emit('docx:blocks', b),
            onMeta: (m) => this.emit('docx:meta', m),
            onProgress: (loaded, total) => this.emit('progress', { phase: 'parse', loaded, total }),
          })
          this.emit('docx:done', {})
        } catch (e) {
          this.emit('docx:done', { error: (e as Error).message })
        }
        return
      }
      case 'docx.edit':
        return applyEdit(this.need(this.docx), args[0] as EditOp)
      case 'docx.table':
        return applyTable(this.need(this.docx), args[0] as TableOp)
      case 'docx.image':
        return addImage(this.need(this.docx), new Uint8Array(args[0] as ArrayBuffer), args[1] as string)
      case 'docx.link':
        return addLink(this.need(this.docx), args[0] as string)
      case 'docx.style':
        return ensureStyle(this.need(this.docx), args[0] as CanonStyle)
      case 'docx.styleSet':
        return setStyleLook(this.need(this.docx), args[0] as string, args[1] as StyleLook)
      case 'docx.page':
        return setPage(this.need(this.docx), args[0] as PageSet)
      case 'docx.hf':
        return setHeaderFooter(this.need(this.docx), args[0] as HFSet)
      case 'docx.convert':
        return convertParas(this.need(this.docx), args[0] as ParaSpec[], args[1] as boolean | undefined)
      case 'comments.list':
        return this.comments().list()
      case 'comments.set': {
        const id = args[0] as string
        const c = args[1] === null ? null : checkedComment(args[1])
        if (args[1] !== null && (!c || c.id !== id)) throw new Error('Invalid comment')
        return this.comments().set(id, c)
      }
      case 'save':
        return this.save()
      case 'dirty':
        return this.docx ? this.docx.dirty : this.xlsxEd ? this.xlsxEd.dirty : this.pptx ? this.pptx.dirty : this.need(this.pkg).dirty
      case 'xlsx.load': {
        const wb = this.need(this.xlsx)
        void wb.loadSheet(
          args[0] as number,
          (p) => this.emit('xlsx:progress', p),
          (phase, loaded, total) => this.emit('progress', { phase, loaded, total }),
        )
        return
      }
      case 'xlsx.set':
        return this.xed().setCells(args[0] as number, args[1] as CellInput[])
      case 'xlsx.format':
        return this.xed().format(args[0] as number, args[1] as Range, args[2] as FmtPatch)
      case 'xlsx.sheetOp':
        return this.xed().sheetOp(args[0] as number, args[1] as SheetOp)
      case 'xlsx.replace':
        return this.xed().replace(args[0] as number, args[1] as string, args[2] as string, args[3] as FindOptions, args[4] as { r: number; c: number } | undefined)
      case 'xlsx.bookOp':
        return this.xed().bookOp(args[0] as BookOp)
      case 'xlsx.image':
        return this.xed().image(args[0] as number, args[1] as XlsxImageOp)
      case 'xlsx.drawings':
        return this.xed().drawings(args[0] as number)
      case 'xlsx.drawingOp':
        return this.xed().drawingOp(args[0] as number, args[1] as XlsxDrawingOp)
      case 'xlsx.import': {
        const p = (args[2] ?? {}) as { name?: string; sep?: string; residentCells?: number; pageRows?: number }
        const source = await ungzipped(await openSource(args[1] as DocSource, { signal: this.abort.signal }))
        return this.xed().importText(args[0] as number, { source, sep: p.sep, budget: p.residentCells, pageRows: p.pageRows }, p.name)
      }
      case 'xlsx.undo':
        return this.xed().undo()
      case 'xlsx.redo':
        return this.xed().redo()
      case 'xlsx.features':
        return this.xed().features(args[0] as number)
      case 'xlsx.chartAdd':
        return this.xed().chartAdd(args[0] as number, args[1] as ChartAddOp)
      case 'xlsx.chartRefresh':
        return this.xed().chartRefresh(args[0] as number, args[1] as number)
      case 'xlsx.condFmtSet':
        return this.xed().condFmtSet(args[0] as number, args[1] as CondFmtRule[])
      case 'xlsx.validationSet':
        return this.xed().validationSet(args[0] as number, args[1] as ValidationRule[])
      case 'xlsx.slicerAdd':
        return this.xed().slicerAdd(args[0] as number, args[1] as SlicerAddOp)
      case 'xlsx.slicerSelect':
        return this.xed().slicerSelect(args[0] as number, args[1] as number, args[2] as string[])
      case 'xlsx.pivotAdd':
        return this.xed().pivotAdd(args[0] as number, args[1] as PivotAddOp)
      case 'xlsx.pivotRefresh':
        return this.xed().pivotRefresh(args[0] as number, args[1] as number)
      case 'xlsx.seriesRefresh':
        return this.xed().seriesRefresh(args[0] as number, args[1] as number)
      case 'xlsx.seriesList':
        return this.xed().seriesList(args[0] as number)
      case 'collab.xlsx.apply':
        return this.xc().apply(args[0] as XOp)
      case 'collab.xlsx.revert':
        return this.xc().revert(args[0] as number)
      case 'collab.pptx.apply':
        return (this.pcollab ??= new PptxCollabWorker(this.need(this.pptx))).apply(args[0] as POp)
      case 'collab.pptx.revert':
        return (this.pcollab ??= new PptxCollabWorker(this.need(this.pptx))).revert(args[0] as number)
      case 'xlsx.block':
        return this.need(this.xlsx).block(args[0] as number, args[1] as number, args[2] as number)
      case 'xlsx.cell':
        return this.need(this.xlsx).cell(args[0] as number, args[1] as number, args[2] as number)
      case 'xlsx.stats':
        return this.xed().stats(args[0] as number)
      case 'xlsx.formulas':
        return this.xed().formulas(args[0] as number, args[1] as number, args[2] as number)
      case 'xlsx.names':
        return this.xed().names()
      case 'xlsx.find':
        return this.need(this.xlsx).find(args[0] as number, args[1] as string, args[2] as FindOptions)
      case 'xlsx.text':
        return this.need(this.xlsx).text(args[0] as number, args[1] as string)
      case 'pptx.setText':
        return this.need(this.pptx).setText(args[0] as number, args[1] as number, args[2] as PParaSpec[])
      case 'pptx.shapes':
        return shapeOps(this.need(this.pptx), args[0] as number, args[1] as ShapeOp[])
      case 'pptx.slides':
        return slideOp(this.need(this.pptx), args[0] as SlideOp)
      case 'pptx.image':
        return addSlideImage(this.need(this.pptx), args[0] as number, new Uint8Array(args[1] as ArrayBuffer), args[2] as string)
      case 'pptx.notes':
        return setNotes(this.need(this.pptx), args[0] as number, args[1] as string)
      case 'pptx.slide':
        return this.need(this.pptx).slide(args[0] as number)
      case 'pptx.undo':
        return undoShapes(this.need(this.pptx), !!args[0])
    }
    throw new Error(`Unknown method ${String(method)}`)
  }

  /** the comments of the open document */
  private comments(): CommentStore {
    const store = this.docx?.comments ?? this.xlsx?.comments ?? this.pptx?.comments
    if (!store) throw new Error('Document not opened')
    store.onChange ??= (id, c) => this.emit('comment', { id, c })
    return store
  }

  private xcollab?: XlsxCollabWorker
  private pcollab?: PptxCollabWorker
  private xc(): XlsxCollabWorker {
    return (this.xcollab ??= new XlsxCollabWorker(this.xed(), this.need(this.xlsx), (p) => this.emit('xlsx:progress', p)))
  }

  private xed(): XlsxEditor {
    return (this.xlsxEd ??= new XlsxEditor(this.need(this.xlsx)))
  }

  private async save(): Promise<Blob> {
    if (this.docx) return saveDocx(this.docx)
    if (this.xlsx) {
      // CSV / TSV 以工作簿打开，保存时写回原分隔符文本，避免变成 xlsx
      if (this.imported === 'csv' || this.imported === 'tsv') {
        // block 的 r1 会被截到实际行数，用最大安全整数一次取全表；列数从行内最大列推导
        const block = await this.xlsx.block(0, 0, Number.MAX_SAFE_INTEGER)
        let maxC = 0
        for (const row of block.rows) for (const cell of row.cells) maxC = Math.max(maxC, cell[0] as number)
        const grid: string[][] = []
        for (const row of block.rows) {
          const arr = new Array(Math.max(maxC + 1, 1)).fill('')
          for (const cell of row.cells) {
            const c = cell[0] as number
            const text = (cell[1] ?? '') as string
            if (c >= 0 && c < arr.length) arr[c] = text
          }
          grid.push(arr)
        }
        const sep = this.imported === 'tsv' ? '\t' : ','
        const mime = this.imported === 'tsv' ? 'text/tab-separated-values' : 'text/csv'
        return new Blob([toCsv(grid, sep)], { type: mime })
      }
      return this.xed().save()
    }
    if (this.pptx) return this.pptx.save()
    throw new Error('Saving is not supported for this document yet')
  }

  dispose() {
    this.abort.abort()
  }

  private need<T>(v: T | undefined): T {
    if (!v) throw new Error(this.kind ? `Operation not available for ${this.kind}` : 'Document not opened')
    return v
  }
}
