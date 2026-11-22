/** OpenDocument (ODF 1.0-1.3) text, spreadsheet and presentation files → DOCX, XLSX, PPTX. */
import type { ZipArchive } from '../../zip'
import { OdfPackage } from './common'
import { odpToPptx } from './odp'
import { odsToXlsx } from './ods'
import { odtToDocx } from './odt'

export type OdfFormat = 'odt' | 'ods' | 'odp'

const MIMETYPE = /^application\/vnd\.oasis\.opendocument\.(text|spreadsheet|presentation)(-template|-master)?$/

const FORMAT: Record<string, OdfFormat> = { text: 'odt', spreadsheet: 'ods', presentation: 'odp' }

const ofMime = (mime: string | undefined) => {
  const m = MIMETYPE.exec((mime ?? '').trim())
  return m ? FORMAT[m[1]] : null
}

/**
 * The format of an OpenDocument package (its `mimetype` entry or manifest) or flat XML document
 * (`office:mimetype`), templates included; null when it is not a text, spreadsheet or presentation.
 */
export async function odfFormatOf(src: ZipArchive | string): Promise<OdfFormat | null> {
  if (typeof src === 'string') return ofMime(/<office:document\b[^>]*\boffice:mimetype\s*=\s*["']([^"']+)["']/.exec(src.slice(0, 8192))?.[1])
  if (!src.has('content.xml')) return null
  if (src.has('mimetype')) {
    const f = ofMime(await src.text('mimetype'))
    if (f) return f
  }
  if (!src.has('META-INF/manifest.xml')) return null
  const manifest = await src.text('META-INF/manifest.xml')
  // the entry of the package itself: <manifest:file-entry manifest:full-path="/" manifest:media-type="…"/>
  for (const e of manifest.matchAll(/<manifest:file-entry\b[^>]*>/g)) {
    if (/manifest:full-path\s*=\s*["']\/["']/.test(e[0])) return ofMime(/manifest:media-type\s*=\s*["']([^"']+)["']/.exec(e[0])?.[1])
  }
  return null
}

/** Converts an OpenDocument package (ZIP) or flat XML document to the Office Open XML file it opens as. */
export async function odfToOoxml(src: ZipArchive | string, format: OdfFormat): Promise<Blob> {
  const pkg = await OdfPackage.open(src)
  return format === 'odt' ? odtToDocx(pkg) : format === 'ods' ? odsToXlsx(pkg) : odpToPptx(pkg)
}
