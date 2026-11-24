export interface SheetInfo {
  name: string
  index: number
  path: string
  hidden: boolean
}

/** CSS-ish props for a cell format (cellXfs entry). Keys are React style keys. */
export type CellCss = Record<string, string | number>

export interface WorkbookMeta {
  sheets: SheetInfo[]
  styles: CellCss[]
  /** number format code per style */
  formats: string[]
  /** CSS for font 0 (grid default) */
  baseFont: CellCss
  date1904: boolean
}

export interface ColInfo {
  min: number
  max: number
  /** px; 0 when hidden */
  w: number
  /** width before hiding (px) */
  prevW?: number
}

export interface Merge {
  r0: number
  c0: number
  r1: number
  c1: number
}

export interface SheetProgress {
  sheet: number
  /** number of rows known so far (max row index + 1) */
  rows: number
  cols: number
  /** custom row sizes discovered since last progress: [row, px] (0 = hidden) */
  rowSizes: [number, number][]
  done: boolean
  /** only in the first progress message */
  colInfo?: ColInfo[]
  defaultColW?: number
  defaultRowH?: number
  frozen?: { rows: number; cols: number }
  gridLines?: boolean
  /** only when done */
  merges?: Merge[]
  error?: string
  /** formula values were (re)computed: cached rows are stale */
  recalc?: boolean
}

/** [col, text, styleIndex, kind (0 text,1 number,2 center), color?] */
export type CellOut = [number, string, number, number, string?]

export interface RowOut {
  r: number
  cells: CellOut[]
}

export interface BlockOut {
  sheet: number
  r0: number
  r1: number
  rows: RowOut[]
  complete: boolean
}

export interface CellDetail {
  value: string
  formula?: string
  type: string
}

export interface CellInput {
  r: number
  c: number
  /** raw user input ('' clears; '=…' formula) */
  input: string
}

export type BorderKind = 'all' | 'outer' | 'inner' | 'none' | 'top' | 'bottom' | 'left' | 'right'

export interface FmtPatch {
  border?: BorderKind
  borderColor?: string
  b?: boolean
  i?: boolean
  u?: boolean
  strike?: boolean
  color?: string | null
  fill?: string | null
  align?: 'left' | 'center' | 'right' | null
  valign?: 'top' | 'center' | 'bottom' | null
  /** text rotation in degrees (-90…90), 255 = vertical stack, null = none */
  rotate?: number | null
  wrap?: boolean
  numFmt?: string
  sz?: number
  font?: string
  borderStyle?: 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double'
  /** 缩进级数的增量（+1 增加一级，-1 减少一级；0 = 清除缩进） */
  indent?: number
  /** reset to the default style */
  clear?: boolean
  /** apply this exact style index (paint format) */
  xf?: number
}

/**
 * 页面设置：落到 sheet 的 `pageSetup` / `pageMargins` / `printOptions` / `headerFooter` / `sheetProtection` 元素，
 * 真实写进 OOXML（不是只改视图状态）。
 */
export interface XlsxPageSetup {
  /** OOXML paperSize 编号（9 = A4，8 = A3，11 = A5，1 = Letter，5 = Legal，13 = B5） */
  paper?: number
  orientation?: 'portrait' | 'landscape'
  /** 页边距（磅）：top/right/bottom/left，header/footer 为页眉页脚距边界距离 */
  margins?: { top: number; right: number; bottom: number; left: number; header?: number; footer?: number }
  /** 打印网格线 */
  gridLines?: boolean
  /** 工作表保护（只读保护位） */
  protect?: boolean
  /** 页眉 / 页脚文本（可用 &L &C &R 片段） */
  header?: string
  footer?: string
}

/** 工作簿统计信息（`xlsx.stats`） */
export interface XlsxStats {
  sheet: number
  /** 已用行数 / 列数 */
  rows: number
  cols: number
  /** 非空单元格数 */
  cells: number
  /** 公式单元格数 */
  formulas: number
}

/** 一个公式单元格（`xlsx.formulas`） */
export interface XlsxFormulaCell {
  r: number
  c: number
  /** 公式文本（含前导 =） */
  f: string
}

/** 定义名称（`xlsx.names`）：工作簿级或某个工作表级（scope = 工作表下标） */
export interface DefinedName {
  name: string
  /** 引用文本，如 `Sheet1!$A$1:$B$9` */
  refersTo: string
  scope?: number
}

export interface Range {
  r0: number
  c0: number
  r1: number
  c1: number
}

export interface XlsxEditResult {
  sheet: number
  range: Range
  /** style entries appended to the workbook (index → css/format) */
  styles?: { index: number; css: CellCss; format: string }[]
  /** full layout after structural edits (sizes, merges, frozen panes…) */
  layout?: SheetProgress
  /** sheet list changed */
  sheets?: SheetInfo[]
  /** sheets whose formula values changed (cached rows are stale) */
  recalc?: number[]
}

export type SheetOp =
  | { op: 'insertRows' | 'deleteRows' | 'insertCols' | 'deleteCols'; at: number; n: number }
  | { op: 'merge' | 'unmerge'; range: Range; mode?: 'all' | 'across' | 'down' }
  | { op: 'hideRows' | 'hideCols'; a: number; b: number; hidden: boolean }
  | { op: 'gridlines'; show: boolean }
  | { op: 'colWidth'; c0: number; c1: number; px: number }
  | { op: 'rowHeight'; r0: number; r1: number; px: number }
  /** P5 对话框口径（Excel 同款）：chars 输入，内核三段式 chars→px（setColWidth Workbook.js:8863-8864） */
  | { op: 'colWidthChars'; c0: number; c1: number; chars: number }
  /** P5 内核 autoFit（_autoFitColumnWidth WorksheetView.js:19335 / _updateRowHeight :10430） */
  | { op: 'autoFitCols'; c0: number; c1: number }
  | { op: 'autoFitRows'; r0: number; r1: number }
  | { op: 'freeze'; rows: number; cols: number }
  | { op: 'fill'; range: Range; dir: 'down' | 'right' | 'up' | 'left'; mode?: FillMode; src?: Range }
  | { op: 'pageSetup'; setup: XlsxPageSetup }
  | SeriesOp
  | { op: 'moveRange'; from: Range; dr: number; dc: number }
  | { op: 'sort'; range: Range; col: number; desc?: boolean }

export type BookOp =
  | { op: 'add'; name?: string; after?: number }
  | { op: 'rename'; index: number; name: string }
  | { op: 'delete'; index: number }
  | { op: 'move'; from: number; to: number }
  | { op: 'hide'; index: number }
  | { op: 'unhide'; index: number }
  /** 定义名称（scope = 工作表下标时为工作表级名称） */
  | { op: 'defineName'; name: string; refersTo: string; scope?: number }
  | { op: 'deleteName'; name: string; scope?: number }
  /** 保护工作簿结构 */
  | { op: 'protectWorkbook'; lock: boolean }
  /** 建议以只读方式打开（workbook.xml 的 fileSharing） */
  | { op: 'readOnlyRecommended'; on: boolean }

/** 拖拽填充后「自动填充选项」的重算模式（Office 同名命令） */
export type FillMode = 'copyValues' | 'fillSeries' | 'fillFormats' | 'fillWithoutFormat'

/** 「序列」对话框参数：沿行或列生成等差/等比/日期序列（auto = 按前两格差值递推） */
export type SeriesType = 'linear' | 'growth' | 'date' | 'auto'
export type SeriesUnit = 'day' | 'weekday' | 'month' | 'year'
export interface SeriesOp {
  op: 'series'
  range: Range
  dir: 'row' | 'col'
  type: SeriesType
  /** 日期类型递增单位（其余类型忽略） */
  unit?: SeriesUnit
  step: number
  /** 终止值（含），超出即停；省略 = 填满选区 */
  stop?: number
}

/**
 * 可刷新序列对象：私有 sidecar `xl/mdview/features.json` 里保存的「序列…」对话框定义，
 * 与 chart / pivot 定义同结构。结果本身是普通单元格值（无额外 OOXML part），
 * 但定义可让 `xlsx.seriesRefresh` 在源数据改动后按参数重算写回。
 */
export interface SeriesFeature {
  id: number
  range: Range
  dir: 'row' | 'col'
  type: SeriesType
  unit: SeriesUnit
  step: number
  stop?: number
  /** 写入时起始格的数值（记录用；刷新时从当前源格重读，以跟随源数据改动） */
  start: number
  /** 写入时工作簿的日期系统：刷新按此基准换算，避免 date1904 切换后序列漂移 */
  date1904: boolean
}

/** `xlsx.seriesList` 读回的序列定义列表 */
export type SeriesListResult = SeriesFeature[]

/** Insert an image anchored to a cell as a floating drawing (like Excel's "paste picture to cell"). */
export interface XlsxImageOp {
  /** image bytes — ArrayBuffer (same encoding as `docx.image`, e.g. `await file.arrayBuffer()`) or Uint8Array */
  bytes: ArrayBuffer | Uint8Array
  /** file extension without the dot: png | jpg | jpeg | gif | bmp | webp … */
  ext: string
  /** anchor: top-left cell (0-based) and render size in pixels */
  anchor: { row: number; col: number; wPx: number; hPx: number }
  /** Excel「置于单元格」：twoCellAnchor editAs="oneCell"，图片随格移动，不自由漂浮 */
  placeInCell?: boolean
}

/** result of `xlsx.image` — the image's relationship id (r:embed in the drawing) */
export interface XlsxImageResult {
  rid: string
  /** 「置于单元格」撑大了宿主列宽 / 行高时回传新布局，视图据此重排网格 */
  layout?: SheetProgress
}

/** one floating picture on a sheet, with absolute geometry in unzoomed layout px (same math the viewer uses) */
export interface XlsxDrawingInfo {
  /** cNvPr id of the pic (stable key across re-opens) */
  id: number
  /** image relationship id inside the drawing part */
  rid: string
  /** media part path, e.g. `xl/media/image1.png` — the view resolves it to a URL via client.mediaUrl */
  media: string
  ext: string
  /** true when the anchor is editAs="oneCell" (Excel「置于单元格」：图片填满宿主格，不可自由漂浮) */
  cell?: boolean
  /** 格内图的宿主格（0-based）；仅 cell 为真时给出 */
  host?: { row: number; col: number }
  /** absolute top-left px from the sheet origin (hidden rows/cols contribute 0, matching the grid) */
  x: number
  y: number
  w: number
  h: number
}

export interface XlsxDrawingsResult {
  drawings: XlsxDrawingInfo[]
}

/**
 * Edits one floating picture by its index in `xlsx.drawings`: `move` keeps the size, `resize` sets the full
 * box, `delete` removes the anchor (and its media / rels orphans). x / y / w / h are absolute px — the kernel
 * converts them back to twoCellAnchor cell anchors so real Office opens the picture in the same place.
 */
export type XlsxDrawingOp =
  | { kind: 'move'; index: number; x: number; y: number }
  | { kind: 'resize'; index: number; x: number; y: number; w: number; h: number }
  | { kind: 'delete'; index: number }

export interface FindOptions {
  matchCase?: boolean
  /** whole cell contents */
  whole?: boolean
  /** search formula text instead of values */
  formulas?: boolean
}

export interface FindMatch {
  r: number
  c: number
  /** text the match was found in (value or formula) */
  text: string
}

// ---------------------------------------------------------------- native OOXML features (chart / condFmt / validation / slicer / pivot)
// These are the *stored* descriptions kept in our `xl/mdview/features.json` sidecar; the kernel
// regenerates the real OOXML parts (chart parts, conditionalFormatting + dxfs, dataValidations,
// slicer parts, pivot parts) from them on every write, so save → reopen → read back is 1:1.

export type ChartKind = 'col' | 'bar' | 'line' | 'pie'
export interface ChartSeries { name: string; values: number[] }
export interface ChartData { cats: string[]; series: ChartSeries[] }

export interface ChartFeature {
  id: number
  kind: ChartKind
  title: string
  /** the source cells the chart was built from (used by refresh) */
  source: Range
  data: ChartData
  anchor: { row: number; col: number; wPx: number; hPx: number }
  /** part paths + relationship id, assigned by the kernel at add time */
  chartPart: string
  drawingPart: string
  rid: string
  /** absolute layout px (unzoomed) computed on read from the anchor, mirrors XlsxDrawingInfo */
  x?: number
  y?: number
  w?: number
  h?: number
}
export interface ChartAddOp {
  kind: ChartKind
  title: string
  source: Range
  data: ChartData
  anchor: { row: number; col: number; wPx: number; hPx: number }
}

export type CondFmtType = 'cellIs' | 'containsText' | 'top10' | 'colorScale' | 'dataBar'
export interface CondFmtRule {
  id: number
  sqref: Range
  type: CondFmtType
  /** cellIs: 'greaterThan' | 'lessThan' | 'between' | 'equal' | ... ; numeric / date / textLength similar */
  operator?: string
  formula1?: string
  formula2?: string
  /** containsText */
  text?: string
  /** top10 rank (10 = top 10, 3 = top 3) */
  rank?: number
  percent?: boolean
  bottom?: boolean
  /** fill / font colour as 6-hex (no leading #) for cellIs / containsText / top10 */
  color?: string
  fontColor?: string
  /** colorScale */
  colorMin?: string
  colorMid?: string
  colorMax?: string
  /** dataBar */
  barColor?: string
}

export type ValidationType = 'list' | 'whole' | 'decimal' | 'date' | 'textLength'
export interface ValidationRule {
  id: number
  sqref: Range
  type: ValidationType
  operator?: string
  formula1: string
  formula2?: string
  /** for the view's self-drawn dropdown (list types) */
  items?: string[]
  allowBlank?: boolean
  showInputMessage?: boolean
  showErrorMessage?: boolean
  promptTitle?: string
  prompt?: string
  errorTitle?: string
  error?: string
  errorStyle?: 'stop' | 'warning' | 'information'
}

export interface SlicerFeature {
  id: number
  name: string
  /** header + data rows; fieldCol is 0-based column inside source */
  source: Range
  fieldCol: number
  fieldName: string
  /** every distinct value in the field (for the button group) */
  items: string[]
  /** currently visible values (empty = all) */
  selected: string[]
  anchor: { row: number; col: number }
  cachePart: string
  slicerPart: string
  x?: number
  y?: number
}
export interface SlicerAddOp {
  name: string
  source: Range
  fieldCol: number
  fieldName: string
  items: string[]
  anchor: { row: number; col: number }
}

export type PivotAgg = 'sum' | 'count' | 'avg' | 'max' | 'min'
export interface PivotFeature {
  id: number
  name: string
  source: Range
  location: { r0: number; c0: number }
  rows: number[]
  cols: number[]
  values: { c: number; agg: PivotAgg }[]
  cacheId: number
  cacheDefPart: string
  cacheRecPart: string
  tablePart: string
}
export interface PivotAddOp {
  name: string
  source: Range
  location: { r0: number; c0: number }
  rows: number[]
  cols: number[]
  values: { c: number; agg: PivotAgg }[]
}

export interface SheetFeatures {
  charts: ChartFeature[]
  condFmt: CondFmtRule[]
  validations: ValidationRule[]
  slicers: SlicerFeature[]
  pivots: PivotFeature[]
  series: SeriesFeature[]
}

/** result of `xlsx.features` */
export type FeaturesResult = SheetFeatures
