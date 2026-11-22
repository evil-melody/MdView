import type { DocKind } from '../opc'
import { isWebImage } from '../opc'
import type { DocSource } from '../source'
import type { Events, Evt, Methods, OpenParams, OpenResult, Req, Res } from './protocol'
import { Engine } from './engine'

export interface OpenOptions extends OpenParams {
  /** Custom worker factory (e.g. for strict CSP setups). Pass `false` to run on the main thread. */
  worker?: (() => Worker) | false
  /** Download / parse progress, including progress emitted while opening. */
  onProgress?: (p: Events['progress']) => void
}

type Listener<K extends keyof Events> = (data: Events[K]) => void

let defaultWorkerFactory: (() => Worker) | undefined

/** Registers the worker factory used when none is passed to `DocumentClient.open`. */
export function setDefaultWorker(factory: () => Worker) {
  defaultWorkerFactory = factory
}

/**
 * Main-thread handle to a document living in a Web Worker.
 * Parsing, unzipping and formatting never block the UI thread.
 */
export class DocumentClient {
  kind!: DocKind
  name?: string
  size = 0
  info!: OpenResult
  private worker?: Worker
  private engine?: Engine
  private seq = 0
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private listeners = new Map<keyof Events, Set<(d: unknown) => void>>()
  private urls = new Map<string, Promise<string>>()
  private destroyed = false

  private constructor(opts: OpenOptions) {
    const factory = opts.worker === false ? undefined : opts.worker ?? defaultWorkerFactory
    if (factory) {
      this.worker = factory()
      this.worker.onmessage = (e: MessageEvent<Res | Evt>) => this.onMessage(e.data)
      this.worker.onerror = (e) => {
        const err = new Error(e.message || 'Worker failed to start')
        for (const p of this.pending.values()) p.reject(err)
        this.pending.clear()
      }
    } else {
      this.engine = new Engine((event, data) => this.onMessage({ event, data }))
    }
  }

  static async open(src: DocSource, opts: OpenOptions = {}): Promise<DocumentClient> {
    const client = new DocumentClient(opts)
    const { worker: _w, onProgress, ...params } = opts
    if (onProgress) client.on('progress', onProgress)
    let payload: Blob | ArrayBuffer | string
    if (typeof src === 'string' || src instanceof URL) payload = new URL(String(src), globalThis.location?.href).href
    else if (src instanceof Uint8Array) payload = src.slice().buffer as ArrayBuffer
    else payload = src
    try {
      client.info = await client.call('open', payload, params)
    } catch (e) {
      client.destroy()
      throw e
    }
    client.kind = client.info.kind
    client.name = client.info.name
    client.size = client.info.size
    return client
  }

  private onMessage(msg: Res | Evt) {
    if ('event' in msg) {
      const set = this.listeners.get(msg.event)
      if (set) for (const fn of set) fn(msg.data)
      return
    }
    const p = this.pending.get(msg.id)
    if (!p) return
    this.pending.delete(msg.id)
    if (msg.ok) p.resolve(msg.result)
    else p.reject(new Error(msg.error))
  }

  /**
   * Set by a collaboration session: sees every call first and handles the ones that change the
   * document (returns a promise), or returns undefined to let the call through unchanged.
   */
  interceptor?: (method: keyof Methods, args: unknown[]) => Promise<unknown> | undefined

  call<M extends keyof Methods>(method: M, ...args: Parameters<Methods[M]>): Promise<ReturnType<Methods[M]>> {
    if (this.interceptor && !this.destroyed) {
      const r = this.interceptor(method, args)
      if (r) return r as Promise<ReturnType<Methods[M]>>
    }
    return this.direct(method, ...args)
  }

  /** calls the engine directly, bypassing `interceptor` */
  direct<M extends keyof Methods>(method: M, ...args: Parameters<Methods[M]>): Promise<ReturnType<Methods[M]>> {
    if (this.destroyed) return Promise.reject(new Error('Document closed'))
    if (this.engine) return this.engine.call(method, args) as Promise<ReturnType<Methods[M]>>
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      const transfer = args[0] instanceof ArrayBuffer ? [args[0]] : []
      this.worker!.postMessage({ id, method, args } satisfies Req, transfer)
    })
  }

  /** dispatches an event to listeners on this thread (e.g. remote changes applied by a collaboration session) */
  notify<K extends keyof Events>(event: K, data: Events[K]) {
    this.onMessage({ event, data })
  }

  on<K extends keyof Events>(event: K, fn: Listener<K>): () => void {
    let set = this.listeners.get(event)
    if (!set) this.listeners.set(event, (set = new Set()))
    set.add(fn as (d: unknown) => void)
    return () => set!.delete(fn as (d: unknown) => void)
  }

  /** Object URL for a package part (images, media). Cached per client; revoked on destroy. */
  mediaUrl(path: string): Promise<string> {
    let p = this.urls.get(path)
    if (!p) {
      p = this.call('part', path).then((blob) => URL.createObjectURL(blob))
      this.urls.set(path, p)
    }
    return p
  }

  static canRender(path: string) {
    return isWebImage(path)
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.worker?.terminate()
    this.engine?.dispose()
    for (const p of this.pending.values()) p.reject(new Error('Document closed'))
    this.pending.clear()
    for (const u of this.urls.values()) u.then((url) => URL.revokeObjectURL(url)).catch(() => {})
    this.urls.clear()
    this.listeners.clear()
  }
}
