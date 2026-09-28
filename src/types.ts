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
