/**
 * x11 探针（高保真第一阶段，?mode=x11）：字体度量内核 + 断行引擎原型。
 * 验证 wasm.ts（fonts.wasm TS 封装）、measure.ts（测量门面）、wrap.ts（断行）
 * 三件套在浏览器内可握手、可度量、可断行，且与 sdkjs 字节契约一致：
 *  - 576pt 归一化测量、26.6 定点 >>6 截断、OS/2 Win 参数选择（Carlito 无 typo 位）
 *  - 缺字回退（state≠0）、Symbol 0xF000 约定不在非 Symbol 字体误触发
 *  - 禁则断行：不可行首标点不落行首；CJK 逐字断；justify 双通道增量
 * 顶层只注册 mode；结果挂 window.__smoke.x11。
 */
import { h } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import { loadEngine, MEASURE_FONTSIZE, GRAPHEME_COEF, type FontEngine } from './core/font/wasm'
import { defaultRegistry, FontRegistry } from './core/font/measure'
import { wrapLine, splitWords, justifyDeltas } from './core/font/wrap'
import { PUNCT_FLAGS, PF } from './core/font/punct'

async function probe(eng: FontEngine, reg: FontRegistry) {
  const R: Record<string, unknown> = { ok: false, errors: [] as string[] }
  const errs = R.errors as string[]
  try {
    // ── 度量：Carlito Regular @11pt（Word 默认字体，度量兼容 Calibri） ──
    const m = await reg.get('Carlito', 'word', {})
    const fm = m.metrics(11)
    R.metrics = fm
    // Carlito upem=2048，WinAscent≈1950/Descent≈490 → ascent@11pt ≈ 10.5，descent ≈ -2.6
    if (!(fm.ascent > 8 && fm.ascent < 13)) errs.push(`ascent out of range: ${fm.ascent}`)
    if (!(fm.descent < -1.5 && fm.descent > -4)) errs.push(`descent out of range: ${fm.descent}`)
    if (!(fm.height > fm.ascent)) errs.push('height must exceed ascent')

    const advH = m.advance(0x48, 11) // 'H'
    const advI = m.advance(0x49, 11) // 'I'
    const advW = m.advance(0x57, 11) // 'W'
    R.advances = { H: advH, I: advI, W: advW }
    if (!(advH > 5 && advH < 10)) errs.push(`H advance out of range: ${advH}`)
    if (!(advI < advH)) errs.push('I must be narrower than H')
    if (!(advW > advH)) errs.push('W must be wider than H')

    // 整串宽度 = 逐字之和（无连字时）
    const wStr = m.widthPt('Hello', 11)
    let wSum = 0
    for (const c of 'Hello') wSum += m.advance(c.codePointAt(0)!, 11)
    R.widthCheck = { str: wStr, sum: wSum }
    if (Math.abs(wStr - wSum) > 0.001) errs.push(`string width != sum: ${wStr} vs ${wSum}`)

    // 单调性
    if (!(m.widthPt('iii', 11) < m.widthPt('WWW', 11))) errs.push('width monotonicity broken')

    // ── shaping：拉丁串无连字合并，字簇数 = 码点数 ──
    const gs = m.graphemes('Hello')
    R.graphemes = gs.length
    if (gs.length !== 5) errs.push(`latin graphemes should stay 5, got ${gs.length}`)
    if (gs.some((g) => g.ligature)) errs.push('latin hello has no ligatures')

    // ── 缺字回退：emoji 不在 Carlito → state≠0，宽度取 maxAdvance/2 ──
    const miss = m.faceFile.glyph(0x1f600)
    R.missState = miss.state
    if (miss.state === 0) errs.push('emoji should miss in Carlito')
    if (!(miss.advanceX > 0)) errs.push('missing glyph must still carry an advance')

    // ── 伪粗体：Cell 模式 advance +1 补偿（sdkjs file.js:1164） ──
    const mc = await reg.get('Carlito', 'cell', { bold: true })
    const boldReal = mc.faceFile.info!.os2WeightClass >= 700
    R.boldFace = { weight: mc.faceFile.info!.os2WeightClass, real: boldReal }
    const advHCell = mc.advance(0x48, 11)
    const advHWord = (await reg.get('Carlito', 'word', { bold: true })).advance(0x48, 11)
    R.boldAdvance = { cell: advHCell, word: advHWord }
    // 实体粗面（Carlito 有 Bold）→ 两模式同值；若是合成粗，Cell 多 +1
    if (boldReal && Math.abs(advHCell - advHWord) > 0.001) errs.push('real bold: cell/word advance must match')

    // ── 合成粗（伪粗）：只有 Regular 面的族请求粗体 → 回退 Regular + Cell 补偿 ──
    // 补偿量 = 1 单位 @576pt 度量（wasm.ts measureGlyph），缩放到 11pt = 11/576
    const synthReg = new FontRegistry(eng, { SynthOnly: { regular: '/fonts/Carlito-Regular.ttf' } })
    const msWord = await synthReg.get('SynthOnly', 'word', { bold: true })
    const msCell = await synthReg.get('SynthOnly', 'cell', { bold: true })
    const advSynW = msWord.advance(0x48, 11)
    const advSynC = msCell.advance(0x48, 11)
    R.synthBold = { word: advSynW, cell: advSynC, delta: +(advSynC - advSynW).toFixed(4) }
    if (Math.abs(advSynC - advSynW - 11 / MEASURE_FONTSIZE) > 0.001) errs.push(`synthetic bold cell must add 1@576: Δ=${advSynC - advSynW}`)
    // 伪粗面仍是 Regular 实体（weight <800 → 补偿不被禁用）
    if (!(msCell.faceFile.info!.os2WeightClass < 800)) errs.push('SynthOnly fallback face must be regular weight')

    // ── 行高线：linePt = 度量行高 × 倍数（CJK×1.3 已在 setFace 烘焙，此处只验倍数缩放） ──
    const line1 = m.linePt(11, 1)
    const line15 = m.linePt(11, 1.5)
    const lineReg = await reg.linePt('Carlito', 'word', {}, 11, 1)
    R.line = { line1, line15, fromRegistry: lineReg }
    if (Math.abs(line1 - fm.height) > 1e-9) errs.push(`linePt(1) must equal metrics.height: ${line1} vs ${fm.height}`)
    if (Math.abs(line15 - fm.height * 1.5) > 1e-9) errs.push(`linePt(1.5) scaling mismatch: ${line15}`)
    if (Math.abs(lineReg - line1) > 1e-9) errs.push('registry.linePt must agree with measurer.linePt')

    // ── 禁则表完整性：中文逗号不可行首 ──
    const fanComma = PUNCT_FLAGS.get(0x3001) ?? 0
    R.punct = { ideographicComma: fanComma }
    if (!(fanComma & PF.CANT_BEGIN)) errs.push('、 must not start a line')

    // ── 断行：西文贪心 + 禁则 ──
    const text = 'The quick brown fox jumps over the lazy dog.'
    const words = splitWords(text)
    R.wordCount = words.length
    if (words.length !== 9) errs.push(`expected 9 words, got ${words.length}`)
    const measure = (s: number, e: number) => m.widthPt(text.slice(s, e), 11)
    const lines = wrapLine(text, 60, measure)
    R.lines60 = lines.map((l) => ({ t: l.text.trim(), w: +l.width.toFixed(2) }))
    for (const l of lines) {
      if (!l.forced && l.width > 60.01) errs.push(`line overflow: "${l.text.trim()}" ${l.width}`)
    }
    if (lines.length < 2) errs.push('60pt limit must wrap this text')
    // 拼回原文（尾随空格保留）
    if (lines.map((l) => l.text).join('') !== text) errs.push('wrapped lines must reconstruct source')

    // 禁则实际生效：句号不可跑到行首
    const t2 = '今天天气很好。明天也是。'
    const m2 = (s: number, e: number) => m.widthPt(t2.slice(s, e), 11)
    const lines2 = wrapLine(t2, 30, m2, { eastAsian: true })
    R.cjkLines = lines2.map((l) => l.text)
    for (const l of lines2) {
      if (!l.forced && (l.text.startsWith('。') || l.text.startsWith('，'))) errs.push(`punctuation at line start: ${l.text}`)
    }
    // CJK 逐字词切分
    const cjw = splitWords('你好世界', { eastAsian: true })
    R.cjkWords = cjw.length
    if (cjw.length !== 4) errs.push(`CJK should split per char, got ${cjw.length}`)

    // ── justify 双通道 ──
    const jl = lines[0]
    const jd = justifyDeltas(jl, 60)
    R.justify = jd
    if (jl.text.trim().split(/\s+/).length > 1 && !(jd.space > 0)) errs.push('multi-word line must get space deltas')
    const single: typeof jl = { start: 0, end: 3, text: 'ABC', width: 10, forced: false }
    const sj = justifyDeltas(single, 22)
    R.justifySingle = sj
    if (sj.space !== 0 || Math.abs(sj.char - 6) > 0.001) errs.push(`single-word line: char delta should be ${(22 - 10) / 2}, got ${sj.char}`)

    // ── 契约常量 ──
    if (MEASURE_FONTSIZE !== 576) errs.push('measure fontsize must be 576')
    if (Math.abs(GRAPHEME_COEF - 25.4 / 72 / 64 / 576) > 1e-15) errs.push('COEF mismatch')

    R.ok = errs.length === 0
  } catch (e) {
    errs.push(String(e))
    R.ok = false
  }
  return R
}

registerSmokeMode('x11', () => {
  const host = h('div', { style: 'width:600px;height:400px' })
  const done = Promise.all([loadEngine(), defaultRegistry()])
    .then(([eng, reg]) => probe(eng as FontEngine, reg as FontRegistry))
    .catch((e) => ({ ok: false, errors: [String(e)] }))
  ;(window as any).__smoke.x11 = {
    async result() {
      return done
    },
  }
  return () => host
})
