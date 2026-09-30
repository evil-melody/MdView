<script setup lang="ts">
/**
 * PPTX 预览 / 编辑（GenOffice 引擎渲染 + 引擎 op 层写回）。
 *
 * 两条链路：
 *  显示  bytes → openPptx → buildRenderSlide(RenderTree) → src/pptx/svg.ts 输出 SVG
 *  编辑  UI 动作 → src/pptx/ops.ts 构造 op → PptxDocument.runOps（校验/事务/回滚）→ 按字节锚写回
 *
 * 具体覆盖：master/layout 装饰层、连接线、组合、表格/图表、图片 srcRect 裁剪、主题色与字体继承
 * 全部由引擎负责；编辑器侧提供文字编辑、元素选择/移动/缩放、插入（文本框/形状/直线/图片/表格）、
 * 层级与对齐、组合、填充/描边/字体格式、投影与进入动画、表格单元格文字与底纹、幻灯片增删复制排序、
 * 备注/切换/自动换片/隐藏、整篇查找替换、撤销/重做。未修改的部件在保存时按原始字节回写
 * （见 scripts/pptx-verify 的条目级字节一致断言）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, ref, watch } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { loadPptxDocument, savePptxDocument, type PptxDocument, type RenderedSlide } from '../pptx/load'
import { domToParagraphs, type RunBaseline } from '../pptx/dom-edit'
import { extOf } from '../pptx/document'
import type { LocalRef, Op, PxRect, TransitionKind } from '../pptx/ops'
import { animOps, arrangeOps, deckOps, elementOps, insertOps, slideOps, tableOps, textOps } from '../pptx/ops'
import type { TableCellBox } from '../pptx/table'
import { defaultInsertRect } from '../pptx/interact'
import type { AnimEffect, CellState, EditorAction, InsertKind, SelectionInfo, SlideState } from '../pptx/actions'
import PptxOpsToolbar from './PptxOpsToolbar.vue'
import PptxElementLayer from './PptxElementLayer.vue'
import PptxTableCellLayer from './PptxTableCellLayer.vue'
import { readFileBytes } from '../api'

const props = defineProps<{ path: string }>()
const emit = defineEmits<{
  (e: 'change'): void
}>()

/** 首屏同步渲染页数；其余页进入视口后再渲染（百页 deck 不阻塞首屏）。 */
const FIRST_BATCH = 10

/** 会改变页数/页码的 op：必须整篇重渲染并重排选中状态。 */
const STRUCTURAL_OPS = new Set([
  'addBlankSlide',
  'addSlideWithLayout',
  'duplicateSlide',
  'deleteSlide',
  'moveSlide',
  'applyTheme',
  'setSlideSize',
  'setSections'
])

// shallowRef: PptxDocument 有私有字段与内部缓存，深响应式代理会破坏其类型与身份
const doc = shallowRef<PptxDocument | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const status = ref('')
/** 打开大文件时的解析进度（parsed / total 页），解析完成归零。 */
const openProgress = ref<{ parsed: number; total: number } | null>(null)
const mediaProgress = ref<{ done: number; total: number } | null>(null)
const slides = ref<(RenderedSlide | null)[]>([])
const rendered = ref<Set<number>>(new Set())
const editing = ref<{ slideIndex: number; sourceId: string; key: string; baseline: RunBaseline } | null>(
  null
)
const editingStyle = ref<Record<string, string>>({})
/** 当前选中：元素 durable id + 所属页（选择层只认识 durable id，页码由容器补齐） */
const selected = ref<{ slide: number; ids: string[] }>({ slide: 0, ids: [] })
/** 已激活的插入工具：下一次点击幻灯片落点放置 */
const armed = ref<InsertKind | null>(null)
/** 画直线时的起点（第一次点击），第二次点击成线 */
const lineStart = ref<{ x: number; y: number } | null>(null)
/** 当前页的幻灯片级状态（备注/切换/自动换片/隐藏），面板是纯视图，值统一从文档读回 */
const slideState = ref<SlideState>({ notes: '', transition: 'none', advanceMs: null, hidden: false })
/** 当前页动画时间线（用于在工具栏显示所选元素的进入动画） */
const anims = ref<{ el: string | null; effect: string }[]>([])
/** 整篇查找替换的结果行 */
const deckMessage = ref('')
/** 选中的表格单元格：命中层给出 (row,col)，操作仍作用于表格元素本身 */
const cellSel = ref<{ row: number; col: number } | null>(null)
/** 表格单元格网格（仅当选中单个表格时非空） */
const cells = ref<TableCellBox[]>([])
/** 正在编辑的单元格文字（与元素文字编辑共用一套 contenteditable 层） */
const cellEdit = ref<{
  slideIndex: number
  key: string
  row: number
  col: number
  baseline: RunBaseline
} | null>(null)
const cellEditStyle = ref<Record<string, string>>({})

let overlayEl: HTMLDivElement | null = null
let cellOverlayEl: HTMLDivElement | null = null
let observer: IntersectionObserver | null = null

const slideCount = computed(() => slides.value.length)
const selInfo = computed<SelectionInfo | null>(() => {
  const ids = selected.value.ids
  const rs = slides.value[selected.value.slide]
  if (!ids.length || !rs) return null
  const boxes = ids
    .map((id) => rs.elements.find((e) => e.key === id))
    .filter((b): b is RenderedSlide['elements'][number] => !!b)
  if (!boxes.length) return null
  const first = boxes[0]
  const texts = rs.texts.filter((t) => ids.includes(t.key))
  const t0 = texts[0]
  const same = (vals: (string | null)[]) =>
    vals.length && vals.every((v) => v === vals[0]) ? vals[0] : null
  return {
    count: ids.length,
    kind: boxes.length === 1 ? first.kind : null,
    isPicture: boxes.every((b) => b.kind === 'picture'),
    canUngroup: boxes.length === 1 && first.kind === 'group',
    hasText: texts.length > 0,
    fill: same(boxes.map((b) => b.fillHex)),
    stroke: same(boxes.map((b) => b.strokeHex)),
    fontColor: t0?.color ?? null,
    fontSizePx: t0?.fontSizePx ?? null,
    bold: !!t0?.bold,
    italic: !!t0?.italic,
    underline: !!t0?.underline,
    opacity: first.opacity,
    animation: animOf(boxes),
    ids
  }
})

/** Entrance effect of the selection when it is a single element (null = none or mixed). */
function animOf(boxes: RenderedSlide['elements']): string | null {
  if (boxes.length !== 1) return null
  const hit = anims.value.find((a) => a.el === boxes[0].key || a.el === boxes[0].sourceId)
  return hit ? hit.effect : null
}

/** Selected table cell as the toolbar needs it (row/col + current shading). */
const cellInfo = computed<CellState | null>(() => {
  const c = cellSel.value
  const key = selected.value.ids[0]
  if (!c || selected.value.ids.length !== 1 || !key) return null
  const box = cells.value.find((x) => x.row === c.row && x.col === c.col)
  return { key, row: c.row, col: c.col, fillHex: box?.fillHex ?? null }
})

const context = computed<'none' | 'element' | 'text'>(() =>
  editing.value ? 'text' : selInfo.value ? 'element' : 'none'
)

const hint = computed(() => {
  if (armed.value === 'line') return lineStart.value ? '再点击一次确定终点' : '点击幻灯片确定起点'
  if (armed.value) return '点击幻灯片放置，Esc 取消'
  return '点击选中元素 · 双击改文字/换图 · Delete 删除 · Shift 多选 · ⌘Z 撤销'
})

// ── 载入 / 渲染 ────────────────────────────────────────────

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function load() {
  error.value = ''
  status.value = ''
  openProgress.value = null
  mediaProgress.value = null
  slides.value = []
  rendered.value = new Set()
  editing.value = null
  cellEdit.value = null
  cellSel.value = null
  cells.value = []
  deckMessage.value = ''
  selected.value = { slide: 0, ids: [] }
  armed.value = null
  lineStart.value = null
  cancelRender()
  loading.value = true
  try {
    const t0 = performance.now()
    const d = await loadPptxDocument(props.path, {
      onProgress: async (parsed, total) => {
        openProgress.value = { parsed, total }
        // 让出一帧：解析期间主线程不冻结，UI/进度始终有响应
        await nextFrame()
      },
    })
    doc.value = d
    openProgress.value = null
    const parseMs = Math.round(performance.now() - t0)
    const fonts = await d.prepare()
    slides.value = new Array(d.slideCount).fill(null)
    status.value = `${d.slideCount} 页 · 解析 ${parseMs}ms${fonts ? ` · webfont ${fonts} 族` : ''}`
    // 大媒体后台分帧解压（不阻塞交互），进度条提示；保存前引擎会强制 ensureAll 兜底
    if (d.pendingMediaCount > 0) {
      mediaProgress.value = { done: 0, total: d.pendingMediaCount }
      d.startMediaPrefill((done, total) => {
        mediaProgress.value = { done, total }
        if (done >= total) mediaProgress.value = null
      })
    }
    loading.value = false
    await nextTick()
    setupObserver()
    for (let i = 0; i < Math.min(FIRST_BATCH, d.slideCount); i++) requestRender(i)
    syncSlideState()
    syncCells()
  } catch (e: any) {
    error.value = 'PPTX 渲染失败：' + String(e?.message ?? e)
    loading.value = false
    openProgress.value = null
    mediaProgress.value = null
  }
}

function canvasWidth(index: number): number {
  const el = document.querySelector<HTMLElement>(`.ppte-canvas[data-index="${index}"]`)
  return el?.clientWidth && el.clientWidth > 80 ? el.clientWidth : 960
}

function renderSlide(index: number) {
  const d = doc.value
  if (!d || rendered.value.has(index)) return
  if (index < 0 || index >= d.slideCount) return
  rendered.value.add(index)
  try {
    slides.value[index] = d.renderSlide(index, { fitWidthPx: Math.round(canvasWidth(index)) })
  } catch (e: any) {
    rendered.value.delete(index)
    error.value = `第 ${index + 1} 页渲染失败：${String(e?.message ?? e)}`
  }
}

/**
 * 协同渲染调度：把"渲染若干页"从同步循环改成逐帧渲染。
 * 首屏批量、滚动瞬时多页进入视口、宽度重排都走这里——每渲染一页让出一帧（requestAnimationFrame），
 * 主线程不被整篇渲染冻住，幻灯片一张张流式出现，交互（滚动/点击）始终有响应。
 */
let renderToken = 0
let renderQueue: number[] = []
let pumping = false

function requestRender(index: number) {
  const d = doc.value
  if (!d || index < 0 || index >= d.slideCount) return
  if (rendered.value.has(index)) return
  if (!renderQueue.includes(index)) renderQueue.push(index)
  void pump()
}

async function pump() {
  if (pumping) return
  pumping = true
  const token = renderToken
  try {
    while (renderQueue.length && token === renderToken) {
      const idx = renderQueue.shift()!
      if (rendered.value.has(idx)) continue
      // 大媒体懒解压：渲染该页前先把它引用的媒体按需解压（幂等，通常已就绪）
      const d = doc.value
      if (d && d.pendingMediaCount > 0) await d.ensureSlideMedia(idx)
      if (token !== renderToken) break
      renderSlide(idx)
      // 让出一帧：浏览器完成本次绘制 + 处理输入，再渲染下一页
      await nextFrame()
    }
  } finally {
    pumping = false
  }
}

/** 取消在途渲染（切换文件 / 卸载 / 重排前），避免旧文件/旧宽度的渲染污染新状态 */
function cancelRender() {
  renderToken++
  renderQueue = []
  pumping = false
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()))
}

/**
 * 视口懒渲染 + 尺寸变化重渲染。
 * 容器宽度变化需要重建 RenderTree（引擎的 fitWidthPx 决定字号/换行），因此按宽度缓存重排。
 */
let lastWidth = 0
function setupObserver() {
  observer?.disconnect()
  const root = document.querySelector('.ppte-preview')
  observer = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        const idx = Number((en.target as HTMLElement).dataset.index)
        if (Number.isNaN(idx)) continue
        if (en.isIntersecting) requestRender(idx)
      }
    },
    { root, rootMargin: '600px 0px' }
  )
  document.querySelectorAll('.ppte-slide').forEach((el) => observer!.observe(el))
  lastWidth = document.querySelector<HTMLElement>('.ppte-canvas')?.clientWidth ?? 0
}

function onResize() {
  const w = document.querySelector<HTMLElement>('.ppte-canvas')?.clientWidth ?? 0
  if (!w || Math.abs(w - lastWidth) < 24) return
  lastWidth = w
  // RenderTree is laid out for a specific fitWidthPx, so a container-width change invalidates it
  const keep = [...rendered.value]
  rendered.value = new Set()
  for (const i of keep) slides.value[i] = null
  for (const i of keep) requestRender(i)
  for (let i = 0; i < Math.min(FIRST_BATCH, slides.value.length); i++) requestRender(i)
}

/** 编辑后重建受影响页面的 RenderTree；页数变化时整篇重排并重新观察。 */
async function refreshAfterEdit(touched: 'all' | number[]) {
  const d = doc.value
  if (!d) return
  const count = d.slideCount
  if (count !== slides.value.length) {
    slides.value = new Array(count).fill(null)
    rendered.value = new Set()
    await nextTick()
    setupObserver()
    for (let i = 0; i < Math.min(FIRST_BATCH, count); i++) requestRender(i)
    if (Array.isArray(touched)) for (const i of touched) if (i >= 0 && i < count) requestRender(i)
    remapSelection()
    syncSlideState()
    syncCells()
    return
  }
  const list = touched === 'all' ? [...rendered.value] : touched
  for (const i of list) {
    if (i < 0 || i >= count) continue
    rendered.value.delete(i)
    slides.value[i] = null
  }
  for (const i of list) requestRender(i)
  if (touched === 'all') for (let i = 0; i < Math.min(FIRST_BATCH, count); i++) requestRender(i)
  remapSelection()
  syncSlideState()
  syncCells()
}

/**
 * 选中项按"身份别名"重新绑定：引擎在改写某元素字节时会为它铸造 a16:creationId，
 * 该元素的 key 会从 e_<nvId> 升级成 e_<guid8>；重解析也会换掉 parse id。
 * 每次重渲染后把持有的 key 换成当前页上同一元素的正式 key，选中框/后续 op 才不会指向空气。
 */
function remapSelection() {
  const rs = slides.value[selected.value.slide]
  if (!rs) return
  if (selected.value.ids.length) {
    const next = selected.value.ids
      .map((k) => rs.elements.find((e) => e.ids.includes(k))?.key ?? null)
      .filter((k): k is string => !!k)
    if (next.join('\u0000') !== selected.value.ids.join('\u0000')) {
      selected.value = { slide: selected.value.slide, ids: next }
    }
  }
  const ed = editing.value
  if (ed && ed.slideIndex === selected.value.slide) {
    const hit = rs.elements.find((e) => e.ids.includes(ed.key))
    if (hit && hit.key !== ed.key) {
      editing.value = { ...ed, key: hit.key, sourceId: hit.sourceId }
    }
  }
}

function scrollToSlide(index: number) {
  nextTick(() => {
    document
      .querySelector<HTMLElement>(`.ppte-slide[data-index="${index}"]`)
      ?.scrollIntoView({ block: 'start' })
  })
}

/** 幻灯片级状态 + 动画时间线：选中页变化、编辑后都要重读（面板与工具栏只显示这里的真实值）。 */
function syncSlideState() {
  const d = doc.value
  const i = selected.value.slide
  slideState.value = d
    ? d.slideMeta(i)
    : { notes: '', transition: 'none', advanceMs: null, hidden: false }
  anims.value = d ? d.slideAnimations(i).map((a) => ({ el: a.el, effect: a.effect })) : []
}

/** 表格单元格网格：只有「恰好选中一个表格元素」时才铺命中层，其它情况清空以免误命中。 */
function syncCells() {
  const d = doc.value
  const i = selected.value.slide
  const rs = slides.value[i]
  const key = selected.value.ids.length === 1 ? selected.value.ids[0] : null
  const box = key && rs ? rs.elements.find((e) => e.key === key) : null
  cells.value = d && rs && box && box.kind === 'table' && key ? d.tableCells(i, key, rs.widthPx) : []
  if (!cells.value.length) {
    cellSel.value = null
    cellEdit.value = null
  }
}

watch(
  () => `${selected.value.slide}|${selected.value.ids.join('\u0000')}`,
  () => {
    syncSlideState()
    syncCells()
  }
)

// ── 执行 op 事务 ───────────────────────────────────────────

/**
 * 元素引用由 durable id 组成（不是 parse id）：引擎在 addPicture/addTable/group 等 op 里会
 * 重新序列化并重解析整页，parse id 全部失效，只有 bytes 里的 durable id 跨重解析稳定。
 * groupPath 里存的是组自身的 parse id —— resolveGroupChildId 只按 x.id 找组。
 */
function refOf(key: string, slide: number): LocalRef & { slide: number } {
  const box = slides.value[slide]?.elements.find((e) => e.key === key)
  return { slide, el: key, groupPath: box?.groupPath ?? [] }
}

async function persist() {
  const d = doc.value
  if (!d) return
  saving.value = true
  try {
    await savePptxDocument(props.path, d)
    emit('change')
  } catch (e: any) {
    error.value = '保存失败：' + String(e?.message ?? e)
  } finally {
    saving.value = false
  }
}

interface CommitOptions {
  /** 页数/页码变化：整篇重渲染 */
  structural?: boolean
  /** 需要重渲染的页面（非结构性编辑）；'all' 用于整篇文字改写（查找替换） */
  touched?: number[] | 'all'
  /** 结构性操作后把视口带到这一页并重置选中 */
  focus?: number
}

/** 跑一批 op：失败时引擎已回滚（deck 不变），成功后重渲染并立即落盘。 */
async function run(ops: Op[], label: string, opts: CommitOptions = {}) {
  const d = doc.value
  if (!d || saving.value || !ops.length) return null
  const res = d.runOps(ops, label)
  if (!res.applied) {
    const f = res.failures[0]
    error.value = `${label}失败：${f ? f.error : '未知原因'}`
    return null
  }
  error.value = ''
  if (opts.structural) {
    const count = d.slideCount
    const focus = Math.max(0, Math.min(opts.focus ?? selected.value.slide, count - 1))
    selected.value = { slide: focus, ids: [] }
    editing.value = null
    await refreshAfterEdit('all')
    scrollToSlide(focus)
  } else {
    await refreshAfterEdit(opts.touched ?? [selected.value.slide])
  }
  await persist()
  return res
}

async function undo() {
  const d = doc.value
  if (!d || saving.value || !d.undo()) return
  selected.value = { slide: Math.min(selected.value.slide, d.slideCount - 1), ids: [] }
  editing.value = null
  cellEdit.value = null
  cellSel.value = null
  await refreshAfterEdit('all')
  await persist()
}

async function redo() {
  const d = doc.value
  if (!d || saving.value || !d.redo()) return
  selected.value = { slide: Math.min(selected.value.slide, d.slideCount - 1), ids: [] }
  editing.value = null
  cellEdit.value = null
  cellSel.value = null
  await refreshAfterEdit('all')
  await persist()
}

// ── 选中 / 命中测试 ────────────────────────────────────────

function selectAt(index: number, id: string | null, additive: boolean) {
  if (!id) {
    selected.value = { slide: index, ids: [] }
    return
  }
  const prev = selected.value.slide === index ? selected.value.ids.slice() : []
  const pos = prev.indexOf(id)
  let next: string[]
  if (!additive) next = pos >= 0 ? prev : [id]
  else if (pos >= 0) {
    prev.splice(pos, 1)
    next = prev
  } else next = [...prev, id]
  selected.value = { slide: index, ids: next }
}

function onSelect(payload: { ref: LocalRef; additive: boolean }) {
  selectAt(selected.value.slide, payload.ref.el, payload.additive)
}

/** 双击：文字元素进内联编辑；图片元素走替换图。 */
function onActivate(ref: LocalRef) {
  const i = selected.value.slide
  const rs = slides.value[i]
  const box = rs?.elements.find((e) => e.key === ref.el)
  if (!rs || !box) return
  if (box.hasText) {
    const t = rs.texts.find((x) => x.sourceId === box.sourceId)
    if (t) openEditor(i, t)
    return
  }
  if (box.kind === 'picture') void replacePicture(i, box.sourceId)
}

function onCanvasClick(ev: MouseEvent, index: number) {
  if (editing.value) {
    void commitEdit()
    return
  }
  if (armed.value) {
    void placeAt(index, ev)
    return
  }
  // 点到空白（单元格命中层会 stopPropagation，走到这里说明没点在格子上）
  cellSel.value = null
  cellEdit.value = null
  const node = (ev.target as HTMLElement).closest('[data-source-id]') as HTMLElement | null
  // DOM 上挂的是 parse id（data-source-id）；op 要的是 durable id（data-el-id）
  const key = node
    ? (node.dataset.elId ??
      slides.value[index]?.elements.find((e) => e.sourceId === node.dataset.sourceId)?.key ??
      null)
    : null
  selectAt(index, key, ev.shiftKey || ev.metaKey || ev.ctrlKey)
}

/** 点击点 → 幻灯片 px（SVG viewBox 空间）。 */
function pointInSlide(index: number, ev: MouseEvent): { x: number; y: number; w: number; h: number } {
  const rs = slides.value[index]!
  const el = document.querySelector<HTMLElement>(`.ppte-canvas[data-index="${index}"]`)
  const rect = el?.getBoundingClientRect()
  if (!rect || !rect.width) return { x: rs.widthPx / 2, y: rs.heightPx / 2, w: rs.widthPx, h: rs.heightPx }
  const scale = rs.widthPx / rect.width
  return {
    x: (ev.clientX - rect.left) * scale,
    y: (ev.clientY - rect.top) * scale,
    w: rs.widthPx,
    h: rs.heightPx
  }
}

// ── 插入 ──────────────────────────────────────────────────

async function handleInsert(what: InsertKind) {
  if (what === 'picture') {
    await insertPicture()
    return
  }
  if (armed.value === what) {
    armed.value = null
    lineStart.value = null
    return
  }
  armed.value = what
  lineStart.value = null
}

async function placeAt(index: number, ev: MouseEvent) {
  const d = doc.value
  const what = armed.value
  if (!d || !what) return
  const pt = pointInSlide(index, ev)
  const mapper = d.mapper(slides.value[index]!.widthPx)

  if (what === 'line') {
    if (!lineStart.value) {
      lineStart.value = { x: pt.x, y: pt.y }
      return
    }
    const a = lineStart.value
    const dot = (p: { x: number; y: number }): PxRect => ({ x: p.x, y: p.y, w: 1, h: 1 })
    armed.value = null
    lineStart.value = null
    await run([insertOps.connector(index, dot(a), dot(pt), mapper)], '插入直线', {
      touched: [index]
    })
    return
  }
  // 图片走文件对话框（armed 不会设为 picture），这里兜底保证类型收敛
  if (what === 'picture') {
    armed.value = null
    return
  }

  const kind = what === 'textbox' ? 'text' : 'shape'
  const rect = defaultInsertRect(
    pt,
    pt.w,
    pt.h,
    what === 'table' ? 'table' : kind === 'text' ? 'text' : 'shape'
  )
  const op =
    what === 'table'
      ? insertOps.table(index, rect, mapper, 3, 3)
      : what === 'textbox'
        ? insertOps.textBox(index, rect, mapper)
        : insertOps.shape(index, rect, mapper, what)
  armed.value = null
  const res = await run([op], `插入${what === 'textbox' ? '文本框' : '图形'}`, { touched: [index] })
  // 新建元素的 op 返回 parse id；重渲染后按 sourceId 找回它，选中用 durable id
  const created = keyOfCreated(index, res?.created[0])
  if (!created) return
  selected.value = { slide: index, ids: [created] }
  // 新建文本框直接进入编辑态：插入即打字，少一次双击
  if (what === 'textbox') {
    const t = slides.value[index]?.texts.find((x) => x.key === created)
    if (t) openEditor(index, t)
  }
}

/** op 返回的新元素 parse id → durable id（重渲染后从 elements 里反查）。 */
function keyOfCreated(slide: number, parseId?: string): string | null {
  if (!parseId) return null
  const box = slides.value[slide]?.elements.find((e) => e.sourceId === parseId)
  return box?.key ?? parseId
}

async function insertPicture() {
  const d = doc.value
  if (!d) return
  const selectedPath = await open({
    multiple: false,
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
  })
  if (typeof selectedPath !== 'string' || !selectedPath) return
  const index = selected.value.slide
  const rs = slides.value[index]
  if (!rs) return
  try {
    const raw = await readFileBytes(selectedPath)
    const rect = defaultInsertRect(
      { x: rs.widthPx / 2, y: rs.heightPx / 2 },
      rs.widthPx,
      rs.heightPx,
      'picture'
    )
    const res = await run(
      [insertOps.image(index, rect, d.mapper(rs.widthPx), new Uint8Array(raw), extOf(selectedPath))],
      '插入图片',
      { touched: [index] }
    )
    const created = keyOfCreated(index, res?.created[0])
    if (created) selected.value = { slide: index, ids: [created] }
  } catch (e: any) {
    error.value = '插入图片失败：' + String(e?.message ?? e)
  }
}

// ── 工具栏动作 ─────────────────────────────────────────────

async function onAction(a: EditorAction) {
  const d = doc.value
  if (!d) return
  const i = selected.value.slide
  const ids = selected.value.ids
  const refs = ids.map((id) => refOf(id, i))

  switch (a.kind) {
    case 'slide.add':
      await run([slideOps.addBlank(i)], '新增幻灯片', { structural: true, focus: i + 1 })
      return
    case 'slide.dup':
      await run([slideOps.duplicate(i)], '复制幻灯片', { structural: true, focus: i + 1 })
      return
    case 'slide.del':
      if (slideCount.value <= 1) return
      await run([slideOps.remove(i)], '删除幻灯片', {
        structural: true,
        focus: Math.min(i, slideCount.value - 2)
      })
      return
    case 'slide.up':
      await run([slideOps.move(i, i - 1)], '上移幻灯片', { structural: true, focus: i - 1 })
      return
    case 'slide.down':
      await run([slideOps.move(i, i + 1)], '下移幻灯片', { structural: true, focus: i + 1 })
      return
    case 'slide.background':
      await run([slideOps.setBackground(i, a.value)], '设置背景', { touched: [i] })
      return
    case 'slide.notes':
      // 备注写在独立 notesSlide 部件里，不参与渲染 → 无需重渲染，但要把面板的值读回来
      await run([slideOps.setNotes(i, a.value)], '设置备注', { touched: [] })
      syncSlideState()
      return
    case 'slide.transition':
      await run([slideOps.setTransition(i, a.value)], '设置切换效果', { touched: [] })
      syncSlideState()
      return
    case 'slide.advance':
      await run([slideOps.setAdvance(i, a.value)], '设置自动换片', { touched: [] })
      syncSlideState()
      return
    case 'slide.hidden':
      await run([slideOps.setHidden(i, a.value)], a.value ? '隐藏幻灯片' : '取消隐藏', { touched: [] })
      syncSlideState()
      return
    case 'deck.findReplace': {
      // 命中可能落在任何一页，所以整篇重渲染；scope=slide 时把 op 限定在当前页
      const res = await run(
        [
          deckOps.findReplace(a.find, a.replace, {
            matchCase: a.matchCase,
            ...(a.scope === 'slide' ? { slideIndex: i } : {})
          })
        ],
        '查找替换',
        { touched: 'all' }
      )
      const rec = res?.records.find((r) => r.op.op === 'findReplace')
      const count = (rec?.after as { count?: number } | undefined)?.count
      deckMessage.value =
        res && count != null ? `已替换 ${count} 处「${a.find}」` : res ? '已替换' : error.value
      return
    }
    case 'insert':
      await handleInsert(a.what)
      return
    case 'undo':
      await undo()
      return
    case 'redo':
      await redo()
      return
    case 'element.delete':
      if (!refs.length) return
      await run(refs.map(elementOps.remove), '删除元素', { touched: [i] })
      selected.value = { slide: i, ids: [] }
      return
    case 'element.group':
      if (refs.length < 2) return
      await run([elementOps.group(i, ids)], '组合', { touched: [i] })
      selected.value = { slide: i, ids: [] }
      return
    case 'element.ungroup':
      if (!refs.length) return
      await run([elementOps.ungroup(refs[0])], '取消组合', { touched: [i] })
      selected.value = { slide: i, ids: [] }
      return
    case 'element.order':
      if (!refs.length) return
      await run(refs.map((r) => elementOps.reorder(r, a.dir)), '调整层级', { touched: [i] })
      return
    case 'element.opacity':
      if (!refs.length) return
      await run(refs.map((r) => elementOps.setOpacity(r, a.value)), '调整不透明度', { touched: [i] })
      return
    case 'element.cropReset':
      if (!refs.length) return
      await run(refs.map((r) => elementOps.clearCrop(r)), '清除裁剪', { touched: [i] })
      return
    case 'element.link':
      if (!refs.length) return
      await run(refs.map((r) => elementOps.setLink(r, a.url)), '设置链接', { touched: [i] })
      return
    case 'element.shadow': {
      if (!refs.length) return
      const mapper = d.mapper(slides.value[i]?.widthPx ?? 960)
      await run(
        refs.map((r) => elementOps.setShadow(r, a.value ? {} : null, mapper)),
        a.value ? '添加投影' : '移除投影',
        { touched: [i] }
      )
      return
    }
    case 'element.animation': {
      // 一个元素在时间线上可以有多个效果；这里是「设置进入动画」语义 → 先清掉它的旧条目再挂新的。
      // 必须按 seq 倒序删除，否则前面的删除会让后面的 seq 位移。
      const ref = refs[0]
      if (!ref) return
      const mine = d
        .slideAnimations(i)
        .filter((x) => x.el === ref.el || (x.el != null && ids.includes(x.el)))
      const ops: Op[] = mine
        .map((x) => x.seq)
        .sort((p, q) => q - p)
        .map((seq) => animOps.removeBySeq(i, seq))
      if (a.value) ops.push(animOps.add(ref, a.value as AnimEffect))
      if (!ops.length) return
      await run(ops, a.value ? '设置动画' : '清除动画', { touched: [] })
      syncSlideState()
      return
    }
    case 'table.cellFill': {
      const c = cellInfo.value
      if (!c) return
      await run([tableOps.cellFill(refOf(c.key, i), c.row, c.col, a.value)], '单元格底纹', {
        touched: [i]
      })
      return
    }
    case 'table.cellEdit': {
      const c = cellSel.value
      if (c) openCellEditor(c.row, c.col)
      return
    }
    case 'align':
      if (!ids.length) return
      await run(
        [arrangeOps.align(i, ids, a.mode, ids.length > 1 ? 'selection' : 'slide')],
        '对齐',
        { touched: [i] }
      )
      return
    case 'distribute':
      if (ids.length < 3) return
      await run([arrangeOps.distribute(i, ids, a.axis)], '等距分布', { touched: [i] })
      return
    case 'format.fill':
      if (!refs.length) return
      await run(refs.map((r) => elementOps.setFill(r, a.value)), '设置填充', { touched: [i] })
      return
    case 'format.stroke':
      if (!refs.length) return
      await run(
        refs.map((r) => elementOps.setStroke(r, a.value ? { color: a.value, widthPt: 1 } : null)),
        '设置描边',
        { touched: [i] }
      )
      return
    case 'format.font': {
      if (!refs.length) return
      await run(refs.map((r) => textOps.setFont(r, a.patch)), '设置字体', { touched: [i] })
      return
    }
    case 'text.exec':
      exec(a.cmd, a.value)
      return
  }
}

/** 元素拖动/缩放结束：一次事务写回（多选时逐个 setTransform，仍在同一事务里原子生效）。 */
async function onTransformCommit(payload: { refs: LocalRef[]; rects: PxRect[]; label: string }) {
  const d = doc.value
  if (!d) return
  const i = selected.value.slide
  const rs = slides.value[i]
  if (!rs) return
  const mapper = d.mapper(rs.widthPx)
  const ops = payload.refs.map((r, k) =>
    elementOps.transform({ slide: i, el: r.el, groupPath: r.groupPath }, payload.rects[k], mapper)
  )
  await run(ops, payload.label, { touched: [i] })
}

// ── 文字编辑 ──────────────────────────────────────────────

function openEditor(index: number, box: RenderedSlide['texts'][number]) {
  const scale = overlayScale(index, box.w)
  editing.value = {
    slideIndex: index,
    sourceId: box.sourceId,
    key: box.key,
    baseline: {
      bold: box.bold,
      italic: box.italic,
      underline: box.underline,
      strike: box.strike,
      color: box.color,
      fontSizePx: box.fontSizePx,
      align: box.align
    }
  }
  const w = slides.value[index]!.widthPx
  const h = slides.value[index]!.heightPx
  const pct = (v: number, total: number) => `${((v / total) * 100).toFixed(4)}%`
  editingStyle.value = {
    left: pct(box.x + box.insetL, w),
    top: pct(box.y + box.insetT, h),
    width: pct(Math.max(box.w - box.insetL - box.insetR, 8), w),
    height: pct(Math.max(box.h - box.insetT - box.insetB, 8), h),
    fontFamily: box.fontFamily,
    fontSize: `${(box.fontSizePx * scale).toFixed(2)}px`,
    fontWeight: box.bold ? '700' : '400',
    fontStyle: box.italic ? 'italic' : 'normal',
    color: box.color,
    textAlign: box.align,
    justifyContent:
      box.anchor === 'middle' ? 'center' : box.anchor === 'bottom' ? 'flex-end' : 'flex-start'
  }
  selected.value = { slide: index, ids: [box.key] }
  nextTick(() => {
    const el = overlayEl
    if (!el) return
    el.innerHTML = box.text
      .split('\n')
      .map((line) => `<div>${esc(line) || '<br>'}</div>`)
      .join('')
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  })
}

function overlayScale(index: number, boxW: number): number {
  const el = document.querySelector<HTMLElement>(`.ppte-slide[data-index="${index}"] .ppte-canvas`)
  const total = slides.value[index]?.widthPx ?? boxW
  if (!el?.clientWidth || !total) return 1
  return el.clientWidth / total
}

function setOverlay(el: Element | { $el?: Element } | null) {
  overlayEl = ((el as any)?.$el ?? el) as HTMLDivElement | null
}

async function commitEdit() {
  const cur = editing.value
  const d = doc.value
  const el = overlayEl
  editing.value = null
  if (!cur || !d || !el) return
  const paragraphs = domToParagraphs(el, cur.baseline)
  const changed = d.setTextParagraphs(cur.slideIndex, cur.sourceId, paragraphs)
  if (!changed) return
  await refreshAfterEdit([cur.slideIndex])
  await persist()
}

function cancelEdit() {
  editing.value = null
}

function onEditorKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    cancelEdit()
  }
  // Enter 在 contenteditable 里默认插入 <div>（新段落），保持默认行为即可
}

// ── 表格单元格 ────────────────────────────────────────────

function setCellOverlay(el: Element | { $el?: Element } | null) {
  cellOverlayEl = ((el as any)?.$el ?? el) as HTMLDivElement | null
}

function onCellPick(c: { row: number; col: number }) {
  cellSel.value = c
}

function onCellEdit(c: { row: number; col: number }) {
  cellSel.value = c
  openCellEditor(c.row, c.col)
}

/** 单元格文字编辑层：定位/字体按单元格自己的框与首 run 样式算，与元素文字编辑共用一套转换。 */
function openCellEditor(row: number, col: number) {
  const i = selected.value.slide
  const rs = slides.value[i]
  const c = cells.value.find((x) => x.row === row && x.col === col)
  const key = selected.value.ids[0]
  if (!rs || !c || !key) return
  const scale = overlayScale(i, c.w)
  const pct = (v: number, total: number) => `${((v / total) * 100).toFixed(4)}%`
  cellSel.value = { row, col }
  cellEdit.value = {
    slideIndex: i,
    key,
    row,
    col,
    baseline: {
      bold: c.bold,
      italic: c.italic,
      underline: false,
      strike: false,
      color: c.color,
      fontSizePx: c.fontSizePx,
      align: c.align
    }
  }
  cellEditStyle.value = {
    left: pct(c.x, rs.widthPx),
    top: pct(c.y, rs.heightPx),
    width: pct(c.w, rs.widthPx),
    height: pct(c.h, rs.heightPx),
    fontFamily: c.fontFamily || 'inherit',
    fontSize: `${(c.fontSizePx * scale).toFixed(2)}px`,
    fontWeight: c.bold ? '700' : '400',
    fontStyle: c.italic ? 'italic' : 'normal',
    color: c.color,
    textAlign: c.align
  }
  nextTick(() => {
    const el = cellOverlayEl
    if (!el) return
    el.innerHTML = c.text
      .split('\n')
      .map((line) => `<div>${esc(line) || '<br>'}</div>`)
      .join('')
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  })
}

async function commitCellEdit() {
  const cur = cellEdit.value
  const d = doc.value
  const el = cellOverlayEl
  cellEdit.value = null
  if (!cur || !d || !el) return
  const paragraphs = domToParagraphs(el, cur.baseline)
  await run(
    [tableOps.cellText(refOf(cur.key, cur.slideIndex), cur.row, cur.col, paragraphs)],
    '改单元格文字',
    { touched: [cur.slideIndex] }
  )
}

function onCellEditorKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    cellEdit.value = null
  }
}

/** 工具栏作用于选中文字（contenteditable），提交时由 dom-edit 转成模型 run 属性。 */
function exec(cmd: string, value?: string) {
  if (!editing.value) return
  try {
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(cmd, false, value)
  } catch (e) {
    console.warn('[PptxInlineEditor] execCommand failed', cmd, e)
  }
}

// ── 图片替换 ──────────────────────────────────────────────

async function replacePicture(index: number, sourceId: string) {
  const d = doc.value
  if (!d) return
  const selectedPath = await open({
    multiple: false,
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
  })
  if (typeof selectedPath !== 'string' || !selectedPath) return
  try {
    const raw = await readFileBytes(selectedPath)
    const ok = d.replacePicture(index, sourceId, new Uint8Array(raw), extOf(selectedPath))
    if (!ok) {
      error.value = '该图片对象不支持替换（可能来自母版/布局层）'
      return
    }
    await refreshAfterEdit([index])
    await persist()
  } catch (e: any) {
    error.value = '替换图片失败：' + String(e?.message ?? e)
  }
}

// ── 键盘 ──────────────────────────────────────────────────

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1]
}

function onWindowKeydown(ev: KeyboardEvent) {
  const t = ev.target as HTMLElement | null
  const inField = !!t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))
  const mod = ev.metaKey || ev.ctrlKey
  if (mod && ev.key.toLowerCase() === 'z') {
    if (inField || editing.value || cellEdit.value) return
    ev.preventDefault()
    void (ev.shiftKey ? redo() : undo())
    return
  }
  if (inField || editing.value || cellEdit.value || saving.value) return
  const ids = selected.value.ids
  if (ev.key === 'Escape') {
    armed.value = null
    lineStart.value = null
    selected.value = { slide: selected.value.slide, ids: [] }
    return
  }
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && ids.length) {
    ev.preventDefault()
    void onAction({ kind: 'element.delete' })
    return
  }
  if (mod && ev.key.toLowerCase() === 'g' && ids.length) {
    ev.preventDefault()
    void onAction({ kind: ev.shiftKey ? 'element.ungroup' : 'element.group' })
    return
  }
  const nudge = NUDGE[ev.key]
  if (nudge && ids.length) {
    ev.preventDefault()
    const step = ev.shiftKey ? 10 : 1
    const i = selected.value.slide
    const rs = slides.value[i]
    const d = doc.value
    if (!rs || !d) return
    const mapper = d.mapper(rs.widthPx)
    const ops = ids.flatMap((id) => {
      const b = rs.elements.find((e) => e.key === id)
      if (!b) return []
      const rect: PxRect = { x: b.x + nudge[0] * step, y: b.y + nudge[1] * step, w: b.w, h: b.h }
      return [elementOps.transform(refOf(id, i), rect, mapper)]
    })
    void run(ops, '移动元素', { touched: [i] })
  }
}

onMounted(() => {
  void load()
  window.addEventListener('keydown', onWindowKeydown)
})
watch(() => props.path, load)
onBeforeUnmount(() => {
  cancelRender()
  observer?.disconnect()
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onWindowKeydown)
})
</script>

<template>
  <div class="ppte">
    <PptxOpsToolbar
      :slide-index="selected.slide"
      :slide-count="slideCount"
      :context="context"
      :sel="selInfo"
      :slide-state="slideState"
      :cell="cellInfo"
      :message="deckMessage"
      :can-undo="!!doc?.canUndo"
      :can-redo="!!doc?.canRedo"
      :undo-label="doc?.undoLabel ?? ''"
      :redo-label="doc?.redoLabel ?? ''"
      :busy="saving"
      :status="status"
      :hint="hint"
      @action="onAction"
    />

    <div class="ppte-preview">
      <div v-if="loading" class="ppte-loading">
        <div class="ppte-loading-card">
          <div class="ppte-spinner" aria-hidden="true"></div>
          <div class="ppte-loading-title">加载幻灯片预览中…</div>
          <div v-if="openProgress" class="ppte-loading-sub">
            正在解析大文件 · {{ openProgress.parsed }} / {{ openProgress.total }} 页
          </div>
        </div>
      </div>
      <div v-else-if="error" class="ppte-error">{{ error }}</div>
      <div v-else-if="!slideCount" class="ppte-loading">该文件没有可渲染的幻灯片</div>
      <div v-if="mediaProgress" class="ppte-media-pill">
        媒体解压中 {{ mediaProgress.done }} / {{ mediaProgress.total }}
      </div>

      <template v-else>
        <div
          v-for="(s, i) in slides"
          :key="i"
          class="ppte-slide"
          :data-index="i"
          :class="{ 'ppte-slide--active': selected.slide === i }"
        >
          <div class="ppte-head">
            <span class="ppte-no">{{ i + 1 }}</span>
            <span class="ppte-title">{{ s?.title || (s ? '（无标题）' : '待渲染…') }}</span>
          </div>
          <div
            class="ppte-canvas"
            :data-index="i"
            :class="{ 'ppte-canvas--armed': !!armed }"
            @click.stop="onCanvasClick($event, i)"
          >
            <div v-if="s" class="ppte-svg" v-html="s.svg"></div>
            <div v-else class="ppte-skeleton">渲染中…</div>
            <PptxElementLayer
              v-if="s"
              :elements="s.elements"
              :selected="selected.slide === i ? selected.ids : []"
              :width-px="s.widthPx"
              :height-px="s.heightPx"
              :editing-id="editing && editing.slideIndex === i ? editing.key : null"
              :busy="saving"
              @select="onSelect"
              @activate="onActivate"
              @commit="onTransformCommit"
            />
            <PptxTableCellLayer
              v-if="s && selected.slide === i && cells.length && !cellEdit"
              :cells="cells"
              :width-px="s.widthPx"
              :height-px="s.heightPx"
              :selected="cellSel"
              :busy="saving"
              @pick="onCellPick"
              @edit="onCellEdit"
            />
            <div
              v-if="editing && editing.slideIndex === i"
              :ref="setOverlay"
              class="ppte-inline"
              :style="editingStyle"
              contenteditable="true"
              spellcheck="false"
              @keydown="onEditorKeydown"
              @blur="commitEdit"
              @click.stop
            ></div>
            <div
              v-if="cellEdit && cellEdit.slideIndex === i"
              :ref="setCellOverlay"
              class="ppte-inline ppte-inline--cell"
              :style="cellEditStyle"
              contenteditable="true"
              spellcheck="false"
              @keydown="onCellEditorKeydown"
              @blur="commitCellEdit"
              @click.stop
            ></div>
          </div>
        </div>
      </template>
    </div>
    <div v-if="saving" class="ppte-saving">保存中…</div>
  </div>
</template>

<style src="./PptxInlineEditor.css" scoped></style>
