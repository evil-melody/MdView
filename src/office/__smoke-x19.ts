/**
 * x19 探针（路线图 P5 路由，?mode=x19）：Excel 列宽/行高的**内核度量口径**固化 ——
 * 把 sdkjs 的三段式列宽换算 + maxDigitWidth 量链 + 行高自适应公式做成数值断言，
 * 作为 P5 内核实现（colwidth.ts）的验收门。探针先行：先测出真相，再定内核断言。
 *
 * 取证来源（sdkjs release/v10.0.0，逐行核实）：
 *   - 三段式换算：Workbook.js:5147-5171
 *       charCountToModelColWidth(count,mdw,ppb) = floor((count*mdw+ppb)/mdw*256)/256   [count<=0→0]
 *       modelColWidthToColWidth(mcw,mdw)        = floor(((256*mcw+floor(128/mdw))/256)*mdw)
 *       colWidthToCharCount(w,mdw,ppb)          = w<mdw+ppb
 *                                         ? 1-floor(100*(mdw+ppb-w)/(mdw+ppb)+0.49999)/100
 *                                         : floor((w-ppb)/mdw*100+0.5)/100
 *   - MDW 量链：WorkbookView.js:4648-4671 —— 默认字体测 "0123456789"，逐字宽取 max
 *       （StringRender.js:223 FlushGrapheme: _width=asc_round(mmPerPt*size/25.4*ppi)；
 *        :634 getWidestCharWidth=charWidths.reduce(max)）；注释明文「Calibri 11 应为 7」。
 *       padding=max(ceil(mdw/4),2)；paddingPlusBorder=2*padding+1。
 *   - 默认列宽：WorksheetView.js:623-631 —— base=getBaseColWidth()(=nBaseColWidth||8)
 *       → charCountToModelColWidth → modelColWidthToColWidth → ceil(px/8)*8 → 回 chars。
 *   - 行高：StringRender.js:732-742 _calcLineMetrics（无上下标支）——
 *       _a=max(0,ceil(nat_y1*f/nat_scale))；_d=max(0,ceil(-nat_y2*f/nat_scale))+1（+1 边框）；
 *       line.th=_a+_d；tm.height=Σline.th（:815-877 _calcTextMetrics，TH 累加）。
 *       默认行高（:636-643）= min(409.5pt, getDefaultHeight()‖convertPxToPt(headersHeightByFont))；
 *       自适应（:10483-10489）= min(maxRowHpx, max(oldHpx, tm.height))，仅无 customHeight 且非跨行合并。
 *   - 取整三件套：utils.js:132-150（kLeftLim1 修二进制浮点精度）。
 *
 * 断言只锁确定项（三段式算术锚点、MDW=7、默认列宽 64px）；行高给三口径实测对比
 * （A=sdkjs _calcLineMetrics 直译 / B=整体 height+边框 / C=现启发式），数据入 R，
 * 内核实现时据实测收紧断言 —— 首版锁「A 落 [14,16] 合理带」+ 全链自洽回环。
 *
 * 第 5 节 named style 保真端到端：sdkjs 无 BasedOn 链（getCompiledStyle 只 merge
 * 表格样式→cellXfs→行/列 xf→条件格式），cellStyleXfs/cellStyles 仅是名字标签——
 * 保真定义 = 定义解析+写回不丢。fixture（cellStyleXfs/cellStyles/dxfs/自定义 numFmt
 * + width=8.43 列）→ Engine open/load → 尺寸与显示断言 → set+format → save → 重开
 * → XML 透传断言 + 数据回环断言。
 *
 * 顶层只注册 mode；结果挂 window.__smoke.x19。
 */
import { h } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import { defaultRegistry } from './core/font/measure'
import { Engine } from './core/worker/engine'
import { writeZip } from './core/zipwrite'
import { ZipArchive } from './core/zip'
import { BufferSource } from './core/source'

const PT2PX = 96 / 72
const K_LEFT_LIM1 = 0.999999999999999

/** utils.js:138-143 Asc.floor（int32 截断 + 负数补 + 二进制精度修正） */
function ascFloor(x: number): number {
  let y = x | 0
  y -= x < 0 && y > x ? 1 : 0
  return y + (x - y > K_LEFT_LIM1 ? 1 : 0)
}
/** utils.js:145-150 Asc.ceil */
function ascCeil(x: number): number {
  let y = x | 0
  y += x > 0 && y < x ? 1 : 0
  return y - (y - x > K_LEFT_LIM1 ? 1 : 0)
}
/** utils.js:132-136 Asc.round（四舍五入向零截断，非 Math.round 的 .5 上取） */
function ascRound(x: number): number {
  const y = x + (x >= 0 ? 0.5 : -0.5)
  return y | y
}

// ── 三段式换算镜像（Workbook.js:5147-5171，mdw/ppb 参数化） ──────────────
function charCountToModelColWidth(count: number, mdw: number, ppb: number): number {
  if (count <= 0) return 0
  return ascFloor(((count * mdw + ppb) / mdw) * 256) / 256
}
function modelColWidthToColWidth(mcw: number, mdw: number): number {
  return ascFloor(((256 * mcw + ascFloor(128 / mdw)) / 256) * mdw)
}
function colWidthToCharCount(w: number, mdw: number, ppb: number): number {
  const pxInOneChar = mdw + ppb
  return w < pxInOneChar
    ? 1 - ascFloor((100 * (pxInOneChar - w)) / pxInOneChar + 0.49999) / 100
    : ascFloor(((w - ppb) / mdw) * 100 + 0.5) / 100
}
/** WorkbookView.js:4668-4669 padding/paddingPlusBorder */
function paddingOf(mdw: number): { padding: number; ppb: number } {
  const padding = Math.max(ascCeil(mdw / 4), 2)
  return { padding, ppb: 2 * padding + 1 }
}

function near(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol
}

async function run(): Promise<Record<string, unknown>> {
  const R: Record<string, unknown> = { ok: false, errors: [] as string[] }
  const errs = R.errors as string[]

  // ── 1. MDW 实测（内核复现 sdkjs「Calibri 11 → 7」） ──
  // clusters("0123456789",11pt) 逐字符（无连字，len 恒 1）→ px = ascRound(wPt*4/3)，取 max。
  const reg = await defaultRegistry()
  const fm = await reg.get('Calibri', 'cell', {})
  const digits = '0123456789'
  const cl = fm.clusters(digits, 11)
  const cps = [...digits]
  // 长度恒等锁（measure.ts:114 契约）：数字串无连字，簇数=码点数=10
  const lenSum = cl.reduce((s, c) => s + c.len, 0)
  if (lenSum !== cps.length) errs.push(`MDW 簇长度恒等破裂: sum=${lenSum} cps=${cps.length}`)
  const digitWpx = cl.map((c) => ascRound(c.wPt * PT2PX))
  const mdw = Math.max(...digitWpx)
  R.digitWpx = digitWpx
  R.mdw = mdw
  // sdkjs 注释明文锚点：Calibri/Carlito 11 → MDW=7
  if (mdw !== 7) errs.push(`MDW 非 7（sdkjs WorkbookView.js:4661 锚点）: 实测=${mdw} 逐字=${digitWpx}`)

  const { padding, ppb } = paddingOf(mdw)
  R.padding = padding
  R.ppb = ppb
  // padding=max(ceil(7/4),2)=max(2,2)=2；ppb=2*2+1=5（锚点）
  if (padding !== 2 || ppb !== 5) errs.push(`padding/ppb 非 (2,5): padding=${padding} ppb=${ppb}`)

  // ── 2. 三段式算术锚点（纯数学，零依赖字体；逐式对 sdkjs 原文推演） ──
  // 8.43 chars → mcw → px == 64（Excel 默认列宽经典值）
  const mcw843 = charCountToModelColWidth(8.43, mdw, ppb)
  const px843 = modelColWidthToColWidth(mcw843, mdw)
  R.mcw_8_43 = mcw843
  R.px_8_43 = px843
  if (px843 !== 64) errs.push(`8.43chars→px 非 64: mcw=${mcw843} px=${px843}`)
  // 64px → chars 回环 == 8.43
  const cc64 = colWidthToCharCount(64, mdw, ppb)
  R.cc_64px = cc64
  if (!near(cc64, 8.43, 1e-9)) errs.push(`64px→chars 非 8.43: ${cc64}`)

  // 默认列宽 base=8：chars→px→ceil8→chars（WorksheetView.js:623-627）
  const baseChars = charCountToModelColWidth(8, mdw, ppb)
  let basePx = modelColWidthToColWidth(baseChars, mdw)
  basePx = ascCeil(basePx / 8) * 8
  const baseCharsBack = colWidthToCharCount(basePx, mdw, ppb)
  R.defaultCol_baseChars = baseChars
  R.defaultCol_px = basePx
  R.defaultCol_chars = baseCharsBack
  if (basePx !== 64) errs.push(`默认列宽 px 非 64: ${basePx}（base=8 路径）`)
  if (!near(baseCharsBack, 8.43, 1e-9)) errs.push(`默认列宽 chars 非 8.43: ${baseCharsBack}`)

  // 边界：count<=0 → 0；隐藏列 px 反算 < 1 字符走比例分支
  if (charCountToModelColWidth(0, mdw, ppb) !== 0) errs.push(`count=0 未归零`)
  if (charCountToModelColWidth(-3, mdw, ppb) !== 0) errs.push(`count<0 未归零`)
  // 12px（=mdw+ppb 边界）：w<12 走比例支，w==12 走常规支
  const cc11 = colWidthToCharCount(11, mdw, ppb) // 比例支：<1 字符
  const cc12 = colWidthToCharCount(12, mdw, ppb) // 常规支：=1 字符
  R.cc_11px = cc11
  R.cc_12px = cc12
  if (!(cc11 < 1)) errs.push(`11px 应 <1 字符: ${cc11}`)
  if (!near(cc12, 1, 1e-9)) errs.push(`12px 应 =1 字符: ${cc12}`)

  // ── 3. 行高口径实测（sdkjs 直译 = 唯一权威口径，逐式锚点断言） ──
  // Carlito upem=2048 winA=1950 winD=550（fontTools 实证；cell 模式 SetFace 无 CJK 位组，
  // hhea 2500 == winA-winD，替换与否同值）。11pt：a=ceil(1950*11/2048*4/3)=ceil(13.965)=14，
  // d=ceil(550*11/2048*4/3)+1=ceil(3.939)+1=5 → th=19（=14.25pt；sdkjs 测量口径如此，
  // 与 Excel 名义 15pt 差 1px —— 保真对象是 sdkjs 行为，非 Excel 名义值）。
  const lineThPx = (mm: { ascent: number; descent: number }): number =>
    Math.max(0, ascCeil(mm.ascent * PT2PX)) + Math.max(0, ascCeil(Math.abs(mm.descent) * PT2PX)) + 1
  const m11 = await fm.metrics(11)
  R.metrics11pt = { ascent: +m11.ascent.toFixed(4), descent: +m11.descent.toFixed(4), height: +m11.height.toFixed(4) }
  const th11 = lineThPx(m11)
  R.rowH11px = th11
  if (th11 !== 19) errs.push(`11pt 行高非 19px（锚点 a=14,d=4+1）: ${th11}`)
  // 14pt 锚点：a=ceil(1950*14/2048*4/3)=ceil(17.766)=18，d=ceil(550*14/2048*4/3)+1=ceil(5.013)+1=7 → 25。
  // 现启发式 14*(4/3)*1.3+3=26.87→27 —— 偏差 +2px：证伪「启发式≈度量式」，接线必要性锚。
  const m14 = await fm.metrics(14)
  const th14 = lineThPx(m14)
  const heur14 = Math.round(14 * (4 / 3) * 1.3 + 3)
  R.rowH14 = { metric: th14, heuristic: heur14 }
  if (th14 !== 25) errs.push(`14pt 行高非 25px（锚点 a=18,d=6+1）: ${th14}`)
  if (heur14 === th14) errs.push(`14pt 启发式未现偏差（预期 27 vs 25）: heur=${heur14}`)

  // ── 4. autoFit 内核口径（WorksheetView.js:19405-19427 简化：无合并/无旋转/非超行高） ──
  // 文本逐字 px 和 = tm.width；+pad(ppb) → colWidthToCharCount → clamp 255
  //   → charCountToModelColWidth → modelColWidthToColWidth = autoFit px。
  const CORPUS = ['Hello', '1234567890', 'Typography', 'Wider!', '效果mixed混合']
  const autoFit = CORPUS.map((text) => {
    const cs = fm.clusters(text, 11)
    // tm.width = Σ 逐字 ascRound(wPt*4/3)（FlushGrapheme 单码点支；连字簇按 len 摊）
    let tw = 0
    for (const c of cs) {
      const per = ascRound((c.wPt / c.len) * PT2PX)
      tw += per * c.len
    }
    const cc = Math.min(colWidthToCharCount(tw + ppb, mdw, ppb), 255)
    const mcw = charCountToModelColWidth(cc, mdw, ppb)
    const px = modelColWidthToColWidth(mcw, mdw)
    return { text, tmWidth: tw, chars: +cc.toFixed(4), px }
  })
  R.autoFit = autoFit
  // 自洽回环：autoFit px 反算 chars 应与 cc 一致（±1/100，量化步长）
  for (const a of autoFit) {
    const back = colWidthToCharCount(a.px, mdw, ppb)
    if (!near(back, a.chars, 0.011)) {
      errs.push(`autoFit 回环破裂 "${a.text}": px=${a.px} chars=${a.chars} back=${back.toFixed(4)}`)
    }
    if (a.px < 1) errs.push(`autoFit px 非法 "${a.text}": ${a.px}`)
  }

  // ── 5. named style 保真端到端（cellStyleXfs/cellStyles/dxfs 定义写回不丢） ──
  const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const PKGREL = 'http://schemas.openxmlformats.org/package/2006/relationships'
  const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  const stylesXml = `${DECL}<styleSheet xmlns="${XMAIN}">` +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.00\\%"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF006100"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFC6EFCE"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/></cellStyleXfs>' +
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="164" fontId="1" fillId="2" borderId="0" xfId="1" applyNumberFormat="1" applyFont="1" applyFill="1"/></cellXfs>' +
    '<cellStyles count="2"><cellStyle name="Good" xfId="1" builtinId="27"/><cellStyle name="MyStyle" xfId="0"/></cellStyles>' +
    '<dxfs count="1"><dxf><font><b/></font></dxf></dxfs></styleSheet>'
  const sheetXml = `${DECL}<worksheet xmlns="${XMAIN}"><sheetFormatPr defaultRowHeight="15"/>` +
    '<cols><col min="1" max="1" width="8.43" customWidth="1"/></cols>' +
    '<sheetData><row r="1"><c r="A1" s="1"><v>0.5</v></c><c r="B1" t="s"><v>0</v></c></row></sheetData></worksheet>'
  const sstXml = `${DECL}<sst xmlns="${XMAIN}" count="1" uniqueCount="1"><si><t>hello</t></si></sst>`
  const book = new Map<string, string>([
    ['[Content_Types].xml', `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`],
    ['_rels/.rels', `${DECL}<Relationships xmlns="${PKGREL}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${DECL}<workbook xmlns="${XMAIN}" xmlns:r="${RNS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${DECL}<Relationships xmlns="${PKGREL}"><Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${RNS}/styles" Target="styles.xml"/><Relationship Id="rId3" Type="${RNS}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`],
    ['xl/styles.xml', stylesXml],
    ['xl/worksheets/sheet1.xml', sheetXml],
    ['xl/sharedStrings.xml', sstXml],
  ])
  const ns: Record<string, unknown> = {}
  try {
    const blob = await writeZip(book as any)
    // 进度事件分别锁存：header（首个带 colInfo 的）与 done（终态，可能不带 header）
    let header: any = null
    let doneEv: any = null
    const engine = new Engine((ev: string, p: any) => {
      if (ev !== 'xlsx:progress') return
      if (!header && p.colInfo) header = p
      if (p.done) doneEv = p
    })
    await engine.open(blob, { name: 'named-style.xlsx' })
    await engine.call('xlsx.load', [0])
    for (let i = 0; i < 200 && !(header && doneEv); i++) await new Promise((r) => setTimeout(r, 50))
    if (doneEv?.error) throw new Error(`load: ${doneEv.error}`)
    const col0 = header?.colInfo?.[0]
    ns.col0Px = col0?.w
    ns.defaultColW = header?.defaultColW
    ns.defaultRowH = header?.defaultRowH
    // 解析侧：width=8.43chars → 三段式 64px；默认行高走度量口径（19px@Carlito11），非 15pt→20px
    if (!(col0 && Math.abs(col0.w - 64) < 0.01)) errs.push(`named-style A 列非 64px: ${col0?.w}`)
    if (header?.defaultColW !== 64) errs.push(`named-style 默认列宽非 64px: ${header?.defaultColW}`)
    if (header?.defaultRowH !== 19) errs.push(`named-style 默认行高非 19px（度量口径）: ${header?.defaultRowH}`)
    const b0: any = await engine.call('xlsx.block', [0, 0, 1])
    const a1 = b0?.rows?.[0]?.cells?.find((c: any) => c[0] === 0)
    const b1 = b0?.rows?.[0]?.cells?.find((c: any) => c[0] === 1)
    ns.a1 = a1; ns.b1 = b1
    if (!(a1 && a1[2] === 1)) errs.push(`named-style A1 s≠1: ${JSON.stringify(a1)}`)
    if (!(a1 && a1[1] === '0.50%')) errs.push(`named-style A1 显示非 0.50%（numFmt164）: ${JSON.stringify(a1)}`)
    if (!(b1 && b1[1] === 'hello')) errs.push(`named-style B1 非 hello: ${JSON.stringify(b1)}`)

    // 编辑触发 styles/sheet 写回，再 save → 重开
    await engine.call('xlsx.set', [0, [{ r: 0, c: 1, input: 'world' }]])
    await engine.call('xlsx.format', [0, { r0: 0, c0: 0, r1: 0, c1: 0 }, { bold: true }])
    const saved = (await engine.call('save', [])) as Blob
    const zip2 = await ZipArchive.open(new BufferSource(new Uint8Array(await saved.arrayBuffer())))
    const st2 = await zip2.text('xl/styles.xml')
    ns.stylesKept = {
      cellStyleXfs: /<cellStyleXfs count="2">/.test(st2),
      cellStyles: /<cellStyles count="2">/.test(st2),
      good: st2.includes('name="Good"'),
      myStyle: st2.includes('name="MyStyle"'),
      builtin27: st2.includes('builtinId="27"'),
      dxfs: st2.includes('<dxfs count="1">'),
      numFmt164: st2.includes('formatCode="0.00'),
      xfId1: /<xf [^>]*xfId="1"/.test(st2),
    }
    for (const [k, v] of Object.entries(ns.stylesKept as Record<string, boolean>)) {
      if (!v) errs.push(`named-style 写回丢失 ${k}`)
    }
    const sh2 = await zip2.text('xl/worksheets/sheet1.xml')
    ns.colsKept = /width="8\.4\d+"/.test(sh2)
    if (!ns.colsKept) errs.push(`named-style 写回 cols width 非 ≈8.43: ${sh2.match(/<col[^>]*>/)?.[0]}`)

    // 重开数据回环
    let header2: any = null
    let done2: any = null
    const engine2 = new Engine((ev: string, p: any) => {
      if (ev !== 'xlsx:progress') return
      if (!header2 && p.colInfo) header2 = p
      if (p.done) done2 = p
    })
    await engine2.open(saved, { name: 'named-style.xlsx' })
    await engine2.call('xlsx.load', [0])
    for (let i = 0; i < 200 && !(header2 && done2); i++) await new Promise((r) => setTimeout(r, 50))
    if (done2?.error) throw new Error(`reload: ${done2.error}`)
    const col0b = header2?.colInfo?.[0]
    ns.col0PxReload = col0b?.w
    if (!(col0b && Math.abs(col0b.w - 64) < 0.01)) errs.push(`named-style 重开 A 列非 64px: ${col0b?.w}`)
    const b1r: any = await engine2.call('xlsx.block', [0, 0, 1])
    const a1c = b1r?.rows?.[0]?.cells?.find((c: any) => c[0] === 0)
    const b1c = b1r?.rows?.[0]?.cells?.find((c: any) => c[0] === 1)
    ns.reload = { a1: a1c, b1: b1c }
    if (!(a1c && a1c[2] === 1)) errs.push(`named-style 重开 A1 s≠1（format 应追加新 xf 不动旧索引）: ${JSON.stringify(a1c)}`)
    if (!(b1c && b1c[1] === 'world')) errs.push(`named-style 重开 B1 非 world: ${JSON.stringify(b1c)}`)
  } catch (e) {
    errs.push(`named-style threw: ${e}`)
  }
  R.namedStyle = ns

  R.ok = errs.length === 0
  return R
}
let cached: Promise<Record<string, unknown>> | null = null
function result(): Promise<Record<string, unknown>> {
  if (!cached) cached = run().catch((e) => ({ ok: false, errors: [`threw: ${e}`] }))
  return cached
}

registerSmokeMode('x19', () => {
  ;(window as any).__smoke.x19 = { result }
  return () => h('div', { style: 'width:100%;height:100%' }, 'x19 P5 col-width/row-height fidelity probe')
})
