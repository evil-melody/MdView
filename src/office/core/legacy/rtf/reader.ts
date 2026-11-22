/**
 * The RTF interpreter: a stack of group states (destination, character and paragraph properties, `\uc`), control
 * words applied to it, and text flowing into stories (body, headers / footers, notes, text boxes) as WordprocessingML.
 */
import { Part } from '../../iwork/ooxml'
import { escAttr } from '../../raw'
import { charsetCp, knownCp } from './codepage'
import { BIN, CLOSE, END, HEX, Lexer, OPEN, SYMBOL, TEXT, WORD } from './lexer'
import { Numbering, type Level, type ListDef, type Override } from './lists'
import { Story, type DocSetup, type Field, type Item, type Sect, type Shape, type State } from './model'
import { Media, type Pict } from './pictures'
import { pPrDiff, rPrDiff, type Border, type Chp, type Font, type Pap, type Pn, type Side, type Tables } from './props'
import { RtfStyles, type StyleDef } from './styles'
import { newCell, newRow, TableLevel, tableXml, type CellDef, type RowDef } from './tables'
import { D_COLOR, D_FONT, D_PICT, D_SHEET, D_STORY, D_STYLE, D_TEXT, D_UPR, RunBuf, runXml, TextAcc } from './text'
import { WORDS } from './words'

const MAX_DEPTH = 1000

/** the family of a PostScript font name (Cocoa writes those): "Times-Bold" → "Times", "TimesNewRomanPSMT" → "Times New Roman" */
export function psFamily(name: string): string {
  if (/\s/.test(name)) return name
  const base = name.replace(/-[A-Za-z]+$/, '').replace(/(PSMT|PS|MT)$/, '')
  return base.replace(/([a-z])([A-Z])/g, '$1 $2') || name
}

/** an RTF date-time (DTTM: minutes, hours, day, month, year since 1900 in bit fields) as ISO 8601 */
function dttm(v: number | undefined): string | undefined {
  if (!v) return undefined
  const min = v & 0x3f
  const hour = (v >>> 6) & 0x1f
  const day = (v >>> 11) & 0x1f
  const month = (v >>> 16) & 0xf
  const year = 1900 + ((v >>> 20) & 0x1ff)
  if (!day || !month || month > 12 || min > 59 || hour > 23) return undefined
  const p = (n: number) => String(n).padStart(2, '0')
  return `${year}-${p(month)}-${p(day)}T${p(hour)}:${p(min)}:00Z`
}

/** a key of what a property record holds */
function propKey(o: object): string {
  let k = ''
  const r = o as Record<string, unknown>
  for (const n in r) {
    const v = r[n]
    if (v !== undefined) k += n + '=' + (typeof v === 'object' ? JSON.stringify(v) : v) + ';'
  }
  return k
}

export class RtfReader {
  readonly lx: Lexer
  readonly stack: State[] = []
  st: State
  readonly tables: Tables = { fonts: new Map(), colors: [] }
  readonly styles: RtfStyles
  readonly num: Numbering
  readonly media = new Media()
  ansi = 1252
  readonly docPart = new Part('word/document.xml')
  readonly notePart = new Part('word/footnotes.xml')
  readonly endPart = new Part('word/endnotes.xml')
  readonly body: Story
  readonly footnotes: string[] = []
  readonly endnotes: string[] = []
  /** headers / footers referenced from sections */
  readonly hfFiles = new Map<string, { part: Part; xml: string }>()
  hfCount = { header: 0, footer: 0 }
  doc: DocSetup = { pgW: 12240, pgH: 15840, ml: 1800, mr: 1800, mt: 1440, mb: 1440, gutter: 0, landscape: false, facing: false, mirror: false, deftab: 720 }
  sect: Sect = { hf: {} }
  /** sectPr of the last section (the body's) */
  finalSect = ''
  private done = false

  // the run being read
  private buf = new RunBuf()
  private runRPr = ''
  private runLink?: string
  private runStory?: Story
  /** the tracked change the run belongs to (w:ins / w:del attributes) */
  private runRev = ''
  /** authors of tracked changes (\revtbl) */
  revAuthors: string[] = []
  /** w:id of bookmarks and tracked changes */
  annId = 0
  dirty = true
  lastCh?: Chp
  private lastS?: number
  private lastRPr = ''
  private ucSkip = 0
  private starred = false
  /** nothing but \* read since the last { */
  private fresh = false
  private cpCache = new Map<number, number>()
  /** run / paragraph properties by what they are made of */
  private rPrCache = new Map<string, string>()
  private pPrCache = new Map<string, string>()

  // tables: the row definition being read, per nesting level
  rowDefs: RowDef[] = [newRow(), newRow()]
  cell: CellDef = newCell()
  /** what border words apply to: a paragraph side, a row side, a cell side */
  brdr?: { kind: 'p' | 'r' | 'c'; sides: Side[] }
  tabKind?: string
  tabLeader?: string

  // header tables
  font?: { idx: number; f: Font; acc: TextAcc }
  color = { r: 0, g: 0, b: 0, set: false }
  list?: ListDef
  level?: Level
  ovr?: Override
  lfo = -1
  pn?: Pn
  style?: StyleDef

  fields: Field[] = []
  /** bookmarks: name → w:id, and those started but not ended */
  readonly marks = new Map<string, number>()
  readonly openMarks = new Set<number>()
  /** run properties of the last \chftn of the body (the mark of the note that follows) */
  ftnRPr?: string
  pict?: Pict
  shapes: Shape[] = []
  sn?: string
  sv?: string
  /** the last \shppict gave a picture: its \nonshppict is skipped */
  shppict: 'none' | 'ok' | 'fail' = 'none'
  /** written by Apple's Cocoa text system (\cocoartf) */
  cocoa = false
  /** Cocoa attachment character after a \NeXTGraphic group */
  dropAttachment = false

  constructor(bytes: Uint8Array) {
    this.lx = new Lexer(bytes)
    this.styles = new RtfStyles(this.tables)
    this.styles.defChp = { f: 0, fs: 24 }
    this.num = new Numbering(this.tables)
    this.body = new Story(this.docPart, 'body')
    this.st = { dest: D_STORY, ch: {}, chOwn: true, pp: {}, ppOwn: true, uc: 1, dbch: false, story: this.body }
    this.stack.push(this.st)
  }

  // ---------------------------------------------------------------- state

  /** forgets computed properties (the style, font or color tables changed) */
  invalidate() {
    this.rPrCache.clear()
    this.pPrCache.clear()
    this.lastCh = undefined
  }

  setAnsi(cp: number) {
    this.ansi = cp
    this.cpCache.clear()
  }

  /** the character properties of the group, to change */
  chp(): Chp {
    const s = this.st
    if (!s.chOwn) {
      s.ch = { ...s.ch }
      s.chOwn = true
    }
    this.dirty = true
    this.lastCh = undefined
    return s.ch
  }

  pap(): Pap {
    const s = this.st
    if (!s.ppOwn) {
      s.pp = { ...s.pp }
      s.ppOwn = true
    }
    this.dirty = true
    this.lastCh = undefined
    return s.pp
  }

  /** the row definition words apply to */
  get row(): RowDef {
    return this.rowDefs[this.st.nest ? Math.max(2, this.depthOf(this.st.pp)) : 1] ?? this.rowDefs[1]
  }

  newRowDef() {
    const lvl = this.st.nest ? Math.min(64, Math.max(2, this.depthOf(this.st.pp))) : 1
    this.rowDefs[lvl] = newRow()
    this.cell = newCell()
  }

  /** skips the rest of the current group */
  skip() {
    this.lx.skipGroup()
    if (this.stack.length <= 1) return
    // the document's own group: its end
    if (this.stack.length === 2) {
      this.finishBody(this.st)
      this.done = true
    }
    this.stack.pop()
    this.st = this.stack[this.stack.length - 1]
    this.dirty = true
  }

  private open() {
    const p = this.st
    if (this.stack.length >= MAX_DEPTH) {
      this.lx.skipGroup()
      return
    }
    const s: State = {
      dest: p.dest, ch: p.ch, chOwn: false, pp: p.pp, ppOwn: false, uc: p.uc, dbch: p.dbch, story: p.story,
      link: p.link, acc: p.acc, ret: p.ret, pictTo: p.pictTo, shppict: p.shppict, nest: p.nest,
    }
    this.stack.push(s)
    this.st = s
    if (p.dest === D_SHEET) this.beginStyle(s)
    else if (p.dest === D_FONT) s.onEnd = () => this.fontCommit()
    else if (p.dest === D_UPR && !this.peekUd()) this.skip()
  }

  private close() {
    if (this.stack.length <= 1) return
    if (this.stack.length === 2) {
      this.finishBody(this.st)
      this.done = true
    }
    const s = this.stack.pop()!
    this.st = this.stack[this.stack.length - 1]
    this.dirty = true
    if (s.onEnd) s.onEnd(s)
  }

  /** `{\*\ud` follows (the Unicode half of a \upr group) */
  private peekUd(): boolean {
    const b = this.lx.b
    let p = this.lx.pos
    while (p < b.length && (b[p] === 32 || b[p] === 13 || b[p] === 10)) p++
    const want = '\\*\\ud'
    for (let k = 0; k < want.length; k++) if (b[p + k] !== want.charCodeAt(k)) return false
    const after = b[p + want.length]
    return !((after >= 0x61 && after <= 0x7a) || (after >= 0x41 && after <= 0x5a))
  }

  // ---------------------------------------------------------------- main loop

  run(): void {
    const lx = this.lx
    for (;;) {
      if (this.done) return
      const t = lx.next()
      switch (t) {
        case END:
          while (this.stack.length > 2) this.close()
          if (this.stack.length === 2) this.close()
          return
        case OPEN:
          this.ucSkip = 0
          this.starred = false
          this.open()
          this.fresh = true
          break
        case CLOSE:
          this.ucSkip = 0
          this.starred = false
          this.fresh = false
          this.close()
          break
        case WORD: {
          if (this.ucSkip > 0) {
            this.ucSkip--
            this.starred = false
            break
          }
          const starred = this.starred
          this.starred = false
          this.word(lx.word, lx.hasParam, lx.param, starred)
          break
        }
        case SYMBOL:
          if (this.ucSkip > 0) {
            this.ucSkip--
            break
          }
          if (lx.word === '*') this.starred = true
          else {
            this.starred = false
            this.symbol(lx.word)
          }
          break
        case HEX:
          this.starred = false
          this.fresh = false
          if (this.ucSkip > 0) this.ucSkip--
          else this.byte(lx.param)
          break
        case TEXT: {
          this.starred = false
          this.fresh = false
          let s = lx.start
          if (this.ucSkip > 0) {
            const k = Math.min(this.ucSkip, lx.end - s)
            s += k
            this.ucSkip -= k
          }
          if (s < lx.end) this.text(s, lx.end)
          break
        }
        case BIN:
          this.starred = false
          if (this.ucSkip > 0) this.ucSkip--
          else if (this.st.dest === D_PICT && this.pict) this.pict.data.raw(lx.b, lx.start, lx.end)
          break
      }
    }
  }

  private word(w: string, has: boolean, p: number, starred: boolean) {
    const h = WORDS.get(w)
    const fresh = this.fresh
    this.fresh = false
    if (h?.dest) {
      // a destination word in the document's own group that does not open a group of its own would take the rest of the document
      if (fresh || this.stack.length > 2) h.fn(this, p, has)
      return
    }
    if (starred && !h?.star) {
      this.skip()
      return
    }
    const d = this.st.dest
    if (d === D_COLOR) {
      if (w === 'red' || w === 'green' || w === 'blue') {
        this.color[w === 'red' ? 'r' : w === 'green' ? 'g' : 'b'] = Math.max(0, Math.min(255, p))
        this.color.set = true
        return
      }
    } else if (d === D_FONT) {
      if (w === 'f') {
        this.fontCommit()
        this.font = { idx: p, f: { name: '' }, acc: new TextAcc() }
        return
      }
      if (w === 'fcharset') {
        if (this.font) this.font.f.charset = p
        return
      }
      if (w === 'cpg') {
        if (this.font && knownCp(p)) this.font.f.cpg = p
        return
      }
    }
    h?.fn(this, p, has)
  }

  private symbol(c: string) {
    switch (c) {
      case '\\':
      case '{':
      case '}':
        this.char(c)
        break
      case '~':
        this.char('\u00a0')
        break
      case '-':
        this.char('\u00ad')
        break
      case '_':
        this.char('\u2011')
        break
      case '\n':
      case '\r':
        this.par()
        break
      case '\t':
        this.char('\t')
        break
    }
  }

  /** the code page of text in the current font */
  cp(): number {
    const s = this.st
    if (s.dest === D_FONT && this.font) {
      const f = this.font.f
      return f.cpg ?? charsetCp(f.charset, this.ansi)
    }
    const f = s.dbch && s.ch.fEA !== undefined ? s.ch.fEA : (s.ch.f ?? this.styles.defChp.f)
    if (f === undefined) return this.ansi
    let cp = this.cpCache.get(f)
    if (cp === undefined) {
      const font = this.tables.fonts.get(f)
      cp = font ? (font.cpg ?? charsetCp(font.charset, this.ansi)) : this.ansi
      this.cpCache.set(f, cp)
    }
    return cp
  }

  private text(s: number, e: number) {
    const st = this.st
    const b = this.lx.b
    switch (st.dest) {
      case D_STORY:
        if (this.dropAttachment) {
          this.dropAttachment = false
          if (b[s] === 0xac && ++s >= e) return
        }
        if (this.dirty || this.runStory !== st.story) this.sync()
        this.buf.bytes(b, s, e, this.cp())
        return
      case D_PICT:
        this.pict?.data.hex(b, s, e)
        return
      case D_TEXT:
      case D_STYLE: {
        const acc = st.acc
        if (!acc) return
        const cp = this.cp()
        for (let k = s; k < e; k++) acc.byte(b[k], cp)
        return
      }
      case D_FONT: {
        const f = this.font
        if (!f) return
        const cp = this.cp()
        for (let k = s; k < e; k++) {
          if (b[k] === 0x3b) this.fontCommit()
          else if (this.font) f.acc.byte(b[k], cp)
        }
        return
      }
      case D_COLOR:
        for (let k = s; k < e; k++) if (b[k] === 0x3b) this.colorCommit()
        return
    }
  }

  /** a byte from \'hh */
  private byte(v: number) {
    const st = this.st
    switch (st.dest) {
      case D_STORY:
        if (this.dropAttachment) {
          this.dropAttachment = false
          if (v === 0xac) return
        }
        if (this.dirty || this.runStory !== st.story) this.sync()
        this.buf.byte(v, this.cp())
        return
      case D_TEXT:
      case D_STYLE:
        st.acc?.byte(v, this.cp())
        return
      case D_FONT:
        this.font?.acc.byte(v, this.cp())
        return
    }
  }

  /** characters (\u, \tab, \emdash…) */
  char(c: string) {
    const st = this.st
    switch (st.dest) {
      case D_STORY:
        this.dropAttachment = false
        if (this.dirty || this.runStory !== st.story) this.sync()
        this.buf.str(c)
        return
      case D_TEXT:
      case D_STYLE:
        st.acc?.str(c)
        return
      case D_FONT:
        this.font?.acc.str(c)
        return
    }
  }

  /** \uN, then skip its fallback characters */
  unicode(n: number) {
    const code = n < 0 ? n + 65536 : n
    if (code === 9) this.char('\t')
    else if (code >= 0x20 || code === 0) {
      if (code) this.char(String.fromCharCode(code))
    }
    this.ucSkip = this.st.uc
  }

  // ---------------------------------------------------------------- header tables

  fontCommit() {
    const f = this.font
    if (!f) return
    this.font = undefined
    f.f.name = f.acc.text().split(';')[0].trim()
    if (this.cocoa) f.f.name = psFamily(f.f.name)
    if (!this.tables.fonts.has(f.idx)) this.tables.fonts.set(f.idx, f.f)
    this.cpCache.clear()
    this.invalidate()
  }

  colorCommit() {
    const c = this.color
    const hex = (v: number) => v.toString(16).padStart(2, '0')
    this.tables.colors.push(c.set ? `${hex(c.r)}${hex(c.g)}${hex(c.b)}`.toUpperCase() : undefined)
    this.invalidate()
    this.color = { r: 0, g: 0, b: 0, set: false }
  }

  private beginStyle(s: State) {
    s.dest = D_STYLE
    s.ch = {}
    s.chOwn = true
    s.pp = {}
    s.ppOwn = true
    s.acc = new TextAcc()
    const def: StyleDef = { num: 0, kind: 'p', name: '', ch: s.ch, pp: s.pp }
    this.style = def
    s.onEnd = (x) => {
      if (this.style !== def) return
      this.style = undefined
      def.ch = x.ch
      def.pp = x.pp
      def.name = x.acc!.text().split(';')[0].trim()
      this.styles.add(def)
    }
  }

  // ---------------------------------------------------------------- runs and paragraphs

  /** run properties of text in state `s` */
  rPrOf(s: State): string {
    const ch = s.ch
    if (ch === this.lastCh && s.pp.s === this.lastS) return this.lastRPr
    const key = `${s.pp.s ?? ''}|${propKey(ch)}`
    let r = this.rPrCache.get(key)
    if (r === undefined) {
      const base = this.styles.runBase(s.pp.s, ch.cs)
      let x = rPrDiff(this.tables, { ...this.styles.defChp, ...ch }, base)
      const cid = this.styles.charId(ch.cs)
      if (cid) x = `<w:rStyle w:val="${cid}"/>` + x
      r = x ? `<w:rPr>${x}</w:rPr>` : ''
      if (this.rPrCache.size > 20000) this.rPrCache.clear()
      this.rPrCache.set(key, r)
    }
    this.lastCh = ch
    this.lastS = s.pp.s
    this.lastRPr = r
    return r
  }

  /** 'i' / 'd' and the w:author / w:date attributes of a tracked change; '' for none */
  private revOf(ch: Chp): string {
    if (!ch.del && !ch.ins) return ''
    const del = !!ch.del
    const a = this.revAuthors[(del ? ch.delA : ch.insA) ?? 0] || 'Unknown'
    const date = dttm(del ? ch.delD : ch.insD)
    return (del ? 'd' : 'i') + ` w:author="${escAttr(a)}"${date ? ` w:date="${date}"` : ''}`
  }

  /** the run being read takes the current formatting (a new run starts when it differs) */
  private sync() {
    const st = this.st
    const rPr = this.rPrOf(st)
    const rev = this.revOf(st.ch)
    if (rPr !== this.runRPr || st.link !== this.runLink || st.story !== this.runStory || rev !== this.runRev) {
      this.flushRun()
      this.runRPr = rPr
      this.runLink = st.link
      this.runStory = st.story
      this.runRev = rev
    }
    this.dirty = false
  }

  flushRun() {
    if (this.buf.empty) return
    const text = this.buf.take()
    const story = this.runStory ?? this.st.story
    let xml = runXml(text, this.runRPr)
    if (xml && this.runRev) {
      const del = this.runRev.startsWith('d')
      if (del) xml = xml.replace(/<w:t /g, '<w:delText ').replace(/<\/w:t>/g, '</w:delText>')
      const tag = del ? 'del' : 'ins'
      xml = `<w:${tag} w:id="${this.annId++}"${this.runRev.slice(1)}>${xml}</w:${tag}>`
    }
    if (xml) story.items.push({ xml, link: this.runLink })
  }

  /** inline content (a break, a field, a picture) at the current position */
  item(xml: string) {
    const st = this.st
    if (st.dest !== D_STORY) return
    this.flushRun()
    st.story.items.push({ xml, link: st.link })
  }

  depthOf(pp: Pap): number {
    const itap = pp.itap ?? 0
    return Math.min(64, itap > 0 ? itap : pp.intbl ? 1 : 0)
  }

  private container(story: Story, depth: number): string[] {
    return depth === 0 ? story.blocks : story.tbl[depth - 1].cur
  }

  /** closes the tables nested deeper than `depth` */
  closeTables(story: Story, depth: number) {
    while (story.tbl.length > depth) {
      const lvl = story.tbl.pop()!
      const x = tableXml(this.tables, lvl)
      if (x) this.container(story, story.tbl.length).push(x)
    }
  }

  private content(story: Story, items: Item[]): string {
    let out = ''
    let open: string | undefined
    for (const it of items) {
      if (it.link !== open) {
        if (open) out += '</w:hyperlink>'
        if (it.link) {
          const target = it.link.slice(2)
          out += it.link.startsWith('r:')
            ? `<w:hyperlink r:id="${story.part.rel('hyperlink', target, true)}" w:history="1">`
            : `<w:hyperlink w:anchor="${escAttr(target)}" w:history="1">`
        }
        open = it.link
      }
      out += it.xml
    }
    if (open) out += '</w:hyperlink>'
    return out
  }

  /** ends the paragraph of `story` with properties `pp` / mark `ch`, in table depth `depth` (default: its own) */
  endPara(story: Story, pp: Pap, ch: Chp, depth = this.depthOf(pp), sectPr?: string) {
    this.flushRun()
    const items = story.items
    story.items = []
    const st = this.styles
    const base = st.paraBase(pp.s)
    const full: Pap = { ...st.defPap, ...pp }
    let numPr = ''
    const ls = pp.ls
    if (ls !== undefined && ls > 0 && this.num.has(ls)) {
      const ilvl = Math.max(0, Math.min(8, pp.ilvl ?? 0))
      if (ls !== base.pp.ls || ilvl !== (base.pp.ilvl ?? 0)) numPr = `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${ls}"/></w:numPr>`
      story.pn = {}
    } else if (pp.pn && base.pp.ls === undefined) {
      // legacy numbering (also when \ls names a list the file does not define)
      const r = this.num.pn(pp.pn, story.pn)
      if (r) numPr = `<w:numPr><w:ilvl w:val="${r.ilvl}"/><w:numId w:val="${r.num}"/></w:numPr>`
    } else {
      if (ls !== undefined && base.pp.ls !== undefined) numPr = '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr>'
      story.pn = {}
    }
    // a list paragraph without indents of its own takes its level's
    if (numPr && pp.li === undefined && pp.fi === undefined) {
      full.li = base.pp.li
      full.fi = base.pp.fi
    }
    const key = sectPr ? '' : `${propKey(full)}|${numPr}|${propKey(ch)}`
    let pPr = key ? this.pPrCache.get(key) : undefined
    if (pPr === undefined) {
      const markBase = st.runBase(pp.s, undefined)
      const mark = rPrDiff(this.tables, { ...st.defChp, ...ch, cs: undefined }, markBase)
      pPr = pPrDiff(this.tables, full, base.pp, { style: st.paraId(pp.s), numPr, rPr: mark, sectPr })
      if (key) {
        if (this.pPrCache.size > 20000) this.pPrCache.clear()
        this.pPrCache.set(key, pPr)
      }
    }
    const xml = `<w:p>${pPr}${this.content(story, items)}</w:p>`
    story.paras++
    this.closeTables(story, depth)
    while (story.tbl.length < depth) story.tbl.push(new TableLevel())
    this.container(story, depth).push(xml)
  }

  par() {
    const st = this.st
    if (st.dest === D_STORY) this.endPara(st.story, st.pp, st.ch)
  }

  /** \cell / \nestcell */
  cellEnd(nested: boolean) {
    const st = this.st
    if (st.dest !== D_STORY) return
    const story = st.story
    const depth = nested ? Math.max(2, this.depthOf(st.pp)) : 1
    this.flushRun()
    // "text\par\cell" (pandoc): the cell ends with its last paragraph, not with an empty one after it
    const open = story.tbl.length === depth ? story.tbl[depth - 1] : undefined
    const last = open?.cur[open.cur.length - 1]
    if (story.items.length || !last?.startsWith('<w:p>')) this.endPara(story, st.pp, st.ch, depth)
    const lvl = story.tbl[depth - 1]
    lvl.cells.push(lvl.cur.join(''))
    lvl.cur = []
  }

  /** \row / \nestrow */
  rowEnd(nested: boolean) {
    const st = this.st
    if (st.dest !== D_STORY) return
    const story = st.story
    this.flushRun()
    const depth = nested ? Math.max(2, this.depthOf(st.pp) || story.tbl.length) : 1
    if (story.items.length) this.cellEnd(nested)
    this.closeTables(story, depth)
    while (story.tbl.length < depth) story.tbl.push(new TableLevel())
    const lvl = story.tbl[depth - 1]
    if (lvl.cur.length) {
      lvl.cells.push(lvl.cur.join(''))
      lvl.cur = []
    }
    const def = this.rowDefs[depth] ?? this.rowDefs[1]
    lvl.def = def
    if (lvl.cells.length) lvl.rows.push({ def, cells: lvl.cells })
    lvl.cells = []
  }

  /** the end of a story: its last paragraph and tables; the XML of its blocks */
  finishStory(story: Story, s: State): string {
    this.flushRun()
    if (story.items.length) this.endPara(story, s.pp, s.ch)
    this.closeTables(story, 0)
    let x = story.blocks.join('')
    if (!x || x.endsWith('</w:tbl>')) x += '<w:p/>'
    return x
  }

  private finishBody(s: State) {
    const body = this.body
    this.flushRun()
    if (body.items.length) this.endPara(body, s.pp, s.ch)
    this.closeTables(body, 0)
    for (const id of this.openMarks) body.blocks.push(`<w:bookmarkEnd w:id="${id}"/>`)
    this.openMarks.clear()
    this.finalSect = this.sectPr()
  }

  // ---------------------------------------------------------------- sections

  sectBreak() {
    const st = this.st
    if (st.dest !== D_STORY) return
    if (st.story !== this.body) {
      this.par()
      return
    }
    this.flushRun()
    const body = this.body
    const sp = this.sectPr()
    if (body.items.length) this.endPara(body, st.pp, st.ch, 0, sp)
    else {
      this.closeTables(body, 0)
      const k = body.blocks.length - 1
      const last = body.blocks[k]
      if (last?.startsWith('<w:p>') && !last.includes('<w:sectPr')) {
        body.blocks[k] = last.startsWith('<w:p><w:pPr>') ? last.replace('</w:pPr>', sp + '</w:pPr>') : `<w:p><w:pPr>${sp}</w:pPr>${last.slice(5)}`
      } else body.blocks.push(`<w:p><w:pPr>${sp}</w:pPr></w:p>`)
    }
    this.sect = { ...this.sect, hf: {} }
  }

  private sectPr(): string {
    const d = this.doc
    const s = this.sect
    let refs = ''
    for (const kind of ['header', 'footer'] as const) {
      const ref = (type: string, h: { xml: string; part: Part } | undefined) => {
        if (!h) return
        this.hfFiles.set(h.part.path, h)
        refs += `<w:${kind}Reference w:type="${type}" r:id="${this.docPart.rel(kind, h.part.path.slice(5))}"/>`
      }
      ref('default', s.hf[kind] ?? s.hf[`${kind}r`] ?? (d.facing ? undefined : s.hf[`${kind}l`]))
      if (d.facing) ref('even', s.hf[`${kind}l`])
      ref('first', s.hf[`${kind}f`])
    }
    const tw = (v: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, v)))
    let w = tw(s.pgW ?? d.pgW, 144, 31680)
    let h = tw(s.pgH ?? d.pgH, 144, 31680)
    const land = s.landscape ?? d.landscape
    if (land && w < h) [w, h] = [h, w]
    const ml = tw(s.ml ?? d.ml, 0, w - 144)
    const mr = tw(s.mr ?? d.mr, 0, w - 144 - ml)
    const mt = tw(s.mt ?? d.mt, -h, h)
    const mb = tw(s.mb ?? d.mb, -h, h)
    let x = `<w:sectPr>${refs}`
    if (s.brk && s.brk !== 'nextPage') x += `<w:type w:val="${s.brk}"/>`
    x += `<w:pgSz w:w="${w}" w:h="${h}"${land ? ' w:orient="landscape"' : ''}/>`
    x += `<w:pgMar w:top="${mt}" w:right="${mr}" w:bottom="${mb}" w:left="${ml}" w:header="${tw(s.hy ?? 720, 0, h)}" w:footer="${tw(s.fy ?? 720, 0, h)}" w:gutter="${tw(s.gutter ?? d.gutter, 0, w)}"/>`
    const start = s.pgnRestart ? (s.pgnStart ?? 1) : undefined
    if (start !== undefined || s.pgnFmt) x += `<w:pgNumType${s.pgnFmt ? ` w:fmt="${s.pgnFmt}"` : ''}${start !== undefined ? ` w:start="${start}"` : ''}/>`
    if (s.cols && s.cols > 1) x += `<w:cols w:num="${Math.min(45, s.cols)}" w:space="${tw(s.colsx ?? 720, 0, w)}"${s.lineBetween ? ' w:sep="1"' : ''}/>`
    if (s.vAlign) x += `<w:vAlign w:val="${s.vAlign}"/>`
    if (s.titlePg) x += '<w:titlePg/>'
    return x + '</w:sectPr>'
  }

  /** border words: the paragraph / row / cell side they apply to */
  border(): Border | undefined {
    const t = this.brdr
    if (!t) return undefined
    let target: Partial<Record<Side, Border>>
    if (t.kind === 'p') {
      const pp = this.pap()
      target = pp.brdr = { ...pp.brdr }
      for (const side of t.sides) target[side] = { ...target[side] }
    } else target = t.kind === 'r' ? this.row.brdr : this.cell.brdr
    for (const side of t.sides) target[side] ??= {}
    return target[t.sides[0]]
  }

  /** applies a border property to every side the border words address */
  setBorder(f: (b: Border) => void) {
    const t = this.brdr
    if (!t) return
    this.border()
    const target = t.kind === 'p' ? this.st.pp.brdr! : t.kind === 'r' ? this.row.brdr : this.cell.brdr
    for (const side of t.sides) f(target[side]!)
  }

  /** marks the end of the reader's own state (after the main loop) */
  finish() {
    if (!this.finalSect) this.finishBody(this.stack[1] ?? this.stack[0])
    this.styles.finish()
  }
}
