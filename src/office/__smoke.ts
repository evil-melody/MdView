import { createApp, h, ref, reactive, nextTick } from 'vue'
import OfficeEngineHost from '../components/OfficeEngineHost.vue'
import OfficeToolbar from './components/OfficeToolbar.vue'
import OfficeSlideView from './components/OfficeSlideView.vue'
import OfficeSheetView from './components/OfficeSheetView.vue'
import OfficeDocView from './components/OfficeDocView.vue'
import CodeEditor from '../components/CodeEditor.vue'
import JsonView from '../components/JsonView.vue'
import PreviewPane from '../components/PreviewPane.vue'
import { Engine } from './core/worker/engine'
import { RIBBON } from './ribbon'
import { transformJson } from '../utils/jsonFormat'
import '../components/JsonView.css'
import '../components/PreviewPane.css'
import { wrap, setWrap } from '../composables/useWrap'
import { parseMarkdown } from '../utils/markdown'
import '../styles/global.css'
import '../components/PreviewPane.css'
import { getSmokeMode } from './smoke-modes'

const host = ref<any>(null)
const errors: string[] = []
const calls: { cmd: string; args: unknown[] }[] = []
;(window as any).__smoke = { host, errors, saved: 0, doc: '', calls, wrap, setWrap, tabTimes: [], jsonTransform: transformJson }
/** 全量 marked.parse 的单次成本：切页签往返原本要付 2 次（大纲 computed 无缓存） */
;(window as any).__smoke.parseCost = (mb: number) => {
  const unit = '这是一段用于测量全量 Markdown 渲染成本的正文，包含 **加粗** 与 `代码`。\n\n'
  const md = '# 标题\n\n' + unit.repeat(Math.ceil((mb * 1024 * 1024) / unit.length)).slice(0, mb * 1024 * 1024)
  const t0 = performance.now()
  parseMarkdown(md)
  return Math.round(performance.now() - t0)
}

window.addEventListener('error', (e) => errors.push(String(e.message)))
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)))

const q = new URLSearchParams(location.search)
/** ?ribbon=xlsx 只挂工具条：验证三格式命令面，无需构造 OOXML 样本 */
const ribbonKind = q.get('ribbon')
const mode = q.get('mode')

function ribbonView() {
  const commands: Record<string, (...a: unknown[]) => unknown> = {}
  for (const tab of RIBBON[ribbonKind!] ?? []) {
    for (const g of tab.groups) {
      for (const it of g.items) {
        const cmd = 'act' in it ? it.act.cmd : 'cmd' in it ? it.cmd : 'key' in it ? it.key : ''
        if (!cmd || cmd === 'unsupported') continue
        commands[cmd] = (...args: unknown[]) => void calls.push({ cmd, args })
      }
    }
  }
  const bar = reactive({
    zoom: 1, gridlines: true, hidden: false, readMode: false, tracking: false, titlePg: false, painter: false,
    sheets: [{ index: 0, name: 'Sheet1' }, { index: 1, name: 'Sheet2' }]
  })
  return () =>
    h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [
      h(OfficeToolbar, { kind: ribbonKind!, editable: true, commands, bar })
    ])
}

function hostView() {
  return () =>
    h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [
      h(
        'button',
        {
          id: 'save',
          style: 'height:28px;flex:0 0 auto',
          onClick: async () => {
            const bytes = await host.value?.save?.()
            ;(window as any).__smoke.saved = bytes?.byteLength ?? 0
            document.title = 'SAVED'
          }
        },
        'SAVE'
      ),
      h(OfficeEngineHost, {
        ref: host,
        path: '/sample.docx',
        name: 'sample.docx',
        editable: true,
        theme: 'dark',
        onError: (m: string) => errors.push(m)
      })
    ])
}

/** 用 stub client 挂 PPT 视图：每页不同文本，验证缩略图按需 RPC 且渲染真实内容。
 *  第 1 页含 bodyPr（内边距 / 居中锚点 / br 软换行 / 行距）与非矩形几何，覆盖文字叠压回归。
 *  v32 扩展：首页备注 + 形状入场动画（播放按钮），pptx.notes RPC 记录写回。 */
function slideView() {
  const body = (i: number, rich = false) => ({
    anchor: 'ctr' as const,
    ins: rich ? [18, 12, 18, 12] as [number, number, number, number] : [7.2, 3.6, 7.2, 3.6] as [number, number, number, number],
    wrap: true,
    paras: rich
      ? [
          { algn: 'ctr' as const, marL: 0, indent: 0, lnPct: 1, spcBef: 0, spcAft: 0, endSz: 20, runs: [{ text: '产品核心：', sz: 20, color: '#ffffff' }, { text: '', sz: 20, br: true }, { text: '第二行不应该叠在第一行', sz: 20, color: '#ffffff' }] },
        ]
      : [{ algn: 'ctr' as const, marL: 0, indent: 0, lnPct: 1, spcBef: 0, spcAft: 0, endSz: 44, runs: [{ text: `第 ${i + 1} 页`, sz: 44, font: 'PingFang SC' }] }],
  })
  const slides = [0, 1, 2, 3].map((i) => ({
    index: i, w: 960, h: 720,
    notes: i === 0 ? '首页演讲者备注' : '',
    els: i === 0
      ? [
          { t: 'shape', geom: 'rect', box: { x: 80, y: 120, w: 800, h: 160 }, fill: { t: 'solid', c: '#12a3a6' }, text: body(0, true) },
          { t: 'shape', geom: 'roundRect', box: { x: 80, y: 360, w: 200, h: 120 }, fill: { t: 'solid', c: '#0f8f92' }, text: body(0), anim: 'fade' },
        ]
      : i === 1
        ? [
            { t: 'shape', geom: 'rect', box: { x: 120, y: 250, w: 720, h: 140 }, fill: { t: 'solid', c: '#ffffff' }, text: body(i) },
            // SmartArt 降级渲染断言：3 节点 + 2 条父子连线
            {
              t: 'smartart', box: { x: 330, y: 420, w: 300, h: 200 },
              nodes: [
                { id: 'n1', text: '中心主题', x: 440, y: 430, w: 90, h: 34 },
                { id: 'n2', text: '子项一', x: 340, y: 520, w: 90, h: 34 },
                { id: 'n3', text: '子项二', x: 540, y: 520, w: 90, h: 34 },
              ],
              links: [['n1', 'n2'], ['n1', 'n3']],
            },
          ]
        : [
            { t: 'shape', geom: 'rect', box: { x: 120, y: 250, w: 720, h: 140 }, fill: { t: 'solid', c: '#ffffff' }, text: body(i) },
          ],
  }))
  const slideCalls: number[] = []
  const shapeOps: Record<string, unknown>[] = []
  const notesCalls: { index: number; text: string }[] = []
  const client = { call: async (m: string, i: number, ops?: Record<string, unknown>[]) => {
    if (m === 'pptx.slide') { slideCalls.push(i); return slides[i] ?? slides[0] }
    if (m === 'pptx.shapes') { shapeOps.push(...(ops ?? [])); return slides[i] ?? slides[0] }
    if (m === 'pptx.notes') { notesCalls.push({ index: i, text: String(ops) }); slides[i].notes = String(ops); return slides[i] }
    return null
  } } as any
  ;(window as any).__smoke.slideCalls = slideCalls
  ;(window as any).__smoke.shapeOps = shapeOps
  ;(window as any).__smoke.notesCalls = notesCalls
  const info = { pptx: { w: 960, h: 720, count: 4, slides: slides.map((s) => ({ index: s.index, path: `slide${s.index}.xml`, hidden: false })) } } as any
  const slideHost = ref<any>(null)
  ;(window as any).__smoke.setSlideView = (v: string) => slideHost.value?.commands.setView(v)
  ;(window as any).__smoke.playAnims = () => slideHost.value?.commands.playAnims()
  /** hidden=1 模拟页签 v-show 常驻：先隐藏挂载，再显示，验证 ResizeObserver 重算缩放 */
  const shown = ref(q.get('hidden') !== '1')
  return () =>
    h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [
      h('button', { id: 'show', style: 'flex:0 0 auto', onClick: () => { shown.value = true } }, 'SHOW'),
      h(
        'div',
        { style: { flex: '1 1 auto', minHeight: 0, display: shown.value ? 'flex' : 'none', flexDirection: 'column' } },
        [h(OfficeSlideView, { ref: slideHost, client, editable: true, info })]
      )
    ])
}

/** PPT 旋转 / 主题·母版 全链路冒烟：现场拼最小 pptx（含 theme/master/layout/clrScheme），
 *  内核写真实 OOXML（a:xfrm rot / a:clrScheme / p:bg）→ save → 重开读回一致，
 *  并把重开后的引擎挂给真实 OfficeSlideView，验证旋转手柄可拖 + 主题面板入口。 */
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const SLIDE_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

async function buildProtPptx(): Promise<Blob> {
  const { writeZip } = await import('./core/zipwrite')
  const parts = new Map<string, string>([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slideLayouts/slideLayout2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`],
    ['ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${RNS}/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="${RNS}/theme" Target="theme/theme1.xml"/></Relationships>`],
    ['ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:cSld><p:spTree>${grp}<p:sp><p:nvSpPr><p:cNvPr id="2" name="AccentRect"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="2000000" y="1500000"/><a:ext cx="3000000" cy="2000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`],
    ['ppt/slides/_rels/slide1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`],
    ['ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}" type="title" preserve="1"><p:cSld name="Title"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`],
    ['ppt/slideLayouts/slideLayout2.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`],
    ['ppt/slideLayouts/_rels/slideLayout2.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`],
    ['ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:cSld name="Office Master"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/><p:sldLayoutId id="2147483650" r:id="rId2"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout2.xml"/><Relationship Id="rId3" Type="${RNS}/theme" Target="../theme/theme1.xml"/></Relationships>`],
    ['ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="${A}" name="Test"><a:themeElements><a:clrScheme name="Test"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Test"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="Test"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`],
  ])
  return writeZip(parts as any)
}

const prot = reactive({ ready: false, client: null as any, info: null as any })
const findShape = (s: any) => (s?.els ?? []).find((e: any) => e.t === 'shape')
async function protCheck() {
  const R: any = ((window as any).__smoke.protResult = {})
  try {
    const blob = await buildProtPptx()
    const e1 = new Engine(() => {})
    await e1.open(blob, { name: 'k.pptx' })
    const s0: any = await e1.call('pptx.slide', [0])
    const sh0 = findShape(s0)
    R.initial = { rot: sh0.box.rot ?? null, fill: sh0.fill?.c ?? null, accent1: s0.theme?.colors?.accent1, layout: s0.theme?.layout, masterBg: s0.theme?.master?.bg ?? null, masterName: s0.theme?.master?.name, layouts: s0.theme?.layouts?.length }

    // 旋转写入 → undo → redo
    await e1.call('pptx.shapes', [0, [{ op: 'xfrm', top: sh0.top, box: { ...sh0.box, rot: 30 } }]])
    R.afterRot = findShape(await e1.call('pptx.slide', [0]) as any).box.rot
    const u: any = await e1.call('pptx.undo', [false])
    R.afterUndoRot = u?.model ? (findShape(u.model).box.rot ?? null) : 'null-result'
    const rd: any = await e1.call('pptx.undo', [true])
    R.afterRedoRot = rd?.model ? (findShape(rd.model).box.rot ?? null) : 'null-result'

    // 主题配色写入：即时反映到形状渲染
    await e1.call('pptx.shapes', [0, [{ op: 'themeColor', key: 'accent1', color: '#FF0000' }]])
    const sTheme: any = await e1.call('pptx.slide', [0])
    R.themeAccent1 = sTheme.theme?.colors?.accent1
    R.shapeFillAfterTheme = findShape(sTheme).fill?.c
    // 主题 part 的 undo / redo（非 slide part 路径：需 invalidateTheme 清缓存）
    const tu: any = await e1.call('pptx.undo', [false])
    R.themeUndoAccent1 = tu?.model?.theme?.colors?.accent1
    const tr: any = await e1.call('pptx.undo', [true])
    R.themeRedoAccent1 = tr?.model?.theme?.colors?.accent1
    // 母版背景写入
    await e1.call('pptx.shapes', [0, [{ op: 'masterBg', color: '#112233' }]])
    R.masterBgAfter = (await e1.call('pptx.slide', [0]) as any).theme?.master?.bg
    // 切换 layout
    await e1.call('pptx.shapes', [0, [{ op: 'setLayout', layout: 'ppt/slideLayouts/slideLayout2.xml' }]])
    R.switchedLayout = (await e1.call('pptx.slide', [0]) as any).theme?.layout

    // save → 重开
    const out = (await e1.call('save', [])) as Blob
    R.savedSize = out.size
    const e2 = new Engine(() => {})
    await e2.open(new Blob([await out.arrayBuffer()], { type: SLIDE_MIME }), { name: 'o.pptx' })
    const s2: any = await e2.call('pptx.slide', [0])
    R.reopenedRot = findShape(s2).box.rot
    R.reopenedAccent1 = s2.theme?.colors?.accent1
    R.reopenedShapeFill = findShape(s2).fill?.c
    R.reopenedMasterBg = s2.theme?.master?.bg ?? null
    R.reopenedLayout = s2.theme?.layout

    // 原始 OOXML 校验
    R.themeXml = await ((await e2.call('part', ['ppt/theme/theme1.xml'])) as Blob).text()
    R.slideXml = await ((await e2.call('part', ['ppt/slides/slide1.xml'])) as Blob).text()
    R.masterXml = await ((await e2.call('part', ['ppt/slideMasters/slideMaster1.xml'])) as Blob).text()

    // 视图层：用干净（未编辑）的 pptx 挂真实 OfficeSlideView
    const ops: any[] = []
    ;(window as any).__smoke.protOps = ops
    const e3 = new Engine(() => {})
    const opened: any = await e3.open(blob, { name: 'view.pptx' })
    prot.client = {
      call: (m: string, ...args: any[]) => {
        if (m === 'pptx.shapes') ops.push(...(args[1] ?? []))
        return (e3 as any).call(m, args)
      },
      on: () => () => {},
      mediaUrl: (p: string) => (e3 as any).call('part', [p]).then((b: Blob) => URL.createObjectURL(b)),
    } as any
    prot.info = { pptx: opened.pptx }
    prot.ready = true
    R.done = true
  } catch (e) {
    R.error = String(e)
    ;(window as any).__smoke.protResult = R
  }
}

let protKicked = false
function protView() {
  if (!protKicked) { protKicked = true; void protCheck() }
  return () =>
    prot.ready && prot.client
      ? h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [h(OfficeSlideView, { client: prot.client, editable: true, info: prot.info })])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
}

/** v32 PPT 第三批内核冒烟：现场拼最小 pptx（形状 + a:tbl 表格 + dgm SmartArt），
 *  备注写回 / 表格单元格与行列 / SmartArt 文本 / 动画·切换 → save → 重开一致 + OOXML 校验。 */
async function pptxRichCheck() {
  const R: any = ((window as any).__smoke.pptxRich = {})
  try {
    const { writeZip } = await import('./core/zipwrite')
    const DGM = 'http://schemas.openxmlformats.org/drawingml/2006/diagram'
    const cell = (t: string) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${t}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>`
    const dgmPt = (id: string, type: string, text?: string) => text
      ? `<dgm:pt modelId="${id}" type="${type}"><dgm:t><a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${text}</a:t></a:r></a:p></dgm:t></dgm:pt>`
      : `<dgm:pt modelId="${id}" type="${type}"/>`
    const parts = new Map<string, string>([
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/diagrams/data1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml"/></Types>`],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`],
      ['ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],
      ['ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${RNS}/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="${RNS}/theme" Target="theme/theme1.xml"/></Relationships>`],
      ['ppt/slides/slide1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}" xmlns:dgm="${DGM}"><p:cSld><p:spTree>${grp}` +
        `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Shape2"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="2000000" y="1500000"/><a:ext cx="3000000" cy="2000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>` +
        `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Table3"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="400000" y="4000000"/><a:ext cx="4000000" cy="1200000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid><a:gridCol w="2000000"/><a:gridCol w="2000000"/></a:tblGrid><a:tr h="300000">${cell('A1')}${cell('B1')}</a:tr><a:tr h="300000">${cell('A2')}${cell('B2')}</a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>` +
        `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Diagram4"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="500000" y="1500000"/><a:ext cx="3000000" cy="1800000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds r:dm="rId2" r:lo="rId3" r:qs="rId4" r:cs="rId5"/></a:graphicData></a:graphic></p:graphicFrame>` +
        `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`],
      ['ppt/slides/_rels/slide1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${RNS}/diagramData" Target="../diagrams/data1.xml"/></Relationships>`],
      ['ppt/diagrams/data1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><dgm:dataDef xmlns:dgm="${DGM}" xmlns:a="${A}"><dgm:ptLst>` +
        dgmPt('d0', 'doc') + dgmPt('n1', 'node', '中心主题') + dgmPt('n2', 'node', '子项一') + dgmPt('n3', 'node', '子项二') +
        `</dgm:ptLst><dgm:cxnLst><dgm:cxn modelId="c1" srcId="d0" destId="n1" srcOrd="0" destOrd="0"/><dgm:cxn modelId="c2" srcId="n1" destId="n2" srcOrd="0" destOrd="0"/><dgm:cxn modelId="c3" srcId="n1" destId="n3" srcOrd="0" destOrd="0"/></dgm:cxnLst></dgm:dataDef>`],
      ['ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}" type="title" preserve="1"><p:cSld name="Title"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`],
      ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`],
      ['ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:cSld name="Master"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`],
      ['ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${RNS}/theme" Target="../theme/theme1.xml"/></Relationships>`],
      ['ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="${A}" name="Test"><a:themeElements><a:clrScheme name="Test"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Test"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="Test"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`],
    ])
    const blob: Blob = await writeZip(parts as any)
    const { Engine } = await import('./core/worker/engine')
    const shapeOf = (s: any) => (s?.els ?? []).find((e: any) => e.t === 'shape')
    const tableOf = (s: any) => (s?.els ?? []).find((e: any) => e.t === 'table')
    const dgmOf = (s: any) => (s?.els ?? []).find((e: any) => e.t === 'smartart')
    const e1 = new Engine(() => {})
    await e1.open(blob, { name: 'k.pptx' })
    const s0: any = await e1.call('pptx.slide', [0])
    R.initial = {
      shapeTop: shapeOf(s0)?.top,
      tableRows: tableOf(s0)?.rows?.length,
      tableCols: tableOf(s0)?.cols?.length,
      cell00: tableOf(s0)?.rows?.[0]?.cells?.[0]?.text?.paras?.[0]?.runs?.[0]?.text,
      dgmNodes: dgmOf(s0)?.nodes?.length,
      dgmLinks: dgmOf(s0)?.links?.length,
      dgmRoot: dgmOf(s0)?.nodes?.find((n: any) => n.id === 'n1')?.text,
      notes: s0.notes,
    }
    // 备注：无 notesSlide → 写回创建 part
    const sNotes: any = await e1.call('pptx.notes', [0, '第一页备注\n第二行'])
    R.notesWritten = sNotes.notes
    // 表格单元格文本
    const sCell: any = await e1.call('pptx.shapes', [0, [{ op: 'cellText', top: 3, row: 0, col: 0, text: '改A1' }]])
    R.cellWritten = tableOf(sCell)?.rows?.[0]?.cells?.[0]?.text?.paras?.[0]?.runs?.[0]?.text
    // 行列增删
    const sRowCol: any = await e1.call('pptx.shapes', [0, [
      { op: 'tblRow', top: 3, kind: 'add', at: 1 },
      { op: 'tblCol', top: 3, kind: 'add', at: 1 },
    ]])
    R.rowsAfter = tableOf(sRowCol)?.rows?.length
    R.colsAfter = tableOf(sRowCol)?.cols?.length
    // SmartArt 节点文本写回 data part
    const sDgm: any = await e1.call('pptx.shapes', [0, [{ op: 'dgmText', top: 4, node: 'n2', text: '子项已改' }]])
    R.dgmWritten = dgmOf(sDgm)?.nodes?.find((n: any) => n.id === 'n2')?.text
    // 切换效果
    const sTr: any = await e1.call('pptx.shapes', [0, [{ op: 'transition', kind: 'fade' }]])
    R.transition = sTr.transition
    // 入场动画 + undo/redo
    const sAnim: any = await e1.call('pptx.shapes', [0, [{ op: 'anim', top: 2, preset: 'fade' }]])
    R.animOn = shapeOf(sAnim)?.anim ?? null
    const u: any = await e1.call('pptx.undo', [false])
    R.animUndo = shapeOf(u?.model ?? {})?.anim ?? null
    const rd: any = await e1.call('pptx.undo', [true])
    R.animRedo = shapeOf(rd?.model ?? {})?.anim ?? null
    // save → 重开
    const out = (await e1.call('save', [])) as Blob
    R.savedSize = out.size
    const e2 = new Engine(() => {})
    await e2.open(new Blob([await out.arrayBuffer()], { type: SLIDE_MIME }), { name: 'o.pptx' })
    const s2: any = await e2.call('pptx.slide', [0])
    R.re = {
      notes: s2.notes,
      cell00: tableOf(s2)?.rows?.[0]?.cells?.[0]?.text?.paras?.[0]?.runs?.[0]?.text,
      rows: tableOf(s2)?.rows?.length,
      cols: tableOf(s2)?.cols?.length,
      dgmN2: dgmOf(s2)?.nodes?.find((n: any) => n.id === 'n2')?.text,
      transition: s2.transition,
      anim: shapeOf(s2)?.anim ?? null,
    }
    // 落盘 OOXML 校验
    const text = async (p: string) => await ((await e2.call('part', [p])) as Blob).text()
    const slideXml = await text('ppt/slides/slide1.xml')
    R.xml = {
      notesSlide: (await text('ppt/notesSlides/notesSlide1.xml')).includes('第一页备注'),
      slideRels: (await text('ppt/slides/_rels/slide1.xml.rels')).includes('notesSlide'),
      transitionXml: /<p:transition[\s>]/.test(slideXml) && slideXml.includes('<p:fade/>'),
      timingXml: slideXml.includes('presetID="10"'),
      dgmData: (await text('ppt/diagrams/data1.xml')).includes('子项已改'),
    }
    // 已有 notesSlide 的二次编辑（走覆写路径）
    const sNotes2: any = await e2.call('pptx.notes', [0, '覆写备注'])
    R.notesRewrite = sNotes2.notes
    R.done = true
  } catch (e) {
    R.error = String((e as Error).stack || e)
  }
}
;(window as any).__smoke.pptxRichRun = pptxRichCheck

/** JSON 专用区：左源码 + 右格式化树 + 格式化 / 压缩互转 */
function jsonView() {
  const src = ref('[{"name":"PaymentReconciliation","type":"Interval","interval":1800},{"name":"FreshWalletBalancesAmount","nested":{"ok":true}},{"name":"ProcessBillTasks","tags":["a","b"]}]')
  ;(window as any).__smoke.getJson = () => src.value
  return () => h(JsonView, {
    content: src.value, path: '/sample.json',
    'onUpdate:content': (v: string) => { src.value = v },
    onToast: (m: string) => { (window as any).__smoke.toast = m },
    onTransform: (compact: boolean) => {
      const r = transformJson(src.value, compact)
      if (r.ok) src.value = r.text
      ;(window as any).__smoke.toast = r.ok ? (compact ? '已压缩为单行' : '已格式化') : r.error
    },
  })
}

/** 真实 PreviewPane：验证 JSON 页签、右键菜单两项、选区只变换选中片段 */
function jsonPaneView() {
  const src = ref('前缀 [{"a":1},{"b":{"c":true}}] 后缀')
  const entry = { name: 'sample.json', path: '/sample.json', is_dir: false, ext: 'json', size: src.value.length, modified: '', kind: 'code' }
  const tabs = [{ entry, content: src.value, dirty: false }]
  const toasts: string[] = []
  ;(window as any).__smoke.getJson = () => src.value
  ;(window as any).__smoke.toasts = toasts
  const pane = ref<any>(null)
  return () => h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [
    h(PreviewPane, {
      ref: pane, entry, content: src.value, headings: [], dirty: false,
      kindLabel: { code: '代码' }, tabs, activeTabPath: entry.path,
      viewer: null, basePath: '/', docPath: entry.path, theme: 'dark',
      'onUpdate:content': (v: string) => { src.value = v },
      onToast: (m: string) => toasts.push(m),
      onDirty: () => toasts.push('dirty'),
    })
  ])
}

/** 长文件名页头：只挂纯 DOM + 真实 PreviewPane.css，验证 ellipsis 与按钮组可见 */
function headView() {
  return () => h('div', { class: 'pane' }, [
    h('div', { class: 'pane-head' }, [
      h('div', { class: 'file-info' }, [
        h('button', { class: 'btn ghost icon-btn back-btn' }, '←'),
        h('span', { class: 'fname', title: 'long' }, '1051983911323646-20261029143201_202606-202609_accountcommoditymonthbillover_2026_final_v3_generated.xlsx'),
        h('span', { class: 'ftag' }, '表格'),
      ]),
      h('div', { class: 'tabs' }, [
        h('button', { class: 'tab active' }, '预览'),
        h('button', { class: 'tab' }, '编辑'),
        h('button', { class: 'tab' }, '脑图'),
      ]),
      h('div', { class: 'head-actions' }, [
        h('button', { class: 'btn' }, 'AI 助手'),
        h('button', { class: 'btn' }, '另存为'),
        h('button', { class: 'btn primary' }, '已保存'),
      ]),
    ]),
  ])
}

/** 超大 SQL 流式只读：stub-api 按字节区间返回 /big.sql，验证分片解码与进度 */
const BIG_SQL_SIZE = 6 * 1024 * 1024
function streamView() {
  const editor = ref<any>(null)
  ;(window as any).__smoke.streamDoc = () => editor.value?.getValue() ?? ''
  return () =>
    h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [
      h(CodeEditor, { ref: editor, content: '', path: '/big.sql', stream: true, size: BIG_SQL_SIZE })
    ])
}

/** 验证自动换行偏好对 CodeMirror / textarea / pre 的联动 */
function wrapView() {
  const long = 'INSERT INTO t (a,b,c) VALUES (' + 'x'.repeat(300) + ');'
  return () =>
    h(
      'div',
      { class: { 'pane-body': true, 'no-wrap': !wrap.value }, style: 'height:100vh;display:flex;flex-direction:column' },
      [
        h('button', { id: 'toggle', style: 'flex:0 0 auto', onClick: () => setWrap(!wrap.value) }, 'TOGGLE'),
        h('textarea', { id: 'ta', class: 'editor', wrap: wrap.value ? 'soft' : 'off', style: 'height:80px;flex:0 0 auto' }, long),
        h('pre', { id: 'pre', class: ['code-view', wrap.value ? 'wrap' : ''], style: 'height:80px;flex:0 0 auto' }, long),
        h(CodeEditor, { content: long, path: '/sample.sql' })
      ]
    )
}

/** 两个常驻宿主 v-show 往返：测主线程阻塞，验证切页签不重读盘 / 不重解析 */
function tabsView() {
  const active = ref(0)
  const times: number[] = (window as any).__smoke.tabTimes
  ;(window as any).__smoke.switchTab = async (n: number) => {
    const t0 = performance.now()
    active.value = n
    await nextTick()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    times.push(Math.round(performance.now() - t0))
  }
  return () =>
    h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [
      h('button', { id: 'to1', style: 'flex:0 0 auto', onClick: () => (window as any).__smoke.switchTab(1) }, 'TO1'),
      h('button', { id: 'to0', style: 'flex:0 0 auto', onClick: () => (window as any).__smoke.switchTab(0) }, 'TO0'),
      ...[0, 1].map((i) =>
        h('div', {
          key: i,
          style: { flex: '1 1 auto', minHeight: 0, display: active.value === i ? 'flex' : 'none', flexDirection: 'column' }
        }, [
          h(OfficeEngineHost, {
            path: '/sample.docx', name: 'sample.docx', editable: true, theme: 'dark',
            ref: i === 0 ? host : undefined,
            onError: (m: string) => errors.push(m)
          })
        ])
      )
    ])
}

function findView() {
  const lines: string[] = ['项目说明：本文档演示查找功能，包含多处分隔的命中。']
  for (let i = 1; i <= 8; i++) {
    lines.push(`第 ${i} 处 Huawei 设备部署在区域 ${i}。`)
    if (i < 8) lines.push('填充段落 '.repeat(12))
  }
  const src = ref(lines.join('\n'))
  const entry = { name: 'a.txt', path: '/a.txt', is_dir: false, ext: 'txt', size: src.value.length, modified: '', kind: 'text' }
  const tabs = [{ entry, content: src.value, dirty: false }]
  const pane = ref<any>(null)
  const toasts: string[] = []
  ;(window as any).__smoke.toasts = toasts
  ;(window as any).__smoke.openFind = () => pane.value?.openFind()
  return () =>
    h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [
      h(PreviewPane, {
        ref: pane, entry, content: src.value, headings: [], dirty: false,
        kindLabel: { text: '文本' }, tabs, activeTabPath: entry.path,
        viewer: null, basePath: '/', docPath: entry.path, theme: 'dark',
        'onUpdate:content': (v: string) => { src.value = v },
        onToast: (m: string) => toasts.push(m), onDirty: () => {},
      }),
    ])
}

/** Markdown 预览态：mermaid 图与 KaTeX 公式渲染 */
function mdView() {
  const md =
    '# 架构说明\n\n' +
    '行内正文前的块级公式：\n\n' +
    '$$C_{kv\\_safe}=\\frac{C_{kv\\_total}}{R_{safe}}$$\n\n' +
    '下面是架构图：\n\n' +
    '```flowchart TB\n  A[客户端] --> B[网关]\n  B --> C[服务]\n  C --> D[数据库]\n```\n\n' +
    '结尾段落。'
  const entry = { name: 'a.md', path: '/a.md', is_dir: false, ext: 'md', size: md.length, modified: '', kind: 'markdown' }
  const tabs = [{ entry, content: md, dirty: false }]
  const pane = ref<any>(null)
  return () =>
    h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [
      h(PreviewPane, {
        ref: pane, entry, content: md, headings: [], dirty: false,
        kindLabel: { md: 'Markdown' }, tabs, activeTabPath: entry.path,
        viewer: null, basePath: '/', docPath: entry.path, theme: 'dark',
        'onUpdate:content': () => {}, onToast: () => {}, onDirty: () => {},
      }),
    ])
}

/** 表格视图冒烟：stub client 提供行块与 sheetOp 记录，验证右键菜单 / 增删行列 / 复制粘贴；
 *  另用真实 Engine 直测 csv 打开 → 改单元格 → save 应写回 csv 而非 xlsx */
function sheetView() {
  const sheetOps: Record<string, unknown>[] = []
  const setCalls: { r: number; c: number; input: string }[][] = []
  const fmtCalls: unknown[] = []
  const fmtRanges: unknown[] = []
  const handlers: Record<string, (p: unknown) => void> = {}
  const client = {
    call: async (m: string, ...args: unknown[]) => {
      if (m === 'xlsx.block') {
        const r0 = args[1] as number
        const r1 = args[2] as number
        const rows: { r: number; cells: unknown[][] }[] = []
        for (let r = Math.max(0, r0); r < Math.min(r1, 4); r++) {
          rows.push({ r, cells: [[0, `A${r + 1}`, 0, 0], [1, `B${r + 1}`, 0, 0], [2, String((r + 1) * 10), 0, 1]] })
        }
        return { sheet: args[0], r0, r1, rows, complete: true }
      }
      if (m === 'xlsx.set') { setCalls.push(args[1] as { r: number; c: number; input: string }[]); return null }
      if (m === 'xlsx.format') { fmtCalls.push(args[2]); fmtRanges.push(args[1]); return null }
      if (m === 'xlsx.sheetOp') {
        sheetOps.push(args[1] as Record<string, unknown>)
        return { layout: { sheet: 0, rows: 12, cols: 6, rowSizes: [], done: true, frozen: (args[1] as { op: string })?.op === 'freeze' ? { rows: 1, cols: 0 } : undefined } }
      }
      if (m === 'xlsx.find') {
        return [{ r: 1, c: 1, text: 'B2' }, { r: 2, c: 0, text: 'A3' }]
      }
      if (m === 'xlsx.load') {
        handlers['xlsx:progress']?.({ sheet: 0, rows: 12, cols: 6, rowSizes: [], done: true })
        return null
      }
      sheetOps.push({ __method: m })
      return null
    },
    on: (ev: string, fn: (p: unknown) => void) => {
      handlers[ev] = fn
      return () => {}
    }
  } as any
  const info = {
    xlsx: { sheets: [{ index: 0, name: 'Sheet1', hidden: false }], styles: [{}], formats: [], baseFont: {}, date1904: false }
  } as any
  ;(window as any).__smoke.sheetOps = sheetOps
  ;(window as any).__smoke.setCalls = setCalls
  ;(window as any).__smoke.fmtCalls = fmtCalls
  ;(window as any).__smoke.fmtRanges = fmtRanges
  const sheetHost = ref<any>(null)
  void csvEngineCheck()
  return () =>
    h('div', { style: 'height:100vh;display:flex;flex-direction:column', onVnodeMounted: () => { (window as any).__smoke.sheetCmd = () => sheetHost.value?.commands } }, [
      h(OfficeSheetView, { ref: sheetHost, client, editable: true, info })
    ])
}

/** xlsx 图片/图表 1:1 冒烟：内核写入真实 drawing → save → 重新打开 → drawings 读回 + 视图层渲染。
 *  工作簿用 writeZip 现场拼最小 xlsx（csv 源保存回 csv 会丢图，必须走 xlsx 源）。 */
const xdraw = reactive({ ready: false, client: null as any, info: null as any })
async function xlsxDrawCheck() {
  const R: any = ((window as any).__smoke.xdraw = xdraw)
  try {
    const { writeZip } = await import('./core/zipwrite')
    const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    const parts = new Map<string, string>([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml', `<workbook xmlns="${XMAIN}" xmlns:r="${RNS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
      ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${XMAIN}"><sheetData/></worksheet>`]
    ])
    const book: Blob = await writeZip(parts as any)
    const engine = new Engine(() => {})
    await engine.open(book, { name: 'book.xlsx' })
    await engine.call('xlsx.load', [0])
    for (let i = 0; i < 50; i++) {
      const blk: any = await engine.call('xlsx.block', [0, 0, 10])
      if (blk?.rows?.length) break
      await new Promise((r) => setTimeout(r, 100))
    }
    await engine.call('xlsx.set', [0, [
      { r: 0, c: 0, input: 'name' }, { r: 0, c: 1, input: 'qty' },
      { r: 1, c: 0, input: 'apple' }, { r: 1, c: 1, input: '10' },
      { r: 2, c: 0, input: 'banana' }, { r: 2, c: 1, input: '20' }
    ]])
    R.before = await engine.call('xlsx.drawings', [0]) // 空簿：应为 0 张且不抛错
    const cv = document.createElement('canvas')
    cv.width = 80
    cv.height = 60
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#e74c3c'
    ctx.fillRect(0, 0, 80, 60)
    const png: Blob = await new Promise<Blob>((res) => cv.toBlob((b) => res(b!), 'image/png'))
    const bytes = await png.arrayBuffer()
    R.insert1 = await engine.call('xlsx.image', [0, { bytes, ext: 'png', anchor: { row: 2, col: 1, wPx: 80, hPx: 60 } }])
    R.insert2 = await engine.call('xlsx.image', [0, { bytes, ext: 'png', anchor: { row: 5, col: 0, wPx: 120, hPx: 90 } }])
    await engine.call('xlsx.sheetOp', [0, { op: 'merge', range: { r0: 3, c0: 1, r1: 4, c1: 3 } }]) // 合并区也要过文件往返
    const out = (await engine.call('save', [])) as Blob
    R.savedSize = out.size
    const buf = await out.arrayBuffer()
    const handlers: Record<string, (p: unknown) => void> = {}
    let lastProgress: any = null
    handlers['xlsx:progress'] = (p) => { lastProgress = p }
    const e2 = new Engine((ev: string, p: unknown) => handlers[ev]?.(p))
    await e2.open(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), { name: 'out.xlsx' })
    await e2.call('xlsx.load', [0])
    for (let i = 0; i < 50; i++) {
      const blk: any = await e2.call('xlsx.block', [0, 0, 10])
      if (blk?.rows?.length) break
      await new Promise((r) => setTimeout(r, 100))
    }
    R.reopened = await e2.call('xlsx.drawings', [0])
    R.merges = lastProgress?.merges ?? []
    // 视图层渲染：真实 OfficeSheetView + 委托 client（call/on/mediaUrl 都转发到 e2）
    xdraw.client = {
      call: (m: string, ...args: unknown[]) => (e2 as any).call(m, args),
      on: (ev: string, fn: (p: unknown) => void) => {
        handlers[ev] = fn
        return () => {
          delete handlers[ev]
        }
      },
      mediaUrl: (p: string) => (e2 as any).call('part', [p]).then((b: Blob) => URL.createObjectURL(b as Blob))
    } as any
    xdraw.info = { xlsx: { sheets: [{ index: 0, name: 'Sheet1', hidden: false }], styles: [{}], formats: [], baseFont: {}, date1904: false } } as any
    // 模拟「复制截图 → Cmd+V」：派发原生 paste 事件带图片（clipboardData 直读，无系统授权浮层）
    ;(window as any).__smoke.pasteImage = async () => {
      const cv = document.createElement('canvas')
      cv.width = 40
      cv.height = 30
      const ctx = cv.getContext('2d')!
      ctx.fillStyle = '#2ecc71'
      ctx.fillRect(0, 0, 40, 30)
      const blob: Blob = await new Promise<Blob>((res) => cv.toBlob((b) => res(b!), 'image/png'))
      const dt = new DataTransfer()
      dt.items.add(new File([blob], 'clip.png', { type: 'image/png' }))
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }
    xdraw.ready = true
  } catch (e) {
    R.error = String(e)
  }
}

/** xlsx 图片/图表视图：等 xlsxDrawCheck 完成后用真实 OfficeSheetView 渲染重开的工作簿 */
let xdrawKicked = false
function xdrawView() {
  if (!xdrawKicked) {
    xdrawKicked = true
    void xlsxDrawCheck()
  }
  return () =>
    xdraw.ready && xdraw.client
      ? h('div', { style: 'height:100vh' }, [h(OfficeSheetView, { client: xdraw.client, editable: true, info: xdraw.info })])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
}

/** xlsx 浮动图片交互冒烟：drawingOp move/resize/delete 全链路 — 内核 px→twoCellAnchor 反算、undo/redo、
 *  save→重开几何一致（持久化）、视图层真实拖动走 OfficeSheetDrawingLayer、Delete 删除后重开为空。
 *  默认列宽 64px / 行高 20px（最小工作簿无 defaultColW/RowH），初始锚 (col1,row2) → x=64,y=40，80×60。 */
const xdrawOp = reactive({ ready: false, client: null as any, info: null as any })
async function reopenXlsxDraw(blob: Blob, handlers: Record<string, (p: unknown) => void>) {
  const e = new Engine((ev: string, p: unknown) => handlers[ev]?.(p))
  await e.open(new Blob([await blob.arrayBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), { name: 'out.xlsx' })
  await e.call('xlsx.load', [0])
  for (let i = 0; i < 50; i++) {
    const blk: any = await e.call('xlsx.block', [0, 0, 10])
    // complete=true（含空表）直接退出：headless 页面久置后定时器被 Chrome 强节流，空转循环会被拖到分钟级
    if (blk?.rows?.length || blk?.complete) break
    await new Promise((r) => setTimeout(r, 100))
  }
  return e
}
async function xlsxDrawOpCheck() {
  const R: any = ((window as any).__smoke.xdrawOp = xdrawOp)
  try {
    const { writeZip } = await import('./core/zipwrite')
    const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    const parts = new Map<string, string>([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml', `<workbook xmlns="${XMAIN}" xmlns:r="${RNS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
      ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${XMAIN}"><sheetData/></worksheet>`]
    ])
    const book: Blob = await writeZip(parts as any)
    const engine = new Engine(() => {})
    await engine.open(book, { name: 'book.xlsx' })
    await engine.call('xlsx.load', [0])
    for (let i = 0; i < 50; i++) {
      const blk: any = await engine.call('xlsx.block', [0, 0, 10])
      if (blk?.rows?.length || blk?.complete) break
      await new Promise((r) => setTimeout(r, 100))
    }
    const cv = document.createElement('canvas')
    cv.width = 80
    cv.height = 60
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#e74c3c'
    ctx.fillRect(0, 0, 80, 60)
    const png: Blob = await new Promise<Blob>((res) => cv.toBlob((b) => res(b!), 'image/png'))
    await engine.call('xlsx.image', [0, { bytes: await png.arrayBuffer(), ext: 'png', anchor: { row: 2, col: 1, wPx: 80, hPx: 60 } }])
    const out1 = (await engine.call('save', [])) as Blob

    const e2 = await reopenXlsxDraw(out1, {})
    R.initial = await e2.call('xlsx.drawings', [0])
    await e2.call('xlsx.drawingOp', [0, { kind: 'move', index: 0, x: 128, y: 60 }])
    R.moved = await e2.call('xlsx.drawings', [0])
    await e2.call('xlsx.drawingOp', [0, { kind: 'resize', index: 0, x: 128, y: 60, w: 100, h: 50 }])
    R.resized = await e2.call('xlsx.drawings', [0])
    await e2.call('xlsx.undo', [])
    R.afterUndo = await e2.call('xlsx.drawings', [0])
    await e2.call('xlsx.redo', [])
    R.afterRedo = await e2.call('xlsx.drawings', [0])
    const out2 = (await e2.call('save', [])) as Blob
    // e3 的 emit 必须接到后面视图 client.on 注册的同一 handlers（进度事件驱动虚拟网格尺寸）
    const handlers: Record<string, (p: unknown) => void> = {}
    const e3 = await reopenXlsxDraw(out2, handlers)
    R.persisted = await e3.call('xlsx.drawings', [0])

    // 视图层：真实 OfficeSheetView + OfficeSheetDrawingLayer，模拟拖动与 Delete
    const ops: any[] = []
    ;(window as any).__smoke.drawingOps = ops
    xdrawOp.client = {
      call: (m: string, ...args: unknown[]) => {
        if (m === 'xlsx.drawingOp') ops.push(args[1])
        return (e3 as any).call(m, args)
      },
      on: (ev: string, fn: (p: unknown) => void) => {
        handlers[ev] = fn
        return () => {
          delete handlers[ev]
        }
      },
      mediaUrl: (p: string) => (e3 as any).call('part', [p]).then((b: Blob) => URL.createObjectURL(b as Blob)),
    } as any
    xdrawOp.info = { xlsx: { sheets: [{ index: 0, name: 'Sheet1', hidden: false }], styles: [{}], formats: [], baseFont: {}, date1904: false } } as any
    ;(window as any).__smoke.saveXdrawOp = async () => {
      const blob = (await e3.call('save', [])) as Blob
      const e4 = await reopenXlsxDraw(blob, {})
      return await e4.call('xlsx.drawings', [0])
    }
    xdrawOp.ready = true
  } catch (e) {
    R.error = String(e)
  }
}

let xdrawOpKicked = false
function xdrawOpView() {
  if (!xdrawOpKicked) {
    xdrawOpKicked = true
    void xlsxDrawOpCheck()
  }
  return () =>
    xdrawOp.ready && xdrawOp.client
      ? h('div', { style: 'height:100vh' }, [h(OfficeSheetView, { client: xdrawOp.client, editable: true, info: xdrawOp.info })])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
}

/** 原生 OOXML 特性冒烟：chart / condFmt / validation / slicer / pivot 写真实 part →
 *  save → 重开 → features 读回一致；chart/pivot 刷新重算；undo/redo；视图层渲染。 */
const xfeat = reactive({ ready: false, client: null as any, info: null as any })
async function xlsxFeatCheck() {
  const R: any = ((window as any).__smoke.xfeat = xfeat)
  try {
    const { writeZip } = await import('./core/zipwrite')
    const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    const parts = new Map<string, string>([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml', `<workbook xmlns="${XMAIN}" xmlns:r="${RNS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
      ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${XMAIN}" xmlns:r="${RNS}"><sheetData/></worksheet>`]
    ])
    const book: Blob = await writeZip(parts as any)
    const engine = new Engine(() => {})
    await engine.open(book, { name: 'feat.xlsx' })
    await engine.call('xlsx.load', [0])
    const waitRows = async (e: Engine) => {
      for (let i = 0; i < 50; i++) { const b: any = await e.call('xlsx.block', [0, 0, 20]); if (b?.rows?.length || b?.complete) break; await new Promise((r) => setTimeout(r, 80)) }
    }
    await waitRows(engine)
    await engine.call('xlsx.set', [0, [
      { r: 0, c: 0, input: 'name' }, { r: 0, c: 1, input: 'qty' }, { r: 0, c: 2, input: 'region' },
      { r: 1, c: 0, input: 'apple' }, { r: 1, c: 1, input: '10' }, { r: 1, c: 2, input: 'North' },
      { r: 2, c: 0, input: 'banana' }, { r: 2, c: 1, input: '20' }, { r: 2, c: 2, input: 'South' },
      { r: 3, c: 0, input: 'cherry' }, { r: 3, c: 1, input: '30' }, { r: 3, c: 2, input: 'North' },
    ]])
    // 1. native chart
    R.chartAdd = await engine.call('xlsx.chartAdd', [0, { kind: 'col', title: 'Sales', source: { r0: 0, c0: 0, r1: 3, c1: 1 }, data: { cats: ['apple', 'banana', 'cherry'], series: [{ name: 'qty', values: [10, 20, 30] }] }, anchor: { row: 5, col: 0, wPx: 420, hPx: 260 } }])
    // 2. conditional formatting (3 kinds)
    R.condFmt = await engine.call('xlsx.condFmtSet', [0, [
      { id: 1, sqref: { r0: 1, c0: 1, r1: 3, c1: 1 }, type: 'cellIs', operator: 'greaterThan', formula1: '15', color: 'FFC7CE', fontColor: '9C0006' },
      { id: 2, sqref: { r0: 1, c0: 1, r1: 3, c1: 1 }, type: 'dataBar', barColor: '638EC6' },
      { id: 3, sqref: { r0: 1, c0: 1, r1: 3, c1: 1 }, type: 'colorScale', colorMin: 'F8696B', colorMax: '63BE7B' },
      { id: 4, sqref: { r0: 1, c0: 0, r1: 3, c1: 0 }, type: 'containsText', text: 'a', color: 'C6EFCE', fontColor: '006100' },
      { id: 5, sqref: { r0: 1, c0: 1, r1: 3, c1: 1 }, type: 'top10', rank: 2, color: 'FFEB9C' },
    ]])
    // 3. data validation
    R.validation = await engine.call('xlsx.validationSet', [0, [
      { id: 1, sqref: { r0: 1, c0: 2, r1: 12, c1: 2 }, type: 'list', formula1: 'North,South,East,West', items: ['North', 'South', 'East', 'West'], showInputMessage: true, promptTitle: '区域', prompt: '请选择区域', showErrorMessage: true, errorTitle: '非法', error: '不在列表中' },
      { id: 2, sqref: { r0: 1, c0: 1, r1: 12, c1: 1 }, type: 'whole', operator: 'between', formula1: '0', formula2: '1000' },
    ]])
    // 4. slicer
    R.slicerAdd = await engine.call('xlsx.slicerAdd', [0, { name: 'Region', source: { r0: 0, c0: 2, r1: 3, c1: 2 }, fieldCol: 2, fieldName: 'region', items: ['North', 'South'], anchor: { row: 5, col: 5 } }])
    R.slicerSelect = await engine.call('xlsx.slicerSelect', [0, 1, ['North']])
    // 5. pivot
    R.pivotAdd = await engine.call('xlsx.pivotAdd', [0, { name: 'Pivot1', source: { r0: 0, c0: 0, r1: 3, c1: 2 }, location: { r0: 0, c0: 6 }, rows: [0], cols: [2], values: [{ c: 1, agg: 'sum' }] }])
    R.before = await engine.call('xlsx.features', [0])
    R.pivotCellsBefore = await engine.call('xlsx.block', [0, 0, 6])
    // chart refresh: change source, recompute
    await engine.call('xlsx.set', [0, [{ r: 1, c: 1, input: '99' }]])
    await engine.call('xlsx.chartRefresh', [0, 1])
    R.afterChartRefresh = await engine.call('xlsx.features', [0])
    // pivot refresh
    await engine.call('xlsx.pivotRefresh', [0, 1])
    R.afterPivotRefresh = await engine.call('xlsx.features', [0])
    // undo the pivot refresh, then redo
    await engine.call('xlsx.undo', [])
    R.afterUndo = await engine.call('xlsx.features', [0])
    await engine.call('xlsx.redo', [])
    R.afterRedo = await engine.call('xlsx.features', [0])
    // save → reopen
    const out = (await engine.call('save', [])) as Blob
    R.savedSize = out.size
    const handlers: Record<string, (p: unknown) => void> = {}
    const e2 = new Engine((ev: string, p: unknown) => handlers[ev]?.(p))
    await e2.open(new Blob([await out.arrayBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), { name: 'out.xlsx' })
    await e2.call('xlsx.load', [0])
    await waitRows(e2)
    R.reopened = await e2.call('xlsx.features', [0])
    // verify real parts exist in the saved package
    const partExists = async (p: string) => { try { const b = await e2.call('part', [p]) as Blob; return b.size > 0 } catch { return false } }
    R.parts = {
      chart: await partExists('xl/charts/chart1.xml'),
      slicerCache: await partExists('xl/slicerCaches/slicerCache1.xml'),
      slicer: await partExists('xl/slicers/slicer1.xml'),
      pivotCacheDef: await partExists('xl/pivotCache/pivotCacheDefinition101.xml'),
      pivotCacheRec: await partExists('xl/pivotCache/pivotCacheRecords101.xml'),
      pivotTable: await partExists('xl/pivotTables/pivotTable1.xml'),
      styles: await partExists('xl/styles.xml'),
      sidecar: await partExists('xl/mdview/features.json'),
    }
    // every generated OOXML part must be well-formed XML (real Office compatibility floor)
    const partPaths = ['xl/charts/chart1.xml', 'xl/drawings/drawing1.xml', 'xl/slicerCaches/slicerCache1.xml', 'xl/slicers/slicer1.xml', 'xl/pivotCache/pivotCacheDefinition101.xml', 'xl/pivotCache/pivotCacheRecords101.xml', 'xl/pivotTables/pivotTable1.xml', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/_rels/sheet1.xml.rels', '[Content_Types].xml']
    const xmlOk: Record<string, boolean> = {}
    for (const p of partPaths) {
      try {
        const txt = await (await e2.call('part', [p]) as Blob).text()
        const doc = new DOMParser().parseFromString(txt, 'application/xml')
        xmlOk[p] = !doc.querySelector('parsererror') && txt.length > 20
      } catch { xmlOk[p] = false }
    }
    R.xmlWellFormed = xmlOk
    // rewrite-after-feature check: edit a cell again, save, reopen — condFmt/validation must survive
    await e2.call('xlsx.set', [0, [{ r: 0, c: 0, input: 'name2' }]])
    const out2 = (await e2.call('save', [])) as Blob
    const e3 = new Engine((ev: string, p: unknown) => handlers[ev]?.(p))
    await e3.open(new Blob([await out2.arrayBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), { name: 'out2.xlsx' })
    await e3.call('xlsx.load', [0])
    await waitRows(e3)
    R.afterRewrite = await e3.call('xlsx.features', [0])
    R.rewriteParts = {
      condFmt: await partExistsIn(e3, 'xl/worksheets/sheet1.xml', 'conditionalFormatting'),
      dataValidations: await partExistsIn(e3, 'xl/worksheets/sheet1.xml', 'dataValidations'),
      chart: await partExistsIn(e3, 'xl/charts/chart1.xml', 'chartSpace'),
    }
    // view client (real OfficeSheetView + new feature layer)
    xfeat.client = {
      call: (m: string, ...args: unknown[]) => (e3 as any).call(m, args),
      on: (ev: string, fn: (p: unknown) => void) => { handlers[ev] = fn; return () => { delete handlers[ev] } },
      mediaUrl: (p: string) => (e3 as any).call('part', [p]).then((b: Blob) => URL.createObjectURL(b as Blob)),
    } as any
    xfeat.info = { xlsx: { sheets: [{ index: 0, name: 'Sheet1', hidden: false }], styles: [{}], formats: [], baseFont: {}, date1904: false } } as any
    xfeat.ready = true
  } catch (e) {
    R.error = String(e)
  }
}
async function partExistsIn(e: Engine, p: string, needle: string): Promise<boolean> {
  try { const b = await e.call('part', [p]) as Blob; return (await b.text()).includes(needle) } catch { return false }
}
let xfeatKicked = false
function xfeatView() {
  if (!xfeatKicked) { xfeatKicked = true; void xlsxFeatCheck() }
  return () =>
    xfeat.ready && xfeat.client
      ? h('div', { style: 'height:100vh' }, [h(OfficeSheetView, { client: xfeat.client, editable: true, info: xfeat.info })])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
}

/**
 * Excel「遗留 1:1 对齐」第二批冒烟：填充四向（上/左/下/右）+ 拖动搬移保留公式与样式（内核），
 * 以及多区选区外框 / 跨冻结线外框拆段（视图）。内核断言走真实 Engine，视图断言在页面内驱动指针事件后读 DOM。
 */
const xfill = reactive({ ready: false, client: null as any, info: null as any })
async function xlsxFillCheck() {
  const R: any = ((window as any).__smoke.xfill = xfill)
  // runViewTests 在模块求值期无法挂到 xfill（此时还未赋值，见下方顶层注释），先挂到稳定的 __smoke 上再桥接
  R.runViewTests = (window as any).__smoke.xfillRunView
  R.kernel = {}
  try {
    const { writeZip } = await import('./core/zipwrite')
    const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    const parts = new Map<string, string>([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml', `<workbook xmlns="${XMAIN}" xmlns:r="${RNS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
      ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${XMAIN}"><sheetData/></worksheet>`]
    ])
    const book: Blob = await writeZip(parts as any)
    // engine 事件必须转发给 handlers（视图挂载后订阅 xlsx:progress 重建轴），空回调会让网格永远 42px、0 个 cell
    const handlers: Record<string, (p: unknown) => void> = {}
    const engine = new Engine((ev: string, p: unknown) => handlers[ev]?.(p))
    await engine.open(book, { name: 'fill.xlsx' })
    await engine.call('xlsx.load', [0])
    const waitRows = async (e: Engine) => {
      for (let i = 0; i < 50; i++) { const b: any = await e.call('xlsx.block', [0, 0, 30]); if (b?.rows?.length || b?.complete) break; await new Promise((r) => setTimeout(r, 80)) }
    }
    await waitRows(engine)
    await engine.call('xlsx.set', [0, [
      { r: 0, c: 0, input: '1' }, { r: 1, c: 0, input: '2' }, { r: 2, c: 0, input: '3' },
      { r: 0, c: 1, input: '=A1*2' },
      { r: 0, c: 2, input: 'x' }, { r: 0, c: 3, input: 'y' },
    ]])
    // 1. 填充四向
    await engine.call('xlsx.sheetOp', [0, { op: 'fill', range: { r0: 0, c0: 0, r1: 5, c1: 0 }, dir: 'down' }]) // A1:A3 向下铺到 A6
    await engine.call('xlsx.sheetOp', [0, { op: 'fill', range: { r0: 0, c0: 1, r1: 0, c1: 3 }, dir: 'right' }]) // B1 公式向右铺
    await engine.call('xlsx.set', [0, [{ r: 11, c: 0, input: '9' }]])
    await engine.call('xlsx.sheetOp', [0, { op: 'fill', range: { r0: 8, c0: 0, r1: 11, c1: 0 }, dir: 'up' }]) // A12=9 向上铺到 A9
    await engine.call('xlsx.set', [0, [{ r: 19, c: 2, input: 'L' }]])
    await engine.call('xlsx.sheetOp', [0, { op: 'fill', range: { r0: 19, c0: 0, r1: 19, c1: 2 }, dir: 'left' }]) // C20=L 向左铺到 A20
    const blk: any = await engine.call('xlsx.block', [0, 0, 30])
    const cellVal = (r: number, c: number) => { const row = (blk.rows as any[]).find((x) => x.r === r); const v = row?.cells.find((x: any[]) => x[0] === c); return v ? v[1] : undefined }
    R.kernel.fill = {
      down: cellVal(5, 0) === '1', // A6 由 A1 向下填充得来
      right: ((blk.rows as any[]).find((x) => x.r === 0)?.cells.find((x: any[]) => x[0] === 3)?.[1] ?? '') === '=C1*2' || cellVal(0, 3) !== 'y', // C1/D1 被公式覆盖
      rightFormula: cellVal(0, 3) !== 'y' && cellVal(0, 3) !== 'x',
      up: cellVal(8, 0) === '9', // A9 由 A12 向上填充得来
      left: cellVal(19, 0) === 'L' // A20 由 C20 向左填充得来
    }
    // 2. 拖动搬移保留公式与样式
    await engine.call('xlsx.set', [0, [{ r: 0, c: 3, input: '=A1*3' }]])
    await engine.call('xlsx.format', [0, { r0: 0, c0: 3, r1: 0, c1: 3 }, { bold: true }])
    const beforeD1: any = await engine.call('xlsx.cell', [0, 0, 3])
    const beforeBlk: any = await engine.call('xlsx.block', [0, 0, 2])
    const d1xf = (beforeBlk.rows as any[]).find((x) => x.r === 0)?.cells.find((x: any[]) => x[0] === 3)?.[2]
    await engine.call('xlsx.sheetOp', [0, { op: 'moveRange', from: { r0: 0, c0: 3, r1: 0, c1: 3 }, dr: 1, dc: 1 }]) // D1 → E2
    const afterBlk: any = await engine.call('xlsx.block', [0, 0, 2])
    const e2: any = await engine.call('xlsx.cell', [0, 1, 4])
    const e2xf = (afterBlk.rows as any[]).find((x) => x.r === 1)?.cells.find((x: any[]) => x[0] === 4)?.[2]
    const d1After: any = (afterBlk.rows as any[]).find((x) => x.r === 0)?.cells.find((x: any[]) => x[0] === 3)
    R.kernel.move = {
      formulaPreserved: e2?.formula === '=B2*3', // A1 随搬移 +1 列 → B2
      stylePreserved: e2xf === d1xf,
      sourceCleared: d1After === undefined
    }
    await engine.call('xlsx.undo', [])
    const d1UndoCell: any = await engine.call('xlsx.cell', [0, 0, 3])
    const undoBlk: any = await engine.call('xlsx.block', [0, 0, 2])
    const e2Undo: any = undoBlk.rows.find((x: any) => x.r === 1)?.cells.find((x: any[]) => x[0] === 4)
    // 撤销恢复的是源格公式（块元组 [1] 是缓存值，公式必须经 xlsx.cell 读）
    R.kernel.move.undoRestored = d1UndoCell?.formula === '=A1*3'
    R.kernel.move.undoClearedTarget = e2Undo === undefined
    R.kernel.error = beforeD1?.formula !== '=A1*3' ? 'before-set-failed' : null

    // 视图层：真实 OfficeSheetView + 委托 client（call/on/mediaUrl 转发到 engine；on 经 engine 回调闭环）
    xfill.client = {
      call: (m: string, ...args: unknown[]) => (engine as any).call(m, args),
      on: (ev: string, fn: (p: unknown) => void) => { handlers[ev] = fn; return () => { delete handlers[ev] } },
      mediaUrl: (p: string) => (engine as any).call('part', [p]).then((b: Blob) => URL.createObjectURL(b as Blob))
    } as any
    xfill.info = { xlsx: { sheets: [{ index: 0, name: 'Sheet1', hidden: false }], styles: [{}], formats: [], baseFont: {}, date1904: false } } as any
    xfill.ready = true
  } catch (e) {
    R.error = String(e)
  }
}
/** 视图断言：页面内驱动指针事件，验证多区选区外框与跨冻结线外框拆段。
 *  注意：xfill 要到 xlsxFillCheck() 内才挂上 window.__smoke，所以本函数挂到 __smoke.xfillRunView，
 *  由 xlsxFillCheck 桥接为 xfill.runViewTests —— 顶层直接写 __smoke.xfill.runViewTests 会在模块求值期
 *  抛 TypeError 并中断后续 mode 路由注册（v29 排障实录）。 */
;(window as any).__smoke.xfillRunView = async () => {
  const R: any = (window as any).__smoke.xfill
  const out: any = { multi: null, freeze: null }
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const clickCell = (r: number, c: number, o: { shift?: boolean; add?: boolean } = {}) => {
    const el = document.querySelector(`.ov-cell[data-cell-r="${r}"][data-cell-c="${c}"]`) as HTMLElement | null
    if (!el) return false
    const b = el.getBoundingClientRect()
    const x = b.left + b.width / 2
    const y = b.top + b.height / 2
    const opts: any = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, metaKey: !!o.add, ctrlKey: !!o.add, shiftKey: !!o.shift, view: window }
    el.dispatchEvent(new PointerEvent('pointerdown', opts))
    window.dispatchEvent(new PointerEvent('pointerup', opts))
    return true
  }
  try {
    // 多区选区：A1 → Shift A3 → Ctrl C1（加选），主框 + 加选框 = 2 个 ov-range-box
    await wait(60)
    clickCell(0, 0); await wait(30)
    clickCell(2, 0, { shift: true }); await wait(30)
    clickCell(0, 2, { add: true }); await wait(40)
    out.multi = document.querySelectorAll('.ov-range-box').length
    // 跨冻结线外框：单击 B3（使选区左上角 = r0=2,c0=1），经视图 freeze('sel') 冻结 2 行 1 列，
    // 再选 A1:F10（跨行列两条冻结线）→ 拆成 4 段外框
    clickCell(2, 1); await wait(30)
    const view = (window as any).__smoke.xfill.view
    if (view && view.commands && view.commands.freeze) await view.commands.freeze('sel')
    await wait(80)
    clickCell(0, 0); await wait(30)
    clickCell(9, 5, { shift: true }); await wait(50)
    out.freeze = document.querySelectorAll('.ov-range-box').length
  } catch (e) {
    out.error = String(e)
  }
  R.viewResult = out
  return out
}
let xfillKicked = false
function xfillView() {
  if (!xfillKicked) { xfillKicked = true; void xlsxFillCheck() }
  return () =>
    xfill.ready && xfill.client
      ? h('div', { style: 'height:100vh' }, [h(OfficeSheetView, {
          ref: (el: any) => { (xfill as any).view = el },
          client: xfill.client, editable: true, info: xfill.info
        })])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
}

/**
 * Excel「遗留 1:1 对齐」第三批冒烟：序列对话框（等差/等比/日期/自动/终止值/撤销）+
 * 填充 mode 重算（fillSeries/fillFormats/fillWithoutFormat）内核断言走真实 Engine；
 * 视图断言：ribbon 序列命令弹自绘对话框 → 确定后内核写入；拖拽填充后「自动填充选项」浮标 → 以序列方式重填。
 */
const xseries = reactive({ ready: false, client: null as any, info: null as any })
async function xlsxSeriesCheck() {
  const R: any = ((window as any).__smoke.xseries = xseries)
  R.runViewTests = (window as any).__smoke.xseriesRunView
  R.kernel = {}
  try {
    const { writeZip } = await import('./core/zipwrite')
    const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    const parts = new Map<string, string>([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml', `<workbook xmlns="${XMAIN}" xmlns:r="${RNS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
      ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${XMAIN}"><sheetData/></worksheet>`]
    ])
    const book: Blob = await writeZip(parts as any)
    // engine 事件必须转发给 handlers（视图挂载后订阅 xlsx:progress 重建轴，空回调会让网格 0 cell）
    const handlers: Record<string, (p: unknown) => void> = {}
    const engine = new Engine((ev: string, p: unknown) => handlers[ev]?.(p))
    R.step = 'open'
    await engine.open(book, { name: 'series.xlsx' })
    await engine.call('xlsx.load', [0])
    // xlsx.load 是 fire-and-forget：必须等 d.done（block.complete=true）才能写，否则 sheet() 抛 Sheet is still loading
    for (let i = 0; i < 80; i++) {
      const b: any = await engine.call('xlsx.block', [0, 0, 30])
      if (b?.complete) break
      await new Promise((r) => setTimeout(r, 100))
    }
    const cellVal = (blk: any, r: number, c: number) => {
      const row = (blk.rows as any[]).find((x) => x.r === r)
      const v = row?.cells.find((x: any[]) => x[0] === c)
      return v ? v[1] : undefined
    }
    const cellXf = (blk: any, r: number, c: number) => {
      const row = (blk.rows as any[]).find((x) => x.r === r)
      const v = row?.cells.find((x: any[]) => x[0] === c)
      return v ? v[2] : undefined
    }
    R.step = '1. 等差：A1=1 → A2..A6 = 2..6'
    // 1. 等差：A1=1 → A2..A6 = 2..6
    await engine.call('xlsx.set', [0, [{ r: 0, c: 0, input: '1' }]])
    await engine.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 0, r1: 5, c1: 0 }, dir: 'col', type: 'linear', step: 1 }])
    const blk1: any = await engine.call('xlsx.block', [0, 0, 30])
    R.step = '2. 等比：B1=3 步长2 → 3,6,12,24,48'
    // 2. 等比：B1=3 步长2 → 3,6,12,24,48
    await engine.call('xlsx.set', [0, [{ r: 0, c: 1, input: '3' }]])
    await engine.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 1, r1: 4, c1: 1 }, dir: 'col', type: 'growth', step: 2 }])
    const blk2: any = await engine.call('xlsx.block', [0, 0, 30])
    R.step = '3. 日期（月）：C1=2026-01-01（日期格式）→ 2026-02-01'
    // 3. 日期（月）：C1=2026-01-01（日期格式）→ 2026-02-01 / 03-01 / 04-01
    await engine.call('xlsx.format', [0, { r0: 0, c0: 2, r1: 0, c1: 2 }, { numFmt: 'yyyy-mm-dd' }])
    await engine.call('xlsx.set', [0, [{ r: 0, c: 2, input: '2026-01-01' }]])
    await engine.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 2, r1: 3, c1: 2 }, dir: 'col', type: 'date', unit: 'month', step: 1 }])
    const blk3: any = await engine.call('xlsx.block', [0, 0, 30])
    R.step = '4. 自动填充类型：E1=5 E2=10（差值 5）→ E3=15 E4=20'
    // 4. 自动填充类型：E1=5 E2=10（差值 5）→ E3=15 E4=20
    await engine.call('xlsx.set', [0, [{ r: 0, c: 4, input: '5' }, { r: 1, c: 4, input: '10' }]])
    await engine.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 4, r1: 3, c1: 4 }, dir: 'col', type: 'auto', step: 1 }])
    const blk4: any = await engine.call('xlsx.block', [0, 0, 30])
    R.step = '5. 终止值：F1=10 步长5 到 30 → F2..F5 = 15/20/2'
    // 5. 终止值：F1=10 步长5 到 30 → F2..F5 = 15/20/25/30，F6.. 保留空
    await engine.call('xlsx.set', [0, [{ r: 0, c: 5, input: '10' }]])
    await engine.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 5, r1: 7, c1: 5 }, dir: 'col', type: 'linear', step: 5, stop: 30 }])
    const blk5: any = await engine.call('xlsx.block', [0, 0, 30])
    R.step = '6. 撤销/重做：undo 回滚终止值那步 → F 清空；redo 恢复'
    // 6. 撤销/重做：undo 回滚终止值那步 → F 清空；redo 恢复
    await engine.call('xlsx.undo', [])
    const blkUndo: any = await engine.call('xlsx.block', [0, 0, 30])
    await engine.call('xlsx.redo', [])
    const blkRedo: any = await engine.call('xlsx.block', [0, 0, 30])
    R.step = '7. 填充 mode：fillSeries（G1=1 G2=3 拖到 G4 → '
    // 7. 填充 mode：fillSeries（G1=1 G2=3 拖到 G4 → 5/7）
    await engine.call('xlsx.set', [0, [{ r: 0, c: 6, input: '1' }, { r: 1, c: 6, input: '3' }]])
    await engine.call('xlsx.sheetOp', [0, { op: 'fill', range: { r0: 0, c0: 6, r1: 3, c1: 6 }, dir: 'down', mode: 'fillSeries', src: { r0: 0, c0: 6, r1: 1, c1: 6 } }])
    R.step = '8. fillFormats：H1=\'x\' 加粗、H2=\'y\' → 仅样'
    // 8. fillFormats：H1='x' 加粗、H2='y' → 仅样式落 H2，值保留
    await engine.call('xlsx.set', [0, [{ r: 0, c: 7, input: 'x' }, { r: 1, c: 7, input: 'y' }]])
    await engine.call('xlsx.format', [0, { r0: 0, c0: 7, r1: 0, c1: 7 }, { b: true }])
    await engine.call('xlsx.sheetOp', [0, { op: 'fill', range: { r0: 0, c0: 7, r1: 1, c1: 7 }, dir: 'down', mode: 'fillFormats', src: { r0: 0, c0: 7, r1: 0, c1: 7 } }])
    R.step = '9. fillWithoutFormat：I1=\'9\' 加粗 → I2/I3'
    // 9. fillWithoutFormat：I1='9' 加粗 → I2/I3 拿值不拿样式
    await engine.call('xlsx.set', [0, [{ r: 0, c: 8, input: '9' }]])
    await engine.call('xlsx.format', [0, { r0: 0, c0: 8, r1: 0, c1: 8 }, { b: true }])
    await engine.call('xlsx.sheetOp', [0, { op: 'fill', range: { r0: 0, c0: 8, r1: 2, c1: 8 }, dir: 'down', mode: 'fillWithoutFormat', src: { r0: 0, c0: 8, r1: 0, c1: 8 } }])
    const blk9: any = await engine.call('xlsx.block', [0, 0, 30])
    R.step = '10. 日期单位：工作日跳周末（J1=2026-01-02 周五 → J2=01'
    // 10. 日期单位：工作日跳周末（J1=2026-01-02 周五 → J2=01-05 周一 / J3=01-06）
    await engine.call('xlsx.format', [0, { r0: 0, c0: 9, r1: 0, c1: 9 }, { numFmt: 'yyyy-mm-dd' }])
    await engine.call('xlsx.set', [0, [{ r: 0, c: 9, input: '2026-01-02' }]])
    await engine.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 9, r1: 2, c1: 9 }, dir: 'col', type: 'date', unit: 'weekday', step: 1 }])
    const blk10: any = await engine.call('xlsx.block', [0, 0, 30])
    R.step = '11. 月末溢出回退（Q1=2026-01-31 + 1 月 → 2026-02'
    // 11. 月末溢出回退（Q1=2026-01-31 + 1 月 → 2026-02-28，而不是 03-03）
    await engine.call('xlsx.format', [0, { r0: 0, c0: 16, r1: 0, c1: 16 }, { numFmt: 'yyyy-mm-dd' }])
    await engine.call('xlsx.set', [0, [{ r: 0, c: 16, input: '2026-01-31' }]])
    await engine.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 16, r1: 1, c1: 16 }, dir: 'col', type: 'date', unit: 'month', step: 1 }])
    const blk11: any = await engine.call('xlsx.block', [0, 0, 30])
    R.step = '12. copyValues 显式模式 + 无 mode 默认（旧行为回归）'
    // 12. copyValues 显式模式 + 无 mode 默认（旧行为回归）
    await engine.call('xlsx.set', [0, [{ r: 0, c: 18, input: '7' }, { r: 0, c: 19, input: '4' }]])
    await engine.call('xlsx.sheetOp', [0, { op: 'fill', range: { r0: 0, c0: 18, r1: 2, c1: 18 }, dir: 'down', mode: 'copyValues' }])
    await engine.call('xlsx.sheetOp', [0, { op: 'fill', range: { r0: 0, c0: 19, r1: 2, c1: 19 }, dir: 'down' }])
    R.step = '13. 拆分后四向基础填充回归（down/right/up/left）'
    // 13. 拆分后四向基础填充回归（down/right/up/left）
    await engine.call('xlsx.set', [0, [
      { r: 0, c: 20, input: 'D' }, { r: 0, c: 21, input: 'R' },
      { r: 2, c: 24, input: 'U' }, { r: 2, c: 27, input: 'L' }
    ]])
    await engine.call('xlsx.sheetOp', [0, { op: 'fill', range: { r0: 0, c0: 20, r1: 2, c1: 20 }, dir: 'down' }])
    await engine.call('xlsx.sheetOp', [0, { op: 'fill', range: { r0: 0, c0: 21, r1: 0, c1: 23 }, dir: 'right' }])
    await engine.call('xlsx.sheetOp', [0, { op: 'fill', range: { r0: 0, c0: 24, r1: 2, c1: 24 }, dir: 'up' }])
    await engine.call('xlsx.sheetOp', [0, { op: 'fill', range: { r0: 2, c0: 25, r1: 2, c1: 27 }, dir: 'left' }])
    const blk13: any = await engine.call('xlsx.block', [0, 0, 30])
    R.kernel.series = {
      linear: ['2', '3', '4', '5', '6'].every((v, i) => cellVal(blk1, i + 1, 0) === v),
      growth: ['3', '6', '12', '24', '48'].every((v, i) => cellVal(blk2, i, 1) === v),
      date: ['2026-02-01', '2026-03-01', '2026-04-01'].every((v, i) => cellVal(blk3, i + 1, 2) === v),
      auto: cellVal(blk4, 2, 4) === '15' && cellVal(blk4, 3, 4) === '20',
      stop: cellVal(blk5, 1, 5) === '15' && cellVal(blk5, 4, 5) === '30' && cellVal(blk5, 5, 5) === undefined,
      undo: cellVal(blkUndo, 1, 5) === undefined && cellVal(blkUndo, 0, 5) === '10',
      redo: cellVal(blkRedo, 1, 5) === '15',
      fillSeries: cellVal(blk9, 2, 6) === '5' && cellVal(blk9, 3, 6) === '7' && cellVal(blk9, 1, 6) === '3',
      fillFormats: cellVal(blk9, 1, 7) === 'y' && cellXf(blk9, 1, 7) === cellXf(blk9, 0, 7),
      fillWithoutFormat: cellVal(blk9, 1, 8) === '9' && cellVal(blk9, 2, 8) === '9' && cellXf(blk9, 1, 8) !== cellXf(blk9, 0, 8),
      dateWeekday: cellVal(blk10, 1, 9) === '2026-01-05' && cellVal(blk10, 2, 9) === '2026-01-06',
      dateMonthClamp: cellVal(blk11, 1, 16) === '2026-02-28',
      copyValues: cellVal(blk13, 1, 18) === '7' && cellVal(blk13, 2, 18) === '7',
      fillDefault: cellVal(blk13, 1, 19) === '4' && cellVal(blk13, 2, 19) === '4',
      fillDown: cellVal(blk13, 1, 20) === 'D' && cellVal(blk13, 2, 20) === 'D',
      fillRight: cellVal(blk13, 0, 22) === 'R' && cellVal(blk13, 0, 23) === 'R',
      fillUp: cellVal(blk13, 0, 24) === 'U' && cellVal(blk13, 1, 24) === 'U',
      fillLeft: cellVal(blk13, 2, 25) === 'L' && cellVal(blk13, 2, 26) === 'L'
    }
    // 视图层：真实 OfficeSheetView + 委托 client
    xseries.client = {
      call: (m: string, ...args: unknown[]) => (engine as any).call(m, args),
      on: (ev: string, fn: (p: unknown) => void) => { handlers[ev] = fn; return () => { delete handlers[ev] } },
      mediaUrl: (p: string) => (engine as any).call('part', [p]).then((b: Blob) => URL.createObjectURL(b as Blob))
    } as any
    xseries.info = { xlsx: { sheets: [{ index: 0, name: 'Sheet1', hidden: false }], styles: [{}], formats: [], baseFont: {}, date1904: false } } as any
    xseries.ready = true
  } catch (e) {
    R.error = String(e) + ' @step=' + String(R.step) + ' ' + String((e as Error)?.stack ?? '')
  }
}
/** 视图断言：序列对话框（ribbon 命令 → 自绘控件 → 确定 → 内核写入）+ 自动填充选项浮标 */
;(window as any).__smoke.xseriesRunView = async () => {
  const R: any = (window as any).__smoke.xseries
  const out: any = { dialogOpen: null, seriesRow: null, seriesUndo: null, tipShown: null, tipSeries: null, loadReady: null }
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  /** OfficeSheetView 挂载会再发一次 xlsx.load（fire-and-forget），写完前必须等 d.done */
  const waitReady = async (client: any) => {
    for (let i = 0; i < 80; i++) {
      const b: any = await client.call('xlsx.block', 0, 0, 30)
      if (b?.complete) return true
      await wait(100)
    }
    return false
  }
  const clickCell = (r: number, c: number, o: { shift?: boolean } = {}) => {
    const el = document.querySelector(`.ov-cell[data-cell-r="${r}"][data-cell-c="${c}"]`) as HTMLElement | null
    if (!el) return false
    const b = el.getBoundingClientRect()
    const opts: any = { bubbles: true, cancelable: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, button: 0, shiftKey: !!o.shift, view: window }
    el.dispatchEvent(new PointerEvent('pointerdown', opts))
    window.dispatchEvent(new PointerEvent('pointerup', opts))
    return true
  }
  try {
    const client = R.client as any
    const view = (window as any).__smoke.xseries.view
    out.loadReady = await waitReady(client)
    // 1) 序列对话框：K1=100，选 K1:O1 → commands.series() → 确定后 L1..O1 = 101..104（方向默认按行）
    await client.call('xlsx.set', 0, [{ r: 0, c: 10, input: '100' }])
    await wait(120)
    clickCell(0, 10); await wait(40)
    clickCell(0, 14, { shift: true }); await wait(40)
    view.commands.series()
    await wait(80)
    const dlg = document.querySelector('.ov-dlg') as HTMLElement | null
    out.dialogOpen = !!dlg && (dlg.querySelector('.ov-dlg-title')?.textContent ?? '').includes('序列')
    out.noNativeControls = !!dlg && dlg.querySelectorAll('input, select, textarea').length === 0
    const okBtn = dlg?.querySelector('.ov-dlg-ok') as HTMLButtonElement | null
    okBtn?.click()
    await wait(200)
    const blk: any = await client.call('xlsx.block', 0, 0, 3)
    const cellVal = (r: number, c: number) => { const row = (blk.rows as any[]).find((x) => x.r === r); const v = row?.cells.find((x: any[]) => x[0] === c); return v ? v[1] : undefined }
    out.seriesRow = cellVal(0, 10) === '100' && cellVal(0, 11) === '101' && cellVal(0, 14) === '104'
    await client.call('xlsx.undo')
    await wait(120)
    const blkU: any = await client.call('xlsx.block', 0, 0, 3)
    out.seriesUndo = !blkU.rows.some((x: any) => x.r === 0 && x.cells.some((v: any[]) => v[0] >= 11 && v[0] <= 14 && v[1] !== ''))
    // 2) 自动填充选项浮标：P1=1 → 拖填充柄到 P4 → 浮标出现 → 「以序列方式填充」→ P2..P4 = 2/3/4
    await client.call('xlsx.set', 0, [{ r: 0, c: 15, input: '1' }])
    await wait(120)
    clickCell(0, 15); await wait(40)
    const handle = document.querySelector('.ov-fill-handle') as HTMLElement | null
    const target = document.querySelector(`.ov-cell[data-cell-r="3"][data-cell-c="15"]`) as HTMLElement | null
    if (handle && target) {
      const hb = handle.getBoundingClientRect()
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: hb.left + 2, clientY: hb.top + 2, button: 0, view: window }))
      const tb = target.getBoundingClientRect()
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: tb.left + tb.width / 2, clientY: tb.top + tb.height / 2, view: window }))
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }))
      await wait(250)
      out.tipShown = !!document.querySelector('.ov-autofill-wrap')
      ;(document.querySelector('.ov-autofill-btn') as HTMLElement | null)?.click()
      await wait(60)
      const items = [...document.querySelectorAll('.ov-autofill-item')] as HTMLElement[]
      out.tipMenu = items.length
      const fillSeriesBtn = items.find((b) => b.textContent?.includes('以序列方式填充'))
      fillSeriesBtn?.click()
      await wait(250)
      const blk2: any = await client.call('xlsx.block', 0, 0, 6)
      const cv2 = (r: number, c: number) => { const row = (blk2.rows as any[]).find((x) => x.r === r); const v = row?.cells.find((x: any[]) => x[0] === c); return v ? v[1] : undefined }
      out.tipSeries = cv2(1, 15) === '2' && cv2(2, 15) === '3' && cv2(3, 15) === '4'
    } else {
      out.error = 'fill-handle or target cell not found'
    }
  } catch (e) {
    out.error = String(e)
  }
  R.viewResult = out
  return out
}
let xseriesKicked = false
function xseriesView() {
  if (!xseriesKicked) { xseriesKicked = true; void xlsxSeriesCheck() }
  return () =>
    xseries.ready && xseries.client
      ? h('div', { style: 'height:100vh' }, [h(OfficeSheetView, {
          ref: (el: any) => { (xseries as any).view = el },
          client: xseries.client, editable: true, info: xseries.info
        })])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
}

/** 真实引擎宿主（csv）：OfficeEngineHost 渲染 OfficeSheetView */
function csvHostView() {
  return () =>
    h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [
      h(OfficeEngineHost, {
        path: '/a.csv',
        name: 'a.csv',
        editable: true,
        theme: 'dark',
        onError: (m: string) => errors.push(m)
      })
    ])
}

/** 真实引擎：csv 以工作簿打开 → 改 A1 → save 应导出 csv 文本（原格式写回，不是 xlsx） */
async function csvEngineCheck() {
  try {
    const engine = new Engine(() => {})
    const csv = 'h1,h2\n1,2\n3,4'
    await engine.open(new Blob([csv]), { name: 'a.csv' })
    // csv 的 sheet 是流式装载：先 load，等进度 done 再改写
    await engine.call('xlsx.load', [0])
    for (let i = 0; i < 50; i++) {
      const blk: any = await engine.call('xlsx.block', [0, 0, 10])
      if (blk?.rows?.length) break
      await new Promise((r) => setTimeout(r, 100))
    }
    await engine.call('xlsx.set', [0, [{ r: 0, c: 1, input: '改' }]])
    const blob = (await engine.call('save', [])) as Blob
    const text = await blob.text()
    ;(window as any).__smoke.csv = { text, mime: blob.type, size: blob.size }
  } catch (e) {
    ;(window as any).__smoke.csv = { error: String(e) }
  }
}

/** csv 全链路冒烟：真实 DocumentClient（worker 引擎）打开 csv → OfficeSheetView 渲染 */

/** Word 拖动写回冒烟：stub client 推入含表格（90pt 双列）+ 图片（60×40pt）的合成 blocks，
 *  拖 .de-col-grip → editor.setColumnWidths → docx.table；点 img 拖 se 手柄 → setImageSize → docx.edit。
 *  所有 RPC 记入 window.__smoke.docCalls；docx.edit 返回空 EditResult 供 applyResult 安全消费。 */
function docDragView() {
  const docCalls: { method: string; op: unknown }[] = []
  ;(window as any).__smoke.docCalls = docCalls
  const handlers: Record<string, (p: any) => void> = {}
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+8QAAAABJRU5ErkJggg=='
  const pngBytes = new Uint8Array(Array.from(atob(PNG), (c) => c.charCodeAt(0)))
  const textPara = (pid: number, text: string) => ({ t: 'p', pid, ps: {}, runs: [{ t: 'text', text, s: {} }] })
  const imgPara = {
    t: 'p', pid: 1, ps: {},
    // rid 让 inlineSpec/paraSpec 写出 { obj:'image', w, h }，尺寸变化可从 docx.edit 的 RPC 参数断言
    runs: [{ t: 'img', target: 'word/media/image1.png', w: 60, h: 40, rid: 'rIdImg1', alt: 'pic' }]
  }
  const cell = (pid: number, text: string) => ({
    blocks: [textPara(pid, text)], colSpan: 1, rowSpan: 1, borders: {},
    pad: [2, 4, 2, 4] as [number, number, number, number]
  })
  const table = {
    t: 'tbl', tid: 7, cols: [90, 90],
    rows: [
      { cells: [cell(2, 'A1'), cell(3, 'B1')] },
      { cells: [cell(4, 'A2'), cell(5, 'B2')] }
    ]
  }
  const blocks: any[] = [imgPara, table]
  const meta = {
    page: { w: 612, h: 792, mt: 72, mr: 72, mb: 72, ml: 72, header: 36, footer: 36 },
    styles: [], final: true, sectKind: 'nextPage', font: 'PingFang SC', sz: 10
  }
  const client = {
    call: async (m: string, ...args: unknown[]) => {
      docCalls.push({ method: m, op: args[0] })
      if (m === 'docx.edit') return { blocks: {}, markers: {} }
      if (m === 'part') return new Blob([pngBytes], { type: 'image/png' })
      if (m === 'docx.start') {
        // 模拟 worker 流式推送：先 meta，再 blocks，最后 done
        setTimeout(() => {
          handlers['docx:meta']?.(meta)
          handlers['docx:blocks']?.(blocks)
          handlers['docx:done']?.({})
        }, 0)
      }
      return null
    },
    on: (ev: string, fn: (p: unknown) => void) => {
      handlers[ev] = fn as (p: any) => void
      return () => {}
    }
  } as any
  return () =>
    h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [
      h(OfficeDocView, { client, editable: true })
    ])
}

/** Word 97-2003 (.doc) 全链路冒烟：真实 OfficeEngineHost（worker 内核）打开 CFB 文档，验证转换、渲染与错误面 */
function docLegView() {
  return () =>
    h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [
      h(OfficeEngineHost, {
        path: '/sample.doc',
        name: 'a.doc',
        editable: true,
        theme: 'dark',
        onError: (m: string) => errors.push(m)
      })
    ])
}

/** Word 浮动图片环绕 + 长表格跨页 1:1 冒烟：真实 OOXML(wp:anchor + tblHeader) → 视图 → 菜单写入 → save → 重开读回 */
let wwrapKicked = false
const wwrapClient = ref<any>(null)

function wwrapDoc(): Map<string, string | Uint8Array> {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
  const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture'
  const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
  const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+8QAAAABJRU5ErkJggg=='
  const png = new Uint8Array(Array.from(atob(PNG), (c) => c.charCodeAt(0)))
  const paraText = '这是一段用于验证浮动图片文字绕排效果的正文文本，'.repeat(30)
  const anchor =
    `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">` +
    `<wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="column"><wp:align>left</wp:align></wp:positionH>` +
    `<wp:positionV relativeFrom="paragraph"><wp:align>top</wp:align></wp:positionV>` +
    `<wp:extent cx="914400" cy="685800"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:wrapSquare wrapText="bothSides"/>` +
    `<wp:docPr id="1" name="Picture 1"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="${PIC}"><pic:pic>` +
    `<pic:nvPicPr><pic:cNvPr id="1" name="p"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rIdImg1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="685800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:anchor>`
  const cell = (t: string) => `<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`
  const row = (r: number, header: boolean) =>
    `<w:tr><w:trPr><w:trHeight w:val="400" w:hRule="atLeast"/>${header ? '<w:tblHeader/>' : ''}</w:trPr>${cell('A' + r)}${cell('B' + r)}</w:tr>`
  let rows = row(0, true)
  for (let i = 1; i < 120; i++) rows += row(i, false)
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join('')
  const doc =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:pic="${PIC}" xmlns:r="${RNS}">` +
    `<w:body>` +
    `<w:p><w:r><w:drawing>${anchor}</w:drawing></w:r><w:r><w:t>${paraText}</w:t></w:r></w:p>` +
    `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>${rows}</w:tbl>` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>` +
    `</w:body></w:document>`
  return new Map<string, string | Uint8Array>([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImg1" Type="${RNS}/image" Target="media/image1.png"/></Relationships>`],
    ['word/document.xml', doc],
    ['word/media/image1.png', png],
  ])
}

async function wwrapCheck() {
  const R: any = ((window as any).__smoke.wwrap = { ready: false, edits: [] })
  try {
    const { writeZip } = await import('./core/zipwrite')
    const { DocumentClient } = await import('./core/worker/client')
    const blob: Blob = await writeZip(wwrapDoc() as any)
    const client: any = await DocumentClient.open(blob, { worker: false, name: 'wwrap.docx' })
    client.interceptor = (method: string) => {
      if (method === 'docx.edit' || method === 'docx.table') R.edits.push(method)
      return undefined
    }
    wwrapClient.value = client
    R.kind = client.kind
    R.ready = true
    // save → 重开 → 用真实 parser 再读一遍，并检查落盘 document.xml
    ;(window as any).__smoke.saveWwrap = async () => {
      const saved = (await client.call('save')) as Blob
      const c2: any = await DocumentClient.open(saved, { worker: false, name: 'wwrap2.docx' })
      const blocks: any[] = []
      c2.on('docx:blocks', (bs: any) => blocks.push(...bs))
      await c2.call('docx.start')
      const xmlBlob = (await c2.call('part', 'word/document.xml')) as Blob
      const xml = await xmlBlob.text()
      let imgWrap: any = null
      let headerRows = 0
      let tableRows = 0
      for (const b of blocks) {
        if (b.t === 'p') for (const r of b.runs) if (r.t === 'img' && r.wrap) imgWrap = r.wrap
        if (b.t === 'tbl') { tableRows = b.rows.length; for (const row of b.rows) if (row.header) headerRows++ }
      }
      c2.destroy()
      return { xml, imgWrap, headerRows, tableRows, blockCount: blocks.length }
    }
  } catch (e) {
    R.error = String(e)
  }
}

function wwrapView() {
  if (!wwrapKicked) { wwrapKicked = true; void wwrapCheck() }
  return () =>
    wwrapClient.value
      ? h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [h(OfficeDocView, { client: wwrapClient.value, editable: true })])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
}

/** Word 图片旋转 + 修订持久化冒烟：a:xfrm/@rot 落盘重开一致（视图 overlay 随转）；
 *  修订开关下键入/删除产生真实 w:ins/w:del（渲染为下划线/删除线），save→重开仍为修订标记。 */
let wrevKicked = false
const wrev = reactive({ ready: false, client: null as any, view: null as any, error: null as string | null })
async function wrevCheck() {
  const R: any = ((window as any).__smoke.wrev = wrev)
  try {
    const { writeZip } = await import('./core/zipwrite')
    const { DocumentClient } = await import('./core/worker/client')
    const blob: Blob = await writeZip(wwrapDoc() as any)
    const client: any = await DocumentClient.open(blob, { worker: false, name: 'wrev.docx' })
    wrev.client = client
    wrev.ready = true
    // save → 重开 → 读落盘 document.xml 与块模型（rot / ins / del）
    ;(window as any).__smoke.wrevSave = async () => {
      const saved = (await client.call('save')) as Blob
      const c2: any = await DocumentClient.open(saved, { worker: false, name: 'wrev2.docx' })
      const xmlBlob = (await c2.call('part', 'word/document.xml')) as Blob
      const xml = await xmlBlob.text()
      const blocks: any[] = []
      c2.on('docx:blocks', (bs: any) => blocks.push(...bs))
      await c2.call('docx.start')
      let imgRot: number | null = null
      let insRuns = 0
      let delRuns = 0
      for (const b of blocks) {
        if (b.t !== 'p') continue
        for (const r of b.runs) {
          if (r.t === 'img') imgRot = r.rot ?? null
          if (r.tc?.k === 'ins') insRuns++
          if (r.tc?.k === 'del') delRuns++
        }
      }
      c2.destroy()
      return { xml, imgRot, insRuns, delRuns }
    }
  } catch (e) {
    wrev.error = String(e)
  }
}
function wrevView() {
  if (!wrevKicked) { wrevKicked = true; void wrevCheck() }
  return () =>
    wrev.ready && wrev.client
      ? h('div', { style: 'height:100vh' }, [h(OfficeDocView, {
          ref: (el: any) => { wrev.view = el },
          client: wrev.client, editable: true,
          onError: (m: string) => errors.push('wrev:' + m)
        })])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
}

/** Word 页眉页脚 + 分栏 + 图片裁剪 1:1 冒烟：真实 OOXML（headerReference/footerReference + w:cols + a:srcRect）
 *  → 视图每页渲染 HF（PAGE 字段按页号展开）、栏排版、裁剪显示 → 双击 HF 编辑经 docx.hf 写回 →
 *  双击图片进裁剪态拖手柄改 srcRect → save → 重开读回一致。 */
let whfKicked = false
const whf = reactive({ ready: false, client: null as any, view: null as any, error: null as string | null })

function whfDoc(): Map<string, string | Uint8Array> {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
  const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture'
  const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
  const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const HFNS = `xmlns:w="${W}" xmlns:r="${RNS}"`
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+8QAAAABJRU5ErkJggg=='
  const png = new Uint8Array(Array.from(atob(PNG), (c) => c.charCodeAt(0)))
  // 裁剪图：a:srcRect 左右各裁 25%（25000 = 1/1000 percent 单位，模型里为 250 per-mille）
  const cropImg =
    `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="914400" cy="914400"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Cropped"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="${PIC}"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="p"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rIdImg1"/><a:srcRect l="25000" r="25000"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  let body = cropImg
  for (let i = 0; i < 40; i++) body += `<w:p><w:r><w:t>分栏正文第 ${i + 1} 段，用于验证 w:cols 分栏排版与块内流动。</w:t></w:r></w:p>`
  const doc =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:pic="${PIC}" xmlns:r="${RNS}">` +
    `<w:body>${body}` +
    `<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/>` +
    `<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>` +
    `<w:cols w:num="2" w:space="360"/></w:sectPr>` +
    `</w:body></w:document>`
  const header =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${HFNS}>` +
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>HEADER-TEXT 机密</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:hdr>`
  const footer =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${HFNS}>` +
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>FOOTER-TEXT </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`
  return new Map<string, string | Uint8Array>([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdH" Type="${RNS}/header" Target="header1.xml"/><Relationship Id="rIdF" Type="${RNS}/footer" Target="footer1.xml"/><Relationship Id="rIdImg1" Type="${RNS}/image" Target="media/image1.png"/></Relationships>`],
    ['word/document.xml', doc],
    ['word/header1.xml', header],
    ['word/footer1.xml', footer],
    ['word/media/image1.png', png],
  ])
}

async function whfCheck() {
  const R: any = ((window as any).__smoke.whf = whf)
  try {
    const { writeZip } = await import('./core/zipwrite')
    const { DocumentClient } = await import('./core/worker/client')
    const blob: Blob = await writeZip(whfDoc() as any)
    const client: any = await DocumentClient.open(blob, { worker: false, name: 'whf.docx' })
    whf.client = client
    whf.ready = true
    // 内核级：docx.hf 写回（无则建 part+rels+CT）→ save → 重开 → part / meta / crop 读回
    ;(window as any).__smoke.whfKernel = async () => {
      const res: any = await client.call('docx.hf', { parts: { header: [{ text: '内核写回页眉', align: 'center' }] } })
      const firstText = (b: any) => (b?.runs ?? []).find((r: any) => r.t === 'text')?.text ?? null
      const saved = (await client.call('save')) as Blob
      const c2: any = await DocumentClient.open(saved, { worker: false, name: 'whf2.docx' })
      const blocks: any[] = []
      let meta: any = null
      c2.on('docx:blocks', (bs: any) => blocks.push(...bs))
      c2.on('docx:meta', (m: any) => { meta = m })
      await c2.call('docx.start')
      await new Promise((r) => setTimeout(r, 300))
      const hdrXml = await ((await c2.call('part', 'word/header1.xml')) as Blob).text()
      let crop: any = null
      for (const b of blocks) if (b.t === 'p') for (const r of b.runs) if (r.t === 'img') crop = r.crop ?? null
      c2.destroy()
      return {
        hfResHeader: firstText(res?.headers?.header?.[0]),
        hdrXmlHasNew: hdrXml.includes('内核写回页眉'),
        metaCols: meta?.page?.cols ?? null,
        metaHeaderFirst: firstText(meta?.header?.[0]),
        crop
      }
    }
  } catch (e) {
    whf.error = String(e)
  }
}

function whfView() {
  if (!whfKicked) { whfKicked = true; void whfCheck() }
  return () =>
    whf.ready && whf.client
      ? h('div', { style: 'height:100vh' }, [h(OfficeDocView, {
          ref: (el: any) => { whf.view = el },
          client: whf.client, editable: true,
          onError: (m: string) => errors.push('whf:' + m)
        })])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
}

// 各域独立探针文件（__smoke-<domain>.ts）在模块加载时自行注册，零共享写
import.meta.glob('./__smoke-*.ts', { eager: true })

const registeredView = getSmokeMode(mode ?? '')

createApp({
  setup: registeredView || (mode === 'tabs' ? tabsView
    : mode === 'slide' ? slideView
    : mode === 'sheet' ? sheetView
    : mode === 'docdrag' ? docDragView
    : mode === 'csvhost' ? csvHostView
    : mode === 'xdraw' ? xdrawView
    : mode === 'xdrawop' ? xdrawOpView
    : mode === 'xfeat' ? xfeatView
    : mode === 'xfill' ? xfillView
    : mode === 'xseries' ? xseriesView
    : mode === 'stream' ? streamView
    : mode === 'json' ? jsonView
    : mode === 'head' ? headView
    : mode === 'jsonpane' ? jsonPaneView
    : mode === 'find' ? findView
    : mode === 'md' ? mdView
    : mode === 'wrap' ? wrapView
    : mode === 'docleg' ? docLegView
    : mode === 'wwrap' ? wwrapView
    : mode === 'wrev' ? wrevView
    : mode === 'whf' ? whfView
    : mode === 'prot' ? protView
    : ribbonKind ? ribbonView
    : hostView)
}).mount('#app')
