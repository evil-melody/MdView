<script setup lang="ts">
/** Excel 视图：二维虚拟网格 + 按需行块；内核只解析可见区域，DOM 与行数无关。
 *  冻结窗格：frozen 行/列单元动态加回 scroll 偏移实现钉住；数据外铺 pad 行/列，滚动近边缘继续延伸。 */
import { ref, shallowRef, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import type { DocumentClient, OpenResult, SheetProgress, BlockOut, CellDetail, CellCss, FmtPatch } from '../client'
import type { CellOut, SheetOp, BookOp, XlsxDrawingInfo, XlsxDrawingOp, Merge, SheetFeatures, CondFmtRule, ValidationRule, SlicerAddOp, PivotFeature, Range as XRange } from '../core/xlsx/types'
import { Axis } from '../view/xlsx/axis'
import { chartDataOf, chartPng, type ChartKind } from '../view/xlsx/chartpng'
import { prepareImage } from '../view/xlsx/image'
import { mediaDataUrl } from '../view/xlsx/media'
import { isTextEntry, focusAnchor } from '../view/xlsx/focus'
import { checkValidation } from '../view/xlsx/validate'
import { cellCssAt, mergedCss } from '../view/xlsx/cellstyle'
import { clamp, norm, parseAddr } from '../view/xlsx/addr'
import { makeRibbonExtra } from '../view/xlsx/ribbon-extra'
import {
  AGGS, colName, computePivot, computeSubtotal, guessFields, inferFields, readMatrix,
  sheetFields, type Matrix, type OutlineGroup, type SheetFieldInfo
} from '../view/xlsx/analysis'
import { officePrompt, officeAlert } from './officePrompt'
import OfficeSubtotalDialog from './OfficeSubtotalDialog.vue'
import OfficePivotDialog from './OfficePivotDialog.vue'
import OfficeSeriesDialog from './OfficeSeriesDialog.vue'
import OfficeSheetDrawingLayer from './OfficeSheetDrawingLayer.vue'
import OfficeSheetFeatureLayer from './OfficeSheetFeatureLayer.vue'
import OfficeFeatureDialogs from './OfficeFeatureDialogs.vue'

type Rect = { r0: number; c0: number; r1: number; c1: number }
const props = defineProps<{ client: DocumentClient; editable: boolean; info: OpenResult; transcodeImage?: (bytes: Uint8Array) => Promise<ArrayBuffer | null> }>()
const emit = defineEmits<{ (e: 'change'): void; (e: 'error', m: string): void }>()
const meta = props.info.xlsx!
const sheets = shallowRef(meta.sheets.filter((s) => !s.hidden))
const sheet = ref(sheets.value[0]?.index ?? 0)
const progress = shallowRef<SheetProgress>({ sheet: 0, rows: 0, cols: 0, rowSizes: [], done: false })
const rowAxis = new Axis(24)
const colAxis = new Axis(100)
/** 行 → 该行已取回的单元格；编辑后整体失效 */
const blockCache = new Map<number, CellOut[]>()
const version = ref(0)
const scrollEl = ref<HTMLElement | null>(null)
const pasteAnchor = ref<HTMLElement | null>(null)
const atAnchor = () => isTextEntry(document.activeElement, pasteAnchor.value)
const refocusAnchor = () => focusAnchor(pasteAnchor, props.editable)
const scrollTop = ref(0)
const scrollLeft = ref(0)
const viewportH = ref(700)
const viewportW = ref(1200)
const sel = ref({ r: 0, c: 0 })
/** 范围选区：单元格 / 整行 / 整列 / 全选（Cmd+A），Esc 或点击回到单格 */
const rangeSel = ref<Rect | null>(null)
/** Ctrl/Cmd 加选的独立选区（Excel 多区选择）；主选区仍是 rangeSel */
const multi = ref<Rect[]>([])
/** 拖选锚点：Shift+点击 / 方向键扩展都从这里算 */
const anchor = ref({ r: 0, c: 0 })
const dragMode = ref<'cell' | 'row' | 'col' | 'fill' | 'move' | 'colw' | 'rowh' | ''>('')
const dragRect = ref<Rect | null>(null)
let dragBase: Rect | null = null
let dragDir: 'down' | 'up' | 'left' | 'right' = 'down'
const editing = ref(false)
/** 直输填满选区时的目标格集合（空 = 只写活动格） */
const editTargets = ref<{ r: number; c: number }[]>([])
const editText = ref('')
const formula = ref('')
const loadToken = ref(0)
/** 数据外延伸的空行/列数，滚动近边缘续接 */
const padRows = ref(120)
const padCols = ref(24)
/** 工具条可见状态：缩放 / 网格线 / 冻结 / 工作表列表 / 格式刷 */
const bar = reactive({ zoom: 1, gridlines: true, frozen: false, painter: false, wrap: false, sheets: [] as { index: number; name: string }[], sheet: 0 })
bar.sheets = sheets.value.map((s) => ({ index: s.index, name: s.name }))
bar.sheet = sheet.value
let painterXf = -1
let ro: ResizeObserver | null = null
const offs: (() => void)[] = []

/** 浮动图片（xlsx drawing）：随载入/切换/布局变更刷新；src 用 data URL（绕开 WKWebView blob URL 解码问题） */
const drawings = shallowRef<(XlsxDrawingInfo & { src: string })[]>([])
async function refreshDrawings() {
  try {
    const res = await props.client.call('xlsx.drawings', sheet.value)
    const list = res.drawings.map((d) => ({ ...d, src: '' }))
    drawings.value = list
    for (const it of list) {
      void mediaDataUrl(props.client, (p) => props.client.call('part', p), it.media)
        .then((u) => {
          // 竞态：并发刷新时 it 可能属于已被替换的旧 list——按 media 在最新数组上定位，避免 src 写丢
          const cur = drawings.value.find((x) => x.media === it.media)
          if (cur) { cur.src = u; drawings.value = [...drawings.value] }
        })
        .catch((e) => emit('error', String(e)))
    }
  } catch {
    drawings.value = []
  }
}

/** 图片 move/resize/delete：一次 RPC 写回内核（px→twoCellAnchor，可撤销）；格内图撑格时回传新布局，视图重排网格后再读回几何 */
async function onDrawingOp(op: XlsxDrawingOp) {
  try {
    const res = await props.client.call('xlsx.drawingOp', sheet.value, op)
    if (res?.layout) applyProgress(res.layout)
    emit('change')
    await refreshDrawings()
    void loadVisible()
  } catch (e) {
    emit('error', String(e))
  }
}
/** 原生 OOXML 特性（chart/condFmt/validation/slicer/pivot）：随载入/切换/撤销/变更刷新 */
const emptyFeat = (): SheetFeatures => ({ charts: [], condFmt: [], validations: [], slicers: [], pivots: [], series: [] })
const features = shallowRef<SheetFeatures>(emptyFeat())
async function refreshFeatures() {
  try { features.value = await props.client.call('xlsx.features', sheet.value) }
  catch { features.value = emptyFeat() }
}
const condDlg = ref(false)
const valDlg = ref(false)
/** 填充→序列对话框：作用于打开时的选区快照 */
const seriesDlg = ref(false)
const dlgRange = ref<Rect>({ r0: 0, c0: 0, r1: 0, c1: 0 })
async function onSeriesConfirm(p: { dir: 'row' | 'col'; type: 'linear' | 'growth' | 'date' | 'auto'; unit: 'day' | 'weekday' | 'month' | 'year'; step: number; stop?: number }) {
  seriesDlg.value = false
  const g = dlgRange.value
  try {
    await sheetOp({ op: 'series', range: g, dir: p.dir, type: p.type, unit: p.unit, step: p.step, stop: p.stop })
    setSelection(g, { r: g.r0, c: g.c0 })
  } catch (e) {
    emit('error', String(e))
  }
}
const slicerDlg = shallowRef<{ fields: { c: number; name: string }[]; source: XRange } | null>(null)
/** 验证下拉选中 → 走 xlsx.set 写入当前单元格 */
async function onFeatureValidationSelect(v: string) {
  await commands.setCells([{ r: sel.value.r, c: sel.value.c, input: v }])
}
/** 切片器按钮点选 → 写回 sidecar（持久化选择）+ 复用现有 filters/hideRows 筛选 */
async function onFeatureSlicerToggle(id: number, selected: string[]) {
  try {
    await props.client.call('xlsx.slicerSelect', sheet.value, id, selected)
    const sl = features.value.slicers.find((s) => s.id === id)
    if (sl) {
      const col = sl.fieldCol
      if (!selected.length || selected.length === sl.items.length) filters.delete(col)
      else filters.set(col, { all: false, values: new Set(selected), op: '', val: '', val2: '' })
      await recompute()
    }
    await refreshFeatures()
    emit('change')
  } catch (e) { emit('error', String(e)) }
}
/** 图表刷新：按源数据重算 cats/series 写回真实 chart part */
async function onFeatureChartRefresh(id: number) {
  try { await props.client.call('xlsx.chartRefresh', sheet.value, id); await refreshFeatures(); emit('change') }
  catch (e) { emit('error', String(e)) }
}
/** 透视刷新命令：按源数据重算缓存与结果单元格 */
async function pivotRefreshAll() {
  try {
    for (const p of features.value.pivots) await props.client.call('xlsx.pivotRefresh', sheet.value, p.id)
    blockCache.clear()
    await refreshFeatures()
    emit('change')
    void loadVisible()
  } catch (e) { emit('error', String(e)) }
}
const ROW_HEAD = 42
const HEAD = 26
function applyProgress(p: SheetProgress) {
  if (p.sheet !== sheet.value) return
  progress.value = p
  // 缩放直接作用于轴尺寸：滚动位置与 Axis.index 用同一套坐标，不会错位
  if (p.defaultRowH) rowAxis.def = p.defaultRowH * bar.zoom
  if (p.defaultColW) colAxis.def = p.defaultColW * bar.zoom
  for (const [r, h] of p.rowSizes) rowAxis.set(r, h * bar.zoom)
  for (const c of p.colInfo ?? []) colAxis.setRange(c.min, c.max, (c.w || 0) * bar.zoom)
  rowAxis.count = Math.max(rowAxis.count, p.rows + padRows.value)
  colAxis.count = Math.max(colAxis.count, p.cols + padCols.value)
  if (p.gridLines !== undefined) bar.gridlines = p.gridLines
  // 冻结行列数只在 progress 带 frozen 时更新（见 frozenRowsState 注释）
  if (p.frozen) {
    frozenRowsState.value = p.frozen.rows ?? 0
    frozenColsState.value = p.frozen.cols ?? 0
    bar.frozen = Boolean(p.frozen.rows || p.frozen.cols)
  }
  if (p.merges) merges.value = p.merges
  version.value++
}

/** 合并区：渲染时锚格撑满跨行列，被覆盖格不渲染；命中/选区吸附到锚格（Excel 行为） */
const merges = shallowRef<Merge[]>([])
function mergeOf(r: number, c: number): Merge | null {
  const ms = merges.value
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]
    if (r >= m.r0 && r <= m.r1 && c >= m.c0 && c <= m.c1) return m
  }
  return null
}

/** 冻结行/列数：与轴拆分同源（冻结区宽度 = 前 N 列宽之和，都取自 colAxis）。
 *  不能只看 progress.value.frozen：xlsx:progress 流式快照的后续消息不带 frozen，整体覆盖会把冻结列数清零
 *  → 冻结列失效、水平滚动时跟着滚。故本地保留，带 frozen 才更新。 */
const frozenRowsState = ref(0)
const frozenColsState = ref(0)
const frozenRows = computed(() => Math.max(0, Math.min(frozenRowsState.value, 40)))
const frozenCols = computed(() => Math.max(0, Math.min(frozenColsState.value, 40)))
const frozenH = computed(() => { void version.value; let h = 0; for (let r = 0; r < frozenRows.value; r++) h += rowAxis.size(r); return h })
const frozenW = computed(() => { void version.value; let w = 0; for (let c = 0; c < frozenCols.value; c++) w += colAxis.size(c); return w })

const r0 = computed(() => {
  void version.value // rowAxis.count 非响应式：靠 version 失效，否则轴更新后窗口缓存不重算
  // 冻结时禁止向上缓冲：预渲染行会画进冻结区/列头，把标题盖掉
  return Math.max(frozenRows.value, rowAxis.index(scrollTop.value + frozenH.value) - (frozenRows.value ? 0 : 4))
})
const r1 = computed(() => {
  void version.value
  return Math.min(rowAxis.count, rowAxis.index(scrollTop.value + frozenH.value + (viewportH.value - frozenH.value)) + 6)
})
const c0 = computed(() => {
  void version.value
  return Math.max(frozenCols.value, colAxis.index(scrollLeft.value + frozenW.value) - (frozenCols.value ? 0 : 2))
})
const c1 = computed(() => {
  void version.value
  return Math.min(colAxis.count, colAxis.index(scrollLeft.value + frozenW.value + (viewportW.value - frozenW.value)) + 3)
})

interface CellView {
  key: string
  r: number
  c: number
  text: string
  css: CellCss
  left: number
  top: number
  w: number
  h: number
  kind: number
  wrap: boolean
  pin: 0 | 1 | 2 | 3
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
const rect = (g: Rect): Rect => {
  const a = { r0: Math.min(g.r0, g.r1), c0: Math.min(g.c0, g.c1), r1: Math.max(g.r0, g.r1), c1: Math.max(g.c0, g.c1) }
  // 选区吸附合并区：碰到合并格就把范围撑到整个合并（Excel 行为）
  for (const m of merges.value) {
    if (m.r1 >= a.r0 && m.r0 <= a.r1 && m.c1 >= a.c0 && m.c0 <= a.c1) {
      a.r0 = Math.min(a.r0, m.r0)
      a.c0 = Math.min(a.c0, m.c0)
      a.r1 = Math.max(a.r1, m.r1)
      a.c1 = Math.max(a.c1, m.c1)
    }
  }
  return a
}
/** 所有生效选区：Ctrl 加选区 + 当前主选区。工具栏命令对每个区依次写回 */
function allRanges(): Rect[] {
  const main = rect(rangeSel.value ?? norm(sel.value, sel.value))
  return [...multi.value.map(rect), main]
}
const inRange = (r: number, c: number) =>
  allRanges().some((g) => r >= g.r0 && r <= g.r1 && c >= g.c0 && c <= g.c1)

/** 名称框：A1 / A1:E7 / 整行 1:7（Office 式显示） */
const rangeLabel = computed(() => {
  const g = rangeSel.value
  if (!g) return `${colName(sel.value.c)}${sel.value.r + 1}`
  const a = rect(g)
  const fullRow = a.c0 === 0 && a.c1 >= colAxis.count - 1
  const fullCol = a.r0 === 0 && a.r1 >= rowAxis.count - 1
  if (fullCol && fullRow) return '全选'
  if (fullRow) return `${a.r0 + 1}:${a.r1 + 1}`
  const p = `${colName(a.c0)}${a.r0 + 1}`
  const q = `${colName(a.c1)}${a.r1 + 1}`
  return p === q ? p : `${p}:${q}`
})
const nameFocus = ref(false)
const nameText = ref('')
function gotoName(v: string) {
  const parts = v.trim().split(':')
  const rowPair = /^(\d+):(\d+)$/.exec(v.trim())
  if (rowPair) {
    const g = { r0: Math.max(0, Number(rowPair[1]) - 1), r1: Math.max(0, Number(rowPair[2]) - 1), c0: 0, c1: colAxis.count - 1 }
    return setSelection(g, { r: g.r0, c: 0 })
  }
  const p = parseAddr(parts[0] ?? ''), q = parts[1] ? parseAddr(parts[1]) : p
  if (!p || !q) return
  setSelection(norm(p, q), { r: p.r, c: p.c })
  reveal(p.r, p.c)
}
function setSelection(g: Rect, at: { r: number; c: number }) {
  // 切格前同步提交：<input> 会随 editing=false 卸载，blur 未必先于卸载触发。commitEdit 在首个 await 前已快照全部值，void 调用即同步提交。
  flushEdit()
  rangeSel.value = rect(g)
  sel.value = at
  anchor.value = { ...at }
  multi.value = []
  fillTip.value = null
  editing.value = false
  void nextTick(refocusAnchor)
}

/** 拖拽填充完成后的「自动填充选项」浮标（Office 同款）：点开菜单按模式重算填充结果 */
const fillTip = ref<{ g: Rect; dir: 'down' | 'up' | 'left' | 'right'; src: Rect } | null>(null)
const fillMenuOpen = ref(false)
const fillTipStyle = computed(() => {
  void version.value
  const t = fillTip.value
  if (!t) return null
  const a = rect(t.g)
  const c1 = Math.min(a.c1, colAxis.count - 1)
  const r1 = Math.min(a.r1, rowAxis.count - 1)
  const fx = c1 < frozenCols.value ? scrollLeft.value : 0
  const fy = r1 < frozenRows.value ? scrollTop.value : 0
  return { left: `${ROW_HEAD + colAxis.pos(c1 + 1) + fx - 4}px`, top: `${HEAD + rowAxis.pos(r1 + 1) + fy - 4}px` }
})
function applyFillMode(mode: 'copyValues' | 'fillSeries' | 'fillFormats' | 'fillWithoutFormat') {
  fillMenuOpen.value = false
  const t = fillTip.value
  if (!t) return
  fillTip.value = null
  void sheetOp({ op: 'fill', range: t.g, dir: t.dir, mode, src: t.src })
}

/** 选区外框 / 填充柄定位：与单元格同一套 Axis 坐标；跨冻结线时按冻结边界拆成至多 4 段，
 *  每段独立补滚动偏移，避免单矩形近似在冻结处出现断裂或错位。 */
const boxSegments = (g: Rect) => {
  void version.value
  const a = rect(g)
  const r1 = Math.min(a.r1, rowAxis.count - 1)
  const c1 = Math.min(a.c1, colAxis.count - 1)
  const fR = frozenRows.value
  const fC = frozenCols.value
  const rowParts: [number, number, boolean][] = []
  if (a.r0 < fR) rowParts.push([a.r0, Math.min(r1, fR - 1), true])
  if (r1 >= fR) rowParts.push([Math.max(a.r0, fR), r1, false])
  const colParts: [number, number, boolean][] = []
  if (a.c0 < fC) colParts.push([a.c0, Math.min(c1, fC - 1), true])
  if (c1 >= fC) colParts.push([Math.max(a.c0, fC), c1, false])
  const out: { left: string; top: string; width: string; height: string; anchor?: boolean }[] = []
  for (const [rs, re, fr] of rowParts) {
    for (const [cs, ce, fc] of colParts) {
      const y0 = rowAxis.pos(rs) + (fr ? scrollTop.value : 0)
      const y1 = rowAxis.pos(re + 1) + (fr ? scrollTop.value : 0)
      const x0 = colAxis.pos(cs) + (fc ? scrollLeft.value : 0)
      const x1 = colAxis.pos(ce + 1) + (fc ? scrollLeft.value : 0)
      out.push({
        left: `${ROW_HEAD + x0}px`,
        top: `${HEAD + y0}px`,
        width: `${Math.max(1, x1 - x0)}px`,
        height: `${Math.max(1, y1 - y0)}px`,
        anchor: rs <= a.r1 && a.r1 <= re && cs <= a.c1 && a.c1 <= ce
      })
    }
  }
  return out
}
/** 主选区外框分段（含右下锚段，锚段挂填充柄与四边移动手柄） */
const mainSegments = computed(() => (rangeSel.value ? boxSegments(rangeSel.value) : []))
/** 每个 Ctrl/Cmd 加选区域的各自外框分段（仅描边，不挂手柄、不抢事件） */
const multiSegments = computed(() => multi.value.flatMap((g) => boxSegments(g)))
/** Office 式选区底纹：每个生效选区一块统一半透明 overlay，压在单元格自身填充色之上（Excel 同款） */
const tintSegments = computed(() => {
  const out: { left: string; top: string; width: string; height: string }[] = []
  for (const g of allRanges()) for (const s of boxSegments(g)) out.push(s)
  return out
})
const previewSegments = computed(() =>
  dragRect.value && (dragMode.value === 'fill' || dragMode.value === 'move') ? boxSegments(dragRect.value) : []
)

/** 可见单元格由行块内容组装；块未到时显示空格，避免阻塞滚动。
 *  行/列集合 = 冻结区 [0,fR/fC) ∪ 滚动可视区 [r0,r1)/[c0,c1)，冻结区钉住渲染。 */
const cells = computed<CellView[]>(() => {
  void version.value
  const out: CellView[] = []
  const fR = frozenRows.value
  const fC = frozenCols.value
  const rowsIt: number[] = []
  for (let r = 0; r < fR; r++) rowsIt.push(r)
  for (let r = Math.max(r0.value, fR); r < r1.value; r++) rowsIt.push(r)
  const colsIt: number[] = []
  for (let c = 0; c < fC; c++) colsIt.push(c)
  for (let c = Math.max(c0.value, fC); c < c1.value; c++) colsIt.push(c)
  for (const r of rowsIt) {
    const vals = blockCache.get(r) ?? []
    const vr = r < fR ? 1 : 0
    const top = HEAD + rowAxis.pos(r) + (vr ? scrollTop.value : 0)
    for (const c of colsIt) {
      // 合并区：被覆盖格不渲染；锚格尺寸 = 跨行列尺寸之和
      const mg = mergeOf(r, c)
      if (mg && !(mg.r0 === r && mg.c0 === c)) continue
      const hit = vals.find((v) => v[0] === c)
      const base = mg ? mergedCss(meta.styles, blockCache, mg) : cellCssAt(meta.styles, blockCache, r, c)
      const hc = c < fC ? 2 : 0
      let w = colAxis.size(c)
      let h = rowAxis.size(r)
      if (mg) {
        w = 0
        for (let cc = mg.c0; cc <= mg.c1; cc++) w += colAxis.size(cc)
        h = 0
        for (let rr = mg.r0; rr <= mg.r1; rr++) h += rowAxis.size(rr)
      }
      out.push({
        key: `${r}:${c}`,
        r,
        c,
        text: hit?.[1] ?? '',
        css: hit?.[4] ? { ...base, color: hit[4] } : base,
        left: ROW_HEAD + colAxis.pos(c) + (hc ? scrollLeft.value : 0),
        top,
        w,
        h,
        kind: hit?.[3] ?? 0,
        wrap: base.whiteSpace === 'pre-wrap',
        pin: (vr + hc) as 0 | 1 | 2 | 3
      })
    }
  }
  return out
})

const colHeads = computed(() => {
  void version.value
  const fC = frozenCols.value
  const out: { c: number; label: string; left: number; w: number; on: boolean; filtered: boolean }[] = []
  const colsIt: number[] = []
  for (let c = 0; c < fC; c++) colsIt.push(c)
  for (let c = Math.max(c0.value, fC); c < c1.value; c++) colsIt.push(c)
  for (const c of colsIt) {
    const pin = c < fC
    out.push({
      c,
      label: colName(c),
      left: ROW_HEAD + colAxis.pos(c) + (pin ? scrollLeft.value : 0),
      w: colAxis.size(c),
      on: inRange(0, c) && rangeSel.value?.r0 === 0,
      filtered: filters.has(c)
    })
  }
  return out
})
const rowHeads = computed(() => {
  void version.value
  const fR = frozenRows.value
  const out: { r: number; top: number; h: number; on: boolean; sub: number; collapsed: boolean }[] = []
  const rowsIt: number[] = []
  for (let r = 0; r < fR; r++) rowsIt.push(r)
  for (let r = Math.max(r0.value, fR); r < r1.value; r++) rowsIt.push(r)
  const groups = outline.active ? outline.groups : []
  for (const r of rowsIt) {
    const pin = r < fR
    const gi = groups.findIndex((gp) => gp.subtotal === r)
    out.push({
      r,
      top: HEAD + rowAxis.pos(r) + (pin ? scrollTop.value : 0),
      h: rowAxis.size(r),
      on: inRange(r, 0) && rangeSel.value?.c0 === 0,
      sub: gi,
      collapsed: gi >= 0 ? groups[gi].collapsed : false
    })
  }
  return out
})

/** 滚动近边缘时延伸空行列（Excel 式无限网格） */
watch([r1, c1], ([a, b]) => {
  let grew = false
  if (a >= rowAxis.count - 30) { padRows.value += 120; rowAxis.count += 120; grew = true }
  if (b >= colAxis.count - 8) { padCols.value += 24; colAxis.count += 24; grew = true }
  if (grew) version.value++
})

async function loadVisible() {
  const token = ++loadToken.value
  const a = r0.value
  const b = r1.value
  const fR = frozenRows.value
  try {
    // 冻结行钉在视口顶部但不在可视区 [r0,r1) 内：单独取回，否则冻结行是空白且盖住内容
    const reqs: Promise<BlockOut>[] = []
    if (b > a) reqs.push(props.client.call('xlsx.block', sheet.value, a, b))
    if (fR > 0 && a >= fR) reqs.push(props.client.call('xlsx.block', sheet.value, 0, fR))
    const blocks = await Promise.all(reqs)
    if (token !== loadToken.value) return
    for (const block of blocks) for (const row of block.rows) blockCache.set(row.r, row.cells)
    version.value++
  } catch (e) {
    emit('error', String(e))
  }
}

async function showDetail(r: number, c: number) {
  try {
    const d: CellDetail | undefined = await props.client.call('xlsx.cell', sheet.value, r, c)
    formula.value = d?.formula ?? d?.value ?? ''
  } catch {
    formula.value = ''
  }
}

/** 把某个单元格滚入可见区（查找跳转用） */
function reveal(r: number, c: number) {
  const el = scrollEl.value
  if (!el) return
  const y = rowAxis.pos(r) - frozenH.value
  const x = colAxis.pos(c) - frozenW.value
  if (y < el.scrollTop || y > el.scrollTop + viewportH.value - frozenH.value - rowAxis.size(r)) el.scrollTop = Math.max(0, y - 40)
  if (x < el.scrollLeft || x > el.scrollLeft + viewportW.value - frozenW.value - colAxis.size(c)) el.scrollLeft = Math.max(0, x - 60)
}

function select(r: number, c: number, opt: { shift?: boolean; add?: boolean } = {}) {
  if (opt.shift) {
    flushEdit() // Shift+点击不经 setSelection，改选区前先提交
    rangeSel.value = norm(anchor.value, { r, c })
    editing.value = false
    return
  }
  if (opt.add && rangeSel.value) {
    const keep = [...multi.value, rect(rangeSel.value)]
    setSelection(norm({ r, c }, { r, c }), { r, c })
    multi.value = keep
    void showDetail(r, c)
    return
  }
  setSelection(norm({ r, c }, { r, c }), { r, c })
  if (bar.painter && painterXf >= 0) {
    void commands.format({ xf: painterXf })
    bar.painter = false
    painterXf = -1
  }
  void showDetail(r, c)
}

function selectRow(r: number, shift = false, add = false) {
  const g: Rect = shift
    ? { r0: Math.min(anchor.value.r, r), r1: Math.max(anchor.value.r, r), c0: 0, c1: colAxis.count - 1 }
    : { r0: r, r1: r, c0: 0, c1: colAxis.count - 1 }
  const keep = add && rangeSel.value ? [...multi.value, rect(rangeSel.value)] : []
  setSelection(g, { r: shift ? anchor.value.r : r, c: 0 })
  multi.value = keep
}
function selectCol(c: number, shift = false, add = false) {
  const g: Rect = shift
    ? { r0: 0, r1: rowAxis.count - 1, c0: Math.min(anchor.value.c, c), c1: Math.max(anchor.value.c, c) }
    : { r0: 0, r1: rowAxis.count - 1, c0: c, c1: c }
  const keep = add && rangeSel.value ? [...multi.value, rect(rangeSel.value)] : []
  setSelection(g, { r: 0, c: shift ? anchor.value.c : c })
  multi.value = keep
}
function selectAll() {
  setSelection({ r0: 0, c0: 0, r1: rowAxis.count - 1, c1: colAxis.count - 1 }, sel.value)
}

/** 鼠标拖选 / 填充柄 / 拖动选区内容：坐标与虚拟网格同一套 Axis，冻结区补 scroll 偏移 */
let dragStart: { r: number; c: number } | null = null
/** 拖列头右边界 / 行头下边界改尺寸：本地 Axis 立即生效，松手一次 sheetOp 写回内核 */
let resizeState: { axis: 'col' | 'row'; index: number; pos: number; base: number; size: number } | null = null
function gridPos(ev: PointerEvent) {
  const grid = scrollEl.value?.querySelector<HTMLElement>('.ov-grid')
  if (!grid) return null
  const b = grid.getBoundingClientRect()
  // 内容坐标（网格内容原点；滚动区的列/行用它取轴下标）
  const x = Math.max(0, ev.clientX - b.left - ROW_HEAD)
  const y = Math.max(0, ev.clientY - b.top - HEAD)
  // 视口坐标（容器原点；冻结区判定用它）：冻结列钉在容器左侧，与 scrollLeft 无关；
  // 内容坐标里冻结列是 pos(c)+scrollLeft、滚动列是 pos(c)，混用会点错格。
  const vx = ev.clientX - (b.left + scrollLeft.value) - ROW_HEAD
  const vy = ev.clientY - (b.top + scrollTop.value) - HEAD
  const r = vy >= 0 && vy < frozenH.value ? rowAxis.index(vy) : rowAxis.index(y)
  const c = vx >= 0 && vx < frozenW.value ? colAxis.index(vx) : colAxis.index(x)
  const rr = clamp(r, 0, rowAxis.count - 1)
  const cc = clamp(c, 0, colAxis.count - 1)
  const mg = mergeOf(rr, cc)
  return mg ? { r: mg.r0, c: mg.c0 } : { r: rr, c: cc }
}
function autoScroll(ev: PointerEvent) {
  const el = scrollEl.value
  if (!el) return
  const b = el.getBoundingClientRect()
  if (ev.clientY > b.bottom - 24) el.scrollTop += 18
  else if (ev.clientY < b.top + 30) el.scrollTop = Math.max(0, el.scrollTop - 18)
  if (ev.clientX > b.right - 24) el.scrollLeft += 18
  else if (ev.clientX < b.left + 48) el.scrollLeft = Math.max(0, el.scrollLeft - 18)
  scrollTop.value = el.scrollTop
  scrollLeft.value = el.scrollLeft
}
function onGridDown(ev: PointerEvent) {
  if (ev.button !== 0) return
  const t = ev.target as HTMLElement
  if (t.closest('input, .ov-cell-input')) return // 点编辑框内部选字不算网格点击
  if (t.closest('.ov-flt-btn')) return
  const p = gridPos(ev)
  if (!p) return
  // mac 上 Ctrl+click 是系统右键：加选只认 ⌘，避免与右键菜单同时触发
  const add = ev.metaKey || (ev.ctrlKey && !isMac)
  const cw = t.closest<HTMLElement>('.ov-col-resize')
  const rh = t.closest<HTMLElement>('.ov-row-resize')
  if (cw || rh) {
    const axis: 'col' | 'row' = cw ? 'col' : 'row'
    const index = Number((cw ?? rh)!.dataset[axis === 'col' ? 'c' : 'r'])
    const base = axis === 'col' ? colAxis.size(index) : rowAxis.size(index)
    resizeState = { axis, index, pos: axis === 'col' ? ev.clientX : ev.clientY, base, size: base }
    dragMode.value = axis === 'col' ? 'colw' : 'rowh'
    ev.preventDefault()
    return
  }
  if (t.closest('.ov-fill-handle')) {
    dragBase = rect(rangeSel.value ?? norm(sel.value, sel.value))
    dragRect.value = dragBase
    dragMode.value = 'fill'
    ev.preventDefault()
    return
  }
  if (t.closest('.ov-range-move')) {
    dragBase = rect(rangeSel.value ?? norm(sel.value, sel.value))
    dragRect.value = dragBase
    dragStart = p
    dragMode.value = 'move'
    ev.preventDefault()
    return
  }
  if (t.closest('[data-row-head]')) {
    selectRow(p.r, ev.shiftKey, add)
    dragMode.value = 'row'
  } else if (t.closest('[data-col-head]')) {
    selectCol(p.c, ev.shiftKey, add)
    dragMode.value = 'col'
  } else {
    select(p.r, p.c, { shift: ev.shiftKey, add })
    dragMode.value = 'cell'
  }
  dragBase = rect(rangeSel.value ?? norm(sel.value, sel.value))
  // 不 preventDefault：保留 dblclick 进单元格编辑；拖选不选中文本靠 .ov-grid user-select:none
}
function onGridMove(ev: PointerEvent) {
  if (resizeState) {
    const s = resizeState
    s.size = clamp(s.base + ((s.axis === 'col' ? ev.clientX : ev.clientY) - s.pos), 20, 600)
    if (s.axis === 'col') colAxis.set(s.index, s.size)
    else rowAxis.set(s.index, s.size)
    version.value++
    return
  }
  const mode = dragMode.value
  const b = dragBase
  if (!mode || !b) return
  const p = gridPos(ev)
  if (!p) return
  if (mode === 'cell') rangeSel.value = norm(anchor.value, p)
  else if (mode === 'row') rangeSel.value = { r0: Math.min(anchor.value.r, p.r), r1: Math.max(anchor.value.r, p.r), c0: 0, c1: colAxis.count - 1 }
  else if (mode === 'col') rangeSel.value = { r0: 0, r1: rowAxis.count - 1, c0: Math.min(anchor.value.c, p.c), c1: Math.max(anchor.value.c, p.c) }
  else if (mode === 'fill') {
    // 四向填充：落点相对选区最占优的一边决定方向，整段 range 同时含源与目标
    const dd = p.r - b.r1, du = b.r0 - p.r, dr = p.c - b.c1, dl = b.c0 - p.c
    const cand: [number, 'down' | 'up' | 'left' | 'right'][] = [[dd, 'down'], [du, 'up'], [dr, 'right'], [dl, 'left']]
    let best = cand[0]
    for (const c of cand) if (c[0] > best[0]) best = c
    if (best[0] <= 0) {
      // 落点在选区内 / 模糊：不触发填充，保持原框
      dragDir = 'down'
      dragRect.value = b
    } else {
      dragDir = best[1]
      if (best[1] === 'down') dragRect.value = { ...b, r1: p.r }
      else if (best[1] === 'up') dragRect.value = { ...b, r0: p.r }
      else if (best[1] === 'right') dragRect.value = { ...b, c1: p.c }
      else dragRect.value = { ...b, c0: p.c }
    }
  } else if (mode === 'move' && dragStart) {
    const dr = p.r - dragStart.r, dc = p.c - dragStart.c
    if (b.r0 + dr >= 0 && b.c0 + dc >= 0) dragRect.value = { r0: b.r0 + dr, c0: b.c0 + dc, r1: b.r1 + dr, c1: b.c1 + dc }
  }
  autoScroll(ev)
}
function onGridUp() {
  if (resizeState) {
    const s = resizeState
    resizeState = null
    dragMode.value = ''
    if (s.size !== s.base) {
      const px = Math.round(s.size / (bar.zoom || 1))
      void sheetOp(s.axis === 'col'
        ? { op: 'colWidth', c0: s.index, c1: s.index, px }
        : { op: 'rowHeight', r0: s.index, r1: s.index, px })
    }
    return
  }
  const mode = dragMode.value, b = dragBase, d = dragRect.value
  dragMode.value = ''
  dragRect.value = null
  dragBase = null
  dragStart = null
  if (!b || !d) return
  if (mode === 'fill' && (d.r1 !== b.r1 || d.c1 !== b.c1 || d.r0 !== b.r0 || d.c0 !== b.c0)) {
    const g = { ...d, r1: Math.min(d.r1, d.r0 + 500), c1: Math.min(d.c1, d.c0 + 200) }
    fillTip.value = { g, dir: dragDir, src: b }
    fillMenuOpen.value = false
    void sheetOp({ op: 'fill', range: g, dir: dragDir })
    rangeSel.value = g
  } else if (mode === 'move' && (d.r0 !== b.r0 || d.c0 !== b.c0)) {
    void moveRange(b, d.r0 - b.r0, d.c0 - b.c0)
  }
}
/** 拖动选区边框搬移内容：走内核 moveRange，携带公式与样式（非仅显示文本），单步撤销。 */
async function moveRange(from: Rect, dr: number, dc: number) {
  const a = rect(from)
  try {
    await sheetOp({ op: 'moveRange', from: a, dr, dc })
    setSelection({ r0: a.r0 + dr, c0: a.c0 + dc, r1: a.r1 + dr, c1: a.c1 + dc }, { r: a.r0 + dr, c: a.c0 + dc })
    reveal(a.r0 + dr, a.c0 + dc)
  } catch (e) {
    emit('error', String(e))
  }
}
/** 清除当前所有选区内容（Delete / Backspace，Excel 行为） */
async function clearRange() {
  const ins: { r: number; c: number; input: string }[] = []
  for (const g of allRanges()) {
    for (let r = g.r0; r <= Math.min(g.r1, g.r0 + 500); r++)
      for (let c = g.c0; c <= Math.min(g.c1, g.c0 + 200); c++) ins.push({ r, c, input: '' })
    if (ins.length > 10000) break
  }
  if (ins.length > 10000) return void officeAlert('清除内容', '选区过大，请缩小选区后重试')
  await commands.setCells(ins)
}

function beginEdit(initial?: string) {
  if (!props.editable) return
  const cur = cells.value.find((x) => x.r === sel.value.r && x.c === sel.value.c)
  // 直输（initial 有值）是「替换式」：预填该字符而不是追加到原内容
  editText.value = initial !== undefined ? initial : (cur?.text ?? '')
  editing.value = true
  // Office 行为：多格选区 + 直输字符 → 该字符填满整个选区（活动格进入编辑态）
  const g = rangeSel.value
  const many = !!g && (g.r0 !== g.r1 || g.c0 !== g.c1)
  editTargets.value = initial !== undefined && many ? cellsIn(g) : []
  if (initial !== undefined) {
    // 动态插入的 input 不触发 autofocus：显式聚焦并把光标放到末尾（否则连续输入会丢键）
    void nextTick(() => {
      const el = document.querySelector('.ov-cell-input') as HTMLInputElement | null
      if (!el) return
      el.focus()
      try { el.setSelectionRange(el.value.length, el.value.length) } catch { /* 部分浏览器不支持 */ }
    })
  }
}

/** 选区内的格子（封顶，避免超大选区）：直输填满选区时用 */
function cellsIn(g: Rect): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = []
  for (let r = g.r0; r <= Math.min(g.r1, g.r0 + 500); r++)
    for (let c = g.c0; c <= Math.min(g.c1, g.c0 + 200); c++) out.push({ r, c })
  return out
}

/** 取消编辑：丢弃本次输入（含直输填满选区的目标） */
function cancelEdit() {
  editing.value = false
  editTargets.value = []
  void nextTick(refocusAnchor)
}

async function commitEdit(refocus = true) {
  if (!editing.value) return
  editing.value = false
  // blur 提交（点名称框/公式栏/工具栏）不回焦锚：回焦会夺走目标控件焦点，导致名称框输入落到单元格
  if (refocus) void nextTick(refocusAnchor)
  const { r, c } = sel.value
  const input = editText.value
  const targets = editTargets.value
  editTargets.value = []
  try {
    const payload = targets.length ? targets.map((t) => ({ r: t.r, c: t.c, input })) : [{ r, c, input }]
    await commands.setCells(payload)
    void showDetail(r, c)
  } catch (e) {
    emit('error', String(e))
  }
}

/** 改选区/切表前同步提交编辑：commitEdit 在首个 await 前已取完值且入口即置 editing=false，重复调用被其守卫短路，不双提交。 */
function flushEdit() { if (editing.value) void commitEdit() }

async function commitFormula() {
  const { r, c } = sel.value
  await commitEditWith(formula.value, r, c)
}

async function commitEditWith(input: string, r: number, c: number) {
  try {
    await props.client.call('xlsx.set', sheet.value, [{ r, c, input }])
    blockCache.clear()
    emit('change')
    void loadVisible()
  } catch (e) {
    emit('error', String(e))
  }
}

function onScroll() {
  scrollTop.value = scrollEl.value?.scrollTop ?? 0
  scrollLeft.value = scrollEl.value?.scrollLeft ?? 0
}

async function switchSheet(index: number) {
  flushEdit() // 重置 sel/选区前先把编辑写回旧表（sheet.value 尚未改变）
  sheet.value = index
  bar.sheet = index
  multi.value = []
  rangeSel.value = null
  sel.value = { r: 0, c: 0 }
  anchor.value = { r: 0, c: 0 }
  blockCache.clear()
  rowAxis.count = 0
  colAxis.count = 0
  merges.value = []
  // 换表：冻结状态重置，新表若带冻结由它的 progress 事件带回来
  frozenRowsState.value = 0
  frozenColsState.value = 0
  bar.frozen = false
  version.value++
  await props.client.call('xlsx.load', index)
  void refreshDrawings()
  void refreshFeatures()
  void loadVisible()
}

/** 工具栏命令默认作用于整个范围选区（Excel 行为），Ctrl 加选时逐区写回 */
const range = () => rect(rangeSel.value ?? norm(sel.value, sel.value))
/** 删行/列优先用范围选区（整行/整列/全选时删除整个范围） */
const delRange = (col: boolean) => {
  const g = rangeSel.value
  const { r, c } = sel.value
  if (col) return { at: g ? g.c0 : c, n: g ? Math.max(1, g.c1 - g.c0 + 1) : 1 }
  return { at: g ? g.r0 : r, n: g ? Math.max(1, g.r1 - g.r0 + 1) : 1 }
}
const sheetOp = async (op: Record<string, unknown>) => {
  const res = await props.client.call('xlsx.sheetOp', sheet.value, op as SheetOp)
  blockCache.clear()
  if (res?.layout) applyProgress(res.layout)
  emit('change')
  void refreshDrawings() // 行高列宽/隐藏行列会改变 drawing 的像素几何
  void refreshFeatures() // 特性几何也按新的行高列宽重算
  void loadVisible()
}
/** 数据分析：内核无聚合 RPC，用 xlsx.block 读全表 → 前端算（view/xlsx/analysis）→ xlsx.set 写回静态值。
 *  ponytail: 结果是值（上限 5000 行），不是可刷新的透视对象。 */
const fmtFlags = { b: false, i: false, u: false, strike: false }
const readAll = () => readMatrix(props.client, sheet.value, progress.value.rows)
const noData = (name: string) => void officeAlert(name, '当前工作表没有可用数据，请先打开含数据的表格或选中数据区域')

/** 分类汇总大纲：前端 hideRows 模拟，非真 xlsx 大纲（需内核 group RPC 才能落盘）。
 *  groups 存每组明细行区间 + 小计行（最终行号）；点击 +/- 或级别按钮折叠/展开明细行（小计行保持可见）。 */
const outline = reactive({ active: false, groups: [] as OutlineGroup[], total: -1, level: 2 })
async function fmtRangeCells(r0c: number, c0c: number, r1c: number, c1c: number, patch: Record<string, unknown>) {
  await props.client.call('xlsx.format', sheet.value, { r0: r0c, c0: c0c, r1: r1c, c1: c1c }, patch)
  blockCache.clear()
  void loadVisible()
}
async function applyOutline() {
  for (const grp of outline.groups) {
    if (!grp.detail.length) continue
    await sheetOp({ op: 'hideRows', a: grp.detail[0], b: grp.detail[grp.detail.length - 1], hidden: grp.collapsed })
  }
}
function toggleGroup(i: number) {
  const grp = outline.groups[i]
  if (!grp) return
  grp.collapsed = !grp.collapsed
  void applyOutline()
}
function setLevel(L: number) {
  outline.level = L
  for (const grp of outline.groups) grp.collapsed = grp.level >= L
  void applyOutline()
}

/** 分类汇总对话框：打开时快照矩阵，确认后按用户选择写回 */
let subCtx: Matrix | null = null
const subtotalDlg = shallowRef<{ fields: SheetFieldInfo[]; initial: { groupCol: number; agg: string; valueCols: number[] } } | null>(null)
async function onSubtotalConfirm(p: { groupCol: number; agg: string; valueCols: number[]; below: boolean }) {
  const d = subCtx
  subCtx = null
  subtotalDlg.value = null
  if (d) await runSubtotal(d, p.groupCol, AGGS[p.agg] ?? 'sum', p.valueCols, p.below)
}
/** 分类汇总写回编排：计算在 view/xlsx/analysis.computeSubtotal，这里只做 RPC（插行/写值/加粗/大纲） */
async function runSubtotal(d: Matrix, gcol: number, how: string, vcs: number[], below: boolean) {
  if (!vcs.length) return void officeAlert('分类汇总', '请至少选择一个汇总项')
  const g = rangeSel.value ? rect(rangeSel.value) : { r0: 0, c0: 0, r1: d.lastR, c1: d.lastC }
  const plan = computeSubtotal(d, g, gcol, how, vcs, below)
  if (!plan.ok) return void officeAlert('分类汇总', '没有可汇总的数据行')
  for (const job of plan.jobs) {
    await sheetOp({ op: 'insertRows', at: job.at, n: 1 })
    await commands.setCells(job.cells.map((x) => ({ ...x, r: job.at })))
    await fmtRangeCells(job.at, plan.left, job.at, plan.right, { b: true })
  }
  outline.groups = plan.outline
  outline.total = plan.total
  outline.active = true
  outline.level = 2
  reveal(plan.top, gcol)
}

/** 数据透视表对话框：打开时快照矩阵（guessFields 提供默认摆放） */
let pivotCtx: Matrix | null = null
const pivotDlg = shallowRef<{ fields: SheetFieldInfo[]; initial: { rows: number[]; cols: number[]; values: { c: number; agg: string }[] } } | null>(null)
async function onPivotConfirm(p: { rows: number[]; cols: number[]; values: { c: number; agg: string }[] }) {
  const d = pivotCtx
  pivotCtx = null
  pivotDlg.value = null
  if (d) await runPivot(d, p.rows, p.cols, p.values.map((v) => ({ c: v.c, agg: AGGS[v.agg] ?? 'sum' })))
}
/** 透视写回编排：计算在 view/xlsx/analysis.computePivot（交叉表 + 总计），这里只写回 */
async function runPivot(d: Matrix, rowFs: number[], colFs: number[], valFs: { c: number; agg: string }[]) {
  const plan = computePivot(d, rowFs, colFs, valFs)
  if (!plan.ok) {
    if (plan.reason === 'valueField') return void officeAlert('数据透视表', '请至少放置一个值字段')
    return void officeAlert('数据透视表', '指定的字段没有数据，请把选区放在数据区域内或改字段名')
  }
  await commands.setCells(plan.cells)
  reveal(0, plan.start)
}

/** 插入图片：粘贴走「置于单元格」（自然尺寸锚选区左上格，内核撑大宿主格）；菜单插入保留浮图自然尺寸 */
async function insertImageFile(file: File, placeInCell = false) {
  const raw = await file.arrayBuffer()
  // 浏览器能解的统一转 PNG；解不了的（macOS 截图 TIFF 等）走原生转码，全失败则报错取消——不插空图
  const prep = await prepareImage(raw, props.transcodeImage)
  if (!prep) return emit('error', '无法解码该图片（格式不受支持），插入已取消')
  const bytes = prep.bytes
  const ext = 'png'
  let w = prep.w
  let h = prep.h
  const row = sel.value.r, col = sel.value.c
  if (w > 480 || h > 360) { const k = Math.min(480 / w, 360 / h); w = Math.round(w * k); h = Math.round(h * k) }
  const res = await props.client.call('xlsx.image', sheet.value, { bytes, ext, anchor: { row, col, wPx: w, hPx: h }, placeInCell })
  if (res?.layout) applyProgress(res.layout)
  blockCache.clear()
  emit('change')
  await refreshDrawings()
}

function pickImage() {
  const inp = document.createElement('input')
  inp.type = 'file'
  inp.accept = 'image/*'
  inp.onchange = () => { const f = inp.files?.[0]; if (f) void insertImageFile(f).catch((e) => emit('error', String(e))) }
  inp.click()
}

/** 插入图表：选区数据 → 真实 c:chartSpace part（可刷新）；原生路径失败时降级为 PNG 图片 */
async function insertChart(kind: ChartKind) {
  const g = range()
  if (g.r1 === g.r0 && g.c1 === g.c0) return officeAlert('插入图表', '请先选择要绘图的数据区域（含表头更佳）')
  const block: BlockOut = await props.client.call('xlsx.block', sheet.value, g.r0, g.r1 + 1)
  const matrix: string[][] = Array.from({ length: g.r1 - g.r0 + 1 }, () => [])
  for (const row of block.rows) {
    if (row.r < g.r0 || row.r > g.r1) continue
    for (const v of row.cells) if (v[0] >= g.c0 && v[0] <= g.c1) matrix[row.r - g.r0][v[0] - g.c0] = String(v[1] ?? '')
  }
  const data = chartDataOf(matrix)
  if (!data) return officeAlert('插入图表', '所选区域没有可绘图的数据（需要至少两行数值）')
  const anchor = { row: g.r1 + 1, col: g.c0, wPx: 480, hPx: 300 }
  try {
    await props.client.call('xlsx.chartAdd', sheet.value, { kind, title: '图表', source: { r0: g.r0, c0: g.c0, r1: g.r1, c1: g.c1 }, data, anchor })
  } catch {
    // 降级：旧 PNG 路径仍写真实 drawing（图片级 1:1）
    const { bytes } = await chartPng(kind, data)
    await props.client.call('xlsx.image', sheet.value, { bytes, ext: 'png', anchor })
  }
  emit('change')
  await refreshFeatures()
  await refreshDrawings()
}

/** 粘贴：一律走原生 paste 事件的 clipboardData（含图片/文本），不用 navigator.clipboard.read()——后者在 WKWebView 弹系统 Paste 授权浮层，多一层点击 */
const onDocPaste = (e: ClipboardEvent) => {
  if (!scrollEl.value || scrollEl.value.offsetParent === null) return
  if (subtotalDlg.value || pivotDlg.value) return
  if (atAnchor()) return
  const dt = e.clipboardData
  const item = [...(dt?.items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))
  if (item) {
    const f = item.getAsFile()
    if (!f) return
    e.preventDefault()
    const ext = (item.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
    void insertImageFile(new File([f], `paste.${ext}`, { type: item.type }), true).catch((err) => emit('error', String(err)))
    return
  }
  const text = dt?.getData('text/plain')
  if (text) { e.preventDefault(); void pasteCell(text) }
}

const commands = {
  switchSheet,
  sheets: () => sheets.value,
  currentSheet: () => sheet.value,
  selection: () => sel.value,
  formula: () => formula.value,
  setFormula: (v: string) => (formula.value = v),
  commitFormula,
  format: async (patch: FmtPatch) => {
    const p: FmtPatch = { ...patch }
    // 单独选「边框色」时内核 derive 不生成任何边：补一次全边框，否则按钮是空操作
    if ('borderColor' in p && !('border' in p)) p.border = 'all'
    // B/I/U/S 是开关：第二次点击要能取消（内核 derive 对 false 会清除标记）
    const flag = (['b', 'i', 'u', 'strike'] as const).find((k) => p[k] === true && Object.keys(p).length === 1)
    if (flag) { fmtFlags[flag] = !fmtFlags[flag]; p[flag] = fmtFlags[flag] }
    for (const g of allRanges()) {
      if ((g.r1 - g.r0) * (g.c1 - g.c0) > 250000) continue
      await props.client.call('xlsx.format', sheet.value, g, p)
    }
    blockCache.clear()
    emit('change')
    void loadVisible()
  },
  undo: async () => {
    await props.client.call('xlsx.undo')
    blockCache.clear()
    void refreshDrawings()
    void refreshFeatures()
    void loadVisible()
  },
  redo: async () => {
    await props.client.call('xlsx.redo')
    blockCache.clear()
    void refreshDrawings()
    void refreshFeatures()
    void loadVisible()
  },
  painter: () => {
    if (bar.painter) {
      bar.painter = false
      painterXf = -1
      return
    }
    const hit = (blockCache.get(sel.value.r) ?? []).find((x) => x[0] === sel.value.c)
    if (hit) {
      painterXf = hit[2]
      bar.painter = true
    }
  },
  insertImage: () => pickImage(),
  insertChart: (kind: string) => void insertChart(kind as ChartKind).catch((e) => emit('error', String(e))),
  toggleWrap: () => {
    bar.wrap = !bar.wrap
    void commands.format({ wrap: bar.wrap })
  },
  merge: (mode: string) => sheetOp(mode === 'unmerge' ? { op: 'unmerge', range: range() } : { op: 'merge', range: range(), mode }),
  /* ponytail: 增减小数位用固定格式覆盖，未读回当前单元格的 numFmt 做增量推导。
     上限：自定义格式会被重置；升级：从 xlsx.cell 取 format 后按 0 的位数重算。 */
  decimals: (d: number) => commands.format({ numFmt: d > 0 ? '0.00' : '0.0' }),
  customNumFmt: async () => {
    const v = await officePrompt('自定义数字格式', '0.00%', '例如 0.00%')
    if (v) void commands.format({ numFmt: v })
  },
  rows: (k: string) => {
    const g = range()
    if (k === 'rowAbove' || k === 'rowBelow') return sheetOp({ op: 'insertRows', at: k === 'rowBelow' ? g.r1 + 1 : g.r0, n: Math.min(100, g.r1 - g.r0 + 1) })
    if (k === 'colLeft' || k === 'colRight') return sheetOp({ op: 'insertCols', at: k === 'colRight' ? g.c1 + 1 : g.c0, n: Math.min(100, g.c1 - g.c0 + 1) })
    if (k === 'delRow') { const d = delRange(false); return sheetOp({ op: 'deleteRows', at: d.at, n: d.n }) }
    if (k === 'delCol') { const d = delRange(true); return sheetOp({ op: 'deleteCols', at: d.at, n: d.n }) }
    const col = k.toLowerCase().includes('col')
    const a = col ? g.c0 : g.r0
    const b = col ? g.c1 : g.r1
    const hidden = k.startsWith('hide')
    return sheetOp({ op: col ? 'hideCols' : 'hideRows', a, b, hidden })
  },
  rowHeight: (px: number) => { const g = range(); return sheetOp({ op: 'rowHeight', r0: g.r0, r1: Math.min(g.r1, g.r0 + 500), px }) },
  colWidth: (px: number) => { const g = range(); return sheetOp({ op: 'colWidth', c0: g.c0, c1: Math.min(g.c1, g.c0 + 200), px }) },
  freeze: (k: string) => {
    const g = range()
    const rows = k === 'row' ? 1 : k === 'sel' ? g.r0 : 0
    const cols = k === 'col' ? 1 : k === 'sel' ? g.c0 : 0
    // 乐观更新本地冻结状态：内核 layout 回来后由 applyProgress 校正
    frozenRowsState.value = rows
    frozenColsState.value = cols
    bar.frozen = Boolean(rows || cols)
    return sheetOp({ op: 'freeze', rows, cols })
  },
  fillDir: (dir: string) => sheetOp({ op: 'fill', range: range(), dir }),
  /** 填充→序列：快照当前选区，弹出 Office 式序列对话框 */
  series: () => {
    dlgRange.value = range()
    seriesDlg.value = true
  },
  sort: (desc: boolean) => {
    const g = range()
    const wide = g.r1 > g.r0 || g.c1 > g.c0
    return sheetOp({
      op: 'sort',
      range: wide ? g : { r0: 0, c0: 0, r1: Math.max(0, progress.value.rows - 1), c1: Math.max(0, progress.value.cols - 1) },
      col: sel.value.c,
      desc
    })
  },
  clearCells: () => clearRange(),
  insertFunc: (fn: string) => {
    formula.value = `=${fn}(`
    const el = document.querySelector<HTMLInputElement>('.ov-formula-input')
    el?.focus()
  },
  focusFormula: () => document.querySelector<HTMLInputElement>('.ov-formula-input')?.focus(),
  recalc: async () => {
    blockCache.clear()
    await props.client.call('xlsx.load', sheet.value)
    void loadVisible()
  },
  find: (q?: string) => {
    openFindBar(q ?? '')
    return Promise.resolve([])
  },
  findNext: async () => {
    if (!findHits.value.length) return
    findIdx.value = (findIdx.value + 1) % findHits.value.length
    const hit = findHits.value[findIdx.value]
    select(hit.r, hit.c)
    reveal(hit.r, hit.c)
  },
  findPrev: async () => {
    if (!findHits.value.length) return
    findIdx.value = (findIdx.value - 1 + findHits.value.length) % findHits.value.length
    const hit = findHits.value[findIdx.value]
    select(hit.r, hit.c)
    reveal(hit.r, hit.c)
  },
  replace: () => {
    openFindBar('')
    findBar.showReplace = true
  },
  replaceAll: async () => {
    const q = findBar.find
    const by = findBar.replace
    if (!q) return
    await props.client.call('xlsx.replace', sheet.value, q, by)
    blockCache.clear()
    emit('change')
    void loadVisible()
    void runFind()
  },
  bookOp: async (k: string) => {
    const ops: Record<string, Record<string, unknown>> = {
      add: { op: 'add' },
      delete: { op: 'delete', index: sheet.value },
      rename: { op: 'rename', index: sheet.value, name: (await officePrompt('工作表名称', sheets.value.find((s) => s.index === sheet.value)?.name ?? '')) || '' },
      moveLeft: { op: 'move', from: sheet.value, to: Math.max(0, sheet.value - 1) },
      moveRight: { op: 'move', from: sheet.value, to: sheet.value + 1 }
    }
    const res = await props.client.call('xlsx.bookOp', ops[k] as BookOp)
    if (res?.sheets) {
      sheets.value = res.sheets.filter((s) => !s.hidden)
      bar.sheets = sheets.value.map((s) => ({ index: s.index, name: s.name }))
    }
    emit('change')
  },
  gridlines: (on: boolean) => {
    bar.gridlines = on
    return sheetOp({ op: 'gridlines', show: on })
  },
  setZoom: (z: number) => {
    bar.zoom = z
    applyProgress(progress.value)
    void loadVisible()
  },
  setCells: async (cellsIn: { r: number; c: number; input: string }[]) => {
    // 单格用户输入：命中数据验证规则且非法时给出出错警告（批量操作不拦）
    if (cellsIn.length === 1) {
      const ci = cellsIn[0]
      const res = checkValidation(features.value.validations, ci.r, ci.c, ci.input)
      if (!res.ok) return officeAlert('数据验证', res.message ?? '输入无效')
    }
    await props.client.call('xlsx.set', sheet.value, cellsIn)
    blockCache.clear()
    emit('change')
    void loadVisible()
  },
  /** 分类汇总（Office 式对话框）：字段推断后弹出面板，用户选定分组列/方式/汇总项/方向 */
  subtotal: async () => {
    const d = await readAll()
    if (d.lastR < 1 || d.lastC < 0) return noData('分类汇总')
    const g = rangeSel.value ? rect(rangeSel.value) : { r0: 0, c0: 0, r1: d.lastR, c1: d.lastC }
    const { gc, vcs } = inferFields(d, g)
    if (!vcs.length) return void officeAlert('分类汇总', '未找到数值列，请选中含数据的区域或改列')
    subCtx = d
    subtotalDlg.value = { fields: sheetFields(d), initial: { groupCol: gc, agg: '求和', valueCols: vcs } }
  },
  /** 数据透视表（Office 式字段面板）：默认按 guessFields 预填，用户调整行/列/值后生成交叉表 */
  pivotTable: async () => {
    const d = await readAll()
    if (d.lastR < 1 || d.lastC < 0) return noData('数据透视表')
    const f = guessFields(d, range())
    pivotCtx = d
    pivotDlg.value = {
      fields: sheetFields(d),
      initial: {
        rows: [f.gc],
        cols: [f.gc + 1 <= d.lastC ? f.gc + 1 : Math.max(0, f.gc - 1)],
        values: [{ c: f.vc, agg: '求和' }]
      }
    }
  },
    /** 自动筛选：打开表头下拉筛选面板（Office 式），不再用 prompt 文本 */
  autoFilter: async () => {
    openFilter(sel.value.c)
  },
  /** 条件格式：自绘规则编辑对话框（写真实 conditionalFormatting + dxfs） */
  condFmt: () => { condDlg.value = true },
  /** 数据验证：自绘规则编辑对话框（写真实 dataValidations） */
  dataValidation: () => { valDlg.value = true },
  /** 切片器：选字段列（自绘下拉），据此去重生成可点按钮组 */
  insertSlicer: async () => {
    const d = await readAll()
    if (d.lastC < 0) return noData('切片器')
    const g = rangeSel.value ? rect(rangeSel.value) : { r0: 0, c0: 0, r1: d.lastR, c1: d.lastC }
    const fields: { c: number; name: string }[] = []
    for (let c = g.c0; c <= g.c1; c++) fields.push({ c, name: (d.m[0]?.[c] ?? '').trim() || colName(c) })
    slicerDlg.value = { fields, source: g }
  },
  /** 图表刷新：按源数据重算所有 chart part */
  chartRefresh: async () => {
    try { for (const c of features.value.charts) await props.client.call('xlsx.chartRefresh', sheet.value, c.id); await refreshFeatures(); emit('change') }
    catch (e) { emit('error', String(e)) }
  },
  /** 透视刷新：按源数据重算缓存与结果单元格 */
  pivotRefresh: () => pivotRefreshAll(),
  /** 序列刷新：源数据改动后按 sidecar 定义重算所有可刷新序列对象 */
  seriesRefresh: async () => {
    try {
      for (const s of features.value.series) await props.client.call('xlsx.seriesRefresh', sheet.value, s.id)
      blockCache.clear()
      await refreshFeatures()
      emit('change')
      void loadVisible()
    } catch (e) { emit('error', String(e)) }
  }
}
/* ribbon 的 A 级命令（第七批新增）：并入 commands，避免视图文件被撑破 2000 行 */
Object.assign(commands, makeRibbonExtra({
  call: (m: string, ...a: unknown[]) => (props.client.call as (k: string, ...x: unknown[]) => Promise<any>)(m, ...a),
  bar, sheet: () => sheet.value, range: () => range(), sel: () => sel.value, select: (r: number, c: number) => select(r, c),
  visible: () => ({ r0: r0.value, r1: r1.value, c0: c0.value, c1: c1.value }),
  fmt: (p: FmtPatch) => commands.format(p), merge: (m: string) => commands.merge(m),
  freeze: (k: string) => commands.freeze(k), setZoom: (z: number) => commands.setZoom(z), recalc: () => commands.recalc(),
  reload: () => { blockCache.clear(); void loadVisible() }, changed: () => emit('change'),
  allSheets: () => props.info.xlsx?.sheets ?? [], readAll: () => readAll()
}))

/** 条件格式对话框确定：整组规则写回内核（replace-all） */
async function onCondFmtConfirm(rules: CondFmtRule[]) {
  condDlg.value = false
  try { await props.client.call('xlsx.condFmtSet', sheet.value, rules); await refreshFeatures(); emit('change') }
  catch (e) { emit('error', String(e)) }
}
/** 数据验证对话框确定 */
async function onValidationConfirm(rules: ValidationRule[]) {
  valDlg.value = false
  try { await props.client.call('xlsx.validationSet', sheet.value, rules); await refreshFeatures(); emit('change') }
  catch (e) { emit('error', String(e)) }
}
/** 切片器对话框确定：按列去重得到 items，写真实 slicer parts */
async function onSlicerConfirm(p: { fieldCol: number; fieldName: string }) {
  const dlg = slicerDlg.value
  slicerDlg.value = null
  if (!dlg) return
  const d = await readAll()
  const seen = new Set<string>()
  for (let r = dlg.source.r0 + 1; r <= dlg.source.r1 && r <= d.lastR; r++) {
    const v = (d.m[r]?.[p.fieldCol] ?? '').trim()
    if (v) seen.add(v)
  }
  const op: SlicerAddOp = {
    name: 'Slicer_' + p.fieldName, source: dlg.source, fieldCol: p.fieldCol, fieldName: p.fieldName,
    items: [...seen], anchor: { row: dlg.source.r0, col: dlg.source.c1 + 2 }
  }
  try { await props.client.call('xlsx.slicerAdd', sheet.value, op); await refreshFeatures(); emit('change') }
  catch (e) { emit('error', String(e)) }
}

/** 表头下拉筛选（Office 式）：真实写回内核 hideRows，多列可叠加 */
type FilterOp = '' | 'eq' | 'ne' | 'begin' | 'end' | 'contains' | 'notContains' | 'gt' | 'ge' | 'lt' | 'le' | 'between'
interface FilterState {
  /** true=不过滤值（全部保留）；false=仅保留 values 中的值 */
  all: boolean
  values: Set<string>
  /** 文本/数字操作符（按列内容自动二选一），''=不启用 */
  op: FilterOp
  val: string
  /** between 的上限 */
  val2: string
}
const TEXT_FILTER_OPS: { k: FilterOp; label: string }[] = [
  { k: 'eq', label: '相当于' }, { k: 'ne', label: '不相当于' },
  { k: 'begin', label: '开头是' }, { k: 'end', label: '结尾是' },
  { k: 'contains', label: '包含' }, { k: 'notContains', label: '不包含' }
]
const NUM_FILTER_OPS: { k: FilterOp; label: string }[] = [
  { k: 'gt', label: '大于' }, { k: 'ge', label: '大于等于' },
  { k: 'lt', label: '小于' }, { k: 'le', label: '小于等于' },
  { k: 'between', label: '介于' }
]
/** 每列筛选状态：重开下拉时回显；多列叠加（行只要不满足任一列即隐藏） */
const filters = reactive(new Map<number, FilterState>())
/** 当前打开的下拉面板：{ 列, 视口坐标 } */
const filterUI = ref<{ c: number; x: number; y: number } | null>(null)
const filterValues = ref<string[]>([])
const filterLoading = ref(false)
const filterSel = reactive(new Set<string>())
const filterAll = ref(true)
const filterSearch = ref('')
const filterOp = ref<FilterOp>('')
const filterVal = ref('')
const filterVal2 = ref('')
const filterMenuOpen = ref(false)
const filterIsNum = ref(false)
const filterOps = computed(() => (filterIsNum.value ? NUM_FILTER_OPS : TEXT_FILTER_OPS))
const filteredValues = computed(() => {
  const q = filterSearch.value.trim().toLowerCase()
  if (!q) return filterValues.value
  return filterValues.value.filter((v) => v.toLowerCase().includes(q))
})
/** 筛选面板三个输入一律自绘 contenteditable（禁原生 input）：打开面板时把 ref 值同步进可编辑块 */
const filterValEl = ref<HTMLElement | null>(null)
const filterVal2El = ref<HTMLElement | null>(null)
const filterSearchEl = ref<HTMLElement | null>(null)
const readFilterEdit = (e: Event) => (e.target as HTMLElement).textContent ?? ''
function onFilterValEdit(e: Event, which: 'val' | 'val2') {
  if (which === 'val') filterVal.value = readFilterEdit(e)
  else filterVal2.value = readFilterEdit(e)
  applyFilterLive()
}
function syncFilterEdits() {
  void nextTick(() => {
    if (filterValEl.value) filterValEl.value.textContent = filterVal.value
    if (filterVal2El.value) filterVal2El.value.textContent = filterVal2.value
    if (filterSearchEl.value) filterSearchEl.value.textContent = filterSearch.value
  })
}

function openFilter(c: number) {
  const el = scrollEl.value?.querySelector(`.ov-col-head[data-c="${c}"]`) as HTMLElement | null
  if (!el) return
  const r = el.getBoundingClientRect()
  filterUI.value = { c, x: r.left, y: r.bottom }
  const st = filters.get(c)
  filterLoading.value = true
  filterSearch.value = ''
  filterOp.value = st?.op ?? ''
  filterVal.value = st?.val ?? ''
  filterVal2.value = st?.val2 ?? ''
  filterMenuOpen.value = false
  filterAll.value = st ? st.all : true
  filterSel.clear()
  if (st) for (const v of st.values) filterSel.add(v)
  void loadFilterValues(c)
  syncFilterEdits()
}
function closeFilter() {
  filterUI.value = null
  filterMenuOpen.value = false
}
async function loadFilterValues(c: number) {
  try {
    const d = await readAll()
    if (!filterUI.value || filterUI.value.c !== c) return
    const set = new Set<string>()
    for (let r = 1; r <= Math.max(1, d.lastR); r++) set.add((d.m[r]?.[c] ?? '').trim())
    filterValues.value = [...set]
    // 全部非空值都是数字时按「数字筛选」给操作符菜单，否则「文本筛选」
    const vals = filterValues.value.filter((v) => v !== '')
    filterIsNum.value = vals.length > 0 && vals.every((v) => Number.isFinite(Number(v.replace(/[,¥$\s%]/g, ''))))
  } catch (e) {
    emit('error', String(e))
  } finally {
    if (filterUI.value?.c === c) filterLoading.value = false
  }
}
/** 取消/勾选一个值：从“全选”切到自定义模式时，初始保留除该值外的全部 */
function toggleVal(v: string) {
  if (filterAll.value) {
    filterAll.value = false
    filterSel.clear()
    for (const x of filterValues.value) if (x !== v) filterSel.add(x)
  } else if (filterSel.has(v)) filterSel.delete(v)
  else filterSel.add(v)
  applyFilterLive()
}
function toggleAll() {
  filterAll.value = !filterAll.value
  filterSel.clear()
  applyFilterLive()
}
function pickFilterOp(k: FilterOp) {
  filterMenuOpen.value = false
  filterOp.value = k
  if (!k) { filterVal.value = ''; filterVal2.value = '' }
  applyFilterLive()
}
/** 勾选/操作符变化即时写回 filters 并重算隐藏行（面板保持打开，Excel 式即时预览） */
function applyFilterLive() {
  if (!filterUI.value) return
  const c = filterUI.value.c
  filters.set(c, { all: filterAll.value, values: new Set(filterSel), op: filterOp.value, val: filterVal.value, val2: filterVal2.value })
  void recompute()
}
function filterSort(c: number, desc: boolean) {
  filterUI.value = null
  void sheetOp({
    op: 'sort',
    range: { r0: 0, c0: 0, r1: Math.max(0, progress.value.rows - 1), c1: Math.max(0, progress.value.cols - 1) },
    col: c,
    desc
  })
}
function colMatch(d: Matrix, r: number, c: number, st: FilterState): boolean {
  const val = (d.m[r]?.[c] ?? '').trim()
  if (!st.all && !st.values.has(val)) return false
  if (!st.op) return true
  if (st.op === 'gt' || st.op === 'ge' || st.op === 'lt' || st.op === 'le' || st.op === 'between') {
    const n = Number(val.replace(/[,¥$\s%]/g, ''))
    const a = Number(st.val.replace(/[,¥$\s%]/g, ''))
    if (st.val === '' || !Number.isFinite(a) || !Number.isFinite(n)) return true
    const b = Number(st.val2.replace(/[,¥$\s%]/g, ''))
    const ok = st.op === 'gt' ? n > a
      : st.op === 'ge' ? n >= a
      : st.op === 'lt' ? n < a
      : st.op === 'le' ? n <= a
      : Number.isFinite(b) ? n >= a && n <= b : n >= a
    return ok
  }
  const q = st.val.trim().toLowerCase()
  if (!q) return true
  const t = val.toLowerCase()
  return st.op === 'eq' ? t === q
    : st.op === 'ne' ? t !== q
    : st.op === 'begin' ? t.startsWith(q)
    : st.op === 'end' ? t.endsWith(q)
    : st.op === 'notContains' ? !t.includes(q)
    : t.includes(q)
}
/** 重算所有生效列的筛选：行只要不满足任一列即隐藏，连续段合并成一次 hideRows */
async function recompute() {
  const d = await readAll()
  // 取消隐藏的上界用内核总行数：readMatrix 的 lastR 只是「非空文本的最大行」，
  // 之前被隐藏的尾部行（或本无文本的带格式行）可能落在 lastR 之外，用 lastR 会让它们永远不恢复。
  const lastRow = Math.max(d.lastR, progress.value.rows - 1, 0)
  if (lastRow < 1) return
  const fail = new Set<number>()
  for (let r = 1; r <= d.lastR; r++) {
    let ok = true
    for (const [c, st] of filters) {
      if (!colMatch(d, r, c, st)) { ok = false; break }
    }
    if (!ok) fail.add(r)
  }
  if (fail.size === 0) {
    await sheetOp({ op: 'hideRows', a: 1, b: lastRow, hidden: false })
    return
  }
  await sheetOp({ op: 'hideRows', a: 1, b: lastRow, hidden: false })
  const arr = [...fail].sort((a, b) => a - b)
  for (let i = 0; i < arr.length;) {
    let j = i
    while (j + 1 < arr.length && arr[j + 1] === arr[j] + 1) j++
    await sheetOp({ op: 'hideRows', a: arr[i], b: arr[j], hidden: true })
    i = j + 1
  }
}
defineExpose({ commands, bar })

/** 查找替换条：Tauri WebView 无 window.prompt，全部走内联 UI */
const findBar = reactive({ open: false, showReplace: false, find: '', replace: '', busy: false })
const findHits = ref<{ r: number; c: number; text: string }[]>([])
const findIdx = ref(-1)
function openFindBar(q: string) {
  findBar.open = true
  if (q) findBar.find = q
}
async function runFind() {
  const s = findBar.find
  if (!s) { findHits.value = []; findIdx.value = -1; return }
  try {
    const hits = await props.client.call('xlsx.find', sheet.value, s)
    findHits.value = hits ?? []
    findIdx.value = findHits.value.length ? 0 : -1
    if (findHits.value.length) {
      const hit = findHits.value[0]
      select(hit.r, hit.c)
      reveal(hit.r, hit.c)
    }
  } catch (e) {
    emit('error', String(e))
  }
}
function closeFindBar() {
  findBar.open = false
  findBar.showReplace = false
}

/** 右键菜单：还原 Office 表格的上下文操作（增删行列、复制粘贴、清除内容）；行/列头有各自的菜单 */
const sheetMenu = ref<{ x: number; y: number; r: number; c: number; mode: 'cell' | 'row' | 'col' } | null>(null)
let sheetClip = ''
function openSheetMenu(ev: MouseEvent, r: number, c: number, mode: 'cell' | 'row' | 'col' = 'cell') {
  ev.preventDefault()
  if (mode === 'row') selectRow(r)
  else if (mode === 'col') selectCol(c)
  else select(r, c)
  // 菜单约 340px 高：靠视口底部时上移，避免向下溢出被裁
  sheetMenu.value = {
    x: Math.min(ev.clientX, window.innerWidth - 170),
    y: Math.min(ev.clientY, Math.max(8, window.innerHeight - 360)),
    r, c, mode
  }
}
function closeSheetMenu() {
  sheetMenu.value = null
}
async function copyCell() {
  const g = rangeSel.value
  if (g && (g.r1 > g.r0 || g.c1 > g.c0)) {
    // 范围复制：按行拼 TSV，按列拼换行（与 Office 一致）
    const lines: string[] = []
    for (let r = g.r0; r <= Math.min(g.r1, g.r0 + 500); r++) {
      const vals = blockCache.get(r) ?? []
      const row: string[] = []
      for (let c = g.c0; c <= g.c1; c++) row.push(vals.find((v) => v[0] === c)?.[1] ?? '')
      lines.push(row.join('\t'))
    }
    sheetClip = lines.join('\n')
  } else {
    const cur = cells.value.find((x) => x.r === sel.value.r && x.c === sel.value.c)
    sheetClip = cur?.text ?? ''
  }
  try {
    await navigator.clipboard?.writeText(sheetClip)
  } catch {
    /* 剪贴板不可用时仍保留进程内副本 */
  }
  closeSheetMenu()
}
/** 文本粘贴写格：clipText 来自 paste 事件的 clipboardData（无系统浮层），缺省回退进程内副本 */
async function pasteCell(clipText?: string) {
  let text = clipText ?? sheetClip
  if (!clipText) {
    try {
      const t = await navigator.clipboard?.readText()
      if (t) text = t
    } catch {
      /* 读不到系统剪贴板时回退到进程内副本 */
    }
  }
  if (text.includes('\n') || text.includes('\t')) {
    const rows = text.replace(/\r/g, '').split('\n').filter((x, i, arr) => x !== '' || i < arr.length - 1)
    const cellsIn: { r: number; c: number; input: string }[] = []
    rows.forEach((line, ri) => {
      line.split('\t').forEach((v, ci) => cellsIn.push({ r: sel.value.r + ri, c: sel.value.c + ci, input: v }))
    })
    await commands.setCells(cellsIn)
  } else {
    await commands.setCells([{ r: sel.value.r, c: sel.value.c, input: text }])
  }
  closeSheetMenu()
}
/** Excel 键盘：方向键移动 / Shift 扩展 / Enter·Tab / Delete 清除 / F2 编辑 / 复制粘贴 / 撤销重做 */
function onSheetKey(e: KeyboardEvent) {
  if (e.defaultPrevented) return // 名称框 / 公式栏已消费的按键不再当作表格导航
  const host = scrollEl.value
  // 多个页签常驻 v-show：隐藏实例不响应全局按键
  if (!host || host.offsetParent === null) return
  const ae = document.activeElement as HTMLElement | null
  const mod = e.ctrlKey || e.metaKey
  // Ctrl+A 一律全选表格，须先于「输入框 / 面板打开」两个守卫（筛选面板打开时焦点常落在 button 上，
  // 旧守卫在这里直接 return 吞掉了 ⌘A）；仅当焦点真在名称框 / 公式栏输入框时保留浏览器原生的框内全选。
  if (mod && e.key.toLowerCase() === 'a') {
    if (atAnchor()) return
    e.preventDefault(); selectAll(); return
  }
  if (atAnchor()) return
  // 筛选面板 / 对话框打开时不做表格导航（焦点常落在普通 button 上）
  if (filterUI.value || subtotalDlg.value || pivotDlg.value) return
  if (mod) {
    const k = e.key.toLowerCase()
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); void commands.undo() }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); void commands.redo() }
    else if (k === 'c') { e.preventDefault(); void copyCell() }
    // Cmd/Ctrl+V 不拦截：放行原生 paste 事件由 onDocPaste 从 clipboardData 直读，避免 clipboard.read() 的系统授权浮层
    return
  }
  const dirs: Record<string, [number, number]> = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]
  }
  if (dirs[e.key]) {
    e.preventDefault()
    const [dr, dc] = dirs[e.key]
    const at = { r: clamp(sel.value.r + dr, 0, rowAxis.count - 1), c: clamp(sel.value.c + dc, 0, colAxis.count - 1) }
    if (e.shiftKey) { flushEdit(); rangeSel.value = norm(anchor.value, at) }
    else select(at.r, at.c)
    reveal(at.r, at.c)
    return
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    const dr = e.key === 'Enter' ? (e.shiftKey ? -1 : 1) : 0
    const dc = e.key === 'Tab' ? (e.shiftKey ? -1 : 1) : 0
    select(clamp(sel.value.r + dr, 0, rowAxis.count - 1), clamp(sel.value.c + dc, 0, colAxis.count - 1))
    return
  }
  if (e.key === 'F2') { e.preventDefault(); beginEdit(); return }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); void clearRange(); return }
  // 可打印字符：直接进入编辑态并预填该字符（Office 行为，替换式）；空格留给「清除内容」
  if (e.key.length === 1 && e.key !== ' ' && !e.altKey) {
    if (e.isComposing || e.keyCode === 229) return // IME 组合中不抢，等 compositionend
    e.preventDefault()
    beginEdit(e.key)
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    multi.value = []
    if (rangeSel.value) select(sel.value.r, sel.value.c)
  }
}
/** 在表格末尾追加一行：网格有 pad 空行，插入后立即可见；流式分页表内核不支持插行 */
async function addRowAtEnd() {
  try {
    await sheetOp({ op: 'insertRows', at: progress.value.rows, n: 1 })
    const nr = progress.value.rows
    select(nr, 0)
    reveal(nr, 0)
  } catch (e) {
    emit('error', String(e))
  }
}

watch([r0, r1, c0, c1], () => void loadVisible())

onMounted(() => {
  offs.push(props.client.on('xlsx:progress', applyProgress))
  // 筛选面板的 Esc 关闭：capture 阶段截获，避免与表格导航 / 输入框冲突
  const onGlobalEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && filterUI.value) {
      e.stopPropagation()
      closeFilter()
    }
  }
  window.addEventListener('keydown', onGlobalEsc, true)
  offs.push(() => window.removeEventListener('keydown', onGlobalEsc, true))
  window.addEventListener('keydown', onSheetKey)
  window.addEventListener('pointermove', onGridMove)
  window.addEventListener('pointerup', onGridUp)
  offs.push(() => window.removeEventListener('keydown', onSheetKey))
  offs.push(() => window.removeEventListener('pointermove', onGridMove))
  offs.push(() => window.removeEventListener('pointerup', onGridUp))
  // IME 组合结束：组合期间的按键被 onSheetKey 放过（不抢），组合结果在此补进编辑态
  const onCompositionEnd = (e: CompositionEvent) => {
    if (editing.value || !e.data) return
    if (findBar.open || nameFocus.value) return
    beginEdit(e.data)
  }
  window.addEventListener('compositionend', onCompositionEnd)
  offs.push(() => window.removeEventListener('compositionend', onCompositionEnd))
  window.addEventListener('paste', onDocPaste)
  offs.push(() => window.removeEventListener('paste', onDocPaste))
  if (scrollEl.value) {
    ro = new ResizeObserver(() => {
      viewportH.value = scrollEl.value?.clientHeight ?? 700
      viewportW.value = scrollEl.value?.clientWidth ?? 1200
    })
    ro.observe(scrollEl.value)
  }
  void nextTick(refocusAnchor)
  void switchSheet(sheet.value).catch((e) => emit('error', String(e)))
})

onBeforeUnmount(() => {
  offs.forEach((f) => f())
  ro?.disconnect()
})
</script>

<template>
  <div class="ov-sheet" :class="{ 'ov-no-grid': !bar.gridlines }" @contextmenu.stop.prevent>
    <div v-if="editable" ref="pasteAnchor" class="ov-paste-anchor" contenteditable="true" aria-hidden="true"></div>
    <div v-if="editable" class="ov-formula">
      <input
        class="ov-formula-addr ov-name-box"
        title="名称框：输入 A1 或 A1:E7 跳转并选中"
        :value="nameFocus ? nameText : rangeLabel"
        @focus="nameText = rangeLabel; nameFocus = true"
        @input="nameText = ($event.target as HTMLInputElement).value"
        @blur="nameFocus = false"
        @keydown.enter.stop.prevent="gotoName(nameText); ($event.target as HTMLInputElement).blur()"
        @keydown.esc.prevent="($event.target as HTMLInputElement).blur()"
      />
      <input
        class="ov-formula-input"
        :value="formula"
        placeholder="值或公式，回车写入"
        @input="formula = ($event.target as HTMLInputElement).value"
        @keydown.enter.prevent="commitFormula"
      />
    </div>
    <div ref="scrollEl" class="ov-grid-scroll" @scroll.passive="onScroll">
      <div class="ov-grid" :style="{ width: ROW_HEAD + colAxis.total() + 'px', height: HEAD + rowAxis.total() + 'px', ...(meta.baseFont ?? {}) }" @pointerdown="onGridDown" @pointerup="refocusAnchor">
        <div class="ov-corner" title="全选" :style="{ left: scrollLeft + 'px' }" @pointerdown.stop="selectAll()" @click.stop="selectAll()"></div>
        <div
          v-if="outline.active"
          class="ov-outline-levels"
          :style="{ top: scrollTop + 'px', left: scrollLeft + 'px', width: ROW_HEAD + 'px', height: HEAD + 'px' }"
          @pointerdown.stop
        >
          <button v-for="L in [1, 2, 3]" :key="L" :class="{ 'ov-lvl-on': outline.level === L }" :data-lvl="L" @click.stop="setLevel(L)">{{ L }}</button>
        </div>
        <div
          v-for="h in colHeads"
          :key="'h' + h.c"
          class="ov-col-head"
          :class="{ 'ov-head-on': h.on, 'ov-flt-active': h.filtered }"
          data-col-head
          :data-c="h.c"
          :style="{ left: h.left + 'px', top: scrollTop + 'px', width: h.w + 'px' }"
          @contextmenu.stop.prevent="openSheetMenu($event, sel.r, h.c, 'col')"
        >
          <span class="ov-col-label">{{ h.label }}</span>
          <button class="ov-flt-btn" :class="{ 'ov-flt-on': h.filtered }" :data-flt="h.c" type="button" title="筛选" @click.stop.prevent="openFilter(h.c)">▾</button>
          <span class="ov-col-resize" :data-c="h.c" title="拖动调整列宽"></span>
        </div>
        <div
          v-for="h in rowHeads"
          :key="'r' + h.r"
          class="ov-row-head"
          :class="{ 'ov-head-on': h.on, 'ov-row-head-sub': h.sub >= 0 }"
          data-row-head
          :data-r="h.r"
          :style="{ top: h.top + 'px', left: scrollLeft + 'px', height: h.h + 'px' }"
          @contextmenu.stop.prevent="openSheetMenu($event, h.r, sel.c, 'row')"
        >
          <span
            v-if="h.sub >= 0"
            class="ov-outline-toggle"
            :class="{ 'ov-collapsed': h.collapsed }"
            :data-outline-toggle="h.sub"
            :title="h.collapsed ? '展开' : '折叠'"
            @pointerdown.stop
            @click.stop="toggleGroup(h.sub)"
          >{{ h.collapsed ? '+' : '−' }}</span>
          {{ h.r + 1 }}
          <span class="ov-row-resize" :data-r="h.r" title="拖动调整行高"></span>
        </div>
        <div
          v-for="cell in cells"
          :key="cell.key"
          class="ov-cell"
          :class="{
            'ov-cell-on': cell.r === sel.r && cell.c === sel.c,
            'ov-cell-num': cell.kind === 1,
            'ov-cell-wrap': cell.wrap,
            'ov-cell-inrange': inRange(cell.r, cell.c) && !(cell.r === sel.r && cell.c === sel.c),
            'ov-cell-pin': cell.pin > 0,
            'ov-cell-pin-corner': cell.pin === 3
          }"
          :style="{
            left: cell.left + 'px',
            top: cell.top + 'px',
            width: cell.w + 'px',
            height: cell.h + 'px',
            ...cell.css
          }"
          :data-cell-r="cell.r"
          :data-cell-c="cell.c"
          @dblclick="beginEdit()"
          @contextmenu.stop.prevent="openSheetMenu($event, cell.r, cell.c)"
        >
          <input
            v-if="editing && cell.r === sel.r && cell.c === sel.c"
            class="ov-cell-input"
            v-model="editText"
            autofocus
            @blur="commitEdit(false)"
            @keydown.enter.prevent="commitEdit()"
            @keydown.esc.prevent="cancelEdit()"
          />
          <span v-else>{{ cell.text }}</span>
        </div>
        <!-- 原生 OOXML 特性层：条件格式底纹/数据条（z-index 1，低于选区 overlay）+ chart/切片器/验证下拉 -->
        <OfficeSheetFeatureLayer
          :features="features"
          :cells="cells"
          :origin-x="ROW_HEAD"
          :origin-y="HEAD"
          :zoom="bar.zoom"
          :editable="editable"
          :sel="sel"
          @validation-select="onFeatureValidationSelect"
          @slicer-toggle="onFeatureSlicerToggle"
          @chart-refresh="onFeatureChartRefresh"
        />
        <!-- 浮动图片层（xlsx drawing）：内核按锚点几何给出未缩放 px；交互（选中/拖动/缩放/删除）在 DrawingLayer -->
        <OfficeSheetDrawingLayer
          :drawings="drawings"
          :zoom="bar.zoom"
          :editable="editable"
          :origin-x="ROW_HEAD"
          :origin-y="HEAD"
          :col-axis="colAxis"
          :row-axis="rowAxis"
          @op="onDrawingOp"
        />
        <!-- Office 选区底纹：整区统一半透明，盖过单元格填充色（跨冻结线拆段铺满，无断裂） -->
        <div v-for="(t, ti) in tintSegments" :key="'tint' + ti" class="ov-range-tint" :style="t"></div>
        <!-- 主选区外框：跨冻结线拆段绘制，避免断裂；仅右下锚段挂四边移动手柄与填充柄 -->
        <template v-if="rangeSel">
          <div v-for="(s, si) in mainSegments" :key="'ms' + si" class="ov-range-box" :class="{ 'ov-range-anchor': s.anchor }" :style="s">
            <template v-if="s.anchor">
              <div class="ov-range-move ov-range-t"></div>
              <div class="ov-range-move ov-range-b"></div>
              <div class="ov-range-move ov-range-l"></div>
              <div class="ov-range-move ov-range-r"></div>
              <div class="ov-fill-handle" title="拖动填充"></div>
            </template>
          </div>
        </template>
        <!-- Ctrl/Cmd 加选的多个区域：每个各自描外框（无手柄，不抢事件） -->
        <div v-for="(m, mi) in multiSegments" :key="'mb' + mi" class="ov-range-box ov-range-add" :style="m"></div>
        <!-- 拖动预览（填充/搬移）：同样跨冻结线拆段 -->
        <div v-for="(p, pi) in previewSegments" :key="'pv' + pi" class="ov-range-preview" :style="p"></div>
        <!-- 自动填充选项浮标（拖拽填充完成后出现在选区右下角，Office 同款） -->
        <div v-if="fillTip && fillTipStyle" class="ov-autofill-wrap" :style="fillTipStyle" @pointerdown.stop>
          <button class="ov-autofill-btn" type="button" title="自动填充选项" @click.stop="fillMenuOpen = !fillMenuOpen">⌄</button>
          <div v-if="fillMenuOpen" class="ov-autofill-menu">
            <button class="ov-autofill-item" type="button" @click="applyFillMode('copyValues')">复制单元格</button>
            <button class="ov-autofill-item" type="button" @click="applyFillMode('fillSeries')">以序列方式填充</button>
            <button class="ov-autofill-item" type="button" @click="applyFillMode('fillFormats')">仅填充格式</button>
            <button class="ov-autofill-item" type="button" @click="applyFillMode('fillWithoutFormat')">不带格式填充</button>
          </div>
        </div>
        <!-- 冻结边界线：跟随滚动保持钉在冻结区边缘 -->
        <div v-if="frozenRows" class="ov-freeze-h" :style="{ top: HEAD + frozenH + scrollTop + 'px', left: scrollLeft + 'px' }"></div>
        <div v-if="frozenCols" class="ov-freeze-v" :style="{ left: ROW_HEAD + frozenW + scrollLeft + 'px', top: scrollTop + 'px' }"></div>
      </div>
    </div>
    <!-- 查找替换条 -->
    <div v-if="findBar.open" class="ov-findbar">
      <input
        v-model="findBar.find"
        class="ov-find-input"
        placeholder="查找内容，回车查找"
        @keydown.enter.prevent="runFind"
        @input="findHits = []; findIdx = -1"
      />
      <span class="ov-find-count">{{ findHits.length ? `${findIdx + 1} / ${findHits.length}` : (findBar.find ? '无匹配' : '') }}</span>
      <button class="ov-find-btn" title="上一个" @click="commands.findPrev()">↑</button>
      <button class="ov-find-btn" title="下一个" @click="commands.findNext()">↓</button>
      <button class="ov-find-btn" :class="{ 'ov-find-on': findBar.showReplace }" title="替换" @click="findBar.showReplace = !findBar.showReplace">替换</button>
      <button class="ov-find-btn" title="关闭" @click="closeFindBar">✕</button>
      <template v-if="findBar.showReplace">
        <input v-model="findBar.replace" class="ov-find-input" placeholder="替换为" @keydown.enter.prevent="commands.replaceAll()" />
        <button class="ov-find-btn" @click="commands.replaceAll()">全部替换</button>
      </template>
    </div>
    <div class="ov-sheet-tabs">
      <button class="ov-add-row" title="在表格末尾添加一行" @click="addRowAtEnd">＋ 行</button>
      <button
        v-for="s in sheets"
        :key="s.index"
        class="ov-sheet-tab"
        :class="{ 'ov-sheet-on': s.index === sheet }"
        @click="switchSheet(s.index)"
      >
        {{ s.name }}
      </button>
    </div>
    <div v-if="sheetMenu" class="ov-ctx-overlay" @click="closeSheetMenu" @contextmenu.prevent="closeSheetMenu">
      <div class="ov-ctx" :style="{ left: sheetMenu.x + 'px', top: sheetMenu.y + 'px' }">
        <template v-if="sheetMenu.mode === 'row'">
          <button class="ov-ctx-item" @click="commands.rows('rowAbove'); closeSheetMenu()">在上方插入行</button>
          <button class="ov-ctx-item" @click="commands.rows('rowBelow'); closeSheetMenu()">在下方插入行</button>
          <button class="ov-ctx-item" @click="commands.rows('delRow'); closeSheetMenu()">删除行</button>
          <button class="ov-ctx-item" @click="commands.rows('hideRows'); closeSheetMenu()">隐藏行</button>
          <button class="ov-ctx-item" @click="commands.rows('showRows'); closeSheetMenu()">取消隐藏行</button>
        </template>
        <template v-else-if="sheetMenu.mode === 'col'">
          <button class="ov-ctx-item" @click="commands.rows('colLeft'); closeSheetMenu()">在左侧插入列</button>
          <button class="ov-ctx-item" @click="commands.rows('colRight'); closeSheetMenu()">在右侧插入列</button>
          <button class="ov-ctx-item" @click="commands.rows('delCol'); closeSheetMenu()">删除列</button>
          <button class="ov-ctx-item" @click="commands.rows('hideCols'); closeSheetMenu()">隐藏列</button>
          <button class="ov-ctx-item" @click="commands.rows('showCols'); closeSheetMenu()">取消隐藏列</button>
        </template>
        <template v-else>
          <button class="ov-ctx-item" @click="commands.rows('rowAbove'); closeSheetMenu()">在上方插入行</button>
          <button class="ov-ctx-item" @click="commands.rows('rowBelow'); closeSheetMenu()">在下方插入行</button>
          <button class="ov-ctx-item" @click="commands.rows('colLeft'); closeSheetMenu()">在左侧插入列</button>
          <button class="ov-ctx-item" @click="commands.rows('colRight'); closeSheetMenu()">在右侧插入列</button>
          <div class="ov-ctx-sep"></div>
          <button class="ov-ctx-item" @click="commands.rows('delRow'); closeSheetMenu()">删除行</button>
          <button class="ov-ctx-item" @click="commands.rows('delCol'); closeSheetMenu()">删除列</button>
          <div class="ov-ctx-sep"></div>
          <button class="ov-ctx-item" @click="copyCell">复制</button>
          <button class="ov-ctx-item" @click="pasteCell(); closeSheetMenu()">粘贴</button>
          <button class="ov-ctx-item" @click="commands.clearCells(); closeSheetMenu()">清除内容</button>
          <button v-if="features.series.length" class="ov-ctx-item" @click="commands.seriesRefresh(); closeSheetMenu()">刷新序列</button>
        </template>
      </div>
    </div>
    <Teleport to="body">
      <!-- Office 式自动筛选下拉：排序 / 文本·数字筛选二级菜单 / 值清单（自绘勾选，无原生控件） -->
      <div v-if="filterUI" class="ov-flt-overlay" @click="closeFilter" @contextmenu.prevent="closeFilter">
        <div class="ov-flt-panel" :style="{ left: filterUI.x + 'px', top: filterUI.y + 'px' }" @click.stop>
          <div class="ov-flt-sort">
            <button class="ov-flt-item" type="button" @click="filterSort(filterUI.c, false)"><span class="ov-flt-ico">↑</span>升序</button>
            <button class="ov-flt-item" type="button" @click="filterSort(filterUI.c, true)"><span class="ov-flt-ico">↓</span>降序</button>
          </div>
          <div class="ov-flt-sep"></div>
          <div class="ov-flt-menuwrap">
            <button class="ov-flt-item" type="button" @click.stop="filterMenuOpen = !filterMenuOpen">
              <span class="ov-flt-ico">◭</span>{{ filterIsNum ? '数字筛选' : '文本筛选' }}<span class="ov-flt-caret">▸</span>
            </button>
            <div v-if="filterMenuOpen" class="ov-flt-flyout">
              <button
                v-for="o in filterOps"
                :key="o.k"
                class="ov-flt-flyitem"
                :class="{ 'ov-flt-flyon': filterOp === o.k }"
                type="button"
                @click.stop="pickFilterOp(o.k)"
              >{{ o.label }}</button>
              <div class="ov-flt-sep"></div>
              <button class="ov-flt-flyitem" type="button" @click.stop="pickFilterOp('')">清除筛选</button>
            </div>
          </div>
          <div v-if="filterOp" class="ov-flt-opval">
            <div ref="filterValEl" class="ov-flt-input ov-flt-edit" contenteditable="true" role="textbox"
                 :data-placeholder="filterIsNum ? '数值' : '文本'"
                 @input="onFilterValEdit($event, 'val')" @keydown.enter.prevent="applyFilterLive()"></div>
            <div v-if="filterOp === 'between'" ref="filterVal2El" class="ov-flt-input ov-flt-edit" contenteditable="true" role="textbox"
                 data-placeholder="上限"
                 @input="onFilterValEdit($event, 'val2')" @keydown.enter.prevent="applyFilterLive()"></div>
          </div>
          <div class="ov-flt-sep"></div>
          <div class="ov-flt-search">
            <div ref="filterSearchEl" class="ov-flt-input ov-flt-edit" contenteditable="true" role="textbox"
                 data-placeholder="搜索此列的值…" @input="filterSearch = readFilterEdit($event)"></div>
          </div>
          <div class="ov-flt-list">
            <button class="ov-flt-row" type="button" @click="toggleAll">
              <span class="ov-chk" :class="{ 'ov-chk-on': filterAll }"></span><span class="ov-flt-val">全选</span>
            </button>
            <button v-for="v in filteredValues" :key="v" class="ov-flt-row" type="button" :data-val="v" @click="toggleVal(v)">
              <span class="ov-chk" :class="{ 'ov-chk-on': filterAll || filterSel.has(v) }"></span>
              <span class="ov-flt-val">{{ v === '' ? '(空白)' : v }}</span>
            </button>
            <div v-if="filterLoading" class="ov-flt-empty">加载中…</div>
            <div v-else-if="!filteredValues.length" class="ov-flt-empty">无匹配</div>
          </div>
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <OfficeSubtotalDialog
        :open="!!subtotalDlg"
        :fields="subtotalDlg?.fields ?? []"
        :initial="subtotalDlg?.initial"
        @confirm="onSubtotalConfirm"
        @cancel="subtotalDlg = null"
      />
      <OfficePivotDialog
        :open="!!pivotDlg"
        :fields="pivotDlg?.fields ?? []"
        :initial="pivotDlg?.initial"
        @confirm="onPivotConfirm"
        @cancel="pivotDlg = null"
      />
      <OfficeSeriesDialog
        :open="seriesDlg"
        :sel-range="dlgRange"
        :date1904="meta.date1904"
        @confirm="onSeriesConfirm"
        @cancel="seriesDlg = false"
      />
      <OfficeFeatureDialogs
        :cond-open="condDlg" :cond-rules="features.condFmt"
        :val-open="valDlg" :val-rules="features.validations"
        :slicer-open="!!slicerDlg" :slicer-fields="slicerDlg?.fields ?? []"
        :sel-range="range()"
        @cond-confirm="onCondFmtConfirm" @cond-cancel="condDlg = false"
        @val-confirm="onValidationConfirm" @val-cancel="valDlg = false"
        @slicer-confirm="onSlicerConfirm" @slicer-cancel="slicerDlg = null"
      />
    </Teleport>
  </div>
</template>

<style src="../office-views.css"></style>
<style src="../office-filter.css"></style>
<style src="../office-subtotal.css"></style>
<style src="../office-sheet-features.css"></style>
