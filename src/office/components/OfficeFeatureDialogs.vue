<script setup lang="ts">
/** 三个特性编辑对话框的统一出口（让 OfficeSheetView 只挂一个组件，避免主视图超 2000 行）。 */
import type { CondFmtRule, ValidationRule, Range as XRange } from '../core/xlsx/types'
import OfficeCondFmtDialog from './OfficeCondFmtDialog.vue'
import OfficeValidationDialog from './OfficeValidationDialog.vue'
import OfficeSlicerDialog from './OfficeSlicerDialog.vue'

defineProps<{
  condOpen: boolean
  condRules: CondFmtRule[]
  valOpen: boolean
  valRules: ValidationRule[]
  slicerOpen: boolean
  slicerFields: { c: number; name: string }[]
  selRange: XRange
}>()
const emit = defineEmits<{
  (e: 'condConfirm', rules: CondFmtRule[]): void
  (e: 'condCancel'): void
  (e: 'valConfirm', rules: ValidationRule[]): void
  (e: 'valCancel'): void
  (e: 'slicerConfirm', p: { fieldCol: number; fieldName: string }): void
  (e: 'slicerCancel'): void
}>()
</script>

<template>
  <OfficeCondFmtDialog :open="condOpen" :rules="condRules" :sel-range="selRange" @confirm="emit('condConfirm', $event)" @cancel="emit('condCancel')" />
  <OfficeValidationDialog :open="valOpen" :rules="valRules" :sel-range="selRange" @confirm="emit('valConfirm', $event)" @cancel="emit('valCancel')" />
  <OfficeSlicerDialog :open="slicerOpen" :fields="slicerFields" @confirm="emit('slicerConfirm', $event)" @cancel="emit('slicerCancel')" />
</template>
