/**
 * Word「1:1 遗留第九批」冒烟探针（mode=w9）— 段落级格式修订 w:pPrChange。
 *
 * 各场景用 ?case= 隔离（与 w6 同理，避免 undo / 重转换把 pc 冲掉）：
 *  - accept：修订开启 → 段落居中 → 落盘 <w:pPrChange>（且为 w:pPr 最后子元素）→ 接受后消失、居中保留；
 *  - reject：居中 → 拒绝 → 段位与落盘成对还原（旧 <w:pPr> 快照里没有 <w:jc>）；
 *  - zero  ：居中 → 左对齐 → 差集为空，文档中没有 pPrChange，视图回到初始；
 *  - multi ：居中 → 缩进 → 快照仍是初始格式（按 base 重算，不累加操作历史）；
 *  - indent：缩进 → 落盘 pPrChange 且旧快照没有 <w:ind>，新段落有 <w:ind>；
 *  - reopen：居中也拒绝都不做，save → 重开后仍有 pPrChange 与竖线（读回一致性）。
 *
 * 顶层不访问 window.__smoke；注册函数体内 kick 异步探针，稳定键 window.__smoke.w9。
 */
import { h, reactive } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import OfficeDocView from './components/OfficeDocView.vue'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const TEXT = 'Track this paragraph'

let kicked = false
const w9 = reactive({ ready: false, error: null as string | null, case: 'accept', client: null as any, view: null as any })

function w9Doc(): Map<string, string> {
  // the paragraph has no w:pPr at all: the old snapshot must be an empty <w:pPr/>
  const body =
    `<w:p><w:r><w:t xml:space="preserve">${TEXT}</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p>` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>`
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}</w:body></w:document>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`
  return new Map<string, string>([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ['_rels/.rels', rels],
    ['word/document.xml', doc],
  ])
}

async function w9Check() {
  try {
    const { writeZip } = await import('./core/zipwrite')
    const { DocumentClient } = await import('./core/worker/client')
    const which = new URLSearchParams(location.search).get('case')
    w9.case = which === 'reject' || which === 'zero' || which === 'multi' || which === 'indent' || which === 'reopen' ? which : 'accept'
    const blob: Blob = await writeZip(w9Doc() as any)
    const client: any = await DocumentClient.open(blob, { worker: false, name: 'w9.docx' })
    w9.client = client
    w9.ready = true
    const smoke: any = (window as any).__smoke
    smoke.w9 = w9
    smoke.w9Text = TEXT

    /** save → 重开：落盘 document.xml（含 pPrChange 与否），以及重开后正文段数 */
    smoke.w9Kernel = async () => {
      const saved: Blob = await client.call('save')
      const c2: any = await DocumentClient.open(saved, { worker: false, name: 'w9b.docx' })
      const blocks: any[] = []
      c2.on('docx:blocks', (bs: any) => blocks.push(...bs))
      await c2.call('docx.start')
      await new Promise((r) => setTimeout(r, 400))
      const xml = await ((await c2.call('part', 'word/document.xml')) as Blob).text()
      const first = blocks.find((b: any) => b.t === 'p')
      c2.destroy()
      return { xml, paraCount: blocks.filter((b: any) => b.t === 'p').length, hasPc: !!first?.pc }
    }
  } catch (e) {
    w9.error = String(e)
  }
}

registerSmokeMode('w9', function w9View() {
  if (!kicked) {
    kicked = true
    void w9Check()
  }
  return () =>
    w9.ready && w9.client
      ? h('div', { 'data-w9': w9.case, style: 'height:100vh' }, [
          h(OfficeDocView, {
            ref: (el: any) => {
              w9.view = el
            },
            client: w9.client,
            editable: true,
          }),
        ])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
})
