/**
 * Document-level bridge between MdView and the GenOffice pptx engine + renderer.
 *
 * Display path:  bytes -> openPptx -> deck.slides[i] -> buildRenderSlide -> RenderTree -> SVG
 * Edit path:     RenderTree node.sourceId -> SlideElement -> mutate model -> savePptx (byte-anchor
 *                preserving: untouched parts are written back byte-for-byte)
 *
 * The engine keeps a byte anchor per element, so an edit rewrites only the affected `slideN.xml`
 * slice; everything else in the package is copied verbatim.
 *
 * This module deliberately has no Tauri imports so it can also run in a plain browser / node
 * harness (see scripts/pptx-render-check.mjs) for verification without the desktop shell.
 */
import {
  elementCNvPrId,
  elementDurableId,
  getSlideAdvanceTime,
  getSlideHidden,
  getSlideNotes,
  getSlideTransition,
  openPptx,
  patchSlideXml,
  savePptx,
  replacePictureBytes,
  type OpenedPptx,
  type Slide,
  type SlideElement,
  type SlideSize,
  type TableElement,
  type TextElement
} from '@genoffice/pptx-engine'
import { buildRenderSlide, type RenderSlide } from '@genoffice/pptx-render'
import {
  applyEditParagraphs,
  listSlideAnimations,
  runTxn,
  type AnimationEntry,
  type Op,
  type OpFailure,
  type OpRecord
} from '@genoffice/pptx-ops'
import type { EditParagraph } from '@genoffice/pptx-ops/types'
import { CanvasMetrics } from './metrics'
import { collectFontFamilies, ensureDeckFonts, fontStack } from './fonts'
import { createMediaResolver } from './media'
import { renderSlideSvg } from './svg'
import { SlideMapper, type TransitionKind } from './ops'
import { tableCells, type TableCellBox } from './table'

/** Text box the user can click into (one per rendered text-bearing node). */
export interface EditableTextBox {
  sourceId: string
  /** durable id — what an op must be addressed with (see `identityMap`) */
  key: string
  /** every identity form of this element: parse id, durable id, cNvPr form */
  ids: string[]
  /** Box in slide px (same space as the SVG viewBox). */
  x: number
  y: number
  w: number
  h: number
  insetL: number
  insetT: number
  insetR: number
  insetB: number
  anchor: 'top' | 'middle' | 'bottom'
  /** First run's resolved typography, used for the inline editor overlay. */
  fontFamily: string
  fontSizePx: number
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  color: string
  align: 'left' | 'center' | 'right' | 'justify'
  /** Model text, paragraphs joined with '\n'. */
  text: string
}

export interface RenderedSlide {
  index: number
  title: string
  widthPx: number
  heightPx: number
  svg: string
  texts: EditableTextBox[]
  pictures: string[]
  elements: ElementBox[]
  nodeCount: number
}

/**
 * One selectable element of the rendered slide, in render px (document space, unrotated frame).
 * `groupPath` lets the op layer address group children: innermost first, so `groupPath[0]` is the
 * group an op must name.
 */
export interface ElementBox {
  sourceId: string
  /** durable id — op target, stable across the engine's re-materialization of the slide */
  key: string
  /** every identity form of this element: parse id, durable id, cNvPr form */
  ids: string[]
  groupPath: string[]
  type: string
  x: number
  y: number
  w: number
  h: number
  /** degrees, clockwise (OOXML rot / 60000) */
  rot: number
  /** text-bearing element: the click-to-edit path applies */
  hasText: boolean
  /** picture/table/chart reachable by the same selection layer */
  kind: 'text' | 'shape' | 'picture' | 'table' | 'chart' | 'group' | 'other'
  /** solid fill colour, or null for gradient/image/pattern fills and text-only shapes */
  fillHex: string | null
  /** rendered fill kind, for diagnostics (`solid` / `gradient` / `image` / `pattern` / `none`) */
  fillKind: string | null
  /** outline colour, or null */
  strokeHex: string | null
  opacity: number
}

export interface RenderOptions {
  /** Slide canvas width in px; height follows the deck aspect ratio. */
  fitWidthPx?: number
}

const DEFAULT_FIT_WIDTH = 960

function walkElements(elements: SlideElement[], visit: (el: SlideElement) => void) {
  for (const el of elements) {
    visit(el)
    if (el.type === 'group') walkElements((el as any).children ?? [], visit)
  }
}

/**
 * parse-time element id → every identity form the op layer accepts, **best form first**.
 *
 * The op layer MUST be addressed with durable ids: `addPicture` / `addTable` / `groupElements` call
 * the engine's `materializeSlide`, which re-serializes and reparses the slide and hands every element
 * a NEW parse-time id. A durable id (`e_<guid8>` from a16:creationId, else `e_<cNvPr>`) lives in the
 * element's own bytes and survives that reparse.
 *
 * Identity also *upgrades*: the executor mints an a16:creationId into any element whose bytes it
 * rewrites, so a key can turn from `e_<nvId>` into `e_<guid8>` between two renders. The alias list
 * keeps a held reference resolvable across that switch (callers remap their selection after every
 * render); `resolveElement` accepts all forms, so an op sent with an alias stays valid too.
 */
function identityMap(slide: Slide): Map<string, string[]> {
  const out = new Map<string, string[]>()
  walkElements(slide.elements, (el) => {
    const forms = [elementDurableId(el), elementCNvPrId(el), el.id].filter(
      (v): v is string => !!v
    )
    out.set(el.id, [...new Set(forms)])
  })
  return out
}

function findElement(slide: Slide, sourceId: string): SlideElement | undefined {
  let hit: SlideElement | undefined
  walkElements(slide.elements, (el) => {
    if (!hit && el.id === sourceId) hit = el
  })
  return hit
}

/** Locate an element by any identity form: durable id (`e_<guid8>`), cNvPr form, or parse id. */
function findAnyElement(slide: Slide, id: string): SlideElement | undefined {
  let hit: SlideElement | undefined
  walkElements(slide.elements, (el) => {
    if (hit) return
    if (el.id === id || elementDurableId(el) === id || elementCNvPrId(el) === id) hit = el
  })
  return hit
}

/** Per-slide metadata the deck panel reads (the write side is `slideOps`). */
export interface SlideMeta {
  notes: string
  transition: TransitionKind
  /** auto-advance delay in ms, null = advance on click */
  advanceMs: number | null
  hidden: boolean
}

function elementPlainText(el: TextElement): string {
  const paras = el.text?.paragraphs ?? []
  return paras.map((p) => p.runs.map((r) => r.text).join('')).join('\n')
}

/** Snapshot kept for undo/redo. Entry buffers are replaced wholesale by ops (never mutated), so a
 *  shallow copy of the entry map is enough — the same invariant the engine's executor relies on. */
interface DeckSnapshot {
  slides: Slide[]
  entries: Map<string, unknown>
  size: SlideSize
}

/** Undo depth. Each step clones the slide models (not the media bytes), so 25 is cheap. */
const MAX_HISTORY = 25

export interface OpOutcome {
  applied: boolean
  failures: OpFailure[]
  records: OpRecord[]
  /** element ids minted by additive ops (insert / duplicate / group) */
  created: string[]
}

export class PptxDocument {
  private opened: OpenedPptx
  private deck: OpenedPptx['deck']
  private metrics = new CanvasMetrics()
  private media: ReturnType<typeof createMediaResolver>
  /** Rendered slide cache, invalidated per slide on edit. */
  private cache = new Map<string, RenderSlide>()
  private dirty = false
  private undoStack: { label: string; snap: DeckSnapshot }[] = []
  private redoStack: { label: string; snap: DeckSnapshot }[] = []

  private constructor(opened: OpenedPptx) {
    this.opened = opened
    this.deck = opened.deck
    this.media = createMediaResolver(opened)
  }

  static async open(
    bytes: Uint8Array,
    opts: { onProgress?: (parsed: number, total: number) => void | Promise<void> } = {},
  ): Promise<PptxDocument> {
    const opened = await openPptx(bytes, opts)
    return new PptxDocument(opened)
  }

  get slideCount(): number {
    return this.deck.slides.length
  }

  get hasChanges(): boolean {
    return this.dirty
  }

  /** Deck page size in EMU (ops speak EMU; the render path speaks px). */
  get size(): SlideSize {
    return this.deck.size
  }

  /** px↔EMU mapping for the render width a slide was laid out at. */
  mapper(fitWidthPx: number): SlideMapper {
    return new SlideMapper(this.deck.size, fitWidthPx)
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get missingMedia(): string[] {
    return [...this.media.missing]
  }

  /** Load webfonts for the deck and drop pre-font metric caches so layout re-measures. */
  async prepare(): Promise<number> {
    // Embedded fonts ride presentation.xml rels and can exceed the lazy-inflate
    // threshold; they must be real bytes before the engine reads them.
    await this.opened.archive.ensureRelsTargets('ppt/presentation.xml')
    const families = collectFontFamilies(this.deck)
    const loaded = await ensureDeckFonts(families)
    this.metrics.reset()
    this.cache.clear()
    return loaded
  }

  /** Inflate the deferred (large) media a slide's render needs, before sync rendering. */
  async ensureSlideMedia(index: number): Promise<void> {
    const slide = this.deck.slides[index]
    if (!slide) return
    const before = this.opened.archive.pendingLazyCount
    await this.opened.archive.ensureSlideMedia(slide.path)
    // A render that raced the fill may have cached a missing-image result; drop it.
    if (this.opened.archive.pendingLazyCount < before) this.cache.clear()
  }

  /** Large parts (media/fonts) not yet inflated. */
  get pendingMediaCount(): number {
    return this.opened.archive.pendingLazyCount
  }

  /**
   * Background-fill every deferred part, yielding between parts so the UI thread
   * stays responsive. Fire-and-forget; savePptx re-awaits ensureAll as a hard gate.
   */
  startMediaPrefill(onProgress?: (done: number, total: number) => void): void {
    const total = this.opened.archive.pendingLazyCount
    if (total === 0) return
    void this.opened.archive.ensureAll({ onProgress }).catch(() => {})
  }

  private build(index: number, fitWidthPx: number): RenderSlide {
    const key = `${index}@${fitWidthPx}`
    const hit = this.cache.get(key)
    if (hit) return hit
    const slide = this.deck.slides[index]
    const rs = buildRenderSlide(slide, this.deck.size, {
      fitWidthPx,
      media: this.media.resolve,
      slideNo: index + 1,
      metrics: this.metrics
    })
    this.cache.set(key, rs)
    return rs
  }

  renderSlide(index: number, opts: RenderOptions = {}): RenderedSlide {
    const fitWidthPx = opts.fitWidthPx ?? DEFAULT_FIT_WIDTH
    const rs = this.build(index, fitWidthPx)
    const slide = this.deck.slides[index]
    const ident = identityMap(slide)
    const idsOf = (sourceId: string) => ident.get(sourceId) ?? [sourceId]
    const keyOf = (sourceId: string) => idsOf(sourceId)[0] ?? sourceId
    const texts: EditableTextBox[] = []
    const pictures: string[] = []
    const elements: ElementBox[] = []

    /**
     * Walk the RenderTree once. Group children are emitted with px coordinates relative to their
     * group's origin (the emitter translates the group first), so the absolute frame is the sum of
     * the enclosing group offsets — that is what a click-to-select element needs, and what `absBox`
     * expects for a group child transform.
     */
    const visit = (nodes: RenderSlide['nodes'], groupPath: string[], dx: number, dy: number) => {
      for (const n of nodes) {
        const srcId = (n as any).sourceId as string | undefined
        const decoration = !!(n as any).decoration
        const box = n.box as { x: number; y: number; w: number; h: number; rotationDeg?: number }
        const absX = dx + box.x
        const absY = dy + box.y
        if (n.type === 'group') {
          if (srcId && !decoration) {
            elements.push({
              sourceId: srcId,
              key: keyOf(srcId),
              ids: idsOf(srcId),
              groupPath,
              type: n.type,
              x: absX,
              y: absY,
              w: box.w,
              h: box.h,
              rot: box.rotationDeg ?? 0,
              hasText: false,
              kind: 'group',
              fillHex: null,
              fillKind: null,
              strokeHex: null,
              opacity: 1
            })
          }
          const kids = ((n as any).children ?? []) as RenderSlide['nodes']
          visit(kids, srcId ? [...groupPath, srcId] : groupPath, absX, absY)
          continue
        }
        if (!srcId || decoration) continue
        if (n.type === 'picture') pictures.push(srcId)
        const layout = (n as any).text
        const textBearing = !!layout?.lines?.some((l: any) => l.runs.length)
        const fill = (n as any).fill as { kind?: string; color?: string } | undefined
        const stroke = (n as any).stroke as { color?: string } | undefined
        elements.push({
          sourceId: srcId,
          key: keyOf(srcId),
          ids: idsOf(srcId),
          groupPath,
          type: n.type,
          x: absX,
          y: absY,
          w: box.w,
          h: box.h,
          rot: box.rotationDeg ?? 0,
          hasText: textBearing,
          kind:
            n.type === 'picture' || n.type === 'table' || n.type === 'chart'
              ? (n.type as ElementBox['kind'])
              : n.type === 'text' || n.type === 'shape'
                ? (n.type as ElementBox['kind'])
                : 'other',
          fillHex: fill?.kind === 'solid' ? (fill.color ?? null) : null,
          fillKind: fill?.kind ?? null,
          strokeHex: stroke?.color ?? null,
          opacity: typeof (n as any).opacity === 'number' ? (n as any).opacity : 1
        })
        if (!textBearing) continue
        if (n.type !== 'text' && n.type !== 'shape') continue
        const el = findElement(slide, srcId)
        if (!el || (el.type !== 'text' && el.type !== 'shape')) continue
        const firstRun = layout.lines[0]?.runs?.[0]
        const firstPara = (el as TextElement).text?.paragraphs?.[0]
        texts.push({
          sourceId: srcId,
          key: keyOf(srcId),
          ids: idsOf(srcId),
          x: absX,
          y: absY,
          w: box.w,
          h: box.h,
          insetL: layout.insets.l,
          insetT: layout.insets.t,
          insetR: layout.insets.r,
          insetB: layout.insets.b,
          anchor: layout.anchor,
          fontFamily: fontStack(firstRun?.fontFamily),
          fontSizePx: firstRun?.fontSizePx ?? 18,
          bold: !!firstRun?.bold,
          italic: !!firstRun?.italic,
          underline: !!firstRun?.underline,
          strike: !!firstRun?.strike,
          color: firstRun?.color ?? '#000000',
          align: (firstPara?.align ?? 'left') as EditableTextBox['align'],
          text: elementPlainText(el as TextElement)
        })
      }
    }
    visit(rs.nodes, [], 0, 0)

    return {
      index,
      title: this.slideTitle(index),
      widthPx: rs.widthPx,
      heightPx: rs.heightPx,
      svg: renderSlideSvg(rs, (sourceId) => ident.get(sourceId)?.[0]),
      texts,
      pictures,
      elements,
      nodeCount: rs.nodes.length
    }
  }

  /**
   * Slide title for the outline header: the title placeholder when the deck has one, else the
   * first text-bearing element (many templates leave the title as a plain text box).
   */
  slideTitle(index: number): string {
    const slide = this.deck.slides[index]
    let placeholderTitle = ''
    let firstText = ''
    walkElements(slide.elements, (el) => {
      if (el.type !== 'text' && el.type !== 'shape') return
      const t = elementPlainText(el as TextElement).trim()
      if (!t) return
      if (!firstText) firstText = t
      const ph = (el as TextElement).placeholder ?? ''
      if (!placeholderTitle && /^(ctrTitle|title)$/i.test(ph)) placeholderTitle = t
    })
    return (placeholderTitle || firstText).split('\n')[0].slice(0, 120)
  }

  /**
   * Per-slide metadata read side: notes text, transition kind, auto-advance delay, hidden flag.
   * `notes` lives in a separate `notesSlideN.xml` part, so it never shows up in the render tree —
   * this is the only way the deck panel can show it.
   */
  slideMeta(index: number): SlideMeta {
    const slide = this.deck.slides[index]
    if (!slide) return { notes: '', transition: 'none', advanceMs: null, hidden: false }
    return {
      notes: getSlideNotes(this.opened.archive, slide.path),
      transition: getSlideTransition(slide) as TransitionKind,
      advanceMs: getSlideAdvanceTime(slide),
      hidden: getSlideHidden(slide)
    }
  }

  /** Animation timeline of one slide, seq-ordered. `el` is a durable id when the shape has one. */
  slideAnimations(index: number): AnimationEntry[] {
    const slide = this.deck.slides[index]
    return slide ? listSlideAnimations(slide) : []
  }

  /**
   * Grid cells of a table element in document-space px at `fitWidthPx`. Cell frames are taken from
   * the *rendered* element box (the table may be scaled into a smaller frame than its EMU grid).
   */
  tableCells(index: number, key: string, fitWidthPx: number): TableCellBox[] {
    const slide = this.deck.slides[index]
    if (!slide) return []
    const el = findAnyElement(slide, key)
    if (!el || el.type !== 'table') return []
    const box = this.renderSlide(index, { fitWidthPx }).elements.find(
      (e) => e.key === key || e.ids.includes(key)
    )
    if (!box) return []
    return tableCells(box, el as TableElement)
  }

  /**
   * Replace one text box's content. Routed through the engine's own paragraph mapper, so an
   * untraced single-run paragraph keeps the old paragraph's bullet / level / spacing / dominant
   * run formatting (bold labels, theme color, inherited size) instead of collapsing to a default
   * style — and only flags the user actually changed get baked into the bytes.
   */
  setText(slideIndex: number, sourceId: string, text: string): boolean {
    const lines = text.replace(/\r\n?/g, '\n').split('\n')
    return this.setTextParagraphs(
      slideIndex,
      sourceId,
      lines.map((line, i) => ({ srcPara: i, runs: [{ text: line }] }))
    )
  }

  /** Rich-text variant: paragraphs/runs produced by the inline editor DOM (see dom-edit.ts). */
  setTextParagraphs(slideIndex: number, sourceId: string, paragraphs: EditParagraph[]): boolean {
    const slide = this.deck.slides[slideIndex]
    if (!slide) return false
    const el = findElement(slide, sourceId)
    if (!el || (el.type !== 'text' && el.type !== 'shape')) return false
    const target = el as TextElement
    if (!target.text) return false
    if (!paragraphs.length) return false

    const oldPlain = elementPlainText(target)
    const newPlain = paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n')
    const formatChanged = paragraphs.some((p) =>
      p.runs.some(
        (r) =>
          r.bold != null ||
          r.italic != null ||
          r.underline != null ||
          r.strike != null ||
          r.color != null ||
          r.fontSize != null
      )
    )
    if (oldPlain === newPlain && !formatChanged) return false

    const before = this.capture()
    target.text.paragraphs = applyEditParagraphs(target.text.paragraphs, paragraphs)
    target.dirty = true
    this.pushUndo('改文字', before)
    this.invalidate(slideIndex)
    return true
  }

  /** Swap the bitmap behind a picture element; media part + rel are added by the engine. */
  replacePicture(slideIndex: number, sourceId: string, bytes: Uint8Array, ext: string): boolean {
    const slide = this.deck.slides[slideIndex]
    if (!slide) return false
    const before = this.capture()
    const ok = replacePictureBytes(this.opened, slide, sourceId, bytes, ext)
    if (ok) {
      this.pushUndo('换图片', before)
      this.invalidate(slideIndex)
    }
    return ok
  }

  private invalidate(slideIndex: number) {
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(`${slideIndex}@`)) this.cache.delete(key)
    }
    this.dirty = true
  }

  /**
   * Structural ops (add/delete/move/duplicate slide, theme changes) can shift every index, so the
   * whole render cache goes. The media resolver is rebuilt too: a transaction can add or replace
   * media parts, and its cache is keyed by reference.
   */
  invalidateAll() {
    this.cache.clear()
    this.media = createMediaResolver(this.opened)
    this.dirty = true
  }

  private capture(): DeckSnapshot {
    return {
      slides: structuredClone(this.opened.deck.slides),
      entries: new Map(this.opened.archive.entries as Map<string, unknown>),
      size: { ...this.opened.deck.size }
    }
  }

  private restore(snap: DeckSnapshot) {
    this.opened.deck.slides = snap.slides
    this.opened.deck.size = snap.size
    const entries = this.opened.archive.entries as Map<string, unknown>
    entries.clear()
    for (const [k, v] of snap.entries) entries.set(k, v)
    this.invalidateAll()
  }

  /**
   * Run a validated op transaction (the engine's executor plans first, applies atomically, and
   * rolls back on any failure). Successful transactions land on the undo stack; a failed one
   * leaves the deck exactly as it was.
   */
  runOps(ops: Op[], label = '编辑'): OpOutcome {
    if (!ops.length) return { applied: false, failures: [], records: [], created: [] }
    const before = this.capture()
    const res = runTxn(this.opened, { ops })
    const records = res.records ?? []
    const failures = res.failures ?? []
    if (!res.applied) return { applied: false, failures, records: [], created: [] }
    this.pushUndo(label, before)
    this.invalidateAll()
    return {
      applied: true,
      failures,
      records,
      created: records.flatMap((r: OpRecord) => r.created ?? [])
    }
  }

  private pushUndo(label: string, snap: DeckSnapshot) {
    this.undoStack.push({ label, snap })
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift()
    this.redoStack.length = 0
  }

  /** Text-only edit path (no geometry): routed through the same executor so it journals + undoes. */
  runTextOps(ops: Op[], label = '改文字'): OpOutcome {
    return this.runOps(ops, label)
  }

  undo(): boolean {
    const step = this.undoStack.pop()
    if (!step) return false
    this.redoStack.push({ label: step.label, snap: this.capture() })
    this.restore(step.snap)
    return true
  }

  redo(): boolean {
    const step = this.redoStack.pop()
    if (!step) return false
    this.undoStack.push({ label: step.label, snap: this.capture() })
    this.restore(step.snap)
    return true
  }

  /** Label of the transaction `undo()` would revert, for the toolbar tooltip. */
  get undoLabel(): string {
    return this.undoStack[this.undoStack.length - 1]?.label ?? ''
  }

  get redoLabel(): string {
    return this.redoStack[this.redoStack.length - 1]?.label ?? ''
  }

  /** Serialize the package. Untouched slides/parts are written back byte-for-byte. */
  async save(): Promise<Uint8Array> {
    const bytes = await savePptx(this.opened)
    return bytes
  }

  /**
   * One slide's XML as it would be written right now (diagnostics only — the same routine `save`
   * uses, so it also performs the identity hardening a save would).
   */
  slideXml(index: number): string {
    const slide = this.deck.slides[index]
    return slide ? patchSlideXml(slide) : ''
  }
}

/** The run a plain-text rewrite continues: the longest run that is not a field or a hyperlink. */
export function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name)
  return (m?.[1] ?? 'png').toLowerCase()
}
