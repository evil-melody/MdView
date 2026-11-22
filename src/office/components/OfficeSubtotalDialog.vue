<script setup lang="ts">
/**
 * Office 式「分类汇总」对话框：自绘下拉（分类字段/汇总方式）+ 自绘勾选清单（选定汇总项）
 * + 汇总结果显示在数据下方开关。无原生 select/checkbox；样式在 office-subtotal.css。
 */
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'

interface SheetField { c: number; name: string; numeric: boolean }
const props = defineProps<{
  open: boolean
  fields: SheetField[]
  initial?: { groupCol: number; agg: string; valueCols: number[] }
}>()
const emit = defineEmits<{
  (e: 'confirm', p: { groupCol: number; agg: string; valueCols: number[]; below: boolean }): void
  (e: 'cancel'): void
}>()

const AGGS = ['求和', '计数', '平均', '最大', '最小']
const groupCol = ref(0)
const agg = ref('求和')
const picked = reactive(new Set<number>())
const below = ref(true)
const ddGroup = ref(false)
const ddAgg = ref(false)
const numFields = computed(() => props.fields.filter((f) => f.numeric))
const groupName = computed(() => props.fields.find((f) => f.c === groupCol.value)?.name ?? '（请选择）')

watch(
  () => props.open,
  (v) => {
    if (!v) return
    groupCol.value = props.initial?.groupCol ?? props.fields[0]?.c ?? 0
    agg.value = props.initial?.agg ?? '求和'
    picked.clear()
    const cols = props.initial?.valueCols ?? (numFields.value[0] ? [numFields.value[0].c] : [])
    for (const c of cols) if (props.fields.find((f) => f.c === c)?.numeric) picked.add(c)
    below.value = true
    ddGroup.value = false
    ddAgg.value = false
  }
)

function toggleVal(c: number) {
  if (!props.fields.find((f) => f.c === c)?.numeric) return
  if (picked.has(c)) picked.delete(c)
  else picked.add(c)
}
function ok() {
  if (!picked.size) return
  emit('confirm', {
    groupCol: groupCol.value,
    agg: agg.value,
    valueCols: props.fields.filter((f) => picked.has(f.c)).map((f) => f.c),
    below: below.value
  })
}
function onKey(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    ddGroup.value = false
    ddAgg.value = false
    emit('cancel')
  }
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ov-dlg-overlay" @click="emit('cancel')">
      <div class="ov-dlg" role="dialog" aria-modal="true" @click.stop>
        <div class="ov-dlg-title">分类汇总</div>
        <div class="ov-dlg-body">
          <div class="ov-dlg-row">
            <div class="ov-dlg-label">分类字段：</div>
            <div class="ov-dd">
              <button class="ov-dd-btn" type="button" @click.stop="ddGroup = !ddGroup; ddAgg = false">
                <span class="ov-dd-cur">{{ groupName }}</span><span class="ov-dd-arrow">▾</span>
              </button>
              <div v-if="ddGroup" class="ov-dd-back" @click.stop="ddGroup = false"></div>
              <div v-if="ddGroup" class="ov-dd-pop">
                <button
                  v-for="f in fields"
                  :key="f.c"
                  class="ov-dd-item"
                  :class="{ 'ov-dd-on': f.c === groupCol }"
                  type="button"
                  @click.stop="groupCol = f.c; ddGroup = false"
                >{{ f.name }}</button>
              </div>
            </div>
          </div>
          <div class="ov-dlg-row">
            <div class="ov-dlg-label">汇总方式：</div>
            <div class="ov-dd">
              <button class="ov-dd-btn" type="button" @click.stop="ddAgg = !ddAgg; ddGroup = false">
                <span class="ov-dd-cur">{{ agg }}</span><span class="ov-dd-arrow">▾</span>
              </button>
              <div v-if="ddAgg" class="ov-dd-back" @click.stop="ddAgg = false"></div>
              <div v-if="ddAgg" class="ov-dd-pop">
                <button
                  v-for="a in AGGS"
                  :key="a"
                  class="ov-dd-item"
                  :class="{ 'ov-dd-on': a === agg }"
                  type="button"
                  @click.stop="agg = a; ddAgg = false"
                >{{ a }}</button>
              </div>
            </div>
          </div>
          <div>
            <div class="ov-dlg-label">选定汇总项（数值列）：</div>
            <div class="ov-sub-list">
              <button
                v-for="f in fields"
                :key="f.c"
                class="ov-sub-row"
                :class="{ 'ov-sub-row-dis': !f.numeric }"
                type="button"
                @click="toggleVal(f.c)"
              >
                <span class="ov-chk" :class="{ 'ov-chk-on': picked.has(f.c) }"></span>
                <span class="ov-flt-val">{{ f.name }}</span>
              </button>
            </div>
          </div>
          <button class="ov-sub-row" type="button" @click="below = !below">
            <span class="ov-chk" :class="{ 'ov-chk-on': below }"></span>
            <span class="ov-flt-val">汇总结果显示在数据下方</span>
          </button>
        </div>
        <div class="ov-dlg-foot">
          <button class="ov-dlg-btn" type="button" @click="emit('cancel')">取消</button>
          <button class="ov-dlg-btn ov-dlg-ok" type="button" :disabled="!picked.size" @click="ok">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
