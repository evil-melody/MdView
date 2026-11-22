/**
 * Builds new Office files from plain formats (File → Open of CSV / text / Markdown / HTML).
 * DOM-free: HTML is turned into paragraphs on the React side (react/docx/html.ts).
 */
import { HIGHLIGHT } from './docx/styles'
import type { RunSet } from './docx/types'
import { escAttr, escText } from './raw'
import { safeHref } from './url'
import { writeZip } from './zipwrite'

/** rows as delimited text: a field is quoted when it holds the separator, a quote, a line break or outer spaces */
export function toCsv(rows: string[][], sep = ','): string {
  const q = (v: string) => (v.includes(sep) || /["\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return rows.map((r) => r.map(q).join(sep)).join('\r\n') + '\r\n'
}

// kept local: the writers that also define these are worker-side modules
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT_RELS = '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'

const rootRels = (target: string) =>
  `${XML}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="${target}"/></Relationships>`

// ---------------------------------------------------------------- CSV → XLSX

/** Separator of a delimited text file: tab, semicolon (European CSV) or comma. */
export function detectSeparator(text: string): string {
  const line = text.slice(0, 4096).split(/\r?\n/, 1)[0]
  const count = (ch: string) => line.split(ch).length - 1
  const tabs = count('\t')
  const semis = count(';')
  const commas = count(',')
  if (tabs > 0 && tabs >= semis && tabs >= commas) return '\t'
  return semis > commas ? ';' : ','
}

/** RFC 4180 parser (quoted fields, escaped quotes, CRLF / LF, newlines inside quotes). */
export function parseCsv(text: string, sep = detectSeparator(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0
  const n = text.length
  for (; i < n; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === sep) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function colName(c: number): string {
  let s = ''
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/

/**
 * What a delimited text field holds: a number (not a code like "007", nor one of more than 15 digits), a boolean, or
 * text (null). `decimalComma`: "12,5" is a number. Cheap for the common case: text allocates nothing.
 */
export function fieldValue(v: string, decimalComma = false): number | boolean | null {
  let t = v
  if (t.charCodeAt(0) <= 32 || t.charCodeAt(t.length - 1) <= 32) t = t.trim()
  const n = t.length
  if (!n) return null
  const c0 = t.charCodeAt(0)
  // a digit, a sign or a decimal point first: a number, or text that looks like one
  if ((c0 >= 48 && c0 <= 57) || c0 === 45 || c0 === 43 || c0 === 46 || (decimalComma && c0 === 44)) {
    if (decimalComma && /^[-+]?\d*,\d+$/.test(t)) t = t.replace(',', '.')
    if (!NUMBER.test(t) || /^[-+]?0\d/.test(t)) return null
    let digits = 0
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i)
      if (c >= 48 && c <= 57) digits++
    }
    return digits <= 15 ? Number(t) : null
  }
  if ((n === 4 || n === 5) && (c0 === 116 || c0 === 84 || c0 === 102 || c0 === 70)) {
    const l = t.toLowerCase()
    if (l === 'true') return true
    if (l === 'false') return false
  }
  return null
}

/** Value written for a CSV field: numbers (but not codes like "007") and booleans keep their type. */
function cellXml(ref: string, v: string, decimalComma: boolean): string {
  if (v === '') return ''
  const k = fieldValue(v, decimalComma)
  if (typeof k === 'number') return `<c r="${ref}"><v>${k}</v></c>`
  if (typeof k === 'boolean') return `<c r="${ref}" t="b"><v>${k ? 1 : 0}</v></c>`
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escText(v)}</t></is></c>`
}

/**
 * Builds a one-sheet workbook from rows of text.
 * `decimalComma`: "12,5" is a number (semicolon-separated files from comma-decimal locales).
 */
export function rowsToXlsx(rows: string[][], sheetName = 'Sheet1', decimalComma = false): Promise<Blob> {
  const widths: number[] = []
  let data = ''
  rows.forEach((row, r) => {
    let cells = ''
    row.forEach((v, c) => {
      cells += cellXml(colName(c) + (r + 1), v, decimalComma)
      const len = Math.max(...v.split('\n').map((l) => l.length))
      if (len > (widths[c] ?? 0)) widths[c] = len
    })
    if (cells) data += `<row r="${r + 1}">${cells}</row>`
  })
  let cols = ''
  widths.forEach((len, c) => {
    if (len > 9) cols += `<col min="${c + 1}" max="${c + 1}" width="${Math.min(60, len + 2)}" customWidth="1"/>`
  })
  const name = sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet1'
  const SS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  const parts = new Map<string, string>([
    [
      '[Content_Types].xml',
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${CT_RELS}` +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ],
    ['_rels/.rels', rootRels('xl/workbook.xml')],
    [
      'xl/workbook.xml',
      `${XML}<workbook xmlns="${SS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets><sheet name="${escAttr(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `${XML}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      'xl/styles.xml',
      `${XML}<styleSheet xmlns="${SS}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>` +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    ],
    [
      'xl/worksheets/sheet1.xml',
      `${XML}<worksheet xmlns="${SS}" xmlns:r="${REL}"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>` +
        `${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${data}</sheetData></worksheet>`,
    ],
  ])
  return writeZip(parts, XLSX_MIME)
}

// ---------------------------------------------------------------- text / Markdown → DOCX

export interface ImportRun {
  text: string
  set?: RunSet
  href?: string
}

/** a picture of its own paragraph: an SVG drawing (diagrams) */
export interface ImportImage {
  svg: string
  /** size in px (1/96 in) */
  w: number
  h: number
  alt?: string
}

export interface ImportPara {
  runs: ImportRun[]
  /** heading level 1-6 */
  heading?: number
  list?: 'bullet' | 'number'
  align?: 'center'
  image?: ImportImage
}

export interface DocxOptions {
  /** Letter landscape instead of portrait */
  landscape?: boolean
}

/** One paragraph per line. */
export function textToParas(text: string): ImportPara[] {
  return text
    .replace(/^﻿/, '')
    .split(/\r\n|\r|\n/)
    .map((line) => ({ runs: line ? [{ text: line }] : [] }))
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** inline Markdown: code, links, bold, italic, strikethrough (input already HTML-escaped) */
function mdInline(s: string): string {
  const code: string[] = []
  s = s.replace(/`([^`]+)`/g, (_, c: string) => `\u0000${code.push(c) - 1}\u0000`)
  s = s
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_, t: string, u: string) => (safeHref(u) ? `<a href="${u}">${t}</a>` : t))
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '<b>$2</b>')
    .replace(/(^|[^*\w])\*(?=\S)(.+?)(?<=\S)\*(?!\*)/g, '$1<i>$2</i>')
    .replace(/(^|[^_\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, '$1<i>$2</i>')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<s>$1</s>')
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${code[Number(i)]}</code>`)
}

/** Small CommonMark subset → HTML: headings, paragraphs, lists, quotes, code blocks, rules, tables. */
export function markdownToHtml(md: string): string {
  const lines = md.replace(/^﻿/, '').split(/\r\n|\r|\n/)
  const out: string[] = []
  let para: string[] = []
  let list: 'ul' | 'ol' | null = null
  const flush = () => {
    if (para.length) out.push(`<p>${mdInline(escHtml(para.join(' ')))}</p>`)
    para = []
  }
  const closeList = () => {
    if (list) out.push(`</${list}>`)
    list = null
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = /^\s*(```|~~~)/.exec(line)
    if (fence) {
      flush()
      closeList()
      const body: string[] = []
      while (++i < lines.length && !lines[i].trimStart().startsWith(fence[1])) body.push(lines[i])
      out.push(`<pre><code>${escHtml(body.join('\n'))}</code></pre>`)
      continue
    }
    if (!line.trim()) {
      flush()
      closeList()
      continue
    }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (h) {
      flush()
      closeList()
      out.push(`<h${h[1].length}>${mdInline(escHtml(h[2]))}</h${h[1].length}>`)
      continue
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush()
      closeList()
      continue
    }
    // table: header row + separator row
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1] ?? '')) {
      flush()
      closeList()
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => mdInline(escHtml(c.trim())))
      const rows = [`<tr>${cells(line).map((c) => `<th><b>${c}</b></th>`).join('')}</tr>`]
      i++
      while (i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].trim()) rows.push(`<tr>${cells(lines[++i]).map((c) => `<td>${c}</td>`).join('')}</tr>`)
      out.push(`<table>${rows.join('')}</table>`)
      continue
    }
    const li = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line)
    if (li) {
      flush()
      const kind = li[1] ? 'ul' : 'ol'
      if (list !== kind) {
        closeList()
        out.push(`<${kind}>`)
        list = kind
      }
      out.push(`<li>${mdInline(escHtml(li[3].replace(/^\[[ xX]\]\s+/, (m) => (m[1] === ' ' ? '☐ ' : '☑ '))))}</li>`)
      continue
    }
    const q = /^\s*>\s?(.*)$/.exec(line)
    if (q) {
      flush()
      closeList()
      out.push(`<blockquote><i>${mdInline(escHtml(q[1]))}</i></blockquote>`)
      continue
    }
    if (list && /^\s{2,}\S/.test(line)) {
      // lazy continuation of the previous item
      out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ` ${mdInline(escHtml(line.trim()))}</li>`)
      continue
    }
    closeList()
    para.push(line.trim())
  }
  flush()
  closeList()
  return out.join('\n')
}

const HL_NAME: Record<string, string> = Object.fromEntries(Object.entries(HIGHLIGHT).map(([k, v]) => [v, k]))

function rPrXml(set: RunSet | undefined): string {
  if (!set) return ''
  let x = ''
  if (set.font) x += `<w:rFonts w:ascii="${escAttr(set.font)}" w:hAnsi="${escAttr(set.font)}" w:eastAsia="${escAttr(set.font)}" w:cs="${escAttr(set.font)}"/>`
  if (set.b) x += '<w:b/>'
  if (set.i) x += '<w:i/>'
  if (set.strike) x += '<w:strike/>'
  if (set.color) x += `<w:color w:val="${set.color.replace('#', '').toUpperCase()}"/>`
  if (set.sz) x += `<w:sz w:val="${Math.round(set.sz * 2)}"/><w:szCs w:val="${Math.round(set.sz * 2)}"/>`
  const hl = set.hl ? HL_NAME[set.hl.toLowerCase()] : undefined
  if (hl) x += `<w:highlight w:val="${hl}"/>`
  if (set.u && set.u !== 'none') x += `<w:u w:val="${set.u}"/>`
  if (set.hl && !hl) x += `<w:shd w:val="clear" w:color="auto" w:fill="${set.hl.replace('#', '').toUpperCase()}"/>`
  if (set.va) x += `<w:vertAlign w:val="${set.va === 'sup' ? 'superscript' : 'subscript'}"/>`
  return x ? `<w:rPr>${x}</w:rPr>` : ''
}

function runXml(r: ImportRun): string {
  let body = ''
  for (const piece of r.text.split(/(\t|\n)/)) {
    if (!piece) continue
    if (piece === '\t') body += '<w:tab/>'
    else if (piece === '\n') body += '<w:br/>'
    else body += `<w:t xml:space="preserve">${escText(piece)}</w:t>`
  }
  return body ? `<w:r>${rPrXml(r.set)}${body}</w:r>` : ''
}

function headingStyles(): string {
  const sizes = [20, 16, 14, 12, 11, 11]
  let x = ''
  sizes.forEach((sz, k) => {
    const n = k + 1
    x +=
      `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
      `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${n <= 2 ? 360 : 240}" w:after="${n <= 2 ? 120 : 80}"/><w:outlineLvl w:val="${k}"/></w:pPr>` +
      `<w:rPr>${n <= 4 ? '<w:b/>' : ''}${n >= 5 ? '<w:i/>' : ''}<w:color w:val="${n <= 2 ? '1F3864' : '2F5496'}"/><w:sz w:val="${sz * 2}"/><w:szCs w:val="${sz * 2}"/></w:rPr></w:style>`
  })
  return x
}

function numberingXml(nums: ('bullet' | 'number')[]): string {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const BULLETS = ['•', '◦', '▪']
  const FORMATS = ['decimal', 'lowerLetter', 'lowerRoman']
  const lvls = (kind: 'bullet' | 'number') =>
    Array.from({ length: 9 }, (_, l) => {
      const fmt = kind === 'bullet' ? 'bullet' : FORMATS[l % 3]
      const text = kind === 'bullet' ? BULLETS[l % 3] : `%${l + 1}.`
      const font = kind === 'bullet' ? '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>' : ''
      return `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (l + 1)}" w:hanging="360"/></w:pPr>${font}</w:lvl>`
    }).join('')
  let x = `${XML}<w:numbering xmlns:w="${W}">`
  x += `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${lvls('bullet')}</w:abstractNum>`
  x += `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${lvls('number')}</w:abstractNum>`
  // one instance per list, numbered lists restart at 1
  nums.forEach((kind, k) => {
    x += `<w:num w:numId="${k + 1}"><w:abstractNumId w:val="${kind === 'bullet' ? 0 : 1}"/>`
    if (kind === 'number') x += '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride>'
    x += '</w:num>'
  })
  return x + '</w:numbering>'
}

const EMU_PX = 9525

/** an inline picture scaled down to fit `maxW` × `maxH` px */
function drawingXml(img: ImportImage, rid: string, id: number, maxW: number, maxH: number): string {
  const scale = Math.min(1, maxW / img.w, maxH / img.h)
  const cx = Math.max(1, Math.round(img.w * scale * EMU_PX))
  const cy = Math.max(1, Math.round(img.h * scale * EMU_PX))
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
  const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture'
  const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
  const descr = img.alt ? ` descr="${escAttr(img.alt)}"` : ''
  return (
    `<w:r><w:drawing><wp:inline xmlns:wp="${WP}" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${id}" name="Diagram ${id}"${descr}/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${A}" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="${A}"><a:graphicData uri="${PIC}"><pic:pic xmlns:pic="${PIC}"><pic:nvPicPr><pic:cNvPr id="${id}" name="diagram${id}.svg"${descr}/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  )
}

/** Builds a document (Letter, 1" margins, Calibri 11) from paragraphs of formatted runs and pictures. */
export function parasToDocx(paras: ImportPara[], opts: DocxOptions = {}): Promise<Blob> {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  // the text area in px: 6.5" × 9" (portrait), 9" × 6.5" (landscape)
  const areaW = opts.landscape ? 864 : 624
  const areaH = opts.landscape ? 600 : 840
  const images: string[] = []
  const links: string[] = []
  const nums: ('bullet' | 'number')[] = []
  let prevList: 'bullet' | 'number' | undefined
  let body = ''
  for (const p of paras) {
    let pPr = ''
    if (p.heading && p.heading >= 1 && p.heading <= 6) pPr += `<w:pStyle w:val="Heading${p.heading}"/>`
    else if (p.list) pPr += '<w:pStyle w:val="ListParagraph"/>'
    if (p.list) {
      if (p.list !== prevList) nums.push(p.list)
      pPr += `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${nums.length}"/></w:numPr>`
    }
    prevList = p.list
    if (p.align === 'center') pPr += '<w:jc w:val="center"/>'
    let runs = ''
    if (p.image) {
      images.push(p.image.svg)
      runs += drawingXml(p.image, `rIdM${images.length}`, images.length, areaW, areaH)
    }
    for (let i = 0; i < p.runs.length; ) {
      const href = p.runs[i].href
      if (!href) {
        runs += runXml(p.runs[i++])
        continue
      }
      let inner = ''
      while (i < p.runs.length && p.runs[i].href === href) inner += runXml(p.runs[i++])
      if (!safeHref(href)) runs += inner
      else {
        links.push(href)
        runs += `<w:hyperlink r:id="rIdL${links.length}" w:history="1">${inner}</w:hyperlink>`
      }
    }
    body += `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runs}</w:p>`
  }
  if (!body) body = '<w:p/>'
  const sect = `<w:sectPr>${opts.landscape ? '<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>' : '<w:pgSz w:w="12240" w:h="15840"/>'}<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`
  const styles =
    `${XML}<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>` +
    '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    headingStyles() +
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="40"/><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>' +
    '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>' +
    '</w:styles>'
  const rels =
    `${XML}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${REL}/numbering" Target="numbering.xml"/>` +
    links.map((u, k) => `<Relationship Id="rIdL${k + 1}" Type="${REL}/hyperlink" Target="${escAttr(u)}" TargetMode="External"/>`).join('') +
    images.map((_, k) => `<Relationship Id="rIdM${k + 1}" Type="${REL}/image" Target="media/diagram${k + 1}.svg"/>`).join('') +
    '</Relationships>'
  const parts = new Map<string, string>([
    [
      '[Content_Types].xml',
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${CT_RELS}` +
        (images.length ? '<Default Extension="svg" ContentType="image/svg+xml"/>' : '') +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>',
    ],
    ['_rels/.rels', rootRels('word/document.xml')],
    ['word/_rels/document.xml.rels', rels],
    ['word/document.xml', `${XML}<w:document xmlns:w="${W}" xmlns:r="${REL}"><w:body>${body}${sect}</w:body></w:document>`],
    ['word/styles.xml', styles],
    ['word/numbering.xml', numberingXml(nums)],
    ...images.map((svg, k) => [`word/media/diagram${k + 1}.svg`, svg] as [string, string]),
  ])
  return writeZip(parts, DOCX_MIME)
}

// ---------------------------------------------------------------- blank presentation

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const PNS = `xmlns:a="${NS_A}" xmlns:r="${REL}" xmlns:p="${NS_P}"`
const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

/** placeholder shape; `xfrm` [x, y, w, h] in EMU (omitted: inherited), `body` extra txBody content */
function ph(id: number, name: string, type: string | null, idx: number | null, xfrm?: number[], body = '<a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p>'): string {
  const attrs = (type ? ` type="${type}"` : '') + (idx !== null ? ` idx="${idx}"` : '')
  const sp = xfrm ? `<p:spPr><a:xfrm><a:off x="${xfrm[0]}" y="${xfrm[1]}"/><a:ext cx="${xfrm[2]}" cy="${xfrm[3]}"/></a:xfrm></p:spPr>` : '<p:spPr/>'
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph${attrs}/></p:nvPr></p:nvSpPr>${sp}<p:txBody>${body}</p:txBody></p:sp>`
}

/** the Office theme of new presentations (also used by converted Keynote files) */
export const THEME =
  `${XML}<a:theme xmlns:a="${NS_A}" name="Office Theme"><a:themeElements><a:clrScheme name="Office">` +
  '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1>' +
  '<a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>' +
  '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink>' +
  '<a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office">' +
  '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
  '<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="60000"/></a:schemeClr></a:solidFill>' +
  '<a:solidFill><a:schemeClr val="phClr"><a:shade val="80000"/></a:schemeClr></a:solidFill></a:fillStyleLst>' +
  '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>' +
  '<a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
  '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
  '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/></a:schemeClr></a:solidFill>' +
  '<a:solidFill><a:schemeClr val="phClr"><a:shade val="90000"/></a:schemeClr></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>'

const lvl = (n: number, sz: number, bullet: boolean) =>
  `<a:lvl${n}pPr marL="${bullet ? 228600 + (n - 1) * 457200 : 0}" indent="${bullet ? -228600 : 0}" algn="l">` +
  (bullet ? '<a:buFont typeface="Arial"/><a:buChar char="•"/>' : '<a:buNone/>') +
  `<a:defRPr sz="${sz}" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl${n}pPr>`

/** One empty title slide, 16:9, Office theme; layouts: title, title and content, blank. */
export function blankPptx(): Promise<Blob> {
  const W = 12192000
  const H = 6858000
  const master =
    `${XML}<p:sldMaster ${PNS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GRP}` +
    ph(2, 'Title Placeholder 1', 'title', null, [838200, 365125, 10515600, 1325563], '<a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p>') +
    ph(3, 'Text Placeholder 2', 'body', 1, [838200, 1825625, 10515600, 4351338]) +
    '</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/><p:sldLayoutId id="2147483650" r:id="rId2"/><p:sldLayoutId id="2147483651" r:id="rId3"/></p:sldLayoutIdLst>' +
    '<p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:buNone/><a:defRPr sz="4400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>' +
    `<p:bodyStyle>${lvl(1, 2800, true)}${lvl(2, 2400, true)}${lvl(3, 2000, true)}${lvl(4, 1800, true)}${lvl(5, 1800, true)}</p:bodyStyle>` +
    `<p:otherStyle>${lvl(1, 1800, false)}</p:otherStyle></p:txStyles></p:sldMaster>`
  const layout = (type: string, name: string, shapes: string) =>
    `${XML}<p:sldLayout ${PNS} type="${type}" preserve="1"><p:cSld name="${name}"><p:spTree>${GRP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  const center = (sz: number, anchor: string) => `<a:bodyPr anchor="${anchor}"/><a:lstStyle><a:lvl1pPr algn="ctr"><a:buNone/><a:defRPr sz="${sz}"/></a:lvl1pPr></a:lstStyle><a:p><a:endParaRPr lang="en-US"/></a:p>`
  const titleLayout = layout(
    'title',
    'Title Slide',
    ph(2, 'Title 1', 'ctrTitle', null, [1524000, 1122363, 9144000, 2387600], center(6000, 'b')) + ph(3, 'Subtitle 2', 'subTitle', 1, [1524000, 3602038, 9144000, 1655762], center(2400, 't')),
  )
  const slide =
    `${XML}<p:sld ${PNS}><p:cSld><p:spTree>${GRP}` +
    ph(2, 'Title 1', 'ctrTitle', null) +
    ph(3, 'Subtitle 2', 'subTitle', 1) +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
  const rel = (id: number, type: string, target: string) => `<Relationship Id="rId${id}" Type="${REL}/${type}" Target="${target}"/>`
  const rels = (...r: string[]) => `${XML}<Relationships xmlns="${PKG_REL}">${r.join('')}</Relationships>`
  const PML = 'application/vnd.openxmlformats-officedocument.presentationml'
  const parts = new Map<string, string>([
    [
      '[Content_Types].xml',
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${CT_RELS}` +
        `<Override PartName="/ppt/presentation.xml" ContentType="${PML}.presentation.main+xml"/>` +
        `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${PML}.slideMaster+xml"/>` +
        [1, 2, 3].map((n) => `<Override PartName="/ppt/slideLayouts/slideLayout${n}.xml" ContentType="${PML}.slideLayout+xml"/>`).join('') +
        `<Override PartName="/ppt/slides/slide1.xml" ContentType="${PML}.slide+xml"/>` +
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>',
    ],
    ['_rels/.rels', rootRels('ppt/presentation.xml')],
    [
      'ppt/presentation.xml',
      `${XML}<p:presentation ${PNS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
        `<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    ],
    ['ppt/_rels/presentation.xml.rels', rels(rel(1, 'slideMaster', 'slideMasters/slideMaster1.xml'), rel(2, 'slide', 'slides/slide1.xml'), rel(3, 'theme', 'theme/theme1.xml'))],
    ['ppt/slideMasters/slideMaster1.xml', master],
    [
      'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      rels(rel(1, 'slideLayout', '../slideLayouts/slideLayout1.xml'), rel(2, 'slideLayout', '../slideLayouts/slideLayout2.xml'), rel(3, 'slideLayout', '../slideLayouts/slideLayout3.xml'), rel(4, 'theme', '../theme/theme1.xml')),
    ],
    ['ppt/slideLayouts/slideLayout1.xml', titleLayout],
    ['ppt/slideLayouts/slideLayout2.xml', layout('obj', 'Title and Content', ph(2, 'Title 1', 'title', null) + ph(3, 'Content Placeholder 2', null, 1))],
    ['ppt/slideLayouts/slideLayout3.xml', layout('blank', 'Blank', '')],
    ...[1, 2, 3].map((n) => [`ppt/slideLayouts/_rels/slideLayout${n}.xml.rels`, rels(rel(1, 'slideMaster', '../slideMasters/slideMaster1.xml'))] as [string, string]),
    ['ppt/slides/slide1.xml', slide],
    ['ppt/slides/_rels/slide1.xml.rels', rels(rel(1, 'slideLayout', '../slideLayouts/slideLayout1.xml'))],
    ['ppt/theme/theme1.xml', THEME],
  ])
  return writeZip(parts, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
}
