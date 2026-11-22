/**
 * Office Ribbon 声明式配置。按钮只描述「命令名 + 参数」，由视图的 commands 防腐层执行。
 * 只列真实可用的命令；分类汇总 / 数据透视 / 自动筛选走 block→前端聚合→set 写回，非内核 RPC。
 */
import { functionCatalog } from './core/xlsx/formula/catalog'
import type { FmtPatch } from './core/xlsx/types'

export interface Act { cmd: string; args?: unknown[] }
export interface Opt { label: string; args?: unknown[]; hint?: string; sep?: boolean }
/**
 * `disabled` = B 级按钮（Excel 专有 / 外部依赖 / 平台专属）：灰显 + title「不支持：<原因>」。
 * 未标 disabled 的按钮必须接上视图 commands 里真实存在的命令名（A 级）。
 */
export type Item =
  | { t: 'btn'; label: string; title?: string; cls?: string; big?: boolean; act: Act; disabled?: boolean }
  | { t: 'menu'; label: string; title?: string; big?: boolean; cmd: string; items: Opt[]; disabled?: boolean; optsFrom?: string }
  | { t: 'color'; label: string; title?: string; big?: boolean; cmd: string; wrap?: 'plain' | 'patch'; key?: string; none?: boolean; disabled?: boolean }
  | { t: 'toggle'; label: string; title?: string; big?: boolean; key: string; disabled?: boolean }
  | { t: 'sep' }
export interface Group { name: string; items: Item[] }
export interface Tab { id: string; label: string; groups: Group[] }

const COLORS = ['#1f1f1f', '#ffffff', '#c00000', '#e5534b', '#e8a13c', '#ffff00', '#3fbf6b', '#5aa9ff', '#7c5cff', '#d6538f']
const b = (label: string, cmd: string, ...args: unknown[]): Item => ({ t: 'btn', label, act: { cmd, args } })
/** 主功能用 Office 风格大图标按钮 */
const B = (label: string, cmd: string, ...args: unknown[]): Item => ({ t: 'btn', label, big: true, act: { cmd, args } })
const m = (label: string, cmd: string, items: Opt[]): Item => ({ t: 'menu', label, cmd, items })
const c = (label: string, cmd: string, key?: string, wrap: 'plain' | 'patch' = 'plain'): Item => ({
  t: 'color', label, cmd, key, wrap, none: true, title: label
})
const sep = (): Item => ({ t: 'sep' })
const g = (name: string, items: Item[]): Group => ({ name, items })
/** B 级按钮：不支持（外部依赖 / Excel 专有 / 平台专属）→ 灰显 + title「不支持：<原因>」 */
const nb = (label: string, reason: string): Item => ({ t: 'btn', label, act: { cmd: '' }, disabled: true, title: `不支持：${reason}` })
/** 动态菜单：选项由 provider 命令在打开时给出（如「最近使用」的函数） */
const mdyn = (label: string, cmd: string, provider: string): Item => ({ t: 'menu', label, cmd, items: [], optsFrom: provider })
/** B 级菜单：同上（菜单整体不可用） */
const nbm = (label: string, reason: string, items: Opt[] = []): Item => ({
  t: 'menu', label, cmd: '', items, disabled: true, title: `不支持：${reason}`
})

const SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72]
const FONTS = ['宋体', '黑体', '微软雅黑', '思源黑体', 'Arial', 'Calibri', 'Georgia', 'Times New Roman', 'Courier New']
const listOpts = (xs: (string | number)[], cmd: string): Opt[] =>
  xs.map((x) => ({ label: String(x), args: typeof x === 'number' ? [x] : [String(x)] }))

const NUMFMTS: Opt[] = [
  { label: '常规', args: [{ numFmt: 'General' }] },
  { label: '文本', args: [{ numFmt: '@' }] },
  { label: '整数 1000', args: [{ numFmt: '0' }], sep: true },
  { label: '两位小数 1000.12', args: [{ numFmt: '0.00' }] },
  { label: '千分位 1,000', args: [{ numFmt: '#,##0' }] },
  { label: '千分位+小数', args: [{ numFmt: '#,##0.00' }] },
  { label: '科学计数', args: [{ numFmt: '0.00E+00' }] },
  { label: '百分比 10%', args: [{ numFmt: '0%' }], sep: true },
  { label: '百分比两位', args: [{ numFmt: '0.00%' }] },
  { label: '货币 $1,000.12', args: [{ numFmt: '"$"#,##0.00' }], sep: true },
  { label: '货币整数', args: [{ numFmt: '"$"#,##0' }] },
  { label: '人民币 ¥1,000.12', args: [{ numFmt: '"¥"#,##0.00' }] },
  { label: '分数', args: [{ numFmt: '# ?/?' }] },
  { label: '日期 2026-09-26', args: [{ numFmt: 'yyyy-mm-dd' }], sep: true },
  { label: '日期 26/09/2026', args: [{ numFmt: 'dd/mm/yyyy' }] },
  { label: '长日期', args: [{ numFmt: 'd mmmm yyyy' }] },
  { label: '时间 15:59', args: [{ numFmt: 'h:mm' }] },
  { label: '时间带秒', args: [{ numFmt: 'h:mm:ss AM/PM' }] },
  { label: '日期时间', args: [{ numFmt: 'yyyy-mm-dd h:mm' }] },
  { label: '时长', args: [{ numFmt: '[h]:mm:ss' }] }
]
const BORDERS: Opt[] = [
  { label: '所有边框', args: [{ border: 'all' }] },
  { label: '内部边框', args: [{ border: 'inner' }] },
  { label: '外侧边框', args: [{ border: 'outer' }] },
  { label: '清除边框', args: [{ border: 'none' }] },
  { label: '上边框', args: [{ border: 'top' }], sep: true },
  { label: '下边框', args: [{ border: 'bottom' }] },
  { label: '左边框', args: [{ border: 'left' }] },
  { label: '右边框', args: [{ border: 'right' }] }
]
const BORDER_STYLES: Opt[] = ['thin', 'medium', 'thick', 'dashed', 'dotted', 'double'].map((v) => ({
  label: ({ thin: '细', medium: '中', thick: '粗', dashed: '虚线', dotted: '点线', double: '双线' } as Record<string, string>)[v],
  args: [{ borderStyle: v, border: 'all' }]
}))
const FUNC_FAST: Opt[] = ['SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN'].map((f) => ({ label: `Σ ${f}`, args: [f] }))
/** 134 个公式函数，来自内核目录，按名称排序 */
const FUNCS: Opt[] = functionCatalog().map((f) => ({
  label: f.name,
  args: [f.name],
  hint: `${f.name}(${f.args.join(', ')}${f.variadic ? '…' : ''})`
}))
/** 内核函数目录（按名索引）：公式页的分类菜单从它取参数提示 */
const FN_BY_NAME = new Map(functionCatalog().map((f) => [f.name, f]))
/** 分类菜单项：只列内核真正支持的函数 */
const funcOpts = (names: string[]): Opt[] =>
  names.filter((n) => FN_BY_NAME.has(n)).map((n) => {
    const f = FN_BY_NAME.get(n)!
    return { label: f.name, args: [f.name], hint: `${f.name}(${f.args.join(', ')}${f.variadic ? '…' : ''})` }
  })
/** 公式页的函数分类（对应 Excel「自动求和 / 财务 / 逻辑 / 文本 / 日期和时间 / 查找和引用 / 数学和三角 / 其他函数」） */
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
/** 「其他函数」= 目录里不属于以上分类的全部函数 */
const CAT_OTHER = functionCatalog().map((f) => f.name).filter(
  (n) => ![...CAT_FINANCE, ...CAT_LOGIC, ...CAT_TEXT, ...CAT_DATE, ...CAT_LOOKUP, ...CAT_MATH].includes(n)
)
const SHAPES: Opt[] = [
  { label: '文本框', args: ['text'] }, { label: '图片', args: ['image'] }, { label: '直线', args: ['line'] },
  { label: '矩形', args: ['rect'], sep: true }, { label: '圆角矩形', args: ['roundRect'] }, { label: '椭圆', args: ['ellipse'] },
  { label: '三角形', args: ['triangle'] }, { label: '直角三角形', args: ['rtTriangle'] }, { label: '菱形', args: ['diamond'] },
  { label: '平行四边形', args: ['parallelogram'] }, { label: '梯形', args: ['trapezoid'] }, { label: '五边形', args: ['pentagon'] },
  { label: '六边形', args: ['hexagon'] }, { label: '八边形', args: ['octagon'] }, { label: '圆环', args: ['donut'] },
  { label: '圆柱', args: ['can'] }, { label: '心形', args: ['heart'] }, { label: '十字', args: ['plus'] },
  { label: '右箭头', args: ['rightArrow'], sep: true }, { label: '左箭头', args: ['leftArrow'] },
  { label: '上箭头', args: ['upArrow'] }, { label: '下箭头', args: ['downArrow'] },
  { label: '双向箭头', args: ['leftRightArrow'] }, { label: 'V 形', args: ['chevron'] }, { label: '五边形箭头', args: ['homePlate'] },
  { label: '四角星', args: ['star4'], sep: true }, { label: '五角星', args: ['star5'] }, { label: '六角星', args: ['star6'] },
  { label: '标注', args: ['wedgeRectCallout'], sep: true }, { label: '圆角标注', args: ['wedgeRoundRectCallout'] }
]
const STYLES: Opt[] = [
  { label: '正文', args: ['normal'] }, { label: '标题', args: ['title'] }, { label: '副标题', args: ['subtitle'] },
  { label: '标题 1', args: ['h1'], sep: true }, { label: '标题 2', args: ['h2'] }, { label: '标题 3', args: ['h3'] },
  { label: '标题 4', args: ['h4'] }, { label: '标题 5', args: ['h5'] }, { label: '标题 6', args: ['h6'] }
]
const PAPERS: Opt[] = [
  { label: 'A4 (21 × 29.7 cm)', args: [{ w: 595.3, h: 841.9 }] },
  { label: 'A3 (29.7 × 42 cm)', args: [{ w: 841.9, h: 1190.6 }] },
  { label: 'A5 (14.8 × 21 cm)', args: [{ w: 419.5, h: 595.3 }] },
  { label: 'Letter (8.5 × 11 in)', args: [{ w: 612, h: 792 }] },
  { label: 'Legal (8.5 × 14 in)', args: [{ w: 612, h: 1008 }] },
  { label: 'B5 (17.6 × 25 cm)', args: [{ w: 498.9, h: 708.7 }] }
]
const MARGINS: Opt[] = [
  { label: '普通 (72pt)', args: [{ mt: 72, mr: 72, mb: 72, ml: 72 }] },
  { label: '窄 (36pt)', args: [{ mt: 36, mr: 36, mb: 36, ml: 36 }] },
  { label: '适中 (上下 72 / 左右 54)', args: [{ mt: 72, mr: 54, mb: 72, ml: 54 }] },
  { label: '宽 (144pt)', args: [{ mt: 144, mr: 144, mb: 144, ml: 144 }] },
  { label: '上下窄 (36 / 左右 72)', args: [{ mt: 36, mr: 72, mb: 36, ml: 72 }], sep: true },
  { label: '书本 (上下 72 / 内外 36·90)', args: [{ mt: 72, mr: 36, mb: 72, ml: 90 }] }
]
/** Excel「大小」下拉：OOXML paperSize 编号（9=A4 / 8=A3 / 11=A5 / 1=Letter / 5=Legal / 13=B5） */
const XL_PAPERS: Opt[] = [
  { label: 'A4 (21 × 29.7 cm)', args: [{ paper: 9 }] },
  { label: 'A3 (29.7 × 42 cm)', args: [{ paper: 8 }] },
  { label: 'A5 (14.8 × 21 cm)', args: [{ paper: 11 }] },
  { label: 'Letter (8.5 × 11 in)', args: [{ paper: 1 }], sep: true },
  { label: 'Legal (8.5 × 14 in)', args: [{ paper: 5 }] },
  { label: 'B5 (17.6 × 25 cm)', args: [{ paper: 13 }] }
]
/** 上游 Word 工具栏的符号弹板：常用符号直接写入选区 */
const SYMBOLS: Opt[] = '§ ¶ © ® ™ ° ± × ÷ ≠ ≤ ≥ ∞ √ ∑ ∫ ≈ ≡ ∈ ∉ ⊂ ⊃ ∪ ∩ ∅ ∇ ∂ ∀ ∃ ⊗ ⊕ ⊥ ∠ ∟ µ Ω α β γ δ θ λ π σ φ ω ← → ↑ ↓ ↔ ⇄ ⇒ ⇔ ♠ ♣ ♥ ♦ ★ ☆ ● ○ ■ □ ▲ ▼ ◆ ✓ ✗ † ‡ … – — ‹ › « »'
  .split(' ').map((s) => ({ label: s, args: [s] }))
const CELL_BORDERS: Opt[] = [
  { label: '所有边框', args: ['all'] }, { label: '外侧边框', args: ['outer'] },
  { label: '内部边框', args: ['inner'] }, { label: '清除边框', args: ['none'] },
  { label: '上边框', args: ['top'], sep: true }, { label: '下边框', args: ['bottom'] },
  { label: '左边框', args: ['left'] }, { label: '右边框', args: ['right'] }
]
const BORDER_CSS: Opt[] = [
  { label: '细实线', args: ['all', '0.5pt solid #000000'] },
  { label: '中实线', args: ['all', '1.5pt solid #000000'] },
  { label: '粗实线', args: ['all', '3pt solid #000000'] },
  { label: '虚线', args: ['all', '1pt dashed #000000'], sep: true },
  { label: '点线', args: ['all', '1pt dotted #000000'] },
  { label: '双线', args: ['all', '3pt double #000000'] },
  { label: '红色边框', args: ['all', '1pt solid #c00000'] }
]
const ALIGN_ON: Opt[] = [
  { label: '左对齐', args: ['left'] }, { label: '水平居中', args: ['center'] }, { label: '右对齐', args: ['right'] },
  { label: '顶端对齐', args: ['top'], sep: true }, { label: '垂直居中', args: ['middle'] }, { label: '底端对齐', args: ['bottom'] }
]
const ZOOMS: Opt[] = [50, 75, 90, 100, 125, 150, 200].map((v) => ({ label: `${v}%`, args: [v / 100] }))

const fmt = (p: FmtPatch): unknown[] => [p]
const sheetOp = (o: Record<string, unknown>): unknown[] => [o]

// ---------------------------------------------------------------- Word
const DOCX: Tab[] = [
  {
    id: 'home', label: '开始', groups: [
      g('剪贴板', [
        b('↶', 'undo'), b('↷', 'redo'), b('🖌', 'painter'), b('⌫', 'clearFormat'), sep(),
        b('复制样式', 'copyFormat')
      ]),
      g('字体', [
        m('字体', 'setFont', listOpts(FONTS, 'setFont')),
        m('字号', 'setSize', listOpts(SIZES, 'setSize')),
        b('B', 'toggle', 'b'), b('I', 'toggle', 'i'), b('U', 'toggle', 'u'), b('S', 'toggle', 'strike'),
        b('上标', 'sup'), b('下标', 'sub'), sep(), c('字体色', 'setColor'), c('高亮', 'setHighlight')
      ]),
      g('段落', [
        m('样式', 'applyStyle', STYLES),
        b('左', 'setAlign', 'left'), b('中', 'setAlign', 'center'), b('右', 'setAlign', 'right'), b('两端', 'setAlign', 'justify'),
        m('行距', 'setLine', [1, 1.15, 1.5, 2, 2.5, 3].map((v) => ({ label: String(v), args: [v] }))),
        b('•', 'toggleList', 'bullet'), b('1.', 'toggleList', 'number'),
        b('⇤', 'indent', -1), b('⇥', 'indent', 1)
      ]),
      g('编辑', [b('查找', 'find'), b('替换', 'replace'), b('全选', 'selectAll'), m('特殊符号', 'insertText', SYMBOLS)])
    ]
  },
  {
    id: 'insert', label: '插入', groups: [
      g('表格', [
        m('插入表格', 'insertTable', [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [3, 5], [5, 3]].map(([r, c]) => ({ label: `${r} × ${c}`, args: [r, c] }))),
        b('上方插行', 'tableOp', 'rowAbove'), b('下方插行', 'tableOp', 'rowBelow'),
        b('左侧插列', 'tableOp', 'colLeft'), b('右侧插列', 'tableOp', 'colRight'),
        b('删行', 'tableOp', 'delRow'), b('删列', 'tableOp', 'delCol'), b('删表', 'tableOp', 'delTable'), sep(),
        b('合并单元格', 'mergeCells'), b('拆分单元格', 'unmergeCell'),
        b('平均分布列', 'distributeColumns'),
        c('单元格底纹', 'setCellShade'),
        m('单元格边框', 'setCellBorders', CELL_BORDERS),
        m('边框线型', 'setCellBorders', BORDER_CSS),
        m('垂直对齐', 'setCellVAlign', [{ label: '上', args: ['top'] }, { label: '中', args: ['middle'] }, { label: '下', args: ['bottom'] }])
      ]),
      g('插图', [
        B('图片', 'insertImage'), b('链接', 'insertLink'), b('替换图片', 'replaceImage'), sep(),
        b('缩小图片', 'imageScale', 0.8), b('放大图片', 'imageScale', 1.25), b('适应页宽', 'imageScale', 'fit'),
        b('替代文字', 'setAltText'),
        b('裁剪', 'toggleCrop')
      ]),
      g('页', [b('分页符', 'insertPageBreak')]),
      g('页眉页脚', [
        b('编辑页眉', 'setHeader', '页眉文字'), b('编辑页脚', 'setFooter', '页脚文字'),
        b('插入页码', 'pageNumber'), b('插入总页数', 'pageCount'),
        b('清除页眉', 'clearHeader'), b('清除页脚', 'clearFooter'),
        { t: 'toggle', label: '首页不同', key: 'titlePg', title: '首页使用不同的页眉页脚' }
      ])
    ]
  },
  {
    id: 'layout', label: '布局', groups: [
      g('页面设置', [
        m('纸张', 'setPage', PAPERS),
        b('纵向', 'setPage', { w: 595.3, h: 841.9 }), b('横向', 'setPage', { w: 841.9, h: 595.3 }),
        m('页边距', 'setPage', MARGINS),
        m('分栏', 'setPage', [1, 2, 3].map((v) => ({ label: `${v} 栏`, args: [{ cols: v }] })))
      ])
    ]
  },
  {
    id: 'review', label: '审阅', groups: [
      g('修订', [
        { t: 'toggle', label: '修订', key: 'tracking', title: '记录所有修改' },
        b('上一条', 'gotoChange', -1), b('下一条', 'gotoChange', 1),
        b('接受', 'reviewChange', true, false), b('拒绝', 'reviewChange', false, false),
        b('全部接受', 'reviewChange', true, true), b('全部拒绝', 'reviewChange', false, true)
      ]),
      g('批注', [b('新建批注', 'addComment'), b('批注列表', 'listComments')]),
      g('样式', [b('更新样式以匹配', 'updateStyle'), b('删除所选', 'deleteSelection')])
    ]
  },
  {
    id: 'view', label: '视图', groups: [
      g('显示', [m('缩放', 'setZoom', ZOOMS), b('100%', 'setZoom', 1), { t: 'toggle', label: '阅读模式', key: 'readMode' }]),
      g('窗口', [b('适应页宽', 'fitWidth')])
    ]
  }
]

// ---------------------------------------------------------------- Excel
/**
 * Excel 桌面版 ribbon 的 1:1 结构还原（8 个页签：开始 / 插入 / 绘图 / 页面布局 / 公式 / 数据 / 审阅 / 视图）。
 *
 * 每个按钮只有两级：
 *   A 级 —— 命令名存在于视图的 commands 里（真实现，点击有可观察行为）；
 *   B 级 —— Excel 专有 / 外部依赖 / 平台专属，用 nb()/nbm() 标 disabled + title「不支持：<原因>」灰显。
 * 探针（src/office/__smoke-x6.ts）会遍历本表，断言「可点击 ⇒ 命令名在 commands 里」「disabled ⇒ 带不支持说明」。
 */
const XLSX: Tab[] = [
  {
    id: 'home', label: '开始', groups: [
      g('剪贴板', [
        b('粘贴', 'pasteRange'), b('剪切', 'cutRange'), b('复制', 'copyRange'), b('格式刷', 'painter')
      ]),
      g('字体', [
        m('字体', 'format', listOpts(FONTS, 'format').map((o) => ({ ...o, args: [{ font: o.args?.[0] }] }))),
        m('字号', 'format', listOpts(SIZES, 'format').map((o) => ({ ...o, args: [{ sz: o.args?.[0] }] }))),
        b('增大字号', 'fontSizeStep', 1), b('减小字号', 'fontSizeStep', -1), sep(),
        b('B', 'format', { b: true }), b('I', 'format', { i: true }), b('U', 'format', { u: true }), b('S', 'format', { strike: true }),
        sep(), c('字体色', 'format', 'color', 'patch'), c('填充色', 'format', 'fill', 'patch'), c('边框色', 'format', 'borderColor', 'patch'),
        m('边框', 'format', BORDERS), m('线型', 'format', BORDER_STYLES)
      ]),
      g('对齐', [
        b('顶端对齐', 'format', { valign: 'top' }), b('垂直居中', 'format', { valign: 'center' }), b('底端对齐', 'format', { valign: 'bottom' }),
        b('左对齐', 'format', { align: 'left' }), b('居中', 'format', { align: 'center' }), b('右对齐', 'format', { align: 'right' }),
        b('减少缩进', 'indent', -1), b('增加缩进', 'indent', 1), b('合并后居中', 'mergeCenter'),
        b('自动换行', 'toggleWrap'),
        m('旋转', 'format', [
          { label: '无', args: [{ rotate: null }] }, { label: '上倾 45°', args: [{ rotate: 45 }] },
          { label: '下倾 45°', args: [{ rotate: -45 }] }, { label: '竖排', args: [{ rotate: 255 }] },
          { label: '向上 90°', args: [{ rotate: 90 }] }, { label: '向下 90°', args: [{ rotate: -90 }] }
        ])
      ]),
      g('数字', [
        m('数字格式', 'format', NUMFMTS), b('常规', 'format', { numFmt: 'General' }), b('自定义…', 'customNumFmt'),
        nb('会计专用格式', '会计专用格式（左侧货币符号 + 会计括号）未实现'),
        b('百分比', 'format', { numFmt: '0.00%' }), b('千分位', 'format', { numFmt: '#,##0.00' }),
        b('增加小数位', 'decimals', 1), b('减少小数位', 'decimals', -1)
      ]),
      g('样式', [
        b('条件格式', 'condFmt'),
        nb('突出显示单元格规则', '规则向导（大于/小于/重复值…）未实现'),
        nb('套用表格样式', 'Excel 表对象（ListObject）与表格样式库未实现'),
        nb('单元格样式', 'Excel 单元格样式库未内置')
      ]),
      g('单元格', [
        b('插入行', 'rows', 'rowAbove'), b('插入列', 'rows', 'colLeft'),
        b('删除行', 'rows', 'delRow'), b('删除列', 'rows', 'delCol'),
        b('行高', 'rowHeightDlg'), b('列宽', 'colWidthDlg'),
        nb('格式', '「单元格格式」对话框（字体/边框/填充/保护 多页签）未实现'),
        m('隐藏', 'rows', [{ label: '隐藏行', args: ['hideRows'] }, { label: '隐藏列', args: ['hideCols'] }]),
        m('取消隐藏', 'rows', [{ label: '取消隐藏行', args: ['unhideRows'] }, { label: '取消隐藏列', args: ['unhideCols'] }]),
        b('合并后居中', 'mergeCenter')
      ]),
      g('编辑', [
        m('自动求和', 'insertFunc', FUNC_FAST),
        m('填充', 'fillDir', [{ label: '向下', args: ['down'] }, { label: '向右', args: ['right'] }]),
        b('清除内容', 'clearCells'), b('清除格式', 'format', { clear: true }),
        b('升序', 'sort', false), b('降序', 'sort', true),
        b('查找', 'find'), b('替换', 'replace'), b('定位', 'gotoCell')
      ])
    ]
  },
  {
    id: 'insert', label: '插入', groups: [
      g('表格', [
        b('数据透视表', 'pivotTable'),
        nb('建议的数据透视表', '推荐引擎（按数据自动选表型）需要联网模型'),
        nb('表格', 'Excel 表对象（ListObject）与结构化引用未实现'),
        nb('迷你图', '迷你图（Sparkline）图表部件未实现'),
        b('切片器', 'insertSlicer'),
        nb('日程表', '日程表部件（Timeline Slicer）未实现')
      ]),
      g('插图', [
        b('图片', 'insertImage'),
        nb('形状', 'Excel 形状库与 drawing 形状部件未实现'),
        nb('图标', 'Office 图标库未内置'),
        nb('3D 模型', '3D 模型部件（3D Model）未实现'),
        nb('SmartArt', 'SmartArt 图形部件（diagram）未实现'),
        nb('筛选截图', '「筛选截图」需要 Windows 截图服务'),
        nb('建议图表', '推荐图表引擎需要联网模型'),
        nb('地图', '地图图表（Map Chart）需要联网地图服务'),
        nb('数据透视图', '数据透视图（PivotChart）部件未实现')
      ]),
      g('链接', [b('链接', 'insertLink')]),
      g('文本', [
        b('批注', 'commentAdd'), b('新建注释', 'commentAdd'),
        nb('文本框', '工作表文本框形状未实现'),
        b('页眉和页脚', 'headerFooter'),
        nb('对象', 'OLE 嵌入对象未实现'),
        b('公式', 'insertFormula')
      ]),
      g('符号', [m('符号', 'insertSymbol', SYMBOLS)])
    ]
  },
  {
    id: 'draw', label: '绘图', groups: [
      g('绘图', [
        nb('绘图', '自由绘制（墨迹/形状笔迹）画布层未实现'),
        nb('橡皮擦', '墨迹擦除（只支持清除单元格内容，用「开始 › 清除内容」）'),
        nb('套索选择', '套索框选墨迹未实现'),
        b('荧光笔 黄', 'format', { fill: '#ffff00' }), b('荧光笔 绿', 'format', { fill: '#92d050' }),
        b('荧光笔 蓝', 'format', { fill: '#00b0f0' }), b('荧光笔 粉', 'format', { fill: '#ff99cc' }),
        nb('添加笔', '笔迹绘制需要触控笔/压感支持'),
        nb('使用触控板绘图', '触控板绘制需要压感支持')
      ])
    ]
  },
  {
    id: 'layout', label: '页面布局', groups: [
      g('主题', [
        nb('主题', 'Office 主题（theme1.xml）未内置'),
        nb('颜色', '主题配色表未内置'),
        nb('字体', '主题字体未内置')
      ]),
      g('页面设置', [
        m('页边距', 'pageSetup', MARGINS),
        m('方向', 'pageSetup', [{ label: '纵向', args: [{ orientation: 'portrait' }] }, { label: '横向', args: [{ orientation: 'landscape' }] }]),
        m('大小', 'pageSetup', XL_PAPERS),
        b('打印区域', 'printArea'),
        nb('分隔符', '插入分页符（行/列分页符）未实现'),
        nb('背景', '工作表背景图未实现'),
        b('打印标题', 'printTitles'),
        b('页面设置', 'pageSetup')
      ]),
      g('工作表选项', [
        b('宽度自动', 'autoFitCols'), b('高度自动', 'autoFitRows'),
        { t: 'toggle', label: '网格线', key: 'printGridlines', title: '打印网格线' }
      ])
    ]
  },
  {
    id: 'formulas', label: '公式', groups: [
      g('函数库', [
        m('插入函数', 'insertFunc', FUNCS),
        m('自动求和', 'insertFunc', FUNC_FAST),
        mdyn('最近使用', 'insertFunc', 'recentFunctions'),
        m('财务', 'insertFunc', funcOpts(CAT_FINANCE)),
        m('逻辑', 'insertFunc', funcOpts(CAT_LOGIC)),
        m('文本', 'insertFunc', funcOpts(CAT_TEXT)),
        m('日期和时间', 'insertFunc', funcOpts(CAT_DATE)),
        m('查找和引用', 'insertFunc', funcOpts(CAT_LOOKUP)),
        m('数学和三角', 'insertFunc', funcOpts(CAT_MATH)),
        m('其他函数', 'insertFunc', funcOpts(CAT_OTHER))
      ]),
      g('名称管理器', [
        b('名称管理器', 'nameManager'), b('定义名称', 'defineName'),
        nb('隐藏', '隐藏内置名称（_xlnm.*）未实现'),
        nb('取消隐藏', '隐藏内置名称（_xlnm.*）未实现')
      ]),
      g('公式审核', [
        b('在公式中使用', 'useInFormula'),
        b('追踪引用单元格', 'tracePrecedents'), b('追踪从属单元格', 'traceDependents'), b('删除箭头', 'traceClear'),
        { t: 'toggle', label: '显示公式', key: 'showFormulas', title: '在单元格中显示公式而非结果' },
        b('错误检查', 'errorCheck')
      ]),
      g('计算', [
        nb('监视窗口', '跨工作簿监视窗口未实现'),
        m('计算选项', 'calcMode', [
          { label: '自动', args: ['auto'] }, { label: '自动（不含数据表）', args: ['autoNoTable'] }, { label: '手动', args: ['manual'] }
        ]),
        b('立即计算', 'calcNow'), b('计算工作表', 'calcSheet')
      ])
    ]
  },
  {
    id: 'data', label: '数据', groups: [
      g('获取数据', [
        nb('获取数据', 'Power Query 数据连接引擎未实现'),
        b('全部刷新', 'refreshAll'),
        nb('属性', '文档属性面板未实现'),
        nb('查询和连接', 'Power Query 查询与连接窗格未实现'),
        nb('工作簿连接', '外部工作簿连接管理未实现')
      ]),
      g('排序和筛选', [
        m('排序', 'sort', [{ label: '升序', args: [false] }, { label: '降序', args: [true] }]),
        b('筛选', 'autoFilter'),
        b('清除', 'clearCells')
      ]),
      g('数据工具', [
        b('数据验证', 'dataValidation'),
        nb('合并', '多区域「合并」向导（Consolidate）未实现'),
        b('取消合并', 'merge', 'unmerge'),
        b('汇总', 'subtotal')
      ]),
      g('数据分析', [
        b('数据透视表', 'pivotTable'),
        nb('分析工具', '分析工具库（方差分析 / 回归 / 抽样）未实现'),
        b('组合', 'consolidate'),
        nb('取消组合', '数据分组与取消组合未实现')
      ]),
      g('汇总', [
        b('分类汇总', 'subtotal'),
        nb('隐藏', '分组明细隐藏（大纲）未落盘到 OOXML'),
        nb('拆分工具', '数据拆分（按分隔符分列）未实现')
      ])
    ]
  },
  {
    id: 'review', label: '审阅', groups: [
      g('校对', [
        b('拼写', 'spellCheck'),
        nb('同义词', '同义词库未内置'),
        b('工作簿统计信息', 'wbStats')
      ]),
      g('易读性', [
        nb('检查辅助功能', '无障碍检查器（对比度/替代文字）未实现'),
        nb('智能查找', '智能查找需要联网服务'),
        nb('翻译', '翻译需要联网服务')
      ]),
      g('批注', [
        b('新建注释', 'commentAdd'), b('删除注释', 'commentDel'),
        b('上一条', 'commentPrev'), b('下一条', 'commentNext'),
        b('显示所有批注', 'commentList'),
        { t: 'toggle', label: '隐藏批注', key: 'commentHideAll', title: '隐藏/显示全部批注' }
      ]),
      g('保护', [
        { t: 'toggle', label: '保护工作表', key: 'sheetProtect', title: '保护工作表（只读保护位）' },
        { t: 'toggle', label: '保护工作簿', key: 'protectWorkbook', title: '保护工作簿结构' },
        { t: 'toggle', label: '始终以只读方式打开', key: 'readOnlyRecommended', title: '建议以只读方式打开' },
        nb('限制权限', '权限（IRM / 受限权限）模型未实现'),
        nb('隐藏墨迹', '墨迹对象未实现')
      ])
    ]
  },
  {
    id: 'view', label: '视图', groups: [
      g('工作簿视图', [
        b('普通', 'viewMode', 'normal'), b('分页预览', 'viewMode', 'pageBreak'), b('页面布局', 'viewMode', 'pageLayout'),
        nb('自定义视图', '命名视图集（customSheetViews）未实现')
      ]),
      g('显示', [
        { t: 'toggle', label: '标尺', key: 'showRuler', title: '显示标尺' },
        { t: 'toggle', label: '网格线', key: 'gridlines', title: '显示网格线' },
        { t: 'toggle', label: '编辑栏', key: 'showFormulaBar', title: '显示/隐藏编辑栏' }
      ]),
      g('缩放', [
        m('缩放', 'setZoom', ZOOMS), b('100%', 'setZoom', 1), b('缩放到所选比例', 'zoomToSelection')
      ]),
      g('窗口', [
        nb('新建窗口', '多窗口未实现'),
        nb('全部重排', '多窗口未实现'),
        b('拆分', 'splitPanes'),
        m('冻结窗格', 'freeze', [
          { label: '冻结首行', args: ['row'] }, { label: '冻结首列', args: ['col'] },
          { label: '冻结至当前单元格', args: ['sel'] }, { label: '取消冻结', args: ['none'] }
        ]),
        nb('隐藏', '窗口隐藏未实现'),
        nb('取消隐藏', '窗口隐藏未实现'),
        nb('切换窗口', '多窗口未实现')
      ]),
      g('工作表', [
        b('新建', 'bookOp', 'add'), b('删除', 'bookOp', 'delete'), b('重命名', 'bookOp', 'rename'),
        b('左移', 'bookOp', 'moveLeft'), b('右移', 'bookOp', 'moveRight'),
        b('隐藏', 'hideSheet'), b('取消隐藏', 'unhideSheet'),
        m('切换', 'switchSheet', [])
      ]),
      g('宏', [
        nb('录制宏', 'VBA 宏录制未实现'),
        nb('查看宏', 'VBA 宏编辑器未实现'),
        nb('使用相对引用', '宏录制未实现')
      ])
    ]
  }
]

// ---------------------------------------------------------------- PowerPoint
const PPTX: Tab[] = [
  {
    id: 'home', label: '开始', groups: [
      g('幻灯片', [
        B('新建', 'addSlide'), b('复制', 'duplicate'), b('删除', 'deleteSlide'),
        { t: 'toggle', label: '隐藏', key: 'hidden' }, b('上移', 'moveSlide', -1), b('下移', 'moveSlide', 1)
      ]),
      g('绘图', [
        m('形状', 'insertShape', SHAPES), b('文本框', 'insertShape', 'text'), b('图片', 'insertShape', 'image'), b('直线', 'insertShape', 'line')
      ]),
      g('排列', [
        b('置于顶层', 'order', 'front'), b('置于底层', 'order', 'back'),
        b('上移一层', 'order', 'forward'), b('下移一层', 'order', 'backward'),
        b('复制形状', 'duplicateShape'), b('删除形状', 'deleteShape'),
        m('对齐幻灯片', 'alignOn', ALIGN_ON)
      ]),
      g('格式', [
        c('形状填充', 'shapeFill'), c('线条色', 'shapeLine'),
        m('线宽', 'shapeLineWidth', [0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((v) => ({ label: `${v}pt`, args: [v] }))),
        m('虚线', 'shapeDash', [
          { label: '实线', args: ['solid'] }, { label: '虚线', args: ['dash'] },
          { label: '点线', args: ['dot'] }, { label: '长虚线', args: ['lgDash'] }
        ]),
        c('背景', 'slideBg'),
        m('文本垂直对齐', 'anchor', [{ label: '上', args: ['t'] }, { label: '中', args: ['ctr'] }, { label: '下', args: ['b'] }])
      ]),
      g('动画', [
        m('出现动画', 'shapeAnim', [
          { label: '出现', args: ['appear'] }, { label: '淡入', args: ['fade'] }, { label: '擦除', args: ['wipe'] },
          { label: '旋转', args: ['spin'] }, { label: '放大/缩小', args: ['growShrink'] },
          { label: '消失', args: ['disappear'] }, { label: '淡出', args: ['fadeOut'] }
        ]),
        b('移除动画', 'shapeAnim', null),
        b('播放动画', 'playAnims'),
        m('切换效果', 'slideTransition', [
          { label: '淡入', args: ['fade'] }, { label: '擦除', args: ['wipe'] },
          { label: '推入', args: ['push'] }, { label: '切入', args: ['cut'] }
        ]),
        b('移除切换', 'slideTransition', null)
      ]),
      g('编辑', [b('↶', 'undo', false), b('↷', 'undo', true)])
    ]
  },
  {
    id: 'insert', label: '插入', groups: [
      g('插图', [m('形状', 'insertShape', SHAPES), b('图片', 'insertShape', 'image'), b('文本框', 'insertShape', 'text')]),
      g('幻灯片', [b('标题页', 'addSlide', 'title'), b('内容页', 'addSlide', 'content'), b('空白页', 'addSlide', 'blank')])
    ]
  },
  {
    id: 'view', label: '视图', groups: [
      g('演示文稿视图', [
        b('普通', 'setView', 'normal'), b('幻灯片浏览', 'setView', 'browse'), b('放映', 'setView', 'present'),
        b('从头放映', 'presentFrom')
      ]),
      g('显示', [m('缩放', 'setZoom', ZOOMS), b('适应窗口', 'fit')])
    ]
  }
]

export const RIBBON: Record<string, Tab[]> = { docx: DOCX, xlsx: XLSX, pptx: PPTX }
export { COLORS, fmt, sheetOp }
