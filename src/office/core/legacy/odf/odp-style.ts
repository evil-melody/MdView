/**
 * Presentation styles for the ODP → PPTX conversion: style chains merged into property groups, and the
 * DrawingML fills, lines and shadows of graphic properties (gradients, bitmaps, dashes and markers by name).
 */
import { escAttr } from '../../raw'
import { child, children, toHex, toPt, type ONode, type OdfPackage, type OdfStyles } from './common'

/** points → EMU, within the range of DrawingML coordinates */
export const emu = (pt: number) => (Number.isFinite(pt) ? Math.round(Math.max(-2147483647, Math.min(2147483647, pt * 12700))) : 0)

/** the property groups of a style with what it inherits */
export interface Props {
  /** graphic properties (also drawing-page and table-cell graphic properties) */
  g: Record<string, string>
  p: Record<string, string>
  t: Record<string, string>
  /** table column and row properties */
  c: Record<string, string>
  /** text:list-style inside the graphic properties (the bullets of presentation outline styles) */
  list?: ONode
  /** style:list-style-name of the style */
  listName?: string
}

export const noProps = (): Props => ({ g: {}, p: {}, t: {}, c: {} })

const GROUP: Record<string, 'g' | 'p' | 't' | 'c'> = {
  'style:graphic-properties': 'g',
  'loext:graphic-properties': 'g',
  'style:drawing-page-properties': 'g',
  'style:paragraph-properties': 'p',
  'style:text-properties': 't',
  'style:table-column-properties': 'c',
  'style:table-row-properties': 'c',
  'style:table-cell-properties': 'c',
}

/** attributes that stand for the same thing: the later style's wins */
const PAIRS: [string, string][] = [
  ['style:font-name', 'fo:font-family'],
  ['style:font-name-asian', 'style:font-family-asian'],
  ['style:font-name-complex', 'style:font-family-complex'],
]
const SIZES = ['fo:font-size', 'style:font-size-asian', 'style:font-size-complex']

/** merges attributes onto a group: relative font sizes apply to the inherited ones, automatic color resets a color */
function mergeAttrs(out: Record<string, string>, attrs: Record<string, string>) {
  for (const [a, b] of PAIRS) {
    if (a in attrs && !(b in attrs)) delete out[b]
    else if (b in attrs && !(a in attrs)) delete out[a]
  }
  if (attrs['style:use-window-font-color'] === 'true' && !('fo:color' in attrs)) delete out['fo:color']
  if ('fo:color' in attrs && !('style:use-window-font-color' in attrs)) delete out['style:use-window-font-color']
  for (const [k, v] of Object.entries(attrs)) {
    if (SIZES.includes(k) && v.endsWith('%')) {
      const base = toPt(out[k])
      const pct = parseFloat(v)
      if (base !== undefined && Number.isFinite(pct)) {
        out[k] = `${(base * pct) / 100}pt`
        continue
      }
    }
    out[k] = v
  }
}

/** merges the property groups of a style element onto `out` */
export function mergeStyle(out: Props, s: ONode): Props {
  if (s.attrs['style:list-style-name']) out.listName = s.attrs['style:list-style-name']
  for (const g of children(s)) {
    const key = GROUP[g.name]
    if (!key) continue
    mergeAttrs(out[key], g.attrs)
    if (key === 'g') {
      const list = child(g, 'text:list-style')
      if (list) out.list = list
    }
  }
  return out
}

/** `over` merged onto a copy of `base` */
export function overlay(base: Props, over: Props): Props {
  const out: Props = { g: { ...base.g }, p: { ...base.p }, t: { ...base.t }, c: { ...base.c }, list: base.list, listName: base.listName }
  mergeAttrs(out.g, over.g)
  mergeAttrs(out.p, over.p)
  mergeAttrs(out.t, over.t)
  mergeAttrs(out.c, over.c)
  if (over.list) out.list = over.list
  if (over.listName) out.listName = over.listName
  return out
}

/** the named fill, line and marker resources of office:styles, and the styles with their inheritance */
export class OdpStyles {
  readonly st: OdfStyles
  readonly gradients = new Map<string, ONode>()
  readonly hatches = new Map<string, ONode>()
  readonly fillImages = new Map<string, ONode>()
  readonly markers = new Map<string, ONode>()
  readonly dashes = new Map<string, ONode>()
  readonly opacities = new Map<string, ONode>()
  /** table templates by name */
  readonly templates = new Map<string, ONode>()
  private cache = new Map<string, Props>()
  private defaultCache = new Map<string, Props>()

  readonly stylesRoot?: ONode

  constructor(pkg: OdfPackage) {
    this.st = pkg.styles
    this.stylesRoot = pkg.stylesRoot
    const maps: Record<string, Map<string, ONode>> = {
      'draw:gradient': this.gradients,
      'draw:hatch': this.hatches,
      'draw:fill-image': this.fillImages,
      'draw:marker': this.markers,
      'draw:stroke-dash': this.dashes,
      'draw:opacity': this.opacities,
    }
    for (const root of [pkg.stylesRoot, pkg.content]) {
      for (const el of children(child(root, 'office:styles'))) {
        const map = maps[el.name]
        if (map && el.attrs['draw:name']) map.set(el.attrs['draw:name'], el)
        if (el.name === 'table:table-template') {
          const name = el.attrs['table:name'] ?? el.attrs['text:style-name'] ?? el.attrs['style:name']
          if (name) this.templates.set(name, el)
        }
      }
    }
  }

  /** a style element; on master pages the automatic styles of styles.xml come first */
  node(family: string, name: string | undefined, master: boolean): ONode | undefined {
    if (!name) return undefined
    const key = `${family}/${name}`
    return (master ? this.st.masterAuto.get(key) : undefined) ?? this.st.styles.get(key)
  }

  /** the merged properties of a style and its parents (not the family's default style) */
  props(family: string, name: string | undefined, master = false): Props {
    if (!name) return noProps()
    const key = `${master ? 'm' : 'c'}/${family}/${name}`
    let p = this.cache.get(key)
    if (p) return p
    const chain: ONode[] = []
    const seen = new Set<ONode>()
    for (let s = this.node(family, name, master); s && chain.length < 32 && !seen.has(s); s = this.st.get(family, s.attrs['style:parent-style-name'])) {
      seen.add(s)
      chain.push(s)
    }
    p = noProps()
    for (let i = chain.length - 1; i >= 0; i--) mergeStyle(p, chain[i])
    this.cache.set(key, p)
    return p
  }

  /** the default style of a family (presentation styles use the graphic one) */
  defaults(family: string): Props {
    const fam = family === 'presentation' ? 'graphic' : family
    let p = this.defaultCache.get(fam)
    if (!p) {
      const d = this.st.defaults.get(fam)
      p = d ? mergeStyle(noProps(), d) : noProps()
      this.defaultCache.set(fam, p)
    }
    return p
  }

  /** a style with its parents over the family's default style */
  full(family: string, name: string | undefined, master = false): Props {
    return overlay(this.defaults(family), this.props(family, name, master))
  }

  /** a list style by name (automatic list styles of styles.xml first on master pages) */
  list(name: string | undefined, master: boolean): ONode | undefined {
    if (!name) return undefined
    if (master) {
      const auto = this.masterLists.get(name)
      if (auto) return auto
    }
    return this.st.lists.get(name)
  }

  private _masterLists?: Map<string, ONode>
  private get masterLists(): Map<string, ONode> {
    if (!this._masterLists) {
      this._masterLists = new Map()
      for (const s of children(child(this.stylesRoot, 'office:automatic-styles'), 'text:list-style')) if (s.attrs['style:name']) this._masterLists.set(s.attrs['style:name'], s)
    }
    return this._masterLists
  }
}

// ---------------------------------------------------------------- colors

/** "50%" or "0.5" → 0…1 */
export function fraction(v: string | undefined): number | undefined {
  if (v === undefined) return undefined
  const n = parseFloat(v)
  if (!Number.isFinite(n)) return undefined
  return Math.min(1, Math.max(0, v.trim().endsWith('%') ? n / 100 : n))
}

export const clr = (hex: string, alpha?: number) =>
  alpha !== undefined && alpha < 100000 ? `<a:srgbClr val="${hex}"><a:alpha val="${Math.max(0, Math.round(alpha))}"/></a:srgbClr>` : `<a:srgbClr val="${hex}"/>`
export const solid = (hex: string, alpha?: number) => `<a:solidFill>${clr(hex, alpha)}</a:solidFill>`

/** a color scaled by an intensity ("80%") */
function intensity(hex: string, v: string | undefined): string {
  const f = fraction(v)
  if (f === undefined || f >= 1) return hex
  return [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** a dark color (automatic text white on it), as LibreOffice decides: luminance up to 156 of 255 */
export function isDark(hex: string): boolean {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const lum = (b * 29 + g * 151 + r * 76) >> 8
  // the default shape fill keeps black text
  return hex.toUpperCase() === '729FCF' ? lum <= 62 : lum <= 156
}

/** an angle in degrees: "30deg", "0.5rad", "45grad"; unitless values are tenths of a degree when `tenths` */
export function angleDeg(v: string | undefined, tenths = false): number {
  const m = /^\s*(-?[\d.]+(?:e-?\d+)?)\s*(deg|rad|grad)?\s*$/i.exec(v ?? '')
  if (!m) return 0
  const n = Number(m[1])
  if (!Number.isFinite(n)) return 0
  const unit = m[2]?.toLowerCase()
  return unit === 'rad' ? (n * 180) / Math.PI : unit === 'grad' ? n * 0.9 : unit === 'deg' || !tenths ? n : n / 10
}

// ---------------------------------------------------------------- fills

/** what fills and lines need from the converter */
export interface FillEnv {
  styles: OdpStyles
  /** relationship id of the image an element points to (draw:fill-image, draw:image), in the current part */
  image(el: ONode): Promise<{ rid: string; w?: number; h?: number } | undefined>
}

/** the opacity of the fill (0…100000), undefined when opaque */
function fillAlpha(g: Record<string, string>, styles: OdpStyles): number | undefined {
  let f = fraction(g['draw:opacity'])
  if (f === undefined && g['draw:transparency']) f = 1 - (fraction(g['draw:transparency']) ?? 0)
  const og = styles.opacities.get(g['draw:opacity-name'] ?? '')
  if (og) {
    // a transparency gradient (over the uniform opacity): its average
    const a = fraction(og.attrs['draw:start']) ?? 1
    const b = fraction(og.attrs['draw:end']) ?? 1
    f = (a + b) / 2
  }
  return f === undefined || f >= 1 ? undefined : Math.round(f * 100000)
}

/** a gradient stop: offset 0…1 from the start color, color, opacity 0…1 */
type Stop = [number, string, number]

/**
 * A gradient's geometry (draw:gradient or draw:opacity attributes: style, angle, border, center) with its
 * stops → a:gradFill.
 */
function gradFill(a: Record<string, string>, stops: Stop[]): string {
  const border = fraction(a['draw:border']) ?? 0
  const style = a['draw:style'] ?? 'linear'
  const gs = ([pos, c, op]: Stop) => `<a:gs pos="${Math.round(Math.min(1, Math.max(0, pos)) * 100000)}">${clr(c, op < 1 ? op * 100000 : undefined)}</a:gs>`
  const at = (pos: number, s: Stop): Stop => [pos, s[1], s[2]]
  let list: Stop[]
  if (style === 'linear') list = [...(border > 0 ? [at(0, stops[0])] : []), ...stops.map((s) => at(border + (1 - border) * s[0], s))]
  else if (style === 'axial') {
    // the start in the middle, the end (and the border) at both edges
    const end = stops[stops.length - 1]
    const left = stops.map((s) => at(0.5 - 0.5 * (1 - border) * s[0], s))
    list = [...(border > 0 ? [at(0, end)] : []), ...[...left].reverse(), ...left.map((s) => at(1 - s[0], s)), ...(border > 0 ? [at(1, end)] : [])]
  } else list = [...stops.map((s) => at((1 - border) * (1 - s[0]), s)).reverse(), at(1, stops[0])]
  const lst = `<a:gsLst>${list.map(gs).join('')}</a:gsLst>`
  if (style === 'linear' || style === 'axial') {
    // ODF: 0 runs top to bottom, angles turn counterclockwise; DrawingML: 0 runs left to right, clockwise
    const ang = (((90 - angleDeg(a['draw:angle'], true)) % 360) + 360) % 360
    return `<a:gradFill rotWithShape="1">${lst}<a:lin ang="${Math.round(ang * 60000)}" scaled="0"/></a:gradFill>`
  }
  const cx = Math.round((fraction(a['draw:cx']) ?? 0.5) * 100000)
  const cy = Math.round((fraction(a['draw:cy']) ?? 0.5) * 100000)
  const path = style === 'square' || style === 'rectangular' ? 'rect' : 'circle'
  return `<a:gradFill rotWithShape="1">${lst}<a:path path="${path}"><a:fillToRect l="${cx}" t="${cy}" r="${100000 - cx}" b="${100000 - cy}"/></a:path></a:gradFill>`
}

/** the colors of a draw:gradient: its stops (LibreOffice 7.6+) or start and end colors with their intensity */
function gradientColors(gr: ONode): [number, string][] {
  const stops = children(gr, 'loext:gradient-stop').flatMap((s) => {
    const c = toHex(s.attrs['loext:color-value'])
    const off = Number(s.attrs['svg:offset'])
    return c && Number.isFinite(off) ? [[Math.min(1, Math.max(0, off)), c] as [number, string]] : []
  })
  if (stops.length >= 2) return stops
  const a = gr.attrs
  return [
    [0, intensity(toHex(a['draw:start-color']) ?? '000000', a['draw:start-intensity'])],
    [1, intensity(toHex(a['draw:end-color']) ?? 'FFFFFF', a['draw:end-intensity'])],
  ]
}

/** draw:gradient → a:gradFill; its opacity uniform, or along a transparency gradient (draw:opacity: start, end) */
export function gradientXml(gr: ONode, alpha?: number, og?: ONode): string {
  const o0 = og ? (fraction(og.attrs['draw:start']) ?? 1) : (alpha ?? 100000) / 100000
  const o1 = og ? (fraction(og.attrs['draw:end']) ?? 1) : o0
  return gradFill(gr.attrs, gradientColors(gr).map(([o, c]) => [o, c, o0 + (o1 - o0) * o]))
}

/**
 * Graphic properties → DrawingML fill (undefined: none). `def` is the fill when draw:fill is not set: solid for
 * shapes, none for frames (text boxes, pictures).
 */
export async function fillXml(g: Record<string, string>, env: FillEnv, def: 'solid' | 'none', size?: [number, number]): Promise<string | undefined> {
  const kind = g['draw:fill'] ?? def
  const alpha = fillAlpha(g, env.styles)
  const color = toHex(g['draw:fill-color'])
  switch (kind) {
    case 'solid': {
      // a transparency gradient over the color
      const og = env.styles.opacities.get(g['draw:opacity-name'] ?? '')
      if (og) {
        const c = color ?? '729FCF'
        return gradFill(og.attrs, [
          [0, c, fraction(og.attrs['draw:start']) ?? 1],
          [1, c, fraction(og.attrs['draw:end']) ?? 1],
        ])
      }
      return solid(color ?? '729FCF', alpha)
    }
    case 'gradient': {
      const gr = env.styles.gradients.get(g['draw:fill-gradient-name'] ?? '')
      const og = env.styles.opacities.get(g['draw:opacity-name'] ?? '')
      return gr ? gradientXml(gr, alpha, og) : color ? solid(color, alpha) : undefined
    }
    case 'bitmap': {
      const el = env.styles.fillImages.get(g['draw:fill-image-name'] ?? '')
      const img = el ? await env.image(el) : undefined
      if (!img) return color ? solid(color, alpha) : undefined
      const blip = `<a:blip r:embed="${img.rid}">${alpha !== undefined ? `<a:alphaModFix amt="${alpha}"/>` : ''}</a:blip>`
      const repeat = g['style:repeat'] ?? 'repeat'
      // the image once, at its size, placed by its reference point
      if (repeat === 'no-repeat' && size && size[0] > 0 && size[1] > 0) {
        const len = (v: string | undefined, of: number, natural: number | undefined) => (v?.endsWith('%') ? (parseFloat(v) / 100) * of : toPt(v) || natural)
        const w = len(g['draw:fill-image-width'], size[0], img.w)
        const h = len(g['draw:fill-image-height'], size[1], img.h)
        if (w && h) {
          const ref = g['draw:fill-image-ref-point'] ?? 'center'
          const x = /left/.test(ref) ? 0 : /right/.test(ref) ? size[0] - w : (size[0] - w) / 2
          const y = /^top/.test(ref) ? 0 : /^bottom/.test(ref) ? size[1] - h : (size[1] - h) / 2
          const f = (v: number, of: number) => Math.round((v / of) * 100000)
          return `<a:blipFill dpi="0" rotWithShape="1">${blip}<a:srcRect/><a:stretch><a:fillRect l="${f(x, size[0])}" t="${f(y, size[1])}" r="${f(size[0] - x - w, size[0])}" b="${f(size[1] - y - h, size[1])}"/></a:stretch></a:blipFill>`
        }
      }
      if (repeat !== 'repeat') return `<a:blipFill dpi="0" rotWithShape="1">${blip}<a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill>`
      // tile scale: the image's size against the fill-image size
      const scale = (v: string | undefined, natural: number | undefined) => {
        const pt = v && !v.endsWith('%') ? toPt(v) : undefined
        if (v?.endsWith('%')) return Math.round(parseFloat(v) * 1000) || 100000
        return pt && natural ? Math.round((pt / natural) * 100000) : 100000
      }
      const sx = scale(g['draw:fill-image-width'], img.w)
      const sy = scale(g['draw:fill-image-height'], img.h)
      return `<a:blipFill dpi="0" rotWithShape="1">${blip}<a:srcRect/><a:tile tx="0" ty="0" sx="${sx}" sy="${sy}" flip="none" algn="tl"/></a:blipFill>`
    }
    case 'hatch': {
      // the lines blended into the background as the eye sees them: their share of the area
      const h = env.styles.hatches.get(g['draw:fill-hatch-name'] ?? '')
      const line = toHex(h?.attrs['draw:color']) ?? '000000'
      const gap = Math.max(0.5, toPt(h?.attrs['draw:distance']) ?? 3)
      const ways = { single: 1, double: 2, triple: 3 }[h?.attrs['draw:style'] ?? 'single'] ?? 1
      const cover = 1 - Math.pow(1 - Math.min(1, 0.75 / gap), ways)
      if (g['draw:fill-hatch-solid'] !== 'true') return solid(line, Math.round(cover * (alpha ?? 100000)))
      const bg = color ?? 'FFFFFF'
      const mix = [0, 2, 4].map((i) => Math.round(parseInt(bg.slice(i, i + 2), 16) * (1 - cover) + parseInt(line.slice(i, i + 2), 16) * cover).toString(16).padStart(2, '0')).join('').toUpperCase()
      return solid(mix, alpha)
    }
    default:
      return undefined
  }
}

// ---------------------------------------------------------------- lines

const decodeName = (s: string) => s.replace(/_([0-9a-f]{2})_/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))

/** a marker (line end) → DrawingML line end type */
function markerType(styles: OdpStyles, name: string | undefined): string | undefined {
  if (!name) return undefined
  const m = styles.markers.get(name)
  const label = decodeName(m?.attrs['draw:display-name'] ?? name)
  if (/circle|oval|ellipse|round/i.test(label)) return 'oval'
  if (/square|diamond|rhomb/i.test(label)) return 'diamond'
  if (/line arrow|concave|open|half|stealth/i.test(label)) return /concave|stealth/i.test(label) ? 'stealth' : 'arrow'
  if (/dimension|^line$|bar|slash/i.test(label)) return 'none'
  return 'triangle'
}

/** draw:stroke-dash → preset dash */
function dashPreset(d: ONode | undefined, w: number): string {
  if (!d) return 'dash'
  const unit = Math.max(w, 1)
  const len = (v: string | undefined, def: number) => (v?.trim().endsWith('%') ? (parseFloat(v) / 100) * unit : (toPt(v) ?? def))
  const n1 = Number(d.attrs['draw:dots1'] ?? 0) || 0
  const n2 = Number(d.attrs['draw:dots2'] ?? 0) || 0
  const l1 = len(d.attrs['draw:dots1-length'], unit) / unit
  const l2 = len(d.attrs['draw:dots2-length'], unit) / unit
  const gap = len(d.attrs['draw:distance'], unit) / unit
  const sys = gap <= 1.5
  if (n1 && n2) {
    const long = Math.max(l1, l2)
    if (n1 + n2 >= 3) return sys ? 'sysDashDotDot' : 'lgDashDotDot'
    return long >= 6 ? 'lgDashDot' : sys ? 'sysDashDot' : 'dashDot'
  }
  const l = n1 ? l1 : l2
  if (l <= 1.5) return sys ? 'sysDot' : 'dot'
  if (l >= 6) return 'lgDash'
  return sys ? 'sysDash' : 'dash'
}

/**
 * Graphic properties → a:ln. `def` is the stroke when draw:stroke is not set: solid for shapes and lines, none
 * for frames.
 */
export function lineXml(g: Record<string, string>, styles: OdpStyles, def: 'solid' | 'none'): string {
  const kind = g['draw:stroke'] ?? def
  if (kind === 'none') return '<a:ln><a:noFill/></a:ln>'
  const w = Math.max(0, toPt(g['svg:stroke-width']) ?? 0)
  const color = toHex(g['svg:stroke-color']) ?? '000000'
  const op = fraction(g['svg:stroke-opacity'])
  const alpha = op !== undefined && op < 1 ? Math.round(op * 100000) : undefined
  const cap = { round: 'rnd', square: 'sq', butt: 'flat' }[g['svg:stroke-linecap'] ?? ''] ?? undefined
  let x = solid(color, alpha)
  if (kind === 'dash') x += `<a:prstDash val="${dashPreset(styles.dashes.get(g['draw:stroke-dash'] ?? ''), w)}"/>`
  const join = g['draw:stroke-linejoin']
  if (join === 'round') x += '<a:round/>'
  else if (join === 'bevel') x += '<a:bevel/>'
  else if (join === 'miter') x += '<a:miter lim="800000"/>'
  const end = (tag: string, side: 'start' | 'end') => {
    const type = markerType(styles, g[`draw:marker-${side}`])
    if (!type || type === 'none') return ''
    // the marker size against the line width
    const mw = toPt(g[`draw:marker-${side}-width`]) ?? 0
    const ratio = mw / Math.max(w, 0.75)
    const size = ratio >= 5 ? 'lg' : ratio >= 3 ? 'med' : 'sm'
    return `<a:${tag} type="${type}" w="${size}" len="${size}"/>`
  }
  x += end('headEnd', 'start') + end('tailEnd', 'end')
  // a hairline (width 0) is drawn one pixel wide
  return `<a:ln w="${emu(w || 0.75)}"${cap ? ` cap="${cap}"` : ''}>${x}</a:ln>`
}

/** draw:shadow → a:effectLst (outer shadow), '' without one */
export function shadowXml(g: Record<string, string>): string {
  if (g['draw:shadow'] !== 'visible') return ''
  const dx = toPt(g['draw:shadow-offset-x']) ?? 0
  const dy = toPt(g['draw:shadow-offset-y']) ?? 0
  const color = toHex(g['draw:shadow-color']) ?? '808080'
  let op = fraction(g['draw:shadow-opacity'])
  if (op === undefined && g['draw:shadow-transparency']) op = 1 - (fraction(g['draw:shadow-transparency']) ?? 0)
  const blur = toPt(g['loext:shadow-blur']) ?? 0
  const dist = Math.hypot(dx, dy)
  const dir = (((Math.atan2(dy, dx) * 180) / Math.PI) % 360 + 360) % 360
  return (
    `<a:effectLst><a:outerShdw blurRad="${emu(blur)}" dist="${emu(dist)}" dir="${Math.round(dir * 60000)}" algn="tl" rotWithShape="0">` +
    `${clr(color, op !== undefined && op < 1 ? op * 100000 : undefined)}</a:outerShdw></a:effectLst>`
  )
}

/** a font family name for DrawingML: quotes and fallbacks dropped, metric-compatible Office fonts for the Liberation ones */
const FONT_ALIAS: Record<string, string> = {
  'liberation sans': 'Arial',
  'liberation serif': 'Times New Roman',
  'liberation mono': 'Courier New',
  'liberation sans narrow': 'Arial Narrow',
  carlito: 'Calibri',
  caladea: 'Cambria',
  arimo: 'Arial',
  tinos: 'Times New Roman',
  cousine: 'Courier New',
}

export function fontName(v: string | undefined): string | undefined {
  if (!v) return undefined
  const first = v.split(',')[0].trim().replace(/^['"]|['"]$/g, '').trim()
  if (!first) return undefined
  return FONT_ALIAS[first.toLowerCase()] ?? first
}

export const attr = (name: string, v: string | number | undefined) => (v === undefined ? '' : ` ${name}="${typeof v === 'number' ? v : escAttr(v)}"`)
