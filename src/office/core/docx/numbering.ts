import type { Theme } from '../theme'
import { kid, kids, num, type XEl } from '../xml'
import { readPPr, readRPr } from './styles'
import type { ParaStyle, RunStyle } from './types'

export interface Level {
  start: number
  fmt: string
  text: string
  ps: ParaStyle
  rs: RunStyle
  isLgl: boolean
  suff: string
  restart?: number
}

interface NumInstance {
  abstractId: string
  starts: Record<number, number>
  levels: Record<number, Level>
}

// Private-use bullet glyphs from Symbol/Wingdings fonts → Unicode
const BULLETS: Record<string, string> = {
  '\uF0B7': '•', '\uF0A7': '▪', '\uF0A8': '□', '\uF0FC': '✓', '\uF0D8': '➢', '\uF076': '❖', '\uF0E0': '➔',
  '\uF06E': '■', '\uF071': '□', '\uF072': '❑', '\uF075': '◆', '\uF0E8': '➔', '\uF0F0': '⇨', '\uF0AE': '→',
  '\uF02D': '–', '\u00B7': '•', '\uF0BE': '—', '\uF06F': '○', '\uF09F': '•', '\uF0FE': '☑', o: '◦',
}

function roman(n: number): string {
  const map: [number, string][] = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ]
  let s = ''
  for (const [v, r] of map) while (n >= v) (s += r), (n -= v)
  return s
}

function letters(n: number): string {
  if (n <= 0) return ''
  const ch = String.fromCharCode(97 + ((n - 1) % 26))
  return ch.repeat(Math.floor((n - 1) / 26) + 1)
}

export function formatNumber(n: number, fmt: string): string {
  switch (fmt) {
    case 'decimalZero': return n < 10 ? '0' + n : String(n)
    case 'upperRoman': return roman(n).toUpperCase()
    case 'lowerRoman': return roman(n)
    case 'upperLetter': return letters(n).toUpperCase()
    case 'lowerLetter': return letters(n)
    case 'ordinal': {
      const s = ['th', 'st', 'nd', 'rd']
      const v = n % 100
      return n + (s[(v - 20) % 10] || s[v] || s[0])
    }
    case 'none': return ''
    case 'bullet': return ''
    default: return String(n)
  }
}

export class Numbering {
  private abstracts = new Map<string, Record<number, Level>>()
  private nums = new Map<string, NumInstance>()
  private counters = new Map<string, number[]>()

  constructor(root: XEl | undefined, theme: Theme) {
    if (!root) return
    const readLevels = (el: XEl) => {
      const out: Record<number, Level> = {}
      for (const l of kids(el, 'lvl')) {
        const ilvl = num(l.a.ilvl, 0)!
        out[ilvl] = {
          start: num(kid(l, 'start')?.a.val, 1)!,
          fmt: kid(l, 'numFmt')?.a.val ?? 'decimal',
          text: kid(l, 'lvlText')?.a.val ?? '',
          ps: readPPr(kid(l, 'pPr')).ps,
          rs: readRPr(kid(l, 'rPr'), theme),
          isLgl: !!kid(l, 'isLgl'),
          suff: kid(l, 'suff')?.a.val ?? 'tab',
          restart: num(kid(l, 'lvlRestart')?.a.val),
        }
      }
      return out
    }
    for (const a of kids(root, 'abstractNum')) this.abstracts.set(a.a.abstractNumId, readLevels(a))
    for (const n of kids(root, 'num')) {
      const inst: NumInstance = { abstractId: kid(n, 'abstractNumId')?.a.val ?? '', starts: {}, levels: {} }
      for (const o of kids(n, 'lvlOverride')) {
        const ilvl = num(o.a.ilvl, 0)!
        const so = num(kid(o, 'startOverride')?.a.val)
        if (so !== undefined) inst.starts[ilvl] = so
        const lvl = kid(o, 'lvl')
        if (lvl) Object.assign(inst.levels, readLevels({ n: 'x', a: {}, c: [{ ...lvl, a: { ...lvl.a, ilvl: String(ilvl) } }], t: '' }))
      }
      this.nums.set(n.a.numId, inst)
    }
  }

  reset() {
    this.counters.clear()
  }

  /** First list instance whose level 0 is a bullet / a number, without overrides. */
  findList(kind: 'bullet' | 'number'): string | undefined {
    for (const [id, inst] of this.nums) {
      if (Object.keys(inst.starts).length) continue
      const l0 = this.abstracts.get(inst.abstractId)?.[0]
      if (!l0) continue
      if (kind === 'bullet' ? l0.fmt === 'bullet' : l0.fmt === 'decimal') return id
    }
    return undefined
  }

  ids(): { abstract: number; num: number } {
    const a = [...this.abstracts.keys()].map(Number).filter(Number.isFinite)
    const n = [...this.nums.keys()].map(Number).filter(Number.isFinite)
    return { abstract: a.length ? Math.max(...a) + 1 : 0, num: n.length ? Math.max(...n) + 1 : 1 }
  }

  level(numId: string, ilvl: number): Level | undefined {
    const inst = this.nums.get(numId)
    if (!inst) return undefined
    return inst.levels[ilvl] ?? this.abstracts.get(inst.abstractId)?.[ilvl]
  }

  /** Advances the counter for (numId, ilvl) and returns the marker text. */
  next(numId: string, ilvl: number): { text: string; level: Level } | undefined {
    const inst = this.nums.get(numId)
    const level = this.level(numId, ilvl)
    if (!inst || !level) return undefined
    const hasOverride = Object.keys(inst.starts).length > 0
    const key = hasOverride ? 'n' + numId : 'a' + inst.abstractId
    let c = this.counters.get(key)
    if (!c) {
      c = []
      this.counters.set(key, c)
    }
    const startOf = (l: number) => inst.starts[l] ?? this.level(numId, l)?.start ?? 1
    c[ilvl] = c[ilvl] === undefined ? startOf(ilvl) : c[ilvl] + 1
    for (let d = ilvl + 1; d < 9; d++) c[d] = undefined as unknown as number
    for (let d = 0; d < ilvl; d++) if (c[d] === undefined) c[d] = startOf(d)
    if (level.fmt === 'bullet') {
      const t = level.text
      return { text: BULLETS[t] ?? (t || '•'), level }
    }
    const text = level.text.replace(/%(\d)/g, (_, d: string) => {
      const l = Number(d) - 1
      const lv = this.level(numId, l)
      const v = c![l] ?? startOf(l)
      return formatNumber(v, level.isLgl && l < ilvl ? 'decimal' : lv?.fmt ?? 'decimal')
    })
    return { text, level }
  }
}
