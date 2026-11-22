/** A1 reference helpers: column letters, sheet quoting, reference text. */
import { MAX_COL, MAX_ROW } from './types'

/** Parsed A1 reference as written in a formula (0-based, inclusive, normalized r0<=r1, c0<=c1). */
export interface RefAddr {
  sheet?: string
  kind: 'cell' | 'area' | 'cols' | 'rows'
  r0: number
  c0: number
  r1: number
  c1: number
  ar0: boolean
  ac0: boolean
  ar1: boolean
  ac1: boolean
}

export function colName(c: number): string {
  let s = ''
  let n = c + 1
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function colIndex(letters: string): number {
  let n = 0
  const up = letters.toUpperCase()
  for (let i = 0; i < up.length; i++) n = n * 26 + (up.charCodeAt(i) - 64)
  return n - 1
}

export function sameSheet(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  return a.toLowerCase() === b.toLowerCase()
}

/** Sheet name as it must appear before '!' (quoted when needed). */
export function quoteSheet(name: string): string {
  const plain =
    /^[A-Za-z_\u00A1-\uFFFF][\w.\u00A1-\uFFFF]*$/.test(name) &&
    !/^[A-Za-z]{1,3}\d+$/.test(name) &&
    !/^(R\d*C?\d*|C\d*)$/i.test(name) &&
    !/^(TRUE|FALSE)$/i.test(name)
  return plain ? name : `'${name.replace(/'/g, "''")}'`
}

const cellText = (r: number, c: number, ar: boolean, ac: boolean) =>
  `${ac ? '$' : ''}${colName(c)}${ar ? '$' : ''}${r + 1}`

/** Reference text. `sheetText` (raw prefix without '!') is reused when given to preserve original quoting. */
export function fmtRef(a: RefAddr, sheetText?: string): string {
  const pre = a.sheet === undefined ? '' : `${sheetText ?? quoteSheet(a.sheet)}!`
  switch (a.kind) {
    case 'cell':
      return pre + cellText(a.r0, a.c0, a.ar0, a.ac0)
    case 'area':
      return `${pre}${cellText(a.r0, a.c0, a.ar0, a.ac0)}:${cellText(a.r1, a.c1, a.ar1, a.ac1)}`
    case 'cols':
      return `${pre}${a.ac0 ? '$' : ''}${colName(a.c0)}:${a.ac1 ? '$' : ''}${colName(a.c1)}`
    case 'rows':
      return `${pre}${a.ar0 ? '$' : ''}${a.r0 + 1}:${a.ar1 ? '$' : ''}${a.r1 + 1}`
  }
}

/** Swap ends (with their $ flags) so r0<=r1 and c0<=c1. Mutates. */
export function normalizeRef(a: RefAddr): RefAddr {
  if (a.r0 > a.r1) {
    ;[a.r0, a.r1] = [a.r1, a.r0]
    ;[a.ar0, a.ar1] = [a.ar1, a.ar0]
  }
  if (a.c0 > a.c1) {
    ;[a.c0, a.c1] = [a.c1, a.c0]
    ;[a.ac0, a.ac1] = [a.ac1, a.ac0]
  }
  return a
}

export function refInBounds(a: RefAddr): boolean {
  return a.r0 >= 0 && a.c0 >= 0 && a.r1 <= MAX_ROW && a.c1 <= MAX_COL && a.r1 >= 0 && a.c1 >= 0
}
