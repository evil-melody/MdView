/**
 * Inline-editor DOM -> `EditParagraph[]` conversion for the pptx text write-back.
 *
 * Design note (why we diff against a baseline instead of reading every computed style): the
 * overlay starts as plain text, so reading all computed properties would report formatting for
 * runs the user never touched — and for a box whose runs differ (bold label + regular body, a
 * theme-colored heading) that would bake the FIRST run's style over all of them. A property is
 * therefore emitted only when the DOM value actually differs from the baseline the overlay was
 * rendered with; everything else stays `undefined` and the engine's paragraph mapper
 * (`applyEditParagraphs`) keeps the original run bytes — theme color node, latin/ea font split,
 * implicit bold, hyperlink.
 */
import type { EditParagraph, EditRun } from '@genoffice/pptx-ops/types'

export interface RunBaseline {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  /** '#rrggbb' */
  color: string
  fontSizePx: number
  align: 'left' | 'center' | 'right' | 'justify'
}

interface RunStyle {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  color: string
  fontSizePx: number
}

const BLOCK = /^(P|DIV|LI)$/i

function rgbToHex(v: string): string | undefined {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(v)
  if (!m) return undefined
  const hex = (n: string) => Number(n).toString(16).padStart(2, '0')
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`
}

function styleOf(el: HTMLElement, parent: RunStyle): RunStyle {
  const cs = getComputedStyle(el)
  const tag = el.tagName.toUpperCase()
  let bold = parent.bold
  let italic = parent.italic
  let underline = parent.underline
  let strike = parent.strike
  if (tag === 'B' || tag === 'STRONG') bold = true
  if (tag === 'I' || tag === 'EM') italic = true
  if (tag === 'U') underline = true
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') strike = true
  if (cs.fontWeight === 'bold' || Number(cs.fontWeight) >= 600) bold = true
  if (cs.fontStyle === 'italic') italic = true
  const deco = cs.textDecorationLine || cs.textDecoration || ''
  if (deco.includes('underline')) underline = true
  if (deco.includes('line-through')) strike = true
  const size = parseFloat(cs.fontSize)
  return {
    bold,
    italic,
    underline,
    strike,
    color: rgbToHex(cs.color) ?? parent.color,
    fontSizePx: Number.isFinite(size) ? size : parent.fontSizePx
  }
}

function baseStyle(base: RunBaseline): RunStyle {
  return {
    bold: base.bold,
    italic: base.italic,
    underline: base.underline,
    strike: base.strike,
    color: base.color,
    fontSizePx: base.fontSizePx
  }
}

/** Baseline-relative run: only properties the user actually changed are reported. */
function diffRun(text: string, s: RunStyle, base: RunBaseline): EditRun {
  const out: EditRun = { text }
  if (s.bold !== base.bold) out.bold = s.bold
  if (s.italic !== base.italic) out.italic = s.italic
  if (s.underline !== base.underline) out.underline = s.underline
  if (s.strike !== base.strike) out.strike = s.strike
  if (s.color.toLowerCase() !== base.color.toLowerCase()) out.color = s.color
  if (Math.abs(s.fontSizePx - base.fontSizePx) > 0.6) out.fontSize = s.fontSizePx * 0.75 // px -> pt
  return out
}

function sameRun(a: EditRun, b: EditRun): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strike === b.strike &&
    a.color === b.color &&
    a.fontSize === b.fontSize
  )
}

function collectRuns(el: HTMLElement, base: RunBaseline): EditRun[] {
  const runs: EditRun[] = []
  const visit = (node: Node, st: RunStyle) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? ''
        if (!text) continue
        const r = diffRun(text, st, base)
        const prev = runs[runs.length - 1]
        if (prev && sameRun(prev, r)) prev.text += r.text
        else runs.push(r)
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const h = child as HTMLElement
        const tag = h.tagName.toUpperCase()
        if (tag === 'BR') {
          runs.push({ text: '\n' })
          continue
        }
        if (BLOCK.test(tag)) continue // nested blocks are handled as their own paragraph
        visit(h, styleOf(h, st))
      }
    }
  }
  visit(el, baseStyle(base))
  return runs
}

function normalizeAlign(v: string): EditParagraph['align'] | undefined {
  const s = (v || '').toLowerCase()
  if (s.startsWith('center')) return 'center'
  if (s.startsWith('right') || s.startsWith('end')) return 'right'
  if (s.startsWith('justify')) return 'justify'
  if (s.startsWith('left') || s.startsWith('start')) return 'left'
  return undefined
}

/** Convert the overlay's contenteditable DOM into paragraph/run structures for the engine. */
export function domToParagraphs(root: HTMLElement, base: RunBaseline): EditParagraph[] {
  const blocks = Array.from(root.children).filter(
    (c): c is HTMLElement => c.nodeType === Node.ELEMENT_NODE && BLOCK.test(c.tagName)
  )
  const paraEls: HTMLElement[] = blocks.length ? blocks : [root]
  return paraEls.map((el, pi) => {
    // A nested block (browser inserting <div> on Enter inside our paragraph div) is flattened
    // into the paragraph rather than dropped.
    const direct = Array.from(el.childNodes).filter(
      (c) => c.nodeType === Node.ELEMENT_NODE && BLOCK.test((c as HTMLElement).tagName)
    )
    const runs = direct.length
      ? direct.flatMap((c) => collectRuns(c as HTMLElement, base))
      : collectRuns(el, base)
    const align = normalizeAlign(getComputedStyle(el).textAlign) ?? base.align
    return {
      srcPara: pi,
      runs: runs.length ? runs : [{ text: '' }],
      ...(align !== base.align ? { align } : {})
    }
  })
}
