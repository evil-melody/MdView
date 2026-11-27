/**
 * x30 探针：Excel 公式/图片操作 Office 语义门（?mode=x30）
 *
 *  A 节 自动求和（用户报障：选中 G2:G20 点自动求和只塞 `=SUM(` 到公式栏，
 *       之后没反应）。Office 语义 = 选区下方第一个空行写完整公式并出值。
 *  B 节 单格自动求和：探测相邻连续数值区（上→左），写入当前格。
 *  C 节 空单元格自动求和：与 vendored gridcraft 测试同款——`=SUM()` 完整括号
 *       且光标落括号内，绝不写半个 `=SUM(`。
 *  D 节 公式 tab 的「公式」入口：Office 语义 = 插入函数向导，非 prompt 半截公式。
 *
 *  E 节 图片操作（用户追加报障：Backspace 删不掉 / 拖到别格缩小）——
 *        审计结论回来后补断言。生产同路 DocumentClient + OfficeSheetView。
 */
import { h, nextTick, reactive } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import { DocumentClient } from './client'
import OfficeSheetView from './components/OfficeSheetView.vue'
import { writeZip } from './core/zipwrite'

const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

/** I 列 5 行数值（10+20+30+40+50=150），A 列文本 */
function sheetXml(): string {
  const rows: string[] = ['<row r="1"><c r="A1" t="inlineStr"><is><t>项目</t></is></c><c r="I1" t="inlineStr"><is><t>金额</t></is></c></row>']
  const names = ['甲', '乙', '丙', '丁', '戊']
  ;[10, 20, 30, 40, 50].forEach((v, i) => {
    const r = i + 2
    rows.push(`<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>${names[i]}</t></is></c><c r="I${r}"><v>${v}</v></c></row>`)
  })
  return `${DECL}<worksheet xmlns="${XMAIN}"><dimension ref="A1:I6"/><sheetData>${rows.join('')}</sheetData></worksheet>`
}

async function buildXlsx(): Promise<Blob> {
  const parts = new Map<string, string>([
    ['[Content_Types].xml', `${DECL}<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ['_rels/.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${DECL}<workbook xmlns="${XMAIN}" xmlns:r="${RNS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', sheetXml()]
  ])
  return writeZip(parts as any)
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const errs: string[] = []
const ok = (name: string, cond: unknown, extra = '') => {
  if (!cond) errs.push(`${name}${extra ? ' → ' + extra : ''}`)
  return !!cond
}
const detail: Record<string, unknown> = {}
const st = reactive<{ client: any; ready: boolean }>({ client: null, ready: false })

const ptr = (el: Element, type: string, dx = 0, dy = 0) => {
  const b = el.getBoundingClientRect()
  const o: any = { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: b.left + b.width / 2 + dx, clientY: b.top + b.height / 2 + dy, view: window }
  el.dispatchEvent(new PointerEvent(type, o))
}
const cellRpc = (...args: unknown[]): Promise<any> =>
  Promise.race([st.client.call('xlsx.cell', ...args), wait(800).then(() => null)])
const cellEl = (r: number, c: number) => document.querySelector(`.ov-cell[data-cell-r="${r}"][data-cell-c="${c}"]`)
const formulaBar = () => String((document.querySelector('.ov-formula-input') as HTMLInputElement | null)?.value ?? '')

async function run(): Promise<Record<string, unknown>> {
  detail.stage = 'boot'
  const blob = await buildXlsx()
  const client: any = await DocumentClient.open(blob, { name: 'x30.xlsx' })
  st.client = client
  st.ready = true
  await nextTick()
  await wait(300)
  let done = false
  client.on('xlsx:progress', (p: any) => { if (p.sheet === 0 && p.done) done = true })
  await client.call('xlsx.load', 0)
  for (let i = 0; i < 200 && !done; i++) await wait(50)
  for (let i = 0; i < 20; i++) {
    const b: any = await client.call('xlsx.block', 0, 0, 40)
    if (b?.complete) break
    await wait(100)
  }
  await wait(300)
  ok('W0 装载', done)
  const view: any = (window as any).__smoke.x30View
  if (!view?.commands) { errs.push('W1 视图 commands 不可达'); client.destroy(); st.ready = false; return { ok: false, errors: errs, detail } }

    detail.stage = 'A';
// ===== A 节：选区 I2:I6 → 自动求和写入下方 I7（完整公式 + 数值结果） =====
  const i2 = cellEl(1, 8)!
  const i6 = cellEl(5, 8)!
  ok('A0 I2/I6 在位', !!i2 && !!i6)
  if (i2 && i6) {
    ptr(i2, 'pointerdown')
    ptr(i6, 'pointermove')
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, view: window }))
    await wait(250)
    ok('A1 选区建立', !!document.querySelector('.ov-range-tint'), 'tint 缺失')
    detail.stage = 'A.insertFunc';
    void view.commands.insertFunc('SUM')
    await wait(500)
    detail.stage = 'A.rpc';
    let written: any = null
    for (let i = 0; i < 3; i++) {
      written = await cellRpc(0, 6, 8)
      if (String(written?.formula ?? written?.input ?? '').includes('SUM')) break
      await wait(100)
    }
    detail.autoSumCell = written
    ok('A2 I7 落盘 SUM(I2:I6)', String(JSON.stringify(written ?? {})).includes('SUM(I2:I6'), JSON.stringify(written ?? {}).slice(0, 160))
    const b: any = await client.call('xlsx.block', 0, 0, 40)
    const row6 = (b?.rows ?? []).find((x: any) => x.r === 6)
    const v = (row6?.cells ?? []).find((x: any) => x[0] === 8)?.[1]
    detail.autoSumValue = v
    ok('A3 I7 求得 150', Number(v) === 150, String(v))
    ok('A4 公式栏不残留半截 =SUM(', !formulaBar().startsWith('=SUM('), formulaBar())
  }

    detail.stage = 'B';
// ===== B 节：单格 J2 → 探测左侧连续数值 I2 → 写入当前格 =====
  if (cellEl(1, 9)) {
    ptr(cellEl(1, 9)!, 'pointerdown')
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, view: window }))
    await wait(200)
    void view.commands.insertFunc('SUM')
    await wait(500)
    let j2: any = null
    for (let i = 0; i < 3; i++) {
      j2 = await cellRpc(0, 1, 9)
      if (String(JSON.stringify(j2 ?? {})).includes('SUM')) break
      await wait(100)
    }
    detail.singleCellSum = j2
    ok('B1 J2 落盘 SUM(I2)', String(JSON.stringify(j2 ?? {})).includes('SUM(I2'), JSON.stringify(j2 ?? {}).slice(0, 160))
  } else errs.push('B0 J2 单元不在位')

    detail.stage = 'C';
// ===== C 节：孤立空单元格 B10 → 只进编辑态完整 =SUM() =====
  if (cellEl(9, 1)) {
    ptr(cellEl(9, 1)!, 'pointerdown')
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, view: window }))
    await wait(200)
    await view.commands.insertFunc('SUM')
    await wait(150)
    detail.emptyCaretFormula = formulaBar()
    ok('C1 空区进完整 =SUM() 编辑态', formulaBar() === '=SUM()', formulaBar())
    const b10 = await cellRpc(0, 9, 1)
    ok('C2 空区不写单元格', !String(JSON.stringify(b10 ?? {})).includes('SUM'), JSON.stringify(b10 ?? {}).slice(0, 120))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await wait(150)
  } else errs.push('C0 B10 单元不在位')

    detail.stage = 'D';
// ===== D 节：「公式」入口走向导（Office 插入函数语义） =====
  view.commands.insertFormula()
  await wait(400)
  ok('D1 公式按钮打开插入函数向导', !!document.querySelector('.ov-fd-float'), '无 .ov-fd-float（仍是 prompt 半截公式）')
  const overlay = document.querySelector('.op-prompt-overlay')
  if (overlay) {
    detail.formulaPrompt = String(overlay.textContent ?? '').slice(0, 120)
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(150)
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await wait(400)

  // ===== E 节：格内图片——Backspace 删除 + 拖到别格不缩水 =====
  detail.stage = 'E'
  const cv = document.createElement('canvas')
  cv.width = 120
  cv.height = 80
  const cx = cv.getContext('2d')!
  cx.fillStyle = '#8e44ad'
  cx.fillRect(0, 0, 120, 80)
  detail.stage = 'E.toBlob';
  const png: Blob = await new Promise((res) => cv.toBlob((b) => res(b!), 'image/png'))
  const pasteImg = () => {
    ;(document.activeElement as HTMLElement | null)?.blur() // 焦点在粘贴锚时 onDocPaste 直接 return
    const dt = new DataTransfer()
    dt.items.add(new File([png], 'cell.png', { type: 'image/png' }))
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }
  detail.stage = 'E.paste1';
  pasteImg()
  for (let i = 0; i < 60 && document.querySelectorAll('.ov-drawing').length === 0; i++) { detail.stage = 'E.paste1.' + i; await wait(100) }
  ok('E1 粘贴格内图出现', document.querySelectorAll('.ov-drawing').length > 0, `count=${document.querySelectorAll('.ov-drawing').length}`)
  const img = document.querySelector('.ov-drawing')
  if (img) {
    // 真实操作链：公式栏还留着焦点 → 点图片应交出焦点 → Backspace 才能删图
    ;(document.querySelector('.ov-formula-input') as HTMLInputElement | null)?.focus()
    ptr(img, 'pointerdown')
    // pointerup 必须落在图片元素上：真实事件会冒泡到 .ov-grid @pointerup="refocusAnchor"。
    // 旧探针派到 window 绕开了这条路径，掩盖了「点图后焦点被拉回 contenteditable 锚」的根因。
    img.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, view: window }))
    await wait(200)
    ok('E2 单击选中图片', !!document.querySelector('.ov-drawing-sel'), '无选中框')
    const ae = document.activeElement as HTMLElement | null
    ok('E2b 点图后焦点不在文本锚/输入框', !(ae?.isContentEditable || ae?.tagName === 'INPUT'), String(ae?.className ?? ae?.tagName))
    detail.stage = 'E.dispatch';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }))
    for (let i = 0; i < 30 && document.querySelectorAll('.ov-drawing').length > 0; i++) { detail.stage = 'E.delLoop.' + i; await wait(100) }
    ok('E3 公式栏有焦点时 Backspace 删图', document.querySelectorAll('.ov-drawing').length === 0, `count=${document.querySelectorAll('.ov-drawing').length}`)
  } else errs.push('E0 无图片可测删除')

  detail.stage = 'E.paste2';
  pasteImg()
  for (let i = 0; i < 20; i++) {
    const list: any = await client.call('xlsx.drawings', 0)
    if (list?.drawings?.some((d: any) => d.cell)) break
    await wait(100)
  }
  const beforeList: any = await client.call('xlsx.drawings', 0)
  const idx = (beforeList?.drawings ?? []).findIndex((d: any) => d.cell)
  const b4 = idx >= 0 ? beforeList.drawings[idx] : null
  detail.imgBeforeMove = b4
  ok('E4 格内图在位', !!b4, `idx=${idx}`)
  if (b4) {
    detail.stage = 'E.moveRpc';
    await client.call('xlsx.drawingOp', 0, { kind: 'move', index: idx, x: b4.x + 180, y: b4.y + 90 })
    const afterList: any = await client.call('xlsx.drawings', 0)
    const aft = afterList?.drawings?.[idx]
    detail.imgAfterMove = aft
    ok('E5 拖到别格尺寸不变', !!aft && Math.abs(aft.w - b4.w) < 1 && Math.abs(aft.h - b4.h) < 1,
      `before=${b4.w}x${b4.h} after=${aft?.w}x${aft?.h}`)
  }

  await wait(300) // 等在途 RPC 结算再 destroy（x29 教训）
  client.destroy()
  st.ready = false
  return { ok: errs.length === 0, errors: errs, detail }
}

let cached: Promise<Record<string, unknown>> | null = null
function result(): Promise<Record<string, unknown>> {
  if (!cached) cached = Promise.race([
    run().catch((e) => ({ ok: false, errors: [`threw: ${String(e)} @ ${String(detail.stage ?? '')}`], detail })),
    wait(240000).then(() => ({ ok: false, errors: [`TIMEOUT @ ${String(detail.stage ?? '')}`], detail }))
  ])
  return cached
}

registerSmokeMode('x30', () => {
  ;(window as any).__smoke.x30 = { result }
  return () => {
    if (st.ready && st.client)
      return h('div', { style: 'height:100vh' }, [
        h(OfficeSheetView, { ref: (el: any) => ((window as any).__smoke.x30View = el), client: st.client, editable: true, info: st.client.info })
      ])
    return h('div', { style: 'width:100%;height:100%' }, 'x30 自动求和 Office 语义门')
  }
})
