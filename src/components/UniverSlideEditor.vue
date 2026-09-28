<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { createUniver, defaultTheme, LocaleType, UniverInstanceType } from '@univerjs/presets'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverUIPlugin } from '@univerjs/ui'
import { UniverSlidesPlugin } from '@univerjs/slides'
import { UniverSlidesUIPlugin, CanvasView } from '@univerjs/slides-ui'
import { ICommandService } from '@univerjs/core'
import SlidesUiZhCN from '@univerjs/slides-ui/locale/zh-CN'
import '@univerjs/slides-ui/lib/index.css'
import '@univerjs/ui/lib/index.css'
import { readPptxUniver, readFileBytes, updatePptxText, replacePptxImage } from '../api'

/** manifest 条目：elementId -> OOXML 落点。origin 用于跳过未改动的元素。 */
type ManifestItem = {
  slideIndex: number
  shapeIndex: number
  kind: 'text' | 'pic'
  origin: string
  rid: string
}

const props = defineProps<{ path: string }>()
const emit = defineEmits<{ (e: 'change'): void; (e: 'ready'): void; (e: 'error', m: string): void }>()

const containerRef = ref<HTMLDivElement | null>(null)
const errText = ref('')
const notice = ref('')
const saving = ref(false)
const pageInfo = ref('')
const manifest = ref<Map<string, ManifestItem>>(new Map())

let univer: any = null
let commandService: any = null
let commandServiceDispose: { dispose?: () => void } | null = null
let model: any = null
let unitId = ''

function exec(id: string, params: Record<string, unknown> = {}): boolean {
  if (!commandService) return false
  try {
    commandService.executeCommand(id, { unitId, ...params })
    return true
  } catch (e) {
    console.warn('[UniverSlideEditor] 命令执行失败', id, e)
    return false
  }
}

/** Univer 富文本 -> 纯文本（dataStream 的段落标记转成换行） */
function richToPlain(rich: any): string {
  const ds: string = rich?.body?.dataStream ?? ''
  return ds.replace(/\r/g, '\n').replace(/\n+$/, '')
}

function syncPageInfo() {
  try {
    const order: string[] = model?.getPageOrder?.() ?? []
    const active = model?.getActivePage?.()
    const at = active ? order.indexOf(active.id) : -1
    pageInfo.value = at >= 0 ? `${at + 1} / ${order.length}` : ''
  } catch (_) {
    pageInfo.value = ''
  }
}

function gotoPage(offset: number) {
  try {
    const order: string[] = model?.getPageOrder?.() ?? []
    const at = model?.getActivePage?.() ? order.indexOf(model.getActivePage().id) : 0
    const next = at + offset
    if (next < 0 || next >= order.length) return
    model.setActivePage(model.getPage(order[next]))
    exec('slide.operation.activate-slide')
    syncPageInfo()
  } catch (e) {
    console.warn('[UniverSlideEditor] 翻页失败', e)
  }
}

/** 当前页第一张“原始图片”的落点：供替换图片按钮定位 rId / slideIndex */
function activePicTarget(): { slideIndex: number; rid: string } | null {
  const active = model?.getActivePage?.()
  for (const [elementId, el] of Object.entries<any>(active?.pageElements ?? {})) {
    const meta = manifest.value.get(elementId)
    if (meta?.kind === 'pic' && meta.rid) {
      return { slideIndex: meta.slideIndex, rid: meta.rid }
    }
  }
  return null
}

/** 画布上当前选中的 elementId（transformer 以 element id 作为 object id） */
function selectedElementId(): string | null {
  try {
    const page = model?.getActivePage?.()
    if (!page) return null
    const canvasView = univer.__getInjector().get(CanvasView)
    const renderUnit = canvasView.getRenderUnitByPageId(page.id, unitId)
    const selected = renderUnit?.scene?.getTransformer?.().getSelectedObjectMap?.()
    if (!selected || selected.size === 0) return null
    return (selected.keys().next().value as string | undefined) ?? null
  } catch (e) {
    console.warn('[UniverSlideEditor] 读取选中元素失败', e)
    return null
  }
}

/** 删除选中元素：只处理原始文本元素，新增元素不落盘以免与 OOXML 产生分歧 */
function deleteSelected() {
  const id = selectedElementId()
  if (!id) {
    notice.value = '请先在画布上选中一个原始文本元素'
    return
  }
  if (!manifest.value.get(id)) {
    notice.value = '新增元素不写回 pptx，请改用“保存”放弃本次新增'
    return
  }
  exec('slide.operation.delete-element', { id })
}

async function replaceImage() {
  const target = activePicTarget()
  if (!target) {
    notice.value = '当前页没有可替换的原始图片（新增图片请用“图片”按钮）'
    return
  }
  const picked = await open({
    multiple: false,
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
  })
  if (typeof picked !== 'string' || !picked) return
  saving.value = true
  try {
    const bytes = await readFileBytes(picked)
    await replacePptxImage(props.path, target.slideIndex, target.rid, bytes)
    emit('change')
  } catch (e: any) {
    errText.value = '替换图片失败：' + (e?.message || String(e))
  } finally {
    saving.value = false
  }
}

async function insertImage() {
  const picked = await open({
    multiple: false,
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
  })
  if (typeof picked !== 'string' || !picked) return
  saving.value = true
  try {
    const bytes = await readFileBytes(picked)
    exec('slide.command.insert-float-image', { file: bytes })
  } catch (e: any) {
    errText.value = '插入图片失败：' + (e?.message || String(e))
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  if (!containerRef.value) return
  try {
    const raw = await readPptxUniver(props.path)
    const data = JSON.parse(raw)
    for (const m of data.manifest ?? []) {
      manifest.value.set(m.elementId, {
        slideIndex: m.slideIndex,
        shapeIndex: m.shapeIndex,
        kind: m.kind,
        origin: m.kind === 'text' ? richToPlain(m.originDoc) : '',
        rid: m.rid ?? ''
      })
    }
    if (data.skippedImages > 0) {
      notice.value = `有 ${data.skippedImages} 张图片因体积未内联显示（文本编辑不受影响）`
    }
    const result = createUniver({
      locale: LocaleType.ZH_CN,
      locales: { [LocaleType.ZH_CN]: SlidesUiZhCN },
      theme: defaultTheme,
      presets: [
        {
          plugins: [
            UniverRenderEnginePlugin,
            [
              UniverUIPlugin,
              { container: containerRef.value, header: false, toolbar: false, contextMenu: true }
            ],
            UniverSlidesPlugin,
            UniverSlidesUIPlugin
          ]
        }
      ]
    })
    univer = result.univer
    model = univer.createUnit(UniverInstanceType.UNIVER_SLIDE, data)
    unitId = model?.getUnitId?.() ?? 'MdViewDeck'
    commandService = univer.__getInjector().get(ICommandService)
    // onCommandExecuted 在 ICommandService 上，Univer 实例没有这个方法
    commandServiceDispose = commandService.onCommandExecuted(() => {
      emit('change')
      syncPageInfo()
    })
    syncPageInfo()
    emit('ready')
  } catch (e: any) {
    errText.value = 'pptx 解析失败: ' + (e?.message || String(e))
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
  model = null
})

/**
 * 保存：把画布里的文本按 manifest 写回 OOXML。
 * Univer OSS 没有 pptx 导出，因此沿用既有 update_pptx_text 就地改写 slideN.xml。
 */
async function commit(): Promise<boolean> {
  if (!model) return false
  saving.value = true
  try {
    const order: string[] = model.getPageOrder?.() ?? []
    const pages = model.getPages?.() ?? {}
    for (const pageId of order) {
      const page = pages[pageId]
      if (!page) continue
      for (const [elementId, el] of Object.entries<any>(page.pageElements ?? {})) {
        const meta = manifest.value.get(elementId)
        if (!meta || meta.kind !== 'text') continue
        if (!el?.richText) continue
        const text = richToPlain(el.richText.rich)
        if (text === meta.origin) continue
        await updatePptxText(props.path, meta.slideIndex, meta.shapeIndex, text)
        meta.origin = text
      }
    }
    return true
  } catch (e: any) {
    errText.value = '保存失败：' + (e?.message || String(e))
    return false
  } finally {
    saving.value = false
  }
}

defineExpose({ commit, replaceImage, insertImage })
</script>

<template>
  <div class="uxe">
    <div v-if="errText" class="office-error">{{ errText }}</div>
    <div v-else-if="notice" class="uxe-notice">{{ notice }}</div>
    <div class="uxe-bar">
      <button class="uxe-btn" title="上一页" @click="gotoPage(-1)">‹</button>
      <span class="uxe-page">{{ pageInfo }}</span>
      <button class="uxe-btn" title="下一页" @click="gotoPage(1)">›</button>
      <span class="uxe-sep"></span>
      <button class="uxe-btn" title="添加文本框" @click="exec('slide.command.add-text')">文本框</button>
      <button class="uxe-btn" title="矩形" @click="exec('slide.command.insert-float-shape.rectangle')">矩形</button>
      <button class="uxe-btn" title="椭圆" @click="exec('slide.command.insert-float-shape.ellipse')">椭圆</button>
      <button class="uxe-btn" title="插入图片到当前页" @click="insertImage">图片</button>
      <span class="uxe-sep"></span>
      <button class="uxe-btn" title="替换当前页第一张原始图片" @click="replaceImage">换图</button>
      <button class="uxe-btn" title="删除选中的原始文本元素" @click="deleteSelected">删除</button>
      <span class="uxe-sep"></span>
      <button class="uxe-btn primary" title="写回 pptx 文件" @click="commit">保存</button>
      <span v-if="saving" class="uxe-saving">保存中…</span>
    </div>
    <div ref="containerRef" class="uxe-host"></div>
  </div>
</template>

<style src="./UniverSlideEditor.css" scoped></style>
