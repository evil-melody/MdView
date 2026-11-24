import { kid, kids, num, type XEl } from './xml'
import { applyMods as applyModsByte, applySheetTint, hslToRgb01, type Theme } from './theme'

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

// HSL 换算不再在本文件另开一套（曾经这里是 0..1 值域 + Math.round，与
// theme.ts 的 sdkjs 字节管线并存，同一颜色两条路会出差值）。对外签名保留
// 0..1 形态给 hslClr 用，内部全部经 theme.ts 的 0..255 / clampColor 实现。

/** Excel tint (-1..1) —— 复用 theme.ts 的 HSL 亮度族运算（0..255 值域 + clampColor） */
export function applyTint(hex: string, tint: number): string {
  if (!tint) return hex
  return rgbToHex(applySheetTint(hexToRgb(hex), tint))
}

// ECMA-376 ST_PresetColorVal 全表 —— 逐条取自 sdkjs map_prst_color
// （common/Drawings/Format/Format.js:1720-1910，共 190 项）。
// 旧实现只挂了 24 项子集，未命中的预设名（darkRed / royalBlue / hotPink …）
// 一律被兜成黑色；现在未命中返回 undefined，由调用方决定是否回退。
const PRST_RAW = (
  'aliceBlue f0f8ff antiqueWhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff ' +
  'beige f5f5dc bisque ffe4c4 black 000000 blanchedAlmond ffebcd blue 0000ff ' +
  'blueViolet 8a2be2 brown a52a2a burlyWood deb887 cadetBlue 5f9ea0 chartreuse 7fff00 ' +
  'chocolate d2691e coral ff7f50 cornflowerBlue 6495ed cornsilk fff8dc crimson dc143c ' +
  'cyan 00ffff darkBlue 00008b darkCyan 008b8b darkGoldenrod b8860b darkGray a9a9a9 ' +
  'darkGreen 006400 darkGrey a9a9a9 darkKhaki bdb76b darkMagenta 8b008b darkOliveGreen 556b2f ' +
  'darkOrange ff8c00 darkOrchid 9932cc darkRed 8b0000 darkSalmon e9967a darkSeaGreen 8fbc8f ' +
  'darkSlateBlue 483d8b darkSlateGray 2f4f4f darkSlateGrey 2f4f4f darkTurquoise 00ced1 darkViolet 9400d3 ' +
  'deepPink ff1493 deepSkyBlue 00bfff dimGray 696969 dimGrey 696969 dkBlue 00008b ' +
  'dkCyan 008b8b dkGoldenrod b8860b dkGray a9a9a9 dkGreen 006400 dkGrey a9a9a9 ' +
  'dkKhaki bdb76b dkMagenta 8b008b dkOliveGreen 556b2f dkOrange ff8c00 dkOrchid 9932cc ' +
  'dkRed 8b0000 dkSalmon e9967a dkSeaGreen 8fbc8b dkSlateBlue 483d8b dkSlateGray 2f4f4f ' +
  'dkSlateGrey 2f4f4f dkTurquoise 00ced1 dkViolet 9400d3 dodgerBlue 1e90ff firebrick b22222 ' +
  'floralWhite fffaf0 forestGreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostWhite f8f8ff ' +
  'gold ffd700 goldenrod daa520 gray 808080 green 008000 greenYellow adff2f ' +
  'grey 808080 honeydew f0fff0 hotPink ff69b4 indianRed cd5c5c indigo 4b0082 ' +
  'ivory fffff0 khaki f0e68c lavender e6e6fa lavenderBlush fff0f5 lawnGreen 7cfc00 ' +
  'lemonChiffon fffacd lightBlue add8e6 lightCoral f08080 lightCyan e0ffff lightGoldenrodYellow fafad2 ' +
  'lightGray d3d3d3 lightGreen 90ee90 lightGrey d3d3d3 lightPink ffb6c1 lightSalmon ffa07a ' +
  'lightSeaGreen 20b2aa lightSkyBlue 87cefa lightSlateGray 778899 lightSlateGrey 778899 lightSteelBlue b0c4de ' +
  'lightYellow ffffe0 lime 00ff00 limeGreen 32cd32 linen faf0e6 ltBlue add8e6 ' +
  'ltCoral f08080 ltCyan e0ffff ltGoldenrodYellow fafa78 ltGray d3d3d3 ltGreen 90ee90 ' +
  'ltGrey d3d3d3 ltPink ffb6c1 ltSalmon ffa07a ltSeaGreen 20b2aa ltSkyBlue 87cefa ' +
  'ltSlateGray 778899 ltSlateGrey 778899 ltSteelBlue b0c4de ltYellow ffffe0 magenta ff00ff ' +
  'maroon 800000 medAquamarine 66cdaa medBlue 0000cd mediumAquamarine 66cdaa mediumBlue 0000cd ' +
  'mediumOrchid ba55d3 mediumPurple 9370db mediumSeaGreen 3cb371 mediumSlateBlue 7b68ee mediumSpringGreen 00fa9a ' +
  'mediumTurquoise 48d1cc mediumVioletRed c71585 medOrchid ba55d3 medPurple 9370db medSeaGreen 3cb371 ' +
  'medSlateBlue 7b68ee medSpringGreen 00fa9a medTurquoise 48d1cc medVioletRed c71585 midnightBlue 191970 ' +
  'mintCream f5fffa mistyRose ffe4ff moccasin ffe4b5 navajoWhite ffdead navy 000080 ' +
  'oldLace fdf5e6 olive 808000 oliveDrab 6b8e23 orange ffa500 orangeRed ff4500 ' +
  'orchid da70d6 paleGoldenrod eee8aa paleGreen 98fb98 paleTurquoise afeeee paleVioletRed db7093 ' +
  'papayaWhip ffefd5 peachPuff ffdab9 peru cd853f pink ffc0cb plum d3a0d3 ' +
  'powderBlue b0e0e6 purple 800080 red ff0000 rosyBrown bc8f8f royalBlue 4169e1 ' +
  'saddleBrown 8b4513 salmon fa8072 sandyBrown f4a460 seaGreen 2e8b57 seaShell fff5ee ' +
  'sienna a0522d silver c0c0c0 skyBlue 87ceeb slateBlue 6a5aeb slateGray 708090 ' +
  'slateGrey 708090 snow fffafa springGreen 00ff7f steelBlue 4682b4 tan d2b48c ' +
  'teal 008080 thistle d8bfd8 tomato ff7347 turquoise 40e0d0 violet ee82ee ' +
  'wheat f5deb3 white ffffff whiteSmoke f5f5f5 yellow ffff00 yellowGreen 9acd32'
)
  .split(' ')
  .reduce((m, v, i, a) => { if (i % 2 === 0) return m; m[a[i - 1]] = '#' + v; return m }, {} as Record<string, string>)

export const PRESET: Record<string, string> = PRST_RAW

/** 大小写不敏感索引（XML 预设名按 ECMA 是 camelCase，容错实际文件里的乱写） */
const PRST_CI: Record<string, string> = Object.keys(PRST_RAW).reduce(
  (m, k) => ((m[k.toLowerCase()] = PRST_RAW[k]), m),
  {} as Record<string, string>,
)

/** 预设色查表：精确 → 全小写归一 */
export function presetColor(val: string | undefined): string | undefined {
  if (!val) return undefined
  return PRST_RAW[val] ?? PRST_CI[val.toLowerCase()]
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
      hex = presetColor(el.a.val)
      break
    case 'scrgbClr':
      hex = rgbToHex([
        ((num(el.a.r) ?? 0) / 100000) * 255,
        ((num(el.a.g) ?? 0) / 100000) * 255,
        ((num(el.a.b) ?? 0) / 100000) * 255,
      ])
      break
    case 'hslClr':
      hex = rgbToHex(hslToRgb01((num(el.a.hue) ?? 0) / 21600000, (num(el.a.sat) ?? 0) / 100000, (num(el.a.lum) ?? 0) / 100000))
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
  // 统一走 theme.ts 的 sdkjs 字节管线（0..255 HSL + clampColor + 伽马往返的
  // tint/shade/inv），本文件不再维护第二套 0..1 近似实现
  const out = applyModsByte(hexToRgb(hex), el.c)
  const alpha = el.c.find((m) => m.n === 'alpha')
  const a = alpha ? (num(alpha.a.val) ?? 100000) / 100000 : 1
  const rgbHex = rgbToHex(out)
  if (a >= 1) return rgbHex
  const [r, g, b] = hexToRgb(rgbHex)
  return `rgba(${r},${g},${b},${+a.toFixed(3)})`
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
