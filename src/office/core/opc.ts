import { el, getAttr, isNode, kidsOf, parseRaw, rootEl, serialize } from './raw'
import { normalize, ZipArchive } from './zip'
import { rebuildZip, type PartData } from './zipwrite'
import { kids, parseXml, type XEl } from './xml'

export type DocKind = 'docx' | 'xlsx' | 'pptx'

export interface Rel {
  id: string
  type: string
  target: string
  external: boolean
}

export type Rels = Map<string, Rel>

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  ico: 'image/x-icon',
  emf: 'image/emf',
  wmf: 'image/wmf',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
}

export function mimeOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return MIME[ext] ?? 'application/octet-stream'
}

/** Browser-renderable image? (EMF/WMF/TIFF are not.) */
export function isWebImage(path: string): boolean {
  return /\.(png|jpe?g|jpe|gif|bmp|svg|webp|ico)$/i.test(path)
}

export function dirOf(part: string): string {
  const i = part.lastIndexOf('/')
  return i < 0 ? '' : part.slice(0, i)
}

export function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const out = baseDir ? baseDir.split('/') : []
  for (const seg of target.split('/')) {
    if (seg === '..') out.pop()
    else if (seg && seg !== '.') out.push(seg)
  }
  return out.join('/')
}

/** Inverse of resolvePath: target of `abs` relative to directory `fromDir`. */
export function relativeTarget(fromDir: string, abs: string): string {
  const a = fromDir ? fromDir.split('/') : []
  const b = abs.split('/')
  let i = 0
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/')
}

export function relsPathFor(part: string): string {
  const d = dirOf(part)
  const f = part.slice(d.length ? d.length + 1 : 0)
  return (d ? d + '/' : '') + '_rels/' + f + '.rels'
}

export class OpcPackage {
  private relsCache = new Map<string, Promise<Rels>>()
  private xmlCache = new Map<string, Promise<XEl | undefined>>()
  private contentTypes?: Promise<Map<string, string>>
  /** edited parts: normalized path → { path, data } (data null = deleted) */
  private changes = new Map<string, { path: string; data: PartData | null }>()

  constructor(readonly zip: ZipArchive) {}

  has(path: string) {
    const ch = this.changes.get(normalize(path))
    if (ch) return ch.data !== null
    return this.zip.has(path)
  }

  get dirty(): boolean {
    return this.changes.size > 0
  }

  /** Current text of a part (edited version if any). */
  async text(path: string): Promise<string> {
    const ch = this.changes.get(normalize(path))
    if (ch) {
      if (ch.data === null) throw new Error(`Missing part: ${path}`)
      if (typeof ch.data === 'string') return ch.data
      if (ch.data instanceof Uint8Array) return new TextDecoder().decode(ch.data)
      throw new Error(`Part ${path} is a stream`)
    }
    return this.zip.text(path)
  }

  /** Decompressed stream of the current version of a part (edited parts included). */
  async stream(path: string, onRaw?: (consumed: number, total: number) => void): Promise<ReadableStream<Uint8Array>> {
    const ch = this.changes.get(normalize(path))
    if (!ch) return this.zip.stream(path, onRaw)
    if (ch.data === null) throw new Error(`Missing part: ${path}`)
    if (typeof ch.data === 'function') return ch.data()
    const bytes = typeof ch.data === 'string' ? new TextEncoder().encode(ch.data) : ch.data
    return new ReadableStream({
      start(c) {
        c.enqueue(bytes)
        c.close()
      },
    })
  }

  /** what a part was set to in this session (null: deleted); undefined when it is as read */
  changed(path: string): PartData | null | undefined {
    return this.changes.get(normalize(path))?.data
  }

  setPart(path: string, data: PartData | null): void {
    path = path.replace(/^\/+/, '')
    this.changes.set(normalize(path), { path, data })
    this.xmlCache.delete(path)
    this.relsCache.clear()
    if (/\[content_types\]\.xml$/i.test(path)) this.contentTypes = undefined
  }

  /** Builds the edited package; unchanged entries are copied without recompression. */
  async save(type: string): Promise<Blob> {
    const m = new Map<string, PartData | null>()
    for (const { path, data } of this.changes.values()) m.set(path, data)
    return rebuildZip(this.zip, m, type)
  }

  /** Adds a relationship from `part` to `target` (absolute part path); returns its id. */
  async addRel(part: string, type: string, target: string, external = false): Promise<string> {
    const rp = relsPathFor(part)
    const nodes = this.has(rp)
      ? parseRaw(await this.text(rp))
      : parseRaw('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>')
    const root = rootEl(nodes)!
    const ids = new Set(kidsOf(root, 'Relationship').map((r) => getAttr(r, 'Id')))
    let n = ids.size + 1
    while (ids.has(`rId${n}`)) n++
    const id = `rId${n}`
    root.c.push(el('Relationship', external ? { Id: id, Type: type, Target: target, TargetMode: 'External' } : { Id: id, Type: type, Target: relativeTarget(dirOf(part), target) }))
    root.self = false
    this.setPart(rp, serialize(nodes))
    return id
  }

  async removeRelsTo(part: string, target: string): Promise<void> {
    const rp = relsPathFor(part)
    if (!this.has(rp)) return
    const nodes = parseRaw(await this.text(rp))
    const root = rootEl(nodes)!
    const base = dirOf(part)
    root.c = root.c.filter((c) => !(isNode(c) && resolvePath(base, getAttr(c, 'Target') ?? '').toLowerCase() === target.toLowerCase()))
    this.setPart(rp, serialize(nodes))
  }

  /** Ensures a <Default Extension=…> entry exists (for new media types). */
  async ensureDefaultType(ext: string, contentType: string): Promise<void> {
    const ct = '[Content_Types].xml'
    const nodes = parseRaw(await this.text(ct))
    const root = rootEl(nodes)!
    if (kidsOf(root, 'Default').some((d) => getAttr(d, 'Extension')?.toLowerCase() === ext.toLowerCase())) return
    root.c.unshift(el('Default', { Extension: ext, ContentType: contentType }))
    this.setPart(ct, serialize(nodes))
  }

  /** Free part name like `word/media/image7.png`. */
  freeName(dir: string, base: string, ext: string): string {
    for (let i = 1; ; i++) {
      const p = `${dir}/${base}${i}.${ext}`
      if (!this.has(p)) return p
    }
  }

  async setContentType(partName: string, contentType: string | null): Promise<void> {
    const ct = '[Content_Types].xml'
    const nodes = parseRaw(await this.text(ct))
    const root = rootEl(nodes)!
    const pn = '/' + partName.replace(/^\/+/, '')
    root.c = root.c.filter((c) => !(isNode(c) && getAttr(c, 'PartName')?.toLowerCase() === pn.toLowerCase()))
    if (contentType) root.c.push(el('Override', { PartName: pn, ContentType: contentType }))
    this.setPart(ct, serialize(nodes))
  }

  /** Parsed XML part (cached). Missing parts resolve to undefined. */
  xml(path: string, cache = true): Promise<XEl | undefined> {
    const load = async () => (this.has(path) ? parseXml(await this.text(path), SKIP_EXT) : undefined)
    if (!cache) return load()
    let p = this.xmlCache.get(path)
    if (!p) this.xmlCache.set(path, (p = load()))
    return p
  }

  rels(part: string): Promise<Rels> {
    let p = this.relsCache.get(part)
    if (!p) {
      p = (async () => {
        const map: Rels = new Map()
        const rp = relsPathFor(part)
        if (!this.has(rp)) return map
        const root = parseXml(await this.text(rp))
        const base = dirOf(part)
        for (const r of kids(root, 'Relationship')) {
          const external = r.a.TargetMode === 'External'
          const target = r.a.Target ?? ''
          map.set(r.a.Id, {
            id: r.a.Id,
            type: r.a.Type ?? '',
            external,
            target: external ? target : resolvePath(base, target),
          })
        }
        return map
      })()
      this.relsCache.set(part, p)
    }
    return p
  }

  async contentType(path: string): Promise<string | undefined> {
    if (!this.contentTypes) {
      this.contentTypes = (async () => {
        const m = new Map<string, string>()
        if (!this.has('[Content_Types].xml')) return m
        const root = parseXml(await this.text('[Content_Types].xml'))
        for (const d of kids(root, 'Default')) m.set('ext:' + (d.a.Extension ?? '').toLowerCase(), d.a.ContentType)
        for (const o of kids(root, 'Override')) m.set((o.a.PartName ?? '').replace(/^\//, '').toLowerCase(), o.a.ContentType)
        return m
      })()
    }
    const m = await this.contentTypes
    const key = path.toLowerCase()
    return m.get(key) ?? m.get('ext:' + (key.split('.').pop() ?? ''))
  }

  async blob(path: string): Promise<Blob> {
    const ch = this.changes.get(normalize(path))
    const bytes = ch && ch.data !== null && typeof ch.data !== 'function' ? (typeof ch.data === 'string' ? new TextEncoder().encode(ch.data) : ch.data) : await this.zip.bytes(path)
    return new Blob([bytes as BlobPart], { type: mimeOf(path) })
  }

  async mainPart(): Promise<{ path: string; kind: DocKind }> {
    const rels = await this.rels('')
    let path: string | undefined
    for (const r of rels.values()) if (r.type.endsWith('/officeDocument')) path = r.target
    const candidates: [string, DocKind][] = [
      ['word/document.xml', 'docx'],
      ['xl/workbook.xml', 'xlsx'],
      ['ppt/presentation.xml', 'pptx'],
    ]
    if (!path) path = candidates.find(([p]) => this.zip.has(p))?.[0]
    if (!path) throw new Error('Not an Office Open XML document (no main part found)')
    const ct = (await this.contentType(path)) ?? ''
    let kind: DocKind | undefined
    if (ct.includes('wordprocessingml')) kind = 'docx'
    else if (ct.includes('spreadsheetml')) kind = 'xlsx'
    else if (ct.includes('presentationml')) kind = 'pptx'
    else kind = candidates.find(([p]) => path!.toLowerCase().startsWith(p.split('/')[0] + '/'))?.[1]
    if (!kind) throw new Error(`Unsupported document type (${ct || path})`)
    return { path, kind }
  }
}

export function relOfType(rels: Rels, suffix: string): Rel | undefined {
  for (const r of rels.values()) if (r.type.endsWith('/' + suffix)) return r
  return undefined
}

export function relsOfType(rels: Rels, suffix: string): Rel[] {
  return [...rels.values()].filter((r) => r.type.endsWith('/' + suffix))
}

const SKIP_EXT = new Set(['extLst'])
