/**
 * Markdown -> PDF 导出（**所见即所得**路线）
 *
 * 为什么不在 Rust 侧生成 PDF：MdView 的 Markdown 常含 Mermaid 图、本地图片与表格，
 * 纯 Rust 无渲染引擎，产出必然与预览不一致。业界同类做法是复用 Web 渲染层：
 * marked 解析 -> 离屏容器排版 -> html2canvas 栅格化 -> jsPDF 按 A4 分页切片。
 *
 * 代价（已知且可接受）：文字为位图，PDF 内不可选中 / 不可搜索。
 * 若后续需要矢量可搜索 PDF，升级路径为 macOS WKWebView 的
 * `createPDFWithConfiguration`（objc2 桥）或 Rust `lopdf` 自排版。
 *
 * 关键工程细节：
 * 1. 图片必须转 dataURL —— asset:// 与 file:// 会让 canvas 被污染（tainted），
 *    toDataURL 直接抛 SecurityError。
 * 2. 独立样式而非复用 App 主题变量 —— 保证暗色主题下导出的 PDF 仍是白底黑字。
 * 3. 容器离屏但**参与布局**（不能 display:none），否则 html2canvas 量不到尺寸。
 */

import { save } from '@tauri-apps/plugin-dialog'
import { readFileBytes, writeFileBytes } from '../api'
import { parseMarkdown } from './markdown'

/** 图片扩展名 -> MIME（dataURL 前缀） */
const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  avif: 'image/avif'
}

/** 正文内容宽度（px，A4 在 96dpi 下约 794px，留出页边距） */
const CONTENT_WIDTH = 760
/** PDF 页边距（pt） */
const MARGIN_PT = 34
/** 栅格化倍率：2 倍约等于 192dpi，正文清晰且体积可控 */
const DEFAULT_SCALE = 2
/** canvas 高度上限：超长文档降倍率，避免 canvas 面积超浏览器上限而返回空白 */
const MAX_CANVAS_HEIGHT = 24000

export interface ExportPdfOptions {
  /** Markdown 源码（编辑器内当前内容，未保存的改动也生效） */
  md: string
  /** 源文件所在目录：用于解析相对路径图片 */
  baseDir: string
  /** 保存对话框默认文件名 */
  defaultName: string
}

/**
 * 导出 Markdown 为 PDF：先让用户选保存位置，再渲染落盘。
 * @returns 落盘路径；用户取消返回 null
 */
export async function exportMarkdownPdf(opts: ExportPdfOptions): Promise<string | null> {
  const target = await save({
    defaultPath: opts.defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (typeof target !== 'string' || !target) return null
  const bytes = await renderMarkdownToPdf(opts.md, opts.baseDir)
  await writeFileBytes(target, bytes)
  return target
}

/** 渲染 Markdown 为 PDF 字节（无 UI，便于单测 / 复用） */
export async function renderMarkdownToPdf(md: string, baseDir: string): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf')
  const html2canvas = (await import('html2canvas')).default

  const { html } = parseMarkdown(md)
  const container = await mountOffscreen(html, baseDir)
  try {
    const canvas = await html2canvas(container, {
      scale: pickScale(html),
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false
    })
    return sliceToPdf(canvas, jsPDF)
  } finally {
    container.remove()
  }
}

// ---------------------------------------------------------------- rendering

/** 按正文长度挑选栅格化倍率（超长文档降为 1.5，避免 canvas 超限） */
function pickScale(html: string): number {
  const approxLines = html.length / 60
  const approxHeight = approxLines * 26 + 200
  return approxHeight * DEFAULT_SCALE > MAX_CANVAS_HEIGHT ? 1.5 : DEFAULT_SCALE
}

/** 组装离屏容器：写入样式 + 正文 → 内联图片 → 渲染 Mermaid → 等字体/图片就绪 */
async function mountOffscreen(mdHtml: string, baseDir: string): Promise<HTMLElement> {
  const root = document.createElement('div')
  root.id = 'mdv-pdf-root'
  root.setAttribute('aria-hidden', 'true')
  // 离屏但**参与布局**：html2canvas 需要能量到真实尺寸，display:none / opacity:0 都会得到空白。
  // 用 absolute + 大负 left（html2pdf.js 等同类库的通行做法）而非 visibility / transform。
  root.style.cssText =
    `position:absolute;top:0;left:-20000px;width:${CONTENT_WIDTH}px;` +
    'background:#ffffff;color:#1f2328;z-index:0;pointer-events:none;'
  root.innerHTML = `<style>${PDF_CSS}</style><div class="mdv-pdf-body">${mdHtml}</div>`
  document.body.appendChild(root)

  await inlineImages(root, baseDir)
  await renderMermaid(root)
  await Promise.all([
    document.fonts?.ready ?? Promise.resolve(),
    waitImages(root)
  ])
  markBrokenImages(root)
  return root
}

/** 把容器内图片的 src 换成 dataURL（绕过 canvas 污染），相对路径按 baseDir 解析 */
async function inlineImages(root: HTMLElement, baseDir: string): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src') || ''
      if (!src || src.startsWith('data:')) return
      try {
        const dataUrl = await toDataUrl(src, baseDir)
        if (dataUrl) img.setAttribute('src', dataUrl)
      } catch {
        // 保留原 src，后续 markBrokenImages 会替换为占位文本
      }
    })
  )
}

/** src -> dataURL：本地文件走 Tauri 原始字节通道，远程地址走 fetch */
async function toDataUrl(src: string, baseDir: string): Promise<string | null> {
  if (/^https?:\/\//i.test(src) && !/^https?:\/\/asset\.localhost\//i.test(src)) {
    const res = await fetch(src)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const mime = res.headers.get('content-type')?.split(';')[0] || guessMime(src)
    return `data:${mime};base64,${bytesToBase64(new Uint8Array(buf))}`
  }
  const local = toLocalPath(src, baseDir)
  if (!local) return null
  const buf = await readFileBytes(local)
  return `data:${guessMime(local)};base64,${bytesToBase64(new Uint8Array(buf))}`
}

/** 把 asset 协议 / 相对 / 绝对 src 统一为本地绝对路径 */
function toLocalPath(src: string, baseDir: string): string | null {
  let raw = src
  if (/^asset:\/\//i.test(raw) || /^http:\/\/asset\.localhost\//i.test(raw)) {
    // asset://localhost/<encoded abs path> 或 http://asset.localhost/<encoded abs path>
    const slash = raw.indexOf('/', raw.indexOf('//') + 2)
    raw = slash >= 0 ? raw.slice(slash) : ''
  } else if (raw.startsWith('file://')) {
    raw = raw.slice('file://'.length)
  } else if (!/^[/\\]/.test(raw) && !/^[a-zA-Z]:[\\/]/.test(raw)) {
    // 相对路径：按源文件目录解析（含 ./ 与 ../）
    const parts = baseDir.split(/[/\\]/).filter(Boolean)
    for (const seg of raw.split(/[/\\]/)) {
      if (seg === '' || seg === '.') continue
      if (seg === '..') parts.pop()
      else parts.push(decodeURIComponent(seg))
    }
    raw = '/' + parts.join('/')
  }
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function guessMime(path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase()
  return IMAGE_MIME[ext] || 'application/octet-stream'
}

/** Mermaid 图在离屏容器里同样要渲染，否则 PDF 里只剩源码文本 */
async function renderMermaid(root: HTMLElement): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.mermaid:not([data-processed])'))
  if (!nodes.length) return
  try {
    const m = (await import('mermaid')).default
    m.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' })
    await m.run({ nodes })
  } catch (e) {
    console.warn('[exportPdf] mermaid 渲染失败，保留源码文本', e)
  }
}

/** 等所有图片 decode 完成（含刚替换的 dataURL），超时放弃 */
function waitImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'))
  const done = imgs.map(
    (img) =>
      new Promise<void>((resolve) => {
        if (img.complete) return resolve()
        const finish = () => resolve()
        img.addEventListener('load', finish, { once: true })
        img.addEventListener('error', finish, { once: true })
        setTimeout(finish, 4000)
      })
  )
  return Promise.all(done).then(() => undefined)
}

/** 加载失败的图片换成占位文本，避免 PDF 里出现空白破图 */
function markBrokenImages(root: HTMLElement): void {
  root.querySelectorAll('img').forEach((img) => {
    if (img.naturalWidth > 0 || !img.getAttribute('src')) return
    const alt = img.getAttribute('alt') || '图片'
    const span = document.createElement('span')
    span.className = 'mdv-pdf-imgfail'
    span.textContent = `[图片无法加载：${alt}]`
    img.replaceWith(span)
  })
}

/** canvas 按 A4 分页切片写入 PDF */
function sliceToPdf(canvas: HTMLCanvasElement, JsPDF: any): Uint8Array {
  const pdf = new JsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgW = pageW - MARGIN_PT * 2
  const contentH = pageH - MARGIN_PT * 2
  const ratio = imgW / canvas.width
  const sliceH = Math.max(1, Math.floor(contentH / ratio))

  let y = 0
  let page = 0
  while (y < canvas.height) {
    const h = Math.min(sliceH, canvas.height - y)
    const tile = document.createElement('canvas')
    tile.width = canvas.width
    tile.height = h
    const ctx = tile.getContext('2d')
    if (!ctx) throw new Error('无法创建 2D 上下文')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, tile.width, tile.height)
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
    if (page > 0) pdf.addPage()
    pdf.addImage(tile.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN_PT, MARGIN_PT, imgW, h * ratio)
    y += h
    page++
  }
  return new Uint8Array(pdf.output('arraybuffer') as ArrayBuffer)
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(bin)
}

/**
 * 导出用样式：自带白底黑字，不依赖 App 主题变量。
 * 与 MdPreview.css 观感对齐，但去掉交互态（hover）与滚动条相关规则。
 */
const PDF_CSS = `
.mdv-pdf-body{box-sizing:border-box;padding:0;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.75;color:#1f2328;word-wrap:break-word;}
.mdv-pdf-body *{box-sizing:border-box;}
.mdv-pdf-body h1,.mdv-pdf-body h2,.mdv-pdf-body h3,.mdv-pdf-body h4,.mdv-pdf-body h5,.mdv-pdf-body h6{margin:1.4em 0 .6em;line-height:1.3;font-weight:650;}
.mdv-pdf-body h1{font-size:1.7em;border-bottom:1px solid #d8dee4;padding-bottom:.3em;}
.mdv-pdf-body h2{font-size:1.4em;}
.mdv-pdf-body h3{font-size:1.18em;}
.mdv-pdf-body p{margin:.8em 0;}
.mdv-pdf-body a{color:#0a66c2;text-decoration:none;}
.mdv-pdf-body ul,.mdv-pdf-body ol{padding-left:1.6em;margin:.7em 0;}
.mdv-pdf-body li{margin:.3em 0;}
.mdv-pdf-body code{background:#f2f4f7;border-radius:4px;padding:.15em .4em;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:.88em;}
.mdv-pdf-body pre{background:#f6f8fa;border:1px solid #d8dee4;border-radius:8px;padding:14px 16px;overflow:visible;margin:1em 0;white-space:pre-wrap;word-break:break-word;}
.mdv-pdf-body pre code{background:none;padding:0;font-size:.85em;}
.mdv-pdf-body blockquote{border-left:3px solid #0a66c2;background:#f0f6ff;margin:1em 0;padding:.5em 1em;color:#4a5262;}
.mdv-pdf-body table{border-collapse:collapse;width:100%;margin:1em 0;}
.mdv-pdf-body th,.mdv-pdf-body td{border:1px solid #d8dee4;padding:7px 11px;font-size:.92em;text-align:left;}
.mdv-pdf-body th{background:#f2f4f7;}
.mdv-pdf-body img{max-width:100%;border-radius:6px;}
.mdv-pdf-body hr{border:none;border-top:1px solid #d8dee4;margin:1.6em 0;}
.mdv-pdf-body .mermaid{display:flex;justify-content:center;background:#fafbfc;border:1px solid #d8dee4;border-radius:10px;padding:16px;margin:1em 0;}
.mdv-pdf-body .mermaid svg{max-width:100%;height:auto;}
.mdv-pdf-imgfail{display:inline-block;color:#8b949e;font-size:.9em;border:1px dashed #d8dee4;border-radius:4px;padding:2px 6px;}
`
