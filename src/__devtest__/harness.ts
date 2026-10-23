/**
 * 临时诊断 harness（用后即删，不属于产品代码）。
 *
 * 目标：在**真实浏览器**里复刻 App.vue 的「转格式」接线，回答两个问题：
 *   1) 点击 转格式 按钮时，命中测试（elementFromPoint）落在哪个元素上？
 *      —— 若被别的层挡住，真实点击就不会触发按钮的 handler（表现为「没反应」）。
 *   2) 触发后浮层是否真的渲染、位置是否落在视口内？
 */
import { createApp, h, ref, defineComponent, nextTick } from 'vue'
import type { FileEntry } from '../types'
import PreviewPane from '../components/PreviewPane.vue'
import ConvertMenu from '../components/ConvertMenu.vue'

const entry = {
  name: 'a.txt',
  path: '/tmp/a.txt',
  is_dir: false,
  ext: 'txt',
  size: 10,
  modified: '',
  kind: 'text'
} as unknown as FileEntry

function describe(el: Element | null): string {
  if (!el) return '<null>'
  const cls = (el.getAttribute('class') || '').trim()
  return `<${el.tagName.toLowerCase()}${cls ? ' class="' + cls + '"' : ''}>`
}

export async function run(): Promise<Record<string, unknown>> {
  const log: string[] = []
  const g = globalThis as unknown as Record<string, any>

  // ---- Tauri API stub（浏览器里 globalThis === window）----
  g.__TAURI_INTERNALS__ = {
    metadata: { currentWebview: { label: 'main' }, currentWindow: { label: 'main' } },
    invoke: async (cmd: string, args: unknown) => {
      log.push(`invoke:${cmd}:${JSON.stringify(args)}`)
      if (cmd === 'supported_convert_targets') return ['txt', 'html', 'docx', 'pdf']
      return null
    },
    transformCallback: (cb: unknown) => cb,
    convertFileSrc: (p: string) => p,
    unregisterCallback: () => {}
  }

  const menu = ref<{ entry: FileEntry; x: number; y: number } | null>(null)

  // ---- App.vue 逻辑逐字复刻 ----
  function openConvertMenu(e: FileEntry, ev?: MouseEvent) {
    const rect = (ev?.currentTarget as HTMLElement | null)?.getBoundingClientRect()
    if (rect) menu.value = { entry: e, x: rect.left - 88, y: rect.bottom + 6 }
    else menu.value = { entry: e, x: ev?.clientX ?? 24, y: ev?.clientY ?? 80 }
  }
  function onConvertFromPane(ev: MouseEvent) {
    log.push(`handler-fired currentTarget=${describe((ev as any)?.currentTarget)}`)
    openConvertMenu(entry, ev)
  }

  const Harness = defineComponent({
    setup() {
      return () =>
        h('div', { class: 'layout', style: 'display:flex;width:100%;height:100%' }, [
          h(PreviewPane, {
            entry,
            content: '# hi',
            headings: [],
            dirty: false,
            kindLabel: {},
            onConvert: onConvertFromPane
          }),
          menu.value
            ? h(ConvertMenu, {
                key: menu.value.entry.path,
                entry: menu.value.entry,
                x: menu.value.x,
                y: menu.value.y,
                onPick: (t: string) => log.push(`pick:${t}`),
                onClose: () => {
                  log.push('close')
                  menu.value = null
                }
              })
            : null
        ])
    }
  })

  // 固定铺满视口：模拟真实应用里 .pane 的 flex:1 布局，避免落点在视口外
  const host = document.createElement('div')
  host.id = 'harness-host'
  host.style.cssText = 'position:fixed;inset:0;display:flex'
  document.body.appendChild(host)

  let mountErr = ''
  try {
    createApp(Harness).mount(host)
  } catch (e) {
    mountErr = String(e)
  }

  const flush = async () => {
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
  }
  await flush()

  const buttons = [...host.querySelectorAll('button')]
  const btn = buttons.find((b) => (b.textContent || '').trim() === '转格式') as
    | HTMLButtonElement
    | undefined

  let hitTest: string = '<no-button>'
  let btnRect: Record<string, number> | null = null
  if (btn) {
    const r = btn.getBoundingClientRect()
    btnRect = { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom }
    const cx = Math.round(r.left + r.width / 2)
    const cy = Math.round(r.top + r.height / 2)
    const hit = document.elementFromPoint(cx, cy)
    hitTest = `${describe(hit)} @(${cx},${cy})`
    // 真实点击：在命中的元素上派发 click（模拟用户在该坐标点下鼠标）
    const dispatchOn = hit ?? btn
    dispatchOn.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: cx,
        clientY: cy,
        view: window
      })
    )
  }
  await flush()
  await flush()

  const pop = document.querySelector('.convert-pop') as HTMLElement | null
  const pr = pop?.getBoundingClientRect()

  return {
    mountErr,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    buttons: buttons.map((b) => (b.textContent || '').trim()),
    hasConvertBtn: !!btn,
    btnRect,
    hitTest,
    menuState: menu.value,
    popRendered: !!pop,
    popRect: pr
      ? { left: pr.left, top: pr.top, width: pr.width, height: pr.height }
      : null,
    popInViewport: pr
      ? pr.left >= 0 && pr.top >= 0 && pr.left < window.innerWidth && pr.top < window.innerHeight
      : null,
    popHtml: pop ? pop.outerHTML.slice(0, 500) : null,
    log
  }
}
