<script setup lang="ts">
import { ref, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import TurndownService from 'turndown'

/**
 * docx「预览即编辑」：vue-files-preview 的 DocxPreview（与预览 tab 同一渲染内核，
 * @vue-office/docx 输出真实 HTML DOM）渲染后加 contenteditable 光标直接改，
 * 编辑内容经 turndown 转 Markdown 实时回传上层（保存走 Markdown 枢纽 write_office_md）。
 */
const DocxPreview = defineAsyncComponent(async () => {
  await import('vue-files-preview/lib/style.css')
  const mod: any = await import('vue-files-preview')
  return mod.DocxPreview ?? mod.default?.DocxPreview ?? mod.default ?? mod
})

const props = defineProps<{ src: string }>()
const emit = defineEmits<{
  (e: 'change'): void
  (e: 'ready'): void
  (e: 'error', m: string): void
  (e: 'update:content', v: string): void
}>()

const hostRef = ref<HTMLDivElement | null>(null)
const ready = ref(false)
let wrapper: HTMLElement | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let lastHtml = ''

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})
// docx-preview 的页面容器/样式 div：剥壳保留内容
turndown.addRule('stripSections', {
  filter: (node: any) => node.nodeName === 'SECTION' || node.nodeName === 'DIV',
  replacement: (content: string) => content,
})
// 图片暂不回写（Markdown 枢纽保存为文本级）
turndown.addRule('dropImages', {
  filter: 'img',
  replacement: () => '',
})

// 不依赖 @vue-office/docx 的 rendered 事件（实测不可靠）：
// 轮询检测 .docx-wrapper 出现后立即加编辑光标
function startPolling() {
  let waited = 0
  pollTimer = setInterval(() => {
    waited += 200
    const host = hostRef.value
    const w = host
      ? ((host.querySelector('.docx-wrapper') as HTMLElement) ||
        (host.firstElementChild as HTMLElement | null))
      : null
    if (w && w.querySelector('p, h1, h2, h3, table')) {
      stopPolling()
      attachEditing(w)
    } else if (waited > 20000) {
      stopPolling()
      emit('error', '文档渲染超时')
    }
  }, 200)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function attachEditing(w: HTMLElement) {
  wrapper = w
  w.contentEditable = 'true'
  w.spellcheck = false
  w.setAttribute('role', 'textbox')
  // 捕获阶段监听容器内所有编辑事件
  w.addEventListener('input', onInput)
  ready.value = true
  emit('ready')
  // 初次同步（后续保存兜底）
  syncContent()
}

function onInput() {
  emit('change')
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(syncContent, 700)
}

function syncContent() {
  if (!wrapper) return
  const html = wrapper.innerHTML
  if (html === lastHtml) return
  lastHtml = html
  try {
    const md = turndown.turndown(html).replace(/\n{3,}/g, '\n\n').trim()
    emit('update:content', md)
  } catch (_) {
    /* 转换失败静默，下次输入重试 */
  }
}

onMounted(() => {
  startPolling()
})

onUnmounted(() => {
  stopPolling()
  if (debounceTimer) clearTimeout(debounceTimer)
  if (wrapper) {
    wrapper.removeEventListener('input', onInput)
    wrapper.contentEditable = 'false'
    wrapper = null
  }
})
</script>

<template>
  <div ref="hostRef" class="oie">
    <DocxPreview :url="props.src" @error="(e: Error) => emit('error', e.message)" />
    <div v-if="!ready" class="oie-loading">
      <div class="oie-spinner"></div>
      <span>加载中…</span>
    </div>
  </div>
</template>

<style src="./OfficeEditors.css" scoped></style>
