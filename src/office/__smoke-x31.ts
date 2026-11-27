/**
 * x31 门：多页签常驻实例不得抢键盘（?mode=x31）
 *
 * 生产真实场景：PreviewPane 对每个访问过的 Office 页签常驻一个 OfficeEngineHost，
 * 切页签只切 display。隐藏页签的 Excel 图片层若残留选中态，其 window capture
 * keydown 监听会先于当前页签截获 Backspace/Delete，表现为「图选上了却删不掉」。
 * 本门用两个 OfficeSheetDrawingLayer（隐藏实例先挂载）复现该事件顺序。
 */
import { h, nextTick, reactive } from 'vue'
import { registerSmokeMode } from './smoke-modes'
import OfficeSheetDrawingLayer from './components/OfficeSheetDrawingLayer.vue'
import { Axis } from './view/xlsx/axis'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9cAAAAASUVORK5CYII='
const drawing = (id: number) => [{ id, rid: 'rId1', media: 'xl/media/image1.png', ext: 'png', x: 10, y: 10, w: 120, h: 80, src: PNG }]
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const errs: string[] = []
const ok = (name: string, cond: unknown, extra = '') => {
  if (!cond) errs.push(`${name}${extra ? ' → ' + extra : ''}`)
  return !!cond
}
const detail: Record<string, unknown> = {}
const st = reactive<{ ghostOps: unknown[]; liveOps: unknown[]; done: boolean }>({ ghostOps: [], liveOps: [], done: false })

const ptr = (el: Element, type: string) => {
  const b = el.getBoundingClientRect()
  el.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0,
    clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, view: window
  }))
}
const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, view: window }))

async function run(): Promise<Record<string, unknown>> {
  await wait(200)
  const ghostImg = document.querySelector('.x31-ghost .ov-drawing')
  const liveImg = document.querySelector('.x31-live .ov-drawing')
  ok('G0 隐藏/可见两实例图片在位', !!ghostImg && !!liveImg, `ghost=${!!ghostImg} live=${!!liveImg}`)
  if (!ghostImg || !liveImg) return { ok: false, errors: errs, detail }

  // 隐藏页签先选中图片（生产里由切页签前的操作残留），再让当前页签选中自己的图片。
  ptr(ghostImg, 'pointerdown')
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, view: window }))
  await nextTick()
  ok('G1 隐藏实例保留选中态', !!document.querySelector('.x31-ghost .ov-drawing-sel'))

  ptr(liveImg, 'pointerdown')
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, view: window }))
  await nextTick()
  ok('G2 当前实例选中态', !!document.querySelector('.x31-live .ov-drawing-sel'))

  key('Backspace')
  await wait(200)
  const ghostDel = st.ghostOps.some((o: any) => o?.kind === 'delete')
  const liveDel = st.liveOps.some((o: any) => o?.kind === 'delete')
  detail.ghostOps = st.ghostOps
  detail.liveOps = st.liveOps
  ok('G3 Backspace 只删当前实例图片', liveDel && !ghostDel, `ghost=${ghostDel} live=${liveDel}`)
  ok('G4 当前实例选中态已清除', !document.querySelector('.x31-live .ov-drawing-sel'))
  return { ok: errs.length === 0, errors: errs, detail }
}

let cached: Promise<Record<string, unknown>> | null = null
function result(): Promise<Record<string, unknown>> {
  if (!cached) cached = Promise.race([
    run().catch((e) => ({ ok: false, errors: [`threw: ${String(e)}`], detail })),
    wait(20000).then(() => ({ ok: false, errors: ['TIMEOUT'], detail }))
  ])
  return cached
}

const axis = () => new Axis(100)
registerSmokeMode('x31', () => {
  ;(window as any).__smoke.x31 = { result }
  return () => h('div', { style: 'padding:24px' }, [
    // 隐藏实例先挂载 → window capture 监听注册在前（与生产打开多个页签的顺序一致）
    h('div', { class: 'x31-ghost', style: 'display:none' }, [
      h(OfficeSheetDrawingLayer, {
        drawings: drawing(1), zoom: 1, editable: true, originX: 0, originY: 0, colAxis: axis(), rowAxis: axis(),
        onOp: (op: unknown) => st.ghostOps.push(op)
      })
    ]),
    h('div', { class: 'x31-live' }, [
      h(OfficeSheetDrawingLayer, {
        drawings: drawing(2), zoom: 1, editable: true, originX: 0, originY: 0, colAxis: axis(), rowAxis: axis(),
        onOp: (op: unknown) => st.liveOps.push(op)
      })
    ])
  ])
})
