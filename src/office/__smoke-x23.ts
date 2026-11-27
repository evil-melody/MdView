/**
 * x23 探针（路线图 P9a，?mode=x23）：WORKDAY 函数 + 工作日序列公式化 + PPT 分布 ribbon 入口。
 * 五节：
 *   A WORKDAY 单元口径（evaluateFormula 直评，逐条对 sdkjs cWORKDAY 原文推演，禁凭印象）；
 *   B 恒等锁（断言前置：serialToYmd.dow ≡ 真实日历 getUTCDay；workday() ≡ dateStepValue 静态
 *     递推逐点恒等；1904 同历日期平移 1462 后推进同构）；
 *   C ribbon 静态断言（PPTX「排列」组 distribute h/v 两按钮 + 图标映射）；
 *   D 端到端（Engine：A1 数值日期 → 工作日序列 → formulas 锁 <f> + cell 锁原始数值 ≡ 静态 →
 *     改源 → seriesRefresh 跟随）；
 *   E 持久化（save → 重开 sheet1.xml `<f>WORKDAY(A1,n)</f>` 在位 + 重开引擎计算值同 D）。
 *
 * 取证来源（sdkjs release/v10.0.0，逐行核实）：
 *   - cWORKDAY.Calculate：dateandtimeFunctions.js:2455-2505 —— floor(days)、±1 步进 while
 *     cnt!==t、跳过 getUTCDay∈{0,6} 与节假日、val0<0 / val<0 → #NUM!；serial<60 的
 *     `getUTCDay()-1` 修正（:2477-2481）与 serialToYmd 的 ((n-1)%7) 远古域恒等（B2）。
 *   - 周末基准：1900 系统 serial%7 → 周六=0/周日=1（dateStepValue 纯递推同源）；
 *     1904 系统相差 1462 天（1462%7=6）→ 周六=1/周日=2。
 *
 * 顶层只注册 mode；结果挂 window.__smoke.x23。
 */
import { h } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import { evaluateFormula } from './core/xlsx/formula'
import { serialToYmd, ymdToSerial, setDate1904 } from './core/xlsx/formula/dates'
import { ERR, type CellProvider } from './core/xlsx/formula/types'
import { dateStepValue } from './core/xlsx/series'
import { RIBBON, type Item, type Tab } from './ribbon'
import { iconFor } from './icons'
import { Engine } from './core/worker/engine'
import { writeZip } from './core/zipwrite'
import { ZipArchive } from './core/zip'
import { BufferSource } from './core/source'

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKGREL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CTREL = 'application/vnd.openxmlformats-package.relationships+xml'
const CTWB = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
const CTWS = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'
const CTST = 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'

/** 单表最小工作簿（A1 预置 45292 = 2024-01-01 周一） */
function makeBook(): Map<string, string> {
  return new Map<string, string>([
    ['[Content_Types].xml', `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="${CTREL}"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CTWB}"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${CTWS}"/><Override PartName="/xl/styles.xml" ContentType="${CTST}"/></Types>`],
    ['_rels/.rels', `${DECL}<Relationships xmlns="${PKGREL}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${DECL}<workbook xmlns="${XMAIN}" xmlns:r="${RNS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${DECL}<Relationships xmlns="${PKGREL}"><Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${RNS}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `${DECL}<styleSheet xmlns="${XMAIN}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`],
    ['xl/worksheets/sheet1.xml', `${DECL}<worksheet xmlns="${XMAIN}"><sheetData><row r="1"><c r="A1"><v>45292</v></c></row></sheetData></worksheet>`],
  ])
}

/** 标量桩 provider：refs 的格直接给数（显式 range 不被 clip，无需 bounds） */
function stubProvider(cells: Record<string, number>, date1904 = false): CellProvider {
  return {
    date1904,
    value(_sheet, r, c) {
      const k = `${String.fromCharCode(65 + c)}${r + 1}`
      return cells[k] ?? 0
    },
  }
}
const wd = (text: string, cells: Record<string, number>, date1904 = false) =>
  evaluateFormula(text, { provider: stubProvider(cells, date1904), sheet: 'Sheet1', r: 0, c: 0 })

/** 数值结果包装：WORKDAY 正常输入必返 serial，非数值即探针失败（B5 算术需要 number 类型） */
const wdN = (text: string, cells: Record<string, number>, date1904 = false): number => {
  const v = wd(text, cells, date1904)
  if (typeof v !== 'number') throw new Error(`WORKDAY 非数值: ${String(v)}`)
  return v
}

/** 真实日历 getUTCDay（0=Sun）——独立于内核管线的 ground truth */
function realDow(serial: number): number {
  const p = serialToYmd(serial)
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()
}

async function run(): Promise<Record<string, unknown>> {
  const R: Record<string, unknown> = { ok: false, errors: [] as string[] }
  const errs = R.errors as string[]
  const eq = (name: string, a: unknown, b: unknown) => {
    if (a !== b) errs.push(`${name}: 实=${JSON.stringify(a)} 期=${JSON.stringify(b)}`)
  }
  const ok = (name: string, cond: unknown) => {
    if (!cond) errs.push(`${name}: 期望真值，实=${JSON.stringify(cond)}`)
  }

  // 常量（1900 系统，现代域无闰日歧义）
  const MON1 = ymdToSerial(2024, 1, 1) // 45292 周一
  const TUE2 = ymdToSerial(2024, 1, 2) // 45293
  const WED3 = ymdToSerial(2024, 1, 3) // 45294
  const THU4 = ymdToSerial(2024, 1, 4) // 45295
  const FRI5 = ymdToSerial(2024, 1, 5) // 45296 周五
  const SAT6 = ymdToSerial(2024, 1, 6) // 45297 周六
  const SUN7 = ymdToSerial(2024, 1, 7) // 45298 周日
  const MON8 = ymdToSerial(2024, 1, 8) // 45299 周一
  const DEC29 = ymdToSerial(2023, 12, 29) // 45289 周五
  const A1 = { A1: MON1 }

  // ── A. WORKDAY 单元口径（sdkjs cWORKDAY.Calculate :2455-2505）──
  eq('A1 周一+1→周二', wd('WORKDAY(A1,1)', A1), TUE2)
  eq('A2 周五+1→下周一', wd('WORKDAY(A1,1)', { A1: FRI5 }), MON8)
  eq('A3 周六+1→下周一', wd('WORKDAY(A1,1)', { A1: SAT6 }), MON8)
  eq('A4 周日+1→下周一', wd('WORKDAY(A1,1)', { A1: SUN7 }), MON8)
  eq('A5 周五-1→周四', wd('WORKDAY(A1,-1)', { A1: FRI5 }), THU4)
  eq('A6 周一-1→上周五', wd('WORKDAY(A1,-1)', A1), DEC29)
  eq('A7 days=0 原样起点（周六不矫正）', wd('WORKDAY(A1,0)', { A1: SAT6 }), SAT6)
  eq('A8 周一+5→下周一', wd('WORKDAY(A1,5)', A1), MON8)
  eq('A9 单格节假日跳过（Tue 休→Wed 1→Thu 2）', wd('WORKDAY(A1,2,B1)', { A1: MON1, B1: TUE2 }), THU4)
  eq('A10 range 节假日（周末日不影响路径）', wd('WORKDAY(A1,2,B1:B2)', { A1: MON1, B1: SAT6, B2: SUN7 }), WED3)
  eq('A11 floor(2.9)=2 → Wed', wd('WORKDAY(A1,2.9)', A1), WED3)
  eq('A12 起点<0 → #NUM!', wd('WORKDAY(A1,1)', { A1: -1 }), ERR.NUM)
  eq('A13 结果<0 → #NUM!', wd('WORKDAY(A1,-45293)', A1), ERR.NUM)
  setDate1904(true)
  const M1_04 = ymdToSerial(2024, 1, 1)
  const T2_04 = ymdToSerial(2024, 1, 2)
  setDate1904(false)
  eq('A14 1904 同历日期同值', wd('WORKDAY(A1,1)', { A1: M1_04 }, true), T2_04)

  // ── B. 恒等锁（断言前置，x20 教训：容差掩盖结构破口）──
  // B1 1900 现代域：serialToYmd.dow ≡ 真实日历 getUTCDay（n≥61 全带 3000 格）
  let mismatch = 0
  for (let n = 61; n < 3061; n++) if (serialToYmd(n).dow !== realDow(n)) mismatch++
  eq('B1 1900 dow≡真实日历（61..3060）', mismatch, 0)
  // B2 1900 远古域：serialToYmd.dow=((n-1)%7) ≡ sdkjs calcDate 的 getUTCDay()-1 修正口径
  let mismatch2 = 0
  for (let n = 1; n < 60; n++) if (serialToYmd(n).dow !== ((((n - 1) % 7) + 7) % 7)) mismatch2++
  eq('B2 1900 远古域 ((n-1)%7) 恒等', mismatch2, 0)
  // B3 1904：serialToYmd.dow=((n+5)%7) ≡ 真实日历
  setDate1904(true)
  let mismatch3 = 0
  for (let n = 0; n < 3000; n++) if (serialToYmd(n).dow !== realDow(n)) mismatch3++
  setDate1904(false)
  eq('B3 1904 dow≡真实日历（0..2999）', mismatch3, 0)
  // B4 公式 ≡ 静态递推（dateStepValue weekday，纯 serial%7 周末基准）逐点恒等
  const starts = [MON1, FRI5, SAT6, SUN7, ymdToSerial(2025, 6, 25)]
  let diff4 = 0
  for (const s of starts) {
    for (let i = 1; i <= 12; i++) {
      const formulaV = wd(`WORKDAY(A1,${i})`, { A1: s })
      const staticV = dateStepValue(s, 'weekday', 1, i, false)
      if (formulaV !== staticV) diff4++
    }
  }
  eq('B4 workday ≡ dateStepValue（5 起点×12 步）', diff4, 0)
  // B5 1904 同构：同一历日期 1904 serial = 1900 serial − 1462（43830 = 45292 − 1462），且公式 ≡ 静态
  setDate1904(true); const s1904 = ymdToSerial(2024, 1, 1); setDate1904(false)
  eq('B5a 1904 起点 = 1900 − 1462', s1904, MON1 - 1462)
  let diff5 = 0
  for (let i = 1; i <= 8; i++) {
    const f1904 = wdN(`WORKDAY(A1,${i})`, { A1: s1904 }, true)
    const f1900 = wdN(`WORKDAY(A1,${i})`, { A1: MON1 })
    if (f1904 !== f1900 - 1462) diff5++
    const st1904 = dateStepValue(s1904, 'weekday', 1, i, true)
    if (st1904 !== f1904) diff5++
  }
  eq('B5 1904 推进同构（公式/静态/平移）', diff5, 0)

  // ── C. ribbon 静态断言（PPTX「排列」组）──
  const pptx = RIBBON.pptx as Tab[]
  const arrange = pptx.flatMap((t) => t.groups).find((gr) => gr.name === '排列')
  ok('C1 PPTX 存在「排列」组', !!arrange)
  const items = (arrange?.items ?? []) as Item[]
  const labelOf = (i: Item): string => (i.t === 'sep' ? '' : i.label)
  const dh = items.find((i) => labelOf(i) === '横向分布') as Extract<Item, { t: 'btn' }> | undefined
  const dv = items.find((i) => labelOf(i) === '纵向分布') as Extract<Item, { t: 'btn' }> | undefined
  eq('C2 横向分布 cmd', dh?.act?.cmd, 'distribute')
  eq('C3 横向分布 arg', JSON.stringify(dh?.act?.args), JSON.stringify(['h']))
  eq('C4 纵向分布 cmd+arg', JSON.stringify([dv?.act?.cmd, dv?.act?.args]), JSON.stringify(['distribute', ['v']]))
  ok('C5 对齐幻灯片菜单仍在', items.some((i) => labelOf(i) === '对齐幻灯片'))
  ok('C6 distribute 图标映射非 generic', iconFor('distribute', '横向分布')[0] !== 'generic')

  // ── D. 端到端（Engine：序列 → 公式落格 → 原始数值 ≡ 静态 → 改源刷新跟随）──
  const book = makeBook()
  const mkEngine = () => {
    let header: any = null
    let doneEv: any = null
    const engine = new Engine((ev: string, p: any) => {
      if (ev !== 'xlsx:progress') return
      if (!header && p.colInfo) header = p
      if (p.done) doneEv = p
    })
    const wait = async () => {
      for (let i = 0; i < 200 && !(header && doneEv); i++) await new Promise((r) => setTimeout(r, 50))
      if (doneEv?.error) throw new Error(`load: ${doneEv.error}`)
    }
    return { engine, wait }
  }
  /** 原始数值读取：cell RPC 的 value 是 String(rawNum)（block 是显示串，不能用） */
  const rawAt = async (e: Engine, r: number, c: number): Promise<number> => {
    const d = (await e.call('xlsx.cell', [0, r, c])) as { value: string }
    return Number(d.value)
  }
  const { engine, wait } = mkEngine()
  const blob = await writeZip(book as any)
  await engine.open(blob, { name: 'workday.xlsx' })
  await engine.call('xlsx.load', [0])
  await wait()
  // 工作日序列 A1:A5（type=date unit=weekday step=1，纵向）
  await engine.call('xlsx.sheetOp', [0, { op: 'series', range: { r0: 0, c0: 0, r1: 4, c1: 0 }, dir: 'col', type: 'date', unit: 'weekday', step: 1 }])
  const fl = (await engine.call('xlsx.formulas', [0, 0, 4])) as { r: number; c: number; f: string }[]
  const fmap = new Map(fl.map((x) => [x.r, x.f]))
  eq('D1 公式格数', fl.length, 4)
  eq('D2 A2 公式', fmap.get(1), 'WORKDAY(A1,1)')
  eq('D3 A3 公式', fmap.get(2), 'WORKDAY(A1,2)')
  eq('D4 A4 公式', fmap.get(3), 'WORKDAY(A1,3)')
  eq('D5 A5 公式', fmap.get(4), 'WORKDAY(A1,4)')
  const statics = [MON1, ...[1, 2, 3, 4].map((i) => dateStepValue(MON1, 'weekday', 1, i, false))]
  for (let r = 0; r <= 4; r++) eq(`D6.${r} 原始值 ≡ 静态`, await rawAt(engine, r, 0), statics[r])
  // 改源 → 刷新序列跟随（周五起点）
  await engine.call('xlsx.set', [0, [{ r: 0, c: 0, input: String(FRI5) }]])
  await engine.call('xlsx.seriesRefresh', [0, 1])
  const statics2 = [FRI5, ...[1, 2, 3, 4].map((i) => dateStepValue(FRI5, 'weekday', 1, i, false))]
  for (let r = 0; r <= 4; r++) eq(`D7.${r} 刷新后 ≡ 新静态`, await rawAt(engine, r, 0), statics2[r])
  eq('D8 刷新后 A2 = 下周一', statics2[1], MON8)

  // ── E. 持久化（save → 重开 <f> 在位 + 计算值同 D）──
  const saved = (await engine.call('save', [])) as Blob
  const zip = await ZipArchive.open(new BufferSource(new Uint8Array(await saved.arrayBuffer())))
  const sh = await zip.text('xl/worksheets/sheet1.xml')
  ok('E1 sheet1.xml 含 <f>WORKDAY(A1,1)</f>', sh.includes('<f>WORKDAY(A1,1)</f>'))
  ok('E2 含 <f>WORKDAY(A1,4)</f>', sh.includes('<f>WORKDAY(A1,4)</f>'))
  ok('E3 起点值 45296 在位', sh.includes('<v>45296</v>'))
  const { engine: e2, wait: wait2 } = mkEngine()
  await e2.open(saved, { name: 'workday.xlsx' })
  await e2.call('xlsx.load', [0])
  await wait2()
  const fl2 = (await e2.call('xlsx.formulas', [0, 0, 4])) as { r: number; c: number; f: string }[]
  eq('E4 重开公式清单 A2', new Map(fl2.map((x) => [x.r, x.f])).get(1), 'WORKDAY(A1,1)')
  eq('E5 重开公式格数', fl2.length, 4)
  for (let r = 0; r <= 4; r++) eq(`E6.${r} 重开计算值`, await rawAt(e2, r, 0), statics2[r])

  R.ok = errs.length === 0
  return R
}

let cached: Promise<Record<string, unknown>> | null = null
function result(): Promise<Record<string, unknown>> {
  if (!cached) cached = run().catch((e) => ({ ok: false, errors: [`threw: ${e}`] }))
  return cached
}

registerSmokeMode('x23', () => {
  ;(window as any).__smoke.x23 = { result }
  return () => h('div', { style: 'width:100%;height:100%' }, 'x23 P9a WORKDAY / weekday-series / distribute probe')
})
