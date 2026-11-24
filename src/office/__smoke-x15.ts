/**
 * x15 探针（路线图 P4a 行级激活，?mode=x15）：LineGeom.sp 结算与 ParaFrag.xl 物化
 * 的语义一致性断言 + 真字体端到端（buildFlowBlocks → flowBlocks → slicesOf）。
 *
 * 断言面（每条对着 sdkjs 原文 / 内核注释推演）：
 *  1. countSpaces（layout.ts）：justify 分母 —— 尾随 U+0020 剔除后数行内空格；
 *     '\n'（硬断）归前一行尾但不计数；tab（U+0009）永不计入；
 *     软换行的断点即行尾空格 → 恒被剔（sp=0，Word 不拉伸悬挂空格）。
 *  2. buildFlowBlocks 段落 → FlowBlock：detail 与 lines 等长、h 同源；
 *     s/e 为 marker 平移域（负 s = marker 前缀）；xLimit = max(10, 栏宽 − indL − indR)。
 *  3. slicesOf 物化：paras[bi] 逐行片段恒物化（xl = fb.xLimit、tail = 段末行判据）；
 *     跨页/同页跨栏片段按放置顺序累积拼接、行区间衔接无重叠；
 *     无 detail 块（表/sect）不进 paras；缺 xLimit 回退 0。
 *
 * 顶层只注册 mode；结果挂 window.__smoke.x15。
 */
import { h } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import {
  layoutParagraph,
  flowBlocks,
  type FlowBlock,
  type LineGeom,
  type ParaMeasure,
  type ParaRun,
} from './core/docx/layout'
import { buildFlowBlocks, slicesOf, flowPaginate, type FlowEnv } from './view/docx/flow'
import type { ListMarker, PageSetup, Paragraph } from './core/docx/types'

// ── 合成测量面：等宽字符（charW=10pt），ascent=0.8·sz descent=0.2·sz ──
const pmOf = (charW: number): ParaMeasure => ({
  face: (_r, sz) => ({ ascent: sz * 0.8, descent: sz * 0.2 }),
  width: (a, b) => (b - a) * charW,
  endFace: (sz) => ({ ascent: sz * 0.8, descent: sz * 0.2 }),
})
const lay = (text: string, xLimit: number) =>
  layoutParagraph([{ t: 'text', text, sz: 10 } as ParaRun], pmOf(10), { xLimit, ps: {} })

function probe() {
  const R: Record<string, unknown> = { ok: false, errors: [] as string[] }
  const errs = R.errors as string[]
  const eq = (a: unknown, b: unknown, msg: string) => {
    if (a !== b) errs.push(`${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
  const near = (a: number | undefined, b: number, msg: string, tol = 1e-9) => {
    if (a === undefined || Math.abs(a - b) > tol) errs.push(`${msg}: got ${a}, want ~${b}`)
  }

  // ── A. countSpaces：justify 分母（合成等宽） ──
  {
    // 硬断行（\n）：行内空格全计；'\n' 归前一行尾但不计
    const L = lay('aa bb cc\ndd ee', 200)
    eq(L.lines.length, 2, 'A1 两行')
    eq(L.lines[0]!.sp, 2, 'A1 硬断行内 2 空格')
    eq(L.lines[0]!.end, 9, 'A1 \\n 归前一行尾')
    eq(L.lines[1]!.sp, 1, 'A1 续段 1 空格')
    eq(L.lines[1]!.start, 9, 'A1 续段起点跳过 \\n')
  }
  {
    const L = lay('ab \ncd', 200)
    eq(L.lines[0]!.sp, 0, 'A2 硬断行尾悬挂空格不计')
  }
  {
    const L = lay('a  b\nc', 200)
    eq(L.lines[0]!.sp, 2, 'A3 行内连续 2 空格全计')
  }
  {
    const L = lay('a\tb\nc', 200)
    eq(L.lines[0]!.sp, 0, 'A4 tab 不计（U+0009 ≠ U+0020）')
  }
  {
    const L = lay('\n', 200)
    eq(L.lines.length, 2, 'A5 连续换行 = 两段空行')
    eq(L.lines[0]!.sp, 0, 'A5 空段 sp=0')
    eq(L.lines[1]!.sp, 0, 'A5 空段 sp=0（\\n 计入行尾）')
    eq(L.lines[0]!.end, 1, 'A5 首空行含 \\n')
  }
  {
    // 软换行：断点即空格 → 行尾剔除，sp=0；可见宽同步剔除
    const L = lay('aa bb', 30)
    eq(L.lines.length, 2, 'A6 软断两行')
    eq(L.lines[0]!.sp, 0, 'A6 软断行尾空格不计')
    near(L.lines[0]!.width, 20, 'A6 可见宽剔行尾')
    near(L.lines[1]!.width, 20, 'A6 末行可见宽')
  }
  {
    // 原子词硬截：行内无空格 → sp=0；硬截行 forced=true
    const L = lay('ab cd efghij', 35)
    eq(L.lines.length, 4, 'A7 超宽原子词四行')
    eq(L.lines[2]!.sp, 0, 'A7 硬截行 sp=0')
    eq(L.lines[2]!.forced, true, 'A7 词内硬截 forced')
  }

  // ── C. slicesOf：ParaFrag 物化（合成 FlowBlock，无字体依赖） ──
  const det = (i: number): LineGeom => ({ s: i * 3, e: i * 3 + 3, h: 10, a: 8, w: 20, f: false, sp: 1 })
  function fbOf(lines: number[], extra: Partial<FlowBlock> = {}): FlowBlock {
    return { lines, before: 0, after: 0, widow: false, keepLines: false, keepNext: false, brk: false, ...extra }
  }
  {
    // 段落跨页拆分 + 表格共存
    const fbP = fbOf([10, 10, 10], { detail: [det(0), det(1), det(2)], xLimit: 300 })
    const fbT = fbOf([15, 15], { header: [0], opaque: true })
    const fbs = [fbP, fbT]
    const slices = slicesOf(flowBlocks(fbs, { avail: 25 }), fbs, 1)
    eq(slices.length, 3, 'C1 三页（段 2+1，表 1+1）')
    eq(slices[0]!.paras?.[0]?.lines.length, 2, 'C1 首页恒物化两行')
    eq(slices[0]!.paras?.[0]?.xl, 300, 'C1 xl = fb.xLimit')
    eq(slices[0]!.paras?.[0]?.tail, undefined, 'C1 非末片段无 tail')
    eq(slices[1]!.paras?.[0]?.tail, true, 'C1 末片段 tail=true')
    eq(slices[1]!.paras?.[0]?.lines[0]!.s, 6, 'C1 续页行区间衔接')
    eq(Object.keys(slices[1]!.paras ?? {}).join(), '0', 'C1 表块不进 paras')
    eq(slices[1]!.frags?.[1]?.r0, 0, 'C1 表首页 frag')
    eq(slices[1]!.frags?.[1]?.repeat.length, 0, 'C1 表首页不重复表头')
    eq(slices[2]!.frags?.[1]?.repeat.join(), '0', 'C2 表续页重复表头')
  }
  {
    // 同页跨栏：两段累积为一个 ParaFrag
    const fbP = fbOf([10, 10, 10, 10], { detail: [det(0), det(1), det(2), det(3)], xLimit: 150 })
    const slices = slicesOf(flowBlocks([fbP], { avail: 25, cols: 2 }), [fbP], 2)
    eq(slices.length, 1, 'C3 两栏同页')
    eq(slices[0]!.paras?.[0]?.lines.length, 4, 'C3 跨栏片段累积')
    eq(slices[0]!.paras?.[0]?.lines.map((l) => l.s).join(','), '0,3,6,9', 'C3 区间顺序连续')
    eq(slices[0]!.paras?.[0]?.tail, true, 'C3 末栏片段 tail')
  }
  {
    // 防御：detail 在而 xLimit 缺 → xl 回退 0
    const fb = fbOf([10], { detail: [det(0)] })
    const slices = slicesOf(flowBlocks([fb], { avail: 25 }), [fb], 1)
    eq(slices[0]!.paras?.[0]?.xl, 0, 'C4 缺 xLimit 回退 0')
  }
  return R
}

// ── B. 真字体端到端（Carlito 11pt，wasm 度量） ──
async function e2e(errs: string[]) {
  const eq = (a: unknown, b: unknown, msg: string) => {
    if (a !== b) errs.push(`${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
  const near = (a: number | undefined, b: number, msg: string, tol = 1e-9) => {
    if (a === undefined || Math.abs(a - b) > tol) errs.push(`${msg}: got ${a}, want ~${b}`)
  }
  const page: PageSetup = { w: 2000, h: 100, mt: 0, mr: 10, mb: 0, ml: 10, header: 0, footer: 0 }
  const env: FlowEnv = { page, font: 'Carlito', sz: 11, lastKind: 'nextPage' }
  const T = (text: string) => ({ t: 'text' as const, text, s: {} })
  const P = (runs: Paragraph['runs'], ps: Paragraph['ps'] = {}, marker?: ListMarker): Paragraph =>
    ({ t: 'p', ps, runs, ...(marker ? { marker } : {}) }) as Paragraph

  // B1 段落 detail 契约：sp / xLimit / 等长 / 衔接（字体无关的计数断言）
  const [fb1] = await buildFlowBlocks([P([T('aa bb cc\ndd ee')])], env)
  eq(fb1!.detail?.length, 2, 'B1 两段各一行')
  eq(fb1!.detail!.length, fb1!.lines.length, 'B1 detail 与 lines 等长')
  eq(fb1!.xLimit, 1980, 'B1 xLimit = 栏宽（无缩进）')
  eq(fb1!.detail![0]!.sp, 2, 'B1 硬断行 sp=2')
  eq(fb1!.detail![0]!.e, 9, 'B1 \\n 归行尾（e=9）')
  eq(fb1!.detail![1]!.sp, 1, 'B1 续段 sp=1')
  eq(fb1!.detail![1]!.s, fb1!.detail![0]!.e, 'B1 行区间衔接')
  near(fb1!.detail![0]!.h, fb1!.lines[0], 'B1 行高同源')
  // auto 规则 gap=0 → h = a + d（d 不可反推，只断言 a 落在 (0, h) 开区间）
  if (!(fb1!.detail![0]!.a > 0 && fb1!.detail![0]!.a < fb1!.detail![0]!.h))
    errs.push(`B1 a 越界: a=${fb1!.detail![0]!.a} h=${fb1!.detail![0]!.h}`)

  // B2 marker 平移域 + tab 不计
  const [fb2] = await buildFlowBlocks([P([T('ab\ncd')], {}, { text: '•', tab: true, s: {} })], env)
  eq(fb2!.detail![0]!.s, -2, 'B2 marker 前缀（•+tab）→ 负 s')
  eq(fb2!.detail![0]!.e, 3, 'B2 \\n 计入行尾（平移域）')
  eq(fb2!.detail![0]!.sp, 0, 'B2 marker tab 不计 sp')
  eq(fb2!.detail![1]!.s, 3, 'B2 续行衔接')
  eq(fb2!.detail![1]!.e, 5, 'B2 末行 e = 拍平末位')

  // B3 缩进 → xLimit 扣减 / 下限钳制
  const env2: FlowEnv = { ...env, page: { ...page, w: 600, ml: 50, mr: 50 } }
  const fbs3 = await buildFlowBlocks([P([T('x')], { indL: 100, indR: 50 }), P([T('y')], { indL: 1000 })], env2)
  eq(fbs3[0]!.xLimit, 350, 'B3 xLimit = 500 − 100 − 50')
  eq(fbs3[1]!.xLimit, 10, 'B3 负宽钳到 10')

  // B4 flowPaginate 端到端：逐页 paras 恒物化 + tail 唯一 + sp 透传 + 跨页衔接
  const slices = await flowPaginate([P([T(Array(30).fill('ab cd').join('\n'))])], env)
  let total = 0
  let tails = 0
  for (const s of slices) {
    const pf = s.paras?.[0]
    if (!pf) { errs.push('B4 页缺 paras'); continue }
    eq(pf.xl, 1980, 'B4 xl 恒栏宽')
    for (const l of pf.lines) { eq(l.sp, 1, 'B4 每行 sp=1 透传'); total++ }
    if (pf.tail) tails++
  }
  eq(total, 30, 'B4 三十行全物化')
  eq(tails, 1, 'B4 仅末页 tail')
  eq(slices.length >= 2, true, 'B4 确实跨页')
  for (let i = 1; i < slices.length; i++) {
    const prev = slices[i - 1].paras?.[0]?.lines
    const cur = slices[i].paras?.[0]?.lines
    if (prev?.length && cur?.length) eq(cur[0]!.s, prev[prev.length - 1]!.e, `B4 页 ${i} 区间衔接`)
  }
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

registerSmokeMode('x15', () => {
  ;(window as any).__smoke.x15 = { result }
  return () => h('div', { style: 'width:100%;height:100%' }, 'x15 line-geom sp/xl probe')
})
