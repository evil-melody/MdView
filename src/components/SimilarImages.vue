<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { convertFileSrc } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { clearImageIndex, findSimilar, indexImages, loadImageIndex } from '../api'
import { state } from '../store'
import type { ImageIndexProgress, ImageRecord } from '../types'
import { fmtSize } from '../utils/format'
import './SimilarImages.css'

const emit = defineEmits<{
  (e: 'open-file', path: string): void
  (e: 'delete', path: string): void
  (e: 'toast', msg: string): void
}>()

/**
 * 汉明距离阈值：dHash 为 64 bit，经验值——
 * ≤ 6 近乎同一张（缩放/重压缩）；10 允许轻度裁剪与水印；> 16 基本是误报。
 */
const threshold = ref(10)
const error = ref('')
/** 当前扫描任务 id：屏蔽过期进度事件 */
let scanReqId = ''
let unlisten: UnlistenFn | null = null

const groups = computed(() => state.similarGroups)
const dupCount = computed(() => groups.value.reduce((n, g) => n + g.items.length, 0))

/** 可释放空间估算：每组保留最大的一张，其余视为可删 */
const reclaimable = computed(() =>
  groups.value.reduce((sum, g) => {
    const max = Math.max(...g.items.map((i) => i.size))
    return sum + g.items.reduce((s, i) => s + i.size, 0) - max
  }, 0)
)

const scanRoots = computed<string[]>(() => {
  const roots = state.config.scan_roots.filter(Boolean)
  return roots.length ? roots : state.currentDir ? [state.currentDir] : []
})

const progressPct = computed(() =>
  state.imageIndexTotal ? Math.round((state.imageIndexDone / state.imageIndexTotal) * 100) : 0
)

function srcOf(rec: ImageRecord): string {
  return convertFileSrc(rec.path)
}

async function refreshIndexCount() {
  try {
    const idx = await loadImageIndex()
    state.imageIndexed = Object.keys(idx).length
  } catch {
    state.imageIndexed = 0
  }
}

async function refreshGroups() {
  if (!state.imageIndexed) {
    state.similarGroups = []
    return
  }
  state.similarBusy = true
  error.value = ''
  try {
    state.similarGroups = await findSimilar(threshold.value)
  } catch (e: any) {
    error.value = '分组失败：' + String(e?.message ?? e)
    state.similarGroups = []
  } finally {
    state.similarBusy = false
  }
}

/** 扫描（或增量更新）图片哈希索引：指纹未变的图片直接复用缓存 */
async function scan() {
  const roots = scanRoots.value
  if (!roots.length) {
    emit('toast', '请先在设置里添加资料库目录')
    return
  }
  if (state.imageIndexing) return
  scanReqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  state.imageIndexing = true
  state.imageIndexDone = 0
  state.imageIndexTotal = 0
  error.value = ''
  try {
    let total = 0
    for (const r of roots) {
      total = await indexImages(scanReqId, r)
    }
    state.imageIndexed = total
    await refreshGroups()
    emit('toast', `图片索引完成：共 ${total} 张`)
  } catch (e: any) {
    error.value = '图片索引失败：' + String(e?.message ?? e)
  } finally {
    state.imageIndexing = false
  }
}

async function resetIndex() {
  await clearImageIndex()
  state.imageIndexed = 0
  state.similarGroups = []
  emit('toast', '图片索引已清空')
}

/** 阈值拖动结束再重算：O(n²) 比较，避免拖动过程中连打接口 */
function onThresholdCommit() {
  refreshGroups()
}

// 删除文件后（treeVersion 自增）同步刷新索引计数与分组，避免展示已删图片
watch(
  () => state.treeVersion,
  async () => {
    await refreshIndexCount()
    if (state.page === 'similar') await refreshGroups()
  }
)

onMounted(async () => {
  unlisten = await listen<ImageIndexProgress>('img-index-progress', (e) => {
    if (e.payload.id !== scanReqId) return
    state.imageIndexDone = e.payload.done
    state.imageIndexTotal = e.payload.total
  })
  await refreshIndexCount()
  if (state.imageIndexed) await refreshGroups()
})

onBeforeUnmount(() => unlisten?.())
</script>

<template>
  <div class="sim">
    <div class="sim-toolbar">
      <button class="btn primary" :disabled="state.imageIndexing" @click="scan">
        {{ state.imageIndexed ? '↻ 更新索引' : '🔍 扫描图片索引' }}
      </button>
      <button
        class="btn"
        :disabled="state.imageIndexing || !state.imageIndexed"
        @click="refreshGroups"
      >重新分组</button>
      <button
        class="btn ghost"
        :disabled="state.imageIndexing || !state.imageIndexed"
        title="清空图片哈希索引"
        @click="resetIndex"
      >清空索引</button>

      <label class="sim-th">
        <span>相似度阈值 {{ threshold }}</span>
        <input
          v-model.number="threshold"
          type="range"
          min="0"
          max="20"
          step="1"
          :disabled="state.imageIndexing"
          @change="onThresholdCommit"
        />
      </label>

      <div class="sim-stat">
        已索引 <b>{{ state.imageIndexed }}</b> 张
        <template v-if="groups.length">
          · 命中 <b>{{ groups.length }}</b> 组 / {{ dupCount }} 张
          · 可释放 <b>{{ fmtSize(reclaimable) }}</b>
        </template>
      </div>
    </div>

    <div v-if="state.imageIndexing" class="sim-progress">
      <div class="sim-bar-wrap"><div class="sim-bar" :style="{ width: progressPct + '%' }"></div></div>
      <span class="sim-text">
        {{ state.imageIndexTotal ? `${state.imageIndexDone} / ${state.imageIndexTotal}` : '扫描中…' }}
      </span>
    </div>

    <div v-if="error" class="sim-error">{{ error }}</div>

    <div class="sim-body scrollable">
      <div v-if="!state.imageIndexed && !state.imageIndexing" class="sim-empty">
        <div class="se-emoji">🖼</div>
        <p>尚未建立图片索引</p>
        <p class="se-hint">点击「扫描图片索引」，对资料库里的图片逐张计算 dHash 指纹后即可查重</p>
      </div>
      <div v-else-if="state.similarBusy" class="sim-empty"><p>分组计算中…</p></div>
      <div v-else-if="!groups.length" class="sim-empty">
        <div class="se-emoji">✨</div>
        <p>没有发现相似图片</p>
        <p class="se-hint">可把阈值调大（更宽松）或先扫描更多目录</p>
      </div>

      <section v-for="(g, gi) in groups" v-else :key="gi" class="sim-group">
        <header class="sg-head">
          <span class="sg-title">第 {{ gi + 1 }} 组 · {{ g.items.length }} 张</span>
          <span class="sg-dist" :title="'组内最大汉明距离（0 = 完全一致）'">
            距离 {{ g.max_distance }}
          </span>
        </header>
        <div class="sg-grid">
          <figure
            v-for="it in g.items"
            :key="it.path"
            class="sg-card"
            :title="it.path"
            @click="emit('open-file', it.path)"
          >
            <div class="sg-thumb">
              <img :src="srcOf(it)" loading="lazy" :alt="it.name" />
            </div>
            <figcaption class="sg-cap">
              <span class="sg-name">{{ it.name }}</span>
              <span class="sg-meta">{{ it.width }}×{{ it.height }} · {{ fmtSize(it.size) }}</span>
            </figcaption>
            <button class="sg-del" title="删除这张（保留组内其他）" @click.stop="emit('delete', it.path)">🗑</button>
          </figure>
        </div>
      </section>
    </div>
  </div>
</template>
