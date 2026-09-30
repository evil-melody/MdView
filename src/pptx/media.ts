/**
 * Media resolution: OOXML media part reference (e.g. "../media/image3.png") -> data URL,
 * read straight out of the GenOffice PackageArchive that `openPptx` produced.
 *
 * Templates frequently keep media in per-slide folders, so a basename scan backs up the
 * exact-path lookup.
 */
import type { OpenedPptx } from '@genoffice/pptx-engine'
import { base64Encode } from './shims/base64'

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  tiff: 'image/tiff',
  emf: 'image/emf',
  wmf: 'image/wmf'
}

export function dataUrlFor(ref: string, bytes: Uint8Array): string {
  const ext = (ref.split('.').pop() ?? '').toLowerCase()
  return `data:${MIME[ext] ?? 'application/octet-stream'};base64,${base64Encode(bytes)}`
}

export interface MediaResolverHandle {
  resolve: (ref: string) => string | undefined
  missing: Set<string>
}

export function createMediaResolver(opened: OpenedPptx): MediaResolverHandle {
  const entries = (opened as any)?.archive?.entries as Map<string, Uint8Array> | undefined
  const cache = new Map<string, string>()
  const missing = new Set<string>()
  const resolve = (ref: string): string | undefined => {
    if (cache.has(ref)) return cache.get(ref) || undefined
    let data: Uint8Array | undefined = (opened as any)?.archive?.readBytes?.(ref)
    if (!data && entries) {
      const base = ref.split('/').pop()?.toLowerCase() ?? ''
      for (const [p, b] of entries) {
        if (p.toLowerCase().endsWith('/' + base) || p.toLowerCase() === base) {
          data = b
          break
        }
      }
    }
    if (!data) {
      // A deferred (lazy-inflated) part is a transient miss: render runs before the
      // background fill reaches it. Don't cache as missing so the next render after
      // ensureSlideMedia/ensureAll resolves it.
      if (!opened?.archive?.has?.(ref)) {
        missing.add(ref)
        cache.set(ref, '')
      }
      return undefined
    }
    const url = dataUrlFor(ref, data)
    cache.set(ref, url)
    return url
  }
  return { resolve, missing }
}
