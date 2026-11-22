/** A worksheet as read → the XLSX worksheet part. */
import { escAttr, escText } from '../../raw'
import { formulaText } from './formula'
import { BOOL, col, ERR, FORMULA, MAX_COL, NUM, RICH, SST, STR, type FormulaCell, type Link, type Note, type SheetEnv, type SheetModel } from './sheet'

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

export interface SheetOut {
  xml: string[]
  links: Link[]
  notes: Note[]
  /** the sheet's tab is selected */
  selected: boolean
  /** formulas without a computed value were written */
  uncached?: boolean
}

/** XLSX string escaping: control characters as _xHHHH_ (and a literal "_xHHHH_" kept as text) */
export function xstr(s: string): string {
  if (/[\u0000-\u0008\u000b-\u001f\ufffe\uffff]|_x[0-9A-Fa-f]{4}_/.test(s))
    s = s.replace(/_(x[0-9A-Fa-f]{4}_)/g, '_x005F_$1').replace(/[\u0000-\u0008\u000b-\u001f\ufffe\uffff]/g, (ch) => `_x${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}_`)
  return escText(s)
}

/** a size or measure as an attribute value (at most 2 decimals) */
const pt = (v: number) => String(+v.toFixed(2))

/** extra sheet settings found in the workbook globals */
export interface SheetExtra {
  /** the range of the sheet's AutoFilter (its _FilterDatabase name) */
  autoFilter?: string
}

/** Writes the worksheet part of a sheet (`index`: its position, for formulas naming sheet-level names). */
export function sheetXml(env: SheetEnv, m: SheetModel, index: number, extra: SheetExtra = {}): SheetOut {
  const { cr, cc, cx, ck, cv, rows, cols, merges, shared, arrays, links } = m
  const { defColWidth, stdWidth, defRowHeight, defRowFlags, window2, topRow, leftCol, pane, zoom, tabColor, wsBool, margins, setup, header, footer } = m
  const { printGrid, printHeadings, hCenter, vCenter, protect, password, rowBreaks, colBreaks } = m
  const b8 = env.biff === 8
  const maxCol = MAX_COL - 1
  let uncached = false
  const xml = writeSheet()
  return { xml, links, notes: m.notes, selected: window2 !== undefined && !!(window2 & 0x200), uncached }

  function formulaOf(f: FormulaCell, r: number, c: number): { text?: string; array?: string } {
    const { rgce } = f
    try {
      if (rgce[0] === 0x01 && rgce.length >= 5) {
        const key = (rgce[1] | (rgce[2] << 8)) * MAX_COL + (rgce[3] | (rgce[4] << 8))
        const arr = arrays.get(key)
        if (arr) {
          if (r !== arr.r1 || c !== arr.c1) return {}
          const ref = arr.r1 === arr.r2 && arr.c1 === arr.c2 ? `${col(c)}${r + 1}` : `${col(arr.c1)}${arr.r1 + 1}:${col(arr.c2)}${arr.r2 + 1}`
          return { text: formulaText(env.formulas, arr.rgce, arr.extra, r, c, false, index), array: ref }
        }
        const sh = shared.get(key)
        return sh ? { text: formulaText(env.formulas, sh.rgce, sh.extra, r, c, true, index) } : {}
      }
      return { text: formulaText(env.formulas, rgce, f.extra, r, c, false, index) }
    } catch {
      // what an XLSX formula cannot hold: the value only
      return {}
    }
  }

  /** the XML of a cell */
  function cellXml(i: number): string {
    const r = cr[i]
    const c = cc[i]
    const s = env.styles.cell(cx[i])
    const ref = col(c) + (r + 1)
    const sAttr = s ? ` s="${s}"` : ''
    const v = cv[i]
    switch (ck[i]) {
      case NUM:
        return Number.isFinite(v) ? `<c r="${ref}"${sAttr}><v>${String(v as number)}</v></c>` : `<c r="${ref}"${sAttr} t="e"><v>#NUM!</v></c>`
      case SST:
        return (v as number) < env.sstCount ? `<c r="${ref}"${sAttr} t="s"><v>${v}</v></c>` : s ? `<c r="${ref}"${sAttr}/>` : ''
      case STR:
        return `<c r="${ref}"${sAttr} t="s"><v>${env.string(v as string)}</v></c>`
      case RICH: {
        const rt = v as { text: string; runs: number[] }
        return `<c r="${ref}"${sAttr} t="s"><v>${env.string(rt.text, rt.runs)}</v></c>`
      }
      case BOOL:
        return `<c r="${ref}"${sAttr} t="b"><v>${v}</v></c>`
      case ERR:
        return `<c r="${ref}"${sAttr} t="e"><v>${v}</v></c>`
      case FORMULA: {
        const f = v as FormulaCell
        const { text, array } = formulaOf(f, r, c)
        const fx = text === undefined ? '' : array ? `<f t="array" ref="${array}">${escText(text)}</f>` : `<f>${escText(text)}</f>`
        switch (f.kind) {
          case 0:
            if (!Number.isFinite(f.value)) return `<c r="${ref}"${sAttr} t="e">${fx}<v>#NUM!</v></c>`
            return `<c r="${ref}"${sAttr}>${fx}<v>${String(f.value as number)}</v></c>`
          case 1:
          case 4:
            if (!fx) return f.value ? `<c r="${ref}"${sAttr} t="s"><v>${env.string(f.value as string)}</v></c>` : s ? `<c r="${ref}"${sAttr}/>` : ''
            if (f.kind === 4) {
              // an empty string, which is also what writers that compute nothing put (xlwt): computed on load
              uncached = true
              return `<c r="${ref}"${sAttr}>${fx}</c>`
            }
            return `<c r="${ref}"${sAttr} t="str">${fx}<v>${xstr(f.value as string)}</v></c>`
          case 2:
            return `<c r="${ref}"${sAttr} t="b">${fx}<v>${f.value}</v></c>`
          default:
            return `<c r="${ref}"${sAttr} t="e">${fx}<v>${f.value}</v></c>`
        }
      }
      default:
        return s ? `<c r="${ref}"${sAttr}/>` : ''
    }
  }

  function rowOpen(r: number): string {
    const info = rows.get(r)
    let a = `<row r="${r + 1}"`
    if (!info) return a + '>'
    if (info.xf !== undefined) {
      const s = env.styles.cell(info.xf)
      if (s) a += ` s="${s}" customFormat="1"`
    }
    if (info.ht !== undefined && info.ht > 0 && (info.custom || info.ht !== defRowHeight)) a += ` ht="${pt(info.ht)}"`
    if (info.custom && info.ht !== undefined) a += ' customHeight="1"'
    if (info.hidden) a += ' hidden="1"'
    if (info.level) a += ` outlineLevel="${info.level}"`
    if (info.collapsed) a += ' collapsed="1"'
    return a + '>'
  }

  function writeSheet(): string[] {
    // cells in row, then column order (the last of two at the same place wins)
    const count = cr.length
    let order: Int32Array | undefined
    if (!m.sorted) {
      order = new Int32Array(count)
      for (let i = 0; i < count; i++) order[i] = i
      const key = (i: number) => cr[i] * MAX_COL + cc[i]
      order.sort((a, b) => key(a) - key(b) || a - b)
    }
    const rowNums = [...rows.keys()].sort((a, b) => a - b)
    const out: string[] = []
    let ri = 0
    let minR = Infinity
    let maxR = -1
    let minC = Infinity
    let maxC = -1
    const emptyRow = (r: number) => {
      const info = rows.get(r)!
      if (info.ht === undefined && !info.hidden && !info.level && info.xf === undefined) return
      const open = rowOpen(r)
      if (open !== `<row r="${r + 1}">`) out.push(open.slice(0, -1) + '/>')
    }
    let k = 0
    while (k < count) {
      const r = cr[order ? order[k] : k]
      while (ri < rowNums.length && rowNums[ri] < r) emptyRow(rowNums[ri++])
      if (rowNums[ri] === r) ri++
      let cells = ''
      let prevC = -1
      let prevLen = 0
      for (; k < count; k++) {
        const i = order ? order[k] : k
        if (cr[i] !== r) break
        const x = cellXml(i)
        if (cc[i] === prevC) cells = cells.slice(0, cells.length - prevLen)
        cells += x
        prevC = cc[i]
        prevLen = x.length
        if (x) {
          if (cc[i] < minC) minC = cc[i]
          if (cc[i] > maxC) maxC = cc[i]
        }
      }
      if (cells) {
        if (r < minR) minR = r
        maxR = r
        out.push(rowOpen(r) + cells + '</row>')
      } else if (rows.has(r)) emptyRow(r)
    }
    while (ri < rowNums.length) emptyRow(rowNums[ri++])

    const parts: string[] = [XML_HEAD, `<worksheet ${NS}>`]
    // sheet properties
    const sheetPr =
      (tabColor ? `<tabColor rgb="FF${tabColor}"/>` : '') +
      (wsBool && (!(wsBool & 0x40) || !(wsBool & 0x80)) ? `<outlinePr${wsBool & 0x40 ? '' : ' summaryBelow="0"'}${wsBool & 0x80 ? '' : ' summaryRight="0"'}/>` : '') +
      (wsBool & 0x100 ? '<pageSetUpPr fitToPage="1"/>' : '')
    if (sheetPr) parts.push(`<sheetPr>${sheetPr}</sheetPr>`)
    parts.push(`<dimension ref="${maxR < 0 ? 'A1' : `${col(minC)}${minR + 1}:${col(maxC)}${maxR + 1}`}"/>`)
    parts.push(viewXml())
    let fmt = `<sheetFormatPr baseColWidth="${defColWidth ?? 8}"`
    if (stdWidth) fmt += ` defaultColWidth="${pt(stdWidth)}"`
    fmt += ` defaultRowHeight="${pt(defRowHeight ?? 12.75)}"`
    if (defRowFlags & 1) fmt += ' customHeight="1"'
    if (defRowFlags & 2) fmt += ' zeroHeight="1"'
    let rowLevel = 0
    for (const x of rows.values()) rowLevel = Math.max(rowLevel, x.level)
    const colLevel = cols.reduce((m, x) => Math.max(m, x.level), 0)
    if (rowLevel) fmt += ` outlineLevelRow="${rowLevel}"`
    if (colLevel) fmt += ` outlineLevelCol="${colLevel}"`
    parts.push(fmt + '/>')
    const colXml = colsXml()
    if (colXml) parts.push(colXml)
    parts.push('<sheetData>')
    // rows in chunks: one string per row would be many small strings
    for (let i = 0; i < out.length; i += 2048) parts.push(out.slice(i, i + 2048).join(''))
    parts.push('</sheetData>')
    if (protect) parts.push(`<sheetProtection${password ? ` password="${password.toString(16).toUpperCase().padStart(4, '0')}"` : ''} sheet="1" objects="1" scenarios="1"/>`)
    if (extra.autoFilter) parts.push(`<autoFilter ref="${extra.autoFilter}"/>`)
    const mergeXml = mergesXml()
    if (mergeXml) parts.push(mergeXml)
    if (links.length) {
      let rid = 0
      parts.push(
        '<hyperlinks>' +
          links
            .map(
              (l) =>
                `<hyperlink ref="${l.ref}"${l.target ? ` r:id="rId${++rid}"` : ''}${l.location ? ` location="${escAttr(l.location)}"` : ''}` +
                `${l.display ? ` display="${escAttr(l.display)}"` : ''}${l.tooltip ? ` tooltip="${escAttr(l.tooltip)}"` : ''}/>`,
            )
            .join('') +
          '</hyperlinks>',
      )
    }
    if (printGrid || printHeadings || hCenter || vCenter)
      parts.push(`<printOptions${hCenter ? ' horizontalCentered="1"' : ''}${vCenter ? ' verticalCentered="1"' : ''}${printHeadings ? ' headings="1"' : ''}${printGrid ? ' gridLines="1"' : ''}/>`)
    parts.push(pageXml())
    if (header || footer) parts.push(`<headerFooter>${header ? `<oddHeader>${xstr(header)}</oddHeader>` : ''}${footer ? `<oddFooter>${xstr(footer)}</oddFooter>` : ''}</headerFooter>`)
    const brk = (tag: string, ids: number[], max: number) => {
      const list = [...new Set(ids)].filter((x) => x > 0).sort((a, b) => a - b)
      return list.length ? `<${tag} count="${list.length}" manualBreakCount="${list.length}">${list.map((id) => `<brk id="${id}" max="${max}" man="1"/>`).join('')}</${tag}>` : ''
    }
    parts.push(brk('rowBreaks', rowBreaks, 16383) + brk('colBreaks', colBreaks, 1048575))
    // the last part: the workbook writer puts the comments' drawing before it
    parts.push('</worksheet>')
    return parts
  }

  function viewXml(): string {
    // no WINDOW2: gridlines, headings, zeros and outline symbols shown
    const w = window2 ?? 0xb6
    let a = ''
    if (w & 0x200) a += ' tabSelected="1"'
    if (w & 1) a += ' showFormulas="1"'
    if (!(w & 2)) a += ' showGridLines="0"'
    if (!(w & 4)) a += ' showRowColHeaders="0"'
    if (!(w & 0x10)) a += ' showZeros="0"'
    if (w & 0x40) a += ' rightToLeft="1"'
    if (!(w & 0x80)) a += ' showOutlineSymbols="0"'
    if (b8 && w & 0x800) a += ' view="pageBreakPreview"'
    if (topRow || leftCol) a += ` topLeftCell="${col(Math.min(leftCol, maxCol))}${topRow + 1}"`
    if (zoom && zoom >= 10 && zoom <= 400 && zoom !== 100) a += ` zoomScale="${zoom}" zoomScaleNormal="${zoom}"`
    let p = ''
    if (pane && (pane[0] || pane[1])) {
      const [x, y, rwTop, colLeft] = pane
      if (w & 8) {
        const active = x && y ? 'bottomRight' : y ? 'bottomLeft' : 'topRight'
        p =
          `<pane${x ? ` xSplit="${x}"` : ''}${y ? ` ySplit="${y}"` : ''} topLeftCell="${col(Math.min(Math.max(colLeft, x), maxCol))}${Math.max(rwTop, y) + 1}"` +
          ` activePane="${active}" state="frozen"/><selection pane="${active}"/>`
      } else {
        const active = x && y ? 'bottomRight' : y ? 'bottomLeft' : 'topRight'
        p = `<pane${x ? ` xSplit="${x}"` : ''}${y ? ` ySplit="${y}"` : ''} topLeftCell="${col(Math.min(colLeft, maxCol))}${rwTop + 1}" activePane="${active}"/>`
      }
    }
    return `<sheetViews><sheetView${a} workbookViewId="0"${p ? `>${p}</sheetView>` : '/>'}</sheetViews>`
  }

  function colsXml(): string {
    if (!cols.length) return ''
    const list = cols.filter((c) => c.first <= c.last && c.first < MAX_COL).sort((a, b) => a.first - b.first)
    let next = 0
    let xml = ''
    for (const c of list) {
      const first = Math.max(c.first, next)
      const last = Math.min(c.last, maxCol)
      if (first > last) continue
      next = last + 1
      const s = env.styles.cell(c.xf)
      xml +=
        `<col min="${first + 1}" max="${last + 1}" width="${pt(c.width)}"${s ? ` style="${s}"` : ''}${c.hidden ? ' hidden="1"' : ''} customWidth="1"` +
        `${c.level ? ` outlineLevel="${c.level}"` : ''}${c.collapsed ? ' collapsed="1"' : ''}/>`
    }
    return xml ? `<cols>${xml}</cols>` : ''
  }

  function mergesXml(): string {
    const seen = new Set<string>()
    const list: string[] = []
    for (let k = 0; k + 3 < merges.length; k += 4) {
      const [r1, r2, c1, c2] = [merges[k], merges[k + 1], merges[k + 2], merges[k + 3]]
      if (r2 < r1 || c2 < c1 || (r1 === r2 && c1 === c2) || c2 > maxCol) continue
      const ref = `${col(c1)}${r1 + 1}:${col(c2)}${r2 + 1}`
      if (seen.has(ref)) continue
      seen.add(ref)
      list.push(`<mergeCell ref="${ref}"/>`)
    }
    return list.length ? `<mergeCells count="${list.length}">${list.join('')}</mergeCells>` : ''
  }

  function pageXml(): string {
    let hdr = 0.5
    let ftr = 0.5
    let setupXml = ''
    if (setup) {
      const sv = new DataView(setup.buffer, setup.byteOffset, setup.byteLength)
      const grbit = sv.getUint16(10, true)
      const h = sv.getFloat64(16, true)
      const f = sv.getFloat64(24, true)
      if (Number.isFinite(h) && h >= 0 && h < 50) hdr = h
      if (Number.isFinite(f) && f >= 0 && f < 50) ftr = f
      let a = ''
      if (!(grbit & 4)) {
        const paper = sv.getUint16(0, true)
        const scale = sv.getUint16(2, true)
        if (paper && paper < 256) a += ` paperSize="${paper}"`
        if (scale >= 10 && scale <= 400 && scale !== 100) a += ` scale="${scale}"`
        if (!(grbit & 0x40)) a += ` orientation="${grbit & 2 ? 'portrait' : 'landscape'}"`
      }
      const first = sv.getInt16(4, true)
      if (grbit & 0x80) a += ` firstPageNumber="${first}" useFirstPageNumber="1"`
      const fw = sv.getUint16(6, true)
      const fh = sv.getUint16(8, true)
      if (fw !== 1) a += ` fitToWidth="${fw}"`
      if (fh !== 1) a += ` fitToHeight="${fh}"`
      if (grbit & 1) a += ' pageOrder="overThenDown"'
      if (grbit & 8) a += ' blackAndWhite="1"'
      if (grbit & 0x10) a += ' draft="1"'
      if (grbit & 0x20) a += ` cellComments="${grbit & 0x200 ? 'atEnd' : 'asDisplayed'}"`
      const errors = (grbit >> 10) & 3
      if (errors) a += ` errors="${['', 'blank', 'dash', 'NA'][errors]}"`
      if (a) setupXml = `<pageSetup${a}/>`
    }
    const m = (k: string, d: number) => pt(margins[k] ?? d)
    return `<pageMargins left="${m('left', 0.75)}" right="${m('right', 0.75)}" top="${m('top', 1)}" bottom="${m('bottom', 1)}" header="${pt(hdr)}" footer="${pt(ftr)}"/>` + setupXml
  }
}
