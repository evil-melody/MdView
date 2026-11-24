/**
 * x14 探针（路线图 P3 表格布局，?mode=x14）：core/docx/table.ts 与 sdkjs
 * word/Editor/Table*.js 的语义一致性断言（纯同步数值，无 DOM）。
 *
 * 断言面（每条都对着 sdkjs 原文核过）：
 *  1. paraMinMax（Run.js:5683-5941 + Paragraph.js:2275-2317）：词边界扫描 ——
 *     空格结算词入 min、空格缓存不入 curMax（尾随不计 :5778）、'\n' 行结算、
 *     CJK 逐字词（min=单字）、缩进只在非零时加（:2294）、出口 +0.001、空段 {0,0}；
 *  2. cellMinMax（TableCell.js:990-1111）：0.1mm 下限（:1012）、nAdd（有 spacing =
 *     左右 margin+边框 :1024-1034；无 = 逐边 max(margin,边框/2) :1037-1053）、
 *     spacing 附加首末 1.5×（:948）、显式宽夹到 W 本身（:1072-1076）、margins 面；
 *  3. Phase 1（:259-440 / :818-863）：种子网格（span=1 显式 max / 声明回退）、
 *     合并格撑开落末列（:383-387）、声明宽夹 MinWidth（:315）、MinWidth 兜底缩放（:422）；
 *  4. Internal_ScaleTableWidth（Table.js:16540-16608）：迭代压缩 + minGrid
 *     （:16470-16538）锁列退出集合重算 Koef；
 *  5. Phase 2 分配（:550-811）：sumMax≤上限 → max(min,max)（:577）；内容最小和 ≥
 *     上限 → over-margin 摊分（:755）；声明宽非首选列按 max 比例摊（:675-684）；
 *     首选列不动只拉非首选（:679-682）；558.7mm 夹（:474-481）；
 *  6. 合并列后处理（:1092-1200）：min 撑开按列比例（:1145-1148）；合并首选宽迭代
 *     补末列（:1075-1084）；
 *  7. 行高（:2690-3390）：rv = trHeight+MaxBotMargin[合并末行]+MaxTopMargin（:2719，
 *     −spacing :2724，exact −顶边 :2728）；exact 净 = trHeight+边距（顶边回补 :3379）；
 *     atLeast/auto = max(rv, 内容)+顶边（无 spacing）+底边（:3386）；竖合并差额摊末行；
 *  8. tableMinWidth（:16439-16465）/ gridMinWidths（:16470-16538）/ tableMinMax
 *     （Table.js:3421-3474：Σ minNoPref / Σ maxContent + 声明宽夹）；
 *  9. 端到端：真 docx（tblW/tblLayout/trHeight/tblHeader XML 全链）→ parser →
 *     layoutTable 列宽/行高断言 + flowPaginate 表头重复回归。
 *
 * 顶层只注册 mode；结果挂 window.__smoke.x14。
 */
import { h } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import {
  MAX_COL_W,
  CELL_MIN_W,
  bw,
  paraMinMax,
  cellMinMax,
  tableMinMax,
  tableMinWidth,
  gridMinWidths,
  scaleTableWidth,
  layoutTable,
  type TableCtx,
} from './core/docx/table'
import type { Block, Paragraph, Table, TableCell, TableRow } from './core/docx/types'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

// ── fixture：字符宽 6pt，face = 0.8sz/0.2sz（sz10 → 行高 10） ──────────────
const CHAR = 6
const ctxFix: TableCtx = {
  pm: () => ({
    face: (_r: number, sz: number) => ({ ascent: sz * 0.8, descent: sz * 0.2 }),
    width: (a: number, b: number) => (b - a) * CHAR,
    endFace: (sz: number) => ({ ascent: sz * 0.8, descent: sz * 0.2 }),
  }),
  markSz: () => 10,
}

const P = (text: string, ps: Paragraph['ps'] = {}, sz = 10): Paragraph => ({
  t: 'p',
  ps,
  runs: text ? [{ t: 'text', text, s: { sz } }] : [],
  markSz: sz,
})
const C = (blocks: Block[], over: Partial<TableCell> = {}): TableCell => ({
  blocks,
  colSpan: 1,
  rowSpan: 1,
  borders: {},
  pad: [0, 5.4, 0, 5.4],
  ...over,
})
const R = (cells: TableCell[], over: Partial<TableRow> = {}): TableRow => ({ cells, ...over })
const T = (cols: number[], rows: TableRow[], over: Partial<Table> = {}): Table => ({
  t: 'tbl',
  cols,
  rows,
  ...over,
})

function probe() {
  const Out: Record<string, unknown> = { ok: false, errors: [] as string[] }
  const errs = Out.errors as string[]
  const eq = (a: unknown, b: unknown, msg: string) => {
    if (a !== b) errs.push(`${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
  const near = (a: number | undefined, b: number, msg: string, tol = 1e-6) => {
    if (a === undefined || Math.abs(a - b) > tol) errs.push(`${msg}: got ${a}, want ~${b}`)
  }
  const arrNear = (a: number[], b: number[], msg: string, tol = 1e-6) => {
    if (a.length !== b.length) { errs.push(`${msg}: len ${a.length} ≠ ${b.length}`); return }
    for (let i = 0; i < a.length; i++) near(a[i], b[i]!, `${msg}[${i}]`, tol)
  }

  // ── 1. paraMinMax（词边界扫描） ──
  {
    const m = paraMinMax(P('abcd'), ctxFix)
    near(m.min, 24.001, 'abcd min = 词宽')
    near(m.max, 24.001, 'abcd max = 全宽')
  }
  {
    const m = paraMinMax(P('ab cd'), ctxFix)
    near(m.min, 12.001, 'ab cd min = 最长词')
    near(m.max, 30.001, 'ab cd max = 整行（空格 :5712 下一字符到达 flush 入 curMax）')
  }
  {
    const m = paraMinMax(P('ab cd '), ctxFix)
    near(m.max, 30.001, '尾随空格不入 max（:5778-5781）')
    near(m.min, 12.001, '尾随空格不入 min')
  }
  {
    const m = paraMinMax(P('a\nbcde'), ctxFix)
    near(m.min, 24.001, '\\n 分行：min = 跨行最长词')
    near(m.max, 24.001, '\\n 分行：max = 最长行宽（:5905 行结算）')
  }
  {
    const m = paraMinMax(P('ab cd', { indL: 10, indR: 5 }), ctxFix)
    near(m.min, 27.001, '缩进入 min（L+R=15，:2289）')
    near(m.max, 45.001, '缩进入 max（30+15）')
    const e = paraMinMax(P('', {}), ctxFix)
    eq(e.min, 0, '空段 min=0')
    eq(e.max, 0, '空段 max=0（:2294 双零豁免缩进）')
    const ei = paraMinMax(P('', { indL: 10 }), ctxFix)
    eq(ei.min, 0, '空段+缩进仍 0（出口非零判 :2314）')
  }
  {
    const m = paraMinMax(P('你好'), ctxFix)
    near(m.min, 6.001, 'CJK 逐字词：min = 单字宽')
    near(m.max, 12.001, 'CJK max = 全串')
  }
  {
    // marker 伪 run 计入词面（与 flow.ts 快照同构）；tab = 词分隔符（:5875 立即结算清词）
    const p = P('xy', {}, 10)
    p.marker = { text: '•', s: {}, tab: true }
    const m = paraMinMax(p, ctxFix)
    near(m.min, 12.001, 'marker+tab：词 = ["•\\t","xy"] → min 12')
    near(m.max, 24.001, 'marker+tab：max = 全串 4 字符 24')
  }

  // ── 2. cellMinMax（nAdd / 0.1mm / 显式宽夹） ──
  {
    const t = T([100], [R([C([P('abcd')])])])
    const mm = cellMinMax(t, 0, 0, ctxFix, 0, 0)
    near(mm.min, 34.801, '无 spacing nAdd = 5.4+5.4（:1041-1053）')
    near(mm.margins, 10.8, 'margins 面 = 左右 margin（:949）')
    near(mm.contentMin, 34.801, 'contentMin = 夹显式宽前 Min（:1066）')
  }
  {
    // 无 spacing：边框半宽 > margin → 吃边框（:1037-1049）
    const t = T([100], [R([C([P('abcd')], { borders: { l: '12pt solid #000', r: '12pt solid #000' } })])])
    const mm = cellMinMax(t, 0, 0, ctxFix, 0, 0)
    near(mm.min, 24.001 + 12, '无 spacing：逐边 max(5.4, 12/2)=6 → nAdd=12')
  }
  {
    // 有 spacing：margin 全额 + 首末 1.5×（:1024-1034 / :948）
    const t = T([100, 100], [R([C([P('ab')]), C([P('cd')])])], { cellSpacing: 2 })
    const m0 = cellMinMax(t, 0, 0, ctxFix, 0, 0)
    near(m0.min, 12.001 + 10.8 + 3, 'spacing 首格：+10.8 + 1.5×2')
    near(m0.margins, 13.8, 'spacing 首格 margins = 10.8+3')
    const m1 = cellMinMax(t, 0, 1, ctxFix, 0, 0)
    near(m1.min, 12.001 + 10.8 + 3, 'spacing 末格 1.5×')
  }
  {
    // 显式宽夹到 W 本身（:1072-1076，非 W+nAdd）
    const t = T([100], [R([C([P('ab')], { w: 100 })])])
    const mm = cellMinMax(t, 0, 0, ctxFix, 0, 0)
    near(mm.min, 100, 'dxa 显式宽夹 min = W（内容 22.801 < 100）')
    near(mm.contentMin, 22.801, 'contentMin 不吃显式宽（:1066 在夹前）')
  }
  {
    // 空格子 0.1mm 下限（:1012）
    const t = T([100], [R([C([P('')])])])
    const mm = cellMinMax(t, 0, 0, ctxFix, 0, 0)
    near(mm.min, CELL_MIN_W + 10.8, '空 cell min = 0.1mm + nAdd')
  }
  {
    // 嵌套表度量：Σ minNoPref / Σ maxContent + 声明宽夹（Table.js:3441-3472）
    const inner = T([50, 50], [R([C([P('abcd')]), C([P('ab')])])], { w: 130 })
    const r = tableMinMax(inner, ctxFix, 1, 0)
    near(r.min, 130, '嵌套 min 吃声明宽夹')
    near(r.max, 130, '嵌套 max = max(Σ maxContent, 声明宽)')
  }

  // ── 3. Phase 1：种子网格 + 撑开 + 缩放 ──
  {
    // fixed：种子 = span=1 显式 max / 声明回退（:839-861）
    const t = T([100, 100], [R([C([P('')], { w: 150 }), C([P('')])])], { layout: 'fixed' })
    const L = layoutTable(t, ctxFix, 400)
    arrNear(L.cols, [150, 100], 'fixed：span=1 显式撑种子；缺失回退声明')
    eq(L.autofit, false, 'fixed 显式 → 无 Phase 2')
  }
  {
    // autofit（缺省）：同表走 Phase 2 → 内容宽（空 cell = 0.1mm+10.8，显式夹 150）
    const t = T([100, 100], [R([C([P('')], { w: 150 }), C([P('')])])])
    const L = layoutTable(t, ctxFix, 400)
    arrNear(L.cols, [150, CELL_MIN_W + 10.8], 'autofit 缺省：内容宽优先（:577）')
    eq(L.autofit, true, '缺省 layout = autofit（Styles.js:11142）')
  }
  {
    // 合并格撑开落末列（:381-388 shiftFrom(g+span-1)）
    const t = T([100, 100], [R([C([P('')], { colSpan: 2, w: 300 })])], { layout: 'fixed' })
    const L = layoutTable(t, ctxFix, 400)
    arrNear(L.cols, [100, 200], '合并撑开差额全落末列')
  }
  {
    // 声明宽 < MinWidth → 夹到 MinWidth 后缩放（:315-316 / :420-421）
    const t = T([100], [R([C([P('')], { pad: [0, 40, 0, 40] })])], { w: 10, layout: 'fixed' })
    const L = layoutTable(t, ctxFix, 400)
    near(L.sum, 80, 'nTableW 夹 MinWidth=80 → 缩放至 80（minGrid 同 80）')
  }
  {
    // 无声明宽 + MinWidth > 网格总宽 → 兜底缩放吃 minGrid（:422-423）
    const t = T([10, 10], [R([C([P('')], { pad: [0, 20, 0, 20] }), C([P('')])])], { layout: 'fixed' })
    const L = layoutTable(t, ctxFix, 400)
    // minWidth = 0 + 40 + 10.8 = 50.8 > 20 → scale(20→minGrid [40,10.8])：
    // koef=1 → [10,10]；col0 10<40 锁死 → 剩余列按 koef 压 → col1 = 10.8（minGrid 地板）
    arrNear(L.cols, [40, 10.8], 'MinWidth 兜底：迭代锁列（:422 → :16577）')
  }
  {
    // tblInd 只扣 nMaxTableW 上限（:550），不影响内容宽分支
    const t = T([10, 10], [R([C([P('abcd')]), C([P('abcd')])])], { indL: 100 })
    const L = layoutTable(t, ctxFix, 400)
    arrNear(L.cols, [34.801, 34.801], 'autofit 无声明宽 → 内容宽（ind=100 未触上限）')
  }

  // ── 4. Internal_ScaleTableWidth 迭代锁列 ──
  {
    const t = T([100, 100, 100], [R([C([P('')]), C([P('')], { pad: [0, 40, 0, 40] }), C([P('')])])])
    const mg = gridMinWidths(t, undefined, 3)
    arrNear(mg, [10.8, 80, 10.8], 'GetMinGrid = 边距最小宽（:16495-16500）')
    // 3 列 [100,100,100] 压到 150：koef=0.5 → col1 50<80 锁死 → koef=70/200=0.35
    const fake = { toCols: () => [100, 100, 100], total: () => 300 } as never
    const out = scaleTableWidth(fake, 150, mg)
    arrNear(out, [35, 80, 35], '迭代压缩：锁列退集合重算 Koef（:16577-16588）')
  }

  // ── 5. Phase 2 分配分支 ──
  {
    // sumMax ≤ 上限 → max(min,max)（:577-580）
    const t = T([100, 100], [R([C([P('ab')]), C([P('abcd')])])])
    const L = layoutTable(t, ctxFix, 400)
    arrNear(L.cols, [22.801, 34.801], 'autofit 内容宽 = max(min,max)')
  }
  {
    // 内容最小和 ≥ 上限 → margin 地板 + over-margin 摊分（:746-761）
    const t = T([100, 100], [R([C([P('abcdefghijkl')]), C([P('ab')])])])
    const L = layoutTable(t, ctxFix, 100)
    near(L.sum, 100, 'over-margin 摊分恰填满 nMaxTableW')
    const A = L.arrays
    const over0 = A.minNoPref[0]! - A.minMargin[0]!
    const over1 = A.minNoPref[1]! - A.minMargin[1]!
    const want0 = A.minMargin[0]! + (over0 * (100 - A.minMargin[0]! - A.minMargin[1]!)) / (over0 + over1)
    arrNear(L.cols, [want0, 100 - want0], '地板 10.8 + 内容超额比例（:759）')
  }
  {
    // 声明宽 + 全无首选：非首选列按 max 比例摊到 nTableW（:675-684）
    const t = T([100, 100], [R([C([P('ab')]), C([P('abcd')])])], { w: 200 })
    const L = layoutTable(t, ctxFix, 400)
    const s = 22.801 + 34.801
    arrNear(L.cols, [(22.801 * 200) / s, (34.801 * 200) / s], '声明宽 200：按 maxContent 比例摊满')
    near(L.sum, 200, '摊后总宽 = 声明宽')
  }
  {
    // 首选列不动，只拉非首选（:679-682）；col0 显式 80 → minContent 夹到 80（:1072）
    const t = T([100, 100], [R([C([P('ab')], { w: 80 }), C([P('abcd')])])], { w: 200 })
    const L = layoutTable(t, ctxFix, 400)
    near(L.cols[0]!, 80, '首选列 = minContent（显式宽夹，不吃 nAdd）')
    near(L.cols[1]!, 120, '非首选列吃剩余 200−80=120')
  }
  {
    // 558.7mm 夹（:474-481）：1000 字 ×6 = 6000pt > MAX_COL_W
    const t = T([100], [R([C([P('x'.repeat(1000))])])])
    const L = layoutTable(t, ctxFix, 5000)
    near(L.cols[0]!, MAX_COL_W, '列宽夹 558.7mm')
    near(MAX_COL_W, (558.7 * 72) / 25.4, 'MAX_COL_W 常数')
  }

  // ── 6. 合并列后处理（:1092-1200 / :1051-1090） ──
  {
    // 合并格 min=70.801 > 单列和 45.602 → 按列 minContent 比例撑（各 ×1.5526 → 35.4005）
    const t = T([100, 100], [R([C([P('abcdefghij')], { colSpan: 2 })]), R([C([P('ab')]), C([P('cd')])])])
    const L = layoutTable(t, ctxFix, 400)
    arrNear(L.cols, [35.4005, 35.4005], '合并 min 撑开：按列比例（:1147）')
    near(L.sum, 70.801, '合并格总宽 = 其内容 min')
  }
  {
    // 合并首选 200 > col0 首选 80 → 末列补 120（:1077）；minContent 同步撑（:1079）
    const t = T(
      [100, 100],
      [R([C([P('ab')], { colSpan: 2, w: 200 })]), R([C([P('')], { w: 80 }), C([P('')])])],
    )
    const L = layoutTable(t, ctxFix, 400)
    near(L.cols[0]!, 80, 'col0 = 显式 80 夹（:1072）')
    near(L.cols[1]!, 120, '合并首选 200−80=120 补末列（:1075-1080）')
  }

  // ── 7. 行高结算 ──
  {
    // auto：纯内容高（10pt 行 + 上下边距 2+2）
    const t = T([100], [R([C([P('ab')], { pad: [2, 5.4, 2, 5.4] })])])
    const L = layoutTable(t, ctxFix, 400)
    near(L.rows[0]!, 14, 'auto 行高 = pad + 内容（:3285-3296）')
  }
  {
    // exact 20 + 边距 2/2 → 净 24（−顶边 :2728 与回补 :3379 相消）
    const t = T([100], [R([C([P('ab')], { pad: [2, 5.4, 2, 5.4] })], { h: 20, exact: true })])
    const L = layoutTable(t, ctxFix, 400)
    near(L.rows[0]!, 24, 'exact = trHeight + MaxTopMargin + MaxBotMargin（:2719/:3009）')
  }
  {
    // exact + 顶边框 2：边框吃进高度内（rv−顶边后回补 → 净不变）
    const t = T([100], [R([C([P('ab')], { pad: [2, 5.4, 2, 5.4], borders: { t: '2pt solid #000' } })], { h: 20, exact: true })])
    const L = layoutTable(t, ctxFix, 400)
    near(L.rows[0]!, 24, 'exact 顶边框：净 = trHeight + 边距（:2728/:3379 相消）')
  }
  {
    // atLeast 8 < 内容 10 → 10；atLeast 20 > 内容 → 20
    const t = T([100], [R([C([P('ab')])], { h: 8 }), R([C([P('ab')])], { h: 20 })])
    const L = layoutTable(t, ctxFix, 400)
    near(L.rows[0]!, 10, 'atLeast 低于内容 → 内容高')
    near(L.rows[1]!, 20, 'atLeast 高于内容 → 补足（:3291-3294）')
  }
  {
    // auto + 底边框 1.5 → 内容 + 底边（:3386-3389）
    const t = T([100], [R([C([P('ab')], { borders: { b: '1.5pt solid #000' } })])])
    const L = layoutTable(t, ctxFix, 400)
    near(L.rows[0]!, 11.5, 'auto 行高 + 底边框')
  }
  {
    // 竖合并：合并格 need=44 > row0+row1 内容和 14 → 差额 30 摊末行；
    // row0 rv = MaxTopMargin(2) + botMarginEnd[0](0) = 2（合并格底边距归末行 :1293-1294）
    const tall = P('x'.repeat(24))
    const t = T(
      [50],
      [
        R([C([tall], { rowSpan: 2, pad: [2, 5.4, 2, 5.4] })]),
        R([C([P('ab')], { pad: [2, 5.4, 2, 5.4] })]),
      ],
      { layout: 'fixed' }, // 锁列宽 50 → 内容宽 39.2 → 144pt 长词折 4 行
    )
    const L = layoutTable(t, ctxFix, 400)
    // 合并格内容宽 = 50−10.8 = 39.2 → 144pt 词断 4 行 = 40 + pad 4 = 44
    near(L.rows[0]!, 2, '竖合并首行 = rv（无边距归属、无内容）')
    near(L.rows[1]!, 44, '竖合并差额摊末行（:3176-3190 语义）')
  }
  {
    // spacing 行：rv −= spacing（:2723-2724）
    const t = T([100], [R([C([P('ab')])], { h: 20 })], { cellSpacing: 2 })
    const L = layoutTable(t, ctxFix, 400)
    near(L.rows[0]!, 18, 'atLeast + spacing：rv=20−2=18 > 内容 10')
  }

  // ── 8. tableMinWidth / gridMinWidths ──
  {
    const t = T([100, 100], [R([C([P('')], { pad: [0, 10, 0, 20] }), C([P('')])])], { cellSpacing: 2 })
    // spacing×(格数+1) + Σmargin = 2×3 + (10+20)+(5.4+5.4) = 46.8（:16451-16457）
    near(tableMinWidth(t, 2), 46.8, 'GetTableMinWidth')
    const mg = gridMinWidths(t, 2, 2)
    arrNear(mg, [20 + 10 + 3, 5.4 + 5.4 + 3], 'GetMinGrid：首末格 1.5×spacing')
  }

  // ── 9. bw 解析 ──
  eq(bw('1pt solid #000'), 1, 'bw 解析线宽')
  eq(bw('none'), 0, 'bw none = 0')
  eq(bw(undefined), 0, 'bw 缺失 = 0')

  return Out
}

/** 端到端：真 docx（表格 XML 全链）→ parser → layoutTable + flowPaginate */
async function e2e(errs: string[]) {
  const { writeZip } = await import('./core/zipwrite')
  const { DocumentClient } = await import('./core/worker/client')
  const { flowPaginate } = await import('./view/docx/flow')
  const near = (a: number | undefined, b: number, msg: string, tol = 1e-4) => {
    if (a === undefined || Math.abs(a - b) > tol) errs.push(`e2e ${msg}: got ${a}, want ~${b}`)
  }
  const eq = (a: unknown, b: unknown, msg: string) => {
    if (JSON.stringify(a) !== JSON.stringify(b))
      errs.push(`e2e ${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
  const run = (text: string) =>
    `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`
  const cell = (text: string) => `<w:tc><w:p>${run(text)}</w:p></w:tc>`
  const row = (texts: string[], trPr = '') => `<w:tr>${trPr}${texts.map(cell).join('')}</w:tr>`
  // 3 列 × 30 行，首行表头 + trHeight 480(atLeast)；tblW 8640 dxa + fixed 网格 2880×3
  const rows = Array.from({ length: 30 }, (_, r) =>
    row(
      [`a${r}`, `b${r}`, `c${r}`],
      r === 0 ? '<w:trPr><w:trHeight w:val="480"/><w:tblHeader/></w:trPr>' : '',
    ),
  ).join('')
  const tbl =
    `<w:tbl><w:tblPr><w:tblW w:w="8640" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="2880"/><w:gridCol w:w="2880"/><w:gridCol w:w="2880"/></w:tblGrid>${rows}</w:tbl>`
  const paras = Array.from({ length: 40 }, (_, i) => `<w:p>${run(`Line ${i} ${'word '.repeat(12)}`)}</w:p>`).join('')
  const body =
    paras + tbl + `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>`
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`
  const files = new Map<string, string>([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', doc],
  ])
  const blob: Blob = await writeZip(files as any)
  const client: any = await DocumentClient.open(blob, { worker: false, name: 'x14.docx' })
  const blocks: any[] = []
  let meta: any = null
  client.on('docx:blocks', (bs: any) => blocks.push(...bs))
  client.on('docx:meta', (m: any) => (meta = m))
  await client.call('docx.start')
  await new Promise((r) => setTimeout(r, 400))
  client.destroy()

  const tblBlock = blocks.find((b) => b.t === 'tbl') as Table | undefined
  if (!tblBlock) { errs.push('e2e 未解析出表格'); return }
  eq(tblBlock.cols, [144, 144, 144], 'e2e 声明网格 2880twips → 144pt')
  eq(tblBlock.w, 432, 'e2e tblW 8640 → 432pt')
  eq(tblBlock.layout, 'fixed', 'e2e tblLayout fixed')
  eq(tblBlock.rows[0]!.h, 24, 'e2e trHeight 480 → 24pt')
  eq(tblBlock.rows[0]!.exact, false, 'e2e hRule 缺省 = atLeast')
  eq(tblBlock.rows[0]!.header, true, 'e2e tblHeader')

  // layoutTable 直测（真字体面：Carlito 10pt ≈ Calibri 度量）
  const { defaultRegistry } = await import('./core/font/measure')
  const reg = await defaultRegistry()
  const m10 = await reg.get('Carlito', 'word', {})
  const face10 = { ascent: m10.metrics(10).ascent, descent: -m10.metrics(10).descent }
  const aw = m10.advance(97 /* 'a' */, 10)
  const ctx: TableCtx = {
    pm: () => ({ face: () => face10, width: (a: number, b: number) => (b - a) * aw, endFace: () => face10 }),
    markSz: () => 10,
  }
  const L = layoutTable(tblBlock, ctx, 432)
  eq(L.autofit, false, 'e2e fixed → 无 Phase 2 分配')
  for (let i = 0; i < 3; i++) near(L.cols[i], 144, `e2e 列 ${i} = 声明网格`)
  near(L.rows[0], 24, 'e2e 表头行 = trHeight 24（atLeast > 内容）')
  for (let i = 1; i < 30; i++) {
    if (!(L.rows[i]! > 0 && L.rows[i]! < 24)) errs.push(`e2e 行 ${i} 高异常: ${L.rows[i]}`)
    if (Math.abs(L.rows[i]! - L.rows[1]!) > 1e-6) errs.push(`e2e 行 ${i} 高不齐: ${L.rows[i]} vs ${L.rows[1]}`)
  }

  // flowPaginate 回归：表按行拆 + 表头重复 + 页序连续
  const slices = await flowPaginate(blocks, {
    page: meta.page,
    font: meta.font ?? 'Calibri',
    sz: meta.sz ?? 11,
    lastKind: meta.sectKind ?? 'nextPage',
  })
  eq(slices[0].start, 0, 'e2e 首页从 0 起')
  eq(slices[slices.length - 1].end, blocks.length, 'e2e 末页覆盖到尾')
  for (let i = 1; i < slices.length; i++) {
    if (slices[i].start > slices[i - 1].end) errs.push(`e2e 页序断裂 at ${i}`)
    if (slices[i].start < slices[i - 1].start) errs.push(`e2e 页序回退 at ${i}`)
  }
  const tblBi = blocks.findIndex((b) => b.t === 'tbl')
  let sawRepeat = false
  for (const s of slices) {
    const f = s.frags?.[tblBi]
    if (f && f.r0 > 0 && f.repeat.join(',') === '0') sawRepeat = true
  }
  eq(sawRepeat, true, 'e2e 续页重复表头行')
  if (slices[0].used <= 0) errs.push('e2e 首页水位非正')
}

let cached: Promise<Record<string, unknown>> | null = null
function result() {
  if (!cached) {
    const Out = probe()
    const errs = Out.errors as string[]
    cached = e2e(errs)
      .catch((e) => errs.push(`e2e threw: ${e}`))
      .then(() => {
        Out.ok = errs.length === 0
        return Out
      })
  }
  return cached
}

registerSmokeMode('x14', () => {
  ;(window as any).__smoke.x14 = { result }
  return () => h('div', { style: 'width:100%;height:100%' }, 'x14 table layout probe')
})
