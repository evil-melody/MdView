import { convertFileSrc } from '@tauri-apps/api/core'
import DOMPurify from 'dompurify'
import type { FileEntry } from '../types'
import type { TabViewer } from '../store'
import { readBinaryBase64 } from '../api'

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'heic']

const MEDIA_EXTS: Record<string, TabViewer['type']> = {
  pdf: 'pdf',
  mp3: 'audio', wav: 'audio', m4a: 'audio', flac: 'audio', ogg: 'audio', aac: 'audio',
  mp4: 'video', mov: 'video', webm: 'video', m4v: 'video'
}

const DOC_EXTS = ['docx']
const SHEET_EXTS = ['xlsx', 'xls', 'xlsm', 'csv', 'tsv']
const PPT_EXTS = ['pptx', 'ppt']

/** office 类二进制预览上限（字节）——base64 过 IPC，太大得不偿失 */
const MAX_BINARY_BYTES = 30 * 1024 * 1024

/** 该文件是否走 viewer 预览（非文本），返回 viewer 类型 */
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

/** office 原生编辑：docx 走 canvas-editor、xlsx 走 Univer，编辑器导出原格式写回；xls 只读 */
export function officeEditable(entry: FileEntry | null | undefined): boolean {
  if (!entry || entry.is_dir) return false
  const ext = (entry.ext || '').toLowerCase()
  return ext === 'docx' || ext === 'xlsx'
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const buf = new ArrayBuffer(bin.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i)
  return buf
}

/** xlsx 的 sheet_to_html 输出完整文档，只截 <table> 部分 */
function extractTable(html: string): string {
  const m = html.match(/<table[\s\S]*<\/table>/i)
  return m ? m[0] : html
}

/** pptx：unzip 后按 slideN.xml 顺序，逐段落拼接 <a:t> 文本 */
async function pptxSlides(buf: ArrayBuffer): Promise<string[]> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const zip = unzipSync(new Uint8Array(buf))
  const names = Object.keys(zip)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/)![1])
      const nb = Number(b.match(/slide(\d+)\.xml/)![1])
      return na - nb
    })
  if (!names.length) return []
  return names.map((n) => {
    const xml = strFromU8(zip[n])
    const paras = xml.match(/<a:p[\s>][\s\S]*?<\/a:p>/g) || []
    return paras
      .map((p) =>
        (p.match(/<a:t>([\s\S]*?)<\/a:t>/g) || [])
          .map((t) => t.replace(/<[^>]+>/g, '').trim())
          .join('')
      )
      .filter((t) => t.length > 0)
      .join('\n')
  })
}

/** 按类型构建 viewer 数据；媒体类直接给 asset 地址，office 类读二进制解析 */
export async function buildViewer(entry: FileEntry): Promise<TabViewer> {
  const type = viewerTypeFor(entry)
  if (!type) return { type: 'docx', error: '不支持的类型' }
  const ext = (entry.ext || entry.name.split('.').pop() || '').toLowerCase()

  // 媒体类：asset 协议直接渲染，不读内容
  if (type === 'image' || type === 'pdf' || type === 'audio' || type === 'video') {
    return { type, src: convertFileSrc(entry.path) }
  }

  if (entry.size > MAX_BINARY_BYTES) {
    return { type, error: `文件过大（${(entry.size / 1024 / 1024).toFixed(1)} MB），暂不支持预览` }
  }

  try {
    const buf = base64ToArrayBuffer(await readBinaryBase64(entry.path))
    if (type === 'docx') {
      const mammoth = (await import('mammoth')).default
      const { value } = await mammoth.convertToHtml({ arrayBuffer: buf })
      return { type, html: DOMPurify.sanitize(value) }
    }
    if (type === 'sheet') {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buf, { type: 'array' })
      const sheets = wb.SheetNames.map((name) => ({
        name,
        html: DOMPurify.sanitize(extractTable(XLSX.utils.sheet_to_html(wb.Sheets[name])))
      }))
      return { type, sheets }
    }
    if (type === 'pptx') {
      const slides = await pptxSlides(buf)
      if (!slides.length) return { type, error: '未解析到幻灯片内容（可能是 .ppt 旧格式）' }
      return { type, slides }
    }
    return { type, error: '不支持的类型' }
  } catch (e) {
    return { type, error: '解析失败: ' + String(e) }
  }
}
