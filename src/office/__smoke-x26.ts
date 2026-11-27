/**
 * x26 探针（报障回归门之二，?mode=x26）：真实 xlsx 走 **DocumentClient → inline Worker**。
 *
 * 为什么单独立一个：x25 用主线程 `new Engine`，52-mode 全绿；App 真路径却是 Worker
 * （default-worker → `?worker&inline`）。Worker 全局没有 window/document，字体链
 * installShims 首行 `const w = window as any` 即抛，错被 loadSheet 的 catch 咽进
 * progress.error → 数据区全空、Ctrl+A 只剩 A1——正是用户报障形态。
 * 主线程探针永远测不到这一类故障，故本探针把 Worker 通道钉进回归门。
 *
 * 断言口径与 x25 同源（unzip 实测：sheet1 A1:F103、表头六格、sst 374 条）。
 * 顶层只注册 mode；结果挂 window.__smoke.x26。
 */
import { h } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import { DocumentClient } from './client'

type Prog = {
  sheet: number; rows: number; cols: number; done: boolean; error?: string
  colInfo?: { min: number; max: number; w: number }[]
  frozen?: { rows?: number; cols?: number }
  defaultColW?: number
}

async function run(): Promise<Record<string, unknown>> {
  const errs: string[] = []
  const ok = (name: string, cond: unknown, extra = '') => {
    if (!cond) errs.push(`${name}${extra ? ' → ' + extra : ''}`)
  }
  const eq = (name: string, actual: unknown, expect: unknown) =>
    ok(name, actual === expect, `actual=${JSON.stringify(actual)} expect=${JSON.stringify(expect)}`)

  const resp = await fetch('real-noise.xlsx')
  ok('A1 fixture 可取', resp.ok, `HTTP ${resp.status}`)
  const blob = await resp.blob()

  // 不传 worker:false → 走 default-worker 注册的 inline Worker（与 App 完全同路）
  const got = new Map<number, { header: Prog | null; done: Prog | null }>()
  let client: DocumentClient | null = null
  let openErr = ''
  try {
    client = await DocumentClient.open(blob, { name: 'real-noise.xlsx' })
  } catch (e) {
    openErr = String(e)
  }
  ok('A2 Worker 通道 open 不抛', !openErr, openErr)
  if (!client) return { ok: false, errors: errs, openErr }
  const c = client
  ok('A3 kind = xlsx', c.info.kind === 'xlsx', String(c.info.kind))
  eq('B1 表数', c.info.xlsx!.sheets.length, 3)
  eq('B2 表名序', JSON.stringify(c.info.xlsx!.sheets.map((s) => s.name)),
    JSON.stringify(['两版噪声法逐条对比', '统计汇总', '十大核心变化']))

  c.on('xlsx:progress', (p) => {
    const q = p as Prog
    const slot = got.get(q.sheet) ?? { header: null, done: null }
    if (!slot.header && q.colInfo) slot.header = q
    if (q.done) slot.done = q
    got.set(q.sheet, slot)
  })

  await c.call('xlsx.load', 0)
  for (let i = 0; i < 400 && !got.get(0)?.done; i++) await new Promise((r) => setTimeout(r, 50))
  const slot = got.get(0)
  ok('C1 收到 progress 帧', !!slot?.done, `got=${JSON.stringify([...got.keys()])}`)
  ok('C2 装载无错误', !slot?.done?.error, slot?.done?.error ?? '')
  eq('C3 rows ≡ dimension 103', slot?.done?.rows, 103)
  eq('C4 cols ≡ dimension 6', slot?.done?.cols, 6)
  eq('C5 colInfo 段数', slot?.header?.colInfo?.length, 5)
  ok('C6 默认列宽已度量', !!slot?.header?.defaultColW && slot.header.defaultColW > 0,
    String(slot?.header?.defaultColW))

  const st = (await c.call('xlsx.stats', 0)) as { rows: number; cols: number }
  eq('C7 stats.rows（Ctrl+A 基准）', st.rows, 103)
  eq('C8 stats.cols（Ctrl+A 基准）', st.cols, 6)

  const blk = (await c.call('xlsx.block', 0, 0, 4)) as { rows: { r: number; cells: unknown[][] }[] }
  const at = (ri: number, ci: number): unknown => {
    const row = blk.rows.find((x) => x.r === ri)
    const cell = row?.cells.find((x) => x[0] === ci) as unknown[] | undefined
    return cell ? cell[1] : null
  }
  eq('D1 表头 A1', at(0, 0), '序号')
  eq('D2 表头 E1', at(0, 4), '新法（2021年发布，现行有效）')
  eq('D3 B3 法律名称', at(2, 1), '法律名称')
  eq('D4 A3 数值 1', at(2, 0), '1')

  // 其余两表同样要出数据（多表工作簿逐表装载）
  for (const i of [1, 2]) {
    await c.call('xlsx.load', i)
    for (let k = 0; k < 400 && !got.get(i)?.done; k++) await new Promise((r) => setTimeout(r, 50))
    const s2 = got.get(i)
    ok(`E${i}.1 sheet[${i}] 无错误`, !s2?.done?.error, s2?.done?.error ?? '')
    eq(`E${i}.2 sheet[${i}] rows`, s2?.done?.rows, i === 1 ? 8 : 11)
    eq(`E${i}.3 sheet[${i}] cols`, s2?.done?.cols, 3)
  }

  await c.call('xlsx.set', 0, [{ r: 2, c: 2, input: 'x26 写入' }])
  const back = (await c.call('xlsx.cell', 0, 2, 2)) as { value: string }
  eq('F1 写入读回', back.value, 'x26 写入')
  const saved = await c.call('save')
  ok('F2 保存非空', saved.size > 1000, `size=${saved.size}`)
  c.destroy()
  return { ok: errs.length === 0, errors: errs }
}

let cached: Promise<Record<string, unknown>> | null = null
function result(): Promise<Record<string, unknown>> {
  if (!cached) cached = run().catch((e) => ({ ok: false, errors: [`threw: ${e}`] }))
  return cached
}

registerSmokeMode('x26', () => {
  ;(window as any).__smoke.x26 = { result }
  return () => h('div', { style: 'width:100%;height:100%' }, 'x26 真实 xlsx × inline Worker 通道回归门')
})
