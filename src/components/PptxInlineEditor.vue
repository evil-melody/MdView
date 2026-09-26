<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import {
  readPptxSlide,
  readPptxOutline,
  replacePptxImage,
  readFileBytes,
  updatePptxText,
} from '../api'

const props = defineProps<{ path: string }>()
const emit = defineEmits<{
  (e: 'change'): void
}>()

const slides = ref<{ index: number; title: string; html: string }[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')

async function loadSlides() {
  slides.value = []
  error.value = ''
  loading.value = true
  try {
    const titles = await readPptxOutline(props.path)
    for (let i = 0; i < titles.length; i++) {
      const data = await readPptxSlide(props.path, i)
      slides.value.push({ index: data.index, title: data.title, html: data.html })
    }
  } catch (e: any) {
    error.value = String(e)
  } finally {
    loading.value = false
  }
}

function closestShape(el: HTMLElement): HTMLElement | null {
  return el.closest('.px-shape') as HTMLElement | null
}

function closestSlide(el: HTMLElement): HTMLElement | null {
  return el.closest('.ppte-slide') as HTMLElement | null
}

async function onBlur(ev: FocusEvent) {
  const sh = closestShape(ev.target as HTMLElement)
  if (!sh) return
  const idxAttr = sh.getAttribute('data-shp-idx')
  if (!idxAttr) return
  const shapeIdx = Number(idxAttr)
  if (Number.isNaN(shapeIdx)) return
  const slideEl = closestSlide(sh)
  if (!slideEl) return
  const slideIdx = Number(slideEl.getAttribute('data-index'))
  if (Number.isNaN(slideIdx)) return

  const orig = sh.dataset.origText || ''
  const now = sh.innerText || ''
  if (now === orig) return

  saving.value = true
  try {
    await updatePptxText(props.path, slideIdx, shapeIdx, now)
    sh.dataset.origText = now
    emit('change')
  } catch (e: any) {
    error.value = '保存文字失败：' + String(e)
  } finally {
    saving.value = false
  }
}

function markOrigText() {
  nextTick(() => {
    document.querySelectorAll('.ppte-canvas .px-shape').forEach((el) => {
      const sh = el as HTMLElement
      if (sh.dataset.origText === undefined) {
        sh.dataset.origText = sh.innerText || ''
      }
    })
  })
}

watch(slides, markOrigText, { deep: true })

async function onImageClick(ev: MouseEvent) {
  const target = (ev.target as HTMLElement).closest('.px-img') as HTMLElement | null
  if (!target) return
  const rid = target.getAttribute('data-rid')
  if (!rid) return
  const slideEl = closestSlide(target)
  if (!slideEl) return
  const slideIndex = Number(slideEl.getAttribute('data-index'))
  if (Number.isNaN(slideIndex)) return
  await replaceImage(slideIndex, rid)
}

async function replaceImage(slideIndex: number, rid: string) {
  const selected = await open({
    multiple: false,
    filters: [
      { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }
    ]
  })
  if (typeof selected !== 'string' || !selected) return
  saving.value = true
  try {
    const bytes = await readFileBytes(selected)
    await replacePptxImage(props.path, slideIndex, rid, bytes)
    const data = await readPptxSlide(props.path, slideIndex)
    const idx = slides.value.findIndex((s) => s.index === slideIndex)
    if (idx >= 0) {
      slides.value[idx] = { index: data.index, title: data.title, html: data.html }
    }
    emit('change')
  } catch (e: any) {
    error.value = '替换图片失败：' + String(e)
  } finally {
    saving.value = false
  }
}

onMounted(loadSlides)
watch(() => props.path, loadSlides)
</script>

<template>
  <div class="ppte">
    <div class="ppte-toolbar">
      点击幻灯片文字直接编辑，点击图片替换；按 Esc 或点击空白处失焦即保存
    </div>
    <div class="ppte-preview" @blur.capture="onBlur" @click="onImageClick">
      <div v-if="loading" class="ppte-loading">加载幻灯片预览中…</div>
      <div v-else-if="error" class="ppte-error">{{ error }}</div>
      <div
        v-for="s in slides"
        :key="s.index"
        class="ppte-slide"
        :data-index="s.index"
      >
        <div class="ppte-head">
          <span class="ppte-no">{{ s.index + 1 }}</span>
          <span class="ppte-title">{{ s.title || '（无标题）' }}</span>
        </div>
        <div class="ppte-canvas" v-html="s.html"></div>
      </div>
    </div>
    <div v-if="saving" class="ppte-saving">保存中…</div>
  </div>
</template>

<style src="./PptxInlineEditor.css" scoped></style>
