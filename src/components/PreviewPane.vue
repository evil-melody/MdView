<script setup lang="ts">
import { ref, computed, watch, nextTick, defineAsyncComponent, h, onMounted, onBeforeUnmount } from 'vue'
import type { FileEntry, ViewTab } from '../types'
import type { OpenTab } from '../store'
import type { MarkdownHeading } from '../utils/markdown'
import MdPreview from './MdPreview.vue'
import MindmapView from './MindmapView.vue'
import BinaryViewer from './BinaryViewer.vue'
import DocxInlineEditor from './DocxInlineEditor.vue'
import PptxInlineEditor from './PptxInlineEditor.vue'
import CodeEditor from './CodeEditor.vue'
import FileIcon from './FileIcon.vue'
import { viewerTypeFor, officeEditable } from '../utils/viewer'
import { isCodeFile } from '../utils/codeLang'
import { clipboardImageBlob, saveClipboardImage } from '../utils/pasteImage'
import { createDomFind, iframeFindCss, IFRAME_FIND_STYLE_ID } from '../utils/domFind'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { TabViewer } from '../store'

const props = defineProps<{
  entry: FileEntry | null
  content: string
  headings: MarkdownHeading[]
  dirty: boolean
  kindLabel: Record<string, string>
  tabs?: OpenTab[]
  activeTabPath?: string | null
  viewer?: TabViewer | null
  basePath?: string | null
  /** 当前文档绝对路径：md 远端资源本地化用（透传给 MdPreview） */
  docPath?: string | null
  /** 新建文件的路径：命中时打开即切到「编辑」页签 */
  editOnOpen?: string | null
}>()

const emit = defineEmits<{
  (e: 'save'): void
  (e: 'save-as'): void
  (e: 'convert', ev: MouseEvent): void
  (e: 'update:content', v: string): void
  (e: 'close'): void
  (e: 'switch-tab', path: string): void
  (e: 'close-tab', path: string): void
  (e: 'open-ai'): void
  (e: 'dirty'): void
  (e: 'image-saved'): void
  (e: 'refresh-doc'): void
  /** MdPreview 本地化进行中 → 上抛 App 写回页签（loading 条单一数据源） */
  (e: 'localizing', v: boolean): void
}>()

const tab = ref<ViewTab>('preview')
const outlineOpen = ref(false)
/** 编辑器报错文案：明确展示原因便于定位 */
const editorErr = ref('')
/** docx 原生编辑器解析失败时回退到纯文本编辑（不回退 vue-files-preview，避免双 Vue 崩溃） */
const docxNativeFailed = ref(false)
// immediate：新建文件后 PreviewPane 首次挂载时也要命中 editOnOpen 直接进编辑
watch(
  () => props.entry?.path,
  (p) => {
    editorErr.value = ''
    docxNativeFailed.value = false
    if (p && p === props.editOnOpen) tab.value = 'edit'
  },
  { immediate: true }
)

/** 文本类 + docx/xlsx/pptx 可编辑；未知扩展名（other）与 csv/tsv 也按文本尝试编辑 */
const canEdit = computed(() => {
  if (!props.entry) return false
  if (['markdown', 'text', 'config', 'code', 'other'].includes(props.entry.kind)) return true
  if (isCsvLike.value) return true
  return officeEditable(props.entry)
})

/**
 * 纯只读预览类（图片/PDF/音视频）——走 BinaryViewer，不显示编辑/保存。
 * docx/xlsx/pptx 支持编辑，故排除在外。
 */
const isViewerKind = computed(() => {
  const v = viewerTypeFor(props.entry)
  return v !== null && !officeEditable(props.entry)
})

/** docx/xlsx/pptx：预览/编辑走各自编辑器 */
const isOffice = computed(() => officeEditable(props.entry))
const isDocx = computed(
  () => (props.entry?.ext || '').toLowerCase() === 'docx'
)
const isPptx = computed(
  () => (props.entry?.ext || '').toLowerCase() === 'pptx'
)
/** csv/tsv：预览走表格渲染，编辑走文本（CodeEditor），保留原格式 */
const isCsvLike = computed(() => {
  const ext = (props.entry?.ext || '').toLowerCase()
  return ext === 'csv' || ext === 'tsv'
})

/**
 * xlsx 编辑器懒加载：避免 SheetJS 首屏 chunk 阻塞。
 */
const EditorLoading = () => h('div', { class: 'editor-loading' }, '编辑器加载中…')
const OfficeSheetEditor = defineAsyncComponent({
  loader: () => import('./OfficeSheetEditor.vue'),
  loadingComponent: EditorLoading,
  delay: 150
})

/** 代码 / 配置类文件（shell、toml、xml、json、yaml、ini…）走 CodeMirror 编辑器；
 *  未知扩展名（kind=other）兜底按纯文本处理，避免被当 Markdown 乱渲染 */
const isCode = computed(
  () => isCodeFile(props.entry) || props.entry?.kind === 'other'
)

/** 代码类文件预览区的只读展示（等宽、保留空白，避免被当 Markdown 乱渲染） */
const codePreview = computed(() => (isCode.value ? props.content : ''))

/** html/htm：预览走原生 webview 渲染（asset 协议 iframe），不走 Markdown 管道 */
const isHtml = computed(
  () => !!props.entry && ['html', 'htm'].includes((props.entry.ext || '').toLowerCase())
)

/** 当前激活页签对象：html 本地化状态 / iframe 源都挂在页签上（单一数据源） */
const activeTabObj = computed<OpenTab | null>(
  () => props.tabs?.find((t) => t.entry.path === props.activeTabPath) ?? null
)

/** html iframe 源：优先用 Rust 内联后的完整 HTML（srcdoc 同源渲染，图片以 data: 直嵌，
 *  不依赖 asset://）；仅当无 htmlContent 时回退到本地化临时文件的 asset:// 地址。 */
const htmlContent = computed(() => activeTabObj.value?.htmlContent ?? '')
const htmlSrc = computed(() => {
  if (!isHtml.value || !props.entry) return ''
  return activeTabObj.value?.htmlSrc ?? convertFileSrc(props.entry.path)
})

function selectTab(t: ViewTab) {
  if (t !== 'mindmap' && !canEdit.value && t !== 'preview') return
  tab.value = t
}

const showOutline = computed(
  () => !!props.entry && props.headings.length > 0 && tab.value !== 'mindmap'
)

function scrollTo(id: string) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** xlsx 编辑器实例，供保存时导出原生二进制 */
const officeRef = ref<any>(null)
/** docx 原生编辑器实例，导出原生 .docx 字节 */
const docxRef = ref<any>(null)

/** Uint8Array → base64（docx 原生字节经 write_binary_base64 落盘） */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(bin)
}

/** 保存时取回编辑器内容：docx 走原生 .docx 字节，xlsx 走原生 base64 */
async function exportOffice(): Promise<string | null> {
  if (isDocx.value) {
    const bytes = await docxRef.value?.exportDocx?.()
    return bytes ? bytesToBase64(bytes) : null
  }
  return (await officeRef.value?.exportBase64?.()) ?? null
}

function onDocEditorError(msg: string) {
  editorErr.value = msg
  // docx 原生解析失败 → 切回 Markdown 枢纽编辑器兜底
  docxNativeFailed.value = true
}

function dismissEditorError() {
  editorErr.value = ''
}

/**
 * Markdown 编辑器粘贴截图：图片落盘到文档同目录，正文光标处插入相对路径引用。
 * 非图片粘贴不拦截，交回浏览器默认行为。
 */
async function onPasteImage(ev: ClipboardEvent) {
  const el = ev.target as HTMLTextAreaElement
  const blob = clipboardImageBlob(ev)
  if (!blob || !props.entry) return
  const dir = props.entry.path.replace(/[/\\][^/\\]*$/, '')
  if (!dir) return
  ev.preventDefault()
  try {
    const name = await saveClipboardImage(dir, blob)
    emit('image-saved')
    const snippet = `![${name}](./${name})`
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    emit('update:content', el.value.slice(0, start) + snippet + el.value.slice(end))
    await nextTick()
    el.focus()
    el.selectionStart = el.selectionEnd = start + snippet.length
  } catch (e) {
    onDocEditorError(String(e))
  }
}

/** pptx 自动保存由 PptxInlineEditor 在失焦时完成；保存按钮仅清脏标记 */
async function commitPptx(): Promise<boolean> {
  return true
}

// ---- 查找 / 替换 ----
// 两套查找表面：预览态（渲染后的 MD / 代码 <pre>）走 DOM 高亮跳转；
// 编辑态（textarea 源）走选区匹配。editorEl 在 v-if 下只指向当前挂载的那个。
const editorEl = ref<HTMLTextAreaElement | null>(null)
const findInputEl = ref<HTMLInputElement | null>(null)
const mdPreviewRef = ref<InstanceType<typeof MdPreview> | null>(null)
const codeViewEl = ref<HTMLElement | null>(null)
/** html 预览 iframe：用于注入 Ctrl/Cmd+S 转发（iframe 聚焦时按键被其吃掉） */
const htmlFrame = ref<HTMLIFrameElement | null>(null)

const findOpen = ref(false)
const findQuery = ref('')
const findReplace = ref('')
const findCase = ref(false)
const findMatches = ref<{ start: number; end: number }[]>([])
const findIndex = ref(-1)
/** 统一显示用计数（DOM 与文本两套共用），避免模板里两套变量 */
const findCount = ref(0)
const findCur = ref(-1)
/** 当前查找表面是否为渲染 DOM（决定替换控件是否可用） */
const findIsDom = ref(false)

/** 预览态 DOM 查找句柄：根容器在 MD 时为 MdPreview 正文、代码时为 <pre>、
 *  HTML 预览（srcdoc 同源 iframe）时为 iframe 的 document.body。 */
const domFind = createDomFind(() => {
  if (isHtml.value) {
    return (htmlFrame.value?.contentDocument?.body as HTMLElement | null) ?? null
  }
  return mdPreviewRef.value?.getScrollEl() ?? codeViewEl.value
})

/** 当前查找表面：dom=渲染预览，text=源编辑，none=无（iframe / CodeEditor 自带） */
function findSurface(): 'dom' | 'text' | 'none' {
  if (tab.value === 'preview') {
    // HTML 预览：Rust 已把资源内联为 data: 并以 srcdoc 同源渲染，父窗口可直接读 iframe
    // DOM 做查找高亮；无 htmlContent（回退 asset://）时跨域不可查，交回 none。
    if (isHtml.value) return htmlContent.value ? 'dom' : 'none'
    return 'dom' // MD 渲染区 / 代码 <pre>
  }
  if (tab.value === 'edit') {
    if (isCode.value) return 'none' // CodeEditor 自带查找
    return editorEl.value ? 'text' : 'none'
  }
  return 'none'
}

/** 转义正则元字符，避免查询词里的 . * ( ) 等被当成正则语法 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 按 findQuery / findCase 重新计算全部命中；空查询则清空；可传 text 直接基于新内容计算 */
function recomputeMatches(text?: string) {
  const q = findQuery.value
  if (!q) {
    findMatches.value = []
    findIndex.value = -1
    domFind.clear()
    findCount.value = 0
    findCur.value = -1
    findIsDom.value = false
    return
  }
  const surf = findSurface()
  findIsDom.value = surf === 'dom'
  if (surf === 'dom') {
    findMatches.value = []
    findIndex.value = -1
    findCount.value = domFind.find(q, findCase.value)
    findCur.value = domFind.current
  } else if (surf === 'text') {
    domFind.clear()
    const src = text ?? props.content
    const re = new RegExp(escapeRegExp(q), findCase.value ? 'g' : 'gi')
    let m: RegExpExecArray | null
    // 全局匹配逐个推进 lastIndex；零长匹配时手动 +1，避免死循环
    while ((m = re.exec(src)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++
        continue
      }
      findMatches.value.push({ start: m.index, end: m.index + m[0].length })
    }
    if (findMatches.value.length) findIndex.value = 0
    findCount.value = findMatches.value.length
    findCur.value = findIndex.value
  } else {
    findMatches.value = []
    findIndex.value = -1
    findCount.value = 0
    findCur.value = -1
  }
}

/** 选中当前命中并聚焦，使其进入视野（仅在 next/prev/替换 时调用，避免抢走查找框焦点） */
function selectCurrentMatch() {
  const el = editorEl.value
  const matches = findMatches.value
  if (!el || matches.length === 0 || findIndex.value < 0) return
  const m = matches[findIndex.value]
  el.focus()
  el.setSelectionRange(m.start, m.end)
}

function findNext() {
  if (findSurface() === 'dom') {
    domFind.next()
    findCur.value = domFind.current
    return
  }
  if (findMatches.value.length === 0) return
  findIndex.value = (findIndex.value + 1) % findMatches.value.length
  selectCurrentMatch()
  findCur.value = findIndex.value
}

function findPrev() {
  if (findSurface() === 'dom') {
    domFind.prev()
    findCur.value = domFind.current
    return
  }
  if (findMatches.value.length === 0) return
  findIndex.value =
    (findIndex.value - 1 + findMatches.value.length) % findMatches.value.length
  selectCurrentMatch()
  findCur.value = findIndex.value
}

/** 替换当前命中：通过 emit 回写 prop（不能直接改），再基于新内容重算 */
function replaceCurrent() {
  const matches = findMatches.value
  if (!findQuery.value || findIndex.value < 0 || findIndex.value >= matches.length) return
  const m = matches[findIndex.value]
  const newVal =
    props.content.slice(0, m.start) + findReplace.value + props.content.slice(m.end)
  emit('update:content', newVal)
  recomputeMatches(newVal)
  if (findIndex.value >= findMatches.value.length) {
    findIndex.value = findMatches.value.length ? findMatches.value.length - 1 : -1
  }
  selectCurrentMatch()
  findCur.value = findIndex.value
}

/** 替换全部：String.replace 全替换后回写 */
function replaceAll() {
  if (!findQuery.value) return
  const re = new RegExp(escapeRegExp(findQuery.value), findCase.value ? 'g' : 'gi')
  const newVal = props.content.replace(re, findReplace.value)
  emit('update:content', newVal)
  recomputeMatches(newVal)
}

function onFindInput(e: Event) {
  findQuery.value = (e.target as HTMLInputElement).value
  recomputeMatches()
}

async function openFind() {
  findOpen.value = true
  await nextTick()
  recomputeMatches()
  findInputEl.value?.focus()
  findInputEl.value?.select()
}

function closeFind() {
  findOpen.value = false
  findMatches.value = []
  findIndex.value = -1
  findCount.value = 0
  findCur.value = -1
  findIsDom.value = false
  domFind.clear()
  editorEl.value?.focus()
}

// ---- 编辑 ↔ 预览 滚动同步（仅 Markdown 分屏） ----
const syncLock = ref(false)

function syncScroll(source: HTMLElement, target: HTMLElement) {
  const sMax = source.scrollHeight - source.clientHeight
  const tMax = target.scrollHeight - target.clientHeight
  if (sMax <= 0 || tMax <= 0) return // 分母为 0 时跳过
  const ratio = source.scrollTop / sMax
  syncLock.value = true
  target.scrollTop = ratio * tMax
  // 用双 rAF 兜底解除 lock，确保程序化滚动触发的 scroll 事件被忽略（防双向回灌死循环）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      syncLock.value = false
    })
  })
}

function onEditorScroll() {
  if (syncLock.value) return
  const src = editorEl.value
  const tgt = mdPreviewRef.value?.getScrollEl?.()
  if (!src || !tgt) return
  syncScroll(src, tgt)
}

function onPreviewScroll() {
  if (syncLock.value) return
  const src = mdPreviewRef.value?.getScrollEl?.()
  const tgt = editorEl.value
  if (!src || !tgt) return
  syncScroll(src, tgt)
}

let boundPreviewEl: HTMLElement | null = null

function bindPreviewScroll() {
  const el = (mdPreviewRef.value?.getScrollEl?.() as HTMLElement | null) ?? null
  if (boundPreviewEl) {
    boundPreviewEl.removeEventListener('scroll', onPreviewScroll)
    boundPreviewEl = null
  }
  const inSplit =
    tab.value === 'edit' &&
    !isCode.value &&
    !isHtml.value &&
    !isOffice.value &&
    !isViewerKind.value
  if (inSplit && el) {
    el.addEventListener('scroll', onPreviewScroll)
    boundPreviewEl = el
  }
}

function onWindowKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    // 无可用查找面（HTML iframe / CodeEditor 自带）时交给各自处理，不抢键
    if (findSurface() === 'none') return
    e.preventDefault()
    openFind()
  } else if (e.key === 'Escape' && findOpen.value) {
    e.preventDefault()
    closeFind()
  }
}

/** html 预览 iframe 加载完成：从父窗口侧向 iframe 注入按键转发（Ctrl/Cmd+S 保存、Ctrl/Cmd+F 查找）。
 *  iframe 聚焦时按键被其吃掉、父 window 的 keydown 收不到，故必须在 iframe 的 window 上补监听。
 *  不依赖 Rust 内联的桥接脚本（srcdoc 文档若因 CSP / 脚本被剥离而未执行，内联桥接即失效），
 *  跨域注入抛错时才由 onBridgeMessage 兜底。
 *  同时注入查找高亮样式：父窗口 CSS 不跨文档生效，iframe 内的 <mark> 需自带样式。 */
function onHtmlFrameLoad() {
  const f = htmlFrame.value
  if (!f) return
  try {
    const w = f.contentWindow
    const d = f.contentDocument
    if (!w) return
    if (d?.head && !d.getElementById(IFRAME_FIND_STYLE_ID)) {
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4c8dff'
      const st = d.createElement('style')
      st.id = IFRAME_FIND_STYLE_ID
      st.textContent = iframeFindCss(accent)
      d.head.appendChild(st)
    }
    w.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey)) return
      if (ev.key === 's' || ev.key === 'S' || ev.code === 'KeyS') {
        ev.preventDefault()
        emit('save')
      } else if (ev.key === 'f' || ev.key === 'F' || ev.code === 'KeyF') {
        ev.preventDefault()
        void openFind()
      }
    })
  } catch {
    /* 跨域 iframe 无法注入，交给 onBridgeMessage 兜底 */
  }
}

/** 接收 HTML 预览 iframe 内「桥接」脚本发来的信号：
 *  - save：Ctrl/Cmd+S → 父窗口保存
 *  - find：Ctrl/Cmd+F → 父窗口打开查找栏（iframe 聚焦时按键被其吃掉，父 window 收不到） */
function onBridgeMessage(ev: MessageEvent) {
  const data = ev.data as { __mdview?: string } | null
  if (!data) return
  if (data.__mdview === 'save') {
    emit('save')
  } else if (data.__mdview === 'find') {
    openFind()
  }
}

// 切换 tab / 预览实例时绑定或解绑预览滚动监听，避免泄漏
watch([tab, mdPreviewRef], bindPreviewScroll, { flush: 'post' })
// 编辑时内容变化则刷新命中（保持查找栏状态与正文一致）
watch(
  () => props.content,
  () => {
    if (findOpen.value && findQuery.value) recomputeMatches()
  }
)
// 切页签 / 视图模式：清掉预览 DOM 高亮，避免回到预览时残留旧标记；
// 若查找栏仍开着且有关键词，切回后重算以恢复高亮
watch(tab, () => {
  if (findOpen.value) {
    domFind.clear()
    findCount.value = 0
    findCur.value = -1
    if (findQuery.value) nextTick(() => recomputeMatches())
  }
})

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('message', onBridgeMessage)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('message', onBridgeMessage)
  if (boundPreviewEl) {
    boundPreviewEl.removeEventListener('scroll', onPreviewScroll)
    boundPreviewEl = null
  }
})

defineExpose({ exportOffice, commitPptx })
</script>

<template>
  <div class="pane">
    <div v-if="tabs && tabs.length" class="tabstrip">
      <div
        v-for="t in tabs"
        :key="t.entry.path"
        class="ts-tab"
        :class="{ active: t.entry.path === activeTabPath }"
        :title="t.entry.path"
        @click="emit('switch-tab', t.entry.path)"
      >
        <span class="ts-ico"><FileIcon :name="t.entry.name" :is-dir="t.entry.is_dir" :size="14" /></span>
        <span class="ts-name">{{ t.entry.name }}</span>
        <span v-if="t.dirty" class="ts-dot" title="未保存">●</span>
        <span v-else-if="t.externalChanged" class="ts-dot ts-dot-warn" title="文件已在外部修改，刷新后同步">●</span>
        <button class="ts-close" title="关闭页签" @click.stop="emit('close-tab', t.entry.path)">×</button>
      </div>
    </div>
    <div class="pane-head">
      <div class="file-info">
        <button class="btn ghost icon-btn back-btn" title="返回文件列表" @click="emit('close')">←</button>
        <span class="fname">{{ entry ? entry.name : '未选择文件' }}</span>
        <span v-if="entry" class="ftag">{{ kindLabel[entry.kind] }}</span>
        <span v-if="dirty" class="dirty-dot" title="未保存">●</span>
        <span v-else-if="activeTabObj?.externalChanged" class="dirty-dot dirty-dot-warn" title="文件已在外部修改，刷新后同步">●</span>
      </div>
      <div v-if="!isViewerKind" class="tabs">
        <button
          class="tab"
          :class="{ active: tab === 'preview' }"
          @click="selectTab('preview')"
        >预览</button>
        <button
          class="tab"
          :class="{ active: tab === 'edit' }"
          :disabled="!canEdit"
          @click="selectTab('edit')"
        >编辑</button>
        <button
          class="tab"
          :class="{ active: tab === 'mindmap' }"
          :disabled="!canEdit || entry?.kind !== 'markdown'"
          @click="selectTab('mindmap')"
        >脑图</button>
      </div>
      <div class="head-actions">
        <button
          v-if="entry && entry.kind !== 'archive'"
          class="btn ghost icon-btn refresh-btn"
          title="刷新：重新读取文件内容（丢弃未保存修改前会先确认）"
          @click="emit('refresh-doc')"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89" />
            <path d="M13.7 2.6v2.5h-2.5" />
          </svg>
        </button>
        <button
          v-if="canEdit"
          class="btn"
          title="打开 AI 助手浮窗"
          @click="emit('open-ai')"
        >AI 助手</button>
        <button
          v-if="canEdit && !isOffice"
          class="btn"
          title="保存到其它位置"
          @click="emit('save-as')"
        >另存为</button>
        <button
          v-if="entry && !isViewerKind"
          class="btn"
          title="转换为其它格式（md -> pdf / docx / html …）"
          @click="emit('convert', $event)"
        >转格式</button>
        <button
          v-if="canEdit"
          class="btn primary"
          :disabled="!dirty"
          @click="emit('save')"
        >{{ dirty ? '保存*' : '已保存' }}</button>
      </div>
    </div>

    <div v-if="editorErr" class="editor-alert">
      <span class="ea-text" :title="editorErr">编辑器异常：{{ editorErr }}</span>
      <button class="ea-btn" @click="dismissEditorError">关闭</button>
    </div>

    <div class="pane-body">
      <!-- 图片 / PDF / 音视频 -->
      <BinaryViewer v-if="isViewerKind" :entry="entry" :viewer="viewer" />

      <template v-else-if="canEdit">
        <div class="content-area">
          <div v-if="tab === 'preview'" class="flex1">
            <!-- docx：原生渲染（只读预览）。脱离 vue-files-preview/@vue-office/docx 的
                 双 Vue 实例冲突（其预编译产物硬编码 vue@3.5.28，与应用 vue@3.5.13 不兼容，
                 导致 instance.update/vnode.shapeFlag/component.emitsOptions 级联崩溃） -->
            <DocxInlineEditor
              v-if="isDocx"
              :readonly="true"
              :key="entry!.path"
              :path="entry!.path"
              @error="onDocEditorError"
            />
            <!-- xlsx：vue-files-preview 渲染 -->
            <BinaryViewer v-else-if="isOffice && !isPptx" :entry="entry" :viewer="viewer" />
            <!-- pptx：预览与编辑同款渲染（vue-files-preview 在该场景下易卡死，故用同款 HTML） -->
            <PptxInlineEditor
              v-else-if="isPptx"
              :path="entry!.path"
            />
            <!-- html：Rust 已把图片内联为 data: 并以 srcdoc 同源渲染（不依赖 asset://，
                 图片显示效果与 Chrome 打开本地文件一致，且可直接 Ctrl+F 查找高亮）。
                 仅在无 htmlContent 时回退到本地化临时文件的 asset:// 地址。 -->
            <iframe
              v-else-if="isHtml && htmlContent"
              ref="htmlFrame"
              class="html-frame"
              :srcdoc="htmlContent"
              :title="entry?.name || 'HTML 预览'"
              @load="onHtmlFrameLoad"
            ></iframe>
            <iframe
              v-else-if="isHtml"
              ref="htmlFrame"
              class="html-frame"
              :src="htmlSrc"
              :title="entry?.name || 'HTML 预览'"
              @load="onHtmlFrameLoad"
            ></iframe>
            <MdPreview
              v-else-if="!isCode"
              ref="mdPreviewRef"
              :content="content"
              :dirty="dirty"
              :doc-path="entry ? entry.path : ''"
              :base-path="basePath"
              :editable="tab === 'preview'"
              @localizing="emit('localizing', $event)"
              @update:content="(v: string) => emit('update:content', v)"
            />
            <pre v-else ref="codeViewEl" class="code-view scrollable">{{ codePreview }}</pre>
            <!-- 预览态查找栏：渲染区 DOM 高亮跳转（编辑态另有分屏查找栏） -->
            <div v-if="findOpen && tab === 'preview'" class="find-bar">
              <input ref="findInputEl" class="find-input" :value="findQuery" placeholder="在预览中查找"
                @input="onFindInput" @keydown.enter.prevent="findNext" @keydown.shift.enter.prevent="findPrev" />
              <button class="find-btn" title="上一个 (Shift+Enter)" @click="findPrev">↑</button>
              <button class="find-btn" title="下一个 (Enter)" @click="findNext">↓</button>
              <label class="find-case"><input type="checkbox" v-model="findCase" @change="() => recomputeMatches()" />区分大小写</label>
              <span class="find-count">{{ findCount ? (findCur + 1) + ' / ' + findCount : '0 / 0' }}</span>
              <button class="find-close" title="关闭 (Esc)" @click="closeFind">×</button>
            </div>
          </div>
          <div v-else-if="tab === 'edit' && isOffice" class="flex1">
            <!-- docx：原生编辑（自绘受控 DOM + 图片/表格 + 原生 .docx 保存） -->
            <DocxInlineEditor
              v-if="isDocx && !docxNativeFailed"
              ref="docxRef"
              :key="entry!.path"
              :path="entry!.path"
              @change="emit('dirty')"
              @error="onDocEditorError"
            />
            <!-- docx 原生解析失败兜底：纯文本编辑（不回退 vue-files-preview，避免双 Vue 崩溃） -->
            <textarea
              v-else-if="isDocx"
              ref="editorEl"
              class="editor scrollable full"
              :value="content"
              @input="emit('update:content', ($event.target as HTMLTextAreaElement).value)"
              spellcheck="false"
            ></textarea>
            <!-- csv/tsv：文本方式编辑（CodeEditor），保存直接写回原文件 -->
            <CodeEditor
              v-else-if="isCsvLike"
              :key="entry!.path"
              :content="content"
              :path="entry!.path"
              @change="emit('dirty')"
              @update:content="(v: string) => emit('update:content', v)"
            />
            <!-- xlsx：原生表格编辑器 -->
            <OfficeSheetEditor
              v-else-if="!isPptx"
              ref="officeRef"
              :key="entry!.path"
              :path="entry!.path"
              @change="emit('dirty')"
            />
            <!-- pptx：与预览同款渲染，支持文字失焦保存 / 图片替换 -->
            <PptxInlineEditor
              v-else
              :path="entry!.path"
              @change="emit('dirty')"
            />
            <div v-if="findOpen" class="find-bar">
              <input ref="findInputEl" class="find-input" :value="findQuery" placeholder="查找"
                @input="onFindInput" @keydown.enter.prevent="findNext" @keydown.shift.enter.prevent="findPrev" />
              <input class="find-input" v-model="findReplace" placeholder="替换为"
                @keydown.enter.prevent="findNext" @keydown.shift.enter.prevent="findPrev" />
              <button class="find-btn" title="上一个 (Shift+Enter)" @click="findPrev">↑</button>
              <button class="find-btn" title="下一个 (Enter)" @click="findNext">↓</button>
              <button class="find-btn" title="替换当前" @click="replaceCurrent">替换</button>
              <button class="find-btn" title="替换全部" @click="replaceAll">全部</button>
              <label class="find-case"><input type="checkbox" v-model="findCase" @change="() => recomputeMatches()" />区分大小写</label>
              <span class="find-count">{{ findCount ? (findCur + 1) + ' / ' + findCount : '0 / 0' }}</span>
              <button class="find-close" title="关闭 (Esc)" @click="closeFind">×</button>
            </div>
          </div>
          <!-- 代码 / 配置类：CodeMirror 高亮编辑器（语法高亮 + Tab 缩进 + 查找） -->
          <div v-else-if="tab === 'edit' && isCode" class="flex1">
            <CodeEditor
              :key="entry!.path"
              :content="content"
              :path="entry!.path"
              @change="emit('dirty')"
              @update:content="(v: string) => emit('update:content', v)"
            />
          </div>
          <div v-else-if="tab === 'edit' && isHtml" class="flex1">
            <textarea
              ref="editorEl"
              class="editor scrollable full"
              :value="content"
              @input="emit('update:content', ($event.target as HTMLTextAreaElement).value)"
              spellcheck="false"
            ></textarea>
            <div v-if="findOpen" class="find-bar">
              <input ref="findInputEl" class="find-input" :value="findQuery" placeholder="查找"
                @input="onFindInput" @keydown.enter.prevent="findNext" @keydown.shift.enter.prevent="findPrev" />
              <input class="find-input" v-model="findReplace" placeholder="替换为"
                @keydown.enter.prevent="findNext" @keydown.shift.enter.prevent="findPrev" />
              <button class="find-btn" title="上一个 (Shift+Enter)" @click="findPrev">↑</button>
              <button class="find-btn" title="下一个 (Enter)" @click="findNext">↓</button>
              <button class="find-btn" title="替换当前" @click="replaceCurrent">替换</button>
              <button class="find-btn" title="替换全部" @click="replaceAll">全部</button>
              <label class="find-case"><input type="checkbox" v-model="findCase" @change="() => recomputeMatches()" />区分大小写</label>
              <span class="find-count">{{ findCount ? (findCur + 1) + ' / ' + findCount : '0 / 0' }}</span>
              <button class="find-close" title="关闭 (Esc)" @click="closeFind">×</button>
            </div>
          </div>
          <div v-else-if="tab === 'edit'" class="editor-split">
            <textarea
              ref="editorEl"
              class="editor scrollable"
              :value="content"
              @input="emit('update:content', ($event.target as HTMLTextAreaElement).value)"
              @paste="onPasteImage"
              @scroll="onEditorScroll"
              spellcheck="false"
            ></textarea>
            <div class="editor-live flex1">
              <MdPreview
                ref="mdPreviewRef"
                :content="content"
                :dirty="dirty"
                :doc-path="entry ? entry.path : ''"
                :base-path="basePath"
                @localizing="emit('localizing', $event)"
              />
            </div>
            <div v-if="findOpen" class="find-bar">
              <input ref="findInputEl" class="find-input" :value="findQuery" placeholder="查找"
                @input="onFindInput" @keydown.enter.prevent="findNext" @keydown.shift.enter.prevent="findPrev" />
              <input class="find-input" v-model="findReplace" placeholder="替换为"
                @keydown.enter.prevent="findNext" @keydown.shift.enter.prevent="findPrev" />
              <button class="find-btn" title="上一个 (Shift+Enter)" @click="findPrev">↑</button>
              <button class="find-btn" title="下一个 (Enter)" @click="findNext">↓</button>
              <button class="find-btn" title="替换当前" @click="replaceCurrent">替换</button>
              <button class="find-btn" title="替换全部" @click="replaceAll">全部</button>
              <label class="find-case"><input type="checkbox" v-model="findCase" @change="() => recomputeMatches()" />区分大小写</label>
              <span class="find-count">{{ findCount ? (findCur + 1) + ' / ' + findCount : '0 / 0' }}</span>
              <button class="find-close" title="关闭 (Esc)" @click="closeFind">×</button>
            </div>
          </div>
          <div v-else-if="tab === 'mindmap'" class="flex1">
            <MindmapView :content="content" />
          </div>

          <!-- 大纲：贴右侧竖条收缩，展开为悬浮面板（对标 InspireLoom） -->
          <transition name="ol-slide">
            <div v-if="showOutline && outlineOpen" class="outline">
              <div class="ol-head">
                <span class="ol-title">大纲</span>
                <button class="ol-close" title="收起大纲" @click="outlineOpen = false">»</button>
              </div>
              <div class="ol-list scrollable">
                <div
                  v-for="h in headings"
                  :key="h.id"
                  class="ol-item"
                  :class="'lv' + h.level"
                  @click="scrollTo(h.id)"
                >{{ h.text }}</div>
              </div>
            </div>
          </transition>
          <div
            v-if="showOutline"
            class="outline-tab"
            :class="{ on: outlineOpen }"
            title="大纲"
            @click="outlineOpen = !outlineOpen"
          >
            <span class="ot-ico">☰</span>
            <span class="ot-text">{{ outlineOpen ? '收起' : '大纲' }}</span>
          </div>
        </div>
      </template>

      <div v-else class="no-file">
        <div class="nf-emoji">🗂</div>
        <p v-if="entry">所选类型（{{ kindLabel[entry.kind] }}）暂不支持预览，可在外部程序中打开。</p>
        <p v-else>从左侧选择 Markdown / 文本 / 代码文件开始预览与编辑。</p>
      </div>
    </div>
  </div>
</template>

<style src="./PreviewPane.css"></style>
