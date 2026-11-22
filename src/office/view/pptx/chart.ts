/**
 * 图表渲染几何（视图层）：ChartData → SVG 图元（box 局部坐标）。
 * 颜色不写死在这里，而是用 CSS 类（ov-chart-fill-N / ov-chart-stroke-N），
 * 固定配色写在 office-shape.css。
 */
import type { Box, ChartData } from '../../core/pptx/types'

export type ChartPrim =
  | { k: 'rect'; x: number; y: number; w: number; h: number; cls: string }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; cls: string }
  | { k: 'poly'; pts: string; cls: string }
  | { k: 'circle'; cx: number; cy: number; r: number; cls: string }
  | { k: 'path'; d: string; cls: string }
  | { k: 'text'; x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end'; cls: string }

const PAD_L = 36
const PAD_R = 8
const PAD_T = 8
const PAD_B = 20

/** 轴刻度步长（取 1/2/5×10^n） */
function niceStep(range: number, ticks: number): number {
  if (range <= 0) return 1
  const raw = range / Math.max(1, ticks)
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return step * mag
}

/** 文本截断（SVG 里没有省略号，按字符数粗略裁） */
function clip(text: string, max: number): string {
  const t = (text ?? '').trim()
  if (t.length <= max) return t
  return t.slice(0, Math.max(1, max - 1)) + '…'
}

/**
 * 图表 → SVG 图元（相对 box 左上角的局部坐标）。
 * 支持 bar（纵向 / 横向）、line、pie；其它类型返回空数组（视图显示「未识别图表类型」）。
 */
export function chartGeometry(data: ChartData, box: Box): ChartPrim[] {
  const out: ChartPrim[] = []
  const w = Math.max(box.w, 40)
  const h = Math.max(box.h, 30)
  const series = data.series
  if (!series.length) return out
  if (data.type !== 'bar' && data.type !== 'line' && data.type !== 'pie') return out
  const cats = series[0].cat.values
  const legendItems = data.type === 'pie' ? cats : series.map((s) => s.name)
  const legendW = legendItems.length ? Math.min(120, Math.max(60, 20 + Math.max(...legendItems.map((t) => Math.min(t.length, 12))) * 6.5)) : 0
  const x0 = PAD_L
  const y0 = PAD_T
  const x1 = w - PAD_R - legendW
  const y1 = h - PAD_B
  const plotW = Math.max(x1 - x0, 10)
  const plotH = Math.max(y1 - y0, 10)

  // 图例（右侧竖排）
  legendItems.forEach((t, i) => {
    const idx = i % 8
    const ly = y0 + 8 + i * 13
    out.push({ k: 'rect', x: x1 + 8, y: ly, w: 8, h: 8, cls: `ov-chart-fill-${idx}` })
    out.push({ k: 'text', x: x1 + 20, y: ly + 7, text: clip(t, 12), anchor: 'start', cls: 'ov-chart-txt' })
  })

  if (data.type === 'pie') {
    const vals = series[0].val.values
    const total = vals.reduce((a, b) => a + Math.abs(b), 0) || 1
    const cx = x0 + plotW / 2
    const cy = y0 + plotH / 2
    const r = Math.min(plotW, plotH) / 2 - 6
    let a0 = -Math.PI / 2
    vals.forEach((v, i) => {
      const frac = Math.abs(v) / total
      const a1 = a0 + frac * Math.PI * 2
      const xa = cx + r * Math.cos(a0)
      const ya = cy + r * Math.sin(a0)
      const xb = cx + r * Math.cos(a1)
      const yb = cy + r * Math.sin(a1)
      const large = frac > 0.5 ? 1 : 0
      out.push({
        k: 'path',
        d: `M${cx.toFixed(2)} ${cy.toFixed(2)} L${xa.toFixed(2)} ${ya.toFixed(2)} A${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${xb.toFixed(2)} ${yb.toFixed(2)} Z`,
        cls: `ov-chart-fill-${i % 8}`,
      })
      a0 = a1
    })
    return out
  }

  // 数值轴范围（柱/线都从 0 起，含负值时向下延伸）
  let min = 0
  let max = 0
  for (const s of series) for (const v of s.val.values) { min = Math.min(min, v); max = Math.max(max, v) }
  if (max === min) max = min + 1
  const step = niceStep(max - min, 4)
  const top = Math.ceil(max / step) * step
  const bottom = Math.floor(min / step) * step
  const span = top - bottom || 1

  if (data.horizontal) {
    // 横向柱：类别轴在左（纵），数值轴在下（横）
    const valX = (v: number) => x0 + ((v - bottom) / span) * plotW
    for (let v = bottom; v <= top + 1e-9; v += step) {
      const x = valX(v)
      out.push({ k: 'line', x1: x, y1: y0, x2: x, y2: y1, cls: 'ov-chart-axis' })
      out.push({ k: 'text', x, y: y1 + 12, text: String(Math.round(v * 1000) / 1000), anchor: 'middle', cls: 'ov-chart-txt' })
    }
    out.push({ k: 'line', x1: x0, y1: y0, x2: x0, y2: y1, cls: 'ov-chart-axis' })
    const rowH = plotH / Math.max(cats.length, 1)
    const groupH = rowH * 0.72
    const barH = groupH / Math.max(series.length, 1)
    series.forEach((s, si) => {
      const idx = si % 8
      s.val.values.forEach((v, ci) => {
        const by = y0 + ci * rowH + (rowH - groupH) / 2 + si * barH
        const zero = valX(0)
        const x = valX(v)
        out.push({ k: 'rect', x: Math.min(x, zero), y: by, w: Math.max(Math.abs(x - zero), 0.5), h: Math.max(barH - 1, 1), cls: `ov-chart-fill-${idx}` })
      })
    })
    cats.forEach((c, ci) => {
      const cy = y0 + ci * rowH + rowH / 2
      out.push({ k: 'text', x: x0 - 5, y: cy + 3, text: clip(c, 10), anchor: 'end', cls: 'ov-chart-txt' })
    })
    if (data.catAxisTitle) out.push({ k: 'text', x: 6, y: y0 + plotH / 2, text: clip(data.catAxisTitle, 14), anchor: 'start', cls: 'ov-chart-title' })
    if (data.valAxisTitle) out.push({ k: 'text', x: x0 + plotW / 2, y: h - 2, text: clip(data.valAxisTitle, 20), anchor: 'middle', cls: 'ov-chart-title' })
    return out
  }

  const valY = (v: number) => y1 - ((v - bottom) / span) * plotH
  for (let v = bottom; v <= top + 1e-9; v += step) {
    const y = valY(v)
    out.push({ k: 'line', x1: x0, y1: y, x2: x1, y2: y, cls: 'ov-chart-axis' })
    out.push({ k: 'text', x: x0 - 5, y: y + 3, text: String(Math.round(v * 1000) / 1000), anchor: 'end', cls: 'ov-chart-txt' })
  }
  out.push({ k: 'line', x1: x0, y1: y1, x2: x1, y2: y1, cls: 'ov-chart-axis' })

  const slot = plotW / Math.max(cats.length, 1)
  const groupW = slot * 0.72
  const barW = groupW / Math.max(series.length, 1)

  if (data.type === 'bar') {
    series.forEach((s, si) => {
      const idx = si % 8
      s.val.values.forEach((v, ci) => {
        const bx = x0 + ci * slot + (slot - groupW) / 2 + si * barW
        const zero = valY(0)
        const y = valY(v)
        out.push({ k: 'rect', x: bx, y: Math.min(y, zero), w: Math.max(barW - 1, 1), h: Math.max(Math.abs(y - zero), 0.5), cls: `ov-chart-fill-${idx}` })
      })
    })
  } else {
    series.forEach((s, si) => {
      const idx = si % 8
      const pts: string[] = []
      s.val.values.forEach((v, ci) => {
        const cx = x0 + ci * slot + slot / 2
        const cy = valY(v)
        pts.push(`${cx.toFixed(2)},${cy.toFixed(2)}`)
        out.push({ k: 'circle', cx, cy, r: 2.2, cls: `ov-chart-dot-${idx}` })
      })
      if (pts.length) out.push({ k: 'poly', pts: pts.join(' '), cls: `ov-chart-stroke-${idx}` })
    })
  }

  cats.forEach((c, ci) => {
    const cx = x0 + ci * slot + slot / 2
    out.push({ k: 'text', x: cx, y: y1 + 13, text: clip(c, Math.max(3, Math.floor(slot / 6))), anchor: 'middle', cls: 'ov-chart-txt' })
  })
  if (data.catAxisTitle) out.push({ k: 'text', x: x0 + plotW / 2, y: h - 2, text: clip(data.catAxisTitle, 24), anchor: 'middle', cls: 'ov-chart-title' })
  if (data.valAxisTitle) out.push({ k: 'text', x: 10, y: y0 + plotH / 2, text: clip(data.valAxisTitle, 16), anchor: 'start', cls: 'ov-chart-title' })
  return out
}
