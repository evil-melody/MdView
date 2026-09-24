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
