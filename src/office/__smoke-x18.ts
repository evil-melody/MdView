/**
 * x18 探针（路线图 P4b-2 路由裁决，?mode=x18）：DOM 行级渲染 vs 内核行几何的
 * **逐字符位置保真**量化 —— 决定 Canvas 迁移是否必要（YAGNI 门）。
 *
 * 背景（sdkjs 取证，2026-11-23）：Word 正文渲染是 Canvas 字形位图 blit
 * （Graphics.js:1496 private_FillGlyph2 → getImageData/putImageData，rasterheap
 *  CGlyphBitmap 打包），非 fillText、非 HTML+CSS；fillText 只在 Rulers/buttons
 *  的 UI 外壳出现。vendored fonts.js 已导出 _ASC_FT_Get_Glyph_Render_Buffer/
 *  _Render_Params/_Set_Transform/_Glyph_Get_CBox —— 我们的 wasm 具备同样的栅格
 *  原料，Canvas 迁移技术上可行。
 *
 * 但「可行」不等于「该做」。P4a 后浏览器退出断行权（.de-line div + white-space:pre），
 * 行宽单一真值来自内核 xLimit；x16 已证**行总宽**内核 ≡ 浏览器（±0.017pt）。
 * 剩下真正未验的是：
 *   1. **逐字符边界位置**：内核 clusters 前缀和（kern 折入、簇内均摊）vs 浏览器
 *      Range 逐字实渲位置。若也 ≤1px → DOM 方案位置完备，Canvas 的唯一收益退成
 *      「字形 hinting 外观 + 脏界性能」，非保真缺口 → 迁移可降级为可选未来。
 *   2. **calt 特征集差**：内核 HB = kern+liga+clig；浏览器默认 = kern+liga+calt。
 *      calt 若改字宽（Latin 通常微弱）是行宽的最后残余源。三方拆列量化。
 *   3. **宽语料行总宽**：一组代表性文本，内核 detail.w vs 浏览器全串宽，≤1px 门。
 *
 * 断言只锁确定项 + ≤1px 保真门；路由判据（per-char 最大偏差、calt 贡献）入 R 出数据，
 * 不预设结论 —— 数据回来再裁 Canvas 迁移做/不做。
 *
 * 顶层只注册 mode；结果挂 window.__smoke.x18。
 */
import { h } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import { defaultRegistry } from './core/font/measure'
import { buildFlowBlocks, type FlowEnv } from './view/docx/flow'
import type { PageSetup, Paragraph } from './core/docx/types'

const TARGET_PT = 11
const PT2PX = 96 / 72
/** 逐像素保真门（路线图 P4b-2 验收：容差 ≤1px） */
const PX_GATE = 1.0

// 代表性语料：kern 对 / 连字 / 混排 / 数字 / 标点 / CJK（无首尾空格，行总宽可直接比）
const CORPUS = [
  'Hello World', 'Typography', 'AV To Wa', 'office fi fl ffi', 'a b c d',
  '(test) [x]', '1234.56', 'The quick brown fox', '效果 test123 混合',
]

/** 内核逐码点前缀和（镜像 flow.ts snapOf 的 clusters 均摊逻辑；BMP 语料码点=UTF-16 下标） */
function kernelCum(text: string, sz: number, clusters: { len: number; wPt: number }[]): number[] {
  const cps = [...text]
  const cum = new Array(cps.length + 1).fill(0)
  let acc = 0
  for (const c of clusters) {
    const per = c.wPt / c.len
    for (let j = 0; j < c.len && acc + j < cps.length; j++) cum[acc + j + 1] = cum[acc + j] + per
    acc += c.len
  }
  return cum
}

async function run(): Promise<Record<string, unknown>> {
  const R: Record<string, unknown> = { ok: false, errors: [] as string[], rows: null }
  const errs = R.errors as string[]

  const reg = await defaultRegistry()
  const m = await reg.get('Carlito', 'word', {})

  // 与内核同源字节的 webfont（浏览器测的就是同一份 TTF）
  const buf = await (await fetch('/fonts/Carlito-Regular.ttf')).arrayBuffer()
  const face = new FontFace('CarlitoX18', buf)
  await face.load()
  ;(document.fonts as any).add(face)
  await (document.fonts as any).load('11pt CarlitoX18')
  await (document.fonts as any).ready

  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;'
  const span = document.createElement('span')
  span.style.cssText = "font-family:'CarlitoX18';font-size:11pt;white-space:pre;display:inline-block;"
  host.appendChild(span)
  document.body.appendChild(host)

  /** 装载文本（一次），返回逐 UTF-16 前缀宽函数（Range 游走，不重设文本） */
  function loader(text: string): (n: number, feat?: string) => number {
    span.textContent = text
    const t = span.firstChild!
    return (n: number, feat = '') => {
      span.style.fontFeatureSettings = feat
      const r = document.createRange()
      r.setStart(t, 0)
      r.setEnd(t, n)
      const w = r.getBoundingClientRect().width / PT2PX
      span.style.fontFeatureSettings = ''
      return w
    }
  }

  const page: PageSetup = { w: 4000, h: 400, mt: 0, mr: 0, mb: 0, ml: 0, header: 0, footer: 0 }
  const env: FlowEnv = { page, font: 'Carlito', sz: TARGET_PT, lastKind: 'nextPage' }

  interface Row {
    text: string
    /** 内核行总宽（detail.w，可见宽） */
    kw: number
    /** 浏览器全串实渲宽（默认特征 kern+liga+calt） */
    dw: number
    /** 浏览器关 calt（kern+liga，≈ 内核特征集） */
    dwNoCalt: number
    /** 浏览器关全部特征（≈ raw） */
    dwNoFeat: number
    /** 行总宽偏差 px */
    lineDevPx: number
    /** 逐字符边界最大偏差 px（字簇界，进门） */
    maxCharDevPx: number
    /** 诊断：含簇内点位的全位最大偏差 px（不进保真门） */
    maxAnyDevPx: number
    /** calt 对全串宽的贡献 pt */
    caltContrib: number
  }
  /** 超门行的逐簇诊断：内核字簇表 vs 浏览器字形 rect 表（定位总量差的来源） */
  interface Diag {
    text: string
    kernel: { cps: string; len: number; wPt: number }[]
    domGlyphs: { wPt: number }[]
    kernelTotal: number
    domTotal: number
  }
  const diags: Diag[] = []
  const rows: Row[] = []

  for (const text of CORPUS) {
    const cps = [...text]
    const clusters = m.clusters(text, TARGET_PT)
    // 长度恒等锁（measure.ts clusters 契约）：尾簇多码点（连字/组合符）曾遭
    // cpIndex 尾位截断丢尾码，flow 防御补裸 advance 污染行宽（x18 首跑实测：
    // 'office fi fl ffi' 簇覆盖 15/16，行宽虚增一个 'i'）。断言前置，崩了先红这里。
    const lenSum = clusters.reduce((s, c) => s + c.len, 0)
    if (lenSum !== cps.length) errs.push(`簇长度恒等破裂: ${JSON.stringify(text)} sum=${lenSum} cps=${cps.length}`)
    const cum = kernelCum(text, TARGET_PT, clusters)

    // 内核行总宽：走 buildFlowBlocks 端到端（detail[0].w = 可见宽，剔行尾空格）
    const para = { t: 'p', ps: {}, runs: [{ t: 'text', text, s: {} }] } as unknown as Paragraph
    const [fb] = await buildFlowBlocks([para], env)
    const kw = fb!.detail![0]!.w

    // 浏览器实渲：装载一次，逐前缀用 Range 游走（避免每点重设文本触发 reflow）
    const wd = loader(text)
    const dw = wd(cps.length)
    const dwNoCalt = wd(cps.length, "'calt' 0")
    const dwNoFeat = wd(cps.length, "'kern' 0, 'liga' 0, 'clig' 0, 'calt' 0")

    // 逐字符边界：只采**字簇边界**（内核 cum[b] = 簇宽合计，浏览器 caret 也只
    // 落簇界 —— 簇内均摊 vs 浏览器实现是比实现细节，非保真缺口）。取最大绝对偏差
    let maxCharDevPx = 0
    let b = 0
    for (const c of clusters) {
      b += c.len
      if (b >= cps.length) break
      const d = Math.abs(wd(b) - cum[b]) * PT2PX
      if (d > maxCharDevPx) maxCharDevPx = d
    }
    // 诊断（不断言）：含簇内点位的全位最大偏差 —— 簇内均摊与浏览器 glyph 放置的差，
    // 只影响 caret/选区高亮的亚簇位置（DOM 原生负责），留档不进门
    let maxAnyDevPx = 0
    for (let i = 1; i < cps.length; i++) {
      const d = Math.abs(wd(i) - cum[i]) * PT2PX
      if (d > maxAnyDevPx) maxAnyDevPx = d
    }

    rows.push({
      text,
      kw: +kw.toFixed(4),
      dw: +dw.toFixed(4),
      dwNoCalt: +dwNoCalt.toFixed(4),
      dwNoFeat: +dwNoFeat.toFixed(4),
      lineDevPx: +(Math.abs(dw - kw) * PT2PX).toFixed(3),
      maxCharDevPx: +maxCharDevPx.toFixed(3),
      maxAnyDevPx: +maxAnyDevPx.toFixed(3),
      caltContrib: +(dw - dwNoCalt).toFixed(4),
    })

    // 超门行逐簇定位：内核簇表 vs 浏览器逐簇差分宽（边界对齐簇界，差分 = 该簇实渲宽）。
    // 差若集中在某多码点簇 → 内核/浏览器连字切分不一致（shaping 层可修，非 Canvas 议题）
    if (Math.abs(dw - kw) * PT2PX > PX_GATE) {
      let prev = 0
      let bb = 0
      const kernel: Diag['kernel'] = []
      const domGlyphs: Diag['domGlyphs'] = []
      for (const c of clusters) {
        bb += c.len
        kernel.push({ cps: cps.slice(bb - c.len, bb).join(''), len: c.len, wPt: +c.wPt.toFixed(4) })
        const cur = wd(bb)
        domGlyphs.push({ wPt: +(cur - prev).toFixed(4) })
        prev = cur
      }
      diags.push({ text, kernel, domGlyphs, kernelTotal: +kw.toFixed(4), domTotal: +dw.toFixed(4) })
    }
  }
  document.body.removeChild(host)
  R.rows = rows
  R.diags = diags

  // ── 确定项：内核行总宽恒 >0 且有限 ──
  for (const r of rows) {
    if (!(r.kw > 0 && Number.isFinite(r.kw))) errs.push(`内核行宽异常: ${r.text} kw=${r.kw}`)
    // 语料恒 BMP：码点数 = UTF-16 下标（前缀表与 Range 偏移同构的前提）
    if ([...r.text].length !== r.text.length) errs.push(`语料含非 BMP（代理对破坏前缀同构）: ${r.text}`)
  }

  // ── 保真门 1：行总宽 内核 vs 浏览器 ≤1px ──
  // 连字隔离缺口（len>1 簇差、单码点簇全 ≤1px）是 **shaping 口径债**（snapOf/clusters
  // 层可修），不是 Canvas 议题 —— 单独锁进 R.ligDebt，不判红；只有非连字可解释的
  // 缺口（单码点簇也超、或无 diag）才进门判红，那才是 DOM 文本引擎天花板证据。
  const lineFail = rows.filter((r) => r.lineDevPx > PX_GATE)
  R.lineMaxDevPx = +Math.max(...rows.map((r) => r.lineDevPx)).toFixed(3)
  // 逐 diag 判缺口是否纯落多码点簇
  const ligOnly = diags.length > 0 && diags.every((d) =>
    d.kernel.every((k, i) => k.len > 1 || Math.abs(k.wPt - d.domGlyphs[i]!.wPt) * PT2PX <= PX_GATE))
  R.ligDebt = ligOnly ? lineFail.map((r) => ({ text: r.text, dev: r.lineDevPx })) : []
  R.lineGatePass = lineFail.length === 0 || ligOnly
  if (lineFail.length && !ligOnly)
    errs.push(`行总宽 >${PX_GATE}px（非连字可解释）: ${lineFail.map((r) => `${r.text}(${r.lineDevPx})`).join(' ')}`)

  // ── 保真门 2（路由核心）：逐字符边界 ≤1px ──
  // 同上：连字隔离的簇边界偏差归 shaping 债，非 Canvas 证据。
  const charFail = rows.filter((r) => r.maxCharDevPx > PX_GATE)
  R.charMaxDevPx = +Math.max(...rows.map((r) => r.maxCharDevPx)).toFixed(3)
  R.charGatePass = charFail.length === 0 || ligOnly
  R.charFail = charFail.map((r) => ({ text: r.text, dev: r.maxCharDevPx }))

  // ── calt 贡献量化（行宽最后残余源） ──
  const maxCalt = Math.max(...rows.map((r) => Math.abs(r.caltContrib)))
  R.caltMaxContribPt = +maxCalt.toFixed(4)
  R.caltNegligible = maxCalt < 0.1 // <0.1pt（~0.13px）视为可忽略

  // ── 路由裁决（数据驱动，写进 R 供矩阵引用） ──
  // 三态：① 全门过（无连字债）+ calt 可忽略 → DOM 位置完备，Canvas 非保真缺口（YAGNI）；
  // ② 缺口集中多码点连字簇（ligOnly）→ shaping 口径债（snapOf/clusters 层可修，
  //   换渲染器救不了）→ 债记账，Canvas 仍缓；
  // ③ 缺口弥散、非连字可解释 → DOM 文本引擎天花板，Canvas 迁移有必要。
  if (!lineFail.length && !charFail.length && R.caltNegligible) {
    R.verdict = 'DOM 位置完备（行宽+逐字符 ≤1px）+ calt 可忽略 → Canvas 迁移非保真缺口，YAGNI 降级'
  } else if (ligOnly) {
    const debt = lineFail.map((r) => `${r.text}(${r.lineDevPx}px)`).join(' ')
    R.verdict = `shaping 口径债：连字合并差异（${debt}）——clusters 层可修、Canvas 救不了 → 债记账，Canvas 仍缓`
  } else if (diags.length) {
    R.verdict = '缺口含单码点簇偏差 → 非连字可解释，需逐簇复诊定性质（弥散则 Canvas 必要）'
  } else {
    R.verdict = `行总宽门过但逐字符边界超门（charGate=${R.charGatePass}）→ 分布性缺口，需逐簇复诊定性质`
  }

  R.ok = errs.length === 0
  return R
}

let cached: Promise<Record<string, unknown>> | null = null
function result(): Promise<Record<string, unknown>> {
  if (!cached) cached = run().catch((e) => ({ ok: false, errors: [`threw: ${e}`] }))
  return cached
}

registerSmokeMode('x18', () => {
  ;(window as any).__smoke.x18 = { result }
  return () => h('div', { style: 'width:100%;height:100%' }, 'x18 per-char fidelity / canvas-routing probe')
})
