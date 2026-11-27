/**
 * 插入图表的落库编排（报障 P18-A/B）：选区 → 数据 → 原生 c:chartSpace；
 * 单格选区先扩「当前连续数据区」（Excel Ctrl+* 语义，chartsource.chartSourceRange）。
 * 原生 chart part 写入失败时降级 PNG 图片（内容同一张），**降级必须让用户看见**：
 * 弹提示说明已按图片插入（不可刷新），绝不静默。
 */
import { chartDataOf, chartPng, type ChartKind } from './chartpng'
import { chartSourceRange, matrixOfBlock, type ChartRange } from './chartsource'
import type { Matrix } from './analysis'
import type { BlockOut, ChartAddOp } from '../../core/xlsx/types'
import { officeAlert } from '../../components/officePrompt'

export interface ChartInsertCtx {
  /** xlsx.block(sheet, r0, r1)——半开区间，与内核同参 */
  block: (r0: number, r1: number) => Promise<BlockOut>
  /** 全表矩阵（readMatrix：内核 block 能力，非视图扫表） */
  readAll: () => Promise<Matrix>
  /** xlsx.chartAdd（真实 chart part + sidecar） */
  add: (op: ChartAddOp) => Promise<unknown>
  /** xlsx.image 降级落库 */
  image: (bytes: ArrayBuffer, anchor: ChartAddOp['anchor']) => Promise<unknown>
}

/** 返回 true = 已插入（原生或降级图片）；false = 数据不足，已提示。 */
export async function insertChartFromRange(kind: ChartKind, sel: ChartRange, ctx: ChartInsertCtx): Promise<boolean> {
  const g = sel.r0 === sel.r1 && sel.c0 === sel.c1 ? chartSourceRange(sel, await ctx.readAll()) : sel
  const block = await ctx.block(g.r0, g.r1 + 1)
  const data = chartDataOf(matrixOfBlock(block, g))
  if (!data) {
    await officeAlert('插入图表', '所选区域没有可绘图的数据（需要至少两行数值；单格会自动取所在连续数据区）')
    return false
  }
  const anchor = { row: g.r1 + 1, col: g.c0, wPx: 480, hPx: 300 }
  try {
    await ctx.add({ kind, title: '图表', source: g, data, anchor })
  } catch {
    // 降级：PNG 仍写真实 drawing（图片级 1:1），并明确告知已按图片插入
    const { bytes } = await chartPng(kind, data)
    await ctx.image(bytes, anchor)
    await officeAlert('插入图表', '原生图表部件写入失败，已按图片插入同一张图：呈现一致，但不支持按源数据刷新。')
  }
  return true
}
