<script setup lang="ts">
import { computed, ref } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { importArticleFromUrl } from '../api'

const props = defineProps<{ defaultDir: string }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'imported', payload: { path: string; title: string; dir: string }): void
}>()

/** 输出格式二选一（禁原生 radio，抄 NewFileDialog 的公共按钮组范式） */
const FORMATS = [
  { key: 'md', label: 'Markdown', icon: '📝' },
  { key: 'html', label: 'HTML', icon: '🌐' }
]

const url = ref('')
const format = ref('md')
const name = ref('')
const dir = ref(props.defaultDir)
const error = ref('')
const busy = ref(false)

/** 链接格式：失焦 / 提交时校验 http(s) 前缀 */
const urlInvalid = computed(() => !!url.value.trim() && !/^https?:\/\//i.test(url.value.trim()))
const canSubmit = computed(() => !!url.value.trim() && !urlInvalid.value && !!dir.value && !busy.value)

function pick(f: string) {
  format.value = f
  error.value = ''
}

/** 更改保存位置：原生目录选择器 */
async function changeDirPick() {
  const sel = await open({ directory: true, multiple: false })
  if (typeof sel === 'string' && sel) dir.value = sel
}

async function submit() {
  const u = url.value.trim()
  if (!u) {
    error.value = '请输入文章链接'
    return
  }
  if (!/^https?:\/\//i.test(u)) {
    error.value = '链接需以 http:// 或 https:// 开头'
    return
  }
  if (!dir.value) {
    error.value = '请选择保存位置'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const res = await importArticleFromUrl(u, dir.value, format.value, name.value.trim())
    emit('imported', { path: res.path, title: res.title, dir: dir.value })
  } catch (e: any) {
    error.value = '导入失败: ' + String(e?.message ?? e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog ia-dialog">
      <div class="dlg-head">
        <span class="dlg-title">导入文章</span>
        <span class="dlg-count">粘贴链接，生成本地文档</span>
        <button class="btn ghost" @click="emit('close')">✕</button>
      </div>

      <div class="dlg-body scrollable">
        <div class="ia-label">文章链接</div>
        <div class="ia-input" :class="{ bad: urlInvalid }">
          <input
            v-model="url"
            placeholder="https://mp.weixin.qq.com/s/…"
            spellcheck="false"
            @blur="error = urlInvalid ? '链接需以 http:// 或 https:// 开头' : ''"
            @keyup.enter="submit"
            @input="error = ''"
          />
        </div>

        <div class="ia-label">输出格式</div>
        <div class="ia-types">
          <button
            v-for="f in FORMATS"
            :key="f.key"
            class="ia-type"
            :class="{ on: f.key === format }"
            :title="'生成 ' + f.label + ' 文档'"
            @click="pick(f.key)"
          >
            <span class="ia-ico">{{ f.icon }}</span>
            <span class="ia-name">{{ f.label }}</span>
            <span class="ia-ext">.{{ f.key }}</span>
          </button>
        </div>

        <div class="ia-label">文件名（选填）</div>
        <div class="ia-input">
          <input
            v-model="name"
            placeholder="留空自动取网页标题"
            spellcheck="false"
            @keyup.enter="submit"
            @input="error = ''"
          />
          <span class="ia-suffix">.{{ format }}</span>
        </div>

        <div class="ia-label">保存位置</div>
        <div class="ia-dir">
          <span class="ia-dir-path" :title="dir">{{ dir }}</span>
          <button class="btn" @click="changeDirPick">更改…</button>
        </div>

        <div v-if="error" class="ia-error">{{ error }}</div>
        <div v-else class="ia-hint">正文图片会下载到同目录的 .assets 文件夹，下载失败时保留原链接</div>
      </div>

      <div class="dlg-foot">
        <div class="foot-spacer"></div>
        <button class="btn" :disabled="busy" @click="emit('close')">取消</button>
        <button class="btn primary" :disabled="!canSubmit" @click="submit">
          {{ busy ? '导入中…' : '导入' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style src="./ImportArticleDialog.css"></style>
