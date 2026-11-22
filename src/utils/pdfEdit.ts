/**
 * PDF 增量编辑内核。
 *
 * pdfjs 负责渲染、文本层与扫描件识别；pdf-lib 只在原文件上叠加改动后写回，
 * 不重新生成整份 PDF：未改动页的文字仍是矢量、可选中、可搜索。
 * 坐标统一为「PDF 点 / 页面左上原点」，pdf-lib 绘制时再翻转到左下原点。
 */
import { PDFDocument } from 'pdf-lib'
import {
  getDocument, GlobalWorkerOptions, OPS, Util,
  type PDFDocumentProxy, type PDFPageProxy, type PDFDocumentLoadingTask
} from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** 一段被替换的文字：box 为原文位置，text 为新内容 */
export interface TextBox {
  x: number
  y: number
  w: number
  h: number
  fontSize: number
  /** 文字基线（PDF 点，左上原点）：原字号 + 原基线才不会比原文矮一截 */
  baseline: number
  text: string
  /** 原文：保存时只重绘变化区间，未改字符保留原矢量字体 */
  original: string
  /** pdfjs 注册到 document.fonts 的字体族名（即 TextItem.fontName） */
  fontFamily: string
  /** PDF 内部字体名，作为 fontFamily 失效时的回退 */
  fallback: string
  /** 从页面渲染结果采样的原文字颜色 */
  color: string
}
export interface TextHit { index: number; box: TextBox }

/** 插入的图片：bytes 是规范化后的 png / jpeg 原始字节 */
export interface ImageBox {
  id: number
  x: number
  y: number
  w: number
  h: number
  bytes: Uint8Array
  mime: string
  url: string
}
export interface PageEdit {
  /** key = 文本层 item 下标，重复编辑同一段只保留最后一次 */
  texts: Map<number, TextBox>
  images: ImageBox[]
}
export type PdfEdits = Map<number, PageEdit>
export interface PdfImageAsset { blob: Blob; url: string; w: number; h: number }

export function pageEdits(edits: PdfEdits, page: number): PageEdit {
  let e = edits.get(page)
  if (!e) { e = { texts: new Map(), images: [] }; edits.set(page, e) }
  return e
}
export function hasEdits(edits: PdfEdits): boolean {
  for (const e of edits.values()) if (e.texts.size || e.images.length) return true
  return false
}

/** 非 png / jpeg 的图片统一转成 png，pdf-lib 只需处理两种编码器 */
export async function normalizeImage(blob: Blob): Promise<{ bytes: Uint8Array; mime: string; url: string; w: number; h: number }> {
  let b = blob
  if (b.type !== 'image/png' && b.type !== 'image/jpeg') {
    const bitmap = await createImageBitmap(b)
    const c = document.createElement('canvas')
    c.width = bitmap.width
    c.height = bitmap.height
    c.getContext('2d')!.drawImage(bitmap, 0, 0)
    bitmap.close()
    b = await new Promise<Blob>((resolve, reject) =>
      c.toBlob((x) => (x ? resolve(x) : reject(new Error('图片转换失败'))), 'image/png')
    )
  }
  const url = URL.createObjectURL(b)
  const bitmap = await createImageBitmap(b)
  return {
    bytes: new Uint8Array(await b.arrayBuffer()),
    mime: b.type,
    url,
    w: bitmap.width,
    h: bitmap.height
  }
}

export class PdfSource {
  private doc: PDFDocumentProxy | null = null
  private task: PDFDocumentLoadingTask | null = null
  private textCache = new Map<number, TextHit[]>()
  /** 最近一次渲染的整页像素，用于采样原文字墨色；不额外读盘 */
  private ink: ImageData | null = null
  private inkScale = 1
  bytes = new Uint8Array()
  numPages = 0
  scanned = false

  /** pdfjs 会接管传入的 ArrayBuffer，必须给副本；原字节留给 pdf-lib 写回 */
  async load(bytes: Uint8Array): Promise<void> {
    await this.destroy()
    this.bytes = bytes
    const copy = new Uint8Array(bytes.length)
    copy.set(bytes)
    const task = getDocument({ data: copy })
    this.task = task
    this.doc = await task.promise
    this.numPages = this.doc.numPages
    this.textCache.clear()
    this.scanned = await this.detectScanned()
  }

  async destroy(): Promise<void> {
    if (this.task) { await this.task.destroy(); this.task = null }
    this.doc = null
    this.textCache.clear()
    this.numPages = 0
  }

  private async page(n: number): Promise<PDFPageProxy> {
    if (!this.doc) throw new Error('PDF 未加载')
    return this.doc.getPage(n)
  }

  /** 无文本层 = 扫描件：取前 3 页判定，避免大文件逐页解析 */
  private async detectScanned(): Promise<boolean> {
    let chars = 0
    for (let n = 1; n <= Math.min(3, this.numPages); n++) {
      const tc = await (await this.page(n)).getTextContent()
      for (const it of tc.items) if ('str' in it) chars += it.str.trim().length
    }
    return chars === 0
  }

  /** 当前页文本块（PDF 点坐标，左上原点）；按页缓存，翻页不重复解析 */
  async textBoxes(n: number): Promise<TextHit[]> {
    const cached = this.textCache.get(n)
    if (cached) return cached
    const p = await this.page(n)
    const vp = p.getViewport({ scale: 1 })
    const tc = await p.getTextContent()
    const out: TextHit[] = []
    tc.items.forEach((raw, index) => {
      const it = raw as TextItem
      if (!it.str?.trim()) return
      const m = Util.transform(vp.transform, it.transform)
      const fontSize = Math.hypot(m[2], m[3])
      if (fontSize <= 0) return
      const w = Math.max(it.width, 1)
      const x = m[4] - 1
      const y = m[5] - fontSize * 0.9
      out.push({
        index,
        box: {
          x,
          y,
          w: w + 3,
          h: fontSize * 1.2,
          fontSize,
          baseline: m[5],
          text: it.str,
          original: it.str,
          fontFamily: it.fontName,
          fallback: tc.styles?.[it.fontName]?.fontFamily ?? '',
          color: inkColor(this.ink, this.inkScale, x, y, w + 3, fontSize * 1.2)
        }
      })
    })
    this.textCache.set(n, out)
    return out
  }

  /** 把指定页画到 canvas；返回 canvas 的像素尺寸 */
  async render(n: number, scale: number, canvas: HTMLCanvasElement): Promise<{ w: number; h: number }> {
    const p = await this.page(n)
    const vp = p.getViewport({ scale })
    canvas.width = Math.floor(vp.width)
    canvas.height = Math.floor(vp.height)
    const ctx = canvas.getContext('2d')!
    await p.render({ canvasContext: ctx, viewport: vp }).promise
    this.ink = ctx.getImageData(0, 0, canvas.width, canvas.height)
    this.inkScale = scale
    return { w: canvas.width, h: canvas.height }
  }

  async pageSize(n: number): Promise<{ w: number; h: number }> {
    const vp = (await this.page(n)).getViewport({ scale: 1 })
    return { w: vp.width, h: vp.height }
  }

  /**
   * 提取页面原有内嵌图片（paintImageXObject / 内联图片），供复制到剪贴板或再插入。
   * pdfjs 给的是解码后的 RGBA 或 ImageBitmap，统一转 PNG Blob。
   */
  async embeddedImages(n: number): Promise<PdfImageAsset[]> {
    // 渲染过的 page 会 cleanup 掉 objs，算子列表命中缓存时图片对象不再回送。
    // 用独立文档取算子列表，避免 Promise 永远挂着；用完即销毁。
    const data = new Uint8Array(this.bytes)
    const task = getDocument({ data })
    try {
      const p = await (await task.promise).getPage(n)
      const ops = await p.getOperatorList()
      const out: PdfImageAsset[] = []
      const seen = new Set<string>()
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i]
        if (fn !== OPS.paintImageXObject && fn !== OPS.paintInlineImageXObject && fn !== OPS.paintImageMaskXObject) continue
        const id = ops.argsArray[i]?.[0]
        if (typeof id !== 'string' || seen.has(id)) continue
        seen.add(id)
        const obj = await Promise.race([
          new Promise<any>((resolve) => p.objs.get(id, resolve)),
          new Promise((resolve) => setTimeout(() => resolve(null), 3000))
        ])
        const blob = await imageObjToPng(obj)
        if (!blob) continue
        out.push({ blob, url: URL.createObjectURL(blob), w: obj?.width ?? 0, h: obj?.height ?? 0 })
      }
      return out
    } finally {
      await task.destroy()
    }
  }
}

async function imageObjToPng(obj: any): Promise<Blob | null> {
  if (!obj) return null
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  if (!ctx) return null
  if (obj.bitmap) {
    c.width = obj.bitmap.width
    c.height = obj.bitmap.height
    ctx.drawImage(obj.bitmap, 0, 0)
  } else if (obj.data && obj.width && obj.height) {
    c.width = obj.width
    c.height = obj.height
    const data = obj.data as Uint8Array | Uint8ClampedArray
    if (data.length === obj.width * obj.height * 4) {
      ctx.putImageData(new ImageData(new Uint8ClampedArray(data), obj.width, obj.height), 0, 0)
    } else if (data.length === obj.width * obj.height * 3) {
      const rgba = new Uint8ClampedArray(obj.width * obj.height * 4)
      for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
        rgba[j] = data[i]; rgba[j + 1] = data[i + 1]; rgba[j + 2] = data[i + 2]; rgba[j + 3] = 255
      }
      ctx.putImageData(new ImageData(rgba, obj.width, obj.height), 0, 0)
    } else return null
  } else return null
  return new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'))
}

const SYSTEM_FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'

/** 区域最暗像素 = 笔画中心墨色；白底不会被误取，保留原文深灰 / 彩色 */
function inkColor(ink: ImageData | null, scale: number, x: number, y: number, w: number, h: number): string {
  if (!ink) return '#000000'
  const x0 = Math.max(0, Math.floor(x * scale))
  const y0 = Math.max(0, Math.floor(y * scale))
  const x1 = Math.min(ink.width, Math.ceil((x + w) * scale))
  const y1 = Math.min(ink.height, Math.ceil((y + h) * scale))
  let best = 255, r = 0, g = 0, b = 0
  for (let row = y0; row < y1; row++) {
    let i = (row * ink.width + x0) * 4
    for (let col = x0; col < x1; col++, i += 4) {
      const lum = ink.data[i] * 0.299 + ink.data[i + 1] * 0.587 + ink.data[i + 2] * 0.114
      if (lum < best) { best = lum; r = ink.data[i]; g = ink.data[i + 1]; b = ink.data[i + 2] }
    }
  }
  return best < 240 ? `rgb(${r},${g},${b})` : '#000000'
}

/** 公共前后缀：只重绘真正变化的字符，其余保留原 PDF 矢量文字 */
function diffSpan(a: string, b: string): [number, number] {
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  let s = 0
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++
  return [p, s]
}

/**
 * 文字改动合成透明覆盖图：用文档自带字体（pdfjs 已把嵌入字体注册到 document.fonts，
 * 家族名即 TextItem.fontName）+ 原墨色 + 原基线绘制，且只遮变化区间。
 * 字体未注册（标准 14 字体 / Type3）时退回系统字体，保证中文仍可写。
 */
async function textOverlay(texts: TextBox[], w: number, h: number): Promise<Uint8Array> {
  const S = 2
  const c = document.createElement('canvas')
  c.width = Math.ceil(w * S)
  c.height = Math.ceil(h * S)
  const ctx = c.getContext('2d')!
  ctx.scale(S, S)
  try { if (document.fonts?.ready) await document.fonts.ready } catch { /* 无 FontFaceSet */ }
  const registered = new Set<string>()
  try { for (const f of document.fonts) registered.add(f.family.replace(/^["']|["']$/g, '')) } catch { /* 无 FontFaceSet */ }
  for (const t of texts) {
    const embedded = !!t.fontFamily && registered.has(t.fontFamily)
    ctx.font = `${t.fontSize}px ${embedded
      ? `"${t.fontFamily}"${t.fallback ? `, "${t.fallback}"` : ''}, serif`
      : SYSTEM_FONT}`
    ctx.textBaseline = 'alphabetic'
    const ink = t.color || '#000000'
    const baseX = t.x + 1
    const [pre, suf] = t.original ? diffSpan(t.original, t.text) : [0, 0]
    const change = t.text.slice(pre, t.text.length - suf)
    const preW = pre ? ctx.measureText(t.original.slice(0, pre)).width : 0
    const tailW = suf ? ctx.measureText(t.original.slice(t.original.length - suf)).width : 0
    let x0 = baseX + preW
    let x1 = baseX + t.w - 2 - tailW
    let draw = change
    // 整行改写 / 新字更宽：退回整行覆盖（仍是原字体），避免压扁或盖住后缀
    if (!embedded || !change || pre + suf === 0 || x1 - x0 < ctx.measureText(change).width) {
      x0 = t.x
      x1 = t.x + t.w
      draw = t.text
    }
    if (x1 <= x0) { x0 = t.x; x1 = t.x + t.w; draw = t.text }
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x0, t.y, x1 - x0, t.h)
    ctx.fillStyle = ink
    ctx.fillText(draw, x0, t.baseline, Math.max(1, x1 - x0))
  }
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('文字覆盖层生成失败')
  return new Uint8Array(await blob.arrayBuffer())
}

/** 在原 PDF 字节上叠加全部改动，返回可覆盖写回原路径的新字节 */
export async function applyEdits(bytes: Uint8Array, edits: PdfEdits): Promise<Uint8Array> {
  if (!hasEdits(edits)) return bytes
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  for (const [pageNo, e] of edits) {
    if (pageNo < 1 || pageNo > doc.getPageCount()) continue
    const pg = doc.getPage(pageNo - 1)
    const { width, height } = pg.getSize()
    if (e.texts.size) {
      const png = await doc.embedPng(await textOverlay([...e.texts.values()], width, height))
      pg.drawImage(png, { x: 0, y: 0, width, height })
    }
    for (const im of e.images) {
      const embed = im.mime === 'image/jpeg' ? await doc.embedJpg(im.bytes) : await doc.embedPng(im.bytes)
      pg.drawImage(embed, { x: im.x, y: height - im.y - im.h, width: im.w, height: im.h })
    }
  }
  return doc.save()
}
