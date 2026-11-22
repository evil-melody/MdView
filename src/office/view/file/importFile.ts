import { extOf, PLAIN_EXT, plainFormat, unpackedName } from '../../core/plain'
import { LEGACY_EXT, legacyFormatOf } from '../../core/legacy'

// .pages / .key / .numbers (Apple iWork) open as read-only Word / PowerPoint / Excel files
const OFFICE = new Set(['docx', 'dotx', 'xlsx', 'xltx', 'pptx', 'potx', 'pages', 'key', 'numbers'])

/** `accept` of the File → Open picker */
export const OPEN_ACCEPT = [...OFFICE, ...Object.keys(LEGACY_EXT), ...Object.keys(PLAIN_EXT), 'gz'].map((e) => '.' + e).join(',')

export interface Imported {
  src: Blob
  name: string
  /** built from another format: not saved as an Office file yet */
  converted: boolean
  /** a preview of the source being edited (the shown document stays until it is ready) */
  live?: boolean
}

/**
 * Office and iWork (Pages, Keynote, Numbers) files open as they are; Word / Excel / PowerPoint 97-2003, RTF and
 * OpenDocument files are converted to Office Open XML; CSV / TSV become a workbook, text / Markdown / HTML, SVG and
 * Mermaid / PlantUML / Graphviz diagrams a document, also gzip-compressed (.svgz, .csv.gz).
 */
export async function importFile(file: File): Promise<Imported> {
  const ext = extOf(file.name)
  if (OFFICE.has(ext)) return { src: file, name: file.name, converted: false }
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer())
  // .doc / .xls / .ppt, RTF, OpenDocument (a ZIP), whatever the name says when the bytes are a compound file, RTF or flat XML
  if ((LEGACY_EXT[ext] && ext !== 'dot') || legacyFormatOf(head)) return { src: file, name: file.name, converted: true }
  // by the extension (also the one inside a .gz name), the bytes deciding (a binary .dot is a Word 97 template, not a Graphviz graph)
  const format = (PLAIN_EXT[ext] || unpackedName(file.name)) && plainFormat(file.name, file.type, head, file.size <= 4096)
  // converted by the engine, like any src: the document keeps the file's name, format and source
  if (format) return { src: file, name: file.name, converted: true }
  // no / unknown extension: an Office package is a ZIP
  if (head[0] === 0x50 && head[1] === 0x4b) return { src: file, name: file.name, converted: false }
  throw new Error(
    `Cannot open “${file.name}”: supported files are Word, Excel, PowerPoint (also 97-2003), OpenDocument, RTF, Pages, Keynote, Numbers, CSV, text, Markdown, HTML, SVG, Mermaid, PlantUML and Graphviz (also gzip-compressed: .svgz, .csv.gz)`,
  )
}
