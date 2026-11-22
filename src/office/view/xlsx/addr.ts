/** 网格地址/几何纯工具：从 OfficeSheetView 抽出，保持视图文件 ≤2000 行。 */
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export const norm = (a: { r: number; c: number }, b: { r: number; c: number }) => ({
  r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c)
})
export function parseAddr(s: string) {
  const m = /^([A-Za-z]+)(\d+)$/.exec(s.trim())
  if (!m) return null
  let c = 0
  for (const ch of m[1].toUpperCase()) c = c * 26 + ch.charCodeAt(0) - 64
  return { r: Math.max(0, Number(m[2]) - 1), c: Math.max(0, c - 1) }
}
