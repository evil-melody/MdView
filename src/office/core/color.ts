import { kid, kids, num, type XEl } from './xml'
import type { Theme } from './theme'

export type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const v = h.length === 8 ? h.slice(2) : h.padStart(6, '0').slice(0, 6)
  return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0]
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')
  return '#' + c(r) + c(g) + c(b)
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h / 6, s, l]
}

export function hslToRgb([h, s, l]: [number, number, number]): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/** Excel/Word style tint (-1..1) applied in HSL luminance. */
export function applyTint(hex: string, tint: number): string {
  if (!tint) return hex
  const hsl = rgbToHsl(hexToRgb(hex))
  hsl[2] = tint < 0 ? hsl[2] * (1 + tint) : hsl[2] * (1 - tint) + tint
  return rgbToHex(hslToRgb(hsl))
}

const PRESET: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  cyan: '#00ffff', magenta: '#ff00ff', gray: '#808080', grey: '#808080', ltGray: '#d3d3d3', dkGray: '#a9a9a9',
  orange: '#ffa500', purple: '#800080', navy: '#000080', maroon: '#800000', olive: '#808000', teal: '#008080',
  silver: '#c0c0c0', lime: '#00ff00', pink: '#ffc0cb', brown: '#a52a2a', gold: '#ffd700',
}

export interface ColorCtx {
  theme?: Theme
  /** pptx clrMap: bg1→lt1 … */
  clrMap?: Record<string, string>
  /** Placeholder color for style matrix references. */
  phClr?: string
}

const DEFAULT_MAP: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }

export const COLOR_TAGS = new Set(['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'])

/** Resolves a DrawingML color element (srgbClr, schemeClr, …) to a CSS color. */
export function drawingColor(el: XEl, ctx: ColorCtx): string | undefined {
  let hex: string | undefined
  switch (el.n) {
    case 'srgbClr':
      hex = '#' + (el.a.val ?? '000000').toLowerCase()
      break
    case 'sysClr':
      hex = '#' + (el.a.lastClr ?? (el.a.val === 'window' ? 'ffffff' : '000000'))
      break
    case 'prstClr':
      hex = PRESET[el.a.val] ?? '#000000'
      break
    case 'scrgbClr':
      hex = rgbToHex([
        ((num(el.a.r) ?? 0) / 100000) * 255,
        ((num(el.a.g) ?? 0) / 100000) * 255,
        ((num(el.a.b) ?? 0) / 100000) * 255,
      ])
      break
    case 'hslClr':
      hex = rgbToHex(hslToRgb([(num(el.a.hue) ?? 0) / 21600000, (num(el.a.sat) ?? 0) / 100000, (num(el.a.lum) ?? 0) / 100000]))
      break
    case 'schemeClr': {
      const v = el.a.val
      if (v === 'phClr') hex = ctx.phClr
      else {
        const mapped = ctx.clrMap?.[v] ?? DEFAULT_MAP[v] ?? v
        hex = ctx.theme?.colors[mapped] ?? ctx.theme?.colors[v]
      }
      break
    }
  }
  if (!hex) return undefined
  return applyMods(hex, el)
}

function applyMods(hex: string, el: XEl): string {
  if (!el.c.length) return hex
  let rgb = hexToRgb(hex)
  let alpha = 1
  for (const m of el.c) {
    const v = (num(m.a.val) ?? 0) / 100000
    switch (m.n) {
      case 'alpha':
        alpha = v
        break
      case 'lumMod': {
        const hsl = rgbToHsl(rgb)
        hsl[2] = clamp01(hsl[2] * v)
        rgb = hslToRgb(hsl)
        break
      }
      case 'lumOff': {
        const hsl = rgbToHsl(rgb)
        hsl[2] = clamp01(hsl[2] + v)
        rgb = hslToRgb(hsl)
        break
      }
      case 'satMod': {
        const hsl = rgbToHsl(rgb)
        hsl[1] = clamp01(hsl[1] * v)
        rgb = hslToRgb(hsl)
        break
      }
      case 'tint':
        rgb = rgb.map((c) => c + (255 - c) * (1 - v)) as RGB
        break
      case 'shade':
        rgb = rgb.map((c) => c * v) as RGB
        break
      case 'inv':
        rgb = rgb.map((c) => 255 - c) as RGB
        break
      case 'gray': {
        const g = rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11
        rgb = [g, g, g]
        break
      }
    }
  }
  const out = rgbToHex(rgb)
  if (alpha >= 1) return out
  const [r, g, b] = hexToRgb(out)
  return `rgba(${r},${g},${b},${+alpha.toFixed(3)})`
}

/** First color child of a fill-ish element (solidFill, fgClr, …). */
export function colorOf(parent: XEl | undefined, ctx: ColorCtx): string | undefined {
  if (!parent) return undefined
  for (const c of parent.c) if (COLOR_TAGS.has(c.n)) return drawingColor(c, ctx)
  return undefined
}

// SpreadsheetML legacy indexed palette
export const INDEXED = (
  '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF ' +
  '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 800000 008000 000080 808000 800080 008080 C0C0C0 808080 ' +
  '9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF 000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF ' +
  '00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 ' +
  '003366 339966 003300 333300 993300 993366 333399 333333'
)
  .split(' ')
  .map((h) => '#' + h)

const XL_THEME_ORDER = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']

/** SpreadsheetML <color rgb|theme|indexed tint>. */
export function sheetColor(el: XEl | undefined, theme: Theme | undefined, indexed: string[] = INDEXED): string | undefined {
  if (!el || el.a.auto === '1' || el.a.auto === 'true') return undefined
  let hex: string | undefined
  if (el.a.rgb) {
    const v = el.a.rgb
    hex = '#' + (v.length === 8 ? v.slice(2) : v)
  } else if (el.a.theme !== undefined) {
    hex = theme?.colors[XL_THEME_ORDER[Number(el.a.theme)] ?? ''] ?? undefined
  } else if (el.a.indexed !== undefined) {
    const i = Number(el.a.indexed)
    if (i === 64 || i === 65) return undefined
    hex = indexed[i]
  }
  if (!hex) return undefined
  const tint = num(el.a.tint) ?? 0
  return tint ? applyTint(hex, tint) : hex.toLowerCase()
}

export function customIndexed(stylesRoot: XEl | undefined): string[] {
  const list = kids(kid(kid(stylesRoot, 'colors'), 'indexedColors'), 'rgbColor')
  if (!list.length) return INDEXED
  return list.map((c) => '#' + (c.a.rgb ?? 'FF000000').slice(-6))
}
