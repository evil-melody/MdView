<script setup lang="ts">
import { reactive } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import type { AppConfig } from '../types'

const props = defineProps<{ config: AppConfig }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', c: AppConfig): void
  (e: 'open-root', root: string): void
}>()

const local = reactive<{ scan_roots: string[] }>({ scan_roots: [...props.config.scan_roots] })

function shortName(r: string): string {
  const parts = r.split('/').filter(Boolean)
  return parts[parts.length - 1] || r
}

function isRootActive(r: string): boolean {
  return !!props.config.scan_roots.includes(r)
}

async function addRoot() {
  const sel = await open({ directory: true, multiple: false })
  if (typeof sel === 'string' && sel && !local.scan_roots.includes(sel)) {
    local.scan_roots.push(sel)
  }
}

function removeRoot(r: string) {
  local.scan_roots = local.scan_roots.filter((x) => x !== r)
}

function save() {
  emit('saved', { ...props.config, scan_roots: [...local.scan_roots] })
  emit('close')
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog">
      <div class="dlg-head">
        <span class="dlg-title">资料库管理</span>
        <span class="dlg-count">{{ local.scan_roots.length }} 个目录</span>
        <button class="btn ghost" @click="emit('close')">✕</button>
      </div>

      <div class="dlg-body scrollable">
        <div v-if="!local.scan_roots.length" class="lib-empty">
          <div class="le-emoji">📚</div>
          <p>还没有添加资料库</p>
          <p class="le-sub">添加文件夹后，即可在左侧导航浏览与搜索其中的文件</p>
        </div>
        <div v-else class="lib-list">
          <div
            v-for="r in local.scan_roots"
            :key="r"
            class="lib-row"
            :class="{ active: isRootActive(r) }"
            :title="'点击浏览 ' + r"
            @click="emit('open-root', r)"
          >
            <span class="lr-ico">📚</span>
            <div class="lr-body">
              <div class="lr-name">{{ shortName(r) }}</div>
              <div class="lr-path">{{ r }}</div>
            </div>
            <button class="lr-btn" title="浏览此目录" @click.stop="emit('open-root', r)">打开</button>
            <button class="lr-btn danger" title="从资料库移除" @click.stop="removeRoot(r)">移除</button>
          </div>
        </div>
      </div>

      <div class="dlg-foot">
        <button class="btn" @click="addRoot">＋ 添加文件夹</button>
        <div class="foot-spacer"></div>
        <button class="btn" @click="emit('close')">取消</button>
        <button class="btn primary" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>

<style src="./LibraryDialog.css"></style>
