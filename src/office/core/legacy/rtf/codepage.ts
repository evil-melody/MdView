/** Code pages of RTF text: `\ansicpg`, `\mac` / `\pc`, font `\fcharset` / `\cpg`, decoded with TextDecoder. */

/** symbol fonts (\fcharset2): bytes become U+F0xx, the code points Word gives their glyphs */
export const CP_SYMBOL = 42

/** \fcharset → code page (0: the document's \ansicpg) */
const CHARSET_CP: Record<number, number> = {
  0: 1252, 1: 0, 2: CP_SYMBOL, 77: 10000, 78: 10001, 79: 10003, 80: 10008, 81: 10002, 83: 10005, 84: 10004, 85: 10006,
  86: 10081, 87: 10021, 88: 10029, 89: 10007, 128: 932, 129: 949, 130: 1361, 134: 936, 136: 950, 161: 1253, 162: 1254,
  163: 1258, 177: 1255, 178: 1256, 186: 1257, 204: 1251, 222: 874, 238: 1250, 254: 437, 255: 850,
}

const DBCS = new Set([932, 936, 949, 950, 1361])

/** the code page of a font's \fcharset, given the document's code page */
export function charsetCp(charset: number | undefined, ansi: number): number {
  if (charset === undefined) return ansi
  const cp = CHARSET_CP[charset]
  if (cp === undefined || cp === 0) return ansi
  // ANSI fonts in an East Asian document: the bytes are in the document's code page (files from non-Word writers)
  if (charset === 0 && DBCS.has(ansi)) return ansi
  return cp
}

const LABEL: Record<number, string> = {
  874: 'windows-874', 932: 'shift_jis', 936: 'gbk', 949: 'euc-kr', 950: 'big5', 1361: 'euc-kr', 866: 'ibm866',
  10000: 'macintosh', 10001: 'shift_jis', 10002: 'big5', 10003: 'euc-kr', 10007: 'x-mac-cyrillic', 10008: 'gbk',
  10029: 'macintosh', 20866: 'koi8-r', 21866: 'koi8-u', 20932: 'euc-jp', 51932: 'euc-jp', 50220: 'iso-2022-jp',
  54936: 'gb18030', 65001: 'utf-8', 1200: 'utf-16le', 1201: 'utf-16be',
}
for (let k = 1250; k <= 1258; k++) LABEL[k] = `windows-${k}`
for (let k = 1; k <= 16; k++) if (k !== 12) LABEL[28590 + k] = `iso-8859-${k}`

// DOS code pages (no TextDecoder label): 0x80-0xFF
const OEM: Record<number, string> = {
  437:
    'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ',
  850:
    'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ',
}

const decoders = new Map<number, TextDecoder | null>()

function decoder(cp: number): TextDecoder | null {
  let d = decoders.get(cp)
  if (d !== undefined) return d
  try {
    d = new TextDecoder(LABEL[cp] ?? 'windows-1252')
  } catch {
    d = null
  }
  decoders.set(cp, d)
  return d
}

/** a known code page number (\ansicpg, \cpg) or undefined */
export function knownCp(cp: number): number | undefined {
  return cp === CP_SYMBOL || LABEL[cp] || OEM[cp] ? cp : undefined
}

/** Decodes bytes of code page `cp`. */
export function decode(bytes: Uint8Array, cp: number): string {
  if (cp === CP_SYMBOL) {
    let s = ''
    for (let k = 0; k < bytes.length; k++) s += String.fromCharCode(bytes[k] < 0x20 ? bytes[k] : 0xf000 + bytes[k])
    return s
  }
  const oem = OEM[cp]
  if (oem) {
    let s = ''
    for (let k = 0; k < bytes.length; k++) s += bytes[k] < 0x80 ? String.fromCharCode(bytes[k]) : oem[bytes[k] - 0x80]
    return s
  }
  return (decoder(cp) ?? decoder(1252)!).decode(bytes)
}
