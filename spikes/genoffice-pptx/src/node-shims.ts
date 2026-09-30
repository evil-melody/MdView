// Browser shims for the 3 node-only imports in @genoffice/pptx-engine.
// createHash/deflateSync are never on the open/render path (hash = identity only,
// deflate = media insert only); randomUUID maps to the Web Crypto API.
export function createHash(_algo: string) {
  const chunks: Uint8Array[] = []
  return {
    update(data: Uint8Array) {
      chunks.push(data)
      return this
    },
    digest(_enc?: string) {
      // Non-cryptographic stand-in: identity/animation keys only, never security.
      let h = 0x811c9dc5
      for (const c of chunks) for (let i = 0; i < c.length; i++) h = ((h ^ c[i]!) * 0x01000193) >>> 0
      return (h.toString(16) + '0'.repeat(60)).slice(0, 64)
    },
  }
}

export function randomUUID(): string {
  return crypto.randomUUID()
}

export function deflateSync(data: Uint8Array): Uint8Array {
  return data // media-insert path only; unused during open/render
}
