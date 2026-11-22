/** Variable-size axis (rows or columns): default size + sparse overrides, O(log n) lookups. */
export class Axis {
  count = 0
  private custom = new Map<number, number>()
  private keys: number[] = []
  private cum: number[] = [] // cumulative delta (size - def) up to and including keys[i]
  private dirty = false

  constructor(public def: number) {}

  set(i: number, size: number) {
    if (size === this.def) this.custom.delete(i)
    else this.custom.set(i, size)
    this.dirty = true
  }

  setRange(min: number, max: number, size: number) {
    const hi = Math.min(max, min + 20000)
    for (let i = min; i <= hi; i++) this.set(i, size)
  }

  private build() {
    if (!this.dirty) return
    this.keys = [...this.custom.keys()].sort((a, b) => a - b)
    let acc = 0
    this.cum = this.keys.map((k) => (acc += this.custom.get(k)! - this.def))
    this.dirty = false
  }

  size(i: number): number {
    return this.custom.get(i) ?? this.def
  }

  /** Start offset of index i. */
  pos(i: number): number {
    this.build()
    let lo = 0
    let hi = this.keys.length - 1
    let k = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this.keys[mid] < i) {
        k = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    return i * this.def + (k >= 0 ? this.cum[k] : 0)
  }

  total(): number {
    return this.pos(this.count)
  }

  /** Index containing offset px (clamped to [0, count-1]). */
  index(px: number): number {
    if (px <= 0) return 0
    let lo = 0
    let hi = Math.max(0, this.count - 1)
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.pos(mid) <= px) lo = mid
      else hi = mid - 1
    }
    return lo
  }
}
