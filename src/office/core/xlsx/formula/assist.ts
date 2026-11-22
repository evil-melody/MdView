/**
 * Editing helpers for a formula being typed (text starting with '='): tolerant tokenizing,
 * caret context (word to autocomplete, enclosing call, whether a reference can be pointed in),
 * reference spans for highlighting and paren auto-closing. Pure / UI independent.
 */
import { FormulaSyntaxError, tokenize, type Token } from './lexer'
import { colName, quoteSheet, type RefAddr } from './refs'
import { MAX_COL, MAX_ROW } from './types'

export interface FormulaRef {
  /** span in the full text (including the leading '=') */
  s: number
  e: number
  text: string
  ref: RefAddr
}

export interface FormulaContext {
  /** identifier right before the caret (to autocomplete); span in the full text */
  word?: { s: number; e: number; text: string; call: boolean }
  /** innermost function call around the caret; arg is 0-based */
  call?: { name: string; arg: number }
  /** a reference can be inserted at the caret */
  pointable: boolean
  refs: FormulaRef[]
}

interface Scan {
  toks: Token[]
  /** offset (in src) where tokenizing failed, the rest is unknown */
  tail: number
  /** the failure was an unterminated string */
  openString: boolean
}

function scan(src: string): Scan {
  try {
    return { toks: tokenize(src), tail: src.length, openString: false }
  } catch (e) {
    if (!(e instanceof FormulaSyntaxError)) return { toks: [], tail: 0, openString: false }
    const pos = Math.max(0, Math.min(e.pos, src.length))
    const head = pos > 0 ? scan(src.slice(0, pos)) : { toks: [], tail: 0, openString: false }
    if (head.tail < pos) return head
    return { toks: head.toks, tail: pos, openString: e.message === 'unterminated string' }
  }
}

export const isFormula = (text: string) => text.startsWith('=') && text.length > 0

const POINT_BEFORE = new Set(['(', ',', ';', '{'])
const POINT_AFTER = new Set([')', ',', ';', '}'])

/** Context of the caret inside formula `text` (full cell text, starting with '='). */
export function formulaContext(text: string, caret: number): FormulaContext {
  const out: FormulaContext = { pointable: false, refs: [] }
  if (!isFormula(text)) return out
  const src = text.slice(1)
  const q = caret - 1
  const { toks, tail } = scan(src)
  for (const t of toks) if (t.t === 'ref') out.refs.push({ s: t.s + 1, e: t.e + 1, text: src.slice(t.s, t.e), ref: t.ref })
  if (q < 0) return out
  /** caret inside an unterminated string / unparseable tail */
  const lost = q > tail

  // enclosing calls
  const stack: { name: string; arg: number }[] = []
  let prev: Token | undefined
  let inside: Token | undefined
  let next: Token | undefined
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (t.e <= q) {
      if (t.t === 'punc') {
        if (t.v === '(') stack.push({ name: toks[i - 1]?.t === 'func' && toks[i - 1].e === t.s ? (toks[i - 1] as { v: string }).v : '', arg: 0 })
        else if (t.v === '{') stack.push({ name: '', arg: 0 })
        else if (t.v === ')' || t.v === '}') stack.pop()
        else if ((t.v === ',' || t.v === ';') && stack.length) stack[stack.length - 1].arg++
      }
      if (t.t !== 'ws') prev = t
    } else if (t.s < q) inside = t
    else if (!next && t.t !== 'ws') next = t
  }
  for (let i = stack.length - 1; i >= 0; i--)
    if (stack[i].name) {
      out.call = stack[i]
      break
    }
  if (lost) return out

  // word to autocomplete: identifier ending at the caret
  const wordTok = inside ?? (prev && prev.e === q ? prev : undefined)
  if (wordTok && (wordTok.t === 'name' || wordTok.t === 'func' || wordTok.t === 'ref' || wordTok.t === 'bool')) {
    const typed = src.slice(wordTok.s, q)
    const sheetPrefixed = (wordTok.t === 'ref' && wordTok.ref.sheet !== undefined) || (wordTok.t === 'name' && wordTok.sheet !== undefined)
    if (!sheetPrefixed && /^[A-Za-z_][A-Za-z0-9_.]*$/.test(typed)) {
      const callTok = wordTok.t === 'func' || src[wordTok.e] === '('
      out.word = { s: wordTok.s + 1, e: wordTok.e + 1, text: typed, call: callTok }
    }
  }

  // point mode: caret between tokens, after an operator / separator, before an end
  if (!inside) {
    const okBefore = !prev || (prev.t === 'punc' && POINT_BEFORE.has(prev.v)) || (prev.t === 'op' && prev.v !== '%')
    const okAfter = !next || (next.t === 'punc' && POINT_AFTER.has(next.v)) || (next.t === 'op' && next.v !== ':')
    out.pointable = okBefore && okAfter
  }
  return out
}

/** Reference text for a selected block (`A1`, `A1:B3`, `A:A`, `1:1`), sheet-qualified when `sheet` is given. */
export function rangeText(r0: number, c0: number, r1: number, c1: number, sheet?: string): string {
  const pre = sheet !== undefined ? quoteSheet(sheet) + '!' : ''
  if (r0 > r1) [r0, r1] = [r1, r0]
  if (c0 > c1) [c0, c1] = [c1, c0]
  if (r0 === 0 && r1 >= MAX_ROW) return `${pre}${colName(c0)}:${colName(c1)}`
  if (c0 === 0 && c1 >= MAX_COL) return `${pre}${r0 + 1}:${r1 + 1}`
  const a = `${colName(c0)}${r0 + 1}`
  return r0 === r1 && c0 === c1 ? pre + a : `${pre}${a}:${colName(c1)}${r1 + 1}`
}

/**
 * What Excel does on Enter: upper-cases function names, references and booleans,
 * closes an unterminated string and open parentheses.
 */
export function closeFormula(text: string): string {
  if (!isFormula(text)) return text
  const src = text.slice(1)
  const { toks, tail, openString } = scan(src)
  if (tail < src.length && !openString) return text
  let depth = 0
  let out = ''
  let at = 0
  for (const t of toks) {
    if (t.t === 'func' || t.t === 'bool' || (t.t === 'ref' && t.ref.sheet === undefined)) {
      out += src.slice(at, t.s) + src.slice(t.s, t.e).toUpperCase()
      at = t.e
    } else if (t.t === 'ref') {
      const bang = src.lastIndexOf('!', t.e)
      out += src.slice(at, bang + 1) + src.slice(bang + 1, t.e).toUpperCase()
      at = t.e
    }
    if (t.t !== 'punc') continue
    if (t.v === '(') depth++
    else if (t.v === ')') depth = Math.max(0, depth - 1)
  }
  out += src.slice(at)
  return '=' + out + (openString ? '"' : '') + ')'.repeat(depth)
}
