/**
 * OOXML 兼容性开关（compatibilityMode）内核。路线图 P7「版本开关矩阵」的**唯一 OOXML 面**。
 *
 * 取证裁决（sdkjs release/v10.0.0）：所谓「版本开关」有两类，必须分清——
 *   1. `AscCommon.CurFileVersion`（Serialize2.js:8175/11411/11432、WorkbookElems.js:6386）：
 *      是 **.docser 内部二进制流**的格式版本（<2 → qFormat 补齐、=2 → 表格左边距偏移、
 *      <5 → 页眉页脚回填 sectPr）。MdView 不产 .docser，**整类作废**，不在本内核。
 *   2. `compatibilityMode`（settings.xml `w:compat/w:compatSetting`）：真正的 OOXML 兼容开关，
 *      从 Word 11(2003) 到 Word 15(2013+)。读路径（docx 解析/渲染）里它**只喂两处算术**：
 *        - CTablePr.InitDefault（Styles.js:11136-11137）默认单元格左右边距：
 *          mode ≤ Word12 → 0.5pt（0.5*g_dKoef_pt_to_mm mm）；否则 → 5.4pt（1.9mm）。
 *        - 新建表宽预算 nAdd（Document.js:20094/27793/27810）：mode ≤ Word14 → 2*1.9mm=10.8pt；否则 0。
 *      其余门控（多栏裁剪 Document.js:5464、IsUseInnerWrap DocumentContent.js:447、
 *      空编号段判定 :1452）是渲染/交互细节，MdView 无对应模型字段，ponytail 标记不接线。
 *
 * 单位：MdView 全程 pt（parser readMargins 把 dxa /20）。故本内核直接给 pt。
 */
import { kid, kids, num, type XEl } from '../xml'

/** commonDefines.js:3732-3737 */
export const COMPAT_WORD11 = 11
export const COMPAT_WORD12 = 12
export const COMPAT_WORD14 = 14
export const COMPAT_WORD15 = 15
/** 缺省（DocumentSettings.js:53）：Current = Word12 */
export const COMPAT_CURRENT = COMPAT_WORD12

const COMPAT_URL = 'http://schemas.microsoft.com/office/word'

/**
 * settings.xml 根 → compatibilityMode。sdkjs 二进制侧口径（Serialize2.js:17048-17050）：
 * name==='compatibilityMode' 且 uri 命中 MS word 命名空间 → parseInt(val)。
 * OOXML 属性名是 `w:uri`（ECMA-376 compatSetting），sdkjs 内部字段名叫 url——
 * 这里按 XML 实际属性读 uri，并兼容 url 写法（部分生成器混用）。
 * 文档正常只有一条；多条取首个可解析值（二进制侧是单槽位，无多条语义，不臆造覆盖顺序）。
 * 缺失 / 非数字 → COMPAT_CURRENT（:17049 parseInt 截断口径：'14.5'→14）。
 */
export function parseCompatMode(settings: XEl | undefined): number {
  const compat = kid(settings, 'compat')
  if (!compat) return COMPAT_CURRENT
  for (const cs of kids(compat, 'compatSetting')) {
    if (cs.a.name === 'compatibilityMode' && (cs.a.uri === COMPAT_URL || cs.a.url === COMPAT_URL)) {
      const v = parseInt(cs.a.val ?? '', 10)
      if (Number.isFinite(v)) return v
    }
  }
  return COMPAT_CURRENT
}

/**
 * 默认单元格左右边距（pt）。Styles.js:11136-11137 门控：
 * mode ≤ Word12 → 0.5pt；Word14/15 → 5.4pt（=1.9mm）。
 * 上/下边距恒 0（:11135/:11139），故只给左右。
 */
export function defaultCellMarginPt(mode: number): number {
  return mode <= COMPAT_WORD12 ? 0.5 : 5.4
}

/**
 * 新建表宽预算附加（pt）。Document.js:20094 等：mode ≤ Word14 → 2*1.9mm=10.8pt；否则 0。
 * 仅在**插入新表**时参与（insertTable 宽度 = 可用宽 + nAdd），读取既有表不吃。
 */
export function newTableNAddPt(mode: number): number {
  return mode <= COMPAT_WORD14 ? 10.8 : 0
}