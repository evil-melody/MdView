/**
 * HTML → paragraphs of formatted runs: clipboard HTML (main thread, parsed by the browser's DOMParser) and HTML files
 * (also in the worker, where a small DOM-free parser reads them).
 */
import type { Inline, RunSet, RunStyle } from './docx/types'
import { cssFont } from './fonts'
import { safeHref } from './url'

export interface PastedPara {
  runs: Inline[]
  heading?: number
  list?: 'bullet' | 'number'
}

type StyleKey = 'fontWeight' | 'fontStyle' | 'textDecoration' | 'textDecorationLine' | 'color' | 'backgroundColor' | 'fontSize' | 'fontFamily' | 'verticalAlign'
type HStyle = Partial<Record<StyleKey, string>>

/** What the conversion reads of a node: a DOM node, or one of the light parser's */
interface HNode {
  readonly nodeType: number
  readonly textContent: string | null
  readonly childNodes: ArrayLike<HNode>
}
interface HElement extends HNode {
  readonly tagName: string
  readonly style: HStyle
  getAttribute(name: string): string | null
}

type Ctx = RunStyle & { href?: string; fontName?: string }

const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'UL', 'OL', 'TABLE', 'TBODY', 'THEAD', 'DL', 'DT', 'DD', 'FIGURE'])
const SKIP = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TITLE', 'META', 'LINK', 'NOSCRIPT', 'TEMPLATE'])

function hex(color: string | null | undefined): string | undefined {
  if (!color) return undefined
  const c = color.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(c)) return c
  if (/^#[0-9a-f]{3}$/.test(c)) return '#' + [...c.slice(1)].map((x) => x + x).join('')
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c)
  if (m) {
    if (m[4] !== undefined && Number(m[4]) === 0) return undefined
    return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')
  }
  return undefined
}

function sizePt(v: string): number | undefined {
  const m = /^([\d.]+)(pt|px|em|rem)?$/.exec(v.trim())
  if (!m) return undefined
  const n = Number(m[1])
  return m[2] === 'px' ? n * 0.75 : m[2] === 'em' || m[2] === 'rem' ? n * 11 : n
}

function styleOf(el: HElement, base: Ctx): Ctx {
  const s: Ctx = { ...base }
  switch (el.tagName) {
    case 'B':
    case 'STRONG':
      s.b = true
      break
    case 'I':
    case 'EM':
      s.i = true
      break
    case 'U':
    case 'INS':
      s.u = 'single'
      break
    case 'S':
    case 'STRIKE':
    case 'DEL':
      s.strike = true
      break
    case 'SUP':
      s.va = 'sup'
      break
    case 'SUB':
      s.va = 'sub'
      break
    case 'A': {
      const href = safeHref(el.getAttribute('href')?.trim())
      if (href) {
        s.href = href
        s.u = 'single'
        s.color = '#0563c1'
      }
      break
    }
    case 'FONT': {
      const c = hex(el.getAttribute('color'))
      if (c) s.color = c
      const f = el.getAttribute('face')
      if (f) s.fontName = f.split(',')[0].replace(/['"]/g, '').trim()
      break
    }
    case 'CODE':
    case 'KBD':
      s.fontName = 'Courier New'
      break
  }
  const st = el.style
  if (st.fontWeight) s.b = st.fontWeight === 'bold' || st.fontWeight === 'bolder' || Number(st.fontWeight) >= 600
  if (st.fontStyle) s.i = st.fontStyle === 'italic' || st.fontStyle === 'oblique'
  const deco = `${st.textDecoration ?? ''} ${st.textDecorationLine ?? ''}`
  if (deco.includes('underline')) s.u = 'single'
  if (deco.includes('line-through')) s.strike = true
  if (st.textDecoration === 'none' && el.tagName !== 'A') s.u = undefined
  const c = hex(st.color)
  if (c) s.color = c
  const bg = hex(st.backgroundColor)
  if (bg && bg !== '#ffffff') s.hl = bg
  if (st.fontSize) {
    const pt = sizePt(st.fontSize)
    if (pt && pt >= 4 && pt <= 200) s.sz = Math.round(pt * 2) / 2
  }
  if (st.fontFamily) s.fontName = st.fontFamily.split(',')[0].replace(/['"]/g, '').trim()
  if (st.verticalAlign === 'super') s.va = 'sup'
  else if (st.verticalAlign === 'sub') s.va = 'sub'
  return s
}

function toRun(text: string, c: Ctx): Inline {
  const { href, fontName, ...rest } = c
  const s: RunStyle = { ...rest }
  if (fontName) s.font = cssFont(fontName)
  const d: RunSet = {}
  if (c.b !== undefined) d.b = c.b
  if (c.i !== undefined) d.i = c.i
  if (c.u) d.u = c.u
  if (c.strike) d.strike = true
  if (c.color) d.color = c.color
  if (c.sz) d.sz = c.sz
  if (fontName) d.font = fontName
  if (c.hl) d.hl = c.hl
  if (c.va) d.va = c.va
  return { t: 'text', text, s, d: Object.keys(d).length ? d : undefined, href } as Inline
}

/** Converts HTML (clipboard from Word, Google Docs, web pages; .html files) into paragraphs of formatted runs. */
export function htmlToParas(html: string): PastedPara[] {
  const body: HNode = typeof DOMParser !== 'undefined' ? new DOMParser().parseFromString(html, 'text/html').body : parseHtml(html)
  const out: PastedPara[] = []
  let cur: PastedPara | null = null
  const para = (props: Partial<PastedPara> = {}) => {
    cur = { runs: [], ...props }
    out.push(cur)
    return cur
  }
  const walk = (node: HNode, c: Ctx, list: 'bullet' | 'number' | undefined, pre: boolean) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        let text = child.textContent ?? ''
        if (!pre) text = text.replace(/[\s ]+/g, (m) => (m.includes(' ') && m.length === 1 ? ' ' : ' '))
        if (!text || (!pre && !cur && !text.trim())) continue
        ;(cur ?? para()).runs.push(toRun(text, c))
        continue
      }
      if (child.nodeType !== 1) continue
      const el = child as HElement
      if (SKIP.has(el.tagName)) continue
      if (el.tagName === 'BR') {
        ;(cur ?? para()).runs.push(toRun('\n', c))
        continue
      }
      if (el.tagName === 'TD' || el.tagName === 'TH') {
        if (cur && (cur as PastedPara).runs.length) (cur as PastedPara).runs.push(toRun('\t', c))
        walk(el, styleOf(el, c), list, pre)
        continue
      }
      const st = styleOf(el, c)
      if (BLOCK.has(el.tagName)) {
        const nextList = el.tagName === 'UL' ? 'bullet' : el.tagName === 'OL' ? 'number' : list
        if (el.tagName !== 'UL' && el.tagName !== 'OL' && el.tagName !== 'TABLE' && el.tagName !== 'TBODY' && el.tagName !== 'THEAD') {
          const h = /^H([1-6])$/.exec(el.tagName)
          para({ heading: h ? Number(h[1]) : undefined, list: el.tagName === 'LI' ? nextList ?? 'bullet' : undefined })
        }
        walk(el, st, nextList, pre || el.tagName === 'PRE')
        cur = null
        continue
      }
      walk(el, st, list, pre)
    }
  }
  walk(body, {}, undefined, false)
  // trim whitespace-only edges
  for (const p of out) {
    const first = p.runs[0]
    if (first?.t === 'text') first.text = first.text.replace(/^ +/, '')
    const last = p.runs[p.runs.length - 1]
    if (last?.t === 'text') last.text = last.text.replace(/ +$/, '')
    p.runs = p.runs.filter((r) => r.t !== 'text' || r.text)
  }
  while (out.length && !out[0].runs.length) out.shift()
  while (out.length && !out[out.length - 1].runs.length) out.pop()
  return out
}

// ---------------------------------------------------------------- DOM-free parser (worker)

interface LElement extends HElement {
  childNodes: HNode[]
}

const VOID = new Set(['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'KEYGEN', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR'])
/** content is text up to the end tag (only TEXTAREA's is shown) */
const RAW = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'TITLE', 'XMP', 'IFRAME', 'NOEMBED', 'NOFRAMES', 'NOSCRIPT'])
const HEAD_CONTENT = new Set(['BASE', 'LINK', 'META', 'NOSCRIPT', 'SCRIPT', 'STYLE', 'TEMPLATE', 'TITLE'])
/** start tags that end an open paragraph */
const ENDS_P = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HGROUP', 'HR', 'LI', 'MAIN', 'MENU', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'UL',
])
const SCOPE = ['TABLE', 'TD', 'TH', 'CAPTION', 'HTML', 'TEMPLATE', 'OBJECT', 'BUTTON']
const HEADING = /^H[1-6]$/

/** HTML 4 Latin-1 entities, U+00A0 to U+00FF */
const LATIN1 =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest ' +
  'Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig ' +
  'agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'
const ENTITIES: Record<string, number> = {
  ...Object.fromEntries(LATIN1.split(' ').map((n, k) => [n, 0xa0 + k])),
  amp: 38, lt: 60, gt: 62, quot: 34, apos: 39,
  OElig: 338, oelig: 339, Scaron: 352, scaron: 353, Yuml: 376, fnof: 402, circ: 710, tilde: 732,
  ensp: 8194, emsp: 8195, thinsp: 8201, zwnj: 8204, zwj: 8205, lrm: 8206, rlm: 8207, ndash: 8211, mdash: 8212,
  lsquo: 8216, rsquo: 8217, sbquo: 8218, ldquo: 8220, rdquo: 8221, bdquo: 8222, dagger: 8224, Dagger: 8225, bull: 8226,
  hellip: 8230, permil: 8240, prime: 8242, Prime: 8243, lsaquo: 8249, rsaquo: 8250, euro: 8364, trade: 8482,
  larr: 8592, uarr: 8593, rarr: 8594, darr: 8595, harr: 8596, minus: 8722, infin: 8734, ne: 8800, le: 8804, ge: 8805,
}

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,7}));?/g, (m, dec?: string, hx?: string, name?: string) => {
    if (name) return ENTITIES[name] ? String.fromCharCode(ENTITIES[name]) : m
    const cp = dec ? Number(dec) : parseInt(hx!, 16)
    return cp > 0 && cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff) ? String.fromCodePoint(cp) : '�'
  })
}

/** inline `style` declarations, camel-cased like CSSStyleDeclaration's properties */
function parseStyle(css: string | null): HStyle {
  const st: Record<string, string> = {}
  if (!css) return st
  for (const decl of css.split(';')) {
    const k = decl.indexOf(':')
    if (k < 0) continue
    const prop = decl.slice(0, k).trim().toLowerCase()
    const v = decl.slice(k + 1).replace(/!\s*important\s*$/i, '').trim()
    if (!v) continue
    st[prop.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase())] = v
    if (prop === 'background') {
      const c = /#[0-9a-f]{3}(?:[0-9a-f]{3})?\b|rgba?\([^)]*\)/i.exec(v)
      if (c) st.backgroundColor ??= c[0]
    }
  }
  return st as HStyle
}

const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g

function element(tagName: string, attrText: string): LElement {
  const attrs = new Map<string, string>()
  for (const m of attrText.matchAll(ATTR)) {
    const name = m[1].toLowerCase()
    if (!attrs.has(name)) attrs.set(name, decodeEntities(m[2] ?? m[3] ?? m[4] ?? ''))
  }
  return { nodeType: 1, tagName, textContent: null, childNodes: [], style: parseStyle(attrs.get('style') ?? null), getAttribute: (n) => attrs.get(n.toLowerCase()) ?? null }
}

/**
 * A forgiving HTML parser for where there is no DOMParser (the worker): elements, text and entities, with the
 * end tags HTML lets a file leave out (paragraphs, list items, table rows and cells, the head).
 */
export function parseHtml(html: string): HNode {
  const root = element('#ROOT', '')
  const stack: LElement[] = [root]
  const top = () => stack[stack.length - 1]
  const popTo = (k: number) => void (stack.length = Math.max(k, 1))
  /** closes the nearest open `tags` element, unless one of `until` comes first */
  const closeIn = (tags: string[], until: string[]) => {
    for (let k = stack.length - 1; k > 0; k--) {
      const t = stack[k].tagName
      if (tags.includes(t)) return popTo(k)
      if (until.includes(t)) return
    }
  }
  const leaveHead = () => closeIn(['HEAD'], [])
  const text = (raw: string) => {
    if (!raw) return
    if (/\S/.test(raw)) leaveHead()
    const t = decodeEntities(raw)
    const kids = top().childNodes
    const last = kids[kids.length - 1]
    if (last?.nodeType === 3) kids[kids.length - 1] = { nodeType: 3, textContent: last.textContent + t, childNodes: [] }
    else kids.push({ nodeType: 3, textContent: t, childNodes: [] })
  }
  const open = (tag: string, attrText: string) => {
    if (!HEAD_CONTENT.has(tag) && tag !== 'HEAD' && tag !== 'HTML') leaveHead()
    if (ENDS_P.has(tag)) closeIn(['P'], SCOPE)
    if (tag === 'LI') closeIn(['LI'], [...SCOPE, 'UL', 'OL'])
    else if (tag === 'DD' || tag === 'DT') closeIn(['DD', 'DT'], [...SCOPE, 'DL'])
    else if (tag === 'TR') closeIn(['TR'], ['TABLE', 'THEAD', 'TBODY', 'TFOOT'])
    else if (tag === 'TD' || tag === 'TH') closeIn(['TD', 'TH'], ['TR', 'TABLE'])
    else if (tag === 'THEAD' || tag === 'TBODY' || tag === 'TFOOT') closeIn(['THEAD', 'TBODY', 'TFOOT'], ['TABLE'])
    else if (tag === 'OPTION') closeIn(['OPTION'], ['SELECT'])
    else if (HEADING.test(tag) && HEADING.test(top().tagName)) stack.pop()
    const el = element(tag, attrText)
    top().childNodes.push(el)
    if (!VOID.has(tag)) stack.push(el)
  }
  const n = html.length
  let i = html.charCodeAt(0) === 0xfeff ? 1 : 0
  while (i < n) {
    const lt = html.indexOf('<', i)
    if (lt < 0) {
      text(html.slice(i))
      break
    }
    text(html.slice(i, lt))
    i = lt
    if (html.startsWith('<!--', i)) {
      const e = html.indexOf('-->', i + 4)
      i = e < 0 ? n : e + 3
      continue
    }
    const next = html[i + 1]
    if (next === '!' || next === '?') {
      const e = html.indexOf('>', i)
      i = e < 0 ? n : e + 1
      continue
    }
    const end = next === '/'
    const nameAt = i + (end ? 2 : 1)
    const m = /^[A-Za-z][^\s/>]*/.exec(html.slice(nameAt, nameAt + 64))
    if (!m) {
      text('<')
      i++
      continue
    }
    // the tag ends at the first ">" outside a quoted attribute value
    let j = nameAt + m[0].length
    for (let q = ''; j < n; j++) {
      const ch = html[j]
      if (q) {
        if (ch === q) q = ''
      } else if (ch === '"' || ch === "'") q = ch
      else if (ch === '>') break
    }
    const tag = m[0].toUpperCase()
    const attrText = html.slice(nameAt + m[0].length, j)
    i = j + 1
    if (end) {
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].tagName === tag) {
        popTo(k)
        break
      }
      continue
    }
    open(tag, attrText)
    if (RAW.has(tag)) {
      const close = new RegExp(`</${tag}[\\s/>]`, 'ig')
      close.lastIndex = i
      const e = close.exec(html)
      const content = html.slice(i, e ? e.index : n)
      if (tag === 'TEXTAREA') text(content.replace(/^\r?\n/, ''))
      stack.pop()
      i = e ? (html.indexOf('>', e.index) + 1 || n) : n
    } else if (tag === 'PRE' || tag === 'LISTING') {
      // a newline right after the start tag is not content
      if (html[i] === '\r') i++
      if (html[i] === '\n') i++
    }
  }
  return root
}
