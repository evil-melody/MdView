/**
 * P6 内核（x20 门）：占位符继承匹配 + normAutofit 缩放搜索。逐行核实 sdkjs：
 *
 * 1. getMatchingShape（SlideBase.js:327-466）—— 六级匹配瀑布，reduced 语义：
 *    - type null → phType_body('body')；ctrTitle → title；其余原样。
 *    - idx null → 0。
 *    - 第一遍：reduced(type)===reduced(glyphType) && reduced(idx)===reduced(glyphIdx) → 命中；
 *      特例 reduced 双方皆 title 亦命中（:383，容忍 idx 不同的 title 回退）；
 *      途中累计 body_count / last_body（glyphType==='body' 原始串）。
 *    - special-ph（sldNum/dt/ftr/hdr/sldImg）第二遍忽略 idx 按 type 命中（:398）。
 *    - info 传入时（:416）命中即返，否则走兜底：
 *      body_count===1 && body && bSingleBody → last_body（:419）；
 *      第三遍仅比 reduced(idx)（:426，bBadMatch=true）；
 *      body_count===1 && bSingleBody → last_body（:458）。
 *    - bBadMatch = !(glyphType===请求type && glyphIdx===请求idx)（精确串不符即坏配）。
 *
 * 2. normAutofit 二分搜索（Shape.js:5140-5250，Check_AutoFit 的 NormAuto 支）：
 *    - aScales = [25000,30000,…,95000,10000]（:4441，16 项；末项 10000 为异常哨兵，
 *      搜索域 nCurIndex∈[0,15]，aScales[nCurIndex] 最大取到 95000（nCurIndex=14），
 *      10000 永不被选中——保真锁：表长 16、末项 10000 原样保留）。
 *    - 入口早退（:5151）：XML 无 fontScale/lnSpcReduction 且 contentHeight≤clipH → 不算。
 *    - 先试 100000 档（recalculateContentWitCompiledPr 默认无 scale）；放得下 → 写回 undefined。
 *    - 放不下 → 二分：nCurIndex=15、nCurShift=-8；每轮 nCurIndex+=nCurShift，
 *      试 aScales[nCurIndex-1]（低一档）；放得下 → 回探 aScales[nCurIndex]（高一档），
 *      高一档放不下 → 命中低一档 break；高一档也放得下 → nCurShift=|shift|/2 向右；
 *      低一档放不下 → nCurShift=-|shift|/2 向左；|shift|<1 → break；
 *      nCurIndex-1<0 → 锁 aScales[0]=25000 break。
 *    - lnSpcReduction = 0.2*(100000-fontScale)>>0（:5196，整数截断）。
 *    - 标题下限（:5223）：fontScale<90000 且为 title/ctrTitle 占位符 → 强抬 90000。
 *
 * 纯函数、零依赖：heightOf(scale) 由调用方注入（视图层两次布局喂实测高），
 * 使算法可脱离渲染做数值断言（x20 合成 heightOf 复现轨迹）。
 */

/** OOXML ST_PlaceholderType 字符串值（sdkjs 数字枚举的 XML 串形态，Format.js:21261 词表对齐） */
export type PhTypeStr = string

export interface PhGlyph {
  /** p:ph 的 type 属性原始串（缺失=undefined，reduced 时归 'body'） */
  type?: string
  /** p:ph 的 idx 属性原始串（缺失=undefined，reduced 时归 '0'） */
  idx?: string
}

/** sdkjs reduced_type：null→body、ctrTitle→title（SlideBase.js:329-337） */
export function reducePhType(t: string | undefined): string {
  if (t === undefined || t === null) return 'body'
  return t === 'ctrTitle' ? 'title' : t
}
/** sdkjs reduced_index：null→0（:339-344） */
export function reducePhIdx(i: string | undefined): string {
  return i === undefined || i === null ? '0' : i
}

const SPECIAL_PH = new Set(['sldNum', 'dt', 'ftr', 'hdr', 'sldImg'])
/** special-ph 判定（:398，用 reduced 值比对——五者无 reduction，等价原串） */
export function isSpecialPh(t: string | undefined): boolean {
  return SPECIAL_PH.has(reducePhType(t))
}

export interface MatchResult<T> {
  shape: T | undefined
  /** 命中但原始 type/idx 与请求不精确一致（坏配，SlideBase.js:379/:407/:450/:460） */
  badMatch: boolean
}

/**
 * 占位符匹配（SlideBase.js:327-466 全瀑布）。glyphs = 某 part 的 spTree 占位符序列
 * （按文档顺序），每项带 ph 与负载 T。bSingleBody 对应 sdkjs 第三参。
 * @param withInfo true = 模拟 sdkjs `info` 传入态（:416 命中即返，不走兜底瀑布）
 */
export function matchPlaceholder<T>(
  glyphs: { ph: PhGlyph; v: T }[],
  type: string | undefined,
  idx: string | undefined,
  bSingleBody: boolean | undefined,
  withInfo = false,
): MatchResult<T> {
  const rType = reducePhType(type)
  const rIdx = reducePhIdx(idx)
  let bodyCount = 0
  let lastBody: { ph: PhGlyph; v: T } | undefined

  // 第一遍：reduced(type)+reduced(idx) 精确匹配（:354-395）
  for (const g of glyphs) {
    const gType = g.ph.type
    const gIdx = g.ph.idx
    const fType = reducePhType(gType)
    const fIdx = reducePhIdx(gIdx)
    if (rType === fType && rIdx === fIdx) {
      return { shape: g.v, badMatch: !(gType === type && gIdx === idx) }
    }
    // title 特例：双方 reduced 皆 title 即命中（容忍 idx 不同，:383-388）
    if (rType === 'title' && fType === 'title') {
      return { shape: g.v, badMatch: !(gType === type && gIdx === idx) }
    }
    if (gType === 'body') {
      bodyCount++
      lastBody = g
    }
  }

  // special-ph 第二遍：忽略 idx 按 type 命中（:398-414）
  if (SPECIAL_PH.has(rType)) {
    for (const g of glyphs) {
      if (g.ph.type === rType) {
        return { shape: g.v, badMatch: !(g.ph.type === type && g.ph.idx === idx) }
      }
    }
  }

  // info 态：到此为止（:416-418，null 返回）
  if (withInfo) return { shape: undefined, badMatch: false }

  // 兜底 1：单一 body + 请求 body + bSingleBody → last_body（:419-424）
  if (bodyCount === 1 && rType === 'body' && bSingleBody) {
    return { shape: lastBody!.v, badMatch: !(lastBody!.ph.type === type && lastBody!.ph.idx === idx) }
  }
  // 兜底 2：仅比 reduced(idx)（:426-455，bBadMatch=true）
  for (const g of glyphs) {
    if (reducePhIdx(g.ph.idx) === rIdx) {
      return { shape: g.v, badMatch: true }
    }
  }
  // 兜底 3：单一 body + bSingleBody（:458-463）
  if (bodyCount === 1 && bSingleBody) {
    return { shape: lastBody!.v, badMatch: !(lastBody!.ph.type === type && lastBody!.ph.idx === idx) }
  }
  return { shape: undefined, badMatch: false }
}

// ── normAutofit 二分搜索（Shape.js:4441 + :5140-5250） ──────────────────────

/** sdkjs aScales 原表（:4441）。末项 10000 为异常哨兵，搜索域永不选中——保真锁勿整流 */
export const A_SCALES = [25000, 30000, 35000, 40000, 45000, 50000, 55000, 60000, 65000, 70000, 75000, 80000, 85000, 90000, 95000, 10000]

/** lnSpcReduction 公式（:5196）：0.2*(100000-scale) 整数截断 */
export function lnSpcReductionOf(scale: number): number {
  return (0.2 * (100000 - scale)) >> 0
}

export interface AutofitResult {
  /** 命中的 fontScale（千分比，25000..95000）；undefined = 无需缩放（100000 档即放得下） */
  fontScale: number | undefined
  lnSpcReduction: number | undefined
}

/**
 * normAutofit 搜索。heightOf(scale) 由调用方注入（视图两次布局实测），
 * 返回该缩放档下的内容高；clipH 为框高。isTitlePh 决定是否套 90000 下限。
 * 逐式复现 :5140-5250：早退 → 100000 档试算 → 二分 → 标题下限。
 * 两级早退（:5151 无 XML scale 即退 / :5170 强制重算后退）在「heightOf(100000)=未缩放高」
 * 参考系下坍缩为一次判定，故合并；hasXmlScale 保留签名以对齐 sdkjs 语义（当前不分流）。
 */
export function normAutofitScale(
  heightOf: (scale: number) => number,
  clipH: number,
  hasXmlScale = false,
  isTitlePh = false,
): AutofitResult {
  // 早退（:5151 + :5170 合并）：100000 档即放得下 → 无需缩放，清 scale
  if (heightOf(100000) <= clipH) return { fontScale: undefined, lnSpcReduction: undefined }
  void hasXmlScale

  const a = A_SCALES
  let nCurIndex = a.length - 1 // 15
  let nCurShift = -(a.length / 2) // -8
  let scale = 0
  for (;;) {
    nCurIndex += nCurShift
    if (nCurIndex - 1 >= 0) {
      scale = a[nCurIndex - 1] // 低一档（tentative）
      if (heightOf(scale) <= clipH) {
        scale = a[nCurIndex] // 低一档放得下 → 回探高一档（:5201 留在高档）
        if (heightOf(scale) >= clipH) {
          // 高一档溢出 → 命中低一档（:5204-5207）
          scale = a[nCurIndex - 1]
          break
        }
        nCurShift = Math.abs(nCurShift) / 2 // 高一档也放得下 → 向右（:5209）
      } else {
        nCurShift = -Math.abs(nCurShift) / 2 // 低一档放不下 → 向左（:5194-:5212）
      }
      if (Math.abs(nCurShift) < 1) break // 步长耗尽（:5214），scale = 最后已知放得下的档
    } else {
      scale = a[0] // 下界跌破 → 锁最小档 25000（:5218）
      break
    }
  }

  // 标题下限（:5223-5231）
  if (scale < 90000 && isTitlePh) scale = 90000

  return { fontScale: scale, lnSpcReduction: lnSpcReductionOf(scale) }
}