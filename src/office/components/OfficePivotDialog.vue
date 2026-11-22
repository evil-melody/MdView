<script setup lang="ts">
/**
 * Office 式「数据透视表字段」面板对话框：字段清单 + 行/列/值三个放置区。
 * 点字段 chip 弹出分配菜单（添加到行/列/值），值区再选聚合方式（求和/计数/平均）。
 * 全部自绘控件，无原生 select/checkbox；样式在 office-subtotal.css。
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

interface SheetField { c: number; name: string; numeric: boolean }
const props = defineProps<{
  open: boolean
  fields: SheetField[]
  initial?: { rows: number[]; cols: number[]; values: { c: number; agg: string }[] }
}>()
const emit = defineEmits<{
  (e: 'confirm', p: { rows: number[]; cols: number[]; values: { c: number; agg: string }[] }): void
  (e: 'cancel'): void
}>()

const AGGS = ['求和', '计数', '平均']
const rows = ref<number[]>([])
const cols = ref<number[]>([])
const values = ref<{ c: number; agg: string }[]>([])
/** 字段分配弹出菜单：点击字段 chip 后出现（fixed 定位到点击处，几何走 :style） */
const assign = ref<{ c: number; x: number; y: number } | null>(null)
/** 值字段聚合方式弹出菜单 */
const aggMenu = ref<{ i: number; x: number; y: number } | null>(null)
const fieldName = (c: number) => props.fields.find((f) => f.c === c)?.name ?? `列${c + 1}`

watch(
  () => props.open,
  (v) => {
    if (!v) return
    rows.value = [...(props.initial?.rows ?? [])]
    cols.value = [...(props.initial?.cols ?? [])]
    values.value = (props.initial?.values ?? []).map((x) => ({ ...x }))
    assign.value = null
    aggMenu.value = null
  }
)

function openAssign(f: SheetField, ev: MouseEvent) {
  aggMenu.value = null
  assign.value = { c: f.c, x: Math.min(ev.clientX, window.innerWidth - 130), y: Math.min(ev.clientY, window.innerHeight - 150) }
}
function drop(zone: 'row' | 'col' | 'val') {
  const c = assign.value?.c
  assign.value = null
  if (c === undefined) return
  if (zone === 'row') {
    if (!rows.value.includes(c)) rows.value = [...rows.value, c]
  } else if (zone === 'col') {
    if (!cols.value.includes(c)) cols.value = [...cols.value, c]
  } else if (props.fields.find((f) => f.c === c)?.numeric && !values.value.some((v) => v.c === c)) {
    values.value = [...values.value, { c, agg: '求和' }]
  }
}
function removeAt(zone: 'row' | 'col' | 'val', i: number) {
  if (zone === 'row') rows.value = rows.value.filter((_, x) => x !== i)
  else if (zone === 'col') cols.value = cols.value.filter((_, x) => x !== i)
  else values.value = values.value.filter((_, x) => x !== i)
}
function openAgg(i: number, ev: MouseEvent) {
  assign.value = null
  aggMenu.value = { i, x: Math.min(ev.clientX, window.innerWidth - 110), y: Math.min(ev.clientY, window.innerHeight - 130) }
}
function setAgg(a: string) {
  const it = values.value[aggMenu.value?.i ?? -1]
  if (it) it.agg = a
  aggMenu.value = null
}
function onOverlay() {
  if (assign.value || aggMenu.value) {
    assign.value = null
    aggMenu.value = null
  } else emit('cancel')
}
function ok() {
  if (!values.value.length) return
  emit('confirm', { rows: rows.value, cols: cols.value, values: values.value.map((v) => ({ ...v })) })
}
function onKey(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    assign.value = null
    aggMenu.value = null
    emit('cancel')
  }
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ov-dlg-overlay" @click="onOverlay">
      <div class="ov-dlg ov-pivot" role="dialog" aria-modal="true" @click.stop>
        <div class="ov-dlg-title">数据透视表字段</div>
        <div class="ov-dlg-body">
          <div>
            <div class="ov-dlg-label">字段（点击分配到行 / 列 / 值）：</div>
            <div class="ov-pv-fields">
              <button v-for="f in fields" :key="f.c" class="ov-pv-chip" type="button" @click.stop="openAssign(f, $event)">{{ f.name }}</button>
            </div>
          </div>
          <div class="ov-pv-zones">
            <div class="ov-pv-zone">
              <div class="ov-pv-zone-t">行</div>
              <div v-for="(c, i) in rows" :key="c" class="ov-pv-zchip">
                <span class="ov-pv-zname">{{ fieldName(c) }}</span>
                <button class="ov-pv-x" type="button" title="移除" @click="removeAt('row', i)">✕</button>
              </div>
              <span v-if="!rows.length" class="ov-pv-empty">无</span>
            </div>
            <div class="ov-pv-zone">
              <div class="ov-pv-zone-t">列</div>
              <div v-for="(c, i) in cols" :key="c" class="ov-pv-zchip">
                <span class="ov-pv-zname">{{ fieldName(c) }}</span>
                <button class="ov-pv-x" type="button" title="移除" @click="removeAt('col', i)">✕</button>
              </div>
              <span v-if="!cols.length" class="ov-pv-empty">无</span>
            </div>
            <div class="ov-pv-zone">
              <div class="ov-pv-zone-t">值</div>
              <div v-for="(v, i) in values" :key="v.c" class="ov-pv-zchip">
                <span class="ov-pv-zname">{{ fieldName(v.c) }}</span>
                <button class="ov-pv-agg" type="button" @click.stop="openAgg(i, $event)">{{ v.agg }} ▾</button>
                <button class="ov-pv-x" type="button" title="移除" @click="removeAt('val', i)">✕</button>
              </div>
              <span v-if="!values.length" class="ov-pv-empty">无</span>
            </div>
          </div>
          <div class="ov-pv-note">结果为静态值写入单元格，源数据变化后不会自动刷新。</div>
        </div>
        <div class="ov-dlg-foot">
          <button class="ov-dlg-btn" type="button" @click="emit('cancel')">取消</button>
          <button class="ov-dlg-btn ov-dlg-ok" type="button" :disabled="!values.length" @click="ok">确定</button>
        </div>
      </div>
      <!-- 字段分配菜单 -->
      <div v-if="assign" class="ov-pop" :style="{ left: assign.x + 'px', top: assign.y + 'px' }" @click.stop>
        <button class="ov-pop-item" type="button" @click="drop('row')">添加到行</button>
        <button class="ov-pop-item" type="button" @click="drop('col')">添加到列</button>
        <button class="ov-pop-item" type="button" :disabled="!fields.find((f) => f.c === assign?.c)?.numeric" @click="drop('val')">添加到值</button>
      </div>
      <!-- 值字段聚合方式菜单 -->
      <div v-if="aggMenu" class="ov-pop" :style="{ left: aggMenu.x + 'px', top: aggMenu.y + 'px' }" @click.stop>
        <button v-for="a in AGGS" :key="a" class="ov-pop-item" type="button" @click="setAgg(a)">{{ a }}</button>
      </div>
    </div>
  </Teleport>
</template>
