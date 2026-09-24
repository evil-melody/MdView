<script setup lang="ts">
defineEmits<{ (e: 'open-settings'): void }>()

const sections = [
  {
    icon: '🚀',
    title: '快速上手 4 步',
    items: [
      '① 添加资料库：左侧 → 设置 → 添加资料库文件夹。',
      '② 扫描索引：首页 → 重新扫描索引，建立分类与最近更新视图。',
      '③ 浏览编辑：左侧分类或「全部文件」点开文件，切换 预览 / 编辑 / 脑图。',
      '④ AI 功能：设置中启用 AI 并填入远程 API（OpenAI 兼容），即可用摘要与打标。'
    ]
  },
  {
    icon: '🔍',
    title: '文件搜索（关键词模式）',
    items: [
      '关键词搜索：按文件名与文本内容匹配，任何情况都可用。',
      '范围：当前资料库根目录递归搜索（跳过隐藏目录与 node_modules 等）。',
      '搜索结果在列表区展示，点击即可预览。'
    ]
  },
  {
    icon: '📝',
    title: 'Markdown 能力',
    items: [
      '预览：GFM 渲染（表格 / 代码块 / 引用），自动生成标题锚点与大纲。',
      '编辑：左侧源码、右侧实时预览，保存直接写回原文件。',
      '脑图：基于 markmap 把文档标题结构渲染为思维导图。'
    ]
  },
  {
    icon: '🧠',
    title: 'AI 功能（远程模型）',
    items: [
      '本应用不内置、不拉起本地模型，全部通过远程 OpenAI 兼容接口调用。',
      '支持自定义 Base URL / API Key / 模型名称，密钥仅保存在本机配置。',
      'AI 文件摘要：对当前打开的文档生成核心要点；AI 自动打标：生成关键词标签。'
    ]
  }
]
</script>

<template>
  <div class="help scrollable">
    <div
      v-for="s in sections"
      :key="s.title"
      class="card-panel block"
    >
      <div class="block-title">{{ s.icon }} {{ s.title }}</div>
      <div class="h-items">
        <div v-for="(it, i) in s.items" :key="i" class="h-item">{{ it }}</div>
      </div>
    </div>
    <div class="card-panel block">
      <div class="block-title">🧩 关于</div>
      <div class="h-item">MdView 是本地文件与 Markdown 工作台：所有数据仅保存在本机，不上传任何文件。</div>
      <div class="h-item">MD 默认打开方式：安装后在 Finder 中右键任一 .md 文件 → 显示简介 → 「打开方式」选择 MdView → 点击「全部更改」，即可让所有 .md 默认用 MdView 打开。</div>
    </div>
  </div>
</template>

<style src="./HelpPage.css"></style>
