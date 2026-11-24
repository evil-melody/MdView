/** Geometry in px (96 dpi, EMU/9525); font sizes in pt. */

export type Fill =
  | { t: 'solid'; c: string }
  | { t: 'grad'; css: string }
  | { t: 'img'; target: string; tile?: boolean }
  | { t: 'none' }

export interface Stroke {
  c: string
  w: number
  dash?: string
  head?: string
  tail?: string
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
  rot?: number
  flipH?: boolean
  flipV?: boolean
}

export interface TRun {
  text: string
  sz: number
  b?: boolean
  i?: boolean
  u?: boolean
  strike?: boolean
  color?: string
  font?: string
  baseline?: number
  caps?: boolean
  href?: string
  hl?: string
  br?: boolean
  /** slide field (number/date): kept as an object when editing */
  fld?: boolean
  /** [paragraph, run] index in the original shape XML */
  src?: [number, number]
}

export interface TPara {
  algn: 'left' | 'center' | 'right' | 'justify'
  marL: number
  indent: number
  /** line height multiplier or px */
  lnPct?: number
  lnPx?: number
  spcBef: number
  spcAft: number
  bullet?: { text: string; color?: string; font?: string; sz: number }
  /** outline level and bullet kind (editor state) */
  lvl?: number
  buKind?: 'none' | 'bullet' | 'number'
  runs: TRun[]
  endSz: number
  /** template paragraph index in the original shape XML */
  k?: number
}

export interface TextBody {
  anchor: 't' | 'ctr' | 'b'
  ins: [number, number, number, number]
  wrap: boolean
  vert?: string
  paras: TPara[]
  /** placeholder without text (editable, invisible when viewing) */
  empty?: boolean
}

/** SmartArt（diagram data part）降级渲染的节点：坐标已换算为幻灯片 px（96dpi） */
export interface SmartArtNode {
  /** dgm:pt 的 modelId（写回 dgm:t 的定位键） */
  id: string
  text: string
  x: number
  y: number
  w: number
  h: number
}

/** 原生图表类型：bar（柱）/ line（折线）/ pie（饼）可渲染可编辑；其余类型降级为 other（视图显示「未识别图表类型」） */
export type ChartType = 'bar' | 'line' | 'pie' | 'other'

/** 图表系列：名称 + 分类（类别轴）+ 数值；ref 记录 c:f 公式（写回源单元格时用） */
export interface ChartSeries {
  name: string
  /** c:tx 的 strRef 公式，如 Sheet1!$B$1 */
  nameRef?: string
  cat: { values: string[]; ref?: string }
  val: { values: number[]; ref?: string }
}

/** 图表数据（图表 part 解析结果；写回时按系列顺序覆盖） */
export interface ChartData {
  type: ChartType
  series: ChartSeries[]
  catAxisTitle?: string
  valAxisTitle?: string
  /** 横向柱状图（c:barDir val="bar"） */
  horizontal?: boolean
  /** 未识别图表类型的原始标签（type 为 other 时），如 areaChart */
  rawType?: string
}

/** 动画效果 preset：entrance（appear/fade/wipe）、emphasis（spin/growShrink）、
 *  exit（disappear/fadeOut）统一命名空间——exit 的淡出用 fadeOut，避免与 entr 的 fade 重名。 */
export type AnimPreset = 'appear' | 'fade' | 'wipe' | 'spin' | 'growShrink' | 'disappear' | 'fadeOut'
/** p:timing mainSeq 里按 clickEffect 节点文档顺序解析出的单个效果 */
export interface AnimSeqItem {
  /** 形状 OOXML id（p:spTgt spid） */
  spid: number
  preset: AnimPreset
  /** PowerPoint 的 presetClass */
  cls: 'entr' | 'emph' | 'exit'
  /** cTn@dur（毫秒，parseInt 口径）；缺省 undefined（sdkjs Unspecified）。'indefinite' → Infinity（Indefinite） */
  dur?: number
  /** 首个 stCondLst/cond@delay（毫秒，同 parseTimeValue 口径）；缺省 undefined，'indefinite' → Infinity */
  delay?: number
}

/** `top`: id of the slide-level element (selection / move); `sid`: own id of a text shape (text editing) */
export type SlideEl = (
  | { t: 'shape'; box: Box; geom: string; adj?: Record<string, number>; fill?: Fill; stroke?: Stroke; text?: TextBody; path?: string; sid?: number; /** 占位符信息（p:ph）：type + idx。继承自版式时 sid 缺失，需先实例化才能编辑/移动 */ ph?: { type: string; idx?: string } }
  | { t: 'pic'; box: Box; target?: string; crop?: [number, number, number, number]; stroke?: Stroke; geom?: string; video?: boolean }
  | { t: 'table'; box: Box; cols: number[]; rows: { h: number; cells: TCell[] }[] }
  | { t: 'smartart'; box: Box; nodes: SmartArtNode[]; links: [string, string][] }
  | { t: 'chart'; box: Box; data: ChartData }
  | { t: 'placeholder'; box: Box; label: string }
) & { top?: number; /** 该形状首个动画效果 preset（p:timing）；多效果见 SlideModel.animSeq */ anim?: string }

/** 'text', 'line', 'image' or any DrawingML preset geometry name (rect, ellipse, star5, chevron…) */
export type ShapeKind = 'text' | 'line' | 'image' | (string & {})

export type ShapeOp =
  | { op: 'xfrm'; top: number; box: Box }
  | { op: 'delete'; top: number }
  | { op: 'fill'; top: number; color: string | null }
  | { op: 'line'; top: number; color?: string | null; w?: number; dash?: string }
  | { op: 'order'; top: number; to: 'front' | 'back' | 'forward' | 'backward' }
  | { op: 'duplicate'; top: number; dx?: number; dy?: number }
  /** vertical text anchor of a text shape (by shape id) */
  | { op: 'anchor'; sid: number; anchor: 't' | 'ctr' | 'b' }
  /** slide background color (null = follow layout) */
  | { op: 'bg'; color: string | null }
  | { op: 'insert'; kind: ShapeKind; box: Box; text?: string; rid?: string }
  /** 改主题 clrScheme 某个配色键（accent1..6 / dk1 / lt1 / dk2 / lt2 / hlink / folHlink），写真实 OOXML */
  | { op: 'themeColor'; key: string; color: string }
  /** 改当前母版背景（null = 删除 bg，跟随主题） */
  | { op: 'masterBg'; color: string | null }
  /** 切换当前幻灯片使用的 layout（按 part 路径） */
  | { op: 'setLayout'; layout: string }
  /** 表格单元格文本（graphicFrame 内 a:tbl，row/col 为 tr/tc 子元素序号） */
  | { op: 'cellText'; top: number; row: number; col: number; text: string }
  /** 表格行增删（add 插在 at 之后；delete 移除第 at 行） */
  | { op: 'tblRow'; top: number; kind: 'add' | 'delete'; at: number }
  /** 表格列增删（同 tblRow 语义，作用于 tblGrid 与各 tr 的 tc） */
  | { op: 'tblCol'; top: number; kind: 'add' | 'delete'; at: number }
  /** 形状文本写回（p:sp 的 txBody；按行重建段落，沿用原段落 pPr 与首个 run 的 rPr） */
  | { op: 'shapeText'; top: number; lines: string[] }
  /** 形状动画（p:timing；entrance/emphasis/exit 各 preset；null = 移除该形状动画） */
  | { op: 'anim'; top: number; preset: AnimPreset | null }
  /** 幻灯片切换（p:transition；null = 移除） */
  | { op: 'transition'; kind: 'fade' | 'wipe' | 'push' | 'cut' | null }
  /** SmartArt 节点文本写回 diagrams/dataN.xml 的 dgm:t（node 为 dgm:pt modelId） */
  | { op: 'dgmText'; top: number; node: string; text: string }
  /** 图表数据写回（graphicFrame → c:chart → chart part 缓存 + c:f 指向的源工作簿单元格） */
  | { op: 'chartData'; top: number; data: ChartData }

/** 主题 / 母版 / 版式编辑面板所需信息，随 SlideModel 一起返回，视图只读 */
export interface SlideThemeInfo {
  /** 主题配色：dk1/lt1/dk2/lt2/accent1..6/hlink/folHlink */
  colors: Record<string, string>
  /** 主题 part 路径（编辑目标） */
  themePart: string
  /** 当前母版 */
  master: { path: string; name: string; bg?: string }
  /** 该母版下所有可切换 layout */
  layouts: { path: string; name: string; type?: string }[]
  /** 当前幻灯片使用的 layout 路径 */
  layout: string
}

export type SlideOp =
  | { op: 'add'; after: number; layout?: 'title' | 'content' | 'blank' }
  | { op: 'duplicate'; index: number }
  | { op: 'delete'; index: number }
  | { op: 'move'; from: number; to: number }
  | { op: 'hide'; index: number; hidden: boolean }

export interface TCell {
  text?: TextBody
  fill?: Fill
  bl?: Stroke
  br?: Stroke
  bt?: Stroke
  bb?: Stroke
  colSpan: number
  rowSpan: number
  hidden: boolean
}

export interface SlideModel {
  index: number
  w: number
  h: number
  bg?: Fill
  els: SlideEl[]
  notes?: string
  /** slide 级切换效果（p:transition 的首个子元素名：fade / wipe / push…） */
  transition?: string
  /** p:timing mainSeq 的 clickEffect 播放顺序（spid→preset）；缺省时视图回退按元素序播放 */
  animSeq?: AnimSeqItem[]
  hidden?: boolean
  /** 主题 / 母版 / 版式信息（存在 theme part 时才有） */
  theme?: SlideThemeInfo
}

export interface PresentationMeta {
  w: number
  h: number
  count: number
  slides: { index: number; path: string; hidden: boolean }[]
}

export interface PRunSet {
  b?: boolean
  i?: boolean
  u?: boolean
  strike?: boolean
  sz?: number
  color?: string | null
  font?: string
  hl?: string | null
  /** percent of the font size (+30 superscript, -25 subscript), null = normal */
  baseline?: number | null
}

export interface PRunSpec {
  text: string
  src?: [number, number]
  set?: PRunSet
  fld?: boolean
}

export interface PParaSpec {
  k?: number
  algn?: 'left' | 'center' | 'right' | 'justify'
  /** outline level 0-8 */
  lvl?: number
  bullet?: 'none' | 'bullet' | 'number'
  /** line spacing multiplier */
  lnPct?: number
  runs: PRunSpec[]
}
