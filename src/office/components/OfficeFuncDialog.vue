<script setup lang="ts">
/**
 * Office 式「插入函数」向导（报障②）：两步同框——
 *  pick：搜索 / 函数类别（自绘下拉）/ 函数列表 / 说明；
 *  args：函数参数逐槽输入 + 公式预览 + 求值结果（内核引擎实时算）。
 * 状态与求值全在 composables/useFuncWizard，本组件只做渲染与事件转发。
 * 无原生 select；样式在 office-funcdlg.css（对话框外壳复用 office-subtotal.css）。
 */
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type { useFuncWizard } from '../composables/useFuncWizard'
import { FUNC_CATS } from '../composables/useFuncWizard'

const props = defineProps<{ wiz: ReturnType<typeof useFuncWizard> }>()
const emit = defineEmits<{ (e: 'insert', formula: string): void; (e: 'cancel'): void }>()

const st = props.wiz.st
const step = computed(() => st.step)
const ddCat = ref(false)

const cats = FUNC_CATS.map((c) => c.name)
const list = computed(() => props.wiz.list())
const meta = computed(() => props.wiz.meta())
const signature = computed(() => {
  const f = meta.value
  if (!f) return ''
  return `${f.name}(${f.args.join(', ')}${f.variadic ? ', ...' : ''})`
})
/** 搜索态下类别下拉失效（与 Excel 一致：输入即跨类搜索，类别灰显） */
const searching = computed(() => st.search.trim() !== '')

watch(
  () => st.open,
  (v) => {
    if (v) ddCat.value = false
  }
)

function pickFn(name: string) {
  props.wiz.setFn(name)
  props.wiz.goArgs()
}
function confirmPick() {
  if (!st.fn) return
  props.wiz.goArgs()
}
function back() {
  props.wiz.goBack()
}
function ok() {
  emit('insert', props.wiz.formula())
}
function onArg(i: number, e: Event) {
  props.wiz.setArg(i, (e.target as HTMLInputElement).value)
}
/** 进参数步自动聚焦第一个空槽（Office 行为：光标直接落在 number1 上） */
const argEl = ref<HTMLInputElement[]>()
watch(
  () => st.step,
  (s) => {
    if (s !== 'args') return
    requestAnimationFrame(() => {
      const inputs = (argEl.value ?? []) as HTMLInputElement[]
      const i = props.wiz.activeArg()
      inputs[i]?.focus()
    })
  }
)
/** variadic 函数：最后一个槽填满才可再加（Excel「添加参数」） */
const canAddArg = computed(() => {
  const f = meta.value
  return !!f && f.variadic && st.args[st.args.length - 1].trim() !== ''
})
function onKey(e: KeyboardEvent) {
  if (!st.open) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    if (ddCat.value) ddCat.value = false
    else if (st.step === 'args') props.wiz.goBack()
    else emit('cancel')
  } else if (e.key === 'Enter' && st.step === 'args') {
    e.preventDefault()
    ok()
  }
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true)
  endDrag()
})

/** 标题栏拖动（Office 对话框语义）：pointer 捕获在 window 上，卸载兜底解绑 */
const floatEl = ref<HTMLDivElement | null>(null)
const pos = ref<{ x: number; y: number } | null>(null)
let dragOff = { x: 0, y: 0 }
function onDragStart(e: PointerEvent) {
  const el = floatEl.value
  if (!el) return
  const b = el.getBoundingClientRect()
  dragOff = { x: e.clientX - b.left, y: e.clientY - b.top }
  pos.value = { x: b.left, y: b.top }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', endDrag)
  e.preventDefault()
}
function onDragMove(e: PointerEvent) {
  const el = floatEl.value
  if (!el) return
  const w = el.offsetWidth, h = el.offsetHeight
  pos.value = {
    x: Math.max(4, Math.min(window.innerWidth - w - 4, e.clientX - dragOff.x)),
    y: Math.max(4, Math.min(window.innerHeight - h - 4, e.clientY - dragOff.y))
  }
}
function endDrag() {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', endDrag)
}
const floatStyle = computed(() =>
  pos.value ? { left: `${pos.value.x}px`, top: `${pos.value.y}px` } : { left: '50%', top: '88px', transform: 'translateX(-50%)' }
)
</script>

<template>
  <Teleport to="body">
    <!-- 非模态（Office 语义）：无全屏遮罩，向导开着时仍可拖网格拾取参数区域 -->
    <div v-if="st.open" ref="floatEl" class="ov-fd-float ov-dlg ov-fd" role="dialog" :style="floatStyle" @click.stop>
        <div class="ov-dlg-title" @pointerdown="onDragStart">{{ step === 'pick' ? '插入函数' : '函数参数' }}</div>
        <div class="ov-dlg-body">
          <template v-if="step === 'pick'">
            <div class="ov-dlg-row">
              <div class="ov-dlg-label">搜索函数：</div>
              <input class="ov-fd-search" :value="st.search" placeholder="输入关键字或函数名"
                @input="wiz.setSearch(($event.target as HTMLInputElement).value)" />
            </div>
            <div class="ov-dlg-row">
              <div class="ov-dlg-label">或选择类别：</div>
              <div class="ov-dd" :class="{ 'ov-fd-off': searching }">
                <button class="ov-dd-btn" type="button" :disabled="searching"
                  @click.stop="!searching && (ddCat = !ddCat)">
                  <span class="ov-dd-cur">{{ st.cat }}</span><span class="ov-dd-arrow">▾</span>
                </button>
                <div v-if="ddCat" class="ov-dd-back" @click.stop="ddCat = false"></div>
                <div v-if="ddCat" class="ov-dd-pop">
                  <button v-for="c in cats" :key="c" class="ov-dd-item" :class="{ 'ov-dd-on': c === st.cat }"
                    type="button" @click.stop="wiz.setCat(c); ddCat = false">{{ c }}</button>
                </div>
              </div>
            </div>
            <div class="ov-dlg-label">选择函数：</div>
            <div class="ov-fd-list scrollable">
              <button v-for="n in list" :key="n" class="ov-fd-item" :class="{ 'ov-fd-on': n === st.fn }"
                type="button" @click="wiz.setFn(n)" @dblclick="pickFn(n)">{{ n }}</button>
              <div v-if="!list.length" class="ov-fd-empty">无匹配函数</div>
            </div>
            <div class="ov-dlg-label">说明：</div>
            <div class="ov-fd-desc">
              <div class="ov-fd-sig">{{ signature }}</div>
              <div>{{ meta?.desc || '—' }}</div>
            </div>
          </template>
          <template v-else>
            <div class="ov-fd-fnhead">{{ signature }}</div>
            <div class="ov-fd-args">
              <div v-for="(a, i) in st.args" :key="i" class="ov-fd-argrow">
                <div class="ov-fd-argname">{{ wiz.argLabel(i) }}</div>
                <input ref="argEl" class="ov-fd-argin" :value="a" :placeholder="i === 0 ? '单元格区域，如 I2:I9' : '值或引用'"
                  @input="onArg(i, $event)" />
              </div>
              <button v-if="canAddArg" class="ov-fd-add" type="button" @click="wiz.addArg()">+ 添加参数</button>
            </div>
            <div class="ov-fd-sect">
              <div class="ov-dlg-label">公式：</div>
              <div class="ov-fd-formula">{{ wiz.formula() }}</div>
            </div>
            <div class="ov-fd-sect">
              <div class="ov-dlg-label">求值结果：</div>
              <div class="ov-fd-preview" :class="{ 'ov-fd-err': /^#/.test(st.preview) }">
                {{ st.preview || '（填写参数后实时计算）' }}
              </div>
            </div>
          </template>
        </div>
        <div class="ov-dlg-foot">
          <button v-if="step === 'args'" class="ov-dlg-btn" type="button" @click="back">返回</button>
          <button class="ov-dlg-btn" type="button" @click="emit('cancel')">取消</button>
          <button v-if="step === 'pick'" class="ov-dlg-btn ov-dlg-ok" type="button" :disabled="!st.fn" @click="confirmPick">确定</button>
          <button v-else class="ov-dlg-btn ov-dlg-ok" type="button" @click="ok">确定</button>
        </div>
    </div>
  </Teleport>
</template>

<style src="../office-funcdlg.css"></style>
