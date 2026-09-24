import { ref, watch } from 'vue'
import { readText, writeText } from './api'
import { parseMarkdown, type MarkdownHeading } from './utils/markdown'
import type { FileEntry } from './types'

export function useFileOps() {
  const content = ref('')
  const headings = ref<MarkdownHeading[]>([])
  const dirty = ref(false)
  let current: FileEntry | null = null

  watch(content, (v) => {
    dirty.value = true
    headings.value = parseMarkdown(v).headings
  })

  async function loadFile(entry: FileEntry) {
    const text = await readText(entry.path)
    current = entry
    content.value = text
    dirty.value = false
    headings.value = parseMarkdown(text).headings
  }

  async function saveFile(entry: FileEntry) {
    await writeText(entry.path, content.value)
    dirty.value = false
    if (current) current = entry
  }

  return { content, headings, loadFile, saveFile, dirty }
}
