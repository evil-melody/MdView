/** PDF 编辑器冒烟入口：只挂 PdfEditor，暴露实例给 Playwright 调 save() */
import { createApp, h, ref } from 'vue'
import PdfEditor from '../components/PdfEditor.vue'
import { PdfSource } from '../utils/pdfEdit'
import './smoke.css'

declare global {
  interface Window {
    __PDF_EDITOR__?: { value: { save: () => Promise<Uint8Array | null> } | null }
    __PDF_SCANNED__?: boolean
    __PDF_DIRTY__?: boolean
    __PDF_ERROR__?: string
    __PDF_FONT_CHECK__?: () => Promise<{
      boxes: Record<string, unknown>[]
      faces: string[]
      scanned: boolean
    }>
  }
}

async function main() {
  const q = new URLSearchParams(location.search)
  const name = q.get('file') === 'scanned' ? 'scanned.pdf'
    : q.get('file') === 'embedded' ? 'embedded.pdf' : 'sample.pdf'
  // 二次校验时由 Playwright 注入保存后的字节，跳过 fetch
  if (!window.__PDF_BYTES__) {
    window.__PDF_BYTES__ = new Uint8Array(await (await fetch(`/${name}`)).arrayBuffer())
  }
  window.__PDF_SCANNED__ = false
  window.__PDF_DIRTY__ = false
  window.__PDF_FONT_CHECK__ = async () => {
    const s = new PdfSource()
    const canvas = document.createElement('canvas')
    await s.load(new Uint8Array(window.__PDF_BYTES__!))
    await s.render(1, 1, canvas)
    const hits = await s.textBoxes(1)
    const faces: string[] = []
    try { for (const f of document.fonts) faces.push(f.family) } catch { /* 无 FontFaceSet */ }
    const scanned = s.scanned
    await s.destroy()
    return { boxes: hits.slice(0, 8).map((x) => ({ ...x.box })), faces, scanned }
  }

  const ed = ref<{ save: () => Promise<Uint8Array | null> } | null>(null)
  window.__PDF_EDITOR__ = ed
  const App = {
    render: () => h(PdfEditor, {
      ref: ed,
      path: name,
      editable: q.get('mode') !== 'readonly',
      active: true,
      onChange: () => { window.__PDF_DIRTY__ = true },
      onReadonly: (v: boolean) => { window.__PDF_SCANNED__ = v },
      onError: (m: string) => { window.__PDF_ERROR__ = m }
    })
  }
  createApp(App).mount('#app')
}

void main()
