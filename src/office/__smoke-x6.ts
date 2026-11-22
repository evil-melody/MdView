/**
 * x6 探针（第七批，?mode=x6）：Excel ribbon 全量还原 —— 结构 1:1 + 每按钮接线 + 实际行为。
 *
 * 断言分三组：
 *  1) 结构：8 个页签 / 组名 / 组内按钮标签与冻结的对照表一致（顺序也算）。
 *  2) 接线：不存在「可点击 + 命令名不在视图 commands 里 + 未标 disabled」的按钮；
 *           每个 disabled 的按钮都带「不支持：<原因>」的 title。
 *  3) 行为：真的点几个 A 级命令（复制/粘贴、缩进、页面设置、定义名称、保护工作表），
 *           落盘重开后检查 OOXML 里确实写了 pageSetup / pageMargins / sheetProtection / definedNames。
 */
import { h, reactive, nextTick } from 'vue'
import { registerSmokeMode, getSmokeMode } from './smoke-modes'
import OfficeSheetView from './components/OfficeSheetView.vue'
import OfficeToolbar from './components/OfficeToolbar.vue'
import { Engine } from './core/worker/engine'
import { writeZip } from './core/zipwrite'
import { ZipArchive } from './core/zip'
import { BlobSource } from './core/source'
import { RIBBON, type Item, type Tab } from './ribbon'

const XMAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKGREL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CTREL = 'application/vnd.openxmlformats-package.relationships+xml'
const CTWB = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
const CTWS = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'
const CTST = 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

/** 最小完整 xlsx：给探针一个可编辑的工作簿 */
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

const state = reactive({ ready: false, client: null as any, info: null as any, view: null as any, engine: null as any })
const viewErrors: string[] = []
/** 工具栏要拿到真实 commands / bar（视图挂载后才拿得到） */
const holder = reactive({ commands: undefined as any, bar: undefined as any })

/** 按钮的命令名（btn → act.cmd；menu/color → cmd；toggle → key） */
function cmdOf(it: Item): string {
  const x = it as { act?: { cmd?: string }; cmd?: string; key?: string }
  return x.act?.cmd ?? x.cmd ?? x.key ?? ''
}
/** 按钮是否 B 级（灰显） */
const isOff = (it: Item) => (it as { disabled?: boolean }).disabled === true
/** 去掉分隔符后的按钮 */
const buttonsOf = (items: Item[]) => items.filter((it) => it.t !== 'sep')


/**
 * 对照表（冻结）：截图上的 8 个页签 → 组名 → 组内按钮标签（顺序 = 截图顺序）。
 * 这张表是结构 1:1 还原的验收基准，与 src/office/ribbon.ts 的实现相互独立。
 */
const EXPECT: { id: string; label: string; groups: [string, string[]][] }[] = [
  { id: 'home', label: '开始', groups: [
    ['剪贴板', ['粘贴', '剪切', '复制', '格式刷']],
    ['字体', ['字体', '字号', '增大字号', '减小字号', 'B', 'I', 'U', 'S', '字体色', '填充色', '边框色', '边框', '线型']],
    ['对齐', ['顶端对齐', '垂直居中', '底端对齐', '左对齐', '居中', '右对齐', '减少缩进', '增加缩进', '合并后居中', '自动换行', '旋转']],
    ['数字', ['数字格式', '常规', '自定义…', '会计专用格式', '百分比', '千分位', '增加小数位', '减少小数位']],
    ['样式', ['条件格式', '突出显示单元格规则', '套用表格样式', '单元格样式']],
    ['单元格', ['插入行', '插入列', '删除行', '删除列', '行高', '列宽', '格式', '隐藏', '取消隐藏', '合并后居中']],
    ['编辑', ['自动求和', '填充', '清除内容', '清除格式', '升序', '降序', '查找', '替换', '定位']],
  ]},
  { id: 'insert', label: '插入', groups: [
    ['表格', ['数据透视表', '建议的数据透视表', '表格', '迷你图', '切片器', '日程表']],
    ['插图', ['图片', '形状', '图标', '3D 模型', 'SmartArt', '筛选截图', '建议图表', '地图', '数据透视图']],
    ['链接', ['链接']],
    ['文本', ['批注', '新建注释', '文本框', '页眉和页脚', '对象', '公式']],
    ['符号', ['符号']],
  ]},
  { id: 'draw', label: '绘图', groups: [
    ['绘图', ['绘图', '橡皮擦', '套索选择', '荧光笔 黄', '荧光笔 绿', '荧光笔 蓝', '荧光笔 粉', '添加笔', '使用触控板绘图']],
  ]},
  { id: 'layout', label: '页面布局', groups: [
    ['主题', ['主题', '颜色', '字体']],
    ['页面设置', ['页边距', '方向', '大小', '打印区域', '分隔符', '背景', '打印标题', '页面设置']],
    ['工作表选项', ['宽度自动', '高度自动', '网格线']],
  ]},
  { id: 'formulas', label: '公式', groups: [
    ['函数库', ['插入函数', '自动求和', '最近使用', '财务', '逻辑', '文本', '日期和时间', '查找和引用', '数学和三角', '其他函数']],
    ['名称管理器', ['名称管理器', '定义名称', '隐藏', '取消隐藏']],
    ['公式审核', ['在公式中使用', '追踪引用单元格', '追踪从属单元格', '删除箭头', '显示公式', '错误检查']],
    ['计算', ['监视窗口', '计算选项', '立即计算', '计算工作表']],
  ]},
  { id: 'data', label: '数据', groups: [
    ['获取数据', ['获取数据', '全部刷新', '属性', '查询和连接', '工作簿连接']],
    ['排序和筛选', ['排序', '筛选', '清除']],
    ['数据工具', ['数据验证', '合并', '取消合并', '汇总']],
    ['数据分析', ['数据透视表', '分析工具', '组合', '取消组合']],
    ['汇总', ['分类汇总', '隐藏', '拆分工具']],
  ]},
  { id: 'review', label: '审阅', groups: [
    ['校对', ['拼写', '同义词', '工作簿统计信息']],
    ['易读性', ['检查辅助功能', '智能查找', '翻译']],
    ['批注', ['新建注释', '删除注释', '上一条', '下一条', '显示所有批注', '隐藏批注']],
    ['保护', ['保护工作表', '保护工作簿', '始终以只读方式打开', '限制权限', '隐藏墨迹']],
  ]},
  { id: 'view', label: '视图', groups: [
    ['工作簿视图', ['普通', '分页预览', '页面布局', '自定义视图']],
    ['显示', ['标尺', '网格线', '编辑栏']],
    ['缩放', ['缩放', '100%', '缩放到所选比例']],
    ['窗口', ['新建窗口', '全部重排', '拆分', '冻结窗格', '隐藏', '取消隐藏', '切换窗口']],
    ['工作表', ['新建', '删除', '重命名', '左移', '右移', '隐藏', '取消隐藏', '切换']],
    ['宏', ['录制宏', '查看宏', '使用相对引用']],
  ]},
]

/** 结构断言：8 个页签 / 组名 / 按钮标签（顺序 + 集合） */
function structureAsserts(tabs: Tab[]): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  out.tabCountIs8 = tabs.length === 8
  out.tabIdsMatch = tabs.length === EXPECT.length && tabs.every((t, i) => t.id === EXPECT[i].id)
  out.tabLabelsMatch = tabs.length === EXPECT.length && tabs.every((t, i) => t.label === EXPECT[i].label)
  let groupsOk = true
  let labelsOk = true
  let orderOk = true
  for (let i = 0; i < Math.min(tabs.length, EXPECT.length); i++) {
    const got = tabs[i].groups
    const want = EXPECT[i].groups
    if (got.length !== want.length) { groupsOk = false; continue }
    for (let j = 0; j < got.length; j++) {
      if (got[j].name !== want[j][0]) groupsOk = false
      const gl = buttonsOf(got[j].items).map((it) => (it as { label: string }).label)
      const wl = want[j][1]
      if (gl.length !== wl.length) { labelsOk = false; continue }
      const gs = [...gl].sort().join('|')
      const ws = [...wl].sort().join('|')
      if (gs !== ws) labelsOk = false
      if (gl.join('|') !== wl.join('|')) orderOk = false
    }
  }
  out.groupNamesMatch = groupsOk
  out.buttonLabelsMatch = labelsOk
  out.buttonOrderMatch = orderOk
  const total = tabs.reduce((n, t) => n + t.groups.reduce((m, g) => m + buttonsOf(g.items).length, 0), 0)
  out.buttonTotalIs193 = total === 193
  return out
}

/** 接线断言：可点击 ⇒ 命令在视图 commands 里；disabled ⇒ 带「不支持：<原因>」 */
function wiringAsserts(tabs: Tab[], commands: Record<string, (...a: any[]) => unknown>): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  let unwired = 0
  let noReason = 0
  let disabled = 0
  let wired = 0
  const missing: string[] = []
  for (const tab of tabs) {
    for (const g of tab.groups) {
      for (const it of buttonsOf(g.items)) {
        const cmd = cmdOf(it)
        const off = isOff(it)
        if (off) {
          disabled++
          const title = (it as { title?: string }).title ?? ''
          if (!title.startsWith('不支持：') || title.length <= '不支持：'.length) { noReason++; missing.push(`${tab.id}/${(it as any).label}: ${title}`) }
          continue
        }
        if (typeof commands[cmd] !== 'function') { unwired++; missing.push(`${tab.id}/${(it as any).label} → ${cmd}`) }
        else wired++
      }
    }
  }
  out.everyClickableIsWired = unwired === 0
  out.everyDisabledExplains = noReason === 0
  out.hasAandBLevels = wired > 100 && disabled > 10
  out.missing = missing as any
  return out
}

/** DOM 断言：工具栏里 A 级可点、B 级灰显 + title 说明 */
async function domAsserts(tabs: Tab[]): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {}
  const tabEls = [...document.querySelectorAll<HTMLElement>('.ot-tab')]
  out.domTabCountIs8 = tabEls.length === 8
  let offRendered = 0
  let offOk = 0
  let onRendered = 0
  let onOk = 0
  for (let i = 0; i < Math.min(tabEls.length, EXPECT.length); i++) {
    tabEls[i].click()
    await nextTick()
    await wait(40)
    const groupEls = [...document.querySelectorAll<HTMLElement>('.ot-group')]
    const want = EXPECT[i].groups
    for (let j = 0; j < Math.min(groupEls.length, want.length); j++) {
      const btnEls = [...groupEls[j].querySelectorAll<HTMLButtonElement>('.ot-group-items > .ot-btn')]
      const items = buttonsOf(tabs[i].groups[j]?.items ?? [])
      for (let k = 0; k < Math.min(btnEls.length, items.length); k++) {
        const it = items[k]
        const el = btnEls[k]
        if (isOff(it)) {
          offRendered++
          const title = el.getAttribute('title') ?? ''
          if (el.disabled && title.startsWith('不支持：')) offOk++
        } else {
          onRendered++
          if (!el.disabled) onOk++
        }
      }
    }
  }
  out.domDisabledRendered = offRendered > 0 && offRendered === offOk
  out.domClickableEnabled = onRendered > 0 && onRendered === onOk
  return out
}

/** 行为断言：真点几个 A 级命令，再落盘重开检查 OOXML */
async function behaviorAsserts(commands: Record<string, (...a: any[]) => unknown>, engine: any, dbg: any): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {}
  const mark = (s: string) => { dbg.stage = s }
  const cell = async (r: number, c: number) => (await engine.call('xlsx.cell', [0, r, c])) as any
  /** 用名称框跳到某格（视图的选择入口） */
  const goto = async (addr: string) => {
    const box = document.querySelector<HTMLInputElement>('.ov-name-box')
    if (!box) return false
    box.focus()
    box.value = addr
    box.dispatchEvent(new Event('input', { bubbles: true }))
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    box.blur()
    await wait(120)
    return true
  }

  // 1) 复制 → 粘贴（A 级，走真实 RPC）
  mark('set-hello')
  await engine.call('xlsx.set', [0, [{ r: 0, c: 0, input: 'hello' }]])
  await wait(200)
  mark('goto-A1')
  const wentA1 = await goto('A1')
  dbg.wentA1 = wentA1
  mark('copyRange')
  await commands.copyRange()
  mark('goto-B2')
  await goto('B2')
  mark('pasteRange')
  await commands.pasteRange()
  await wait(250)
  const b2 = await cell(1, 1)
  dbg.b2 = b2
  out.copyPasteWorks = String(b2?.value ?? '') === 'hello'

  // 2) 缩进（内核 alignment@indent）
  mark('indent')
  await goto('A1')
  await commands.indent(1)
  await wait(200)
  out.indentApplied = true

  // 3) 页面设置（写进 sheet 的 pageSetup / pageMargins）
  mark('pageSetup')
  await commands.pageSetup({ paper: 9, orientation: 'landscape', margins: { top: 54, right: 50.4, bottom: 54, left: 50.4 } })
  await wait(250)

  // 4) 定义名称（名称管理器 + workbook.xml 的 definedNames）
  // officePrompt 会一直 await 到输入框被应答；必须先发起命令（不 await），
  // 再去 DOM 里应答两个连续弹窗，最后 await 命令 Promise —— 否则会死锁。
  mark('defineName')
  const answer = (val: string) => {
    const el = document.querySelector<HTMLInputElement>('.op-prompt-input')
    if (!el) return false
    el.value = val
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    return true
  }
  const namePromise = commands.defineName() as Promise<unknown>
  await wait(120)
  dbg.promptOpen = answer('ProbeName')
  await wait(150)
  dbg.promptOpen2 = answer('Sheet1!$A$1:$B$2')
  await namePromise
  await wait(200)
  const names = (await engine.call('xlsx.names', [])) as { name: string }[]
  dbg.names = names
  out.defineNameSaved = names.some((n) => n.name === 'ProbeName')

  // 5) 保护工作表（sheetProtection）
  mark('sheetProtect')
  await commands.sheetProtect(true)
  await wait(250)

  // 6) 统计信息 RPC
  mark('statsRpc')
  const stats = (await engine.call('xlsx.stats', [0])) as { rows: number; cols: number; cells: number }
  dbg.stats = stats
  out.statsRpcWorks = stats.rows >= 1 && stats.cells >= 1

  // 7) 财务函数（内核新增 PMT 等）
  mark('finance')
  await engine.call('xlsx.set', [0, [{ r: 5, c: 0, input: '=PMT(0.05,10,10000)' }]])
  await wait(250)
  const pmt = await cell(5, 0)
  dbg.pmt = pmt
  out.financeFunctionWorks = typeof pmt?.value === 'string' && Math.abs(Number(pmt.value) + 1295.046) < 0.01

  // 8) 落盘重开：用 ZipArchive 解压 save 结果，检查 OOXML 里真的写了
  //    pageSetup / pageMargins / sheetProtection / definedNames / indent。
  mark('save')
  try {
    const blob: Blob = await engine.call('save', [])
    dbg.savedBytes = blob.size
    const zip = await ZipArchive.open(new BlobSource(blob))
    const sheetXml = await zip.text('xl/worksheets/sheet1.xml')
    const wbXml = await zip.text('xl/workbook.xml')
    const stylesXml = await zip.text('xl/styles.xml')
    dbg.sheetXml = sheetXml
    dbg.wbXml = wbXml
    dbg.stylesXml = stylesXml
    out.pageSetupInXml = /paperSize="9"/.test(sheetXml) && /orientation="landscape"/.test(sheetXml) && /<[a-z]*:?pageMargins/.test(sheetXml)
    out.sheetProtectionInXml = /sheetProtection/.test(sheetXml)
    out.definedNameInXml = /ProbeName/.test(wbXml)
    // indent 落在 styles.xml 的 cellXfs/alignment 上（sheet 单元格只带 s="样式索引"）
    out.indentInXml = /indent="1"/.test(stylesXml)
  } catch (e) {
    dbg.saveErr = String(e) + ' @ ' + String((e as Error)?.stack ?? '')
    out.pageSetupInXml = false
    out.sheetProtectionInXml = false
    out.definedNameInXml = false
    out.indentInXml = false
  }
  return out
}

async function x6Probe() {
  const R: any = ((window as any).__smoke.x6 = { asserts: {}, dom: {}, behavior: {}, ready: false, done: false, error: null })
  try {
    const handlers: Record<string, (p: unknown) => void> = {}
    const { engine, info } = await openEngine(handlers)
    state.client = {
      call: (m: string, ...args: unknown[]) => (engine as any).call(m, args),
      on: (ev: string, fn: (p: unknown) => void) => { handlers[ev] = fn; return () => { delete handlers[ev] } },
      mediaUrl: (p: string) => (engine as any).call('part', [p]).then((b: Blob) => URL.createObjectURL(b as Blob)),
    } as any
    state.engine = engine
    state.info = info
    state.ready = true
    R.ready = true
    for (let i = 0; i < 60; i++) {
      if (holder.commands) break
      await wait(100)
    }
    const commands = holder.commands ?? {}
    // 逐按钮清单（供 task-007 报告的「截图组 → 按钮 → A/B → 命令名 → 备注」对照表使用）
    R.dump = []
    for (const tab of RIBBON.xlsx) {
      for (const grp of tab.groups) {
        for (const it of buttonsOf(grp.items)) {
          const off = isOff(it)
          const title = (it as { title?: string }).title ?? ''
          R.dump.push({
            tab: tab.label,
            group: grp.name,
            label: (it as { label: string }).label,
            level: off ? 'B' : 'A',
            cmd: off ? '' : cmdOf(it),
            reason: off ? title.replace(/^不支持：/, '') : '',
          })
        }
      }
    }
    R.stage = 'structure'
    R.asserts = structureAsserts(RIBBON.xlsx)
    R.asserts = { ...R.asserts, ...wiringAsserts(RIBBON.xlsx, commands) }
    R.stage = 'dom'
    R.dom = await domAsserts(RIBBON.xlsx)
    R.stage = 'behavior'
    R.behaviorDbg = {}
    R.behavior = await behaviorAsserts(commands, engine, R.behaviorDbg)
    R.stage = 'finished'
    R.viewErrors = [...viewErrors]
    R.done = true
  } catch (e) {
    R.error = String(e) + ' @ ' + String((e as Error)?.stack ?? '')
    R.done = true
  }
}

let kicked = false
function x6View() {
  if (!kicked) { kicked = true; void x6Probe() }
  return () =>
    state.ready && state.client
      ? h('div', { style: 'height:100vh;display:flex;flex-direction:column;min-height:0' }, [
          h(OfficeToolbar, { kind: 'xlsx', editable: true, commands: holder.commands, bar: holder.bar }),
          h(OfficeSheetView, {
            ref: (el: any) => {
              state.view = el
              holder.commands = el?.commands
              holder.bar = el?.bar
            },
            client: state.client, editable: true, info: state.info,
            onError: (m: string) => { viewErrors.push(m) },
          })
        ])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
}
// 注册前查重：mode 名撞车时 registerSmokeMode 会保留先注册者（我的探针将不生效）——必须提醒
if (getSmokeMode('x6')) console.error('[smoke] mode x6 已被注册，本探针不会生效，请改名')
registerSmokeMode('x6', x6View)
