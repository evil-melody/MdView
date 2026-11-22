/**
 * x9 探针（第九批，?mode=x9）：序列公式化全链路。
 *  - 内核：序列写真实 OOXML 公式（<f> 相对引用 + T_NUM 缓存值）、源格改自动重算跟随、
 *          undo/redo、save→重开一致、日期 numFmt 保留、工作日静态路径保留、fillSeries 公式化。
 *  - 视图：真实 OfficeSheetView 驱动「序列…」对话框，确认对话框路径也写公式。
 * 顶层只注册 mode（不碰 window.__smoke）；结果挂到 window.__smoke.x9Result。
 */
import { h, reactive } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import OfficeSheetView from './components/OfficeSheetView.vue'
import { Engine } from './core/worker/engine'
import { writeZip } from './core/zipwrite'
import { ZipArchive } from './core/zip'
import { BlobSource } from './core/source'

const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKGREL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CTREL = 'application/vnd.openxmlformats-package.relationships+xml'
const CTWB = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
const CTWS = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'
const CTST = 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

/** 最小但完整的 xlsx（带 styles 关系，保证 save→重开 numFmt 不丢） */
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

/** 事件必须转发给 handlers，否则视图挂载后 grid 0 cell */
async function openEngine(handlers: Record<string, (p: unknown) => void> = {}): Promise<{ engine: any; info: any }> {
  const book: Blob = await writeZip(makeBook() as any)
  const engine = new Engine((ev: string, p: unknown) => handlers[ev]?.(p))
  const info: any = await engine.open(book, { name: 'x9.xlsx' })
  await engine.call('xlsx.load', [0])
  for (let i = 0; i < 80; i++) {
    const b: any = await engine.call('xlsx.block', [0, 0, 60])
    if (b?.complete) break
    await wait(100)
  }
  return { engine, info }
}

async function saveReopen(engine: any, handlers: Record<string, (p: unknown) => void> = {}): Promise<{ engine: any; info: any }> {
  const blob: Blob = await engine.call('save', [])
  const e2 = new Engine((ev: string, p: unknown) => handlers[ev]?.(p))
  const info: any = await e2.open(blob, { name: 'x9-reopen.xlsx' })
  await e2.call('xlsx.load', [0])
  for (let i = 0; i < 80; i++) {
    const b: any = await e2.call('xlsx.block', [0, 0, 60])
    if (b?.complete) break
    await wait(100)
  }
  return { engine: e2, info }
}

const cellVal = (blk: any, r: number, c: number) => {
  const row = (blk?.rows as any[] | undefined)?.find((x) => x.r === r)
  const v = row?.cells.find((x: any[]) => x[0] === c)
  return v ? String(v[1]) : undefined
}

const state = reactive({ ready: false, client: null as any, info: null as any, view: null as any })
const viewErrors: string[] = []

async function x9Probe() {
  const R: any = ((window as any).__smoke.x9Result = { kernel: {}, viewResult: null, ready: false, error: null, step: '', dbg: {} })
  R.runViewTests = runViewTests
  const K: any = R.kernel
  try {
    // ---------------------------------------------------------------- 1. 等差：公式 / 落盘 XML / undo / 自动跟随 / 重开
    R.step = 'linear formula + persistence'
    {
      const { engine } = await openEngine()
      await engine.call('xlsx.set', [0, [{ r: 0, c: 0, input: '10' }]])
      await engine.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 0, r1: 4, c1: 0 }, dir: 'col', type: 'linear', step: 1 }])
      const blk: any = await engine.call('xlsx.block', [0, 0, 6])
      const a2: any = await engine.call('xlsx.cell', [0, 1, 0])
      const a3: any = await engine.call('xlsx.cell', [0, 2, 0])
      // 编辑只落在内存 SheetData，sheet XML 在 save 时由 RowPatcher 流式重写；从 save 结果解压读真实落盘内容
      const saved: Blob = await engine.call('save', [])
      const zip = await ZipArchive.open(new BlobSource(saved))
      const xml: string = await zip.text('xl/worksheets/sheet1.xml')
      R.dbg.linear = { a2: a2?.formula, a3: a3?.formula, xmlA2: (xml.match(/<c r="A2"[^>]*>.*?<\/c>/) ?? [''])[0] }
      K.linearValues = ['11', '12', '13', '14'].every((v, i) => cellVal(blk, i + 1, 0) === v)
      K.linearRelativeFormula = a2?.formula === '=A1+1' && a3?.formula === '=A2+1'
      K.persistedXml = /<c r="A2"[^>]*><f>A1\+1<\/f><v>11<\/v><\/c>/.test(xml)
        && /<c r="A3"[^>]*><f>A2\+1<\/f><v>12<\/v><\/c>/.test(xml)
        && !/<f>\s*\$/.test(xml) // 全相对引用，整段平移正确

      // undo / redo：序列写入必须单步撤销，连公式一起回滚
      await engine.call('xlsx.undo', [])
      const ub: any = await engine.call('xlsx.block', [0, 0, 6])
      const uc: any = await engine.call('xlsx.cell', [0, 1, 0])
      K.undoRestores = cellVal(ub, 1, 0) === undefined && !uc?.formula
      await engine.call('xlsx.redo', [])
      const rb: any = await engine.call('xlsx.block', [0, 0, 6])
      const rc: any = await engine.call('xlsx.cell', [0, 1, 0])
      K.redoRestores = cellVal(rb, 1, 0) === '11' && rc?.formula === '=A1+1'

      // 源格改动 → 公式链自动重算跟随（本批核心价值）
      await engine.call('xlsx.set', [0, [{ r: 0, c: 0, input: '100' }]])
      const fb: any = await engine.call('xlsx.block', [0, 0, 6])
      K.sourceAutoFollow = ['101', '102', '103', '104'].every((v, i) => cellVal(fb, i + 1, 0) === v)

      // save → 重开：公式与缓存值都在
      const { engine: e2 } = await saveReopen(engine)
      const b2: any = await e2.call('xlsx.block', [0, 0, 6])
      const c2: any = await e2.call('xlsx.cell', [0, 1, 0])
      K.reopenConsistent = ['101', '102', '103', '104'].every((v, i) => cellVal(b2, i + 1, 0) === v)
        && c2?.formula === '=A1+1'
    }

    // ---------------------------------------------------------------- 2. 等比：链式相对引用
    R.step = 'growth formula'
    {
      const { engine } = await openEngine()
      await engine.call('xlsx.set', [0, [{ r: 0, c: 1, input: '3' }]])
      await engine.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 1, r1: 4, c1: 1 }, dir: 'col', type: 'growth', step: 2 }])
      const blk: any = await engine.call('xlsx.block', [0, 0, 6])
      const b2: any = await engine.call('xlsx.cell', [0, 1, 1])
      const b3: any = await engine.call('xlsx.cell', [0, 2, 1])
      K.growthValues = ['6', '12', '24', '48'].every((v, i) => cellVal(blk, i + 1, 1) === v)
      K.growthFormula = b2?.formula === '=B1*2' && b3?.formula === '=B2*2'
    }

    // ---------------------------------------------------------------- 3. 日期（日/月）：公式 + numFmt + 月末回退
    R.step = 'date formulas'
    {
      const { engine } = await openEngine()
      // 日：=C1+1，保留日期 numFmt
      await engine.call('xlsx.format', [0, { r0: 0, c0: 2, r1: 0, c1: 2 }, { numFmt: 'yyyy-mm-dd' }])
      await engine.call('xlsx.set', [0, [{ r: 0, c: 2, input: '2026-01-01' }]])
      const bb: any = await engine.call('xlsx.block', [0, 0, 5])
      const xfOf = (blk: any, r: number, c: number) =>
        blk?.rows?.find((x: any) => x.r === r)?.cells.find((x: any[]) => x[0] === c)?.[2]
      const c1xf = xfOf(bb, 0, 2)
      await engine.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 2, r1: 3, c1: 2 }, dir: 'col', type: 'date', unit: 'day', step: 1 }])
      const db: any = await engine.call('xlsx.block', [0, 0, 5])
      const c2: any = await engine.call('xlsx.cell', [0, 1, 2])
      const c2xf = xfOf(db, 1, 2)
      K.dateDayValues = ['2026-01-02', '2026-01-03', '2026-01-04'].every((v, i) => cellVal(db, i + 1, 2) === v)
      K.dateDayFormula = c2?.formula === '=C1+1'
      K.dateNumFmtKept = c1xf === c2xf && c2xf !== 0

      // 月：必须从起点算，链式 EDATE 会丢 3/31
      await engine.call('xlsx.format', [0, { r0: 0, c0: 3, r1: 0, c1: 3 }, { numFmt: 'yyyy-mm-dd' }])
      await engine.call('xlsx.set', [0, [{ r: 0, c: 3, input: '2026-01-31' }]])
      await engine.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 3, r1: 2, c1: 3 }, dir: 'col', type: 'date', unit: 'month', step: 1 }])
      const mb: any = await engine.call('xlsx.block', [0, 0, 5])
      const d3: any = await engine.call('xlsx.cell', [0, 2, 3])
      K.dateMonthClamp = cellVal(mb, 1, 3) === '2026-02-28' && cellVal(mb, 2, 3) === '2026-03-31'
      K.dateMonthFormula = d3?.formula === '=EDATE(D1,2)' // 起点相对引用 + 从起点计的月数
    }

    // ---------------------------------------------------------------- 4. 静态路径保留：工作日 + 默认复制填充
    R.step = 'static paths'
    {
      const { engine } = await openEngine()
      await engine.call('xlsx.format', [0, { r0: 0, c0: 9, r1: 0, c1: 9 }, { numFmt: 'yyyy-mm-dd' }])
      await engine.call('xlsx.set', [0, [{ r: 0, c: 9, input: '2026-01-02' }]])
      await engine.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 9, r1: 2, c1: 9 }, dir: 'col', type: 'date', unit: 'weekday', step: 1 }])
      const wb: any = await engine.call('xlsx.block', [0, 0, 4])
      const j2: any = await engine.call('xlsx.cell', [0, 1, 9])
      K.weekdayStatic = cellVal(wb, 1, 9) === '2026-01-05' && cellVal(wb, 2, 9) === '2026-01-06' && !j2?.formula

      await engine.call('xlsx.set', [0, [{ r: 0, c: 14, input: '7' }]])
      await engine.call('xlsx.sheetOp', [0, { op: 'fill', range: { r0: 0, c0: 14, r1: 2, c1: 14 }, dir: 'down' }])
      const ob: any = await engine.call('xlsx.block', [0, 0, 4])
      const o2: any = await engine.call('xlsx.cell', [0, 1, 14])
      K.defaultCopyStillStatic = cellVal(ob, 1, 14) === '7' && !o2?.formula
    }

    // ---------------------------------------------------------------- 5. 填充柄「以序列方式填充」写公式 + 跟随
    R.step = 'fillSeries formula'
    {
      const { engine } = await openEngine()
      await engine.call('xlsx.set', [0, [{ r: 0, c: 6, input: '1' }, { r: 1, c: 6, input: '3' }]])
      await engine.call('xlsx.sheetOp', [0, { op: 'fill', range: { r0: 0, c0: 6, r1: 3, c1: 6 }, dir: 'down', mode: 'fillSeries', src: { r0: 0, c0: 6, r1: 1, c1: 6 } }])
      const g3: any = await engine.call('xlsx.cell', [0, 2, 6])
      const g4: any = await engine.call('xlsx.cell', [0, 3, 6])
      const fb: any = await engine.call('xlsx.block', [0, 0, 5])
      K.fillSeriesValues = cellVal(fb, 2, 6) === '5' && cellVal(fb, 3, 6) === '7'
      K.fillSeriesFormula = g3?.formula === '=G2+2' && g4?.formula === '=G3+2'
      await engine.call('xlsx.set', [0, [{ r: 1, c: 6, input: '30' }]])
      const ab: any = await engine.call('xlsx.block', [0, 0, 5])
      K.fillSourceFollow = cellVal(ab, 2, 6) === '32' && cellVal(ab, 3, 6) === '34'
    }

    // ---------------------------------------------------------------- 6. 视图引擎（对话框路径）
    R.step = 'view engine'
    {
      const handlers: Record<string, (p: unknown) => void> = {}
      const { engine, info } = await openEngine(handlers)
      state.client = {
        call: (m: string, ...args: unknown[]) => (engine as any).call(m, args),
        on: (ev: string, fn: (p: unknown) => void) => { handlers[ev] = fn; return () => { delete handlers[ev] } },
        mediaUrl: (p: string) => (engine as any).call('part', [p]).then((b: Blob) => URL.createObjectURL(b)),
      } as any
      state.info = info
      state.ready = true
      R.ready = true
    }
  } catch (e) {
    R.error = String(e) + ' @step=' + String(R.step) + ' ' + String((e as Error)?.stack ?? '')
    state.ready = true
    R.ready = true
  }
}

/** 视图断言：真实对话框 → 写公式（K1=100，K1:O1 → L1..O1 = 101..104，L1 公式 =K1+1） */
async function runViewTests() {
  const R: any = (window as any).__smoke.x9Result
  const out: any = { loadReady: false, dialogOpen: false, noNativeControls: false, seriesValues: false, seriesFormula: false }
  const dbg: any = (R.dbg.view ??= {})
  const client = state.client as any
  const clickCell = (r: number, c: number, shift = false) => {
    const el = document.querySelector(`.ov-cell[data-cell-r="${r}"][data-cell-c="${c}"]`) as HTMLElement | null
    if (!el) return false
    const b = el.getBoundingClientRect()
    const opts: any = { bubbles: true, cancelable: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, button: 0, shiftKey: shift, view: window }
    el.dispatchEvent(new PointerEvent('pointerdown', opts))
    window.dispatchEvent(new PointerEvent('pointerup', opts))
    return true
  }
  try {
    for (let i = 0; i < 60; i++) {
      const b: any = await client.call('xlsx.block', 0, 0, 20)
      if (b?.complete) { out.loadReady = true; break }
      await wait(100)
    }
    await client.call('xlsx.set', 0, [{ r: 0, c: 10, input: '100' }])
    await wait(150)
    clickCell(0, 10); await wait(60)
    clickCell(0, 14, true); await wait(60)
    const view = state.view as any
    view.commands.series()
    await wait(120)
    const dlg = document.querySelector('.ov-dlg') as HTMLElement | null
    out.dialogOpen = !!dlg && (dlg?.querySelector('.ov-dlg-title')?.textContent ?? '').includes('序列')
    out.noNativeControls = !!dlg && dlg.querySelectorAll('input, select, textarea').length === 0
    ;(dlg?.querySelector('.ov-dlg-ok') as HTMLButtonElement | null)?.click()
    let blk: any = null
    for (let i = 0; i < 40; i++) {
      blk = await client.call('xlsx.block', 0, 0, 3)
      const v = blk?.rows?.find((x: any) => x.r === 0)?.cells.find((x: any[]) => x[0] === 14)
      if (v && String(v[1]) === '104') break
      await wait(120)
    }
    dbg.row = [10, 11, 12, 13, 14].map((c) => blk?.rows?.find((x: any) => x.r === 0)?.cells.find((x: any[]) => x[0] === c)?.[1])
    out.seriesValues = ['100', '101', '102', '103', '104'].every((v, i) => dbg.row[i] === v)
    const l1: any = await client.call('xlsx.cell', 0, 0, 11)
    dbg.l1Formula = l1?.formula
    out.seriesFormula = l1?.formula === '=K1+1'
  } catch (e) {
    out.error = String(e)
  }
  dbg.viewErrors = [...viewErrors]
  R.viewResult = out
  return out
}

let kicked = false
function x9View() {
  if (!kicked) { kicked = true; void x9Probe() }
  return () =>
    state.ready && state.client
      ? h('div', { style: { height: '100vh' } }, [h(OfficeSheetView, {
          ref: (el: any) => { state.view = el },
          client: state.client, editable: true, info: state.info,
          onError: (m: string) => { viewErrors.push(m) },
        })])
      : h('div', { style: { height: '100vh', display: 'grid', placeItems: 'center' } }, 'preparing…')
}
registerSmokeMode('x9', x9View)
