/**
 * x20 探针（路线图 P6，?mode=x20）：PPT 母版继承 + normAutofit + 动画时序的**内核口径**固化。
 * 断言先行：先锁纯函数轨迹，再接线（parser inheritChain / OfficeSlideCanvas 播放）。
 *
 * 取证来源（sdkjs release/v10.0.0，逐行核实）：
 *   - getMatchingShape 六级瀑布：SlideBase.js:327-466
 *       reduced：type null→body、ctrTitle→title；idx null→0。
 *       第一遍 reduced(type)+reduced(idx) 精确；title 特例（双方 reduced 皆 title 即命中，:383）；
 *       special-ph（sldNum/dt/ftr/hdr/sldImg）第二遍忽略 idx（:398）；
 *       info 传入 → 到此为止（:416）；否则兜底 1 单一 body+bSingleBody（:419）→
 *       兜底 2 仅比 reduced(idx)、bBadMatch=true（:426）→ 兜底 3 单一 body+bSingleBody（:458）。
 *       bBadMatch = !(原始 type===请求 type && 原始 idx===请求 idx)。
 *   - getHierarchy：Shape.js:1709-1753 —— layout 查询用自身 ph + 自身 bSingleBody；
 *       master 查询用自身 ph + **硬编码 true**（非 layout 派生 type）。
 *   - getIsSingleBody：ShapePrototype.js:685-701 —— 自身 ph type 为 body/null，
 *       且**同 spTree 直接子级**无其他 type===body 占位符（grpSp 子节点不扫）。
 *   - normAutofit 二分：Shape.js:4441 aScales=[25000..95000,10000]（16 项，末项哨兵永不被选）；
 *       :5151 早退（无 XML scale 且高≤框）；:5170 100000 档试算；:5186 二分
 *       nCurIndex=15/nCurShift=-8，低档 a[i-1] 放得下 → 回探高档 a[i]，
 *       高档 `contentHeight >= clipH` （**等号判溢出**，:5203）→ 命中低档 break；
 *       :5214 |shift|<1 break；:5218 nCurIndex-1<0 锁 a[0]=25000；
 *       :5196 lnSpcReduction=0.2*(100000-scale)>>0；:5223 标题（title/ctrTitle）下限 90000。
 *   - parseTimeValue：Timing.js:162-174 —— 非串→Unspecified(undefined)；'indefinite'→Indefinite；
 *       否则 parseInt（'12.7'→12，截断非四舍五入）。
 *   - dur/delay 口径：fromToJSON.js:1281/2895（cTn@dur）、:1782/2821（cond@delay）——
 *       clickEffect 自身 @dur 优先（有限值），缺省取子树最大有限 dur；delay=首个 stCondLst/cond@delay。
 *
 * 合成 heightOf（线性 H0*scale/100000）复现二分轨迹；早退两分支（:5151/:5170）在
 * 「heightOf(100000)=未缩放高」参考系下坍缩为一次判定（内核 inherit.ts 已合并，此处锁合并正当性）。
 *
 * 顶层只注册 mode；结果挂 window.__smoke.x20。
 */
import { h } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import { parseXml } from './core/xml'
import { parseRaw } from './core/raw'
import {
  reducePhType, reducePhIdx, isSpecialPh, matchPlaceholder,
  A_SCALES, lnSpcReductionOf, normAutofitScale, type PhGlyph,
} from './core/pptx/inherit'
import { parseTimingListX, parseTimingX, timingListOf, parseTimeValue } from './core/pptx/anim'
import type { AnimSeqItem } from './core/pptx/types'

type G = { ph: PhGlyph; v: string }

async function run(): Promise<Record<string, unknown>> {
  const R: Record<string, unknown> = { ok: false, errors: [] as string[] }
  const errs = R.errors as string[]
  const eq = (name: string, a: unknown, b: unknown) => {
    if (a !== b) errs.push(`${name}: 实=${JSON.stringify(a)} 期=${JSON.stringify(b)}`)
  }

  // ── 1. reduced 语义（SlideBase.js:329-344） ──
  eq('reducePhType(null)', reducePhType(undefined), 'body')
  eq('reducePhType(ctrTitle)', reducePhType('ctrTitle'), 'title')
  eq('reducePhType(body)', reducePhType('body'), 'body')
  eq('reducePhType(subTitle)', reducePhType('subTitle'), 'subTitle')
  eq('reducePhIdx(null)', reducePhIdx(undefined), '0')
  eq('reducePhIdx(5)', reducePhIdx('5'), '5')
  eq('isSpecialPh(ftr)', isSpecialPh('ftr'), true)
  eq('isSpecialPh(title)', isSpecialPh('title'), false)
  eq('isSpecialPh(null)', isSpecialPh(undefined), false)

  // ── 2. 六级匹配瀑布（逐条对 :354-:463 推演） ──
  // T1 reduced 精确 + idx 缺失坏配：请求 title/无idx vs glyph title/'0' → 命中，badMatch=true（'0'!==undefined）
  const t1 = matchPlaceholder([{ ph: { type: 'title', idx: '0' }, v: 'L-title' }], 'title', undefined, false)
  eq('T1.shape', t1.shape, 'L-title')
  eq('T1.badMatch', t1.badMatch, true)
  // T2 ctrTitle→title reduction 精确：双方原始串一致 → badMatch=false
  const t2 = matchPlaceholder([{ ph: { type: 'ctrTitle' }, v: 'M-ctrTitle' }], 'ctrTitle', undefined, false)
  eq('T2.shape', t2.shape, 'M-ctrTitle')
  eq('T2.badMatch', t2.badMatch, false)
  // T3 title 特例（:383）：请求 title/'5' vs glyph title/'0' → reduced 皆 title 即命中，badMatch=true
  const t3 = matchPlaceholder([{ ph: { type: 'title', idx: '0' }, v: 'T0' }], 'title', '5', false)
  eq('T3.shape', t3.shape, 'T0')
  eq('T3.badMatch', t3.badMatch, true)
  // T4 special-ph 二遍（:398）：请求 ftr/无idx vs glyph ftr/'12' → 忽略 idx 命中，badMatch=true
  const t4 = matchPlaceholder([{ ph: { type: 'ftr', idx: '12' }, v: 'F12' }], 'ftr', undefined, false)
  eq('T4.shape', t4.shape, 'F12')
  eq('T4.badMatch', t4.badMatch, true)
  // T5 info 闸门（:416）：兜底 1 可达但 withInfo → undefined；关 info → last_body 命中
  const g5: G[] = [{ ph: { type: 'body', idx: '3' }, v: 'B3' }]
  const t5a = matchPlaceholder(g5, 'body', undefined, true, true)
  eq('T5a.shape', t5a.shape, undefined)
  eq('T5a.badMatch', t5a.badMatch, false)
  const t5b = matchPlaceholder(g5, 'body', undefined, true, false)
  eq('T5b.shape', t5b.shape, 'B3')
  eq('T5b.badMatch', t5b.badMatch, true)
  // T6 兜底 2 idx-only 优先于单一 body（:426 vs :458）：请求 obj/'2'，glyph title/'2' 先命中，badMatch=true
  const t6 = matchPlaceholder(
    [{ ph: { type: 'title', idx: '2' }, v: 'TT2' }, { ph: { type: 'body', idx: '5' }, v: 'BB5' }],
    'obj', '2', true,
  )
  eq('T6.shape', t6.shape, 'TT2')
  eq('T6.badMatch', t6.badMatch, true)
  // T7 兜底 3（:458）：请求 pic/'7'，唯一 body/'1' → last_body，badMatch=true
  const t7 = matchPlaceholder([{ ph: { type: 'body', idx: '1' }, v: 'B1' }], 'pic', '7', true)
  eq('T7.shape', t7.shape, 'B1')
  eq('T7.badMatch', t7.badMatch, true)
  // T8 全miss：请求 tbl/'9' vs title/'0' → undefined（idx '0'≠'9'，bodyCount=0）
  const t8 = matchPlaceholder([{ ph: { type: 'title', idx: '0' }, v: 'X' }], 'tbl', '9', true)
  eq('T8.shape', t8.shape, undefined)
  eq('T8.badMatch', t8.badMatch, false)
  // T9 精确无坏配基线 + 空表
  const t9 = matchPlaceholder([{ ph: { type: 'body', idx: '1' }, v: 'B' }], 'body', '1', false)
  eq('T9.shape', t9.shape, 'B')
  eq('T9.badMatch', t9.badMatch, false)
  eq('T10.empty', matchPlaceholder([], 'title', undefined, true).shape, undefined)
  R.waterfall = { t1, t2, t3, t4, t5a, t5b, t6, t7, t8, t9 }

  // ── 3. normAutofit 二分轨迹（合成线性 heightOf，逐档对 :5186-5218 推演） ──
  eq('A_SCALES 长度', A_SCALES.length, 16)
  eq('A_SCALES 哨兵末项', A_SCALES[15], 10000)
  eq('A_SCALES 顶档', A_SCALES[14], 95000)
  const lin = (H0: number) => (scale: number) => (H0 * scale) / 100000
  // E0 早退：H0=100 ≤ clipH=120 → 无需缩放
  const e0 = normAutofitScale(lin(100), 120)
  eq('E0.fontScale', e0.fontScale, undefined)
  eq('E0.lnSpcReduction', e0.lnSpcReduction, undefined)
  // E1 等号判溢出（:5203 `>=`）：H0=200/clipH=120。
  //   idx=7 低档 55000→110≤120 → 高档 60000→120>=120 溢出 → 命中 55000。
  //   （若实现误用 `>`，答案漂到 60000 —— 本断言即判别器）
  const traj1: number[] = []
  const e1 = normAutofitScale((s) => { traj1.push(s); return lin(200)(s) }, 120)
  eq('E1.fontScale', e1.fontScale, 55000)
  eq('E1.lnSpcReduction', e1.lnSpcReduction, 9000)
  R.E1tried = traj1
  // E2 右移链：H0=200/clipH=170 → 55000✓,60000✓(shift+4) → 75000✓,80000✓(shift+2) → 85000✓,90000 溢出 → 85000
  const e2 = normAutofitScale(lin(200), 170)
  eq('E2.fontScale', e2.fontScale, 85000)
  eq('E2.lnSpcReduction', e2.lnSpcReduction, 3000)
  // E3 左移链 + 等号：H0=1000/clipH=300 → 55000✗(-4) → 35000✗(-2) → 25000✓,30000→300>=300 溢出 → 25000
  const e3 = normAutofitScale(lin(1000), 300)
  eq('E3.fontScale', e3.fontScale, 25000)
  eq('E3.lnSpcReduction', e3.lnSpcReduction, 15000)
  // E4 下界锁档（:5218）：H0=1000/clipH=200 → …→ 25000✗(shift-1) → idx=0 → 锁 a[0]=25000（即使放不下）
  const e4 = normAutofitScale(lin(1000), 200)
  eq('E4.fontScale', e4.fontScale, 25000)
  // E5 步长耗尽（:5214）+ 哨兵永不选中：H0=1000/clipH=960 → 全链右移至 95000✓ → shift=0.5 break
  const e5 = normAutofitScale(lin(1000), 960)
  eq('E5.fontScale', e5.fontScale, 95000)
  eq('E5.lnSpcReduction', e5.lnSpcReduction, 1000)
  eq('E5.非哨兵', e5.fontScale !== 10000, true)
  // E6 标题下限（:5223）：E3 同参 + isTitlePh → 25000 抬 90000
  const e6 = normAutofitScale(lin(1000), 300, false, true)
  eq('E6.fontScale', e6.fontScale, 90000)
  eq('E6.lnSpcReduction', e6.lnSpcReduction, 2000)
  // lnSpcReductionOf 截断：25001 → 0.2*74999=14999.8 >>0 = 14999
  eq('lnReduce 截断', lnSpcReductionOf(25001), 14999)
  eq('lnReduce 100000', lnSpcReductionOf(100000), 0)
  R.autofit = { e0, e1, e2, e3, e4, e5, e6 }

  // ── 4. parseTimeValue（Timing.js:162-174） ──
  eq('ptv(undefined)', parseTimeValue(undefined), undefined)
  eq('ptv(indefinite)', parseTimeValue('indefinite'), Infinity)
  eq('ptv(500)', parseTimeValue('500'), 500)
  eq('ptv(abc)', parseTimeValue('abc'), undefined)
  eq('ptv(-100)', parseTimeValue('-100'), -100)
  eq('ptv(12.7) 截断', parseTimeValue('12.7'), 12)

  // ── 5. dur/delay 端到端（XEl + RNode 双侧同值） ──
  // 效果1：自身 @dur=1000 优先于子树 max(1,900)；delay=500（首个 stCondLst/cond）
  // 效果2：自身无 dur → 子树 max(1,500)=500；delay=indefinite → Infinity
  const SEQ = (id: number, presetID: number, cls: string, spid: number, extra: string, delay: string, beh: string): string =>
    `<p:par><p:cTn id="${id}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>` +
    `<p:par><p:cTn id="${id + 1}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
    `<p:par><p:cTn id="${id + 2}" presetID="${presetID}" presetClass="${cls}" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect"${extra}>` +
    `<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst>${beh}</p:childTnLst></p:cTn></p:par>` +
    `</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`
  const setBeh = (id: number, spid: number): string =>
    `<p:set><p:cBhvr><p:cTn id="${id}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>` +
    `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>` +
    `</p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`
  const fxBeh = (id: number, spid: number, filter: string, dur: number): string =>
    `<p:animEffect transition="in" filter="${filter}"><p:cBhvr><p:cTn id="${id}" dur="${dur}"/>` +
    `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr></p:animEffect>`
  const SLD =
    '<p:sld xmlns:p="http://p" xmlns:a="http://a">' +
    '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>' +
    '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>' +
    '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>' +
    SEQ(3, 10, 'entr', 2, ' dur="1000"', '500', setBeh(6, 2) + fxBeh(7, 2, 'fade', 900)) +
    SEQ(8, 22, 'entr', 3, '', 'indefinite', setBeh(11, 3) + fxBeh(12, 3, 'wipe(up)', 500)) +
    '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>' +
    '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>' +
    '</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing></p:sld>'

  const xroot = parseXml(SLD)
  const listX = parseTimingListX(xroot)
  eq('X 侧长度', listX.length, 2)
  const cmpItem = (name: string, got: AnimSeqItem | undefined, spid: number, preset: string, dur: number | undefined, delay: number | undefined) => {
    if (!got) { errs.push(`${name}: 缺失`); return }
    eq(`${name}.spid`, got.spid, spid)
    eq(`${name}.preset`, got.preset, preset)
    eq(`${name}.cls`, got.cls, 'entr')
    eq(`${name}.dur`, got.dur, dur)
    eq(`${name}.delay`, got.delay, delay)
  }
  cmpItem('X.e1', listX[0], 2, 'fade', 1000, 500)
  cmpItem('X.e2', listX[1], 3, 'wipe', 500, Infinity)
  R.animX = listX
  // 顺序锁：mainSeq 文档顺序 = 播放顺序（spid 2 先于 3）
  eq('X 顺序', listX.map((e) => e.spid).join(','), '2,3')
  // 兼容接口：spid→首个 preset
  const compat = parseTimingX(xroot)
  eq('compat.2', compat.get(2), 'fade')
  eq('compat.3', compat.get(3), 'wipe')
  // RNode 侧同值（写回路径复用同一口径）
  const listR = timingListOf(parseRaw(SLD))
  eq('R 侧长度', listR.length, 2)
  cmpItem('R.e1', listR[0], 2, 'fade', 1000, 500)
  cmpItem('R.e2', listR[1], 3, 'wipe', 500, Infinity)
  R.animR = listR

  // ── 6. 空白 Office 三件套端到端（生成器 → 内核 open+解析 → 首模型断言） ──
  // 新建文件对话框的二进制通道：blankOfficeBytes → writeFileBytes → openTab → 引擎 open。
  // 这里锁「生成字节可被内核打开」——对话框链路的内核侧验收。
  const { blankOfficeBytes } = await import('./core/blank')
  const { Engine } = await import('./core/worker/engine')
  const MIME_BLANK = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  } as const
  const blank: Record<string, unknown> = {}
  for (const kind of ['docx', 'xlsx', 'pptx'] as const) {
    try {
      const bytes = await blankOfficeBytes(kind)
      if (!(bytes.length > 200)) errs.push(`blank ${kind} 字节过小: ${bytes.length}`)
      const blob = new Blob([bytes], { type: MIME_BLANK[kind] })
      let xlsxDone: any = null
      let docxDone = false
      let evErr = ''
      const e = new Engine((ev: string, p: any) => {
        if (ev === 'xlsx:progress' && p.done) xlsxDone = p
        if (ev === 'docx:done') docxDone = !p?.error
        if (p?.error) evErr = String(p.error)
      })
      await e.open(blob, { name: `blank.${kind}` })
      if (kind === 'xlsx') {
        await e.call('xlsx.load', [0])
        for (let i = 0; i < 100 && !xlsxDone; i++) await new Promise((r) => setTimeout(r, 50))
        if (!xlsxDone) throw new Error('xlsx load 无终态')
        if (xlsxDone.error) throw new Error(String(xlsxDone.error))
        // 空 sheetData → 可读块（sheet 0 存在且解析完成）
        const blk: any = await e.call('xlsx.block', [0, 0, 1])
        blank.xlsx = { sheet: xlsxDone.sheet, rows: xlsxDone.rows, block: blk?.rows?.length ?? 0, bytes: bytes.length }
        eq('blank xlsx sheet', xlsxDone.sheet, 0)
      } else if (kind === 'pptx') {
        const s: any = await e.call('pptx.slide', [0])
        blank.pptx = { w: s?.w, h: s?.h, els: s?.els?.length, bytes: bytes.length }
        // blank 生成的 sldSz 9144000×6858000（4:3）→ 960×720px
        eq('blank pptx w', s?.w, 960)
        eq('blank pptx h', s?.h, 720)
      } else {
        await e.call('docx.start', [])
        for (let i = 0; i < 100 && !docxDone; i++) await new Promise((r) => setTimeout(r, 50))
        if (evErr) throw new Error(evErr)
        if (!docxDone) throw new Error('docx start 无终态')
        blank.docx = { done: true, bytes: bytes.length }
      }
    } catch (err) {
      errs.push(`blank ${kind} 端到端: ${err}`)
    }
  }
  R.blank = blank

  R.ok = errs.length === 0
  return R
}
let cached: Promise<Record<string, unknown>> | null = null
function result(): Promise<Record<string, unknown>> {
  if (!cached) cached = run().catch((e) => ({ ok: false, errors: [`threw: ${e}`] }))
  return cached
}

registerSmokeMode('x20', () => {
  ;(window as any).__smoke.x20 = { result }
  return () => h('div', { style: 'width:100%;height:100%' }, 'x20 P6 master-inherit/normAutofit/anim-timing probe')
})
