/** ZIP 内媒体按需取回并转成 objectURL；同一路径复用，宿主销毁时统一释放。 */
import type { DocumentClient } from './client'

export class MediaCache {
  private urls = new Map<string, string>()
  private pending = new Map<string, Promise<string>>()

  constructor(private client: DocumentClient) {}

  private load(target: string): Promise<string> {
    const hit = this.pending.get(target)
    if (hit) return hit
    const p = this.client
      .call('part', target)
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        this.urls.set(target, url)
        return url
      })
      .catch(() => '')
      .finally(() => this.pending.delete(target))
    this.pending.set(target, p)
    return p
  }

  /** 把 v-html 里的 <img data-media> 补上 src */
  async hydrate(root: HTMLElement): Promise<void> {
    const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img[data-media]'))
    await Promise.all(
      imgs.map(async (img) => {
        const url = await this.load(img.dataset.media!)
        if (url && img.isConnected) img.src = url
      })
    )
  }

  dispose() {
    for (const url of this.urls.values()) URL.revokeObjectURL(url)
    this.urls.clear()
    this.pending.clear()
  }
}
