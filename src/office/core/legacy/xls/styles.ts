/** BIFF cell formats (FONT, FORMAT, XF, PALETTE records) → the XLSX styles part. */
import { applyTint, INDEXED } from '../../color'
import { escAttr } from '../../raw'

export interface Font {
  /** twips */
  height: number
  italic: boolean
  strike: boolean
  outline: boolean
  shadow: boolean
  /** color index */
  color: number
  weight: number
  /** 0 none, 1 superscript, 2 subscript */
  script: number
  underline: number
  family: number
  charset: number
  name: string
}

export interface Xf {
  font: number
  fmt: number
  locked: boolean
  hidden: boolean
  style: boolean
  hAlign: number
  wrap: boolean
  vAlign: number
  rotation: number
  indent: number
  shrink: boolean
  readingOrder: number
  /** line styles left, right, top, bottom, diagonal */
  lines: number[]
  /** line colors left, right, top, bottom, diagonal */
  lineColors: number[]
  /** 1 down (top-left to bottom-right), 2 up */
  diagonal: number
  pattern: number
  fore: number
  back: number
  /** XFEXT colors ('RRGGBB') by extension type: 4 fill, 5 pattern background, 7-11 top / bottom / left / right / diagonal line, 13 text */
  ext?: Map<number, string>
}

const u16 = (b: Uint8Array, o: number) => (o + 1 < b.length ? b[o] | (b[o + 1] << 8) : 0)
const u32 = (b: Uint8Array, o: number) => (u16(b, o) + u16(b, o + 2) * 0x10000) >>> 0

/** a FONT record (the name read by the caller) */
export function readFont(b: Uint8Array, name: string): Font {
  const grbit = u16(b, 2)
  return {
    height: u16(b, 0),
    italic: !!(grbit & 2),
    strike: !!(grbit & 8),
    outline: !!(grbit & 16),
    shadow: !!(grbit & 32),
    color: u16(b, 4),
    weight: u16(b, 6),
    script: u16(b, 8),
    underline: b[10] ?? 0,
    family: b[11] ?? 0,
    charset: b[12] ?? 0,
    name,
  }
}

/** an XF record: 20 bytes in BIFF8, 16 in BIFF5 */
export function readXf(b: Uint8Array, biff: 5 | 8): Xf {
  const prot = u16(b, 4)
  const al = b[6] ?? 0
  const xf: Xf = {
    font: u16(b, 0),
    fmt: u16(b, 2),
    locked: !!(prot & 1),
    hidden: !!(prot & 2),
    style: !!(prot & 4),
    hAlign: al & 7,
    wrap: !!(al & 8),
    vAlign: (al >> 4) & 7,
    rotation: 0,
    indent: 0,
    shrink: false,
    readingOrder: 0,
    lines: [0, 0, 0, 0, 0],
    lineColors: [64, 64, 64, 64, 64],
    diagonal: 0,
    pattern: 0,
    fore: 64,
    back: 65,
  }
  if (biff === 8) {
    xf.rotation = b[7] ?? 0
    const ind = b[8] ?? 0
    xf.indent = ind & 15
    xf.shrink = !!(ind & 16)
    xf.readingOrder = (ind >> 6) & 3
    const b1 = u32(b, 10)
    const b2 = u32(b, 14)
    const fill = u16(b, 18)
    xf.lines = [b1 & 15, (b1 >> 4) & 15, (b1 >> 8) & 15, (b1 >> 12) & 15, (b2 >>> 21) & 15]
    xf.lineColors = [(b1 >> 16) & 0x7f, (b1 >> 23) & 0x7f, b2 & 0x7f, (b2 >> 7) & 0x7f, (b2 >> 14) & 0x7f]
    xf.diagonal = (b1 >>> 30) & 3
    xf.pattern = (b2 >>> 26) & 0x3f
    xf.fore = fill & 0x7f
    xf.back = (fill >> 7) & 0x7f
  } else {
    // orientation: none, stacked, 90° counterclockwise, 90° clockwise
    xf.rotation = [0, 255, 90, 180][(b[7] ?? 0) & 3]
    const f = u32(b, 8)
    const l = u32(b, 12)
    xf.fore = f & 0x7f
    xf.back = (f >> 7) & 0x7f
    xf.pattern = (f >> 16) & 0x3f
    xf.lines = [(l >> 3) & 7, (l >> 6) & 7, l & 7, (f >> 22) & 7, 0]
    xf.lineColors = [(l >> 16) & 0x7f, (l >> 23) & 0x7f, (l >> 9) & 0x7f, (f >>> 25) & 0x7f, 64]
  }
  return xf
}

/** the colors of the color indexes: 8 fixed, 56 in the palette (PALETTE changes them) */
export class Palette {
  readonly colors = INDEXED.map((c) => c.slice(1).toUpperCase())

  /** a PALETTE record */
  read(b: Uint8Array) {
    const n = Math.min(56, u16(b, 0))
    for (let i = 0; i < n && 2 + i * 4 + 3 <= b.length; i++) {
      const o = 2 + i * 4
      this.colors[8 + i] = [b[o], b[o + 1], b[o + 2]].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()
    }
  }

  /** 'RRGGBB', or undefined for the system / automatic colors */
  rgb(icv: number): string | undefined {
    return icv < 64 ? this.colors[icv] : undefined
  }
}

const H_ALIGN = ['general', 'left', 'center', 'right', 'fill', 'justify', 'centerContinuous', 'distributed']
const V_ALIGN = ['top', 'center', 'bottom', 'justify', 'distributed']
const LINE = ['', 'thin', 'medium', 'dashed', 'dotted', 'thick', 'double', 'hair', 'mediumDashed', 'dashDot', 'mediumDashDot', 'dashDotDot', 'mediumDashDotDot', 'slantDashDot']
const PATTERN = [
  'none', 'solid', 'mediumGray', 'darkGray', 'lightGray', 'darkHorizontal', 'darkVertical', 'darkDown', 'darkUp', 'darkGrid',
  'darkTrellis', 'lightHorizontal', 'lightVertical', 'lightDown', 'lightUp', 'lightGrid', 'lightTrellis', 'gray125', 'gray0625',
]
const UNDERLINE: Record<number, string> = { 1: 'single', 2: 'double', 0x21: 'singleAccounting', 0x22: 'doubleAccounting' }
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'

/** styles.xml from the workbook's fonts, formats and XFs; each font, fill, border and cell format written once */
export class XlsxStyles {
  private fontIds = new Map<string, number>()
  private fontXml: string[] = []
  private fillIds = new Map<string, number>()
  private fillXml = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']
  private borderIds = new Map<string, number>()
  private borderXml = ['<border><left/><right/><top/><bottom/><diagonal/></border>']
  private xfIds = new Map<string, number>()
  private xfXml: string[] = []
  /** BIFF XF index → cellXfs index */
  private map: (number | undefined)[] = []

  constructor(
    private fonts: Font[],
    private xfs: Xf[],
    private formats: Map<number, string>,
    private palette: Palette,
  ) {
    this.fontId(0)
    // the default cell format (XF 15 in Excel's files) is cellXfs 0
    const def = xfs.length > 15 && !xfs[15].style ? 15 : Math.max(0, xfs.findIndex((x) => !x.style))
    this.cell(def)
    if (!this.xfXml.length) this.xfXml.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>')
  }

  /** a BIFF font index (index 4 is never used: 5 and above count from 4) */
  private font(i: number): Font | undefined {
    return this.fonts[i >= 4 ? i - 1 : i] ?? this.fonts[0]
  }

  private color(icv: number, tag: string): string {
    const rgb = this.palette.rgb(icv)
    return rgb ? `<${tag} rgb="FF${rgb}"/>` : ''
  }

  private fontId(i: number, colorOverride?: string): number {
    const f = this.font(i)
    if (!f) {
      if (!this.fontXml.length) this.fontXml.push('<font><sz val="10"/><name val="Arial"/></font>')
      return 0
    }
    let x = ''
    if (f.weight >= 600) x += '<b/>'
    if (f.italic) x += '<i/>'
    if (f.strike) x += '<strike/>'
    if (f.outline) x += '<outline/>'
    if (f.shadow) x += '<shadow/>'
    if (UNDERLINE[f.underline]) x += `<u${f.underline === 1 ? '' : ` val="${UNDERLINE[f.underline]}"`}/>`
    if (f.script === 1 || f.script === 2) x += `<vertAlign val="${f.script === 1 ? 'superscript' : 'subscript'}"/>`
    x += `<sz val="${+(f.height / 20).toFixed(2) || 10}"/>`
    x += colorOverride ? `<color rgb="FF${colorOverride}"/>` : this.color(f.color, 'color')
    x += `<name val="${escAttr(f.name.slice(0, 31) || 'Arial')}"/>`
    if (f.family && f.family <= 5) x += `<family val="${f.family}"/>`
    if (f.charset > 1) x += `<charset val="${f.charset}"/>`
    const xml = `<font>${x}</font>`
    let id = this.fontIds.get(xml)
    if (id === undefined) {
      id = this.fontXml.length
      this.fontIds.set(xml, id)
      this.fontXml.push(xml)
    }
    return id
  }

  /** the run properties of rich text in a font */
  runProps(i: number): string {
    const f = this.font(i)
    if (!f) return ''
    let x = `<rFont val="${escAttr(f.name.slice(0, 31) || 'Arial')}"/>`
    if (f.charset > 1) x += `<charset val="${f.charset}"/>`
    if (f.family && f.family <= 5) x += `<family val="${f.family}"/>`
    if (f.weight >= 600) x += '<b/>'
    if (f.italic) x += '<i/>'
    if (f.strike) x += '<strike/>'
    if (f.outline) x += '<outline/>'
    if (f.shadow) x += '<shadow/>'
    x += this.color(f.color, 'color')
    x += `<sz val="${+(f.height / 20).toFixed(2) || 10}"/>`
    if (UNDERLINE[f.underline]) x += `<u${f.underline === 1 ? '' : ` val="${UNDERLINE[f.underline]}"`}/>`
    if (f.script === 1 || f.script === 2) x += `<vertAlign val="${f.script === 1 ? 'superscript' : 'subscript'}"/>`
    return `<rPr>${x}</rPr>`
  }

  private fillId(xf: Xf): number {
    if (!xf.pattern || xf.pattern >= PATTERN.length) return 0
    const fg = xf.ext?.get(4) ?? this.palette.rgb(xf.fore)
    const bg = xf.ext?.get(5) ?? this.palette.rgb(xf.back)
    const xml =
      `<fill><patternFill patternType="${PATTERN[xf.pattern]}">` +
      (fg ? `<fgColor rgb="FF${fg}"/>` : '<fgColor indexed="64"/>') +
      (bg ? `<bgColor rgb="FF${bg}"/>` : '<bgColor indexed="65"/>') +
      '</patternFill></fill>'
    let id = this.fillIds.get(xml)
    if (id === undefined) {
      id = this.fillXml.length
      this.fillIds.set(xml, id)
      this.fillXml.push(xml)
    }
    return id
  }

  private borderId(xf: Xf): number {
    const side = (tag: string, k: number) => {
      const style = LINE[xf.lines[k]]
      if (!style) return `<${tag}/>`
      const rgb = xf.ext?.get([9, 10, 7, 8, 11][k]) ?? this.palette.rgb(xf.lineColors[k])
      return `<${tag} style="${style}">${rgb ? `<color rgb="FF${rgb}"/>` : '<color auto="1"/>'}</${tag}>`
    }
    const diag = xf.diagonal && LINE[xf.lines[4]] ? xf.diagonal : 0
    const xml =
      `<border${diag & 2 ? ' diagonalUp="1"' : ''}${diag & 1 ? ' diagonalDown="1"' : ''}>` +
      side('left', 0) + side('right', 1) + side('top', 2) + side('bottom', 3) + (diag ? side('diagonal', 4) : '<diagonal/>') +
      '</border>'
    if (xml === this.borderXml[0]) return 0
    let id = this.borderIds.get(xml)
    if (id === undefined) {
      id = this.borderXml.length
      this.borderIds.set(xml, id)
      this.borderXml.push(xml)
    }
    return id
  }

  /** the cellXfs index of a BIFF XF index */
  cell(i: number): number {
    const known = this.map[i]
    if (known !== undefined) return known
    const xf = this.xfs[i]
    if (!xf) return 0
    const fmt = this.formats.has(xf.fmt) || xf.fmt < 164 ? xf.fmt : 0
    const font = this.fontId(xf.font, xf.ext?.get(13))
    const fill = this.fillId(xf)
    const border = this.borderId(xf)
    let al = ''
    if (xf.hAlign) al += ` horizontal="${H_ALIGN[xf.hAlign]}"`
    if (xf.vAlign !== 2 && V_ALIGN[xf.vAlign]) al += ` vertical="${V_ALIGN[xf.vAlign]}"`
    if (xf.wrap) al += ' wrapText="1"'
    if (xf.rotation && (xf.rotation <= 180 || xf.rotation === 255)) al += ` textRotation="${xf.rotation}"`
    if (xf.indent) al += ` indent="${xf.indent}"`
    if (xf.shrink) al += ' shrinkToFit="1"'
    if (xf.readingOrder === 1 || xf.readingOrder === 2) al += ` readingOrder="${xf.readingOrder}"`
    const prot = (xf.locked ? '' : ' locked="0"') + (xf.hidden ? ' hidden="1"' : '')
    const inner = (al ? `<alignment${al}/>` : '') + (prot ? `<protection${prot}/>` : '')
    const xml =
      `<xf numFmtId="${fmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"` +
      `${fmt ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}${fill ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''}` +
      `${al ? ' applyAlignment="1"' : ''}${prot ? ' applyProtection="1"' : ''}` +
      (inner ? `>${inner}</xf>` : '/>')
    let id = this.xfIds.get(xml)
    if (id === undefined) {
      id = this.xfXml.length
      this.xfIds.set(xml, id)
      this.xfXml.push(xml)
    }
    this.map[i] = id
    return id
  }

  xml(): string {
    const fmts = [...this.formats].filter(([id]) => id > 0 && id < 0x10000)
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet ${NS}>` +
      (fmts.length ? `<numFmts count="${fmts.length}">${fmts.map(([id, code]) => `<numFmt numFmtId="${id}" formatCode="${escAttr(code)}"/>`).join('')}</numFmts>` : '') +
      `<fonts count="${this.fontXml.length}">${this.fontXml.join('')}</fonts>` +
      `<fills count="${this.fillXml.length}">${this.fillXml.join('')}</fills>` +
      `<borders count="${this.borderXml.length}">${this.borderXml.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfXml.length}">${this.xfXml.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    )
  }
}

/** Office 2007's theme colors, the theme of workbooks that do not have their own */
const OFFICE_2007: Record<string, string> = {
  dk1: '000000', lt1: 'FFFFFF', dk2: '1F497D', lt2: 'EEECE1', accent1: '4F81BD', accent2: 'C0504D', accent3: '9BBB59',
  accent4: '8064A2', accent5: '4BACC6', accent6: 'F79646', hlink: '0000FF', folHlink: '800080',
}
/** theme color indexes as Excel numbers them (light and dark swapped) */
const THEME_ORDER = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']

/** an XFEXT record (Excel 2007+): the full colors of an XF, which keeps the nearest palette color */
export function readXfExt(b: Uint8Array, xfs: Xf[], palette: Palette, theme: Record<string, string> = OFFICE_2007): void {
  if (b.length < 20) return
  const xf = xfs[u16(b, 14)]
  if (!xf) return
  const count = u16(b, 18)
  let p = 20
  for (let k = 0; k < count && p + 4 <= b.length; k++) {
    const type = u16(b, p)
    const cb = u16(b, p + 2)
    if (cb < 4) break
    if ([4, 5, 7, 8, 9, 10, 11, 13].includes(type) && p + 16 <= b.length) {
      const kind = u16(b, p + 4)
      const tint = (u16(b, p + 6) << 16) >> 16
      const v = u32(b, p + 8)
      let hex: string | undefined
      if (kind === 1) hex = palette.rgb(v)
      else if (kind === 2) hex = [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()
      else if (kind === 3) hex = theme[THEME_ORDER[v]]
      if (hex) {
        if (tint) hex = applyTint('#' + hex, tint / 32767).slice(1).toUpperCase()
        ;(xf.ext ??= new Map()).set(type, hex)
      }
    }
    p += cb
  }
}

/** the colors of a theme part (theme1.xml), as 'RRGGBB' by name */
export function themeColors(xml: string): Record<string, string> {
  const out = { ...OFFICE_2007 }
  const scheme = /<(?:\w+:)?clrScheme\b[\s\S]*?<\/(?:\w+:)?clrScheme>/.exec(xml)?.[0] ?? ''
  for (const name of Object.keys(out)) {
    const m = new RegExp(`<(?:\\w+:)?${name}>\\s*<(?:\\w+:)?(?:srgbClr|sysClr)\\b([^>]*)`).exec(scheme)
    const hex = m && /\b(?:lastClr|val)="([0-9A-Fa-f]{6})"/.exec(m[1])?.[1]
    if (hex) out[name] = hex.toUpperCase()
  }
  return out
}
