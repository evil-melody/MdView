<script setup lang="ts">
/**
 * Word 视图：内核流式块树 → 分页虚拟渲染；编辑交给内核 DocxEditor + RichInput。
 * 只挂载可见页，DOM 规模与文档长度解耦。
 */
import { ref, shallowRef, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import type { DocumentClient } from '../client'
import type { Block, DocxMeta } from '../client'
import { blocksHtml, estimateHeight } from '../docx-render'
import { MediaCache } from '../media'
import { officePrompt, officeAlert } from './officePrompt'
import { paginate } from '../view/docx/paginate'
import { DocxEditor, type DocState, type FormatState } from '../view/docx/DocxEditor'
import { installImagePaste } from '../view/docx/imagepaste'
import { deleteRange, insertText, runsText, type RRun, type Sel } from '../view/edit/rich'
import type { ParaDirty, RunSet, CanonStyle, PageSet, ParaStyle, RunStyle, WrapSpec, WrapKind, WrapPos, WrapRel, WrapAlign, Crop, HFKind, HFLine } from '../core/docx/types'
import { hfBlocksOf, hfEditHtml, hfEditKind, hfHtml, hfLinesFrom, hfLinesOf, hfStyle } from '../view/docx/hf'
import { cropFromDrag, cropOfSelected, cropPreview, setImageCrop } from '../view/docx/crop'
import { columnGeometry, columnAtX, columnRect, columnOfParagraph, paragraphInColumn, type ColumnGeom, type ColumnRect } from '../view/docx/cols'
import type { BorderPreset } from '../view/docx/tables'

const props = defineProps<{ client: DocumentClient; editable: boolean }>()
const emit = defineEmits<{ (e: 'change'): void; (e: 'error', m: string): void }>()

const version = ref(0)
const loading = ref(true)
/** 普通数组交给内核原地修改，避免 Vue Proxy 破坏 WeakMap 的对象身份 */
const st: DocState = { blocks: [], heights: new WeakMap<Block, number>(), rowHeights: new WeakMap<Block, number[]>(), dirty: new Set(), frontier: 0 }
const meta = shallowRef<DocxMeta | null>(null)
const formatState = shallowRef<FormatState | null>(null)
const editor = new DocxEditor(props.client, st, () => {
  version.value++
  emit('change')
})
editor.onState = (s) => (formatState.value = s)
// 冒烟探针需要直接驱动内核（如开启修订开关）来断言落盘；editor 实例在文件末尾随 commands 一并 defineExpose
// 保留内核原本的 onSelection（表格多格高亮 markCells + 工具条状态 emitState），
// 否则覆盖它会丢状态；格式刷只在选区稳定后套用，避免拖选过程中对每个中间选区
// 反复套用、只命中拖选起点那一小段（表现为“选了其他文字”）。
const baseOnSelection = editor.onSelection.bind(editor)
let painterTimer: number | null = null
editor.onSelection = (sel) => {
  baseOnSelection(sel)
  if (!bar.painter) return
  if (painterTimer) clearTimeout(painterTimer)
  painterTimer = window.setTimeout(() => {
    painterTimer = null
    if (bar.painter && editor.applyPainter()) bar.painter = false
  }, 120)
}
// 当前选中图片的环绕模型（自绘环绕菜单据此点亮并派生新 wrap）
const curWrap = ref<WrapSpec | null>(null)
// 当前选中图片的旋转角（度），供旋转手柄初值与视图旋转
const curRot = ref(0)
// 内核选区不再指向图片时收起选中框；点击链路不走 emitState，尺寸/偏移以 DOM 为准
editor.onImage = (img) => {
  curWrap.value = img?.wrap ?? null
  curRot.value = img?.rot ?? 0
  if (!img) {
    if (imgSel.value) imgSel.value = null
    cropMode.value = false
  }
}

/* ---- 页眉页脚：每页边距区渲染 + 双击进入编辑态（文本行经 docx.hf 写回 part） ---- */
// HF 变化（本端编辑 / 协作者 / 样式联动重转换）→ 换 meta 触发整页重渲
const applyHF = (headers: { header?: Block[]; footer?: Block[]; firstHeader?: Block[]; firstFooter?: Block[]; evenHeader?: Block[]; evenFooter?: Block[] }, titlePg?: boolean, evenAndOddHeaders?: boolean) => {
  if (!meta.value) return
  meta.value = { ...meta.value, header: headers.header, footer: headers.footer, firstHeader: headers.firstHeader, firstFooter: headers.firstFooter, evenHeader: headers.evenHeader, evenFooter: headers.evenFooter, ...(titlePg !== undefined ? { titlePg } : {}), ...(evenAndOddHeaders !== undefined ? { evenAndOddHeaders } : {}) }
  bar.titlePg = Boolean(meta.value.titlePg)
  version.value++
}
editor.onHF = (r) => applyHF(r.headers, r.titlePg, r.evenAndOddHeaders)
editor.onHeaders = (h) => applyHF(h)
/* 页面设置（纸张/方向/页边距/分栏）变化 → 换 meta.page 触发整页重渲。
   页宽/页高/内边距/栏数/分页全是 meta.page 的 computed 派生，不接这个回调就永远不重绘：
   工具条点了没反应（纸张尺寸不变、方向不变、页边距不变、分栏不生效）。 */
editor.onPage = (page) => {
  if (!meta.value) return
  meta.value = { ...meta.value, page }
  version.value++
  // 纸张/方向变了 → 每行容纳的字数变了 → 块高要重新测量，分页才准
  void postRender()
}
/** 命令失败：把消息交给宿主显示，不再静默失败 */
editor.onError = (m) => emit('error', m)
/** 正在编辑的页眉/页脚：区域所在页号 + 种类 */
const hfEdit = ref<{ kind: 'header' | 'footer'; idx: number } | null>(null)
const hfShowBlocks = (kind: 'header' | 'footer', idx: number) => hfBlocksOf(meta.value ?? {}, kind, idx)
const hfShowHtml = (kind: 'header' | 'footer', idx: number) => hfHtml(hfShowBlocks(kind, idx), idx, pages.value.length)
const hfPosStyle = (kind: 'header' | 'footer') => (meta.value ? hfStyle(meta.value.page, kind) : {})
const hfFontStyle = computed(() => ({ fontFamily: pageStyle.value.fontFamily, fontSize: pageStyle.value.fontSize }))
const hfEditContent = (kind: 'header' | 'footer', idx: number) => hfEditHtml(hfLinesOf(hfShowBlocks(kind, idx)))

function hfCommit() {
  const ed = hfEdit.value
  if (!ed) return
  hfEdit.value = null
  const box = rootEl.value?.querySelector<HTMLElement>(`[data-page="${ed.idx}"] .de-hf-edit`)
  if (!box) return
  const lines: HFLine[] = hfLinesFrom(box, hfLinesOf(hfShowBlocks(ed.kind, ed.idx)))
  const key: HFKind = hfEditKind(ed.kind, ed.idx, meta.value ?? {})
  void editor.setHeaderFooter({ parts: { [key]: lines } } as { parts: Partial<Record<HFKind, HFLine[]>> })
}

/* ---- 图片裁剪（a:srcRect）：双击选中图片切换裁剪态，四边中点手柄拖动改 srcRect ---- */
const cropMode = ref(false)
const CROP_SIDES = ['l', 't', 'r', 'b'] as const
let cropFinal: Crop | null = null

function startCropDrag(e: PointerEvent, handle: HTMLElement) {
  const sel = imgSel.value
  if (!sel) return
  e.preventDefault()
  const side = (handle.dataset.side ?? 'r') as 'l' | 't' | 'r' | 'b'
  const img = currentImage(sel)
  if (!img) return
  const cur = cropOfSelected(editor)
  const base: Crop = cur?.crop ? { ...cur.crop } : {}
  const x0 = e.clientX
  const y0 = e.clientY
  cropFinal = null
  drag = {
    move: (x, y) => {
      const dx = (x - x0) / pxPerPt()
      const dy = (y - y0) / pxPerPt()
      // 手柄向图内拖 = 该侧裁掉更多（右/下边向左/上为正，左/上边向右/下为正）
      const d = side === 'l' ? dx : side === 'r' ? -dx : side === 't' ? dy : -dy
      const c = cropFromDrag(side, d, base, sel.w, sel.h)
      cropFinal = c
      cropPreview(img, sel.w, sel.h, c)
    },
    end: () => {
      if (cropFinal) {
        editor.selectObject(sel.pa, sel.o)
        setImageCrop(editor, cropFinal)
      }
      cropFinal = null
    },
  }
  try { rootEl.value?.setPointerCapture(e.pointerId) } catch { /* 不支持时退化为 rootEl 内拖动 */ }
}
const media = new MediaCache(props.client)

const scrollEl = ref<HTMLElement | null>(null)
const rootEl = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportH = ref(800)
let ro: ResizeObserver | null = null
const offs: (() => void)[] = []

const PT = 96 / 72
const GAP = 16
/** 工具条可见状态：缩放 / 阅读模式 / 修订 / 首页不同 / 格式刷 */
const bar = reactive({ zoom: 1, readMode: false, tracking: false, titlePg: false, painter: false })
const rawPageW = computed(() => (meta.value?.page.w ?? 612) * PT)
const pageW = computed(() => rawPageW.value * bar.zoom)
/** 分页按原始纸张高度计算，缩放只作用于视觉层 */
const pageAvail = computed(() => {
  const p = meta.value?.page
  return p ? (p.h - p.mt - p.mb) * PT : 900
})
const pageH = computed(() => (meta.value?.page.h ?? 792) * PT * bar.zoom)
/** 页面字体 / 字号 / 页边距取自文档自身，避免所有 docx 被渲染成同一套版式 */
const pageStyle = computed(() => {
  const m = meta.value
  const p = m?.page
  return {
    width: rawPageW.value + 'px',
    height: (p?.h ?? 792) * PT + 'px',
    transform: `scale(${bar.zoom})`,
    transformOrigin: 'top left',
    padding: p ? `${p.mt * PT}px ${p.mr * PT}px ${p.mb * PT}px ${p.ml * PT}px` : '0',
    fontFamily: m?.font ? `${m.font}, "PingFang SC", "Microsoft YaHei", sans-serif` : '"Times New Roman", "PingFang SC", serif',
    fontSize: `${m?.sz ?? 10}pt`
  }
})
/** 分栏（sectPr w:cols）：正文块按栏宽流动，栏数/栏距随文档 */
const pageInnerStyle = computed(() => {
  const p = meta.value?.page
  const cols = p?.cols ?? 1
  return cols > 1
    ? { ...pageStyle.value, columnCount: String(cols), columnGap: ((p?.colGap ?? 36) * PT) + 'px' }
    : pageStyle.value
})
const hasCols = computed(() => (meta.value?.page.cols ?? 1) > 1)

/* ---- 分栏栏命中：点击时按 column-count/gap 几何算栏索引，高亮命中栏并把跑偏的光标校正回该栏 ---- */
/** 栏命中高亮：命中栏所在页号 + 该栏在页面内的相对矩形（供 overlay 定位） */
const colHit = ref<{ idx: number; rect: ColumnRect } | null>(null)
/** 诊断信息，冒烟探针从 editor.colDiag 读取（不进 defineExpose 的既有键） */
const colDiag = reactive({ hit: -1, corrected: 0, caretCol: -1 })
;(editor as unknown as { colDiag: typeof colDiag }).colDiag = colDiag

/**
 * 一次分栏点击：算命中栏 → 高亮 → 延迟到浏览器放好 caret 后，若它落在别的栏则校正回命中栏段落。
 * 仅在多栏正文点击时触发，单栏文档与页眉/页脚、图片手柄点击完全不受影响。
 */
function columnPointerDown(e: PointerEvent) {
  if (!hasCols.value || !props.editable || hfEdit.value) return
  const t = e.target instanceof Element ? (e.target as HTMLElement) : null
  const inner = t?.closest('.de-page-inner.de-cols') as HTMLElement | null
  if (!inner) return
  const page = t?.closest('[data-page]') as HTMLElement | null
  if (!page) return
  const g = columnGeometry(inner, page)
  if (!g) return
  const index = columnAtX(g, e.clientX)
  const rect = columnRect(g, index)
  const idx = Number(page.getAttribute('data-page') ?? 0)
  colHit.value = { idx, rect }
  colDiag.hit = index

  // 浏览器在 pointerdown 的默认行为里放 caret；等它落定后再判断是否需要校正
  const y = e.clientY
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const sel = editor.input.sel()
    if (!sel) return
    const root = rootEl.value
    const pel = root?.querySelector<HTMLElement>(`[data-pa="${sel.a.pa}"]`)
    const gg = columnGeometry(inner, page)
    if (!pel || !gg) return
    const caretCol = columnOfParagraph(gg, pel)
    if (caretCol === index) { colDiag.caretCol = index; return } // 浏览器本就落在命中栏，无需干预
    const target = paragraphInColumn(inner, gg, index, y)
    if (!target || target.pa === sel.a.pa) { colDiag.caretCol = caretCol; return }
    // 段落级校正：把 caret 放到命中栏内、垂直最接近点击处的段落开头（字符级精度受 contenteditable 限制）
    editor.input.restore({ a: { pa: target.pa, o: 0 }, f: { pa: target.pa, o: 0 } })
    colDiag.corrected++
    colDiag.caretCol = index
  }))
}

const pages = computed(() => {
  void version.value
  return paginate(
    st.blocks, st.heights, st.blocks.length, pageAvail.value,
    meta.value?.page.cols ?? 1,
    meta.value?.final ? meta.value.sectKind ?? 'nextPage' : 'nextPage',
    st.rowHeights
  )
})
const stride = computed(() => pageH.value + GAP)
const firstPage = computed(() => Math.max(0, Math.floor(scrollTop.value / stride.value) - 1))
const lastPage = computed(() =>
  Math.min(pages.value.length, firstPage.value + Math.ceil(viewportH.value / stride.value) + 3)
)
const visible = computed(() => {
  void version.value
  return pages.value.slice(firstPage.value, lastPage.value).map((slice, i) => {
    const idx = firstPage.value + i
    return {
      idx,
      html: blocksHtml(st.blocks.slice(slice.start, slice.end), {
        editable: props.editable,
        page: idx,
        pages: pages.value.length,
        offset: slice.start,
        frags: slice.frags
      })
    }
  })
})
const topPad = computed(() => firstPage.value * stride.value)
const bottomPad = computed(() => Math.max(0, pages.value.length - lastPage.value) * stride.value)

function onScroll() {
  scrollTop.value = scrollEl.value?.scrollTop ?? 0
  // 滚动会重挂页面（虚拟渲染）：页眉/页脚编辑先提交，避免丢字
  if (hfEdit.value) hfCommit()
}

/** 命令面：工具条只调这里，不直接碰内核 */
const commands = {
  // 开始
  undo: () => editor.undo(),
  redo: () => editor.redo(),
  painter: () => {
    bar.painter = !bar.painter
    if (bar.painter) editor.copyFormat()
  },
  copyFormat: () => editor.copyFormat(),
  clearFormat: () => editor.clearFormat(),
  toggle: (k: 'b' | 'i' | 'u' | 'strike') => editor.toggle(k),
  setSize: (n: number) => editor.setSize(n),
  setFont: (n: string) => editor.setFont(n),
  setColor: (c: string | null) => editor.setColor(c),
  setHighlight: (c: string | null) => editor.setHighlight(c),
  sup: () => editor.format({ va: 'sup' }, { va: 'sup' }),
  sub: () => editor.format({ va: 'sub' }, { va: 'sub' }),
  applyStyle: (k: string) => editor.applyCanon(k as CanonStyle),
  setAlign: (a: ParaStyle['align']) => editor.setPara({ align: a } as ParaDirty, { align: a }),
  setLine: (v: number) => editor.setPara({ line: v }),
  setPara: (patch: ParaDirty) => editor.setPara(patch),
  toggleList: (k: 'bullet' | 'number') => editor.toggleList(k),
  indent: (d: 1 | -1) => editor.indent(d),
  /* 真·查找替换栏：命中计数 / 前后跳转 / 高亮，替换经 editor.replace → 内核 docx.edit 回写 */
  find: (q?: string) => openFindBar(false, q),
  replace: (q?: string) => openFindBar(true, q),
  selectAll: () => editor.selectAll(),
  // 插入
  insertTable: (r: number, c: number) => editor.insertTable(r, c),
  tableOp: (k: 'rowAbove' | 'rowBelow' | 'colLeft' | 'colRight' | 'delRow' | 'delCol' | 'delTable') => editor.tableOp(k),
  mergeCells: () => editor.mergeCells(),
  unmergeCell: () => editor.unmergeCell(),
  distributeColumns: () => editor.distributeColumns(),
  setCellShade: (color: string | null) => editor.setCellShade(color),
  setCellBorders: (preset: string, css = '0.5pt solid #000000') => editor.setCellBorders(preset as BorderPreset, css),
  setCellVAlign: (v: 'top' | 'middle' | 'bottom') => editor.setCellVAlign(v),
  insertImage: (blob: Blob) => editor.insertImages([blob]),
  replaceImage: (blob: Blob) => editor.replaceImage(blob),
  insertLink: async () => editor.setLink((await officePrompt('链接地址', 'https://')) || null),
  insertPageBreak: () => editor.insertPageBreak(),
  setHeader: (text: string) => editor.setHeaderFooter({ parts: { header: [{ text, align: 'center' }] } }),
  setFooter: (text: string) => editor.setHeaderFooter({ parts: { footer: [{ text, align: 'center' }] } }),
  pageNumber: () => editor.setHeaderFooter({ parts: { footer: [{ text: '{PAGE}', align: 'center' }] } }),
  pageCount: () => editor.setHeaderFooter({ parts: { footer: [{ text: '{NUMPAGES}', align: 'center' }] } }),
  insertText: (s: string) => editor.insertText(s),
  imageScale: (f: number | 'fit') => editor.resizeImage(f),
  /** ribbon「裁剪」入口：需先单击选中图片，再切换四边手柄裁剪态（与双击图片等价） */
  toggleCrop: () => {
    if (imgSel.value) cropMode.value = !cropMode.value
  },
  setAltText: async () => {
    const v = await officePrompt('图片替代文字')
    if (v !== null) editor.setAltText(v)
  },
  clearHeader: () => editor.setHeaderFooter({ parts: { header: [] } }),
  clearFooter: () => editor.setHeaderFooter({ parts: { footer: [] } }),
  titlePg: (on: boolean) => {
    bar.titlePg = on
    void editor.setHeaderFooter({ titlePg: on })
  },
  // 布局
  setPage: (set: PageSet) => editor.setPage(set),
  // 审阅
  tracking: (on: boolean) => {
    bar.tracking = on
    editor.setTracking(on)
  },
  gotoChange: (d: 1 | -1) => editor.gotoChange(d),
  reviewChange: (accept: boolean, all: boolean) => editor.review(accept, all),
  addComment: async () => {
    const range = editor.commentRange()
    if (!range) return
    const text = await officePrompt('批注内容')
    if (!text) return
    const id = `c${Date.now()}`
    if (!editor.markComment(id, range)) return
    void props.client.call('comments.set', id, {
      id, author: { name: 'Me' }, time: new Date().toISOString(), text
    })
    emit('change')
  },
  listComments: async () => {
    const list = (await props.client.call('comments.list')) as { author?: { name?: string }; text?: string }[] | null
    const text = (list ?? []).map((c, i) => `${i + 1}. ${c.author?.name ?? '匿名'}：${c.text ?? ''}`).join('\n')
    await officeAlert('批注列表', text || '（暂无批注）')
  },
  updateStyle: () => {
    const s = editor.input.sel()
    const sid = s ? editor.para(s.a.pa)?.sid : undefined
    if (sid) void editor.updateStyle(sid)
  },
  deleteSelection: () => editor.deleteSelection(),
  // 视图
  setZoom: (z: number) => (bar.zoom = z),
  readMode: (on: boolean) => (bar.readMode = on),
  fitWidth: () => {
    const w = scrollEl.value?.clientWidth ?? 900
    bar.zoom = Math.min(2, Math.max(0.4, (w - 48) / rawPageW.value))
  },
  format: (s: Partial<RunStyle>, d: RunSet) => editor.format(s, d),
  state: () => editor.state(),
  canUndo: () => editor.canUndo,
  canRedo: () => editor.canRedo
}
defineExpose({ commands, formatState, bar, editor })

/* ---- 真·查找替换栏 ------------------------------------------------------------
 * 查找：纯前端在已加载的 blocks 上按段落跑（模型偏移与 runsText 一致，对象计 1 字符）。
 * 高亮：CSS Custom Highlight API —— 只建 Range 不改 DOM，不破坏 contenteditable
 *       的选区映射；WebView 不支持时降级为仅计数 + 跳转。
 * 替换：逐段右→左删旧插新，经 editor.replace 走内核 docx.edit（含撤销 / worker 镜像）。
 * ----------------------------------------------------------------------------- */
type DocHit = { pa: string; o: number; len: number }
type HighlightCtor = new (...ranges: Range[]) => object
const HL = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight
const hlMap = () => (CSS as unknown as { highlights?: Map<string, object> }).highlights ?? null

const findBar = reactive({ open: false, showReplace: false, find: '', replace: '' })
const findHits = ref<DocHit[]>([])
const findIdx = ref(-1)
let findTimer: number | null = null

const findCount = computed(() =>
  findHits.value.length ? `${findIdx.value + 1} / ${findHits.value.length}` : findBar.find ? '无匹配' : ''
)

/** 文档顺序枚举全部可编辑段落地址（顶层 + 表格单元格；嵌套表格只读不参与） */
function paraAddrs(): string[] {
  const out: string[] = []
  st.blocks.forEach((b, bi) => {
    if (b.t === 'p') {
      if (b.pid !== undefined && !b.ro) out.push(String(bi))
    } else if (b.t === 'tbl') {
      b.rows.forEach((r, ri) =>
        r.cells.forEach((c, ci) =>
          c.blocks.forEach((x, k) => {
            if (x.t === 'p' && x.pid !== undefined && !x.ro) out.push(`${bi}.${ri}.${ci}.${k}`)
          })
        )
      )
    }
  })
  return out
}

function runFindNow(reveal = true) {
  if (!findBar.open) return
  const q = findBar.find.toLowerCase()
  if (!q) {
    findHits.value = []
    findIdx.value = -1
    applyFindMarks()
    return
  }
  const hits: DocHit[] = []
  for (const pa of paraAddrs()) {
    const p = editor.para(pa)
    if (!p) continue
    const text = runsText(p.runs as RRun[]).toLowerCase()
    let at = text.indexOf(q)
    while (at >= 0) {
      hits.push({ pa, o: at, len: q.length })
      at = text.indexOf(q, at + q.length)
    }
  }
  findHits.value = hits
  findIdx.value = hits.length ? 0 : -1
  applyFindMarks()
  if (reveal && hits.length) void revealHit(hits[0])
}

function scheduleFind(immediate = false) {
  if (findTimer) clearTimeout(findTimer)
  findTimer = null
  if (immediate) runFindNow()
  else findTimer = window.setTimeout(() => runFindNow(), 150)
}

function openFindBar(showReplace: boolean, q?: string) {
  findBar.open = true
  if (showReplace) findBar.showReplace = true
  if (q) findBar.find = q
  scheduleFind(Boolean(q))
}

function closeFindBar() {
  findBar.open = false
  findBar.showReplace = false
  findHits.value = []
  findIdx.value = -1
  if (findTimer) clearTimeout(findTimer)
  findTimer = null
  applyFindMarks()
}

/** Esc 关闭：输入框内 stop 自带处理；焦点在文档时走这条全局兜底 */
function onFindKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (hfEdit.value) {
      hfEdit.value = null
      return
    }
    if (findBar.open) closeFindBar()
  }
}

function navFind(d: 1 | -1) {
  if (!findHits.value.length) return
  findIdx.value = (findIdx.value + d + findHits.value.length) % findHits.value.length
  applyFindMarks()
  void revealHit(findHits.value[findIdx.value])
}

/** 确保命中所在页已挂载，再精确滚动到命中处（页外命中先粗定位，渲染后细调） */
async function revealHit(hit: DocHit) {
  const bi = Number(hit.pa.split('.')[0])
  const pi = pages.value.findIndex((p) => bi >= p.start && bi < p.end)
  if (pi >= 0 && scrollEl.value && (pi < firstPage.value || pi >= lastPage.value)) {
    scrollEl.value.scrollTop = Math.max(0, pi * stride.value - 16)
  }
  await nextTick()
  applyFindMarks()
  const r = hitRange(hit)
  const sc = scrollEl.value
  if (!r || !sc) return
  const rect = r.getBoundingClientRect()
  const box = sc.getBoundingClientRect()
  if (rect.top < box.top + 8 || rect.bottom > box.bottom - 8) {
    sc.scrollTop += rect.top - box.top - Math.max(24, (box.height - rect.height) / 2)
  }
}

/** 段落模型偏移 → DOM 文本节点位置；与 input.ts posFromDom 同一契约（data-o 段、data-obj 计 1 字符） */
function ptInPara(pel: HTMLElement, o: number, end = false): [Node, number] | null {
  const spans = Array.from(pel.querySelectorAll<HTMLElement>('[data-o]'))
  let last: [Node, number] | null = null
  for (const sp of spans) {
    if (sp.hasAttribute('data-empty')) continue
    const o0 = Number(sp.dataset.o)
    const n = sp.hasAttribute('data-obj') ? 1 : (sp.textContent?.length ?? 0)
    if (o < o0 + n) {
      if (sp.hasAttribute('data-obj')) {
        const parent = sp.parentNode
        return parent ? [parent, Array.prototype.indexOf.call(parent.childNodes, sp)] : null
      }
      const t = sp.firstChild
      return t ? [t, o - o0] : null
    }
    if (sp.firstChild) last = [sp.firstChild, sp.textContent?.length ?? 0]
  }
  return end ? last : null
}

function hitRange(hit: DocHit): Range | null {
  const root = rootEl.value
  if (!root) return null
  const pel = root.querySelector<HTMLElement>(`[data-pa="${hit.pa}"]`)
  if (!pel) return null
  const s = ptInPara(pel, hit.o)
  const e = ptInPara(pel, hit.o + hit.len, true)
  if (!s || !e) return null
  const r = document.createRange()
  r.setStart(s[0], s[1])
  r.setEnd(e[0], e[1])
  return r
}

/** 重建 Custom Highlight：当前命中与其它命中分两套样式；页面未挂载的命中自然跳过 */
function applyFindMarks() {
  const map = hlMap()
  map?.delete('docx-find')
  map?.delete('docx-find-cur')
  if (!HL || !map || !rootEl.value || !findBar.open) return
  const all: Range[] = []
  const cur: Range[] = []
  findHits.value.forEach((h, i) => {
    const r = hitRange(h)
    if (r) (i === findIdx.value ? cur : all).push(r)
  })
  if (all.length) map.set('docx-find', new HL(...all))
  if (cur.length) map.set('docx-find-cur', new HL(...cur))
}

/** 命中区间右→左替换（前面的命中偏移不受影响）；沿用命中首字符的 run 样式 */
function replaceRunsOf(runs: RRun[], hits: DocHit[], by: string): RRun[] {
  let out = runs
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]
    out = deleteRange(out, h.o, h.o + h.len)
    if (by) out = insertText(out, h.o, by)
  }
  return out
}

/** 替换当前命中，并跳到原位置之后的第一处命中（无则回卷到开头） */
function replaceOne() {
  if (!props.editable || findIdx.value < 0) return
  const hit = findHits.value[findIdx.value]
  const by = findBar.replace
  const p = editor.para(hit.pa)
  if (!p || p.pid === undefined) return
  const next = editor.withRuns(p, replaceRunsOf(p.runs as RRun[], [hit], by))
  const o = hit.o + by.length
  const sel: Sel = { a: { pa: hit.pa, o }, f: { pa: hit.pa, o } }
  editor.replace([hit.pa], [next], sel, { label: 'replace' })
  runFindNow(false)
  const k = findHits.value.findIndex((h) => editor.cmp(h.pa, hit.pa) > 0 || (h.pa === hit.pa && h.o >= o))
  if (k >= 0) {
    findIdx.value = k
    applyFindMarks()
    void revealHit(findHits.value[k])
  }
}

/** 全部替换：按段落分组逐段提交（每段一次 docx.edit） */
function replaceAll() {
  if (!props.editable || !findHits.value.length) return
  const by = findBar.replace
  const byPa = new Map<string, DocHit[]>()
  for (const h of findHits.value) {
    const arr = byPa.get(h.pa)
    if (arr) arr.push(h)
    else byPa.set(h.pa, [h])
  }
  for (const [pa, hs] of byPa) {
    const p = editor.para(pa)
    if (!p) continue
    const next = editor.withRuns(p, replaceRunsOf(p.runs as RRun[], hs, by))
    editor.replace([pa], [next], { a: { pa, o: 0 }, f: { pa, o: 0 } }, { label: 'replace' })
  }
  runFindNow(false)
}

/** Word 右键菜单：Office 风格上下文操作（复制 / 剪切 / 粘贴 / 格式 / 批注 / 链接） */
const docMenu = ref<{ x: number; y: number } | null>(null)
let menuText = ''
function openDocMenu(ev: MouseEvent) {
  // 菜单项会抢走焦点，右键时先把选区文本缓存下来
  menuText = window.getSelection()?.toString() ?? ''
  ev.preventDefault()
  docMenu.value = {
    x: Math.min(ev.clientX, window.innerWidth - 170),
    y: Math.min(ev.clientY, Math.max(8, window.innerHeight - 320))
  }
}
async function docPaste() {
  docMenu.value = null
  let text = ''
  try { text = (await navigator.clipboard?.readText()) ?? '' } catch { /* 无权限时静默 */ }
  if (text) editor.insertText(text)
}
/** 复制/剪切走剪贴板 API + 内核删除，不直接 execCommand 改 DOM，避免破坏选区映射 */
async function docCopy(cut: boolean) {
  docMenu.value = null
  try { await navigator.clipboard?.writeText(menuText) } catch { /* 无权限时静默 */ }
  if (cut && props.editable) editor.deleteSelection()
}

/* ---- 拖动交互：事件委托在 rootEl 上（v-html 会重建 DOM，不能给具体元素挂监听） ---- */

/** 图片选中框：w/h 为内核 pt 尺寸，cx/cy 为相对 rootEl 的图片中心屏幕像素，rot 为旋转角（度） */
type ImgSel = { pa: string; o: number; w: number; h: number; left: number; top: number; width: number; height: number; cx: number; cy: number; rot: number }
type Drag = { move: (x: number, y: number) => void; end: () => void }
const imgSel = ref<ImgSel | null>(null)
let drag: Drag | null = null
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
/** 1pt 在当前缩放下的屏幕像素数（页面用 scale(zoom)，pt 经 96/72 换算为 px） */
const pxPerPt = () => PT * bar.zoom

function rectOf(el: Element): Pick<ImgSel, 'left' | 'top' | 'width' | 'height'> {
  const r = el.getBoundingClientRect()
  const base = rootEl.value?.getBoundingClientRect()
  return { left: r.left - (base?.left ?? 0), top: r.top - (base?.top ?? 0), width: r.width, height: r.height }
}

function currentImage(sel: ImgSel): HTMLImageElement | null {
  return rootEl.value?.querySelector<HTMLImageElement>(
    `[data-pa="${sel.pa}"] span[data-o="${sel.o}"] img[data-media]`
  ) ?? null
}

/** 点击图片：把内核选区定位到该对象，并显示选中框 */
function selectImage(e: PointerEvent, img: HTMLImageElement) {
  if (!props.editable) return
  e.preventDefault()
  const obj = img.closest('span[data-o][data-obj]') as HTMLElement | null
  const p = img.closest('[data-pa]') as HTMLElement | null
  if (!obj || !p?.dataset.pa) return
  const pa = p.dataset.pa
  const o = Number(obj.dataset.o)
  editor.selectObject(pa, o)
  const w = parseFloat(img.style.width) || img.getBoundingClientRect().width / pxPerPt()
  const h = parseFloat(img.style.height) || img.getBoundingClientRect().height / pxPerPt()
  const box = rectOf(img)
  imgSel.value = { pa, o, w, h, ...box, cx: box.left + box.width / 2, cy: box.top + box.height / 2, rot: curRot.value }
}

/** 拖列手柄：实时改 colgroup 列宽（相邻列保持不变），松手写回内核 */
function startColResize(e: PointerEvent, grip: HTMLElement) {
  if (!props.editable) return
  e.preventDefault()
  const table = grip.closest('table.de-tbl') as HTMLTableElement | null
  const block = table?.closest('.de-block') as HTMLElement | null
  // 只接受顶层表格（父节点就是 .de-block），嵌套表格没有独立的 data-bi
  if (!table || !block || table.parentElement !== block) return
  const bi = Number(block.dataset.bi)
  if (!Number.isFinite(bi)) return
  const colgroup = table.querySelector(':scope > colgroup')
  const colEls = colgroup ? (Array.from(colgroup.children) as HTMLTableColElement[]) : []
  if (!colEls.length) return
  const ci = Number(grip.dataset.ci)
  if (!(ci >= 0 && ci < colEls.length)) return
  const widths = colEls.map((c) => parseFloat(c.style.width))
  if (widths.some((w) => !(w > 0))) return
  const x0 = e.clientX
  const w0 = widths[ci]
  drag = {
    move: (x) => {
      const w = Math.max(8, w0 + (x - x0) / pxPerPt())
      widths[ci] = w
      colEls[ci].style.width = w.toFixed(2) + 'pt'
      // 保持表格总宽与各列之和一致，避免 fixed 布局把剩余宽度摊到其它列
      table.style.width = widths.reduce((a, b) => a + b, 0).toFixed(2) + 'pt'
    },
    end: () => editor.setColumnWidths(bi, widths.map((w) => +w.toFixed(2)))
  }
  try { rootEl.value?.setPointerCapture(e.pointerId) } catch { /* 不支持时退化为 rootEl 内拖动 */ }
}

/** 拖行下边界改行高：实时改 tr 显示高度，松手经 setRowHeights → docx.table 落内核（trHeight 持久化） */
function startRowResize(e: PointerEvent, grip: HTMLElement) {
  if (!props.editable) return
  e.preventDefault()
  const table = grip.closest('table.de-tbl') as HTMLTableElement | null
  const block = table?.closest('.de-block') as HTMLElement | null
  // 只接受顶层表格（父节点就是 .de-block），嵌套表格没有独立的 data-bi
  if (!table || !block || table.parentElement !== block) return
  const bi = Number(block.dataset.bi)
  if (!Number.isFinite(bi)) return
  const tbody = table.querySelector(':scope > tbody')
  const trs = tbody ? (Array.from(tbody.children) as HTMLTableRowElement[]) : []
  const tr = grip.closest('tr') as HTMLTableRowElement | null
  const ri = tr ? trs.indexOf(tr) : -1
  if (ri < 0) return
  const h0 = tr!.offsetHeight / pxPerPt()
  const y0 = e.clientY
  drag = {
    move: (_x, y) => {
      const h = Math.max(6, h0 + (y - y0) / pxPerPt())
      tr!.style.height = h.toFixed(2) + 'pt'
    },
    end: () => {
      // 未拖过的行传 0 = 保持原样；拖过的行按显示高度写回
      const hs = trs.map((r) => {
        const v = parseFloat(r.style.height)
        return Number.isFinite(v) && v > 0 ? v : 0
      })
      editor.setRowHeights(bi, hs)
    }
  }
  try { rootEl.value?.setPointerCapture(e.pointerId) } catch { /* 不支持时退化为 rootEl 内拖动 */ }
}

/** 拖图片手柄：角手柄等比、边手柄单轴；旋转后按本地坐标系换算，锚点（对角）钉在屏幕不动 */
function startImageResize(e: PointerEvent, handle: HTMLElement) {
  const sel = imgSel.value
  if (!sel) return
  const dir = handle.dataset.dir ?? ''
  const ox = dir.includes('e') ? 1 : dir.includes('w') ? -1 : 0
  const oy = dir.includes('s') ? 1 : dir.includes('n') ? -1 : 0
  if (!ox && !oy) return
  e.preventDefault()
  const img = currentImage(sel)
  if (!img) return
  const cx0 = sel.cx, cy0 = sel.cy
  const w0 = sel.w, h0 = sel.h
  const ratio = w0 / Math.max(1, h0)
  const rad = ((sel.rot || 0) * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  // 初始锚点（对角/对边）在屏幕上的位置保持不变
  const axL0 = (-ox * w0) / 2, ayL0 = (-oy * h0) / 2
  const ax0 = cx0 + axL0 * cos - ayL0 * sin
  const ay0 = cy0 + axL0 * sin + ayL0 * cos
  drag = {
    move: (x, y) => {
      // 屏幕位移 → 图片本地坐标系
      const dx = (x - cx0) / pxPerPt(), dy = (y - cy0) / pxPerPt()
      const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos
      let w = ox ? Math.max(4, Math.abs(lx + (ox * w0) / 2)) : w0
      let h = oy ? Math.max(4, Math.abs(ly + (oy * h0) / 2)) : h0
      if (ox && oy) {
        // 角手柄保持宽高比，以变化幅度较大的轴为准
        if (w / w0 >= h / h0) h = w / ratio
        else w = h * ratio
      }
      // 新锚点在本地坐标，反推让其在屏幕上仍钉在原处 → 反推图片中心
      const axL = (-ox * w) / 2, ayL = (-oy * h) / 2
      const cx = ax0 - (axL * cos - ayL * sin)
      const cy = ay0 - (axL * sin + ayL * cos)
      sel.w = w
      sel.h = h
      sel.cx = cx
      sel.cy = cy
      img.style.width = w.toFixed(2) + 'pt'
      img.style.height = h.toFixed(2) + 'pt'
      Object.assign(sel, rectOf(img))
    },
    end: () => {
      // 拖动期间选区可能被浏览器改动，写回前重新把内核选区定位到该对象
      editor.selectObject(sel.pa, sel.o)
      editor.setImageSize(+sel.w.toFixed(1), +sel.h.toFixed(1))
      imgSel.value = null
    }
  }
  try { rootEl.value?.setPointerCapture(e.pointerId) } catch { /* 不支持时退化为 rootEl 内拖动 */ }
}

/** 拖图片旋转手柄：以图片中心为轴，写回 a:xfrm/@rot（度），视图与 8 手柄随旋转 */
function startImageRotate(e: PointerEvent, handle: HTMLElement) {
  const sel = imgSel.value
  if (!sel) return
  e.preventDefault()
  const cx = sel.cx, cy = sel.cy
  const startAng = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI
  const startRot = sel.rot || 0
  drag = {
    move: (x, y) => {
      const ang = (Math.atan2(y - cy, x - cx) * 180) / Math.PI
      sel.rot = startRot + (ang - startAng)
      // overlay transform 读响应式 curRot（模型写回后经 onImage 刷新），拖拽预览同步同一来源
      curRot.value = sel.rot
    },
    end: () => {
      editor.selectObject(sel.pa, sel.o)
      editor.setImageRot(sel.rot)
      imgSel.value = null
    }
  }
  try { rootEl.value?.setPointerCapture(e.pointerId) } catch { /* 不支持时退化为 rootEl 内拖动 */ }
}

/* ---- 浮动图片：自绘环绕菜单（禁原生 select/checkbox/radio） ---- */
const WRAP_KINDS: { k: WrapKind | null; label: string }[] = [
  { k: null, label: '嵌入型' }, { k: 'square', label: '四周型' }, { k: 'tight', label: '紧密型' },
  { k: 'behindDoc', label: '衬于文字下方' }, { k: 'inFrontOfText', label: '浮于文字上方' },
]
const H_RELS: { v: WrapRel; label: string }[] = [
  { v: 'page', label: '页' }, { v: 'column', label: '栏' }, { v: 'paragraph', label: '段落' },
]
const H_ALIGNS: { v: WrapAlign; label: string }[] = [
  { v: 'left', label: '左' }, { v: 'center', label: '中' }, { v: 'right', label: '右' },
]
const V_ALIGNS: { v: WrapAlign; label: string }[] = [
  { v: 'top', label: '上' }, { v: 'center', label: '中' }, { v: 'bottom', label: '下' },
]

function commitWrap(w: WrapSpec | null) {
  const sel = imgSel.value
  if (sel) editor.selectObject(sel.pa, sel.o)
  editor.setImageWrap(w)
  curWrap.value = w
}
function basePos(): WrapPos {
  return curWrap.value?.pos ?? { hRel: 'column', vRel: 'paragraph', hAlign: 'left', vAlign: 'top' }
}
function chooseWrap(k: WrapKind | null) {
  if (k === null) { commitWrap(null); return }
  const old = curWrap.value
  commitWrap({ kind: k, pos: basePos(), distT: old?.distT, distB: old?.distB, distL: old?.distL, distR: old?.distR })
}
function choosePos(patch: Partial<WrapPos>) {
  const old = curWrap.value
  if (!old) return
  commitWrap({ ...old, pos: { ...old.pos, ...patch } })
}
function chooseHRel(v: WrapRel) { choosePos({ hRel: v }) }
function chooseHAlign(v: WrapAlign) { choosePos({ hAlign: v, hOff: undefined }) }
function chooseVAlign(v: WrapAlign) { choosePos({ vAlign: v, vOff: undefined }) }

/** 拖动浮动图片本体改位置：实时改显示偏移，松手写回 wp:anchor 的 posOffset */
function startImageMove(e: PointerEvent, float: HTMLElement) {
  const sel = imgSel.value
  if (!sel) return
  const abs = float.classList.contains('de-float-behindDoc') || float.classList.contains('de-float-inFrontOfText')
  const x0 = e.clientX, y0 = e.clientY
  const w = curWrap.value
  const baseH = w?.pos.hOff ?? 0, baseV = w?.pos.vOff ?? 0
  const l0 = parseFloat(float.style.left) || 0, t0 = parseFloat(float.style.top) || 0
  const ml0 = parseFloat(float.style.marginLeft) || 0, mt0 = parseFloat(float.style.marginTop) || 0
  let moved = false, nh = baseH, nv = baseV
  drag = {
    move: (x, y) => {
      const dx = (x - x0) / pxPerPt(), dy = (y - y0) / pxPerPt()
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return
      moved = true
      nh = Math.max(0, baseH + dx); nv = Math.max(0, baseV + dy)
      if (abs) { float.style.left = (l0 + dx) + 'pt'; float.style.top = (t0 + dy) + 'pt' }
      else { float.style.marginLeft = (ml0 + dx) + 'pt'; float.style.marginTop = (mt0 + dy) + 'pt' }
    },
    end: () => {
      if (!moved) return
      editor.selectObject(sel.pa, sel.o)
      editor.setImagePos(nh, nv)
      // 保留选中态与环绕菜单，便于继续改类型；DOM 重建后位置可能略有偏差，不影响写回
    },
  }
  try { rootEl.value?.setPointerCapture(e.pointerId) } catch { /* 不支持时退化为 rootEl 内拖动 */ }
}

function onPointerDown(e: PointerEvent) {
  const t = e.target instanceof Element ? (e.target as HTMLElement) : null
  // 环绕菜单挂在 rootEl 内：点它不要把图片选区清掉
  if (t?.closest('.ov-wrap-menu')) return
  const cropHandle = t?.closest('.de-img-crop') as HTMLElement | null
  if (cropHandle) { startCropDrag(e, cropHandle); return }
  const rotHandle = t?.closest('.de-img-rot') as HTMLElement | null
  if (rotHandle) { startImageRotate(e, rotHandle); return }
  const handle = t?.closest('.de-img-handle') as HTMLElement | null
  if (handle) { startImageResize(e, handle); return }
  const grip = t?.closest('.de-col-grip') as HTMLElement | null
  if (grip) { startColResize(e, grip); return }
  const rgrip = t?.closest('.de-row-grip') as HTMLElement | null
  if (rgrip) { startRowResize(e, rgrip); return }
  const img = t?.closest('img[data-media]') as HTMLImageElement | null
  if (img) {
    selectImage(e, img)
    const float = img.closest('.de-float') as HTMLElement | null
    if (float) startImageMove(e, float)
    return
  }
  if (imgSel.value) imgSel.value = null
  // 分栏正文点击：栏命中几何 + 高亮 + 跑偏光标校正（手柄/图片点击已在上面 return）
  columnPointerDown(e)
}

/** 双击：页眉/页脚区域进入编辑态；再次双击（任意处）提交；双击裁剪手柄把该侧裁剪复位 */
function onDblClick(e: MouseEvent) {
  const t = e.target instanceof Element ? (e.target as HTMLElement) : null
  const cropHandle = t?.closest('.de-img-crop') as HTMLElement | null
  if (cropHandle) {
    e.stopPropagation()
    const sel = imgSel.value
    if (!sel) return
    const side = (cropHandle.dataset.side ?? 'r') as 'l' | 't' | 'r' | 'b'
    const cur = cropOfSelected(editor)
    const next: Crop = { ...(cur?.crop ?? {}), [side]: 0 }
    setImageCrop(editor, next)
    return
  }
  if (hfEdit.value) {
    // 双击页眉/页脚编辑区内部不退出
    if (t?.closest('.de-hf-edit')) return
    hfCommit()
    return
  }
  const region = t?.closest('.de-hf') as HTMLElement | null
  if (region && props.editable) {
    e.preventDefault()
    const kind = region.dataset.hf === 'footer' ? 'footer' : 'header'
    const idx = Number(region.closest('[data-page]')?.getAttribute('data-page') ?? 0)
    hfEdit.value = { kind, idx }
    void nextTick(() => {
      const box = rootEl.value?.querySelector<HTMLElement>(`[data-page="${idx}"] .de-hf-edit`)
      box?.focus()
    })
    return
  }
  // 已选中图片上双击：切换裁剪态
  if (t?.closest('img[data-media]') && imgSel.value) cropMode.value = !cropMode.value
}

function onPointerMove(e: PointerEvent) {
  if (!drag) return
  e.preventDefault()
  drag.move(e.clientX, e.clientY)
}

function onPointerUp(e: PointerEvent) {
  if (!drag) return
  const d = drag
  drag = null
  try { rootEl.value?.releasePointerCapture(e.pointerId) } catch { /* 已自动释放 */ }
  d.end()
}

let measureScheduled = false
/** 估算块高不含字体 / 行距 / 缩进差异，按真实 DOM 高度写回分页表后逐轮收敛 */
function measure() {
  const root = rootEl.value
  // v-show 隐藏态下块高全为 0，测了只会写回脏值并在恢复时触发多轮收敛
  if (!root || root.clientWidth === 0) return
  const zoomH = (node: Element) => node.getBoundingClientRect().height / bar.zoom
  let changed = false
  for (const el of root.querySelectorAll<HTMLElement>('.de-block[data-bi]')) {
    const b = st.blocks[Number(el.dataset.bi)]
    if (!b) continue
    if (b.t === 'tbl') {
      // 逐行测量（续页重复表头行带相同 data-ri，覆盖成同值无害），按原始行号归集；
      // 未落在可见页的行保留估算值，避免虚拟渲染下丢失高度
      const n = b.rows.length
      const fallback = estimateHeight(b) / Math.max(1, n)
      const prev = st.rowHeights.get(b)
      const rh = prev && prev.length === n ? prev : new Array(n).fill(fallback)
      let rowChanged = false
      const topTable = el.querySelector('table.de-tbl')
      const trs = topTable ? topTable.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr[data-ri]') : []
      for (const tr of trs) {
        const ri = Number(tr.dataset.ri)
        if (!(ri >= 0 && ri < n)) continue
        const line = zoomH(tr)
        if (line > 0 && Math.abs(line - (rh[ri] ?? 0)) > 0.5) { rh[ri] = line; rowChanged = true }
      }
      if (rowChanged) st.rowHeights.set(b, rh)
      // 整表高取行高之和：分页据此判断，避免"片段 DOM 高度"污染整表测量
      const total = rh.reduce((a, c) => a + (c || 0), 0)
      const h = total > 0 ? total + 2 : zoomH(el)
      if (h > 0 && Math.abs(h - (st.heights.get(b) ?? 0)) > 1) { st.heights.set(b, h); changed = true }
      if (rowChanged) changed = true
      continue
    }
    const h = zoomH(el)
    if (h <= 0) continue
    if (Math.abs(h - (st.heights.get(b) ?? 0)) > 1) {
      st.heights.set(b, h)
      changed = true
    }
  }
  if (changed) version.value++
}

/** v-html 重建会丢 DOM 选区；内核把目标选区留在 pendingSel，渲染后必须消费 */
async function postRender() {
  await nextTick()
  if (rootEl.value) void media.hydrate(rootEl.value)
  // v-html 重建后命中 Range 失效：按当前 hits 重挂高亮（页外命中自动跳过）
  applyFindMarks()
  if (!measureScheduled) {
    measureScheduled = true
    requestAnimationFrame(() => { measureScheduled = false; measure() })
  }
  const sel = editor.pendingSel
  if (!sel) return
  if (editor.input.restore(sel)) {
    editor.pendingSel = null
    return
  }
  /* ponytail: 光标段落不在可见页时只滚动，不做「滚动后重试 + 光标可见区微调」。
     上限：跨页编辑后光标可能停在页边；升级：照上游 useIsoLayoutEffect 补 range 可见性校正。 */
  const bi = Number(sel.f.pa.split('.')[0])
  const pi = pages.value.findIndex((p) => bi >= p.start && bi < p.end)
  if (pi >= 0 && scrollEl.value) scrollEl.value.scrollTop = Math.max(0, pi * stride.value - 16)
}
watch(visible, () => void postRender())

watch(
  () => props.editable,
  (on) => {
    if (on && rootEl.value) editor.input.attach(rootEl.value)
    else editor.input.detach()
    version.value++
  }
)

onMounted(() => {
  offs.push(
    props.client.on('docx:blocks', (bs) => {
      for (const b of bs) {
        st.blocks.push(b)
        st.heights.set(b, estimateHeight(b))
      }
      version.value++
    }),
    props.client.on('docx:meta', (m) => {
      meta.value = m
      editor.styles = m.styles ?? []
      bar.titlePg = Boolean(m.titlePg)
      version.value++
    }),
    props.client.on('docx:done', (d) => {
      loading.value = false
      if (d.error) emit('error', d.error)
      void postRender()
    })
  )
  if (rootEl.value) {
    if (props.editable) editor.input.attach(rootEl.value)
    // 图片粘贴跨浏览器兜底：beforeinput 的 dataTransfer.files 在部分 WebKit 为空，改从 paste 事件读
    offs.push(installImagePaste(rootEl.value, editor))
    // 页眉/页脚编辑区的输入不进正文模型：捕获阶段拦下，浏览器默认行为直接改编辑区 DOM，提交时统一读回
    const hfGuard = (e: Event) => {
      if (!hfEdit.value) return
      const t = e.target
      if (t instanceof Element && t.closest('.de-hf-edit')) e.stopPropagation()
    }
    rootEl.value.addEventListener('beforeinput', hfGuard, true)
    rootEl.value.addEventListener('keydown', hfGuard, true)
    const root = rootEl.value
    offs.push(() => {
      root.removeEventListener('beforeinput', hfGuard, true)
      root.removeEventListener('keydown', hfGuard, true)
    })
    ro = new ResizeObserver(() => {
      const h = scrollEl.value?.clientHeight ?? 0
      // 隐藏期 clientHeight=0：不写回，恢复时 viewportH 不变 → 不触发全量分页与 measure 收敛
      if (h > 0 && h !== viewportH.value) viewportH.value = h
    })
    if (scrollEl.value) ro.observe(scrollEl.value)
  }
  void props.client.call('docx.start').catch((e) => {
    loading.value = false
    emit('error', String(e))
  })
  window.addEventListener('keydown', onFindKey)
  offs.push(() => window.removeEventListener('keydown', onFindKey))
})

onBeforeUnmount(() => {
  offs.forEach((f) => f())
  editor.dispose()
  ro?.disconnect()
  media.dispose()
})
</script>

<template>
  <div ref="scrollEl" class="ov-scroll" @scroll.passive="onScroll">
    <div
      ref="rootEl"
      class="ov-doc-root de-pages"
      :class="{ 'de-editing': editable, 'ov-read': bar.readMode }"
      :contenteditable="editable"
      spellcheck="false"
      @contextmenu.stop="openDocMenu"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dblclick="onDblClick"
    >
      <div :style="{ height: topPad + 'px' }" aria-hidden="true"></div>
      <div
        v-for="p in visible"
        :key="p.idx"
        class="ov-page de-page"
        :data-page="p.idx"
        :style="{ width: pageW + 'px', height: pageH + 'px' }"
      >
        <!-- 分栏栏命中高亮：命中栏的半透明色带，置于正文之下、pointer-events:none 不吃点击 -->
        <div
          v-if="colHit && colHit.idx === p.idx"
          class="de-col-hit"
          :style="{ left: colHit.rect.left + 'px', top: colHit.rect.top + 'px', width: colHit.rect.width + 'px', height: colHit.rect.height + 'px' }"
        ></div>
        <!-- 页眉/页脚区域：页边距内绝对定位；双击进入编辑态（文本行写回 header/footer part） -->
        <div
          class="de-hf de-hf-top"
          data-hf="header"
          contenteditable="false"
          :style="{ ...hfPosStyle('header'), ...hfFontStyle }"
        >
          <div v-if="hfEdit && hfEdit.kind === 'header' && hfEdit.idx === p.idx" class="de-hf-edit" contenteditable="true" v-html="hfEditContent('header', p.idx)"></div>
          <div v-else class="de-hf-view" v-html="hfShowHtml('header', p.idx)"></div>
        </div>
        <div class="de-page-inner de-doc" :class="{ 'de-cols': hasCols }" :style="pageInnerStyle" v-html="p.html"></div>
        <div
          class="de-hf de-hf-bot"
          data-hf="footer"
          contenteditable="false"
          :style="{ ...hfPosStyle('footer'), ...hfFontStyle }"
        >
          <div v-if="hfEdit && hfEdit.kind === 'footer' && hfEdit.idx === p.idx" class="de-hf-edit" contenteditable="true" v-html="hfEditContent('footer', p.idx)"></div>
          <div v-else class="de-hf-view" v-html="hfShowHtml('footer', p.idx)"></div>
        </div>
      </div>
      <div :style="{ height: bottomPad + 'px' }" aria-hidden="true"></div>
      <div v-if="loading" class="ov-loading">文档解析中…</div>
      <!-- 图片选中框：独立 overlay，居中+旋转定位，不在 v-html 重建范围内；contenteditable=false 避免拖乱文本选区 -->
      <div
        v-if="imgSel"
        class="de-img-overlay"
        contenteditable="false"
        spellcheck="false"
        :style="{
          left: imgSel.cx + 'px',
          top: imgSel.cy + 'px',
          width: (imgSel.w * pxPerPt()) + 'px',
          height: (imgSel.h * pxPerPt()) + 'px',
          transform: 'translate(-50%,-50%) rotate(' + curRot + 'deg)',
          transformOrigin: 'center'
        }"
      >
        <template v-if="!cropMode">
          <span v-for="d in HANDLES" :key="d" class="de-img-handle" :data-dir="d" contenteditable="false"></span>
          <span class="de-img-rot" data-dir="rot" contenteditable="false"></span>
        </template>
        <!-- 裁剪态：四边中点手柄，拖动改 a:srcRect；双击手柄把该侧复位 -->
        <template v-else>
          <span v-for="s in CROP_SIDES" :key="s" class="de-img-crop" :data-side="s" contenteditable="false"></span>
        </template>
      </div>
      <!-- 自绘环绕菜单：选中图片后设置 wrap 类型 / 相对位置 / 对齐，全部写回 wp:anchor -->
      <div
        v-if="imgSel"
        class="ov-wrap-menu"
        contenteditable="false"
        spellcheck="false"
        :style="{ left: (imgSel.left + imgSel.width + 8) + 'px', top: imgSel.top + 'px' }"
      >
        <div class="ov-wrap-title">文字环绕</div>
        <div class="ov-wrap-row">
          <button
            v-for="o in WRAP_KINDS"
            :key="String(o.k)"
            class="ov-wrap-btn"
            :class="{ 'ov-wrap-on': o.k === null ? !curWrap : curWrap?.kind === o.k }"
            @click="chooseWrap(o.k)"
          >{{ o.label }}</button>
        </div>
        <template v-if="curWrap">
          <div class="ov-wrap-title">水平相对</div>
          <div class="ov-wrap-row">
            <button v-for="o in H_RELS" :key="o.v" class="ov-wrap-btn" :class="{ 'ov-wrap-on': curWrap.pos.hRel === o.v }" @click="chooseHRel(o.v)">{{ o.label }}</button>
          </div>
          <div class="ov-wrap-title">水平对齐</div>
          <div class="ov-wrap-row">
            <button v-for="o in H_ALIGNS" :key="o.v" class="ov-wrap-btn" :class="{ 'ov-wrap-on': curWrap.pos.hAlign === o.v }" @click="chooseHAlign(o.v)">{{ o.label }}</button>
          </div>
          <div class="ov-wrap-title">垂直对齐</div>
          <div class="ov-wrap-row">
            <button v-for="o in V_ALIGNS" :key="o.v" class="ov-wrap-btn" :class="{ 'ov-wrap-on': curWrap.pos.vAlign === o.v }" @click="chooseVAlign(o.v)">{{ o.label }}</button>
          </div>
        </template>
      </div>
    </div>
    <div v-if="docMenu" class="ov-ctx-overlay" @click="docMenu = null" @contextmenu.prevent="docMenu = null">
      <div class="ov-ctx" :style="{ left: docMenu.x + 'px', top: docMenu.y + 'px' }">
        <button class="ov-ctx-item" @click="docCopy(false)">复制</button>
        <button v-if="editable" class="ov-ctx-item" @click="docCopy(true)">剪切</button>
        <button v-if="editable" class="ov-ctx-item" @click="docPaste">粘贴</button>
        <div v-if="editable" class="ov-ctx-sep"></div>
        <button v-if="editable" class="ov-ctx-item" @click="docMenu = null; commands.toggle('b')"><b>加粗</b></button>
        <button v-if="editable" class="ov-ctx-item" @click="docMenu = null; commands.toggle('i')"><i>倾斜</i></button>
        <button v-if="editable" class="ov-ctx-item" @click="docMenu = null; commands.toggle('u')"><u>下划线</u></button>
        <button v-if="editable" class="ov-ctx-item" @click="docMenu = null; commands.clearFormat()">清除格式</button>
        <div v-if="editable" class="ov-ctx-sep"></div>
        <button v-if="editable" class="ov-ctx-item" @click="docMenu = null; commands.addComment()">新建批注</button>
        <button v-if="editable" class="ov-ctx-item" @click="docMenu = null; commands.insertLink()">插入链接</button>
      </div>
    </div>
    <!-- 真查找替换栏：n/m 计数、↑↓ 跳转高亮、替换当前 / 全部、Esc 关闭 -->
    <div v-if="findBar.open" class="ov-findbar">
      <input
        v-model="findBar.find"
        class="ov-find-input"
        placeholder="查找内容"
        @input="scheduleFind()"
        @keydown.enter.prevent="navFind(1)"
        @keydown.esc.stop.prevent="closeFindBar()"
      />
      <span class="ov-find-count">{{ findCount }}</span>
      <button class="ov-find-btn" title="上一个" @click="navFind(-1)">↑</button>
      <button class="ov-find-btn" title="下一个" @click="navFind(1)">↓</button>
      <button
        v-if="editable"
        class="ov-find-btn"
        :class="{ 'ov-find-on': findBar.showReplace }"
        title="替换"
        @click="findBar.showReplace = !findBar.showReplace"
      >替换</button>
      <button class="ov-find-btn" title="关闭 (Esc)" @click="closeFindBar()">✕</button>
      <template v-if="findBar.showReplace && editable">
        <input
          v-model="findBar.replace"
          class="ov-find-input"
          placeholder="替换为"
          @keydown.enter.prevent="replaceOne()"
          @keydown.esc.stop.prevent="closeFindBar()"
        />
        <button class="ov-find-btn" title="替换当前命中" @click="replaceOne()">替换</button>
        <button class="ov-find-btn" title="替换全部命中" @click="replaceAll()">全部替换</button>
      </template>
    </div>
  </div>
</template>

<style src="../office-views.css"></style>
<style src="../office-doc-drag.css"></style>
