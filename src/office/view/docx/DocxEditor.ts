/**
 * Main-thread DOCX editing host: owns undo history and paragraph mutations,
 * mirrors every change to the worker (which regenerates the XML).
 */
import { paraSpec, tableSpec } from '../../core/docx/spec'
import type {
  Block, CanonStyle, EditOp, EditResult, HeaderFooters, HFSet, HFSetResult, Inline, PageSet, PageSetResult, PageSetup, Paragraph, ParaDirty, ParaStyle, RunSet, RunStyle, StyleInfo, StyleLook, Table, WrapSpec,
} from '../../core/docx/types'
import { cssFont } from '../../core/fonts'
import type { DocumentClient } from '../../core/worker/client'
import { opInsert, opInsertRuns, ordered, RichInput, type ReplaceOpts, type RichHost } from '../edit/input'
import { htmlToParas } from '../../core/html'
import { cellsIn, deleteCol, deleteRow, distributeCols, gridOf, insertCol, insertRow, mergeCells, newTable, patchCells, rectOf, setBorders, unmergeCell, type BorderPreset, type CellRect } from './tables'
import { changeSpans, hasChanges, resolveRuns, trackEdit } from './track'
import { formatRangeFmt } from './fmtchange'
import { applyParaPatch, resolvePara } from './pprchange'
import { installMove, type MoveHost } from './move'
import { SelSnapshot } from './selcache'
import { collapsed, markRange, normalize, plen, rlen, runAt, runsText, shiftPa, splitRuns, type Pos, type RRun, type Sel } from '../edit/rich'

/** a place in a paragraph that survives edits elsewhere: paragraph id, page-break part, offset */
export interface ParaPos {
  pid: number
  k: number
  o: number
}

/** what a new comment would cover */
export interface CommentRange {
  a: ParaPos
  f: ParaPos
  /** the text covered */
  quote: string
}

/** where a comment thread is in the document */
export interface CommentPlace {
  /** first paragraph (block address) holding its text, and the offset there */
  pa: string
  o: number
  /** the text it covers (paragraphs joined by spaces), shortened */
  quote: string
}

const QUOTE_MAX = 200
const WORD = /[\p{L}\p{N}_'’-]/u

/** comment threads the runs mark */
const marksOf = (ps: Paragraph[]) => {
  const out = new Set<string>()
  for (const p of ps) for (const r of p.runs) if (r.t === 'text' || r.t === 'img') for (const id of r.cm ?? []) out.add(id)
  return out
}

export interface DocState {
  blocks: Block[]
  heights: WeakMap<Block, number>
  /** measured height of each row of a split table (pt) */
  rowHeights: WeakMap<Block, number[]>
  dirty: Set<Block>
  /** leading blocks measured at least once */
  frontier: number
}

interface Entry {
  pas: string[]
  before: Paragraph[]
  after: Paragraph[]
  /** top-level block replacement (tables) */
  blocks?: { bi: number; before: Block[]; after: Block[] }
  selBefore: Sel
  selAfter: Sel
  label: string
  t: number
  /** the paragraph style this entry gave another look ("update style to match"), and the looks to go back and forth */
  style?: { id: string; undo: StyleLook; redo: StyleLook }
  /** a page setup change, and the changes to go back and forth */
  page?: { undo: PageSet; redo: PageSet }
  /** a header / footer change */
  hf?: { undo: HFSet; redo: HFSet }
  /** several entries made by one command (accept / reject all), undone and redone together */
  group?: Entry[]
}

export interface FormatState {
  b: boolean
  i: boolean
  u: boolean
  strike: boolean
  color?: string
  hl?: string
  sz?: number
  font?: string
  align?: string
  style?: string
  lst?: 'bullet' | 'number'
  line?: number
  va?: 'sup' | 'sub'
  link?: string
  /** caret inside a table cell */
  inTable: boolean
  /** edits are tracked; the caret / selection touches a tracked change */
  tracking?: boolean
  inChange?: boolean
  /** table cells the selection covers (more than one: they can be merged); the caret's cell is merged */
  cells?: { n: number; merged: boolean; shd?: string; vAlign?: string }
  /** a single image is selected */
  img?: { w: number; h: number; alt?: string; target: string; pa: string; o: number; wrap?: WrapSpec; rot?: number }
  canUndo: boolean
  canRedo: boolean
}

const path = (pa: string) => pa.split('.').map(Number)

/** edits that are not the author's own typing: never turned into tracked changes */
// a format-only edit has no text diff: trackEdit would mark the whole selection deleted+inserted.
// Paragraph/format revisions are captured by fmtchange.ts / pprchange.ts instead.
const UNTRACKED = new Set(['undo', 'redo', 'collab', 'accept', 'reject', 'restore', 'move', 'format', 'para', 'pagebreak', 'style'])

const sliceRunsOf = (p: Paragraph, a: number, b: number) => splitRuns(splitRuns(p.runs as RRun[], b)[0], a)[1] as Inline[]

/** the properties "update style to match" moves from the text into the style */
const RUN_LOOK = ['b', 'i', 'u', 'strike', 'color', 'sz', 'font'] as const
const PARA_LOOK = ['align', 'line', 'before', 'after'] as const

/** a run's look, property by property, in the form two runs are compared in */
const runLook = (s: RunStyle | undefined) => ({
  b: !!s?.b,
  i: !!s?.i,
  u: s?.u && s.u !== 'none' ? s.u : 'none',
  strike: !!s?.strike,
  color: s?.color ?? 'auto',
  sz: s?.sz,
  font: s?.font,
})

const paraLook = (ps: ParaStyle) => ({
  align: ps.align ?? 'left',
  // a multiple of the line height only: fixed heights are not part of the look taken over
  line: !ps.lineRule || ps.lineRule === 'auto' ? (ps.line ?? 1) : undefined,
  before: ps.before ?? 0,
  after: ps.after ?? 0,
})

/** the look of each character of a paragraph (an object counts as one) */
const charLooks = (p: Paragraph) => p.runs.flatMap((r) => (r.t === 'text' ? Array<string>(r.text.length).fill(JSON.stringify(runLook(r.s))) : ['']))

/** the font a CSS stack starts with */
const firstFont = (css: string | undefined) => (css ? (/^\s*"?([^",]+)/.exec(css)?.[1] ?? css) : undefined)

/**
 * `was` with the look of `now`: the same paragraph converted again after its style changed. Content, source
 * references and the user's own formatting stay those of `was`; null when the two do not hold the same content.
 */
function reskin(was: Paragraph, now: Paragraph): Paragraph | null {
  if (runsText(was.runs as RRun[]) !== runsText(now.runs as RRun[])) return null
  const runs: Inline[] = []
  let j = 0
  let o = 0
  // the run of `now` at the position reached (text runs already used up are passed)
  const at = () => {
    for (let n = now.runs[j]; n && n.t === 'text' && o >= n.text.length; n = now.runs[j]) {
      j++
      o = 0
    }
    return now.runs[j]
  }
  for (const w of was.runs) {
    if (w.t !== 'text') {
      const n = at()
      if (!n || n.t !== w.t) return null
      runs.push(w.t === 'box' && n.t === 'box' ? { ...w, blocks: n.blocks } : (w.t === 'field' || w.t === 'ref') && 's' in n ? { ...w, s: n.s } : w)
      j++
      o = 0
      continue
    }
    for (let rest = w.text; rest; ) {
      const n = at()
      if (!n || n.t !== 'text') return null
      const take = Math.min(rest.length, n.text.length - o)
      runs.push({ ...w, text: rest.slice(0, take), s: n.s })
      rest = rest.slice(take)
      o += take
    }
  }
  const marker = was.marker && now.marker ? { ...was.marker, s: now.marker.s } : was.marker
  return { ...was, ps: now.ps, runs: normalize(runs as RRun[]) as Inline[], markSz: now.markSz, markFont: now.markFont, marker }
}

/** selection recorded around address `from`, re-based onto `to` (same container) */
function moveSel(sel: Sel, from: string, to: string): Sel {
  if (from === to) return sel
  const dir = (pa: string) => pa.replace(/\.?\d+$/, '')
  const d = Number(to.split('.').pop()) - Number(from.split('.').pop())
  const mv = (p: Sel['a']) => (dir(p.pa) === dir(from) ? { ...p, pa: dir(to) ? `${dir(to)}.${Number(p.pa.split('.').pop()) + d}` : String(Number(p.pa.split('.').pop()) + d) } : p)
  return { a: mv(sel.a), f: mv(sel.f) }
}

/** a model change: contiguous paragraphs replaced, or top-level blocks replaced */
export type DocxCommit = { kind: 'paras'; before: Paragraph[]; next: Paragraph[] } | { kind: 'blocks'; bi: number; before: Block[]; next: Block[] }

export class DocxEditor implements RichHost<Paragraph> {
  readonly input: RichInput
  pendingSel: Sel | null = null
  styles: StyleInfo[] = []
  private history: Entry[] = []
  private future: Entry[] = []
  private pend: { s: Partial<RunStyle>; d: RunSet; at: { pa: string; o: number } } | null = null
  /** next id for new paragraphs / tables (a collaboration session gives each client its own range) */
  nextPid = 1_000_000_000
  private inflight = 0
  /** pointerdown 前快照的选区：ribbon 失焦时给表格 / 图片命令兜底 */
  private selSnap: SelSnapshot
  /** paragraphs whose look on screen may be behind their style / list: a conversion was asked, none was applied yet */
  private stale = new Set<number>()
  onState?: (s: FormatState | null) => void
  /** image selection changed (overlay with resize handles) */
  onImage?: (img: FormatState['img'] | null) => void
  /** style list changed (a built-in style was added to the document, a style got another look) */
  onStyles?: (styles: StyleInfo[]) => void
  /** headers / footers were converted again (a style they use got another look) */
  onHeaders?: (h: HeaderFooters) => void
  shortcut?: (e: KeyboardEvent) => boolean
  onDirty?: () => void
  /** a command failed: the view shows the message instead of silently doing nothing */
  onError?: (m: string) => void
  /** paint format: run formatting copied from the caret, applied to the next selection */
  painter: RunSet | null = null
  onPainter?: (on: boolean) => void
  /** every model change, after it was mirrored to the worker (collaboration hook) */
  onCommit?: (c: DocxCommit) => void

  constructor(
    private client: DocumentClient,
    private st: DocState,
    private changed: () => void,
  ) {
    this.input = new RichInput(this)
    this.selSnap = new SelSnapshot(this.input)
    // tracked "move" (cut + paste) is installed out of this file to keep DocxEditor under the line cap
    installMove(this as unknown as MoveHost)
  }

  /** ribbon 失焦兜底：实时选区不可用（命令早退）时用 pointerdown 前快照的选区 */
  private cmdSel(): Sel | null {
    return this.input.sel() ?? this.selSnap.fallback()
  }

  /** 表格命令专用：实时选区不在单元格内时优先用快照里的单元格选区 */
  private tableCmdSel(): Sel | null {
    const live = this.input.sel()
    if (live && live.f.pa.includes('.')) return live
    const snap = this.selSnap.fallback()
    return snap && snap.f.pa.includes('.') ? snap : live ?? snap
  }

  dispose(): void {
    this.selSnap.destroy()
    this.input.detach()
  }

  // ---------------------------------------------------------------- addressing

  private container(pa: string): { list: Block[]; at: number; cell?: [number, number, number] } | undefined {
    const p = path(pa)
    if (p.length === 1) return { list: this.st.blocks, at: p[0] }
    const t = this.st.blocks[p[0]]
    if (t?.t !== 'tbl') return undefined
    const cell = t.rows[p[1]]?.cells[p[2]]
    return cell ? { list: cell.blocks, at: p[3], cell: [p[0], p[1], p[2]] } : undefined
  }

  para(pa: string): Paragraph | undefined {
    const c = this.container(pa)
    const b = c?.list[c.at]
    return b && b.t === 'p' && b.pid !== undefined && !b.ro ? b : undefined
  }

  span(a: string, b: string): string[] | null {
    const pa = path(a)
    const pb = path(b)
    if (pa.length !== pb.length || pa.slice(0, -1).join('.') !== pb.slice(0, -1).join('.')) return null
    const out: string[] = []
    for (let i = pa[pa.length - 1]; i <= pb[pb.length - 1]; i++) {
      const addr = shiftPa(a, i - pa[pa.length - 1])
      if (!this.para(addr)) return null
      out.push(addr)
    }
    return out
  }

  prev(pa: string) {
    const at = path(pa).pop()!
    const q = shiftPa(pa, -1)
    return at > 0 && this.para(q) ? q : undefined
  }

  next(pa: string) {
    const q = shiftPa(pa, 1)
    return this.para(q) ? q : undefined
  }

  cmp(a: string, b: string): number {
    const x = path(a)
    const y = path(b)
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i]
    return x.length - y.length
  }

  /** the whole document: from the first to the last editable top-level paragraph */
  all(): Sel | null {
    let a = -1
    let f = -1
    this.st.blocks.forEach((_, i) => {
      if (!this.para(String(i))) return
      if (a < 0) a = i
      f = i
    })
    if (a < 0) return null
    return { a: { pa: String(a), o: 0 }, f: { pa: String(f), o: plen(this.para(String(f))!.runs as RRun[]) } }
  }

  selectAll() {
    this.input.selectAll()
  }

  /** Deletes a top-level range that spans tables: the end paragraphs are joined, everything between goes (section breaks stay). */
  deleteAcross(s: Pos, e: Pos): Pos | null {
    const a = path(s.pa)
    const b = path(e.pa)
    if (a.length !== 1 || b.length !== 1 || a[0] >= b[0]) return null
    const first = this.para(s.pa)
    const last = this.para(e.pa)
    if (!first || !last) return null
    // parts of a paragraph split around a page break share its pid: the worker regenerates whole paragraphs only
    const part = (i: number, p: Paragraph) => this.st.blocks[i]?.t === 'p' && (this.st.blocks[i] as Paragraph).pid === p.pid
    if (part(a[0] - 1, first) || part(b[0] + 1, last)) return null
    const runs = normalize([...splitRuns(first.runs as RRun[], s.o)[0], ...splitRuns(last.runs as RRun[], e.o)[1]])
    const keep = this.st.blocks.slice(a[0] + 1, b[0]).filter((x) => x.t === 'sect')
    this.replaceBlocks(a[0], b[0] - a[0] + 1, [this.join(first, last, runs), ...keep], { a: s, f: s })
    return s
  }

  // ---------------------------------------------------------------- paragraph factories

  withRuns(p: Paragraph, runs: RRun[]): Paragraph {
    return { ...p, runs: runs as Inline[], edited: true }
  }

  private origOf(p: Paragraph): number[] {
    return p.orig ?? (p.pid === (p.from ?? p.pid) ? [p.pid!] : [])
  }

  defaultRun(p: Paragraph): Partial<RRun> | undefined {
    if (p.caret) return { ...(p.caret as RRun), text: '' }
    const last = [...p.runs].reverse().find((r) => r.t === 'text') as RRun | undefined
    if (last) return { ...last, text: '' }
    return { t: 'text', s: { sz: p.markSz, font: p.markFont } } as Partial<RRun>
  }

  split(p: Paragraph, left: RRun[], right: RRun[], atEnd: boolean): [Paragraph, Paragraph] {
    const keep = p.keepSect ?? p.pid === (p.from ?? p.pid)
    const a: Paragraph = { ...p, runs: left as Inline[], edited: true, keepSect: false }
    const b: Paragraph = {
      ...p,
      runs: right as Inline[],
      pid: this.nextPid++,
      from: p.from ?? p.pid,
      orig: [],
      edited: true,
      keepSect: keep,
      pb: false,
      ver: 0,
      caret: right.length ? undefined : ((runAt(left, plen(left)) as Inline | undefined) ?? p.caret),
    }
    if (atEnd) {
      const next = this.styles.find((s) => s.id === p.sid)?.next
      if (next && next !== p.sid) {
        b.pd = { ...(b.pd ?? {}), style: next }
        b.sid = next
      }
    }
    return [a, b]
  }

  join(a: Paragraph, b: Paragraph, runs: RRun[]): Paragraph {
    return { ...a, runs: runs as Inline[], edited: true, orig: [...this.origOf(a), ...this.origOf(b)], keepSect: (a.keepSect ?? a.pid === (a.from ?? a.pid)) || (b.keepSect ?? b.pid === (b.from ?? b.pid)) }
  }

  // ---------------------------------------------------------------- mutation core

  private splice(pa: string, count: number, next: Block[]): Block[] {
    const c = this.container(pa)!
    if (!c.cell) {
      this.st.blocks.splice(c.at, count, ...next)
      return this.st.blocks
    }
    const [bi, ri, ci] = c.cell
    const t = this.st.blocks[bi] as Table
    const blocks = [...c.list]
    blocks.splice(c.at, count, ...next)
    const nt: Table = { ...t, rows: t.rows.map((r, i) => (i !== ri ? r : { ...r, cells: r.cells.map((cell, j) => (j !== ci ? cell : { ...cell, blocks })) })) }
    this.st.heights.set(nt, this.st.heights.get(t) ?? 0)
    this.st.dirty.add(nt)
    this.st.blocks[bi] = nt
    return blocks
  }

  replace(pas: string[], next: Paragraph[], sel: Sel, opts: ReplaceOpts & { history?: boolean; want?: boolean } = {}): void {
    const before = pas.map((pa) => this.para(pa)!)
    if (before.some((b) => !b)) return
    // suggesting: what the edit takes out stays (deleted), what it puts in is marked inserted
    if (this.tracking && opts.history !== false && !UNTRACKED.has(opts.label ?? '')) {
      const r = trackEdit(before, next, pas[0], sel, this.input.lastSel, { k: 'ins', author: this.author(), date: new Date().toISOString().replace(/\.\d+Z$/, 'Z') })
      next = r.next
      sel = r.sel
      if (next.length === 1 && before.length === 1 && opts.label === 'type') opts = { ...opts, remount: true }
    }
    if (opts.remount) next = next.map((p) => ({ ...p, ver: (p.ver ?? 0) + 1 }))
    const c = this.container(pas[0])!
    const at = c.at
    const list = this.splice(pas[0], pas.length, next)
    // split paragraphs: trailing page-break parts follow the paragraph that now ends the range
    const lastB = before[before.length - 1]
    const lastN = next[next.length - 1]
    if (lastN && lastB.pid !== lastN.pid) {
      for (let k = at + next.length; k < list.length; k++) {
        const b = list[k]
        if (b.t !== 'p' || b.pid !== lastB.pid || !b.pb) break
        list[k] = { ...b, pid: lastN.pid, from: lastN.from ?? lastN.pid, edited: true }
      }
    }
    // heights: estimate from what was there, remeasure soon
    if (!c.cell) {
      next.forEach((p, i) => {
        this.st.heights.set(p, this.st.heights.get(before[i] ?? before[0]) ?? 0)
        this.st.dirty.add(p)
      })
      for (const k of [at - 1, at + next.length]) if (list[k]) this.st.dirty.add(list[k])
      if (at < this.st.frontier) this.st.frontier = Math.max(0, this.st.frontier + next.length - pas.length)
    }
    if (opts.history !== false) {
      const now = Date.now()
      const last = this.history[this.history.length - 1]
      const label = opts.label ?? 'edit'
      const selBefore = this.input.lastSel ?? sel
      // same paragraph, not just same address: a collaborator's edit above can bring another paragraph to that address
      const typing = label === 'type' && last?.label === 'type' && pas.length === 1 && next.length === 1 && last.after.length === 1
      if (typing && last.pas[0] === pas[0] && last.after[0].pid === before[0].pid && now - last.t < 1500) {
        last.after = next
        last.selAfter = sel
        last.t = now
      } else {
        this.history.push({ pas, before, after: next, selBefore, selAfter: sel, label, t: now })
        if (this.history.length > 500) this.history.shift()
      }
      this.future = []
    }
    this.commit(pas[0], before, next, opts.want)
    this.onCommit?.({ kind: 'paras', before, next })
    // a collaborator's paragraphs may come with the look a style had before it changed
    if (opts.label === 'collab') this.catchUp()
    this.pendingSel = sel
    this.onDirty?.()
    this.changed()
    // the caret may not move (formatting): refresh the toolbar from the new runs
    this.emitState(sel)
  }

  /**
   * Puts `p`, a paragraph `replace` removed on its own, back at address `pa`, where no paragraph next to it can place
   * it (tables on both sides, an emptied cell). Only to revert that removal (a collaboration rebase): no history
   * entry, no commit event. The engine puts it back where it stood.
   */
  restore(pa: string, p: Paragraph) {
    const c = this.container(pa)
    if (!c || p.pid === undefined || c.at > c.list.length) return
    const list = this.splice(pa, 0, [p])
    if (!c.cell) {
      if (!this.st.heights.has(p)) this.st.heights.set(p, 0)
      this.st.dirty.add(p)
      for (const k of [c.at - 1, c.at + 1]) if (list[k]) this.st.dirty.add(list[k])
      if (c.at < this.st.frontier) this.st.frontier++
    }
    if (c.cell && (this.st.blocks[c.cell[0]] as Table).tid !== undefined) this.commitTable(c.cell[0])
    else this.send('docx.edit', { anchor: p.pid, list: [paraSpec(this.partsOf(list, p.pid, c.at))] } as EditOp)
    this.onDirty?.()
    this.changed()
  }

  /** contiguous blocks sharing `pid` around index `near` */
  private partsOf(list: Block[], pid: number, near: number): Paragraph[] {
    let i = near
    while (i > 0 && (list[i - 1] as Paragraph).pid === pid && list[i - 1].t === 'p') i--
    const out: Paragraph[] = []
    for (; i < list.length && list[i].t === 'p' && (list[i] as Paragraph).pid === pid; i++) out.push(list[i] as Paragraph)
    return out
  }

  private commit(pa: string, before: Paragraph[], next: Paragraph[], want?: boolean) {
    const c = this.container(pa)!
    if (c.cell && (this.st.blocks[c.cell[0]] as Table).tid !== undefined) {
      this.commitTable(c.cell[0])
      return
    }
    const list = c.list
    const pids: number[] = []
    next.forEach((p) => p.pid !== undefined && !pids.includes(p.pid) && pids.push(p.pid))
    const specs = pids.map((pid) => {
      const idx = c.at + next.findIndex((p) => p.pid === pid)
      return paraSpec(this.partsOf(list, pid, idx))
    })
    const remove: number[] = []
    for (const b of before) {
      if (b.pid === undefined || pids.includes(b.pid) || remove.includes(b.pid)) continue
      const still = list.findIndex((x) => x.t === 'p' && (x as Paragraph).pid === b.pid)
      if (still >= 0) specs.push(paraSpec(this.partsOf(list, b.pid, still)))
      else remove.push(b.pid)
    }
    const anchor = before[0].pid!
    // a thread's text left these paragraphs: its other paragraphs mark their own part of the range from now on
    const had = marksOf(before)
    if (had.size) {
      const kept = marksOf(next)
      const lost = [...had].filter((id) => !kept.has(id))
      if (lost.length) this.remark(new Set(lost), new Set([...pids, ...remove, ...before.map((b) => b.pid!)]))
    }
    const structural = want || next.some((p) => p.pd !== before.find((b) => b.pid === p.pid)?.pd)
    // also while an earlier conversion is still due: its answer comes back after this edit and can't be applied (see applyResult)
    const convert = structural || specs.some((x) => this.stale.has(x.pid))
    if (convert) for (const x of specs) this.stale.add(x.pid)
    const sent = new Set<Paragraph>(next)
    const op: EditOp = { anchor, list: specs, remove, want: convert }
    this.inflight++
    this.client
      .call('docx.edit', op)
      .then((res) => this.applyResult(res, sent))
      .catch((e) => console.error('[office] edit failed', e))
      .finally(() => this.inflight--)
  }

  get busy() {
    return this.inflight > 0
  }

  /**
   * Paragraphs still written as they were read (with the comment marks of the file) that hold text of threads `ids`
   * are written from the model from now on: each marks its own part of the range, which saving joins into one.
   */
  private remark(ids: Set<string>, skip: Set<number>) {
    const tables = new Set<number>()
    const visit = (list: Block[], bi: number | undefined) => {
      list.forEach((b, i) => {
        if (b.t === 'tbl') return b.rows.forEach((r) => r.cells.forEach((c) => visit(c.blocks, i)))
        if (b.t !== 'p' || b.pid === undefined || b.edited || b.ro || skip.has(b.pid)) return
        if (!b.runs.some((r) => (r.t === 'text' || r.t === 'img') && r.cm?.some((id) => ids.has(id)))) return
        skip.add(b.pid)
        const parts = this.partsOf(list, b.pid, i)
        for (const p of parts) p.edited = true
        if (bi !== undefined && (this.st.blocks[bi] as Table).tid !== undefined) tables.add(bi)
        else this.send('docx.edit', { anchor: b.pid, list: [paraSpec(parts)] } as EditOp)
      })
    }
    visit(this.st.blocks, undefined)
    for (const bi of tables) this.commitTable(bi)
  }

  // ---------------------------------------------------------------- comments

  private paraPos(p: Pos): ParaPos | null {
    const para = this.para(p.pa)
    if (!para || para.pid === undefined) return null
    const k = this.locate(para.pid).findIndex((l) => l.pa === p.pa)
    return k < 0 ? null : { pid: para.pid, k, o: p.o }
  }

  /** the block address and offset of `d` now; null when its paragraph is gone */
  posOf(d: ParaPos): Pos | null {
    const locs = this.locate(d.pid)
    const l = locs[Math.min(d.k, locs.length - 1)]
    const p = l && this.para(l.pa)
    return p ? { pa: l.pa, o: Math.min(d.o, plen(p.runs as RRun[])) } : null
  }

  /** what a new comment covers: the selection, or the word at the caret; null when there is no text there */
  commentRange(sel: Sel | null = this.input.sel() ?? this.input.lastSel): CommentRange | null {
    if (!sel) return null
    const r = this.selectedParas(sel)
    if (!r) return null
    let { s, e } = r
    if (collapsed(sel)) {
      const t = runsText(this.para(s.pa)!.runs as RRun[])
      let a = s.o
      let b = s.o
      while (a > 0 && WORD.test(t[a - 1])) a--
      while (b < t.length && WORD.test(t[b])) b++
      if (a === b) return null
      s = { pa: s.pa, o: a }
      e = { pa: s.pa, o: b }
    }
    let quote = ''
    r.pas.forEach((pa, i) => {
      const t = runsText(this.para(pa)!.runs as RRun[])
      quote += (i ? ' ' : '') + t.slice(pa === s.pa ? s.o : 0, pa === e.pa ? e.o : t.length)
    })
    quote = quote.replace(/\uFFFC/g, '').replace(/\s+/g, ' ').trim()
    const a = this.paraPos(s)
    const f = this.paraPos(e)
    if (!a || !f || !quote) return null
    return { a, f, quote: quote.length > QUOTE_MAX ? quote.slice(0, QUOTE_MAX - 1) + '…' : quote }
  }

  /** marks `range` as covered by comment thread `id` (one undo step); false when its text is gone */
  markComment(id: string, range: CommentRange): boolean {
    const s = this.posOf(range.a)
    const e = this.posOf(range.f)
    if (!s || !e) return false
    const sel = { a: s, f: e }
    const r = this.selectedParas(sel)
    if (!r) return false
    let any = false
    const next = r.pas.map((pa) => {
      const p = this.para(pa)!
      const a = pa === r.s.pa ? r.s.o : 0
      const b = pa === r.e.pa ? r.e.o : plen(p.runs as RRun[])
      if (b > a) any = true
      return this.withRuns(p, markRange(p.runs as RRun[], a, b, id, true))
    })
    if (!any) return false
    this.replace(r.pas, next, { a: r.e, f: r.e }, { label: 'comment' })
    return true
  }

  /** the first place of each comment thread the document marks, in document order */
  commentPlaces(): Map<string, CommentPlace> {
    const out = new Map<string, CommentPlace>()
    const quotes = new Map<string, string>()
    const add = (id: string, text: string) => {
      const q = quotes.get(id)
      if (q !== undefined && q.length >= QUOTE_MAX) return
      quotes.set(id, q === undefined ? text : q + text)
    }
    const para = (p: Paragraph, pa: string) => {
      let o = 0
      const seen = new Set<string>()
      for (const r of p.runs) {
        if (r.t === 'box') for (const b of r.blocks) if (b.t === 'p') para(b, pa)
        if ((r.t === 'text' || r.t === 'img') && r.cm) {
          for (const id of r.cm) {
            if (!out.has(id)) out.set(id, { pa, o, quote: '' })
            // paragraphs are joined by a space
            if (!seen.has(id) && quotes.has(id)) add(id, ' ')
            seen.add(id)
            if (r.t === 'text') add(id, r.text)
          }
        }
        o += r.t === 'text' ? r.text.length : 1
      }
    }
    this.st.blocks.forEach((b, bi) => {
      if (b.t === 'p') para(b, String(bi))
      else if (b.t === 'tbl') b.rows.forEach((r, ri) => r.cells.forEach((c, ci) => c.blocks.forEach((x, pi) => x.t === 'p' && para(x, `${bi}.${ri}.${ci}.${pi}`))))
    })
    for (const [id, place] of out) {
      const q = (quotes.get(id) ?? '').replace(/\s+/g, ' ').trim()
      place.quote = q.length > QUOTE_MAX ? q.slice(0, QUOTE_MAX - 1) + '…' : q
    }
    return out
  }

  private locate(pid: number): { list: Block[]; index: number; pa: string }[] {
    const out: { list: Block[]; index: number; pa: string }[] = []
    this.st.blocks.forEach((b, bi) => {
      if (b.t === 'p' && b.pid === pid) out.push({ list: this.st.blocks, index: bi, pa: String(bi) })
      else if (b.t === 'tbl')
        b.rows.forEach((r, ri) =>
          r.cells.forEach((cell, ci) =>
            cell.blocks.forEach((x, pi) => {
              if (x.t === 'p' && x.pid === pid) out.push({ list: cell.blocks, index: pi, pa: `${bi}.${ri}.${ci}.${pi}` })
            }),
          ),
        )
    })
    return out
  }

  private put(pa: string, p: Paragraph) {
    const c = this.container(pa)
    if (!c) return
    const old = c.list[c.at]
    this.splice(pa, 1, [p])
    if (!c.cell) {
      this.st.heights.set(p, this.st.heights.get(old) ?? 0)
      this.st.dirty.add(p)
    }
  }

  private applyResult(res: EditResult, sent: Set<Paragraph>) {
    if (this.input.isComposing) return
    let touched = false
    // the caret inside a rebuilt paragraph is put back after the render (same offsets: the text is the same)
    const sel = this.input.readSel()
    const rebuilt = new Set<string>()
    // re-converted paragraphs (style / list changes): only if not edited again meanwhile
    for (const [k, blocks] of Object.entries(res.blocks)) {
      const pid = Number(k)
      const locs = this.locate(pid)
      const cur = locs.map((l) => l.list[l.index] as Paragraph)
      const paras = blocks.filter((b): b is Paragraph => b.t === 'p')
      // edited again: the paragraph stays `stale`, so that edit asked for the conversion too and its answer is the one applied
      let again = false
      for (const x of sent) again ||= x.pid === pid && cur.length > 0 && !cur.includes(x)
      if (again) continue
      this.stale.delete(pid)
      if (!locs.length || paras.length !== locs.length || !cur.every((x) => sent.has(x))) continue
      locs.forEach((l, i) => {
        const was = cur[i]
        const p = { ...paras[i], from: was.from, orig: was.orig, pd: was.pd, edited: was.edited, keepSect: was.keepSect, ver: was.ver, pb: was.pb }
        this.put(l.pa, p)
        // converted with the styles as they are by now
        this.lookAt.set(p, this.styleGen)
        this.heir.set(was, p)
        rebuilt.add(l.pa)
      })
      touched = true
    }
    // list numbering changes anywhere in the document
    for (const [k, m] of Object.entries(res.markers)) {
      for (const loc of this.locate(Number(k))) {
        const p = loc.list[loc.index] as Paragraph
        if ((loc.list[loc.index - 1] as Paragraph | undefined)?.pid === p.pid) continue
        this.put(loc.pa, { ...p, marker: m ? { text: m.text, s: m.s, tab: m.tab } : undefined, lst: m?.lst })
        touched = true
      }
    }
    if (!touched) return
    if (sel && !this.pendingSel && (rebuilt.has(sel.a.pa) || rebuilt.has(sel.f.pa))) this.pendingSel = sel
    this.changed()
  }

  // ---------------------------------------------------------------- history

  /** current address of the first block of `list` (paragraphs by pid, tables by identity), `empty` for an empty list; undefined when gone */
  private whereNow(list: Block[], empty: string): string | undefined {
    const b = list[0]
    if (!b) return empty
    if (b.t === 'p') return b.pid !== undefined ? this.locate(b.pid)[0]?.pa : undefined
    if (b.t === 'tbl') {
      const i = this.st.blocks.findIndex((x) => x.t === 'tbl' && ((b.tid !== undefined && x.tid === b.tid) || (b.item !== undefined && x.item === b.item)))
      return i >= 0 ? String(i) : undefined
    }
    return empty
  }

  /** table undo / redo: paragraphs still in place keep their current text (edited since, maybe by collaborators) */
  private keepCurrent(list: Block[], bi: number, count: number): Block[] {
    const cur = new Map(this.st.blocks.slice(bi, bi + count).flatMap((b) => (b.t === 'p' && b.pid !== undefined ? [[b.pid, b] as const] : [])))
    return list.map((b) => (b.t === 'p' && b.pid !== undefined && cur.has(b.pid) ? cur.get(b.pid)! : b))
  }

  undo() {
    const e = this.history.pop()
    if (!e) return
    if (e.group) {
      // its parts, last first, each through the usual path
      for (const part of [...e.group].reverse()) {
        this.history.push(part)
        const n = this.future.length
        this.undo()
        if (this.future.length > n) this.future.pop()
      }
      this.future.push(e)
      return
    }
    if (e.style) this.restyle(e.style.id, e.style.undo)
    if (e.page) this.repage(e.page.undo)
    if (e.hf) this.rehf(e.hf.undo)
    if (e.blocks) {
      const bi = this.whereNow(e.blocks.after, String(e.blocks.bi))
      // the blocks were removed by a collaborator: nothing left to undo
      if (bi === undefined) return
      this.replaceBlocks(Number(bi), e.blocks.after.length, this.keepCurrent(e.blocks.before, Number(bi), e.blocks.after.length), e.selBefore, false)
      this.future.push(e)
      return
    }
    // a style on its own: no paragraph changed with it
    if (!e.pas.length) return this.styleOnly(e, this.future, e.selBefore)
    const at = this.whereNow(e.after, e.pas[0])
    if (at === undefined) return
    const pasAfter = e.after.map((_, i) => shiftPa(at, i))
    // a collaborator changed these paragraphs' structure meanwhile: drop the entry
    if (pasAfter.some((pa, i) => this.para(pa)?.pid !== e.after[i].pid)) return
    this.replace(pasAfter.length ? pasAfter : [at], e.before, moveSel(e.selBefore, e.pas[0], at), { history: false, label: 'undo', want: true })
    this.future.push(e)
  }

  redo() {
    const e = this.future.pop()
    if (!e) return
    if (e.group) {
      for (const part of e.group) {
        this.future.push(part)
        const n = this.history.length
        this.redo()
        if (this.history.length > n) this.history.pop()
      }
      this.history.push(e)
      return
    }
    if (e.style) this.restyle(e.style.id, e.style.redo)
    if (e.page) this.repage(e.page.redo)
    if (e.hf) this.rehf(e.hf.redo)
    if (e.blocks) {
      const bi = this.whereNow(e.blocks.before, String(e.blocks.bi))
      if (bi === undefined) return
      this.replaceBlocks(Number(bi), e.blocks.before.length, this.keepCurrent(e.blocks.after, Number(bi), e.blocks.before.length), e.selAfter, false)
      this.history.push(e)
      return
    }
    if (!e.pas.length) return this.styleOnly(e, this.history, e.selAfter)
    const at = this.whereNow(e.before, e.pas[0])
    if (at === undefined) return
    const pasNow = e.before.map((_, i) => shiftPa(at, i))
    if (pasNow.some((pa, i) => this.para(pa)?.pid !== e.before[i].pid)) return
    this.replace(pasNow, e.after, moveSel(e.selAfter, e.pas[0], at), { history: false, label: 'redo', want: true })
    this.history.push(e)
  }

  /** undo / redo of an entry that only changed a style: it moves to the other stack, the toolbar follows */
  private styleOnly(e: Entry, to: Entry[], sel: Sel) {
    to.push(e)
    this.emitState(this.input.sel() ?? sel)
  }

  get canUndo() {
    return this.history.length > 0
  }
  get canRedo() {
    return this.future.length > 0
  }

  // ---------------------------------------------------------------- formatting

  pendingStyle(): Partial<RRun> | undefined {
    return this.pend ? ({ s: this.pend.s, d: this.pend.d } as Partial<RRun>) : undefined
  }

  clearPending() {
    this.pend = null
  }

  private selectedParas(sel: Sel): { pas: string[]; s: { pa: string; o: number }; e: { pa: string; o: number } } | null {
    const [s, e] = ordered(this, sel)
    const pas = s.pa === e.pa ? (this.para(s.pa) ? [s.pa] : null) : this.span(s.pa, e.pa)
    return pas ? { pas, s, e } : null
  }

  format(s: Partial<RunStyle>, d: RunSet, opts: { want?: boolean } = {}) {
    const sel = this.input.sel()
    if (!sel) return
    if (collapsed(sel)) {
      this.pend = { s: { ...(this.pend?.s ?? {}), ...s }, d: { ...(this.pend?.d ?? {}), ...d }, at: sel.a }
      this.input.restore(sel)
      this.emitState(sel)
      return
    }
    const r = this.selectedParas(sel)
    if (!r) return
    // a format change doesn't alter the text, so trackEdit()'s character diff can't see it: capture the old
    // look here instead. Format revisions are dissolved by formatRangeFmt when the net diff is empty.
    const mark = this.tracking ? { author: this.author(), date: new Date().toISOString().replace(/\.\d+Z$/, 'Z') } : undefined
    const next = r.pas.map((pa, i) => {
      const p = this.para(pa)!
      const a = i === 0 ? r.s.o : 0
      const b = i === r.pas.length - 1 ? r.e.o : plen(p.runs as RRun[])
      return this.withRuns(p, formatRangeFmt(p.runs as RRun[], a, b, s, d, mark))
    })
    this.replace(r.pas, next, sel, { label: 'format', want: opts.want })
  }

  toggle(key: 'b' | 'i' | 'u' | 'strike') {
    const st = this.state()
    const on = !(st && st[key])
    if (key === 'u') this.format({ u: on ? 'single' : 'none' }, { u: on ? 'single' : 'none' })
    else this.format({ [key]: on }, { [key]: on })
  }

  setFont(name: string) {
    this.format({ font: cssFont(name) }, { font: name })
  }

  setSize(sz: number) {
    this.format({ sz }, { sz })
  }

  setColor(c: string | null) {
    this.format({ color: c ?? undefined }, { color: c })
  }

  setHighlight(c: string | null) {
    this.format({ hl: c ?? undefined, shd: undefined }, { hl: c })
  }

  clearFormat() {
    this.format({ b: false, i: false, u: 'none', strike: false, hl: undefined }, { b: false, i: false, u: 'none', strike: false, color: null, hl: null, va: null }, { want: true })
  }

  /** the mark a tracked change is signed with (undefined when the tracking is off) */
  private mark(): { author?: string; date?: string } | undefined {
    return this.tracking ? { author: this.author(), date: new Date().toISOString().replace(/\.\d+Z$/, 'Z') } : undefined
  }

  setPara(patch: ParaDirty, optimistic: Partial<ParaStyle> = {}, sel = this.input.sel()) {
    if (!sel) return
    const r = this.selectedParas(sel)
    if (!r) return
    const mark = this.mark()
    const next = r.pas.map((pa) => applyParaPatch(this.para(pa)!, patch, optimistic, mark))
    this.replace(r.pas, next, sel, { label: 'para', want: true })
  }

  toggleList(kind: 'bullet' | 'number') {
    const sel = this.input.sel()
    if (!sel) return
    const r = this.selectedParas(sel)
    if (!r) return
    const all = r.pas.every((pa) => this.para(pa)?.lst === kind)
    this.setPara({ list: all ? 'none' : kind, ilvl: all ? undefined : 0 }, {}, sel)
  }

  indent(dir: 1 | -1, sel = this.input.sel()) {
    if (!sel) return
    const r = this.selectedParas(sel)
    if (!r) return
    const mark = this.mark()
    const next = r.pas.map((pa) => {
      const p = this.para(pa)!
      const patch: ParaDirty = p.lst ? { ilvl: Math.max(0, Math.min(8, (p.ilvl ?? 0) + dir)) } : { indL: Math.max(0, (p.ps.indL ?? 0) + dir * 36) }
      return applyParaPatch(p, patch, {}, mark)
    })
    this.replace(r.pas, next, sel, { label: 'para', want: true })
  }

  tab(sel: Sel, shift: boolean): boolean {
    if (sel.f.pa.includes('.')) {
      // move between table cells (Tab on the last cell adds a row)
      const [bi, ri, ci] = sel.f.pa.split('.').map(Number)
      const t = this.st.blocks[bi] as Table
      const cells = t.rows.flatMap((r, i) => r.cells.map((_, j) => [i, j] as [number, number]))
      const k = cells.findIndex(([i, j]) => i === ri && j === ci) + (shift ? -1 : 1)
      if (k >= cells.length && !shift) {
        this.tableOp('rowBelow')
        return true
      }
      const [nr, nc] = cells[Math.max(0, k)]
      const pa = `${bi}.${nr}.${nc}.0`
      const p = this.para(pa)
      this.input.restore({ a: { pa, o: 0 }, f: { pa, o: p ? plen(p.runs as RRun[]) : 0 } })
      return true
    }
    const p = this.para(sel.a.pa)
    if (!p?.lst) return false
    this.indent(shift ? -1 : 1, sel)
    return true
  }

  backspaceAtStart(pa: string, p: Paragraph): boolean {
    if (!p.lst) return false
    this.setPara({ list: 'none' }, {}, { a: { pa, o: 0 }, f: { pa, o: 0 } })
    return true
  }

  // ---------------------------------------------------------------- blocks (tables)

  /** content width (pt) of the page, for sizing new tables / images */
  contentW = 468
  /** document default font (CSS) / size, shown when a run inherits them */
  defaultFont?: string
  defaultSz?: number

  private prevParaPid(bi: number): number | undefined {
    for (let i = bi - 1; i >= 0; i--) {
      const b = this.st.blocks[i]
      if (b.t === 'p' && b.pid !== undefined) return b.pid
    }
    return undefined
  }

  private commitTable(bi: number) {
    const t = this.st.blocks[bi] as Table
    if (t?.t !== 'tbl' || t.tid === undefined) return
    this.send('docx.table', { tid: t.tid, item: t.item, anchor: t.item === undefined ? this.prevParaPid(bi) : undefined, spec: tableSpec(t) })
  }

  private send(method: 'docx.table' | 'docx.edit', op: unknown) {
    this.inflight++
    ;(this.client.call as (m: string, ...a: unknown[]) => Promise<unknown>)(method, op)
      .then((res) => method === 'docx.edit' && this.applyResult(res as EditResult, new Set()))
      .catch((e) => console.error('[office] edit failed', e))
      .finally(() => this.inflight--)
  }

  /** Replaces top-level blocks (table insert/delete/restructure) with history + write-back. */
  replaceBlocks(bi: number, count: number, next: Block[], sel: Sel | null, history = true) {
    const before = this.st.blocks.slice(bi, bi + count)
    this.st.blocks.splice(bi, count, ...next)
    next.forEach((b, i) => {
      this.st.heights.set(b, this.st.heights.get(before[i] ?? before[0]) ?? 0)
      this.st.dirty.add(b)
    })
    if (bi < this.st.frontier) this.st.frontier = Math.max(0, this.st.frontier + next.length - count)
    const key = (b: Block) => (b.t === 'tbl' ? `t${b.tid ?? 'i' + b.item}` : b.t === 'p' ? `p${b.pid}` : '')
    const nextKeys = new Set(next.map(key))
    const beforeKeys = new Set(before.map(key))
    // paragraphs that appear / disappear
    const anchorP = [...before, ...next].find((b): b is Paragraph => b.t === 'p' && b.pid !== undefined && beforeKeys.has(key(b)) && nextKeys.has(key(b)))
    const added = next.filter((b): b is Paragraph => b.t === 'p' && b.pid !== undefined && !beforeKeys.has(key(b)))
    const removed = before.filter((b): b is Paragraph => b.t === 'p' && b.pid !== undefined && !nextKeys.has(key(b)))
    // paragraphs kept but replaced by another version (undo, collaborators) must reach the worker too
    const beforeObj = new Map(before.map((b) => [key(b), b]))
    const changed = next.some((b) => b.t === 'p' && b.pid !== undefined && beforeObj.has(key(b)) && beforeObj.get(key(b)) !== b)
    if (anchorP && (added.length || removed.length || changed)) {
      const list = next.filter((b): b is Paragraph => b.t === 'p' && b.pid !== undefined)
      this.send('docx.edit', { anchor: anchorP.pid, list: list.map((p) => paraSpec([p])), remove: removed.map((p) => p.pid) } as EditOp)
    }
    for (const b of before) if (b.t === 'tbl' && !nextKeys.has(key(b)) && (b.tid !== undefined || b.item !== undefined)) this.send('docx.table', { tid: b.tid ?? -1, item: b.item, spec: null })
    next.forEach((b, i) => {
      if (b.t !== 'tbl') return
      // an original table coming back (undo of its deletion) is regenerated from the model like a new one
      if (b.tid === undefined && !beforeKeys.has(key(b))) this.st.blocks[bi + i] = { ...b, tid: this.nextPid++ }
      this.commitTable(bi + i)
    })
    this.onCommit?.({ kind: 'blocks', bi, before, next })
    if (!history) this.catchUp()
    if (history) {
      const s = sel ?? this.input.lastSel ?? { a: { pa: String(bi), o: 0 }, f: { pa: String(bi), o: 0 } }
      this.history.push({ pas: [], before: [], after: [], blocks: { bi, before, after: next }, selBefore: this.input.lastSel ?? s, selAfter: s, label: 'table', t: Date.now() })
      this.future = []
    }
    if (sel) this.pendingSel = sel
    this.onDirty?.()
    this.changed()
  }

  private emptyPara(tpl: Paragraph): Paragraph {
    return {
      t: 'p', ps: { ...tpl.ps, indFirst: undefined, indL: undefined }, runs: [], markSz: tpl.markSz, markFont: tpl.markFont,
      pid: this.nextPid++, from: tpl.from ?? tpl.pid, orig: [], edited: true, keepSect: false, pd: { style: '', list: 'none' }, sid: undefined,
    }
  }

  insertTable(rowsN: number, colsN: number) {
    const sel = this.cmdSel()
    const bi = sel ? Number(sel.f.pa.split('.')[0]) : -1
    const p = this.st.blocks[bi]
    if (!sel || sel.f.pa.includes('.') || p?.t !== 'p' || p.pid === undefined) return
    const t: Table = { ...newTable(rowsN, colsN, this.contentW, () => this.emptyPara(p)), tid: this.nextPid++ }
    const after: Block[] = [p, t]
    const nextBlock = this.st.blocks[bi + 1]
    if (!nextBlock || nextBlock.t !== 'p') after.push(this.emptyPara(p))
    this.replaceBlocks(bi, 1, after, { a: { pa: `${bi + 1}.0.0.0`, o: 0 }, f: { pa: `${bi + 1}.0.0.0`, o: 0 } })
  }

  /** Structural table edit at the caret's cell. */
  tableOp(kind: 'rowAbove' | 'rowBelow' | 'colLeft' | 'colRight' | 'delRow' | 'delCol' | 'delTable') {
    const sel = this.tableCmdSel()
    if (!sel || !sel.f.pa.includes('.')) return
    const [bi, ri, ci] = sel.f.pa.split('.').map(Number)
    const t = this.st.blocks[bi] as Table
    if (t?.t !== 'tbl') return
    const g = gridOf(t).cells.find((c) => c.ri === ri && c.ci === ci)?.g ?? 0
    const mk = (tpl: { blocks: Block[] }) => {
      const p = tpl.blocks.find((b): b is Paragraph => b.t === 'p') ?? (this.st.blocks.find((b) => b.t === 'p' && b.pid !== undefined) as Paragraph)
      return { ...this.emptyPara(p), pd: {}, ps: p.ps, sid: p.sid }
    }
    let next: Table | null = t
    let caret = `${bi}.${ri}.${ci}.0`
    switch (kind) {
      case 'rowAbove':
        next = insertRow(t, ri, false, mk)
        caret = `${bi}.${ri}.0.0`
        break
      case 'rowBelow':
        next = insertRow(t, ri, true, mk)
        caret = `${bi}.${ri + 1}.0.0`
        break
      case 'colLeft':
        next = insertCol(t, g, false, mk)
        break
      case 'colRight':
        next = insertCol(t, g, true, mk)
        caret = `${bi}.${ri}.${ci + 1}.0`
        break
      case 'delRow':
        next = deleteRow(t, ri)
        caret = `${bi}.${Math.max(0, Math.min(ri, (next?.rows.length ?? 1) - 1))}.0.0`
        break
      case 'delCol':
        next = deleteCol(t, g)
        caret = `${bi}.${ri}.${Math.max(0, ci - 1)}.0`
        break
      case 'delTable':
        next = null
        break
    }
    if (!next) {
      const after = this.st.blocks[bi + 1]
      this.replaceBlocks(bi, 1, [], after?.t === 'p' ? { a: { pa: String(bi), o: 0 }, f: { pa: String(bi), o: 0 } } : null)
      return
    }
    next = { ...next, tid: t.tid ?? this.nextPid++ }
    this.replaceBlocks(bi, 1, [next], { a: { pa: caret, o: 0 }, f: { pa: caret, o: 0 } })
  }

  /** The cells the selection covers (a caret in a cell: that cell), grown to whole merged cells. */
  cellRange(sel: Sel | null = this.tableCmdSel()): { bi: number; t: Table; rect: CellRect; cells: number } | null {
    if (!sel) return null
    const a = path(sel.a.pa)
    const f = path(sel.f.pa)
    if (a.length < 4 || f.length < 4 || a[0] !== f[0]) return null
    const t = this.st.blocks[a[0]]
    if (t?.t !== 'tbl') return null
    const rect = rectOf(t, [a[1], a[2]], [f[1], f[2]])
    return rect ? { bi: a[0], t, rect, cells: cellsIn(t, rect).length } : null
  }

  /** replaces the table of a cell range, caret in the range's top-left cell */
  private putTable(bi: number, t: Table, next: Table, r0: number, g0: number) {
    const gc = gridOf(next).at(r0, g0)
    const caret = `${bi}.${gc?.ri ?? r0}.${gc?.ci ?? 0}.0`
    this.replaceBlocks(bi, 1, [{ ...next, tid: t.tid ?? this.nextPid++ }], { a: { pa: caret, o: 0 }, f: { pa: caret, o: 0 } })
  }

  /** Merges the selected cells, or splits the merged cell at the caret. */
  mergeCells(): boolean {
    const r = this.cellRange()
    if (!r) return false
    const next = mergeCells(r.t, r.rect)
    if (!next) return false
    this.putTable(r.bi, r.t, next, r.rect.r0, r.rect.g0)
    return true
  }

  unmergeCell(): boolean {
    const sel = this.tableCmdSel()
    if (!sel || !sel.f.pa.includes('.')) return false
    const [bi, ri, ci] = path(sel.f.pa)
    const t = this.st.blocks[bi]
    if (t?.t !== 'tbl') return false
    const g = gridOf(t).cells.find((c) => c.ri === ri && c.ci === ci)?.g ?? 0
    const next = unmergeCell(t, ri, ci, (tpl) => {
      const p = tpl.blocks.find((b): b is Paragraph => b.t === 'p') ?? (this.st.blocks.find((b) => b.t === 'p' && b.pid !== undefined) as Paragraph)
      return { ...this.emptyPara(p), pd: {}, ps: p.ps, sid: p.sid }
    })
    if (!next) return false
    this.putTable(bi, t, next, ri, g)
    return true
  }

  /** Borders of the selected cells; `css` is the line drawn ('0.5pt solid #000000'). */
  setCellBorders(preset: BorderPreset, css = '0.5pt solid #000000') {
    const r = this.cellRange()
    if (r) this.putTable(r.bi, r.t, setBorders(r.t, r.rect, preset, css), r.rect.r0, r.rect.g0)
  }

  /** Fill of the selected cells (null: no fill). */
  setCellShade(color: string | null) {
    const r = this.cellRange()
    if (r) this.putTable(r.bi, r.t, patchCells(r.t, r.rect, (c) => ({ ...c, shd: color ?? undefined, set: { ...c.set, shd: true } })), r.rect.r0, r.rect.g0)
  }

  setCellVAlign(v: 'top' | 'middle' | 'bottom') {
    const r = this.cellRange()
    if (r) this.putTable(r.bi, r.t, patchCells(r.t, r.rect, (c) => ({ ...c, vAlign: v === 'top' ? undefined : v, set: { ...c.set, vAlign: true } })), r.rect.r0, r.rect.g0)
  }

  /** Makes the selected columns (one cell selected: every column) the same width. */
  distributeColumns() {
    const r = this.cellRange()
    if (r) this.putTable(r.bi, r.t, distributeCols(r.t, r.cells > 1 ? r.rect : undefined), r.rect.r0, r.rect.g0)
  }

  /** Column widths of a table (pt), e.g. after dragging a column edge. */
  setColumnWidths(bi: number, cols: number[]) {
    const t = this.st.blocks[bi]
    if (t?.t !== 'tbl' || cols.length !== t.cols.length || cols.some((w) => !(w > 0))) return
    this.replaceBlocks(bi, 1, [{ ...t, cols: cols.map((w) => +w.toFixed(2)), tid: t.tid ?? this.nextPid++ }], this.input.lastSel)
  }

  /** Row heights of a table (pt); 0 keeps that row as-is, e.g. after dragging a row edge. */
  setRowHeights(bi: number, hs: number[]) {
    const t = this.st.blocks[bi]
    if (t?.t !== 'tbl' || hs.length !== t.rows.length) return
    this.replaceBlocks(
      bi,
      1,
      [{ ...t, rows: t.rows.map((r, i) => (hs[i] > 0 ? { ...r, h: +hs[i].toFixed(2) } : r)), tid: t.tid ?? this.nextPid++ }],
      this.input.lastSel
    )
  }

  // ---------------------------------------------------------------- inserts

  async insertImages(files: Blob[], at?: Sel) {
    const sel = at ?? this.cmdSel()
    if (!sel) return
    const runs: Inline[] = []
    for (const f of files) {
      const ext = (f.type.split('/')[1] ?? 'png').replace('svg+xml', 'svg').replace('jpeg', 'jpg')
      const { rid, path } = await this.client.call('docx.image', await f.arrayBuffer(), ext)
      const dims = await imageSize(f)
      const scale = Math.min(1, this.contentW / Math.max(1, dims.w * 0.75))
      runs.push({ t: 'img', target: path, w: +(dims.w * 0.75 * scale).toFixed(1), h: +(dims.h * 0.75 * scale).toFixed(1), rid })
    }
    opInsertRuns(this, sel, [runs as RRun[]], { label: 'image' })
  }

  async setLink(url: string | null) {
    const sel = this.input.sel()
    if (!sel) return
    if (!url) {
      this.patchRuns(sel, (r) => ({ ...r, href: undefined, lk: undefined }))
      return
    }
    const href = /^[a-z][\w+.-]*:/i.test(url) || url.startsWith('#') ? url : 'https://' + url
    const lk = await this.client.call('docx.link', href)
    const style = { color: '#0563c1', u: 'single' }
    if (collapsed(sel)) {
      opInsertRuns(this, sel, [[{ t: 'text', text: url, href, lk, s: { ...(runAt(this.para(sel.a.pa)?.runs as RRun[] ?? [], sel.a.o)?.s ?? {}), ...style }, d: style } as RRun]], { label: 'link' })
      return
    }
    this.patchRuns(sel, (r) => ({ ...r, href, lk, s: { ...(r.s ?? {}), ...style }, d: { ...(r.d ?? {}), ...style } }))
  }

  /** applies `fn` to the text runs inside the selection */
  private patchRuns(sel: Sel, fn: (r: RRun) => RRun) {
    const r = this.selectedParas(sel)
    if (!r) return
    const next = r.pas.map((pa, i) => {
      const p = this.para(pa)!
      const a = i === 0 ? r.s.o : 0
      const b = i === r.pas.length - 1 ? r.e.o : plen(p.runs as RRun[])
      const [left, rest] = splitRuns(p.runs as RRun[], a)
      const [mid, right] = splitRuns(rest, b - a)
      return this.withRuns(p, [...left, ...mid.map((x) => (x.t === 'text' ? fn(x) : x)), ...right])
    })
    this.replace(r.pas, next, sel, { label: 'format' })
  }

  insertPageBreak() {
    const sel = this.input.sel()
    if (!sel) return
    const p = this.para(sel.f.pa)
    if (!p || sel.f.pa.includes('.')) return
    const [l, r] = splitRuns(p.runs as RRun[], sel.f.o)
    const [a, b] = this.split(p, l, r, false)
    const b2 = applyParaPatch({ ...b, pb: true }, { pageBreak: true }, {}, this.mark())
    this.replace([sel.f.pa], [a, b2], { a: { pa: shiftPa(sel.f.pa, 1), o: 0 }, f: { pa: shiftPa(sel.f.pa, 1), o: 0 } }, { label: 'pagebreak', want: true })
  }

  /** scales the selected image (factor) or fits it to the page width */
  resizeImage(f: number | 'fit') {
    const sel = this.input.sel()
    if (!sel) return
    const [s] = ordered(this, sel)
    this.patchObjects(sel, (x) => {
      if (x.t !== 'img') return x
      const k = f === 'fit' ? this.contentW / x.w : f
      return { ...x, w: +(x.w * k).toFixed(1), h: +(x.h * k).toFixed(1), resized: true }
    })
    this.pendingSel = { a: s, f: { ...s, o: s.o + 1 } }
  }

  private patchObjects(sel: Sel, fn: (x: Inline) => Inline) {
    const [s, e] = ordered(this, sel)
    const p = this.para(s.pa)
    if (!p || s.pa !== e.pa) return
    const [left, rest] = splitRuns(p.runs as RRun[], s.o)
    const [mid, right] = splitRuns(rest, e.o - s.o)
    this.replace([s.pa], [this.withRuns(p, [...left, ...(mid as Inline[]).map(fn), ...right] as RRun[])], sel, { label: 'image' })
  }

  pasteRich(sel: Sel, data: DataTransfer): boolean {
    const files = Array.from(data.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (files.length) {
      void this.insertImages(files, sel)
      return true
    }
    const html = data.getData('text/html')
    if (!html) return false
    const paras = htmlToParas(html)
    if (!paras.length) return false
    void (async () => {
      const links = new Map<string, string>()
      for (const p of paras) for (const r of p.runs) if (r.t === 'text' && r.href && !links.has(r.href)) links.set(r.href, await this.client.call('docx.link', r.href))
      const lines = paras.map((p) => p.runs.map((r) => (r.t === 'text' && r.href ? { ...r, lk: links.get(r.href) } : r)) as RRun[])
      const headingId = (n: number) => this.styles.find((s) => s.name.toLowerCase() === `heading ${n}`)?.id
      const props = paras.map((p) => {
        if (!p.heading && !p.list) return undefined
        return (q: Paragraph) => {
          const h = p.heading ? headingId(p.heading) : undefined
          const patch: ParaDirty = { ...(h ? { style: h } : {}), ...(p.list ? { list: p.list } : {}) }
          return applyParaPatch(q, patch, {}, this.mark())
        }
      })
      opInsertRuns(this, sel, lines, { label: 'paste' }, props as unknown as ((p: RichParaLike) => RichParaLike)[])
    })()
    return true
  }

  // ---------------------------------------------------------------- styles

  /** applies a built-in style (Title, Heading 1…), creating it in the document when missing */
  async applyCanon(kind: CanonStyle) {
    const sel = this.input.sel()
    if (!sel) return
    let id = this.styles.find((s) => s.canon === kind)?.id
    let caret: Sel | null = null
    if (!id) {
      id = await this.canonId(kind)
      // adding the style took a while: the user may have typed on
      caret = this.input.readSel()
    }
    if (!id) return
    this.setPara({ style: id }, {}, sel)
    // the style goes to the paragraphs picked; the caret stays where the typing took it
    if (caret) this.pendingSel = caret
  }

  /** id of a built-in style, added to the document when it lacks it; undefined when it could not be */
  private async canonId(kind: CanonStyle): Promise<string | undefined> {
    const have = this.styles.find((s) => s.canon === kind)?.id
    if (have) return have
    const r = await this.client.call('docx.style', kind)
    // a shared session answers nothing when the operation could not be applied
    if (!r) return undefined
    this.styled(r)
    return r.id || undefined
  }

  /** style call answers already taken in (a shared session hands the same answer to the caller and to its adapter) */
  private taken = new WeakSet<object>()
  /** counts the looks given to styles; style id → the count when it last got one */
  private styleGen = 0
  private changedAt = new Map<string, number>()
  /** paragraph → the count its look was computed at (absent: when the document was read) */
  private lookAt = new WeakMap<Paragraph, number>()
  private passing = false
  /** paragraph → the one that took its place when it was converted again (same content, the look of the styles by then) */
  private heir = new WeakMap<Paragraph, Paragraph>()

  /** `p` as it stands now: converted again or not, the same paragraph as long as nobody edited it */
  private latest(p: Paragraph): Paragraph {
    for (let n = this.heir.get(p); n; n = this.heir.get(p)) p = n
    return p
  }

  /** takes in the answer of a style call: the picker's list and, when styles look different now, what shows them */
  styled(res: { styles: StyleInfo[]; changed?: string[]; headers?: HeaderFooters }) {
    if (this.taken.has(res)) return
    this.taken.add(res)
    this.styles = res.styles
    this.onStyles?.(res.styles)
    if (!res.changed?.length) return
    if (res.headers) this.onHeaders?.(res.headers)
    this.styleGen++
    for (const id of res.changed) this.changedAt.set(id, this.styleGen)
    this.onDirty?.()
    this.catchUp()
  }

  // ---------------------------------------------------------------- page setup

  /** the page setup changed (here or by a collaborator) */
  onPage?: (page: PageSetup) => void
  /** the page setup as last changed in this session (undefined: as in the file) */
  pageNow?: PageSetup

  paged(res: PageSetResult) {
    if (this.taken.has(res)) return
    this.taken.add(res)
    this.pageNow = res.page
    this.onPage?.(res.page)
    this.onDirty?.()
  }

  /** Changes the page setup of the whole document (size, orientation, margins, columns); undoable. */
  async setPage(set: PageSet): Promise<PageSetResult | undefined> {
    if (!Object.keys(set).length) return
    let res: PageSetResult
    try {
      res = await this.client.call('docx.page', set)
    } catch (e) {
      // a failed page setup must be visible: the user clicked a toolbar button and expects the page to change
      this.onError?.(String(e))
      return undefined
    }
    if (!res) return
    this.paged(res)
    const sel = this.input.lastSel ?? { a: { pa: '0', o: 0 }, f: { pa: '0', o: 0 } }
    this.history.push({ pas: [], before: [], after: [], selBefore: sel, selAfter: sel, label: 'page', t: Date.now(), page: { undo: res.undo, redo: set } })
    this.future = []
    this.emitState(this.input.sel() ?? sel)
    return res
  }

  // ---------------------------------------------------------------- tracked changes

  /** edits are recorded as tracked changes ("suggesting") */
  tracking = false
  /** the name tracked changes made here are signed with */
  author: () => string = () => 'Me'
  onTracking?: (on: boolean) => void

  setTracking(on: boolean) {
    this.tracking = on
    this.onTracking?.(on)
    this.emitState(this.input.sel())
  }

  /** every editable paragraph, top level and in table cells, with its address */
  private allParas(): { pa: string; p: Paragraph }[] {
    const out: { pa: string; p: Paragraph }[] = []
    this.st.blocks.forEach((b, bi) => {
      if (b.t === 'p') {
        if (b.pid !== undefined && !b.ro) out.push({ pa: String(bi), p: b })
      } else if (b.t === 'tbl')
        b.rows.forEach((r, ri) =>
          r.cells.forEach((c, ci) => c.blocks.forEach((x, k) => x.t === 'p' && x.pid !== undefined && !x.ro && out.push({ pa: `${bi}.${ri}.${ci}.${k}`, p: x }))),
        )
    })
    return out
  }

  /** how many tracked changes the document holds (runs of inserted / deleted text) */
  changeCount(): number {
    return this.allParas().reduce((n, x) => n + changeSpans(x.p).length, 0)
  }

  /**
   * Accepts (or rejects) the tracked changes in the selection — the change at the caret when nothing is selected —
   * or all of them. Undoable.
   */
  review(accept: boolean, all = false): number {
    const label = accept ? 'accept' : 'reject'
    let done = 0
    if (all) {
      // one paragraph (or one run of neighbouring top-level paragraphs) at a time
      const hits = this.allParas().filter((x) => hasChanges(x.p))
      const groups: { pa: string; p: Paragraph }[][] = []
      for (const h of hits) {
        const g = groups[groups.length - 1]
        const last = g?.[g.length - 1]
        if (last && !last.pa.includes('.') && !h.pa.includes('.') && Number(h.pa) === Number(last.pa) + 1) g.push(h)
        else groups.push([h])
      }
      const h0 = this.history.length
      for (const g of groups) {
        const next = g.map(({ p }) => resolvePara({ ...p, runs: resolveRuns(p.runs, 0, plen(p.runs as RRun[]), accept), edited: true }, accept))
        done += g.reduce((n, x) => n + changeSpans(x.p).length, 0)
        this.replace(
          g.map((x) => x.pa),
          next,
          { a: { pa: g[0].pa, o: 0 }, f: { pa: g[0].pa, o: 0 } },
          { label, want: true, remount: true },
        )
      }
      // one undo step for the whole command
      const parts = this.history.splice(Math.min(h0, this.history.length))
      if (parts.length) this.history.push(parts.length > 1 ? { ...parts[parts.length - 1], group: parts } : parts[0])
      return done
    }
    const sel = this.input.sel()
    if (!sel) return 0
    const [s, e] = ordered(this, sel)
    const pas = this.span(s.pa, e.pa)
    if (!pas) return 0
    const next = pas.map((pa, i) => {
      const p = this.para(pa)!
      let a = i === 0 ? s.o : 0
      let b = i === pas.length - 1 ? e.o : plen(p.runs as RRun[])
      if (pas.length === 1 && a === b) {
        // caret: the change it touches
        const span = changeSpans(p).find((x) => x.a <= a && a <= x.b && (x.a < a || a < x.b || x.b > x.a))
        if (!span) return p
        a = span.a
        b = span.b
      }
      done += changeSpans({ ...p, runs: sliceRunsOf(p, a, b) }).length
      const q = { ...p, runs: resolveRuns(p.runs, a, b, accept), edited: true }
      return p.pc ? resolvePara(q, accept) : q
    })
    if (!done) return 0
    this.replace(pas, next, { a: s, f: s }, { label, want: true, remount: true })
    return done
  }

  /** Selects the next (or previous) tracked change after the caret; false when there is none. */
  gotoChange(dir: 1 | -1): boolean {
    const all = this.allParas()
    const sel = this.input.sel()
    const [s, e] = sel ? ordered(this, sel) : [null, null]
    const here = (dir > 0 ? e : s) ?? { pa: dir > 0 ? '0' : String(this.st.blocks.length), o: 0 }
    const spans = all.flatMap((x) => changeSpans(x.p).map((c) => ({ pa: x.pa, ...c })))
    const after = (x: { pa: string; a: number; b: number }) => {
      const c = this.cmp(x.pa, here.pa)
      return dir > 0 ? c > 0 || (c === 0 && x.a >= here.o && !(s && x.pa === s.pa && x.a === s.o && e && x.b === e.o)) : c < 0 || (c === 0 && x.b <= here.o && !(s && x.pa === s.pa && x.a === s.o))
    }
    const hit = dir > 0 ? spans.find(after) : [...spans].reverse().find(after)
    if (!hit) return false
    const to = { a: { pa: hit.pa, o: hit.a }, f: { pa: hit.pa, o: hit.b } }
    this.pendingSel = to
    this.input.lastSel = to
    this.changed()
    this.emitState(to)
    return true
  }

  // ---------------------------------------------------------------- headers / footers

  /** the headers / footers changed (here or by a collaborator) */
  onHF?: (r: { headers: HeaderFooters; titlePg: boolean; evenAndOddHeaders?: boolean }) => void
  /** headers / footers as last changed in this session (undefined: as in the file) */
  hfNow?: { headers: HeaderFooters; titlePg: boolean; evenAndOddHeaders?: boolean }

  hfed(res: HFSetResult) {
    if (this.taken.has(res)) return
    this.taken.add(res)
    this.hfNow = { headers: res.headers, titlePg: res.titlePg, evenAndOddHeaders: res.evenAndOddHeaders }
    this.onHF?.(this.hfNow)
    this.onDirty?.()
  }

  /** Changes the headers / footers (text, page numbers, different first page); undoable. */
  async setHeaderFooter(set: HFSet): Promise<HFSetResult | undefined> {
    if (!set.parts && !set.raw && set.titlePg === undefined && set.evenAndOddHeaders === undefined) return
    const res = await this.client.call('docx.hf', set)
    if (!res) return
    this.hfed(res)
    const sel = this.input.lastSel ?? { a: { pa: '0', o: 0 }, f: { pa: '0', o: 0 } }
    this.history.push({ pas: [], before: [], after: [], selBefore: sel, selAfter: sel, label: 'header', t: Date.now(), hf: { undo: res.undo, redo: set } })
    this.future = []
    this.emitState(this.input.sel() ?? sel)
    return res
  }

  private rehf(set: HFSet) {
    this.client
      .call('docx.hf', set)
      .then((res) => res && this.hfed(res))
      .catch((e) => console.error('[office] header / footer change failed', e))
  }

  private repage(set: PageSet) {
    this.client
      .call('docx.page', set)
      .then((res) => res && this.paged(res))
      .catch((e) => {
        console.error('[office] page setup failed', e)
        this.onError?.(String(e))
      })
  }

  private async setStyle(id: string, look: StyleLook) {
    const res = await this.client.call('docx.styleSet', id, look)
    if (res) this.styled(res)
    return res
  }

  /** undo / redo of a style's look */
  private restyle(id: string, look: StyleLook) {
    this.setStyle(id, look).catch((e) => console.error('[office] style change failed', e))
  }

  /**
   * "Update style to match": the paragraph style takes the look of the selection (font, size, colour, bold, italic,
   * underline, strikethrough; alignment, line and paragraph spacing), the selected paragraphs get the style, and
   * every paragraph of the style follows. Written to this document's styles only.
   * `target`: a style id, or `@kind` for a built-in style the document may not have yet.
   * Resolves to whether the style looks different now (undefined: there was nothing to take a look from).
   */
  async updateStyle(target: string): Promise<boolean | undefined> {
    const sel = this.input.sel()
    const r = sel && this.selectedParas(sel)
    const c = r && this.container(r.s.pa)
    const src = r && this.para(r.s.pa)
    if (!sel || !r || !c || !src) return
    const picked = r.pas.map((pa) => this.para(pa)!)
    const id = target.startsWith('@') ? await this.canonId(target.slice(1) as CanonStyle) : target
    if (!id) return
    // the look as the styles give it outside any table: what a table style adds belongs to the table
    const parts = this.partsOf(c.list, src.pid!, c.at)
    const conv = await this.client.call('docx.convert', [paraSpec(parts)], true)
    const bare = (conv?.[0] ?? []).filter((b): b is Paragraph => b.t === 'p')[parts.indexOf(src)]
    if (!bare || plen(bare.runs as RRun[]) !== plen(src.runs as RRun[])) return
    // the first character selected (the one before the caret when nothing is)
    const o = collapsed(sel) ? r.s.o : r.s.o + (plen(src.runs as RRun[]) > r.s.o ? 1 : 0)
    const run = runAt(bare.runs as RRun[], o) as (Inline & { t: 'text' }) | undefined
    const look: StyleLook = { ...paraLook(bare.ps), ...(run ? { ...runLook(run.s), font: firstFont(run.s.font) } : { sz: bare.markSz, font: firstFont(bare.markFont) }) }
    const res = await this.setStyle(id, look)
    // no answer: a shared session could not apply it
    if (!res || res.missing) return
    const style = res.changed.length ? { id, undo: res.undo, redo: look } : undefined
    // the paragraphs picked, where they are now; edited meanwhile, they stay as they are and the style keeps its look
    const where = () => {
      const now = this.latest(src)
      const at = this.locate(src.pid!).find((l) => l.list[l.index] === now)?.pa
      const pas = at === undefined ? [] : picked.map((_, i) => shiftPa(at, i))
      return pas.length > 0 && pas.every((pa, i) => this.para(pa) === this.latest(picked[i])) ? pas : null
    }
    const alone = () => {
      if (!style) return false
      this.history.push({ pas: [], before: [], after: [], selBefore: sel, selAfter: sel, label: 'style', t: Date.now(), style })
      this.future = []
      this.emitState(this.input.sel())
      return true
    }
    if (!where()) return alone()
    // nothing to do to them: they have the style, and it already looked like them
    if (!style && picked.every((p) => p.sid === id)) return false
    const cur = picked.map((p) => this.latest(p))
    // They get the style. What their text sets itself and the style gives now is dropped, so that the next look given
    // to the style reaches this text too; kept where dropping it would show (it overrides a table or character style).
    const ref = runLook((runAt(src.runs as RRun[], o) as (Inline & { t: 'text' }) | undefined)?.s)
    const refP = paraLook(src.ps)
    const plain = cur.map((p): Paragraph => applyParaPatch(p, { style: id }, {}, this.mark()))
    const tidy = plain.map((p): Paragraph => {
      const pd: ParaDirty = { ...p.pd }
      const own = paraLook(p.ps)
      for (const k of PARA_LOOK) if (look[k] !== undefined && own[k] === refP[k]) pd[k] = null
      const runs = p.runs.map((x) => {
        if (x.t !== 'text' || !run) return x
        const mine = runLook(x.s)
        const d: RunSet = { ...(x.d ?? {}) }
        for (const k of RUN_LOOK) if (mine[k] === ref[k]) d[k] = null
        return { ...x, d }
      })
      return { ...p, pd, runs }
    })
    const tried = await this.client.call('docx.convert', [...plain, ...tidy].map((p) => paraSpec([p])))
    const pas = where()
    if (!pas) return alone()
    const first = (i: number) => (tried?.[i] ?? []).find((b): b is Paragraph => b.t === 'p')
    const next = plain.map((p, i) => {
      const a = first(i)
      const b = first(i + plain.length)
      if (!a || !b) return p
      const la = charLooks(a)
      const lb = charLooks(b)
      let at = 0
      const runs = p.runs.map((x, j) => {
        const from = at
        at += rlen(x as RRun)
        for (let k = from; k < at; k++) if (la[k] !== lb[k]) return x
        return tidy[i].runs[j]
      })
      const pd = JSON.stringify(paraLook(a.ps)) === JSON.stringify(paraLook(b.ps)) ? tidy[i].pd : p.pd
      return { ...p, pd, runs: normalize(runs as RRun[]) as Inline[] }
    })
    this.replace(pas, next, this.input.sel() ?? sel, { label: 'style', want: true })
    if (style) this.history[this.history.length - 1].style = style
    return !!style
  }

  /** a paragraph whose style got another look after its own look was computed */
  private behind(p: Paragraph, normal: string): boolean {
    const at = this.changedAt.get(p.sid || normal)
    return at !== undefined && (this.lookAt.get(p) ?? 0) < at
  }

  /** every paragraph with an id, in document order (those of table cells too), the parts a page break splits it in together */
  private groups(): { pa: string; parts: Paragraph[] }[] {
    const out: { pa: string; parts: Paragraph[] }[] = []
    const scan = (list: Block[], pa: (i: number) => string) => {
      let last: Paragraph | undefined
      list.forEach((b, i) => {
        if (b.t !== 'p' || b.pid === undefined) return void (last = undefined)
        if (last && last.pid === b.pid) out[out.length - 1].parts.push(b)
        else out.push({ pa: pa(i), parts: [b] })
        last = b
      })
    }
    scan(this.st.blocks, String)
    this.st.blocks.forEach((b, bi) => {
      if (b.t === 'tbl') b.rows.forEach((row, ri) => row.cells.forEach((cell, ci) => scan(cell.blocks, (i) => `${bi}.${ri}.${ci}.${i}`)))
    })
    return out
  }

  /** shows the paragraphs whose style got another look with it (those a collaborator sends may still have the old one) */
  private catchUp() {
    if (!this.changedAt.size || this.passing) return
    this.passing = true
    this.pass().catch((e) => console.error('[office] restyle failed', e))
  }

  /** converts the paragraphs behind their style again, a slice at a time, and gives them the look that comes back */
  private async pass() {
    try {
      const tries = new Map<number, number>()
      let since = performance.now()
      for (;;) {
        // with the engine on this thread the rounds follow each other without a pause: typing and painting get through
        if (performance.now() - since > 40) {
          await new Promise((r) => setTimeout(r, 0))
          since = performance.now()
        }
        const gen = this.styleGen
        const normal = this.styles.find((s) => s.canon === 'normal')?.id ?? ''
        const batch = this.groups()
          .filter((g) => g.parts.some((p) => this.behind(p, normal)) && (tries.get(g.parts[0].pid!) ?? 0) < 3)
          .slice(0, 200)
        if (!batch.length) return
        const res = await this.client.call('docx.convert', batch.map((g) => paraSpec(g.parts)))
        // never rebuild paragraphs under an active IME composition
        while (this.input.isComposing) await new Promise((r) => setTimeout(r, 50))
        // a style changed again meanwhile: what came back may be the look before that
        if (gen !== this.styleGen) {
          tries.clear()
          continue
        }
        const where = new Map(this.groups().map((g) => [g.parts[0], g]))
        const sel = this.input.readSel()
        let touched = false
        let caret = false
        for (const [gi, g] of batch.entries()) {
          const pid = g.parts[0].pid!
          const cur = where.get(g.parts[0])
          if (!cur || cur.parts.length !== g.parts.length || cur.parts.some((p, i) => p !== g.parts[i])) {
            // edited meanwhile (other objects now): converted in a later round, or with its next edit when it keeps changing
            const n = (tries.get(pid) ?? 0) + 1
            tries.set(pid, n)
            if (n >= 3) this.stale.add(pid)
            continue
          }
          const conv = (res?.[gi] ?? []).filter((b): b is Paragraph => b.t === 'p')
          const next = conv.length === g.parts.length ? g.parts.map((p, i) => reskin(p, conv[i])) : []
          if (!next.length || next.some((p) => !p)) {
            // not the same content when converted alone: it takes the look with its next conversion
            for (const p of g.parts) this.lookAt.set(p, gen)
            this.stale.add(pid)
            continue
          }
          next.forEach((p, i) => {
            const pa = shiftPa(cur.pa, i)
            this.put(pa, p!)
            this.lookAt.set(p!, gen)
            this.heir.set(g.parts[i], p!)
            caret ||= sel?.a.pa === pa || sel?.f.pa === pa
          })
          // text typed into an empty paragraph starts from the formatting kept for it: converted with that edit
          if (g.parts.some((p) => p.caret)) this.stale.add(pid)
          touched = true
        }
        if (!touched) continue
        // the caret inside a rebuilt paragraph is put back after the render
        if (caret && sel && !this.pendingSel) this.pendingSel = sel
        this.changed()
        this.emitState(this.input.sel())
      }
    } finally {
      // on the way out, before anything else runs: a style changing right then starts a pass of its own
      this.passing = false
    }
  }

  // ---------------------------------------------------------------- images

  /** selects the inline object at (pa, o) */
  selectObject(pa: string, o: number) {
    const sel = { a: { pa, o }, f: { pa, o: o + 1 } }
    this.input.restore(sel)
    this.onSelection(sel)
  }

  private imageSel(): Sel | null {
    const sel = this.cmdSel()
    const img = sel && this.state(sel)?.img
    return img ? { a: { pa: img.pa, o: img.o }, f: { pa: img.pa, o: img.o + 1 } } : null
  }

  private patchImage(fn: (x: Inline & { t: 'img' }) => Inline) {
    const sel = this.imageSel()
    if (!sel) return
    this.patchObjects(sel, (x) => (x.t === 'img' ? fn(x) : x))
    this.pendingSel = sel
  }

  /** exact size in pt */
  setImageSize(w: number, h: number) {
    this.patchImage((x) => ({ ...x, w: +Math.max(4, w).toFixed(1), h: +Math.max(4, h).toFixed(1), resized: true }))
  }

  /** wrap kind / position of the selected picture (null = back to inline). */
  setImageWrap(wrap: WrapSpec | null) {
    this.patchImage((x) => ({ ...x, wrap: wrap ?? undefined, wrapSet: true }))
  }

  /** dragging a floating picture: absolute offsets (pt) from its H/V reference. */
  setImagePos(hOff: number, vOff: number) {
    this.patchImage((x) => {
      const p = x.wrap?.pos
      const wrap: WrapSpec = {
        kind: x.wrap?.kind ?? 'square',
        pos: { hRel: p?.hRel ?? 'column', vRel: p?.vRel ?? 'paragraph', hOff: +hOff.toFixed(1), vOff: +vOff.toFixed(1) },
        distT: x.wrap?.distT, distB: x.wrap?.distB, distL: x.wrap?.distL, distR: x.wrap?.distR,
      }
      return { ...x, wrap, wrapSet: true }
    })
  }

  /** natural pixel size of the picture → pt, limited to the text width */
  imageOriginal(nw: number, nh: number) {
    const k = Math.min(1, this.contentW / Math.max(1, nw * 0.75))
    this.setImageSize(nw * 0.75 * k, nh * 0.75 * k)
  }

  /** rotation of the selected picture, in degrees (written as a:xfrm/@rot = deg * 60000) */
  setImageRot(rot: number) {
    this.patchImage((x) => ({ ...x, rot: +(rot % 360).toFixed(2), rotSet: true }))
  }

  setAltText(alt: string) {
    this.patchImage((x) => ({ ...x, alt: alt || undefined, altSet: true }))
  }

  async replaceImage(file: Blob) {
    const sel = this.imageSel()
    if (!sel) return
    const ext = (file.type.split('/')[1] ?? 'png').replace('svg+xml', 'svg').replace('jpeg', 'jpg')
    const { rid, path } = await this.client.call('docx.image', await file.arrayBuffer(), ext)
    const dims = await imageSize(file)
    this.input.restore(sel)
    this.patchImage((x) => {
      // keep the current width, follow the new picture's proportions
      const h = +(x.w * (dims.h / Math.max(1, dims.w))).toFixed(1)
      return { ...x, target: path, rid, repl: !!x.src, h, resized: true }
    })
  }

  /** deletes the selection (or the selected object) */
  deleteSelection() {
    const sel = this.input.sel()
    if (sel && !collapsed(sel)) opInsert(this, sel, '')
  }

  insertText(text: string) {
    const sel = this.input.sel()
    if (sel) opInsert(this, sel, text)
  }

  // ---------------------------------------------------------------- paint format

  /** copies the caret's character formatting; the next selection receives it */
  copyFormat() {
    if (this.painter) {
      this.painter = null
      this.onPainter?.(false)
      return
    }
    const st = this.state()
    if (!st) return
    this.painter = {
      b: st.b,
      i: st.i,
      u: st.u ? 'single' : 'none',
      strike: st.strike,
      color: st.color ?? null,
      hl: st.hl ?? null,
      va: st.va ?? null,
      sz: st.sz,
      font: st.font ? (/^\s*"?([^",]+)/.exec(st.font)?.[1] ?? st.font) : undefined,
    } as RunSet
    this.onPainter?.(true)
  }

  /** applies the copied formatting to the current selection (after the mouse is released) */
  applyPainter(): boolean {
    const set = this.painter
    const sel = this.input.readSel()
    if (!set || !sel || collapsed(sel)) return false
    this.painter = null
    this.onPainter?.(false)
    const s: Partial<RunStyle> = {}
    for (const [k, v] of Object.entries(set)) {
      if (k === 'font') (s as Record<string, unknown>).font = v ? cssFont(v as string) : undefined
      else if (k === 'u') (s as Record<string, unknown>).u = v
      else (s as Record<string, unknown>)[k] = v === null ? undefined : v
    }
    this.format(s, set)
    return true
  }

  // ---------------------------------------------------------------- toolbar state

  state(sel = this.input.sel()): FormatState | null {
    if (!sel) return null
    const [s] = ordered(this, sel)
    const p = this.para(s.pa)
    if (!p) return null
    const run = runAt(p.runs as RRun[], collapsed(sel) ? s.o : s.o + (plen(p.runs as RRun[]) > s.o ? 1 : 0)) as (Inline & { t: 'text' }) | undefined
    const rs: RunStyle = { ...(run?.s ?? {}), ...(collapsed(sel) ? this.pend?.s ?? {} : {}) }
    const [, e] = ordered(this, sel)
    let img: FormatState['img']
    if (s.pa === e.pa && e.o === s.o + 1) {
      const [, right] = splitRuns(p.runs as RRun[], s.o)
      const x = right[0] as Inline | undefined
      if (x?.t === 'img') img = { w: x.w, h: x.h, alt: x.alt, target: x.target, pa: s.pa, o: s.o, wrap: x.wrap, rot: x.rot }
    }
    return {
      line: p.pd?.line ?? (p.ps.lineRule === 'auto' || !p.ps.lineRule ? p.ps.line : undefined),
      va: rs.va,
      link: (run as { href?: string } | undefined)?.href,
      inTable: s.pa.includes('.'),
      cells: this.cellState(sel),
      tracking: this.tracking,
      inChange: (() => {
        const [, e2] = ordered(this, sel)
        return changeSpans(p).some((x) => (s.pa === e2.pa ? x.a <= e2.o && s.o <= x.b : true))
      })(),
      img,
      b: !!rs.b,
      i: !!rs.i,
      u: !!rs.u && rs.u !== 'none',
      strike: !!rs.strike,
      color: rs.color,
      hl: rs.hl,
      sz: rs.sz ?? p.markSz ?? this.defaultSz,
      font: rs.font ?? p.markFont ?? this.defaultFont,
      align: p.ps.align ?? 'left',
      style: p.sid,
      lst: p.lst,
      canUndo: this.canUndo,
      canRedo: this.canRedo,
    }
  }

  private cellState(sel: Sel): FormatState['cells'] {
    const r = this.cellRange(sel)
    if (!r) return undefined
    const [bi, ri, ci] = path(sel.f.pa)
    const cell = (this.st.blocks[bi] as Table).rows[ri]?.cells[ci]
    return { n: r.cells, merged: !!cell && (cell.colSpan > 1 || cell.rowSpan > 1), shd: cell?.shd, vAlign: cell?.vAlign ?? 'top' }
  }

  private emitState(sel: Sel | null) {
    const st = sel ? this.state(sel) : null
    this.onState?.(st)
    this.onImage?.(st?.img ?? null)
  }

  onSelection(sel: Sel | null) {
    if (sel && this.pend && (sel.a.pa !== this.pend.at.pa || sel.a.o !== this.pend.at.o)) this.pend = null
    this.markCells(sel)
    this.emitState(sel)
  }

  /** table cells covered by a selection that spans more than one cell get a tint */
  private markCells(sel: Sel | null) {
    const root = this.input.root
    if (!root) return
    root.querySelectorAll('.de-cell-sel').forEach((el) => el.classList.remove('de-cell-sel'))
    const r = sel ? this.cellRange(sel) : null
    if (!r || r.cells < 2) return
    for (const c of cellsIn(r.t, r.rect)) root.querySelector(`[data-pa^="${r.bi}.${c.ri}.${c.ci}."]`)?.closest('td')?.classList.add('de-cell-sel')
  }
}

type RichParaLike = Parameters<NonNullable<Parameters<typeof opInsertRuns>[4]>[number]>[0]

function imageSize(blob: Blob): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      resolve({ w: img.naturalWidth || 300, h: img.naturalHeight || 200 })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve({ w: 300, h: 200 })
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}
