<script setup lang="ts">
/** 「序列」对话框（仿 Office）：序列产生在（行/列）、类型（等差/等比/日期/自动填充）、
 *  日期单位（日/工作日/月/年）、步长值、终止值。单选一律自绘圆点控件；确定后由内核 series op 生成。 */
import { reactive, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { Range } from '../core/xlsx/types'

export interface SeriesParams {
  dir: 'row' | 'col'
  type: 'linear' | 'growth' | 'date' | 'auto'
  unit: 'day' | 'weekday' | 'month' | 'year'
  step: number
  stop?: number
}

const props = defineProps<{ open: boolean; selRange: Range; date1904?: boolean }>()
const emit = defineEmits<{ (e: 'confirm', p: SeriesParams): void; (e: 'cancel'): void }>()

const DIRS: { k: 'row' | 'col'; label: string }[] = [{ k: 'row', label: '行' }, { k: 'col', label: '列' }]
const TYPES: { k: SeriesParams['type']; label: string }[] = [
  { k: 'linear', label: '等差序列' }, { k: 'growth', label: '等比序列' },
  { k: 'date', label: '日期' }, { k: 'auto', label: '自动填充' }
]
const UNITS: { k: SeriesParams['unit']; label: string }[] = [
  { k: 'day', label: '日' }, { k: 'weekday', label: '工作日' }, { k: 'month', label: '月' }, { k: 'year', label: '年' }
]

const draft = reactive({ dir: 'col' as SeriesParams['dir'], type: 'linear' as SeriesParams['type'], unit: 'day' as SeriesParams['unit'], step: '1', stop: '' })
/** 步长/终止值：自绘可编辑块（contenteditable，不用原生 input/select/checkbox/radio） */
const stepEl = ref<HTMLElement | null>(null)
const stopEl = ref<HTMLElement | null>(null)
const readEdit = (e: Event) => (e.target as HTMLElement).textContent ?? ''

watch(() => props.open, (v) => {
  if (!v) return
  const g = props.selRange
  // Office 式预填：宽选区默认按行，高选区默认按列
  draft.dir = g.c1 - g.c0 >= g.r1 - g.r0 ? 'row' : 'col'
  draft.type = 'linear'
  draft.unit = 'day'
  draft.step = '1'
  draft.stop = ''
  void nextTick(() => {
    if (stepEl.value) stepEl.value.textContent = draft.step
    if (stopEl.value) stopEl.value.textContent = draft.stop
  })
})

function stepNum() {
  const n = Number(draft.step)
  return Number.isFinite(n) ? n : 1
}
/** 终止值：日期类型按日期文本解析成序列值；留空则不设上限 */
function stopNum(): number | undefined {
  const t = draft.stop.trim()
  if (!t) return undefined
  if (draft.type === 'date') {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
    const ms = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Date.parse(t)
    // 1970-01-01 在 1900 系统是 serial 25569、1904 系统是 24107（相差 1462 天）
    return Number.isFinite(ms) ? ms / 86400000 + (props.date1904 ? 24107 : 25569) : undefined
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}
function ok() { emit('confirm', { dir: draft.dir, type: draft.type, unit: draft.unit, step: stepNum(), stop: stopNum() }) }
function onKey(e: KeyboardEvent) {
  if (props.open && e.key === 'Escape') { e.stopPropagation(); emit('cancel') }
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ov-dlg-overlay" @click="emit('cancel')">
      <div class="ov-dlg" role="dialog" aria-modal="true" @click.stop>
        <div class="ov-dlg-title">序列</div>
        <div class="ov-dlg-body">
          <div class="ov-dlg-row">
            <div class="ov-dlg-label">序列产生在：</div>
            <div class="ov-radios">
              <button v-for="o in DIRS" :key="o.k" class="ov-radio" :class="{ 'ov-radio-on': draft.dir === o.k }" type="button" @click="draft.dir = o.k">
                <span class="ov-radio-dot"></span>{{ o.label }}
              </button>
            </div>
          </div>
          <div class="ov-dlg-row">
            <div class="ov-dlg-label">类型：</div>
            <div class="ov-radios ov-radios-col">
              <button v-for="o in TYPES" :key="o.k" class="ov-radio" :class="{ 'ov-radio-on': draft.type === o.k }" type="button" @click="draft.type = o.k">
                <span class="ov-radio-dot"></span>{{ o.label }}
              </button>
            </div>
          </div>
          <div class="ov-dlg-row" :class="{ 'ov-dlg-row-off': draft.type !== 'date' }">
            <div class="ov-dlg-label">日期单位：</div>
            <div class="ov-radios">
              <button
                v-for="o in UNITS" :key="o.k" class="ov-radio" :class="{ 'ov-radio-on': draft.unit === o.k }"
                type="button" :disabled="draft.type !== 'date'" @click="draft.type === 'date' && (draft.unit = o.k)"
              >
                <span class="ov-radio-dot"></span>{{ o.label }}
              </button>
            </div>
          </div>
          <div class="ov-dlg-row">
            <div class="ov-dlg-label">步长值：</div>
            <div
              ref="stepEl" class="ov-flt-input ov-series-edit" contenteditable="true" role="textbox"
              aria-label="步长值" data-placeholder="1" @input="draft.step = readEdit($event)" @keydown.enter.prevent="ok()"
            ></div>
          </div>
          <div class="ov-dlg-row">
            <div class="ov-dlg-label">终止值：</div>
            <div
              ref="stopEl" class="ov-flt-input ov-series-edit" contenteditable="true" role="textbox"
              aria-label="终止值" :data-placeholder="draft.type === 'date' ? '2026-12-31' : '可选'"
              @input="draft.stop = readEdit($event)" @keydown.enter.prevent="ok()"
            ></div>
          </div>
        </div>
        <div class="ov-dlg-foot">
          <button class="ov-dlg-btn" type="button" @click="emit('cancel')">取消</button>
          <button class="ov-dlg-btn ov-dlg-ok" type="button" @click="ok">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
