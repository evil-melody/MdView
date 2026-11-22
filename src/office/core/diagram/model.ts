/** What a diagram source parses to, and its picture. */
import { renderGantt, renderPie, renderTree, type Gantt, type Pie, type TreeNode } from './charts'
import { renderGraph, type Graph, type Rendered } from './graph'
import { renderSequence, type Sequence } from './sequence'

export type Model =
  | { t: 'graph'; graph: Graph }
  | { t: 'sequence'; seq: Sequence }
  | { t: 'pie'; pie: Pie }
  | { t: 'gantt'; gantt: Gantt }
  | { t: 'tree'; root: TreeNode; title?: string }

export function renderModel(m: Model): Rendered {
  switch (m.t) {
    case 'graph':
      return renderGraph(m.graph)
    case 'sequence':
      return renderSequence(m.seq)
    case 'pie':
      return renderPie(m.pie)
    case 'gantt':
      return renderGantt(m.gantt)
    case 'tree':
      return renderTree(m.root, m.title)
  }
}
