/**
 * 段落行盒 + 分页回环内核 —— sdkjs word 排版的 TS 等价（路线图 P2）。
 *
 * 权威对照（sdkjs release/v10.0.0 原文，逐行核实）：
 *  - CParaLineMetrics（word/Editor/Paragraph_Recalculate.js:2963-3110）
 *      Update               :2970  逐分量取 max，出口恒夹 Ascent≥TextAscent / Descent≥TextDescent
 *      Recalculate_LineGap  :3003  auto 倍数只乘文本高；exact 下限 max(25.4/72, line) 并按
 *                                   Descent→Ascent→比例 三级削减超垂；atLeast 只补到目标高
 *      UpdateLineGap        :2993  atLeast 特例：行盒超文本高时 Gap 并入 Ascent（Word 文本坐底）
 *  - 行边界（:1448-1635）Before 只在本段首页计（private_CheckNeedBeforeSpacing :2605）；
 *      After 只在段尾行计；after 溢出豁免 :1600 —— Bottom 超 YLimit 且超出量 ≤ After
 *      时钳到 YLimit，不换页
 *  - 分页回退：widow/orphan（:1893 新页首行判定 + :2524 本页残留判定）、
 *      keepLines（:2552 整段挪下页）、keepNext（:14675 与下段必须同页）
 *  - 空行高度回退（:1284-1345）：行内无内容时用【段尾标记】的编译度量撑行
 *
 * 单位：全链路 pt。sdkjs 内部是 mm，其 exact 下限 `25.4/72` 即 1pt，此处直接写成 1。
 * 断行原语复用 core/font/wrap.ts（P1：LineBreakPos 回退 / 230 禁则 / 原子词硬断）。
 */
import { wrapLine, type MeasureFn, type WrapLine } from '../font/wrap'

/** AscFormat 的 exact 下限 25.4/72 mm ≡ 1pt（Paragraph_Recalculate.js:3017） */
export const EXACT_MIN_PT = 1
const EPS = 1e-3

// ── 行度量（CParaLineMetrics 等价） ────────────────────────────────────────

export interface LineMetrics {
  /** 行内最高文本上升部（不含 overhang） */
  ta: number
  /** 行内最深文本下降部（幅值，恒非负） */
  td: number
  /** 含 overhang 的实际上升部 */
  a: number
  /** 含 overhang 的实际下降部 */
  d: number
  /** 行距附加间隙（规则结算后） */
  gap: number
}

export const newMetrics = (): LineMetrics => ({ ta: 0, td: 0, a: 0, d: 0, gap: 0 })

/** Update（:2970） */
export function updateMetrics(m: LineMetrics, ta: number, td: number, a: number, d: number): void {
  if (ta > m.ta) m.ta = ta
  if (td > m.td) m.td = td
  if (a > m.a) m.a = a
  if (d > m.d) m.d = d
  if (m.a < m.ta) m.a = m.ta
  if (m.d < m.td) m.d = m.td
}

export interface LineRule {
  rule: 'auto' | 'exact' | 'atLeast'
  /** auto = 倍数（1 = 单倍）；exact/atLeast = pt */
  line: number
}

/**
 * Recalculate_LineGap + UpdateLineGap（:2993-3090）的合并式（返回行盒高 a+d+gap）。
 * 三个分支逐式移植，含 atLeast 的「Gap 并入 Ascent」特例。
 */
export function resolveLineGap(m: LineMetrics, lr: LineRule): number {
  switch (lr.rule) {
    case 'auto': {
      m.gap = (m.ta + m.td) * (lr.line - 1)
      break
    }
    case 'exact': {
      const ex = Math.max(EXACT_MIN_PT, lr.line)
      const gap = m.a + m.d - ex
      if (gap > 0) {
        let g = gap
        const dd = m.d - m.td
        if (dd > 0) { if (dd < g) { m.d = m.td; g -= dd } else { m.d -= g; g = 0 } }
        const ad = m.a - m.ta
        if (g > 0 && ad > 0) { if (ad < g) { m.a = m.ta; g -= ad } else { m.a -= g; g = 0 } }
        if (g > 0) {
          const sum = m.ta + m.td
          m.a = (m.ta * (sum - g)) / sum
          m.d = (m.td * (sum - g)) / sum
        }
      } else {
        m.a -= gap // 欠垂：差额全垫进 Ascent
      }
      m.gap = 0
      break
    }
    case 'atLeast': {
      const tl = m.ta + m.td
      const rl = m.a + m.d
      m.gap = Math.abs(tl) < EPS || rl >= lr.line ? 0 : lr.line - rl
      if (rl + m.gap > tl) {
        m.a += m.gap
        m.gap = 0
      }
      break
    }
  }
  return m.a + m.d + m.gap
}

// ── 段落 → 行盒 ────────────────────────────────────────────────────────────

export interface Face { ascent: number; descent: number }

/** 排版测量契约（由 core/font/measure 装配；本内核不碰 wasm） */
export interface ParaMeasure {
  /** run 在给定字号下的文本面度量（descent 取幅值语义，即正数） */
  face(run: number, sizePt: number): Face
  /** 拍平字符流 [from,to) 的宽度（pt） */
  width(from: number, to: number): number
  /** 段尾标记度量：空行的撑高来源（:1326 useParaEnd 分支） */
  endFace(sizePt: number): Face
}

/** 段落 run 的最小输入面：文本展开码点，非文本对象占一位（0xFFFC） */
export interface ParaRun { t: string; text?: string; sz?: number }

export interface FlatSlot { at: number; len: number; sz: number; idx: number }

export function flattenRuns(runs: ParaRun[]): { slots: FlatSlot[]; chars: number[] } {
  const slots: FlatSlot[] = []
  const chars: number[] = []
  runs.forEach((r, idx) => {
    const at = chars.length
    if (r.t === 'text' && r.text !== undefined) for (const ch of r.text) chars.push(ch.codePointAt(0)!)
    else chars.push(0xfffc)
    slots.push({ at, len: chars.length - at, sz: r.sz ?? 11, idx })
  })
  return { slots, chars }
}

/** 拍平下标 → 所属 run 槽（slots 按 at 升序，线性游标即可：调用方单调推进） */
function slotAt(slots: FlatSlot[], i: number): FlatSlot {
  let lo = 0
  let hi = slots.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (slots[mid].at <= i) lo = mid
    else hi = mid - 1
  }
  return slots[lo]
}

/** 行内逐 run 取 max 的面度量（sdkjs 沿 range 调 Update 的节奏） */
function metricsFor(slots: FlatSlot[], from: number, to: number, pm: ParaMeasure): LineMetrics {
  const m = newMetrics()
  let i = from
  while (i < to) {
    const s = slotAt(slots, i)
    const end = Math.min(to, s.at + s.len)
    const f = pm.face(s.idx, s.sz)
    updateMetrics(m, f.ascent, f.descent, f.ascent, f.descent)
    i = end
  }
  return m
}

export interface ParaLine {
  /** 拍平流的 [start,end)；手动换行的 \n 计入前一行尾部 */
  start: number
  end: number
  /** 可见宽（不含行尾空格，wrap.ts 的 SpacesRight 语义） */
  width: number
  /** 行末是硬断（\n 或原子词硬截） */
  forced: boolean
  m: LineMetrics
  h: number
  /** 行内可拉伸空格数（justify 分母；尾随空格 / tab / \n 不计 —— wrap.ts SpacesRight 同源） */
  sp: number
}

/** [from,to) 内可拉伸空格数：先剔尾随空格，再数剩余 U+0020 */
function countSpaces(chars: number[], from: number, to: number): number {
  let visEnd = to
  while (visEnd > from && chars[visEnd - 1] === 0x20) visEnd--
  let n = 0
  for (let i = from; i < visEnd; i++) if (chars[i] === 0x20) n++
  return n
}

export interface ParaLayout {
  lines: ParaLine[]
  /** 行盒总高（不含 Before/After） */
  content: number
  before: number
  after: number
  widow: boolean
  keepLines: boolean
  keepNext: boolean
  brk: boolean
}

export interface ParaSpacing {
  before?: number
  after?: number
  line?: number
  lineRule?: 'auto' | 'exact' | 'atLeast'
  widow?: boolean
  keepLines?: boolean
  keepNext?: boolean
  pageBreakBefore?: boolean
}

export interface LayoutParaOpts {
  /** 可用文宽（pt，已扣页边距 / 栏宽 / 缩进） */
  xLimit: number
  ps: ParaSpacing
  /** 段尾标记字号（空行撑高用） */
  markSz?: number
}

/**
 * 段落 → 行盒序列。'\n'（w:br）先切段，每段独立贪心断行；空段走段尾标记回退。
 * 行高结算 = resolveLineGap（auto/exact/atLeast 三规则）。
 */
export function layoutParagraph(runs: ParaRun[], pm: ParaMeasure, o: LayoutParaOpts): ParaLayout {
  const { slots, chars } = flattenRuns(runs)
  const ps = o.ps
  const lr: LineRule = { rule: ps.lineRule ?? 'auto', line: ps.line ?? 1 }
  const markSz = o.markSz ?? runs[runs.length - 1]?.sz ?? 11
  // 逐码点拼接：String.fromCodePoint(...chars) 在长段落上会爆调用栈
  let text = ''
  for (let i = 0; i < chars.length; i++) text += String.fromCodePoint(chars[i])
  const segs = text.split('\n')
  const lines: ParaLine[] = []
  let pos = 0
  for (let si = 0; si < segs.length; si++) {
    const seg = segs[si]
    const segStart = pos
    const segCps = [...seg]
    const segEnd = segStart + segCps.length
    // \n 本身占一个码点位，归本段尾（除末段）
    const last = si === segs.length - 1
    pos = segEnd + (last ? 0 : 1)
    if (!segCps.length) {
      const ef = pm.endFace(markSz)
      const m = newMetrics()
      updateMetrics(m, ef.ascent, ef.descent, ef.ascent, ef.descent)
      const h = resolveLineGap(m, lr)
      lines.push({ start: segStart, end: last ? segEnd : segEnd + 1, width: 0, forced: !last, m, h, sp: 0 })
      continue
    }
    const mf: MeasureFn = (a, b) => pm.width(segStart + a, segStart + b)
    const wl: WrapLine[] = wrapLine(seg, o.xLimit, mf)
    for (let k = 0; k < wl.length; k++) {
      const L = wl[k]
      const isLastLine = k === wl.length - 1
      const m = metricsFor(slots, segStart + L.start, segStart + L.end, pm)
      const h = resolveLineGap(m, lr)
      lines.push({
        start: segStart + L.start,
        end: segStart + L.end + (isLastLine && !last ? 1 : 0),
        width: L.width,
        forced: !isLastLine || !last,
        m,
        h,
        sp: countSpaces(chars, segStart + L.start, segStart + L.end),
      })
    }
  }
  return {
    lines,
    content: lines.reduce((s, L) => s + L.h, 0),
    before: ps.before ?? 0,
    after: ps.after ?? 0,
    widow: ps.widow !== false,
    keepLines: !!ps.keepLines,
    keepNext: !!ps.keepNext,
    brk: !!ps.pageBreakBefore,
  }
}

/** ParaLayout → 分页输入 */
export function toFlow(l: ParaLayout): FlowBlock {
  return {
    lines: l.lines.map((L) => L.h),
    before: l.before,
    after: l.after,
    widow: l.widow,
    keepLines: l.keepLines,
    keepNext: l.keepNext,
    brk: l.brk,
  }
}

// ── 分页回环 ───────────────────────────────────────────────────────────────

/**
 * 行几何（P4a 渲染层消费）：拍平字符流 [s,e)（含 marker 前缀、\\n 归前驱）、
 * 行盒高 h、上升部 a（基线定位）、可见宽 w（不含行尾空格）、forced（硬断）。
 * 单一真值原则（对齐 sdkjs recalc 期回写 WidthVisible）：分页/渲染/对齐共读同值。
 */
export interface LineGeom {
  s: number
  e: number
  h: number
  /** 基线距行顶（= 行盒上升部 a）：渲染层 strut 定位用 */
  a: number
  /** 可见宽（不含行尾空格）—— 布局期回写的单一真值 */
  w: number
  f: boolean
  /** 行内可拉伸空格数（justify 分母；tab 不计） */
  sp: number
}

export interface FlowBlock {
  /** 行高序列（pt）。表格用「每行一条」+ header 表达；空数组 = 无形块（sect） */
  lines: number[]
  before: number
  after: number
  widow: boolean
  keepLines: boolean
  keepNext: boolean
  brk: boolean
  /** 续页需重复的行下标（w:tblHeader）；仅 l0>0 的续页计入 */
  header?: number[]
  /** 不可断块（图片 / 单行表）：不参与 widow/keepNext 链 */
  opaque?: boolean
  /** 断后换页（sect 块的 kind !== 'continuous'）：本块放完后强制换页 */
  brkA?: boolean
  /** 段落行几何（与 lines 等长，逐行）；表格/sect 无 → slicesOf 据此识别段落 */
  detail?: LineGeom[]
  /** 段落行可用宽（pt）：justify slack 的唯一来源（渲染层不得二次测量） */
  xLimit?: number
}

export interface FlowPart {
  /** 块下标 */
  bi: number
  /** 行区间 [l0,l1)；无形块 = [0,0) */
  l0: number
  l1: number
  /** 所在栏 */
  col: number
  /** 放置前的栏底水位（卷回复位用） */
  u0: number
  /** 放置后的栏底水位（pt，含已结算的 Before/After） */
  used: number
}

export interface FlowPage {
  /** 按放置顺序排列的片段；同块跨栏/跨页各成一条，互不覆盖 */
  parts: FlowPart[]
  /** 各栏底部水位（pt），换栏不清他栏 */
  colUsed: number[]
}

export interface FlowOpts {
  avail: number
  cols?: number
  /** 文档首块无前文：widow/keepNext/keepLines 的回退不触发（:2529 Get_DocumentPrev()≠null） */
  hasPrev?: boolean
}

export interface FlowCarry {
  /** 从第几个块起算（前面的块由调用方的页序承接） */
  from: number
  used: number
  col: number
}

export interface FlowResult {
  pages: FlowPage[]
  /** 决策轨迹：探针断言用（每次换栏/换页/回退的原因） */
  trace: string[]
}

/**
 * 贪心分页 + sdkjs 回退语义（多栏：页 = N 栏，各栏独立水位，片段带 col）。
 * 判定先于放置，避免撤销放置：
 *  1. 一行都放不下 → 换栏 → 换页（空页则强放一行防死循环）；
 *  2. 段尾 after 豁免（:1600）：只有 After 超高 → 钳到 avail 不换页；
 *  3. keepLines（:2552）：段会被切断 → 整段挪下页/栏；
 *  4. widow/orphan（:1893+:2524）：任一侧残留 <2 行 → 整段挪下页；
 *  5. keepNext（:14675）：下段首行落不进本页 → 本段整段挪下页。
 * 续页不带 Before（:2605）；表格续页先付重复表头高。
 *
 * keepNext 链卷回：3/4/5 任一触发时，本页上方若有 keepNext 的前段，连同它们
 * 一起挪走 —— sdkjs 的整页回退节奏（:1893 Set_WidowControl 后从 CurLine 重算）；
 * 否则标题会被孤行规则孤在上一页。卷回 = 截断 parts 数组 + 按剩余片段重算各栏水位。
 */
export function flowBlocks(blocks: FlowBlock[], o: FlowOpts, carry?: FlowCarry): FlowResult {
  const cols = Math.max(1, o.cols ?? 1)
  const avail = o.avail
  const hasPrev = o.hasPrev !== false
  const pages: FlowPage[] = []
  const trace: string[] = []
  let col = carry?.col ?? 0
  let cur: FlowPage = { parts: [], colUsed: new Array(cols).fill(0) }
  if (carry) cur.colUsed[col] = carry.used
  /** 各块开始放置前的 (栏, 水位)（卷回复位用） */
  const snap = new Map<number, { col: number; used: number }>()
  let firstPage = true
  const pushPage = () => {
    pages.push(cur)
    cur = { parts: [], colUsed: new Array(cols).fill(0) }
    col = 0
    firstPage = false
  }
  const occupied = () => cur.parts.length > 0 || cur.colUsed.some((u) => u > 0)
  /** 卷回后按剩余片段重算各栏水位；首页的 carry 水位在无片段时保留 */
  const recompute = () => {
    cur.colUsed.fill(0)
    if (firstPage && carry) cur.colUsed[carry.col] = carry.used
    for (const p of cur.parts) {
      if (p.used > cur.colUsed[p.col]) cur.colUsed[p.col] = p.used
    }
  }
  /** 换栏（同页），栏满则换页。不清他栏水位。 */
  const advance = (why: string, bi: number) => {
    if (col + 1 < cols) { col++; trace.push(`${why}-col:${bi}`) }
    else { pushPage(); trace.push(`${why}:${bi}`) }
  }
  /**
   * 重定位（换栏→换页），连带卷回 keepNext 前段。返回 -1 = 放弃重定位：
   * 目标块已在页原点（首栏顶部），挪过去结果不变 —— 对应 sdkjs 的
   * RecalcInfo.Can_RecalcWidowControl() 重试闸门（:1899/:2529），防死循环。
   * 续页情形（l0>0）：整块卷回，从 l0=0 在新栏重排（已在原点则放弃）。
   */
  const relocate = (why: string, bi: number): number => {
    let j = bi
    let s: { col: number; used: number }
    if (l0 > 0) {
      // 续行放不进：整块卷回重排（:1893 段 ≤3 行 → CurLine=0 重算）。
      // 片段已提交到前页则无从撤销 → 放弃；片段起点已在页原点 → 放弃。
      const p = cur.parts.find((q) => q.bi === bi)
      if (!p || (p.col === 0 && p.u0 === 0)) { trace.push(`${why}-accept:${bi}`); return -1 }
      s = { col: p.col, used: p.u0 }
    } else {
      const floor = carry?.from ?? 0
      while (j - 1 >= floor && blocks[j - 1].keepNext && cur.parts.some((q) => q.bi === j - 1)) j--
      s = snap.get(j) ?? { col, used: cur.colUsed[col] }
      if (s.col === 0 && s.used === 0) { trace.push(`${why}-accept:${bi}`); return -1 }
    }
    const cut = cur.parts.findIndex((p) => p.bi >= j)
    if (cut >= 0) cur.parts.length = cut
    recompute()
    col = s.col // 组起点栏：advance 从这里起跳，避免跳栏
    advance(why, bi)
    return j
  }
  /** 下一个有形块（keepNext 的「下一段首行」判定对象） */
  const nextText = (bi: number): FlowBlock | undefined => {
    for (let k = bi + 1; k < blocks.length; k++) if (blocks[k].lines.length) return blocks[k]
    return undefined
  }

  // 单层游标 (bi, l0)：任何重定位后重新读 blocks[bi]，避免捕获的 b/n 过期。
  // split 不卷回 —— keepNext 只要求「下一段首行同页」，本段续页不影响已放的标题。
  let bi = carry?.from ?? 0
  let l0 = 0
  let spins = 0
  const cap = blocks.length * 8 + 32
  while (bi < blocks.length) {
    if (++spins > cap) throw new Error(`flow loop exceeded at block ${bi}`)
    const b = blocks[bi]
    if (!b.lines.length) {
      if (b.brk && occupied()) { pushPage(); trace.push(`break:${bi}`) }
      cur.parts.push({ bi, l0: 0, l1: 0, col, u0: cur.colUsed[col], used: cur.colUsed[col] })
      // 断后换页无条件：sect 片段已落原页尾，新页从下一块起（与旧 paginate 的 next(i+1) 同构）
      if (b.brkA) { pushPage(); trace.push(`break-after:${bi}`) }
      bi++; l0 = 0; continue
    }
    const n = b.lines.length
    const fresh = l0 === 0
    if (fresh && b.brk && occupied()) { pushPage(); trace.push(`break:${bi}`); continue }
    if (fresh) snap.set(bi, { col, used: cur.colUsed[col] })
    const repH = fresh ? 0 : (b.header ?? []).reduce((s, r) => s + Math.max(0, b.lines[r] ?? 0), 0)
    let y = cur.colUsed[col] + repH + (fresh ? b.before : 0)
    let fitted = l0
    for (let li = l0; li < n; li++) {
      const isLast = li === n - 1
      const nextY = y + Math.max(0, b.lines[li] ?? 0) + (isLast ? b.after : 0)
      if (nextY > avail + EPS) {
        // after 溢出豁免（:1600）：段尾仅 After 超高 → 钳边界不换页
        if (isLast && b.after > 0 && nextY - avail <= b.after + EPS) { y = avail; fitted = li + 1 }
        break
      }
      y = nextY
      fitted = li + 1
    }
    if (fitted === l0) {
      const j = relocate('nofit', bi)
      if (j < 0) { fitted = l0 + 1; y = avail } // 原点强放防死循环
      else { bi = j; l0 = 0; continue }
    }
    const whole = fitted === n
    if (!whole) {
      // keepLines：段不可切（:2552）。opaque（表格）天然可切，不参与
      if (b.keepLines && !b.opaque && hasPrev) {
        const j = relocate('keeplines', bi)
        if (j >= 0) { bi = j; l0 = 0; continue }
      }
      // widow/orphan：任一侧残留 <2 行（:1893 新页首行 + :2524 本页残留）
      if (b.widow && !b.opaque && hasPrev && (fitted - l0 < 2 || n - fitted < 2)) {
        const j = relocate('widow', bi)
        if (j >= 0) { bi = j; l0 = 0; continue }
      }
    }
    if (whole && b.keepNext && !b.opaque && hasPrev) {
      const nx = nextText(bi)
      if (nx && y + nx.before + Math.max(0, nx.lines[0]) > avail + EPS) {
        const j = relocate('keepnext', bi)
        if (j >= 0) { bi = j; l0 = 0; continue }
      }
    }
    cur.parts.push({ bi, l0, l1: fitted, col, u0: cur.colUsed[col], used: y })
    cur.colUsed[col] = y
    if (whole) {
      if (b.brkA) { pushPage(); trace.push(`break-after:${bi}`) }
      bi++; l0 = 0
    } else { l0 = fitted; advance('split', bi) }
  }
  if (occupied() || !pages.length) pages.push(cur)
  return { pages, trace }
}

/** 页 → 表格行片段（与视图层 RowFrag 契约对齐：r0/r1 + 续页重复表头） */
export function rowFrag(b: FlowBlock, l0: number, l1: number): { r0: number; r1: number; repeat: number[] } {
  return { r0: l0, r1: l1, repeat: l0 > 0 ? (b.header ?? []).slice() : [] }
}
