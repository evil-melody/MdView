/**
 * Word「1:1 遗留第五批」冒烟探针（mode=w5）。
 * 报障：布局 tab 的「纸张 / 纵向 / 横向 / 页边距 / 分栏」按钮点了没反应。
 *
 * 本探针提供两个真实 OOXML fixture：
 *  - w5.client：带完整 sectPr（pgSz/pgMar/cols）的普通文档 → 验证设置后渲染真的变、落盘真的写对；
 *  - w5.blankClient：**没有 sectPr** 的空文档 → 验证 setPage 能新建 sectPr（否则设置无处可落）。
 *
 * 断言覆盖（见 /tmp/mdview-eval/smoke-v40.cjs）：
 *  - 横向：页面渲染变宽变矮，落盘 w:pgSz@w/@h/@orient=landscape；
 *  - N 栏：正文按 N 栏排布（column-count），落盘 w:cols@w:num；
 *  - 页边距：正文区留白随之变化，落盘 w:pgMar@top/right/bottom/left；
 *  - save → 重开：纸宽/方向/页边距/栏数仍一致；
 *  - 失败可见：非法页面设置走错误回调，宿主能拿到消息（不再静默失败）。
 *
 * 注意：顶层不访问 window.__smoke；注册函数体内 kick 异步探针，稳定键 window.__smoke.w5 在 ready 时桥接。
 */
import { h, reactive } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import OfficeDocView from './components/OfficeDocView.vue'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

let kicked = false
const w5 = reactive({ ready: false, client: null as any, view: null as any, error: null as string | null })
/** 空文档（无 sectPr）：setPage 必须能自己建出 sectPr */
const blank = reactive({ ready: false, client: null as any })

/** 带 sectPr 的文档：Letter 纸（612×792pt = 12240×15840 twips）、1 英寸页边距（1440 twips） */
function w5Doc(withSect: boolean): Map<string, string> {
  const para = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
  let body = para('第 1 段 页面设置验证正文')
  body += para('第 2 段 纸张方向与页边距会改变排版')
  for (let i = 3; i <= 80; i++) body += para(`第 ${i} 段 用于验证分页与分栏的填充文本内容`)
  const sect =
    `<w:sectPr>` +
    `<w:pgSz w:w="12240" w:h="15840"/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>` +
    `</w:sectPr>`
  const doc =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}${withSect ? sect : ''}</w:body></w:document>`

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`
  return new Map<string, string>([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ['_rels/.rels', rels],
    ['word/document.xml', doc],
  ])
}

async function w5Check() {
  try {
    const { writeZip } = await import('./core/zipwrite')
    const { DocumentClient } = await import('./core/worker/client')
    const blob: Blob = await writeZip(w5Doc(true) as any)
    const client: any = await DocumentClient.open(blob, { worker: false, name: 'w5.docx' })
    w5.client = client
    w5.ready = true
    const smoke: any = (window as any).__smoke
    smoke.w5 = w5
    /** 页面设置失败的可见反馈（宿主收到 emit('error')） */
    smoke.w5Errors = [] as string[]

    // 空文档：无 sectPr。空文档没有视图帮它 start，这里自己启动内核
    const blankBlob: Blob = await writeZip(w5Doc(false) as any)
    blank.client = await DocumentClient.open(blankBlob, { worker: false, name: 'w5blank.docx' })
    await blank.client.call('docx.start')
    blank.ready = true
    smoke.w5Blank = blank

    /** save → 重开：落盘 document.xml + meta（纸宽/方向/页边距/栏数） */
    smoke.w5Kernel = async (which: 'main' | 'blank' = 'main') => {
      const c = which === 'blank' ? blank.client : client
      const saved: Blob = await c.call('save')
      const c2: any = await DocumentClient.open(saved, { worker: false, name: 'w5b.docx' })
      const blocks: any[] = []
      let meta: any = null
      c2.on('docx:blocks', (bs: any) => blocks.push(...bs))
      c2.on('docx:meta', (m: any) => { meta = m })
      await c2.call('docx.start')
      await new Promise((r) => setTimeout(r, 400))
      const xml = await ((await c2.call('part', 'word/document.xml')) as Blob).text()
      c2.destroy()
      return {
        xml,
        meta: meta
          ? {
              w: meta.page?.w, h: meta.page?.h,
              mt: meta.page?.mt, mr: meta.page?.mr, mb: meta.page?.mb, ml: meta.page?.ml,
              cols: meta.page?.cols ?? 1, colGap: meta.page?.colGap ?? null,
              titlePg: meta.titlePg,
            }
          : null,
        paraCount: blocks.filter((b: any) => b.t === 'p').length,
      }
    }
  } catch (e) {
    w5.error = String(e)
  }
}

registerSmokeMode('w5', function w5View() {
  if (!kicked) { kicked = true; void w5Check() }
  return () =>
    w5.ready && w5.client
      ? h('div', { style: 'height:100vh' }, [h(OfficeDocView, {
          ref: (el: any) => { w5.view = el },
          client: w5.client, editable: true,
          onError: (m: string) => { (window as any).__smoke?.w5Errors?.push(String(m)) },
        })])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
})
