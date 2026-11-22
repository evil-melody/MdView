<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { tags as t } from '@lezer/highlight'
import { languageFor, languageLabel } from '../utils/codeLang'
import { wrap } from '../composables/useWrap'
import { readFileRange } from '../api'

/** 软换行用 Compartment 动态重配置，避免切换偏好时重建整个编辑器 */
const wrapComp = new Compartment()

const props = defineProps<{
  content: string
  path: string
  formattable?: boolean
  /** 超大文本：按字节区间流式只读预览 */
  stream?: boolean
  /** 文件字节数（进度条分母，0 表示未知） */
  size?: number
}>()
const emit = defineEmits<{
  (e: 'change'): void
  (e: 'update:content', v: string): void
  (e: 'format'): void
}>()

const hostRef = ref<HTMLDivElement | null>(null)
const stat = ref({ lines: 0, chars: 0 })
const bootErr = ref('')
const streamErr = ref('')
const streamStat = ref({ loaded: 0, total: props.size ?? 0, done: false })
/** 外部（保存 / 切换文件）写入时标记，避免把自身回写当成用户输入 */
let suppress = false
let view: EditorView | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let streamCancelled = false
/** 流式追加期间的 docChanged 不标脏、不回写 content */
let appending = false
const CHUNK = 512 * 1024

const ext = computed(() => {
  const n = props.path.split('.')
  return n.length > 1 ? n[n.length - 1].toLowerCase() : ''
})
const label = computed(() => languageLabel(ext.value))
const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + ' MB'
const streamLabel = computed(() => {
  const s = streamStat.value
  return s.total ? `${mb(Math.min(s.loaded, s.total))} / ${mb(s.total)}` : mb(s.loaded)
})

/** 与 MdView 暗色界面一致的编辑器配色 */
const editorTheme = EditorView.theme(
  {
    '&': { color: '#e4e4e8', backgroundColor: '#16161b', fontSize: '13px' },
    '.cm-content': { caretColor: '#6ea8fe', fontFamily: 'Menlo, Monaco, Consolas, monospace' },
    '.cm-cursor': { borderLeftColor: '#6ea8fe' },
    '&.cm-focused': { outline: 'none' },
    '.cm-gutters': { backgroundColor: '#16161b', color: '#5b5b66', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgba(110,168,254,0.08)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(110,168,254,0.12)', color: '#9aa4b2' },
    '.cm-selectionBackground, & .cm-content ::selection': { backgroundColor: 'rgba(110,168,254,0.25)' },
    '.cm-matchingBracket': { backgroundColor: 'rgba(110,168,254,0.28)', outline: 'none' },
    '.cm-scroller': { fontFamily: 'Menlo, Monaco, Consolas, monospace', lineHeight: '1.6' },
    '.cm-tooltip': { backgroundColor: '#22222a', border: '1px solid #33333d', color: '#e4e4e8' },
    '.cm-panels': { backgroundColor: '#1e1e25', color: '#e4e4e8' },
  },
  { dark: true }
)

const highlightStyle = HighlightStyle.define([
  { tag: t.comment, color: '#6b7280', fontStyle: 'italic' },
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword], color: '#c792ea' },
  { tag: [t.string, t.special(t.string)], color: '#a5d6a7' },
  { tag: [t.number, t.bool, t.null], color: '#f78c6c' },
  { tag: [t.variableName, t.propertyName], color: '#e4e4e8' },
  { tag: [t.function(t.variableName), t.labelName], color: '#82aaff' },
  { tag: [t.typeName, t.className, t.namespace], color: '#ffcb6b' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: '#9aa4b2' },
  { tag: [t.heading], color: '#ffcb6b', fontWeight: 'bold' },
  { tag: [t.link, t.url], color: '#6ea8fe', textDecoration: 'underline' },
  { tag: t.invalid, color: '#ff5370' },
])

function children() {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    history(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    indentUnit.of('    '),
    syntaxHighlighting(highlightStyle),
    editorTheme,
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      ...closeBracketsKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    // 流式大文件跳过语法解析：Lezer 对几十 MB 文档全量解析会拖慢分片追加
    props.stream ? [] : languageFor(ext.value),
    ...(props.stream ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
    wrapComp.of(wrap.value ? EditorView.lineWrapping : []),
    EditorView.updateListener.of((u) => {
      if (!u.docChanged || appending) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        emit('update:content', u.state.doc.toString())
        timer = null
      }, 400)
      emit('change')
    }),
  ]
}

function readStat(state: EditorState) {
  const doc = state.doc
  stat.value = { lines: doc.lines, chars: doc.length }
}

/** 流式追加：不标脏、不回写页签 content */
function append(text: string) {
  if (!text || !view) return
  appending = true
  try {
    view.dispatch({ changes: { from: view.state.doc.length, insert: text } })
  } finally {
    appending = false
  }
  readStat(view.state)
}

/** 按字节区间读盘；TextDecoder stream 跨块拼 UTF-8，片间让出主线程保证可滚动 */
async function pump() {
  const decoder = new TextDecoder('utf-8')
  let offset = 0
  let flushed = false
  try {
    while (!streamCancelled && view) {
      const buf = await readFileRange(props.path, offset, CHUNK)
      if (streamCancelled || !view) return
      const bytes = new Uint8Array(buf)
      if (!bytes.length) break
      if (bytes.includes(0)) {
        streamErr.value = '二进制文件，不支持文本预览'
        break
      }
      const more = bytes.length === CHUNK
      const text = decoder.decode(bytes, { stream: more })
      if (!more) flushed = true
      offset += bytes.length
      append(text)
      streamStat.value = { loaded: offset, total: Math.max(props.size ?? 0, offset), done: !more }
      if (!more) break
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    if (!flushed && !streamCancelled && view) append(decoder.decode())
  } catch (e) {
    streamErr.value = '流式读取失败：' + String(e)
  } finally {
    streamStat.value = { ...streamStat.value, done: true }
  }
}

onMounted(() => {
  if (!hostRef.value) return
  try {
    view = new EditorView({
      parent: hostRef.value,
      state: EditorState.create({ doc: props.content ?? '', extensions: children() }),
    })
    readStat(view.state)
    if (props.stream) void pump()
  } catch (e: any) {
    // 代码编辑器初始化失败要有可见反馈，不能白屏
    bootErr.value = '代码编辑器初始化失败: ' + (e?.message || String(e))
    console.error('[CodeEditor] 初始化失败', e)
  }
})

onUnmounted(() => {
  streamCancelled = true
  if (timer) clearTimeout(timer)
  timer = null
  view?.destroy()
  view = null
})

watch(wrap, (v) => {
  view?.dispatch({ effects: wrapComp.reconfigure(v ? EditorView.lineWrapping : []) })
})

/** 外部内容变更（切换文件 / 保存后重建）才同步，用户输入不回灌 */
watch(
  () => props.content,
  (v) => {
    if (!view || props.stream) return
    const current = view.state.doc.toString()
    if (v === current) return
    suppress = true
    view.dispatch({ changes: { from: 0, to: current.length, insert: v ?? '' } })
    suppress = false
    readStat(view.state)
  }
)

function getValue(): string | null {
  return view ? view.state.doc.toString() : null
}

defineExpose({ getValue })
</script>

<template>
  <div class="cde">
    <div class="cde-bar">
      <span class="cde-lang">{{ label }}</span>
      <template v-if="stream">
        <span class="cde-hint">
          流式只读 · {{ streamLabel }}<span v-if="streamStat.done"> · 加载完成</span><span v-else> · 加载中…</span>
        </span>
        <progress
          v-if="streamStat.total && !streamStat.done"
          class="cde-progress"
          :value="Math.min(streamStat.loaded, streamStat.total)"
          :max="streamStat.total"
        ></progress>
      </template>
      <template v-else>
        <span class="cde-hint">Tab 缩进 · Ctrl/Cmd+F 查找 · Esc 退出</span>
        <button v-if="formattable" class="cde-format" title="重新排版 HTML 源码（保存后才会写盘）" @click="emit('format')">格式化</button>
      </template>
      <span class="cde-stat">{{ stat.lines }} 行 · {{ stat.chars }} 字符</span>
    </div>
    <div v-if="streamErr" class="cde-stream-err">{{ streamErr }}</div>
    <div v-if="bootErr" class="cde-err">{{ bootErr }}</div>
    <div v-else ref="hostRef" class="cde-host scrollable"></div>
  </div>
</template>

<style src="./CodeEditor.css" scoped></style>
