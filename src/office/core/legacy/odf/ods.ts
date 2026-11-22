/**
 * OpenDocument spreadsheets (.ods, also templates and flat XML) → XLSX. Every table:table becomes a worksheet:
 * values keep their type (dates and times as Excel serials, with the null date of the file), formulas are
 * translated from OpenFormula with their cached values, cells keep their look (fonts, fills, borders, alignment,
 * number formats), and the sheet its column widths, row heights, hidden and grouped rows / columns, merged
 * cells, hyperlinks, comments, frozen panes, tab color, gridlines, page setup and headers / footers. Named ranges,
 * print ranges and autofilters become defined names.
 *
 * LibreOffice ends tables with empty rows repeated about a million times and rows with cells repeated to the
 * last column: those are never expanded. Empty rows below the content are dropped (unless formatted, and few),
 * and a row's last run of empty formatted cells is cut at the sheet's used width (its look kept as the row's).
 */
import { escAttr, escText } from '../../raw'
import { writeZip, type PartData } from '../../zipwrite'
import { parseFormula } from '../../xlsx/formula'
import { colName } from '../../xlsx/workbook'
import { Part } from '../../iwork/ooxml'
import { child, children, descendants, textContent, toHex, toPt, type OdfPackage, type ONode } from './common'
import { fallbackFormat } from './ods-format'
import { excelFormula, excelRef, quoteSheet, rangeList, rangeOnSheet } from './ods-formula'
import { pageSetup, viewSettings, vmlNotes } from './ods-page'
import { CellFormats } from './ods-styles'
import { definedName, duration, excelError, hasContent, linkOf, paragraphs, rep, serial, sheetName } from './ods-values'

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const SML = 'application/vnd.openxmlformats-officedocument.spreadsheetml'
const MAX_ROWS = 1_048_576
const MAX_COLS = 16_384
/** cells written in all: a guard against a small file repeating cells millions of times */
const MAX_CELLS = 3_000_000
/** empty but formatted rows kept below the last row with content */
const TRAIL_ROWS = 1000
/** a row's last run of empty cells longer than this pads it to the end */
const PAD = 16
/** LibreOffice's default row height and column width (pt) */
const ROW_H = 12.8
const COL_W = 64

const num = (n: number) => String(Number.isInteger(n) ? n : +n.toPrecision(15))
const pt2 = (n: number) => +n.toFixed(2)

interface Run {
  node: ONode
  start: number
  count: number
  content: boolean
  /** the cell's own style, or its row's default */
  style?: string
}

interface RowRec {
  node: ONode
  start: number
  count: number
  level: number
  runs: Run[]
  content: boolean
}

interface ColRun {
  start: number
  end: number
  width?: number
  hidden: boolean
  style?: string
  level: number
  pageBreak: boolean
}

interface Note {
  author: string
  text: string
  shown: boolean
}

/** a cell's value, written the same in each repeat */
interface Val {
  t?: string
  v?: string
  f?: string
  /** an array formula's columns and rows */
  arr?: [number, number]
  fallback?: string
  link?: string
  note?: Note
  span?: [number, number]
  /** text of several lines */
  lines?: boolean
  /** the formula and value escaped for XML */
  fx?: string
  vx?: string
}

interface Cell {
  c: number
  s: number
  val: Val
  /** a merged range from here: columns, rows */
  merge?: [number, number]
}

const EMPTY: Val = {}

interface SheetOut {
  name: string
  odfName: string
  hidden: boolean
  /** the worksheet: its XML up to the rows, the rows (in Blobs: they can be large), and the rest */
  head: string
  rows: Blob[]
  /** with placeholders for the hyperlinks and the comments' drawing */
  tail: string
  links: { ref: string; target: string }[]
  notes: { r: number; c: number; note: Note }[]
}

class OdsConverter {
  private fmts: CellFormats
  private strings = new Map<string, number>()
  /** ODF sheet name → Excel sheet name */
  private names = new Map<string, string>()
  private lowerNames = new Map<string, string>()
  private date1904 = false
  private dateBase = Date.UTC(1899, 11, 30)
  private cells = 0
  private truncated = false
  private view: ReturnType<typeof viewSettings>
  private defined: string[] = []
  private sheetOf = (s: string) => this.names.get(s) ?? this.lowerNames.get(s.toLowerCase()) ?? s

  constructor(
    private pkg: OdfPackage,
    private body: ONode,
  ) {
    this.fmts = new CellFormats(pkg.styles)
    this.view = viewSettings(pkg.settings)
    const nd = child(child(body, 'table:calculation-settings'), 'table:null-date')?.attrs['table:date-value']
    if (nd && nd.startsWith('1904-01-01')) {
      this.date1904 = true
      this.dateBase = Date.UTC(1904, 0, 1)
    }
  }

  private sst(text: string): number {
    let id = this.strings.get(text)
    if (id === undefined) {
      id = this.strings.size
      this.strings.set(text, id)
    }
    return id
  }

  // ------------------------------------------------------------------ columns and rows

  private colStyles = new Map<string, { width?: number; pageBreak: boolean }>()

  private columns(table: ONode): ColRun[] {
    const out: ColRun[] = []
    let c = 0
    const walk = (n: ONode, level: number, depth: number) => {
      if (depth > 32) return
      for (const k of children(n)) {
        if (c >= MAX_COLS) return
        if (k.name === 'table:table-column') {
          const count = Math.min(rep(k.attrs['table:number-columns-repeated']), MAX_COLS - c)
          const sn = k.attrs['table:style-name'] ?? ''
          let st = this.colStyles.get(sn)
          if (!st) {
            const p = this.pkg.styles.props('table-column', sn || undefined)['style:table-column-properties'] ?? {}
            st = { width: toPt(p['style:column-width']), pageBreak: p['fo:break-before'] === 'page' }
            this.colStyles.set(sn, st)
          }
          const vis = k.attrs['table:visibility']
          out.push({ start: c, end: c + count, width: st.width, hidden: !!vis && vis !== 'visible', style: k.attrs['table:default-cell-style-name'], level, pageBreak: st.pageBreak })
          c += count
        } else if (k.name === 'table:table-column-group') walk(k, level + 1, depth + 1)
        else if (k.name === 'table:table-header-columns' || k.name === 'table:table-columns') walk(k, level, depth + 1)
      }
    }
    walk(table, 0, 0)
    return out
  }

  private rows(table: ONode): { recs: RowRec[]; header?: [number, number] } {
    const recs: RowRec[] = []
    let r = 0
    let header: [number, number] | undefined
    const walk = (n: ONode, level: number, depth: number) => {
      if (depth > 32) return
      for (const k of n.kids) {
        if (typeof k === 'string') continue
        if (r >= MAX_ROWS) return
        if (k.name === 'table:table-row') {
          const count = Math.min(rep(k.attrs['table:number-rows-repeated']), MAX_ROWS - r)
          const runs = this.runs(k)
          recs.push({ node: k, start: r, count, level, runs, content: runs.some((x) => x.content) })
          r += count
        } else if (k.name === 'table:table-row-group') walk(k, level + 1, depth + 1)
        else if (k.name === 'table:table-header-rows') {
          const from = r
          walk(k, level, depth + 1)
          if (r > from) header = [from, r - 1]
        } else if (k.name === 'table:table-rows') walk(k, level, depth + 1)
      }
    }
    walk(table, 0, 0)
    return { recs, header }
  }

  private runs(row: ONode): Run[] {
    const out: Run[] = []
    let c = 0
    const rowDefault = row.attrs['table:default-cell-style-name']
    for (const k of row.kids) {
      if (typeof k === 'string') continue
      const covered = k.name === 'table:covered-table-cell'
      if (!covered && k.name !== 'table:table-cell') continue
      if (c >= MAX_COLS) break
      const count = Math.min(rep(k.attrs['table:number-columns-repeated']), MAX_COLS - c)
      out.push({ node: k, start: c, count, content: !covered && hasContent(k), style: k.attrs['table:style-name'] ?? rowDefault })
      c += count
    }
    return out
  }

  private rowStyles = new Map<string, { ht?: number; optimal: boolean; pageBreak: boolean }>()

  private rowStyle(name: string | undefined) {
    const key = name ?? ''
    let s = this.rowStyles.get(key)
    if (!s) {
      const p = this.pkg.styles.props('table-row', name)['style:table-row-properties'] ?? {}
      const ht = toPt(p['style:row-height'] ?? p['style:min-row-height'])
      s = { ht: ht && ht > 0 ? Math.min(ht, 409) : undefined, optimal: p['style:use-optimal-row-height'] === 'true' || !p['style:row-height'], pageBreak: p['fo:break-before'] === 'page' }
      this.rowStyles.set(key, s)
    }
    return s
  }

  // ------------------------------------------------------------------ cells

  /** a formula in Excel syntax, or undefined when it has none Excel would read (the cell keeps its value) */
  private formula(src: string): string | undefined {
    const f = excelFormula(src, this.sheetOf)
    if (!f || f.length > 8192) return undefined
    const parses = (x: string) => {
      try {
        parseFormula(x)
        return true
      } catch {
        return false
      }
    }
    // the workbook's parser has no intersection operator (a space): Excel has
    return parses(f) || (/ (?=(?:[^"]*"[^"]*")*[^"]*$)/.test(f) && parses(f.replace(/ (?=(?:[^"]*"[^"]*")*[^"]*$)/g, ','))) ? f : undefined
  }

  private value(k: ONode): Val {
    const out = this.read(k)
    if (out.f !== undefined) out.fx = escText(out.f)
    if (out.v !== undefined) out.vx = out.t === 's' || out.t === 'b' || out.t === undefined ? out.v : escText(out.v)
    return out
  }

  private read(k: ONode): Val {
    const a = k.attrs
    const out: Val = {}
    const cs = rep(a['table:number-columns-spanned'])
    const rs = rep(a['table:number-rows-spanned'])
    if (cs > 1 || rs > 1) out.span = [cs, rs]
    const paras = paragraphs(k)
    let text = paras.join('\n')
    if (text.length > 32767) text = text.slice(0, 32767)
    const link = linkOf(k)
    if (link) out.link = link
    const ann = child(k, 'office:annotation')
    if (ann) {
      const t = paragraphs(ann).join('\n')
      if (t) out.note = { author: textContent(child(ann, 'dc:creator') ?? '').trim(), text: t, shown: ann.attrs['office:display'] === 'true' }
    }
    const formula = a['table:formula'] ? this.formula(a['table:formula']) : undefined
    if (formula) {
      out.f = formula
      const mc = rep(a['table:number-matrix-columns-spanned'])
      const mr = rep(a['table:number-matrix-rows-spanned'])
      if (a['table:number-matrix-columns-spanned'] || a['table:number-matrix-rows-spanned']) out.arr = [mc, mr]
    }
    const vt = a['office:value-type']
    const string = () => {
      const s = a['office:string-value']?.slice(0, 32767) ?? text
      if (formula) {
        out.t = 'str'
        out.v = s
      } else if (s) {
        out.t = 's'
        out.v = String(this.sst(s))
      }
      if (s.includes('\n')) out.lines = true
    }
    // errors: marked as such (LibreOffice 4+), or a number shown as an error (older files)
    if (a['calcext:value-type'] === 'error' || ((vt === 'float' || !vt) && /^(#NULL!|#DIV\/0!|#VALUE!|#REF!|#NAME\?|#NUM!|#N\/A|Err:\d{3})$/.test(text))) {
      out.t = 'e'
      out.v = excelError(text || '#VALUE!')
      return out
    }
    switch (vt) {
      case 'float':
      case 'percentage':
      case 'currency': {
        const raw = a['office:value']
        const n = Number(raw)
        if (raw !== undefined && raw.trim() !== '' && Number.isFinite(n)) {
          // the number as written (xsd:double, as XLSX's) unless it needs normalizing
          out.v = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw) ? raw : num(n)
          out.fallback = fallbackFormat(vt, n, a['office:currency'])
        } else string()
        break
      }
      case 'date': {
        let d = serial(a['office:date-value'], this.dateBase)
        if (d === undefined) {
          string()
          break
        }
        // Excel counts the 29th of February 1900 that never was
        if (!this.date1904 && d >= 1 && d < 61) d -= 1
        out.v = num(d)
        out.fallback = fallbackFormat('date', d)
        break
      }
      case 'time': {
        const d = duration(a['office:time-value'])
        if (d === undefined) string()
        else {
          out.v = num(d)
          out.fallback = fallbackFormat('time', d)
        }
        break
      }
      case 'boolean': {
        const b = a['office:boolean-value']
        out.t = 'b'
        out.v = b === 'true' || (b !== undefined && b !== 'false' && Number(b) !== 0 && !Number.isNaN(Number(b))) ? '1' : '0'
        break
      }
      case 'string':
        string()
        break
      default:
        // no value type: text as it is (formulas without a cached value are computed on load)
        if (!formula && text) string()
    }
    return out
  }

  // ------------------------------------------------------------------ sheets

  private sheet(table: ONode, name: string, index: number, active: boolean, hidden: boolean): SheetOut {
    const odfName = table.attrs['table:name'] ?? ''
    const tableStyle = this.pkg.styles.get('table', table.attrs['table:style-name'])
    const tp = this.pkg.styles.props('table', table.attrs['table:style-name'])['style:table-properties'] ?? {}
    const cols = this.columns(table)
    const { recs, header } = this.rows(table)
    const fmts = this.fmts

    // the column of each index: its default cell style and that style's format
    const colAt = (c: number): ColRun | undefined => {
      let lo = 0
      let hi = cols.length - 1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (cols[mid].end <= c) lo = mid + 1
        else if (cols[mid].start > c) hi = mid - 1
        else return cols[mid]
      }
      return undefined
    }
    const colXfs = new Map<ColRun | undefined, number>()
    const colXf = (c: number) => {
      const col = colAt(c)
      let x = colXfs.get(col)
      if (x === undefined) colXfs.set(col, (x = col?.style ? fmts.xf(col.style) : 0))
      return x
    }
    const styleAt = (run: Run, c: number) => run.style ?? colAt(c)?.style ?? 'Default'
    const padding = (runs: Run[], i: number) => !runs[i].content && ((i === runs.length - 1 && runs[i].count > PAD) || runs[i].count > 1024)

    // the used range: rows and columns with content, and formatted cells that are not the padding of a row
    let lastRow = -1
    let used = 0
    for (const rec of recs) {
      if (rec.content) lastRow = rec.start + rec.count - 1
      rec.runs.forEach((run, i) => {
        if (run.content) used = Math.max(used, run.start + run.count - 1 + rep(run.node.attrs['table:number-columns-spanned']))
        else if (run.style && !padding(rec.runs, i) && fmts.xf(run.style) !== 0) used = Math.max(used, run.start + run.count)
      })
    }
    used = Math.min(used, MAX_COLS)

    // the most common row height and column width are the sheet's defaults
    const heights = new Map<number, number>()
    for (const rec of recs) {
      const h = this.rowStyle(rec.node.attrs['table:style-name']).ht ?? ROW_H
      heights.set(h, (heights.get(h) ?? 0) + rec.count)
    }
    const total = recs.reduce((n, r) => n + r.count, 0)
    const common = [...heights].sort((a, b) => b[1] - a[1])[0]
    const defH = common && common[1] * 2 > total ? common[0] : ROW_H
    const widths = new Map<number, number>()
    for (const col of cols) widths.set(col.width ?? COL_W, (widths.get(col.width ?? COL_W) ?? 0) + col.end - col.start)
    const defW = [...widths].sort((a, b) => b[1] - a[1])[0]?.[0] ?? COL_W

    // rows go into Blobs every few MB: a Blob lives outside the heap
    const rowBlobs: Blob[] = []
    let rowsXml: string[] = []
    let held = 0
    const merges: string[] = []
    const links: SheetOut['links'] = []
    const notes: SheetOut['notes'] = []
    const breaks: number[] = []
    let trailing = 0
    const names = new Map<number, string>()
    const cn = (c: number) => {
      let s = names.get(c)
      if (s === undefined) names.set(c, (s = colName(c)))
      return s
    }

    for (const rec of recs) {
      if (this.truncated) break
      const row = rec.node
      const rs = this.rowStyle(row.attrs['table:style-name'])
      const vis = row.attrs['table:visibility']
      const rowHidden = !!vis && vis !== 'visible'
      let attrs = ''
      const ht = rs.ht ?? ROW_H
      if (Math.abs(ht - defH) > 0.05) attrs += ` ht="${pt2(ht)}"${rs.optimal ? '' : ' customHeight="1"'}`
      if (rowHidden) attrs += ' hidden="1"'
      if (rec.level) attrs += ` outlineLevel="${Math.min(rec.level, 7)}"`
      const cells: Cell[] = []
      let rowXf = 0
      rec.runs.forEach((run, i) => {
        if (run.content) {
          const val = this.value(run.node)
          // a merge repeated over columns or rows would overlap itself
          const span = val.span && !(run.count > 1 && val.span[0] > 1) && !(rec.count > 1 && val.span[1] > 1) ? val.span : undefined
          for (let c = run.start; c < run.start + run.count; c++) {
            const st = styleAt(run, c)
            const s = fmts.xf(st, val.fallback && !fmts.hasFormat(st) ? val.fallback : undefined, val.lines)
            if (val.v !== undefined || val.f || span || val.note || val.link || s !== colXf(c)) cells.push({ c, s, val, merge: span })
          }
          return
        }
        if (!run.style) return
        const s = fmts.xf(run.style)
        let end = run.start + run.count
        if (padding(rec.runs, i)) {
          // formatted to the end of the row: the row's format, with cells up to the used width
          rowXf = s
          end = Math.min(end, Math.max(used, run.start))
        }
        for (let c = run.start; c < end; c++) if (s !== colXf(c)) cells.push({ c, s, val: EMPTY })
      })
      if (rowXf) attrs += ` s="${rowXf}" customFormat="1"`
      if (!rec.content && !cells.length && !attrs && !rs.pageBreak) continue
      let count = rec.count
      if (!rec.content && rec.start > lastRow) {
        // empty rows below the content: formatted ones close to it are kept
        if (trailing + count > TRAIL_ROWS || rec.start + count - 1 > lastRow + TRAIL_ROWS) continue
        trailing += count
      }
      if (rs.pageBreak && rec.start > 0) breaks.push(rec.start)
      for (let i = 0; i < count; i++) {
        if (this.cells + cells.length + 1 > MAX_CELLS) {
          this.truncated = true
          count = i
          break
        }
        this.cells += cells.length + 1
        const r = rec.start + i
        const rn = r + 1
        let x = `<row r="${rn}"${attrs}>`
        for (const { c, s, val, merge } of cells) {
          const ref = cn(c) + rn
          x += `<c r="${ref}"${s ? ` s="${s}"` : ''}${val.t ? ` t="${val.t}"` : ''}`
          if (val.fx === undefined && val.vx === undefined) {
            x += '/>'
          } else {
            x += '>'
            if (val.fx !== undefined) {
              x += val.arr ? `<f t="array" ref="${ref}:${cn(Math.min(c + val.arr[0], MAX_COLS) - 1)}${Math.min(r + val.arr[1], MAX_ROWS)}">${val.fx}</f>` : `<f>${val.fx}</f>`
            }
            if (val.vx !== undefined) x += `<v>${val.vx}</v>`
            x += '</c>'
          }
          if (merge) merges.push(`${ref}:${cn(Math.min(c + merge[0], MAX_COLS) - 1)}${Math.min(r + merge[1], MAX_ROWS)}`)
          if (val.link) links.push({ ref, target: val.link })
          if (val.note) notes.push({ r, c, note: val.note })
        }
        rowsXml.push(x + '</row>')
        held += x.length
        if (held > 1 << 22) {
          rowBlobs.push(new Blob(rowsXml))
          rowsXml = []
          held = 0
        }
      }
    }

    // columns: widths, hidden, default formats and groups, as ranges
    const colXml: string[] = []
    let prev: { key: string; min: number; max: number } | undefined
    const flush = () => {
      if (prev) colXml.push(`<col min="${prev.min}" max="${prev.max}"${prev.key}/>`)
      prev = undefined
    }
    const colBreaks: number[] = []
    for (const col of cols) {
      if (col.pageBreak && col.start > 0) colBreaks.push(col.start)
      const w = col.width ?? COL_W
      const xf = col.style ? fmts.xf(col.style) : 0
      let key = ` width="${pt2(Math.min((w * 4) / 3 / 7, 255))}"${Math.abs(w - defW) > 0.05 ? ' customWidth="1"' : ''}`
      if (xf) key += ` style="${xf}"`
      if (col.hidden) key += ' hidden="1"'
      if (col.level) key += ` outlineLevel="${Math.min(col.level, 7)}"`
      if (Math.abs(w - defW) <= 0.05 && !xf && !col.hidden && !col.level) {
        flush()
        continue
      }
      // past the used columns only what is visible on its own matters
      const end = col.start >= used && !xf && !col.hidden ? Math.min(col.end, col.start + 1024) : col.end
      if (prev && prev.key === key && prev.max === col.start) prev.max = end
      else {
        flush()
        prev = { key, min: col.start + 1, max: end }
      }
    }
    flush()

    // view: frozen panes, gridlines, zoom, tab color, right to left
    const set = this.view.tables.get(odfName) ?? new Map<string, string>()
    const g = (k: string) => set.get(k)
    const n = (k: string) => Number.parseInt(g(k) ?? '0', 10) || 0
    const xs = g('HorizontalSplitMode') === '2' ? Math.max(0, Math.min(n('HorizontalSplitPosition'), MAX_COLS - 1)) : 0
    const ys = g('VerticalSplitMode') === '2' ? Math.max(0, Math.min(n('VerticalSplitPosition'), MAX_ROWS - 1)) : 0
    let pane = ''
    if (xs || ys) {
      const tl = `${colName(xs ? Math.max(n('PositionRight'), xs) : 0)}${(ys ? Math.max(n('PositionBottom'), ys) : 0) + 1}`
      const ap = xs && ys ? 'bottomRight' : ys ? 'bottomLeft' : 'topRight'
      pane = `<pane${xs ? ` xSplit="${xs}"` : ''}${ys ? ` ySplit="${ys}"` : ''} topLeftCell="${tl}" activePane="${ap}" state="frozen"/><selection pane="${ap}"/>`
    }
    const grid = g('ShowGrid') ?? this.view.global.get('ShowGrid')
    const zoom = n('ZoomValue')
    const rtl = tp['style:writing-mode'] === 'rl-tb'
    const view =
      `<sheetViews><sheetView workbookViewId="0"${active ? ' tabSelected="1"' : ''}${grid === 'false' ? ' showGridLines="0"' : ''}${rtl ? ' rightToLeft="1"' : ''}` +
      `${zoom >= 10 && zoom <= 400 && zoom !== 100 ? ` zoomScale="${zoom}"` : ''}>${pane}</sheetView></sheetViews>`
    let tab = toHex(tp['tableooo:tab-color'] ?? tp['table:tab-color'] ?? tp['loext:tab-color'])
    const tc = Number(g('TabColor'))
    if (!tab && g('TabColor') && Number.isFinite(tc) && tc >= 0 && tc < 0xffffff + 1) tab = tc.toString(16).padStart(6, '0').toUpperCase()

    // page setup
    const page = pageSetup(this.pkg.styles, tableStyle?.attrs['style:master-page-name'])

    // defined names of the sheet: print area, print titles, autofilter
    const local = (n: string, v: string, hidden = false) => this.defined.push(`<definedName name="${n}" localSheetId="${index}"${hidden ? ' hidden="1"' : ''}>${escText(v)}</definedName>`)
    const abs = (r: string) => r.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/g, '$$$2$$$4')
    const printRanges = rangeList(table.attrs['table:print-ranges'] ?? '')
      .map((r) => rangeOnSheet(r))
      .filter((r): r is { sheet?: string; range: string } => !!r)
      .map((r) => `${quoteSheet(name)}!${abs(r.range)}`)
    if (printRanges.length) local('_xlnm.Print_Area', printRanges.join(','))
    if (header) local('_xlnm.Print_Titles', `${quoteSheet(name)}!$${header[0] + 1}:$${header[1] + 1}`)
    let filter = ''
    for (const db of descendants(child(this.body, 'table:database-ranges'), 'table:database-range')) {
      if (db.attrs['table:display-filter-buttons'] !== 'true') continue
      const r = rangeOnSheet(db.attrs['table:target-range-address'] ?? '')
      if (!r || this.sheetOf(r.sheet ?? '') !== name || filter) continue
      filter = `<autoFilter ref="${r.range.replace(/\$/g, '')}"/>`
      local('_xlnm._FilterDatabase', `${quoteSheet(name)}!${abs(r.range)}`, true)
    }

    const dim = lastRow >= 0 && used > 0 ? `<dimension ref="A1:${colName(used - 1)}${lastRow + 1}"/>` : ''
    const sheetPr = tab || page.fit ? `<sheetPr>${tab ? `<tabColor rgb="FF${tab}"/>` : ''}${page.fit ? '<pageSetUpPr fitToPage="1"/>' : ''}</sheetPr>` : ''
    const brk = (tag: string, list: number[], max: number) =>
      list.length ? `<${tag} count="${list.length}" manualBreakCount="${list.length}">${list.map((b) => `<brk id="${b}" max="${max}" man="1"/>`).join('')}</${tag}>` : ''
    if (rowsXml.length) rowBlobs.push(new Blob(rowsXml))
    const head =
      `${XML_HEAD}<worksheet ${NS}>${sheetPr}${dim}${view}` +
      `<sheetFormatPr defaultRowHeight="${pt2(defH)}"${Math.abs(defH - ROW_H) > 0.05 ? ' customHeight="1"' : ''} defaultColWidth="${pt2((defW * 4) / 3 / 7)}"/>` +
      (colXml.length ? `<cols>${colXml.join('')}</cols>` : '') +
      '<sheetData>'
    const tail =
      '</sheetData>' +
      filter +
      (merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') +
      '\u0001HYPERLINKS\u0001' +
      page.xml +
      brk('rowBreaks', breaks, MAX_COLS - 1) +
      brk('colBreaks', colBreaks, MAX_ROWS - 1) +
      '\u0001DRAWING\u0001</worksheet>'
    return { name, odfName, hidden, head, rows: rowBlobs, tail, links, notes }
  }

  /** named ranges and expressions (global, or of the sheet at `local`) */
  private namedExpressions(container: ONode | undefined, local?: number) {
    const used = new Set<string>()
    for (const n of children(container)) {
      const raw = n.attrs['table:name']
      if (!raw) continue
      let v: string | undefined
      if (n.name === 'table:named-range') {
        const addr = n.attrs['table:cell-range-address'] ?? ''
        const parts = rangeList(addr).map((a) => excelRef(a, this.sheetOf))
        if (parts.length && !parts.includes('#REF!')) v = parts.join(',')
      } else if (n.name === 'table:named-expression') {
        const e = n.attrs['table:expression'] ?? ''
        v = excelFormula(/^[a-z]+:=/i.test(e) ? e : `of:=${e.replace(/^=/, '')}`, this.sheetOf)
      }
      const name = definedName(raw)
      if (!v || used.has(name.toLowerCase())) continue
      used.add(name.toLowerCase())
      this.defined.push(`<definedName name="${escAttr(name)}"${local !== undefined ? ` localSheetId="${local}"` : ''}>${escText(v)}</definedName>`)
    }
  }

  async convert(): Promise<Blob> {
    const tables = children(this.body, 'table:table')
    const used = new Set<string>()
    const tnames = tables.map((t, i) => {
      const odf = t.attrs['table:name'] ?? `Sheet${i + 1}`
      const x = sheetName(odf, used)
      this.names.set(odf, x)
      if (!this.lowerNames.has(odf.toLowerCase())) this.lowerNames.set(odf.toLowerCase(), x)
      return x
    })
    // a workbook shows at least one sheet, and the active one is visible
    const hidden = tables.map((t) => this.pkg.styles.props('table', t.attrs['table:style-name'])['style:table-properties']?.['table:display'] === 'false')
    if (hidden.length && hidden.every(Boolean)) hidden[0] = false
    let active = tables.findIndex((t) => t.attrs['table:name'] === this.view.global.get('ActiveTable'))
    if (active < 0 || hidden[active]) active = Math.max(0, hidden.indexOf(false))
    const sheets: SheetOut[] = tables.map((t, i) => this.sheet(t, tnames[i], i, i === active, hidden[i]))
    if (this.truncated) console.warn(`[office] spreadsheet cut at ${MAX_CELLS} cells`)
    if (!sheets.length) sheets.push({ name: 'Sheet1', odfName: 'Sheet1', hidden: false, head: `${XML_HEAD}<worksheet ${NS}><sheetData>`, rows: [], tail: '</sheetData>\u0001HYPERLINKS\u0001\u0001DRAWING\u0001</worksheet>', links: [], notes: [] })
    this.namedExpressions(child(this.body, 'table:named-expressions'))
    tables.forEach((t, i) => this.namedExpressions(child(t, 'table:named-expressions'), i))

    const files = new Map<string, PartData>()
    const rel = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`
    const overrides: string[] = []
    let vml = false
    let block = 1
    sheets.forEach((s, k) => {
      const part = new Part(`xl/worksheets/sheet${k + 1}.xml`)
      let links = ''
      for (const l of s.links) {
        if (l.target.startsWith('#')) {
          // a place in the document: "#Sheet2.A1", "#Sheet2", "#Name"
          const t = l.target.slice(1)
          const r = rangeOnSheet(t)
          const loc = r?.sheet !== undefined ? `${quoteSheet(this.sheetOf(r.sheet))}!${r.range}` : this.names.has(t) ? `${quoteSheet(this.sheetOf(t))}!A1` : t
          links += `<hyperlink ref="${l.ref}" location="${escAttr(loc)}" display="${escAttr(t)}"/>`
        } else if (l.target.length < 2080) links += `<hyperlink ref="${l.ref}" r:id="${part.rel('hyperlink', l.target.replace(/ /g, '%20'), true)}"/>`
      }
      let drawing = ''
      if (s.notes.length) {
        vml = true
        const authors: string[] = []
        const list = s.notes
          .map(({ r, c, note }) => {
            let a = authors.indexOf(note.author)
            if (a < 0) a = authors.push(note.author) - 1
            return `<comment ref="${colName(c)}${r + 1}" authorId="${a}"><text><t xml:space="preserve">${escText(note.text)}</t></text></comment>`
          })
          .join('')
        files.set(`xl/comments${k + 1}.xml`, `${XML_HEAD}<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors>${authors.map((a) => `<author>${escText(a)}</author>`).join('')}</authors><commentList>${list}</commentList></comments>`)
        files.set(`xl/drawings/vmlDrawing${k + 1}.vml`, vmlNotes(s.notes.map((n) => ({ r: n.r, c: n.c, shown: n.note.shown })), block))
        block += Math.ceil((s.notes.length + 1) / 1024)
        overrides.push(`<Override PartName="/xl/comments${k + 1}.xml" ContentType="${SML}.comments+xml"/>`)
        part.rel('comments', `../comments${k + 1}.xml`)
        drawing = `<legacyDrawing r:id="${part.rel('vmlDrawing', `../drawings/vmlDrawing${k + 1}.vml`)}"/>`
      }
      const tail = s.tail.replace('\u0001HYPERLINKS\u0001', links ? `<hyperlinks>${links}</hyperlinks>` : '').replace('\u0001DRAWING\u0001', drawing)
      const xml = new Blob([s.head, ...s.rows, tail])
      files.set(part.path, () => xml.stream())
      if (part.rels.length) files.set(part.relsPath, part.relsXml())
    })

    files.set(
      '[Content_Types].xml',
      `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
        (vml ? '<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>' : '') +
        `<Override PartName="/xl/workbook.xml" ContentType="${SML}.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${SML}.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${SML}.sharedStrings+xml"/>` +
        sheets.map((_, k) => `<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="${SML}.worksheet+xml"/>`).join('') +
        overrides.join('') +
        '</Types>',
    )
    files.set('_rels/.rels', `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel('rId1', 'officeDocument', 'xl/workbook.xml')}</Relationships>`)
    files.set(
      'xl/workbook.xml',
      `${XML_HEAD}<workbook ${NS}>${this.date1904 ? '<workbookPr date1904="1"/>' : '<workbookPr/>'}<bookViews><workbookView activeTab="${Math.max(0, active)}"/></bookViews><sheets>` +
        sheets.map((s, k) => `<sheet name="${escAttr(s.name)}" sheetId="${k + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="rId${k + 1}"/>`).join('') +
        '</sheets>' +
        (this.defined.length ? `<definedNames>${this.defined.join('')}</definedNames>` : '') +
        '</workbook>',
    )
    files.set(
      'xl/_rels/workbook.xml.rels',
      `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        sheets.map((_, k) => rel(`rId${k + 1}`, 'worksheet', `worksheets/sheet${k + 1}.xml`)).join('') +
        rel(`rId${sheets.length + 1}`, 'styles', 'styles.xml') +
        rel(`rId${sheets.length + 2}`, 'sharedStrings', 'sharedStrings.xml') +
        '</Relationships>',
    )
    files.set('xl/styles.xml', this.fmts.table.xml())
    const sst = [...this.strings.keys()].map((t) => `<si><t xml:space="preserve">${escText(t)}</t></si>`).join('')
    files.set('xl/sharedStrings.xml', `${XML_HEAD}<sst ${NS.split(' ')[0]} count="${this.strings.size}" uniqueCount="${this.strings.size}">${sst}</sst>`)
    return writeZip(files, `${SML}.sheet`)
  }
}

/** Converts an OpenDocument spreadsheet to a XLSX file. */
export async function odsToXlsx(pkg: OdfPackage): Promise<Blob> {
  const body = pkg.body('spreadsheet')
  if (!body) {
    // an encrypted package: its manifest says how the parts are encrypted
    const manifest = await pkg.file({ name: 'manifest', attrs: { 'xlink:href': 'META-INF/manifest.xml' }, kids: [] })
    if (manifest && new TextDecoder().decode(manifest).includes('encryption-data')) throw new Error('Password-protected OpenDocument files are not supported')
    throw new Error('Not an OpenDocument spreadsheet (no office:spreadsheet)')
  }
  return new OdsConverter(pkg, body).convert()
}
