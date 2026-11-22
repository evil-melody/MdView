/**
 * iWork text styles (TSWP paragraph, character and list styles; TSS style inheritance), read into plain
 * properties shared by the Pages and Keynote converters.
 */
import type { IworkPackage } from './iwa'
import type { Msg } from './proto'

export interface CharProps {
  b?: boolean
  i?: boolean
  sz?: number
  font?: string
  /** rrggbb */
  color?: string
  va?: 'superscript' | 'subscript' | 'baseline'
  /** 'none' | 'single' | 'double' | 'wave' */
  u?: string
  strike?: 'single' | 'double' | 'none'
  caps?: 'caps' | 'smallCaps' | 'none'
  /** background (rrggbb) */
  shd?: string
  /** baseline shift (pt) */
  shift?: number
  /** tracking: fraction of the font size */
  track?: number
}

export interface ParaProps {
  align?: 'left' | 'right' | 'center' | 'both'
  /** first line indent, measured like the left indent (from the margin) */
  first?: number
  left?: number
  right?: number
  before?: number
  after?: number
  line?: { rule: 'auto' | 'atLeast' | 'exact'; v: number }
  pbb?: boolean
  keepNext?: boolean
  keepLines?: boolean
  fill?: string
  outline?: number
  list?: number
}

export interface ListLevel {
  kind: 'none' | 'bullet' | 'number'
  /** bullet character */
  text: string
  /** number style: 0 decimal, 1 upper roman, 2 lower roman, 3 upper letter, 4 lower letter */
  fmt: number
  /** punctuation: 0 "1.", 1 "(1)", 2 "1)" */
  punct: number
  /** "1.2.3" numbering */
  tiered: boolean
  /** label indent (pt) */
  indent: number
  /** label to text distance, in font sizes */
  textIndent: number
}

const ALIGN = ['left', 'right', 'center', 'both', 'left'] as const
const UNDERLINE = ['none', 'single', 'double', 'wave']

/** TSP.Color → rrggbb (undefined when fully transparent) */
export function hexColor(m: Msg | undefined): string | undefined {
  if (!m) return undefined
  if ((m.float(6) ?? 1) <= 0) return undefined
  let r: number
  let g: number
  let b: number
  const model = m.u(1)
  if (model === 2) {
    const k = m.float(10) ?? 0
    r = (1 - (m.float(7) ?? 0)) * (1 - k)
    g = (1 - (m.float(8) ?? 0)) * (1 - k)
    b = (1 - (m.float(9) ?? 0)) * (1 - k)
  } else if (model === 3) r = g = b = m.float(11) ?? 0
  else {
    r = m.float(3) ?? 0
    g = m.float(4) ?? 0
    b = m.float(5) ?? 0
  }
  const h = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')
  return (h(r) + h(g) + h(b)).toUpperCase()
}

/** TSD.FillArchive → rrggbb (a gradient gives its first stop) */
export function fillColor(m: Msg | undefined): string | undefined {
  if (!m) return undefined
  return hexColor(m.msg(1)) ?? hexColor(m.msg(2)?.msgs(2)[0]?.msg(1))
}

const PS_FAMILY: Record<string, string> = {
  PingFangSC: 'PingFang SC',
  PingFangTC: 'PingFang TC',
  PingFangHK: 'PingFang HK',
  HiraginoSans: 'Hiragino Sans',
  '.SFNSText': 'SF Pro Text',
  '.SFNSDisplay': 'SF Pro Display',
}

/** PostScript font name ("HelveticaNeue-BoldItalic") → family + the bold / italic its face implies */
export function psFont(name: string): { family: string; b?: boolean; i?: boolean } {
  if (/\s/.test(name)) return { family: name }
  const dash = name.indexOf('-')
  let fam = dash > 0 ? name.slice(0, dash) : name
  const face = dash > 0 ? name.slice(dash + 1) : ''
  fam = fam.replace(/(PSMT|PS|MT)$/, '')
  const family = PS_FAMILY[fam] ?? fam.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  const out: { family: string; b?: boolean; i?: boolean } = { family }
  if (/bold|black|heavy|demi/i.test(face)) out.b = true
  if (/italic|oblique/i.test(face) || /^it$/i.test(face)) out.i = true
  return out
}

/** TSWP.CharacterStylePropertiesArchive */
export function readChar(m: Msg | undefined): CharProps {
  const c: CharProps = {}
  if (!m) return c
  if (m.has(1)) c.b = m.bool(1)
  if (m.has(2)) c.i = m.bool(2)
  const sz = m.float(3)
  if (sz && sz > 0) c.sz = sz
  const fn = m.str(5)
  if (fn && !m.bool(4)) {
    const f = psFont(fn)
    c.font = f.family
    if (f.b) c.b = true
    if (f.i) c.i = true
  }
  if (!m.bool(6)) {
    const color = hexColor(m.msg(7))
    if (color) c.color = color
  }
  const va = m.u(10)
  if (va !== undefined) c.va = va === 1 ? 'superscript' : va === 2 ? 'subscript' : 'baseline'
  const u = m.u(11)
  if (u !== undefined) c.u = UNDERLINE[u] ?? 'single'
  const st = m.u(12)
  if (st !== undefined) c.strike = st === 0 ? 'none' : st === 1 ? 'single' : 'double'
  const caps = m.u(13)
  if (caps !== undefined) c.caps = caps === 1 ? 'caps' : caps === 2 ? 'smallCaps' : 'none'
  const shift = m.float(14)
  if (shift !== undefined) c.shift = shift
  if (!m.bool(25)) {
    const bg = hexColor(m.msg(26))
    if (bg) c.shd = bg
  }
  const track = m.float(27)
  if (track !== undefined) c.track = track
  return c
}

/** TSWP.ParagraphStylePropertiesArchive */
export function readPara(m: Msg | undefined): ParaProps {
  const p: ParaProps = {}
  if (!m) return p
  const a = m.u(1)
  if (a !== undefined) p.align = ALIGN[a] ?? 'left'
  if (!m.bool(5)) {
    const fill = hexColor(m.msg(6))
    if (fill) p.fill = fill
  }
  const num = (f: number, k: 'first' | 'left' | 'right' | 'before' | 'after') => {
    const v = m.float(f)
    if (v !== undefined && isFinite(v)) p[k] = v
  }
  num(7, 'first')
  num(11, 'left')
  num(19, 'right')
  num(21, 'before')
  num(20, 'after')
  const ls = m.msg(13)
  const amount = ls?.float(2)
  if (ls && amount !== undefined && amount > 0) {
    const mode = ls.u(1) ?? 0
    if (mode === 0) p.line = { rule: 'auto', v: amount }
    else if (mode === 1) p.line = { rule: 'atLeast', v: amount }
    else if (mode === 4) p.line = { rule: 'auto', v: 1 + amount / 12 }
    else p.line = { rule: 'exact', v: amount }
  }
  if (m.has(14)) p.pbb = m.bool(14)
  if (m.has(9)) p.keepLines = m.bool(9)
  if (m.has(10)) p.keepNext = m.bool(10)
  const ol = m.u(27)
  if (ol !== undefined) p.outline = ol < 9 ? ol : -1
  if (!m.bool(39) && m.has(40)) p.list = m.ref(40)
  return p
}

interface StyleRec {
  name?: string
  parent?: number
  variation: boolean
  /** the TSS.StyleArchive-carrying message */
  msg: Msg
}

export interface Resolved {
  /** what the style's variations change over its named style */
  pDirect: ParaProps
  cDirect: CharProps
  /** everything the style sets, its ancestors included */
  pFull: ParaProps
  cFull: CharProps
  /** font size (pt) */
  sz: number
}

/** Style lookup with inheritance; results are cached. */
export class IworkStyles {
  private cache = new Map<number, StyleRec | null>()
  private resolvedCache = new Map<number | undefined, Resolved>()
  private charCache = new Map<number | undefined, CharProps>()
  private lists = new Map<number, ListLevel[] | null>()

  constructor(private pkg: IworkPackage) {}

  /** style object (paragraph, character, list, cell or shape); `nest`: depth of the TSS.StyleArchive in it */
  style(id: number | undefined, nest = 1): StyleRec | undefined {
    if (id === undefined) return undefined
    const hit = this.cache.get(id)
    if (hit !== undefined) return hit ?? undefined
    const m = this.pkg.get(id)
    let tss = m
    for (let k = 0; k < nest && tss; k++) tss = tss.msg(1)
    const rec = m && tss ? { name: tss.str(1), parent: tss.ref(3), variation: !!tss.bool(4), msg: m } : null
    if (rec && !rec.name && rec.parent !== undefined) rec.variation = true
    this.cache.set(id, rec)
    return rec ?? undefined
  }

  /** the style and its ancestors, nearest first (up to `stop`, excluded) */
  chain(id: number | undefined, nest = 1, stop?: number): Msg[] {
    const out: Msg[] = []
    const seen = new Set<number>()
    while (id !== undefined && id !== stop && !seen.has(id) && out.length < 16) {
      seen.add(id)
      const s = this.style(id, nest)
      if (!s) break
      out.push(s.msg)
      id = s.parent
    }
    return out
  }

  /** nearest non-variation style (the one a paragraph names) */
  named(id: number | undefined): number | undefined {
    const seen = new Set<number>()
    while (id !== undefined && !seen.has(id)) {
      seen.add(id)
      const s = this.style(id)
      if (!s) return undefined
      if (!s.variation) return id
      id = s.parent
    }
    return undefined
  }

  charOf(chain: Msg[]): CharProps {
    const out: CharProps = {}
    for (let k = chain.length - 1; k >= 0; k--) Object.assign(out, readChar(chain[k].msg(11)))
    return out
  }

  paraOf(chain: Msg[]): ParaProps {
    const out: ParaProps = {}
    for (let k = chain.length - 1; k >= 0; k--) Object.assign(out, readPara(chain[k].msg(12)))
    return out
  }

  /** a paragraph style: its direct properties (variations over the named style), all its properties, its font size */
  resolved(paraId: number | undefined): Resolved {
    let r = this.resolvedCache.get(paraId)
    if (!r) {
      const varChain = this.chain(paraId, 1, this.named(paraId))
      const full = this.chain(paraId)
      const cFull = this.charOf(full)
      r = { pDirect: this.paraOf(varChain), cDirect: this.charOf(varChain), pFull: this.paraOf(full), cFull, sz: cFull.sz ?? 12 }
      this.resolvedCache.set(paraId, r)
    }
    return r
  }

  /** everything a character style sets */
  charFull(charId: number | undefined): CharProps {
    let c = this.charCache.get(charId)
    if (!c) {
      c = this.charOf(this.chain(charId))
      this.charCache.set(charId, c)
    }
    return c
  }

  /** the 9 levels of a list style, undefined when none has a label */
  list(id: number | undefined): ListLevel[] | undefined {
    if (id === undefined) return undefined
    const hit = this.lists.get(id)
    if (hit !== undefined) return hit ?? undefined
    const chain = this.chain(id)
    // each repeated field comes from the nearest style that has it
    const pick = <T>(get: (m: Msg) => T[]): T[] => {
      for (const m of chain) {
        const v = get(m)
        if (v.length) return v
      }
      return []
    }
    const types = pick((m) => m.us(11))
    if (!types.some((t) => t !== 0)) {
      this.lists.set(id, null)
      return undefined
    }
    const formats = pick((m) => m.us(15))
    const strings = pick((m) => m.strs(16))
    const tiered = pick((m) => m.us(25))
    const indents = pick((m) => m.floats(13))
    const textIndents = pick((m) => m.floats(12))
    const levels: ListLevel[] = []
    for (let l = 0; l < 9; l++) {
      const t = types[l] ?? types[types.length - 1] ?? 0
      const f = formats[l] ?? 0
      levels.push({
        kind: t === 0 ? 'none' : t === 3 ? 'number' : 'bullet',
        text: t === 2 ? strings[l] || '•' : '•',
        fmt: f < 15 ? Math.floor(f / 3) : 0,
        punct: f % 3,
        tiered: !!tiered[l],
        indent: indents[l] ?? l * 18,
        textIndent: textIndents[l] ?? 1.5,
      })
    }
    this.lists.set(id, levels)
    return levels
  }
}

/** distance from a list label to its text (pt), for text of size `sz` */
export const hangOf = (l: ListLevel, sz: number) => Math.max(9, l.textIndent * sz)
