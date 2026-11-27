/**
 * 选区数据 → 图表 PNG（xlsx.image 落库）。
 * 图表先按 Office 默认配色画成 SVG，再经 canvas 栅格化为 PNG 字节——保存进文件后
 * 真实 Office 打开同样呈现同一张图（图片级 1:1；原生 chart part 是后续升级项）。
 */

export type ChartKind = 'col' | 'bar' | 'line' | 'pie' | 'area' | 'scatter'

export interface ChartSeries {
  name: string
  values: number[]
}
export interface ChartData {
  cats: string[]
  series: ChartSeries[]
}

/** Office 图表默认主题色（环序与 Excel 一致） */
const PALETTE = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#264478', '#9E480E']

const num = (t: string): number | null => {
  const s = t.replace(/[,¥$\s%]/g, '')
  return s && Number.isFinite(Number(s)) ? Number(s) : null
}

/**
 * Office 式猜表：首行多为文本 → 当作系列名；首列多为文本 → 当作分类。
 * 数值缺失按 0 计，与 Excel 导入图表的行为一致。
 */
export function chartDataOf(matrix: string[][]): ChartData | null {
  const rows = matrix
    .map((r) => r.map((v) => String(v ?? '').trim()))
    .filter((r) => r.some((v) => v !== ''))
  if (rows.length < 2) return null
  const width = Math.max(...rows.map((r) => r.length))
  const rowTextRatio = (r: string[]) => r.filter((v) => v && num(v) === null).length / Math.max(1, r.filter((v) => v).length)
  const hasHeader = rows[0].some((v) => v) && rowTextRatio(rows[0]) >= 0.6
  const colTextRatio = (c: number) => {
    const vals = rows.slice(hasHeader ? 1 : 0).map((r) => r[c] ?? '')
    return vals.filter((v) => v && num(v) === null).length / Math.max(1, vals.filter((v) => v).length)
  }
  const hasCats = colTextRatio(0) >= 0.6
  const body = hasHeader ? rows.slice(1) : rows
  const firstCol = hasCats ? 1 : 0
  const cats = body.map((r, i) => (hasCats ? r[0] ?? '' : `${i + 1}`))
  const series: ChartSeries[] = []
  for (let c = firstCol; c < width; c++) {
    const values = body.map((r) => num(r[c]) ?? 0)
    if (!values.some((v) => v !== 0)) continue
    series.push({ name: (hasHeader ? rows[0][c] : '') || `系列${series.length + 1}`, values })
  }
  if (!series.length || cats.length < 2) return null
  return { cats, series: series.slice(0, PALETTE.length) }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 饼图角度路径（扇区从 12 点顺时针） */
function pieSlice(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x0 = cx + r * Math.sin(a0), y0 = cy - r * Math.cos(a0)
  const x1 = cx + r * Math.sin(a1), y1 = cy - r * Math.cos(a1)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M ${cx} ${cy} L ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`
}

const KINDS: ChartKind[] = ['col', 'bar', 'line', 'pie', 'area', 'scatter']

/** 渲染 640×400 图表 SVG（白底、网格、图例，Office 版式）。
 *  导出供原生 chart part 的视图层（OfficeSheetFeatureLayer）按读回的数据重绘同一张图。
 *  未知 kind 一律归一到 'col'（Excel 默认图型），绝不静默退化到别的图型。 */
export function chartSvg(kind: ChartKind, data: ChartData): string {
  if (!KINDS.includes(kind)) kind = 'col'
  const W = 640, H = 400
  const T = 30, B = 60, L = 70, R = 20
  const pw = W - L - R, ph = H - T - B
  const all = data.series.flatMap((s) => s.values)
  const max = Math.max(...all, 0), min = Math.min(...all, 0)
  const niceMax = max <= 0 ? 1 : max
  const niceMin = min >= 0 ? 0 : min
  const yOf = (v: number) => T + ph * (1 - (v - niceMin) / (niceMax - niceMin))
  const legend = data.series
    .map((s, i) => `<rect x="${L + i * 92}" y="8" width="12" height="12" fill="${PALETTE[i % PALETTE.length]}"/><text x="${L + i * 92 + 16}" y="18" font-size="12" fill="#444">${esc(s.name.slice(0, 8))}</text>`)
    .join('')
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((t) => {
      const y = T + ph * t
      const val = niceMax - (niceMax - niceMin) * t
      return `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" stroke="#D9D9D9"/><text x="${L - 6}" y="${y + 4}" font-size="11" fill="#666" text-anchor="end">${Math.round(val * 100) / 100}</text>`
    })
    .join('')

  let plot = ''
  if (kind === 'col' || kind === 'line' || kind === 'area' || kind === 'scatter') {
    const n = data.cats.length
    const step = pw / n
    const catLabels = data.cats
      .map((c, i) => `<text x="${L + step * i + step / 2}" y="${T + ph + 16}" font-size="11" fill="#444" text-anchor="middle">${esc(c.slice(0, 6))}</text>`)
      .join('')
    if (kind === 'col') {
      const gw = step / (data.series.length + 1)
      plot =
        catLabels +
        data.series
          .map((s, si) =>
            s.values
              .map((v, i) => {
                const y0 = yOf(Math.max(0, niceMin))
                const y1 = yOf(v)
                const x = L + step * i + gw * (si + 0.5)
                const top = Math.min(y0, y1), hh = Math.max(1, Math.abs(y1 - y0))
                return `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${(gw * 0.8).toFixed(1)}" height="${hh.toFixed(1)}" fill="${PALETTE[si % PALETTE.length]}"/>`
              })
              .join(''),
          )
          .join('')
    } else if (kind === 'area') {
      // 面积图：折线 + 到底部闭合的半透明填充，多系列按原序叠加（Excel 标准分组同款）
      const yBase = T + ph
      plot =
        catLabels +
        data.series
          .map((s, si) => {
            const col = PALETTE[si % PALETTE.length]
            const pts = s.values.map((v, i) => `${(L + step * i + step / 2).toFixed(1)},${yOf(v).toFixed(1)}`)
            const poly = `${L.toFixed(1)},${yBase} ${pts.join(' ')} ${(L + step * s.values.length + step / 2 - step).toFixed(1)},${yBase}`
            return `<polygon points="${poly}" fill="${col}" fill-opacity="0.55" stroke="none"/>` +
              `<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="2"/>`
          })
          .join('')
    } else if (kind === 'scatter') {
      // 散点图：X 轴按数值线性刻度（分类文本解不出数时退化为等距序号），点 + 连线（lineMarker）
      const xs = data.cats.map((c) => num(c))
      const allNum = xs.every((v) => v !== null) && xs.length > 1
      const xMin = allNum ? Math.min(...(xs as number[])) : 0
      const xMax = allNum ? Math.max(...(xs as number[])) : Math.max(1, data.cats.length - 1)
      const xSpan = xMax - xMin || 1
      const xOf = allNum
        ? (i: number) => L + pw * (((xs[i] as number) - xMin) / xSpan)
        : (i: number) => L + step * i + step / 2
      const xLabels = allNum
        ? [xMin, (xMin + xMax) / 2, xMax]
            .map((v) => `<text x="${(L + pw * ((v - xMin) / xSpan)).toFixed(1)}" y="${T + ph + 16}" font-size="11" fill="#444" text-anchor="middle">${Math.round(v * 100) / 100}</text>`)
            .join('')
        : catLabels
      plot =
        xLabels +
        data.series
          .map((s, si) => {
            const col = PALETTE[si % PALETTE.length]
            const pts = s.values.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')
            return `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5"/>` +
              s.values.map((v, i) => `<circle cx="${xOf(i).toFixed(1)}" cy="${yOf(v).toFixed(1)}" r="3.5" fill="${col}"/>`).join('')
          })
          .join('')
    } else {
      plot =
        catLabels +
        data.series
          .map((s, si) => {
            const pts = s.values.map((v, i) => `${(L + step * i + step / 2).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')
            return `<polyline points="${pts}" fill="none" stroke="${PALETTE[si % PALETTE.length]}" stroke-width="2"/>` +
              s.values.map((v, i) => `<circle cx="${(L + step * i + step / 2).toFixed(1)}" cy="${yOf(v).toFixed(1)}" r="3" fill="${PALETTE[si % PALETTE.length]}"/>`).join('')
          })
          .join('')
    }
  } else if (kind === 'bar') {
    const n = data.cats.length
    const step = ph / n
    const gw = step / (data.series.length + 1)
    plot =
      data.cats
        .map((c, i) => `<text x="${L - 6}" y="${T + step * i + step / 2 + 4}" font-size="11" fill="#444" text-anchor="end">${esc(c.slice(0, 6))}</text>`)
        .join('') +
      data.series
        .map((s, si) =>
          s.values
            .map((v, i) => {
              const x0 = L + pw * Math.max(0, -niceMin) / (niceMax - niceMin)
              const x1 = L + pw * (v - niceMin) / (niceMax - niceMin)
              const y = T + step * i + gw * (si + 0.5)
              return `<rect x="${Math.min(x0, x1).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, Math.abs(x1 - x0)).toFixed(1)}" height="${(gw * 0.8).toFixed(1)}" fill="${PALETTE[si % PALETTE.length]}"/>`
            })
            .join(''),
        )
        .join('')
  } else {
    const s = data.series[0]
    const total = s.values.reduce((a, b) => a + Math.abs(b), 0) || 1
    let a = 0
    plot = s.values
      .map((v, i) => {
        const a1 = a + (Math.abs(v) / total) * Math.PI * 2
        const seg = `<path d="${pieSlice(L + pw / 2, T + ph / 2, Math.min(pw, ph) / 2 - 8, a, a1)}" fill="${PALETTE[i % PALETTE.length]}" stroke="#fff"/>` +
          `<text x="${(L + pw / 2 + (Math.min(pw, ph) / 2 - 8) * 0.65 * Math.sin((a + a1) / 2)).toFixed(0)}" y="${(T + ph / 2 - (Math.min(pw, ph) / 2 - 8) * 0.65 * Math.cos((a + a1) / 2)).toFixed(0)}" font-size="10" fill="#fff" text-anchor="middle">${Math.round((Math.abs(v) / total) * 100)}%</text>`
        a = a1
        return seg
      })
      .join('')
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${legend}<line x1="${L}" y1="${T + ph}" x2="${W - R}" y2="${T + ph}" stroke="#999"/>${kind === 'pie' ? '' : grid}${plot}</svg>`
}

/** SVG → PNG 字节（640×400，白底） */
export async function chartPng(kind: ChartKind, data: ChartData): Promise<{ bytes: ArrayBuffer; w: number; h: number }> {
  const svg = chartSvg(kind, data)
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  const img = new Image()
  await new Promise<void>((res, rej) => {
    img.onload = () => res()
    img.onerror = () => rej(new Error('chart svg decode failed'))
    img.src = url
  })
  const W = 640, H = 400
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.drawImage(img, 0, 0, W, H)
  const blob: Blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('canvas toBlob failed'))), 'image/png'))
  return { bytes: await blob.arrayBuffer(), w: W, h: H }
}
