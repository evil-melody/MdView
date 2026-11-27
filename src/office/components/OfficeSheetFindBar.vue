<script setup lang="ts">
/**
 * Excel 查找替换条（自 OfficeSheetView 抽离以守 2000 行上限）：持有打开态 / 关键字 /
 * 命中列表 / 游标；查找与替换在本组件执行内核调用，命中跳转经 goto 事件回父视图
 * （select+reveal），替换完成经 changed 事件回父视图刷缓存重载。Tauri WebView 无
 * window.prompt，全部走内联 UI。open 状态经暴露供父视图守卫（compositionend 不抢焦点）。
 */
import { reactive, ref } from 'vue'
import type { DocumentClient } from '../client'

const props = defineProps<{
  client: DocumentClient
  sheet: () => number
}>()
const emit = defineEmits<{
  (e: 'goto', hit: { r: number; c: number }): void
  (e: 'changed'): void
  (e: 'error', msg: string): void
}>()

/** 查找替换条状态：open 供父视图守卫，其余为框内受控值 */
const findBar = reactive({ open: false, showReplace: false, find: '', replace: '', busy: false })
const findHits = ref<{ r: number; c: number; text: string }[]>([])
const findIdx = ref(-1)
function openFindBar(q?: string) {
  findBar.open = true
  if (q) findBar.find = q
}
function openReplaceBar() {
  findBar.open = true
  findBar.showReplace = true
}
async function runFind() {
  const s = findBar.find
  if (!s) { findHits.value = []; findIdx.value = -1; return }
  try {
    const hits = await props.client.call('xlsx.find', props.sheet(), s)
    findHits.value = hits ?? []
    findIdx.value = findHits.value.length ? 0 : -1
    if (findHits.value.length) emit('goto', findHits.value[0])
  } catch (e) {
    emit('error', String(e))
  }
}
function findNext() {
  if (!findHits.value.length) return
  findIdx.value = (findIdx.value + 1) % findHits.value.length
  emit('goto', findHits.value[findIdx.value])
}
function findPrev() {
  if (!findHits.value.length) return
  findIdx.value = (findIdx.value - 1 + findHits.value.length) % findHits.value.length
  emit('goto', findHits.value[findIdx.value])
}
async function replaceAll() {
  const q = findBar.find
  if (!q) return
  try {
    await props.client.call('xlsx.replace', props.sheet(), q, findBar.replace)
    emit('changed')
    await runFind() // 替换后刷新命中列表（与旧父视图行为一致）
  } catch (e) {
    emit('error', String(e))
  }
}
function closeFindBar() {
  findBar.open = false
  findBar.showReplace = false
}

defineExpose({ findBar, openFindBar, openReplaceBar, runFind, findNext, findPrev, replaceAll, closeFindBar })
</script>

<template>
  <div v-if="findBar.open" class="ov-findbar">
    <input
      v-model="findBar.find"
      class="ov-find-input"
      placeholder="查找内容，回车查找"
      @keydown.enter.prevent="runFind"
      @input="findHits = []; findIdx = -1"
    />
    <span class="ov-find-count">{{ findHits.length ? `${findIdx + 1} / ${findHits.length}` : (findBar.find ? '无匹配' : '') }}</span>
    <button class="ov-find-btn" title="上一个" @click="findPrev()">↑</button>
    <button class="ov-find-btn" title="下一个" @click="findNext()">↓</button>
    <button class="ov-find-btn" :class="{ 'ov-find-on': findBar.showReplace }" title="替换" @click="findBar.showReplace = !findBar.showReplace">替换</button>
    <button class="ov-find-btn" title="关闭" @click="closeFindBar">✕</button>
    <template v-if="findBar.showReplace">
      <input v-model="findBar.replace" class="ov-find-input" placeholder="替换为" @keydown.enter.prevent="replaceAll()" />
      <button class="ov-find-btn" @click="replaceAll()">全部替换</button>
    </template>
  </div>
</template>
