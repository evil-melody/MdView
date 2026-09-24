<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { FileEntry, ViewTab } from '../types'
import type { OpenTab } from '../store'
import type { MarkdownHeading } from '../utils/markdown'
import MdPreview from './MdPreview.vue'
import MindmapView from './MindmapView.vue'
import BinaryViewer from './BinaryViewer.vue'
import FileIcon from './FileIcon.vue'
import { viewerTypeFor, officeEditable } from '../utils/viewer'
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
}>()

const emit = defineEmits<{
  (e: 'save'): void
  (e: 'update:content', v: string): void
  (e: 'close'): void
  (e: 'switch-tab', path: string): void
  (e: 'close-tab', path: string): void
  (e: 'open-ai'): void
}>()

const tab = ref<ViewTab>('preview')
const outlineOpen = ref(false)

/** 文本类 + docx/xlsx（Markdown 枢纽往返编辑）可编辑 */
const canEdit = computed(() => {
  if (!props.entry) return false
  if (['markdown', 'text', 'config', 'code'].includes(props.entry.kind)) return true
  return officeEditable(props.entry)
})

/**
 * 纯只读预览类（图片/PDF/音视频/pptx）——走 BinaryViewer，不显示编辑/保存。
 * docx/xlsx 虽由 viewerTypeFor 识别，但支持 Markdown 枢纽往返编辑，故排除在外。
 */
const isViewerKind = computed(() => {
  const v = viewerTypeFor(props.entry)
  return v !== null && !officeEditable(props.entry)
})

/** docx/xlsx：预览态复用 BinaryViewer 富渲染，编辑态走 Markdown 文本 */
const isOffice = computed(() => officeEditable(props.entry))

/** html/htm：预览走原生 webview 渲染（asset 协议 iframe），不走 Markdown 管道 */
const isHtml = computed(
  () => !!props.entry && ['html', 'htm'].includes((props.entry.ext || '').toLowerCase())
)
const htmlSrc = computed(() =>
  isHtml.value && props.entry ? convertFileSrc(props.entry.path) : ''
)

const editableTypes = ['markdown', 'text', 'config', 'code']

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
          v-if="canEdit"
          class="btn primary"
          :disabled="!dirty"
          @click="emit('save')"
        >{{ dirty ? '保存*' : '已保存' }}</button>
      </div>
    </div>

    <div class="pane-body">
      <!-- 图片 / PDF / 音视频 / office 文档 -->
      <BinaryViewer v-if="isViewerKind" :entry="entry" :viewer="viewer" />

      <template v-else-if="canEdit">
        <div class="content-area">
          <div v-if="tab === 'preview'" class="flex1">
            <!-- docx/xlsx：富渲染预览（mammoth / SheetJS），编辑在「编辑」页签 -->
            <BinaryViewer v-if="isOffice" :entry="entry" :viewer="viewer" />
            <!-- html：原生 webview 渲染（浏览器方式，脚本/相对资源照常加载） -->
            <iframe
              v-else-if="isHtml"
              class="html-frame"
              :src="htmlSrc"
              :title="entry?.name || 'HTML 预览'"
            ></iframe>
            <MdPreview v-else :content="content" :dirty="dirty" :base-path="basePath" />
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
