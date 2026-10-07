<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { AppConfig, ModelProfile } from '../types'
import { saveConfig } from '../api'
import ToggleSwitch from './ui/ToggleSwitch.vue'
import SelectMenu from './ui/SelectMenu.vue'

const props = defineProps<{ config: AppConfig }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', c: AppConfig): void
}>()

const local = reactive<AppConfig>(JSON.parse(JSON.stringify(props.config)))
if (!local.ai.profiles) local.ai.profiles = []

function addProfile() {
  local.ai.profiles.push({
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    base_url: 'https://api.openai.com/v1',
    api_key: '',
    model: ''
  })
}

function removeProfile(i: number) {
  const id = local.ai.profiles[i]?.id
  local.ai.profiles.splice(i, 1)
  // 角色绑定指向被删项时清空（对话态由 normalize 兜底回退到第一个）
  if (local.ai.chat_profile === id) local.ai.chat_profile = local.ai.profiles[0]?.id ?? ''
  if (local.ai.embedding_profile === id) local.ai.embedding_profile = ''
  if (local.ai.vlm_profile === id) local.ai.vlm_profile = ''
}

function profileLabel(p: ModelProfile): string {
  const name = p.name?.trim() || p.model?.trim() || '未命名配置'
  return p.model?.trim() && p.name?.trim() ? `${p.name.trim()}（${p.model.trim()}）` : name
}

const roleOptions = computed(() => local.ai.profiles.map((p) => ({ value: p.id, label: profileLabel(p) })))

async function save() {
  if (!local.ai.chat_profile && local.ai.profiles.length) {
    local.ai.chat_profile = local.ai.profiles[0].id
  }
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
        <section>
          <h3>AI 配置（远程模型）</h3>
          <p class="hint">本应用不内置/拉起本地模型，仅通过兼容 OpenAI 的远程接口调用。可添加多个模型配置，各能力独立选择使用哪个。</p>
          <div class="switch-row">
            <span>启用 AI 助手</span>
            <ToggleSwitch v-model="local.ai.enabled" />
          </div>

          <div class="profiles-head">
            <h3>模型配置</h3>
            <button class="btn ghost btn-sm" @click="addProfile">＋ 添加配置</button>
          </div>
          <p class="hint" v-if="!local.ai.profiles.length">还没有模型配置，点击「添加配置」创建一个。</p>
          <div v-for="(p, i) in local.ai.profiles" :key="p.id" class="profile-card">
            <div class="profile-head">
              <input class="profile-name" v-model="p.name" :placeholder="`配置 ${i + 1} 名称，如：对话主力 / VL 视觉`" />
              <button class="btn ghost btn-sm" @click="removeProfile(i)">删除</button>
            </div>
            <div class="field">
              <label>API Base URL</label>
              <input v-model="p.base_url" placeholder="https://api.openai.com/v1" />
            </div>
            <div class="field">
              <label>API Key</label>
              <input v-model="p.api_key" type="password" placeholder="sk-..." />
            </div>
            <div class="field">
              <label>模型名称</label>
              <input v-model="p.model" placeholder="gpt-4o-mini / text-embedding-3-small / qwen-vl ..." />
            </div>
          </div>
        </section>

        <section>
          <h3>能力分配</h3>
          <p class="hint">为每类 AI 能力选择使用的模型配置，可随时切换。</p>
          <div class="field">
            <label>对话 / 摘要 / 打标</label>
            <SelectMenu v-model="local.ai.chat_profile" :options="roleOptions" placeholder="请选择" />
          </div>
          <div class="field">
            <label>Embedding（向量化 / 检索）</label>
            <SelectMenu v-model="local.ai.embedding_profile" :options="roleOptions" placeholder="请选择" />
          </div>
          <div class="field">
            <label>视觉 VL（图片 / 图文文档摘要）</label>
            <SelectMenu v-model="local.ai.vlm_profile" :options="roleOptions" placeholder="请选择" />
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
