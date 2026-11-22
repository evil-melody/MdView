/**
 * x5 探针（第五批注册表模式，?mode=x5）：
 *  - 问题 3：选中单元格后直接敲键盘 → 立即进入编辑态并预填该字符（替换式），Enter 提交落内核
 *  - 问题 4：冻结列水平滚动不抖动（冻结列视口 left 恒定 / 滚动列随滚动位移 / 冻结区与滚动区无缝拼接）
 * 顶层只注册 mode；异步探针在函数体内 kick，结果挂到 window.__smoke.x5。
 */
import { h, reactive } from 'vue'
import { registerSmokeMode, getSmokeMode } from './smoke-modes'
import OfficeSheetView from './components/OfficeSheetView.vue'
import { Engine } from './core/worker/engine'
import { writeZip } from './core/zipwrite'

const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKGREL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CTREL = 'application/vnd.openxmlformats-package.relationships+xml'
const CTWB = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
const CTWS = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'
const CTST = 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

/** 最小完整 xlsx：多列多行，便于测冻结列与水平滚动 */
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
  const info: any = await engine.open(book, { name: 'x5.xlsx' })
  await engine.call('xlsx.load', [0])
  for (let i = 0; i < 80; i++) {
    const b: any = await engine.call('xlsx.block', [0, 0, 60])
    if (b?.complete) break
    await wait(100)
  }
  return { engine: engine as any, info }
}

const state = reactive({ ready: false, client: null as any, info: null as any, view: null as any, engine: null as any })
const viewErrors: string[] = []

async function x5Probe() {
  const R: any = ((window as any).__smoke.x5 = { kernel: {}, viewResult: null, ready: false, error: null })
  R.runViewTests = runViewTests
  try {
    const handlers: Record<string, (p: unknown) => void> = {}
    const { engine, info } = await openEngine(handlers)
    // A..J 列 × 1..4 行：每格有值，便于区分冻结列/滚动列
    const cells: { r: number; c: number; input: string }[] = []
    for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) cells.push({ r, c, input: `v${r}${c}` })
    await engine.call('xlsx.set', [0, cells])
    state.client = {
      call: (m: string, ...args: unknown[]) => (engine as any).call(m, args),
      on: (ev: string, fn: (p: unknown) => void) => { handlers[ev] = fn; return () => { delete handlers[ev] } },
      mediaUrl: (p: string) => (engine as any).call('part', [p]).then((b: Blob) => URL.createObjectURL(b as Blob)),
    } as any
    state.engine = engine
    state.info = info
    state.ready = true
    R.ready = true
  } catch (e) {
    R.error = String(e) + ' @step=' + String(R.step) + ' ' + String((e as Error)?.stack ?? '')
    state.ready = true
  }
}

/** 视图断言：键盘直输 + 冻结列滚动 */
async function runViewTests() {
  const R: any = (window as any).__smoke.x5
  const dbg: any = (R.dbg = {})
  const out: any = {
    loadReady: false,
    // 问题 3
    typeEntersEdit: false, typePrefills: false, typeFocuses: false, typeCommits: false, typeNumberCommits: false,
    imeNotHijacked: false, typeIgnoresDialog: false, typeFillsSelection: false,
    // 问题 4
    frozenLeftStable: false, scrollColMoves: false, freezeSeamless: false, freezeNotOverlapped: false,
    frozenStillOnTop: false, frozenHeadStable: false, frozenHeadNotCovered: false, cornerStaysAtOrigin: false,
    frozenSurvivesProgress: false, clickMapsToClickedCell: false,
  }
  const client = state.client as any
  const view = state.view as any
  const waitFor = async (pred: () => boolean, ms = 6000) => {
    const t = Date.now()
    while (Date.now() - t < ms) { if (pred()) return true; await wait(60) }
    return false
  }
  const cellEl = (r: number, c: number) => document.querySelector(`.ov-cell[data-cell-r="${r}"][data-cell-c="${c}"]`) as HTMLElement | null
  const rect = (r: number, c: number) => {
    const el = cellEl(r, c)
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { left: b.left, right: b.right, top: b.top, w: b.width }
  }
  const clickCell = (r: number, c: number, o: { shift?: boolean } = {}) => {
    const el = cellEl(r, c)
    if (!el) return false
    const b = el.getBoundingClientRect()
    const opts: any = { bubbles: true, cancelable: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, button: 0, shiftKey: !!o.shift, view: window }
    el.dispatchEvent(new PointerEvent('pointerdown', opts))
    window.dispatchEvent(new PointerEvent('pointerup', opts))
    return true
  }
  const key = (k: string, o: any = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }))
  try {
    for (let i = 0; i < 60; i++) {
      const b: any = await client.call('xlsx.block', 0, 0, 60)
      if (b?.complete) { out.loadReady = true; break }
      await wait(100)
    }
    await wait(300)

    // ---------------- 问题 3：键盘直输 ----------------
    clickCell(0, 0)
    await wait(120)
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    await wait(60)
    // IME 组合中不应被抢（isComposing / keyCode 229）
    key('x', { isComposing: true })
    await wait(150)
    dbg.imeStillNoEditor = !document.querySelector('.ov-cell-input')
    out.imeNotHijacked = dbg.imeStillNoEditor === true
    // 名称框/公式栏聚焦时不得抢键（输入框守卫保留）
    const nameBox = document.querySelector('.ov-name-box') as HTMLInputElement | null
    if (nameBox) {
      nameBox.focus()
      await wait(80)
      key('x')
      await wait(150)
      out.typeIgnoresDialog = !document.querySelector('.ov-cell-input')
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      await wait(60)
    }
    // 正常按键 → 进入编辑态并预填
    key('x')
    await waitFor(() => !!document.querySelector('.ov-cell-input'))
    const inp = document.querySelector('.ov-cell-input') as HTMLInputElement | null
    out.typeEntersEdit = !!inp
    out.typePrefills = !!inp && inp.value === 'x'
    out.typeFocuses = !!inp && document.activeElement === inp
    dbg.inputValue = inp?.value
    dbg.activeIsInput = document.activeElement === inp
    // Enter 提交 → 内核值 = 'x'
    if (inp) {
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      let cell: any = null
      for (let i = 0; i < 40; i++) {
        cell = await client.call('xlsx.cell', 0, 0, 0)
        if (String(cell?.value ?? '') === 'x') break
        await wait(100)
      }
      dbg.committedValue = cell?.value
      out.typeCommits = String(cell?.value ?? '') === 'x'
    }
    // 数字同样直输
    clickCell(1, 0)
    await wait(120)
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    await wait(60)
    key('7')
    await waitFor(() => !!document.querySelector('.ov-cell-input'))
    const inp2 = document.querySelector('.ov-cell-input') as HTMLInputElement | null
    if (inp2) {
      inp2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      let cell2: any = null
      for (let i = 0; i < 40; i++) {
        cell2 = await client.call('xlsx.cell', 0, 1, 0)
        if (String(cell2?.value ?? '') === '7') break
        await wait(100)
      }
      out.typeNumberCommits = String(cell2?.value ?? '') === '7'
    } else {
      out.typeNumberCommits = false
    }
    // 多格选区 + 直输字符 → Enter 后整块被该字符填充（Office 行为）
    clickCell(1, 1)
    await wait(120)
    clickCell(1, 2, { shift: true })
    await wait(120)
    key('9')
    await waitFor(() => !!document.querySelector('.ov-cell-input'))
    const inp3 = document.querySelector('.ov-cell-input') as HTMLInputElement | null
    if (inp3) {
      inp3.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      let c1: any = null
      let c2: any = null
      for (let i = 0; i < 40; i++) {
        c1 = await client.call('xlsx.cell', 0, 1, 1)
        c2 = await client.call('xlsx.cell', 0, 1, 2)
        if (String(c1?.value ?? '') === '9' && String(c2?.value ?? '') === '9') break
        await wait(100)
      }
      dbg.multiValues = [c1?.value, c2?.value]
      out.typeFillsSelection = String(c1?.value ?? '') === '9' && String(c2?.value ?? '') === '9'
    }

    // ---------------- 问题 4：冻结列水平滚动 ----------------
    // 必须走视图的 commands.freeze（视图 sheetOp 包装器才会 applyProgress → progress.frozen 更新）；
    // 直接调 client.call('xlsx.sheetOp') 视图收不到 layout，冻结列不会被识别为冻结。
    clickCell(0, 2)
    await wait(120)
    clickCell(0, 3, { shift: true })
    await wait(120)
    dbg.freezeSel = (document.querySelector('.ov-name-box') as HTMLInputElement | null)?.value
    await view.commands.freeze('sel')
    await wait(600)
    dbg.frozenColsSeen = document.querySelectorAll('.ov-cell-pin').length
    dbg.totalCells = document.querySelectorAll('.ov-cell').length
    const gridEl = document.querySelector('.ov-grid') as HTMLElement | null
    dbg.gridHeight = gridEl ? gridEl.getBoundingClientRect().height : null
    dbg.gridWidth = gridEl ? gridEl.getBoundingClientRect().width : null
    // 行数是否持续膨胀（无限网格增长 = 活 bug；稳定则是初始值偏大）
    const scrollBox = document.querySelector('.ov-grid-scroll') as HTMLElement | null
    dbg.viewport = scrollBox ? { h: scrollBox.clientHeight, w: scrollBox.clientWidth } : null
    const h1 = gridEl ? gridEl.getBoundingClientRect().height : 0
    await wait(1500)
    const h2 = gridEl ? gridEl.getBoundingClientRect().height : 0
    await wait(1500)
    const h3 = gridEl ? gridEl.getBoundingClientRect().height : 0
    dbg.growth = { h1, h2, h3, growing: h2 > h1 + 1 || h3 > h2 + 1 }
    dbg.cornerBeforeScroll = (() => {
      const el = document.querySelector('.ov-corner') as HTMLElement | null
      return el ? el.getBoundingClientRect().left : null
    })()
    const scrollEl = document.querySelector('.ov-grid-scroll') as HTMLElement | null
    dbg.hasScrollEl = !!scrollEl
    if (scrollEl) {
      const headEl = (c: number) => document.querySelector(`.ov-col-head[data-c="${c}"]`) as HTMLElement | null
      const headRect = (c: number) => {
        const el = headEl(c)
        if (!el) return null
        const b = el.getBoundingClientRect()
        return { left: b.left, right: b.right, w: b.width }
      }
      const before = { a: rect(0, 0), b: rect(0, 1), s: rect(0, 6), ha: headRect(0), hb: headRect(1), hs: headRect(6) }
      dbg.before = before
      dbg.headZ = { frozen: headEl(0) ? Number(getComputedStyle(headEl(0)!).zIndex) : null, scroll: headEl(6) ? Number(getComputedStyle(headEl(6)!).zIndex) : null }
      scrollEl.scrollLeft = 200
      await wait(500)
      const after = { a: rect(0, 0), b: rect(0, 1), s: rect(0, 6), ha: headRect(0), hb: headRect(1), hs: headRect(6) }
      dbg.after = after
      dbg.scrollLeftActual = scrollEl.scrollLeft
      // 冻结列头是否被滚动列头盖住（命中测试：冻结列头中心点最上层元素是谁）
      const probe = (c: number) => {
        const el = headEl(c)
        if (!el) return null
        const b = el.getBoundingClientRect()
        if (b.width <= 0) return null
        const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
        const tc = top?.getAttribute?.('data-c')
        return { topEl: (top as HTMLElement)?.className ?? null, topCol: tc ?? null, isHead: (top as HTMLElement)?.classList?.contains('ov-col-head') ?? false }
      }
      dbg.headHitFrozen = probe(0)
      dbg.headHitFrozenB = probe(1)
      dbg.cornerRect = (() => {
        const el = document.querySelector('.ov-corner') as HTMLElement | null
        if (!el) return null
        const b = el.getBoundingClientRect()
        return { left: b.left, top: b.top }
      })()
      // 左上角全选块必须固定在容器左上角（不随水平滚动跑掉）
      out.cornerStaysAtOrigin = dbg.cornerRect !== null && dbg.cornerBeforeScroll !== null
        && Math.abs(dbg.cornerRect.left - dbg.cornerBeforeScroll) <= 1
        && Math.abs(dbg.cornerRect.left - (scrollEl.getBoundingClientRect().left)) <= 2
      out.frozenLeftStable = !!before.a && !!after.a && Math.abs(after.a.left - before.a.left) <= 1
        && !!before.b && !!after.b && Math.abs(after.b.left - before.b.left) <= 1
      // 冻结列头同样必须钉住，且不被滚动的列头盖住
      out.frozenHeadStable = !!before.ha && !!after.ha && Math.abs(after.ha.left - before.ha.left) <= 1
        && !!before.hb && !!after.hb && Math.abs(after.hb.left - before.hb.left) <= 1
      out.frozenHeadNotCovered = !!dbg.headHitFrozen && dbg.headHitFrozen.isHead === true
        && !!dbg.headHitFrozenB && dbg.headHitFrozenB.isHead === true
      out.scrollColMoves = !!before.s && !!after.s && Math.abs((after.s.left - before.s.left) + 200) <= 3
      // 冻结分隔线与冻结列右边缘一致（无缝）
      const fv = document.querySelector('.ov-freeze-v') as HTMLElement | null
      const fvLeft = fv ? fv.getBoundingClientRect().left : null
      dbg.freezeLineLeft = fvLeft
      dbg.frozenRight = after.b ? after.b.right : null
      out.freezeSeamless = !!fvLeft && !!after.b && Math.abs(fvLeft - after.b.right) <= 2
      // 冻结列与滚动列「可见区域」不重叠：取所有滚动列矩形里 left>=冻结右边缘的最小 left
      const all = [...document.querySelectorAll('.ov-cell')].map((e) => {
        const el = e as HTMLElement
        const bb = el.getBoundingClientRect()
        return { c: Number(el.getAttribute('data-cell-c')), left: bb.left, right: bb.right }
      })
      const fr = after.b ? after.b.right : 0
      const scrollVisible = all.filter((x) => x.c >= 2 && x.left >= fr - 1).map((x) => x.left)
      dbg.scrollVisibleLefts = scrollVisible.slice(0, 5)
      dbg.frozenRightEdge = fr
      out.freezeNotOverlapped = scrollVisible.length > 0 ? scrollVisible[0] - fr <= 80 : true
      // 冻结列 DOM 是否在滚动列之上（z-index）
      const aEl = cellEl(0, 0)
      const sEl = cellEl(0, 6)
      if (aEl && sEl) {
        const za = Number(getComputedStyle(aEl).zIndex)
        const zs = Number(getComputedStyle(sEl).zIndex)
        dbg.zIndex = { frozen: za, scroll: zs }
        out.frozenStillOnTop = za > zs
      }
      // 冻结状态不能被 xlsx:progress 事件清零：内核流式快照不带 frozen 字段
      const eng = state.engine as any
      if (eng?.emit) {
        eng.emit('xlsx:progress', { sheet: 0, rows: 4, cols: 10, rowSizes: [], done: true })
        await wait(400)
        const pinCount = document.querySelectorAll('.ov-cell-pin').length
        const a2 = rect(0, 0)
        dbg.pinAfterProgress = pinCount
        dbg.aAfterProgress = a2 ? a2.left : null
        out.frozenSurvivesProgress = pinCount > 0 && !!a2 && !!after.a && Math.abs(a2.left - after.a.left) <= 1
      }
      // 滚动后点击可见的滚动列：选中的必须是被点的那一列（gridPos 坐标与渲染层一致）
      const sClick = cellEl(0, 6)
      if (sClick) {
        const b = sClick.getBoundingClientRect()
        dbg.clickTarget = { left: b.left, top: b.top, w: b.width, h: b.height }
        sClick.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2,
          button: 0, view: window
        }))
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }))
        await wait(200)
        const onEl = document.querySelector('.ov-cell-on') as HTMLElement | null
        dbg.selectedAfterClick = onEl ? { r: onEl.getAttribute('data-cell-r'), c: onEl.getAttribute('data-cell-c') } : null
        out.clickMapsToClickedCell = dbg.selectedAfterClick?.c === '6'
      }
    }
  } catch (e) {
    out.error = String(e)
  }
  dbg.viewErrors = [...viewErrors]
  R.viewResult = out
  return out
}

let kicked = false
function x5View() {
  if (!kicked) { kicked = true; void x5Probe() }
  return () =>
    state.ready && state.client
      ? h('div', { style: 'height:100vh;display:flex;flex-direction:column;min-height:0' }, [h(OfficeSheetView, {
          ref: (el: any) => { state.view = el },
          client: state.client, editable: true, info: state.info,
          onError: (m: string) => { viewErrors.push(m) },
        })])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
}
// 注册前查重：mode 名重名会被 registerSmokeMode 静默覆盖（Map.set，无报错无警告），
// 症状是「我的 smoke 测到了别人的页面」且全程零报错。只警告不抛错——
// 抛错会因 import.meta.glob 的 eager 加载中断全部 mode 路由。
if (getSmokeMode('x5')) console.warn('[smoke] mode x5 已被注册，本探针将覆盖它')
registerSmokeMode('x5', x5View)
