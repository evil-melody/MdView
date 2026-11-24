/**
 * x16 探针（路线图 P4b 行宽残余量化，?mode=x16）：三方度量比对 ——
 *   raw   = 逐码点 advance 裸加（当前 snapOf 测量链，无 kern/liga）
 *   shaped = shapeText 字簇宽合计（HB kern+liga+clig，内核已有能力）
 *   dom    = 浏览器实渲宽（CarlitoProbe webfont，默认 kern+liga+calt）
 *
 * 目的：量化「布局内核 vs 渲染浏览器」的行宽差，为 P4b 路由提供数据。
 * 三方语义：
 *   raw    = Σ 单码 advance（当前 snapOf 测量链 flow.ts:132）
 *   shaped = shapeText 字簇合计（内核 HB：kern+liga+clig，wasm.ts:470）
 *   dom    = 浏览器实渲（默认 kern+liga+calt 全开）
 *   domNoFeat = 浏览器关四特征（≈ raw 的旁证，验测量台本身）
 * 路由未定：sdkjs 段落走 HB_ShapeString(features=oTextPr.Ligatures，默认 None)，
 * 其掩码在 wasm 内如何翻译（0=HB 默认全开 vs 字面只开列出项）未经证实 —— 故本探针
 * 只出数据 + 锁结构确定项，不预设「shaped 即权威」。数据回来再定 snapOf 改法。
 *
 * 断言只锁**确定项**（结构 / 空串 / liga 合并 / kern 非零 / domNoFeat≈raw）。
 * 顶层只注册 mode；结果挂 window.__smoke.x16。
 */
import { h } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import { defaultRegistry } from './core/font/measure'
import { GRAPHEME_COEF, MEASURE_FONTSIZE } from './core/font/wasm'
import { buildFlowBlocks, type FlowEnv } from './view/docx/flow'
import type { PageSetup, Paragraph } from './core/docx/types'

const TARGET_PT = 11
const PT2PX = 96 / 72

/** shaped 宽 → pt@target（镜像 widthPt，但恒走字簇合计，不回退 raw） */
function shapedPt(gs: { widthMmPerPt: number }[], target: number): number {
  let mm = 0
  for (const g of gs) mm += g.widthMmPerPt
  return (mm / GRAPHEME_COEF / 64) * (target / MEASURE_FONTSIZE)
}

interface Row {
  text: string
  cps: number
  clusters: number
  raw: number
  shaped: number
  dom: number
  domNoFeat: number
  dRawShaped: number
  dShapedDom: number
}

async function measureDom(span: HTMLElement, text: string): Promise<{ dom: number; domNoFeat: number }> {
  span.textContent = text
  span.style.fontFeatureSettings = ''
  const dom = span.getBoundingClientRect().width / PT2PX
  span.style.fontFeatureSettings = "'kern' 0, 'liga' 0, 'clig' 0, 'calt' 0"
  const domNoFeat = span.getBoundingClientRect().width / PT2PX
  span.style.fontFeatureSettings = ''
  return { dom, domNoFeat }
}

async function e2e(R: Record<string, unknown>, errs: string[]) {
  const reg = await defaultRegistry()
  const m = await reg.get('Carlito', 'word', {})

  // 注册与内核**同源字节**的 webfont，保证浏览器量的是同一份 TTF
  const buf = await (await fetch('/fonts/Carlito-Regular.ttf')).arrayBuffer()
  const face = new FontFace('CarlitoProbe', buf)
  await face.load()
  ;(document.fonts as any).add(face)
  await (document.fonts as any).load('11pt CarlitoProbe')
  await (document.fonts as any).ready

  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;'
  const span = document.createElement('span')
  span.style.cssText = "font-family:'CarlitoProbe';font-size:11pt;white-space:pre;display:inline-block;"
  host.appendChild(span)
  document.body.appendChild(host)

  const cases = ['AV', 'AW', 'AY', 'Ao', 'To', 'Wa', 'fi', 'fl', 'ff', 'ffi', 'office', 'Hello World', 'a b c d', '(test)', '你好世界', '文字test123']
  const table: Row[] = []
  for (const text of cases) {
    const cps = [...text]
    const gs = m.graphemes(text)
    let raw = 0
    for (const c of cps) raw += m.advance(c.codePointAt(0)!, TARGET_PT)
    const shaped = shapedPt(gs, TARGET_PT)
    const { dom, domNoFeat } = await measureDom(span, text)
    table.push({
      text, cps: cps.length, clusters: gs.length,
      raw: +raw.toFixed(4), shaped: +shaped.toFixed(4), dom: +dom.toFixed(4), domNoFeat: +domNoFeat.toFixed(4),
      dRawShaped: +(shaped - raw).toFixed(4), dShapedDom: +(dom - shaped).toFixed(4),
    })
  }
  document.body.removeChild(host)
  R.table = table

  // ── 确定项断言 ──
  const eq = (a: unknown, b: unknown, msg: string) => {
    if (a !== b) errs.push(`${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
  eq(m.graphemes('').length, 0, '空串零字簇')
  eq(shapedPt(m.graphemes(''), TARGET_PT), 0, '空串 shaped=0')
  // Carlito 含标准连字：'fi' 应合并为 1 字簇（若否，内核 liga 未生效 → 路由需重估）
  const fi = table.find((r) => r.text === 'fi')!
  eq(fi.clusters, 1, "'fi' 连字合并 1 字簇")
  eq(m.graphemes('ffi').length <= 2, true, "'ffi' 至多 2 字簇")
  // kern 对：shaped 应 ≠ raw（HB kern 改 x_advance 不改 cluster 数）
  const av = table.find((r) => r.text === 'AV')!
  eq(av.clusters, 2, "'AV' 两字簇（kern 不合并）")
  if (Math.abs(av.dRawShaped) < 1e-6) errs.push(`'AV' kern 未生效: raw==shaped==${av.raw}`)
  // 测量台自检：关特征后的浏览器宽应贴近内核 raw（同源 TTF + 同字号 → Σ advance 同量级）。
  // hinting/亚像素允许零点几 pt 漂移，故只记录最大漂移；>2pt 才判口径崩（webfont/字号错）。
  let maxBench = 0
  for (const r of table) {
    // CJK 行排除：Carlito 无汉字表 → 内核按缺字宽量，浏览器回退系统字体 → 不同量，非测量台问题
    if ([...r.text].some((c) => c.codePointAt(0)! >= 0x2e80)) continue
    maxBench = Math.max(maxBench, Math.abs(r.domNoFeat - r.raw))
  }
  R.benchMaxDrift = +maxBench.toFixed(4)
  if (maxBench > 2) errs.push(`bench drift too large: ${maxBench.toFixed(3)}pt (harness broken)`)
  // 路由判据（数据入 R，不硬断）：shaped 是否比 raw 更接近 dom（仅拉丁行）
  const latin = table.filter((r) => ![...r.text].some((c) => c.codePointAt(0)! >= 0x2e80))
  const closer = latin.filter((r) => Math.abs(r.dShapedDom) < Math.abs(r.dom - r.raw)).length
  R.shapedCloserThanRaw = `${closer}/${latin.length}`

  // ── 端到端：snapOf 改走 shaped 后，内核行宽须 ≈ dom（残余归零），而非 raw ──
  // 'To' 是最大 kern 对（raw 偏 dom -0.978pt）；单段单行，行宽 = 可见宽 = 内核度量。
  const page: PageSetup = { w: 400, h: 400, mt: 0, mr: 0, mb: 0, ml: 0, header: 0, footer: 0 }
  const env: FlowEnv = { page, font: 'Carlito', sz: TARGET_PT, lastKind: 'nextPage' }
  const para = { t: 'p', ps: {}, runs: [{ t: 'text', text: 'To', s: {} }] } as unknown as Paragraph
  const [fb] = await buildFlowBlocks([para], env)
  const lineW = fb!.detail![0]!.w
  const to = table.find((r) => r.text === 'To')!
  R.e2eToLine = { line: +lineW.toFixed(4), shaped: to.shaped, raw: to.raw, dom: to.dom }
  // 行宽须贴 shaped/dom（±0.05pt），须显著异于 raw（否则 snapOf 未真消费 shaped）
  if (Math.abs(lineW - to.shaped) > 0.05) errs.push(`e2e 'To' 行宽未走 shaped: line=${lineW.toFixed(4)} shaped=${to.shaped}`)
  if (Math.abs(lineW - to.raw) < 0.2) errs.push(`e2e 'To' 行宽仍 ≈ raw（shaping 未生效）: line=${lineW.toFixed(4)} raw=${to.raw}`)

  // ── CJK 全角校正：内核行宽须 ≈ dom（±0.5pt，系统回退字体与 1em 的微差容差）──
  // 修复前内核 22.3pt（HB .notdef 半角框）vs dom 44pt —— 行宽低估一半，中文断行全错。
  // 参照取 shaped 列（纯 HB 字簇宽，不经 JS 层校正）——行宽须显著异于它才算生效。
  const cjk = table.find((r) => r.text === '你好世界')!
  const paraCjk = { t: 'p', ps: {}, runs: [{ t: 'text', text: '你好世界', s: {} }] } as unknown as Paragraph
  const [fbCjk] = await buildFlowBlocks([paraCjk], env)
  const cjkW = fbCjk!.detail![0]!.w
  R.e2eCjkLine = { line: +cjkW.toFixed(4), dom: cjk.dom, hbUncorrected: cjk.shaped }
  if (Math.abs(cjkW - cjk.dom) > 0.5) errs.push(`e2e CJK 行宽未对齐 dom: line=${cjkW.toFixed(4)} dom=${cjk.dom}`)
  if (Math.abs(cjkW - cjk.shaped) < 0.5) errs.push(`e2e CJK 行宽仍 ≈ HB 半角框（全角校正未生效）: line=${cjkW.toFixed(4)}`)
}

function probe() {
  const R: Record<string, unknown> = { ok: false, errors: [] as string[], table: null }
  const errs = R.errors as string[]
  return { R, errs }
}

let cached: Promise<Record<string, unknown>> | null = null
function result() {
  if (!cached) {
    const { R, errs } = probe()
    cached = e2e(R, errs)
      .catch((e) => errs.push(`e2e threw: ${e}`))
      .then(() => {
        R.ok = errs.length === 0
        return R
      })
  }
  return cached
}

registerSmokeMode('x16', () => {
  ;(window as any).__smoke.x16 = { result }
  return () => h('div', { style: 'width:100%;height:100%' }, 'x16 width-residual quantification probe')
})
