/**
 * Apple iWork documents, opened read-only: Pages documents are converted to DOCX, Keynote presentations to PPTX,
 * Numbers spreadsheets to XLSX.
 */
import { BlobSource } from '../source'
import { ZipArchive } from '../zip'
import { IworkPackage } from './iwa'
import { keynoteToPptx } from './keynote'
import { numbersToXlsx } from './numbers'
import { pagesToDocx } from './pages'

export { isIworkZip } from './iwa'

export type IworkApp = 'pages' | 'keynote' | 'numbers'

/** TP.DocumentArchive; KN.ShowArchive (KN.DocumentArchive.show; Numbers' document has no field 2) */
const PAGES_DOCUMENT = 10000
const KEYNOTE_SHOW = 2

const hasSlides = (zip: ZipArchive) => zip.list().some((e) => /(^|\/)index\/(master)?slide[^/]*\.iwa$/i.test(e.name))

/** Converts a Pages, Keynote or Numbers package to the Office archive it is shown as. */
export async function openIwork(zip: ZipArchive): Promise<{ zip: ZipArchive; from: IworkApp }> {
  if (zip.list().some((e) => /(^|\/)\.iwp(h|v2)$/i.test(e.name))) throw new Error('Password-protected iWork documents are not supported')
  const pkg = await IworkPackage.open(zip)
  let from: IworkApp
  let file: Blob
  if (pkg.ofType(PAGES_DOCUMENT).length) {
    from = 'pages'
    file = await pagesToDocx(pkg)
  } else if (hasSlides(zip) || pkg.type(pkg.get(1)?.ref(2)) === KEYNOTE_SHOW) {
    from = 'keynote'
    file = await keynoteToPptx(pkg)
  } else {
    from = 'numbers'
    file = await numbersToXlsx(pkg)
  }
  return { zip: await ZipArchive.open(new BlobSource(file)), from }
}

/** iWork '09 and older packages: XML in index.xml(.gz) / index.apxl(.gz) */
export function isLegacyIwork(zip: ZipArchive): boolean {
  return ['index.xml.gz', 'index.xml', 'index.apxl.gz', 'index.apxl'].some((n) => zip.has(n))
}
