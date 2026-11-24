/**
 * x17 探针（任务 #73 遗留两项实测裁决，?mode=x17）：
 *
 *  A. 偏移往返恒等（审计发现 6 的实证）：段中 / 段尾 / 连续 w:br 与 CJK 段，
 *     对 o ∈ [0, plen] 全量跑 domFromPos → posFromDom，断言恒等。
 *     静态推演认为编辑态段尾 br 有 data-empty 锚点、往返应恒等 —— 与审计的
 *     「漂移一字符」结论冲突，故实测裁决：漂移表为空 → 发现 6 关闭（不可复现）；
 *     非空 → 按表定位 domFromPos/posFromDom 的口径缺口再修。
 *  B. 修 1 回归锁：跨行边界点（两个行 div 之间）→ posFromDom 必须给「点后首 span
 *     起点」（br 之后 = 续行首），不是「点前末 span 末端」（break 偏移 = 打字跳回上行尾）。
 *  C. 5-B IME 冻结门：compositionstart 后插入伪 preedit 文本节点，再用 docx:meta
 *     重推触发 version++ → repaginate 落地。冻结生效 → v-html 不重建 → preedit
 *     存活、行结构不变；compositionend 提交 → 模型写入 + DOM 重建 + preedit 消失。
 *
 * 顶层只注册 mode；结果挂 window.__smoke.x17。stub client 口径同 docdrag
 * （docx.edit 回空 EditResult，applyResult 安全消费）。
 */
import { h } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import OfficeDocView from './components/OfficeDocView.vue'
import { domFromPos, posFromDom } from './view/edit/input'
import type { PageSetup } from './core/docx/types'

const T = (text: string) => ({ t: 'text' as const, text, s: {} })
const P = (text: string) => ({ t: 'p' as const, pid: 0, ps: {}, runs: [T(text)] })

// 段形态：pa 0 段中 br / pa 1 段尾 br / pa 2 CJK / pa 3 连续 br
const SHAPES: { pa: string; text: string }[] = [
  { pa: '0', text: 'ab\ncd' },
  { pa: '1', text: 'xy\n' },
  { pa: '2', text: '你好世界' },
  { pa: '3', text: 'a\n\nb' },
]

const page: PageSetup = { w: 612, h: 792, mt: 72, mr: 72, mb: 72, ml: 72, header: 36, footer: 36 }
const META = { page, styles: [], final: true, sectKind: 'nextPage', font: 'Carlito', sz: 11 }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let cached: Promise<Record<string, unknown>> | null = null
function result(): Promise<Record<string, unknown>> {
  if (!cached) cached = run()
  return cached
}

async function run(): Promise<Record<string, unknown>> {
  const R: Record<string, unknown> = { ok: false, errors: [] as string[] }
  const errs = R.errors as string[]
  const root = await waitForRoot()
  if (!root) {
    errs.push('root 未挂载')
    return R
  }

  // ── A. 全偏移往返恒等 ──
  const drift: string[] = []
  for (const { pa, text } of SHAPES) {
    const pel = root.querySelector<HTMLElement>(`[data-pa="${pa}"]`)
    if (!pel) { errs.push(`A 缺段 pa=${pa}`); continue }
    const plen = [...text].length // 纯 text 段：码点数 = 模型 plen（'\n' 占位）
    for (let o = 0; o <= plen; o++) {
      const dn = domFromPos(root, { pa, o })
      if (!dn) { drift.push(`${pa}@${o}:dom=null`); continue }
      const back = posFromDom(root, dn[0], dn[1])
      if (!back || back.o !== o) drift.push(`${pa}@${o}→${back?.o ?? 'null'}`)
    }
  }
  R.drift = drift
  if (drift.length) errs.push(`A 往返漂移: ${drift.join(' ')}`)

  // ── B. 修 1 回归锁：跨行边界 = br 之后（点后首 span 起点） ──
  const pel0 = root.querySelector<HTMLElement>('[data-pa="0"]')
  if (!pel0) errs.push('B 缺 pa=0 段')
  else {
    const back = posFromDom(root, pel0, 1) // 行 div 之间的边界点
    if (!back || back.o !== 3) errs.push(`B 跨行边界应 o=3（br 后），got ${back?.o ?? 'null'}`)
    R.bBoundary = back?.o ?? null
  }

  // ── C. 5-B IME 冻结门 ──
  const pel1 = root.querySelector<HTMLElement>('[data-pa="1"]')
  const span1 = pel1?.querySelector<HTMLElement>('[data-o="0"]')
  const lineTxt = span1?.firstChild
  if (!pel1 || !span1 || !lineTxt) {
    errs.push('C 缺 pa=1 行 span')
    return finish(R)
  }

  // 选区钉在 pa1 o=2（'xy' 之后、br 之前）
  const sel = window.getSelection()!
  const rng = document.createRange()
  rng.setStart(lineTxt, 2)
  rng.collapse(true)
  sel.removeAllRanges()
  sel.addRange(rng)

  // compositionstart：冻结门开（监听在 rootEl，冒泡捕获）
  span1.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, composed: true, data: '' }))
  // 伪 preedit：IME 直接在 DOM 插文本节点（不进模型）
  const pre = document.createTextNode('你')
  span1.insertBefore(pre, lineTxt.nextSibling)
  const linesBefore = pel1.querySelectorAll('.de-line').length
  const htmlBefore = pel1.innerHTML

  // 触发 version++ → repaginate 在途；等它落地（字体已热，600ms 足够）
  ;(window as any).__smoke.x17Bump()
  await sleep(600)

  const preAlive = document.contains(pre)
  const linesAfter = pel1.querySelectorAll('.de-line').length
  R.freezeKept = preAlive && linesAfter === linesBefore && pel1.innerHTML === htmlBefore
  if (!preAlive) errs.push('C preedit 被重建抹掉（冻结门失效）')
  if (linesAfter !== linesBefore) errs.push(`C 组合期行结构变了 ${linesBefore}→${linesAfter}`)

  // compositionend：提交 + 解锁补交（'xy' + '你好' + '\n' → 首行 'xy你好'）
  span1.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, composed: true, data: '你好' }))
  let committed = false
  for (let i = 0; i < 40 && !committed; i++) {
    await sleep(100)
    const pelNow = root.querySelector<HTMLElement>('[data-pa="1"]')
    const first = pelNow?.querySelector<HTMLElement>('.de-line')
    committed = !!first && first.textContent === 'xy你好' && !document.contains(pre)
  }
  R.commitOk = committed
  if (!committed) errs.push('C compositionend 未提交/未重建')

  return finish(R)
}

function finish(R: Record<string, unknown>) {
  R.ok = (R.errors as string[]).length === 0
  return R
}

async function waitForRoot(): Promise<HTMLElement | null> {
  for (let i = 0; i < 100; i++) {
    const root = document.querySelector<HTMLElement>('.ov-doc-root')
    // 等首屏分页落地：任一段出现行 div 即为 frag 就绪
    if (root && root.querySelector('[data-pa="0"] .de-line')) return root
    await sleep(100)
  }
  return document.querySelector<HTMLElement>('.ov-doc-root')
}

registerSmokeMode('x17', () => {
  ;(window as any).__smoke.x17 = { result }
  const handlers: Record<string, (p: unknown) => void> = {}
  const client = {
    call: async (m: string) => (m === 'docx.edit' ? { blocks: {}, markers: {} } : null),
    on: (ev: string, fn: (p: unknown) => void) => {
      handlers[ev] = fn
      return () => {}
    },
  } as never
  // 首屏：meta → blocks → done（OfficeDocView 的 blocks handler 是 push 语义）
  ;(window as any).__smoke.x17Load = () => {
    handlers['docx:meta']?.(META)
    handlers['docx:blocks']?.(SHAPES.map((s) => P(s.text)))
    handlers['docx:done']?.({})
  }
  // 组合期触发重排：追加一段（blocks handler 是 push 语义）—— 整页 html 必然
  // 变化 → v-html 重建 → preedit 脱离文档。若只推同内容 meta，页字符串逐字节
  // 不变、v-html 不重置 innerHTML，冻结门摘掉也照样绿 —— 断言无判别力（假绿）。
  // 追加段在 A/B 组断言之后，不影响已跑的 pa 0~3 偏移表。
  ;(window as any).__smoke.x17Bump = () => {
    handlers['docx:blocks']?.([{ t: 'p', pid: 9, ps: {}, runs: [T('z')] }])
    handlers['docx:done']?.({})
  }
  return () =>
    h('div', { style: 'height:100vh' }, [
      h(OfficeDocView, { client, editable: true, onVnodeMounted: () => (window as any).__smoke.x17Load() }),
    ])
})
