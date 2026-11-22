/**
 * BIFF formulas: the parsed token stream (Ptgs in reverse Polish order, [MS-XLS] 2.5.198) → Excel formula text
 * (no leading "="), as an XLSX cell, shared formula or defined name holds it. Throws `Unsupported` for what an XLSX
 * formula cannot hold (references into other workbooks, macro functions, data tables): the cell keeps its value.
 */
import { colName } from '../../xlsx/workbook'
import { ERRORS, latin1, utf16 } from './biff'
import { FUNCS } from './ftab'

export class Unsupported extends Error {}

export interface FormulaEnv {
  biff: 5 | 8
  /** BIFF8: the sheet prefix ("Sheet1!", "'A b'!", "S1:S3!") of an EXTERNSHEET entry, '' for the workbook, null for a deleted sheet */
  sheetRef(ixti: number): string | null
  /** BIFF5: the sheet prefix of a 3D reference (own workbook when ixals < 0) */
  sheetRef5(ixals: number, first: number, last: number): string | null
  /** a defined name by its 1-based index, seen from sheet `sheet` */
  name(index: number, sheet: number): string
  /** BIFF8: an external (add-in) name */
  nameX(ixti: number, index: number): string
  /** 8-bit text in the workbook's code page (BIFF5) */
  text8(b: Uint8Array): string
}

/** Excel 2007 functions that an .xls file stores as "_xlfn." names and an XLSX file by their own name */
const XLFN_2007 = new Set(['IFERROR', 'SUMIFS', 'COUNTIFS', 'AVERAGEIF', 'AVERAGEIFS'])

const BINARY: Record<number, string> = { 0x03: '+', 0x04: '-', 0x05: '*', 0x06: '/', 0x07: '^', 0x08: '&', 0x09: '<', 0x0a: '<=', 0x0b: '=', 0x0c: '>=', 0x0d: '>', 0x0e: '<>', 0x0f: ' ', 0x10: ',', 0x11: ':' }

/** a sheet name as a formula writes it: quoted when it is not a plain name */
export function quoteSheet(name: string): string {
  if (/^[A-Za-z_À-￿][\w.À-￿]*$/.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) && !/^R\d*C?\d*$/i.test(name) && !/^(TRUE|FALSE)$/i.test(name)) return name
  return `'${name.replace(/'/g, "''")}'`
}

/** a number as formula text */
export function numText(v: number): string {
  if (!Number.isFinite(v)) return '#NUM!'
  return String(v).toUpperCase()
}

const strText = (s: string) => `"${s.replace(/"/g, '""')}"`

class Reader {
  pos = 0
  constructor(private b: Uint8Array) {}
  get more() {
    return this.pos < this.b.length
  }
  need(n: number) {
    if (this.pos + n > this.b.length) throw new Unsupported('Formula ends early')
  }
  u8() {
    this.need(1)
    return this.b[this.pos++]
  }
  u16() {
    this.need(2)
    const v = this.b[this.pos] | (this.b[this.pos + 1] << 8)
    this.pos += 2
    return v
  }
  i16() {
    const v = this.u16()
    return v & 0x8000 ? v - 0x10000 : v
  }
  f64() {
    this.need(8)
    const v = new DataView(this.b.buffer, this.b.byteOffset + this.pos, 8).getFloat64(0, true)
    this.pos += 8
    return v
  }
  skip(n: number) {
    this.need(n)
    this.pos += n
  }
  chars(n: number, high: boolean) {
    this.need(n * (high ? 2 : 1))
    const s = high ? utf16(this.b, this.pos, n) : latin1(this.b, this.pos, n)
    this.pos += n * (high ? 2 : 1)
    return s
  }
  bytes(n: number) {
    this.need(n)
    this.pos += n
    return this.b.subarray(this.pos - n, this.pos)
  }
}

/**
 * The text of a formula. `r`, `c`: the cell it is in (the base of relative references in shared formulas and names);
 * `rel`: 3D references are relative to it too (shared formulas, names). `sheet`: the formula's sheet (-1 for global names).
 */
export function formulaText(env: FormulaEnv, rgce: Uint8Array, extra: Uint8Array | undefined, r: number, c: number, rel: boolean, sheet: number): string {
  const b8 = env.biff === 8
  const rd = new Reader(rgce)
  const ex = new Reader(extra ?? new Uint8Array(0))
  const st: string[] = []
  const pop = () => {
    const v = st.pop()
    if (v === undefined) throw new Unsupported('Formula stack underflow')
    return v
  }
  const maxRow = b8 ? 0xffff : 0x3fff

  /** a cell reference; `relative`: relative parts are offsets from the base cell */
  const cell = (rw: number, col: number, rwRel: boolean, colRel: boolean, relative: boolean) => {
    if (relative && rwRel) rw = (r + rw) & maxRow
    if (relative && colRel) col = (c + (col & 0xff)) & 0xff
    return `${colRel ? '' : '$'}${colName(col)}${rwRel ? '' : '$'}${rw + 1}`
  }
  const area = (r1: number, r2: number, c1: number, c2: number, f1: number, f2: number, relative: boolean) => {
    // f: bits 14-15 of the column (BIFF8) or row (BIFF5) field: bit 0 column relative, bit 1 row relative
    const rr1 = !!(f1 & 2)
    const rr2 = !!(f2 & 2)
    const cr1 = !!(f1 & 1)
    const cr2 = !!(f2 & 1)
    if (relative) {
      if (rr1) r1 = (r + r1) & maxRow
      if (rr2) r2 = (r + r2) & maxRow
      if (cr1) c1 = (c + (c1 & 0xff)) & 0xff
      if (cr2) c2 = (c + (c2 & 0xff)) & 0xff
    }
    // whole columns / rows (the BIFF grid is 65,536 × 256)
    if (r1 === 0 && r2 === maxRow) return `${cr1 ? '' : '$'}${colName(c1)}:${cr2 ? '' : '$'}${colName(c2)}`
    if (c1 === 0 && c2 === 0xff) return `${rr1 ? '' : '$'}${r1 + 1}:${rr2 ? '' : '$'}${r2 + 1}`
    return `${cell(r1, c1, rr1, cr1, false)}:${cell(r2, c2, rr2, cr2, false)}`
  }
  /** BIFF8 RgceLoc / BIFF5 row with flags + 8-bit column */
  const readRef = (relative: boolean) => {
    if (b8) {
      const rw = rd.u16()
      const col = rd.u16()
      return cell(rw, col & 0x3fff, !!(col & 0x8000), !!(col & 0x4000), relative)
    }
    const rw = rd.u16()
    const col = rd.u8()
    return cell(rw & 0x3fff, col, !!(rw & 0x8000), !!(rw & 0x4000), relative)
  }
  const readArea = (relative: boolean) => {
    if (b8) {
      const r1 = rd.u16()
      const r2 = rd.u16()
      const c1 = rd.u16()
      const c2 = rd.u16()
      return area(r1, r2, c1 & 0x3fff, c2 & 0x3fff, (c1 >> 14) & 3, (c2 >> 14) & 3, relative)
    }
    const r1 = rd.u16()
    const r2 = rd.u16()
    const c1 = rd.u8()
    const c2 = rd.u8()
    return area(r1 & 0x3fff, r2 & 0x3fff, c1, c2, (r1 >> 14) & 3, (r2 >> 14) & 3, relative)
  }
  /** BIFF5 3D header: the sheet prefix */
  const sheet5 = () => {
    const ixals = rd.i16()
    rd.skip(8)
    const first = rd.u16()
    const last = rd.u16()
    return env.sheetRef5(ixals, first, last)
  }
  const arrayConst = () => {
    const cols = ex.u8() + 1
    const rows = ex.u16() + 1
    if (cols * rows > 65536) throw new Unsupported('Array constant too large')
    const lines: string[] = []
    for (let i = 0; i < rows; i++) {
      const vals: string[] = []
      for (let j = 0; j < cols; j++) {
        const t = ex.u8()
        if (t === 0x01) vals.push(numText(ex.f64()))
        else if (t === 0x02) {
          if (b8) {
            const n = ex.u16()
            vals.push(strText(ex.chars(n, (ex.u8() & 1) === 1)))
          } else vals.push(strText(env.text8(ex.bytes(ex.u8()))))
        } else if (t === 0x04) {
          vals.push(ex.u8() ? 'TRUE' : 'FALSE')
          ex.skip(7)
        } else if (t === 0x10) {
          vals.push(ERRORS[ex.u8()] ?? '#N/A')
          ex.skip(7)
        } else {
          ex.skip(8)
          vals.push('0')
        }
      }
      lines.push(vals.join(','))
    }
    return `{${lines.join(';')}}`
  }
  const call = (name: string, argc: number) => {
    if (argc > st.length) throw new Unsupported('Formula stack underflow')
    const args = st.splice(st.length - argc, argc)
    st.push(`${name}(${args.join(',')})`)
  }

  while (rd.more) {
    const ptg = rd.u8()
    const id = ptg < 0x20 ? ptg : (ptg & 0x1f) | 0x20
    switch (id) {
      case 0x01:
      case 0x02:
        throw new Unsupported(id === 1 ? 'Shared formula' : 'Data table')
      case 0x03: case 0x04: case 0x05: case 0x06: case 0x07: case 0x08: case 0x09: case 0x0a:
      case 0x0b: case 0x0c: case 0x0d: case 0x0e: case 0x0f: case 0x10: case 0x11: {
        const b = pop()
        const a = pop()
        st.push(a + BINARY[id] + b)
        break
      }
      case 0x12:
        st.push('+' + pop())
        break
      case 0x13:
        st.push('-' + pop())
        break
      case 0x14:
        st.push(pop() + '%')
        break
      case 0x15:
        st.push(`(${pop()})`)
        break
      case 0x16:
        st.push('')
        break
      case 0x17: {
        const n = rd.u8()
        st.push(strText(b8 ? rd.chars(n, (rd.u8() & 1) === 1) : env.text8(rd.bytes(n))))
        break
      }
      case 0x19: {
        const grbit = rd.u8()
        const data = rd.u16()
        // CHOOSE: a jump table follows
        if (grbit & 0x04) rd.skip((data + 1) * 2)
        // SUM of one argument
        if (grbit & 0x10) st.push(`SUM(${pop()})`)
        // IF / GOTO / volatile / spaces: no text of their own
        break
      }
      case 0x1c:
        st.push(ERRORS[rd.u8()] ?? '#N/A')
        break
      case 0x1d:
        st.push(rd.u8() ? 'TRUE' : 'FALSE')
        break
      case 0x1e:
        st.push(String(rd.u16()))
        break
      case 0x1f:
        st.push(numText(rd.f64()))
        break
      case 0x20:
        rd.skip(7)
        st.push(arrayConst())
        break
      case 0x21: {
        const f = FUNCS[rd.u16()]
        if (!f?.[0] || f[1] < 0) throw new Unsupported('Unknown function')
        call(f[0], f[1])
        break
      }
      case 0x22: {
        const argc = rd.u8() & 0x7f
        const tab = rd.u16()
        if (tab & 0x8000) throw new Unsupported('Macro command')
        if (tab === 255) {
          // a user-defined / add-in function: its name is the first argument
          if (argc < 1 || argc > st.length) throw new Unsupported('Formula stack underflow')
          const args = st.splice(st.length - argc, argc)
          let name = args.shift()!
          if (/^_xlfn\./i.test(name) && XLFN_2007.has(name.slice(6).toUpperCase())) name = name.slice(6)
          st.push(`${name}(${args.join(',')})`)
        } else {
          const f = FUNCS[tab]
          if (!f?.[0]) throw new Unsupported('Unknown function')
          call(f[0], argc)
        }
        break
      }
      case 0x23: {
        const idx = rd.u16()
        rd.skip(b8 ? 2 : 12)
        st.push(env.name(idx, sheet))
        break
      }
      case 0x24:
        st.push(readRef(false))
        break
      case 0x25:
        st.push(readArea(false))
        break
      case 0x26: {
        rd.skip(6)
        // the areas of a PtgMemArea in the extra data
        const n = ex.u16()
        ex.skip(n * (b8 ? 8 : 6))
        break
      }
      case 0x27:
      case 0x28:
        rd.skip(6)
        break
      case 0x29:
        rd.skip(2)
        break
      case 0x2a:
        rd.skip(b8 ? 4 : 3)
        st.push('#REF!')
        break
      case 0x2b:
        rd.skip(b8 ? 8 : 6)
        st.push('#REF!')
        break
      case 0x2c:
        st.push(readRef(true))
        break
      case 0x2d:
        st.push(readArea(true))
        break
      case 0x39: {
        if (!b8) throw new Unsupported('External name')
        const ixti = rd.u16()
        const idx = rd.u16()
        rd.skip(2)
        st.push(env.nameX(ixti, idx))
        break
      }
      case 0x3a: {
        const p = b8 ? env.sheetRef(rd.u16()) : sheet5()
        const ref = readRef(rel)
        st.push(p === null ? '#REF!' : p + ref)
        break
      }
      case 0x3b: {
        const p = b8 ? env.sheetRef(rd.u16()) : sheet5()
        const ref = readArea(rel)
        st.push(p === null ? '#REF!' : p + ref)
        break
      }
      case 0x3c:
      case 0x3d: {
        const p = b8 ? env.sheetRef(rd.u16()) : sheet5()
        rd.skip(b8 ? (id === 0x3c ? 4 : 8) : id === 0x3c ? 3 : 6)
        st.push(p ? p + '#REF!' : '#REF!')
        break
      }
      default:
        throw new Unsupported(`Formula token 0x${ptg.toString(16)}`)
    }
  }
  if (st.length !== 1) throw new Unsupported('Malformed formula')
  return st[0]
}
