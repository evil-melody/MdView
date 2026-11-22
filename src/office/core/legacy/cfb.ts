/**
 * Compound File Binary (MS-CFB, "OLE2 structured storage"): the container of the Office 97-2003 binary formats
 * (.doc, .xls, .ppt). A small file system of storages (folders) and streams (files) in fixed-size sectors.
 */

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const END_OF_CHAIN = 0xfffffffe
const FREE = 0xffffffff
const FAT_SECT = 0xfffffffd
const NO_STREAM = 0xffffffff
const MAX_REG_SECT = 0xfffffffa

/** the 8-byte CFB signature */
export const isCfb = (b: Uint8Array) => b.length >= 8 && SIGNATURE.every((x, i) => b[i] === x)

export interface CfbEntry {
  /** "/"-separated path from the root storage (the root itself is not part of it): "WordDocument", "ObjectPool/_1234/\u0001Ole" */
  path: string
  name: string
  type: 'storage' | 'stream'
  size: number
  /** CLSID of a storage, as 32 hex digits (zeros when unset) */
  clsid: string
}

interface RawEntry {
  name: string
  type: number
  left: number
  right: number
  child: number
  start: number
  size: number
  clsid: string
}

/** A compound file read whole into memory: its streams by path. */
export class Cfb {
  private entries = new Map<string, RawEntry & { path: string }>()
  private sectorSize: number
  private miniSize: number
  private cutoff: number
  private fat: Uint32Array
  private miniFat: Uint32Array
  private miniStream: Uint8Array = new Uint8Array(0)

  private constructor(readonly bytes: Uint8Array) {
    if (!isCfb(bytes)) throw new Error('Not a compound file (OLE2)')
    if (bytes.length < 512) throw new Error('Compound file is truncated')
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const shift = dv.getUint16(0x1e, true)
    const miniShift = dv.getUint16(0x20, true)
    if (shift !== 9 && shift !== 12) throw new Error('Compound file: bad sector size')
    this.sectorSize = 1 << shift
    this.miniSize = 1 << miniShift
    this.cutoff = dv.getUint32(0x38, true) || 4096
    const fatSectors = dv.getUint32(0x2c, true)
    const firstDir = dv.getUint32(0x30, true)
    const firstMiniFat = dv.getUint32(0x3c, true)
    const miniFatSectors = dv.getUint32(0x40, true)
    let difatSector = dv.getUint32(0x44, true)
    const difatCount = dv.getUint32(0x48, true)

    // DIFAT: the sectors of the FAT (109 in the header, then chained DIFAT sectors)
    const fatList: number[] = []
    for (let i = 0; i < 109 && fatList.length < fatSectors; i++) {
      const s = dv.getUint32(0x4c + i * 4, true)
      if (s <= MAX_REG_SECT) fatList.push(s)
    }
    const per = this.sectorSize / 4 - 1
    const seenDifat = new Set<number>()
    for (let n = 0; n < difatCount && difatSector <= MAX_REG_SECT && fatList.length < fatSectors; n++) {
      if (seenDifat.has(difatSector)) break
      seenDifat.add(difatSector)
      const off = this.offset(difatSector)
      if (off + this.sectorSize > bytes.length) break
      for (let i = 0; i < per && fatList.length < fatSectors; i++) {
        const s = dv.getUint32(off + i * 4, true)
        if (s <= MAX_REG_SECT) fatList.push(s)
      }
      difatSector = dv.getUint32(off + per * 4, true)
    }
    // some writers (macOS textutil, files past ~7 MB) count more FAT sectors than the header and DIFAT list: when the
    // listed ones are consecutive, the rest follow them; kept only if the FAT marks each as a FAT sector, or chains them
    // one to the next (textutil), or does not reach them
    const listed = fatList.length
    const consecutive = listed > 1 && fatList.every((s, k) => k === 0 || s === fatList[k - 1] + 1)
    if (consecutive) while (fatList.length < fatSectors && this.offset(fatList[fatList.length - 1] + 1) < bytes.length) fatList.push(fatList[fatList.length - 1] + 1)
    const perSector = this.sectorSize / 4
    const readFat = () => {
      this.fat = new Uint32Array(fatList.length * perSector).fill(FREE)
      fatList.forEach((s, k) => {
        const off = this.offset(s)
        const n = Math.max(0, Math.min(perSector, Math.floor((bytes.length - off) / 4)))
        for (let i = 0; i < n; i++) this.fat[k * perSector + i] = dv.getUint32(off + i * 4, true)
      })
    }
    this.fat = new Uint32Array(0)
    readFat()
    const fatLike = (s: number) => s >= this.fat.length || this.fat[s] === FAT_SECT || this.fat[s] === s + 1 || this.fat[s] === END_OF_CHAIN
    if (fatList.length > listed && !fatList.slice(listed).every(fatLike)) {
      fatList.length = listed
      readFat()
    }

    // directory: 128-byte entries in the directory sector chain, a red-black tree per storage
    const dir = this.chain(firstDir)
    const raw: RawEntry[] = []
    for (let off = 0; off + 128 <= dir.length; off += 128) {
      const ev = new DataView(dir.buffer, dir.byteOffset + off, 128)
      const nameLen = Math.min(64, ev.getUint16(0x40, true))
      let name = ''
      for (let i = 0; i + 1 < nameLen - 1; i += 2) name += String.fromCharCode(ev.getUint16(i, true))
      let clsid = ''
      for (let i = 0; i < 16; i++) clsid += dir[off + 0x50 + i].toString(16).padStart(2, '0')
      raw.push({
        name,
        type: ev.getUint8(0x42),
        left: ev.getUint32(0x44, true),
        right: ev.getUint32(0x48, true),
        child: ev.getUint32(0x4c, true),
        start: ev.getUint32(0x74, true),
        // v3 files: only the low 32 bits count
        size: shift === 9 ? ev.getUint32(0x78, true) : ev.getUint32(0x78, true) + ev.getUint32(0x7c, true) * 2 ** 32,
        clsid,
      })
    }
    const root = raw[0]
    if (!root || root.type !== 5) throw new Error('Compound file: no root entry')

    // the mini stream (small streams' sectors) is the root entry's stream
    this.miniFat = new Uint32Array(0)
    if (miniFatSectors && firstMiniFat <= MAX_REG_SECT) {
      const mf = this.chain(firstMiniFat)
      this.miniFat = new Uint32Array(mf.length / 4)
      const mv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength)
      for (let i = 0; i < this.miniFat.length; i++) this.miniFat[i] = mv.getUint32(i * 4, true)
    }
    if (root.start <= MAX_REG_SECT) this.miniStream = this.chain(root.start, root.size)

    const visited = new Set<number>()
    const walk = (id: number, prefix: string) => {
      const stack = [id]
      while (stack.length) {
        const i = stack.pop()!
        if (i === NO_STREAM || i >= raw.length || visited.has(i)) continue
        visited.add(i)
        const e = raw[i]
        stack.push(e.left, e.right)
        if (e.type !== 1 && e.type !== 2) continue
        const path = prefix + e.name
        if (!this.entries.has(path.toLowerCase())) this.entries.set(path.toLowerCase(), { ...e, path })
        if (e.type === 1) walk(e.child, path + '/')
      }
    }
    visited.add(0)
    walk(root.child, '')
  }

  /** Reads a compound file (the whole file in memory). Throws when it is not one or is damaged. */
  static open(bytes: Uint8Array): Cfb {
    return new Cfb(bytes)
  }

  private offset(sector: number): number {
    return (sector + 1) * this.sectorSize
  }

  /** the bytes of a sector chain (a stream in the big sectors), cut to `size` when given */
  private chain(start: number, size?: number): Uint8Array {
    const ss = this.sectorSize
    const sectors: number[] = []
    const seen = new Set<number>()
    for (let s = start; s <= MAX_REG_SECT && s !== END_OF_CHAIN; s = this.fat[s] ?? END_OF_CHAIN) {
      if (seen.has(s)) throw new Error('Compound file: sector chain loops')
      // a truncated file: what is there (the rest reads as zeros)
      if (this.offset(s) >= this.bytes.length) break
      seen.add(s)
      sectors.push(s)
      if (size !== undefined && sectors.length * ss >= size) break
    }
    const out = new Uint8Array(size ?? sectors.length * ss)
    sectors.forEach((s, k) => {
      const off = this.offset(s)
      const n = Math.min(ss, out.length - k * ss, this.bytes.length - off)
      if (n > 0) out.set(this.bytes.subarray(off, off + n), k * ss)
    })
    return out
  }

  /** the bytes of a mini stream chain (streams under the cutoff size) */
  private miniChain(start: number, size: number): Uint8Array {
    const ms = this.miniSize
    const out = new Uint8Array(size)
    const seen = new Set<number>()
    let k = 0
    for (let s = start; s <= MAX_REG_SECT && s !== END_OF_CHAIN && k * ms < size; s = this.miniFat[s] ?? END_OF_CHAIN) {
      if (seen.has(s)) throw new Error('Compound file: mini sector chain loops')
      seen.add(s)
      const off = s * ms
      const n = Math.min(ms, size - k * ms, this.miniStream.length - off)
      if (n > 0) out.set(this.miniStream.subarray(off, off + n), k * ms)
      k++
    }
    return out
  }

  /** every storage and stream, in directory order (parents before children) */
  list(): CfbEntry[] {
    return [...this.entries.values()].map((e) => ({ path: e.path, name: e.name, type: e.type === 1 ? 'storage' : 'stream', size: e.type === 2 ? e.size : 0, clsid: e.clsid }))
  }

  /** a stream or storage exists at the path (names compare case-insensitively, as in CFB) */
  has(path: string): boolean {
    return this.entries.has(path.toLowerCase())
  }

  /** the entries directly inside a storage ("" for the root) */
  children(path: string): CfbEntry[] {
    const prefix = path ? path.toLowerCase() + '/' : ''
    return this.list().filter((e) => e.path.toLowerCase().startsWith(prefix) && !e.path.slice(prefix.length).includes('/'))
  }

  /** the bytes of a stream, or undefined when there is none at the path */
  stream(path: string): Uint8Array | undefined {
    const e = this.entries.get(path.toLowerCase())
    if (!e || e.type !== 2) return undefined
    if (!e.size) return new Uint8Array(0)
    return e.size < this.cutoff ? this.miniChain(e.start, e.size) : this.chain(e.start, e.size)
  }
}
