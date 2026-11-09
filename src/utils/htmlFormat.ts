/**
 * HTML 源码美化：只在块级标签边界插入换行与缩进。
 *
 * 关键约束：行内元素（span/a/strong…）整块保留 outerHTML、不拆行。
 * HTML 渲染会把标签之间的换行折叠成一个空格，拆开行内节点会直接改变排版。
 * script / style / pre / textarea 内容原样保留（内部空白有语义）。
 *
 * 用浏览器原生 DOMParser 解析，零依赖；代价是 DOM 会规范化属性引号、大小写与实体，
 * 因此格式化属于「改写源码」，只有用户点保存时才落盘。
 */

const BLOCK_TAGS = new Set([
  'html', 'head', 'body', 'title', 'base', 'meta', 'link',
  'div', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'main',
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  'form', 'fieldset', 'legend', 'figure', 'figcaption',
  'details', 'summary', 'blockquote', 'address', 'center',
  'noscript', 'template', 'iframe', 'video', 'audio', 'source', 'track'
])

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
])

const RAW_TAGS = new Set(['script', 'style', 'pre', 'textarea'])

/** 压缩 HTML 判定：整份源码几乎只有一行且有一定长度 */
export function isMinifiedHtml(src: string): boolean {
  return src.length > 200 && src.split('\n').length <= 2
}

export function formatHtml(src: string): string {
  if (!src.trim()) return src
  const doc = new DOMParser().parseFromString(src, 'text/html')
  const out: string[] = []
  if (doc.doctype) out.push(`<!DOCTYPE ${doc.doctype.name}>`)

  const pad = (d: number) => '  '.repeat(d)
  const isInline = (n: Node): boolean => {
    if (n.nodeType === 3) return true
    if (n.nodeType !== 1) return false
    const tag = (n as Element).tagName.toLowerCase()
    return !BLOCK_TAGS.has(tag) && !RAW_TAGS.has(tag)
  }

  const emit = (node: Node, depth: number): void => {
    if (node.nodeType === 8) {
      out.push(pad(depth) + `<!--${(node as Comment).data}-->`)
      return
    }
    if (node.nodeType === 3) {
      const text = (node.textContent || '').trim()
      if (text) out.push(pad(depth) + text)
      return
    }
    if (node.nodeType !== 1) return

    const el = node as Element
    const tag = el.tagName.toLowerCase()
    const attrs = Array.from(el.attributes)
      .map((a) =>
        a.value === ''
          ? a.name
          : `${a.name}="${a.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`
      )
      .join(' ')
    const open = `<${tag}${attrs ? ' ' + attrs : ''}>`
    const kids = Array.from(el.childNodes)

    // 全行内 / 原始文本 / 空节点：整块一行，避免拆行改变渲染
    if (!kids.length || kids.every(isInline) || RAW_TAGS.has(tag)) {
      out.push(pad(depth) + (el.outerHTML || open))
      return
    }

    out.push(pad(depth) + open)
    for (const k of kids) emit(k, depth + 1)
    if (!VOID_TAGS.has(tag)) out.push(pad(depth) + `</${tag}>`)
  }

  emit(doc.documentElement, 0)
  return out.join('\n') + '\n'
}
