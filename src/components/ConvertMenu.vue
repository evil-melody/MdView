<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { FileEntry } from '../types'
import { convertLabel, supportedConvertTargets } from '../utils/convert'

/**
 * 「转格式」目标格式浮层（单实例，由 App.vue 统一持有与定位）。
 *
 * 为什么必须 Teleport 到 body：列表卡片 / 预览面板多为 overflow:hidden，
 * 普通定位浮层会被裁剪（InspireLoom DocFormatConvert 同款踩坑）。
 */

const props = defineProps<{
  entry: FileEntry
  /** 视口坐标（fixed 定位） */
  x: number
  y: number
}>()

const emit = defineEmits<{
  (e: 'pick', target: string): void
  (e: 'close'): void
}>()

const targets = ref<string[]>([])
const loading = ref(true)
const pos = ref({ left: '0px', top: '0px' })

const POP_W = 188

async function load() {
  const ext = (props.entry.ext || '').toLowerCase()
  try {
    targets.value = await supportedConvertTargets(ext)
  } catch {
    targets.value = []
  } finally {
    loading.value = false
  }
}

function place() {
  const maxLeft = window.innerWidth - POP_W - 8
  const maxTop = window.innerHeight - 260
  pos.value = {
    left: `${Math.max(8, Math.min(props.x, maxLeft))}px`,
    top: `${Math.max(8, Math.min(props.y, maxTop))}px`
  }
}

function onDocPointer(e: MouseEvent) {
  const el = e.target as HTMLElement | null
  if (!el?.closest('.convert-pop')) emit('close')
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

function onScroll() {
  emit('close')
}

onMounted(async () => {
  place()
  document.addEventListener('click', onDocPointer)
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onScroll)
  await load()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocPointer)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onScroll)
})
</script>

<template>
  <Teleport to="body">
    <div class="convert-pop" :style="pos">
      <div class="convert-pop-title">
        转换为<span class="convert-pop-src">.{{ entry.ext }}</span>
      </div>
      <div v-if="loading" class="convert-pop-hint">读取候选项中…</div>
      <div v-else-if="!targets.length" class="convert-pop-hint">该格式暂无可转换目标</div>
      <template v-else>
        <button
          v-for="t in targets"
          :key="t"
          class="convert-pop-item"
          :title="`转换为 ${convertLabel(t)}`"
          @click.stop="emit('pick', t)"
        >
          <span class="convert-pop-label">{{ convertLabel(t) }}</span>
          <span class="convert-pop-ext">.{{ t }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style src="./ConvertMenu.css"></style>
