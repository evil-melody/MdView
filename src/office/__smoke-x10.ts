/**
 * x10 探针（第十批，?mode=x10）：截图回 regressions。
 *  - 图片粘贴落到选区单元格（OOXML editAs="oneCell"），不是自由浮图；
 *  - 拖动缩放保持宽高比，不把图压窄；object-fit 不拉伸；
 *  - 工作簿基础字体、Excel 列宽换算、合并区边框合成、换行/对齐。
 * 顶层只注册 mode；结果挂 window.__smoke.x10。
 */
import { h, reactive } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import OfficeSheetView from './components/OfficeSheetView.vue'
import { Engine } from './core/worker/engine'
import { writeZip } from './core/zipwrite'
import { ZipArchive } from './core/zip'
import { BufferSource } from './core/source'
import { imageSizeOf } from './view/xlsx/image'

const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKGREL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

function makeBook(): Map<string, string> {
  const styles = `${DECL}<styleSheet xmlns="${XMAIN}">` +
    '<numFmts count="0"/>' +
    '<fonts count="2">' +
      '<font><sz val="10"/><color rgb="FF111111"/><name val="Meiryo UI"/><family val="2"/></font>' +
      '<font><b/><sz val="10"/><color rgb="FF111111"/><name val="Meiryo UI"/><family val="2"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="7">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FF2F5597"/></left><right/><top/><bottom/><diagonal/></border>' +
      '<border><left/><right style="thin"><color rgb="FF2F5597"/></right><top/><bottom/><diagonal/></border>' +
      '<border><left/><right/><top style="thin"><color rgb="FF2F5597"/></top><bottom/><diagonal/></border>' +
      '<border><left/><right/><top/><bottom style="thin"><color rgb="FF2F5597"/></bottom><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FF2F5597"/></left><right/><top style="thin"><color rgb="FF2F5597"/></top><bottom/><diagonal/></border>' +
      '<border><left/><right/><top/><bottom style="thin"><color rgb="FF2F5597"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="7">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="3" xfId="0"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="4" xfId="0"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="5" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"/>' +
    '</cellXfs></styleSheet>'
  const sheet = `${DECL}<worksheet xmlns="${XMAIN}">` +
    '<sheetFormatPr defaultRowHeight="15" defaultColWidth="8.43"/>' +
    '<cols><col min="3" max="5" width="12.5" customWidth="1"/></cols>' +
    '<sheetData>' +
      '<row r="2"><c r="B2" s="5" t="inlineStr"><is><t>LEFT</t></is></c><c r="D2" s="2" t="inlineStr"><is><t>RIGHT</t></is></c><c r="E2" s="0" t="inlineStr"><is><t>WIDE</t></is></c></row>' +
      '<row r="3"><c r="B3" s="4" t="inlineStr"><is><t>BOTTOM</t></is></c><c r="D3" s="4" t="inlineStr"><is><t>BOTTOM</t></is></c></row>' +
      '<row r="6"><c r="F6" s="6" t="inlineStr"><is><t>CELL</t></is></c></row>' +
    '</sheetData>' +
    '<mergeCells count="1"><mergeCell ref="B2:D3"/></mergeCells>' +
    '</worksheet>'
  return new Map<string, string>([
    ['[Content_Types].xml', `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `${DECL}<Relationships xmlns="${PKGREL}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${DECL}<workbook xmlns="${XMAIN}" xmlns:r="${RNS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${DECL}<Relationships xmlns="${PKGREL}"><Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${RNS}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', styles],
    ['xl/worksheets/sheet1.xml', sheet],
  ])
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const state = reactive<{ ready: boolean; error: string; client: any; info: any; engine: any; view: any }>({
  ready: false, error: '', client: null, info: null, engine: null, view: null,
})

registerSmokeMode('x10', () => {
  const R: any = ((window as any).__smoke ??= {}).x10 = reactive({ ready: false, error: '', info: null, ops: [] as any[] })

  R.drawings = () => state.engine.call('xlsx.drawings', [0])
  R.cellStyle = (r: number, c: number) => {
    const el = document.querySelector(`.ov-cell[data-cell-r="${r}"][data-cell-c="${c}"]`) as HTMLElement | null
    if (!el) return null
    const s = getComputedStyle(el)
    return {
      fontFamily: s.fontFamily, fontSize: s.fontSize, width: s.width, height: s.height,
      borderLeft: s.borderLeft, borderRight: s.borderRight, borderTop: s.borderTop, borderBottom: s.borderBottom,
      whiteSpace: s.whiteSpace, background: s.backgroundColor,
    }
  }
  R.gridStyle = () => {
    const el = document.querySelector('.ov-grid') as HTMLElement | null
    if (!el) return null
    const s = getComputedStyle(el)
    return { fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight, color: s.color }
  }
  /** 图片渲染实测：src / 解码宽高 / complete，闭合「drawing 有但图空」盲区 */
  R.drawingRender = () => [...document.querySelectorAll<HTMLImageElement>('.ov-drawing')].map((im) => ({
    src: (im.getAttribute('src') || '').slice(0, 40), hasSrc: !!im.getAttribute('src'),
    complete: im.complete, nw: im.naturalWidth, nh: im.naturalHeight,
    cssW: im.style.width, cssH: im.style.height
  }))
  /** 真实 Worker 路径复现：DocumentClient 默认走 inline Worker，验证图片字节经 postMessage 往返不丢 */
  R.workerImageCheck = async () => {
    try {
      const { DocumentClient } = await import('./client')
      await import('./core/default-worker')
      const cv = document.createElement('canvas')
      cv.width = 40; cv.height = 30
      const ctx = cv.getContext('2d')!
      ctx.fillStyle = '#c0392b'; ctx.fillRect(0, 0, 40, 30)
      const png: Blob = await new Promise((res) => cv.toBlob((b) => res(b!), 'image/png'))
      const bytes = await png.arrayBuffer()
      const bookBlob = await writeZip(makeBook() as any)
      const client: any = await DocumentClient.open(bookBlob, { name: 'workerimg.xlsx' })
      await client.call('xlsx.load', 0)
      const res: any = await client.call('xlsx.image', 0, { bytes, ext: 'png', anchor: { row: 0, col: 0, wPx: 40, hPx: 30 }, placeInCell: false })
      const draws: any = await client.call('xlsx.drawings', 0)
      const path = draws?.drawings?.[0]?.media
      const partBlob: Blob = await client.call('part', path)
      const ab = await partBlob.arrayBuffer()
      const r: any = { rid: res?.rid, media: path, partBytes: ab.byteLength, sentBytes: bytes.byteLength, mime: partBlob.type, drawCount: draws?.drawings?.length }
      client.destroy()
      return r
    } catch (e) { return { error: String(e) } }
  }
  /** 空图实证：TIFF 字节（macOS 截图剪贴板形态）在各解码环节的实测表现 */
  R.tiffDiag = async () => {
    const r: Record<string, unknown> = {}
    try {
      const resp = await fetch('/test.tif')
      const bytes = await resp.arrayBuffer()
      r.bytes = bytes.byteLength
      // 1. 现状链路：无 MIME blob + createObjectURL（imageSizeOf / toPng 用的方式）
      r.decodeUntyped = await imageSizeOf(bytes)
      // 2. 带 MIME blob + createObjectURL
      r.decodeTyped = await new Promise<{ w: number; h: number }>((res) => {
        const url = URL.createObjectURL(new Blob([bytes], { type: 'image/tiff' }))
        const img = new Image()
        img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url) }
        img.onerror = () => { res({ w: 0, h: 0 }); URL.revokeObjectURL(url) }
        img.src = url
      })
      // 3. 带 MIME data URL（FileReader 同款产物）
      r.decodeDataUrl = await new Promise<{ w: number; h: number }>((res) => {
        const fr = new FileReader()
        fr.onload = () => {
          const img = new Image()
          img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight })
          img.onerror = () => res({ w: 0, h: 0 })
          img.src = String(fr.result)
        }
        fr.readAsDataURL(new Blob([bytes], { type: 'image/tiff' }))
      })
      // 4. 端到端：TIFF 字节 + image/png 声明（macOS 剪贴板实况）走真实 paste 链路
      const before = document.querySelectorAll('.ov-drawing').length
      const file = new File([bytes], 'paste.png', { type: 'image/png' })
      const dt = new DataTransfer()
      dt.items.add(file)
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      await new Promise((res) => setTimeout(res, 2500))
      r.e2e = {
        added: document.querySelectorAll('.ov-drawing').length - before,
        imgs: [...document.querySelectorAll<HTMLImageElement>('.ov-drawing')].map((im) => ({
          src: (im.getAttribute('src') || '').slice(0, 24), nw: im.naturalWidth, complete: im.complete,
        })),
      }
      return r
    } catch (e) { r.error = String(e); return r }
  }
  R.drawingStyle = () => {
    const el = document.querySelector('.ov-drawing') as HTMLElement | null
    if (!el) return null
    const s = getComputedStyle(el)
    return { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height, objectFit: s.objectFit }
  }
  R.cellBox = (r: number, c: number) => {
    const el = document.querySelector(`.ov-cell[data-cell-r="${r}"][data-cell-c="${c}"]`) as HTMLElement | null
    if (!el) return null
    return { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height }
  }
  R.pastePng = async () => {
    const before = document.querySelectorAll('.ov-drawing').length
    const cv = document.createElement('canvas')
    cv.width = 90
    cv.height = 60
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#27ae60'
    ctx.fillRect(0, 0, 90, 60)
    const blob: Blob = await new Promise((res) => cv.toBlob((b) => res(b!), 'image/png'))
    const file = new File([blob], 'cell.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file)
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    for (let i = 0; i < 100; i++) {
      if (document.querySelectorAll('.ov-drawing').length > before) return true
      await wait(80)
    }
    return false
  }
  /** 反复拖图（非格线位置，制造 from colOff≠0）后宽度是否衰减：回写必须无损。锁定浮图——格内图 off 恒 0，测不出该回归 */
  R.repeatDrag = async (n: number) => {
    const sizes: number[] = []
    for (let i = 0; i < n; i++) {
      const list = (await state.engine.call('xlsx.drawings', [0])).drawings
      const at = list.findIndex((d: any) => !d.cell)
      if (at < 0) break
      const cur = list[at]
      sizes.push(Math.round(cur.w * 100) / 100)
      await state.engine.call('xlsx.drawingOp', [0, { kind: 'resize', index: at, x: cur.x + 3.7, y: cur.y + 2.3, w: cur.w, h: cur.h }])
    }
    const list = (await state.engine.call('xlsx.drawings', [0])).drawings
    const last = list.find((d: any) => !d.cell)
    if (last) sizes.push(Math.round(last.w * 100) / 100)
    return sizes
  }

  /** 插一张浮图（placeInCell=false），供无损回归使用 */
  R.addFloat = async () => {
    const cv = document.createElement('canvas')
    cv.width = 120
    cv.height = 80
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#8e44ad'
    ctx.fillRect(0, 0, 120, 80)
    const blob: Blob = await new Promise((res) => cv.toBlob((b) => res(b!), 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    await state.engine.call('xlsx.image', [0, { bytes, ext: 'png', anchor: { row: 12, col: 2, wPx: 120, hPx: 80 }, placeInCell: false }])
    return (await state.engine.call('xlsx.drawings', [0])).drawings.filter((d: any) => !d.cell).length
  }

  /** 格内图语义：宿主格信息（cell / host / 几何），几何由宿主列宽行高推导 */
  R.hostInfo = async () => {
    const r = await state.engine.call('xlsx.drawings', [0])
    return r.drawings.map((d: any, i: number) => ({ i, cell: !!d.cell, host: d.host, x: d.x, y: d.y, w: d.w, h: d.h }))
  }
  /** 反复拖拽浮图（非格内）后宽度是否恒定：回写往返无损 */
  R.floatDrag = async (n: number) => {
    const sizes: number[] = []
    for (let i = 0; i < n; i++) {
      const list = (await state.engine.call('xlsx.drawings', [0])).drawings
      const at = list.findIndex((d: any) => !d.cell)
      if (at < 0) break
      const cur = list[at]
      sizes.push(Math.round(cur.w * 100) / 100)
      await state.engine.call('xlsx.drawingOp', [0, { kind: 'resize', index: at, x: cur.x + 5.3, y: cur.y + 4.1, w: cur.w, h: cur.h }])
    }
    const list = (await state.engine.call('xlsx.drawings', [0])).drawings
    const last = list.find((d: any) => !d.cell)
    if (last) sizes.push(Math.round(last.w * 100) / 100)
    return sizes
  }
  /** 格内图撑格：resize 到 (w,h) 后宿主列宽/行高被撑大，几何由新格尺寸推导 */
  R.cellGrow = async (w: number, h: number) => {
    const list = (await state.engine.call('xlsx.drawings', [0])).drawings
    const at = list.findIndex((d: any) => d.cell)
    if (at < 0) return null
    const before = list[at]
    const res = await state.engine.call('xlsx.drawingOp', [0, { kind: 'resize', index: at, x: before.x, y: before.y, w, h }])
    const after = (await state.engine.call('xlsx.drawings', [0])).drawings[at]
    return { before: { w: before.w, h: before.h, host: before.host }, after: { w: after.w, h: after.h, host: after.host }, layout: !!res?.layout }
  }
  /** 格内图换宿主格：move 到 (x,y) 后宿主格变为落点格，图片尺寸恒定且该格被撑到图片尺寸 */
  R.cellRehost = async (x: number, y: number) => {
    const list = (await state.engine.call('xlsx.drawings', [0])).drawings
    const at = list.findIndex((d: any) => d.cell)
    if (at < 0) return null
    const before = list[at]
    const res = await state.engine.call('xlsx.drawingOp', [0, { kind: 'move', index: at, x, y }])
    const after = (await state.engine.call('xlsx.drawings', [0])).drawings[at]
    return { before: { host: before.host, w: before.w, h: before.h }, after: { host: after.host, w: after.w, h: after.h }, layout: res?.layout ?? null }
  }

  /** 焦点锚：选格后 activeElement 应为隐藏可编辑锚（WKWebView 派发原生 paste 的前提） */
  R.anchorFocused = () => {
    const a = document.querySelector('.ov-paste-anchor') as HTMLElement | null
    if (!a) return { exists: false, focused: false, editable: false }
    return { exists: true, focused: document.activeElement === a, editable: a.isContentEditable }
  }
  /** Cmd+V 不再 preventDefault：放行原生 paste 事件（避免 clipboard.read() 系统授权浮层） */
  R.cmdVNotBlocked = () => {
    const ev = new KeyboardEvent('keydown', { key: 'v', metaKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(ev)
    return !ev.defaultPrevented
  }
  /** 焦点在原生输入框时粘贴事件不抢（名称框 / 公式栏 / 编辑框正常原生粘贴） */
  R.pasteInInputIgnored = async () => {
    const input = document.querySelector('.ov-name-box') as HTMLInputElement | null
    if (!input) return false
    input.focus()
    const cv = document.createElement('canvas')
    cv.width = 30; cv.height = 20
    cv.getContext('2d')!.fillRect(0, 0, 30, 20)
    const blob: Blob = await new Promise((res) => cv.toBlob((b) => res(b!), 'image/png'))
    const dt = new DataTransfer()
    dt.items.add(new File([blob], 'x.png', { type: 'image/png' }))
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    window.dispatchEvent(ev)
    input.blur()
    return !ev.defaultPrevented
  }
  R.savedDrawingXml = async () => {
    const blob: Blob = await state.engine.call('save', [])
    const zip = await ZipArchive.open(new BufferSource(new Uint8Array(await blob.arrayBuffer())))
    const name = zip.list().map((e) => e.name).find((n) => /^xl\/drawings\/drawing\d+\.xml$/.test(n))
    return name ? zip.text(name) : ''
  }

  void (async () => {
    try {
      const handlers: Record<string, (p: unknown) => void> = {}
      const blob: Blob = await writeZip(makeBook() as any)
      const engine = new Engine((ev: string, p: unknown) => handlers[ev]?.(p))
      const info: any = await engine.open(blob, { name: 'x10.xlsx' })
      await engine.call('xlsx.load', [0])
      for (let i = 0; i < 80; i++) {
        const b: any = await engine.call('xlsx.block', [0, 0, 60])
        if (b?.complete || b?.rows?.length) break
        await wait(80)
      }
      state.engine = engine
      state.info = info
      state.client = {
        call: (m: string, ...a: unknown[]) => {
          if (m === 'xlsx.drawingOp') R.ops.push(a[1])
          return (engine as any).call(m, a)
        },
        on: (ev: string, fn: (p: unknown) => void) => { handlers[ev] = fn; return () => { delete handlers[ev] } },
        mediaUrl: (p: string) => (engine as any).call('part', [p]).then((b: Blob) => URL.createObjectURL(b)),
      }
      R.info = info
      state.ready = true
      R.ready = true
    } catch (e) {
      state.error = String(e)
      R.error = state.error
    }
  })()

  return () => state.ready || state.error
    ? h('div', { style: 'height:100vh' }, [
        state.error ? h('div', { style: 'color:#c00;padding:12px' }, state.error) : null,
        h(OfficeSheetView, { client: state.client, editable: true, info: state.info, ref: (v: any) => { state.view = v } }),
      ])
    : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
})
