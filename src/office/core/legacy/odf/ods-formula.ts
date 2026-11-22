/**
 * OpenFormula (ODF 1.2+ "of:", OpenOffice 1.x/2.x "oooc:") → Excel formula syntax as stored in XLSX (no "=").
 * References: `[.A1]` → A1, `[$Sheet2.A1:.B2]` → Sheet2!A1:B2 (quoted when needed), `[Sheet1.A1:Sheet3.B2]` → 3D;
 * separators `;` → `,`, inline arrays `{1;2|3;4}` → `{1,2;3,4}`, union `~` → `,`, intersection `!` → space;
 * function names: the ODF namespaced ones (COM.MICROSOFT.…, LEGACY.…) lose their prefix, and Excel 2010+
 * functions get the `_xlfn.` prefix Excel stores them with.
 */

/** Excel 2010+ functions: stored with `_xlfn.` (or `_xlfn._xlws.`) in XLSX */
const XLFN = new Set(
  (
    'ACOT ACOTH AGGREGATE ARABIC BASE BETA.DIST BETA.INV BINOM.DIST BINOM.DIST.RANGE BINOM.INV BITAND BITLSHIFT BITOR ' +
    'BITRSHIFT BITXOR BYCOL BYROW CEILING.MATH CEILING.PRECISE CHISQ.DIST CHISQ.DIST.RT CHISQ.INV CHISQ.INV.RT CHISQ.TEST ' +
    'CHOOSECOLS CHOOSEROWS COMBINA CONCAT CONFIDENCE.NORM CONFIDENCE.T COT COTH COVARIANCE.P COVARIANCE.S CSC CSCH DAYS ' +
    'DECIMAL DROP ERF.PRECISE ERFC.PRECISE EXPAND EXPON.DIST F.DIST F.DIST.RT F.INV F.INV.RT F.TEST FLOOR.MATH FLOOR.PRECISE ' +
    'FORECAST.LINEAR FORMULATEXT GAMMA GAMMA.DIST GAMMA.INV GAMMALN.PRECISE GAUSS HSTACK HYPGEOM.DIST IFNA IFS IMCOSH IMCOT ' +
    'IMCSC IMCSCH IMSEC IMSECH IMSINH IMTAN ISFORMULA ISOWEEKNUM LAMBDA LET LOGNORM.DIST LOGNORM.INV MAKEARRAY MAP MAXIFS ' +
    'MINIFS MODE.MULT MODE.SNGL NEGBINOM.DIST NETWORKDAYS.INTL NORM.DIST NORM.INV NORM.S.DIST NORM.S.INV NUMBERVALUE PDURATION ' +
    'PERCENTILE.EXC PERCENTILE.INC PERCENTRANK.EXC PERCENTRANK.INC PERMUTATIONA PHI POISSON.DIST QUARTILE.EXC QUARTILE.INC ' +
    'RANDARRAY RANK.AVG RANK.EQ REDUCE RRI SCAN SEC SECH SEQUENCE SHEET SHEETS SKEW.P STDEV.P STDEV.S SWITCH T.DIST T.DIST.2T ' +
    'T.DIST.RT T.INV T.INV.2T T.TEST TAKE TEXTAFTER TEXTBEFORE TEXTJOIN TEXTSPLIT TOCOL TOROW UNICHAR UNICODE VAR.P VAR.S ' +
    'VSTACK WEIBULL.DIST WORKDAY.INTL WRAPCOLS WRAPROWS XLOOKUP XMATCH XOR Z.TEST'
  ).split(' '),
)
/** dynamic array functions: `_xlfn._xlws.` */
const XLWS = new Set(['FILTER', 'SORT', 'SORTBY', 'UNIQUE'])

/** ODF names that differ from Excel's */
const RENAME: Record<string, string> = {
  CEILING: 'CEILING.MATH',
  FLOOR: 'FLOOR.MATH',
  FORMULA: 'FORMULATEXT',
  'ISO.CEILING': 'ISO.CEILING',
  'ERROR.TYPE': 'ERROR.TYPE',
}

/** Excel's name of an ODF function name, with the prefix XLSX stores it with */
export function excelFunction(name: string): string {
  let n = name.toUpperCase()
  if (n.startsWith('COM.MICROSOFT.')) n = n.slice(14)
  else if (n.startsWith('LEGACY.')) n = n.slice(7)
  else if (n.startsWith('COM.SUN.STAR.SHEET.ADDIN.ANALYSIS.GET')) n = n.slice(37)
  else n = RENAME[n] ?? n
  if (XLWS.has(n)) return `_xlfn._xlws.${n}`
  // and functions Excel does not have (ORG.OPENOFFICE.…) the way it keeps those it does not know
  if (XLFN.has(n) || n.startsWith('ORG.') || n.startsWith('COM.')) return `_xlfn.${n}`
  return n
}

/** a sheet name as a formula writes it: quoted unless a plain word that isn't a cell reference */
export function quoteSheet(name: string): string {
  if (/^[A-Za-z_\u00c0-\uffff][\w.\u00c0-\uffff]*$/.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) && !/^R\d*C\d*$/i.test(name)) return name
  return `'${name.replace(/'/g, "''")}'`
}

interface Endpoint {
  sheet?: string
  cell: string
  bad: boolean
}

/** one side of a reference: [$]['Sheet'|Sheet].[$]A[$]1 */
function endpoint(s: string): Endpoint | null {
  let i = 0
  let sheet: string | undefined
  if (s.startsWith("'") && s.includes("'#")) return null // another document
  if (s[i] === '$') i++
  if (s[i] === "'") {
    let name = ''
    let j = i + 1
    for (; j < s.length; j++) {
      if (s[j] === "'") {
        if (s[j + 1] === "'") {
          name += "'"
          j++
        } else break
      } else name += s[j]
    }
    sheet = name
    i = j + 1
  } else {
    const dot = s.lastIndexOf('.')
    if (dot > i) {
      sheet = s.slice(i, dot)
      i = dot
    } else if (dot < 0) i = 0
  }
  if (s[i] === '.') i++
  else if (sheet !== undefined) return null
  const cell = s.slice(i)
  if (/#REF!/i.test(cell) || /#REF!/i.test(sheet ?? '')) return { sheet, cell: '#REF!', bad: true }
  const m = /^(\$?[A-Za-z]{1,3})?(\$?\d{1,7})?$/.exec(cell)
  if (!m || (!m[1] && !m[2])) return null
  return { sheet: sheet && sheet.startsWith('$') ? sheet.slice(1) : sheet, cell: cell.toUpperCase(), bad: false }
}

/** splits at top-level colons (not inside quotes) */
function splitRange(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (const ch of s) {
    if (ch === "'") q = !q
    if (ch === ':' && !q) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

/**
 * An ODF reference (the inside of `[…]`, or a cell-range-address) in Excel syntax; `sheetName` maps the sheet
 * names (renamed for Excel). '#REF!' when it cannot be (another document, deleted).
 */
export function excelRef(ref: string, sheetName: (s: string) => string = (s) => s): string {
  const parts = splitRange(ref.trim())
  if (parts.length > 2) return '#REF!'
  const ends = parts.map(endpoint)
  if (ends.some((e) => !e || e.bad)) return '#REF!'
  const [a, b] = ends as Endpoint[]
  const s1 = a.sheet !== undefined ? sheetName(a.sheet) : undefined
  const s2 = b?.sheet !== undefined ? sheetName(b.sheet) : undefined
  if (!b) return s1 !== undefined ? `${quoteSheet(s1)}!${a.cell}` : a.cell
  if (s1 !== undefined && s2 !== undefined && s2 !== s1) {
    const q = quoteSheet(`${s1}:${s2}`)
    const plain = quoteSheet(s1) === s1 && quoteSheet(s2) === s2
    return `${plain ? `${s1}:${s2}` : q}!${a.cell}:${b.cell}`
  }
  return s1 !== undefined ? `${quoteSheet(s1)}!${a.cell}:${b.cell}` : `${a.cell}:${b.cell}`
}

const ERRORS = ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#GETTING_DATA']

/**
 * An OpenFormula formula in Excel syntax (no leading "="); undefined when it isn't one we can read.
 * `sheetName` maps sheet names (some are renamed to fit Excel's rules).
 */
export function excelFormula(src: string, sheetName?: (s: string) => string): string | undefined {
  let f = src.trim()
  const ns = /^([a-z][\w-]*):(?==)/i.exec(f)
  if (ns) {
    const p = ns[1].toLowerCase()
    f = f.slice(ns[0].length)
    // Excel syntax already
    if (p === 'msoxl') return f.replace(/^=/, '')
    if (p !== 'of' && p !== 'oooc' && p !== 'ooow') return undefined
  }
  if (!f.startsWith('=')) return undefined
  f = f.slice(1)
  let out = ''
  let array = 0
  let paren = 0
  // arguments being written (where each starts), for LibreOffice's infix AND / OR: "(a)AND(b)" → "AND((a),(b))"
  const args: number[] = [0]
  const close = () => {
    const start = args[args.length - 1]
    if (out.includes('\u0001', start)) out = out.slice(0, start) + infix(out.slice(start))
  }
  const n = f.length
  for (let i = 0; i < n; ) {
    const c = f[i]
    if (c === '"') {
      let j = i + 1
      for (; j < n; j++) {
        if (f[j] === '"') {
          if (f[j + 1] === '"') j++
          else break
        }
      }
      out += f.slice(i, j + 1)
      i = j + 1
    } else if (c === '[') {
      // a reference: up to the matching "]" outside quotes
      let j = i + 1
      let q = false
      for (; j < n; j++) {
        if (f[j] === "'") q = !q
        else if (f[j] === ']' && !q) break
      }
      if (j >= n) return undefined
      out += excelRef(f.slice(i + 1, j), sheetName)
      i = j + 1
    } else if (c === '{') {
      array++
      out += c
      i++
    } else if (c === '}') {
      array = Math.max(0, array - 1)
      out += c
      i++
    } else if (c === ';') {
      if (!array) close()
      out += ','
      if (!array) args[args.length - 1] = out.length
      i++
    } else if (c === '|') {
      out += ';'
      i++
    } else if (c === '~') {
      out += ','
      i++
    } else if (c === '!') {
      out += ' '
      i++
    } else if (c === '(') {
      paren++
      out += c
      args.push(out.length)
      i++
    } else if (c === ')') {
      paren--
      close()
      if (args.length > 1) args.pop()
      out += c
      i++
    } else if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\u00a0') {
      i++
    } else if (c === '#') {
      const up = f.slice(i, i + 13).toUpperCase()
      const e = ERRORS.find((x) => up.startsWith(x))
      if (e) {
        out += e
        i += e.length
      } else {
        out += c
        i++
      }
    } else if (/[A-Za-z_\\\u00c0-\uffff]/.test(c)) {
      let j = i + 1
      while (j < n && /[\w.\\\u00c0-\uffff]/.test(f[j])) j++
      const word = f.slice(i, j)
      let k = j
      while (k < n && f[k] === ' ') k++
      const prev = out[out.length - 1]
      if (/^(AND|OR|XOR)$/i.test(word) && prev !== undefined && /[\w)"'!?%}$]/.test(prev)) out += `\u0001${word.toUpperCase()}\u0001`
      else if (f[k] === '(') out += excelFunction(word)
      else if (/^(TRUE|FALSE)$/i.test(word)) out += word.toUpperCase()
      else out += word
      i = j
    } else if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(f.slice(i, i + 64))
      const t = m ? m[0] : c
      out += t
      i += t.length
    } else {
      out += c
      i++
    }
  }
  if (paren !== 0) return undefined
  close()
  return out
}

/** "a\u0001AND\u0001b\u0001AND\u0001c" → "AND(a,b,c)" (mixed operators nest from the left) */
function infix(s: string): string {
  const parts = s.split(/\u0001(AND|OR|XOR)\u0001/)
  let acc = parts[0]
  let op = ''
  let list: string[] = [acc]
  for (let i = 1; i < parts.length; i += 2) {
    const o = parts[i]
    if (op && o !== op) {
      acc = `${op}(${list.join(',')})`
      list = [acc]
    }
    op = o
    list.push(parts[i + 1])
  }
  return op ? `${op}(${list.join(',')})` : acc
}

/** a cell-range-address ("$Sheet1.$A$1:.$B$5", "Sheet1.A1:Sheet1.B5") as its sheet and Excel range ("A1:B5"); undefined when not on one sheet */
export function rangeOnSheet(addr: string): { sheet?: string; range: string } | undefined {
  const parts = splitRange(addr.trim())
  if (parts.length > 2) return undefined
  const ends = parts.map(endpoint)
  if (ends.some((e) => !e || e.bad)) return undefined
  const [a, b] = ends as Endpoint[]
  if (b?.sheet !== undefined && a.sheet !== undefined && b.sheet !== a.sheet) return undefined
  return { sheet: a.sheet, range: b ? `${a.cell}:${b.cell}` : a.cell }
}

/** a list of cell-range-addresses separated by spaces (sheet names in quotes may hold spaces) */
export function rangeList(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (const ch of s) {
    if (ch === "'") q = !q
    if (/\s/.test(ch) && !q) {
      if (cur) out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}
