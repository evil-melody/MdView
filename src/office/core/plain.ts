/**
 * Plain formats opened as Office files: CSV / TSV become a workbook, text / Markdown / HTML a document, an SVG file
 * and Mermaid / PlantUML / Graphviz diagrams a document with the picture (Markdown code blocks in those languages
 * are drawn too). A gzip-compressed plain file (.svgz, .csv.gz) is unpacked first.
 * Used by the engine (a source that is not an Office package) and by File → Open.
 */
import { detectSeparator, markdownToHtml, parasToDocx, parseCsv, rowsToXlsx, textToParas, type ImportPara } from './convert'
import { DIAGRAM_EXT, DIAGRAM_NAME, FENCE_LANG, renderDiagrams, sniffDiagram, type DiagramLang } from './diagram'
import { decodeEntities, htmlToParas } from './html'
import { BlobSource, type ByteSource } from './source'
import { isSvg, svgImage } from './svgfile'

export type PlainFormat = 'csv' | 'tsv' | 'text' | 'markdown' | 'html' | 'svg' | DiagramLang

export const PLAIN_EXT: Record<string, PlainFormat> = {
  csv: 'csv',
  tsv: 'tsv',
  tab: 'tsv',
  txt: 'text',
  text: 'text',
  log: 'text',
  md: 'markdown',
  markdown: 'markdown',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  svg: 'svg',
  svgz: 'svg',
  ...DIAGRAM_EXT,
}

/** packages (Office, iWork, OpenDocument), the legacy binary formats and RTF: never read as text */
const PACKAGE_EXT = new Set([
  'docx', 'dotx', 'docm', 'dotm', 'xlsx', 'xltx', 'xlsm', 'xltm', 'pptx', 'potx', 'pptm', 'potm', 'ppsx', 'ppsm',
  // (.dot is also Graphviz: a Word 97 template is told apart by its bytes)
  'pages', 'key', 'numbers', 'doc', 'xls', 'xlt', 'ppt', 'pot', 'pps', 'rtf',
  'odt', 'ott', 'fodt', 'ods', 'ots', 'fods', 'odp', 'otp', 'fodp',
])

const MIME: Record<string, PlainFormat> = {
  'text/csv': 'csv',
  'application/csv': 'csv',
  'text/comma-separated-values': 'csv',
  'text/tab-separated-values': 'tsv',
  'text/plain': 'text',
  'text/markdown': 'markdown',
  'text/x-markdown': 'markdown',
  'text/html': 'html',
  'application/xhtml+xml': 'html',
  'image/svg+xml': 'svg',
  'text/vnd.graphviz': 'graphviz',
  'text/x-mermaid': 'mermaid',
  'text/vnd.mermaid': 'mermaid',
  'text/x-plantuml': 'plantuml',
}

/** formats shown with their source next to the document (and edited there) */
export const HAS_SOURCE = new Set<PlainFormat>(['markdown', 'html', 'svg', 'mermaid', 'plantuml', 'graphviz'])

/** a file name extension and MIME type for each plain format (sources saved from the editor) */
export const PLAIN_FILE: Record<PlainFormat, { ext: string; mime: string }> = {
  csv: { ext: 'csv', mime: 'text/csv' },
  tsv: { ext: 'tsv', mime: 'text/tab-separated-values' },
  text: { ext: 'txt', mime: 'text/plain' },
  markdown: { ext: 'md', mime: 'text/markdown' },
  html: { ext: 'html', mime: 'text/html' },
  svg: { ext: 'svg', mime: 'image/svg+xml' },
  mermaid: { ext: 'mmd', mime: 'text/plain' },
  plantuml: { ext: 'puml', mime: 'text/plain' },
  graphviz: { ext: 'dot', mime: 'text/vnd.graphviz' },
}

/** what a plain format opens as */
export const PLAIN_KIND: Record<PlainFormat, 'xlsx' | 'docx'> = {
  csv: 'xlsx',
  tsv: 'xlsx',
  text: 'docx',
  markdown: 'docx',
  html: 'docx',
  svg: 'docx',
  mermaid: 'docx',
  plantuml: 'docx',
  graphviz: 'docx',
}

export const extOf = (name?: string) => /\.([^./\\]+)$/.exec(name ?? '')?.[1].toLowerCase() ?? ''

/** the name of the file inside a gzip-compressed one: x.svgz → x.svg, x.csv.gz → x.csv; null for other names */
export function unpackedName(name = ''): string | null {
  const ext = extOf(name)
  return ext === 'svgz' ? name.slice(0, -1) : ext === 'gz' ? name.slice(0, -3) : null
}

/** gzip's magic bytes */
export const isGzip = (b: Uint8Array) => b[0] === 0x1f && b[1] === 0x8b

/** A gzip-compressed source (.svgz, .csv.gz) unpacked whole into memory (native DecompressionStream); any other source as it is. */
export async function ungzipped(source: ByteSource): Promise<ByteSource> {
  if (!isGzip(await source.read(0, 2))) return source
  const packed = new Blob([(await source.read(0, source.size)) as BlobPart])
  const unpacked = packed.stream().pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>)
  return new BlobSource(await new Response(unpacked, source.type ? { headers: { 'content-type': source.type } } : undefined).blob(), source.name)
}

/** false for a name that says Office / iWork package: no need to look at its bytes */
export const mayBePlain = (name?: string) => !PACKAGE_EXT.has(extOf(name))

const charsetOf = (type?: string) => /;\s*charset=["']?([^;"'\s]+)/i.exec(type ?? '')?.[1]

/** no control characters a text file would not have (UTF-16 has a byte order mark) */
function isText(b: Uint8Array): boolean {
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) return true
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return false // %PDF
  for (const x of b) if (x < 9 || (x > 13 && x < 32 && x !== 27) || x === 0x7f) return false
  return true
}

/** Text of a file: byte order mark, then the declared charset, then UTF-8, then Windows-1252 (Excel's CSV on Windows). */
export function decodeText(b: Uint8Array, type?: string): string {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b)
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b)
  if (b[0] === 0xfe && b[1] === 0xff) {
    const swapped = new Uint8Array(b.length - 2)
    for (let k = 2; k + 1 < b.length; k += 2) {
      swapped[k - 2] = b[k + 1]
      swapped[k - 1] = b[k]
    }
    return new TextDecoder('utf-16le').decode(swapped)
  }
  const charset = charsetOf(type)
  if (charset) {
    try {
      return new TextDecoder(charset).decode(b)
    } catch {
      // unknown label: guess below
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b)
  } catch {
    return new TextDecoder('windows-1252').decode(b)
  }
}

/** a file with neither a known extension nor a MIME type: SVG, HTML, delimited rows, or text */
function sniff(text: string, whole: boolean): PlainFormat {
  // trimStart also drops a byte order mark
  const t = text.trimStart()
  const diagram = sniffDiagram(t)
  if (diagram) return diagram
  if (isSvg(t)) return 'svg'
  if (/^<(!doctype\s+html|html|head|body)[\s>]/i.test(t) || (t[0] === '<' && /<\/(p|div|h[1-6]|table|ul|ol|li|span|a|b|i|em|strong)>/i.test(t))) return 'html'
  const lines = t.split(/\r\n|\r|\n/)
  // the head ends mid-line
  if (!whole) lines.pop()
  const rows = lines.filter((l) => l.trim()).slice(0, 20)
  if (rows.length >= 2) {
    const sep = detectSeparator(rows[0])
    const cols = (l: string) => parseCsv(l, sep)[0]?.length ?? 0
    const n = cols(rows[0])
    if (n >= 2 && rows.every((l) => cols(l) === n)) return sep === '\t' ? 'tsv' : 'csv'
  }
  return 'text'
}

/**
 * The plain format of a file from its name, MIME type and first bytes (`whole`: they are the whole file), or null
 * for an Office / iWork package or a binary file.
 */
export function plainFormat(name: string | undefined, type: string | undefined, head: Uint8Array, whole: boolean): PlainFormat | null {
  // ZIP (a package, whatever its name says); OLE: legacy binary Office or encrypted, the ZIP reader says so
  if ((head[0] === 0x50 && head[1] === 0x4b) || (head[0] === 0xd0 && head[1] === 0xcf)) return null
  const ext = extOf(name)
  if (PACKAGE_EXT.has(ext)) return null
  // a gzip-compressed plain file (.svgz, .csv.gz): the name inside says the format, also once the server has unpacked it
  const inner = unpackedName(name)
  const byExt = PLAIN_EXT[ext] ?? (inner ? PLAIN_EXT[extOf(inner)] : undefined)
  if (isGzip(head)) {
    if (byExt) return byExt
    throw new Error(`${name ? `“${name}”` : 'The file'} is a gzip file: only gzip-compressed CSV / text / Markdown / HTML / SVG and diagram files open (.svgz, .csv.gz…)`)
  }
  if (!isText(head)) {
    if (byExt) throw new Error(`“${name}” is not a text file`)
    return null
  }
  if (byExt) return byExt
  if (!head.length) return null
  const mime = MIME[(type ?? '').split(';')[0].trim().toLowerCase()]
  // a diagram or an SVG served as plain text
  if (mime === 'text') {
    const text = new TextDecoder().decode(head)
    return sniffDiagram(text) ?? (isSvg(text) ? 'svg' : mime)
  }
  return mime ?? sniff(new TextDecoder().decode(head), whole)
}

const fromHtml = (html: string): ImportPara[] =>
  htmlToParas(html).map((p) => ({
    heading: p.heading,
    list: p.list,
    runs: p.runs.flatMap((r) => (r.t === 'text' ? [{ text: r.text, set: r.d, href: r.href }] : [])),
  }))

/** a diagram's pictures, or (when it cannot be drawn) why, and its source */
function diagramParas(lang: DiagramLang, src: string): ImportPara[] {
  try {
    return renderDiagrams(lang, src).map((img) => ({ runs: [], align: 'center', image: { ...img, alt: `${DIAGRAM_NAME[lang]} diagram` } }))
  } catch (e) {
    const why = (e as Error).message || 'unknown error'
    return [
      { runs: [{ text: `${DIAGRAM_NAME[lang]} diagram not drawn: ${why}`, set: { i: true, color: '#9c2a2a' } }] },
      { runs: [{ text: src.replace(/\s+$/, ''), set: { font: 'Courier New', sz: 10 } }] },
    ]
  }
}

/** Markdown: the text, and code blocks in a diagram language (```mermaid, ```plantuml, ```dot) as drawings */
function markdownParas(md: string): ImportPara[] {
  const lines = md.replace(/^﻿/, '').split(/\r\n|\r|\n/)
  const out: ImportPara[] = []
  let text: string[] = []
  const flush = () => {
    if (text.length) out.push(...fromHtml(markdownToHtml(text.join('\n'))))
    text = []
  }
  for (let i = 0; i < lines.length; i++) {
    const fence = /^\s*(```|~~~)[`~]*\s*([\w-]*)/.exec(lines[i])
    if (!fence) {
      text.push(lines[i])
      continue
    }
    // the block ends like markdownToHtml ends it: a line starting with the same fence
    let j = i + 1
    while (j < lines.length && !lines[j].trimStart().startsWith(fence[1])) j++
    const lang = FENCE_LANG[fence[2].toLowerCase()]
    if (lang) {
      flush()
      out.push(...diagramParas(lang, lines.slice(i + 1, j).join('\n')))
    } else text.push(...lines.slice(i, j + 1))
    i = j
  }
  flush()
  return out
}

/** diagram blocks of web pages: <pre class="mermaid">, <div class="mermaid">, <pre><code class="language-plantuml"> */
const HTML_DIAGRAM = /<(pre|div)\b[^>]*\bclass\s*=\s*["'][^"']*\b(mermaid|plantuml|graphviz)\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>|<pre\b[^>]*>\s*<code\b[^>]*\bclass\s*=\s*["'][^"']*\blang(?:uage)?-([\w-]+)[^"']*["'][^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi

/** HTML: the page's text, its diagram blocks as drawings */
function htmlParas(html: string): ImportPara[] {
  const out: ImportPara[] = []
  let at = 0
  for (const m of html.matchAll(HTML_DIAGRAM)) {
    const lang = FENCE_LANG[(m[2] ?? m[4]).toLowerCase()]
    if (!lang) continue
    out.push(...fromHtml(html.slice(at, m.index)))
    out.push(...diagramParas(lang, decodeEntities((m[3] ?? m[5]).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))))
    at = m.index! + m[0].length
  }
  out.push(...fromHtml(html.slice(at)))
  return out
}

/** an SVG file's picture, or (when it has no <svg> element) why, and its text */
function svgParas(src: string): ImportPara[] {
  try {
    return [{ runs: [], align: 'center', image: svgImage(src) }]
  } catch (e) {
    return [
      { runs: [{ text: `SVG picture not drawn: ${(e as Error).message}`, set: { i: true, color: '#9c2a2a' } }] },
      { runs: [{ text: src.replace(/\s+$/, ''), set: { font: 'Courier New', sz: 10 } }] },
    ]
  }
}

/** a document of a file's pictures (an SVG, a diagram's drawings): landscape when they are wide */
function pictureDocx(paras: ImportPara[]): Promise<Blob> {
  const wide = paras.some((p) => p.image && p.image.w > 640 && p.image.w > p.image.h * 1.25)
  return parasToDocx(paras, { landscape: wide })
}

/** Builds the workbook (CSV, TSV) or document (text, Markdown, HTML, SVG, diagrams) a plain file opens as; `name` names the sheet. */
export function plainToOffice(text: string, format: PlainFormat, name = ''): Promise<Blob> {
  switch (format) {
    case 'csv':
    case 'tsv': {
      const sep = format === 'tsv' ? '\t' : detectSeparator(text)
      return rowsToXlsx(parseCsv(text, sep), (unpackedName(name) ?? name).replace(/\.[^./\\]+$/, '') || 'Sheet1', sep === ';')
    }
    case 'text':
      return parasToDocx(textToParas(text))
    case 'markdown':
      return parasToDocx(markdownParas(text))
    case 'html':
      return parasToDocx(htmlParas(text))
    case 'svg':
      return pictureDocx(svgParas(text))
    case 'mermaid':
    case 'plantuml':
    case 'graphviz':
      return pictureDocx(diagramParas(format, text))
  }
}
