<script setup lang="ts">
/**
 * AI 浮窗组件：右下角 FAB 触发，展开为可流式输出的 AI 助手抽屉。
 * - collapsed：只显示 FAB（圆形 AI 图标，右下角浮动）
 * - expanded：浮窗显示，FAB 隐藏；流式增量通过父组件 props.result 实时渲染
 * - minimize：浮窗头部「—」按钮折叠回 FAB
 * - close：浮窗头部「×」按钮折叠回 FAB（与 minimize 行为一致，保留两个按钮语义清晰）
 */
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  /** 浮窗是否展开（v-model） */
  open: boolean
  /** AI 是否启用（禁用则整个 FAB + 浮窗都不显示） */
  enabled: boolean
  /** 当前任务标题 */
  title: string
  /** 累积的流式输出文本 */
  result: string
  /** 是否正在生成（控制光标动画 + 按钮禁用） */
  busy: boolean
  /** 是否有可用的当前内容（无内容时禁用任务按钮） */
  canRun: boolean
  /** 模型标签（头部副标题，如 "agnes-2.0-flash"） */
  modelLabel?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'task', taskKey: 'summary' | 'tags' | 'explain'): void
}>()

const tasks: Array<{ key: 'summary' | 'tags' | 'explain'; label: string }> = [
  { key: 'summary', label: '智能摘要' },
  { key: 'tags', label: '生成标签' },
  { key: 'explain', label: '内容解读' }
]

function expand() {
  emit('update:open', true)
}
function minimize() {
  emit('update:open', false)
}
function runTask(key: 'summary' | 'tags' | 'explain') {
  emit('task', key)
}

const bodyEl = ref<HTMLDivElement | null>(null)
/** 流式追加时自动滚到底部（仅当用户已贴底时才跟随；手动上滚后不再强制拉回） */
const stickToBottom = ref(true)
function onBodyScroll(e: Event) {
  const el = e.target as HTMLDivElement
  const dist = el.scrollHeight - el.scrollTop - el.clientHeight
  stickToBottom.value = dist < 24
}
watch(
  () => props.result,
  () => {
    if (!stickToBottom.value) return
    nextTick(() => {
      const el = bodyEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }
)
const hasResult = computed(() => props.result.length > 0)
</script>

<template>
  <!-- FAB：仅在 enabled 且未展开时显示 -->
  <button
    v-if="enabled && !open"
    class="ai-fab"
    title="AI 助手"
    @click="expand"
  >
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M12 2l1.7 4.6L18 8l-4.3 1.4L12 14l-1.7-4.6L6 8l4.3-1.4L12 2zm5 11l1 2.6 2.6 1-2.6 1L17 20l-1-2.4-2.6-1 2.6-1L17 13zM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14z"
        fill="currentColor"
      />
    </svg>
  </button>

  <!-- 浮窗 -->
  <transition name="ai-pop">
    <div v-if="enabled && open" class="ai-float" role="dialog" aria-label="AI 助手">
      <div class="ai-head">
        <div class="ai-head-left">
          <span class="ai-title">{{ title || 'AI 助手' }}</span>
          <span v-if="modelLabel" class="ai-model">{{ modelLabel }}</span>
        </div>
        <div class="ai-head-actions">
          <button class="ai-head-btn" title="折叠到右下角" @click="minimize">—</button>
          <button class="ai-head-btn" title="关闭" @click="minimize">×</button>
        </div>
      </div>

      <div ref="bodyEl" class="ai-body scrollable" @scroll="onBodyScroll">
        <div v-if="busy && !hasResult" class="ai-loading">AI 生成中…</div>
        <pre v-else-if="hasResult" class="ai-text">{{ result }}<span v-if="busy" class="ai-caret">▌</span></pre>
        <div v-else class="ai-empty">点击下方按钮，让 AI 分析当前打开的内容。</div>
      </div>

      <div class="ai-foot">
        <button
          v-for="t in tasks"
          :key="t.key"
          class="btn ghost ai-task"
          :disabled="!canRun || busy"
          @click="runTask(t.key)"
        >{{ t.label }}</button>
      </div>
    </div>
  </transition>
</template>

<style src="./AiDrawer.css"></style>