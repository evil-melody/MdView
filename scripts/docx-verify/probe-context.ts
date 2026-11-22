import { readFileSync } from 'node:fs'
import { parseDocx } from '@genoffice/docx-engine'

const bytes = new Uint8Array(readFileSync(process.argv[2]))
async function main() {
  const parsed = await parseDocx(bytes)
  parsed.blocks.forEach((b: any, i: number) => {
    const text = (b.runs ?? []).map((r: any) => r.text ?? '').join('')
    const isAnchor = text.includes('附录') || text.includes('概述与登录入口') || text.includes('常用路径')
    if (isAnchor || (i >= 80 && i <= 95)) {
      const imgs = (b.runs ?? []).filter((r: any) => r.image).map((r: any) => ({ w: r.image.widthPx, h: r.image.heightPx, hasData: !!r.image.dataUrl }))
      console.log(i, b.type, JSON.stringify({ text: text.slice(0, 40), standalone: b.type === 'image' ? { w: b.imageWidthPx, h: b.imageHeightPx, has: !!b.imageDataUrl } : undefined, imgs }))
    }
  })
}
main().catch((e) => { console.error(e); process.exit(1) })
