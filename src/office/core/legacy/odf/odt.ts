/**
 * OpenDocument text documents (.odt, also templates and flat XML) → DOCX.
 *
 * Named (common) styles become Word styles; automatic styles become direct formatting. Lists become numbering
 * definitions, tables, frames, notes, bookmarks and links their WordprocessingML counterparts; master pages give the
 * sections their page setup, headers and footers. Spec: ODF 1.2 / 1.3, part 3 (schema) chapters 5 (text), 9 (tables),
 * 10 (drawing), 16 (styles), 20 (formatting properties).
 */
import { Part } from '../../iwork/ooxml'
import { escAttr, escText } from '../../raw'
import { child, children, isEl, type OdfPackage, type ONode, textContent, toHex, toPt } from './common'
import { OdtDraw, OdtMedia, type DrawHost } from './odt-draw'
import { OdtNumbering } from './odt-lists'
import { coreXml, endWithParagraph, isoDate, notesXml, NS, packDocx, type PackPart, prependRuns, Runs, settingsXml, WML } from './odt-package'
import { pPrXml, rPrXml, type RP, tw, XML_HEAD } from './odt-props'
import { OdtStyles, type RunCtx } from './odt-styles'
import { tableXml, type TableHost } from './odt-table'

/** nesting of blocks (tables in frames in cells…) followed */
const MAX_DEPTH = 40

/** body elements without content to show */
const SKIP_BLOCKS = new Set([
  'text:tracked-changes',
  'text:variable-decls',
  'text:sequence-decls',
  'text:user-field-decls',
  'text:dde-connection-decls',
  'text:alphabetical-index-auto-mark-file',
  'table:calculation-settings',
  'table:content-validations',
  'table:label-ranges',
  'office:forms',
  'text:soft-page-break',
  'text:table-of-content-source',
  'text:illustration-index-source',
  'text:alphabetical-index-source',
  'text:table-index-source',
  'text:object-index-source',
  'text:user-index-source',
  'text:bibliography-source',
  'office:annotation',
  'office:annotation-end',
  'text:page-sequence',
  'office:scripts',
])

/** inline elements without content to show */
const SKIP_INLINE = new Set([
  'office:annotation',
  'office:annotation-end',
  'text:change',
  'text:change-start',
  'text:change-end',
  'text:hidden-paragraph',
  // a list label as last laid out (the numbering shows it)
  'text:number',
  'text:soft-page-break',
  'text:reference-mark',
  'text:reference-mark-start',
  'text:reference-mark-end',
  'text:toc-mark',
  'text:toc-mark-start',
  'text:toc-mark-end',
  'text:alphabetical-index-mark',
  'text:alphabetical-index-mark-start',
  'text:alphabetical-index-mark-end',
  'text:user-index-mark',
  'text:user-index-mark-start',
  'text:user-index-mark-end',
  'text:bibliography-mark-start',
  'text:bibliography-mark-end',
  'draw:control',
  'draw:line',
  'draw:connector',
  'draw:path',
  'draw:polyline',
  'draw:measure',
  'presentation:notes',
])

const DRAW = new Set(['draw:frame', 'draw:a', 'draw:g', 'draw:custom-shape', 'draw:rect', 'draw:ellipse', 'draw:circle', 'draw:polygon', 'draw:regular-polygon'])

const PAGE_FMT: Record<string, string> = { '1': 'decimal', i: 'lowerRoman', I: 'upperRoman', a: 'lowerLetter', A: 'upperLetter' }
const FIELD_SWITCH: Record<string, string> = { i: ' \\* roman', I: ' \\* ROMAN', a: ' \\* alphabetic', A: ' \\* ALPHABETIC' }

/** a numbering instance (w:num) and its counters */
interface ListInst {
  style: ONode
  numId: number
  counters: (number | undefined)[]
  used: boolean
}

/** a top-level list and what continues through its nested lists */
interface TopList {
  insts: Map<ONode, ListInst>
  cont?: ListInst | 'last'
  id?: string
}

interface ListCtx {
  level: number
  styleName?: string
  top: TopList
}

interface BlockCtx {
  /** the document body: page and section breaks apply */
  top: boolean
  list?: ListCtx
  /** the next paragraph starts a page (a table's first cell); shared by the contexts made from this one */
  pbb?: { on: boolean }
}

interface Sect {
  master: string
  type?: 'nextPage' | 'continuous'
  cols?: { n: number; gap: number; sep: boolean }
  pgStart?: number
}

/** a link target safe as a relationship target */
const safeUri = (href: string) => href.trim().replace(/[\s"<>\\^`{|}]/g, (c) => encodeURIComponent(c))

class OdtConverter implements DrawHost, TableHost {
  private st: OdfPackage['styles']
  private sty: OdtStyles

  private docPart = new Part('word/document.xml')
  part = this.docPart
  readonly media = new OdtMedia()
  private images = new Map<ONode, Uint8Array | undefined>()
  private draw = new OdtDraw(this)
  private num: OdtNumbering
  columnWidth = 451
  private depth = 0

  // bookmarks
  private bmOpen = new Map<string, number>()
  private bmNames = new Map<string, string>()
  private bmTaken = new Set<string>()
  private bmNext = 1

  // notes
  private footnotes: string[] = []
  private endnotes: string[] = []

  // comments (annotations)
  private comments: string[] = []
  private commentPart = new Part('word/comments.xml')
  /** annotations whose range is open: office:name → w:id */
  private commentOpen = new Map<string, number>()
  private footPart = new Part('word/footnotes.xml')
  private endPart = new Part('word/endnotes.xml')
  private inNote = false
  private noteConf: Record<'footnote' | 'endnote', Record<string, string>> = { footnote: {}, endnote: {} }

  // lists
  private listById = new Map<string, ListInst>()
  private lastList = new Map<ONode, ListInst>()
  private outlineTop: TopList = { insts: new Map() }

  // body and sections
  private body: string[] = []
  private sections: Sect[] = []
  private sect: Sect
  private sectStart = 0
  private pendingBreak?: 'page' | 'column'
  private pendingRuns = ''
  private inColumns = false

  // headers and footers
  private hf: { path: string; part: Part; xml: string }[] = []
  private evenOdd = false

  constructor(private pkg: OdfPackage) {
    this.st = pkg.styles
    this.sty = new OdtStyles(pkg)
    for (const c of children(child(pkg.stylesRoot, 'office:styles'), 'text:notes-configuration')) {
      const cls = c.attrs['text:note-class'] === 'endnote' ? 'endnote' : 'footnote'
      this.noteConf[cls] = c.attrs
    }
    this.num = new OdtNumbering((name) => this.sty.charProps(name))
    this.sect = { master: this.defaultMaster() }
  }

  // ------------------------------------------------------------ styles

  props(family: string, name: string | undefined, group: string): Record<string, string> {
    return this.sty.props(family, name, group)
  }

  graphicProps(name: string | undefined): Record<string, string> {
    return this.sty.props('graphic', name, 'style:graphic-properties')
  }

  // ------------------------------------------------------------ blocks

  private blocks(nodes: (ONode | string)[], out: string[], ctx: BlockCtx) {
    if (this.depth > MAX_DEPTH) return
    this.depth++
    try {
      for (const n of nodes) {
        if (!isEl(n) || SKIP_BLOCKS.has(n.name)) continue
        switch (n.name) {
          case 'text:p':
          case 'text:h':
            this.paragraph(n, out, ctx)
            break
          case 'text:list':
            this.list(n, out, ctx)
            break
          case 'text:numbered-paragraph': {
            const top: TopList = { insts: new Map(), id: n.attrs['text:list-id'] }
            const lc: ListCtx = { level: Math.max(0, Math.min(8, Number(n.attrs['text:level'] ?? 1) - 1)), styleName: n.attrs['text:style-name'], top }
            const cont = top.id ? this.listById.get(top.id) : undefined
            if (cont) top.insts.set(cont.style, cont)
            for (const p of children(n)) if (p.name === 'text:p' || p.name === 'text:h') this.paragraph(p, out, { ...ctx, list: lc }, true)
            break
          }
          case 'table:table':
            this.table(n, out, ctx)
            break
          case 'text:section':
            this.section(n, out, ctx)
            break
          default:
            if (DRAW.has(n.name)) {
              // anchored to the page (or another frame): goes with the next paragraph
              const x = this.draw.object(n, '')
              if (ctx.top) this.pendingRuns += x
              else if (x) out.push(`<w:p>${x}</w:p>`)
            } else this.blocks(n.kids, out, ctx)
        }
      }
    } finally {
      this.depth--
    }
  }

  private push(out: string[], xml: string) {
    // adjacent tables would become one in Word
    if (xml.startsWith('<w:tbl>') && out[out.length - 1]?.startsWith('<w:tbl>')) out.push('<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>')
    out.push(xml)
  }

  /** a style:master-page-name at a block of the body: a new page, in a new section when the page style changes */
  private masterBreak(master: string | undefined, pgStart?: number): boolean {
    if (master === undefined || master === '' || !this.st.masterPages.has(master)) return false
    if (this.body.length === 0 && !this.sections.length) {
      this.sect = { ...this.sect, master, pgStart: pgStart ?? this.sect.pgStart }
      this.applyColumnWidth()
      return false
    }
    if (master === this.sect.master && pgStart === undefined) return true
    this.closeSection({ master, type: 'nextPage', pgStart })
    return false
  }

  private paragraph(p: ONode, out: string[], ctx: BlockCtx, numbered = false, start?: number) {
    const heading = p.name === 'text:h' ? Math.max(1, Math.min(10, Number(p.attrs['text:outline-level'] ?? 1) || 1)) : undefined
    const info = this.sty.para(p.attrs['text:style-name'] ?? p.attrs['text:cond-style-name'], heading)
    let pp = info.pp
    let pbb = false
    let prefix = ''
    if (ctx.top) {
      if (this.masterBreak(info.master, pp.pageNumber)) pbb = true
      else if (pp.pageNumber && !this.body.length) this.sect.pgStart = pp.pageNumber
      if (this.pendingBreak === 'page') pbb = true
      else if (this.pendingBreak === 'column') prefix += '<w:r><w:br w:type="column"/></w:r>'
      this.pendingBreak = undefined
      prefix = this.pendingRuns + prefix
      this.pendingRuns = ''
    }
    if (ctx.pbb?.on) {
      pbb = true
      ctx.pbb.on = false
    }
    if (pp.breakBefore === 'column') prefix += '<w:r><w:br w:type="column"/></w:r>'
    if (pbb && !pp.pbb) pp = { ...pp, pbb: true }

    // list label and indent
    let numPr: string | undefined
    let ind: { left: number; hanging?: number; first?: number } | undefined
    let tabBase = this.sty.tabsRelative ? info.left : 0
    const lc = ctx.list
    if (lc) {
      const ls = this.sty.lists(lc.styleName) ?? (info.listStyle ? this.sty.lists(info.listStyle) : undefined)
      if (ls) {
        const lvl = Math.min(8, lc.level)
        const L = this.num.levels(ls)[lvl]
        const extra = L.relative ? info.left : 0
        if (numbered && L.labeled) {
          const inst = this.count(lc.top, ls, lvl, start)
          numPr = `<w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="${inst.numId}"/></w:numPr>`
          if (extra) ind = { left: extra + L.left, hanging: L.hanging }
        } else ind = { left: extra + L.left, first: 0 }
        if (!L.relative) {
          // in the label alignment mode, indents set on the paragraph (or its named style) win over the list's
          if (pp.left !== undefined || pp.first !== undefined) ind = undefined
          else if (info.styleIndent) ind = { left: info.left, first: info.first }
        }
        if (this.sty.tabsRelative) tabBase = ind?.left ?? L.left + extra
      }
    } else if (heading && p.attrs['text:is-list-header'] !== 'true') {
      // outline numbering of headings
      const ls = info.listStyle === undefined ? this.sty.outlineStyle : info.listStyle ? this.sty.lists(info.listStyle) : undefined
      const lvl = Math.min(8, heading - 1)
      if (ls && this.num.numbered(ls, lvl)) {
        if (p.attrs['text:restart-numbering'] === 'true') this.outlineTop = { insts: new Map() }
        const sv = Number(p.attrs['text:start-value'])
        const inst = this.count(this.outlineTop, ls, lvl, Number.isInteger(sv) && sv >= 0 ? sv : undefined)
        numPr = `<w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="${inst.numId}"/></w:numPr>`
      }
    }

    const runs = new Runs()
    if (prefix) runs.raw(prefix)
    // a paragraph a condition hides (as last evaluated)
    const hidden = p.kids.some((k) => isEl(k) && k.name === 'text:hidden-paragraph' && k.attrs['text:is-hidden'] === 'true')
    const rc = hidden ? { ...info.rc, rp: { ...info.rc.rp, vanish: true }, x: undefined } : info.rc
    this.inline(p.kids, rc, runs, 0)
    let outline: number | undefined
    if (heading && info.outline !== heading && heading <= 9) outline = heading - 1
    const markRPr = rPrXml(rc.rp)
    const pPr = pPrXml(pp, { style: info.styleId, numPr, ind, markRPr, tabBase, inheritedTabs: info.tabs, sz: info.sz, outline })
    this.push(out, `<w:p>${pPr}${runs.xml()}</w:p>`)
    if (ctx.top && pp.breakAfter) this.pendingBreak = pp.breakAfter
  }

  // ------------------------------------------------------------ lists

  private list(n: ONode, out: string[], ctx: BlockCtx) {
    const parent = ctx.list
    let top: TopList
    if (parent) top = parent.top
    else {
      top = { insts: new Map(), id: n.attrs['xml:id'] ?? n.attrs['text:id'] }
      const cont = n.attrs['text:continue-list']
      if (cont) top.cont = this.listById.get(cont)
      else if (n.attrs['text:continue-numbering'] === 'true') top.cont = 'last'
    }
    const lc: ListCtx = { level: parent ? parent.level + 1 : 0, styleName: n.attrs['text:style-name'] ?? parent?.styleName, top }
    const inner: BlockCtx = { ...ctx, list: lc }
    for (const item of children(n)) {
      if (item.name !== 'text:list-item' && item.name !== 'text:list-header') continue
      let label = item.name === 'text:list-item'
      const sv = Number(item.attrs['text:start-value'])
      let start = item.attrs['text:start-value'] !== undefined && Number.isInteger(sv) && sv >= 0 ? sv : undefined
      for (const k of children(item)) {
        if (k.name === 'text:p' || k.name === 'text:h') {
          this.paragraph(k, out, inner, label, label ? start : undefined)
          label = false
          start = undefined
        } else if (k.name === 'text:list') {
          this.list(k, out, inner)
          label = false
        } else this.blocks([k], out, { ...inner, list: undefined })
      }
    }
  }

  /** counts a numbered paragraph of a list at a level; returns the numbering instance it shows in */
  private count(top: TopList, ls: ONode, lvl: number, start?: number): ListInst {
    let inst = top.insts.get(ls)
    if (!inst) {
      const cont = top.cont === 'last' ? this.lastList.get(ls) : top.cont
      inst = cont && cont.style === ls ? cont : { style: ls, numId: this.num.restart(ls), counters: [], used: false }
      top.insts.set(ls, inst)
    }
    if (start !== undefined) {
      if (!inst.used) this.num.setStart(inst.numId, lvl, start)
      else {
        // numbering starts again mid-list: a new instance going on from the levels above
        const starts: Record<number, number> = { [lvl]: start }
        for (let l = 0; l < lvl; l++) if (inst.counters[l] !== undefined) starts[l] = inst.counters[l]!
        inst = { style: ls, numId: this.num.restart(ls, starts), counters: inst.counters.slice(0, lvl), used: false }
        top.insts.set(ls, inst)
      }
    }
    const c = inst.counters
    c[lvl] = c[lvl] === undefined ? (start ?? this.num.levels(ls)[lvl].start) : c[lvl]! + 1
    c.length = lvl + 1
    inst.used = true
    this.lastList.set(ls, inst)
    if (top.id) this.listById.set(top.id, inst)
    return inst
  }

  // ------------------------------------------------------------ tables, sections

  private table(t: ONode, out: string[], ctx: BlockCtx) {
    let pbb = false
    if (ctx.top) {
      const chain = this.sty.chain('table', t.attrs['table:style-name'])
      const master = chain.find((s) => s.attrs['style:master-page-name'] !== undefined)?.attrs['style:master-page-name']
      if (this.masterBreak(master)) pbb = true
      const bb = this.props('table', t.attrs['table:style-name'], 'style:table-properties')['fo:break-before']
      if (bb === 'page' || this.pendingBreak === 'page') pbb = true
      this.pendingBreak = undefined
      if (this.pendingRuns) {
        this.push(out, `<w:p>${this.pendingRuns}</w:p>`)
        this.pendingRuns = ''
      }
    }
    if (ctx.pbb?.on) {
      pbb = true
      ctx.pbb.on = false
    }
    const xml = tableXml(this, t, this.columnWidth, pbb)
    if (xml) this.push(out, xml)
  }

  cellBlocks(cell: ONode, width: number, pbb: boolean): string {
    const saved = this.columnWidth
    this.columnWidth = width
    const out: string[] = []
    try {
      this.blocks(cell.kids, out, { top: false, pbb: { on: pbb } })
    } finally {
      this.columnWidth = saved
    }
    return endWithParagraph(out.join(''))
  }

  boxBlocks(nodes: (ONode | string)[], width: number): string {
    const saved = this.columnWidth
    this.columnWidth = width
    const out: string[] = []
    try {
      this.blocks(nodes, out, { top: false })
    } finally {
      this.columnWidth = saved
    }
    return out.length ? endWithParagraph(out.join('')) : ''
  }

  private section(n: ONode, out: string[], ctx: BlockCtx) {
    if (n.attrs['text:display'] === 'none') return
    const style = this.sty.chain('section', n.attrs['text:style-name'])[0]
    const cols = child(child(style, 'style:section-properties'), 'style:columns')
    const count = Math.max(1, Math.min(45, Number(cols?.attrs['fo:column-count'] ?? 1) || 1))
    if (!ctx.top || count < 2 || this.inColumns) {
      this.blocks(n.kids, out, ctx)
      return
    }
    const master = this.sect.master
    this.closeSection({ master, type: 'continuous', cols: { n: count, gap: toPt(cols?.attrs['fo:column-gap']) ?? 18, sep: !!child(cols, 'style:column-sep') } })
    this.inColumns = true
    try {
      this.blocks(n.kids, out, ctx)
    } finally {
      this.inColumns = false
    }
    this.closeSection({ master: this.sect.master, type: 'continuous' })
  }

  /** ends the current section at the last block of the body; the next one has `next`'s settings */
  private closeSection(next: Sect) {
    if (this.body.length === this.sectStart) {
      // nothing in the section yet: it takes the new settings
      this.sect = { ...next, type: this.sections.length ? this.sect.type : undefined }
      this.applyColumnWidth()
      return
    }
    const k = this.sections.push(this.sect) - 1
    const mark = `<!--S${k}-->`
    const i = this.body.length - 1
    const last = this.body[i]
    if (last.startsWith('<w:p><w:pPr>')) {
      const j = last.indexOf('</w:pPr>')
      this.body[i] = last.slice(0, j) + mark + last.slice(j)
    } else if (last.startsWith('<w:p>')) this.body[i] = `<w:p><w:pPr>${mark}</w:pPr>` + last.slice(5)
    else this.body.push(`<w:p><w:pPr>${mark}</w:pPr></w:p>`)
    this.sect = next
    this.sectStart = this.body.length
    this.applyColumnWidth()
  }

  // ------------------------------------------------------------ inline content

  private inline(nodes: (ONode | string)[], rc: RunCtx, runs: Runs, depth: number) {
    if (depth > 64) return
    for (const n of nodes) {
      if (typeof n === 'string') {
        let t = n.replace(/[ \t\r\n]+/g, ' ')
        if (runs.space && t.startsWith(' ')) t = t.slice(1)
        if (!t) continue
        runs.space = t.endsWith(' ')
        runs.text(t, this.sty.rPr(rc))
        continue
      }
      if (n.name === 'office:annotation' || n.name === 'office:annotation-end') {
        this.annotation(n, runs)
        continue
      }
      if (SKIP_INLINE.has(n.name) || n.name.startsWith('field:')) continue
      switch (n.name) {
        case 'text:span':
          this.inline(n.kids, this.sty.span(rc, n.attrs['text:style-name']), runs, depth + 1)
          break
        case 'text:a':
          this.hyperlink(n, rc, runs, depth)
          break
        case 'text:s': {
          const c = Math.max(1, Math.min(1000, Number(n.attrs['text:c'] ?? 1) || 1))
          runs.text(' '.repeat(c), this.sty.rPr(rc))
          runs.space = false
          break
        }
        case 'text:tab':
          runs.text('\t', this.sty.rPr(rc))
          runs.space = false
          break
        case 'text:line-break':
          runs.text('\n', this.sty.rPr(rc))
          runs.space = true
          break
        case 'text:bookmark':
        case 'text:bookmark-start':
        case 'text:bookmark-end':
          this.bookmark(n, runs)
          break
        case 'text:note':
          this.note(n, rc, runs)
          runs.space = false
          break
        case 'text:page-number':
        case 'text:page-count':
          this.field(n, rc, runs)
          break
        case 'text:hidden-text':
          if (n.attrs['text:is-hidden'] === 'false' && n.attrs['text:string-value']) runs.text(n.attrs['text:string-value'].replace(/[ \t\r\n]+/g, ' '), this.sty.rPr(rc))
          break
        case 'text:ruby':
          this.inline(child(n, 'text:ruby-base')?.kids ?? [], rc, runs, depth + 1)
          break
        case 'text:sequence-decls':
          break
        default:
          if (DRAW.has(n.name)) {
            runs.raw(this.draw.object(n, this.sty.rPr(rc)))
            runs.space = false
          } else this.inline(n.kids, rc, runs, depth + 1)
      }
    }
  }

  private hyperlink(a: ONode, rc: RunCtx, runs: Runs, depth: number) {
    const href = a.attrs['xlink:href']
    const inner = this.sty.span(rc, a.attrs['text:style-name'])
    if (!href || runs.inLink) {
      this.inline(a.kids, inner, runs, depth + 1)
      return
    }
    const l = this.link(href)
    runs.raw(l.rid ? `<w:hyperlink r:id="${l.rid}" w:history="1">` : `<w:hyperlink w:anchor="${escAttr(l.anchor!)}" w:history="1">`)
    runs.inLink = true
    try {
      this.inline(a.kids, inner, runs, depth + 1)
    } finally {
      runs.inLink = false
    }
    runs.raw('</w:hyperlink>')
  }

  link(href: string): { rid?: string; anchor?: string } {
    if (href.startsWith('#')) return { anchor: this.bmName(decodeURIComponentSafe(href.slice(1))) }
    return { rid: this.part.rel('hyperlink', safeUri(href), true) }
  }

  private bmName(name: string): string {
    let n = this.bmNames.get(name)
    if (n === undefined) {
      n = name.replace(/[\s|]+/g, '_').slice(0, 40) || '_'
      this.bmNames.set(name, n)
    }
    return n
  }

  private bookmark(b: ONode, runs: Runs) {
    const name = b.attrs['text:name']
    if (!name) return
    if (b.name === 'text:bookmark-end') {
      const id = this.bmOpen.get(name)
      if (id === undefined) return
      this.bmOpen.delete(name)
      runs.raw(`<w:bookmarkEnd w:id="${id}"/>`)
      return
    }
    const word = this.bmName(name)
    if (this.bmTaken.has(word)) return
    this.bmTaken.add(word)
    const id = this.bmNext++
    runs.raw(`<w:bookmarkStart w:id="${id}" w:name="${escAttr(word)}"/>`)
    if (b.name === 'text:bookmark') runs.raw(`<w:bookmarkEnd w:id="${id}"/>`)
    else this.bmOpen.set(name, id)
  }

  /** ends the bookmarks still open (at the end of the content of a part) */
  private closeBookmarks(): string {
    const x = [...this.bmOpen.values()].map((id) => `<w:bookmarkEnd w:id="${id}"/>`).join('')
    this.bmOpen.clear()
    return x
  }

  private field(n: ONode, rc: RunCtx, runs: Runs) {
    const page = n.name === 'text:page-number'
    const shown = textContent(n).trim() || '1'
    const select = n.attrs['text:select-page']
    if (page && select && select !== 'current') {
      runs.text(shown, this.sty.rPr(rc))
      return
    }
    const instr = (page ? 'PAGE' : 'NUMPAGES') + (FIELD_SWITCH[n.attrs['style:num-format'] ?? ''] ?? '')
    runs.raw(`<w:fldSimple w:instr=" ${instr} "><w:r>${this.sty.rPr(rc)}<w:t>${escText(shown)}</w:t></w:r></w:fldSimple>`)
    runs.space = false
  }

  private note(n: ONode, rc: RunCtx, runs: Runs) {
    const cit = child(n, 'text:note-citation')
    const label = cit?.attrs['text:label']
    const body = child(n, 'text:note-body')
    const sup = (r: RP) => ({ ...r, va: 'superscript' as const })
    if (this.inNote || this.sty.inMaster || this.draw.inBox || !body) {
      // Word has no notes in notes, headers or text boxes: the citation stays
      const t = label ?? textContent(cit ?? '').trim()
      if (t) runs.text(t, rPrXml(sup(rc.rp), rc.rStyle))
      return
    }
    const cls = n.attrs['text:note-class'] === 'endnote' ? 'endnote' : 'footnote'
    const list = cls === 'endnote' ? this.endnotes : this.footnotes
    const id = list.length + 1
    const conf = this.noteConf[cls]
    const styleOf = (name: string | undefined) => this.sty.textStyleId(name)
    const savedPart = this.part
    const savedOpen = this.bmOpen
    this.part = cls === 'endnote' ? this.endPart : this.footPart
    this.bmOpen = new Map()
    this.inNote = true
    let xml: string
    try {
      const out: string[] = []
      this.blocks(body.kids, out, { top: false })
      xml = out.join('') + this.closeBookmarks()
    } finally {
      this.inNote = false
      this.part = savedPart
      this.bmOpen = savedOpen
    }
    const mark = `<w:r>${rPrXml({ va: 'superscript' }, styleOf(conf['text:citation-style-name']))}<w:${cls}Ref/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>`
    list.push(`<w:${cls} w:id="${id}">${endWithParagraph(prependRuns(xml || '<w:p/>', mark))}</w:${cls}>`)
    const bodyStyle = styleOf(conf['text:citation-body-style-name'])
    runs.raw(
      `<w:r>${rPrXml(sup(bodyStyle ? {} : rc.rp), bodyStyle ?? rc.rStyle)}<w:${cls}Reference${label ? ' w:customMarkFollows="1"' : ''} w:id="${id}"/>${label ? `<w:t>${escText(label)}</w:t>` : ''}</w:r>`,
    )
  }

  /** office:annotation → a Word comment; office:annotation-end closes the range of a named one */
  private annotation(n: ONode, runs: Runs) {
    const name = n.attrs['office:name']
    const ref = (id: number) => `<w:r><w:commentReference w:id="${id}"/></w:r>`
    if (n.name === 'office:annotation-end') {
      const id = name === undefined ? undefined : this.commentOpen.get(name)
      if (id === undefined) return
      this.commentOpen.delete(name!)
      runs.raw(`<w:commentRangeEnd w:id="${id}"/>${ref(id)}`)
      return
    }
    // Word has comments in the body only
    if (this.sty.inMaster || this.inNote || this.draw.inBox) return
    const id = this.comments.length
    const get = (tag: string) => {
      const el = child(n, tag)
      return el ? textContent(el).trim() : ''
    }
    const author = get('dc:creator')
    const initials = get('meta:creator-initials') || get('loext:sender-initials')
    const date = isoDate(get('dc:date'))
    const savedPart = this.part
    const savedOpen = this.bmOpen
    this.part = this.commentPart
    this.bmOpen = new Map()
    this.inNote = true
    let xml: string
    try {
      const out: string[] = []
      this.blocks(n.kids.filter((k) => isEl(k) && (k.name.startsWith('text:') || k.name === 'table:table')), out, { top: false })
      xml = out.join('') + this.closeBookmarks()
    } finally {
      this.inNote = false
      this.part = savedPart
      this.bmOpen = savedOpen
    }
    this.comments.push(
      `<w:comment w:id="${id}" w:author="${escAttr(author || 'Author')}"${date ? ` w:date="${date}"` : ''}${initials ? ` w:initials="${escAttr(initials)}"` : ''}>` +
        endWithParagraph(prependRuns(xml || '<w:p/>', '<w:r><w:annotationRef/></w:r>')) +
        '</w:comment>',
    )
    if (name !== undefined && !this.commentOpen.has(name)) {
      this.commentOpen.set(name, id)
      runs.raw(`<w:commentRangeStart w:id="${id}"/>`)
    } else runs.raw(ref(id))
  }

  imageBytes(el: ONode): Uint8Array | undefined {
    return this.images.get(el)
  }

  // ------------------------------------------------------------ pages, headers, footers

  private defaultMaster(): string {
    if (this.st.masterPages.has('Standard')) return 'Standard'
    return this.st.masterPages.keys().next().value ?? ''
  }

  private layoutOf(masterName: string) {
    const m = this.st.masterPages.get(masterName)
    const pl = this.st.pageLayouts.get(m?.attrs['style:page-layout-name'] ?? '')
    const plp = child(pl, 'style:page-layout-properties')
    const a = plp?.attrs ?? {}
    let pw = toPt(a['fo:page-width']) || 595.3
    let ph = toPt(a['fo:page-height']) || 841.9
    if (a['style:print-orientation'] === 'landscape' && pw < ph) [pw, ph] = [ph, pw]
    const mar = (s: string) => Math.max(0, toPt(a[`fo:margin-${s}`] ?? a['fo:margin']) ?? 56.7)
    const hfp = (kind: string) => child(child(pl, `style:${kind}-style`), 'style:header-footer-properties')?.attrs ?? {}
    const cols = child(plp, 'style:columns')
    const count = Math.max(1, Math.min(45, Number(cols?.attrs['fo:column-count'] ?? 1) || 1))
    return {
      m,
      pw: Math.min(Math.max(pw, 72), 1584),
      ph: Math.min(Math.max(ph, 72), 1584),
      mt: mar('top'),
      mb: mar('bottom'),
      ml: mar('left'),
      mr: mar('right'),
      header: hfp('header'),
      footer: hfp('footer'),
      cols: count > 1 ? { n: count, gap: toPt(cols?.attrs['fo:column-gap']) ?? 18, sep: !!child(cols, 'style:column-sep') } : undefined,
      numFmt: PAGE_FMT[a['style:num-format'] ?? ''],
      bg: toHex(a['fo:background-color']),
    }
  }

  private applyColumnWidth() {
    const l = this.layoutOf(this.sect.master)
    const cols = this.sect.cols ?? l.cols
    const w = Math.max(36, l.pw - l.ml - l.mr)
    this.columnWidth = cols ? Math.max(36, (w - cols.gap * (cols.n - 1)) / cols.n) : w
  }

  /** a master page's header / footer element of a kind, when shown */
  private hfEl(m: ONode | undefined, tag: string): ONode | undefined {
    const el = child(m, `style:${tag}`) ?? (tag.endsWith('-first') ? child(m, `loext:${tag}`) : undefined)
    return el && el.attrs['style:display'] !== 'false' ? el : undefined
  }

  /** a header / footer part: the content of a master page element (none: a blank one); returns its relationship id */
  private hfPart(kind: 'header' | 'footer', el: ONode | undefined, width: number): string {
    const path = `${kind}${this.hf.length + 1}.xml`
    const part = new Part('word/' + path)
    let xml = ''
    if (el) {
      const saved = { part: this.part, open: this.bmOpen, inMaster: this.sty.inMaster, width: this.columnWidth }
      this.part = part
      this.bmOpen = new Map()
      this.sty.inMaster = true
      this.columnWidth = width
      try {
        const out: string[] = []
        this.blocks(el.kids, out, { top: false })
        xml = out.join('') + this.closeBookmarks()
      } finally {
        this.part = saved.part
        this.bmOpen = saved.open
        this.sty.inMaster = saved.inMaster
        this.columnWidth = saved.width
      }
    }
    const tag = kind === 'header' ? 'hdr' : 'ftr'
    this.hf.push({ path, part, xml: `${XML_HEAD}<w:${tag} ${NS}>${endWithParagraph(xml)}</w:${tag}>` })
    return this.docPart.rel(kind, path)
  }

  /** header / footer parts made: per master page element, or per kind for blank ones */
  private hfMade = new Map<ONode | string, string>()

  private hfRef(kind: 'header' | 'footer', type: 'default' | 'even' | 'first', el: ONode | undefined, width: number): string {
    const key = el ?? kind
    let rid = this.hfMade.get(key)
    if (!rid) {
      rid = this.hfPart(kind, el, width)
      this.hfMade.set(key, rid)
    }
    return `<w:${kind}Reference w:type="${type}" r:id="${rid}"/>`
  }

  private anyHeaders = false

  private sectPrXml(s: Sect, prev: Sect | undefined): string {
    const l = this.layoutOf(s.master)
    // a first page style followed by another ("First Page" → "Default"): Word's different first page
    const nextName = l.m?.attrs['style:next-style-name']
    const rest = nextName && nextName !== s.master && this.st.masterPages.has(nextName) ? this.st.masterPages.get(nextName) : undefined
    const main = rest ?? l.m
    const width = Math.max(36, l.pw - l.ml - l.mr)
    let refs = ''
    let titlePg = false
    const hasH = !!(this.hfEl(main, 'header') || this.hfEl(l.m, 'header') || this.hfEl(l.m, 'header-first'))
    const hasF = !!(this.hfEl(main, 'footer') || this.hfEl(l.m, 'footer') || this.hfEl(l.m, 'footer-first'))
    if (this.anyHeaders) {
      for (const kind of ['header', 'footer'] as const) {
        refs += this.hfRef(kind, 'default', this.hfEl(main, kind), width)
        if (this.evenOdd) refs += this.hfRef(kind, 'even', this.hfEl(main, `${kind}-left`) ?? this.hfEl(main, kind), width)
        const first = rest ? (this.hfEl(l.m, `${kind}-first`) ?? this.hfEl(l.m, kind)) : this.hfEl(l.m, `${kind}-first`)
        if (rest || this.hfEl(l.m, 'header-first') || this.hfEl(l.m, 'footer-first')) {
          titlePg = true
          refs += this.hfRef(kind, 'first', first, width)
        }
      }
    } else if (rest || this.hfEl(l.m, 'header-first') || this.hfEl(l.m, 'footer-first')) titlePg = true
    // ODF margins reach the header / footer; Word's reach the body
    const hp = l.header
    const fp = l.footer
    const hh = hasH ? (toPt(hp['svg:height']) ?? toPt(hp['fo:min-height']) ?? 0) + (toPt(hp['fo:margin-bottom']) ?? 0) : 0
    const fh = hasF ? (toPt(fp['svg:height']) ?? toPt(fp['fo:min-height']) ?? 0) + (toPt(fp['fo:margin-top']) ?? 0) : 0
    const top = l.mt + hh
    const bottom = l.mb + fh
    const header = hasH ? l.mt : Math.min(36, l.mt / 2)
    const footer = hasF ? l.mb : Math.min(36, l.mb / 2)
    const cols = s.cols ?? l.cols
    const type = s.type && prev ? `<w:type w:val="${s.type}"/>` : ''
    const pg = l.numFmt || s.pgStart ? `<w:pgNumType${l.numFmt ? ` w:fmt="${l.numFmt}"` : ''}${s.pgStart ? ` w:start="${s.pgStart}"` : ''}/>` : ''
    return (
      `<w:sectPr>${refs}${type}<w:pgSz w:w="${tw(l.pw)}" w:h="${tw(l.ph)}"${l.pw > l.ph ? ' w:orient="landscape"' : ''}/>` +
      `<w:pgMar w:top="${tw(top)}" w:right="${tw(l.mr)}" w:bottom="${tw(bottom)}" w:left="${tw(l.ml)}" w:header="${tw(header)}" w:footer="${tw(footer)}" w:gutter="0"/>` +
      pg +
      (cols ? `<w:cols w:num="${cols.n}" w:space="${tw(cols.gap)}"${cols.sep ? ' w:sep="1"' : ''}/>` : '<w:cols w:space="720"/>') +
      (titlePg ? '<w:titlePg/>' : '') +
      '</w:sectPr>'
    )
  }

  // ------------------------------------------------------------ document

  async convert(): Promise<Blob> {
    const text = this.pkg.body('text')
    if (!text) {
      // an encrypted content.xml parses to noise without office:body
      if (!child(this.pkg.content, 'office:body')) throw new Error('The OpenDocument file cannot be read: it is password-protected or damaged')
      throw new Error('Not an OpenDocument text document (no office:text)')
    }
    // pictures, read up front: the conversion itself is synchronous
    const byHref = new Map<string, Uint8Array | undefined>()
    const found: ONode[] = []
    const walk = (n: ONode) => {
      for (const k of n.kids) if (typeof k !== 'string') k.name === 'draw:image' ? found.push(k) : k.kids.length && walk(k)
    }
    for (const root of new Set([this.pkg.content, this.pkg.stylesRoot])) if (root) walk(root)
    {
      for (const im of found) {
        const href = im.attrs['xlink:href']
        if (href && byHref.has(href)) this.images.set(im, byHref.get(href))
        else {
          const bytes = await this.pkg.file(im)
          this.images.set(im, bytes)
          if (href) byHref.set(href, bytes)
        }
      }
    }
    for (const m of this.st.masterPages.values()) {
      for (const k of ['header', 'footer', 'header-left', 'footer-left', 'header-first', 'footer-first']) if (this.hfEl(m, k)) this.anyHeaders = true
      if (this.hfEl(m, 'header-left') || this.hfEl(m, 'footer-left')) this.evenOdd = true
    }
    this.applyColumnWidth()

    this.blocks(text.kids, this.body, { top: true })
    if (this.pendingRuns) this.body.push(`<w:p>${this.pendingRuns}</w:p>`)
    // comment ranges never closed end with the document
    const open = [...this.commentOpen.values()]
    if (open.length) this.body.push(`<w:p>${open.map((id) => `<w:commentRangeEnd w:id="${id}"/><w:r><w:commentReference w:id="${id}"/></w:r>`).join('')}</w:p>`)
    this.commentOpen.clear()
    const ends = this.closeBookmarks()
    if (ends) this.body.push(ends)
    if (!this.body.length) this.body.push('<w:p/>')

    const all = [...this.sections, this.sect]
    const sectXml = all.map((s, k) => this.sectPrXml(s, all[k - 1]))
    const bodyXml = this.body.join('').replace(/<!--S(\d+)-->/g, (_, k: string) => sectXml[Number(k)])
    const bg = this.layoutOf(all[0].master).bg
    const doc = `${XML_HEAD}<w:document ${NS}>${bg ? `<w:background w:color="${bg}"/>` : ''}<w:body>${bodyXml}${sectXml[sectXml.length - 1]}</w:body></w:document>`
    return this.pack(doc, !!bg)
  }

  private pack(documentXml: string, background: boolean): Promise<Blob> {
    const parts: PackPart[] = [
      { path: 'word/styles.xml', xml: this.sty.stylesXml(NS), type: `${WML}.styles+xml`, rel: 'styles' },
      {
        path: 'word/settings.xml',
        xml: settingsXml({
          tab: toPt(child(this.st.defaults.get('paragraph'), 'style:paragraph-properties')?.attrs['style:tab-stop-distance']),
          background,
          evenOdd: this.evenOdd,
          footnotes: this.footnotes.length ? (PAGE_FMT[this.noteConf.footnote['style:num-format'] ?? ''] ?? '') : undefined,
          endnotes: this.endnotes.length ? (PAGE_FMT[this.noteConf.endnote['style:num-format'] ?? ''] ?? '') : undefined,
        }),
        type: `${WML}.settings+xml`,
        rel: 'settings',
      },
    ]
    if (!this.num.empty) parts.push({ path: 'word/numbering.xml', xml: `${XML_HEAD}${this.num.xml(NS)}`, type: `${WML}.numbering+xml`, rel: 'numbering' })
    if (this.footnotes.length) parts.push({ path: 'word/footnotes.xml', xml: notesXml('footnote', this.footnotes), type: `${WML}.footnotes+xml`, rel: 'footnotes', part: this.footPart })
    if (this.endnotes.length) parts.push({ path: 'word/endnotes.xml', xml: notesXml('endnote', this.endnotes), type: `${WML}.endnotes+xml`, rel: 'endnotes', part: this.endPart })
    if (this.comments.length)
      parts.push({ path: 'word/comments.xml', xml: `${XML_HEAD}<w:comments ${NS}>${this.comments.join('')}</w:comments>`, type: `${WML}.comments+xml`, rel: 'comments', part: this.commentPart })
    for (const { path, part, xml } of this.hf) parts.push({ path: 'word/' + path, xml, type: `${WML}.${path.startsWith('header') ? 'header' : 'footer'}+xml`, part })
    return packDocx(documentXml, this.docPart, parts, this.media, coreXml(this.pkg.meta))
  }
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Converts an OpenDocument text document to a DOCX file. */
export async function odtToDocx(pkg: OdfPackage): Promise<Blob> {
  return new OdtConverter(pkg).convert()
}
