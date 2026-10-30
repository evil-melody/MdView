<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DOMPurify from 'dompurify'
import { parseMarkdown, resolveLocalAssets, MDVIEW_ALLOWED_URI } from '../utils/markdown'
import { hasRemoteRefs, localizeMdHtml } from '../utils/localize'
import { nextFrame, splitSafeChunks } from '../utils/stream-html'
import { htmlToMarkdown } from '../utils/htmlToMarkdown'

const props = defineProps<{
  content: string
  dirty: boolean
  /** 文档绝对路径：md 远端资源本地化用（App 经 PreviewPane 透传 entry.path） */
  docPath: string
  basePath?: string | null
  /** 所见即所得：预览区可直接编辑，输入回写为 Markdown 源（emit update:content） */
  editable?: boolean
}>()

const emit = defineEmits<{
  (e: 'localizing', v: boolean): void
  (e: 'update:content', v: string): void
}>()

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
  // 渲染前把 mermaid 源码存入 data 属性：mermaid.run 会把 div 内容换成 SVG，
  // 所见即所得编辑回写时需从 data 取回源码，否则脑图会在保存时被洗掉
  for (const n of nodes) {
    if (!n.dataset.mermaidSrc) n.dataset.mermaidSrc = n.textContent || ''
  }
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
  const { html: parsed } = parseMarkdown(content)
  let raw = parsed
  // 远端资源本地化：仅初始加载 / 刷新后（dirty=false）触发，编辑中跳过；
  // 结果按文档+内容缓存，同内容重复渲染不重复下载
  if (!props.dirty && props.docPath && hasRemoteRefs(raw)) {
    emit('localizing', true)
    try {
      raw = await localizeMdHtml(props.docPath, raw)
    } catch (e) {
      // 本地化失败按原样渲染，不阻塞预览
      console.warn('md localize failed:', e)
    }
    // 内容已变（用户开始编辑 / 又打开别的文件）：loading 状态交给新一轮渲染管
    if (token !== streamToken) return
    emit('localizing', false)
  }
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

/** 所见即所得编辑回写时记录最后发出的源，避免父层回写 props.content 触发整页重渲染（丢光标） */
const lastEmitted = ref('')

/** 内容变化：增量解析 + 流式注入，正文逐段出现。
 *  自己编辑回写的 content 与 lastEmitted 相同 → 跳过重渲染。 */
watch(
  () => props.content,
  (c) => {
    if (c === lastEmitted.value) return
    void streamRender(c)
  },
  { immediate: true }
)

/** 所见即所得：编辑防抖回写为 Markdown 源（mermaid 经 data 属性保真） */
let inputTimer: ReturnType<typeof setTimeout> | undefined
function onBodyInput() {
  if (!props.editable) return
  if (inputTimer) clearTimeout(inputTimer)
  inputTimer = setTimeout(() => {
    const el = bodyEl.value
    if (!el) return
    const md = htmlToMarkdown(el, props.basePath)
    lastEmitted.value = md
    emit('update:content', md)
  }, 250)
}

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
  // 本地化在途时被卸载（切页签 / 切预览模式）：兜底清 loading，避免父组件条子卡住
  emit('localizing', false)
  themeObserver?.disconnect()
  themeObserver = null
})

/** 暴露预览滚动容器（.md-body），供父组件做编辑↔预览滚动同步 */
defineExpose({ getScrollEl: () => bodyEl.value })
</script>

<template>
  <div
    ref="bodyEl"
    class="md-body scrollable"
    :class="{ 'md-editable': editable }"
    :contenteditable="editable ? 'true' : undefined"
    @input="onBodyInput"
  ></div>
</template>

<style src="./MdPreview.css"></style>
