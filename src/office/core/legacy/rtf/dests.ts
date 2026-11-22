/** Destinations with content of their own: headers / footers, notes, bookmarks, fields, pictures, shapes. */
import { Part } from '../../iwork/ooxml'
import { escAttr } from '../../raw'
import { HexSink } from './lexer'
import { type Field, type HfKind, type Item, type Shape, type State, Story } from './model'
import { drawingXml, pictImage, pictureGraphic, textBoxGraphic, type Anchor, type Pict } from './pictures'
import type { RtfReader } from './reader'
import { D_NONE, D_PICT, D_STORY, D_TEXT, TextAcc } from './text'

/** a bookmark name, as Word keeps them */
const markName = (s: string) => s.trim().slice(0, 40)

/** the link of a HYPERLINK field instruction */
function hyperlink(instr: string): string | undefined {
  const toks: string[] = []
  for (const m of instr.matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)) toks.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2])
  let url: string | undefined
  let anchor: string | undefined
  for (let k = 1; k < toks.length; k++) {
    const t = toks[k]
    if (/^\\[a-z]$/i.test(t)) {
      const sw = t[1].toLowerCase()
      if (sw === 'l') anchor = toks[++k]
      else if (sw === 'o' || sw === 't' || sw === 'm') k++
    } else if (url === undefined) url = t
  }
  if (url) return 'r:' + url + (anchor ? '#' + anchor : '')
  return anchor ? 'a:' + anchor : undefined
}

/** a header or footer group */
export function headerFooter(r: RtfReader, kind: HfKind) {
  const st = r.st
  if (st.story !== r.body || st.dest !== D_STORY) {
    r.skip()
    return
  }
  r.flushRun()
  const tag = kind.startsWith('header') ? 'header' : 'footer'
  const part = new Part(`word/${tag}${++r.hfCount[tag]}.xml`)
  const story = new Story(part, 'hdr')
  st.story = story
  st.link = undefined
  st.onEnd = (s) => {
    r.sect.hf[kind] = { xml: r.finishStory(story, s), part }
  }
}

export function footnote(r: RtfReader) {
  const st = r.st
  if (st.dest !== D_STORY || st.story.kind === 'note' || st.story.kind === 'hdr') {
    r.skip()
    return
  }
  r.flushRun()
  const ref: Item = { xml: '', link: st.link }
  st.story.items.push(ref)
  const story = new Story(r.notePart, 'note')
  story.note = { end: false }
  const rPr = r.ftnRPr ?? '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>'
  r.ftnRPr = undefined
  st.story = story
  st.link = undefined
  st.onEnd = (s) => {
    const end = story.note!.end
    const blocks = r.finishStory(story, s)
    const list = end ? r.endnotes : r.footnotes
    const id = list.length + 1
    const tag = end ? 'endnote' : 'footnote'
    list.push(`<w:${tag} w:id="${id}">${blocks}</w:${tag}>`)
    ref.xml = `<w:r>${rPr}<w:${tag}Reference w:id="${id}"/></w:r>`
  }
}

/** \chftn: the note's mark (in a note), or the mark of the note that follows (in the text) */
export function noteMark(r: RtfReader) {
  const st = r.st
  if (st.dest !== D_STORY) return
  const note = st.story.note
  if (note) r.item(`<w:r>${r.rPrOf(st)}<w:${note.end ? 'endnoteRef' : 'footnoteRef'}/></w:r>`)
  else r.ftnRPr = r.rPrOf(st) || undefined
}

export function bookmark(r: RtfReader, start: boolean, name: string) {
  const st = r.st
  const n = markName(name)
  if (!n || st.dest !== D_STORY) return
  if (start) {
    if (r.marks.has(n)) return
    const id = r.annId++
    r.marks.set(n, id)
    r.openMarks.add(id)
    r.item(`<w:bookmarkStart w:id="${id}" w:name="${escAttr(n)}"/>`)
  } else {
    const id = r.marks.get(n)
    if (id === undefined || !r.openMarks.has(id)) return
    r.openMarks.delete(id)
    r.item(`<w:bookmarkEnd w:id="${id}"/>`)
  }
}

export function fieldBegin(r: RtfReader) {
  const st = r.st
  const f: Field = { instr: new TextAcc(), outer: st.dest === D_TEXT ? st.acc : undefined, result: false, mark: -1, para: -1 }
  if (r.fields.length > 32) {
    r.skip()
    return
  }
  r.fields.push(f)
  st.onEnd = () => fieldEnd(r, f)
}

export function fieldResult(r: RtfReader) {
  const st = r.st
  const f = r.fields[r.fields.length - 1]
  if (!f) return
  f.result = true
  if (f.outer) {
    st.dest = D_TEXT
    st.acc = f.outer
    return
  }
  if (st.dest !== D_STORY) return
  const instr = f.instr.text()
  const name = /^\s*([A-Za-z]+)/.exec(instr)?.[1].toUpperCase()
  if (name === 'HYPERLINK') {
    const link = hyperlink(instr)
    if (link) {
      st.link = link
      r.dirty = true
    }
    f.kind = 'link'
  } else if (name === 'PAGE' || name === 'NUMPAGES' || name === 'SECTIONPAGES') {
    r.flushRun()
    f.kind = 'page'
    f.story = st.story
    f.mark = st.story.items.length
    f.para = st.story.paras
  }
}

function fieldEnd(r: RtfReader, f: Field) {
  const k = r.fields.lastIndexOf(f)
  if (k >= 0) r.fields.length = k
  const instr = f.instr.text().trim()
  const page = /^(PAGE|NUMPAGES|SECTIONPAGES)\b/i.test(instr)
  if (!page || f.outer) return
  const st = r.st
  r.flushRun()
  const attr = escAttr(` ${instr} `)
  const story = f.story
  if (f.kind === 'page' && story && story.paras === f.para && f.mark <= story.items.length) {
    const inner = story.items.splice(f.mark)
    const xml = inner.map((i) => i.xml).join('') || `<w:r>${r.rPrOf(st)}<w:t>1</w:t></w:r>`
    story.items.push({ xml: `<w:fldSimple w:instr="${attr}">${xml}</w:fldSimple>`, link: inner[0]?.link })
  } else if (!f.result) r.item(`<w:fldSimple w:instr="${attr}"><w:r>${r.rPrOf(st)}<w:t>1</w:t></w:r></w:fldSimple>`)
}

export function pictBegin(r: RtfReader) {
  const st = r.st
  const p: Pict = { data: new HexSink() }
  r.pict = p
  st.dest = D_PICT
  st.onEnd = (s) => pictEnd(r, p, s)
}

function pictEnd(r: RtfReader, p: Pict, s: State) {
  if (r.pict === p) r.pict = undefined
  const img = p.kind === 'mac' || p.kind === 'other' ? undefined : pictImage(p)
  if (s.pictTo) {
    if (img) s.pictTo.img = img
    return
  }
  if (s.shppict) r.shppict = img ? 'ok' : 'fail'
  if (!img) return
  const st = r.st
  if (st.dest !== D_STORY) return
  const name = r.media.name(img)
  const rid = st.story.part.rel('image', 'media/' + name)
  const id = r.media.id()
  r.item(`<w:r>${drawingXml(id, img.w, img.h, pictureGraphic(id, rid, img), 'Picture')}</w:r>`)
}

export function shapeBegin(r: RtfReader, group: boolean) {
  const st = r.st
  r.flushRun()
  const parent = r.shapes[r.shapes.length - 1]
  const story = st.dest === D_STORY ? st.story : parent?.story
  const sh: Shape = { l: 0, t: 0, r: 0, b: 0, behind: false, z: 0, props: new Map(), group, story }
  r.shapes.push(sh)
  st.dest = D_NONE
  st.onEnd = () => shapeEnd(r, sh)
}

function shapeEnd(r: RtfReader, sh: Shape) {
  const k = r.shapes.lastIndexOf(sh)
  if (k >= 0) r.shapes.length = k
  const parent = r.shapes[r.shapes.length - 1]
  const story = sh.story
  if ((!sh.img && sh.txt === undefined) || !story) return
  if (parent) parent.shown = true
  const pr = sh.props
  const w = sh.r - sh.l > 0 ? sh.r - sh.l : (sh.img?.w ?? 1440)
  const h = sh.b - sh.t > 0 ? sh.b - sh.t : (sh.img?.h ?? 720)
  let anchor: Anchor | undefined
  if (!parent && pr.get('fPseudoInline') !== '1') {
    const relH = sh.relH ?? ['margin', 'page', 'column', 'character'][Number(pr.get('posrelh') ?? 2)] ?? 'column'
    const relV = sh.relV ?? ['margin', 'page', 'paragraph', 'line'][Number(pr.get('posrelv') ?? 2)] ?? 'paragraph'
    anchor = { x: sh.l, y: sh.t, relH, relV, wrap: sh.wr ?? 2, wrapSide: sh.wrk, behind: sh.behind || pr.get('fBehindDocument') === '1', z: sh.z }
  }
  const id = r.media.id()
  let graphic: string
  if (sh.img) {
    const rid = story.part.rel('image', 'media/' + r.media.name(sh.img))
    graphic = pictureGraphic(id, rid, sh.img, w, h)
  } else {
    const color = (v: string | undefined, d: string | undefined) => {
      const n = v === undefined ? NaN : Number(v)
      if (!Number.isFinite(n) || n < 0 || n > 0xffffff) return d
      return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()
    }
    const fill = pr.get('fFilled') === '0' ? undefined : color(pr.get('fillColor'), 'FFFFFF')
    const line = pr.get('fLine') === '0' ? undefined : color(pr.get('lineColor'), '000000')
    const n = (key: string, d: number) => {
      const v = Number(pr.get(key))
      return Number.isFinite(v) && v >= 0 ? v : d
    }
    graphic = textBoxGraphic(w, h, sh.txt ?? '', fill, line, n('lineWidth', 9525), [n('dxTextLeft', 91440), n('dyTextTop', 45720), n('dxTextRight', 91440), n('dyTextBottom', 45720)])
  }
  const drawing = drawingXml(id, w, h, graphic, sh.img ? 'Picture' : 'Text Box', anchor)
  if (r.st.dest === D_STORY && r.st.story === story) r.item(`<w:r>${drawing}</w:r>`)
  else {
    r.flushRun()
    story.items.push({ xml: `<w:r>${drawing}</w:r>` })
  }
}

/** \shptxt: the text of a text box */
export function shapeText(r: RtfReader) {
  const st = r.st
  const sh = r.shapes[r.shapes.length - 1]
  if (!sh) {
    r.skip()
    return
  }
  const story = new Story(st.story.part, 'box')
  st.story = story
  st.dest = D_STORY
  st.link = undefined
  st.onEnd = (s) => {
    sh.txt = r.finishStory(story, s)
  }
}

/** \shprslt: what a reader without shapes shows, skipped when the shape is shown */
export function shapeResult(r: RtfReader) {
  const sh = r.shapes[r.shapes.length - 1]
  if (sh && (sh.img || sh.txt !== undefined || sh.shown)) r.skip()
  else r.st.dest = D_STORY
}
