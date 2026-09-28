<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { tags as t } from '@lezer/highlight'
import { languageFor, languageLabel } from '../utils/codeLang'

const props = defineProps<{ content: string; path: string }>()
const emit = defineEmits<{
  (e: 'change'): void
  (e: 'update:content', v: string): void
}>()

const hostRef = ref<HTMLDivElement | null>(null)
const stat = ref({ lines: 0, chars: 0 })
const bootErr = ref('')
/** 外部（保存 / 切换文件）写入时标记，避免把自身回写当成用户输入 */
let suppress = false
let view: EditorView | null = null
let timer: ReturnType<typeof setTimeout> | null = null

const ext = computed(() => {
  const n = props.path.split('.')
  return n.length > 1 ? n[n.length - 1].toLowerCase() : ''
})
const label = computed(() => languageLabel(ext.value))

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
    languageFor(ext.value),
    EditorView.updateListener.of((u) => {
      if (!u.docChanged) return
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

onMounted(() => {
  if (!hostRef.value) return
  try {
    view = new EditorView({
      parent: hostRef.value,
      state: EditorState.create({ doc: props.content ?? '', extensions: children() }),
    })
    readStat(view.state)
  } catch (e: any) {
    // 代码编辑器初始化失败要有可见反馈，不能白屏
    bootErr.value = '代码编辑器初始化失败: ' + (e?.message || String(e))
    console.error('[CodeEditor] 初始化失败', e)
  }
})

onUnmounted(() => {
  if (timer) clearTimeout(timer)
  timer = null
  view?.destroy()
  view = null
})

/** 外部内容变更（切换文件 / 保存后重建）才同步，用户输入不回灌 */
watch(
  () => props.content,
  (v) => {
    if (!view) return
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
      <span class="cde-hint">Tab 缩进 · Ctrl/Cmd+F 查找 · Esc 退出</span>
      <span class="cde-stat">{{ stat.lines }} 行 · {{ stat.chars }} 字符</span>
    </div>
    <div v-if="bootErr" class="cde-err">{{ bootErr }}</div>
    <div v-else ref="hostRef" class="cde-host scrollable"></div>
  </div>
</template>

<style src="./CodeEditor.css" scoped></style>
