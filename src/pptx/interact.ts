/**
 * Pointer geometry for the pptx selection layer.
 *
 * Kept out of the component and free of DOM access so the maths is inspectable on its own: the
 * overlay draws the *unrotated* frame rotated by CSS, so a drag delta arriving in screen px is
 * rotated back into the element's own frame (`toLocalDelta`) before it touches the rect. Resizing
 * then grows the shape along its own axes, which is what PowerPoint does for a rotated shape.
 */
import type { PxRect } from './ops'

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type DragMode = HandleId | 'move'

/** Smallest element size the handles allow, in render px (≈0.13 in at a 1280 px slide). */
export const MIN_SIZE_PX = 12

export interface Point {
  x: number
  y: number
}

/** Screen-space delta → element-local delta (inverse rotation about the box centre). */
export function toLocalDelta(dx: number, dy: number, rotDeg: number): Point {
  if (!rotDeg) return { x: dx, y: dy }
  const a = (-rotDeg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos }
}

/** Centre of a rect. */
export function center(r: PxRect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

/** The eight resize handles, positioned in the frame's local space. */
export function handlesOf(r: PxRect): { id: HandleId; x: number; y: number }[] {
  const x0 = r.x
  const x1 = r.x + r.w
  const xm = r.x + r.w / 2
  const y0 = r.y
  const y1 = r.y + r.h
  const ym = r.y + r.h / 2
  return [
    { id: 'nw', x: x0, y: y0 },
    { id: 'n', x: xm, y: y0 },
    { id: 'ne', x: x1, y: y0 },
    { id: 'e', x: x1, y: ym },
    { id: 'se', x: x1, y: y1 },
    { id: 's', x: xm, y: y1 },
    { id: 'sw', x: x0, y: y1 },
    { id: 'w', x: x0, y: ym }
  ]
}

interface ResizeInput {
  rect: PxRect
  mode: DragMode
  /** delta in the element's local frame */
  dx: number
  dy: number
  /** shift held: keep the original aspect ratio */
  keepRatio?: boolean
  rotate90?: boolean
}

/** One pointer update → the next rect. `move` just translates. */
export function applyDrag({ rect, mode, dx, dy, keepRatio }: ResizeInput): PxRect {
  if (mode === 'move') {
    return { ...rect, x: rect.x + dx, y: rect.y + dy }
  }
  let { x, y, w, h } = rect
  const west = mode.includes('w')
  const east = mode.includes('e')
  const north = mode.startsWith('n')
  const south = mode.startsWith('s')
  let dw = 0
  let dh = 0
  if (east) dw = dx
  if (west) {
    dw = -dx
    x = rect.x + dx
  }
  if (south) dh = dy
  if (north) {
    dh = -dy
    y = rect.y + dy
  }

  if (keepRatio && w > 0 && h > 0 && dw !== 0 && dh !== 0) {
    const ratio = w / h
    // dominant axis wins, the other follows the original ratio
    if (Math.abs(dw) > Math.abs(dh)) dh = dw / ratio
    else dw = dh * ratio
    if (west) x = rect.x + (w - dw)
    if (north) y = rect.y + (h - dh)
  }

  w = Math.max(w + dw, MIN_SIZE_PX)
  h = Math.max(h + dh, MIN_SIZE_PX)
  // A west/north drag past the opposite edge is clamped instead of mirrored: flipping is a
  // separate explicit op (flipElements) rather than an accident of dragging.
  if (west && x + w > rect.x + rect.w) x = rect.x + rect.w - w
  if (north && y + h > rect.y + rect.h) y = rect.y + rect.h - h
  return { x, y, w, h }
}

/** Clamp a rect into the slide so a drag cannot push an element fully off-canvas. */
export function clampToSlide(r: PxRect, widthPx: number, heightPx: number): PxRect {
  const w = Math.min(r.w, widthPx)
  const h = Math.min(r.h, heightPx)
  return {
    w,
    h,
    x: Math.min(Math.max(r.x, -w + MIN_SIZE_PX), widthPx - MIN_SIZE_PX),
    y: Math.min(Math.max(r.y, -h + MIN_SIZE_PX), heightPx - MIN_SIZE_PX)
  }
}

/** Default frame for a freshly inserted element: a fraction of the slide, centred on `at`. */
export function defaultInsertRect(
  at: Point,
  widthPx: number,
  heightPx: number,
  kind: 'text' | 'shape' | 'table' | 'picture'
): PxRect {
  const size =
    kind === 'text'
      ? { w: widthPx * 0.34, h: heightPx * 0.12 }
      : kind === 'table'
        ? { w: widthPx * 0.5, h: heightPx * 0.3 }
        : kind === 'picture'
          ? { w: widthPx * 0.3, h: heightPx * 0.3 }
          : { w: widthPx * 0.2, h: heightPx * 0.16 }
  return {
    x: Math.max(0, Math.min(at.x - size.w / 2, widthPx - size.w)),
    y: Math.max(0, Math.min(at.y - size.h / 2, heightPx - size.h)),
    w: size.w,
    h: size.h
  }
}
