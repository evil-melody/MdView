/**
 * Office 内核 worker 引导。
 *
 * 【勿改回 ?worker&inline】inline 产物是 `data:text/javascript,...` worker，其
 * `self.location.origin === "null"`、`protocol === "data:"`：worker 内任何相对或
 * 绝对 URL 的 fetch / importScripts 全部失效（实测 data: worker 里
 * `new URL('/fonts/fonts.js', self.location.origin)` 直接抛 Invalid base URL）。
 * 字体度量内核要取 public/fonts/{fonts.js,fonts.wasm,Carlito-*.ttf}，故必须用
 * 真实同源 URL 的 worker —— 与 PdfEditor 的 pdfjs worker 同一形态。
 *
 * 断链的症状（报障：xlsx 打开数据区全空、Ctrl+A 失效）：loadSheet 首步
 * makeCellMetrics 取字体引擎 → 失败 → 错误被 catch 咽进 progress.error →
 * rows/cols=0、colInfo 空 → 视图渲染成默认等宽空格网，且 used range 为 0。
 */
import DocWorker from './worker/worker?worker'
import { setDefaultWorker } from './worker/client'

setDefaultWorker(() => new DocWorker({ name: 'office-view' }))
