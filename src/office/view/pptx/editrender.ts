/**
 * PPTX 形状文本「编辑层」HTML：与 RichInput 光标契约同构生成。
 *   div[data-pa]   段落地址（形状内段落序号）
 *   span[data-o]   run 在段落内的字符偏移（对象 run 占 1 字符）
 *   [data-empty]   空段落的 \u200B 占位
 *   [data-obj]     幻灯片域（a:fld）等原子对象，contenteditable=false
 * 显示层（OfficeSlideCanvas.bodyHtml）不带这些属性；编辑层带，逐 run 样式与显示层一致。
 * runs 的归一化口径与 PptxEditor.toEdit 完全相同 —— data-o 偏移两边天然对齐。
 */
import type { TextBody, TPara, TRun } from '../../core/pptx/types'
import { normalize, rlen, type RRun } from '../edit/rich'
import type { EPara } from './PptxEditor'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** run 样式对象（TRun 去掉 text/br/fld/src/href，口径同 PptxEditor.styleOf） */
type Sty = Omit<TRun, 'text' | 'br' | 'fld' | 'src' | 'href'>

const styleOf = (r: TRun): Sty => ({ sz: r.sz, b: r.b, i: r.i, u: r.u, strike: r.strike, color: r.color, font: r.font, baseline: r.baseline, caps: r.caps, hl: r.hl })

/** CSS 口径同 OfficeSlideCanvas.runCss（baseline 千分比 → 上下标 65% 字号） */
function runCss(s: Sty | undefined): string {
  if (!s || !s.sz) return ''
  const out = [s.baseline ? `font-size:${(s.sz * 0.65).toFixed(2)}pt` : `font-size:${s.sz}pt`]
  if (s.baseline) out.push(`vertical-align:${s.baseline > 0 ? 'super' : 'sub'}`)
  if (s.b) out.push('font-weight:700')
  if (s.i) out.push('font-style:italic')
  const deco = [s.u ? 'underline' : '', s.strike ? 'line-through' : ''].filter(Boolean).join(' ')
  if (deco) out.push(`text-decoration:${deco}`)
  if (s.color) out.push(`color:${s.color}`)
  if (s.font) out.push(`font-family:${s.font}`)
  if (s.caps) out.push('text-transform:uppercase')
  if (s.hl) out.push(`background:${s.hl}`)
  return out.join(';')
}

function paraCss(p: TPara): string {
  const style = [`text-align:${p.algn}`]
  if (p.marL) style.push(`padding-left:${p.marL}px`)
  if (p.indent) style.push(`text-indent:${p.indent}px`)
  if (p.spcBef) style.push(`padding-top:${p.spcBef}px`)
  if (p.spcAft) style.push(`padding-bottom:${p.spcAft}px`)
  style.push(`line-height:${p.lnPx ? p.lnPx + 'px' : p.lnPct ? +(p.lnPct * 1.2).toFixed(3) : 1.2}`)
  if (!p.runs.length || p.runs.every((r) => !r.text && !r.br)) style.push(`font-size:${p.endSz}pt`)
  return style.join(';')
}

/** 段内 run → 带契约属性的 span 序列；空段给 \u200B 占位（data-o=0 + data-empty） */
function innerHtml(runs: RRun[]): string {
  let o = 0
  const parts: string[] = []
  for (const r of runs) {
    const css = runCss(r.s as Sty | undefined)
    const st = css ? ` style="${esc(css)}"` : ''
    if (r.t !== 'text') {
      parts.push(`<span data-o="${o}" data-obj="" contenteditable="false"${st}>${esc(r.text ?? '')}</span>`)
    } else if (r.text) {
      parts.push(`<span data-o="${o}"${st}>${esc(r.text)}</span>`)
    } else {
      continue
    }
    o += rlen(r)
  }
  if (!parts.length) parts.push('<span data-o="0" data-empty="">\u200B</span>')
  return parts.join('')
}

const EMPTY_PARA: TPara = { algn: 'left', marL: 0, indent: 0, spcBef: 0, spcAft: 0, runs: [], endSz: 18 }

/** 进编辑初帧：由 SlideModel 的 TextBody 生成（归一化与 PptxEditor.toEdit 同口径） */
export function editHtmlFromBody(body: TextBody): string {
  const paras = body.paras.length ? body.paras : [EMPTY_PARA]
  return paras
    .map((p, i) => {
      const runs = normalize(
        p.runs.map((r) => (r.fld ? { t: 'fld', text: r.text, s: styleOf(r), src: r.src } : { t: 'text', text: r.br ? '\n' : r.text, s: styleOf(r), src: r.src })) as RRun[],
      )
      return `<div class="ov-slide-para" data-pa="${i}" style="${esc(paraCss(p))}">${innerHtml(runs)}</div>`
    })
    .join('')
}

/** 编辑中每帧：由 PptxEditor.paras 生成（algn 取编辑值，间距等取 base） */
export function editHtmlFromParas(paras: EPara[]): string {
  return paras
    .map((p, i) => `<div class="ov-slide-para" data-pa="${i}" style="${esc(paraCss({ ...p.base, algn: p.algn }))}">${innerHtml(p.runs)}</div>`)
    .join('')
}
