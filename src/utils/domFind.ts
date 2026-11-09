/**
 * 预览态（渲染后的 MD / 纯文本 <pre>）内查找：在根容器内高亮全部命中并支持上下跳转。
 * 与编辑态 textarea 选区查找互不干扰——本模块只操作 DOM 文本节点，不改写源内容。
 */
export interface DomFindHandle {
  readonly count: number
  readonly current: number
  find(query: string, caseSensitive: boolean): number
  next(): void
  prev(): void
  clear(): void
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** iframe 查找高亮样式表 id（幂等注入判据） */
export const IFRAME_FIND_STYLE_ID = 'mdview-find-style'

/** srcdoc iframe 内查找高亮样式：父窗口 CSS 不跨文档生效，须注入 iframe 自身文档。
 *  accent 由调用方从父文档读取后传入，保持主题一致。 */
export function iframeFindCss(accent: string): string {
  return (
    'mark.md-find{background:rgba(255,214,0,.42);color:inherit;border-radius:2px;padding:0 1px}' +
    `mark.md-find-current{background:${accent};color:#fff}`
  )
}

/** srcdoc iframe 内微信视频号播放块样式。
 *  ⚠️ 本串与 src/styles/video.css 手工同步（同一套规则，压缩成一行）：
 *  HTML 预览在独立文档里渲染，父窗口样式表不跨文档生效，只能复制一份注入。
 *  变量全部带兜底值——iframe 文档没有 App 的 :root 自定义属性。 */
export function iframeVideoCss(): string {
  return (
    '.mdview-video{max-width:100%;display:block;margin:1em auto;border-radius:var(--radius-sm,8px);background:#000}' +
    '.mdview-video-fallback{display:flex;flex-direction:column;align-items:center;gap:.5em;max-width:100%;margin:1em auto;padding:.75em;border:1px solid var(--border-2,#cfd3df);border-radius:var(--radius,12px);background:var(--panel-2,#24242e)}' +
    '.mdview-video-poster{max-width:100%;border-radius:var(--radius-sm,8px)}' +
    '.mdview-video-link{color:var(--accent,#6a48f0);font-weight:600;text-decoration:none}' +
    '.mdview-video-link:hover{color:var(--accent-2,#7c5cff);text-decoration:underline}' +
    '.mdview-video-hint{color:var(--text-3,#9a9dab);font-size:.85em}'
  )
}

export function createDomFind(getRoot: () => HTMLElement | null): DomFindHandle {
  let marks: HTMLElement[] = []
  let index = -1

  function clear(): void {
    const root = getRoot()
    const doc = root?.ownerDocument ?? document
    for (const m of marks) {
      const parent = m.parentNode
      if (!parent) continue
      parent.replaceChild(doc.createTextNode(m.textContent ?? ''), m)
    }
    // 合并被拆分出的相邻文本节点，避免 DOM 碎片化影响后续渲染
    root?.normalize()
    marks = []
    index = -1
  }

  function markCurrent(): void {
    marks.forEach((mk, i) => mk.classList.toggle('md-find-current', i === index))
  }

  function scrollToCurrent(): void {
    marks[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function find(query: string, caseSensitive: boolean): number {
    clear()
    const root = getRoot()
    if (!root || !query) return 0
    const doc = root.ownerDocument ?? document
    const re = new RegExp(escapeRegExp(query), caseSensitive ? 'g' : 'gi')
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const textNodes: Text[] = []
    let node: Node | null
    while ((node = walker.nextNode())) {
      const tn = node as Text
      const p = tn.parentElement
      // 跳过 script / style 内的文本，避免误高亮
      if (p && (p.tagName === 'SCRIPT' || p.tagName === 'STYLE')) continue
      if ((tn.nodeValue ?? '').length) textNodes.push(tn)
    }
    for (const tn of textNodes) {
      const text = tn.nodeValue ?? ''
      re.lastIndex = 0
      let m: RegExpExecArray | null
      const frag = doc.createDocumentFragment()
      let last = 0
      let hit = false
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) {
          re.lastIndex++
          continue
        }
        if (m.index > last) frag.appendChild(doc.createTextNode(text.slice(last, m.index)))
        const mk = doc.createElement('mark')
        mk.className = 'md-find'
        mk.textContent = m[0]
        frag.appendChild(mk)
        marks.push(mk)
        last = m.index + m[0].length
        hit = true
      }
      if (hit) {
        if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)))
        tn.parentNode?.replaceChild(frag, tn)
      }
    }
    if (marks.length) {
      index = 0
      markCurrent()
      scrollToCurrent()
    }
    return marks.length
  }

  function next(): void {
    if (!marks.length) return
    index = (index + 1) % marks.length
    markCurrent()
    scrollToCurrent()
  }

  function prev(): void {
    if (!marks.length) return
    index = (index - 1 + marks.length) % marks.length
    markCurrent()
    scrollToCurrent()
  }

  return {
    get count() {
      return marks.length
    },
    get current() {
      return index
    },
    find,
    next,
    prev,
    clear
  }
}
