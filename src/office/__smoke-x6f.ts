/**
 * x6f 探针（第六批，?mode=x6f）：
 *  - 任务1：拖拽填充柄写公式 —— 相对引用逐格平移（$ 绝对引用不动）、改源格自动跟随（依赖链）、
 *            save→重开公式仍在、undo/redo；外加纯函数 core/xlsx/fillformula 的引用/序列公式生成断言。
 *  - 任务2：多列叠加筛选 —— A、B 两列同时筛选时可见行 = 两条件**交集**（不是并集），
 *            两列都设「全选」→ 全部恢复。
 * 顶层只注册 mode；异步探针在函数体内 kick，结果挂到 window.__smoke.x6f。
 */
import { h, reactive } from 'vue'
import { registerSmokeMode, getSmokeMode } from './smoke-modes'
import OfficeSheetView from './components/OfficeSheetView.vue'
import { Engine } from './core/worker/engine'
import { writeZip } from './core/zipwrite'
import { a1, shiftedRef, seriesFormulaAt, seriesFormulaList, shiftFillFormula } from './core/xlsx/fillformula'

const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKGREL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CTREL = 'application/vnd.openxmlformats-package.relationships+xml'
const CTWB = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
const CTWS = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'
const CTST = 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

/** 最小完整 xlsx：A/B 两列做筛选数据，E..K 做公式填充区，O 列做静态填充区 */
function makeBook(): Map<string, string> {
  return new Map<string, string>([
    ['[Content_Types].xml', `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="${CTREL}"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CTWB}"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${CTWS}"/><Override PartName="/xl/styles.xml" ContentType="${CTST}"/></Types>`],
    ['_rels/.rels', `${DECL}<Relationships xmlns="${PKGREL}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${DECL}<workbook xmlns="${XMAIN}" xmlns:r="${RNS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${DECL}<Relationships xmlns="${PKGREL}"><Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${RNS}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `${DECL}<styleSheet xmlns="${XMAIN}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`],
    ['xl/worksheets/sheet1.xml', `${DECL}<worksheet xmlns="${XMAIN}"><sheetData/></worksheet>`],
  ])
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function openEngine(handlers: Record<string, (p: unknown) => void> = {}): Promise<{ engine: any; info: any }> {
  const book: Blob = await writeZip(makeBook() as any)
  const engine = new Engine((ev: string, p: unknown) => handlers[ev]?.(p))
  const info: any = await engine.open(book, { name: 'x6.xlsx' })
  await engine.call('xlsx.load', [0])
  for (let i = 0; i < 80; i++) {
    const b: any = await engine.call('xlsx.block', [0, 0, 60])
    if (b?.complete) break
    await wait(100)
  }
  return { engine: engine as any, info }
}

/** save → 重开（新 Engine），用于「公式是否落盘」的验证 */
async function saveReopen(engine: any): Promise<{ engine: any; info: any }> {
  const blob: Blob = await engine.call('save', [])
  const e2 = new Engine(() => {})
  const info: any = await e2.open(blob, { name: 'x6-reopen.xlsx' })
  await e2.call('xlsx.load', [0])
  for (let i = 0; i < 80; i++) {
    const b: any = await e2.call('xlsx.block', [0, 0, 60])
    if (b?.complete) break
    await wait(100)
  }
  return { engine: e2 as any, info }
}

const state = reactive({ ready: false, client: null as any, info: null as any, view: null as any, engine: null as any })
const viewErrors: string[] = []

/** 纯函数断言（不依赖引擎）：相对引用生成 / 序列公式生成 / 公式平移 */
function pureAsserts(): Record<string, boolean> {
  return {
    a1Plain: a1(0, 0) === 'A1' && a1(4, 26) === 'AA5' && a1(0, 0, true, true) === '$A$1' && a1(0, 1, true, false) === 'B$1',
    refDown: shiftedRef(0, 0, 1, 0) === 'A2',
    refRight: shiftedRef(0, 0, 0, 1) === 'B1',
    refDiag: shiftedRef(2, 3, 4, 5) === 'F5',
    refAbsKept: shiftedRef(0, 0, 3, 0, true, true) === '$A$1' && shiftedRef(0, 0, 3, 0, true, false) === 'A$1',
    seriesArith: seriesFormulaAt('arith', 1, 0, 0, 1, 0) === '=A1+1' && seriesFormulaAt('arith', 1, 0, 0, 2, 0) === '=A2+1',
    seriesGrowth: seriesFormulaAt('growth', 2, 0, 0, 1, 0) === '=A1*2' && seriesFormulaAt('growth', 2, 0, 0, 2, 0) === '=A2*2',
    seriesRight: seriesFormulaAt('arith', 1, 0, 0, 0, 1) === '=A1+1' && seriesFormulaAt('arith', 1, 0, 0, 0, 2) === '=B1+1',
    seriesUp: seriesFormulaAt('arith', 1, 2, 0, 1, 0) === '=A3+1',
    seriesList: seriesFormulaList('arith', 1, 0, 0, 'down', 3).join(',') === '=A1+1,=A2+1,=A3+1',
    shiftKeepsAbs: shiftFillFormula('=$A$1+B2', 1, 0) === '=$A$1+B3',
    shiftRelative: shiftFillFormula('=A1*2', 0, 2) === '=C1*2',
  }
}

async function x6Probe() {
  const R: any = ((window as any).__smoke.x6f = { kernel: {}, viewResult: null, ready: false, error: null })
  R.runViewTests = runViewTests
  try {
    const handlers: Record<string, (p: unknown) => void> = {}
    const { engine, info } = await openEngine(handlers)
    // 筛选数据（A/B 两列）：行1 表头，行2..5 交叉取值，使「交集 ≠ 并集」
    await engine.call('xlsx.set', [0, [
      { r: 0, c: 0, input: 'H1' }, { r: 0, c: 1, input: 'H2' },
      { r: 1, c: 0, input: 'a' }, { r: 1, c: 1, input: 'x' },
      { r: 2, c: 0, input: 'b' }, { r: 2, c: 1, input: 'x' },
      { r: 3, c: 0, input: 'a' }, { r: 3, c: 1, input: 'y' },
      { r: 4, c: 0, input: 'b' }, { r: 4, c: 1, input: 'y' },
      // 公式填充区（E..K）
      { r: 0, c: 4, input: '5' }, { r: 1, c: 4, input: '10' }, { r: 2, c: 4, input: '20' },
      { r: 0, c: 5, input: '=E1+1' }, { r: 0, c: 6, input: '=$E$1+F1' }, { r: 0, c: 7, input: '=E1*2' },
      { r: 0, c: 10, input: '=F1+1' }, { r: 1, c: 10, input: '=K1+1' },
    ]])
    state.client = {
      call: (m: string, ...args: unknown[]) => (engine as any).call(m, args),
      on: (ev: string, fn: (p: unknown) => void) => { handlers[ev] = fn; return () => { delete handlers[ev] } },
      mediaUrl: (p: string) => (engine as any).call('part', [p]).then((b: Blob) => URL.createObjectURL(b as Blob)),
    } as any
    state.engine = engine
    state.info = info
    state.ready = true
    R.ready = true
    R.kernel = await kernelTests(engine)
  } catch (e) {
    R.error = String(e) + ' @ ' + String((e as Error)?.stack ?? '')
    state.ready = true
  }
}

/** 任务1 内核组：填充写公式 + 依赖跟随 + 落盘 + undo/redo */
async function kernelTests(engine: any): Promise<Record<string, boolean>> {
  const out: any = {}
  const dbg: any = (window as any).__smoke.x6f.dbg = {}
  const cell = async (r: number, c: number) => (await engine.call('xlsx.cell', [0, r, c])) as any
  const f = async (r: number, c: number) => (await cell(r, c))?.formula ?? ''
  const v = async (r: number, c: number) => String((await cell(r, c))?.value ?? '')
  const fill = (range: any, dir: string) => engine.call('xlsx.sheetOp', [0, { op: 'fill', range, dir }])

  // 向下填 F1:F3（源 F1='=E1+1'）→ F2='=E2+1'、F3='=E3+1'
  await fill({ r0: 0, c0: 5, r1: 2, c1: 5 }, 'down')
  // 向下填 G1:G2（源 G1='=$E$1+F1'）→ G2='=$E$1+F2'（$ 不动）
  await fill({ r0: 0, c0: 6, r1: 1, c1: 6 }, 'down')
  // 向右填 H1:J1（源 H1='=E1*2'）→ I1='=F1*2'、J1='=G1*2'
  await fill({ r0: 0, c0: 7, r1: 0, c1: 9 }, 'right')
  dbg.f2 = await f(1, 5)
  dbg.f3 = await f(2, 5)
  dbg.g2 = await f(1, 6)
  dbg.i1 = await f(0, 8)
  dbg.j1 = await f(0, 9)
  out.fillDownRelative = dbg.f2 === '=E2+1' && dbg.f3 === '=E3+1'
  out.fillAbsPreserved = dbg.g2 === '=$E$1+F2'
  out.fillRightRelative = dbg.i1 === '=F1*2' && dbg.j1 === '=G1*2'
  out.fillValueComputed = (await v(1, 5)) === '11' && (await v(2, 5)) === '21'

  // 改源格 → 目标格自动跟随（依赖）
  await engine.call('xlsx.set', [0, [{ r: 1, c: 4, input: '30' }]])
  out.depFollow = (await v(1, 5)) === '31'
  // 传递依赖链：E1 → F1(=E1+1) → K1(=F1+1) → K2(=K1+1)
  await engine.call('xlsx.set', [0, [{ r: 0, c: 4, input: '100' }]])
  dbg.chain = { f1: await v(0, 5), k1: await v(0, 10), k2: await v(1, 10) }
  out.depChain = dbg.chain.f1 === '101' && dbg.chain.k1 === '102' && dbg.chain.k2 === '103'

  // 数值源填充仍是静态值（Excel 语义，本批不改；守住这条边界）
  await engine.call('xlsx.set', [0, [{ r: 0, c: 14, input: '7' }]])
  await fill({ r0: 0, c0: 14, r1: 2, c1: 14 }, 'down')
  dbg.static = { f: await f(1, 14), v: await v(1, 14) }
  out.numericFillStaysStatic = dbg.static.f === '' && dbg.static.v === '7'

  // save → 重开：公式仍在
  try {
    const { engine: e2 } = await saveReopen(engine)
    const f2 = ((await e2.call('xlsx.cell', [0, 1, 5])) as any)?.formula ?? ''
    const f3 = ((await e2.call('xlsx.cell', [0, 2, 5])) as any)?.formula ?? ''
    dbg.reopen = { f2, f3 }
    out.fillSurvivesReopen = f2 === '=E2+1' && f3 === '=E3+1'
  } catch (e) {
    dbg.reopenErr = String(e)
    out.fillSurvivesReopen = false
  }

  // undo / redo：最后做，保证撤销栈顶就是这次的填充
  await engine.call('xlsx.set', [0, [{ r: 0, c: 12, input: '=E1+1' }]])
  await fill({ r0: 0, c0: 12, r1: 1, c1: 12 }, 'down')
  const beforeUndo = await f(1, 12)
  await engine.call('xlsx.undo', [])
  const afterUndo = await f(1, 12)
  await engine.call('xlsx.redo', [])
  const afterRedo = await f(1, 12)
  dbg.undo = { beforeUndo, afterUndo, afterRedo }
  out.fillUndoRedo = beforeUndo === '=E2+1' && afterUndo === '' && afterRedo === '=E2+1'

  out.pureFunctions = Object.values(pureAsserts()).every(Boolean)
  Object.assign(out, pureAsserts())
  return out
}

/** 任务2 视图组：多列叠加筛选（交集）+ 两列全选恢复 */
async function runViewTests() {
  const R: any = (window as any).__smoke.x6f
  const dbg: any = (R.dbg = R.dbg ?? {})
  const out: any = {
    filterIntersect: false, filterNotUnion: false, filterRestoreAll: false, filterPanelOk: false,
  }
  const client = state.client as any
  const waitFor = async (pred: () => boolean, ms = 8000) => {
    const t = Date.now()
    while (Date.now() - t < ms) { if (pred()) return true; await wait(60) }
    return false
  }
  const rowH = (r: number) => {
    const el = document.querySelector(`.ov-row-head[data-r="${r}"]`) as HTMLElement | null
    return el ? el.getBoundingClientRect().height : -1
  }
  const visRows = (rs: number[]) => rs.filter((r) => rowH(r) >= 8)
  const closePanel = () => (document.querySelector('.ov-flt-overlay') as HTMLElement | null)?.click()
  const openCol = async (c: number) => {
    const btn = document.querySelector(`.ov-flt-btn[data-flt="${c}"]`) as HTMLElement | null
    if (!btn) return false
    btn.click()
    return await waitFor(() => !!document.querySelector('.ov-flt-row[data-val]'), 4000)
  }
  try {
    for (let i = 0; i < 60; i++) {
      const b: any = await client.call('xlsx.block', 0, 0, 60)
      if (b?.complete) break
      await wait(100)
    }
    await wait(400)

    // A 列：取消 'b' → A 通过的行 = {0,1,3}
    const openedA = await openCol(0)
    dbg.openedA = openedA
    dbg.valsA = [...document.querySelectorAll('.ov-flt-row[data-val]')].map((e) => (e as HTMLElement).getAttribute('data-val'))
    ;(document.querySelector('.ov-flt-row[data-val="b"]') as HTMLElement | null)?.click()
    await waitFor(() => rowH(2) < 8 && rowH(4) < 8, 8000)
    dbg.afterA = [0, 1, 2, 3, 4].map(rowH)
    closePanel()
    await wait(120)

    // B 列：取消 'y' → B 通过的行 = {0,1,2}；与 A 求交 → 可见 {0,1}（并集会是 {0,1,2,3}）
    const openedB = await openCol(1)
    dbg.openedB = openedB
    ;(document.querySelector('.ov-flt-row[data-val="y"]') as HTMLElement | null)?.click()
    await waitFor(() => rowH(2) < 8 && rowH(3) < 8 && rowH(4) < 8, 8000)
    dbg.afterBoth = [0, 1, 2, 3, 4].map(rowH)
    dbg.visible = visRows([0, 1, 2, 3, 4])
    out.filterPanelOk = openedA && openedB
    out.filterIntersect = dbg.visible.length === 2 && dbg.visible[0] === 0 && dbg.visible[1] === 1
    out.filterNotUnion = rowH(2) < 8 && rowH(3) < 8
    closePanel()
    await wait(120)

    // 两列都「全选」→ 全部恢复
    await openCol(0)
    ;(document.querySelector('.ov-flt-row:not([data-val])') as HTMLElement | null)?.click()
    await wait(300)
    closePanel()
    await wait(120)
    await openCol(1)
    ;(document.querySelector('.ov-flt-row:not([data-val])') as HTMLElement | null)?.click()
    await waitFor(() => [0, 1, 2, 3, 4].every((r) => rowH(r) >= 8), 8000)
    dbg.restored = [0, 1, 2, 3, 4].map(rowH)
    out.filterRestoreAll = [0, 1, 2, 3, 4].every((r) => rowH(r) >= 8)
    closePanel()
  } catch (e) {
    out.error = String(e)
  }
  dbg.viewErrors = [...viewErrors]
  R.viewResult = out
  return out
}

let kicked = false
function x6View() {
  if (!kicked) { kicked = true; void x6Probe() }
  return () =>
    state.ready && state.client
      ? h('div', { style: 'height:100vh;display:flex;flex-direction:column;min-height:0' }, [h(OfficeSheetView, {
          ref: (el: any) => { state.view = el },
          client: state.client, editable: true, info: state.info,
          onError: (m: string) => { viewErrors.push(m) },
        })])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
}
// 注册前查重：mode 名撞车时 registerSmokeMode 会保留先注册者（我的探针将不生效）——必须提醒
if (getSmokeMode('x6f')) console.error('[smoke] mode x6f 已被注册，本探针不会生效，请改名')
registerSmokeMode('x6f', x6View)
