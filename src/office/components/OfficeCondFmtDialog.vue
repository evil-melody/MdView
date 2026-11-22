<script setup lang="ts">
/** 条件格式规则编辑对话框：自绘规则类型下拉 + 参数输入 + 预设色板 + 规则清单。无原生表单控件。 */
import { ref, watch, reactive, onMounted, onBeforeUnmount } from 'vue'
import type { CondFmtRule, CondFmtType, Range } from '../core/xlsx/types'

const props = defineProps<{ open: boolean; rules: CondFmtRule[]; selRange: Range }>()
const emit = defineEmits<{ (e: 'confirm', rules: CondFmtRule[]): void; (e: 'cancel'): void }>()

const TYPES: { k: CondFmtType; label: string }[] = [
  { k: 'cellIs', label: '单元格值' }, { k: 'containsText', label: '包含文本' },
  { k: 'top10', label: '前 N 项' }, { k: 'colorScale', label: '色阶' }, { k: 'dataBar', label: '数据条' },
]
const OPS = [
  { k: 'greaterThan', label: '大于' }, { k: 'lessThan', label: '小于' }, { k: 'between', label: '介于' },
  { k: 'equal', label: '等于' }, { k: 'greaterThanOrEqual', label: '大于等于' }, { k: 'lessThanOrEqual', label: '小于等于' },
]
const COLORS = ['FFC7CE', 'C6EFCE', 'FFEB9C', 'DDEBF7', 'FCE4D6', 'E2EFDA', 'FFF2CC']
const list = ref<CondFmtRule[]>([])
const ddType = ref(false)
const ddOp = ref(false)
const draft = reactive({ type: 'cellIs' as CondFmtType, operator: 'greaterThan', formula1: '0', formula2: '', text: '', rank: 3, color: 'FFC7CE', barColor: '638EC6' })

watch(() => props.open, (v) => {
  if (!v) return
  list.value = props.rules.map((r) => ({ ...r }))
  ddType.value = false; ddOp.value = false
})
const typeLabel = () => TYPES.find((t) => t.k === draft.type)?.label ?? ''
const opLabel = () => OPS.find((o) => o.k === draft.operator)?.label ?? ''
const nextId = () => Math.max(0, ...list.value.map((r) => r.id)) + 1

function addRule() {
  const base: CondFmtRule = { id: nextId(), sqref: { ...props.selRange }, type: draft.type }
  if (draft.type === 'cellIs') { base.operator = draft.operator; base.formula1 = draft.formula1; if (draft.operator === 'between') base.formula2 = draft.formula2; base.color = draft.color; base.fontColor = '9C0006' }
  else if (draft.type === 'containsText') { base.text = draft.text; base.color = draft.color; base.fontColor = '006100' }
  else if (draft.type === 'top10') { base.rank = draft.rank; base.color = draft.color }
  else if (draft.type === 'colorScale') { base.colorMin = 'F8696B'; base.colorMax = '63BE7B' }
  else { base.barColor = draft.barColor }
  list.value.push(base)
}
function ok() { emit('confirm', list.value) }
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
        <div class="ov-dlg-title">条件格式规则</div>
        <div class="ov-dlg-body">
          <div class="ov-feat-rules">
            <div v-for="r in list" :key="r.id" class="ov-feat-rule">
              <span class="ov-feat-rule-t">{{ (TYPES.find((t) => t.k === r.type)?.label ?? r.type) }} · {{ String.fromCharCode(65 + r.sqref.c0) }}{{ r.sqref.r0 + 1 }}</span>
              <button class="ov-feat-x" type="button" title="删除" @click="list = list.filter((x) => x.id !== r.id)">✕</button>
            </div>
            <div v-if="!list.length" class="ov-feat-empty">暂无规则</div>
          </div>
          <div class="ov-dlg-row">
            <div class="ov-dlg-label">规则类型：</div>
            <div class="ov-dd">
              <button class="ov-dd-btn" type="button" @click.stop="ddType = !ddType; ddOp = false"><span class="ov-dd-cur">{{ typeLabel() }}</span><span class="ov-dd-arrow">▾</span></button>
              <div v-if="ddType" class="ov-dd-back" @click.stop="ddType = false"></div>
              <div v-if="ddType" class="ov-dd-pop">
                <button v-for="t in TYPES" :key="t.k" class="ov-dd-item" :class="{ 'ov-dd-on': t.k === draft.type }" type="button" @click.stop="draft.type = t.k; ddType = false">{{ t.label }}</button>
              </div>
            </div>
          </div>
          <template v-if="draft.type === 'cellIs'">
            <div class="ov-dlg-row">
              <div class="ov-dlg-label">条件：</div>
              <div class="ov-dd">
                <button class="ov-dd-btn" type="button" @click.stop="ddOp = !ddOp; ddType = false"><span class="ov-dd-cur">{{ opLabel() }}</span><span class="ov-dd-arrow">▾</span></button>
                <div v-if="ddOp" class="ov-dd-back" @click.stop="ddOp = false"></div>
                <div v-if="ddOp" class="ov-dd-pop">
                  <button v-for="o in OPS" :key="o.k" class="ov-dd-item" :class="{ 'ov-dd-on': o.k === draft.operator }" type="button" @click.stop="draft.operator = o.k; ddOp = false">{{ o.label }}</button>
                </div>
              </div>
            </div>
            <div class="ov-dlg-row">
              <div class="ov-dlg-label">阈值：</div>
              <div class="ov-feat-inline">
                <input v-model="draft.formula1" class="ov-flt-input" placeholder="数值" />
                <input v-if="draft.operator === 'between'" v-model="draft.formula2" class="ov-flt-input" placeholder="上限" />
              </div>
            </div>
          </template>
          <div v-else-if="draft.type === 'containsText'" class="ov-dlg-row">
            <div class="ov-dlg-label">包含文本：</div>
            <input v-model="draft.text" class="ov-flt-input" placeholder="文本" />
          </div>
          <div v-else-if="draft.type === 'top10'" class="ov-dlg-row">
            <div class="ov-dlg-label">前 N 项：</div>
            <input v-model.number="draft.rank" class="ov-flt-input" placeholder="3" />
          </div>
          <div v-if="draft.type === 'cellIs' || draft.type === 'containsText' || draft.type === 'top10'" class="ov-dlg-row">
            <div class="ov-dlg-label">填充色：</div>
            <div class="ov-feat-swatches">
              <button v-for="c in COLORS" :key="c" type="button" class="ov-feat-swatch" :class="{ 'ov-feat-swatch-on': draft.color === c }" :style="{ background: '#' + c }" @click="draft.color = c"></button>
            </div>
          </div>
          <button class="ov-feat-add" type="button" @click="addRule">＋ 添加规则（应用于当前选区）</button>
        </div>
        <div class="ov-dlg-foot">
          <button class="ov-dlg-btn" type="button" @click="emit('cancel')">取消</button>
          <button class="ov-dlg-btn ov-dlg-ok" type="button" @click="ok">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
