<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DOMPurify from 'dompurify'
import { parseMarkdown, resolveLocalAssets, MDVIEW_ALLOWED_URI } from '../utils/markdown'
import { nextFrame, splitSafeChunks } from '../utils/stream-html'

const props = defineProps<{ content: string; dirty: boolean; basePath?: string | null }>()

const bodyEl = ref<HTMLElement>()
/** 已净化的完整 HTML：主题切换时直接复用，无需重解析 */
const fullHtml = ref('')
let streamToken = 0

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

/**
 * 流式渲染：先整份解析 + 净化（一次有界的准备工作），再分片注入，每片让出一帧，
 * 正文逐段出现，浏览器全程不掉帧，主线程不被整篇 innerHTML + 布局冻住。
 */
async function streamRender(content: string) {
  const token = ++streamToken
  const { html: raw } = parseMarkdown(content)
  const safe = DOMPurify.sanitize(resolveLocalAssets(raw, props.basePath), {
    ALLOWED_URI_REGEXP: MDVIEW_ALLOWED_URI
  })
  fullHtml.value = safe
  const el = bodyEl.value
  if (!el) return
  el.innerHTML = ''
  const chunks = splitSafeChunks(safe)
  for (const c of chunks) {
    if (token !== streamToken) return // 内容已变，废弃本次流式结果
    el.insertAdjacentHTML('beforeend', c)
    await nextFrame() // 让浏览器绘制本片 + 处理输入，再注入下一片
  }
  if (token === streamToken) await runMermaid()
}

/** 内容变化：增量解析 + 流式注入，正文逐段出现 */
watch(() => props.content, streamRender, { immediate: true })

/** 主题变化：重建 DOM 清掉已渲染的 SVG，再按新主题重渲染（整份替换，切换主题属低频操作） */
async function rerenderForTheme() {
  const el = bodyEl.value
  if (!el) return
  el.innerHTML = fullHtml.value
  await nextTick()
  await runMermaid()
}

let themeObserver: MutationObserver | null = null

onMounted(() => {
  // 首屏：immediate watch 在挂载前 bodyEl 尚为 null，这里补一次真正的渲染
  void streamRender(props.content)
  themeObserver = new MutationObserver(() => {
    rerenderForTheme()
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })
})

onBeforeUnmount(() => {
  streamToken++ // 取消在途流式渲染
  themeObserver?.disconnect()
  themeObserver = null
})
</script>

<template>
  <div ref="bodyEl" class="md-body scrollable"></div>
</template>

<style src="./MdPreview.css"></style>
