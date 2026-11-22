/**
 * Layered ("hierarchical") graph layout, in the spirit of Sugiyama's method:
 * cycles broken by reversing DFS back edges → ranks (longest path, then each node moved to where its edges are
 * shortest) → long edges split by dummy nodes (edge labels ride on one) → crossings reduced by barycenter sweeps
 * that keep clusters contiguous → coordinates by weighted isotonic regression per rank (long edges pulled straight)
 * → clusters legalised so no foreign node falls inside a cluster's box.
 *
 * Works in "layout space": ranks go down (y), the order within a rank goes right (x). The caller turns LR / BT / RL
 * graphs by swapping or mirroring axes (and node sizes) on the way in and out.
 */
import type { Pt } from './svg'

export interface LNode {
  /** size across the rank (x) and along the rank axis (y) */
  w: number
  h: number
  /** innermost cluster, -1 for none */
  cluster: number
  /** extra room after the node in its rank (self loops) */
  loop?: number
  /** edges meeting a flat side spread out along it (boxes) instead of meeting at its middle */
  spread?: boolean
}

export interface LEdge {
  v: number
  w: number
  minlen: number
  weight: number
  label?: { w: number; h: number }
}

export interface LCluster {
  parent: number
  /** padding: cross start (left), cross end (right), rank start (top), rank end (bottom) */
  pad: [number, number, number, number]
  /** least width (the title) */
  minW: number
}

export interface LayoutOpts {
  nodesep: number
  ranksep: number
  edgesep: number
  /** groups of nodes put on one rank (Graphviz rank=same) */
  sameRank?: number[][]
}

export interface Seg {
  c: 'L' | 'C'
  p: Pt[]
}

export interface EdgeGeom {
  start: Pt
  segs: Seg[]
  label?: Pt
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface LayoutOut {
  nodes: Pt[]
  /** null for self loops (the caller draws them) */
  edges: (EdgeGeom | null)[]
  /** null for a cluster without nodes */
  clusters: (Box | null)[]
  w: number
  h: number
}

const REAL = 0
const DUMMY = 1
const LEFT = 2
const RIGHT = 3

interface Item {
  node: number
  cluster: number
  key: number
  idx: number
  items: Item[]
}

export function layered(nodes: LNode[], edges: LEdge[], clusters: LCluster[], o: LayoutOpts): LayoutOut {
  const N = nodes.length
  const C = clusters.length

  // ---------------------------------------------------------------- 1. break cycles
  const outs: number[][] = Array.from({ length: N }, () => [])
  const isSource = new Array(N).fill(true)
  edges.forEach((e, i) => {
    if (e.v === e.w) return
    outs[e.v].push(i)
    isSource[e.w] = false
  })
  const reversed = new Array(edges.length).fill(false)
  const state = new Uint8Array(N)
  const starts = [...Array.from({ length: N }, (_, k) => k).filter((k) => isSource[k]), ...Array.from({ length: N }, (_, k) => k)]
  for (const s of starts) {
    if (state[s]) continue
    state[s] = 1
    const stack: [number, number][] = [[s, 0]]
    while (stack.length) {
      const top = stack[stack.length - 1]
      const v = top[0]
      if (top[1] < outs[v].length) {
        const ei = outs[v][top[1]++]
        const w = edges[ei].w
        if (state[w] === 1) reversed[ei] = true
        else if (!state[w]) {
          state[w] = 1
          stack.push([w, 0])
        }
      } else {
        state[v] = 2
        stack.pop()
      }
    }
  }
  const sameGroup = new Map<number, number>()
  o.sameRank?.forEach((g, k) => g.forEach((v) => sameGroup.set(v, k)))
  const E = edges.map((e, i) => {
    const flat = sameGroup.has(e.v) && sameGroup.get(e.v) === sameGroup.get(e.w)
    return reversed[i] ? { v: e.w, w: e.v, minlen: flat ? 0 : e.minlen, weight: e.weight } : { v: e.v, w: e.w, minlen: flat ? 0 : e.minlen, weight: e.weight }
  })

  // ---------------------------------------------------------------- 2. ranks
  const inE: number[][] = Array.from({ length: N }, () => [])
  const outE: number[][] = Array.from({ length: N }, () => [])
  E.forEach((e, i) => {
    if (e.v === e.w) return
    outE[e.v].push(i)
    inE[e.w].push(i)
  })
  const topo: number[] = []
  {
    const deg = inE.map((l) => l.length)
    const queue = Array.from({ length: N }, (_, k) => k).filter((k) => !deg[k])
    while (queue.length) {
      const v = queue.shift()!
      topo.push(v)
      for (const ei of outE[v]) if (!--deg[E[ei].w]) queue.push(E[ei].w)
    }
    // (a cycle left by minlen-0 edges between same-rank nodes: keep the rest in input order)
    if (topo.length < N) for (let k = 0; k < N; k++) if (!topo.includes(k)) topo.push(k)
  }
  const rank = new Array(N).fill(0)
  const propagate = () => {
    for (const v of topo) for (const ei of outE[v]) rank[E[ei].w] = Math.max(rank[E[ei].w], rank[v] + E[ei].minlen)
  }
  propagate()
  for (let it = 0; it < 60; it++) {
    let moved = false
    const order = it % 2 ? [...topo].reverse() : topo
    for (const v of order) {
      if (sameGroup.has(v)) continue
      let lo = -Infinity
      let hi = Infinity
      let win = 0
      let wout = 0
      for (const ei of inE[v]) {
        lo = Math.max(lo, rank[E[ei].v] + E[ei].minlen)
        win += E[ei].weight
      }
      for (const ei of outE[v]) {
        hi = Math.min(hi, rank[E[ei].w] - E[ei].minlen)
        wout += E[ei].weight
      }
      let r = rank[v]
      if (win > wout && lo > -Infinity) r = lo
      else if (wout > win && hi < Infinity) r = hi
      if (r !== rank[v]) {
        rank[v] = r
        moved = true
      }
    }
    if (!moved) break
  }
  if (o.sameRank?.length) {
    for (let it = 0; it < 12; it++) {
      let changed = false
      for (const g of o.sameRank) {
        const r = Math.max(...g.map((v) => rank[v]))
        for (const v of g) if (rank[v] !== r) {
          rank[v] = r
          changed = true
        }
      }
      propagate()
      if (!changed) break
    }
  }
  const minRank = rank.reduce((a, b) => Math.min(a, b), 0)
  for (let v = 0; v < N; v++) rank[v] -= minRank
  let maxRank = rank.reduce((a, b) => Math.max(a, b), 0)

  // ---------------------------------------------------------------- 3. dummies, cluster borders
  const chain = (c: number) => {
    const out: number[] = []
    for (let k = c; k >= 0; k = clusters[k].parent) out.unshift(k)
    return out
  }
  const lca = (a: number, b: number) => {
    const ca = chain(a)
    const cb = chain(b)
    let k = 0
    while (k < ca.length && k < cb.length && ca[k] === cb[k]) k++
    return k ? ca[k - 1] : -1
  }
  const W: number[] = nodes.map((n) => n.w)
  const H: number[] = nodes.map((n) => n.h)
  const kind: number[] = nodes.map(() => REAL)
  const cl: number[] = nodes.map((n) => n.cluster)
  const rk: number[] = [...rank]
  const loopX: number[] = nodes.map((n) => n.loop ?? 0)
  const owner: number[] = nodes.map(() => -1)
  const add = (w: number, h: number, k: number, c: number, r: number) => {
    W.push(w)
    H.push(h)
    kind.push(k)
    cl.push(c)
    rk.push(r)
    loopX.push(0)
    owner.push(k === LEFT || k === RIGHT ? c : -1)
    return W.length - 1
  }
  /** neighbours with weights: up (rank - 1) and down (rank + 1) */
  const up: [number, number][][] = []
  const down: [number, number][][] = []
  const link = (a: number, b: number, w: number) => {
    while (up.length < W.length) {
      up.push([])
      down.push([])
    }
    down[a].push([b, w])
    up[b].push([a, w])
  }
  // long edges cost a node per rank they cross: past this the picture is unreadable anyway
  let budget = 60000
  for (const e of E) budget -= Math.max(0, Math.abs(rank[e.w] - rank[e.v]) - 1)
  if (budget < 0) throw new Error('The diagram is too large to draw')
  const chains: (number[] | null)[] = []
  const labelAt: number[] = []
  E.forEach((e, i) => {
    if (e.v === e.w) {
      chains.push(null)
      labelAt.push(-1)
      return
    }
    const c = [e.v]
    const span = rank[e.w] - rank[e.v]
    const lab = edges[i].label
    const labelRank = lab && span >= 2 ? rank[e.v] + Math.floor(span / 2) : -1
    const dc = lca(cl[e.v], cl[e.w])
    let at = -1
    for (let r = rank[e.v] + 1; r < rank[e.w]; r++) {
      const d = r === labelRank ? add(lab!.w, lab!.h, DUMMY, dc, r) : add(0, 0, DUMMY, dc, r)
      if (r === labelRank) at = d
      c.push(d)
    }
    c.push(e.w)
    chains.push(span > 0 ? c : null)
    labelAt.push(at)
    for (let k = 0; k + 1 < c.length; k++) {
      if (span <= 0) break
      const a = c[k]
      const b = c[k + 1]
      const f = (kind[a] === DUMMY ? 1 : 0) + (kind[b] === DUMMY ? 1 : 0)
      link(a, b, e.weight * (f === 2 ? 8 : f === 1 ? 2 : 1))
    }
  })
  // flat edges (same rank): not part of the layering
  const flat = E.map((e, i) => e.v !== e.w && rank[e.v] === rank[e.w] && !chains[i])

  const cMin = new Array(C).fill(Infinity)
  const cMax = new Array(C).fill(-Infinity)
  for (let v = 0; v < W.length; v++) {
    for (const c of chain(cl[v])) {
      cMin[c] = Math.min(cMin[c], rk[v])
      cMax[c] = Math.max(cMax[c], rk[v])
    }
  }
  const bl: number[][] = Array.from({ length: C }, () => [])
  const br: number[][] = Array.from({ length: C }, () => [])
  const borderChain: [number, number][][] = []
  for (let c = 0; c < C; c++) {
    if (cMin[c] > cMax[c]) continue
    for (let r = cMin[c]; r <= cMax[c]; r++) {
      bl[c][r] = add(0, 0, LEFT, c, r)
      br[c][r] = add(0, 0, RIGHT, c, r)
    }
  }
  while (up.length < W.length) {
    up.push([])
    down.push([])
  }
  for (let v = 0; v < W.length; v++) borderChain.push([])
  for (let c = 0; c < C; c++) {
    for (let r = cMin[c]; r < cMax[c]; r++) {
      borderChain[bl[c][r]].push([bl[c][r + 1], 1])
      borderChain[bl[c][r + 1]].push([bl[c][r], 1])
      borderChain[br[c][r]].push([br[c][r + 1], 1])
      borderChain[br[c][r + 1]].push([br[c][r], 1])
    }
  }
  const V = W.length
  maxRank = rk.reduce((a, b) => Math.max(a, b), maxRank)

  // ---------------------------------------------------------------- 4. order within ranks
  let layers: number[][] = Array.from({ length: maxRank + 1 }, () => [])
  {
    const seen = new Uint8Array(V)
    const roots = Array.from({ length: V }, (_, k) => k)
      .filter((k) => kind[k] !== LEFT && kind[k] !== RIGHT)
      .sort((a, b) => rk[a] - rk[b] || a - b)
    for (const s of roots) {
      if (seen[s]) continue
      const stack = [s]
      while (stack.length) {
        const v = stack.pop()!
        if (seen[v]) continue
        seen[v] = 1
        layers[rk[v]].push(v)
        for (let k = down[v].length - 1; k >= 0; k--) if (!seen[down[v][k][0]]) stack.push(down[v][k][0])
      }
    }
    for (let v = 0; v < V; v++) if (kind[v] === LEFT || kind[v] === RIGHT) layers[rk[v]].push(v)
  }
  const pos = new Float64Array(V)
  const setPos = () => layers.forEach((l) => l.forEach((v, k) => (pos[v] = k)))
  setPos()
  const key = new Float64Array(V)
  const globalOrder = new Float64Array(C)
  const computeGlobal = () => {
    for (let c = 0; c < C; c++) {
      if (cMin[c] > cMax[c]) continue
      let s = 0
      for (let r = cMin[c]; r <= cMax[c]; r++) s += pos[bl[c][r]] / Math.max(1, layers[r].length)
      globalOrder[c] = s / (cMax[c] - cMin[c] + 1)
    }
  }
  const sortLayer = (layer: number[], r: number): number[] => {
    if (!C) return [...layer].sort((a, b) => key[a] - key[b] || pos[a] - pos[b])
    const root: Item = { node: -1, cluster: -1, key: 0, idx: 0, items: [] }
    const groups = new Map<number, Item>()
    const group = (c: number): Item => {
      if (c < 0) return root
      let g = groups.get(c)
      if (!g) {
        g = { node: -1, cluster: c, key: 0, idx: pos[bl[c][r]] ?? 0, items: [] }
        groups.set(c, g)
        group(clusters[c].parent).items.push(g)
      }
      return g
    }
    for (const v of layer) {
      if (kind[v] === LEFT) group(owner[v])
      else if (kind[v] !== RIGHT) group(cl[v]).items.push({ node: v, cluster: -1, key: key[v], idx: pos[v], items: [] })
    }
    const settle = (g: Item): [number, number] => {
      let sum = 0
      let cnt = 0
      for (const it of g.items) {
        if (it.node >= 0) {
          sum += it.key
          cnt++
        } else {
          const [s, n] = settle(it)
          sum += s
          cnt += n
        }
      }
      if (g.cluster >= 0) g.key = cnt ? sum / cnt : key[bl[g.cluster][r]]
      g.items.sort((a, b) => a.key - b.key || a.idx - b.idx)
      // sibling clusters keep one left-to-right order on every rank
      const slots = g.items.map((it, k) => (it.cluster >= 0 ? k : -1)).filter((k) => k >= 0)
      const cs = slots.map((k) => g.items[k]).sort((a, b) => globalOrder[a.cluster] - globalOrder[b.cluster])
      slots.forEach((k, j) => (g.items[k] = cs[j]))
      return [sum, cnt]
    }
    settle(root)
    const out: number[] = []
    const flatten = (g: Item) => {
      for (const it of g.items) {
        if (it.node >= 0) out.push(it.node)
        else {
          out.push(bl[it.cluster][r])
          flatten(it)
          out.push(br[it.cluster][r])
        }
      }
    }
    flatten(root)
    return out
  }
  const crossings = (ls: number[][]): number => {
    let total = 0
    for (let r = 0; r + 1 < ls.length; r++) {
      const pairs: [number, number][] = []
      for (const v of ls[r]) for (const [w] of down[v]) pairs.push([pos[v], pos[w]])
      pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1])
      const n = ls[r + 1].length + 1
      const tree = new Float64Array(n + 1)
      for (let k = 0; k < pairs.length; k++) {
        // count earlier pairs with a larger bottom position
        let le = 0
        for (let i = pairs[k][1] + 1; i > 0; i -= i & -i) le += tree[i]
        total += k - le
        for (let i = pairs[k][1] + 1; i <= n; i += i & -i) tree[i]++
      }
    }
    return total
  }
  const bary = (v: number, nb: [number, number][][]) => {
    let s = 0
    let w = 0
    for (const [u, wt] of nb[v]) {
      s += pos[u] * wt
      w += wt
    }
    return w ? s / w : pos[v]
  }
  for (const l of layers) {
    for (const v of l) key[v] = pos[v]
  }
  computeGlobal()
  layers = layers.map((l, r) => sortLayer(l, r))
  setPos()
  let best = layers.map((l) => [...l])
  let bestCross = crossings(layers)
  for (let it = 0; it < 24 && bestCross > 0; it++) {
    computeGlobal()
    const goingDown = it % 2 === 0
    for (let k = 1; k <= maxRank; k++) {
      const r = goingDown ? k : maxRank - k
      const nb = goingDown ? up : down
      for (const v of layers[r]) key[v] = bary(v, nb)
      layers[r] = sortLayer(layers[r], r)
      layers[r].forEach((v, j) => (pos[v] = j))
    }
    const c = crossings(layers)
    if (c < bestCross) {
      bestCross = c
      best = layers.map((l) => [...l])
    }
  }
  layers = best
  setPos()

  // ---------------------------------------------------------------- 5. rank positions
  const rankH = layers.map((l) => l.reduce((a, v) => Math.max(a, H[v]), 0))
  const kids: number[][] = Array.from({ length: C }, () => [])
  clusters.forEach((c, k) => c.parent >= 0 && kids[c.parent].push(k))
  const startExt = (c: number): number => clusters[c].pad[2] + Math.max(0, ...kids[c].filter((k) => cMin[k] === cMin[c]).map(startExt))
  const endExt = (c: number): number => clusters[c].pad[3] + Math.max(0, ...kids[c].filter((k) => cMax[k] === cMax[c]).map(endExt))
  const extraStart = new Array(maxRank + 1).fill(0)
  const extraEnd = new Array(maxRank + 1).fill(0)
  for (let c = 0; c < C; c++) {
    if (cMin[c] > cMax[c]) continue
    extraStart[cMin[c]] = Math.max(extraStart[cMin[c]], startExt(c))
    extraEnd[cMax[c]] = Math.max(extraEnd[cMax[c]], endExt(c))
  }
  const ry: number[] = []
  for (let r = 0; r <= maxRank; r++) {
    ry[r] = r === 0 ? rankH[0] / 2 + extraStart[0] : ry[r - 1] + rankH[r - 1] / 2 + extraEnd[r - 1] + o.ranksep + extraStart[r] + rankH[r] / 2
  }
  const height = ry[maxRank] + rankH[maxRank] / 2 + extraEnd[maxRank]

  // ---------------------------------------------------------------- 6. coordinates across ranks
  const half = (v: number) => (kind[v] === LEFT || kind[v] === RIGHT ? 0 : W[v] / 2)
  const sep = (a: number, b: number) => {
    let g = loopX[a]
    const ka = kind[a]
    const kb = kind[b]
    if (ka === LEFT) g += clusters[owner[a]].pad[0]
    if (ka === RIGHT) g += o.nodesep / 2
    if (kb === RIGHT) g += clusters[owner[b]].pad[1]
    if (kb === LEFT) g += o.nodesep / 2
    if (ka < LEFT && kb < LEFT) g += ka === DUMMY && kb === DUMMY ? o.edgesep : ka === DUMMY || kb === DUMMY ? (o.nodesep + o.edgesep) / 2 : o.nodesep
    return half(a) + half(b) + g
  }
  const x = new Float64Array(V)
  for (const l of layers) for (let k = 1; k < l.length; k++) x[l[k]] = x[l[k - 1]] + sep(l[k - 1], l[k])
  const pav = (layer: number[], d: number[], wt: number[]) => {
    const n = layer.length
    const off = [0]
    for (let k = 1; k < n; k++) off[k] = off[k - 1] + sep(layer[k - 1], layer[k])
    const bs: { s: number; e: number; w: number; wt: number }[] = []
    for (let k = 0; k < n; k++) {
      bs.push({ s: k, e: k, w: wt[k], wt: wt[k] * (d[k] - off[k]) })
      while (bs.length > 1) {
        const a = bs[bs.length - 2]
        const b = bs[bs.length - 1]
        if (a.wt / a.w < b.wt / b.w) break
        a.e = b.e
        a.w += b.w
        a.wt += b.wt
        bs.pop()
      }
    }
    for (const b of bs) for (let k = b.s; k <= b.e; k++) x[layer[k]] = b.wt / b.w + off[k]
  }
  const ITER = 10
  for (let it = 0; it < ITER; it++) {
    const both = it >= ITER - 2
    const goingDown = it % 2 === 0
    for (let k = 0; k <= maxRank; k++) {
      const r = goingDown ? k : maxRank - k
      const l = layers[r]
      if (!l.length) continue
      const d: number[] = []
      const wt: number[] = []
      for (const v of l) {
        let s = 0
        let w = 0
        const use = (nb: [number, number][]) => {
          for (const [u, uw] of nb) {
            s += x[u] * uw
            w += uw
          }
        }
        if (both || goingDown) use(up[v])
        if (both || !goingDown) use(down[v])
        use(borderChain[v])
        d.push(w ? s / w : x[v])
        wt.push(w || 0.01)
      }
      pav(l, d, wt)
    }
  }
  // legalise clusters: one left and one right border per cluster on every rank it spans
  const L0 = V
  const varOf = (v: number) => (kind[v] === LEFT ? L0 + 2 * owner[v] : kind[v] === RIGHT ? L0 + 2 * owner[v] + 1 : v)
  if (C) {
    const NV = V + 2 * C
    const val = new Float64Array(NV)
    for (let v = 0; v < V; v++) val[v] = x[v]
    for (let c = 0; c < C; c++) {
      val[L0 + 2 * c] = Infinity
      val[L0 + 2 * c + 1] = -Infinity
    }
    for (let v = 0; v < V; v++) {
      if (kind[v] === LEFT) val[varOf(v)] = Math.min(val[varOf(v)], x[v])
      if (kind[v] === RIGHT) val[varOf(v)] = Math.max(val[varOf(v)], x[v])
    }
    const adj: [number, number][][] = Array.from({ length: NV }, () => [])
    const indeg = new Int32Array(NV)
    const edge = (a: number, b: number, s: number) => {
      adj[a].push([b, s])
      indeg[b]++
    }
    for (const l of layers) for (let k = 1; k < l.length; k++) edge(varOf(l[k - 1]), varOf(l[k]), sep(l[k - 1], l[k]))
    for (let c = 0; c < C; c++) if (cMin[c] <= cMax[c]) edge(L0 + 2 * c, L0 + 2 * c + 1, Math.max(clusters[c].minW, clusters[c].pad[0] + clusters[c].pad[1]))
    const queue: number[] = []
    for (let v = 0; v < NV; v++) if (!indeg[v]) queue.push(v)
    let done = 0
    const pushed = new Float64Array(val)
    while (queue.length) {
      const v = queue.pop()!
      done++
      for (const [w, s] of adj[v]) {
        if (Number.isFinite(pushed[v])) pushed[w] = Math.max(pushed[w], pushed[v] + s)
        if (!--indeg[w]) queue.push(w)
      }
    }
    if (done === NV) for (let v = 0; v < V; v++) x[v] = pushed[varOf(v)]
  }
  let minX = Infinity
  let maxX = -Infinity
  for (let v = 0; v < V; v++) {
    minX = Math.min(minX, x[v] - half(v))
    maxX = Math.max(maxX, x[v] + half(v) + loopX[v])
  }
  if (!Number.isFinite(minX)) minX = maxX = 0
  for (let v = 0; v < V; v++) x[v] -= minX

  // ---------------------------------------------------------------- 7. output
  const centre = (v: number): Pt => ({ x: x[v], y: ry[rk[v]] })
  // where each edge meets its end nodes: the middle of the side, or spread along a box's side by the order of what
  // the edges lead to (the next point on the edge)
  const portX = new Map<string, number>()
  {
    const sides = new Map<string, { i: number; nx: number }[]>()
    const at = (key: string, i: number, nx: number) => {
      let l = sides.get(key)
      if (!l) sides.set(key, (l = []))
      l.push({ i, nx })
    }
    E.forEach((_, i) => {
      const c = chains[i]
      if (!c || flat[i]) return
      if (nodes[c[0]]?.spread) at(`${c[0]}:b`, i, x[c[1]])
      if (nodes[c[c.length - 1]]?.spread) at(`${c[c.length - 1]}:t`, i, x[c[c.length - 2]])
    })
    for (const [key, l] of sides) {
      if (l.length < 2) continue
      const v = Number(key.split(':')[0])
      l.sort((a, b) => a.nx - b.nx || a.i - b.i)
      const step = Math.min(36, (W[v] * 0.7) / (l.length - 1))
      l.forEach((it, k) => portX.set(`${key}:${it.i}`, x[v] + (k - (l.length - 1) / 2) * step))
    }
  }
  const outEdges: (EdgeGeom | null)[] = E.map((e, i) => {
    if (e.v === e.w) return null
    if (flat[i]) {
      const a = centre(e.v)
      const b = centre(e.w)
      const dir = Math.sign(b.x - a.x) || 1
      const s = { x: a.x + (dir * W[e.v]) / 2, y: a.y }
      const t = { x: b.x - (dir * W[e.w]) / 2, y: b.y }
      const [p, q] = reversed[i] ? [t, s] : [s, t]
      return { start: p, segs: [{ c: 'L', p: [q] }], label: edges[i].label ? { x: (p.x + q.x) / 2, y: p.y - 10 } : undefined }
    }
    const c = chains[i]
    if (!c) return null
    const pts: Pt[] = []
    const straight: boolean[] = []
    const a = centre(c[0])
    pts.push({ x: portX.get(`${c[0]}:b:${i}`) ?? a.x, y: a.y + H[c[0]] / 2 })
    for (let k = 1; k + 1 < c.length; k++) {
      const p = centre(c[k])
      const band = rankH[rk[c[k]]] / 2
      if (band > 0.5) {
        pts.push({ x: p.x, y: p.y - band }, { x: p.x, y: p.y + band })
        straight.push(false, true)
      } else {
        pts.push(p)
        straight.push(false)
      }
    }
    const b = centre(c[c.length - 1])
    pts.push({ x: portX.get(`${c[c.length - 1]}:t:${i}`) ?? b.x, y: b.y - H[c[c.length - 1]] / 2 })
    straight.push(false)
    // one smooth curve through the waypoints, the across coordinate a function of the rank coordinate: square-on at
    // the ports and at a straight piece, a monotone (Fritsch–Carlson) slope at the other waypoints, so the curve never
    // swings out past one (a dummy next to an end would otherwise bend the whole offset into a short piece)
    const n = pts.length
    const slope = new Array<number>(n).fill(0)
    const sec = (k: number) => (pts[k + 1].x - pts[k].x) / Math.max(0.5, pts[k + 1].y - pts[k].y)
    for (let k = 1; k + 1 < n; k++) {
      if (straight[k - 1] || straight[k]) continue
      const s1 = sec(k - 1)
      const s2 = sec(k)
      if (s1 * s2 <= 0) continue
      const h1 = pts[k].y - pts[k - 1].y
      const h2 = pts[k + 1].y - pts[k].y
      slope[k] = (3 * (h1 + h2)) / ((2 * h2 + h1) / s1 + (h2 + 2 * h1) / s2)
    }
    const segs: Seg[] = []
    for (let k = 1; k < n; k++) {
      const p = pts[k - 1]
      const q = pts[k]
      const h = (q.y - p.y) / 3
      if (straight[k - 1] || (Math.abs(p.x - q.x) < 0.5 && !slope[k - 1] && !slope[k])) segs.push({ c: 'L', p: [q] })
      else segs.push({ c: 'C', p: [{ x: p.x + slope[k - 1] * h, y: p.y + h }, { x: q.x - slope[k] * h, y: q.y - h }, q] })
    }
    const label = labelAt[i] >= 0 ? centre(labelAt[i]) : undefined
    if (!reversed[i]) return { start: pts[0], segs, label }
    // drawn from the other end: the pieces in reverse, each cubic's control points swapped
    const back: Seg[] = []
    for (let k = n - 1; k >= 1; k--) {
      const s = segs[k - 1]
      back.push(s.c === 'C' ? { c: 'C', p: [s.p[1], s.p[0], pts[k - 1]] } : { c: 'L', p: [pts[k - 1]] })
    }
    return { start: pts[n - 1], segs: back, label }
  })
  const boxes: (Box | null)[] = clusters.map((_, c) => {
    if (cMin[c] > cMax[c]) return null
    let x0 = Infinity
    let x1 = -Infinity
    for (let r = cMin[c]; r <= cMax[c]; r++) {
      x0 = Math.min(x0, x[bl[c][r]])
      x1 = Math.max(x1, x[br[c][r]])
    }
    const y0 = ry[cMin[c]] - rankH[cMin[c]] / 2 - startExt(c)
    const y1 = ry[cMax[c]] + rankH[cMax[c]] / 2 + endExt(c)
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  })
  return {
    nodes: Array.from({ length: N }, (_, v) => centre(v)),
    edges: outEdges,
    clusters: boxes,
    w: maxX - minX,
    h: height,
  }
}
