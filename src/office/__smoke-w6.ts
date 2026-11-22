/**
 * Word「1:1 遗留第六批」冒烟探针（mode=w6）— run 级字符格式修订 w:rPrChange。
 *
 * 三种场景用 ?case=accept|reject|zero 分别加载，互不污染（避免 undo 走 want 重转换把 fc 冲掉）：
 *  - accept：修订开启 → 加粗 → 落盘含 <w:rPrChange ...><w:rPr>（旧快照无 <w:b>）→ 接受后 rPrChange 消失、加粗保留；
 *  - reject：加粗 → 拒绝 → 加粗撤销、旧格式还原（s 与 d 成对还原）；
 *  - zero  ：加粗 → 取消加粗 → 差集为空，文档中不存在 rPrChange，视图回到初始；
 *  - multi ：加粗 → 改字号 → 取消加粗 → 快照应是「仅字号变化」，不累加操作历史。
 *
 * 顶层不访问 window.__smoke；注册函数体内 kick 异步探针，稳定键 window.__smoke.w6 在 ready 时桥接。
 */
import { h, reactive } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import OfficeDocView from './components/OfficeDocView.vue'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const TEXT = 'Track me'

let kicked = false
const w6 = reactive({ ready: false, error: null as string | null, case: 'accept', client: null as any, view: null as any })

function w6Doc(): Map<string, string> {
  // original rPr: font + size, but deliberately NO bold — the old snapshot must stay that way
  const run = (text: string) => `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`
  const body =
    `<w:p>${run(TEXT)}</w:p>` +
    `<w:p>${run('Second paragraph')}</w:p>` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>`
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}</w:body></w:document>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`
  return new Map<string, string>([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ['_rels/.rels', rels],
    ['word/document.xml', doc],
  ])
}

async function w6Check() {
  try {
    const { writeZip } = await import('./core/zipwrite')
    const { DocumentClient } = await import('./core/worker/client')
    const which = new URLSearchParams(location.search).get('case')
    w6.case = which === 'reject' || which === 'zero' || which === 'multi' ? which : 'accept'
    const blob: Blob = await writeZip(w6Doc() as any)
    const client: any = await DocumentClient.open(blob, { worker: false, name: 'w6.docx' })
    w6.client = client
    w6.ready = true
    const smoke: any = (window as any).__smoke
    smoke.w6 = w6
    smoke.w6Text = TEXT

    /** save → 重开：落盘 document.xml（含 rPrChange 与否），以及重开后正文段数 */
    smoke.w6Kernel = async () => {
      const saved: Blob = await client.call('save')
      const c2: any = await DocumentClient.open(saved, { worker: false, name: 'w6b.docx' })
      const blocks: any[] = []
      c2.on('docx:blocks', (bs: any) => blocks.push(...bs))
      await c2.call('docx.start')
      await new Promise((r) => setTimeout(r, 400))
      const xml = await ((await c2.call('part', 'word/document.xml')) as Blob).text()
      c2.destroy()
      return { xml, paraCount: blocks.filter((b: any) => b.t === 'p').length }
    }
  } catch (e) {
    w6.error = String(e)
  }
}

registerSmokeMode('w6', function w6View() {
  if (!kicked) {
    kicked = true
    void w6Check()
  }
  return () =>
    w6.ready && w6.client
      ? h('div', { 'data-w6': w6.case, style: 'height:100vh' }, [
          h(OfficeDocView, {
            ref: (el: any) => {
              w6.view = el
            },
            client: w6.client,
            editable: true,
          }),
        ])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
})
