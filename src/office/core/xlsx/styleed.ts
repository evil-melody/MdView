/**
 * styles.xml 编辑核（自 editor.ts 抽离，零语义变更）：
 * 在既有 cellXfs/fonts/fills/borders/numFmts 表上派生（intern）新条目，
 * 保证保存前后同一 patch 得到同一索引（协作快照依赖该确定性）。
 */
import { BUILTIN_FORMATS } from './numfmt'
import {
  clone, el, getAttr, kidOf, kidsOf, parseRaw, prefixOf, rootEl, serialize, setAttr, setOrdered,
  type RChild, type RNode,
} from '../raw'
import type { FmtPatch } from './types'

const FONT_ORDER = ['b', 'i', 'strike', 'condense', 'extend', 'outline', 'shadow', 'u', 'vertAlign', 'sz', 'color', 'name', 'family', 'charset', 'scheme']
const SS_ORDER = ['numFmts', 'fonts', 'fills', 'borders', 'cellStyleXfs', 'cellXfs', 'cellStyles', 'dxfs', 'tableStyles', 'colors', 'extLst']

export class StyleEditor {
  nodes: RChild[]
  root: RNode
  P: string
  private cache = new Map<string, number>()
  /**
   * per section: serialized entry → first index. Derived entries reuse identical ones, so derivation
   * depends only on the table's content — a saved and reopened workbook derives the same indexes
   * as the live one (collaboration snapshots rely on it).
   */
  private found = new Map<string, Map<string, number>>()
  changed = false

  constructor(xml: string) {
    this.nodes = parseRaw(xml)
    this.root = rootEl(this.nodes)!
    this.P = prefixOf(this.root.q)
  }

  private section(name: string): RNode {
    let n = kidOf(this.root, name)
    if (!n) {
      n = el(this.P + name, { count: '0' })
      setOrdered(this.root, n, name, SS_ORDER)
    }
    return n
  }

  private append(sectionName: string, node: RNode): number {
    const sec = this.section(sectionName)
    sec.c.push(node)
    sec.self = false
    const n = kidsOf(sec).length
    setAttr(sec, 'count', String(n))
    this.changed = true
    return n - 1
  }

  private lookup(sectionName: string): Map<string, number> {
    let m = this.found.get(sectionName)
    if (!m) {
      const idx = new Map<string, number>()
      kidsOf(kidOf(this.root, sectionName)).forEach((k, i) => {
        const s = serialize([k])
        if (!idx.has(s)) idx.set(s, i)
      })
      this.found.set(sectionName, (m = idx))
    }
    return m
  }

  /** index of an entry equal to `node`, appended when there is none */
  private intern(sectionName: string, node: RNode): number {
    const s = serialize([node])
    const m = this.lookup(sectionName)
    const hit = m.get(s)
    if (hit !== undefined) return hit
    const i = this.append(sectionName, node)
    m.set(s, i)
    return i
  }

  private numFmtId(code: string): number {
    for (const [id, c] of Object.entries(BUILTIN_FORMATS)) if (c === code) return Number(id)
    const sec = kidOf(this.root, 'numFmts')
    let max = 163
    for (const f of kidsOf(sec, 'numFmt')) {
      const id = Number(getAttr(f, 'numFmtId'))
      if (getAttr(f, 'formatCode') === code) return id
      max = Math.max(max, id)
    }
    this.append('numFmts', el(this.P + 'numFmt', { numFmtId: String(max + 1), formatCode: code }))
    return max + 1
  }

  derive(xfIndex: number, patch: FmtPatch): number {
    const key = xfIndex + JSON.stringify(patch)
    const hit = this.cache.get(key)
    if (hit !== undefined) return hit
    const P = this.P
    const xfs = kidsOf(this.section('cellXfs'), 'xf')
    const xf = clone(xfs[xfIndex] ?? xfs[0] ?? el(P + 'xf', { numFmtId: '0', fontId: '0', fillId: '0', borderId: '0' }))
    const fontKeys = ['b', 'i', 'u', 'strike', 'color', 'sz', 'font'] as const
    if (fontKeys.some((k) => k in patch)) {
      const fonts = kidsOf(this.section('fonts'), 'font')
      const font = clone(fonts[Number(getAttr(xf, 'fontId') ?? 0)] ?? fonts[0] ?? el(P + 'font'))
      const put = (l: string, n: RNode | undefined) => setOrdered(font, n, l, FONT_ORDER)
      if (patch.b !== undefined) put('b', patch.b ? el(P + 'b') : undefined)
      if (patch.i !== undefined) put('i', patch.i ? el(P + 'i') : undefined)
      if (patch.strike !== undefined) put('strike', patch.strike ? el(P + 'strike') : undefined)
      if (patch.u !== undefined) put('u', patch.u ? el(P + 'u') : undefined)
      if (patch.sz !== undefined) put('sz', el(P + 'sz', { val: String(patch.sz) }))
      if ('color' in patch) put('color', patch.color ? el(P + 'color', { rgb: 'FF' + patch.color.replace('#', '').toUpperCase() }) : undefined)
      if (patch.font) {
        put('name', el(P + 'name', { val: patch.font }))
        put('scheme', undefined)
      }
      setAttr(xf, 'fontId', String(this.intern('fonts', font)))
      setAttr(xf, 'applyFont', '1')
    }
    if ('fill' in patch) {
      if (!patch.fill) setAttr(xf, 'fillId', '0')
      else {
        const fill = parseRaw(
          `<${P}fill><${P}patternFill patternType="solid"><${P}fgColor rgb="FF${patch.fill.replace('#', '').toUpperCase()}"/><${P}bgColor indexed="64"/></${P}patternFill></${P}fill>`,
        )[0] as RNode
        setAttr(xf, 'fillId', String(this.intern('fills', fill)))
      }
      setAttr(xf, 'applyFill', '1')
    }
    if (patch.border) {
      const sides = (patch as FmtPatch & { sides?: Record<string, boolean> }).sides ?? {}
      const borders = kidsOf(this.section('borders'), 'border')
      const b = clone(borders[Number(getAttr(xf, 'borderId') ?? 0)] ?? borders[0] ?? el(P + 'border'))
      const color = (patch.borderColor ?? '#000000').replace('#', '').toUpperCase()
      const order = ['left', 'start', 'right', 'end', 'top', 'bottom', 'diagonal', 'vertical', 'horizontal']
      for (const side of ['left', 'right', 'top', 'bottom']) {
        if (!(side in sides)) continue
        const node = sides[side] ? el(P + side, { style: patch.borderStyle ?? 'thin' }, [el(P + 'color', { rgb: 'FF' + color })]) : el(P + side)
        setOrdered(b, node, side, order)
      }
      if (!kidOf(b, 'diagonal')) setOrdered(b, el(P + 'diagonal'), 'diagonal', order)
      setAttr(xf, 'borderId', String(this.intern('borders', b)))
      setAttr(xf, 'applyBorder', '1')
    }
    if ('align' in patch || 'wrap' in patch || 'valign' in patch || 'rotate' in patch || 'indent' in patch) {
      const al = clone(kidOf(xf, 'alignment') ?? el(P + 'alignment'))
      if ('align' in patch) setAttr(al, 'horizontal', patch.align ?? undefined)
      if ('indent' in patch) {
        const cur = Number(getAttr(al, 'indent') ?? '0') || 0
        const next = cur + (patch.indent ?? 0)
        setAttr(al, 'indent', next > 0 ? String(next) : undefined)
      }
      if ('valign' in patch) setAttr(al, 'vertical', patch.valign && patch.valign !== 'bottom' ? patch.valign : undefined)
      if ('wrap' in patch) setAttr(al, 'wrapText', patch.wrap ? '1' : undefined)
      if ('rotate' in patch) {
        const v = patch.rotate
        // OOXML: 1-90 counter-clockwise, 91-180 clockwise (90 + deg), 255 vertical
        setAttr(al, 'textRotation', !v ? undefined : v === 255 ? '255' : v > 0 ? String(Math.min(90, v)) : String(90 + Math.min(90, -v)))
      }
      setOrdered(xf, al.a.trim() ? al : undefined, 'alignment', ['alignment', 'protection', 'extLst'])
      setAttr(xf, 'applyAlignment', '1')
    }
    if (patch.numFmt !== undefined) {
      setAttr(xf, 'numFmtId', String(this.numFmtId(patch.numFmt)))
      setAttr(xf, 'applyNumberFormat', '1')
    }
    const idx = this.intern('cellXfs', xf)
    this.cache.set(key, idx)
    return idx
  }

  xml() {
    return serialize(this.nodes)
  }

  /** Replace the <dxfs> section (native conditional-formatting differential styles). */
  setDxfs(sectionXml: string | null) {
    const existing = kidOf(this.root, 'dxfs')
    if (existing) this.root.c = this.root.c.filter((c) => c !== existing)
    if (sectionXml) {
      const node = rootEl(parseRaw(sectionXml))
      if (node) setOrdered(this.root, node, 'dxfs', SS_ORDER)
    }
    this.root.self = this.root.c.length === 0
    this.changed = true
    this.found.delete('dxfs')
  }

  /** collaboration: sizes of the growing sections (to drop what a rolled-back operation derived) */
  mark(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const name of ['numFmts', 'fonts', 'fills', 'borders', 'cellXfs']) out[name] = kidsOf(kidOf(this.root, name)).length
    return out
  }

  truncate(m: Record<string, number>) {
    for (const [name, len] of Object.entries(m)) {
      const sec = kidOf(this.root, name)
      const kids = kidsOf(sec)
      if (!sec || kids.length <= len) continue
      const drop = new Set<RChild>(kids.slice(len))
      sec.c = sec.c.filter((c) => !drop.has(c))
      setAttr(sec, 'count', String(len))
      const idx = this.found.get(name)
      if (idx) for (const [k, v] of idx) if (v >= len) idx.delete(k)
    }
    for (const [k, v] of this.cache) if (v >= m.cellXfs) this.cache.delete(k)
  }
}
