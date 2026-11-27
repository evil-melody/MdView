/**
 * x25 探针（报障回归门，?mode=x25）：真实办公 xlsx 打开链路。
 *
 * 立探针的起因：52-mode 全绿但用户真表打开数据区全空、Ctrl+A 失效。根因是既有探针
 * 一律用自建最小工作簿（makeBook），从未覆盖「Excel/WPS 实际写出的文件」这一大类输入
 * ——多 sheet、sharedStrings、<cols> 自定义列宽、冻结窗格、富文本 si、t="s" 引用全在里面。
 * 本探针把报障原件当 fixture，逐面对内核开火，任何一面塌都精确定位到面。
 *
 * 断言值来源（unzip 实测 /tmp/xlsx-check，非凭印象）：
 *   sheet1 dimension A1:F103 → rows=103 cols=6；cols 五段 (1,1,5)(2,2,18)(3,3,10)(4,5,55)(6,6,40)；
 *   sheetViews pane ySplit=1 state=frozen → frozen.rows=1；
 *   sheet2 A1:C8 → 8×3；sheet3 A1:C11 → 11×3；
 *   sst uniqueCount=374；行1 六表头 = 序号/领域/变化类型/旧法（2018年修订，已废止）/
 *   新法（2021年发布，现行有效）/变化说明；行3 A3 数值 1、B3 法律名称、C3 修改。
 *
 * 顶层只注册 mode；结果挂 window.__smoke.x25。
 */
import { h } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import { Engine } from './core/worker/engine'

const FIXTURE = 'real-noise.xlsx'
const SHEET_NAMES = ['两版噪声法逐条对比', '统计汇总', '十大核心变化']
/** 各表 used range（dimension 推演：maxRow+1 × maxCol+1） */
const USED = [
  { rows: 103, cols: 6 },
  { rows: 8, cols: 3 },
  { rows: 11, cols: 3 },
]

type Prog = {
  sheet: number; rows: number; cols: number; done: boolean; error?: string
  colInfo?: { min: number; max: number; w: number }[]
  frozen?: { rows?: number; cols?: number }
  merges?: unknown[]
  defaultColW?: number; defaultRowH?: number
}

/** 一次装载：抓 header（带 colInfo 的首帧）与 done 帧；done 帧带 error 即抛，绝不让静默空表过关 */
function mkEngine() {
  const got = new Map<number, { header: Prog | null; done: Prog | null }>()
  const engine = new Engine((ev: string, raw: unknown) => {
    if (ev !== 'xlsx:progress') return
    const p = raw as Prog
    const slot = got.get(p.sheet) ?? { header: null, done: null }
    if (!slot.header && p.colInfo) slot.header = p
    if (p.done) slot.done = p
    got.set(p.sheet, slot)
  })
  const wait = async (sheet: number) => {
    for (let i = 0; i < 400; i++) {
      const slot = got.get(sheet)
      if (slot?.done) {
        if (slot.done.error) throw new Error(`sheet[${sheet}] load error: ${slot.done.error}`)
        return slot
      }
      await new Promise((r) => setTimeout(r, 50))
    }
    throw new Error(`sheet[${sheet}] load timeout`)
  }
  return { engine, wait, got }
}

async function run(): Promise<Record<string, unknown>> {
  const errs: string[] = []
  const ok = (name: string, cond: unknown, extra = '') => {
    if (!cond) errs.push(`${name}${extra ? ' → ' + extra : ''}`)
  }
  const eq = (name: string, actual: unknown, expect: unknown) =>
    ok(name, actual === expect, `actual=${JSON.stringify(actual)} expect=${JSON.stringify(expect)}`)

  // ── A. 装配：fixture 到位、字节数与原件一致 ──
  const resp = await fetch(FIXTURE)
  ok('A1 fixture 可取', resp.ok, `HTTP ${resp.status}`)
  const blob = await resp.blob()
  eq('A2 字节数 ≡ 原件', blob.size, 25257)

  const { engine, wait, got } = mkEngine()
  const info = await engine.open(blob, { name: FIXTURE })
  eq('A3 kind', info.kind, 'xlsx')

  // ── B. 工作簿元面：三表名/序/隐藏态 ──
  const meta = info.xlsx!
  eq('B1 表数', meta.sheets.length, 3)
  eq('B2 表名序', JSON.stringify(meta.sheets.map((s) => s.name)), JSON.stringify(SHEET_NAMES))
  eq('B3 表索引', JSON.stringify(meta.sheets.map((s) => s.index)), JSON.stringify([0, 1, 2]))
  ok('B4 无隐藏表', meta.sheets.every((s) => !s.hidden))
  eq('B5 1904 关闭', meta.date1904, false)
  ok('B6 默认字体 CSS 已解析', !!meta.baseFont && typeof meta.baseFont === 'object')
  ok('B7 样式 xf 非空', meta.styles.length > 1, `xfs=${meta.styles.length}`)

  // ── C. 逐表装载：used range 必须来自文件 dimension，不是 padding 出来的空网 ──
  for (let i = 0; i < 3; i++) {
    await engine.call('xlsx.load', [i])
    const slot = await wait(i)
    const hdr = slot.header
    ok(`C${i}.1 sheet[${i}] header 帧存在`, !!hdr)
    eq(`C${i}.2 sheet[${i}] rows ≡ dimension`, hdr?.rows, USED[i].rows)
    eq(`C${i}.3 sheet[${i}] cols ≡ dimension`, hdr?.cols, USED[i].cols)
    eq(`C${i}.4 sheet[${i}] done 帧 rows`, slot.done?.rows, USED[i].rows)
    ok(`C${i}.5 sheet[${i}] 无装载错误`, !slot.done?.error, slot.done?.error)
    const st = (await engine.call('xlsx.stats', [i])) as { rows: number; cols: number }
    eq(`C${i}.6 sheet[${i}] stats.rows ≡ progress`, st.rows, USED[i].rows)
    eq(`C${i}.7 sheet[${i}] stats.cols ≡ progress`, st.cols, USED[i].cols)
  }

  // ── D. 列宽面：<cols> 自定义宽度必须落到 colInfo（截图全默认等宽即此面塌）──
  // w 是三段式换算后的 px，不是 XML chars 值；首轮 dump 实测，核对后再锁数值
  const hdr0 = got.get(0)!.header!
  const colInfo = hdr0.colInfo ?? []
  eq('D1 colInfo 段数', colInfo.length, 5)
  eq('D2 colInfo 区间（0 基）', JSON.stringify(colInfo.map((c) => [c.min, c.max])),
    JSON.stringify([[0, 0], [1, 1], [2, 2], [3, 4], [5, 5]]))
  const dump = {
    colPx: colInfo.map((c) => Math.round(c.w)),
    defaultColW: hdr0.defaultColW,
    defaultRowH: hdr0.defaultRowH,
    merges: hdr0.merges?.length ?? 0,
    row1: null as unknown,
    row3: null as unknown,
  }
  ok('D3 默认列宽已度量', !!hdr0.defaultColW && hdr0.defaultColW > 0, String(hdr0.defaultColW))
  ok('D4 默认行高已度量', !!hdr0.defaultRowH && hdr0.defaultRowH > 0, String(hdr0.defaultRowH))
  eq('D5 冻结行 ≡ ySplit=1', hdr0.frozen?.rows, 1)
  eq('D6 无冻结列', hdr0.frozen?.cols ?? 0, 0)

  // ── E. 内容面：sharedStrings 引用（t="s"）与数值混排 ──
  // CellOut = [c, 显示串, 样式索引, 类型] —— 断言取 [1]
  const blk = (await engine.call('xlsx.block', [0, 0, 4])) as { rows: { r: number; cells: unknown[][] }[] }
  const at = (ri: number, ci: number): unknown => {
    const row = blk.rows.find((x) => x.r === ri)
    const cell = row?.cells.find((c) => c[0] === ci) as unknown[] | undefined
    return cell ? cell[1] : null
  }
  dump.row1 = blk.rows.find((x) => x.r === 0)?.cells
  dump.row3 = blk.rows.find((x) => x.r === 2)?.cells
  eq('E1 表头 A1', at(0, 0), '序号')
  eq('E2 表头 B1', at(0, 1), '领域')
  eq('E3 表头 C1', at(0, 2), '变化类型')
  eq('E4 表头 D1', at(0, 3), '旧法（2018年修订，已废止）')
  eq('E5 表头 E1', at(0, 4), '新法（2021年发布，现行有效）')
  eq('E6 表头 F1', at(0, 5), '变化说明')
  eq('E7 行2 仅 B2 有值', at(1, 1), '一、法律名称与总则')
  eq('E8 A3 数值', at(2, 0), '1')
  eq('E9 B3', at(2, 1), '法律名称')
  eq('E10 C3', at(2, 2), '修改')
  ok('E11 首行六格齐', (blk.rows.find((x) => x.r === 0)?.cells.length ?? 0) === 6)
  const full = (await engine.call('xlsx.block', [0, 0, 103])) as { rows: { r: number }[] }
  // 行 1..103 连续（unzip 实测）→ 每行都在，不缺行
  eq('E12 全表行数 ≡ dimension', full.rows.length, 103)
  eq('E13 末行 r=103', full.rows[full.rows.length - 1]?.r, 102)
  const hits = (await engine.call('xlsx.find', [0, '噪声'])) as { r: number; c: number }[]
  ok('E14 全文检索命中', Array.isArray(hits) && hits.length > 10, `hits=${hits.length}`)

  // ── F. 编辑往返 + 持久化（保存链不得吞数据）──
  // 写入格选 C3（s=4 已有样式）：block 不返回「无值且无样式」的格，空样式格断言必假败
  const MARK = 'x25 探针写入'
  await engine.call('xlsx.set', [0, [{ r: 2, c: 2, input: MARK }]])
  const back = (await engine.call('xlsx.cell', [0, 2, 2])) as { value: string }
  eq('F1 写入读回', back.value, MARK)
  const saved = (await engine.call('save', [])) as Blob
  ok('F2 保存字节非空', saved.size > 1000, `size=${saved.size}`)

  const re = mkEngine()
  await re.engine.open(saved, { name: 'resaved.xlsx' })
  await re.engine.call('xlsx.load', [0])
  const reSlot = await re.wait(0)
  eq('F3 重开 rows 存活', reSlot.header?.rows, 103)
  eq('F4 重开 cols 存活', reSlot.header?.cols, 6)
  eq('F5 重开 colInfo 段数', reSlot.header?.colInfo?.length, 5)
  eq('F6 重开冻结存活', reSlot.header?.frozen?.rows, 1)
  const reBlk = (await re.engine.call('xlsx.block', [0, 0, 4])) as { rows: { r: number; cells: unknown[][] }[] }
  const reAt = (ri: number, ci: number): unknown => {
    const row = reBlk.rows.find((x) => x.r === ri)
    const cell = row?.cells.find((c) => c[0] === ci) as unknown[] | undefined
    return cell ? cell[1] : null
  }
  eq('F7 重开表头 A1', reAt(0, 0), '序号')
  eq('F8 重开表头 E1', reAt(0, 4), '新法（2021年发布，现行有效）')
  eq('F9 重开写入格', reAt(2, 2), MARK)
  const reFull = (await re.engine.call('xlsx.block', [0, 0, 103])) as { rows: unknown[] }
  eq('F10 重开全表行数', reFull.rows.length, 103)

  return { ok: errs.length === 0, errors: errs, dump }
}

let cached: Promise<Record<string, unknown>> | null = null
function result(): Promise<Record<string, unknown>> {
  if (!cached) cached = run().catch((e) => ({ ok: false, errors: [`threw: ${e}`] }))
  return cached
}

registerSmokeMode('x25', () => {
  ;(window as any).__smoke.x25 = { result }
  return () => h('div', { style: 'width:100%;height:100%' }, 'x25 真实 xlsx 打开链路回归门')
})
