<script setup lang="ts">
/**
 * PPT 主题 / 母版 / 版式编辑侧面板（视图内入口，不改 ribbon）。
 * 展示当前 master、可切换 layout 列表、clrScheme 配色编辑与母版背景编辑。
 * 所有编辑以 ShapeOp 形式 emit('apply')，由视图走 pptx.shapes → 内核写真实 OOXML。
 */
import { ref, watch } from 'vue'
import type { ShapeOp, SlideThemeInfo } from '../core/pptx/types'

const props = defineProps<{ theme: SlideThemeInfo; editable: boolean }>()
const emit = defineEmits<{
  (e: 'apply', op: ShapeOp): void
  (e: 'close'): void
}>()

/** clrScheme 里可编辑的配色键（顺序与 Office「自定义颜色」一致） */
const COLOR_KEYS: { key: string; label: string }[] = [
  { key: 'dk1', label: '深色 1 (dk1)' },
  { key: 'lt1', label: '浅色 1 (lt1)' },
  { key: 'dk2', label: '深色 2 (dk2)' },
  { key: 'lt2', label: '浅色 2 (lt2)' },
  { key: 'accent1', label: '强调 1' },
  { key: 'accent2', label: '强调 2' },
  { key: 'accent3', label: '强调 3' },
  { key: 'accent4', label: '强调 4' },
  { key: 'accent5', label: '强调 5' },
  { key: 'accent6', label: '强调 6' },
  { key: 'hlink', label: '超链接' },
  { key: 'folHlink', label: '已访问链接' },
]

const bg = ref('')
watch(() => props.theme.master.bg, (v) => { bg.value = v ?? '' }, { immediate: true })

/** 只接受 #RRGGBB（# 可省），统一成大写带 # */
function norm(v: string): string | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(v.trim())
  return m ? '#' + m[1].toUpperCase() : null
}

function onColor(key: string, ev: Event) {
  const c = norm((ev.target as HTMLInputElement).value)
  if (c && props.editable) emit('apply', { op: 'themeColor', key, color: c })
}

function applyBg(clear: boolean) {
  if (!props.editable) return
  if (clear) { bg.value = ''; emit('apply', { op: 'masterBg', color: null }); return }
  const c = norm(bg.value)
  if (c) emit('apply', { op: 'masterBg', color: c })
}
</script>

<template>
  <div class="ov-theme-panel" @click.stop @contextmenu.stop @pointerdown.stop>
    <div class="ov-theme-head">
      <span class="ov-theme-title">母版 / 主题</span>
      <button class="ov-theme-close" type="button" aria-label="关闭" @click="emit('close')">×</button>
    </div>

    <div class="ov-theme-sec">
      <div class="ov-theme-label">当前母版</div>
      <div class="ov-theme-val">{{ theme.master.name }}</div>
      <div class="ov-theme-label">版式（点击切换当前幻灯片）</div>
      <div class="ov-theme-layouts">
        <button
          v-for="l in theme.layouts"
          :key="l.path"
          type="button"
          class="ov-theme-layout"
          :class="{ 'ov-theme-layout-on': l.path === theme.layout }"
          :disabled="!editable"
          @click="emit('apply', { op: 'setLayout', layout: l.path })"
        >{{ l.name }}</button>
      </div>
    </div>

    <div class="ov-theme-sec">
      <div class="ov-theme-label">主题配色（输入 #RRGGBB，回车或失焦应用，即时反映到形状）</div>
      <div v-for="c in COLOR_KEYS" :key="c.key" class="ov-theme-row">
        <span class="ov-theme-swatch" :style="{ background: theme.colors[c.key] }"></span>
        <span class="ov-theme-key">{{ c.label }}</span>
        <input
          class="op-prompt-input ov-theme-input"
          type="text"
          spellcheck="false"
          :value="theme.colors[c.key]"
          :disabled="!editable"
          @change="onColor(c.key, $event)"
          @keyup.enter="onColor(c.key, $event)"
        />
      </div>
    </div>

    <div class="ov-theme-sec">
      <div class="ov-theme-label">母版背景（作用于整份母版的所有页）</div>
      <div class="ov-theme-row">
        <input
          v-model="bg"
          class="op-prompt-input ov-theme-input"
          type="text"
          spellcheck="false"
          placeholder="#RRGGBB（留空清除）"
          :disabled="!editable"
          @keyup.enter="applyBg(false)"
        />
        <button type="button" class="ov-theme-act" :disabled="!editable" @click="applyBg(false)">应用</button>
        <button type="button" class="ov-theme-act" :disabled="!editable" @click="applyBg(true)">清除</button>
      </div>
    </div>
  </div>
</template>

<style src="../office-views.css"></style>
<style src="../office-shape.css"></style>
