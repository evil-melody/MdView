<script setup lang="ts">
import { ref, computed, watch, nextTick, defineAsyncComponent, h } from 'vue'
import type { FileEntry, ViewTab } from '../types'
import type { OpenTab } from '../store'
import type { MarkdownHeading } from '../utils/markdown'
import MdPreview from './MdPreview.vue'
import MindmapView from './MindmapView.vue'
import BinaryViewer from './BinaryViewer.vue'
import DocxInlineEditor from './DocxInlineEditor.vue'
import PptxInlineEditor from './PptxInlineEditor.vue'
import CodeEditor from './CodeEditor.vue'
import FileIcon from './FileIcon.vue'
import { viewerTypeFor, officeEditable } from '../utils/viewer'
import { isCodeFile } from '../utils/codeLang'
import { clipboardImageBlob, saveClipboardImage } from '../utils/pasteImage'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { TabViewer } from '../store'

const props = defineProps<{
  entry: FileEntry | null
  content: string
  headings: MarkdownHeading[]
  dirty: boolean
  kindLabel: Record<string, string>
  tabs?: OpenTab[]
  activeTabPath?: string | null
  viewer?: TabViewer | null
  basePath?: string | null
  /** 新建文件的路径：命中时打开即切到「编辑」页签 */
  editOnOpen?: string | null
}>()

const emit = defineEmits<{
  (e: 'save'): void
  (e: 'save-as'): void
  (e: 'update:content', v: string): void
  (e: 'close'): void
  (e: 'switch-tab', path: string): void
  (e: 'close-tab', path: string): void
  (e: 'open-ai'): void
  (e: 'dirty'): void
  (e: 'image-saved'): void
}>()

const tab = ref<ViewTab>('preview')
const outlineOpen = ref(false)
/** 编辑器报错文案：明确展示原因便于定位 */
const editorErr = ref('')
/** docx 原生编辑器解析失败时回退到纯文本编辑（不回退 vue-files-preview，避免双 Vue 崩溃） */
const docxNativeFailed = ref(false)
// immediate：新建文件后 PreviewPane 首次挂载时也要命中 editOnOpen 直接进编辑
watch(
  () => props.entry?.path,
  (p) => {
    editorErr.value = ''
    docxNativeFailed.value = false
    if (p && p === props.editOnOpen) tab.value = 'edit'
  },
  { immediate: true }
)

/** 文本类 + docx/xlsx/pptx 可编辑；未知扩展名（other）与 csv/tsv 也按文本尝试编辑 */
const canEdit = computed(() => {
  if (!props.entry) return false
  if (['markdown', 'text', 'config', 'code', 'other'].includes(props.entry.kind)) return true
  if (isCsvLike.value) return true
  return officeEditable(props.entry)
})

/**
 * 纯只读预览类（图片/PDF/音视频）——走 BinaryViewer，不显示编辑/保存。
 * docx/xlsx/pptx 支持编辑，故排除在外。
 */
const isViewerKind = computed(() => {
  const v = viewerTypeFor(props.entry)
  return v !== null && !officeEditable(props.entry)
})

/** docx/xlsx/pptx：预览/编辑走各自编辑器 */
const isOffice = computed(() => officeEditable(props.entry))
const isDocx = computed(
  () => (props.entry?.ext || '').toLowerCase() === 'docx'
)
const isPptx = computed(
  () => (props.entry?.ext || '').toLowerCase() === 'pptx'
)
/** csv/tsv：预览走表格渲染，编辑走文本（CodeEditor），保留原格式 */
const isCsvLike = computed(() => {
  const ext = (props.entry?.ext || '').toLowerCase()
  return ext === 'csv' || ext === 'tsv'
})

/**
 * xlsx 编辑器懒加载：避免 SheetJS 首屏 chunk 阻塞。
 */
const EditorLoading = () => h('div', { class: 'editor-loading' }, '编辑器加载中…')
const OfficeSheetEditor = defineAsyncComponent({
  loader: () => import('./OfficeSheetEditor.vue'),
  loadingComponent: EditorLoading,
  delay: 150
})

/** 代码 / 配置类文件（shell、toml、xml、json、yaml、ini…）走 CodeMirror 编辑器；
 *  未知扩展名（kind=other）兜底按纯文本处理，避免被当 Markdown 乱渲染 */
const isCode = computed(
  () => isCodeFile(props.entry) || props.entry?.kind === 'other'
)

/** 代码类文件预览区的只读展示（等宽、保留空白，避免被当 Markdown 乱渲染） */
const codePreview = computed(() => (isCode.value ? props.content : ''))

/** html/htm：预览走原生 webview 渲染（asset 协议 iframe），不走 Markdown 管道 */
const isHtml = computed(
  () => !!props.entry && ['html', 'htm'].includes((props.entry.ext || '').toLowerCase())
)
const htmlSrc = computed(() =>
  isHtml.value && props.entry ? convertFileSrc(props.entry.path) : ''
)

function selectTab(t: ViewTab) {
  if (t !== 'mindmap' && !canEdit.value && t !== 'preview') return
  tab.value = t
}

const showOutline = computed(
  () => !!props.entry && props.headings.length > 0 && tab.value !== 'mindmap'
)

function scrollTo(id: string) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** xlsx 编辑器实例，供保存时导出原生二进制 */
const officeRef = ref<any>(null)
/** docx 原生编辑器实例，导出原生 .docx 字节 */
const docxRef = ref<any>(null)

/** Uint8Array → base64（docx 原生字节经 write_binary_base64 落盘） */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(bin)
}

/** 保存时取回编辑器内容：docx 走原生 .docx 字节，xlsx 走原生 base64 */
async function exportOffice(): Promise<string | null> {
  if (isDocx.value) {
    const bytes = await docxRef.value?.exportDocx?.()
    return bytes ? bytesToBase64(bytes) : null
  }
  return (await officeRef.value?.exportBase64?.()) ?? null
}

function onDocEditorError(msg: string) {
  editorErr.value = msg
  // docx 原生解析失败 → 切回 Markdown 枢纽编辑器兜底
  docxNativeFailed.value = true
}

function dismissEditorError() {
  editorErr.value = ''
}

/**
 * Markdown 编辑器粘贴截图：图片落盘到文档同目录，正文光标处插入相对路径引用。
 * 非图片粘贴不拦截，交回浏览器默认行为。
 */
async function onPasteImage(ev: ClipboardEvent) {
  const el = ev.target as HTMLTextAreaElement
  const blob = clipboardImageBlob(ev)
  if (!blob || !props.entry) return
  const dir = props.entry.path.replace(/[/\\][^/\\]*$/, '')
  if (!dir) return
  ev.preventDefault()
  try {
    const name = await saveClipboardImage(dir, blob)
    emit('image-saved')
    const snippet = `![${name}](./${name})`
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    emit('update:content', el.value.slice(0, start) + snippet + el.value.slice(end))
    await nextTick()
    el.focus()
    el.selectionStart = el.selectionEnd = start + snippet.length
  } catch (e) {
    onDocEditorError(String(e))
  }
}

/** pptx 自动保存由 PptxInlineEditor 在失焦时完成；保存按钮仅清脏标记 */
async function commitPptx(): Promise<boolean> {
  return true
}

defineExpose({ exportOffice, commitPptx })
</script>

<template>
  <div class="pane">
    <div v-if="tabs && tabs.length" class="tabstrip">
      <div
        v-for="t in tabs"
        :key="t.entry.path"
        class="ts-tab"
        :class="{ active: t.entry.path === activeTabPath }"
        :title="t.entry.path"
        @click="emit('switch-tab', t.entry.path)"
      >
        <span class="ts-ico"><FileIcon :name="t.entry.name" :is-dir="t.entry.is_dir" :size="14" /></span>
        <span class="ts-name">{{ t.entry.name }}</span>
        <span v-if="t.dirty" class="ts-dot" title="未保存">●</span>
        <button class="ts-close" title="关闭页签" @click.stop="emit('close-tab', t.entry.path)">×</button>
      </div>
    </div>
    <div class="pane-head">
      <div class="file-info">
        <button class="btn ghost icon-btn back-btn" title="返回文件列表" @click="emit('close')">←</button>
        <span class="fname">{{ entry ? entry.name : '未选择文件' }}</span>
        <span v-if="entry" class="ftag">{{ kindLabel[entry.kind] }}</span>
        <span v-if="dirty" class="dirty-dot" title="未保存">●</span>
      </div>
      <div v-if="!isViewerKind" class="tabs">
        <button
          class="tab"
          :class="{ active: tab === 'preview' }"
          @click="selectTab('preview')"
        >预览</button>
        <button
          class="tab"
          :class="{ active: tab === 'edit' }"
          :disabled="!canEdit"
          @click="selectTab('edit')"
        >编辑</button>
        <button
          class="tab"
          :class="{ active: tab === 'mindmap' }"
          :disabled="!canEdit || entry?.kind !== 'markdown'"
          @click="selectTab('mindmap')"
        >脑图</button>
      </div>
      <div class="head-actions">
        <button
          v-if="canEdit"
          class="btn"
          title="打开 AI 助手浮窗"
          @click="emit('open-ai')"
        >AI 助手</button>
        <button
          v-if="canEdit && !isOffice"
          class="btn"
          title="保存到其它位置"
          @click="emit('save-as')"
        >另存为</button>
        <button
          v-if="canEdit"
          class="btn primary"
          :disabled="!dirty"
          @click="emit('save')"
        >{{ dirty ? '保存*' : '已保存' }}</button>
      </div>
    </div>

    <div v-if="editorErr" class="editor-alert">
      <span class="ea-text" :title="editorErr">编辑器异常：{{ editorErr }}</span>
      <button class="ea-btn" @click="dismissEditorError">关闭</button>
    </div>

    <div class="pane-body">
      <!-- 图片 / PDF / 音视频 -->
      <BinaryViewer v-if="isViewerKind" :entry="entry" :viewer="viewer" />

      <template v-else-if="canEdit">
        <div class="content-area">
          <div v-if="tab === 'preview'" class="flex1">
            <!-- docx：原生渲染（只读预览）。脱离 vue-files-preview/@vue-office/docx 的
                 双 Vue 实例冲突（其预编译产物硬编码 vue@3.5.28，与应用 vue@3.5.13 不兼容，
                 导致 instance.update/vnode.shapeFlag/component.emitsOptions 级联崩溃） -->
            <DocxInlineEditor
              v-if="isDocx"
              :readonly="true"
              :key="entry!.path"
              :path="entry!.path"
              @error="onDocEditorError"
            />
            <!-- xlsx：vue-files-preview 渲染 -->
            <BinaryViewer v-else-if="isOffice && !isPptx" :entry="entry" :viewer="viewer" />
            <!-- pptx：预览与编辑同款渲染（vue-files-preview 在该场景下易卡死，故用同款 HTML） -->
            <PptxInlineEditor
              v-else-if="isPptx"
              :path="entry!.path"
            />
            <!-- html：原生 webview 渲染（浏览器方式，脚本/相对资源照常加载） -->
            <iframe
              v-else-if="isHtml"
              class="html-frame"
              :src="htmlSrc"
              :title="entry?.name || 'HTML 预览'"
            ></iframe>
            <MdPreview v-else-if="!isCode" :content="content" :dirty="dirty" :base-path="basePath" />
            <pre v-else class="code-view scrollable">{{ codePreview }}</pre>
          </div>
          <div v-else-if="tab === 'edit' && isOffice" class="flex1">
            <!-- docx：原生编辑（自绘受控 DOM + 图片/表格 + 原生 .docx 保存） -->
            <DocxInlineEditor
              v-if="isDocx && !docxNativeFailed"
              ref="docxRef"
              :key="entry!.path"
              :path="entry!.path"
              @change="emit('dirty')"
              @error="onDocEditorError"
            />
            <!-- docx 原生解析失败兜底：纯文本编辑（不回退 vue-files-preview，避免双 Vue 崩溃） -->
            <textarea
              v-else-if="isDocx"
              class="editor scrollable full"
              :value="content"
              @input="emit('update:content', ($event.target as HTMLTextAreaElement).value)"
              spellcheck="false"
            ></textarea>
            <!-- csv/tsv：文本方式编辑（CodeEditor），保存直接写回原文件 -->
            <CodeEditor
              v-else-if="isCsvLike"
              :key="entry!.path"
              :content="content"
              :path="entry!.path"
              @change="emit('dirty')"
              @update:content="(v: string) => emit('update:content', v)"
            />
            <!-- xlsx：原生表格编辑器 -->
            <OfficeSheetEditor
              v-else-if="!isPptx"
              ref="officeRef"
              :key="entry!.path"
              :path="entry!.path"
              @change="emit('dirty')"
            />
            <!-- pptx：与预览同款渲染，支持文字失焦保存 / 图片替换 -->
            <PptxInlineEditor
              v-else
              :path="entry!.path"
              @change="emit('dirty')"
            />
          </div>
          <!-- 代码 / 配置类：CodeMirror 高亮编辑器（语法高亮 + Tab 缩进 + 查找） -->
          <div v-else-if="tab === 'edit' && isCode" class="flex1">
            <CodeEditor
              :key="entry!.path"
              :content="content"
              :path="entry!.path"
              @change="emit('dirty')"
              @update:content="(v: string) => emit('update:content', v)"
            />
          </div>
          <div v-else-if="tab === 'edit' && isHtml" class="flex1">
            <textarea
              class="editor scrollable full"
              :value="content"
              @input="emit('update:content', ($event.target as HTMLTextAreaElement).value)"
              spellcheck="false"
            ></textarea>
          </div>
          <div v-else-if="tab === 'edit'" class="editor-split">
            <textarea
              class="editor scrollable"
              :value="content"
              @input="emit('update:content', ($event.target as HTMLTextAreaElement).value)"
              @paste="onPasteImage"
              spellcheck="false"
            ></textarea>
            <div class="editor-live flex1">
              <MdPreview :content="content" :dirty="dirty" :base-path="basePath" />
            </div>
          </div>
          <div v-else-if="tab === 'mindmap'" class="flex1">
            <MindmapView :content="content" />
          </div>

          <!-- 大纲：贴右侧竖条收缩，展开为悬浮面板（对标 InspireLoom） -->
          <transition name="ol-slide">
            <div v-if="showOutline && outlineOpen" class="outline">
              <div class="ol-head">
                <span class="ol-title">大纲</span>
                <button class="ol-close" title="收起大纲" @click="outlineOpen = false">»</button>
              </div>
              <div class="ol-list scrollable">
                <div
                  v-for="h in headings"
                  :key="h.id"
                  class="ol-item"
                  :class="'lv' + h.level"
                  @click="scrollTo(h.id)"
                >{{ h.text }}</div>
              </div>
            </div>
          </transition>
          <div
            v-if="showOutline"
            class="outline-tab"
            :class="{ on: outlineOpen }"
            title="大纲"
            @click="outlineOpen = !outlineOpen"
          >
            <span class="ot-ico">☰</span>
            <span class="ot-text">{{ outlineOpen ? '收起' : '大纲' }}</span>
          </div>
        </div>
      </template>

      <div v-else class="no-file">
        <div class="nf-emoji">🗂</div>
        <p v-if="entry">所选类型（{{ kindLabel[entry.kind] }}）暂不支持预览，可在外部程序中打开。</p>
        <p v-else>从左侧选择 Markdown / 文本 / 代码文件开始预览与编辑。</p>
      </div>
    </div>
  </div>
</template>

<style src="./PreviewPane.css"></style>
