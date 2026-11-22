/**
 * Node-and-edge diagrams (flowcharts, class, state, ER, use case, component diagrams, Graphviz graphs): the model the
 * parsers build, node sizes and shapes, and the picture from the layered layout.
 */
import { layered, type EdgeGeom, type LCluster, type LEdge, type LNode, type Seg } from './layout'
import { DiagramError, lineHeight, measure, pathData, Svg, textWidth, THEME, wrap, type Pt } from './svg'

export type Dir = 'TB' | 'BT' | 'LR' | 'RL'

export type Shape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'circle'
  | 'doublecircle'
  | 'ellipse'
  | 'diamond'
  | 'hexagon'
  | 'lean-r'
  | 'lean-l'
  | 'trap-b'
  | 'trap-t'
  | 'flag'
  | 'note'
  | 'folder'
  | 'component'
  | 'box3d'
  | 'cloud'
  | 'octagon'
  | 'triangle'
  | 'actor'
  | 'start'
  | 'end'
  | 'bar'
  | 'point'
  | 'none'

export type Head = 'none' | 'arrow' | 'open' | 'triangle' | 'diamond' | 'odiamond' | 'circle' | 'ocircle' | 'cross' | 'one' | 'zero-one' | 'one-many' | 'zero-many' | 'many'

export interface NodeStyle {
  fill?: string
  stroke?: string
  color?: string
  dash?: string
  sw?: number
  bold?: boolean
  italic?: boolean
  hidden?: boolean
}

/** A compartment of a class / entity / record box: rows of cells (cells line up in columns) */
export interface Section {
  rows: string[][]
  bold?: boolean
  italic?: boolean
  center?: boolean
}

export interface GNode {
  id: string
  label: string
  shape: Shape
  style?: NodeStyle
  sections?: Section[]
  cluster?: string
}

export interface GEdge {
  from: string
  to: string
  label?: string
  head?: Head
  tail?: Head
  line?: 'solid' | 'dashed' | 'dotted' | 'thick' | 'hidden'
  minlen?: number
  headLabel?: string
  tailLabel?: string
  color?: string
  sw?: number
}

export interface GCluster {
  id: string
  label: string
  parent?: string
  style?: NodeStyle
}

export interface Graph {
  dir: Dir
  nodes: GNode[]
  edges: GEdge[]
  clusters: GCluster[]
  sameRank?: string[][]
  title?: string
}

export interface Rendered {
  svg: string
  w: number
  h: number
}

/** Builds a graph: nodes are created on first mention and refined by later ones. */
export class GraphBuilder {
  readonly g: Graph
  private byId = new Map<string, GNode>()
  private clusterIds = new Map<string, GCluster>()

  constructor(dir: Dir = 'TB', private defShape: Shape = 'rect') {
    this.g = { dir, nodes: [], edges: [], clusters: [] }
  }

  has(id: string) {
    return this.byId.has(id)
  }

  get(id: string) {
    return this.byId.get(id)
  }

  node(id: string, patch: Partial<GNode> = {}, cluster?: string): GNode {
    let n = this.byId.get(id)
    if (!n) {
      n = { id, label: id, shape: this.defShape, cluster }
      this.byId.set(id, n)
      this.g.nodes.push(n)
    }
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (n as unknown as Record<string, unknown>)[k] = v
    return n
  }

  edge(e: GEdge, cluster?: string): GEdge {
    if (!this.clusterIds.has(e.from)) this.node(e.from, {}, cluster)
    if (!this.clusterIds.has(e.to)) this.node(e.to, {}, cluster)
    this.g.edges.push(e)
    return e
  }

  cluster(id: string, label: string, parent?: string): GCluster {
    let c = this.clusterIds.get(id)
    if (!c) {
      c = { id, label, parent }
      this.clusterIds.set(id, c)
      this.g.clusters.push(c)
    } else if (label) c.label = label
    // a node of that name (mentioned before) is the cluster
    const n = this.byId.get(id)
    if (n) {
      this.byId.delete(id)
      this.g.nodes.splice(this.g.nodes.indexOf(n), 1)
    }
    return c
  }

  isCluster(id: string) {
    return this.clusterIds.has(id)
  }
}

// ---------------------------------------------------------------- sizes

const SIZE = 14
const SMALL = 13
const PX = 14
const PY = 9
const LH = lineHeight(SIZE)

const lines = (s: string) => s.split('\n')
const r = (v: number) => Math.round(v * 100) / 100

interface Box {
  w: number
  h: number
  text: string[]
}

function sectionSize(s: Section): { w: number; h: number; cols: number[] } {
  const cols: number[] = []
  for (const row of s.rows) row.forEach((c, k) => (cols[k] = Math.max(cols[k] ?? 0, textWidth(c, SMALL, s.bold))))
  const w = cols.reduce((a, b) => a + b, 0) + Math.max(0, cols.length - 1) * 12
  return { w, h: s.rows.length ? s.rows.length * lineHeight(SMALL) + 10 : 8, cols }
}

function nodeBox(n: GNode, dir: Dir): Box {
  const text = n.shape === 'none' || n.label === '' ? lines(n.label) : wrap(lines(n.label), 260, SIZE, n.style?.bold)
  const t = n.label === '' ? { w: 0, h: 0 } : measure(text, SIZE, n.style?.bold)
  const across = dir === 'TB' || dir === 'BT'
  if (n.sections?.length) {
    const ss = n.sections.map(sectionSize)
    return { w: Math.max(90, ...ss.map((s) => s.w + 2 * PX)), h: ss.reduce((a, s) => a + s.h, 0), text }
  }
  const tw = t.w + 2 * PX
  const th = t.h + 2 * PY
  switch (n.shape) {
    case 'start':
      return { w: 20, h: 20, text: [] }
    case 'end':
      return { w: 22, h: 22, text: [] }
    case 'point':
      return { w: 8, h: 8, text: [] }
    case 'bar':
      return across ? { w: 80, h: 7, text: [] } : { w: 7, h: 80, text: [] }
    case 'none':
      return { w: t.w + 8, h: t.h + 6, text }
    case 'circle': {
      const d = Math.max(t.w, t.h) + 2 * PY + 4
      return { w: d, h: d, text }
    }
    case 'doublecircle': {
      const d = Math.max(t.w, t.h) + 2 * PY + 14
      return { w: d, h: d, text }
    }
    case 'ellipse':
      return { w: Math.max(50, (t.w + PX) * 1.42), h: Math.max(36, (t.h + PY) * 1.42), text }
    case 'diamond': {
      const w = tw + th / 0.6
      return { w, h: 0.6 * w, text }
    }
    case 'stadium':
      return { w: t.w + th + PX, h: th, text }
    case 'hexagon':
    case 'octagon':
      return { w: tw + th / 2, h: th, text }
    case 'lean-r':
    case 'lean-l':
      return { w: tw + th / 2, h: th, text }
    case 'trap-b':
    case 'trap-t':
      return { w: tw + th * 0.7, h: th, text }
    case 'flag':
      return { w: tw + th / 3, h: th, text }
    case 'cylinder':
      return { w: Math.max(tw, 50), h: th + 16, text }
    case 'subroutine':
    case 'component':
      return { w: tw + 16, h: th, text }
    case 'note':
    case 'folder':
      return { w: tw + 8, h: th + (n.shape === 'folder' ? 8 : 0), text }
    case 'box3d':
      return { w: tw + 8, h: th + 8, text }
    case 'triangle':
      return { w: tw * 1.6, h: th * 1.7, text }
    case 'actor':
      return { w: Math.max(36, t.w + 8), h: 46 + t.h, text }
    default:
      return { w: Math.max(tw, 40), h: th, text }
  }
}

// ---------------------------------------------------------------- shapes

function nodePaint(n: GNode) {
  const s = n.style ?? {}
  const p = { fill: s.fill ?? THEME.fill, stroke: s.stroke ?? THEME.stroke, sw: s.sw ?? 1.3, dash: s.dash }
  return p
}

function drawNode(svg: Svg, n: GNode, b: Box, cx: number, cy: number) {
  const { w, h } = b
  const x = cx - w / 2
  const y = cy - h / 2
  const p = nodePaint(n)
  const color = n.style?.color ?? THEME.ink
  const txt = (tx = cx, ty = cy) => svg.text(tx, ty, b.text, { anchor: 'middle', color, bold: n.style?.bold, italic: n.style?.italic })
  const poly = (pts: [number, number][]) => svg.poly(pts, p)
  switch (n.shape) {
    case 'start':
      svg.circle(cx, cy, w / 2, { fill: n.style?.fill ?? THEME.dark })
      return
    case 'end':
      svg.circle(cx, cy, w / 2, { fill: '#ffffff', stroke: n.style?.stroke ?? THEME.dark, sw: 1.5 }).circle(cx, cy, w / 2 - 4, { fill: n.style?.fill ?? THEME.dark })
      return
    case 'point':
      svg.circle(cx, cy, w / 2, { fill: n.style?.fill ?? THEME.dark })
      return
    case 'bar':
      svg.rect(x, y, w, h, { fill: n.style?.fill ?? THEME.dark }, 2)
      return
    case 'none':
      return void txt()
    case 'round':
      svg.rect(x, y, w, h, p, 6)
      break
    case 'stadium':
      svg.rect(x, y, w, h, p, h / 2)
      break
    case 'subroutine':
      svg.rect(x, y, w, h, p).line(x + 8, y, x + 8, y + h, p).line(x + w - 8, y, x + w - 8, y + h, p)
      break
    case 'component':
      svg.rect(x + 6, y, w - 6, h, p)
      svg.rect(x, y + h / 2 - 11, 12, 7, p).rect(x, y + h / 2 + 4, 12, 7, p)
      return void txt(cx + 4)
    case 'cylinder': {
      const ry = 7
      svg.path(`M${r(x)} ${r(y + ry)} A${r(w / 2)} ${ry} 0 0 1 ${r(x + w)} ${r(y + ry)} L${r(x + w)} ${r(y + h - ry)} A${r(w / 2)} ${ry} 0 0 1 ${r(x)} ${r(y + h - ry)} Z`, p)
      svg.path(`M${r(x)} ${r(y + ry)} A${r(w / 2)} ${ry} 0 0 0 ${r(x + w)} ${r(y + ry)}`, { ...p, fill: 'none' })
      return void txt(cx, cy + ry / 2)
    }
    case 'circle':
      svg.circle(cx, cy, w / 2, p)
      break
    case 'doublecircle':
      svg.circle(cx, cy, w / 2, p).circle(cx, cy, w / 2 - 5, { ...p, fill: 'none' })
      break
    case 'ellipse':
      svg.ellipse(cx, cy, w / 2, h / 2, p)
      break
    case 'diamond':
      poly([
        [cx, y],
        [x + w, cy],
        [cx, y + h],
        [x, cy],
      ])
      break
    case 'hexagon': {
      const s = h / 4
      poly([
        [x + s, y],
        [x + w - s, y],
        [x + w, cy],
        [x + w - s, y + h],
        [x + s, y + h],
        [x, cy],
      ])
      break
    }
    case 'octagon': {
      const s = h / 4
      poly([
        [x + s, y],
        [x + w - s, y],
        [x + w, y + s],
        [x + w, y + h - s],
        [x + w - s, y + h],
        [x + s, y + h],
        [x, y + h - s],
        [x, y + s],
      ])
      break
    }
    case 'lean-r':
    case 'lean-l': {
      const s = h / 2
      const rt = n.shape === 'lean-r'
      poly([
        [rt ? x + s : x, y],
        [rt ? x + w : x + w - s, y],
        [rt ? x + w - s : x + w, y + h],
        [rt ? x : x + s, y + h],
      ])
      break
    }
    case 'trap-b':
    case 'trap-t': {
      const s = h * 0.35
      const b2 = n.shape === 'trap-b'
      poly([
        [b2 ? x + s : x, y],
        [b2 ? x + w - s : x + w, y],
        [b2 ? x + w : x + w - s, y + h],
        [b2 ? x : x + s, y + h],
      ])
      break
    }
    case 'flag': {
      const s = h / 3
      poly([
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
        [x + s, cy],
      ])
      return void txt(cx + s / 2)
    }
    case 'note': {
      const f = 10
      poly([
        [x, y],
        [x + w - f, y],
        [x + w, y + f],
        [x + w, y + h],
        [x, y + h],
      ])
      svg.poly(
        [
          [x + w - f, y],
          [x + w - f, y + f],
          [x + w, y + f],
        ],
        { ...p, fill: 'none' },
        false,
      )
      break
    }
    case 'folder':
      svg.rect(x, y, Math.min(w * 0.4, 40), 10, p, 2).rect(x, y + 8, w, h - 8, p)
      return void txt(cx, cy + 4)
    case 'box3d':
      poly([
        [x, y + 8],
        [x + 8, y],
        [x + w, y],
        [x + w, y + h - 8],
        [x + w - 8, y + h],
        [x, y + h],
      ])
      svg.poly(
        [
          [x, y + 8],
          [x + w - 8, y + 8],
          [x + w, y],
        ],
        { ...p, fill: 'none' },
        false,
      ).line(x + w - 8, y + 8, x + w - 8, y + h, p)
      return void txt(cx - 4, cy + 4)
    case 'cloud':
      svg.rect(x, y, w, h, p, Math.min(h / 2, 20))
      break
    case 'triangle':
      poly([
        [cx, y],
        [x + w, y + h],
        [x, y + h],
      ])
      return void txt(cx, cy + h / 6)
    case 'actor': {
      const s = { fill: 'none', stroke: n.style?.stroke ?? THEME.dark, sw: 1.5 }
      const top = y + 2
      svg.circle(cx, top + 7, 7, { ...s, fill: n.style?.fill ?? THEME.fill })
      svg.line(cx, top + 14, cx, top + 28, s).line(cx - 11, top + 19, cx + 11, top + 19, s)
      svg.line(cx, top + 28, cx - 9, top + 40, s).line(cx, top + 28, cx + 9, top + 40, s)
      svg.text(cx, top + 44 + (b.text.length * LH) / 2, b.text, { anchor: 'middle', color })
      return
    }
    default:
      if (n.sections?.length) return drawSections(svg, n, x, y, w)
      svg.rect(x, y, w, h, p)
  }
  txt()
}

function drawSections(svg: Svg, n: GNode, x: number, y: number, w: number) {
  const p = nodePaint(n)
  const ss = n.sections!.map(sectionSize)
  const total = ss.reduce((a, s) => a + s.h, 0)
  svg.rect(x, y, w, total, p, n.shape === 'round' ? 6 : 0)
  let top = y
  n.sections!.forEach((s, k) => {
    if (k) svg.line(x, top, x + w, top, { stroke: p.stroke, sw: 1 })
    const lh = lineHeight(SMALL)
    s.rows.forEach((row, r) => {
      const ty = top + 5 + r * lh + lh / 2
      if (s.center || (row.length === 1 && k === 0)) {
        svg.text(x + w / 2, ty, row.join(' '), { anchor: 'middle', size: SMALL, bold: s.bold, italic: s.italic, color: n.style?.color })
        return
      }
      let cx = x + PX
      row.forEach((c, j) => {
        svg.text(cx, ty, c, { size: SMALL, bold: s.bold, italic: s.italic, color: n.style?.color })
        cx += ss[k].cols[j] + 12
      })
    })
    top += ss[k].h
  })
}

// ---------------------------------------------------------------- edges

const HEAD_LEN: Partial<Record<Head, number>> = { arrow: 10, triangle: 13, diamond: 15, odiamond: 15, circle: 8, ocircle: 8 }

function unit(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l = Math.hypot(dx, dy) || 1
  return { x: dx / l, y: dy / l }
}

/** marker at `p`, `d` the direction the edge arrives in */
function drawHead(svg: Svg, head: Head, p: Pt, d: Pt, col: string) {
  const nx = -d.y
  const ny = d.x
  const at = (back: number, side: number): [number, number] => [p.x - d.x * back + nx * side, p.y - d.y * back + ny * side]
  const line = (a: [number, number], b: [number, number]) => svg.line(a[0], a[1], b[0], b[1], { stroke: col, sw: 1.3 })
  switch (head) {
    case 'arrow':
      svg.poly([at(0, 0), at(10, 4.5), at(10, -4.5)], { fill: col, stroke: col, sw: 1 })
      break
    case 'open':
      svg.poly([at(10, 5), at(0, 0), at(10, -5)], { stroke: col, sw: 1.4 }, false)
      break
    case 'triangle':
      svg.poly([at(0, 0), at(13, 7), at(13, -7)], { fill: '#ffffff', stroke: col, sw: 1.2 })
      break
    case 'diamond':
    case 'odiamond':
      svg.poly([at(0, 0), at(7.5, 5), at(15, 0), at(7.5, -5)], { fill: head === 'diamond' ? col : '#ffffff', stroke: col, sw: 1.2 })
      break
    case 'circle':
    case 'ocircle': {
      const [cx, cy] = at(4, 0)
      svg.circle(cx, cy, 4, { fill: head === 'circle' ? col : '#ffffff', stroke: col, sw: 1.2 })
      break
    }
    case 'cross':
      line(at(1, 5), at(11, -5))
      line(at(1, -5), at(11, 5))
      break
    case 'one':
    case 'zero-one':
    case 'one-many':
    case 'zero-many':
    case 'many': {
      const many = head.endsWith('many')
      if (many) {
        line(at(0, 7), at(12, 0))
        line(at(0, -7), at(12, 0))
      }
      if (head === 'one' || head === 'one-many') line(at(many ? 16 : 7, 6), at(many ? 16 : 7, -6))
      if (head === 'one') line(at(12, 6), at(12, -6))
      if (head === 'zero-one' || head === 'zero-many') {
        const [cx, cy] = at(many ? 20 : 17, 0)
        svg.circle(cx, cy, 4.5, { fill: '#ffffff', stroke: col, sw: 1.2 })
      }
      if (head === 'zero-one') line(at(7, 6), at(7, -6))
      break
    }
  }
}

/** shortens the path at its end by `len` along the arriving direction */
function trimEnd(start: Pt, segs: Seg[], len: number): Pt {
  const last = segs[segs.length - 1]
  const end = last.p[last.p.length - 1]
  const prev = last.c === 'C' ? last.p[1] : segs.length > 1 ? segs[segs.length - 2].p[segs[segs.length - 2].p.length - 1] : start
  const d = unit(prev, end)
  if (len) {
    const q = { x: end.x - d.x * len, y: end.y - d.y * len }
    last.p[last.p.length - 1] = q
    if (last.c === 'C') {
      const c2 = { x: last.p[1].x - d.x * Math.min(len, 6), y: last.p[1].y - d.y * Math.min(len, 6) }
      // a short last piece: the control point stays ahead of the first one, or the curve would loop back
      const k = Math.min(0, (c2.x - last.p[0].x) * d.x + (c2.y - last.p[0].y) * d.y)
      last.p[1] = { x: c2.x - d.x * k, y: c2.y - d.y * k }
    }
  }
  return d
}

function edgeColor(e: GEdge) {
  return e.color ?? THEME.line
}

// ---------------------------------------------------------------- render

const MARGIN = 16

const MAX_NODES = 3000
const MAX_EDGES = 6000

export function renderGraph(g: Graph): Rendered {
  if (!g.nodes.length) throw new DiagramError('The diagram has no nodes')
  if (g.nodes.length > MAX_NODES || g.edges.length > MAX_EDGES) throw new DiagramError(`The diagram is too large to draw (${g.nodes.length} nodes, ${g.edges.length} edges)`)
  const dir = g.dir
  const across = dir === 'TB' || dir === 'BT'
  const svg = new Svg()
  // edges to a cluster go to one of its nodes
  const clusterIdx = new Map(g.clusters.map((c, k) => [c.id, k]))
  const nodeIdx = new Map(g.nodes.map((n, k) => [n.id, k]))
  const parentOf = (c: number) => (g.clusters[c].parent !== undefined ? clusterIdx.get(g.clusters[c].parent!) ?? -1 : -1)
  const inCluster = (v: number, c: number) => {
    for (let k = g.nodes[v].cluster !== undefined ? clusterIdx.get(g.nodes[v].cluster!) ?? -1 : -1; k >= 0; k = parentOf(k)) if (k === c) return true
    return false
  }
  /** an edge's end: its node, or for a cluster the member it is laid out to (the first one entering, the last leaving) */
  const resolve = (id: string, leaving: boolean): number => {
    const v = nodeIdx.get(id)
    if (v !== undefined) return v
    const c = clusterIdx.get(id)
    if (c === undefined) return -1
    if (!leaving) return g.nodes.findIndex((_, k) => inCluster(k, c))
    for (let k = g.nodes.length - 1; k >= 0; k--) if (inCluster(k, c)) return k
    return -1
  }

  const boxes = g.nodes.map((n) => nodeBox(n, dir))
  const edges = g.edges
    .map((e) => ({ e, v: resolve(e.from, true), w: resolve(e.to, false), cv: nodeIdx.has(e.from) ? -1 : clusterIdx.get(e.from) ?? -1, cw: nodeIdx.has(e.to) ? -1 : clusterIdx.get(e.to) ?? -1 }))
    .filter((x) => x.v >= 0 && x.w >= 0)
  const labelled = edges.some((x) => x.e.label)
  const lab = (s: string | undefined) => (s ? measure(lines(s), SMALL) : undefined)
  const loops = new Map<number, number>()
  for (const { e, v, w } of edges) {
    if (v !== w) continue
    const l = lab(e.label)
    loops.set(v, Math.max(loops.get(v) ?? 0, 40 + (l ? (across ? l.w : l.h) + 6 : 0)))
  }
  const lnodes: LNode[] = g.nodes.map((n, k) => {
    const b = boxes[k]
    const c = n.cluster !== undefined ? clusterIdx.get(n.cluster) ?? -1 : -1
    const spread = !!n.sections?.length || SPREAD.has(n.shape)
    return across ? { w: b.w, h: b.h, cluster: c, loop: loops.get(k), spread } : { w: b.h, h: b.w, cluster: c, loop: loops.get(k), spread }
  })
  const ledges: LEdge[] = edges.map(({ e, v, w }) => {
    const l = lab(e.label)
    const pad = l ? { w: l.w + 8, h: l.h + 4 } : undefined
    return {
      v,
      w,
      minlen: (e.minlen ?? 1) * (labelled ? 2 : 1),
      weight: 1,
      label: pad ? (across ? pad : { w: pad.h, h: pad.w }) : undefined,
    }
  })
  const TITLE_H = 22
  const lclusters: LCluster[] = g.clusters.map((c, k) => {
    const t = c.label ? measure(lines(c.label), SMALL, true) : { w: 0, h: 0 }
    const top = 12 + (c.label ? t.h + 6 : 0)
    const side = 12
    // [cross start, cross end, rank start, rank end] in layout space
    const pad: [number, number, number, number] =
      dir === 'TB' ? [side, side, top, side] : dir === 'BT' ? [side, side, side, top] : dir === 'LR' ? [top, side, side, side] : [top, side, side, side]
    return { parent: parentOf(k), pad, minW: across ? t.w + 2 * side : t.h + top + side }
  })
  const same = g.sameRank?.map((grp) => grp.map((id) => nodeIdx.get(id)).filter((v): v is number => v !== undefined)).filter((grp) => grp.length > 1)
  const out = layered(lnodes, ledges, lclusters, {
    nodesep: across ? 40 : 28,
    ranksep: (across ? 50 : 60) / (labelled ? 2 : 1),
    edgesep: 14,
    sameRank: same,
  })

  // layout space → picture
  const titleH = g.title ? TITLE_H + 10 : 0
  const LW = out.w
  const LH2 = out.h
  const tr = (p: Pt): Pt => {
    const q = dir === 'TB' ? p : dir === 'BT' ? { x: p.x, y: LH2 - p.y } : dir === 'LR' ? { x: p.y, y: p.x } : { x: LH2 - p.y, y: p.x }
    return { x: q.x + MARGIN, y: q.y + MARGIN + titleH }
  }
  let W = (across ? LW : LH2) + 2 * MARGIN
  const H = (across ? LH2 : LW) + 2 * MARGIN + titleH

  // clusters, outermost first
  const depth = (k: number) => {
    let d = 0
    for (let c = parentOf(k); c >= 0; c = parentOf(c)) d++
    return d
  }
  const order = g.clusters.map((_, k) => k).sort((a, b) => depth(a) - depth(b))
  const clusterBox: ({ x: number; y: number; w: number; h: number } | null)[] = g.clusters.map(() => null)
  // cluster titles go over the edges that cross them
  const titles: { x: number; y: number; text: string[]; color: string; bg: string }[] = []
  for (const k of order) {
    const b = out.clusters[k]
    if (!b) continue
    const c = g.clusters[k]
    const a = tr({ x: b.x, y: b.y })
    const z = tr({ x: b.x + b.w, y: b.y + b.h })
    const x0 = Math.min(a.x, z.x)
    const y0 = Math.min(a.y, z.y)
    const cw = Math.abs(z.x - a.x)
    const ch = Math.abs(z.y - a.y)
    const st = c.style ?? {}
    clusterBox[k] = { x: x0, y: y0, w: cw, h: ch }
    svg.rect(x0, y0, cw, ch, { fill: st.fill ?? THEME.cluster, stroke: st.stroke ?? THEME.clusterStroke, sw: st.sw ?? 1, dash: st.dash }, 4)
    if (c.label) {
      const t = lines(c.label)
      const top = dir === 'BT' ? y0 + ch - 8 - (t.length * lineHeight(SMALL)) / 2 : y0 + 8 + (t.length * lineHeight(SMALL)) / 2
      titles.push({ x: x0 + cw / 2, y: top, text: t, color: st.color ?? THEME.ink, bg: st.fill && st.fill !== 'none' ? st.fill : THEME.cluster })
    }
  }

  // edges
  const labels: { p: Pt; text: string[]; color?: string; plain?: boolean }[] = []
  edges.forEach(({ e, v }, i) => {
    if (e.line === 'hidden') return
    const col = edgeColor(e)
    const paint = { stroke: col, sw: e.sw ?? (e.line === 'thick' ? 3 : 1.4), dash: e.line === 'dashed' ? '6 4' : e.line === 'dotted' ? '2 3' : undefined }
    const geom = out.edges[i]
    if (!geom) {
      if (edges[i].v !== edges[i].w) return
      // self loop, on the far side of the rank
      const c = tr(out.nodes[v])
      const b = boxes[v]
      let s: Pt, c1: Pt, c2: Pt, t: Pt, lp: Pt
      if (across) {
        s = { x: c.x + b.w / 2, y: c.y - b.h / 4 }
        t = { x: c.x + b.w / 2, y: c.y + b.h / 4 }
        c1 = { x: s.x + 34, y: s.y - 12 }
        c2 = { x: t.x + 34, y: t.y + 12 }
        lp = { x: c.x + b.w / 2 + 34, y: c.y }
      } else {
        s = { x: c.x - b.w / 4, y: c.y + b.h / 2 }
        t = { x: c.x + b.w / 4, y: c.y + b.h / 2 }
        c1 = { x: s.x - 12, y: s.y + 34 }
        c2 = { x: t.x + 12, y: t.y + 34 }
        lp = { x: c.x, y: c.y + b.h / 2 + 34 }
      }
      const segs: Seg[] = [{ c: 'C', p: [c1, c2, t] }]
      const head = e.head ?? 'arrow'
      const d = trimEnd(s, segs, HEAD_LEN[head] ?? 0)
      svg.path(pathData([{ c: 'M', p: [s] }, ...segs.map((k) => ({ c: k.c, p: k.p }))]), paint)
      drawHead(svg, head, t, d, col)
      if (e.label) {
        const l = measure(lines(e.label), SMALL)
        labels.push({ p: across ? { x: lp.x + l.w / 2 + 4, y: lp.y } : { x: lp.x, y: lp.y + l.h / 2 + 4 }, text: lines(e.label) })
      }
      return
    }
    let g2: EdgeGeom = { start: tr(geom.start), segs: geom.segs.map((s) => ({ c: s.c, p: s.p.map(tr) })), label: geom.label && tr(geom.label) }
    // an edge to / from a cluster stops at the cluster's border
    const { cv, cw } = edges[i]
    if ((cv >= 0 && !inCluster(edges[i].w, cv)) || (cw >= 0 && !inCluster(edges[i].v, cw))) {
      let pts = sample(g2.start, g2.segs)
      if (cv >= 0 && clusterBox[cv]) pts = clip(pts, clusterBox[cv]!, true)
      if (cw >= 0 && clusterBox[cw]) pts = clip(pts, clusterBox[cw]!, false)
      if (pts.length > 1) g2 = { start: pts[0], segs: pts.slice(1).map((p) => ({ c: 'L' as const, p: [p] })), label: g2.label }
    }
    const head = e.head ?? 'none'
    const tail = e.tail ?? 'none'
    const end = g2.segs[g2.segs.length - 1].p[g2.segs[g2.segs.length - 1].p.length - 1]
    const dHead = trimEnd(g2.start, g2.segs, HEAD_LEN[head] ?? 0)
    // the tail: reverse the first segment's direction
    const first = g2.segs[0]
    const toward = first.c === 'C' ? first.p[0] : first.p[0]
    const dTail = unit(toward, g2.start)
    const tailStart = g2.start
    const tl = HEAD_LEN[tail] ?? 0
    const start = tl ? { x: g2.start.x - dTail.x * tl, y: g2.start.y - dTail.y * tl } : g2.start
    if (tl && first.c === 'C') {
      const c1 = { x: first.p[0].x - dTail.x * Math.min(tl, 6), y: first.p[0].y - dTail.y * Math.min(tl, 6) }
      const k = Math.max(0, (first.p[1].x - c1.x) * dTail.x + (first.p[1].y - c1.y) * dTail.y)
      first.p[0] = { x: c1.x + dTail.x * k, y: c1.y + dTail.y * k }
    }
    svg.path(pathData([{ c: 'M', p: [start] }, ...g2.segs.map((k) => ({ c: k.c, p: k.p }))]), paint)
    if (head !== 'none') drawHead(svg, head, end, dHead, col)
    if (tail !== 'none') drawHead(svg, tail, tailStart, dTail, col)
    if (e.label) {
      const p = g2.label ?? midpoint(g2.start, end)
      labels.push({ p, text: lines(e.label) })
    }
    // multiplicities: beside the line, near its end
    const side = (p: Pt, d: Pt, text: string) => {
      const l = measure(lines(text), SMALL)
      const nx = -d.y
      const ny = d.x
      const off = Math.abs(nx) * (l.w / 2 + 5) + Math.abs(ny) * (l.h / 2 + 3)
      labels.push({ p: { x: p.x - d.x * (16 + l.h / 2) + nx * off, y: p.y - d.y * (14 + l.h / 2) + ny * off }, text: lines(text), plain: true })
    }
    if (e.headLabel) side(end, dHead, e.headLabel)
    if (e.tailLabel) side(tailStart, dTail, e.tailLabel)
  })

  for (const t of titles) {
    const m = measure(t.text, SMALL, true)
    svg.rect(t.x - m.w / 2 - 4, t.y - m.h / 2 - 1, m.w + 8, m.h + 2, { fill: t.bg }, 2)
    svg.text(t.x, t.y, t.text, { anchor: 'middle', size: SMALL, bold: true, color: t.color })
  }

  // nodes
  g.nodes.forEach((n, k) => {
    if (n.style?.hidden) return
    const c = tr(out.nodes[k])
    drawNode(svg, n, boxes[k], c.x, c.y)
  })

  for (const l of labels) {
    const m = measure(l.text, SMALL)
    if (!l.plain) svg.rect(l.p.x - m.w / 2 - 3, l.p.y - m.h / 2 - 1, m.w + 6, m.h + 2, { fill: THEME.label, opacity: 0.92 }, 2)
    svg.text(l.p.x, l.p.y, l.text, { anchor: 'middle', size: SMALL, color: l.color ?? THEME.ink })
  }
  if (g.title) {
    W = Math.max(W, textWidth(g.title, 16, true) + 2 * MARGIN)
    svg.text(W / 2, MARGIN + TITLE_H / 2, g.title, { anchor: 'middle', size: 16, bold: true })
  }
  return { svg: svg.toString(W, H), w: Math.ceil(W), h: Math.ceil(H) }
}

const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** shapes whose flat top / bottom edges can take several edges side by side */
const SPREAD = new Set<Shape>(['rect', 'round', 'subroutine', 'component', 'note', 'folder', 'box3d', 'cylinder', 'stadium', 'cloud'])

/** the path as a polyline */
function sample(start: Pt, segs: Seg[]): Pt[] {
  const out = [start]
  let cur = start
  for (const s of segs) {
    if (s.c === 'L') out.push(s.p[0])
    else {
      const [c1, c2, e] = s.p
      for (let k = 1; k <= 12; k++) {
        const t = k / 12
        const u = 1 - t
        out.push({
          x: u * u * u * cur.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * e.x,
          y: u * u * u * cur.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * e.y,
        })
      }
    }
    cur = out[out.length - 1]
  }
  return out
}

/** cuts the part of a polyline inside `b` off its start (or end) */
function clip(pts: Pt[], b: { x: number; y: number; w: number; h: number }, atStart: boolean): Pt[] {
  const inside = (p: Pt) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h
  const list = atStart ? pts : [...pts].reverse()
  const k = list.findIndex((p) => !inside(p))
  if (k <= 0) return pts
  const a = list[k - 1]
  const z = list[k]
  // where a→z leaves the box
  let t = 1
  const dx = z.x - a.x
  const dy = z.y - a.y
  if (dx > 0) t = Math.min(t, (b.x + b.w - a.x) / dx)
  if (dx < 0) t = Math.min(t, (b.x - a.x) / dx)
  if (dy > 0) t = Math.min(t, (b.y + b.h - a.y) / dy)
  if (dy < 0) t = Math.min(t, (b.y - a.y) / dy)
  const out = [{ x: a.x + dx * t, y: a.y + dy * t }, ...list.slice(k)]
  return atStart ? out : out.reverse()
}
