/**
 * Excel 97-2003 binary workbooks (.xls: BIFF8 in the "Workbook" stream, [MS-XLS]) → XLSX. Excel 5.0 / 95 workbooks
 * (BIFF5, the "Book" stream: 8-bit strings in the workbook's code page) too. Cells keep their values, formats and
 * formulas (decoded to formula text, with the cached results), and sheets their layout, view, page setup,
 * hyperlinks and comments. Colors are the palette's, or the full colors (theme colors with tints) that Excel 2007+
 * adds. Chart sheets become empty sheets; pictures, charts, conditional formats and data validation are left out.
 */
import type { Cfb } from '../cfb'
import { escAttr } from '../../raw'
import { writeZip, type PartData } from '../../zipwrite'
import { codepageDecoder, Parts, R, str8At } from './biff'
import { formulaText, quoteSheet, Unsupported, type FormulaEnv } from './formula'
import { readSheet, type Note, type SheetEnv } from './sheet'
import { sheetXml, xstr, XML_HEAD, type SheetOut } from './sheet-xml'
import { BlobSource } from '../../source'
import { ZipArchive } from '../../zip'
import { Palette, readFont, readXf, readXfExt, themeColors, XlsxStyles, type Font, type Xf } from './styles'

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const SML = 'application/vnd.openxmlformats-officedocument.spreadsheetml'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** built-in defined names (NAME records with fBuiltin) */
const BUILTIN_NAMES = [
  'Consolidate_Area', 'Auto_Open', 'Auto_Close', 'Extract', 'Database', 'Criteria', 'Print_Area', 'Print_Titles',
  'Recorder', 'Data_Form', 'Auto_Activate', 'Auto_Deactivate', 'Sheet_Title', '_FilterDatabase',
]

/** the built-in names an XLSX workbook has (as "_xlnm.Name") */
const XLNM = new Set(['Consolidate_Area', 'Extract', 'Database', 'Criteria', 'Print_Area', 'Print_Titles', 'Sheet_Title', '_FilterDatabase'])

interface BoundSheet {
  pos: number
  /** 0 visible, 1 hidden, 2 very hidden */
  state: number
  /** 0 worksheet, 1 macro sheet, 2 chart, 6 VBA module */
  type: number
  name: string
}

interface NameRec {
  flags: number
  name: string
  /** 1-based sheet index of a sheet-level name, 0 for the workbook */
  itab: number
  rgce: Uint8Array
  extra?: Uint8Array
}

interface Supbook {
  kind: 'self' | 'addin' | 'external'
  names: string[]
}

/** a link target as a URI: characters a URI cannot hold percent-encoded */
const uriText = (t: string) => t.replace(/[\s"<>{}|^`]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))

/** Excel sheet names: no []:*?/\, at most 31 characters, unique */
function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\\u0000-\u001f]/g, '_').replace(/^'+|'+$/g, '').slice(0, 31) || 'Sheet'
  let out = base
  for (let k = 2; used.has(out.toLowerCase()); k++) out = `${base.slice(0, 31 - ` (${k})`.length)} (${k})`
  used.add(out.toLowerCase())
  return out
}

class XlsBook {
  biff: 5 | 8 = 8
  text8: (b: Uint8Array) => string = codepageDecoder(1252)
  date1904 = false
  fonts: Font[] = []
  xfs: Xf[] = []
  formats = new Map<number, string>()
  palette = new Palette()
  sheets: BoundSheet[] = []
  names: NameRec[] = []
  supbooks: Supbook[] = []
  /** EXTERNSHEET: [supbook, first sheet, last sheet] */
  xti: [number, number, number][] = []
  /** BIFF5 EXTERNSHEET: the sheet name of an own-sheet entry */
  extern5: (string | null)[] = []
  sst: { text: string; runs?: number[] }[] = []
  activeTab = 0
  firstTab = 0
  /** sheet names as written */
  sheetNames: string[] = []
  /** the end of the globals substream */
  globalsEnd = 0
  /** XFEXT records (Excel 2007+ full colors), read once the theme is known */
  xfExts: Uint8Array[] = []
  /** the THEME record's theme file (a ZIP package), when the workbook has its own theme */
  theme?: Uint8Array

  private dv: DataView

  constructor(private data: Uint8Array) {
    this.dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  }

  /** the CONTINUE records after `pos` */
  private continues(pos: number): { parts: Uint8Array[]; pos: number } {
    const parts: Uint8Array[] = []
    const { dv, data } = this
    while (pos + 4 <= data.length && dv.getUint16(pos, true) === R.CONTINUE) {
      const len = dv.getUint16(pos + 2, true)
      parts.push(data.subarray(pos + 4, Math.min(data.length, pos + 4 + len)))
      pos += 4 + len
    }
    return { parts, pos }
  }

  private str(b: Uint8Array, at: number, cch: number): string {
    return this.biff === 8 ? str8At(b, at, cch).text : this.text8(b.subarray(at, at + cch))
  }

  readGlobals() {
    const { dv, data } = this
    if (data.length < 8) throw new Error('Excel workbook stream is empty')
    const first = dv.getUint16(0, true)
    if (first === 0x0009 || first === 0x0209 || first === 0x0409) throw new Error('Excel 2.x-4.0 workbooks are not supported')
    if (first !== R.BOF) throw new Error('Not an Excel workbook (no BOF record)')
    const vers = dv.getUint16(4, true)
    const dt = dv.getUint16(6, true)
    if (dt === 0x0100) throw new Error('Excel 4.0 workbooks are not supported')
    // BIFF8 has a 16-byte BOF
    this.biff = vers === 0x0600 ? 8 : vers === 0x0500 ? 5 : dv.getUint16(2, true) >= 16 ? 8 : 5
    // not workbook globals: a worksheet alone (as some programs write)
    if (dt !== 0x0005) {
      this.sheets.push({ pos: 0, state: 0, type: 0, name: 'Sheet1' })
      return
    }
    let pos = 0
    while (pos + 4 <= data.length) {
      const type = dv.getUint16(pos, true)
      const len = dv.getUint16(pos + 2, true)
      const o = pos + 4
      pos = Math.min(data.length, o + len)
      const rec = data.subarray(o, pos)
      const n = rec.length
      const b8 = this.biff === 8
      switch (type) {
        case R.EOF:
          this.globalsEnd = pos
          return
        case R.FILEPASS:
          throw new Error('Password-protected Excel workbooks are not supported')
        case R.CODEPAGE:
          if (n >= 2) this.text8 = codepageDecoder(dv.getUint16(o, true))
          break
        case R.DATEMODE:
          this.date1904 = n >= 2 && dv.getUint16(o, true) === 1
          break
        case R.FONT:
          if (n >= 15) this.fonts.push(readFont(rec, this.str(rec, 15, rec[14])))
          break
        case R.FORMAT: {
          let code: string | undefined
          if (b8 && n >= 5) code = str8At(rec, 4, dv.getUint16(o + 2, true)).text
          else if (!b8 && n >= 3) code = this.text8(rec.subarray(3, 3 + rec[2]))
          if (code !== undefined) this.formats.set(dv.getUint16(o, true), /^general$/i.test(code) ? 'General' : code)
          break
        }
        case R.XF:
          if (n >= (b8 ? 20 : 16)) this.xfs.push(readXf(rec, this.biff))
          break
        case R.PALETTE:
          this.palette.read(rec)
          break
        case R.BOUNDSHEET:
          if (n >= 8) this.sheets.push({ pos: dv.getUint32(o, true), state: rec[4] & 3, type: rec[5], name: this.str(rec, 7, rec[6]) })
          break
        case R.WINDOW1:
          if (n >= 14) {
            this.activeTab = dv.getUint16(o + 10, true)
            this.firstTab = dv.getUint16(o + 12, true)
          }
          break
        case R.SST: {
          const more = this.continues(pos)
          pos = more.pos
          this.readSst(new Parts([rec, ...more.parts]))
          break
        }
        case R.SUPBOOK: {
          const cch = n >= 4 ? dv.getUint16(o + 2, true) : 0
          this.supbooks.push({ kind: cch === 0x0401 ? 'self' : cch === 0x3a01 ? 'addin' : 'external', names: [] })
          break
        }
        case R.EXTERNNAME:
          if (n >= 7 && this.supbooks.length) this.supbooks[this.supbooks.length - 1].names.push(this.str(rec, 7, rec[6]))
          break
        case R.EXTERNSHEET: {
          if (b8) {
            const more = this.continues(pos)
            pos = more.pos
            const p = new Parts([rec, ...more.parts])
            const count = p.u16()
            for (let i = 0; i < count && !p.eof; i++) this.xti.push([p.u16(), p.u16(), p.u16()])
          } else {
            // BIFF5: 0x03 + the name of a sheet of this workbook, 0x04: this workbook; others are other files
            const kind = rec[1]
            this.extern5.push(kind === 0x03 ? this.text8(rec.subarray(2, 1 + rec[0])) : kind === 0x04 ? '' : null)
          }
          break
        }
        case R.XFEXT:
          this.xfExts.push(rec)
          break
        case R.THEME: {
          // the theme file, continued in CONTINUEFRT12 records (each after its 12-byte header)
          const parts = [rec.subarray(16)]
          while (pos + 4 <= data.length && dv.getUint16(pos, true) === R.CONTINUEFRT12) {
            const len = dv.getUint16(pos + 2, true)
            parts.push(data.subarray(Math.min(data.length, pos + 16), Math.min(data.length, pos + 4 + len)))
            pos += 4 + len
          }
          if (n >= 16 && dv.getUint32(o + 12, true) === 0) this.theme = concat(parts)
          break
        }
        case R.NAME: {
          const more = this.continues(pos)
          pos = more.pos
          const all = more.parts.length ? concat([rec, ...more.parts]) : rec
          this.readName(all)
          break
        }
      }
    }
    this.globalsEnd = pos
  }

  private readSst(p: Parts) {
    p.skip(4)
    const unique = p.u32()
    for (let i = 0; i < unique && !p.eof; i++) this.sst.push(p.str(2))
  }

  private readName(b: Uint8Array) {
    if (b.length < 14) return
    const u16 = (o: number) => b[o] | (b[o + 1] << 8)
    const flags = u16(0)
    const cch = b[3]
    const cce = u16(4)
    const itab = u16(8)
    let name: string
    let at: number
    if (this.biff === 8) {
      const s = str8At(b, 14, cch)
      name = s.text
      at = s.end
    } else {
      name = this.text8(b.subarray(14, 14 + cch))
      at = 14 + cch
    }
    if (flags & 0x20) {
      const builtin = BUILTIN_NAMES[name.charCodeAt(0)]
      name = builtin ? (XLNM.has(builtin) ? '_xlnm.' + builtin : builtin) : ''
    }
    const rec: NameRec = { flags, name, itab, rgce: b.subarray(at, at + cce) }
    if (this.biff === 8 && b.length > at + cce) rec.extra = b.subarray(at + cce)
    this.names.push(rec)
  }

  /** the formula environment of the workbook */
  formulaEnv(): FormulaEnv {
    const sheetPrefix = (first: number, last: number): string | null => {
      if (first === 0xfffe) return ''
      const a = this.sheetNames[first]
      const b = this.sheetNames[last]
      if (a === undefined || b === undefined) return null
      if (first === last) return `${quoteSheet(a)}!`
      return quoteSheet(a) === a && quoteSheet(b) === b ? `${a}:${b}!` : `'${a.replace(/'/g, "''")}:${b.replace(/'/g, "''")}'!`
    }
    const env: FormulaEnv = {
      biff: this.biff,
      sheetRef: (ixti) => {
        const x = this.xti[ixti]
        if (!x) return null
        const book = this.supbooks[x[0]]
        if (book && book.kind !== 'self') throw new Unsupported('Reference to another workbook')
        return sheetPrefix(x[1], x[2])
      },
      sheetRef5: (ixals, first, last) => {
        // a positive index: an EXTERNSHEET entry, which names another file unless it is this one
        if (ixals > 0 && (this.extern5[ixals - 1] ?? null) === null) throw new Unsupported('Reference to another workbook')
        return first === 0xffff ? null : sheetPrefix(first, last)
      },
      name: (index, sheet) => {
        const n = this.names[index - 1]
        if (!n || !n.name) throw new Unsupported('Unknown name')
        if (n.flags & 0x0e) return n.name
        const local = n.itab ? n.itab - 1 : -1
        return local >= 0 && local !== sheet && this.sheetNames[local] !== undefined ? `${quoteSheet(this.sheetNames[local])}!${n.name}` : n.name
      },
      nameX: (ixti, index) => {
        const x = this.xti[ixti]
        const book = x && this.supbooks[x[0]]
        if (!book) throw new Unsupported('Unknown name')
        if (book.kind === 'self') return env.name(index, -1)
        if (book.kind !== 'addin' || !book.names[index - 1]) throw new Unsupported('Name in another workbook')
        return book.names[index - 1]
      },
      text8: (b) => this.text8(b),
    }
    return env
  }

  /** where each sheet's substream starts: its BoundSheet offset, or the next substream when that is not a BOF */
  private sheetStarts(): number[] {
    const { dv, data } = this
    const isBof = (p: number) => p >= 0 && p + 8 <= data.length && dv.getUint16(p, true) === R.BOF
    if (this.sheets.every((s) => isBof(s.pos))) return this.sheets.map((s) => s.pos)
    // the substreams in order, after the globals
    const found: number[] = []
    let depth = 0
    for (let pos = this.globalsEnd; pos + 4 <= data.length; ) {
      const type = dv.getUint16(pos, true)
      if (type === R.BOF) {
        if (!depth) found.push(pos)
        depth++
      } else if (type === R.EOF) depth = Math.max(0, depth - 1)
      pos += 4 + dv.getUint16(pos + 2, true)
    }
    return this.sheets.map((s, k) => (isBof(s.pos) ? s.pos : (found[k] ?? -1)))
  }

  /** the theme's colors: its own (in the THEME record) or Office 2007's */
  private async themeColors(): Promise<Record<string, string> | undefined> {
    if (!this.theme?.length) return undefined
    try {
      const zip = await ZipArchive.open(new BlobSource(new Blob([this.theme as Uint8Array])))
      const path = zip.list().map((e) => e.name).find((p) => /theme\/theme\d*\.xml$/i.test(p))
      return path ? themeColors(await zip.text(path)) : undefined
    } catch {
      return undefined
    }
  }

  async convert(): Promise<Blob> {
    this.readGlobals()
    if (this.xfExts.length) {
      const theme = await this.themeColors()
      for (const b of this.xfExts) readXfExt(b, this.xfs, this.palette, theme)
    }
    const used = new Set<string>()
    if (!this.sheets.length) this.sheets.push({ pos: -1, state: 0, type: 0, name: 'Sheet1' })
    this.sheetNames = this.sheets.map((s) => sheetName(s.name, used))
    const styles = new XlsxStyles(this.fonts, this.xfs, this.formats, this.palette)
    const strings = new SharedStrings(this.sst, styles)
    const formulas = this.formulaEnv()
    const env: SheetEnv = {
      biff: this.biff,
      styles,
      palette: this.palette,
      formulas,
      string: (text, runs) => strings.add(text, runs),
      sstCount: this.sst.length,
      text8: this.text8,
    }
    const starts = this.sheetStarts()
    // AutoFilter ranges: the sheets' _FilterDatabase names
    const filters = new Map<number, string>()
    for (const n of this.names) {
      if (n.name !== '_xlnm._FilterDatabase' || !n.itab) continue
      try {
        const t = formulaText(formulas, n.rgce, n.extra, 0, 0, true, n.itab - 1)
        const ref = t.slice(t.lastIndexOf('!') + 1).replace(/\$/g, '')
        if (/^[A-Z]+\d+(:[A-Z]+\d+)?$/.test(ref)) filters.set(n.itab - 1, ref)
      } catch {
        // no AutoFilter
      }
    }
    const outs: SheetOut[] = this.sheets.map((s, k) => {
      const at = starts[k]
      if ((s.type !== 0 && s.type !== 1) || at < 0) return { xml: [XML_HEAD, `<worksheet ${NS}><sheetData/></worksheet>`], links: [], notes: [], selected: false }
      const model = readSheet(env, this.data, at)
      return sheetXml(env, model, k, { autoFilter: model.autoFilter ? filters.get(k) : undefined })
    })

    // a workbook shows at least one sheet, and its active tab is one of them
    const states = this.sheets.map((s) => s.state)
    if (states.every((s) => s)) states[0] = 0
    let active = this.activeTab < states.length && !states[this.activeTab] ? this.activeTab : states.findIndex((s) => !s)
    if (active < 0) active = 0
    outs.forEach((o, k) => {
      if (o.selected && k !== active) {
        const head = o.xml.findIndex((x) => x.startsWith('<sheetViews>'))
        if (head >= 0) o.xml[head] = o.xml[head].replace(' tabSelected="1"', '')
      }
    })

    const files = new Map<string, PartData>()
    const overrides: string[] = []
    let vml = false
    // VML shape ids come in blocks of 1024, each block used once in the workbook
    let block = 1
    outs.forEach((o, k) => {
      const path = `xl/worksheets/sheet${k + 1}.xml`
      const rels: string[] = []
      o.links.forEach((l) => {
        if (l.target) rels.push(`<Relationship Id="rId${rels.length + 1}" Type="${REL}/hyperlink" Target="${escAttr(uriText(l.target))}" TargetMode="External"/>`)
      })
      if (o.notes.length) {
        vml = true
        const c = rels.length + 1
        rels.push(`<Relationship Id="rId${c}" Type="${REL}/comments" Target="../comments${k + 1}.xml"/>`)
        rels.push(`<Relationship Id="rId${c + 1}" Type="${REL}/vmlDrawing" Target="../drawings/vmlDrawing${k + 1}.vml"/>`)
        o.xml[o.xml.length - 1] = `<legacyDrawing r:id="rId${c + 1}"/></worksheet>`
        files.set(`xl/comments${k + 1}.xml`, commentsXml(o.notes))
        files.set(`xl/drawings/vmlDrawing${k + 1}.vml`, vmlXml(o.notes, block))
        block += Math.ceil((o.notes.length + 1) / 1024)
        overrides.push(`<Override PartName="/xl/comments${k + 1}.xml" ContentType="${SML}.comments+xml"/>`)
      }
      if (rels.length) files.set(`xl/worksheets/_rels/sheet${k + 1}.xml.rels`, `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`)
      files.set(path, o.xml.join(''))
    })

    const rel = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`
    const n = this.sheets.length
    files.set(
      '[Content_Types].xml',
      `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
        (vml ? '<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>' : '') +
        `<Override PartName="/xl/workbook.xml" ContentType="${SML}.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${SML}.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${SML}.sharedStrings+xml"/>` +
        this.sheets.map((_, k) => `<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="${SML}.worksheet+xml"/>`).join('') +
        overrides.join('') +
        '</Types>',
    )
    files.set('_rels/.rels', `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel('rId1', 'officeDocument', 'xl/workbook.xml')}</Relationships>`)
    const first = Math.min(this.firstTab, active)
    files.set(
      'xl/workbook.xml',
      `${XML_HEAD}<workbook ${NS}>${this.date1904 ? '<workbookPr date1904="1"/>' : ''}` +
        `<bookViews><workbookView${first > 0 && !states[first] ? ` firstSheet="${first}"` : ''} activeTab="${active}"/></bookViews><sheets>` +
        this.sheets.map((_, k) => `<sheet name="${escAttr(this.sheetNames[k])}" sheetId="${k + 1}"${states[k] === 2 ? ' state="veryHidden"' : states[k] ? ' state="hidden"' : ''} r:id="rId${k + 1}"/>`).join('') +
        '</sheets>' +
        this.definedNames(formulas) +
        // formulas the file has no results for: Excel computes them on load
        (outs.some((o) => o.uncached) ? '<calcPr fullCalcOnLoad="1"/>' : '') +
        '</workbook>',
    )
    files.set(
      'xl/_rels/workbook.xml.rels',
      `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        this.sheets.map((_, k) => rel(`rId${k + 1}`, 'worksheet', `worksheets/sheet${k + 1}.xml`)).join('') +
        rel(`rId${n + 1}`, 'styles', 'styles.xml') +
        rel(`rId${n + 2}`, 'sharedStrings', 'sharedStrings.xml') +
        '</Relationships>',
    )
    files.set('xl/styles.xml', styles.xml())
    files.set('xl/sharedStrings.xml', strings.xml())
    return writeZip(files, `${SML}.sheet`)
  }

  /** <definedNames>: the workbook's names that an XLSX workbook can hold */
  private definedNames(env: FormulaEnv): string {
    const seen = new Set<string>()
    const out: string[] = []
    for (const n of this.names) {
      // macro and function names, Excel 2007 function placeholders
      if (!n.name || n.flags & 0x0e || /^_xlfn\./i.test(n.name) || !n.rgce.length) continue
      const local = n.itab ? n.itab - 1 : undefined
      if (local !== undefined && local >= this.sheets.length) continue
      const key = `${n.name.toLowerCase()}|${local ?? ''}`
      if (seen.has(key)) continue
      let text: string
      try {
        text = formulaText(env, n.rgce, n.extra, 0, 0, true, local ?? -1)
      } catch {
        continue
      }
      seen.add(key)
      out.push(`<definedName name="${escAttr(n.name)}"${local !== undefined ? ` localSheetId="${local}"` : ''}${n.flags & 1 ? ' hidden="1"' : ''}>${xstr(text)}</definedName>`)
    }
    return out.length ? `<definedNames>${out.join('')}</definedNames>` : ''
  }
}

/** sharedStrings.xml: the workbook's SST (same indexes), then the strings of LABEL cells */
class SharedStrings {
  private extra = new Map<string, number>()
  private extraList: { text: string; runs?: number[] }[] = []

  constructor(
    private sst: { text: string; runs?: number[] }[],
    private styles: XlsxStyles,
  ) {}

  add(text: string, runs?: number[]): number {
    if (runs?.length) {
      this.extraList.push({ text, runs })
      return this.sst.length + this.extraList.length - 1
    }
    let id = this.extra.get(text)
    if (id === undefined) {
      id = this.sst.length + this.extraList.length
      this.extra.set(text, id)
      this.extraList.push({ text })
    }
    return id
  }

  private si(s: { text: string; runs?: number[] }): string {
    const t = (x: string) => `<t${/^\s|\s$|\n/.test(x) ? ' xml:space="preserve"' : ''}>${xstr(x)}</t>`
    const { text, runs } = s
    if (!runs?.length) return `<si>${t(text)}</si>`
    let xml = ''
    let at = 0
    let font = -1
    for (let k = 0; k <= runs.length; k += 2) {
      const next = k < runs.length ? Math.min(text.length, runs[k]) : text.length
      if (next > at) xml += font < 0 ? `<r>${t(text.slice(at, next))}</r>` : `<r>${this.styles.runProps(font)}${t(text.slice(at, next))}</r>`
      if (next >= at) at = next
      if (k < runs.length) font = runs[k + 1]
    }
    return `<si>${xml || t(text)}</si>`
  }

  xml(): string {
    const all = this.sst.length + this.extraList.length
    const parts = [`${XML_HEAD}<sst ${'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'} count="${all}" uniqueCount="${all}">`]
    for (let i = 0; i < this.sst.length; i += 4096) parts.push(this.sst.slice(i, i + 4096).map((s) => this.si(s)).join(''))
    parts.push(this.extraList.map((s) => this.si(s)).join(''))
    parts.push('</sst>')
    return parts.join('')
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** xl/commentsN.xml: the notes, their author's name in bold when the text starts with it */
function commentsXml(notes: Note[]): string {
  const authors: string[] = []
  const list = notes.map((n) => {
    let a = authors.indexOf(n.author)
    if (a < 0) a = authors.push(n.author) - 1
    const run = (text: string, bold: boolean) =>
      `<r><rPr>${bold ? '<b/>' : ''}<sz val="9"/><color indexed="81"/><rFont val="Tahoma"/><family val="2"/></rPr><t xml:space="preserve">${xstr(text)}</t></r>`
    const head = n.author && n.text.startsWith(n.author + ':') ? n.author.length + 1 : 0
    const body = (head ? run(n.text.slice(0, head), true) : '') + (n.text.length > head || !head ? run(n.text.slice(head), false) : '')
    return `<comment ref="${cellRef(n.r, n.c)}" authorId="${a}"><text>${body}</text></comment>`
  })
  return (
    `${XML_HEAD}<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors>${authors.map((a) => `<author>${xstr(a)}</author>`).join('')}</authors>` +
    `<commentList>${list.join('')}</commentList></comments>`
  )
}

const cellRef = (r: number, c: number) => {
  let s = ''
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s + (r + 1)
}

/** xl/drawings/vmlDrawingN.vml: the note boxes (Excel shows a comment from its shape); shape ids from block `block` on */
function vmlXml(notes: Note[], block: number): string {
  const shapes = notes.map(
    (n, i) =>
      `<v:shape id="_x0000_s${block * 1024 + i + 1}" type="#_x0000_t202" style="position:absolute;margin-left:59.25pt;margin-top:1.5pt;width:108pt;height:59.25pt;z-index:${i + 1};visibility:${n.show ? 'visible' : 'hidden'}" fillcolor="#ffffe1" o:insetmode="auto">` +
      '<v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox>' +
      `<x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>${n.c + 1}, 15, ${n.r}, 2, ${n.c + 3}, 15, ${n.r + 4}, 16</x:Anchor><x:AutoFill>False</x:AutoFill>` +
      `<x:Row>${n.r}</x:Row><x:Column>${n.c}</x:Column>${n.show ? '<x:Visible/>' : ''}</x:ClientData></v:shape>`,
  )
  return (
    '<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
    `<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="${Array.from({ length: Math.ceil((notes.length + 1) / 1024) }, (_, i) => block + i).join(',')}"/></o:shapelayout>` +
    '<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>' +
    shapes.join('') +
    '</xml>'
  )
}

/** Converts the workbook in a compound file to an XLSX file. */
export async function xlsToXlsx(cfb: Cfb): Promise<Blob> {
  const stream = cfb.stream('Workbook') ?? cfb.stream('Book')
  if (!stream) throw new Error('Not an Excel workbook (no Workbook stream)')
  return biffToXlsx(stream)
}

/** Converts a BIFF5 / BIFF8 workbook stream (the records, as some programs write them without a compound file) to an XLSX file. */
export function biffToXlsx(stream: Uint8Array): Promise<Blob> {
  return new XlsBook(stream).convert()
}
