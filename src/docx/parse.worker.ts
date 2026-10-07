/**
 * docx 解析 Web Worker：把 GenOffice parseDocx（纯 JS，含图片光栅化）与
 * renderBlockToHtml 搬到独立线程，避免大文件在主线程长时间独占导致 webview 卡死。
 *
 * 仅用于只读预览（不需要保存结构）。编辑/保存路径仍在主线程走 DocxDocument，
 * 因为 saveDocx 需要原始 zip 实例（不可跨线程克隆）。
 */

import { parseDocx } from '@genoffice/docx-engine'
import { renderBlockToHtml } from './render'

interface ParseRequest {
  bytes: ArrayBuffer
}
interface ParseResponse {
  ok: boolean
  html?: string
  blockCount?: number
  error?: string
}

self.onmessage = async (e: MessageEvent<ParseRequest>) => {
  try {
    const bytes = new Uint8Array(e.data.bytes)
    const parsed = (await parseDocx(bytes)) as unknown as {
      blocks: Array<Record<string, unknown>>
    }
    const html = parsed.blocks.map((b) => renderBlockToHtml(b)).join('\n')
    const res: ParseResponse = {
      ok: true,
      html,
      blockCount: parsed.blocks.length,
    }
    ;(self as unknown as Worker).postMessage(res)
  } catch (err) {
    const res: ParseResponse = { ok: false, error: String(err) }
    ;(self as unknown as Worker).postMessage(res)
  }
}
