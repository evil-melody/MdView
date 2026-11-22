<script setup lang="ts">
/** JSON 专用区：左侧源码可编辑，右侧格式化树实时跟随；格式化 / 压缩互转 */
import { ref, computed } from 'vue'
import CodeEditor from './CodeEditor.vue'

const props = defineProps<{ content: string; path: string }>()
const emit = defineEmits<{
  (e: 'update:content', v: string): void
  (e: 'dirty'): void
  /** 工具条格式化 / 压缩：由外层统一变换，避免两套实现 */
  (e: 'transform', compact: boolean): void
}>()

const MAX_ROWS = 2000
interface Row {
  path: string
  depth: number
  key: string
  preview: string
  cls: string
  hasChildren: boolean
  open: boolean
  count?: number
}

const collapsed = ref(new Set<string>())
const parsed = computed(() => {
  try {
    return { ok: true as const, value: JSON.parse(props.content) as unknown }
  } catch (e) {
    return { ok: false as const, error: String(e instanceof Error ? e.message : e) }
  }
})

function scalar(v: unknown): { text: string; cls: string } {
  if (v === null) return { text: 'null', cls: 'jv-null' }
  const t = typeof v
  if (t === 'string') return { text: JSON.stringify(v), cls: 'jv-str' }
  if (t === 'number') return { text: String(v), cls: 'jv-num' }
  if (t === 'boolean') return { text: String(v), cls: 'jv-bool' }
  return { text: String(v), cls: 'jv-val' }
}

function walk(v: unknown, key: string, depth: number, path: string, out: Row[]) {
  if (out.length >= MAX_ROWS) return
  const isArr = Array.isArray(v)
  const isObj = !!v && typeof v === 'object'
  if (!isArr && !isObj) {
    const s = scalar(v)
    out.push({ path, depth, key, preview: s.text, cls: s.cls, hasChildren: false, open: false })
    return
  }
  const entries: [string, unknown][] = isArr
    ? (v as unknown[]).map((x, i) => [String(i), x])
    : Object.entries(v as Record<string, unknown>)
  const open = !collapsed.value.has(path)
  out.push({
    path, depth, key,
    preview: open ? (isArr ? '[' : '{') : (isArr ? '[ … ]' : '{ … }'),
    cls: 'jv-brace', hasChildren: true, open, count: entries.length,
  })
  if (!open) return
  for (const [k, val] of entries) {
    if (out.length >= MAX_ROWS) break
    walk(val, k, depth + 1, path + '/' + k, out)
  }
  if (out.length < MAX_ROWS) {
    out.push({ path: path + '#end', depth, key: '', preview: isArr ? ']' : '}', cls: 'jv-brace', hasChildren: false, open: false })
  }
}

const rows = computed<Row[]>(() => {
  if (!parsed.value.ok) return []
  const out: Row[] = []
  walk(parsed.value.value, '', 0, '$', out)
  return out
})
const truncated = computed(() => rows.value.length >= MAX_ROWS)

/** 收集所有容器路径，供「全折叠」一次收起 */
function containerPaths(v: unknown, path: string, out: string[]) {
  if (!v || typeof v !== 'object' || out.length >= MAX_ROWS) return
  out.push(path)
  const entries: [string, unknown][] = Array.isArray(v)
    ? (v as unknown[]).map((x, i) => [String(i), x])
    : Object.entries(v as Record<string, unknown>)
  for (const [k, val] of entries) containerPaths(val, path + '/' + k, out)
}

function toggle(p: string) {
  const next = new Set(collapsed.value)
  if (next.has(p)) next.delete(p)
  else next.add(p)
  collapsed.value = next
}
function expandAll() { collapsed.value = new Set() }
function collapseAll() {
  if (!parsed.value.ok) return
  const out: string[] = []
  containerPaths(parsed.value.value, '$', out)
  collapsed.value = new Set(out)
}

/** 工具条作用于全文；选区变换由外层右键菜单统一处理 */
function apply(compact: boolean) {
  emit('transform', compact)
}

const stat = computed(() => {
  const s = props.content
  return `${s.length.toLocaleString()} 字符 · ${s.split('\n').length.toLocaleString()} 行`
})
</script>

<template>
  <div class="jv">
    <div class="jv-bar">
      <span class="jv-title">JSON</span>
      <button class="btn" title="把源码排版成缩进格式" @click="apply(false)">格式化</button>
      <button class="btn" title="把源码压成一长串" @click="apply(true)">压缩</button>
      <span class="jv-sep"></span>
      <button class="btn" title="展开全部节点" @click="expandAll">全展开</button>
      <button class="btn" title="收起全部节点" @click="collapseAll">全折叠</button>
      <span class="jv-stat">{{ stat }}</span>
      <span v-if="parsed.ok" class="jv-ok">合法 JSON</span>
      <span v-else class="jv-err" :title="parsed.error">解析失败</span>
    </div>
    <div class="jv-split">
      <div class="jv-left">
        <CodeEditor
          :content="content"
          :path="path"
          @change="emit('dirty')"
          @update:content="(v: string) => emit('update:content', v)"
        />
      </div>
      <div class="jv-divider"></div>
      <div class="jv-right scrollable">
        <div v-if="!parsed.ok" class="jv-fail">
          <p>右侧树需要合法 JSON：{{ parsed.error }}</p>
          <p>可先在左侧修正源码，或选中一段 JSON 后右键格式化。</p>
        </div>
        <div v-else v-for="r in rows" :key="r.path" class="jv-row" :class="'jv-d' + Math.min(r.depth, 8)">
          <button v-if="r.hasChildren" class="jv-toggle" :title="r.open ? '收起' : '展开'" @click="toggle(r.path)">
            {{ r.open ? '▾' : '▸' }}
          </button>
          <span v-else class="jv-toggle jv-leaf"></span>
          <span v-if="r.key" class="jv-key">{{ r.key }}</span>
          <span v-if="r.key" class="jv-colon">:</span>
          <span :class="r.cls">{{ r.preview }}</span>
          <span v-if="r.count !== undefined && r.open" class="jv-count">{{ r.count }}</span>
        </div>
        <div v-if="truncated" class="jv-more">仅显示前 {{ MAX_ROWS }} 行，可折叠节点继续查看</div>
      </div>
    </div>
  </div>
</template>

<style src="./JsonView.css" scoped></style>
