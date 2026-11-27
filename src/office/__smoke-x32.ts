/**
 * x32 探针（P18 截图报障，?mode=x32）：
 *
 *  A 节 图表六类型真落地（用户：「我要根据当前表格生成曲线图，完全没有」）。
 *     旧根因 = ribbon args 'column'/'scatter'/'area' 与内核 ChartKind('col'|…) 断裂，
 *     'column' 落 chartSvg else 分支被画成饼图、scatter/area 静默退化。
 *     断言：六种 kind 逐一 chartAdd → features 读回 kind 保真 → save 包内
 *     chart part 元素名硬断言（c:barDir/c:lineChart/c:pieChart/c:areaChart/
 *     c:scatterChart + scatter 双 valAx）→ 视图 .ov-feat-chart 渲染数一致。
 *  B 节 单格选区出图（Excel 行为：单格 → 自动取连续数据区，不弹「请先选择区域」）。
 *  C 节 向导自引用拦截（截图 `=ABS(C12)` 写进 C12 → #REF! 静默落格）。
 *     Excel 语义 = 循环引用警告 + 不写入 + 向导不关闭。
 *  D 节 批注角标真层 + 「隐藏批注」真开关（审计问题 6 旧为只写 bar 的假开关）。
 *
 * 全走生产同路：DocumentClient（Worker）+ OfficeSheetView 真实渲染。
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

/** 应收核销表形态（复刻截图）：A 项目文本 + I 金额数值，行 2..6 */
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

const cellEl = (r: number, c: number) => document.querySelector(`.ov-cell[data-cell-r="${r}"][data-cell-c="${c}"]`)
const ptr = (el: Element, type: string) => {
  const b = el.getBoundingClientRect()
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, view: window }))
}
/** 内核包内 part 文本（chartAdd 后 pkg 已重写，等价于 save 真值） */
async function partText(path: string): Promise<string> {
  const blob: Blob = await st.client.call('part', path)
  return blob ? await blob.text() : ''
}

const KINDS: [string, (x: string) => boolean][] = [
  ['col', (x) => x.includes('<c:barChart>') && x.includes('<c:barDir val="col"')],
  ['bar', (x) => x.includes('<c:barChart>') && x.includes('<c:barDir val="bar"')],
  ['line', (x) => x.includes('<c:lineChart>')],
  ['pie', (x) => x.includes('<c:pieChart>')],
  ['area', (x) => x.includes('<c:areaChart>')],
  ['scatter', (x) => x.includes('<c:scatterChart>') && x.includes('<c:scatterStyle val="lineMarker"')]
]

async function run(): Promise<Record<string, unknown>> {
  detail.stage = 'boot'
  const blob = await buildXlsx()
  const client: any = await DocumentClient.open(blob, { name: 'x32.xlsx' })
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
  const view: any = (window as any).__smoke.x32View
  if (!view?.commands) { errs.push('W1 视图 commands 不可达'); client.destroy(); st.ready = false; return { ok: false, errors: errs, detail } }

  // ===== A 节：六种 kind 逐一 → part 元素硬断言 =====
  detail.stage = 'A'
  const data = { cats: ['甲', '乙', '丙', '丁', '戊'], series: [{ name: '金额', values: [10, 20, 30, 40, 50] }] }
  for (let i = 0; i < KINDS.length; i++) {
    const [kind, check] = KINDS[i]
    detail.stage = `A.${kind}`
    const src = { r0: 0, c0: 0, r1: 5, c1: 8 }
    await client.call('xlsx.chartAdd', 0, { kind, title: `t-${kind}`, source: src, data, anchor: { row: 8 + i * 20, col: 0, wPx: 480, hPx: 300 } })
    const feats: any = await client.call('xlsx.features', 0)
    const mine = (feats?.charts ?? []).find((c: any) => c.title === `t-${kind}`)
    ok(`A${i} ${kind} features 读回 kind 保真`, mine?.kind === kind, JSON.stringify(mine?.kind))
    if (!mine) continue
    const xml = await partText(mine.chartPart)
    detail[`part_${kind}`] = xml.slice(0, 0) || `${xml.length}b`
    ok(`A${i} ${kind} chart part 元素正确`, check(xml), xml.slice(0, 200))
  }
  // scatter 双数值轴：catAx 不得出现
  detail.stage = 'A.scatter-axes'
  {
    const feats: any = await client.call('xlsx.features', 0)
    const sc = (feats?.charts ?? []).find((c: any) => c.kind === 'scatter')
    if (sc) {
      const xml = await partText(sc.chartPart)
      const valAx = (xml.match(/<c:valAx>/g) ?? []).length
      ok('A6 scatter 双 valAx 且无 catAx', valAx >= 2 && !xml.includes('<c:catAx>'), `valAx=${valAx} catAx=${xml.includes('<c:catAx>')}`)
    }
  }
  // 视图渲染层：features 刷新后 .ov-feat-chart 数量一致
  detail.stage = 'A.view'
  await view.refreshFeatures?.()
  await wait(400)
  const chartNodes = document.querySelectorAll('.ov-feat-chart')
  detail.viewCharts = chartNodes.length
  ok('A7 视图渲染 6 张图表', chartNodes.length === 6, `nodes=${chartNodes.length}`)
  const firstSvg = chartNodes[0]?.querySelector('svg')?.outerHTML ?? ''
  ok('A8 首图 svg 非空', firstSvg.length > 100, `len=${firstSvg.length}`)

  // ===== B 节：单格选区 → 自动连续数据区出图 =====
  detail.stage = 'B'
  const aBefore = ((await client.call('xlsx.features', 0))?.charts ?? []).length
  const c2 = cellEl(1, 8) // I2 数值列单格
  ok('B0 I2 在位', !!c2)
  if (c2) {
    ptr(c2, 'pointerdown')
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, view: window }))
    await wait(250)
    detail.stage = 'B.insertChart'
    await view.commands.insertChart('line')
    await wait(800)
    const aAfter = ((await client.call('xlsx.features', 0))?.charts ?? []).length
    detail.singleCellCharts = [aBefore, aAfter]
    ok('B1 单格出图成功（不弹请先选区）', aAfter === aBefore + 1, `before=${aBefore} after=${aAfter}`)
    // 红基线时旧行为弹「请先选择区域」alert——关掉它，别挡 C 节点击
    const bAlert = [...document.querySelectorAll<HTMLButtonElement>('.op-prompt-btn')][0]
    if (bAlert) { bAlert.click(); await wait(200) }
  }

  // ===== C 节：向导自引用 → 循环引用警告且不落格 =====
  detail.stage = 'C'
  const i12 = cellEl(11, 8) // I12（空行，模拟截图 C12 场景）
  ok('C0 I12 在位', !!i12)
  if (i12) {
    ptr(i12, 'pointerdown')
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, view: window }))
    await wait(250)
    view.commands.openFuncByName('ABS')
    await wait(300)
    ok('C1 向导参数步打开', !!document.querySelector('.ov-fd-argin'), '无参数槽')
    const inp = document.querySelector<HTMLInputElement>('.ov-fd-argin')
    inp!.value = 'I12'
    inp!.dispatchEvent(new Event('input', { bubbles: true }))
    await wait(300)
    const okBtn = [...document.querySelectorAll<HTMLButtonElement>('.ov-dlg-ok')].pop()
    okBtn?.click()
    await wait(600)
    const alertOverlay = document.querySelector('.op-prompt-overlay .op-prompt-title')?.textContent ?? ''
    detail.alertTitle = alertOverlay
    ok('C2 弹循环引用警告', alertOverlay.includes('循环引用'), JSON.stringify(alertOverlay))
    const closeBtn = [...document.querySelectorAll<HTMLButtonElement>('.op-prompt-btn')][0]
    closeBtn?.click()
    await wait(300)
    const cell: any = await Promise.race([client.call('xlsx.cell', 0, 11, 8), wait(1500).then(() => null)])
    detail.c12 = cell
    const f = String(cell?.formula ?? cell?.input ?? '')
    ok('C3 目标格未被写入（无 #REF!/无 ABS）', !f.includes('ABS') && !f.includes('#REF!'), JSON.stringify(f))
    ok('C4 向导未关闭（可改参数重试）', !!document.querySelector('.ov-fd-float'), '向导被关')
    // 取消收尾（按文案精确点「取消」，「返回」会退回 pick 步不算关窗）
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('.ov-dlg-btn')].find((b) => b.textContent?.trim() === '取消')
    cancel?.click()
    await wait(200)
  }

  // ===== D 节：批注角标真层 + 「隐藏批注」真开关（审计问题 6：旧为假开关） =====
  detail.stage = 'D'
  const i3 = cellEl(2, 8) // I3 在可视区
  ok('D0 I3 在位', !!i3)
  if (i3) {
    ptr(i3, 'pointerdown')
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, view: window }))
    await wait(250)
    view.commands.commentAdd()
    await wait(300)
    const ta = document.querySelector<HTMLTextAreaElement | HTMLInputElement>('.op-prompt-input')
    ok('D1 新建注释输入框出现', !!ta, '无 .op-prompt-input')
    if (ta) {
      ta.value = '门控批注'
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      await wait(150)
      const submit = [...document.querySelectorAll<HTMLButtonElement>('.op-prompt-btn')].find((b) => b.textContent?.trim() === '确定')
      submit?.click()
      await wait(500)
    }
    await view.refreshComments?.()
    await wait(400)
    const marks = document.querySelectorAll('.ov-feat-comment-mark').length
    detail.marksShown = marks
    ok('D2 批注角标渲染 ≥1', marks >= 1, `marks=${marks}`)
    view.commands.commentHideAll(true)
    await wait(400)
    const hidden = document.querySelectorAll('.ov-feat-comment-mark').length
    detail.marksHidden = hidden
    ok('D3 隐藏批注 → 角标归零', hidden === 0, `marks=${hidden}`)
    view.commands.commentHideAll(false)
    await wait(400)
    const back = document.querySelectorAll('.ov-feat-comment-mark').length
    detail.marksBack = back
    ok('D4 恢复显示 → 角标回来', back === marks, `before=${marks} back=${back}`)
  }

  await wait(400) // 在途 RPC 结算（x29/x30 教训）
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

registerSmokeMode('x32', () => {
  ;(window as any).__smoke.x32 = { result }
  return () => {
    if (st.ready && st.client)
      return h('div', { style: 'height:100vh' }, [
        h(OfficeSheetView, { ref: (el: any) => ((window as any).__smoke.x32View = el), client: st.client, editable: true, info: st.client.info })
      ])
    return h('div', { style: 'width:100%;height:100%' }, 'x32 图表类型/循环引用门')
  }
})
