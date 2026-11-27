/**
 * x4 探针（第四批注册表模式，?mode=x4）：
 *  - 内核：1900/1904 日期系统校准 + 1900 闰年边界（纯函数与真实 Engine）、可刷新序列对象
 *    （sidecar 落盘 / save→重开读回 / seriesRefresh 重算 / undo / rewrite 不丢定义）、
 *    报障 hideRows 取消隐藏的 rowAttrs + layout.rowSizes 回传。
 *  - 视图：真实 OfficeSheetView —— 序列对话框、筛选全选还原、Ctrl+A、.ov-corner 全选、原生控件检查。
 * 顶层只注册 mode；异步探针在函数体内 kick，结果挂到 window.__smoke.x4（此时 __smoke.ts 顶层已建好 __smoke）。
 */
import { h, reactive } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import OfficeSheetView from './components/OfficeSheetView.vue'
import { Engine } from './core/worker/engine'
import { writeZip } from './core/zipwrite'
import { dateToSerial, dateStepValue, seriesValueAt } from './core/xlsx/series'
import { serialToDate } from './core/xlsx/numfmt'

const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKGREL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CTREL = 'application/vnd.openxmlformats-package.relationships+xml'
const CTWB = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
const CTWS = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'
const CTST = 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

/** 一个最小但完整的 xlsx：带 styles 关系（保证 save→重开 numFmt 不丢），可选 1904 日期系统 */
function makeBook(date1904: boolean): Map<string, string> {
  const pr = date1904 ? `<workbookPr date1904="1"/>` : ''
  const parts = new Map<string, string>([
    ['[Content_Types].xml', `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="${CTREL}"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CTWB}"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${CTWS}"/><Override PartName="/xl/styles.xml" ContentType="${CTST}"/></Types>`],
    ['_rels/.rels', `${DECL}<Relationships xmlns="${PKGREL}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${DECL}<workbook xmlns="${XMAIN}" xmlns:r="${RNS}">${pr}<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${DECL}<Relationships xmlns="${PKGREL}"><Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${RNS}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `${DECL}<styleSheet xmlns="${XMAIN}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`],
    ['xl/worksheets/sheet1.xml', `${DECL}<worksheet xmlns="${XMAIN}"><sheetData/></worksheet>`],
  ])
  return parts
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 建 Engine → open → xlsx.load → 严格等 block.complete；事件转发给 handlers（视图要靠 xlsx:progress 建轴） */
async function openEngine(date1904: boolean, handlers: Record<string, (p: unknown) => void> = {}): Promise<{ engine: any; info: any }> {
  const book: Blob = await writeZip(makeBook(date1904) as any)
  const engine = new Engine((ev: string, p: unknown) => handlers[ev]?.(p))
  const info: any = await engine.open(book, { name: 'x4.xlsx' })
  await engine.call('xlsx.load', [0])
  for (let i = 0; i < 80; i++) {
    const b: any = await engine.call('xlsx.block', [0, 0, 60])
    if (b?.complete) break
    await wait(100)
  }
  return { engine: engine as any, info }
}

/** save → 用新 Engine 重开，返回（同样等 block.complete） */
async function saveReopen(engine: any, handlers: Record<string, (p: unknown) => void> = {}): Promise<{ engine: any; info: any }> {
  const blob: Blob = await engine.call('save', [])
  const e2 = new Engine((ev: string, p: unknown) => handlers[ev]?.(p))
  const info: any = await e2.open(blob, { name: 'x4-reopen.xlsx' })
  await e2.call('xlsx.load', [0])
  for (let i = 0; i < 80; i++) {
    const b: any = await e2.call('xlsx.block', [0, 0, 60])
    if (b?.complete) break
    await wait(100)
  }
  return { engine: e2 as any, info }
}

const cellVal = (blk: any, r: number, c: number) => {
  const row = (blk.rows as any[]).find((x) => x.r === r)
  const v = row?.cells.find((x: any[]) => x[0] === c)
  return v ? String(v[1]) : undefined
}
const iso = (d: Date) => d.toISOString().slice(0, 10)

const state = reactive({ ready: false, client: null as any, info: null as any, view: null as any })
const viewErrors: string[] = []

async function x4Probe() {
  const R: any = ((window as any).__smoke.x4 = { kernel: {}, viewResult: null, ready: false, error: null })
  R.runViewTests = runViewTests
  try {
    // ---------------------------------------------------------------- 1. 纯函数：1900/1904 换算与闰年边界
    R.step = 'pure date functions'
    const P: any = {}
    P.s1900_epoch = dateToSerial(new Date(Date.UTC(1900, 0, 1)), false) === 1
    P.s1900_feb28 = dateToSerial(new Date(Date.UTC(1900, 1, 28)), false) === 59
    P.s1900_mar01 = dateToSerial(new Date(Date.UTC(1900, 2, 1)), false) === 61  // Excel 虚构 1900-02-29=60
    P.s1900_1970 = dateToSerial(new Date(Date.UTC(1970, 0, 1)), false) === 25569
    P.round59 = iso(serialToDate(59, false)) === '1900-02-28'
    P.round61 = iso(serialToDate(61, false)) === '1900-03-01'
    P.s1904_epoch = dateToSerial(new Date(Date.UTC(1904, 0, 1)), true) === 0
    P.s1904_1970 = dateToSerial(new Date(Date.UTC(1970, 0, 1)), true) === 24107
    P.round1904_0 = iso(serialToDate(0, true)) === '1904-01-01'
    P.round1904_1970 = iso(serialToDate(24107, true)) === '1970-01-01'
    P.offset1462 = dateToSerial(new Date(Date.UTC(2026, 0, 31)), false) - dateToSerial(new Date(Date.UTC(2026, 0, 31)), true) === 1462
    P.weekday1900 = dateStepValue(25570, 'weekday', 1, 1, false) === 25573 // 周五→下周一
    P.weekday1904 = dateStepValue(0, 'weekday', 1, 1, true) === 3           // 1904-01-01 周五→周一
    P.linear = seriesValueAt(10, 'linear', 'day', 5, 3, false) === 25
    P.growth = seriesValueAt(3, 'growth', 'day', 2, 4, false) === 48
    R.kernel.pure = P

    // ---------------------------------------------------------------- 2. 1900 系统日期序列（含月末溢出）
    R.step = 'date series 1900'
    {
      const { engine } = await openEngine(false)
      await engine.call('xlsx.format', [0, { r0: 0, c0: 0, r1: 0, c1: 0 }, { numFmt: 'yyyy-mm-dd' }])
      await engine.call('xlsx.set', [0, [{ r: 0, c: 0, input: '2026-01-31' }]])
      await engine.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 0, r1: 2, c1: 0 }, dir: 'col', type: 'date', unit: 'month', step: 1 }])
      const blk: any = await engine.call('xlsx.block', [0, 0, 5])
      R.kernel.date1900 = {
        febClamp: cellVal(blk, 1, 0) === '2026-02-28',
        mar: cellVal(blk, 2, 0) === '2026-03-31',
        start: cellVal(blk, 0, 0) === '2026-01-31',
      }
    }

    // ---------------------------------------------------------------- 3. 1904 系统日期序列 + save→重开一致
    R.step = 'date series 1904 + reopen'
    {
      const { engine, info } = await openEngine(true)
      const e1900 = (await openEngine(false)).engine
      await e1900.call('xlsx.format', [0, { r0: 0, c0: 0, r1: 0, c1: 0 }, { numFmt: 'yyyy-mm-dd' }])
      await e1900.call('xlsx.set', [0, [{ r: 0, c: 0, input: '2026-01-31' }]])
      const c1900: any = await e1900.call('xlsx.cell', [0, 0, 0])
      await engine.call('xlsx.format', [0, { r0: 0, c0: 0, r1: 0, c1: 0 }, { numFmt: 'yyyy-mm-dd' }])
      await engine.call('xlsx.set', [0, [{ r: 0, c: 0, input: '2026-01-31' }]])
      const startCell: any = await engine.call('xlsx.cell', [0, 0, 0])
      await engine.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 0, r1: 2, c1: 0 }, dir: 'col', type: 'date', unit: 'month', step: 1 }])
      const blk: any = await engine.call('xlsx.block', [0, 0, 5])
      const febCell: any = await engine.call('xlsx.cell', [0, 1, 0])
      // 与 1900 系统同日期的 serial 相差 1462 天
      const c1900v = Number(c1900?.value ?? NaN)
      const startSerial = Number(startCell?.value ?? NaN)
      const febSerial = Number(febCell?.value ?? NaN)
      const { engine: e2, info: info2 } = await saveReopen(engine)
      const blk2: any = await e2.call('xlsx.block', [0, 0, 5])
      R.kernel.date1904 = {
        flag: info?.xlsx?.date1904 === true,
        flagAfterReopen: info2?.xlsx?.date1904 === true,
        start: cellVal(blk, 0, 0) === '2026-01-31',
        febClamp: cellVal(blk, 1, 0) === '2026-02-28',
        mar: cellVal(blk, 2, 0) === '2026-03-31',
        serialIsNumber: startCell?.type === 'number' && febCell?.type === 'number',
        serialOffset: Number.isFinite(startSerial) && Number.isFinite(febSerial) && (febSerial - startSerial) === 28,
        // 1904 序列值比 1900 系统同显示日期的序列值小 1462
        sysDiff: Number.isFinite(c1900v) && Number.isFinite(startSerial) && (c1900v - startSerial) === 1462,
        reopenFeb: cellVal(blk2, 1, 0) === '2026-02-28',
        reopenMar: cellVal(blk2, 2, 0) === '2026-03-31',
      }
    }

    // ---------------------------------------------------------------- 4. 可刷新序列对象：sidecar / refresh / undo / rewrite
    R.step = 'refreshable series object'
    {
      const { engine } = await openEngine(false)
      await engine.call('xlsx.set', [0, [{ r: 0, c: 0, input: '10' }]])
      await engine.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 0, r1: 4, c1: 0 }, dir: 'col', type: 'linear', step: 1 }])
      const blk1: any = await engine.call('xlsx.block', [0, 0, 8])
      const list1: any[] = await engine.call('xlsx.seriesList', [0])
      const sidecarBlob: Blob = await engine.call('part', ['xl/mdview/features.json'])
      const sidecarText = await sidecarBlob.text()
      let side: any = null
      try { side = JSON.parse(sidecarText) } catch { /* noop */ }
      const defs = side ? Object.values(side).flatMap((f: any) => f?.series ?? []) : []
      // save→重开读回定义
      const { engine: e2 } = await saveReopen(engine)
      const list2: any[] = await e2.call('xlsx.seriesList', [0])
      const blk2: any = await e2.call('xlsx.block', [0, 0, 8])
      // 源数据改后 refresh 重算（起始格 10 → 100，A2..A5 应从 11..14 变 101..104）
      const id = list2[0]?.id
      await e2.call('xlsx.set', [0, [{ r: 0, c: 0, input: '100' }]])
      await e2.call('xlsx.seriesRefresh', [0, id])
      const blkR: any = await e2.call('xlsx.block', [0, 0, 8])
      await e2.call('xlsx.undo', [])
      const blkU: any = await e2.call('xlsx.block', [0, 0, 8])
      await e2.call('xlsx.redo', [])
      const blkRd: any = await e2.call('xlsx.block', [0, 0, 8])
      R.kernel.seriesObj = {
        linear: ['11', '12', '13', '14'].every((v, i) => cellVal(blk1, i + 1, 0) === v),
        defCount: list1.length === 1,
        defFields: !!list1[0] && list1[0].dir === 'col' && list1[0].type === 'linear' && list1[0].step === 1
          && list1[0].start === 10 && list1[0].date1904 === false
          && list1[0].range.r0 === 0 && list1[0].range.c0 === 0 && list1[0].range.r1 === 4 && list1[0].range.c1 === 0,
        sidecarLanded: !!side && defs.length === 1 && defs[0].type === 'linear',
        reopenList: list2.length === 1 && list2[0]?.id === id,
        reopenValues: ['11', '12', '13', '14'].every((v, i) => cellVal(blk2, i + 1, 0) === v),
        refresh: ['101', '102', '103', '104'].every((v, i) => cellVal(blkR, i + 1, 0) === v),
        // 第九批语义变化：序列格已是活公式，源格 A1 改成 100 后 A2..A5 在 refresh 之前就自动重算成
        // 101..104；seriesRefresh 只是幂等重写同样的公式，撤销它仍停留在 101..104（旧断言 11..14
        // 对应静态值语义，公式化后不再成立）。
        undoRefresh: ['101', '102', '103', '104'].every((v, i) => cellVal(blkU, i + 1, 0) === v),
        redoRefresh: ['101', '102', '103', '104'].every((v, i) => cellVal(blkRd, i + 1, 0) === v),
      }
      // rewrite 不丢定义：refresh/undo/redo 之后定义仍在，且再做一次无关单元格写入并 save→重开，定义仍可读回
      const list3: any[] = await e2.call('xlsx.seriesList', [0])
      await e2.call('xlsx.set', [0, [{ r: 7, c: 7, input: 'rewrite-marker' }]])
      const { engine: e3 } = await saveReopen(e2)
      const list4: any[] = await e3.call('xlsx.seriesList', [0])
      const blkM: any = await e3.call('xlsx.block', [0, 0, 10])
      R.kernel.seriesObj.rewriteKeepDef = list3.length === 1 && list4.length === 1 && list4[0]?.id === id
        && cellVal(blkM, 7, 7) === 'rewrite-marker'
      // undo 首次 series op：定义与结果一起回滚
      const { engine: eu } = await openEngine(false)
      await eu.call('xlsx.set', [0, [{ r: 0, c: 0, input: '5' }]])
      await eu.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 0, r1: 3, c1: 0 }, dir: 'col', type: 'linear', step: 2 }])
      const euBefore: any[] = await eu.call('xlsx.seriesList', [0])
      await eu.call('xlsx.undo', [])
      const euAfter: any[] = await eu.call('xlsx.seriesList', [0])
      const blkEu: any = await eu.call('xlsx.block', [0, 0, 6])
      await eu.call('xlsx.redo', [])
      const euRedo: any[] = await eu.call('xlsx.seriesList', [0])
      R.kernel.seriesObj.undoDef = euBefore.length === 1 && euAfter.length === 0 && euRedo.length === 1
        && cellVal(blkEu, 1, 0) === undefined
    }

    // ---------------------------------------------------------------- 5. 报障内核：hideRows 取消隐藏回传行高 + save→重开一致
    R.step = 'hideRows rowAttrs / layout'
    {
      const { engine } = await openEngine(false)
      for (let r = 0; r <= 6; r++) await engine.call('xlsx.set', [0, [{ r, c: 0, input: r === 0 ? 'H' : 'v' + r }]])
      const resHide: any = await engine.call('xlsx.sheetOp', [0, { op: 'hideRows', a: 2, b: 4, hidden: true }])
      const resShow: any = await engine.call('xlsx.sheetOp', [0, { op: 'hideRows', a: 2, b: 4, hidden: false }])
      const hideZeros = [2, 3, 4].every((r) => (resHide?.layout?.rowSizes ?? []).some((x: any[]) => x[0] === r && x[1] === 0))
      const showHeights = [2, 3, 4].every((r) => (resShow?.layout?.rowSizes ?? []).some((x: any[]) => x[0] === r && x[1] > 0))
      const wb: any = (engine as any).xlsx
      const rowAttrs: Map<number, any> | undefined = wb?.sheetsData?.get?.(0)?.rowAttrs
      const attrsClean = !!rowAttrs && [2, 3, 4].every((r) => !rowAttrs.get(r)?.hidden)
      const progSizes: [number, number][] = []
      const { engine: e2 } = await saveReopen(engine, {
        'xlsx:progress': (p: any) => { if (p?.rowSizes) progSizes.push(...p.rowSizes) }
      })
      const noHiddenAfterReopen = [2, 3, 4].every((r) => !progSizes.some(([rr, h]) => rr === r && h === 0))
      const blk: any = await e2.call('xlsx.block', [0, 0, 8])
      R.kernel.rowAttrs = {
        hideZeros, showHeights, attrsClean, noHiddenAfterReopen,
        dataIntact: cellVal(blk, 3, 0) === 'v3',
      }
    }

    // ---------------------------------------------------------------- 6. 视图引擎：数据 + client + info
    R.step = 'view engine'
    const handlers: Record<string, (p: unknown) => void> = {}
    const { engine: viewEngine, info } = await openEngine(false, handlers)
    // 列 0：筛选数据（表头 + 6 行、3 个不同值）；列 5..9：序列对话框测试
    await viewEngine.call('xlsx.set', [0, [
      { r: 0, c: 0, input: '类别' },
      { r: 1, c: 0, input: '甲' }, { r: 2, c: 0, input: '乙' }, { r: 3, c: 0, input: '甲' },
      { r: 4, c: 0, input: '丙' }, { r: 5, c: 0, input: '乙' }, { r: 6, c: 0, input: '甲' },
    ]])
    state.client = {
      call: (m: string, ...args: unknown[]) => (viewEngine as any).call(m, args),
      on: (ev: string, fn: (p: unknown) => void) => { handlers[ev] = fn; return () => { delete handlers[ev] } },
      mediaUrl: (p: string) => (viewEngine as any).call('part', [p]).then((b: Blob) => URL.createObjectURL(b as Blob))
    } as any
    // 诊断代理：记录每个 client.call 的方法、发起时刻、完成耗时（null = 永久挂起，即毒化 writes 链的元凶）
    const dbg0: any = (R.dbg = { calls: [] })
    const origCall = state.client.call
    state.client.call = (m: string, ...args: unknown[]) => {
      const rec: any = { m, t: Date.now(), done: null }
      dbg0.calls.push(rec)
      return Promise.resolve(origCall(m, ...args)).then(
        (v) => { rec.done = Date.now() - rec.t; return v },
        (e) => { rec.done = 'ERR:' + String(e); throw e },
      )
    }
    state.info = info
    R.viewInfo = { date1904: info?.xlsx?.date1904, sheets: info?.xlsx?.sheets?.length }
    state.ready = true
    R.ready = true
  } catch (e) {
    R.error = String(e) + ' @step=' + String(R.step) + ' ' + String((e as Error)?.stack ?? '')
    state.ready = true
  }
}

/** 视图断言：序列对话框 / 筛选全选还原 / Ctrl+A / .ov-corner / 原生控件。
 *  用 R.dbg 连续记录步骤（超时后仍可读），每个 client.call 用 tc() 限时，避免单个挂起污染整条 writes 链后又卡死断言函数。 */
async function runViewTests() {
  const R: any = (window as any).__smoke.x4
  const dbg: any = (R.dbg ??= {})
  dbg.steps = []; dbg.timeouts = []; dbg.last = 'start'
  const t0 = Date.now()
  const mark = (s: string) => { dbg.last = s; dbg.steps.push(s + '@' + (Date.now() - t0)) }
  const out: any = {
    loadReady: false, dialogOpen: false, dialogNoNative: false, seriesRow: false,
    filterHidden: false, filterRestore: false, rowHeights: false, noNativeFilter: false,
    ctrlA: false, corner: false,
  }
  const client = state.client as any
  const view = state.view as any
  const tc = (m: string, ...args: unknown[]): Promise<any> => {
    mark('call ' + m)
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => { dbg.timeouts.push(m); rej(new Error('TIMEOUT ' + m)) }, 8000)
    })
    return Promise.race([Promise.resolve(client.call(m, ...args)), timeout]).finally(() => { if (timer) clearTimeout(timer) })
  }
  const waitFor = async (pred: () => boolean, ms = 4000) => {
    const t = Date.now()
    while (Date.now() - t < ms) { if (pred()) return true; await wait(60) }
    return false
  }
  const clickCell = (r: number, c: number, o: { shift?: boolean } = {}) => {
    const el = document.querySelector(`.ov-cell[data-cell-r="${r}"][data-cell-c="${c}"]`) as HTMLElement | null
    if (!el) return false
    const b = el.getBoundingClientRect()
    const opts: any = { bubbles: true, cancelable: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, button: 0, shiftKey: !!o.shift, view: window }
    el.dispatchEvent(new PointerEvent('pointerdown', opts))
    window.dispatchEvent(new PointerEvent('pointerup', opts))
    return true
  }
  const rowH = (r: number) => {
    const el = document.querySelector(`.ov-row-head[data-r="${r}"]`) as HTMLElement | null
    if (!el) return -1
    return el.getBoundingClientRect().height
  }
  const nameIs = (s: string) => {
    const el = document.querySelector('.ov-name-box') as HTMLInputElement | null
    return !!el && el.value === s
  }
  window.addEventListener('unhandledrejection', (e) => { viewErrors.push('rejection: ' + String((e as PromiseRejectionEvent).reason)) })

  // ---- 阶段 A：等 block 完成 + 序列对话框 ----
  try {
    for (let i = 0; i < 40; i++) {
      const b: any = await tc('xlsx.block', 0, 0, 60)
      if (b?.complete) { out.loadReady = true; break }
      await wait(100)
    }
    mark('A.set F1')
    await tc('xlsx.set', 0, [{ r: 0, c: 5, input: '100' }])
    await wait(150)
    clickCell(0, 5); await wait(60)
    clickCell(0, 9, { shift: true }); await wait(60)
    dbg.selRange = (document.querySelector('.ov-name-box') as HTMLInputElement | null)?.value
    mark('A.commands.series')
    view.commands.series()
    await wait(120)
    const dlg = document.querySelector('.ov-dlg') as HTMLElement | null
    out.dialogOpen = !!dlg && (dlg.querySelector('.ov-dlg-title')?.textContent ?? '').includes('序列')
    out.dialogNoNative = !!dlg && dlg.querySelectorAll('input, select, textarea').length === 0
    mark('A.click OK')
    ;(dlg?.querySelector('.ov-dlg-ok') as HTMLButtonElement | null)?.click()
    // 等序列写入落在 block 上（视图 Engine 直跑主线程，解压与渲染争抢，写回可能延迟）
    let blk: any = null
    for (let i = 0; i < 40; i++) {
      blk = await tc('xlsx.block', 0, 0, 3)
      if (cellVal(blk, 0, 9) === '104') break
      await wait(120)
    }
    dbg.dlgClosedAfterOk = !document.querySelector('.ov-dlg')
    dbg.series = [5, 6, 7, 8, 9].map((c) => cellVal(blk, 0, c))
    out.seriesRow = cellVal(blk, 0, 5) === '100' && cellVal(blk, 0, 6) === '101' && cellVal(blk, 0, 9) === '104'
  } catch (e) { dbg.errA = String(e) }

  // ---- 阶段 B：筛选取消值→隐藏→全选还原 ----
  try {
    mark('B.filter btn')
    const fltBtn = document.querySelector('.ov-flt-btn[data-flt="0"]') as HTMLElement | null
    dbg.fltBtnFound = !!fltBtn
    if (fltBtn) {
      fltBtn.click()
      await waitFor(() => !!document.querySelector('.ov-flt-row[data-val]'))
      const panel = document.querySelector('.ov-flt-panel') as HTMLElement | null
      out.noNativeFilter = !!panel && panel.querySelectorAll('input, select, textarea').length === 0
      const jia = document.querySelector('.ov-flt-row[data-val="甲"]') as HTMLElement | null
      dbg.fltVals = [...document.querySelectorAll('.ov-flt-row[data-val]')].map((e) => (e as HTMLElement).getAttribute('data-val'))
      dbg.jiaFound = !!jia
      jia?.click()
      // 隐藏行 DOM 高度≈1px（内核 layout 回传 0，CSS 边框/最小高度使其非严格 0），用 <8 区分
      await waitFor(() => rowH(1) < 8 && rowH(3) < 8 && rowH(6) < 8, 4000)
      dbg.rowHHidden = [0, 1, 2, 3, 4, 5, 6, 7].map(rowH)
      dbg.panelStillOpen = !!document.querySelector('.ov-flt-panel')
      mark('B.gridlines dbg')
      const layDbg: any = await tc('xlsx.sheetOp', 0, { op: 'gridlines', show: true })
      dbg.kernelRowSizes = layDbg?.layout?.rowSizes
      out.filterHidden = rowH(1) < 8 && rowH(2) >= 8 && rowH(3) < 8 && rowH(6) < 8
      mark('B.click all')
      const allRow = document.querySelector('.ov-flt-row:not([data-val])') as HTMLElement | null
      allRow?.click()
      // 严格等到全部行恢复默认行高（>=8），不能用 >0（1px 隐藏态会误判为已还原）
      await waitFor(() => [1, 2, 3, 4, 5, 6].every((r) => rowH(r) >= 8), 4000)
      out.filterRestore = [1, 2, 3, 4, 5, 6].every((r) => rowH(r) >= 8)
      out.rowHeights = [1, 2, 3, 4, 5, 6].every((r) => rowH(r) >= 8)
      dbg.rowHRestored = [1, 2, 3, 4, 5, 6].map(rowH)
    }
  } catch (e) { dbg.errB = String(e) }

  // ---- 阶段 C：Ctrl+A（面板打开时）+ .ov-corner（P9a 语义：全选 = 当前表数据区）----
  // 数据区实测：列 0 表头+6 行（r0..6）、列 5..9 序列（A1 起 F1=100..J1=104）→ used = 7×10。
  // 断言锁范围而非只锁标签：旧「无限网格全选」（r1/c1 到 padding 轴尾）在新语义下必挂。
  try {
    const USED = { r0: 0, c0: 0, r1: 6, c1: 9 }
    const rangeIs = (g: { r0: number; c0: number; r1: number; c1: number } | null) =>
      !!g && g.r0 === USED.r0 && g.c0 === USED.c0 && g.r1 === USED.r1 && g.c1 === USED.c1
    mark('C.ctrlA')
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }))
    await wait(120)
    out.ctrlA = nameIs('全选') && rangeIs(view.commands.rangeSel?.())
    dbg.ctrlARange = view.commands.rangeSel?.()
    ;(document.querySelector('.ov-flt-overlay') as HTMLElement | null)?.click()
    await wait(80)
    clickCell(2, 2); await wait(60)
    mark('C.corner')
    ;(document.querySelector('.ov-corner') as HTMLElement | null)?.click()
    await wait(120)
    out.corner = nameIs('全选') && rangeIs(view.commands.rangeSel?.())
    dbg.cornerRange = view.commands.rangeSel?.()
  } catch (e) { dbg.errC = String(e) }

  dbg.viewErrors = [...viewErrors]
  R.viewResult = out
  return out
}

let kicked = false
function x4View() {
  if (!kicked) { kicked = true; void x4Probe() }
  return () =>
    state.ready && state.client
      ? h('div', { style: 'height:100vh' }, [h(OfficeSheetView, {
          ref: (el: any) => { state.view = el },
          client: state.client, editable: true, info: state.info,
          onError: (m: string) => { viewErrors.push(m) }
        })])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
}
registerSmokeMode('x4', x4View)
