import { convertFileSrc } from '@tauri-apps/api/core'
import type { FileEntry } from '../types'
import type { TabViewer } from '../store'

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'heic']

const MEDIA_EXTS: Record<string, TabViewer['type']> = {
  pdf: 'pdf',
  mp3: 'audio', wav: 'audio', m4a: 'audio', flac: 'audio', ogg: 'audio', aac: 'audio',
  mp4: 'video', mov: 'video', webm: 'video', m4v: 'video'
}

const DOC_EXTS = ['doc', 'docx', 'dot', 'dotx']
const SHEET_EXTS = ['xlsx', 'xls', 'xlsm', 'xlt', 'xltx', 'csv', 'tsv']
const PPT_EXTS = ['pptx', 'ppt', 'pot', 'potx', 'pps', 'ppsx']

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

/** office Markdown 枢纽编辑：docx（含 .doc，内核转为 docx 打开）/ xlsx（含 .xls，内核 biffToXlsx 转换）/ pptx（含 .ppt）读为 md，编辑后写回 OOXML；csv / tsv 经表格引擎可编辑，保存写回原分隔符文本。
 *  legacy 系（doc/dot/xls/xlt/ppt/pot/pps）内核打开时已转 OOXML 且标记 editable（protocol.ts `converted`），保存写回的是新格式字节（与原 .doc 先例一致）。 */
export function officeEditable(entry: FileEntry | null | undefined): boolean {
  if (!entry || entry.is_dir) return false
  const ext = (entry.ext || '').toLowerCase()
  return ['doc', 'docx', 'dot', 'dotx', 'xlsx', 'xls', 'xlt', 'pptx', 'ppt', 'pot', 'pps', 'csv', 'tsv'].includes(ext)
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
