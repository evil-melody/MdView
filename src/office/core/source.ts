/**
 * Random-access byte sources. The ZIP reader only touches the bytes it needs
 * (central directory + requested entries), so a 500 MB file is never read in full.
 */
export interface ByteSource {
  readonly size: number
  readonly name?: string
  /** MIME type, when known (a Blob's type, the server's Content-Type) */
  readonly type?: string
  read(offset: number, length: number): Promise<Uint8Array>
  stream(offset: number, length: number): ReadableStream<Uint8Array>
  /** Zero-copy sub-Blob when available (used when re-zipping unchanged entries). */
  slice?(offset: number, length: number): Blob
}

export type ProgressFn = (loaded: number, total: number) => void

export class BlobSource implements ByteSource {
  readonly size: number
  readonly type?: string
  constructor(private blob: Blob, readonly name?: string) {
    this.size = blob.size
    this.type = blob.type || undefined
  }
  async read(offset: number, length: number): Promise<Uint8Array> {
    return new Uint8Array(await this.blob.slice(offset, offset + length).arrayBuffer())
  }
  stream(offset: number, length: number): ReadableStream<Uint8Array> {
    return this.blob.slice(offset, offset + length).stream() as ReadableStream<Uint8Array>
  }
  slice(offset: number, length: number): Blob {
    return this.blob.slice(offset, offset + length)
  }
}

export class BufferSource implements ByteSource {
  readonly size: number
  private bytes: Uint8Array
  constructor(data: ArrayBuffer | Uint8Array, readonly name?: string) {
    this.bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    this.size = this.bytes.byteLength
  }
  async read(offset: number, length: number): Promise<Uint8Array> {
    return this.bytes.subarray(offset, offset + length)
  }
  stream(offset: number, length: number): ReadableStream<Uint8Array> {
    const bytes = this.bytes
    const end = Math.min(offset + length, bytes.byteLength)
    let pos = offset
    const CHUNK = 1 << 20
    return new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (pos >= end) return ctrl.close()
        const next = Math.min(pos + CHUNK, end)
        ctrl.enqueue(bytes.slice(pos, next))
        pos = next
      },
    })
  }
}

export interface HttpSourceOptions {
  headers?: Record<string, string>
  credentials?: RequestCredentials
  /** Block size used for cached range reads (default 256 KB). */
  blockSize?: number
  /** Max cached blocks (default 128 → 32 MB). */
  maxBlocks?: number
  onProgress?: ProgressFn
  signal?: AbortSignal
}

/**
 * HTTP source using Range requests. Falls back to a full download when the
 * server does not honour ranges (or CORS hides the needed headers).
 */
export class HttpRangeSource implements ByteSource {
  private cache = new Map<number, Uint8Array>()
  private inflight = new Map<number, Promise<void>>()
  private blockSize: number
  private maxBlocks: number

  private constructor(
    readonly url: string,
    readonly size: number,
    private opts: HttpSourceOptions,
    readonly name?: string,
    readonly type?: string,
  ) {
    this.blockSize = opts.blockSize ?? 256 * 1024
    this.maxBlocks = opts.maxBlocks ?? 128
  }

  static async open(url: string, opts: HttpSourceOptions = {}): Promise<ByteSource> {
    const name = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || '') || undefined
    const init: RequestInit = { headers: { ...opts.headers }, credentials: opts.credentials, signal: opts.signal }
    let size = -1
    try {
      const res = await fetch(url, { ...init, headers: { ...opts.headers, Range: 'bytes=0-0' } })
      if (res.status === 206) {
        const cr = res.headers.get('Content-Range')
        const m = cr && /\/(\d+)\s*$/.exec(cr)
        if (m) size = Number(m[1])
        await res.body?.cancel()
        if (size < 0) {
          const head = await fetch(url, { ...init, method: 'HEAD' })
          const len = head.headers.get('Content-Length')
          if (head.ok && len) size = Number(len)
        }
        if (size > 0) return new HttpRangeSource(url, size, opts, name, res.headers.get('Content-Type') || undefined)
      } else if (res.ok) {
        // Server ignored the Range header and is sending the whole file: just use it.
        return new BlobSource(await readWithProgress(res, opts.onProgress), name)
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err
      // Likely a CORS preflight failure for the Range header → plain GET below.
    }
    const res = await fetch(url, init)
    if (!res.ok) throw new Error(`HTTP ${res.status} while fetching ${url}`)
    return new BlobSource(await readWithProgress(res, opts.onProgress), name)
  }

  private async fetchRange(start: number, endExcl: number): Promise<Uint8Array> {
    const res = await fetch(this.url, {
      headers: { ...this.opts.headers, Range: `bytes=${start}-${endExcl - 1}` },
      credentials: this.opts.credentials,
      signal: this.opts.signal,
    })
    if (res.status !== 206 && !res.ok) throw new Error(`HTTP ${res.status} (range ${start}-${endExcl - 1})`)
    const buf = new Uint8Array(await res.arrayBuffer())
    // A 200 means the server sent everything; slice what we asked for.
    return res.status === 206 ? buf : buf.subarray(start, endExcl)
  }

  private async ensureBlocks(first: number, last: number): Promise<void> {
    const waits: Promise<void>[] = []
    let runStart = -1
    const flush = (endBlock: number) => {
      if (runStart < 0) return
      const a = runStart
      const b = endBlock
      const p = this.fetchRange(a * this.blockSize, Math.min((b + 1) * this.blockSize, this.size)).then((buf) => {
        for (let k = a; k <= b; k++) {
          const off = (k - a) * this.blockSize
          this.cache.set(k, buf.subarray(off, Math.min(off + this.blockSize, buf.length)))
          this.inflight.delete(k)
        }
        this.evict()
      })
      for (let k = a; k <= b; k++) this.inflight.set(k, p)
      waits.push(p)
      runStart = -1
    }
    for (let k = first; k <= last; k++) {
      if (this.cache.has(k)) {
        flush(k - 1)
        // refresh LRU position
        const v = this.cache.get(k)!
        this.cache.delete(k)
        this.cache.set(k, v)
      } else if (this.inflight.has(k)) {
        flush(k - 1)
        waits.push(this.inflight.get(k)!)
      } else if (runStart < 0) runStart = k
    }
    flush(last)
    await Promise.all(waits)
  }

  private evict() {
    while (this.cache.size > this.maxBlocks) {
      const oldest = this.cache.keys().next().value as number
      this.cache.delete(oldest)
    }
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    const end = Math.min(offset + length, this.size)
    if (end <= offset) return new Uint8Array(0)
    // big reads would thrash the block cache: fetch directly
    if (end - offset > (this.maxBlocks * this.blockSize) / 2) return this.fetchRange(offset, end)
    const bs = this.blockSize
    const first = Math.floor(offset / bs)
    const last = Math.floor((end - 1) / bs)
    await this.ensureBlocks(first, last)
    const out = new Uint8Array(end - offset)
    for (let k = first; k <= last; k++) {
      const blk = this.cache.get(k)
      if (!blk) throw new Error('range block evicted before use')
      const blkStart = k * bs
      const from = Math.max(offset, blkStart)
      const to = Math.min(end, blkStart + blk.length)
      out.set(blk.subarray(from - blkStart, to - blkStart), from - offset)
    }
    return out
  }

  stream(offset: number, length: number): ReadableStream<Uint8Array> {
    // Large entries: one streaming range request, bypassing the block cache.
    if (length > 2 * this.blockSize) {
      const { url, opts } = this
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      return new ReadableStream<Uint8Array>({
        async start() {
          const res = await fetch(url, {
            headers: { ...opts.headers, Range: `bytes=${offset}-${offset + length - 1}` },
            credentials: opts.credentials,
            signal: opts.signal,
          })
          if (res.status !== 206) throw new Error(`Range request not honoured (HTTP ${res.status})`)
          reader = res.body!.getReader()
        },
        async pull(ctrl) {
          const { done, value } = await reader!.read()
          if (done) ctrl.close()
          else ctrl.enqueue(value)
        },
        cancel() {
          return reader?.cancel()
        },
      })
    }
    let pos = offset
    const end = offset + length
    return new ReadableStream<Uint8Array>({
      pull: async (ctrl) => {
        if (pos >= end) return ctrl.close()
        const n = Math.min(this.blockSize, end - pos)
        ctrl.enqueue(await this.read(pos, n))
        pos += n
      },
    })
  }
}

async function readWithProgress(res: Response, onProgress?: ProgressFn): Promise<Blob> {
  const total = Number(res.headers.get('Content-Length') || 0)
  if (!res.body || !onProgress) return res.blob()
  const type = res.headers.get('Content-Type') ?? ''
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    loaded += value.length
    onProgress(loaded, total)
  }
  return new Blob(parts as BlobPart[], { type })
}

export type DocSource = Blob | File | ArrayBuffer | Uint8Array | string | URL

export async function openSource(src: DocSource, opts: HttpSourceOptions & { name?: string } = {}): Promise<ByteSource> {
  if (typeof src === 'string' || src instanceof URL) return HttpRangeSource.open(String(src), opts)
  if (src instanceof Uint8Array || src instanceof ArrayBuffer) return new BufferSource(src, opts.name)
  if (typeof Blob !== 'undefined' && src instanceof Blob) {
    return new BlobSource(src, opts.name ?? (src as File).name)
  }
  throw new Error('Unsupported document source')
}
