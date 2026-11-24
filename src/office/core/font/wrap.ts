/**
 * 断行引擎 — sdkjs word 排版管线的最小 TS 等价（贪心逐词 + LineBreakPos 回退）。
 *
 * 算法对照（probe-word-layout 报告 §1）：
 *   - 词作为不可分单元累积宽度，越界时整词回退到上一合法断点（Run.js:3685 的节奏）；
 *   - 合法断点 = 词边界 ∧ 禁则允许（commonDefines.js:2271-2375 g_aPunctuation）：
 *     CANT_BE_AT_BEGIN 的标点不能行首 → 断点不能落在它之前；
 *     CANT_BE_AT_END 的标点不能行尾 → 断点不能落在它之后；
 *   - 东亚文本：汉字之间皆为词边界（Text.js private_IsSpaceAfter 的
 *     "东亚非标点之后视为边界" 语义 → CJK 逐字即一词）；
 *   - 原子词（两合法断点间的最大跨度）超一行 → 词内字符级硬断（FindLineBreakInLongWord
 *     的简化：禁则允许处取最大前缀，否则按宽度硬切）；
 *   - 行尾空格不计可见宽（para_Space 的 SpacesRight 语义）。
 *
 * 输出行盒与 sdkjs 同构：[start..end) 字符区间 + 宽度，不持有字形数据。
 */
import { PUNCT_FLAGS, PF } from './punct'

export interface WrapStyle {
  /** 连字符后断词（0x2D/0x2010-0x2015 之后视为词尾）；默认 true */
  hyphenBreak?: boolean
  /** 东亚模式：汉字之间可断；默认按文本内容自动判定 */
  eastAsian?: boolean
}

export interface WrapLine {
  /** 源文本字符区间 [start, end) */
  start: number
  end: number
  /** 行内容（含尾随空格；可见宽另存） */
  text: string
  /** 可见宽度（不含行尾空格） */
  width: number
  /** 是否硬截断（原子词超行） */
  forced: boolean
}

const CJK_RE = /[\u2E80-\u303F\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F]/
const HYPHENS = new Set([0x2d, 0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015])

const isCJK = (cp: number): boolean => CJK_RE.test(String.fromCodePoint(cp))

/** 断点落在 cp 之后是否合法（cp 不得是不可行尾标点） */
function canBreakAfter(cp: number, ea: boolean): boolean {
  const f = PUNCT_FLAGS.get(cp) ?? 0
  if (f & PF.CANT_END) return false
  if (ea && f & PF.CANT_END_E) return false
  return true
}

/** 断点落在 cp 之前是否合法（cp 不得是不可行首标点） */
function canBreakBefore(cp: number, ea: boolean): boolean {
  const f = PUNCT_FLAGS.get(cp) ?? 0
  if (f & PF.CANT_BEGIN) return false
  if (ea && f & PF.CANT_BEGIN_E) return false
  return true
}

/**
 * 词切分：空格断词（空格归前词）、东亚逐字断词、连字符后断词。
 * 返回覆盖全文的连续 [start, end) 区间数组（字符下标）。
 */
export function splitWords(text: string, style: WrapStyle = {}): [number, number][] {
  const cps = [...text].map((c) => c.codePointAt(0)!)
  const ea = style.eastAsian ?? cps.some(isCJK)
  const words: [number, number][] = []
  let start = 0
  for (let pos = 0; pos < cps.length; pos++) {
    const cp = cps[pos]
    const close =
      cp === 0x20 || // 空格：词尾
      (style.hyphenBreak !== false && HYPHENS.has(cp)) || // 连字符：词尾
      (ea && isCJK(cp) && pos + 1 < cps.length && isCJK(cps[pos + 1])) // CJK 逐字
    if (close) {
      words.push([start, pos + 1])
      start = pos + 1
    }
  }
  if (start < cps.length) words.push([start, cps.length])
  return words
}

/** 度量回调：字符区间 [start,end) → 宽度 pt */
export type MeasureFn = (start: number, end: number) => number

interface Pending {
  /** 待放行内容 [lineStart, cursorEnd)；cursorEnd 之后的词尚未结算 */
  lineStart: number
  /** 最近合法断点（字符下标，-1 无）及其处宽度 */
  breakAt: number
  breakW: number
  /** 当前累计宽（含已结算词，不含未结算词） */
  accW: number
}

function emitLine(chars: string[], s: number, e: number, measure: MeasureFn, forced: boolean): WrapLine {
  let visEnd = e
  while (visEnd > s && chars[visEnd - 1] === ' ') visEnd--
  return { start: s, end: e, text: chars.slice(s, e).join(''), width: measure(s, visEnd), forced }
}

/**
 * 原子词内硬断：在 [ws, we) 内找最大可容纳前缀。
 * 优先停在禁则合法的字符边界（如长串中的括号后），否则按宽度切。
 */
function hardCut(chars: string[], ws: number, we: number, xLimit: number, measure: MeasureFn, ea: boolean): number {
  let cut = ws + 1
  let legal = -1
  let w = 0
  for (let i = ws; i < we; i++) {
    w += measure(i, i + 1)
    if (w > xLimit && i > ws) {
      // 超界：回退到最近的合法字符边界，否则停在上一字符
      return legal > ws ? legal : i
    }
    if (i + 1 < we) {
      const cp = chars[i].codePointAt(0)!
      const next = chars[i + 1].codePointAt(0)!
      if (canBreakAfter(cp, ea) && canBreakBefore(next, ea)) legal = i + 1
    }
  }
  cut = we
  return cut
}

/**
 * 贪心断行。xLimit 为可用宽度（pt），measure 供区间宽。
 * 行满 → 回退最近合法断点（LineBreakPos）；无断点可回 → 原子词硬断。
 */
export function wrapLine(text: string, xLimit: number, measure: MeasureFn, style: WrapStyle = {}): WrapLine[] {
  const chars = [...text]
  const n = chars.length
  if (!n) return []
  const ea = style.eastAsian ?? chars.some((c) => isCJK(c.codePointAt(0)!))
  const words = splitWords(text, style)
  const lines: WrapLine[] = []
  const p: Pending = { lineStart: 0, breakAt: -1, breakW: 0, accW: 0 }
  let wi = 0
  while (wi < words.length) {
    const [ws, we] = words[wi]
    const w = measure(ws, we)
    // accW===0 且首词超行 → 同样进硬断（Word 行为：不可断词逐字切）
    if (p.accW + w > xLimit) {
      if (p.accW > 0 && p.breakAt > p.lineStart) {
        // 有合法断点 → 整词回退断行
        lines.push(emitLine(chars, p.lineStart, p.breakAt, measure, false))
        p.lineStart = p.breakAt
        p.breakAt = -1
        p.breakW = 0
        p.accW = measure(p.lineStart, ws) // 断点到当前词头之间的残留（通常为 0）
        continue // 当前词重放
      }
      if (ws === p.lineStart) {
        // 原子词自身超行 → 词内硬断
        const cut = hardCut(chars, ws, we, xLimit, measure, ea)
        lines.push(emitLine(chars, p.lineStart, cut, measure, true))
        p.lineStart = cut
        p.breakAt = -1
        p.breakW = 0
        p.accW = 0
        if (cut < we) {
          // 词被劈开：剩余部分替换当前词继续
          words.splice(wi, 1, [cut, we])
          continue
        }
        wi++
        continue
      }
      // 理论不可达：accW>0 且无断点且 ws>lineStart 意味着前词未登记断点，
      // 此时只能把当前词并入本行（Word 行为：无断点则行继续增长）
    }
    p.accW += w
    // 词尾断点登记：下一词首字符不得不可行首，当前词尾不得不可行尾
    if (we < n) {
      const lastCp = chars[we - 1].codePointAt(0)!
      const nextCp = chars[we].codePointAt(0)!
      if (canBreakAfter(lastCp, ea) && canBreakBefore(nextCp, ea)) {
        p.breakAt = we
        p.breakW = p.accW
      }
    } else {
      p.breakAt = we // 文末即断（自然行尾）
      p.breakW = p.accW
    }
    wi++
  }
  if (p.lineStart < n) lines.push(emitLine(chars, p.lineStart, n, measure, false))
  return lines
}

/**
 * 两端对齐增量（sdkjs JustifyWord/JustifySpace 双通道的 TS 版）。
 * 正常多词行：slack 均摊到词间空格（行尾空格不计）；
 * 单字行（CJK 无空格/单词占满）：按字符均摊（JustifyWord 分支）。
 * 返回每空格 / 每字符的加宽量（pt）。
 */
export function justifyDeltas(line: WrapLine, xLimit: number): { space: number; char: number } {
  const slack = xLimit - line.width
  if (slack <= 0) return { space: 0, char: 0 }
  const words = splitWords(line.text)
  // 词间空格数：前 N-1 个词尾随空格的个数（尾随行末空格不算——emitLine 已剔可见宽）
  let spaceCount = 0
  for (let i = 0; i < words.length - 1; i++) {
    const [, e] = words[i]
    if (line.text[e - 1] === ' ') spaceCount++
  }
  if (words.length <= 1 || spaceCount <= 0) {
    const chars = [...line.text].length
    return chars > 1 ? { space: 0, char: slack / (chars - 1) } : { space: 0, char: 0 }
  }
  return { space: slack / spaceCount, char: 0 }
}
