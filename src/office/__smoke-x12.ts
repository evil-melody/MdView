/**
 * x12 探针（Phase 4 样式计算层，?mode=x12）：StyleSheet.calcInto / para / char /
 * hyperlink / table 与 sdkjs CStyles.Get_Pr + Internal_Get_Pr（word/Editor/Styles.js
 * 8083 / 8238）的语义一致性断言；颜色面断言逐位对照 common/Drawings/Format/Format.js
 * 的 CColorModifiers.Apply + common/colorUtils.js 的 rgbToHsl/hslToRgb。
 *
 * 断言面（每条都对着 sdkjs 原文核过）：
 *  1. docDefaults 种子：普通段落以 Default.TextPr/ParaPr 起算；
 *  2. BasedOn 链：祖先→编号层→自身，后写覆盖先写；
 *  3. 类型过滤：Style.Type !== Type → 视为缺失；
 *  4. 缺失回退：bUseDefault 时并入 default 样式【自身声明】；
 *  5. 根样式：BasedOn===null 时段落/表格不再叠 default（字符叠 Default.Character）；
 *  6. 表格种子：Get_Pr 先 StyleId=Default.Paragraph，再用 TableStyle 【替代】
 *     docDefaults 种子、bUseDefault=false —— bug 31469 只把 Normal 挡在
 *     「表格样式面」之外，表内段落仍吃 Normal 自身声明（8091-8095 + 8436-8440）；
 *  7. 编号层：只并 GetParaPr（8389），编号层 rPr 属 marker、绝不进段落 run 面；
 *     numId=0 → 清 NumPr + Ind.Left=0 + Ind.FirstLine=0（8394-8398）；
 *  8. 颜色：Word 属性形式 themeShade/themeTint ≡ lumMod / lumMod+lumOff
 *     （Format.js:3180-3196 convertToPPTXMods 的逆用，与 Word 官方色阶矩阵逐位一致）；
 *     DrawingML 子元素 a:tint/a:shade 是【伽马校正的 RGB 通道】运算，不是 HSL 亮度；
 *  9. CJK 字体槽：eastAsia / eastAsiaTheme 独立于 latin 槽；无 CJK 槽 → latin 回退；
 * 10. 超链接：Default.Hyperlink 字符面（GetDefaultHyperlink，Styles.js:9196）；
 * 11. 端到端：Converter 段落合并序（直设 pPr 赢过 numId=0 清零）。
 *
 * 顶层只注册 mode；结果挂 window.__smoke.x12。
 */
import { h } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import { parseXml } from './core/xml'
import { DEFAULT_THEME, parseTheme, resolveColor, type Theme } from './core/theme'
import { applyTint, drawingColor, presetColor, type ColorCtx } from './core/color'
import { StyleSheet } from './core/docx/styles'
import { Numbering } from './core/docx/numbering'
import { Converter } from './core/docx/parser'
import type { Paragraph } from './core/docx/types'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS = `xmlns:w="${W}"`
const ANS = `xmlns:a="${A}"`

function probe() {
  const R: Record<string, unknown> = { ok: false, errors: [] as string[] }
  const errs = R.errors as string[]
  const eq = (a: unknown, b: unknown, msg: string) => {
    if (a !== b) errs.push(`${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
  const near = (a: number | undefined, b: number, msg: string, tol = 1e-9) => {
    if (a === undefined || Math.abs(a - b) > tol) errs.push(`${msg}: got ${a}, want ~${b}`)
  }

  // ── 主题 fixture（色板 + ea 槽） ──
  const themeXml =
    `<a:theme ${ANS}><a:themeElements>` +
    `<a:clrScheme>` +
    `<a:dk1><a:sysClr val="window" lastClr="000000"/></a:dk1>` +
    `<a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>` +
    `<a:dk2><a:srgbClr val="44546A"/></a:dk2>` +
    `<a:accent1><a:srgbClr val="4472C4"/></a:accent1>` +
    `<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>` +
    `<a:hlink><a:srgbClr val="0563C1"/></a:hlink>` +
    `</a:clrScheme>` +
    `<a:fontScheme><a:majorFont><a:latin typeface="Georgia"/><a:ea typeface="黑体"/></a:majorFont>` +
    `<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="宋体"/></a:minorFont></a:fontScheme>` +
    `<a:fmtScheme><a:fillStyleLst/><a:bgFillStyleLst/><a:lnStyleLst/></a:fmtScheme>` +
    `</a:themeElements></a:theme>`
  const theme: Theme = parseTheme(parseXml(themeXml))
  eq(theme.majorEA, '黑体', 'theme majorEA')
  eq(theme.minorEA, '宋体', 'theme minorEA')

  // ── styles.xml fixture ──
  const stylesXml =
    `<w:styles ${NS}>` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/><w:rFonts w:ascii="Calibri" w:eastAsia="宋体"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    // Normal：默认段落样式（自身 jc=center + sz=24 半 pt → 12pt）
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>` +
    `<w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="24"/></w:rPr></w:style>` +
    // DefaultParagraphFont：默认字符样式（rPr 空）
    `<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/></w:style>` +
    // TableNormal：默认表格样式（after=0 作种子判别器；cellMar 供 table() 断言）
    `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/>` +
    `<w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>` +
    `<w:rPr><w:sz w:val="20"/></w:rPr>` +
    `<w:tblPr><w:tblCellMar><w:top w:w="10" w:type="dxa"/><w:left w:w="20" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
    // L1 → Normal
    `<w:style w:type="paragraph" w:styleId="L1"><w:name w:val="L1"/><w:basedOn w:val="Normal"/>` +
    `<w:pPr><w:jc w:val="left"/><w:ind w:left="200"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>` +
    // L2 → L1
    `<w:style w:type="paragraph" w:styleId="L2"><w:name w:val="L2"/><w:basedOn w:val="L1"/>` +
    `<w:pPr><w:ind w:left="400" w:firstLine="100"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>` +
    // RootPara：BasedOn=null 段落根 → 不叠 Normal 自身
    `<w:style w:type="paragraph" w:styleId="RootPara"><w:name w:val="RootPara"/>` +
    `<w:pPr><w:jc w:val="right"/></w:pPr></w:style>` +
    // Headline：字符根（BasedOn=null）→ 叠 DefaultParagraphFont
    `<w:style w:type="character" w:styleId="Headline"><w:name w:val="Headline"/><w:rPr><w:sz w:val="32"/><w:b/></w:rPr></w:style>` +
    // Subhead → Headline（字符链）
    `<w:style w:type="character" w:styleId="Subhead"><w:name w:val="Subhead"/><w:basedOn w:val="Headline"/>` +
    `<w:rPr><w:sz w:val="28"/><w:caps/></w:rPr></w:style>` +
    // WrongType：字符样式，供段落引用做类型过滤
    `<w:style w:type="character" w:styleId="WrongType"><w:name w:val="WrongType"/><w:rPr><w:strike/></w:rPr></w:style>` +
    // LoopA ↔ LoopB：环保护
    `<w:style w:type="paragraph" w:styleId="LoopA"><w:name w:val="LoopA"/><w:basedOn w:val="LoopB"/><w:rPr><w:b/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="LoopB"><w:name w:val="LoopB"/><w:basedOn w:val="LoopA"/><w:rPr><w:i/></w:rPr></w:style>` +
    // NumStyle：样式挂编号（numId=5, ilvl=0；编号层 ind 720 + rPr sz 26）
    `<w:style w:type="paragraph" w:styleId="NumStyle"><w:name w:val="NumStyle"/>` +
    `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="5"/></w:numPr></w:pPr></w:style>` +
    // KillNum：基于 L2，样式级 numId=0 → 清零缩进
    `<w:style w:type="paragraph" w:styleId="KillNum"><w:name w:val="KillNum"/><w:basedOn w:val="L2"/>` +
    `<w:pPr><w:numPr><w:numId w:val="0"/></w:numPr></w:pPr></w:style>` +
    // 颜色样式：sRGB 直通 / Word 属性形式 / DrawingML 子元素形式
    `<w:style w:type="character" w:styleId="ColorStyle"><w:name w:val="ColorStyle"/>` +
    `<w:rPr><w:color w:val="FF0000"/><w:sz w:val="24"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="AttrTint"><w:name w:val="AttrTint"/>` +
    `<w:rPr><w:color w:themeColor="accent1" w:themeTint="50000"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="AttrShade"><w:name w:val="AttrShade"/>` +
    `<w:rPr><w:color w:themeColor="accent1" w:themeShade="50000"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="ChildTint"><w:name w:val="ChildTint"/>` +
    `<w:rPr><w:color ${ANS}><a:schemeClr a:val="accent1"><a:tint a:val="50000"/></a:schemeClr></w:color></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="ChildShade"><w:name w:val="ChildShade"/>` +
    `<w:rPr><w:color ${ANS}><a:schemeClr a:val="accent1"><a:shade a:val="50000"/></a:schemeClr></w:color></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="ValPlusTint"><w:name w:val="ValPlusTint"/>` +
    `<w:rPr><w:color w:val="FF0000"><w:tint w:val="50000"/></w:color></w:rPr></w:style>` +
    // Hyperlink：默认超链接字符样式
    `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/>` +
    `<w:rPr><w:color w:themeColor="hlink"/><w:u w:val="single"/></w:rPr></w:style>` +
    // ExplicitR：显式字符样式（压隐式 Hyperlink）
    `<w:style w:type="character" w:styleId="ExplicitR"><w:name w:val="ExplicitR"/><w:rPr><w:color w:val="00FF00"/></w:rPr></w:style>` +
    // CJK 字体槽
    `<w:style w:type="character" w:styleId="EastAsia"><w:name w:val="EastAsia"/>` +
    `<w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="仿宋"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="ThemeEA"><w:name w:val="ThemeEA"/>` +
    `<w:rPr><w:rFonts w:asciiTheme="minor" w:eastAsiaTheme="major"/></w:rPr></w:style>` +
    // Tabs / keepLines / widowControl / snapToGrid
    `<w:style w:type="paragraph" w:styleId="TabStyle"><w:name w:val="TabStyle"/>` +
    `<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9000"/><w:tab w:val="clear" w:pos="480"/></w:tabs>` +
    `<w:keepLines/><w:widowControl w:val="0"/><w:snapToGrid/></w:pPr></w:style>` +
    // LinkPair：段落样式带 w:link（不影响 hyperlink run）
    `<w:style w:type="paragraph" w:styleId="LinkPair"><w:name w:val="LinkPair"/><w:link w:val="Headline"/>` +
    `<w:pPr><w:jc w:val="both"/></w:pPr></w:style>` +
    // TblX：非默认表格样式（after=0 种子判别器 + b + 边框）。
    // tblStylePr 是 w:style 的直接子元素（CT_Style 序列：…tblPr, trPr, tcPr, tblStylePr*），
    // 不嵌在 tblPr 里
    `<w:style w:type="table" w:styleId="TblX"><w:name w:val="TblX"/>` +
    `<w:pPr><w:jc w:val="right"/><w:spacing w:after="0"/></w:pPr><w:rPr><w:b/></w:rPr>` +
    `<w:tblPr><w:tblBorders><w:top w:val="single" w:sz="8" w:color="FF0000"/></w:tblBorders></w:tblPr>` +
    `<w:tblStylePr w:type="firstRow"><w:rPr><w:b/></w:rPr><w:tcPr><w:shd w:val="clear" w:fill="EEEEEE"/></w:tcPr></w:tblStylePr>` +
    `</w:style>` +
    `</w:styles>`

  const numberingXml =
    `<w:numbering ${NS}>` +
    `<w:abstractNum w:abstractNumId="9"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/>` +
    `<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:sz w:val="26"/></w:rPr></w:lvl>` +
    `<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="◦"/>` +
    `<w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>` +
    `<w:num w:numId="5"><w:abstractNumId w:val="9"/></w:num>` +
    `</w:numbering>`

  let styles: StyleSheet
  let numbering: Numbering
  try {
    styles = new StyleSheet(parseXml(stylesXml), theme)
    numbering = new Numbering(parseXml(numberingXml), theme)
    styles.setNumbering(numbering)
  } catch (e) {
    errs.push('construct: ' + String(e))
    R.ok = false
    return R
  }

  // ── 0. 默认样式识别（Default.Paragraph / Character / Table / Hyperlink） ──
  eq(styles.defaultPara, 'Normal', 'defaultPara')
  eq(styles.defaultChar, 'DefaultParagraphFont', 'defaultChar')
  eq(styles.defaultTable, 'TableNormal', 'defaultTable')
  eq(styles.defaultHyperlink, 'Hyperlink', 'defaultHyperlink')

  // ── 1. docDefaults 种子（Default.TextPr / Default.ParaPr） ──
  {
    const r = styles.para(undefined)
    near(r.ps.after, 10, 'seed docPs.after (200 twips → 10pt)')
    near(r.ps.line, 1.15, 'seed docPs.line (276/240)')
    eq(r.ps.align, 'center', 'Normal own jc applies on top of seed')
    near(r.rs.sz, 12, 'Normal own sz (24 half-pt → 12pt) beats docDefaults 11')
    eq(r.rs.rfont, 'Calibri', 'docDefaults rFonts latin slot')
    eq(r.rs.rfontEA, '宋体', 'docDefaults eastAsia slot')
  }

  // ── 2. BasedOn 链（祖先先、自身后） ──
  {
    const l1 = styles.para('L1')
    eq(l1.ps.align, 'left', 'L1 own jc beats Normal')
    near(l1.ps.indL, 10, 'L1 ind left=200 → 10pt')
    eq(l1.rs.b, true, 'L1 bold')
    near(l1.rs.sz, 12, 'L1 inherits Normal sz')
    near(l1.ps.after, 10, 'L1 inherits docDefaults after')
    const l2 = styles.para('L2')
    eq(l2.ps.align, 'left', 'L2 inherits L1 jc')
    near(l2.ps.indL, 20, 'L2 own ind left=400')
    near(l2.ps.indFirst, 5, 'L2 firstLine=100 → 5pt')
    eq(l2.rs.i, true, 'L2 italic')
    eq(l2.rs.b, true, 'L2 inherits L1 bold')
  }

  // ── 3. 类型过滤（Style.Type !== Type → 视为缺失） ──
  {
    const r = styles.para('WrongType')
    eq(r.ps.align, 'center', 'wrong-type id → bUseDefault 并入 Normal 自身 jc')
    near(r.rs.sz, 12, 'wrong-type: Normal own sz applies')
    eq(r.rs.strike, undefined, 'character style props must not leak into paragraph')
  }

  // ── 4. 缺失回退 default 样式【自身声明】（非 docDefaults） ──
  {
    const r = styles.para('NoSuchStyle')
    eq(r.ps.align, 'center', 'missing id → Normal own jc')
    near(r.rs.sz, 12, 'missing id → Normal own sz (12), not docDefaults (11)')
    near(r.ps.after, 10, 'missing id keeps docDefaults seed')
  }

  // ── 5. 根样式 BasedOn===null：段落不叠 default（8330-8344 注释掉的分支） ──
  {
    const r = styles.para('RootPara')
    eq(r.ps.align, 'right', 'RootPara own jc')
    near(r.ps.after, 10, 'docDefaults seed still present')
    near(r.rs.sz, 11, 'Normal sz NOT applied to BasedOn=null root paragraph')
  }

  // ── 6. 表格种子（Get_Pr:8096-8110 + 8159） ──
  // TableStyle 非空 → 种子 = 表格面（table() 内含 docDefaults），bUseDefault=false；
  // 但 StyleId 缺省仍解析为 Default.Paragraph，Normal 自身声明在链尾并入（8436-8440）。
  // bug 31469 的注释位于 styletype_Table 分支（8126）—— 它排除的是「表格样式面」
  // 里的 Normal，不是表内段落。
  {
    const a = styles.para('L1', 'TblX')
    eq(a.ps.align, 'left', 'L1 own jc wins in table')
    near(a.ps.indL, 10, 'L1 ind survives in table')
    near(a.ps.after, 0, 'TblX overlay after=0 beats docDefaults after=200')
    near(a.rs.sz, 12, 'L1 basedOn Normal → Normal sz=12 via chain')
    eq(a.rs.b, true, 'L1 bold + TblX bold')
    const rn = styles.para(undefined, 'TblX')
    eq(rn.ps.align, 'center', 'no pStyle in table → Default.Paragraph still applies (8091)')
    near(rn.ps.after, 0, 'table seed after=0')
    near(rn.rs.sz, 12, 'Normal own sz reaches table paragraph via StyleId default')
    eq(rn.rs.b, true, 'TblX rPr (bold) is the table-face overlay')
    const tn = styles.para(undefined, 'TableNormal')
    near(tn.rs.sz, 12, 'TableNormal seed sz=10 → Normal own sz=12 on top')
    near(tn.ps.after, 0, 'TableNormal seed after=0')
  }

  // ── 7. 编号层（只并 GetParaPr，8389；编号层 rPr 属 marker） ──
  {
    const r = styles.para('NumStyle')
    near(r.ps.indL, 36, 'NumStyle numbering ind 720 → 36pt')
    near(r.ps.indFirst, -18, 'NumStyle hanging 360 → -18pt')
    eq(r.numPr?.numId, '5', 'NumStyle numPr carried')
    eq(r.numPr?.ilvl, 0, 'NumStyle ilvl 0')
    eq(r.rs.sz, 11, 'numbering level rPr must NOT leak into paragraph run face')
    const k = styles.para('KillNum')
    near(k.ps.indL, 0, 'numId=0 clears inherited ind (8396)')
    near(k.ps.indFirst, 0, 'numId=0 clears firstLine (8397)')
    eq(k.numPr, undefined, 'numId=0 removes numPr (8395)')
    eq(k.ps.align, 'left', 'KillNum still inherits L1 jc through the chain')
  }

  // ── 8. 颜色变换管线（逐位对照 Format.js Apply） ──
  {
    const attr = (a: string) => resolveColor(parseXml(`<w:color ${NS} ${a}/>`), theme)
    const child = (inner: string) => resolveColor(parseXml(`<w:color ${NS} ${ANS}>${inner}</w:color>`), theme)
    // DrawingML 子元素形式
    eq(child('<a:srgbClr a:val="FF0000"/>'), '#ff0000', 'srgbClr direct')
    eq(child('<a:srgbClr a:val="FF0000"><a:tint a:val="50000"/></a:srgbClr>'), '#ffbcbc', 'srgbClr child tint 50% (gamma RGB)')
    eq(child('<a:srgbClr a:val="FF0000"><a:shade a:val="50000"/></a:srgbClr>'), '#bc0000', 'srgbClr child shade 50% (gamma RGB)')
    eq(child(`<a:schemeClr a:val="accent1"><a:tint a:val="50000"/></a:schemeClr>`), '#c0c9e4', 'schemeClr child tint 50%')
    eq(child(`<a:schemeClr a:val="accent1"><a:shade a:val="50000"/></a:schemeClr>`), '#2f528f', 'schemeClr child shade 50%')
    eq(child(`<a:schemeClr a:val="accent1"><a:lumMod a:val="75000"/><a:lumOff a:val="25000"/></a:schemeClr>`), '#7296d3', 'schemeClr lumMod75+lumOff25')
    eq(child(`<a:schemeClr a:val="accent1"><a:satMod a:val="50000"/></a:schemeClr>`), '#647ba4', 'schemeClr satMod 50%')
    eq(child(`<a:schemeClr a:val="accent1"><a:hueOff a:val="3600000"/></a:schemeClr>`), '#9644c4', 'schemeClr hueOff 60deg')
    eq(child(`<a:schemeClr a:val="accent1"><a:hue a:val="5400000"/></a:schemeClr>`), '#84c444', 'schemeClr hue ABSOLUTE 90deg')
    eq(child(`<a:schemeClr a:val="accent1"><a:comp/></a:schemeClr>`), '#c49644', 'schemeClr comp (hue +180)')
    eq(child('<a:schemeClr a:val="tx1"/>'), '#000000', 'schemeClr tx1 → dk1 alias')
    eq(child('<a:schemeClr a:val="bg1"/>'), '#ffffff', 'schemeClr bg1 → lt1 alias')
    eq(child('<a:sysClr a:val="window"/>'), '#ffffff', 'sysClr window → lastClr fallback')
    // Word 属性形式（≡ lumMod / lumMod+lumOff，对齐 Word 官方色阶矩阵）
    eq(attr('w:themeColor="accent1" w:themeTint="50000"'), '#a2b8e1', 'attr themeTint 50% (Word matrix)')
    eq(attr('w:themeColor="accent1" w:themeShade="50000"'), '#203864', 'attr themeShade 50%')
    eq(attr('w:themeColor="accent1" w:themeTint="35000"'), '#bdcdea', 'attr themeTint 35%')
    eq(attr('w:themeColor="dk1" w:themeTint="50000"'), '#808080', 'attr dk1 themeTint 50%')
    eq(attr('w:themeColor="tx1"'), '#000000', 'attr themeColor tx1 → dk1')
    eq(attr('w:themeColor="hlink"'), '#0563c1', 'attr hlink')
    eq(attr('w:val="auto"'), undefined, 'auto → undefined')
    // w:val + 子元素变换（旧实现丢子元素，现按管线跑）
    eq(child('<a:srgbClr a:val="FF0000"><a:lumMod a:val="50000"/></a:srgbClr>'), '#800000', 'srgbClr val + lumMod')
    // 样式面消费
    eq(styles.char('ColorStyle').color, '#ff0000', 'char ColorStyle sRGB direct')
    eq(styles.char('AttrTint').color, '#a2b8e1', 'char AttrTint')
    eq(styles.char('AttrShade').color, '#203864', 'char AttrShade')
    eq(styles.char('ChildTint').color, '#c0c9e4', 'char ChildTint')
    eq(styles.char('ChildShade').color, '#2f528f', 'char ChildShade')
    eq(styles.char('ValPlusTint').color, '#ffbcbc', 'char ValPlusTint (val + child mod)')
  }

  // ── 8b. 共享管线收敛（core/color.ts 曾自带第二套 0..1 HSL 近似，现全部
  //        转发到 theme.ts 的 sdkjs 字节实现；下列权威值逐条对着 Format.js
  //        CColorModifiers.Apply 原文核算） ──
  {
    const dml = (inner: string) =>
      drawingColor(parseXml(`<r ${ANS}>${inner}</r>`).c[0], { theme } as ColorCtx)
    // Excel tint (-1..1)：与 wordTint/wordShade 同族（HSL 亮度线性缩放 + 平移）
    eq(applyTint('#4472C4', 0.5), '#a1b8e2', 'sheet tint +0.5 on accent1')
    eq(applyTint('#4472C4', -0.5), '#203864', 'sheet tint -0.5 on accent1')
    eq(applyTint('#4472C4', 0.25), '#7395d3', 'sheet tint +0.25 on accent1')
    eq(applyTint('#FFFFFF', 0.5), '#ffffff', 'sheet tint on white is identity')
    eq(applyTint('#000000', 0.5), '#808080', 'sheet tint +0.5 on black')
    // DrawingML（pptx / xlsx 走这条）：tint/shade 是伽马 RGB 通道，lumMod 是 HSL 亮度
    eq(dml('<a:schemeClr a:val="accent1"><a:lumMod a:val="75000"/></a:schemeClr>'), '#2f5597', 'shared lumMod 75%')
    eq(dml('<a:schemeClr a:val="accent1"><a:tint a:val="50000"/></a:schemeClr>'), '#c0c9e4', 'shared child tint 50%')
    eq(dml('<a:schemeClr a:val="accent1"><a:shade a:val="50000"/></a:schemeClr>'), '#2f528f', 'shared child shade 50%')
    eq(dml('<a:schemeClr a:val="accent1"><a:satMod a:val="50000"/></a:schemeClr>'), '#647ba4', 'shared satMod 50%')
    eq(dml('<a:schemeClr a:val="accent1"><a:inv a:val="100000"/></a:schemeClr>'), '#f8ebb3', 'shared inv (gamma round-trip)')
    eq(dml('<a:schemeClr a:val="accent1"><a:gray a:val="100000"/></a:schemeClr>'), '#6e6e6e', 'shared gray 709 weights')
    eq(dml('<a:schemeClr a:val="accent1"><a:alpha a:val="50000"/></a:schemeClr>'), 'rgba(68,114,196,0.5)', 'shared alpha → rgba')
    eq(dml('<a:schemeClr a:val="tx1"/>'), '#000000', 'shared schemeClr tx1 → dk1')
    eq(dml('<a:schemeClr a:val="bg1"/>'), '#ffffff', 'shared schemeClr bg1 → lt1')
    // 灰色（R==G==B）分流：satMod 仍走 HSL（S=0 → 恒等），而 sat/satOff 走
    // graySaturation（Format.js:2068/2238/2320）—— 直接在 R/G/B 上缩放，不进伽马
    eq(dml('<a:schemeClr a:val="accent3"><a:satMod a:val="50000"/></a:schemeClr>'), '#a5a5a5', 'satMod on gray is identity (HSL S already 0)')
    eq(dml('<a:schemeClr a:val="accent3"><a:satOff a:val="20000"/></a:schemeClr>'), '#b7934b', 'graySaturation satOff 20% on L=165 gray')
    // 通道级 Mod/Off 与单向 gamma（新增 case，旧实现直接吞掉）
    eq(dml('<a:srgbClr a:val="4472C4"><a:redMod a:val="50000"/></a:srgbClr>'), '#2f72c4', 'redMod 50%')
    eq(dml('<a:srgbClr a:val="4472C4"><a:greenOff a:val="20000"/></a:srgbClr>'), '#44a3c4', 'greenOff 20%')
    eq(dml('<a:srgbClr a:val="4472C4"><a:blue a:val="100000"/></a:srgbClr>'), '#4472ff', 'blue absolute')
    eq(dml('<a:srgbClr a:val="4472C4"><a:invGamma a:val="100000"/></a:srgbClr>'), '#0f2b8d', 'invGamma one-way')
    // 颜色【指定】形式：hslClr / scrgbClr
    eq(dml('<a:hslClr a:hue="21600000" a:sat="100000" a:lum="50000"/>'), '#ff0000', 'hslClr hue 360deg = red')
    eq(dml('<a:scrgbClr a:r="50000" a:g="100000" a:b="150000"/>'), '#80ffff', 'scrgbClr percentages')
    // ST_PresetColorVal 全表（旧实现只有 24 项，未命中兜黑；现 190 项 + 未命中 undefined）
    eq(presetColor('darkRed'), '#8b0000', 'preset darkRed (was black)')
    eq(presetColor('royalBlue'), '#4169e1', 'preset royalBlue')
    eq(presetColor('DARKRED'), '#8b0000', 'preset lookup is case-insensitive')
    eq(presetColor('notAColor'), undefined, 'unknown preset → undefined, no black fallback')
    eq(dml('<a:prstClr a:val="darkRed"/>'), '#8b0000', 'prstClr darkRed through shared pipeline')
  }

  // ── 9. CJK 字体槽 ──
  {
    const ea = styles.char('EastAsia')
    eq(ea.rfont, 'Times New Roman', 'latin slot raw')
    eq(ea.rfontEA, '仿宋', 'eastAsia slot raw')
    const th = styles.char('ThemeEA')
    eq(th.rfont, 'Calibri', 'asciiTheme minor → theme minor')
    eq(th.rfontEA, '黑体', 'eastAsiaTheme major → theme majorEA')
    eq(styles.char('Hyperlink').rfontEA, undefined, 'Hyperlink has no explicit ea slot')
  }

  // ── 10. 超链接面（GetDefaultHyperlink = Default.Hyperlink） ──
  {
    const hl = styles.hyperlink()
    eq(hl?.color, '#0563c1', 'Default.Hyperlink theme hlink')
    eq(hl?.u, 'single', 'Hyperlink underline')
    const hp = styles.para('LinkPair')
    eq(hp.rs.color, undefined, 'paragraph w:link must NOT bleed into paragraph run face')
    eq(hp.ps.align, 'justify', 'LinkPair jc both → justify')
  }

  // ── 字符样式链 / 根字符叠 Default.Character ──
  {
    const head = styles.char('Headline')
    near(head.sz, 16, 'Headline sz 32 half-pt')
    eq(head.b, true, 'Headline bold')
    const sub = styles.char('Subhead')
    near(sub.sz, 14, 'Subhead overrides Headline sz')
    eq(sub.b, true, 'Subhead inherits Headline bold')
    eq(sub.caps, true, 'Subhead own caps')
    eq(JSON.stringify(styles.char(undefined)), '{}', 'char(undefined) = empty delta')
  }

  // ── 环保护（PassedStyles） ──
  {
    const a = styles.para('LoopA')
    eq(a.rs.b, true, 'LoopA bold')
    eq(a.rs.i, true, 'LoopA picks LoopB italic')
    const b = styles.para('LoopB')
    eq(b.rs.i, true, 'LoopB italic')
    eq(b.rs.b, true, 'LoopB picks LoopA bold')
  }

  // ── 制表位 / keepLines / widow / snapGrid ──
  {
    const t = styles.para('TabStyle')
    eq(t.ps.tabs?.length, 1, 'clear tab dropped, one remains')
    eq(t.ps.tabs?.[0].pos, 450, 'tab pos 9000 twips → 450pt')
    eq(t.ps.tabs?.[0].al, 'right', 'tab align right')
    eq(t.ps.tabs?.[0].leader, 'dot', 'tab leader dot (ST_TabTlc)')
    eq(t.ps.keepLines, true, 'keepLines on')
    eq(t.ps.widow, false, 'widowControl off')
    eq(t.ps.snapGrid, true, 'snapToGrid on')
  }

  // ── 表格样式面（docDefaults 打底 + 边框 / cellMar / 条件格式） ──
  {
    const tb = styles.table('TblX')
    eq(tb.borders.top?.style, 'solid', 'TblX top border solid')
    near(tb.borders.top?.w, 1, 'border sz 8 → 1pt')
    eq(tb.borders.top?.color, '#ff0000', 'border color')
    near(tb.ps.after, 0, 'table face carries TblX pPr after=0')
    near(tb.rs.sz, 11, 'table face rs = docDefaults sz (TblX sets no sz)')
    eq(tb.cond.firstRow?.shd, '#eeeeee', 'tblStylePr firstRow shd')
    eq(tb.cond.firstRow?.rs.b, true, 'tblStylePr firstRow rPr bold')
    const tn = styles.table(undefined)
    near(tn.cellMar.top, 0.5, 'TableNormal cellMar top 10 twips → 0.5pt')
    near(tn.cellMar.left, 1, 'TableNormal cellMar left 20 twips → 1pt')
    near(tn.rs.sz, 10, 'TableNormal own rPr sz 20 half-pt → 10pt')
  }

  // ── 11. 端到端：Converter 段落合并序 ──
  {
    const docXml =
      `<w:document ${NS}><w:body>` +
      `<w:p><w:pPr><w:pStyle w:val="NumStyle"/></w:pPr><w:r><w:t>A</w:t></w:r></w:p>` +
      `<w:p><w:pPr><w:pStyle w:val="KillNum"/><w:numPr><w:numId w:val="0"/></w:numPr><w:ind w:left="300"/></w:pPr><w:r><w:t>B</w:t></w:r></w:p>` +
      `<w:p><w:pPr><w:pStyle w:val="L2"/></w:pPr><w:r><w:rPr><w:rStyle w:val="ExplicitR"/></w:rPr><w:t>C</w:t></w:r>` +
      `<w:hyperlink r:id="rIdH" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:r><w:t>D</w:t></w:r></w:hyperlink>` +
      `<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>E</w:t></w:r></w:p>` +
      `</w:body></w:document>`
    const conv = new Converter(styles, numbering, theme, new Map())
    const out: Paragraph[] = []
    for (const c of parseXml(docXml).c[0].c) conv.blocks(c, out as never)
    const pa = out[0]
    near(pa.ps.indL, 36, 'e2e NumStyle ind from numbering layer')
    eq(pa.marker?.text, '•', 'e2e bullet marker from numbering')
    near(pa.marker?.s.sz, 13, 'e2e numbering level rPr lands on the MARKER (sz 26 half-pt)')
    near(pa.runs[0] && (pa.runs[0] as any).s?.sz, 11, 'e2e run face keeps docDefaults sz (no level leak)')
    const pb = out[1]
    near(pb.ps.indL, 15, 'e2e direct ind (300 twips) beats numId=0 zeroing')
    eq(pb.lst, undefined, 'e2e numId=0 removes list')
    const pc = out[2]
    const runC = pc.runs.find((r: any) => r.text === 'C') as any
    eq(runC?.s.color, '#00ff00', 'e2e explicit rStyle beats implicit hyperlink')
    near(runC?.s.sz, 12, 'e2e L2 base sz from Normal via chain (12pt)')
    const runD = pc.runs.find((r: any) => r.text === 'D') as any
    eq(runD?.s.color, '#0563c1', 'e2e hyperlink run gets Default.Hyperlink face')
    eq(runD?.s.u, 'single', 'e2e hyperlink underline')
    const runE = pc.runs.find((r: any) => r.text === 'E') as any
    eq(runE?.s.color, '#0563c1', 'e2e explicit Hyperlink rStyle same face')
  }

  // ── 缓存键隔离：不同表格种子不串 ──
  {
    const a = styles.para('L1', 'TblX')
    const b = styles.para('L1')
    near(a.ps.after, 0, 'table-seed variant keeps TblX overlay (after=0)')
    near(b.ps.after, 10, 'plain variant keeps docDefaults (after=200 → 10pt)')
    eq(styles.para('L1', 'TblX'), a, 'same seed+id hits cache')
    near(styles.para('L1', 'TableNormal').ps.after, 0, 'TableNormal seed after=0 too')
  }

  // ── DEFAULT_THEME 兜底 ──
  eq(DEFAULT_THEME.minor, 'Calibri', 'DEFAULT_THEME sanity')
  eq(DEFAULT_THEME.colors.hlink, '#0563c1', 'DEFAULT_THEME hlink swatch')

  R.ok = errs.length === 0
  R.errors = errs
  return R
}

let cached: Record<string, unknown> | null = null
function result() {
  if (!cached) cached = probe()
  return cached
}

registerSmokeMode('x12', () => {
  ;(window as any).__smoke.x12 = { result }
  return () => h('div', { style: 'width:100%;height:100%' }, 'x12 style-calc probe')
})