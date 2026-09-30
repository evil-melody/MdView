// Interactive spike: drag & drop (or pick) a .pptx and render every slide through
// GenOffice's pptx-engine + pptx-render into SVG. Same pipeline as browser-test.ts,
// which is the variant used for automated headless verification.
import { openPptx } from '@genoffice/pptx-engine'
import { buildRenderSlide } from '@genoffice/pptx-render'
import { renderSlideSvg } from './svg'
import { CanvasMetrics } from './canvas-metrics'
import { ensureDeckFonts, fontAvailability } from './fonts'
import { createMediaResolver, dataUrlFor } from './media'

const app = document.getElementById('app')!
const FIT_W = 1280

/** Pass 1 with throwaway metrics: only to learn which font families the deck needs. */
function collectFamilies(deck: any): Set<string> {
  const fams = new Set<string>()
  const probe = new CanvasMetrics()
  for (const slide of deck.slides) {
    let rs: any
    try {
      rs = buildRenderSlide(slide, deck.size, { fitWidthPx: FIT_W, metrics: probe })
    } catch {
      continue
    }
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        for (const ln of n.text?.lines ?? []) for (const r of ln.runs) if (r.fontFamily) fams.add(r.fontFamily)
        if (n.type === 'group') walk(n.children ?? [])
      }
    }
    walk(rs.nodes)
  }
  return fams
}

async function loadFile(file: File) {
  app.innerHTML = `<p class="status">parsing ${file.name} …</p>`
  const t0 = performance.now()
  const bytes = new Uint8Array(await file.arrayBuffer())
  app.innerHTML = `<p class="status">read ${(bytes.length / 1048576).toFixed(1)} MB …</p>`
  app.innerHTML = `<p class="status">read ${(bytes.length / 1048576).toFixed(1)} MB …</p>`
  const opened: any = await openPptx(bytes)
  const tParse = (performance.now() - t0).toFixed(0)
  app.innerHTML = `<p class="status">parsed ${opened.deck.slides.length} slides in ${tParse}ms · collecting fonts …</p>`
  app.innerHTML = `<p class="status">parsed ${opened.deck.slides.length} slides in ${tParse}ms · collecting fonts …</p>`

  // Fonts MUST be loaded before final layout: an unloaded webfont measures as the
  // fallback, so baked run advances stop matching the glyphs actually drawn.
  const families = collectFamilies(opened.deck)
  app.innerHTML = `<p class="status">fonts in deck: ${[...families].join(', ')} · loading webfonts …</p>`
  app.innerHTML = `<p class="status">fonts in deck: ${[...families].join(', ')} · loading webfonts …</p>`
  const requested = await ensureDeckFonts(families)
  const missingFaces = Object.entries(fontAvailability(families))
    .filter(([, ok]) => !ok)
    .map(([f]) => f)

  const { resolve: media, missing } = createMediaResolver(opened)
  const metrics = new CanvasMetrics() // fresh: pass-1 cache holds pre-font widths
  const t1 = performance.now()
  const slides: any[] = opened.deck.slides
  let next = 0

  const renderOne = (i: number): HTMLElement => {
    const rs = buildRenderSlide(slides[i], opened.deck.size, { fitWidthPx: FIT_W, media, slideNo: i + 1, metrics })
    const holder = document.createElement('div')
    holder.className = 'slide'
    const tag = document.createElement('div')
    tag.className = 'tag'
    tag.textContent = `slide ${i + 1}/${slides.length} · nodes=${rs.nodes.length}` + (rs.hidden ? ' · hidden' : '')
    holder.appendChild(tag)
    const wrap = document.createElement('div')
    wrap.className = 'canvas' + (rs.hidden ? ' hidden-slide' : '')
    wrap.innerHTML = renderSlideSvg(rs)
    holder.appendChild(wrap)
    return holder
  }

  // Progressive: a 70+ slide deck at 1280px with every image inlined is heavy, so paint a
  // first batch immediately and stream the rest on demand (the same shape MdView needs for
  // lazy rendering of very large decks).
  const BATCH = 6
  const frag = document.createDocumentFragment()
  const list = document.createElement('div')
  const moreBtn = document.createElement('button')
  moreBtn.className = 'more'
  const pump = (count: number) => {
    const stop = Math.min(next + count, slides.length)
    for (; next < stop; next++) frag.appendChild(renderOne(next))
    list.appendChild(frag)
    moreBtn.textContent = next < slides.length ? `继续渲染剩余 ${slides.length - next} 页` : '全部渲染完成'
    moreBtn.disabled = next >= slides.length
  }
  moreBtn.addEventListener('click', () => pump(BATCH * 4))
  app.innerHTML = ''
  app.appendChild(list)
  app.appendChild(moreBtn)
  pump(BATCH)
  const tFirst = (performance.now() - t1).toFixed(0)
  const info = document.createElement('p')
  info.className = 'status'
  info.textContent =
    `${file.name} · ${opened.deck.slides.length} slides · parse ${tParse}ms · first ${BATCH} slides in ${tFirst}ms` +
    ` · fonts: ${[...families].join(', ') || 'none'} (webfonts requested ${requested}` +
    `${missingFaces.length ? `, unavailable ${missingFaces.join(', ')}` : ''})` +
    (missing.size ? ` · missing media: ${[...missing].join(', ')}` : ' · missing media: none')
  app.prepend(info)

  // Exposed for headless verification and copy/paste debugging.
  ;(window as any).__pptxSpike = { families: [...families], missing: [...missing], slides: opened.deck.slides.length }
}

const picker = document.getElementById('picker') as HTMLInputElement
picker.addEventListener('change', () => {
  const f = picker.files?.[0]
  if (f) void loadFile(f)
})
const drop = document.getElementById('drop')!
drop.addEventListener('dragover', (e) => {
  e.preventDefault()
  drop.classList.add('over')
})
drop.addEventListener('dragleave', () => drop.classList.remove('over'))
drop.addEventListener('drop', (e) => {
  e.preventDefault()
  drop.classList.remove('over')
  const f = (e as DragEvent).dataTransfer?.files?.[0]
  if (f?.name.endsWith('.pptx')) void loadFile(f)
})

// `?src=./sample.pptx` auto-loads a sibling file (used by the headless harness).
const auto = new URLSearchParams(location.search).get('src')
if (auto) {
  void fetch(auto)
    .then(async (r) => {
      const bytes = new Uint8Array(await r.arrayBuffer())
      await loadFile(new File([bytes], auto.split('/').pop() ?? 'sample.pptx'))
    })
    .catch((err) => {
      app.innerHTML = `<p class="status">auto-load failed: ${err}</p>`
    })
}

export { dataUrlFor }
