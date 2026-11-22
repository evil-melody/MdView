/**
 * Office 内核入口：注册 Vite inline Worker，导出框架无关的 DocumentClient。
 * 视图层全部是 Vue，不依赖任何运行时包。内核源码见 ./core、./view。
 */
import './core/default-worker'

export { DocumentClient } from './core/worker/client'
export type { OpenOptions } from './core/worker/client'
export type { DocKind } from './core/opc'
export type { Events, Methods, OpenResult } from './core/worker/protocol'
export type { Block, Paragraph, Table, DocxMeta, RunStyle, ParaStyle, Inline } from './core/docx/types'
export type { WorkbookMeta, SheetProgress, BlockOut, CellDetail, CellInput, CellCss, CellOut, FmtPatch, Range } from './core/xlsx/types'
export type { SheetFeatures, ChartFeature, ChartData, ChartSeries, ChartKind, ChartAddOp, CondFmtRule, CondFmtType, ValidationRule, ValidationType, SlicerFeature, SlicerAddOp, PivotFeature, PivotAddOp, PivotAgg, FeaturesResult } from './core/xlsx/types'
export type { SlideModel, PresentationMeta, PParaSpec, SlideEl, TextBody, TPara, TRun, SmartArtNode } from './core/pptx/types'
