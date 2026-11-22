/**
 * Runtime-agnostic collaboration hub: one sequencer + op log per room.
 * Wire it to any socket server (see scripts/collab-server.ts for Bun):
 *
 *   const conn = hub.connect((msg) => socket.send(encode(msg)))
 *   socket.onmessage = (e) => conn.receive(decode(e.data))
 *   socket.onclose = () => conn.close()
 *
 * Snapshots (see `compact`) bound the history: register one with `hub.snapshot()` and new clients
 * open its file and only replay the batches after it, while the hub drops older batches.
 */
import { PEER_COLORS, type Batch, type ClientMsg, type Entry, type HubMsg, type PeerInfo, type Snapshot } from './protocol'

export interface RoomState {
  id: string
  seq: number
  /** every batch with seq > `start`, in order */
  log: Batch[]
  /** batches older than this were dropped (after a snapshot) */
  start: number
  ids: Set<string>
  peers: Map<number, { info: PeerInfo; send: (m: HubMsg) => void }>
  nextSite: number
  /** snapshots clients can join from: seq → context */
  snaps: Map<number, Entry[]>
}

/** A persisted room: its latest snapshot and the batches after it (and possibly some before). */
export interface RoomLog {
  log: Batch[]
  snapshot?: Snapshot & { sites?: number }
}

type Loaded = Batch[] | RoomLog | undefined

export interface HubOptions {
  /** called for every sequenced batch (persist it to rebuild rooms after a restart) */
  onBatch?: (room: string, batch: Batch) => void
  /** rebuilds a room (e.g. from storage) the first time it is used */
  loadLog?: (room: string) => Loaded | Promise<Loaded>
  /** called when the last peer left a room */
  onIdle?: (room: string) => void
  /** batches kept below the latest snapshot for clients reconnecting from older states (default 1000) */
  retain?: number
  /** most recent snapshots clients can still join from (default 3) */
  keep?: number
}

export interface HubConnection {
  receive(msg: ClientMsg): void
  close(): void
}

export class CollabHub {
  readonly rooms = new Map<string, RoomState>()
  private loading = new Map<string, Promise<RoomState>>()

  constructor(private opts: HubOptions = {}) {}

  /** the room, loaded through `loadLog` the first time */
  room(id: string): Promise<RoomState> {
    const r = this.rooms.get(id)
    if (r) return Promise.resolve(r)
    let p = this.loading.get(id)
    if (!p) {
      p = Promise.resolve(this.opts.loadLog?.(id)).then((loaded): RoomState | Promise<RoomState> => {
        // reset while loading: the loaded state is stale, load again
        if (this.loading.get(id) !== p) return this.room(id)
        const r = this.rooms.get(id) ?? createRoom(id, loaded)
        this.rooms.set(id, r)
        return r
      })
      p.finally(() => this.loading.get(id) === p && this.loading.delete(id)).catch(() => {})
      this.loading.set(id, p)
    }
    return p
  }

  /** forgets a room (its log and peers) — e.g. when a new base file is uploaded */
  reset(id: string) {
    const r = this.rooms.get(id)
    if (r) for (const p of r.peers.values()) p.send({ t: 'error', message: 'Room was reset' })
    this.rooms.delete(id)
    this.loading.delete(id)
  }

  /** drops an idle room from memory (it is loaded again on the next join); false while peers are connected */
  unload(id: string): boolean {
    const r = this.rooms.get(id)
    if (r?.peers.size) return false
    this.rooms.delete(id)
    return true
  }

  /**
   * Registers a snapshot of a loaded room (`compact` output, its file stored where clients can open
   * it): clients may join from it, and batches older than `retain` below it are dropped.
   * Returns false when the snapshot doesn't fit the room (e.g. it was reset meanwhile).
   */
  snapshot(id: string, snap: Snapshot): boolean {
    const r = this.rooms.get(id)
    if (!r || snap.seq > r.seq || snap.seq < r.start) return false
    r.snaps.set(snap.seq, snap.ctx)
    const seqs = [...r.snaps.keys()].sort((a, b) => a - b)
    for (const s of seqs.splice(0, Math.max(0, seqs.length - (this.opts.keep ?? 3)))) r.snaps.delete(s)
    const cut = Math.min(seqs[0], seqs[seqs.length - 1] - (this.opts.retain ?? 1000))
    if (cut > r.start) {
      let n = 0
      while (n < r.log.length && r.log[n].seq <= cut) r.ids.delete(r.log[n++].id)
      r.log.splice(0, n)
      r.start = cut
    }
    return true
  }

  connect(send: (m: HubMsg) => void): HubConnection {
    let room: RoomState | undefined
    let site = 0
    let closed = false
    /** messages received while the room loads */
    let queued: ClientMsg[] | null = null
    const broadcast = (m: HubMsg, except?: number) => {
      if (!room) return
      for (const [s, p] of room.peers) if (s !== except) p.send(m)
    }
    const join = (r: RoomState, msg: Extract<ClientMsg, { t: 'hello' }>) => {
      room = r
      site = msg.site && msg.site < r.nextSite && !r.peers.has(msg.site) ? msg.site : r.nextSite++
      const used = new Set([...r.peers.values()].map((p) => p.info.color))
      const color = msg.user.color || PEER_COLORS.find((c) => !used.has(c)) || PEER_COLORS[site % PEER_COLORS.length]
      const info: PeerInfo = { ...msg.user, site, color }
      let from: number
      let ctx: Entry[] | undefined
      let reset: boolean
      if (msg.have !== undefined) {
        // reconnect: everything after `have` is needed
        from = msg.have
        reset = from > r.seq || from < r.start
      } else {
        // first join from the original upload (0) or a snapshot
        from = msg.base ?? 0
        ctx = from === 0 ? undefined : r.snaps.get(from)
        reset = from > r.seq || from < r.start || (from > 0 && !ctx)
      }
      send({
        t: 'welcome', site, seq: r.seq, from, reset,
        log: reset ? [] : r.log.filter((b) => b.seq > from),
        peers: [...r.peers.values()].map((p) => p.info),
        ...(ctx && !reset ? { ctx } : {}),
      })
      r.peers.set(site, { info, send })
      broadcast({ t: 'join', peer: info }, site)
    }
    const receive = (msg: ClientMsg) => {
      if (closed) return
      if (queued) return void queued.push(msg)
      if (msg.t === 'hello') {
        if (room) return
        queued = []
        this.room(msg.room).then(
          (r) => {
            const rest = queued!
            queued = null
            if (closed) return
            join(r, msg)
            rest.forEach(receive)
          },
          (e) => {
            queued = null
            send({ t: 'error', message: `Room failed to load: ${(e as Error).message}` })
          },
        )
        return
      }
      if (!room) return send({ t: 'error', message: 'Not joined' })
      if (msg.t === 'ops') {
        if (room.ids.has(msg.id)) return
        const p = room.peers.get(site)
        const b: Batch = {
          seq: ++room.seq, site, base: Math.min(msg.base, room.seq - 1), id: msg.id, ops: msg.ops,
          time: Date.now(), user: p?.info.id ?? p?.info.name,
        }
        room.log.push(b)
        room.ids.add(b.id)
        this.opts.onBatch?.(room.id, b)
        broadcast({ t: 'batch', b })
      } else if (msg.t === 'presence') {
        const p = room.peers.get(site)
        if (p) p.info.presence = msg.data
        broadcast({ t: 'presence', site, data: msg.data }, site)
      }
    }
    return {
      receive,
      close: () => {
        closed = true
        if (!room || !room.peers.has(site)) return
        room.peers.delete(site)
        broadcast({ t: 'leave', site })
        if (!room.peers.size) this.opts.onIdle?.(room.id)
      },
    }
  }
}

function createRoom(id: string, loaded: Loaded): RoomState {
  const rl: RoomLog = Array.isArray(loaded) ? { log: loaded } : loaded ?? { log: [] }
  const snap = rl.snapshot
  let log = [...rl.log].sort((a, b) => a.seq - b.seq)
  // keep the consecutive run that reaches the end
  for (let i = log.length - 1; i > 0; i--) {
    if (log[i - 1].seq !== log[i].seq - 1) {
      log = log.slice(i)
      break
    }
  }
  let seq = log.length ? log[log.length - 1].seq : 0
  let start = log.length ? log[0].seq - 1 : 0
  if (snap && (snap.seq > seq || snap.seq < start)) {
    // batches after the snapshot were lost (or don't connect to it): continue from the snapshot
    seq = start = snap.seq
    log = []
  }
  let nextSite = Math.max(1, snap?.sites ?? 1)
  for (const b of log) nextSite = Math.max(nextSite, b.site + 1)
  for (const e of snap?.ctx ?? []) nextSite = Math.max(nextSite, e.site + 1)
  return {
    id, seq, log, start, nextSite,
    ids: new Set(log.map((b) => b.id)),
    peers: new Map(),
    snaps: new Map(snap ? [[snap.seq, snap.ctx]] : []),
  }
}
