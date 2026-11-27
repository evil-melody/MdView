/**
 * 字体度量内核 — ONLYOFFICE sdkjs fonts.wasm（FreeType+HarfBuzz+libhyphen）的 TS 封装。
 *
 * 架构决策（sdkjs 解剖结论）：字体解析 100% 在 wasm 内，JS 层只做数据搬运/缓存/单位换算。
 * 本文件不复刻 sdkjs 的 AscFonts 全局层，而是按其 engine.js + engine/fonts.js glue 的
 * 字节级契约重写（ABI 逐字段对照，保真魔数原样保留）：
 *   - CFaceInfo 字段读取顺序        ← sdkjs engine.js:191-239
 *   - glyph measure 14 int          ← engine.js:294-311（glue 记录数 15 含头部 int）
 *   - HB glyph 记录 26 字节         ← engine.js:582-591（type/flags 各 1B + 6×i32）
 *   - 测量字号恒为 576pt            ← engine.js:423 FONTSIZE
 *   - COEF = 25.4/72/64/576         ← engine.js:425（mm @ 16.16 定点）
 *   - SetFace 三模式 OS/2 兼容分支  ← file.js:1731-1826
 *   - 缺字回退链：Symbol 0xF000 → defaultChar → miss(maxAdvance/2) ← file.js:1070-1145
 *   - 伪粗体 Cell +1 advance        ← file.js:1164-1166（真粗 weight≥800 不补）
 *
 * 加载方式：public/fonts/fonts.js 是 Emscripten glue（vendored，勿改），它 fetch 同目录
 * fonts.wasm 并在 postRun 调 window.AscFonts.onLoadModule()。本模块在 loadEngine() 里
 * 先铺垫片（AscCommon.loadScript / String.prototype.toUtf8 等 glue 依赖的最小面），
 * 再注入 glue，onLoadModule 触发即完成握手。
 *
 * 单位约定（与 sdkjs 一致）：
 *   - advance/bbox/metrics 出口单位 = pt（26.6 定点 >>6 向零截断，与 sdkjs 同舍入）
 *   - fAdvanceX 例外：linearHoriAdvance 设计单位 × size/upem 的浮点 pt（唯一保小数项）
 *   - HB shaping 宽度：16.16 定点 @576pt → × COEF 得 mm
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type MeasureMode = 'word' | 'cell' | 'slide'

interface GlueModule {
  HEAP8: Int8Array
  HEAPU8: Uint8Array
  HEAP32: Int32Array
  _malloc: (n: number) => number
  _free: (p: number) => void
  [k: string]: any
}

interface ReturnObj {
  error: number
  count: number
  freeObj: number
  free: () => void
}

interface AscGlue {
  CopyStreamToMemory: (data: Uint8Array, size: number) => number
  /** glue 的 CShapeString 工厂（fonts.js:127）——持 wasm 堆指针 */
  AllocString: (size: number) => { pointer: number; size: number; getBuffer: () => Uint8Array; set: (i: number, v: number) => void; free: () => void }
  FT_CreateLibrary: () => number
  /** 原始签名 (library, heapPtr, size, faceIndex) —— engine.js 的 stream 包装在
   * CreateNativeStreamByIndex 后 data 即 wasm 堆指针（fonts.js:48726 CopyStreamToMemory） */
  FT_Open_Face: (lib: number, ptr: number, size: number, faceIndex: number) => number
  FT_Set_Char_Size: (face: number, w: number, h: number, hdpi: number, vdpi: number) => number
  FT_SetCMapForCharCode: (face: number, cp: number) => number
  FT_Load_Glyph: (face: number, gid: number, mode: number) => number
  FT_GetFaceInfo: (face: number, reader: BinaryReader) => ReturnObj
  FT_Get_Glyph_Measure_Params: (face: number, vectorWorker: number, reader: BinaryReader) => ReturnObj
  FT_GetFaceMaxAdvanceX: (face: number) => number
  HB_ShapeText: (fontFile: HBFontFile, text: ShapeString, features: number, script: number, direction: number, language: string, reader: BinaryReader) => ReturnObj
  Hyphen_Init: () => void
  Hyphen_Word: (lang: string, word: string) => number[]
  [k: string]: any
}

/** glue 的 CBinaryReader（engine.js:101-140）——小端读段游标。
 * glue 有两种调用：init(view)（FT_GetFaceInfo，start=0/size=len）与
 * init(buffer, start, size)（measure/HB 记录区，buffer 为整块 HEAP8）。 */
class BinaryReader {
  data: Int8Array = null as unknown as Int8Array
  pos = 0
  limit = 0
  init(data: Int8Array | Uint8Array, start?: number, size?: number): void {
    this.data = data as Int8Array
    this.pos = start ?? 0
    this.limit = this.pos + (size ?? data.length)
  }
  readInt(): number {
    const d = this.data
    const v = (d[this.pos] & 0xff) | ((d[this.pos + 1] & 0xff) << 8) | ((d[this.pos + 2] & 0xff) << 16) | ((d[this.pos + 3] & 0xff) << 24)
    this.pos += 4
    return v
  }
  readUInt(): number {
    const v = this.readInt()
    return v < 0 ? v + 4294967296 : v
  }
  readByte(): number {
    return this.data[this.pos++] & 0xff
  }
  readPointer64(): number {
    const i1 = this.readUInt()
    const i2 = this.readUInt()
    return i2 === 0 ? i1 : i2 * 4294967296 + i1
  }
}

/** glue 的 CShapeString 包装（fonts.js:127-128）——wasm 侧 UTF-8 串缓冲 */
class ShapeString {
  private constructor(private s: ReturnType<AscGlue['AllocString']>) {}
  static alloc(asc: AscGlue, size: number): ShapeString {
    return new ShapeString(asc.AllocString(size))
  }
  buffer(): Uint8Array {
    return this.s.getBuffer()
  }
  set(index: number, value: number): void {
    this.s.set(index, value)
  }
  get pointer(): number {
    return this.s.pointer
  }
  free(): void {
    this.s.free()
  }
}

/** HB_ShapeText 的鸭子型字体文件接口（glue 只经 GetFace/GetHBFont/SetHBFont 触碰它） */
interface HBFontFile {
  GetFace(): number
  GetHBFont(): number
  SetHBFont(f: number): void
}

// ─── 常量（与 sdkjs 逐一对应） ─────────────────────────────────────────────

/** engine.js:423 —— 测量永远在 576pt 下进行（9pt×64，保 16.16 定点精度） */
export const MEASURE_FONTSIZE = 576
/** engine.js:425 —— 16.16 定点@576pt → mm */
export const GRAPHEME_COEF = 25.4 / 72 / 64 / MEASURE_FONTSIZE
/** file.js:86-95 LOAD_MODE_DEFAULT = DEFAULT|NO_HINTING|LINEAR_DESIGN|NO_AUTOHINT */
const LOAD_MODE_DEFAULT = 0 | (1 << 1) | (1 << 13) | (1 << 15)
/** common.js:284-291 HB_FEATURE：kerning 常开 + liga/clig */
const HB_FEAT_KERN = 1 << 4
const HB_FEAT_LIGA = 1 << 0
const HB_FEAT_CLIG = 1 << 1
/** common.js:293+ HB_DIRECTION */
const HB_DIR_LTR = 4
/** HB_SCRIPT_COMMON='Zyyy'（HB_TAG 大端打包，common.js:56+） */
const SCRIPT_COMMON = hbTag('Z', 'y', 'y', 'y')
/** HB_SCRIPT_ARABIC='Arab' —— 阿语强制标准连字（word TextShaper.js:112-120 bug-73560） */
const SCRIPT_ARABIC = hbTag('A', 'r', 'a', 'b')

function hbTag(c1: string, c2: string, c3: string, c4: string): number {
  let s = ((c1.charCodeAt(0) & 0xff) << 24) | ((c2.charCodeAt(0) & 0xff) << 16) | ((c3.charCodeAt(0) & 0xff) << 8) | (c4.charCodeAt(0) & 0xff)
  if (s < 0) s += 4294967296
  return s
}

/** 26.6 定点 → 整数 pt（向零截断，与 sdkjs `>>6` 同语义；负值向 0 收缩） */
const fx = (v: number): number => v >> 6

/**
 * East Asian Width W/F 区间（UAX #11 精简表）——缺表全角码点的度量回退用。
 * 浏览器对无字形的 CJK 回退系统字体（恒 1em 全角框）；内核若按 sdkjs miss
 * 取 maxAdvance/2（半角框）→ 行宽低估一半（x16 实测 '你好世界' 44pt vs 22.3pt）。
 */
export function isFullwidthCp(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x303e) || // 部首/康熙/CJK 标点（含 U+3000 全角空格）
    (cp >= 0x3041 && cp <= 0x33ff) || // 假名·注音·谚文兼容·合围
    (cp >= 0x3400 && cp <= 0x4dbf) || // 扩展 A
    (cp >= 0x4e00 && cp <= 0x9fff) || // 统一表意
    (cp >= 0xa000 && cp <= 0xa4cf) || // 彝
    (cp >= 0xa960 && cp <= 0xa97f) || // 谚文扩展 A
    (cp >= 0xac00 && cp <= 0xd7a3) || // 谚文音节
    (cp >= 0xf900 && cp <= 0xfaff) || // 兼容表意
    (cp >= 0xfe10 && cp <= 0xfe19) || // 竖排标点
    (cp >= 0xfe30 && cp <= 0xfe6f) || // 兼容形式/小型变体
    (cp >= 0xff00 && cp <= 0xff60) || // 全角形式
    (cp >= 0xffe0 && cp <= 0xffe6) || // 全角符号
    (cp >= 0x20000 && cp <= 0x2fffd) || // 扩展 B–F
    (cp >= 0x30000 && cp <= 0x3fffd)
  )
}

// ─── Face 信息（engine.js:143-242 字段序） ─────────────────────────────────

export interface FaceInfo {
  unitsPerEm: number
  ascender: number
  descender: number
  height: number
  faceFlags: number
  numGlyphs: number
  familyName: string
  styleName: string
  os2Version: number
  os2WeightClass: number
  os2FsSelection: number
  os2WinAscent: number
  os2WinDescent: number
  os2DefaultChar: number
  os2TypoAscender: number
  os2TypoDescender: number
  os2TypoLineGap: number
  os2UnicodeRange1: number
  os2UnicodeRange2: number
  os2CodePageRange1: number
  os2nSymbolic: number
  headerYMin: number
  headerYMax: number
  monochromeSizes: number[]
}

function loadFaceInfo(asc: AscGlue, face: number): FaceInfo | null {
  const reader = new BinaryReader()
  const err = asc.FT_GetFaceInfo(face, reader)
  if (err.error) return null
  const info: FaceInfo = {
    unitsPerEm: reader.readUInt(),
    ascender: reader.readInt(),
    descender: reader.readInt(),
    height: reader.readInt(),
    faceFlags: reader.readInt(),
    numGlyphs: 0,
    familyName: '',
    styleName: '',
    os2Version: 0, os2WeightClass: 0, os2FsSelection: 0, os2WinAscent: 0, os2WinDescent: 0,
    os2DefaultChar: 0, os2TypoAscender: 0, os2TypoDescender: 0, os2TypoLineGap: 0,
    os2UnicodeRange1: 0, os2UnicodeRange2: 0, os2CodePageRange1: 0, os2nSymbolic: 0,
    headerYMin: 0, headerYMax: 0, monochromeSizes: [],
  }
  reader.readInt() // num_faces
  info.numGlyphs = reader.readInt()
  reader.readInt() // num_charmaps
  reader.readInt() // style_flags
  reader.readInt() // face_index
  let c = reader.readInt()
  while (c) {
    info.familyName += c < 0x10000 ? String.fromCharCode(c) : surrogate(c)
    c = reader.readInt()
  }
  c = reader.readInt()
  while (c) {
    info.styleName += String.fromCharCode(c)
    c = reader.readInt()
  }
  info.os2Version = reader.readInt()
  info.os2WeightClass = reader.readInt()
  info.os2FsSelection = reader.readInt()
  info.os2WinAscent = reader.readInt()
  info.os2WinDescent = reader.readInt()
  info.os2DefaultChar = reader.readInt()
  info.os2TypoAscender = reader.readInt()
  info.os2TypoDescender = reader.readInt()
  info.os2TypoLineGap = reader.readInt()
  info.os2UnicodeRange1 = reader.readUInt()
  info.os2UnicodeRange2 = reader.readUInt()
  reader.readUInt() // unicodeRange3
  reader.readUInt() // unicodeRange4
  info.os2CodePageRange1 = reader.readUInt()
  reader.readUInt() // codePageRange2
  info.os2nSymbolic = reader.readInt()
  info.headerYMin = reader.readInt()
  info.headerYMax = reader.readInt()
  const nFixed = reader.readInt()
  for (let i = 0; i < nFixed; i++) info.monochromeSizes.push(reader.readInt())
  err.free()
  return info
}

function surrogate(c: number): string {
  return String.fromCharCode(0xd800 | (c >> 10)) + String.fromCharCode(0xdc00 | (c & 0x3ff))
}

// ─── 字形度量（file.js:599-614 CFontCacheSizes 的度量半区） ────────────────

export interface GlyphMetrics {
  /** 查询键（码点或 GID） */
  key: number
  /** 0 正常 / 1 defaultChar 顶替 / 2 缺字 */
  state: 0 | 1 | 2
  gid: number
  /** 浮点 pt（linearHoriAdvance 设计单位 × size/upem —— sdkjs 唯一保小数项） */
  advanceX: number
  bbox: { minX: number; maxX: number; minY: number; maxY: number }
  metrics: {
    width: number; height: number
    horiBearingX: number; horiBearingY: number; horiAdvance: number
    vertBearingX: number; vertBearingY: number; vertAdvance: number
  }
}

// ─── FontFile（file.js 度量路径子集） ──────────────────────────────────────

export interface FontFileOpts {
  /** 伪粗体（无实体粗面时合成）—— Cell 模式 advance +1 的触发条件 */
  syntheticBold?: boolean
  /** 伪斜体（矩阵剪切，FONT_ITALIC_ANGLE=0.3090169943749）——度量路径不影响 advance */
  syntheticItalic?: boolean
}

/**
 * 一个 (字体文件, faceIndex, 字号) 三元组对应一个实例 —— sdkjs CFontFile 语义：
 * 每字号独立 FT_Face（hinting/位图 strike 依赖尺寸）。本原型只实现度量路径
 * （CacheGlyph isRaster=false），渲染 blit 路线（rasterheap/CGlyphBitmap）后置。
 */
export class FontFile implements HBFontFile {
  info: FaceInfo | null = null
  /** SetFace 后的生效度量（design units） */
  ascender = 0
  descender = 0
  lineHeight = 0
  unitsPerEm = 1
  private glyphCache = new Map<number, GlyphMetrics>()
  private hbFont = 0
  private facePtr = 0
  private readonly syntheticBold: boolean

  constructor(private asc: AscGlue, lib: number, bytes: Uint8Array, faceIndex: number, readonly sizePt: number, readonly mode: MeasureMode, opts: FontFileOpts = {}) {
    this.syntheticBold = !!opts.syntheticBold
    // engine.js CreateNativeStreamByIndex 语义：JS 字节 → 堆指针一次拷贝，face 共享
    const ptr = asc.CopyStreamToMemory(bytes, bytes.length)
    this.facePtr = asc.FT_Open_Face(lib, ptr, bytes.length, faceIndex)
    if (!this.facePtr) throw new Error('FT_Open_Face failed')
    this.info = loadFaceInfo(asc, this.facePtr)
    if (!this.info) throw new Error('FT_GetFaceInfo failed')
    this.setFace(mode)
    // file.js:1811 —— 打开即定字号（测量层恒 576pt；渲染层另行指定）
    asc.FT_Set_Char_Size(this.facePtr, 0, (sizePt * 64) >> 0, 0, 0)
  }

  /** file.js:1731-1826 SetFace —— Word 兼容的 OS/2 度量选择，魔数原样保留 */
  private setFace(mode: MeasureMode): void {
    const fi = this.info!
    this.unitsPerEm = fi.unitsPerEm
    this.ascender = fi.ascender
    this.descender = fi.descender
    this.lineHeight = fi.height
    // manager.js:150 IsUseWinOS2Params 恒真；os2 缺失（0xFFFF）时保留 hhea 值
    if (fi.os2Version === 0xffff) return
    if (mode === 'cell') {
      let winA = fi.os2WinAscent
      let winD = -fi.os2WinDescent
      // CJK 行高 ×1.3（file.js:1766-1771；0x2DF00000 = UnicodeRange2 CJK 位组）
      if ((fi.os2UnicodeRange2 & 0x2df00000) !== 0) {
        const add = ((winA - winD) * 0.3) >> 0
        winA += (add + 1) >> 1
        winD -= add >> 1
      }
      if (fi.height < winA - winD) {
        this.ascender = winA
        this.descender = winD
        this.lineHeight = winA - winD
      }
      return
    }
    // word / slide（file.js:1774-1800）—— “Everything here is selected after numerous tests”
    let nA = fi.os2WinAscent
    let nD = -fi.os2WinDescent
    let nG = 0
    // USE_TYPO_METRICS 位（fsSelection & 128）或 Cambria Math → 用 typo 三件套
    if ((fi.os2FsSelection & 128) !== 0 || fi.familyName === 'Cambria Math') {
      nA = fi.os2TypoAscender
      nD = fi.os2TypoDescender
      nG = fi.os2TypoLineGap
    }
    if (mode === 'word' && (fi.os2CodePageRange1 & 0x1e0000) !== 0) {
      // Word 的 CJK 代码页（932/936/950）行距规则
      this.lineHeight = ((nA - nD) * 1.3) | 0
      this.descender = (nD - (nA - nD) * 0.15) | 0
      this.ascender = this.lineHeight + this.descender
    } else {
      this.lineHeight = Math.max(this.lineHeight, nA - nD + nG)
      this.ascender = nA
      this.descender = nD
    }
  }

  GetFace(): number { return this.facePtr }
  GetHBFont(): number { return this.hbFont }
  SetHBFont(f: number): void { this.hbFont = f }

  /**
   * file.js:1070-1215 CacheGlyph 的度量路径（isRaster=false）。
   * 缺字回退链：cmap → Symbol 字体 0xF000 偏移 → defaultChar → miss(maxAdvance/2)。
   */
  glyph(key: number): GlyphMetrics {
    const hit = this.glyphCache.get(key)
    if (hit) return hit
    const m = this.measureGlyph(key)
    this.glyphCache.set(key, m)
    return m
  }

  private measureGlyph(key: number): GlyphMetrics {
    const fi = this.info!
    const miss = (): GlyphMetrics => ({
      key, state: 2, gid: -1,
      advanceX: (this.asc.FT_GetFaceMaxAdvanceX(this.facePtr) >> 6) / 2.0,
      bbox: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      metrics: { width: 0, height: 0, horiBearingX: 0, horiBearingY: 0, horiAdvance: 0, vertBearingX: 0, vertBearingY: 0, vertAdvance: 0 },
    })
    let gid = this.asc.FT_SetCMapForCharCode(this.facePtr, key)
    let state: 0 | 1 | 2 = 0
    if (gid <= 0 && fi.os2nSymbolic !== -1 && key < 0xf000) {
      // Symbol/Wingdings 约定：私有区字形 = 码点 + 0xF000（file.js:1078-1082）
      gid = this.asc.FT_SetCMapForCharCode(this.facePtr, key + 0xf000)
    }
    if (gid <= 0 && isFullwidthCp(key)) {
      // 全角 CJK 缺表：浏览器回退系统字体恒 1em；sdkjs miss 的 maxAdvance/2 半角框
      // 会把中文行宽低估一半（x16 实测）。非拉丁字体（有真 CJK 表）不走这里。
      return {
        key, state: 2, gid: -1,
        advanceX: this.sizePt, // 测量层 576pt → 1em@576；缩放后 = targetPt/字（全角恒 1em）
        bbox: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
        metrics: { width: 0, height: 0, horiBearingX: 0, horiBearingY: 0, horiAdvance: 0, vertBearingX: 0, vertBearingY: 0, vertAdvance: 0 },
      }
    }
    if (gid <= 0) {
      if (fi.os2DefaultChar >= 0) {
        gid = fi.os2DefaultChar
        state = 1
      } else return miss()
    }
    if (this.asc.FT_Load_Glyph(this.facePtr, gid, LOAD_MODE_DEFAULT) !== 0) return miss()
    const reader = new BinaryReader()
    const ret = this.asc.FT_Get_Glyph_Measure_Params(this.facePtr, 0, reader)
    if (ret.error) return miss()
    const mi = {
      bbox_xMin: reader.readInt(), bbox_yMin: reader.readInt(), bbox_xMax: reader.readInt(), bbox_yMax: reader.readInt(),
      width: reader.readInt(), height: reader.readInt(),
      horiAdvance: reader.readInt(), horiBearingX: reader.readInt(), horiBearingY: reader.readInt(),
      vertAdvance: reader.readInt(), vertBearingX: reader.readInt(), vertBearingY: reader.readInt(),
      linearHoriAdvance: reader.readInt(), linearVertAdvance: reader.readInt(),
    }
    ret.free()
    // file.js:1163 —— fAdvanceX 浮点 pt；Cell 伪粗 +1（file.js:1164-1166，真粗 weight≥800 不补）
    let adv = (mi.linearHoriAdvance * this.sizePt) / this.unitsPerEm
    const isDisableNeedBold = fi.os2Version !== 0xffff && fi.os2WeightClass >= 800
    if (this.mode === 'cell' && this.syntheticBold && !isDisableNeedBold) adv += 1
    return {
      key, state, gid, advanceX: adv,
      bbox: { minX: fx(mi.bbox_xMin), maxX: fx(mi.bbox_xMax), minY: fx(mi.bbox_yMin), maxY: fx(mi.bbox_yMax) },
      metrics: {
        width: fx(mi.width), height: fx(mi.height),
        horiBearingX: fx(mi.horiBearingX), horiBearingY: fx(mi.horiBearingY), horiAdvance: fx(mi.horiAdvance),
        vertBearingX: fx(mi.vertBearingX), vertBearingY: fx(mi.vertBearingY), vertAdvance: fx(mi.vertAdvance),
      },
    }
  }

  /** 面级度量 → pt（design units × size/upem；textmeasurer.js:419-439 的 pt 版） */
  faceMetrics(): { ascent: number; descent: number; height: number } {
    const k = this.sizePt / this.unitsPerEm
    return { ascent: this.ascender * k, descent: this.descender * k, height: this.lineHeight * k }
  }
}

// ─── Shaping（engine.js:564-615 的读回循环） ───────────────────────────────

export interface ShapedGrapheme {
  /** 组成该字簇的码点序列（连字时长度 >1） */
  codepoints: number[]
  /** 16.16 定点 advance 之和 × COEF = mm@每 1pt（× 目标字号 = 实际 mm；engine.js:608 同式） */
  widthMmPerPt: number
  /** 连字合成（type===2 LIGATURE） */
  ligature: boolean
}

/** 手工 UTF-8 编码（engine.js:498-555 HB_AppendToString），同时产出逐码点字节长度表 */
function encodeUtf8(codepoints: number[]): { bytes: Uint8Array; lens: number[] } {
  const out: number[] = []
  const lens: number[] = []
  for (const code of codepoints) {
    let n = 0
    if (code < 0x80) { out.push(code); n = 1 }
    else if (code < 0x800) { out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f)); n = 2 }
    else if (code < 0x10000) { out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f)); n = 3 }
    else { out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f)); n = 4 }
    lens.push(n)
  }
  out.push(0) // HB_EndString 的 NUL 终止
  return { bytes: new Uint8Array(out), lens }
}

/** 字节偏移 → 码点索引（cluster 前缀和二分） */
function cpIndex(prefix: number[], byteOffset: number): number {
  let lo = 0, hi = prefix.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (prefix[mid] <= byteOffset) lo = mid
    else hi = mid - 1
  }
  return lo
}

/**
 * 整串 shaping：码点 → 字簇数组。
 * features：kerning 常开 + liga/clig；阿语脚本额外强开标准连字。
 * 宽度 = Σ x_advance × COEF（mm@每 1pt），与 engine.js:608 逐 glyph 累计同式。
 */
export function shapeText(asc: AscGlue, font: FontFile, codepoints: number[], script = SCRIPT_COMMON): ShapedGrapheme[] {
  const out: ShapedGrapheme[] = []
  if (!codepoints.length) return out
  const { bytes, lens } = encodeUtf8(codepoints)
  const ss = ShapeString.alloc(asc, bytes.length)
  ss.buffer().set(bytes)
  const prefix = [0]
  for (const l of lens) prefix.push(prefix[prefix.length - 1] + l)
  const totalBytes = prefix[prefix.length - 1]
  let features = HB_FEAT_KERN | HB_FEAT_LIGA | HB_FEAT_CLIG
  if (script === SCRIPT_ARABIC) features |= HB_FEAT_LIGA
  const reader = new BinaryReader()
  const ret = asc.HB_ShapeText(font as unknown as HBFontFile, ss, features, script, HB_DIR_LTR, 'en', reader)
  if (ret.error) { ss.free(); return out }
  const recs: { cluster: number; xAdvance: number; type: number }[] = []
  for (let i = 0; i < ret.count; i++) {
    const type = reader.readByte()
    reader.readByte() // flags
    reader.readInt() // gid
    const cluster = reader.readInt()
    const xAdvance = reader.readInt()
    reader.readInt(); reader.readInt(); reader.readInt() // y_advance, x_offset, y_offset
    recs.push({ cluster, xAdvance, type })
  }
  ret.free()
  ss.free()
  // 按 cluster 变化切字簇（engine.js:593-612 的 FlushGrapheme 节奏）
  let i = 0
  while (i < recs.length) {
    const cluster = recs[i].cluster
    let j = i
    let w = 0
    let lig = false
    while (j < recs.length && recs[j].cluster === cluster) {
      w += recs[j].xAdvance
      if (recs[j].type === 2) lig = true // LIGATURE（engine.js:431）
      j++
    }
    const a = cpIndex(prefix, cluster)
    // 尾簇必须覆盖到串末码点：cpIndex 二分上界锁 n-1，byteOffset=totalBytes
    // 会少一位 —— 尾簇多码点（如 'ffi' 合并）时截丢尾码，clusters 长度恒等式
    // （measure.ts:114）破裂，flow snapOf 防御补裸 advance 污染行宽（x18 实测）
    const b = j < recs.length ? cpIndex(prefix, recs[j].cluster) : codepoints.length
    const cps = codepoints.slice(a, Math.max(b, a + 1))
    out.push({ codepoints: cps, widthMmPerPt: w * GRAPHEME_COEF, ligature: lig })
    i = j
  }
  return out
}

// ─── 引擎生命周期 ──────────────────────────────────────────────────────────

export interface FontEngine {
  asc: AscGlue
  lib: number
  /** 字体字节 → FontFile（度量用途；同一字节数组重复打开由调用方缓存实例） */
  openFont(bytes: Uint8Array, faceIndex: number, sizePt: number, mode: MeasureMode, opts?: FontFileOpts): FontFile
}

let enginePromise: Promise<FontEngine> | null = null

/** 执行宿主：主线程是 window，Worker 是 self（Worker 全局没有 window/document） */
function host(): any {
  return typeof window !== 'undefined' ? window : (self as any)
}

/**
 * public/ 资源的绝对 URL。Worker 里相对 fetch 一律不可用（解析基准是 worker 自己的
 * scriptURL，data:/blob: 下直接抛 Failed to parse URL），故主线程与 Worker 统一走绝对 URL。
 */
export function fontAssetUrl(path: string): string {
  const h = host()
  const base = typeof document !== 'undefined' && document.baseURI ? document.baseURI : h.location.href
  return new URL(path, base).href
}

/**
 * glue 依赖的最小垫片面。fonts.js 实测：loadScript / AscBrowser / isLeadingSurrogateChar /
 * retinaPixelRatio 全 0 引用（旧版这几段是死代码，已删）；真依赖只有 String.prototype.toUtf8
 * （HB_ShapeText 内部，8 处）与 window.AscFonts.onLoadModule 握手位。
 */
function installShims(): void {
  const h = host()
  h.AscFonts = h.AscFonts || {}
  h.AscFonts.onLoadModule = h.AscFonts.onLoadModule || (() => { /* loadEngine 覆写 */ })
  h.AscCommon = h.AscCommon || {}
  // 语言串编码走 String.prototype.toUtf8（glue HB_ShapeText 内部）；glue 自带 polyfill 时不覆盖
  if (typeof (String.prototype as any).toUtf8 !== 'function') {
    ;(String.prototype as any).toUtf8 = function (noEnd?: boolean): Uint8Array {
      const s = this as unknown as string
      const out: number[] = []
      for (let i = 0; i < s.length; i++) {
        let c = s.codePointAt(i)!
        if (c > 0xffff) i++
        if (c < 0x80) out.push(c)
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
        else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
        else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
      }
      if (!noEnd) out.push(0)
      return new Uint8Array(out)
    }
  }
}

/**
 * 加载 fonts.wasm 引擎（单例）。glue（public/fonts/fonts.js，vendored）自行 fetch
 * 同目录 fonts.wasm。
 *
 * 握手契约（fonts.js 实测行为，与 sdkjs loader 不同）：onLoadModule 被调【两次】——
 * ① glue 尾部同步调用（L149，wasm 尚未 instantiate，导出表为空壳；_ASC_FT_Init
 *    包装器是自毁式的：首次调用即把自身替换为 wasmExports["Ka"] 的 undefined，
 *    此后调用必抛 "not a function"。sdkjs 的 onLoadFontsModule 回调只做别名自赋值、
 *    从不触库创建，所以这次调用对它无害）；
 * ② __ATPOSTRUN__ 回调（L77，wasm 就绪，Hyphen_Init 已在同链上调过）。
 * 因此第一次调用必须原样放过，第二次才创建 FreeType 库并 resolve——全程只触
 * FT_CreateLibrary 一次。
 */
export function loadEngine(): Promise<FontEngine> {
  if (enginePromise) return enginePromise
  enginePromise = new Promise<FontEngine>((resolve, reject) => {
    installShims()
    const h = host()
    const prev = h.AscFonts.onLoadModule
    let calls = 0
    h.AscFonts.onLoadModule = function () {
      calls++
      if (calls === 1) { prev && prev(); return } // glue 尾部同步调用：wasm 未就绪，放过
      try {
        const asc = h.AscFonts as AscGlue
        // Hyphen_Init 已由 glue postRun 调用（与本次同链）—— 勿重复，否则泄漏两个应用实例
        const lib = asc.FT_CreateLibrary()
        if (!lib) return reject(new Error('FT_CreateLibrary failed'))
        resolve({
          asc, lib,
          openFont(bytes, faceIndex, sizePt, mode, opts) {
            return new FontFile(asc, lib, bytes, faceIndex, sizePt, mode, opts)
          },
        })
      } catch (e) {
        reject(e)
      }
    }
    const glue = fontAssetUrl('/fonts/fonts.js')
    if (typeof document !== 'undefined') {
      // 主线程：script 标签注入，document.currentScript 天然可定位 scriptDirectory
      const s = document.createElement('script')
      s.type = 'text/javascript'
      s.src = glue
      s.onerror = () => reject(new Error('fonts.js load failed'))
      document.head.appendChild(s)
      return
    }
    // Worker：无 document/head，script 标签路线整体不可用（相对 URL 也解析不了）。
    // glue 是 (function(window,undefined){…})(window,undefined) 的 IIFE —— fetch 源码后
    // 以 new Function('window', src) 传假 window 即命中；假 window.document.currentScript.src
    // 给 glue 定位 scriptDirectory（→ 同目录 fonts.wasm 的绝对 URL）。
    // 实测（glue-probe）：双握手到位、fonts.wasm 200、FT_CreateLibrary 成功。
    const doc = {
      currentScript: { src: glue },
      head: { appendChild() {} },
      createElement: () => ({ set src(_v: string) {}, set type(_v: string) {} }),
    }
    h.window = {
      location: h.location,
      navigator: h.navigator,
      fetch: (...a: Parameters<typeof h.fetch>) => h.fetch(...a),
      setImmediate: (fn: () => void) => h.setTimeout(fn, 0),
      document: doc,
      AscFonts: h.AscFonts,
      AscCommon: h.AscCommon,
    }
    h.document = doc
    void h.fetch(glue)
      .then((r: Response) => {
        if (!r.ok) throw new Error(`fonts.js load failed: ${r.status}`)
        return r.text()
      })
      .then((src: string) => {
        // eslint-disable-next-line no-new-func
        new Function('window', src)(h.window)
      })
      .catch((e: unknown) => reject(e instanceof Error ? e : new Error(String(e))))
  })
  return enginePromise
}