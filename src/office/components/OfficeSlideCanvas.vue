<script setup lang="ts">
/**
 * PPT 幻灯片画布：主舞台与缩略图共用同一套形状渲染。
 * auto 模式按容器宽度缩放（缩略图）；舞台模式由父组件传入 scale。
 * 文本 / 几何口径对齐内核解析结果（bodyPr、geomPath），避免色块与文字叠压。
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { SlideModel, SlideEl, TextBody, TPara, TRun } from '../client'
import type { Fill, Stroke, Box, TCell, SmartArtNode } from '../core/pptx/types'
import type { MediaCache } from '../media'
import { geomPath, LINE_GEOMS } from '../view/pptx/geometry'
import { chartGeometry, type ChartPrim } from '../view/pptx/chart'
import { safeHref } from '../core/url'

const props = defineProps<{
  slide: SlideModel
  scale?: number
  auto?: boolean
  editable?: boolean
  interactive?: boolean
  selEl?: number
  selEls?: number[]
  media?: MediaCache
  /** 播放动画的触发序号：父组件自增即重放当前页动画 */
  playSeq?: number
  /** 演示模式进入当前页时的切换效果类（ov-trans-fade 等） */
  transCls?: string
  /** 形状文本编辑态（PptxEditor 驱动）：i = 编辑中的形状索引，html = 带
   *  data-pa/data-o 光标契约的编辑层初帧；null = 无编辑。画布只管渲染与上报，
   *  编辑生命周期（begin/attach/commit）在父组件 composables/usePptxTextEdit */
  textEditing?: { i: number; html: string } | null
}>()
const emit = defineEmits<{
  (e: 'select', i: number, additive: boolean): void
  (e: 'selectSet', ids: number[]): void
  (e: 'clear'): void
  (e: 'transform', changes: { i: number; box: Box }[]): void
  (e: 'textEdit', i: number): void
  (e: 'textMount', el: HTMLElement | null): void
  (e: 'textBlur'): void
  (e: 'textKey', ev: KeyboardEvent): void
  (e: 'cellEdit', p: { i: number; ri: number; ci: number }): void
  (e: 'commitCell', p: { i: number; ri: number; ci: number; lines: string[] }): void
  (e: 'commitDgm', p: { i: number; nodeId: string; lines: string[] }): void
  (e: 'chartEdit', p: { i: number }): void
}>()

const live = computed(() => props.interactive !== false)
const wrapEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLElement | null>(null)
const autoScale = ref(0.1)
let ro: ResizeObserver | null = null

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** 内核已把字体、颜色解析成 CSS 值；baseline 是千分比偏移，上下标按 65% 字号 */
function runCss(r: TRun): string {
  const out = [r.baseline ? `font-size:${(r.sz * 0.65).toFixed(2)}pt` : `font-size:${r.sz}pt`]
  if (r.baseline) out.push(`vertical-align:${r.baseline > 0 ? 'super' : 'sub'}`)
  if (r.b) out.push('font-weight:700')
  if (r.i) out.push('font-style:italic')
  const deco = [r.u ? 'underline' : '', r.strike ? 'line-through' : ''].filter(Boolean).join(' ')
  if (deco) out.push(`text-decoration:${deco}`)
  if (r.color) out.push(`color:${r.color}`)
  if (r.font) out.push(`font-family:${r.font}`)
  if (r.caps) out.push('text-transform:uppercase')
  if (r.hl) out.push(`background:${r.hl}`)
  return out.join(';')
}

/** edit=true：编辑层同构渲染——去装饰（项目符号不属于文本、超链接扁平为 span 让点击落光标） */
function paraHtml(p: TPara, edit = false): string {
  const style = [`text-align:${p.algn}`]
  if (p.marL) style.push(`padding-left:${p.marL}px`)
  if (p.indent) style.push(`text-indent:${p.indent}px`)
  if (p.spcBef) style.push(`padding-top:${p.spcBef}px`)
  if (p.spcAft) style.push(`padding-bottom:${p.spcAft}px`)
  // lnPct 已是倍数（1 = 100%），乘 1.2 得到实际行距；未指定时 PowerPoint 默认 1.2
  style.push(`line-height:${p.lnPx ? p.lnPx + 'px' : p.lnPct ? +(p.lnPct * 1.2).toFixed(3) : 1.2}`)
  if (!p.runs.length || p.runs.every((r) => !r.text && !r.br)) style.push(`font-size:${p.endSz}pt`)

  const hang = p.indent < 0 ? -p.indent : 0
  const bullet = !edit && p.bullet
    ? `<span class="ov-slide-bul" style="min-width:${hang || 0}px;padding-right:${hang ? 0 : 0.4}em;font-size:${p.bullet.sz}pt;${p.bullet.color ? `color:${p.bullet.color};` : ''}${p.bullet.font ? `font-family:${p.bullet.font};` : ''}">${esc(p.bullet.text)}</span>`
    : ''
  const runs = p.runs
    .map((r) => {
      if (r.br) return '<br>'
      const href = edit ? undefined : safeHref(r.href)
      const span = `<span style="${runCss(r)}">${esc(r.text)}</span>`
      return href ? `<a href="${esc(href)}" target="_blank" rel="noreferrer noopener" style="color:inherit">${span}</a>` : span
    })
    .join('')
  return `<div class="ov-slide-para" style="${style.join(';')}">${bullet}${runs || '&#8203;'}</div>`
}

function bodyHtml(body: TextBody, edit = false): string {
  if (body.empty) return ''
  // 必须显式传 edit：map 会把下标当第二实参喂给 paraHtml（非零下标会被误判为编辑层）
  return body.paras.map((p) => paraHtml(p, edit)).join('')
}

/** bodyPr：内边距、垂直锚点、竖排。静态布局在 office-views.css，这里只给动态值 */
function textBoxStyle(body: TextBody): Record<string, string> {
  const [l, t, r, b] = body.ins
  const out: Record<string, string> = {
    padding: `${t}px ${r}px ${b}px ${l}px`,
    justifyContent: body.anchor === 'ctr' ? 'center' : body.anchor === 'b' ? 'flex-end' : 'flex-start',
  }
  if (body.vert) {
    out.writingMode = body.vert === 'vert270' ? 'sideways-lr' : 'vertical-rl'
    out.flexDirection = 'row'
  }
  return out
}

/** 形状几何：非矩形走 SVG path，否则用背景色块；与内核 geomPath 口径一致 */
function isRect(el: Extract<SlideEl, { t: 'shape' }>): boolean {
  return !LINE_GEOMS.has(el.geom) && !el.path && (el.geom === 'rect' || el.geom === 'flowChartProcess')
}
function shapePath(el: Extract<SlideEl, { t: 'shape' }>, b: Box): string {
  return el.path ?? geomPath(el.geom, Math.max(b.w, 1), Math.max(b.h, 1), el.adj as Record<string, number>)
}

/** ---------- 表格单元格就地编辑（自绘 contenteditable，不用原生 input） ---------- */
interface CellRef { i: number; ri: number; ci: number; html: string }
const cellEdit = ref<CellRef | null>(null)
const dgmEdit = ref<{ i: number; nodeId: string } | null>(null)
/** 形状文本编辑态由父组件的 PptxEditor 驱动（props.textEditing）：画布只渲染
 *  编辑层（带 data-pa/data-o 契约的 html 由 usePptxTextEdit 生成并随编辑重建），
 *  编辑元素挂载后经 textMount 上报，让父组件把 RichInput 挂到真实 DOM 上。 */
function onTextRef(node: unknown) {
  emit('textMount', (node as HTMLElement | null) ?? null)
}

function startCellEdit(i: number, ri: number, ci: number, body?: TextBody) {
  if (!live.value || !props.editable) return
  cellEdit.value = { i, ri, ci, html: body ? bodyHtml(body, true) : '' }
  emit('cellEdit', { i, ri, ci })
}
function cancelCellEdit() { cellEdit.value = null }
function cancelDgmEdit() { dgmEdit.value = null }
function commitCell(i: number, ri: number, ci: number, ev: Event) {
  const lines = editLines(ev.currentTarget as HTMLElement)
  cellEdit.value = null
  emit('commitCell', { i, ri, ci, lines })
}
/** 提交前清洗编辑层文本：空段占位的 ZWSP 剥离；浏览器换行容器（div/p）折算为 \n。
 *  innerText 已对块级子元素产生换行，这里只兜底 textContent 路径与 ZWSP。 */
function editLines(root: HTMLElement): string[] {
  return (root.innerText || '').replace(/\u200B/g, '').replace(/\r/g, '').split('\n')
}
/** contenteditable 自动聚焦（ref 回调在挂载后触发） */
function focusEl(node: unknown) {
  const el = node as HTMLElement | null
  if (el && document.activeElement !== el) el.focus()
}
function onEditKey(ev: KeyboardEvent, cancel: () => void) {
  // Esc 取消编辑；Enter/Shift+Enter 由 contenteditable 自己产生换行
  if (ev.key === 'Escape') { ev.preventDefault(); cancel() }
}

/** ---------- 形状文本就地编辑：双击进入（父组件 PptxEditor 接管）、
 *  单击选中、拖动搬移三者互不冲突 ---------- */
function startTextEdit(i: number, el: Extract<SlideEl, { t: 'shape' }>) {
  if (!canEdit(el)) return
  emit('textEdit', i)
}

/** ---------- SmartArt 节点就地编辑 ---------- */
function startDgmEdit(i: number, n: SmartArtNode) {
  if (!live.value || !props.editable) return
  dgmEdit.value = { i, nodeId: n.id }
  emit('cellEdit', { i, ri: -1, ci: -1 })
}
function commitDgmEdit(i: number, nodeId: string, ev: Event) {
  const lines = ((ev.currentTarget as HTMLElement).innerText || '').replace(/\r/g, '').split('\n')
  dgmEdit.value = null
  emit('commitDgm', { i, nodeId, lines })
}
/** ---------- 原生图表：双击打开数据编辑面板 ---------- */
function startChartEdit(i: number) {
  if (!live.value || !props.editable) return
  emit('chartEdit', { i })
}
/** 图表图元（box 局部坐标）；类型未识别时返回空数组，视图显示占位标签 */
function chartPrims(el: Extract<SlideEl, { t: 'chart' }>): ChartPrim[] {
  return chartGeometry(el.data, el.box)
}
/** SmartArt 连线：父节点底边中心 → 子节点顶边中心（相对容器坐标） */
function dgmLines(el: Extract<SlideEl, { t: 'smartart' }>): { x1: number; y1: number; x2: number; y2: number }[] {
  const at = new Map(el.nodes.map((n) => [n.id, n]))
  const out: { x1: number; y1: number; x2: number; y2: number }[] = []
  for (const [pid, cid] of el.links) {
    const p = at.get(pid), c = at.get(cid)
    if (!p || !c) continue
    out.push({
      x1: p.x + p.w / 2 - el.box.x, y1: p.y + p.h - el.box.y,
      x2: c.x + c.w / 2 - el.box.x, y2: c.y - el.box.y,
    })
  }
  return out
}

/** ---------- 动画播放（CSS，按 p:timing mainSeq 的 clickEffect 顺序逐个触发） ---------- */
const animState = ref<{ wait: number[]; run: { i: number; preset: string }[] } | null>(null)
let animToken = 0
/** 播放序列：优先用 SlideModel.animSeq（spid→顺序，解析自 mainSeq clickEffect），按 spid 映射到元素索引；
 *  旧模型 / stub（无 animSeq）回退按元素数组顺序（兼容 v32 等回归）。
 *  时序 = PowerPoint click 序列的自动模拟：每个 clickEffect 一次点击——点击时刻 = cursor，
 *  效果起点 = 点击 + delay（delay 相对本 click 组起点；indefinite = 等点击本身，记 0），
 *  终点 = 起点 + dur，下一次点击落在上一效果终点。dur/delay 缺省走 650ms 固定步长
 *  （= 旧行为基线，v32 回归零漂移）；封顶 8s 防异常长值挂死播放。 */
interface AnimStep { i: number; preset: string; t: number; end: number }
const DEFAULT_EFFECT_MS = 650
const MAX_EFFECT_MS = 8000
/** 有限值取毫秒（indefinite=Infinity / 缺省 → 0） */
const delayMs = (v: number | undefined): number => (v !== undefined && Number.isFinite(v) ? Math.min(v, MAX_EFFECT_MS) : 0)
function playList(): AnimStep[] {
  const s = props.slide
  const out: AnimStep[] = []
  const seq = s.animSeq
  if (seq && seq.length) {
    let cursor = 0
    for (const e of seq) {
      const start = cursor + delayMs(e.delay)
      const dur = e.dur !== undefined && Number.isFinite(e.dur) ? Math.min(e.dur, MAX_EFFECT_MS) : DEFAULT_EFFECT_MS
      const i = s.els.findIndex((el) => el.top === e.spid)
      if (i >= 0) out.push({ i, preset: e.preset, t: start, end: start + dur })
      cursor = start + dur
    }
    return out
  }
  let t = 0
  s.els.forEach((el, i) => {
    if (!el.anim) return
    out.push({ i, preset: el.anim, t, end: t + DEFAULT_EFFECT_MS })
    t += DEFAULT_EFFECT_MS
  })
  return out
}
watch(() => props.playSeq, () => {
  const list = playList()
  if (!list.length) return
  const token = ++animToken
  // wait 用去重后的元素索引；同元素多效果时只在第一次触发前隐藏
  const uniq = [...new Set(list.map((a) => a.i))]
  animState.value = { wait: uniq, run: [] }
  const lastEnd = Math.max(...list.map((a) => a.end))
  list.forEach((a) => {
    setTimeout(() => {
      if (token !== animToken) return
      const st = animState.value
      if (!st) return
      animState.value = { wait: st.wait.filter((w) => w !== a.i), run: [...st.run, { i: a.i, preset: a.preset }] }
    }, a.t)
  })
  setTimeout(() => { if (token === animToken) animState.value = null }, lastEnd + 150)
})
/** 元素类：动画等待隐藏 / 播放中套对应 keyframes（同元素多效果取最后触发的一个） */
function animClass(i: number): Record<string, boolean> {
  const st = animState.value
  if (!st) return {}
  if (st.wait.includes(i)) return { 'ov-anim-wait': true }
  let preset: string | undefined
  for (let k = st.run.length - 1; k >= 0; k--) if (st.run[k].i === i) { preset = st.run[k].preset; break }
  return preset ? { [`ov-anim-${preset}`]: true } : {}
}
function shapeSolid(el: Extract<SlideEl, { t: 'shape' }>): string | undefined {
  return !LINE_GEOMS.has(el.geom) && el.fill?.t === 'solid' ? el.fill.c : undefined
}
function shapeGrad(el: Extract<SlideEl, { t: 'shape' }>): string | undefined {
  return !LINE_GEOMS.has(el.geom) && el.fill?.t === 'grad' ? el.fill.css : undefined
}
function shapeFlip(b: Box): string | undefined {
  if (!b.flipH && !b.flipV) return undefined
  return `translate(${b.flipH ? b.w : 0} ${b.flipV ? b.h : 0}) scale(${b.flipH ? -1 : 1} ${b.flipV ? -1 : 1})`
}
function shapeStyle(b: Box): Record<string, string> {
  return {
    left: b.x + 'px',
    top: b.y + 'px',
    width: b.w + 'px',
    height: b.h + 'px',
    ...(b.rot ? { transform: `rotate(${b.rot}deg)` } : {})
  }
}

function picStyle(el: Extract<SlideEl, { t: 'pic' }>, b: Box = el.box): Record<string, string> {
  const out = shapeStyle(b)
  if (el.geom === 'ellipse') out.borderRadius = '50%'
  else if (el.geom === 'roundRect') out.borderRadius = Math.min(b.w, b.h) * 0.1667 + 'px'
  if (el.stroke) out.outline = `${el.stroke.w}px solid ${el.stroke.c}`
  if (b.flipH || b.flipV) out.transform = `scale(${b.flipH ? -1 : 1}, ${b.flipV ? -1 : 1})`
  return out
}

/** 图片裁剪：按原始比例放大并负偏移，保证裁掉的边距与 OOXML srcRect 一致 */
function picImgStyle(el: Extract<SlideEl, { t: 'pic' }>): Record<string, string> {
  const b = el.box
  if (!el.crop) return { width: '100%', height: '100%' }
  const [l, t, r, bo] = el.crop
  const sw = b.w / Math.max(0.01, 1 - l - r)
  const sh = b.h / Math.max(0.01, 1 - t - bo)
  return { left: -l * sw + 'px', top: -t * sh + 'px', width: sw + 'px', height: sh + 'px' }
}

/** 表格单元格四边框来自 tcPr，不能只画一条 */
function cellStyle(c: TCell, h: number): Record<string, string> {
  const bd = (s?: Stroke) => (s ? `${Math.max(1, s.w)}px solid ${s.c}` : undefined)
  const out: Record<string, string> = { height: h + 'px' }
  const bl = bd(c.bl), br = bd(c.br), bt = bd(c.bt), bb = bd(c.bb)
  if (bl) out.borderLeft = bl
  if (br) out.borderRight = br
  if (bt) out.borderTop = bt
  if (bb) out.borderBottom = bb
  if (c.fill?.t === 'solid') out.background = c.fill.c
  else if (c.fill?.t === 'grad') out.background = c.fill.css
  return out
}

const els = computed(() => props.slide.els ?? [])
const effScale = computed(() => (props.auto ? autoScale.value : (props.scale ?? 1)))
/** 外层占缩放后尺寸供 flex 居中；缩略图用 aspect-ratio 让容器宽度决定高度 */
const wrapStyle = computed(() =>
  props.auto
    ? { aspectRatio: `${props.slide.w} / ${props.slide.h}` }
    : { width: props.slide.w * effScale.value + 'px', height: props.slide.h * effScale.value + 'px' }
)
const canvasStyle = computed(() => ({
  width: props.slide.w + 'px',
  height: props.slide.h + 'px',
  transform: `scale(${effScale.value})`,
  ...(props.slide.bg?.t === 'solid'
    ? { background: props.slide.bg.c }
    : props.slide.bg?.t === 'grad'
      ? { background: props.slide.bg.css }
      : {})
}))

/** 隐藏态宽度为 0 时跳过，显示后 ResizeObserver 会重算 */
function measure() {
  const el = wrapEl.value
  if (!props.auto || !el || el.clientWidth < 20) return
  autoScale.value = el.clientWidth / props.slide.w
}

async function hydrate() {
  await nextTick()
  if (canvasEl.value && props.media) void props.media.hydrate(canvasEl.value)
}

function canEdit(el: Extract<SlideEl, { t: 'shape' }>): boolean {
  return live.value && !!props.editable && !!el.text
}

/** ---------- 形状级交互：拖动 / 缩放手柄 ---------- */
interface DragState {
  kind: 'move' | 'resize' | 'rotate'
  handle: string
  ids: number[]
  base: Box[]
  baseRect: Box
  dx: number
  dy: number
  /** 旋转增量（度），仅 kind === 'rotate' 有效 */
  angle: number
  /** 是否按住 Shift：把最终角度吸附到 15° 的绝对倍数（Office 行为） */
  snap: boolean
}
interface Pending extends Omit<DragState, 'dx' | 'dy' | 'angle' | 'snap'> {
  sx: number
  sy: number
  /** 旋转中心（屏幕坐标）与起始指针角，仅 rotate 使用 */
  centerClientX: number
  centerClientY: number
  startAngle: number
}
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const interactive = computed(() => live.value && !!props.editable)
const selected = computed(() => (props.selEls ?? []).filter((i) => i >= 0 && i < props.slide.els.length))

function bounding(boxes: Box[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const b of boxes) {
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** 拖手柄后的外接矩形：w/h 至少 8px，x/y 不为负 */
function resizeRect(d: DragState): Box {
  const R = d.baseRect
  let x0 = R.x, y0 = R.y, x1 = R.x + R.w, y1 = R.y + R.h
  if (d.handle.includes('w')) x0 = R.x + d.dx
  if (d.handle.includes('e')) x1 = R.x + R.w + d.dx
  if (d.handle.includes('n')) y0 = R.y + d.dy
  if (d.handle.includes('s')) y1 = R.y + R.h + d.dy
  x0 = Math.max(0, Math.min(x0, x1 - 8))
  y0 = Math.max(0, Math.min(y0, y1 - 8))
  x1 = Math.max(x1, x0 + 8)
  y1 = Math.max(y1, y0 + 8)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** 由拖动态算出每个选中形状最终写回内核的 box（单/多选统一按外接矩形成比例缩放） */
function computeChanges(d: DragState): { i: number; box: Box }[] {
  if (d.kind === 'move') {
    return d.ids.map((i, k) => ({ i, box: { ...d.base[k], x: d.base[k].x + d.dx, y: d.base[k].y + d.dy } }))
  }
  if (d.kind === 'rotate') {
    // 单选形状绕自身中心旋转：x/y 不变，只改 rot（归一化到 [0,360)）；0 时去掉 rot 属性。
    // 多选：绕外接矩形公共中心整体旋转 —— 各形状 rot += Δ，且中心点绕公共中心旋转（Office 行为）。
    // 按住 Shift 吸附到 15° 的倍数（单选按绝对角度吸附，多选按增量吸附）。
    if (d.ids.length === 1) {
      const b = d.base[0]
      let next = (b.rot ?? 0) + d.angle
      if (d.snap) next = Math.round(next / 15) * 15
      const rot = (((next % 360) + 360) % 360)
      return [{ i: d.ids[0], box: { ...b, rot: rot < 0.0001 ? undefined : rot } }]
    }
    const ang = d.snap ? Math.round(d.angle / 15) * 15 : d.angle
    const C = { x: d.baseRect.x + d.baseRect.w / 2, y: d.baseRect.y + d.baseRect.h / 2 }
    const rad = (ang * Math.PI) / 180
    const cos = Math.cos(rad), sin = Math.sin(rad)
    return d.ids.map((i, k) => {
      const b = d.base[k]
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2
      const nx = C.x + (cx - C.x) * cos - (cy - C.y) * sin
      const ny = C.y + (cx - C.x) * sin + (cy - C.y) * cos
      const rot = (((((b.rot ?? 0) + ang) % 360) + 360) % 360)
      return { i, box: { ...b, x: nx - b.w / 2, y: ny - b.h / 2, rot: rot < 0.0001 ? undefined : rot } }
    })
  }
  const R = d.baseRect, R2 = resizeRect(d)
  const sx = R2.w / Math.max(R.w, 1), sy = R2.h / Math.max(R.h, 1)
  return d.ids.map((i, k) => {
    const b = d.base[k]
    return { i, box: {
      ...b,
      x: R2.x + (b.x - R.x) * sx,
      y: R2.y + (b.y - R.y) * sy,
      w: Math.max(8, b.w * sx),
      h: Math.max(8, b.h * sy)
    } }
  })
}

const drag = ref<DragState | null>(null)
const preview = computed(() => {
  const m = new Map<number, Box>()
  if (!drag.value) return m
  for (const c of computeChanges(drag.value)) m.set(c.i, c.box)
  return m
})
/** 视觉 box：拖动/缩放期间用预览，否则用模型 box */
const effBox = (i: number): Box => preview.value.get(i) ?? props.slide.els[i].box
const uiRect = computed<Box | null>(() => selected.value.length ? bounding(selected.value.map(effBox)) : null)
/** 手柄尺寸/线宽按画布缩放反向补偿，保证视觉恒定 */
const uiStyle = computed(() => ({
  '--ov-shape-h': 8 / effScale.value + 'px',
  '--ov-shape-b': 1 / effScale.value + 'px'
}))
const frameStyle = (b: Box) => ({ left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' })
/** 单选时选中框（含 8 手柄与旋转手柄）随形状一起旋转；多选外接矩形不旋转 */
const uiRot = computed(() => (selected.value.length === 1 ? (effBox(selected.value[0]).rot ?? 0) : 0))
const mainFrameStyle = (b: Box) => ({
  ...frameStyle(b),
  ...(uiRot.value ? { transform: `rotate(${uiRot.value}deg)` } : {}),
})

/** 形状本体预览：移动用 transform translate；缩放按预览 box 重定位（SVG 路径同步跟随）；
 *  旋转时 effBox(i).rot 已是预览角度，shapeStyle 直接据此旋转。 */
function elStyle(el: SlideEl, i: number): Record<string, string> {
  const b = effBox(i)
  const base = el.t === 'pic' ? picStyle(el, b) : shapeStyle(b)
  const d = drag.value
  const pv = preview.value.get(i)
  if (!d || !pv || !d.ids.includes(i)) return base
  if (d.kind === 'move') {
    return { ...base, transform: `translate(${d.dx}px, ${d.dy}px) ${base.transform ?? ''}`.trim() }
  }
  if (d.kind === 'rotate') return base
  return { ...base, left: pv.x + 'px', top: pv.y + 'px', width: pv.w + 'px', height: pv.h + 'px' }
}

let pending: Pending | null = null
let active = false
/** 松手后等内核新 model 接管再撤预览，避免跳回旧位置 */
let holdPreview = false
let holdSeq = 0

/** ---------- 框选矩形（marquee select） ---------- */
interface Marquee { x: number; y: number; w: number; h: number }
const marquee = ref<Marquee | null>(null)
let marqueeStart: { x: number; y: number } | null = null

/** 指针屏幕坐标 → 画布坐标（消除 scale 缩放） */
function clientToCanvas(ev: PointerEvent): { x: number; y: number } {
  const rect = canvasEl.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return { x: (ev.clientX - rect.left) / effScale.value, y: (ev.clientY - rect.top) / effScale.value }
}

/** 两外接矩形是否相交（含边接触），用于框选套选与命中判定 */
function boxesIntersect(a: Box, b: Box): boolean {
  return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h)
}

/** 框选松开后：返回与选框相交的所有形状索引（含 pic/table/placeholder） */
function marqueeSelection(rect: Marquee): number[] {
  const ids: number[] = []
  const els = props.slide.els ?? []
  for (let i = 0; i < els.length; i++) if (boxesIntersect(els[i].box, rect)) ids.push(i)
  return ids
}

/** ---------- 对齐吸附线（alignment guides） ---------- */
interface Guide { axis: 'v' | 'h'; pos: number }
const guides = ref<Guide[]>([])

/** 搬移时对齐：把选中形状外接矩形的左/中/右/上/中/下，与「其它形状对应边/中心」或
 *  「画布边/中心」比较；差异 ≤ 阈值则吸附，并产出对应参考线。
 *  阈值按屏幕 px 换算到画布坐标（6px / scale），保证任意缩放下手感一致。 */
function computeAlign(ids: number[], dx: number, dy: number, baseRect: Box): { dx: number; dy: number; guides: Guide[] } {
  const s = props.slide
  const tol = 6 / effScale.value
  const mLeft = baseRect.x + dx
  const mCx = baseRect.x + baseRect.w / 2 + dx
  const mRight = baseRect.x + baseRect.w + dx
  const mTop = baseRect.y + dy
  const mCy = baseRect.y + baseRect.h / 2 + dy
  const mBottom = baseRect.y + baseRect.h + dy
  // 候选参考线：始终含画布边/中心；再并入其它形状对应边/中心
  const tx: number[] = [0, s.w / 2, s.w]
  const ty: number[] = [0, s.h / 2, s.h]
  for (let i = 0; i < s.els.length; i++) {
    if (ids.includes(i)) continue
    const b = s.els[i].box
    tx.push(b.x, b.x + b.w / 2, b.x + b.w)
    ty.push(b.y, b.y + b.h / 2, b.y + b.h)
  }
  const g: Guide[] = []
  // 横向吸附：取「移动参考线 - 目标线」差最小的组合
  let bestX = { d: Infinity, target: 0 }
  for (const ref of [mLeft, mCx, mRight]) {
    for (const t of tx) {
      const d = ref - t
      if (Math.abs(d) <= tol && Math.abs(d) < Math.abs(bestX.d)) bestX = { d, target: t }
    }
  }
  let ndx = dx
  if (Math.abs(bestX.d) <= tol) { ndx = dx - bestX.d; g.push({ axis: 'v', pos: bestX.target }) }
  // 纵向吸附
  let bestY = { d: Infinity, target: 0 }
  for (const ref of [mTop, mCy, mBottom]) {
    for (const t of ty) {
      const d = ref - t
      if (Math.abs(d) <= tol && Math.abs(d) < Math.abs(bestY.d)) bestY = { d, target: t }
    }
  }
  let ndy = dy
  if (Math.abs(bestY.d) <= tol) { ndy = dy - bestY.d; g.push({ axis: 'h', pos: bestY.target }) }
  return { dx: ndx, dy: ndy, guides: g }
}

function startPending(kind: 'move' | 'resize', handle: string, ids: number[], ev: PointerEvent) {
  holdPreview = false
  drag.value = null
  guides.value = []
  const base = ids.map((k) => ({ ...props.slide.els[k].box }))
  pending = { kind, handle, ids, base, baseRect: bounding(base), sx: ev.clientX, sy: ev.clientY, centerClientX: 0, centerClientY: 0, startAngle: 0 }
}

/** 旋转手柄按下：记录形状中心（屏幕坐标）与起始指针角，拖动时按角差旋转 */
function startRotatePending(ids: number[], ev: PointerEvent) {
  holdPreview = false
  drag.value = null
  const base = ids.map((k) => ({ ...props.slide.els[k].box }))
  const rect = canvasEl.value?.getBoundingClientRect()
  const R = bounding(base)
  const centerClientX = rect ? rect.left + (R.x + R.w / 2) * effScale.value : ev.clientX
  const centerClientY = rect ? rect.top + (R.y + R.h / 2) * effScale.value : ev.clientY
  const startAngle = Math.atan2(ev.clientY - centerClientY, ev.clientX - centerClientX) * 180 / Math.PI
  pending = { kind: 'rotate', handle: '', ids, base, baseRect: R, sx: ev.clientX, sy: ev.clientY, centerClientX, centerClientY, startAngle }
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
function onElDown(i: number, ev: PointerEvent) {
  if (!interactive.value || ev.button !== 0) return
  // mac 上 Ctrl+click 是系统右键：整体交给 contextmenu，不改选择、不启动拖动
  if (isMac && ev.ctrlKey && !ev.metaKey) return
  // 编辑态内只处理选字（edit div 已 .stop 吞掉 pointerdown，这里是兜底），不启动拖动；
  // 非编辑态统一走形状 move —— 文字层已 pointer-events:none，不会抢走手势。
  if (props.textEditing?.i === i) return
  // mac 上 Ctrl+click 是系统右键：加选只认 ⌘ / Shift，避免与右键菜单同时触发
  if (ev.metaKey || ev.shiftKey || (ev.ctrlKey && !isMac)) { emit('select', i, true); return }
  if (!(props.selEls ?? []).includes(i)) emit('select', i, false)
  startPending('move', '', (props.selEls ?? []).includes(i) ? [...(props.selEls ?? [])] : [i], ev)
}

function onHandleDown(h: string, ev: PointerEvent) {
  if (!interactive.value || ev.button !== 0 || !selected.value.length) return
  startPending('resize', h, [...selected.value], ev)
}

/** 旋转手柄：单选绕自身中心、多选绕公共中心整体旋转 */
function onRotateDown(ev: PointerEvent) {
  if (!interactive.value || ev.button !== 0 || !selected.value.length) return
  startRotatePending([...selected.value], ev)
}

/** 形状/手柄的 pointerdown 已 .stop，这里只在画布空白处触发。
 *  空白处按下进入框选模式（记录画布坐标起点）；松手时若拖出矩形则套选，否则取消选择。
 *  与单选 / 拖动搬移不冲突：命中形状或手柄时不会冒泡到这里。 */
function onCanvasDown(ev: PointerEvent) {
  if (!interactive.value || ev.button !== 0) return
  marqueeStart = clientToCanvas(ev)
  marquee.value = null
}
/** 仅用于阻止冒泡；选中在 pointerdown 已完成，拖动结束后的 click 也不改选择 */
function onElClick() {}

function onMove(ev: PointerEvent) {
  // 框选：空白起点已记录，按当前指针重算选框（画布坐标）
  if (marqueeStart) {
    const c = clientToCanvas(ev)
    const w = Math.abs(c.x - marqueeStart.x)
    const h = Math.abs(c.y - marqueeStart.y)
    if (w < 2 && h < 2) { marquee.value = null; return }
    marquee.value = {
      x: Math.min(marqueeStart.x, c.x),
      y: Math.min(marqueeStart.y, c.y),
      w, h
    }
    ev.preventDefault()
    return
  }
  if (!pending) return
  const px = ev.clientX - pending.sx, py = ev.clientY - pending.sy
  if (!active) {
    if (Math.hypot(px, py) < 3) return
    active = true
    document.body.style.userSelect = 'none'
  }
  ev.preventDefault()
  let angle = 0
  if (pending.kind === 'rotate') {
    const cur = Math.atan2(ev.clientY - pending.centerClientY, ev.clientX - pending.centerClientX) * 180 / Math.PI
    angle = cur - pending.startAngle
  }
  let dx = px / effScale.value
  let dy = py / effScale.value
  // 搬移时计算对齐吸附（参考线 + 吸附后的位移）；非 move 不吸附
  if (pending.kind === 'move') {
    const al = computeAlign(pending.ids, dx, dy, pending.baseRect)
    dx = al.dx
    dy = al.dy
    guides.value = al.guides
  } else {
    guides.value = []
  }
  drag.value = {
    kind: pending.kind, handle: pending.handle, ids: pending.ids,
    base: pending.base, baseRect: pending.baseRect,
    dx, dy, angle, snap: !!ev.shiftKey
  }
}

function onUp() {
  // 框选结束：拖出矩形则套选相交形状，否则按空白点击取消选择
  if (marqueeStart) {
    if (marquee.value) emit('selectSet', marqueeSelection(marquee.value))
    else if (interactive.value) emit('clear')
    marquee.value = null
    marqueeStart = null
    return
  }
  if (active && drag.value) {
    emit('transform', computeChanges(drag.value))
    holdPreview = true
    // RPC 失败/超时兜底；序号保证连续拖动时旧 timer 不会误清新预览
    const seq = ++holdSeq
    setTimeout(() => {
      if (holdSeq === seq && holdPreview) { holdPreview = false; drag.value = null }
    }, 3000)
  }
  pending = null
  active = false
  guides.value = []
  if (!holdPreview) drag.value = null
  document.body.style.userSelect = ''
}

watch(() => props.slide, () => {
  if (holdPreview) { holdPreview = false; drag.value = null }
  animToken++
  animState.value = null
  cellEdit.value = null
  dgmEdit.value = null
  measure()
  void hydrate()
})
onMounted(() => {
  if (props.auto) {
    ro = new ResizeObserver(measure)
    if (wrapEl.value) ro.observe(wrapEl.value)
  }
  bindDragListeners()
  measure()
  void hydrate()
})
onBeforeUnmount(() => {
  ro?.disconnect()
  unbindDragListeners()
})
/** 拖动监听按 interactive 动态挂卸：画布先只读挂载、后切编辑时，onMounted 的一次性
 *  判断永远不会再跑 —— 元素级 pointerdown（选中/手柄）响应了但 window 级 move/up 缺失，
 *  表现为「选得中、拖不动」（预览→编辑切换故障）。 */
function bindDragListeners() {
  if (!interactive.value) return
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
function unbindDragListeners() {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
}
watch(interactive, (v) => {
  unbindDragListeners()
  if (v) bindDragListeners()
  else { pending = null; active = false; drag.value = null; marqueeStart = null; marquee.value = null }
})
</script>

<template>
  <div ref="wrapEl" class="ov-slide-frame" :class="[auto ? 'ov-slide-frame-auto' : '', transCls]" :style="wrapStyle">
    <div ref="canvasEl" class="ov-slide-canvas" :style="canvasStyle" @pointerdown="onCanvasDown($event)">
      <template v-for="(el, i) in els" :key="i">
        <!-- 形状：矩形快路径用背景层，其余按 geomPath 画 SVG -->
        <div
          v-if="el.t === 'shape'"
          class="ov-slide-el"
          :class="{ 'ov-slide-editable': canEdit(el), 'ov-slide-sel': live && selEl === i, ...animClass(i) }"
          :style="elStyle(el, i)"
          @pointerdown.stop="onElDown(i, $event)"
          @dblclick.stop="startTextEdit(i, el)"
          @click.stop="onElClick"
        >
          <div
            v-if="isRect(el) && !el.stroke && (shapeSolid(el) || shapeGrad(el))"
            class="ov-slide-fill"
            :style="{ background: shapeGrad(el) || shapeSolid(el) }"
          ></div>
          <svg
            v-else
            class="ov-slide-svg"
            :width="Math.max(effBox(i).w, 1)"
            :height="Math.max(effBox(i).h, 1)"
            :viewBox="`0 0 ${Math.max(effBox(i).w, 1)} ${Math.max(effBox(i).h, 1)}`"
          >
            <path
              :d="shapePath(el, effBox(i))"
              :transform="shapeFlip(el.box)"
              :fill="shapeSolid(el) ?? 'none'"
              fill-rule="evenodd"
              :stroke="el.stroke?.c ?? 'none'"
              :stroke-width="el.stroke?.w"
              :stroke-dasharray="el.stroke?.dash"
              stroke-linejoin="round"
            />
          </svg>
          <img
            v-if="el.fill && el.fill.t === 'img'"
            class="ov-slide-fill"
            :data-media="el.fill.target"
            :alt="''"
          />
          <template v-if="el.text">
            <!-- 编辑态：contenteditable + 逐 run 富结构（编辑层 html 由父组件
                 usePptxTextEdit 生成，带 data-pa/data-o 光标契约），退出即摘。
                 编辑期间模型刷新不重写本层 DOM：html 只在内核 replace 后重建。 -->
            <div
              v-if="textEditing && textEditing.i === i"
              class="ov-slide-text ov-slide-text-edit"
              :class="{ 'ov-slide-nowrap': !el.text.wrap }"
              :style="textBoxStyle(el.text)"
              contenteditable="true"
              spellcheck="false"
              :ref="onTextRef"
              v-html="textEditing.html"
              @blur="emit('textBlur')"
              @keydown="emit('textKey', $event)"
              @pointerdown.stop
            ></div>
            <!-- 非编辑态：渲染富文本；文字层恒 pointer-events:none，让 move 手势落到形状本体 -->
            <div
              v-else
              class="ov-slide-text ov-slide-text-locked"
              :class="{ 'ov-slide-nowrap': !el.text.wrap, 'ov-slide-empty': el.text.empty }"
              :style="textBoxStyle(el.text)"
              v-html="bodyHtml(el.text)"
            ></div>
          </template>
        </div>

        <!-- 图片：裁剪、圆角、翻转、描边 -->
        <div
          v-else-if="el.t === 'pic'"
          class="ov-slide-el ov-slide-picbox"
          :class="{ 'ov-slide-sel': live && selEl === i, ...animClass(i) }"
          :style="elStyle(el, i)"
          @pointerdown.stop="onElDown(i, $event)"
          @click.stop="onElClick"
        >
          <img v-if="el.target" :data-media="el.target" :alt="''" class="ov-slide-pic" :style="picImgStyle(el)" />
          <span v-else class="ov-slide-ph">图片</span>
          <span v-if="el.video" class="ov-slide-video">▶ media</span>
        </div>

        <div
          v-else-if="el.t === 'placeholder'"
          class="ov-slide-el ov-slide-ph"
          :class="{ 'ov-slide-sel': live && selEl === i, ...animClass(i) }"
          :style="elStyle(el, i)"
          @pointerdown.stop="onElDown(i, $event)"
          @click.stop="onElClick"
        >
          {{ el.label }}
        </div>

        <!-- SmartArt 降级渲染：节点文本 + 父子连线；双击节点就地编辑（写回 dgm:t） -->
        <div
          v-else-if="el.t === 'smartart'"
          class="ov-slide-el ov-slide-dgm"
          :class="{ 'ov-slide-sel': live && selEl === i, ...animClass(i) }"
          :style="elStyle(el, i)"
          @pointerdown.stop="onElDown(i, $event)"
          @click.stop="onElClick"
        >
          <svg class="ov-dgm-links" :width="Math.max(el.box.w, 1)" :height="Math.max(el.box.h, 1)">
            <line v-for="(ln, k) in dgmLines(el)" :key="k" :x1="ln.x1" :y1="ln.y1" :x2="ln.x2" :y2="ln.y2" />
          </svg>
          <div
            v-for="n in el.nodes"
            :key="n.id"
            class="ov-dgm-node"
            :style="{ left: n.x - el.box.x + 'px', top: n.y - el.box.y + 'px', width: n.w + 'px', height: n.h + 'px' }"
            :title="n.text"
          >
            <div
              v-if="dgmEdit && dgmEdit.i === i && dgmEdit.nodeId === n.id"
              class="ov-dgm-edit"
              contenteditable="true"
              spellcheck="false"
              :ref="focusEl"
              @blur="commitDgmEdit(i, n.id, $event)"
              @keydown="onEditKey($event, cancelDgmEdit)"
              @pointerdown.stop
            >{{ n.text }}</div>
            <span v-else class="ov-dgm-text">{{ n.text }}</span>
          </div>
        </div>

        <!-- 原生图表：自绘 SVG（柱/线/饼）；双击打开数据编辑面板 -->
        <div
          v-else-if="el.t === 'chart'"
          class="ov-slide-el ov-slide-chart"
          :class="{ 'ov-slide-sel': live && selEl === i, ...animClass(i) }"
          :style="elStyle(el, i)"
          @pointerdown.stop="onElDown(i, $event)"
          @dblclick.stop="startChartEdit(i)"
          @click.stop="onElClick"
        >
          <svg
            v-if="chartPrims(el).length"
            class="ov-slide-svg"
            :width="Math.max(el.box.w, 1)"
            :height="Math.max(el.box.h, 1)"
            :viewBox="`0 0 ${Math.max(el.box.w, 1)} ${Math.max(el.box.h, 1)}`"
          >
            <template v-for="(p, k) in chartPrims(el)" :key="k">
              <rect
                v-if="p.k === 'rect'"
                :x="p.x"
                :y="p.y"
                :width="p.w"
                :height="p.h"
                :class="p.cls"
              />
              <line
                v-else-if="p.k === 'line'"
                :x1="p.x1"
                :y1="p.y1"
                :x2="p.x2"
                :y2="p.y2"
                :class="p.cls"
              />
              <polyline
                v-else-if="p.k === 'poly'"
                :points="p.pts"
                :class="p.cls"
              />
              <circle
                v-else-if="p.k === 'circle'"
                :cx="p.cx"
                :cy="p.cy"
                :r="p.r"
                :class="p.cls"
              />
              <path
                v-else-if="p.k === 'path'"
                :d="p.d"
                :class="p.cls"
              />
              <text
                v-else-if="p.k === 'text'"
                :x="p.x"
                :y="p.y"
                :class="p.cls"
                :text-anchor="p.anchor === 'middle' ? 'middle' : p.anchor === 'end' ? 'end' : 'start'"
              >{{ p.text }}</text>
            </template>
          </svg>
          <span v-else class="ov-slide-ph">未识别图表类型{{ el.data.rawType ? '（' + el.data.rawType + '）' : '' }}</span>
        </div>

        <!-- 表格：列宽来自 tblGrid，合并单元格 / 独立边框 / 单元格文本体；双击单元格就地编辑 -->
        <div
          v-else-if="el.t === 'table'"
          class="ov-slide-el ov-slide-tablebox"
          :class="{ 'ov-slide-sel': live && selEl === i, ...animClass(i) }"
          :style="elStyle(el, i)"
          @pointerdown.stop="onElDown(i, $event)"
          @click.stop="onElClick"
        >
          <table class="ov-slide-table">
            <colgroup><col v-for="(w, ci) in el.cols" :key="ci" :style="{ width: w + 'px' }" /></colgroup>
            <tbody>
              <tr v-for="(row, ri) in el.rows" :key="ri">
                <template v-for="(cell, ci) in row.cells" :key="ci">
                  <td
                    v-if="!cell.hidden"
                    :colspan="cell.colSpan > 1 ? cell.colSpan : undefined"
                    :rowspan="cell.rowSpan > 1 ? cell.rowSpan : undefined"
                    :style="cellStyle(cell, row.h)"
                    @dblclick.stop="startCellEdit(i, ri, ci, cell.text)"
                  >
                    <div
                      v-if="cellEdit && cellEdit.i === i && cellEdit.ri === ri && cellEdit.ci === ci"
                      class="ov-cell-edit ov-slide-text ov-slide-flow"
                      :class="{ 'ov-slide-nowrap': cell.text && !cell.text.wrap }"
                      :style="cell.text ? textBoxStyle(cell.text) : undefined"
                      contenteditable="true"
                      spellcheck="false"
                      :ref="focusEl"
                      v-html="cellEdit.html"
                      @blur="commitCell(i, ri, ci, $event)"
                      @keydown="onEditKey($event, cancelCellEdit)"
                      @pointerdown.stop
                    ></div>
                    <div
                      v-else-if="cell.text"
                      class="ov-slide-text ov-slide-flow"
                      :class="{ 'ov-slide-nowrap': !cell.text.wrap }"
                      :style="textBoxStyle(cell.text)"
                      v-html="bodyHtml(cell.text)"
                    ></div>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <!-- 选中外框 + 8 缩放手柄：仅主舞台可交互时渲染，缩略图不渲染 -->
      <div v-if="interactive && selected.length" class="ov-shape-ui" :style="uiStyle">
        <template v-if="selected.length > 1">
          <div v-for="i in selected" :key="i" class="ov-shape-selbox" :style="frameStyle(effBox(i))"></div>
        </template>
        <div v-if="uiRect" class="ov-shape-main" :style="mainFrameStyle(uiRect)">
          <i
            v-for="h in HANDLES"
            :key="h"
            class="ov-shape-handle"
            :class="'ov-shape-h-' + h"
            @pointerdown.stop="onHandleDown(h, $event)"
            @click.stop="onElClick"
          ></i>
          <!-- Office 式旋转手柄：圆形把手 + 连线，随选中框一起旋转；单选绕自身中心、多选绕公共中心 -->
          <div
            class="ov-rot-handle"
            title="拖动旋转（按住 Shift 吸附 15°）"
            @pointerdown.stop="onRotateDown($event)"
            @click.stop="onElClick"
          >
            <span class="ov-rot-grip"></span>
            <span class="ov-rot-stem"></span>
          </div>
        </div>
      </div>
      <!-- 框选矩形：空白处拖拽时的半透明选框（画布坐标，随 scale 一起缩放） -->
      <div v-if="marquee" class="ov-marquee" :style="{ ...uiStyle, left: marquee.x + 'px', top: marquee.y + 'px', width: marquee.w + 'px', height: marquee.h + 'px' }"></div>
      <!-- 对齐吸附参考线：搬移对齐到其它形状 / 画布边·中心时显示（屏幕恒约 1px） -->
      <div v-if="interactive && guides.length" class="ov-align-guides">
        <div
          v-for="(g, k) in guides"
          :key="k"
          class="ov-align-guide"
          :class="g.axis === 'v' ? 'ov-align-guide-v' : 'ov-align-guide-h'"
          :style="g.axis === 'v' ? { left: g.pos + 'px', width: 1 / effScale + 'px' } : { top: g.pos + 'px', height: 1 / effScale + 'px' }"
        ></div>
      </div>
    </div>
  </div>
</template>

<style src="../office-views.css"></style>
<style src="../office-shape.css"></style>
