<script setup lang="ts">
/**
 * 共享 Office 工具栏外观：撤销/重做、字体、字号、B/I/U/S、颜色/高亮、
 * 清除格式、上标/下标、对齐、标题、引用、代码、分割线、缩进、列表。
 * 所有动作通过事件上抛，执行与状态刷新由 useOfficeToolbar 负责。
 */
const props = defineProps<{
  fontSizes: { label: string; value: string }[]
  activeFormats: Record<string, boolean>
  fontFamily: string
  fontSize: string
}>()

const emit = defineEmits<{
  (e: 'exec', cmd: string, value: string | null): void
  (e: 'font', name: string): void
  (e: 'size', value: string): void
  (e: 'color', hex: string): void
  (e: 'hilite', hex: string): void
}>()

function ex(cmd: string, value: string | null = null) {
  emit('exec', cmd, value)
}
</script>

<template>
  <div class="dtb-bar">
    <button class="dtb-btn" title="撤销" @mousedown.prevent @click="ex('undo')">↶</button>
    <button class="dtb-btn" title="重做" @mousedown.prevent @click="ex('redo')">↷</button>
    <span class="dtb-sep"></span>
    <select
      class="dtb-sel dtb-sel-font"
      title="字体"
      :value="fontFamily"
      @change="emit('font', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">字体</option>
      <option value="Microsoft YaHei">微软雅黑</option>
      <option value="PingFang SC">苹方</option>
      <option value="SimSun">宋体</option>
    </select>
    <select
      class="dtb-sel dtb-sel-size"
      title="字号"
      :value="fontSize"
      @change="emit('size', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">字号</option>
      <option v-for="s in fontSizes" :key="s.value" :value="s.value">{{ s.label }}</option>
    </select>
    <span class="dtb-sep"></span>
    <button
      class="dtb-btn"
      :class="{ active: activeFormats.bold }"
      title="加粗"
      @mousedown.prevent
      @click="ex('bold')"
    >B</button>
    <button
      class="dtb-btn"
      :class="{ active: activeFormats.italic }"
      title="斜体"
      @mousedown.prevent
      @click="ex('italic')"
    ><i>I</i></button>
    <button
      class="dtb-btn"
      :class="{ active: activeFormats.underline }"
      title="下划线"
      @mousedown.prevent
      @click="ex('underline')"
    >U</button>
    <button
      class="dtb-btn"
      :class="{ active: activeFormats.strikeThrough }"
      title="删除线"
      @mousedown.prevent
      @click="ex('strikeThrough')"
    >S</button>
    <input
      class="dtb-color"
      type="color"
      title="字体颜色"
      @mousedown.prevent
      @input="emit('color', ($event.target as HTMLInputElement).value)"
    />
    <input
      class="dtb-color"
      type="color"
      title="背景颜色"
      @mousedown.prevent
      @input="emit('hilite', ($event.target as HTMLInputElement).value)"
    />
    <button class="dtb-btn" title="清除格式" @mousedown.prevent @click="ex('removeFormat')">⌫</button>
    <button class="dtb-btn" title="上标" @mousedown.prevent @click="ex('superscript')">x²</button>
    <button class="dtb-btn" title="下标" @mousedown.prevent @click="ex('subscript')">x₂</button>
    <span class="dtb-sep"></span>
    <button
      class="dtb-btn"
      :class="{ active: activeFormats.justifyLeft }"
      title="左对齐"
      @mousedown.prevent
      @click="ex('justifyLeft')"
    >⇤</button>
    <button
      class="dtb-btn"
      :class="{ active: activeFormats.justifyCenter }"
      title="居中"
      @mousedown.prevent
      @click="ex('justifyCenter')"
    >⇔</button>
    <button
      class="dtb-btn"
      :class="{ active: activeFormats.justifyRight }"
      title="右对齐"
      @mousedown.prevent
      @click="ex('justifyRight')"
    >⇥</button>
    <span class="dtb-sep"></span>
    <button class="dtb-btn" title="一级标题" @mousedown.prevent @click="ex('formatBlock', 'h1')">H1</button>
    <button class="dtb-btn" title="二级标题" @mousedown.prevent @click="ex('formatBlock', 'h2')">H2</button>
    <button class="dtb-btn" title="三级标题" @mousedown.prevent @click="ex('formatBlock', 'h3')">H3</button>
    <button class="dtb-btn" title="正文" @mousedown.prevent @click="ex('formatBlock', 'p')">正文</button>
    <button class="dtb-btn" title="引用" @mousedown.prevent @click="ex('formatBlock', 'blockquote')">❝</button>
    <button class="dtb-btn" title="代码块" @mousedown.prevent @click="ex('formatBlock', 'pre')">{ }</button>
    <button class="dtb-btn" title="分割线" @mousedown.prevent @click="ex('insertHorizontalRule')">—</button>
    <span class="dtb-sep"></span>
    <button class="dtb-btn" title="减少缩进" @mousedown.prevent @click="ex('outdent')">⇤</button>
    <button class="dtb-btn" title="增加缩进" @mousedown.prevent @click="ex('indent')">⇥</button>
    <span class="dtb-sep"></span>
    <button
      class="dtb-btn"
      :class="{ active: activeFormats.insertUnorderedList }"
      title="无序列表"
      @mousedown.prevent
      @click="ex('insertUnorderedList')"
    >• 列表</button>
    <button
      class="dtb-btn"
      :class="{ active: activeFormats.insertOrderedList }"
      title="有序列表"
      @mousedown.prevent
      @click="ex('insertOrderedList')"
    >1. 列表</button>
  </div>
</template>

<style src="./DocToolbar.css" scoped></style>
