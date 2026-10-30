import { invoke } from '@tauri-apps/api/core'

/**
 * md 远端资源本地化：把渲染产物里的 http(s) 图片 / 样式等下载到本地并改写地址。
 * 结果按「文档路径 + 内容特征」缓存，重复渲染（主题切换 / 切页签回来）不重复 invoke；
 * 失败不留缓存，下次内容变化可重试。
 */
const localizeCache = new Map<string, Promise<string>>()

/** 渲染产物里存在远端引用（http/https）才需要本地化 */
export function hasRemoteRefs(html: string): boolean {
  return /https?:\/\//i.test(html)
}

/** 缓存 key：文档路径 + 内容长度 + 首 200 字符（同 key 复用进行中 / 已完成结果） */
function cacheKey(docPath: string, html: string): string {
  return `${docPath}\u0000${html.length}\u0000${html.slice(0, 200)}`
}

/** 清掉某文档的全部本地化缓存（手动刷新后强制重跑，保证远端资源重新下载） */
export function clearLocalizeCache(docPath: string) {
  const prefix = `${docPath}\u0000`
  for (const key of localizeCache.keys()) {
    if (key.startsWith(prefix)) localizeCache.delete(key)
  }
}

/** 本地化渲染产物：命中缓存直接复用，否则 invoke 后端管线 */
export function localizeMdHtml(docPath: string, html: string): Promise<string> {
  const key = cacheKey(docPath, html)
  const hit = localizeCache.get(key)
  if (hit) return hit
  const pending = invoke<{ html: string }>('localize_md_html', { html, docPath }).then(
    (res) => res.html
  )
  localizeCache.set(key, pending)
  // 失败不落缓存：删除后下次可重试（避免坏结果被长期复用）
  pending.catch(() => localizeCache.delete(key))
  return pending
}
