<script setup lang="ts">
/**
 * PPTX editor toolbar (幻灯片 / 插入 / 元素 / 格式 / 撤销).
 *
 * A pure view: every control emits an `EditorAction`, the container turns it into ops. The second
 * row is contextual — 元素操作 while an element is selected, 文字格式 while the inline text overlay
 * is open, otherwise a short hint — so the bar never shows controls that cannot act.
 */
import { computed, ref } from 'vue'
import {
  ALIGN_ITEMS,
  ANIM_ITEMS,
  INSERT_ITEMS,
  ORDER_ITEMS,
  type CellState,
  type EditorAction,
  type SelectionInfo,
  type SlideState
} from '../pptx/actions'
import type { AnimEffect } from '../pptx/ops'
import PptxDeckPanel from './PptxDeckPanel.vue'

const props = defineProps<{
  slideIndex: number
  slideCount: number
  context: 'none' | 'element' | 'text'
  sel: SelectionInfo | null
  /** closed-loop state of the *slide* (notes / transition / hidden) for the deck panel */
  slideState: SlideState
  /** selected table cell, when a table is selected */
  cell: CellState | null
  /** outcome of the last deck-level action (find & replace) */
  message: string
  canUndo: boolean
  canRedo: boolean
  undoLabel: string
  redoLabel: string
  busy: boolean
  status: string
  hint: string
}>()

const emit = defineEmits<{ (e: 'action', a: EditorAction): void }>()
const act = (a: EditorAction) => emit('action', a)

/** Which deck panel strip is open; both are folded away by default so row 1 stays scannable. */
const panel = ref<'notes' | 'find' | null>(null)
const toggle = (mode: 'notes' | 'find') => {
  panel.value = panel.value === mode ? null : mode
}

const first = computed(() => props.slideIndex <= 0)
const last = computed(() => props.slideIndex >= props.slideCount - 1)
const sel = computed(() => props.sel)
const multi = computed(() => (sel.value?.count ?? 0) > 1)
const canAlign = computed(() => (sel.value?.count ?? 0) > 0)
const canDistribute = computed(() => (sel.value?.count ?? 0) > 2)
const canGroup = computed(() => (sel.value?.count ?? 0) > 1)

function onAnim(ev: Event) {
  act({ kind: 'element.animation', value: (ev.target as HTMLSelectElement).value as AnimEffect | '' })
}
</script>

<template>
  <div class="ptb">
    <!-- ── 幻灯片 / 插入 / 历史 ── -->
    <div class="ptb-row">
      <div class="ptb-grp" role="group" aria-label="幻灯片">
        <span class="ptb-no">{{ slideIndex + 1 }}<i>/{{ slideCount }}</i></span>
        <button class="ptb-btn" title="在当前页后新增空白页" :disabled="busy" @click="act({ kind: 'slide.add' })">
          新增页
        </button>
        <button class="ptb-btn" title="复制当前页" :disabled="busy" @click="act({ kind: 'slide.dup' })">
          复制页
        </button>
        <button
          class="ptb-btn"
          title="上移当前页"
          :disabled="busy || first"
          @click="act({ kind: 'slide.up' })"
        >
          ↑
        </button>
        <button class="ptb-btn" title="下移当前页" :disabled="busy || last" @click="act({ kind: 'slide.down' })">
          ↓
        </button>
        <button
          class="ptb-btn ptb-danger"
          title="删除当前页"
          :disabled="busy || slideCount <= 1"
          @click="act({ kind: 'slide.del' })"
        >
          删除页
        </button>
        <label class="ptb-color" title="幻灯片背景色">
          <input type="color" value="#ffffff" @input="act({ kind: 'slide.background', value: ($event.target as HTMLInputElement).value })" />
        </label>
      </div>

      <span class="ptb-sep"></span>

      <div class="ptb-grp" role="group" aria-label="幻灯片设置">
        <button
          class="ptb-btn"
          :class="{ 'ptb-on': panel === 'notes' }"
          title="备注 / 切换效果 / 自动换片 / 隐藏"
          :disabled="busy"
          @click="toggle('notes')"
        >
          备注·切换
        </button>
        <button
          class="ptb-btn"
          :class="{ 'ptb-on': panel === 'find' }"
          title="整篇查找替换"
          :disabled="busy"
          @click="toggle('find')"
        >
          查找替换
        </button>
      </div>

      <span class="ptb-sep"></span>

      <div class="ptb-grp" role="group" aria-label="插入">
        <button
          v-for="it in INSERT_ITEMS"
          :key="it.what"
          class="ptb-btn"
          :title="it.hint"
          :disabled="busy"
          @click="act({ kind: 'insert', what: it.what })"
        >
          {{ it.label }}
        </button>
      </div>

      <span class="ptb-sep"></span>

      <div class="ptb-grp" role="group" aria-label="历史">
        <button
          class="ptb-btn"
          :title="canUndo ? `撤销：${undoLabel}` : '没有可撤销的操作'"
          :disabled="busy || !canUndo"
          @click="act({ kind: 'undo' })"
        >
          ↶ 撤销
        </button>
        <button
          class="ptb-btn"
          :title="canRedo ? `重做：${redoLabel}` : '没有可重做的操作'"
          :disabled="busy || !canRedo"
          @click="act({ kind: 'redo' })"
        >
          ↷ 重做
        </button>
      </div>

      <span class="ptb-flex"></span>
      <span v-if="busy" class="ptb-stat">保存中…</span>
      <span v-else-if="status" class="ptb-stat">{{ status }}</span>
    </div>

    <!-- ── 上下文行 ── -->
    <div class="ptb-row ptb-row-ctx">
      <template v-if="context === 'text'">
        <div class="ptb-grp" role="group" aria-label="文字格式">
          <button class="ptb-btn" title="加粗" @mousedown.prevent @click="act({ kind: 'text.exec', cmd: 'bold' })"><b>B</b></button>
          <button class="ptb-btn" title="斜体" @mousedown.prevent @click="act({ kind: 'text.exec', cmd: 'italic' })"><i>I</i></button>
          <button class="ptb-btn" title="下划线" @mousedown.prevent @click="act({ kind: 'text.exec', cmd: 'underline' })"><u>U</u></button>
          <button class="ptb-btn" title="删除线" @mousedown.prevent @click="act({ kind: 'text.exec', cmd: 'strikeThrough' })">S</button>
          <label class="ptb-color" title="字体颜色">
            <input type="color" value="#000000" @mousedown.prevent @input="act({ kind: 'text.exec', cmd: 'foreColor', value: ($event.target as HTMLInputElement).value })" />
          </label>
          <button class="ptb-btn" title="清除格式" @mousedown.prevent @click="act({ kind: 'text.exec', cmd: 'removeFormat' })">⌫</button>
          <button class="ptb-btn" title="左对齐" @mousedown.prevent @click="act({ kind: 'text.exec', cmd: 'justifyLeft' })">⇤</button>
          <button class="ptb-btn" title="居中" @mousedown.prevent @click="act({ kind: 'text.exec', cmd: 'justifyCenter' })">⇔</button>
          <button class="ptb-btn" title="右对齐" @mousedown.prevent @click="act({ kind: 'text.exec', cmd: 'justifyRight' })">⇥</button>
        </div>
        <span class="ptb-hint">直接输入修改文字，Esc 取消 / 点击空白处保存</span>
      </template>

      <template v-else-if="context === 'element' && sel">
        <div class="ptb-grp" role="group" aria-label="层级">
          <button
            v-for="o in ORDER_ITEMS"
            :key="o.dir"
            class="ptb-btn"
            :title="o.hint"
            :disabled="busy"
            @click="act({ kind: 'element.order', dir: o.dir })"
          >
            {{ o.label }}
          </button>
        </div>

        <span class="ptb-sep"></span>

        <div class="ptb-grp" role="group" aria-label="对齐">
          <button
            v-for="a in ALIGN_ITEMS"
            :key="a.mode"
            class="ptb-btn ptb-icon"
            :title="multi ? `${a.hint}（相对选区）` : `${a.hint}（相对幻灯片）`"
            :disabled="busy || !canAlign"
            @click="act({ kind: 'align', mode: a.mode })"
          >
            {{ a.label }}
          </button>
          <button class="ptb-btn ptb-icon" title="水平均分" :disabled="busy || !canDistribute" @click="act({ kind: 'distribute', axis: 'horizontal' })">≡</button>
          <button class="ptb-btn ptb-icon" title="垂直均分" :disabled="busy || !canDistribute" @click="act({ kind: 'distribute', axis: 'vertical' })">⋮</button>
        </div>

        <span class="ptb-sep"></span>

        <div class="ptb-grp" role="group" aria-label="组合">
          <button class="ptb-btn" title="组合所选元素" :disabled="busy || !canGroup" @click="act({ kind: 'element.group' })">组合</button>
          <button class="ptb-btn" title="取消组合" :disabled="busy || !sel.canUngroup" @click="act({ kind: 'element.ungroup' })">取消组合</button>
          <button class="ptb-btn ptb-danger" title="删除所选元素（Delete）" :disabled="busy" @click="act({ kind: 'element.delete' })">删除</button>
        </div>

        <span class="ptb-sep"></span>

        <div class="ptb-grp" role="group" aria-label="格式">
          <label class="ptb-color" :title="sel.kind === 'group' ? '填充（组内元素不可直接改）' : '填充色'">
            <input
              type="color"
              :value="sel.fill ?? '#ffffff'"
              :disabled="busy || sel.kind === 'group'"
              @input="act({ kind: 'format.fill', value: ($event.target as HTMLInputElement).value })"
            />
          </label>
          <button class="ptb-btn" title="取消填充" :disabled="busy || sel.kind === 'group'" @click="act({ kind: 'format.fill', value: 'none' })">无填充</button>
          <label class="ptb-color" title="描边色">
            <input
              type="color"
              :value="sel.stroke ?? '#404040'"
              :disabled="busy || sel.kind === 'group' || sel.isPicture"
              @input="act({ kind: 'format.stroke', value: ($event.target as HTMLInputElement).value })"
            />
          </label>
          <button class="ptb-btn" title="取消描边" :disabled="busy || sel.kind === 'group' || sel.isPicture" @click="act({ kind: 'format.stroke', value: null })">无边框</button>
        </div>

        <template v-if="sel.hasText">
          <span class="ptb-sep"></span>
          <div class="ptb-grp" role="group" aria-label="字体">
            <button class="ptb-btn" title="加粗" :class="{ 'ptb-on': sel.bold }" :disabled="busy" @click="act({ kind: 'format.font', patch: { bold: !sel.bold } })"><b>B</b></button>
            <button class="ptb-btn" title="斜体" :class="{ 'ptb-on': sel.italic }" :disabled="busy" @click="act({ kind: 'format.font', patch: { italic: !sel.italic } })"><i>I</i></button>
            <button class="ptb-btn" title="下划线" :class="{ 'ptb-on': sel.underline }" :disabled="busy" @click="act({ kind: 'format.font', patch: { underline: !sel.underline } })"><u>U</u></button>
            <label class="ptb-color" title="字体颜色">
              <input type="color" :value="sel.fontColor ?? '#000000'" :disabled="busy" @input="act({ kind: 'format.font', patch: { color: ($event.target as HTMLInputElement).value } })" />
            </label>
            <button class="ptb-btn ptb-icon" title="缩小字号" :disabled="busy || sel.fontSizePx == null" @click="act({ kind: 'format.font', patch: { fontSizePx: Math.max(6, Math.round((sel.fontSizePx ?? 18) * 0.9)) } })">A-</button>
            <button class="ptb-btn ptb-icon" title="放大字号" :disabled="busy || sel.fontSizePx == null" @click="act({ kind: 'format.font', patch: { fontSizePx: Math.round((sel.fontSizePx ?? 18) * 1.1) } })">A+</button>
          </div>
        </template>

        <template v-if="sel.isPicture">
          <span class="ptb-sep"></span>
          <div class="ptb-grp" role="group" aria-label="图片">
            <button class="ptb-btn" title="恢复整张图片（清除裁剪）" :disabled="busy" @click="act({ kind: 'element.cropReset' })">清除裁剪</button>
            <label class="ptb-range" title="不透明度">
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                :value="Math.round(sel.opacity * 100)"
                :disabled="busy"
                @change="act({ kind: 'element.opacity', value: Number(($event.target as HTMLInputElement).value) / 100 })"
              />
            </label>
          </div>
        </template>

        <template v-if="sel.kind === 'table' && cell">
          <span class="ptb-sep"></span>
          <div class="ptb-grp" role="group" aria-label="单元格">
            <span class="ptb-tag">R{{ cell.row + 1 }}C{{ cell.col + 1 }}</span>
            <button class="ptb-btn" title="编辑单元格文字（也可双击单元格）" :disabled="busy" @click="act({ kind: 'table.cellEdit' })">
              编辑文字
            </button>
            <label class="ptb-color" title="单元格底纹">
              <input
                type="color"
                :value="cell.fillHex ?? '#ffffff'"
                :disabled="busy"
                @input="act({ kind: 'table.cellFill', value: ($event.target as HTMLInputElement).value })"
              />
            </label>
            <button class="ptb-btn" title="清除单元格底纹" :disabled="busy" @click="act({ kind: 'table.cellFill', value: null })">
              无底纹
            </button>
          </div>
        </template>

        <span class="ptb-sep"></span>

        <div class="ptb-grp" role="group" aria-label="效果">
          <button
            class="ptb-btn"
            title="为所选元素添加投影"
            :disabled="busy || sel.kind === 'group'"
            @click="act({ kind: 'element.shadow', value: true })"
          >
            投影
          </button>
          <button
            class="ptb-btn"
            title="移除投影"
            :disabled="busy || sel.kind === 'group'"
            @click="act({ kind: 'element.shadow', value: false })"
          >
            无投影
          </button>
          <label class="ptb-field" title="进入动画（放映时触发）">
            动画
            <select :value="sel.animation ?? ''" :disabled="busy || sel.kind === 'group'" @change="onAnim">
              <option v-for="a in ANIM_ITEMS" :key="a.value" :value="a.value">{{ a.label }}</option>
            </select>
          </label>
        </div>
      </template>

      <template v-else>
        <span class="ptb-hint">{{ hint }}</span>
      </template>
    </div>

    <PptxDeckPanel
      v-if="panel"
      :mode="panel"
      :slide-index="slideIndex"
      :slide-count="slideCount"
      :state="slideState"
      :message="message"
      :busy="busy"
      @action="act"
      @close="panel = null"
    />
  </div>
</template>

<style src="./PptxOpsToolbar.css" scoped></style>
