import type { Ref } from 'vue'

/** 隐藏焦点锚辅助：WKWebView 仅当焦点在可编辑元素时才派发原生 paste 事件，否则系统接管弹 Paste 浮层。 */
export function isTextEntry(ae: Element | null, anchor: HTMLElement | null): boolean {
  if (!ae || ae === anchor) return false
  const el = ae as HTMLElement
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function focusAnchor(anchor: Ref<HTMLElement | null> | { value: HTMLElement | null }, editable: boolean): void {
  if (!editable) return
  // 焦点已在文本输入控件（名称框 / 公式栏 / 编辑框）时不抢，否则破坏编辑提交/选字时序
  const ae = document.activeElement
  if (ae && ae !== anchor.value && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || (ae as HTMLElement).isContentEditable)) return
  const el = anchor.value
  if (!el || document.activeElement === el) return
  el.focus({ preventScroll: true })
}
