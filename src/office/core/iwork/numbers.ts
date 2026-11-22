/**
 * Numbers spreadsheets (iWork '13+) → XLSX, for viewing. Every table becomes a worksheet (named after its
 * sheet, and the table when a sheet holds several): values keep their type (numbers and dates with an Excel
 * number format matching the Numbers one), cells their look (font, alignment, wrap, fill, banded rows, lines),
 * and the table its column widths, row heights, merged cells, hidden rows / columns and frozen header.
 * Formulas are not converted: cells hold the values Numbers computed.
 */
import { escAttr, escText } from '../raw'
import { writeZip, type PartData } from '../zipwrite'
import { colName } from '../xlsx/workbook'
import { excelFormat, FMT, lowerAmPm, toSerial } from './format'
import type { IworkPackage } from './iwa'
import { XML_HEAD } from './ooxml'
import type { Msg } from './proto'
import { fillColor, hexColor, IworkStyles, type CharProps } from './styles'
import { anchors, readTable, tableLook, type CellStroke, type IworkCell, type IworkTable } from './table'
import { cleanText } from './text'

const TABLE_INFO = 6000
/** cells read per table (the largest Numbers tables: 1,000,000 rows × 1,000 columns) */
const MAX_CELLS = 5_000_000
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const SML = 'application/vnd.openxmlformats-officedocument.spreadsheetml'
const ALIGN: Record<string, string> = { left: 'left', right: 'right', center: 'center', both: 'justify' }
const VALIGN = ['top', 'center', 'bottom']
const U: Record<string, string> = { single: 'single', double: 'double', wave: 'single' }

/** an Excel border side from a line width (pt) */
const borderStyle = (s: CellStroke) => (s.width <= 1.25 ? 'thin' : s.width <= 2.5 ? 'medium' : 'thick')

interface Look {
  font: CharProps
  fill?: string
  numFmt?: string
  align?: string
  valign?: string
  wrap: boolean
  borders: (CellStroke | null | undefined)[]
}

/** styles.xml: fonts, fills, borders, number formats and cell formats, each written once */
class StyleTable {
  private fonts = new Map<string, number>()
  private fills = new Map<string, number>()
  private borders = new Map<string, number>()
  private formats = new Map<string, number>()
  private xfs = new Map<string, number>()
  private fontXml: string[] = []
  private fillXml = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']
  private borderXml = ['<border><left/><right/><top/><bottom/><diagonal/></border>']
  private formatXml: string[] = []
  private xfXml: string[] = []

  constructor(base: CharProps) {
    this.font(base)
    this.xf({ font: base, wrap: false, borders: [] })
  }

  private font(c: CharProps): number {
    let x = ''
    if (c.b) x += '<b/>'
    if (c.i) x += '<i/>'
    if (c.strike && c.strike !== 'none') x += '<strike/>'
    if (c.u && c.u !== 'none') x += `<u val="${U[c.u] ?? 'single'}"/>`
    if (c.va === 'superscript' || c.va === 'subscript') x += `<vertAlign val="${c.va}"/>`
    x += `<sz val="${+(c.sz ?? 10).toFixed(2)}"/>`
    if (c.color) x += `<color rgb="FF${c.color}"/>`
    x += `<name val="${escAttr(c.font ?? 'Helvetica Neue')}"/>`
    const xml = `<font>${x}</font>`
    let id = this.fonts.get(xml)
    if (id === undefined) {
      id = this.fontXml.length
      this.fonts.set(xml, id)
      this.fontXml.push(xml)
    }
    return id
  }

  private fill(c: string | undefined): number {
    if (!c) return 0
    let id = this.fills.get(c)
    if (id === undefined) {
      id = this.fillXml.length
      this.fills.set(c, id)
      this.fillXml.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`)
    }
    return id
  }

  private border(sides: (CellStroke | null | undefined)[]): number {
    const side = (tag: string, s: CellStroke | null | undefined) => (s ? `<${tag} style="${borderStyle(s)}"><color rgb="FF${s.color}"/></${tag}>` : `<${tag}/>`)
    const xml = `<border>${side('left', sides[0])}${side('right', sides[1])}${side('top', sides[2])}${side('bottom', sides[3])}<diagonal/></border>`
    if (xml === this.borderXml[0]) return 0
    let id = this.borders.get(xml)
    if (id === undefined) {
      id = this.borderXml.length
      this.borders.set(xml, id)
      this.borderXml.push(xml)
    }
    return id
  }

  private numFmt(code: string | undefined): number {
    if (!code) return 0
    let id = this.formats.get(code)
    if (id === undefined) {
      id = 164 + this.formatXml.length
      this.formats.set(code, id)
      this.formatXml.push(`<numFmt numFmtId="${id}" formatCode="${escAttr(code)}"/>`)
    }
    return id
  }

  /** index of the cell format with this look */
  xf(l: Look): number {
    const font = this.font(l.font)
    const fill = this.fill(l.fill)
    const border = this.border(l.borders)
    const fmt = this.numFmt(l.numFmt)
    const al = (l.align ? ` horizontal="${l.align}"` : '') + (l.valign ? ` vertical="${l.valign}"` : '') + (l.wrap ? ' wrapText="1"' : '')
    const xml =
      `<xf numFmtId="${fmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"` +
      `${fmt ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}${fill ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''}` +
      (al ? ` applyAlignment="1"><alignment${al}/></xf>` : '/>')
    let id = this.xfs.get(xml)
    if (id === undefined) {
      id = this.xfXml.length
      this.xfs.set(xml, id)
      this.xfXml.push(xml)
    }
    return id
  }

  xml(): string {
    return (
      `${XML_HEAD}<styleSheet ${NS}>` +
      (this.formatXml.length ? `<numFmts count="${this.formatXml.length}">${this.formatXml.join('')}</numFmts>` : '') +
      `<fonts count="${this.fontXml.length}">${this.fontXml.join('')}</fonts>` +
      `<fills count="${this.fillXml.length}">${this.fillXml.join('')}</fills>` +
      `<borders count="${this.borderXml.length}">${this.borderXml.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfXml.length}">${this.xfXml.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    )
  }
}

/** height (pt) of wrapped text in a column: lines of about half an em per character, 1.2 em each, plus padding */
function textHeight(text: string, width: number, sz: number): number {
  const perLine = Math.max(1, Math.floor((width - 8) / (sz * 0.52)))
  if (text.length <= perLine && !text.includes('\n')) return sz * 1.2 + 8
  const lines = text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / perLine)), 0)
  return lines * sz * 1.2 + 8
}

/** Excel sheet names: no []:*?/\, at most 31 characters, unique */
function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, '_').replace(/^'+|'+$/g, '').slice(0, 31).trim() || 'Sheet'
  let out = base
  for (let k = 2; used.has(out.toLowerCase()); k++) out = `${base.slice(0, 31 - ` (${k})`.length)} (${k})`
  used.add(out.toLowerCase())
  return out
}

export class NumbersConverter {
  private st: IworkStyles
  private styles: StyleTable
  private strings = new Map<string, number>()
  private lower: boolean

  constructor(private pkg: IworkPackage) {
    this.st = new IworkStyles(pkg)
    this.styles = new StyleTable({ font: 'Helvetica Neue', sz: 10 })
    this.lower = lowerAmPm(pkg.locale())
  }

  private sst(text: string): number {
    let id = this.strings.get(text)
    if (id === undefined) {
      id = this.strings.size
      this.strings.set(text, id)
    }
    return id
  }

  /** a TST.CellStyleArchive property, from the style or its ancestors */
  private cellProp<T>(id: number | undefined, get: (props: Msg) => T | undefined): T | undefined {
    for (const s of this.st.chain(id)) {
      const props = s.msg(11)
      const v = props && get(props)
      if (v !== undefined) return v
    }
    return undefined
  }

  private cellLooks = new Map<number | undefined, { fill?: string; valign?: number; wrap?: boolean }>()

  /** what a cell style sets: fill ('' none), vertical alignment, wrap (undefined: not set) */
  private cellLook(id: number | undefined) {
    let l = this.cellLooks.get(id)
    if (!l) {
      l = {
        fill: this.cellProp(id, (p) => (p.has(1) ? (fillColor(p.msg(1)) ?? '') : undefined)),
        valign: this.cellProp(id, (p) => p.u(8)),
        wrap: this.cellProp(id, (p) => p.bool(3)),
      }
      this.cellLooks.set(id, l)
    }
    return l
  }

  private xfs = new Map<string, number>()
  private strokeIds = new Map<CellStroke, number>()

  /** the cell format of a look, by a cheap key (text style, fill, format, alignment, lines) */
  private xf(textStyle: number | undefined, l: Look): number {
    const sid = (b: CellStroke | null | undefined) => {
      if (!b) return 0
      let id = this.strokeIds.get(b)
      if (!id) this.strokeIds.set(b, (id = this.strokeIds.size + 1))
      return id
    }
    const key = `${textStyle}|${l.fill}|${l.numFmt}|${l.align}|${l.valign}|${l.wrap}|${l.borders.map(sid).join(',')}`
    let id = this.xfs.get(key)
    if (id === undefined) this.xfs.set(key, (id = this.styles.xf(l)))
    return id
  }

  /** plain text of a rich text cell */
  private richText(id: number | undefined): string {
    const s = this.pkg.get(id)
    return s ? cleanText(s.strs(3).join('').replace(/[\r\u2028\u2029\u000b]/g, '\n')).replace(/\n$/, '') : ''
  }

  /** a worksheet with the cells of a table */
  private sheet(t: IworkTable): string {
    const m = t.model
    const look = tableLook(this.pkg, t, (id) => this.st.chain(id), hexColor, fillColor)
    const anchor = anchors(t)
    const names = Array.from({ length: t.cols }, (_, c) => colName(c))
    let rows = ''
    for (let r = 0; r < t.rows; r++) {
      // Numbers grows a row to fit its wrapped text: estimate the lines it needs
      let need = 0
      const header = r < t.headerRows
      const footer = !header && r >= t.rows - t.footerRows
      let cells = ''
      for (let c = 0; c < t.cols; c++) {
        const a = anchor[r][c]
        const cell: IworkCell | undefined = a ? t.cells[a[0]][a[1]] : t.cells[r][c]
        const own = !a || (a[0] === r && a[1] === c)
        const region = header ? m.ref(19) : footer ? m.ref(21) : c < t.headerCols ? m.ref(20) : m.ref(18)
        const textStyle = cell?.textStyle ?? (header ? m.ref(25) : footer ? m.ref(27) : c < t.headerCols ? m.ref(26) : m.ref(24))
        const { pFull, cFull } = this.st.resolved(textStyle)
        const banded = look.band && !header && !footer && (r - t.headerRows) % 2 === 1 ? look.band : undefined
        const mine = this.cellLook(cell?.cellStyle)
        const reg = this.cellLook(region)
        const fill = mine.fill ?? banded ?? reg.fill
        const valign = mine.valign ?? reg.valign ?? 0
        const wrap = mine.wrap ?? reg.wrap ?? true
        const [r0, c0] = a ?? [r, c]
        const rs = a ? (t.cells[r0][c0]?.rowSpan ?? 1) : 1
        const cs = a ? (t.cells[r0][c0]?.colSpan ?? 1) : 1
        // a merged range shows its outer lines
        const borders = [
          c === c0 ? look.v[r][c0] : null,
          c === c0 + cs - 1 ? look.v[r][c0 + cs] : null,
          r === r0 ? look.h[r0][c] : null,
          r === r0 + rs - 1 ? look.h[r0 + rs]?.[c] : null,
        ]
        let value = ''
        let type = ''
        /** text of a string cell */
        let shown = ''
        let numFmt: string | undefined
        let align = pFull.align ? ALIGN[pFull.align] : undefined
        const kind = own ? cell?.kind : undefined
        const ftype = cell?.format?.u(1)
        if (kind === 'number' && ftype !== FMT.FRACTION && ftype !== FMT.BASE && ftype !== FMT.CHECKBOX && ftype !== FMT.RATING) {
          value = String(cell!.value)
          numFmt = excelFormat(cell!.format, 'number', this.lower, cell!.value)
        } else if (kind === 'date') {
          value = String(toSerial(cell!.value!))
          numFmt = excelFormat(cell!.format, 'date', this.lower)
        } else if (kind === 'bool' && ftype !== FMT.CHECKBOX) {
          value = cell!.value ? '1' : '0'
          type = 'b'
        } else if (kind === 'error') {
          value = String(this.sst(cell!.text ?? '#ERROR'))
          type = 's'
          align ??= 'center'
        } else if (kind === 'text' || kind === 'rich') {
          shown = kind === 'rich' ? this.richText(cell!.storage) : (cell!.text ?? '')
          if (shown) {
            value = String(this.sst(shown))
            type = 's'
          }
        } else if (kind && cell?.text) {
          // durations, fractions, other bases, checkboxes, ratings: their text, placed like a number
          value = String(this.sst(cell.text))
          type = 's'
          align ??= kind === 'bool' ? 'center' : 'right'
        }
        const s = this.xf(textStyle, { font: cFull, fill: fill || undefined, numFmt, align, valign: VALIGN[valign] ?? 'top', wrap, borders })
        if (wrap && shown && rs === 1 && cs === 1) need = Math.max(need, textHeight(shown, t.colWidths[c], cFull.sz ?? 10))
        const ref = names[c] + (r + 1)
        if (value) cells += `<c r="${ref}" s="${s}"${type ? ` t="${type}"` : ''}><v>${value}</v></c>`
        else if (s) cells += `<c r="${ref}" s="${s}"/>`
      }
      const hidden = t.hiddenRows.has(r)
      rows += `<row r="${r + 1}" ht="${+Math.max(t.rowHeights[r], need).toFixed(2)}" customHeight="1"${hidden ? ' hidden="1"' : ''}>${cells}</row>`
    }
    const cols = t.colWidths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${+((w * 4) / 3 / 7).toFixed(2)}" customWidth="1"${t.hiddenCols.has(c) ? ' hidden="1"' : ''}/>`).join('')
    const merges: string[] = []
    t.cells.forEach((row, r) =>
      row.forEach((cell, c) => {
        if ((cell?.rowSpan ?? 1) > 1 || (cell?.colSpan ?? 1) > 1) merges.push(`<mergeCell ref="${colName(c)}${r + 1}:${colName(c + (cell!.colSpan ?? 1) - 1)}${r + (cell!.rowSpan ?? 1)}"/>`)
      }),
    )
    const fr = m.bool(12) ? t.headerRows : 0
    const fc = m.bool(13) ? t.headerCols : 0
    const pane = fr || fc ? `<pane${fc ? ` xSplit="${fc}"` : ''}${fr ? ` ySplit="${fr}"` : ''} topLeftCell="${colName(fc)}${fr + 1}" activePane="${fr && fc ? 'bottomRight' : fr ? 'bottomLeft' : 'topRight'}" state="frozen"/>` : ''
    return (
      `${XML_HEAD}<worksheet ${NS}><sheetViews><sheetView showGridLines="0" workbookViewId="0">${pane}</sheetView></sheetViews>` +
      `<sheetFormatPr defaultRowHeight="20" customHeight="1"/><cols>${cols}</cols><sheetData>${rows}</sheetData>` +
      (merges.length ? `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>` : '') +
      '</worksheet>'
    )
  }

  async convert(): Promise<Blob> {
    const { pkg } = this
    const doc = pkg.get(1)
    if (!doc) throw new Error('Not a Numbers spreadsheet')
    const used = new Set<string>()
    const sheets: { name: string; xml: string; hidden: boolean }[] = []
    for (const sheetId of doc.refs(1)) {
      const sheet = pkg.get(sheetId)
      if (!sheet) continue
      const name = sheet.str(1) || `Sheet ${sheets.length + 1}`
      const tables = sheet.refs(2).filter((d) => pkg.type(d) === TABLE_INFO)
      for (const info of tables) {
        const t = readTable(pkg, pkg.get(info)?.ref(2) ?? -1, MAX_CELLS, false)
        if (!t) continue
        const tableName = t.model.str(8)
        sheets.push({ name: sheetName(tables.length > 1 && tableName ? `${name} - ${tableName}` : name, used), xml: this.sheet(t), hidden: !!sheet.bool(25) })
      }
    }
    if (!sheets.length) sheets.push({ name: sheetName('Sheet 1', used), xml: `${XML_HEAD}<worksheet ${NS}><sheetData/></worksheet>`, hidden: false })
    // a workbook shows at least one sheet
    if (sheets.every((s) => s.hidden)) sheets[0].hidden = false

    const files = new Map<string, PartData>()
    const rel = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`
    files.set(
      '[Content_Types].xml',
      `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="${SML}.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${SML}.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${SML}.sharedStrings+xml"/>` +
        sheets.map((_, k) => `<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="${SML}.worksheet+xml"/>`).join('') +
        '</Types>',
    )
    files.set('_rels/.rels', `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel('rId1', 'officeDocument', 'xl/workbook.xml')}</Relationships>`)
    files.set(
      'xl/workbook.xml',
      `${XML_HEAD}<workbook ${NS}><bookViews><workbookView activeTab="${Math.max(0, sheets.findIndex((s) => !s.hidden))}"/></bookViews><sheets>` +
        sheets.map((s, k) => `<sheet name="${escAttr(s.name)}" sheetId="${k + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="rId${k + 1}"/>`).join('') +
        '</sheets></workbook>',
    )
    files.set(
      'xl/_rels/workbook.xml.rels',
      `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        sheets.map((_, k) => rel(`rId${k + 1}`, 'worksheet', `worksheets/sheet${k + 1}.xml`)).join('') +
        rel(`rId${sheets.length + 1}`, 'styles', 'styles.xml') +
        rel(`rId${sheets.length + 2}`, 'sharedStrings', 'sharedStrings.xml') +
        '</Relationships>',
    )
    sheets.forEach((s, k) => files.set(`xl/worksheets/sheet${k + 1}.xml`, s.xml))
    files.set('xl/styles.xml', this.styles.xml())
    const sst = [...this.strings.keys()].map((t) => `<si><t xml:space="preserve">${escText(t)}</t></si>`).join('')
    files.set('xl/sharedStrings.xml', `${XML_HEAD}<sst ${NS} count="${this.strings.size}" uniqueCount="${this.strings.size}">${sst}</sst>`)
    return writeZip(files, `${SML}.sheet`)
  }
}

/** Converts an opened Numbers package to an XLSX file. */
export function numbersToXlsx(pkg: IworkPackage): Promise<Blob> {
  return new NumbersConverter(pkg).convert()
}
