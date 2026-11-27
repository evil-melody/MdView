<script setup lang="ts">
/**
 * 原生 OOXML 特性可视化层（与 OfficeSheetView 拆开，避免主视图超 2000 行）：
 *  - chart：按 xlsx.features 读回的数据重绘 Office 配色 SVG（可刷新）
 *  - 条件格式：按规则给单元格叠加底色 / 数据条 / 色阶（z-index 低于选区 overlay，绝盖选区）
 *  - 数据验证：选中受限单元格显示自绘下拉（禁原生 select/checkbox/radio）
 *  - 切片器：可点字段值按钮组，点选即 emit 让父视图筛选
 * 所有交互 emit 给父视图走 RPC；样式集中在 office-sheet-features.css；动态几何走 :style。
 */
import { ref, computed, watch } from 'vue'
import type { ChartFeature, CondFmtRule, SheetFeatures, SlicerFeature } from '../core/xlsx/types'
import { chartSvg, type ChartKind } from '../view/xlsx/chartpng'
import { numOf, listRuleAt } from '../view/xlsx/validate'

export interface FeatureCell { r: number; c: number; left: number; top: number; w: number; h: number; text: string }

const props = defineProps<{
  features: SheetFeatures
  cells: FeatureCell[]
  originX: number
  originY: number
  zoom: number
  editable: boolean
  sel: { r: number; c: number }
  /** 本表批注（视图从 comments.list 过滤而来）：右上角红三角角标 */
  comments: { r: number; c: number; text: string }[]
  /** ribbon「隐藏批注」开关：勾上即整层角标不渲染（报障⑦的真实消费点） */
  commentHidden: boolean
}>()
const emit = defineEmits<{
  (e: 'validationSelect', value: string): void
  (e: 'slicerToggle', id: number, selected: string[]): void
  (e: 'chartRefresh', id: number): void
}>()

const z = () => props.zoom || 1

// ---------------------------------------------------------------- charts
interface ChartBox { id: number; style: Record<string, string>; svg: string; title: string }
const chartBoxes = computed<ChartBox[]>(() => (props.features.charts ?? []).map((c: ChartFeature) => {
  const x = c.x ?? 0, y = c.y ?? 0, w = c.w ?? 420, h = c.h ?? 260
  const g = z()
  return {
    id: c.id,
    title: c.title,
    svg: chartSvg(c.kind as ChartKind, c.data),
    style: { left: props.originX + x * g + 'px', top: props.originY + y * g + 'px', width: w * g + 'px', height: h * g + 'px' },
  }
}))

// ---------------------------------------------------------------- slicers
interface SlicerBox { id: number; name: string; field: string; items: string[]; selected: string[]; style: Record<string, string> }
const slicerBoxes = computed<SlicerBox[]>(() => (props.features.slicers ?? []).map((s: SlicerFeature) => {
  const g = z()
  return {
    id: s.id, name: s.name, field: s.fieldName, items: s.items, selected: s.selected ?? [],
    style: { left: props.originX + (s.x ?? 0) * g + 'px', top: props.originY + (s.y ?? 0) * g + 'px', width: 180 * g + 'px' },
  }
}))
const slicerOn = (b: SlicerBox, v: string) => b.selected.length === 0 || b.selected.includes(v)
function toggleSlicer(b: SlicerBox, v: string) {
  // empty = all visible; clicking builds the explicit visible set
  const all = b.selected.length === 0 ? [...b.items] : [...b.selected]
  const i = all.indexOf(v)
  if (i >= 0) all.splice(i, 1)
  else all.push(v)
  const selected = all.length === b.items.length ? [] : all
  emit('slicerToggle', b.id, selected)
}

// ---------------------------------------------------------------- conditional formatting
const hex = (h: string | undefined, fb: string) => {
  const s = (h || fb).replace('#', '')
  return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0]
}
const normHex = (h: string | undefined) => '#' + (h || 'FFC7CE').replace('#', '')
const mix = (a: string | undefined, b: string | undefined, t: number) => {
  const A = hex(a, 'F8696B'), B = hex(b, '63BE7B')
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, '0')).join('')
}
interface Overlay { key: string; style: Record<string, string>; kind: 'tint' | 'bar'; color: string }
const condOverlays = computed<Overlay[]>(() => {
  const out: Overlay[] = []
  const rules = props.features.condFmt ?? []
  for (const rule of rules as CondFmtRule[]) {
    const inR = props.cells.filter((c) => c.r >= rule.sqref.r0 && c.r <= rule.sqref.r1 && c.c >= rule.sqref.c0 && c.c <= rule.sqref.c1)
    if (!inR.length) continue
    const vals = inR.map((c) => numOf(c.text))
    const nums = vals.filter((v): v is number => v !== null)
    const max = nums.length ? Math.max(...nums) : 0
    const min = nums.length ? Math.min(...nums) : 0
    if (rule.type === 'dataBar' || rule.type === 'colorScale') {
      inR.forEach((cell, i) => {
        const v = vals[i]
        if (v === null) return
        const t = max > min ? (v - min) / (max - min) : 0.5
        if (rule.type === 'dataBar') out.push({
          key: `bar-${rule.id}-${cell.r}-${cell.c}`, kind: 'bar', color: normHex(rule.barColor),
          style: { left: cell.left + 2 + 'px', top: cell.top + 2 + 'px', width: Math.max(2, (cell.w - 4) * t) + 'px', height: cell.h - 4 + 'px' },
        })
        else out.push({
          key: `scale-${rule.id}-${cell.r}-${cell.c}`, kind: 'tint', color: mix(rule.colorMin, rule.colorMax, t),
          style: { left: cell.left + 'px', top: cell.top + 'px', width: cell.w + 'px', height: cell.h + 'px' },
        })
      })
      continue
    }
    let rankSet: number[] = []
    if (rule.type === 'top10') {
      const sorted = [...nums].sort((a, b) => rule.bottom ? a - b : b - a)
      rankSet = sorted.slice(0, Math.max(1, rule.rank ?? 10))
    }
    inR.forEach((cell, i) => {
      const v = vals[i]
      let match = false
      switch (rule.type) {
        case 'cellIs': {
          const a = numOf(rule.formula1 ?? '') ?? 0, b = numOf(rule.formula2 ?? '') ?? 0
          if (v === null) break
          const op = rule.operator ?? 'greaterThan'
          match = op === 'greaterThan' ? v > a : op === 'lessThan' ? v < a : op === 'between' ? v >= Math.min(a, b) && v <= Math.max(a, b)
            : op === 'equal' ? v === a : op === 'notEqual' ? v !== a : op === 'greaterThanOrEqual' ? v >= a : op === 'lessThanOrEqual' ? v <= a : false
          break
        }
        case 'containsText': match = !!rule.text && cell.text.toLowerCase().includes(rule.text.toLowerCase()); break
        case 'top10': match = v !== null && rankSet.includes(v); break
      }
      if (match) out.push({
        key: `tint-${rule.id}-${cell.r}-${cell.c}`, kind: 'tint', color: normHex(rule.color),
        style: { left: cell.left + 'px', top: cell.top + 'px', width: cell.w + 'px', height: cell.h + 'px' },
      })
    })
  }
  return out
})

// ---------------------------------------------------------------- comments (报障⑦)
interface CommentMark { key: string; style: Record<string, string>; text: string }
const commentMarks = computed<CommentMark[]>(() => {
  if (props.commentHidden) return []
  const out: CommentMark[] = []
  for (const m of props.comments) {
    const cell = props.cells.find((c) => c.r === m.r && c.c === m.c)
    if (!cell) continue // 批注落在隐藏行/可视区外：不渲染角标
    out.push({ key: `cm-${m.r}-${m.c}`, text: m.text, style: { left: cell.left + cell.w - 9 + 'px', top: cell.top + 'px' } })
  }
  return out
})

// ---------------------------------------------------------------- validation (self-drawn dropdown)
const valRule = computed(() => listRuleAt(props.features.validations ?? [], props.sel.r, props.sel.c))
const valCell = computed(() => props.cells.find((c) => c.r === props.sel.r && c.c === props.sel.c))
const valOpen = ref(false)
const valPos = ref({ x: 0, y: 0 })
watch(() => [props.sel.r, props.sel.c], () => { valOpen.value = false })
function openVal(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  valPos.value = { x: r.left, y: r.bottom + 2 }
  valOpen.value = !valOpen.value
}
function pickVal(v: string) { valOpen.value = false; emit('validationSelect', v) }
</script>

<template>
  <!-- 条件格式：z-index 1（低于选区 tint 的 2），绝不盖选区 overlay -->
  <div class="ov-feat-cond">
    <div
      v-for="o in condOverlays"
      :key="o.key"
      class="ov-feat-ov"
      :class="o.kind === 'bar' ? 'ov-feat-bar' : 'ov-feat-tint'"
      :style="[o.style, { background: o.color }]"
      :data-cf="o.kind"
    ></div>
  </div>
  <!-- 可视化对象：chart / slicer / 验证下拉，z-index 4 -->
  <div class="ov-feat-vis">
    <div v-for="c in chartBoxes" :key="'ch' + c.id" class="ov-feat-chart" :style="c.style" :data-chart="c.id">
      <div class="ov-feat-chart-svg" v-html="c.svg"></div>
      <button v-if="editable" class="ov-feat-refresh" type="button" title="按源数据刷新图表" :data-refresh="c.id" @click.stop="emit('chartRefresh', c.id)">⟳</button>
    </div>
    <div v-for="s in slicerBoxes" :key="'sl' + s.id" class="ov-feat-slicer" :style="s.style" :data-slicer="s.id">
      <div class="ov-feat-slicer-head">{{ s.field }}</div>
      <div class="ov-feat-slicer-items">
        <button
          v-for="v in s.items"
          :key="v"
          type="button"
          class="ov-feat-slicer-btn"
          :class="{ 'ov-feat-slicer-on': slicerOn(s, v) }"
          :data-sval="v"
          @click.stop="toggleSlicer(s, v)"
        >{{ v }}</button>
      </div>
    </div>
    <!-- 批注角标：可视区内的批注格右上角红三角，悬停看正文；「隐藏批注」整层关掉 -->
    <div
      v-for="m in commentMarks"
      :key="m.key"
      class="ov-feat-comment-mark"
      :style="m.style"
      :title="m.text"
      :data-comment-at="m.key"
    ></div>
    <button
      v-if="editable && valRule && valCell"
      class="ov-feat-val-trigger"
      type="button"
      title="选择允许的值"
      :style="{ left: valCell.left + valCell.w - 16 + 'px', top: valCell.top + 'px', height: valCell.h + 'px' }"
      @click.stop="openVal"
    >▾</button>
  </div>
  <Teleport to="body">
    <div v-if="valOpen" class="ov-feat-val-back" @click="valOpen = false"></div>
    <div v-if="valOpen && valRule" class="ov-feat-val-pop" :style="{ left: valPos.x + 'px', top: valPos.y + 'px' }">
      <div v-if="valRule.prompt" class="ov-feat-val-prompt">{{ valRule.prompt }}</div>
      <button v-for="v in (valRule.items ?? [])" :key="v" type="button" class="ov-feat-val-item" :data-vval="v" @click.stop="pickVal(v)">{{ v }}</button>
    </div>
  </Teleport>
</template>
