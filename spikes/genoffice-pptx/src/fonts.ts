// Single source of truth for the font stack used by BOTH measurement (canvas
// measureText) and rendering (SVG font-family). If the two resolve to different
// physical fonts, the engine's baked run advances no longer match the drawn glyph
// widths → visible inter-word gaps / overlaps. Keeping one normalized stack fixes it.
//
// MdView integration note: for offline determinism, bundle the deck's real fonts
// (FontFace + opentype metrics) instead of relying on system/webfont fallback.

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

/** Google-hosted families worth pulling in for a fidelity check of common PPTX decks. */
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

/**
 * Inject a Google Fonts stylesheet for every family the deck references, then wait for
 * the browser to actually have the faces (document.fonts.load). Failures are non-fatal:
 * the normalized fallback stack keeps measurement and rendering consistent regardless.
 */
export async function ensureDeckFonts(families: Iterable<string>): Promise<number> {
  if (typeof document === 'undefined') return 0
  const wanted = new Set<string>()
  for (const f of families) {
    const g = WEBFONT_ALIASES[(f ?? '').trim().toLowerCase()]
    if (g) wanted.add(g)
  }
  if (!wanted.size) return 0
  const href =
    'https://fonts.googleapis.com/css2?' +
    [...wanted].map((f) => `family=${f}:ital,wght@0,400;0,700;1,400`).join('&') +
    '&display=block'
  await new Promise<void>((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    const done = () => resolve()
    link.onload = done
    link.onerror = done
    document.head.appendChild(link)
    setTimeout(done, 6000) // offline: don't stall the spike
  })
  try {
    await document.fonts.ready
    // `ready` alone is not enough: Google Fonts CSS registers faces lazily and they are
    // only fetched once something *uses* them. Measuring before that silently uses the
    // fallback (narrower), while the SVG draw later uses the real face → run advances no
    // longer match drawn glyph widths → words visually collide. Force-load each face at
    // the weights the deck asks for, then re-await ready.
    const probe = document.createElement('span')
    probe.style.cssText = 'position:absolute;visibility:hidden;font-size:48px'
    probe.textContent = 'Ag'
    document.body.appendChild(probe)
    for (const g of wanted) {
      for (const spec of ['400', '700', 'italic 400']) {
        const family = g.replace(/\+/g, ' ')
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

/** Diagnostic: are the requested faces actually available for measurement now? */
export function fontAvailability(families: Iterable<string>): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  if (typeof document === 'undefined') return out
  for (const f of families) {
    out[f] = document.fonts.check(`48px "${f}"`)
  }
  return out
}
