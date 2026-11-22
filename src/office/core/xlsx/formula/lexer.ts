/** Tokenizer for OOXML formula text (no leading '='). Tokens carry source spans so transforms can splice text. */
import { colIndex, normalizeRef, type RefAddr } from './refs'
import { MAX_COL, MAX_ROW, type ErrorCode } from './types'

export class FormulaSyntaxError extends Error {
  constructor(
    message: string,
    readonly pos: number,
  ) {
    super(message)
    this.name = 'FormulaSyntaxError'
  }
}

interface Span {
  s: number
  e: number
}

export type Token = Span &
  (
    | { t: 'num'; v: number }
    | { t: 'str'; v: string }
    | { t: 'bool'; v: boolean }
    | { t: 'err'; v: ErrorCode; sheet?: string }
    | { t: 'ref'; ref: RefAddr; sheetText?: string }
    | { t: 'func'; v: string }
    | { t: 'name'; v: string; sheet?: string }
    | { t: 'op'; v: string }
    | { t: 'punc'; v: string }
    | { t: 'ws' }
  )

const ERRS: [string, ErrorCode][] = [
  ['#DIV/0!', '#DIV/0!'],
  ['#VALUE!', '#VALUE!'],
  ['#REF!', '#REF!'],
  ['#NAME?', '#NAME?'],
  ['#N/A', '#N/A'],
  ['#NUM!', '#NUM!'],
  ['#NULL!', '#NULL!'],
]

const IDENT = /[\w.$\\\u00A1-\uFFFF]/
const RE_AREA = /(\$?)([A-Za-z]{1,3})(\$?)(\d+):(\$?)([A-Za-z]{1,3})(\$?)(\d+)/y
const RE_CELL = /(\$?)([A-Za-z]{1,3})(\$?)(\d+)/y
const RE_COLS = /(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})/y
const RE_ROWS = /(\$?)(\d+):(\$?)(\d+)/y
const RE_NUM = /(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/y
const PREFIXES = ['_XLFN.', '_XLWS.', '_XLUDF.']

function at(re: RegExp, s: string, i: number): RegExpExecArray | null {
  re.lastIndex = i
  return re.exec(s)
}

const isIdent = (ch: string | undefined) => ch !== undefined && IDENT.test(ch)

function row(s: string): number {
  const n = Number(s) - 1
  return n >= 0 && n <= MAX_ROW ? n : -1
}
function col(s: string): number {
  const n = colIndex(s)
  return n <= MAX_COL ? n : -1
}

/** Try to read an A1 reference (cell, area, A:B, 1:2) at i. */
export function readRef(src: string, i: number): { ref: RefAddr; end: number } | null {
  let m: RegExpExecArray | null
  let ref: RefAddr | null = null
  if ((m = at(RE_AREA, src, i))) {
    const [r0, c0, r1, c1] = [row(m[4]), col(m[2]), row(m[8]), col(m[6])]
    if (r0 >= 0 && c0 >= 0 && r1 >= 0 && c1 >= 0)
      ref = { kind: 'area', r0, c0, r1, c1, ac0: !!m[1], ar0: !!m[3], ac1: !!m[5], ar1: !!m[7] }
  }
  if (!ref && (m = at(RE_CELL, src, i))) {
    const [r, c] = [row(m[4]), col(m[2])]
    if (r >= 0 && c >= 0) ref = { kind: 'cell', r0: r, c0: c, r1: r, c1: c, ac0: !!m[1], ar0: !!m[3], ac1: !!m[1], ar1: !!m[3] }
  }
  if (!ref && (m = at(RE_COLS, src, i))) {
    const [c0, c1] = [col(m[2]), col(m[4])]
    if (c0 >= 0 && c1 >= 0) ref = { kind: 'cols', r0: 0, c0, r1: MAX_ROW, c1, ac0: !!m[1], ar0: false, ac1: !!m[3], ar1: false }
  }
  if (!ref && (m = at(RE_ROWS, src, i))) {
    const [r0, r1] = [row(m[2]), row(m[4])]
    if (r0 >= 0 && r1 >= 0) ref = { kind: 'rows', r0, c0: 0, r1, c1: MAX_COL, ac0: false, ar0: !!m[1], ac1: false, ar1: !!m[3] }
  }
  if (!ref || !m) return null
  const end = i + m[0].length
  const next = src[end]
  if (isIdent(next) || next === '(' || next === '!') return null
  return { ref: normalizeRef(ref), end }
}

function readError(src: string, i: number): [ErrorCode, number] | null {
  const up = src.slice(i, i + 7).toUpperCase()
  for (const [txt, code] of ERRS) if (up.startsWith(txt)) return [code, i + txt.length]
  return null
}

export function stripFnPrefix(name: string): string {
  let n = name.toUpperCase()
  for (let again = true; again; ) {
    again = false
    for (const p of PREFIXES)
      if (n.startsWith(p)) {
        n = n.slice(p.length)
        again = true
      }
  }
  return n
}

export function tokenize(src: string): Token[] {
  const out: Token[] = []
  const n = src.length
  let i = 0

  /** after `Sheet!` -> ref / error / scoped name */
  const afterSheet = (s: number, k: number, sheet: string, sheetText: string) => {
    if (src[k] === '#') {
      const e = readError(src, k)
      if (!e) throw new FormulaSyntaxError('bad error literal', k)
      out.push({ t: 'err', v: e[0], sheet, s, e: e[1] })
      return e[1]
    }
    const r = readRef(src, k)
    if (r) {
      r.ref.sheet = sheet
      out.push({ t: 'ref', ref: r.ref, sheetText, s, e: r.end })
      return r.end
    }
    let j = k
    while (j < n && isIdent(src[j])) j++
    if (j === k) throw new FormulaSyntaxError('expected reference after !', k)
    out.push({ t: 'name', v: src.slice(k, j), sheet, s, e: j })
    return j
  }

  while (i < n) {
    const ch = src[i]
    const s = i
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t' || ch === '\u00A0') {
      while (i < n && /[\s\u00A0]/.test(src[i])) i++
      out.push({ t: 'ws', s, e: i })
      continue
    }
    if (ch === '"') {
      let v = ''
      i++
      for (;;) {
        if (i >= n) throw new FormulaSyntaxError('unterminated string', s)
        if (src[i] === '"') {
          if (src[i + 1] === '"') {
            v += '"'
            i += 2
            continue
          }
          i++
          break
        }
        v += src[i++]
      }
      out.push({ t: 'str', v, s, e: i })
      continue
    }
    if (ch === '#') {
      const e = readError(src, i)
      if (!e) throw new FormulaSyntaxError('bad error literal', i)
      out.push({ t: 'err', v: e[0], s, e: e[1] })
      i = e[1]
      continue
    }
    if (ch === "'") {
      let name = ''
      let j = i + 1
      for (;;) {
        if (j >= n) throw new FormulaSyntaxError('unterminated sheet name', s)
        if (src[j] === "'") {
          if (src[j + 1] === "'") {
            name += "'"
            j += 2
            continue
          }
          break
        }
        name += src[j++]
      }
      if (src[j + 1] !== '!') throw new FormulaSyntaxError("expected '!' after sheet name", j + 1)
      i = afterSheet(s, j + 2, name, src.slice(i, j + 1))
      continue
    }
    if (ch === '[') {
      // external workbook prefix: [1]Sheet1!A1 (kept verbatim as part of the sheet name)
      const m = /\[\d+\][\w.\u00A1-\uFFFF]+!/y
      m.lastIndex = i
      if (!m.exec(src)) throw new FormulaSyntaxError("unexpected '['", i)
      const end = m.lastIndex - 1
      const sheet = src.slice(i, end)
      i = afterSheet(s, end + 1, sheet, sheet)
      continue
    }
    if ('(){},;'.includes(ch)) {
      out.push({ t: 'punc', v: ch, s, e: ++i })
      continue
    }
    const two = src.slice(i, i + 2)
    if (two === '<=' || two === '>=' || two === '<>') {
      out.push({ t: 'op', v: two, s, e: (i += 2) })
      continue
    }
    if ('+-*/^&=<>%:'.includes(ch)) {
      out.push({ t: 'op', v: ch, s, e: ++i })
      continue
    }
    const isDigit = ch >= '0' && ch <= '9'
    if (isDigit || (ch === '.' && /\d/.test(src[i + 1] ?? '')) || (ch === '$' && /\d/.test(src[i + 1] ?? ''))) {
      const r = readRef(src, i)
      if (r && r.ref.kind === 'rows') {
        out.push({ t: 'ref', ref: r.ref, s, e: r.end })
        i = r.end
        continue
      }
      const m = at(RE_NUM, src, i)
      if (!m || ch === '$') throw new FormulaSyntaxError('bad number', i)
      i += m[0].length
      out.push({ t: 'num', v: Number(m[0]), s, e: i })
      continue
    }
    if (isIdent(ch)) {
      let j = i
      while (j < n && isIdent(src[j])) j++
      const word = src.slice(i, j)
      if (src[j] === '!') {
        i = afterSheet(s, j + 1, word, word)
        continue
      }
      if (src[j] === '(') {
        out.push({ t: 'func', v: stripFnPrefix(word), s, e: j })
        i = j
        continue
      }
      const r = readRef(src, i)
      if (r) {
        out.push({ t: 'ref', ref: r.ref, s, e: r.end })
        i = r.end
        continue
      }
      const up = word.toUpperCase()
      if (up === 'TRUE' || up === 'FALSE') {
        out.push({ t: 'bool', v: up === 'TRUE', s, e: j })
        i = j
        continue
      }
      if (src[j] === '[') {
        // structured reference Table[...]: swallow balanced brackets
        let depth = 0
        do {
          if (src[j] === '[') depth++
          else if (src[j] === ']') depth--
          j++
        } while (j < n && depth > 0)
        if (depth > 0) throw new FormulaSyntaxError('unterminated [', i)
      }
      out.push({ t: 'name', v: src.slice(i, j), s, e: j })
      i = j
      continue
    }
    throw new FormulaSyntaxError(`unexpected character '${ch}'`, i)
  }
  return out
}

/** Parse a plain reference string (INDIRECT): `A1`, `Sheet1!A1:B2`, `'x y'!C:C`, `3:3`. */
export function parseRefText(text: string): RefAddr | null {
  let toks: Token[]
  try {
    toks = tokenize(text.trim()).filter((t) => t.t !== 'ws')
  } catch {
    return null
  }
  const a = toks[0]
  if (!a || a.t !== 'ref') return null
  if (toks.length === 1) return a.ref
  const op = toks[1]
  const b = toks[2]
  if (toks.length !== 3 || op.t !== 'op' || op.v !== ':' || b.t !== 'ref') return null
  if (b.ref.sheet !== undefined && (a.ref.sheet ?? '').toLowerCase() !== b.ref.sheet.toLowerCase()) return null
  return normalizeRef({
    ...a.ref,
    kind: 'area',
    r0: Math.min(a.ref.r0, b.ref.r0),
    c0: Math.min(a.ref.c0, b.ref.c0),
    r1: Math.max(a.ref.r1, b.ref.r1),
    c1: Math.max(a.ref.c1, b.ref.c1),
  })
}
