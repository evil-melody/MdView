/** Worker side of PPTX collaboration: operations recorded as slide XML snapshots (exact rollback, shared undo). */
import { addSlideImage, shapeOps, slideOp } from '../core/pptx/edit'
import type { PptxPresentation } from '../core/pptx/parser'
import type { PresentationMeta, ShapeOp, SlideModel, SlideOp } from '../core/pptx/types'
import type { POp } from './pptx-ops'

interface Snap {
  xml: string
  gen: [string, unknown][]
}

interface Rec {
  path: string
  before: Snap
  after: Snap
  op: string
}

export interface PptxCollabResult {
  /** slide index + its new model */
  slide?: number
  model?: SlideModel
  /** slide list changed */
  meta?: PresentationMeta
  /** image relationship id (image ops) */
  rid?: string
}

const MAX_RECS = 300

export class PptxCollabWorker {
  private recs = new Map<number, Rec>()
  private byOp = new Map<string, number>()
  private seq = 0
  /** image key → relationship id, per slide */
  private images = new Map<string, string>()

  constructor(private pres: PptxPresentation) {}

  /** text templates of every slide, taken in the shared state (before any op / right after slide-list changes) */
  private async originals() {
    for (const s of this.pres.meta.slides) await this.pres.keepOriginal(s.path)
  }

  private ready?: Promise<void>

  private index(path: string): number {
    return this.pres.meta.slides.findIndex((s) => s.path === path)
  }

  private get genMaps(): Map<string, unknown> {
    return (this.pres as unknown as { genMaps: Map<string, unknown> }).genMaps
  }

  private async snap(path: string): Promise<Snap> {
    return { xml: await this.pres.pkg.text(path), gen: [...this.genMaps].filter(([k]) => k.startsWith(path + '#')) }
  }

  private restore(path: string, s: Snap) {
    this.pres.pkg.setPart(path, s.xml)
    for (const k of [...this.genMaps.keys()]) if (k.startsWith(path + '#')) this.genMaps.delete(k)
    for (const [k, v] of s.gen) this.genMaps.set(k, v)
    this.pres.touched = true
  }

  private async model(path: string): Promise<PptxCollabResult> {
    const i = this.index(path)
    return i < 0 ? {} : { slide: i, model: await this.pres.slide(i) }
  }

  async apply(op: POp): Promise<{ res: PptxCollabResult; rec: number | null }> {
    const pres = this.pres
    await (this.ready ??= this.originals())
    if (op.t === 'image') {
      const i = this.index(op.slide)
      if (i < 0) return { res: {}, rec: null }
      let rid = this.images.get(op.key)
      if (!rid) {
        rid = await addSlideImage(pres, i, op.bytes, op.ext)
        this.images.set(op.key, rid)
      }
      return { res: { rid }, rec: null }
    }
    if (op.t === 'slides') {
      const o = op.op
      const at = (p: string) => this.index(p)
      let s: SlideOp | null = null
      if (o.op === 'add') s = { op: 'add', after: o.after ? at(o.after) : -1, layout: o.layout }
      else if (at(o.path) >= 0) {
        if (o.op === 'duplicate') s = { op: 'duplicate', index: at(o.path) }
        else if (o.op === 'delete') s = pres.meta.slides.length > 1 ? { op: 'delete', index: at(o.path) } : null
        else if (o.op === 'move') s = { op: 'move', from: at(o.path), to: Math.max(0, Math.min(o.to, pres.meta.slides.length - 1)) }
        else s = { op: 'hide', index: at(o.path), hidden: o.hidden }
      }
      if (!s) return { res: {}, rec: null }
      const meta = await slideOp(pres, s)
      await this.originals()
      // slide parts and indexes changed: older records would restore stale slides
      this.recs.clear()
      this.byOp.clear()
      return { res: { meta: { ...meta, slides: meta.slides.map((x) => ({ ...x })) } }, rec: null }
    }
    // comments are set through the engine (main-thread adapter)
    if (op.t === 'comment') return { res: {}, rec: null }
    let path: string
    let target: Rec | undefined
    if (op.t === 'revert') {
      const id = this.byOp.get(op.target)
      target = id !== undefined ? this.recs.get(id) : undefined
      if (!target) return { res: {}, rec: null }
      path = target.path
    } else path = op.slide
    const i = this.index(path)
    if (i < 0) return { res: {}, rec: null }
    const before = await this.snap(path)
    if (op.t === 'text') {
      try {
        await pres.setText(i, op.sid, op.paras)
      } catch {
        // shape deleted by a collaborator: skipped everywhere alike
        return { res: {}, rec: null }
      }
    } else if (op.t === 'shapes') {
      const ops = op.ops.map((o) => {
        if (o.op !== 'insert' || !o.key) return o as ShapeOp
        const { key, ...rest } = o
        return { ...rest, rid: this.images.get(key) } as ShapeOp
      })
      await shapeOps(pres, i, ops)
    } else if (target) this.restore(path, op.which === 'prev' ? target.before : target.after)
    // shared undo replaces the view's own shape history
    pres.undoStack = []
    pres.redoStack = []
    const id = ++this.seq
    this.recs.set(id, { path, before, after: await this.snap(path), op: op.id })
    this.byOp.set(op.id, id)
    if (this.recs.size > MAX_RECS) {
      const [old, r] = this.recs.entries().next().value as [number, Rec]
      this.recs.delete(old)
      if (this.byOp.get(r.op) === old) this.byOp.delete(r.op)
    }
    return { res: await this.model(path), rec: id }
  }

  /** exactly undoes an applied operation (rebase) */
  async revert(id: number): Promise<PptxCollabResult> {
    const r = this.recs.get(id)
    if (!r) return {}
    this.recs.delete(id)
    if (this.byOp.get(r.op) === id) this.byOp.delete(r.op)
    this.restore(r.path, r.before)
    return this.model(r.path)
  }
}
