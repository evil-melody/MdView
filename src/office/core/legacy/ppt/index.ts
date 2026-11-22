/** PowerPoint 97-2003 binary presentations (.ppt, MS-PPT) → PPTX. */
import type { Cfb } from '../cfb'
import { PptConverter } from './convert'

/** Converts the presentation in a compound file to a PPTX file. */
export async function pptToPptx(cfb: Cfb): Promise<Blob> {
  return new PptConverter(cfb).convert()
}
