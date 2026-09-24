<script setup lang="ts">
import { computed } from 'vue'
import { state, kindCounts } from '../store'
import type { PageKey } from '../store'
import { KIND_LABEL } from '../types'

const emit = defineEmits<{
  (e: 'navigate', page: PageKey, kind?: string): void
  (e: 'rescan'): void
  (e: 'open-settings'): void
  (e: 'open-root', root: string): void
  (e: 'add-root'): void
}>()

const counts = computed(() => kindCounts())
const total = computed(() => state.indexEntries.length)
const categoryKinds = computed(() => Object.keys(counts.value).length)

const recentCount = computed(() => {
  const week = Date.now() - 7 * 24 * 3600 * 1000
  return state.indexEntries.filter((e) => {
    if (!e.modified) return false
    return new Date(e.modified.replace(' ', 'T')).getTime() > week
  }).length
})

function shortName(r: string): string {
  const parts = r.split('/').filter(Boolean)
  return parts[parts.length - 1] || r
}

function isRootActive(r: string): boolean {
  return !!state.currentDir && state.currentDir.startsWith(r)
}

const quick = [
  { icon: '📁', title: '文件浏览', desc: '浏览与打开已索引目录的全部文件', action: 'files' },
  { icon: '📝', title: 'Markdown 工作台', desc: '预览、编辑与脑图，所见即所得', action: 'category:markdown' },
  { icon: '🔍', label: '', title: '文件检索', desc: '按文件名或内容关键词搜索', action: 'files' },
  { icon: '🕐', title: '最近更新', desc: '快速定位最近修改过的文件', action: 'recent' }
]

function go(action: string) {
  if (action.startsWith('category:')) {
    emit('navigate', 'category', action.split(':')[1])
  } else {
    emit('navigate', action as PageKey)
  }
}
</script>

<template>
  <div class="home scrollable">
    <div class="hero card-panel">
      <div class="hero-title">欢迎使用 MdView</div>
      <div class="hero-sub">本地文件浏览 · Markdown 预览 / 编辑 / 脑图 · 远程 AI 摘要与打标</div>
    </div>

    <div class="stats">
      <div class="stat card-panel"><div class="sv purple">{{ total }}</div><div class="sl">总文件数</div></div>
      <div class="stat card-panel"><div class="sv green">{{ counts.markdown || 0 }}</div><div class="sl">Markdown 文档</div></div>
      <div class="stat card-panel"><div class="sv blue">{{ categoryKinds }}</div><div class="sl">文件分类</div></div>
      <div class="stat card-panel"><div class="sv orange">{{ recentCount }}</div><div class="sl">最近 7 天更新</div></div>
    </div>

    <div class="card-panel block">
      <div class="block-title">🗂 资料库（{{ state.config.scan_roots.length }}）</div>
      <template v-if="state.config.scan_roots.length">
        <div class="root-list">
          <div
            v-for="r in state.config.scan_roots"
            :key="r"
            class="root-row"
            :class="{ active: isRootActive(r) }"
            :title="'浏览 ' + r"
            @click="emit('open-root', r)"
          >
            <span class="rr-icon">📚</span>
            <span class="rr-name">{{ shortName(r) }}</span>
            <span class="rr-path">{{ r }}</span>
            <span class="rr-go">进入 →</span>
          </div>
        </div>
      </template>
      <div v-else class="root-path">（尚未设置）</div>
      <div class="root-actions">
        <button class="btn primary" @click="emit('add-root')">➕ 添加资料库</button>
        <button class="btn" :disabled="!state.config.scan_roots.length" @click="emit('rescan')">🔄 重新扫描索引</button>
        <button class="btn" @click="emit('open-settings')">管理设置</button>
      </div>
      <div class="hint">点击任意资料库行可直接定位浏览；添加多个目录后索引与搜索会覆盖全部资料库。</div>
    </div>

    <div class="quick-grid">
      <div v-for="q in quick" :key="q.title" class="quick card-panel" @click="go(q.action)">
        <div class="q-icon">{{ q.icon }}</div>
        <div class="q-title">{{ q.title }}</div>
        <div class="q-desc">{{ q.desc }}</div>
      </div>
    </div>

    <div class="card-panel block">
      <div class="block-title">⚡ 快速帮助</div>
      <div class="help-grid">
        <div class="help-item"><b>1 首次使用</b><span>设置 → 添加资料库 → 扫描索引</span></div>
        <div class="help-item"><b>2 浏览文件</b><span>左侧分类或「全部文件」进入浏览</span></div>
        <div class="help-item"><b>3 编辑 / 脑图</b><span>点开 Markdown 文件，切换 编辑 / 脑图</span></div>
        <div class="help-item"><b>4 AI 功能</b><span>设置中配置远程 API 后可用摘要与打标</span></div>
      </div>
    </div>
  </div>
</template>

<style src="./HomePage.css"></style>
