/**
 * 「插入函数」向导的状态机（报障②）：类别 → 函数 → 参数槽 → 公式串 + 结果预览。
 * 纯逻辑不含 DOM；读写格经 ctx 注入（视图给真实内核 RPC，探针给内存 stub）。
 * 预览求值走内核公式引擎 TS 轨（与 x23/x24 同路）：parseFormula → references 枚举
 * 引用格 → 逐个 readCell 快照 → evaluate。范围超过 PREVIEW_MAX 格时不预览（避免刷爆 RPC）。
 * 样式在 office-funcdlg.css。
 */
import { reactive } from 'vue'
import {
  argSlot, evaluateFormula, FormulaError, functionCatalog, functionInfo, parseFormula, references,
  type ErrorCode, type FnInfo, type Value
} from '../core/xlsx/formula'

/** 类别 = Excel「函数库」菜单口径（ribbon CAT_* 单一来源迁入这里） */
const CAT_FINANCE = ['PMT', 'FV', 'PV', 'NPER', 'RATE', 'NPV', 'IRR']
const CAT_LOGIC = ['IF', 'IFS', 'SWITCH', 'AND', 'OR', 'NOT', 'XOR', 'TRUE', 'FALSE', 'IFERROR', 'IFNA']
const CAT_TEXT = [
  'CONCAT', 'CONCATENATE', 'TEXTJOIN', 'LEFT', 'RIGHT', 'MID', 'LEN', 'FIND', 'SEARCH', 'REPLACE', 'SUBSTITUTE',
  'REPT', 'TEXT', 'TRIM', 'UPPER', 'LOWER', 'PROPER', 'EXACT', 'VALUE', 'CHAR', 'CODE'
]
const CAT_DATE = [
  'DATE', 'DATEDIF', 'DAY', 'DAYS', 'EDATE', 'EOMONTH', 'HOUR', 'MINUTE', 'MONTH', 'NETWORKDAYS', 'NOW',
  'SECOND', 'TIME', 'TODAY', 'WEEKDAY', 'YEAR'
]
const CAT_LOOKUP = [
  'CHOOSE', 'COLUMN', 'COLUMNS', 'HLOOKUP', 'HYPERLINK', 'INDEX', 'INDIRECT', 'LOOKUP', 'MATCH', 'OFFSET',
  'ROW', 'ROWS', 'VLOOKUP', 'XLOOKUP'
]
const CAT_MATH = [
  'ABS', 'AVERAGE', 'AVERAGEIF', 'AVERAGEIFS', 'CEILING', 'CEILING.MATH', 'COUNT', 'COUNTA', 'COUNTBLANK',
  'COUNTIF', 'COUNTIFS', 'EVEN', 'EXP', 'FACT', 'FLOOR', 'FLOOR.MATH', 'GCD', 'INT', 'LARGE', 'LCM', 'LN',
  'LOG', 'LOG10', 'MAX', 'MAXIFS', 'MEDIAN', 'MIN', 'MINIFS', 'MOD', 'MODE', 'MODE.SNGL', 'ODD', 'PI',
  'POWER', 'PRODUCT', 'RAND', 'RANDBETWEEN', 'RANK', 'RANK.EQ', 'ROUND', 'ROUNDDOWN', 'ROUNDUP', 'SIGN',
  'SMALL', 'SQRT', 'STDEV', 'STDEV.P', 'STDEV.S', 'STDEVP', 'SUM', 'SUMIF', 'SUMIFS', 'SUMPRODUCT', 'TRUNC',
  'VAR', 'VAR.P', 'VAR.S', 'VARP'
]
const NAMED = [CAT_FINANCE, CAT_LOGIC, CAT_TEXT, CAT_DATE, CAT_LOOKUP, CAT_MATH]
const CATALOG = functionCatalog()
const CATALOG_NAMES = new Set(CATALOG.map((f) => f.name))
/** 「其他函数」= 目录里不属于以上分类的全部函数（与 ribbon 同口径） */
const CAT_OTHER = CATALOG.map((f) => f.name).filter((n) => !NAMED.some((c) => c.includes(n)))
const COMMON = ['SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN', 'IF', 'ROUND', 'SUMIF', 'VLOOKUP', 'TODAY', 'NOW'].filter(
  (n) => CATALOG_NAMES.has(n)
)
export const FUNC_CATS: { name: string; fns: string[] }[] = [
  { name: '常用函数', fns: COMMON },
  { name: '财务', fns: CAT_FINANCE },
  { name: '逻辑', fns: CAT_LOGIC },
  { name: '文本', fns: CAT_TEXT },
  { name: '日期和时间', fns: CAT_DATE },
  { name: '查找和引用', fns: CAT_LOOKUP },
  { name: '数学和三角', fns: CAT_MATH },
  { name: '其他函数', fns: CAT_OTHER }
]

const PREVIEW_MAX = 512
const ERR_RE = /^(#DIV\/0!|#N\/A|#NAME\?|#NULL!|#NUM!|#REF!|#VALUE!)$/

export interface FuncWizardCtx {
  /** 当前格显示值（公式格 = 计算结果；空格 → ''） */
  readCell: (r: number, c: number) => Promise<string>
  /** 本表名取值器（跨表引用直接跳过预览；视图侧随 sheet 变化） */
  sheetName: () => string
  date1904?: boolean
}

export const funcWizardFormula = (fn: string, args: string[]): string => {
  const filled = args.map((a) => a.trim()).filter((a) => a !== '')
  return `=${fn}(${filled.map(toLit).join(', ')})`
}

/** 参数串 → 公式实参：引用/数字原样，其余按文本字面量 */
function toLit(s: string): string {
  if (/^\$?[A-Z]{1,3}\$?[0-9]+(:\$?[A-Z]{1,3}\$?[0-9]+)?$/.test(s)) return s
  if (/^([A-Za-z_][A-Za-z0-9_.]*)!\$?[A-Z]{1,3}\$?[0-9]+(:\$?[A-Z]{1,3}\$?[0-9]+)?$/.test(s)) return s
  if (/^-?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$/.test(s)) return s
  if (/^(TRUE|FALSE)$/i.test(s)) return s.toUpperCase()
  return `"${s.replace(/"/g, '""')}"`
}

export function useFuncWizard(ctx: FuncWizardCtx) {
  const st = reactive({
    open: false,
    /** 向导步骤：pick 选函数 → args 填参数（视图拾取拦截只认 args 步） */
    step: 'pick' as 'pick' | 'args',
    /** 目标格 = 打开向导瞬间的光标（Excel 语义：拾取拖选挪光标，写入仍落原格） */
    target: { r: 0, c: 0 },
    cat: '常用函数',
    fn: 'SUM',
    search: '',
    args: [''] as string[],
    preview: '' // 结果预览文本；'' = 未预览/不完整
  })

  const list = () => {
    const q = st.search.trim().toUpperCase()
    if (q) return CATALOG.filter((f) => f.name.includes(q)).map((f) => f.name)
    return (FUNC_CATS.find((c) => c.name === st.cat)?.fns ?? []).filter((n) => CATALOG_NAMES.has(n))
  }
  const meta = (): FnInfo | null => functionInfo(st.fn) ?? null

  let evalSeq = 0
  async function runPreview() {
    const seq = ++evalSeq
    const text = funcWizardFormula(st.fn, st.args)
    const filled = st.args.filter((a) => a.trim()).length
    if (!filled) {
      st.preview = ''
      return
    }
    let cells: { r: number; c: number }[]
    try {
      const ast = parseFormula(text)
      const out: { r: number; c: number }[] = []
      for (const ref of references(ast)) {
        if (ref.sheet && ref.sheet.toLowerCase() !== ctx.sheetName().toLowerCase()) continue
        if ('r' in ref) out.push({ r: ref.r, c: ref.c })
        else {
          const h = ref.r1 - ref.r0 + 1, w = ref.c1 - ref.c0 + 1
          if (h * w > PREVIEW_MAX) {
            st.preview = '（范围过大，不预览）'
            return
          }
          for (let r = ref.r0; r <= ref.r1; r++) for (let c = ref.c0; c <= ref.c1; c++) out.push({ r, c })
        }
      }
    if (out.length > PREVIEW_MAX) {
        st.preview = '（引用过多，不预览）'
        return
      }
      cells = out
    } catch {
      st.preview = '#NAME?'
      return
    }
    const cache = new Map<number, Value>()
    for (const { r, c } of cells) {
      const key = r * 16384 + c
      if (cache.has(key)) continue
      const raw = (await ctx.readCell(r, c)).trim()
      const v: Value = raw === '' ? null : ERR_RE.test(raw) ? new FormulaError(raw as ErrorCode) : coerceNum(raw)
      cache.set(key, v)
      if (seq !== evalSeq) return // 输入又变了，放弃本次
    }
    const v = evaluateFormula(text, {
      provider: {
        date1904: ctx.date1904 ?? false,
        value: (_sheet, r, c) => (cache.get(r * 16384 + c) ?? null)
      },
      sheet: ctx.sheetName(),
      r: 0,
      c: 0
    })
    if (seq !== evalSeq) return
    st.preview = fmtVal(v)
  }
  let evalTimer: ReturnType<typeof setTimeout> | undefined
  const schedulePreview = () => {
    if (evalTimer) clearTimeout(evalTimer)
    evalTimer = setTimeout(() => void runPreview(), 150)
  }

  function setFn(name: string) {
    st.fn = name
    const f = functionInfo(name)
    const n = f && f.args.length ? f.args.length : 1
    st.args = Array.from({ length: n }, (_, i) => st.args[i] ?? '')
    schedulePreview()
  }
  function setCat(name: string) {
    st.cat = name
    st.search = ''
    const first = list()[0]
    if (first) setFn(first)
  }
  /** 当前应回填的参数槽：第一个空槽，全细则最后一个（Excel 焦点语义） */
  const activeArg = () => {
    const i = st.args.findIndex((a) => !a.trim())
    return i < 0 ? st.args.length - 1 : i
  }

  return {
    st,
    list,
    meta,
    formula: () => funcWizardFormula(st.fn, st.args),
    activeArg,
    argLabel: (i: number) => {
      const f = meta()
      if (!f) return `参数${i + 1}`
      const slot = argSlot(f, i)
      return slot < 0 ? `参数${i + 1}` : f.args[slot]
    },
    open, close: () => { st.open = false }, setCat, setFn,
    goArgs: () => { st.step = 'args' },
    goBack: () => { st.step = 'pick' },
    setSearch(v: string) {
      st.search = v
      const l = list()
      if (v.trim() && l.length && !l.includes(st.fn)) setFn(l[0])
    },
    setArg(i: number, v: string) {
      st.args[i] = v
      schedulePreview()
    },
    addArg() {
      st.args.push('')
      schedulePreview()
    },
    fillRange(r0: number, c0: number, r1: number, c1: number) {
      const ref = r0 === r1 && c0 === c1 ? a1(r0, c0) : `${a1(r0, c0)}:${a1(r1, c1)}`
      st.args[activeArg()] = ref
      schedulePreview()
    }
  }

  function open(cat?: string, fn?: string, target?: { r: number; c: number }) {
    st.open = true
    st.step = 'pick'
    st.search = ''
    if (target) st.target = { ...target }
    if (cat && FUNC_CATS.some((c) => c.name === cat)) {
      st.cat = cat
      st.args = ['']
      const first = fn && CATALOG_NAMES.has(fn) ? fn : list()[0]
      if (first) setFn(first)
    } else if (fn && CATALOG_NAMES.has(fn)) {
      setFn(fn)
    } else {
      setCat('常用函数')
    }
  }
}

const COL_LET = (c: number) => {
  let s = ''
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}
export const a1 = (r: number, c: number) => `${COL_LET(c)}${r + 1}`

function coerceNum(t: string): Value {
  const n = Number(t.replace(/[,¥$\s%]/g, ''))
  return Number.isFinite(n) ? n : t
}
function fmtVal(v: Value): string {
  if (v === null) return ''
  if (typeof v === 'number') return String(Math.round(v * 1e10) / 1e10)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (v instanceof FormulaError) return v.code
  return String(v)
}
