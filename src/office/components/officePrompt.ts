/**
 * Tauri WebView 不支持 window.prompt —— 所有视图的输入都走这里。
 * 动态挂载一个模态输入框，返回 Promise；取消返回 null。
 * readonly=true 用只读多行文本框，供信息展示（officeAlert）复用同一套挂载逻辑。
 */
import { createApp, ref, h } from 'vue'

export function officePrompt(title: string, value = '', placeholder = '', readonly = false): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const val = ref(value)
    const inp = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)
    let app: ReturnType<typeof createApp>
    const done = (v: string | null) => {
      app.unmount()
      host.remove()
      resolve(v)
    }
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); done(val.value) }
      if (e.key === 'Escape') { e.preventDefault(); done(null) }
    }
    app = createApp({
      setup() {
        const submit = () => done(val.value)
        const cancel = () => done(null)
        // h() 必须在 render 内执行：带 ref 的 VNode 需要当前渲染实例
        return () => {
          const common = {
            class: readonly ? 'op-prompt-input op-prompt-area' : 'op-prompt-input',
            ref: inp,
            value: val.value,
            onVnodeMounted: () => { inp.value?.focus(); inp.value?.select() },
            onKeydown
          }
          const field = readonly
            ? h('textarea', { ...common, readonly: true })
            : h('input', { ...common, placeholder, onInput: (e: Event) => (val.value = (e.target as HTMLInputElement).value) })
          return h('div', {
            class: 'op-prompt-overlay',
            onClick: cancel,
            onContextmenu: (e: MouseEvent) => { e.preventDefault(); cancel() }
          }, [
            h('div', { class: 'op-prompt', onClick: (e: MouseEvent) => e.stopPropagation() }, [
              h('div', { class: 'op-prompt-title' }, title),
              field,
              h('div', { class: 'op-prompt-btns' }, [
                h('button', { class: 'op-prompt-btn', onClick: cancel }, readonly ? '关闭' : '取消'),
                ...(readonly ? [] : [h('button', { class: 'op-prompt-btn op-prompt-ok', onClick: submit }, '确定')])
              ])
            ])
          ])
        }
      }
    })
    app.mount(host)
  })
}

/** 只展示信息（批注列表 / 查找无结果等）：无确定按钮，关闭即返回 */
export function officeAlert(title: string, text: string): Promise<string | null> {
  return officePrompt(title, text, '', true)
}
