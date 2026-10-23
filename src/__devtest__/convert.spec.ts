/**
 * 临时诊断用：验证「转格式」入口 → 浮层 的真实渲染链路。
 * 用后即删（不属于产品代码）。
 */
import { describe, it, expect, vi } from 'vitest'
import { createApp, h, ref, defineComponent, nextTick } from 'vue'
import type { FileEntry } from '../types'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string) =>
    cmd === 'supported_convert_targets' ? ['txt', 'html', 'docx', 'pdf'] : null
  ),
  convertFileSrc: (p: string) => p
}))

const PreviewPane = (await import('../components/PreviewPane.vue')).default
const ConvertMenu = (await import('../components/ConvertMenu.vue')).default

const entry = {
  name: 'a.txt',
  path: '/tmp/a.txt',
  is_dir: false,
  ext: 'txt',
  size: 10,
  modified: '',
  kind: 'text'
} as unknown as FileEntry

/** 复刻 App.vue 的 openConvertMenu / onConvertFromPane / openConvertMenuAt 逻辑 */
const Harness = defineComponent({
  setup() {
    const menu = ref<{ entry: FileEntry; x: number; y: number } | null>(null)
    function openConvertMenu(e: FileEntry, ev?: MouseEvent) {
      const rect = (ev?.currentTarget as HTMLElement | null)?.getBoundingClientRect()
      if (rect) menu.value = { entry: e, x: rect.left - 88, y: rect.bottom + 6 }
      else menu.value = { entry: e, x: ev?.clientX ?? 24, y: ev?.clientY ?? 80 }
    }
    function onConvertFromPane(ev: MouseEvent) {
      openConvertMenu(entry, ev)
    }
    ;(window as unknown as Record<string, unknown>).__probe = {
      openConvertMenuAt: () => {
        menu.value = { entry, x: 40, y: 40 }
      },
      get menu() {
        return menu.value
      }
    }
    return () =>
      h('div', { class: 'layout' }, [
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
              onPick: () => {},
              onClose: () => (menu.value = null)
            })
          : null
      ])
  }
})

async function flush() {
  await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

describe('转格式入口', () => {
  it('预览页头按钮点击后浮层出现', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    createApp(Harness).mount(host)
    await flush()

    const all = [...host.querySelectorAll('button')].map((b) => b.textContent?.trim())
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === '转格式')
    expect(btn, `按钮列表=${JSON.stringify(all)}`).toBeTruthy()

    ;(btn as HTMLButtonElement).click()
    await flush()

    const pop = document.querySelector('.convert-pop')
    expect(pop, `menu=${JSON.stringify((window as unknown as any).__probe.menu)}`).toBeTruthy()
  })

  it('右键菜单入口（openConvertMenuAt）浮层出现', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    createApp(Harness).mount(host)
    await flush()

    ;(window as unknown as any).__probe.openConvertMenuAt()
    await flush()

    expect(document.querySelector('.convert-pop')).toBeTruthy()
  })
})
