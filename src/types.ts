export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  ext: string
  size: number
  modified: string
  kind: string
}

/** 一个模型配置：独立的 Base URL / Key / 模型名（兼容 OpenAI 的远程接口） */
export interface ModelProfile {
  id: string
  /** 展示名，如「对话主力」「VL 视觉」 */
  name: string
  base_url: string
  api_key: string
  model: string
}

export interface AiConfig {
  enabled: boolean
  /** 模型配置列表，可添加多个并在下方按能力切换 */
  profiles: ModelProfile[]
  /** 对话 / 摘要 / 打标使用的 profile id */
  chat_profile: string
  /** Embedding（向量化 / LanceDB 检索）使用的 profile id */
  embedding_profile: string
  /** 视觉(VL)（图片 / 图文文档摘要）使用的 profile id */
  vlm_profile: string
}

export interface AppConfig {
  scan_roots: string[]
  ai: AiConfig
}

export interface ChatMessage {
  role: string
  content: string
}

/** 单文件 AI 摘要缓存记录（后端持久化在 config_dir/MdView/summaries.json） */
export interface SummaryRecord {
  summary: string
  model: string
  /** 生成时间（unix 秒） */
  ts: number
  /** 生成时的 size:mtime 指纹，文件改动后失效 */
  fingerprint: string
}

/** 图片索引记录（dHash 感知哈希，后端持久化在 config_dir/MdView/image-index.json） */
export interface ImageRecord {
  path: string
  name: string
  size: number
  modified: string
  width: number
  height: number
  /** dHash 指纹（十进制字符串化的 u64，仅用于传输） */
  hash: number
  fingerprint: string
  ts: number
}

/** 一组相似图片 */
export interface SimilarGroup {
  items: ImageRecord[]
  /** 组内最大汉明距离（0 = 完全一致） */
  max_distance: number
}

/** 图片索引扫描进度事件负载 */
export interface ImageIndexProgress {
  id: string
  done: number
  total: number
  path: string
}

/** 批量摘要任务的单文件结果 */
export interface SummaryResult {
  path: string
  summary: string
  error: string | null
  cached: boolean
}

export type ViewTab = 'preview' | 'edit' | 'mindmap'

export interface NewFileType {
  key: string
  label: string
  ext: string
  icon: string
  /** 新建时的初始内容 */
  template: string
}

/**
 * 新建文件可选类型：仅收录「建完即可正常预览 + 编辑」的扩展名。
 * ponytail: csv/tsv 走只读表格预览（isViewerKind）、js 走 Markdown 渲染（不在 CODE_EXTS），
 * 二者新建后编辑链路不通，故未收录；要加需先补齐各自编辑器路由。
 */
export const NEW_FILE_TYPES: NewFileType[] = [
  { key: 'markdown', label: 'Markdown', ext: 'md', icon: '📝', template: '# 新文档\n\n' },
  { key: 'text', label: '纯文本', ext: 'txt', icon: '📄', template: '' },
  { key: 'json', label: 'JSON', ext: 'json', icon: '🧩', template: '{\n  \n}\n' },
  { key: 'yaml', label: 'YAML', ext: 'yaml', icon: '🧾', template: '' },
  { key: 'toml', label: 'TOML', ext: 'toml', icon: '⚙️', template: '' },
  { key: 'ini', label: 'INI 配置', ext: 'ini', icon: '🔧', template: '' },
  { key: 'html', label: 'HTML', ext: 'html', icon: '🌐', template: '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8" />\n  <title>新页面</title>\n</head>\n<body>\n  \n</body>\n</html>\n' },
  { key: 'shell', label: 'Shell 脚本', ext: 'sh', icon: '🐚', template: '#!/usr/bin/env bash\nset -euo pipefail\n\n' }
]

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
