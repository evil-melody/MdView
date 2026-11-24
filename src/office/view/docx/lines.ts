/**
 * P4a 行级映射：内核行几何 → 渲染层切片。
 *
 * 两套索引空间必须显式换算，否则含 emoji / 跨引用的段落光标错位：
 *  - 内核（core/docx/layout.ts）按【码点】拍平：text/ref 展开为各自的码点串，非文本对象占 1；
 *  - 渲染（docx-render.ts 的 data-o）按【UTF-16】计：text 取 .length，
 *    ref/img/field/box/shape 一律 1 个 data-obj 字符。
 * 故 ref 是「内核 N 码点 ↔ DOM 1 字符」的原子对象：行区间切进它内部时只能整块归入起始行
 * （toDom 的单调夹紧天然保证：对象槽内任何下标只映射到 dt 或 dt+1）。
 *
 * detail 的 s/e 已是【去 marker 域】（flow.ts 做了 −mlen 平移）：s < 0 表示该行含 marker 前缀，
 * 正文从 0 起算；'\n'（w:br）归前驱行尾，渲染须剔除 —— 换行由行 div 表达。
 */
import type { Inline, Paragraph } from '../../core/docx/types'

interface Slot {
  /** 拍平流码点起点（去 marker 域） */
  at: number
  /** 该项码点数 */
  k: number
  /** DOM UTF-16 起点 */
  dt: number
  /** DOM UTF-16 长度（非文本对象 = 1） */
  d: number
  /** 码点串（text / ref 有；img/field/box/shape 无） */
  cps?: string[]
  /** 码点 → UTF-16 前缀表（仅代理对存在时建） */
  u16?: number[]
}

export interface LineSlice {
  /** 本行 DOM 区间 [ds, de) */
  ds: number
  de: number
  /** 本行含 marker（s < 0） */
  marker: boolean
  /** 本行无正文（空段 / 纯 marker 行） */
  empty: boolean
}

/** p.runs → 槽表（逐项口径与 flow.ts snapOf 的拍平一致） */
function slotsOf(p: Paragraph): { slots: Slot[]; totalK: number; totalD: number } {
  const slots: Slot[] = []
  let at = 0
  let dt = 0
  for (const x of p.runs) {
    const text = x.t === 'text' || x.t === 'ref' ? (x as { text: string }).text : undefined
    if (text === undefined) {
      slots.push({ at, k: 1, dt, d: 1 })
      at += 1
      dt += 1
      continue
    }
    const cps = [...text]
    const k = cps.length
    const d = text.length
    const s: Slot = { at, k, dt, d, cps }
    if (k !== d) {
      const u = new Array<number>(k + 1)
      u[0] = 0
      for (let i = 0; i < k; i++) u[i + 1] = u[i] + cps[i].length
      s.u16 = u
    }
    slots.push(s)
    at += k
    dt += d
  }
  return { slots, totalK: at, totalD: dt }
}

/** 码点下标 → 所属槽（slots 按 at 升序，二分足够） */
function slotAt(slots: Slot[], x: number): Slot {
  let lo = 0
  let hi = slots.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (slots[mid].at <= x) lo = mid
    else hi = mid - 1
  }
  return slots[lo]
}

/** 去 marker 码点下标 → DOM UTF-16 下标；原子对象只可能落在其起点或终点 */
function toDom(slots: Slot[], totalK: number, totalD: number, x: number): number {
  if (!slots.length || x <= 0) return 0
  if (x >= totalK) return totalD
  const s = slotAt(slots, x)
  const within = x - s.at
  if (!s.cps) return s.dt + (within > 0 ? 1 : 0)
  if (within <= 0) return s.dt
  return s.dt + (s.u16 ? s.u16[within] : within)
}

/** 去 marker 码点位上的码点（越界回 -1） */
function cpAt(slots: Slot[], x: number): number {
  if (!slots.length || x < 0) return -1
  const s = slotAt(slots, x)
  const within = x - s.at
  if (!s.cps) return 0xfffc
  if (within < 0 || within >= s.k) return -1
  return s.cps[within].codePointAt(0)!
}

/**
 * 内核行区间 → DOM 切片。
 * lines 为 ParaFrag.lines（已按本页顺序）；s/e 取去 marker 域。
 */
export function lineSlices(p: Paragraph, lines: { s: number; e: number }[]): LineSlice[] {
  const { slots, totalK, totalD } = slotsOf(p)
  return lines.map((L) => {
    let e = L.e
    // 行尾 '\n'（w:br）：内核归前驱行尾，渲染剔除（换行由行 div 表达）
    if (e > L.s && cpAt(slots, e - 1) === 0x0a) e -= 1
    const ds = toDom(slots, totalK, totalD, L.s)
    const de = toDom(slots, totalK, totalD, e)
    return { ds, de, marker: L.s < 0, empty: de <= ds }
  })
}

/** run 的 DOM 字符长（与 docx-render 的偏移游走一致） */
export const domLenOf = (x: Inline): number => (x.t === 'text' ? x.text.length : 1)
