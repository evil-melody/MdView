<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue'
import { scanDirectory } from '../api'
import { state } from '../store'
import type { FileEntry } from '../types'
import FileTreeItem from './FileTreeItem.vue'
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
  /** 非空时切换为过滤视图：用全量索引按名字/路径匹配，命中文件按目录分组自动展开 */
  filter?: string
}>()

const emit = defineEmits<{
  (e: 'open-file', entry: FileEntry): void
  (e: 'open-dir', entry: FileEntry): void
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

/**
 * 重扫已加载节点，保留展开态。
 * 节点按路径复用而非重建：重建会把展开的子树折叠回去。
 * 改名/删除的节点路径不再匹配，自然从父节点 children 中消失。
 */
async function refreshLoaded(nodes: TreeNode[]) {
  for (const n of nodes) {
    if (!n.loaded || n.loading) continue
    const prev = new Map(n.children.map((c) => [c.entry.path, c]))
    const entries = await scanDirectory(n.entry.path)
    n.children = entries.map((e) => {
      const old = prev.get(e.path)
      if (!old) return toNode(e)
      old.entry = e
      return old
    })
    await refreshLoaded(n.children)
  }
}

/** 目录点击：展开/折叠 + 右侧切到该目录，左右一致。子节点与根节点共用此入口 */
function onDirClick(node: TreeNode) {
  toggle(node)
  emit('open-dir', node.entry)
}

function onClick(node: TreeNode) {
  if (node.entry.is_dir) onDirClick(node)
  else emit('open-file', node.entry)
}

provide('ft-open-file', (entry: FileEntry) => emit('open-file', entry))
provide('ft-toggle', onDirClick)
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

// 右侧增删改 / 手动刷新后同步左侧树
watch(
  () => state.treeVersion,
  () => refreshLoaded(rootNodes.value),
  { flush: 'post' }
)

// ---- 搜索过滤视图（基于全量索引，不扫盘） ----
const FILTER_RENDER_CAP = 400

function dirEntry(path: string, name: string): FileEntry {
  return { name, path, is_dir: true, ext: '', size: 0, modified: '', kind: 'folder' }
}

/**
 * 命中判定：文件名 / 路径 / AI 摘要。
 * 摘要是语义层——「合同风险」这类词正文里未必出现，但摘要会命中。
 */
function matchesQuery(e: FileEntry, q: string): boolean {
  const name = (e.name || basename(e.path)).toLowerCase()
  if (name.includes(q) || e.path.toLowerCase().includes(q)) return true
  const s = state.summaries[e.path]?.summary
  return !!s && s.toLowerCase().includes(q)
}

/** 命中文件按目录链分组；目录节点预展开、预加载，不触发 scanDirectory */
const filteredRoots = computed<TreeNode[] | null>(() => {
  const q = props.filter?.trim().toLowerCase()
  if (!q) return null
  const rootPaths = [...props.roots].sort((a, b) => b.length - a.length)
  const rootOf = new Map<string, TreeNode>()
  const dirNodes = new Map<string, TreeNode>()

  function dirNodeFor(path: string): TreeNode | null {
    // 归属到最长的匹配资料库根；根外部的文件不显示
    const rootPath = rootPaths.find((r) => path === r || path.startsWith(r.replace(/[/\\]$/, '') + '/') || path.startsWith(r + '\\'))
    if (!rootPath) return null
    let rootNode = rootOf.get(rootPath)
    if (!rootNode) {
      rootNode = toNode(dirEntry(rootPath, basename(rootPath)))
      rootNode.loaded = true
      rootNode.expanded = true
      rootOf.set(rootPath, rootNode)
    }
    if (path === rootPath) return rootNode
    // 逐级建父目录链
    const segs = path.slice(rootPath.replace(/[/\\]$/, '').length + 1).split(/[/\\]/).filter(Boolean)
    let cur = rootNode
    let acc = rootPath.replace(/[/\\]$/, '')
    for (const seg of segs) {
      acc = acc + '/' + seg
      let next = dirNodes.get(acc)
      if (!next) {
        next = toNode(dirEntry(acc, seg))
        next.loaded = true
        next.expanded = true
        dirNodes.set(acc, next)
        cur.children.push(next)
      }
      cur = next
    }
    return cur
  }

  let matchCount = 0
  for (const e of state.indexEntries) {
    if (e.is_dir) continue
    if (!matchesQuery(e, q)) continue
    matchCount++
    if (matchCount > FILTER_RENDER_CAP) continue // 超上限仍计数，但不再渲染
    const parent = dirNodeFor(e.path.slice(0, Math.max(e.path.lastIndexOf('/'), e.path.lastIndexOf('\\'))))
    if (parent) parent.children.push(toNode(e))
  }
  if (!matchCount) return []
  return [...rootOf.values()]
})

const filterActive = computed(() => !!props.filter?.trim())
const filterTotal = computed(() => {
  const q = props.filter?.trim().toLowerCase()
  if (!q) return 0
  return state.indexEntries.filter((e) => !e.is_dir && matchesQuery(e, q)).length
})
</script>

<template>
  <div class="ftree scrollable">
    <!-- 过滤视图：搜索词非空时用索引命中结果替代懒加载树 -->
    <template v-if="filterActive">
      <div class="ft-filter-head">
        {{ filterTotal ? `搜索命中 ${filterTotal} 项` : '搜索中…' }}
      </div>
      <div v-if="!filteredRoots?.length" class="ft-empty">
        <div class="ft-empty-text">无匹配文件</div>
      </div>
      <FileTreeItem
        v-for="n in filteredRoots || []"
        :key="n.entry.path"
        :node="n"
        :depth="0"
      />
    </template>
    <template v-else>
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
    </template>
  </div>
</template>
