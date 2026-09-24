import { marked, Renderer, type Tokens } from 'marked'
import { convertFileSrc } from '@tauri-apps/api/core'

export interface MarkdownHeading {
  level: number
  text: string
  id: string
}

export interface MarkdownParseResult {
  html: string
  headings: MarkdownHeading[]
}

/** DOMPurify 白名单：默认不含 asset:/blob:，本地预览需要放行（仍拦截 javascript:） */
export const MDVIEW_ALLOWED_URI =
  /^(?:(?:https?|asset|blob|data|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i

/**
 * 把渲染结果里的相对路径 src/href 解析为本地 asset 协议地址。
 * 场景：html/md 文档里 <img src="images/x.png">、内嵌 iframe 等相对引用，
 * webview 里没有文件系统根，不解析就是空白框。
 */
export function resolveLocalAssets(html: string, baseDir?: string | null): string {
  if (!baseDir) return html
  return html.replace(/\b(src|href)="([^"]+)"/gi, (m, attr: string, url: string) => {
    // 已是绝对地址 / 锚点 / 协议引用，不动
    if (/^(https?:|data:|blob:|asset:|#|\/\/|[a-zA-Z]:[\\/])/i.test(url)) return m
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return m
    const stack = baseDir.split(/[/\\]/).filter(Boolean)
    for (const part of url.split(/[/\\]/)) {
      if (part === '' || part === '.') continue
      if (part === '..') stack.pop()
      else stack.push(decodeURIComponent(part))
    }
    if (!stack.length) return m
    return `${attr}="${convertFileSrc('/' + stack.join('/'))}"`
  })
}

function slugifyHeading(text: string): string {
  return (
    text
      .replace(/[^\u4e00-\u9fa5\u3040-\u30ffa-z0-9_-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'section'
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderMarkdown(md?: string | null): string {
  return marked.parse(md || '', { gfm: true, breaks: true }) as string
}

export function parseMarkdown(md?: string | null): MarkdownParseResult {
  const headings: MarkdownHeading[] = []
  const slugCounts = new Map<string, number>()

  const renderer = new Renderer()
  // html/svg 代码块直接渲染为内嵌图形（文档内嵌 diagram 场景）
  ;(renderer as any).code = function (this: any, token: any) {
    const text: string = token.text ?? ''
    const lang = ((token.lang || '') as string).split(/\s+/)[0].toLowerCase()
    if (lang === 'mermaid') {
      // mermaid 图：交给 MdPreview 中 mermaid.run 渲染
      return `<div class="mermaid">${escapeHtml(text)}</div>`
    }
    const htmlLangs = ['html', 'svg', 'xml']
    const looksHtml =
      htmlLangs.includes(lang) || /^\s*<(svg|div|section|table|img|iframe|span)\b/i.test(text)
    if (looksHtml) return text
    const langClass = lang ? ` class="language-${lang}"` : ''
    return `<pre><code${langClass}>${escapeHtml(text)}</code></pre>`
  }
  ;(renderer as any).heading = function (this: any, token: Tokens.Heading) {
    const level = (token as any).depth ?? (token as any).level ?? 1
    const rawText: string = ((token as any).text ?? '').replace(/\s+/g, ' ').trim()
    let slug = slugifyHeading(rawText)
    const base = slug
    const seen = slugCounts.get(base) ?? 0
    if (seen > 0) slug = `${base}-${seen}`
    slugCounts.set(base, seen + 1)
    headings.push({ level, text: rawText, id: slug })

    const parser = (this && this.parser) || new marked.Parser({ renderer })
    const inner =
      Array.isArray((token as any).tokens) && (token as any).tokens.length
        ? parser.parseInline((token as any).tokens)
        : escapeHtml(rawText)
    return `<h${level} id="${slug}">${inner}</h${level}>`
  }

  const html = marked.parse(md || '', {
    gfm: true,
    breaks: true,
    renderer
  } as any) as unknown as string

  return { html, headings }
}
