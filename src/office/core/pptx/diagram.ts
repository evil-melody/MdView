/**
 * SmartArt（diagram）降级渲染：解析 `p:graphicFrame` → `a:graphicData uri="…/diagram"` 的
 * `dgm:relIds`，读取 `diagrams/dataN.xml` 的 `dgm:ptLst`（节点 + dgm:t 文本）与 `dgm:cxnLst`
 * （parOf 父子关系），做简单的树形布局（叶子横向排布、父节点居中于子节点之上），
 * 节点文本写回 data part 的 `dgm:t`。
 *
 * 诚实边界：不实现 `layout1.xml` 的真实布局算法（LalgLinear 等约束求解）、不渲染形状样式 /
 * quickStyle / colors，节点统一为圆角矩形 + 连线；文本只保留纯文本行（不带富文本样式）。
 */
import { OpcPackage, type Rels } from '../opc'
import { kid, kids, textOf, type XEl } from '../xml'
import type { Box, SmartArtNode } from './types'

/** data part 的 dgm:pt（可见节点）文本：段落以 \n 连接 */
function ptText(pt: XEl): string {
  return kids(kid(pt, 't'), 'p')
    .map((p) => p.c.filter((c) => c.n === 'r').map((r) => textOf(kid(r, 't'))).join(''))
    .join('\n')
}

/**
 * 解析 diagram data part 并产出降级渲染模型。只保留 `type="node"|"asstNode"` 的点；
 * 父子关系来自 `dgm:cxn type="parOf"`（type 缺省即 parOf）。
 */
export async function layoutDiagram(pkg: OpcPackage, rels: Rels, dmId: string | undefined, box: Box): Promise<{ nodes: SmartArtNode[]; links: [string, string][] } | undefined> {
  const rel = dmId ? rels.get(dmId) : undefined
  if (!rel || rel.external) return undefined
  const root = await pkg.xml(rel.target, false)
  if (!root) return undefined
  const pts = kids(kid(root, 'ptLst'), 'pt')
  const cxns = kids(kid(root, 'cxnLst'), 'cxn')
  const text = new Map<string, string>()
  for (const pt of pts) {
    const t = pt.a.type ?? 'node'
    if (t !== 'node' && t !== 'asstNode') continue
    text.set(pt.a.modelId, ptText(pt))
  }
  if (!text.size) return undefined
  const parent = new Map<string, string>()
  for (const c of cxns) {
    if ((c.a.type ?? 'parOf') !== 'parOf') continue
    if (text.has(c.a.destId) && text.has(c.a.srcId)) parent.set(c.a.destId, c.a.srcId)
  }
  const children = new Map<string, string[]>()
  const roots: string[] = []
  for (const id of text.keys()) {
    const p = parent.get(id)
    if (p && text.has(p)) {
      const arr = children.get(p) ?? []
      arr.push(id)
      children.set(p, arr)
    } else roots.push(id)
  }
  // 树形布局：先给叶子编号（列位），父节点列位 = 子节点列位均值；行位 = 深度
  let leafX = 0
  const pos = new Map<string, { d: number; col: number }>()
  const visit = (id: string, d: number): number => {
    const cs = children.get(id) ?? []
    const col = cs.length ? cs.map((c) => visit(c, d + 1)).reduce((a, b) => a + b, 0) / cs.length : leafX++
    pos.set(id, { d, col })
    return col
  }
  for (const r of roots) visit(r, 0)
  const rows = Math.max(...[...pos.values()].map((p) => p.d)) + 1
  const cols = Math.max(leafX, 1)
  const gapX = 24
  const gapY = 28
  const nw = Math.max(56, Math.min(180, (box.w - (cols - 1) * gapX) / cols))
  const nh = Math.max(26, Math.min(48, (box.h - (rows - 1) * gapY) / rows))
  const nodes: SmartArtNode[] = [...text.keys()].map((id) => {
    const p = pos.get(id)!
    return { id, text: text.get(id)!, x: box.x + p.col * (nw + gapX), y: box.y + p.d * (nh + gapY), w: nw, h: nh }
  })
  const links: [string, string][] = []
  for (const [cid, pid] of parent) if (text.has(pid) && text.has(cid)) links.push([pid, cid])
  return { nodes, links }
}
