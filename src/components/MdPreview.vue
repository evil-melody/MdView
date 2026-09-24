<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DOMPurify from 'dompurify'
import { parseMarkdown, resolveLocalAssets, MDVIEW_ALLOWED_URI } from '../utils/markdown'

const props = defineProps<{ content: string; dirty: boolean; basePath?: string | null }>()

const html = computed(() => {
  const { html: h } = parseMarkdown(props.content)
  return DOMPurify.sanitize(resolveLocalAssets(h, props.basePath), {
    ALLOWED_URI_REGEXP: MDVIEW_ALLOWED_URI
  })
})

const bodyEl = ref<HTMLElement>()

// ---- mermaid：动态加载（独立 chunk，不阻塞首屏） ----
let mermaidMod: Promise<any> | null = null

function currentMermaidTheme(): string {
  return document.documentElement.dataset.theme === 'light' ? 'neutral' : 'dark'
}

function getMermaid(theme: string) {
  if (!mermaidMod) mermaidMod = import('mermaid')
  return mermaidMod.then((m) => {
    // 每次调用都按当前主题重新 initialize，保证切换主题后配色同步
    m.default.initialize({
      startOnLoad: false,
      theme,
      securityLevel: 'strict'
    })
    return m.default
  })
}

/** 渲染正文里所有尚未处理的 mermaid 图 */
async function runMermaid() {
  const el = bodyEl.value
  if (!el) return
  const nodes = Array.from(el.querySelectorAll<HTMLElement>('.mermaid:not([data-processed])'))
  if (!nodes.length) return
  try {
    const mermaid = await getMermaid(currentMermaidTheme())
    await mermaid.run({ nodes })
  } catch (e) {
    // 语法错误时保留原文，不阻塞其他内容
    console.warn('mermaid render failed:', e)
  }
}

/** 内容变化：Vue 已重写 innerHTML，直接渲染新出现的图 */
watch(html, async () => {
  await nextTick()
  await runMermaid()
})

/** 主题变化：重建 DOM 清掉已渲染的 SVG，再按新主题重渲染 */
async function rerenderForTheme() {
  const el = bodyEl.value
  if (!el) return
  el.innerHTML = html.value
  await nextTick()
  await runMermaid()
}

let themeObserver: MutationObserver | null = null

onMounted(() => {
  runMermaid()
  themeObserver = new MutationObserver(() => {
    rerenderForTheme()
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })
})

onBeforeUnmount(() => {
  themeObserver?.disconnect()
  themeObserver = null
})
</script>

<template>
  <div ref="bodyEl" class="md-body scrollable" v-html="html"></div>
</template>

<style src="./MdPreview.css"></style>
