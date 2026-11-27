/**
 * x29 探针（Excel 三项报障，?mode=x29）：
 *
 *  ① 选择单元格时出现浏览器原生**文字选区**（截图：C 列单词级紫底）。
 *     根因 = .ov-grid 只有 user-select 没有 -webkit- 前缀，WKWebView 不认。
 *     断言（Chromium 同样适用）：拖选/单击后 window.getSelection() 不得横跨
 *     .ov-cell 文本；计算样式链必须全程 none。
 *  ② 「插入函数」不是 Office 向导（旧行为 = 往公式栏塞 `=SUM(` 完事）。
 *     断言：openFuncDlg 出面板（类别/列表/说明）→ setFn 进步骤 args →
 *     网格拖选回填 A1 区域 → 公式串 + 内核引擎实时求值 → 确定写入目标格。
 *  ③ 分类汇总「每次都报未找到数值列，必须全选才出数」。
 *     根因 = inferFields/runSubtotal 把探测收窄到当前选区，单选数值列时
 *     找不到文本分组列。断言：光标停在数值列单格 → 对话框直接弹出且
 *     预选全表推断的分组列/汇总项 → 确定后小计/总计行落盘。
 *
 * 三态全部走 **生产同路**：DocumentClient 默认 Worker 通道 + OfficeSheetView
 * 真实渲染（x26 教训：主线程绿 ≠ Worker 绿）。
 *
 * 顶层只注册 mode；结果挂 window.__smoke.x29（promise 路径，与 x25~x28 同规）。
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

/** 费用表（复刻报障截图形态）：A年 B月 C科目 D编码 … I借方金额；C 列有重复文本 */
function sheetXml(): string {
  const rows: string[] = []
  const data: [string, string, number][] = [
    ['工资', '640103', 50000], ['差旅费', '640103', 5000], ['业务招待费', '660101', 5000],
    ['差旅费', '660102', 500], ['通信费', '660103', 5000], ['通信费', '660103', 500],
    ['工资', '660201', 2000], ['差旅费', '660202', 100], ['水电费', '660203', 100],
    ['租赁费', '660204', 20000], ['手续费', '660301', 100]
  ]
  rows.push(`<row r="1"><c r="A1" t="inlineStr"><is><t>年</t></is></c><c r="B1" t="inlineStr"><is><t>月</t></is></c><c r="C1" t="inlineStr"><is><t>科目名称</t></is></c><c r="D1" t="inlineStr"><is><t>科目编码</t></is></c><c r="I1" t="inlineStr"><is><t>借方金额</t></is></c></row>`)
  data.forEach(([name, code, amt], i) => {
    const r = i + 2
    rows.push(
      `<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>2026</t></is></c><c r="B${r}" t="inlineStr"><is><t>10</t></is></c>` +
      `<c r="C${r}" t="inlineStr"><is><t>${name}</t></is></c><c r="D${r}" t="inlineStr"><is><t>${code}</t></is></c>` +
      `<c r="I${r}"><v>${amt}</v></c></row>`
    )
  })
  return `${DECL}<worksheet xmlns="${XMAIN}"><dimension ref="A1:I12"/><sheetData>${rows.join('')}</sheetData></worksheet>`
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
const cellEl = (r: number, c: number) => document.querySelector(`.ov-cell[data-cell-r="${r}"][data-cell-c="${c}"]`)
const bodyText = () => String(document.body.innerText ?? '')

/** 原生文字选区是否落在网格文本上（报障① 的直接观测量） */
function gridTextSelected(): { on: boolean; info: string } {
  const s = window.getSelection()
  if (!s || s.isCollapsed || s.rangeCount === 0) return { on: false, info: '' }
  const rg = s.getRangeAt(0)
  const node = rg.commonAncestorContainer.nodeType === 1 ? (rg.commonAncestorContainer as Element) : rg.commonAncestorContainer.parentElement
  const inCell = !!node?.closest?.('.ov-cell')
  return { on: inCell && s.toString().trim().length > 0, info: `${JSON.stringify(s.toString().slice(0, 40))} inCell=${inCell}` }
}

async function run(): Promise<Record<string, unknown>> {
  const blob = await buildXlsx()
  const client: any = await DocumentClient.open(blob, { name: 'x29.xlsx' })
  st.client = client
  st.ready = true
  await nextTick()
  await wait(300)
  let done = false
  client.on('xlsx:progress', (p: any) => { if (p.sheet === 0 && p.done) done = true })
  await client.call('xlsx.load', 0)
  for (let i = 0; i < 200 && !done; i++) await wait(50)
  ok('W0 sheet0 装载', done)
  for (let i = 0; i < 60; i++) {
    const b: any = await client.call('xlsx.block', 0, 0, 40)
    if (b?.complete) break
    await wait(100)
  }
  await wait(400)
  const view: any = (window as any).__smoke.x29View
  if (!view?.commands) { errs.push('W1 视图 commands 不可达'); return { ok: false, errors: errs, detail } }

  // ================= ① 文字选区 =================
  const c2 = cellEl(1, 2) // C2 工资
  const c6 = cellEl(5, 2) // C6 通信费
  ok('S1 C2/C6 单元在位', !!c2 && !!c6)
  if (c2 && c6) {
    // 行头/列头与网格的计算样式链（WebKit 只认 -webkit- 前缀，断言两族都锁）
    const cs = (el: Element) => {
      const s = getComputedStyle(el as HTMLElement)
      return { u: s.userSelect || s.getPropertyValue('-webkit-user-select'), g: s.getPropertyValue('-webkit-user-select') }
    }
    const gridCs = cs(document.querySelector('.ov-grid')!)
    detail.gridUserSelect = gridCs
    ok('S2 .ov-grid user-select=none', gridCs.u === 'none' && gridCs.g === 'none', JSON.stringify(gridCs))
    // 拖选 C2→C6：选区底纹出、文字选区绝不出
    ptr(c2, 'pointerdown')
    ptr(c6, 'pointermove')
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, view: window }))
    await wait(250)
    const sel = gridTextSelected()
    detail.dragTextSel = sel.info
    ok('① S3 拖选不产生文字选区', !sel.on, sel.info)
    ok('S4 拖选后网格选区在位', !!document.querySelector('.ov-range-tint'), 'tint 缺失 = 框选没走通')
    // 单击锚格同样不留文字选区
    ptr(cellEl(1, 2)!, 'pointerdown')
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, view: window }))
    await wait(150)
    const sel2 = gridTextSelected()
    ok('① S5 单击不产生文字选区', !sel2.on, sel2.info)
    // 编辑框内必须恢复可选（user-select:text）——否则编辑时无法选字。
    // user-select 非继承属性：.ov-cell 自身必须显式 none，编辑 input 显式 text。
    const cellCs = cs(cellEl(1, 2)!)
    detail.cellUserSelect = cellCs
    ok('S6 单元文本不可选（.ov-cell 显式 none）', cellCs.u === 'none', JSON.stringify(cellCs))
    cellEl(1, 2)!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await wait(200)
    const inp = document.querySelector('.ov-cell-input')
    if (inp) {
      const inpCs = cs(inp)
      detail.inputUserSelect = inpCs
      ok('S7 编辑框恢复可选', inpCs.u === 'text' && inpCs.g === 'text', JSON.stringify(inpCs))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await wait(150)
    } else errs.push('S7 编辑框未出现（dblclick 没进编辑）')
  }
  window.getSelection()?.removeAllRanges()

  // ================= ② 插入函数向导 =================
  view.commands.openFuncDlg('数学和三角')
  await wait(250)
  ok('F1 向导面板出现', !!document.querySelector('.ov-fd-float'), '无 .ov-fd-float')
  ok('F2 类别预选（数学和三角）', bodyText().includes('数学和三角'), '类别条未显示')
  ok('F3 函数列表铺出', !!document.querySelector('.ov-fd-item') && document.querySelectorAll('.ov-fd-item').length > 30, `items=${document.querySelectorAll('.ov-fd-item').length}`)
  ok('F4 说明区带签名', bodyText().includes('SUM(') || bodyText().includes('ABS('), '签名缺失')
  // 选 SUM 进参数步
  const sumBtn = [...document.querySelectorAll<HTMLButtonElement>('.ov-fd-item')].find((b) => b.textContent?.trim() === 'SUM')
  ok('F5 列表含 SUM', !!sumBtn)
  sumBtn?.click()
  await wait(150)
  const confirm = [...document.querySelectorAll<HTMLButtonElement>('.ov-dlg-ok')].pop()
  confirm?.click()
  await wait(250)
  ok('F6 进入参数步', !!document.querySelector('.ov-fd-argin') && bodyText().includes('求值结果'), '参数槽/预览区缺失')
  // 网格拖选 I2:I9 → 回填参数槽（非模态拾取 = Office 标志交互）
  const i2 = cellEl(1, 8)!
  const i9 = cellEl(8, 8)!
  ok('F7 I2/I9 单元在位', !!i2 && !!i9)
  if (i2 && i9) {
    ptr(i2, 'pointerdown')
    ptr(i9, 'pointermove')
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, view: window }))
    await wait(400)
    const argVal = (document.querySelector('.ov-fd-argin') as HTMLInputElement | null)?.value ?? ''
    detail.pickArg = argVal
    ok('② F8 拖选回填参数槽', argVal === 'I2:I9', JSON.stringify(argVal))
    // 内核引擎实时求值：50000+5000+5000+500+5000+500+2000+100 = 68100
    // 预览 = 150ms 防抖 + 逐引用格 readCell（Worker 通道）：轮询等结算，勿固定 sleep
    let prev = ''
    for (let i = 0; i < 60; i++) {
      prev = bodyText().match(/求值结果：\s*([\s\S]{0,24})/)?.[1]?.trim() ?? ''
      if (prev && !prev.startsWith('（填写参数')) break
      await wait(100)
    }
    detail.previewRaw = prev
    ok('② F9 求值预览 = 68100', prev.startsWith('68100'), JSON.stringify(prev.slice(0, 24)))
  }
  // 确定 → 写入当前格（锚在 C2 → 公式落 C2）
  const okBtn = [...document.querySelectorAll<HTMLButtonElement>('.ov-dlg-ok')].pop()
  okBtn?.click()
  await wait(500)
  const c2v: any = await client.call('xlsx.cell', 0, 1, 2)
  detail.funcWritten = c2v
  ok('② F10 公式写入目标格', String(c2v?.formula ?? c2v?.input ?? '').includes('SUM(I2:I9)') || String(JSON.stringify(c2v)).includes('SUM'), JSON.stringify(c2v).slice(0, 160))
  ok('F11 向导关闭', !document.querySelector('.ov-fd-float'))
  await wait(400) // 等在途预览防抖结算（关窗后尾巴仍可能发 readCell）
  // 撤销 C2 的写入，恢复数据供③ 使用（⌘Z 走 x27 已证的 JS 链）
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }))
  await wait(400)

  // ================= ③ 分类汇总：单格光标即可出对话框 =================
  // 光标落在 I2（数值列单格）——修复前 inferFields 被选区困在 I 列 → 报「未找到数值列」
  ptr(cellEl(1, 8)!, 'pointerdown')
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, view: window }))
  await wait(250)
  const alertBefore = document.querySelector('.op-prompt-overlay')
  ok('T0 无历史弹窗残留', !alertBefore, alertBefore ? String(alertBefore.querySelector('.op-prompt-title')?.textContent) : '')
  const p = view.commands.subtotal() // 不 await：弹窗分支 return officeAlert 的 promise
  await wait(400)
  const overlay = document.querySelector('.op-prompt-overlay')
  if (overlay) {
    const t = String(overlay.querySelector('.op-prompt-title')?.textContent ?? '')
    detail.subtotalAlert = t
    ok('③ T1 单格光标不再弹「未找到数值列」', false, `仍弹窗：${t}`)
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await p
  } else {
    await p
    const dlg = document.querySelector('.ov-dlg')
    ok('③ T1 对话框直接弹出', !!dlg, '无弹窗且无对话框')
    const txt = dlg ? String(dlg.textContent ?? '') : ''
    detail.subtotalDlg = txt.slice(0, 240)
    ok('③ T2 分组列预选文本列（科目名称）', txt.includes('科目名称'), txt.slice(0, 120))
    ok('③ T3 汇总项预选借方金额', txt.includes('借方金额'), txt.slice(0, 120))
    // 确定 → 小计/总计写回（12 组 × 插行+写值+加粗 = 36 次串行 RPC，轮询等内核）
    const okB = dlg ? [...dlg.querySelectorAll<HTMLButtonElement>('.ov-dlg-ok')].pop() : null
    okB?.click()
    let flat = ''
    for (let i = 0; i < 80; i++) {
      const after: any = await client.call('xlsx.block', 0, 0, 40)
      flat = JSON.stringify(after?.rows ?? [])
      if (flat.includes('总计')) break
      await wait(100)
    }
    detail.subtotalRows = flat.slice(0, 400)
    ok('③ T4 小计行落盘（含「总计」）', flat.includes('总计'), 'block 无总计')
    // 大纲折叠柄是视图侧渲染（RPC 之后还要 loadVisible）：同样轮询，且必须在
    // destroy 前等到结算——否则在途 RPC 打在已关闭的 client 上 = Document closed
    let hasToggle = false
    for (let i = 0; i < 60 && !hasToggle; i++) {
      hasToggle = !!document.querySelector('.ov-outline-toggle')
      if (!hasToggle) await wait(100)
    }
    ok('③ T5 大纲折叠柄出现', hasToggle, '无 outline-toggle')
  }
  client.destroy()
  st.ready = false
  return { ok: errs.length === 0, errors: errs, detail }
}

let cached: Promise<Record<string, unknown>> | null = null
function result(): Promise<Record<string, unknown>> {
  if (!cached) cached = run().catch((e) => ({ ok: false, errors: [`threw: ${String(e)}`], detail }))
  return cached
}

registerSmokeMode('x29', () => {
  ;(window as any).__smoke.x29 = { result }
  return () => {
    if (st.ready && st.client)
      return h('div', { style: 'height:100vh' }, [
        h(OfficeSheetView, { ref: (el: any) => ((window as any).__smoke.x29View = el), client: st.client, editable: true, info: st.client.info })
      ])
    return h('div', { style: 'width:100%;height:100%' }, 'x29 Excel 报障三门：文字选区 / 插入函数向导 / 分类汇总探测域')
  }
})
