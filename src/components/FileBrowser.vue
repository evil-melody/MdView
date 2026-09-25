<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FileEntry } from '../types'
import { KIND_LABEL } from '../types'
import FileTree from './FileTree.vue'
import FileIcon from './FileIcon.vue'
import { state } from '../store'

const props = defineProps<{
  currentDir: string
  entries: FileEntry[]
  searching?: boolean
  searchActive?: boolean
  query?: string
  mode?: 'browse' | 'flat'
  flatTitle?: string
  variant?: 'full' | 'side'
}>()

const emit = defineEmits<{
  (e: 'select', entry: FileEntry): void
  (e: 'delete', entry: FileEntry): void
  (e: 'rename', entry: FileEntry, name: string): void
  (e: 'up'): void
  (e: 'open-dir', path: string): void
  (e: 'search'): void
  (e: 'update:query', v: string): void
  (e: 'collapse-list'): void
  (e: 'entry-context', entry: FileEntry, ev: MouseEvent): void
}>()

const vFocus = {
  mounted: (el: HTMLElement) => el.focus()
}

const queryModel = computed({
  get: () => props.query || '',
  set: (v: string) => emit('update:query', v)
})

const renameTarget = ref('')
const renameValue = ref('')
const view = ref<'grid' | 'list'>('grid')
const sideView = ref<'list' | 'tree'>('list')

// 树视图根目录：包含当前目录的资料库优先，其余资料库跟随
const treeRoots = computed<string[]>(() =>
  state.config.scan_roots.length ? state.config.scan_roots : props.currentDir ? [props.currentDir] : []
)

const effectiveView = computed<'grid' | 'list'>(() =>
  props.variant === 'side' ? 'list' : view.value
)

const kindOrder = ['markdown', 'text', 'config', 'code', 'image', 'document', 'sheet', 'slide', 'pdf', 'audio', 'video', 'archive', 'other']

const sortedEntries = computed(() => {
  const arr = [...props.entries]
  if (props.mode === 'flat') {
    arr.sort((a, b) => (a.modified < b.modified ? 1 : -1))
    return arr
  }
  arr.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    const ka = a.kind === 'folder' ? -1 : kindOrder.indexOf(a.kind)
    const kb = b.kind === 'folder' ? -1 : kindOrder.indexOf(b.kind)
    if (ka !== kb && ka >= 0 && kb >= 0) return ka - kb
    return a.name.localeCompare(b.name, 'zh')
  })
  return arr
})

const breadcrumbs = computed(() => {
  const sep = props.currentDir.includes('\\') ? '\\' : '/'
  const parts = props.currentDir.split(/[/\\]/).filter(Boolean)
  let acc = ''
  return parts.map((p) => {
    // 绝对路径：首段补前导分隔符，保证每段可独立定位
    acc = acc ? acc + sep + p : (props.currentDir.startsWith('/') ? '/' : '') + p
    return { name: p, path: acc }
  })
})

function fmtSize(n: number): string {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

function startRename(e: FileEntry) {
  renameTarget.value = e.path
  renameValue.value = e.name
}

function confirmRename(e: FileEntry) {
  if (renameValue.value.trim() && renameValue.value !== e.name) {
    emit('rename', e, renameValue.value.trim())
  }
  renameTarget.value = ''
}

function focusSearch(e: MouseEvent) {
  const input = (e.currentTarget as HTMLElement).querySelector('input')
  input?.focus()
}
</script>

<template>
  <div class="fb" :class="{ side: variant === 'side' }">
    <div class="toolbar">
      <template v-if="variant === 'side'">
        <div class="crumbs scrollable">
          <span class="crumb" :title="currentDir">{{ currentDir.split('/').filter(Boolean).pop() || '文件' }}</span>
        </div>
        <div class="side-tools">
          <button
            class="st-btn"
            :class="{ on: sideView === 'list' }"
            title="当前目录列表"
            @click="sideView = 'list'"
          >☰</button>
          <button
            class="st-btn"
            :class="{ on: sideView === 'tree' }"
            title="目录树（多级展开）"
            @click="sideView = 'tree'"
          >🌲</button>
          <button class="st-btn" title="收起文件列表（点击边缘悬浮按钮可展开）" @click="emit('collapse-list')">»</button>
        </div>
      </template>
      <template v-else-if="mode !== 'flat'">
        <button class="btn ghost icon-btn" title="上级目录" @click="emit('up')">↑</button>
        <div class="crumbs scrollable">
          <template v-if="searchActive">
            <span class="crumb search-crumb">搜索结果 ({{ entries.length }})</span>
          </template>
          <template v-else>
            <span
              v-for="(c, i) in breadcrumbs"
              :key="c.path"
              class="crumb"
              :class="{ current: i === breadcrumbs.length - 1 }"
              :title="'定位到 ' + c.path"
              @click="emit('open-dir', c.path)"
            >{{ c.name }}<span v-if="i < breadcrumbs.length - 1" class="sep"> / </span></span>
          </template>
        </div>
        <div class="search-box" @click="focusSearch">
          <span class="sb-ico">🔍</span>
          <input
            v-model="queryModel"
            placeholder="搜索文件名 / 内容…"
            @keyup.enter="emit('search')"
          />
          <button class="btn primary search-go" @click="emit('search')">搜索</button>
        </div>
      </template>
      <template v-else>
        <div class="flat-title">
          {{ flatTitle }}<span class="flat-count">（{{ entries.length }} 项）</span>
        </div>
        <div class="toolbar-spacer"></div>
      </template>
      <div class="view-toggle" v-if="variant !== 'side'">
        <button class="vt" :class="{ on: view === 'grid' }" title="网格视图" @click="view = 'grid'">▦</button>
        <button class="vt" :class="{ on: view === 'list' }" title="列表视图" @click="view = 'list'">☰</button>
      </div>
    </div>

    <!-- 侧栏树视图：多级目录展开 -->
    <FileTree
      v-if="variant === 'side' && sideView === 'tree'"
      :roots="treeRoots"
      :active-path="currentDir"
      @open-file="(e) => emit('select', e)"
    />

    <div v-else-if="effectiveView === 'grid'" class="grid scrollable">
      <div v-if="!sortedEntries.length" class="empty">
        <div class="empty-emoji">📂</div>
        <p>{{ searchActive ? '没有匹配的结果' : mode === 'flat' ? '索引为空，请先在首页扫描目录' : '此文件夹为空，或尚未选择资料库文件夹' }}</p>
      </div>
      <div
        v-for="e in sortedEntries"
        v-else
        :key="e.path"
        class="card"
        :class="{ dir: e.is_dir }"
        @click="emit('select', e)"
        @dblclick="emit('select', e)"
        @contextmenu.prevent="emit('entry-context', e, $event)"
      >
        <div class="card-icon"><FileIcon :name="e.name" :is-dir="e.is_dir" :size="30" /></div>
        <div class="card-body">
          <div v-if="renameTarget === e.path" class="rename-wrap" @click.stop>
            <input
              v-model="renameValue"
              class="rename-input"
              @keyup.enter="confirmRename(e)"
              @blur="confirmRename(e)"
              v-focus
            />
          </div>
          <div v-else class="card-name" :title="e.path">{{ e.name }}</div>
          <div class="card-meta">
            <span class="tag">{{ KIND_LABEL[e.kind] || '其他' }}</span>
            <span v-if="!e.is_dir" class="size">{{ fmtSize(e.size) }}</span>
          </div>
          <div class="card-mod">{{ e.modified }}</div>
        </div>
        <div class="card-actions" @click.stop>
          <button class="mini" title="重命名" @click="startRename(e)">✎</button>
          <button class="mini danger" title="删除" @click="emit('delete', e)">🗑</button>
        </div>
      </div>
    </div>

    <div v-else class="list scrollable">
      <div v-if="!sortedEntries.length" class="empty">
        <div class="empty-emoji">📂</div>
        <p>{{ searchActive ? '没有匹配的结果' : '暂无文件' }}</p>
      </div>
      <div
        v-for="e in sortedEntries"
        v-else
        :key="e.path"
        class="row"
        @click="emit('select', e)"
        @contextmenu.prevent="emit('entry-context', e, $event)"
      >
        <span class="row-icon"><FileIcon :name="e.name" :is-dir="e.is_dir" :size="18" /></span>
        <span class="row-name" :title="e.path">{{ e.name }}</span>
        <span class="row-tag">{{ KIND_LABEL[e.kind] || '其他' }}</span>
        <span class="row-size">{{ e.is_dir ? '—' : fmtSize(e.size) }}</span>
        <span class="row-mod">{{ e.modified }}</span>
        <span class="row-actions" @click.stop>
          <button class="mini" @click="startRename(e)">✎</button>
          <button class="mini danger" @click="emit('delete', e)">🗑</button>
        </span>
      </div>
    </div>
  </div>
</template>

<style src="./FileBrowser.css"></style>
