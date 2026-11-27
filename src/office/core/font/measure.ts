/**
 * 文本测量门面（textmeasurer.js 的 TS 等价面）。
 *
 * 与 sdkjs 同规：测量永远在 576pt 固定字号下进行，真实字号事后线性缩放
 * —— 这样 advance 的 16.16 定点精度不因字号变化丢失（engine.js:423 注释语义）。
 * 出口单位：pt（排版层内部）与 mm（对齐 sdkjs 全链路 mm 约定）。
 */
import { loadEngine, fontAssetUrl, shapeText, isFullwidthCp, MEASURE_FONTSIZE, GRAPHEME_COEF, type FontEngine, type FontFile, type MeasureMode } from './wasm'

/** 字体族注册表：族名 → 四样式 TTF 字节。原型只挂度量兼容的开源字体集。 */
export interface FontFaceSources {
  regular: string
  bold?: string
  italic?: string
  boldItalic?: string
}

const fontCache = new Map<string, ArrayBuffer>()

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const hit = fontCache.get(url)
  if (hit) return hit
  // 相对 URL 在 Worker 里解析不了（基准是 worker 自己的 scriptURL）→ 统一转绝对
  const res = await fetch(fontAssetUrl(url))
  if (!res.ok) throw new Error(`font fetch failed: ${url} (${res.status})`)
  const buf = await res.arrayBuffer()
  fontCache.set(url, buf)
  return buf
}

export interface StyleFlags {
  bold?: boolean
  italic?: boolean
}

/**
 * 一个 (族, 样式, 模式) 的测量器。内部 Face 恒在 576pt。
 * 伪粗/伪斜：请求样式无实体面时回退到邻近面并合成（sdkjs 四样式回退链的简化版：
 * BI→B→I→R，合成标志透传给 FontFile 供 Cell advance 补偿判定）。
 */
export class FontMeasurer {
  private face: FontFile | null = null
  /** 实际落到哪个实体面（合成样式时与请求不符） */
  private synthetic: StyleFlags = {}
  readonly fallbackChain: (keyof FontFaceSources)[] = ['regular', 'bold', 'italic', 'boldItalic']

  constructor(
    private eng: FontEngine,
    readonly family: string,
    readonly mode: MeasureMode,
    private sources: FontFaceSources,
    private want: StyleFlags
  ) {}

  static async create(eng: FontEngine, family: string, mode: MeasureMode, sources: FontFaceSources, want: StyleFlags): Promise<FontMeasurer> {
    const m = new FontMeasurer(eng, family, mode, sources, want)
    await m.load()
    return m
  }

  /** 选面：优先实体样式，缺失则沿 BI→B→I→R 回退并标记合成（sdkjs GetLoadInfoForMeasurer 的简化） */
  private pickSource(): { url: string; synth: StyleFlags } {
    const { bold, italic } = this.want
    const order: (keyof FontFaceSources)[] =
      bold && italic ? ['boldItalic', 'bold', 'italic', 'regular']
      : bold ? ['bold', 'regular']
      : italic ? ['italic', 'regular']
      : ['regular']
    let picked: keyof FontFaceSources = 'regular'
    for (const k of order) {
      if (this.sources[k]) { picked = k; break }
    }
    const synth: StyleFlags = {}
    if (bold && picked !== 'bold' && picked !== 'boldItalic') synth.bold = true
    if (italic && picked !== 'italic' && picked !== 'boldItalic') synth.italic = true
    return { url: this.sources[picked] ?? this.sources.regular, synth }
  }

  private async load(): Promise<void> {
    const { url, synth } = this.pickSource()
    const bytes = new Uint8Array(await fetchFont(url))
    this.synthetic = synth
    this.face = this.eng.openFont(bytes, 0, MEASURE_FONTSIZE, this.mode, { syntheticBold: synth.bold })
  }

  /** 面级行度量 → pt@targetSize（textmeasurer.js:419-439 的缩放版） */
  metrics(targetPt: number): { ascent: number; descent: number; height: number } {
    const f = this.face!.faceMetrics()
    const k = targetPt / MEASURE_FONTSIZE
    return { ascent: f.ascent * k, descent: f.descent * k, height: f.height * k }
  }

  /**
   * 行高线 → pt@targetSize。word 模式下 CJK 代码页的 ×1.3 与 typo/win 选择在
   * setFace 已烘焙进 faceMetrics().height，这里只乘行距倍数（line 为倍数语义，
   * 1 = 单倍）；exact/atLeast 由排版层处理，不进内核。
   */
  linePt(targetPt: number, line = 1): number {
    return this.metrics(targetPt).height * line
  }

  /** 单码点 advance → pt@targetSize（缺字回退由 FontFile.glyph 内部处理） */
  advance(codepoint: number, targetPt: number): number {
    return this.face!.glyph(codepoint).advanceX * (targetPt / MEASURE_FONTSIZE)
  }

  /** 整串 shaping → 字簇（连字/字簇合并），宽度为 mm@每 1pt */
  graphemes(text: string): ReturnType<typeof shapeText> {
    return shapeText(this.eng.asc, this.face!, [...text].map((c) => c.codePointAt(0)!))
  }

  /**
   * 整串 shaping → 字簇宽度表（pt@targetPt）。每簇覆盖 len 个码点，
   * wPt 为该簇的 shaped advance（kerning 已折入 —— HB kern 改 x_advance 不改簇数）。
   * 码点总数恒等 [...text].length（shapeText 按 cluster 变化切，回映射覆盖全串）。
   * 这是段落度量的权威口径（sdkjs ParagraphTextShaper.Shape 同路）。
   */
  clusters(text: string, targetPt: number): { len: number; wPt: number }[] {
    const gs = this.graphemes(text)
    const k = targetPt / MEASURE_FONTSIZE
    return gs.map((g) => {
      const cps = g.codepoints
      // 全角 CJK 且本面无字形：HB 内部给 .notdef 半角宽，浏览器回退系统字体恒 1em
      // （x16：'你好世界' HB 22.3pt vs dom 44pt）。对齐浏览器——逐码点 1em。
      // 有真 CJK 表的字体 gid≥0，不走此支（用 HB shaped 宽）。
      const fwMiss = cps.length > 0 && cps.every(isFullwidthCp) && cps.every((cp) => this.face!.glyph(cp).gid < 0)
      const wPt = fwMiss ? cps.length * targetPt : (g.widthMmPerPt / GRAPHEME_COEF / 64) * k
      return { len: cps.length, wPt }
    })
  }

  /**
   * 整串宽度 → pt@targetSize。
   * 无连字合并时逐码点 advance 相加（= sdkjs item.Width 的来源）；
   * 有连字时走字簇 HB advance 换算（mmPerPt ÷ COEF → 16.16@576 → /64 → pt@576 → 缩放）。
   */
  widthPt(text: string, targetPt: number): number {
    const cps = [...text].map((c) => c.codePointAt(0)!)
    const gs = this.graphemes(text)
    if (gs.length === cps.length) {
      // 无连字合并：逐码点 advance 相加即 sdkjs item.Width 的来源
      let sum = 0
      for (const cp of cps) sum += this.face!.glyph(cp).advanceX
      return sum * (targetPt / MEASURE_FONTSIZE)
    }
    let mmPerPt = 0
    for (const g of gs) mmPerPt += g.widthMmPerPt
    const fixed576 = mmPerPt / GRAPHEME_COEF // 16.16 定点 @576
    return (fixed576 / 64) * (targetPt / MEASURE_FONTSIZE)
  }

  get faceFile(): FontFile { return this.face! }
}

/** 默认字体集：Carlito ≡ Calibri（度量兼容，OFL 授权可入库） */
export const DEFAULT_FONTS: Record<string, FontFaceSources> = {
  Carlito: {
    regular: '/fonts/Carlito-Regular.ttf',
    bold: '/fonts/Carlito-Bold.ttf',
    italic: '/fonts/Carlito-Italic.ttf',
    boldItalic: '/fonts/Carlito-BoldItalic.ttf',
  },
}

export class FontRegistry {
  private measurers = new Map<string, Promise<FontMeasurer>>()
  constructor(private eng: FontEngine, private tables: Record<string, FontFaceSources> = DEFAULT_FONTS) {}

  /** 取（或惰性建）测量器；族名大小写不敏感 */
  get(family: string, mode: MeasureMode, style: StyleFlags): Promise<FontMeasurer> {
    const key = `${family.toLowerCase()}|${mode}|${style.bold ? 1 : 0}${style.italic ? 1 : 0}`
    let p = this.measurers.get(key)
    if (!p) {
      const src = this.tables[family] ?? this.tables[Object.keys(this.tables)[0]]
      p = FontMeasurer.create(this.eng, family, mode, src, style)
      this.measurers.set(key, p)
    }
    return p
  }

  /** 行高便捷线：(族,样式,模式) → 度量行高×倍数（pt）。CJK×1.3 已在 setFace 烘焙 */
  async linePt(family: string, mode: MeasureMode, style: StyleFlags, targetPt: number, line = 1): Promise<number> {
    return (await this.get(family, mode, style)).linePt(targetPt, line)
  }
}

let regPromise: Promise<FontRegistry> | null = null

/** 单例：引擎 + 注册表（冒烟与视图共用） */
export function defaultRegistry(): Promise<FontRegistry> {
  if (!regPromise) regPromise = loadEngine().then((eng) => new FontRegistry(eng))
  return regPromise
}
