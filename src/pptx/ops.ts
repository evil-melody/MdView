/**
 * Edit-operation builders for the MdView pptx editor.
 *
 * The engine's `@genoffice/pptx-ops` layer speaks EMU and addresses elements by
 * `{ slide, el, group }`; the editor UI works in render pixels and DOM nodes. This module is the
 * only translation seam: it converts px rects into EMU boxes and builds the typed op payloads the
 * executor validates. Nothing here touches the document — `PptxDocument.runOps` executes them.
 */
import type { Op } from '@genoffice/pptx-ops'
import type { EditParagraph } from '@genoffice/pptx-ops/types'
import type { SlideSize } from '@genoffice/pptx-engine'

export type { Op, EditParagraph }

/** Rect in render px, document space, unrotated frame. */
export interface PxRect {
  x: number
  y: number
  w: number
  h: number
}

/** Where an element lives: top level, or nested inside one or more groups. */
export interface ElementRef {
  slide: number
  el: string
  /** innermost → outermost group ids; the executor only needs the innermost. */
  groupPath?: string[]
}

/** Element reference for a gesture layer that does not know which slide it is drawing. */
export type LocalRef = Omit<ElementRef, 'slide'>

const EMU_PER_PT = 12700
const PT_PER_PX = 0.75

/**
 * px ↔ EMU for one rendered slide. `fitWidthPx` is the width the RenderTree was laid out at, so
 * the factor is exact for that render and must be rebuilt when the container width changes.
 */
export class SlideMapper {
  readonly emuPerPx: number

  constructor(size: SlideSize, readonly widthPx: number) {
    this.emuPerPx = widthPx > 0 ? size.cx / widthPx : 9525
  }

  emu(px: number): number {
    return Math.round(px * this.emuPerPx)
  }

  /** Render rect → EMU box (what every geometry op expects). */
  box(r: PxRect): { x: number; y: number; cx: number; cy: number } {
    return { x: this.emu(r.x), y: this.emu(r.y), cx: this.emu(r.w), cy: this.emu(r.h) }
  }

  /** Render px → pt (font sizes; 96 CSS px per inch, 72 pt per inch). */
  pxToPt(px: number): number {
    return Math.round(px * PT_PER_PX * 100) / 100
  }
}

export function ptToEmu(pt: number): number {
  return Math.round(pt * EMU_PER_PT)
}

/** `target` for an op, adding `group` when the element is a group child. */
function targetOf(ref: ElementRef): { target: { slide: number; el: string }; group?: string } {
  const group = ref.groupPath?.length ? ref.groupPath[0] : undefined
  return { target: { slide: ref.slide, el: ref.el }, ...(group ? { group } : {}) }
}

// ── slide lifecycle ───────────────────────────────────────

export const slideOps = {
  /** Insert a blank slide after `index` (the target slide is the anchor). */
  addBlank(index: number): Op {
    return { op: 'addBlankSlide', target: { slide: index } }
  },
  duplicate(index: number): Op {
    return { op: 'duplicateSlide', target: { slide: index } }
  },
  remove(index: number): Op {
    return { op: 'deleteSlide', target: { slide: index } }
  },
  move(from: number, to: number): Op {
    return { op: 'moveSlide', target: { slide: from }, to }
  },
  setHidden(index: number, hidden: boolean): Op {
    return { op: 'setHidden', target: { slide: index }, hidden }
  },
  setNotes(index: number, text: string): Op {
    return { op: 'setNotes', target: { slide: index }, text }
  },
  setBackground(index: number, color: string): Op {
    return { op: 'setBackground', target: { slide: index }, kind: 'solid', color }
  },
  /** Slide transition (PowerPoint "切换"): one of the engine's TRANSITION_KINDS. */
  setTransition(index: number, kind: TransitionKind): Op {
    return { op: 'setTransition', target: { slide: index }, kind }
  },
  /** Auto-advance after `ms`; `null` clears it (advance on click). */
  setAdvance(index: number, ms: number | null): Op {
    return { op: 'setAdvanceTime', target: { slide: index }, ms }
  }
}

/** The engine's transition vocabulary (matches `TRANSITION_KINDS` in the generator). */
export type TransitionKind =
  | 'none'
  | 'morph'
  | 'fade'
  | 'push'
  | 'wipe'
  | 'split'
  | 'circle'
  | 'cover'
  | 'pull'
  | 'dissolve'
  | 'zoom'
  | 'random'

// ── insert ────────────────────────────────────────────────

/** A preset geometry the insert menu offers (OOXML prstGeom names). */
export type ShapePreset = 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'diamond' | 'star5'

export const insertOps = {
  textBox(slide: number, box: PxRect, mapper: SlideMapper, text = ''): Op {
    return {
      op: 'addElement',
      target: { slide },
      kind: 'textbox',
      offset: mapper.box(box),
      ...(text
        ? {
            paragraphs: [
              {
                runs: [{ text, bold: false, italic: false, fontSize: mapper.pxToPt(18), color: '#000000' }],
                align: 'left'
              }
            ]
          }
        : {})
    }
  },
  shape(slide: number, box: PxRect, mapper: SlideMapper, kind: ShapePreset = 'rect'): Op {
    return {
      op: 'addElement',
      target: { slide },
      kind,
      offset: mapper.box(box),
      fill: '#D9D9D9',
      stroke: { color: '#8C8C8C', widthEmu: ptToEmu(1) }
    }
  },
  /** Connector from one rect edge to another (straight line with an arrow head). */
  connector(
    slide: number,
    from: PxRect,
    to: PxRect,
    mapper: SlideMapper,
    kind: 'straight' | 'elbow' | 'curved' = 'straight'
  ): Op {
    const center = (r: PxRect) => ({ x: mapper.emu(r.x + r.w / 2), y: mapper.emu(r.y + r.h / 2) })
    return {
      op: 'addConnector',
      target: { slide },
      from: center(from),
      to: center(to),
      kind,
      arrow: 'end',
      line: { color: '#404040', widthPt: 1 }
    }
  },
  image(slide: number, box: PxRect, mapper: SlideMapper, bytes: Uint8Array, ext: string): Op {
    return {
      op: 'addPicture',
      target: { slide },
      offset: mapper.box(box),
      bytes,
      ext: ext.replace(/^\./, '').toLowerCase()
    }
  },
  table(slide: number, box: PxRect, mapper: SlideMapper, rows: number, cols: number): Op {
    const w = mapper.emu(box.w / cols)
    const h = mapper.emu(box.h / rows)
    return {
      op: 'addTable',
      target: { slide },
      rows,
      cols,
      offset: mapper.box(box),
      colWidthsEmu: Array.from({ length: cols }, () => w),
      rowHeightsEmu: Array.from({ length: rows }, () => h)
    }
  }
}

// ── element ───────────────────────────────────────────────

export const elementOps = {
  remove(ref: ElementRef): Op {
    return { op: 'deleteElement', ...targetOf(ref) }
  },
  /**
   * Move/resize. Top-level elements use `box` (document space, the unrotated frame). Group
   * children are addressed with `absBox`: the executor converts document space into the child
   * coordinate system against the group's live state, which is the only correct order once the
   * group itself is being transformed in the same gesture.
   */
  transform(ref: ElementRef, box: PxRect, mapper: SlideMapper, rotDeg?: number): Op {
    const rect = mapper.box(box)
    const grouped = !!ref.groupPath?.length
    return {
      op: 'setTransform',
      ...targetOf(ref),
      [grouped ? 'absBox' : 'box']: rect,
      ...(rotDeg != null ? { rotDeg } : {})
    }
  },
  reorder(ref: ElementRef, dir: 'front' | 'back' | 'forward' | 'backward'): Op {
    return { op: 'reorderElement', ...targetOf(ref), dir }
  },
  setFill(ref: ElementRef, fill: string): Op {
    return { op: 'setFill', ...targetOf(ref), fill }
  },
  setStroke(ref: ElementRef, stroke: { color: string; widthPt: number } | null): Op {
    return {
      op: 'setStroke',
      ...targetOf(ref),
      stroke: stroke ? { color: stroke.color, widthEmu: ptToEmu(stroke.widthPt) } : null
    }
  },
  setOpacity(ref: ElementRef, opacity: number): Op {
    return { op: 'setPictureOpacity', ...targetOf(ref), opacity }
  },
  /** Reset a picture's crop (`srcRect`) back to the whole bitmap. */
  clearCrop(ref: ElementRef): Op {
    return { op: 'setPictureSrcRect', ...targetOf(ref), srcRect: null }
  },
  group(slide: number, els: string[]): Op {
    return { op: 'groupElements', target: { slide }, els }
  },
  ungroup(ref: ElementRef): Op {
    return { op: 'ungroupElement', ...targetOf(ref) }
  },
  setLink(ref: ElementRef, url: string | null): Op {
    return { op: 'setLink', ...targetOf(ref), link: url ? { kind: 'url', url } : null }
  },
  /** Drop shadow. `null` clears it; the default is PowerPoint's own preset offset shadow. */
  setShadow(ref: ElementRef, shadow: ShadowSpec | null, mapper?: SlideMapper): Op {
    return {
      op: 'setEffects',
      ...targetOf(ref),
      effects: {
        shadow:
          shadow === null
            ? null
            : {
                color: shadow.color ?? '#00000059',
                dist: mapper ? mapper.emu(shadow.distPx ?? 4) : Math.round((shadow.distPx ?? 4) * 9525),
                dirDeg: shadow.dirDeg ?? 45,
                blurRad: mapper ? mapper.emu(shadow.blurPx ?? 5) : Math.round((shadow.blurPx ?? 5) * 9525)
              }
      }
    }
  }
}

export interface ShadowSpec {
  color?: string
  distPx?: number
  blurPx?: number
  dirDeg?: number
}

/** Table cell edits: text goes through `setTableCell`, shading through `setTableStyle`. */
export const tableOps = {
  /**
   * Replace one cell's text. `paragraphs` are EditParagraphs (the same shape the inline text
   * editor produces), so the engine can rebuild them onto the cell's current paragraphs and keep
   * the run/paragraph properties the caller cannot express.
   */
  cellText(ref: ElementRef, row: number, col: number, paragraphs: EditParagraph[]): Op {
    return { op: 'setTableCell', ...targetOf(ref), row, col, paragraphs }
  },
  /** Cell shading; `null` clears the direct fill so the table style shows through. */
  cellFill(ref: ElementRef, row: number, col: number, color: string | null): Op {
    return {
      op: 'setTableStyle',
      ...targetOf(ref),
      shadingColor: color,
      cells: [{ row, col }]
    }
  }
}

/** The engine's preset entrance/emphasis/exit effects the animation picker offers. */
export type AnimEffect =
  | 'appear'
  | 'fade'
  | 'flyIn'
  | 'wipe'
  | 'wipeDown'
  | 'splitIn'
  | 'zoom'
  | 'bounce'
  | 'flipIn'
  | 'pulse'
  | 'spin'
  | 'grow'
  | 'disappear'
  | 'fadeOut'
  | 'flyOut'

export const animOps = {
  add(ref: ElementRef, effect: AnimEffect, opts: { after?: number; durationMs?: number } = {}): Op {
    return {
      op: 'addAnimation',
      ...targetOf(ref),
      effect,
      ...(opts.after != null ? { after: opts.after } : {}),
      ...(opts.durationMs != null ? { duration: opts.durationMs } : {})
    }
  },
  /** Remove one timeline entry by its 0-based sequence position. */
  removeBySeq(slide: number, seq: number): Op {
    return { op: 'removeAnimation', target: { slide }, seq }
  },
  /** Clear the whole timeline for a slide (used when "无动画" is picked for the last entry). */
  clearSlide(slide: number): Op {
    return { op: 'setAnimations', target: { slide }, items: [] }
  }
}

export type AlignMode = 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom'

export const arrangeOps = {
  align(slide: number, els: string[], mode: AlignMode, to: 'selection' | 'slide'): Op {
    return { op: 'alignElements', target: { slide }, els, mode, to }
  },
  distribute(slide: number, els: string[], axis: 'horizontal' | 'vertical'): Op {
    return { op: 'distributeElements', target: { slide }, els, axis }
  }
}

export interface FontPatch {
  fontFamily?: string
  /** Render px; converted to pt here. */
  fontSizePx?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
}

export const textOps = {
  /** Patch every run of an element (toolbar formatting); px sizes become pt. */
  setFont(ref: ElementRef, patch: FontPatch): Op {
    const font: Record<string, unknown> = {}
    if (patch.fontFamily) font.fontFamily = patch.fontFamily
    if (patch.fontSizePx != null) font.fontSizePt = Math.round(patch.fontSizePx * PT_PER_PX * 100) / 100
    for (const key of ['bold', 'italic', 'underline', 'strike', 'color'] as const) {
      if (patch[key] !== undefined) font[key] = patch[key]
    }
    return { op: 'setFont', ...targetOf(ref), font }
  },
  setParagraph(
    ref: ElementRef,
    format: { align?: 'left' | 'center' | 'right' | 'justify'; lineSpacingPct?: number }
  ): Op {
    return { op: 'setParagraphFormat', ...targetOf(ref), format }
  },
  setAnchor(ref: ElementRef, anchor: 'top' | 'middle' | 'bottom'): Op {
    return { op: 'setTextAnchor', ...targetOf(ref), anchor }
  }
}

export const deckOps = {
  /**
   * Deck-wide (or scoped) find & replace. The engine throws when nothing matched, so the caller
   * gets a real failure instead of a silent no-op.
   */
  findReplace(
    find: string,
    replace: string,
    opts: { matchCase?: boolean; firstOnly?: boolean; slideIndex?: number; elementId?: string } = {}
  ): Op {
    return {
      op: 'findReplace',
      find,
      replace,
      matchCase: opts.matchCase ?? false,
      ...(opts.firstOnly ? { firstOnly: true } : {}),
      ...(opts.slideIndex != null ? { slideIndex: opts.slideIndex } : {}),
      ...(opts.elementId ? { elementId: opts.elementId } : {})
    }
  },
  setSlideSize(cx: number, cy: number): Op {
    return { op: 'setSlideSize', cx, cy }
  },
  /** Swap the theme's colour scheme + fonts across the whole package. */
  applyTheme(name: string, colors: Record<string, string>, fonts?: { major?: string; minor?: string }): Op {
    return {
      op: 'applyTheme',
      name,
      colors,
      ...(fonts?.major ? { majorFont: fonts.major } : {}),
      ...(fonts?.minor ? { minorFont: fonts.minor } : {})
    }
  }
}
