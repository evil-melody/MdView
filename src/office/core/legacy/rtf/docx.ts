/** The DOCX package of a read RTF document: document, styles, numbering, settings, headers / footers, notes, media. */
import { mediaTypes, XML_HEAD } from '../../iwork/ooxml'
import { writeZip, type PartData } from '../../zipwrite'
import { rPrSet } from './props'
import type { RtfReader } from './reader'

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"'

const WML = 'application/vnd.openxmlformats-officedocument.wordprocessingml'

const SEP = '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>'
const separators = (tag: string) =>
  `<w:${tag} w:type="separator" w:id="-1"><w:p>${SEP}<w:r><w:separator/></w:r></w:p></w:${tag}>` +
  `<w:${tag} w:type="continuationSeparator" w:id="0"><w:p>${SEP}<w:r><w:continuationSeparator/></w:r></w:p></w:${tag}>`

export function packDocx(r: RtfReader): Promise<Blob> {
  const files = new Map<string, PartData>()
  const doc = r.docPart
  let overrides = `<Override PartName="/word/document.xml" ContentType="${WML}.document.main+xml"/>`
  const add = (path: string, type: string, xml: string) => {
    files.set(path, xml)
    overrides += `<Override PartName="/${path}" ContentType="${WML}.${type}+xml"/>`
  }

  // styles: the document defaults, then the stylesheet's styles
  const st = r.styles
  const dRPr = rPrSet(r.tables, st.defChp)
  add(
    'word/styles.xml',
    'styles',
    `${XML_HEAD}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr>${dRPr}</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr/></w:pPrDefault></w:docDefaults>${st.xml()}</w:styles>`,
  )
  doc.rel('styles', 'styles.xml')

  const numbering = r.num.xml()
  if (numbering) {
    add('word/numbering.xml', 'numbering', `${XML_HEAD}<w:numbering ${NS}>${numbering}</w:numbering>`)
    doc.rel('numbering', 'numbering.xml')
  }

  const d = r.doc
  const notes = r.footnotes.length > 0
  const ends = r.endnotes.length > 0
  add(
    'word/settings.xml',
    'settings',
    `${XML_HEAD}<w:settings ${NS}>${d.mirror ? '<w:mirrorMargins/>' : ''}<w:defaultTabStop w:val="${d.deftab}"/>${d.facing ? '<w:evenAndOddHeaders/>' : ''}` +
      '<w:characterSpacingControl w:val="doNotCompress"/>' +
      (notes ? '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>' : '') +
      (ends ? '<w:endnotePr><w:endnote w:id="-1"/><w:endnote w:id="0"/></w:endnotePr>' : '') +
      '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>',
  )
  doc.rel('settings', 'settings.xml')

  if (notes) {
    add('word/footnotes.xml', 'footnotes', `${XML_HEAD}<w:footnotes ${NS}>${separators('footnote')}${r.footnotes.join('')}</w:footnotes>`)
    doc.rel('footnotes', 'footnotes.xml')
    if (r.notePart.rels.length) files.set(r.notePart.relsPath, r.notePart.relsXml())
  }
  if (ends) {
    add('word/endnotes.xml', 'endnotes', `${XML_HEAD}<w:endnotes ${NS}>${separators('endnote')}${r.endnotes.join('')}</w:endnotes>`)
    doc.rel('endnotes', 'endnotes.xml')
    if (r.endPart.rels.length) files.set(r.endPart.relsPath, r.endPart.relsXml())
  }

  for (const [path, { part, xml }] of r.hfFiles) {
    const header = /\/header\d+\.xml$/.test(path)
    const tag = header ? 'hdr' : 'ftr'
    add(path, header ? 'header' : 'footer', `${XML_HEAD}<w:${tag} ${NS}>${xml}</w:${tag}>`)
    if (part.rels.length) files.set(part.relsPath, part.relsXml())
  }

  for (const [path, bytes] of r.media.files) files.set(path, bytes)
  const body = r.body.blocks.join('') || '<w:p/>'
  files.set('word/document.xml', `${XML_HEAD}<w:document ${NS}><w:body>${body}${r.finalSect}</w:body></w:document>`)
  files.set(doc.relsPath, doc.relsXml())
  files.set(
    '_rels/.rels',
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  )
  files.set(
    '[Content_Types].xml',
    `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>${mediaTypes(r.media.files.keys())}${overrides}</Types>`,
  )
  return writeZip(files, `${WML}.document`)
}
