/**
 * 第九批 PPT 原生图表数据编辑探针（?mode=p9）：
 *  - 内核：解析 chart part（bar/line/pie 降级矩阵）、chartData 写回缓存 + c:f 源工作簿单元格、
 *          save→重开一致、undo 回退；
 *  - 视图：真实 OfficeSlideView 渲染图表 SVG，双击打开数据面板改数值，落盘 + 重开一致。
 * 顶层只注册 mode（不碰 window.__smoke）；结果挂 window.__smoke.p9Result。
 */
import { h, reactive, ref } from 'vue'
import OfficeSlideView from './components/OfficeSlideView.vue'
import { registerSmokeMode } from './smoke-modes'

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const C = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const SLIDE_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

/** 嵌入工作簿：Sheet1 的 A2:A4 = 分类甲/乙/丙；B2:B4 = 系列1；C2:C4 = 系列2 */
function makeBookParts(): Map<string, string> {
  const sheet =
    `${DECL}<worksheet xmlns="${XMAIN}"><sheetData>` +
    `<row r="1"><c r="A1" t="inlineStr"><is><t>类别</t></is></c><c r="B1" t="inlineStr"><is><t>系列1</t></is></c><c r="C1" t="inlineStr"><is><t>系列2</t></is></c></row>` +
    `<row r="2"><c r="A2" t="inlineStr"><is><t>甲</t></is></c><c r="B2"><v>10</v></c><c r="C2"><v>20</v></c></row>` +
    `<row r="3"><c r="A3" t="inlineStr"><is><t>乙</t></is></c><c r="B3"><v>20</v></c><c r="C3"><v>30</v></c></row>` +
    `<row r="4"><c r="A4" t="inlineStr"><is><t>丙</t></is></c><c r="B4"><v>30</v></c><c r="C4"><v>40</v></c></row>` +
    `</sheetData></worksheet>`
  return new Map<string, string>([
    ['[Content_Types].xml', `${DECL}<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ['_rels/.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${DECL}<workbook xmlns="${XMAIN}" xmlns:r="${RNS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', sheet],
  ])
}

const CATS = ['甲', '乙', '丙']
const V1 = [10, 20, 30]
const V2 = [20, 30, 40]

function pts(vals: (string | number)[]): string {
  return `<c:ptCount val="${vals.length}"/>` + vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')
}
function ser(idx: number, name: string, nameRef: string, catCol: string, valCol: string, vals: number[]): string {
  return (
    `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>` +
    `<c:tx><c:strRef><c:f>${nameRef}</c:f><c:strCache>${pts([name])}</c:strCache></c:strRef></c:tx>` +
    `<c:cat><c:strRef><c:f>Sheet1!$${catCol}$2:$${catCol}$4</c:f><c:strCache>${pts(CATS)}</c:strCache></c:strRef></c:cat>` +
    `<c:val><c:numRef><c:f>Sheet1!$${valCol}$2:$${valCol}$4</c:f><c:numCache><c:formatCode>General</c:formatCode>${pts(vals)}</c:numCache></c:numRef></c:val>` +
    `</c:ser>`
  )
}

function chartXml(): string {
  return (
    `${DECL}<c:chartSpace xmlns:c="${C}" xmlns:a="${A}" xmlns:r="${RNS}"><c:chart><c:plotArea><c:layout/>` +
    `<c:barChart><c:barDir val="col"/>${ser(0, '系列1', 'Sheet1!$B$1', 'A', 'B', V1)}${ser(1, '系列2', 'Sheet1!$C$1', 'A', 'C', V2)}</c:barChart>` +
    `<c:catAx><c:axId val="1"/><c:title><c:tx><c:rich><a:p><a:r><a:t>类别轴</a:t></a:r></a:p></c:rich></c:tx></c:title></c:catAx>` +
    `<c:valAx><c:axId val="2"/><c:title><c:tx><c:rich><a:p><a:r><a:t>数值轴</a:t></a:r></a:p></c:rich></c:tx></c:title></c:valAx>` +
    `</c:plotArea></c:chart></c:chartSpace>`
  )
}

function slideXml(): string {
  const frame =
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="图表 3"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="800000" y="600000"/><a:ext cx="6000000" cy="3600000"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="${C}"><c:chart r:id="rId2"/></a:graphicData></a:graphic></p:graphicFrame>`
  return (
    `${DECL}<p:sld xmlns:a="${A}" xmlns:c="${C}" xmlns:r="${RNS}" xmlns:p="${P}"><p:cSld><p:spTree>${grp}${frame}</p:spTree></p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  )
}

async function buildPptx(): Promise<Blob> {
  const { writeZip } = await import('./core/zipwrite')
  const book: Blob = await writeZip(makeBookParts() as any)
  const bookBytes = new Uint8Array(await book.arrayBuffer())
  const overrides = [
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`,
    `<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`,
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`,
    `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`,
    `<Override PartName="/ppt/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`,
    `<Override PartName="/ppt/embeddings/data1.xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>`,
  ].join('')
  const parts = new Map<string, any>([
    ['[Content_Types].xml', `${DECL}<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides}</Types>`],
    ['_rels/.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`],
    ['ppt/presentation.xml', `${DECL}<p:presentation xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${RNS}/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="${RNS}/theme" Target="theme/theme1.xml"/></Relationships>`],
    ['ppt/slides/slide1.xml', slideXml()],
    ['ppt/slides/_rels/slide1.xml.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${RNS}/chart" Target="../charts/chart1.xml"/></Relationships>`],
    ['ppt/slideLayouts/slideLayout1.xml', `${DECL}<p:sldLayout xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`],
    ['ppt/slideMasters/slideMaster1.xml', `${DECL}<p:sldMaster xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:cSld name="Master"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${RNS}/theme" Target="../theme/theme1.xml"/></Relationships>`],
    ['ppt/theme/theme1.xml', `${DECL}<a:theme xmlns:a="${A}" name="Test"><a:themeElements><a:clrScheme name="Test"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Test"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="Test"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`],
    ['ppt/charts/chart1.xml', chartXml()],
    ['ppt/charts/_rels/chart1.xml.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/package" Target="../embeddings/data1.xlsx"/></Relationships>`],
    ['ppt/embeddings/data1.xlsx', bookBytes],
  ])
  return writeZip(parts as any)
}

function chartOf(model: any): any {
  return (model?.els ?? []).find((e: any) => e.t === 'chart')
}
async function partText(e: any, path: string): Promise<string> {
  try { return await ((await e.call('part', [path])) as Blob).text() } catch { return '' }
}
async function bookXml(e: any): Promise<string> {
  try {
    const { ZipArchive } = await import('./core/zip')
    const { BufferSource } = await import('./core/source')
    const bytes = new Uint8Array(await ((await e.call('part', ['ppt/embeddings/data1.xlsx'])) as Blob).arrayBuffer())
    const zip = await ZipArchive.open(new BufferSource(bytes))
    return await zip.text('xl/worksheets/sheet1.xml')
  } catch {
    return ''
  }
}
/** 从工作表 XML 里取某单元格的 <v> 文本 */
function cellVal(sheetXml: string, ref: string): string {
  const m = new RegExp(`<c r="${ref}"[^>]*>\\s*<v>([^<]*)</v>`).exec(sheetXml)
  return m ? m[1] : ''
}

const view = reactive({ ready: false, client: null as any, info: null as any })
const viewHost = ref<any>(null)
let viewEngine: any = null

async function p9Probe(R: any): Promise<void> {
  const blob = await buildPptx()
  const { Engine } = await import('./core/worker/engine')

  // ---------- 内核：解析 ----------
  const e1 = new Engine(() => {})
  await e1.open(blob, { name: 'p9-kernel.pptx' })
  const m0: any = await e1.call('pptx.slide', [0])
  const c0 = chartOf(m0)
  R.parsed = {
    found: !!c0,
    type: c0?.data?.type,
    series: c0?.data?.series?.length,
    cats: c0?.data?.series?.[0]?.cat?.values,
    v1: c0?.data?.series?.[0]?.val?.values,
    v2: c0?.data?.series?.[1]?.val?.values,
    names: c0?.data?.series?.map((s: any) => s.name),
    catTitle: c0?.data?.catAxisTitle,
    valTitle: c0?.data?.valAxisTitle,
    catRef: c0?.data?.series?.[0]?.cat?.ref,
    valRef: c0?.data?.series?.[0]?.val?.ref,
  }

  // ---------- 内核：chartData 写回 ----------
  const data1 = JSON.parse(JSON.stringify(c0.data))
  data1.series[0].val.values[0] = 99
  data1.series[1].cat.values[2] = '丙改'
  const after: any = await e1.call('pptx.shapes', [0, [{ op: 'chartData', top: c0.top, data: data1 }]])
  const cAfter = chartOf(after)
  R.writeback = {
    v1: cAfter?.data?.series?.[0]?.val?.values,
    cat3: cAfter?.data?.series?.[1]?.cat?.values?.[2],
  }
  const chartXmlAfter = await partText(e1, 'ppt/charts/chart1.xml')
  const sheetAfter = await bookXml(e1)
  R.persist = {
    chartHas99: /<c:v>99<\/c:v>/.test(chartXmlAfter),
    chartHasCat: /丙改/.test(chartXmlAfter),
    srcB2: cellVal(sheetAfter, 'B2'),
    srcA4: /丙改/.test(sheetAfter),
    sheetXml: sheetAfter,
  }

  // ---------- 内核：save→重开一致 ----------
  const out = (await e1.call('save', [])) as Blob
  const e1r = new Engine(() => {})
  await e1r.open(new Blob([await out.arrayBuffer()], { type: SLIDE_MIME }), { name: 'p9-re.pptx' })
  const cr = chartOf(await e1r.call('pptx.slide', [0]))
  R.reopen = {
    v1: cr?.data?.series?.[0]?.val?.values,
    cat3: cr?.data?.series?.[1]?.cat?.values?.[2],
    srcB2: cellVal(await bookXml(e1r), 'B2'),
  }

  // ---------- 内核：undo 回退 ----------
  const undone: any = await e1.call('pptx.undo', [false])
  const cu = chartOf(undone?.model)
  R.undo = {
    v1: cu?.data?.series?.[0]?.val?.values,
    cat3: cu?.data?.series?.[1]?.cat?.values?.[2],
    srcB2: cellVal(await bookXml(e1), 'B2'),
  }

  // ---------- 视图：真实 Engine + OfficeSlideView ----------
  const e3 = new Engine(() => {})
  viewEngine = e3
  const opened: any = await e3.open(blob, { name: 'p9-view.pptx' })
  view.client = {
    call: (m: string, ...args: any[]) => (e3 as any).call(m, args),
    on: () => () => {},
    mediaUrl: (p: string) => (e3 as any).call('part', [p]).then((b: Blob) => URL.createObjectURL(b)),
  } as any
  view.info = { pptx: opened.pptx }
  ;(window as any).__smoke.p9View = viewHost
  ;(window as any).__smoke.p9Save = async () => Array.from(new Uint8Array(await (await (e3 as any).call('save', [])).arrayBuffer()))
  ;(window as any).__smoke.p9Reopen = async () => {
    const b = await (e3 as any).call('save', [])
    const e4 = new Engine(() => {})
    await e4.open(new Blob([await b.arrayBuffer()], { type: SLIDE_MIME }), { name: 'p9-vre.pptx' })
    const cv = chartOf(await e4.call('pptx.slide', [0]))
    return { v1: cv?.data?.series?.[0]?.val?.values, srcB2: cellVal(await bookXml(e4), 'B2') }
  }
  ;(window as any).__smoke.p9Inspect = async () => {
    const cv = chartOf(await (e3 as any).call('pptx.slide', [0]))
    const xml = await partText(e3, 'ppt/charts/chart1.xml')
    const sheet = await bookXml(e3)
    return {
      v1: cv?.data?.series?.[0]?.val?.values,
      chartHas99: /<c:v>99<\/c:v>/.test(xml),
      srcB2: cellVal(sheet, 'B2'),
    }
  }
  view.ready = true
  R.done = true
}

let kicked = false
registerSmokeMode('p9', function p9View() {
  const win = window as any
  if (!win.__smoke) win.__smoke = {}
  if (!win.__smoke.p9Result) win.__smoke.p9Result = {}
  const R = win.__smoke.p9Result
  const state = reactive({ done: false, summary: 'running' })
  if (!kicked) {
    kicked = true
    void p9Probe(R).then(
      () => { state.done = true; state.summary = JSON.stringify(R) },
      (e) => { R.error = String((e as Error).stack || e); state.done = true; state.summary = JSON.stringify(R) },
    )
  }
  return () => view.ready && view.client
    ? h('div', {}, [
        h('div', { id: 'p9-status' }, state.done ? 'DONE' : 'RUNNING'),
        h(OfficeSlideView, { ref: viewHost, client: view.client, editable: true, info: view.info }),
      ])
    : h('div', {}, [
        h('div', { id: 'p9-status' }, state.done ? 'DONE' : 'RUNNING'),
        h('pre', { id: 'p9-result' }, state.summary),
      ])
})
