/**
 * x21 探针（路线图 P7，?mode=x21）：映射层补全的**内核口径**固化。
 * 四节：A OPC Types 注册表 + 文件名计数器；B PostLoadPrepare 二段装配；
 * C compatibilityMode 门控算术 + 表距两层语义；D 未知元素透传 round-trip。
 *
 * 取证来源（sdkjs release/v10.0.0，逐行核实）：
 *   - A：common/openxml.js Types 注册表 :679-827、MimeTypes :628-677、
 *       generateNextFilename :253-266（计数器：无 [N] 直返；key=enumerateType||relationType，
 *       首调 1 置 2，后续 `nextIndex=idx[key]++`；替换全局 \[N\]）、
 *       generateTargetByType :267-273（dir 非空 `dir+"/"+filename`）、ContentTypes.add :159-172。
 *   - B：word/Editor/Serialize2.js PostLoadPrepare :8166-8340（缺省样式按归一化名 :8188 查快照补齐）、
 *       PostLoadPrepareCheckStylesRecursion :8149-8163（灰标三色：undefined 进/1 visiting 重入切断/0 done 跳过）、
 *       Styles.js CreateNormal :6728 / CreateDefaultParagraphFont :6735 / CreateNoList :6744 /
 *       Create_NormalTable :792-824（tblCellMar 左右 108dxa=5.4pt）。
 *   - C：CTablePr.InitDefault :11136-11137（mode≤Word12 → 0.5pt，否则 5.4pt）、
 *       Document.js nAdd 门控 :20094/:27793/:27810（mode≤Word14 → 10.8pt，否则 0）、
 *       Get_Pr case styletype_Table :8116-8148（种子=InitDefault，链 merge Normal Table 覆盖）。
 *   - D：MdView 结构性透传——docx writer saveDocx 未触碰 item 原样写回（doc.items[i] 不经 parseXml）；
 *       genParagraph :507-511 克隆源 pPr（未知子元素存活）；RNode 字节保真树（raw.ts :1-3）。
 *       sdkjs 侧对照 ReadUnknown=1（SerializeCommonWordExcel.js:57）为二进制流跳过语义，非 OOXML 透传，不断言。
 *
 * 顶层只注册 mode；结果挂 window.__smoke.x21。
 */
import { h } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import { parseXml, kid, kids, type XEl } from './core/xml'
import { TYPES, MIME_TYPES, mimeTypeOf, PartNameIndex, contentTypesAdd } from './core/opc-types'
import { cutBasedOnCycles, missingDefaultStyles, normStyleName } from './core/docx/postload'
import { parseCompatMode, defaultCellMarginPt, newTableNAddPt } from './core/docx/compat'
import { StyleSheet } from './core/docx/styles'
import { Numbering } from './core/docx/numbering'
import { Converter } from './core/docx/parser'
import { parseTheme } from './core/theme'
import { Engine } from './core/worker/engine'
import { writeZip } from './core/zipwrite'
import { ZipArchive } from './core/zip'
import { BufferSource } from './core/source'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

async function run(): Promise<Record<string, unknown>> {
  const R: Record<string, unknown> = { ok: false, errors: [] as string[] }
  const errs = R.errors as string[]
  const eq = (name: string, a: unknown, b: unknown) => {
    if (a !== b) errs.push(`${name}: 实=${JSON.stringify(a)} 期=${JSON.stringify(b)}`)
  }
  const near = (name: string, a: number, b: number) => {
    if (Math.abs(a - b) > 1e-9) errs.push(`${name}: 实=${a} 期=${b}`)
  }

  // ── A. OPC Types 注册表 + PartNameIndex 计数器轨迹 ──
  // 注册表规模与抽查（直抄完整性）
  const nTypes = Object.keys(TYPES).length
  R.typesCount = nTypes
  if (!(nTypes >= 120 && nTypes <= 160)) errs.push(`TYPES 条目数越界: ${nTypes}`)
  eq('mainDocument.dir', TYPES.mainDocument.dir, 'word')
  eq('mainDocument.filename', TYPES.mainDocument.filename, 'document.xml')
  eq('mainDocument.ct 后缀', TYPES.mainDocument.contentType.endsWith('.document.main+xml'), true)
  eq('mainDocument.rt 后缀', TYPES.mainDocument.relationType.endsWith('/officeDocument'), true)
  eq('imageWord 尾点文件名', TYPES.imageWord.filename, 'image[N].')
  eq('customXml 空 contentType（原文注释态照抄）', TYPES.customXml.contentType, '')
  eq('slideComments 共享枚举键', TYPES.slideComments.enumerateType, 'comments/comment')
  eq('presentationComments 同键', TYPES.presentationComments.enumerateType, 'comments/comment')
  eq('drawings 与 chartDrawing 同 enumerateType', TYPES.drawings.enumerateType === TYPES.chartDrawing.enumerateType, true)
  // MIME 表（OPC Default 口径）
  eq('mime png', MIME_TYPES.png, 'image/png')
  eq('mime rels', MIME_TYPES.rels, 'application/vnd.openxmlformats-package.relationships+xml')
  eq('mime bin', MIME_TYPES.bin, 'application/vnd.openxmlformats-officedocument.oleObject')
  eq('mimeTypeOf 已知', mimeTypeOf('svg'), 'image/svg+xml')
  eq('mimeTypeOf 未知兜底', mimeTypeOf('zzz'), 'application/octet-stream')

  // 计数器轨迹（openxml.js:253-273 语义逐条锁）
  const idx = new PartNameIndex()
  eq('A1 无 [N] 直返', idx.nextFilename(TYPES.styles), 'styles.xml')
  eq('A2 targetByType dir 拼接', idx.targetByType(TYPES.mainDocument), 'word/document.xml')
  eq('A3 slide 首调', idx.targetByType(TYPES.slide), 'slides/slide1.xml')
  eq('A4 slide 二调', idx.targetByType(TYPES.slide), 'slides/slide2.xml')
  eq('A5 slide 三调', idx.targetByType(TYPES.slide), 'slides/slide3.xml')
  // 共享 enumerateType：交替调用同一计数器（key='comments/comment'）
  eq('A6 slideComments 首调', idx.targetByType(TYPES.slideComments), '../comments/comment1.xml')
  eq('A7 presentationComments 吃到共享计数', idx.targetByType(TYPES.presentationComments), 'comments/comment2.xml')
  eq('A8 slideComments 三调', idx.targetByType(TYPES.slideComments), '../comments/comment3.xml')
  // drawings/chartDrawing 共享 'drawings/drawing'
  eq('A9 drawings 首调', idx.targetByType(TYPES.drawings), '../drawings/drawing1.xml')
  eq('A10 chartDrawing 吃到共享计数', idx.targetByType(TYPES.chartDrawing), '../drawings/drawing2.xml')
  // 不同 relationType 计数器独立（filename 同为 sheet[N].xml 是判别器）
  eq('A11 worksheet 起 1', idx.targetByType(TYPES.worksheet), 'worksheets/sheet1.xml')
  eq('A12 chartsheet 独立起 1', idx.targetByType(TYPES.chartsheet), 'chartsheets/sheet1.xml')
  eq('A13 worksheet 二调', idx.targetByType(TYPES.worksheet), 'worksheets/sheet2.xml')
  // image 尾点保留（扩展名由媒体补）
  eq('A14 imageWord 首调', idx.targetByType(TYPES.imageWord), 'media/image1.')
  eq('A15 imageWord 二调', idx.targetByType(TYPES.imageWord), 'media/image2.')

  // ContentTypes.add（:159-172）
  const ov = new Map<string, string>()
  const df = new Map<string, string>()
  eq('A16 add 新增返回 true', contentTypesAdd(ov, df, '/word/document.xml', TYPES.mainDocument.contentType), true)
  eq('A17 override 写入', ov.get('/word/document.xml'), TYPES.mainDocument.contentType)
  eq('A18 default 补 xml', df.get('xml'), 'application/xml')
  eq('A19 重复 add 返回 false', contentTypesAdd(ov, df, '/word/document.xml', TYPES.mainDocument.contentType), false)
  eq('A20 空 contentType 不写 override', contentTypesAdd(ov, df, '/word/customXml/item1.xml', ''), true)
  eq('A21 override 未被空串污染', ov.has('/word/customXml/item1.xml'), false)
  eq('A22 default 仍补 png', contentTypesAdd(ov, df, '/word/media/image1.png', 'image/png'), true)
  eq('A23 png 入 defaults', df.get('png'), 'image/png')

  // ── B. PostLoadPrepare 二段装配 ──
  // 灰标法四态（Serialize2.js:8149-8163；切断集合随插入顺序——环中最先被重入的成员）
  const linksOf = (pairs: [string, string | undefined][]): Map<string, string | undefined> => new Map(pairs)
  const cutOf = (pairs: [string, string | undefined][]): string[] => [...cutBasedOnCycles(linksOf(pairs))].sort()
  eq('B1 无链', cutOf([]).join(','), '')
  eq('B2 无环链', cutOf([['A', 'B'], ['B', 'C']]).join(','), '')
  eq('B3 BasedOn 缺失', cutOf([['A', undefined]]).join(','), '')
  eq('B4 指向表外 id', cutOf([['A', 'X']]).join(','), '')
  eq('B5 自环', cutOf([['A', 'A']]).join(','), 'A')
  eq('B6 双环 A 先插入', cutOf([['A', 'B'], ['B', 'A']]).join(','), 'A')
  eq('B7 双环 B 先插入（切断随遍历序）', cutOf([['B', 'A'], ['A', 'B']]).join(','), 'B')
  eq('B8 三环', cutOf([['A', 'B'], ['B', 'C'], ['C', 'A']]).join(','), 'A')
  eq('B9 第三方链入已断环（done 跳过不再切）', cutOf([['A', 'B'], ['B', 'A'], ['C', 'A']]).join(','), 'A')
  eq('B10 菱形汇合', cutOf([['A', 'C'], ['B', 'C']]).join(','), '')
  eq('B11 每环恰切一处', cutOf([['A', 'B'], ['B', 'C'], ['C', 'A'], ['D', 'E'], ['E', 'D']]).join(','), 'A,D')

  // 缺省样式合成（Styles.js Create* 系列形态）
  eq('B12 空表补四个', missingDefaultStyles([]).map((s) => s.id).join(','), 'normal,DefaultParagraphFont,NoList,NormalTable')
  eq('B13 大小写/空白归一命中', missingDefaultStyles([' normal ']).map((s) => s.id).join(','), 'DefaultParagraphFont,NoList,NormalTable')
  eq('B14 全有则空', missingDefaultStyles(['Normal', 'Default Paragraph Font', 'No List', 'Normal Table']).length, 0)
  eq('B15 normStyleName', normStyleName('Default  Paragraph\tFont'), 'defaultparagraphfont')
  const nt = missingDefaultStyles([]).find((s) => s.id === 'NormalTable')!
  eq('B16 NormalTable type', nt.type, 'table')
  const ntMar = kid(kid(nt.el, 'tblPr'), 'tblCellMar')!
  eq('B17 NormalTable left 108dxa', kid(ntMar, 'left')!.a.w, '108')
  eq('B18 NormalTable right 108dxa', kid(ntMar, 'right')!.a.w, '108')
  eq('B19 NormalTable top 0', kid(ntMar, 'top')!.a.w, '0')
  const dpf = missingDefaultStyles([]).find((s) => s.id === 'DefaultParagraphFont')!
  eq('B20 DPF uiPriority 1', kid(dpf.el, 'uiPriority')!.a.val, '1')
  eq('B21 DPF semiHidden', !!kid(dpf.el, 'semiHidden'), true)
  eq('B22 Normal qFormat', !!kid(missingDefaultStyles([]).find((s) => s.id === 'normal')!.el, 'qFormat'), true)

  // StyleSheet 端到端：环切断 + 注入落槽（对照锁「切断生效」）
  const theme = parseTheme(undefined)
  const cycleXml = `${DECL}<w:styles xmlns:w="${W}">` +
    '<w:style w:type="paragraph" w:styleId="S1"><w:name w:val="s1"/><w:basedOn w:val="S2"/><w:rPr><w:i/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="S2"><w:name w:val="s2"/><w:basedOn w:val="S1"/><w:rPr><w:b/></w:rPr></w:style>' +
    '</w:styles>'
  const ssPre = new StyleSheet(parseXml(cycleXml), theme)
  eq('B23 装配前对照：S1 链吃到 S2 的 b', ssPre.para('S1').rs.b, true)
  const ss = new StyleSheet(parseXml(cycleXml), theme)
  ss.applyPostload()
  eq('B24 切断后 S1 不含 b', ss.para('S1').rs.b, undefined)
  eq('B25 S1 自有 i 保留', ss.para('S1').rs.i, true)
  eq('B26 S2 链 S1 保留（每环只切一处）', ss.para('S2').rs.b, true)
  eq('B27 S2 经 S1 吃到 i', ss.para('S2').rs.i, true)
  eq('B28 Normal 注入落 defaultPara', ss.defaultPara, 'normal')
  eq('B29 Normal Table 落 defaultTable', ss.defaultTable, 'NormalTable')
  eq('B30 DPF/NoList 入表', ss.has('DefaultParagraphFont') && ss.has('NoList'), true)
  eq('B31 canonical.normal 指向注入', ss.canonical().normal, 'normal')

  // ── C. compatibilityMode 门控算术 ──
  const settingsOf = (inner: string): XEl => parseXml(`${DECL}<w:settings xmlns:w="${W}">${inner}</w:settings>`)
  eq('C1 undefined → 12', parseCompatMode(undefined), 12)
  eq('C2 无 compat → 12', parseCompatMode(settingsOf('')), 12)
  eq('C3 标准 uri+val=15', parseCompatMode(settingsOf('<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>')), 15)
  eq('C4 url 别名兼容', parseCompatMode(settingsOf('<w:compat><w:compatSetting w:name="compatibilityMode" w:url="http://schemas.microsoft.com/office/word" w:val="11"/></w:compat>')), 11)
  eq('C5 小数截断（parseInt 口径）', parseCompatMode(settingsOf('<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="14.5"/></w:compat>')), 14)
  eq('C6 非数字 → 缺省', parseCompatMode(settingsOf('<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="abc"/></w:compat>')), 12)
  eq('C7 异名条目忽略', parseCompatMode(settingsOf('<w:compat><w:compatSetting w:name="other" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>')), 12)
  eq('C8 异 uri 忽略', parseCompatMode(settingsOf('<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://other" w:val="15"/></w:compat>')), 12)
  eq('C9 多条取首个可解析', parseCompatMode(settingsOf('<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="11"/><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>')), 11)
  // 门控算术（InitDefault :11136-11137 / nAdd :20094 等）
  eq('C10 margin Word11', defaultCellMarginPt(11), 0.5)
  eq('C11 margin Word12（边界含）', defaultCellMarginPt(12), 0.5)
  near('C12 margin Word13', defaultCellMarginPt(13), 5.4)
  near('C13 margin Word14', defaultCellMarginPt(14), 5.4)
  near('C14 margin Word15', defaultCellMarginPt(15), 5.4)
  eq('C15 nAdd Word11', newTableNAddPt(11), 10.8)
  eq('C16 nAdd Word14（边界含）', newTableNAddPt(14), 10.8)
  eq('C17 nAdd Word15', newTableNAddPt(15), 0)

  // 表距两层语义端到端（种子 compat + 链 Normal Table 覆盖）；Converter 直构不走 Engine
  const tblCellPad = (stylesXml: string | undefined, tblXml: string, mode: number): [number, number, number, number] => {
    const ss2 = new StyleSheet(stylesXml ? parseXml(stylesXml) : undefined, theme)
    ss2.applyPostload()
    const conv = new Converter(ss2, new Numbering(undefined, theme), theme, new Map(), {}, mode)
    const t = conv.table(parseXml(tblXml))
    return t.rows[0].cells[0].pad
  }
  const TBL = (styleVal?: string): string =>
    `${DECL}<w:tbl xmlns:w="${W}"><w:tblPr>${styleVal ? `<w:tblStyle w:val="${styleVal}"/>` : ''}</w:tblPr>` +
    '<w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>'
  const stylesT1 = `${DECL}<w:styles xmlns:w="${W}">` +
    '<w:style w:type="table" w:styleId="T1"><w:name w:val="my tbl"/></w:style></w:styles>'
  // 无样式表：种子 5.4（mode15）+ 链 Normal Table 5.4 → 恒 5.4
  const c1 = tblCellPad(undefined, TBL(), 15)
  eq('C18 无样式表 mode15 pad', JSON.stringify(c1), JSON.stringify([0, 5.4, 0, 5.4]))
  // 无样式表 mode11：种子 0.5 但 Normal Table 注入后链覆盖 5.4（postload 不可省的判别器）
  const c2 = tblCellPad(undefined, TBL(), 11)
  eq('C19 无样式表 mode11 链覆盖种子', JSON.stringify(c2), JSON.stringify([0, 5.4, 0, 5.4]))
  // 自定义表样式缺 cellMar mode11：链=[T1] 无 cellMar → 吃到 compat 种子 0.5（两层语义核心判别器）
  const c3 = tblCellPad(stylesT1, TBL('T1'), 11)
  eq('C20 自定义表样式缺 cellMar 吃种子', JSON.stringify(c3), JSON.stringify([0, 0.5, 0, 0.5]))
  // 同表 mode15 → 种子 5.4
  const c4 = tblCellPad(stylesT1, TBL('T1'), 15)
  eq('C21 同表 mode15 种子 5.4', JSON.stringify(c4), JSON.stringify([0, 5.4, 0, 5.4]))
  // 缺省 tblStyle（落 defaultTable=NormalTable）→ 链 5.4 覆盖种子
  const c5 = tblCellPad(stylesT1, TBL(), 11)
  eq('C22 无 tblStyle 落 NormalTable 链', JSON.stringify(c5), JSON.stringify([0, 5.4, 0, 5.4]))
  // 直设 tblCellMar 最后压顶
  const tblDirect = `${DECL}<w:tbl xmlns:w="${W}"><w:tblPr><w:tblCellMar><w:left w:w="50" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    '<w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>'
  const c6 = tblCellPad(undefined, tblDirect, 11)
  eq('C23 直设 tblCellMar 压顶（2.5pt）', JSON.stringify(c6), JSON.stringify([0, 2.5, 0, 2.5]))
  R.compatTables = { c1, c2, c3, c4, c5, c6 }

  // ── D. 未知元素透传 round-trip（Engine 端到端） ──
  // 三处未知：① 顶层 xyz:thing（item 级字节透传）② p1 的 pPr 内 xyz:meta（genParagraph 克隆源 pPr 存活）
  // ③ settings compat=15（meta 通道）。未触碰 save 恒等 → 编辑两段 → 未知仍存活。
  const DOC = `${DECL}<w:document xmlns:w="${W}" xmlns:xyz="http://example.test/xyz"><w:body>` +
    '<w:p><w:pPr><w:jc w:val="center"/><xyz:meta xyz:id="7"/></w:pPr><w:r><w:t xml:space="preserve">hello</w:t></w:r></w:p>' +
    '<xyz:thing note="keep"><xyz:inner>payload</xyz:inner></xyz:thing>' +
    '<w:p><w:r><w:t>second</w:t></w:r></w:p>' +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/></w:sectPr>' +
    '</w:body></w:document>'
  const SET = `${DECL}<w:settings xmlns:w="${W}"><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`
  const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const PKGREL = 'http://schemas.openxmlformats.org/package/2006/relationships'
  const book = new Map<string, string | Uint8Array>([
    ['[Content_Types].xml', `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '</Types>'],
    ['_rels/.rels', `${DECL}<Relationships xmlns="${PKGREL}"><Relationship Id="rId1" Type="${RT}/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', DOC],
    ['word/settings.xml', SET],
    ['word/styles.xml', `${DECL}<w:styles xmlns:w="${W}"/>`],
    ['word/_rels/document.xml.rels', `${DECL}<Relationships xmlns="${PKGREL}">` +
      `<Relationship Id="rId1" Type="${RT}/settings" Target="settings.xml"/>` +
      `<Relationship Id="rId2" Type="${RT}/styles" Target="styles.xml"/></Relationships>`],
  ])
  const dres: Record<string, unknown> = {}
  try {
    const blob = await writeZip(book)
    let meta: any = null
    const paras: { pid?: number; text: string }[] = []
    const e = new Engine((ev: string, p: any) => {
      if (ev === 'docx:meta') meta = p
      if (ev === 'docx:blocks') {
        for (const b of p as any[]) {
          if (b.t === 'p') paras.push({ pid: b.pid, text: (b.runs ?? []).map((r: any) => r.text ?? '').join('') })
        }
      }
      if (p?.error) errs.push(`engine event error: ${p.error}`)
    })
    await e.open(blob, { name: 'passthru.docx' })
    await e.call('docx.start', [])
    for (let i = 0; i < 200 && !meta; i++) await new Promise((r) => setTimeout(r, 50))
    if (!meta) throw new Error('docx 无 meta 终态')
    eq('D1 meta.compatMode=15', meta.compatMode, 15)
    const pidHello = paras.find((x) => x.text === 'hello')?.pid
    const pidSecond = paras.find((x) => x.text === 'second')?.pid
    if (pidHello === undefined || pidSecond === undefined) throw new Error(`段落 pid 缺失: ${JSON.stringify(paras)}`)

    // 未触碰 save：document.xml 字节恒等
    const saved1 = (await e.call('save', [])) as Blob
    const z1 = await ZipArchive.open(new BufferSource(new Uint8Array(await saved1.arrayBuffer())))
    const doc1 = await z1.text('word/document.xml')
    dres.untouchedIdentical = doc1 === DOC
    if (!dres.untouchedIdentical) errs.push(`D2 未触碰 save 非字节恒等（len ${doc1.length} vs ${DOC.length}）`)

    // 编辑两段（genParagraph 重生成路径）后 save
    await e.call('docx.edit', [{ anchor: pidHello, list: [{ pid: pidHello, from: pidHello, pristine: false, parts: [[{ text: 'hi' }]] }] }])
    await e.call('docx.edit', [{ anchor: pidSecond, list: [{ pid: pidSecond, from: pidSecond, pristine: false, parts: [[{ text: 'world' }]] }] }])
    const saved2 = (await e.call('save', [])) as Blob
    const z2 = await ZipArchive.open(new BufferSource(new Uint8Array(await saved2.arrayBuffer())))
    const doc2 = await z2.text('word/document.xml')
    dres.edited = {
      thing: doc2.includes('<xyz:thing note="keep"><xyz:inner>payload</xyz:inner></xyz:thing>'),
      meta: doc2.includes('<xyz:meta xyz:id="7"/>'),
      jc: doc2.includes('<w:jc w:val="center"/>'),
      hi: doc2.includes('>hi<'),
      world: doc2.includes('>world<'),
      noHello: !doc2.includes('hello'),
      noSecond: !doc2.includes('second'),
    }
    const de = dres.edited as Record<string, boolean>
    eq('D3 顶层未知元素字节透传', de.thing, true)
    eq('D4 pPr 内未知元素存活（克隆源 pPr）', de.meta, true)
    eq('D5 pPr 内已知元素存活', de.jc, true)
    eq('D6 编辑文本落盘', de.hi && de.world, true)
    eq('D7 旧文本清除', de.noHello && de.noSecond, true)

    // 重开：未知元素仍在（透传的持久性）
    const e3 = new Engine(() => {})
    await e3.open(saved2, { name: 'passthru.docx' })
    await e3.call('docx.start', [])
    for (let i = 0; i < 200; i++) await new Promise((r) => setTimeout(r, 50))
    const saved3 = (await e3.call('save', [])) as Blob
    const z3 = await ZipArchive.open(new BufferSource(new Uint8Array(await saved3.arrayBuffer())))
    const doc3 = await z3.text('word/document.xml')
    eq('D8 重开再 save 未知元素仍存活', doc3.includes('<xyz:thing note="keep">') && doc3.includes('<xyz:meta xyz:id="7"/>'), true)
  } catch (err) {
    errs.push(`D threw: ${err}`)
  }
  R.passthru = dres

  R.ok = errs.length === 0
  return R
}
let cached: Promise<Record<string, unknown>> | null = null
function result(): Promise<Record<string, unknown>> {
  if (!cached) cached = run().catch((e) => ({ ok: false, errors: [`threw: ${e}`] }))
  return cached
}

registerSmokeMode('x21', () => {
  ;(window as any).__smoke.x21 = { result }
  return () => h('div', { style: 'width:100%;height:100%' }, 'x21 P7 opc-types/postload/compat/passthrough probe')
})
