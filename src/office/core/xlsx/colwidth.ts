/**
 * P5 Excel 列宽/行高内核（sdkjs release/v10.0.0 逐行镜像，取证 2026-11-23）：
 *
 *   - 取整三件套：utils.js:132-150 —— int32 截断 + 负数补 + kLeftLim1 二进制精度修正。
 *     `x|0` 语义（32 位回绕）保留原样：列宽/行高数值域远小于 2^31，回绕不可达。
 *   - 三段式换算：Workbook.js:5147-5171 —— chars ⇄ mcw（1/256 量化）⇄ px。
 *   - MDW/padding：WorkbookView.js:4648-4671 —— 默认字体测 "0123456789" 逐字宽取 max
 *     （FlushGrapheme px 化：ascRound(wPt*96/72)，StringRender.js:223），
 *     padding=max(ceil(mdw/4),2)、ppb=2*padding+1；Calibri/Carlito 11 → 7/2/5（锚点 x19）。
 *   - 默认列宽：WorksheetView.js:623-631 —— base(=nBaseColWidth||8) → 三段式 →
 *     ceil(px/8)*8 → 回 chars；defaultColWidth 属性存在时覆盖 px（= mcw 语义，ECMA-376）。
 *   - 行高：StringRender.js:732-742（无上下标支）—— a=ceil(ascent*4/3)、
 *     d=ceil(|descent|*4/3)+1（+1 边框）、th=a+d；tm.height=Σline.th（多行 = 行数×th）。
 *     默认行高 = min(409.5pt, sheetFormatPr@ht(customHeight) ‖ px→pt(th))；
 *     pt→px = trunc(pt*4/3)（convertPtToPx >>0，utils.js:182-186）；
 *     px→pt = ceil(px*0.75*100)/100（convertPxToPt 百分位取整，utils.js:188-193）。
 *   - autoFit：WorksheetView.js:19405-19427（无合并/无旋转支）—— tm.width+ppb →
 *     chars → clamp 255 → mcw → px。
 *
 * 行高自适应（WorksheetView.js:10483-10489）：无 customHeight 且非跨行合并 →
 *   newHeight = min(maxRowHpx, max(oldHpx, tm.height))。老高 = 显式 ht 或默认行高。
 *
 * v1 简化（ponytail 标记）：
 *   - wrap 单元格的 tm.height 按显式 \n 段数计（段内按列宽折行未接 —— 需列宽上下文，
 *     升级路径：接 flow 断行原语后逐段实测）。
 *   - 旋转/上下标/筛选按钮附加宽不做（sdkjs 有角 sin/cos 展开与 +1px 按钮宽）。
 */
import { defaultRegistry } from '../font/measure'

const PT2PX = 96 / 72
const K_LEFT_LIM1 = 0.999999999999999

/** 行高上限 px（c_oAscMaxRowHeight=409.5pt → trunc(409.5*4/3)=546；commonDefines.js:455） */
export const MAX_ROW_H_PX = ascFloor(409.5 * PT2PX)

/** utils.js:138-143 Asc.floor */
export function ascFloor(x: number): number {
  let y = x | 0
  y -= x < 0 && y > x ? 1 : 0
  return y + (x - y > K_LEFT_LIM1 ? 1 : 0)
}
/** utils.js:145-150 Asc.ceil */
export function ascCeil(x: number): number {
  let y = x | 0
  y += x > 0 && y < x ? 1 : 0
  return y - (y - x > K_LEFT_LIM1 ? 1 : 0)
}
/** utils.js:132-136 Asc.round（.5 向零截断，非 Math.round） */
export function ascRound(x: number): number {
  const y = x + (x >= 0 ? 0.5 : -0.5)
  return y | y
}

// ── 三段式换算（Workbook.js:5147-5171） ─────────────────────────────────

/** chars → mcw（1/256 量化存储单位）；count<=0 → 0 */
export function charCountToModelColWidth(count: number, mdw: number, ppb: number): number {
  if (count <= 0) return 0
  return ascFloor(((count * mdw + ppb) / mdw) * 256) / 256
}

/** mcw → px（渲染用整数） */
export function modelColWidthToColWidth(mcw: number, mdw: number): number {
  return ascFloor(((256 * mcw + ascFloor(128 / mdw)) / 256) * mdw)
}

/** px → chars（<1 字符走比例分支） */
export function colWidthToCharCount(w: number, mdw: number, ppb: number): number {
  const pxInOneChar = mdw + ppb
  return w < pxInOneChar
    ? 1 - ascFloor((100 * (pxInOneChar - w)) / pxInOneChar + 0.49999) / 100
    : ascFloor(((w - ppb) / mdw) * 100 + 0.5) / 100
}

/** WorkbookView.js:4668-4669 */
export function paddingOf(mdw: number): { padding: number; ppb: number } {
  const padding = Math.max(ascCeil(mdw / 4), 2)
  return { padding, ppb: 2 * padding + 1 }
}

/** 列宽换算器（MDW 实测后一次性构造，同步消费 —— 流式解析在 async 装载缝里 await 出来） */
export interface ColWidthConv {
  mdw: number
  ppb: number
  /** 文件属性 chars → 渲染 px */
  toPx(chars: number): number
  /** 渲染 px → 文件属性 chars（写回用） */
  toChars(px: number): number
  /** chars → mcw（getDefaultWidth/oAllCol 语义） */
  toMcw(chars: number): number
}

export function makeConv(mdw: number, ppb: number): ColWidthConv {
  return {
    mdw,
    ppb,
    toPx: (chars) => modelColWidthToColWidth(charCountToModelColWidth(chars, mdw, ppb), mdw),
    toChars: (px) => colWidthToCharCount(px, mdw, ppb),
    toMcw: (chars) => charCountToModelColWidth(chars, mdw, ppb),
  }
}

/**
 * MDW 实测（WorkbookView.js:4648-4671）：默认字体测 "0123456789"，逐字 px 取 max。
 * FlushGrapheme 单码点支 w = ascRound(_width)（连字摊派在数字串不可达，簇 len>1 时
 * 按 len 摊后取 max 亦同式）。族名走 FontRegistry 回退链（未知族 → Carlito，度量兼容）。
 */
export async function measureMdw(family: string, pt: number): Promise<number> {
  const reg = await defaultRegistry()
  const fm = await reg.get(family, 'cell', {})
  const digits = '0123456789'
  const cl = fm.clusters(digits, pt)
  let max = 0
  for (const c of cl) {
    const per = ascRound((c.wPt / c.len) * PT2PX)
    if (per > max) max = per
  }
  if (!max) throw new Error("Error: can't measure text string") // sdkjs :4664 同式
  return max
}

/** 一次性构造：族+字号 → 实测 MDW → 换算器（loadSheet 异步缝里 await） */
export async function convFor(family: string, pt: number): Promise<ColWidthConv> {
  const mdw = await measureMdw(family, pt)
  return makeConv(mdw, paddingOf(mdw).ppb)
}

// ── 默认列宽（WorksheetView.js:623-631） ────────────────────────────────

/**
 * 默认列宽 px（WorksheetView.js:623-631 直读 xlsx 语义版）：
 *   defaultColWidth 属性（ECMA chars 口径）存在 → 三段式 chars→px 覆盖；
 *   否则 base(=baseColWidth||8) → 三段式 → ceil(px/8)*8（KB 214123 8 像素对齐）。
 * 注：sdkjs :631 把 dDefaultColWidth 直喂 modelColWidthToColWidth（mcw 口径）是
 * .bin converter 已换算的结果（initColumn Workbook.js:7668 同规）；xlsx XML 的
 * width 属性是 chars 语义，必须走完整三段式。
 */
export function defaultColWidthPx(conv: ColWidthConv, baseColWidth: number | undefined, defaultColWidthChars: number | undefined): number {
  if (defaultColWidthChars !== undefined && defaultColWidthChars > 0) return conv.toPx(defaultColWidthChars)
  const chars = conv.toMcw(baseColWidth || 8)
  return ascCeil(modelColWidthToColWidth(chars, conv.mdw) / 8) * 8
}

// ── 行高（StringRender.js:732-742 / WorksheetView.js:636-643, 10483-10489） ──

/** 单行 th px = ceil(ascent*4/3) + ceil(|descent|*4/3) + 1（边框）；descent 取幅值（契约恒非负由调用侧保证） */
export function lineHeightPx(mm: { ascent: number; descent: number }): number {
  return Math.max(0, ascCeil(mm.ascent * PT2PX)) + Math.max(0, ascCeil(Math.abs(mm.descent) * PT2PX)) + 1
}

/** pt → px（convertPtToPx：trunc，utils.js:182-186） */
export function ptToPx(pt: number): number {
  return ascFloor(pt * PT2PX)
}

/** px → pt（convertPxToPt：百分位 ceil，utils.js:188-193；retina=1） */
export function pxToPt(px: number): number {
  return ascCeil(px * (72 / 96) * 100) / 100
}

/**
 * 默认行高 px（WorksheetView.js:641-643）：min(409.5pt 上限, getDefaultHeight() || th)。
 * getDefaultHeight 只在 sheetFormatPr@customHeight="1" 时返回 defaultRowHeight（pt）；
 * 否则 = 度量 th（base 字体单行高 px）。th→pt→px 往返（pxToPt 百分位 ceil → ptToPx
 * trunc）对整数值恒等，直接用 th px。
 */
export function defaultRowHeightPx(customHeight: boolean, htPt: number | undefined, baseThPx: number): number {
  if (customHeight && htPt !== undefined && htPt > 0) return ptToPx(Math.min(409.5, htPt))
  return Math.min(ptToPx(409.5), baseThPx)
}

// ── autoFit（WorksheetView.js:19405-19427，无合并/旋转支） ──────────────

/** tm.width px → autoFit 列宽 px（+ppb → chars → clamp 255 → mcw → px） */
export function autoFitColPx(tmWidth: number, conv: ColWidthConv): number {
  const cc = Math.min(colWidthToCharCount(tmWidth + conv.ppb, conv.mdw, conv.ppb), 255)
  return modelColWidthToColWidth(charCountToModelColWidth(cc, conv.mdw, conv.ppb), conv.mdw)
}

// ── 单元格度量门面（一次异步预热，下游全同步） ──────────────────────────

/**
 * 一个工作簿的单元格度量上下文：默认字体（styles.xml fonts[0]）+ 出现过的字号集
 * 一次性预热后，列宽换算 / 行高 / 文本宽全部同步消费 —— 流式解析与写回补丁都不
 * 引入 await 缝隙（loadSheet 在 parse 前 await 本工厂）。
 */
export interface CellMetrics {
  conv: ColWidthConv
  /** 默认字体字号 pt（行内无格 / 未记样式时的基准） */
  basePt: number
  /** 单行 th px（StringRender.js:736-739 口径）；未预热字号回退 base 字体度量 */
  rowH(pt: number): number
  /** 文本 tm.width px（FlushGrapheme 逐字摊派和，StringRender.js:223-257） */
  textPx(text: string, pt: number): number
  /** 默认字体单行 th px（默认行高的度量来源） */
  baseThPx: number
}

export async function makeCellMetrics(family: string, basePt: number, pts: Iterable<number>): Promise<CellMetrics> {
  const reg = await defaultRegistry()
  const fm = await reg.get(family, 'cell', {})
  const mdw = await measureMdw(family, basePt)
  const conv = makeConv(mdw, paddingOf(mdw).ppb)
  const rowCache = new Map<number, number>()
  for (const pt of new Set(pts)) rowCache.set(pt, lineHeightPx(await fm.metrics(pt)))
  const baseThPx = rowCache.get(basePt) ?? lineHeightPx(await fm.metrics(basePt))
  return {
    conv,
    basePt,
    baseThPx,
    rowH: (pt) => rowCache.get(pt) ?? baseThPx,
    textPx: (text, pt) => {
      let tw = 0
      for (const c of fm.clusters(text, pt)) tw += ascRound((c.wPt / c.len) * PT2PX) * c.len
      return tw
    },
  }
}
