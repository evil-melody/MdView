/**
 * 视图分页契约类型。P2 起唯一分页实现 = core/docx/layout.ts 的 flowBlocks
 * （经 view/docx/flow.ts 装配），旧的 DOM 测量 + paginate() 贪心切页已删除 ——
 * 两套分页必出分歧（单实现收敛原则）。本文件只留渲染层消费的契约。
 */

/** one page's fragment of a split table: rows [r0, r1) plus repeated header rows */
export interface RowFrag {
  r0: number
  r1: number
  /** original row indices of the header rows prepended on a continuation page */
  repeat: number[]
}

/** one page's line fragment(s) of a paragraph — kernel LineGeom verbatim
 *  (s/e in marker-shifted char space; \n belongs to the preceding line) */
export interface ParaFrag {
  /** 行可用宽（pt）：justify slack 的唯一来源（渲染层不得二次测量） */
  xl: number
  /** 本片段含段落末行（渲染判据：justify 末行不拉伸；多栏同页时以最后放置的片段为准） */
  tail?: boolean
  lines: { s: number; e: number; h: number; a: number; w: number; f: boolean; sp: number }[]
}

/** the blocks [start, end) of a page and the height they take */
export interface PageSlice {
  start: number
  end: number
  used: number
  /** table row fragments on this page, keyed by the absolute block index */
  frags?: Record<number, RowFrag>
  /** paragraph line fragments, keyed by the absolute block index */
  paras?: Record<number, ParaFrag>
}
