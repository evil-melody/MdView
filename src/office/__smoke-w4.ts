/**
 * Word「1:1 遗留第四批」冒烟探针（mode=w4）。
 * 真实 OOXML fixture：settings.xml 带 w:evenAndOddHeaders、sectPr 带 default/first/even 六套
 * header/footer 引用、w:titlePg、w:cols=2，正文含足够多段落产生多页。
 *
 * 断言覆盖（见 /tmp/mdview-eval/smoke-v36.cjs）：
 *  - even 奇偶页眉按页号渲染（首页 first / 偶数页 even / 其余 default）+ PAGE 字段按页展开；
 *  - 双击偶数页页眉编辑 even part，经 docx.hf 写回，save→重开一致；
 *  - 修订开启下剪切+粘贴（moveRange）产生 w:moveFrom/w:moveTo 成对标记，落盘含 delText/作者/date/name/
 *    range 标记，重开读回仍为移动修订，接受/拒绝成对处理；
 *  - 分栏栏命中几何（column-count/gap 算栏索引 + 命中栏高亮 + 段落定位/光标校正）。
 *
 * 注意：顶层不访问 window.__smoke；注册函数体内 kick 异步探针，稳定键 window.__smoke.w4 在 ready 时桥接。
 */
import { h, reactive } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import OfficeDocView from './components/OfficeDocView.vue'
import { columnGeometry, columnAtX, columnRect, paragraphInColumn } from './view/docx/cols'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships'
const HFNS = `xmlns:w="${W}" xmlns:r="${R}"`
const HDR_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml'
const FTR_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml'

let kicked = false
const w4 = reactive({ ready: false, client: null as any, view: null as any, error: null as string | null })

/** 六套页眉/页脚 + settings.xml + 双栏多页正文 */
function w4Doc(): Map<string, string> {
  const para = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
  let body = para('ABCDEFGHIJ 段落零 移动来源 ABCDE 用于修订测试')
  body += para('第二段 BBBBB 内容用于分页')
  body += para('目标段落二 0123456789 用于粘贴落点')
  body += para('第四段 DDDD 内容')
  body += para('第五段 EEEE 内容')
  body += para('MOVE2-SRC 原文五 用于拒绝修订测试')
  body += para('目标段落六 9876543210 落点')
  for (let i = 7; i < 420; i++) body += para(`正文第 ${i + 1} 段 分栏排版与奇偶页眉验证内容填充行`)
  const doc =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}` +
    `<w:sectPr>` +
    `<w:headerReference w:type="default" r:id="rIdHd"/><w:headerReference w:type="first" r:id="rIdHf"/><w:headerReference w:type="even" r:id="rIdHe"/>` +
    `<w:footerReference w:type="default" r:id="rIdFd"/><w:footerReference w:type="first" r:id="rIdFf"/><w:footerReference w:type="even" r:id="rIdFe"/>` +
    `<w:titlePg/>` +
    `<w:pgSz w:w="12240" w:h="15840"/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>` +
    `<w:cols w:num="2" w:space="360"/></w:sectPr>` +
    `</w:body></w:document>`

  const hdr = (text: string, page: boolean) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${HFNS}><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r>` +
    (page ? `<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>` : '') + `</w:p></w:hdr>`
  const ftr = (text: string, page: boolean) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${HFNS}><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r>` +
    (page ? `<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>` : '') + `</w:p></w:ftr>`

  const settings =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="${W}"><w:zoom w:percent="100"/><w:evenAndOddHeaders/></w:settings>`

  const overrides = [
    ['/word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'],
    ['/word/settings.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml'],
    ['/word/header1.xml', HDR_CT], ['/word/header2.xml', HDR_CT], ['/word/header3.xml', HDR_CT],
    ['/word/footer1.xml', FTR_CT], ['/word/footer2.xml', FTR_CT], ['/word/footer3.xml', FTR_CT],
  ].map(([p, c]) => `<Override PartName="${p}" ContentType="${c}"/>`).join('')

  const rels = [
    ['rIdHd', 'header', 'header1.xml'], ['rIdHf', 'header', 'header2.xml'], ['rIdHe', 'header', 'header3.xml'],
    ['rIdFd', 'footer', 'footer1.xml'], ['rIdFf', 'footer', 'footer2.xml'], ['rIdFe', 'footer', 'footer3.xml'],
    ['rIdS', 'settings', 'settings.xml'],
  ].map(([id, t, tgt]) => `<Relationship Id="${id}" Type="${R}/${t}" Target="${tgt}"/>`).join('')

  return new Map<string, string>([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}">${rels}</Relationships>`],
    ['word/document.xml', doc],
    ['word/settings.xml', settings],
    ['word/header1.xml', hdr('DEF-H 第 ', true)],
    ['word/header2.xml', hdr('FIRST-H 首页机密', false)],
    ['word/header3.xml', hdr('EVEN-H 偶 ', true)],
    ['word/footer1.xml', ftr('DEF-F ', true)],
    ['word/footer2.xml', ftr('FIRST-F 首页', false)],
    ['word/footer3.xml', ftr('EVEN-F 偶 ', true)],
  ])
}

async function w4Check() {
  try {
    const { writeZip } = await import('./core/zipwrite')
    const { DocumentClient } = await import('./core/worker/client')
    const blob: Blob = await writeZip(w4Doc() as any)
    const client: any = await DocumentClient.open(blob, { worker: false, name: 'w4.docx' })
    w4.client = client
    w4.ready = true
    const smoke: any = (window as any).__smoke
    smoke.w4 = w4

    // 纯几何栏命中（供 smoke 断言 column-count/gap 计算 + 段落定位）
    smoke.w4ColProbe = (x: number, y: number) => {
      const inner = document.querySelector('.de-page-inner.de-cols') as HTMLElement | null
      const page = inner?.closest('.de-page') as HTMLElement | null
      if (!inner || !page) return null
      const g = columnGeometry(inner, page)
      if (!g) return null
      const index = columnAtX(g, x)
      const rect = columnRect(g, index)
      const para = paragraphInColumn(inner, g, index, y)
      return { count: g.count, gap: g.gap, colWidth: g.colWidth, index, rect, paraPa: para?.pa ?? null }
    }

    // save → 重开：落盘 XML / settings / even part / meta / 块模型 tc 读回
    smoke.w4Kernel = async () => {
      const saved: Blob = await client.call('save')
      const c2: any = await DocumentClient.open(saved, { worker: false, name: 'w4b.docx' })
      const blocks: any[] = []
      let meta: any = null
      c2.on('docx:blocks', (bs: any) => blocks.push(...bs))
      c2.on('docx:meta', (m: any) => { meta = m })
      await c2.call('docx.start')
      await new Promise((r) => setTimeout(r, 400))
      const part = async (p: string) => await ((await c2.call('part', p)) as Blob).text()
      const xml = await part('word/document.xml')
      const settings = await part('word/settings.xml')
      let even = ''
      try { even = await part('word/header3.xml') } catch { /* 可能被重写到别的路径 */ }
      const marks: { k: string; name?: string; text?: string }[] = []
      for (const b of blocks) if (b.t === 'p') for (const r of b.runs) if (r.tc) marks.push({ k: r.tc.k, name: r.tc.name, text: r.text })
      c2.destroy()
      return {
        xml, settings, even,
        meta: meta ? {
          evenAndOddHeaders: meta.evenAndOddHeaders, titlePg: meta.titlePg,
          hasEvenHeader: !!meta.evenHeader, hasEvenFooter: !!meta.evenFooter,
          hasFirstHeader: !!meta.firstHeader, hasDefaultHeader: !!meta.header, cols: meta.page?.cols,
          evenHeaderText: (meta.evenHeader ?? []).map((p: any) => (p.runs ?? []).map((r: any) => r.t === 'text' ? r.text : r.t === 'field' ? '{P}' : '').join('')).join('|'),
        } : null,
        marks,
      }
    }
  } catch (e) {
    w4.error = String(e)
  }
}

registerSmokeMode('w4', function w4View() {
  if (!kicked) { kicked = true; void w4Check() }
  return () =>
    w4.ready && w4.client
      ? h('div', { style: 'height:100vh' }, [h(OfficeDocView, {
          ref: (el: any) => { w4.view = el },
          client: w4.client, editable: true,
          onError: (m: string) => { (window as any).__smoke?.errors?.push('w4:' + m) },
        })])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
})
