<script setup lang="ts">
/**
 * PDF 在线编辑：pdfjs 渲染当前页 → SVG 覆盖层承载文字与图片改动 → pdf-lib 增量写回。
 * 扫描件（无文本层）只读。保存由 MdView 顶部「保存」/ Ctrl+S 触发，写盘交给上层。
 * 坐标一律用 PDF 点（左上原点），SVG 属性按 zoom 放大，组件内无内联样式。
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { readFileBytes } from '../api'
import { clipboardImageBlob } from '../utils/pasteImage'
import {
  PdfSource, applyEdits, hasEdits, normalizeImage, pageEdits,
  type PdfEdits, type PdfImageAsset, type TextHit, type TextBox, type ImageBox
} from '../utils/pdfEdit'
import './PdfEditor.css'

const props = defineProps<{
  path: string
  /** 外部刷新序号：递增即重读磁盘 */
  rev?: number
  editable?: boolean
  /** 当前激活页签：聚焦后 Ctrl/⌘+V 才能落到本组件 */
  active?: boolean
}>()
const emit = defineEmits<{
  (e: 'change'): void
  (e: 'error', msg: string): void
  (e: 'readonly', v: boolean): void
}>()

const rootEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)
const draftEl = ref<HTMLTextAreaElement | null>(null)
const source = new PdfSource()
const pageNo = ref(1)
const numPages = ref(0)
const zoom = ref(1)
const view = ref({ w: 0, h: 0 })
const texts = ref<TextHit[]>([])
const scanned = ref(false)
const loading = ref(true)
const err = ref('')
const assets = ref<PdfImageAsset[]>([])
const selected = ref<number | null>(null)
const editing = ref<TextHit | null>(null)
const draft = ref('')

let edits: PdfEdits = new Map()
let nextId = 1
let renderSeq = 0
const version = ref(0)
function bump() { version.value++ }

const currentTexts = computed(() => {
  version.value
  return [...pageEdits(edits, pageNo.value).texts.entries()].map(([k, box]) => ({ k, box }))
})
const currentImages = computed<ImageBox[]>(() => {
  version.value
  return [...pageEdits(edits, pageNo.value).images]
})
const canWork = computed(() => !!props.editable && !scanned.value && !loading.value)
/** 编辑态预览与写回用同一套字体：文档自带的嵌入字体，未注册时退回系统中文字体 */
function displayFont(b: TextBox): string {
  if (!b.fontFamily) return '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  return `"${b.fontFamily}"${b.fallback ? `, "${b.fallback}"` : ''}, serif`
}

async function loadDoc(bytes?: Uint8Array) {
  loading.value = true
  err.value = ''
  try {
    const buf = bytes ?? new Uint8Array(await readFileBytes(props.path))
    await source.load(buf)
    numPages.value = source.numPages
    scanned.value = source.scanned
    pageNo.value = Math.min(Math.max(1, pageNo.value), Math.max(1, source.numPages))
    emit('readonly', source.scanned)
    await renderPage()
  } catch (e) {
    err.value = String(e)
    emit('error', err.value)
  } finally {
    loading.value = false
  }
}

async function renderPage() {
  const seq = ++renderSeq
  await nextTick()
  if (!canvasEl.value || !numPages.value) return
  try {
    const size = await source.render(pageNo.value, zoom.value, canvasEl.value)
    if (seq !== renderSeq) return
    view.value = size
    // 文本层只受编辑态 / 扫描件约束：loadDoc 期间 loading 仍为 true，不能用 canWork 过滤
    texts.value = props.editable && !scanned.value ? await source.textBoxes(pageNo.value) : []
    if (seq !== renderSeq) return
    assets.value = []
    selected.value = null
  } catch (e) {
    if (seq === renderSeq) { err.value = String(e); emit('error', err.value) }
  }
}

watch(() => props.rev, (n, o) => { if (n !== o) void loadDoc() })
watch([pageNo, zoom, () => props.editable], () => { if (numPages.value) void renderPage() })
watch(() => props.active, (v) => { if (v) rootEl.value?.focus() })
onMounted(() => { void loadDoc().then(() => rootEl.value?.focus()) })
onBeforeUnmount(() => {
  void source.destroy()
  const urls = [...currentImages.value.map((i) => i.url), ...assets.value.map((a) => a.url)]
  for (const u of urls) URL.revokeObjectURL(u)
})

/** SVG → PDF 点坐标：按元素实际尺寸归一，兼容 CSS 缩放 */
function point(ev: MouseEvent) {
  const r = svgEl.value!.getBoundingClientRect()
  return {
    x: ((ev.clientX - r.left) * view.value.w) / r.width / zoom.value,
    y: ((ev.clientY - r.top) * view.value.h) / r.height / zoom.value
  }
}

function startText(t: TextHit) {
  if (!canWork.value) return
  editing.value = t
  draft.value = t.box.text
  selected.value = null
  nextTick(() => draftEl.value?.focus())
}
function cancelText() { editing.value = null }
function applyText() {
  const t = editing.value
  if (!t) return
  const old = pageEdits(edits, pageNo.value).texts.get(t.index)
  if (draft.value === (old?.text ?? t.box.text)) { editing.value = null; return }
  pageEdits(edits, pageNo.value).texts.set(t.index, { ...t.box, text: draft.value })
  editing.value = null
  bump()
  emit('change')
}

type Drag = { id: number; mode: 'move' | 'size'; dx: number; dy: number }
let drag: Drag | null = null
function startDrag(ev: MouseEvent, im: ImageBox) {
  if (!canWork.value) return
  const p = point(ev)
  selected.value = im.id
  drag = { id: im.id, mode: 'move', dx: p.x - im.x, dy: p.y - im.y }
}
function startSize(ev: MouseEvent, im: ImageBox) {
  if (!canWork.value) return
  const p = point(ev)
  drag = { id: im.id, mode: 'size', dx: p.x - (im.x + im.w), dy: p.y - (im.y + im.h) }
}
function onMove(ev: MouseEvent) {
  if (!drag) return
  const p = point(ev)
  const im = currentImages.value.find((x) => x.id === drag!.id)
  if (!im) return
  if (drag.mode === 'move') { im.x = Math.max(0, p.x - drag.dx); im.y = Math.max(0, p.y - drag.dy) }
  else { im.w = Math.max(12, p.x - im.x - drag.dx); im.h = Math.max(12, p.y - im.y - drag.dy) }
  bump()
}
function onUp() {
  if (drag) { drag = null; emit('change') }
}
function onBlank(ev: MouseEvent) {
  if ((ev.target as Element).tagName === 'svg') selected.value = null
}

async function insertImage(blob: Blob) {
  if (!canWork.value) return
  try {
    const im = await normalizeImage(blob)
    const maxW = (view.value.w / zoom.value) * 0.45
    const w = Math.min(maxW, Math.max(60, im.w / 3))
    const h = (w * im.h) / im.w
    const list = pageEdits(edits, pageNo.value).images
    const offset = (list.length % 5) * 12
    const id = nextId++
    list.push({ id, x: 24 + offset, y: 24 + offset, w, h, bytes: im.bytes, mime: im.mime, url: im.url })
    selected.value = id
    bump()
    emit('change')
  } catch (e) { err.value = String(e); emit('error', err.value) }
}

function onPaste(ev: ClipboardEvent) {
  const blob = clipboardImageBlob(ev)
  if (!blob || !canWork.value) return
  ev.preventDefault()
  void insertImage(blob)
}
function pickImage() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = () => { const f = input.files?.[0]; if (f) void insertImage(f) }
  input.click()
}
function deleteSelected() {
  if (selected.value === null) return
  const e = pageEdits(edits, pageNo.value)
  const im = e.images.find((x) => x.id === selected.value)
  if (im) URL.revokeObjectURL(im.url)
  e.images = e.images.filter((x) => x.id !== selected.value)
  selected.value = null
  bump()
  emit('change')
}
async function writeClipboard(blob: Blob) {
  if (typeof ClipboardItem === 'undefined') throw new Error('当前环境不支持复制图片')
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
}
async function copySelected() {
  const im = currentImages.value.find((x) => x.id === selected.value)
  if (!im) return
  try { await writeClipboard(new Blob([new Uint8Array(im.bytes)], { type: im.mime })) }
  catch (e) { err.value = String(e); emit('error', err.value) }
}
async function extractImages() {
  try { assets.value = await source.embeddedImages(pageNo.value) }
  catch (e) { err.value = String(e); emit('error', err.value) }
}
async function copyAsset(a: PdfImageAsset) {
  try { await writeClipboard(a.blob) }
  catch (e) { err.value = String(e); emit('error', err.value) }
}
function closeAssets() {
  for (const a of assets.value) URL.revokeObjectURL(a.url)
  assets.value = []
}

function nav(d: number) {
  const n = Math.min(Math.max(1, pageNo.value + d), Math.max(1, numPages.value))
  if (n !== pageNo.value) pageNo.value = n
}
function setZoom(d: number) {
  zoom.value = Math.min(2.5, Math.max(0.5, Math.round((zoom.value + d) * 100) / 100))
}
function onKey(e: KeyboardEvent) {
  if (!canWork.value || editing.value || e.key !== 'Delete') return
  if (selected.value !== null) { e.preventDefault(); deleteSelected() }
}

/** 由 MdView 保存流程调用：导出新字节；无改动返回 null，避免 Ctrl+S 空写 */
async function save(): Promise<Uint8Array | null> {
  if (!hasEdits(edits)) return null
  const out = await applyEdits(source.bytes, edits)
  edits = new Map()
  bump()
  await loadDoc(out)
  return out
}
defineExpose({ save })
</script>

<template>
  <div ref="rootEl" class="pe-root" tabindex="0" @paste="onPaste" @keydown="onKey">
    <div class="pe-bar">
      <div class="pe-group">
        <button class="pe-btn" title="上一页" :disabled="pageNo <= 1" @click="nav(-1)">‹</button>
        <span class="pe-page-no">{{ pageNo }} / {{ numPages || 1 }}</span>
        <button class="pe-btn" title="下一页" :disabled="pageNo >= numPages" @click="nav(1)">›</button>
      </div>
      <div class="pe-group">
        <button class="pe-btn" title="缩小" @click="setZoom(-0.25)">−</button>
        <span class="pe-zoom">{{ Math.round(zoom * 100) }}%</span>
        <button class="pe-btn" title="放大" @click="setZoom(0.25)">＋</button>
      </div>
      <div v-if="canWork" class="pe-group">
        <button class="pe-btn pe-wide" title="插入本地图片" @click="pickImage">插入图片</button>
        <button class="pe-btn pe-wide" :disabled="selected === null" title="复制选中图片到剪贴板" @click="copySelected">复制图片</button>
        <button class="pe-btn pe-wide" :disabled="selected === null" title="删除选中图片" @click="deleteSelected">删除</button>
        <button class="pe-btn pe-wide" title="提取本页 PDF 内嵌图片" @click="extractImages">页面图片</button>
      </div>
      <span v-if="scanned" class="pe-state pe-state-ro">扫描件（无文本层）只读，暂不支持编辑</span>
      <span v-else-if="!editable" class="pe-state">切到「编辑」可改文字、粘贴图片</span>
      <span v-else class="pe-state">点文字修改 · Ctrl/⌘+V 贴图 · 拖动 / 缩放图片</span>
      <span v-if="loading" class="pe-state">加载中…</span>
    </div>

    <div class="pe-scroll">
      <div class="pe-page">
        <canvas ref="canvasEl" class="pe-canvas"></canvas>
        <svg
          v-if="view.w"
          ref="svgEl"
          class="pe-overlay"
          :width="view.w"
          :height="view.h"
          :viewBox="`0 0 ${view.w} ${view.h}`"
          @mousedown="onBlank"
          @mousemove="onMove"
          @mouseup="onUp"
          @mouseleave="onUp"
        >
          <g v-for="t in currentTexts" :key="`t${t.k}`">
            <rect class="pe-cover" :x="t.box.x * zoom" :y="t.box.y * zoom" :width="t.box.w * zoom" :height="t.box.h * zoom" />
            <text
              class="pe-newtext"
              :x="(t.box.x + 1) * zoom"
              :y="t.box.baseline * zoom"
              :font-size="t.box.fontSize * zoom"
              :font-family="displayFont(t.box)"
              :fill="t.box.color"
            >{{ t.box.text }}</text>
          </g>
          <g v-for="im in currentImages" :key="`i${im.id}`">
            <image
              class="pe-image"
              :class="{ 'pe-image-on': selected === im.id }"
              :href="im.url"
              :x="im.x * zoom"
              :y="im.y * zoom"
              :width="im.w * zoom"
              :height="im.h * zoom"
              @mousedown.stop.prevent="startDrag($event, im)"
            />
            <template v-if="selected === im.id">
              <rect class="pe-sel" :x="im.x * zoom" :y="im.y * zoom" :width="im.w * zoom" :height="im.h * zoom" />
              <rect class="pe-handle" :x="(im.x + im.w - 7) * zoom" :y="(im.y + im.h - 7) * zoom" :width="8 * zoom" :height="8 * zoom" @mousedown.stop.prevent="startSize($event, im)" />
            </template>
          </g>
          <rect
            v-for="t in texts"
            v-show="canWork && currentTexts.every((x) => x.k !== t.index)"
            :key="`h${t.index}`"
            class="pe-hit"
            :x="t.box.x * zoom"
            :y="t.box.y * zoom"
            :width="t.box.w * zoom"
            :height="t.box.h * zoom"
            @mousedown.stop="startText(t)"
          />
        </svg>
      </div>
    </div>

    <div v-if="assets.length" class="pe-assets">
      <span class="pe-assets-title">本页内嵌图片</span>
      <div v-for="(a, i) in assets" :key="`a${i}`" class="pe-asset">
        <img class="pe-thumb" :src="a.url" alt="内嵌图片" />
        <button class="pe-btn" @click="copyAsset(a)">复制</button>
        <button class="pe-btn" @click="insertImage(a.blob)">插入</button>
      </div>
      <button class="pe-btn" @click="closeAssets">关闭</button>
    </div>

    <div v-if="editing" class="pe-edit">
      <textarea
        ref="draftEl"
        v-model="draft"
        class="pe-input"
        rows="2"
        @keydown.esc.prevent="cancelText"
        @keydown.ctrl.enter.prevent="applyText"
        @keydown.meta.enter.prevent="applyText"
      ></textarea>
      <button class="pe-btn" @click="applyText">应用</button>
      <button class="pe-btn" @click="cancelText">取消</button>
    </div>
    <div v-if="err" class="pe-err">{{ err }}</div>
  </div>
</template>
