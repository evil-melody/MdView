/**
 * 页眉页脚的视图侧逻辑：内核 Block[]（无 pid 的只读段落）↔ 可编辑文本行（HFLine）。
 * {PAGE} / {NUMPAGES} 在文本行里是占位记号，写回时由内核 hfParaXml 展开成 fldSimple。
 */
import { blocksHtml } from '../../docx-render'
import type { Block, HFKind, HFLine, PageSetup } from '../../core/docx/types'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** 页眉/页脚 blocks → 文本行；字段运行转 {PAGE} / {NUMPAGES} 记号 */
export function hfLinesOf(blocks: Block[] | undefined): HFLine[] {
  const out: HFLine[] = []
  if (!blocks) return out
  for (const b of blocks) {
    if (b.t !== 'p') continue
    let text = ''
    let s: { b?: boolean; sz?: number } | undefined
    for (const r of b.runs) {
      if (r.t === 'field') text += r.kind === 'PAGE' ? '{PAGE}' : '{NUMPAGES}'
      else if (r.t === 'text') {
        text += r.text
        s ??= { b: r.s.b, sz: r.s.sz }
      }
    }
    out.push({ text, align: b.ps.align === 'center' || b.ps.align === 'right' ? b.ps.align : 'left', ...(s?.b ? { b: true } : {}), ...(s?.sz ? { sz: s.sz } : {}) })
  }
  return out
}

/** 编辑态的 HTML：单个可编辑容器，行为 \n 分隔（白空格 pre-wrap；{PAGE} 记号直书） */
export function hfEditHtml(lines: HFLine[]): string {
  const text = (lines.length ? lines : [{ text: '' }]).map((l) => l.text).join('\n')
  return `<div class="de-hf-text">${esc(text) || '<br />'}</div>`
}

/** 编辑态提交：按 \n 拆回文本行（保留每行原有的对齐/加粗/字号） */
export function hfLinesFrom(root: HTMLElement, prev: HFLine[]): HFLine[] {
  const box = root.querySelector<HTMLElement>('.de-hf-text') ?? root
  let parts = (box.innerText ?? '').replace(/\r/g, '').split('\n')
  // 行尾 <br> 会被 innerText 读成一个多余的空行
  if (parts.length > 1 && parts[parts.length - 1] === '') parts = parts.slice(0, -1)
  return parts.map((text, i) => {
    const was = prev[i]
    return { text, align: was?.align ?? 'left', ...(was?.b ? { b: true } : {}), ...(was?.sz ? { sz: was.sz } : {}) }
  })
}

/** meta 里页眉/页脚相关的字段（DocxMeta 的子集，便于视图传入） */
export interface HFMeta {
  header?: Block[]
  footer?: Block[]
  firstHeader?: Block[]
  firstFooter?: Block[]
  evenHeader?: Block[]
  evenFooter?: Block[]
  titlePg?: boolean
  /** settings.xml 的 w:evenAndOddHeaders */
  evenAndOddHeaders?: boolean
}

export type HFVariant = 'default' | 'first' | 'even'

/**
 * 某页（0-based `idx`）该用哪种页眉/页脚：
 *  - 首页且「首页不同」→ first（最高优先）
 *  - 偶数页（1-based 为偶数，即 idx 为奇数）且「奇偶不同」→ even
 *  - 其余 → default
 * even 变体 part 缺失时由 hfBlocksOf 回退到 default（保持既有行为）。
 */
export function hfVariantOf(meta: HFMeta, idx: number): HFVariant {
  if (idx === 0 && meta.titlePg) return 'first'
  if (meta.evenAndOddHeaders && idx % 2 === 1) return 'even'
  return 'default'
}

/** 一种页眉/页脚在视图里的 blocks：按页号在 default / first / even 间切换 */
export function hfBlocksOf(meta: HFMeta, kind: 'header' | 'footer', idx: number): Block[] | undefined {
  const v = hfVariantOf(meta, idx)
  if (v === 'first') return kind === 'header' ? meta.firstHeader : meta.firstFooter
  if (v === 'even') return (kind === 'header' ? meta.evenHeader : meta.evenFooter) ?? (kind === 'header' ? meta.header : meta.footer)
  return kind === 'header' ? meta.header : meta.footer
}

/** 只读展示 HTML（字段值按页号展开）；data-pa 一并去掉，避免与正文块地址撞车（查找高亮等按它寻址） */
export function hfHtml(blocks: Block[] | undefined, page: number, pages: number): string {
  if (!blocks?.length) return ''
  return blocksHtml(blocks, { editable: false, page, pages }).replace(/ data-pa="[^"]*"/g, '')
}

/** 区域在页面边距内的定位（pt） */
export function hfStyle(page: PageSetup, kind: 'header' | 'footer'): Record<string, string> {
  return kind === 'header'
    ? { top: page.header + 'pt', left: page.ml + 'pt', right: page.mr + 'pt' }
    : { bottom: page.footer + 'pt', left: page.ml + 'pt', right: page.mr + 'pt' }
}

/** 每页该用的编辑种类（first / even 变体的编辑也走它，写回各自的 part） */
export function hfEditKind(kind: 'header' | 'footer', idx: number, meta: HFMeta): HFKind {
  const v = hfVariantOf(meta, idx)
  if (v === 'first') return kind === 'header' ? 'firstHeader' : 'firstFooter'
  if (v === 'even') return kind === 'header' ? 'evenHeader' : 'evenFooter'
  return kind
}
