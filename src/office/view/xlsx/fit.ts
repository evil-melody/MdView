/** px size of a CSS font size ('11pt', px number), `base` when unset */
export const fontPx = (v: string | number | undefined, base: number) =>
  typeof v === 'string' && v.endsWith('pt') ? (parseFloat(v) * 4) / 3 : typeof v === 'number' ? v : base

/** Excel-like: shrink General decimals to fit, otherwise show ### when a number is too wide. */
export function fitNumber(text: string, width: number, px: number): string {
  const cw = px * 0.56
  if (text.length * cw <= width) return text
  const m = /^(-?\d+)\.(\d+)$/.exec(text)
  if (m && (m[1].length + (text.startsWith('-') ? 0 : 0)) * cw <= width) {
    const keep = Math.max(0, Math.floor(width / cw) - m[1].length - 1)
    const v = Number(text).toFixed(keep)
    if (v.length * cw <= width) return v
  }
  return '#'.repeat(Math.max(1, Math.floor(width / cw)))
}
