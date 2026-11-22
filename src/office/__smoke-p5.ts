/**
 * 第五批 PPT 用户报障探针（?mode=p5）：
 *  问题 5 —— 形状文本双击就地编辑写回 p:txBody（ShapeOp shapeText，editSlide 记 undo）+ xfrm 拖动 +
 *            undo 回退 + a:t 转义 + save→重开一致；
 *  问题 2 —— 在真实 OfficeSlideView 上验证缩略图右键复用 pptMenu、复制幻灯片落盘。
 * 结果挂 window.__smoke.p5Result（稳定键，不在模块求值期触碰 mode 对象）；
 * 视图操作辅助挂 p5View / p5Ops / p5Save / p5Reopen。
 */
import { h, reactive, ref } from 'vue'
import OfficeSlideView from './components/OfficeSlideView.vue'
import { registerSmokeMode } from './smoke-modes'

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const SLIDE_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

function textShape(id: number, text: string, y: number): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="TextBox ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="1000000" y="${y}"/><a:ext cx="3000000" cy="800000"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" rtlCol="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/>` +
    `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${text}</a:t></a:r><a:endParaRPr lang="en-US" dirty="0"/></a:p>` +
    `</p:txBody></p:sp>`
  )
}

function slideXml(text: string, y: number): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}">` +
    `<p:cSld><p:spTree>${grp}${textShape(2, text, y)}</p:spTree></p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  )
}

function buildParts(): Map<string, string> {
  const slideRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`
  return new Map<string, string>([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`],
    ['ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId4"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${RNS}/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="${RNS}/theme" Target="theme/theme1.xml"/><Relationship Id="rId4" Type="${RNS}/slide" Target="slides/slide2.xml"/></Relationships>`],
    ['ppt/slides/slide1.xml', slideXml('原始文字', 1000000)],
    ['ppt/slides/slide2.xml', slideXml('第二页文字', 1200000)],
    ['ppt/slides/_rels/slide1.xml.rels', slideRels],
    ['ppt/slides/_rels/slide2.xml.rels', slideRels],
    ['ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`],
    ['ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:cSld name="Master"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${RNS}/theme" Target="../theme/theme1.xml"/></Relationships>`],
    ['ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="${A}" name="Test"><a:themeElements><a:clrScheme name="Test"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Test"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="Test"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`],
  ])
}

/** 视图层状态（真实 Engine 客户端），就绪后渲染真实 OfficeSlideView */
const view = reactive({ ready: false, client: null as any, info: null as any })
const viewHost = ref<any>(null)

async function p5Probe(R: any): Promise<void> {
  const { writeZip } = await import('./core/zipwrite')
  const { Engine } = await import('./core/worker/engine')
  const blob: Blob = await writeZip(buildParts() as any)

  const shapeOf = (s: any) => (s?.els ?? []).find((e: any) => e.t === 'shape')
  const textOf = (s: any) => {
    const t = shapeOf(s)?.text
    return t ? t.paras.map((p: any) => p.runs.map((r: any) => r.text).join('')).join('\n') : ''
  }
  const partText = async (e: any, p: string) => {
    try { return await ((await e.call('part', [p])) as Blob).text() } catch { return '' }
  }

  // ---------------- 内核：shapeText 写回 / xfrm 拖动 / undo / 转义 / 重开 ----------------
  const e1 = new Engine(() => {})
  await e1.open(blob, { name: 'p5-kernel.pptx' })
  const s0: any = await e1.call('pptx.slide', [0])
  const sh0 = shapeOf(s0)
  const top = sh0.top
  const initial = { top, text: textOf(s0), x: sh0.box.x, y: sh0.box.y }
  R.initial = initial

  const lines = ['改写&<文本>', '第二行']
  const s1: any = await e1.call('pptx.shapes', [0, [{ op: 'shapeText', top, lines }]])
  R.afterWrite = { text: textOf(s1) }

  const moved = { ...sh0.box, x: sh0.box.x + 50, y: sh0.box.y + 30 }
  await e1.call('pptx.shapes', [0, [{ op: 'xfrm', top, box: moved }]])
  const sm: any = await e1.call('pptx.slide', [0])
  R.afterMove = { x: shapeOf(sm).box.x, y: shapeOf(sm).box.y }

  const u1: any = await e1.call('pptx.undo', [false])
  R.undo1 = { text: textOf(u1?.model), x: shapeOf(u1?.model)?.box?.x, y: shapeOf(u1?.model)?.box?.y }
  const u2: any = await e1.call('pptx.undo', [false])
  R.undo2 = { text: textOf(u2?.model) }
  const rd1: any = await e1.call('pptx.undo', [true])
  R.redo1 = { text: textOf(rd1?.model) }
  const rd2: any = await e1.call('pptx.undo', [true])
  R.redo2 = { x: shapeOf(rd2?.model)?.box?.x, y: shapeOf(rd2?.model)?.box?.y }

  const out = (await e1.call('save', [])) as Blob
  R.savedSize = out.size
  ;(window as any).__smoke.p5KernelBytes = Array.from(new Uint8Array(await out.arrayBuffer()))
  const e2 = new Engine(() => {})
  await e2.open(new Blob([await out.arrayBuffer()], { type: SLIDE_MIME }), { name: 'p5-kernel-out.pptx' })
  const s2: any = await e2.call('pptx.slide', [0])
  R.re = { text: textOf(s2), x: shapeOf(s2)?.box?.x, y: shapeOf(s2)?.box?.y }
  const sx = await partText(e2, 'ppt/slides/slide1.xml')
  R.xml = {
    escaped: sx.includes('改写&amp;&lt;文本&gt;') && sx.includes('第二行'),
    twoParas: (sx.match(/<a:p>/g) || []).length >= 2,
    offMoved: sx.includes(`x="${Math.round(moved.x * 9525)}"`) && sx.includes(`y="${Math.round(moved.y * 9525)}"`),
  }

  // ---------------- 视图：真实 Engine 客户端挂 OfficeSlideView（问题 2 菜单 / 问题 5 交互） ----------------
  const ops: any[] = []
  ;(window as any).__smoke.p5Ops = ops
  const e3 = new Engine(() => {})
  const opened: any = await e3.open(blob, { name: 'p5-view.pptx' })
  view.client = {
    call: (m: string, ...args: any[]) => {
      if (m === 'pptx.shapes') ops.push(...(args[1] ?? []))
      return (e3 as any).call(m, args)
    },
    on: () => () => {},
    mediaUrl: (p: string) => (e3 as any).call('part', [p]).then((b: Blob) => URL.createObjectURL(b)),
  } as any
  view.info = { pptx: opened.pptx }
  const saveBytes = async () => {
    const b = await (e3 as any).call('save', [])
    return Array.from(new Uint8Array(await b.arrayBuffer()))
  }
  ;(window as any).__smoke.p5View = viewHost
  ;(window as any).__smoke.p5Save = saveBytes
  ;(window as any).__smoke.p5Reopen = async () => {
    const b = await (e3 as any).call('save', [])
    const e4 = new Engine(() => {})
    const o4: any = await e4.open(new Blob([await b.arrayBuffer()], { type: SLIDE_MIME }), { name: 'p5-re.pptx' })
    const m: any = await e4.call('pptx.slide', [0])
    const sh = shapeOf(m)
    const xml = await partText(e4, 'ppt/slides/slide1.xml')
    return { count: o4.pptx?.count ?? null, text: textOf(m), x: sh?.box?.x, y: sh?.box?.y, xml }
  }
  view.ready = true
  R.done = true
}

let kicked = false
registerSmokeMode('p5', function p5View() {
  const win = window as any
  if (!win.__smoke) win.__smoke = {}
  if (!win.__smoke.p5Result) win.__smoke.p5Result = {}
  const R = win.__smoke.p5Result
  const state = reactive({ done: false, summary: 'running' })
  if (!kicked) {
    kicked = true
    void p5Probe(R).then(
      () => { state.done = true; state.summary = JSON.stringify(R) },
      (e) => { R.error = String((e as Error).stack || e); state.done = true; state.summary = JSON.stringify(R) },
    )
  }
  return () => view.ready && view.client
    ? h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [
        h('div', { id: 'p5-status' }, state.done ? 'DONE' : 'RUNNING'),
        h(OfficeSlideView, { ref: viewHost, client: view.client, editable: true, info: view.info }),
      ])
    : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, [
        h('div', { id: 'p5-status' }, state.done ? 'DONE' : 'RUNNING'),
        h('pre', { id: 'p5-result' }, state.summary),
      ])
})
