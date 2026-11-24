/**
 * 内置样式全量写回内核（路线图 P8 / 探针 x22）。sdkjs 来源：
 *  - word/Editor/Styles.js（CStyles 构造器 bCreateDefault 分支——190 条全量播种：
 *    127 表样式 Create_* + 32 段落 + 30 字符 + 1 编号）；
 *  - word/Editor/Serialize2.js:2235-2371（WriteStyle 单条写回；WriteStyles :2232 遍历全表）；
 *  - common/SerializeCommonWordExcel.js（**权威写语义**：WriteBorder :211-251 /
 *    WriteShd :297-350 / WriteColorTheme :412-434）+ Serialize2.js 的 rPr/pageBorder 段
 *    （:3225-3235 文字色 / :3080-3110 页边）——三处同构，见「颜色发射规则」条；
 *  - common/Drawings/Format/Format.js（ClrMap + wordTint/wordShade Apply）。
 *
 * 注册表本体：`builtin-data.json`（190 条）。生成方式 = 在宿主 realm 真跑 sdkjs
 * `new CStyles(true)`（vm.runInThisContext——vm.createContext 的 context 有独立
 * intrinsics，`instanceof Array` 跨 realm 永假，CParaTabs.Set_FromObject 静默失效，
 * Header/Footer 的 Tabs 会丢；boot harness 留档 /tmp/x22-eval/boot2.cjs），
 * walk 属性树 → snapshot → id 派生（产物实证优先，否则 PascalCase）→ 机械转录。
 * 127 条表样式的 Create_* 是运行时参数化（fUF(theme, tint, shade)），纯静态提取不可达，
 * 这是「必须跑引擎」而非「抄 default-styles.js 字面量」的根因。
 *
 * 序列化契约（逐条对 sdkjs 写路径原文 + 产物实证）：
 *  - 单位族：MM2Twips = floor(mm/(25.4/72/20)+0.5)；边框 sz = round(8·Size·72/25.4)
 *    （8 磅单位 getSizeIn8Point——Table Grid 0.176388mm → 4 ✓）；边框 space =
 *    round(Space·72/25.4)（磅）；字号 sz = 2·pt（半磅）；行距 LineRule=auto 时
 *    line = round(240·Line)，atLeast/exact 走 MM2Twips；字符间距 mm→twips
 *    （Title −0.176388mm → −10 ✓ 产物实证）；表距 tblCellMar Type=1(Mm)→dxa
 *    （1.9mm → 108 ✓）。
 *  - **颜色发射规则（三处同构，本次收口的核心）**：flat 值 = `Color ?? 解析(Unifill)`，
 *    仅当结果 `!=null && !Auto` 才落 hex，否则 "auto"；主题属性族的门 =
 *    `Unifill || (Color && Color.Auto)`。证据：WriteBorder :216-241、
 *    WriteShd :308-349、rPr 文字色 Serialize2.js:3225-3235——三者对 Color/Unifill 的
 *    优先级与 Auto 抑制完全一致。普查实证（190 条）：border 866 Unifill **全部**带
 *    Color 槽（0 Auto）；text 241 Unifill → 66 带 Color + **175 无 Color**（旧实现
 *    对这 175 发 val="auto"，引擎却 resolve(Unifill)→hex——本次修复的真偏差）；
 *    shd 439 Color 恒白哨兵→auto、Fill 从不出现、ThemeFill 365 全需解析。
 *  - themeColor 词表：w:themeColor/themeFill 用 WordprocessingML 长名（ClrMap.getColorNameWord：
 *    id 0-5→accent1-6、6→background1、7→background2、8/9→dark1/dark2、
 *    10/11→followedHyperlink/hyperlink、12/13→light1/light2、15/16→text1/text2；
 *    14=none 在 CreateThemeUnifill 直接 return null，不入快照）。theme.ts 的
 *    schemeWord 是单一来源。产物实证词表：accent1-6/background1/text1/text2/hyperlink。
 *  - themeTint/themeShade 落 **ST_UcharHexNumber**（ECMA-376 §17.18.98，1 字节 hex，
 *    FF=原色）：引擎存 0..255 整数（CreateThemeUnifill 的 tint/shade 实参就是
 *    0x99/0xBF 字节族，addMod 序 = wordTint 先、wordShade 后 :1470-1475），XML 写
 *    2 位大写 hex——产物实证 `w:themeTint="99"`（=153，十进制 99 是巧合陷阱）、
 *    `"BF"`（=191）。读侧对称修复见 theme.ts parseThemeMod（字节→wordTint/wordShade，
 *    万分比→lumMod/lumOff 兼容 x12）。双 mod 共存 137 条（fUF(text1,0x80,0x95) 族）。
 *  - CT_Shd 与 CT_Color 主题族**不同族不可混用**：shd 用 themeColor/themeFill/
 *    *Shade/*Tint（声明序，产物实证 `w:themeFill="accent3" w:themeFillTint="33"`）；
 *    color/border 用 themeColor/themeTint/themeShade（ECMA CT_Color 序，tint 先 shade 后）。
 *  - 元素顺序：w:style 子级按 ECMA CT_Style（name/basedOn/next/link/uiPriority/…/pPr/rPr/
 *    tblPr/trPr/tcPr/tblStylePr，与 writer.ts STYLE_ORDER 同源）；pPr 内序 =
 *    **CT_PPrBase**（keepNext→keepLines→numPr→pBdr→tabs→spacing→ind→contextualSpacing→
 *    jc→outlineLvl）；rPr 内序 = CT_RPr；tblPr 内序按 CT_TblPrBase（band sizes → tblInd →
 *    tblBorders → shd → tblCellMar）；tcPr 内序 = tcBorders → shd；
 *    tblStylePr 子序 pPr?rPr?tblPr?tcPr?trPr?（产物实证 rPr<tblPr<tcPr）。
 *  - 条件槽词表：TableFirstRow→firstRow … TableWholeTable→wholeTable，
 *    TLCell→nwCell/TRCell→neCell/BLCell→swCell/BRCell→seCell（WriteStyle :2326-2351 写侧；
 *    fromToJSON.js 读侧 nwCell→Set_TableTLCell——互逆一致，无映射 bug）。
 *    注册表 190 条只出现 9 槽（无角格、无 wholeTable 在此产物），全 13 槽词表照备。
 *  - Shd 空 Value（42 条，GridTable3 系 firstCol/lastCol）：源字面量 `Shd:{Color:{...}}`
 *    无 Value 键，Set_FromObject 直赋 `this.Value = undefined`——`ToXml_ST_Shd(undefined)`
 *    无 case 命中 → **w:val 省略**，引擎真实形态如实落盘，非捕获丢失。
 *  - Shd w:color 恒 "auto"：注册表全部 Shd.Color = 构造默认白 (255,255,255)
 *    （CDocumentShd 构造的「未设置」哨兵，源码 TODO 自认历史包袱）；WriteShd :326 对
 *    白哨兵仍 `!Auto` 落 hex，但**产物实证** 33 种 shd 形态 w:color 无一例外 "auto"——
 *    采产物口径（白→auto），实色（非白）防御性保留 hex 通道。
 *  - 上游怪癖如实保留：Create_* 的段落面字面量键名是 `Borders`，而
 *    CParaPr.Set_FromObject 只认 `Brd` → 表样式段落面无边框声明是 sdkjs 的**真实现**
 *    （产物对照：Word 自己写的表样式同样不带 pBdr）。注册表忠实于引擎态。
 *  - customStyle 是 **属性**（ECMA CT_Style `w:customStyle` s:ST_OnOff，与 type/default/
 *    styleId 同族），非子元素。注册表 0 条 custom，此为潜在正确性收口。
 *  - docDefaults = {}：写出路径 GetDefault*ForWrite 走 GetDiff(InitDefault)，
 *    对全新 CStyles 恒空差（boot 实证）。MdView 读侧 StyleSheet 自带默认回退，不发。
 *  - NumPr 仅 Lvl 无 NumId（Subtitle）：SDK 语义 numId=undefined 的 numPr 在读写两侧
 *    都不成立（SerNumPr 会发 numId:undefined；读侧 styles.ts numId 缺失即整槽丢弃）——
 *    序列化时**不发 numPr**，避免残缺元素破坏重开幂等。ponytail 注：这是全文件唯一
 *    一处「有意不忠实」，代价 = Subtitle 的 ilvl 提示丢失（无编号定义可指向，本就无效果）。
 *
 * 接线语义（writer.ts，#87 落地）：saveDocx 前对 styles part 做**缺失补写**——
 *  `planBuiltinWrite(existing)` 规划器一次算出「写回集」：按归一化名字
 *  （postload.normStyleName，sdkjs :8188 toLowerCase+去空白）查重排除文件已有条，
 *  对余下条目做 **id 分配**（避碰撞，与 ensureStyle 的 `id+i` 同径）+ **引用重定向**
 *  （basedOn/next/link 的注册表 id → 文件既有同名的 id / 同批写回的新 id / 不可达则丢弃），
 *  保证落盘后 styleId 唯一、引用闭合。字符串级插入到 `</w:styles>` 前（既有字节零扰动）。
 *  首次保存后文件全量，后续保存写回集为空 → 幂等；重开 StyleSheet.applyPostload 的
 *  missingDefaultStyles 按同一归一化查重，注册表含全部 4 缺省样式 → 注入集空，读写收敛。
 *  无 styles part 时合成最小根（与 ensureStyle 同径）。
 */
import registry from './builtin-data.json'
import { normStyleName } from './postload'
import { resolveColor, schemeWord, type Theme } from '../theme'

// ---------------------------------------------------------------- 注册表类型

interface RFontSlot {
  Name: string
  Index?: number
}
interface UniFill {
  __unifill: true
  themeColorId: number
  tint?: number
  shade?: number
}
interface DocColor {
  r: number
  g: number
  b: number
  Auto?: boolean
}
interface Border {
  Value?: number
  Size?: number
  Space?: number
  Color?: DocColor
  Unifill?: UniFill
}
interface Shd {
  Value?: number
  Color?: DocColor
  Fill?: DocColor
  Unifill?: UniFill
  ThemeFill?: UniFill
}
interface Measurement {
  Type: number
  W: number
}
interface BuiltinParaPr {
  KeepNext?: boolean
  KeepLines?: boolean
  ContextualSpacing?: boolean
  OutlineLvl?: number
  Jc?: number
  Ind?: { Left?: number; Right?: number; FirstLine?: number }
  Spacing?: { Before?: number; After?: number; BeforeAutoSpacing?: boolean; AfterAutoSpacing?: boolean; Line?: number; LineRule?: number }
  /** sdkjs CParaTabs 序列化形态 = {Tabs:[{Value,Pos,Leader}]}（boot 实证，非裸数组） */
  Tabs?: { Tabs?: { Value: number; Pos: number; Leader?: number }[] }
  Brd?: { Top?: Border; Bottom?: Border; Left?: Border; Right?: Border; Between?: Border }
  NumPr?: { Lvl?: number; NumId?: number }
}
interface BuiltinTextPr {
  Bold?: boolean
  BoldCS?: boolean
  Italic?: boolean
  ItalicCS?: boolean
  SmallCaps?: boolean
  Underline?: boolean
  VertAlign?: number
  Spacing?: number
  FontSize?: number
  FontSizeCS?: number
  Color?: DocColor
  RFonts?: Partial<Record<'Ascii' | 'HAnsi' | 'EastAsia' | 'CS', RFontSlot>>
  Unifill?: UniFill
}
interface BuiltinTablePr {
  TableInd?: number
  TableStyleRowBandSize?: number
  TableStyleColBandSize?: number
  TableBorders?: Partial<Record<'Top' | 'Left' | 'Bottom' | 'Right' | 'InsideH' | 'InsideV', Border>>
  TableCellMar?: Partial<Record<'Top' | 'Left' | 'Bottom' | 'Right', Measurement>>
  Shd?: Shd
}
interface BuiltinCondSlot {
  ParaPr?: BuiltinParaPr
  TextPr?: BuiltinTextPr
  TablePr?: BuiltinTablePr
  TableCellPr?: { Shd?: Shd; TableCellBorders?: Partial<Record<'Top' | 'Left' | 'Bottom' | 'Right', Border>> }
  TableRowPr?: Record<string, never>
}
export interface BuiltinEntry {
  id: string
  name: string
  type: 'paragraph' | 'character' | 'numbering' | 'table'
  default?: boolean
  basedOn?: string
  next?: string
  link?: string
  uiPriority?: number
  qFormat?: boolean
  semiHidden?: boolean
  unhideWhenUsed?: boolean
  hidden?: boolean
  custom?: boolean
  ParaPr?: BuiltinParaPr
  TextPr?: BuiltinTextPr
  TablePr?: BuiltinTablePr
  Conditions?: Partial<Record<string, BuiltinCondSlot>>
}

export const BUILTIN_STYLES: BuiltinEntry[] = registry.styles as BuiltinEntry[]

// ---------------------------------------------------------------- 单位换算族

/** fromToJSON.js private_MM2Twips——floor(mm/(25.4/72/20)+0.5) */
const MM2TWIP = 25.4 / 72 / 20
const mm2tw = (mm: number): number => Math.floor(mm / MM2TWIP + 0.5)
/** Styles.js getSizeIn8Point——round(8·Size·72/25.4) */
const borderSz = (mm: number): number => Math.round((8 * mm * 72) / 25.4)
/** Styles.js getSpaceInPoint——round(Space·72/25.4) */
const borderSpace = (mm: number): number => Math.round((mm * 72) / 25.4)

// ---------------------------------------------------------------- 词表

/** AscWord.BorderType——注册表只出现 -1(none)/0(nil)/1(single) */
const BORDER_VAL: Record<number, string> = { [-1]: 'none', 0: 'nil', 1: 'single' }
/** Asc.c_oAscShd 全表直抄（ToXml_ST_Shd） */
const SHD_VAL: Record<number, string> = {
  0: 'clear', 1: 'nil', 2: 'diagCross', 3: 'diagStripe', 4: 'horzCross', 5: 'horzStripe',
  6: 'pct10', 7: 'pct12', 8: 'pct15', 9: 'pct20', 10: 'pct25', 11: 'pct30', 12: 'pct35',
  13: 'pct37', 14: 'pct40', 15: 'pct45', 16: 'pct5', 17: 'pct50', 18: 'pct55', 19: 'pct60',
  20: 'pct62', 21: 'pct65', 22: 'pct70', 23: 'pct75', 24: 'pct80', 25: 'pct85', 26: 'pct87',
  27: 'pct90', 28: 'pct95', 29: 'reverseDiagStripe', 30: 'solid', 31: 'thinDiagCross',
  32: 'thinDiagStripe', 33: 'thinHorzCross', 34: 'thinHorzStripe', 35: 'thinReverseDiagStripe',
  36: 'thinVertStripe', 37: 'vertStripe',
}
/** AscCommon.align_* → jc */
const JC_VAL: Record<number, string> = { 0: 'end', 1: 'start', 2: 'center', 3: 'both', 4: 'distribute' }
/** Asc.c_oAscTabType → ST_TabJc */
const TAB_VAL: Record<number, string> = { 0: 'bar', 1: 'center', 2: 'clear', 3: 'decimal', 5: 'num', 7: 'right', 8: 'left' }
/** Asc.c_oAscTabLeader → ST_TabTlc */
const TAB_LEADER: Record<number, string> = { 0: 'dot', 1: 'heavy', 2: 'hyphen', 3: 'middleDot', 4: 'none', 5: 'underscore' }
/** AscCommon.vertalign_* → vertAlign；baseline=0 是默认值不发 */
const VERT_ALIGN: Record<number, string> = { 1: 'subscript', 2: 'superscript' }
/** linerule_* ——SerParaSpacing */
const LINE_RULE: Record<number, string> = { 0: 'atLeast', 1: 'auto', 2: 'exact' }
/** tblwidth_* ——SerTableMeasurement */
const MEAS_TYPE: Record<number, string> = { 0: 'auto', 1: 'dxa', 2: 'nil', 3: 'pct' }
/** 条件槽名 → w:tblStylePr @type（WriteStyle :2326-2351 写侧 / 读侧互逆） */
const COND_TYPE: Record<string, string> = {
  TableBand1Horz: 'band1Horz', TableBand1Vert: 'band1Vert', TableBand2Horz: 'band2Horz', TableBand2Vert: 'band2Vert',
  TableFirstCol: 'firstCol', TableFirstRow: 'firstRow', TableLastCol: 'lastCol', TableLastRow: 'lastRow',
  TableTLCell: 'nwCell', TableTRCell: 'neCell', TableBLCell: 'swCell', TableBRCell: 'seCell',
  TableWholeTable: 'wholeTable',
}
/** 条件槽发射序 = WriteStyle :2326-2351（band1Horz→…→wholeTable） */
const COND_ORDER = Object.keys(COND_TYPE)

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const hex2 = (n: number): string => Math.round(n).toString(16).toUpperCase().padStart(2, '0')
const hex6 = (c: DocColor): string => hex2(c.r) + hex2(c.g) + hex2(c.b)

// ---------------------------------------------------------------- 颜色发射

/**
 * themeColorId → w:themeColor 长名（ClrMap.getColorNameWord）。theme.ts 的 schemeWord
 * 是单一来源，此处只兜 14（none）与未知 id → undefined。
 */
const themeWord = (id: number): string | undefined => (id === 14 ? undefined : schemeWord(id))

/**
 * UniFill → themeColor/themeTint/themeShade 属性对（CT_Color 族，落 w: 属性形态）。
 * tint/shade 是 0..255 字节 → ST_UcharHexNumber 大写 hex。属性序 = ECMA CT_Color 声明序
 * （val,themeColor,themeTint,themeShade）；双 mod 共存（137 条）时两族都发——
 * 读侧按 sdkjs addMod 序（tint→shade）应用（theme.ts resolveColor 同径）。
 * 无 Unifill → 空串（不进入主题族）。
 */
function themeAttrs(W: string, u: UniFill | undefined): string {
  if (!u) return ''
  const name = themeWord(u.themeColorId)
  if (!name) return ''
  let s = ` ${W}themeColor="${name}"`
  if (u.tint !== undefined) s += ` ${W}themeTint="${hex2(u.tint)}"`
  if (u.shade !== undefined) s += ` ${W}themeShade="${hex2(u.shade)}"`
  return s
}

/**
 * w:color 发射（文字色；Serialize2.js:3225-3235 权威）：
 *  - flat val = `Color ?? 解析(Unifill)`——Color 槽存在且非 Auto → 其 hex；Color 缺失
 *    且有 Unifill 且有 theme → resolveHex；否则 "auto"（无 theme 时无法解析，落 auto，
 *    主题属性族仍发，读侧 resolveColor 可重建）。
 *  - 主题属性族门 = `Unifill || (Color && Color.Auto)`（注册表 Color 从不 Auto，等价 !!Unifill）。
 * 产物实证双写：`<w:color w:val="000000" w:themeColor="text1"/>`。
 */
function colorEl(W: string, c: DocColor | undefined, u: UniFill | undefined, theme: Theme | undefined): string {
  if (!c && !u) return ''
  let val: string
  if (c) val = c.Auto ? 'auto' : hex6(c)
  else val = u && theme ? resolvedHex(theme, u) ?? 'auto' : 'auto'
  return `<${W}color ${W}val="${val}"${themeAttrs(W, u)}/>`
}

/**
 * 边框发射（WriteBorder :211-251 权威）：属性序 val/sz/space/color/themeColor。
 *  - val：Value 缺失按 none；Size/Space 缺失按构造默认（sz=4、space=0——注册表均带显式值，
 *    兜底只防转录遗漏）。
 *  - color 与文字色同规则：`Color ?? 解析(Unifill)`，Auto/不可解析 → auto。
 *    注册表 866 border Unifill 全部带非 Auto 的 Color 槽，故恒走 hex 分支；
 *    resolve 通道为忠实引擎语义保留（防御未来注册表出现无 Color 的边框）。
 */
function borderEl(W: string, name: string, b: Border | undefined, theme: Theme | undefined): string {
  if (!b) return ''
  const val = b.Value !== undefined ? BORDER_VAL[b.Value] ?? 'none' : 'none'
  const sz = b.Size !== undefined ? borderSz(b.Size) : 4
  const sp = b.Space !== undefined ? borderSpace(b.Space) : 0
  let color: string
  if (b.Color) color = b.Color.Auto ? 'auto' : hex6(b.Color)
  else color = b.Unifill && theme ? resolvedHex(theme, b.Unifill) ?? 'auto' : 'auto'
  return `<${W}${name} ${W}val="${val}" ${W}sz="${sz}" ${W}space="${sp}" ${W}color="${color}"${themeAttrs(W, b.Unifill)}/>`
}

/**
 * w:shd 发射（WriteShd :297-350 权威 + 产物实证）：
 *  - w:val = SHD_VAL[Value]；Value undefined → 省略（42 条 GridTable3 firstCol/lastCol）。
 *  - w:color = `Color ?? 解析(Unifill)`：注册表 Shd.Color 恒白哨兵 (255,255,255)，
 *    二进制路径 :326 对白仍落 hex，但**产物 33 形态 w:color 一律 "auto"**——采产物口径
 *    （白→auto），实色（非白）保留 hex 通道（防御性，注册表 0 条）。Unifill 无 Color 时
 *    resolve（注册表 shd Unifill 全部伴随白 Color，故恒 auto；通道保留）。
 *  - w:fill = `Fill ?? 解析(ThemeFill)`：注册表 Shd.Fill 从不出现，恒走 ThemeFill 解析
 *    （365 条）；产物实证 Word 双写 `w:fill="9BBB59" w:themeFill="accent3"`。
 *  - 主题属性族走 **CT_Shd 词表**（themeColor/themeFill/*Shade/*Tint，声明序；与 CT_Color
 *    的 themeTint/themeShade 不同族，不可混用）。发射序对齐 ECMA：val, color, fill,
 *    themeColor, themeFill, themeColorShade, themeFillShade, themeColorTint, themeFillTint。
 */
function shdEl(W: string, s: Shd | undefined, theme: Theme | undefined): string {
  if (!s) return ''
  const val = s.Value !== undefined ? SHD_VAL[s.Value] : undefined
  const isWhite = (c: DocColor) => c.r === 255 && c.g === 255 && c.b === 255
  // w:color：白哨兵/Auto/不可解析 → auto；实色 → hex
  let color: string | undefined
  if (s.Color && !s.Color.Auto && !isWhite(s.Color)) color = hex6(s.Color)
  else if (!s.Color && s.Unifill && theme) color = resolvedHex(theme, s.Unifill)
  // w:fill：Fill 槽 ?? 解析(ThemeFill)
  let fill: string | undefined
  if (s.Fill) fill = s.Fill.Auto ? undefined : hex6(s.Fill)
  else if (s.ThemeFill && theme) fill = resolvedHex(theme, s.ThemeFill)
  const pairs: [string, UniFill | undefined][] = [
    ['themeColor', s.Unifill],
    ['themeFill', s.ThemeFill],
  ]
  let out = `<${W}shd`
  if (val) out += ` ${W}val="${val}"`
  out += color ? ` ${W}color="${color}"` : ` ${W}color="auto"`
  if (fill) out += ` ${W}fill="${fill}"`
  for (const [slot, u] of pairs) {
    const name = u && themeWord(u.themeColorId)
    if (name) out += ` ${W}${slot}="${name}"`
  }
  for (const [slot, u] of pairs) {
    if (u && themeWord(u.themeColorId)) out += ` ${W}${slot}Shade="${hex2(u.shade ?? 255)}"`
  }
  for (const [slot, u] of pairs) {
    if (u && themeWord(u.themeColorId)) out += ` ${W}${slot}Tint="${hex2(u.tint ?? 255)}"`
  }
  return out + '/>'
}

/** UniFill 经主题管线解析为 6 位大写 hex（走 theme.ts 单一实现，禁重复造轮子） */
function resolvedHex(theme: Theme, u: UniFill): string | undefined {
  const name = themeWord(u.themeColorId)
  if (!name) return undefined
  const el: import('../xml').XEl = { n: 'color', a: { themeColor: name }, c: [], t: '' }
  if (u.tint !== undefined) el.a.themeTint = hex2(u.tint)
  if (u.shade !== undefined) el.a.themeShade = hex2(u.shade)
  const h = resolveColor(el, theme)
  return h ? h.slice(1).toUpperCase() : undefined
}

// ---------------------------------------------------------------- pPr / rPr / tblPr 发射

function paraPr(W: string, p: BuiltinParaPr | undefined, theme: Theme | undefined): string {
  if (!p) return ''
  let s = ''
  // ECMA CT_PPrBase 序：keepNext, keepLines, numPr, pBdr, tabs, spacing, ind, contextualSpacing, jc, outlineLvl
  if (p.KeepNext) s += `<${W}keepNext/>`
  if (p.KeepLines) s += `<${W}keepLines/>`
  // NumPr 仅 Lvl 无 NumId 不发（头注 ponytail 裁决）
  if (p.NumPr && p.NumPr.NumId !== undefined) {
    s += `<${W}numPr><${W}ilvl ${W}val="${p.NumPr.Lvl ?? 0}"/><${W}numId ${W}val="${p.NumPr.NumId}"/></${W}numPr>`
  }
  if (p.Brd) {
    const sides: [string, Border | undefined][] = [
      ['top', p.Brd.Top], ['left', p.Brd.Left], ['bottom', p.Brd.Bottom], ['right', p.Brd.Right], ['between', p.Brd.Between],
    ]
    const inner = sides.map(([n, b]) => borderEl(W, n, b, theme)).join('')
    if (inner) s += `<${W}pBdr>${inner}</${W}pBdr>`
  }
  if (p.Tabs?.Tabs?.length) {
    s += `<${W}tabs>` + p.Tabs.Tabs.map((t) => {
      const val = TAB_VAL[t.Value] ?? 'left'
      const leader = t.Leader !== undefined ? (TAB_LEADER[t.Leader] ? ` ${W}leader="${TAB_LEADER[t.Leader]}"` : '') : ''
      return `<${W}tab ${W}val="${val}" ${W}pos="${mm2tw(t.Pos)}"${leader}/>`
    }).join('') + `</${W}tabs>`
  }
  const sp = p.Spacing
  if (sp) {
    const a: string[] = []
    if (sp.Before !== undefined) a.push(`${W}before="${mm2tw(sp.Before)}"`)
    if (sp.BeforeAutoSpacing !== undefined) a.push(`${W}beforeAutoSpacing="${sp.BeforeAutoSpacing ? 'on' : 'off'}"`)
    if (sp.After !== undefined) a.push(`${W}after="${mm2tw(sp.After)}"`)
    if (sp.AfterAutoSpacing !== undefined) a.push(`${W}afterAutoSpacing="${sp.AfterAutoSpacing ? 'on' : 'off'}"`)
    if (sp.Line !== undefined && sp.LineRule !== undefined) {
      const rule = LINE_RULE[sp.LineRule]
      if (rule) {
        a.push(`${W}line="${rule === 'auto' ? Math.round(240 * sp.Line) : mm2tw(sp.Line)}"`)
        a.push(`${W}lineRule="${rule}"`)
      }
    }
    if (a.length) s += `<${W}spacing ${a.join(' ')}/>`
  }
  if (p.Ind) {
    const a: string[] = []
    if (p.Ind.Left !== undefined) a.push(`${W}left="${mm2tw(p.Ind.Left)}"`)
    if (p.Ind.Right !== undefined) a.push(`${W}right="${mm2tw(p.Ind.Right)}"`)
    if (p.Ind.FirstLine !== undefined) a.push(`${W}firstLine="${mm2tw(p.Ind.FirstLine)}"`)
    if (a.length) s += `<${W}ind ${a.join(' ')}/>`
  }
  if (p.ContextualSpacing) s += `<${W}contextualSpacing/>`
  if (p.Jc !== undefined && JC_VAL[p.Jc]) s += `<${W}jc ${W}val="${JC_VAL[p.Jc]}"/>`
  if (p.OutlineLvl !== undefined) s += `<${W}outlineLvl ${W}val="${p.OutlineLvl}"/>`
  return s ? `<${W}pPr>${s}</${W}pPr>` : ''
}

function textPr(W: string, t: BuiltinTextPr | undefined, theme: Theme | undefined): string {
  if (!t) return ''
  let s = ''
  const rf = t.RFonts
  if (rf) {
    const a: string[] = []
    if (rf.Ascii) a.push(`${W}ascii="${esc(rf.Ascii.Name)}"`)
    if (rf.HAnsi) a.push(`${W}hAnsi="${esc(rf.HAnsi.Name)}"`)
    if (rf.EastAsia) a.push(`${W}eastAsia="${esc(rf.EastAsia.Name)}"`)
    if (rf.CS) a.push(`${W}cs="${esc(rf.CS.Name)}"`)
    if (a.length) s += `<${W}rFonts ${a.join(' ')}/>`
  }
  if (t.Bold) s += `<${W}b/>`
  if (t.BoldCS) s += `<${W}bCs/>`
  if (t.Italic) s += `<${W}i/>`
  if (t.ItalicCS) s += `<${W}iCs/>`
  if (t.SmallCaps) s += `<${W}smallCaps/>`
  s += colorEl(W, t.Color, t.Unifill, theme)
  if (t.Spacing !== undefined) s += `<${W}spacing ${W}val="${mm2tw(t.Spacing)}"/>`
  if (t.FontSize !== undefined) s += `<${W}sz ${W}val="${Math.round(2 * t.FontSize)}"/>`
  if (t.FontSizeCS !== undefined) s += `<${W}szCs ${W}val="${Math.round(2 * t.FontSizeCS)}"/>`
  if (t.Underline) s += `<${W}u ${W}val="single"/>`
  if (t.VertAlign !== undefined && t.VertAlign !== 0 && VERT_ALIGN[t.VertAlign]) s += `<${W}vertAlign ${W}val="${VERT_ALIGN[t.VertAlign]}"/>`
  return s ? `<${W}rPr>${s}</${W}rPr>` : ''
}

function tablePr(W: string, p: BuiltinTablePr | undefined, theme: Theme | undefined): string {
  if (!p) return ''
  let s = ''
  if (p.TableStyleRowBandSize !== undefined) s += `<${W}tblStyleRowBandSize ${W}val="${p.TableStyleRowBandSize}"/>`
  if (p.TableStyleColBandSize !== undefined) s += `<${W}tblStyleColBandSize ${W}val="${p.TableStyleColBandSize}"/>`
  if (p.TableInd !== undefined) s += `<${W}tblInd ${W}w="${mm2tw(p.TableInd)}" ${W}type="dxa"/>`
  if (p.TableBorders) {
    const order: [string, Border | undefined][] = [
      ['top', p.TableBorders.Top], ['left', p.TableBorders.Left], ['bottom', p.TableBorders.Bottom],
      ['right', p.TableBorders.Right], ['insideH', p.TableBorders.InsideH], ['insideV', p.TableBorders.InsideV],
    ]
    const inner = order.map(([n, b]) => borderEl(W, n, b, theme)).join('')
    if (inner) s += `<${W}tblBorders>${inner}</${W}tblBorders>`
  }
  s += shdEl(W, p.Shd, theme)
  if (p.TableCellMar) {
    const inner = (['top', 'left', 'bottom', 'right'] as const)
      .map((n) => {
        const m = p.TableCellMar![n[0].toUpperCase() + n.slice(1) as keyof NonNullable<BuiltinTablePr['TableCellMar']>]
        if (!m) return ''
        const type = MEAS_TYPE[m.Type] ?? 'dxa'
        const w = m.Type === 1 ? mm2tw(m.W) : m.Type === 3 ? m.W : 0
        return `<${W}${n} ${W}w="${w}" ${W}type="${type}"/>`
      })
      .join('')
    if (inner) s += `<${W}tblCellMar>${inner}</${W}tblCellMar>`
  }
  return s ? `<${W}tblPr>${s}</${W}tblPr>` : ''
}

function cellPr(W: string, c: BuiltinCondSlot['TableCellPr'], theme: Theme | undefined): string {
  if (!c) return ''
  let s = ''
  if (c.TableCellBorders) {
    const inner = (['top', 'left', 'bottom', 'right'] as const)
      .map((n) => borderEl(W, n, c.TableCellBorders![n[0].toUpperCase() + n.slice(1) as keyof NonNullable<BuiltinCondSlot['TableCellPr']>['TableCellBorders']], theme))
      .join('')
    if (inner) s += `<${W}tcBorders>${inner}</${W}tcBorders>`
  }
  s += shdEl(W, c.Shd, theme)
  return s ? `<${W}tcPr>${s}</${W}tcPr>` : ''
}

/** 条件槽（SerTableStylePr + 产物实证子序 pPr?rPr?tblPr?tcPr?trPr?） */
function condSlot(W: string, type: string, slot: BuiltinCondSlot, theme: Theme | undefined): string {
  const inner = paraPr(W, slot.ParaPr, theme) + textPr(W, slot.TextPr, theme) + tablePr(W, slot.TablePr, theme) + cellPr(W, slot.TableCellPr, theme)
  if (!inner) return ''
  return `<${W}tblStylePr ${W}type="${type}">${inner}</${W}tblStylePr>`
}

// ---------------------------------------------------------------- 条目发射

/**
 * 单条注册表条目 → 完整 `<w:style>` XML。`W` 是带冒号的命名空间前缀（':w:' 或 ':x:'）。
 * theme 提供时，无 Color 槽的 Unifill（文字 175 条）与 ThemeFill（shd 365 条）解析出
 * flat w:color/w:fill 的 hex 兜底（产物实证 Word 双写）；缺 theme 时只落主题属性族——
 * 读侧 resolveColor 对纯属性形式同样可解析，hex 兜底是兼容性加成而非必需。
 * customStyle 落**属性**（ECMA CT_Style，与 type/default/styleId 同族）。
 */
export function serializeBuiltinStyle(entry: BuiltinEntry, W: string, theme?: Theme): string {
  const attrs =
    `${W}type="${entry.type}"` +
    (entry.default ? ` ${W}default="1"` : '') +
    (entry.custom ? ` ${W}customStyle="1"` : '') +
    ` ${W}styleId="${esc(entry.id)}"`
  let s = `<${W}style ${attrs}><${W}name ${W}val="${esc(entry.name)}"/>`
  if (entry.basedOn) s += `<${W}basedOn ${W}val="${esc(entry.basedOn)}"/>`
  if (entry.next) s += `<${W}next ${W}val="${esc(entry.next)}"/>`
  if (entry.link) s += `<${W}link ${W}val="${esc(entry.link)}"/>`
  if (entry.hidden) s += `<${W}hidden/>`
  if (entry.uiPriority !== undefined) s += `<${W}uiPriority ${W}val="${entry.uiPriority}"/>`
  if (entry.semiHidden) s += `<${W}semiHidden/>`
  if (entry.unhideWhenUsed) s += `<${W}unhideWhenUsed/>`
  if (entry.qFormat) s += `<${W}qFormat/>`
  s += paraPr(W, entry.ParaPr, theme)
  s += textPr(W, entry.TextPr, theme)
  s += tablePr(W, entry.TablePr, theme)
  if (entry.Conditions) {
    for (const name of COND_ORDER) {
      const slot = entry.Conditions[name]
      if (slot) s += condSlot(W, COND_TYPE[name], slot, theme)
    }
  }
  return s + `</${W}style>`
}

// ---------------------------------------------------------------- 写回规划器

/**
 * 文件当前样式的最小视图。**查重按 styleId ∪ 归一化名字**（见 planBuiltinWrite 头注）：
 * styleId 是内置样式的语言无关身份（Word 按它匹配内置槽），w:name 可本地化（中文
 * 「标题 1」仍是 Heading1）；只按名字查重会把本地化文件误判为缺失→重分配 id→生成幽灵重复。
 */
export interface ExistingStyle {
  name: string
  id: string
}

/** 文件既有样式的三重索引（id 集 / 归一化名集 / 归一化名→文件 id，供引用重定向） */
function indexExisting(existing: Iterable<ExistingStyle>): { ids: Set<string>; names: Set<string>; idByName: Map<string, string> } {
  const ids = new Set<string>()
  const names = new Set<string>()
  const idByName = new Map<string, string>()
  for (const { name, id } of existing) {
    ids.add(id)
    const nn = normStyleName(name)
    names.add(nn)
    if (!idByName.has(nn)) idByName.set(nn, id)
  }
  return { ids, names, idByName }
}

/**
 * 缺失过滤的唯一实现（builtinMissing 与 planBuiltinWrite 共用，杜绝双源分歧）：
 * 注册表条目 id 命中文件既有 id **或** 归一化名字命中文件既有名字 → 视为已在，排除。
 */
function filterMissing(idx: ReturnType<typeof indexExisting>): BuiltinEntry[] {
  return BUILTIN_STYLES.filter((e) => !idx.ids.has(e.id) && !idx.names.has(normStyleName(e.name)))
}

/** 文件（按 id ∪ 归一化名字）之外的注册表条目，保持播种序（= sdkjs 播种序） */
export function builtinMissing(existing: Iterable<ExistingStyle>): BuiltinEntry[] {
  return filterMissing(indexExisting(existing))
}

/**
 * 写回规划器：一次算出「安全写回集」——在 id ∪ name 缺失过滤之上补 **id 分配 + 引用重定向**，
 * 保证落盘后 styleId 唯一、basedOn/next/link 闭合。返回可直接喂 serializeBuiltinStyles
 * 的条目副本（不改注册表）。
 *  - id 分配：优先注册表 id；与文件既有 id 或同批已分配 id 冲突 → 追加序号
 *    （Heading1 → Heading12…，与 ensureStyle 旧路 `id+i` 同径）。id ∪ name 查重后
 *    仍碰撞的只可能是「文件用同 id 装了不同名样式」的病态例，重命名是唯一安全解。
 *  - 引用重定向：注册表引用指向**注册表 id**，解析序 =
 *    (1) 文件已有该 id → 原样用；(2) 文件已有目标注册表条目的**归一化名字**（本地化/
 *    改 id 情形）→ 用文件 id；(3) 同批写回的目标 → 用其新分配 id；(4) 都不可达 → 丢弃
 *    该引用（悬空不写，避免重开 cutBasedOnCycles 报错）。
 */
export function planBuiltinWrite(existing: Iterable<ExistingStyle>): BuiltinEntry[] {
  const idx = indexExisting(existing)
  const missing = filterMissing(idx)
  const regById = new Map(BUILTIN_STYLES.map((e) => [e.id, e]))
  // 第一遍：分配 styleId，登记 name→新id（供同批引用重定向）
  const used = new Set(idx.ids)
  const appendedId = new Map<string, string>()
  const placed: BuiltinEntry[] = []
  for (const e of missing) {
    let id = e.id
    if (used.has(id)) {
      let i = 2
      while (used.has(`${e.id}${i}`)) i++
      id = `${e.id}${i}`
    }
    used.add(id)
    appendedId.set(normStyleName(e.name), id)
    placed.push({ ...e, id })
  }
  // 第二遍：重定向引用（对原始注册表 id 解析——placed 副本仍带原始 basedOn/next/link）
  const redirect = (refId: string | undefined): string | undefined => {
    if (!refId) return undefined
    if (idx.ids.has(refId)) return refId
    const target = regById.get(refId)
    if (!target) return undefined
    const tName = normStyleName(target.name)
    return idx.idByName.get(tName) ?? appendedId.get(tName)
  }
  return placed.map((e) => {
    const out: BuiltinEntry = { ...e }
    const bo = redirect(e.basedOn)
    if (bo) out.basedOn = bo
    else delete out.basedOn
    const nx = redirect(e.next)
    if (nx) out.next = nx
    else delete out.next
    const lk = redirect(e.link)
    if (lk) out.link = lk
    else delete out.link
    return out
  })
}

/** 规划后条目全量发射（接线方拼接到 styles 根尾部；无 part 时合成根） */
export function serializeBuiltinStyles(entries: BuiltinEntry[], W: string, theme?: Theme): string {
  return entries.map((e) => serializeBuiltinStyle(e, W, theme)).join('')
}
