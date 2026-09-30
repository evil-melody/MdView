// Browser/Node-canvas metrics provider: measures with the same font stack the SVG
// will draw with, so baked run x positions match rendered widths (no overlap/squeeze).
// The GenOffice app injects opentype.js real-font metrics; MdView integration should
// do the same (embedded fonts / downloaded fonts) for cross-env determinism.
import type { FontMetricsProvider, RunStyle, FontMetrics } from '@genoffice/pptx-render'
import { canvasFont } from './fonts'

function makeCtx(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(8, 8).getContext('2d') as OffscreenCanvasRenderingContext2D
    }
    if (typeof document !== 'undefined') {
      return document.createElement('canvas').getContext('2d')
    }
  } catch {
    /* node without canvas */
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
    const c: any = this.ctx
    if (c?.measureText) {
      c.font = this.fontStr(style)
      const x = c.measureText('Mg')
      const asc = x.fontBoundingBoxAscent ?? style.fontSizePx * 0.8
      const desc = x.fontBoundingBoxDescent ?? style.fontSizePx * 0.22
      m = { ascent: asc, descent: desc, lineHeight: asc + desc }
    } else {
      m = {
        ascent: style.fontSizePx * 0.8,
        descent: style.fontSizePx * 0.22,
        lineHeight: style.fontSizePx * 1.02,
      }
    }
    this.cache.set(key, m)
    return m
  }

  measure(text: string, style: RunStyle): number {
    const c: any = this.ctx
    if (!c?.measureText) return text.length * style.fontSizePx * 0.55
    c.font = this.fontStr(style)
    return c.measureText(text).width
  }

  private fontStr(style: RunStyle): string {
    return canvasFont(style)
  }
}
