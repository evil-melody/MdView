/**
 * OPC 包管理层内核（路线图 P7）。sdkjs 来源：common/openxml.js（release/v10.0.0 直抄）。
 *
 * 三块：
 *  1. TYPES 注册表（openxml.js:679-827 全量直抄）——part 类型 → {dir, filename, contentType,
 *     relationType, enumerateType?}。`[N]` 是序号占位；`image`/`imageWord` 的 filename
 *     以 `.` 结尾（扩展名由实际媒体补）；`customXml`/`oformUser` 等 contentType 在原文
 *     即被注释掉（空串）——照抄不补，保真优先。
 *  2. mimeOfExt + GetMimeType 兜底（:628-677）——扩展名 → 默认 MIME，未知名 →
 *     application/octet-stream。MdView 既有 opc.ts 的 MIME 表是「浏览器可渲染」口径，
 *     与此处「OPC Default 声明」口径并存：本表只服务 ContentTypes.add 与探针断言。
 *  3. PartNameIndex（generateNextFilename :253-266 + generateTargetByType :267-273 移植）。
 *     计数器语义逐条对齐：无 `[N]` 直返；有 `[N]` 时 key = enumerateType || relationType，
 *     首调返回 1 并把计数器置 2，之后每次返回当前值并自增（`nextIndex = idx[key]++`）；
 *     替换是全局 `\[N\]`（filename 里多个 [N] 同值）。dir 非空时 `dir + "/" + filename`。
 *
 * 与占用扫描的差异（ponytail 标记）：sdkjs 纯计数器**不查重**——打开已有 slide1-3 的包后
 * 首调 addPart(slide) 会生成 slide1.xml 覆盖既有 part（上游依赖调用方先 load 全部既有
 * part 使计数器越过）。MdView opc.ts 的 freeName 是占用扫描（跳过已存在名）。接线时
 * 保留 freeName 的防覆盖守卫，计数器语义仅锁进探针——保真口径 = 行为可复现，
 * 不是逐字节复刻上游缺陷。升级路径：若未来需要 sdkjs 同款「先 load 再 add」时序，
 * 在调用方补 load 而不是改这里。
 */

export interface PartTypeDef {
  /** 相对包根的目录（"" = 与基准同级；`../x` = 基准目录的上级 x） */
  dir: string
  /** 文件名，`[N]` 为序号占位；image 类以 `.` 结尾待补扩展名 */
  filename: string
  /** OPC content type（原文被注释掉的为空串） */
  contentType: string
  /** 关系类型（无关系的纯资源为空串） */
  relationType: string
  /** 计数器共享键（缺省用 relationType） */
  enumerateType?: string
}

const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const MRT = 'http://schemas.microsoft.com/office'
const PRT = 'http://schemas.openxmlformats.org/package/2006/relationships'

/** openxml.js:679-827 全量直抄（键名、值、空串语义逐条对齐） */
export const TYPES: Record<string, PartTypeDef> = {
  calculationChain: { dir: '', filename: 'calcChain.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml', relationType: RT + '/calcChain' },
  cellMetadata: { dir: '', filename: 'cellMetadata.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml', relationType: RT + '/sheetMetadata' },
  chart: { dir: '../charts', filename: 'chart[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml', relationType: RT + '/chart' },
  chartEx: { dir: '../charts', filename: 'chartEx[N].xml', contentType: 'application/vnd.ms-office.chartex+xml', relationType: MRT + '/2014/relationships/chartEx' },
  chartWord: { dir: 'charts', filename: 'chart[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml', relationType: RT + '/chart' },
  chartColorStyle: { dir: '', filename: 'color[N].xml', contentType: 'application/vnd.ms-office.chartcolorstyle+xml', relationType: MRT + '/2011/relationships/chartColorStyle' },
  chartExColorStyle: { dir: '', filename: 'colors[N].xml', contentType: 'application/vnd.ms-office.chartcolorstyle+xml', relationType: MRT + '/2011/relationships/chartColorStyle' },
  chartDrawing: { dir: '../drawings', filename: 'drawing[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml', relationType: RT + '/chartUserShapes', enumerateType: 'drawings/drawing' },
  chartsheet: { dir: 'chartsheets', filename: 'sheet[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml', relationType: RT + '/chartsheet' },
  chartStyle: { dir: '', filename: 'style[N].xml', contentType: 'application/vnd.ms-office.chartstyle+xml', relationType: MRT + '/2011/relationships/chartStyle' },
  commentAuthors: { dir: '', filename: 'commentAuthors.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.commentAuthors+xml', relationType: RT + '/commentAuthors' },
  connections: { dir: '', filename: 'connections.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml', relationType: RT + '/connections' },
  coreFileProperties: { dir: 'docProps', filename: 'core.xml', contentType: 'application/vnd.openxmlformats-package.core-properties+xml', relationType: PRT + '/metadata/core-properties' },
  customFileProperties: { dir: 'docProps', filename: 'custom.xml', contentType: 'application/vnd.openxmlformats-officedocument.custom-properties+xml', relationType: RT + '/custom-properties' },
  customization: { dir: '', filename: 'customization.xml', contentType: 'application/vnd.ms-word.keyMapCustomizations+xml', relationType: MRT + '/2006/relationships/keyMapCustomizations' },
  customProperty: { dir: '', filename: 'customProperty.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.customProperty', relationType: RT + '/customProperty' },
  customXmlProperties: { dir: '', filename: 'customXmlProperties.xml', contentType: 'application/vnd.openxmlformats-officedocument.customXmlProperties+xml', relationType: RT + '/customXmlProps' },
  diagramColors: { dir: 'diagrams', filename: 'colors[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml', relationType: RT + '/diagramColors' },
  diagramData: { dir: 'diagrams', filename: 'data[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml', relationType: RT + '/diagramData' },
  diagramLayoutDefinition: { dir: 'diagrams', filename: 'layout[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml', relationType: RT + '/diagramLayout' },
  diagramPersistLayout: { dir: 'diagrams', filename: 'drawing[N].xml', contentType: 'application/vnd.ms-office.drawingml.diagramDrawing+xml', relationType: MRT + '/2007/relationships/diagramDrawing' },
  diagramStyle: { dir: 'diagrams', filename: 'quickStyle[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml', relationType: RT + '/diagramQuickStyle' },
  dialogsheet: { dir: '', filename: 'dialogsheet.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.dialogsheet+xml', relationType: RT + '/dialogsheet' },
  digitalSignatureOrigin: { dir: '', filename: 'digitalSignatureOrigin.xml', contentType: 'application/vnd.openxmlformats-package.digital-signature-origin', relationType: PRT + '/digital-signature/origin' },
  documentSettings: { dir: '', filename: 'settings.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml', relationType: RT + '/settings' },
  drawings: { dir: '../drawings', filename: 'drawing[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.drawing+xml', relationType: RT + '/drawing', enumerateType: 'drawings/drawing' },
  endnotes: { dir: '', filename: 'endnotes.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml', relationType: RT + '/endnotes' },
  excelAttachedToolbars: { dir: '', filename: 'excelAttachedToolbars.xml', contentType: 'application/vnd.ms-excel.attachedToolbars', relationType: MRT + '/2006/relationships/attachedToolbars' },
  extendedFileProperties: { dir: 'docProps', filename: 'app.xml', contentType: 'application/vnd.openxmlformats-officedocument.extended-properties+xml', relationType: RT + '/extended-properties' },
  externalWorkbook: { dir: 'externalLinks', filename: 'externalLink[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml', relationType: RT + '/externalLink' },
  fontData: { dir: '', filename: 'fontData.xml', contentType: 'application/x-fontdata', relationType: '' },
  fontTable: { dir: '', filename: 'fontTable.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml', relationType: RT + '/fontTable' },
  footer: { dir: '', filename: 'footer[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml', relationType: RT + '/footer' },
  footnotes: { dir: '', filename: 'footnotes.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml', relationType: RT + '/footnotes' },
  gif: { dir: '', filename: 'gif.xml', contentType: 'image/gif', relationType: '' },
  glossaryDocument: { dir: 'glossary', filename: 'document.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml', relationType: RT + '/glossaryDocument' },
  handoutMaster: { dir: 'handoutMasters', filename: 'handoutMaster[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.handoutMaster+xml', relationType: RT + '/handoutMaster' },
  header: { dir: '', filename: 'header[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml', relationType: RT + '/header' },
  jpeg: { dir: '', filename: 'jpeg.xml', contentType: 'image/jpeg', relationType: '' },
  mainDocument: { dir: 'word', filename: 'document.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml', relationType: RT + '/officeDocument' },
  notesMaster: { dir: 'notesMasters', filename: 'notesMaster[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml', relationType: RT + '/notesMaster' },
  notesSlide: { dir: 'notesSlides', filename: 'notesSlide[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml', relationType: RT + '/notesSlide' },
  numbering: { dir: '', filename: 'numbering.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml', relationType: RT + '/numbering' },
  pict: { dir: '', filename: 'pict.xml', contentType: 'image/pict', relationType: '' },
  pivotTable: { dir: '../pivotTables', filename: 'pivotTable[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml', relationType: RT + '/pivotTable' },
  pivotTableCacheDefinition: { dir: '../pivotCache', filename: 'pivotCacheDefinition[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml', relationType: RT + '/pivotCacheDefinition' },
  pivotTableCacheDefinitionWorkbook: { dir: 'pivotCache', filename: 'pivotCacheDefinition[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml', relationType: RT + '/pivotCacheDefinition' },
  pivotTableCacheRecords: { dir: '', filename: 'pivotCacheRecords[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml', relationType: RT + '/pivotCacheRecords' },
  package: { dir: '../embeddings', filename: 'Embedding[N].xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', relationType: RT + '/package' },
  png: { dir: '', filename: 'png.xml', contentType: 'image/png', relationType: '' },
  presentation: { dir: 'ppt', filename: 'presentation.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml', relationType: RT + '/officeDocument' },
  presentationComments: { dir: 'comments', filename: 'comment[N].xml', contentType: '', relationType: 'http://schemas.onlyoffice.com/comments', enumerateType: 'comments/comment' },
  presentationProperties: { dir: '', filename: 'presProps.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml', relationType: RT + '/presProps' },
  presentationTemplate: { dir: '', filename: 'presentationTemplate.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml', relationType: '' },
  queryTable: { dir: '../queryTables', filename: 'queryTable[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.queryTable+xml', relationType: RT + '/queryTable' },
  relationships: { dir: '_rels', filename: '.rels', contentType: 'application/vnd.openxmlformats-package.relationships+xml', relationType: '' },
  ribbonAndBackstageCustomizations: { dir: '', filename: 'ribbonAndBackstageCustomizations.xml', contentType: 'http://schemas.microsoft.com/office/2009/07/customui', relationType: MRT + '/2007/relationships/ui/extensibility' },
  sharedStringTable: { dir: '', filename: 'sharedStrings.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml', relationType: RT + '/sharedStrings' },
  singleCellTable: { dir: '', filename: 'singleCellTable.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.tableSingleCells+xml', relationType: RT + '/tableSingleCells' },
  slicerCache: { dir: 'slicerCaches', filename: 'slicerCache[N].xml', contentType: 'application/vnd.ms-excel.slicerCache+xml', relationType: MRT + '/2007/relationships/slicerCache' },
  slicers: { dir: '../slicers', filename: 'slicer[N].xml', contentType: 'application/vnd.ms-excel.slicer+xml', relationType: MRT + '/2007/relationships/slicer' },
  slide: { dir: 'slides', filename: 'slide[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml', relationType: RT + '/slide' },
  slideComments: { dir: '../comments', filename: 'comment[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.comments+xml', relationType: RT + '/comments', enumerateType: 'comments/comment' },
  slideLayout: { dir: 'slideLayouts', filename: 'slideLayout[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml', relationType: RT + '/slideLayout' },
  slideMaster: { dir: 'slideMasters', filename: 'slideMaster[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml', relationType: RT + '/slideMaster' },
  slideShow: { dir: '', filename: 'slideShow.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml', relationType: '' },
  slideSyncData: { dir: '', filename: 'slideSyncData.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.slideUpdateInfo+xml', relationType: RT + '/slideUpdateInfo' },
  styles: { dir: '', filename: 'styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', relationType: RT + '/styles' },
  tableDefinition: { dir: '../tables', filename: 'table[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml', relationType: RT + '/table' },
  tableStyles: { dir: '', filename: 'tableStyles.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml', relationType: RT + '/tableStyles' },
  theme: { dir: 'theme', filename: 'theme[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.theme+xml', relationType: RT + '/theme' },
  themeOverride: { dir: '../theme', filename: 'themeOverride[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.themeOverride+xml', relationType: RT + '/themeOverride' },
  tiff: { dir: '', filename: 'tiff.xml', contentType: 'image/tiff', relationType: '' },
  trueTypeFont: { dir: '', filename: 'trueTypeFont.xml', contentType: 'application/x-font-ttf', relationType: '' },
  userDefinedTags: { dir: '', filename: 'userDefinedTags.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.tags+xml', relationType: RT + '/tags' },
  viewProperties: { dir: '', filename: 'viewProps.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml', relationType: RT + '/viewProps' },
  vmlDrawing: { dir: '../drawings', filename: 'vmlDrawing[N].vml', contentType: 'application/vnd.openxmlformats-officedocument.vmlDrawing', relationType: RT + '/vmlDrawing' },
  volatileDependencies: { dir: '', filename: 'volatileDependencies.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.volatileDependencies+xml', relationType: RT + '/volatileDependencies' },
  webSettings: { dir: '', filename: 'webSettings.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml', relationType: RT + '/webSettings' },
  wordAttachedToolbars: { dir: '', filename: 'wordAttachedToolbars.xml', contentType: 'application/vnd.ms-word.attachedToolbars', relationType: MRT + '/2006/relationships/attachedToolbars' },
  wordComments: { dir: '', filename: 'comments.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml', relationType: RT + '/comments' },
  wordCommentsExtended: { dir: '', filename: 'commentsExtended.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml', relationType: MRT + '/2011/relationships/commentsExtended' },
  wordCommentsExtensible: { dir: '', filename: 'commentsExtensible.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtensible+xml', relationType: MRT + '/2018/08/relationships/commentsExtensible' },
  wordCommentsIds: { dir: '', filename: 'commentsIds.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.commentsIds+xml', relationType: MRT + '/2016/09/relationships/commentsIds' },
  wordPackage: { dir: 'embeddings', filename: 'Embedding[N].xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', relationType: RT + '/package' },
  wordPeople: { dir: '', filename: 'people.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml', relationType: MRT + '/2011/relationships/people' },
  wordprocessingTemplate: { dir: '', filename: 'wordprocessingTemplate.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml', relationType: '' },
  workbook: { dir: 'xl', filename: 'workbook.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', relationType: RT + '/officeDocument' },
  workbookRevisionHeader: { dir: '', filename: 'workbookRevisionHeader.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.revisionHeaders+xml', relationType: RT + '/revisionHeaders' },
  workbookRevisionLog: { dir: '', filename: 'workbookRevisionLog.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.revisionLog+xml', relationType: RT + '/revisionLog' },
  workbookStyles: { dir: '', filename: 'styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml', relationType: RT + '/styles' },
  workbookTemplate: { dir: '', filename: 'workbookTemplate.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml', relationType: '' },
  workbookUserData: { dir: '', filename: 'workbookUserData.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.userNames+xml', relationType: RT + '/usernames' },
  worksheet: { dir: 'worksheets', filename: 'sheet[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml', relationType: RT + '/worksheet' },
  worksheetComments: { dir: '..', filename: 'comments[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml', relationType: RT + '/comments' },
  worksheetSortMap: { dir: '', filename: 'worksheetSortMap.xml', contentType: 'application/vnd.ms-excel.wsSortMap+xml', relationType: MRT + '/2006/relationships/wsSortMap' },
  xmlSignature: { dir: '', filename: 'xmlSignature.xml', contentType: 'application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml', relationType: PRT + '/digital-signature/signature' },
  hyperlink: { dir: '', filename: '', contentType: '', relationType: RT + '/hyperlink' },
  metadata: { dir: '', filename: 'metadata.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml', relationType: RT + '/sheetMetadata' },
  rdRichValue: { dir: 'richData', filename: 'rdrichvalue.xml', contentType: 'application/vnd.ms-excel.rdrichvalue+xml', relationType: MRT + '/2017/06/relationships/rdRichValue' },
  rdRichValueStructure: { dir: 'richData', filename: 'rdrichvaluestructure.xml', contentType: 'application/vnd.ms-excel.rdrichvaluestructure+xml', relationType: MRT + '/2017/06/relationships/rdRichValueStructure' },
  rdRichValueTypes: { dir: 'richData', filename: 'rdRichValueTypes.xml', contentType: 'application/vnd.ms-excel.rdrichvaluetypes+xml', relationType: MRT + '/2017/06/relationships/rdRichValueTypes' },
  threadedComment: { dir: '../threadedComments', filename: 'threadedComment[N].xml', contentType: 'application/vnd.ms-excel.threadedcomments+xml', relationType: MRT + '/2017/10/relationships/threadedComment' },
  person: { dir: '../persons', filename: 'person.xml', contentType: 'application/vnd.ms-excel.person+xml', relationType: MRT + '/2017/10/relationships/person' },
  ctrlProp: { dir: '../ctrlProps', filename: 'ctrlProp[N].xml', contentType: 'application/vnd.ms-excel.controlproperties+xml', relationType: RT + '/ctrlProp' },
  namedSheetViews: { dir: '../namedSheetViews', filename: 'namedSheetView[N].xml', contentType: 'application/vnd.ms-excel.namedsheetviews+xml', relationType: MRT + '/2019/04/relationships/namedSheetView' },
  workbookComment: { dir: '', filename: 'workbookComments.bin', contentType: 'application/octet-stream', relationType: 'http://schemas.onlyoffice.com/workbookComments' },
  timelines: { dir: '../timelines', filename: 'timeline[N].xml', contentType: 'application/vnd.ms-excel.timeline+xml', relationType: MRT + '/2011/relationships/timeline' },
  timelineCaches: { dir: 'timelineCaches', filename: 'timelineCache[N].xml', contentType: 'application/vnd.ms-excel.timelineCache+xml', relationType: MRT + '/2011/relationships/timelineCache' },
  jsaProject: { dir: '', filename: 'jsaProject.bin', contentType: 'application/octet-stream', relationType: 'http://schemas.onlyoffice.com/jsaProject' },
  vbaProject: { dir: '', filename: 'vbaProject.bin', contentType: 'application/octet-stream', relationType: MRT + '/2006/relationships/vbaProject' },
  customXml: { dir: '../customXml', filename: 'item[N].xml', contentType: '', relationType: RT + '/customXml' },
  customXmlProps: { dir: '', filename: 'itemProps[N].xml', contentType: 'application/vnd.openxmlformats-officedocument.customXmlProperties+xml', relationType: RT + '/customXmlProps' },
  image: { dir: '../media', filename: 'image[N].', contentType: 'image/jpeg', relationType: RT + '/image' },
  imageWord: { dir: 'media', filename: 'image[N].', contentType: 'image/jpeg', relationType: RT + '/image' },
  oformMain: { dir: 'oform', filename: 'main.xml', contentType: 'application/vnd.openxmlformats-package.onlyf+xml', relationType: 'https://schemas.onlyoffice.com/relationships/oform-main' },
  oformDefaultUserMaster: { dir: 'oform/userMasters', filename: 'default.xml', contentType: 'application/vnd.openxmlformats-package.onlyf-default-userMaster+xml', relationType: 'https://schemas.onlyoffice.com/relationships/oform-default-userMaster' },
  oformUserMaster: { dir: 'oform/userMasters', filename: 'userMaster[N].xml', contentType: 'application/vnd.openxmlformats-package.onlyf-userMaster+xml', relationType: 'https://schemas.onlyoffice.com/relationships/oform-userMaster' },
  oformUser: { dir: 'oform/users', filename: 'user[N].xml', contentType: '', relationType: 'https://schemas.onlyoffice.com/relationships/oform-user' },
  oformField: { dir: 'oform/fields', filename: 'field[N].xml', contentType: '', relationType: 'https://schemas.onlyoffice.com/relationships/oform-field' },
  oformFieldMaster: { dir: 'oform/fieldMasters', filename: 'fieldMaster[N].xml', contentType: 'application/vnd.openxmlformats-package.onlyf-fieldMaster+xml', relationType: 'https://schemas.onlyoffice.com/relationships/oform-fieldMaster' },
  visioDocument: { dir: 'visio', filename: 'document.xml', contentType: 'application/vnd.ms-visio.drawing.main+xml', relationType: 'http://schemas.microsoft.com/visio/2010/relationships/document' },
  visioDocumentWindows: { dir: '', filename: 'windows.xml', contentType: 'application/vnd.ms-visio.windows+xml', relationType: 'http://schemas.microsoft.com/visio/2010/relationships/windows' },
  pages: { dir: 'pages', filename: 'pages.xml', contentType: 'application/vnd.ms-visio.pages+xml', relationType: 'http://schemas.microsoft.com/visio/2010/relationships/pages' },
  page: { dir: '', filename: 'page[N].xml', contentType: 'application/vnd.ms-visio.page+xml', relationType: 'http://schemas.microsoft.com/visio/2010/relationships/page' },
  masters: { dir: 'masters', filename: 'masters.xml', contentType: 'application/vnd.ms-visio.masters+xml', relationType: 'http://schemas.microsoft.com/visio/2010/relationships/masters' },
  master: { dir: '', filename: 'master[N].xml', contentType: 'application/vnd.ms-visio.master+xml', relationType: 'http://schemas.microsoft.com/visio/2010/relationships/master' },
  masterFromPage: { dir: '../masters', filename: 'master[N].xml', contentType: 'application/vnd.ms-visio.master+xml', relationType: 'http://schemas.microsoft.com/visio/2010/relationships/master' },
  thumbnail: { dir: 'docProps', filename: 'thumbnail.emf', contentType: 'image/x-emf', relationType: PRT + '/metadata/thumbnail' },
  visioComments: { dir: '', filename: 'comments.xml', contentType: 'application/vnd.ms-visio.comments+xml', relationType: 'http://schemas.microsoft.com/visio/2010/relationships/comments' },
  visioExtensions: { dir: '', filename: 'extensions.xml', contentType: 'application/vnd.ms-visio.extensions+xml', relationType: 'http://schemas.microsoft.com/visio/2010/relationships/extensions' },
  visioDataConnections: { dir: 'data', filename: 'connections.xml', contentType: 'application/vnd.ms-visio.connections+xml', relationType: 'http://schemas.microsoft.com/visio/2010/relationships/connections' },
  visioDataRecordSets: { dir: 'data', filename: 'recordsets.xml', contentType: 'application/vnd.ms-visio.recordsets+xml', relationType: 'http://schemas.microsoft.com/visio/2010/relationships/recordsets' },
  solutions: { dir: 'solutions', filename: 'solutions.xml', contentType: 'application/vnd.ms-visio.solutions+xml', relationType: 'http://schemas.microsoft.com/visio/2010/relationships/solutions' },
  solution: { dir: '', filename: 'solution[N].xml', contentType: 'application/vnd.ms-visio.solution+xml', relationType: 'http://schemas.microsoft.com/visio/2010/relationships/solution' },
  validation: { dir: '', filename: 'validation.xml', contentType: 'application/vnd.ms-visio.validation+xml', relationType: 'http://schemas.microsoft.com/visio/2010/relationships/validation' },
}

/** openxml.js:628-675 直抄（OPC Default 声明口径） */
export const MIME_TYPES: Record<string, string> = {
  bmp: 'image/bmp',
  gif: 'image/gif',
  png: 'image/png',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  jpe: 'image/jpeg',
  jfif: 'image/jpeg',
  rels: 'application/vnd.openxmlformats-package.relationships+xml',
  bin: 'application/vnd.openxmlformats-officedocument.oleObject',
  xml: 'application/xml',
  emf: 'image/x-emf',
  emz: 'image/x-emz',
  wmf: 'image/x-wmf',
  svg: 'image/svg+xml',
  svm: 'image/svm',
  wdp: 'image/vnd.ms-photo',
  wav: 'audio/wav',
  wma: 'audio/x-wma',
  m4a: 'audio/unknown',
  mp3: 'audio/mpeg',
  mp4: 'video/unknown',
  mov: 'video/unknown',
  m4v: 'video/unknown',
  mkv: 'video/unknown',
  avi: 'video/avi',
  flv: 'video/x-flv',
  wmv: 'video/x-wmv',
  webm: 'video/webm',
  xls: 'application/vnd.ms-excel',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  xlsb: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptm: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  sldm: 'application/vnd.ms-powerpoint.slide.macroEnabled.12',
  sldx: 'application/vnd.openxmlformats-officedocument.presentationml.slide',
  doc: 'application/msword',
  docm: 'application/vnd.ms-word.document.macroEnabled.12',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  vml: 'application/vnd.openxmlformats-officedocument.vmlDrawing',
  vsd: 'application/vnd.visio',
  vsdx: 'application/vnd.ms-visio.drawing',
}

/** openxml.js:675-677 */
export function mimeTypeOf(ext: string): string {
  return MIME_TYPES[ext] || 'application/octet-stream'
}

/**
 * generateNextFilename（:253-266）+ generateTargetByType（:267-273）的包级移植。
 * 计数器按 key（enumerateType || relationType）独立；首调 1→置 2，后续返回并自增。
 */
export class PartNameIndex {
  private indexes = new Map<string, number>()

  nextFilename(type: PartTypeDef): string {
    if (!type.filename.includes('[N]')) return type.filename
    const key = type.enumerateType || type.relationType
    const cur = this.indexes.get(key)
    if (cur === undefined) {
      this.indexes.set(key, 2)
      return type.filename.replace(/\[N\]/g, '1')
    }
    this.indexes.set(key, cur + 1)
    return type.filename.replace(/\[N\]/g, String(cur))
  }

  targetByType(type: PartTypeDef): string {
    const name = this.nextFilename(type)
    return type.dir ? `${type.dir}/${name}` : name
  }
}

/**
 * ContentTypes.add（:159-172）语义：Overrides[partName]=contentType（非空才写）、
 * Defaults[ext] 缺失时补 mimeTypeOf(ext)；返回「是否新增」（Overrides 与 Defaults
 * 原本不全时为 true）。partName 带前导斜杠（OPC 约定，与 Override PartName 同口径）。
 */
export function contentTypesAdd(
  overrides: Map<string, string>,
  defaults: Map<string, string>,
  partName: string,
  contentType: string,
): boolean {
  const dot = partName.lastIndexOf('.')
  const ext = partName.slice(dot + 1)
  const res = !(overrides.has(partName) && defaults.has(ext))
  if (contentType) overrides.set(partName, contentType)
  if (!defaults.has(ext)) defaults.set(ext, mimeTypeOf(ext))
  return res
}