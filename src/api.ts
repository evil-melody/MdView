import { invoke } from '@tauri-apps/api/core'
import type { AppConfig, ChatMessage, FileEntry } from './types'

export const scanDirectory = (path: string) =>
  invoke<FileEntry[]>('scan_directory', { path })

export const indexRoot = (root: string) =>
  invoke<FileEntry[]>('index_root', { root })

export const readText = (path: string) =>
  invoke<string>('read_text', { path })

export const readBinaryBase64 = (path: string) =>
  invoke<string>('read_binary_base64', { path })

export const readOfficeMd = (path: string) =>
  invoke<string>('read_office_md', { path })

export const writeOfficeMd = (path: string, md: string) =>
  invoke<boolean>('write_office_md', { path, md })

/** PPTX 懒加载：全部幻灯片标题（缩略图 / 分页用，不含图片字节） */
export const readPptxOutline = (path: string) =>
  invoke<string[]>('read_pptx_outline', { path })

/** PPTX 懒加载：单张幻灯片（样式 HTML + 图片 data URI） */
export const readPptxSlide = (
  path: string,
  index: number
) =>
  invoke<{ index: number; title: string; text: string; html: string }>(
    'read_pptx_slide',
    { path, index }
  )

/** PPTX 图片替换：按 slide_index + rId 把原始图片字节写回 pptx 文件 */
export const replacePptxImage = (
  path: string,
  slideIndex: number,
  rid: string,
  imageBytes: number[]
) =>
  invoke<boolean>('replace_pptx_image', { path, slideIndex, rid, imageBytes })

/** PPTX 文字更新：直接修改指定幻灯片指定 shape 的文本 */
export const updatePptxText = (
  path: string,
  slideIndex: number,
  shapeIndex: number,
  text: string
) =>
  invoke<boolean>('update_pptx_text', { path, slideIndex, shapeIndex, text })

/** DOCX 后端渲染 HTML（标题/样式/表格/图片 data URI），替代前端 mammoth */
export const readDocxHtml = (path: string) =>
  invoke<string>('read_docx_html', { path })

/** 读取文件原始字节数组（自 InspireLoom 移植：替代 base64 IPC） */
export const readFileBytes = (path: string) =>
  invoke<number[]>('read_file_as_bytes', { path })

/** office 原生编辑保存：前端组件导出的二进制（docx/xlsx）base64 落盘 */
export const writeBinaryBase64 = (path: string, contents: string) =>
  invoke<boolean>('write_binary_base64', { path, contents })

export const writeText = (path: string, content: string) =>
  invoke<boolean>('write_text', { path, content })

export const deletePath = (path: string) =>
  invoke<boolean>('delete_path', { path })

export const renamePath = (path: string, newName: string) =>
  invoke<string>('rename_path', { path, newName })

export const searchFiles = (root: string, query: string, recursive: boolean) =>
  invoke<FileEntry[]>('search_files', { root, query, recursive })

export const loadConfig = () => invoke<AppConfig>('load_config_cmd')

export const saveConfig = (config: AppConfig) =>
  invoke<boolean>('save_config_cmd', { config })

export const aiChat = (messages: ChatMessage[], baseUrl: string, apiKey: string, model: string) =>
  invoke<string>('ai_chat', { messages, baseUrl, apiKey, model })

/**
 * AI 流式对话：invoke 返回完整 content（兜底），实时增量通过 Tauri 事件
 * `ai-chunk {id, delta}` / `ai-done {id}` / `ai-error {id, message}` 推送。
 * 前端用 reqId 过滤属于自己的事件，屏蔽过期响应。
 */
export const aiChatStream = (
  reqId: string,
  messages: ChatMessage[],
  baseUrl: string,
  apiKey: string,
  model: string
) => invoke<string>('ai_chat_stream', { reqId, messages, baseUrl, apiKey, model })
