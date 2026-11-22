<script setup lang="ts">
/** 数据验证规则编辑对话框：自绘类型/条件下拉 + 参数输入 + 输入提示/出错警告 + 规则清单。 */
import { ref, watch, reactive, onMounted, onBeforeUnmount } from 'vue'
import type { ValidationRule, ValidationType, Range } from '../core/xlsx/types'

const props = defineProps<{ open: boolean; rules: ValidationRule[]; selRange: Range }>()
const emit = defineEmits<{ (e: 'confirm', rules: ValidationRule[]): void; (e: 'cancel'): void }>()

const TYPES: { k: ValidationType; label: string }[] = [
  { k: 'list', label: '序列（下拉）' }, { k: 'whole', label: '整数' }, { k: 'decimal', label: '小数' },
  { k: 'date', label: '日期' }, { k: 'textLength', label: '文本长度' },
]
const OPS = [
  { k: 'between', label: '介于' }, { k: 'greaterThan', label: '大于' }, { k: 'lessThan', label: '小于' },
  { k: 'equal', label: '等于' }, { k: 'greaterThanOrEqual', label: '大于等于' }, { k: 'lessThanOrEqual', label: '小于等于' },
]
const list = ref<ValidationRule[]>([])
const ddType = ref(false)
const ddOp = ref(false)
const draft = reactive({ type: 'list' as ValidationType, operator: 'between', formula1: '0', formula2: '100', items: '是,否', prompt: '', error: '输入无效' })

watch(() => props.open, (v) => {
  if (!v) return
  list.value = props.rules.map((r) => ({ ...r }))
  ddType.value = false; ddOp.value = false
})
const typeLabel = () => TYPES.find((t) => t.k === draft.type)?.label ?? ''
const opLabel = () => OPS.find((o) => o.k === draft.operator)?.label ?? ''
const nextId = () => Math.max(0, ...list.value.map((r) => r.id)) + 1

function addRule() {
  const base: ValidationRule = { id: nextId(), sqref: { ...props.selRange }, type: draft.type, formula1: '', showInputMessage: true, showErrorMessage: true, error: draft.error || '输入无效', errorStyle: 'stop', prompt: draft.prompt }
  if (draft.type === 'list') { base.formula1 = draft.items; base.items = draft.items.split(',').map((s) => s.trim()).filter(Boolean); base.promptTitle = '请选择' }
  else { base.operator = draft.operator; base.formula1 = draft.formula1; if (draft.operator === 'between') base.formula2 = draft.formula2 }
  list.value.push(base)
}
function ok() { emit('confirm', list.value) }
function onKey(e: KeyboardEvent) { if (props.open && e.key === 'Escape') { e.stopPropagation(); emit('cancel') } }
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ov-dlg-overlay" @click="emit('cancel')">
      <div class="ov-dlg" role="dialog" aria-modal="true" @click.stop>
        <div class="ov-dlg-title">数据验证</div>
        <div class="ov-dlg-body">
          <div class="ov-feat-rules">
            <div v-for="r in list" :key="r.id" class="ov-feat-rule">
              <span class="ov-feat-rule-t">{{ (TYPES.find((t) => t.k === r.type)?.label ?? r.type) }} · {{ String.fromCharCode(65 + r.sqref.c0) }}{{ r.sqref.r0 + 1 }}</span>
              <button class="ov-feat-x" type="button" title="删除" @click="list = list.filter((x) => x.id !== r.id)">✕</button>
            </div>
            <div v-if="!list.length" class="ov-feat-empty">暂无规则</div>
          </div>
          <div class="ov-dlg-row">
            <div class="ov-dlg-label">允许：</div>
            <div class="ov-dd">
              <button class="ov-dd-btn" type="button" @click.stop="ddType = !ddType; ddOp = false"><span class="ov-dd-cur">{{ typeLabel() }}</span><span class="ov-dd-arrow">▾</span></button>
              <div v-if="ddType" class="ov-dd-back" @click.stop="ddType = false"></div>
              <div v-if="ddType" class="ov-dd-pop">
                <button v-for="t in TYPES" :key="t.k" class="ov-dd-item" :class="{ 'ov-dd-on': t.k === draft.type }" type="button" @click.stop="draft.type = t.k; ddType = false">{{ t.label }}</button>
              </div>
            </div>
          </div>
          <template v-if="draft.type !== 'list'">
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
              <div class="ov-dlg-label">数值：</div>
              <div class="ov-feat-inline">
                <input v-model="draft.formula1" class="ov-flt-input" placeholder="下限" />
                <input v-if="draft.operator === 'between'" v-model="draft.formula2" class="ov-flt-input" placeholder="上限" />
              </div>
            </div>
          </template>
          <div v-else class="ov-dlg-row">
            <div class="ov-dlg-label">下拉选项（逗号分隔）：</div>
            <input v-model="draft.items" class="ov-flt-input" placeholder="是,否,未知" />
          </div>
          <div class="ov-dlg-row">
            <div class="ov-dlg-label">输入提示：</div>
            <input v-model="draft.prompt" class="ov-flt-input" placeholder="选中单元格时显示" />
          </div>
          <div class="ov-dlg-row">
            <div class="ov-dlg-label">出错警告：</div>
            <input v-model="draft.error" class="ov-flt-input" placeholder="非法输入时显示" />
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
