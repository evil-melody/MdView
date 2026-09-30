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
    ai: { enabled: false, base_url: 'https://api.openai.com/v1', api_key: '', model: 'gpt-4o-mini' }
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
