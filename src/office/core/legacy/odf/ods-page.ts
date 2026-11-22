/** The page setup, view settings and comment shapes of the sheets of an OpenDocument spreadsheet, as XLSX writes them. */
import { escText } from '../../raw'
import { child, children, textContent, toPt, type OdfStyles, type ONode } from './common'

const rep = (v: string | undefined) => {
  const n = Number.parseInt(v ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}
const inch = (pt: number | undefined, def: number) => +((pt ?? def * 72) / 72).toFixed(3)

/** the view settings of settings.xml: per table config items, active table, gridlines */
export function viewSettings(root: ONode | undefined) {
  const tables = new Map<string, Map<string, string>>()
  const global = new Map<string, string>()
  const settings = root && (root.name === 'office:settings' ? root : child(root, 'office:settings'))
  for (const set of children(settings, 'config:config-item-set')) {
    if (set.attrs['config:name'] !== 'ooo:view-settings') continue
    const views = children(set, 'config:config-item-map-indexed').find((n) => n.attrs['config:name'] === 'Views')
    const view = children(views, 'config:config-item-map-entry')[0]
    for (const k of children(view)) {
      if (k.name === 'config:config-item') global.set(k.attrs['config:name'], textContent(k).trim())
      else if (k.name === 'config:config-item-map-named' && k.attrs['config:name'] === 'Tables') {
        for (const e of children(k, 'config:config-item-map-entry')) {
          const m = new Map<string, string>()
          for (const it of children(e, 'config:config-item')) m.set(it.attrs['config:name'], textContent(it).trim())
          tables.set(e.attrs['config:name'], m)
        }
      }
    }
  }
  return { tables, global }
}

/** header / footer text with Excel's codes (&P page, &N pages, &A sheet, &F file, &D date, &T time) */
function hfText(n: ONode): string {
  const walk = (x: ONode | string): string => {
    if (typeof x === 'string') return x.replace(/&/g, '&&')
    switch (x.name) {
      case 'text:page-number':
        return '&P'
      case 'text:page-count':
        return '&N'
      case 'text:sheet-name':
        return '&A'
      case 'text:title':
      case 'text:file-name':
        return '&F'
      case 'text:date':
        return '&D'
      case 'text:time':
        return '&T'
      case 'text:s':
        return ' '.repeat(Math.min(rep(x.attrs['text:c']), 100))
      case 'text:tab':
        return ' '
      case 'text:line-break':
        return '\n'
    }
    return x.kids.map(walk).join('')
  }
  return children(n)
    .filter((p) => p.name === 'text:p' || p.name === 'text:h')
    .map(walk)
    .join('\n')
}

function headerFooter(n: ONode | undefined): string {
  if (!n || n.attrs['style:display'] === 'false') return ''
  const l = child(n, 'style:region-left')
  const c = child(n, 'style:region-center')
  const r = child(n, 'style:region-right')
  let out = ''
  if (l || c || r) {
    for (const [code, region] of [['&L', l], ['&C', c], ['&R', r]] as const) {
      const t = region ? hfText(region) : ''
      if (t) out += code + t
    }
  } else {
    const t = hfText(n)
    if (t) out = '&C' + t
  }
  return out.slice(0, 255)
}

/** Excel paper sizes by their size in points (portrait) */
const PAPER: [number, number, number][] = [
  [1, 612, 792],
  [5, 612, 1008],
  [9, 595.3, 841.9],
  [8, 841.9, 1190.6],
  [11, 419.5, 595.3],
  [13, 515.9, 728.5],
  [12, 728.5, 1031.8],
  [7, 522, 756],
  [3, 792, 1224],
]

/** printOptions, pageMargins, pageSetup and headerFooter of a sheet printed with a master page */
export function pageSetup(st: OdfStyles, master: string | undefined): { xml: string; fit: boolean } {
  const mp = (master && st.masterPages.get(master)) || st.masterPages.get('Default') || [...st.masterPages.values()][0]
  const layout = mp ? st.pageLayouts.get(mp.attrs['style:page-layout-name']) : undefined
  const lp = child(layout, 'style:page-layout-properties')?.attrs ?? {}
  const hp = child(child(layout, 'style:header-style'), 'style:header-footer-properties')?.attrs
  const fp = child(child(layout, 'style:footer-style'), 'style:header-footer-properties')?.attrs
  const head = headerFooter(child(mp, 'style:header'))
  const foot = headerFooter(child(mp, 'style:footer'))
  // left pages: the same as right ones unless shown on their own
  const evenHead = child(mp, 'style:header-left')
  const evenFoot = child(mp, 'style:footer-left')
  const eh = evenHead && evenHead.attrs['style:display'] !== 'false' ? headerFooter(evenHead) : head
  const ef = evenFoot && evenFoot.attrs['style:display'] !== 'false' ? headerFooter(evenFoot) : foot
  const mt = toPt(lp['fo:margin-top']) ?? 0.79 * 72
  const mb = toPt(lp['fo:margin-bottom']) ?? 0.79 * 72
  const hh = head && hp ? (toPt(hp['fo:min-height']) ?? 0) + (toPt(hp['fo:margin-bottom']) ?? 0) : 0
  const fh = foot && fp ? (toPt(fp['fo:min-height']) ?? 0) + (toPt(fp['fo:margin-top']) ?? 0) : 0
  let xml = ''
  const print = lp['style:print'] ?? ''
  const center = lp['style:table-centering'] ?? ''
  const po =
    (/\bheaders\b/.test(print) ? ' headings="1"' : '') +
    (/\bgrid\b/.test(print) ? ' gridLines="1"' : '') +
    (center === 'horizontal' || center === 'both' ? ' horizontalCentered="1"' : '') +
    (center === 'vertical' || center === 'both' ? ' verticalCentered="1"' : '')
  if (po) xml += `<printOptions${po}/>`
  xml +=
    `<pageMargins left="${inch(toPt(lp['fo:margin-left']), 0.79)}" right="${inch(toPt(lp['fo:margin-right']), 0.79)}" ` +
    `top="${inch(mt + hh, 0.79)}" bottom="${inch(mb + fh, 0.79)}" header="${head ? inch(mt, 0.3) : 0.3}" footer="${foot ? inch(mb, 0.3) : 0.3}"/>`
  let setup = ''
  const w = toPt(lp['fo:page-width'])
  const h = toPt(lp['fo:page-height'])
  if (w && h) {
    const [a, b] = w < h ? [w, h] : [h, w]
    const paper = PAPER.find((p) => Math.abs(p[1] - a) < 4 && Math.abs(p[2] - b) < 4)
    if (paper) setup += ` paperSize="${paper[0]}"`
  }
  const scale = Number.parseInt(lp['style:scale-to'] ?? '', 10)
  if (scale > 0 && scale !== 100) setup += ` scale="${Math.max(10, Math.min(400, scale))}"`
  const fx = Number.parseInt(lp['style:scale-to-X'] ?? lp['loext:scale-to-X'] ?? '', 10)
  const fy = Number.parseInt(lp['style:scale-to-Y'] ?? lp['loext:scale-to-Y'] ?? '', 10)
  const pages = Number.parseInt(lp['style:scale-to-pages'] ?? '', 10)
  const fit = fx > 0 || fy > 0 || pages > 0
  if (fit) setup += ` fitToWidth="${fx > 0 ? fx : pages > 0 ? 1 : 0}" fitToHeight="${fy > 0 ? fy : pages > 0 ? pages : 0}"`
  if (lp['style:print-page-order'] === 'ltr') setup += ' pageOrder="overThenDown"'
  const orient = lp['style:print-orientation']
  if (orient === 'landscape' || orient === 'portrait') setup += ` orientation="${orient}"`
  const first = Number.parseInt(lp['style:first-page-number'] ?? '', 10)
  if (first > 0 && first !== 1) setup += ` firstPageNumber="${first}" useFirstPageNumber="1"`
  if (setup) xml += `<pageSetup${setup}/>`
  if (head || foot) {
    const diff = eh !== head || ef !== foot
    xml +=
      `<headerFooter${diff ? ' differentOddEven="1"' : ''}>` +
      (head ? `<oddHeader>${escText(head)}</oddHeader>` : '') +
      (foot ? `<oddFooter>${escText(foot)}</oddFooter>` : '') +
      (diff && eh ? `<evenHeader>${escText(eh)}</evenHeader>` : '') +
      (diff && ef ? `<evenFooter>${escText(ef)}</evenFooter>` : '') +
      '</headerFooter>'
  }
  return { xml, fit }
}

/** the VML shapes Excel shows notes with */
export function vmlNotes(notes: { r: number; c: number; shown: boolean }[], block: number): string {
  const blocks = Array.from({ length: Math.ceil((notes.length + 1) / 1024) }, (_, i) => block + i).join(',')
  const shapes = notes
    .map(({ r, c, shown }, i) => {
      const id = block * 1024 + i + 1
      return (
        `<v:shape id="_x0000_s${id}" type="#_x0000_t202" style="position:absolute;margin-left:59.25pt;margin-top:1.5pt;width:108pt;height:59.25pt;z-index:${i + 1};visibility:${shown ? 'visible' : 'hidden'}" fillcolor="#ffffe1" o:insetmode="auto">` +
        `<v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/>` +
        `<v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox>` +
        `<x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>${c + 1}, 15, ${r}, 2, ${c + 3}, 15, ${r + 4}, 16</x:Anchor>` +
        `<x:AutoFill>False</x:AutoFill><x:Row>${r}</x:Row><x:Column>${c}</x:Column>${shown ? '<x:Visible/>' : ''}</x:ClientData></v:shape>`
      )
    })
    .join('')
  return (
    `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="${blocks}"/></o:shapelayout>` +
    `<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>` +
    `${shapes}</xml>`
  )
}

