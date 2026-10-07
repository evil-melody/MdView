<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

function flip() {
  if (!props.disabled) emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    type="button"
    class="toggle"
    :class="{ on: modelValue }"
    :disabled="disabled"
    role="switch"
    :aria-checked="modelValue"
    @click="flip"
  >
    <span class="knob" />
  </button>
</template>

<style src="./ToggleSwitch.css"></style>
