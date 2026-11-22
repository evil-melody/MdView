/**
 * Rich Text Format (.rtf) → DOCX: text, character / paragraph formatting and styles, lists (list tables and the
 * older \pn numbering), tables (merged and nested cells), sections and page setup, headers / footers, footnotes /
 * endnotes, fields (hyperlinks, page numbers), bookmarks, pictures (PNG, JPEG, bitmaps) and text boxes.
 * Spec: RTF 1.9.1.
 */
import { packDocx } from './docx'
import { RtfReader } from './reader'

/** Converts an RTF file (its bytes) to a DOCX file. */
export async function rtfToDocx(bytes: Uint8Array): Promise<Blob> {
  let k = 0
  while (k < bytes.length && k < 64 && (bytes[k] <= 0x20 || bytes[k] === 0xef || bytes[k] === 0xbb || bytes[k] === 0xbf)) k++
  if (bytes[k] !== 0x7b || bytes[k + 1] !== 0x5c || !/^(rtf|urtf|pwd)/.test(String.fromCharCode(...bytes.subarray(k + 2, k + 6))))
    throw new Error('Not an RTF file')
  const r = new RtfReader(k ? bytes.subarray(k) : bytes)
  r.run()
  r.finish()
  return packDocx(r)
}
