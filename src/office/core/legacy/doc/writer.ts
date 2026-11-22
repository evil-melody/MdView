/**
 * Writes the stories of a Word binary document (main text, headers, notes, comments, text boxes) as WordprocessingML:
 * paragraphs from their marks, tables from the in-table paragraphs and row ends, runs with fields, notes, pictures.
 */
import { escAttr, escText } from '../../raw'
import type { Part } from '../../iwork/ooxml'
import { FIELD_NAMES, FLT, formValue, hyperlink, dttm, type FieldInfo, type Frame } from './fields'
import type { DocModel } from './model'
import { Pictures } from './pictures'
import { applyChp, applyPap, applyTap, emptyTap, expandHuge, type Chp, type Pap, type Tap } from './props'
import type { Seg } from './text'
import { brcXml, clean, fontName, pPrXml, rPrXml } from './wml'

export type StoryKind = 'main' | 'hdr' | 'ftn' | 'edn' | 'atn' | 'txbx'

interface Para {
  p0: number
  /** after the mark */
  p1: number
  /** the mark character (0: none) */
  mark: number
  pap: Pap
  style: number
  depth: number
  tap?: Tap
}

interface Story {
  kind: StoryKind
  cp0: number
  cp1: number
  fields: Map<number, FieldInfo>
  /** separator / end CP → the field's begin */
  role: Map<number, number>
  stack: Frame[]
}

interface Fmt {
  chp: Chp
  rPr: string
  /** revision wrapper (w:ins / w:del start tag key) */
  rev: string
}

const MAX_DEPTH = 8

/** Builds the runs of a paragraph: text, elements, revision wrappers. */
class Runs {
  out = ''
  private rPr = ''
  private body = ''
  private t = ''
  private tTag = 't'
  private rev = ''
  private revTag = ''

  constructor(private w: Writer) {}

  private flushText() {
    if (!this.t) return
    const s = clean(this.t)
    if (s) this.body += `<w:${this.tTag} xml:space="preserve">${escText(s)}</w:${this.tTag}>`
    this.t = ''
  }

  private closeRun() {
    this.flushText()
    if (this.body) this.out += `<w:r>${this.rPr}${this.body}</w:r>`
    this.body = ''
  }

  private closeRev() {
    this.closeRun()
    if (this.rev) this.out += `</w:${this.revTag}>`
    this.rev = ''
  }

  private setRev(rev: string) {
    if (rev === this.rev) return
    this.closeRev()
    if (!rev) return
    this.rev = rev
    this.revTag = rev.startsWith('d') ? 'del' : 'ins'
    this.out += this.w.revTag(rev)
  }

  private use(f: Fmt) {
    this.setRev(f.rev)
    if (f.rPr !== this.rPr) {
      this.closeRun()
      this.rPr = f.rPr
    }
  }

  text(s: string, f: Fmt, instr = false) {
    this.use(f)
    const del = this.revTag === 'del' && !!this.rev
    const tag = instr ? (del ? 'delInstrText' : 'instrText') : del ? 'delText' : 't'
    if (tag !== this.tTag) {
      this.flushText()
      this.tTag = tag
    }
    this.t += s
  }

  el(xml: string, f: Fmt) {
    this.use(f)
    this.flushText()
    this.body += xml
  }

  /** a whole run of its own (pictures, references) */
  run(xml: string, f: Fmt) {
    this.use(f)
    this.closeRun()
    this.out += xml
  }

  raw(xml: string) {
    this.closeRev()
    this.out += xml
  }

  finish(): string {
    this.closeRev()
    return this.out
  }
}

/** Writes stories as WordprocessingML (their pictures and links are relationships of `part`). */
export class Writer {
  part: Part
  readonly pics: Pictures
  private revId = 1
  private fmtCache = new Map<string, Fmt>()
  /** XML put before the character at a CP (bookmarks, comment ranges) */
  private marks = new Map<number, string>()
  private markCps: number[] = []
  private pending = ''
  private noteRefs = new Map<number, { kind: 'footnote' | 'endnote'; id: number; auto: boolean }>()
  private commentRefs = new Map<number, number>()
  private depth = 0
  private contentWidth = 9360

  constructor(
    readonly m: DocModel,
    part: Part,
  ) {
    this.part = part
    this.pics = new Pictures(this)
    m.footnotes.forEach((n, k) => this.noteRefs.set(n.ref, { kind: 'footnote', id: k + 1, auto: n.auto }))
    m.endnotes.forEach((n, k) => this.noteRefs.set(n.ref, { kind: 'endnote', id: k + 1, auto: n.auto }))
    m.comments.forEach((c, k) => this.commentRefs.set(c.ref, k))
    m.bookmarks.forEach((b, k) => {
      const name = escAttr(b.name.slice(0, 40))
      if (b.start === b.end) this.addMark(b.start, `<w:bookmarkStart w:id="${k}" w:name="${name}"/><w:bookmarkEnd w:id="${k}"/>`)
      else {
        this.addMark(b.start, `<w:bookmarkStart w:id="${k}" w:name="${name}"/>`)
        this.addMark(b.end, `<w:bookmarkEnd w:id="${k}"/>`, true)
      }
    })
    m.comments.forEach((c, k) => {
      if (c.start === undefined || c.end === undefined) return
      this.addMark(c.start, `<w:commentRangeStart w:id="${k}"/>`)
      this.addMark(c.end, `<w:commentRangeEnd w:id="${k}"/>`, true)
    })
    this.markCps = [...this.marks.keys()].sort((a, b) => a - b)
    const s = m.sections[0]?.sep
    if (s) this.contentWidth = Math.max(1440, s.w - s.left - s.right)
  }

  private addMark(cp: number, xml: string, first = false) {
    const prev = this.marks.get(cp) ?? ''
    this.marks.set(cp, first ? xml + prev : prev + xml)
  }

  /** w:ins / w:del start tag of a revision key */
  revTag(rev: string): string {
    const [kind, ibst, date] = rev.split('|')
    const author = escAttr(this.m.authors[Number(ibst)] ?? 'Unknown')
    const d = dttm(Number(date))
    return `<w:${kind === 'd' ? 'del' : 'ins'} w:id="${this.revId++}" w:author="${author}"${d ? ` w:date="${d}"` : ''}>`
  }

  // ---------------------------------------------------------------- formatting

  /** the run formatting of a segment in a paragraph of style `style` */
  private fmt(style: number, seg: Seg): Fmt {
    const key = `${style}|${seg.key}`
    const hit = this.fmtCache.get(key)
    if (hit) return hit
    const st = this.m.styles
    const para = st.chp(style)
    const chp: Chp = { ...para }
    const ctx = { para, charStyle: (i: number) => st.charDelta(i) }
    if (seg.chpx.length) applyChp(chp, seg.chpx, para, ctx)
    if (seg.prm.length) applyChp(chp, seg.prm, para, ctx)
    const cs = st.style(chp.istd)
    const charStyle = cs && cs.stk === 2 && cs.sti !== 65 ? cs : undefined
    const base = charStyle ? { ...para, ...st.charDelta(chp.istd) } : para
    const rPr = rPrXml(chp, base, this.m.fonts, charStyle ? `<w:rStyle w:val="${charStyle.id}"/>` : '')
    const rev = chp.rmDel ? `d|${chp.ibstDel || chp.ibst}|${chp.dttmDel || chp.dttm}` : chp.rmIns ? `i|${chp.ibst}|${chp.dttm}` : ''
    if (this.fmtCache.size > 50_000) this.fmtCache.clear()
    const f = { chp, rPr, rev }
    this.fmtCache.set(key, f)
    return f
  }

  private paraOf(p0: number, mark: number, end: number): Para {
    const m = this.m
    const at = mark ? end - 1 : Math.max(p0, end - 1)
    const { istd, g, prm } = m.text.papAt(at)
    const gg = expandHuge(g, m.data)
    const style = m.styles.paraIstd(istd)
    let pap: Pap = { ...m.styles.pap(style) }
    pap.tabs = [...pap.tabs]
    applyPap(pap, gg)
    if (prm.length) applyPap(pap, prm)
    // a list paragraph: the level's indents come before the paragraph's own properties
    const lvl = this.lvlOf(pap.ilfo, pap.ilvl)
    if (lvl?.papx.length) {
      pap = { ...m.styles.pap(style) }
      pap.tabs = [...pap.tabs]
      applyPap(pap, lvl.papx)
      applyPap(pap, gg)
      if (prm.length) applyPap(pap, prm)
    }
    pap.istd = style
    const depth = pap.itap > 0 ? Math.min(pap.itap, 64) : pap.inTable ? 1 : 0
    const para: Para = { p0, p1: end, mark, pap, style, depth }
    if (depth && (pap.ttp || pap.innerTtp)) {
      const tap = emptyTap()
      applyTap(tap, gg)
      if (prm.length) applyTap(tap, prm)
      para.tap = tap
    }
    return para
  }

  // ---------------------------------------------------------------- stories

  /** the paragraphs of [cp0, cp1) */
  private paras(cp0: number, cp1: number, kind: StoryKind): Para[] {
    const text = this.m.text.text
    const out: Para[] = []
    const ends = kind === 'main' ? new Set(this.m.sections.map((s) => s.cp1)) : undefined
    let p0 = cp0
    for (let cp = cp0; cp < cp1; cp++) {
      const c = text.charCodeAt(cp)
      if (c === 0x0d || c === 0x07 || (c === 0x0c && ends?.has(cp + 1))) {
        out.push(this.paraOf(p0, c, cp + 1))
        p0 = cp + 1
      }
    }
    if (p0 < cp1) out.push(this.paraOf(p0, 0, cp1))
    return out
  }

  private fieldsOf(cp0: number, cp1: number): Pick<Story, 'fields' | 'role'> {
    const text = this.m.text.text
    const fields = new Map<number, FieldInfo>()
    const role = new Map<number, number>()
    const stack: { begin: number; sep: number }[] = []
    for (let cp = cp0; cp < cp1; cp++) {
      const c = text.charCodeAt(cp)
      if (c === 0x13) {
        if (stack.length < 64) stack.push({ begin: cp, sep: -1 })
      } else if (c === 0x14) {
        const top = stack[stack.length - 1]
        if (top && top.sep < 0) top.sep = cp
      } else if (c === 0x15) {
        const top = stack.pop()
        if (!top) continue
        const raw = text.slice(top.begin + 1, top.sep >= 0 ? top.sep : cp)
        let instr = raw.replace(/[\u0000-\u001f]/g, (ch) => (ch === '\t' ? ' ' : ''))
        // a localized field name → the field's own name (from its type)
        const name = FLT[this.m.flt.get(top.begin) ?? -1]
        const word = /^\s*([^\s\\"]+)/.exec(instr)
        if (name && word && !FIELD_NAMES.has(word[1].toUpperCase())) instr = instr.replace(word[1], name)
        fields.set(top.begin, { sep: top.sep, end: cp, instr, nested: raw.includes('\u0013') })
        role.set(cp, top.begin)
        if (top.sep >= 0) role.set(top.sep, top.begin)
      }
    }
    return { fields, role }
  }

  /** WordprocessingML blocks of a story */
  story(cp0: number, cp1: number, kind: StoryKind, sectPrs?: Map<number, string>): string {
    if (this.depth > MAX_DEPTH || cp1 <= cp0) return ''
    this.depth++
    try {
      const st: Story = { kind, cp0, cp1, ...this.fieldsOf(cp0, cp1), stack: [] }
      const paras = this.paras(cp0, cp1, kind)
      const saved = this.pending
      this.pending = ''
      const out: string[] = []
      let i = 0
      let guard = 0
      while (i < paras.length && guard++ < paras.length * 4 + 10) {
        const p = paras[i]
        if (p.depth > 0) {
          const t = this.table(paras, i, 1, st)
          out.push(t.xml)
          i = t.i > i ? t.i : i + 1
          continue
        }
        out.push(this.paragraph(p, st, i === paras.length - 1, sectPrs?.get(p.p1)))
        i++
      }
      // marks at the very end of a story that ends with a table
      if (paras.length && paras[paras.length - 1].depth > 0) for (const cp of this.marksIn(cp1, cp1 + 1)) this.pending += this.marks.get(cp)
      // fields still open at the end of the story
      let tail = ''
      for (const f of st.stack.reverse()) if (f.mode === 'complex') tail += '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
      if (tail || this.pending) out.push(`<w:p>${this.pending}${tail}</w:p>`)
      this.pending = saved
      return out.join('')
    } finally {
      this.depth--
    }
  }

  // ---------------------------------------------------------------- tables

  private isCellEnd(p: Para, d: number): boolean {
    return d === 1 ? p.mark === 0x07 && !p.pap.ttp : p.pap.innerCell && !p.pap.innerTtp
  }

  private isRowEnd(p: Para, d: number): boolean {
    return d === 1 ? p.pap.ttp : p.pap.innerTtp
  }

  private table(paras: Para[], i: number, d: number, st: Story): { xml: string; i: number } {
    const rows: { cells: string[]; tap: Tap }[] = []
    let guard = 0
    while (i < paras.length && paras[i].depth >= d && guard++ < paras.length + 10) {
      const cells: string[] = []
      let tap: Tap | undefined
      let inner = 0
      while (i < paras.length && paras[i].depth >= d && inner++ < paras.length + 10) {
        const p = paras[i]
        if (p.depth === d && this.isRowEnd(p, d)) {
          tap = p.tap
          this.skip(p)
          i++
          break
        }
        const c = this.cell(paras, i, d, st)
        if (c.i <= i) {
          i++
          continue
        }
        cells.push(c.xml)
        i = c.i
      }
      if (cells.length) rows.push({ cells, tap: tap ?? emptyTap() })
    }
    return { xml: this.tableXml(rows), i }
  }

  /** the blocks of a cell: up to its cell mark */
  private cell(paras: Para[], i: number, d: number, st: Story): { xml: string; i: number } {
    let xml = ''
    let endsWithTable = false
    while (i < paras.length) {
      const p = paras[i]
      if (p.depth > d) {
        const t = this.table(paras, i, d + 1, st)
        xml += t.xml
        endsWithTable = true
        i = t.i > i ? t.i : i + 1
        continue
      }
      if (p.depth < d || this.isRowEnd(p, d)) break
      xml += this.paragraph(p, st, false)
      endsWithTable = false
      i++
      if (this.isCellEnd(p, d)) break
    }
    if (!xml || endsWithTable) xml += '<w:p/>'
    return { xml, i }
  }

  private tableXml(rows: { cells: string[]; tap: Tap }[]): string {
    if (!rows.length) return ''
    // each row's cell boundaries (horizontally merged cells joined)
    const layout = rows.map(({ cells, tap }) => {
      const xs: number[] = []
      const tcs = tap.tc
      const n = cells.length
      let x = tap.centers[0] ?? 0
      xs.push(x)
      for (let k = 0; k < n; k++) {
        const next = tap.centers[k + 1]
        x = next !== undefined && next > x ? next : x + Math.max(360, Math.round(this.contentWidth / n))
        xs.push(x)
      }
      const out: { x0: number; x1: number; xml: string; k: number }[] = []
      for (let k = 0; k < n; k++) {
        const tc = tcs[k]
        if (tc && tc.hm & 2 && !(tc.hm & 1) && out.length) {
          const prev = out[out.length - 1]
          prev.x1 = xs[k + 1]
          if (/<w:t[ >]/.test(cells[k])) prev.xml += cells[k]
          continue
        }
        out.push({ x0: xs[k], x1: xs[k + 1], xml: cells[k], k })
      }
      return out
    })
    // the grid: every boundary of every row
    const all = [...new Set(layout.flatMap((r) => r.flatMap((c) => [c.x0, c.x1])))].sort((a, b) => a - b)
    const grid: number[] = []
    for (const x of all) if (!grid.length || x - grid[grid.length - 1] > 4) grid.push(x)
    const col = (x: number) => {
      let best = 0
      for (let k = 1; k < grid.length; k++) if (Math.abs(grid[k] - x) < Math.abs(grid[best] - x)) best = k
      return best
    }
    const t0 = rows[0].tap
    const widths = grid.slice(1).map((x, k) => Math.max(1, x - grid[k]))
    const total = grid[grid.length - 1] - grid[0]
    let tblPr = ''
    if (t0.widthFts === 3 && t0.width > 0) tblPr += `<w:tblW w:w="${t0.width}" w:type="dxa"/>`
    else if (t0.widthFts === 2 && t0.width > 0) tblPr += `<w:tblW w:w="${t0.width}" w:type="pct"/>`
    else tblPr += `<w:tblW w:w="${total}" w:type="dxa"/>`
    if (t0.jc) tblPr += `<w:jc w:val="${t0.jc === 1 ? 'center' : 'right'}"/>`
    else if (grid[0]) tblPr += `<w:tblInd w:w="${grid[0]}" w:type="dxa"/>`
    const sides = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    const tb = sides.map((s, k) => (t0.brc[k] !== undefined ? brcXml(s, t0.brc[k]!) : '')).join('')
    if (tb) tblPr += `<w:tblBorders>${tb}</w:tblBorders>`
    tblPr += '<w:tblLayout w:type="fixed"/>'
    const pad = (k: number, d: number) => t0.pad[k] ?? d
    tblPr += `<w:tblCellMar><w:top w:w="${pad(0, 0)}" w:type="dxa"/><w:left w:w="${pad(1, t0.gapHalf)}" w:type="dxa"/><w:bottom w:w="${pad(2, 0)}" w:type="dxa"/><w:right w:w="${pad(3, t0.gapHalf)}" w:type="dxa"/></w:tblCellMar>`
    tblPr += '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>'
    let x = `<w:tbl><w:tblPr>${tblPr}</w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    rows.forEach(({ tap }, r) => {
      const cells = layout[r]
      const first = col(cells[0].x0)
      const last = col(cells[cells.length - 1].x1)
      let trPr = ''
      if (first > 0) trPr += `<w:gridBefore w:val="${first}"/><w:wBefore w:w="${grid[first] - grid[0]}" w:type="dxa"/>`
      if (last < grid.length - 1) trPr += `<w:gridAfter w:val="${grid.length - 1 - last}"/>`
      if (tap.cantSplit) trPr += '<w:cantSplit/>'
      if (tap.rowH) trPr += `<w:trHeight w:val="${Math.abs(tap.rowH)}" w:hRule="${tap.rowH < 0 ? 'exact' : 'atLeast'}"/>`
      if (tap.header) trPr += '<w:tblHeader/>'
      x += `<w:tr>${trPr ? `<w:trPr>${trPr}</w:trPr>` : ''}`
      for (const c of cells) {
        const tc = tap.tc[c.k]
        const a = col(c.x0)
        const span = Math.max(1, col(c.x1) - a)
        let tcPr = `<w:tcW w:w="${Math.max(0, c.x1 - c.x0)}" w:type="dxa"/>`
        if (span > 1) tcPr += `<w:gridSpan w:val="${span}"/>`
        if (tc) {
          if (tc.vm === 3) tcPr += '<w:vMerge w:val="restart"/>'
          else if (tc.vm === 1) tcPr += '<w:vMerge/>'
          const b = ['top', 'left', 'bottom', 'right'].map((s, k) => (tc.brc[k] !== undefined ? brcXml(s, tc.brc[k]!) : '')).join('')
          if (b) tcPr += `<w:tcBorders>${b}</w:tcBorders>`
          if (tc.shd) tcPr += `<w:shd w:val="clear" w:color="auto" w:fill="${tc.shd}"/>`
          if (tc.pad.some((v) => v !== undefined))
            tcPr += `<w:tcMar>${['top', 'left', 'bottom', 'right'].map((s, k) => (tc.pad[k] !== undefined ? `<w:${s} w:w="${tc.pad[k]}" w:type="dxa"/>` : '')).join('')}</w:tcMar>`
          if (tc.vertical) tcPr += '<w:textDirection w:val="tbRl"/>'
          if (tc.va) tcPr += `<w:vAlign w:val="${tc.va === 1 ? 'center' : 'bottom'}"/>`
        }
        x += `<w:tc><w:tcPr>${tcPr}</w:tcPr>${c.xml}</w:tc>`
      }
      x += '</w:tr>'
    })
    return x + '</w:tbl>'
  }

  // ---------------------------------------------------------------- paragraphs

  /** marks (bookmarks, comment ranges) of a paragraph that is not written (a row end) move to the next one */
  private skip(p: Para) {
    for (const cp of this.marksIn(p.p0, p.p1)) this.pending += this.marks.get(cp)
  }

  private marksIn(a: number, b: number): number[] {
    const out: number[] = []
    const cps = this.markCps
    let lo = 0
    let hi = cps.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cps[mid] < a) lo = mid + 1
      else hi = mid
    }
    for (let k = lo; k < cps.length && cps[k] < b; k++) out.push(cps[k])
    return out
  }

  private paragraph(p: Para, st: Story, last: boolean, sectPr?: string): string {
    const m = this.m
    const text = m.text.text
    const runs = new Runs(this)
    if (this.pending) {
      runs.raw(this.pending)
      this.pending = ''
    }
    const markCp = p.mark ? p.p1 - 1 : -1
    let markFmt: Fmt | undefined
    const marks = this.marksIn(p.p0, last ? p.p1 + 1 : p.p1)
    let mi = 0
    for (const seg of m.text.segs(p.p0, p.p1)) {
      const f = this.fmt(p.style, seg)
      let cp = seg.cp0
      while (cp < seg.cp1) {
        while (mi < marks.length && marks[mi] <= cp) runs.raw(this.marks.get(marks[mi++])!)
        if (cp === markCp) {
          markFmt = f
          cp++
          continue
        }
        const c = text.charCodeAt(cp)
        if (c >= 0x20 && c !== 0x28 && !this.noteRefs.has(cp)) {
          // plain text up to the next special character or mark
          let e = cp + 1
          const stop = Math.min(seg.cp1, mi < marks.length ? marks[mi] : Infinity, markCp >= 0 ? markCp : Infinity)
          while (e < stop) {
            const d = text.charCodeAt(e)
            if (d < 0x20 || d === 0x28 || this.noteRefs.has(e)) break
            e++
          }
          this.plain(text.slice(cp, e), f, st, runs)
          cp = e
          continue
        }
        this.special(cp, c, f, st, runs, p)
        cp++
      }
    }
    while (mi < marks.length) runs.raw(this.marks.get(marks[mi++])!)

    // properties: the differences from the style (and the list level)
    // a table in a frame (a floating table) shows in the flow: its cells' paragraphs are not frames
    const pap = p.depth ? { ...p.pap, pc: 0, xAbs: 0, yAbs: 0, wAbs: 0 } : p.pap
    const styles = m.styles
    let base: Pap = styles.pap(p.style)
    let numPr: string | undefined
    if (pap.ilfo !== base.ilfo || pap.ilvl !== base.ilvl) {
      const id = this.numId(pap.ilfo)
      numPr = `<w:numPr><w:ilvl w:val="${pap.ilvl}"/><w:numId w:val="${id}"/></w:numPr>`
    }
    const lvl = this.lvlOf(pap.ilfo, pap.ilvl)
    if (lvl?.papx.length) {
      // the level's indents and tabs come between the style's and the paragraph's own
      base = { ...base }
      applyPap(base, lvl.papx)
    }
    const styleId = p.style ? styles.style(p.style)?.id : undefined
    let markRPr = ''
    if (markFmt) {
      const inner = markFmt.rPr.slice(7, -8)
      if (inner) markRPr = `<w:rPr>${inner}</w:rPr>`
    }
    const pPr = pPrXml(pap, base, { style: styleId, numPr, markRPr, sectPr })
    return `<w:p>${pPr}${runs.finish()}</w:p>`
  }

  /** numId of an LFO index (0: not a list) */
  numId(ilfo: number): number {
    return ilfo > 0 && ilfo <= this.m.lfos.length && this.m.lsts.length ? ilfo : 0
  }

  /** the list level a paragraph's indents come from */
  lvlOf(ilfo: number, ilvl: number) {
    const lfo = ilfo > 0 ? this.m.lfos[ilfo - 1] : undefined
    if (!lfo) return undefined
    const ov = lfo.overrides.find((o) => o.ilvl === ilvl)?.lvl
    if (ov) return ov
    const lst = this.m.lsts.find((l) => l.lsid === lfo.lsid)
    return lst?.lvls[lst.simple ? 0 : ilvl]
  }

  private hidden(st: Story): boolean {
    return st.stack.some((f) => f.mode === 'drop' || (f.phase === 'instr' && (f.mode === 'link' || f.skip)))
  }

  private inInstr(st: Story): boolean {
    const top = st.stack[st.stack.length - 1]
    return !!top && top.phase === 'instr'
  }

  private plain(s: string, f: Fmt, st: Story, runs: Runs) {
    if (!st.stack.length) {
      runs.text(s, f)
      return
    }
    if (this.hidden(st)) return
    runs.text(s, f, this.inInstr(st))
  }

  private special(cp: number, c: number, f: Fmt, st: Story, runs: Runs, p: Para) {
    const chp = f.chp
    // fields
    if (c === 0x13) {
      const info = st.fields.get(cp)
      if (!info) return
      const hidden = this.hidden(st)
      // a link only outside instructions and other links (w:hyperlink does not nest)
      const inInstr = st.stack.some((x) => x.phase === 'instr' || x.mode === 'link')
      if (hidden) {
        st.stack.push({ begin: cp, mode: 'drop', phase: 'instr' })
        return
      }
      const link = !inInstr && info.sep >= 0 && info.end < p.p1 ? hyperlink(info.instr) : undefined
      if (link) {
        let open: string
        if (link.url) {
          const target = link.url + (link.anchor ? '#' + link.anchor : '')
          open = `<w:hyperlink r:id="${this.part.rel('hyperlink', target, true)}"${link.tip ? ` w:tooltip="${escAttr(link.tip)}"` : ''} w:history="1">`
        } else open = `<w:hyperlink w:anchor="${escAttr(link.anchor!)}"${link.tip ? ` w:tooltip="${escAttr(link.tip)}"` : ''} w:history="1">`
        st.stack.push({ begin: cp, mode: 'link', phase: 'instr', link: open })
        return
      }
      const fr: Frame = { begin: cp, mode: 'complex', phase: 'instr', instr: info.instr }
      st.stack.push(fr)
      runs.el('<w:fldChar w:fldCharType="begin"/>', f)
      if (!info.nested) {
        // the instruction as read (with its field name in English)
        runs.text(info.instr, f, true)
        fr.skip = true
      }
      return
    }
    // a form field's data
    if (c === 0x01 && chp.data && chp.pic >= 0) {
      const top = st.stack[st.stack.length - 1]
      if (top && top.phase === 'instr') top.form = chp.pic
      return
    }
    if (c === 0x14 || c === 0x15) {
      const begin = st.role.get(cp)
      if (begin === undefined) return
      const k = st.stack.findIndex((x) => x.begin === begin)
      if (k < 0) return
      // fields left open inside this one end with it
      while (st.stack.length > k + 1) this.closeField(st.stack.pop()!, f, runs)
      const top = st.stack[k]
      if (c === 0x14) {
        if (top.phase === 'result') return
        top.phase = 'result'
        if (top.mode === 'complex') runs.el('<w:fldChar w:fldCharType="separate"/>', f)
        else if (top.mode === 'link') runs.raw(top.link!)
      } else this.closeField(st.stack.pop()!, f, runs)
      return
    }
    if (this.hidden(st)) return
    if (this.inInstr(st)) {
      if (c === 0x09) runs.text(' ', f, true)
      else if (c >= 0x20) runs.text(String.fromCharCode(c), f, true)
      return
    }
    const note = st.kind === 'main' ? this.noteRefs.get(cp) : undefined
    if (note) {
      const tag = note.kind === 'footnote' ? 'footnoteReference' : 'endnoteReference'
      if (c === 0x02) runs.el(`<w:${tag} w:id="${note.id}"/>`, f)
      else {
        runs.el(`<w:${tag} w:customMarkFollows="1" w:id="${note.id}"/>`, f)
        if (c >= 0x20) runs.text(String.fromCharCode(c), f)
      }
      return
    }
    switch (c) {
      case 0x09:
        runs.el('<w:tab/>', f)
        return
      case 0x0a:
      case 0x0b:
        runs.el('<w:br/>', f)
        return
      case 0x0c:
        runs.el('<w:br w:type="page"/>', f)
        return
      case 0x0e:
        runs.el('<w:br w:type="column"/>', f)
        return
      case 0x1e:
        runs.el('<w:noBreakHyphen/>', f)
        return
      case 0x1f:
        runs.el('<w:softHyphen/>', f)
        return
      case 0x01:
        if (chp.spec && !chp.data && chp.pic >= 0) {
          const xml = this.pics.inlinePicture(chp, f.rPr)
          if (xml) runs.run(xml, f)
        }
        return
      case 0x02:
        if (st.kind === 'ftn') runs.el('<w:footnoteRef/>', f)
        else if (st.kind === 'edn') runs.el('<w:endnoteRef/>', f)
        return
      case 0x03:
        runs.el('<w:separator/>', f)
        return
      case 0x04:
        runs.el('<w:continuationSeparator/>', f)
        return
      case 0x05:
        if (st.kind === 'main') {
          const k = this.commentRefs.get(cp)
          if (k !== undefined) runs.el(`<w:commentReference w:id="${k}"/>`, f)
        } else if (st.kind === 'atn') runs.el('<w:annotationRef/>', f)
        return
      case 0x08:
        if (chp.spec) {
          const xml = this.pics.floating(cp, st.kind, f.rPr)
          if (xml) runs.run(xml, f)
        }
        return
      case 0x28:
        if (chp.spec && chp.sym >= 0) {
          const font = escAttr(fontName(this.m.fonts, chp.symFtc))
          runs.el(`<w:sym w:font="${font}" w:char="${chp.sym.toString(16).toUpperCase().padStart(4, '0')}"/>`, f)
        } else runs.text('(', f)
        return
    }
  }

  private closeField(fr: Frame, f: Fmt, runs: Runs) {
    if (fr.mode === 'complex') {
      if (fr.phase === 'instr') {
        // a check box or drop-down has no result: its value is shown
        const v = fr.form !== undefined && /^\s*FORM(CHECKBOX|DROPDOWN)/i.test(fr.instr ?? '') ? formValue(this.m.data, fr.form) : undefined
        runs.el('<w:fldChar w:fldCharType="separate"/>', f)
        if (v) runs.text(v, f)
      }
      runs.el('<w:fldChar w:fldCharType="end"/>', f)
    } else if (fr.mode === 'link' && fr.phase === 'result') runs.raw('</w:hyperlink>')
  }
}
