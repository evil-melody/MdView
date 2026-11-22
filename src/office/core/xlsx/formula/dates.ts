/** Date serials (1900 system with the Lotus leap-year bug, or 1904), date/time text parsing, TEXT() formatting. */

const MS_DAY = 86400000
const EPOCH_1900 = Date.UTC(1899, 11, 30)
const EPOCH_1904 = Date.UTC(1904, 0, 1)

/** Active date system for the evaluation in progress (set/restored by evaluate()). */
let date1904 = false
export function getDate1904(): boolean {
  return date1904
}
export function setDate1904(v: boolean): void {
  date1904 = v
}

function utc(y: number, m: number, d: number): number {
  const t = new Date(0)
  t.setUTCFullYear(y, m - 1, d)
  return t.getTime()
}

/** Serial for y/m/d (m 1-based; month/day overflow normalized like DATE()). */
export function ymdToSerial(y: number, m: number, d: number): number {
  const t = utc(y, m, d)
  if (date1904) return Math.round((t - EPOCH_1904) / MS_DAY)
  const s = Math.round((t - EPOCH_1900) / MS_DAY)
  return s < 61 ? s - 1 : s
}

export interface DateParts {
  y: number
  m: number
  d: number
  /** 0 = Sunday */
  dow: number
}

export function serialToYmd(serial: number): DateParts {
  const n = Math.floor(serial)
  if (date1904) {
    const dt = new Date(EPOCH_1904 + n * MS_DAY)
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: (((n + 5) % 7) + 7) % 7 }
  }
  const dow = (((n - 1) % 7) + 7) % 7
  if (n === 60) return { y: 1900, m: 2, d: 29, dow }
  if (n === 0) return { y: 1900, m: 1, d: 0, dow }
  const dt = new Date(EPOCH_1900 + (n < 60 ? n + 1 : n) * MS_DAY)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow }
}

/** Seconds of the day (rounded to the nearest second). */
export function serialSeconds(serial: number): number {
  return Math.round((serial - Math.floor(serial)) * 86400) % 86400
}

export function daysInMonth(y: number, m: number): number {
  return new Date(utc(y, m + 1, 0)).getUTCDate()
}

/** Serial of a JS Date using its local calendar components. */
export function dateToSerial(dt: Date): number {
  const day = ymdToSerial(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
  const secs = dt.getHours() * 3600 + dt.getMinutes() * 60 + dt.getSeconds() + dt.getMilliseconds() / 1000
  return day + secs / 86400
}

const TIME_RE = /^(\d{1,4}):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?\s*([ap]m?)?$/i
const ISO_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(.+))?$/i
const US_RE = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})(?:\s+(.+))?$/

function parseTime(s: string): number | null {
  const m = TIME_RE.exec(s.trim())
  if (!m) return null
  let h = Number(m[1])
  const mi = Number(m[2])
  const sec = m[3] ? Number(m[3]) : 0
  if (mi > 59 || sec >= 60) return null
  if (m[4]) {
    if (h < 1 || h > 12) return null
    const pm = m[4][0].toLowerCase() === 'p'
    h = (h % 12) + (pm ? 12 : 0)
  }
  return (h * 3600 + mi * 60 + sec) / 86400
}

function dateSerial(y: number, m: number, d: number): number | null {
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null
  const s = ymdToSerial(y, m, d)
  return s < 0 ? null : s
}

/** Parse date/time text: `yyyy-mm-dd [time]`, `m/d/yyyy [time]`, `hh:mm[:ss] [AM/PM]`. */
export function parseDateText(s: string): number | null {
  let m = ISO_RE.exec(s)
  let day: number | null = null
  let rest: string | undefined
  if (m) {
    day = dateSerial(Number(m[1]), Number(m[2]), Number(m[3]))
    rest = m[4]
  } else if ((m = US_RE.exec(s))) {
    let y = Number(m[3])
    if (m[3].length === 2) y += y < 30 ? 2000 : 1900
    day = dateSerial(y, Number(m[1]), Number(m[2]))
    rest = m[4]
  } else return parseTime(s)
  if (day === null) return null
  if (rest === undefined) return day
  const t = parseTime(rest)
  return t === null ? null : day + t
}

// ---------------------------------------------------------------- TEXT()

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function splitSections(fmt: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i]
    if (c === '\\' && !q) {
      cur += c + (fmt[i + 1] ?? '')
      i++
      continue
    }
    if (c === '"') q = !q
    if (c === ';' && !q) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

/** Strip quoted text, escapes and [..] blocks: used to classify a section. */
function bare(sec: string): string {
  return sec.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, '').replace(/[_*]./g, '')
}

export function isDateFormat(sec: string): boolean {
  return /[ymdhs]/i.test(bare(sec)) || /\[(h+|m+|s+)\]/i.test(sec)
}

type DTok = { k: 'lit'; v: string } | { k: 'y' | 'M' | 'd' | 'h' | 'm' | 's' | 'H' | 'N' | 'S'; n: number } | { k: 'ap'; v: string }

export function formatDate(serial: number, sec: string): string {
  const toks: DTok[] = []
  for (let i = 0; i < sec.length; ) {
    const c = sec[i]
    const lc = c.toLowerCase()
    if (c === '"') {
      const j = sec.indexOf('"', i + 1)
      const end = j < 0 ? sec.length : j
      toks.push({ k: 'lit', v: sec.slice(i + 1, end) })
      i = end + 1
    } else if (c === '\\') {
      toks.push({ k: 'lit', v: sec[i + 1] ?? '' })
      i += 2
    } else if (c === '_') {
      toks.push({ k: 'lit', v: ' ' })
      i += 2
    } else if (c === '*') i += 2
    else if (c === '[') {
      const j = sec.indexOf(']', i)
      const inner = sec.slice(i + 1, j < 0 ? sec.length : j).toLowerCase()
      if (/^h+$/.test(inner)) toks.push({ k: 'H', n: inner.length })
      else if (/^m+$/.test(inner)) toks.push({ k: 'N', n: inner.length })
      else if (/^s+$/.test(inner)) toks.push({ k: 'S', n: inner.length })
      i = j < 0 ? sec.length : j + 1
    } else if (sec.slice(i, i + 5).toUpperCase() === 'AM/PM') {
      toks.push({ k: 'ap', v: sec.slice(i, i + 5) })
      i += 5
    } else if (sec.slice(i, i + 3).toUpperCase() === 'A/P') {
      toks.push({ k: 'ap', v: sec.slice(i, i + 3) })
      i += 3
    } else if ('ymdhs'.includes(lc)) {
      let j = i
      while (j < sec.length && sec[j].toLowerCase() === lc) j++
      toks.push({ k: lc === 'm' ? 'M' : (lc as 'y' | 'd' | 'h' | 's'), n: j - i })
      i = j
    } else {
      toks.push({ k: 'lit', v: c })
      i++
    }
  }
  // month vs minute: m after h / before s => minutes
  const parts = toks.filter((t) => t.k !== 'lit')
  parts.forEach((t, idx) => {
    if (t.k !== 'M' || t.n > 2) return
    const prev = parts[idx - 1]
    const next = parts[idx + 1]
    if ((prev && (prev.k === 'h' || prev.k === 'H')) || (next && (next.k === 's' || next.k === 'S'))) (t as { k: string }).k = 'm'
  })
  const hasAp = toks.some((t) => t.k === 'ap')
  let day = Math.floor(serial)
  let secs = Math.round((serial - day) * 86400)
  if (secs >= 86400) {
    day++
    secs -= 86400
  }
  const p = serialToYmd(day)
  const H = Math.floor(secs / 3600)
  const N = Math.floor((secs % 3600) / 60)
  const S = secs % 60
  const pad = (v: number, n: number) => String(v).padStart(n, '0')
  let out = ''
  for (const t of toks) {
    switch (t.k) {
      case 'lit':
        out += t.v
        break
      case 'y':
        out += t.n <= 2 ? pad(p.y % 100, 2) : pad(p.y, 4)
        break
      case 'M':
        out += t.n === 1 ? p.m : t.n === 2 ? pad(p.m, 2) : t.n === 3 ? MONTHS[p.m - 1].slice(0, 3) : t.n === 4 ? MONTHS[p.m - 1] : MONTHS[p.m - 1][0]
        break
      case 'd':
        out += t.n === 1 ? p.d : t.n === 2 ? pad(p.d, 2) : t.n === 3 ? DAYS[p.dow].slice(0, 3) : DAYS[p.dow]
        break
      case 'h': {
        const h = hasAp ? H % 12 || 12 : H
        out += t.n >= 2 ? pad(h, 2) : h
        break
      }
      case 'm':
        out += t.n >= 2 ? pad(N, 2) : N
        break
      case 's':
        out += t.n >= 2 ? pad(S, 2) : S
        break
      case 'H':
        out += pad(day * 24 + H, t.n)
        break
      case 'N':
        out += pad((day * 24 + H) * 60 + N, t.n)
        break
      case 'S':
        out += pad(((day * 24 + H) * 60 + N) * 60 + S, t.n)
        break
      case 'ap': {
        const am = H < 12
        const full = t.v.length === 5
        const src = full ? (am ? t.v.slice(0, 2) : t.v.slice(3, 5)) : am ? t.v[0] : t.v[2]
        out += src
        break
      }
    }
  }
  return out
}
