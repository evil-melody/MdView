/**
 * x33 探针（P18 Word 域批量修复回归门，?mode=x33）：
 *
 *  A 节 「修订」开关落盘（旧为纯内存假开关）：开 → settings.xml 出 w:trackChanges；
 *     关 → 消失。撤销链还原在 word-fixer 内核已记 undo，此处锁最终写盘真值。
 *  B 节 insertLink 取消 ≠ 清除链接：弹窗取消 → 返回「已取消」，包内无 w:hyperlink。
 *  C 节 页脚字段追加不覆盖：{PAGE} → {NUMPAGES} 同行共存 → 重复插页码回提示串。
 *  D 节 clearFormat 九键全清：sz/color 直格式剥掉（旧漏 sz/font 且 s/d 不一致）。
 *  E 节 无上下文命令回提示串（旧静默无反应）：表外 tableOp / 无图裁剪 / 无图替代文字。
 *  F 节 格式刷段落快照：copyFormat 记 painterPara（旧只刷字符）。
 *  G 节 表格单元格段首 Backspace：光标移上一格、不写坏地址、history 不增长。
 *  H 节 剪贴板三命令接线：折叠选区 copy/cut 回「请先选中内容」，paste 已注册。
 *
 * 生产同路：DocumentClient 默认 Worker 通道 + OfficeDocView 真实挂载。
 */
import { h, nextTick, reactive } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import { DocumentClient } from './client'
import OfficeDocView from './components/OfficeDocView.vue'
import { writeZip } from './core/zipwrite'
import { ZipArchive } from './core/zip'
import { BlobSource } from './core/source'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

/** 两段正文 + 一张 2×2 表（块序：0=p0 1=p1 2=tbl；格地址 bi.ri.ci.pi） */
function docXml(): string {
  const cell = (pa: string, t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`
  const row = (a: string, b: string) => `<w:tr>${cell('', a)}${cell('', b)}</w:tr>`
  return `${DECL}<w:document xmlns:w="${W}" xmlns:r="${RNS}"><w:body>` +
    `<w:p><w:r><w:t>Alpha paragraph one</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t>Beta paragraph two</w:t></w:r></w:p>` +
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>` +
    row('A1', 'B1') + row('A2', 'B2') + `</w:tbl>` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>` +
    `</w:body></w:document>`
}

async function buildDocx(): Promise<Blob> {
  const parts = new Map<string, string>([
    ['[Content_Types].xml', `${DECL}<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ['_rels/.rels', `${DECL}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', docXml()]
  ])
  return writeZip(parts as any)
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const errs: string[] = []
const ok = (name: string, cond: unknown, extra = '') => {
  if (!cond) errs.push(`${name}${extra ? ' → ' + extra : ''}`)
  return !!cond
}
const detail: Record<string, unknown> = {}
const st = reactive<{ client: any; ready: boolean }>({ client: null, ready: false })

/** save → 包内匹配 part 拼接文本（落盘真值） */
async function savedPart(re: RegExp): Promise<string> {
  const saved: Blob = await st.client.call('save')
  const zip = await ZipArchive.open(new BlobSource(saved))
  const hits = zip.list().filter((e) => re.test(e.name))
  const out: string[] = []
  for (const e of hits) out.push(await zip.text(e.name))
  return out.join('\n')
}

async function run(): Promise<Record<string, unknown>> {
  detail.stage = 'boot'
  const blob = await buildDocx()
  const client: any = await DocumentClient.open(blob, { name: 'x33.docx' })
  st.client = client
  st.ready = true
  await nextTick()
  await wait(400)
  const view: any = (window as any).__smoke.x33View
  const editor: any = view?.editor
  if (!view?.commands || !editor) { errs.push('W1 视图/内核不可达'); client.destroy(); st.ready = false; return { ok: false, errors: errs, detail } }
  const paras = () => document.querySelectorAll('.ov-doc-root [data-pa]').length
  for (let i = 0; i < 200 && paras() < 4; i++) await wait(100)
  ok('W0 段落已渲染', paras() >= 4, `n=${paras()}`)

  // ===== A 节 修订落盘 =====
  detail.stage = 'A'
  view.commands.tracking(true)
  await wait(500)
  let settings = await savedPart(/word\/settings\.xml$/)
  detail.settingsOn = settings.slice(0, 200)
  ok('A1 开修订 → settings.xml 写 w:trackChanges', settings.includes('<w:trackChanges'), settings.slice(0, 120) || '(无 settings part)')
  ok('A2 按钮态同步', view.bar?.tracking === true)
  view.commands.tracking(false)
  await wait(500)
  settings = await savedPart(/word\/settings\.xml$/)
  ok('A3 关修订 → 元素消失', !settings.includes('<w:trackChanges'), settings.slice(0, 120))
  // 重开回读（meta.trackChanges → bar.tracking 静默链路，视图 onMounted 已跑过一次开态？否——上面已关。
  // 锁「开态重开回读」需二次挂载，成本高；此处以 A1/A3 落盘真值为准，回读链在 applyHF 有守卫）

  // ===== B 节 insertLink 取消 =====
  detail.stage = 'B'
  editor.input.selectAll()
  const linkP = view.commands.insertLink()
  await wait(400)
  ok('B1 链接弹窗出现', !!document.querySelector('.op-prompt-overlay'), '无 .op-prompt')
  const cancelBtn = document.querySelector<HTMLButtonElement>('.op-prompt-btn')
  cancelBtn?.click()
  const linkR = await linkP
  detail.linkCancel = linkR
  ok('② B2 取消返回「已取消」', linkR === '已取消', JSON.stringify(linkR))
  const docAfterLink = await savedPart(/word\/document\.xml$/)
  ok('B3 包内无 hyperlink（取消没抹链接）', !docAfterLink.includes('w:hyperlink'), docAfterLink.slice(0, 100))

  // ===== C 节 页脚字段追加 =====
  detail.stage = 'C'
  const r1 = await view.commands.pageNumber()
  await wait(500)
  let foot = await savedPart(/word\/footer\d*\.xml$/)
  detail.footer1 = foot.slice(0, 300)
  ok('C1 页码字段落盘', foot.includes('fldSimple') && /PAGE/.test(foot), foot.slice(0, 150) || '(无 footer part)')
  ok('C2 首次插入不报错', typeof r1 !== 'string' || !r1.includes('已有'), JSON.stringify(r1))
  await view.commands.pageCount()
  await wait(500)
  foot = await savedPart(/word\/footer\d*\.xml$/)
  ok('③ C3 {PAGE} 与 {NUMPAGES} 共存', foot.includes('PAGE') && foot.includes('NUMPAGES'), foot.slice(0, 200))
  const dup = await view.commands.pageNumber()
  detail.dupPage = dup
  ok('C4 重复插页码 → 提示不覆盖', typeof dup === 'string' && dup.includes('已有'), JSON.stringify(dup))

  // ===== D 节 clearFormat 全清 =====
  detail.stage = 'D'
  editor.input.selectAll()
  view.commands.setSize(28)
  await wait(300)
  editor.input.selectAll()
  view.commands.setColor('#ff0000')
  await wait(300)
  let doc = await savedPart(/word\/document\.xml$/)
  ok('D1 前置：sz/color 直格式已写入', doc.includes('w:val="56"') && /FF0000/i.test(doc), doc.slice(0, 150))
  editor.input.selectAll()
  view.commands.clearFormat()
  await wait(400)
  doc = await savedPart(/word\/document\.xml$/)
  detail.docAfterClear = doc.slice(0, 200)
  ok('④ D2 clearFormat 后 w:sz 消失', !doc.includes('w:val="56"'), '仍有 56')
  ok('D3 clearFormat 后 w:color 消失', !/FF0000/i.test(doc), '仍有 FF0000')

  // ===== E 节 无上下文提示 =====
  detail.stage = 'E'
  editor.input.selectAll() // 全文选区（跨表外段落）→ 表格命令应拒
  const tOp = view.commands.tableOp('rowAbove')
  detail.tableOpMsg = tOp
  ok('⑤ E1 表外 tableOp → 提示串', tOp === '请将光标置于表格内', JSON.stringify(tOp))
  const crop = view.commands.toggleCrop()
  ok('E2 无图裁剪 → 提示串', crop === '请先选中图片', JSON.stringify(crop))
  const altP = view.commands.setAltText()
  await wait(300)
  ok('E3 无图替代文字不弹输入框', !document.querySelector('.op-prompt-overlay'), '弹窗了')
  const alt = await altP
  detail.altMsg = alt
  ok('E4 替代文字提示串', alt === '请先选中图片', JSON.stringify(alt))

  // ===== F 节 格式刷段落快照 =====
  detail.stage = 'F'
  editor.input.selectAll()
  view.commands.setAlign('center')
  await wait(300)
  view.commands.copyFormat()
  await wait(200)
  detail.painterPara = editor.painterPara ?? null
  ok('⑥ F1 copyFormat 记段落快照（align=center）', editor.painterPara?.align === 'center', JSON.stringify(editor.painterPara))
  ok('F2 按钮点亮', view.bar?.painter === true)
  window.getSelection()?.removeAllRanges()
  const ap = editor.applyPainter()
  ok('F3 无选区 applyPainter=false 不崩', ap === false, JSON.stringify(ap))

  // ===== G 节 单元格段首 Backspace =====
  detail.stage = 'G'
  const b1 = document.querySelector('[data-pa="2.0.1.0"]')
  ok('G0 B1 格段落渲染', !!b1, '无 data-pa=2.0.1.0')
  if (b1) {
    // 合成 dblclick / keydown 在 headless 里不触发浏览器默认行为（原生选词、Backspace 派生的
    // beforeinput 都不产生）；本架构删除通路是 beforeinput（input.ts onBeforeInput），不是 keydown。
    // 生产同路写法：restore 把光标钉在段首（同步写 lastSel 与 DOM 选区），再派浏览器同款
    // deleteContentBackward InputEvent。
    editor.input.restore({ a: { pa: '2.0.1.0', o: 0 }, f: { pa: '2.0.1.0', o: 0 } })
    await wait(100)
    const h0 = editor.history.length
    const selBefore = editor.input.lastSel?.f?.pa ?? ''
    detail.gSelBefore = selBefore
    ok('G0b 光标已钉在格段首', selBefore === '2.0.1.0' && editor.input.lastSel?.f?.o === 0, `${selBefore}@${editor.input.lastSel?.f?.o}`)
    b1.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }))
    await wait(400)
    const h1 = editor.history.length
    const selAfter = editor.input.lastSel?.f?.pa ?? ''
    detail.gSelAfter = selAfter
    detail.gHist = [h0, h1]
    ok('⑦ G1 空格 Backspace 不写坏历史（纯移光标）', h1 === h0, `hist=${h0}→${h1}`)
    ok('G2 光标移到上一格', selAfter.startsWith('2.0.0'), `${selBefore} → ${selAfter}`)
  }

  // ===== H 节 剪贴板命令 =====
  detail.stage = 'H'
  ok('H1 paste 已注册', typeof view.commands.paste === 'function')
  const cp = await view.commands.copy() // G 后光标折叠在格内
  detail.copyMsg = cp
  ok('⑧ H2 折叠选区 copy → 请先选中内容', cp === '请先选中内容', JSON.stringify(cp))
  const ct = await view.commands.cut()
  ok('H3 折叠选区 cut → 请先选中内容', ct === '请先选中内容', JSON.stringify(ct))

  await wait(400) // 在途 RPC 结算（x29/x30 教训）
  client.destroy()
  st.ready = false
  return { ok: errs.length === 0, errors: errs, detail }
}

let cached: Promise<Record<string, unknown>> | null = null
function result(): Promise<Record<string, unknown>> {
  if (!cached) cached = Promise.race([
    run().catch((e) => ({ ok: false, errors: [`threw: ${String(e)} @ ${String(detail.stage ?? '')}`], detail })),
    wait(240000).then(() => ({ ok: false, errors: [`TIMEOUT @ ${String(detail.stage ?? '')}`], detail }))
  ])
  return cached
}

registerSmokeMode('x33', () => {
  ;(window as any).__smoke.x33 = { result }
  return () => {
    if (st.ready && st.client)
      return h('div', { style: 'height:100vh' }, [
        h(OfficeDocView, { ref: (el: any) => ((window as any).__smoke.x33View = el), client: st.client, editable: true })
      ])
    return h('div', { style: 'width:100%;height:100%' }, 'x33 Word 域语义回归门')
  }
})
