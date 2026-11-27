/** All lengths in points unless stated otherwise. */

export interface RunStyle {
  b?: boolean
  i?: boolean
  /** underline kind ('single', 'double', …) or 'none' */
  u?: string
  strike?: boolean
  dstrike?: boolean
  color?: string
  sz?: number
  font?: string
  /** 原始族名（未 cssFont 化）—— 字体度量内核按族名查 FontRegistry 用 */
  rfont?: string
  /** eastAsia 槽原始族名（CJK 字体度量回退用） */
  rfontEA?: string
  hl?: string
  shd?: string
  va?: 'sup' | 'sub'
  caps?: boolean
  smallCaps?: boolean
  vanish?: boolean
  spacing?: number
}

export interface Border {
  w: number
  style: string
  color: string
}

export interface ParaStyle {
  align?: 'left' | 'center' | 'right' | 'justify'
  indL?: number
  indR?: number
  /** positive: first line indent; negative: hanging */
  indFirst?: number
  before?: number
  after?: number
  line?: number
  lineRule?: 'auto' | 'exact' | 'atLeast'
  shd?: string
  bTop?: Border
  bBottom?: Border
  bLeft?: Border
  bRight?: Border
  keepNext?: boolean
  keepLines?: boolean
  widow?: boolean
  pageBreakBefore?: boolean
  outline?: number
  contextual?: boolean
  snapGrid?: boolean
  autoNameSpace?: boolean
  /** 制表位（pt）；stop = 对齐 + 引导符 */
  tabs?: Tag[]
}

/** w:tab 计算表示：pos 单位 pt，al 缺省 left，leader 缺省 none（ST_TabTlc：WML 词表，非 DrawingML） */
export interface Tag {
  pos: number
  al?: 'left' | 'center' | 'right' | 'decimal' | 'bar' | 'clear'
  leader?: 'none' | 'dot' | 'hyphen' | 'underscore' | 'heavy' | 'middleDot'
}

/** [paragraph id, run ordinal] of the source run in the original XML */
export type SrcRef = [number, number]

/**
 * Direct formatting changed by the user (written back as explicit run properties).
 * null: the run stops setting the property itself, the paragraph style decides.
 */
export interface RunSet {
  b?: boolean | null
  i?: boolean | null
  u?: string | null
  strike?: boolean | null
  color?: string | null
  sz?: number | null
  /** raw font name */
  font?: string | null
  hl?: string | null
  va?: 'sup' | 'sub' | null
}

/**
 * A tracked change on a run (Word's w:ins / w:del / w:moveFrom / w:moveTo).
 * `moveFrom` reads like a deletion, `moveTo` like an insertion; a pair shares `name` (w:name),
 * so accepting / rejecting a move resolves both sides together.
 */
export interface TrackMark {
  k: 'ins' | 'del' | 'moveFrom' | 'moveTo'
  /** the change's w:id in the file */
  id?: string
  author?: string
  /** ISO date */
  date?: string
  /** pairing name shared by a w:moveFrom / w:moveTo pair (w:name) */
  name?: string
}

/**
 * A tracked change of a run's character formatting (Word's w:rPrChange).
 * `s` is the run's look *before* the change (used to restore the rendering on reject and to
 * describe the change in the UI). `d` is the increment that brings the run's base rPr back to
 * that old look — i.e. `oldRPr = baseRPr(src) + applyRunSet(d)`. Keeping `d` base-relative makes
 * the edit path and the read-back path write the same XML. Both are written inside
 * `<w:rPrChange w:id w:author w:date><w:rPr>OLD</w:rPr></w:rPrChange>`.
 */
export interface FmtChange {
  id?: string
  author?: string
  /** ISO date */
  date?: string
  /** the run's look before the format change */
  s: RunStyle
  /** base-relative increment restoring that look (null clears an inherited property) */
  d: RunSet
}

/**
 * The comparable state of a paragraph's format — what a tracked paragraph change is measured by.
 * The values are the ones the paragraph really shows (the style's own values included), so that
 * "changed and changed back" is recognised as no change at all.
 */
export interface ParaFmtState {
  align?: 'left' | 'center' | 'right' | 'justify'
  indL?: number
  before?: number
  after?: number
  line?: number
  /** the paragraph style id */
  style?: string
  /** the list kind the paragraph shows */
  list?: 'bullet' | 'number'
  ilvl?: number
  pageBreak?: boolean
}

/**
 * A snapshot of a paragraph's format before a tracked change (Word's w:pPrChange).
 * `s` is the paragraph's look at that moment (the rendering is restored from it on reject),
 * `d` the base-relative increment that writes that look back — `oldPPr = basePPr(src) + applyParaDirty(d)` —
 * and `st` the state the format now is measured against.
 */
export interface ParaStyleSnapshot {
  /** the paragraph's look before the change */
  s: ParaStyle
  /** base-relative increment restoring that look (null clears an inherited property) */
  d: ParaDirty
  /** the paragraph style id before the change */
  sid?: string
  /** the comparable format state before the change */
  st: ParaFmtState
}

/**
 * A tracked change of a paragraph's properties (Word's w:pPrChange). It is written as
 * `<w:pPrChange w:id w:author w:date><w:pPr>OLD</w:pPr></w:pPrChange>`, the last child of w:pPr.
 */
export interface PPrChange {
  id?: string
  author?: string
  /** ISO date */
  date?: string
  /** the paragraph's format before the change */
  old: ParaStyleSnapshot
  /** the format as of the last change (in memory only: the file keeps the old format) */
  cur?: ParaFmtState
}

/** horizontal / vertical anchor reference (wp:positionH / wp:positionV @relativeFrom) */
export type WrapRel = 'margin' | 'page' | 'column' | 'paragraph' | 'leftMargin' | 'rightMargin' | 'topMargin' | 'bottomMargin' | 'insideMargin' | 'outsideMargin'
export type WrapAlign = 'left' | 'center' | 'right' | 'inside' | 'outside' | 'top' | 'bottom'
/** Word's wrapping kinds (a floating picture is a real wp:anchor) */
export type WrapKind = 'square' | 'tight' | 'behindDoc' | 'inFrontOfText'
export interface WrapPos {
  hRel: WrapRel
  vRel: WrapRel
  /** alignment wins over the matching offset */
  hAlign?: WrapAlign
  vAlign?: WrapAlign
  /** absolute offsets in pt (written as wp:posOffset in EMU) */
  hOff?: number
  vOff?: number
}
export interface WrapSpec {
  kind: WrapKind
  pos: WrapPos
  /** text distance in pt (wp:anchor distT/B/L/R) */
  distT?: number
  distB?: number
  distL?: number
  distR?: number
}

/**
 * Picture crop (a:srcRect), each side in per-mille of the source (10% = 100):
 * the frame keeps its size, the shown part of the picture is stretched to fill it.
 */
export interface Crop {
  l?: number
  t?: number
  r?: number
  b?: number
}

/**
 * Inline content. Tabs and line breaks are carried as '\t' / '\n' inside text.
 * Everything that isn't 'text' counts as one character when editing.
 * `cm`: the comment threads (root ids) whose range covers the run.
 */
export type Inline =
  | { t: 'text'; text: string; s: RunStyle; href?: string; lk?: string; src?: SrcRef; d?: RunSet; cm?: string[]; tc?: TrackMark; fc?: FmtChange }
  | {
      t: 'img'
      cm?: string[]
      target: string
      w: number
      h: number
      alt?: string
      href?: string
      src?: SrcRef
      rid?: string
      resized?: boolean
      /** alt text changed by the user */
      altSet?: boolean
      /** picture replaced (rid points to the new image part) */
      repl?: boolean
      /** floating picture: real wp:anchor wrap + position */
      wrap?: WrapSpec
      /** the user changed the wrap (undefined wrap means "back to inline" on write-back) */
      wrapSet?: boolean
      /** rotation in degrees (written as a:xfrm/@rot = deg * 60000) */
      rot?: number
      /** the user changed the rotation */
      rotSet?: boolean
      /** crop of the source picture (a:srcRect, per-mille per side) */
      crop?: Crop
      /** the user changed the crop (undefined crop means "no crop" on write-back) */
      cropSet?: boolean
      tc?: TrackMark
    }
  | { t: 'field'; kind: 'PAGE' | 'NUMPAGES'; s: RunStyle; src?: SrcRef; tc?: TrackMark; fc?: FmtChange }
  | { t: 'box'; w: number; h: number; blocks: Block[]; fill?: string; border?: string; src?: SrcRef; tc?: TrackMark }
  | { t: 'shape'; w: number; h: number; label?: string; src?: SrcRef; tc?: TrackMark }
  | { t: 'ref'; text: string; s: RunStyle; src?: SrcRef; tc?: TrackMark; fc?: FmtChange }

export interface ListMarker {
  text: string
  s: RunStyle
  /** marker followed by tab (default) */
  tab: boolean
}

export interface Paragraph {
  t: 'p'
  ps: ParaStyle
  runs: Inline[]
  marker?: ListMarker
  /** font size of the paragraph mark, for empty paragraph height */
  markSz?: number
  markFont?: string
  /** explicit page break before this paragraph (from w:br type=page or pageBreakBefore) */
  pb?: boolean
  /** paragraph id (editable paragraphs only); split parts share it */
  pid?: number
  /** read-only (inside fields spanning paragraphs, text boxes, nested tables…) */
  ro?: boolean
  /** paragraph style id */
  sid?: string
  /** list kind + level when numbered */
  lst?: 'bullet' | 'number'
  ilvl?: number
  // ---- editor bookkeeping (main thread) ----
  /** template paragraph (original pid) */
  from?: number
  /** original paragraphs whose bookmarks/comments this one carries */
  orig?: number[]
  /** paragraph-level changes */
  pd?: ParaDirty
  /** tracked change of the paragraph's properties (w:pPrChange) */
  pc?: PPrChange
  /** changed since load */
  edited?: boolean
  /** keeps the template's section break */
  keepSect?: boolean
  /** render version (bumped to force DOM rebuild after IME composition) */
  ver?: number
  /** formatting for text typed into this (empty) paragraph */
  caret?: Inline
}

/** null (alignment, spacing): the paragraph stops setting the property itself, its style decides. */
export interface ParaDirty {
  style?: string
  align?: 'left' | 'center' | 'right' | 'justify' | null
  list?: 'bullet' | 'number' | 'none'
  ilvl?: number
  indL?: number | null
  /** line spacing multiple (1, 1.15, 1.5, 2…) */
  line?: number | null
  /** spacing before / after in pt */
  before?: number | null
  after?: number | null
  pageBreak?: boolean
}

export type SpecRun =
  | { text: string; src?: SrcRef; set?: RunSet; lk?: string; cm?: string[]; tc?: TrackMark; fc?: FmtChange }
  | { obj: 'copy'; src: SrcRef; size?: [number, number]; alt?: string; rid?: string; wrap?: WrapSpec | null; rot?: number; crop?: Crop | null; cm?: string[]; tc?: TrackMark }
  | { obj: 'image'; rid: string; w: number; h: number; name?: string; alt?: string; wrap?: WrapSpec | null; rot?: number; crop?: Crop; cm?: string[] }
  | { obj: 'field'; kind: 'PAGE' | 'NUMPAGES'; set?: RunSet; cm?: string[] }

export interface ParaSpec {
  pid: number
  from: number
  orig?: number[]
  pd?: ParaDirty
  /** tracked change of the paragraph's properties (w:pPrChange) */
  pc?: PPrChange
  /** page-break separated parts */
  parts: SpecRun[][]
  pristine?: boolean
  keepSect?: boolean
}

export interface CellSpec {
  src?: [number, number]
  colSpan: number
  rowSpan: number
  paras: ParaSpec[]
  /** fill colour; 'none' writes "no fill" (over the table style) */
  shd?: string
  /** CSS lines set by the user, per side ('none' for no line) */
  borders?: CellBorders
  vAlign?: 'top' | 'middle' | 'bottom'
}

export interface TableSpec {
  tid: number
  item?: number
  cols: number[]
  rows: { src?: number; h?: number; exact?: boolean; header?: boolean; cells: CellSpec[] }[]
}

export interface TableOp {
  tid: number
  item?: number
  /** paragraph the (new) table follows */
  anchor?: number
  /** null deletes the table */
  spec: TableSpec | null
}

export interface EditOp {
  anchor: number
  list: ParaSpec[]
  remove?: number[]
  /** return re-converted blocks (needed after style/list changes) */
  want?: boolean
}

export interface EditResult {
  blocks: Record<number, Block[]>
  markers: Record<number, { text: string; s: RunStyle; tab: boolean; lst?: 'bullet' | 'number' } | null>
}

/** built-in paragraph styles the picker always offers (created on first use when missing) */
export type CanonStyle = 'normal' | 'title' | 'subtitle' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

export interface StyleInfo {
  id: string
  name: string
  next?: string
  canon?: CanonStyle
  /** heading level 0-8 (outline) */
  outline?: number
  /** run look of the style, for the style picker */
  preview?: { b?: boolean; i?: boolean; color?: string; sz?: number; font?: string }
}

/**
 * The look given to a paragraph style ("update style to match"). Only the properties present are touched;
 * null: the style stops defining the property and takes it from the style it is based on.
 */
export interface StyleLook {
  b?: boolean | null
  i?: boolean | null
  /** underline kind, 'none' for no underline */
  u?: string | null
  strike?: boolean | null
  /** '#rrggbb', or 'auto' */
  color?: string | null
  sz?: number | null
  /** raw font name */
  font?: string | null
  align?: 'left' | 'center' | 'right' | 'justify' | null
  /** line spacing: a multiple, or pt when `lineRule` says so */
  line?: number | null
  lineRule?: 'exact' | 'atLeast'
  /** spacing before / after in pt */
  before?: number | null
  after?: number | null
}

export type HeaderFooters = Pick<DocxMeta, 'header' | 'footer' | 'firstHeader' | 'firstFooter' | 'evenHeader' | 'evenFooter'>

export type HFKind = 'header' | 'footer' | 'firstHeader' | 'firstFooter' | 'evenHeader' | 'evenFooter'

/** one paragraph of a header / footer; `text` may hold {PAGE} and {NUMPAGES} (page number, page count) */
export interface HFLine {
  text: string
  align?: 'left' | 'center' | 'right'
  b?: boolean
  /** font size, pt */
  sz?: number
}

/** a change of the headers / footers of the document (the final section's, used by every page) */
export interface HFSet {
  /** new content per kind; [] empties it */
  parts?: Partial<Record<HFKind, HFLine[]>>
  /** a part's XML as it was (undo) */
  raw?: Partial<Record<HFKind, string>>
  /** different first page */
  titlePg?: boolean
  /** different odd / even pages (w:evenAndOddHeaders in settings.xml) */
  evenAndOddHeaders?: boolean
  /** "record every change" (w:trackChanges in settings.xml) */
  trackChanges?: boolean
}
export interface HFSetResult {
  headers: HeaderFooters
  titlePg: boolean
  /** different odd / even pages as it stands now */
  evenAndOddHeaders: boolean
  /** "record every change" as it stands now */
  trackChanges?: boolean
  /** the change that puts the headers / footers back */
  undo: HFSet
}

export interface StyleSetResult {
  styles: StyleInfo[]
  /** paragraph styles that look different now (the style and those based on it); empty when nothing changed */
  changed: string[]
  /** the look that puts the style back as it was */
  undo: StyleLook
  /** the document has no such paragraph style */
  missing?: boolean
  /** headers / footers converted again, when the document has any */
  headers?: HeaderFooters
}

export interface CellBorders {
  t?: string
  r?: string
  b?: string
  l?: string
}

export interface TableCell {
  blocks: Block[]
  /** [row, tc] index in the original table XML (template for cell properties) */
  src?: [number, number]
  colSpan: number
  rowSpan: number
  /** w:tcW dxa（pt） */
  w?: number
  /** w:tcW pct（百分比，结算基准 = 可用宽） */
  wPct?: number
  shd?: string
  vAlign?: 'top' | 'middle' | 'bottom'
  borders: CellBorders
  pad: [number, number, number, number]
  /** properties changed by the user, written back as the cell's own */
  set?: { shd?: boolean; borders?: boolean; vAlign?: boolean }
}

export interface TableRow {
  cells: TableCell[]
  /** original row index */
  src?: number
  h?: number
  exact?: boolean
  header?: boolean
}

export interface Table {
  t: 'tbl'
  /** body item index of an original top-level table */
  item?: number
  /** set once the table is regenerated by the editor (new or structurally changed) */
  tid?: number
  cols: number[]
  rows: TableRow[]
  align?: 'left' | 'center' | 'right'
  indL?: number
  /** w:tblW dxa（pt） */
  w?: number
  /** w:tblW pct（百分比，结算基准 = 可用宽） */
  wPct?: number
  /** w:tblLayout val（fixed/autofit；缺省 = autofit） */
  layout?: 'fixed' | 'autoFit'
  /** w:tblCellSpacing dxa（pt；无 = undefined） */
  cellSpacing?: number
}

export interface PageSetup {
  w: number
  h: number
  mt: number
  mr: number
  mb: number
  ml: number
  header: number
  footer: number
  /** text columns (absent: one) and the gap between them, in pt */
  cols?: number
  colGap?: number
}

/** a change of the page setup, applied to every section (Word's "whole document"); only the keys present change */
export interface PageSet {
  w?: number
  h?: number
  mt?: number
  mr?: number
  mb?: number
  ml?: number
  cols?: number
  colGap?: number
}

export interface PageSetResult {
  page: PageSetup
  /** the change that puts the page setup back */
  undo: PageSet
}

export interface SectionBreak {
  t: 'sect'
  page: PageSetup
  /**
   * how the section this block ends starts after the one before it: 'nextPage' | 'continuous' | 'evenPage' | 'oddPage'
   * (the break after this block is the next section's kind)
   */
  kind: string
}

export type Block = Paragraph | Table | SectionBreak

export interface DocxMeta {
  page: PageSetup
  /** quick paragraph styles for the style picker */
  styles?: StyleInfo[]
  header?: Block[]
  footer?: Block[]
  firstHeader?: Block[]
  firstFooter?: Block[]
  evenHeader?: Block[]
  evenFooter?: Block[]
  titlePg?: boolean
  /** w:evenAndOddHeaders in settings.xml: even pages use the "even" header / footer parts */
  evenAndOddHeaders?: boolean
  /** w:trackChanges in settings.xml: edits are recorded as tracked changes ("修订") */
  trackChanges?: boolean
  /** settings.xml compatibilityMode（缺省 12 = sdkjs Current；新建表宽预算 nAdd 门控） */
  compatMode?: number
  /** body default font (CSS) and size */
  font?: string
  sz?: number
  /** final page setup known (end of document reached) */
  final?: boolean
  /** how the last section (the body's sectPr) starts after the one before it: 'nextPage', 'continuous'… */
  sectKind?: string
}

export const DEFAULT_PAGE: PageSetup = { w: 612, h: 792, mt: 72, mr: 72, mb: 72, ml: 72, header: 36, footer: 36 }
