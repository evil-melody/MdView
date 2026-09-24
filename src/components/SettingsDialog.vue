<script setup lang="ts">
import { reactive } from 'vue'
import type { AppConfig } from '../types'
import { saveConfig } from '../api'

const props = defineProps<{ config: AppConfig }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', c: AppConfig): void
}>()

const local = reactive<AppConfig>(JSON.parse(JSON.stringify(props.config)))

async function save() {
  await saveConfig(local)
  emit('saved', JSON.parse(JSON.stringify(local)))
  emit('close')
}
</script>

<template>
  <div class="overlay">
    <div class="dialog">
      <div class="dlg-head">
        <span class="dlg-title">设置</span>
        <button class="btn ghost" @click="emit('close')">✕</button>
      </div>

      <div class="dlg-body scrollable">
        <p class="hint lib-hint">📁 资料库目录管理已移至左侧导航「资料库」区，点击 ＋ 即可添加 / 打开 / 移除。</p>

        <section>
          <h3>AI 配置（远程模型）</h3>
          <p class="hint">本应用不内置/拉起本地模型，仅通过兼容 OpenAI 的远程接口调用。</p>
          <label class="switch-row">
            <span>启用 AI 助手</span>
            <input type="checkbox" v-model="local.ai.enabled" />
          </label>
          <div class="field">
            <label>API Base URL</label>
            <input v-model="local.ai.base_url" placeholder="https://api.openai.com/v1" />
          </div>
          <div class="field">
            <label>API Key</label>
            <input v-model="local.ai.api_key" type="password" placeholder="sk-..." />
          </div>
          <div class="field">
            <label>模型名称</label>
            <input v-model="local.ai.model" placeholder="gpt-4o-mini" />
          </div>
        </section>
      </div>

      <div class="dlg-foot">
        <button class="btn" @click="emit('close')">取消</button>
        <button class="btn primary" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>

<style src="./SettingsDialog.css"></style>
