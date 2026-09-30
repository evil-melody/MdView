/**
 * Toolbar ↔ editor contract.
 *
 * The toolbar is a dumb view: it renders buttons and reports the *intent* it was clicked for. The
 * container owns the document, so only it can turn an intent into ops (`elementOps.*`, `slideOps.*`)
 * and persist the result. Keeping the union in one place means a new toolbar button cannot be added
 * without handling it.
 */
import type { AlignMode, AnimEffect, FontPatch, ShapePreset, TransitionKind } from './ops'

export type { AnimEffect, TransitionKind }

export type InsertKind = 'textbox' | ShapePreset | 'picture' | 'table' | 'line'

export type OrderDir = 'front' | 'back' | 'forward' | 'backward'

/** Where a find & replace runs. */
export type FindScope = 'deck' | 'slide'

export type EditorAction =
  | { kind: 'slide.add' }
  | { kind: 'slide.dup' }
  | { kind: 'slide.del' }
  | { kind: 'slide.up' }
  | { kind: 'slide.down' }
  | { kind: 'slide.background'; value: string }
  | { kind: 'slide.notes'; value: string }
  | { kind: 'slide.transition'; value: TransitionKind }
  | { kind: 'slide.hidden'; value: boolean }
  | { kind: 'slide.advance'; value: number | null }
  | { kind: 'deck.findReplace'; find: string; replace: string; matchCase: boolean; scope: FindScope }
  | { kind: 'insert'; what: InsertKind }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'element.delete' }
  | { kind: 'element.group' }
  | { kind: 'element.ungroup' }
  | { kind: 'element.order'; dir: OrderDir }
  | { kind: 'element.opacity'; value: number }
  | { kind: 'element.cropReset' }
  | { kind: 'element.link'; url: string | null }
  | { kind: 'element.shadow'; value: boolean }
  /** `''` clears the animated element's timeline entries */
  | { kind: 'element.animation'; value: AnimEffect | '' }
  /** cell shading for the selected table cell; null clears the direct fill */
  | { kind: 'table.cellFill'; value: string | null }
  /** open the inline editor over the selected table cell */
  | { kind: 'table.cellEdit' }
  | { kind: 'align'; mode: AlignMode }
  | { kind: 'distribute'; axis: 'horizontal' | 'vertical' }
  | { kind: 'format.fill'; value: string }
  | { kind: 'format.stroke'; value: string | null }
  | { kind: 'format.font'; patch: FontPatch }
  /** Rich-text command while the inline text overlay is open (routed to `document.execCommand`). */
  | { kind: 'text.exec'; cmd: string; value?: string }

/**
 * What the container knows about the current selection, flattened for the toolbar. `null` props mean
 * "mixed or not applicable" — the toolbar then shows the control in an indeterminate state.
 */
export interface SelectionInfo {
  count: number
  kind: 'text' | 'shape' | 'picture' | 'table' | 'chart' | 'group' | 'other' | null
  isPicture: boolean
  canUngroup: boolean
  hasText: boolean
  fill: string | null
  stroke: string | null
  fontColor: string | null
  fontSizePx: number | null
  bold: boolean
  italic: boolean
  underline: boolean
  opacity: number
  /** entrance effect currently on the element (`null` = none / mixed) */
  animation: string | null
  /** element ids in paint order (needed by group / align / distribute) */
  ids: string[]
}

/** Per-slide state the deck panel shows; `notes` lives outside the render tree. */
export interface SlideState {
  notes: string
  transition: TransitionKind
  advanceMs: number | null
  hidden: boolean
}

/** Selected table cell (the overlay reports it after a click on a cell frame). */
export interface CellState {
  /** durable id of the table element */
  key: string
  row: number
  col: number
  fillHex: string | null
}

/** Insert-menu entries the toolbar offers, with their labels. */
export const INSERT_ITEMS: { what: InsertKind; label: string; hint: string }[] = [
  { what: 'textbox', label: '文本框', hint: '点击幻灯片放置文本框' },
  { what: 'rect', label: '矩形', hint: '插入矩形' },
  { what: 'roundRect', label: '圆角矩形', hint: '插入圆角矩形' },
  { what: 'ellipse', label: '椭圆', hint: '插入椭圆' },
  { what: 'line', label: '直线', hint: '从选中元素拖到目标位置的连接线' },
  { what: 'picture', label: '图片', hint: '选择本地图片插入' },
  { what: 'table', label: '表格', hint: '插入 3×3 表格' }
]

export const ALIGN_ITEMS: { mode: AlignMode; label: string; hint: string }[] = [
  { mode: 'left', label: '⇤', hint: '左对齐' },
  { mode: 'centerH', label: '↔', hint: '水平居中' },
  { mode: 'right', label: '⇥', hint: '右对齐' },
  { mode: 'top', label: '⤒', hint: '顶端对齐' },
  { mode: 'centerV', label: '↕', hint: '垂直居中' },
  { mode: 'bottom', label: '⤓', hint: '底端对齐' }
]

export const ORDER_ITEMS: { dir: OrderDir; label: string; hint: string }[] = [
  { dir: 'front', label: '置顶', hint: '移到最前' },
  { dir: 'forward', label: '上移', hint: '前移一层' },
  { dir: 'backward', label: '下移', hint: '后移一层' },
  { dir: 'back', label: '置底', hint: '移到最后' }
]

/** Slide transitions offered by the deck panel (matches the generator's TRANSITION_KINDS). */
export const TRANSITION_ITEMS: { value: TransitionKind; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'morph', label: '平滑' },
  { value: 'fade', label: '淡出' },
  { value: 'push', label: '推入' },
  { value: 'wipe', label: '擦除' },
  { value: 'split', label: '分割' },
  { value: 'circle', label: '圆形' },
  { value: 'cover', label: '覆盖' },
  { value: 'pull', label: '揭开' },
  { value: 'dissolve', label: '溶解' },
  { value: 'zoom', label: '缩放' },
  { value: 'random', label: '随机' }
]

/**
 * Entrance effects the element toolbar offers. Only entrance presets are listed: emphasis/exit
 * presets need a trigger the editor does not model yet, and mixing classes on one shape is what
 * PowerPoint's own Animation pane warns about.
 */
export const ANIM_ITEMS: { value: AnimEffect | ''; label: string }[] = [
  { value: '', label: '无' },
  { value: 'appear', label: '出现' },
  { value: 'fade', label: '淡入' },
  { value: 'flyIn', label: '飞入' },
  { value: 'wipe', label: '擦除' },
  { value: 'splitIn', label: '劈裂' },
  { value: 'zoom', label: '缩放' },
  { value: 'bounce', label: '弹跳' },
  { value: 'flipIn', label: '翻转' }
]
