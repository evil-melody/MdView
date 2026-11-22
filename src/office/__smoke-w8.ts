/**
 * Word 第八批冒烟探针（mode=w8）— 表格工具栏 15 按钮 + 图片粘贴/插入落盘。
 *
 * 单纯 mount 真实 OfficeToolbar + OfficeDocView，Playwright 用真实鼠标点 ribbon 按钮
 * （会令 contenteditable 失焦），逐个断言按钮可观察效果；另跑真实剪贴板 PNG 粘贴到
 * 表格单元格，save→重开核对 word/media/* + document.xml.rels + w:drawing。
 *
 * 顶层不碰 window.__smoke：所有写桥接都在 w8Check() 异步函数里完成。
 */
import { h, reactive, ref, computed } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import OfficeDocView from './components/OfficeDocView.vue'
import OfficeToolbar from './components/OfficeToolbar.vue'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'

/** 1×1 红色 PNG */
export const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+8QAAAABJRU5ErkJggg=='

let kicked = false
const viewRef = ref<any>(null)
const commands = computed(() => viewRef.value?.commands ?? undefined)
const barProxy = reactive<any>({})

const w8 = reactive({ ready: false, error: null as string | null, view: null as any, client: null as any })

function w8Doc(): Map<string, string | Uint8Array> {
  const cell = (t: string, extra = '') =>
    `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/>${extra}</w:tcPr><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`
  const row = (r: number) => `<w:tr><w:trPr><w:trHeight w:val="400" w:hRule="atLeast"/></w:trPr>${cell('A' + r)}${cell('B' + r)}${cell('C' + r)}</w:tr>`
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join('')
  const doc =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}" xmlns:r="${RNS}"><w:body>` +
    `<w:p><w:r><w:t>lead paragraph</w:t></w:r></w:p>` +
    `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>` +
    `<w:tr><w:trPr><w:trHeight w:val="400" w:hRule="atLeast"/></w:trPr>` +
    `${cell('H1')}${cell('H2')}${cell('H3')}</w:tr>` +
    `<w:tr><w:trPr><w:trHeight w:val="400" w:hRule="atLeast"/></w:trPr>` +
    `${cell('D1')}${cell('D2')}${cell('D3')}</w:tr>` +
    `</w:tbl>` +
    `<w:p><w:r><w:t>tail paragraph</w:t></w:r></w:p>` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>` +
    `</w:body></w:document>`
  return new Map<string, string | Uint8Array>([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', doc],
  ])
}

/** 表格模型快照（供 Playwright 逐项断言） */
function tableSnap(ed: any, bi: number) {
  const t = ed?.st?.blocks?.[bi]
  if (!t || t.t !== 'tbl') return null
  const runsText = (p: any) => (p?.runs ?? []).map((r: any) => (typeof r.t === 'string' ? (r.text ?? '') : '')).join('')
  return {
    rows: t.rows.length,
    cols: t.cols.length,
    colWidths: t.cols.slice(),
    cellsPerRow: t.rows.map((r: any) => r.cells.length),
    colSpans: t.rows.map((r: any) => r.cells.map((c: any) => c.colSpan ?? 1)),
    rowSpans: t.rows.map((r: any) => r.cells.map((c: any) => c.rowSpan ?? 1)),
    shd: t.rows.map((r: any) => r.cells.map((c: any) => c.shd ?? null)),
    vAlign: t.rows.map((r: any) => r.cells.map((c: any) => c.vAlign ?? null)),
    borders: t.rows.map((r: any) => r.cells.map((c: any) => ({ ...(c.borders ?? {}) }))),
    texts: t.rows.map((r: any) => r.cells.map((c: any) => (c.blocks ?? []).map(runsText).join(''))),
  }
}

async function w8Check() {
  const S: any = (window as any).__smoke
  try {
    const { writeZip } = await import('./core/zipwrite')
    const { DocumentClient } = await import('./core/worker/client')
    const blob: Blob = await writeZip(w8Doc() as any)
    const client: any = await DocumentClient.open(blob, { worker: false, name: 'w8.docx' })
    w8.client = client
    S.w8 = w8
    S.w8api = {

      /** 表格块下标 */
      bi: () => {
        const idx = (viewRef.value?.editor?.st?.blocks ?? []).findIndex((b: any) => b.t === 'tbl')
        return idx
      },

      /** block 类型序列 + 表格数量 */
      blocks: () => ({
        types: (viewRef.value?.editor?.st?.blocks ?? []).map((b: any) => b.t),
        tableCount: (viewRef.value?.editor?.st?.blocks ?? []).filter((b: any) => b.t === 'tbl').length,
      }),

      /** 把 caret 放到表格单元格内（真实 DOM selection，随后点击 ribbon 会令其失焦） */
      selectCell: (ri: number, ci: number) => {
        const ed = viewRef.value?.editor
        const bi = S.w8api.bi()
        if (!ed || bi < 0) return { ok: false, reason: 'no editor/table' }
        const pa = `${bi}.${ri}.${ci}.0`
        const sel = { a: { pa, o: 0 }, f: { pa, o: 0 } }
        const ok = ed.input.restore(sel, true)
        return { ok, pa, sel: ed.input.sel(), domSel: S.w8api.selDom() }
      },

      /** 直接读 editor.input.sel()（返回模型选择） */
      sel: () => viewRef.value?.editor?.input?.sel() ?? null,

      /** 读真实 DOM selection 文本（诊断） */
      selDom: () => {
        const s = document.getSelection()
        return { anchor: s?.anchorNode?.textContent ?? '', focus: s?.focusNode?.textContent ?? '', collapsed: s?.isCollapsed }
      },

      /** 记录 beforeinput / paste 事件诊断 */
      installDiag: () => {
        const root = document.querySelector('.ov-doc-root')
        if (!root) return { ok: false }
        const logs: any[] = []
        S.w8Diag = logs
        root.addEventListener('beforeinput', (e: any) => {
          logs.push({ type: 'beforeinput', inputType: e.inputType, files: e.dataTransfer?.files?.length ?? -1, items: e.dataTransfer?.items?.length ?? -1, kinds: e.dataTransfer ? Array.from(e.dataTransfer.items).map((i: any) => i.kind) : [] })
        })
        root.addEventListener('paste', (e: any) => {
          logs.push({ type: 'paste', files: e.clipboardData?.files?.length ?? -1, items: e.clipboardData?.items?.length ?? -1, kinds: e.clipboardData ? Array.from(e.clipboardData.items).map((i: any) => i.kind) : [] })
        })
        return { ok: true }
      },

      /** 表格快照 */
      snap: () => tableSnap(viewRef.value?.editor, S.w8api.bi()),

      /** 通过真实 commands 调用插入图片（菜单「插入→图片」同一链路） */
      insertImageCmd: async (b64: string) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'image/png' })
        await viewRef.value?.commands?.insertImage?.(blob)
      },

      /** 通过真实 commands 调用替换图片（需先选中图片） */
      replaceImageCmd: async (b64: string) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'image/png' })
        await viewRef.value?.commands?.replaceImage?.(blob)
      },

      /** 统计正文里图片 inline（target / rid） */
      imgInlines: () => {
        const out: any[] = []
        for (const b of viewRef.value?.editor?.st?.blocks ?? []) {
          if (b.t !== 'p') continue
          for (const r of b.runs ?? []) if (r.t === 'img') out.push({ target: r.target, rid: r.rid, w: r.w, h: r.h })
          for (const c of (b as any).cells ?? []) void c
        }
        // 表格单元格内的图片
        for (const b of viewRef.value?.editor?.st?.blocks ?? []) {
          if (b.t !== 'tbl') continue
          for (const row of b.rows) for (const c of row.cells) for (const cb of c.blocks ?? []) for (const r of cb.runs ?? []) if (r.t === 'img') out.push({ target: r.target, rid: r.rid, w: r.w, h: r.h, inCell: true })
        }
        return out
      },

      /** save → 重开 → 读 XML 与落盘 media，验证图片真的写进 OOXML */
      save: async () => {
        const saved: Blob = await client.call('save')
        const c2: any = await DocumentClient.open(saved, { worker: false, name: 'w8b.docx' })
        const text = async (name: string) => {
          try { return await ((await c2.call('part', name)) as Blob).text() } catch { return null }
        }
        const xml = (await text('word/document.xml')) ?? ''
        const rels = (await text('word/_rels/document.xml.rels')) ?? ''
        const media: { name: string; size: number }[] = []
        for (const name of ['word/media/image1.png', 'word/media/image2.png', 'word/media/image3.png']) {
          try {
            const b: Blob = await c2.call('part', name)
            media.push({ name, size: b.size })
          } catch { /* absent */ }
        }
        // 重开后的块模型（验证图片与表格可见）
        const blocks: any[] = []
        c2.on('docx:blocks', (bs: any) => blocks.push(...bs))
        await c2.call('docx.start')
        const imgCount = blocks.reduce((n, b: any) => n + (b.t === 'p' ? (b.runs ?? []).filter((r: any) => r.t === 'img').length : b.t === 'tbl' ? b.rows.reduce((m: number, row: any) => m + row.cells.reduce((k: number, c: any) => k + (c.blocks ?? []).reduce((z: number, p: any) => z + (p.runs ?? []).filter((r: any) => r.t === 'img').length, 0), 0), 0) : 0), 0)
        c2.destroy()
        return {
          xml,
          rels,
          media,
          imgCount,
          hasDrawing: /<w:drawing>/.test(xml),
          hasBlip: /<a:blip/.test(xml),
          relImage: /Type="[^"]*\/image"/.test(rels),
          gridSpan: (xml.match(/<w:gridSpan/g) ?? []).length,
          shd: (xml.match(/<w:shd/g) ?? []).length,
          vAlign: (xml.match(/<w:vAlign/g) ?? []).length,
          drawingInCell: /<w:tc>[\s\S]*?<w:drawing>[\s\S]*?<\/w:tc>/.test(xml),
        }
      },
    }
    S.w8.ready = true
    w8.ready = true
  } catch (e) {
    w8.error = String(e)
    S.w8 = w8
  }
}

registerSmokeMode('w8', function w8View() {
  if (!kicked) {
    kicked = true
    void w8Check()
  }
  return () =>
    w8.ready && w8.client
      ? h('div', { style: 'height:100vh;display:flex;flex-direction:column' }, [
          h(OfficeToolbar, { kind: 'docx', editable: true, commands: commands.value, bar: barProxy }),
          h('div', { style: 'flex:1 1 auto;min-height:0' }, [
            h(OfficeDocView, {
              ref: (el: any) => {
                viewRef.value = el
                w8.view = el
              },
              client: w8.client,
              editable: true,
            }),
          ]),
        ])
      : h('div', { style: 'height:100vh;display:grid;place-items:center;color:#888' }, 'preparing…')
})
