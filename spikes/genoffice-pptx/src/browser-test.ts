// Browser-path verification entry: exercises the REAL integration path
// (browser canvas metrics + SVG emitter) instead of the Node probe fallback.
//
// Pass 1 lays out every slide with throwaway metrics purely to discover which font
// families the deck references; the webfonts are then loaded and pass 2 re-lays out
// with a fresh (uncached) metrics provider so advances match the drawn glyphs.
import { openPptx } from '@genoffice/pptx-engine'
import { buildRenderSlide } from '@genoffice/pptx-render'
import { renderSlideSvg } from './svg'
import { CanvasMetrics } from './canvas-metrics'
import { ensureDeckFonts, fontAvailability } from './fonts'
import { createMediaResolver } from './media'

const T0 = performance.now()
const Q = new URLSearchParams(location.search)
const SRC = Q.get('src') ?? './sample.pptx'
const FIT_W = Number(Q.get('w') ?? 960)
/** 1-based slide filter for magnified single-slide inspection, e.g. ?only=2&w=1600 */
const ONLY = Q.get('only') ? Number(Q.get('only')) : 0

function collectFamilies(deck: any): Set<string> {
  const fams = new Set<string>()
  const probe = new CanvasMetrics()
  for (const slide of deck.slides) {
    let rs: any
    try {
      rs = buildRenderSlide(slide, deck.size, { fitWidthPx: FIT_W, metrics: probe })
    } catch { continue }
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

const round = (v: number) => Number(v.toFixed(2))


const log = (msg: string) => {
  const el = document.getElementById('log')
  if (el) el.textContent += msg + '\n'
  console.log(msg)
}

async function main(): Promise<void> {
  const res = await fetch(SRC)
  if (!res.ok) throw new Error(`fetch ${SRC} → ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  log(`loaded ${SRC} (${(bytes.length / 1048576).toFixed(1)} MB)`)

  const opened: any = await openPptx(bytes)
  log(`parsed slides=${opened.deck.slides.length} size=${JSON.stringify(opened.deck.size)} in ${(performance.now() - T0).toFixed(0)}ms`)

  const families = collectFamilies(opened.deck)
  log(`font families in deck: ${[...families].join(' | ') || '(none)'}`)
  const loaded = await ensureDeckFonts(families)
  log(`webfonts requested: ${loaded} · available: ${JSON.stringify(fontAvailability(families))}`)
  {
    // Width stability check: measure a sample string now; a value that later differs from
    // the drawn glyph width is exactly what makes words collide.
    const c = document.createElement('canvas').getContext('2d')!
    const probeStyle = '48px "Montserrat", "Helvetica Neue", Arial, sans-serif'
    c.font = probeStyle
    const a = c.measureText('presentation').width
    c.font = '48px sans-serif'
    const b = c.measureText('presentation').width
    log(`measure check: montserrat-stack=${a.toFixed(2)} sans-serif=${b.toFixed(2)} ${Math.abs(a - b) < 0.5 ? '(faces MISSING - fallback in use)' : '(distinct face loaded)'}`)
  }

  const { resolve, missing } = createMediaResolver(opened)
  const metrics = new CanvasMetrics() // fresh: pass-1 cached pre-font widths would be stale
  const app = document.getElementById('app')!
  const svgs: string[] = []
  const t1 = performance.now()
  opened.deck.slides.filter((_: any, i: number) => !ONLY || i + 1 === ONLY).forEach((slide: any, i: number) => {
    const rs = buildRenderSlide(slide, opened.deck.size, { fitWidthPx: FIT_W, media: resolve, slideNo: i + 1, metrics })
    const svg = renderSlideSvg(rs)
    svgs.push(svg)
    const deco = rs.nodes.filter((n: any) => n.decoration).length
    const el = document.createElement('div')
    el.className = 'slide'
    el.innerHTML = `<div class="tag">slide ${i + 1} · nodes=${rs.nodes.length} · deco=${deco}</div><div class="canvas">${svg}</div>`
    app.appendChild(el)
  })
  log(`rendered ${svgs.length} slides in ${(performance.now() - t1).toFixed(0)}ms · missing media: ${[...missing].join(',') || 'none'}`)

  // Exposed for headless verification (string extraction instead of a screenshot).
  ;(window as any).__pptxSpike = {
    families: [...families],
    svgs,
    slideCount: svgs.length,
    missing: [...missing],
    ms: +(performance.now() - T0).toFixed(0),
  }
  // Run-level dump for headless inspection: /tmp/.../browser-test.html?only=N&runs=1
  if (Q.get('runs')) {
    const dump: any[] = []
    opened.deck.slides.forEach((slide: any, i: number) => {
      if (ONLY && i + 1 !== ONLY) return
      const rs: any = buildRenderSlide(slide, opened.deck.size, { fitWidthPx: FIT_W, media: resolve, slideNo: i + 1, metrics })
      const walk = (nodes: any[]) => {
        for (const n of nodes) {
          dump.push({ kind: n.type, deco: !!n.decoration, box: [round(n.box.x), round(n.box.y), round(n.box.w), round(n.box.h)] })
          dump.push({ kind: n.type, deco: !!n.decoration, box: [round(n.box.x), round(n.box.y), round(n.box.w), round(n.box.h)] })
          if (n.text) {
            for (const ln of n.text.lines) {
              dump.push({
                slide: i + 1,
                box: [round(n.box.x), round(n.box.y), round(n.box.w), round(n.box.h)],
                insets: n.text.insets,
                top: round(ln.top),
                runs: ln.runs.map((r: any) => ({ x: round(r.x), w: round(r.widthPx), fam: r.fontFamily, sz: round(r.fontSizePx), t: r.text })),
              })
            }
          }
          if (n.type === 'group') walk(n.children ?? [])
        }
      }
      walk(rs.nodes)
    })
    const pre = document.createElement('pre')
    pre.id = 'runs'
    pre.textContent = JSON.stringify(dump.map((d) => ({ ...d, runs: (d.runs ?? []).map((r: any) => `${r.x}|${r.w}|${r.fam}|${r.sz}|${JSON.stringify(r.t)}`) })), null, 1)
    document.body.appendChild(pre)
  }
  // Run-level dump for headless inspection: /tmp/.../browser-test.html?only=N&runs=1
  if (Q.get('runs')) {
    const dump: any[] = []
    opened.deck.slides.forEach((slide: any, i: number) => {
      if (ONLY && i + 1 !== ONLY) return
      const rs: any = buildRenderSlide(slide, opened.deck.size, { fitWidthPx: FIT_W, media: resolve, slideNo: i + 1, metrics })
      const walk = (nodes: any[]) => {
        for (const n of nodes) {
          if (n.text) {
            for (const ln of n.text.lines) {
              dump.push({
                slide: i + 1,
                box: [round(n.box.x), round(n.box.y), round(n.box.w), round(n.box.h)],
                insets: n.text.insets,
                top: round(ln.top),
                runs: ln.runs.map((r: any) => ({ x: round(r.x), w: round(r.widthPx), fam: r.fontFamily, sz: round(r.fontSizePx), t: r.text })),
              })
            }
          }
          if (n.type === 'group') walk(n.children ?? [])
        }
      }
      walk(rs.nodes)
    })
    const pre = document.createElement('pre')
    pre.id = 'runs'
    pre.textContent = JSON.stringify(dump.map((d) => ({ ...d, runs: (d.runs ?? []).map((r: any) => `${r.x}|${r.w}|${r.fam}|${r.sz}|${JSON.stringify(r.t)}`) })), null, 1)
    document.body.appendChild(pre)
  }
  document.title = `spike-ready:${svgs.length}`
}

main().catch((err) => {
  log(`ERROR ${err?.stack ?? err}`)
  document.title = 'spike-error'
})
