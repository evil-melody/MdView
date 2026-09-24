<script setup lang="ts">
import { ref, watch } from 'vue'
import { scanDirectory } from '../api'
import type { FileEntry } from '../types'
import FileTreeItem from './FileTreeItem.vue'
import { provide } from 'vue'
import './FileTree.css'

interface TreeNode {
  entry: FileEntry
  children: TreeNode[]
  loaded: boolean
  expanded: boolean
  loading: boolean
}

const props = defineProps<{
  roots: string[]
  activePath?: string
}>()

const emit = defineEmits<{
  (e: 'open-file', entry: FileEntry): void
  (e: 'add-root'): void
  (e: 'tree-context', entry: FileEntry, ev: MouseEvent): void
}>()
const rootNodes = ref<TreeNode[]>([])
const expandedRoot = ref('')

function basename(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts[parts.length - 1] || p
}

function toNode(entry: FileEntry): TreeNode {
  return { entry, children: [], loaded: false, expanded: false, loading: false }
}

async function loadChildren(node: TreeNode) {
  if (node.loaded || node.loading) return
  node.loading = true
  try {
    const entries = await scanDirectory(node.entry.path)
    node.children = entries.map(toNode)
    node.loaded = true
  } finally {
    node.loading = false
  }
}

async function toggle(node: TreeNode) {
  if (!node.entry.is_dir) return
  node.expanded = !node.expanded
  if (node.expanded) await loadChildren(node)
}

function onClick(node: TreeNode) {
  if (node.entry.is_dir) toggle(node)
  else emit('open-file', node.entry)
}

provide('ft-open-file', (entry: FileEntry) => emit('open-file', entry))
provide('ft-toggle', toggle)
provide('ft-active-path', () => props.activePath || '')
provide('ft-context', (entry: FileEntry, ev: MouseEvent) => emit('tree-context', entry, ev))

// config 异步加载 / 增删资料库时重建根节点，保留已展开根。
// 用 join 键值比较而非数组引用：addRoot 走的是 push 原地改数组，引用不变，
// 引用比较会导致「新加资料库后树不刷新」。
watch(
  () => props.roots.join('\u0000'),
  async () => {
    const prevExpanded = new Set(rootNodes.value.filter((n) => n.expanded).map((n) => n.entry.path))
    rootNodes.value = props.roots.map((r) =>
      toNode({
        name: basename(r),
        path: r,
        is_dir: true,
        ext: '',
        size: 0,
        modified: '',
        kind: 'folder'
      })
    )
    // 自动展开包含当前目录的根 + 恢复之前展开的根
    const active = props.activePath || ''
    for (const n of rootNodes.value) {
      if (active.startsWith(n.entry.path) || prevExpanded.has(n.entry.path)) {
        n.expanded = true
        expandedRoot.value = n.entry.path
        await loadChildren(n)
      }
    }
  },
  { immediate: true, flush: 'post' }
)
</script>

<template>
  <div class="ftree scrollable">
    <div v-if="!rootNodes.length" class="ft-empty">
      <div class="ft-empty-text">尚未添加资料库</div>
      <button class="ft-empty-btn" @click="emit('add-root')">＋ 添加资料库目录</button>
    </div>
    <FileTreeItem
      v-for="n in rootNodes"
      :key="n.entry.path"
      :node="n"
      :depth="0"
    />
  </div>
</template>
