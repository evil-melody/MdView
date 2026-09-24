<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    isDir?: boolean
    size?: number
  }>(),
  { size: 18 }
)

interface Spec {
  bg: string
  fold: string
  label: string
  glyph: 'lines' | 'grid' | 'slide' | 'img' | 'audio' | 'video' | 'zip' | null
}

const EXT_MAP: Record<string, Omit<Spec, 'fold'>> = {
  docx: { bg: '#E0432D', label: 'DOC', glyph: 'lines' },
  doc: { bg: '#E0432D', label: 'DOC', glyph: 'lines' },
  rtf: { bg: '#E0432D', label: 'DOC', glyph: 'lines' },
  xlsx: { bg: '#1F9D55', label: 'XLS', glyph: 'grid' },
  xls: { bg: '#1F9D55', label: 'XLS', glyph: 'grid' },
  xlsm: { bg: '#1F9D55', label: 'XLS', glyph: 'grid' },
  csv: { bg: '#1F9D55', label: 'CSV', glyph: 'grid' },
  tsv: { bg: '#1F9D55', label: 'CSV', glyph: 'grid' },
  pptx: { bg: '#F2701D', label: 'PPT', glyph: 'slide' },
  ppt: { bg: '#F2701D', label: 'PPT', glyph: 'slide' },
  key: { bg: '#F2701D', label: 'KEY', glyph: 'slide' },
  pdf: { bg: '#D9382C', label: 'PDF', glyph: null },
  md: { bg: '#7A5AF8', label: 'MD', glyph: 'lines' },
  markdown: { bg: '#7A5AF8', label: 'MD', glyph: 'lines' },
  mdx: { bg: '#7A5AF8', label: 'MD', glyph: 'lines' },
  txt: { bg: '#7D8B99', label: 'TXT', glyph: 'lines' },
  png: { bg: '#3E8EF7', label: '', glyph: 'img' },
  jpg: { bg: '#3E8EF7', label: '', glyph: 'img' },
  jpeg: { bg: '#3E8EF7', label: '', glyph: 'img' },
  gif: { bg: '#3E8EF7', label: '', glyph: 'img' },
  webp: { bg: '#3E8EF7', label: '', glyph: 'img' },
  svg: { bg: '#3E8EF7', label: 'SVG', glyph: 'img' },
  bmp: { bg: '#3E8EF7', label: '', glyph: 'img' },
  ico: { bg: '#3E8EF7', label: '', glyph: 'img' },
  avif: { bg: '#3E8EF7', label: '', glyph: 'img' },
  heic: { bg: '#3E8EF7', label: '', glyph: 'img' },
  mp3: { bg: '#EBA43C', label: '', glyph: 'audio' },
  wav: { bg: '#EBA43C', label: '', glyph: 'audio' },
  m4a: { bg: '#EBA43C', label: '', glyph: 'audio' },
  flac: { bg: '#EBA43C', label: '', glyph: 'audio' },
  ogg: { bg: '#EBA43C', label: '', glyph: 'audio' },
  aac: { bg: '#EBA43C', label: '', glyph: 'audio' },
  mp4: { bg: '#6E5BE0', label: '', glyph: 'video' },
  mov: { bg: '#6E5BE0', label: '', glyph: 'video' },
  webm: { bg: '#6E5BE0', label: '', glyph: 'video' },
  m4v: { bg: '#6E5BE0', label: '', glyph: 'video' },
  zip: { bg: '#8D99AE', label: 'ZIP', glyph: 'zip' },
  tar: { bg: '#8D99AE', label: 'TAR', glyph: 'zip' },
  gz: { bg: '#8D99AE', label: 'GZ', glyph: 'zip' },
  '7z': { bg: '#8D99AE', label: '7Z', glyph: 'zip' },
  rar: { bg: '#8D99AE', label: 'RAR', glyph: 'zip' },
  json: { bg: '#94A3B8', label: '{ }', glyph: null },
  yaml: { bg: '#94A3B8', label: 'YML', glyph: null },
  yml: { bg: '#94A3B8', label: 'YML', glyph: null },
  toml: { bg: '#94A3B8', label: 'TML', glyph: null },
  ini: { bg: '#94A3B8', label: 'INI', glyph: null }
}

const CODE_BG = '#4FB6C9'

const spec = computed<Spec>(() => {
  const ext = (props.name.split('.').pop() || '').toLowerCase()
  const m = EXT_MAP[ext]
  if (m) return { ...m, fold: 'rgba(255,255,255,0.28)' }
  return {
    bg: CODE_BG,
    fold: 'rgba(255,255,255,0.28)',
    label: ext.slice(0, 3).toUpperCase() || '·',
    glyph: null
  }
})
</script>

<template>
  <!-- 文件夹 -->
  <svg
    v-if="isDir"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M2.5 6.5A2.5 2.5 0 0 1 5 4h4.2c.6 0 1.2.26 1.6.72L12.4 6.5H19a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 19 20.5H5A2.5 2.5 0 0 1 2.5 18V6.5Z"
      fill="#5B8DEF"
    />
    <path
      d="M2.5 9.5h19V18a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 18V9.5Z"
      fill="#77A5F6"
    />
  </svg>

  <!-- 文档图标：类型色底 + 折角 + 白色标签/图形 -->
  <svg
    v-else
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M5.5 1.5h8.2L20 7.8V20a2.5 2.5 0 0 1-2.5 2.5h-12A2.5 2.5 0 0 1 3 20V4a2.5 2.5 0 0 1 2.5-2.5Z"
      :fill="spec.bg"
    />
    <path d="M13.7 1.5 20 7.8h-4.8a1.5 1.5 0 0 1-1.5-1.5V1.5Z" :fill="spec.fold" />
    <!-- 段落线（doc/md/txt） -->
    <g v-if="spec.glyph === 'lines'" stroke="#fff" stroke-width="1.6" stroke-linecap="round">
      <line x1="6.5" y1="11" x2="16.5" y2="11" />
      <line x1="6.5" y1="14.2" x2="16.5" y2="14.2" />
      <line x1="6.5" y1="17.4" x2="12.5" y2="17.4" />
    </g>
    <!-- 网格（xlsx/csv） -->
    <g v-else-if="spec.glyph === 'grid'" stroke="#fff" stroke-width="1.5">
      <rect x="6" y="10.5" width="11" height="8" rx="0.8" />
      <line x1="6" y1="14.5" x2="17" y2="14.5" />
      <line x1="11.5" y1="10.5" x2="11.5" y2="18.5" />
    </g>
    <!-- 幻灯片（pptx） -->
    <g v-else-if="spec.glyph === 'slide'">
      <rect x="5.5" y="9.5" width="13" height="9" rx="1.2" fill="#fff" opacity="0.92" />
      <path d="M10.6 12.2v3.6l3.2-1.8-3.2-1.8Z" :fill="spec.bg" />
    </g>
    <!-- 图片（山 + 太阳） -->
    <g v-else-if="spec.glyph === 'img'">
      <rect x="5" y="9" width="14" height="10.5" rx="1.4" fill="#fff" opacity="0.92" />
      <circle cx="9.2" cy="12.4" r="1.3" :fill="spec.bg" />
      <path d="m6.5 18 3.4-3.6 2.2 2.3 2.4-2.8 2.9 4.1H6.5Z" :fill="spec.bg" />
    </g>
    <!-- 音符 -->
    <g v-else-if="spec.glyph === 'audio'" fill="#fff">
      <path d="M10 17.6V8.2l6-1.4v7.2h-1.5v-5.4l-3 .7v8.3Z" />
      <circle cx="8.6" cy="17.6" r="1.8" />
      <circle cx="14.6" cy="14" r="1.8" />
    </g>
    <!-- 播放（video） -->
    <g v-else-if="spec.glyph === 'video'">
      <rect x="4.5" y="8.5" width="15" height="11" rx="2" fill="#fff" opacity="0.92" />
      <path d="m10.4 11.5 4.6 2.5-4.6 2.5v-5Z" :fill="spec.bg" />
    </g>
    <!-- 拉链（archive） -->
    <g v-else-if="spec.glyph === 'zip'" stroke="#fff" stroke-width="1.6" stroke-linecap="round">
      <line x1="12" y1="9" x2="12" y2="10.4" />
      <line x1="12" y1="12" x2="12" y2="13.4" />
      <line x1="12" y1="15" x2="12" y2="16.4" />
      <rect x="10.6" y="17" width="2.8" height="3" rx="0.5" fill="#fff" stroke="none" />
    </g>
    <!-- 标签文字（DOC/XLS/PPT/PDF/MD…） -->
    <text
      v-else-if="spec.label"
      x="11.6"
      y="15.4"
      text-anchor="middle"
      font-size="6.4"
      font-weight="800"
      font-family="-apple-system, 'SF Pro', 'PingFang SC', sans-serif"
      fill="#fff"
      letter-spacing="0.2"
    >{{ spec.label }}</text>
  </svg>
</template>
