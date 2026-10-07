<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export interface SelectOption {
  value: string
  label: string
}

const props = defineProps<{
  modelValue: string
  options: SelectOption[]
  placeholder?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

const current = computed(() => props.options.find((o) => o.value === props.modelValue))

function pick(v: string) {
  emit('update:modelValue', v)
  open.value = false
}

function onDocClick(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="selmenu">
    <button type="button" class="selmenu-btn" :class="{ open }" @click="open = !open">
      <span class="selmenu-label" :class="{ placeholder: !current }">
        {{ current?.label ?? placeholder ?? '请选择' }}
      </span>
      <span class="selmenu-caret" :class="{ up: open }">▾</span>
    </button>
    <ul v-if="open" class="selmenu-list" role="listbox">
      <li
        v-for="o in options"
        :key="o.value"
        class="selmenu-item"
        :class="{ active: o.value === modelValue }"
        role="option"
        :aria-selected="o.value === modelValue"
        @click="pick(o.value)"
      >
        <span class="selmenu-check">{{ o.value === modelValue ? '✓' : '' }}</span>
        <span>{{ o.label }}</span>
      </li>
    </ul>
  </div>
</template>

<style src="./SelectMenu.css"></style>
