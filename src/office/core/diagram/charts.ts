/** Pie charts, Gantt charts and mind maps / work breakdown trees. */
import type { Rendered } from './graph'
import { measure, pathData, Svg, textWidth, THEME, wrap, type Pt } from './svg'

const MARGIN = 16
const r2 = (v: number) => Math.round(v * 100) / 100

// ---------------------------------------------------------------- pie

export interface Pie {
  title?: string
  showData?: boolean
  slices: { label: string; value: number }[]
}

export function renderPie(p: Pie): Rendered {
  const slices = p.slices.filter((s) => s.value > 0 && Number.isFinite(s.value))
  if (!slices.length) throw new Error('The pie chart has no values')
  const total = slices.reduce((a, s) => a + s.value, 0)
  const R = 130
  const svg = new Svg()
  const titleH = p.title ? 36 : 0
  const cx = MARGIN + R
  const cy = MARGIN + titleH + R
  const color = (k: number) => THEME.series[k % THEME.series.length]
  let a0 = -Math.PI / 2
  const at = (a: number, r: number): Pt => ({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  slices.forEach((s, k) => {
    const frac = s.value / total
    const a1 = a0 + frac * 2 * Math.PI
    if (frac >= 0.9999) svg.circle(cx, cy, R, { fill: color(k), stroke: '#ffffff', sw: 2 })
    else {
      const p0 = at(a0, R)
      const p1 = at(a1, R)
      svg.path(`M${r2(cx)} ${r2(cy)} L${r2(p0.x)} ${r2(p0.y)} A${R} ${R} 0 ${frac > 0.5 ? 1 : 0} 1 ${r2(p1.x)} ${r2(p1.y)} Z`, { fill: color(k), stroke: '#ffffff', sw: 2 })
    }
    if (frac >= 0.06) {
      const m = at((a0 + a1) / 2, R * 0.66)
      svg.text(m.x, m.y, `${Math.round(frac * 1000) / 10}%`, { anchor: 'middle', size: 13, bold: true, color: '#ffffff' })
    }
    a0 = a1
  })
  // legend
  const lx = cx + R + 30
  const lh = 24
  const ly = cy - (slices.length * lh) / 2 + lh / 2
  let lw = 0
  slices.forEach((s, k) => {
    const text = p.showData ? `${s.label} [${fmt(s.value)}]` : s.label
    svg.rect(lx, ly + k * lh - 8, 16, 16, { fill: color(k) }, 3)
    svg.text(lx + 24, ly + k * lh, text)
    lw = Math.max(lw, textWidth(text, 14))
  })
  let W = lx + 24 + lw + MARGIN
  const H = Math.max(cy + R, ly + slices.length * lh) + MARGIN
  if (p.title) {
    W = Math.max(W, textWidth(p.title, 16, true) + 2 * MARGIN)
    svg.text(W / 2, MARGIN + 12, p.title, { anchor: 'middle', size: 16, bold: true })
  }
  return { svg: svg.toString(W, H), w: Math.ceil(W), h: Math.ceil(H) }
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100))

// ---------------------------------------------------------------- gantt

export interface GanttTask {
  name: string
  start: number
  end: number
  done?: boolean
  active?: boolean
  crit?: boolean
  milestone?: boolean
}

export interface Gantt {
  title?: string
  sections: { name: string; tasks: GanttTask[] }[]
}

const HOUR = 3600e3
const DAY = 24 * HOUR

const pad2 = (v: number) => String(v).padStart(2, '0')

export function renderGantt(g: Gantt): Rendered {
  const tasks = g.sections.flatMap((s) => s.tasks)
  if (!tasks.length) throw new Error('The Gantt chart has no tasks')
  const t0 = Math.min(...tasks.map((t) => t.start))
  const t1 = Math.max(...tasks.map((t) => Math.max(t.end, t.start)))
  const span = Math.max(t1 - t0, HOUR)
  const sectW = Math.min(180, Math.max(0, ...g.sections.map((s) => textWidth(s.name, 13, true))) + 24)
  const chartW = Math.max(560, Math.min(1100, tasks.length * 60))
  const scale = chartW / span
  const titleH = g.title ? 36 : 0
  const ROW = 28
  const axisH = 24
  const x0 = MARGIN + sectW
  const y0 = MARGIN + titleH
  const X = (t: number) => x0 + (t - t0) * scale
  const svg = new Svg()
  const H = y0 + tasks.length * ROW + axisH + MARGIN + 6
  // ticks
  const steps = [HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 91 * DAY, 365 * DAY]
  const step = steps.find((st) => span / st <= 12) ?? 365 * DAY
  const first = Math.ceil(t0 / step) * step
  const label = (t: number) => {
    const d = new Date(t)
    if (step < DAY) return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
    if (step >= 365 * DAY) return String(d.getUTCFullYear())
    if (step >= 30 * DAY) return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
  }
  const bottom = y0 + tasks.length * ROW + 4
  for (let t = first; t <= t1; t += step) {
    const x = X(t)
    svg.line(x, y0, x, bottom, { stroke: '#e3e6ec', sw: 1 })
    svg.text(x, bottom + 12, label(t), { anchor: 'middle', size: 11, color: THEME.muted })
  }
  let row = 0
  g.sections.forEach((s, k) => {
    const color = THEME.series[k % THEME.series.length]
    const top = y0 + row * ROW
    if (k % 2 === 0) svg.rect(MARGIN, top, sectW + chartW, s.tasks.length * ROW, { fill: '#f6f7fa' })
    if (s.name) svg.text(MARGIN + 6, top + (s.tasks.length * ROW) / 2, wrap([s.name], sectW - 12, 13, true), { size: 13, bold: true })
    for (const t of s.tasks) {
      const y = y0 + row * ROW + ROW / 2
      if (t.milestone) {
        const x = X(t.start)
        svg.poly(
          [
            [x, y - 8],
            [x + 8, y],
            [x, y + 8],
            [x - 8, y],
          ],
          { fill: t.crit ? '#e5596b' : THEME.dark },
        )
        svg.text(x + 14, y, t.name, { size: 12 })
      } else {
        const xa = X(t.start)
        const w = Math.max(3, X(t.end) - xa)
        const fill = t.done ? '#c7ccd6' : color
        svg.rect(xa, y - 9, w, 18, { fill, stroke: t.crit ? '#c0392b' : t.active ? THEME.dark : undefined, sw: t.crit || t.active ? 2 : 0 }, 3)
        const tw = textWidth(t.name, 12)
        if (tw + 10 < w) svg.text(xa + w / 2, y, t.name, { anchor: 'middle', size: 12, color: t.done ? THEME.ink : '#ffffff' })
        else if (xa + w + 6 + tw < x0 + chartW + 200) svg.text(xa + w + 6, y, t.name, { size: 12 })
        else svg.text(xa - 6, y, t.name, { anchor: 'end', size: 12 })
      }
      row++
    }
  })
  let W = x0 + chartW + MARGIN
  // labels to the right of the last bars
  for (const t of tasks) W = Math.max(W, X(t.end) + 12 + textWidth(t.name, 12) + MARGIN)
  if (g.title) {
    W = Math.max(W, textWidth(g.title, 16, true) + 2 * MARGIN)
    svg.text(W / 2, MARGIN + 12, g.title, { anchor: 'middle', size: 16, bold: true })
  }
  return { svg: svg.toString(W, H), w: Math.ceil(W), h: Math.ceil(H) }
}

// ---------------------------------------------------------------- mind maps / trees

export interface TreeNode {
  label: string
  shape?: 'rect' | 'round' | 'circle' | 'cloud' | 'hexagon' | 'none'
  side?: 'left' | 'right'
  children: TreeNode[]
}

interface Placed {
  n: TreeNode
  w: number
  h: number
  text: string[]
  x: number
  y: number
  color: string
  depth: number
  kids: Placed[]
  span: number
}

const GAP_X = 44
const GAP_Y = 12

export function renderTree(root: TreeNode, title?: string): Rendered {
  const svg = new Svg()
  const size = (n: TreeNode, depth: number) => {
    const fs = depth === 0 ? 16 : depth === 1 ? 14 : 13
    const text = wrap(n.label.split('\n'), 220, fs, depth === 0)
    const t = measure(text, fs, depth === 0)
    const circle = n.shape === 'circle'
    const d = Math.max(t.w, t.h) + 20
    return { text, w: circle ? d : t.w + (n.shape === 'none' ? 8 : 24), h: circle ? d : t.h + (n.shape === 'none' ? 6 : 14), fs }
  }
  const build = (n: TreeNode, depth: number, color: string): Placed => {
    const s = size(n, depth)
    const kids = n.children.map((c, k) => build(c, depth + 1, depth === 0 ? THEME.series[k % THEME.series.length] : color))
    const span = Math.max(s.h, kids.reduce((a, c) => a + c.span, 0) + Math.max(0, kids.length - 1) * GAP_Y)
    return { n, w: s.w, h: s.h, text: s.text, x: 0, y: 0, color, depth, kids, span }
  }
  const top = build(root, 0, THEME.dark)
  // sides: explicit, else balanced by size
  let right: Placed[] = []
  let left: Placed[] = []
  if (top.kids.some((k) => k.n.side)) {
    right = top.kids.filter((k) => k.n.side !== 'left')
    left = top.kids.filter((k) => k.n.side === 'left')
  } else if (top.kids.length > 3) {
    const total = top.kids.reduce((a, k) => a + k.span, 0)
    let acc = 0
    for (const k of top.kids) {
      if (acc < total / 2) right.push(k)
      else left.push(k)
      acc += k.span
    }
  } else right = top.kids
  const place = (p: Placed, x: number, yTop: number, dir: number) => {
    p.x = x
    let y = yTop + (p.span - (p.kids.reduce((a, c) => a + c.span, 0) + Math.max(0, p.kids.length - 1) * GAP_Y)) / 2
    for (const c of p.kids) {
      place(c, x + dir * (p.w / 2 + GAP_X + c.w / 2), y, dir)
      y += c.span + GAP_Y
    }
    p.y = p.kids.length ? (p.kids[0].y + p.kids[p.kids.length - 1].y) / 2 : yTop + p.span / 2
  }
  const sideSpan = (ks: Placed[]) => ks.reduce((a, c) => a + c.span, 0) + Math.max(0, ks.length - 1) * GAP_Y
  const spanR = sideSpan(right)
  const spanL = sideSpan(left)
  const height = Math.max(top.h, spanR, spanL)
  let y = (height - spanR) / 2
  for (const c of right) {
    place(c, top.w / 2 + GAP_X + c.w / 2, y, 1)
    y += c.span + GAP_Y
  }
  y = (height - spanL) / 2
  for (const c of left) {
    place(c, -(top.w / 2 + GAP_X + c.w / 2), y, -1)
    y += c.span + GAP_Y
  }
  top.x = 0
  top.y = height / 2
  // bounds
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const all: Placed[] = []
  const walk = (p: Placed) => {
    all.push(p)
    minX = Math.min(minX, p.x - p.w / 2)
    maxX = Math.max(maxX, p.x + p.w / 2)
    minY = Math.min(minY, p.y - p.h / 2)
    maxY = Math.max(maxY, p.y + p.h / 2)
    p.kids.forEach(walk)
  }
  walk(top)
  const titleH = title ? 36 : 0
  const ox = MARGIN - minX
  const oy = MARGIN + titleH - minY
  const P = (p: Placed): Pt => ({ x: p.x + ox, y: p.y + oy })
  for (const p of all) {
    for (const c of p.kids) {
      const a = P(p)
      const b = P(c)
      const dir = Math.sign(b.x - a.x) || 1
      const s = { x: a.x + (dir * p.w) / 2, y: a.y }
      const t = { x: b.x - (dir * c.w) / 2, y: b.y }
      const m = (s.x + t.x) / 2
      svg.path(pathData([{ c: 'M', p: [s] }, { c: 'C', p: [{ x: m, y: s.y }, { x: m, y: t.y }, t] }]), { stroke: c.color, sw: Math.max(1.2, 3.2 - c.depth * 0.6) })
    }
  }
  for (const p of all) {
    const c = P(p)
    const fs = p.depth === 0 ? 16 : p.depth === 1 ? 14 : 13
    const x = c.x - p.w / 2
    const y = c.y - p.h / 2
    const shape = p.n.shape ?? (p.depth === 0 ? 'round' : 'round')
    const fill = p.depth === 0 ? THEME.dark : p.depth === 1 ? p.color : tint(p.color)
    const ink = p.depth <= 1 ? '#ffffff' : THEME.ink
    if (shape === 'none') {
      svg.line(x, y + p.h, x + p.w, y + p.h, { stroke: p.color, sw: 1.5 })
      svg.text(c.x, c.y, p.text, { anchor: 'middle', size: fs })
      continue
    }
    if (shape === 'circle') svg.circle(c.x, c.y, p.w / 2, { fill, stroke: p.color, sw: 1.2 })
    else if (shape === 'hexagon') {
      const s = p.h / 4
      svg.poly(
        [
          [x + s, y],
          [x + p.w - s, y],
          [x + p.w, c.y],
          [x + p.w - s, y + p.h],
          [x + s, y + p.h],
          [x, c.y],
        ],
        { fill, stroke: p.color, sw: 1.2 },
      )
    } else svg.rect(x, y, p.w, p.h, { fill, stroke: p.depth === 0 ? undefined : p.color, sw: 1.2 }, shape === 'rect' ? 2 : shape === 'cloud' ? p.h / 2 : 8)
    svg.text(c.x, c.y, p.text, { anchor: 'middle', size: fs, bold: p.depth === 0, color: ink })
  }
  let W = maxX - minX + 2 * MARGIN
  const H = maxY - minY + 2 * MARGIN + titleH
  if (title) {
    W = Math.max(W, textWidth(title, 16, true) + 2 * MARGIN)
    svg.text(W / 2, MARGIN + 12, title, { anchor: 'middle', size: 16, bold: true })
  }
  return { svg: svg.toString(W, H), w: Math.ceil(W), h: Math.ceil(H) }
}

/** a light version of a #rrggbb color */
function tint(c: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c)
  if (!m) return '#f1f3f7'
  return '#' + [m[1], m[2], m[3]].map((h) => Math.round(parseInt(h, 16) * 0.22 + 255 * 0.78).toString(16).padStart(2, '0')).join('')
}
