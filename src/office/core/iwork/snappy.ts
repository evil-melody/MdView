/** Raw Snappy block decompression (no framing format), as used by iWork's `.iwa` chunks. */
export function unsnappy(src: Uint8Array): Uint8Array {
  let p = 0
  let len = 0
  for (let shift = 0; ; shift += 7) {
    if (p >= src.length) throw new Error('Corrupt Snappy block')
    const b = src[p++]
    len += (b & 0x7f) * 2 ** shift
    if (b < 0x80) break
  }
  const out = new Uint8Array(len)
  let o = 0
  while (p < src.length) {
    const tag = src[p++]
    const type = tag & 3
    if (type === 0) {
      let n = tag >>> 2
      if (n >= 60) {
        const bytes = n - 59
        n = 0
        for (let i = 0; i < bytes; i++) n |= src[p++] << (8 * i)
        n >>>= 0
      }
      n += 1
      if (p + n > src.length || o + n > len) throw new Error('Corrupt Snappy literal')
      out.set(src.subarray(p, p + n), o)
      p += n
      o += n
      continue
    }
    let n: number
    let off: number
    if (type === 1) {
      n = 4 + ((tag >>> 2) & 7)
      off = ((tag >>> 5) << 8) | src[p++]
    } else if (type === 2) {
      n = 1 + (tag >>> 2)
      off = src[p] | (src[p + 1] << 8)
      p += 2
    } else {
      n = 1 + (tag >>> 2)
      off = (src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24)) >>> 0
      p += 4
    }
    if (off === 0 || off > o || o + n > len) throw new Error('Corrupt Snappy copy')
    // overlapping copies repeat the last `off` bytes: byte by byte
    for (let i = 0; i < n; i++, o++) out[o] = out[o - off]
  }
  if (o !== len) throw new Error('Truncated Snappy block')
  return out
}
