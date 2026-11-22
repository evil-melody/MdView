/**
 * Pages documents (iWork '13+) → DOCX, for viewing: the document's text storages, styles, lists, tables, images,
 * text boxes, headers / footers and footnotes become WordprocessingML that the DOCX pipeline renders.
 *
 * Message and field numbers follow the reverse-engineered iWork schemas (obriensp/iWorkFileFormat,
 * psobot/keynote-parser); attribute-table semantics follow LibreOffice's libetonyek.
 */
import { escAttr, escText } from '../raw'
import { writeZip, type PartData } from '../zipwrite'
import type { IworkPackage } from './iwa'
import { imageData, Media, mediaTypes, Part, XML_HEAD } from './ooxml'
import type { Msg } from './proto'
import { fillColor, hangOf, hexColor, IworkStyles, type CharProps, type ParaProps } from './styles'
import { anchors, readTable, tableLook, type CellStroke, type IworkTable } from './table'
import { firstSection, paragraphs, STORAGE } from './text'

// ---------------------------------------------------------------- message types

const DRAWABLE_ATTACHMENT = 2003
const TEXTUAL_ATTACHMENT = new Set([14, 2004, 2007, 2009])
const FOOTNOTE_REFERENCE = 2008
const SHAPE_INFO = 2011
const SHAPE_STYLE = 2025
const NUMBER_ATTACHMENT = 2043
const SHAPE = 3004
const IMAGE = 3005
const GROUP = 3008
const TABLE_INFO = 6000
const WP_TABLE_INFO = 6007
const PAGES_DOCUMENT = 10000

const MAX_DEPTH = 6

const NUM_FMT = ['decimal', 'upperRoman', 'lowerRoman', 'upperLetter', 'lowerLetter']
const PAGE_SWITCH = ['', ' \\* ROMAN', ' \\* roman', ' \\* ALPHABETIC', ' \\* alphabetic']

const tw = (pt: number) => Math.round(pt * 20)
const emu = (pt: number) => Math.round(pt * 12700)

// ---------------------------------------------------------------- properties → WordprocessingML

function rPrXml(c: CharProps, rStyle?: string, inherited?: number): string {
  let x = rStyle ? `<w:rStyle w:val="${rStyle}"/>` : ''
  if (c.font) {
    const f = escAttr(c.font)
    x += `<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${f}"/>`
  }
  if (c.b !== undefined) x += c.b ? '<w:b/>' : '<w:b w:val="0"/>'
  if (c.i !== undefined) x += c.i ? '<w:i/>' : '<w:i w:val="0"/>'
  if (c.caps === 'caps') x += '<w:caps/>'
  else if (c.caps === 'smallCaps') x += '<w:smallCaps/>'
  else if (c.caps === 'none') x += '<w:caps w:val="0"/><w:smallCaps w:val="0"/>'
  if (c.strike === 'single') x += '<w:strike/>'
  else if (c.strike === 'double') x += '<w:dstrike/>'
  else if (c.strike === 'none') x += '<w:strike w:val="0"/><w:dstrike w:val="0"/>'
  if (c.color) x += `<w:color w:val="${c.color}"/>`
  const sz = c.sz ?? inherited ?? 12
  if (c.track) x += `<w:spacing w:val="${tw(c.track * sz)}"/>`
  if (c.shift) x += `<w:position w:val="${Math.round(c.shift * 2)}"/>`
  if (c.sz) x += `<w:sz w:val="${Math.round(c.sz * 2)}"/><w:szCs w:val="${Math.round(c.sz * 2)}"/>`
  if (c.u) x += `<w:u w:val="${c.u}"/>`
  if (c.shd) x += `<w:shd w:val="clear" w:color="auto" w:fill="${c.shd}"/>`
  if (c.va) x += `<w:vertAlign w:val="${c.va}"/>`
  return x ? `<w:rPr>${x}</w:rPr>` : ''
}

interface PExtra {
  style?: string
  numPr?: string
  pbb?: boolean
  ind?: { left: number; hanging: number }
  markRPr?: string
}

function pPrXml(p: ParaProps, e: PExtra = {}): string {
  let x = e.style ? `<w:pStyle w:val="${e.style}"/>` : ''
  if (p.keepNext !== undefined) x += p.keepNext ? '<w:keepNext/>' : '<w:keepNext w:val="0"/>'
  if (p.keepLines !== undefined) x += p.keepLines ? '<w:keepLines/>' : '<w:keepLines w:val="0"/>'
  if (e.pbb) x += '<w:pageBreakBefore/>'
  else if (p.pbb !== undefined) x += p.pbb ? '<w:pageBreakBefore/>' : '<w:pageBreakBefore w:val="0"/>'
  if (e.numPr) x += e.numPr
  if (p.fill) x += `<w:shd w:val="clear" w:color="auto" w:fill="${p.fill}"/>`
  let sp = ''
  if (p.before !== undefined) sp += ` w:before="${tw(p.before)}"`
  if (p.after !== undefined) sp += ` w:after="${tw(p.after)}"`
  if (p.line) sp += ` w:line="${p.line.rule === 'auto' ? Math.round(p.line.v * 240) : tw(p.line.v)}" w:lineRule="${p.line.rule}"`
  if (sp) x += `<w:spacing${sp}/>`
  if (e.ind) x += `<w:ind w:left="${tw(e.ind.left)}" w:hanging="${tw(e.ind.hanging)}"/>`
  else if (p.left !== undefined || p.right !== undefined || p.first !== undefined) {
    let ind = ''
    const left = p.left ?? 0
    if (p.left !== undefined) ind += ` w:left="${tw(p.left)}"`
    if (p.right !== undefined) ind += ` w:right="${tw(p.right)}"`
    if (p.first !== undefined) {
      const d = p.first - left
      ind += d < 0 ? ` w:hanging="${tw(-d)}"` : ` w:firstLine="${tw(d)}"`
    }
    x += `<w:ind${ind}/>`
  }
  if (p.align) x += `<w:jc w:val="${p.align}"/>`
  if (p.outline !== undefined) x += `<w:outlineLvl w:val="${p.outline < 0 ? 9 : p.outline}"/>`
  if (e.markRPr) x += e.markRPr
  return x ? `<w:pPr>${x}</w:pPr>` : ''
}

/** a run of text: tabs and line breaks become their elements, control characters are dropped */
function runXml(t: string, rPr: string): string {
  let out = ''
  let buf = ''
  const flush = () => {
    if (buf) out += `<w:t xml:space="preserve">${escText(buf)}</w:t>`
    buf = ''
  }
  for (let k = 0; k < t.length; k++) {
    const ch = t[k]
    const code = t.charCodeAt(k)
    if (ch === '\t') {
      flush()
      out += '<w:tab/>'
    } else if (ch === '\r' || ch === '\u2028' || ch === '\u000b' || ch === '\u000c') {
      flush()
      out += '<w:br/>'
    } else if (code < 0x20 || ch === '\ufffc' || code === 0xfffe || code === 0xffff) continue
    else if (code >= 0xd800 && code <= 0xdbff) {
      // keep surrogate pairs, drop lone halves (invalid XML)
      const next = t.charCodeAt(k + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        buf += ch + t[k + 1]
        k++
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) continue
    else buf += ch
  }
  flush()
  return out ? `<w:r>${rPr}${out}</w:r>` : ''
}

/** rough height (pt) of header / footer content: its lines at their largest font size, plus a gap */
function hfHeight(xml: string): number {
  let sz = 12
  for (const m of xml.matchAll(/<w:sz w:val="(\d+)"/g)) sz = Math.max(sz, +m[1] / 2)
  const cells = xml.split('<w:tc>').slice(1)
  const paras = (x: string) => (x.match(/<w:p[ >/]/g) ?? []).length
  const lines = cells.length ? Math.max(...cells.map(paras)) : paras(xml)
  return lines * sz * 1.2 + 6
}

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"'

/** a drawable converted for the flow: inline content of a run, or a block (table) */
type Out = { run: string } | { block: string }

interface StorageOpts {
  /** runs put at the start of the first paragraph */
  prefix?: string
  /** paragraph style of paragraphs without one (table cells) */
  baseStyle?: number
  /** alignment of every paragraph (the left / center / right parts of a header) */
  align?: ParaProps['align']
}

const NOTE_SYMBOLS = ['*', '†', '‡', '§', '‖', '¶']

function roman(n: number): string {
  const map: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let s = ''
  for (const [v, r] of map) while (n >= v) (s += r), (n -= v)
  return s
}

// ---------------------------------------------------------------- converter

export class PagesConverter {
  private st: IworkStyles
  private media: Media
  private styleXml = new Map<string, { name: string; xml: string }>()
  private nums = new Map<number, number | null>()
  private abstractNums: string[] = []
  private numXml: string[] = []
  private notes: string[] = []
  private noteFormat = 0
  private docPr = 0
  private depth = 0
  private part = new Part('word/document.xml')
  private contentWidth = 468
  /** header / footer parts and their XML */
  private hf = new Map<string, { part: Part; xml: string }>()
  private runCache = new Map<string, string>()

  constructor(private pkg: IworkPackage) {
    this.st = new IworkStyles(pkg)
    this.media = new Media(pkg, 'word/media')
  }

  // ---- styles

  /** w:rPr of text in a paragraph style and a character style: the character style wins over the paragraph's variations */
  private runPr(paraId: number | undefined, charId: number | undefined): string {
    const key = `${paraId}:${charId}`
    let x = this.runCache.get(key)
    if (x === undefined) {
      const { cDirect, sz } = this.st.resolved(paraId)
      x = rPrXml({ ...cDirect, ...this.st.charFull(charId) }, this.charStyleId(charId), sz)
      this.runCache.set(key, x)
    }
    return x
  }

  /** w:styleId of the named paragraph style a style id resolves to (emitted on first use) */
  private paraStyleId(id: number | undefined): string | undefined {
    const { st } = this
    const nid = st.named(id)
    if (nid === undefined) return undefined
    const sid = `P${nid}`
    if (this.styleXml.has(sid)) return sid
    const rec = st.style(nid)!
    this.styleXml.set(sid, { name: '', xml: '' })
    const parent = st.named(rec.parent)
    const own = st.chain(nid, 1, parent)
    const basedOn = parent !== undefined ? this.paraStyleId(parent) : undefined
    const name = rec.name || sid
    const xml =
      `<w:style w:type="paragraph" w:styleId="${sid}"%DEFAULT%><w:name w:val="${escAttr(name)}"/>` +
      (basedOn ? `<w:basedOn w:val="${basedOn}"/>` : '') +
      '<w:qFormat/>' +
      pPrXml(st.paraOf(own)) +
      rPrXml(st.charOf(own), undefined, st.resolved(nid).sz) +
      '</w:style>'
    this.styleXml.set(sid, { name, xml })
    return sid
  }

  private charStyleId(id: number | undefined): string | undefined {
    const { st } = this
    const nid = st.named(id)
    if (nid === undefined) return undefined
    const sid = `C${nid}`
    if (this.styleXml.has(sid)) return sid
    const rec = st.style(nid)!
    this.styleXml.set(sid, { name: '', xml: '' })
    const parent = st.named(rec.parent)
    const own = st.chain(nid, 1, parent)
    const basedOn = parent !== undefined ? this.charStyleId(parent) : undefined
    const name = rec.name || sid
    const xml =
      `<w:style w:type="character" w:styleId="${sid}"><w:name w:val="${escAttr(name)}"/>` +
      (basedOn ? `<w:basedOn w:val="${basedOn}"/>` : '') +
      rPrXml(st.charOf(own), undefined, st.charFull(nid).sz) +
      '</w:style>'
    this.styleXml.set(sid, { name, xml })
    return sid
  }

  /** w:numId of a list style (undefined: no labels) */
  private numId(id: number | undefined): number | undefined {
    if (id === undefined) return undefined
    const hit = this.nums.get(id)
    if (hit !== undefined) return hit ?? undefined
    const levels = this.st.list(id)
    if (!levels) {
      this.nums.set(id, null)
      return undefined
    }
    let xml = ''
    levels.forEach((lv, l) => {
      let fmt = 'bullet'
      let text = lv.text
      if (lv.kind === 'none') {
        fmt = 'none'
        text = ''
      } else if (lv.kind === 'number') {
        fmt = NUM_FMT[lv.fmt] ?? 'decimal'
        const n = lv.tiered ? Array.from({ length: l + 1 }, (_, k) => `%${k + 1}`).join('.') : `%${l + 1}`
        text = lv.punct === 1 ? `(${n})` : lv.punct === 2 ? `${n})` : `${n}.`
      }
      const hang = hangOf(lv, 12)
      xml +=
        `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${escAttr(text)}"/><w:lvlJc w:val="left"/>` +
        `<w:pPr><w:ind w:left="${tw(lv.indent + hang)}" w:hanging="${tw(hang)}"/></w:pPr></w:lvl>`
    })
    const n = this.numXml.length + 1
    this.abstractNums.push(`<w:abstractNum w:abstractNumId="${n}"><w:multiLevelType w:val="multilevel"/>${xml}</w:abstractNum>`)
    this.numXml.push(`<w:num w:numId="${n}"><w:abstractNumId w:val="${n}"/></w:num>`)
    this.nums.set(id, n)
    return n
  }

  // ---- text storages

  /** WordprocessingML blocks of a TSWP.StorageArchive */
  storage(id: number | undefined, opts: StorageOpts = {}): string {
    const s = this.pkg.get(id)
    if (!s || !STORAGE.has(this.pkg.type(id) ?? 0) || this.depth > MAX_DEPTH) return ''
    this.depth++
    try {
      let out = ''
      for (const [k, p] of paragraphs(this.pkg, s).entries()) {
        const paraId = p.paraId ?? opts.baseStyle
        const { pDirect: pd, cDirect, pFull, sz } = this.st.resolved(paraId)
        const pDirect = opts.align ? { ...pd, align: opts.align } : pd

        const listId = p.listId ?? pFull.list
        const numId = this.numId(listId)
        let numPr: string | undefined
        let ind: PExtra['ind']
        const lv = numId !== undefined ? this.st.list(listId)?.[p.level] : undefined
        if (numId !== undefined && lv) {
          numPr = `<w:numPr><w:ilvl w:val="${p.level}"/><w:numId w:val="${numId}"/></w:numPr>`
          const hang = hangOf(lv, sz)
          ind = { left: (pFull.left ?? 0) + lv.indent + hang, hanging: hang }
        }

        // runs, with hyperlinks around them; a table attached in the paragraph splits it
        const pieces: Out[] = []
        if (k === 0 && opts.prefix) pieces.push({ run: opts.prefix })
        let link: string | undefined
        let linkRuns = ''
        const flushLink = () => {
          if (!linkRuns) return
          pieces.push({ run: link ? `<w:hyperlink r:id="${this.part.rel('hyperlink', link, true)}">${linkRuns}</w:hyperlink>` : linkRuns })
          linkRuns = ''
        }
        for (const seg of p.segs) {
          const href = seg.t === 'note' ? link : seg.href
          if (href !== link) {
            flushLink()
            link = href
          }
          const rPr = this.runPr(paraId, seg.charId)
          if (seg.t === 'att') {
            for (const o of this.attachment(seg.id, rPr)) {
              if ('block' in o) {
                flushLink()
                pieces.push(o)
              } else linkRuns += o.run
            }
          } else if (seg.t === 'note') linkRuns += this.noteRef(seg.id, rPr)
          else linkRuns += runXml(seg.text, rPr)
        }
        flushLink()

        const pPr = pPrXml(pDirect, { style: this.paraStyleId(paraId), numPr, ind, pbb: p.pageBreak, markRPr: rPrXml(cDirect, undefined, sz) })
        // a paragraph holding only a table becomes the table
        const hasBlock = pieces.some((x) => 'block' in x)
        let runs = ''
        for (const x of pieces) {
          if ('block' in x) {
            if (runs) out += `<w:p>${pPr}${runs}</w:p>`
            out += x.block
            runs = ''
          } else runs += x.run
        }
        if (runs || !hasBlock) out += `<w:p>${pPr}${runs}</w:p>`
      }
      return out
    } finally {
      this.depth--
    }
  }

  // ---- attachments

  private attachment(id: number, rPr: string): Out[] {
    const type = this.pkg.type(id)
    const m = this.pkg.get(id)
    if (!m) return []
    if (type === DRAWABLE_ATTACHMENT) return this.drawable(m.ref(1))
    if (type === NUMBER_ATTACHMENT || (type !== undefined && TEXTUAL_ATTACHMENT.has(type))) {
      const kind = m.msg(1)?.u(2) ?? m.u(2)
      if (kind === 0 || kind === 1) {
        const fmt = type === NUMBER_ATTACHMENT ? (m.u(2) ?? 0) : 0
        const instr = (kind === 0 ? 'PAGE' : 'NUMPAGES') + (PAGE_SWITCH[fmt] ?? '')
        const shown = m.str(3) ?? m.msg(1)?.str(1) ?? '1'
        return [{ run: `<w:fldSimple w:instr=" ${instr} "><w:r>${rPr}<w:t>${escText(shown)}</w:t></w:r></w:fldSimple>` }]
      }
      // footnote mark inside a note: the number is put in front of the note already
    }
    return []
  }

  private noteLabel(n: number): string {
    switch (this.noteFormat) {
      case 1:
        return roman(n)
      case 2:
        return NOTE_SYMBOLS[(n - 1) % NOTE_SYMBOLS.length].repeat(Math.floor((n - 1) / NOTE_SYMBOLS.length) + 1)
      default:
        return String(n)
    }
  }

  private noteRef(id: number, rPr: string): string {
    const m = this.pkg.get(id)
    if (!m || this.pkg.type(id) !== FOOTNOTE_REFERENCE) return ''
    const label = m.str(3) || this.noteLabel(this.notes.length + 1)
    const sup = rPr.replace(/<w:vertAlign [^>]*\/>/, '').replace(/<\/w:rPr>$/, '<w:vertAlign w:val="superscript"/></w:rPr>') || '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>'
    this.notes.push(this.storage(m.ref(2), { prefix: `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve">${escText(label)} </w:t></w:r>` }))
    return `<w:r>${sup}<w:t>${escText(label)}</w:t></w:r>`
  }

  /** geometry size of a drawable (DrawableArchive nested `nest` levels deep), no wider than the text column */
  private size(m: Msg, nest: number): { w: number; h: number } {
    let d: Msg | undefined = m
    for (let k = 0; k < nest && d; k++) d = d.msg(1)
    const size = d?.msg(1)?.msg(2)
    let w = size?.float(1) ?? 0
    let h = size?.float(2) ?? 0
    if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 }
    if (w > this.contentWidth) {
      h = (h * this.contentWidth) / w
      w = this.contentWidth
    }
    return { w, h }
  }

  /** the flow content of a drawable */
  drawable(id: number | undefined): Out[] {
    const type = this.pkg.type(id)
    const m = this.pkg.get(id)
    if (!m || this.depth > MAX_DEPTH) return []
    this.depth++
    try {
      switch (type) {
        case IMAGE: {
          const img = this.image(m)
          return img ? [{ run: img }] : []
        }
        case SHAPE_INFO:
        case SHAPE:
          return this.shape(m, type === SHAPE_INFO)
        case TABLE_INFO:
        case WP_TABLE_INFO: {
          const info = type === WP_TABLE_INFO ? m.msg(1) : m
          const t = info && readTable(this.pkg, info.ref(2)!)
          return t ? [{ block: this.table(t) }] : []
        }
        case GROUP:
          return m.refs(2).flatMap((c) => this.drawable(c))
        default:
          return []
      }
    } finally {
      this.depth--
    }
  }

  private image(m: Msg): string | undefined {
    const did = imageData(this.pkg, m)
    if (did === undefined) return undefined
    const { w, h } = this.size(m, 1)
    if (!w) return undefined
    const rid = this.part.rel('image', 'media/' + this.media.name(did))
    const n = ++this.docPr
    const descr = m.msg(1)?.str(8)
    return (
      `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${emu(w)}" cy="${emu(h)}"/>` +
      `<wp:docPr id="${n}" name="Picture ${n}"${descr ? ` descr="${escAttr(descr)}"` : ''}/>` +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
      `<pic:nvPicPr><pic:cNvPr id="${n}" name="Picture ${n}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
    )
  }

  /** a shape: a text box (or a plain filled box) in the flow */
  private shape(m: Msg, withText: boolean): Out[] {
    const shapeArchive = withText ? m.msg(1) : m
    if (!shapeArchive) return []
    const { w, h } = this.size(shapeArchive, 1)
    const storage = withText ? (m.ref(4) ?? m.ref(2)) : undefined
    const body = storage !== undefined ? this.storage(storage) : ''
    const hasText = /<w:t[ >]/.test(body)
    // the look: TSWP.ShapeStyleArchive (text shapes) wraps a TSD.ShapeStyleArchive (fill, stroke)
    let fill: string | undefined
    let line: string | undefined
    let lineW = 1
    let pad: Msg | undefined
    const styleId = shapeArchive.ref(2)
    const wp = this.pkg.type(styleId) === SHAPE_STYLE
    for (const st of this.st.chain(styleId, wp ? 2 : 1)) {
      const props = wp ? st.msg(1)?.msg(11) : st.msg(11)
      if (props && fill === undefined && props.has(1)) fill = fillColor(props.msg(1)) ?? ''
      const stroke = props?.msg(2)
      if (stroke && line === undefined) {
        line = stroke.msg(6)?.u(1) === 2 ? '' : (hexColor(stroke.msg(1)) ?? '')
        lineW = stroke.float(2) ?? 1
      }
      if (!pad && wp) pad = st.msg(11)?.msg(6)
    }
    if (!hasText && !fill && !line) return []
    if (!w) return hasText ? [{ block: body }] : []
    const n = ++this.docPr
    const ins = (f: number, d: number) => emu(pad?.float(f) ?? d)
    return [
      {
        run:
          `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${emu(w)}" cy="${emu(h)}"/>` +
          `<wp:docPr id="${n}" name="Text Box ${n}"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp>` +
          `<wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
          (fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>') +
          (line ? `<a:ln w="${emu(lineW)}"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>') +
          `</wps:spPr><wps:txbx><w:txbxContent>${body || '<w:p/>'}</w:txbxContent></wps:txbx>` +
          `<wps:bodyPr wrap="square" lIns="${ins(1, 4)}" tIns="${ins(2, 4)}" rIns="${ins(3, 4)}" bIns="${ins(4, 4)}"><a:noAutofit/></wps:bodyPr>` +
          '</wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
      },
    ]
  }

  // ---- tables

  private cellFill(id: number | undefined): string | undefined {
    for (const st of this.st.chain(id)) {
      const f = st.msg(11)?.msg(1)
      if (f) return fillColor(f)
    }
    return undefined
  }

  private table(t: IworkTable): string {
    const m = t.model
    const total = t.colWidths.reduce((a, b) => a + b, 0)
    const scale = total > this.contentWidth ? this.contentWidth / total : 1
    const widths = t.colWidths.map((w) => Math.max(1, tw(w * scale)))
    const look = tableLook(this.pkg, t, (id) => this.st.chain(id), hexColor, fillColor)
    const edge = (tag: string, s: CellStroke | null | undefined) =>
      s ? `<w:${tag} w:val="single" w:sz="${Math.max(2, Math.round(s.width * 8))}" w:space="0" w:color="${s.color}"/>` : `<w:${tag} w:val="nil"/>`
    let x =
      `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>` +
      '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>' +
      `</w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    const anchor = anchors(t)
    for (let r = 0; r < t.rows; r++) {
      const header = r < t.headerRows
      const footer = !header && r >= t.rows - t.footerRows
      x += `<w:tr><w:trPr><w:trHeight w:val="${tw(t.rowHeights[r])}" w:hRule="atLeast"/>${header ? '<w:tblHeader/>' : ''}</w:trPr>`
      for (let c = 0; c < t.cols; ) {
        const a = anchor[r][c]
        const src = a ? t.cells[a[0]][a[1]] : t.cells[r][c]
        const span = a ? (src?.colSpan ?? 1) : 1
        const w = widths.slice(c, c + span).reduce((p, q) => p + q, 0)
        let tcPr = `<w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}`
        if (a && (src?.rowSpan ?? 1) > 1) tcPr += a[0] === r ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>'
        // the edges of the cell (of the whole range for a merged one)
        const [r0, c0] = a ?? [r, c]
        const rs = a ? (src?.rowSpan ?? 1) : 1
        tcPr += `<w:tcBorders>${edge('top', look.h[r0][c0])}${edge('left', look.v[r][c0])}${edge('bottom', look.h[r0 + rs]?.[c0])}${edge('right', look.v[r][c0 + span])}</w:tcBorders>`
        const region = header ? m.ref(19) : footer ? m.ref(21) : c < t.headerCols ? m.ref(20) : m.ref(18)
        const banded = look.band && !header && !footer && (r - t.headerRows) % 2 === 1 ? look.band : undefined
        const fill = this.cellFill(src?.cellStyle) ?? banded ?? this.cellFill(region)
        if (fill) tcPr += `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`
        const textStyle = src?.textStyle ?? (header ? m.ref(25) : footer ? m.ref(27) : c < t.headerCols ? m.ref(26) : m.ref(24))
        let body = ''
        if (!a || a[0] === r) {
          if (src?.storage !== undefined) body = this.storage(src.storage, { baseStyle: textStyle })
          else if (src?.text) body = this.plain(src.text, textStyle)
        }
        x += `<w:tc><w:tcPr>${tcPr}</w:tcPr>${body || this.plain('', textStyle)}</w:tc>`
        c += span
      }
      x += '</w:tr>'
    }
    return x + '</w:tbl>'
  }

  /** paragraphs of plain text in a paragraph style */
  private plain(text: string, styleId: number | undefined): string {
    const pStyle = this.paraStyleId(styleId)
    const { pDirect, cDirect, sz } = this.st.resolved(styleId)
    const rPr = rPrXml(cDirect, undefined, sz)
    const pPr = pPrXml(pDirect, { style: pStyle, markRPr: rPr })
    return text
      .split(/\r?\n|\u2029/)
      .map((line) => `<w:p>${pPr}${runXml(line, rPr)}</w:p>`)
      .join('')
  }

  // ---- document

  async convert(): Promise<Blob> {
    const { pkg } = this
    const doc = pkg.get(pkg.ofType(PAGES_DOCUMENT)[0])
    if (!doc) throw new Error('Not a Pages document')
    const settings = pkg.get(doc.ref(7))
    this.noteFormat = settings?.u(31) ?? 0

    // page setup (pt)
    let pw = doc.float(30) || 612
    let ph = doc.float(31) || 792
    if (doc.u(42) === 1 && pw < ph) [pw, ph] = [ph, pw]
    const mar = (f: number, d: number) => {
      const v = doc.float(f)
      return v !== undefined && v >= 0 && isFinite(v) ? v : d
    }
    const ml = mar(32, 72)
    const mr = mar(33, 72)
    let mt = mar(34, 72)
    let mb = mar(35, 72)
    const hm = mar(36, 36)
    const fm = mar(37, 36)
    this.contentWidth = Math.max(72, pw - ml - mr)

    // body: flowing text, or (page layout documents) the drawables placed on each page
    let body = ''
    const floating = this.floating(doc.ref(3))
    if (settings?.bool(1) !== false) {
      body = this.storage(doc.ref(4))
      if (floating.length) {
        const first = floating.filter((g) => g.page === 0).map((g) => g.xml).join('')
        const rest = floating.filter((g) => g.page !== 0).map((g) => g.xml).join('')
        body = first + body + rest
      }
    } else body = floating.map((g, k) => (k ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '') + g.xml).join('')
    if (this.notes.length) {
      body += '<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="808080"/></w:pBdr><w:spacing w:before="240"/></w:pPr></w:p>'
      body += this.notes.join('')
    }
    if (!body) body = '<w:p/>'

    // headers and footers of the first section
    const docPart = this.part
    let refs = ''
    let titlePg = false
    const section = pkg.get(firstSection(pkg.get(doc.ref(4))) ?? doc.ref(5))
    if (section) {
      const showH = settings?.bool(2) !== false
      const showF = settings?.bool(3) !== false
      const master = (f: number) => pkg.get(section.ref(f))
      const add = (kind: 'header' | 'footer', type: 'default' | 'first', ids: number[] | undefined) => {
        if (!ids) return
        const path = `${kind}${this.hf.size + 1}.xml`
        const part = new Part('word/' + path)
        // images and links of the header / footer are relationships of its own part
        this.part = part
        const xml = this.headerFooter(ids)
        this.part = docPart
        if (xml === undefined) return
        const tag = kind === 'header' ? 'hdr' : 'ftr'
        this.hf.set(path, { part, xml: `${XML_HEAD}<w:${tag} ${NS}>${xml || '<w:p/>'}</w:${tag}>` })
        refs += `<w:${kind}Reference w:type="${type}" r:id="${docPart.rel(kind, path)}"/>`
        // Pages moves the body clear of a header / footer taller than its margin
        if (xml) {
          const h = hfHeight(xml)
          if (kind === 'header') mt = Math.max(mt, hm + h)
          else mb = Math.max(mb, fm + h)
        }
      }
      const odd = master(25) ?? master(23)
      if (showH) add('header', 'default', odd?.refs(1))
      if (showF) add('footer', 'default', odd?.refs(2))
      if (section.bool(28)) {
        titlePg = true
        add('header', 'first', [])
        add('footer', 'first', [])
      } else if (section.bool(18)) {
        const first = master(23)
        titlePg = true
        if (showH) add('header', 'first', first?.refs(1) ?? [])
        if (showF) add('footer', 'first', first?.refs(2) ?? [])
      }
    }

    const sectPr =
      `<w:sectPr>${refs}<w:pgSz w:w="${tw(pw)}" w:h="${tw(ph)}"${pw > ph ? ' w:orient="landscape"' : ''}/>` +
      `<w:pgMar w:top="${tw(mt)}" w:right="${tw(mr)}" w:bottom="${tw(mb)}" w:left="${tw(ml)}" w:header="${tw(hm)}" w:footer="${tw(fm)}" w:gutter="0"/>` +
      `${titlePg ? '<w:titlePg/>' : ''}</w:sectPr>`
    return this.pack(`${XML_HEAD}<w:document ${NS}><w:body>${body}${sectPr}</w:body></w:document>`)
  }

  /** header / footer content: its three storages (left, center, right); undefined when all are empty */
  private headerFooter(ids: number[]): string | undefined {
    if (!ids.length) return ''
    const slots = ids.slice(0, 3).map((id) => (this.hasText(id) ? id : undefined))
    const n = slots.filter((x) => x !== undefined).length
    if (!n) return undefined
    if (n === 1) return this.storage(slots.find((x) => x !== undefined))
    const w = Math.floor(tw(this.contentWidth) / 3)
    const cell = (id: number | undefined, align: ParaProps['align']) =>
      `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${(id !== undefined && this.storage(id, { align })) || '<w:p/>'}</w:tc>`
    return (
      `<w:tbl><w:tblPr><w:tblW w:w="${w * 3}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
      `<w:tblGrid>${`<w:gridCol w:w="${w}"/>`.repeat(3)}</w:tblGrid><w:tr>${cell(slots[0], 'left')}${cell(slots[1], 'center')}${cell(slots[2], 'right')}</w:tr></w:tbl>` +
      // a header / footer ends with a paragraph: a hairline one
      '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>'
    )
  }

  private hasText(id: number | undefined): boolean {
    const s = this.pkg.get(id)
    return !!s && /\S/.test(s.strs(3).join('').replace(/[\u0000-\u001f]/g, ''))
  }

  /** floating drawables, grouped by page, each page's in reading order */
  private floating(id: number | undefined): { page: number; xml: string }[] {
    const groups = this.pkg.get(id)?.msgs(1) ?? []
    const out: { page: number; xml: string }[] = []
    const pos = (ref: number) => {
      let d = this.pkg.get(ref)?.msg(1)
      if (this.pkg.type(ref) === SHAPE_INFO || this.pkg.type(ref) === WP_TABLE_INFO) d = d?.msg(1)
      const p = d?.msg(1)?.msg(1)
      return [p?.float(2) ?? 0, p?.float(1) ?? 0]
    }
    for (const g of [...groups].sort((a, b) => (a.u(1) ?? 0) - (b.u(1) ?? 0))) {
      const refs = [...g.msgs(2), ...g.msgs(4), ...g.msgs(3)].map((e) => e.ref(1)).filter((r): r is number => r !== undefined)
      refs.sort((a, b) => {
        const [ya, xa] = pos(a)
        const [yb, xb] = pos(b)
        return ya - yb || xa - xb
      })
      let xml = ''
      for (const r of refs) for (const o of this.drawable(r)) xml += 'block' in o ? o.block : `<w:p>${o.run}</w:p>`
      if (xml) out.push({ page: g.u(1) ?? 0, xml })
    }
    return out
  }

  private async pack(documentXml: string): Promise<Blob> {
    const docPart = this.part
    const styleIds = [...this.styleXml.entries()]
    const def = styleIds.find(([, s]) => s.name.toLowerCase() === 'body') ?? styleIds.find(([id]) => id.startsWith('P'))
    const styles = styleIds.map(([id, s]) => s.xml.replace('%DEFAULT%', def && def[0] === id ? ' w:default="1"' : '')).join('')
    const stylesXml =
      `${XML_HEAD}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Helvetica Neue" w:hAnsi="Helvetica Neue" w:eastAsia="Helvetica Neue" w:cs="Helvetica Neue"/>` +
      '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      `${styles}</w:styles>`
    docPart.rel('styles', 'styles.xml')
    const WML = 'application/vnd.openxmlformats-officedocument.wordprocessingml'
    const files = new Map<string, PartData>()
    let overrides = `<Override PartName="/word/document.xml" ContentType="${WML}.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${WML}.styles+xml"/>`
    if (this.numXml.length) {
      docPart.rel('numbering', 'numbering.xml')
      files.set('word/numbering.xml', `${XML_HEAD}<w:numbering ${NS}>${this.abstractNums.join('')}${this.numXml.join('')}</w:numbering>`)
      overrides += `<Override PartName="/word/numbering.xml" ContentType="${WML}.numbering+xml"/>`
    }
    for (const [path, { part, xml }] of this.hf) {
      files.set('word/' + path, xml)
      if (part.rels.length) files.set(part.relsPath, part.relsXml())
      overrides += `<Override PartName="/word/${path}" ContentType="${WML}.${path.startsWith('header') ? 'header' : 'footer'}+xml"/>`
    }
    for (const [name, bytes] of await this.media.bytes()) files.set(name, bytes)
    files.set(
      '[Content_Types].xml',
      `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${mediaTypes(this.media.files.keys())}${overrides}</Types>`,
    )
    files.set(
      '_rels/.rels',
      `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    )
    files.set('word/document.xml', documentXml)
    files.set('word/styles.xml', stylesXml)
    files.set(docPart.relsPath, docPart.relsXml())
    return writeZip(files, `${WML}.document`)
  }
}

/** Converts an opened Pages package to a DOCX file. */
export function pagesToDocx(pkg: IworkPackage): Promise<Blob> {
  return new PagesConverter(pkg).convert()
}

