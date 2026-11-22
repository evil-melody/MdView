import './default-worker'
export * from './source'
export { ZipArchive } from './zip'
export { SaxParser, TreeBuilder, parseXml, parseXmlStream, type XEl, type SaxHandler } from './xml'
export { OpcPackage, type DocKind } from './opc'
export { DocxDocument } from './docx/parser'
export type * from './docx/types'
export { XlsxWorkbook, colName, colIndex } from './xlsx/workbook'
export { formatValue, formatGeneral, serialToDate } from './xlsx/numfmt'
export type * from './xlsx/types'
export { PptxPresentation } from './pptx/parser'
// 显式列出 PPT 类型：ChartData / ChartSeries 与 xlsx 域同名，由 xlsx 作为 barrel 的规范导出；
// PPT 图表类型仍可从 ./pptx/types 直接按名导入（view / 内核都走这条路径）。
export type {
  Fill, Stroke, Box, TRun, TPara, TextBody, SmartArtNode, ChartType, AnimPreset, AnimSeqItem,
  SlideEl, ShapeKind, ShapeOp, SlideThemeInfo, SlideOp, TCell, SlideModel, PresentationMeta,
  PRunSet, PRunSpec, PParaSpec,
} from './pptx/types'
export { Engine } from './worker/engine'
export { DocumentClient, setDefaultWorker, type OpenOptions } from './worker/client'
export type { Events, Methods, OpenResult } from './worker/protocol'
export { threadsOf, newCommentId, type DocComment, type CommentUser, type CommentMention, type CommentAnchor, type CommentThread } from './comments'
