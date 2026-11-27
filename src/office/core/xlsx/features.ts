/**
 * Native XLSX features: real OOXML part generators + the sidecar model.
 *
 * The kernel keeps an authoritative, structured description of every feature in
 * `xl/mdview/features.json` (our own sidecar part, ignored by Office). From that
 * description it regenerates the *real* SpreadsheetML parts on every write:
 *   - chart       -> xl/charts/chartN.xml (c:chartSpace) + drawing graphicFrame + rels + [Content_Types] override
 *   - condFmt     -> <conditionalFormatting> in the sheet + <dxfs> in styles.xml
 *   - validation  -> <dataValidations> in the sheet
 *   - slicer      -> xl/slicerCaches/* + xl/slicers/* + sheet/workbook extLst + rels + overrides
 *   - pivot       -> xl/pivotCache/* + xl/pivotTables/* + workbook <pivotCaches> + rels + overrides
 *
 * Reading back for the view parses the sidecar (full fidelity); the real parts
 * are what real Office opens. Everything is snapshotted per-part into undo/redo.
 */
import { colName } from './workbook'
import type {
  ChartData, ChartFeature, CondFmtRule, PivotFeature, Range, SheetFeatures, SlicerFeature, ValidationRule,
} from './types'

// ---------------------------------------------------------------- namespaces / content types / rel types
export const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
export const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
export const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
export const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
export const NS_XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'
export const NS_X14 = 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main'
export const NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'

export const REL_DRAWING = NS_R + '/drawing'
export const REL_CHART = NS_R + '/chart'
export const REL_SLICER_CACHE = 'http://schemas.microsoft.com/office/2007/relationships/slicerCache'
export const REL_SLICER = 'http://schemas.microsoft.com/office/2007/relationships/slicer'
export const REL_PIVOT_CACHE_DEF = NS_R + '/pivotCacheDefinition'
export const REL_PIVOT_CACHE_REC = NS_R + '/pivotCacheRecords'
export const REL_PIVOT_TABLE = NS_R + '/pivotTable'

export const CT_CHART = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml'
export const CT_DRAWING = 'application/vnd.openxmlformats-officedocument.spreadsheetml.drawing+xml'
export const CT_SLICER_CACHE = 'application/vnd.ms-excel.slicerCache+xml'
export const CT_SLICER = 'application/vnd.ms-excel.slicer+xml'
export const CT_PIVOT_CACHE_DEF = 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml'
export const CT_PIVOT_CACHE_REC = 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml'
export const CT_PIVOT_TABLE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml'

/** ext uri used by x14:slicerList / x14:slicerCaches (Excel 2010 slicer extension) */
export const EXT_SLICER_LIST = '{A8765BA9-456A-4dab-B4F3-ACF838C121DE}'
export const EXT_SLICER_CACHES = '{BBE1A952-AA13-448e-AADC-164F8A28A991}'

export const SIDECAR = 'xl/mdview/features.json'
export const SIDECAR_CT = 'application/json'

// deterministic ids / part names (must be stable so undo snapshots know every touched part)
export const chartRid = (id: number) => `rIdChart${id}`
export const slicerCacheRid = (id: number) => `rIdSlicerCache${id}`
export const slicerRid = (id: number) => `rIdSlicer${id}`
export const pivotCacheRid = (cacheId: number) => `rIdPivotCache${cacheId}`
export const pivotTableRid = (id: number) => `rIdPivot${id}`
export const chartPartName = (id: number) => `xl/charts/chart${id}.xml`
export const slicerCachePartName = (id: number) => `xl/slicerCaches/slicerCache${id}.xml`
export const slicerPartName = (id: number) => `xl/slicers/slicer${id}.xml`
export const pivotCacheDefName = (cacheId: number) => `xl/pivotCache/pivotCacheDefinition${cacheId}.xml`
export const pivotCacheRecName = (cacheId: number) => `xl/pivotCache/pivotCacheRecords${cacheId}.xml`
export const pivotTableName = (id: number) => `xl/pivotTables/pivotTable${id}.xml`

// ---------------------------------------------------------------- sidecar model
export function emptyFeatures(): SheetFeatures {
  return { charts: [], condFmt: [], validations: [], slicers: [], pivots: [], series: [] }
}
export type Sidecar = Record<string, SheetFeatures>

export function parseSidecar(text: string | null | undefined): Sidecar {
  if (!text) return {}
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}

// ---------------------------------------------------------------- small helpers
export const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
export const attr = (s: string) => esc(s)
const rgb = (hex: string | undefined, fallback: string) => (hex ? hex.replace('#', '').toUpperCase() : fallback)
export const cellRef = (r: number, c: number) => `${colName(c)}${r + 1}`
export const rangeRef = (rg: Range) => `${cellRef(rg.r0, rg.c0)}:${cellRef(rg.r1, rg.c1)}`
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

/** Office chart default theme colours (same ring order as chartpng.ts) */
export const PALETTE = ['4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '264478', '9E480E']

/** numeric parse used by both the kernel refresh and the view chart guess */
export const numOf = (t: string): number | null => {
  const s = t.replace(/[,¥$\s%]/g, '')
  return s && Number.isFinite(Number(s)) ? Number(s) : null
}

/** Guess chart data from a text matrix (Office-style header/category detection). Shared with the view. */
export function chartDataOf(matrix: string[][]): ChartData | null {
  const rows = matrix.map((r) => r.map((v) => String(v ?? '').trim())).filter((r) => r.some((v) => v !== ''))
  if (rows.length < 2) return null
  const width = Math.max(...rows.map((r) => r.length))
  const rowTextRatio = (r: string[]) => r.filter((v) => v && numOf(v) === null).length / Math.max(1, r.filter((v) => v).length)
  const hasHeader = rows[0].some((v) => v) && rowTextRatio(rows[0]) >= 0.6
  const colTextRatio = (c: number) => {
    const vals = rows.slice(hasHeader ? 1 : 0).map((r) => r[c] ?? '')
    return vals.filter((v) => v && numOf(v) === null).length / Math.max(1, vals.filter((v) => v).length)
  }
  const hasCats = colTextRatio(0) >= 0.6
  const body = hasHeader ? rows.slice(1) : rows
  const firstCol = hasCats ? 1 : 0
  const cats = body.map((r, i) => (hasCats ? r[0] ?? '' : `${i + 1}`))
  const series: { name: string; values: number[] }[] = []
  for (let c = firstCol; c < width; c++) {
    const values = body.map((r) => numOf(r[c]) ?? 0)
    if (!values.some((v) => v !== 0)) continue
    series.push({ name: (hasHeader ? rows[0][c] : '') || `系列${series.length + 1}`, values })
  }
  if (!series.length || cats.length < 2) return null
  return { cats, series: series.slice(0, PALETTE.length) }
}

// ---------------------------------------------------------------- chart part (c:chartSpace)
function strCache(refText: string, vals: string[]): string {
  const pts = vals.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')
  return `<c:strRef><c:f>${esc(refText)}</c:f><c:strCache><c:ptCount val="${vals.length}"/>${pts}</c:strCache></c:strRef>`
}
function numCache(refText: string, vals: number[]): string {
  const pts = vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')
  return `<c:numRef><c:f>${esc(refText)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${pts}</c:numCache></c:numRef>`
}

/** A full c:chartSpace with cached categories/values (so real Office renders the data after reopen). */
export function chartSpaceXml(chart: ChartFeature, sheetName: string): string {
  const q = (s: string) => `'${sheetName.replace(/'/g, "''")}'`
  const n = chart.data.cats.length
  const catRef = `${q(sheetName)}!$${colName(chart.source.c0)}$${chart.source.r0 + 2}:$${colName(chart.source.c0)}$${chart.source.r0 + 1 + n}`
  const isPie = chart.kind === 'pie'
  const isLine = chart.kind === 'line'
  const isArea = chart.kind === 'area'
  const isScatter = chart.kind === 'scatter'
  const barDir = chart.kind === 'bar' ? 'bar' : 'col'
  const sers = chart.data.series.map((s, si) => {
    const col = chart.source.c0 + 1 + si
    const txRef = `${q(sheetName)}!$${colName(col)}$${chart.source.r0 + 1}`
    const valRef = `${q(sheetName)}!$${colName(col)}$${chart.source.r0 + 2}:$${colName(col)}$${chart.source.r0 + 1 + n}`
    const colour = PALETTE[si % PALETTE.length]
    const head =
      `<c:ser><c:idx val="${si}"/><c:order val="${si}"/>` +
      `<c:tx>${strCache(txRef, [s.name])}</c:tx>` +
      `<c:spPr><a:solidFill><a:srgbClr val="${colour}"/></a:solidFill></c:spPr>`
    // 散点图：两轴皆数值，系列用 xVal/yVal（x = 分类列解出的数值，解不出按序号 1..n）；
    // scatterStyle="lineMarker" 自带标记，ser 内不再放 <c:marker>（其 schema 是复合格）
    if (isScatter) {
      const xs = chart.data.cats.map((c, i) => numOf(c) ?? i + 1)
      return head +
        `<c:xVal>${numCache(catRef, xs)}</c:xVal>` +
        `<c:yVal>${numCache(valRef, s.values)}</c:yVal>` +
        `</c:ser>`
    }
    // CT_LineSer 不含 invertIfNegative（其余图型的 ser 都有）
    return head +
      (isLine ? '' : `<c:invertIfNegative val="0"/>`) +
      `<c:cat>${strCache(catRef, chart.data.cats)}</c:cat>` +
      `<c:val>${numCache(valRef, s.values)}</c:val>` +
      `</c:ser>`
  }).join('')
  let plot: string
  if (isPie) {
    plot = `<c:pieChart><c:varyColors val="1"/>${sers}</c:pieChart>`
  } else if (isLine) {
    plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/><c:axId val="111111111"/><c:axId val="222222222"/></c:lineChart>`
  } else if (isArea) {
    plot = `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:axId val="111111111"/><c:axId val="222222222"/></c:areaChart>`
  } else if (isScatter) {
    plot = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${sers}<c:axId val="111111111"/><c:axId val="222222222"/></c:scatterChart>`
  } else {
    plot = `<c:barChart><c:barDir val="${barDir}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${sers}<c:gapWidth val="150"/><c:axId val="111111111"/><c:axId val="222222222"/></c:barChart>`
  }
  // 散点图两轴都必须是 valAx（数值轴）；其余带分类轴的用 catAx/valAx 组合
  let axes = ''
  if (!isPie) {
    if (isScatter) {
      axes =
        `<c:valAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorGridlines/><c:crossAx val="222222222"/></c:valAx>` +
        `<c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorGridlines/><c:crossAx val="111111111"/></c:valAx>`
    } else {
      axes =
        `<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${barDir === 'bar' ? 'l' : 'b'}"/><c:crossAx val="222222222"/></c:catAx>` +
        `<c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${barDir === 'bar' ? 'b' : 'l'}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorGridlines/><c:crossAx val="111111111"/></c:valAx>`
    }
  }
  const title = chart.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${esc(chart.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    : `<c:autoTitleDeleted val="1"/>`
  return DECL +
    `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}">` +
    `<c:date1904 val="0"/><c:lang val="zh-CN"/><c:roundedCorners val="0"/>` +
    `<c:chart>${title}<c:plotArea><c:layout/>${plot}${axes}</c:plotArea>` +
    `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings>` +
    `</c:chartSpace>`
}

/** one xdr:twoCellAnchor holding a graphicFrame that references the chart part */
export function graphicFrameXml(chart: ChartFeature, fc: number, fco: number, fr: number, fro: number, tc: number, tco: number, tr: number, tro: number, wPx: number, hPx: number): string {
  const cx = Math.round(wPx * 9525)
  const cy = Math.round(hPx * 9525)
  return (
    `<xdr:twoCellAnchor>` +
    `<xdr:from><xdr:col>${fc}</xdr:col><xdr:colOff>${fco}</xdr:colOff><xdr:row>${fr}</xdr:row><xdr:rowOff>${fro}</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${tc}</xdr:col><xdr:colOff>${tco}</xdr:colOff><xdr:row>${tr}</xdr:row><xdr:rowOff>${tro}</xdr:rowOff></xdr:to>` +
    `<xdr:graphicFrame macro="">` +
    `<xdr:nvGraphicFramePr><xdr:cNvPr id="${1000 + chart.id}" name="MdView Chart ${chart.id}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
    `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></xdr:xfrm>` +
    `<a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="${chart.rid}"/></a:graphicData></a:graphic>` +
    `</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
  )
}

// ---------------------------------------------------------------- conditional formatting + dxfs
/** the <dxfs> element for styles.xml: one dxf per cellIs/containsText/top10 rule (indexed by dxfId) */
export function dxfsSection(rules: CondFmtRule[]): string {
  const useDxf = rules.filter((r) => r.type === 'cellIs' || r.type === 'containsText' || r.type === 'top10')
  const dxfs = useDxf.map((r) => {
    const fill = r.color ? `<fill><patternFill><bgColor rgb="FF${rgb(r.color, 'FFFFFF')}"/></patternFill></fill>` : ''
    const font = r.fontColor ? `<font><color rgb="FF${rgb(r.fontColor, '000000')}"/></font>` : ''
    return `<dxf>${font}${fill}</dxf>`
  }).join('')
  return `<dxfs count="${useDxf.length}">${dxfs}</dxfs>`
}

function cfRuleXml(r: CondFmtRule, dxfId: number | undefined): string {
  const dxf = dxfId !== undefined ? ` dxfId="${dxfId}"` : ''
  let inner = ''
  switch (r.type) {
    case 'cellIs':
      inner = `<formula>${esc(r.formula1 ?? '0')}</formula>` + (r.formula2 !== undefined ? `<formula>${esc(r.formula2)}</formula>` : '')
      return `<cfRule type="cellIs"${dxf} priority="${r.id}" operator="${r.operator ?? 'greaterThan'}">${inner}</cfRule>`
    case 'containsText':
      inner = `<formula>NOT(ISERROR(SEARCH("${esc(r.text ?? '')}",${cellRef(r.sqref.r0, r.sqref.c0)})))</formula>`
      return `<cfRule type="containsText"${dxf} priority="${r.id}" operator="containsText" text="${attr(r.text ?? '')}">${inner}</cfRule>`
    case 'top10':
      inner = ''
      return `<cfRule type="top10"${dxf} priority="${r.id}" rank="${r.rank ?? 10}"${r.percent ? ' percent="1"' : ''}${r.bottom ? ' bottom="1"' : ''}${inner ? '>' + inner + '</cfRule>' : '/>'}`
    case 'colorScale':
      return `<cfRule type="colorScale" priority="${r.id}"><colorScale><cfvo type="min"/><cfvo type="max"/><color rgb="FF${rgb(r.colorMin, 'F8696B')}"/><color rgb="FF${rgb(r.colorMax, '63BE7B')}"/></colorScale></cfRule>`
    case 'dataBar':
      return `<cfRule type="dataBar" priority="${r.id}"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="FF${rgb(r.barColor, '638EC6')}"/></dataBar><extLst><ext uri="{B025F937-C7B1-47D3-B67F-A62EFF666E3E}" xmlns:x14="${NS_X14}"><x14:id>{DA7ABA51-AAAA-BBBB-0001-A0BD00000000}</x14:id></ext></extLst></cfRule>`
  }
  return ''
}

/** all <conditionalFormatting> blocks for a sheet (one per rule), assigning dxfIds in order */
export function condFmtBlocks(rules: CondFmtRule[]): string {
  let dxf = 0
  return rules.map((r) => {
    const needs = r.type === 'cellIs' || r.type === 'containsText' || r.type === 'top10'
    const id = needs ? dxf++ : undefined
    return `<conditionalFormatting sqref="${rangeRef(r.sqref)}">${cfRuleXml(r, id)}</conditionalFormatting>`
  }).join('')
}

// ---------------------------------------------------------------- data validations
export function dataValidationsXml(rules: ValidationRule[]): string {
  if (!rules.length) return ''
  const items = rules.map((r) => {
    const a: string[] = [`type="${r.type}"`, `sqref="${rangeRef(r.sqref)}"`, `priority="${r.id}"`]
    if (r.operator) a.push(`operator="${r.operator}"`)
    if (r.allowBlank !== false) a.push('allowBlank="1"')
    if (r.showInputMessage) a.push('showInputMessage="1"', `promptTitle="${attr(r.promptTitle ?? '')}"`, `prompt="${attr(r.prompt ?? '')}"`)
    if (r.showErrorMessage !== false) a.push('showErrorMessage="1"', `errorStyle="${r.errorStyle ?? 'stop'}"`, `errorTitle="${attr(r.errorTitle ?? '')}"`, `error="${attr(r.error ?? '')}"`)
    // list: formula1 is either a quoted CSV list or a range ref; store the literal list
    const f1 = r.type === 'list' ? `"${esc(r.formula1).replace(/&quot;/g, '"')}"` : esc(r.formula1)
    const body = `<formula1>${f1}</formula1>` + (r.formula2 !== undefined ? `<formula2>${esc(r.formula2)}</formula2>` : '')
    return `<dataValidation ${a.join(' ')}>${body}</dataValidation>`
  }).join('')
  return `<dataValidations count="${rules.length}">${items}</dataValidations>`
}

// ---------------------------------------------------------------- slicers
export function slicerCacheXml(s: SlicerFeature): string {
  const pts = s.items.map((v) => `<s v="${attr(v)}"/>`).join('')
  return DECL +
    `<slicerCacheDefinition xmlns="${NS_X14}" xmlns:r="${NS_R}" name="${attr(s.name)}" sourceName="${attr(s.fieldName)}">` +
    `<pivotTables/>` +
    `<cacheFields><cacheField name="${attr(s.fieldName)}" numFmtId="0">` +
    `<sharedItems count="${s.items.length}" containsSemiMixedTypes="0" containsString="1" containsNumber="0" containsInteger="0" minValue="0" maxValue="0">${pts}</sharedItems>` +
    `</cacheField></cacheFields>` +
    `</slicerCacheDefinition>`
}
export function slicerViewXml(s: SlicerFeature): string {
  return DECL +
    `<slicers xmlns="${NS_X14}" xmlns:r="${NS_R}" xmlns:mc="${NS_MC}" xmlns:x15="http://schemas.microsoft.com/office/spreadsheetml/2010/11/main" mc:Ignorable="x15">` +
    `<slicer name="${attr(s.name)}" cache="${attr(s.name)}" caption="${attr(s.fieldName)}" rowHeight="20" showCaption="1" level="0" crossFilter="none"/>` +
    `</slicers>`
}
/** sheet <extLst> containing x14:slicerList referencing each slicer part by r:id */
export function slicerListExt(slicers: SlicerFeature[]): string {
  if (!slicers.length) return ''
  const list = slicers.map((s) => `<x14:slicer r:id="${slicerRid(s.id)}"/>`).join('')
  return `<extLst><ext uri="${EXT_SLICER_LIST}" xmlns:x14="${NS_X14}"><x14:slicerList>${list}</x14:slicerList></ext></extLst>`
}
/** workbook <extLst> containing x14:slicerCaches referencing each cache by r:id */
export function slicerCachesExt(slicers: SlicerFeature[]): string {
  if (!slicers.length) return ''
  const list = slicers.map((s) => `<x14:slicerCache r:id="${slicerCacheRid(s.id)}"/>`).join('')
  return `<extLst><ext uri="${EXT_SLICER_CACHES}" xmlns:x14="${NS_X14}"><x14:slicerCaches>${list}</x14:slicerCaches></ext></extLst>`
}

// ---------------------------------------------------------------- pivot table
function cacheFieldsXml(p: PivotFeature, header: string[]): string {
  const fields = header.map((h) => `<cacheField name="${attr(h || '字段')}" numFmtId="0"><sharedItems containsSemiMixedTypes="0" containsString="1" containsNumber="0" containsInteger="0"/></cacheField>`).join('')
  return `<cacheFields count="${header.length}">${fields}</cacheFields>`
}
export function pivotCacheDefXml(p: PivotFeature, sheetName: string, recordCount: number, header: string[]): string {
  return DECL +
    `<pivotCacheDefinition xmlns="${NS_MAIN}" xmlns:r="${NS_R}" r:id="rId1" refreshOnLoad="1" refreshedBy="MdView" createdVersion="3" refreshedVersion="3" minRefreshableVersion="3" recordCount="${recordCount}" supportSubquery="0" supportAdvancedDrill="0">` +
    `<cacheSource type="worksheet"><worksheetSource ref="${rangeRef(p.source)}" sheet="${attr(sheetName)}"/></cacheSource>` +
    cacheFieldsXml(p, header) +
    `</pivotCacheDefinition>`
}
export function pivotCacheRecordsXml(rows: string[][]): string {
  const recs = rows.map((r) => `<r>${r.map((v) => {
    const n = numOf(v)
    return n !== null ? `<n v="${n}"/>` : `<s v="${attr(v)}"/>`
  }).join('')}</r>`).join('')
  return DECL + `<pivotCacheRecords xmlns="${NS_MAIN}" xmlns:r="${NS_R}" count="${rows.length}">${recs}</pivotCacheRecords>`
}
export function pivotTableXml(p: PivotFeature, sheetName: string, outR: number, outC: number, fieldCount: number): string {
  const ref = `${cellRef(p.location.r0, p.location.c0)}:${cellRef(p.location.r0 + outR, p.location.c0 + outC)}`
  const pivotFields = Array.from({ length: fieldCount }, (_, i) => `<pivotField axis="axisRow" showAll="0"/>`).join('')
  const rowFields = p.rows.map((c) => `<field x="${c}"/>`).join('')
  const colFields = p.cols.map((c) => `<field x="${c}"/>`).join('')
  const dataFields = p.values.map((v) => `<dataField name="${attr(v.agg + ':' + colName(v.c))}" fld="${v.c}" subtotal="${v.agg === 'count' ? 'count' : v.agg === 'avg' ? 'average' : v.agg}" baseField="0" baseItem="0"/>`).join('')
  return DECL +
    `<pivotTableDefinition xmlns="${NS_MAIN}" name="${attr(p.name)}" cacheId="${p.cacheId}" dataCaption="值" applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="1" useAutoFormatting="1" itemPrintTitles="1" indent="0" outline="1" outlineData="1" multipleFieldFilters="0" chartFormat="0" refreshedBy="MdView" createdVersion="3" refreshedVersion="3" minRefreshableVersion="3">` +
    `<location ref="${ref}" firstHeaderRow="1" firstDataRow="1" firstDataCol="1"/>` +
    `<pivotFields count="${fieldCount}">${pivotFields}</pivotFields>` +
    (rowFields ? `<rowFields count="${p.rows.length}">${rowFields}</rowFields>` : '') +
    (colFields ? `<colFields count="${p.cols.length}">${colFields}</colFields>` : '') +
    (dataFields ? `<dataFields count="${p.values.length}">${dataFields}</dataFields>` : '') +
    `<pivotTableStyleInfo name="PivotStyleLight16" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>` +
    `</pivotTableDefinition>`
}
/** workbook <pivotCaches> element */
export function pivotCachesEl(pivots: PivotFeature[]): string {
  if (!pivots.length) return ''
  return `<pivotCaches>${pivots.map((p) => `<pivotCache cacheId="${p.cacheId}" r:id="${pivotCacheRid(p.cacheId)}"/>`).join('')}</pivotCaches>`
}

// ---------------------------------------------------------------- part path inventory (for undo snapshots)
/** every part this feature set may write (deterministic ids make the set exact) */
export function partPathsOf(f: SheetFeatures, sheetPath: string, drawingPath: string, stylesPath: string, mainPath: string): string[] {
  const out = new Set<string>([
    '[Content_Types].xml', SIDECAR, sheetPath,
    relsPath(sheetPath), stylesPath, mainPath, relsPath(mainPath),
    drawingPath, relsPath(drawingPath),
  ])
  for (const c of f.charts) out.add(c.chartPart)
  for (const s of f.slicers) { out.add(s.cachePart); out.add(s.slicerPart) }
  for (const p of f.pivots) { out.add(p.cacheDefPart); out.add(p.cacheRecPart); out.add(p.tablePart); out.add(relsPath(p.cacheDefPart)); out.add(relsPath(p.tablePart)) }
  return [...out]
}
export function relsPath(part: string): string {
  const i = part.lastIndexOf('/')
  const d = i < 0 ? '' : part.slice(0, i)
  const f = part.slice(i + 1)
  return (d ? d + '/' : '') + '_rels/' + f + '.rels'
}

export interface RelEntry { id: string; type: string; target: string }
/** merge relationships: drop our deterministic ids, keep everything else, append `add` */
export function mergeRels(existing: string | null, add: RelEntry[], dropIds: string[]): string {
  const keep: string[] = []
  if (existing) {
    const re = /<Relationship\b[^>]*\/>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(existing))) {
      const id = /\bId="([^"]+)"/.exec(m[0])?.[1] ?? ''
      if (!dropIds.includes(id)) keep.push(m[0])
    }
  }
  const rel = (e: RelEntry) => `<Relationship Id="${e.id}" Type="${e.type}" Target="${esc(e.target)}"/>`
  return DECL + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` + keep.join('') + add.map(rel).join('') + `</Relationships>`
}
/** remove our chart graphicFrame anchors from a drawing part (keep pictures / other anchors) */
export function stripChartFrames(xml: string): string {
  return xml.replace(/<xdr:twoCellAnchor\b[^>]*>([\s\S]*?)<\/xdr:twoCellAnchor>/g, (m, body: string) =>
    /MdView Chart \d+/.test(body) ? '' : m)
}
export function drawingDoc(body: string): string {
  return DECL + `<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}" xmlns:r="${NS_R}">${body}</xdr:wsDr>`
}
export function appendToDrawing(xml: string, anchors: string): string {
  const close = /<\/(?:\w+:)?wsDr\s*>/.exec(xml)
  return close ? xml.slice(0, close.index) + anchors + xml.slice(close.index) : xml + anchors
}

// ---------------------------------------------------------------- worksheet tail injection
const WS_TAIL = [
  'sheetCalcPr', 'sheetProtection', 'protectedRanges', 'scenarios', 'autoFilter', 'sortState', 'dataConsolidate',
  'customSheetViews', 'mergeCells', 'phoneticPr', 'conditionalFormatting', 'dataValidations', 'hyperlinks',
  'printOptions', 'pageMargins', 'pageSetup', 'headerFooter', 'rowBreaks', 'colBreaks', 'customProperties',
  'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'drawingHF',
  'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst',
]

function stripTag(xml: string, tag: string): string {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>|<(?:\\w+:)?${tag}\\b[^>]*/>`, 'g')
  return xml.replace(re, '')
}
function ensureNs(xml: string, adds: { prefix: string; uri: string }[], ignorable: string[]): string {
  const open = /<([\w.-]+:)?worksheet\b[^>]*>/.exec(xml)
  if (!open) return xml
  let tag = open[0]
  for (const a of adds) if (!new RegExp(`xmlns:${a.prefix}=`).test(tag)) tag = tag.replace(/(\/?)>$/, ` xmlns:${a.prefix}="${a.uri}"$1>`)
  if (ignorable.length) {
    const have = /(?:xmlns:\w+=)?mc:Ignorable="([^"]*)"/.exec(tag)
    const cur = have ? have[1].split(/\s+/).filter(Boolean) : []
    let changed = false
    for (const p of ignorable) if (!cur.includes(p)) { cur.push(p); changed = true }
    if (changed) {
      if (!/xmlns:mc=/.test(tag)) tag = tag.replace(/(\/?)>$/, ` xmlns:mc="${NS_MC}"$1>`)
      if (have) tag = tag.replace(/mc:Ignorable="[^"]*"/, `mc:Ignorable="${cur.join(' ')}"`)
      else tag = tag.replace(/(\/?)>$/, ` mc:Ignorable="${cur.join(' ')}"$1>`)
    }
  }
  return xml.slice(0, open.index) + tag + xml.slice(open.index + open[0].length)
}
function insertOrdered(xml: string, tag: string, elem: string): string {
  if (!elem) return xml
  const rank = WS_TAIL.indexOf(tag)
  let at = -1
  for (let i = rank + 1; i < WS_TAIL.length; i++) {
    const m = new RegExp(`<(?:\\w+:)?${WS_TAIL[i]}\\b`).exec(xml)
    if (m && (at < 0 || m.index < at)) at = m.index
  }
  if (at < 0) {
    const close = /<\/([\w.-]+:)?worksheet\s*>/.exec(xml)
    at = close ? close.index : xml.length
  }
  return xml.slice(0, at) + elem + xml.slice(at)
}

/** Rebuilds the managed part of a worksheet tail from the feature set. */
export function injectSheetElements(xml: string, opts: { condFmt?: string; validations?: string; slicerList?: string; drawingRid?: string; prefix: string }): string {
  const P = opts.prefix
  let out = stripTag(stripTag(stripTag(xml, 'conditionalFormatting'), 'dataValidations'), 'extLst')
  // drawing: only add when there is not one yet
  if (opts.drawingRid && !new RegExp(`<(?:\\w+:)?drawing\\b`).test(out)) {
    out = ensureNs(out, [{ prefix: 'r', uri: NS_R }], [])
    out = insertOrdered(out, 'drawing', `<${P}drawing r:id="${opts.drawingRid}"/>`)
  }
  if (opts.condFmt) out = insertOrdered(out, 'conditionalFormatting', opts.condFmt)
  if (opts.validations) out = insertOrdered(out, 'dataValidations', opts.validations)
  if (opts.slicerList) {
    out = ensureNs(out, [{ prefix: 'x14', uri: NS_X14 }, { prefix: 'mc', uri: NS_MC }], ['x14'])
    out = insertOrdered(out, 'extLst', opts.slicerList)
  }
  return out
}
