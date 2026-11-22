/**
 * 第四批 PPT 内核冒烟探针（?mode=p4）：现场拼最小 pptx（含 emphasis/exit 动画 mainSeq、
 * 2×2 含 gridSpan=2 的表格），真实 Engine 跑：
 *  ① 无 notesMaster 时新建备注 → 全套 part/rels/CT/notesMasterIdLst 合规、save→重开一致；
 *  ② emphasis/exit/entrance 解析 + 写回 + 按 mainSeq clickEffect 顺序播放序列；
 *  ③ 合并感知的表格行列增删 + undo/redo + 每行逻辑列数与 tblGrid 对齐；
 *  落盘 OOXML 交叉引用校验（part / rels / Content_Types / notesMasterIdLst）。
 * 注册模式见 smoke-modes.ts；结果挂 window.__smoke.p4Result（稳定键，不在模块求值期触碰 mode 对象）。
 */
import { h, reactive } from 'vue'
import { registerSmokeMode } from './smoke-modes'

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const SLIDE_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

/** 一个 clickEffect 组（mainSeq → click group → effect cTn），带可定位的 p:spTgt spid */
function grpXml(id: number, spid: number, cls: string, pid: number): string {
  const body =
    `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="99" dur="500"/>` +
    `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr></p:animEffect>`
  return (
    `<p:par><p:cTn id="${id}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>` +
    `<p:par><p:cTn id="${id + 1}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
    `<p:par><p:cTn id="${id + 2}" presetID="${pid}" presetClass="${cls}" presetSubtype="0" fill="hold" nodeType="clickEffect">` +
    `<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${body}</p:childTnLst></p:cTn></p:par>` +
    `</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`
  )
}

/** 顺序刻意与形状 id 不同：4(emph spin) → 2(exit fadeOut) → 3(entr appear) */
function timingXml(): string {
  const inner = grpXml(3, 4, 'emph', 8) + grpXml(6, 2, 'exit', 10) + grpXml(9, 3, 'entr', 1)
  return (
    `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>` +
    `<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${inner}</p:childTnLst></p:cTn>` +
    `<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>` +
    `<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>` +
    `</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`
  )
}

function buildParts(): Map<string, string> {
  const cell = (t: string, attrs = '') =>
    `<a:tc${attrs}><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${t}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>`
  const sp = (id: number, name: string) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${1000000 + id * 500000}" y="1000000"/><a:ext cx="1200000" cy="600000"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${name}</a:t></a:r></a:p></p:txBody></p:sp>`
  // 2×2 表格，tr0 一个 gridSpan=2 的合并单元格（非标准表示，无 hMerge 延续）
  const table =
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="Table5"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="400000" y="4000000"/><a:ext cx="4000000" cy="1200000"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/>` +
    `<a:tblGrid><a:gridCol w="2000000"/><a:gridCol w="2000000"/></a:tblGrid>` +
    `<a:tr h="300000">${cell('A1B1', ' gridSpan="2"')}</a:tr>` +
    `<a:tr h="300000">${cell('A2')}${cell('B2')}</a:tr>` +
    `</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
  const slide =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}">` +
    `<p:cSld><p:spTree>${grp}${sp(2, 'S2')}${sp(3, 'S3')}${sp(4, 'S4')}${table}</p:spTree></p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${timingXml()}</p:sld>`
  return new Map<string, string>([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`],
    ['ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${RNS}/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="${RNS}/theme" Target="theme/theme1.xml"/></Relationships>`],
    ['ppt/slides/slide1.xml', slide],
    ['ppt/slides/_rels/slide1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`],
    ['ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}" type="title" preserve="1"><p:cSld name="Title"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`],
    ['ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:cSld name="Master"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${RNS}/theme" Target="../theme/theme1.xml"/></Relationships>`],
    ['ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="${A}" name="Test"><a:themeElements><a:clrScheme name="Test"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Test"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="Test"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`],
  ])
}

async function p4Probe(R: any): Promise<void> {
  const { writeZip } = await import('./core/zipwrite')
  const { Engine } = await import('./core/worker/engine')
  const blob: Blob = await writeZip(buildParts() as any)
  const tableOf = (s: any) => (s?.els ?? []).find((e: any) => e.t === 'table')
  const shapeOf = (s: any, top: number) => (s?.els ?? []).find((e: any) => e.top === top)
  const rowLogical = (row: any) => (row?.cells ?? []).reduce((n: number, c: any) => n + (c.hidden ? 0 : (c.colSpan || 1)), 0)
  const tableLegal = (s: any) => { const t = tableOf(s); return !!t && t.rows.every((r: any) => rowLogical(r) === t.cols.length) }
  const text = async (e: any, p: string) => { try { return await ((await e.call('part', [p])) as Blob).text() } catch { return '' } }

  const e1 = new Engine(() => {})
  await e1.open(blob, { name: 'p4.pptx' })
  const s0: any = await e1.call('pptx.slide', [0])
  R.initial = {
    animSeq: s0.animSeq?.map((e: any) => [e.spid, e.preset, e.cls]),
    anim2: shapeOf(s0, 2)?.anim, anim3: shapeOf(s0, 3)?.anim, anim4: shapeOf(s0, 4)?.anim,
    tableRows: tableOf(s0)?.rows?.length, tableCols: tableOf(s0)?.cols?.length,
    cell00: tableOf(s0)?.rows?.[0]?.cells?.[0]?.text?.paras?.[0]?.runs?.[0]?.text,
    tableLegal: tableLegal(s0),
  }

  // ① 无 notesMaster 时新建备注（内核应创建全套 part/rels/CT/notesMasterIdLst）
  const sNotes: any = await e1.call('pptx.notes', [0, '第四批备注\n第二行'])
  R.notesWritten = sNotes.notes

  // ② emphasis / exit / entrance 写回（保留 mainSeq clickEffect 原位置顺序）
  const sAnim: any = await e1.call('pptx.shapes', [0, [
    { op: 'anim', top: 2, preset: 'growShrink' },
    { op: 'anim', top: 3, preset: 'disappear' },
    { op: 'anim', top: 4, preset: 'fade' },
  ]])
  R.animWritten = sAnim.animSeq?.map((e: any) => [e.spid, e.preset, e.cls])

  // ③ 合并表格：加行 + 加列 → 3×3，逻辑列对齐
  const sGrow: any = await e1.call('pptx.shapes', [0, [
    { op: 'tblRow', top: 5, kind: 'add', at: 0 },
    { op: 'tblCol', top: 5, kind: 'add', at: 0 },
  ]])
  R.grow = { rows: tableOf(sGrow)?.rows?.length, cols: tableOf(sGrow)?.cols?.length, legal: tableLegal(sGrow) }
  // 删列 + 删行 → 回到 2×2，仍合法
  const sShrink: any = await e1.call('pptx.shapes', [0, [
    { op: 'tblCol', top: 5, kind: 'delete', at: 1 },
    { op: 'tblRow', top: 5, kind: 'delete', at: 1 },
  ]])
  R.shrink = { rows: tableOf(sShrink)?.rows?.length, cols: tableOf(sShrink)?.cols?.length, legal: tableLegal(sShrink) }
  // undo / redo（本次调用一条 editSlide 记录）
  const u: any = await e1.call('pptx.undo', [false])
  R.undo = { rows: tableOf(u?.model)?.rows?.length, cols: tableOf(u?.model)?.cols?.length, legal: tableLegal(u?.model ?? {}) }
  const rd: any = await e1.call('pptx.undo', [true])
  R.redo = { rows: tableOf(rd?.model)?.rows?.length, cols: tableOf(rd?.model)?.cols?.length, legal: tableLegal(rd?.model ?? {}) }

  // save → 重开一致
  const out = (await e1.call('save', [])) as Blob
  R.savedSize = out.size
  const buf = await out.arrayBuffer()
  ;(window as any).__smoke.p4Bytes = Array.from(new Uint8Array(buf))
  const e2 = new Engine(() => {})
  await e2.open(new Blob([buf], { type: SLIDE_MIME }), { name: 'p4-out.pptx' })
  const s2: any = await e2.call('pptx.slide', [0])
  R.re = {
    notes: s2.notes,
    animSeq: s2.animSeq?.map((e: any) => [e.spid, e.preset, e.cls]),
    rows: tableOf(s2)?.rows?.length, cols: tableOf(s2)?.cols?.length, legal: tableLegal(s2),
  }

  // 落盘 OOXML 交叉引用校验
  const nmXml = await text(e2, 'ppt/notesMasters/notesMaster1.xml')
  const nmRels = await text(e2, 'ppt/notesMasters/_rels/notesMaster1.xml.rels')
  const ct = await text(e2, '[Content_Types].xml')
  const pres = await text(e2, 'ppt/presentation.xml')
  const presRels = await text(e2, 'ppt/_rels/presentation.xml.rels')
  const nsRels = await text(e2, 'ppt/notesSlides/_rels/notesSlide1.xml.rels')
  const nsXml = await text(e2, 'ppt/notesSlides/notesSlide1.xml')
  const slideXml = await text(e2, 'ppt/slides/slide1.xml')
  const i4 = slideXml.indexOf('spid="4"'), i2 = slideXml.indexOf('spid="2"'), i3 = slideXml.indexOf('spid="3"')
  R.xml = {
    nmPart: nmXml.includes('<p:notesMaster') && nmXml.includes('<p:clrMap'),
    nmRelsTheme: nmRels.includes('/theme'),
    ctMaster: ct.includes('notesMaster+xml') && ct.includes('notesSlide+xml'),
    presIdLst: pres.includes('<p:notesMasterIdLst>') && /<p:notesMasterId\s+r:id=/.test(pres),
    presRels: presRels.includes('/notesMaster'),
    nsRelsMaster: nsRels.includes('/notesMaster') && nsRels.includes('/slide'),
    nsBody: nsXml.includes('第四批备注'),
    timingEmph: slideXml.includes('presetClass="emph"'),
    timingExit: slideXml.includes('presetClass="exit"'),
    timingEntr: slideXml.includes('presetClass="entr"'),
    mainSeq: slideXml.includes('nodeType="mainSeq"') && slideXml.includes('nodeType="clickEffect"'),
    clickOrder: i4 >= 0 && i2 > i4 && i3 > i2, // spid 4 → 2 → 3 的 clickEffect 顺序
    gridAligned: /<a:tblGrid>/.test(slideXml), // 表格 part 存在（合法性由 tableLegal 判定）
  }
  R.done = true
}

registerSmokeMode('p4', function p4View() {
  const win = window as any
  if (!win.__smoke) win.__smoke = {}
  const R: any = (win.__smoke.p4Result = {})
  const state = reactive({ done: false, summary: 'running' })
  void p4Probe(R).then(
    () => { state.done = true; state.summary = JSON.stringify(R) },
    (e) => { R.error = String((e as Error).stack || e); state.done = true; state.summary = JSON.stringify(R) },
  )
  return () => h('div', { style: 'height:100vh' }, [
    h('div', { id: 'p4-status' }, state.done ? 'DONE' : 'RUNNING'),
    h('pre', { id: 'p4-result' }, state.summary),
  ])
})
