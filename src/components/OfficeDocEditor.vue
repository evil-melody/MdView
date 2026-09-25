<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { readBinaryBase64 } from '../api'

const props = defineProps<{ path: string }>()
const emit = defineEmits<{
  (e: 'change'): void
  (e: 'ready'): void
  (e: 'error', m: string): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const errText = ref('')
let editor: any = null

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const buf = new ArrayBuffer(bin.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i)
  return buf
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

onMounted(async () => {
  if (!containerRef.value) return
  try {
    const Editor = (await import('@hufe921/canvas-editor')).default
    editor = new Editor(containerRef.value, {
      main: [{ value: '加载中...' }],
    })
    // 内容变更 → 脏态（事件名 contentChange；部分版本无 eventBus，忽略即可）
    try {
      editor.eventBus?.on?.('contentChange', () => emit('change'))
    } catch (_) {
      /* ignore */
    }
    // docx 插件：executeImportDocx / executeExportDocx
    const docxPlugin = (await import('@hufe921/canvas-editor-plugin-docx'))
      .default
    editor.use(docxPlugin)

    const b64 = await readBinaryBase64(props.path)
    await editor.command.executeImportDocx({ arrayBuffer: b64ToBuf(b64) })
    emit('ready')
  } catch (e: any) {
    errText.value = 'docx 解析失败: ' + (e?.message || String(e))
    emit('error', errText.value)
  }
})

onUnmounted(() => {
  try {
    editor?.destroy?.()
  } catch (_) {
    /* ignore */
  }
  editor = null
})

/**
 * 导出当前文档为 docx base64。
 * 插件 executeExportDocx 返回 Blob 的同时会创建 <a download> 自动触发下载，
 * 导出期间临时拦截 anchor 的 click，只取 Blob 落盘，避免每次保存弹下载文件。
 */
async function exportBase64(): Promise<string | null> {
  if (!editor?.command?.executeExportDocx) return null
  const desc = Object.getOwnPropertyDescriptor(
    HTMLAnchorElement.prototype,
    'click'
  )
  const stubClick = function (this: HTMLAnchorElement) {
    /* 保存流程不触发浏览器下载 */
  }
  Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
    value: stubClick,
    configurable: true,
  })
  try {
    const result = await editor.command.executeExportDocx({
      fileName: 'mdview-export',
    })
    const blob =
      result instanceof Blob
        ? result
        : result instanceof ArrayBuffer
          ? new Blob([result])
          : (result?.blob ?? null)
    if (!blob) return null
    const buf = new Uint8Array(await blob.arrayBuffer())
    return bytesToBase64(buf)
  } finally {
    if (desc) Object.defineProperty(HTMLAnchorElement.prototype, 'click', desc)
  }
}

defineExpose({ exportBase64 })
</script>

<template>
  <div class="office-editor-wrapper">
    <div v-if="errText" class="office-error">{{ errText }}</div>
    <div v-else ref="containerRef" class="office-editor-container"></div>
  </div>
</template>

<style src="./OfficeEditors.css" scoped></style>
