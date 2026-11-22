/**
 * Client side of the collaboration protocol (format-agnostic).
 *
 * Model: the hub totally orders batches of operations. Every client applies
 * the log in that order, each batch first transformed (deterministically)
 * against the concurrent batches sequenced before it — so all clients reach
 * the same state. Local operations are applied optimistically; when a remote
 * batch arrives while local ones are still unconfirmed, the client rebases:
 * reverts its pending ops, applies the remote batch, then replays the pending
 * ops transformed against it. Convergence therefore only needs `transform` and
 * `apply` to be deterministic (not the classic OT TP1/TP2 properties).
 *
 * Operations an adapter flags as `pessimistic` (structural ones that are hard
 * to rebase, like deleting a sheet) are not applied locally until the hub has
 * sequenced them.
 */
import type { Batch, Entry, HubMsg, PeerInfo, UserInfo } from './protocol'
import type { Transport } from './transport'

export interface ApplyResult {
  /** whatever `revert` needs to undo the op exactly (local ops only) */
  undo?: unknown
  /** returned to the caller of `submit` */
  result?: unknown
}

export type ApplyKind = 'local' | 'replay' | 'remote'

export interface Adapter<Op> {
  /** resolves when the document can take operations (e.g. fully loaded) */
  ready?(): Promise<void>
  /**
   * `op` adjusted to apply after `prior`, a concurrent op of another site that was sequenced first.
   * Must be deterministic; return `op` itself when unaffected, null to drop it.
   */
  transform(op: Op, prior: Op): Op | null
  /**
   * Async work before ops get applied (fetching resources, waiting for IME composition to end…),
   * so that `revert` / `apply` during a rebase can run without yielding to user input.
   */
  prepare?(ops: Op[]): Promise<void> | void
  /** applies `op` to the local document */
  apply(op: Op, kind: ApplyKind): Promise<ApplyResult> | ApplyResult
  /** exactly undoes a pending local op (given its `undo` token) */
  revert(undo: unknown): Promise<void> | void
  /** op must be sequenced by the hub before it is applied */
  pessimistic?(op: Op): boolean
  /** whether remote ops interact with pending local ones (default: true → rebase) */
  conflicts?(pending: Op[], remote: Op[]): boolean
  /** after a remote batch / rebase was applied (views refresh here) */
  settled?(): void
}

export type CollabStatus = 'connecting' | 'syncing' | 'live' | 'offline' | 'error'

interface Item<Op> {
  op: Op | null
  applied: boolean
  undo?: unknown
  /** pending `submit` of a pessimistic op */
  done?: (v: unknown) => void
}

export interface SessionEvents {
  status: CollabStatus
  peers: PeerInfo[]
  /** remote changes were applied */
  change: void
  error: Error
}

export interface SessionOptions {
  room: string
  user: UserInfo
  /** canonical batches kept to transform late batches (default 5000) */
  logWindow?: number
  /** sequence number the opened file already contains: a snapshot (default 0, the original upload) */
  base?: number
}

const notNull = <T>(x: T | null): x is T => x !== null

export class CollabSession<Op = unknown> {
  site = 0
  /** last applied sequence number */
  rev = 0
  status: CollabStatus = 'connecting'
  error?: string
  readonly peers = new Map<number, PeerInfo>()
  private log: Entry<Op>[] = []
  private inflight: { id: string; base: number; items: Item<Op>[] } | null = null
  private buffer: Item<Op>[] = []
  private queue: Promise<void>
  private joined = false
  private online = false
  private counter = 0
  private listeners = new Map<keyof SessionEvents, Set<(d: never) => void>>()
  private presence: unknown
  private presenceTimer?: ReturnType<typeof setTimeout>
  private presenceAt = 0
  private closed = false

  constructor(
    private transport: Transport,
    private adapter: Adapter<Op>,
    private opts: SessionOptions,
  ) {
    this.rev = opts.base ?? 0
    this.queue = Promise.resolve(adapter.ready?.()).catch((e) => this.fail((e as Error).message))
    transport.onMessage = (m) => this.enqueue(() => this.onMessage(m))
    transport.onStatus = (s) => {
      if (s === 'open') {
        this.online = true
        transport.send(
          this.joined
            ? { t: 'hello', room: opts.room, user: opts.user, have: this.rev, site: this.site }
            : { t: 'hello', room: opts.room, user: opts.user, base: opts.base || undefined },
        )
      } else if (s === 'closed') {
        this.online = false
        this.peers.clear()
        this.emit('peers', [])
        if (this.status !== 'error') this.setStatus(this.joined ? 'offline' : 'connecting')
      }
    }
    transport.connect()
  }

  // ---------------------------------------------------------------- public API

  /** local ops not yet confirmed by the hub */
  get pending(): number {
    return (this.inflight?.items.length ?? 0) + this.buffer.length
  }

  /** a unique id for ops created by this client */
  nextId(): string {
    return `${this.site}.${++this.counter}.${Math.random().toString(36).slice(2, 6)}`
  }

  /** applies a local op (through the adapter) and shares it; resolves with the adapter's result */
  submit(op: Op): Promise<unknown> {
    return new Promise((resolve, reject) =>
      this.enqueue(async () => {
        if (this.status === 'error') return reject(new Error(this.error ?? 'Collaboration stopped'))
        if (this.adapter.pessimistic?.(op)) {
          this.buffer.push({ op, applied: false, done: resolve })
        } else {
          let res: ApplyResult
          try {
            res = await this.adapter.apply(op, 'local')
          } catch (e) {
            return reject(e)
          }
          this.buffer.push({ op, applied: true, undo: res.undo })
          resolve(res.result)
        }
        this.flush()
      }),
    )
  }

  /** registers a local op the caller already applied (synchronously); `undo` reverts it */
  push(op: Op, undo: unknown) {
    this.buffer.push({ op, applied: true, undo })
    this.enqueue(async () => this.flush())
  }

  setPresence(data: unknown) {
    this.presence = data
    if (this.presenceTimer) return
    const wait = Math.max(0, 80 - (Date.now() - this.presenceAt))
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = undefined
      this.presenceAt = Date.now()
      if (this.online && this.joined) this.transport.send({ t: 'presence', data: this.presence })
    }, wait)
  }

  on<K extends keyof SessionEvents>(event: K, fn: (d: SessionEvents[K]) => void): () => void {
    let set = this.listeners.get(event)
    if (!set) this.listeners.set(event, (set = new Set()))
    set.add(fn as (d: never) => void)
    return () => set!.delete(fn as (d: never) => void)
  }

  /** the last `limit` batches as applied here (the context of a snapshot taken at `rev`) */
  context(limit = this.opts.logWindow ?? 5000): Entry<Op>[] {
    return limit > 0 ? this.log.slice(-limit) : []
  }

  /** resolves once everything queued so far was processed */
  idle(): Promise<void> {
    return this.queue
  }

  close() {
    this.closed = true
    clearTimeout(this.presenceTimer)
    this.transport.close()
    this.listeners.clear()
  }

  // ---------------------------------------------------------------- internals

  private emit<K extends keyof SessionEvents>(event: K, data: SessionEvents[K]) {
    for (const fn of this.listeners.get(event) ?? []) (fn as (d: SessionEvents[K]) => void)(data)
  }

  private setStatus(s: CollabStatus) {
    if (this.status === s) return
    this.status = s
    this.emit('status', s)
  }

  private fail(message: string) {
    this.error = message
    this.setStatus('error')
    this.emit('error', new Error(message))
  }

  private enqueue(fn: () => Promise<void> | void) {
    this.queue = this.queue.then(fn).catch((e) => {
      console.error('[office collab]', e)
      this.emit('error', e as Error)
    })
  }

  private async onMessage(m: HubMsg) {
    if (this.closed || this.status === 'error') return
    switch (m.t) {
      case 'welcome': {
        if (m.reset) return this.fail('The shared document history was reset; reopen the document')
        const first = !this.joined
        this.site = m.site
        this.joined = true
        if (first) {
          this.log = (m.ctx ?? []) as Entry<Op>[]
          this.setStatus('syncing')
        }
        this.peers.clear()
        for (const p of m.peers) this.peers.set(p.site, p)
        this.emit('peers', [...this.peers.values()])
        for (const b of m.log) await this.onBatch(b)
        if (this.inflight) {
          // not sequenced before the connection dropped: its ops were rebased onto everything up to
          // `rev` meanwhile, so that is their base now (the hub ignores it if the first send arrived)
          this.inflight.base = this.rev
          this.transport.send({ t: 'ops', id: this.inflight.id, base: this.rev, ops: this.inflight.items.map((i) => i.op).filter(notNull) })
        }
        this.flush()
        if (this.presence !== undefined) this.transport.send({ t: 'presence', data: this.presence })
        this.setStatus('live')
        return
      }
      case 'batch':
        return this.onBatch(m.b)
      case 'presence': {
        const p = this.peers.get(m.site)
        if (p) {
          this.peers.set(m.site, { ...p, presence: m.data })
          this.emit('peers', [...this.peers.values()])
        }
        return
      }
      case 'join':
        this.peers.set(m.peer.site, m.peer)
        this.emit('peers', [...this.peers.values()])
        return
      case 'leave':
        this.peers.delete(m.site)
        this.emit('peers', [...this.peers.values()])
        return
      case 'error':
        return this.fail(m.message)
    }
  }

  private async onBatch(b: Batch) {
    if (b.seq <= this.rev) return
    if (b.seq !== this.rev + 1) return this.fail(`Missed operations (${this.rev + 1}…${b.seq - 1})`)
    if (this.inflight && b.id === this.inflight.id) await this.ack(b)
    else {
      const ops = this.canonical(b)
      if (ops === null) return
      await this.remote(ops)
      this.log.push({ seq: b.seq, site: b.site, ops })
    }
    this.rev = b.seq
    const max = this.opts.logWindow ?? 5000
    if (this.log.length > max) this.log.splice(0, this.log.length - max)
    this.flush()
    this.adapter.settled?.()
    this.emit('change', undefined)
  }

  /** batch ops transformed against the concurrent batches sequenced before it */
  private canonical(b: Batch): Op[] | null {
    let ops = (b.ops as Op[]).map((o) => o as Op | null)
    if (b.base < b.seq - 1 && (this.log[0]?.seq ?? Infinity) > b.base + 1 && this.rev > b.base) {
      this.fail('Operation is too old to merge; reopen the document')
      return null
    }
    for (const e of this.log) {
      if (e.seq <= b.base || e.site === b.site) continue
      for (const p of e.ops) ops = ops.map((o) => (o === null ? null : this.adapter.transform(o, p)))
    }
    return ops.filter(notNull)
  }

  private async revertAll(items: Item<Op>[]) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]
      if (!it.applied) continue
      try {
        await this.adapter.revert(it.undo)
      } catch (e) {
        console.error('[office collab] revert failed', e)
      }
      it.applied = false
      it.undo = undefined
    }
  }

  /** `answers`: where the answer to the caller of a pessimistic op goes, for `ack` to give it at the right time */
  private async replay(it: Item<Op>, kind: ApplyKind, answers?: (() => void)[]) {
    if (!it.op) return
    try {
      const res = await this.adapter.apply(it.op, kind)
      it.undo = res.undo
      it.applied = true
      if (it.done) {
        const done = it.done
        it.done = undefined
        if (answers) answers.push(() => done(res.result))
        else done(res.result)
      }
    } catch (e) {
      // keep the op in the batch: other clients run it too and fail the same way
      console.error('[office collab] replay failed', e)
    }
  }

  /**
   * The adapter's async work before `ops` are applied. A failure doesn't stop the session (a batch that can't be
   * processed would block the room for good: everyone replays it): `apply` then fails for the op concerned and only
   * that op is lost.
   */
  private async prepare(ops: Op[]) {
    try {
      await this.adapter.prepare?.(ops)
    } catch (e) {
      console.error('[office collab] prepare failed', e)
    }
  }

  private async remote(ops: Op[]) {
    await this.prepare(ops)
    const pending = [...(this.inflight?.items ?? []), ...this.buffer]
    if (!pending.length) {
      for (const op of ops) await this.applyRemote(op)
      return
    }
    const next = pending.map((it) => {
      let o = it.op
      for (const r of ops) if (o !== null) o = this.adapter.transform(o, r)
      return o
    })
    const applied = pending.filter((it) => it.applied && it.op).map((it) => it.op as Op)
    const rebase = next.some((o, i) => o !== pending[i].op) || (applied.length > 0 && (this.adapter.conflicts?.(applied, ops) ?? true))
    if (rebase) await this.revertAll(pending)
    for (const op of ops) await this.applyRemote(op)
    pending.forEach((it, i) => (it.op = next[i]))
    if (!rebase) return
    for (const it of pending) {
      if (!it.op || (this.adapter.pessimistic?.(it.op) && !it.applied && it.done)) continue
      await this.replay(it, 'replay')
    }
  }

  private async applyRemote(op: Op) {
    try {
      await this.adapter.apply(op, 'remote')
    } catch (e) {
      console.error('[office collab] remote op failed', e, op)
      this.emit('error', e as Error)
    }
  }

  /** our in-flight batch was sequenced */
  private async ack(b: Batch) {
    const items = this.inflight!.items
    this.inflight = null
    const hole = items.findIndex((it) => it.op && !it.applied)
    const answers: (() => void)[] = []
    if (hole >= 0) {
      await this.prepare(items.slice(hole).filter((it) => it.op && !it.applied).map((it) => it.op as Op))
      // pessimistic ops run now, in order: later local ops are replayed after them (those made while `prepare` waited too)
      const tail = [...items.slice(hole), ...this.buffer]
      await this.revertAll(tail)
      for (const it of tail) {
        const waiting = !items.includes(it) && it.op && this.adapter.pessimistic?.(it.op) && it.done
        if (!waiting) await this.replay(it, it.done ? 'local' : 'replay', answers)
      }
    }
    // their callers go on only now, with the local ops made meanwhile back in place: what a caller does next (apply
    // the style the op added…) is ordered after those ops, so it must not be built on the document without them
    for (const answer of answers) answer()
    for (const it of items) if (it.done) it.done(null)
    this.log.push({ seq: b.seq, site: b.site, ops: items.map((i) => i.op).filter(notNull) })
  }

  private flush() {
    if (this.inflight || !this.buffer.length || !this.online || !this.joined || this.status === 'error') return
    const items = this.buffer
    this.buffer = []
    const id = `${this.site}-${Date.now().toString(36)}-${++this.counter}`
    this.inflight = { id, base: this.rev, items }
    this.transport.send({ t: 'ops', id, base: this.rev, ops: items.map((i) => i.op).filter(notNull) })
  }
}
