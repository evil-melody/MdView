/**
 * 渲染后的 MD DOM → Markdown 源（所见即所得编辑回写用）。
 * 覆盖本应用渲染器产出结构：标题 / 段落 / 粗斜体 / 行内代码 / 删除线 / 链接 / 图片 /
 * 有序无序列表（嵌套）/ 引用 / 分割线 / 围栏代码 / GFM 表格 / mermaid（源码存于 data 属性）。
 * 未识别结构退化为纯文本，保证不丢文字内容。
 */

/** asset://localhost/<绝对路径> → 相对 basePath 的引用（保存后保持文档相对资源） */
function assetToRelative(src: string, basePath?: string | null): string {
  if (!basePath) return src
  const m = /^(?:asset:\/\/localhost)?(\/.*)$/.exec(src)
  if (!m) return src
  const absParts = m[1].split(/[/\\]/).filter(Boolean)
  const baseParts = basePath.split(/[/\\]/).filter(Boolean)
  let i = 0
  while (i < baseParts.length && i < absParts.length && baseParts[i] === absParts[i]) i++
  const up = baseParts.length - i
  const rel = [...Array(up).fill('..'), ...absParts.slice(i)]
  return rel.join('/')
}

function isBlock(el: Element): boolean {
  return /^(P|H1|H2|H3|H4|H5|H6|UL|OL|BLOCKQUOTE|PRE|TABLE|DIV)$/.test(el.tagName)
}

function inline(node: Element, basePath?: string | null): string {
  return inlineNodes(Array.from(node.childNodes), basePath)
}

function inlineNodes(nodes: Node[], basePath?: string | null): string {
  let s = ''
  for (const n of nodes) {
    if (n.nodeType === 3) {
      s += n.textContent ?? ''
      continue
    }
    if (!(n instanceof Element)) continue
    const tag = n.tagName
    const inner = inline(n, basePath)
    switch (tag) {
      case 'STRONG':
      case 'B':
        s += '**' + inner + '**'
        break
      case 'EM':
      case 'I':
        s += '*' + inner + '*'
        break
      case 'CODE':
        s += '`' + inner + '`'
        break
      case 'DEL':
      case 'S':
      case 'STRIKE':
        s += '~~' + inner + '~~'
        break
      case 'A': {
        const href = n.getAttribute('href') || ''
        s += '[' + inner + '](' + assetToRelative(href, basePath) + ')'
        break
      }
      case 'IMG': {
        const alt = n.getAttribute('alt') || ''
        const isrc = n.getAttribute('src') || ''
        s += '![' + alt + '](' + assetToRelative(isrc, basePath) + ')'
        break
      }
      case 'BR':
        s += '  \n'
        break
      case 'SPAN':
      case 'DIV':
        s += inner
        break
      default:
        s += inner
    }
  }
  return s
}

function serializeChildren(el: Element, basePath?: string | null): string {
  const blocks: string[] = []
  for (const child of Array.from(el.childNodes)) {
    const b = serializeNode(child, basePath)
    if (b != null) blocks.push(b)
  }
  return blocks.join('\n\n')
}

function serializeList(el: Element, basePath?: string | null): string {
  const ordered = el.tagName === 'OL'
  const items: string[] = []
  for (const li of Array.from(el.children).filter((c) => c.tagName === 'LI')) {
    const nested = Array.from(li.children).filter(
      (c) => c.tagName === 'UL' || c.tagName === 'OL'
    )
    const textNodes = Array.from(li.childNodes).filter(
      (n) => !(n instanceof Element && (n.tagName === 'UL' || n.tagName === 'OL'))
    )
    let s = (ordered ? '1. ' : '- ') + inlineNodes(textNodes, basePath).trim()
    for (const n of nested) {
      const sub = serializeList(n, basePath)
        .split('\n')
        .map((l) => '  ' + l)
        .join('\n')
      s += '\n' + sub
    }
    items.push(s)
  }
  return items.join('\n')
}

function serializeTable(el: Element, basePath?: string | null): string {
  const headerRow = el.querySelector('thead tr')
  const bodyRows = el.querySelectorAll('tbody tr')
  if (!headerRow) {
    // 无表头兜底：当普通块序列化（极少出现）
    return serializeChildren(el, basePath)
  }
  const cells = (tr: Element | null): string[] =>
    tr
      ? Array.from(tr.children)
          .filter((c) => c.tagName === 'TH' || c.tagName === 'TD')
          .map((c) => inline(c, basePath).trim())
      : []
  const h = cells(headerRow)
  const head = '| ' + h.join(' | ') + ' |'
  const sep = '| ' + h.map(() => '---').join(' | ') + ' |'
  const rows = Array.from(bodyRows).map((tr) => '| ' + cells(tr).join(' | ') + ' |')
  return [head, sep, ...rows].join('\n')
}

function serializeEl(el: Element, basePath?: string | null): string | null {
  const tag = el.tagName
  switch (tag) {
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6':
      return '#'.repeat(+tag[1]) + ' ' + inline(el, basePath)
    case 'P':
      return inline(el, basePath)
    case 'HR':
      return '---'
    case 'BLOCKQUOTE':
      return serializeChildren(el, basePath)
        .split('\n')
        .map((l) => '> ' + l)
        .join('\n')
    case 'PRE': {
      const code = el.querySelector('code')
      let lang = ''
      if (code) {
        const m = /language-([\w-]+)/.exec(code.className || '')
        if (m) lang = m[1]
      }
      const text = (code?.textContent ?? el.textContent ?? '').replace(/\n$/, '')
      return '```' + lang + '\n' + text + '\n```'
    }
    case 'UL':
    case 'OL':
      return serializeList(el, basePath)
    case 'TABLE':
      return serializeTable(el, basePath)
    case 'DIV':
      if (el.classList.contains('mermaid')) {
        const src = el.getAttribute('data-mermaid-src')
        if (src != null) return '```mermaid\n' + src.replace(/\n$/, '') + '\n```'
        return inline(el, basePath)
      }
      if (Array.from(el.childNodes).some((n) => n instanceof Element && isBlock(n)))
        return serializeChildren(el, basePath)
      return inline(el, basePath)
    default:
      if (Array.from(el.childNodes).some((n) => n instanceof Element && isBlock(n)))
        return serializeChildren(el, basePath)
      return inline(el, basePath)
  }
}

function serializeNode(node: Node, basePath?: string | null): string | null {
  if (node.nodeType === 3) {
    const t = (node.textContent ?? '').trim()
    return t || null
  }
  if (node instanceof Element) return serializeEl(node, basePath)
  return null
}

/** 把渲染容器（如 .md-body）的当前 DOM 序列化回 Markdown 源文本 */
export function htmlToMarkdown(root: HTMLElement, basePath?: string | null): string {
  const blocks: string[] = []
  for (const child of Array.from(root.childNodes)) {
    const b = serializeNode(child, basePath)
    if (b != null) blocks.push(b)
  }
  let md = blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
  if (md) md += '\n'
  return md
}
