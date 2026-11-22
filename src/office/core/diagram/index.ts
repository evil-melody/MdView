/**
 * Diagrams as code, drawn without a browser, a server or a library: Mermaid, PlantUML and Graphviz DOT text in,
 * self-contained SVG pictures out. Runs in the worker (no DOM) and on the main thread.
 */
import { renderDotAll } from './dot'
import type { Rendered } from './graph'
import { renderMermaid } from './mermaid'
import { renderPlantUml } from './plantuml'
import { DiagramError } from './svg'

export type DiagramLang = 'mermaid' | 'plantuml' | 'graphviz'
export type { Rendered as DiagramImage } from './graph'
export { DiagramError } from './svg'

/** file extensions of diagram sources */
export const DIAGRAM_EXT: Record<string, DiagramLang> = {
  mmd: 'mermaid',
  mermaid: 'mermaid',
  puml: 'plantuml',
  plantuml: 'plantuml',
  pu: 'plantuml',
  iuml: 'plantuml',
  wsd: 'plantuml',
  dot: 'graphviz',
  gv: 'graphviz',
}

/** Markdown code fence languages */
export const FENCE_LANG: Record<string, DiagramLang> = {
  mermaid: 'mermaid',
  mmd: 'mermaid',
  plantuml: 'plantuml',
  puml: 'plantuml',
  uml: 'plantuml',
  dot: 'graphviz',
  graphviz: 'graphviz',
  gv: 'graphviz',
}

export const DIAGRAM_NAME: Record<DiagramLang, string> = { mermaid: 'Mermaid', plantuml: 'PlantUML', graphviz: 'Graphviz' }

/** a Mermaid header line: the diagram keyword alone (prose that starts with "pie" or "timeline" is not one) */
const MERMAID_START =
  /^(?:(?:graph|flowchart)(?:\s+(?:TB|TD|BT|RL|LR))?\s*(?:;.*)?|(?:sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|gantt|mindmap|journey|gitGraph|timeline|quadrantChart|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|sankey-beta|xychart-beta|block-beta|packet-beta|kanban|architecture-beta)\s*|pie(?:\s+showData)?(?:\s+title\s+.*)?\s*)$/
const DOT_START = /^(strict\s+)?(di)?graph(\s+("[^"]*"|[\w.]+))?\s*\{/i

/** the diagram language of a text without a name: @startuml, digraph { }, a Mermaid header */
export function sniffDiagram(text: string): DiagramLang | null {
  if (/^\s*@start(uml|mindmap|wbs|dot|salt|gantt|json|yaml)\b/m.test(text.slice(0, 2000))) return 'plantuml'
  const lines = text
    .replace(/^﻿/, '')
    .replace(/^\s*---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/, '')
    .replace(/%%\{[\s\S]*?\}%%/g, '')
    .split(/\r?\n/)
  const trimmed = lines.map((l) => l.trim())
  // DOT: comments (//, /* */, # lines) may come first
  const dot = text.replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('//') && !l.startsWith('#'))
  if (dot && (DOT_START.test(dot) || (/^(strict\s+)?(di)?graph(\s+("[^"]*"|[\w.]+))?\s*$/i.test(dot) && /^\s*\{/m.test(text) && !MERMAID_START.test(dot)))) return 'graphviz'
  const first = trimmed.find((l) => l && !l.startsWith('%%'))
  return first && MERMAID_START.test(first) ? 'mermaid' : null
}

const LIMIT = 2_000_000

/** The pictures a diagram source draws (PlantUML and DOT files may hold several). Throws a DiagramError. */
export function renderDiagrams(lang: DiagramLang, text: string): Rendered[] {
  if (text.length > LIMIT) throw new DiagramError('The diagram is too large to draw')
  try {
    switch (lang) {
      case 'mermaid':
        return [renderMermaid(text)]
      case 'plantuml':
        return renderPlantUml(text)
      case 'graphviz':
        return renderDotAll(text)
    }
  } catch (e) {
    if (e instanceof DiagramError) throw e
    throw new DiagramError((e as Error)?.message || String(e))
  }
}
