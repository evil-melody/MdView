/** Core value / reference / provider types of the formula engine. */

export type ErrorCode = '#DIV/0!' | '#VALUE!' | '#REF!' | '#NAME?' | '#N/A' | '#NUM!' | '#NULL!'

/** ERROR.TYPE order (1-based). */
export const ERROR_CODES: readonly ErrorCode[] = ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A']

export class FormulaError {
  constructor(readonly code: ErrorCode) {}
  toString(): string {
    return this.code
  }
}

/** null = empty cell */
export type Value = number | string | boolean | FormulaError | null

/** 0-based cell reference. */
export interface CellRef {
  sheet?: string
  r: number
  c: number
  absR: boolean
  absC: boolean
}

/** 0-based inclusive range. Whole column A:A => r0=0, r1=MAX_ROW; whole row 1:1 => c0=0, c1=MAX_COL. */
export interface RangeRef {
  sheet?: string
  r0: number
  c0: number
  r1: number
  c1: number
}

export interface CellProvider {
  /** value of a cell; formula cells return their current computed value */
  value(sheet: string | undefined, r: number, c: number): Value
  /** used extent of a sheet, to clip whole-row/column ranges (optional) */
  bounds?(sheet: string | undefined): { rows: number; cols: number }
  /** sheet exists? (unknown sheet -> #REF!) optional */
  hasSheet?(name: string): boolean
  date1904?: boolean
  now?(): Date
}

export interface EvalContext {
  provider: CellProvider
  /** sheet the formula lives on (unqualified refs resolve here) */
  sheet?: string
  /** 0-based position of the formula cell */
  r: number
  c: number
}

export const MAX_ROW = 1048575
export const MAX_COL = 16383

export const ERR = {
  DIV0: new FormulaError('#DIV/0!'),
  VALUE: new FormulaError('#VALUE!'),
  REF: new FormulaError('#REF!'),
  NAME: new FormulaError('#NAME?'),
  NA: new FormulaError('#N/A'),
  NUM: new FormulaError('#NUM!'),
  NULL: new FormulaError('#NULL!'),
} as const
