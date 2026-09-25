<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import {
  createUniver,
  defaultTheme,
  LocaleType,
  UniverInstanceType
} from '@univerjs/presets'
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core'
import { UniverSheetsDrawingPreset } from '@univerjs/preset-sheets-drawing'
import SheetsCoreZhCN from '@univerjs/preset-sheets-core/locales/zh-CN'
import SheetsDrawingZhCN from '@univerjs/preset-sheets-drawing/locales/zh-CN'
import '@univerjs/preset-sheets-core/lib/index.css'
import '@univerjs/preset-sheets-drawing/lib/index.css'
import { readBinaryBase64 } from '../api'
import { xlsxToUniver, univerToXlsx } from '../utils/exceljsUniver'
import type { SheetEmbeddedImage } from '../utils/exceljsUniver'

const props = defineProps<{ path: string }>()
const emit = defineEmits<{
  (e: 'change'): void
  (e: 'ready'): void
  (e: 'error', m: string): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const errText = ref('')
let univer: any = null
let fUniver: any = null
/** xlsx 内嵌图片（over-grid），保存时原样写回，避免丢图 */
const pendingImages: SheetEmbeddedImage[] = []

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const buf = new ArrayBuffer(bin.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i)
  return buf
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function pngToDataUrl(bytes: Uint8Array): string {
  return 'data:image/png;base64,' + bytesToBase64(bytes)
}

/** 重开文档：把 xlsx 内嵌图片贴回工作表并回填 pendingImages（save → reopen 保图闭环） */
async function restoreEmbeddedImages(data: any) {
  const embedded = (data.__embeddedImages || []) as SheetEmbeddedImage[]
  pendingImages.length = 0
  if (!embedded.length) return
  for (const img of embedded) {
    pendingImages.push(img)
    try {
      const fWorkbook = fUniver?.getActiveWorkbook?.()
      const fWorksheet = img.sheetName
        ? fWorkbook?.getSheetByName?.(img.sheetName)
        : fWorkbook?.getActiveSheet?.()
      if (fWorksheet?.newOverGridImage) {
        const dataUrl = pngToDataUrl(img.bytes)
        const image = await fWorksheet
          .newOverGridImage()
          .setSource(dataUrl, fUniver?.Enum?.ImageSourceType?.BASE64 ?? 1)
          .setColumn(img.col)
          .setRow(img.row)
          .buildAsync()
        fWorksheet.insertImages?.([image])
      }
    } catch (e) {
      console.warn('[OfficeSheetEditor] 还原内嵌图失败:', e)
    }
  }
}

onMounted(async () => {
  if (!containerRef.value) return
  try {
    const bytes = new Uint8Array(b64ToBuf(await readBinaryBase64(props.path)))
    const data = await xlsxToUniver(bytes)

    const result = createUniver({
      locale: LocaleType.ZH_CN,
      locales: {
        [LocaleType.ZH_CN]: { ...SheetsCoreZhCN, ...SheetsDrawingZhCN }
      },
      theme: defaultTheme,
      presets: [
        UniverSheetsCorePreset({ container: containerRef.value }),
        UniverSheetsDrawingPreset()
      ]
    })
    univer = result.univer
    fUniver = result.univerAPI

    const unit = univer.createUnit(UniverInstanceType.UNIVER_SHEET, data)
    const unitId = unit?.unitId ?? 'workbook'

    // 任意命令执行（编辑操作）→ 脏态
    try {
      univer.onCommandExecuted(() => emit('change'))
    } catch (_) {
      /* ignore */
    }

    await restoreEmbeddedImages(data)
    emit('ready')
    void unitId
  } catch (e: any) {
    errText.value = 'xlsx 解析失败: ' + (e?.message || String(e))
    emit('error', errText.value)
  }
})

onUnmounted(() => {
  try {
    univer?.dispose?.()
  } catch (_) {
    /* ignore */
  }
  univer = null
  fUniver = null
})

/** 导出当前工作簿为 xlsx base64 */
async function exportBase64(): Promise<string | null> {
  try {
    const wbData = fUniver?.getActiveWorkbook?.()?.save?.()
    if (!wbData) return null
    const buf = await univerToXlsx(wbData, pendingImages)
    return bytesToBase64(buf)
  } catch (e) {
    console.warn('[OfficeSheetEditor] 导出失败', e)
    return null
  }
}

defineExpose({ exportBase64 })
</script>

<template>
  <div class="office-editor-wrapper">
    <div v-if="errText" class="office-error">{{ errText }}</div>
    <div v-else ref="containerRef" class="office-editor-container"></div>
  </div>
</template>

<style src="./OfficeEditors.css" scoped></style>
