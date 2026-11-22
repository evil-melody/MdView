import { readFileSync } from 'node:fs'
import { parseDocx } from '@genoffice/docx-engine'

const bytes = new Uint8Array(readFileSync(process.argv[2]))
async function main() {
  const parsed = await parseDocx(bytes)
  const b: any = parsed.blocks[56]
  console.log(JSON.stringify({
    id: b.id, type: b.type, label: b.label,
    imageDataUrl: b.imageDataUrl ? b.imageDataUrl.slice(0, 60) : null,
    imageWidthPx: b.imageWidthPx, imageHeightPx: b.imageHeightPx,
    runs: (b.runs ?? []).map((r: any) => ({ text: (r.text ?? '').slice(0, 30), hasImage: !!r.image, img: r.image ? { w: r.image.widthPx, h: r.image.heightPx, hasData: !!r.image.dataUrl, head: (r.image.dataUrl ?? '').slice(0, 40) } : undefined })),
    keys: Object.keys(b),
  }, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
