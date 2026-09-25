export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  ext: string
  size: number
  modified: string
  kind: string
}

export interface AiConfig {
  enabled: boolean
  base_url: string
  api_key: string
  model: string
}

export interface AppConfig {
  scan_roots: string[]
  ai: AiConfig
}

export interface ChatMessage {
  role: string
  content: string
}

export type ViewTab = 'preview' | 'edit' | 'mindmap'

export const KIND_LABEL: Record<string, string> = {
  folder: '文件夹',
  markdown: 'Markdown',
  text: '文本',
  config: '配置',
  code: '代码',
  image: '图片',
  document: '文档',
  sheet: '表格',
  slide: '演示',
  pdf: 'PDF',
  audio: '音频',
  video: '视频',
  archive: '压缩包',
  other: '其他'
}
