/**
 * Environment-agnostic base64 codec.
 *
 * Neither `btoa` (not always present) nor `Buffer` (browser) can be assumed, and the
 * GenOffice sources need base64 both for media data-URLs and for the Buffer shim's
 * `toString('base64')` / `from(str,'base64')`. Hand-rolled keeps one code path for
 * browser, webview and node.
 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_LOOKUP = /* @__PURE__ */ (() => {
  const t = new Uint8Array(256)
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i
  return t
})()

export function base64Encode(bytes: Uint8Array): string {
  let out = ''
  const n = bytes.length
  // Chunked to keep the intermediate strings small on multi-MB media payloads.
  const CHUNK = 0x8000
  let parts: string[] = []
  for (let i = 0; i < n; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < n ? bytes[i + 1] : 0
    const b2 = i + 2 < n ? bytes[i + 2] : 0
    out += B64[b0 >> 2]
    out += B64[((b0 & 3) << 4) | (b1 >> 4)]
    out += i + 1 < n ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '='
    out += i + 2 < n ? B64[b2 & 63] : '='
    if (out.length >= CHUNK) {
      parts.push(out)
      out = ''
    }
  }
  parts.push(out)
  return parts.join('')
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
