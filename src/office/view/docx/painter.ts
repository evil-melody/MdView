/** 格式刷载荷转换（Word「复制样式」与「格式刷」共用的单一实现） */
import type { ParaDirty, RunSet, RunStyle } from '../../core/docx/types'
import { cssFont } from '../../core/fonts'
import type { FormatState } from './DocxEditor'

/** 从当前格式状态取出格式刷副本 */
export function formatFromState(st: FormatState): RunSet {
  return {
    b: st.b,
    i: st.i,
    u: st.u ? 'single' : 'none',
    strike: st.strike,
    color: st.color ?? null,
    hl: st.hl ?? null,
    va: st.va ?? null,
    sz: st.sz,
    font: st.font ? (/^\s*"?([^",]+)/.exec(st.font)?.[1] ?? st.font) : undefined,
  } as RunSet
}

/** 段落格式副本：Word 的格式刷连对齐/行距/缩进/列表一起刷（无显式值的键不落空，避免刷掉目标段） */
export function paraFromState(st: FormatState): ParaDirty {
  const d: ParaDirty = {}
  if (st.align) d.align = st.align as ParaDirty['align']
  if (st.line !== undefined) d.line = st.line
  if (st.indL !== undefined) d.indL = st.indL
  if (st.lst) { d.list = st.lst; d.ilvl = 0 }
  return d
}

/** 把副本转为可写回模型的增量；null 属性写 undefined 以清除继承值 */
export function formatPainterPatch(set: RunSet): Partial<RunStyle> {
  const s: Partial<RunStyle> = {}
  for (const [k, v] of Object.entries(set)) {
    if (k === 'font') (s as Record<string, unknown>).font = v ? cssFont(v as string) : undefined
    else if (k === 'u') (s as Record<string, unknown>).u = v
    else (s as Record<string, unknown>)[k] = v === null ? undefined : v
  }
  return s
}
