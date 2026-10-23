/**
 * 格式转换前端封装（后端矩阵：`src-tauri/src/convert/`）
 *
 * 职责边界：
 * - 除 pdf 外的一切目标格式由后端转换（`convert_file_format`，纯 Rust 落盘）；
 * - pdf 由前端「所见即所得」导出（`utils/exportPdf.ts`）—— 后端矩阵保留 pdf 候选，
 *   只为让浮层拿到统一的列表，实际执行在 App.vue 分发。
 */

import { invoke } from '@tauri-apps/api/core'

export interface ConvertFileResult {
  output_path: string
  format: string
  is_text: boolean
}

/** 某源扩展名支持的目标格式（扩展名列表，后端矩阵唯一事实来源） */
export const supportedConvertTargets = (fromFormat: string): Promise<string[]> =>
  invoke<string[]>('supported_convert_targets', { fromFormat })

/**
 * 本地文件转格式并落盘。
 * 不传 outputPath / outputDir 时后端兜底写源文件同目录 `{stem}.{目标扩展名}`。
 */
export const convertFileFormat = (
  inputPath: string,
  targetExt: string,
  outputPath?: string | null,
  outputDir?: string | null
): Promise<ConvertFileResult> =>
  invoke<ConvertFileResult>('convert_file_format', {
    inputPath,
    targetExt,
    outputPath: outputPath ?? null,
    outputDir: outputDir ?? null
  })

/** 目标格式中文标签（浮层展示，缺失时回退大写扩展名） */
export const CONVERT_LABELS: Record<string, string> = {
  md: 'Markdown',
  txt: '纯文本',
  html: 'HTML',
  csv: 'CSV',
  docx: 'Word',
  xlsx: 'Excel',
  pptx: 'PPT',
  pdf: 'PDF'
}

export function convertLabel(ext: string): string {
  return CONVERT_LABELS[ext.toLowerCase()] || ext.toUpperCase()
}
