<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { createUniver, defaultTheme, LocaleType, UniverInstanceType } from '@univerjs/presets'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverUIPlugin } from '@univerjs/ui'
import { UniverDocsPlugin } from '@univerjs/docs'
import { UniverDocsUIPlugin } from '@univerjs/docs-ui'
import { ICommandService } from '@univerjs/core'
import DocsUiZhCN from '@univerjs/docs-ui/locale/zh-CN'
import '@univerjs/docs-ui/lib/index.css'
import '@univerjs/ui/lib/index.css'
import { readDocxUniver } from '../api'

const props = defineProps<{ path: string }>()
const emit = defineEmits<{ (e: 'change'): void; (e: 'ready'): void; (e: 'error', m: string): void }>()

const containerRef = ref<HTMLDivElement | null>(null)
const errText = ref('')
/** 工具栏字号下拉 */
const fontSizes = [12, 14, 16, 18, 24, 32]
let univer: any = null
let commandService: any = null
let commandServiceDispose: { dispose?: () => void } | null = null
let unitId = ''

function exec(id: string, params: Record<string, unknown> = {}) {
  if (!commandService) return
  try {
    commandService.executeCommand(id, { unitId, ...params })
    emit('change')
  } catch (e) {
    console.warn('[UniverDocEditor] 命令执行失败', id, e)
  }
}

onMounted(async () => {
  if (!containerRef.value) return
  try {
    const raw = await readDocxUniver(props.path)
    const data = JSON.parse(raw)
    const result = createUniver({
      locale: LocaleType.ZH_CN,
      locales: { [LocaleType.ZH_CN]: DocsUiZhCN },
      theme: defaultTheme,
      presets: [
        {
          plugins: [
            UniverRenderEnginePlugin,
            [UniverUIPlugin, { container: containerRef.value, header: true, toolbar: false, contextMenu: true }],
            UniverDocsPlugin,
            [UniverDocsUIPlugin, { container: containerRef.value, toc: false, footer: false, wordCount: false, placeholder: false }]
          ]
        }
      ]
    })
    univer = result.univer
    const unit = univer.createUnit(UniverInstanceType.UNIVER_DOC, data)
    unitId = unit?.unitId ?? 'MdViewDoc'
    commandService = univer.__getInjector().get(ICommandService)
    // onCommandExecuted 在 ICommandService 上，Univer 实例没有这个方法
    commandServiceDispose = commandService.onCommandExecuted(() => emit('change'))
    emit('ready')
  } catch (e: any) {
    errText.value = 'docx 解析失败: ' + (e?.message || String(e))
    emit('error', errText.value)
  }
})

onUnmounted(() => {
  try {
    commandServiceDispose?.dispose?.()
  } catch (_) {
    /* ignore */
  }
  try {
    univer?.dispose?.()
  } catch (_) {
    /* ignore */
  }
  univer = null
  commandService = null
  commandServiceDispose = null
})

/** Univer 正文 -> Markdown（表格行以 | 分隔，与 Rust 读取侧约定一致） */
function exportMarkdown(): string | null {
  try {
    const body: any =
      univer?.getUniverInstanceService?.()?.getActive?.() ?? null
    const ds: string = body?.getBody?.()?.dataStream ?? ''
    const paragraphs: any[] = body?.getBody?.()?.paragraphs ?? []
    const lines: string[] = []
    paragraphs.forEach((p, i) => {
      const next = paragraphs[i + 1]
      const end = next ? next.startIndex : ds.length
      // 去掉尾部的段落标记 \r，并按行尾空白收尾
      let text = ds.slice(p.startIndex, end).replace(/\r$/, '')
      if (text.trim() === '') return
      const style = p.paragraphStyle ?? p.paragraph_style ?? {}
      const named = style.namedStyleType ?? style.named_style_type
      if (typeof named === 'number' && named >= 4 && named <= 8) {
        lines.push(`${'#'.repeat(named - 3)} ${text.trim()}`)
        return
      }
      const align = style.horizontalAlign ?? style.horizontal_align
      if (align != null && [2, 3].includes(align)) {
        const marker = align === 2 ? 'center' : 'right'
        lines.push(`<!-- align:${marker} --> ${text.trim()}`)
        return
      }
      if (p.bullet) {
        lines.push(`- ${text.trim()}`)
        return
      }
      if (text.trimStart().startsWith('|') && text.trimEnd().endsWith('|')) {
        lines.push(text.trim())
        return
      }
      lines.push(text.trim())
    })
    return lines.join('\n\n')
  } catch (e) {
    console.warn('[UniverDocEditor] 导出 Markdown 失败', e)
    return null
  }
}

defineExpose({ exportMarkdown })
</script>

<template>
  <div class="udx">
    <div v-if="errText" class="office-error">{{ errText }}</div>
    <template v-else>
      <div class="udx-bar">
        <button class="udx-btn" title="撤销" @click="exec('cli.command.undo-redo.undo')">↶</button>
        <button class="udx-btn" title="重做" @click="exec('cli.command.undo-redo.redo')">↷</button>
        <span class="udx-sep"></span>
        <select class="udx-sel" title="字体" @change="exec('doc.command.set-inline-format-font-family', { value: ($event.target as HTMLSelectElement).value })">
          <option value="Microsoft YaHei">微软雅黑</option>
          <option value="PingFang SC">苹方</option>
          <option value="SimSun">宋体</option>
        </select>
        <select
          class="udx-sel"
          title="字号"
          @change="exec('doc.command.set-inline-format-fontsize', { value: Number(($event.target as HTMLSelectElement).value) })"
        >
          <option v-for="s in fontSizes" :key="s" :value="s">{{ s }}</option>
        </select>
        <span class="udx-sep"></span>
        <button class="udx-btn" title="加粗" @click="exec('doc.command.set-inline-format-bold', { value: 1 })">B</button>
        <button class="udx-btn" title="斜体" @click="exec('doc.command.set-inline-format-italic', { value: 1 })"><i>I</i></button>
        <button class="udx-btn" title="下划线" @click="exec('doc.command.set-inline-format-underline', { value: 1 })">U</button>
        <button class="udx-btn" title="删除线" @click="exec('doc.command.set-inline-format-strikethrough', { value: 1 })">S</button>
        <input class="udx-color" type="color" title="字体颜色" @input="exec('doc.command.set-inline-format-text-color', { value: ($event.target as HTMLInputElement).value })" />
        <span class="udx-sep"></span>
        <button class="udx-btn" title="左对齐" @click="exec('doc.command.align-left')">⇤</button>
        <button class="udx-btn" title="居中" @click="exec('doc.command.align-center')">⇔</button>
        <button class="udx-btn" title="右对齐" @click="exec('doc.command.align-right')">⇥</button>
        <span class="udx-sep"></span>
        <button class="udx-btn" title="一级标题" @click="exec('doc.command.h1-heading')">H1</button>
        <button class="udx-btn" title="二级标题" @click="exec('doc.command.h2-heading')">H2</button>
        <button class="udx-btn" title="三级标题" @click="exec('doc.command.h3-heading')">H3</button>
        <button class="udx-btn" title="正文" @click="exec('doc.command.normal-text-heading')">正文</button>
        <span class="udx-sep"></span>
        <button class="udx-btn" title="无序列表" @click="exec('doc.command.bullet-list', { value: 'BULLET_LIST' })">• 列表</button>
        <button class="udx-btn" title="有序列表" @click="exec('doc.command.order-list', { value: 'ORDER_LIST' })">1. 列表</button>
        <button class="udx-btn" title="插入表格" @click="exec('doc.command.create-table', { rowCount: 3, colCount: 3 })">表格</button>
      </div>
      <div ref="containerRef" class="udx-host"></div>
    </template>
  </div>
</template>

<style src="./UniverDocEditor.css" scoped></style>
