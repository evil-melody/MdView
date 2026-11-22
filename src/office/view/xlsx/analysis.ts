/**
 * 表格数据分析的纯计算层：从 OfficeSheetView.vue 拆出（行为不变）。
 * 读全表矩阵 → 前端聚合 → 生成分类汇总/透视的写回计划；调用方只负责 RPC 编排（sheetOp/setCells）。
 */
import type { DocumentClient, BlockOut } from '../../client'
import type { Range } from '../../core/xlsx/types'

export interface Matrix { m: string[][]; lastR: number; lastC: number }

export const AGGS: Record<string, string> = { 求和: 'sum', 计数: 'count', 平均: 'avg', 最大: 'max', 最小: 'min' }
export const AGG_LABEL: Record<string, string> = { sum: '求和', count: '计数', avg: '平均', max: '最大', min: '最小' }

/** 列号 → 列字母（A / AA …） */
export function colName(c: number) {
  let s = ''
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

export function numOf(s: string) {
  const n = Number(String(s).replace(/[,¥$\s%]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function aggregate(vals: number[], how: string) {
  if (how === 'count') return vals.length
  if (!vals.length) return 0
  const sum = vals.reduce((a, b) => a + b, 0)
  const v = how === 'avg' ? sum / vals.length
    : how === 'max' ? Math.max(...vals)
      : how === 'min' ? Math.min(...vals)
        : sum
  return Math.round(v * 100) / 100
}

/** 读全表并返回真实数据边界：结果写到数据区紧邻的下方/右侧，而不是第 200 行 */
export async function readMatrix(client: DocumentClient, sheet: number, rows: number): Promise<Matrix> {
  const n = Math.max(1, Math.min(Math.max(rows, 200), 5000))
  const block: BlockOut = await client.call('xlsx.block', sheet, 0, n)
  const m: string[][] = Array.from({ length: n }, () => [])
  let lastR = -1, lastC = -1
  for (const row of block.rows) {
    if (row.r >= n) continue
    for (const v of row.cells) {
      const t = String(v[1] ?? '')
      m[row.r][v[0]] = t
      if (t.trim()) { lastR = Math.max(lastR, row.r); lastC = Math.max(lastC, v[0]) }
    }
  }
  return { m, lastR, lastC }
}

/** 自动识别分组列 / 数值列：光标停在空白格时也按数据区推断，避免默认参数指向空列 */
export function guessFields(d: Matrix, g: Range) {
  const gc = g.c1 > g.c0 && g.c0 <= d.lastC ? g.c0 : 0
  const numCols: number[] = []
  for (let c = 0; c <= d.lastC; c++) {
    let nums = 0
    for (let r = 1; r <= d.lastR; r++) {
      const t = (d.m[r][c] ?? '').trim()
      if (t && Number.isFinite(Number(t.replace(/[,¥$\s%]/g, '')))) nums++
    }
    if (nums) numCols.push(c)
  }
  // 光标停在数值列时汇总该列；否则取最右数值列（薪资 / 金额通常是最后一列）
  const vc = (g.c0 === g.c1 && numCols.includes(g.c0)) ? g.c0
    : (numCols[numCols.length - 1] ?? Math.min(gc + 1, Math.max(0, d.lastC)))
  return { gc, vc }
}

/** 分类汇总大纲：每组明细行区间 + 小计行（最终行号） */
export interface OutlineGroup { key: string; detail: number[]; subtotal: number; level: number; collapsed: boolean }

/** 在选区/已用范围内推断分组列（最左文本列）与数值列（其余数值列） */
export function inferFields(d: Matrix, g: Range) {
  const clean = (t: string) => t.replace(/[,¥$\s%]/g, '')
  const isNum = (t: string) => { const s = clean(t.trim()); return s !== '' && Number.isFinite(Number(s)) }
  let gc = g.c0
  for (let c = g.c0; c <= g.c1; c++) {
    let nums = 0, texts = 0
    for (let r = g.r0 + 1; r <= g.r1; r++) {
      const t = (d.m[r]?.[c] ?? '').trim()
      if (!t) continue
      if (isNum(t)) nums++; else texts++
    }
    if (texts > 0 && nums === 0) { gc = c; break }
  }
  const vcs: number[] = []
  for (let c = g.c0; c <= g.c1; c++) {
    if (c === gc) continue
    let nums = 0
    for (let r = g.r0 + 1; r <= g.r1; r++) {
      const t = (d.m[r]?.[c] ?? '').trim()
      if (t && isNum(t)) nums++
    }
    if (nums > 0) vcs.push(c)
  }
  return { gc, vcs }
}

/** 对话框字段清单：列名取表头行（空则退回列字母），按数字占比判定数值列 */
export type SheetFieldInfo = { c: number; name: string; numeric: boolean }
export function sheetFields(d: Matrix): SheetFieldInfo[] {
  const out: SheetFieldInfo[] = []
  for (let c = 0; c <= d.lastC; c++) {
    const name = (d.m[0]?.[c] ?? '').trim() || colName(c)
    let nums = 0, texts = 0
    for (let r = 1; r <= d.lastR; r++) {
      const t = (d.m[r]?.[c] ?? '').trim()
      if (!t) continue
      if (Number.isFinite(Number(t.replace(/[,¥$\s%]/g, '')))) nums++
      else texts++
    }
    out.push({ c, name, numeric: nums > 0 && nums >= texts })
  }
  return out
}

/** 分类汇总写回计划：每组插小计行 + 总计行。从下往上插行避免行号错位；
 *  below=false 时小计插到组首、总计插到表头之下（同位时组先插、总计后插到其上方）。 */
export function computeSubtotal(
  d: Matrix, g: Range, gcol: number, how: string, vcs: number[], below: boolean
): { ok: boolean; reason?: string; jobs: { at: number; cells: { r: number; c: number; input: string }[] }[]; outline: OutlineGroup[]; total: number; top: number; left: number; right: number } {
  const top = g.r0, left = g.c0, right = g.c1
  const bot = Math.min(g.r1, d.lastR)
  const groups: { key: string; rows: number[]; last: number }[] = []
  for (let r = top + 1; r <= bot; r++) {
    const k = (d.m[r]?.[gcol] ?? '').trim()
    const last = groups[groups.length - 1]
    if (last && last.key === k) { last.rows.push(r); last.last = r }
    else groups.push({ key: k || '(空白)', rows: [r], last: r })
  }
  if (!groups.length) return { ok: false, reason: 'noRows', jobs: [], outline: [], total: -1, top, left, right }
  const S = groups.length
  const jobs = groups.map((grp) => ({
    at: below ? grp.last + 1 : grp.rows[0],
    cells: [
      { r: 0, c: gcol, input: grp.key },
      ...vcs.map((vc) => ({ r: 0, c: vc, input: String(aggregate(grp.rows.map((rr) => numOf(d.m[rr]?.[vc] ?? '')), how)) }))
    ]
  }))
  jobs.push({
    at: below ? bot + 1 + S : top + 1,
    cells: [
      { r: 0, c: gcol, input: '总计' },
      ...vcs.map((vc) => {
        const all: number[] = []
        for (const grp of groups) for (const rr of grp.rows) all.push(numOf(d.m[rr]?.[vc] ?? ''))
        return { r: 0, c: vc, input: String(aggregate(all, how)) }
      })
    ]
  })
  jobs.sort((a, b) => b.at - a.at) // 稳定排序：组首与总计同位时组先插，总计随后插到其上方
  // 大纲最终行号：下方插入时明细行偏移 i；上方插入时总计行又把后续行再推 1
  const outline: OutlineGroup[] = groups.map((grp, i) => ({
    key: grp.key,
    detail: grp.rows.map((r) => r + i + (below ? 0 : 2)),
    subtotal: (below ? grp.last + 1 : grp.rows[0]) + i + (below ? 0 : 1),
    level: 1,
    collapsed: false
  }))
  return { ok: true, jobs, outline, total: below ? bot + 1 + S : top + 1, top, left, right }
}

/** 透视写回计划：行/列字段可多个（键 " / " 拼接）；多值字段按值分块（块内一套列键+总计）。结果为静态值。 */
export function computePivot(
  d: Matrix, rowFs: number[], colFs: number[], valFs: { c: number; agg: string }[]
): { ok: boolean; reason?: string; cells: { r: number; c: number; input: string }[]; start: number } {
  if (!valFs.length) return { ok: false, reason: 'valueField', cells: [], start: 0 }
  const name = (c: number) => (d.m[0]?.[c] ?? '').trim() || colName(c)
  const rowKeys: string[] = [], colKeys: string[] = []
  const grid = new Map<string, number[][]>()
  for (let r = 1; r <= d.lastR; r++) {
    const rawR = rowFs.map((f) => (d.m[r]?.[f] ?? '').trim())
    const rawC = colFs.map((f) => (d.m[r]?.[f] ?? '').trim())
    const rawV = valFs.map((v) => (d.m[r]?.[v.c] ?? '').trim())
    if (!rawR.join('') && !rawC.join('') && !rawV.join('')) continue
    const rk = rowFs.length ? rawR.filter(Boolean).join(' / ') || '(空白)' : '全部'
    const ck = colFs.length ? rawC.filter(Boolean).join(' / ') || '(空白)' : '全部'
    if (!rowKeys.includes(rk)) rowKeys.push(rk)
    if (!colKeys.includes(ck)) colKeys.push(ck)
    const k = `${rk}\u0000${ck}`
    if (!grid.has(k)) grid.set(k, valFs.map(() => [] as number[]))
    valFs.forEach((_, vi) => grid.get(k)![vi].push(numOf(rawV[vi])))
  }
  if (!rowKeys.length) return { ok: false, reason: 'noData', cells: [], start: 0 }
  const start = d.lastC + 2
  const out: { r: number; c: number; input: string }[] = []
  const colTotal = colFs.length > 0
  const rowTotal = rowFs.length > 0
  const W = colKeys.length + (colTotal ? 1 : 0)
  const title = `${rowFs.length ? rowFs.map(name).join(' / ') : '全部'} ／ ${colFs.length ? colFs.map(name).join(' / ') : '全部'}`
  let hr = 0 // 表头占用行数（多值字段时为 2）
  if (valFs.length === 1) {
    const v = valFs[0]
    out.push({ r: 0, c: start, input: title })
    colKeys.forEach((k, i) => out.push({ r: 0, c: start + 1 + i, input: colFs.length ? k : `${AGG_LABEL[v.agg]}:${name(v.c)}` }))
    if (colTotal) out.push({ r: 0, c: start + 1 + colKeys.length, input: '总计' })
    rowKeys.forEach((rk, ri) => {
      const r = ri + 1
      out.push({ r, c: start, input: rk })
      const all: number[] = []
      colKeys.forEach((ck, ci) => {
        const vals = (grid.get(`${rk}\u0000${ck}`) ?? [])[0] ?? []
        all.push(...vals)
        out.push({ r, c: start + 1 + ci, input: vals.length ? String(aggregate(vals, v.agg)) : '' })
      })
      if (colTotal) out.push({ r, c: start + 1 + colKeys.length, input: String(aggregate(all, v.agg)) })
    })
  } else {
    out.push({ r: 0, c: start, input: title })
    hr = 1
    valFs.forEach((v, vi) => {
      const b0 = start + 1 + vi * W
      out.push({ r: 0, c: b0, input: name(v.c) })
      colKeys.forEach((k, ci) => out.push({ r: 1, c: b0 + ci, input: colFs.length ? k : AGG_LABEL[v.agg] }))
      if (colTotal) out.push({ r: 1, c: b0 + colKeys.length, input: '总计' })
    })
    rowKeys.forEach((rk, ri) => {
      const r = hr + 1 + ri
      out.push({ r, c: start, input: rk })
      valFs.forEach((v, vi) => {
        const b0 = start + 1 + vi * W
        const all: number[] = []
        colKeys.forEach((ck, ci) => {
          const vals = (grid.get(`${rk}\u0000${ck}`) ?? [])[vi] ?? []
          all.push(...vals)
          out.push({ r, c: b0 + ci, input: vals.length ? String(aggregate(vals, v.agg)) : '' })
        })
        if (colTotal) out.push({ r, c: b0 + colKeys.length, input: String(aggregate(all, v.agg)) })
      })
    })
  }
  if (rowTotal) {
    const tr = hr + 1 + rowKeys.length
    out.push({ r: tr, c: start, input: '总计' })
    valFs.forEach((v, vi) => {
      const b0 = start + 1 + vi * W
      colKeys.forEach((ck, ci) => {
        const vals: number[] = []
        for (const rk of rowKeys) vals.push(...((grid.get(`${rk}\u0000${ck}`) ?? [])[vi] ?? []))
        out.push({ r: tr, c: b0 + ci, input: String(aggregate(vals, v.agg)) })
      })
      if (colTotal) out.push({ r: tr, c: b0 + colKeys.length, input: String(aggregate(grandOf(grid, vi), v.agg)) })
    })
  }
  return { ok: true, cells: out, start }
}

/** 多值字段某列的总计：该值字段在所有行×列块里的全部数值 */
function grandOf(grid: Map<string, number[][]>, vi: number): number[] {
  const all: number[] = []
  for (const cells of grid.values()) all.push(...(cells[vi] ?? []))
  return all
}
