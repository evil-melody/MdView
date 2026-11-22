import type { ByteSource } from './source'

export interface ZipEntry {
  name: string
  method: number
  flags: number
  crc: number
  time: number
  date: number
  compSize: number
  size: number
  localOffset: number
  dataOffset?: number
}

const SIG_EOCD = 0x06054b50
const SIG_Z64_LOC = 0x07064b50
const SIG_Z64_EOCD = 0x06064b50
const SIG_CEN = 0x02014b50
const SIG_LOC = 0x04034b50

const u64 = (dv: DataView, o: number) => Number(dv.getBigUint64(o, true))

/**
 * Lazy ZIP reader: parses only the central directory, then inflates single
 * entries on demand straight from the byte source (native DecompressionStream).
 */
export class ZipArchive {
  private entries = new Map<string, ZipEntry>()

  private constructor(readonly src: ByteSource) {}

  static async open(src: ByteSource): Promise<ZipArchive> {
    const zip = new ZipArchive(src)
    await zip.readDirectory()
    return zip
  }

  private async readDirectory() {
    const { src } = this
    if (src.size < 22) throw new Error('Not a ZIP/OOXML file (too small)')
    const tailLen = Math.min(src.size, 22 + 0xffff + 20)
    const tailStart = src.size - tailLen
    const tail = await src.read(tailStart, tailLen)
    const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
    let eocd = -1
    for (let i = tail.length - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) === SIG_EOCD) {
        eocd = i
        break
      }
    }
    if (eocd < 0) {
      const head = await src.read(0, 8)
      if (head[0] === 0xd0 && head[1] === 0xcf) {
        throw new Error('Legacy binary Office format (.doc/.xls/.ppt) or encrypted file is not supported')
      }
      throw new Error('Not a ZIP/OOXML file (no end of central directory)')
    }
    let count = dv.getUint16(eocd + 10, true)
    let cdSize = dv.getUint32(eocd + 12, true)
    let cdOffset = dv.getUint32(eocd + 16, true)

    if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      const loc = eocd - 20
      if (loc >= 0 && dv.getUint32(loc, true) === SIG_Z64_LOC) {
        const z64Off = u64(dv, loc + 8)
        const rec = await src.read(z64Off, 56)
        const rdv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength)
        if (rdv.getUint32(0, true) === SIG_Z64_EOCD) {
          count = u64(rdv, 32)
          cdSize = u64(rdv, 40)
          cdOffset = u64(rdv, 48)
        }
      }
    }

    const cd = await src.read(cdOffset, cdSize)
    const cdv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength)
    const utf8 = new TextDecoder()
    let p = 0
    for (let n = 0; n < count && p + 46 <= cd.length; n++) {
      if (cdv.getUint32(p, true) !== SIG_CEN) break
      const flags = cdv.getUint16(p + 8, true)
      const method = cdv.getUint16(p + 10, true)
      const time = cdv.getUint16(p + 12, true)
      const date = cdv.getUint16(p + 14, true)
      const crc = cdv.getUint32(p + 16, true)
      let compSize = cdv.getUint32(p + 20, true)
      let size = cdv.getUint32(p + 24, true)
      const nameLen = cdv.getUint16(p + 28, true)
      const extraLen = cdv.getUint16(p + 30, true)
      const commentLen = cdv.getUint16(p + 32, true)
      let localOffset = cdv.getUint32(p + 42, true)
      const name = utf8.decode(cd.subarray(p + 46, p + 46 + nameLen))
      if (size === 0xffffffff || compSize === 0xffffffff || localOffset === 0xffffffff) {
        let e = p + 46 + nameLen
        const eEnd = e + extraLen
        while (e + 4 <= eEnd) {
          const id = cdv.getUint16(e, true)
          const len = cdv.getUint16(e + 2, true)
          if (id === 0x0001) {
            let q = e + 4
            if (size === 0xffffffff) (size = u64(cdv, q)), (q += 8)
            if (compSize === 0xffffffff) (compSize = u64(cdv, q)), (q += 8)
            if (localOffset === 0xffffffff) localOffset = u64(cdv, q)
            break
          }
          e += 4 + len
        }
      }
      if (!name.endsWith('/')) {
        this.entries.set(normalize(name), { name, method, flags, crc, time, date, compSize, size, localOffset })
      }
      p += 46 + nameLen + extraLen + commentLen
    }
  }

  list(): ZipEntry[] {
    return [...this.entries.values()]
  }

  get(path: string): ZipEntry | undefined {
    return this.entries.get(normalize(path))
  }

  has(path: string): boolean {
    return this.entries.has(normalize(path))
  }

  private async dataOffset(e: ZipEntry): Promise<number> {
    if (e.dataOffset !== undefined) return e.dataOffset
    const h = await this.src.read(e.localOffset, 30)
    const dv = new DataView(h.buffer, h.byteOffset, h.byteLength)
    if (dv.getUint32(0, true) !== SIG_LOC) throw new Error(`Corrupt ZIP local header for ${e.name}`)
    e.dataOffset = e.localOffset + 30 + dv.getUint16(26, true) + dv.getUint16(28, true)
    return e.dataOffset
  }

  /** Compressed bytes of an entry, as stored (zero-copy Blob slice when the source allows). */
  async rawData(e: ZipEntry): Promise<Blob | Uint8Array> {
    const off = await this.dataOffset(e)
    return this.src.slice ? this.src.slice(off, e.compSize) : this.src.read(off, e.compSize)
  }

  /** Decompressed stream of an entry. `onRaw` reports compressed bytes consumed. */
  async stream(path: string, onRaw?: (consumed: number, total: number) => void): Promise<ReadableStream<Uint8Array>> {
    const e = this.get(path)
    if (!e) throw new Error(`Missing part: ${path}`)
    if (e.flags & 1) throw new Error('Encrypted documents are not supported')
    const off = await this.dataOffset(e)
    let raw = this.src.stream(off, e.compSize)
    if (onRaw) {
      let consumed = 0
      const total = e.compSize
      raw = raw.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, ctrl) {
            consumed += chunk.length
            onRaw(consumed, total)
            ctrl.enqueue(chunk)
          },
        }),
      )
    }
    if (e.method === 0) return raw
    if (e.method === 8) return raw.pipeThrough(new DecompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>)
    throw new Error(`Unsupported ZIP compression method ${e.method} for ${e.name}`)
  }

  async bytes(path: string): Promise<Uint8Array> {
    const e = this.get(path)
    if (!e) throw new Error(`Missing part: ${path}`)
    const reader = (await this.stream(path)).getReader()
    const out = new Uint8Array(e.size)
    let pos = 0
    const extra: Uint8Array[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (pos + value.length <= out.length) out.set(value, pos)
      else extra.push(value)
      pos += value.length
    }
    if (!extra.length) return pos === out.length ? out : out.subarray(0, pos)
    // Size in directory was wrong: rebuild.
    const all = new Uint8Array(pos)
    all.set(out)
    let q = out.length
    for (const x of extra) all.set(x, q), (q += x.length)
    return all
  }

  async text(path: string): Promise<string> {
    return new TextDecoder().decode(await this.bytes(path))
  }
}

export function normalize(path: string): string {
  return path.replace(/^\/+/, '').replace(/\\/g, '/').toLowerCase()
}
