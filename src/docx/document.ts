/**
 * docx 文档模型：封装 GenOffice docx-engine 的 parseDocx / saveDocx。
 *
 * 关键不变式（与 pptx 同一套 byte-fidelity 哲学）：
 * - 未编辑的块 → { kind:'original', docxIndex }，原样回写，document.xml 之外字节完全保留。
 * - 编辑过的文本块 → { kind:'generated', block:{ type, rawPPr, runs } }：
 *   rawPPr 用原始段落的 <w:pPr>（标题/列表/对齐/缩进全部保留），只重建 runs。
 *   图片 run 按 data-img 下标取回原始 drawing xml 原样重发，绝不丢图。
 */

import { parseDocx, saveDocx, type ParsedDocFull } from '@genoffice/docx-engine'
import { renderBlockToHtml } from './render'

export interface DocxOpenResult {
  document: DocxDocument
  blockCount: number
  html: string
}

export class DocxDocument {
  readonly parsed: ParsedDocFull
  readonly blocks: any[]

  private constructor(parsed: ParsedDocFull) {
    this.parsed = parsed
    this.blocks = parsed.blocks as any[]
  }

  static async open(bytes: Uint8Array): Promise<DocxOpenResult> {
    const parsed = (await parseDocx(bytes)) as ParsedDocFull
    const doc = new DocxDocument(parsed)
    const html = doc.blocks.map((b) => renderBlockToHtml(b)).join('\n')
    return { document: doc, blockCount: doc.blocks.length, html }
  }

  /** 渲染全部块为受控 HTML（编辑器一次性注入） */
  renderHtml(): string {
    return this.blocks.map((b) => renderBlockToHtml(b)).join('\n')
  }

  /**
   * 生成原生 .docx 字节。
   * @param editedByBid 编辑过的文本块 id → 其编辑后的 innerHTML
   */
  async save(editedByBid: Map<string, string>): Promise<Uint8Array> {
    const blocks = this.blocks
    const finalBlocks: any[] = []
    for (const b of blocks) {
      const idx = b.docxIndex
      const type: string = b.type
      const id: string = b.id
      if (
        (type === 'paragraph' || type === 'heading' || type === 'listItem') &&
        editedByBid.has(id)
      ) {
        const html = editedByBid.get(id) ?? ''
        const runs = rebuildRuns(html, b.runs ?? [])
        finalBlocks.push({
          kind: 'generated',
          docxIndex: idx,
          block: {
            type: type as 'paragraph' | 'heading' | 'listItem',
            rawPPr: b.rawPPr,
            ...(type === 'heading' ? { level: b.level ?? 1 } : {}),
            ...(b.styleId ? { styleId: b.styleId } : {}),
            ...(b.list ? { list: b.list } : {}),
            runs,
          },
        })
      } else if (idx != null) {
        finalBlocks.push({ kind: 'original', docxIndex: idx })
      }
      // idx 为 null 的块（理论上不存在于 original 序列）跳过，保持顺序由数组下标隐含
    }
    return saveDocx(this.parsed, finalBlocks)
  }
}

const FORMAT_TAGS: Record<string, keyof RunFlags> = {
  B: 'bold',
  STRONG: 'bold',
  I: 'italic',
  EM: 'italic',
  U: 'underline',
  S: 'strike',
  STRIKE: 'strike',
  DEL: 'strike',
}

interface RunFlags {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  sizeHalfPoints?: number
  font?: string
}

function parseInlineStyle(style: string): RunFlags {
  const f: RunFlags = {}
  const color = /color:\s*#?([0-9a-fA-F]{3,8})/.exec(style)
  if (color) f.color = color[1]
  const fs = /font-size:\s*([\d.]+)px/.exec(style)
  if (fs) f.sizeHalfPoints = Math.round(parseFloat(fs[1]) * 2)
  const ff = /font-family:\s*([^;]+)/.exec(style)
  if (ff) f.font = ff[1].replace(/["']/g, '').trim()
  if (/font-weight:\s*(bold|[6-9]00)/.test(style)) f.bold = true
  if (/font-style:\s*italic/.test(style)) f.italic = true
  if (/text-decoration:[^;]*underline/.test(style)) f.underline = true
  if (/text-decoration:[^;]*line-through/.test(style)) f.strike = true
  return f
}

function mergeFlags(into: RunFlags, add: RunFlags): RunFlags {
  return {
    bold: add.bold ?? into.bold,
    italic: add.italic ?? into.italic,
    underline: add.underline ?? into.underline,
    strike: add.strike ?? into.strike,
    color: add.color ?? into.color,
    sizeHalfPoints: add.sizeHalfPoints ?? into.sizeHalfPoints,
    font: add.font ?? into.font,
  }
}

/**
 * 把编辑后的块 innerHTML 还原为 Run[]：
 * 深度优先展平节点，祖先的标签/内联样式累积为格式栈；文本节点产出一个 run，
 * <img data-img="i"> 取回原始 run 的 image（含 drawing xml）原样重发。
 */
export function rebuildRuns(html: string, originalRuns: any[]): any[] {
  const root = document.createElement('div')
  root.innerHTML = html
  const runs: any[] = []
  const walk = (node: Node, flags: RunFlags) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? ''
        if (text) {
          runs.push({ text, ...flags })
        }
        return
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return
      const el = child as HTMLElement
      const tag = el.tagName
      let next = flags
      if (tag in FORMAT_TAGS) next = { ...flags, [FORMAT_TAGS[tag]]: true }
      const style = el.getAttribute('style') ?? ''
      if (style) next = mergeFlags(next, parseInlineStyle(style))
      if (tag === 'IMG') {
        const idx = el.getAttribute('data-img')
        if (idx != null) {
          const orig = originalRuns[Number(idx)]
          if (orig && orig.image) {
            runs.push({ image: orig.image })
            return
          }
        }
        // 新插入的图片（无原始映射）：暂以 dataUrl 占位，保存时引擎会按 NewImage 处理
        const src = el.getAttribute('src') ?? ''
        if (src.startsWith('data:')) runs.push({ image: { dataUrl: src } })
        return
      }
      if (tag === 'BR') {
        const last = runs[runs.length - 1]
        if (last && last.text) last.text += '\n'
        else runs.push({ text: '\n', ...flags })
        return
      }
      walk(child, next)
    })
  }
  walk(root, {})
  return runs
}
