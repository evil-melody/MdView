/**
 * 第八批 PPT 用户报障探针（?mode=p8）：
 *  问题 2 —— 缩略图 pointer 拖拽重排（DOM 顺序 + 落盘顺序 + click/右键不破坏）；
 *  问题 4 —— 剪贴板图片粘贴 / 菜单插入图片（ppt/media part + rels + a:blip，save→重开可见）；
 *  问题 3 —— 表格按钮审计（PPT ribbon 无表格按钮，右键菜单 tblRow/tblCol 可用）。
 * 结果挂 window.__smoke.p8Result；视图操作辅助挂 p8View / p8Save / p8Reopen / p8State。
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

function textShape(id: number, text: string): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="TextBox ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="1000000" y="1000000"/><a:ext cx="4000000" cy="1000000"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" rtlCol="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/>` +
    `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${text}</a:t></a:r><a:endParaRPr lang="en-US" dirty="0"/></a:p>` +
    `</p:txBody></p:sp>`
  )
}

function slideXml(text: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}">` +
    `<p:cSld><p:spTree>${grp}${textShape(2, text)}</p:spTree></p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  )
}

const SLIDE_TEXTS = ['第一页', '第二页', '第三页']

function buildParts(): Map<string, string> {
  const slideRels = (n: number) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`
  const sldIds = SLIDE_TEXTS.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${2 + i * 2}"/>`).join('')
  const pRels = [
    `<Relationship Id="rId1" Type="${RNS}/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
    ...SLIDE_TEXTS.map((_, i) => `<Relationship Id="rId${2 + i * 2}" Type="${RNS}/slide" Target="slides/slide${i + 1}.xml"/>`),
    `<Relationship Id="rId${2 + SLIDE_TEXTS.length * 2}" Type="${RNS}/theme" Target="theme/theme1.xml"/>`,
  ].join('')
  const overrides = [
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`,
    ...SLIDE_TEXTS.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`),
    `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`,
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`,
    `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`,
  ].join('')
  const parts = new Map<string, string>([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`],
    ['ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${sldIds}</p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}">${pRels}</Relationships>`],
    ['ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`],
    ['ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:cSld name="Master"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${RNS}/theme" Target="../theme/theme1.xml"/></Relationships>`],
    ['ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="${A}" name="Test"><a:themeElements><a:clrScheme name="Test"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Test"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="Test"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`],
  ])
  SLIDE_TEXTS.forEach((t, i) => {
    parts.set(`ppt/slides/slide${i + 1}.xml`, slideXml(t))
    parts.set(`ppt/slides/_rels/slide${i + 1}.xml.rels`, slideRels(i + 1))
  })
  return parts
}

/** 1×1 透明 PNG（合法 PNG bytes，落 media part 用） */
const PNG1 = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
  31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255,
  137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
])

const view = reactive({ ready: false, client: null as any, info: null as any })
const viewHost = ref<any>(null)
let engineRef: any = null

function textsOf(s: any): string[] {
  return (s?.els ?? []).filter((e: any) => e.t === 'shape').map((e: any) => {
    const t = e.text?.paras?.map((p: any) => p.runs.map((r: any) => r.text).join('')).join('')
    return t ?? ''
  })
}
async function partText(e: any, p: string): Promise<string> {
  try { return await ((await e.call('part', [p])) as Blob).text() } catch { return '' }
}

async function p8Probe(R: any): Promise<void> {
  const { writeZip } = await import('./core/zipwrite')
  const { Engine } = await import('./core/worker/engine')
  const blob: Blob = await writeZip(buildParts() as any)

  // ---------- 内核：pptx.slides move 重排 ----------
  const e1 = new Engine(() => {})
  await e1.open(blob, { name: 'p8-kernel-move.pptx' })
  const m0: any = await e1.call('pptx.slide', [0])
  R.beforeOrder = textsOf(m0)
  const meta1: any = await e1.call('pptx.slides', [{ op: 'move', from: 0, to: 2 }])
  R.afterMetaCount = meta1.count
  const order: string[] = []
  for (let i = 0; i < meta1.count; i++) order.push(textsOf(await e1.call('pptx.slide', [i]))[0] ?? '')
  R.afterOrder = order
  // no-op 边界：拖到自己原位
  const metaNoop: any = await e1.call('pptx.slides', [{ op: 'move', from: 1, to: 1 }])
  R.noopSame = metaNoop.count === meta1.count && textsOf(await e1.call('pptx.slide', [1]))[0] === order[1]
  const outMove = (await e1.call('save', [])) as Blob
  const e1r = new Engine(() => {})
  await e1r.open(new Blob([await outMove.arrayBuffer()], { type: SLIDE_MIME }), { name: 'p8-move-re.pptx' })
  const reOrder: string[] = []
  const rm: any = await e1r.call('pptx.slide', [0])
  void rm
  const rmeta: any = { count: 3 }
  for (let i = 0; i < rmeta.count; i++) reOrder.push(textsOf(await e1r.call('pptx.slide', [i]))[0] ?? '')
  R.reopenOrder = reOrder

  // ---------- 内核：pptx.image + insert 图片落盘 ----------
  const e2 = new Engine(() => {})
  await e2.open(blob, { name: 'p8-kernel-image.pptx' })
  const rid = (await e2.call('pptx.image', [0, PNG1.buffer, 'png'])) as string
  R.rid = rid
  const im: any = await e2.call('pptx.shapes', [0, [{ op: 'insert', kind: 'image', box: { x: 100, y: 100, w: 200, h: 200 }, rid }]])
  R.picCount = (im?.els ?? []).filter((el: any) => el.t === 'pic').length
  R.picTarget = (im?.els ?? []).find((el: any) => el.t === 'pic')?.target ?? null
  const outImg = (await e2.call('save', [])) as Blob
  R.imgSavedSize = outImg.size
  ;(window as any).__smoke.p8ImgBytes = Array.from(new Uint8Array(await outImg.arrayBuffer()))
  const e2r = new Engine(() => {})
  await e2r.open(new Blob([await outImg.arrayBuffer()], { type: SLIDE_MIME }), { name: 'p8-image-re.pptx' })
  const rmi: any = await e2r.call('pptx.slide', [0])
  R.reopenPicCount = (rmi?.els ?? []).filter((el: any) => el.t === 'pic').length
  const s1xml = await partText(e2r, 'ppt/slides/slide1.xml')
  const s1rels = await partText(e2r, 'ppt/slides/_rels/slide1.xml.rels')
  R.xml = {
    blip: /<a:blip[^>]*r:embed="rId\d+"/.test(s1xml),
    mediaRel: /relationships\/image/.test(s1rels) && /ppt\/media|media\/image/.test(s1rels),
    picTag: /<p:pic>/.test(s1xml),
  }

  // ---------- 视图：真实 Engine 客户端挂 OfficeSlideView ----------
  const e3 = new Engine(() => {})
  engineRef = e3
  const opened: any = await e3.open(blob, { name: 'p8-view.pptx' })
  view.client = {
    call: (m: string, ...args: any[]) => (e3 as any).call(m, args),
    on: () => () => {},
    mediaUrl: (p: string) => (e3 as any).call('part', [p]).then((b: Blob) => URL.createObjectURL(b)),
  } as any
  view.info = { pptx: opened.pptx }
  const saveBytes = async () => Array.from(new Uint8Array(await (await (e3 as any).call('save', [])).arrayBuffer()))
  ;(window as any).__smoke.p8View = viewHost
  ;(window as any).__smoke.p8Save = saveBytes
  ;(window as any).__smoke.p8ImgBytesProbe = PNG1
  ;(window as any).__smoke.p8Reopen = async () => {
    const b = await (e3 as any).call('save', [])
    const e4 = new Engine(() => {})
    const o4: any = await e4.open(new Blob([await b.arrayBuffer()], { type: SLIDE_MIME }), { name: 'p8-re.pptx' })
    const order4: string[] = []
    const meta4: any = o4.pptx
    for (let i = 0; i < (meta4?.count ?? 0); i++) order4.push(textsOf(await e4.call('pptx.slide', [i]))[0] ?? '')
    const picOn0 = ((await e4.call('pptx.slide', [0])) as any).els.filter((el: any) => el.t === 'pic').length
    return { count: meta4?.count, order: order4, picOn0 }
  }
  view.ready = true
  R.done = true
}

let kicked = false
registerSmokeMode('p8', function p8View() {
  const win = window as any
  if (!win.__smoke) win.__smoke = {}
  if (!win.__smoke.p8Result) win.__smoke.p8Result = {}
  const R = win.__smoke.p8Result
  const state = reactive({ done: false, summary: 'running' })
  if (!kicked) {
    kicked = true
    void p8Probe(R).then(
      () => { state.done = true; state.summary = JSON.stringify(R) },
      (e) => { R.error = String((e as Error).stack || e); state.done = true; state.summary = JSON.stringify(R) },
    )
  }
  return () => view.ready && view.client
    ? h('div', {}, [
        h('div', { id: 'p8-status' }, state.done ? 'DONE' : 'RUNNING'),
        h(OfficeSlideView, { ref: viewHost, client: view.client, editable: true, info: view.info }),
      ])
    : h('div', {}, [
        h('div', { id: 'p8-status' }, state.done ? 'DONE' : 'RUNNING'),
        h('pre', { id: 'p8-result' }, state.summary),
      ])
})
