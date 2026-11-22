/**
 * Controlled contentEditable: the DOM is only a view. Every mutation is taken from
 * `beforeinput` (cancelled) and applied to the model through a RichHost; IME
 * composition (Vietnamese Telex/VNI, CJK…) is committed on `compositionend`.
 */
import {
  collapsed, deleteRange, insertText, marksAt, nextBoundary, normalize, plen, prevBoundary, runAt, runsText, shiftPa, splitRuns, withMarks,
  type Pos, type RRun, type Sel,
} from './rich'

export interface RichPara {
  runs: RRun[]
}

export interface ReplaceOpts {
  label?: string
  /** rebuild paragraph DOM (after IME composition mutated it) */
  remount?: boolean
}

export interface RichHost<P extends RichPara = RichPara> {
  para(pa: string): P | undefined
  /** inclusive list of paragraph addresses from a to b in one container, or null */
  span(a: string, b: string): string[] | null
  prev(pa: string): string | undefined
  next(pa: string): string | undefined
  cmp(a: string, b: string): number
  /** replace contiguous paragraphs; `sel` is the selection afterwards */
  replace(pas: string[], next: P[], sel: Sel, opts?: ReplaceOpts): void
  withRuns(p: P, runs: RRun[]): P
  split(p: P, left: RRun[], right: RRun[], atEnd: boolean): [P, P]
  join(a: P, b: P, runs: RRun[]): P
  /** Backspace at offset 0 (e.g. leave a list); true when handled */
  backspaceAtStart?(pa: string, p: P): boolean
  /** Tab inside a paragraph (e.g. indent list); true when handled */
  tab?(sel: Sel, shift: boolean): boolean
  undo(): void
  redo(): void
  toggle?(key: 'b' | 'i' | 'u'): void
  shortcut?(e: KeyboardEvent): boolean
  /** style for text typed into an empty paragraph */
  defaultRun?(p: P): Partial<RRun> | undefined
  /** paste with formatting / files; true when handled */
  pasteRich?(sel: Sel, data: DataTransfer): boolean
  /** caret style for the next typed text (set after formatting a collapsed selection) */
  pendingStyle?(): Partial<RRun> | undefined
  clearPending?(): void
  onSelection?(sel: Sel | null): void
  /** the whole document (select all); null when there is nothing to select */
  all?(): Sel | null
  /** deletes a range that spans other blocks (tables): applies the change and returns the caret, or null when unsupported */
  deleteAcross?(s: Pos, e: Pos): Pos | null
}

export function ordered(host: RichHost, s: Sel): [Pos, Pos] {
  const c = host.cmp(s.a.pa, s.f.pa)
  if (c < 0 || (c === 0 && s.a.o <= s.f.o)) return [s.a, s.f]
  return [s.f, s.a]
}

const caret = (p: Pos): Sel => ({ a: p, f: p })
const sameSel = (a: Sel, b: Sel) => a.a.pa === b.a.pa && a.a.o === b.a.o && a.f.pa === b.f.pa && a.f.o === b.f.o

// ---------------------------------------------------------------- model operations

interface Plan<P extends RichPara> {
  pas: string[]
  paras: P[]
  at: Pos
  /** the deletion is already applied (block-level, see RichHost.deleteAcross) */
  applied?: boolean
}

/** Removes the selected content (in memory); null when the selection spans containers. */
function planDelete<P extends RichPara>(host: RichHost<P>, sel: Sel): Plan<P> | null {
  const [s, e] = ordered(host, sel)
  if (s.pa === e.pa) {
    const p = host.para(s.pa)
    if (!p) return null
    return { pas: [s.pa], paras: [host.withRuns(p, deleteRange(p.runs, s.o, e.o))], at: s }
  }
  const list = host.span(s.pa, e.pa)
  if (!list) {
    const at = host.deleteAcross?.(s, e)
    const p = at && host.para(at.pa)
    return at && p ? { pas: [at.pa], paras: [p], at, applied: true } : null
  }
  const first = host.para(list[0])!
  const last = host.para(list[list.length - 1])!
  const runs = normalize([...splitRuns(first.runs, s.o)[0], ...splitRuns(last.runs, e.o)[1]])
  return { pas: list, paras: [host.join(first, last, runs)], at: s }
}

export function opDelete(host: RichHost, sel: Sel, opts?: ReplaceOpts) {
  const plan = planDelete(host, sel)
  if (!plan || plan.applied) return
  host.replace(plan.pas, plan.paras, caret(plan.at), opts)
}

function planAt(host: RichHost, sel: Sel): Plan<RichPara> | null {
  if (!collapsed(sel)) return planDelete(host, sel)
  const p = host.para(sel.a.pa)
  return p ? { pas: [sel.a.pa], paras: [p], at: sel.a } : null
}

/**
 * Inserts runs at the selection; `lines[i]` (i > 0) start new paragraphs.
 * `props[i]` can adjust the paragraph created for line i (e.g. heading style from pasted HTML).
 */
export function opInsertRuns(host: RichHost, sel: Sel, lines: RRun[][], opts: ReplaceOpts = {}, props?: ((p: RichPara) => RichPara)[]) {
  const plan = planAt(host, sel)
  if (!plan) return
  const p = plan.paras[0]
  const o = plan.at.o
  const [left, right] = splitRuns(p.runs, o)
  const near = runAt(p.runs, o) ?? (host.defaultRun?.(p) as RRun | undefined)
  // the look of the neighbouring run, not its tracked change
  const fallback = near?.tc ? (({ tc: _tc, ...rest }) => rest as RRun)(near) : near
  // pasted runs join the comment threads covering both sides of the paste, nothing else
  const cm = marksAt(p.runs, o)
  const fill = (runs: RRun[]) => runs.map((r) => withMarks(r.t === 'text' && !r.s && fallback ? { ...fallback, ...r, s: fallback.s, src: fallback.src } : r, cm))
  if (lines.length === 1) {
    const ins = fill(lines[0])
    const runs = normalize([...left, ...ins, ...right])
    host.replace(plan.pas, [host.withRuns(p, runs)], caret({ pa: plan.at.pa, o: o + plen(ins) }), { label: 'paste', ...opts })
    return
  }
  const out: RichPara[] = []
  let cur = host.withRuns(p, normalize([...left, ...fill(lines[0])]))
  if (props?.[0]) cur = props[0](cur)
  for (let i = 1; i < lines.length; i++) {
    const isLast = i === lines.length - 1
    const body = fill(lines[i])
    const [a, b0] = host.split(cur, cur.runs, normalize([...body, ...(isLast ? right : [])]), !isLast)
    out.push(a)
    cur = props?.[i] ? props[i](b0) : b0
  }
  out.push(cur)
  host.replace(plan.pas, out, caret({ pa: shiftPa(plan.at.pa, out.length - 1), o: plen(fill(lines[lines.length - 1])) }), { label: 'paste', ...opts })
}

export function opInsert(host: RichHost, sel: Sel, text: string, opts?: ReplaceOpts) {
  const plan = planAt(host, sel)
  if (!plan) return
  const style = host.pendingStyle?.()
  host.clearPending?.()
  const p = plan.paras[0]
  const o = plan.at.o
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  if (lines.length === 1 || opts?.label === 'linebreak') {
    const runs = insertText(p.runs, o, text, style, host.defaultRun?.(p))
    host.replace(plan.pas, [host.withRuns(p, runs)], caret({ pa: plan.at.pa, o: o + text.length }), { label: 'type', ...opts })
    return
  }
  const base = (style ? { ...(runAt(p.runs, o) ?? host.defaultRun?.(p) ?? {}), ...style } : undefined) as RRun | undefined
  opInsertRuns(host, sel, lines.map((l) => (l ? [{ ...(base ?? {}), t: 'text', text: l } as RRun] : [])), opts)
}

export function opEnter(host: RichHost, sel: Sel) {
  const plan = collapsed(sel) ? (() => {
    const p = host.para(sel.a.pa)
    return p ? { pas: [sel.a.pa], paras: [p], at: sel.a } : null
  })() : planDelete(host, sel)
  if (!plan) return
  const p = plan.paras[0]
  const [l, r] = splitRuns(p.runs, plan.at.o)
  const [a, b] = host.split(p, l, r, plan.at.o >= plen(p.runs))
  host.replace(plan.pas, [a, b], caret({ pa: shiftPa(plan.at.pa, 1), o: 0 }), { label: 'enter' })
}

export function opBackspace(host: RichHost, sel: Sel, word = false) {
  if (!collapsed(sel)) return opDelete(host, sel)
  const { pa, o } = sel.a
  const p = host.para(pa)
  if (!p) return
  if (o > 0) {
    const text = runsText(p.runs)
    let from = prevBoundary(text, o)
    if (word) {
      const m = /(\S+\s*|\s+)$/.exec(text.slice(0, o))
      if (m) from = o - m[0].length
    }
    host.replace([pa], [host.withRuns(p, deleteRange(p.runs, from, o))], caret({ pa, o: from }), { label: 'delete' })
    return
  }
  if (host.backspaceAtStart?.(pa, p)) return
  const prev = host.prev(pa)
  const pp = prev ? host.para(prev) : undefined
  if (!prev || !pp) return
  const merged = host.join(pp, p, normalize([...pp.runs, ...p.runs]))
  host.replace([prev, pa], [merged], caret({ pa: prev, o: plen(pp.runs) }), { label: 'merge' })
}

export function opDeleteForward(host: RichHost, sel: Sel, word = false) {
  if (!collapsed(sel)) return opDelete(host, sel)
  const { pa, o } = sel.a
  const p = host.para(pa)
  if (!p) return
  const len = plen(p.runs)
  if (o < len) {
    const text = runsText(p.runs)
    let to = nextBoundary(text, o)
    if (word) {
      const m = /^(\s*\S+|\s+)/.exec(text.slice(o))
      if (m) to = o + m[0].length
    }
    host.replace([pa], [host.withRuns(p, deleteRange(p.runs, o, to))], caret({ pa, o }), { label: 'delete' })
    return
  }
  const next = host.next(pa)
  const np = next ? host.para(next) : undefined
  if (!next || !np) return
  const merged = host.join(p, np, normalize([...p.runs, ...np.runs]))
  host.replace([pa, next], [merged], caret({ pa, o }), { label: 'merge' })
}

// ---------------------------------------------------------------- DOM mapping

function runSpan(n: Node | null, stop: Element): HTMLElement | null {
  const el = n && (n.nodeType === 1 ? (n as Element) : n.parentElement)
  const s = el?.closest('[data-o]') as HTMLElement | null
  return s && stop.contains(s) ? s : null
}

function spanEnd(s: HTMLElement): number {
  const o = Number(s.dataset.o)
  if (s.hasAttribute('data-obj')) return o + 1
  if (s.hasAttribute('data-empty')) return o
  return o + (s.textContent?.length ?? 0)
}

export function posFromDom(root: HTMLElement, node: Node, offset: number): Pos | null {
  const start = node.nodeType === 1 ? (node as Element) : node.parentElement
  const pel = start?.closest('[data-pa]') as HTMLElement | null
  if (!pel || !root.contains(pel)) return null
  const pa = pel.dataset.pa!
  if (!runSpan(node, pel)) {
    // boundary between runs: end of the last run span before the point
    const r = document.createRange()
    r.setStart(node, offset)
    r.collapse(true)
    let o = 0
    for (const sp of Array.from(pel.querySelectorAll<HTMLElement>('[data-o]'))) {
      if (r.comparePoint(sp, sp.childNodes.length) < 0) o = spanEnd(sp)
      else break
    }
    return { pa, o }
  }
  const span = runSpan(node, pel)!
  const base = Number(span.dataset.o)
  if (span.hasAttribute('data-empty')) return { pa, o: base }
  if (span.hasAttribute('data-obj')) return { pa, o: offset > 0 || node !== span ? base + 1 : base }
  if (node.nodeType === 3) {
    let o = 0
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (t === node) return { pa, o: base + o + Math.min(offset, (t.textContent ?? '').length) }
      o += t.textContent?.length ?? 0
    }
    return { pa, o: base + o }
  }
  // offset is a child index inside the span
  let o = 0
  for (let i = 0; i < Math.min(offset, span.childNodes.length); i++) o += span.childNodes[i].textContent?.length ?? 0
  return { pa, o: base + o }
}

export function domFromPos(root: HTMLElement, pos: Pos): [Node, number] | null {
  const pel = root.querySelector<HTMLElement>(`[data-pa="${pos.pa}"]`)
  if (!pel) return null
  const spans = Array.from(pel.querySelectorAll<HTMLElement>('[data-o]'))
  if (!spans.length) return [pel, pel.childNodes.length]
  let pick: HTMLElement | undefined
  for (const s of spans) {
    const o = Number(s.dataset.o)
    const end = spanEnd(s)
    if (pos.o >= o && pos.o <= end) {
      pick = s
      // prefer the left run at boundaries unless it is an object
      if (pos.o < end || !s.hasAttribute('data-obj')) break
    }
  }
  pick ??= spans[spans.length - 1]
  const o = Number(pick.dataset.o)
  if (pick.hasAttribute('data-obj') || pick.hasAttribute('data-empty')) {
    const parent = pick.parentNode!
    const idx = Array.prototype.indexOf.call(parent.childNodes, pick)
    if (pick.hasAttribute('data-empty')) {
      const t = pick.firstChild
      return t ? [t, 0] : [parent, idx]
    }
    return [parent, pos.o > o ? idx + 1 : idx]
  }
  let rem = Math.max(0, pos.o - o)
  const walker = document.createTreeWalker(pick, NodeFilter.SHOW_TEXT)
  let last: Node | null = null
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const n = t.textContent?.length ?? 0
    if (rem <= n) return [t, rem]
    rem -= n
    last = t
  }
  return last ? [last, last.textContent?.length ?? 0] : [pick, 0]
}

/** Selection object that can see into the shadow root containing `node` (web component embeds). */
export function getSel(node: Node): Selection | null {
  const rn = node.getRootNode() as (ShadowRoot & { getSelection?: () => Selection | null }) | Document
  if (typeof ShadowRoot !== 'undefined' && rn instanceof ShadowRoot && typeof rn.getSelection === 'function') return rn.getSelection()
  return (node.ownerDocument ?? document).getSelection()
}

interface SelPoints {
  anchorNode: Node | null
  anchorOffset: number
  focusNode: Node | null
  focusOffset: number
}

function selPoints(root: HTMLElement): SelPoints | null {
  const rn = root.getRootNode()
  const s = getSel(root)
  if (!s) return null
  if (typeof ShadowRoot !== 'undefined' && rn instanceof ShadowRoot && s.anchorNode && !root.contains(s.anchorNode)) {
    // standard path for shadow trees (Safari / Firefox / new Chrome)
    const gc = (s as Selection & { getComposedRanges?: (o: { shadowRoots: ShadowRoot[] }) => StaticRange[] }).getComposedRanges
    const r = gc?.call(s, { shadowRoots: [rn] })[0]
    if (r) return { anchorNode: r.startContainer, anchorOffset: r.startOffset, focusNode: r.endContainer, focusOffset: r.endOffset }
  }
  return s
}

// ---------------------------------------------------------------- controller

export class RichInput {
  root: HTMLElement | null = null
  private composing: Sel | null = null
  private justComposed = ''
  private raf = 0
  lastSel: Sel | null = null
  /** select all: the model selection covers every paragraph, the DOM one only what is rendered */
  private override: { model: Sel; dom: Sel } | null = null

  constructor(private host: RichHost) {}

  attach(root: HTMLElement) {
    if (this.root === root) return
    this.detach()
    this.root = root
    root.addEventListener('beforeinput', this.onBeforeInput)
    root.addEventListener('compositionstart', this.onCompStart)
    root.addEventListener('compositionend', this.onCompEnd)
    root.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('selectionchange', this.onSelChange)
  }

  detach() {
    const r = this.root
    if (!r) return
    r.removeEventListener('beforeinput', this.onBeforeInput)
    r.removeEventListener('compositionstart', this.onCompStart)
    r.removeEventListener('compositionend', this.onCompEnd)
    r.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('selectionchange', this.onSelChange)
    cancelAnimationFrame(this.raf)
    this.root = null
    this.override = null
  }

  get isComposing() {
    return !!this.composing
  }

  readSel(): Sel | null {
    const root = this.root
    const s = root ? selPoints(root) : null
    if (!root || !s || !s.anchorNode || !s.focusNode) return null
    if (!root.contains(s.anchorNode) || !root.contains(s.focusNode)) return null
    const a = posFromDom(root, s.anchorNode, s.anchorOffset)
    const f = posFromDom(root, s.focusNode, s.focusOffset)
    return a && f ? { a, f } : null
  }

  /** current selection, falling back to the last known one (e.g. after focusing a toolbar control) */
  sel(): Sel | null {
    return this.override?.model ?? this.readSel() ?? this.lastSel
  }

  /**
   * Selects the whole document. The browser's own select-all is useless here: the editing host holds
   * non-editable parts (headers, read-only paragraphs) and Chromium empties a selection that crosses them;
   * pages are also virtualized, so the DOM only ever holds a part of the document.
   */
  selectAll(): boolean {
    const root = this.root
    const all = this.host.all?.()
    if (!root || !all) return false
    const paras = Array.from(root.querySelectorAll<HTMLElement>('[data-pa]')).filter((el) => {
      const ro = el.closest('[contenteditable="false"]')
      return this.host.para(el.dataset.pa!) && !(ro && root.contains(ro))
    })
    const first = paras[0]
    const last = paras[paras.length - 1]
    const dom: Sel = first && last ? { a: { pa: first.dataset.pa!, o: 0 }, f: { pa: last.dataset.pa!, o: plen(this.host.para(last.dataset.pa!)!.runs) } } : all
    this.restore(dom)
    this.override = { model: all, dom: this.readSel() ?? dom }
    this.host.onSelection?.(all)
    return true
  }

  /** Applies a model selection to the DOM; false when its paragraph isn't rendered. */
  restore(sel: Sel | null, focus = true): boolean {
    const root = this.root
    if (!root || !sel) return false
    this.override = null
    const a = domFromPos(root, sel.a)
    const f = domFromPos(root, sel.f)
    if (!a || !f) {
      this.lastSel = sel
      return false
    }
    const active = (root.getRootNode() as Document | ShadowRoot).activeElement
    if (focus && active !== root && !root.contains(active)) root.focus({ preventScroll: true })
    const s = getSel(root)
    try {
      s?.setBaseAndExtent(a[0], a[1], f[0], f[1])
    } catch {
      /* node vanished */
    }
    this.lastSel = sel
    return true
  }

  private rangeSel(r: StaticRange | Range | undefined): Sel | null {
    if (!r || !this.root) return null
    const a = posFromDom(this.root, r.startContainer, r.startOffset)
    const f = posFromDom(this.root, r.endContainer, r.endOffset)
    return a && f ? { a, f } : null
  }

  private onBeforeInput = (e: InputEvent) => {
    const t = e.inputType
    if (this.composing || t === 'insertCompositionText') return
    if (t === 'deleteCompositionText' || t === 'insertFromComposition') {
      if (e.cancelable) e.preventDefault()
      if (t === 'insertFromComposition' && e.data && e.data !== this.justComposed) {
        const sel = this.sel()
        if (sel) opInsert(this.host, sel, e.data, { remount: true })
      }
      this.justComposed = ''
      return
    }
    e.preventDefault()
    const target = this.rangeSel(e.getTargetRanges?.()[0])
    const sel = this.sel()
    if (!sel) return
    const h = this.host
    switch (t) {
      case 'insertText':
      case 'insertReplacementText': {
        const text = e.data ?? e.dataTransfer?.getData('text/plain') ?? ''
        opInsert(h, t === 'insertReplacementText' && target ? target : sel, text)
        break
      }
      case 'insertParagraph':
        opEnter(h, sel)
        break
      case 'insertLineBreak':
        opInsert(h, sel, '\n', { label: 'linebreak' })
        break
      case 'insertFromPaste':
      case 'insertFromDrop':
      case 'insertFromYank': {
        if (e.dataTransfer && h.pasteRich?.(t === 'insertFromDrop' && target ? target : sel, e.dataTransfer)) break
        const text = e.dataTransfer?.getData('text/plain') ?? e.data ?? ''
        if (text) opInsert(h, sel, text)
        break
      }
      case 'deleteContentBackward':
        opBackspace(h, sel)
        break
      case 'deleteWordBackward':
        opBackspace(h, sel, true)
        break
      case 'deleteContentForward':
        opDeleteForward(h, sel)
        break
      case 'deleteWordForward':
        opDeleteForward(h, sel, true)
        break
      case 'deleteSoftLineBackward':
      case 'deleteHardLineBackward':
      case 'deleteSoftLineForward':
      case 'deleteHardLineForward':
      case 'deleteByCut':
      case 'deleteByDrag':
      case 'deleteContent':
      case 'deleteEntireSoftLine':
        if (!collapsed(sel)) opDelete(h, sel)
        else if (target && !collapsed(target)) opDelete(h, target)
        break
      case 'historyUndo':
        h.undo()
        break
      case 'historyRedo':
        h.redo()
        break
      case 'formatBold':
        h.toggle?.('b')
        break
      case 'formatItalic':
        h.toggle?.('i')
        break
      case 'formatUnderline':
        h.toggle?.('u')
        break
    }
  }

  private onCompStart = () => {
    this.composing = this.sel()
  }

  private onCompEnd = (e: CompositionEvent) => {
    const sel = this.composing
    this.composing = null
    if (!sel) return
    this.justComposed = e.data ?? ''
    // always rebuild the paragraph: the IME mutated its DOM
    if (e.data) opInsert(this.host, sel, e.data, { remount: true })
    else opInsert(this.host, sel, '', { remount: true })
    setTimeout(() => (this.justComposed = ''), 0)
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing || this.composing) return
    const mod = e.metaKey || e.ctrlKey
    const k = e.key.toLowerCase()
    if (this.host.shortcut?.(e)) {
      e.preventDefault()
      return
    }
    if (mod && !e.altKey) {
      if (k === 'z') {
        e.preventDefault()
        if (e.shiftKey) this.host.redo()
        else this.host.undo()
        return
      }
      if (k === 'y') {
        e.preventDefault()
        this.host.redo()
        return
      }
      if (k === 'a' && !e.shiftKey) {
        if (this.selectAll()) e.preventDefault()
        return
      }
      if (k === 'b' || k === 'i' || k === 'u') {
        e.preventDefault()
        this.host.toggle?.(k)
        return
      }
    }
    if (e.key === 'Tab' && !mod) {
      e.preventDefault()
      const sel = this.sel()
      if (!sel) return
      if (!this.host.tab?.(sel, e.shiftKey) && !e.shiftKey) opInsert(this.host, sel, '\t')
    }
  }

  private onSelChange = () => {
    if (this.raf) return
    this.raf = requestAnimationFrame(() => {
      this.raf = 0
      const s = this.readSel()
      const ov = this.override
      // select all stays until the selection moves somewhere else (losing it to a re-render keeps it, like lastSel)
      if (ov && s && !sameSel(s, ov.dom)) this.override = null
      else if (ov) {
        this.host.onSelection?.(ov.model)
        return
      }
      if (s) this.lastSel = s
      this.host.onSelection?.(s)
    })
  }
}
