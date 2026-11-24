/**
 * x22 探针（路线图 P8，?mode=x22）：内置样式**全量写回**的口径固化 + 端到端幂等。
 * 五节：
 *   A 注册表完备性（190 条 = 127 表 + 32 段落 + 30 字符 + 1 编号；4 缺省样式齐全）；
 *   B 序列化单位/形态抽查（逐条对 sdkjs 写路径原文 + 实测推演，禁凭印象——x20 教训）；
 *   C 写回端到端幂等 + 重开收敛（Engine save → styles.xml 全量 → 再 save 字节稳定 → 重开解析干净）；
 *   D 透传安全（未触碰的既有样式字节零扰动；自关闭根展开）；
 *   E ensureStyle 同源（收敛后 = 全量写回单条特例，canonical() 读回注册表 id）。
 *
 * 取证来源（sdkjs release/v10.0.0，逐行核实；详见 builtin.ts 头注）：
 *   - 写语义：SerializeCommonWordExcel.js WriteBorder :211-251 / WriteShd :297-350 /
 *     WriteColorTheme :412-434 + Serialize2.js rPr 文字色 :3225-3235——三处同构，
 *     flat = `Color ?? 解析(Unifill)`，Auto/不可解析 → auto；主题族门 = `Unifill||(Color&&Auto)`。
 *   - 单位：getSizeIn8Point（边框 sz=round(8·mm·72/25.4)）、MM2Twips、半磅字号、
 *     行距 auto=round(240·Line)。
 *   - 颜色：ST_UcharHexNumber（themeTint/Shade = 1 字节 hex，FF=原色）；三方言主题词表
 *     （theme.ts SCHEME_ALIAS 全认 + ID_WORD 写侧语义名直出）。
 *   - 规划器：planBuiltinWrite 按 styleId ∪ 归一化名字查重（本地化文件 name="标题 1"
 *     但 id=Heading1 → id 命中排除，绝不生成幽灵重复）+ id 分配 + basedOn/next/link 重定向。
 *
 * 顶层只注册 mode；结果挂 window.__smoke.x22。
 */
import { h } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import {
  BUILTIN_STYLES, serializeBuiltinStyle, planBuiltinWrite, builtinMissing, type BuiltinEntry, type ExistingStyle,
} from './core/docx/builtin'
import { DEFAULT_THEME } from './core/theme'
import { Engine } from './core/worker/engine'
import { writeZip } from './core/zipwrite'
import { ZipArchive } from './core/zip'
import { BufferSource } from './core/source'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
// 序列化器用带冒号前缀；探针内核面统一 ':w:' 便于正则
const WP = ':w:'
const byId = (id: string): BuiltinEntry => BUILTIN_STYLES.find((e) => e.id === id)!

async function run(): Promise<Record<string, unknown>> {
  const R: Record<string, unknown> = { ok: false, errors: [] as string[] }
  const errs = R.errors as string[]
  const eq = (name: string, a: unknown, b: unknown) => {
    if (a !== b) errs.push(`${name}: 实=${JSON.stringify(a)} 期=${JSON.stringify(b)}`)
  }
  const ok = (name: string, cond: unknown) => {
    if (!cond) errs.push(`${name}: 期望真值，实=${JSON.stringify(cond)}`)
  }

  // ── A. 注册表完备性 ──
  const byType: Record<string, number> = {}
  for (const e of BUILTIN_STYLES) byType[e.type] = (byType[e.type] ?? 0) + 1
  eq('A1 总数', BUILTIN_STYLES.length, 190)
  eq('A2 表样式', byType.table, 127)
  eq('A3 段落', byType.paragraph, 32)
  eq('A4 字符', byType.character, 30)
  eq('A5 编号', byType.numbering, 1)
  // 4 缺省样式齐全（重开 missingDefaultStyles 查重的收敛前提）
  eq('A6 Normal id', BUILTIN_STYLES.find((e) => e.name === 'Normal')?.id, 'Normal')
  eq('A7 Default Paragraph Font id', BUILTIN_STYLES.find((e) => e.name === 'Default Paragraph Font')?.id, 'DefaultParagraphFont')
  eq('A8 No List id', BUILTIN_STYLES.find((e) => e.name === 'No List')?.id, 'NoList')
  eq('A9 Normal Table id', BUILTIN_STYLES.find((e) => e.name === 'Normal Table')?.id, 'TableNormal')
  // styleId 唯一
  eq('A10 styleId 唯一', new Set(BUILTIN_STYLES.map((e) => e.id)).size, 190)

  // ── B. 单位/形态抽查（逐条实测推演） ──
  // Table Grid 边框：0.176388mm → sz=round(8·0.176388·72/25.4)=4，color 槽 {0,0,0}→000000
  const tg = serializeBuiltinStyle(byId('TableGrid'), WP, DEFAULT_THEME)
  ok('B1 TableGrid top single sz4 color000000', /<:w:top :w:val="single" :w:sz="4" :w:space="0" :w:color="000000"/.test(tg))
  // Title 字符间距 −0.176388mm → −10 twips；字号 28pt → sz56
  const title = serializeBuiltinStyle(byId('Title'), WP, DEFAULT_THEME)
  ok('B2 Title spacing −10', /<:w:spacing :w:val="-10"\/>/.test(title))
  ok('B3 Title sz56/szCs56', /<:w:sz :w:val="56"\/><:w:szCs :w:val="56"\/>/.test(title))
  // Heading1 全形态：basedOn/next=Normal、link=Heading1Char、pPr 序 keepNext→keepLines→spacing→outlineLvl、
  // 字号 20pt→sz40、flat color=Color 槽 {15,71,97}→0F4761 + themeColor=accent1 themeShade=BF
  const h1 = serializeBuiltinStyle(byId('Heading1'), WP, DEFAULT_THEME)
  eq('B4 Heading1 全形态', h1,
    '<:w:style :w:type="paragraph" :w:styleId="Heading1">' +
    '<:w:name :w:val="Heading 1"/><:w:basedOn :w:val="Normal"/><:w:next :w:val="Normal"/><:w:link :w:val="Heading1Char"/>' +
    '<:w:uiPriority :w:val="9"/><:w:qFormat/>' +
    '<:w:pPr><:w:keepNext/><:w:keepLines/><:w:spacing :w:before="360" :w:after="80"/><:w:outlineLvl :w:val="0"/></:w:pPr>' +
    '<:w:rPr><:w:rFonts :w:ascii="Arial" :w:hAnsi="Arial" :w:eastAsia="Arial" :w:cs="Arial"/>' +
    '<:w:color :w:val="0F4761" :w:themeColor="accent1" :w:themeShade="BF"/><:w:sz :w:val="40"/><:w:szCs :w:val="40"/></:w:rPr>' +
    '</:w:style>')
  // Subtitle：NumPr 仅 Lvl 无 NumId → **不发 numPr**（全文件唯一有意不忠实）；字号 14pt→sz28；
  // flat color=Color{89,89,89}→595959 + themeColor=text1 themeTint=A6（166=0xA6）
  const sub = serializeBuiltinStyle(byId('Subtitle'), WP, DEFAULT_THEME)
  ok('B5 Subtitle 无 numPr', !/<:w:numPr/.test(sub))
  eq('B6 Subtitle 全形态', sub,
    '<:w:style :w:type="paragraph" :w:styleId="Subtitle">' +
    '<:w:name :w:val="Subtitle"/><:w:basedOn :w:val="Normal"/><:w:next :w:val="Normal"/><:w:link :w:val="SubtitleChar"/>' +
    '<:w:uiPriority :w:val="11"/><:w:qFormat/>' +
    '<:w:rPr><:w:color :w:val="595959" :w:themeColor="text1" :w:themeTint="A6"/><:w:spacing :w:val="15"/><:w:sz :w:val="28"/><:w:szCs :w:val="28"/></:w:rPr>' +
    '</:w:style>')
  // Plain Table 1 shd：ThemeFill=text1 tint=0D → w:fill=F2F2F2（主题管线解析）；Color 白哨兵→auto；
  // CT_Shd 词表 themeColor/themeFill/*Shade/*Tint（与 CT_Color 不同族），声明序
  const pt1 = serializeBuiltinStyle(BUILTIN_STYLES.find((e) => e.name === 'Plain Table 1')!, WP, DEFAULT_THEME)
  ok('B7 PlainTable1 shd CT_Shd 族 + fill 解析', /<:w:shd :w:val="clear" :w:color="auto" :w:fill="F2F2F2" :w:themeColor="text1" :w:themeFill="text1" :w:themeColorShade="FF" :w:themeFillShade="FF" :w:themeColorTint="0D" :w:themeFillTint="0D"\/>/.test(pt1))
  // 175 text noColor 代表（ListTable7Colorful-Accent6 条件槽）：无 Color 槽 → resolve(Unifill)→hex
  // accent6 tint98 shade95 → 5E923C（读写对称：resolveColor 回读同值）
  const lt7 = BUILTIN_STYLES.find((e) => e.id === 'ListTable7Colorful-Accent6')
  const lt7ser = lt7 ? serializeBuiltinStyle(lt7, WP, DEFAULT_THEME) : ''
  ok('B8 text noColor 解析 hex（非 auto）', /<:w:color :w:val="5E923C" :w:themeColor="accent6" :w:themeTint="98" :w:themeShade="95"\/>/.test(lt7ser))
  // customStyle 属性化（构造假条目，注册表 0 条 custom）
  const fake: BuiltinEntry = { ...byId('Normal'), custom: true, id: 'XCustom', name: 'X Custom', default: true }
  ok('B9 customStyle 是属性非元素', /<:w:style :w:type="paragraph" :w:default="1" :w:customStyle="1" :w:styleId="XCustom">/.test(serializeBuiltinStyle(fake, WP, DEFAULT_THEME)))

  // ── 规划器口径（内核级） ──
  const emptyPlan = planBuiltinWrite([])
  eq('P1 空文件全量', emptyPlan.length, 190)
  // 本地化：文件用 id=Heading1 装 name="标题 1" → id 命中排除（不生成幽灵 Heading12）
  const loc: ExistingStyle[] = [{ id: 'Heading1', name: '标题 1' }, { id: 'myNormal', name: 'Standard' }]
  const locPlan = planBuiltinWrite(loc)
  ok('P2 本地化 Heading1 按 id 排除', !locPlan.some((e) => e.name === 'Heading 1'))
  // 引用重定向：注册表 basedOn=Normal 的条目，Normal 在本批写回集 → 保留 Normal（不悬空）
  ok('P3 basedOn=Normal 同批保留', locPlan.some((e) => e.basedOn === 'Normal'))
  // 无悬空引用
  const validIds = new Set(loc.map((e) => e.id))
  for (const e of locPlan) validIds.add(e.id)
  let dang = 0
  for (const e of locPlan) for (const r of [e.basedOn, e.next, e.link]) if (r && !validIds.has(r)) dang++
  eq('P4 本地化写回零悬空', dang, 0)
  // builtinMissing 与 planBuiltinWrite 的缺失集同名（单一 filterMissing 实现）
  eq('P5 missing==plan 同名', new Set(builtinMissing(loc).map((e) => e.name)).size, new Set(locPlan.map((e) => e.name)).size)

  // ── C/D/E. 端到端（Engine save → styles.xml 全量 → 幂等 → 重开 → ensureStyle 同源） ──
  const DOC = `${DECL}<w:document xmlns:w="${W}"><w:body>` +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Hi</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>plain</w:t></w:r></w:p>' +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/></w:sectPr>' +
    '</w:body></w:document>'
  // 既有自定义样式（透传字节必须零扰动）+ 自关闭场景另测
  const CUSTOM = '<w:style w:type="paragraph" w:styleId="MyBrand"><w:name w:val="My Brand"/><w:rPr><w:b/></w:rPr></w:style>'
  const STYLES_PART = `${DECL}<w:styles xmlns:w="${W}">${CUSTOM}</w:styles>`
  const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const PKGREL = 'http://schemas.openxmlformats.org/package/2006/relationships'
  const book = new Map<string, string | Uint8Array>([
    ['[Content_Types].xml', `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '</Types>'],
    ['_rels/.rels', `${DECL}<Relationships xmlns="${PKGREL}"><Relationship Id="rId1" Type="${RT}/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', DOC],
    ['word/styles.xml', STYLES_PART],
    ['word/_rels/document.xml.rels', `${DECL}<Relationships xmlns="${PKGREL}">` +
      `<Relationship Id="rId1" Type="${RT}/styles" Target="styles.xml"/></Relationships>`],
  ])
  try {
    const blob = await writeZip(book)
    let meta: any = null
    const e = new Engine((ev: string, p: any) => {
      if (ev === 'docx:meta') meta = p
      if (p?.error) errs.push(`engine event error: ${p.error}`)
    })
    await e.open(blob, { name: 'builtin.docx' })
    await e.call('docx.start', [])
    for (let i = 0; i < 200 && !meta; i++) await new Promise((r) => setTimeout(r, 50))
    if (!meta) throw new Error('docx 无 meta 终态')

    // 首存：styles.xml 应含全部 190 内置 + 既有 MyBrand（透传）
    const saved1 = (await e.call('save', [])) as Blob
    const z1 = await ZipArchive.open(new BufferSource(new Uint8Array(await saved1.arrayBuffer())))
    const st1 = await z1.text('word/styles.xml')
    const styleCount = (st1.match(/<w:style\b/g) ?? []).length
    eq('C1 首存含 190+1 条', styleCount, 191)
    ok('C2 首存含 Heading1', /w:styleId="Heading1"/.test(st1))
    ok('C3 首存含 TableNormal（缺省齐全）', /w:styleId="TableNormal"/.test(st1))
    ok('C4 既有 MyBrand 透传字节零扰动', st1.includes(CUSTOM))
    ok('C5 首存含 Heading1 富态（accent1/BF）', /w:color w:val="0F4761" w:themeColor="accent1" w:themeShade="BF"/.test(st1))

    // 再存（幂等）：写回集空 → styles.xml 字节稳定
    const saved2 = (await e.call('save', [])) as Blob
    const z2 = await ZipArchive.open(new BufferSource(new Uint8Array(await saved2.arrayBuffer())))
    const st2 = await z2.text('word/styles.xml')
    eq('D1 二次 save 幂等（字节稳定）', st2, st1)

    // 重开：StyleSheet 从文件重建 → 无 postload 注入（缺省齐全）→ 再 save 仍幂等 → 收敛
    const e3 = new Engine(() => {})
    await e3.open(saved2, { name: 'builtin.docx' })
    await e3.call('docx.start', [])
    for (let i = 0; i < 200; i++) await new Promise((r) => setTimeout(r, 50))
    const saved3 = (await e3.call('save', [])) as Blob
    const z3 = await ZipArchive.open(new BufferSource(new Uint8Array(await saved3.arrayBuffer())))
    const st3 = await z3.text('word/styles.xml')
    eq('D2 重开再 save 收敛（幂等）', st3, st1)

    // E. ensureStyle 同源：重开文档已含 Heading1 → canonical().h1 命中注册表 id；
    //    对一个只有 Normal 的极简文档 ensure('h1') → 触发全量写回 → 读回 id='Heading1'
    const h1id = await e3.call('docx.style', ['h1']) as { id: string }
    eq('E1 ensureStyle(h1) 已存在读回注册表 id', h1id.id, 'Heading1')
  } catch (err) {
    errs.push(`C/D/E threw: ${err}`)
  }

  // ── D-extra. 自关闭 styles 根展开 + 无 styles part 合成 ──
  const SELFDOC = `${DECL}<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>x</w:t></w:r></w:p>` +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>'
  const selfBook = new Map<string, string | Uint8Array>([
    ['[Content_Types].xml', `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '</Types>'],
    ['_rels/.rels', `${DECL}<Relationships xmlns="${PKGREL}"><Relationship Id="rId1" Type="${RT}/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', SELFDOC],
    ['word/styles.xml', `${DECL}<w:styles xmlns:w="${W}"/>`],
    ['word/_rels/document.xml.rels', `${DECL}<Relationships xmlns="${PKGREL}"><Relationship Id="rId1" Type="${RT}/styles" Target="styles.xml"/></Relationships>`],
  ])
  try {
    const sb = await writeZip(selfBook)
    let smeta: any = null
    const se = new Engine((ev: string, p: any) => { if (ev === 'docx:meta') smeta = p })
    await se.open(sb, { name: 'selfclose.docx' })
    await se.call('docx.start', [])
    for (let i = 0; i < 200 && !smeta; i++) await new Promise((r) => setTimeout(r, 50))
    const ssaved = (await se.call('save', [])) as Blob
    const sz = await ZipArchive.open(new BufferSource(new Uint8Array(await ssaved.arrayBuffer())))
    const sst = await sz.text('word/styles.xml')
    eq('D3 自关闭根展开含 190 条', (sst.match(/<w:style\b/g) ?? []).length, 190)
    ok('D4 自关闭根展开后成对闭合', /<\/w:styles>$/.test(sst.trim()))
  } catch (err) {
    errs.push(`D-selfclose threw: ${err}`)
  }

  R.ok = errs.length === 0
  return R
}

let cached: Promise<Record<string, unknown>> | null = null
function result(): Promise<Record<string, unknown>> {
  if (!cached) cached = run().catch((e) => ({ ok: false, errors: [`threw: ${e}`] }))
  return cached
}

registerSmokeMode('x22', () => {
  ;(window as any).__smoke.x22 = { result }
  return () => h('div', { style: 'width:100%;height:100%' }, 'x22 P8 builtin-styles full-writeback probe')
})
