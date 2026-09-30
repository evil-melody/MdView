/**
 * docx Block → HTML 渲染（MdView 自绘，受控 DOM）。
 *
 * 设计要点：
 * - 文本块（paragraph/heading/listItem）可编辑：每个 run 渲染为带内联样式的 <span>，
 *   图片 run 渲染为 <img data-img="i">（i = 该 block runs 中的下标，保存时据此取回原始 drawing xml）。
 * - 表格 / 独立图片块：只读展示（保留原始字节，保存时不 touched 即原样回写）。
 *   这样既不丢图片/表格（修复此前只渲染文本的倒退），又能原生保存文本改动。
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cssFont(name?: string): string {
  if (!name) return ''
  return /[/,;:]/.test(name) ? `"${name}"` : name
}

function runStyle(run: any): string {
  const s: string[] = []
  if (run.bold) s.push('font-weight:700')
  if (run.italic) s.push('font-style:italic')
  if (run.underline) s.push('text-decoration:underline')
  if (run.strike) s.push('text-decoration:line-through')
  if (run.color && run.color !== 'auto') s.push(`color:#${run.color}`)
  if (run.sizeHalfPoints) s.push(`font-size:${Math.round(run.sizeHalfPoints / 2)}px`)
  if (run.font) s.push(`font-family:${cssFont(run.font)}`)
  return s.join(';')
}

function renderRun(run: any, i: number): string {
  if (run.image) {
    const w = run.image.widthPx ? ` width="${Math.round(run.image.widthPx)}"` : ''
    const h = run.image.heightPx ? ` height="${Math.round(run.image.heightPx)}"` : ''
    const alt = run.image.dataUrl ? '' : ' data-broken="1"'
    const src = run.image.dataUrl ?? ''
    return `<img class="docx-img" data-img="${i}" src="${src}"${w}${h}${alt}>`
  }
  const raw = run.text ?? ''
  if (!raw) return ''
  const style = runStyle(run)
  // \f = 分页符（w:br type=page 的文本形态）：渲染为分页指示线，避免 WebKit 显示为 tofu ⊠；
  // \n = 软换行 → <br>
  const html = escapeHtml(raw)
    .replace(/\f/g, '<span class="docx-pagebreak" title="分页符"></span>')
    .replace(/\n/g, '<br>')
  return `<span style="${style}">${html}</span>`
}

function renderParagraph(block: any): string {
  const bid = block.id
  const type: string = block.type
  const level = block.level ?? 1
  const cls =
    type === 'heading' ? `docx-h docx-h${level}` : type === 'listItem' ? 'docx-li' : 'docx-p'
  const inner = (block.runs ?? []).map((r: any, i: number) => renderRun(r, i)).join('')
  return `<p class="${cls}" data-bid="${bid}" data-type="${type}">${inner || '<br>'}</p>`
}

function renderTable(block: any): string {
  const tbl = block.table
  if (!tbl || !tbl.rows) return ''
  const bid = block.id
  const rows = tbl.rows
    .map((row: any[]) => {
      const cells = row
        .map((cell: any) => {
          const paras = (cell.richParas ?? []).map((p: any) => {
            const inner = (p.runs ?? []).map((r: any, i: number) => renderRun(r, i)).join('')
            return `<p>${inner || '<br>'}</p>`
          })
          return `<td class="docx-td">${paras.join('')}</td>`
        })
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')
  return `<table class="docx-table" data-bid="${bid}"><tbody>${rows}</tbody></table>`
}

function renderStandaloneImage(block: any): string {
  const src = block.imageDataUrl ?? ''
  const w = block.imageWidthPx ? ` width="${Math.round(block.imageWidthPx)}"` : ''
  const h = block.imageHeightPx ? ` height="${Math.round(block.imageHeightPx)}"` : ''
  return `<p class="docx-img-block" data-bid="${block.id}"><img class="docx-img" src="${src}"${w}${h}></p>`
}

export function renderBlockToHtml(block: any): string {
  const t = block?.type
  if (t === 'table') return renderTable(block)
  if (t === 'image') return renderStandaloneImage(block)
  return renderParagraph(block)
}
