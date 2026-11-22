/**
 * iWork '13+ packages (Pages, Keynote, Numbers): a ZIP of `Index/*.iwa` object archives plus `Data/` files.
 * An `.iwa` is a series of chunks (0x00, 24-bit length, Snappy block); decompressed, it is a series of
 * ArchiveInfo headers (varint length + TSP.ArchiveInfo) each followed by its object's protobuf message.
 */
import { BufferSource } from '../source'
import { ZipArchive } from '../zip'
import { Msg } from './proto'
import { unsnappy } from './snappy'

export interface IwaObject {
  type: number
  data: Uint8Array
}

/** TSP.PackageMetadata: maps data ids to the files in Data/ */
const PACKAGE_METADATA = 11006

/** Decompressed contents of an .iwa file. */
export function iwaBytes(src: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = []
  let size = 0
  for (let p = 0; p < src.length; ) {
    if (src[p] !== 0) throw new Error('Unsupported IWA chunk')
    const len = src[p + 1] | (src[p + 2] << 8) | (src[p + 3] << 16)
    const block = unsnappy(src.subarray(p + 4, p + 4 + len))
    parts.push(block)
    size += block.length
    p += 4 + len
  }
  if (parts.length === 1) return parts[0]
  const out = new Uint8Array(size)
  let o = 0
  for (const b of parts) out.set(b, o), (o += b.length)
  return out
}

/** Objects of an .iwa file, by identifier. */
export function readIwa(src: Uint8Array, into = new Map<number, IwaObject>()): Map<number, IwaObject> {
  const buf = iwaBytes(src)
  let p = 0
  while (p < buf.length) {
    let len = 0
    for (let shift = 0; ; shift += 7) {
      const b = buf[p++]
      len += (b & 0x7f) * 2 ** shift
      if (b < 0x80) break
    }
    const info = new Msg(buf.subarray(p, p + len))
    p += len
    const id = info.u(1)
    const msgs = info.msgs(2)
    for (let i = 0; i < msgs.length; i++) {
      const size = msgs[i].u(3) ?? 0
      // the first message is the object; later ones (rare) are merged updates of it
      if (i === 0 && id !== undefined) into.set(id, { type: msgs[i].u(1) ?? 0, data: buf.subarray(p, p + size) })
      p += size
    }
  }
  return into
}

/** Is this ZIP an iWork '13+ package (and not OOXML)? */
/** an iWork document folder inside a ZIP (a zipped package: "Report.pages/Index.zip") */
const PACKAGE_DIR = /^[^/]+\.(pages|key|numbers|template|kth|nmbtemplate)\//i

/** where the package's files are in the ZIP: '' or the zipped package folder ("Report.pages/"); undefined: not iWork */
export function iworkRoot(zip: ZipArchive): string | undefined {
  for (const e of zip.list()) {
    const m = /^(.*?)(index\.zip|index\/[^/]+\.iwa|index\/tables\/[^/]+\.iwa)$/i.exec(e.name)
    if (m && (m[1] === '' || PACKAGE_DIR.test(m[1]))) return m[1]
  }
  return undefined
}

/** Is this ZIP an iWork '13+ package (and not OOXML)? A password-protected one may hold only its hint. */
export function isIworkZip(zip: ZipArchive): boolean {
  if (zip.has('[Content_Types].xml')) return false
  return iworkRoot(zip) !== undefined || zip.has('.iwph') || zip.has('.iwpv2')
}

export class IworkPackage {
  private cache = new Map<number, Msg>()
  private dataFiles = new Map<number, string>()

  private constructor(
    readonly zip: ZipArchive,
    readonly objects: Map<number, IwaObject>,
    /** folder of the package in the ZIP ('' or "Report.pages/") */
    readonly root: string,
  ) {}

  static async open(outer: ZipArchive): Promise<IworkPackage> {
    const root = iworkRoot(outer) ?? ''
    // packages saved as folders (and early iWork '13 files) keep their archives in a nested Index.zip
    let index = outer
    let prefix = root.toLowerCase() + 'index/'
    if (outer.has(root + 'Index.zip')) {
      index = await ZipArchive.open(new BufferSource(await outer.bytes(root + 'Index.zip')))
      prefix = 'index/'
    }
    const objects = new Map<number, IwaObject>()
    for (const e of index.list()) {
      if (!/\.iwa$/i.test(e.name) || !e.name.toLowerCase().startsWith(prefix)) continue
      try {
        readIwa(await index.bytes(e.name), objects)
      } catch (err) {
        // side archives (collaboration history is LZFSE-compressed) are not needed to show the document
        if (/(^|\/)document\.iwa$/i.test(e.name)) throw err
      }
    }
    if (!objects.size) throw new Error('No iWork archives in this file')
    const pkg = new IworkPackage(outer, objects, root)
    pkg.mapData()
    return pkg
  }

  type(id: number | undefined): number | undefined {
    return id === undefined ? undefined : this.objects.get(id)?.type
  }

  get(id: number | undefined): Msg | undefined {
    if (id === undefined) return undefined
    let m = this.cache.get(id)
    if (m) return m
    const o = this.objects.get(id)
    if (!o) return undefined
    m = new Msg(o.data)
    this.cache.set(id, m)
    return m
  }

  /** identifiers of objects of a message type */
  ofType(type: number): number[] {
    const out: number[] = []
    for (const [id, o] of this.objects) if (o.type === type) out.push(id)
    return out
  }

  private mapData() {
    const dir = this.root.toLowerCase() + 'data/'
    const files = this.zip.list().map((e) => e.name).filter((n) => n.toLowerCase().startsWith(dir))
    for (const id of this.ofType(PACKAGE_METADATA)) {
      // TSP.PackageMetadata.datas: TSP.DataInfo { identifier = 1, preferred_file_name = 3, file_name = 4 }
      for (const d of this.get(id)!.msgs(3)) {
        const did = d.u(1)
        if (did === undefined) continue
        const name = d.str(4) ?? d.str(3)
        const path = name && files.find((f) => f.slice(dir.length) === name)
        if (path) this.dataFiles.set(did, path)
      }
    }
    // files are also named "<name>-<id>.<ext>"
    for (const f of files) {
      const m = /-(\d+)(?:\.[^./]*)?$/.exec(f)
      if (m && !this.dataFiles.has(+m[1])) this.dataFiles.set(+m[1], f)
    }
  }

  /** the document's locale ("en_GB"): TSK.DocumentArchive inside the Pages / Numbers / Keynote document */
  locale(): string | undefined {
    const doc = this.get(1)
    for (const f of [15, 8, 3]) {
      const tsk = doc?.msg(f)?.msg(1)
      const loc = tsk?.str(4)
      if (loc) return loc
    }
    return undefined
  }

  /** ZIP path of a data file (image, movie, font…) */
  dataPath(id: number | undefined): string | undefined {
    return id === undefined ? undefined : this.dataFiles.get(id)
  }
}
