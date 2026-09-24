<script setup lang="ts">
defineProps<{
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  busy?: boolean
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <div class="cd-mask" @click.self="emit('cancel')">
    <div class="cd-box">
      <div class="cd-title">{{ title }}</div>
      <div class="cd-msg">{{ message }}</div>
      <div class="cd-actions">
        <button class="btn" @click="emit('cancel')">{{ cancelText || '取消' }}</button>
        <button class="btn danger" :disabled="busy" @click="emit('confirm')">
          {{ busy ? '处理中…' : confirmText || '确定' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style src="./ConfirmDialog.css"></style>
