<script setup lang="ts">
/**
 * Office Ribbon：按格式加载 RIBBON 配置，命令经视图 commands 防腐层执行。
 * 下拉 Teleport 到 body + fixed 定位：不受工具条横向滚动容器的裁剪。
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { RIBBON, COLORS, type Item, type Opt, type Tab } from '../ribbon'
import OfficeIcon from './OfficeIcon.vue'

type Commands = Record<string, (...args: any[]) => unknown>
type PopItem = Extract<Item, { t: 'menu' | 'color' }>
const props = defineProps<{
  kind: string
  editable: boolean
  commands?: Commands
  bar?: Record<string, any>
}>()

const active = ref('home')
const note = ref('')
const pop = ref<{ k: string; x: number; y: number; item: PopItem } | null>(null)
const groupsEl = ref<HTMLElement | null>(null)
const groupsOverflow = ref({ left: false, right: false })
let noteTimer = 0
let groupsRo: ResizeObserver | null = null

const tabs = computed<Tab[]>(() => RIBBON[props.kind] ?? [])
const visibleTabs = computed(() => (props.editable ? tabs.value : tabs.value.filter((t) => t.id === 'view')))
const current = computed(() => visibleTabs.value.find((t) => t.id === active.value) ?? visibleTabs.value[0])
const popItems = computed<Opt[]>(() => (pop.value?.item.t === 'menu' ? menuItems(pop.value.item) : []))
const isColorPop = computed(() => pop.value?.item.t === 'color')
watch(() => props.kind, () => { active.value = 'home'; pop.value = null })
watch([active, () => props.kind], () => void nextTick(updateGroupsOverflow))

const key = (gi: number, ii: number) => `${active.value}:${gi}:${ii}`
const has = (cmd: string) => typeof props.commands?.[cmd] === 'function'
const cmdOf = (it: Item): string => ('act' in it ? it.act.cmd : 'cmd' in it ? it.cmd : 'key' in it ? it.key : '')
const bigOf = (it: Item) => (it as { big?: boolean }).big === true
/** B 级按钮（disabled）：灰显，title 必须说明「不支持：<原因>」 */
const titleOf = (it: Item): string => {
  const meta = it as { disabled?: boolean; title?: string; label?: string }
  if (meta.disabled) {
    const t = meta.title ?? ''
    return t.startsWith('不支持：') ? t : `不支持：${t || '该功能在当前实现中不可用'}`
  }
  return meta.title || meta.label || ''
}
const offOf = (it: Item): boolean => (it as { disabled?: boolean }).disabled === true

function flash(msg: string) {
  note.value = msg
  clearTimeout(noteTimer)
  noteTimer = window.setTimeout(() => (note.value = ''), 2600)
}

function call(cmd: string, ...args: unknown[]) {
  const fn = props.commands?.[cmd]
  if (typeof fn !== 'function') return flash(`命令未接入：${cmd}`)
  try {
    const r = fn(...args)
    if (typeof r === 'string') flash(r)
    else if (r instanceof Promise) r.then((v) => { if (typeof v === 'string') flash(v) }).catch((e) => flash(String(e)))
  } catch (e) { flash(String(e)) }
}

/** 插入图片走系统文件选择器；原生 file input 只做选文件 */
function pickFile(cb: (f: Blob) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = () => { const f = input.files?.[0]; if (f) cb(f) }
  input.click()
}

function run(cmd: string, args: unknown[] = []) {
  pop.value = null
  if (cmd === 'insertImage' || cmd === 'replaceImage') return pickFile((f) => call(cmd, f))
  if (cmd === 'insertShape' && args[0] === 'image') return pickFile((f) => call(cmd, 'image', f))
  call(cmd, ...args)
}

function menuItems(it: Extract<Item, { t: 'menu' }>): Opt[] {
  if (it.cmd === 'switchSheet') {
    return (props.bar?.sheets ?? []).map((s: { index: number; name: string }) => ({ label: s.name, args: [s.index] }))
  }
  // 动态菜单：选项由 provider 命令给出（如「最近使用」的函数列表）
  if (it.optsFrom) {
    const fn = props.commands?.[it.optsFrom]
    if (typeof fn === 'function') {
      const v = fn()
      if (Array.isArray(v)) return v as Opt[]
    }
  }
  return it.items
}

/** 视口内定位：下方空间不足时上翻，右侧空间不足时左移 */
function place(k: string, it: PopItem, ev: MouseEvent) {
  if (pop.value?.k === k) { pop.value = null; return }
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  const h = it.t === 'color' ? 96 : Math.min(300, Math.max(44, menuItems(it).length * 28 + 10))
  const y = r.bottom + h + 8 > window.innerHeight ? Math.max(4, r.top - h - 4) : r.bottom + 4
  const x = Math.max(4, Math.min(r.left, window.innerWidth - 206))
  pop.value = { k, x, y, item: it }
}

function runMenu(o: Opt) {
  const it = pop.value?.item
  if (!it || it.t !== 'menu') return
  pop.value = null
  run(it.cmd, o.args ?? ((it.cmd === 'insertFunc' || it.cmd === 'openFuncByName') ? [o.label] : []))
}

function pickColor(color: string | null) {
  const it = pop.value?.item
  if (!it || it.t !== 'color') return
  pop.value = null
  const v = it.wrap === 'patch' && color ? { [it.key ?? 'color']: color } : color
  run(it.cmd, [v])
}

function toggle(it: Extract<Item, { t: 'toggle' }>) {
  pop.value = null
  const on = !props.bar?.[it.key]
  if (props.bar) props.bar[it.key] = on
  call(it.key, on)
}

function closeMenus() { pop.value = null }
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeMenus() }
/** 与顶部页签条一致：滚轮横转 + 左右箭头 + 边缘淡出，右侧命令可见可达 */
function updateGroupsOverflow() {
  const el = groupsEl.value
  if (!el) return
  groupsOverflow.value = {
    left: el.scrollLeft > 1,
    right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1
  }
}

function scrollGroups(dir: number) {
  const el = groupsEl.value
  if (!el) return
  el.scrollLeft += dir * 240
  updateGroupsOverflow()
}

function onWheel(e: WheelEvent) {
  const el = e.currentTarget as HTMLElement
  if (el.scrollWidth <= el.clientWidth) return
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!delta) return
  el.scrollLeft += delta
  e.preventDefault()
  updateGroupsOverflow()
}
onMounted(() => {
  document.addEventListener('click', closeMenus)
  window.addEventListener('resize', closeMenus)
  window.addEventListener('resize', updateGroupsOverflow)
  window.addEventListener('scroll', closeMenus, true)
  window.addEventListener('keydown', onKey)
  groupsRo = new ResizeObserver(updateGroupsOverflow)
  if (groupsEl.value) groupsRo.observe(groupsEl.value)
  nextTick(updateGroupsOverflow)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', closeMenus)
  window.removeEventListener('resize', closeMenus)
  window.removeEventListener('resize', updateGroupsOverflow)
  window.removeEventListener('scroll', closeMenus, true)
  window.removeEventListener('keydown', onKey)
  groupsRo?.disconnect()
  groupsRo = null
  clearTimeout(noteTimer)
})
</script>

<template>
  <div v-if="current" class="ot-ribbon" @click.stop>
    <div class="ot-tabs">
      <button
        v-for="t in visibleTabs"
        :key="t.id"
        class="ot-tab"
        :class="{ 'ot-tab-on': current.id === t.id }"
        @click="active = t.id; pop = null"
      >{{ t.label }}</button>
      <span class="ot-kind">{{ kind.toUpperCase() }}</span>
      <span v-if="!editable" class="ot-readonly">只读 · 仅视图操作</span>
    </div>
    <div class="ot-groups-wrap">
      <button v-if="groupsOverflow.left" class="ot-arrow ot-arrow-left" title="向左滚动" @click="scrollGroups(-1)">‹</button>
      <div ref="groupsEl" class="ot-groups" @scroll="updateGroupsOverflow" @wheel="onWheel">
      <div v-for="(g, gi) in current.groups" :key="g.name" class="ot-group">
        <div class="ot-group-items">
          <template v-for="(it, ii) in g.items" :key="ii">
            <span v-if="it.t === 'sep'" class="ot-sep"></span>
            <button
              v-else-if="it.t === 'btn'"
              class="ot-btn"
              :class="[{ 'ot-big': bigOf(it), 'ot-on': props.bar?.painter && (it.act.cmd === 'painter' || it.act.cmd === 'copyFormat') }, { 'ot-off': offOf(it) }]"
              :title="titleOf(it)"
              :disabled="offOf(it) || !has(it.act.cmd)"
              @click="run(it.act.cmd, it.act.args)"
            >
              <OfficeIcon :cmd="it.act.cmd" :label="it.label" /><span>{{ it.label }}</span>
            </button>
            <button
              v-else-if="it.t === 'toggle'"
              class="ot-btn"
              :class="[{ 'ot-big': bigOf(it), 'ot-on': !!props.bar?.[it.key] }, { 'ot-off': offOf(it) }]"
              :title="titleOf(it)"
              :disabled="offOf(it) || !has(it.key)"
              @click="toggle(it)"
            >
              <OfficeIcon :cmd="it.key" :label="it.label" /><span>{{ it.label }}</span>
            </button>
            <button
              v-else-if="it.t === 'menu'"
              class="ot-btn ot-menu-btn"
              :class="[{ 'ot-big': bigOf(it), 'ot-open': pop?.k === key(gi, ii) }, { 'ot-off': offOf(it) }]"
              :title="titleOf(it)"
              :disabled="offOf(it)"
              @click="place(key(gi, ii), it, $event)"
            >
              <OfficeIcon :cmd="it.cmd" :label="it.label" /><span>{{ it.label }}</span><span class="ot-caret">▾</span>
            </button>
            <button
              v-else-if="it.t === 'color'"
              class="ot-btn ot-menu-btn"
              :class="[{ 'ot-big': bigOf(it), 'ot-open': pop?.k === key(gi, ii) }, { 'ot-off': offOf(it) }]"
              :title="titleOf(it)"
              :disabled="offOf(it)"
              @click="place(key(gi, ii), it, $event)"
            >
              <OfficeIcon :cmd="it.cmd" :label="it.label" /><span>{{ it.label }}</span><span class="ot-caret">▾</span>
            </button>
          </template>
        </div>
        <div class="ot-group-name">{{ g.name }}</div>
      </div>
      </div>
      <button v-if="groupsOverflow.right" class="ot-arrow ot-arrow-right" title="向右滚动" @click="scrollGroups(1)">›</button>
      <div class="ot-fade left" :class="{ show: groupsOverflow.left }"></div>
      <div class="ot-fade right" :class="{ show: groupsOverflow.right }"></div>
    </div>
    <div v-if="note" class="ot-flash">{{ note }}</div>
  </div>

  <Teleport to="body">
    <div
      v-if="pop"
      class="ot-pop"
      :class="{ 'ot-pop-swatches': isColorPop }"
      :style="{ '--pop-x': pop.x + 'px', '--pop-y': pop.y + 'px' }"
      @click.stop
    >
      <template v-if="isColorPop">
        <button
          v-for="c in COLORS"
          :key="c"
          class="ot-swatch"
          :style="{ '--swatch': c }"
          :title="c"
          @click="pickColor(c)"
        ></button>
        <button class="ot-item ot-clear" @click="pickColor(null)">清除</button>
      </template>
      <template v-else>
        <button
          v-for="(o, oi) in popItems"
          :key="oi"
          class="ot-item"
          :class="{ 'ot-item-sep': o.sep }"
          :title="o.hint || o.label"
          @click="runMenu(o)"
        >
          <span>{{ o.label }}</span><span v-if="o.hint" class="ot-hint">{{ o.hint }}</span>
        </button>
        <div v-if="!popItems.length" class="ot-item ot-empty">无可用项</div>
      </template>
    </div>
  </Teleport>
</template>

<style src="./OfficeToolbar.css"></style>
