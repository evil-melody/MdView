/**
 * 大文档流式注入：把一段 HTML 切成「闭合标签对齐」的片段，逐片 insertAdjacentHTML。
 *
 * 直接一次性赋值 innerHTML 会在解析+布局阶段长时间独占主线程（几百 KB 的正文就能明显
 * 卡住输入）。切成 ≤maxBytes 的片并在片间让出一帧，正文一段段出现，滚动/点击始终有响应。
 *
 * 切点必须是完整标签边界（优先下一个块级闭合标签，退化为下一个 '>'），否则半截标签
 * 会被浏览器补全、后续片段被吞进属性里，导致结构错乱。
 */
const CLOSE_TAGS =
  /<\/(?:p|h1|h2|h3|h4|h5|h6|li|tr|th|td|pre|table|blockquote|section|article|figure|ul|ol|dl|dt|dd)>/gi

const DEFAULT_MAX_BYTES = 48_000
/** 向后寻找闭合标签的最大跨度，避免极端长块把整份正文塞进一片 */
const LOOKAHEAD_BYTES = 400_000

export function splitSafeChunks(html: string, maxBytes = DEFAULT_MAX_BYTES): string[] {
  const chunks: string[] = []
  const n = html.length
  let start = 0
  while (start < n) {
    let end = Math.min(start + maxBytes, n)
    if (end < n) {
      CLOSE_TAGS.lastIndex = end
      let m: RegExpExecArray | null
      let best = -1
      while ((m = CLOSE_TAGS.exec(html))) {
        if (m.index >= end && m.index <= end + LOOKAHEAD_BYTES) {
          best = m.index + m[0].length
          break
        }
        if (m.index > end + LOOKAHEAD_BYTES) break
      }
      if (best > 0) end = best
      else {
        const gt = html.indexOf('>', end)
        end = gt > end ? gt + 1 : Math.min(start + maxBytes, n)
      }
    }
    chunks.push(html.slice(start, end))
    start = end
  }
  return chunks
}

/** 让出一帧：浏览器完成本次绘制 + 处理输入 */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/**
 * 流式注入整段 HTML：清空容器后逐片插入。
 * 每次调用前递增 token 并传入，内容被替换时旧的流式任务会在下一片自行退出。
 */
export async function streamInjectHtml(
  el: HTMLElement,
  html: string,
  token: number,
  tokenOf: () => number,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<void> {
  el.innerHTML = ''
  for (const chunk of splitSafeChunks(html, maxBytes)) {
    if (token !== tokenOf()) return
    el.insertAdjacentHTML('beforeend', chunk)
    await nextFrame()
  }
}
