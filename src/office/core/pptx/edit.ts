/**
 * PPTX structural editing: shape geometry/fill/order, inserts, and slide list operations.
 * Works on the raw slide XML so everything not touched is preserved.
 */
import { relOfType, relsPathFor, relsOfType, relativeTarget, dirOf } from '../opc'
import {
  clone, el, getAttr, relIdAttrs, isNode, kidOf, kidsOf, local, parseRaw, prefixOf, removeKids, rootEl, serialize, setAttr, setOrdered, walkOoxml,
  escText, type RChild, type RNode,
} from '../raw'
import { EMU_PER_PX } from '../units'
import type { PptxPresentation } from './parser'
import { COMMENT_EXT_RE, isCommentRel } from './comments'
import { applyAnim, applyTransition } from './anim'
import { applyChartData as applyChartDataXml, sourceWrites, updateChartSources } from './chart'
import type { Box, PresentationMeta, ShapeOp, SlideModel, SlideOp } from './types'

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const SLIDE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide'
const LAYOUT_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout'
const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
const SLIDE_CT = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
const IMG_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' }
const SPPR_ORDER = ['xfrm', 'custGeom', 'prstGeom', 'noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill', 'ln', 'effectLst', 'effectDag', 'scene3d', 'sp3d', 'extLst']
const FILLS = new Set(['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill'])

const emu = (px: number) => String(Math.round(px * EMU_PER_PX))

function spTreeOf(nodes: RChild[]): RNode {
  const root = rootEl(nodes)!
  const tree = kidOf(kidOf(root, 'cSld'), 'spTree')
  if (!tree) throw new Error('Slide has no shape tree')
  return tree
}

function idOf(n: RNode): number | undefined {
  const nv = kidsOf(n).find((c) => /^nv.*Pr$/.test(local(c.q)))
  const id = nv ? getAttr(kidOf(nv, 'cNvPr') ?? nv, 'id') : undefined
  return id !== undefined ? Number(id) : undefined
}

function maxId(nodes: RChild[]): number {
  let max = 1
  for (const n of nodes) {
    if (!isNode(n)) continue
    walkOoxml(n, (c) => {
      if (local(c.q) === 'cNvPr') max = Math.max(max, Number(getAttr(c, 'id') ?? 0))
    })
  }
  return max
}

function aPrefix(nodes: RChild[]): string {
  let a = ''
  for (const n of nodes) {
    if (!isNode(n)) continue
    walkOoxml(n, (c) => {
      if (!a && /:(off|ext|t|p|bodyPr)$/.test(c.q)) a = prefixOf(c.q)
      return !!a
    })
  }
  return a || 'a:'
}

function setXfrm(node: RNode, box: Box, A: string, P: string) {
  const l = local(node.q)
  let host: RNode
  if (l === 'graphicFrame') host = node
  else {
    const prName = l === 'grpSp' ? 'grpSpPr' : 'spPr'
    let pr = kidOf(node, prName)
    if (!pr) {
      pr = el(P + prName)
      node.c.splice(1, 0, pr)
    }
    host = pr
  }
  let x = kidOf(host, 'xfrm')
  if (!x) {
    x = el((l === 'graphicFrame' ? P : A) + 'xfrm')
    if (l === 'graphicFrame') host.c.splice(1, 0, x)
    else setOrdered(host, x, 'xfrm', SPPR_ORDER)
  }
  const put = (name: string, attrs: Record<string, string>) => {
    let n = kidOf(x!, name)
    if (!n) {
      n = el(A + name)
      x!.c.splice(name === 'off' ? 0 : name === 'ext' ? 1 : x!.c.length, 0, n)
    }
    for (const [k, v] of Object.entries(attrs)) setAttr(n, k, v)
  }
  put('off', { x: emu(box.x), y: emu(box.y) })
  put('ext', { cx: emu(Math.max(1, box.w)), cy: emu(Math.max(1, box.h)) })
  setAttr(x, 'rot', box.rot ? String(Math.round((((box.rot % 360) + 360) % 360) * 60000)) : undefined)
  if (box.flipH !== undefined) setAttr(x, 'flipH', box.flipH ? '1' : undefined)
  if (box.flipV !== undefined) setAttr(x, 'flipV', box.flipV ? '1' : undefined)
  x.self = false
  host.self = false
}

function fillXml(A: string, color: string | null) {
  return color ? el(A + 'solidFill', {}, [el(A + 'srgbClr', { val: color.replace('#', '').toUpperCase() })]) : el(A + 'noFill')
}

// ---------------------------------------------------------------- 表格 / SmartArt 编辑

/** graphicFrame 内的 a:tbl（按 OOXML id 定位） */
function tblOf(node: RNode): RNode | undefined {
  if (local(node.q) !== 'graphicFrame') return undefined
  return kidOf(kidOf(kidOf(node, 'graphic'), 'graphicData'), 'tbl')
}

/** 清空单元格文本：保留 bodyPr/lstStyle 与段落模板，段落只剩 endParaRPr */
function clearCell(tc: RNode, A: string): void {
  const body = kidOf(tc, 'txBody')
  if (!body) return
  const ps = kidsOf(body, 'p')
  const endR = ps.map((p) => kidsOf(p, 'endParaRPr')[0]).find(Boolean)
  const empty = el(A + 'p', {}, [endR ? clone(endR) : el(A + 'endParaRPr', { lang: 'en-US', dirty: '0' })])
  body.c = [...body.c.filter((c) => !(isNode(c) && local(c.q) === 'p')), empty]
  body.self = false
}

/** 单元格文本写回：一行一段，沿用首个 run 的 rPr 模板 */
function setCellText(tc: RNode, text: string, A: string): void {
  let body = kidOf(tc, 'txBody')
  const P = prefixOf(tc.q)
  if (!body) {
    body = el(P + 'txBody', {}, [el(A + 'bodyPr'), el(A + 'lstStyle')])
    tc.c.push(body)
    tc.self = false
  }
  const ps = kidsOf(body, 'p')
  let rPr: RNode | undefined
  for (const p of ps) {
    rPr = kidOf(kidsOf(p, 'r')[0], 'rPr')
    if (rPr) break
  }
  const endR = ps.map((p) => kidsOf(p, 'endParaRPr')[0]).find(Boolean)
  const out = text.split('\n').map((line) => {
    const p = el(A + 'p')
    if (line) p.c.push(el(A + 'r', {}, [rPr ? clone(rPr) : el(A + 'rPr', { lang: 'en-US', dirty: '0' }), el(A + 't', {}, [escText(line)])]))
    p.c.push(endR ? clone(endR) : el(A + 'endParaRPr', { lang: 'en-US', dirty: '0' }))
    return p
  })
  body.c = [...body.c.filter((c) => !(isNode(c) && local(c.q) === 'p')), ...out]
  body.self = false
}

/** 形状文本写回：按行重建 p:txBody 段落；保留 a:bodyPr / a:lstStyle，沿用原段落 pPr 与首个 run 的 rPr。
 *  a:t 用 escText 转义 & / < / >，避免注入破坏 XML；走 editSlide 记 undo（切勿回退到 pptx.setText）。 */
function setShapeText(sp: RNode, lines: string[], A: string): void {
  let body = kidOf(sp, 'txBody')
  const P = prefixOf(sp.q)
  if (!body) {
    body = el(P + 'txBody', {}, [el(A + 'bodyPr'), el(A + 'lstStyle')])
    sp.c.push(body)
    sp.self = false
  }
  const ps = kidsOf(body, 'p')
  let pPr: RNode | undefined
  let rPr: RNode | undefined
  for (const p of ps) {
    if (!pPr) pPr = kidOf(p, 'pPr')
    const r = kidOf(kidsOf(p, 'r')[0], 'rPr')
    if (r) { rPr = r; break }
  }
  const endR = ps.map((p) => kidsOf(p, 'endParaRPr')[0]).find(Boolean)
  const out = lines.map((line) => {
    const p = el(A + 'p')
    if (pPr) p.c.push(clone(pPr))
    if (line) p.c.push(el(A + 'r', {}, [rPr ? clone(rPr) : el(A + 'rPr', { lang: 'en-US', dirty: '0' }), el(A + 't', {}, [escText(line)])]))
    p.c.push(endR ? clone(endR) : el(A + 'endParaRPr', { lang: 'en-US', dirty: '0' }))
    return p
  })
  body.c = [...body.c.filter((c) => !(isNode(c) && local(c.q) === 'p')), ...out]
  body.self = false
}

// ---------------------------------------------------------------- 合并感知的表格行列增删

/** 一行的逻辑列槽位：`src` 为来源 tc；`dup` 表示该列由同一 tc 的 gridSpan 覆盖；
 *  `fresh` 为新增空列；`merged` 为 hMerge/vMerge 隐藏延续（独立占位格）。 */
interface CellSlot { src: RNode | null; dup: boolean; fresh: boolean; merged: boolean }

const isMergedTc = (tc: RNode): boolean => {
  const v = (k: string) => { const a = getAttr(tc, k); return a === '1' || a === 'true' }
  return v('hMerge') || v('vMerge')
}

/** 把一个 tr 展开成 colCount 个逻辑列槽位，兼容两种 OOXML 横向合并表示：
 *  ① 标准 PowerPoint：gridSpan=N 的 anchor + (N-1) 个 hMerge 延续 tc；
 *  ② 非标准 producer：只有 gridSpan=N 的 anchor，无延续 tc（该 tc 直接占 N 列）。
 *  两者都归一为「N 个槽位指向同一个 anchor tc」。 */
function expandRow(tr: RNode, colCount: number): CellSlot[] {
  const tcs = kidsOf(tr, 'tc')
  const slots: CellSlot[] = []
  let remaining = 0 // 当前 anchor 还需吞并多少个后续 merged tc
  for (const tc of tcs) {
    const gs = Math.max(1, Number(getAttr(tc, 'gridSpan') ?? '1') || 1)
    const merged = isMergedTc(tc)
    if (remaining > 0 && merged) { remaining--; continue } // 被前面 anchor 吞并的延续 tc
    if (gs > 1 && !merged) {
      for (let k = 0; k < gs; k++) slots.push({ src: tc, dup: k > 0, fresh: false, merged: false })
      remaining = gs - 1
    } else {
      slots.push({ src: tc, dup: false, fresh: false, merged })
    }
  }
  while (slots.length < colCount) slots.push({ src: null, dup: false, fresh: true, merged: false })
  return slots.slice(0, colCount)
}

/** 克隆 tc 为「干净空单元格」：去掉所有合并标记、清空文本 */
function blankTc(tpl: RNode, A: string): RNode {
  const tc = clone(tpl)
  setAttr(tc, 'gridSpan', undefined)
  setAttr(tc, 'rowSpan', undefined)
  setAttr(tc, 'hMerge', undefined)
  setAttr(tc, 'vMerge', undefined)
  clearCell(tc, A)
  return tc
}

/** 按逻辑列槽位重建 tr 的 tc 序列（输出标准表示：合并区 = anchor(gridSpan=N) + (N-1) 个 hMerge 延续） */
function rebuildRow(tr: RNode, slots: CellSlot[], A: string): void {
  const old = kidsOf(tr, 'tc')
  const tpl = old[0] ?? parseRaw(`<${A}tc><${A}txBody><${A}bodyPr/><${A}lstStyle/><${A}p><${A}endParaRPr lang="en-US" dirty="0"/></${A}p></${A}txBody><${A}tcPr/></${A}tc>`)[0] as RNode
  tr.c = tr.c.filter((c) => !(isNode(c) && local(c.q) === 'tc'))
  const ext = tr.c.findIndex((c) => isNode(c) && local(c.q) === 'extLst')
  const at = ext >= 0 ? ext : tr.c.length
  const made: RNode[] = []
  let i = 0
  while (i < slots.length) {
    const s = slots[i]
    if (s.fresh || !s.src) {
      made.push(blankTc(tpl, A))
      i++
      continue
    }
    if (s.merged) {
      // 独立的隐藏延续（多为 vMerge）：保留标记，内容清空
      const tc = clone(s.src)
      clearCell(tc, A)
      made.push(tc)
      i++
      continue
    }
    // 连续指向同一 anchor 的槽位 → 一个 gridSpan=N 的单元格 + (N-1) 个 hMerge 延续
    let n = 1
    while (i + n < slots.length && slots[i + n].src === s.src && !slots[i + n].fresh && !slots[i + n].merged) n++
    const tc = clone(s.src)
    setAttr(tc, 'gridSpan', n > 1 ? String(n) : undefined)
    made.push(tc)
    for (let k = 1; k < n; k++) {
      const cont = blankTc(tpl, A)
      setAttr(cont, 'hMerge', '1')
      made.push(cont)
    }
    i += n
  }
  tr.c.splice(at, 0, ...made)
  tr.self = false
}

/** 表格行/列增删（第四批：合并感知）。
 *  新行按 tblGrid 的 gridCol 数生成独立空 tc（按跨度展开，不复制 rowSpan/vMerge）；
 *  增删列按逻辑列槽位调整，保证每行逻辑列占用恒等于 tblGrid 的 gridCol 数；
 *  删除行时清理纵向合并标记，避免孤立 vMerge / 越界 rowSpan（诚实边界：复杂嵌套纵向合并降级为独立格）。
 *  全程走 editSlide 的 undo 记录，save→重开一致。 */
function tableRowsOrCols(tbl: RNode, op: Extract<ShapeOp, { op: 'tblRow' | 'tblCol' }>, A: string): void {
  const grid = kidOf(tbl, 'tblGrid')
  const trs = kidsOf(tbl, 'tr')
  const colCount = grid ? kidsOf(grid, 'gridCol').length : 0
  if (op.op === 'tblRow') {
    if (op.kind === 'add') {
      const tplTr = trs[Math.max(0, Math.min(op.at, trs.length - 1))]
      if (!tplTr) return
      const n = colCount || Math.max(1, kidsOf(tplTr, 'tc').length)
      const row = clone(tplTr)
      const tplTc = kidsOf(row, 'tc')[0]
      const fresh = Array.from({ length: n }, () => tplTc
        ? blankTc(tplTc, A)
        : parseRaw(`<${A}tc><${A}txBody><${A}bodyPr/><${A}lstStyle/><${A}p><${A}endParaRPr lang="en-US" dirty="0"/></${A}p></${A}txBody><${A}tcPr/></${A}tc>`)[0] as RNode)
      row.c = row.c.filter((c) => !(isNode(c) && local(c.q) === 'tc'))
      const ext = row.c.findIndex((c) => isNode(c) && local(c.q) === 'extLst')
      row.c.splice(ext >= 0 ? ext : row.c.length, 0, ...fresh)
      row.self = false
      tbl.c.splice(tbl.c.indexOf(tplTr) + 1, 0, row)
      tbl.self = false
    } else if (trs.length > 1) {
      const at = trs[Math.max(0, Math.min(op.at, trs.length - 1))]
      tbl.c.splice(tbl.c.indexOf(at), 1)
      // 删行后清理纵向合并标记，避免孤立 vMerge / 越界 rowSpan 让行列错位
      for (const tr of kidsOf(tbl, 'tr')) {
        for (const tc of kidsOf(tr, 'tc')) {
          setAttr(tc, 'vMerge', undefined)
          setAttr(tc, 'rowSpan', undefined)
        }
      }
      tbl.self = false
    }
    return
  }
  if (!grid || colCount < 1) return
  const cols = kidsOf(grid, 'gridCol')
  const ci = Math.max(0, Math.min(op.at, colCount - 1))
  if (op.kind === 'add') {
    grid.c.splice(grid.c.indexOf(cols[ci]) + 1, 0, clone(cols[ci]))
    grid.self = false
    const newCount = colCount + 1
    for (const tr of trs) {
      const slots = expandRow(tr, colCount)
      slots.splice(Math.min(ci + 1, slots.length), 0, { src: null, dup: false, fresh: true, merged: false })
      rebuildRow(tr, slots.slice(0, newCount), A)
    }
  } else if (colCount > 1) {
    grid.c.splice(grid.c.indexOf(cols[ci]), 1)
    grid.self = false
    const newCount = colCount - 1
    for (const tr of trs) {
      const slots = expandRow(tr, colCount)
      slots.splice(Math.min(ci, slots.length - 1), 1)
      rebuildRow(tr, slots.slice(0, newCount), A)
    }
  }
}

/** SmartArt 节点文本写回 diagrams/dataN.xml 的 dgm:t（跨 part：独立 undo 记录） */
async function applyDgmText(pres: PptxPresentation, index: number, op: Extract<ShapeOp, { op: 'dgmText' }>): Promise<void> {
  const info = pres.meta.slides[index]
  if (!info) return
  const before = await pres.pkg.text(info.path)
  const nodes = parseRaw(before)
  const tree = spTreeOf(nodes)
  const frame = tree.c.find((c) => isNode(c) && idOf(c) === op.top && local(c.q) === 'graphicFrame') as RNode | undefined
  const relIds = frame ? kidOf(kidOf(kidOf(frame, 'graphic'), 'graphicData'), 'relIds') : undefined
  const dm = relIds ? getAttr(relIds, 'r:dm', true) : undefined
  const target = dm ? (await pres.pkg.rels(info.path)).get(dm)?.target : undefined
  if (!target) return
  const dbefore = await pres.pkg.text(target)
  const dnodes = parseRaw(dbefore)
  const droot = rootEl(dnodes)
  let pt: RNode | undefined
  if (droot) {
    walkOoxml(droot, (n) => {
      if (local(n.q) === 'pt' && getAttr(n, 'modelId') === op.node) { pt = n; return true }
      return false
    })
  }
  if (!pt) return
  let tx = kidOf(pt, 't')
  const A = aPrefixOf(dnodes)
  const P = prefixOf(pt.q)
  if (!tx) {
    tx = el(P + 't')
    pt.c.push(tx)
    pt.self = false
  }
  const ps = kidsOf(tx, 'p')
  let rPr: RNode | undefined
  for (const p of ps) {
    rPr = kidOf(kidsOf(p, 'r')[0], 'rPr')
    if (rPr) break
  }
  const endR = ps.map((p) => kidsOf(p, 'endParaRPr')[0]).find(Boolean)
  const out = op.text.split('\n').map((line) => {
    const p = el(A + 'p')
    if (line) p.c.push(el(A + 'r', {}, [rPr ? clone(rPr) : el(A + 'rPr', { lang: 'en-US', dirty: '0' }), el(A + 't', {}, [escText(line)])]))
    p.c.push(endR ? clone(endR) : el(A + 'endParaRPr', { lang: 'en-US', dirty: '0' }))
    return p
  })
  tx.c = out
  tx.self = false
  recordPart(pres, target, dbefore, serialize(dnodes), index)
}

function aPrefixOf(nodes: RChild[]): string {
  let a = ''
  for (const n of nodes) {
    if (!isNode(n)) continue
    walkOoxml(n, (c) => {
      // dgm:t 本身也是 *:t，不能用裸 t/p 作标记；bodyPr/rPr 只出现在 DrawingML 内容里
      if (!a && /:(off|ext|bodyPr|rPr|solidFill)$/.test(c.q)) a = prefixOf(c.q)
      return !!a
    })
  }
  return a || 'a:'
}

/**
 * 图表数据写回：chart part 的 c:pt 缓存 + c:f 指向的源工作簿单元格。
 * 两个 part 合成一条 undo 记录（一次撤销即整体回退）。
 */
async function applyChartData(pres: PptxPresentation, index: number, op: Extract<ShapeOp, { op: 'chartData' }>): Promise<void> {
  const info = pres.meta.slides[index]
  if (!info) return
  const before = await pres.pkg.text(info.path)
  const nodes = parseRaw(before)
  const tree = spTreeOf(nodes)
  const frame = tree.c.find((c) => isNode(c) && idOf(c) === op.top && local(c.q) === 'graphicFrame') as RNode | undefined
  if (!frame) return
  const chartEl = kidOf(kidOf(kidOf(frame, 'graphic'), 'graphicData'), 'chart')
  const rid = chartEl ? getAttr(chartEl, 'r:id', true) : undefined
  if (!rid) return
  const target = (await pres.pkg.rels(info.path)).get(rid)?.target
  if (!target) return
  const cbefore = await pres.pkg.text(target)
  const cnodes = parseRaw(cbefore)
  const croot = rootEl(cnodes)
  if (!croot) return
  const refs = applyChartDataXml(croot, op.data)
  const cafter = serialize(cnodes)
  // 嵌入工作簿（chart part 的 rels 里 type=.../package 指向 ppt/embeddings/*.xlsx）
  const wbPath = relOfType(await pres.pkg.rels(target), 'package')?.target
  let wbBefore: Uint8Array | undefined
  let wbAfter: Uint8Array | undefined
  if (wbPath && pres.pkg.has(wbPath)) {
    wbBefore = new Uint8Array(await (await pres.pkg.blob(wbPath)).arrayBuffer())
    wbAfter = await updateChartSources(pres.pkg, wbPath, sourceWrites(op.data, refs))
  }
  pres.pkg.setPart(target, cafter)
  const extra: { path: string; before: Uint8Array; after: Uint8Array }[] = []
  if (wbPath && wbBefore && wbAfter) {
    pres.pkg.setPart(wbPath, wbAfter)
    extra.push({ path: wbPath, before: wbBefore, after: wbAfter })
  }
  pres.touched = true
  if (cafter !== cbefore || extra.length) {
    pres.undoStack.push({ path: target, before: cbefore, after: cafter, index, extra })
    if (pres.undoStack.length > 200) pres.undoStack.shift()
    pres.redoStack = []
  }
}

function shapeXml(kind: string, id: number, box: Box, A: string, P: string, text?: string, rid?: string): string {
  const off = `<${A}off x="${emu(box.x)}" y="${emu(box.y)}"/><${A}ext cx="${emu(box.w)}" cy="${emu(box.h)}"/>`
  if (kind === 'image') {
    return (
      `<${P}pic><${P}nvPicPr><${P}cNvPr id="${id}" name="Picture ${id}"/><${P}cNvPicPr><${A}picLocks noChangeAspect="1"/></${P}cNvPicPr><${P}nvPr/></${P}nvPicPr>` +
      `<${P}blipFill><${A}blip r:embed="${rid}"/><${A}stretch><${A}fillRect/></${A}stretch></${P}blipFill>` +
      `<${P}spPr><${A}xfrm>${off}</${A}xfrm><${A}prstGeom prst="rect"><${A}avLst/></${A}prstGeom></${P}spPr></${P}pic>`
    )
  }
  const para = (t: string) => `<${A}p><${A}r><${A}rPr lang="en-US" dirty="0"/><${A}t>${escText(t)}</${A}t></${A}r></${A}p>`
  if (kind === 'text') {
    return (
      `<${P}sp><${P}nvSpPr><${P}cNvPr id="${id}" name="TextBox ${id}"/><${P}cNvSpPr txBox="1"/><${P}nvPr/></${P}nvSpPr>` +
      `<${P}spPr><${A}xfrm>${off}</${A}xfrm><${A}prstGeom prst="rect"><${A}avLst/></${A}prstGeom><${A}noFill/></${P}spPr>` +
      `<${P}txBody><${A}bodyPr wrap="square" rtlCol="0"><${A}spAutoFit/></${A}bodyPr><${A}lstStyle/>${para(text ?? 'Text')}</${P}txBody></${P}sp>`
    )
  }
  if (kind === 'line') {
    return (
      `<${P}cxnSp><${P}nvCxnSpPr><${P}cNvPr id="${id}" name="Connector ${id}"/><${P}cNvCxnSpPr/><${P}nvPr/></${P}nvCxnSpPr>` +
      `<${P}spPr><${A}xfrm>${off}</${A}xfrm><${A}prstGeom prst="line"><${A}avLst/></${A}prstGeom><${A}ln w="19050"><${A}solidFill><${A}schemeClr val="tx1"/></${A}solidFill></${A}ln></${P}spPr></${P}cxnSp>`
    )
  }
  return (
    `<${P}sp><${P}nvSpPr><${P}cNvPr id="${id}" name="Shape ${id}"/><${P}cNvSpPr/><${P}nvPr/></${P}nvSpPr>` +
    `<${P}spPr><${A}xfrm>${off}</${A}xfrm><${A}prstGeom prst="${kind}"><${A}avLst/></${A}prstGeom></${P}spPr>` +
    `<${P}style><${A}lnRef idx="2"><${A}schemeClr val="accent1"><${A}shade val="50000"/></${A}schemeClr></${A}lnRef><${A}fillRef idx="1"><${A}schemeClr val="accent1"/></${A}fillRef>` +
    `<${A}effectRef idx="0"><${A}schemeClr val="accent1"/></${A}effectRef><${A}fontRef idx="minor"><${A}schemeClr val="lt1"/></${A}fontRef></${P}style>` +
    `<${P}txBody><${A}bodyPr rtlCol="0" anchor="ctr"/><${A}lstStyle/><${A}p><${A}pPr algn="ctr"/>${text ? `<${A}r><${A}rPr lang="en-US" dirty="0"/><${A}t>${escText(text)}</${A}t></${A}r>` : ''}<${A}endParaRPr lang="en-US" dirty="0"/></${A}p></${P}txBody></${P}sp>`
  )
}

/** solid slide background (or back to the layout's when null) */
function setBackground(nodes: RChild[], A: string, P: string, color: string | null) {
  const cSld = kidOf(rootEl(nodes), 'cSld')
  if (!cSld) return
  cSld.c = cSld.c.filter((c) => !(isNode(c) && local(c.q) === 'bg'))
  if (!color) return
  const bg = parseRaw(`<${P}bg><${P}bgPr><${A}solidFill><${A}srgbClr val="${color.replace('#', '').toUpperCase()}"/></${A}solidFill><${A}effectLst/></${P}bgPr></${P}bg>`)[0] as RNode
  cSld.c.unshift(bg)
  cSld.self = false
}

async function editSlide(pres: PptxPresentation, index: number, fn: (nodes: RChild[], tree: RNode, A: string, P: string) => void | Promise<void>): Promise<SlideModel> {
  const info = pres.meta.slides[index]
  if (!info) throw new Error(`No slide #${index}`)
  const before = await pres.pkg.text(info.path)
  const nodes = parseRaw(before)
  const tree = spTreeOf(nodes)
  await fn(nodes, tree, aPrefix(nodes), prefixOf(tree.q))
  const after = serialize(nodes)
  pres.pkg.setPart(info.path, after)
  pres.touched = true
  if (after !== before) {
    pres.undoStack.push({ path: info.path, before, after, index })
    if (pres.undoStack.length > 200) pres.undoStack.shift()
    pres.redoStack = []
  }
  return pres.slide(index)
}

/** undoes / redoes the last shape edit; returns the slide index and its new model */
export async function undoShapes(pres: PptxPresentation, redo = false): Promise<{ index: number; model: SlideModel } | null> {
  const e = (redo ? pres.redoStack : pres.undoStack).pop()
  if (!e) return null
  ;(redo ? pres.undoStack : pres.redoStack).push(e)
  pres.pkg.setPart(e.path, redo ? e.after : e.before)
  // 同一次编辑改动的其它 part（如图表的嵌入工作簿）
  for (const x of e.extra ?? []) pres.pkg.setPart(x.path, redo ? x.after : x.before)
  const isSlide = pres.meta.slides.some((s) => s.path === e.path)
  // 主题 / 母版 / 版式 part 改动 undo 后必须清缓存，否则 slide() 仍读旧主题
  if (!isSlide) pres.invalidateTheme()
  const index = e.index ?? pres.meta.slides.findIndex((s) => s.path === e.path)
  if (index < 0) return null
  return { index, model: await pres.slide(index) }
}

export async function addSlideImage(pres: PptxPresentation, index: number, bytes: Uint8Array, ext: string): Promise<string> {
  ext = ext.toLowerCase().replace('jpeg', 'jpg')
  if (!IMG_TYPES[ext]) throw new Error(`Unsupported image type .${ext}`)
  const info = pres.meta.slides[index]
  const path = pres.pkg.freeName('ppt/media', 'image', ext)
  pres.pkg.setPart(path, bytes)
  await pres.pkg.ensureDefaultType(ext, IMG_TYPES[ext])
  return pres.pkg.addRel(info.path, IMAGE_REL, path)
}

// ---------------------------------------------------------------- theme / master / layout parts

/** 找到 index 页对应的 layout / master / theme part 路径 */
async function masterPaths(pres: PptxPresentation, index: number): Promise<{ layoutPath?: string; masterPath?: string; themePath?: string }> {
  const info = pres.meta.slides[index]
  if (!info) return {}
  const srels = await pres.pkg.rels(info.path)
  const layoutPath = relOfType(srels, 'slideLayout')?.target
  const masterPath = (layoutPath ? relOfType(await pres.pkg.rels(layoutPath), 'slideMaster')?.target : undefined)
    ?? relOfType(await pres.pkg.rels(pres.mainPath), 'slideMaster')?.target
  if (!masterPath) return { layoutPath }
  const themePath = relOfType(await pres.pkg.rels(masterPath), 'theme')?.target
  return { layoutPath, masterPath, themePath }
}

/** 写入任意 part 并登记一次 undo（非 slide part 用 index 指定刷新页） */
function recordPart(pres: PptxPresentation, path: string, before: string, after: string, index: number): void {
  pres.pkg.setPart(path, after)
  pres.touched = true
  if (after !== before) {
    pres.undoStack.push({ path, before, after, index })
    if (pres.undoStack.length > 200) pres.undoStack.shift()
    pres.redoStack = []
  }
}

/** 改主题 clrScheme 下某个配色键为 srgbClr（accent1 / dk1 / lt1 …），返回是否命中 */
function setThemeColor(nodes: RChild[], key: string, color: string): boolean {
  const scheme = kidOf(kidOf(rootEl(nodes), 'themeElements'), 'clrScheme')
  if (!scheme) return false
  const A = prefixOf(scheme.q) || 'a:'
  let slot = kidsOf(scheme).find((c) => local(c.q) === key)
  if (!slot) { slot = el(A + key); scheme.c.push(slot); scheme.self = false }
  slot.c = [el(A + 'srgbClr', { val: color.replace('#', '').toUpperCase() })]
  slot.self = false
  return true
}

/** 切换当前幻灯片的 layout：改 slide rels 里 slideLayout 关系的 Target */
async function setSlideLayout(pres: PptxPresentation, index: number, layout: string): Promise<void> {
  const info = pres.meta.slides[index]
  if (!info) return
  const rp = relsPathFor(info.path)
  if (!pres.pkg.has(rp)) return
  const before = await pres.pkg.text(rp)
  const nodes = parseRaw(before)
  const root = rootEl(nodes)
  if (!root) return
  let changed = false
  for (const r of kidsOf(root, 'Relationship')) {
    if ((getAttr(r, 'Type') ?? '').endsWith('/slideLayout')) {
      setAttr(r, 'Target', relativeTarget(dirOf(info.path), layout))
      changed = true
    }
  }
  if (changed) recordPart(pres, rp, before, serialize(nodes), index)
}

/** 处理 themeColor / masterBg / setLayout（改的不是 slide part，独立走 undo + 清缓存） */
async function applyPartOps(pres: PptxPresentation, index: number, ops: ShapeOp[]): Promise<void> {
  let dirty = false
  for (const op of ops) {
    if (op.op === 'themeColor') {
      const { themePath } = await masterPaths(pres, index)
      if (!themePath) continue
      const before = await pres.pkg.text(themePath)
      const nodes = parseRaw(before)
      if (setThemeColor(nodes, op.key, op.color)) {
        recordPart(pres, themePath, before, serialize(nodes), index)
        dirty = true
      }
    } else if (op.op === 'masterBg') {
      const { masterPath } = await masterPaths(pres, index)
      if (!masterPath) continue
      const before = await pres.pkg.text(masterPath)
      const nodes = parseRaw(before)
      const root = rootEl(nodes)
      if (!root) continue
      setBackground(nodes, aPrefix(nodes), prefixOf(root.q), op.color)
      recordPart(pres, masterPath, before, serialize(nodes), index)
      dirty = true
    } else if (op.op === 'setLayout') {
      await setSlideLayout(pres, index, op.layout)
      dirty = true
    }
  }
  if (dirty) pres.invalidateTheme()
}

export async function shapeOps(pres: PptxPresentation, index: number, ops: ShapeOp[]): Promise<SlideModel> {
  const isPart = (o: ShapeOp) => o.op === 'themeColor' || o.op === 'masterBg' || o.op === 'setLayout'
  const partOps = ops.filter(isPart)
  const slideOps = ops.filter((o) => !isPart(o))
  if (partOps.length) await applyPartOps(pres, index, partOps)
  // SmartArt 文本写的是 diagrams data part，不是 slide part：独立处理（自带 undo 记录）
  const dgmOps = slideOps.filter((o): o is Extract<ShapeOp, { op: 'dgmText' }> => o.op === 'dgmText')
  for (const op of dgmOps) await applyDgmText(pres, index, op)
  // 图表数据写的是 chart part（+ 嵌入工作簿），不是 slide part：独立处理（自带 undo 记录）
  const chartOps = slideOps.filter((o): o is Extract<ShapeOp, { op: 'chartData' }> => o.op === 'chartData')
  for (const op of chartOps) await applyChartData(pres, index, op)
  const rest = slideOps.filter((o) => o.op !== 'dgmText' && o.op !== 'chartData')
  if (!rest.length) return pres.slide(index)
  return editSlide(pres, index, (nodes, tree, A, P) => {
    const find = (top: number) => {
      const i = tree.c.findIndex((c) => isNode(c) && idOf(c) === top)
      return i >= 0 ? { node: tree.c[i] as RNode, i } : undefined
    }
    for (const op of slideOps) {
      // 已在 partOps / dgmText / chartData 预处理；此处仅保留以收窄联合类型
      if (op.op === 'themeColor' || op.op === 'masterBg' || op.op === 'setLayout' || op.op === 'dgmText' || op.op === 'chartData') continue
      if (op.op === 'insert') {
        const id = maxId(nodes) + 1
        const xml = shapeXml(op.kind, id, op.box, A, P, op.text, op.rid)
        tree.c.push(parseRaw(xml)[0])
        continue
      }
      if (op.op === 'bg') {
        setBackground(nodes, A, P, op.color)
        continue
      }
      if (op.op === 'anim') {
        applyAnim(nodes, op.top, op.preset)
        continue
      }
      if (op.op === 'transition') {
        applyTransition(nodes, op.kind)
        continue
      }
      if (op.op === 'anchor') {
        let body: RNode | undefined
        walkOoxml(tree, (c) => {
          if (body) return true
          if (local(c.q) === 'sp' && Number(getAttr(kidOf(kidOf(c, 'nvSpPr'), 'cNvPr') ?? c, 'id')) === op.sid) body = kidOf(kidOf(c, 'txBody'), 'bodyPr')
        })
        if (body) setAttr(body, 'anchor', op.anchor)
        continue
      }
      const hit = find(op.top)
      if (!hit) continue
      const { node, i } = hit
      switch (op.op) {
        case 'xfrm':
          setXfrm(node, op.box, A, P)
          break
        case 'cellText': {
          const tbl = tblOf(node)
          const tr = tbl ? kidsOf(tbl, 'tr')[op.row] : undefined
          const tc = tr ? kidsOf(tr, 'tc')[op.col] : undefined
          if (tc) setCellText(tc, op.text, A)
          break
        }
        case 'shapeText': {
          // find(top) 命中顶层 p:sp；组内 p:sp 的 top 指组节点，需在组内按自身 id 再找
          let sp = local(node.q) === 'sp' && idOf(node) === op.top ? node : undefined
          if (!sp) {
            walkOoxml(node, (c) => {
              if (sp) return true
              if (local(c.q) === 'sp' && idOf(c) === op.top) { sp = c; return true }
              return false
            })
          }
          if (sp) setShapeText(sp, op.lines, A)
          break
        }
        case 'tblRow':
        case 'tblCol': {
          const tbl = tblOf(node)
          if (tbl) tableRowsOrCols(tbl, op, A)
          break
        }
        case 'delete':
          tree.c.splice(i, 1)
          break
        case 'order': {
          const shapes = () => tree.c.map((c, k) => (isNode(c) && !/^(nvGrpSpPr|grpSpPr|extLst)$/.test(local(c.q)) ? k : -1)).filter((k) => k >= 0)
          const before = shapes()
          const pos = before.indexOf(i)
          tree.c.splice(i, 1)
          const rest = shapes()
          if (op.to === 'front') tree.c.splice(rest.length ? rest[rest.length - 1] + 1 : tree.c.length, 0, node)
          else if (op.to === 'back') tree.c.splice(rest.length ? rest[0] : tree.c.length, 0, node)
          else {
            // one step: swap with the neighbour shape
            const to = op.to === 'forward' ? Math.min(rest.length, pos + 1) : Math.max(0, pos - 1)
            tree.c.splice(to < rest.length ? rest[to] : rest.length ? rest[rest.length - 1] + 1 : tree.c.length, 0, node)
          }
          break
        }
        case 'duplicate': {
          const copy = clone(node)
          let id = maxId(nodes)
          walkOoxml(copy, (c) => {
            if (local(c.q) === 'cNvPr') setAttr(c, 'id', String(++id))
          })
          const off = (() => {
            let o: RNode | undefined
            walkOoxml(copy, (c) => {
              if (!o && local(c.q) === 'off') o = c
              return !!o
            })
            return o
          })()
          if (off) {
            setAttr(off, 'x', String(Number(getAttr(off, 'x') ?? 0) + Math.round((op.dx ?? 16) * EMU_PER_PX)))
            setAttr(off, 'y', String(Number(getAttr(off, 'y') ?? 0) + Math.round((op.dy ?? 16) * EMU_PER_PX)))
          }
          tree.c.splice(i + 1, 0, copy)
          break
        }
        case 'fill':
        case 'line': {
          const l = local(node.q)
          if (l !== 'sp' && l !== 'cxnSp' && l !== 'pic') break
          let pr = kidOf(node, 'spPr')
          if (!pr) {
            pr = el(P + 'spPr')
            node.c.splice(1, 0, pr)
          }
          if (op.op === 'fill') {
            removeKids(pr, (k) => FILLS.has(k))
            setOrdered(pr, fillXml(A, op.color), op.color ? 'solidFill' : 'noFill', SPPR_ORDER)
          } else {
            const ln = clone(kidOf(pr, 'ln') ?? el(A + 'ln'))
            if ('color' in op) {
              removeKids(ln, (k) => FILLS.has(k))
              ln.c.unshift(fillXml(A, op.color ?? null))
            } else if (!ln.c.some((c) => isNode(c) && FILLS.has(local(c.q)))) {
              // weight / dash on a shape whose outline comes from its style: make it visible
              ln.c.unshift(el(A + 'solidFill', {}, [el(A + 'schemeClr', { val: 'tx1' })]))
            }
            if (op.dash !== undefined) {
              removeKids(ln, (k) => k === 'prstDash' || k === 'custDash')
              const at = ln.c.findIndex((c) => isNode(c) && !FILLS.has(local(c.q)))
              ln.c.splice(at < 0 ? ln.c.length : at, 0, el(A + 'prstDash', { val: op.dash }))
            }
            ln.self = false
            if (op.w !== undefined) setAttr(ln, 'w', String(Math.round(op.w * 12700)))
            setOrdered(pr, ln, 'ln', SPPR_ORDER)
          }
          pr.self = false
          break
        }
      }
    }
  })
}

// ---------------------------------------------------------------- slides

async function presNodes(pres: PptxPresentation) {
  const nodes = parseRaw(await pres.pkg.text(pres.mainPath))
  const root = rootEl(nodes)!
  const P = prefixOf(root.q)
  let lst = kidOf(root, 'sldIdLst')
  if (!lst) {
    lst = el(P + 'sldIdLst')
    const at = root.c.findIndex((c) => isNode(c) && local(c.q) === 'sldMasterIdLst')
    root.c.splice(at + 1, 0, lst)
  }
  return { nodes, root, P, lst }
}

/** Re-reads the slide list from presentation.xml into `pres.meta`. */
async function refreshMeta(pres: PptxPresentation): Promise<PresentationMeta> {
  const rels = await pres.pkg.rels(pres.mainPath)
  const { lst } = await presNodes(pres)
  const slides: PresentationMeta['slides'] = []
  for (const s of kidsOf(lst, 'sldId')) {
    const rel = rels.get(getAttr(s, 'r:id') ?? getAttr(s, 'id', true) ?? '')
    if (rel && pres.pkg.has(rel.target)) slides.push({ index: slides.length, path: rel.target, hidden: false })
  }
  for (const s of slides) {
    const head = (await pres.pkg.text(s.path)).slice(0, 600)
    s.hidden = /<[\w:]*sld\b[^>]*\sshow="0"/.test(head)
  }
  pres.meta.slides = slides
  pres.meta.count = slides.length
  return pres.meta
}

async function pickLayout(pres: PptxPresentation, refSlide: string | undefined, want: string): Promise<string | undefined> {
  const ref = refSlide ? relOfType(await pres.pkg.rels(refSlide), 'slideLayout')?.target : undefined
  let masterPath = ref ? relOfType(await pres.pkg.rels(ref), 'slideMaster')?.target : undefined
  if (!masterPath) masterPath = relOfType(await pres.pkg.rels(pres.mainPath), 'slideMaster')?.target
  if (!masterPath) return ref
  const layouts = relsOfType(await pres.pkg.rels(masterPath), 'slideLayout').map((r) => r.target)
  const types = await Promise.all(layouts.map(async (l) => /<[\w:]*sldLayout\b[^>]*\stype="([^"]+)"/.exec((await pres.pkg.text(l)).slice(0, 800))?.[1]))
  const want2 = want === 'title' ? ['title'] : want === 'blank' ? ['blank'] : ['obj', 'txAndObj', 'tx']
  const i = types.findIndex((t) => t && want2.includes(t))
  return i >= 0 ? layouts[i] : ref ?? layouts[0]
}

async function newSlideXml(pres: PptxPresentation, layoutPath: string | undefined): Promise<string> {
  let shapes = ''
  if (layoutPath) {
    const nodes = parseRaw(await pres.pkg.text(layoutPath))
    const tree = kidOf(kidOf(rootEl(nodes), 'cSld'), 'spTree')
    let id = 2
    for (const sp of kidsOf(tree, 'sp')) {
      const ph = kidOf(kidOf(kidOf(sp, 'nvSpPr'), 'nvPr'), 'ph')
      if (!ph) continue
      const type = getAttr(ph, 'type')
      if (type && ['dt', 'ftr', 'sldNum'].includes(type)) continue
      const name = getAttr(kidOf(kidOf(sp, 'nvSpPr'), 'cNvPr') ?? sp, 'name') ?? `Placeholder ${id}`
      const phXml = `<p:ph${type ? ` type="${type}"` : ''}${getAttr(ph, 'idx') ? ` idx="${getAttr(ph, 'idx')}"` : ''}/>`
      shapes +=
        `<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="${escText(name)}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${phXml}</p:nvPr></p:nvSpPr>` +
        `<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p></p:txBody></p:sp>`
    }
  }
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    `${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  )
}

async function insertSlidePart(pres: PptxPresentation, after: number, xml: string, rels: string): Promise<void> {
  const path = pres.pkg.freeName('ppt/slides', 'slide', 'xml')
  pres.pkg.setPart(path, xml)
  pres.pkg.setPart(relsPathFor(path), rels)
  await pres.pkg.setContentType(path, SLIDE_CT)
  const rid = await pres.pkg.addRel(pres.mainPath, SLIDE_REL, path)
  const { nodes, root, P, lst } = await presNodes(pres)
  const ids = kidsOf(lst, 'sldId').map((s) => Number(getAttr(s, 'id') ?? 0))
  const id = Math.max(255, ...ids) + 1
  const entry = el(P + 'sldId', { id: String(id), ...relIdAttrs(root, 'id', rid) })
  const items = kidsOf(lst, 'sldId')
  const at = after < 0 ? 0 : lst.c.indexOf(items[Math.min(after, items.length - 1)]) + 1
  lst.c.splice(at, 0, entry)
  lst.self = false
  pres.pkg.setPart(pres.mainPath, serialize(nodes))
}

export async function slideOp(pres: PptxPresentation, op: SlideOp): Promise<PresentationMeta> {
  const slides = pres.meta.slides
  pres.touched = true
  switch (op.op) {
    case 'add': {
      const ref = slides[Math.max(0, Math.min(op.after, slides.length - 1))]?.path
      const layout = await pickLayout(pres, ref, op.layout ?? 'content')
      const xml = await newSlideXml(pres, layout)
      const rels = layout
        ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${LAYOUT_REL}" Target="../slideLayouts/${layout.split('/').pop()}"/></Relationships>`
        : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
      await insertSlidePart(pres, op.after, xml, rels)
      break
    }
    case 'duplicate': {
      const src = slides[op.index]
      if (!src) break
      // comments stay with the original slide
      const xml = (await pres.pkg.text(src.path)).replace(COMMENT_EXT_RE, '')
      const rp = relsPathFor(src.path)
      let rels = pres.pkg.has(rp) ? await pres.pkg.text(rp) : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
      // notes belong to the original slide only
      const rn = parseRaw(rels)
      const rroot = rootEl(rn)!
      rroot.c = rroot.c.filter((c) => !(isNode(c) && (/notesSlide$/.test(getAttr(c, 'Type') ?? '') || isCommentRel(getAttr(c, 'Type') ?? ''))))
      rels = serialize(rn)
      await insertSlidePart(pres, op.index, xml, rels)
      break
    }
    case 'delete': {
      const s = slides[op.index]
      if (!s || slides.length <= 1) break
      const { nodes, lst } = await presNodes(pres)
      const rels = await pres.pkg.rels(pres.mainPath)
      const entry = kidsOf(lst, 'sldId').find((x) => rels.get(getAttr(x, 'r:id') ?? '')?.target === s.path)
      if (entry) lst.c.splice(lst.c.indexOf(entry), 1)
      pres.pkg.setPart(pres.mainPath, serialize(nodes))
      const srels = await pres.pkg.rels(s.path)
      const notes = relOfType(srels, 'notesSlide')?.target
      // its comments go with it
      const comments = [...srels.values()].filter((r) => !r.external && isCommentRel(r.type)).map((r) => r.target)
      for (const t of pres.comments.threads()) {
        const a = t.root.at
        if (!a || !('slide' in a) || a.slide !== s.path) continue
        for (const r of t.replies) pres.comments.set(r.id, null)
        pres.comments.set(t.root.id, null)
      }
      await pres.pkg.removeRelsTo(pres.mainPath, s.path)
      for (const part of [s.path, notes, ...comments].filter(Boolean) as string[]) {
        pres.pkg.setPart(part, null)
        if (pres.pkg.has(relsPathFor(part))) pres.pkg.setPart(relsPathFor(part), null)
        await pres.pkg.setContentType(part, null)
      }
      break
    }
    case 'move': {
      const { nodes, lst } = await presNodes(pres)
      const items = kidsOf(lst, 'sldId')
      const item = items[op.from]
      if (!item || op.to < 0 || op.to >= items.length) break
      lst.c.splice(lst.c.indexOf(item), 1)
      const rest = kidsOf(lst, 'sldId')
      const at = op.to >= rest.length ? lst.c.length : lst.c.indexOf(rest[op.to])
      lst.c.splice(at, 0, item)
      pres.pkg.setPart(pres.mainPath, serialize(nodes))
      break
    }
    case 'hide': {
      const s = slides[op.index]
      if (!s) break
      const nodes = parseRaw(await pres.pkg.text(s.path))
      setAttr(rootEl(nodes)!, 'show', op.hidden ? '0' : undefined)
      pres.pkg.setPart(s.path, serialize(nodes))
      break
    }
  }
  return refreshMeta(pres)
}
