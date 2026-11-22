import { decode, encode } from './codec'
import type { CollabHub, HubConnection } from './hub'
import type { ClientMsg, HubMsg } from './protocol'

export type TransportStatus = 'connecting' | 'open' | 'closed'

/** Message pipe to a hub. Implement it to plug collaboration into your own backend. */
export interface Transport {
  connect(): void
  send(msg: ClientMsg): void
  close(): void
  onMessage?: (msg: HubMsg) => void
  onStatus?: (s: TransportStatus) => void
}

/** WebSocket transport with automatic reconnection (exponential backoff). */
export class WebSocketTransport implements Transport {
  onMessage?: (msg: HubMsg) => void
  onStatus?: (s: TransportStatus) => void
  private ws?: WebSocket
  private closed = false
  private retry = 0
  private timer?: ReturnType<typeof setTimeout>

  constructor(
    private url: string,
    private protocols?: string | string[],
  ) {}

  connect() {
    this.closed = false
    this.open()
  }

  private open() {
    if (this.closed) return
    this.onStatus?.('connecting')
    const ws = (this.ws = new WebSocket(this.url, this.protocols))
    ws.onopen = () => {
      this.retry = 0
      this.onStatus?.('open')
    }
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') this.onMessage?.(decode<HubMsg>(e.data))
    }
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = undefined
      this.onStatus?.('closed')
      if (this.closed) return
      const delay = Math.min(10_000, 300 * 2 ** this.retry++) * (0.75 + Math.random() * 0.5)
      this.timer = setTimeout(() => this.open(), delay)
    }
    ws.onerror = () => ws.close()
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encode(msg))
  }

  close() {
    this.closed = true
    clearTimeout(this.timer)
    const ws = this.ws
    this.ws = undefined
    ws?.close()
    this.onStatus?.('closed')
  }
}

/**
 * In-process transport to a `CollabHub` (tests, demos with several viewers on one page).
 * Messages go through the JSON codec and are delivered asynchronously, optionally with latency.
 */
export class MemoryTransport implements Transport {
  onMessage?: (msg: HubMsg) => void
  onStatus?: (s: TransportStatus) => void
  private conn?: HubConnection
  private up = Promise.resolve()
  private down = Promise.resolve()

  constructor(
    private hub: CollabHub,
    private latency: number | (() => number) = 0,
  ) {}

  private delay() {
    const ms = typeof this.latency === 'function' ? this.latency() : this.latency
    return new Promise<void>((r) => (ms > 0 ? setTimeout(r, ms) : queueMicrotask(r)))
  }

  connect() {
    if (this.conn) return
    this.onStatus?.('connecting')
    const conn = (this.conn = this.hub.connect((m) => {
      const wire = encode(m)
      // FIFO delivery, even with random latency
      this.down = this.down
        .then(() => this.delay())
        .then(() => {
          if (this.conn === conn) this.onMessage?.(decode<HubMsg>(wire))
        })
    }))
    queueMicrotask(() => this.onStatus?.('open'))
  }

  send(msg: ClientMsg) {
    const conn = this.conn
    if (!conn) return
    const wire = encode(msg)
    this.up = this.up
      .then(() => this.delay())
      .then(() => {
        if (this.conn === conn) conn.receive(decode<ClientMsg>(wire))
      })
  }

  /** simulates a dropped connection (messages in flight are lost) */
  drop() {
    const c = this.conn
    this.conn = undefined
    c?.close()
    this.onStatus?.('closed')
  }

  close() {
    this.drop()
  }
}
