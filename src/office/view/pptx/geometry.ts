/** SVG paths for common DrawingML preset geometries (box-local px). Unknown presets fall back to a rectangle. */
type Adj = Record<string, number> | undefined

const f = (n: number) => +n.toFixed(2)
const poly = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L') + ' Z'
const a = (adj: Adj, name: string, def: number) => (adj?.[name] ?? def) / 100000

function ellipse(w: number, h: number) {
  const rx = w / 2
  const ry = h / 2
  return `M0 ${f(ry)} A${f(rx)} ${f(ry)} 0 1 0 ${f(w)} ${f(ry)} A${f(rx)} ${f(ry)} 0 1 0 0 ${f(ry)} Z`
}

function roundRect(w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2)
  return `M${f(r)} 0 H${f(w - r)} A${f(r)} ${f(r)} 0 0 1 ${f(w)} ${f(r)} V${f(h - r)} A${f(r)} ${f(r)} 0 0 1 ${f(w - r)} ${f(h)} H${f(r)} A${f(r)} ${f(r)} 0 0 1 0 ${f(h - r)} V${f(r)} A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0 Z`
}

function regular(w: number, h: number, n: number, rot = -Math.PI / 2) {
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const t = rot + (i * 2 * Math.PI) / n
    pts.push([w / 2 + (w / 2) * Math.cos(t), h / 2 + (h / 2) * Math.sin(t)])
  }
  return poly(pts)
}

function star(w: number, h: number, n: number, inner: number) {
  const pts: [number, number][] = []
  for (let i = 0; i < n * 2; i++) {
    const t = -Math.PI / 2 + (i * Math.PI) / n
    const r = i % 2 ? inner : 1
    pts.push([w / 2 + (w / 2) * r * Math.cos(t), h / 2 + (h / 2) * r * Math.sin(t)])
  }
  return poly(pts)
}

export const LINE_GEOMS = new Set(['line', 'straightConnector1', 'bentConnector2', 'bentConnector3', 'bentConnector4', 'curvedConnector3', 'curvedConnector2', 'curvedConnector4'])

export function geomPath(geom: string, w: number, h: number, adj: Adj): string {
  const ss = Math.min(w, h)
  switch (geom) {
    case 'ellipse':
    case 'flowChartConnector':
    case 'cloud':
      return ellipse(w, h)
    case 'roundRect':
    case 'flowChartAlternateProcess':
      return roundRect(w, h, ss * a(adj, 'adj', 16667))
    case 'flowChartTerminator':
      return roundRect(w, h, h / 2)
    case 'triangle': {
      const x = w * a(adj, 'adj', 50000)
      return poly([[x, 0], [w, h], [0, h]])
    }
    case 'rtTriangle':
      return poly([[0, 0], [w, h], [0, h]])
    case 'diamond':
    case 'flowChartDecision':
      return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]])
    case 'parallelogram':
    case 'flowChartInputOutput': {
      const o = ss * a(adj, 'adj', 25000)
      return poly([[o, 0], [w, 0], [w - o, h], [0, h]])
    }
    case 'trapezoid': {
      const o = ss * a(adj, 'adj', 25000)
      return poly([[o, 0], [w - o, 0], [w, h], [0, h]])
    }
    case 'pentagon':
      return regular(w, h, 5)
    case 'hexagon': {
      const o = ss * a(adj, 'adj', 25000)
      return poly([[o, 0], [w - o, 0], [w, h / 2], [w - o, h], [o, h], [0, h / 2]])
    }
    case 'heptagon':
      return regular(w, h, 7)
    case 'octagon': {
      const o = ss * a(adj, 'adj', 29289)
      return poly([[o, 0], [w - o, 0], [w, o], [w, h - o], [w - o, h], [o, h], [0, h - o], [0, o]])
    }
    case 'decagon':
      return regular(w, h, 10)
    case 'dodecagon':
      return regular(w, h, 12)
    case 'star4':
      return star(w, h, 4, 0.38)
    case 'star5':
      return star(w, h, 5, 0.38)
    case 'star6':
      return star(w, h, 6, 0.5)
    case 'star8':
      return star(w, h, 8, 0.6)
    case 'star10':
    case 'star12':
    case 'star16':
    case 'star24':
      return star(w, h, Number(geom.slice(4)), 0.7)
    case 'homePlate': {
      const o = ss * a(adj, 'adj', 50000)
      return poly([[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h]])
    }
    case 'chevron': {
      const o = ss * a(adj, 'adj', 50000)
      return poly([[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h], [o, h / 2]])
    }
    case 'rightArrow':
    case 'leftArrow': {
      const t = h * a(adj, 'adj1', 50000)
      const hl = ss * a(adj, 'adj2', 50000)
      const y0 = (h - t) / 2
      const pts: [number, number][] = [[0, y0], [w - hl, y0], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, y0 + t], [0, y0 + t]]
      return poly(geom === 'leftArrow' ? pts.map(([x, y]) => [w - x, y]) : pts)
    }
    case 'upArrow':
    case 'downArrow': {
      const t = w * a(adj, 'adj1', 50000)
      const hl = ss * a(adj, 'adj2', 50000)
      const x0 = (w - t) / 2
      const pts: [number, number][] = [[x0, h], [x0, hl], [0, hl], [w / 2, 0], [w, hl], [x0 + t, hl], [x0 + t, h]]
      return poly(geom === 'downArrow' ? pts.map(([x, y]) => [x, h - y]) : pts)
    }
    case 'leftRightArrow': {
      const t = h * a(adj, 'adj1', 50000)
      const hl = ss * a(adj, 'adj2', 50000)
      const y0 = (h - t) / 2
      return poly([[0, h / 2], [hl, 0], [hl, y0], [w - hl, y0], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, y0 + t], [hl, y0 + t], [hl, h]])
    }
    case 'plus':
    case 'mathPlus': {
      const o = ss * a(adj, 'adj', 25000)
      return poly([[o, 0], [w - o, 0], [w - o, o], [w, o], [w, h - o], [w - o, h - o], [w - o, h], [o, h], [o, h - o], [0, h - o], [0, o], [o, o]])
    }
    case 'snip1Rect': {
      const o = ss * a(adj, 'adj', 16667)
      return poly([[0, 0], [w - o, 0], [w, o], [w, h], [0, h]])
    }
    case 'snip2SameRect': {
      const o = ss * a(adj, 'adj1', 16667)
      return poly([[o, 0], [w - o, 0], [w, o], [w, h], [0, h], [0, o]])
    }
    case 'round1Rect':
    case 'round2SameRect': {
      const r = ss * a(adj, 'adj1', 16667) || ss * a(adj, 'adj', 16667)
      return `M${f(r)} 0 H${f(w - r)} A${f(r)} ${f(r)} 0 0 1 ${f(w)} ${f(r)} V${f(h)} H0 V${f(r)} A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0 Z`
    }
    case 'can':
    case 'flowChartMagneticDisk': {
      const ry = ss * a(adj, 'adj', 25000) / 2
      return `M0 ${f(ry)} A${f(w / 2)} ${f(ry)} 0 0 1 ${f(w)} ${f(ry)} V${f(h - ry)} A${f(w / 2)} ${f(ry)} 0 0 1 0 ${f(h - ry)} Z M0 ${f(ry)} A${f(w / 2)} ${f(ry)} 0 0 0 ${f(w)} ${f(ry)}`
    }
    case 'donut': {
      const t = ss * a(adj, 'adj', 25000)
      return ellipse(w, h) + ` M${f(t)} ${f(h / 2)} A${f(w / 2 - t)} ${f(h / 2 - t)} 0 1 1 ${f(w - t)} ${f(h / 2)} A${f(w / 2 - t)} ${f(h / 2 - t)} 0 1 1 ${f(t)} ${f(h / 2)} Z`
    }
    case 'heart':
      return `M${f(w / 2)} ${f(h * 0.25)} C${f(w / 2)} 0 0 0 0 ${f(h * 0.3)} C0 ${f(h * 0.6)} ${f(w / 2)} ${f(h * 0.8)} ${f(w / 2)} ${f(h)} C${f(w / 2)} ${f(h * 0.8)} ${f(w)} ${f(h * 0.6)} ${f(w)} ${f(h * 0.3)} C${f(w)} 0 ${f(w / 2)} 0 ${f(w / 2)} ${f(h * 0.25)} Z`
    case 'wedgeRectCallout':
    case 'wedgeRoundRectCallout': {
      const tx = w / 2 + w * a(adj, 'adj1', -20833)
      const ty = h / 2 + h * a(adj, 'adj2', 62500)
      return poly([[0, 0], [w, 0], [w, h], [w * 0.58, h], [tx, ty], [w * 0.42, h], [0, h]])
    }
    case 'line':
    case 'straightConnector1':
      return `M0 0 L${f(w)} ${f(h)}`
    case 'bentConnector2':
      return `M0 0 H${f(w)} V${f(h)}`
    case 'bentConnector3': {
      const x = w * a(adj, 'adj1', 50000)
      return `M0 0 H${f(x)} V${f(h)} H${f(w)}`
    }
    case 'bentConnector4':
      return `M0 0 H${f(w / 2)} V${f(h)} H${f(w)}`
    case 'curvedConnector2':
    case 'curvedConnector3':
    case 'curvedConnector4':
      return `M0 0 C${f(w / 2)} 0 ${f(w / 2)} ${f(h)} ${f(w)} ${f(h)}`
    default:
      return `M0 0 H${f(w)} V${f(h)} H0 Z`
  }
}
