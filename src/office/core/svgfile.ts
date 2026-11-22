/**
 * An SVG file as the picture of a document: its size read from the root element (width / height in any unit, else
 * the viewBox), the root given the SVG namespace when the file leaves it out (an <img> of image/svg+xml shows
 * nothing without it). The drawing itself is kept as it is: an <img> runs no script and loads nothing external.
 */
import type { ImportImage } from './convert'
import { decodeEntities } from './html'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

/** the text is an SVG document: an XML declaration, comments and a doctype may come before the root */
export const isSvg = (text: string): boolean =>
  /^﻿?\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE\s+svg[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s/>]/i.test(text)

/** the root <svg …> tag: where its attributes are (quotes may hold ">") */
function rootTag(text: string): { at: number; attrs: string } | null {
  const m = /<svg(?=[\s/>])/i.exec(text)
  if (!m) return null
  let q = ''
  let i = m.index + 4
  for (; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === q) q = ''
    } else if (c === '"' || c === "'") q = c
    else if (c === '>') break
  }
  if (i >= text.length) return null
  return { at: m.index + 4, attrs: text.slice(m.index + 4, text[i - 1] === '/' ? i - 1 : i) }
}

/** an attribute's value (stroke-width is not width) */
function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs)
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined
}

/** CSS / SVG units in px (1/96 in); em and ex at the default 16 px font */
const UNIT: Record<string, number> = { '': 1, px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, em: 16, ex: 8 }

/** a positive length in px, or undefined (a percentage, 0, or not a length) */
function px(v: string | undefined): number | undefined {
  if (v === undefined) return
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(v)
  if (!m) return
  const k = UNIT[m[2].toLowerCase()]
  if (k === undefined) return
  const n = +m[1] * k
  return n > 0 && isFinite(n) ? n : undefined
}

/** the viewBox's width and height, when both are positive */
function viewBox(v: string | undefined): { w: number; h: number } | undefined {
  const n = (v ?? '').trim().split(/[\s,]+/).map(Number)
  return n.length === 4 && n.every(isFinite) && n[2] > 0 && n[3] > 0 ? { w: n[2], h: n[3] } : undefined
}

/**
 * The picture an SVG file is: its size in px (width / height; one of them with the viewBox's ratio; the viewBox;
 * else 300 × 150, a browser's default), its <title> as alt text, its root declaring the namespaces it uses. Throws
 * when the text has no <svg> element.
 */
export function svgImage(text: string): ImportImage {
  const root = rootTag(text)
  if (!root) throw new Error('no <svg> element')
  const vb = viewBox(attr(root.attrs, 'viewBox'))
  let w = px(attr(root.attrs, 'width'))
  let h = px(attr(root.attrs, 'height'))
  if (vb) {
    if (w && !h) h = (w * vb.h) / vb.w
    else if (h && !w) w = (h * vb.w) / vb.h
    else if (!w && !h) ({ w, h } = vb)
  }
  let ns = ''
  if (!/(?:^|\s)xmlns\s*=/.test(root.attrs)) ns += ` xmlns="${SVG_NS}"`
  if (/\bxlink:/.test(text) && !/(?:^|\s)xmlns:xlink\s*=/.test(root.attrs)) ns += ` xmlns:xlink="${XLINK_NS}"`
  const svg = ns ? text.slice(0, root.at) + ns + text.slice(root.at) : text
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1]
  const alt = title ? decodeEntities(title.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() : ''
  return { svg, w: w ?? 300, h: h ?? 150, alt: alt || 'SVG picture' }
}
