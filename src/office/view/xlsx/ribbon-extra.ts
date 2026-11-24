/**
 * Excel ribbon 的 A 级命令（视图侧）：第七批新增的行为都收在这里。
 *
 * 由 OfficeSheetView 用一行 `Object.assign(commands, makeRibbonExtra(...))` 并进 commands，
 * 这样视图文件不会突破 2000 行上限。命令分三类落地方式：
 *   - 内核 RPC：真的改数据（复制粘贴、页面设置、定义名称、保护、注释…）；
 *   - DOM：视图没有对应状态开关的功能（标尺、编辑栏、显示公式、视图模式、拆分窗格、追踪箭头…）；
 *   - 纯计算：统计、拼写检查、错误检查。
 */
import { officePrompt, officeAlert } from '../../components/officePrompt'
import type { FmtPatch, XlsxPageSetup } from '../../core/xlsx/types'
import type { Opt } from '../../ribbon'

export interface RibbonRange {
  r0: number
  c0: number
  r1: number
  c1: number
}

export interface RibbonCtx {
  /** worker RPC 通道 */
  call: (m: string, ...args: unknown[]) => Promise<any>
  /** 工具栏可见状态（视图的 reactive bar） */
  bar: Record<string, any>
  /** 当前工作表下标 */
  sheet: () => number
  /** 当前选区（已吸附合并区） */
  range: () => RibbonRange
  /** 活动单元格 */
  sel: () => { r: number; c: number }
  /** 选中某个单元格（视图内部的选择函数） */
  select: (r: number, c: number) => void
  /** 可视区（显示公式按可视区取公式） */
  visible: () => { r0: number; r1: number; c0: number; c1: number }
  /** 格式补丁（转发视图已有的 format） */
  fmt: (patch: FmtPatch) => void
  /** 合并单元格（转发视图已有的 merge） */
  merge: (mode: string) => void
  /** 冻结窗格（转发视图已有的 freeze） */
  freeze: (k: string) => void
  /** 缩放（转发视图已有的 setZoom） */
  setZoom: (z: number) => void
  /** 重算当前表（转发视图已有的 recalc） */
  recalc: () => void
  /** 重新载入可见区域 */
  reload: () => void
  /** 变更通知（宿主据此提示可保存） */
  changed: () => void
  /** 全部工作表（含隐藏） */
  allSheets: () => { index: number; name: string; path: string; hidden: boolean }[]
  /** 全表数据（统计 / 拼写检查用） */
  readAll: () => Promise<{ m: string[][]; lastR: number; lastC: number }>
}

/** 列号 → 列字母（A / AA …） */
function colName(c: number): string {
  let s = ''
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}
const a1 = (r: number, c: number) => `${colName(c)}${r + 1}`

const q = <T extends Element>(sel: string) => document.querySelector<T>(sel)
const qa = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)]
const cellEl = (r: number, c: number) => q<HTMLElement>(`.ov-cell[data-cell-r="${r}"][data-cell-c="${c}"]`)

/** Excel 的字号阶梯（增大 / 减小字号按这张表走） */
const SIZE_LADDER = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]

/** 内置的小词典：拼写检查用它 + 工作簿自洽比对（不是完整词典，边界见报告） */
const WORDS = new Set(
  ('about after again all also and any are back because been before being between both but came can come could day did different do does down each even ' +
    'first for from get give go good have he her here him his how if into it its just know like look make man many may me more most my new no not now of on ' +
    'one only or other our out over people said same see she should so some take than that the their them then there these they this those time to two up us use ' +
    'was way we well were what when which who will with would year you your data name value total count sum average number result report table column row cell ' +
    'file list item text price amount quantity note status date order type group index sheet work book open save close print view edit help menu button')
    .split(' ')
)

/** 内部剪贴板（复制 / 剪切 / 粘贴） */
let clip: { cells: { r: number; c: number; input: string }[]; w: number; h: number } | null = null
/** 显示公式：公式文本 + 观察器（单元格重绘后重新贴回） */
let formulaMap = new Map<string, string>()
let cellObserver: MutationObserver | null = null

/** 把「显示公式」的文本贴回网格（只在开启时贴） */
function patchFormulaCells(ctx: RibbonCtx): void {
  if (!ctx.bar.showFormulas) return
  for (const el of qa<HTMLElement>('.ov-cell[data-cell-r]')) {
    const span = el.querySelector('span')
    if (!span) continue
    const key = `${el.dataset.cellR}:${el.dataset.cellC}`
    const f = formulaMap.get(key)
    if (f !== undefined) {
      if (span.dataset.ovOrig === undefined) span.dataset.ovOrig = span.textContent ?? ''
      if (span.textContent !== f) span.textContent = f
    } else if (span.dataset.ovOrig !== undefined) {
      const back = span.dataset.ovOrig
      delete span.dataset.ovOrig
      if (span.textContent !== back) span.textContent = back
    }
  }
}

/** 追踪箭头：给被引用的单元格加一个高亮类 */
function markCells(cells: { r: number; c: number }[], on: boolean): void {
  for (const el of qa<HTMLElement>('.ov-cell[data-cell-r]')) {
    const r = Number(el.dataset.cellR)
    const c = Number(el.dataset.cellC)
    const hit = cells.some((x) => x.r === r && x.c === c)
    if (hit === on) continue
    el.classList.toggle('ov-trace', hit)
    el.classList.toggle('ov-trace-hit', !hit && on)
  }
}

/** 公式里的单元格引用（A1 / $A$1 / Sheet1!A1） */
function refsOf(formula: string): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = []
  const re = /(?:'[^']+'!|[A-Za-z_][A-Za-z0-9_]*!)?\$?([A-Z]{1,3})\$?(\d{1,7})/g
  for (let m = re.exec(formula); m; m = re.exec(formula)) {
    const c = m[1].split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1
    const r = Number(m[2]) - 1
    if (r >= 0 && c >= 0) out.push({ r, c })
  }
  return out
}

/** 读一个单元格的输入文本（公式优先） */
async function cellInput(ctx: RibbonCtx, r: number, c: number): Promise<string> {
  const d = await ctx.call('xlsx.cell', ctx.sheet(), r, c)
  if (!d) return ''
  return String(d.formula || d.value || '')
}

/** 全部 A 级命令 */
export function makeRibbonExtra(ctx: RibbonCtx): Record<string, (...args: any[]) => unknown> {
  const g = () => ctx.range()

  /** 页面设置：把 ribbon 的参数换成内核的 XlsxPageSetup */
  const setupOf = (raw: Record<string, unknown> | undefined): XlsxPageSetup => {
    const s: XlsxPageSetup = {}
    if (!raw) return s
    if (typeof raw.paper === 'number') s.paper = raw.paper
    if (raw.orientation === 'landscape' || raw.orientation === 'portrait') s.orientation = raw.orientation
    // 同时接受扁平（mt/mr/mb/ml、top/right/bottom/left）与嵌套（margins:{...}）两种传法
    const nest = (raw.margins ?? {}) as Record<string, unknown>
    const mt = raw.mt ?? raw.top ?? nest.top
    const mr = raw.mr ?? raw.right ?? nest.right
    const mb = raw.mb ?? raw.bottom ?? nest.bottom
    const ml = raw.ml ?? raw.left ?? nest.left
    if (typeof mt === 'number' || typeof mr === 'number' || typeof mb === 'number' || typeof ml === 'number') {
      s.margins = { top: Number(mt ?? 54), right: Number(mr ?? 50.4), bottom: Number(mb ?? 54), left: Number(ml ?? 50.4) }
    }
    return s
  }
  const applySetup = async (setup: XlsxPageSetup): Promise<string> => {
    await ctx.call('xlsx.sheetOp', ctx.sheet(), { op: 'pageSetup', setup })
    ctx.reload()
    ctx.changed()
    return '页面设置已写入工作表（pageSetup / pageMargins）'
  }

  const cmds: Record<string, (...args: any[]) => unknown> = {
    // ---------------- 剪贴板
    copyRange: async () => {
      const sel = g()
      const cells: { r: number; c: number; input: string }[] = []
      for (let r = sel.r0; r <= sel.r1 && cells.length < 4000; r++) {
        for (let c = sel.c0; c <= sel.c1 && cells.length < 4000; c++) {
          const input = await cellInput(ctx, r, c)
          if (input === '') continue
          cells.push({ r: r - sel.r0, c: c - sel.c0, input })
        }
      }
      clip = { cells, w: sel.c1 - sel.c0 + 1, h: sel.r1 - sel.r0 + 1 }
      return `已复制 ${cells.length} 个单元格`
    },
    cutRange: async () => {
      const sel = g()
      const cells: { r: number; c: number; input: string }[] = []
      for (let r = sel.r0; r <= sel.r1 && cells.length < 4000; r++) {
        for (let c = sel.c0; c <= sel.c1 && cells.length < 4000; c++) {
          const input = await cellInput(ctx, r, c)
          if (input === '') continue
          cells.push({ r: r - sel.r0, c: c - sel.c0, input })
        }
      }
      clip = { cells, w: sel.c1 - sel.c0 + 1, h: sel.r1 - sel.r0 + 1 }
      const clear: { r: number; c: number; input: string }[] = cells.map((x) => ({ r: x.r + sel.r0, c: x.c + sel.c0, input: '' }))
      if (clear.length) await ctx.call('xlsx.set', ctx.sheet(), clear)
      ctx.reload()
      ctx.changed()
      return `已剪切 ${cells.length} 个单元格`
    },
    pasteRange: async () => {
      if (!clip || !clip.cells.length) return '剪贴板为空'
      const sel = g()
      const put = clip.cells.map((x) => ({ r: sel.r0 + x.r, c: sel.c0 + x.c, input: x.input }))
      await ctx.call('xlsx.set', ctx.sheet(), put)
      ctx.reload()
      ctx.changed()
      return `已粘贴 ${put.length} 个单元格`
    },

    // ---------------- 字体 / 对齐
    fontSizeStep: (delta: number) => {
      const { r, c } = ctx.sel()
      const el = cellEl(r, c)
      let cur = 11
      if (el) {
        const px = parseFloat(getComputedStyle(el).fontSize || '')
        if (Number.isFinite(px) && px > 0) cur = Math.round((px * 0.75) * 10) / 10
      }
      const ladder = SIZE_LADDER
      let next = cur
      if (delta > 0) next = ladder.find((v) => v > cur) ?? ladder[ladder.length - 1]
      else for (let i = ladder.length - 1; i >= 0; i--) if (ladder[i] < cur) { next = ladder[i]; break }
      ctx.fmt({ sz: next })
      return `字号 ${cur}pt → ${next}pt`
    },
    indent: (delta: number) => {
      ctx.fmt({ indent: delta })
      return delta > 0 ? '增加缩进一级' : '减少缩进一级'
    },
    mergeCenter: async () => {
      await ctx.merge('all')
      ctx.fmt({ align: 'center' })
      return '已合并单元格并居中'
    },

    // ---------------- 行列
    rowHeightDlg: async () => {
      const v = await officePrompt('行高（像素）', '24', '例如 24')
      if (!v) return ''
      const px = Number(v)
      if (!Number.isFinite(px) || px <= 0) return '行高：请输入正数'
      await ctx.call('xlsx.sheetOp', ctx.sheet(), { op: 'rowHeight', r0: g().r0, r1: g().r1, px })
      ctx.reload()
      ctx.changed()
      return `行高 ${px}px`
    },
    colWidthDlg: async () => {
      // P5：对话框按「字符数」输入（Excel 同款口径）；内核三段式 chars→px 换算
      const v = await officePrompt('列宽（字符数）', '8.43', '例如 12')
      if (!v) return ''
      const chars = Number(v)
      if (!Number.isFinite(chars) || chars <= 0) return '列宽：请输入正数'
      await ctx.call('xlsx.sheetOp', ctx.sheet(), { op: 'colWidthChars', c0: g().c0, c1: g().c1, chars })
      ctx.reload()
      ctx.changed()
      return `列宽 ${chars} 字符`
    },
    autoFitCols: async () => {
      const sel = g()
      // P5：内核 autoFit（wasm 度量 tm.width + 三段式），非 DOM scrollWidth 近似
      await ctx.call('xlsx.sheetOp', ctx.sheet(), { op: 'autoFitCols', c0: sel.c0, c1: sel.c1 })
      ctx.reload()
      ctx.changed()
      return `宽度自动：已调整列 ${sel.c0 + 1}-${sel.c1 + 1}`
    },
    autoFitRows: async () => {
      const sel = g()
      // P5：内核行高自适应（度量 th × \n 段数），非 lines*18+6 启发式
      await ctx.call('xlsx.sheetOp', ctx.sheet(), { op: 'autoFitRows', r0: sel.r0, r1: sel.r1 })
      ctx.reload()
      ctx.changed()
      return `高度自动：已调整行 ${sel.r0 + 1}-${sel.r1 + 1}`
    },

    // ---------------- 定位 / 公式栏
    gotoCell: async () => {
      const v = await officePrompt('定位', 'A1', '例如 B12')
      if (!v) return ''
      const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(v.trim())
      if (!m) return '定位：请输入 A1 形式的地址'
      const c = m[1].toUpperCase().split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1
      const r = Number(m[2]) - 1
      ctx.select(r, c)
      return `已定位到 ${a1(r, c)}`
    },
    useInFormula: () => {
      const { r, c } = ctx.sel()
      const el = q<HTMLInputElement>('.ov-formula-input')
      if (!el) return '编辑栏不可用'
      el.value = `=${a1(r, c)}`
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.focus()
      return `已在公式中使用 ${a1(r, c)}`
    },
    insertFormula: async () => {
      const v = await officePrompt('插入函数', 'SUM', '函数名')
      if (!v) return ''
      const name = v.trim().toUpperCase()
      const el = q<HTMLInputElement>('.ov-formula-input')
      if (el) {
        el.value = `=${name}(`
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.focus()
      }
      return `已插入 ${name}()`
    },
    recentFunctions: (): Opt[] => {
      const key = 'mdview.xlsx.recentFunctions'
      let list: string[] = []
      try {
        const raw = localStorage.getItem(key)
        if (raw) list = JSON.parse(raw) as string[]
      } catch { list = [] }
      if (!list.length) list = ['SUM', 'AVERAGE', 'IF', 'ROUND', 'COUNT', 'MAX', 'MIN', 'TODAY']
      return list.map((f) => ({ label: f, args: [f] }))
    },

    // ---------------- 审核 / 统计
    errorCheck: async () => {
      const hits = (await ctx.call('xlsx.find', ctx.sheet(), '#', {})) as { r: number; c: number; text: string }[]
      const errs = hits.filter((h) => /^#(DIV\/0!|N\/A|NAME\?|NULL!|NUM!|REF!|VALUE!|GETTING_DATA)$/.test(String(h.text).trim()))
      if (!errs.length) return '错误检查：未发现公式错误'
      ctx.select(errs[0].r, errs[0].c)
      const list = errs.slice(0, 40).map((e) => `${a1(e.r, e.c)} ${e.text}`).join('\n')
      await officeAlert('错误检查', `发现 ${errs.length} 处公式错误：\n${list}`)
      return `错误检查：发现 ${errs.length} 处错误`
    },
    wbStats: async () => {
      const st = await ctx.call('xlsx.stats', ctx.sheet())
      const sheets = ctx.allSheets()
      const lines = [
        `工作表：${sheets.length} 个（隐藏 ${sheets.filter((s) => s.hidden).length} 个）`,
        `当前表：${sheets.find((s) => s.index === ctx.sheet())?.name ?? ctx.sheet()}`,
        `已用区域：${st.rows} 行 × ${st.cols} 列`,
        `非空单元格：${st.cells}`,
        `公式单元格：${st.formulas}`
      ]
      await officeAlert('工作簿统计信息', lines.join('\n'))
      return `统计：${st.rows} 行 × ${st.cols} 列，${st.formulas} 个公式`
    },
    spellCheck: async () => {
      const data = await ctx.readAll()
      const seen = new Map<string, number>()
      const texts: { r: number; c: number; text: string }[] = []
      for (let r = 0; r <= data.lastR; r++) {
        const row = data.m[r] ?? []
        for (let c = 0; c <= data.lastC; c++) {
          const t = String(row[c] ?? '').trim()
          if (!t || /^[-+]?[\d.,%]+$/.test(t)) continue
          texts.push({ r, c, text: t })
          for (const w of t.split(/[^A-Za-z']+/)) {
            const k = w.toLowerCase()
            if (k.length >= 3) seen.set(k, (seen.get(k) ?? 0) + 1)
          }
        }
      }
      const issues: string[] = []
      const flagged = new Set<string>()
      for (const t of texts) {
        const words = t.text.split(/[^A-Za-z']+/)
        for (let i = 0; i < words.length; i++) {
          const w = words[i]
          const k = w.toLowerCase()
          if (k.length < 3) continue
          if (WORDS.has(k) || (seen.get(k) ?? 0) > 1) continue
          if (flagged.has(k)) continue
          flagged.add(k)
          issues.push(`${a1(t.r, t.c)}  “${w}”`)
        }
        for (let i = 1; i < words.length; i++) {
          if (words[i] && words[i].toLowerCase() === words[i - 1].toLowerCase() && words[i].length > 1) {
            issues.push(`${a1(t.r, t.c)}  重复词 “${words[i]}”`)
            break
          }
        }
      }
      if (!issues.length) {
        await officeAlert('拼写检查', `检查了 ${texts.length} 个文本单元格，未发现可疑拼写。`)
        return '拼写检查：未发现可疑拼写'
      }
      await officeAlert('拼写检查', `检查了 ${texts.length} 个文本单元格，发现 ${issues.length} 处可疑：\n${issues.slice(0, 60).join('\n')}`)
      return `拼写检查：发现 ${issues.length} 处可疑`
    },

    // ---------------- 计算
    calcNow: async () => {
      const sheets = ctx.allSheets()
      for (const s of sheets) {
        if (s.hidden) continue
        await ctx.call('xlsx.load', s.index)
      }
      ctx.reload()
      ctx.changed()
      return `立即计算：已重算 ${sheets.filter((s) => !s.hidden).length} 个工作表`
    },
    calcSheet: async () => {
      await ctx.recalc()
      return '计算工作表：已重算当前工作表'
    },
    calcMode: (mode: string) => {
      ctx.bar.calcMode = mode
      if (mode === 'auto') void cmds.calcNow()
      return `计算选项：${mode === 'auto' ? '自动' : mode === 'autoNoTable' ? '自动（不含数据表）' : '手动'}`
    },
    refreshAll: async () => {
      const feats = (await ctx.call('xlsx.features', ctx.sheet())) as {
        charts?: { id: number }[]; pivots?: { id: number }[]; series?: { id: number }[]
      }
      let n = 0
      for (const c of feats.charts ?? []) { await ctx.call('xlsx.chartRefresh', ctx.sheet(), c.id); n++ }
      for (const p of feats.pivots ?? []) { await ctx.call('xlsx.pivotRefresh', ctx.sheet(), p.id); n++ }
      for (const s of feats.series ?? []) { await ctx.call('xlsx.seriesRefresh', ctx.sheet(), s.id); n++ }
      ctx.reload()
      ctx.changed()
      return `全部刷新：已刷新 ${n} 个对象`
    },

    // ---------------- 页面设置 / 打印
    pageSetup: async (raw?: Record<string, unknown>) => {
      if (!raw) {
        const v = await officePrompt('页面设置', 'A4 纵向', '例如：A4 横向 / A3 纵向 / Letter 纵向')
        if (!v) return ''
        const t = v.trim()
        const papers: Record<string, number> = { A4: 9, A3: 8, A5: 11, LETTER: 1, LEGAL: 5, B5: 13 }
        const head = t.split(/\s+/)[0].toUpperCase()
        const setup: XlsxPageSetup = { paper: papers[head] ?? 9, orientation: /横向|LANDSCAPE/i.test(t) ? 'landscape' : 'portrait' }
        return applySetup(setup)
      }
      return applySetup(setupOf(raw))
    },
    printArea: async () => {
      const v = await officePrompt('打印区域', '', '例如 A1:C20')
      if (!v) return ''
      const m = /^([A-Za-z]{1,3})(\d+)\s*:\s*([A-Za-z]{1,3})(\d+)$/.exec(v.trim())
      if (!m) return '打印区域：请输入 A1:C20 形式的区域'
      const toC = (s: string) => s.toUpperCase().split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1
      const ref = `${m[1].toUpperCase()}$${m[2]}:${m[3].toUpperCase()}$${m[4]}`
      const sheetName = ctx.allSheets().find((s) => s.index === ctx.sheet())?.name ?? 'Sheet1'
      await ctx.call('xlsx.bookOp', { op: 'defineName', name: '_xlnm.Print_Area', refersTo: `'${sheetName}'!${ref}`, scope: ctx.sheet() })
      ctx.changed()
      return `打印区域：${ref}`
    },
    printTitles: async () => {
      const v = await officePrompt('打印标题（重复打印的行）', '1:1', '例如 1:1')
      if (!v) return ''
      const m = /^(\d+)\s*:\s*(\d+)$/.exec(v.trim())
      if (!m) return '打印标题：请输入 1:1 形式的行区间'
      const sheetName = ctx.allSheets().find((s) => s.index === ctx.sheet())?.name ?? 'Sheet1'
      const ref = `'${sheetName}'!$${m[1]}:$${m[2]}`
      await ctx.call('xlsx.bookOp', { op: 'defineName', name: '_xlnm.Print_Titles', refersTo: ref, scope: ctx.sheet() })
      ctx.changed()
      return `打印标题：${m[1]}:${m[2]}`
    },
    printGridlines: async (on: boolean) => {
      await ctx.call('xlsx.sheetOp', ctx.sheet(), { op: 'pageSetup', setup: { gridLines: on } })
      ctx.reload()
      ctx.changed()
      return on ? '打印网格线：已开启' : '打印网格线：已关闭'
    },
    headerFooter: async () => {
      const h = await officePrompt('页眉（&L 左 &C 中 &R 右）', '', '留空表示不设置')
      if (h === null) return ''
      const f = await officePrompt('页脚（&L 左 &C 中 &R 右）', '', '留空表示不设置')
      if (f === null) return ''
      await ctx.call('xlsx.sheetOp', ctx.sheet(), { op: 'pageSetup', setup: { header: h, footer: f } })
      ctx.reload()
      ctx.changed()
      return '页眉和页脚已写入工作表'
    },

    // ---------------- 保护 / 名称
    sheetProtect: async (on: boolean) => {
      await ctx.call('xlsx.sheetOp', ctx.sheet(), { op: 'pageSetup', setup: { protect: on } })
      ctx.reload()
      ctx.changed()
      return on ? '工作表已保护（只读保护位）' : '工作表保护已取消'
    },
    protectWorkbook: async (on: boolean) => {
      await ctx.call('xlsx.bookOp', { op: 'protectWorkbook', lock: on })
      ctx.changed()
      return on ? '工作簿结构已保护' : '工作簿保护已取消'
    },
    readOnlyRecommended: async (on: boolean) => {
      await ctx.call('xlsx.bookOp', { op: 'readOnlyRecommended', on })
      ctx.changed()
      return on ? '将建议以只读方式打开' : '已取消只读建议'
    },
    hideSheet: async () => {
      await ctx.call('xlsx.bookOp', { op: 'hide', index: ctx.sheet() })
      ctx.reload()
      ctx.changed()
      return '工作表已隐藏'
    },
    unhideSheet: async () => {
      const hidden = ctx.allSheets().filter((s) => s.hidden)
      if (!hidden.length) return '没有隐藏的工作表'
      const v = await officePrompt('取消隐藏工作表', hidden.map((s) => s.name).join(' / '), '要取消隐藏的工作表名')
      if (!v) return ''
      const target = hidden.find((s) => s.name.toLowerCase() === v.trim().toLowerCase())
      if (!target) return `没有找到工作表「${v}」`
      await ctx.call('xlsx.bookOp', { op: 'unhide', index: target.index })
      ctx.reload()
      ctx.changed()
      return `已取消隐藏「${target.name}」`
    },
    defineName: async () => {
      const name = await officePrompt('定义名称', '', '名称（不能用空格）')
      if (!name) return ''
      const refers = await officePrompt('引用', '', '例如 Sheet1!$A$1:$B$9')
      if (!refers) return ''
      await ctx.call('xlsx.bookOp', { op: 'defineName', name: name.trim(), refersTo: refers.trim() })
      ctx.changed()
      return `已定义名称 ${name.trim()}`
    },
    nameManager: async () => {
      const names = (await ctx.call('xlsx.names')) as { name: string; refersTo: string; scope?: number }[]
      if (!names.length) {
        await officeAlert('名称管理器', '工作簿里还没有定义名称。')
        return '名称管理器：没有定义名称'
      }
      const lines = names.map((n) => `${n.name}${n.scope !== undefined ? `（工作表 ${n.scope + 1}）` : ''}  →  ${n.refersTo}`)
      await officeAlert('名称管理器', lines.join('\n'))
      return `名称管理器：${names.length} 个名称`
    },

    // ---------------- 批注
    commentAdd: async () => {
      const { r, c } = ctx.sel()
      const sheet = ctx.allSheets().find((s) => s.index === ctx.sheet())
      if (!sheet) return '找不到当前工作表'
      const text = await officePrompt('新建注释', '', '注释内容')
      if (!text) return ''
      const id = `nc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      await ctx.call('comments.set', id, {
        id,
        author: { name: '我', initials: 'W' },
        time: new Date().toISOString(),
        text,
        at: { sheet: sheet.path, r, c }
      })
      ctx.changed()
      return `已在 ${a1(r, c)} 添加注释`
    },
    commentDel: async () => {
      const { r, c } = ctx.sel()
      const sheet = ctx.allSheets().find((s) => s.index === ctx.sheet())
      const list = (await ctx.call('comments.list')) as { id: string; at?: { sheet: string; r: number; c: number } }[]
      const hit = list.find((x) => x.at && x.at.sheet === sheet?.path && x.at.r === r && x.at.c === c)
      if (!hit) return `${a1(r, c)} 没有注释`
      await ctx.call('comments.set', hit.id, null)
      ctx.changed()
      return `已删除 ${a1(r, c)} 的注释`
    },
    commentPrev: async () => cmds.commentStep(-1),
    commentNext: async () => cmds.commentStep(1),
    commentStep: async (delta: number) => {
      const sheet = ctx.allSheets().find((s) => s.index === ctx.sheet())
      const list = (await ctx.call('comments.list')) as { id: string; at?: { sheet: string; r: number; c: number } }[]
      const mine = list.filter((x) => x.at && x.at.sheet === sheet?.path).sort((a, b) => a.at!.r - b.at!.r || a.at!.c - b.at!.c)
      if (!mine.length) return '当前工作表没有注释'
      const cur = mine.findIndex((x) => x.at!.r === ctx.sel().r && x.at!.c === ctx.sel().c)
      const next = mine[(cur + delta + mine.length * 2) % mine.length]
      ctx.select(next.at!.r, next.at!.c)
      return `注释 ${a1(next.at!.r, next.at!.c)}`
    },
    commentList: async () => {
      const list = (await ctx.call('comments.list')) as { id: string; text: string; at?: { sheet: string; r: number; c: number } }[]
      if (!list.length) {
        await officeAlert('批注', '工作簿里还没有批注。')
        return '批注：0 条'
      }
      const lines = list.map((x) => (x.at ? `${a1(x.at.r, x.at.c)}  ${x.text}` : x.text))
      await officeAlert('批注', lines.join('\n'))
      return `批注：${list.length} 条`
    },
    commentHideAll: (on: boolean) => {
      ctx.bar.commentHidden = on
      return on ? '已隐藏全部批注' : '已显示全部批注'
    },

    // ---------------- 视图类（DOM 实现）
    showFormulas: async (on: boolean) => {
      ctx.bar.showFormulas = on
      if (!on) {
        formulaMap = new Map()
        cellObserver?.disconnect()
        cellObserver = null
        patchFormulaCells(ctx)
        return '显示公式：已关闭'
      }
      const v = ctx.visible()
      const cells = (await ctx.call('xlsx.formulas', ctx.sheet(), v.r0, v.r1)) as { r: number; c: number; f: string }[]
      formulaMap = new Map(cells.map((c) => [`${c.r}:${c.c}`, c.f]))
      patchFormulaCells(ctx)
      if (!cellObserver) {
        cellObserver = new MutationObserver(() => patchFormulaCells(ctx))
        cellObserver.observe(document.body, { childList: true, subtree: true })
      }
      return `显示公式：已显示 ${formulaMap.size} 个公式`
    },
    showRuler: (on: boolean) => {
      ctx.bar.showRuler = on
      const sheet = q<HTMLElement>('.ov-sheet')
      if (!sheet) return '找不到工作表视图'
      if (on) sheet.style.setProperty('--ov-ruler-on', '1')
      else sheet.style.removeProperty('--ov-ruler-on')
      return on ? '标尺：已显示' : '标尺：已隐藏'
    },
    showFormulaBar: (on: boolean) => {
      ctx.bar.showFormulaBar = on
      const bar = q<HTMLElement>('.ov-formula')
      if (!bar) return '找不到编辑栏'
      bar.style.display = on ? '' : 'none'
      return on ? '编辑栏：已显示' : '编辑栏：已隐藏'
    },
    viewMode: (mode: string) => {
      ctx.bar.viewMode = mode
      const sheet = q<HTMLElement>('.ov-sheet')
      if (!sheet) return '找不到工作表视图'
      sheet.style.removeProperty('--ov-mode-pagebreak')
      sheet.style.removeProperty('--ov-mode-pagelayout')
      if (mode === 'pageBreak') sheet.style.setProperty('--ov-mode-pagebreak', '1')
      else if (mode === 'pageLayout') sheet.style.setProperty('--ov-mode-pagelayout', '1')
      return `视图模式：${mode === 'normal' ? '普通' : mode === 'pageBreak' ? '分页预览' : '页面布局'}`
    },
    splitPanes: () => {
      const grid = q<HTMLElement>('.ov-grid')
      const { r, c } = ctx.sel()
      if (!grid) return '找不到网格'
      if (grid.style.getPropertyValue('--ov-split-x')) {
        grid.style.removeProperty('--ov-split-x')
        grid.style.removeProperty('--ov-split-y')
        ctx.bar.split = false
        return '已取消拆分'
      }
      const el = cellEl(r, c)
      if (!el) return '当前单元格不在可视区'
      const gr = grid.getBoundingClientRect()
      const cr = el.getBoundingClientRect()
      grid.style.setProperty('--ov-split-x', `${Math.round(cr.left - gr.left)}px`)
      grid.style.setProperty('--ov-split-y', `${Math.round(cr.top - gr.top)}px`)
      ctx.bar.split = true
      return `已在 ${a1(r, c)} 拆分窗格`
    },
    zoomToSelection: () => {
      const sel = g()
      const first = cellEl(sel.r0, sel.c0)
      const last = cellEl(sel.r1, sel.c1)
      const view = q<HTMLElement>('.ov-grid-scroll')
      if (!first || !last || !view) return '缩放到所选比例：选区不在可视区'
      const a = first.getBoundingClientRect()
      const b = last.getBoundingClientRect()
      const w = Math.max(20, b.right - a.left)
      const h = Math.max(20, b.bottom - a.top)
      const z = Math.min(4, Math.max(0.25, Math.min(view.clientWidth / w, view.clientHeight / h)))
      ctx.setZoom(z)
      return `缩放到所选比例：${Math.round(z * 100)}%`
    },

    // ---------------- 追踪引用
    tracePrecedents: async () => {
      const { r, c } = ctx.sel()
      const formula = await cellInput(ctx, r, c)
      if (!formula.startsWith('=')) return '当前单元格没有公式'
      const refs = refsOf(formula.slice(1))
      markCells(refs, true)
      return `追踪引用单元格：${refs.length} 个`
    },
    traceDependents: async () => {
      const { r, c } = ctx.sel()
      const v = ctx.visible()
      const cells = (await ctx.call('xlsx.formulas', ctx.sheet(), v.r0, v.r1)) as { r: number; c: number; f: string }[]
      const hits = cells.filter((x) => refsOf(x.f.slice(1)).some((p) => p.r === r && p.c === c))
      markCells(hits, true)
      return `追踪从属单元格：${hits.length} 个`
    },
    traceClear: () => {
      for (const el of qa<HTMLElement>('.ov-cell[data-cell-r]')) {
        el.classList.remove('ov-trace')
        el.classList.remove('ov-trace-hit')
      }
      return '已删除追踪箭头'
    },

    // ---------------- 插入
    insertLink: async () => {
      const url = await officePrompt('插入链接', 'https://', '链接地址')
      if (!url) return ''
      const { r, c } = ctx.sel()
      await ctx.call('xlsx.set', ctx.sheet(), [{ r, c, input: `=HYPERLINK("${url.replace(/"/g, '""')}","${url}")` }])
      ctx.reload()
      ctx.changed()
      return `已在 ${a1(r, c)} 插入链接`
    },
    insertSymbol: async (sym?: string) => {
      let s = sym
      if (!s) {
        const v = await officePrompt('插入符号', '©', '要插入的符号')
        if (!v) return ''
        s = v
      }
      const { r, c } = ctx.sel()
      await ctx.call('xlsx.set', ctx.sheet(), [{ r, c, input: s }])
      ctx.reload()
      ctx.changed()
      return `已在 ${a1(r, c)} 插入符号 ${s}`
    },

    // ---------------- 数据分析
    consolidate: async () => {
      const sel = g()
      const data = await ctx.readAll()
      let sum = 0
      let n = 0
      for (let r = sel.r0; r <= sel.r1; r++) {
        for (let c = sel.c0; c <= sel.c1; c++) {
          const t = String(data.m[r]?.[c] ?? '').trim()
          if (!t) continue
          const v = Number(t.replace(/[,\s¥$%]/g, ''))
          if (Number.isFinite(v)) { sum += v; n++ }
        }
      }
      if (!n) return '组合：选区里没有数值'
      const text = String(Math.round(sum * 1e10) / 1e10)
      await ctx.call('xlsx.set', ctx.sheet(), [{ r: sel.r0, c: sel.c0, input: text }])
      ctx.reload()
      ctx.changed()
      return `组合：${n} 个数值合计 ${text}`
    },
  }
  return cmds
}
