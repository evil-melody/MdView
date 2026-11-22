<script setup lang="ts">
/**
 * 浮动图片交互层（xlsx drawing）：单击选中（描边 + 8 手柄）、拖动移动、手柄缩放、Delete 删除。
 * 拖动/缩放只在本地实时预览，松手把屏幕 px 反算回布局 px 并吸附到最近格线，emit 一次 op
 * 由父视图写回内核（xlsx.drawingOp）；Esc / 点空白处取消选中。样式集中在 office-views.css。
 */
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { XlsxDrawingInfo, XlsxDrawingOp } from '../core/xlsx/types'
import type { Axis } from '../view/xlsx/axis'

type Item = XlsxDrawingInfo & { src: string }

const props = defineProps<{
  drawings: Item[]
  zoom: number
  editable: boolean
  /** 网格原点（行头宽 / 列头高）：图片绝对定位以 .ov-grid 为参照 */
  originX: number
  originY: number
  /** 缩放后的屏幕 px 轴（与单元格同一套），吸附格线用 */
  colAxis: Axis
  rowAxis: Axis
}>()

const emit = defineEmits<{ (e: 'op', op: XlsxDrawingOp): void }>()

const DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
const MIN_PX = 8

const sel = ref<number | null>(null)
/** 拖动/缩放实时预览：box 为 .ov-grid 内屏幕 px（含缩放） */
const drag = shallowRef<{ i: number; kind: 'move' | 'resize'; box: { x: number; y: number; w: number; h: number } } | null>(null)
let resizeDir = ''
let startX = 0
let startY = 0
let base = { x: 0, y: 0, w: 0, h: 0 }
/** 指针是否真的动过：单击选中（down+up 无位移）不触发 op */
let moved = false

const r2 = (v: number) => Math.round(v * 100) / 100
const zoomOf = () => props.zoom || 1

/** 图片的静态屏幕盒（未拖动时） */
function screenBox(i: number) {
  const d = props.drawings[i]
  if (!d) return { x: 0, y: 0, w: 1, h: 1 }
  const z = zoomOf()
  return { x: props.originX + d.x * z, y: props.originY + d.y * z, w: Math.max(1, d.w * z), h: Math.max(1, d.h * z) }
}

/** 图片 / 选中框的定位：拖动中用预览盒，否则静态盒 */
function boxOf(i: number) {
  const g = drag.value
  const b = g && g.i === i ? g.box : screenBox(i)
  return { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' }
}
const selBox = computed(() => (sel.value === null ? null : boxOf(sel.value)))

function onImgDown(e: PointerEvent, i: number) {
  if (!props.editable) return
  e.preventDefault()
  sel.value = i
  base = screenBox(i)
  resizeDir = ''
  beginDrag(e, i, 'move')
}

function onHandleDown(e: PointerEvent, dir: string) {
  const i = sel.value
  if (i === null) return
  e.preventDefault()
  base = screenBox(i)
  resizeDir = dir
  beginDrag(e, i, 'resize')
}

function beginDrag(e: PointerEvent, i: number, kind: 'move' | 'resize') {
  startX = e.clientX
  startY = e.clientY
  moved = false
  drag.value = { i, kind, box: { ...base } }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function onMove(e: PointerEvent) {
  const g = drag.value
  if (!g) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  if (dx || dy) moved = true
  if (g.kind === 'move') {
    drag.value = { ...g, box: { x: base.x + dx, y: base.y + dy, w: base.w, h: base.h } }
    return
  }
  // 等比缩放：以拖动起始盒的宽高比为基准，取横/纵相对变化更大的一边作主动边，另一边按比例算。
  // 固定拖动对侧的边；n/s 或 e/w 单边手柄则以中心为轴，避免图片被压窄。
  const ratio = Math.max(0.01, base.w / Math.max(1, base.h))
  const wByX = resizeDir.includes('e') ? base.w + dx : resizeDir.includes('w') ? base.w - dx : base.w
  const hByY = resizeDir.includes('s') ? base.h + dy : resizeDir.includes('n') ? base.h - dy : base.h
  let w: number, h: number
  if (Math.abs(wByX / base.w - 1) >= Math.abs(hByY / base.h - 1)) {
    w = Math.max(MIN_PX, wByX)
    h = Math.max(MIN_PX, w / ratio)
  } else {
    h = Math.max(MIN_PX, hByY)
    w = Math.max(MIN_PX, h * ratio)
  }
  const x = resizeDir.includes('w') ? base.x + base.w - w : resizeDir.includes('e') ? base.x : base.x + (base.w - w) / 2
  const y = resizeDir.includes('n') ? base.y + base.h - h : resizeDir.includes('s') ? base.y : base.y + (base.h - h) / 2
  drag.value = { ...g, box: { x, y, w, h } }
}

/** 吸附到最近格线（axis 已是缩放后屏幕 px）；越界收回到 0 */
function snapAxis(px: number, axis: Axis): number {
  if (axis.count <= 0) return Math.max(0, px)
  const i = Math.min(Math.max(0, axis.index(px)), axis.count - 1)
  const p0 = Math.max(0, axis.pos(i))
  const p1 = Math.max(0, axis.pos(i) + axis.size(i))
  return Math.abs(px - p0) <= Math.abs(px - p1) ? p0 : p1
}

function onUp() {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  const g = drag.value
  drag.value = null
  if (!g || !moved) return
  const z = zoomOf()
  const b = g.box
  if (g.kind === 'move') {
    const x = snapAxis(b.x - props.originX, props.colAxis) / z
    const y = snapAxis(b.y - props.originY, props.rowAxis) / z
    emit('op', { kind: 'move', index: g.i, x: r2(x), y: r2(y) })
  } else {
    let x0 = (b.x - props.originX) / z
    let y0 = (b.y - props.originY) / z
    let x1 = x0 + b.w / z
    let y1 = y0 + b.h / z
    // 单元格图片不吸附：格线吸附会把等比盒压成另一个比例；普通浮图仍吸附到最近格线。
    if (!props.drawings[g.i]?.cell) {
      if (resizeDir.includes('w')) x0 = snapAxis(x0 * z, props.colAxis) / z
      if (resizeDir.includes('e')) x1 = snapAxis(x1 * z, props.colAxis) / z
      if (resizeDir.includes('n')) y0 = snapAxis(y0 * z, props.rowAxis) / z
      if (resizeDir.includes('s')) y1 = snapAxis(y1 * z, props.rowAxis) / z
    }
    if (x1 < x0) [x0, x1] = [x1, x0]
    if (y1 < y0) [y0, y1] = [y1, y0]
    emit('op', { kind: 'resize', index: g.i, x: r2(x0), y: r2(y0), w: r2(x1 - x0), h: r2(y1 - y0) })
  }
}

/** Delete / Backspace 删除选中图片，Esc 取消选中（capture 阶段截获，避免触发清除单元格） */
function onKey(e: KeyboardEvent) {
  if (sel.value === null || !props.editable) return
  const ae = document.activeElement as HTMLElement | null
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return
  if (document.querySelector('.ov-flt-overlay, .ov-ctx-overlay, .ov-dlg-overlay')) return
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    e.stopPropagation()
    const i = sel.value
    sel.value = null
    emit('op', { kind: 'delete', index: i })
  } else if (e.key === 'Escape') {
    e.stopPropagation()
    sel.value = null
  }
}

/** 点空白处（网格 / 其他覆盖层）取消选中；图片与手柄的 pointerdown 自带 stop 不会到这 */
function onDocDown(e: PointerEvent) {
  if (sel.value === null) return
  const t = e.target as HTMLElement | null
  if (t && t.closest && t.closest('.ov-dlayer')) return
  sel.value = null
}

watch(
  () => props.drawings.length,
  (n) => {
    if (sel.value !== null && sel.value >= n) sel.value = null
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('pointerdown', onDocDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('pointerdown', onDocDown)
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
})
</script>

<template>
  <div class="ov-dlayer">
    <img
      v-for="(d, i) in drawings"
      :key="d.id + ':' + d.rid"
      class="ov-drawing"
      :class="{ 'ov-drawing-sel': editable && sel === i, 'ov-drawing-ro': !editable }"
      :src="d.src"
      :style="boxOf(i)"
      alt=""
      draggable="false"
      @pointerdown.stop="onImgDown($event, i)"
    />
    <!-- 选中框 + 8 手柄：手柄定位走 CSS（data-dir），框随拖动预览实时跟随 -->
    <div v-if="editable && sel !== null && drawings[sel]" class="ov-dsel" :style="selBox">
      <span v-for="dir in DIRS" :key="dir" class="ov-dhandle" :data-dir="dir" @pointerdown.stop="onHandleDown($event, dir)"></span>
    </div>
  </div>
</template>
