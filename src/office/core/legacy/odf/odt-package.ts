/** WordprocessingML pieces of the OpenDocument text converter: runs, notes, settings, core properties and the package. */
import { Part } from '../../iwork/ooxml'
import { escText } from '../../raw'
import { writeZip, type PartData } from '../../zipwrite'
import { child, children, type ONode, textContent } from './common'
import type { OdtMedia } from './odt-draw'
import { tw, XML_HEAD } from './odt-props'

export const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"'

export const WML = 'application/vnd.openxmlformats-officedocument.wordprocessingml'

/** collects a paragraph's runs; adjacent text with the same properties shares a run */
export class Runs {
  private out = ''
  private buf = ''
  private rPr = ''
  /** white space collapsing: the last character was a space (true at the start: leading spaces go) */
  space = true
  inLink = false

  text(t: string, rPr: string) {
    if (rPr !== this.rPr) this.flush()
    this.rPr = rPr
    this.buf += t
  }

  raw(x: string) {
    this.flush()
    this.out += x
  }

  private flush() {
    if (this.buf) this.out += runXml(this.buf, this.rPr)
    this.buf = ''
  }

  xml(): string {
    this.flush()
    return this.out
  }
}

const SPECIAL = /[\t\n\u00ad\u2011]/
/** carriage returns and lone surrogate halves (escText drops the other characters XML cannot hold) */
const DIRTY = /[\r\ud800-\udfff]/
const CLEAN = /\r|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g

const tText = (t: string) => {
  const x = escText(DIRTY.test(t) ? t.replace(CLEAN, '') : t)
  return x ? `<w:t xml:space="preserve">${x}</w:t>` : ''
}

/** a run of text: tabs, breaks and hyphens become their elements; characters XML cannot hold are dropped */
function runXml(t: string, rPr: string): string {
  let out = ''
  if (!SPECIAL.test(t)) out = tText(t)
  else
    for (const part of t.split(/([\t\n\u00ad\u2011])/)) {
      if (part === '\t') out += '<w:tab/>'
      else if (part === '\n') out += '<w:br/>'
      else if (part === '\u00ad') out += '<w:softHyphen/>'
      else if (part === '\u2011') out += '<w:noBreakHyphen/>'
      else if (part) out += tText(part)
    }
  return out ? `<w:r>${rPr}${out}</w:r>` : ''
}

/** puts runs at the start of the first paragraph of some blocks (a new paragraph when they start otherwise) */
export function prependRuns(xml: string, runs: string): string {
  if (!runs) return xml
  if (xml.startsWith('<w:p><w:pPr>')) {
    const i = xml.indexOf('</w:pPr>') + 8
    return xml.slice(0, i) + runs + xml.slice(i)
  }
  if (xml.startsWith('<w:p>')) return '<w:p>' + runs + xml.slice(5)
  return `<w:p>${runs}</w:p>${xml}`
}

/** a cell, text box or note ends with a paragraph */
export const endWithParagraph = (xml: string) => (/(<\/w:p>|<w:p\/>)$/.test(xml) ? xml : xml + '<w:p/>')

/** an ODF date (time) → W3C date time in UTC, seconds precision ('' when not one) */
export function isoDate(v: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}:\d{2})?/.exec(v)
  return m ? `${m[1]}${m[2] ?? 'T00:00:00'}Z` : ''
}

/** footnotes.xml / endnotes.xml: Word's separators, then the notes */
export function notesXml(cls: 'footnote' | 'endnote', notes: string[]): string {
  const sep = (type: string, id: number, el: string) =>
    `<w:${cls} w:type="${type}" w:id="${id}"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:${el}/></w:r></w:p></w:${cls}>`
  return `${XML_HEAD}<w:${cls}s ${NS}>${sep('separator', -1, 'separator')}${sep('continuationSeparator', 0, 'continuationSeparator')}${notes.join('')}</w:${cls}s>`
}

export interface SettingsOpts {
  /** default tab stop distance, points */
  tab?: number
  background: boolean
  evenOdd: boolean
  /** numbering formats of the notes (undefined: the document has none) */
  footnotes?: string
  endnotes?: string
}

/** settings.xml */
export function settingsXml(o: SettingsOpts): string {
  const fmt = (f: string) => (f ? `<w:numFmt w:val="${f}"/>` : '')
  return (
    `${XML_HEAD}<w:settings ${NS}>` +
    (o.background ? '<w:displayBackgroundShape/>' : '') +
    `<w:defaultTabStop w:val="${tw(o.tab && o.tab > 1 ? o.tab : 36)}"/>` +
    (o.evenOdd ? '<w:evenAndOddHeaders/>' : '') +
    (o.footnotes !== undefined ? `<w:footnotePr>${fmt(o.footnotes)}<w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>` : '') +
    (o.endnotes !== undefined ? `<w:endnotePr>${fmt(o.endnotes)}<w:endnote w:id="-1"/><w:endnote w:id="0"/></w:endnotePr>` : '') +
    '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
    '</w:settings>'
  )
}

/** docProps/core.xml from the document's office:meta (undefined when it says nothing) */
export function coreXml(metaRoot: ONode | undefined): string | undefined {
  const meta = child(metaRoot, 'office:meta')
  if (!meta) return undefined
  const get = (n: string) => {
    const el = child(meta, n)
    return el ? textContent(el).trim() : ''
  }
  let x = ''
  const add = (tag: string, v: string, attrs = '') => {
    if (v) x += `<${tag}${attrs}>${escText(v)}</${tag}>`
  }
  add('dc:title', get('dc:title'))
  add('dc:subject', get('dc:subject'))
  add('dc:creator', get('meta:initial-creator') || get('dc:creator'))
  add('cp:keywords', children(meta, 'meta:keyword').map((k) => textContent(k).trim()).join(', '))
  add('dc:description', get('dc:description'))
  add('cp:lastModifiedBy', get('dc:creator'))
  add('dcterms:created', isoDate(get('meta:creation-date')), ' xsi:type="dcterms:W3CDTF"')
  add('dcterms:modified', isoDate(get('dc:date')), ' xsi:type="dcterms:W3CDTF"')
  if (!x) return undefined
  return (
    `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
    `xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${x}</cp:coreProperties>`
  )
}

/** a part of the package (besides document.xml) and how word/document.xml relates to it */
export interface PackPart {
  path: string
  xml: string
  type: string
  /** relationship type from the document (none: referenced otherwise, e.g. headers) */
  rel?: string
  /** the part's own relationships */
  part?: Part
}

/** Writes the DOCX package. */
export function packDocx(documentXml: string, doc: Part, parts: PackPart[], media: OdtMedia, core: string | undefined): Promise<Blob> {
  const files = new Map<string, PartData>()
  let overrides = `<Override PartName="/word/document.xml" ContentType="${WML}.document.main+xml"/>`
  for (const p of parts) {
    files.set(p.path, p.xml)
    overrides += `<Override PartName="/${p.path}" ContentType="${p.type}"/>`
    if (p.rel) doc.rel(p.rel, p.path.slice(5))
    if (p.part?.rels.length) files.set(p.part.relsPath, p.part.relsXml())
  }
  for (const [name, bytes] of media.files) files.set(name, bytes)
  let rootRels = '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  if (core) {
    files.set('docProps/core.xml', core)
    overrides += '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    rootRels += '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
  }
  files.set(
    '[Content_Types].xml',
    `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>${media.types()}${overrides}</Types>`,
  )
  files.set('_rels/.rels', `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rootRels}</Relationships>`)
  files.set('word/document.xml', documentXml)
  files.set(doc.relsPath, doc.relsXml())
  return writeZip(files, `${WML}.document`)
}
