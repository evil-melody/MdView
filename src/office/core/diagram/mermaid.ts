/**
 * Mermaid: flowchart / graph, sequenceDiagram, classDiagram, stateDiagram, erDiagram, pie, gantt and mindmap.
 * https://mermaid.js.org/intro/syntax-reference.html
 */
import type { GanttTask, TreeNode } from './charts'
import { GraphBuilder, type Dir, type GEdge, type GNode, type Graph, type Head, type NodeStyle, type Rendered, type Section, type Shape } from './graph'
import { renderModel, type Model } from './model'
import { SequenceBuilder, type MsgHead, type PKind } from './sequence'
import { color, DiagramError, labelText, unMarkdown } from './svg'

/** Lines without comments and directives; the front matter title. */
function prepare(src: string): { lines: string[]; title?: string } {
  let text = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  let title: string | undefined
  const fm = /^\s*---\n([\s\S]*?)\n---[ \t]*(\n|$)/.exec(text)
  if (fm) {
    title = /^title:\s*(.+)$/m.exec(fm[1])?.[1].trim().replace(/^(["'])(.*)\1$/, '$2')
    text = text.slice(fm[0].length)
  }
  text = text.replace(/%%\{[\s\S]*?\}%%/g, '')
  const lines = text.split('\n').filter((l) => !/^\s*%%/.test(l))
  return { lines, title }
}

export function parseMermaid(src: string): Model {
  const { lines, title } = prepare(src)
  const k = lines.findIndex((l) => l.trim())
  if (k < 0) throw new DiagramError('The diagram is empty')
  const head = lines[k].trim()
  const kw = /^[\w-]+/.exec(head)?.[0] ?? head
  const body = lines.slice(k + 1)
  switch (kw) {
    case 'graph':
    case 'flowchart':
    case 'flowchart-elk':
      return { t: 'graph', graph: flowchart(head, body, title) }
    case 'sequenceDiagram':
      return { t: 'sequence', seq: sequence(body, title) }
    case 'classDiagram':
    case 'classDiagram-v2':
      return { t: 'graph', graph: classDiagram(body, title) }
    case 'stateDiagram':
    case 'stateDiagram-v2':
      return { t: 'graph', graph: stateDiagram(body, title) }
    case 'erDiagram':
      return { t: 'graph', graph: erDiagram(body, title) }
    case 'pie':
      return { t: 'pie', pie: pie(head, body, title) }
    case 'gantt':
      return { t: 'gantt', gantt: gantt(body, title) }
    case 'mindmap':
      return { t: 'tree', root: mindmap(body), title }
    default:
      throw new DiagramError(`Mermaid “${kw}” diagrams are not supported yet`)
  }
}

export const renderMermaid = (src: string): Rendered => renderModel(parseMermaid(src))

// ---------------------------------------------------------------- shared

const DIRS: Record<string, Dir> = { TB: 'TB', TD: 'TB', BT: 'BT', LR: 'LR', RL: 'RL' }

/** Mermaid label text: quotes, markdown strings, icons, entities and <br> */
export function mText(raw: string): string {
  let s = raw.trim()
  if (/^".*"$/s.test(s)) s = s.slice(1, -1)
  if (/^`.*`$/s.test(s)) s = unMarkdown(s.slice(1, -1))
  s = s.replace(/\bfa[bkrs]?:fa-[\w-]+\s*/g, '')
  return labelText(s).trim()
}

/** `fill:#f9f,stroke:#333,stroke-width:4px,color:#fff,stroke-dasharray: 5 5` */
function cssStyle(s: string): NodeStyle {
  const st: NodeStyle = {}
  for (const decl of s.split(/,(?![^(]*\))/)) {
    const k = decl.indexOf(':')
    if (k < 0) continue
    const prop = decl.slice(0, k).trim().toLowerCase()
    const v = decl.slice(k + 1).trim().replace(/;$/, '')
    if (prop === 'fill' || prop === 'background') st.fill = color(v)
    else if (prop === 'stroke') st.stroke = color(v)
    else if (prop === 'color') st.color = color(v)
    else if (prop === 'stroke-width') st.sw = Math.min(8, parseFloat(v) || 1)
    else if (prop === 'stroke-dasharray') st.dash = /^[\d.\s]+$/.test(v) ? v : '5 5'
    else if (prop === 'font-weight') st.bold = /bold|[6-9]00/.test(v)
    else if (prop === 'font-style') st.italic = v === 'italic'
  }
  return st
}

const merge = (a: NodeStyle | undefined, b: NodeStyle): NodeStyle => {
  const out: NodeStyle = { ...a }
  for (const [k, v] of Object.entries(b)) if (v !== undefined) (out as Record<string, unknown>)[k] = v
  return out
}

/** splits at `sep` outside quotes and brackets */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let q = ''
  let cur = ''
  for (const ch of s) {
    if (q) {
      if (ch === q) q = ''
    } else if (ch === '"' || ch === '`') q = ch
    else if ('([{'.includes(ch)) depth++
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1)
    else if (ch === sep && !depth) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

// ---------------------------------------------------------------- flowchart

const OPENERS: [string, string[], Shape[]][] = [
  ['(((', [')))'], ['doublecircle']],
  ['((', ['))'], ['circle']],
  ['([', ['])'], ['stadium']],
  ['[[', [']]'], ['subroutine']],
  ['[(', [')]'], ['cylinder']],
  ['{{', ['}}'], ['hexagon']],
  ['[/', ['/]', '\\]'], ['lean-r', 'trap-b']],
  ['[\\', ['\\]', '/]'], ['lean-l', 'trap-t']],
  ['[', [']'], ['rect']],
  ['(', [')'], ['round']],
  ['{', ['}'], ['diamond']],
  ['>', [']'], ['flag']],
]

const NEW_SHAPES: Record<string, Shape> = {
  rect: 'rect', rectangle: 'rect', proc: 'rect', process: 'rect', rounded: 'round', event: 'round', stadium: 'stadium', pill: 'stadium', terminal: 'stadium',
  subproc: 'subroutine', subprocess: 'subroutine', subroutine: 'subroutine', 'fr-rect': 'subroutine', cyl: 'cylinder', cylinder: 'cylinder', database: 'cylinder', db: 'cylinder',
  circle: 'circle', circ: 'circle', 'dbl-circ': 'doublecircle', 'double-circle': 'doublecircle', diam: 'diamond', diamond: 'diamond', decision: 'diamond', question: 'diamond',
  hex: 'hexagon', hexagon: 'hexagon', prepare: 'hexagon', 'lean-r': 'lean-r', 'lean-right': 'lean-r', 'in-out': 'lean-r', 'lean-l': 'lean-l', 'lean-left': 'lean-l', 'out-in': 'lean-l',
  'trap-b': 'trap-b', trapezoid: 'trap-b', priority: 'trap-b', 'trap-t': 'trap-t', 'inv-trapezoid': 'trap-t', manual: 'trap-t', odd: 'flag', flag: 'flag', doc: 'note', document: 'note',
  'sm-circ': 'start', start: 'start', 'small-circle': 'start', 'fr-circ': 'end', stop: 'end', 'framed-circle': 'end', fork: 'bar', join: 'bar', text: 'none', 'notch-rect': 'note', card: 'note',
  'f-circ': 'point', junction: 'point',
}

interface FlowCtx {
  b: GraphBuilder
  clusters: string[]
  classes: Map<string, string[]>
  defs: Map<string, NodeStyle>
}

const ID = /^[\p{L}\p{N}_$]+(?:-[\p{L}\p{N}_$]+)*/u

/** reads a node at `i`: id, shape and text, `:::class`, `@{…}`; returns its id and the next index */
function readNode(s: string, i: number, ctx: FlowCtx): [string, number] | null {
  while (s[i] === ' ' || s[i] === '\t') i++
  const m = ID.exec(s.slice(i))
  if (!m) return null
  const id = m[0]
  i += id.length
  let patch: Partial<GNode> = {}
  if (s.startsWith('@{', i)) {
    const end = s.indexOf('}', i)
    if (end > 0) {
      const body = s.slice(i + 2, end)
      const shape = /shape\s*:\s*["']?([\w-]+)/.exec(body)?.[1]
      const label = /label\s*:\s*("([^"]*)"|'([^']*)'|[^,]+)/.exec(body)
      if (shape && NEW_SHAPES[shape]) patch.shape = NEW_SHAPES[shape]
      if (label) patch.label = mText(label[2] ?? label[3] ?? label[1])
      i = end + 1
    }
  } else {
    for (const [open, closes, shapes] of OPENERS) {
      if (!s.startsWith(open, i)) continue
      let j = i + open.length
      let text = ''
      while (s[j] === ' ') j++
      if (s[j] === '"') {
        const e = s.indexOf('"', j + 1)
        if (e < 0) break
        text = s.slice(j, e + 1)
        j = e + 1
        while (s[j] === ' ') j++
      }
      let best = -1
      let which = 0
      closes.forEach((c, k) => {
        const at = s.indexOf(c, j)
        if (at >= 0 && (best < 0 || at < best)) {
          best = at
          which = k
        }
      })
      if (best < 0) break
      if (!text) text = s.slice(j, best)
      patch = { label: mText(text), shape: shapes[which] }
      i = best + closes[which].length
      break
    }
  }
  const cls = /^:::([\w-]+)/.exec(s.slice(i))
  if (cls) {
    ctx.classes.set(id, [...(ctx.classes.get(id) ?? []), cls[1]])
    i += cls[0].length
  }
  if (!ctx.b.isCluster(id)) {
    const n = ctx.b.node(id, patch)
    const cur = ctx.clusters[ctx.clusters.length - 1]
    if (cur !== undefined && cur !== id && (n.cluster === undefined || ctx.clusters.includes(n.cluster))) n.cluster = cur
  }
  return [id, i]
}

const HEAD: Record<string, Head> = { '>': 'arrow', o: 'circle', x: 'cross' }

/** reads an edge at `i` */
function readEdge(s: string, i: number): [Omit<GEdge, 'from' | 'to'>, number] | null {
  const rest = s.slice(i)
  // text form: -- text -->, == text ==>, -. text .->
  let m = /^\s*([<ox]?)(--|==|-\.)\s+(.+?)\s*(-{2,}|={2,}|\.+-)([>ox]?)(?=[\s\p{L}\p{N}_$"]|$)/u.exec(rest)
  let text: string | undefined
  let tail = ''
  let run = ''
  let head = ''
  let dotted = false
  if (m) {
    ;[, tail, , text, run, head] = m
    dotted = m[2] === '-.'
  } else {
    m = /^\s*(~{3,})/.exec(rest)
    if (m) return [{ line: 'hidden', minlen: 1 }, i + m[0].length]
    m = /^\s*([<ox]?)(-{2,}|={2,}|-\.+-)([>ox]?)(?![-=.])/.exec(rest)
    if (!m) return null
    ;[, tail, run, head] = m
    dotted = run.includes('.')
  }
  let len = m[0].length
  const pipe = /^\s*\|([^|]*)\|/.exec(rest.slice(len))
  if (pipe) {
    text = pipe[1]
    len += pipe[0].length
  }
  // `x` / `o` starting the next node name: only a head when followed by a space or the end
  if ((head === 'x' || head === 'o') && /^[\p{L}\p{N}_]/u.test(rest.slice(len)) && !pipe) {
    head = ''
    len--
  }
  const thick = run.includes('=')
  // the longer the arrow, the more ranks it spans: --> / --- / -.-> are one
  const extra = dotted ? (run.match(/\./g)?.length ?? 1) - 1 : run.length - (head ? 2 : 3)
  return [
    {
      label: text !== undefined && text.trim() ? mText(text) : undefined,
      head: HEAD[head] ?? 'none',
      tail: tail === '<' ? 'arrow' : tail === 'o' ? 'circle' : tail === 'x' ? 'cross' : 'none',
      line: thick ? 'thick' : dotted ? 'dashed' : 'solid',
      minlen: 1 + Math.max(0, Math.min(extra, 6)),
    },
    i + len,
  ]
}

function flowchart(head: string, body: string[], title?: string): Graph {
  const d = /^\w+\s+(\w+)/.exec(head)?.[1]?.toUpperCase()
  const b = new GraphBuilder(DIRS[d ?? 'TB'] ?? 'TB', 'rect')
  const ctx: FlowCtx = { b, clusters: [], classes: new Map(), defs: new Map() }
  const linkStyles: [string, NodeStyle][] = []
  const statements = body.flatMap((l) => splitTop(l, ';')).map((l) => l.trim()).filter(Boolean)
  // a header written on one line: "graph LR; A --> B"
  const inline = splitTop(head, ';').slice(1).map((l) => l.trim()).filter(Boolean)
  for (const st of [...inline, ...statements]) {
    let m: RegExpExecArray | null
    if ((m = /^subgraph\s+(.*)$/.exec(st))) {
      const rest = m[1].trim()
      let id = rest
      let label = rest
      const br = /^([^\s[]+)\s*\[(.*)\]$/.exec(rest)
      if (br) {
        id = br[1]
        label = br[2]
      }
      label = mText(label)
      id = id.replace(/^"(.*)"$/, '$1')
      const parent = ctx.clusters[ctx.clusters.length - 1]
      b.cluster(id, label, parent)
      ctx.clusters.push(id)
      continue
    }
    if (st === 'end') {
      ctx.clusters.pop()
      continue
    }
    if (/^direction\s+\w+$/.test(st)) continue
    if ((m = /^classDef\s+([\w,-]+)\s+(.+)$/.exec(st))) {
      for (const name of m[1].split(',')) ctx.defs.set(name.trim(), merge(ctx.defs.get(name.trim()), cssStyle(m[2])))
      continue
    }
    if ((m = /^class\s+([^\s]+)\s+([\w-]+)$/.exec(st))) {
      for (const id of m[1].split(',')) ctx.classes.set(id.trim(), [...(ctx.classes.get(id.trim()) ?? []), m[2]])
      continue
    }
    if ((m = /^style\s+([^\s]+)\s+(.+)$/.exec(st))) {
      const st2 = cssStyle(m[2])
      for (const id of m[1].split(',')) {
        if (b.isCluster(id)) {
          const c = b.g.clusters.find((x) => x.id === id)!
          c.style = merge(c.style, st2)
        } else b.node(id).style = merge(b.get(id)?.style, st2)
      }
      continue
    }
    if ((m = /^linkStyle\s+([\d,\s]+|default)\s+(.+)$/.exec(st))) {
      linkStyles.push([m[1].trim(), cssStyle(m[2])])
      continue
    }
    if (/^(click|accTitle|accDescr|callback)\b/.test(st)) continue
    // chain: nodes (& nodes) (edge nodes)*
    let i = 0
    let prev: string[] = []
    let pending: Omit<GEdge, 'from' | 'to'> | null = null
    for (;;) {
      const group: string[] = []
      for (;;) {
        const r = readNode(st, i, ctx)
        if (!r) break
        group.push(r[0])
        i = r[1]
        const amp = /^\s*&\s*/.exec(st.slice(i))
        if (!amp) break
        i += amp[0].length
      }
      if (!group.length) break
      if (pending) for (const a of prev) for (const z of group) b.edge({ ...pending, from: a, to: z })
      prev = group
      const e = readEdge(st, i)
      if (!e) break
      pending = e[0]
      i = e[1]
    }
  }
  // classes
  const def = ctx.defs.get('default')
  for (const n of b.g.nodes) {
    let st = def ? merge(undefined, def) : n.style
    if (def && n.style) st = merge(st, n.style)
    for (const c of ctx.classes.get(n.id) ?? []) st = merge(st, ctx.defs.get(c) ?? {})
    if (st) n.style = st
  }
  for (const c of b.g.clusters) for (const k of ctx.classes.get(c.id) ?? []) c.style = merge(c.style, ctx.defs.get(k) ?? {})
  for (const [which, st] of linkStyles) {
    const ids = which === 'default' ? b.g.edges.map((_, k) => k) : which.split(',').map((x) => Number(x.trim()))
    for (const k of ids) {
      const e = b.g.edges[k]
      if (!e) continue
      if (st.stroke) e.color = st.stroke
      if (st.sw) e.sw = st.sw
      if (st.dash) e.line = 'dashed'
    }
  }
  b.g.title = title
  return b.g
}

// ---------------------------------------------------------------- sequence

const SEQ_ARROWS: [string, boolean, MsgHead, boolean][] = [
  ['<<-->>', true, 'filled', true],
  ['<<->>', false, 'filled', true],
  ['-->>', true, 'filled', false],
  ['->>', false, 'filled', false],
  ['--x', true, 'cross', false],
  ['-x', false, 'cross', false],
  ['--)', true, 'open', false],
  ['-)', false, 'open', false],
  ['-->', true, 'none', false],
  ['->', false, 'none', false],
]

const P_KIND: Record<string, PKind> = { participant: 'participant', actor: 'actor', boundary: 'boundary', control: 'control', entity: 'entity', database: 'database', collections: 'collections', queue: 'queue' }

function sequence(body: string[], title?: string) {
  const b = new SequenceBuilder()
  b.s.title = title
  const blocks: ('box' | 'frag')[] = []
  const arrowRe = new RegExp(`^(.+?)\\s*(${SEQ_ARROWS.map(([a]) => a.replace(/[()|]/g, '\\$&')).join('|')})\\s*([+-]?)\\s*([^:]+?)\\s*(?::(.*))?$`)
  for (const raw of body) {
    const l = raw.trim()
    if (!l) continue
    let m: RegExpExecArray | null
    if ((m = /^(?:create\s+)?(participant|actor)\s+(.+?)(?:@\{(.*)\})?(?:\s+as\s+(.+))?$/.exec(l))) {
      const id = m[2].trim()
      const typ = m[3] ? /"type"\s*:\s*"(\w+)"/.exec(m[3])?.[1] : undefined
      b.participant(id, { kind: P_KIND[typ ?? m[1]] ?? 'participant', label: m[4] ? mText(m[4]) : id })
      continue
    }
    if ((m = /^destroy\s+(.+)$/.exec(l))) {
      b.push({ t: 'destroy', who: m[1].trim() })
      continue
    }
    if (/^autonumber\b/.test(l)) {
      b.s.autonumber = !/\boff\b/.test(l)
      continue
    }
    if ((m = /^title\s*:?\s*(.+)$/.exec(l))) {
      b.s.title = mText(m[1])
      continue
    }
    if ((m = /^(activate|deactivate)\s+(.+)$/.exec(l))) {
      b.push({ t: 'act', who: m[2].trim(), on: m[1] === 'activate' })
      continue
    }
    if ((m = /^note\s+(left of|right of|over)\s+([^:]+):(.*)$/i.exec(l))) {
      const pos = m[1].toLowerCase().startsWith('left') ? 'left' : m[1].toLowerCase().startsWith('right') ? 'right' : 'over'
      b.push({ t: 'note', pos, who: m[2].split(',').map((x) => x.trim()), text: mText(m[3]) })
      continue
    }
    if ((m = /^box\b/.exec(l))) {
      blocks.push('box')
      continue
    }
    if ((m = /^(loop|alt|opt|par|par_over|critical|break|rect)\b\s*(.*)$/.exec(l))) {
      blocks.push('frag')
      const kind = m[1] === 'par_over' ? 'par' : m[1]
      b.push({ t: 'block', kind, label: kind === 'rect' ? '' : mText(m[2]), fill: kind === 'rect' ? color(m[2]) : undefined })
      continue
    }
    if ((m = /^(else|and|option)\b\s*(.*)$/.exec(l))) {
      b.push({ t: 'else', label: mText(m[2]) })
      continue
    }
    if (l === 'end') {
      if (blocks.pop() === 'frag') b.push({ t: 'end' })
      continue
    }
    if ((m = arrowRe.exec(l))) {
      const arrow = SEQ_ARROWS.find(([a]) => a === m![2])!
      b.push({
        t: 'msg',
        from: m[1].trim(),
        to: m[4].trim(),
        text: mText(m[5] ?? ''),
        dashed: arrow[1],
        head: arrow[2],
        both: arrow[3],
        activate: m[3] === '+',
        deactivate: m[3] === '-',
      })
      continue
    }
  }
  return b.s
}

// ---------------------------------------------------------------- class diagram

interface ClassInfo {
  label?: string
  stereo?: string
  attrs: string[]
  methods: string[]
}

const generic = (s: string) => s.replace(/~([^~]*)~/g, '<$1>')

const MARK: Record<string, Head> = { '<|': 'triangle', '|>': 'triangle', '*': 'diamond', o: 'odiamond', '<': 'open', '>': 'open', '()': 'ocircle' }

function classDiagram(body: string[], title?: string) {
  const b = new GraphBuilder('TB', 'rect')
  const info = new Map<string, ClassInfo>()
  const ns: string[] = []
  const cls = (name: string) => {
    const id = name.replace(/~.*~$/, '')
    if (!info.has(id)) info.set(id, { attrs: [], methods: [], label: name !== id ? generic(name) : undefined })
    b.node(id, {}, ns[ns.length - 1])
    return info.get(id)!
  }
  const member = (c: ClassInfo, raw: string) => {
    const t = generic(raw.trim())
    if (!t) return
    const st = /^<<(.+)>>$/.exec(t)
    if (st) c.stereo = st[1]
    else if (t.includes('(')) c.methods.push(t.replace(/[$*]$/, ''))
    else c.attrs.push(t.replace(/[$*]$/, ''))
  }
  let inBody: ClassInfo | null = null
  let notes = 0
  const relRe = /^([^\s"]+?)\s*(?:"([^"]*)"\s*)?(<\||\*|o|<|\(\))?(--|\.\.)(\|>|\*|o|>|\(\))?\s*(?:"([^"]*)"\s*)?([^\s":]+)\s*(?::\s*(.*))?$/
  for (const raw of body) {
    const l = raw.trim()
    if (!l) continue
    if (inBody) {
      if (l === '}') inBody = null
      else member(inBody, l)
      continue
    }
    let m: RegExpExecArray | null
    if ((m = /^direction\s+(\w+)$/.exec(l))) {
      b.g.dir = DIRS[m[1].toUpperCase()] ?? 'TB'
      continue
    }
    if ((m = /^namespace\s+([\w.]+)\s*\{$/.exec(l))) {
      b.cluster(m[1], m[1], ns[ns.length - 1])
      ns.push(m[1])
      continue
    }
    if (l === '}' && ns.length) {
      ns.pop()
      continue
    }
    if ((m = /^class\s+([\w$~,<>.-]+?)(?:\["([^"]*)"\])?(?::::[\w-]+)?\s*(\{)?\s*(\})?$/.exec(l))) {
      const c = cls(m[1])
      if (m[2]) c.label = m[2]
      if (m[3] && !m[4]) inBody = c
      continue
    }
    if ((m = /^<<(.+)>>\s+(\S+)$/.exec(l))) {
      cls(m[2]).stereo = m[1]
      continue
    }
    if ((m = /^note\s+(?:for\s+(\S+)\s+)?"(.*)"$/.exec(l))) {
      const id = `__note${notes++}`
      b.node(id, { label: mText(m[2]), shape: 'note', style: { fill: '#fff6c8', stroke: '#c9a227' } })
      if (m[1]) b.edge({ from: id, to: m[1].replace(/~.*~$/, ''), line: 'dashed', head: 'none' })
      continue
    }
    if (/^(classDef|cssClass|click|callback|link|style)\b/.test(l)) continue
    if ((m = relRe.exec(l))) {
      const [, a, la, ma, line, mb, lb, z, label] = m
      cls(a)
      cls(z)
      b.edge({
        from: a.replace(/~.*~$/, ''),
        to: z.replace(/~.*~$/, ''),
        tail: ma ? MARK[ma] : 'none',
        head: mb ? MARK[mb] : 'none',
        line: line === '..' ? 'dashed' : 'solid',
        label: label ? mText(label) : undefined,
        tailLabel: la || undefined,
        headLabel: lb || undefined,
      })
      continue
    }
    if ((m = /^([\w$~.-]+)\s*:\s*(.+)$/.exec(l))) {
      member(cls(m[1]), m[2])
      continue
    }
  }
  for (const n of b.g.nodes) {
    const c = info.get(n.id)
    if (!c) continue
    const header: string[][] = []
    if (c.stereo) header.push([`«${c.stereo}»`])
    header.push([c.label ?? n.id])
    const sections: Section[] = [{ rows: header, bold: true, center: true }]
    if (c.attrs.length || c.methods.length) sections.push({ rows: c.attrs.map((a) => [a]) }, { rows: c.methods.map((a) => [a]) })
    n.sections = sections
  }
  b.g.title = title
  return b.g
}

// ---------------------------------------------------------------- state diagram

function stateDiagram(body: string[], title?: string) {
  const b = new GraphBuilder('TB', 'round')
  const scope: string[] = []
  const desc = new Map<string, string[]>()
  const defs = new Map<string, NodeStyle>()
  const classes = new Map<string, string[]>()
  let notes = 0
  let noteLines: string[] | null = null
  let noteFor: { id: string } | null = null
  const cur = () => scope[scope.length - 1]
  const state = (raw: string, asTarget: boolean): string => {
    let id = raw.trim()
    const cls = /:::([\w-]+)$/.exec(id)
    if (cls) {
      id = id.slice(0, cls.index)
      classes.set(id, [...(classes.get(id) ?? []), cls[1]])
    }
    if (id === '[*]') {
      const sid = `${cur() ?? ''}__${asTarget ? 'end' : 'start'}`
      b.node(sid, { label: '', shape: asTarget ? 'end' : 'start' }, cur())
      return sid
    }
    if (!b.isCluster(id)) b.node(id, {}, cur())
    return id
  }
  for (const raw of body) {
    const l = raw.trim()
    if (noteLines) {
      if (/^end\s*note$/i.test(l)) {
        const id = `__note${notes++}`
        b.node(id, { label: noteLines.join('\n'), shape: 'note', style: { fill: '#fff6c8', stroke: '#c9a227' } }, cur())
        if (noteFor) b.edge({ from: noteFor.id, to: id, line: 'dashed', head: 'none' })
        noteLines = null
      } else noteLines.push(l)
      continue
    }
    if (!l || l === '--') continue
    let m: RegExpExecArray | null
    if ((m = /^direction\s+(\w+)$/.exec(l))) {
      if (!scope.length) b.g.dir = DIRS[m[1].toUpperCase()] ?? 'TB'
      continue
    }
    if ((m = /^state\s+(?:"([^"]+)"\s+as\s+)?([\w.-]+)\s*(<<(fork|join|choice)>>)?\s*(\{)?$/.exec(l))) {
      const id = m[2]
      if (m[5]) {
        b.cluster(id, m[1] ? mText(m[1]) : id, cur())
        scope.push(id)
        continue
      }
      const kind = m[4]
      b.node(id, kind === 'fork' || kind === 'join' ? { shape: 'bar', label: '' } : kind === 'choice' ? { shape: 'diamond', label: '' } : m[1] ? { label: mText(m[1]) } : {}, cur())
      continue
    }
    if ((m = /^state\s+"([^"]+)"\s+as\s+([\w.-]+)\s*\{$/.exec(l))) {
      b.cluster(m[2], mText(m[1]), cur())
      scope.push(m[2])
      continue
    }
    if (l === '}') {
      scope.pop()
      continue
    }
    if ((m = /^note\s+(left of|right of|over)\s+([\w.-]+)\s*(?::\s*(.*))?$/i.exec(l))) {
      const target = m[2]
      if (m[3] !== undefined) {
        const id = `__note${notes++}`
        b.node(id, { label: mText(m[3]), shape: 'note', style: { fill: '#fff6c8', stroke: '#c9a227' } }, cur())
        b.edge({ from: target, to: id, line: 'dashed', head: 'none' })
      } else {
        noteLines = []
        noteFor = { id: target }
      }
      continue
    }
    if ((m = /^classDef\s+([\w-]+)\s+(.+)$/.exec(l))) {
      defs.set(m[1], cssStyle(m[2]))
      continue
    }
    if ((m = /^class\s+([\w,\s-]+?)\s+([\w-]+)$/.exec(l))) {
      for (const id of m[1].split(',')) classes.set(id.trim(), [...(classes.get(id.trim()) ?? []), m[2]])
      continue
    }
    if ((m = /^(.+?)\s*-->\s*([^:]+?)\s*(?::\s*(.*))?$/.exec(l))) {
      const a = state(m[1], false)
      const z = state(m[2], true)
      b.edge({ from: a, to: z, head: 'arrow', label: m[3] ? mText(m[3]) : undefined })
      continue
    }
    if ((m = /^([\w.-]+)\s*:\s*(.+)$/.exec(l))) {
      state(m[1], false)
      desc.set(m[1], [...(desc.get(m[1]) ?? []), mText(m[2])])
      continue
    }
    if ((m = /^([\w.-]+)$/.exec(l))) state(m[1], false)
  }
  for (const n of b.g.nodes) {
    const d = desc.get(n.id)
    if (d && n.shape === 'round') n.sections = [{ rows: [[n.label]], bold: true, center: true }, { rows: d.map((x) => [x]) }]
    for (const c of classes.get(n.id) ?? []) n.style = merge(n.style, defs.get(c) ?? {})
  }
  b.g.title = title
  return b.g
}

// ---------------------------------------------------------------- ER diagram

const CARD: Record<string, Head> = { '|o': 'zero-one', 'o|': 'zero-one', '||': 'one', '}o': 'zero-many', 'o{': 'zero-many', '}|': 'one-many', '|{': 'one-many' }
const CARD_WORDS: Record<string, Head> = {
  'one or zero': 'zero-one', 'zero or one': 'zero-one', 'one or more': 'one-many', 'one or many': 'one-many', 'many(1)': 'one-many', '1+': 'one-many',
  'zero or more': 'zero-many', 'zero or many': 'zero-many', 'many(0)': 'zero-many', '0+': 'zero-many', 'only one': 'one', '1': 'one',
}

function erDiagram(body: string[], title?: string) {
  const b = new GraphBuilder('TB', 'rect')
  const attrs = new Map<string, string[][]>()
  const labels = new Map<string, string>()
  let inEntity: string | null = null
  const entity = (raw: string) => {
    const m = /^([\w-]+)(?:\[\s*"?([^"\]]*)"?\s*\])?$/.exec(raw.trim().replace(/^"(.*)"$/, '$1'))
    const id = m ? m[1] : raw.trim().replace(/^"(.*)"$/, '$1')
    if (m?.[2]) labels.set(id, m[2])
    b.node(id)
    if (!attrs.has(id)) attrs.set(id, [])
    return id
  }
  const words = Object.keys(CARD_WORDS)
    .sort((x, y) => y.length - x.length)
    .map((w) => w.replace(/[()+]/g, '\\$&'))
    .join('|')
  const symRe = /^(\S+)\s+(\|o|\|\||\}o|\}\|)(--|\.\.)(o\||\|\||o\{|\|\{)\s+(\S+)\s*:\s*(.*)$/
  const wordRe = new RegExp(`^(\\S+)\\s+(${words})\\s+(to|optionally to)\\s+(${words})\\s+(\\S+)\\s*:\\s*(.*)$`, 'i')
  for (const raw of body) {
    const l = raw.trim()
    if (!l) continue
    if (inEntity) {
      if (l === '}') {
        inEntity = null
        continue
      }
      const m = /^(\S+)\s+(\S+)((?:\s+(?:PK|FK|UK)\s*,?)*)\s*(?:"(.*)")?$/.exec(l)
      if (m) attrs.get(inEntity)!.push([m[1].replace(/~([^~]*)~/g, '<$1>'), m[2], m[3].replace(/\s+/g, ' ').trim(), m[4] ?? ''])
      continue
    }
    let m: RegExpExecArray | null
    if ((m = /^direction\s+(\w+)$/.exec(l))) {
      b.g.dir = DIRS[m[1].toUpperCase()] ?? 'TB'
      continue
    }
    if ((m = /^(.+?)\s*\{$/.exec(l))) {
      inEntity = entity(m[1])
      continue
    }
    if ((m = symRe.exec(l))) {
      const a = entity(m[1])
      const z = entity(m[5])
      b.edge({ from: a, to: z, tail: CARD[m[2]], head: CARD[m[4]], line: m[3] === '..' ? 'dashed' : 'solid', label: mText(m[6]) || undefined })
      continue
    }
    if ((m = wordRe.exec(l))) {
      const a = entity(m[1])
      const z = entity(m[5])
      b.edge({ from: a, to: z, tail: CARD_WORDS[m[2].toLowerCase()], head: CARD_WORDS[m[4].toLowerCase()], line: m[3].toLowerCase() === 'to' ? 'solid' : 'dashed', label: mText(m[6]) || undefined })
      continue
    }
    if ((m = /^([\w-]+(?:\[[^\]]*\])?)$/.exec(l))) entity(m[1])
  }
  for (const n of b.g.nodes) {
    const rows = attrs.get(n.id) ?? []
    const shown = rows.map((r) => r.filter((c, k) => k < 2 || c))
    n.sections = [{ rows: [[labels.get(n.id) ?? n.id]], bold: true, center: true }]
    if (rows.length) n.sections.push({ rows: shown })
  }
  b.g.title = title
  return b.g
}

// ---------------------------------------------------------------- pie

function pie(head: string, body: string[], title?: string) {
  const showData = /\bshowData\b/.test(head)
  let t = /\btitle\s+(.+)$/.exec(head)?.[1] ?? title
  const slices: { label: string; value: number }[] = []
  for (const raw of body) {
    const l = raw.trim()
    let m: RegExpExecArray | null
    if ((m = /^title\s+(.+)$/.exec(l))) t = m[1]
    else if ((m = /^"([^"]*)"\s*:\s*([-\d.eE+]+)$/.exec(l))) slices.push({ label: mText(m[1]), value: Number(m[2]) })
  }
  return { title: t ? mText(t) : undefined, showData, slices }
}

// ---------------------------------------------------------------- gantt

const UNIT: Record<string, number> = { ms: 1, s: 1e3, m: 60e3, h: 3600e3, d: 864e5, w: 7 * 864e5, M: 30 * 864e5, y: 365 * 864e5 }

/** a date in `fmt` (dayjs-style tokens), UTC */
export function parseDate(s: string, fmt: string): number | undefined {
  s = s.trim()
  if (fmt === 'X') return Number(s) * 1000
  if (fmt === 'x') return Number(s)
  const order: string[] = []
  const re = fmt.replace(/YYYY|YY|MM|M|DD|D|HH|H|mm|ss|SSS|[.*+?^${}()|[\]\\]/g, (t) => {
    if (/^[.*+?^${}()|[\]\\]$/.test(t)) return '\\' + t
    order.push(t)
    return t === 'YYYY' ? '(\\d{4})' : t === 'SSS' ? '(\\d{3})' : t.length === 1 ? '(\\d{1,2})' : '(\\d{2})'
  })
  const m = new RegExp(`^${re}$`).exec(s)
  if (!m) {
    const t = Date.parse(s.length === 10 ? s + 'T00:00:00Z' : s)
    return Number.isFinite(t) ? t : undefined
  }
  const v: Record<string, number> = {}
  order.forEach((t, k) => (v[t[0]] = Number(m[k + 1])))
  const year = v.Y !== undefined ? (order.includes('YY') ? 2000 + v.Y : v.Y) : 1970
  return Date.UTC(year, (v.M ?? 1) - 1, v.D ?? 1, v.H ?? 0, v.m ?? 0, v.s ?? 0, v.S ?? 0)
}

function gantt(body: string[], title?: string) {
  let fmt = 'YYYY-MM-DD'
  let t = title
  const sections: { name: string; tasks: GanttTask[] }[] = []
  const byId = new Map<string, GanttTask>()
  let last: GanttTask | undefined
  const today = (() => {
    const d = new Date()
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  })()
  for (const raw of body) {
    const l = raw.trim()
    if (!l) continue
    let m: RegExpExecArray | null
    if ((m = /^dateFormat\s+(.+)$/.exec(l))) fmt = m[1].trim()
    else if ((m = /^title\s+(.+)$/.exec(l))) t = m[1]
    else if (/^(axisFormat|tickInterval|excludes|includes|todayMarker|weekday|inclusiveEndDates|topAxis|displayMode)\b/.test(l)) continue
    else if ((m = /^section\s+(.*)$/.exec(l))) sections.push({ name: mText(m[1]), tasks: [] })
    else if ((m = /^(.+?)\s*:\s*(.+)$/.exec(l))) {
      const name = mText(m[1])
      const parts = m[2].split(',').map((x) => x.trim()).filter(Boolean)
      const task: GanttTask = { name, start: 0, end: 0 }
      while (parts.length && /^(done|active|crit|milestone)$/.test(parts[0])) {
        const tag = parts.shift() as 'done' | 'active' | 'crit' | 'milestone'
        task[tag] = true
      }
      let id: string | undefined
      if (parts.length >= 3) id = parts.shift()
      let startRaw: string | undefined
      let endRaw: string | undefined
      if (parts.length >= 2) [startRaw, endRaw] = parts
      else endRaw = parts[0]
      // "id, duration": an id is a word that is not a duration, a date or a dependency
      const startAt = (s: string | undefined): number => {
        if (!s) return last ? last.end : today
        const after = /^after\s+(.+)$/.exec(s)
        if (after) {
          const ends = after[1].split(/\s+/).map((x) => byId.get(x)?.end).filter((x): x is number => x !== undefined)
          return ends.length ? Math.max(...ends) : last ? last.end : today
        }
        return parseDate(s, fmt) ?? (last ? last.end : today)
      }
      if (parts.length === 2 && !/^after\s/.test(startRaw!) && parseDate(startRaw!, fmt) === undefined && !/^\d/.test(startRaw!)) {
        id = startRaw
        startRaw = undefined
      }
      task.start = startAt(startRaw)
      const dur = endRaw && /^([\d.]+)\s*(ms|s|m|h|d|w|M|y)$/.exec(endRaw)
      const until = endRaw && /^until\s+(.+)$/.exec(endRaw)
      if (dur) task.end = task.start + Number(dur[1]) * UNIT[dur[2]]
      else if (until) task.end = byId.get(until[1].trim())?.start ?? task.start
      else if (endRaw) task.end = parseDate(endRaw, fmt) ?? task.start + 864e5
      else task.end = task.start + 864e5
      if (task.milestone) task.end = task.start
      if (id) byId.set(id, task)
      if (!sections.length) sections.push({ name: '', tasks: [] })
      sections[sections.length - 1].tasks.push(task)
      last = task
    }
  }
  return { title: t ? mText(t) : undefined, sections }
}

// ---------------------------------------------------------------- mindmap

const TREE_SHAPES: [RegExp, TreeNode['shape']][] = [
  [/^[\w-]*\(\((.*)\)\)$/, 'circle'],
  [/^[\w-]*\)\)(.*)\(\($/, 'cloud'],
  [/^[\w-]*\)(.*)\($/, 'cloud'],
  [/^[\w-]*\{\{(.*)\}\}$/, 'hexagon'],
  [/^[\w-]*\[(.*)\]$/, 'rect'],
  [/^[\w-]*\((.*)\)$/, 'round'],
]

function mindmap(body: string[]): TreeNode {
  const stack: { indent: number; n: TreeNode }[] = []
  let root: TreeNode | undefined
  for (const raw of body) {
    if (!raw.trim()) continue
    const text = raw.trim().replace(/:::[\w\s-]+$/, '').trim()
    if (/^::icon\(/.test(text) || !text) continue
    const indent = raw.replace(/\t/g, '    ').search(/\S/)
    let label = text
    let shape: TreeNode['shape'] = undefined
    for (const [re, sh] of TREE_SHAPES) {
      const m = re.exec(text)
      if (m) {
        label = m[1]
        shape = sh
        break
      }
    }
    const node: TreeNode = { label: mText(label), shape, children: [] }
    if (!root) {
      root = node
      stack.push({ indent, n: node })
      continue
    }
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop()
    stack[stack.length - 1].n.children.push(node)
    stack.push({ indent, n: node })
  }
  if (!root) throw new DiagramError('The mind map is empty')
  return root
}
