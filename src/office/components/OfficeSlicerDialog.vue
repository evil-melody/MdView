<script setup lang="ts">
/** 插入切片器对话框：选一个字段列（自绘下拉），父视图据该列去重得到按钮组。 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

interface Field { c: number; name: string }
const props = defineProps<{ open: boolean; fields: Field[] }>()
const emit = defineEmits<{ (e: 'confirm', p: { fieldCol: number; fieldName: string }): void; (e: 'cancel'): void }>()
const pick = ref(0)
const dd = ref(false)
watch(() => props.open, (v) => { if (v) { pick.value = props.fields[0]?.c ?? 0; dd.value = false } })
const name = () => props.fields.find((f) => f.c === pick.value)?.name ?? '（请选择）'
function ok() { const f = props.fields.find((x) => x.c === pick.value); if (f) emit('confirm', { fieldCol: f.c, fieldName: f.name }) }
function onKey(e: KeyboardEvent) { if (props.open && e.key === 'Escape') { e.stopPropagation(); emit('cancel') } }
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ov-dlg-overlay" @click="emit('cancel')">
      <div class="ov-dlg" role="dialog" aria-modal="true" @click.stop>
        <div class="ov-dlg-title">插入切片器</div>
        <div class="ov-dlg-body">
          <div class="ov-dlg-row">
            <div class="ov-dlg-label">筛选字段（按该列去重生成按钮）：</div>
            <div class="ov-dd">
              <button class="ov-dd-btn" type="button" @click.stop="dd = !dd"><span class="ov-dd-cur">{{ name() }}</span><span class="ov-dd-arrow">▾</span></button>
              <div v-if="dd" class="ov-dd-back" @click.stop="dd = false"></div>
              <div v-if="dd" class="ov-dd-pop">
                <button v-for="f in fields" :key="f.c" class="ov-dd-item" :class="{ 'ov-dd-on': f.c === pick }" type="button" @click.stop="pick = f.c; dd = false">{{ f.name }}</button>
              </div>
            </div>
          </div>
          <div class="ov-feat-note">切片器会把该列的值写成可点按钮组；点选即按值筛选（隐藏不匹配行）。</div>
        </div>
        <div class="ov-dlg-foot">
          <button class="ov-dlg-btn" type="button" @click="emit('cancel')">取消</button>
          <button class="ov-dlg-btn ov-dlg-ok" type="button" @click="ok">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
