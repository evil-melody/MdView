<script setup lang="ts">
/**
 * Table cell hit layer.
 *
 * Drawn over the canvas whenever a table is selected. The cell frames come from the engine model
 * (see `src/pptx/table.ts`) — the rendered SVG has no per-cell DOM, so without this layer a table
 * would be one indivisible block and cell-level editing impossible.
 *
 * The layer is transparent and `pointer-events: none` as a whole: only the cell frames opt in, so
 * clicking outside a cell still reaches the canvas (and clears / re-targets the selection).
 */
import { computed } from 'vue'
import type { TableCellBox } from '../pptx/table'

const props = defineProps<{
  cells: TableCellBox[]
  widthPx: number
  heightPx: number
  selected: { row: number; col: number } | null
  busy?: boolean
}>()

/** Merge placeholders carry no frame of their own — the span anchor already covers the area. */
const visible = computed(() => props.cells.filter((c) => !c.merged))

const emit = defineEmits<{
  (e: 'pick', cell: { row: number; col: number }): void
  (e: 'edit', cell: { row: number; col: number }): void
}>()

const pct = (v: number, total: number) => `${((v / total) * 100).toFixed(4)}%`

function styleOf(c: TableCellBox): Record<string, string> {
  return {
    left: pct(c.x, props.widthPx),
    top: pct(c.y, props.heightPx),
    width: pct(c.w, props.widthPx),
    height: pct(c.h, props.heightPx)
  }
}

function isSelected(c: TableCellBox): boolean {
  return props.selected?.row === c.row && props.selected?.col === c.col
}

function onPick(ev: MouseEvent, c: TableCellBox) {
  ev.stopPropagation()
  emit('pick', { row: c.row, col: c.col })
}

function onEdit(ev: MouseEvent, c: TableCellBox) {
  ev.stopPropagation()
  emit('edit', { row: c.row, col: c.col })
}
</script>

<template>
  <div class="ppte-cells" :class="{ 'ppte-cells--busy': busy }">
    <div
      v-for="c in visible"
      :key="`${c.row}:${c.col}`"
      class="ppte-cell"
      :class="{ 'ppte-cell--on': isSelected(c) }"
      :style="styleOf(c)"
      :title="c.text.slice(0, 60) || `第 ${c.row + 1} 行 · 第 ${c.col + 1} 列`"
      @click="onPick($event, c)"
      @dblclick="onEdit($event, c)"
    ></div>
  </div>
</template>

<style src="./PptxTableCellLayer.css" scoped></style>
