/**
 * 剪贴板截图落盘：粘贴图片时存为文档同目录文件，正文里插入相对路径引用。
 * 对标 Typora / Obsidian 的「粘贴图片自动归档」行为。
 */
import { writeBinaryBase64 } from '../api'

/** 从 paste 事件取图片 Blob（无图返回 null） */
export function clipboardImageBlob(ev: ClipboardEvent): Blob | null {
  const items = ev.clipboardData?.items
  if (!items) return null
  for (const it of Array.from(items)) {
    if (it.kind !== 'file' || !it.type.startsWith('image/')) continue
    const f = it.getAsFile()
    if (f) return f
  }
  return null
}

/** MIME → 扩展名（macOS 截图恒为 png，其余按需映射，未知回退 png） */
function extFor(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    default:
      return 'png'
  }
}

/** image-20260928153045123：秒级 + 毫秒，避免同一秒内两次粘贴互相覆盖 */
function stamp(): string {
  const d = new Date()
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`
  )
}

function readAsDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(new Error('剪贴板图片读取失败'))
    r.readAsDataURL(blob)
  })
}

/** 把图片写进 dir，返回文件名 */
export async function saveClipboardImage(dir: string, blob: Blob): Promise<string> {
  const name = `image-${stamp()}.${extFor(blob.type)}`
  const base64 = (await readAsDataURL(blob)).split(',')[1]
  if (!base64) throw new Error('剪贴板图片为空')
  await writeBinaryBase64(`${dir}/${name}`, base64)
  return name
}