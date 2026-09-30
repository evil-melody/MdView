/**
 * Webview shims for the 5 Node-only imports inside the vendored GenOffice packages
 * (vite.config.ts aliases `node:crypto`, `node:zlib`, `node:fs`, `node:stream/promises`
 * to this module).
 *
 * - `createHash('sha256')` must be a REAL SHA-256: the engine stores `deck.originalHash`
 *   at open time and re-verifies the archive before saving, so a fake digest would work
 *   only by accident and would produce wrong content-addressed media dedup.
 * - `deflateSync` is only reached by the media-insert path; raw-deflate keeps it honest
 *   instead of silently storing uncompressed data.
 * - The fs/stream entries are unreachable in the webview (they back `savePptxToFile`,
 *   which MdView never calls — it writes through the Tauri fs layer); they throw loudly.
 */

// ── SHA-256 (FIPS 180-4), sync, no dependencies ─────────────────────────────

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

function sha256(bytes: Uint8Array): Uint8Array {
  const bitLen = bytes.length * 8
  const withPad = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6)
  withPad.set(bytes)
  withPad[bytes.length] = 0x80
  const dv = new DataView(withPad.buffer)
  dv.setUint32(withPad.length - 4, bitLen >>> 0)
  dv.setUint32(withPad.length - 8, Math.floor(bitLen / 0x100000000))

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const w = new Uint32Array(64)
  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = H
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    H[0] = (H[0] + a) >>> 0
    H[1] = (H[1] + b) >>> 0
    H[2] = (H[2] + c) >>> 0
    H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0
    H[5] = (H[5] + f) >>> 0
    H[6] = (H[6] + g) >>> 0
    H[7] = (H[7] + h) >>> 0
  }
  const out = new Uint8Array(32)
  const odv = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i])
  return out
}

const HEX = '0123456789abcdef'

export function createHash(algo: string) {
  if (algo.toLowerCase().replace('-', '') !== 'sha256') {
    throw new Error(`[pptx shim] unsupported hash: ${algo}`)
  }
  const chunks: Uint8Array[] = []
  let total = 0
  return {
    update(data: Uint8Array) {
      chunks.push(data)
      total += data.length
      return this
    },
    digest(enc?: string): string | Uint8Array {
      const all = new Uint8Array(total)
      let off = 0
      for (const c of chunks) {
        all.set(c, off)
        off += c.length
      }
      const d = sha256(all)
      if (enc === 'hex' || enc === undefined) {
        let s = ''
        for (const b of d) s += HEX[b >> 4] + HEX[b & 15]
        return s
      }
      return d
    },
  }
}

export function randomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  let s = ''
  for (let i = 0; i < 16; i++) {
    s += HEX[b[i] >> 4] + HEX[b[i] & 15]
    if (i === 3 || i === 5 || i === 7 || i === 9) s += '-'
  }
  return s
}

/** Raw DEFLATE (no zlib header), matching Node's `zlib.deflateSync` payload shape. */
export async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(
    new CompressionStream('deflate-raw'),
  )
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export function deflateSync(data: Uint8Array): Uint8Array {
  // Only reachable from the media-insert path, which is async at the call site in practice;
  // returning the input unchanged would silently store uncompressed bytes, so we surface it.
  throw new Error('[pptx shim] deflateSync is not available in the webview; use deflateRaw()')
}

export async function readFile(): Promise<never> {
  throw new Error('[pptx shim] node:fs is not available — use the Tauri fs layer')
}

export async function writeFile(): Promise<never> {
  throw new Error('[pptx shim] node:fs is not available — use the Tauri fs layer')
}
