/**
 * PlantUML: sequence, class / object, use case, component / deployment, state and activity diagrams, mind maps and
 * work breakdown structures; @startdot hands over to the Graphviz reader. A file may hold several diagrams.
 * https://plantuml.com
 */
import type { TreeNode } from './charts'
import { parseDot } from './dot'
import { GraphBuilder, type GEdge, type Head, type Rendered, type Section, type Shape } from './graph'
import { renderModel, type Model } from './model'
import { SequenceBuilder, type MsgHead, type PKind } from './sequence'
import { color, DiagramError, labelText } from './svg'

/** the diagrams of a file: the text of each @startX … @endX block (the whole text when there is none) */
export function plantUmlBlocks(src: string): { kind: string; lines: string[] }[] {
  const text = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const out: { kind: string; lines: string[] }[] = []
  const re = /^[ \t]*@start(\w+)[^\n]*\n([\s\S]*?)^[ \t]*@end\1\b/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push({ kind: m[1].toLowerCase(), lines: m[2].split('\n') })
  if (!out.length) out.push({ kind: 'uml', lines: text.split('\n') })
  return out
}

export function parsePlantUml(src: string): Model[] {
  return plantUmlBlocks(src).map(({ kind, lines }) => parseBlock(kind, lines))
}

export const renderPlantUml = (src: string): Rendered[] => parsePlantUml(src).map(renderModel)

function parseBlock(kind: string, raw: string[]): Model {
  if (kind === 'dot') return { t: 'graph', graph: parseDot(raw.join('\n'))[0] }
  const { lines, title, dir } = clean(raw)
  switch (kind) {
    case 'uml':
      break
    case 'mindmap':
    case 'wbs':
      return { t: 'tree', root: tree(lines, kind === 'wbs'), title }
    default:
      throw new DiagramError(`PlantUML @start${kind} diagrams are not supported yet`)
  }
  switch (umlKind(lines)) {
    case 'activity':
      return { t: 'graph', graph: { ...activity(lines), title } }
    case 'sequence':
      return { t: 'sequence', seq: { ...sequence(lines), title } }
    case 'state':
      return { t: 'graph', graph: { ...state(lines, dir), title } }
    default:
      return { t: 'graph', graph: { ...description(lines, dir), title } }
  }
}

/** creole / HTML markup out of a label */
export function pText(s: string): string {
  return labelText(
    s
      .trim()
      .replace(/^"(.*)"$/s, '$1')
      .replace(/\*\*(.+?)\*\*|\/\/(.+?)\/\/|""(.+?)""|__(.+?)__|~~(.+?)~~|--(.+?)--/g, (...m) => m.slice(1, 7).find((x) => x !== undefined) ?? '')
      .replace(/<\/?(?:b|i|u|s|font|color|size|back|code|plain|strike|w|sub|sup)\b[^>]*>/gi, '')
      .replace(/<&[\w-]+>/g, '')
      .replace(/\\t/g, '  '),
  )
}

/** comments, skinparams, legends, headers out; the title and the direction */
function clean(raw: string[]): { lines: string[]; title?: string; dir?: 'LR' | 'TB' } {
  const lines: string[] = []
  let title: string | undefined
  let dir: 'LR' | 'TB' | undefined
  let skip: RegExp | null = null
  let titleLines: string[] | null = null
  let inComment = false
  for (let l of raw) {
    if (inComment) {
      const e = l.indexOf("'/")
      if (e < 0) continue
      l = l.slice(e + 2)
      inComment = false
    }
    l = l.replace(/\/'.*?'\//g, '')
    const c = l.indexOf("/'")
    if (c >= 0) {
      l = l.slice(0, c)
      inComment = true
    }
    const t = l.trim()
    if (skip) {
      if (skip.test(t)) skip = null
      continue
    }
    if (titleLines) {
      if (/^end\s*title$/i.test(t)) {
        title = pText(titleLines.join('\n'))
        titleLines = null
      } else titleLines.push(t)
      continue
    }
    if (!t || t.startsWith("'")) continue
    let m: RegExpExecArray | null
    if (/^skinparam\b.*\{$/i.test(t) || /^(legend|header|footer)\b(?!.*:)/i.test(t) && !/^(header|footer)\s+\S/i.test(t)) {
      skip = /^(\}|end\s*legend|endlegend|end\s*header|endheader|end\s*footer|endfooter)$/i
      continue
    }
    if (/^(skinparam|!|hide|show|scale|caption|header|footer|newpage|allowmixing|autoactivate|set\s+namespaceSeparator|page|mainframe|sprite|remove|restore|together|left\s+header|right\s+footer)\b/i.test(t)) continue
    if ((m = /^title\s*:?\s*(.*)$/i.exec(t))) {
      if (m[1]) title = pText(m[1])
      else titleLines = []
      continue
    }
    if (/^left\s+to\s+right\s+direction$/i.test(t)) {
      dir = 'LR'
      continue
    }
    if (/^top\s+to\s+bottom\s+direction$/i.test(t)) {
      dir = 'TB'
      continue
    }
    lines.push(t)
  }
  return { lines, title, dir }
}

function umlKind(lines: string[]): 'activity' | 'sequence' | 'state' | 'description' {
  const has = (re: RegExp) => lines.some((l) => re.test(l))
  if (has(/^(start|stop)$/) || has(/^:[\s\S]*[;|<>/\]}]$/) || has(/^:/) || has(/^(if\s*\(.*\)\s*then|while\s*\(|repeat\b|fork$|endif$)/)) return 'activity'
  if (has(/\[\*\]/) || has(/^state\s/)) return 'state'
  if (has(/^(participant|boundary|control|collections|queue|autonumber|activate|deactivate|alt|loop|return|ref\s+over)\b/) || has(/^(==.*==|\.\.\.|\|\|\d*\|\|)$/)) return 'sequence'
  if (has(/^(abstract|class|interface|enum|annotation|struct|protocol|object|map|json|usecase|component|node|cloud|package|namespace|folder|frame|rectangle|artifact|storage|card|file|agent|person|hexagon|together)\b/)) return 'description'
  if (has(/\([^)]*\)|\[[^\]*]+\]|<\|--|--\|>|\*--|o--|\.\.>/)) return 'description'
  if (has(/^(actor|database|entity)\b/) || has(/^\S+\s*<?-{1,2}>?>?\s*\S+\s*:/)) return 'sequence'
  return 'description'
}

// ---------------------------------------------------------------- sequence

const KIND: Record<string, PKind> = { participant: 'participant', actor: 'actor', boundary: 'boundary', control: 'control', entity: 'entity', database: 'database', collections: 'collections', queue: 'queue' }

function sequence(lines: string[]) {
  const b = new SequenceBuilder()
  const calls: { from: string; to: string }[] = []
  let noteLines: string[] | null = null
  let note: { pos: 'left' | 'right' | 'over'; who: string[] } | null = null
  let last: { from: string; to: string } | null = null
  const id = (s: string) => {
    const t = s.trim().replace(/^"(.*)"$/, '$1')
    return t
  }
  for (const l of lines) {
    if (noteLines) {
      if (/^end\s*(note|ref|rnote|hnote)$/i.test(l)) {
        if (note && note.who.length) b.push({ t: 'note', pos: note.pos, who: note.who, text: pText(noteLines.join('\n')) })
        noteLines = null
      } else noteLines.push(l)
      continue
    }
    let m: RegExpExecArray | null
    if ((m = /^(?:create\s+)?(participant|actor|boundary|control|entity|database|collections|queue)\s+(.+)$/.exec(l))) {
      let rest = m[2].replace(/\s+order\s+-?\d+/, '').trim()
      const col = /\s+(#\w+)\s*$/.exec(rest)
      if (col) rest = rest.slice(0, col.index).trim()
      rest = rest.replace(/<<[^>]*>>/g, '').trim()
      let pid = rest
      let label = rest
      const as1 = /^"([^"]+)"\s+as\s+(\S+)$/.exec(rest)
      const as2 = /^(\S+)\s+as\s+"?([^"]+)"?$/.exec(rest)
      if (as1) [pid, label] = [as1[2], as1[1]]
      else if (as2) [pid, label] = [as2[1], as2[2]]
      else pid = label = id(rest)
      b.participant(pid, { kind: KIND[m[1].toLowerCase()], label: pText(label), fill: col ? color(col[1].slice(1)) ?? color(col[1]) : undefined })
      continue
    }
    if (/^hide\s+footbox$/i.test(l)) {
      b.s.footer = false
      continue
    }
    if (/^autonumber\b/i.test(l)) {
      b.s.autonumber = !/\bstop\b/i.test(l)
      continue
    }
    if ((m = /^(activate|deactivate|destroy)\s+(\S+)/i.exec(l))) {
      const who = id(m[2])
      if (m[1].toLowerCase() === 'destroy') b.push({ t: 'destroy', who })
      else b.push({ t: 'act', who, on: m[1].toLowerCase() === 'activate' })
      continue
    }
    if ((m = /^return\b\s*(.*)$/i.exec(l))) {
      const c = calls.pop() ?? (last ? { from: last.from, to: last.to } : null)
      if (c) b.push({ t: 'msg', from: c.to, to: c.from, text: pText(m[1]), dashed: true, head: 'filled', deactivate: true })
      continue
    }
    if ((m = /^[rh]?note\s+(left|right|over)(?:\s+of)?\s*([^:]*?)\s*(?:#\w+)?\s*(?::\s*(.*))?$/i.exec(l)) || (m = /^ref\s+over\s+()([^:]+?)\s*(?::\s*(.*))?$/i.exec(l))) {
      const pos = (m[1] || 'over').toLowerCase() as 'left' | 'right' | 'over'
      let who = m[2] ? m[2].split(',').map(id).filter(Boolean) : []
      if (!who.length && last) who = [pos === 'left' ? last.from : last.to]
      if (!who.length && b.s.participants.length) who = [b.s.participants[0].id]
      if (m[3] !== undefined) {
        if (who.length) b.push({ t: 'note', pos, who, text: pText(m[3]) })
      } else {
        noteLines = []
        note = { pos, who }
      }
      continue
    }
    if ((m = /^note\s+across\s*:\s*(.*)$/i.exec(l))) {
      const ps = b.s.participants
      if (ps.length) b.push({ t: 'note', pos: 'over', who: [ps[0].id, ps[ps.length - 1].id], text: pText(m[1]) })
      continue
    }
    if ((m = /^(alt|opt|loop|par|break|critical|group)\b\s*(.*)$/i.exec(l))) {
      const kind = m[1].toLowerCase()
      b.push({ t: 'block', kind: kind === 'group' ? pText(m[2]) || 'group' : kind, label: kind === 'group' ? '' : pText(m[2]) })
      continue
    }
    if ((m = /^else\b\s*(.*)$/i.exec(l))) {
      b.push({ t: 'else', label: pText(m[1]) })
      continue
    }
    if (/^end$/i.test(l)) {
      b.push({ t: 'end' })
      continue
    }
    if (/^(box\b|end\s*box)/i.test(l)) continue
    if ((m = /^==\s*(.*?)\s*==$/.exec(l))) {
      b.push({ t: 'divider', text: pText(m[1]) })
      continue
    }
    if ((m = /^\.\.\.\s*(.*?)\s*(?:\.\.\.)?$/.exec(l))) {
      b.push({ t: 'delay', text: pText(m[1]) })
      continue
    }
    if ((m = /^\|\|(\d*)\|\|$/.exec(l)) || l === '|||') {
      b.push({ t: 'space', h: m?.[1] ? Math.min(400, Number(m[1])) : 20 })
      continue
    }
    const msg = seqMessage(l)
    if (msg) {
      const { from, to, dashed, head, both, act, text } = msg
      b.push({ t: 'msg', from, to, text, dashed, head, both, activate: act === '++', deactivate: act === '--' })
      last = { from, to }
      if (act === '++') calls.push({ from, to })
      if (act === '--' && calls.length) calls.pop()
      if (act === '**') b.participant(to)
      if (act === '!!') b.push({ t: 'destroy', who: to })
    }
  }
  return b.s
}

const ARROW = /^(\[|\]|[\w.$À-￿]+|"[^"]+")?\s*(<<?|[\\/]{1,2})?(-{1,2}|\.{1,2})(?:\[[^\]]*\])?(-?)(>>?|[\\/]{1,2})?\s*([ox])?\s*(\[|\]|[\w.$À-￿]+|"[^"]+")?\s*(\+\+|--|\*\*|!!)?\s*(?::\s*(.*))?$/u

function seqMessage(l: string) {
  // "o->", "x<-": lost / found markers before the arrow
  const m = ARROW.exec(l.replace(/^(\S+)\s*([ox])(?=<|-)/, '$1 '))
  if (!m) return null
  const [, a, left, line, , right, , z, act, text] = m
  if (!left && !right) return null
  if (!a || !z) return null
  const clean = (s: string) => s.replace(/^"(.*)"$/, '$1')
  let from = clean(a)
  let to = clean(z)
  if (from === '[' || from === ']' || to === '[' || to === ']') return null
  const dashed = line === '--' || line.startsWith('.')
  const headOf = (s: string | undefined): MsgHead => (!s ? 'none' : s === '>>' || s === '<<' ? 'open' : s.length && /[\\/]/.test(s) ? 'half' : 'filled')
  let head: MsgHead
  let both = false
  if (left && right) {
    head = headOf(right)
    both = true
  } else if (left) {
    ;[from, to] = [to, from]
    head = headOf(left)
  } else head = headOf(right)
  if (/x\s*$/.test(l.split(':')[0].replace(z, '').trim()) && !left) head = 'cross'
  return { from, to, dashed, head, both, act, text: pText(text ?? '') }
}

// ---------------------------------------------------------------- class, use case, component… (description diagrams)

const ELEMENT: Record<string, Shape> = {
  actor: 'actor', person: 'actor', usecase: 'ellipse', component: 'component', node: 'box3d', database: 'cylinder', cloud: 'cloud', folder: 'folder', frame: 'folder',
  package: 'folder', artifact: 'note', file: 'note', storage: 'stadium', queue: 'stadium', stack: 'rect', card: 'rect', rectangle: 'rect', agent: 'rect', label: 'none',
  boundary: 'circle', control: 'circle', entity: 'rect', collections: 'rect', hexagon: 'hexagon', interface: 'rect', circle: 'circle', port: 'point', portin: 'point', portout: 'point',
  action: 'rect', process: 'round', usecase_: 'ellipse', object: 'rect', map: 'rect', json: 'rect', diamond: 'diamond', state: 'round',
}
const CLASSES = new Set(['class', 'abstract', 'abstract class', 'interface', 'enum', 'annotation', 'struct', 'protocol', 'entity', 'exception', 'metaclass', 'stereotype', 'object', 'map', 'json'])

const MARKS: Record<string, Head> = {
  '>': 'arrow', '<': 'arrow', '|>': 'triangle', '<|': 'triangle', '^': 'triangle', '*': 'diamond', o: 'odiamond', '#': 'odiamond', x: 'cross', '+': 'ocircle',
  '{': 'many', '}': 'many', '>>': 'open', '<<': 'open', '|o': 'zero-one', 'o|': 'zero-one', '||': 'one', '}o': 'zero-many', 'o{': 'zero-many', '}|': 'one-many', '|{': 'one-many',
}

const END = String.raw`\[\*\]|\[[^\]]+\]|\([^)]*\)|:[^:]+:|"[^"]+"|\(\)\s*"[^"]+"|\(\)\s*[\w.]+|[\w.$À-￿-]+`
const LINK = new RegExp(
  String.raw`^(${END})\s*(?:"([^"]*)"\s*)?((?:<\||<<|\}o|\}\||\|o|\|\||[<*o#x+^}])?)([-.=~]+)(?:\[([^\]]*)\])?((?:up|down|left|right|u|d|l|r|le|ri|do)?)([-.=~]*)(?:\[([^\]]*)\])?((?:\|>|>>|o\{|\|\{|o\||\|\||[>*#+^{]|[ox](?=\s|\[|\(|"|:|$))?)\s*(?:"([^"]*)"\s*)?(${END})\s*(?::\s*(.*))?$`,
  'u',
)

interface ClassInfo {
  kind: string
  stereo?: string
  sections: string[][]
}

function description(lines: string[], dir?: 'LR' | 'TB') {
  const b = new GraphBuilder(dir ?? 'TB', 'rect')
  const info = new Map<string, ClassInfo>()
  const ns: string[] = []
  const stackKinds: string[] = []
  let body: { id: string; c: ClassInfo } | null = null
  let noteLines: string[] | null = null
  let noteTarget: string | undefined
  let noteId = ''
  let notes = 0
  let anon = 0
  const cur = () => ns[ns.length - 1]
  /** an element written in a link or a declaration: its id (created when new) */
  const element = (raw: string): string => {
    let t = raw.trim()
    let m: RegExpExecArray | null
    if (t === '(*)') return 'start'
    if ((m = /^\[(.+)\]$/.exec(t))) return ensure(m[1], 'component')
    if ((m = /^\((.*)\)$/.exec(t))) return ensure(m[1], 'ellipse')
    if ((m = /^:(.+):$/.exec(t))) return ensure(m[1], 'actor')
    if ((m = /^\(\)\s*"?([^"]+)"?$/.exec(t))) return ensure(m[1], 'circle')
    t = t.replace(/^"(.*)"$/, '$1')
    if (!b.has(t) && !b.isCluster(t)) b.node(t, { label: pText(t) }, cur())
    return t
  }
  const ensure = (name: string, shape: Shape) => {
    const id = name.trim()
    if (!b.has(id) && !b.isCluster(id)) b.node(id, { label: pText(id), shape }, cur())
    return id
  }
  for (const l of lines) {
    if (noteLines) {
      if (/^end\s*note$/i.test(l)) {
        b.node(noteId, { label: pText(noteLines.join('\n')), shape: 'note', style: { fill: '#fff6c8', stroke: '#c9a227' } }, cur())
        if (noteTarget) b.edge({ from: noteTarget, to: noteId, line: 'dashed', head: 'none' })
        noteLines = null
      } else noteLines.push(l)
      continue
    }
    if (body) {
      if (l === '}') {
        body = null
        continue
      }
      if (/^(--|==|\.\.|__)(.*?)(--|==|\.\.|__)?$/.test(l)) body.c.sections.push([])
      else body.c.sections[body.c.sections.length - 1].push(pText(l.replace(/\{(static|abstract|classifier|field|method)\}\s*/g, '')))
      continue
    }
    let m: RegExpExecArray | null
    if (l === '}' || /^end\s*(package|namespace|rectangle|node|folder|frame|together)$/i.test(l)) {
      ns.pop()
      stackKinds.pop()
      continue
    }
    // note
    if ((m = /^note\s+(left|right|top|bottom)(?:\s+of)?\s+(\S+?)\s*(?:#\w+)?\s*(?::\s*(.*))?$/i.exec(l))) {
      const target = element(m[2])
      const nid = `__note${notes++}`
      if (m[3] !== undefined) {
        b.node(nid, { label: pText(m[3]), shape: 'note', style: { fill: '#fff6c8', stroke: '#c9a227' } }, cur())
        b.edge({ from: target, to: nid, line: 'dashed', head: 'none' })
      } else {
        noteLines = []
        noteTarget = target
        noteId = nid
      }
      continue
    }
    if ((m = /^note\s+"([^"]*)"\s+as\s+(\S+)$/i.exec(l))) {
      b.node(m[2], { label: pText(m[1]), shape: 'note', style: { fill: '#fff6c8', stroke: '#c9a227' } }, cur())
      continue
    }
    if ((m = /^note\s+as\s+(\S+)$/i.exec(l))) {
      noteLines = []
      noteTarget = undefined
      noteId = m[1]
      continue
    }
    // container: package "Name" { / rectangle System {
    if ((m = /^(package|namespace|rectangle|node|folder|frame|cloud|database|component|card|storage|artifact|file|stack|queue|agent|hexagon|together)\s*(?:"([^"]*)"|([^\s{<#]+))?\s*(?:as\s+(\S+))?\s*(<<[^>]*>>)?\s*(#\S+)?\s*\{$/.exec(l))) {
      const kind = m[1].toLowerCase()
      const label = m[2] ?? m[3] ?? ''
      const cid = m[4] ?? (m[3] || m[2] || `__group${anon++}`)
      const c = b.cluster(cid, kind === 'together' ? '' : pText(label), cur())
      const fill = m[6] ? color(m[6].slice(1)) ?? color(m[6]) : undefined
      if (fill) c.style = { fill }
      if (kind === 'together') c.style = { fill: 'none', stroke: 'none' }
      ns.push(cid)
      stackKinds.push(kind)
      continue
    }
    // class-like declaration
    if ((m = /^(abstract\s+class|abstract|class|interface|enum|annotation|struct|protocol|entity|exception|metaclass|stereotype|object|map|json)\s+(?:"([^"]+)"\s+as\s+(\S+)|(\S+)\s+as\s+"([^"]+)"|([^\s{<#]+))(?:\s*<([^>]+)>)?\s*(<<.+?>>)?\s*(#\S+)?\s*(\{)?\s*(\})?$/.exec(l)) && CLASSES.has(m[1].toLowerCase().replace(/\s+/, ' '))) {
      const kind = m[1].toLowerCase().replace(/\s+/, ' ')
      const cid = m[3] ?? m[4] ?? m[6]
      const label = m[2] ?? m[5] ?? cid
      const generic = m[7] ? `<${m[7]}>` : ''
      b.node(cid, { label: pText(label) + generic, shape: 'rect' }, cur())
      const c: ClassInfo = info.get(cid) ?? { kind, sections: [[], []] }
      c.kind = kind
      if (m[8]) c.stereo = m[8].replace(/^<<|>>$/g, '').trim()
      const fill = m[9] ? color(m[9].slice(1)) ?? color(m[9]) : undefined
      if (fill) b.node(cid).style = { fill }
      info.set(cid, c)
      if (m[10] && !m[11]) {
        c.sections = [[]]
        body = { id: cid, c }
      }
      continue
    }
    // element declaration
    if ((m = /^(actor\/?|usecase\/?|component|node|database|cloud|folder|frame|package|artifact|file|storage|queue|stack|card|rectangle|agent|label|boundary|control|entity|collections|hexagon|interface|circle|person|port|portin|portout|action|process|diamond)\s+(.+)$/.exec(l))) {
      const kind = m[1].toLowerCase().replace('/', '')
      let rest = m[2].trim()
      const col = /\s+(#[\w]+)\s*$/.exec(rest)
      if (col) rest = rest.slice(0, col.index).trim()
      const stereo = /\s*<<(.+?)>>\s*$/.exec(rest)
      if (stereo) rest = rest.slice(0, stereo.index).trim()
      let id = rest
      let label = rest
      const a1 = /^(.+?)\s+as\s+(.+)$/.exec(rest)
      if (a1) {
        const [x, y] = [a1[1].trim(), a1[2].trim()]
        // the quoted / bracketed side is the label
        if (/^["([:]/.test(x)) [label, id] = [x, y]
        else [id, label] = [x, y]
      }
      label = label.replace(/^\((.*)\)$|^\[(.*)\]$|^:(.*):$/, '$1$2$3')
      id = id.replace(/^\((.*)\)$|^\[(.*)\]$|^:(.*):$/, '$1$2$3').replace(/^"(.*)"$/, '$1')
      const shape = kind === 'usecase' ? 'ellipse' : kind === 'actor' ? 'actor' : (ELEMENT[kind] ?? 'rect')
      const n = b.node(id, { label: pText(label) + (stereo ? `\n«${stereo[1]}»` : ''), shape }, cur())
      const fill = col ? color(col[1].slice(1)) ?? color(col[1]) : undefined
      if (fill) n.style = { ...n.style, fill }
      continue
    }
    // shorthand elements alone on a line
    if ((m = /^(\[[^\]]+\]|\([^)]+\)|:[^:]+:)(?:\s+as\s+(\S+))?$/.exec(l))) {
      const id = element(m[1])
      if (m[2]) {
        const n = b.get(id)!
        b.node(m[2], { label: n.label, shape: n.shape }, cur())
        b.g.nodes.splice(b.g.nodes.indexOf(n), 1)
      }
      continue
    }
    if ((m = LINK.exec(l))) {
      const [, ra, la, lm, l1, , dirWord, l2, , rm, lb, rz, label] = m
      let a = element(ra)
      let z = element(rz)
      const line = l1 + l2
      let tail = lm ? MARKS[lm] ?? 'none' : 'none'
      let head = rm ? MARKS[rm] ?? 'none' : 'none'
      let tl = la
      let hl = lb
      // "up" / "left": laid out the other way round
      if (/^(up|u|left|l|le)$/i.test(dirWord)) {
        ;[a, z] = [z, a]
        ;[tail, head] = [head, tail]
        ;[tl, hl] = [hl, tl]
      }
      const e: GEdge = { from: a, to: z, head, tail, line: line.includes('.') ? 'dashed' : line.includes('=') ? 'thick' : line.includes('~') ? 'dotted' : 'solid' }
      if (label) e.label = pText(label.replace(/\s*[<>]\s*$|^\s*[<>]\s*/g, ''))
      if (tl) e.tailLabel = tl
      if (hl) e.headLabel = hl
      b.edge(e)
      continue
    }
    // Class : member
    if ((m = /^([\w.$]+)\s*:\s*(.+)$/.exec(l)) && (info.has(m[1]) || b.has(m[1]))) {
      const c = info.get(m[1]) ?? { kind: 'class', sections: [[], []] }
      info.set(m[1], c)
      const mem = pText(m[2])
      if (mem.includes('(') && c.sections.length > 1) c.sections[1].push(mem)
      else c.sections[0].push(mem)
      continue
    }
  }
  // start / end of old-style activity links
  const start = b.get('start')
  if (start && start.label === 'start' && b.g.edges.some((e) => e.from === 'start' || e.to === 'start')) {
    start.shape = 'start'
    start.label = ''
    const ins = b.g.edges.filter((e) => e.to === 'start')
    if (ins.length) {
      b.node('__end', { shape: 'end', label: '' })
      for (const e of ins) e.to = '__end'
    }
  }
  for (const n of b.g.nodes) {
    const c = info.get(n.id)
    if (!c) continue
    const header: string[][] = []
    const stereo = c.stereo ?? (c.kind === 'interface' ? 'interface' : c.kind === 'enum' ? 'enumeration' : c.kind === 'annotation' ? 'annotation' : c.kind === 'abstract' || c.kind === 'abstract class' ? 'abstract' : undefined)
    if (stereo) header.push([`«${stereo}»`])
    header.push([n.label])
    const sections: Section[] = [{ rows: header, bold: true, center: true, italic: c.kind.startsWith('abstract') }]
    for (const s of c.sections) sections.push({ rows: s.map((x) => [x]) })
    n.sections = sections
  }
  return b.g
}

// ---------------------------------------------------------------- state

function state(lines: string[], dir?: 'LR' | 'TB') {
  const b = new GraphBuilder(dir ?? 'TB', 'round')
  const scope: string[] = []
  const desc = new Map<string, string[]>()
  let notes = 0
  let noteLines: string[] | null = null
  let noteFor: string | undefined
  const cur = () => scope[scope.length - 1]
  const st = (raw: string, asTarget: boolean): string => {
    const id = raw.trim().replace(/^"(.*)"$/, '$1')
    if (id === '[*]') {
      const sid = `${cur() ?? ''}__${asTarget ? 'end' : 'start'}`
      b.node(sid, { label: '', shape: asTarget ? 'end' : 'start' }, cur())
      return sid
    }
    if (!b.isCluster(id) && !b.has(id)) b.node(id, { label: id }, cur())
    return id
  }
  for (const l of lines) {
    if (noteLines) {
      if (/^end\s*note$/i.test(l)) {
        const nid = `__note${notes++}`
        b.node(nid, { label: pText(noteLines.join('\n')), shape: 'note', style: { fill: '#fff6c8', stroke: '#c9a227' } }, cur())
        if (noteFor) b.edge({ from: noteFor, to: nid, line: 'dashed', head: 'none' })
        noteLines = null
      } else noteLines.push(l)
      continue
    }
    if (l === '--' || l === '||') continue
    let m: RegExpExecArray | null
    if ((m = /^state\s+(?:"([^"]+)"\s+as\s+(\S+?)|(\S+?)\s+as\s+"([^"]+)"|("[^"]+"|[^\s{<#]+))\s*(<<(\w+)>>)?\s*(#\S+)?\s*(\{)?$/i.exec(l))) {
      const id = (m[2] ?? m[3] ?? m[5]).replace(/^"(.*)"$/, '$1')
      const label = m[1] ?? m[4] ?? id
      const kind = m[7]?.toLowerCase()
      if (m[9]) {
        b.cluster(id, pText(label), cur())
        scope.push(id)
        continue
      }
      const shape: Shape | undefined =
        kind === 'fork' || kind === 'join' ? 'bar' : kind === 'choice' ? 'diamond' : kind === 'start' || kind === 'entrypoint' ? 'start' : kind === 'end' || kind === 'exitpoint' ? 'end' : undefined
      b.node(id, { label: shape ? '' : pText(label), shape }, cur())
      const fill = m[8] ? color(m[8].slice(1)) ?? color(m[8]) : undefined
      if (fill) b.node(id).style = { fill }
      continue
    }
    if (l === '}') {
      scope.pop()
      continue
    }
    if ((m = /^note\s+(left|right|top|bottom)\s+of\s+(\S+)\s*(?::\s*(.*))?$/i.exec(l))) {
      if (m[3] !== undefined) {
        const nid = `__note${notes++}`
        b.node(nid, { label: pText(m[3]), shape: 'note', style: { fill: '#fff6c8', stroke: '#c9a227' } }, cur())
        b.edge({ from: st(m[2], false), to: nid, line: 'dashed', head: 'none' })
      } else {
        noteLines = []
        noteFor = st(m[2], false)
      }
      continue
    }
    if ((m = /^(\[\*\]|"[^"]+"|[\w.$À-￿]+)\s*(-+|\.+)(?:\[[^\]]*\])?((?:up|down|left|right|u|d|l|r)?)(-*|\.*)(?:\[[^\]]*\])?>\s*(\[\*\]|"[^"]+"|[\w.$À-￿]+)\s*(?::\s*(.*))?$/u.exec(l))) {
      let a = st(m[1], false)
      let z = st(m[5], true)
      let rev = false
      if (/^(up|u|left|l)$/i.test(m[3])) {
        ;[a, z] = [z, a]
        rev = true
      }
      b.edge({ from: a, to: z, head: rev ? 'none' : 'arrow', tail: rev ? 'arrow' : 'none', line: m[2].includes('.') ? 'dashed' : 'solid', label: m[6] ? pText(m[6]) : undefined })
      continue
    }
    if ((m = /^([\w.$À-￿]+)\s*:\s*(.+)$/u.exec(l))) {
      st(m[1], false)
      desc.set(m[1], [...(desc.get(m[1]) ?? []), pText(m[2])])
    }
  }
  for (const n of b.g.nodes) {
    const d = desc.get(n.id)
    if (d && n.shape === 'round') n.sections = [{ rows: [[n.label]], bold: true, center: true }, { rows: d.map((x) => [x]) }]
  }
  return b.g
}

// ---------------------------------------------------------------- activity (new syntax)

interface Exit {
  from: string
  label?: string
}

function activity(raw: string[]) {
  const b = new GraphBuilder('TB', 'round')
  // join multi-line actions ":…;"
  const lines: string[] = []
  for (let k = 0; k < raw.length; k++) {
    let l = raw[k]
    if (/^:/.test(l) && !/[;|<>/\]}]$/.test(l)) {
      while (k + 1 < raw.length && !/[;|<>/\]}]$/.test(l)) l += '\n' + raw[++k]
    }
    lines.push(l)
  }
  let i = 0
  let n = 0
  const scope: string[] = []
  const node = (shape: Shape, label = '') => {
    const id = `a${n++}`
    b.node(id, { shape, label }, scope[scope.length - 1])
    return id
  }
  let pendingLabel: string | undefined
  const link = (exits: Exit[], to: string) => {
    for (const e of exits) b.edge({ from: e.from, to, head: 'arrow', label: e.label })
  }
  const cond = (s: string) => pText(s.replace(/^\((.*)\)$/, '$1'))
  /** statements until a line matching `stop` (left unread); returns the open ends */
  const block = (start: Exit[], stop: RegExp): Exit[] => {
    let cur = start
    const put = (id: string) => {
      if (pendingLabel !== undefined) cur = cur.map((e) => ({ ...e, label: e.label ?? pendingLabel }))
      pendingLabel = undefined
      link(cur, id)
    }
    while (i < lines.length) {
      const l = lines[i]
      if (stop.test(l)) return cur
      i++
      let m: RegExpExecArray | null
      if (/^start$/i.test(l)) {
        const id = node('start')
        put(id)
        cur = [{ from: id }]
      } else if (/^(stop|end)$/i.test(l)) {
        const id = node('end')
        put(id)
        cur = []
      } else if (/^(kill|detach|break)$/i.test(l)) cur = []
      else if ((m = /^:([\s\S]*?)[;|<>/\]}]$/.exec(l))) {
        const id = node('round', pText(m[1]))
        put(id)
        cur = [{ from: id }]
      } else if ((m = /^->\s*(.*?);?$/.exec(l))) pendingLabel = pText(m[1]) || undefined
      else if ((m = /^if\s*(\(.*?\))\s*(?:then\s*(?:\((.*)\))?)?\s*$/i.exec(l)) || (m = /^if\s*(\(.*\))\s*(?:is\s*\((.*)\))?\s*then\s*$/i.exec(l))) {
        let d = node('diamond', cond(m[1]))
        put(d)
        let out: Exit[] = block([{ from: d, label: m[2] ? pText(m[2]) : undefined }], /^(elseif|else\s*if|else|endif|end\s*if)\b/i)
        let open = true
        while (i < lines.length) {
          const t = lines[i++]
          let e: RegExpExecArray | null
          if ((e = /^(?:elseif|else\s*if)\s*(\(.*?\))\s*(?:then\s*(?:\((.*)\))?)?$/i.exec(t))) {
            const d2 = node('diamond', cond(e[1]))
            b.edge({ from: d, to: d2, head: 'arrow' })
            d = d2
            out = out.concat(block([{ from: d2, label: e[2] ? pText(e[2]) : undefined }], /^(elseif|else\s*if|else|endif|end\s*if)\b/i))
          } else if ((e = /^else\s*(?:\((.*)\))?$/i.exec(t))) {
            out = out.concat(block([{ from: d, label: e[1] ? pText(e[1]) : undefined }], /^(endif|end\s*if)\b/i))
            open = false
          } else break
        }
        if (open) out.push({ from: d })
        cur = out
      } else if ((m = /^switch\s*(\(.*\))$/i.exec(l))) {
        const d = node('diamond', cond(m[1]))
        put(d)
        let out: Exit[] = []
        while (i < lines.length) {
          const t = lines[i++]
          const e = /^case\s*(\(.*\))$/i.exec(t)
          if (!e) break
          out = out.concat(block([{ from: d, label: cond(e[1]) }], /^(case\s*\(|endswitch)/i))
        }
        cur = out
      } else if ((m = /^while\s*(\(.*?\))\s*(?:is\s*\((.*)\))?$/i.exec(l))) {
        const w = node('diamond', cond(m[1]))
        put(w)
        const body = block([{ from: w, label: m[2] ? pText(m[2]) : undefined }], /^(endwhile|end\s*while)\b/i)
        link(body, w)
        const e = /^(?:endwhile|end\s*while)\s*(?:\((.*)\))?$/i.exec(lines[i++] ?? '')
        cur = [{ from: w, label: e?.[1] ? pText(e[1]) : undefined }]
      } else if ((m = /^repeat\s*(?::([\s\S]*?)[;|<>/\]}])?$/i.exec(l)) && !/^repeat\s*while/i.test(l)) {
        const r = m[1] !== undefined ? node('round', pText(m[1])) : node('diamond', '')
        put(r)
        const body = block([{ from: r }], /^(repeat\s*while|backward)/i)
        let back: string | undefined
        let bm: RegExpExecArray | null
        if ((bm = /^backward\s*:([\s\S]*?)[;|<>/\]}]$/i.exec(lines[i] ?? ''))) {
          back = node('round', pText(bm[1]))
          i++
        }
        const e = /^repeat\s*while\s*(\(.*?\))?\s*(?:is\s*\((.*?)\))?\s*(?:not\s*\((.*?)\))?$/i.exec(lines[i++] ?? '')
        const d = node('diamond', e?.[1] ? cond(e[1]) : '')
        link(body, d)
        if (back) {
          b.edge({ from: d, to: back, head: 'arrow', label: e?.[2] ? pText(e[2]) : undefined })
          b.edge({ from: back, to: r, head: 'arrow' })
        } else b.edge({ from: d, to: r, head: 'arrow', label: e?.[2] ? pText(e[2]) : undefined })
        cur = [{ from: d, label: e?.[3] ? pText(e[3]) : undefined }]
      } else if (/^(fork|split)$/i.test(l)) {
        const fork = /^fork$/i.test(l)
        let f: string | undefined
        let starts = cur
        if (fork) {
          f = node('bar')
          put(f)
          starts = [{ from: f }]
        } else if (pendingLabel !== undefined) pendingLabel = undefined
        let out: Exit[] = []
        for (;;) {
          out = out.concat(block(starts, /^(fork\s+again|split\s+again|end\s*fork|end\s*merge|end\s*split)\b/i))
          const t = lines[i++] ?? ''
          if (!/again/i.test(t)) break
        }
        if (fork) {
          const j = node('bar')
          link(out, j)
          cur = [{ from: j }]
        } else cur = out
      } else if ((m = /^(?:partition|group|package|rectangle|card)\s+(?:"([^"]*)"|(\S[^{]*?))\s*(?:#\S+)?\s*\{?$/i.exec(l))) {
        const name = (m[1] ?? m[2]).trim()
        const cid = `__p${n++}`
        b.cluster(cid, pText(name), scope[scope.length - 1])
        scope.push(cid)
      } else if (l === '}' || /^end\s*group$/i.test(l)) scope.pop()
      else if (/^[rh]?note\b/i.test(l) || /^floating\s+note\b/i.test(l)) {
        if (!/:/.test(l)) while (i < lines.length && !/^end\s*note$/i.test(lines[i++]));
      }
      // swimlanes, arrows styles, labels we do not draw
    }
    return cur
  }
  block([], /^\u0000$/)
  return b.g
}

// ---------------------------------------------------------------- mind map / WBS

function tree(lines: string[], wbs: boolean): TreeNode {
  const stack: { depth: number; n: TreeNode }[] = []
  let root: TreeNode | undefined
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k]
    const m = /^([*+\-#]+)(_)?\s*(?:\[#[\w]+\])?\s*(.*)$/.exec(l)
    if (!m) continue
    let text = m[3]
    // ":multi\nline;" nodes
    if (text.startsWith(':')) {
      text = text.slice(1)
      while (!/;\s*$/.test(text) && k + 1 < lines.length) text += '\n' + lines[++k]
      text = text.replace(/;\s*$/, '')
    }
    const depth = m[1].length
    const side = m[1][0] === '-' ? 'left' : 'right'
    const node: TreeNode = { label: pText(text), shape: m[2] ? 'none' : undefined, side: wbs ? undefined : side, children: [] }
    if (!root) {
      root = node
      stack.push({ depth, n: node })
      continue
    }
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop()
    stack[stack.length - 1].n.children.push(node)
    stack.push({ depth, n: node })
  }
  if (!root) throw new DiagramError('The mind map is empty')
  // only the root's children choose a side
  const clear = (n: TreeNode, top: boolean) => n.children.forEach((c) => (top ? clear(c, false) : ((c.side = undefined), clear(c, false))))
  clear(root, true)
  return root
}
