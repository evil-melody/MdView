// Node probe: parse + render the real pptx through the same pipeline as the browser spike.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { openPptx } from '@genoffice/pptx-engine'
import { buildRenderSlide } from '@genoffice/pptx-render'
import { renderSlideSvg } from './svg'
import { CanvasMetrics } from './canvas-metrics'
import { createMediaResolver } from './media'

const SRC = process.argv[2] ?? '/Users/tatsuma/Downloads/Minimalist Business Slides XL by Slidesgo.pptx'
const OUT = '/tmp/pptx-spike/out'
mkdirSync(OUT, { recursive: true })

const bytes = readFileSync(SRC)
const t0 = performance.now()
const opened = await openPptx(new Uint8Array(bytes))
const tParse = (performance.now() - t0).toFixed(0)
console.log(`slides=${opened.deck.slides.length} size=${JSON.stringify(opened.deck.size)} parse=${tParse}ms`)

const { resolve: media, missing } = createMediaResolver(opened)

const t1 = performance.now()
const pages: string[] = []
opened.deck.slides.forEach((slide, i) => {
  const rs = buildRenderSlide(slide, opened.deck.size, { fitWidthPx: 960, media, slideNo: i + 1, metrics: new CanvasMetrics() })
  const svg = renderSlideSvg(rs)
  writeFileSync(`${OUT}/slide-${String(i + 1).padStart(2, '0')}.svg`, svg)
  const kinds: Record<string, number> = {}
  const walk = (nodes: typeof rs.nodes) => {
    for (const n of nodes) {
      kinds[n.type] = (kinds[n.type] ?? 0) + 1
      if (n.type === 'group') walk(n.children)
    }
  }
  walk(rs.nodes)
  const deco = rs.nodes.filter((n) => n.decoration).length
  console.log(`slide ${i + 1}: nodes=${rs.nodes.length} deco=${deco} kinds=${JSON.stringify(kinds)}`)
  pages.push(`<div class="slide"><div class="tag">slide ${i + 1} · nodes=${rs.nodes.length} · deco=${deco}</div><div class="canvas">${svg}</div></div>`)
})
console.log(`render total=${(performance.now() - t1).toFixed(0)}ms missing=${[...missing].join(',') || 'none'}`)

const html = `<!doctype html><html><head><meta charset="utf-8"><title>GenOffice render: ${SRC.split('/').pop()}</title>
<style>body{margin:0;padding:24px;background:#141414;font:14px sans-serif;color:#ddd}.slide{margin:24px auto;max-width:960px}.tag{color:#888;font-size:12px;margin-bottom:4px}.canvas{border:1px solid #333}.canvas svg{width:100%;height:auto;display:block;background:#fff}</style>
</head><body>${pages.join('\n')}</body></html>`
writeFileSync(`${OUT}/preview.html`, html)
console.log(`written ${OUT}/slide-*.svg + preview.html`)
