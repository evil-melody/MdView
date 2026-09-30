// Environment-agnostic data URL builder. Node has no `btoa` in every context and
// browsers have no `Buffer`, so encode by hand (avoiding both).
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_LOOKUP = /* @__PURE__ */ (() => {
  const t = new Uint8Array(256)
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i
  return t
})()

export function base64Encode(bytes: Uint8Array): string {
  let out = ''
  const n = bytes.length
  for (let i = 0; i < n; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < n ? bytes[i + 1] : 0
    const b2 = i + 2 < n ? bytes[i + 2] : 0
    out += B64[b0 >> 2]
    out += B64[((b0 & 3) << 4) | (b1 >> 4)]
    out += i + 1 < n ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '='
    out += i + 2 < n ? B64[b2 & 63] : '='
    if (out.length % 65536 < 4) {
      // chunking keeps concatenation cheap on very large media payloads
    }
  }
  return out
}

export function base64Decode(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '')
  const len = (clean.length * 3) >> 2
  const out = new Uint8Array(len)
  let p = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64_LOOKUP[clean.charCodeAt(i)] << 18) |
      (B64_LOOKUP[clean.charCodeAt(i + 1)] << 12) |
      (B64_LOOKUP[clean.charCodeAt(i + 2)] << 6) |
      B64_LOOKUP[clean.charCodeAt(i + 3)]
    if (p < len) out[p++] = (n >> 16) & 255
    if (p < len) out[p++] = (n >> 8) & 255
    if (p < len) out[p++] = n & 255
  }
  return out
}

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
  wmf: 'image/wmf',
}

export function dataUrlFor(ref: string, bytes: Uint8Array): string {
  const ext = (ref.split('.').pop() ?? '').toLowerCase()
  return `data:${MIME[ext] ?? 'application/octet-stream'};base64,${base64Encode(bytes)}`
}

/**
 * Resolve an OOXML media part reference (e.g. "../media/image3.png") against the archive,
 * falling back to a basename scan — templates often keep media in per-slide folders.
 */
export function createMediaResolver(opened: any) {
  const entries: Map<string, Uint8Array> | undefined = opened?.archive?.entries
  const cache = new Map<string, string>()
  const missing = new Set<string>()
  const resolve = (ref: string): string | undefined => {
    if (cache.has(ref)) return cache.get(ref) || undefined
    let data: Uint8Array | undefined = opened?.archive?.readBytes?.(ref)
    if (!data && entries) {
      const base = ref.split('/').pop()!.toLowerCase()
      for (const [p, b] of entries) {
        if (p.toLowerCase().endsWith('/' + base) || p.toLowerCase() === base) {
          data = b
          break
        }
      }
    }
    if (!data) {
      missing.add(ref)
      cache.set(ref, '')
      return undefined
    }
    const url = dataUrlFor(ref, data)
    cache.set(ref, url)
    return url
  }
  return { resolve, missing }
}
