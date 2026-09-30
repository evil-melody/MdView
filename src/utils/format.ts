/** 文件体积人类可读格式（FileBrowser / 相似图片 / 预览头共用一份，避免多处各写一遍） */
export function fmtSize(n: number): string {
  if (!n && n !== 0) return '—'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}
