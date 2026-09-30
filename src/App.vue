<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { open, save } from '@tauri-apps/plugin-dialog'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { state, bumpTree, type OpenTab } from './store'
import { loadConfig, saveConfig, scanDirectory, indexRoot, deletePath, renamePath, searchFiles, readText, writeText, readOfficeMd, writeOfficeMd, writeBinaryBase64, aiChatStream, summarizeFiles, loadSummaries, clearSummaries, removeImageRecords } from './api'
import type { FileEntry, AppConfig, NewFileType } from './types'
import type { PageKey } from './store'
import { KIND_LABEL } from './types'
import Sidebar from './components/Sidebar.vue'
import FileBrowser from './components/FileBrowser.vue'
import PreviewPane from './components/PreviewPane.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import LibraryDialog from './components/LibraryDialog.vue'
import NewFileDialog from './components/NewFileDialog.vue'
import HomePage from './components/HomePage.vue'
import HelpPage from './components/HelpPage.vue'
import SimilarImages from './components/SimilarImages.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import AiDrawer from './components/AiDrawer.vue'
import { parseMarkdown, type MarkdownHeading } from './utils/markdown'
import { buildViewer, viewerTypeFor, officeEditable } from './utils/viewer'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { revealItemInDir } from '@tauri-apps/plugin-opener'

const { content, headings, dirty, activeTab } = tabBindings()
const activeViewer = computed(() => activeTab.value?.viewer ?? null)
/** 当前页签文件所在目录（md/html 相对图片引用解析用） */
const activeBaseDir = computed<string | null>(() => {
  const p = activeTab.value?.entry.path
  if (!p) return null
  const i = p.lastIndexOf('/')
  return i > 0 ? p.slice(0, i) : null
})
const showSettings = ref(false)
/** PreviewPane 实例引用：office 保存时调 exportOffice() 取原生二进制 */
const paneRef = ref<any>(null)
const showLibDialog = ref(false)
/** 新建文件弹窗：默认落当前打开目录，可在弹窗内改到别处 */
const showNewFile = ref(false)
const newFileDir = ref('')
/** 刚创建的文件路径：PreviewPane 命中后直接进「编辑」页签 */
const justCreatedPath = ref<string | null>(null)
const toast = ref('')
// AI 浮窗状态（全局：FAB + 流式输出）
const aiOpen = ref(false)
const aiResult = ref('')
const aiBusy = ref(false)
const aiTitle = ref('AI 助手')
const aiReqId = ref('')
const sidebarCollapsed = ref(false)
const sidebarWidth = ref(252)
const pendingDelete = ref<FileEntry | null>(null)
const deleting = ref(false)
const pendingClosePath = ref<string | null>(null)
const theme = ref<'dark' | 'light'>(
  (localStorage.getItem('mdview-theme') as 'dark' | 'light') || 'dark'
)

function applyTheme(t: 'dark' | 'light') {
  document.documentElement.dataset.theme = t
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  localStorage.setItem('mdview-theme', theme.value)
  applyTheme(theme.value)
}
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(msg: string) {
  toast.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2600)
}

const pageTitle = computed(() => {
  switch (state.page) {
    case 'home':
      return '首页'
    case 'files':
      return '全部文件'
    case 'recent':
      return '最近更新'
    case 'category':
      return `${KIND_LABEL[state.categoryKind] || state.categoryKind}`
    case 'similar':
      return '相似图片'
    case 'help':
      return '帮助文档'
  }
})

const flatEntries = computed(() => {
  if (state.page === 'recent') {
    return [...state.indexEntries]
      .sort((a, b) => (a.modified < b.modified ? 1 : -1))
      .slice(0, 200)
  }
  if (state.page === 'category') {
    return state.indexEntries.filter((e) => e.kind === state.categoryKind)
  }
  return state.searchResults
})

const showingFlat = computed(() =>
  state.page === 'recent' || state.page === 'category' || state.searchResults.length > 0
)

const currentParent = computed(() => {
  const cleaned = state.currentDir.replace(/[/\\]$/, '')
  const i = cleaned.lastIndexOf('/')
  const j = cleaned.lastIndexOf('\\')
  const k = Math.max(i, j)
  return k > 0 ? cleaned.slice(0, k) : cleaned
})

function kindFromPath(p: string): string {
  const ext = (p.split('.').pop() || '').toLowerCase()
  const map: Record<string, string> = {
    md: 'markdown', markdown: 'markdown', mdx: 'markdown',
    txt: 'text', text: 'text',
    json: 'config', yaml: 'config', yml: 'config', toml: 'config', ini: 'config',
    png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image',
    bmp: 'image', ico: 'image', avif: 'image', heic: 'image',
    pdf: 'document', doc: 'document', docx: 'document',
    xlsx: 'document', xls: 'document', xlsm: 'document', csv: 'document', tsv: 'document',
    pptx: 'slide', ppt: 'slide',
    mp3: 'audio', wav: 'audio', m4a: 'audio', flac: 'audio', ogg: 'audio', aac: 'audio',
    mp4: 'video', mov: 'video', webm: 'video', m4v: 'video',
    zip: 'archive', tar: 'archive', gz: 'archive', '7z': 'archive', rar: 'archive'
  }
  if (map[ext]) return map[ext]
  return 'code'
}

/** 打开一组外部传入路径（系统文件关联 / Finder 拖入） */
async function openExternalPaths(paths: string[]) {
  for (const p of paths) {
    if (!p) continue
    const name = p.split('/').pop() || p
    await openTab({
      name,
      path: p,
      is_dir: false,
      ext: (name.split('.').pop() || '').toLowerCase(),
      size: 0,
      modified: '',
      kind: kindFromPath(p)
    })
  }
}

async function init() {
  applyTheme(theme.value)
  state.config = await loadConfig()
  if (state.config.scan_roots.length) {
    await openDir(state.config.scan_roots[0])
    await rebuildIndex(false)
  }
  // 先注册 open-file 监听器，再取冷启动缓冲，避免事件竞态
  await listen<string[]>('open-file', async (ev) => {
    await openExternalPaths(ev.payload || [])
  })
  // 冷启动（窗口尚未就绪）被系统文件关联触发的打开请求由 Rust 缓存，此处取走
  try {
    const pending = (await invoke('take_pending_opens')) as string[]
    if (Array.isArray(pending) && pending.length) await openExternalPaths(pending)
  } catch {
    /* 非冷启动或取缓冲失败则忽略 */
  }
  // Finder 拖拽 md 文件进窗口 → 页签打开
  await getCurrentWebview().onDragDropEvent(async (ev) => {
    if (ev.payload.type !== 'drop') return
    const paths = ev.payload.paths || []
    const openable = paths.filter((p) =>
      [
        'md', 'markdown', 'mdx', 'txt', 'json', 'yaml', 'yml', 'toml',
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic',
        'pdf', 'docx', 'xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'pptx'
      ].includes((p.split('.').pop() || '').toLowerCase())
    )
    if (!openable.length) {
      showToast('仅支持拖入文档 / 图片 / 表格等可预览文件')
      return
    }
    for (const p of openable) {
      const name = p.split('/').pop() || p
      await openTab({
        name,
        path: p,
        is_dir: false,
        ext: (name.split('.').pop() || '').toLowerCase(),
        size: 0,
        modified: '',
        kind: kindFromPath(p)
      })
    }
  })
}

async function openDir(path: string) {
  if (!path) return
  state.busy = true
  try {
    state.currentDir = path
    state.entries = await scanDirectory(path)
    state.searchResults = []
  } catch (e) {
    showToast(String(e))
  } finally {
    state.busy = false
  }
}

async function rebuildIndex(notify = true) {
  if (!state.config.scan_roots.length) {
    showToast('请先在设置中添加资料库文件夹')
    return
  }
  state.indexing = true
  try {
    const all: FileEntry[] = []
    const seen = new Set<string>()
    for (const root of state.config.scan_roots) {
      try {
        for (const e of await indexRoot(root)) {
          if (!seen.has(e.path)) {
            seen.add(e.path)
            all.push(e)
          }
        }
      } catch (e) {
        console.warn('索引失败:', root, e)
      }
    }
    state.indexEntries = all
    if (notify) showToast(`索引完成：${all.length} 个文件`)
  } catch (e) {
    showToast(String(e))
  } finally {
    state.indexing = false
  }
}

async function addRoot() {
  const sel = await open({ directory: true, multiple: false })
  if (typeof sel !== 'string' || !sel) return
  if (state.config.scan_roots.includes(sel)) {
    showToast('该资料库已存在')
    await openDir(sel)
    return
  }
  state.config.scan_roots.push(sel)
  await saveConfig(state.config)
  showToast('已添加资料库: ' + sel.split('/').filter(Boolean).pop())
  await openDir(sel)
  await rebuildIndex(false)
}

/** 资料库管理弹窗保存：写配置 + 重建索引 + 当前目录被移除时回落到第一个资料库 */
async function onLibSaved(c: AppConfig) {
  state.config = c
  await saveConfig(c)
  if (c.scan_roots.length) {
    const currentAlive = c.scan_roots.some((r) => state.currentDir.startsWith(r))
    if (!currentAlive) await openDir(c.scan_roots[0])
    await rebuildIndex(false)
    showToast('资料库已更新')
  } else {
    state.entries = []
    state.indexEntries = []
    state.currentDir = ''
    showToast('资料库已清空')
  }
}

async function onLibOpenRoot(root: string) {
  showLibDialog.value = false
  await openRoot(root)
}

async function pickFolder() {
  const sel = await open({ directory: true, multiple: false })
  if (typeof sel === 'string' && sel) {
    if (!state.config.scan_roots.includes(sel)) {
      state.config.scan_roots.push(sel)
      await saveConfig(state.config)
    }
    await openDir(sel)
    await rebuildIndex()
  }
}

/** 边缘把手：拖动改侧栏宽度；未拖动则视为点击 → 收起侧栏 */
function startResize(e: MouseEvent) {
  const startX = e.clientX
  const startW = sidebarWidth.value
  const min = 180
  const max = 420
  let moved = 0

  function onMove(ev: MouseEvent) {
    const dx = ev.clientX - startX
    moved = Math.abs(dx)
    sidebarWidth.value = Math.min(max, Math.max(min, startW + dx))
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.classList.remove('resizing')
    if (moved < 4) sidebarCollapsed.value = true
  }

  document.body.classList.add('resizing')
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function navigate(page: PageKey, kind?: string) {
  state.page = page
  state.searchResults = []
  if (kind !== undefined) state.categoryKind = kind
  // 正在预览文档时点导航/分类：退出预览切回文件列表（页签保留，重新点文件即恢复）
  if (page !== 'home' && page !== 'help') state.selected = null
  if (page === 'files' && state.currentDir) openDir(state.currentDir)
}

async function onSelect(entry: FileEntry) {
  if (entry.is_dir) {
    state.page = 'files'
    await openDir(entry.path)
    return
  }
  state.page = 'files'
  // 全类型统一走 openTab：内部按 viewerTypeFor 分流（文本 / 图片 / office / 媒体）
  await openTab(entry)
}

async function onRename(entry: FileEntry, newName: string) {
  const np = await renamePath(entry.path, newName)
  bumpTree()
  if (state.page === 'files' || state.page === 'category') {
    await openDir(state.currentDir)
    await rebuildIndex(false)
  }
  if (state.selected?.path === entry.path) {
    state.selected = { ...entry, path: np, name: newName }
  }
}

/** 摘要缓存里有、但当前索引里没有的文件：兜底造一个最小 FileEntry，保证可点击打开 */
function entryFromPath(p: string): FileEntry {
  const name = p.split(/[/\\]/).pop() || p
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  return { name, path: p, is_dir: false, ext, size: 0, modified: '', kind: 'other' }
}

async function doSearch() {
  if (!state.searchQuery.trim()) {
    state.searchResults = []
    return
  }
  const roots = state.config.scan_roots.length ? state.config.scan_roots : [state.currentDir]
  if (!roots[0]) return
  state.searching = true
  try {
    const all: FileEntry[] = []
    const seen = new Set<string>()
    for (const root of roots) {
      try {
        for (const e of await searchFiles(root, state.searchQuery.trim(), true)) {
          if (!seen.has(e.path)) {
            seen.add(e.path)
            all.push(e)
          }
        }
      } catch (e) {
        console.warn('搜索失败:', root, e)
      }
    }
    // 摘要命中：文件名/正文没中、但 AI 摘要命中语义关键词的文件也纳入结果
    const q = state.searchQuery.trim().toLowerCase()
    const seenPath = new Set(all.map((e) => e.path))
    for (const [p, rec] of Object.entries(state.summaries)) {
      if (seenPath.has(p)) continue
      if (!rec.summary.toLowerCase().includes(q)) continue
      const known =
        state.indexEntries.find((e) => e.path === p) ??
        state.entries.find((e) => e.path === p)
      all.push(known ?? entryFromPath(p))
      seenPath.add(p)
    }
    state.searchResults = all
    if (state.page !== 'files') state.page = 'files'
    showToast(`搜索完成：${all.length} 项命中`)
  } finally {
    state.searching = false
  }
}

async function openRoot(root: string) {
  state.page = 'files'
  state.searchResults = []
  await openDir(root)
}

async function openSingleFile() {
  const sel = await open({
    multiple: false,
    filters: [
      { name: 'Markdown / 文本', extensions: ['md', 'markdown', 'mdx', 'txt', 'json', 'yaml', 'yml', 'toml'] }
    ]
  })
  if (typeof sel !== 'string' || !sel) return
  const name = sel.split('/').pop() || sel
  await openTab({
    name,
    path: sel,
    is_dir: false,
    ext: (name.split('.').pop() || '').toLowerCase(),
    size: 0,
    modified: '',
    kind: kindFromPath(sel)
  })
}

/** 新建文件入口：默认目标目录 = 当前打开目录，无则回落首个资料库 */
function openNewFile() {
  const dir = state.currentDir || state.config.scan_roots[0] || ''
  if (!dir) {
    showToast('请先添加资料库目录')
    return
  }
  newFileDir.value = dir
  showNewFile.value = true
}

async function createNewFile(p: { type: NewFileType; name: string; dir: string }) {
  const fileName = `${p.name}.${p.type.ext}`
  const dir = p.dir.replace(/[/\\]+$/, '')
  const path = `${dir}/${fileName}`
  try {
    const siblings = await scanDirectory(dir)
    // 大小写不敏感比较：macOS/Windows 文件系统下 readme.md 会覆盖 README.md
    const lower = fileName.toLowerCase()
    if (siblings.some((e) => e.name.toLowerCase() === lower)) {
      showToast(`「${fileName}」已存在，换个名字`)
      return
    }
    await writeText(path, p.type.template)
  } catch (e) {
    showToast('创建失败: ' + String(e))
    return
  }
  showNewFile.value = false
  state.page = 'files'
  state.searchResults = []
  bumpTree()
  await openDir(dir)
  await rebuildIndex(false)
  const entry: FileEntry = {
    name: fileName,
    path,
    is_dir: false,
    ext: p.type.ext,
    size: p.type.template.length,
    modified: '',
    kind: kindFromPath(path)
  }
  justCreatedPath.value = path
  await openTab(entry)
  showToast('已创建: ' + fileName)
}

/** 另存为：原生保存弹窗选位置，落盘后页签改指向新文件 */
async function saveAsCurrent() {
  const t = state.tabs.find((x) => x.entry.path === state.activeTabPath)
  if (!t) return
  const ext = (t.entry.ext || '').toLowerCase()
  const target = await save({
    defaultPath: t.entry.name,
    filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : []
  })
  if (typeof target !== 'string' || !target) return
  try {
    await writeText(target, t.content)
  } catch (e) {
    showToast('另存为失败: ' + String(e))
    return
  }
  const name = target.split('/').pop() || target
  t.entry = {
    ...t.entry,
    name,
    path: target,
    ext: (name.split('.').pop() || '').toLowerCase(),
    kind: kindFromPath(target)
  }
  state.activeTabPath = target
  state.selected = t.entry
  t.dirty = false
  bumpTree()
  const dir = target.slice(0, target.lastIndexOf('/'))
  if (dir && dir === state.currentDir) await openDir(dir)
  await rebuildIndex(false)
  showToast('已另存为: ' + name)
}

/** 手动刷新：左侧树 + 右侧列表 + 索引一起重扫（覆盖在应用外改动文件的场景） */
async function refreshAll() {
  bumpTree()
  if (state.currentDir) await openDir(state.currentDir)
  await rebuildIndex(false)
  showToast('已刷新')
}

/** 编辑器粘贴截图落盘后：新图片进索引与树 */
async function onImageSaved() {
  bumpTree()
  await rebuildIndex(false)
}

function requestDelete(entry: FileEntry) {
  pendingDelete.value = entry
}

/** 相似图片页：点缩略图定位并打开该文件（合成最小 FileEntry 复用既有打开链路） */
async function onSimilarOpen(path: string) {
  const known =
    state.indexEntries.find((e) => e.path === path) ??
    state.entries.find((e) => e.path === path)
  await onSelect(known ?? entryFromPath(path))
}

/** 相似图片页：删除单张（走统一确认弹窗，删后重算分组与索引计数） */
function onSimilarDelete(path: string) {
  const known =
    state.indexEntries.find((e) => e.path === path) ??
    state.entries.find((e) => e.path === path)
  requestDelete(known ?? entryFromPath(path))
}

async function confirmDelete() {
  const entry = pendingDelete.value
  if (!entry) return
  deleting.value = true
  try {
    await deletePath(entry.path)
    showToast('已删除: ' + entry.name)
    pendingDelete.value = null
    // 图片索引同步移除，否则已删文件仍会出现在相似分组里
    removeImageRecords([entry.path]).catch(() => {})
    bumpTree()
    if (state.page === 'files' || state.page === 'category') {
      await openDir(state.currentDir)
      await rebuildIndex(false)
    }
    if (state.selected?.path === entry.path) {
      state.selected = null
      content.value = ''
    }
  } catch (e) {
    showToast('删除失败: ' + String(e))
  } finally {
    deleting.value = false
  }
}

/** 页签绑定：content/headings/dirty 直接读写当前激活页签 */
function tabBindings() {
  const activeTab = computed<OpenTab | null>(
    () => state.tabs.find((t) => t.entry.path === state.activeTabPath) || null
  )
  const content = computed({
    get: () => activeTab.value?.content ?? '',
    set: (v: string) => {
      if (activeTab.value) {
        activeTab.value.content = v
        activeTab.value.dirty = true
      }
    }
  })
  const headings = computed<MarkdownHeading[]>(() => parseMarkdown(content.value).headings)
  const dirty = computed(() => activeTab.value?.dirty ?? false)
  return { content, headings, dirty, activeTab }
}

/**
 * 文本预览上限（字符）：超大文件整体 innerHTML 布局会卡死主线程。
 * 现改为流式分片注入（见 MdPreview），单份解析+净化为一次有界准备，正文逐段出现，
 * 故上限放宽到 5MB；更极端的大小仍拒预览以防内存膨胀。
 */
const MAX_PREVIEW_CHARS = 5_000_000

async function openTab(entry: FileEntry) {
  const existing = state.tabs.find((t) => t.entry.path === entry.path)
  if (existing) {
    state.activeTabPath = entry.path
    state.selected = existing.entry
    return
  }

  // 压缩包：无预览/编辑能力，直接提示
  if (entry.kind === 'archive') {
    showToast('压缩包暂不支持预览')
    return
  }

  // 非文本类：图片/PDF/音视频/office → viewer 预览
  if (viewerTypeFor(entry)) {
    state.tabs.push({ entry, content: '', dirty: false })
    // 注意：必须取 reactive 代理再赋值，raw 对象上直接写不会触发视图更新（曾导致永久 spinner）
    const rtab = state.tabs[state.tabs.length - 1]
    state.activeTabPath = entry.path
    state.selected = entry
    rtab.viewer = await buildViewer(entry)
    if (rtab.viewer.error) showToast(rtab.viewer.error)
    // docx/xlsx：Markdown 枢纽往返编辑——读为 md，保存写回原格式
    if (officeEditable(entry) && !rtab.viewer.error) {
      try {
        const md = await readOfficeMd(entry.path)
        if (md.length > MAX_PREVIEW_CHARS) {
          showToast('文档过大，仅支持预览')
        } else {
          rtab.content = md
        }
      } catch {
        /* md 载入失败则仅预览 */
      }
    } else if (['csv', 'tsv'].includes((entry.ext || '').toLowerCase())) {
      // csv/tsv：编辑走文本方式，读入原文
      try {
        rtab.content = await readText(entry.path)
      } catch {
        /* 读取失败则仅预览 */
      }
    }
    return
  }

  if (entry.size > MAX_PREVIEW_CHARS) {
    showToast(`文件过大（${(entry.size / 1024 / 1024).toFixed(1)} MB），暂不支持预览`)
    return
  }
  try {
    const text = await readText(entry.path)
    if (text.length > MAX_PREVIEW_CHARS) {
      showToast(`文件过大（${(text.length / 1024 / 1024).toFixed(1)} MB），暂不支持预览`)
      return
    }
    state.tabs.push({ entry, content: text, dirty: false })
    state.activeTabPath = entry.path
    state.selected = entry
  } catch (e) {
    showToast('读取失败: ' + String(e))
  }
}

function switchTab(path: string) {
  state.activeTabPath = path
  const t = state.tabs.find((x) => x.entry.path === path)
  if (t) state.selected = t.entry
}

function requestCloseTab(path: string) {
  const t = state.tabs.find((x) => x.entry.path === path)
  if (t?.dirty) {
    pendingClosePath.value = path
    return
  }
  doCloseTab(path)
}

function doCloseTab(path: string) {
  const i = state.tabs.findIndex((x) => x.entry.path === path)
  if (i < 0) return
  state.tabs.splice(i, 1)
  if (state.activeTabPath === path) {
    const next = state.tabs[Math.min(i, state.tabs.length - 1)]
    state.activeTabPath = next ? next.entry.path : null
    state.selected = next ? next.entry : null
  }
  pendingClosePath.value = null
}

function confirmCloseTab() {
  if (pendingClosePath.value) doCloseTab(pendingClosePath.value)
}

const pendingCloseName = computed(() => {
  const t = state.tabs.find((x) => x.entry.path === pendingClosePath.value)
  return t?.entry.name || ''
})

function closeDoc() {
  // ← 返回：关闭当前页签（脏页签先确认）
  if (state.activeTabPath) requestCloseTab(state.activeTabPath)
  else {
    state.selected = null
  }
}

async function saveCurrent() {
  const t = state.tabs.find((x) => x.entry.path === state.activeTabPath)
  if (!t) return
  try {
    const ext = (t.entry.ext || '').toLowerCase()
    if (ext === 'docx' || ext === 'xlsx') {
      // office 原生编辑：编辑器导出原格式二进制，直接落盘；
      // docx 原生编辑器不可用（失败回退 Markdown 枢纽）时导出为 null → md 写回 docx
      const b64 = await paneRef.value?.exportOffice?.()
      if (b64) {
        await writeBinaryBase64(t.entry.path, b64)
      } else if (ext === 'docx') {
        await writeOfficeMd(t.entry.path, t.content)
      } else {
        throw new Error('编辑器未就绪，导出失败')
      }
    } else if (ext === 'pptx') {
      // Univer 幻灯片画布：把文本改动按 manifest 写回 OOXML，失败则提示并不清脏标记
      const ok = await paneRef.value?.commitPptx?.()
      if (!ok) throw new Error('幻灯片写回失败')
    } else {
      await writeTextNoted(t)
    }
    t.dirty = false
    // office 保存后重建富预览（后端 docx HTML / SheetJS / pptx 懒加载），使预览态与磁盘一致
    if (officeEditable(t.entry) && t.viewer) {
      t.viewer = await buildViewer(t.entry)
    }
    showToast('已保存')
  } catch (e) {
    showToast('保存失败: ' + String(e))
  }
}

async function writeTextNoted(t: OpenTab) {
  await writeText(t.entry.path, t.content)
}

/** office 原生编辑器内容变更 → 标脏 */
function markOfficeDirty() {
  const t = state.tabs.find((x) => x.entry.path === state.activeTabPath)
  if (t) t.dirty = true
}

// ── AI 助手：流式输出 + 全局浮窗 ─────────────────────────
const AI_TASKS: Record<string, { title: string; system: string }> = {
  summary: {
    title: '智能摘要',
    system: '你是一名文档助手。请用简洁的中文总结下面文档的核心要点，分条列出，不超过 200 字。'
  },
  tags: {
    title: '生成标签',
    system: '请为下面的文档生成 5 个以内、逗号分隔的中文关键词标签，仅输出标签本身。'
  },
  explain: {
    title: '内容解读',
    system: '请用通俗中文解读下面的文档内容，帮助读者快速理解其主旨与结构。'
  }
}

const aiEnabled = computed(() => state.config.ai.enabled)
const aiModelLabel = computed(() => state.config.ai.model || '未配置模型')
/** AI 任务可执行：AI 已启用 + 当前有打开的内容 */
const aiCanRun = computed(() => {
  if (!aiEnabled.value) return false
  return !!activeTab.value && (activeTab.value.content?.length ?? 0) > 0
})

let unlistenChunk: UnlistenFn | null = null
let unlistenDone: UnlistenFn | null = null
let unlistenError: UnlistenFn | null = null
let unlistenSummary: UnlistenFn | null = null
/** 当前批量摘要任务 id：用于屏蔽过期任务的进度事件 */
let summaryReqId = ''

function newReqId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 批量生成 AI 摘要：命中缓存的文件直接复用（force=true 时先清缓存强制重算）。
 * 进度由后端 `ai-sum-progress` 事件驱动，完成后整体回填 store.summaries。
 */
async function runBatchSummary(paths: string[], force = false) {
  if (!aiEnabled.value) {
    showToast('请先在设置中启用 AI 并配置远程 API')
    showSettings.value = true
    return
  }
  const targets = paths.filter((p) => !!p)
  if (!targets.length) {
    showToast('当前目录没有可摘要的文件')
    return
  }
  if (state.summaryBusy) {
    showToast('摘要任务正在运行，请稍候')
    return
  }
  const reqId = newReqId()
  summaryReqId = reqId
  state.summaryBusy = true
  state.summaryDone = 0
  state.summaryTotal = targets.length
  try {
    if (force) await clearSummaries(targets)
    const res = await summarizeFiles(reqId, targets)
    if (summaryReqId !== reqId) return
    state.summaries = await loadSummaries()
    const ok = res.filter((r) => !r.error).length
    const cached = res.filter((r) => r.cached).length
    showToast(`AI 摘要完成：${ok}/${res.length}（复用缓存 ${cached}）`)
  } catch (e: any) {
    if (summaryReqId === reqId) showToast('AI 摘要失败：' + String(e?.message ?? e))
  } finally {
    if (summaryReqId === reqId) {
      state.summaryBusy = false
      state.summaryDone = state.summaryTotal
    }
  }
}

/** 列表里点「AI 摘要」：对当前可见文件（不含目录）批量生成 */
function summarizeVisible(force = false) {
  const list = showingFlat.value ? flatEntries.value : state.entries
  runBatchSummary(list.filter((e) => !e.is_dir).map((e) => e.path), force)
}

async function runAiTask(taskKey: string) {
  if (!aiEnabled.value) {
    showToast('请先在设置中启用 AI 并配置远程 API')
    showSettings.value = true
    return
  }
  if (!aiCanRun.value) {
    showToast('请先打开一个文件，再使用 AI 功能')
    return
  }
  const t = AI_TASKS[taskKey]
  if (!t) return
  const reqId = newReqId()
  aiReqId.value = reqId
  aiTitle.value = t.title
  aiResult.value = ''
  aiBusy.value = true
  aiOpen.value = true
  const prompt = activeTab.value?.content ?? ''
  const messages = [
    { role: 'system', content: t.system },
    { role: 'user', content: prompt }
  ]
  try {
    await aiChatStream(
      reqId,
      messages,
      state.config.ai.base_url,
      state.config.ai.api_key,
      state.config.ai.model
    )
  } catch (e: any) {
    // invoke 阶段的失败（请求未发出 / 非 2xx）：事件已经附带过 ai-error，这里仅兜底
    if (aiReqId.value === reqId) {
      aiResult.value += (aiResult.value ? '\n\n' : '') + '⚠️ ' + (e?.message || String(e))
    }
  } finally {
    if (aiReqId.value === reqId) aiBusy.value = false
  }
}

function openAiDrawer() {
  if (!aiEnabled.value) {
    showToast('请先在设置中启用 AI 并配置远程 API')
    showSettings.value = true
    return
  }
  aiOpen.value = true
}

onMounted(async () => {
  unlistenSummary = await listen<{ id: string; done: number; total: number; path: string }>(
    'ai-sum-progress',
    (e) => {
      if (e.payload.id !== summaryReqId) return
      state.summaryDone = e.payload.done
      state.summaryTotal = e.payload.total
    }
  )
  // 摘要缓存启动时载入：列表展示 / 搜索命中 / 树过滤都读它
  try {
    state.summaries = await loadSummaries()
  } catch {
    state.summaries = {}
  }
  unlistenChunk = await listen<{ id: string; delta: string }>('ai-chunk', (e) => {
    if (e.payload.id !== aiReqId.value) return
    aiResult.value += e.payload.delta
  })
  unlistenDone = await listen<{ id: string }>('ai-done', (e) => {
    if (e.payload.id !== aiReqId.value) return
    aiBusy.value = false
  })
  unlistenError = await listen<{ id: string; message: string }>('ai-error', (e) => {
    if (e.payload.id !== aiReqId.value) return
    aiBusy.value = false
    aiResult.value += (aiResult.value ? '\n\n' : '') + '⚠️ ' + e.payload.message
  })
})

onBeforeUnmount(() => {
  unlistenChunk?.()
  unlistenDone?.()
  unlistenError?.()
  unlistenSummary?.()
})

// ---- 右键菜单（替代 webview 默认菜单，提供文件操作） ----
interface CtxItem {
  label: string
  danger?: boolean
  action: () => void
}
const ctxMenu = ref<{ x: number; y: number; entry: FileEntry } | null>(null)

function openCtxMenu(entry: FileEntry, ev: MouseEvent) {
  ctxMenu.value = {
    x: Math.min(ev.clientX, window.innerWidth - 210),
    y: Math.min(ev.clientY, window.innerHeight - 200),
    entry
  }
}

const ctxItems = computed<CtxItem[]>(() => {
  const e = ctxMenu.value?.entry
  if (!e) return []
  const items: CtxItem[] = [
    e.is_dir
      ? { label: '打开目录', action: () => onSelect(e) }
      : { label: '打开', action: () => onSelect(e) },
    {
      label: '在 Finder 中显示',
      action: () => {
        revealItemInDir(e.path).catch((err) => showToast('打开 Finder 失败: ' + String(err)))
      }
    },
    {
      label: '复制路径',
      action: () => {
        navigator.clipboard.writeText(e.path)
        showToast('路径已复制')
      }
    }
  ]
  items.push({ label: '删除', danger: true, action: () => requestDelete(e) })
  return items
})

onMounted(() => {
  // 抑制 webview 默认右键菜单（输入框/可编辑区保留系统菜单）
  document.addEventListener('contextmenu', (ev) => {
    const t = ev.target as HTMLElement | null
    if (!t?.closest('input, textarea, [contenteditable="true"]')) ev.preventDefault()
  })
  // 调试模式快捷键：Cmd/Ctrl+Shift+I 或 F12 打开/关闭 Webview 调试器
  window.addEventListener('keydown', onDevtoolsKey)
  // 空闲时预加载 office 预览库 chunk，消除首次打开 office 文件的卡顿
  const idle = (window as any).requestIdleCallback || ((cb: any) => setTimeout(cb, 1500))
  idle(() => {
    import('vue-files-preview/lib/style.css').catch(() => {})
    import('vue-files-preview').catch(() => {})
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onDevtoolsKey)
})

function onDevtoolsKey(e: KeyboardEvent) {
  if (e.key === 'F12' || ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyI')) {
    e.preventDefault()
    invoke('toggle_devtools').catch(() => {})
  }
}

onMounted(init)
</script>

<template>
  <div class="layout">
    <Sidebar
      v-show="!sidebarCollapsed"
      :style="{ width: sidebarWidth + 'px' }"
      :theme="theme"
      @navigate="navigate"
      @search="doSearch"
      @open-settings="showSettings = true"
      @ai-action="runAiTask"
      @open-root="openRoot"
      @add-root="addRoot"
      @collapse="sidebarCollapsed = true"
      @open-entry="onSelect"
      @toggle-theme="toggleTheme"
      @manage-roots="showLibDialog = true"
      @new-file="openNewFile"
      @refresh="refreshAll"
      @entry-context="openCtxMenu"
    />
    <div
      v-show="!sidebarCollapsed"
      class="v-resizer"
      title="拖动调整宽度，点击收起"
      @mousedown.prevent="startResize($event)"
    ></div>
    <button
      v-if="sidebarCollapsed"
      class="edge-fab left"
      title="展开侧栏"
      @click="sidebarCollapsed = false"
    >›</button>
    <div class="main-col">
      <div class="topbar">
        <div class="topbar-left">
          <div class="topbar-title">{{ pageTitle }}</div>
        </div>
      </div>

      <HomePage
        v-if="state.page === 'home'"
        @navigate="navigate"
        @rescan="rebuildIndex()"
        @open-settings="showSettings = true"
        @open-root="openRoot"
        @add-root="addRoot"
      />
      <HelpPage v-else-if="state.page === 'help'" @open-settings="showSettings = true" />

      <SimilarImages
        v-else-if="state.page === 'similar'"
        @open-file="onSimilarOpen"
        @delete="onSimilarDelete"
        @toast="showToast"
      />

      <template v-else>
        <!-- 文档打开：直接全宽预览（树在左侧资料库中） -->
        <PreviewPane
          v-if="state.selected"
          ref="paneRef"
          class="wb-full"
          :entry="state.selected"
            :content="content"
            :headings="headings"
            :dirty="dirty"
            :kind-label="KIND_LABEL"
            :tabs="state.tabs"
            :active-tab-path="state.activeTabPath"
            :viewer="activeViewer"
            :base-path="activeBaseDir"
            :edit-on-open="justCreatedPath"
            @switch-tab="switchTab"
            @close-tab="requestCloseTab"
            @save="saveCurrent"
            @save-as="saveAsCurrent"
            @image-saved="onImageSaved"
            @update:content="content = $event"
            @close="closeDoc"
            @open-ai="openAiDrawer"
            @dirty="markOfficeDirty"
          />
        <FileBrowser
          v-else
          class="wb-full"
          :current-dir="state.currentDir"
          :entries="showingFlat ? flatEntries : state.entries"
          :searching="state.searching"
          :search-active="!!state.searchResults.length"
          :mode="showingFlat ? 'flat' : 'browse'"
          :flat-title="pageTitle"
          :active-path="state.activeTabPath"
          @open="onSelect"
          @delete="requestDelete"
          @rename="onRename"
          @up="openDir(currentParent)"
          @open-dir="openDir"
          @new-file="openNewFile"
          @search="doSearch"
          @entry-context="openCtxMenu"
          @summarize="(force) => summarizeVisible(force)"
          @summarize-one="(e, force) => runBatchSummary([e.path], force)"
          v-model:query="state.searchQuery"
        />
      </template>
    </div>

    <SettingsDialog
      v-if="showSettings"
      :config="state.config"
      @close="showSettings = false"
      @saved="(c) => (state.config = c)"
    />

    <LibraryDialog
      v-if="showLibDialog"
      :config="state.config"
      @close="showLibDialog = false"
      @saved="onLibSaved"
      @open-root="onLibOpenRoot"
    />

    <NewFileDialog
      v-if="showNewFile"
      :default-dir="newFileDir"
      @close="showNewFile = false"
      @create="createNewFile"
    />

    <ConfirmDialog
      v-if="pendingDelete"
      title="确认删除"
      :message="`确定要删除「${pendingDelete.name}」吗？此操作不可恢复。`"
      :danger="true"
      :busy="deleting"
      confirm-text="删除"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />

    <ConfirmDialog
      v-if="pendingClosePath"
      title="关闭页签"
      :message="`「${pendingCloseName}」有未保存的修改，关闭后将丢失。确定关闭吗？`"
      :danger="true"
      confirm-text="丢弃并关闭"
      @confirm="confirmCloseTab"
      @cancel="pendingClosePath = null"
    />

    <!-- 自定义右键菜单 -->
    <div
      v-if="ctxMenu"
      class="ctx-overlay"
      @click="ctxMenu = null"
      @contextmenu.prevent="ctxMenu = null"
    >
      <div
        class="ctx-menu"
        :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
      >
        <button
          v-for="it in ctxItems"
          :key="it.label"
          class="ctx-item"
          :class="{ danger: it.danger }"
          @click.stop="it.action(); ctxMenu = null"
        >{{ it.label }}</button>
      </div>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>

    <!-- AI 助手：右下角 FAB + 流式浮窗（全局可用，不依赖具体页签） -->
    <AiDrawer
      :open="aiOpen"
      :enabled="aiEnabled"
      :title="aiTitle"
      :result="aiResult"
      :busy="aiBusy"
      :can-run="aiCanRun"
      :model-label="aiModelLabel"
      @update:open="aiOpen = $event"
      @task="runAiTask"
    />
  </div>
</template>

<style src="./App.css"></style>
