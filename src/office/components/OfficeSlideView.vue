<script setup lang="ts">
/**
 * PPT 视图：按页取 SlideModel；主舞台与缩略图共用 OfficeSlideCanvas。
 * 缩略图按可见性懒加载，文本形状可就地编辑并写回 OOXML。
 */
import { ref, shallowRef, shallowReactive, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { DocumentClient, OpenResult, SlideModel, SlideEl, PresentationMeta } from '../client'
import type { AnimPreset, Box, ShapeOp } from '../core/pptx/types'
import type { ChartData } from '../core/pptx/types'
import { MediaCache } from '../media'
import { usePptxTextEdit } from '../composables/usePptxTextEdit'
import OfficeSlideCanvas from './OfficeSlideCanvas.vue'
import OfficeSlideThemePanel from './OfficeSlideThemePanel.vue'
import OfficeChartDataDialog from './OfficeChartDataDialog.vue'

const props = defineProps<{ client: DocumentClient; editable: boolean; info: OpenResult }>()
const emit = defineEmits<{ (e: 'change'): void; (e: 'error', m: string): void }>()

const meta = shallowRef(props.info.pptx!)
const index = ref(0)
const slide = shallowRef<SlideModel | null>(null)
const rootEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const scale = ref(1)
const selEl = ref(-1)
/** 多选集合（元素索引）；selEl 始终为其中的主选中项，供现有单值命令使用 */
const selEls = ref<number[]>([])
/** 工具条可见状态：缩放 / 视图模式 / 隐藏当前页 */
const bar = reactive({ zoom: 1, view: 'normal', hidden: false })
const media = new MediaCache(props.client)
let ro: ResizeObserver | null = null
/** 视图内「母版 / 主题」侧面板显隐（不改 ribbon） */
const showTheme = ref(false)
/** 视图内「演讲者备注」面板显隐（可折叠） */
const showNotes = ref(false)
/** 动画播放触发序号：画布 watch 自增重放当前页入场动画 */
const playSeq = ref(0)
/** 演示模式换页时的切换效果类（随下一次换页或超时清除） */
const transCls = ref('')
let transTimer: ReturnType<typeof setTimeout> | null = null
const hasAnims = computed(() => !!(slide.value?.animSeq?.length || slide.value?.els.some((e) => e.anim)))
const notesText = computed(() => slide.value?.notes ?? '')

/** 形状文本富编辑（修复⑥）：PptxEditor 生命周期 + 编辑层 HTML，命令面在下面 commands 接线 */
const texEdit = usePptxTextEdit(props.client, {
  currentIndex: () => index.value,
  currentModel: () => slide.value,
  onCommitted: (i, model) => {
    if (i === index.value) adopt(model, i)
    emit('change')
  },
  onError: (m) => emit('error', m),
})

/** 缩略图模型缓存：结构变更时整体失效；当前页编辑后只更新该页 */
const thumbs = shallowReactive(new Map<number, SlideModel>())
const thumbPending = new Set<number>()
let thumbGen = 0
const thumbList = computed(() =>
  meta.value.slides.map((s) => ({ ...s, model: thumbs.get(s.index) ?? null }))
)
let thumbIo: IntersectionObserver | null = null

if (typeof IntersectionObserver !== 'undefined') {
  thumbIo = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const i = Number((e.target as HTMLElement).dataset.slideIndex)
        thumbIo?.unobserve(e.target)
        void ensureThumb(i)
      }
    },
    { rootMargin: '120px' }
  )
}

function invalidateThumbs() {
  thumbGen++
  thumbs.clear()
}

async function ensureThumb(i: number) {
  if (thumbs.has(i) || thumbPending.has(i)) return
  const gen = thumbGen
  thumbPending.add(i)
  try {
    const model = await props.client.call('pptx.slide', i)
    if (gen === thumbGen) thumbs.set(i, model)
  } catch {
    /* 单页缩略图失败保留占位，不阻断主舞台 */
  } finally {
    thumbPending.delete(i)
  }
}

const thumbEls = new Map<number, HTMLElement>()
function observeThumb(el: unknown, i: number) {
  const node = el as HTMLElement | null
  if (!node) { thumbEls.delete(i); return }
  thumbEls.set(i, node)
  if (!thumbIo) return
  node.dataset.slideIndex = String(i)
  thumbIo.observe(node)
}

/** ---------- 缩略图 pointer 拖拽重排（4px 阈值保留 click / 右键） ----------
 *  from/to 为「原始数组的索引」：to 是落点插槽（0..count，插在该 index 之前）。
 *  move op 的 to 是结果数组的最终索引，故落点插槽 > from 时要减一。 */
const drag = reactive({ on: false, from: -1, slot: -1, target: -1, x: 0, y: 0, sx: 0, sy: 0, pid: -1 })
const DRAG_THRESHOLD = 4
let suppressThumbClick = false

function onThumbDown(ev: PointerEvent, i: number) {
  if (!props.editable || ev.button !== 0) return
  drag.on = false
  drag.from = i
  drag.slot = -1
  drag.target = -1
  drag.sx = drag.x = ev.clientX
  drag.sy = drag.y = ev.clientY
  drag.pid = ev.pointerId
  // 不 preventDefault / 不 setPointerCapture：保留 click 与右键，移动监听挂 window 上
}

function onThumbMove(ev: PointerEvent) {
  if (drag.from < 0 || ev.pointerId !== drag.pid) return
  drag.x = ev.clientX
  drag.y = ev.clientY
  if (!drag.on) {
    if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) < DRAG_THRESHOLD) return
    drag.on = true
  }
  ev.preventDefault()
  const slides = meta.value.slides
  let slot = slides.length
  for (const s of slides) {
    const el = thumbEls.get(s.index)
    if (!el) continue
    const r = el.getBoundingClientRect()
    if (ev.clientY < r.top + r.height / 2) { slot = s.index; break }
  }
  drag.slot = slot
  drag.target = slot > drag.from ? slot - 1 : slot
}

/** 指示线相对列表内容的位置（列表 position:relative 由 office-shape.css 提供） */
const dropLineTop = computed(() => {
  if (!drag.on || drag.slot < 0) return -9999
  const slides = meta.value.slides
  if (drag.slot >= slides.length) {
    const last = thumbEls.get(slides[slides.length - 1]?.index)
    return last ? last.offsetTop + last.offsetHeight + 3 : 0
  }
  const el = thumbEls.get(slides[drag.slot]?.index)
  return el ? el.offsetTop - 3 : 0
})

async function endThumbDrag(ev: PointerEvent) {
  if (drag.from < 0 || ev.pointerId !== drag.pid) return
  const { on, from, target } = drag
  resetDrag()
  if (!on) return
  suppressThumbClick = true
  // 松手不在原缩略图上时不会触发 click，兜底清除，避免吞掉下一次单击
  setTimeout(() => { suppressThumbClick = false }, 0)
  if (target === from || target < 0) return
  await reorderSlide(from, target)
}

function resetDrag() {
  drag.on = false
  drag.from = -1
  drag.slot = -1
  drag.target = -1
  drag.pid = -1
}

/** 调 pptx.slides move 并同步当前页：当前页随移动迁移，区间内的页相应平移 */
async function reorderSlide(from: number, to: number) {
  const cur = index.value
  const next = cur === from ? to : (from < cur && cur <= to ? cur - 1 : (to <= cur && cur < from ? cur + 1 : cur))
  try {
    meta.value = await props.client.call('pptx.slides', { op: 'move', from, to })
    invalidateThumbs()
    emit('change')
    await load(next)
  } catch (e) {
    emit('error', String(e))
  }
}

function onThumbClick(i: number) {
  if (suppressThumbClick) { suppressThumbClick = false; return }
  void load(i)
}

function fit() {
  const s = slide.value
  const st = stageEl.value
  // v-show 隐藏态挂载时 stage 尺寸为 0，跳过；ResizeObserver 会在显示后重算
  if (!s || !st || st.clientWidth < 80 || st.clientHeight < 80) return
  scale.value = Math.max(0.1, Math.min((st.clientWidth - 48) / s.w, (st.clientHeight - 48) / s.h, 1)) * bar.zoom
}

/** 统一入口：模型变更同步主舞台、当前页与缩略图缓存。
 *  同引用不写 Map——shallowReactive 的 set 会触发整列缩略图重渲染，点一次卡一次 */
function adopt(model: SlideModel, i: number) {
  slide.value = model
  index.value = i
  // 修复②：隐藏按钮态随当前页更新（ribbon toggle 读 bar.hidden；meta 由
  // slideOp / undo 的 refreshMeta 带回 hidden 标志）
  bar.hidden = meta.value.slides[i]?.hidden ?? false
  if (thumbs.get(i) !== model) thumbs.set(i, model)
  // 结构变更（删除等）后裁掉越界选择，避免指向已不存在的形状
  const s = selEls.value.filter((k) => k < model.els.length)
  if (s.length !== selEls.value.length) {
    selEls.value = s
    if (!s.includes(selEl.value)) selEl.value = s.length ? s[s.length - 1] : -1
  }
}

/** 连续点缩略图时旧 RPC 可能后返回，序号判旧避免舞台显示错页 */
let loadSeq = 0
async function load(i: number) {
  lastPoint = null
  const seq = ++loadSeq
  // 切页 = 离开当前形状：提交并摘掉编辑层（PptxEditor 是单形状编辑）
  texEdit.stop()
  // 缩略图已取过模型：直接切页，不再发 RPC
  const cached = thumbs.get(i)
  if (cached) {
    adopt(cached, i)
    await nextTick()
    if (seq === loadSeq) fit()
    playTrans(cached)
    return
  }
  try {
    const model = await props.client.call('pptx.slide', i)
    if (seq !== loadSeq) return
    adopt(model, i)
    await nextTick()
    if (seq === loadSeq) fit()
    playTrans(model)
  } catch (e) {
    if (seq === loadSeq) emit('error', String(e))
  }
}

/** 演示模式进入一页时播放该页切换效果（CSS keyframes，office-shape.css） */
function playTrans(model: SlideModel) {
  if (bar.view !== 'present' || !model.transition || model.transition === 'none') return
  transCls.value = `ov-trans-${model.transition}`
  if (transTimer) clearTimeout(transTimer)
  transTimer = setTimeout(() => { transCls.value = '' }, 750)
}

/** Ribbon 上一页 / 下一页后，把当前缩略图滚进可视区（手动算，不带动整页滚动） */
function scrollThumbIntoView(i: number) {
  const list = listEl.value
  const el = list?.querySelector<HTMLElement>(`[data-slide-index="${i}"]`)
  if (!list || !el) return
  const top = el.offsetTop
  const bottom = top + el.offsetHeight
  if (top < list.scrollTop) list.scrollTop = Math.max(0, top - 8)
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 8
}
watch(index, (i) => nextTick(() => { scrollThumbIntoView(i); clearSel() }))

/** 形状文本编辑（修复⑥）：双击进 PptxEditor 富编辑，格式 / 文本经 pptx.setText
 *  写真实 OOXML（a:rPr / a:pPr）；纯文本提交路径（ShapeOp shapeText）已由内核探针
 *  __smoke-p5 直接调用 RPC 覆盖，视图不再需要。 */

/** 一次 RPC 发一条或多条 ops（内核 shapeOps 循环处理） */
async function applyShapes(op: ShapeOp | ShapeOp[]) {
  if (!slide.value) return
  const ops = Array.isArray(op) ? op : [op]
  if (!ops.length) return
  try {
    adopt(await props.client.call('pptx.shapes', index.value, ops), index.value)
    emit('change')
  } catch (e) {
    emit('error', String(e))
  }
}

/** ---------- 图片插入 / 剪贴板粘贴（问题 4） ----------
 *  菜单插入与粘贴共用一条路径：pptx.image 落 ppt/media + rels，再 insert 带 rid 的 p:pic。
 *  box 按图片自然比例限幅，优先落在最近点击位置，否则幻灯片中央。 */
let lastPoint: { x: number; y: number } | null = null
function onStageClick(ev: MouseEvent) {
  if (bar.view === 'present') { commands.next(); return }
  const canvas = stageEl.value?.querySelector<HTMLElement>('.ov-slide-canvas')
  if (!canvas || !slide.value) return
  const r = canvas.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return
  lastPoint = { x: (ev.clientX - r.left) / scale.value, y: (ev.clientY - r.top) / scale.value }
}

async function imageBox(blob: Blob): Promise<Box> {
  const s = slide.value!
  const maxW = s.w * 0.6
  const maxH = s.h * 0.6
  let w = maxW
  let h = maxH
  try {
    // 老 WebView 可能没有 createImageBitmap；解码失败退回中央定幅，不影响落盘
    const bmp = await createImageBitmap(blob)
    const ar = bmp.width / bmp.height
    if (ar > 0 && Number.isFinite(ar)) { w = Math.min(maxW, maxH * ar); h = w / ar }
    bmp.close?.()
  } catch { /* 保留默认 */ }
  const cx = lastPoint?.x ?? s.w / 2
  const cy = lastPoint?.y ?? s.h / 2
  return {
    x: Math.max(0, Math.min(s.w - w, cx - w / 2)),
    y: Math.max(0, Math.min(s.h - h, cy - h / 2)),
    w, h,
  }
}

async function insertImageBlob(blob: Blob) {
  const s = slide.value
  if (!s || !props.editable) return
  const ext = (blob.type.split('/')[1] ?? 'png').toLowerCase().replace('jpeg', 'jpg') || 'png'
  try {
    const rid = await props.client.call('pptx.image', index.value, await blob.arrayBuffer(), ext)
    const box = await imageBox(blob)
    await applyShapes({ op: 'insert', kind: 'image', box, rid })
  } catch (e) {
    emit('error', `插入图片失败：${String(e)}`)
  }
}

/** 文档级 paste：只取 image Blob；焦点在输入/可编辑区时不抢文本粘贴 */
function onPaste(ev: ClipboardEvent) {
  if (!props.editable || ev.defaultPrevented) return
  if (rootEl.value && rootEl.value.offsetParent === null) return
  const a = document.activeElement as HTMLElement | null
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return
  const items = ev.clipboardData?.items
  if (!items) return
  for (const it of Array.from(items)) {
    if (it.kind !== 'file' || !it.type.startsWith('image/')) continue
    const f = it.getAsFile()
    if (f) { ev.preventDefault(); void insertImageBlob(f); return }
  }
}

/** ---------- 演讲者备注 / 表格单元格 / SmartArt 提交 ---------- */

/** 备注失焦：写回 notesSlide part（内核负责创建缺失 part），返回刷新后的页模型 */
async function commitNotes(text: string) {
  if (!props.editable) return
  try {
    adopt(await props.client.call('pptx.notes', index.value, text), index.value)
    emit('change')
  } catch (e) {
    emit('error', String(e))
  }
}

/** 表格右键菜单定位用的「当前单元格」：双击进入编辑时由画布上报 */
let lastCell: { i: number; ri: number; ci: number } | null = null
function onCellEdit(p: { i: number; ri: number; ci: number }) {
  lastCell = p
}
function cellAnchor(): { i: number; ri: number; ci: number } {
  return lastCell ?? { i: selEl.value, ri: 0, ci: 0 }
}
function commitCell(p: { i: number; ri: number; ci: number; lines: string[] }) {
  void applyShapes({ op: 'cellText', top: ownId(p.i), row: p.ri, col: p.ci, text: p.lines.join('\n') })
}
function commitDgm(p: { i: number; nodeId: string; lines: string[] }) {
  void applyShapes({ op: 'dgmText', top: topId(p.i), node: p.nodeId, text: p.lines.join('\n') })
}

/** 原生图表数据编辑：双击 / 右键菜单打开面板，确定后整份写回 chart part + 源工作簿 */
const chartDlg = reactive<{ open: boolean; i: number; data: ChartData | null }>({ open: false, i: -1, data: null })
function openChartDlg(i: number) {
  const el = slide.value?.els[i]
  if (!props.editable || !el || el.t !== 'chart') return
  chartDlg.i = i
  chartDlg.data = el.data
  chartDlg.open = true
}
function commitChart(data: ChartData) {
  const i = chartDlg.i
  chartDlg.open = false
  if (i >= 0) void applyShapes({ op: 'chartData', top: topId(i), data })
}

/** 主题 / 母版 / 版式 op 作用于整份母版，所有页缩略图都要失效重渲染 */
function applyThemeOp(op: ShapeOp) {
  invalidateThumbs()
  void applyShapes(op)
}

/** 内核 shapeOps 的 top 是形状 OOXML id（SlideEl.top），不是 els 数组索引 */
function topId(i: number): number {
  return slide.value?.els[i]?.top ?? i
}

/** 内容/格式 op 用元素自身 id：组内子形状 = 子 id（顶层 oid === top） */
function ownId(i: number): number {
  const el = slide.value?.els[i]
  return el?.oid ?? el?.top ?? i
}

function clearSel() {
  selEls.value = []
  selEl.value = -1
}

/** 普通点击单选；Ctrl/Cmd/Shift 点击切换多选；selEl 跟随主选中项 */
function onSelect(i: number, additive: boolean) {
  if (!props.editable) return
  if (!additive) { selEls.value = [i]; selEl.value = i; return }
  const has = selEls.value.includes(i)
  const s = has ? selEls.value.filter((k) => k !== i) : [...selEls.value, i]
  selEls.value = s
  selEl.value = s.length ? s[s.length - 1] : -1
}

/** 框选套选：一次性把选中集合设为与选框相交的若干形状索引 */
function onSelectSet(ids: number[]) {
  if (!props.editable) return
  selEls.value = [...ids]
  selEl.value = ids.length ? ids[ids.length - 1] : -1
}

/** ---------- 画布文本编辑事件（修复⑥） ---------- */
function onTextEdit(i: number) {
  if (!props.editable) return
  // 进编辑即单选该形状：格式命令的作用域要明确
  selEls.value = [i]
  selEl.value = i
  texEdit.start(i)
}
function onTextKey(ev: KeyboardEvent) {
  // Esc 丢弃退出；⌘/Ctrl+Enter 提交退出（RichInput 不拦这两个键）
  if (ev.key === 'Escape') { ev.preventDefault(); texEdit.cancel() }
  else if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); texEdit.stop() }
}

/** Canvas 松手后的最终几何：转成多条 xfrm 一次写回内核 */
function onTransform(changes: { i: number; box: Box }[]) {
  if (!props.editable || !changes.length) return
  const ops: ShapeOp[] = changes.map((c) => ({ op: 'xfrm', top: topId(c.i), box: c.box }))
  void applyShapes(ops)
}

function deleteSelection() {
  if (!slide.value || !selEls.value.length) return
  // 删除正在编辑的形状：先退出富编辑层，避免编辑层悬挂在已不存在的 els 索引上
  if (texEdit.editIdx.value >= 0 && selEls.value.includes(texEdit.editIdx.value)) texEdit.stop()
  // 索引从大到小，避免删除时后续 top 错位
  const ops: ShapeOp[] = [...selEls.value].sort((a, b) => b - a).map((i) => ({ op: 'delete', top: topId(i) }))
  void applyShapes(ops)
  clearSel()
}

function duplicateSelection() {
  if (!slide.value || !selEls.value.length) return
  const ops: ShapeOp[] = selEls.value.map((i) => ({ op: 'duplicate', top: topId(i), dx: 12, dy: 12 }))
  void applyShapes(ops)
  // 保留选区：Office 复制后仍可继续微调 / 删除，不能把后续 Delete 变成空操作
}

function nudge(dx: number, dy: number) {
  const s = slide.value
  if (!s || !selEls.value.length) return
  const ops: ShapeOp[] = selEls.value.map((i) => {
    const b = s.els[i].box
    return { op: 'xfrm', top: topId(i), box: { ...b, x: b.x + dx, y: b.y + dy } }
  })
  void applyShapes(ops)
}

/** 形状命令作用于当前选中的形状；未选中时提示而不误改第一个元素 */
const needSel = () => selEl.value >= 0 && selEl.value < (slide.value?.els.length ?? 0)

const commands = {
  goto: load,
  prev: () => index.value > 0 && void load(index.value - 1),
  next: () => index.value < meta.value.count - 1 && void load(index.value + 1),
  addSlide: async (layout?: 'title' | 'content' | 'blank') => {
    meta.value = await props.client.call('pptx.slides', { op: 'add', after: index.value, layout })
    invalidateThumbs()
    emit('change')
    await load(index.value + 1)
  },
  deleteSlide: async () => {
    meta.value = await props.client.call('pptx.slides', { op: 'delete', index: index.value })
    invalidateThumbs()
    emit('change')
    await load(Math.min(index.value, meta.value.count - 1))
  },
  duplicate: async () => {
    meta.value = await props.client.call('pptx.slides', { op: 'duplicate', index: index.value })
    invalidateThumbs()
    emit('change')
    await load(index.value + 1)
  },
  moveSlide: async (d: number) => {
    const to = Math.max(0, Math.min(meta.value.count - 1, index.value + d))
    if (to === index.value) return
    meta.value = await props.client.call('pptx.slides', { op: 'move', from: index.value, to })
    invalidateThumbs()
    emit('change')
    await load(to)
  },
  hidden: async (on: boolean) => {
    bar.hidden = on
    meta.value = await props.client.call('pptx.slides', { op: 'hide', index: index.value, hidden: on })
    emit('change')
  },
  insertShape: async (kind: string, blob?: Blob) => {
    const s = slide.value
    if (!s) return
    if (kind === 'image') {
      if (!blob) return '请先选择图片文件'
      return insertImageBlob(blob)
    }
    const box: Box = { x: s.w * 0.25, y: s.h * 0.3, w: s.w * 0.5, h: Math.min(120, s.h * 0.2) }
    await applyShapes({ op: 'insert', kind, box, text: kind === 'text' ? '双击编辑文字' : undefined })
  },
  insertText: () => commands.insertShape('text'),
  /** 修复④：叠放 / 填充 / 线条命令作用于全部选中形状（多条 ShapeOp 一次下发），
   *  未选中时 return 提示串走 OfficeToolbar toast */
  order: (to: 'front' | 'back' | 'forward' | 'backward') =>
    needSel() ? applyShapes(selEls.value.map((i) => ({ op: 'order', top: topId(i), to }))) : '请先选中形状',
  duplicateShape: () => (needSel() ? duplicateSelection() : '请先选中形状'),
  deleteShape: () => (needSel() ? deleteSelection() : '请先选中形状'),
  shapeFill: (color: string | null) =>
    needSel() ? applyShapes(selEls.value.map((i) => ({ op: 'fill', top: ownId(i), color }))) : '请先选中形状',
  shapeLine: (color: string | null) =>
    needSel() ? applyShapes(selEls.value.map((i) => ({ op: 'line', top: ownId(i), color }))) : '请先选中形状',
  shapeLineWidth: (w: number) =>
    needSel() ? applyShapes(selEls.value.map((i) => ({ op: 'line', top: ownId(i), w }))) : '请先选中形状',
  shapeDash: (dash: string) =>
    needSel() ? applyShapes(selEls.value.map((i) => ({ op: 'line', top: ownId(i), dash }))) : '请先选中形状',
  slideBg: (color: string | null) => applyShapes({ op: 'bg', color }),
  /** 修复⑤：文本垂直对齐按顶层 id 定位（不再要求 sid），覆盖 sp / 组内文本形状 /
   *  表格 graphicFrame（内核 anchor 分支写全部 a:tcPr@anchor）；作用于全部选中项 */
  anchor: (a: 't' | 'ctr' | 'b') =>
    needSel() ? applyShapes(selEls.value.map((i) => ({ op: 'anchor', top: ownId(i), anchor: a }))) : '请先选中形状',
  undo: async (redo = false) => {
    const r = (await props.client.call('pptx.undo', redo)) as { index: number; model: SlideModel; meta?: PresentationMeta } | null
    if (!r) return
    // 幻灯片级操作（add/delete/move/hide）的 undo：presentation.xml 变了，先刷新页列表
    if (r.meta) {
      meta.value = r.meta
      invalidateThumbs()
    }
    texEdit.stop()
    adopt(r.model, r.index)
    emit('change')
  },
  /** 修复③：PowerPoint「对齐」恒贴幻灯片边界（多选也一样），不再按外接矩形互相对齐 */
  alignOn: (dir: string) => {
    if (!needSel()) return '请先选中形状'
    const s = slide.value
    if (!s) return
    const ops: ShapeOp[] = selEls.value.map((i) => {
      const box = { ...s.els[i].box }
      if (dir === 'left') box.x = 0
      if (dir === 'center') box.x = (s.w - box.w) / 2
      if (dir === 'right') box.x = s.w - box.w
      if (dir === 'top') box.y = 0
      if (dir === 'middle') box.y = (s.h - box.h) / 2
      if (dir === 'bottom') box.y = s.h - box.h
      return { op: 'xfrm', top: topId(i), box }
    })
    void applyShapes(ops)
  },
  /** 分布：横向/纵向等间距（ribbon「排列」组入口，用多条 xfrm） */
  distribute: (dir: 'h' | 'v') => {
    const s = slide.value
    const ids = [...selEls.value]
    if (!s || ids.length < 3) return emit('error', '请至少选中三个形状')
    const horiz = dir === 'h'
    const sorted = [...ids].sort((a, b) => (horiz ? s.els[a].box.x - s.els[b].box.x : s.els[a].box.y - s.els[b].box.y))
    const first = s.els[sorted[0]].box, last = s.els[sorted[sorted.length - 1]].box
    const start = horiz ? first.x : first.y
    const end = horiz ? last.x + last.w : last.y + last.h
    const total = ids.reduce((n, i) => n + (horiz ? s.els[i].box.w : s.els[i].box.h), 0)
    const gap = (end - start - total) / (sorted.length - 1)
    let cur = start
    const ops: ShapeOp[] = sorted.map((i) => {
      const b = { ...s.els[i].box }
      if (horiz) b.x = cur
      else b.y = cur
      cur += (horiz ? b.w : b.h) + gap
      return { op: 'xfrm', top: topId(i), box: b }
    })
    void applyShapes(ops)
  },
  presentFrom: () => {
    void load(0)
    commands.setView('present')
  },
  /** 重放当前页入场动画（画布按元素顺序触发 CSS 动画） */
  playAnims: () => { playSeq.value++ },
  /** 表格行/列增删（右键菜单入口，作用在最后双击的单元格上） */
  tableRow: (kind: 'add' | 'delete') => {
    if (!needSel()) return emit('error', '请先选中表格')
    const c = cellAnchor()
    void applyShapes({ op: 'tblRow', top: ownId(c.i), kind, at: c.ri })
  },
  tableCol: (kind: 'add' | 'delete') => {
    if (!needSel()) return emit('error', '请先选中表格')
    const c = cellAnchor()
    void applyShapes({ op: 'tblCol', top: ownId(c.i), kind, at: c.ci })
  },
  /** 选中形状的动画（右键菜单；entrance/emphasis/exit 各 preset；null = 移除） */
  shapeAnim: (preset: AnimPreset | null) => {
    if (!needSel()) return emit('error', '请先选中形状')
    void applyShapes({ op: 'anim', top: ownId(selEl.value), preset })
  },
  /** 当前页切换效果（右键菜单下拉；null = 移除） */
  slideTransition: (kind: 'fade' | 'wipe' | 'push' | 'cut' | null) => {
    void applyShapes({ op: 'transition', kind })
  },
  /** 打开当前选中图表的数据编辑面板（右键菜单入口 / canvas 双击共用） */
  chartData: () => (needSel() ? openChartDlg(selEl.value) : '请先选中图表'),
  /** ---------- 修复⑥：字体 / 段落命令（与 DOCX 同一套命令名） ----------
   *  作用于 PptxEditor 的活动编辑选区，格式落到真实 OOXML（a:rPr / a:pPr）。
   *  未进编辑时 return 提示串，走 OfficeToolbar 的 toast。 */
  setFont: (name: string) => (texEdit.editor.active ? (texEdit.editor.setFont(name), undefined) : '请双击文本形状进入编辑后再设置字体'),
  setSize: (pt: number) => (texEdit.editor.active ? (texEdit.editor.setSize(pt), undefined) : '请双击文本形状进入编辑后再设置字号'),
  toggle: (k: 'b' | 'i' | 'u' | 'strike') => (texEdit.editor.active ? (texEdit.editor.toggle(k), undefined) : '请双击文本形状进入编辑'),
  setColor: (c: string | null) => (texEdit.editor.active ? (texEdit.editor.setColor(c), undefined) : '请双击文本形状进入编辑后再设置字体颜色'),
  setHighlight: (c: string | null) => (texEdit.editor.active ? (texEdit.editor.setHighlight(c), undefined) : '请双击文本形状进入编辑后再设置突出显示'),
  sup: () => (texEdit.editor.active ? (texEdit.editor.toggleBaseline('sup'), undefined) : '请双击文本形状进入编辑'),
  sub: () => (texEdit.editor.active ? (texEdit.editor.toggleBaseline('sub'), undefined) : '请双击文本形状进入编辑'),
  setAlign: (a: 'left' | 'center' | 'right' | 'justify') => (texEdit.editor.active ? (texEdit.editor.setAlign(a), undefined) : '请双击文本形状进入编辑后再设置对齐'),
  setLine: (v: number) => (texEdit.editor.active ? (texEdit.editor.setLineSpacing(v), undefined) : '请双击文本形状进入编辑后再设置行距'),
  toggleList: (k: 'bullet' | 'number') => (texEdit.editor.active ? (texEdit.editor.toggleBullet(k), undefined) : '请双击文本形状进入编辑'),
  indent: (d: 1 | -1) => (texEdit.editor.active ? (texEdit.editor.indentLevel(d as 1 | -1), undefined) : '请双击文本形状进入编辑'),
  clearFormat: () => (texEdit.editor.active ? (texEdit.editor.clearFormat(), undefined) : '请双击文本形状进入编辑后再清除格式'),
  setView: (v: string) => {
    texEdit.stop()
    bar.view = v
    if (v === 'present') clearSel() // 放映态只读，进放映即丢形状选中态
    const stage = stageEl.value
    if (v === 'present') void stage?.requestFullscreen?.()
    else if (document.fullscreenElement) void document.exitFullscreen()
    nextTick(() => fit())
  },
  setZoom: (z: number) => {
    bar.zoom = z
    fit()
  },
  fit: () => {
    bar.zoom = 1
    fit()
  },
  slides: () => meta.value.slides,
  current: () => index.value,
  count: () => meta.value.count
}

defineExpose({ commands, bar, formatState: texEdit.format, editor: texEdit.editor, meta, index })

/** PPT 右键菜单：幻灯片级 Office 操作（新建/复制/删除/隐藏/移动）、切换效果，
 *  形状级删除/动画、表格行列增删、SmartArt 提示、图表数据编辑 —— kind 由选中元素类型决定 */
type MenuKind = 'slide' | 'shape' | 'table' | 'dgm' | 'chart'
const pptMenu = ref<{ x: number; y: number; kind: MenuKind } | null>(null)
function openPptMenu(ev: MouseEvent, kind: MenuKind) {
  ev.preventDefault()
  pptMenu.value = {
    x: Math.min(ev.clientX, window.innerWidth - 180),
    y: Math.min(ev.clientY, Math.max(8, window.innerHeight - 360)),
    kind
  }
}
/** 缩略图右键：先切到该页（slide 菜单命令都作用于当前页），再复用同一套 pptMenu 弹菜单。
 *  stopPropagation 防止冒泡到舞台的 contextmenu 处理器又按选中形状类型重开一次。 */
function openThumbMenu(ev: MouseEvent, i: number) {
  ev.preventDefault()
  ev.stopPropagation()
  if (i !== index.value) void load(i)
  openPptMenu(ev, 'slide')
}
function menuKindFor(el: SlideEl | undefined): MenuKind {
  if (!el) return 'slide'
  if (el.t === 'table') return 'table'
  if (el.t === 'smartart') return 'dgm'
  if (el.t === 'chart') return 'chart'
  return 'shape'
}

/** 形状级键盘操作：焦点在 input / textarea / contenteditable 时不拦截 */
function onKey(ev: KeyboardEvent) {
  if (!props.editable || ev.defaultPrevented) return
  // 多个页签常驻 v-show：以组件根为基准（stage 在浏览视图下 display:none，不能当可见性基准）
  if (rootEl.value && rootEl.value.offsetParent === null) return
  const a = document.activeElement as HTMLElement | null
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return
  const mod = ev.ctrlKey || ev.metaKey
  const k = ev.key
  // 放映态只读：Delete/方向键不得真改数据，Esc 退出放映（PowerPoint 语义）
  if (bar.view === 'present') {
    if (k === 'Escape') commands.setView('normal')
    return
  }
  if (mod && (k === 'a' || k === 'A')) {
    ev.preventDefault()
    const n = slide.value?.els.length ?? 0
    selEls.value = Array.from({ length: n }, (_, i) => i)
    selEl.value = n ? n - 1 : -1
    return
  }
  if (mod && (k === 'd' || k === 'D')) { ev.preventDefault(); duplicateSelection(); return }
  // 撤销/重做：内核（undoShapes）与命令面（commands.undo）早已在位，唯独缺键盘绑定——
  // 形状删除/搬移/文本提交全部落了 undo 栈，按键却没人消费它。mac 无 Delete 键，⌘Z/⌘⇧Z 是唯一退路。
  if (mod && (k === 'z' || k === 'Z')) { ev.preventDefault(); void commands.undo(ev.shiftKey); return }
  if (mod && (k === 'y' || k === 'Y')) { ev.preventDefault(); void commands.undo(true); return }
  if (k === 'Escape') { clearSel(); pptMenu.value = null; return }
  if (k === 'Delete' || k === 'Backspace') {
    if (!selEls.value.length) return
    ev.preventDefault()
    deleteSelection()
    return
  }
  const d: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]
  }
  if (d[k] && selEls.value.length) {
    ev.preventDefault()
    const step = ev.shiftKey ? 10 : 1
    nudge(d[k][0] * step, d[k][1] * step)
  }
}

/** 浏览器原生退出全屏（Esc / 系统手势）时同步视图状态，避免卡在放映态 */
const onFullscreenChange = () => {
  if (!document.fullscreenElement && bar.view === 'present') bar.view = 'normal'
}

onMounted(() => {
  ro = new ResizeObserver(fit)
  if (stageEl.value) ro.observe(stageEl.value)
  window.addEventListener('keydown', onKey)
  document.addEventListener('paste', onPaste)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  window.addEventListener('pointermove', onThumbMove)
  window.addEventListener('pointerup', endThumbDrag)
  window.addEventListener('pointercancel', endThumbDrag)
  // 极旧 WebView 无 IntersectionObserver：兜底预取前 12 页
  if (!thumbIo) for (let i = 0; i < Math.min(12, meta.value.count); i++) void ensureThumb(i)
  void load(0)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  thumbIo?.disconnect()
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('paste', onPaste)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  window.removeEventListener('pointermove', onThumbMove)
  window.removeEventListener('pointerup', endThumbDrag)
  window.removeEventListener('pointercancel', endThumbDrag)
  media.dispose()
})
</script>

<template>
  <div ref="rootEl" class="ov-slides" :class="{ 'ov-browse': bar.view === 'browse', 'ov-present': bar.view === 'present' }">
    <div ref="listEl" class="ov-slide-list">
      <button
        v-for="s in thumbList"
        :key="s.index"
        :ref="(el) => observeThumb(el, s.index)"
        v-memo="[s.model, s.hidden, s.index === index, drag.on && drag.from === s.index]"
        class="ov-slide-thumb"
        :class="{ 'ov-slide-on': s.index === index, 'ov-thumb-dragging': drag.on && drag.from === s.index }"
        :data-slide-index="s.index"
        @pointerdown="onThumbDown($event, s.index)"
        @click="onThumbClick(s.index)"
        @contextmenu.prevent="openThumbMenu($event, s.index)"
      >
        <span class="ov-slide-num">{{ s.index + 1 }}<span v-if="s.hidden"> · 隐藏</span></span>
        <span class="ov-slide-thumb-view">
          <OfficeSlideCanvas v-if="s.model" :slide="s.model" auto :media="media" />
          <span v-else class="ov-slide-thumb-empty">加载中…</span>
        </span>
      </button>
      <div v-if="drag.on" class="ov-thumb-drop-line" :style="{ top: dropLineTop + 'px' }"></div>
    </div>
    <div ref="stageEl" class="ov-slide-stage" @click="onStageClick" @contextmenu.stop="openPptMenu($event, menuKindFor(selEl >= 0 ? slide?.els[selEl] : undefined))">
      <OfficeSlideCanvas
        v-if="slide"
        :slide="slide"
        :scale="scale"
        :editable="editable"
        :interactive="bar.view === 'normal'"
        :sel-el="selEl"
        :sel-els="selEls"
        :media="media"
        :play-seq="playSeq"
        :trans-cls="transCls"
        :text-editing="texEdit.editLayer.value"
        @select="onSelect"
        @select-set="onSelectSet"
        @clear="clearSel"
        @transform="onTransform"
        @text-edit="onTextEdit"
        @text-mount="(el) => texEdit.mount(el)"
        @text-blur="texEdit.stop"
        @text-key="onTextKey"
        @cell-edit="onCellEdit"
        @commit-cell="commitCell"
        @commit-dgm="commitDgm"
        @chart-edit="openChartDlg($event.i)"
      />
      <!-- 视图内入口：母版 / 主题 / 版式编辑侧面板（不占用 ribbon） -->
      <button
        v-if="editable && slide?.theme && bar.view === 'normal'"
        class="ov-theme-toggle"
        type="button"
        @click.stop="showTheme = !showTheme"
      >{{ showTheme ? '收起主题' : '母版 / 主题' }}</button>
      <OfficeSlideThemePanel
        v-if="showTheme && slide?.theme"
        :theme="slide.theme"
        :editable="editable"
        @apply="applyThemeOp"
        @close="showTheme = false"
      />
      <!-- 入场动画播放（页内有动画时出现） -->
      <button
        v-if="hasAnims && bar.view === 'normal'"
        class="ov-anim-play"
        type="button"
        title="按顺序播放本页入场动画"
        @click.stop="commands.playAnims()"
      >播放动画</button>
      <!-- 演讲者备注：舞台底部可折叠面板（自绘控件；无备注时可直接输入新增） -->
      <template v-if="bar.view === 'normal'">
        <button
          class="ov-notes-toggle"
          type="button"
          @click.stop="showNotes = !showNotes"
        >{{ showNotes ? '收起备注' : '备注' }}</button>
        <div v-if="showNotes" class="ov-notes-panel">
          <div class="ov-notes-title">演讲者备注</div>
          <div
            :key="index"
            class="ov-notes-edit"
            :contenteditable="editable ? 'true' : 'false'"
            spellcheck="false"
            :data-empty="notesText ? 'false' : 'true'"
            @blur="commitNotes(($event.currentTarget as HTMLElement).innerText.replace(/\r/g, ''))"
            @keydown.enter.stop
          >{{ notesText }}</div>
        </div>
      </template>
    </div>
    <OfficeChartDataDialog
      :open="chartDlg.open"
      :data="chartDlg.data"
      @apply="commitChart"
      @cancel="chartDlg.open = false"
    />
    <div v-if="pptMenu" class="ov-ctx-overlay" @click="pptMenu = null" @contextmenu.prevent="pptMenu = null">
      <div class="ov-ctx" :style="{ left: pptMenu.x + 'px', top: pptMenu.y + 'px' }">
        <template v-if="pptMenu.kind === 'table' && editable">
          <button class="ov-ctx-item" @click="pptMenu = null; commands.tableRow('add')">在下方插入行</button>
          <button class="ov-ctx-item" @click="pptMenu = null; commands.tableRow('delete')">删除当前行</button>
          <button class="ov-ctx-item" @click="pptMenu = null; commands.tableCol('add')">在右侧插入列</button>
          <button class="ov-ctx-item" @click="pptMenu = null; commands.tableCol('delete')">删除当前列</button>
          <div class="ov-ctx-sep"></div>
          <button class="ov-ctx-item" @click="pptMenu = null; commands.deleteShape()">删除表格</button>
        </template>
        <template v-else-if="pptMenu.kind === 'dgm' && editable">
          <div class="ov-ctx-item ov-ctx-hint">双击 SmartArt 节点即可编辑文字</div>
        </template>
        <template v-else-if="pptMenu.kind === 'chart' && editable">
          <button class="ov-ctx-item" @click="pptMenu = null; commands.chartData()">编辑图表数据…</button>
          <div class="ov-ctx-sep"></div>
          <button class="ov-ctx-item" @click="pptMenu = null; commands.deleteShape()">删除图表</button>
        </template>
        <template v-else-if="pptMenu.kind === 'shape' && editable">
          <button class="ov-ctx-item" @click="pptMenu = null; commands.deleteShape()">删除形状</button>
          <div class="ov-ctx-sep"></div>
          <div class="ov-ctx-item ov-ctx-hint">出现（entrance）</div>
          <button class="ov-ctx-item" @click="pptMenu = null; commands.shapeAnim('appear')">出现</button>
          <button class="ov-ctx-item" @click="pptMenu = null; commands.shapeAnim('fade')">淡入</button>
          <button class="ov-ctx-item" @click="pptMenu = null; commands.shapeAnim('wipe')">擦除</button>
          <div class="ov-ctx-item ov-ctx-hint">强调（emphasis）</div>
          <button class="ov-ctx-item" @click="pptMenu = null; commands.shapeAnim('spin')">旋转</button>
          <button class="ov-ctx-item" @click="pptMenu = null; commands.shapeAnim('growShrink')">放大/缩小</button>
          <div class="ov-ctx-item ov-ctx-hint">退出（exit）</div>
          <button class="ov-ctx-item" @click="pptMenu = null; commands.shapeAnim('disappear')">消失</button>
          <button class="ov-ctx-item" @click="pptMenu = null; commands.shapeAnim('fadeOut')">淡出</button>
          <div class="ov-ctx-sep"></div>
          <button class="ov-ctx-item" @click="pptMenu = null; commands.shapeAnim(null)">移除动画</button>
        </template>
        <template v-else>
          <button class="ov-ctx-item" @click.stop="pptMenu = null; commands.addSlide('blank')">新建幻灯片</button>
          <button class="ov-ctx-item" @click.stop="pptMenu = null; commands.duplicate()">复制幻灯片</button>
          <button class="ov-ctx-item" @click.stop="pptMenu = null; commands.deleteSlide()">删除幻灯片</button>
          <div class="ov-ctx-sep"></div>
          <button class="ov-ctx-item" @click.stop="pptMenu = null; commands.hidden(!bar.hidden)">{{ bar.hidden ? '取消隐藏' : '隐藏幻灯片' }}</button>
          <button class="ov-ctx-item" @click.stop="pptMenu = null; commands.moveSlide(-1)">上移</button>
          <button class="ov-ctx-item" @click.stop="pptMenu = null; commands.moveSlide(1)">下移</button>
          <button class="ov-ctx-item" @click.stop="pptMenu = null; commands.presentFrom()">从头放映</button>
          <template v-if="editable">
            <div class="ov-ctx-sep"></div>
            <div class="ov-ctx-item ov-ctx-hint">切换效果</div>
            <button class="ov-ctx-item" @click.stop="pptMenu = null; commands.slideTransition('fade')">淡入</button>
            <button class="ov-ctx-item" @click.stop="pptMenu = null; commands.slideTransition('wipe')">擦除</button>
            <button class="ov-ctx-item" @click.stop="pptMenu = null; commands.slideTransition('push')">推入</button>
            <button class="ov-ctx-item" @click.stop="pptMenu = null; commands.slideTransition('cut')">切入</button>
            <button class="ov-ctx-item" @click.stop="pptMenu = null; commands.slideTransition(null)">移除切换</button>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<style src="../office-views.css"></style>
<style src="../office-shape.css"></style>
