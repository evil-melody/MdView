/**
 * SVG output for the diagram renderers: text metrics (no DOM: the worker has none), escaping, colors and a small
 * builder. Pictures are self-contained (no scripts, links, external references, markers or CSS) so they show the
 * same in an <img>, in Word and in a PDF export.
 */

export const FONT = 'Helvetica, Arial, sans-serif'
export const MONO = 'Menlo, Consolas, "Courier New", monospace'

/** Helvetica advance widths (1/1000 em), U+0020 to U+007E */
const ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]

function charWidth(cp: number): number {
  if (cp >= 0x20 && cp <= 0x7e) return ASCII[cp - 0x20]
  // combining marks (Vietnamese tones…), zero-width characters
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0xfe0f) return 0
  // CJK, Hangul, kana, full-width forms, emoji
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || cp >= 0x1f000) return 1000
  return 580
}

/** Width in px of one line of text at `size` px. */
export function textWidth(text: string, size = 14, bold = false, mono = false): number {
  let w = 0
  if (mono) {
    for (const ch of text) w += charWidth(ch.codePointAt(0)!) ? 600 : 0
  } else for (const ch of text) w += charWidth(ch.codePointAt(0)!)
  return (w * size * (bold ? 1.08 : 1)) / 1000
}

export const lineHeight = (size: number) => Math.round(size * 1.3)

/** Size of a block of lines. */
export function measure(lines: string[], size = 14, bold = false): { w: number; h: number } {
  let w = 0
  for (const l of lines) w = Math.max(w, textWidth(l, size, bold))
  return { w, h: lines.length * lineHeight(size) }
}

/** Breaks lines longer than `max` px at spaces. */
export function wrap(lines: string[], max: number, size = 14, bold = false): string[] {
  const out: string[] = []
  for (const line of lines) {
    if (textWidth(line, size, bold) <= max) {
      out.push(line)
      continue
    }
    let cur = ''
    for (const word of line.split(/ +/)) {
      const next = cur ? cur + ' ' + word : word
      if (cur && textWidth(next, size, bold) > max) {
        out.push(cur)
        cur = word
      } else cur = next
    }
    out.push(cur)
  }
  return out
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const NAMED = /^[a-z]{3,24}$/

/** A color from the source, or undefined when it is not one a picture can carry safely (#rgb, rgb(), a name). */
export function color(c: string | undefined): string | undefined {
  if (!c) return undefined
  const v = c.trim().toLowerCase()
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v)) return v
  if (/^[0-9a-f]{6}$/.test(v)) return '#' + v
  if (/^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)$/.test(v)) return v
  if (/^rgba?\(\s*[\d.]+%?\s+[\d.]+%?\s+[\d.]+%?\s*(\/\s*[\d.]+%?\s*)?\)$/.test(v)) return v
  if (NAMED.test(v)) return v === 'transparent' ? 'none' : v
  return undefined
}

export const THEME = {
  ink: '#1f2937',
  line: '#4b5563',
  fill: '#eef2fb',
  stroke: '#5b6f9a',
  muted: '#6b7280',
  cluster: '#f7f8fb',
  clusterStroke: '#a3adc2',
  note: '#fff6c8',
  noteStroke: '#c9a227',
  label: '#ffffff',
  dark: '#2d3748',
  /** categorical series: pie slices, gantt sections */
  series: ['#5b8def', '#f2994a', '#3fb68b', '#e5596b', '#9b6be0', '#d4b33a', '#3bb3c9', '#e07bb8', '#8c9aaf', '#7cbd4a'],
}

export interface Paint {
  fill?: string
  stroke?: string
  sw?: number
  dash?: string
  opacity?: number
}

const n = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0)

function paint(p: Paint): string {
  let a = ` fill="${p.fill ?? 'none'}"`
  if (p.stroke) a += ` stroke="${p.stroke}" stroke-width="${n(p.sw ?? 1)}"`
  if (p.stroke && p.dash) a += ` stroke-dasharray="${p.dash}"`
  if (p.opacity !== undefined) a += ` opacity="${n(p.opacity)}"`
  return a
}

export interface TextOpts {
  size?: number
  anchor?: 'start' | 'middle' | 'end'
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  mono?: boolean
}

export class Svg {
  private out: string[] = []

  rect(x: number, y: number, w: number, h: number, p: Paint, rx = 0): this {
    this.out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${rx ? ` rx="${n(rx)}"` : ''}${paint(p)}/>`)
    return this
  }

  circle(cx: number, cy: number, r: number, p: Paint): this {
    this.out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"${paint(p)}/>`)
    return this
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, p: Paint): this {
    this.out.push(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"${paint(p)}/>`)
    return this
  }

  line(x1: number, y1: number, x2: number, y2: number, p: Paint): this {
    this.out.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"${paint(p)}/>`)
    return this
  }

  poly(points: [number, number][], p: Paint, closed = true): this {
    const pts = points.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')
    this.out.push(`<${closed ? 'polygon' : 'polyline'} points="${pts}"${paint(p)}/>`)
    return this
  }

  /** `d` uses numbers rounded by the caller (see `pathData`) */
  path(d: string, p: Paint): this {
    this.out.push(`<path d="${d}"${paint(p)}/>`)
    return this
  }

  /** Lines of text, the block centered vertically on `y`. */
  text(x: number, y: number, lines: string[] | string, o: TextOpts = {}): this {
    const ls = typeof lines === 'string' ? [lines] : lines
    const size = o.size ?? 14
    const lh = lineHeight(size)
    const top = y - (ls.length * lh) / 2
    let attrs = ` font-family="${esc(o.mono ? MONO : FONT)}" font-size="${size}" fill="${o.color ?? THEME.ink}"`
    if (o.anchor && o.anchor !== 'start') attrs += ` text-anchor="${o.anchor}"`
    if (o.bold) attrs += ' font-weight="bold"'
    if (o.italic) attrs += ' font-style="italic"'
    if (o.underline) attrs += ' text-decoration="underline"'
    ls.forEach((l, k) => {
      if (!l) return
      // baseline: the middle of the line box plus about a third of the font size
      this.out.push(`<text x="${n(x)}" y="${n(top + k * lh + lh / 2 + size * 0.35)}"${attrs}>${esc(l)}</text>`)
    })
    return this
  }

  raw(s: string): this {
    this.out.push(s)
    return this
  }

  /** the elements drawn so far */
  body(): string {
    return this.out.join('')
  }

  /** The picture; `bg` paints the canvas. */
  toString(w: number, h: number, bg = '#ffffff'): string {
    const W = Math.ceil(w)
    const H = Math.ceil(h)
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
      (bg ? `<rect x="0" y="0" width="${W}" height="${H}" fill="${bg}"/>` : '') +
      this.out.join('') +
      '</svg>'
    )
  }
}

export type Pt = { x: number; y: number }

export function pathData(cmds: { c: 'M' | 'L' | 'C' | 'Q'; p: Pt[] }[]): string {
  return cmds.map((k) => k.c + k.p.map((q) => `${n(q.x)} ${n(q.y)}`).join(' ')).join(' ')
}

/** Mermaid / PlantUML / DOT label text: entity codes, <br>, markdown-string quotes, tags dropped. */
export function labelText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\n/g, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/#(\d+);/g, (_, d: string) => String.fromCodePoint(Math.min(Number(d), 0x10ffff)))
    .replace(/#([a-z]+);/gi, (m, name: string) => ({ quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', apos: "'" })[name.toLowerCase()] ?? m)
    .replace(/&(quot|amp|lt|gt|nbsp|apos|#\d+);/g, (m, e: string) =>
      e[0] === '#' ? String.fromCodePoint(Math.min(Number(e.slice(1)), 0x10ffff)) : (({ quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', apos: "'" }) as Record<string, string>)[e] ?? m,
    )
}

/** Mermaid "`markdown string`": the text without the markup */
export const unMarkdown = (s: string) => s.replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2').replace(/(^|\W)[*_](\S.*?\S|\S)[*_](?=\W|$)/g, '$1$2')

export class DiagramError extends Error {}
