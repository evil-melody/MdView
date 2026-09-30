/**
 * Tauri-facing IO for the pptx document. Kept apart from `document.ts` so the render/edit core
 * stays runnable outside the desktop shell (browser harness, node verification script).
 */
import { readFileBytes, writeFileBytes } from '../api'
import { PptxDocument } from './document'

export async function loadPptxDocument(
  path: string,
  opts: { onProgress?: (parsed: number, total: number) => void | Promise<void> } = {},
): Promise<PptxDocument> {
  const raw = await readFileBytes(path)
  return PptxDocument.open(new Uint8Array(raw), opts)
}

/** Persist the edited package back to the original path (raw bytes over the Tauri IPC bridge). */
export async function savePptxDocument(path: string, doc: PptxDocument): Promise<number> {
  const bytes = await doc.save()
  await writeFileBytes(path, bytes)
  return bytes.length
}

export { PptxDocument }
export type { EditableTextBox, ElementBox, OpOutcome, RenderedSlide } from './document'
