/**
 * x13 探针（路线图 P2 行高分页，?mode=x13）：core/docx/layout.ts 与 sdkjs
 * word/Editor/Paragraph_Recalculate.js 的语义一致性断言（纯同步数值，无 DOM）。
 *
 * 断言面（每条都对着 sdkjs 原文核过）：
 *  1. resolveLineGap 三规则（:3003-3090）：
 *     auto 倍数只乘【文本高】(ta+td)；exact 下限 1pt + 超垂三级削减
 *     （Descent→Ascent→按 ta/td 比例）+ 欠垂差额全垫 Ascent；
 *     atLeast 只补到目标高，且 Gap 并入 Ascent、LineGap 清零（:2993 文本坐底）；
 *  2. updateMetrics（:2970）：逐分量 max，出口恒夹 a≥ta / d≥td；
 *  3. layoutParagraph：wrap 集成区间拼回原文、'\n' 归前段尾、空行段尾标记撑高
 *     （:1284-1345）、多字号行内取 max、flags 透传；
 *  4. flowBlocks：nofit 换页、after 豁免（:1600）、widow 双侧（:1893/:2524）、
 *     keepLines（:2552）、keepNext（:14675）链卷回、原点放弃闸门（Can_RecalcWidowControl）、
 *     续页不带 Before（:2605）、表头重复 repH、opaque 豁免、多栏换栏、carry 增量；
 *  5. rowFrag / toFlow 契约。
 *
 * 顶层只注册 mode；结果挂 window.__smoke.x13。
 */
import { h } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import {
  EXACT_MIN_PT,
  newMetrics,
  updateMetrics,
  resolveLineGap,
  layoutParagraph,
  toFlow,
  flowBlocks,
  rowFrag,
  type Face,
  type FlowBlock,
  type ParaMeasure,
  type ParaRun,
} from './core/docx/layout'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

// ── 测量 fixture：ascent=0.8·sz, descent=0.2·sz（无 overhang） ──
const face = (sz: number): Face => ({ ascent: sz * 0.8, descent: sz * 0.2 })
const pmOf = (charW: number): ParaMeasure => ({
  face: (_run, sz) => face(sz),
  width: (from, to) => (to - from) * charW,
  endFace: (sz) => face(sz),
})

function probe() {
  const R: Record<string, unknown> = { ok: false, errors: [] as string[] }
  const errs = R.errors as string[]
  const eq = (a: unknown, b: unknown, msg: string) => {
    if (a !== b) errs.push(`${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
  const near = (a: number | undefined, b: number, msg: string, tol = 1e-9) => {
    if (a === undefined || Math.abs(a - b) > tol) errs.push(`${msg}: got ${a}, want ~${b}`)
  }

  // ── 1. resolveLineGap：auto ──
  {
    // ta=10 td=2 a=12 d=4（双侧 overhang）；文本高 12，行盒 16
    const mk = () => ({ ta: 10, td: 2, a: 12, d: 4, gap: 0 })
    let m = mk()
    near(resolveLineGap(m, { rule: 'auto', line: 1 }), 16, 'auto 1.0 = 行盒高')
    eq(m.gap, 0, 'auto 1.0 gap=0')
    m = mk()
    // 倍数只乘文本高：gap=(10+2)*(1.5-1)=6 → h=12+4+6
    near(resolveLineGap(m, { rule: 'auto', line: 1.5 }), 22, 'auto 1.5 只乘文本高')
    near(m.gap, 6, 'auto 1.5 gap=6')
    m = mk()
    near(resolveLineGap(m, { rule: 'auto', line: 2 }), 28, 'auto 2.0')
  }

  // ── 1. resolveLineGap：exact ──
  {
    const mk = () => ({ ta: 10, td: 2, a: 12, d: 4, gap: 0 })
    // 欠垂：差额全垫 Ascent（:3084 else 分支）
    let m = mk()
    near(resolveLineGap(m, { rule: 'exact', line: 20 }), 20, 'exact 20 欠垂')
    near(m.a, 16, 'exact 欠垂垫进 Ascent')
    eq(m.d, 4, 'exact 欠垂不动 Descent')
    eq(m.gap, 0, 'exact gap 恒 0')
    // 超垂二级：Descent 削尽（dd=1）后不足部分削 Ascent（ad=2 ≥ 余 1）
    m = { ta: 10, td: 2, a: 12, d: 3, gap: 0 } // 盒 15，exact 13 → 超 2
    near(resolveLineGap(m, { rule: 'exact', line: 13 }), 13, 'exact 二级削减到目标')
    eq(m.d, 2, 'exact Descent 削至 TextDescent')
    eq(m.a, 11, 'exact Ascent 削余量 1')
    // 三级：Descent→Ascent→比例
    m = mk() // 盒 16，exact 10 → 超 6；dd=2 → d=2 余 4；ad=2 → a=10 余 2；比例 sum=12
    near(resolveLineGap(m, { rule: 'exact', line: 10 }), 10, 'exact 三级削减到目标')
    near(m.a, (10 * (12 - 2)) / 12, 'exact 比例削 Ascent')
    near(m.d, (2 * (12 - 2)) / 12, 'exact 比例削 Descent')
    // 下限 1pt（25.4/72 mm ≡ 1pt，:3017）
    eq(EXACT_MIN_PT, 1, 'exact 下限 = 1pt')
    m = mk()
    near(resolveLineGap(m, { rule: 'exact', line: 0.5 }), 1, 'exact 0.5 → 夹到 1pt')
  }

  // ── 1. resolveLineGap：atLeast ──
  {
    // 行盒 16 ≥ 14 → 不补
    let m = { ta: 10, td: 2, a: 12, d: 4, gap: 0 }
    near(resolveLineGap(m, { rule: 'atLeast', line: 14 }), 16, 'atLeast 已超目标不补')
    eq(m.gap, 0, 'atLeast 不补时 gap=0')
    // 行盒 16 < 18 → 补 2；补后 18 > 文本高 12 → Gap 并入 Ascent（:2993）
    m = { ta: 10, td: 2, a: 12, d: 4, gap: 0 }
    near(resolveLineGap(m, { rule: 'atLeast', line: 18 }), 18, 'atLeast 补差到目标')
    eq(m.a, 14, 'atLeast Gap 并入 Ascent')
    eq(m.gap, 0, 'atLeast 坐底后 LineGap 清零')
    // 无 overhang：a=ta d=td，同样并入 Ascent
    m = { ta: 10, td: 2, a: 10, d: 2, gap: 0 }
    near(resolveLineGap(m, { rule: 'atLeast', line: 18 }), 18, 'atLeast 无 overhang 补差')
    eq(m.a, 16, 'atLeast 无 overhang Gap 并入 Ascent')
    eq(m.gap, 0, 'atLeast 无 overhang 清零')
    // 空度量（|tl|<0.001）：不补
    m = newMetrics()
    near(resolveLineGap(m, { rule: 'atLeast', line: 20 }), 0, 'atLeast 空度量 h=0')
  }

  // ── 2. updateMetrics 出口夹 ──
  {
    const m = newMetrics()
    updateMetrics(m, 10, 2, 8, 1) // a/d 低于 ta/td → 夹回
    eq(m.a, 10, 'update 夹 Ascent')
    eq(m.d, 2, 'update 夹 Descent')
    updateMetrics(m, 9, 1, 12, 4) // 更低 ta/td，更高 a/d → a/d 保留
    eq(m.ta, 10, 'update ta 取 max')
    eq(m.a, 12, 'update a 取 max')
    eq(m.d, 4, 'update d 取 max')
  }

  // ── 3. layoutParagraph ──
  {
    // 断行集成：3 词 × 5pt/字，'aaa bbb' 可见宽 35 > 30 → 每行一词
    const runs: ParaRun[] = [{ t: 'text', text: 'aaa bbb ccc', sz: 10 }]
    const L = layoutParagraph(runs, pmOf(5), { xLimit: 30, ps: {} })
    eq(L.lines.length, 3, 'wrap 集成行数')
    eq(L.lines[0].start, 0, '行区间首 start')
    eq(L.lines[2].end, 11, '行区间末 end 覆盖全文')
    eq(L.lines[1].start === L.lines[0].end && L.lines[2].start === L.lines[1].end, true, '区间无缝拼接')
    near(L.content, 30, 'auto 1.0 行高合计 = 3×10')
    // '\n 归前段尾 + forced 标记
    const L2 = layoutParagraph([{ t: 'text', text: 'ab\ncd', sz: 10 }], pmOf(4), { xLimit: 100, ps: {} })
    eq(L2.lines.length, 2, '\\n 切两段')
    eq(L2.lines[0].end, 3, '\\n 计入前一行尾')
    eq(L2.lines[0].forced, true, '硬换行行 forced')
    eq(L2.lines[1].forced, false, '末行非 forced')
    eq(L2.lines[1].start, 3, '第二段起点跳过 \\n')
    // 空行：段尾标记撑高（:1326）
    const L3 = layoutParagraph([{ t: 'text', text: 'a\n\nb', sz: 10 }], pmOf(4), { xLimit: 100, ps: {} })
    eq(L3.lines.length, 3, '空段成行')
    eq(L3.lines[1].width, 0, '空行可见宽 0')
    near(L3.lines[1].h, 10, '空行 endFace 撑高（sz=10 → 8+2）')
    eq(L3.lines[1].end - L3.lines[1].start, 1, '空行区间 = \\n 本身')
    // 空段落（无 run）：markSz 兜底 11
    const L4 = layoutParagraph([], pmOf(4), { xLimit: 100, ps: {} })
    eq(L4.lines.length, 1, '空段落一行')
    near(L4.lines[0].h, 11, '空段落 markSz 兜底 11 → 行高 11')
    // 多字号行内取 max：sz10 + sz20 → ta=16 td=4
    const L5 = layoutParagraph(
      [{ t: 'text', text: 'aa', sz: 10 }, { t: 'text', text: 'bb', sz: 20 }],
      pmOf(4), { xLimit: 100, ps: {} })
    eq(L5.lines.length, 1, '多字号单行')
    near(L5.lines[0].h, 20, '行内逐 run 取 max 度量')
    // exact 规则穿透到行高（三级削减后 = 15）
    const L6 = layoutParagraph(
      [{ t: 'text', text: 'aa', sz: 10 }, { t: 'text', text: 'bb', sz: 20 }],
      pmOf(4), { xLimit: 100, ps: { lineRule: 'exact', line: 15 } })
    near(L6.lines[0].h, 15, 'exact 15 结算行高')
    // flags 透传
    const L7 = layoutParagraph([{ t: 'text', text: 'x', sz: 10 }], pmOf(4), {
      xLimit: 100,
      ps: { before: 6, after: 12, widow: false, keepLines: true, keepNext: true, pageBreakBefore: true },
    })
    eq(L7.before, 6, 'before 透传')
    eq(L7.after, 12, 'after 透传')
    eq(L7.widow, false, 'widow=false 透传')
    eq(L7.keepLines, true, 'keepLines 透传')
    eq(L7.keepNext, true, 'keepNext 透传')
    eq(L7.brk, true, 'pageBreakBefore 透传')
    // toFlow 映射
    const fb = toFlow(L7)
    eq(fb.lines.length, 1, 'toFlow 行高序列')
    eq(fb.brk, true, 'toFlow brk')
  }

  // ── 4. flowBlocks ──
  const B = (lines: number[], opt: Partial<FlowBlock> = {}): FlowBlock => ({
    lines, before: 0, after: 0, widow: true, keepLines: false, keepNext: false, brk: false, ...opt,
  })
  const partsOf = (r: ReturnType<typeof flowBlocks>, pi: number) => r.pages[pi].parts.map((p) => `${p.bi}[${p.l0},${p.l1})@${p.col}`)

  {
    // 基础换页：3 块 × 2 行 × 40pt，avail=100 → 每页一块
    const r = flowBlocks([B([40, 40]), B([40, 40]), B([40, 40])], { avail: 100 })
    eq(r.pages.length, 3, 'nofit 换页页数')
    eq(partsOf(r, 0).join(','), '0[0,2)@0', '第一页仅块 0')
    eq(r.trace.includes('nofit:1'), true, 'trace nofit:1')
    eq(r.trace.includes('nofit:2'), true, 'trace nofit:2')
  }
  {
    // after 豁免（:1600）：行本身放得进、仅 After 超高 → 钳到 avail 不换页
    const r = flowBlocks([B([95], { after: 10 })], { avail: 100 })
    eq(r.pages.length, 1, 'after 豁免不换页')
    near(r.pages[0].colUsed[0], 100, 'after 豁免钳到 avail')
    // 对照：行 + After 都放得进 → 正常结算（不钳界）
    const r2 = flowBlocks([B([95], { after: 4 })], { avail: 100 })
    eq(r2.pages.length, 1, '正常放得进不换页')
    near(r2.pages[0].colUsed[0], 99, '正常 = 95+4')
    // 超出量 > After → 不豁免 → 原点 nofit 强放
    const r3 = flowBlocks([B([105], { after: 3 })], { avail: 100 })
    eq(r3.trace.includes('nofit-accept:0'), true, '超 After → 原点放弃')
    near(r3.pages[0].colUsed[0], 100, '强放钳到页底')
  }
  {
    // widow：前块 90，本块 4×10 → 仅 1 行落本页 → 整块挪下页
    const r = flowBlocks([B([30, 30, 30]), B([10, 10, 10, 10])], { avail: 100 })
    eq(r.pages.length, 2, 'widow 整块挪页页数')
    eq(partsOf(r, 1).join(','), '1[0,4)@0', 'widow 后块完整在下页')
    eq(r.trace.includes('widow:1'), true, 'trace widow:1')
  }
  {
    // orphan 侧：12×10 块，残留 2 行合法 → 拆 10+2
    const r = flowBlocks([B([30, 30, 30]), B(new Array(12).fill(10))], { avail: 100 })
    eq(r.pages.length, 3, 'orphan 残留 2 行合法')
    eq(partsOf(r, 1).join(','), '1[0,10)@0', '第二页 10 行')
    eq(partsOf(r, 2).join(','), '1[10,12)@0', '第三页残留 2 行')
  }
  {
    // keepLines：块不可切 → 整块挪下页
    const r = flowBlocks([B([60]), B([30, 30, 30], { keepLines: true })], { avail: 100 })
    eq(r.pages.length, 2, 'keepLines 整块挪页')
    eq(partsOf(r, 1).join(','), '1[0,3)@0', 'keepLines 后块完整')
    // 原点放弃：单块 keepLines 切不动 → 接受切分
    const r2 = flowBlocks([B([30, 30, 30], { keepLines: true })], { avail: 50 })
    eq(r2.trace.includes('keeplines-accept:0'), true, 'keepLines 原点放弃')
    eq(r2.trace.includes('widow-accept:0'), true, 'widow 原点放弃接力')
  }
  {
    // keepNext 链卷回：填充块 + 双 keepNext + widow 触发 → 三块同迁下页
    const r = flowBlocks(
      [B([50]), B([20], { keepNext: true }), B([20], { keepNext: true }), B([30, 30, 30])],
      { avail: 100 })
    eq(r.pages.length, 3, '链卷回页数')
    eq(partsOf(r, 0).join(','), '0[0,1)@0', '第一页仅填充块')
    eq(partsOf(r, 1).join(','), '1[0,1)@0,2[0,1)@0,3[0,2)@0', '第二页 = 标题链 + 2 行')
    eq(partsOf(r, 2).join(','), '3[2,3)@0', '第三页 = 残行')
    eq(r.trace.includes('keepnext:2'), true, 'trace keepnext:2（链卷回换页）')
    eq(r.trace.includes('widow-accept:3'), true, 'trace widow 原点放弃接力')
  }
  {
    // keepNext 满足：下段首行落得进 → 不触发
    const r = flowBlocks([B([60], { keepNext: true }), B([30])], { avail: 100 })
    eq(r.pages.length, 1, 'keepNext 满足同页')
    // keepNext 触发 + 非原点卷回：填充块在前，标题链可挪
    const r2 = flowBlocks([B([10]), B([80], { keepNext: true }), B([30])], { avail: 100 })
    eq(r2.pages.length, 2, 'keepNext 卷回页数')
    eq(partsOf(r2, 1).join(','), '1[0,1)@0,2[0,1)@0', '卷回后标题与下段同页')
  }
  {
    // 表格：8×10 行 + 表头行 0，avail=50 → 续页重复表头
    const r = flowBlocks([B(new Array(8).fill(10), { opaque: true, header: [0] })], { avail: 50 })
    eq(r.pages.length, 2, '表格分页页数')
    eq(partsOf(r, 0).join(','), '0[0,5)@0', '第一页 5 行')
    eq(partsOf(r, 1).join(','), '0[5,8)@0', '第二页 3 行')
    near(r.pages[1].colUsed[0], 40, '续页 = 重复表头 10 + 3×10')
    const rf = rowFrag(B(new Array(8).fill(10), { header: [0] }), 5, 8)
    eq(rf.repeat.join(','), '0', 'rowFrag 续页重复表头')
    eq(rowFrag(B([10, 10], { header: [0] }), 0, 2).repeat.length, 0, 'rowFrag 首页不重复')
  }
  {
    // brk 强制换页 / 原点免换
    const r = flowBlocks([B([10]), B([10], { brk: true })], { avail: 100 })
    eq(r.pages.length, 2, 'brk 强制换页')
    eq(r.trace.includes('break:1'), true, 'trace break:1')
    const r2 = flowBlocks([B([10], { brk: true })], { avail: 100 })
    eq(r2.pages.length, 1, 'brk 空页不强换')
    // 无形块（sect）占位 [0,0)
    const r3 = flowBlocks([B([])], { avail: 100 })
    eq(partsOf(r3, 0).join(','), '0[0,0)@0', '无形块片段 [0,0)')
    // brkA 断后换页（sect kind !== continuous）/ continuous 不断
    const r4 = flowBlocks([B([10]), B([], { brkA: true }), B([10])], { avail: 100 })
    eq(r4.pages.length, 2, 'brkA 断后换页')
    eq(partsOf(r4, 0).join(','), '0[0,1)@0,1[0,0)@0', '断块留原页尾')
    eq(partsOf(r4, 1).join(','), '2[0,1)@0', '后续块在新页')
    eq(r4.trace.includes('break-after:1'), true, 'trace break-after:1')
    const r5 = flowBlocks([B([10]), B([], { brkA: false }), B([10])], { avail: 100 })
    eq(r5.pages.length, 1, 'continuous 不分页')
  }
  {
    // opaque 豁免 widow：表格 3×30 从 50 水位起 → 切 1+2 不卷回
    const r = flowBlocks([B([50]), B([30, 30, 30], { opaque: true })], { avail: 100 })
    eq(partsOf(r, 0).join(','), '0[0,1)@0,1[0,1)@0', 'opaque 首页切 1 行')
    eq(partsOf(r, 1).join(','), '1[1,3)@0', 'opaque 续页 2 行')
  }
  {
    // hasPrev=false：widow 不触发
    const r = flowBlocks([B([50]), B([30, 30, 30])], { avail: 100, hasPrev: false })
    eq(r.trace.some((t) => t.startsWith('widow')), false, 'hasPrev=false 跳过 widow')
    eq(partsOf(r, 1).join(','), '1[1,3)@0', '直接切分')
  }
  {
    // 续页不带 Before（:2605）
    const r = flowBlocks([B([60, 60], { before: 20 })], { avail: 100 })
    near(r.pages[0].colUsed[0], 80, '首页含 Before')
    near(r.pages[1].colUsed[0], 60, '续页免 Before')
  }
  {
    // 多栏：2 行 ×60 块 + 30 块，avail=100 → 同页换栏
    const r = flowBlocks([B([60, 60]), B([30])], { avail: 100, cols: 2 })
    eq(r.pages.length, 1, '多栏同页')
    eq(partsOf(r, 0).join(','), '0[0,1)@0,0[1,2)@1,1[0,1)@1', '跨栏片段互不覆盖')
    near(r.pages[0].colUsed[0], 60, '栏 0 水位不受换栏影响')
    near(r.pages[0].colUsed[1], 90, '栏 1 水位 = 60+30')
    // 栏满换页：3×90 双栏 → 页 1 两栏各 1 行 + 页 2 第 3 行
    const r2 = flowBlocks([B([90, 90, 90])], { avail: 100, cols: 2 })
    eq(r2.pages.length, 2, '栏满换页')
    near(r2.pages[0].colUsed[0], 90, '页 1 栏 0')
    near(r2.pages[0].colUsed[1], 90, '页 1 栏 1')
    eq(partsOf(r2, 1).join(','), '0[2,3)@0', '页 2 残行')
  }
  {
    // carry 增量入口：前页已用 10pt，从块 1 起算
    const r = flowBlocks([B([10]), B([60, 60])], { avail: 100 }, { from: 1, used: 10, col: 0 })
    eq(r.pages.length, 3, 'carry 起点水位生效')
    eq(r.pages[0].parts.length, 0, 'carry 首占位页无片段')
    near(r.pages[0].colUsed[0], 10, 'carry 水位承接')
    eq(partsOf(r, 1).join(','), '1[0,1)@0', 'carry 后首页放块 1 首行')
  }
  {
    // 病态文档：单行超高 ×2，avail=10 → 强放防死循环
    const r = flowBlocks([B([100, 100])], { avail: 10 })
    eq(r.pages.length, 2, '超高行强放分页')
    eq(r.trace.includes('nofit-accept:0'), true, '原点放弃 trace')
  }

  return R
}

/** 端到端：真 docx → 内核分页（字体 wasm 全链），断言页序连续 + 表头重复 + 全覆盖 */
async function e2e(errs: string[]) {
  const { writeZip } = await import('./core/zipwrite')
  const { DocumentClient } = await import('./core/worker/client')
  const { flowPaginate } = await import('./view/docx/flow')
  const run = (text: string) =>
    `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`
  const paras = Array.from({ length: 40 }, (_, i) => `<w:p>${run(`Line ${i} ${'word '.repeat(12)}`)}</w:p>`).join('')
  const rows = Array.from(
    { length: 30 },
    (_, r) =>
      `<w:tr>${r === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}<w:tc><w:p>${run(`cell ${r}`)}</w:p></w:tc></w:tr>`,
  ).join('')
  const body =
    paras +
    `<w:tbl><w:tblPr><w:tblW w:w="4320" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="4320"/></w:tblGrid>${rows}</w:tbl>` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>`
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`
  const files = new Map<string, string>([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', doc],
  ])
  const blob: Blob = await writeZip(files as any)
  const client: any = await DocumentClient.open(blob, { worker: false, name: 'x13.docx' })
  const blocks: any[] = []
  let meta: any = null
  client.on('docx:blocks', (bs: any) => blocks.push(...bs))
  client.on('docx:meta', (m: any) => (meta = m))
  await client.call('docx.start')
  await new Promise((r) => setTimeout(r, 400))
  client.destroy()

  const slices = await flowPaginate(blocks, {
    page: meta.page,
    font: meta.font ?? 'Calibri',
    sz: meta.sz ?? 11,
    lastKind: meta.sectKind ?? 'nextPage',
  })
  const eq = (a: unknown, b: unknown, msg: string) => {
    if (a !== b) errs.push(`e2e ${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
  eq(slices[0].start, 0, '首页从 0 起')
  eq(slices[slices.length - 1].end, blocks.length, '末页覆盖到尾')
  for (let i = 1; i < slices.length; i++) {
    if (slices[i].start > slices[i - 1].end) errs.push(`e2e 页序断裂 at ${i}: ${slices[i - 1].end} → ${slices[i].start}`)
    if (slices[i].start < slices[i - 1].start) errs.push(`e2e 页序回退 at ${i}`)
  }
  if (slices.length < 2) errs.push(`e2e 页数不足: ${slices.length}`)
  // 表格跨页：存在带 repeat=[0] 的 frag（tblHeader 重复）
  const tblBi = blocks.findIndex((b) => b.t === 'tbl')
  let sawRepeat = false
  let sawSplit = false
  for (const s of slices) {
    const f = s.frags?.[tblBi]
    if (!f) continue
    sawSplit = true
    if (f.r0 > 0 && f.repeat.join(',') === '0') sawRepeat = true
  }
  eq(sawSplit, true, '表格按行拆分')
  eq(sawRepeat, true, '续页重复表头行')
  // 行高自算：段落块高 ≠ 旧估算公式（18/19pt 系），且 > 0
  const first = slices[0]
  if (first.used <= 0) errs.push('e2e 首页水位非正')
}

let cached: Promise<Record<string, unknown>> | null = null
function result() {
  if (!cached) {
    const R = probe()
    const errs = R.errors as string[]
    cached = e2e(errs)
      .catch((e) => errs.push(`e2e threw: ${e}`))
      .then(() => {
        R.ok = errs.length === 0
        return R
      })
  }
  return cached
}

registerSmokeMode('x13', () => {
  ;(window as any).__smoke.x13 = { result }
  return () => h('div', { style: 'width:100%;height:100%' }, 'x13 line/pagination probe')
})
