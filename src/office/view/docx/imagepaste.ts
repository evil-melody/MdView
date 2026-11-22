/**
 * 图片粘贴跨浏览器兜底。
 *
 * 原来只在 beforeinput 里读 dataTransfer.files；部分 WebKit（Tauri macOS 的 WKWebView）
 * 对 paste 的 beforeinput 不带 files，于是复制图片粘贴进表格无反应。paste 事件的
 * clipboardData.files 在所有引擎里都可靠。仅当剪贴板真含图片文件才接管：preventDefault
 * 取消默认插入，beforeinput 便不再触发，避免同一张图插两次；纯文本/HTML 粘贴仍走原链路。
 */
import type { DocxEditor } from './DocxEditor'

export function installImagePaste(root: HTMLElement, editor: DocxEditor): () => void {
  const onPaste = (e: ClipboardEvent) => {
    const dt = e.clipboardData
    if (!dt) return
    const hasImage = Array.from(dt.files ?? []).some((f) => f.type.startsWith('image/'))
    if (!hasImage) return
    const sel = editor.input.sel()
    if (!sel) return
    if (editor.pasteRich(sel, dt)) e.preventDefault()
  }
  root.addEventListener('paste', onPaste)
  return () => root.removeEventListener('paste', onPaste)
}
