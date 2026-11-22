/**
 * DOCX 块树 → HTML 字符串。生成的 DOM 契约与内核编辑控制器一致：
 *   .de-p[data-pa]  段落地址（顶层 "i"，表格内 "bi.ri.ci.pi"）
 *   span[data-o]    run 在段落内的字符偏移
 *   [data-obj]      非文本对象占一个字符
 * 这些属性是文档内容的一部分，不是组件样式；样式字符串随 OOXML 属性动态生成。
 */
import type { Block, FmtChange, Inline, Paragraph, ParaStyle, RunStyle, Table, TableRow, TrackMark, WrapSpec } from './core/docx/types'
import type { RowFrag } from './view/docx/paginate'
import { fmtChangeDesc, fmtChangeEmpty } from './view/docx/fmtchange'
import { pprChangeDesc, stateOf } from './view/docx/pprchange'
import { safeHref } from './core/url'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const pt = (v: number | undefined) => (v ? `${+v.toFixed(2)}pt` : '')

const UNDERLINE: Record<string, string> = {
  double: 'double', dotted: 'dotted', dottedHeavy: 'dotted', dash: 'dashed', dashedHeavy: 'dashed',
  dashLong: 'dashed', wave: 'wavy', wavyHeavy: 'wavy', wavyDouble: 'wavy'
}

const TRACK_COLORS = ['#c0392b', '#1a73e8', '#188038', '#a142f4', '#e37400', '#00838f', '#d01884', '#5f6368']
const slots = new Map<string, number>()
function authorColor(author?: string) {
  const k = author ?? ''
  let i = slots.get(k)
  if (i === undefined) slots.set(k, (i = slots.size))
  return TRACK_COLORS[i % TRACK_COLORS.length]
}

/** RunStyle → CSS 声明（供渲染与工具条共用） */
export function runCss(s?: RunStyle): string {
  if (!s) return ''
  const out: string[] = []
  if (s.b) out.push('font-weight:700')
  else if (s.b === false) out.push('font-weight:400')
  if (s.i) out.push('font-style:italic')
  else if (s.i === false) out.push('font-style:normal')
  const u = s.u && s.u !== 'none'
  const deco = [u ? 'underline' : '', s.strike || s.dstrike ? 'line-through' : ''].filter(Boolean).join(' ')
  if (deco) out.push(`text-decoration:${deco}`)
  else if (s.u === 'none' || s.strike === false) out.push('text-decoration:none')
  if (u && UNDERLINE[s.u!]) out.push(`text-decoration-style:${UNDERLINE[s.u!]}`)
  if (s.dstrike) out.push('text-decoration-style:double')
  if (s.color) out.push(`color:${s.color}`)
  if (s.sz) out.push(`font-size:${s.va ? s.sz * 0.65 : s.sz}pt`)
  if (s.font) out.push(`font-family:${s.font}`)
  if (s.hl || s.shd) out.push(`background:${s.hl ?? s.shd}`)
  if (s.va) out.push(`vertical-align:${s.va === 'sup' ? 'super' : 'sub'}`)
  if (s.caps) out.push('text-transform:uppercase')
  if (s.smallCaps) out.push('font-variant:small-caps')
  if (s.spacing) out.push(`letter-spacing:${s.spacing}pt`)
  return out.join(';')
}

function trackCss(tc: TrackMark): string {
  // moveFrom reads like a deletion (grey strike), moveTo like an insertion (green underline)
  const c = tc.k === 'moveFrom' ? '#9aa0a6' : tc.k === 'moveTo' ? '#188038' : authorColor(tc.author)
  const deco = tc.k === 'ins' || tc.k === 'moveTo' ? 'underline' : 'line-through'
  return `color:${c};text-decoration:${deco};text-decoration-color:${c}`
}

const TRACK_TITLE: Record<TrackMark['k'], string> = { ins: '插入', del: '删除', moveFrom: '移动来源', moveTo: '移动目标' }

/** Author-coloured left bar for a character-format revision; the static shape lives in office-doc-drag.css. */
function fmtChangeCss(fc: FmtChange): string {
  return `border-left:2px solid ${authorColor(fc.author)};padding-left:1px`
}

function lineHeight(ps: ParaStyle): string {
  if (!ps.line) return '1.17'
  if (ps.lineRule === 'exact') return `${ps.line}pt`
  if (ps.lineRule === 'atLeast') return `max(${ps.line}pt,1.17em)`
  return String(+(ps.line * 1.17).toFixed(3))
}

type Spacing = '' | 'b' | 'a' | 'ba'
function contextual(p?: Block, prev?: Block, next?: Block): Spacing {
  if (!p || p.t !== 'p' || !p.ps.contextual) return ''
  const b = prev?.t === 'p' && prev.sid === p.sid ? 'b' : ''
  const a = next?.t === 'p' && next.sid === p.sid ? 'a' : ''
  return (b + a) as Spacing
}

function paraCss(ps: ParaStyle, sp: Spacing): string {
  const out: string[] = [`line-height:${lineHeight(ps)}`]
  if (!sp.includes('b') && ps.before) out.push(`padding-top:${pt(ps.before)}`)
  if (!sp.includes('a') && ps.after) out.push(`padding-bottom:${pt(ps.after)}`)
  if (ps.indL) out.push(`padding-left:${pt(ps.indL)}`)
  if (ps.indR) out.push(`padding-right:${pt(ps.indR)}`)
  if (ps.indFirst) out.push(`text-indent:${pt(ps.indFirst)}`)
  if (ps.align) out.push(`text-align:${ps.align}`)
  if (ps.shd) out.push(`background:${ps.shd}`)
  const b = (x: ParaStyle['bTop']) => (x ? `${x.w}pt ${x.style} ${x.color}` : '')
  if (ps.bTop) out.push(`border-top:${b(ps.bTop)}`)
  if (ps.bBottom) out.push(`border-bottom:${b(ps.bBottom)}`)
  if (ps.bLeft) out.push(`border-left:${b(ps.bLeft)}`)
  if (ps.bRight) out.push(`border-right:${b(ps.bRight)}`)
  return out.join(';')
}

export interface RenderOpts {
  editable: boolean
  page?: number
  pages?: number
  /** 顶层块索引起始值（分页渲染时传入页面起始下标） */
  offset?: number
  /** 跨页表格：绝对块下标 → 本页要渲染的行片段 */
  frags?: Record<number, RowFrag>
}

/** CSS for a floating picture (dynamic geometry from the wp:anchor wrap/position). */
function floatStyle(w: WrapSpec, iw: number, rot?: number): string {
  const p = w.pos
  const pt = (v: number) => `${+v.toFixed(1)}pt`
  const rotCss = rot ? `rotate(${rot}deg)` : ''
  const abs = w.kind === 'behindDoc' || w.kind === 'inFrontOfText'
  const hOff = p.hAlign ? 0 : (p.hOff ?? 0)
  const vOff = p.vAlign ? 0 : (p.vOff ?? 0)
  if (abs) {
    const left = p.hAlign ? (p.hAlign === 'right' || p.hAlign === 'outside' ? '100%' : p.hAlign === 'center' ? '50%' : '0pt') : pt(hOff)
    const top = p.vAlign ? (p.vAlign === 'bottom' ? '100%' : p.vAlign === 'center' ? '50%' : '0pt') : pt(vOff)
    const tx = p.hAlign === 'center' ? '-50%' : p.hAlign === 'right' || p.hAlign === 'outside' ? '-100%' : '0'
    const ty = p.vAlign === 'center' ? '-50%' : p.vAlign === 'bottom' ? '-100%' : '0'
    return `position:absolute;left:${left};top:${top};transform:translate(${tx},${ty}) ${rotCss};transform-origin:center;width:${pt(iw)};margin:${pt(w.distT ?? 0)} ${pt(w.distR ?? 0)} ${pt(w.distB ?? 0)} ${pt(w.distL ?? 0)};`
  }
  // square / tight: float + shape-outside makes the following paragraph text wrap around the box
  const side = p.hAlign === 'right' || p.hAlign === 'outside' ? 'right' : 'left'
  const mT = (w.distT ?? 0) + vOff
  const mL = (w.distL ?? 0) + (side === 'left' ? hOff : 0)
  const mR = (w.distR ?? 0) + (side === 'right' ? hOff : 0)
  const base = `float:${side};shape-outside:margin-box;margin:${pt(mT)} ${pt(mR)} ${pt(w.distB ?? 0)} ${pt(mL)};width:${pt(iw)};`
  return rotCss ? `${base}transform:${rotCss};transform-origin:center;` : base
}

function inlineHtml(x: Inline, o: number, ctx: RenderOpts): string {
  const obj = `data-o="${o}" data-obj=""${ctx.editable ? ' contenteditable="false"' : ''}`
  switch (x.t) {
    case 'text': {
      // a revision whose net diff is zero is rendered as a plain run
      const fc = x.fc && !fmtChangeEmpty(x.fc.s, x.s) ? x.fc : undefined
      const css = [runCss(x.s), x.tc ? trackCss(x.tc) : '', fc ? fmtChangeCss(fc) : ''].filter(Boolean).join(';')
      const title = x.tc ? ` title="${esc(TRACK_TITLE[x.tc.k])}"` : fc ? ` title="${esc(fmtChangeDesc(fc.s, x.s))}"` : ''
      const cls = fc ? ' class="de-fmt-chg"' : ''
      // css may carry a quoted font-family: escape it or the quotes would terminate the style attribute
      const span = `<span data-o="${o}"${cls}${css ? ` style="${esc(css)}"` : ''}${title}>${esc(x.text)}</span>`
      const href = !ctx.editable ? safeHref(x.href) : undefined
      return href ? `<a href="${esc(href)}" target="_blank" rel="noreferrer noopener">${span}</a>` : span
    }
    case 'field': {
      const v = x.kind === 'PAGE' ? (ctx.page !== undefined ? ctx.page + 1 : 1) : ctx.pages || 1
      return `<span ${obj} style="${runCss(x.s)}">${v}</span>`
    }
    case 'ref':
      return `<span ${obj} style="${runCss(x.s)}">${esc(x.text)}</span>`
    case 'img': {
      const rotCss = x.rot ? `transform:rotate(${x.rot}deg);transform-origin:center` : ''
      // crop (a:srcRect): the frame keeps its size, the shown part of the picture is stretched to fill it —
      // a clipping wrapper holds an oversized image shifted by the cropped sides
      if (x.crop && (x.crop.l || x.crop.t || x.crop.r || x.crop.b)) {
        const l = (x.crop.l ?? 0) / 1000, t = (x.crop.t ?? 0) / 1000, r = (x.crop.r ?? 0) / 1000, b = (x.crop.b ?? 0) / 1000
        const sw = x.w / Math.max(0.05, 1 - l - r)
        const sh = x.h / Math.max(0.05, 1 - t - b)
        const img = `<img data-media="${esc(x.target)}" alt="${esc(x.alt ?? '')}" style="width:${sw}pt;height:${sh}pt;margin-left:${-l * sw}pt;margin-top:${-t * sh}pt;vertical-align:top;max-width:none" draggable="false" />`
        const box = `<span ${obj} class="de-crop" style="width:${x.w}pt;height:${x.h}pt;vertical-align:bottom">${img}</span>`
        if (x.wrap) return `<span class="de-float de-float-${x.wrap.kind}" data-wrap="${x.wrap.kind}" style="${floatStyle(x.wrap, x.w, x.rot)}">${box}</span>`
        return box
      }
      const size = `width:${x.w}pt;height:${x.h}pt;vertical-align:bottom${rotCss ? ';' + rotCss : ''}`
      const img = `<img data-media="${esc(x.target)}" alt="${esc(x.alt ?? '')}" style="${size}" draggable="false" />`
      if (x.wrap) return `<span ${obj} class="de-float de-float-${x.wrap.kind}" data-wrap="${x.wrap.kind}" style="${floatStyle(x.wrap, x.w, x.rot)}">${img}</span>`
      return `<span ${obj}>${img}</span>`
    }
    case 'box':
      return `<span ${obj} class="de-tbox" style="width:${x.w}pt;min-height:${x.h}pt">${blocksHtml(x.blocks, { ...ctx, offset: 0 }, true)}</span>`
    case 'shape':
      return `<span ${obj} class="de-ph" style="width:${x.w}pt;height:${x.h}pt">${esc(x.label ?? '')}</span>`
  }
}

function paraHtml(p: Paragraph, pa: string | undefined, sp: Spacing, ctx: RenderOpts): string {
  const hang = p.ps.indFirst && p.ps.indFirst < 0 ? -p.ps.indFirst : 0
  const visible = p.runs.length > 0
  let css = paraCss(p.ps, sp)
  // a paragraph-format revision carries the author colour statically (the shape lives in the CSS)
  const pc = p.pc
  if (pc) css += `${css ? ';' : ''}border-left:2px solid ${authorColor(pc.author)}`
  const cls = pc ? ' class="de-p de-ppr-chg"' : ' class="de-p"'
  const title = pc ? ` title="${esc(pprChangeDesc(pc.old.st, stateOf(p)))}"` : ''
  if (!visible) {
    if (p.markSz) css += `;font-size:${pt(p.markSz)}`
    if (p.markFont) css += `;font-family:${p.markFont}`
  }
  const canEdit = ctx.editable && pa !== undefined
  const ce = ctx.editable && !canEdit ? ' contenteditable="false"' : ''
  let o = 0
  const runs = p.runs.map((x) => {
    const html = inlineHtml(x, o, ctx)
    o += x.t === 'text' ? x.text.length : 1
    return html
  })
  let marker = ''
  if (p.marker) {
    const mw = p.marker.tab && hang ? `min-width:${hang}pt;` : ''
    marker = `<span class="de-marker"${ctx.editable ? ' contenteditable="false"' : ''} style="${mw}${runCss(p.marker.s)}">${esc(p.marker.text)}${p.marker.tab && !hang ? '\t' : ''}</span>`
  }
  const empty = visible ? '' : ctx.editable && canEdit ? '<span data-o="0" data-empty="">&#8203;</span>' : '&#8203;'
  return `<div${cls}${pa !== undefined ? ` data-pa="${pa}"` : ''}${ce}${css ? ` style="${css}"` : ''}${title}>${marker}${runs.join('')}${empty}</div>`
}

function tableHtml(t: Table, pa: string | undefined, ctx: RenderOpts, frag?: RowFrag): string {
  const total = t.cols.reduce((a, b) => a + b, 0)
  let style = `width:${total ? `${total}pt` : '100%'}`
  if (t.align === 'center') style += ';margin:0 auto'
  else if (t.align === 'right') style += ';margin-left:auto'
  else if (t.indL) style += `;margin-left:${t.indL}pt`
  const cols = total ? `<colgroup>${t.cols.map((w) => `<col style="width:${w}pt" />`).join('')}</colgroup>` : ''
  // a continuation page repeats the header rows, then renders its slice of body rows
  const entries: { row: TableRow; ri: number; repeat: boolean }[] = frag
    ? [
        ...frag.repeat.map((ri) => ({ row: t.rows[ri], ri, repeat: true })),
        ...t.rows.slice(frag.r0, frag.r1).map((row, k) => ({ row, ri: frag.r0 + k, repeat: false })),
      ]
    : t.rows.map((row, ri) => ({ row, ri, repeat: false }))
  const rows = entries.map(({ row, ri, repeat }) => {
    let g = 0
    const cells = row.cells.map((c, ci) => {
      // 该单元格右边界对应的列索引（累计 colSpan），供拖动定位 colgroup 中的列
      const ciRight = g + Math.max(1, c.colSpan || 1) - 1
      g += Math.max(1, c.colSpan || 1)
      let cs = ''
      if (c.borders.t) cs += `border-top:${c.borders.t};`
      if (c.borders.r) cs += `border-right:${c.borders.r};`
      if (c.borders.b) cs += `border-bottom:${c.borders.b};`
      if (c.borders.l) cs += `border-left:${c.borders.l};`
      if (c.shd) cs += `background:${c.shd};`
      if (c.vAlign) cs += `vertical-align:${c.vAlign};`
      cs += `padding:${c.pad[0]}pt ${c.pad[1]}pt ${c.pad[2]}pt ${c.pad[3]}pt`
      const inner = c.blocks
        .map((b, i) => {
          const cellPa = pa !== undefined && !repeat && b.t === 'p' && b.pid !== undefined && !b.ro ? `${pa}.${ri}.${ci}.${i}` : undefined
          return b.t === 'p' ? paraHtml(b, cellPa, contextual(b, c.blocks[i - 1], c.blocks[i + 1]), ctx) : b.t === 'tbl' ? tableHtml(b, undefined, ctx) : ''
        })
        .join('')
      // 顶层可编辑表格且有明确列宽时，给每个单元格右边界放一个细手柄；重复表头行不参与交互
      const grip = ctx.editable && pa !== undefined && !repeat && total
        ? `<span class="de-col-grip" data-ci="${ciRight}" contenteditable="false"></span>`
        : ''
      // 行高手柄：每行第一个单元格的下边界（顶层可编辑表格；嵌套表格不参与）
      const rgrip = ctx.editable && pa !== undefined && !repeat && ci === 0 ? `<span class="de-row-grip" contenteditable="false"></span>` : ''
      return `<td${c.colSpan > 1 ? ` colspan="${c.colSpan}"` : ''}${c.rowSpan > 1 ? ` rowspan="${c.rowSpan}"` : ''}${cs ? ` style="${cs}"` : ''}>${inner}${grip}${rgrip}</td>`
    })
    const st = row.h ? ` style="height:${row.h}pt"` : ''
    return `<tr data-ri="${ri}"${repeat ? ' class="de-repeat"' : ''}${st}>${cells.join('')}</tr>`
  })
  return `<table class="de-tbl" style="${style}">${cols}<tbody>${rows.join('')}</tbody></table>`
}

/** 渲染块树。offset 为顶层块在整篇文档中的起始下标，决定 data-pa 地址。 */
export function blocksHtml(blocks: Block[], ctx: RenderOpts, nested = false): string {
  const base = ctx.offset ?? 0
  return blocks
    .map((b, i) => {
      const bi = base + i
      let html: string
      if (b.t === 'p') html = paraHtml(b, nested ? undefined : `${bi}`, contextual(b, blocks[i - 1], blocks[i + 1]), ctx)
      else if (b.t === 'tbl') {
        // 顶层表格内段落仍要可编辑；嵌套表格整体只读。跨页时按 frags 渲染本页行片段
        const t = tableHtml(b, nested ? undefined : `${bi}`, ctx, nested ? undefined : ctx.frags?.[bi])
        html = ctx.editable && nested ? `<div contenteditable="false">${t}</div>` : t
      } else html = '<div class="de-sect"></div>'
      // data-bi 供视图测量块高并写回分页高度表；地址仍是绝对块下标
      return nested ? html : `<div class="de-block" data-bi="${bi}">${html}</div>`
    })
    .join('')
}

/** 流式到达时的高度估算，保证首屏就能分页，不必等 DOM 测量 */
export function estimateHeight(b: Block): number {
  if (b.t === 'p') {
    const len = b.runs.reduce((n, r) => n + (r.t === 'text' ? r.text.length : 1), 0)
    return Math.max(18, Math.ceil(len / 90) * 19 + (b.ps.before ?? 0) + (b.ps.after ?? 0))
  }
  if (b.t === 'tbl') return b.rows.length * 27 + 10
  return 0
}
