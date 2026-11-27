<script setup lang="ts">
import { ref, computed, watch, nextTick, defineAsyncComponent, h, onMounted, onBeforeUnmount } from 'vue'
import type { FileEntry, ViewTab } from '../types'
import type { OpenTab } from '../store'
import type { MarkdownHeading } from '../utils/markdown'
import MdPreview from './MdPreview.vue'
import MindmapView from './MindmapView.vue'
import BinaryViewer from './BinaryViewer.vue'
import CodeEditor from './CodeEditor.vue'
import FileIcon from './FileIcon.vue'
import { viewerTypeFor, officeEditable } from '../utils/viewer'
import { isCodeFile } from '../utils/codeLang'
import { formatHtml, isMinifiedHtml } from '../utils/htmlFormat'
import { transformJson } from '../utils/jsonFormat'
import JsonView from './JsonView.vue'
import { clipboardImageBlob, saveClipboardImage } from '../utils/pasteImage'
import { createDomFind, iframeFindCss, iframeVideoCss, IFRAME_FIND_STYLE_ID } from '../utils/domFind'
import { convertFileSrc } from '@tauri-apps/api/core'
import { EditorView } from '@codemirror/view'
import type { TabViewer } from '../store'
import { wrap, setWrap } from '../composables/useWrap'

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
  /** 应用主题：透传给 Office 引擎顶部栏与格式工具条 */
  theme?: 'dark' | 'light'
}>()

const emit = defineEmits<{
  (e: 'save'): void
  (e: 'save-as'): void
  (e: 'convert', ev: MouseEvent): void
  (e: 'update:content', v: string): void
  (e: 'close'): void
  (e: 'switch-tab', path: string): void
  (e: 'close-tab', path: string): void
  /** 批量关闭（右键菜单：关闭其他 / 关闭右侧 / 全部关闭） */
  (e: 'close-tabs', paths: string[]): void
  /** 从编辑切回预览时重载 HTML iframe（不重读磁盘，避免未保存改动被覆盖） */
  (e: 'refresh-html'): void
  (e: 'open-ai'): void
  (e: 'dirty'): void
  (e: 'image-saved'): void
  (e: 'refresh-doc'): void
  /** MdPreview 本地化进行中 → 上抛 App 写回页签（loading 条单一数据源） */
  (e: 'localizing', v: boolean): void
  /** JSON 变换结果 / 错误提示 */
  (e: 'toast', m: string): void
}>()

const tab = ref<ViewTab>('preview')
const outlineOpen = ref(false)
/** 编辑器报错文案：明确展示原因便于定位 */
const editorErr = ref('')
// immediate：新建文件后 PreviewPane 首次挂载时也要命中 editOnOpen 直接进编辑
watch(
  () => props.entry?.path,
  (p) => {
    editorErr.value = ''
    if (p && p === props.editOnOpen) tab.value = 'edit'
  },
  { immediate: true }
)

const isPdfEntry = (entry: FileEntry | null | undefined) =>
  (entry?.ext || '').toLowerCase() === 'pdf'
const isPdf = computed(() => isPdfEntry(props.entry))
/** 扫描件（无文本层）由 PdfEditor 探测后回传，禁止进编辑态 */
const pdfReadonly = ref(new Set<string>())
function onPdfReadonly(path: string, v: boolean) {
  const next = new Set(pdfReadonly.value)
  if (v) next.add(path)
  else next.delete(path)
  pdfReadonly.value = next
}

/** 文本类 + docx/xlsx/pptx + 非扫描 PDF 可编辑；未知扩展名（other）与 csv/tsv 也按文本尝试编辑 */
const canEdit = computed(() => {
  if (!props.entry || streaming.value) return false
  if (isPdf.value) return !pdfReadonly.value.has(props.entry.path)
  if (['markdown', 'text', 'config', 'code', 'other'].includes(props.entry.kind)) return true
  if (isCsvLike.value) return true
  return officeEditable(props.entry)
})

/**
 * 纯只读预览类（图片/音视频）——走 BinaryViewer，不显示编辑/保存。
 * docx/xlsx/pptx 与 pdf 各有编辑器，故排除在外。
 */
const isViewerKind = computed(() => {
  const v = viewerTypeFor(props.entry)
  return v !== null && v !== 'pdf' && !officeEditable(props.entry)
})

/** docx/xlsx/pptx：预览与编辑共用同一个 Office 引擎实例 */
const isOffice = computed(() => officeEditable(props.entry))
/** csv/tsv：与 xlsx 同走 Office 表格引擎（内核以工作簿打开，保存写回原分隔符文本） */
const isCsvLike = computed(() => {
  const ext = (props.entry?.ext || '').toLowerCase()
  return ext === 'csv' || ext === 'tsv'
})

/**
 * Office 宿主懒加载：组件 chunk 只在首次打开 docx/xlsx/pptx 时下载。
 */
const EditorLoading = () => h('div', { class: 'editor-loading' }, '编辑器加载中…')
const OfficeEngineHost = defineAsyncComponent({
  loader: () => import('./OfficeEngineHost.vue'),
  loadingComponent: EditorLoading,
  delay: 150
})
/** PDF 编辑器同样懒加载：pdfjs + pdf-lib chunk 只在首次打开 pdf 时下载 */
const PdfEditor = defineAsyncComponent({
  loader: () => import('./PdfEditor.vue'),
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

/** 超大文本：正文按字节区间流式装载，只读且 content 为空 */
const streaming = computed(() => !!activeTabObj.value?.stream)
const streamRev = computed(() => activeTabObj.value?.streamRev ?? 0)

/** html iframe 源：优先用 Rust 内联后的完整 HTML（srcdoc 同源渲染，图片以 data: 直嵌，
 *  不依赖 asset://）；仅当无 htmlContent 时回退到本地化临时文件的 asset:// 地址。 */
const htmlContent = computed(() => activeTabObj.value?.htmlContent ?? '')
const htmlSrc = computed(() => {
  if (!isHtml.value || !props.entry) return ''
  return activeTabObj.value?.htmlSrc ?? convertFileSrc(props.entry.path)
})

/** 每个文件只自动格式化一次：压缩 HTML 首次进编辑时排版，避免反复标脏 */
const htmlFormatted = new Set<string>()

function formatHtmlDoc() {
  emit('update:content', formatHtml(props.content))
}

function selectTab(t: ViewTab) {
  if (t !== 'mindmap' && !canEdit.value && t !== 'preview') return
  // HTML 编辑 → 预览：重载 iframe 一次，保证刚保存的源码立刻反映到预览
  if (t === 'preview' && tab.value === 'edit' && isHtml.value) emit('refresh-html')
  tab.value = t
}

// 导入的 HTML 常是单行压缩源码：进编辑时用块级换行/缩进排版，行内节点保持原样
watch([tab, () => props.entry?.path], () => {
  const p = props.entry?.path
  if (tab.value !== 'edit' || !isHtml.value || !p || htmlFormatted.has(p)) return
  htmlFormatted.add(p)
  if (!isMinifiedHtml(props.content)) return
  nextTick(() => emit('update:content', formatHtml(props.content)))
})

const showOutline = computed(
  () => !!props.entry && props.headings.length > 0 && tab.value !== 'mindmap' && tab.value !== 'json'
)

/** JSON 专用页签：json* 扩展名，或整篇看起来是 JSON 的 txt / 未知文本 */
const JSON_EXTS = ['json', 'jsonc', 'json5']
const isJsonDoc = computed(() => {
  if (!props.entry || streaming.value || isOffice.value || isPdf.value || isViewerKind.value) return false
  if (JSON_EXTS.includes((props.entry.ext || '').toLowerCase())) return true
  const s = props.content.trim()
  return (s.startsWith('{') || s.startsWith('[')) && s.length < 2_000_000
})
/** 右键 JSON 变换可用面：文本类且可编辑（office / pdf / 图片 / 流式各自有编辑器，不走文本变换） */
const canJsonTransform = computed(
  () => !!props.entry && canEdit.value && !streaming.value && !isOffice.value && !isPdf.value && !isViewerKind.value
)

function scrollTo(id: string) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * Office 引擎实例按页签常驻：切页签只切 display，不销毁宿主实例 / Worker，
 * 不重读盘、不重新解析 6.4MB 级文档。
 * 首次挂载必须在可见态：引擎 docx 分页用 getBoundingClientRect() 测量块高，
 * display:none 下首次渲染会把所有块高读成 0 且不再重测。
 * ponytail: 实例数 = 打开过的 Office 页签数，不设 LRU。
 * 上限：开很多大文档时内存线性增长。
 * 升级：按最近访问顺序保留 3~4 个，超出者 destroy 并从集合移除。
 */
const mountedOfficePaths = ref(new Set<string>())
const mountedPdfPaths = ref(new Set<string>())
/** 集合内容未变就不赋新引用：否则每次切页签都让全部常驻实例做一次无谓 patch */
function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}
watch(
  () => [props.activeTabPath, props.tabs?.map((t) => t.entry.path).join('\u0000')] as const,
  () => {
    const live = new Set((props.tabs ?? []).map((t) => t.entry.path))
    const nextOffice = new Set([...mountedOfficePaths.value].filter((p) => live.has(p)))
    const nextPdf = new Set([...mountedPdfPaths.value].filter((p) => live.has(p)))
    const active = (props.tabs ?? []).find((t) => t.entry.path === props.activeTabPath)
    if (active && officeEditable(active.entry)) nextOffice.add(active.entry.path)
    if (active && isPdfEntry(active.entry)) nextPdf.add(active.entry.path)
    if (!sameSet(mountedOfficePaths.value, nextOffice)) mountedOfficePaths.value = nextOffice
    if (!sameSet(mountedPdfPaths.value, nextPdf)) mountedPdfPaths.value = nextPdf
  },
  { immediate: true }
)

const officeHosts = computed(() =>
  (props.tabs ?? []).filter(
    (t) => mountedOfficePaths.value.has(t.entry.path) && officeEditable(t.entry)
  )
)
const pdfHosts = computed(() =>
  (props.tabs ?? []).filter(
    (t) => mountedPdfPaths.value.has(t.entry.path) && isPdfEntry(t.entry)
  )
)

/** 每个页签一个引擎句柄：保存时按当前激活路径取对应实例 */
type OfficeEngineApi = { save: () => Promise<Uint8Array | null>; find?: () => void }
const engines = new Map<string, OfficeEngineApi>()
function setEngine(path: string, el: unknown) {
  const api = el as OfficeEngineApi | null
  if (api && typeof api.save === 'function') engines.set(path, api)
  else engines.delete(path)
}
/** 按路径缓存 ref 回调：内联箭头函数每次 patch 都是新引用，会先 delete 再 set 句柄 */
const refCache = new Map<string, (el: unknown) => void>()
function engineRef(path: string, pdf = false) {
  const key = (pdf ? 'p:' : 'o:') + path
  let f = refCache.get(key)
  if (!f) {
    f = (el: unknown) => (pdf ? setPdfEngine(path, el) : setEngine(path, el))
    refCache.set(key, f)
  }
  return f
}

async function saveOffice(): Promise<Uint8Array | null> {
  const p = props.activeTabPath ?? props.entry?.path ?? ''
  return (await engines.get(p)?.save()) ?? null
}

/** PDF 宿主同样按页签常驻：保存时按激活路径取对应实例导出新字节 */
const pdfEngines = new Map<string, OfficeEngineApi>()
function setPdfEngine(path: string, el: unknown) {
  const api = el as OfficeEngineApi | null
  if (api && typeof api.save === 'function') pdfEngines.set(path, api)
  else pdfEngines.delete(path)
}
async function savePdf(): Promise<Uint8Array | null> {
  const p = props.activeTabPath ?? props.entry?.path ?? ''
  return (await pdfEngines.get(p)?.save()) ?? null
}

function onDocEditorError(msg: string) {
  editorErr.value = msg
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
  // Office 引擎自带查找；PDF 文本层未进 DOM；流式编辑器自带 CodeMirror 查找
  if (isOffice.value || isPdf.value || streaming.value) return 'none'
  // JSON 区左侧 CodeMirror 自带查找，右侧树只读，不参与主查找栏
  if (tab.value === 'json') return 'none'
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
    if (findMatches.value.length) {
      findIndex.value = 0
      findCur.value = 0
      gotoMatch(false)
    }
    findCount.value = findMatches.value.length
  } else {
    findMatches.value = []
    findIndex.value = -1
    findCount.value = 0
    findCur.value = -1
  }
}

/** 选中当前命中并滚动到视野：先聚焦编辑器让浏览器把选区（精确支持自动换行）滚入视野，再归还焦点给查找框。
 *  focusEditor=true 时定位后停在编辑器（用于替换后继续编辑）；否则焦点留在查找框，可连续输入或点箭头。 */
function gotoMatch(focusEditor = false) {
  const el = editorEl.value
  const matches = findMatches.value
  if (!el || matches.length === 0 || findIndex.value < 0) return
  const m = matches[findIndex.value]
  el.focus({ preventScroll: false })
  el.setSelectionRange(m.start, m.end)
  if (!focusEditor) findInputEl.value?.focus()
}

function findNext() {
  if (findSurface() === 'dom') {
    domFind.next()
    findCur.value = domFind.current
    return
  }
  if (findMatches.value.length === 0) return
  findIndex.value = (findIndex.value + 1) % findMatches.value.length
  gotoMatch(false)
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
  gotoMatch(false)
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
  gotoMatch(false)
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
  if (e.key === 'Escape') {
    if (tabMenu.value) tabMenu.value = null
    if (wrapMenu.value) wrapMenu.value = null
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    // 焦点落在内容区但不在可编辑控件内时，原生 Ctrl/⌘+A 会选中整个页面（含应用外壳）。
    // 改为在编辑器内选全：CodeMirror / textarea / 预览区，避免选到应用外。
    // Office 视图（表格/Word/PPT）自带全选处理，不在这里抢。
    const ae = document.activeElement as HTMLElement | null
    const inPane = ae?.closest?.('.pane-body')
    const inOffice = !!ae?.closest?.('.ov-sheet, .ov-doc-root, .ov-slides')
    const editableFocused =
      !!ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable || !!ae.closest?.('.cm-editor'))
    if (inPane && !editableFocused && !inOffice) {
      e.preventDefault()
      selectAllInEditor()
    } else if (!inPane && !editableFocused) {
      // 焦点散落在外壳上（如侧栏/空白处）：拦下原生全选，避免把侧栏文件列表一起选中
      e.preventDefault()
    }
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    // Office 视图自带查找栏（Word/Excel），由当前激活页签的引擎实例打开；
    // 旧路径 findSurface() 对 Office 恒返回 none，快捷键静默失效。
    if (isOffice.value) {
      const api = engines.get(String(props.activeTabPath ?? ''))
      if (api && typeof api.find === 'function') { e.preventDefault(); api.find() }
      return
    }
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
 *  同时注入 iframe 自身文档需要的样式：父窗口 CSS 不跨文档生效（查找高亮 + 视频号播放块）。 */
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
      st.textContent = iframeFindCss(accent) + iframeVideoCss()
      d.head.appendChild(st)
    }
    // 超过 Rust 内联上限（12MB）的视频仍是相对路径：srcdoc 文档没有可用的 base URL，
    // 逐个按当前文档所在目录改写成 asset 绝对地址，浏览器才会真的发起请求。
    const baseDir = props.entry?.path.replace(/[/\\][^/\\]*$/, '') ?? ''
    if (d && baseDir) {
      for (const v of Array.from(d.querySelectorAll<HTMLVideoElement>('video.mdview-video'))) {
        const s = v.getAttribute('src') ?? ''
        if (s && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(s)) {
          v.setAttribute('src', convertFileSrc(`${baseDir}/${s}`))
        }
      }
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

// ── 页签条：横向滚动（无原生滚动条）+ VSCode 风格右键菜单 ──────────────
const stripRef = ref<HTMLElement | null>(null)
const overflow = ref({ left: false, right: false })
const tabMenu = ref<{ path: string; x: number; y: number } | null>(null)
/** 内容区右键菜单：自动换行开关对全部文档编辑器生效；editor 记录右键时聚焦的编辑器，供「全选」在编辑器内作用 */
const wrapMenu = ref<{ x: number; y: number; sel?: { from: number; to: number; text: string }; editor?: HTMLElement | null } | null>(null)

/** 在编辑器内「全选」：CodeMirror 用其 EditorView 选全文，textarea 用 .select()，避免选到应用外 */
function selectAllInEditor() {
  const root = wrapMenu.value?.editor ?? (document.activeElement as HTMLElement | null)
  const cmDom = (root?.closest?.('.cm-editor') as HTMLElement | null) ?? (document.querySelector('.cm-editor') as HTMLElement | null)
  if (cmDom) {
    const view = EditorView.findFromDOM(cmDom)
    if (view) {
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } })
      cmDom.focus()
      return
    }
  }
  const ta = (root?.tagName === 'TEXTAREA' ? root : document.querySelector('textarea.editor')) as HTMLTextAreaElement | null
  if (ta) {
    ta.focus()
    ta.select()
    return
  }
  const md = document.querySelector('.md-preview') as HTMLElement | null
  if (md) {
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(md)
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
}
let stripObserver: ResizeObserver | null = null

function updateOverflow() {
  const el = stripRef.value
  if (!el) return
  overflow.value = {
    left: el.scrollLeft > 1,
    right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1
  }
}

/** 激活页签滚到可见区：手动算 scrollLeft，避免 scrollIntoView 带动整个页面 */
function scrollActiveIntoView() {
  const el = stripRef.value
  const active = el?.querySelector<HTMLElement>('.ts-tab.active')
  if (!el || !active) return
  const l = active.offsetLeft
  const r = l + active.offsetWidth
  if (l < el.scrollLeft) el.scrollLeft = Math.max(0, l - 12)
  else if (r > el.scrollLeft + el.clientWidth) el.scrollLeft = r - el.clientWidth + 12
  updateOverflow()
}

function onStripWheel(e: WheelEvent) {
  const el = stripRef.value
  if (!el || el.scrollWidth <= el.clientWidth) return
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!delta) return
  e.preventDefault()
  el.scrollLeft += delta
  updateOverflow()
}

const tabMenuItems = computed(() => {
  const m = tabMenu.value
  if (!m || !props.tabs?.length) return []
  const paths = props.tabs.map((t) => t.entry.path)
  const i = Math.max(0, paths.indexOf(m.path))
  const p = m.path
  return [
    { label: '关闭', danger: false, sep: false, run: () => emit('close-tab', p) },
    { label: '关闭其他', danger: false, sep: false, run: () => emit('close-tabs', paths.filter((x) => x !== p)) },
    { label: '关闭右侧', danger: false, sep: false, run: () => emit('close-tabs', paths.slice(i + 1)) },
    { label: '全部关闭', danger: true, sep: true, run: () => emit('close-tabs', paths) }
  ]
})

function openTabMenu(ev: MouseEvent, path: string) {
  wrapMenu.value = null
  tabMenu.value = {
    path,
    x: Math.min(ev.clientX, window.innerWidth - 198),
    y: Math.min(ev.clientY, window.innerHeight - 158)
  }
}

/**
 * 打开菜单时快照选区：点击菜单项会让编辑器失焦，CodeMirror / textarea 的选区随之丢失。
 * CodeMirror 的 DOM Selection 与 doc 偏移一一对应；textarea 用 selectionStart/End。
 */
function snapshotSelection(): { from: number; to: number; text: string } | undefined {
  const ta = editorEl.value
  if (ta && document.activeElement === ta && ta.selectionEnd > ta.selectionStart) {
    return { from: ta.selectionStart, to: ta.selectionEnd, text: ta.value.slice(ta.selectionStart, ta.selectionEnd) }
  }
  const sel = window.getSelection()
  const text = sel && !sel.isCollapsed ? sel.toString() : ''
  if (!text.trim()) return undefined
  const from = props.content.indexOf(text)
  return from >= 0 ? { from, to: from + text.length, text } : undefined
}

/** 格式化 / 压缩：有选区只变换选区，无选区变换全文；whole=true 是 JSON 工具条按钮 */
function applyJsonTransform(compact: boolean, whole = false) {
  const picked = whole ? undefined : wrapMenu.value?.sel
  wrapMenu.value = null
  const src = picked && picked.text.trim() ? picked.text : props.content
  const r = transformJson(src, compact)
  if (!r.ok) return emit('toast', r.error)
  if (!picked || !picked.text.trim()) {
    emit('update:content', r.text)
  } else {
    emit('update:content', props.content.slice(0, picked.from) + r.text + props.content.slice(picked.to))
  }
  emit('dirty')
  emit('toast', compact ? '已压缩为单行' : '已格式化')
  // 格式化全文后自动切到 JSON 页签：树视图实时跟随（报障：格式化后要看到树）
  if ((!picked || !picked.text.trim()) && !compact && isJsonDoc.value && tab.value !== 'json') tab.value = 'json'
}

function openWrapMenu(ev: MouseEvent) {
  // Office 视图自带右键菜单：外壳菜单不叠加，避免 Word/PPT 出现两个菜单
  if ((ev.target as HTMLElement | null)?.closest?.('.ov-sheet, .ov-doc-root, .ov-slides')) return
  tabMenu.value = null
  wrapMenu.value = {
    x: Math.min(ev.clientX, window.innerWidth - 190),
    y: Math.min(ev.clientY, window.innerHeight - 150),
    sel: snapshotSelection(),
    editor: document.activeElement as HTMLElement | null
  }
}

watch([() => props.activeTabPath, () => props.tabs?.length], () => {
  nextTick(() => {
    updateOverflow()
    scrollActiveIntoView()
  })
})

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('message', onBridgeMessage)
  if (stripRef.value) {
    stripObserver = new ResizeObserver(() => {
      updateOverflow()
      scrollActiveIntoView()
    })
    stripObserver.observe(stripRef.value)
  }
  nextTick(() => {
    updateOverflow()
    scrollActiveIntoView()
  })
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('message', onBridgeMessage)
  stripObserver?.disconnect()
  stripObserver = null
  if (boundPreviewEl) {
    boundPreviewEl.removeEventListener('scroll', onPreviewScroll)
    boundPreviewEl = null
  }
})

defineExpose({ saveOffice, savePdf, openFind })
</script>

<template>
  <div class="pane">
    <div v-if="tabs && tabs.length" class="tabstrip-wrap">
      <div ref="stripRef" class="tabstrip" @scroll="updateOverflow" @wheel="onStripWheel">
        <div
          v-for="t in tabs"
          :key="t.entry.path"
          class="ts-tab"
          :class="{ active: t.entry.path === activeTabPath }"
          :title="t.entry.path"
          @click="emit('switch-tab', t.entry.path)"
          @contextmenu.prevent="openTabMenu($event, t.entry.path)"
        >
          <span class="ts-ico"><FileIcon :name="t.entry.name" :is-dir="t.entry.is_dir" :size="14" /></span>
          <span class="ts-name">{{ t.entry.name }}</span>
          <span v-if="t.dirty" class="ts-dot" title="未保存">●</span>
          <span v-else-if="t.externalChanged" class="ts-dot ts-dot-warn" title="文件已在外部修改，刷新后同步">●</span>
          <button class="ts-close" title="关闭页签" @click.stop="emit('close-tab', t.entry.path)">×</button>
        </div>
      </div>
      <!-- 淡出遮罩：只提示「还能往这边滚」，不显示原生滚动条 -->
      <div class="ts-fade left" :class="{ show: overflow.left }"></div>
      <div class="ts-fade right" :class="{ show: overflow.right }"></div>
    </div>
    <div class="pane-head">
      <div class="file-info">
        <button class="btn ghost icon-btn back-btn" title="返回文件列表" @click="emit('close')">←</button>
        <span class="fname" :title="entry?.name">{{ entry ? entry.name : '未选择文件' }}</span>
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
        <button
          v-if="isJsonDoc"
          class="tab"
          :class="{ active: tab === 'json' }"
          title="左右分栏：源码编辑 + 格式化树，可格式化 / 压缩"
          @click="selectTab('json')"
        >JSON</button>
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
          v-if="canEdit && !isPdf"
          class="btn"
          title="打开 AI 助手浮窗"
          @click="emit('open-ai')"
        >AI 助手</button>
        <button
          v-if="canEdit && !isOffice && !isPdf"
          class="btn"
          title="保存到其它位置"
          @click="emit('save-as')"
        >另存为</button>
        <button
          v-if="entry && !isViewerKind && !isPdf && !streaming"
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

    <div class="pane-body" :class="{ 'no-wrap': !wrap }" @contextmenu.prevent="openWrapMenu">
      <!-- docx/xlsx/pptx：每个访问过的页签常驻一个引擎实例，切页签只切 display。
           引擎实例与「预览 / 编辑」页签无关，切 tab 只改 editable，不丢未保存改动。 -->
      <OfficeEngineHost
        v-for="t in officeHosts"
        :key="t.entry.path"
        :ref="engineRef(t.entry.path)"
        v-show="isOffice && t.entry.path === activeTabPath"
        :path="t.entry.path"
        :name="t.entry.name"
        :editable="tab === 'edit'"
        :theme="theme || 'dark'"
        :rev="t.officeRev ?? 0"
        @change="emit('dirty')"
        @error="onDocEditorError"
      />
      <!-- PDF：按页签常驻，扫描件（无文本层）由组件回传只读状态 -->
      <PdfEditor
        v-for="t in pdfHosts"
        :key="t.entry.path"
        :ref="engineRef(t.entry.path, true)"
        v-show="isPdf && t.entry.path === activeTabPath"
        :path="t.entry.path"
        :rev="t.pdfRev ?? 0"
        :editable="tab === 'edit'"
        :active="isPdf && t.entry.path === activeTabPath"
        @change="emit('dirty')"
        @error="onDocEditorError"
        @readonly="(v) => onPdfReadonly(t.entry.path, v)"
      />
      <!-- 非 Office 分支：与常驻引擎并列，以下 v-if / v-else-if / v-else 为一条链 -->
      <template v-if="!isOffice">
      <!-- 图片 / 音视频 -->
      <BinaryViewer v-if="isViewerKind" :entry="entry" :viewer="viewer" />

      <!-- 超大文本：只读流式编辑器，正文不进页签 content；rev 变化即从头重读 -->
      <CodeEditor
        v-else-if="streaming"
        :key="`stream-${entry!.path}-${streamRev}`"
        class="flex1"
        :content="''"
        :path="entry!.path"
        :size="entry!.size"
        stream
      />

      <template v-else-if="canEdit && !isPdf">
        <div class="content-area">
          <!-- JSON 专用区：左源码可编辑，右格式化树实时跟随 -->
          <JsonView
            v-if="tab === 'json'"
            :content="content"
            :path="entry!.path"
            @update:content="(v: string) => emit('update:content', v)"
            @dirty="emit('dirty')"
            @transform="(compact: boolean) => applyJsonTransform(compact, true)"
          />
          <div v-else-if="tab === 'preview'" class="flex1">
            <!-- html：Rust 已把图片内联为 data: 并以 srcdoc 同源渲染（不依赖 asset://，
                 图片显示效果与 Chrome 打开本地文件一致，且可直接 Ctrl+F 查找高亮）。
                 仅在无 htmlContent 时回退到本地化临时文件的 asset:// 地址。 -->
            <iframe
              v-if="isHtml && htmlContent"
              ref="htmlFrame"
              class="html-frame"
              :key="`srcdoc-${activeTabObj?.htmlRev ?? 0}`"
              :srcdoc="htmlContent"
              :title="entry?.name || 'HTML 预览'"
              @load="onHtmlFrameLoad"
            ></iframe>
            <iframe
              v-else-if="isHtml"
              ref="htmlFrame"
              class="html-frame"
              :key="`src-${activeTabObj?.htmlRev ?? 0}`"
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
            <pre v-else ref="codeViewEl" class="code-view scrollable" :class="{ wrap }">{{ codePreview }}</pre>
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
          <!-- html/htm：CodeMirror HTML 模式（语法高亮 + 行号 + 查找替换 + 格式化） -->
          <div v-else-if="tab === 'edit' && isHtml" class="flex1">
            <CodeEditor
              :key="entry!.path"
              :content="content"
              :path="entry!.path"
              formattable
              @change="emit('dirty')"
              @update:content="(v: string) => emit('update:content', v)"
              @format="formatHtmlDoc"
            />
          </div>
          <div v-else-if="tab === 'edit'" class="editor-split">
            <textarea
              ref="editorEl"
              class="editor scrollable"
              :wrap="wrap ? 'soft' : 'off'"
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

      <div v-else-if="!isPdf" class="no-file">
        <div class="nf-emoji">🗂</div>
        <p v-if="entry">所选类型（{{ kindLabel[entry.kind] }}）暂不支持预览，可在外部程序中打开。</p>
        <p v-else>从左侧选择 Markdown / 文本 / 代码文件开始预览与编辑。</p>
      </div>
      </template>
    </div>

    <!-- 页签右键菜单：复用 App.css 的全局 ctx-* 样式 -->
    <div
      v-if="tabMenu"
      class="ctx-overlay"
      @click="tabMenu = null"
      @contextmenu.prevent="tabMenu = null"
    >
      <div class="ctx-menu" :style="{ left: tabMenu.x + 'px', top: tabMenu.y + 'px' }">
        <template v-for="it in tabMenuItems" :key="it.label">
          <div v-if="it.sep" class="ts-menu-sep"></div>
          <button
            class="ctx-item"
            :class="{ danger: it.danger }"
            @click.stop="it.run(); tabMenu = null"
          >{{ it.label }}</button>
        </template>
      </div>
    </div>

    <!-- 内容区右键菜单：自动换行开关对所有文档编辑器生效 -->
    <div
      v-if="wrapMenu"
      class="ctx-overlay"
      @click="wrapMenu = null"
      @contextmenu.prevent="wrapMenu = null"
    >
      <div class="ctx-menu" :style="{ left: wrapMenu.x + 'px', top: wrapMenu.y + 'px' }">
        <button class="ctx-item" @click.stop="setWrap(!wrap); wrapMenu = null">
          {{ wrap ? '✓ ' : '' }}内容自动换行
        </button>
        <div class="ts-menu-sep"></div>
        <button class="ctx-item" @click.stop="selectAllInEditor(); wrapMenu = null">全选（编辑器内）</button>
        <template v-if="canJsonTransform">
          <div class="ts-menu-sep"></div>
          <button class="ctx-item" @click.stop="applyJsonTransform(false)">
            格式化 JSON{{ wrapMenu.sel ? '（选区）' : '（全文）' }}
          </button>
          <button class="ctx-item" @click.stop="applyJsonTransform(true)">
            压缩 JSON{{ wrapMenu.sel ? '（选区）' : '（全文）' }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style src="./PreviewPane.css"></style>
