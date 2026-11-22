/** Recursive-descent parser with Excel precedence: `:` > unary +/- > % > ^ > * / > + - > & > comparisons. */
import { FormulaSyntaxError, tokenize, type Token } from './lexer'
import type { RefAddr } from './refs'
import type { ErrorCode, Value } from './types'
import { FormulaError } from './types'

export type BinOp = '+' | '-' | '*' | '/' | '^' | '&' | '=' | '<>' | '<' | '>' | '<=' | '>='

export type Ast =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'err'; code: ErrorCode }
  | { type: 'missing' }
  | { type: 'ref'; ref: RefAddr }
  | { type: 'name'; name: string; sheet?: string }
  | { type: 'array'; rows: Value[][] }
  | { type: 'unary'; op: '-' | '+'; arg: Ast }
  | { type: 'percent'; arg: Ast }
  | { type: 'binary'; op: BinOp; left: Ast; right: Ast }
  | { type: 'range'; left: Ast; right: Ast }
  | { type: 'union'; items: Ast[] }
  | { type: 'call'; name: string; args: Ast[] }

const CMP = new Set(['=', '<>', '<', '>', '<=', '>='])

class Parser {
  i = 0
  constructor(private readonly toks: Token[]) {}

  private peek(): Token | undefined {
    return this.toks[this.i]
  }
  private isOp(...ops: string[]): string | undefined {
    const t = this.toks[this.i]
    return t && t.t === 'op' && ops.includes(t.v) ? t.v : undefined
  }
  private isPunc(p: string): boolean {
    const t = this.toks[this.i]
    return !!t && t.t === 'punc' && t.v === p
  }
  private fail(msg: string): never {
    const t = this.toks[this.i]
    throw new FormulaSyntaxError(msg, t ? t.s : -1)
  }
  private expectPunc(p: string): void {
    if (!this.isPunc(p)) this.fail(`expected '${p}'`)
    this.i++
  }

  expr(): Ast {
    let l = this.concat()
    for (let op = this.cmpOp(); op; op = this.cmpOp()) {
      this.i++
      l = { type: 'binary', op: op as BinOp, left: l, right: this.concat() }
    }
    return l
  }
  private cmpOp(): string | undefined {
    const t = this.peek()
    return t && t.t === 'op' && CMP.has(t.v) ? t.v : undefined
  }
  private concat(): Ast {
    let l = this.add()
    while (this.isOp('&')) {
      this.i++
      l = { type: 'binary', op: '&', left: l, right: this.add() }
    }
    return l
  }
  private add(): Ast {
    let l = this.mul()
    for (let op = this.isOp('+', '-'); op; op = this.isOp('+', '-')) {
      this.i++
      l = { type: 'binary', op: op as BinOp, left: l, right: this.mul() }
    }
    return l
  }
  private mul(): Ast {
    let l = this.pow()
    for (let op = this.isOp('*', '/'); op; op = this.isOp('*', '/')) {
      this.i++
      l = { type: 'binary', op: op as BinOp, left: l, right: this.pow() }
    }
    return l
  }
  private pow(): Ast {
    let l = this.postfix()
    while (this.isOp('^')) {
      this.i++
      l = { type: 'binary', op: '^', left: l, right: this.postfix() }
    }
    return l
  }
  private postfix(): Ast {
    let x = this.unary()
    while (this.isOp('%')) {
      this.i++
      x = { type: 'percent', arg: x }
    }
    return x
  }
  private unary(): Ast {
    const op = this.isOp('-', '+')
    if (op) {
      this.i++
      return { type: 'unary', op: op as '-' | '+', arg: this.unary() }
    }
    return this.range()
  }
  private range(): Ast {
    let l = this.primary()
    while (this.isOp(':')) {
      this.i++
      l = { type: 'range', left: l, right: this.primary() }
    }
    return l
  }

  private primary(): Ast {
    const t = this.peek()
    if (!t) this.fail('unexpected end of formula')
    this.i++
    switch (t.t) {
      case 'num':
        return { type: 'num', value: t.v }
      case 'str':
        return { type: 'str', value: t.v }
      case 'bool':
        return { type: 'bool', value: t.v }
      case 'err':
        return { type: 'err', code: t.v }
      case 'ref':
        return { type: 'ref', ref: t.ref }
      case 'name':
        return t.sheet === undefined ? { type: 'name', name: t.v } : { type: 'name', name: t.v, sheet: t.sheet }
      case 'func': {
        this.expectPunc('(')
        return { type: 'call', name: t.v, args: this.args() }
      }
      case 'punc':
        if (t.v === '(') {
          const first = this.expr()
          if (!this.isPunc(',')) {
            this.expectPunc(')')
            return first
          }
          const items = [first]
          while (this.isPunc(',')) {
            this.i++
            items.push(this.expr())
          }
          this.expectPunc(')')
          return { type: 'union', items }
        }
        if (t.v === '{') return this.array()
    }
    this.i--
    return this.fail('unexpected token')
  }

  private args(): Ast[] {
    const args: Ast[] = []
    if (this.isPunc(')')) {
      this.i++
      return args
    }
    for (;;) {
      args.push(this.isPunc(',') || this.isPunc(')') ? { type: 'missing' } : this.expr())
      if (this.isPunc(')')) {
        this.i++
        return args
      }
      this.expectPunc(',')
    }
  }

  private array(): Ast {
    const rows: Value[][] = [[]]
    for (;;) {
      rows[rows.length - 1].push(this.arrayItem())
      const t = this.peek()
      if (!t || t.t !== 'punc') this.fail('bad array constant')
      this.i++
      if (t.v === '}') break
      if (t.v === ';') rows.push([])
      else if (t.v !== ',') this.fail('bad array constant')
    }
    if (rows.some((r) => r.length !== rows[0].length)) this.fail('array rows differ in length')
    return { type: 'array', rows }
  }
  private arrayItem(): Value {
    const sign = this.isOp('-', '+')
    if (sign) this.i++
    const t = this.peek()
    if (!t) this.fail('bad array constant')
    this.i++
    if (t.t === 'num') return sign === '-' ? -t.v : t.v
    if (sign) this.fail('bad array constant')
    if (t.t === 'str' || t.t === 'bool') return t.v
    if (t.t === 'err') return new FormulaError(t.v)
    this.i--
    return this.fail('bad array constant')
  }
}

/** Parse formula text (OOXML stored form, without '='; a leading '=' is tolerated). Throws FormulaSyntaxError. */
export function parseFormula(text: string): Ast {
  const src = text.startsWith('=') ? text.slice(1) : text
  const toks = tokenize(src).filter((t) => t.t !== 'ws')
  if (!toks.length) throw new FormulaSyntaxError('empty formula', 0)
  const p = new Parser(toks)
  const ast = p.expr()
  if (p.i < toks.length) throw new FormulaSyntaxError('unexpected token', toks[p.i].s)
  return ast
}
