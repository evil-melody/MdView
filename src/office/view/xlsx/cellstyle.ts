import type { CellCss, CellOut, Merge } from '../../core/xlsx/types'

/** 单格样式（含富文本颜色覆盖）。合并区四边的边框来自各边实际格，不能只看锚格。 */
export function cellCssAt(styles: CellCss[], cache: Map<number, CellOut[]>, r: number, c: number): CellCss {
  const hit = cache.get(r)?.find((v) => v[0] === c)
  const css = styles[hit?.[2] ?? 0] ?? {}
  return hit?.[4] ? { ...css, color: hit[4] } : css
}

export function mergedCss(styles: CellCss[], cache: Map<number, CellOut[]>, m: Merge): CellCss {
  const css = { ...cellCssAt(styles, cache, m.r0, m.c0) }
  const pick = (key: string, spots: [number, number][]) => {
    for (const [r, c] of spots) {
      const v = cellCssAt(styles, cache, r, c)[key]
      if (v !== undefined) { css[key] = v; return }
    }
  }
  const span = (a: number, b: number, fixed: number, vertical: boolean): [number, number][] =>
    Array.from({ length: Math.min(200, b - a + 1) }, (_, i) => vertical ? [a + i, fixed] as [number, number] : [fixed, a + i] as [number, number])
  pick('borderLeft', span(m.r0, m.r1, m.c0, true))
  pick('borderRight', span(m.r0, m.r1, m.c1, true))
  pick('borderTop', span(m.c0, m.c1, m.r0, false))
  pick('borderBottom', span(m.c0, m.c1, m.r1, false))
  return css
}
