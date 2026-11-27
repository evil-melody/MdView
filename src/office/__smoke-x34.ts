/**
 * x34 探针（P18 PPT 域语义回归门，?mode=x34）：
 *
 * ppt-fixer 七条修复逐条硬断言（生产同路：DocumentClient Worker 通道 +
 * OfficeSlideView 真实挂载 + commands 防腐层 + part RPC 落盘真值）：
 *  A 节 幻灯片级操作记 undo：add/duplicate/move/hide/delete 逐一 undo 回原状；
 *       move 断言 presentation.xml（slide part 不变）；delete→undo 内容逐字还原；
 *       undo 后新操作 → redo 栈被清；hide undo 带回 meta → bar.hidden 回读。
 *  B 节 隐藏按钮态跨页同步：hide → 切页 false → 切回 true。
 *  C 节 对齐幻灯片语义：多选两不同宽形状 → 各自 x=(s.w-w)/2（非互相对齐外接矩形）。
 *  D 节 批量格式：多选 fill/order 全部生效；未选中 → 提示串。
 *  E 节 anchor 扩范围：表格 graphicFrame → 4 个 a:tcPr@anchor；矩形 → a:bodyPr@anchor。
 *  F 节 PptxEditor 落盘：选区命令 → part XML 硬断言 a:latin/sz/u/solidFill、
 *       a:pPr@algn/lnSpc/buChar；逐 run 保真；Esc 防抖窗内丢弃；⌘Enter 立即提交。
 *  G 节 组内子形状精确命中（oid 通道）：组内文本框/矩形的 fill/anchor/shapeText/anim
 *       按自身 id 命中（旧路径 top=组 id → 静默无操作）；结构 op 仍作用整组。
 *
 * 顶层只注册 mode；结果挂 window.__smoke.x34（promise 路径，与 x27~x33 同规）。
 */
import { h, nextTick, reactive } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import { DocumentClient } from './client'
import OfficeSlideView from './components/OfficeSlideView.vue'
import { writeZip } from './core/zipwrite'

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

const sp = (id: number, name: string, x: number, y: number, cx: number, cy: number, prst: string, fill: string) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
  `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>` +
  `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></p:spPr>` +
  `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody></p:sp>`

/** 双 run 文本框（id=10）+ 两个不同宽矩形（11 宽 200 万 / 12 宽 400 万 EMU）+ 2×2 表（id=13）
 *  + 组合（grpSp id=20，内含文本框 21 / 矩形 22）——G 节组内子形状精确命中门 */
function slide1Xml(): string {
  const box =
    `<p:sp><p:nvSpPr><p:cNvPr id="10" name="T10"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="500000" y="500000"/><a:ext cx="5000000" cy="1200000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p>` +
    `<a:r><a:rPr lang="zh-CN" sz="2800" b="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>红粗28</a:t></a:r>` +
    `<a:r><a:rPr lang="zh-CN" sz="1400"><a:solidFill><a:srgbClr val="0000FF"/></a:solidFill></a:rPr><a:t>蓝细14</a:t></a:r>` +
    `</a:p></p:txBody></p:sp>`
  const r1 = sp(11, 'R11', 500000, 2600000, 2000000, 800000, 'rect', '4472C4')
  const r2 = sp(12, 'R12', 6000000, 3400000, 4000000, 800000, 'roundRect', 'ED7D31')
  const cell = (t: string) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${t}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>`
  // 组合：grpSp id=30（chOff/chExt 与 off/ext 同值 → 子形状坐标直通屏幕坐标）；
  // 放在右下空白区（x≥6000000, y 600000..2400000），不与 10/11/12/13 重叠，避免 pick() 命中歧义
  const gbox =
    `<p:sp><p:nvSpPr><p:cNvPr id="31" name="GT31"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="6000000" y="600000"/><a:ext cx="2800000" cy="800000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="2800" b="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr><a:t>组内文本</a:t></a:r></a:p></p:txBody></p:sp>`
  const grect =
    `<p:sp><p:nvSpPr><p:cNvPr id="32" name="GR32"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="6000000" y="1600000"/><a:ext cx="2800000" cy="800000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="70AD47"/></a:solidFill></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody></p:sp>`
  const group =
    `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="30" name="G30"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="6000000" y="600000"/><a:ext cx="2800000" cy="1800000"/><a:chOff x="6000000" y="600000"/><a:chExt cx="2800000" cy="1800000"/></a:xfrm></p:grpSpPr>` +
    `${gbox}${grect}</p:grpSp>`
  const table =
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="13" name="Tbl13"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="500000" y="4400000"/><a:ext cx="4000000" cy="1500000"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>` +
    `<a:tblPr firstRow="1"/><a:tblGrid><a:gridCol w="2000000"/><a:gridCol w="2000000"/></a:tblGrid>` +
    `<a:tr h="700000">${cell('A1')}${cell('B1')}</a:tr><a:tr h="700000">${cell('A2')}${cell('B2')}</a:tr>` +
    `</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
  return `${DECL}<p:sld xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:cSld><p:spTree>${grp}${box}${r1}${r2}${table}${group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
}

async function buildPptx(): Promise<Blob> {
  const parts = new Map<string, string>([
    ['[Content_Types].xml', `${DECL}<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats.theme+xml"/></Types>`],
    ['_rels/.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`],
    ['ppt/presentation.xml', `${DECL}<p:presentation xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId4"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${RNS}/slide" Target="slides/slide1.xml"/><Relationship Id="rId4" Type="${RNS}/slide" Target="slides/slide2.xml"/><Relationship Id="rId3" Type="${RNS}/theme" Target="theme/theme1.xml"/></Relationships>`],
    ['ppt/slides/slide1.xml', slide1Xml()],
    ['ppt/slides/_rels/slide1.xml.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`],
    ['ppt/slides/slide2.xml', slide1Xml().replace(/id="(\d+)"/g, (_m, d: string) => `id="${Number(d) + 100}"`)],
    ['ppt/slides/_rels/slide2.xml.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`],
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
const st = reactive<{ client: any; ready: boolean }>({ client: null, ready: false })

/** 包内 part 文本（落盘真值）；不存在返空串 */
async function partText(path: string): Promise<string> {
  const blob: Blob = await st.client.call('part', path)
  return blob ? await blob.text() : ''
}

/** 轮询（异步 RPC 固定 wait 必红——轮询铁律） */
async function until(cond: () => boolean | Promise<boolean>, ms = 8000, step = 100): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await cond()) return true
    await wait(step)
  }
  return false
}

const shapes = () => document.querySelectorAll('.ov-slide-stage .ov-slide-el')

/** 选中（x27 同款：元素 pointerdown + window pointerup） */
function pick(el: Element) {
  const b = el.getBoundingClientRect()
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, view: window }))
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, buttons: 0, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, view: window }))
}
/** 加选：shiftKey（headless mac 下 ctrl+click 被当右键拦截，onElDown :593） */
function addTo(el: Element) {
  const b = el.getBoundingClientRect()
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1, shiftKey: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, view: window }))
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, buttons: 0, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, view: window }))
}

async function run(): Promise<Record<string, unknown>> {
  detail.stage = 'boot'
  HTMLElement.prototype.requestFullscreen = () => Promise.resolve() // 放映不触达，保险
  const blob = await buildPptx()
  const client: any = await DocumentClient.open(blob, { name: 'x34.pptx' })
  st.client = client
  st.ready = true
  await nextTick()
  await until(() => shapes().length === 6, 15000)
  const view: any = (window as any).__smoke.x34View
  if (!view?.commands) { errs.push('V0 视图 commands 不可达'); client.destroy(); st.ready = false; return { ok: false, errors: errs, detail } }
  ok('V1 舞台 6 元素（框+两矩形+表+组内两子）', shapes().length === 6, `n=${shapes().length}`)
  const count = () => view.meta?.count ?? -1

  // ===== A 节 幻灯片级操作 undo =====
  detail.stage = 'A'
  ok('A0 初始 2 页', count() === 2, `n=${count()}`)

  await view.commands.addSlide('blank')
  ok('A1a add → 3 页', count() === 3, `n=${count()}`)
  await view.commands.undo(false)
  ok('① A1b add→undo 回 2 页', count() === 2, `n=${count()}`)
  await view.commands.undo(true)
  ok('A1c redo → 3 页', count() === 3, `n=${count()}`)
  await view.commands.undo(false) // 归 2 页

  await view.commands.goto(0)
  await wait(200)
  await view.commands.duplicate()
  ok('A2a duplicate → 3 页', count() === 3, `n=${count()}`)
  await view.commands.undo(false)
  ok('① A2b duplicate→undo 回 2 页', count() === 2, `n=${count()}`)

  // move：只改 presentation.xml（sldIdLst 顺序），slide part 不变 → 断言比较 presentation
  await view.commands.goto(0)
  await wait(200)
  const presBefore = await partText('ppt/presentation.xml')
  await view.commands.moveSlide(1)
  await wait(300)
  const presMoved = await partText('ppt/presentation.xml')
  ok('A3a move 改 presentation.xml', presMoved !== presBefore, '未变')
  await view.commands.undo(false)
  await wait(300)
  const presUndone = await partText('ppt/presentation.xml')
  ok('① A3b move→undo presentation.xml 逐字复原', presUndone === presBefore, `len ${presBefore.length}→${presUndone.length}`)

  // hide：undo 后 meta 回读 → bar.hidden 翻转
  await view.commands.goto(0)
  await wait(200)
  await view.commands.hidden(true)
  await wait(300)
  ok('A4a hide → bar.hidden=true', view.bar?.hidden === true, `bar=${view.bar?.hidden}`)
  await view.commands.undo(false)
  await wait(300)
  ok('① A4b hide→undo bar.hidden=false', view.bar?.hidden === false, `bar=${view.bar?.hidden}`)

  // delete：删页 1 → undo 页数复原 + slide2 part 逐字还原
  await view.commands.goto(1)
  await wait(300)
  const s2Before = await partText('ppt/slides/slide2.xml')
  await view.commands.deleteSlide()
  await wait(300)
  ok('A5a delete → 1 页', count() === 1, `n=${count()}`)
  await view.commands.undo(false)
  await wait(300)
  ok('① A5b delete→undo 回 2 页', count() === 2, `n=${count()}`)
  const s2After = await partText('ppt/slides/slide2.xml')
  ok('A5c 被删页内容逐字还原', s2After === s2Before && s2After.length > 0, `len ${s2Before.length}→${s2After.length}`)

  // redo 栈清空：undo 后新操作 → redo 无效
  await view.commands.goto(0)
  await wait(300)
  await view.commands.addSlide('blank')
  const nAfterNew = count()
  await view.commands.undo(true)
  await wait(200)
  ok('A6 undo 后新操作 → redo 栈被清', count() === nAfterNew, `n=${count()} 期望 ${nAfterNew}`)
  await view.commands.undo(false) // 归 2 页
  await view.commands.goto(0)
  await wait(300)

  // ===== B 节 隐藏按钮态跨页同步 =====
  detail.stage = 'B'
  await view.commands.hidden(true) // 页 0 隐藏
  await wait(300)
  await view.commands.goto(1)
  await wait(400)
  ok('② B1 切到未隐藏页 → bar.hidden=false', view.bar?.hidden === false, `bar=${view.bar?.hidden}`)
  await view.commands.goto(0)
  await wait(400)
  ok('B2 切回隐藏页 → bar.hidden=true', view.bar?.hidden === true, `bar=${view.bar?.hidden}`)
  await view.commands.hidden(false) // 复位
  await wait(300)

  // ===== C 节 对齐幻灯片语义 =====
  detail.stage = 'C'
  pick(shapes()[1]) // 矩形 11（宽 2000000 EMU）
  await wait(200)
  addTo(shapes()[2]) // 加选矩形 12（宽 4000000 EMU）
  await wait(200)
  view.commands.alignOn('center')
  const greenC = await until(async () => {
    const m: any = await client.call('pptx.slide', 0)
    const a = m.els[1]?.box, c = m.els[2]?.box
    return Math.abs(a.x - (m.w - a.w) / 2) < 1 && Math.abs(c.x - (m.w - c.w) / 2) < 1
  })
  const mC: any = await client.call('pptx.slide', 0)
  detail.alignC = { x1: mC.els[1].box.x, x2: mC.els[2].box.x, w: mC.w }
  ok('③ C1 多选居中 = 各自贴幻灯片中线', greenC, JSON.stringify(detail.alignC))
  ok('C2 两形状几何中心相等', Math.abs(mC.els[1].box.x + mC.els[1].box.w / 2 - (mC.els[2].box.x + mC.els[2].box.w / 2)) < 1,
    `c1=${mC.els[1].box.x + mC.els[1].box.w / 2} c2=${mC.els[2].box.x + mC.els[2].box.w / 2}`)

  // ===== D 节 批量格式 + 未选中提示串 =====
  detail.stage = 'D'
  const fillRet = view.commands.shapeFill(null) // applyShapes 返回 Promise（非提示串）
  ok('D0 有选区 shapeFill 走命令（非提示串）', typeof fillRet !== 'string', JSON.stringify(fillRet))
  await until(async () => {
    const m: any = await client.call('pptx.slide', 0)
    return m.els[1]?.fill?.t === 'none' && m.els[2]?.fill?.t === 'none'
  })
  const mD: any = await client.call('pptx.slide', 0)
  detail.batchFill = [mD.els[1].fill, mD.els[2].fill]
  ok('④ D1 多选 shapeFill(null) 两形状全清', mD.els[1].fill?.t === 'none' && mD.els[2].fill?.t === 'none', JSON.stringify(detail.batchFill))
  view.commands.shapeFill('#c00000')
  await until(async () => {
    const m: any = await client.call('pptx.slide', 0)
    return /C00000/i.test(m.els[1]?.fill?.c ?? '') && /C00000/i.test(m.els[2]?.fill?.c ?? '')
  })
  const mD2: any = await client.call('pptx.slide', 0)
  ok('D2 多选 shapeFill(#c00000) 两形状全红', /C00000/i.test(mD2.els[1].fill?.c ?? '') && /C00000/i.test(mD2.els[2].fill?.c ?? ''),
    `${mD2.els[1].fill?.c} / ${mD2.els[2].fill?.c}`)
  // order 批量：两形状同时置底 → els 数组顺序变
  const beforeTops = mD2.els.map((e: any) => e.top)
  view.commands.order('back')
  const greenD3 = await until(async () => {
    const m: any = await client.call('pptx.slide', 0)
    return JSON.stringify(m.els.map((e: any) => e.top)) !== JSON.stringify(beforeTops)
  })
  const mD3: any = await client.call('pptx.slide', 0)
  detail.orderBatch = { before: beforeTops, after: mD3.els.map((e: any) => e.top) }
  ok('④ D3 多选 order(back) 全部生效', greenD3, JSON.stringify(detail.orderBatch))
  await view.commands.undo(false) // 还原叠放
  await wait(300)
  // 未选中 → 提示串（空白点击：pointerdown 必须打在舞台画布上 —— target 事件不上溯下渗，
  //  stage 派发进不了 canvas 监听；裸选 .ov-slide-canvas 又会命中缩略图画布（非交互））
  const canvas = document.querySelector('.ov-slide-stage .ov-slide-canvas')
  if (canvas) {
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: 10, clientY: 10, view: window }))
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, buttons: 0, clientX: 10, clientY: 10, view: window }))
  }
  await wait(300)
  const noSel = view.commands.shapeFill('#00ff00')
  detail.noSelMsg = noSel
  ok('④ D4 未选中 shapeFill → 请先选中形状', noSel === '请先选中形状', JSON.stringify(noSel))

  // ===== E 节 anchor 扩范围 =====
  detail.stage = 'E'
  pick(shapes()[3]) // 表格（els[3]，graphicFrame id=13）
  await wait(200)
  view.commands.anchor('ctr')
  await wait(500)
  const tblXml = await partText('ppt/slides/slide1.xml')
  const tcAnchors = (tblXml.match(/<a:tcPr[^>]*anchor="ctr"/g) ?? []).length
  detail.tcAnchors = tcAnchors
  ok('⑤ E1 表格 anchor → 全部 4 个 a:tcPr@anchor=ctr', tcAnchors === 4, `n=${tcAnchors}`)
  pick(shapes()[2]) // 矩形 12（有 txBody 但从未编辑过，旧路径不命中）
  await wait(200)
  view.commands.anchor('b')
  await wait(500)
  const rectXml = await partText('ppt/slides/slide1.xml')
  const bodyB = (rectXml.match(/<a:bodyPr[^>]*anchor="b"/g) ?? []).length
  detail.bodyB = bodyB
  ok('⑤ E2 矩形 anchor → a:bodyPr@anchor=b', bodyB === 1, `n=${bodyB}`)

  // ===== F 节 PptxEditor 字体/段落落盘 =====
  detail.stage = 'F'
  const boxEl = shapes()[0] // 文本框 els[0]（id=10）
  boxEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }))
  const editUp = await until(() => !!document.querySelector('.ov-slide-stage .ov-slide-text-edit'))
  ok('⑥ F1 双击进编辑（编辑层挂载）', editUp)
  const ped = view.editor
  ok('F2 editor.active', !!ped?.active)
  if (editUp && ped) {
    // 选 run1「蓝细14」（段 0 偏移 4..8；run0 红粗28 四字）
    ped.input.restore({ a: { pa: '0', o: 4 }, f: { pa: '0', o: 8 } })
    await wait(150)
    view.commands.setFont('宋体')
    await wait(80)
    view.commands.setSize(20)
    await wait(80)
    view.commands.toggle('u')
    await wait(80)
    view.commands.setColor('#00b050')
    await wait(80)
    view.commands.setAlign('center')
    await wait(80)
    view.commands.setLine(1.5)
    await wait(80)
    view.commands.toggleList('bullet')
    await wait(900) // 防抖 commit + RPC 往返 + adopt
    const xmlF = await partText('ppt/slides/slide1.xml')
    detail.fXml = xmlF.slice(Math.max(0, xmlF.indexOf('<p:cNvPr id="10"')), xmlF.indexOf('<p:cNvPr id="10"') + 1200)
    ok('F3a run 级：a:latin typeface="宋体"', /<a:latin typeface="宋体"/.test(xmlF))
    ok('F3b run 级：sz="2000"', /sz="2000"/.test(xmlF))
    ok('F3c run 级：u="sng"', /u="sng"/.test(xmlF))
    ok('F3d run 级：solidFill 00B050', /<a:srgbClr val="00B050"\/>/.test(xmlF))
    ok('F4a 段级：algn="ctr"', /<a:pPr[^>]*algn="ctr"/.test(xmlF))
    ok('F4b 段级：lnSpc 150%', /<a:lnSpc><a:spcPct val="150000"\/><\/a:lnSpc>/.test(xmlF))
    ok('F4c 段级：buChar •', /<a:buChar char="•"\/>/.test(xmlF))
    ok('F5 逐 run 保真：run0 仍 sz=2800 b=1 红', /sz="2800" b="1"/.test(xmlF) && /FF0000/.test(xmlF))
    ped.input.restore({ a: { pa: '0', o: 8 }, f: { pa: '0', o: 8 } }) // 折叠选区退出前复位
    await wait(100)

    // Esc = discard（防抖窗内 Esc → 不写盘）
    const xmlBefore = await partText('ppt/slides/slide1.xml')
    boxEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }))
    await until(() => !!document.querySelector('.ov-slide-stage .ov-slide-text-edit'))
    ped.input.restore({ a: { pa: '0', o: 0 }, f: { pa: '0', o: 4 } })
    await wait(100)
    view.commands.toggle('i')
    await wait(100) // 仍在 400ms 防抖窗内
    document.querySelector('.ov-slide-stage .ov-slide-text-edit')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await wait(600) // 若在逃 timer 放行，等它落盘后再比对
    ok('F6a Esc 卸载编辑层', !document.querySelector('.ov-slide-stage .ov-slide-text-edit'))
    const xmlAfterEsc = await partText('ppt/slides/slide1.xml')
    ok('⑥ F6b Esc 丢弃未提交改动（part 逐字不变）', xmlAfterEsc === xmlBefore, `len ${xmlBefore.length}→${xmlAfterEsc.length}`)

    // ⌘Enter = stop → 立即提交
    boxEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }))
    await until(() => !!document.querySelector('.ov-slide-stage .ov-slide-text-edit'))
    ped.input.restore({ a: { pa: '0', o: 0 }, f: { pa: '0', o: 4 } })
    await wait(100)
    view.commands.toggle('i')
    await wait(50)
    document.querySelector('.ov-slide-stage .ov-slide-text-edit')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }))
    const greenF7 = await until(async () => /i="1"/.test(await partText('ppt/slides/slide1.xml')))
    ok('⑥ F7 ⌘Enter 提交退出（run0 i="1" 落盘 + 层卸载）', greenF7 && !document.querySelector('.ov-slide-stage .ov-slide-text-edit'), `i1=${greenF7}`)
  }

  // ===== G 节 组内子形状精确命中（oid 通道） =====
  detail.stage = 'G'
  /** 限定子串：从 cNvPr@id 到最近的 </p:sp>（语义变更断言必锁范围——x20/x23/x25 教训） */
  const seg = (xml: string, id: number) => {
    const s = xml.indexOf(`<p:cNvPr id="${id}"`)
    const e = xml.indexOf('</p:sp>', s)
    return s >= 0 && e > s ? xml.slice(s, e + 7) : ''
  }
  // els 顺序 = [10,11,12,13,31,32]（walk 文档序；组 30 展平为子 31/32）
  const mG0: any = await client.call('pptx.slide', 0)
  detail.gOid = mG0.els.map((e: any) => ({ top: e.top, oid: e.oid, sid: e.sid }))
  ok('G0a 组内子形状 oid=自身 id、top=组 id', mG0.els[4]?.oid === 31 && mG0.els[4]?.top === 30 && mG0.els[5]?.oid === 32 && mG0.els[5]?.top === 30,
    JSON.stringify(detail.gOid))
  ok('G0b 顶层形状 oid===top', mG0.els[0]?.oid === 10 && mG0.els[0]?.top === 10, JSON.stringify((detail.gOid as any[])[0]))
  ok('G0c 组内文本形状 sid 仍在（setText 通道不回归）', mG0.els[4]?.sid === 31, `sid=${mG0.els[4]?.sid}`)

  // G1 组内矩形 fill：视图命令发 ownId=32 → 内核 findById 下钻命中
  pick(shapes()[5]) // GR32
  await wait(200)
  view.commands.shapeFill('#ff0000')
  const greenG1 = await until(async () => {
    const x = await partText('ppt/slides/slide1.xml')
    const s32 = seg(x, 32)
    return s32.includes('val="FF0000"') && !s32.includes('70AD47')
  })
  ok('⑦ G1 组内矩形 shapeFill 落自身 spPr（非静默无操作）', greenG1, seg(await partText('ppt/slides/slide1.xml'), 32).slice(0, 200))

  // G2 组内文本框 anchor：ownId=31 → bodyPr@anchor
  pick(shapes()[4]) // GT31
  await wait(200)
  view.commands.anchor('ctr')
  await wait(500)
  const seg31 = seg(await partText('ppt/slides/slide1.xml'), 31)
  ok('⑦ G2 组内文本框 anchor → 自身 a:bodyPr@anchor=ctr', /<a:bodyPr[^>]*anchor="ctr"/.test(seg31), seg31.slice(0, 160))

  // G3 内核直连 shapeText（视图无该命令入口；p5 同款通道）：top=31 命中组内子形状
  await client.call('pptx.shapes', 0, [{ op: 'shapeText', top: 31, lines: ['组内改写', '第二行'] }])
  await wait(400)
  const xG3 = await partText('ppt/slides/slide1.xml')
  const s31b = seg(xG3, 31)
  ok('G3a 组内 shapeText 写自身 txBody', s31b.includes('>组内改写<') && s31b.includes('>第二行<'), s31b.slice(0, 200))
  ok('G3b shapeText 沿用原 rPr（sz=2800 保真）', /sz="2800"/.test(s31b), s31b.slice(0, 240))

  // G4 动画：view.commands.shapeAnim 发 ownId=31 → p:spTgt spid="31"
  view.commands.shapeAnim('appear')
  await wait(500)
  const xG4 = await partText('ppt/slides/slide1.xml')
  ok('⑦ G4 组内子形状动画 spid=自身 id', /<p:spTgt spid="31"\/>/.test(xG4), 'spid=31 未落盘')

  // G5 结构 op 保护：delete top=31（子 id）不得误删组内子形状；top=30（组 id）删整组
  const mG5a: any = await client.call('pptx.shapes', 0, [{ op: 'delete', top: 31 }])
  ok('⑦ G5a 结构 op 不下钻：delete 子 id → 组与子形状俱在（6 els）', mG5a.els.length === 6, `n=${mG5a.els.length}`)
  const mG5b: any = await client.call('pptx.shapes', 0, [{ op: 'delete', top: 30 }])
  ok('G5b delete 组 id → 整组消失（4 els）', mG5b.els.length === 4, `n=${mG5b.els.length}`)
  await view.commands.undo(false)
  await wait(400)
  ok('⑦ G5c undo 整组删除 → 6 els 复原（内核直连与视图 undo 栈互通）', shapes().length === 6, `n=${shapes().length}`)

  await wait(400) // 在途 RPC 结算（x29/x30 教训）
  client.destroy()
  st.ready = false
  return { ok: errs.length === 0, errors: errs, detail }
}

let cached: Promise<Record<string, unknown>> | null = null
function result(): Promise<Record<string, unknown>> {
  if (!cached) cached = Promise.race([
    run().catch((e) => ({ ok: false, errors: [`threw: ${String(e)} @ ${String(detail.stage ?? '')} ${(e as Error)?.stack?.split('\n').slice(1, 4).join(' | ') ?? ''}`], detail })),
    wait(240000).then(() => ({ ok: false, errors: [`TIMEOUT @ ${String(detail.stage ?? '')}`], detail }))
  ])
  return cached
}

registerSmokeMode('x34', () => {
  ;(window as any).__smoke.x34 = { result }
  return () => {
    if (st.ready && st.client)
      return h('div', { style: 'height:100vh' }, [
        h(OfficeSlideView, { ref: (el: any) => ((window as any).__smoke.x34View = el), client: st.client, editable: true, info: st.client.info })
      ])
    return h('div', { style: 'width:100%;height:100%' }, 'x34 PPT 域语义回归门')
  }
})
