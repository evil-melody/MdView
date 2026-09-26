<script setup lang="ts">
import { ref, watch, defineAsyncComponent } from 'vue'
import type { FileEntry } from '../types'
import type { TabViewer } from '../store'

// 照搬 InspireLoom：vue-files-preview 原文件预览器（docx/ppt/xlsx/pdf 等内核自带），样式随组件动态加载
const VueFilesPreview = defineAsyncComponent(async () => {
  await import('vue-files-preview/lib/style.css')
  const mod: any = await import('vue-files-preview')
  return mod.VueFilesPreview ?? mod.default?.VueFilesPreview ?? mod.default ?? mod
})

const props = defineProps<{
  entry: FileEntry | null
  viewer?: TabViewer | null
}>()

const imgFailed = ref(false)
watch(
  () => [props.viewer, props.entry?.path],
  () => {
    imgFailed.value = false
    resetZoom()
  }
)

// ---- 图片缩放 / 平移 ----
const MIN_ZOOM = 0.1
const MAX_ZOOM = 10
const zoom = ref(1)
const off = ref({ x: 0, y: 0 })
const panning = ref(false)
let dragStart: { x: number; y: number; ox: number; oy: number } | null = null

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

function resetZoom() {
  zoom.value = 1
  off.value = { x: 0, y: 0 }
  panning.value = false
  dragStart = null
}

function fitZoom() {
  // 适应窗口：还原初始 contain 状态
  resetZoom()
}

function actualSize() {
  zoom.value = 1
  off.value = { x: 0, y: 0 }
}

function zoomBy(f: number) {
  zoom.value = clampZoom(zoom.value * f)
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
  zoom.value = clampZoom(zoom.value * factor)
}

function onPanStart(e: MouseEvent) {
  if (zoom.value <= 1) return
  panning.value = true
  dragStart = { x: e.clientX, y: e.clientY, ox: off.value.x, oy: off.value.y }
  window.addEventListener('mousemove', onPanMove)
  window.addEventListener('mouseup', onPanEnd)
}

function onPanMove(e: MouseEvent) {
  if (!dragStart) return
  off.value = {
    x: dragStart.ox + (e.clientX - dragStart.x),
    y: dragStart.oy + (e.clientY - dragStart.y)
  }
}

function onPanEnd() {
  panning.value = false
  dragStart = null
  window.removeEventListener('mousemove', onPanMove)
  window.removeEventListener('mouseup', onPanEnd)
}
</script>

<template>
  <div class="bv">
    <!-- 加载中（openTab 已开页签、viewer 尚未构建完成） -->
    <div v-if="!viewer" class="bv-loading">
      <div class="bv-spinner"></div>
      <span>加载预览中…</span>
    </div>

    <template v-else>
      <div v-if="viewer.error" class="bv-error">
        <div class="bve-ico">⚠️</div>
        <p>{{ viewer.error }}</p>
      </div>

      <!-- 图片（滚轮缩放 / 拖拽平移 / 双击复位） -->
      <div v-else-if="viewer.type === 'image'" class="bv-media">
        <div v-if="imgFailed" class="bv-error">
          <div class="bve-ico">🖼</div>
          <p>图片加载失败，文件可能已损坏或路径不可访问。</p>
        </div>
        <template v-else>
          <img
            :src="viewer.src"
            :alt="entry?.name || ''"
            :style="{
              transform: `translate(${off.x}px, ${off.y}px) scale(${zoom})`,
              cursor: zoom > 1 ? (panning ? 'grabbing' : 'grab') : 'default',
              transition: panning ? 'none' : 'transform 0.15s ease'
            }"
            @error="imgFailed = true"
            @wheel="onWheel"
            @mousedown.prevent="onPanStart"
            @dblclick="resetZoom"
          />
          <div class="bv-zoombar" @mousedown.stop>
            <button class="bz-btn" title="缩小" @click="zoomBy(1 / 1.25)">−</button>
            <span class="bz-val">{{ Math.round(zoom * 100) }}%</span>
            <button class="bz-btn" title="放大" @click="zoomBy(1.25)">＋</button>
            <span class="bz-sep"></span>
            <button class="bz-btn" title="适应窗口" @click="fitZoom">适应</button>
            <button class="bz-btn" title="原始尺寸 (100%)" @click="actualSize">1:1</button>
          </div>
        </template>
      </div>

      <!-- PDF -->
      <iframe
        v-else-if="viewer.type === 'pdf'"
        class="bv-pdf"
        :src="viewer.src"
        :title="entry?.name || 'PDF 预览'"
      ></iframe>

      <!-- 音视频 -->
      <div v-else-if="viewer.type === 'audio'" class="bv-media bv-av">
        <div class="bv-av-ico">🎵</div>
        <audio controls :src="viewer.src"></audio>
      </div>
      <div v-else-if="viewer.type === 'video'" class="bv-media bv-av">
        <video controls :src="viewer.src"></video>
      </div>

      <!-- office（docx/sheet/pptx）：vue-files-preview 按 asset URL 原文件渲染 -->
      <div
        v-else-if="viewer.type === 'docx' || viewer.type === 'sheet' || viewer.type === 'pptx'"
        class="bv-vfp"
      >
        <VueFilesPreview :url="viewer.src" height="100%" />
      </div>
    </template>
  </div>
</template>

<style src="./BinaryViewer.css"></style>
