import ExcelJS from 'exceljs'
import type { IWorkbookData } from '@univerjs/presets'

/** 嵌入 xlsx 的图片：锚定到某工作表的单元格左上角（保存时原样写回，避免丢图） */
export interface SheetEmbeddedImage {
  bytes: Uint8Array
  width: number
  height: number
  /** 目标工作表名；缺省写入第一个工作表 */
  sheetName?: string
  /** 锚点行（0 基） */
  row: number
  /** 锚点列（0 基） */
  col: number
}

/** Univer 单元格样式（仅保留会往返映射的字段） */
interface UniverCellStyle {
  /** bold: 1 | 0 */
  bl?: number
  /** italic */
  it?: number
  /** font size */
  fs?: number
  /** color: { rgb } */
  cl?: { rgb?: string }
  /** background: { rgb } */
  bg?: { rgb?: string }
}

/** #RRGGBB → exceljs 的 ARGB（FFRRGGBB） */
function toArgb(hex?: string): string | undefined {
  if (!hex) return undefined
  const h = hex.replace('#', '').trim()
  if (h.length === 6) return `FF${h.toUpperCase()}`
  if (h.length === 8) return h.toUpperCase()
  return undefined
}

/** exceljs ARGB → #RRGGBB */
function fromArgb(argb?: string): string | undefined {
  if (!argb) return undefined
  const h = argb.replace('#', '').trim()
  if (h.length === 8) return `#${h.slice(2).toUpperCase()}`
  if (h.length === 6) return `#${h.toUpperCase()}`
  return undefined
}

/**
 * 从已加载的 ExcelJS 工作簿抽取嵌入图片，回带字节 + 锚点。
 * xlsx 内嵌图在 exceljs 里：字节放 wb.model.media、锚点放 ws.model.media，
 * 用 imageId 关联。还原成 SheetEmbeddedImage 供编辑器重开时贴回工作表、
 * 保存时再写回 —— 否则 save → reopen 后图片消失（over-grid 图片不在 cellData 里）。
 */
function collectEmbeddedImages(wb: ExcelJS.Workbook): SheetEmbeddedImage[] {
  const media = ((wb as any).model?.media || []) as Array<{
    index: number
    extension?: string
    buffer?: Uint8Array | ArrayBuffer
  }>
  const byIndex = new Map<number, (typeof media)[number]>()
  media.forEach((m) => byIndex.set(m.index, m))

  const out: SheetEmbeddedImage[] = []
  wb.worksheets.forEach((ws) => {
    const sheetMedia = ((ws.model as any)?.media || []) as Array<{
      imageId: number
      range?: {
        tl?: { nativeRow?: number; nativeCol?: number }
        ext?: { width?: number; height?: number }
      }
    }>
    for (const sm of sheetMedia) {
      const src = byIndex.get(sm.imageId)?.buffer
      if (!src) continue
      const bytes = new Uint8Array(src)
      const tl = sm.range?.tl || { nativeRow: 1, nativeCol: 6 }
      const ext = sm.range?.ext || { width: 480, height: 300 }
      out.push({
        bytes,
        width: ext.width || 480,
        height: ext.height || 300,
        sheetName: ws.name,
        row: tl.nativeRow ?? 1,
        col: tl.nativeCol ?? 6,
      })
    }
  })
  return out
}

/**
 * ExcelJS 工作簿 → Univer IWorkbookData
 * 映射 值 + 公式 + 工作表结构（行列/名称/顺序）+ 基础样式（粗体/斜体/字号/字色/底色）+ 列宽。
 */
export async function xlsxToUniver(buffer: Uint8Array): Promise<IWorkbookData> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  const sheetOrder: string[] = []
  const sheets: Record<string, any> = {}
  const styles: Record<string, UniverCellStyle> = {}
  let styleSeq = 0
  /** 样式去重：同一份样式 JSON 复用同一个 styleId */
  const styleKeyToId = new Map<string, string>()

  const internStyle = (st: UniverCellStyle): string | undefined => {
    const keys = Object.keys(st)
    if (keys.length === 0) return undefined
    const key = JSON.stringify(st)
    const hit = styleKeyToId.get(key)
    if (hit) return hit
    const id = `s${++styleSeq}`
    styleKeyToId.set(key, id)
    styles[id] = st
    return id
  }

  wb.worksheets.forEach((ws, idx) => {
    const id = `sheet_${idx + 1}`
    sheetOrder.push(id)

    const cellData: Record<number, Record<number, any>> = {}
    ws.eachRow((row, rowNum) => {
      const rowObj: Record<number, any> = {}
      row.eachCell((cell, colNum) => {
        const cd: any = {}
        const val = cell.value as any
        if (val && typeof val === 'object' && 'formula' in val) {
          // 公式单元格：f=公式串(不含=)，v=计算结果
          cd.f = String(val.formula)
          cd.v = val.result ?? null
        } else if (val !== null && val !== undefined && val !== '') {
          cd.v = val
        }

        const st: UniverCellStyle = {}
        const font = cell.font as any
        if (font?.bold) st.bl = 1
        if (font?.italic) st.it = 1
        if (typeof font?.size === 'number') st.fs = font.size
        const fontRgb = fromArgb(font?.color?.argb)
        if (fontRgb) st.cl = { rgb: fontRgb }
        const fill = cell.fill as any
        const fillRgb =
          fill?.type === 'pattern' ? fromArgb(fill?.fgColor?.argb) : undefined
        if (fillRgb) st.bg = { rgb: fillRgb }
        const sid = internStyle(st)
        if (sid) cd.s = sid

        if (cd.v !== undefined || cd.f !== undefined || cd.s !== undefined) {
          rowObj[colNum - 1] = cd
        }
      })
      if (Object.keys(rowObj).length) cellData[rowNum - 1] = rowObj
    })

    // 列宽：exceljs width 单位是字符数，Univer 用像素，按 7px/字符换算
    const columnData: Record<number, { w: number }> = {}
    ws.columns?.forEach((col, cIdx) => {
      if (col && typeof col.width === 'number' && col.width > 0) {
        columnData[cIdx] = { w: Math.round(col.width * 7) }
      }
    })

    sheets[id] = {
      id,
      name: ws.name,
      rowCount: Math.max(ws.rowCount || 0, 200),
      columnCount: Math.max(ws.columnCount || 0, 30),
      cellData,
      status: 1,
      zoomRatio: 1,
      scrollTop: 0,
      scrollLeft: 0,
      defaultColumnWidth: 73,
      defaultRowHeight: 23,
      mergeData: [],
      rowData: {},
      columnData,
      showGridlines: 1,
    }
  })

  const data: any = {
    id: 'workbook',
    name: 'Workbook',
    appVersion: '1.0.2',
    locale: 'zh-CN',
    sheetOrder,
    sheets,
    styles,
  }
  // 内嵌图片挂在非标准字段上（Univer 会忽略），供编辑器重开还原、保存时写回
  data.__embeddedImages = collectEmbeddedImages(wb)

  return data as unknown as IWorkbookData
}

/**
 * Univer IWorkbookData → ExcelJS 工作簿 → xlsx buffer
 * 将编辑后的表格写回为 .xlsx 二进制，供 write_binary_base64 落盘。
 */
export async function univerToXlsx(
  data: IWorkbookData,
  images: SheetEmbeddedImage[] = []
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()

  const sheetsMap = data.sheets as unknown as Record<string, any>
  const order =
    data.sheetOrder && data.sheetOrder.length
      ? data.sheetOrder
      : Object.keys(sheetsMap)
  const globalStyles = ((data as any).styles || {}) as Record<
    string,
    UniverCellStyle
  >
  /** 工作表名 → exceljs worksheet，供图片锚定查找 */
  const wsByName = new Map<string, ExcelJS.Worksheet>()

  const resolveStyle = (s: unknown): UniverCellStyle | undefined => {
    if (!s) return undefined
    if (typeof s === 'string') return globalStyles[s]
    if (typeof s === 'object') return s as UniverCellStyle
    return undefined
  }

  for (const sid of order) {
    const sd: any = sheetsMap[sid]
    if (!sd) continue
    const ws = wb.addWorksheet(sd.name || sid)
    wsByName.set(sd.name || sid, ws)

    const cd = sd.cellData || {}
    for (const rStr of Object.keys(cd)) {
      const r = Number(rStr)
      const rowObj = cd[r]
      for (const cStr of Object.keys(rowObj)) {
        const c = Number(cStr)
        const cellData = rowObj[c]
        if (!cellData) continue
        const excelCell = ws.getCell(r + 1, c + 1)
        if (cellData.f) {
          excelCell.value = {
            formula: String(cellData.f),
            result: cellData.v ?? null,
          } as any
        } else if (cellData.v !== undefined && cellData.v !== null) {
          excelCell.value = cellData.v as any
        }

        const st = resolveStyle(cellData.s)
        if (st) {
          const fontColor = toArgb(st.cl?.rgb)
          if (st.bl || st.it || st.fs || fontColor) {
            excelCell.font = {
              ...(excelCell.font || {}),
              bold: !!st.bl,
              italic: !!st.it,
              ...(st.fs ? { size: st.fs } : {}),
              ...(fontColor ? { color: { argb: fontColor } } : {}),
            } as any
          }
          const bgColor = toArgb(st.bg?.rgb)
          if (bgColor) {
            excelCell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: bgColor },
            } as any
          }
        }
      }
    }

    // 列宽写出（Univer 像素 → exceljs 字符宽）
    const colData = sd.columnData || {}
    for (const cStr of Object.keys(colData)) {
      const w = colData[cStr]?.w
      if (typeof w === 'number' && w > 0) {
        ws.getColumn(Number(cStr) + 1).width = Math.max(6, Math.round(w / 7))
      }
    }

    // rowCount/columnCount 在 ExcelJS 是只读 getter；物化行保持网格尺寸
    for (let r = 1; r <= (sd.rowCount || 200); r++) ws.getRow(r)
  }

  // 嵌入图片写回（保图闭环）
  for (const img of images) {
    const target =
      (img.sheetName && wsByName.get(img.sheetName)) || wb.worksheets[0]
    if (!target) continue
    try {
      // exceljs addImage 需独立 ArrayBuffer（直接传 Uint8Array 部分版本静默失败）
      const ab = img.bytes.buffer.slice(
        img.bytes.byteOffset,
        img.bytes.byteOffset + img.bytes.byteLength
      ) as ArrayBuffer
      const imageId = wb.addImage({ buffer: ab, extension: 'png' })
      target.addImage(imageId, {
        tl: { col: img.col, row: img.row } as any,
        ext: { width: img.width, height: img.height },
      })
    } catch (e) {
      console.warn('[exceljsUniver] 图片嵌入失败', e)
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf as ArrayBuffer)
}
