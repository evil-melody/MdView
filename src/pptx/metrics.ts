/**
 * Canvas-backed font metrics for the GenOffice layout engine.
 *
 * The engine bakes run x/width at layout time, so these numbers must equal what the SVG draw
 * produces. `canvasFont()` is shared with the emitter, which is what keeps the two in sync.
 */
import type { FontMetricsProvider, RunStyle, FontMetrics } from '@genoffice/pptx-render'
import { canvasFont } from './fonts'

function makeCtx(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  try {
    if (typeof document !== 'undefined') return document.createElement('canvas').getContext('2d')
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(8, 8).getContext('2d') as OffscreenCanvasRenderingContext2D
    }
  } catch {
    /* no canvas available */
  }
  return null
}

export class CanvasMetrics implements FontMetricsProvider {
  private ctx = makeCtx()
  private cache = new Map<string, FontMetrics>()

  metrics(style: RunStyle): FontMetrics {
    const key = `${style.fontFamily}|${style.fontSizePx}|${style.bold}|${style.italic}`
    const hit = this.cache.get(key)
    if (hit) return hit
    let m: FontMetrics
    const c = this.ctx as CanvasRenderingContext2D | null
    if (c?.measureText) {
      c.font = canvasFont(style)
      const x = c.measureText('Mg')
      const asc = x.fontBoundingBoxAscent ?? style.fontSizePx * 0.8
      const desc = x.fontBoundingBoxDescent ?? style.fontSizePx * 0.22
      m = { ascent: asc, descent: desc, lineHeight: asc + desc }
    } else {
      m = {
        ascent: style.fontSizePx * 0.8,
        descent: style.fontSizePx * 0.22,
        lineHeight: style.fontSizePx * 1.02
      }
    }
    this.cache.set(key, m)
    return m
  }

  measure(text: string, style: RunStyle): number {
    const c = this.ctx as CanvasRenderingContext2D | null
    if (!c?.measureText) return text.length * style.fontSizePx * 0.55
    c.font = canvasFont(style)
    return c.measureText(text).width
  }

  /** Drop cached widths (call after webfonts finish loading, so layout re-measures against real faces). */
  reset() {
    this.cache.clear()
  }
}
