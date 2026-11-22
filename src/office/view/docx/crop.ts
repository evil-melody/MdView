/**
 * 图片裁剪（a:srcRect）的视图侧逻辑：模型写回、拖动手柄的几何换算与实时预览。
 * 写回走 DocxEditor 的公开 replace/withRuns 路径（docx.edit），撤销/重做随既有历史。
 */
import type { Crop } from '../../core/docx/types'
import { splitRuns, type RRun } from '../edit/rich'
import type { DocxEditor } from './DocxEditor'

/** 模型里一张选中图片的裁剪值（per-mille）；未裁剪为 undefined */
export function cropOfSelected(ed: DocxEditor): { crop?: Crop; pa: string; o: number; w: number; h: number } | null {
  const img = ed.state()?.img
  if (!img) return null
  const p = ed.para(img.pa)
  if (!p) return null
  const [, rest] = splitRuns(p.runs as RRun[], img.o)
  const [mid] = splitRuns(rest, 1)
  const x = mid.find((r) => r.t === 'img') as { t: 'img'; crop?: Crop } | undefined
  return { crop: x?.crop, pa: img.pa, o: img.o, w: img.w, h: img.h }
}

/** 把选中图片的裁剪写回内核（undefined = 取消裁剪）；返回是否写回 */
export function setImageCrop(ed: DocxEditor, crop: Crop | undefined): boolean {
  const img = ed.state()?.img
  if (!img) return false
  const p = ed.para(img.pa)
  if (!p) return false
  const [left, rest] = splitRuns(p.runs as RRun[], img.o)
  const [mid, right] = splitRuns(rest, 1)
  const next = mid.map((r) => (r.t === 'img' ? { ...r, crop: crop ? { ...crop } : undefined, cropSet: true } : r))
  ed.replace([img.pa], [ed.withRuns(p, [...left, ...next, ...right] as RRun[])], { a: { pa: img.pa, o: img.o }, f: { pa: img.pa, o: img.o + 1 } }, { label: 'image' })
  return true
}

const MIN_REST = 50 // 同轴两侧合计最多裁掉 95% 源图（per-mille，留 5% 最小可视区）

/**
 * 拖动一边中点手柄 → 新裁剪值。`d` 是该边沿其法线的位移（pt，向图内为正）：
 * 右/下边向内拖增大 r/b；左/上边向内拖增大 l/t。同轴两侧合计留出最小可视区。
 */
export function cropFromDrag(side: 'l' | 't' | 'r' | 'b', d: number, base: Crop, frameW: number, frameH: number): Crop {
  const out: Crop = { ...base }
  const per = side === 'l' || side === 'r' ? frameW : frameH
  const delta = Math.round((d / Math.max(1, per)) * 1000)
  const clamp = (v: number, cross: number) => Math.max(0, Math.min(1000 - MIN_REST - cross, Math.round(v)))
  if (side === 'l') out.l = clamp((base.l ?? 0) + delta, out.r ?? 0)
  else if (side === 'r') out.r = clamp((base.r ?? 0) + delta, out.l ?? 0)
  else if (side === 't') out.t = clamp((base.t ?? 0) + delta, out.b ?? 0)
  else out.b = clamp((base.b ?? 0) + delta, out.t ?? 0)
  return out
}

/**
 * 裁剪实时预览：把 img 包进（或复用）一个 .de-crop 裁剪壳，按 `crop` 与外框尺寸直接改 img 的
 * 缩放尺寸与偏移。提交后模型重建 DOM 会换成正式结构。
 */
export function cropPreview(img: HTMLImageElement, frameW: number, frameH: number, crop: Crop): void {
  let box = img.parentElement
  if (!box || !box.classList.contains('de-crop')) {
    box = document.createElement('span')
    box.className = 'de-crop'
    if (img.parentElement) img.parentElement.insertBefore(box, img)
    box.appendChild(img)
  }
  const l = (crop.l ?? 0) / 1000, t = (crop.t ?? 0) / 1000, r = (crop.r ?? 0) / 1000, b = (crop.b ?? 0) / 1000
  const sw = frameW / Math.max(0.05, 1 - l - r)
  const sh = frameH / Math.max(0.05, 1 - t - b)
  box.style.width = frameW + 'pt'
  box.style.height = frameH + 'pt'
  img.style.width = sw + 'pt'
  img.style.height = sh + 'pt'
  img.style.marginLeft = -l * sw + 'pt'
  img.style.marginTop = -t * sh + 'pt'
  img.style.verticalAlign = 'top'
  img.style.maxWidth = 'none'
}
