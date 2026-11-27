<script setup lang="ts">
/**
 * Office 宿主（纯 Vue）：内核 DocumentClient 跑在 inline Worker，视图按格式切到 Vue 组件。
 * 页签常驻由 PreviewPane 负责；本组件只在首次打开、刷新、保存后重建文档。
 * 文件级操作（保存 / 页签 / 主题）留在 MdView 顶部栏，这里只挂统一格式工具条。
 */
import { ref, shallowRef, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { readFileBytes, transcodeImage } from '../api'
import { DocumentClient } from '../office/client'
import type { OpenResult } from '../office/client'
import OfficeDocView from '../office/components/OfficeDocView.vue'
import OfficeSheetView from '../office/components/OfficeSheetView.vue'
import OfficeSlideView from '../office/components/OfficeSlideView.vue'
import OfficeToolbar from '../office/components/OfficeToolbar.vue'

const props = defineProps<{
  path: string
  name: string
  editable: boolean
  theme: 'dark' | 'light'
  /** 刷新序号：变化时重读磁盘，复用同一宿主与工具条 */
  rev?: number
}>()

const emit = defineEmits<{
  (e: 'change'): void
  (e: 'error', m: string): void
}>()

const client = shallowRef<DocumentClient | null>(null)
const info = shallowRef<OpenResult | null>(null)
const kind = computed(() => info.value?.kind ?? '')
const docId = ref(0)
const viewRef = ref<{ commands?: Record<string, (...args: any[]) => unknown>; bar?: Record<string, any> } | null>(null)
const commands = computed(() => viewRef.value?.commands ?? undefined)
const bar = computed(() => viewRef.value?.bar ?? undefined)
const loading = ref(true)
const err = ref('')
let disposed = false
let loadSeq = 0

async function openWith(src: Blob) {
  const seq = ++loadSeq
  client.value?.destroy()
  client.value = null
  const c = await DocumentClient.open(src, { name: props.name })
  if (disposed || seq !== loadSeq) {
    c.destroy()
    return
  }
  client.value = c
  info.value = c.info
  docId.value++
  err.value = ''
  loading.value = false
}

async function loadDocument() {
  loading.value = true
  try {
    /* ponytail: Tauri 原始字节通道一次给全量，峰值内存 ≈ 文件大小。
       上限：解决主线程阻塞与 DOM 规模，不降内存峰值。
       升级：本地文件暴露 HTTP Range 后把 src 换成可 Range 的 asset URL。 */
    const bytes = await readFileBytes(props.path)
    if (disposed) return
    await openWith(new Blob([bytes]))
  } catch (e) {
    loading.value = false
    err.value = String(e)
    emit('error', String(e))
  }
}

function onError(m: string) {
  err.value = m
  emit('error', m)
}

/** 由 MdView 保存按钮 / Ctrl+S 调用：导出 OOXML 字节，写盘交给上层 */
async function save(): Promise<Uint8Array | null> {
  const c = client.value
  if (!c) return null
  const blob = await c.call('save')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  // 用保存结果重建文档：内核 dirty 归零，视图与磁盘一致，且不重读旧文件
  await openWith(new Blob([bytes]))
  return bytes
}

onMounted(() => void loadDocument())
watch(() => props.rev, () => void loadDocument())
watch(
  () => props.path,
  () => void loadDocument()
)

onBeforeUnmount(() => {
  disposed = true
  client.value?.destroy()
  client.value = null
})

/** 打开当前文档的查找栏（Word / Excel 视图有 find 命令；PPT 无查找面则忽略） */
function find() {
  const fn = viewRef.value?.commands?.find
  if (typeof fn === 'function') fn()
}

defineExpose({ save, find })
</script>

<template>
  <div class="oeh flex1">
    <OfficeToolbar :kind="kind" :editable="editable" :commands="commands" :bar="bar" />
    <OfficeDocView
      v-if="client && info && kind === 'docx'"
      :key="docId"
      ref="viewRef"
      :client="client"
      :editable="editable"
      @change="emit('change')"
      @error="onError"
    />
    <OfficeSheetView
      v-else-if="client && info && kind === 'xlsx'"
      :key="docId"
      ref="viewRef"
      :client="client"
      :info="info"
      :editable="true"
      :transcode-image="transcodeImage"
      @change="emit('change')"
      @error="onError"
    />
    <OfficeSlideView
      v-else-if="client && info && kind === 'pptx'"
      :key="docId"
      ref="viewRef"
      :client="client"
      :info="info"
      :editable="editable"
      @change="emit('change')"
      @error="onError"
    />
    <div v-else-if="client && info" class="oeh-tip">此格式（{{ kind }}）暂不提供可视化编辑</div>
    <div v-if="loading && !err" class="oeh-tip">文档加载中…</div>
    <div v-if="err" class="oeh-tip oeh-err">{{ err }}</div>
  </div>
</template>

<style src="./OfficeEngineHost.css"></style>
