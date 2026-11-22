/** JSON encoding that survives binary payloads (images inserted while collaborating). */

const B64 = '$b64'

function toB64(u8: Uint8Array): string {
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function encode(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v instanceof Uint8Array) return { [B64]: toB64(v) }
    if (v instanceof ArrayBuffer) return { [B64]: toB64(new Uint8Array(v)) }
    return v
  })
}

export function decode<T = unknown>(text: string): T {
  return JSON.parse(text, (_k, v) => (v && typeof v === 'object' && typeof v[B64] === 'string' && Object.keys(v).length === 1 ? fromB64(v[B64]) : v)) as T
}
