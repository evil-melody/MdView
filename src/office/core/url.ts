/** Link schemes a document may open; any other (javascript:, data:, vbscript:, file:…) is shown as plain text. */
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'sms', 'ftp', 'ftps'])

/**
 * A document's link target, or undefined when following it could run code: web, mail, phone and FTP links, and
 * relative or in-document (`#bookmark`) targets are kept. The scheme is read the way a browser reads it.
 */
export function safeHref(href: string | null | undefined): string | undefined {
  if (!href) return undefined
  // browsers drop leading / trailing controls and spaces, and tabs / newlines anywhere: "java\tscript:" is a script link
  const url = href.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '')
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1].toLowerCase()
  return !scheme || SAFE_SCHEMES.has(scheme) ? href : undefined
}
