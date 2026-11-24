/**
 * 空白 Office 文档生成（新建文件对话框三件套）。
 * part 集 = 冒烟探针已验证的最小可打开 fixture（p4 pptx / p9 xlsx / __smoke docx）：
 * 本内核可解析 + 可编辑 + 写回；PowerPoint/Excel/Word 兼容性靠标准 OOXML 结构
 * （Content_Types / _rels / 主 part / 子 part rels 全齐）。
 * ponytail: 不内置 styles.xml/theme 富模板——内核 parser 对缺失有兜底（parseTheme(undefined)、
 * docDefaults 合成），升级路径 = 换成 vendor genoffice 的 buildBlankDocx/createBlankPptx（带样式表）。
 */
import { writeZip, type PartData } from './zipwrite'

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

const CT_HEAD = `${DECL}<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
const RELS_OPEN = `${DECL}<Relationships xmlns="${PR}">`
const OFFICE_REL = (id: string, target: string) => `<Relationship Id="${id}" Type="${RNS}/officeDocument" Target="${target}"/>`

// ── docx ────────────────────────────────────────────────────────────────
function docxParts(): Map<string, PartData> {
  return new Map<string, PartData>([
    ['[Content_Types].xml',
      CT_HEAD + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', RELS_OPEN + OFFICE_REL('rId1', 'word/document.xml') + '</Relationships>'],
    ['word/document.xml',
      `${DECL}<w:document xmlns:w="${W}"><w:body><w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`],
  ])
}

// ── xlsx ────────────────────────────────────────────────────────────────
function xlsxParts(): Map<string, PartData> {
  return new Map<string, PartData>([
    ['[Content_Types].xml',
      CT_HEAD
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', RELS_OPEN + OFFICE_REL('rId1', 'xl/workbook.xml') + '</Relationships>'],
    ['xl/workbook.xml',
      `${DECL}<workbook xmlns="${XMAIN}" xmlns:r="${RNS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',
      RELS_OPEN + `<Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml',
      `${DECL}<worksheet xmlns="${XMAIN}"><sheetData/></worksheet>`],
  ])
}

// ── pptx（master/layout/theme 全套，与 p4 fixture 同构） ────────────────
const SP_TREE_GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>'
const THEME_XML =
  `${DECL}<a:theme xmlns:a="${A}" name="Office"><a:themeElements><a:clrScheme name="Office">` +
  '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' +
  '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>' +
  '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>' +
  '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>' +
  '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>' +
  '<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
  '<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
  '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>' +
  '<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>' +
  '<a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
  '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>' +
  '<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
  '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>'

function pptxParts(): Map<string, PartData> {
  return new Map<string, PartData>([
    ['[Content_Types].xml',
      CT_HEAD
      + '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
      + '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
      + '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
      + '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
      + '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>'],
    ['_rels/.rels', RELS_OPEN + OFFICE_REL('rId1', 'ppt/presentation.xml') + '</Relationships>'],
    ['ppt/presentation.xml',
      `${DECL}<p:presentation xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}">` +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>' +
      '<p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>'],
    ['ppt/_rels/presentation.xml.rels',
      RELS_OPEN
      + `<Relationship Id="rId1" Type="${RNS}/slideMaster" Target="slideMasters/slideMaster1.xml"/>`
      + `<Relationship Id="rId2" Type="${RNS}/slide" Target="slides/slide1.xml"/>`
      + `<Relationship Id="rId3" Type="${RNS}/theme" Target="theme/theme1.xml"/></Relationships>`],
    ['ppt/slides/slide1.xml',
      `${DECL}<p:sld xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:cSld><p:spTree>${SP_TREE_GRP}</p:spTree></p:cSld>` +
      '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'],
    ['ppt/slides/_rels/slide1.xml.rels',
      RELS_OPEN + `<Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`],
    ['ppt/slideLayouts/slideLayout1.xml',
      `${DECL}<p:sldLayout xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}" type="blank" preserve="1">` +
      `<p:cSld name="空白"><p:spTree>${SP_TREE_GRP}</p:spTree></p:cSld>` +
      '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      RELS_OPEN + `<Relationship Id="rId1" Type="${RNS}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`],
    ['ppt/slideMasters/slideMaster1.xml',
      `${DECL}<p:sldMaster xmlns:a="${A}" xmlns:r="${RNS}" xmlns:p="${P}"><p:cSld name="母版"><p:spTree>${SP_TREE_GRP}</p:spTree></p:cSld>` +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
      '<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>'],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels',
      RELS_OPEN
      + `<Relationship Id="rId1" Type="${RNS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`
      + `<Relationship Id="rId2" Type="${RNS}/theme" Target="../theme/theme1.xml"/></Relationships>`],
    ['ppt/theme/theme1.xml', THEME_XML],
  ])
}

export type BlankOfficeKind = 'docx' | 'xlsx' | 'pptx'

const BUILDERS: Record<BlankOfficeKind, () => Map<string, PartData>> = {
  docx: docxParts,
  xlsx: xlsxParts,
  pptx: pptxParts,
}
const MIME: Record<BlankOfficeKind, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

/** 生成空白 OOXML 字节（新建文件对话框用） */
export async function blankOfficeBytes(kind: BlankOfficeKind): Promise<Uint8Array> {
  const blob = await writeZip(BUILDERS[kind](), MIME[kind])
  return new Uint8Array(await blob.arrayBuffer())
}
