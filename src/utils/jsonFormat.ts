/** JSON 美化 / 压缩：只做纯变换，选区与整篇共用同一入口 */
export type JsonResult = { ok: true; text: string } | { ok: false; error: string }

export function transformJson(src: string, compact: boolean): JsonResult {
  const raw = src.trim()
  if (!raw) return { ok: false, error: '没有选中内容' }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (e) {
    return { ok: false, error: '内容不是合法 JSON：' + String(e instanceof Error ? e.message : e) }
  }
  return { ok: true, text: compact ? JSON.stringify(value) : JSON.stringify(value, null, 2) }
}
