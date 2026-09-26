import { convertFileSrc } from '@tauri-apps/api/core'
import type { FileEntry } from '../types'
import type { TabViewer } from '../store'

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'heic']

const MEDIA_EXTS: Record<string, TabViewer['type']> = {
  pdf: 'pdf',
  mp3: 'audio', wav: 'audio', m4a: 'audio', flac: 'audio', ogg: 'audio', aac: 'audio',
  mp4: 'video', mov: 'video', webm: 'video', m4v: 'video'
}

const DOC_EXTS = ['docx']
const SHEET_EXTS = ['xlsx', 'xls', 'xlsm', 'csv', 'tsv']
const PPT_EXTS = ['pptx', 'ppt']

/** office Markdown 枢纽编辑：docx / xlsx / pptx 读为 md，编辑后写回原格式；xls 只读 */
export function viewerTypeFor(entry: FileEntry | null | undefined): TabViewer['type'] | null {
  if (!entry || entry.is_dir) return null
  const ext = (entry.ext || entry.name.split('.').pop() || '').toLowerCase()
  if (IMAGE_EXTS.includes(ext)) return 'image'
  if (MEDIA_EXTS[ext]) return MEDIA_EXTS[ext]
  if (DOC_EXTS.includes(ext)) return 'docx'
  if (SHEET_EXTS.includes(ext)) return 'sheet'
  if (PPT_EXTS.includes(ext)) return 'pptx'
  return null
}

/** office Markdown 枢纽编辑：docx / xlsx / pptx 读为 md，编辑后写回原格式；xls 只读 */
export function officeEditable(entry: FileEntry | null | undefined): boolean {
  if (!entry || entry.is_dir) return false
  const ext = (entry.ext || '').toLowerCase()
  return ext === 'docx' || ext === 'xlsx' || ext === 'pptx'
}

/**
 * 按类型构建 viewer 数据。
 * office 类（docx/sheet/pptx）照搬 InspireLoom：只给 asset 协议地址，
 * 由前端 vue-files-preview 自行拉取渲染——零 IPC 字节搬运、零 base64，任意大文件不卡主线程。
 */
export async function buildViewer(entry: FileEntry): Promise<TabViewer> {
  const type = viewerTypeFor(entry)
  if (!type) return { type: 'docx', error: '不支持的类型' }
  return { type, src: convertFileSrc(entry.path) }
}
