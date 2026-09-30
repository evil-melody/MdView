<script setup lang="ts">
/**
 * Deck panel: the slide-level state that has no place on the canvas.
 *
 * Two modes share one shell because they are both "edit the container, not the elements":
 *  - `notes` 幻灯片备注 / 切换效果 / 自动换片 / 隐藏幻灯片
 *  - `find`  整篇或当前页的查找替换
 *
 * Notes live in their own `notesSlideN.xml` part (the render tree never sees them) and transitions
 * are a slide attribute — both are read back from the document through `PptxDocument.slideMeta`, so
 * the panel is a pure view that emits `EditorAction`s.
 */
import { computed, ref, watch } from 'vue'
import type { EditorAction, FindScope, SlideState } from '../pptx/actions'
import { TRANSITION_ITEMS } from '../pptx/actions'
import type { TransitionKind } from '../pptx/ops'

const props = defineProps<{
  mode: 'notes' | 'find'
  slideIndex: number
  slideCount: number
  state: SlideState
  /** outcome line for the last run (count / failure reason), owned by the container */
  message?: string
  busy?: boolean
}>()

const emit = defineEmits<{
  (e: 'action', a: EditorAction): void
  (e: 'close'): void
}>()

const notes = ref('')
const autoSeconds = ref(0)
const find = ref('')
const replace = ref('')
const matchCase = ref(false)
const scope = ref<FindScope>('deck')

watch(
  () => props.state,
  (s) => {
    notes.value = s.notes
    autoSeconds.value = s.advanceMs ? Math.round(s.advanceMs / 100) / 10 : 0
  },
  { immediate: true, deep: true }
)

const transition = computed(() => props.state.transition)

function onTransition(ev: Event) {
  const value = (ev.target as HTMLSelectElement).value as TransitionKind
  emit('action', { kind: 'slide.transition', value })
}

function commitNotes() {
  if (notes.value === props.state.notes) return
  emit('action', { kind: 'slide.notes', value: notes.value })
}

function commitAuto() {
  const s = Number(autoSeconds.value)
  const ms = Number.isFinite(s) && s > 0 ? Math.round(s * 1000) : null
  if (ms === props.state.advanceMs) return
  emit('action', { kind: 'slide.advance', value: ms })
}

function runFind() {
  if (!find.value) return
  emit('action', {
    kind: 'deck.findReplace',
    find: find.value,
    replace: replace.value,
    matchCase: matchCase.value,
    scope: scope.value
  })
}
</script>

<template>
  <div class="ppte-deck">
    <template v-if="mode === 'notes'">
      <div class="ppte-deck-row">
        <span class="ppte-deck-tag">幻灯片 {{ slideIndex + 1 }} / {{ slideCount }}</span>
        <label class="ppte-deck-field">
          切换
          <select :value="transition" :disabled="busy" @change="onTransition">
            <option v-for="t in TRANSITION_ITEMS" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
        </label>
        <label class="ppte-deck-field">
          自动换片
          <input
            v-model.number="autoSeconds"
            class="ppte-deck-num"
            type="number"
            min="0"
            step="0.5"
            :disabled="busy"
            @change="commitAuto"
          />
          秒
        </label>
        <label class="ppte-deck-check">
          <input
            type="checkbox"
            :checked="state.hidden"
            :disabled="busy"
            @change="emit('action', { kind: 'slide.hidden', value: ($event.target as HTMLInputElement).checked })"
          />
          隐藏此页（放映时跳过）
        </label>
        <button class="ppte-deck-x" title="收起" @click="emit('close')">×</button>
      </div>
      <textarea
        v-model="notes"
        class="ppte-deck-notes"
        rows="3"
        placeholder="演讲者备注（保存在 notesSlide，导出/放映时可用）"
        :disabled="busy"
        @blur="commitNotes"
      ></textarea>
    </template>

    <template v-else>
      <div class="ppte-deck-row">
        <input v-model="find" class="ppte-deck-in" placeholder="查找" :disabled="busy" @keydown.enter="runFind" />
        <input
          v-model="replace"
          class="ppte-deck-in"
          placeholder="替换为"
          :disabled="busy"
          @keydown.enter="runFind"
        />
        <select v-model="scope" class="ppte-deck-field" :disabled="busy">
          <option value="deck">整篇</option>
          <option value="slide">当前页</option>
        </select>
        <label class="ppte-deck-check">
          <input v-model="matchCase" type="checkbox" :disabled="busy" />
          区分大小写
        </label>
        <button class="ppte-deck-go" :disabled="busy" @click="runFind">全部替换</button>
        <button class="ppte-deck-x" title="收起" @click="emit('close')">×</button>
      </div>
      <div v-if="message" class="ppte-deck-result">{{ message }}</div>
    </template>
  </div>
</template>

<style src="./PptxDeckPanel.css" scoped></style>
