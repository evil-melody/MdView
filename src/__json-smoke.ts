/**
 * JSON 折叠冒烟入口（报障 #100 的验证门）。
 *
 * 症状：package.json 在编辑器页签只显示带行号的源码，大 JSON 没法折叠。
 * 根因不在路由（tab==='edit' 走 CodeEditor 是对的），而在 CodeEditor 从未挂
 * CodeMirror 的折叠扩展面 —— 语言包（lang-json 等）提供了 foldNodeProp 数据，
 * 但没有 codeFolding()/foldGutter()/foldKeymap，数据就没有消费者。
 *
 * 断言走 DOM 与状态双侧，不只查「扩展挂上了」：
 *   A 折叠槽渲染（.cm-foldGutter 存在且元素数 ≥ 可折叠节点数）
 *   B 点折叠槽 → 行数真的减少 + 占位符出现
 *   C 点展开 → 行数复原
 *   D foldCode 命令面（Ctrl+Shift+[ 走 foldKeymap 同一条 effect）
 */
import { createApp, h, ref } from 'vue'
import CodeEditor from './components/CodeEditor.vue'

declare global {
  interface Window {
    __jsonSmoke: {
      ready: () => boolean
      doc: string
      lineCount: () => number
      gutters: () => number
      placeholders: () => number
      clickFold: (i: number) => boolean
    }
  }
}

const DOC = JSON.stringify(
  {
    name: 'alphadojo-web',
    private: true,
    version: '0.1.0',
    scripts: { dev: 'vite', build: 'vite build', typecheck: 'vue-tsc --noEmit' },
    dependencies: { vue: '^3.5.0', codemirror: '^6.0.0' },
  },
  null,
  2
)

const ready = ref(false)
window.__jsonSmoke = {
  ready: () => ready.value,
  doc: DOC,
  lineCount: () => document.querySelectorAll('.cm-line').length,
  gutters: () => document.querySelectorAll('.cm-foldGutter .cm-gutterElement').length,
  placeholders: () => document.querySelectorAll('.cm-foldPlaceholder').length,
  /** 点第 i 个折叠槽（0 基），返回是否点到 */
  clickFold: (i: number) => {
    const els = document.querySelectorAll<HTMLElement>('.cm-foldGutter .cm-gutterElement')
    if (!els[i]) return false
    els[i].click()
    return true
  },
}

createApp({
  render() {
    return h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [
      h(CodeEditor, {
        content: DOC,
        path: 'package.json',
        onChange: () => {},
        'onUpdate:content': () => {},
      }),
    ])
  },
  mounted() {
    ready.value = true
  },
}).mount('#app')
