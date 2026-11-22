/** Images of an OpenDocument package for the PPTX: their type from their bytes, natural size, unique names. */
import type { ONode, OdfPackage } from './common'

/** image type from the first bytes: png, jpeg, gif, bmp, webp, svg, emf, wmf, tiff (others: undefined) */
export function sniffImage(b: Uint8Array): string | undefined {
  const at = (i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0))
  if (b.length < 8) return undefined
  if (b[0] === 0x89 && at(1, 'PNG')) return 'png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (at(0, 'GIF8')) return 'gif'
  if (at(0, 'BM') && b.length > 26) return 'bmp'
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'webp'
  if (b[0] === 1 && b[1] === 0 && b[2] === 0 && b[3] === 0 && at(40, ' EMF')) return 'emf'
  if ((b[0] === 0xd7 && b[1] === 0xcd && b[2] === 0xc6 && b[3] === 0x9a) || ((b[0] === 1 || b[0] === 2) && b[1] === 0 && b[2] === 9 && b[3] === 0)) return 'wmf'
  if (at(0, 'II*\u0000') || at(0, 'MM\u0000*')) return 'tiff'
  const head = new TextDecoder().decode(b.subarray(0, 2048)).replace(/^\ufeff/, '').trimStart()
  if (head.startsWith('<') && /<svg[\s>]/.test(head)) return 'svg'
  return undefined
}

const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1]
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8)
const le32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) | 0

/** the natural size of an image in points (its pixels at its resolution, 96 dpi when it has none) */
export function naturalSize(b: Uint8Array, type: string): { w: number; h: number } | undefined {
  let w = 0
  let h = 0
  let dpiX = 96
  let dpiY = 96
  try {
    if (type === 'png' && b.length >= 24) {
      w = be32(b, 16)
      h = be32(b, 20)
      // pHYs before the image data
      for (let i = 8; i + 8 <= b.length && i < 1 << 20; ) {
        const len = be32(b, i)
        const t = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7])
        if (t === 'IDAT' || len > b.length) break
        if (t === 'pHYs' && b[i + 16] === 1) {
          dpiX = be32(b, i + 8) * 0.0254 || 96
          dpiY = be32(b, i + 12) * 0.0254 || 96
        }
        i += 12 + len
      }
    } else if (type === 'jpeg') {
      for (let i = 2, steps = 0; i + 9 < b.length && steps < 1000; steps++) {
        if (b[i] !== 0xff) {
          i++
          continue
        }
        const m = b[i + 1]
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
          i += 2
          continue
        }
        const len = be16(b, i + 2)
        if (m === 0xe0 && b[i + 4] === 0x4a && b[i + 5] === 0x46 && b[i + 6] === 0x49 && b[i + 7] === 0x46) {
          const unit = b[i + 11]
          const x = be16(b, i + 12)
          const y = be16(b, i + 14)
          if (unit === 1 && x && y) [dpiX, dpiY] = [x, y]
          else if (unit === 2 && x && y) [dpiX, dpiY] = [x * 2.54, y * 2.54]
        }
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          h = be16(b, i + 5)
          w = be16(b, i + 7)
          break
        }
        i += 2 + len
      }
    } else if (type === 'gif') {
      w = le16(b, 6)
      h = le16(b, 8)
    } else if (type === 'bmp') {
      w = Math.abs(le32(b, 18))
      h = Math.abs(le32(b, 22))
      const px = le32(b, 38)
      const py = le32(b, 42)
      if (px > 0 && py > 0) [dpiX, dpiY] = [px * 0.0254, py * 0.0254]
    }
  } catch {
    return undefined
  }
  if (!(w > 0 && h > 0)) return undefined
  return { w: (w * 72) / dpiX, h: (h * 72) / dpiY }
}

export const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  emf: 'image/x-emf',
  wmf: 'image/x-wmf',
  tiff: 'image/tiff',
}

export interface MediaFile {
  /** file name in ppt/media */
  name: string
  type: string
  w?: number
  h?: number
}

/** the images copied into ppt/media, once each */
export class Media {
  readonly files = new Map<string, Uint8Array>()
  private known = new Map<string | ONode, MediaFile | null>()
  private bytesTotal = 0

  constructor(private pkg: OdfPackage) {}

  async get(el: ONode): Promise<MediaFile | undefined> {
    const href = el.attrs['xlink:href']
    const key = href && !el.kids.length ? href.replace(/^\.\//, '') : el
    if (this.known.has(key)) return this.known.get(key) ?? undefined
    let file: MediaFile | null = null
    const bytes = await this.pkg.file(el)
    const type = bytes && sniffImage(bytes)
    if (bytes && type && this.bytesTotal + bytes.length < 2 ** 31) {
      const ext = type === 'jpeg' ? 'jpg' : type
      file = { name: `image${this.files.size + 1}.${ext}`, type, ...naturalSize(bytes, type) }
      this.files.set(file.name, bytes)
      this.bytesTotal += bytes.length
    }
    this.known.set(key, file)
    return file ?? undefined
  }

  /** `<Default>` content types of the files */
  contentTypes(): string {
    const exts = new Set([...this.files.keys()].map((n) => n.slice(n.lastIndexOf('.') + 1)))
    return [...exts].map((e) => `<Default Extension="${e}" ContentType="${IMAGE_MIME[e] ?? 'application/octet-stream'}"/>`).join('')
  }
}
