<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { loadDocxDocument } from '../docx/load'
import type { DocxDocument } from '../docx/document'
import DocToolbar from './DocToolbar.vue'
import { useOfficeToolbar } from '../composables/useOfficeToolbar'

/**
 * docx 原生编辑器：自绘受控 DOM（render.ts 把 blocks 渲染成带 data-bid 的段落 / 表格 / 图片），
 * 文本段落可 contentEditable 直接改，表格/图片只读（防止 contentEditable 破坏结构）。
 * 保存走 GenOffice docx-engine 的 saveDocx，对未编辑块原样回写、编辑块仅重建 runs 并保留
 * 原始 <w:pPr>（标题/列表/对齐/缩进）+ 图片 drawing xml，满足字节保真。
 *
 * 与 OfficeDocInlineEditor 的区别：不丢图片/表格、且保存为真正的 .docx（而非 Markdown 枢纽）。
 */
const props = withDefaults(
  defineProps<{
    path: string
    /** 只读预览模式：不渲染工具栏、段落不可编辑、不触发 change */
    readonly?: boolean
  }>(),
  { readonly: false }
)
const emit = defineEmits<{
  (e: 'change'): void
  (e: 'ready'): void
  (e: 'error', m: string): void
  (e: 'update:content', v: string): void
}>()

const canvasRef = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const ready = ref(false)
const editorErr = ref('')
let doc: DocxDocument | null = null
let wrapperEl: HTMLElement | null = null
const editedByBid = new Map<string, string>()

const {
  fontSizes,
  activeFormats,
  fontFamily,
  fontSize,
  exec,
  setFontFamily,
  setFontSize,
  setColor,
  setHilite,
  attach,
} = useOfficeToolbar(() => wrapperEl)

async function load() {
  loading.value = true
  editorErr.value = ''
  try {
    const res = await loadDocxDocument(props.path)
    doc = res.doc
    const canvas = canvasRef.value
    if (!canvas) return
    canvas.innerHTML = res.html
    // 仅文本块可编辑；表格 / 独立图片块保持只读（contentEditable 会破坏其结构）
    canvas.contentEditable = 'false'
    if (!props.readonly) {
      // 编辑模式：文本段可改，工具栏可用
      canvas.querySelectorAll<HTMLElement>('p[data-bid]').forEach((p) => {
        p.contentEditable = 'true'
      })
      wrapperEl = canvas
      attach()
      canvas.addEventListener('input', onInput)
    }
    loading.value = false
    ready.value = true
    emit('ready')
  } catch (e) {
    loading.value = false
    const msg = 'docx 原生解析失败：' + String(e)
    editorErr.value = msg
    emit('error', msg)
  }
}

function onInput(e: Event) {
  const t = e.target as HTMLElement
  const p = t.closest?.('p[data-bid]') as HTMLElement | null
  if (p && p.dataset.bid) {
    // 只记录被改动的文本块（data-bid → 编辑后 innerHTML），保存时据此重建 runs
    editedByBid.set(p.dataset.bid, p.innerHTML)
    emit('change')
  }
}

/**
 * 导出原生 .docx 字节（供 PreviewPane → App 落盘）。
 * 失败抛错，由上层捕获并提示，避免静默回退到旧 Markdown 写盘覆盖编辑结果。
 */
async function exportDocx(): Promise<Uint8Array | null> {
  if (!doc) return null
  return doc.save(editedByBid)
}

defineExpose({ exportDocx })

onMounted(load)
onUnmounted(() => {
  const canvas = canvasRef.value
  if (canvas) canvas.removeEventListener('input', onInput)
})
</script>

<template>
  <div class="dxe">
    <DocToolbar
      v-if="!readonly"
      :font-sizes="fontSizes"
      :active-formats="activeFormats"
      :font-family="fontFamily"
      :font-size="fontSize"
      @exec="exec"
      @font="setFontFamily"
      @size="setFontSize"
      @color="setColor"
      @hilite="setHilite"
    />
    <div class="dxe-body">
      <div ref="canvasRef" class="dxe-canvas"></div>
      <div v-if="loading" class="dxe-loading">
        <div class="dxe-spinner"></div>
        <span>加载中…</span>
      </div>
    </div>
  </div>
</template>

<style src="./DocxInlineEditor.css" scoped></style>
