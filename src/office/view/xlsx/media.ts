/** 图片 part → data URL，按 path 缓存。
 *  不用 DocumentClient.mediaUrl 的 blob URL：WKWebView 对 Worker 跨线程产生的 blob URL 解码不稳定，
 *  表现为图框在但图片空白；data URL 无此问题，插入时限幅后体积可控。 */
type PartReader = (path: string) => Promise<Blob>
/** 按 client 实例隔离：不同文档可能有同名 part（xl/media/image1.png），不可跨文档复用缓存 */
const caches = new WeakMap<object, Map<string, Promise<string>>>()

export function mediaDataUrl(owner: object, readPart: PartReader, path: string): Promise<string> {
  let cache = caches.get(owner)
  if (!cache) { cache = new Map(); caches.set(owner, cache) }
  let p = cache.get(path)
  if (!p) {
    p = readPart(path)
      .then((blob) => new Promise<string>((res, rej) => {
        const fr = new FileReader()
        fr.onload = () => res(String(fr.result))
        fr.onerror = () => rej(new Error('media read failed'))
        fr.readAsDataURL(blob)
      }))
      .catch((e) => { cache!.delete(path); throw e })
    cache.set(path, p)
  }
  return p
}
