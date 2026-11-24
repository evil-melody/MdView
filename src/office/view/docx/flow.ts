/**
 * 视图接线（P2）：块树 → core/docx/layout.ts 内核 → 视图 PageSlice 契约。
 *
 * 取代 DOM getBoundingClientRect 测量回环：行高由字体内核自算（测量恒 576pt，
 * sdkjs textmeasurer 同规），分页走 flowBlocks（after 豁免 / widow / keepLines /
 * keepNext / 表头重复 / 多栏 / sect 断后换页）。
 *
 * v1 裁决：段落进 flow 为【原子单行块】（lines=[content]）—— 渲染层是块粒度，
 * 行级跨页切段属 P4；表格按行拆（w:tblHeader 重复），与旧 paginate 同契约。
 * 多栏时表格退回整块原子（旧行为：仅单栏逐行拆）。
 *
 * 增量：全量重算 —— 内核原地改 Block，无版本号可依赖；段落测量按指纹缓存
 * （WeakMap + paraSig），未变段落跳过 wasm 预热。度量本身在 FontMeasurer 内幂等。
 * 升级路径（ponytail）：块级 carry 增量分页（flowBlocks 已备 FlowCarry）→ 行级切段（P4）。
 */
import {
  type Block,
  type Inline,
  type PageSetup,
  type Paragraph,
  type RunStyle,
  type Table,
} from '../../core/docx/types'
import { defaultRegistry, type FontMeasurer, type StyleFlags } from '../../core/font/measure'
import {
  layoutParagraph,
  flowBlocks,
  rowFrag,
  type Face,
  type FlowBlock,
  type FlowResult,
  type LineGeom,
  type ParaMeasure,
  type ParaRun,
} from '../../core/docx/layout'
import { layoutTable, type TableCtx } from '../../core/docx/table'
import type { PageSlice, ParaFrag, RowFrag } from './paginate'

export interface FlowEnv {
  page: PageSetup
  /** 文档默认族（原始名，查不到注册表自动回退首表） */
  font: string
  /** 文档默认字号 pt */
  sz: number
  /** 末节起始方式（body 的 sectKind；未知按 nextPage） */
  lastKind: string
}

// ── 段落测量快照 ───────────────────────────────────────────────────────────

interface Snap {
  flat: ParaRun[]
  meas: ParaMeasure
  markSz: number
}

const snapCache = new WeakMap<Paragraph, { sig: string; snap: Snap }>()

/** 段落指纹：run 面 + 文本长 + 间距字段 + 段尾标记。内容变 → 指纹变 → 快照重建 */
function sigOf(p: Paragraph, env: FlowEnv): string {
  const s = [
    `${p.runs.length}`,
    `${p.ps.line ?? 1}|${p.ps.lineRule ?? ''}|${p.ps.before ?? 0}|${p.ps.after ?? 0}|${p.ps.indL ?? 0}|${p.ps.indR ?? 0}`,
    `${p.markSz ?? env.sz}|${p.markFont ?? env.font}`,
    `${p.marker ? p.marker.text + (p.marker.tab ? 1 : 0) : ''}`,
  ]
  for (const r of p.runs) s.push(runSig(r, env.sz))
  return s.join('|')
}

function runSig(r: Inline, docSz: number): string {
  const st = 's' in r ? (r.s as RunStyle | undefined) : undefined
  const sz = st?.sz ?? docSz
  switch (r.t) {
    case 'text': return `t${st?.rfont ?? ''}${st?.b ? 1 : 0}${st?.i ? 1 : 0}${sz}${r.text.length}`
    case 'field': return `f${r.kind}${sz}`
    case 'ref': return `r${r.text.length}${sz}`
    case 'img': return `i${r.w}x${r.h}${r.wrap ? r.wrap.kind : ''}`
    default: return `${r.t}${r.w}x${r.h}`
  }
}

const faceOf = (m: FontMeasurer, sz: number): Face => {
  const mt = m.metrics(sz)
  return { ascent: mt.ascent, descent: -mt.descent } // descender 为负 → 幅值
}

/**
 * 异步预热 → 同步快照。marker 作首伪 run（文本 + 可选制表符），hanging 缩进语义
 * 由渲染层承担，宽度贡献在此计入首行。浮动图片（wp:anchor）不占行高（ascent=0）。
 */
async function snapOf(p: Paragraph, env: FlowEnv): Promise<Snap> {
  const sig = sigOf(p, env)
  const hit = snapCache.get(p)
  if (hit && hit.sig === sig) return hit.snap
  const reg = await defaultRegistry()
  const docSz = env.sz
  // marker 作首伪 run（hanging 缩进的宽度贡献由渲染层承担，此处只计入量）
  const items: (Inline | { t: 'marker'; text: string; s: RunStyle })[] = p.marker
    ? [{ t: 'marker', text: p.marker.text + (p.marker.tab ? '\t' : ''), s: p.marker.s }, ...p.runs]
    : p.runs
  // 唯一 (族,样式) 测量器
  const meas = new Map<string, Promise<FontMeasurer>>()
  const keyOf = (fam: string, st: StyleFlags) => `${fam.toLowerCase()}|${st.bold ? 1 : 0}${st.italic ? 1 : 0}`
  const getM = (st: RunStyle | undefined): Promise<FontMeasurer> => {
    const fam = st?.rfont ?? env.font
    const fl: StyleFlags = { bold: !!st?.b, italic: !!st?.i }
    const k = keyOf(fam, fl)
    let m = meas.get(k)
    if (!m) { m = reg.get(fam, 'word', fl); meas.set(k, m) }
    return m
  }
  const flat: ParaRun[] = []
  const faces: (Face | null)[] = []
  const cums: number[][] = []
  const lens: number[] = []
  const jobs: Promise<void>[] = []
  for (const r of items) {
    const idx = flat.length
    const st: RunStyle | undefined = 's' in r ? (r as { s?: RunStyle }).s : undefined
    const sz = st?.sz ?? docSz
    if (r.t === 'text' || r.t === 'ref' || r.t === 'marker') {
      const text = (r as { text: string }).text
      flat.push({ t: 'text', text, sz })
      const cps = [...text]
      lens.push(cps.length)
      const cum = new Array(cps.length + 1).fill(0)
      cums.push(cum)
      faces.push(null)
      jobs.push(getM(st).then((m) => {
        faces[idx] = faceOf(m, sz)
        // shaped 字簇前缀和（kern+liga 折入 —— sdkjs ParagraphTextShaper.Shape 同路；
        // 旧口径逐码点裸 advance 在 'To' 类 kern 对上偏到 -1pt，x16 实测）
        let acc = 0
        for (const c of m.clusters(text, sz)) {
          const per = c.wPt / c.len
          for (let j = 0; j < c.len && acc + j < cps.length; j++) cum[acc + j + 1] = cum[acc + j] + per
          acc += c.len
        }
        // 防御：字簇覆盖不足全长（理论上不发生）→ 余位回退裸 advance
        for (; acc < cps.length; acc++) cum[acc + 1] = cum[acc] + m.advance(cps[acc].codePointAt(0)!, sz)
      }))
    } else if (r.t === 'field') {
      flat.push({ t: 'obj', sz })
      lens.push(1)
      cums.push([0, 0]) // 域结果宽未知，v1 记 0
      faces.push(null)
      jobs.push(getM(st).then((m) => { faces[idx] = faceOf(m, sz) }))
    } else if (r.t === 'img') {
      const floating = !!r.wrap // wrap 只在 wp:anchor（浮动）时存在；inline 图为 undefined
      flat.push({ t: 'obj', sz })
      lens.push(1)
      cums.push([0, r.w])
      faces.push({ ascent: floating ? 0 : r.h, descent: 0 })
    } else {
      flat.push({ t: 'obj', sz })
      lens.push(1)
      cums.push([0, r.w])
      faces.push({ ascent: r.h, descent: 0 })
    }
  }
  const markSz = p.markSz ?? docSz
  let markFace: Face | null = null
  jobs.push(reg.get(p.markFont ?? env.font, 'word', {}).then((m) => { markFace = faceOf(m, markSz) }))
  await Promise.all(jobs)
  // 全局偏移表（单调推进的线性游标足够：layout 按行区间查询）
  const goff: number[] = []
  let acc = 0
  for (let i = 0; i < lens.length; i++) { goff.push(acc); acc += lens[i] }
  const pm: ParaMeasure = {
    face: (run) => faces[run] ?? markFace ?? { ascent: docSz, descent: 0 },
    width: (from, to) => {
      let w = 0
      for (let i = 0; i < lens.length; i++) {
        const a = Math.max(from, goff[i])
        const b = Math.min(to, goff[i] + lens[i])
        if (b > a) w += cums[i][b - goff[i]] - cums[i][a - goff[i]]
      }
      return w
    },
    endFace: () => markFace ?? { ascent: markSz, descent: 0 },
  }
  const snap: Snap = { flat, meas: pm, markSz }
  snapCache.set(p, { sig, snap })
  return snap
}

// ── 块 → FlowBlock ────────────────────────────────────────────────────────

const colWidth = (env: FlowEnv): number => {
  const p = env.page
  const cols = Math.max(1, p.cols ?? 1)
  return cols > 1 ? (p.w - p.ml - p.mr - (cols - 1) * (p.colGap ?? 0)) / cols : p.w - p.ml - p.mr
}

/**
 * 段落 → 多行 FlowBlock（P4a 行级激活）。detail 的 s/e 用 **marker 平移域**：
 * 拍平流含 marker 前缀（snapOf 伪 run），渲染域从正文 0 起算 → s = 行 start − marker 长。
 * marker 行首片段以负 s 表达（渲染层截断）；'\n' 归前驱行尾（layout 语义原样透传）。
 */
async function paraFlow(p: Paragraph, env: FlowEnv): Promise<FlowBlock> {
  const snap = await snapOf(p, env)
  const xLimit = Math.max(10, colWidth(env) - (p.ps.indL ?? 0) - (p.ps.indR ?? 0))
  const L = layoutParagraph(snap.flat, snap.meas, { xLimit, ps: p.ps, markSz: snap.markSz })
  const mlen = p.marker ? [...(p.marker.text + (p.marker.tab ? '\t' : ''))].length : 0
  return {
    lines: L.lines.map((l) => l.h),
    detail: L.lines.map((l): LineGeom => ({
      s: l.start - mlen,
      e: l.end - mlen,
      h: l.h,
      a: l.m.a,
      w: l.width,
      f: l.forced,
      sp: l.sp,
    })),
    before: L.before,
    after: L.after,
    widow: L.widow,
    keepLines: L.keepLines,
    keepNext: L.keepNext,
    brk: L.brk || !!p.pb,
    xLimit,
  }
}

/** 表树全部段落异步预热（快照进 snapCache，供内核同步消费） */
async function warmTable(t: Table, env: FlowEnv): Promise<void> {
  const jobs: Promise<unknown>[] = []
  const walk = (blocks: Block[]) => {
    for (const b of blocks) {
      if (b.t === 'p') jobs.push(snapOf(b, env))
      else if (b.t === 'tbl') walk(b.rows.flatMap((r) => r.cells.flatMap((c) => c.blocks)))
    }
  }
  walk(t.rows.flatMap((r) => r.cells.flatMap((c) => c.blocks)))
  await Promise.all(jobs)
}

const ZERO_PM: ParaMeasure = { face: () => ({ ascent: 11, descent: 0 }), width: () => 0, endFace: () => ({ ascent: 11, descent: 0 }) }

/** snapCache → 内核同步测量面（预热后必命中；漏网回退零宽面防崩） */
function tableCtx(env: FlowEnv): TableCtx {
  return {
    pm: (p) => snapCache.get(p)?.snap.meas ?? ZERO_PM,
    markSz: (p) => snapCache.get(p)?.snap.markSz ?? p.markSz ?? env.sz,
  }
}

/** 表格行高序列（P3 内核：列宽两阶段 + 单元格断行 + 行高结算） */
async function tableLines(t: Table, env: FlowEnv): Promise<number[]> {
  await warmTable(t, env)
  return layoutTable(t, tableCtx(env), colWidth(env)).rows
}

/** 全树 → FlowBlock 序列（sect 断后换页语义与旧 paginate 一致：断 = 下一节的 kind） */
export async function buildFlowBlocks(blocks: Block[], env: FlowEnv): Promise<FlowBlock[]> {
  const breakAfter = new Map<number, string>()
  let nextKind = env.lastKind
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]
    if (b.t !== 'sect') continue
    breakAfter.set(i, nextKind)
    nextKind = b.kind
  }
  const cols = Math.max(1, env.page.cols ?? 1)
  return Promise.all(
    blocks.map(async (b, i): Promise<FlowBlock> => {
      if (b.t === 'p') return paraFlow(b, env)
      if (b.t === 'tbl') {
        const lines = await tableLines(b, env)
        if (cols > 1 || lines.length <= 1) {
          return { lines: [lines.reduce((s, h) => s + h, 0)], before: 0, after: 0, widow: false, keepLines: false, keepNext: false, brk: false, opaque: true }
        }
        const header: number[] = []
        for (let r = 0; r < lines.length && b.rows[r].header; r++) header.push(r)
        return { lines, before: 0, after: 0, widow: false, keepLines: false, keepNext: false, brk: false, header, opaque: true }
      }
      return { lines: [], before: 0, after: 0, widow: false, keepLines: false, keepNext: false, brk: false, brkA: breakAfter.get(i) !== 'continuous' }
    }),
  )
}

// ── FlowResult → PageSlice ────────────────────────────────────────────────

export function slicesOf(res: FlowResult, fbs: FlowBlock[], cols: number): PageSlice[] {
  const out: PageSlice[] = []
  for (const pg of res.pages) {
    if (!pg.parts.length) continue
    let start = Infinity
    let end = -Infinity
    const frags: Record<number, RowFrag> = {}
    const paras: Record<number, ParaFrag> = {}
    for (const p of pg.parts) {
      if (p.bi < start) start = p.bi
      if (p.bi + 1 > end) end = p.bi + 1
      const fb = fbs[p.bi]
      // 拆分表的每个片段都要带 frag（缺了渲染层会画整表）；整表单页 = 无 frag
      if (fb && p.l1 > p.l0 && fb.header !== undefined && !(p.l0 === 0 && p.l1 === fb.lines.length)) {
        frags[p.bi] = rowFrag(fb, p.l0, p.l1)
      }
      // 段落（有 detail = 非表格/sect）：逐行片段**恒物化**——渲染逐行是常态，
      // 不只跨页拆分才带（P4a：浏览器不得参与断行）
      if (fb?.detail && p.l1 > p.l0) {
        const pf = (paras[p.bi] ??= { xl: fb.xLimit ?? 0, lines: [] })
        pf.lines.push(...fb.detail.slice(p.l0, p.l1))
        // 段末行判据：本片段的末行即段落末行（justify 不拉伸末行）
        if (p.l1 >= fb.lines.length) pf.tail = true
      }
    }
    out.push({
      start,
      end,
      used: Math.max(...pg.colUsed),
      frags: Object.keys(frags).length ? frags : undefined,
      paras: Object.keys(paras).length ? paras : undefined,
    })
  }
  // 至少一页：页眉/页脚与页面外壳按 pages.length 渲染
  return out.length ? out : [{ start: 0, end: 0, used: 0 }]
}

/** 入口：块树 → 分页切片（同步消费：调用方 await） */
export async function flowPaginate(blocks: Block[], env: FlowEnv): Promise<PageSlice[]> {
  const fbs = await buildFlowBlocks(blocks, env)
  const cols = Math.max(1, env.page.cols ?? 1)
  const p = env.page
  const res: FlowResult = flowBlocks(fbs, { avail: p.h - p.mt - p.mb, cols, hasPrev: true })
  return slicesOf(res, fbs, cols)
}
