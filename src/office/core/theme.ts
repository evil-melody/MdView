import { kid, kids, path, type XEl } from './xml'

export interface Theme {
  colors: Record<string, string>
  major: string
  minor: string
  /** ea (CJK) typeface of the major / minor font schemes */
  majorEA: string
  minorEA: string
  fillStyles: XEl[]
  bgFillStyles: XEl[]
  lineStyles: XEl[]
}

export const DEFAULT_THEME: Theme = {
  colors: {
    dk1: '#000000', lt1: '#ffffff', dk2: '#44546a', lt2: '#e7e6e6',
    accent1: '#4472c4', accent2: '#ed7d31', accent3: '#a5a5a5', accent4: '#ffc000',
    accent5: '#5b9bd5', accent6: '#70ad47', hlink: '#0563c1', folHlink: '#954f72',
  },
  major: 'Calibri Light',
  minor: 'Calibri',
  majorEA: '',
  minorEA: '',
  fillStyles: [],
  bgFillStyles: [],
  lineStyles: [],
}

export function parseTheme(root: XEl | undefined): Theme {
  if (!root) return DEFAULT_THEME
  const te = kid(root, 'themeElements')
  const colors: Record<string, string> = { ...DEFAULT_THEME.colors }
  for (const c of kid(te, 'clrScheme')?.c ?? []) {
    const v = c.c[0]
    if (!v) continue
    if (v.n === 'srgbClr' && v.a.val) colors[c.n] = '#' + v.a.val.toLowerCase()
    else if (v.n === 'sysClr') colors[c.n] = '#' + (v.a.lastClr ?? (v.a.val === 'window' ? 'ffffff' : '000000')).toLowerCase()
  }
  const fs = kid(te, 'fontScheme')
  const fmt = kid(te, 'fmtScheme')
  const ea = (scheme: XEl | undefined) => path(scheme, 'ea')?.a.typeface ?? ''
  return {
    colors,
    major: path(fs, 'majorFont', 'latin')?.a.typeface || DEFAULT_THEME.major,
    minor: path(fs, 'minorFont', 'latin')?.a.typeface || DEFAULT_THEME.minor,
    majorEA: ea(kid(fs, 'majorFont')),
    minorEA: ea(kid(fs, 'minorFont')),
    fillStyles: kid(fmt, 'fillStyleLst')?.c ?? [],
    bgFillStyles: kid(fmt, 'bgFillStyleLst')?.c ?? [],
    lineStyles: kids(kid(fmt, 'lnStyleLst'), 'ln'),
  }
}

// ── 颜色变换管线 ────────────────────────────────────────────────────────────
// 逐字节移植 sdkjs CColorModifiers.Apply（common/Drawings/Format/Format.js:2100-2345）
// 与 AscCommon.CU.rgbToHsl / hslToRgb（common/colorUtils.js:86-165）。
//
// 关键事实（此前实现搞错的三点）：
//  1. HSL 值域是 **0..255**（max_hls=255），不是 0..1；亮度运算在该值域内做，
//     最后 clampColor = (c+0.5)>>0（四舍五入向零取整）+ 0..255 夹取；
//  2. DrawingML 子元素形式的 a:shade / a:tint 是 **RGB 通道**运算，且经 sRGB
//     伽马往返（isUsePow 恒真）：shade → lin*c，tint → 1-(1-lin)*c；
//     不是 HSL 亮度！
//  3. Word 属性形式 w:themeShade / w:themeTint 走另一族运算（sdkjs 内部记作
//     wordShade/wordTint，值为 0..255 字节）。为与 Word 的官方色阶矩阵逐位一致
//     （accent1 #4472C4 的 50% 浅色 = #A2B8E1），此处按 Format.js:3180-3196
//     `convertToPPTXMods` 给出的等价式直接用百分数落 lumMod/lumOff：
//        themeShade p → lumMod p
//        themeTint  p → lumMod p + lumOff (100000-p)
//     （sdkjs 的字节量化路径会引入 ±1 偏差，故不采）。
//  4. a:hue 是【绝对】色相置换（非偏移），a:hueOff 才是偏移；两者值域均为
//     60000 分之一度。

type RGB = [number, number, number]
interface RGBA { R: number; G: number; B: number }

const MAX_HLS = 255.0
const CD13 = 1.0 / 3.0
const CD23 = 2.0 / 3.0
const CD16 = 1.0 / 6.0

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
/** AscFormat.ClampColor：+0.5 后向零取整，再夹 0..255 */
const clampColor = (c: number): number => {
  const t = (c + 0.5) >> 0
  return t < 0 ? 0 : t > 255 ? 255 : t
}
const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const linearToSrgb = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)
/** RgbtoCrgbColor（isUsePow 恒真）*/
const toLin = (c: number): number => srgbToLinear(c / 255)
/** CrgbtoRgbColor */
const fromLin = (c: number): number => linearToSrgb(c) * 255

function rgbToHsl(R: number, G: number, B: number): { H: number; S: number; L: number } {
  const iMin = Math.min(R, G, B)
  const iMax = Math.max(R, G, B)
  const iDelta = iMax - iMin
  const dMax = (iMax + iMin) / 255.0
  let dDelta = iDelta / 255.0
  let H = 0
  let S = 0
  let L = dMax / 2.0
  if (iDelta !== 0) {
    S = L < 0.5 ? dDelta / dMax : dDelta / (2.0 - dMax)
    dDelta *= 1530.0
    const dR = (iMax - R) / dDelta
    const dG = (iMax - G) / dDelta
    const dB = (iMax - B) / dDelta
    if (R === iMax) H = dB - dG
    else if (G === iMax) H = CD13 + dR - dB
    else H = CD23 + dG - dR
    if (H < 0) H += 1.0
    if (H > 1) H -= 1.0
  }
  return { H: H * MAX_HLS, S: clamp(S * MAX_HLS, 0, MAX_HLS), L: clamp(L * MAX_HLS, 0, MAX_HLS) }
}

function hue2Rgb(v1: number, v2: number, vH: number): number {
  if (vH < 0) vH += 1.0
  if (vH > 1) vH -= 1.0
  if (vH < CD16) return v1 + (v2 - v1) * 6.0 * vH
  if (vH < 0.5) return v2
  if (vH < CD23) return v1 + (v2 - v1) * (CD23 - vH) * 6.0
  return v1
}

/** hslToRgb(bRoundValues=true) —— 管线出口恒带舍入 */
function hslToRgb(H: number, S: number, L: number): RGBA {
  if (S === 0) {
    const c = clampColor(L)
    return { R: c, G: c, B: c }
  }
  const h = H / MAX_HLS
  const s = S / MAX_HLS
  const l = L / MAX_HLS
  const v2 = l < 0.5 ? l * (1.0 + s) : l + s - s * l
  const v1 = 2.0 * l - v2
  return {
    R: clampColor(255 * hue2Rgb(v1, v2, h + CD13)),
    G: clampColor(255 * hue2Rgb(v1, v2, h)),
    B: clampColor(255 * hue2Rgb(v1, v2, h - CD13)),
  }
}

const toRgb = ([r, g, b]: RGB): RGBA => ({ R: r, G: g, B: b })
const ofRgb = (o: RGBA): RGB => [o.R, o.G, o.B]

/**
 * CColorModifiers.graySaturation（Format.js:2068）—— 灰色（R==G==B）没有 HSL
 * 饱和度可言，sat/satOff 对它走这条通道缩放；注意是【直接】对 R/G/B 动刀，
 * 不进伽马（sdkjs 原文如此）。
 */
function graySaturation(o: RGBA, nSat: number): void {
  const L = o.R
  if (L < 128) {
    o.R = L * (1 + nSat); o.G = L * (1 - nSat); o.B = L * (1 - 5 * nSat)
  } else {
    o.R = L + (255 - L) * nSat; o.G = L - (255 - L) * nSat; o.B = L - 5 * (255 - L) * nSat
  }
}

/**
 * 单条变换。`raw` 是 XML 里的原始值（百分比 ×100000；hue/hueOff 为 60000 分之一度；
 * red/green/blue 为 0..255 字节；wordShade/wordTint 为 0..255 字节）。
 * 逐 case 对照 Format.js:2100-2345，含 val===1 / val===0 的短路 continue。
 */
function applyMod(rgb: RGB, name: string, raw: number): RGB {
  const o = toRgb(rgb)
  const val = raw / 100000
  const hsl = () => rgbToHsl(o.R, o.G, o.B)
  const put = (h: { H: number; S: number; L: number }): void => {
    const r = hslToRgb(h.H, h.S, h.L)
    o.R = r.R; o.G = r.G; o.B = r.B
  }
  switch (name) {
    case 'lumMod': if (val !== 1) { const h = hsl(); h.L = h.L * val; put(h) } break
    case 'lumOff': if (val !== 0) { const h = hsl(); h.L = h.L + val * MAX_HLS; put(h) } break
    case 'satMod': if (val !== 1) { const h = hsl(); h.S = h.S * val; put(h) } break
    case 'satOff': {
      if (val === 0) break
      // 灰色走 graySaturation（Format.js:2238-2240），其余走 HSL 饱和度叠加
      if (o.R === o.G && o.R === o.B) graySaturation(o, val)
      else { const h = hsl(); h.S = h.S + val * MAX_HLS; put(h) }
      break
    }
    case 'sat': {
      if (o.R === o.G && o.R === o.B) graySaturation(o, val)
      else { const h = hsl(); h.S = clamp(val * MAX_HLS, 0, MAX_HLS); put(h) }
      break
    }
    case 'lum': {
      const h = hsl(); h.L = clamp(val * MAX_HLS, 0, MAX_HLS); put(h)
      break
    }
    case 'hueMod': {
      const v = Math.max(0, val)
      if (v !== 1) {
        const h = hsl()
        const _H = h.H * v
        h.H = _H - Math.floor(_H / 255) * 255
        put(h)
      }
      break
    }
    case 'hueOff': {
      if (raw !== 0) {
        const h = hsl()
        const d = (raw / 60000) * (MAX_HLS / 360)
        let res = h.H + d
        if (res > MAX_HLS || res < 0) res -= Math.floor(res / MAX_HLS) * MAX_HLS
        h.H = res
        put(h)
      }
      break
    }
    case 'hue': {
      // 绝对色相（Format.js:2184 用 trimMinMaxValue，非偏移）
      const h = hsl()
      h.H = clamp((raw / 60000) * (MAX_HLS / 360), 0, MAX_HLS)
      put(h)
      break
    }
    case 'comp': {
      const h = hsl()
      h.H = (h.H + 0.5 * MAX_HLS) % MAX_HLS
      put(h)
      break
    }
    case 'inv': {
      o.R = toLin(o.R); o.G = toLin(o.G); o.B = toLin(o.B)
      o.R = 1 - o.R; o.G = 1 - o.G; o.B = 1 - o.B
      o.R = fromLin(o.R); o.G = fromLin(o.G); o.B = fromLin(o.B)
      break
    }
    case 'gray': {
      const g = 0.2126 * o.R + 0.7152 * o.G + 0.0722 * o.B
      o.R = g; o.G = g; o.B = g
      break
    }
    case 'wordShade': {
      if (raw !== 255) {
        const h = hsl()
        h.L = clamp(h.L * (raw / 255), 0, MAX_HLS)
        put(h)
      }
      break
    }
    case 'wordTint': {
      if (raw !== 255) {
        const h = hsl()
        h.L = clamp(h.L * (raw / 255) + (255 - raw), 0, MAX_HLS)
        put(h)
      }
      break
    }
    case 'shade': {
      // RGB 通道 + sRGB 伽马往返（不是 HSL 亮度）
      o.R = toLin(o.R); o.G = toLin(o.G); o.B = toLin(o.B)
      const c = val < 0 || val > 1 ? 0 : val
      o.R *= c; o.G *= c; o.B *= c
      o.R = fromLin(o.R); o.G = fromLin(o.G); o.B = fromLin(o.B)
      break
    }
    case 'tint': {
      o.R = toLin(o.R); o.G = toLin(o.G); o.B = toLin(o.B)
      const c = val < 0 || val > 1 ? 0 : val
      o.R = 1 - (1 - o.R) * c
      o.G = 1 - (1 - o.G) * c
      o.B = 1 - (1 - o.B) * c
      o.R = fromLin(o.R); o.G = fromLin(o.G); o.B = fromLin(o.B)
      break
    }
    case 'red': o.R = fromLin(clamp(val, 0, 1)); break
    case 'green': o.G = fromLin(clamp(val, 0, 1)); break
    case 'blue': o.B = fromLin(clamp(val, 0, 1)); break
    // 通道级 Mod/Off（Format.js:2108-2148）：先在伽马域取值，再回 sRGB
    case 'redMod': o.R = fromLin(toLin(o.R) * val); break
    case 'greenMod': o.G = fromLin(toLin(o.G) * val); break
    case 'blueMod': o.B = fromLin(toLin(o.B) * val); break
    case 'redOff': o.R = fromLin(toLin(o.R) + val); break
    case 'greenOff': o.G = fromLin(toLin(o.G) + val); break
    case 'blueOff': o.B = fromLin(toLin(o.B) + val); break
    // gamma / invGamma（Format.js:2294-2305）：单向伽马迁移，无反向补偿。
    // gamma = linearToStandard(v/255)*255 = fromLin(v)；invGamma 同理但要 *255
    case 'gamma': o.R = fromLin(o.R); o.G = fromLin(o.G); o.B = fromLin(o.B); break
    case 'invGamma': o.R = toLin(o.R) * 255; o.G = toLin(o.G) * 255; o.B = toLin(o.B) * 255; break
    case 'alpha': case 'alphaMod': case 'alphaOff':
      // 文本色不透明渲染路径下 alpha 不参与混合；结构保留，值忽略
      break
    default: break
  }
  o.R = clamp(o.R, 0, 255); o.G = clamp(o.G, 0, 255); o.B = clamp(o.B, 0, 255)
  return ofRgb({ R: clampColor(o.R), G: clampColor(o.G), B: clampColor(o.B) })
}

const hex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => clamp(v, 0, 255).toString(16).padStart(2, '0')).join('')

function parseHex(c: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** 变换子元素序列 → 管线（Format.js Apply 的顺序应用语义） */
export function applyMods(rgb: RGB, mods: XEl[]): RGB {
  let out = rgb
  for (const m of mods) out = applyMod(out, m.n, parseFloat(m.a.val ?? '') || 0)
  return out
}

/**
 * Excel / Word 的 tint 属性（-1..1）→ 管线。ECMA 公式
 *   tint < 0: L *= (1 + tint)      tint > 0: L = L*(1 - tint) + tint
 * 与 wordShade(byte)/wordTint(byte) 同族（都是 HSL 亮度上的线性缩放 + 平移），
 * 这里保持浮点值域，避免字节量化带来的额外偏差。
 */
export function applySheetTint(rgb: RGB, tint: number): RGB {
  if (!tint) return rgb
  const h = rgbToHsl(rgb[0], rgb[1], rgb[2])
  h.L = clamp(tint < 0 ? h.L * (1 + tint) : h.L * (1 - tint) + tint * MAX_HLS, 0, MAX_HLS)
  return ofRgb(hslToRgb(h.H, h.S, h.L))
}

/** 0..1 门面：DrawingML `a:hslClr` 是颜色【指定】而非变换，直接走同一套 HSL2RGB */
export const hslToRgb01 = (h: number, s: number, l: number): RGB =>
  ofRgb(hslToRgb(h * MAX_HLS, s * MAX_HLS, l * MAX_HLS))

/**
 * 主题色板别名（ECMA-376 §17.7.2.4 / DrawingML schemeClr val / WordprocessingML themeColor）：
 * 三方言并存，全部收敛到 clrScheme 元素键（dk1/lt1/dk2/lt2/accent1-6/hlink/folHlink）：
 *  - DrawingML 短名：tx1/bg1/tx2/bg2（a:schemeClr 老式）；
 *  - WordprocessingML 旧词表（Word 2007 / ECMA 第一版，产物实证）：
 *    text1/text2/background1/background2/accent1-6/hyperlink/followedHyperlink；
 *  - sdkjs ClrMap.getColorNameWord（Format.js:9992，新词表别名）：dark1/dark2/light1/light2。
 * 三者映射同槽（text1≡dark1≡tx1≡dk1，background1≡light1≡bg1≡lt1……）。
 */
const SCHEME_ALIAS: Record<string, string> = {
  tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2',
  text1: 'dk1', dark1: 'dk1', text2: 'dk2', dark2: 'dk2',
  background1: 'lt1', light1: 'lt1', background2: 'lt2', light2: 'lt2',
  hyperlink: 'hlink', followedHyperlink: 'folHlink',
}
function schemeRgb(theme: Theme, name: string | undefined): RGB | undefined {
  if (!name) return undefined
  return parseHex(theme.colors[SCHEME_ALIAS[name] ?? name] ?? '') ?? undefined
}

/**
 * themeColorId（EThemeColor / CSchemeColor.id，Serialize2.js:1281 + CreateThemeUnifill
 * :1439 的 id 直存）→ WordprocessingML 写侧词名。语义名直出（产物实证词表）：
 * 0-5→accent1-6、6→background1、7→background2、8→dark1、9→dark2、
 * 10→followedHyperlink、11→hyperlink、12→light1、13→light2、15→text1、16→text2。
 * 14=none（CreateThemeUnifill 对 themecolorNone 直接 return null）→ undefined。
 * 与 sdkjs getColorNameWord 的差异：上游表缺 15/16（返回空串），此处按 EThemeColor
 * 枚举补全——注册表实际用了 15/16（fUF(themecolorText1,…) 族），空串落盘即悬色。
 */
const ID_WORD: Record<number, string> = {
  0: 'accent1', 1: 'accent2', 2: 'accent3', 3: 'accent4', 4: 'accent5', 5: 'accent6',
  6: 'background1', 7: 'background2', 8: 'dark1', 9: 'dark2',
  10: 'followedHyperlink', 11: 'hyperlink', 12: 'light1', 13: 'light2',
  15: 'text1', 16: 'text2',
}
export function schemeWord(id: number): string | undefined {
  return ID_WORD[id]
}

/**
 * w:themeTint / w:themeShade（及 CT_Shd 的 *Tint/*Shade）解析。
 * ECMA ST_UcharHexNumber（§17.18.98）= 1 字节 hex（00-FF，FF=原色）——Word/产物/sdkjs
 * 三方实证：产物 `w:themeTint="99"`（=153，十进制 99 是巧合陷阱）`"BF"`（=191）、
 * sdkjs CreateThemeUnifill 的 tint/shade 实参是 0x99/0xBF 字节族、Apply 走
 * wordTint/wordShade（Format.js:2250-2273，raw/255）。
 * 分流：1-2 位 hex → 字节值（kind:'byte'，0..255，走 wordTint/wordShade）；
 * ≥3 位纯数字 → 万分比（kind:'pct'，x12 历史断言的 lumMod/lumOff 兼容口径，
 * Word 实际从不写）。undefined = 缺失/非法。
 */
export type ThemeMod = { kind: 'byte'; value: number } | { kind: 'pct'; value: number }
export function parseThemeMod(raw: string | undefined): ThemeMod | undefined {
  if (raw === undefined) return undefined
  const s = raw.trim()
  const m = /^[0-9a-fA-F]{1,2}$/.exec(s)
  if (m) return { kind: 'byte', value: parseInt(m[0], 16) }
  const n = parseFloat(s)
  return Number.isFinite(n) ? { kind: 'pct', value: n } : undefined
}

/**
 * 把一条 theme mod 落进 mods 序列。字节口径（Word 真实写法）走 wordTint/wordShade
 * （raw=0..255，applyMod 内 Format.js:2250 等价式）；万分比口径（x12 兼容）走
 * lumMod[/lumOff]：shade → lumMod p；tint → lumMod p + lumOff (100000-p)。
 */
function pushMod(mods: [string, number][], byteName: string, pctMain: string, pctOff: string | undefined, m: ThemeMod): void {
  if (m.kind === 'byte') mods.push([byteName, m.value])
  else {
    mods.push([pctMain, m.value])
    if (pctOff !== undefined) mods.push([pctOff, 100000 - m.value])
  }
}

/**
 * 解析 w:color / a:solidFill 的值。四条来源，优先级与 sdkjs 一致：
 *  1. w:val 六位十六进制（sRGB 直通，变换子元素仍适用——Word 允许 val + 子元素）；
 *  2. Word 属性形式 w:themeColor [+ w:themeShade] [+ w:themeTint]（§17.7.2.4）——
 *     ECMA 注：shade 先作用于主题色，再叠 tint；此处按 lumMod/lumOff 等价式落管线；
 *  3. DrawingML 子元素形式：srgbClr / schemeClr / sysClr + 变换子元素管线；
 *  4. w:themeColor 与子元素并存时属性形式优先（Word 写 rPr 只发其一）。
 * 返回 undefined = 无法解析（'auto' / 缺色板项等），由调用方决定回退。
 */
export function resolveColor(el: XEl | undefined, theme: Theme): string | undefined {
  if (!el) return undefined
  const v = el.a.val
  if (v && v !== 'auto' && /^[0-9a-fA-F]{6}$/.test(v)) {
    const base = parseHex(v)
    if (!base) return undefined
    return hex(el.c.length ? applyMods(base, el.c) : base)
  }
  // 属性形式：w:themeColor（Word 的 rPr / pPr 颜色走这条，而非子元素）
  const tc = el.a.themeColor
  if (tc) {
    let rgb = schemeRgb(theme, tc)
    if (!rgb) return undefined
    const mods: [string, number][] = []
    // 应用序 = sdkjs CreateThemeUnifill addMod 序（wordTint 先、wordShade 后，
    // :1461-1466）；双 mod 共存（137 条 fUF(text1,0x80,0x95) 族）时顺序影响结果。
    const tint = parseThemeMod(el.a.themeTint)
    if (tint) pushMod(mods, 'wordTint', 'lumMod', 'lumOff', tint)
    const shade = parseThemeMod(el.a.themeShade)
    if (shade) pushMod(mods, 'wordShade', 'lumMod', undefined, shade)
    for (const [n, raw] of mods) rgb = applyMod(rgb, n, raw)
    return hex(rgb)
  }
  for (const c of el.c) {
    if (c.n === 'srgbClr' && c.a.val && /^[0-9a-fA-F]{6}$/.test(c.a.val)) {
      const rgb = parseHex(c.a.val)
      if (!rgb) return undefined
      return hex(applyMods(rgb, c.c))
    }
    if (c.n === 'schemeClr') {
      const rgb = schemeRgb(theme, c.a.val)
      if (!rgb) return undefined
      return hex(applyMods(rgb, c.c))
    }
    if (c.n === 'sysClr') {
      const last = c.a.lastClr ?? (c.a.val === 'window' ? 'ffffff' : '000000')
      const rgb = parseHex(last)
      if (!rgb) return undefined
      return hex(applyMods(rgb, c.c))
    }
  }
  return undefined
}
