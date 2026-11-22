<script setup lang="ts">
/**
 * 「编辑图表数据」面板（仿 Office 的图表数据表）：
 * 行 = 系列，列 = 类别。单元格用自绘可编辑块（contenteditable），
 * 不使用原生 input / select / checkbox / radio。
 * 确定后把整份 ChartData 交回视图，由内核写回 chart part 与源工作簿。
 */
import { ref, watch, computed } from 'vue'
import type { ChartData, ChartSeries } from '../core/pptx/types'

const props = defineProps<{ open: boolean; data: ChartData | null; title?: string }>()
const emit = defineEmits<{ (e: 'apply', data: ChartData): void; (e: 'cancel'): void }>()

/** 编辑中的草稿：系列名 + 分类 + 数值 */
interface Row { name: string; vals: number[] }
interface Draft { type: ChartData['type']; cats: string[]; rows: Row[]; catAxisTitle?: string; valAxisTitle?: string }

const draft = ref<Draft>({ type: 'bar', cats: [], rows: [] })

/** 源系列里保存的引用公式（写回时内核按 c:f 定位源单元格，这里原样带回） */
const srcRefs = ref<ChartSeries[]>([])

watch(
  () => props.open,
  (v) => {
    if (!v || !props.data) return
    const d = props.data
    const cats = d.series[0]?.cat.values.slice() ?? []
    const rows = d.series.map((s) => ({ name: s.name, vals: s.val.values.slice() }))
    // 分类长度以第一行为准；其它行的分类若有差异，按第一行对齐
    for (const r of rows) while (r.vals.length < cats.length) r.vals.push(0)
    srcRefs.value = d.series.map((s) => ({ ...s, cat: { ...s.cat }, val: { ...s.val } }))
    draft.value = { type: d.type, cats, rows, catAxisTitle: d.catAxisTitle, valAxisTitle: d.valAxisTitle }
  },
  { immediate: true },
)

const readEdit = (e: Event) => ((e.target as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim()

function setName(ri: number, text: string) {
  const r = draft.value.rows[ri]
  if (r) r.name = text
}
function setCat(ci: number, text: string) {
  const d = draft.value
  if (ci >= 0 && ci < d.cats.length) d.cats[ci] = text
}
function setVal(ri: number, ci: number, text: string) {
  const r = draft.value.rows[ri]
  if (!r || ci >= r.vals.length) return
  const n = Number(text.replace(/[^\d.\-+eE]/g, ''))
  r.vals[ci] = Number.isFinite(n) ? n : 0
}

/** 增删分类列 */
function addCat() {
  const d = draft.value
  d.cats.push('类别 ' + (d.cats.length + 1))
  for (const r of d.rows) r.vals.push(0)
}
function delCat(ci: number) {
  const d = draft.value
  if (d.cats.length <= 1) return
  d.cats.splice(ci, 1)
  for (const r of d.rows) r.vals.splice(ci, 1)
}
/** 增删系列行 */
function addRow() {
  const d = draft.value
  const cats = d.cats.length ? d.cats.length : 1
  d.rows.push({ name: '系列 ' + (d.rows.length + 1), vals: new Array(cats).fill(0) })
  if (!d.cats.length) d.cats.push('类别 1')
}
function delRow(ri: number) {
  const d = draft.value
  if (d.rows.length <= 1) return
  d.rows.splice(ri, 1)
}

const canDelCat = computed(() => draft.value.cats.length > 1)
const canDelRow = computed(() => draft.value.rows.length > 1)

/** 草稿 → ChartData（保留原系列的 c:f 引用） */
function toChartData(): ChartData {
  const d = draft.value
  const cats = d.cats.slice()
  return {
    type: d.type,
    catAxisTitle: d.catAxisTitle,
    valAxisTitle: d.valAxisTitle,
    series: d.rows.map((r, i) => {
      const src = srcRefs.value[i]
      return {
        name: r.name,
        nameRef: src?.nameRef,
        cat: { values: cats.slice(), ref: src?.cat.ref },
        val: { values: r.vals.slice(), ref: src?.val.ref },
      }
    }),
  }
}

function ok() {
  emit('apply', toChartData())
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open && data" class="ov-dlg-overlay" @click="emit('cancel')">
      <div class="ov-dlg ov-chart-dlg" role="dialog" aria-modal="true" @click.stop>
        <div class="ov-dlg-title">{{ title || '编辑图表数据' }}</div>
        <div class="ov-dlg-body ov-chart-dlg-body">
          <table class="ov-chart-table">
            <thead>
              <tr>
                <th class="ov-chart-th ov-chart-corner">系列</th>
                <th v-for="(c, ci) in draft.cats" :key="ci" class="ov-chart-th">
                  <div
                    class="ov-chart-cell ov-chart-cat"
                    contenteditable="true"
                    role="textbox"
                    :aria-label="`类别 ${ci + 1}`"
                    @input="setCat(ci, readEdit($event))"
                  >{{ c }}</div>
                  <button v-if="canDelCat" class="ov-chart-x" type="button" title="删除该类别" @click="delCat(ci)">×</button>
                </th>
                <th class="ov-chart-th ov-chart-th-act">
                  <button class="ov-chart-add" type="button" title="添加类别" @click="addCat">＋类别</button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, ri) in draft.rows" :key="ri">
                <th class="ov-chart-th">
                  <div
                    class="ov-chart-cell ov-chart-name"
                    contenteditable="true"
                    role="textbox"
                    :aria-label="`系列 ${ri + 1} 名称`"
                    @input="setName(ri, readEdit($event))"
                  >{{ r.name }}</div>
                  <button v-if="canDelRow" class="ov-chart-x" type="button" title="删除该系列" @click="delRow(ri)">×</button>
                </th>
                <td v-for="(v, ci) in r.vals" :key="ci" class="ov-chart-td">
                  <div
                    class="ov-chart-cell ov-chart-val"
                    contenteditable="true"
                    role="textbox"
                    :aria-label="`系列 ${ri + 1} 类别 ${ci + 1} 数值`"
                    @input="setVal(ri, ci, readEdit($event))"
                  >{{ v }}</div>
                </td>
                <td class="ov-chart-td ov-chart-td-act"></td>
              </tr>
            </tbody>
          </table>
          <button class="ov-chart-add ov-chart-add-row" type="button" @click="addRow">＋添加系列</button>
        </div>
        <div class="ov-dlg-foot">
          <button class="ov-dlg-btn" type="button" @click="emit('cancel')">取消</button>
          <button class="ov-dlg-btn ov-dlg-ok" type="button" @click="ok">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style src="../office-views.css"></style>
<style src="../office-shape.css"></style>
