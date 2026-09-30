/**
 * Font handling for the pptx render path.
 *
 * Why this module exists: GenOffice bakes run advance widths at layout time (px), and the SVG
 * emitter draws with `font-family`. If measurement and drawing resolve to different physical
 * fonts (e.g. canvas falls back to sans-serif while SVG falls back to the document serif), the
 * baked positions no longer match the drawn glyph widths and words visibly collide. Both sides
 * therefore go through the single `fontStack()` below.
 *
 * Webfonts are best-effort: decks reference families like Montserrat/Vidaloka that are not
 * installed locally. We load them from Google Fonts when the machine is online and fall back to
 * the normalized stack offline (layout stays self-consistent, fidelity degrades gracefully).
 */
import type { SlideDeck } from '@genoffice/pptx-engine'

export const FALLBACKS = ['"Helvetica Neue"', 'Arial', 'sans-serif'] as const

/** Normalized CSS font-family value: requested family first, then a fixed fallback chain. */
export function fontStack(family?: string | null): string {
  const fam = (family ?? '').trim().replace(/["']/g, '')
  return [...(fam ? [`"${fam}"`] : []), ...FALLBACKS].join(', ')
}

export interface FontSpec {
  fontFamily?: string | null
  fontSizePx: number
  bold?: boolean
  italic?: boolean
}

/** Canvas 2D `ctx.font` shorthand matching the SVG stack above. */
export function canvasFont(s: FontSpec): string {
  return `${s.italic ? 'italic ' : ''}${s.bold ? 'bold ' : ''}${s.fontSizePx}px ${fontStack(s.fontFamily)}`
}

/** Google-hosted families worth pulling in; keyed by lowercase family name. */
const WEBFONT_ALIASES: Record<string, string> = {
  montserrat: 'Montserrat',
  vidaloka: 'Vidaloka',
  'playfair display': 'Playfair+Display',
  lato: 'Lato',
  roboto: 'Roboto',
  'open sans': 'Open+Sans',
  poppins: 'Poppins',
  nunito: 'Nunito',
  raleway: 'Raleway',
  'source sans pro': 'Source+Sans+3',
  merriweather: 'Merriweather',
  'dm sans': 'DM+Sans',
  'work sans': 'Work+Sans',
  inter: 'Inter',
}

/** Every font family referenced by the deck's text runs (incl. master/layout decorations). */
export function collectFontFamilies(deck: SlideDeck): Set<string> {
  const out = new Set<string>()
  const visit = (el: any) => {
    if (!el) return
    if (el.type === 'group') {
      for (const c of el.children ?? []) visit(c)
      return
    }
    for (const p of el.text?.paragraphs ?? []) {
      for (const r of p.runs ?? []) {
        const f = (r.latinFont ?? r.fontFamily ?? '').trim()
        if (f) out.add(f)
      }
      const d = p.defaultRunProps
      const df = (d?.latinFont ?? '').trim()
      if (df) out.add(df)
    }
  }
  for (const slide of deck.slides) {
    for (const el of slide.elements) visit(el)
    for (const el of slide.decorations ?? []) visit(el)
  }
  return out
}

let injected: Promise<void> | null = null

/**
 * Inject a Google Fonts stylesheet for the deck's families and force-load each weight before
 * layout runs. Failures are non-fatal: the normalized fallback stack keeps measurement and
 * rendering consistent either way.
 */
export async function ensureDeckFonts(families: Iterable<string>): Promise<number> {
  if (typeof document === 'undefined') return 0
  const wanted = new Set<string>()
  for (const f of families) {
    const g = WEBFONT_ALIASES[(f ?? '').trim().toLowerCase()]
    if (g) wanted.add(g)
  }
  if (!wanted.size) return 0
  if (!injected) {
    injected = new Promise<void>((resolve) => {
      const href =
        'https://fonts.googleapis.com/css2?' +
        [...wanted].map((f) => `family=${f}:ital,wght@0,400;0,700;1,400`).join('&') +
        '&display=block'
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      const done = () => resolve()
      link.onload = done
      link.onerror = done
      document.head.appendChild(link)
      setTimeout(done, 6000) // offline: never stall the editor
    })
  }
  await injected
  try {
    await document.fonts.ready
    // `ready` is not enough: Google Fonts registers faces lazily and only fetches them once
    // something *uses* them. Measuring before that silently uses the fallback (narrower) while
    // the SVG draw later uses the real face → advances no longer match drawn widths.
    const probe = document.createElement('span')
    probe.style.cssText = 'position:absolute;visibility:hidden;font-size:48px'
    probe.textContent = 'Ag'
    document.body.appendChild(probe)
    for (const g of wanted) {
      const family = g.replace(/\+/g, ' ')
      for (const spec of ['400', '700', 'italic 400']) {
        probe.style.fontFamily = `"${family}"`
        probe.style.fontWeight = spec.includes('700') ? '700' : '400'
        probe.style.fontStyle = spec.includes('italic') ? 'italic' : 'normal'
        try {
          await document.fonts.load(`${spec} 48px "${family}"`, 'Ag')
        } catch {
          /* unknown face: fallback stack still keeps metrics self-consistent */
        }
      }
    }
    probe.remove()
    await document.fonts.ready
  } catch {
    /* ignore */
  }
  return wanted.size
}
