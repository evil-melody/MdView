/**
 * x27 探针（三项报障的运行时取证门，?mode=x27）：
 *
 * 立探针的起因（用户报障，截图为 PPT 舞台 + 表格 + 带红句柄文本框）：
 *  ① Excel 工作表单元格按退格删不掉内容；
 *  ② 所有文档 ⌘Z/⌘Y（用户口述 ctrl+z/ctrl+y）撤销重做无效；
 *  ③ PPT 文字编辑态与显示态外观不一致。
 *
 * 静态审读已穷尽（代码链完整、fixture 无 dataValidation/sheetProtection、无全局吞键），
 * 理论分支过宽——按纪律让数据说话。三视图全部走 **生产同路**：DocumentClient 默认
 * Worker 通道（x26 教训：主线程绿不等于 Worker 绿）。
 *
 * Chromium 无 macOS 原生菜单：键盘面探针绿 → 报障② 的断链在 Rust 原生层
 * （默认菜单预定义 Undo/Redo 截胡 ⌘Z），JS 层健康。修复 = lib.rs 自定义菜单
 * （镜像默认减 undo/redo），真机行为归 cargo test/人工验收。
 *
 * 报障③ parity 门（修复后转绿，防再塌缩）：编辑层必须携带与显示层一致的逐 run
 * 结构 + 计算样式逐 run 相等。提交往返锁当前内核语义（setShapeText 首 run 塌缩，
 * 逐 run 持久化 = PptxEditor 接入的升级路径，本次不动）。
 *
 * 报障① 双门：S5~S7 验证数据验证门对「输入」仍拦截（防误拆整道门），
 * S8~S9 验证 allowBlank=false 命中时「清除内容」照删（Excel 语义，修复根因）。
 *
 * 顶层只注册 mode；结果挂 window.__smoke.x27（promise 路径，与 x25/x26 同规）。
 */
import { h, nextTick, reactive } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import { DocumentClient } from './client'
import OfficeSheetView from './components/OfficeSheetView.vue'
import OfficeSlideView from './components/OfficeSlideView.vue'
import OfficeDocView from './components/OfficeDocView.vue'
import { writeZip } from './core/zipwrite'

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

/** 双 run 文本框（红粗 28pt + 蓝 14pt）+ 一个纯色矩形（删除/撤销靶子） */
function slideXml(): string {
  const box =
    `<p:sp><p:nvSpPr><p:cNvPr id="10" name="T10"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="500000" y="500000"/><a:ext cx="5000000" cy="1200000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p>` +
    `<a:r><a:rPr lang="zh-CN" sz="2800" b="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>红粗28</a:t></a:r>` +
    `<a:r><a:rPr lang="zh-CN" sz="1400"><a:solidFill><a:srgbClr val="0000FF"/></a:solidFill></a:rPr><a:t>蓝细14</a:t></a:r>` +
    `</a:p></p:txBody></p:sp>`
  const rect =
    `<p:sp><p:nvSpPr><p:cNvPr id="11" name="R11"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="500000" y="3000000"/><a:ext cx="2000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="4472C4"/></a:solidFill></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody></p:sp>`
  return `${DECL}<p:sld xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:cSld><p:spTree>${grp}${box}${rect}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
}

async function buildPptx(): Promise<Blob> {
  const parts = new Map<string, string>([
    ['[Content_Types].xml', `${DECL}<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats.theme+xml"/></Types>`],
    ['_rels/.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`],
    ['ppt/presentation.xml', `${DECL}<p:presentation xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${RNS}/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="${RNS}/theme" Target="theme/theme1.xml"/></Relationships>`],
    ['ppt/slides/slide1.xml', slideXml()],
    ['ppt/slides/_rels/slide1.xml.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`],
    ['ppt/slideLayouts/slideLayout1.xml', `${DECL}<p:sldLayout xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`],
    ['ppt/slideMasters/slideMaster1.xml', `${DECL}<p:sldMaster xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:cSld name="Master"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${RNS}/theme" Target="../theme/theme1.xml"/></Relationships>`],
    ['ppt/theme/theme1.xml', `${DECL}<a:theme xmlns:a="${A}" name="T"><a:themeElements><a:clrScheme name="T"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="T"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="T"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectLst/></a:effectStyleLst><a:effectStyleLst><a:effectLst/></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`],
  ])
  return writeZip(parts as any)
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const errs: string[] = []
const ok = (name: string, cond: unknown, extra = '') => {
  if (!cond) errs.push(`${name}${extra ? ' → ' + extra : ''}`)
  return !!cond
}
const detail: Record<string, unknown> = {}

/** 合成按键：window 冒泡相位（onSheetKey/onKey 的挂点），与真实按键同路 */
const key = (init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
const ptr = (el: Element, type: string) => {
  const b = el.getBoundingClientRect()
  const o: any = { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, view: window }
  el.dispatchEvent(new PointerEvent(type, o))
}
const clickCell = (r: number, c: number) => {
  const el = document.querySelector(`.ov-cell[data-cell-r="${r}"][data-cell-c="${c}"]`)
  if (!el) return false
  ptr(el, 'pointerdown')
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, view: window }))
  return true
}
const cellText = async (c: any, r: number, col: number): Promise<string> => {
  const v: any = await c.call('xlsx.cell', 0, r, col)
  return v?.value == null ? '' : String(v.value)
}

// ---------------------------------------------------------------- 阶段挂载状态
const st = reactive<{ stage: '' | 'sheet' | 'slide' | 'doc'; sheet: any; slide: any; doc: any }>({
  stage: '', sheet: null, slide: null, doc: null,
})

// ---------------------------------------------------------------- ① + ② Excel：退格 / 撤销 / 重做（Worker 生产同路）
async function sheetTests() {
  const resp = await fetch('real-noise.xlsx')
  ok('S0 fixture 可取', resp.ok, `HTTP ${resp.status}`)
  const client: any = await DocumentClient.open(await resp.blob(), { name: 'x27.xlsx' })
  st.sheet = { client, info: client.info }
  st.stage = 'sheet'
  await nextTick()
  await wait(200)
  // 视图挂载后再 load：progress 帧同时到达探针收集器与视图 applyProgress（先 load 后挂会丢帧建不出轴）
  let done = false
  client.on('xlsx:progress', (p: any) => { if (p.sheet === 0 && p.done) done = true })
  await client.call('xlsx.load', 0)
  for (let i = 0; i < 200 && !done; i++) await wait(50)
  ok('S1 sheet0 装载完成', done)
  for (let i = 0; i < 60; i++) {
    const b: any = await client.call('xlsx.block', 0, 0, 60)
    if (b?.complete) break
    await wait(100)
  }
  await wait(400)

  const b3Before = await cellText(client, 2, 1)
  ok('S2 B3 初值 = 法律名称', b3Before === '法律名称', `actual=${JSON.stringify(b3Before)}`)
  ok('S3 网格已出 B3 单元', clickCell(2, 1))
  await wait(250) // refocusAnchor 在 pointerup 后的 nextTick 落焦
  detail.activeEl = `${document.activeElement?.tagName ?? ''}.${String((document.activeElement as HTMLElement)?.className ?? '')}`
  key({ key: 'Backspace' })
  for (let i = 0; i < 40; i++) {
    if ((await cellText(client, 2, 1)) === '') break
    await wait(100)
  }
  const b3Clear = await cellText(client, 2, 1)
  detail.sheetBackspace = { before: b3Before, after: b3Clear }
  ok('① B3 退格后清空', b3Clear === '', `actual=${JSON.stringify(b3Clear)}`)

  key({ key: 'z', metaKey: true }) // ⌘Z：Excel onSheetKey mod+z → commands.undo
  for (let i = 0; i < 40; i++) {
    if ((await cellText(client, 2, 1)) === '法律名称') break
    await wait(100)
  }
  const b3Undo = await cellText(client, 2, 1)
  detail.sheetUndo = b3Undo
  ok('② Excel ⌘Z 还原 B3', b3Undo === '法律名称', `actual=${JSON.stringify(b3Undo)}`)

  key({ key: 'y', metaKey: true }) // ⌘Y：mac 原生菜单 Redo 只挂 ⇧⌘Z，⌘Y 直通 JS
  for (let i = 0; i < 40; i++) {
    if ((await cellText(client, 2, 1)) === '') break
    await wait(100)
  }
  const b3Redo = await cellText(client, 2, 1)
  detail.sheetRedo = b3Redo
  ok('② Excel ⌘Y 重做再清', b3Redo === '', `actual=${JSON.stringify(b3Redo)}`)

  // ---- 报障① 修复门：数据验证规则（allowBlank=false，整数 1~10 覆盖 B3）。
  //      S5 非法输入仍被拦（整道门没拆）；S7 清除内容照删（Excel 语义：Delete
  //      永不走验证——修复前此处被弹「数据验证」，B3 删不掉，即用户报障本体）。 ----
  const view: any = (window as any).__smoke.x27SheetView
  if (!view?.commands || !view?.refreshFeatures) {
    errs.push('V0 视图 commands/refreshFeatures 不可达（defineExpose 缺失）')
  } else {
    await client.call('xlsx.validationSet', 0, [
      { id: 1, sqref: { r0: 2, c0: 1, r1: 2, c1: 1 }, type: 'whole', operator: 'between', formula1: '1', formula2: '10', allowBlank: false },
    ])
    await view.refreshFeatures()

    // S5：单格非法输入 → 仍弹「数据验证」拦截，B3 不变。
    // 注意不能 await setCells：它 return officeAlert(...)，promise 要等遮罩关闭才结算。
    const p5 = view.commands.setCells([{ r: 2, c: 1, input: 'abc' }])
    await wait(200)
    const overlay = document.querySelector('.op-prompt-overlay')
    const alertTitle = overlay ? String(overlay.querySelector('.op-prompt-title')?.textContent ?? '') : ''
    detail.valAlert = alertTitle
    ok('S5 非法输入仍被验证拦（弹数据验证）', alertTitle.includes('数据验证'), `title=${JSON.stringify(alertTitle)}`)
    overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true })) // 点遮罩取消
    await p5
    ok('S6 拦截后 B3 未被改写', (await cellText(client, 2, 1)) === '', `actual=${JSON.stringify(await cellText(client, 2, 1))}`)

    // S7：合法值写入 → 退格清除（skipValidation 路径）→ 即使 allowBlank=false 也必须删掉
    await view.commands.setCells([{ r: 2, c: 1, input: '5' }])
    await wait(150)
    ok('S7a 合法值 5 写入', (await cellText(client, 2, 1)) === '5', `actual=${JSON.stringify(await cellText(client, 2, 1))}`)
    clickCell(2, 1)
    await wait(250)
    key({ key: 'Backspace' })
    for (let i = 0; i < 40; i++) {
      if ((await cellText(client, 2, 1)) === '') break
      await wait(100)
    }
    const b3Cleared = await cellText(client, 2, 1)
    detail.sheetClearVsValidation = b3Cleared
    ok('① S7 allowBlank=false 命中时退格仍清空（报障① 根因门）', b3Cleared === '', `actual=${JSON.stringify(b3Cleared)}`)
  }

  client.destroy()
  st.sheet = null
  st.stage = ''
  await nextTick()
  await wait(150)
}

// ---------------------------------------------------------------- ②③ PPT：键盘撤销 + 编辑/显示一致性
async function slideTests() {
  // 放映视图会调 requestFullscreen；headless 下 stub 掉，避免探针自己制造 unhandled rejection。
  const origFs = HTMLElement.prototype.requestFullscreen
  ;(HTMLElement.prototype as any).requestFullscreen = () => Promise.resolve()
  const blob = await buildPptx()
  const client: any = await DocumentClient.open(blob, { name: 'x27.pptx' })
  st.slide = { client, info: client.info }
  st.stage = 'slide'
  await nextTick()
  await wait(600)
  // 缩略图同样渲染 OfficeSlideCanvas（.ov-slide-canvas 在 .ov-slide-thumb-view 内）：
  // 舞台断言必须限定 .ov-slide-stage，否则匹到缩略图（非交互，dblclick 不进编辑态）。
  const shapes = () => document.querySelectorAll('.ov-slide-stage .ov-slide-el')
  ok('P0 舞台已出 2 个形状', shapes().length === 2, `n=${shapes().length}`)

  // ---- ③ parity：显示层与编辑层互斥（v-if/v-else per shape），必须【先进编辑前】
  //      快照 box 的 locked 结构，再 dblclick 进编辑比对。box=index0，rect=index1（空文本）。 ----
  const boxLocked = shapes()[0].querySelector('.ov-slide-text-locked')
  const dParas = boxLocked ? [...boxLocked.querySelectorAll('.ov-slide-para')] : []
  const dRuns = dParas[0] ? [...dParas[0].querySelectorAll('span')] : []
  detail.displayStructure = { paras: dParas.length, runs: dRuns.length, html: boxLocked?.innerHTML.slice(0, 300) }
  ok('P2 显示层段落 = 1', dParas.length === 1, `n=${dParas.length}`)
  ok('P3 显示层逐 run = 2', dRuns.length === 2, `n=${dRuns.length}`)
  // 显示层计算样式必须在进编辑前快照：locked 层被 v-if/v-else 卸载后元素脱离 DOM，
  // 再 getComputedStyle 全返空串（首轮假失败教训）。
  const cs = (e: Element) => {
    const s = getComputedStyle(e as HTMLElement)
    return { text: e.textContent, fontSize: s.fontSize, color: s.color, fontWeight: s.fontWeight }
  }
  const d0 = dRuns[0] ? cs(dRuns[0]) : null
  const d1 = dRuns[1] ? cs(dRuns[1]) : null

  const boxEl = shapes()[0]
  boxEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }))
  await wait(300)
  const edit = document.querySelector('.ov-slide-stage .ov-slide-text-edit')
  ok('P1 编辑层已挂载', !!edit)
  detail.editHtml = edit ? edit.innerHTML.slice(0, 400) : null
  const eParas = edit ? [...edit.querySelectorAll('.ov-slide-para')] : []
  const eRuns = eParas[0] ? [...eParas[0].querySelectorAll('span')] : []
  ok('③ 编辑层段落 = 1', eParas.length === 1, `n=${eParas.length}`)
  ok('③ 编辑层逐 run = 2（修复前必红：单 run 塌缩 + 纯文本节点）', eRuns.length === 2, `n=${eRuns.length}`)
  if (dRuns.length === 2 && eRuns.length === 2 && d0 && d1) {
    const e0 = cs(eRuns[0]), e1 = cs(eRuns[1])
    detail.parity = { display: [d0, d1], edit: [e0, e1] }
    ok('③ run0 字号一致（28pt）', d0.fontSize === e0.fontSize && Math.abs(parseFloat(e0.fontSize) - 28 * 96 / 72) < 1, `d=${d0.fontSize} e=${e0.fontSize}`)
    ok('③ run0 颜色一致（红）', d0.color === e0.color && /255,\s*0,\s*0/.test(e0.color), `d=${d0.color} e=${e0.color}`)
    ok('③ run0 粗体一致', d0.fontWeight === e0.fontWeight && Number(e0.fontWeight) >= 700, `d=${d0.fontWeight} e=${e0.fontWeight}`)
    ok('③ run1 字号一致（14pt）', d1.fontSize === e1.fontSize && Math.abs(parseFloat(e1.fontSize) - 14 * 96 / 72) < 1, `d=${d1.fontSize} e=${e1.fontSize}`)
    ok('③ run1 颜色一致（蓝）', d1.color === e1.color && /0,\s*0,\s*255/.test(e1.color), `d=${d1.color} e=${e1.color}`)
    ok('③ 编辑层文本 = 显示层文本', edit?.textContent === boxLocked?.textContent, `e=${JSON.stringify(edit?.textContent)} d=${JSON.stringify(boxLocked?.textContent)}`)
  }

  // ---- ③ 提交往返（P18 语义更新）：视图提交已接 PptxEditor → 'pptx.setText' 逐 run
  //      持久化（旧 setShapeText 塌缩单 run 语义作废）。走生产同路：光标折叠到 run1
  //      文末 → 合成 insertText → 400ms 防抖 commit → 模型断言两 run 各自格式保留。 ----
  if (eRuns.length === 2) {
    const sv: any = (window as any).__smoke.x27SlideView
    const ped = sv?.editor
    const okCtx = ok('③ PptxEditor 经 defineExpose 可达', !!ped?.active, `ped=${!!ped}`)
    if (okCtx) {
      const oEnd = { pa: '0', o: 8 } // run0「红粗28」4 字 + run1「蓝细14」4 字 = 段长 8，run1 文末
      ped.input.restore({ a: oEnd, f: oEnd })
      await wait(100)
      const live = document.querySelector('.ov-slide-stage .ov-slide-text-edit')
      live?.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: '改', bubbles: true, cancelable: true }))
      await wait(150)
      // 退出编辑走生产同路：blur → textBlur → texEdit.stop()（end() 内立即 commit 未提交改动）。
      // 不退编辑则编辑层悬挂，v-if/v-else 互斥使该形状无 locked 层可比对。
      ;(live as HTMLElement | null)?.blur()
      await wait(900) // commit RPC + adopt + 重渲
      const m: any = await client.call('pptx.slide', 0)
      const runs = (m?.els?.[0]?.text?.paras?.[0]?.runs ?? []) as any[]
      detail.commitRuns = runs.map((r) => ({ text: r.text, sz: r.sz, b: !!r.b, color: r.color }))
      ok('③ 提交后逐 run 保留（2 runs，文本=红粗28/蓝细14改）', runs.length === 2 && runs[0]?.text === '红粗28' && runs[1]?.text === '蓝细14改', JSON.stringify(runs))
      ok('③ run0 格式保留（28pt 粗红）', runs[0]?.sz === 28 && runs[0]?.b === true && /FF0000/i.test(runs[0]?.color ?? ''), JSON.stringify(runs[0]))
      ok('③ run1 格式保留（14pt 细蓝）', runs[1]?.sz === 14 && !runs[1]?.b && /0000FF/i.test(runs[1]?.color ?? ''), JSON.stringify(runs[1]))
      await wait(200)
      const lk = document.querySelector('.ov-slide-stage .ov-slide-text-locked')
      ok('③ 提交后显示层重渲染', !!lk && (lk.textContent ?? '').includes('蓝细14改'), String(lk?.textContent ?? '').slice(0, 80))
    }
  }

  // ---- ② PPT 键盘撤销：选中矩形 → Backspace 删除 → ⌘Z 还原 ----
  await wait(200)
  const rectEl = shapes()[1] ?? shapes()[0]
  ptr(rectEl, 'pointerdown')
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, view: window }))
  await wait(200)
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  const n0 = shapes().length
  key({ key: 'Backspace' })
  await wait(500)
  const n1 = shapes().length
  detail.pptDelete = { before: n0, after: n1 }
  ok('② PPT 选中形状 Backspace 删除', n1 === n0 - 1, `${n0}→${n1}`)
  key({ key: 'z', metaKey: true })
  for (let i = 0; i < 30; i++) {
    if (shapes().length === n0) break
    await wait(100)
  }
  const n2 = shapes().length
  ok('② PPT ⌘Z 还原删除', n2 === n0, `${n1}→${n2}`)
  key({ key: 'y', metaKey: true })
  await wait(400)
  const n3 = shapes().length
  ok('② PPT ⌘Y 重做再删', n3 === n0 - 1, `${n2}→${n3}`)
  key({ key: 'z', metaKey: true })
  await wait(300)

  // ---- ④ 视图模式键盘：browse 下 stage 隐藏但当前实例快捷键必须仍生效；present 只读 + Esc 退出 ----
  const sview: any = (window as any).__smoke.x27SlideView
  if (sview?.commands && shapes().length) {
    ptr(shapes()[0], 'pointerdown')
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, view: window }))
    await wait(150)
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    sview.commands.setView('browse')
    await nextTick()
    ok('P4a browse 视图已切换', !!document.querySelector('.ov-browse'))
    const nb = shapes().length
    key({ key: 'Delete' })
    await wait(400)
    ok('P4 browse Delete 仍真删形状', shapes().length === nb - 1, `${nb}→${shapes().length}`)
    key({ key: 'z', metaKey: true })
    await wait(400)

    sview.commands.setView('present')
    await nextTick()
    const np = shapes().length
    key({ key: 'Delete' })
    await wait(300)
    ok('P5 present Delete 不改数据', shapes().length === np, `${np}→${shapes().length}`)
    key({ key: 'Escape' })
    await nextTick()
    ok('P6 present Esc 退回普通视图', !document.querySelector('.ov-present'))
  }

  HTMLElement.prototype.requestFullscreen = origFs
  client.destroy()
  st.slide = null
  st.stage = ''
  await nextTick()
  await wait(150)
}

// ---------------------------------------------------------------- ② Word：键盘撤销重做（Worker 生产同路）
async function docTests() {
  const resp = await fetch('sample.docx')
  ok('D0 fixture 可取', resp.ok, `HTTP ${resp.status}`)
  const client: any = await DocumentClient.open(await resp.blob(), { name: 'x27.docx' })
  st.doc = { client }
  st.stage = 'doc'
  await nextTick()
  // 视图 onMounted 自启 docx.start。等待条件必须锁「真实段落已渲染」而非 textContent 非空——
  // 「加载中…」占位也有文本（首轮假失败教训：基线 6 字符 → 后续 ⌘Z/⌘Y 全比对错值）。
  const root = () => document.querySelector('.ov-doc-root') as HTMLElement | null
  const paras = () => document.querySelectorAll('.ov-doc-root [data-pa]').length
  for (let i = 0; i < 300 && paras() < 5; i++) await wait(100)
  ok('D1 段落已渲染', paras() >= 5, `n=${paras()}`)
  await wait(300)
  const text0 = (root()?.textContent ?? '').trim()
  ok('D1b 正文非占位', text0.length > 100, `len=${text0.length}`)
  const view: any = (window as any).__smoke.x27DocView
  const editor = view?.editor
  ok('D2 editor 可达', !!editor)
  if (editor && root()) {
    // 断言锁「标记」而非 textContent.length：页面虚拟化使 DOM 只含已渲染页，长度不可靠。
    const MARK = 'x27撤销靶文'
    editor.input.selectAll()
    editor.insertText(MARK)
    await wait(400)
    const hasIns = () => (root()?.textContent ?? '').includes(MARK)
    ok('D3 替换全文生效（标记出现）', hasIns())
    root()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }))
    for (let i = 0; i < 40 && hasIns(); i++) await wait(100)
    detail.docUndo = { paras0: paras(), hasAfterUndo: hasIns() }
    ok('② Word ⌘Z 撤销（标记消失）', !hasIns())
    root()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', metaKey: true, bubbles: true, cancelable: true }))
    for (let i = 0; i < 40 && !hasIns(); i++) await wait(100)
    ok('② Word ⌘Y 重做（标记再现）', hasIns())
    root()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }))
    await wait(300)

    // ---- ④ 格式刷：两个入口都必须把内核 painter 开关同步到按钮点亮状态 ----
    editor.input.selectAll()
    view.commands.copyFormat()
    ok('D4 复制样式点亮格式刷按钮', view.bar?.painter === true && editor.painter !== null,
      `bar=${view.bar?.painter} kernel=${editor.painter !== null}`)
    view.commands.painter()
    ok('D5 再点格式刷取消（清内核副本）', view.bar?.painter === false && editor.painter === null,
      `bar=${view.bar?.painter} kernel=${editor.painter !== null}`)
  }
  client.destroy()
  st.doc = null
  st.stage = ''
  await nextTick()
}

async function run(): Promise<Record<string, unknown>> {
  try { await sheetTests() } catch (e) { errs.push(`sheet threw: ${String((e as Error)?.stack ?? e)}`) }
  try { await slideTests() } catch (e) { errs.push(`slide threw: ${String((e as Error)?.stack ?? e)}`) }
  try { await docTests() } catch (e) { errs.push(`doc threw: ${String((e as Error)?.stack ?? e)}`) }
  return { ok: errs.length === 0, errors: errs, detail }
}

let cached: Promise<Record<string, unknown>> | null = null
function result(): Promise<Record<string, unknown>> {
  if (!cached) cached = run().catch((e) => ({ ok: false, errors: [`threw: ${e}`], detail }))
  return cached
}

registerSmokeMode('x27', () => {
  ;(window as any).__smoke.x27 = { result }
  return () => {
    if (st.stage === 'sheet' && st.sheet)
      return h('div', { style: 'height:100vh' }, [h(OfficeSheetView, { ref: (el: any) => ((window as any).__smoke.x27SheetView = el), client: st.sheet.client, editable: true, info: st.sheet.info })])
    if (st.stage === 'slide' && st.slide)
      return h('div', { style: 'height:100vh' }, [h(OfficeSlideView, { ref: (el: any) => ((window as any).__smoke.x27SlideView = el), client: st.slide.client, editable: true, info: st.slide.info })])
    if (st.stage === 'doc' && st.doc)
      return h('div', { style: 'height:100vh' }, [h(OfficeDocView, { ref: (el: any) => ((window as any).__smoke.x27DocView = el), client: st.doc.client, editable: true })])
    return h('div', { style: 'width:100%;height:100%' }, 'x27 三视图键盘面 + PPT 编辑/显示一致性取证门')
  }
})
