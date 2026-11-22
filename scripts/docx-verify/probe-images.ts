/**
 * 探针：解析 docx，列出所有图片块/图片 run 的 dataUrl 状态，
 * 定位空 dataUrl（渲染为 ⊠ 破图）的图片。
 */
import { readFileSync } from 'node:fs'
import { parseDocx } from '@genoffice/docx-engine'

const path = process.argv[2]
const bytes = new Uint8Array(readFileSync(path))

async function main() {
  const parsed = await parseDocx(bytes)

const report: any[] = []
parsed.blocks.forEach((b: any, i: number) => {
  if (b.type === 'image') {
    report.push({
      blockIdx: i,
      kind: 'standalone',
      hasDataUrl: !!b.imageDataUrl,
      dataUrlLen: b.imageDataUrl?.length ?? 0,
      w: b.imageWidthPx,
      h: b.imageHeightPx,
    })
  }
  if (Array.isArray(b.runs)) {
    b.runs.forEach((r: any, j: number) => {
      if (r.image) {
        report.push({
          blockIdx: i,
          runIdx: j,
          kind: 'inline',
          hasDataUrl: !!r.image.dataUrl,
          dataUrlLen: r.image.dataUrl?.length ?? 0,
          w: r.image.widthPx,
          h: r.image.heightPx,
        })
      }
    })
  }
})

  console.log(JSON.stringify({ totalImages: report.length, withData: report.filter((r) => r.hasDataUrl).length, withoutData: report.filter((r) => !r.hasDataUrl).length, detail: report }, null, 1))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
