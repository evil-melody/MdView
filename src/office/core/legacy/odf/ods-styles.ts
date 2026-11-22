/**
 * OpenDocument cell styles (table-cell / text / paragraph properties and the data style) → the fonts, fills,
 * borders, number formats and cell formats of an XLSX styles.xml, each written once.
 */
import { escAttr } from '../../raw'
import { toHex, toPt, type OdfStyles, type StyleProps } from './common'
import { excelFormat } from './ods-format'

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'

export interface Font {
  name: string
  sz: number
  b?: boolean
  i?: boolean
  u?: 'single' | 'double'
  strike?: boolean
  va?: 'superscript' | 'subscript'
  color?: string
}

export interface Side {
  style: string
  color: string
}

export interface Look {
  font: Font
  fill?: string
  /** left, right, top, bottom, diagonal (with up / down) */
  borders: (Side | undefined)[]
  diagUp?: boolean
  diagDown?: boolean
  numFmt?: string
  h?: string
  v?: string
  wrap?: boolean
  shrink?: boolean
  rotate?: number
  indent?: number
}

/** an ODF border ("0.06pt solid #000000") as an Excel border side */
export function borderSide(v: string | undefined): Side | undefined {
  if (!v || v === 'none' || v === 'hidden') return undefined
  let width = 0.75
  let style = 'solid'
  let color = '000000'
  for (const t of v.trim().split(/\s+/)) {
    const pt = toPt(t)
    if (pt !== undefined) width = pt
    else if (/^#[0-9a-f]{6}$/i.test(t)) color = t.slice(1).toUpperCase()
    else if (/^[a-z-]+$/i.test(t)) style = t.toLowerCase()
  }
  if (style === 'none' || style === 'hidden' || width <= 0) return undefined
  const heavy = width >= 1.25
  let x: string
  switch (style) {
    case 'dotted':
      x = 'dotted'
      break
    case 'dashed':
    case 'fine-dashed':
    case 'dash':
      x = heavy ? 'mediumDashed' : 'dashed'
      break
    case 'dash-dot':
    case 'dot-dash':
      x = heavy ? 'mediumDashDot' : 'dashDot'
      break
    case 'dash-dot-dot':
    case 'dot-dot-dash':
      x = heavy ? 'mediumDashDotDot' : 'dashDotDot'
      break
    case 'double':
    case 'double-thin':
      x = 'double'
      break
    default:
      x = width >= 2.25 ? 'thick' : heavy ? 'medium' : 'thin'
  }
  return { style: x, color }
}

/** an ODF angle in degrees: "90", "90deg", "1.57rad", "100grad" */
function angle(v: string): number {
  const n = Number.parseFloat(v)
  if (!Number.isFinite(n)) return 0
  if (/rad\s*$/.test(v) && !/grad\s*$/.test(v)) return (n * 180) / Math.PI
  if (/grad\s*$/.test(v)) return n * 0.9
  return n
}

/** Excel text rotation from ODF degrees (counterclockwise, 0-360) */
function rotation(deg: number): number | undefined {
  const d = ((Math.round(deg) % 360) + 360) % 360
  if (!d) return undefined
  if (d <= 90) return d
  if (d >= 270) return 90 + (360 - d)
  return d <= 180 ? 90 : 180
}

const H: Record<string, string> = { start: 'left', left: 'left', end: 'right', right: 'right', center: 'center', justify: 'justify' }

/** the look of a cell style (its properties merged with those it inherits) */
export function lookOf(styles: OdfStyles, name: string | undefined, base: Font): Look {
  const p: StyleProps = styles.props('table-cell', name ?? 'Default')
  const tp = p['style:text-properties'] ?? {}
  const cp = p['style:table-cell-properties'] ?? {}
  const pp = p['style:paragraph-properties'] ?? {}
  const font: Font = { ...base }
  const fam = styles.font(tp['style:font-name']) ?? tp['fo:font-family']
  if (fam) font.name = fam.replace(/^['"]|['"]$/g, '')
  const sz = toPt(tp['fo:font-size'])
  if (sz && sz > 0 && sz < 410) font.sz = Math.round(sz * 2) / 2
  const w = tp['fo:font-weight']
  if (w) font.b = w === 'bold' || Number(w) >= 600
  const it = tp['fo:font-style']
  if (it) font.i = it === 'italic' || it === 'oblique'
  const us = tp['style:text-underline-style']
  if (us) font.u = us === 'none' ? undefined : tp['style:text-underline-type'] === 'double' ? 'double' : 'single'
  const ls = tp['style:text-line-through-style']
  if (ls) font.strike = ls !== 'none'
  const pos = tp['style:text-position']
  if (pos) {
    const m = /^(super|sub|-?[\d.]+%)/.exec(pos.trim())
    const v = m ? (m[1] === 'super' ? 1 : m[1] === 'sub' ? -1 : Number.parseFloat(m[1])) : 0
    font.va = v > 0 ? 'superscript' : v < 0 ? 'subscript' : undefined
  }
  if (tp['style:use-window-font-color'] === 'true') font.color = undefined
  else if (toHex(tp['fo:color'])) font.color = toHex(tp['fo:color'])
  const look: Look = { font, borders: [] }
  look.fill = toHex(cp['fo:background-color'])
  const all = borderSide(cp['fo:border'])
  look.borders = [
    cp['fo:border-left'] !== undefined ? borderSide(cp['fo:border-left']) : all,
    cp['fo:border-right'] !== undefined ? borderSide(cp['fo:border-right']) : all,
    cp['fo:border-top'] !== undefined ? borderSide(cp['fo:border-top']) : all,
    cp['fo:border-bottom'] !== undefined ? borderSide(cp['fo:border-bottom']) : all,
  ]
  const up = borderSide(cp['style:diagonal-bl-tr'])
  const down = borderSide(cp['style:diagonal-tl-br'])
  if (up || down) {
    look.borders[4] = up ?? down
    look.diagUp = !!up
    look.diagDown = !!down
  }
  if (cp['style:text-align-source'] !== 'value-type') look.h = H[pp['fo:text-align'] ?? '']
  if (cp['style:repeat-content'] === 'true') look.h = 'fill'
  const va = cp['style:vertical-align']
  if (va === 'top') look.v = 'top'
  else if (va === 'middle') look.v = 'center'
  if (cp['fo:wrap-option'] === 'wrap') look.wrap = true
  if (cp['style:shrink-to-fit'] === 'true') look.shrink = true
  if (cp['style:direction'] === 'ttb') look.rotate = 255
  else if (cp['style:rotation-angle']) look.rotate = rotation(angle(cp['style:rotation-angle']))
  const ml = toPt(pp['fo:margin-left'])
  if (ml && ml > 0 && look.h !== 'center') {
    look.indent = Math.min(15, Math.round(ml / 10))
    if (!look.indent) look.indent = undefined
    else look.h ??= 'left'
  }
  look.numFmt = excelFormat(styles, dataStyleOf(styles, name ?? 'Default'))
  return look
}

/** the data style of a cell style (style:data-style-name, from the style or what it inherits) */
export function dataStyleOf(styles: OdfStyles, name: string): string | undefined {
  for (const s of styles.chain('table-cell', name)) if (s.attrs['style:data-style-name']) return s.attrs['style:data-style-name']
  return undefined
}

/** styles.xml: fonts, fills, borders, number formats and cell formats, each written once */
export class StyleTable {
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

  /** the first cell format (and font) is the default one */
  constructor(base: Look) {
    this.xf(base)
  }

  private id(map: Map<string, number>, list: string[], xml: string, offset = 0): number {
    let id = map.get(xml)
    if (id === undefined) {
      id = list.length + offset
      map.set(xml, id)
      list.push(xml)
    }
    return id
  }

  private font(f: Font): number {
    let x = ''
    if (f.b) x += '<b/>'
    if (f.i) x += '<i/>'
    if (f.strike) x += '<strike/>'
    if (f.u) x += f.u === 'double' ? '<u val="double"/>' : '<u/>'
    if (f.va) x += `<vertAlign val="${f.va}"/>`
    x += `<sz val="${f.sz}"/>`
    if (f.color) x += `<color rgb="FF${f.color}"/>`
    // Excel takes font names of up to 31 characters
    x += `<name val="${escAttr(f.name.slice(0, 31))}"/>`
    return this.id(this.fonts, this.fontXml, `<font>${x}</font>`)
  }

  private fill(c: string | undefined): number {
    if (!c) return 0
    return this.id(this.fills, this.fillXml, `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`)
  }

  private border(l: Look): number {
    const side = (tag: string, s: Side | undefined) => (s ? `<${tag} style="${s.style}"><color rgb="FF${s.color}"/></${tag}>` : `<${tag}/>`)
    const b = l.borders
    const diag = (l.diagUp ? ' diagonalUp="1"' : '') + (l.diagDown ? ' diagonalDown="1"' : '')
    const xml = `<border${diag}>${side('left', b[0])}${side('right', b[1])}${side('top', b[2])}${side('bottom', b[3])}${side('diagonal', b[4])}</border>`
    if (xml === this.borderXml[0]) return 0
    return this.id(this.borders, this.borderXml, xml)
  }

  private numFmt(code: string | undefined): number {
    if (!code) return 0
    const id = this.id(this.formats, this.formatXml, code, 164)
    return id
  }

  /** index of the cell format with this look */
  xf(l: Look): number {
    const font = this.font(l.font)
    const fill = this.fill(l.fill)
    const border = this.border(l)
    const fmt = this.numFmt(l.numFmt)
    const al =
      (l.h ? ` horizontal="${l.h}"` : '') +
      (l.v ? ` vertical="${l.v}"` : '') +
      (l.rotate ? ` textRotation="${l.rotate}"` : '') +
      (l.wrap ? ' wrapText="1"' : '') +
      (l.indent ? ` indent="${l.indent}"` : '') +
      (l.shrink ? ' shrinkToFit="1"' : '')
    const xml =
      `<xf numFmtId="${fmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"` +
      `${fmt ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}${fill ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''}` +
      (al ? ` applyAlignment="1"><alignment${al}/></xf>` : '/>')
    return this.id(this.xfs, this.xfXml, xml)
  }

  xml(): string {
    const formats = [...this.formats].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${escAttr(code)}"/>`)
    return (
      `${XML_HEAD}<styleSheet ${NS}>` +
      (formats.length ? `<numFmts count="${formats.length}">${formats.join('')}</numFmts>` : '') +
      `<fonts count="${this.fontXml.length}">${this.fontXml.join('')}</fonts>` +
      `<fills count="${this.fillXml.length}">${this.fillXml.join('')}</fills>` +
      `<borders count="${this.borderXml.length}">${this.borderXml.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfXml.length}">${this.xfXml.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    )
  }
}

/** cell formats of ODF cell styles (with a fallback number format for values whose style has none) */
export class CellFormats {
  readonly table: StyleTable
  readonly base: Font
  private looks = new Map<string, Look>()
  private cache = new Map<string, number>()

  constructor(private styles: OdfStyles) {
    const def = lookOf(styles, 'Default', { name: 'Liberation Sans', sz: 10 })
    this.base = def.font
    this.looks.set('Default', def)
    this.table = new StyleTable(def)
  }

  look(name: string): Look {
    let l = this.looks.get(name)
    if (!l) this.looks.set(name, (l = lookOf(this.styles, name, this.base)))
    return l
  }

  /** whether a style gives a value a number format */
  hasFormat(name: string): boolean {
    return !!this.look(name).numFmt
  }

  /**
   * The cell format index of a style, `fallback` being the number format to use when the style has none;
   * `wrap` for text of several lines (shown so even when the style does not wrap).
   */
  xf(name: string, fallback?: string, wrap = false): number {
    const key = fallback || wrap ? `${name}\u0000${fallback ?? ''}\u0000${wrap}` : name
    let id = this.cache.get(key)
    if (id === undefined) {
      let l = this.look(name)
      if (fallback && !l.numFmt) l = { ...l, numFmt: fallback }
      if (wrap && !l.wrap && l.h !== 'fill') l = { ...l, wrap: true }
      id = this.table.xf(l)
      this.cache.set(key, id)
    }
    return id
  }
}
