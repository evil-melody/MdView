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
const activeFormats = ref<Record<string, boolean>>({})
const fontFamily = ref('')
const fontSize = ref('')
let wrapper: HTMLElement | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let lastHtml = ''

// execCommand fontSize 用 1-7 档（浏览器映射约 10/13/16/18/24/32/48px）
const fontSizes = [
  { label: '10', value: '1' },
  { label: '13', value: '2' },
  { label: '16', value: '3' },
  { label: '18', value: '4' },
  { label: '24', value: '5' },
  { label: '32', value: '6' },
  { label: '48', value: '7' },
]

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

function exec(cmd: string, value: string | null = null) {
  if (!wrapper) return
  wrapper.focus()
  try {
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(cmd, false, value ?? undefined)
    updateToolbar()
    onInput()
  } catch (e) {
    console.warn('[OfficeDocInlineEditor] execCommand failed', cmd, e)
  }
}

function setFontFamily(name: string) {
  exec('fontName', name)
}

function setFontSize(size: string) {
  exec('fontSize', size)
}

function setColor(hex: string) {
  exec('foreColor', hex)
}

function setHilite(hex: string) {
  exec('hiliteColor', hex)
}

function setHeading(tag: string) {
  exec('formatBlock', tag)
}

function isInsideWrapper(): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !wrapper) return false
  return wrapper.contains(sel.anchorNode)
}

function updateToolbar() {
  if (!isInsideWrapper()) return
  activeFormats.value = {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
    strikeThrough: document.queryCommandState('strikeThrough'),
    justifyLeft: document.queryCommandState('justifyLeft'),
    justifyCenter: document.queryCommandState('justifyCenter'),
    justifyRight: document.queryCommandState('justifyRight'),
    insertUnorderedList: document.queryCommandState('insertUnorderedList'),
    insertOrderedList: document.queryCommandState('insertOrderedList'),
  }
  fontFamily.value = document.queryCommandValue('fontName') || ''
  fontSize.value = document.queryCommandValue('fontSize') || ''
}

let selTimer: ReturnType<typeof setTimeout> | null = null
function onSelectionChange() {
  if (selTimer) clearTimeout(selTimer)
  selTimer = setTimeout(updateToolbar, 80)
}

onMounted(() => {
  startPolling()
  document.addEventListener('selectionchange', onSelectionChange)
})

onUnmounted(() => {
  stopPolling()
  if (debounceTimer) clearTimeout(debounceTimer)
  if (selTimer) clearTimeout(selTimer)
  document.removeEventListener('selectionchange', onSelectionChange)
  if (wrapper) {
    wrapper.removeEventListener('input', onInput)
    wrapper.contentEditable = 'false'
    wrapper = null
  }
})
</script>

<template>
  <div ref="hostRef" class="oie">
    <div class="oie-bar">
      <button
        class="oie-btn"
        title="撤销"
        @mousedown.prevent
        @click="exec('undo')"
      >↶</button>
      <button
        class="oie-btn"
        title="重做"
        @mousedown.prevent
        @click="exec('redo')"
      >↷</button>
      <span class="oie-sep"></span>
      <select
        class="oie-sel oie-sel-font"
        title="字体"
        :value="fontFamily"
        @change="setFontFamily(($event.target as HTMLSelectElement).value)"
      >
        <option value="">字体</option>
        <option value="Microsoft YaHei">微软雅黑</option>
        <option value="PingFang SC">苹方</option>
        <option value="SimSun">宋体</option>
      </select>
      <select
        class="oie-sel oie-sel-size"
        title="字号"
        :value="fontSize"
        @change="setFontSize(($event.target as HTMLSelectElement).value)"
      >
        <option value="">字号</option>
        <option v-for="s in fontSizes" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
      <span class="oie-sep"></span>
      <button
        class="oie-btn"
        :class="{ active: activeFormats.bold }"
        title="加粗"
        @mousedown.prevent
        @click="exec('bold')"
      >B</button>
      <button
        class="oie-btn"
        :class="{ active: activeFormats.italic }"
        title="斜体"
        @mousedown.prevent
        @click="exec('italic')"
      ><i>I</i></button>
      <button
        class="oie-btn"
        :class="{ active: activeFormats.underline }"
        title="下划线"
        @mousedown.prevent
        @click="exec('underline')"
      >U</button>
      <button
        class="oie-btn"
        :class="{ active: activeFormats.strikeThrough }"
        title="删除线"
        @mousedown.prevent
        @click="exec('strikeThrough')"
      >S</button>
      <input
        class="oie-color"
        type="color"
        title="字体颜色"
        @mousedown.prevent
        @input="setColor(($event.target as HTMLInputElement).value)"
      />
      <input
        class="oie-color"
        type="color"
        title="背景颜色"
        @mousedown.prevent
        @input="setHilite(($event.target as HTMLInputElement).value)"
      />
      <button
        class="oie-btn"
        title="清除格式"
        @mousedown.prevent
        @click="exec('removeFormat')"
      >⌫</button>
      <button
        class="oie-btn"
        title="上标"
        @mousedown.prevent
        @click="exec('superscript')"
      >x²</button>
      <button
        class="oie-btn"
        title="下标"
        @mousedown.prevent
        @click="exec('subscript')"
      >x₂</button>
      <span class="oie-sep"></span>
      <button
        class="oie-btn"
        :class="{ active: activeFormats.justifyLeft }"
        title="左对齐"
        @mousedown.prevent
        @click="exec('justifyLeft')"
      >⇤</button>
      <button
        class="oie-btn"
        :class="{ active: activeFormats.justifyCenter }"
        title="居中"
        @mousedown.prevent
        @click="exec('justifyCenter')"
      >⇔</button>
      <button
        class="oie-btn"
        :class="{ active: activeFormats.justifyRight }"
        title="右对齐"
        @mousedown.prevent
        @click="exec('justifyRight')"
      >⇥</button>
      <span class="oie-sep"></span>
      <button
        class="oie-btn"
        title="一级标题"
        @mousedown.prevent
        @click="setHeading('h1')"
      >H1</button>
      <button
        class="oie-btn"
        title="二级标题"
        @mousedown.prevent
        @click="setHeading('h2')"
      >H2</button>
      <button
        class="oie-btn"
        title="三级标题"
        @mousedown.prevent
        @click="setHeading('h3')"
      >H3</button>
      <button
        class="oie-btn"
        title="正文"
        @mousedown.prevent
        @click="setHeading('p')"
      >正文</button>
      <button
        class="oie-btn"
        title="引用"
        @mousedown.prevent
        @click="setHeading('blockquote')"
      >❝</button>
      <button
        class="oie-btn"
        title="代码块"
        @mousedown.prevent
        @click="setHeading('pre')"
      >{ }</button>
      <button
        class="oie-btn"
        title="分割线"
        @mousedown.prevent
        @click="exec('insertHorizontalRule')"
      >—</button>
      <span class="oie-sep"></span>
      <button
        class="oie-btn"
        title="减少缩进"
        @mousedown.prevent
        @click="exec('outdent')"
      >⇤</button>
      <button
        class="oie-btn"
        title="增加缩进"
        @mousedown.prevent
        @click="exec('indent')"
      >⇥</button>
      <span class="oie-sep"></span>
      <button
        class="oie-btn"
        :class="{ active: activeFormats.insertUnorderedList }"
        title="无序列表"
        @mousedown.prevent
        @click="exec('insertUnorderedList')"
      >• 列表</button>
      <button
        class="oie-btn"
        :class="{ active: activeFormats.insertOrderedList }"
        title="有序列表"
        @mousedown.prevent
        @click="exec('insertOrderedList')"
      >1. 列表</button>
    </div>
    <div class="oie-body">
      <DocxPreview :url="props.src" @error="(e: Error) => emit('error', e.message)" />
      <div v-if="!ready" class="oie-loading">
        <div class="oie-spinner"></div>
        <span>加载中…</span>
      </div>
    </div>
  </div>
</template>

<style src="./OfficeEditors.css" scoped></style>
