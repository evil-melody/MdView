/** Package plumbing shared by the iWork → OOXML converters: parts with their relationships, media, content types. */
import { isWebImage } from '../opc'
import { escAttr } from '../raw'
import type { IworkPackage } from './iwa'
import type { Msg } from './proto'

export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** a package part and its relationships */
export class Part {
  rels: string[] = []
  private links = new Map<string, string>()
  constructor(readonly path: string) {}

  /** relationship id of a target (relationship types are the officeDocument ones: image, hyperlink…) */
  rel(type: string, target: string, external = false): string {
    const key = `${type} ${target}`
    let id = this.links.get(key)
    if (id) return id
    id = `rId${this.rels.length + 1}`
    this.links.set(key, id)
    this.rels.push(`<Relationship Id="${id}" Type="${REL}/${type}" Target="${escAttr(target)}"${external ? ' TargetMode="External"' : ''}/>`)
    return id
  }

  get relsPath(): string {
    const slash = this.path.lastIndexOf('/')
    return `${this.path.slice(0, slash)}/_rels/${this.path.slice(slash + 1)}.rels`
  }

  relsXml(): string {
    return `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${this.rels.join('')}</Relationships>`
  }
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
}

/** `<Default>` content types of the media extensions */
export function mediaTypes(names: Iterable<string>): string {
  const exts = new Set([...names].map((n) => n.split('.').pop()!.toLowerCase()))
  return [...exts].map((e) => `<Default Extension="${e}" ContentType="${MIME[e] ?? 'application/octet-stream'}"/>`).join('')
}

/** Images copied from the iWork package's Data/ folder into `dir` of the OOXML package. */
export class Media {
  private names = new Map<number, string>()
  /** OOXML path → iWork package path */
  readonly files = new Map<string, string>()

  constructor(
    private pkg: IworkPackage,
    private dir: string,
  ) {}

  /** file name (in `dir`) of a data object */
  name(dataId: number): string {
    let name = this.names.get(dataId)
    if (name) return name
    const path = this.pkg.dataPath(dataId)!
    const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase() ?? 'png'
    name = `image${this.names.size + 1}.${ext}`
    this.names.set(dataId, name)
    this.files.set(`${this.dir}/${name}`, path)
    return name
  }

  async bytes(): Promise<Map<string, Uint8Array>> {
    const out = new Map<string, Uint8Array>()
    for (const [name, src] of this.files) out.set(name, await this.pkg.zip.bytes(src))
    return out
  }
}

/** the data id of the first image of a TSD.ImageArchive that a browser shows (adjusted, current, original, thumbnail) */
export function imageData(pkg: IworkPackage, m: Msg, fields = [15, 11, 13, 12, 16]): number | undefined {
  return fields
    .map((f) => m.msg(f)?.u(1))
    .find((d) => {
      const p = d === undefined ? undefined : pkg.dataPath(d)
      return !!p && isWebImage(p)
    })
}
