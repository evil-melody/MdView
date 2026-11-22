/**
 * 流式工作表重写 / OOXML 行补丁层（从 editor.ts 拆出，行为逐字不变）。
 * RowPatcher 只重写含编辑的行，其余 XML 原样透传；drawing XML 帮助函数供图片写入使用。
 */
import {
  escText, getAttr, isNode, kidOf, local, parseRaw, prefixOf, rootEl, serialize, setAttr,
  type RChild, type RNode,
} from '../raw'
import {
  colName, MAX_COL, parseRef, T_BOOL, T_DATE, T_EMPTY, T_ERR, T_NUM, T_SST, T_STR,
  type SheetData, type XlsxWorkbook,
} from './workbook'
import type { BorderKind, ColInfo, XlsxPageSetup, Range } from './types'
import { injectPageElements } from './sheetopts'

export interface LayoutState {
  merges?: MergeLike[]
  colInfo?: ColInfo[]
  rowAttrs?: [number, { ht?: number; hidden?: boolean }][]
  frozen?: { rows: number; cols: number }
  gridLines?: boolean
  /** 页面设置（纸张 / 方向 / 页边距 / 打印网格线 / 页眉页脚 / 保护） */
  page?: XlsxPageSetup
}
type MergeLike = { r0: number; c0: number; r1: number; c1: number }
type Entry = [number, unknown, number]
/** 与 editor.getEntry 等价的本地读取（避免与 editor.ts 循环依赖） */
function getEntry(d: SheetData, r: number, c: number): Entry | null {
  const row = d.rows[r]
  if (!row) return null
  for (let k = 0; k < row.length; k += 4) if (row[k] === c) return [row[k + 1] as number, row[k + 2], row[k + 3] as number]
  return null
}
export function cellXml(d: SheetData, r: number, c: number, P: string, wb: XlsxWorkbook): string {
  const key = r * MAX_COL + c
  const e = getEntry(d, r, c)
  const f = d.formulas.get(key)
  if (!e && !f) return ''
  const ref = colName(c) + (r + 1)
  const s = e?.[2] ? ` s="${e[2]}"` : ''
  if (f) {
    const [t, v] = e ?? [T_EMPTY, '']
    const fx = `<${P}f>${escText(f)}</${P}f>`
    if (t === T_NUM) return `<${P}c r="${ref}"${s}>${fx}<${P}v>${String(v)}</${P}v></${P}c>`
    if (t === T_BOOL) return `<${P}c r="${ref}"${s} t="b">${fx}<${P}v>${v ? 1 : 0}</${P}v></${P}c>`
    if (t === T_ERR) return `<${P}c r="${ref}"${s} t="e">${fx}<${P}v>${escText(String(v))}</${P}v></${P}c>`
    if (t === T_STR && !String(v).startsWith('=')) return `<${P}c r="${ref}"${s} t="str">${fx}<${P}v>${escText(String(v))}</${P}v></${P}c>`
    return `<${P}c r="${ref}"${s}>${fx}</${P}c>`
  }
  const [t, v] = e!
  switch (t) {
    case T_NUM:
      return `<${P}c r="${ref}"${s}><${P}v>${String(v)}</${P}v></${P}c>`
    case T_SST:
    case T_STR: {
      const text = t === T_SST ? wb.sst[v as number] ?? '' : String(v)
      return `<${P}c r="${ref}"${s} t="inlineStr"><${P}is><${P}t xml:space="preserve">${escText(text)}</${P}t></${P}is></${P}c>`
    }
    case T_BOOL:
      return `<${P}c r="${ref}"${s} t="b"><${P}v>${v ? 1 : 0}</${P}v></${P}c>`
    case T_ERR:
      return `<${P}c r="${ref}"${s} t="e"><${P}v>${escText(String(v))}</${P}v></${P}c>`
    case T_DATE:
      return `<${P}c r="${ref}"${s} t="d"><${P}v>${escText(String(v))}</${P}v></${P}c>`
    default:
      return `<${P}c r="${ref}"${s}/>`
  }
}

export function needsWrite(d: SheetData): boolean {
  return d.edited.size > 0 || d.structural || d.dirtyCols || d.dirtyMerges || d.dirtyView || d.dirtyRows.size > 0 || d.formulaChanged || d.dirtyPage
}

export function layoutState(d: SheetData): LayoutState {
  return {
    merges: d.merges.map((m) => ({ ...m })),
    colInfo: d.colInfo.map((c) => ({ ...c })),
    rowAttrs: [...d.rowAttrs].map(([k, v]) => [k, { ...v }]),
    frozen: { ...d.frozen },
    gridLines: d.gridLines,
    page: d.page ? { ...d.page, margins: d.page.margins ? { ...d.page.margins } : undefined } : undefined,
  }
}

export function applyLayout(d: SheetData, l: LayoutState) {
  if (l.merges) d.merges = l.merges.map((m) => ({ ...m }))
  if (l.colInfo) d.colInfo = l.colInfo.map((c) => ({ ...c }))
  if (l.rowAttrs) {
    for (const r of d.rowAttrs.keys()) d.dirtyRows.add(r)
    d.rowAttrs = new Map(l.rowAttrs.map(([k, v]) => [k, { ...v }]))
    for (const r of d.rowAttrs.keys()) d.dirtyRows.add(r)
  }
  if (l.frozen) d.frozen = { ...l.frozen }
  if (l.gridLines !== undefined) d.gridLines = l.gridLines
  if (l.page !== undefined) { d.page = { ...l.page, margins: l.page.margins ? { ...l.page.margins } : undefined }; d.dirtyPage = true }
  d.dirtyCols = d.dirtyMerges = d.dirtyView = true
}

/** hides / shows columns a..b (the width before hiding is kept for unhiding) */
export function hideCols(d: SheetData, a: number, b: number, hidden: boolean) {
  const out: ColInfo[] = []
  const covered: [number, number][] = []
  for (const ci of d.colInfo) {
    if (ci.max < a || ci.min > b) {
      out.push(ci)
      continue
    }
    if (ci.min < a) out.push({ ...ci, max: a - 1 })
    if (ci.max > b) out.push({ ...ci, min: b + 1 })
    const lo = Math.max(ci.min, a)
    const hi = Math.min(ci.max, b)
    covered.push([lo, hi])
    if (hidden) out.push(ci.w ? { ...ci, min: lo, max: hi, w: 0, prevW: ci.w } : { ...ci, min: lo, max: hi })
    else out.push(ci.w ? { ...ci, min: lo, max: hi } : { min: lo, max: hi, w: ci.prevW || d.defaultColW })
  }
  if (hidden) {
    // columns without an explicit width
    covered.sort((x, y) => x[0] - y[0])
    let at = a
    for (const [lo, hi] of [...covered, [b + 1, b + 1] as [number, number]]) {
      if (lo > at) out.push({ min: at, max: Math.min(lo - 1, b), w: 0, prevW: d.defaultColW })
      at = Math.max(at, hi + 1)
    }
  }
  d.colInfo = out.sort((x, y) => x.min - y.min)
  d.dirtyCols = true
}

export function borderSides(kind: BorderKind, R: Range, r: number, c: number): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  const edge = { top: r === R.r0, bottom: r === R.r1, left: c === R.c0, right: c === R.c1 }
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    if (kind === 'all') out[side] = true
    else if (kind === 'none') out[side] = false
    else if (kind === 'outer') {
      if (edge[side]) out[side] = true
    } else if (kind === 'inner') {
      if (!edge[side]) out[side] = true
    } else if (kind === side && edge[side]) out[side] = true
  }
  return out
}

/**
 * Streaming sheet rewriter: finds <row> elements with plain string search and copies
 * everything verbatim except rows that contain edits (those are re-serialized).
 * Structural edits regenerate the whole <sheetData>; <cols>, panes and <mergeCells> are patched.
 */
export class RowPatcher {
  private buf = ''
  private P = ''
  private next = 0
  private lastRow = -1
  private phase: 'head' | 'data' | 'skip' | 'tail' = 'head'
  private tail = ''

  constructor(
    private rows: number[],
    private rowCols: Map<number, Set<number>>,
    private d: SheetData,
    private fix: Map<number, string>,
    private wb: XlsxWorkbook,
  ) {}

  private newRow(r: number): string {
    const cols = [...(this.rowCols.get(r) ?? [])].sort((a, b) => a - b)
    const cells = cols.map((c) => cellXml(this.d, r, c, this.P, this.wb)).join('')
    const attrs = this.rowAttrXml(r)
    return cells || attrs ? `<${this.P}row r="${r + 1}"${attrs}>${cells}</${this.P}row>` : ''
  }

  private rowAttrXml(r: number): string {
    const a = this.d.rowAttrs.get(r)
    if (!a) return ''
    return (a.ht !== undefined ? ` ht="${a.ht}" customHeight="1"` : '') + (a.hidden ? ' hidden="1"' : '')
  }

  private before(r: number): string {
    let out = ''
    while (this.next < this.rows.length && this.rows[this.next] < r) out += this.newRow(this.rows[this.next++])
    return out
  }

  /** every row of the sheet, regenerated from the model (structural edits); a paged sheet is read page by page */
  private async *allRows(): AsyncGenerator<string> {
    const d = this.d
    let last = Math.max(d.rows.length - 1, d.maxRow)
    for (const r of d.rowAttrs.keys()) if (r > last) last = r
    const size = d.pages?.size ?? Infinity
    let chunk = ''
    for (let r = 0; r <= last; r++) {
      if (d.pages && r % size === 0) await d.pages.ensure(r, r + size - 1)
      const row = d.rows[r]
      const attrs = this.rowAttrXml(r)
      if (!row?.length && !attrs) continue
      let cells = ''
      if (row) {
        const cols: number[] = []
        for (let k = 0; k < row.length; k += 4) cols.push(row[k] as number)
        for (const c of cols.sort((a, b) => a - b)) cells += cellXml(d, r, c, this.P, this.wb)
      }
      chunk += `<${this.P}row r="${r + 1}"${attrs}>${cells}</${this.P}row>`
      if (chunk.length > 1 << 16) {
        yield chunk
        chunk = ''
      }
    }
    if (chunk) yield chunk
  }

  private colsXml(): string {
    const P = this.P
    const cols = [...this.d.colInfo].sort((a, b) => a.min - b.min)
    if (!cols.length) return ''
    return `<${P}cols>${cols.map((c) => `<${P}col min="${c.min + 1}" max="${c.max + 1}" width="${+(Math.max(0, (c.w || c.prevW || 0) - 5) / 7).toFixed(4)}" customWidth="1"${c.w ? '' : ' hidden="1"'}/>`).join('')}</${P}cols>`
  }

  private headFix(head: string): string {
    const d = this.d
    const P = this.P
    let h = head
    if (d.dirtyCols || d.structural) {
      const re = new RegExp(`<${P}cols\\b[\\s\\S]*?<\\/${P}cols>|<${P}cols\\s*\\/>`)
      h = re.test(h) ? h.replace(re, this.colsXml()) : h + this.colsXml()
    }
    if (d.dirtyView || d.structural) {
      const { rows, cols } = d.frozen
      const pane = rows || cols
        ? `<${P}pane${cols ? ` xSplit="${cols}"` : ''}${rows ? ` ySplit="${rows}"` : ''} topLeftCell="${colName(cols)}${rows + 1}" activePane="${rows && cols ? 'bottomRight' : rows ? 'bottomLeft' : 'topRight'}" state="frozen"/>`
        : ''
      const re = new RegExp(`<${P}sheetViews>[\\s\\S]*?<\\/${P}sheetViews>`)
      const m = re.exec(h)
      if (m) {
        const nodes = parseRaw(m[0])
        const view = kidOf(rootEl(nodes), 'sheetView')
        if (view) {
          view.c = view.c.filter((c) => !(isNode(c) && (local(c.q) === 'pane' || local(c.q) === 'selection')))
          if (pane) view.c.unshift(pane)
          setAttr(view, 'showGridLines', d.gridLines ? undefined : '0')
          view.self = view.c.length === 0
          h = h.replace(m[0], serialize(nodes))
        }
      } else if (pane || !d.gridLines) {
        const block = `<${P}sheetViews><${P}sheetView${d.gridLines ? '' : ' showGridLines="0"'} workbookViewId="0">${pane}</${P}sheetView></${P}sheetViews>`
        const at = h.search(new RegExp(`<${P}(sheetFormatPr|cols)\\b`))
        h = at >= 0 ? h.slice(0, at) + block + h.slice(at) : h + block
      }
    }
    if (d.structural) {
      h = h.replace(new RegExp(`<${P}dimension\\b[^>]*\\/>`), `<${P}dimension ref="A1:${colName(Math.max(0, d.maxCol))}${Math.max(1, d.maxRow + 1)}"/>`)
    }
    return h
  }

  private tailFix(tail: string): string {
    const d = this.d
    if (!d.dirtyMerges && !d.structural && !d.dirtyPage) return tail
    const P = this.P
    let out = tail
    const ms = d.merges
    const xml = ms.length ? `<${P}mergeCells count="${ms.length}">${ms.map((m) => `<${P}mergeCell ref="${colName(m.c0)}${m.r0 + 1}:${colName(m.c1)}${m.r1 + 1}"/>`).join('')}</${P}mergeCells>` : ''
    const re = new RegExp(`<${P}mergeCells\\b[\\s\\S]*?<\\/${P}mergeCells>|<${P}mergeCells\\b[^>]*\\/>`)
    if (re.test(out)) out = out.replace(re, xml)
    else if (d.dirtyMerges || d.structural) {
      // after the elements that precede mergeCells in the schema
      let at = 0
      const before = /<(\w+:)?(sheetCalcPr|sheetProtection|protectedRanges|scenarios|autoFilter|sortState|dataConsolidate|customSheetViews)\b[\s\S]*?(\/>|<\/(\w+:)?\2>)/g
      for (let m = before.exec(out); m; m = before.exec(out)) at = m.index + m[0].length
      out = out.slice(0, at) + xml + out.slice(at)
    }
    // 页面设置 / 打印选项 / 页眉页脚 / 保护：按 schema 顺序写进尾部
    if (d.dirtyPage) out = injectPageElements(out, { prefix: P, page: d.page })
    return out
  }

  /** feeds decoded text; returns what can be written so far */
  async push(text: string, final: boolean): Promise<string[]> {
    const s = this.buf + text
    this.buf = ''
    const out: string[] = []
    if (this.phase === 'tail') {
      this.tail += s
      if (final) out.push(this.tailFix(this.tail))
      return out
    }
    let i = 0
    if (this.phase === 'head') {
      const m = /<([\w.-]+:)?sheetData(\s[^>]*)?(\/?)>/.exec(s)
      if (!m) {
        if (final) out.push(this.headFix(s))
        else this.buf = s
        return out
      }
      this.P = m[1] ?? ''
      out.push(this.headFix(s.slice(0, m.index)))
      const end = m.index + m[0].length
      if (m[3] === '/') {
        out.push(`<${this.P}sheetData>`)
        if (this.d.structural) for await (const part of this.allRows()) out.push(part)
        else {
          let rows = ''
          while (this.next < this.rows.length) rows += this.newRow(this.rows[this.next++])
          out.push(rows)
        }
        out.push(`</${this.P}sheetData>`)
        this.phase = 'tail'
        return [...out, ...(await this.push(s.slice(end), final))]
      }
      out.push(m[0])
      i = end
      this.phase = this.d.structural ? 'skip' : 'data'
    }
    const dataClose = `</${this.P}sheetData>`
    if (this.phase === 'skip') {
      const dc = s.indexOf(dataClose, i)
      if (dc < 0) {
        this.buf = s.slice(Math.max(i, s.length - dataClose.length))
        return out
      }
      for await (const part of this.allRows()) out.push(part)
      out.push(dataClose)
      this.phase = 'tail'
      return [...out, ...(await this.push(s.slice(dc + dataClose.length), final))]
    }
    const rowOpen = `<${this.P}row`
    let chunk = ''
    let dc = s.indexOf(dataClose, i)
    while (i < s.length) {
      const ro = s.indexOf(rowOpen, i)
      if (dc >= 0 && dc < i) dc = s.indexOf(dataClose, i)
      if (dc >= 0 && (ro < 0 || dc < ro)) {
        chunk += s.slice(i, dc) + this.before(Infinity) + dataClose
        out.push(chunk)
        this.phase = 'tail'
        return [...out, ...(await this.push(s.slice(dc + dataClose.length), final))]
      }
      if (ro < 0) break
      const gt = s.indexOf('>', ro)
      if (gt < 0) {
        chunk += s.slice(i, ro)
        i = ro
        break
      }
      const tag = s.slice(ro, gt + 1)
      const after = tag.charCodeAt(rowOpen.length)
      if (after !== 32 && after !== 62 && after !== 47 && after !== 9 && after !== 10 && after !== 13) {
        chunk += s.slice(i, gt + 1)
        i = gt + 1
        continue
      }
      const m = /\sr="(\d+)"/.exec(tag)
      const r = m ? Number(m[1]) - 1 : this.lastRow + 1
      this.lastRow = r
      const self = tag.endsWith('/>')
      let end: number
      if (self) end = gt + 1
      else {
        const ce = s.indexOf(`</${this.P}row>`, gt)
        if (ce < 0) {
          chunk += s.slice(i, ro)
          i = ro
          this.lastRow = r - 1
          break
        }
        end = ce + this.P.length + 6
      }
      chunk += s.slice(i, ro) + this.before(r)
      if (this.next < this.rows.length && this.rows[this.next] === r) {
        this.next++
        chunk += this.patchRow(s.slice(ro, end), r)
      } else chunk += s.slice(ro, end)
      i = end
    }
    out.push(chunk)
    this.buf = s.slice(i)
    if (final) out.push(this.buf)
    return out
  }

  private patchRow(xml: string, r: number): string {
    const nodes = parseRaw(xml)
    const row = rootEl(nodes)
    if (!row) return xml
    const P = prefixOf(row.q)
    setAttr(row, 'spans', undefined)
    if (this.d.dirtyRows.has(r)) {
      const a = this.d.rowAttrs.get(r)
      setAttr(row, 'ht', a?.ht !== undefined ? String(a.ht) : undefined)
      setAttr(row, 'customHeight', a?.ht !== undefined ? '1' : undefined)
      setAttr(row, 'hidden', a?.hidden ? '1' : undefined)
    }
    const cols = [...(this.rowCols.get(r) ?? [])].sort((a, b) => a - b)
    // index existing cells by column
    const pos = new Map<number, number>()
    let prev = -1
    row.c.forEach((n, i) => {
      if (!isNode(n) || local(n.q) !== 'c') return
      const ref = getAttr(n, 'r')
      const c = ref ? parseRef(ref)[1] : prev + 1
      prev = c
      pos.set(c, i)
    })
    const replacements = new Map<number, RChild>()
    const inserts: { c: number; node: string }[] = []
    for (const c of cols) {
      const key = r * MAX_COL + c
      const at = pos.get(c)
      if (this.d.edited.has(key)) {
        const xml = cellXml(this.d, r, c, P, this.wb)
        if (at !== undefined) replacements.set(at, xml)
        else if (xml) inserts.push({ c, node: xml })
      } else if (at !== undefined && this.fix.has(key)) {
        const cell = row.c[at] as RNode
        const f = kidOf(cell, 'f')
        if (f) {
          f.a = ''
          f.c = [escText(this.fix.get(key)!)]
          f.self = false
        }
      }
    }
    for (const [i, x] of replacements) row.c[i] = x
    if (inserts.length) {
      // place new cells before the first existing cell with a greater column
      const ordered = [...pos.entries()].sort((a, b) => a[0] - b[0])
      for (const ins of inserts.reverse()) {
        const after = ordered.find(([c]) => c > ins.c)
        const idx = after ? after[1] : row.c.length
        row.c.splice(idx, 0, ins.node)
        for (const o of ordered) if (o[1] >= idx) o[1]++
      }
      row.self = false
    }
    return serialize(nodes)
  }
}

// ---------------------------------------------------------------- drawing XML (xlsx image insertion)

export const EMU_PER_PX = 9525
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'

/** one <xdr:twoCellAnchor> referencing the image by its relationship id; sized via EMU offsets */
export function twoCellAnchor(
  fc: number, fco: number, tc: number, tco: number, fr: number, fro: number, tr: number, tro: number, wPx: number, hPx: number, imgRid: string, picId: number,
  editAs?: 'oneCell' | 'twoCell',
): string {
  const cx = Math.round(wPx * EMU_PER_PX)
  const cy = Math.round(hPx * EMU_PER_PX)
  return (
    `<xdr:twoCellAnchor${editAs ? ` editAs="${editAs}"` : ''}>` +
    `<xdr:from><xdr:col>${fc}</xdr:col><xdr:colOff>${fco}</xdr:colOff><xdr:row>${fr}</xdr:row><xdr:rowOff>${fro}</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${tc}</xdr:col><xdr:colOff>${tco}</xdr:colOff><xdr:row>${tr}</xdr:row><xdr:rowOff>${tro}</xdr:rowOff></xdr:to>` +
    '<xdr:pic>' +
    `<xdr:nvPicPr><xdr:cNvPr id="${picId}" name="Picture ${picId}" descr=""/><xdr:cNvPicPr/></xdr:nvPicPr>` +
    '<xdr:blipFill><a:blip r:embed="' + imgRid + '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
    '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
    '</xdr:pic>' +
    '<xdr:clientData/>' +
    '</xdr:twoCellAnchor>'
  )
}

/** wraps anchors in a <xdr:wsDr> document (namespaces declared on the root) */
export function drawingDoc(body: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<xdr:wsDr xmlns:xdr="${DRAWING_NS}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    body +
    '</xdr:wsDr>'
  )
}

/** appends an anchor before </xdr:wsDr> (existing drawings keep their earlier anchors) */
export function appendAnchor(xml: string, anchor: string): string {
  const close = /<\/(\w+:)?wsDr\s*>/.exec(xml)
  if (close) return xml.slice(0, close.index) + anchor + xml.slice(close.index)
  return xml + anchor
}

/** next free cNvPr id among existing shapes (so the new picture's id is unique in the drawing) */
export function nextPicId(xml: string): number {
  let max = 0
  const re = /cNvPr\s+id="(\d+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) max = Math.max(max, Number(m[1]))
  return max + 1
}

/** inserts <drawing r:id="rid"/> into a worksheet's tail, before the schema-later elements; ensures the r: namespace */
export function insertDrawing(xml: string, rid: string): string {
  const open = /<([\w.-]*:)?worksheet\b[^>]*>/.exec(xml)
  if (!open) return xml
  const P = open[1] ?? ''
  let out = xml
  if (!/\sxmlns:r=/.test(open[0])) {
    const withR = open[0].replace(/(\/?)>$/, ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"$1>')
    out = xml.slice(0, open.index) + withR + xml.slice(open.index + open[0].length)
  }
  const elem = `<${P}drawing r:id="${rid}"/>`
  const later = ['legacyDrawing', 'legacyDrawingHF', 'drawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst']
  let at = -1
  for (const name of later) {
    const m = new RegExp(`<(\\w+:)?${name}\\b`).exec(out)
    if (m && (at < 0 || m.index < at)) at = m.index
  }
  if (at < 0) {
    const close = new RegExp(`</${P.replace('.', '\\.')}?worksheet\\s*>`).exec(out)
    at = close ? close.index : out.length
  }
  return out.slice(0, at) + elem + out.slice(at)
}
