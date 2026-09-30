import { readFileBytes, writeFileBytes } from '../api'
import { DocxDocument } from './document'

export interface DocxLoadResult {
  doc: DocxDocument
  html: string
  blockCount: number
}

export async function loadDocxDocument(path: string): Promise<DocxLoadResult> {
  const raw = await readFileBytes(path)
  const res = await DocxDocument.open(new Uint8Array(raw))
  return { doc: res.document, html: res.html, blockCount: res.blockCount }
}

export async function saveDocxDocument(
  path: string,
  doc: DocxDocument,
  editedByBid: Map<string, string>,
): Promise<number> {
  const bytes = await doc.save(editedByBid)
  await writeFileBytes(path, bytes)
  return bytes.length
}
