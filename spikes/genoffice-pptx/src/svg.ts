/**
 * RenderTree -> SVG emitter (spike-grade): covers shape/picture/text/group/table/chart/chip,
 * solid+gradient+image fills, strokes, connectors with bezier, rotation/flip center pivots.
 * Effects intentionally approximated or skipped: shadow via drop-shadow, pattern->bg color,
 * duotone/lum/clrChange/scene3d skipped.
 */
import type {
  RenderSlide,
  RenderNode,
  RenderFill,
  ShapeRenderNode,
  PictureRenderNode,
  GroupRenderNode,
  TableRenderNode,
  ChartRenderNode,
  GlyphRun,
  RenderTextLayout,
} from '@genoffice/pptx-render'
import { fontStack } from './fonts'

let uid = 0
const nid = () => `g${++uid}`

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

interface FillOut {
  attrs: string
  defs: string
  imageEl?: string // image fill drawn as clipped <image> (needs geometry context)
}

function fillOut(fill: RenderFill | undefined, box: { x: number; y: number; w: number; h: number }): FillOut {
  if (!fill || fill.kind === 'none') return { attrs: 'fill="none"', defs: '' }
  if (fill.kind === 'solid') return { attrs: `fill="${fill.color}"`, defs: '' }
  if (fill.kind === 'gradient') {
    const id = nid()
    const a = (fill.angleDeg * Math.PI) / 180
    // objectBoundingBox line through center along the gradient angle
    const x1 = (0.5 - Math.cos(a) / 2).toFixed(4)
    const y1 = (0.5 - Math.sin(a) / 2).toFixed(4)
    const x2 = (0.5 + Math.cos(a) / 2).toFixed(4)
    const y2 = (0.5 + Math.sin(a) / 2).toFixed(4)
    const stops = fill.stops
      .map((s) => `<stop offset="${(s.pos * 100).toFixed(1)}%" stop-color="${s.color}"/>`)
      .join('')
    const def = fill.radial
      ? (() => {
          const cx = (fill.center?.x ?? 0.5).toFixed(3)
          const cy = (fill.center?.y ?? 0.5).toFixed(3)
          return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="0.75">${stops}</radialGradient>`
        })()
      : `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`
    return { attrs: `fill="url(#${id})"`, defs: def }
  }
  if (fill.kind === 'image' && fill.dataUrl) {
    const id = nid()
    const l = fill.fillRect?.l ?? 0
    const t = fill.fillRect?.t ?? 0
    const r = fill.fillRect?.r ?? 0
    const b = fill.fillRect?.b ?? 0
    const def =
      `<clipPath id="${id}"><rect x="${box.x + box.w * l}" y="${box.y + box.h * t}" ` +
      `width="${box.w * (1 - l - r)}" height="${box.h * (1 - t - b)}"/></clipPath>`
    const alpha = fill.alpha != null ? ` opacity="${fill.alpha}"` : ''
    const img =
      `<image clip-path="url(#${id})" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" ` +
      `preserveAspectRatio="none" href="${fill.dataUrl}"${alpha}/>`
    return { attrs: 'fill="none"', defs: def, imageEl: img }
  }
  if (fill.kind === 'pattern') return { attrs: `fill="${fill.bg}"`, defs: '' }
  return { attrs: 'fill="none"', defs: '' }
}

function strokeAttrs(s: NonNullable<ShapeRenderNode['stroke']>): string {
  let out = `stroke="${s.color}" stroke-width="${Math.max(s.widthPx, 0.4)}"`
  if (s.dash?.length) out += ` stroke-dasharray="${s.dash.join(' ')}"`
  if (s.cap) out += ` stroke-linecap="${s.cap}"`
  if (s.join && s.join !== 'bevel') out += ` stroke-linejoin="${s.join}"`
  return out
}

/** Center-pivot rotation + flip wrapper (OOXML semantics). */
function pivotWrap(box: { centerX: number; centerY: number; rotationDeg: number; flipH?: boolean; flipV: boolean }, inner: string): string {
  const t: string[] = []
  if (box.rotationDeg) t.push(`rotate(${box.rotationDeg.toFixed(2)} ${box.centerX.toFixed(2)} ${box.centerY.toFixed(2)})`)
  if (box.flipH || box.flipV) {
    const sx = box.flipH ? -1 : 1
    const sy = box.flipV ? -1 : 1
    t.push(
      `translate(${box.centerX.toFixed(2)} ${box.centerY.toFixed(2)}) scale(${sx} ${sy}) translate(${(-box.centerX).toFixed(2)} ${(-box.centerY).toFixed(2)})`,
    )
  }
  return t.length ? `<g transform="${t.join(' ')}">${inner}</g>` : inner
}

function shadowStyle(sh: { color: string; blurPx: number; offsetX: number; offsetY: number } | undefined): string {
  if (!sh || sh.inner) return ''
  return ` style="filter:drop-shadow(${sh.offsetX}px ${sh.offsetY}px ${sh.blurPx}px ${sh.color})"`
}

// ── text ──

function glyphRunEl(run: GlyphRun, line: { top: number; height: number }): string {
  const x = run.x.toFixed(2)
  const y = run.baselineY.toFixed(2)
  const parts: string[] = []
  if (run.highlight) {
    // PowerPoint paints the highlight over the full line box (matches reference adapter)
    parts.push(
      `<rect x="${x}" y="${line.top.toFixed(2)}" width="${run.widthPx.toFixed(2)}" height="${line.height.toFixed(2)}" fill="${run.highlight}"/>`,
    )
  }
  let fill = run.color
  if (run.gradient) {
    const id = nid()
    const a = (run.gradient.angleDeg * Math.PI) / 180
    parts.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x}" y1="${y}" x2="${(run.x + Math.cos(a) * run.widthPx).toFixed(2)}" y2="${(y + Math.sin(a) * run.widthPx).toFixed(2)}">` +
        run.gradient.stops.map((s) => `<stop offset="${(s.pos * 100).toFixed(1)}%" stop-color="${s.color}"/>`).join('') +
        `</linearGradient>`,
    )
    fill = `url(#${id})`
  }
  let style = ''
  if (run.shadow) style += `filter:drop-shadow(${run.shadow.offsetX}px ${run.shadow.offsetY}px ${run.shadow.blurPx}px ${run.shadow.color});`
  if (run.outline) {
    // Approximate: paint-order stroke under fill
    style += 'paint-order:stroke;'
  }
  let attrs =
    ` x="${x}" y="${y}"` +
    ` font-family="${esc(fontStack(run.fontFamily))}" font-size="${run.fontSizePx.toFixed(2)}"` +
    ` fill="${fill}"` +
    (run.bold ? ' font-weight="bold"' : '') +
    (run.italic ? ' font-style="italic"' : '') +
    (run.letterSpacingPx ? ` letter-spacing="${run.letterSpacingPx.toFixed(2)}"` : '') +
    (run.rtl ? ' direction="rtl"' : '') +
    (style ? ` style="${style}"` : '')
  if (run.outline) {
    attrs += ` stroke="${run.outline.color}" stroke-width="${run.outline.widthPx.toFixed(2)}"`
  }
  if (run.strike || run.underline) {
    const uy = run.underline ? run.baselineY + run.fontSizePx * 0.12 : run.baselineY - run.fontSizePx * 0.28
    parts.push(
      `<line x1="${x}" y1="${uy.toFixed(2)}" x2="${(run.x + run.widthPx).toFixed(2)}" y2="${uy.toFixed(2)}" stroke="${run.color}" stroke-width="${Math.max(run.fontSizePx * 0.06, 0.6)}"/>`,
    )
  }
  const rot = run.rotate90 ? 90 : run.rotate270 ? -90 : 0
  const text = `<text xml:space="preserve"${attrs}${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ''}>${esc(run.text)}</text>`
  parts.push(text)
  return parts.join('')
}

function textEl(t: RenderTextLayout, box: { x: number; y: number }): string {
  const lines = t.lines
    .map((ln) =>
      ln.runs
        .map((r) => glyphRunEl(r, { top: ln.top, height: ln.height }))
        .join(''),
    )
    .join('')
  return `<g transform="translate(${box.x.toFixed(2)} ${box.y.toFixed(2)})">${lines}</g>`
}

// ── nodes ──

function shapeNodeEl(n: ShapeRenderNode): string {
  const defs: string[] = []
  const fo = fillOut(n.fill, n.box)
  defs.push(fo.defs)
  let geom: string
  if (n.line) {
    // Connector/straight line: points & bezier are box-local absolute coords (matches
    // the reference adapter, which draws them in the box-origin coordinate space).
    const pts = n.line.points
    let d = `M ${pts[0]} ${pts[1]}`
    if (n.line.bezier?.length) {
      const bz = n.line.bezier
      for (let i = 0; i + 5 < bz.length; i += 6) {
        d += ` C ${bz[i]} ${bz[i + 1]} ${bz[i + 2]} ${bz[i + 3]} ${bz[i + 4]} ${bz[i + 5]}`
      }
    } else {
      for (let i = 2; i < pts.length; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`
    }
    const s = n.stroke
    geom = `<path d="${d}" fill="none" ${s ? strokeAttrs(s) : 'stroke="#404040" stroke-width="1"'} stroke-linecap="round" stroke-linejoin="round"/>`
    // Arrowheads: simple triangles oriented along the end segment direction
    const arrowAt = (end: NonNullable<ShapeRenderNode['line']>['tailEnd'], atStart: boolean) => {
      if (!end) return ''
      const n2 = pts.length
      const [ax, ay] = atStart ? [pts[0], pts[1]] : [pts[n2 - 2], pts[n2 - 1]]
      const [bx, by] = atStart
        ? n2 >= 4
          ? [pts[2], pts[3]]
          : [ax + 1, ay]
        : n2 >= 4
          ? [pts[n2 - 4], pts[n2 - 3]]
          : [ax - 1, ay]
      const ang = Math.atan2(ay - by, ax - bx)
      const p = (dx: number, dy: number) =>
        `${(ax + dx * Math.cos(ang) - dy * Math.sin(ang)).toFixed(2)},${(ay + dx * Math.sin(ang) + dy * Math.cos(ang)).toFixed(2)}`
      return `<polygon points="${p(end.lengthPx, 0)} ${p(0, end.widthPx / 2)} ${p(0, -end.widthPx / 2)}" fill="${s?.color ?? '#404040'}"/>`
    }
    geom += arrowAt(n.line.headEnd, true) + arrowAt(n.line.tailEnd, false)
  } else if (n.pathData || n.fillPathData || n.strokePathData) {
    let g = ''
    if (n.fillPathData && n.pathData) g += `<path d="${n.fillPathData}" fill="none"/>`
    const main = n.pathData ?? n.fillPathData ?? ''
    if (main) g += `<path d="${main}" ${fo.attrs} ${n.stroke ? strokeAttrs(n.stroke) : ''}/>`
    if (n.strokePathData)
      g += `<path d="${n.strokePathData}" fill="none" ${n.stroke ? strokeAttrs(n.stroke) : `stroke="#404040" stroke-width="1"`}/>`
    geom = g
  } else if (n.polygonPoints?.length) {
    const pts: string[] = []
    for (let i = 0; i < n.polygonPoints.length; i += 2) pts.push(`${n.polygonPoints[i]},${n.polygonPoints[i + 1]}`)
    geom = `<polygon points="${pts.join(' ')}" ${fo.attrs} ${n.stroke ? strokeAttrs(n.stroke) : ''}/>`
  } else if (n.cornerRadiusPx != null) {
    geom = `<rect x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}" rx="${Math.min(n.cornerRadiusPx, n.box.w / 2, n.box.h / 2).toFixed(2)}" ${fo.attrs} ${n.stroke ? strokeAttrs(n.stroke) : ''}/>`
  } else if (n.presetGeometry === 'ellipse') {
    geom = `<ellipse cx="${(n.box.w / 2).toFixed(2)}" cy="${(n.box.h / 2).toFixed(2)}" rx="${(n.box.w / 2).toFixed(2)}" ry="${(n.box.h / 2).toFixed(2)}" ${fo.attrs} ${n.stroke ? strokeAttrs(n.stroke) : ''}/>`
  } else {
    geom = `<rect x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}" ${fo.attrs} ${n.stroke ? strokeAttrs(n.stroke) : ''}/>`
  }
  // All geometry is box-local; wrap in translate. Glyph runs are content-origin coords
  // (box top-left + insets), matching the reference adapter's insets.l/t + g.x/g.y.
  const t = n.text
  let inner =
    `<g transform="translate(${n.box.x.toFixed(2)} ${n.box.y.toFixed(2)})">${geom}</g>` +
    (t ? textEl(t, { x: n.box.x + t.insets.l, y: n.box.y + t.insets.t }) : '')
  if (fo.imageEl) inner = fo.imageEl + inner // image fill (absolute box coords), stroke geometry above it
  const el = pivotWrap(n.box, inner)
  return `<g${shadowStyle(n.shadow)}>${el}</g>`
}

function pictureNodeEl(n: PictureRenderNode): string {
  const defs: string[] = []
  let inner = ''
  if (n.bgColor) {
    inner += `<rect x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}" fill="${n.bgColor}"/>`
  }
  if (n.fill && n.fill.kind !== 'none') {
    const fo = fillOut(n.fill, n.box)
    defs.push(fo.defs)
    inner += `<rect x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}" ${fo.attrs}/>`
  }
  if (n.dataUrl) {
    const sr = n.srcRect
    const vb = sr
      ? ` viewBox="${sr.l} ${sr.t} ${1 - sr.l - sr.r} ${1 - sr.t - sr.b}"` + ' preserveAspectRatio="none"'
      : ''
    const clipId = nid()
    let clipAttr = ''
    if (n.clip) {
      let shape = ''
      if (n.clip.pathData) shape = `<path d="${n.clip.pathData}"/>`
      else if (n.clip.polygonPoints?.length) {
        const pts: string[] = []
        for (let i = 0; i < n.clip.polygonPoints.length; i += 2) pts.push(`${n.clip.polygonPoints[i]},${n.clip.polygonPoints[i + 1]}`)
        shape = `<polygon points="${pts.join(' ')}"/>`
      } else if (n.clip.cornerRadiusPx != null)
        shape = `<rect x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}" rx="${n.clip.cornerRadiusPx.toFixed(2)}"/>`
      if (shape) {
        defs.push(`<clipPath id="${clipId}">${shape}</clipPath>`)
        clipAttr = ` clip-path="url(#${clipId})"`
      }
    }
    const style = n.softEdgePx ? ` style="filter:blur(${(n.softEdgePx / 2).toFixed(1)}px)"` : ''
    inner += `<g${clipAttr}${style}><svg x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}"${vb}><image x="0" y="0" width="1" height="1" preserveAspectRatio="none" href="${n.dataUrl}"/></svg></g>`
  }
  if (n.stroke) {
    inner += `<rect x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}" fill="none" ${strokeAttrs(n.stroke)}/>`
  }
  const op = n.opacity != null && n.opacity < 1 ? ` opacity="${n.opacity}"` : ''
  // `inner` is box-local (rects at 0,0, crop <svg> at 0,0, clip shapes local), so it must be
  // translated to the box origin before the center-pivot wrap — otherwise every picture
  // lands on the slide origin and overlaps the text column.
  const placed = `<g transform="translate(${n.box.x.toFixed(2)} ${n.box.y.toFixed(2)})">${inner}</g>`
  return `<g${op}>${pivotWrap(n.box, placed)}</g>`
}

function groupNodeEl(n: GroupRenderNode): string {
  const kids = n.children.map(nodeEl).join('')
  const inner = `<g transform="translate(${n.box.x.toFixed(2)} ${n.box.y.toFixed(2)})">${kids}</g>`
  return pivotWrap(n.box, inner)
}

function tableNodeEl(n: TableRenderNode): string {
  const defs: string[] = []
  let inner = ''
  if (n.bgFill && n.bgFill.kind !== 'none') {
    const fo = fillOut(n.bgFill, n.box)
    defs.push(fo.defs)
    inner += `<rect x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}" ${fo.attrs}/>`
  }
  for (const c of n.cells) {
    const fo = fillOut(c.fill, c)
    defs.push(fo.defs)
    inner += `<rect x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" width="${c.w.toFixed(2)}" height="${c.h.toFixed(2)}" ${fo.attrs}/>`
    for (const side of ['l', 'r', 't', 'b'] as const) {
      const b = c.borders?.[side]
      if (!b) continue
      const d =
        side === 'l'
          ? `M ${c.x} ${c.y} L ${c.x} ${c.y + c.h}`
          : side === 'r'
            ? `M ${c.x + c.w} ${c.y} L ${c.x + c.w} ${c.y + c.h}`
            : side === 't'
              ? `M ${c.x} ${c.y} L ${c.x + c.w} ${c.y}`
              : `M ${c.x} ${c.y + c.h} L ${c.x + c.w} ${c.y + c.h}`
      inner += `<path d="${d}" fill="none" ${strokeAttrs(b)}/>`
    }
    if (c.text) inner += textEl(c.text, { x: c.x, y: c.y })
  }
  return `<g transform="translate(${n.box.x.toFixed(2)} ${n.box.y.toFixed(2)})">${inner}</g>`
}

function chartNodeEl(n: ChartRenderNode): string {
  const defs: string[] = []
  let inner = ''
  if (n.bgFill && n.bgFill.kind !== 'none') {
    const fo = fillOut(n.bgFill, n.box)
    defs.push(fo.defs)
    inner += `<rect x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}" ${fo.attrs}/>`
  }
  if (n.plotRect) {
    const pr = n.plotRect
    const fo = fillOut(pr.fill, pr)
    defs.push(fo.defs)
    inner += `<rect x="${pr.x}" y="${pr.y}" width="${pr.w}" height="${pr.h}" ${fo.attrs}${pr.borderColor ? ` stroke="${pr.borderColor}" stroke-width="${pr.borderWidthPx ?? 1}"` : ''}/>`
  }
  for (const g of [...n.gridLines, ...n.axisLines]) {
    inner += `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="${g.color}" stroke-width="${g.widthPx ?? 0.6}"/>`
  }
  for (const b of n.bars) inner += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${b.color}"/>`
  for (const w of n.wedges ?? []) {
    const a0 = ((w.startDeg - 90) * Math.PI) / 180
    const a1 = ((w.startDeg + w.sweepDeg - 90) * Math.PI) / 180
    const large = w.sweepDeg > 180 ? 1 : 0
    const x0 = w.cx + w.outerR * Math.cos(a0)
    const y0 = w.cy + w.outerR * Math.sin(a0)
    const x1 = w.cx + w.outerR * Math.cos(a1)
    const y1 = w.cy + w.outerR * Math.sin(a1)
    let d: string
    if (w.innerR > 0) {
      const ix1 = w.cx + w.innerR * Math.cos(a1)
      const iy1 = w.cy + w.innerR * Math.sin(a1)
      const ix0 = w.cx + w.innerR * Math.cos(a0)
      const iy0 = w.cy + w.innerR * Math.sin(a0)
      d = `M ${x0} ${y0} A ${w.outerR} ${w.outerR} 0 ${large} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${w.innerR} ${w.innerR} 0 ${large} 0 ${ix0} ${iy0} Z`
    } else {
      d = `M ${w.cx} ${w.cy} L ${x0} ${y0} A ${w.outerR} ${w.outerR} 0 ${large} 1 ${x1} ${y1} Z`
    }
    inner += `<path d="${d}" fill="${w.noFill ? 'none' : w.color}" stroke="${w.stroke ?? '#fff'}" stroke-width="${w.strokeWidthPx ?? 0.5}"/>`
  }
  for (const p of n.polylines) {
    const pts: string[] = []
    for (let i = 0; i < p.points.length; i += 2) pts.push(`${p.points[i]},${p.points[i + 1]}`)
    inner += `<polyline points="${pts.join(' ')}" fill="${p.fill ?? 'none'}" stroke="${p.color}" stroke-width="${p.widthPx}"/>`
  }
  for (const p of n.paths ?? []) inner += `<path d="${p.d}" fill="${p.fill}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.strokeWidthPx ?? 1}"` : ''}/>`
  for (const m of n.markers) inner += `<circle cx="${m.x}" cy="${m.y}" r="${m.r}" fill="${m.color}"/>`
  for (const s of n.swatches) inner += `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${s.color}"/>`
  for (const l of n.labels) {
    inner += `<text x="${l.x}" y="${l.y + l.fontSizePx}" font-size="${l.fontSizePx}" fill="${l.color}"${l.bold ? ' font-weight="bold"' : ''}${l.fontFamily ? ` font-family="${esc(fontStack(l.fontFamily))}"` : ''}${l.rotationDeg ? ` transform="rotate(${l.rotationDeg} ${l.x} ${l.y})"` : ''}>${esc(l.text)}</text>`
  }
  return `<g transform="translate(${n.box.x.toFixed(2)} ${n.box.y.toFixed(2)})">${inner}</g>`
}

function nodeEl(n: RenderNode): string {
  switch (n.type) {
    case 'shape':
    case 'text':
      return shapeNodeEl(n)
    case 'picture':
      return pictureNodeEl(n)
    case 'group':
      return groupNodeEl(n)
    case 'table':
      return tableNodeEl(n)
    case 'chart':
      return chartNodeEl(n)
    case 'placeholder-chip': {
      const { x, y, w, h } = n.box
      return (
        `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#8a8a8a" stroke-dasharray="4 3"/>` +
        `<text x="${x + 8}" y="${y + 20}" font-size="12" fill="#8a8a8a">[${esc(n.label)}]</text></g>`
      )
    }
  }
}

export function renderSlideSvg(s: RenderSlide): string {
  uid = 0
  const defs: string[] = []
  let body = ''
  const bf = fillOut(s.background, { x: 0, y: 0, w: s.widthPx, h: s.heightPx })
  defs.push(bf.defs)
  if (s.background.kind !== 'none') {
    body += `<rect x="0" y="0" width="${s.widthPx}" height="${s.heightPx}" ${bf.attrs}/>`
  }
  if (bf.imageEl) body += bf.imageEl
  for (const n of s.nodes) body += nodeEl(n)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s.widthPx}" height="${s.heightPx}" viewBox="0 0 ${s.widthPx} ${s.heightPx}">` +
    (defs.some((d) => d) ? `<defs>${defs.join('')}</defs>` : '') +
    body +
    `</svg>`
  )
}
