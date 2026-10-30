import { reactive } from 'vue'
import type { AppConfig, FileEntry, SimilarGroup, SummaryRecord, ViewTab } from './types'

export type PageKey = 'home' | 'files' | 'recent' | 'category' | 'similar' | 'help'

/** 非文本文件的预览模型（图片/PDF/音视频/office） */
export interface TabViewer {
  type: 'image' | 'pdf' | 'audio' | 'video' | 'docx' | 'sheet' | 'pptx'
  /** asset 协议地址：媒体类直接渲染；office 类喂给 vue-files-preview（照搬 InspireLoom） */
  src?: string
  error?: string
}

export interface OpenTab {
  entry: FileEntry
  content: string
  dirty: boolean
  viewer?: TabViewer
  /** md 远端资源本地化进行中（预览头部 loading 条数据源） */
  localizing?: boolean
  /** html 远端资源本地化进行中（同上） */
  htmlLocalizing?: boolean
  /** 文件指纹：打开 / 保存 / 刷新时更新，轮询比对磁盘变动用 */
  fingerprint?: string | null
  /** html 预览内容：本地化后的 HTML 全文（srcdoc 同源注入 iframe；与 App 同源 → 图片可显示 + 可 Ctrl+F） */
  htmlContent?: string
  /** html 回退源：本地化临时文件的 asset:// 地址（仅在无 htmlContent 时使用） */
  htmlSrc?: string
  /** html 重载序号：本地化 / 刷新时自增，绑定到 iframe :key 强制重渲染 */
  htmlRev?: number
  /** 文件已在外部修改、但页签有未保存内容：页签打标点，刷新 / 保存后清除 */
  externalChanged?: boolean
}

interface AppState {
  page: PageKey
  categoryKind: string
  currentDir: string
  entries: FileEntry[]
  indexEntries: FileEntry[]
  indexing: boolean
  selected: FileEntry | null
  tabs: OpenTab[]
  activeTabPath: string | null
  config: AppConfig
  viewTab: ViewTab
  searchQuery: string
  searchResults: FileEntry[]
  searching: boolean
  busy: boolean
  /** 文件树版本号：文件系统发生变更后自增，FileTree 监听后重扫已加载节点 */
  treeVersion: number
  /** AI 摘要缓存：path -> 记录（启动时从后端 summaries.json 载入） */
  summaries: Record<string, SummaryRecord>
  /** 批量摘要进行中（列表顶部显示进度条） */
  summaryBusy: boolean
  summaryDone: number
  summaryTotal: number
  /** 已索引图片数（dHash 索引） */
  imageIndexed: number
  /** 图片索引扫描中 + 进度 */
  imageIndexing: boolean
  imageIndexDone: number
  imageIndexTotal: number
  /** 相似图片分组结果 */
  similarGroups: SimilarGroup[]
  similarBusy: boolean
}

export const state = reactive<AppState>({
  page: 'home',
  categoryKind: '',
  currentDir: '',
  entries: [],
  indexEntries: [],
  indexing: false,
  selected: null,
  tabs: [],
  activeTabPath: null,
  config: {
    scan_roots: [],
    ai: { enabled: false, profiles: [], chat_profile: '', embedding_profile: '', vlm_profile: '' }
  },
  viewTab: 'preview',
  searchQuery: '',
  searchResults: [],
  searching: false,
  busy: false,
  treeVersion: 0,
  summaries: {},
  summaryBusy: false,
  summaryDone: 0,
  summaryTotal: 0,
  imageIndexed: 0,
  imageIndexing: false,
  imageIndexDone: 0,
  imageIndexTotal: 0,
  similarGroups: [],
  similarBusy: false
})

/** 取文件摘要正文（无记录返回空串） */
export function summaryOf(path: string): string {
  return state.summaries[path]?.summary || ''
}

/** 文件系统变更（增/删/改名/另存/粘贴图片）后调用：通知左侧资料库树重扫 */
export function bumpTree() {
  state.treeVersion++
}

export function kindCounts(): Record<string, number> {
  const map: Record<string, number> = {}
  for (const e of state.indexEntries) {
    map[e.kind] = (map[e.kind] || 0) + 1
  }
  return map
}
