import { normalize, type ZipArchive } from './zip'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return ~c >>> 0
}

const IS_BUN = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'

export type PartData = Uint8Array | string | (() => ReadableStream<Uint8Array>)

interface Deflated {
  chunks: Uint8Array[]
  crc: number
  size: number
  csize: number
}

/** Deflates (raw) a stream while computing CRC32 and sizes. */
async function deflate(input: ReadableStream<Uint8Array>): Promise<Deflated> {
  let crc = 0
  let size = 0
  const counted = input.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        crc = crc32(chunk, crc)
        size += chunk.length
        ctrl.enqueue(chunk)
      },
    }),
  )
  const out = counted.pipeThrough(new CompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>)
  const reader = out.getReader()
  const chunks: Uint8Array[] = []
  let csize = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    csize += value.length
  }
  return { chunks, crc, size, csize }
}

function toStream(d: PartData): ReadableStream<Uint8Array> {
  if (typeof d === 'function') return d()
  const bytes = typeof d === 'string' ? new TextEncoder().encode(d) : d
  return new ReadableStream({
    start(c) {
      c.enqueue(bytes)
      c.close()
    },
  })
}

function dosNow(): { time: number; date: number } {
  const d = new Date()
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

/**
 * Re-packs an archive: unchanged entries are copied as stored (no recompression,
 * zero-copy when the source is a Blob); changed/added entries are deflated.
 * `changes`: path → new data, or null to delete.
 */
export async function rebuildZip(zip: ZipArchive | null, changes: Map<string, PartData | null>, type = 'application/zip'): Promise<Blob> {
  const enc = new TextEncoder()
  const parts: BlobPart[] = []
  const central: Uint8Array[] = []
  let offset = 0
  let count = 0
  const pending = new Map<string, { name: string; data: PartData | null }>()
  for (const [k, v] of changes) pending.set(normalize(k), { name: k.replace(/^\/+/, ''), data: v })

  const writeEntry = (name: string, method: number, crc: number, csize: number, size: number, time: number, date: number, body: BlobPart[]) => {
    const nameBytes = enc.encode(name)
    const utf8 = /[^\x20-\x7e]/.test(name) ? 0x800 : 0
    if (offset > 0xfffffff0 || csize > 0xfffffff0) throw new Error('Saved file exceeds 4 GB (ZIP64 writing not supported)')
    const lh = new Uint8Array(30 + nameBytes.length)
    const dv = new DataView(lh.buffer)
    dv.setUint32(0, 0x04034b50, true)
    dv.setUint16(4, 20, true)
    dv.setUint16(6, utf8, true)
    dv.setUint16(8, method, true)
    dv.setUint16(10, time, true)
    dv.setUint16(12, date, true)
    dv.setUint32(14, crc, true)
    dv.setUint32(18, csize, true)
    dv.setUint32(22, size, true)
    dv.setUint16(26, nameBytes.length, true)
    lh.set(nameBytes, 30)
    const ch = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(ch.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, utf8, true)
    cv.setUint16(10, method, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, csize, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    ch.set(nameBytes, 46)
    parts.push(lh, ...body)
    central.push(ch)
    offset += lh.length + csize
    count++
  }

  const writeNew = async (name: string, data: PartData) => {
    const d = await deflate(toStream(data))
    const { time, date } = dosNow()
    writeEntry(name, 8, d.crc, d.csize, d.size, time, date, d.chunks as BlobPart[])
  }

  for (const e of zip?.list() ?? []) {
    const key = normalize(e.name)
    const ch = pending.get(key)
    if (ch) {
      pending.delete(key)
      if (ch.data !== null) await writeNew(e.name, ch.data)
      continue
    }
    let raw = await zip!.rawData(e)
    // Bun drops lazily-read file slices when composing Blobs: materialize there (browsers stay zero-copy)
    if (IS_BUN && raw instanceof Blob) raw = new Uint8Array(await raw.arrayBuffer())
    writeEntry(e.name, e.method, e.crc, e.compSize, e.size, e.time, e.date, [raw as BlobPart])
  }
  for (const { name, data } of pending.values()) if (data !== null) await writeNew(name, data)

  const cdSize = central.reduce((n, c) => n + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, count, true)
  ev.setUint16(10, count, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)
  return new Blob([...parts, ...(central as BlobPart[]), eocd], { type })
}

/** Writes a new archive (all entries deflated). */
export function writeZip(entries: Map<string, PartData>, type = 'application/zip'): Promise<Blob> {
  return rebuildZip(null, entries, type)
}
