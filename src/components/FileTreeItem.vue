<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import type { FileEntry } from '../types'
import FileIcon from './FileIcon.vue'

interface TreeNode {
  entry: FileEntry
  children: TreeNode[]
  loaded: boolean
  expanded: boolean
  loading: boolean
}

const props = defineProps<{
  node: TreeNode
  depth: number
}>()

const openFile = inject<(e: FileEntry) => void>('ft-open-file', () => {})
const toggle = inject<(n: TreeNode) => void>('ft-toggle', () => {})
const getActivePath = inject<() => string>('ft-active-path', () => '')
const onContext = inject<((e: FileEntry, ev: MouseEvent) => void) | undefined>('ft-context', undefined)
// 主面板「移除资料库」：仅根节点（depth===0）提供，点击仅注销配置、不删文件夹
const onRemoveRoot = inject<((p: string) => void) | undefined>('ft-remove-root', undefined)

const activePath = ref(getActivePath())

const sorted = computed(() => {
  const dirs = props.node.children.filter((c) => c.entry.is_dir)
  const files = props.node.children.filter((c) => !c.entry.is_dir)
  const byName = (a: TreeNode, b: TreeNode) => a.entry.name.localeCompare(b.entry.name, 'zh')
  return [...dirs.sort(byName), ...files.sort(byName)]
})

function onClick() {
  if (props.node.entry.is_dir) toggle(props.node)
  else openFile(props.node.entry)
}

// 激活路径变化时刷新高亮
watch(getActivePath, (v) => (activePath.value = v || ''))
</script>

<template>
  <div class="ft-node">
    <div
      class="ft-row"
      :class="{ active: node.entry.path === activePath, root: depth === 0 }"
      :style="{ paddingLeft: depth * 13 + 6 + 'px' }"
      :title="node.entry.path"
      @click="onClick"
      @contextmenu.prevent="onContext?.(node.entry, $event)"
    >
      <span class="ft-arrow" :class="{ vis: node.entry.is_dir }">
        {{ node.loading ? '⏳' : node.expanded ? '▾' : '▸' }}
      </span>
      <span class="ft-ico"><FileIcon :name="node.entry.name" :is-dir="node.entry.is_dir" :size="15" /></span>
      <span class="ft-name">{{ node.entry.name }}</span>
      <button
        v-if="depth === 0 && onRemoveRoot"
        class="ft-remove"
        title="从资料库移除（仅注销，不删除文件夹）"
        @click.stop="onRemoveRoot(node.entry.path)"
      >✕</button>
    </div>
    <template v-if="node.expanded && node.loaded">
      <FileTreeItem
        v-for="c in sorted"
        :key="c.entry.path"
        :node="c"
        :depth="depth + 1"
      />
    </template>
  </div>
</template>
