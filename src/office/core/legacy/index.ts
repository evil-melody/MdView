/**
 * Other word-processing, spreadsheet and presentation formats, converted in the worker to the Office Open XML file
 * the views show and edit (saving writes that file):
 * - Word 97-2003 (.doc), Excel 97-2003 (.xls), PowerPoint 97-2003 (.ppt): binary records in a compound file
 * - Rich Text Format (.rtf)
 * - OpenDocument text, spreadsheet and presentation (.odt, .ods, .odp; also templates and flat XML .fodt / .fods / .fodp)
 */
import type { DocKind } from '../opc'
import type { ZipArchive } from '../zip'
import { Cfb, isCfb } from './cfb'
import { docToDocx } from './doc'
import { odfToOoxml, odfFormatOf, type OdfFormat } from './odf'
import { pptToPptx } from './ppt'
import { rtfToDocx } from './rtf'
import { biffToXlsx, xlsToXlsx } from './xls'

export { isCfb } from './cfb'

export type LegacyFormat = 'doc' | 'xls' | 'ppt' | 'rtf' | OdfFormat

/** what each format opens as */
export const LEGACY_KIND: Record<LegacyFormat, DocKind> = { doc: 'docx', rtf: 'docx', odt: 'docx', xls: 'xlsx', ods: 'xlsx', ppt: 'pptx', odp: 'pptx' }

/** extensions of the formats (with their templates and flat XML variants) */
export const LEGACY_EXT: Record<string, LegacyFormat> = {
  doc: 'doc',
  dot: 'doc',
  xls: 'xls',
  xlt: 'xls',
  ppt: 'ppt',
  pot: 'ppt',
  pps: 'ppt',
  rtf: 'rtf',
  odt: 'odt',
  ott: 'odt',
  fodt: 'odt',
  ods: 'ods',
  ots: 'ods',
  fods: 'ods',
  odp: 'odp',
  otp: 'odp',
  fodp: 'odp',
}

/** "{\rtf" */
export function isRtf(b: Uint8Array): boolean {
  // a UTF-8 byte order mark and blank space may come first; `{\urtf` is the Unicode variant some writers emit
  let i = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0
  while (i < 64 && (b[i] === 0x20 || b[i] === 0x09 || b[i] === 0x0a || b[i] === 0x0d)) i++
  if (b[i] !== 0x7b || b[i + 1] !== 0x5c) return false
  if (b[i + 2] === 0x75) i++
  return b[i + 2] === 0x72 && b[i + 3] === 0x74 && b[i + 4] === 0x66
}

/** a flat OpenDocument file (one XML document): `<office:document` near the start */
export function isFlatOdf(b: Uint8Array): boolean {
  const t = new TextDecoder().decode(b.subarray(0, 4096))
  return /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<office:document[\s>]/.test(t.replace(/^﻿/, ''))
}

/**
 * An Excel workbook stream outside a compound file (older Excel versions, some exporters): its first record is a BOF
 * (0x0809 BIFF5/8, 0x0409 BIFF4, 0x0209 BIFF3, 0x0009 BIFF2) of a plausible length
 */
export const isBareBiff = (b: Uint8Array) => b.length >= 8 && b[0] === 0x09 && [0x00, 0x02, 0x04, 0x08].includes(b[1]) && b[3] === 0 && b[2] >= 4 && b[2] <= 20

/** the format of a file whose first bytes are a compound file, RTF, a bare Excel stream or flat OpenDocument; null for others (ZIP packages, text) */
export function legacyFormatOf(head: Uint8Array): 'cfb' | 'rtf' | 'biff' | 'flat-odf' | null {
  if (isCfb(head)) return 'cfb'
  if (isRtf(head)) return 'rtf'
  if (isBareBiff(head)) return 'biff'
  if (head[0] === 0x3c || head[0] === 0xef || (head[0] <= 0x20 && head.length > 0)) return isFlatOdf(head) ? 'flat-odf' : null
  return null
}

export interface Converted {
  /** the Office Open XML file */
  file: Blob
  format: LegacyFormat
}

/** Converts a compound file: a Word, Excel or PowerPoint 97-2003 file (also 95 and older where supported). */
export async function convertCfb(bytes: Uint8Array): Promise<Converted> {
  const cfb = Cfb.open(bytes)
  if (cfb.has('EncryptedPackage') || cfb.has('EncryptionInfo')) throw new Error('Password-protected Office files are not supported')
  if (cfb.has('WordDocument')) return { file: await docToDocx(cfb), format: 'doc' }
  if (cfb.has('Workbook') || cfb.has('Book')) return { file: await xlsToXlsx(cfb), format: 'xls' }
  if (cfb.has('PowerPoint Document')) return { file: await pptToPptx(cfb), format: 'ppt' }
  if (cfb.has('PP40')) throw new Error('PowerPoint 95 and older presentations are not supported')
  throw new Error('Not a Word, Excel or PowerPoint file (an OLE compound file without a document stream)')
}

/** Converts an Excel workbook stream that is not inside a compound file. */
export async function convertBiff(bytes: Uint8Array): Promise<Converted> {
  return { file: await biffToXlsx(bytes), format: 'xls' }
}

/** Converts an RTF file. */
export async function convertRtf(bytes: Uint8Array): Promise<Converted> {
  return { file: await rtfToDocx(bytes), format: 'rtf' }
}

/** Converts an OpenDocument package, or null when the ZIP is not one. */
export async function convertOdfZip(zip: ZipArchive): Promise<Converted | null> {
  const format = await odfFormatOf(zip)
  if (!format) {
    // OpenOffice.org 1.x (.sxw, .sxc, .sxi): the format OpenDocument came from
    if (zip.has('mimetype') && zip.has('content.xml') && /^application\/vnd\.sun\.xml\./.test((await zip.text('mimetype')).trim())) {
      throw new Error('OpenOffice.org 1.x documents are not supported (open and save them as OpenDocument first)')
    }
    return null
  }
  return { file: await odfToOoxml(zip, format), format }
}

/** Converts a flat OpenDocument file (.fodt, .fods, .fodp). */
export async function convertFlatOdf(bytes: Uint8Array): Promise<Converted> {
  const xml = new TextDecoder().decode(bytes)
  const format = await odfFormatOf(xml)
  if (!format) throw new Error('Not an OpenDocument text, spreadsheet or presentation')
  return { file: await odfToOoxml(xml, format), format }
}
