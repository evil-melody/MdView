/** 把任意来源图片（PNG/JPEG/TIFF/HEIC…）真正重编码为 PNG。
 *  剪贴板字节的真实格式可能与 MIME 不符（macOS 截图常给 TIFF 字节 + image/png 声明），
 *  WKWebView 按 media part 的 MIME 严格解码 → 内容不匹配就显示空框。统一转 PNG 消除错配。
 *  解码失败原样返回，不破坏既有行为。 */
export async function toPng(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  try {
    const url = URL.createObjectURL(new Blob([bytes]))
    const img = new Image()
    try {
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('decode failed'))
        img.src = url
      })
    } finally {
      URL.revokeObjectURL(url)
    }
    if (!img.naturalWidth || !img.naturalHeight) return bytes
    const cv = document.createElement('canvas')
    cv.width = img.naturalWidth; cv.height = img.naturalHeight
    cv.getContext('2d')!.drawImage(img, 0, 0)
    const blob = await new Promise<Blob>((res, rej) => cv.toBlob((b) => b ? res(b) : rej(new Error('encode failed')), 'image/png'))
    return await blob.arrayBuffer()
  } catch {
    return bytes
  }
}

/** 插入前统一准备图片字节：浏览器能解 → 转 PNG；解不了（macOS 截图 TIFF 等）→ 走原生转码；
 *  两者都失败返回 null，调用方报错取消——不再静默兜底 320×240 插入空图。 */
export async function prepareImage(
  raw: ArrayBuffer,
  transcode?: (bytes: Uint8Array) => Promise<ArrayBuffer | null>
): Promise<{ bytes: ArrayBuffer; w: number; h: number } | null> {
  if (!raw.byteLength) return null
  let bytes = await toPng(raw)
  let dim = await imageSizeOf(bytes)
  if (!dim.w && transcode) {
    const png = await transcode(new Uint8Array(raw))
    if (png && png.byteLength) { bytes = png; dim = await imageSizeOf(png) }
  }
  return dim.w && dim.h ? { bytes, w: dim.w, h: dim.h } : null
}

/** 图片自然尺寸（读不出时回退 0×0） */
export function imageSizeOf(bytes: ArrayBuffer): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const url = URL.createObjectURL(new Blob([bytes]))
    const img = new Image()
    img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url) }
    img.onerror = () => { res({ w: 0, h: 0 }); URL.revokeObjectURL(url) }
    img.src = url
  })
}
