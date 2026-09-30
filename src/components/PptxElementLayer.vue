<script setup lang="ts">
/**
 * Selection layer for the pptx editor: the frame, the eight resize handles and the pointer maths.
 *
 * The layer never touches the document. A gesture is tracked locally (`preview` rects) so dragging
 * re-renders nothing but this overlay, and exactly one op transaction is emitted on pointerup. The
 * frame is positioned in percentages of the slide box and rotated with a CSS transform, which is why
 * `toLocalDelta` exists: screen deltas are rotated back into the element's own frame first.
 *
 * Hit testing stays with the container (the SVG carries `data-source-id`); this layer only covers the
 * frames themselves, so a click on empty canvas still reaches the slide underneath.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import type { ElementBox } from '../pptx/load'
import type { LocalRef, PxRect } from '../pptx/ops'
import { applyDrag, handlesOf, toLocalDelta, type DragMode } from '../pptx/interact'

const props = defineProps<{
  elements: ElementBox[]
  /** durable element ids currently selected (paint order) */
  selected: string[]
  widthPx: number
  heightPx: number
  /** durable id of the element whose inline text editor is open — its frame is hidden */
  editingId: string | null
  busy: boolean
}>()

const emit = defineEmits<{
  (e: 'select', payload: { ref: LocalRef; additive: boolean }): void
  (e: 'activate', ref: LocalRef): void
  (e: 'commit', payload: { refs: LocalRef[]; rects: PxRect[]; label: string }): void
}>()

const root = ref<HTMLElement | null>(null)
interface DragState {
  mode: DragMode
  originX: number
  originY: number
  starts: { ref: LocalRef; rect: PxRect }[]
  rot: number
  moved: boolean
}

const drag = ref<DragState | null>(null)
const preview = ref<{ ref: LocalRef; rect: PxRect }[]>([])

const byId = computed(() => {
  const m = new Map<string, ElementBox>()
  for (const el of props.elements) m.set(el.key, el)
  return m
})

const selectedBoxes = computed(() =>
  props.selected.map((id) => byId.value.get(id)).filter((b): b is ElementBox => !!b)
)

/** The frame of the element being text-edited is hidden: the inline overlay draws its own. */
const visible = computed(() => selectedBoxes.value.filter((b) => b.key !== props.editingId))

const single = computed(() => (visible.value.length === 1 ? visible.value[0] : null))

function pct(v: number, total: number) {
  return `${((v / total) * 100).toFixed(4)}%`
}

function frameStyle(rect: PxRect, rot: number) {
  return {
    left: pct(rect.x, props.widthPx),
    top: pct(rect.y, props.heightPx),
    width: pct(rect.w, props.widthPx),
    height: pct(rect.h, props.heightPx),
    transform: rot ? `rotate(${rot}deg)` : undefined,
    // OOXML rotates about the frame centre; keep the pivot there while dragging/resizing too
    transformOrigin: '50% 50%'
  }
}

const rectOf = (b: ElementBox) => preview.value.find((p) => p.ref.el === b.key)?.rect

const handles = computed(() => {
  const b = single.value
  if (!b || props.busy) return []
  const rect = rectOf(b) ?? { x: b.x, y: b.y, w: b.w, h: b.h }
  return handlesOf(rect).map((h) => ({
    id: h.id,
    style: { left: pct(h.x, props.widthPx), top: pct(h.y, props.heightPx) }
  }))
})

/** client (screen) px → slide px for the current zoom, measured on the live overlay. */
function pxScale(): number {
  const w = root.value?.clientWidth ?? 0
  return w > 0 && props.widthPx > 0 ? props.widthPx / w : 1
}

const refOf = (b: ElementBox): LocalRef => ({ el: b.key, groupPath: b.groupPath })

function onFrameDown(ev: PointerEvent, b: ElementBox) {
  if (props.busy || ev.button !== 0) return
  ev.stopPropagation()
  const additive = ev.shiftKey || ev.metaKey || ev.ctrlKey
  if (additive) {
    emit('select', { ref: refOf(b), additive: true })
    return
  }
  if (!props.selected.includes(b.key)) emit('select', { ref: refOf(b), additive: false })
  beginDrag(ev, 'move', b)
}

function onHandleDown(ev: PointerEvent, id: DragMode) {
  const b = single.value
  if (props.busy || ev.button !== 0 || !b) return
  ev.stopPropagation()
  beginDrag(ev, id, b)
}

function beginDrag(ev: PointerEvent, mode: DragMode, target: ElementBox) {
  const scale = pxScale()
  // multi-selection drags move every selected element; resize only ever applies to one
  const starts =
    mode === 'move'
      ? selectedBoxes.value.map((b) => ({
          ref: refOf(b),
          rect: { x: b.x, y: b.y, w: b.w, h: b.h }
        }))
      : [{ ref: refOf(target), rect: { x: target.x, y: target.y, w: target.w, h: target.h } }]
  drag.value = {
    mode,
    originX: ev.clientX * scale,
    originY: ev.clientY * scale,
    starts,
    rot: target.rot,
    moved: false
  }
  preview.value = starts.map((s) => ({ ref: s.ref, rect: s.rect }))
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', cancelDrag)
  window.addEventListener('keydown', onKeydown)
}

function onPointerMove(ev: PointerEvent) {
  const d = drag.value
  if (!d) return
  const scale = pxScale()
  const dxClient = ev.clientX * scale - d.originX
  const dyClient = ev.clientY * scale - d.originY
  // rotated frames: the pointer moved in screen space, the rect grows in element space
  const local = toLocalDelta(dxClient, dyClient, d.rot)
  if (Math.abs(local.x) > 0.5 || Math.abs(local.y) > 0.5) d.moved = true
  preview.value = d.starts.map((s) => ({
    ref: s.ref,
    rect: applyDrag({ rect: s.rect, mode: d.mode, dx: local.x, dy: local.y, keepRatio: ev.shiftKey })
  }))
}

function onPointerUp() {
  const d = drag.value
  const out = preview.value.slice()
  const moved = d?.moved ?? false
  detach()
  drag.value = null
  preview.value = []
  if (!d || !moved) return
  emit('commit', {
    refs: out.map((o) => o.ref),
    rects: out.map((o) => o.rect),
    label: d.mode === 'move' ? '移动元素' : '缩放元素'
  })
}

function cancelDrag() {
  detach()
  drag.value = null
  preview.value = []
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && drag.value) {
    ev.preventDefault()
    cancelDrag()
  }
}

function detach() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', cancelDrag)
  window.removeEventListener('keydown', onKeydown)
}

onBeforeUnmount(detach)
</script>

<template>
  <div ref="root" class="pxl">
    <div
      v-for="b in visible"
      :key="b.key"
      class="pxl-frame"
      :class="{ 'pxl-frame--grouped': !!b.groupPath.length }"
      :style="frameStyle(rectOf(b) ?? { x: b.x, y: b.y, w: b.w, h: b.h }, b.rot)"
      @pointerdown="onFrameDown($event, b)"
      @click.stop
      @dblclick.stop="emit('activate', refOf(b))"
    >
      <span v-if="b.groupPath.length" class="pxl-badge">组合</span>
    </div>

    <div
      v-for="h in handles"
      :key="h.id"
      class="pxl-handle"
      :style="h.style"
      :data-handle="h.id"
      @pointerdown="onHandleDown($event, h.id)"
      @click.stop
    ></div>
  </div>
</template>

<style src="./PptxElementLayer.css" scoped></style>
