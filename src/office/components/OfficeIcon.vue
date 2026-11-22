<script setup lang="ts">
/** Ribbon 图标渲染：路径来自 icons.ts，视觉由 OfficeToolbar.css 统一控制 */
import { computed } from 'vue'
import { iconFor } from '../icons'

const props = defineProps<{ cmd: string; label: string }>()
const paths = computed(() => iconFor(props.cmd, props.label))
</script>

<template>
  <svg class="ot-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>
