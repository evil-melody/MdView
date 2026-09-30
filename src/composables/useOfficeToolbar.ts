/**
 * 共享的 Office 富文本工具栏逻辑（docx / 旧版 Markdown-hub 编辑器复用）。
 *
 * 只负责：在给定可编辑容器上执行 execCommand、维护工具条高亮状态
 * （activeFormats / fontFamily / fontSize）、以及选区变化时的状态刷新。
 * 工具条「外观」由 DocToolbar.vue 承担，二者解耦，避免双份 ~120 行重复。
 */
import { ref, onUnmounted } from 'vue'

export interface ToolbarFormatState {
  bold: boolean
  italic: boolean
  underline: boolean
  strikeThrough: boolean
  justifyLeft: boolean
  justifyCenter: boolean
  justifyRight: boolean
  insertUnorderedList: boolean
  insertOrderedList: boolean
}

export const FONT_SIZES = [
  { label: '10', value: '1' },
  { label: '13', value: '2' },
  { label: '16', value: '3' },
  { label: '18', value: '4' },
  { label: '24', value: '5' },
  { label: '32', value: '6' },
  { label: '48', value: '7' },
]

export function useOfficeToolbar(getWrapper: () => HTMLElement | null) {
  const activeFormats = ref<ToolbarFormatState>({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    justifyLeft: false,
    justifyCenter: false,
    justifyRight: false,
    insertUnorderedList: false,
    insertOrderedList: false,
  })
  const fontFamily = ref('')
  const fontSize = ref('')

  function exec(cmd: string, value: string | null = null) {
    const w = getWrapper()
    if (!w) return
    w.focus()
    try {
      document.execCommand('styleWithCSS', false, 'true')
      document.execCommand(cmd, false, value ?? undefined)
      updateToolbar()
    } catch (e) {
      console.warn('[office-toolbar] execCommand failed', cmd, e)
    }
  }

  function setFontFamily(name: string) {
    exec('fontName', name)
  }
  function setFontSize(size: string) {
    exec('fontSize', size)
  }
  function setColor(hex: string) {
    exec('foreColor', hex)
  }
  function setHilite(hex: string) {
    exec('hiliteColor', hex)
  }
  function setHeading(tag: string) {
    exec('formatBlock', tag)
  }

  function isInsideWrapper(): boolean {
    const sel = window.getSelection()
    const w = getWrapper()
    if (!sel || sel.rangeCount === 0 || !w) return false
    return w.contains(sel.anchorNode)
  }

  function updateToolbar() {
    if (!isInsideWrapper()) return
    activeFormats.value = {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      justifyLeft: document.queryCommandState('justifyLeft'),
      justifyCenter: document.queryCommandState('justifyCenter'),
      justifyRight: document.queryCommandState('justifyRight'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
    }
    fontFamily.value = document.queryCommandValue('fontName') || ''
    fontSize.value = document.queryCommandValue('fontSize') || ''
  }

  let selTimer: ReturnType<typeof setTimeout> | null = null
  function onSelectionChange() {
    if (selTimer) clearTimeout(selTimer)
    selTimer = setTimeout(updateToolbar, 80)
  }

  function attach() {
    document.addEventListener('selectionchange', onSelectionChange)
  }
  function detach() {
    if (selTimer) clearTimeout(selTimer)
    document.removeEventListener('selectionchange', onSelectionChange)
  }

  onUnmounted(detach)

  return {
    fontSizes: FONT_SIZES,
    activeFormats,
    fontFamily,
    fontSize,
    exec,
    setFontFamily,
    setFontSize,
    setColor,
    setHilite,
    setHeading,
    updateToolbar,
    attach,
    detach,
  }
}
