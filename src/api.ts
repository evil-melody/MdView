import { invoke } from '@tauri-apps/api/core'
import type {
  AppConfig,
  ChatMessage,
  FileEntry,
  ImageRecord,
  SimilarGroup,
  SummaryRecord,
  SummaryResult
} from './types'

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

/** PPTX -> Univer 幻灯片数据（slides 画布编辑器加载用，含 element→shape 写回清单） */
export const readPptxUniver = (path: string) =>
  invoke<string>('read_pptx_univer', { path })

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

/** DOCX -> Univer DocumentData JSON（@univerjs/docs 富文本编辑器加载用） */
export const readDocxUniver = (path: string) =>
  invoke<string>('read_docx_univer', { path })

/**
 * 读取文件原始字节数组（Tauri v2 原始字节通道：invoke 直接返回 ArrayBuffer，
 * 不序列化成 JSON 数组，避免数百 MB 文件把 WebView 卡死）。
 */
export const readFileBytes = (path: string): Promise<ArrayBuffer> =>
  invoke<ArrayBuffer>('read_file_as_bytes', { path })

/** 写入文件原始字节（与 readFileBytes 对称，走原始字节通道）。 */
export const writeFileBytes = (path: string, contents: Uint8Array): Promise<boolean> =>
  invoke<boolean>('write_file_bytes', { path, contents })

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

/**
 * 批量 AI 摘要：命中缓存直接复用，其余并发请求模型。
 * 实时进度走 Tauri 事件 `ai-sum-progress {id, done, total, path, error}`；
 * invoke 返回完整结果（兜底）。
 */
export const summarizeFiles = (reqId: string, paths: string[]) =>
  invoke<SummaryResult[]>('summarize_files', { reqId, paths })

/** 读取全部摘要缓存（启动时载入：列表展示 / 搜索命中 / 树过滤） */
export const loadSummaries = () =>
  invoke<Record<string, SummaryRecord>>('load_summaries')

/** 清除指定文件的摘要缓存（重新生成用） */
export const clearSummaries = (paths: string[]) =>
  invoke<boolean>('clear_summaries', { paths })

/**
 * 扫描目录建立图片哈希索引（dHash）：指纹未变的文件复用缓存。
 * 进度走 Tauri 事件 `img-index-progress {id, done, total, path}`；返回索引总数。
 */
export const indexImages = (reqId: string, root: string) =>
  invoke<number>('index_images', { reqId, root })

/** 相似图片分组：汉明距离 ≤ threshold 的图片并入同一组 */
export const findSimilar = (threshold: number) =>
  invoke<SimilarGroup[]>('find_similar', { threshold })

/** 读取图片索引（判断是否需要先扫描） */
export const loadImageIndex = () =>
  invoke<Record<string, ImageRecord>>('load_image_index')

/** 清空图片索引（换资料库后重建） */
export const clearImageIndex = () => invoke<boolean>('clear_image_index')

/** 移除指定图片的索引记录（文件删除后同步，避免仍出现在相似分组里） */
export const removeImageRecords = (paths: string[]) =>
  invoke<boolean>('remove_image_records', { paths })
