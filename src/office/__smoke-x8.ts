/**
 * x8 探针（第八批，?mode=x8）：用户报障 #1 / #3 / #4 的 Excel 侧验证。
 *  #1 切格丢编辑：真实 DOM 直输 → 点另一格 → 内容保留 + save→重开一致 + undo 可恢复；
 *     另覆盖点行/列头、名称框、切表、多格选区填满、点输入框内部不提交、Enter 提交。
 *  #3 表格/数据/分析组按钮：命令接线 + 点击有可观察行为。
 *  #4 剪贴板 PNG 粘贴：真实 paste 事件 → 真实 OOXML drawing part 落盘 + save→重开可见。
 * 顶层只注册 mode；异步逻辑在 view factory 内 kick，结果挂到 window.__smoke.x8。
 */
import { h, reactive } from 'vue'
import { registerSmokeMode, getSmokeMode } from './smoke-modes'
import OfficeSheetView from './components/OfficeSheetView.vue'
import { Engine } from './core/worker/engine'
import { writeZip } from './core/zipwrite'
import { ZipArchive } from './core/zip'
import { BufferSource } from './core/source'
import { RIBBON, type Item } from './ribbon'

const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKGREL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CTREL = 'application/vnd.openxmlformats-package.relationships+xml'
const CTWB = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
const CTWS = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'
const CTST = 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

/** 最小完整 xlsx；A/B 列放排序/透视用数据，E5(索引4,4) 放待编辑格 */
function makeBook(): Map<string, string> {
  return new Map<string, string>([
    ['[Content_Types].xml', `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="${CTREL}"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CTWB}"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${CTWS}"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="${CTWS}"/><Override PartName="/xl/styles.xml" ContentType="${CTST}"/></Types>`],
    ['_rels/.rels', `${DECL}<Relationships xmlns="${PKGREL}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${DECL}<workbook xmlns="${XMAIN}" xmlns:r="${RNS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/><sheet name="Sheet2" sheetId="2" r:id="rId3"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${DECL}<Relationships xmlns="${PKGREL}"><Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${RNS}/styles" Target="styles.xml"/><Relationship Id="rId3" Type="${RNS}/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`],
    ['xl/styles.xml', `${DECL}<styleSheet xmlns="${XMAIN}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`],
    ['xl/worksheets/sheet1.xml', `${DECL}<worksheet xmlns="${XMAIN}"><sheetData/></worksheet>`],
    ['xl/worksheets/sheet2.xml', `${DECL}<worksheet xmlns="${XMAIN}"><sheetData/></worksheet>`],
  ])
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface S {
  ready: boolean
  error: string | null
  client: any
  info: any
  view: any
  engine: any
  reopen: any
}
const state = reactive<S>({ ready: false, error: null, client: null, info: null, view: null, engine: null, reopen: null })
const viewErrors: string[] = []

/** 命令名提取：btn → act.cmd；menu/color → cmd；toggle → key */
function cmdOf(it: Item): string {
  const x = it as any
  if (x.t === 'btn') return x.act?.cmd ?? ''
  if (x.t === 'menu' || x.t === 'color') return x.cmd ?? ''
  if (x.t === 'toggle') return x.key ?? ''
  return ''
}
const isOff = (it: Item) => !!(it as any).disabled

async function x8Probe() {
  const R: any = ((window as any).__smoke.x8 = { ready: false, error: null, dbg: {} as any })
  const dbg: any = R.dbg

  // ---- 对外断言/操作助手（driver 用真实鼠标/键盘操作 DOM，这里只做读取与内核级验证）----
  R.cell = async (r: number, c: number, which: 'view' | 'reopen' = 'view', sheet = 0) => {
    const eng = which === 'reopen' ? state.reopen : state.engine
    if (!eng) return null
    const d: any = await eng.call('xlsx.cell', [sheet, r, c])
    return { text: String(d?.value ?? ''), value: String(d?.value ?? ''), formula: String(d?.formula ?? '') }
  }
  R.setCell = async (r: number, c: number, input: string) => {
    await state.engine.call('xlsx.set', [0, [{ r, c, input }]])
  }
  R.undo = async () => { await state.view?.commands?.undo() }
  R.cmd = async (name: string, ...args: any[]) => {
    const fn = state.view?.commands?.[name]
    if (typeof fn !== 'function') throw new Error('no command ' + name)
    return await fn(...args)
  }
  R.isEditing = () => !!document.querySelector('.ov-cell-input')
  R.editText = () => (document.querySelector('.ov-cell-input') as HTMLInputElement | null)?.value ?? null
  R.domText = (r: number, c: number) => {
    const el = document.querySelector<HTMLElement>(`.ov-cell[data-cell-r="${r}"][data-cell-c="${c}"] span`)
    return el?.textContent ?? null
  }
  R.nameText = () => (document.querySelector('.ov-name-box') as HTMLInputElement | null)?.value ?? null
  R.viewErrors = () => [...viewErrors]

  /** save → 新 Engine 重开；返回重开后的单元格/drawing + 真实 zip part 列表（不切换 view 的 engine） */
  R.saveReopen = async (sheet = 0) => {
    const blob: Blob = await state.engine.call('save', [])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const zip = await ZipArchive.open(new BufferSource(bytes))
    const parts = zip.list().map((e) => e.name)
    const e2 = new Engine(() => {})
    await e2.open(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), { name: 'x8-reopen.xlsx' })
    await e2.call('xlsx.load', [sheet])
    for (let i = 0; i < 80; i++) {
      const b: any = await e2.call('xlsx.block', [sheet, 0, 30])
      if (b?.complete || b?.rows?.length) break
      await wait(80)
    }
    state.reopen = e2
    const drawings: any = await e2.call('xlsx.drawings', [sheet])
    return {
      parts,
      drawingParts: parts.filter((p) => /^xl\/drawings\//.test(p)),
      mediaParts: parts.filter((p) => /^xl\/media\//.test(p)),
      drawings: (drawings?.drawings ?? []).map((d: any) => ({ media: d.media, col: d.col, row: d.row })),
    }
  }
  R.drawings = async (sheet = 0) => {
    const res: any = await state.engine.call('xlsx.drawings', [sheet])
    return (res?.drawings ?? []).map((d: any) => ({ media: d.media, col: d.col, row: d.row }))
  }

  /** 表格/数据/分析组按钮接线审计 */
  R.buttonAudit = () => {
    const cmds = state.view?.commands ?? {}
    const groups = new Set(['表格', '获取数据', '排序和筛选', '数据工具', '数据分析', '汇总', '编辑'])
    const out: any = { total: 0, wired: 0, missing: [] as string[], allWired: false, list: [] as any[] }
    for (const tab of RIBBON.xlsx) {
      for (const g of tab.groups) {
        if (!groups.has(g.name)) continue
        for (const it of g.items) {
          if (it.t === 'sep' || isOff(it)) continue
          const cmd = cmdOf(it)
          if (!cmd) continue
          out.total++
          const ok = typeof cmds[cmd] === 'function'
          if (ok) out.wired++
          else out.missing.push(`${tab.label}/${g.name}/${(it as any).label}→${cmd}`)
          out.list.push({ group: g.name, label: (it as any).label, cmd, wired: ok })
        }
      }
    }
    out.allWired = out.missing.length === 0
    return out
  }

  /** 真实 paste 事件 + 真实 PNG 文件 → 走 onDocPaste → xlsx.image */
  R.pastePng = async (sheet = 0) => {
    const cv = document.createElement('canvas')
    cv.width = 48
    cv.height = 32
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#2ecc71'
    ctx.fillRect(0, 0, 48, 32)
    const blob: Blob = await new Promise<Blob>((res) => cv.toBlob((b) => res(b!), 'image/png'))
    dbg.pngSize = blob.size
    const file = new File([blob], 'paste.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file)
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    window.dispatchEvent(ev)
    const t0 = Date.now()
    while (Date.now() - t0 < 10000) {
      if ((await R.drawings(sheet)).length > 0) return true
      await wait(80)
    }
    return false
  }

  // 等 DOM/命令就绪后跑一遍按钮审计，结果留在 dbg（driver 仍会主动调用 buttonAudit）
  const waitCmd = async () => {
    for (let i = 0; i < 100; i++) { if (state.view?.commands) break; await wait(50) }
    dbg.commandsReady = !!state.view?.commands
    dbg.audit = R.buttonAudit()
  }

  try {
    const blob: Blob = await writeZip(makeBook() as any)
    // 必须建成就接事件回调：视图 onMounted 经 client.on('xlsx:progress', applyProgress) 注册，
    // 空回调会让视图收不到 progress → rowAxis/colAxis count=0 → 渲染出 0 个 .ov-cell。
    const handlers: Record<string, (p: unknown) => void> = {}
    const engine = new Engine((ev: string, p: unknown) => handlers[ev]?.(p))
    const info: any = await engine.open(blob, { name: 'x8.xlsx' })
    await engine.call('xlsx.load', [0])
    for (let i = 0; i < 80; i++) {
      const b: any = await engine.call('xlsx.block', [0, 0, 30])
      if (b?.complete || b?.rows?.length) break
      await wait(80)
    }
    await engine.call('xlsx.set', [0, [
      { r: 0, c: 0, input: 'H1' }, { r: 0, c: 1, input: 'H2' },
      { r: 1, c: 0, input: 'b' }, { r: 1, c: 1, input: '3' },
      { r: 2, c: 0, input: 'a' }, { r: 2, c: 1, input: '1' },
      { r: 3, c: 0, input: 'c' }, { r: 3, c: 1, input: '2' },
      { r: 4, c: 4, input: 'SEED' },
    ]])
    state.engine = engine
    state.client = {
      call: (m: string, ...a: unknown[]) => (engine as any).call(m, a),
      on: (ev: string, fn: (p: unknown) => void) => { handlers[ev] = fn; return () => { delete handlers[ev] } },
      mediaUrl: (p: string) => (engine as any).call('part', [p]).then((b: Blob) => URL.createObjectURL(b)),
    }
    state.info = { xlsx: { sheets: [
      { index: 0, name: 'Sheet1', hidden: false, path: 'xl/worksheets/sheet1.xml' },
      { index: 1, name: 'Sheet2', hidden: false, path: 'xl/worksheets/sheet2.xml' },
    ], styles: [{}], formats: [], baseFont: {}, date1904: false } } as any
    state.ready = true
    R.ready = true
    void waitCmd()
  } catch (e) {
    R.error = String(e) + ' @ ' + String((e as Error)?.stack ?? '')
    state.ready = true
    state.error = R.error
  }
}

let kicked = false
function x8View() {
  if (!kicked) { kicked = true; void x8Probe() }
  return () =>
    state.ready && state.client
      ? h('div', { style: 'height:100vh;display:flex;flex-direction:column;min-height:0' }, [
          h(OfficeSheetView, {
            ref: (el: any) => { state.view = el },
            client: state.client, editable: true, info: state.info,
            onError: (m: string) => { viewErrors.push(m) },
          })
        ])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
}
if (getSmokeMode('x8')) console.error('[smoke] mode x8 已被注册，本探针不会生效，请改名')
registerSmokeMode('x8', x8View)
