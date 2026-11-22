/**
 * Character and paragraph properties as RTF states them, and their WordprocessingML.
 *
 * RTF body text states its formatting in full (`\plain` / `\pard` reset to the defaults, `\sN` only names the style),
 * so a run or paragraph is written as its difference from what its Word style gives: properties equal to the
 * style's are left out, and a property the style sets that the text does not is written back to the default.
 */
import { HIGHLIGHT } from '../../docx/styles'
import { escAttr } from '../../raw'

export type Side = 't' | 'l' | 'b' | 'r' | 'btw' | 'h' | 'v'

export interface Border {
  /** WordprocessingML border style ('single', 'double', 'nil'…) */
  style?: string
  /** width (twips) */
  w?: number
  /** color table index */
  cf?: number
  /** space to the text (twips) */
  sp?: number
}

/** pattern shading: background and foreground color indexes, foreground percentage (×100) */
export interface Shade {
  bg?: number
  fg?: number
  pct?: number
}

export interface Chp {
  f?: number
  /** East Asian font (`\dbch\afN`) */
  fEA?: number
  /** half-points */
  fs?: number
  b?: boolean
  i?: boolean
  caps?: boolean
  scaps?: boolean
  strike?: boolean
  dstrike?: boolean
  outl?: boolean
  shad?: boolean
  embo?: boolean
  impr?: boolean
  v?: boolean
  /** underline kind (w:u values) */
  ul?: string
  ulc?: number
  cf?: number
  hl?: number
  shd?: Shade
  va?: 'superscript' | 'subscript' | 'baseline'
  /** raised (+) / lowered (−) half-points */
  up?: number
  /** character spacing (twips) */
  expnd?: number
  scale?: number
  kern?: number
  /** character style */
  cs?: number
  /** tracked changes: inserted / deleted text, the author (\revtbl index) and date (DTTM) of each */
  ins?: boolean
  insA?: number
  insD?: number
  del?: boolean
  delA?: number
  delD?: number
}

export interface Tab {
  pos: number
  kind?: string
  leader?: string
}

/** legacy (Word 6/95) paragraph numbering: `{\*\pn …}` */
export interface Pn {
  /** 'blt' (bullet), 'body' (numbered), 'cont' (no number), or the outline level 1-9 */
  lvl?: string | number
  fmt?: string
  start?: number
  before?: string
  after?: string
  f?: number
  fs?: number
  b?: boolean
  i?: boolean
  indent?: number
}

/** a frame: a paragraph positioned on the page (\absw, \posx, \pvpg…) */
export interface Frame {
  w?: number
  /** > 0 at least, < 0 exactly */
  h?: number
  x?: number
  y?: number
  xAlign?: string
  yAlign?: string
  hAnchor?: string
  vAnchor?: string
  hSpace?: number
  vSpace?: number
  wrap?: string
  lock?: boolean
}

export interface Pap {
  s?: number
  jc?: string
  li?: number
  ri?: number
  fi?: number
  sb?: number
  sa?: number
  sbauto?: boolean
  saauto?: boolean
  sl?: number
  slmult?: boolean
  keepn?: boolean
  keep?: boolean
  pagebb?: boolean
  widctl?: boolean
  contextual?: boolean
  outline?: number
  shd?: Shade
  brdr?: Partial<Record<Side, Border>>
  tabs?: Tab[]
  intbl?: boolean
  itap?: number
  ls?: number
  ilvl?: number
  pn?: Pn
  rtl?: boolean
  frame?: Frame
}

export interface Font {
  name: string
  charset?: number
  cpg?: number
}

/** what properties refer to: the font and color tables */
export interface Tables {
  fonts: Map<number, Font>
  colors: (string | undefined)[]
}

// ---------------------------------------------------------------- colors, borders, shading

const HL = Object.entries(HIGHLIGHT).map(([name, hex]) => [name, hex.slice(1).toUpperCase()] as const)

export const colorOf = (t: Tables, idx: number | undefined): string | undefined => (idx === undefined ? undefined : t.colors[idx])

/** the highlight name of a color, when it is one of Word's highlight colors */
export function highlightName(hex: string | undefined): string | undefined {
  return hex ? HL.find(([, h]) => h === hex)?.[0] : undefined
}

function mix(a: string, b: string, k: number): string {
  let out = ''
  for (let i = 0; i < 6; i += 2) {
    const x = parseInt(a.slice(i, i + 2), 16)
    const y = parseInt(b.slice(i, i + 2), 16)
    out += Math.round(x + (y - x) * k).toString(16).padStart(2, '0')
  }
  return out.toUpperCase()
}

/** the fill color of a pattern shading; undefined: none */
export function shadeFill(t: Tables, s: Shade | undefined): string | undefined {
  if (!s) return undefined
  const bg = colorOf(t, s.bg)
  const pct = Math.max(0, Math.min(10000, s.pct ?? 0)) / 10000
  if (!pct) return bg
  return mix(bg ?? 'FFFFFF', colorOf(t, s.fg) ?? '000000', pct)
}

export const shdXml = (fill: string | undefined) => `<w:shd w:val="clear" w:color="auto" w:fill="${fill ?? 'auto'}"/>`

/** a border element (`tag`: top, left, insideH…) */
export function borderXml(t: Tables, tag: string, b: Border | undefined): string {
  if (!b || b.style === 'nil' || b.style === 'none') return `<w:${tag} w:val="nil"/>`
  const sz = b.w === undefined ? 4 : Math.max(2, Math.min(96, Math.round((b.w * 8) / 20)))
  const sp = Math.max(0, Math.min(31, Math.round((b.sp ?? 0) / 20)))
  return `<w:${tag} w:val="${b.style ?? 'single'}" w:sz="${sz}" w:space="${sp}" w:color="${colorOf(t, b.cf) ?? 'auto'}"/>`
}

/** RTF border kinds → w:val */
export const BORDER: Record<string, string> = {
  brdrs: 'single', brdrth: 'thick', brdrsh: 'single', brdrdb: 'double', brdrdot: 'dotted', brdrdash: 'dashed',
  brdrhair: 'single', brdrinset: 'inset', brdroutset: 'outset', brdrtriple: 'triple', brdrtnthsg: 'thinThickSmallGap',
  brdrthtnsg: 'thickThinSmallGap', brdrtnthtnsg: 'thinThickThinSmallGap', brdrtnthmg: 'thinThickMediumGap',
  brdrthtnmg: 'thickThinMediumGap', brdrtnthtnmg: 'thinThickThinMediumGap', brdrtnthlg: 'thinThickLargeGap',
  brdrthtnlg: 'thickThinLargeGap', brdrtnthtnlg: 'thinThickThinLargeGap', brdrwavy: 'wave', brdrwavydb: 'doubleWave',
  brdrdashsm: 'dashSmallGap', brdrdashd: 'dotDash', brdrdashdd: 'dotDotDash', brdremboss: 'threeDEmboss',
  brdrengrave: 'threeDEngrave', brdrframe: 'single', brdrdashdotstr: 'dashDotStroked', brdrnone: 'nil', brdrnil: 'nil',
  brdrtbl: 'nil',
}

// ---------------------------------------------------------------- run properties

const onOff = (tag: string, v: boolean | undefined) => (v ? `<w:${tag}/>` : `<w:${tag} w:val="0"/>`)

type Frag<T> = { fields: (keyof T)[]; xml: (x: T, t: Tables) => string }

const R_KEYS: Frag<Chp>[] = [
  {
    fields: ['f', 'fEA'],
    xml: (c, t) => {
      const f = c.f === undefined ? undefined : t.fonts.get(c.f)?.name
      const ea = c.fEA === undefined ? undefined : t.fonts.get(c.fEA)?.name
      if (!f && !ea) return ''
      const a = escAttr(f ?? ea!)
      return `<w:rFonts w:ascii="${a}" w:hAnsi="${a}" w:eastAsia="${escAttr(ea ?? f!)}" w:cs="${a}"/>`
    },
  },
  { fields: ['b'], xml: (c) => (c.b ? '<w:b/><w:bCs/>' : '<w:b w:val="0"/><w:bCs w:val="0"/>') },
  { fields: ['i'], xml: (c) => (c.i ? '<w:i/><w:iCs/>' : '<w:i w:val="0"/><w:iCs w:val="0"/>') },
  { fields: ['caps'], xml: (c) => onOff('caps', c.caps) },
  { fields: ['scaps'], xml: (c) => onOff('smallCaps', c.scaps) },
  { fields: ['strike'], xml: (c) => onOff('strike', c.strike) },
  { fields: ['dstrike'], xml: (c) => onOff('dstrike', c.dstrike) },
  { fields: ['outl'], xml: (c) => onOff('outline', c.outl) },
  { fields: ['shad'], xml: (c) => onOff('shadow', c.shad) },
  { fields: ['embo'], xml: (c) => onOff('emboss', c.embo) },
  { fields: ['impr'], xml: (c) => onOff('imprint', c.impr) },
  { fields: ['v'], xml: (c) => onOff('vanish', c.v) },
  { fields: ['cf'], xml: (c, t) => `<w:color w:val="${colorOf(t, c.cf) ?? 'auto'}"/>` },
  { fields: ['expnd'], xml: (c) => `<w:spacing w:val="${c.expnd ?? 0}"/>` },
  { fields: ['scale'], xml: (c) => `<w:w w:val="${Math.max(1, Math.min(600, c.scale ?? 100))}"/>` },
  { fields: ['kern'], xml: (c) => `<w:kern w:val="${Math.max(0, c.kern ?? 0)}"/>` },
  { fields: ['up'], xml: (c) => `<w:position w:val="${c.up ?? 0}"/>` },
  {
    fields: ['fs'],
    xml: (c) => {
      const v = Math.max(2, Math.min(3276, c.fs ?? 24))
      return `<w:sz w:val="${v}"/><w:szCs w:val="${v}"/>`
    },
  },
  {
    fields: ['hl'],
    xml: (c, t) => {
      const name = highlightName(colorOf(t, c.hl))
      return `<w:highlight w:val="${name ?? 'none'}"/>`
    },
  },
  {
    fields: ['ul', 'ulc'],
    xml: (c, t) => {
      const col = c.ul && c.ul !== 'none' ? colorOf(t, c.ulc) : undefined
      return `<w:u w:val="${c.ul ?? 'none'}"${col ? ` w:color="${col}"` : ''}/>`
    },
  },
  {
    // a highlight color Word has no name for is shown as shading
    fields: ['shd', 'hl'],
    xml: (c, t) => {
      const hl = colorOf(t, c.hl)
      return shdXml(shadeFill(t, c.shd) ?? (hl && !highlightName(hl) ? hl : undefined))
    },
  },
  { fields: ['va'], xml: (c) => `<w:vertAlign w:val="${c.va ?? 'baseline'}"/>` },
]

/** run properties that differ between `run` and `base` (both complete: the defaults filled in) */
export function rPrDiff(t: Tables, run: Chp, base: Chp): string {
  let x = ''
  for (const k of R_KEYS) {
    const r = k.xml(run, t)
    if (r && r !== k.xml(base, t)) x += r
  }
  return x
}

/** run properties a style sets itself (`own`), where they differ from its parent's (`parent`, complete) */
export function rPrOwn(t: Tables, own: Chp, parent: Chp): string {
  let x = ''
  const full = { ...parent, ...own }
  for (const k of R_KEYS) {
    if (!k.fields.some((f) => own[f] !== undefined)) continue
    const r = k.xml(full, t)
    if (r && r !== k.xml(parent, t)) x += r
  }
  return x
}

/** every run property set (numbering levels) */
export function rPrSet(t: Tables, c: Chp): string {
  let x = ''
  for (const k of R_KEYS) if (k.fields.some((f) => c[f] !== undefined)) x += k.xml(c, t)
  return x
}

// ---------------------------------------------------------------- paragraph properties

const SIDES: [Side, string][] = [['t', 'top'], ['l', 'left'], ['b', 'bottom'], ['r', 'right'], ['btw', 'between']]

const borderKey = (b: Border | undefined) => (b && b.style !== 'nil' && b.style !== 'none' ? `${b.style}/${b.w}/${b.cf}/${b.sp}` : '')

function spacingXml(p: Pap): string {
  let x = `<w:spacing w:before="${Math.max(0, p.sb ?? 0)}" w:after="${Math.max(0, p.sa ?? 0)}"`
  if (p.sbauto) x += ' w:beforeAutospacing="1"'
  if (p.saauto) x += ' w:afterAutospacing="1"'
  const sl = p.sl ?? 0
  // \sl0 and the "auto" values Word writes (\sl240\slmult1 is single spacing)
  if (!sl || sl === 1000) x += ' w:line="240" w:lineRule="auto"'
  else if (p.slmult) x += ` w:line="${Math.abs(sl)}" w:lineRule="auto"`
  else x += ` w:line="${Math.abs(sl)}" w:lineRule="${sl < 0 ? 'exact' : 'atLeast'}"`
  return x + '/>'
}

function indXml(p: Pap): string {
  const fi = p.fi ?? 0
  return `<w:ind w:left="${p.li ?? 0}" w:right="${p.ri ?? 0}" ${fi < 0 ? `w:hanging="${-fi}"` : `w:firstLine="${fi}"`}/>`
}

/** w:framePr of a frame ('' when the paragraph is not positioned: wrapping alone does not make a frame) */
function framePr(f: Frame | undefined): string {
  if (!f) return ''
  if (!f.w && f.x === undefined && f.y === undefined && !f.xAlign && !f.yAlign && !f.hAnchor && !f.vAnchor) return ''
  let x = '<w:framePr'
  if (f.w) x += ` w:w="${Math.abs(f.w)}"`
  if (f.h) x += ` w:h="${Math.abs(f.h)}" w:hRule="${f.h < 0 ? 'exact' : 'atLeast'}"`
  if (f.hSpace) x += ` w:hSpace="${Math.abs(f.hSpace)}"`
  if (f.vSpace) x += ` w:vSpace="${Math.abs(f.vSpace)}"`
  if (f.wrap) x += ` w:wrap="${f.wrap}"`
  x += ` w:hAnchor="${f.hAnchor ?? 'text'}" w:vAnchor="${f.vAnchor ?? 'text'}"`
  if (f.xAlign) x += ` w:xAlign="${f.xAlign}"`
  else if (f.x !== undefined) x += ` w:x="${f.x}"`
  if (f.yAlign) x += ` w:yAlign="${f.yAlign}"`
  else if (f.y !== undefined) x += ` w:y="${f.y}"`
  if (f.lock) x += ' w:anchorLock="1"'
  return x + '/>'
}

const P_KEYS: Frag<Pap>[] = [
  { fields: ['keepn'], xml: (p) => onOff('keepNext', p.keepn) },
  { fields: ['keep'], xml: (p) => onOff('keepLines', p.keep) },
  { fields: ['pagebb'], xml: (p) => onOff('pageBreakBefore', p.pagebb) },
  { fields: ['frame'], xml: (p) => framePr(p.frame) },
  { fields: ['widctl'], xml: (p) => onOff('widowControl', p.widctl) },
]
const P_KEYS2: Frag<Pap>[] = [
  { fields: ['rtl'], xml: (p) => onOff('bidi', p.rtl) },
  { fields: ['sb', 'sa', 'sbauto', 'saauto', 'sl', 'slmult'], xml: spacingXml },
  { fields: ['li', 'ri', 'fi'], xml: indXml },
  { fields: ['contextual'], xml: (p) => onOff('contextualSpacing', p.contextual) },
  { fields: ['jc'], xml: (p) => `<w:jc w:val="${p.jc ?? 'left'}"/>` },
  { fields: ['outline'], xml: (p) => `<w:outlineLvl w:val="${p.outline === undefined ? 9 : Math.max(0, Math.min(9, p.outline))}"/>` },
]

function bordersDiff(t: Tables, p: Pap, base: Pap | undefined): string {
  let x = ''
  for (const [side, tag] of SIDES) {
    const b = p.brdr?.[side]
    const k = borderKey(b)
    const bk = borderKey(base?.brdr?.[side])
    if (k === bk) continue
    x += k ? borderXml(t, tag, b) : `<w:${tag} w:val="nil"/>`
  }
  return x ? `<w:pBdr>${x}</w:pBdr>` : ''
}

const TAB_KIND: Record<string, string> = { tqr: 'right', tqc: 'center', tqdec: 'decimal', tb: 'bar' }
const TAB_LEADER: Record<string, string> = { tldot: 'dot', tlhyph: 'hyphen', tlul: 'underscore', tlth: 'heavy', tleq: 'middleDot', tlmdot: 'middleDot' }
export const tabKind = (w: string) => TAB_KIND[w]
export const tabLeader = (w: string) => TAB_LEADER[w]

const tabKey = (tabs: Tab[] | undefined) => (tabs ?? []).map((x) => `${x.pos}${x.kind ?? ''}${x.leader ?? ''}`).join(',')

function tabsDiff(p: Pap, base: Pap | undefined): string {
  if (tabKey(p.tabs) === tabKey(base?.tabs)) return ''
  const mine = p.tabs ?? []
  const items = mine.map((x) => ({ pos: x.pos, xml: `<w:tab w:val="${x.kind ?? 'left'}"${x.leader ? ` w:leader="${x.leader}"` : ''} w:pos="${x.pos}"/>` }))
  for (const x of base?.tabs ?? []) if (!mine.some((m) => m.pos === x.pos)) items.push({ pos: x.pos, xml: `<w:tab w:val="clear" w:pos="${x.pos}"/>` })
  if (!items.length) return ''
  items.sort((a, b) => a.pos - b.pos)
  return `<w:tabs>${items.map((x) => x.xml).join('')}</w:tabs>`
}

export interface PPrExtra {
  style?: string
  numPr?: string
  /** paragraph mark run properties */
  rPr?: string
  sectPr?: string
}

function pPrBody(t: Tables, keys: (k: Frag<Pap>) => string, p: Pap, base: Pap | undefined, e: PPrExtra): string {
  let x = e.style ? `<w:pStyle w:val="${e.style}"/>` : ''
  for (const k of P_KEYS) x += keys(k)
  if (e.numPr) x += e.numPr
  x += bordersDiff(t, p, base)
  const fill = shadeFill(t, p.shd)
  if (fill !== shadeFill(t, base?.shd)) x += shdXml(fill)
  x += tabsDiff(p, base)
  for (const k of P_KEYS2) x += keys(k)
  if (e.rPr) x += `<w:rPr>${e.rPr}</w:rPr>`
  if (e.sectPr) x += e.sectPr
  return x
}

/** w:pPr of a paragraph (complete properties) against what its style gives (complete) */
export function pPrDiff(t: Tables, p: Pap, base: Pap, e: PPrExtra = {}): string {
  const x = pPrBody(t, (k) => {
    const r = k.xml(p, t)
    return r !== k.xml(base, t) ? r : ''
  }, p, base, e)
  return x ? `<w:pPr>${x}</w:pPr>` : ''
}

/** w:ind of a numbering level */
export const levelInd = (p: Pap) => (p.li !== undefined || p.fi !== undefined ? indXml(p) : '')
