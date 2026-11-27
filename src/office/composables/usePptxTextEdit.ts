/**
 * PPTX 形状富文本编辑编排（修复⑥）：把 PptxEditor 的生命周期与画布编辑层 DOM 接起来。
 * 视图持有本对象：双击 → start(i) 生成编辑层 HTML；画布 ref 上报编辑元素 → mount 挂 RichInput；
 * 每次 replace 重渲染编辑层后消费 pendingSel 还光标；blur / ⌘Enter / 切页 → stop() 提交，
 * 内核走 pptx.setText 把逐 run 格式写进真实 OOXML（a:rPr / a:pPr）。
 * 格式命令（字体 / 段落）经 editor 施加，400ms 防抖自动 commit，视图不另设提交机制。
 */
import { nextTick, ref, shallowRef, type Ref } from 'vue'
import type { DocumentClient, SlideModel } from '../client'
import { plen } from '../view/edit/rich'
import { editHtmlFromBody, editHtmlFromParas } from '../view/pptx/editrender'
import { PptxEditor, type PptxFormat } from '../view/pptx/PptxEditor'

export interface PptxTextEditOpts {
  /** 当前页索引 / 当前页模型（start 取 els[i].text 作编辑种子） */
  currentIndex: () => number
  currentModel: () => SlideModel | null
  /** debounced commit 回来后的模型落地（视图 adopt + 通知变更） */
  onCommitted: (slide: number, model: SlideModel) => void
  onError: (msg: string) => void
}

export interface PptxTextEdit {
  editor: PptxEditor
  /** 正在编辑的形状 els 索引（-1 = 未编辑），画布编辑层 v-if 依据 */
  editIdx: Ref<number>
  /** 编辑层 HTML（进编辑初帧 + 每次 replace 后重建），null = 未编辑 */
  editLayer: Ref<{ i: number; html: string } | null>
  /** 光标处格式态（工具条 / 探针回读；null = 未编辑或无选区） */
  format: Ref<PptxFormat | null>
  start: (i: number) => boolean
  stop: () => void
  cancel: () => void
  /** 画布上报编辑层 DOM（挂载一次时 focus=true）：挂 RichInput 并把光标放到文末 */
  mount: (el: HTMLElement | null) => void
}

export function usePptxTextEdit(client: DocumentClient, opts: PptxTextEditOpts): PptxTextEdit {
  const editor = new PptxEditor(client)
  const editIdx = ref(-1)
  const editLayer = ref<{ i: number; html: string } | null>(null)
  const format = shallowRef<PptxFormat | null>(null)
  let domRoot: HTMLElement | null = null

  /** v-html 重建会丢 DOM 选区：内核把目标选区留在 pendingSel，渲染帧后消费 */
  function consumePending() {
    const sel = editor.pendingSel
    if (sel && editor.input.restore(sel)) editor.pendingSel = null
  }

  editor.onChange = () => {
    if (editIdx.value < 0) return
    editLayer.value = { i: editIdx.value, html: editHtmlFromParas(editor.paras) }
    void nextTick(consumePending)
  }
  editor.onCommitted = (slide, model) => {
    if (slide === opts.currentIndex()) opts.onCommitted(slide, model)
  }
  editor.onState = (s) => (format.value = s)

  function clear() {
    editIdx.value = -1
    editLayer.value = null
    format.value = null
    domRoot = null
  }

  /** 双击进入：形状须是带 sid 的文本形状（PptxEditor 按 sid 写回 a:rPr / a:pPr） */
  function start(i: number): boolean {
    const model = opts.currentModel()
    const el = model?.els[i]
    if (!el || el.t !== 'shape' || !el.text) return false
    if (editIdx.value === i) return true
    if (editIdx.value >= 0) stop()
    if (el.sid === undefined) {
      opts.onError('该形状没有可编辑的文本标识（sid），无法编辑文字格式')
      return false
    }
    editor.begin(opts.currentIndex(), el.sid, el.text)
    editIdx.value = i
    editLayer.value = { i, html: editHtmlFromBody(el.text) }
    return true
  }

  /** 提交并退出（blur / ⌘Enter / 切页 / 删形状）：end() 内含未提交改动的立即 commit */
  function stop() {
    if (editIdx.value < 0) return
    clear()
    editor.end()
  }

  /** 丢弃退出（Esc） */
  function cancel() {
    if (editIdx.value < 0) return
    clear()
    editor.discard()
  }

  /** 画布 ref 上报编辑层 DOM：同一元素只挂一次；首次附加时把光标放到文末 */
  function mount(el: HTMLElement | null) {
    if (domRoot === el) return
    domRoot = el
    if (!el || editIdx.value < 0) return
    editor.input.attach(el)
    const last = editor.paras.length - 1
    const end = { pa: String(Math.max(0, last)), o: plen(editor.paras[last]?.runs ?? []) }
    editor.input.restore({ a: end, f: end })
  }

  return { editor, editIdx, editLayer, format, start, stop, cancel, mount }
}
