<script setup lang="ts">
import { computed } from 'vue'
import { state, kindCounts, type PageKey } from '../store'
import { KIND_LABEL } from '../types'
import type { FileEntry } from '../types'
import logoUrl from '../assets/logo.png'
import FileTree from './FileTree.vue'

defineProps<{ theme: 'dark' | 'light' }>()

const emit = defineEmits<{
  (e: 'navigate', page: PageKey, kind?: string): void
  (e: 'search'): void
  (e: 'open-settings'): void
  (e: 'ai-action', action: string): void
  (e: 'add-root'): void
  (e: 'collapse'): void
  (e: 'open-entry', entry: FileEntry): void
  (e: 'entry-context', entry: FileEntry, ev: MouseEvent): void
  (e: 'toggle-theme'): void
  (e: 'manage-roots'): void
}>()

const counts = computed(() => kindCounts())

const categoryOrder = ['markdown', 'document', 'sheet', 'slide', 'pdf', 'image', 'text', 'code', 'config', 'archive', 'video', 'audio', 'other']
const categoryIcons: Record<string, string> = {
  markdown: '📝',
  document: '📃',
  sheet: '📊',
  slide: '📽',
  pdf: '📕',
  image: '🖼',
  text: '📄',
  code: '</>',
  config: '⚙',
  archive: '🗜',
  video: '🎬',
  audio: '🎵',
  other: '📦'
}

const categories = computed(() =>
  categoryOrder
    .filter((k) => (counts.value[k] || 0) > 0)
    .map((k) => ({ kind: k, label: KIND_LABEL[k] || k, icon: categoryIcons[k], count: counts.value[k] }))
)

const totalCount = computed(() => state.indexEntries.length)

const aiLabel = computed(() =>
  state.config.ai.enabled ? `AI 已启用 · ${state.config.ai.model}` : 'AI 未启用（去设置）'
)

function focusSearch(e: MouseEvent) {
  const input = (e.currentTarget as HTMLElement).querySelector('input')
  input?.focus()
}

</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <img class="logo-img" :src="logoUrl" alt="MdView" @click="emit('navigate', 'home')" />
      <div class="brand-text" @click="emit('navigate', 'home')">
        <div class="brand-name">MdView</div>
        <div class="brand-sub">本地文件与 Markdown 工作台</div>
      </div>
      <button class="brand-collapse" title="收起侧栏（点击左边缘悬浮按钮展开）" @click="emit('collapse')">«</button>
    </div>

    <div class="search-box" @click="focusSearch">
      <span class="search-ico">🔍</span>
      <input
        v-model="state.searchQuery"
        placeholder="搜索文件名与内容…"
        @keyup.enter="emit('search')"
      />
    </div>

    <nav class="nav scrollable">
      <div class="nav-item" :class="{ active: state.page === 'home' }" @click="emit('navigate', 'home')">
        <span class="ni">⭐</span><span class="nl">首页</span>
      </div>
      <div class="nav-item" :class="{ active: state.page === 'files' }" @click="emit('navigate', 'files')">
        <span class="ni">📁</span><span class="nl">全部文件</span>
        <span class="count green" v-if="totalCount">{{ totalCount }}</span>
      </div>
      <div class="nav-item" :class="{ active: state.page === 'recent' }" @click="emit('navigate', 'recent')">
        <span class="ni">🕐</span><span class="nl">最近更新</span>
      </div>

      <div class="section-label section-head">
        <span>资料库</span>
        <button class="add-btn" title="管理资料库（添加 / 移除目录）" @click.stop="emit('manage-roots')">＋</button>
      </div>
      <FileTree
        class="kb-tree"
        :roots="state.config.scan_roots"
        :active-path="state.currentDir"
        @open-file="(e) => emit('open-entry', e)"
        @add-root="emit('add-root')"
        @tree-context="(e, ev) => emit('entry-context', e, ev)"
      />

      <template v-if="categories.length">
        <div class="section-label">分类</div>
        <div
          v-for="c in categories"
          :key="c.kind"
          class="nav-item"
          :class="{ active: state.page === 'category' && state.categoryKind === c.kind }"
          @click="emit('navigate', 'category', c.kind)"
        >
          <span class="ni">{{ c.icon }}</span><span class="nl">{{ c.label }}</span>
          <span class="count">{{ c.count }}</span>
        </div>
      </template>

      <div class="section-label">AI 功能</div>
      <div class="nav-item" :class="{ disabled: !state.config.ai.enabled }" @click="emit('ai-action', 'summary')">
        <span class="ni">🧠</span><span class="nl">AI 文件摘要</span>
      </div>
      <div class="nav-item" :class="{ disabled: !state.config.ai.enabled }" @click="emit('ai-action', 'tags')">
        <span class="ni">🏷</span><span class="nl">AI 自动打标</span>
      </div>

      <div class="section-label">工具</div>
      <div class="nav-item" :class="{ active: state.page === 'help' }" @click="emit('navigate', 'help')">
        <span class="ni">📖</span><span class="nl">帮助文档</span>
      </div>
      <div class="nav-item" @click="emit('open-settings')">
        <span class="ni">⚙</span><span class="nl">设置</span>
      </div>
    </nav>

    <div class="status">
      <button
        class="theme-toggle"
        :title="theme === 'dark' ? '切换浅色主题' : '切换深色主题'"
        @click="emit('toggle-theme')"
      >{{ theme === 'dark' ? '☀️' : '🌙' }}</button>
      <span class="status-dot" :class="state.config.ai.enabled ? 'on' : 'off'"></span>
      <span class="status-text">{{ aiLabel }}</span>
    </div>
  </aside>
</template>

<style src="./Sidebar.css"></style>
