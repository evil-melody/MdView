/**
 * Docx native-save byte-fidelity harness (MdView / GenOffice docx-engine).
 *
 * Runs the SHIPPED modules under Node + jsdom so we exercise the exact save path the editor uses:
 *   1. parseDocx(sample) → 块类型计数、文本提取
 *   2. render.ts（纯函数，无需 DOM）：标题块带 data-bid；图片块 / 内联图片 run 带 dataUrl
 *   3. 未编辑保存（全部 original）：zip 部件级字节一致（docx 字节锚点保证），重解析文本一致
 *   4. 编辑标题块（generated + 保留 rawPPr + level）：重解析后文本含标记、且仍为 heading、level 与 rawPPr 不变
 *   5. 编辑段落块（generated + rawPPr + 加粗 run）：重解析后文本含标记、仍为段落、加粗保留、rawPPr 不变
 *   6. rebuildRuns（真实编辑捕获路径，jsdom DOM）：span 加粗文本 + <img data-img> 还原为原始 image（含 drawing xml）
 *
 *   node scripts/docx-verify/build.mjs [sample.docx]
 *   node scripts/docx-verify/harness.cjs [sample.docx]
 */
import { readFileSync } from 'node:fs'
import { parseDocx, saveDocx } from '@genoffice/docx-engine'
import { renderBlockToHtml } from '../../src/docx/render'
import { rebuildRuns } from '../../src/docx/document'
import { JSDOM } from 'jsdom'

function textOf(block: any): string {
  if (!block) return ''
  if (block.type === 'table') {
    const rows = block.table?.rows ?? []
    return rows
      .map((r: any[]) =>
        r
          .map((c: any) =>
            (c.richParas ?? []).map((p: any) => (p.runs ?? []).map((x: any) => x.text).join('')).join('|')
          )
          .join('\n')
      )
      .join('\n')
  }
  if (block.type === 'image') return block.imageDataUrl ?? ''
  return (block.runs ?? []).map((r: any) => r.text).join('')
}

async function zipEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(bytes)
  const out = new Map<string, Uint8Array>()
  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir) continue
    out.set(name, new Uint8Array(await file.async('uint8array')))
  }
  return out
}

async function main() {
  const path = process.argv[2] ?? '../../spikes/genoffice-docx/sample.docx'
  const orig = new Uint8Array(readFileSync(path))
  const results: any = { src: path, origBytes: orig.length }

  const parsed = (await parseDocx(orig)) as any
  const blocks: any[] = parsed.blocks
  const typeCount: Record<string, number> = {}
  for (const b of blocks) typeCount[b.type] = (typeCount[b.type] ?? 0) + 1
  results.blockCount = blocks.length
  results.typeCount = typeCount

  // ── 2. render.ts 显示路径（纯函数） ──
  const rHeading = blocks.find((b) => b.type === 'heading')
  const renderOk: Record<string, boolean> = {}
  if (rHeading) {
    const html = renderBlockToHtml(rHeading)
    renderOk.headingHasBid = html.includes(`data-bid="${rHeading.id}"`)
  }
  const imgBlock = {
    type: 'image',
    id: 'bIMG',
    imageDataUrl: 'data:image/png;base64,AAAA',
    imageWidthPx: 10,
    imageHeightPx: 10,
  }
  const imgHtml = renderBlockToHtml(imgBlock as any)
  renderOk.imageBlock = imgHtml.includes('docx-img-block') && imgHtml.includes('src="data:image/png;base64,AAAA')
  const paraImgBlock = {
    type: 'paragraph',
    id: 'bPI',
    runs: [{ text: 'hi', image: { dataUrl: 'data:image/png;base64,BBB', widthPx: 5, heightPx: 5, xml: '<w:drawing/>' } }],
  }
  const paraImgHtml = renderBlockToHtml(paraImgBlock as any)
  renderOk.inlineImage =
    paraImgHtml.includes('docx-img') &&
    paraImgHtml.includes('data-img="0"') &&
    paraImgHtml.includes('src="data:image/png;base64,BBB')
  results.render = renderOk

  // ── 3. 未编辑保存：全部 original ──
  const finalOriginal = blocks
    .filter((b) => b.docxIndex != null)
    .map((b) => ({ kind: 'original', docxIndex: b.docxIndex }))
  const savedClean = await saveDocx(parsed, finalOriginal as any)
  results.savedCleanBytes = savedClean.length

  const e1 = await zipEntries(orig)
  const e2 = await zipEntries(savedClean)
  const missingEntries: string[] = []
  const changedEntries: string[] = []
  for (const [k, v] of e1) {
    const w = e2.get(k)
    if (!w) {
      missingEntries.push(k)
      continue
    }
    if (v.length !== w.length) {
      changedEntries.push(`${k}(len ${v.length}->${w.length})`)
      continue
    }
    for (let i = 0; i < v.length; i++) {
      if (v[i] !== w[i]) {
        changedEntries.push(k)
        break
      }
    }
  }
  const otherChanged = changedEntries.filter(
    (k) =>
      !k.startsWith('word/document.xml') &&
      !k.startsWith('docProps/core.xml') &&
      !k.startsWith('docProps/app.xml')
  )
  results.untouched = {
    entriesBefore: e1.size,
    entriesAfter: e2.size,
    missingEntries,
    changedEntries,
    otherPartsChanged: otherChanged,
    otherPartsIdentical: otherChanged.length === 0,
  }

  const reparsed = (await parseDocx(savedClean)) as any
  let textMatch = true
  for (let i = 0; i < blocks.length; i++) {
    if (textOf(blocks[i]) !== textOf(reparsed.blocks[i])) {
      textMatch = false
      break
    }
  }
  results.untouched.textContentIdentical = textMatch
  results.untouched.reparsedBlockCount = reparsed.blocks.length

  // ── 4. 编辑标题块：generated 保留 rawPPr + level ──
  const heading = blocks.find((b) => b.type === 'heading')
  let headingReport: any = { skipped: true }
  if (heading) {
    const marker = 'MDVIEW-H-' + Date.now().toString(36)
    const runs = (heading.runs ?? []).map((r: any) => ({ ...r }))
    if (runs[0]) runs[0] = { ...runs[0], text: (runs[0].text ?? '') + marker }
    const editFinal: any[] = blocks
      .filter((b) => b.docxIndex != null)
      .map((b) => {
        if (b === heading)
          return {
            kind: 'generated',
            docxIndex: b.docxIndex,
            block: { type: 'heading', level: b.level, rawPPr: b.rawPPr, runs },
          }
        return { kind: 'original', docxIndex: b.docxIndex }
      })
    const savedEdit = await saveDocx(parsed, editFinal)
    const repEdit = (await parseDocx(savedEdit)) as any
    const h2 = repEdit.blocks.find((b: any) => b.docxIndex === heading.docxIndex)
    const h2Text = (h2?.runs ?? []).map((r: any) => r.text).join('')
    headingReport = {
      idx: heading.docxIndex,
      level: heading.level,
      textHasMarker: h2Text.includes(marker),
      stillHeading: h2?.type === 'heading',
      levelPreserved: h2?.type === 'heading' && h2?.level === heading.level,
      rawPPrPreserved: h2?.type === 'heading' && (h2?.rawPPr ?? '') === (heading.rawPPr ?? ''),
    }
  }
  results.editedHeading = headingReport

  // ── 5. 编辑段落块：generated 保留 rawPPr + 加粗 run ──
  const para = blocks.find((b) => b.type === 'paragraph')
  let paraReport: any = { skipped: true }
  if (para) {
    const marker = 'MDVIEW-P-' + Date.now().toString(36)
    const runs = (para.runs ?? []).map((r: any) => ({ ...r }))
    if (runs[0]) runs[0] = { ...runs[0], text: (runs[0].text ?? '') + marker, bold: true }
    const editFinal: any[] = blocks
      .filter((b) => b.docxIndex != null)
      .map((b) => {
        if (b === para)
          return {
            kind: 'generated',
            docxIndex: b.docxIndex,
            block: { type: 'paragraph', rawPPr: b.rawPPr, runs },
          }
        return { kind: 'original', docxIndex: b.docxIndex }
      })
    const savedEdit = await saveDocx(parsed, editFinal)
    const repEdit = (await parseDocx(savedEdit)) as any
    const p2 = repEdit.blocks.find((b: any) => b.docxIndex === para.docxIndex)
    const p2Text = (p2?.runs ?? []).map((r: any) => r.text).join('')
    const hasBold = (p2?.runs ?? []).some((r: any) => r.bold)
    paraReport = {
      idx: para.docxIndex,
      textHasMarker: p2Text.includes(marker),
      stillParagraph: p2?.type === 'paragraph',
      boldPreserved: hasBold,
      rawPPrPreserved: (p2?.rawPPr ?? '') === (para.rawPPr ?? ''),
    }
  }
  results.editedParagraph = paraReport

  // ── 6. rebuildRuns（真实编辑捕获路径，jsdom DOM） ──
  let rebuildReport: any = { skipped: true }
  {
    const dom = new JSDOM('<!doctype html><body></body>')
    const g: any = globalThis as any
    g.document = dom.window.document
    g.Node = dom.window.Node
    g.HTMLElement = dom.window.HTMLElement
    const originalRuns = [
      { text: 'x', image: { dataUrl: 'data:image/png;base64,BBB', widthPx: 5, heightPx: 5, xml: '<w:drawing/>' } },
    ]
    const html =
      '<span style="font-weight:700">hello</span><img data-img="0" src="data:image/png;base64,BBB">'
    const runs = rebuildRuns(html, originalRuns)
    rebuildReport = {
      runCount: runs.length,
      firstText: runs[0]?.text,
      firstBold: !!runs[0]?.bold,
      hasImageRun: runs.some((r: any) => r.image && r.image.xml === '<w:drawing/>'),
    }
  }
  results.rebuildRuns = rebuildReport

  // ── gates ──
  const gates: Record<string, boolean> = {
    parse: blocks.length > 0,
    // 文档可能没有 heading 类型块（标题以 styleId 段落呈现）——此时 gate 跳过视为通过
    renderHeadingBid: !rHeading || !!renderOk.headingHasBid,
    renderImageBlock: !!renderOk.imageBlock,
    renderInlineImage: !!renderOk.inlineImage,
    untouchedOtherPartsIdentical: results.untouched.otherPartsIdentical,
    untouchedNoMissing: results.untouched.missingEntries.length === 0,
    untouchedTextIdentical: results.untouched.textContentIdentical,
    editedHeading:
      !!headingReport.skipped ||
      (headingReport.textHasMarker && headingReport.stillHeading && headingReport.levelPreserved && headingReport.rawPPrPreserved),
    editedParagraph:
      !!paraReport.skipped ||
      (paraReport.textHasMarker && paraReport.stillParagraph && paraReport.boldPreserved && paraReport.rawPPrPreserved),
    rebuildRuns:
      !!rebuildReport.skipped ||
      (rebuildReport.firstText === 'hello' && rebuildReport.firstBold && rebuildReport.hasImageRun),
  }
  results.gates = gates
  results.failedGates = Object.entries(gates)
    .filter(([, ok]) => !ok)
    .map(([k]) => k)
  results.allPass = results.failedGates.length === 0

  console.log(JSON.stringify(results, null, 1))
  if (!results.allPass) process.exit(1)
}

main().catch((e) => {
  console.error('ERROR', e)
  process.exit(2)
})
