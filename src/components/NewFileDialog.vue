<script setup lang="ts">
import { computed, ref } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { NEW_FILE_TYPES, type NewFileType } from '../types'

const props = defineProps<{ defaultDir: string }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'create', payload: { type: NewFileType; name: string; dir: string }): void
}>()

const selected = ref<NewFileType>(NEW_FILE_TYPES[0])
const name = ref('')
const dir = ref(props.defaultDir)
const error = ref('')

const fileName = computed(() => `${name.value}.${selected.value.ext}`)
const canSubmit = computed(() => !!name.value.trim() && !!dir.value)

function pick(t: NewFileType) {
  selected.value = t
  error.value = ''
}

/** 文件名净化：去掉路径分隔符与文件系统非法字符，剥掉重复的扩展名后缀 */
function sanitize(v: string): string {
  return v
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(new RegExp(`\\.${selected.value.ext}$`, 'i'), '')
    .trim()
}

async function changeDir() {
  const sel = await open({ directory: true, multiple: false })
  if (typeof sel === 'string' && sel) dir.value = sel
}

function submit() {
  const clean = sanitize(name.value)
  if (!clean) {
    error.value = '请输入文件名'
    return
  }
  emit('create', { type: selected.value, name: clean, dir: dir.value })
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog nf-dialog">
      <div class="dlg-head">
        <span class="dlg-title">新建文件</span>
        <span class="dlg-count">{{ NEW_FILE_TYPES.length }} 种类型</span>
        <button class="btn ghost" @click="emit('close')">✕</button>
      </div>

      <div class="dlg-body scrollable">
        <div class="nf-label">选择类型</div>
        <div class="nf-types">
          <button
            v-for="t in NEW_FILE_TYPES"
            :key="t.key"
            class="nf-type"
            :class="{ on: t.key === selected.key }"
            :title="'新建 ' + t.label + ' 文件'"
            @click="pick(t)"
          >
            <span class="nf-ico">{{ t.icon }}</span>
            <span class="nf-name">{{ t.label }}</span>
            <span class="nf-ext">.{{ t.ext }}</span>
          </button>
        </div>

        <div class="nf-label">文件名</div>
        <div class="nf-input">
          <input
            v-model="name"
            placeholder="未命名"
            spellcheck="false"
            @keyup.enter="submit"
            @input="error = ''"
          />
          <span class="nf-suffix">.{{ selected.ext }}</span>
        </div>

        <div class="nf-label">保存位置</div>
        <div class="nf-dir">
          <span class="nf-dir-path" :title="dir">{{ dir }}</span>
          <button class="btn" @click="changeDir">更改…</button>
        </div>

        <div v-if="error" class="nf-error">{{ error }}</div>
        <div v-else class="nf-hint">将创建 {{ fileName }}，创建后直接进入编辑</div>
      </div>

      <div class="dlg-foot">
        <div class="foot-spacer"></div>
        <button class="btn" @click="emit('close')">取消</button>
        <button class="btn primary" :disabled="!canSubmit" @click="submit">创建并编辑</button>
      </div>
    </div>
  </div>
</template>

<style src="./NewFileDialog.css"></style>