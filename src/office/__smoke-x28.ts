/**
 * x28 探针（切页签内容错乱报障，?mode=x28）：
 *
 * 报障：应用运行中经系统（Finder 双击）打开 md B，页签条保留上次打开的 A；
 * 切回 A 页签时，预览区显示的仍是 B 的内容。
 *
 * 静态审读定案的根因：MdPreview 的 lastEmitted 守卫是**实例级、无文档维度**——
 *  1. WYSIWYG 编辑 A → 回写 lastEmitted=A'（防父层回写重渲染丢光标）
 *  2. 切到 B → content=B ≠ lastEmitted → streamRender(B) → DOM=B
 *  3. 切回 A → content=A' === lastEmitted → watch 跳过 streamRender → DOM 残留 B
 * 预览分支 MdPreview 无 :key，组件实例跨页签持续，全靠 props watch 驱动。
 * 次生洞：watch 只盯 content——两页签 content 相同时切页签根本不触发。
 *
 * 断言（生产同路：PreviewPane → MdPreview 预览态 WYSIWYG）：
 *  B 段 纯切页签往返基线（修复前应绿，证明洞不在普通切换路径）；
 *  C 段 编辑 A → 切 B → 切回 A：DOM 必须是 A（含编辑标记）、不得残留 B（修复前红）。
 *
 * 顶层只注册 mode；结果挂 window.__smoke.x28（promise 路径，与 x25/x26/x27 同规）。
 */
import { h, reactive } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import PreviewPane from '../components/PreviewPane.vue'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const errs: string[] = []
const ok = (name: string, cond: unknown, extra = '') => {
  if (!cond) errs.push(`${name}${extra ? ' → ' + extra : ''}`)
  return !!cond
}
const detail: Record<string, unknown> = {}

const MD_A = '# 甲文档\n\n甲段落AAA。'
const MD_B = '# 乙文档\n\n乙段落BBB。'
const ENTRY = (path: string, name: string, src: string) => ({
  name, path, is_dir: false, ext: 'md', size: src.length, modified: '', kind: 'markdown'
})
const TABS = [
  { entry: ENTRY('/a.md', 'a.md', MD_A), content: MD_A, dirty: false },
  { entry: ENTRY('/b.md', 'b.md', MD_B), content: MD_B, dirty: false }
]

/** 模拟 App 页签模型：activeTabPath + 每页签 content/dirty（tabBindings 等价物） */
const st = reactive({
  active: '/a.md',
  contents: { '/a.md': MD_A, '/b.md': MD_B } as Record<string, string>,
  dirty: { '/a.md': false, '/b.md': false } as Record<string, boolean>
})

const bodyText = () => String(document.querySelector('.md-body')?.textContent ?? '')
async function waitFor(pred: () => boolean, ms = 5000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (pred()) return true
    await wait(50)
  }
  return pred()
}

async function run(): Promise<Record<string, unknown>> {
  ok('M0 预览挂载', await waitFor(() => !!document.querySelector('.md-body')))
  ok('M1 A 初始渲染出正文', await waitFor(() => bodyText().includes('甲段落AAA')), `text=${JSON.stringify(bodyText().slice(0, 80))}`)

  // ---- B 段：纯切页签往返基线（无编辑，修复后即绿——锁定洞只在 lastEmitted 路径） ----
  st.active = '/b.md'
  ok('B1 切 B 渲染乙', await waitFor(() => bodyText().includes('乙段落BBB')), `text=${JSON.stringify(bodyText().slice(0, 80))}`)
  st.active = '/a.md'
  ok('B2 切回 A 渲染甲', await waitFor(() => bodyText().includes('甲段落AAA')), `text=${JSON.stringify(bodyText().slice(0, 80))}`)
  ok('B3 切回 A 无 B 残留', !bodyText().includes('乙段落BBB'))

  // ---- C 段：报障本体——WYSIWYG 编辑 A 后切 B 再切回 A ----
  const el = document.querySelector('.md-body')
  if (!el) {
    errs.push('C0 .md-body 不可达，编辑门跳过')
  } else {
    const p = document.createElement('p')
    p.textContent = '甲编辑标记ZZZ'
    el.appendChild(p)
    el.dispatchEvent(new InputEvent('input', { bubbles: true }))
    ok('C1 编辑回写到达父层', await waitFor(() => st.contents['/a.md'].includes('甲编辑标记ZZZ'), 2000), `content=${JSON.stringify(st.contents['/a.md'].slice(0, 120))}`)
    st.dirty['/a.md'] = true // App：update:content → tab.dirty=true（等价 tabBindings 写侧）
    const edited = st.contents['/a.md']

    st.active = '/b.md'
    ok('C2 切 B 渲染乙', await waitFor(() => bodyText().includes('乙段落BBB')), `text=${JSON.stringify(bodyText().slice(0, 80))}`)

    st.active = '/a.md'
    await wait(600) // 给 streamRender 分片注入留足帧
    const t = bodyText()
    detail.backToAEdited = t.slice(0, 200)
    detail.editedSource = edited.slice(0, 200)
    ok('① 切回 A 显示 A 内容（含编辑标记）', t.includes('甲编辑标记ZZZ'), `text=${JSON.stringify(t.slice(0, 120))}`)
    ok('① 切回 A 不残留 B 内容', !t.includes('乙段落BBB'), `text=${JSON.stringify(t.slice(0, 120))}`)
  }
  return { ok: errs.length === 0, errors: errs, detail }
}

let cached: Promise<Record<string, unknown>> | null = null
function result(): Promise<Record<string, unknown>> {
  if (!cached) cached = run().catch((e) => ({ ok: false, errors: [`threw: ${String(e)}`], detail }))
  return cached
}

registerSmokeMode('x28', () => {
  ;(window as any).__smoke.x28 = { result, st }
  const entry = () => TABS.find((t) => t.entry.path === st.active)!.entry
  return () =>
    h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [
      h(PreviewPane, {
        entry: entry(),
        content: st.contents[st.active],
        headings: [],
        dirty: st.dirty[st.active],
        kindLabel: { md: 'Markdown' },
        tabs: TABS,
        activeTabPath: st.active,
        viewer: null,
        basePath: '/',
        docPath: st.active,
        theme: 'dark',
        'onUpdate:content': (v: string) => {
          st.contents[st.active] = v
        },
        onToast: () => {},
        onDirty: () => {},
      }),
    ])
})
