import { reactive } from 'vue'
import type { AppConfig, FileEntry, ViewTab } from './types'

export type PageKey = 'home' | 'files' | 'recent' | 'category' | 'help'

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
  busy: false
})

export function kindCounts(): Record<string, number> {
  const map: Record<string, number> = {}
  for (const e of state.indexEntries) {
    map[e.kind] = (map[e.kind] || 0) + 1
  }
  return map
}
