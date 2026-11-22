/**
 * Sequence diagrams (Mermaid sequenceDiagram, PlantUML): participants across, messages down, with activations,
 * notes, fragments (loop / alt / opt / par…), dividers and delays.
 */
import type { Rendered } from './graph'
import { DiagramError, lineHeight, measure, Svg, textWidth, THEME } from './svg'

const r2 = (v: number) => Math.round(v * 100) / 100

export type PKind = 'participant' | 'actor' | 'database' | 'boundary' | 'control' | 'entity' | 'collections' | 'queue'

export interface Participant {
  id: string
  label: string
  kind: PKind
  fill?: string
}

export type MsgHead = 'filled' | 'open' | 'cross' | 'half' | 'none'

export type SeqEvent =
  | { t: 'msg'; from: string; to: string; text: string; dashed: boolean; head: MsgHead; both?: boolean; activate?: boolean; deactivate?: boolean }
  | { t: 'act'; who: string; on: boolean }
  | { t: 'note'; pos: 'left' | 'right' | 'over'; who: string[]; text: string }
  | { t: 'block'; kind: string; label: string; fill?: string }
  | { t: 'else'; label: string }
  | { t: 'end' }
  | { t: 'divider'; text: string }
  | { t: 'delay'; text: string }
  | { t: 'space'; h: number }
  | { t: 'destroy'; who: string }

export interface Sequence {
  title?: string
  participants: Participant[]
  events: SeqEvent[]
  autonumber?: boolean
  /** participants drawn again at the bottom (default true) */
  footer?: boolean
}

export class SequenceBuilder {
  readonly s: Sequence = { participants: [], events: [] }
  private ids = new Map<string, Participant>()

  participant(id: string, patch: Partial<Participant> = {}): Participant {
    let p = this.ids.get(id)
    if (!p) {
      p = { id, label: id, kind: 'participant' }
      this.ids.set(id, p)
      this.s.participants.push(p)
    }
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (p as unknown as Record<string, unknown>)[k] = v
    return p
  }

  has(id: string) {
    return this.ids.has(id)
  }

  push(e: SeqEvent) {
    if (e.t === 'msg') {
      this.participant(e.from)
      this.participant(e.to)
    } else if (e.t === 'note') e.who.forEach((w) => this.participant(w))
    else if (e.t === 'act' || e.t === 'destroy') this.participant(e.who)
    this.s.events.push(e)
  }
}

const SIZE = 14
const MSG = 13
const MLH = lineHeight(MSG)
const MARGIN = 16
const lines = (s: string) => (s ? s.split('\n') : [])

interface PBox {
  w: number
  h: number
  text: string[]
}

function pbox(p: Participant): PBox {
  const text = lines(p.label)
  const t = measure(text, SIZE)
  switch (p.kind) {
    case 'actor':
      return { w: Math.max(44, t.w + 8), h: 44 + t.h, text }
    case 'boundary':
    case 'control':
    case 'entity':
      return { w: Math.max(44, t.w + 8), h: 34 + t.h, text }
    case 'database':
      return { w: Math.max(64, t.w + 24), h: t.h + 30, text }
    default:
      return { w: Math.max(64, t.w + 24), h: t.h + 18, text }
  }
}

function drawParticipant(svg: Svg, p: Participant, b: PBox, cx: number, y: number) {
  const fill = p.fill ?? THEME.fill
  const st = { fill, stroke: THEME.stroke, sw: 1.3 }
  const ink = { fill: 'none', stroke: THEME.dark, sw: 1.5 }
  const textBelow = (top: number) => svg.text(cx, top + (b.text.length * lineHeight(SIZE)) / 2, b.text, { anchor: 'middle' })
  const x = cx - b.w / 2
  switch (p.kind) {
    case 'actor':
      svg.circle(cx, y + 8, 7, { ...ink, fill })
      svg.line(cx, y + 15, cx, y + 29, ink).line(cx - 11, y + 20, cx + 11, y + 20, ink)
      svg.line(cx, y + 29, cx - 9, y + 41, ink).line(cx, y + 29, cx + 9, y + 41, ink)
      textBelow(y + 44)
      return
    case 'boundary':
      svg.circle(cx + 4, y + 14, 12, st).line(cx - 14, y + 4, cx - 14, y + 24, ink).line(cx - 14, y + 14, cx - 8, y + 14, ink)
      textBelow(y + 32)
      return
    case 'control':
      svg.circle(cx, y + 15, 12, st).poly(
        [
          [cx + 4, y - 1],
          [cx - 2, y + 3],
          [cx + 4, y + 7],
        ],
        ink,
        false,
      )
      textBelow(y + 32)
      return
    case 'entity':
      svg.circle(cx, y + 13, 12, st).line(cx - 12, y + 27, cx + 12, y + 27, ink)
      textBelow(y + 32)
      return
    case 'database': {
      const ry = 6
      const w = b.w
      const h = b.h
      svg.path(`M${r2(x)} ${r2(y + ry)} A${r2(w / 2)} ${ry} 0 0 1 ${r2(x + w)} ${r2(y + ry)} L${r2(x + w)} ${r2(y + h - ry)} A${r2(w / 2)} ${ry} 0 0 1 ${r2(x)} ${r2(y + h - ry)} Z`, st)
      svg.path(`M${r2(x)} ${r2(y + ry)} A${r2(w / 2)} ${ry} 0 0 0 ${r2(x + w)} ${r2(y + ry)}`, { ...st, fill: 'none' })
      svg.text(cx, y + h / 2 + ry / 2, b.text, { anchor: 'middle' })
      return
    }
    case 'collections':
      svg.rect(x + 4, y - 4, b.w, b.h, st, 3)
      svg.rect(x, y, b.w, b.h, st, 3)
      break
    case 'queue':
      svg.rect(x, y, b.w, b.h, st, b.h / 2)
      break
    default:
      svg.rect(x, y, b.w, b.h, st, 3)
  }
  svg.text(cx, y + b.h / 2, b.text, { anchor: 'middle' })
}

function arrowHead(svg: Svg, head: MsgHead, x: number, y: number, dir: number) {
  const col = THEME.line
  switch (head) {
    case 'filled':
      svg.poly(
        [
          [x, y],
          [x - dir * 10, y - 4.5],
          [x - dir * 10, y + 4.5],
        ],
        { fill: col, stroke: col, sw: 1 },
      )
      break
    case 'open':
      svg.poly(
        [
          [x - dir * 10, y - 5],
          [x, y],
          [x - dir * 10, y + 5],
        ],
        { stroke: col, sw: 1.4 },
        false,
      )
      break
    case 'half':
      svg.poly(
        [
          [x - dir * 10, y - 5],
          [x, y],
        ],
        { stroke: col, sw: 1.4 },
        false,
      )
      break
    case 'cross':
      svg.line(x - 5 - dir * 4, y - 5, x + 5 - dir * 4, y + 5, { stroke: col, sw: 1.6 }).line(x - 5 - dir * 4, y + 5, x + 5 - dir * 4, y - 5, { stroke: col, sw: 1.6 })
      break
  }
}

interface Frame {
  kind: string
  label: string
  fill?: string
  y0: number
  y1: number
  lo: number
  hi: number
  depth: number
  elses: { y: number; label: string }[]
}

export function renderSequence(s: Sequence): Rendered {
  const ps = s.participants
  if (!ps.length) throw new DiagramError('The sequence diagram has no participants')
  if (ps.length > 300 || s.events.length > 8000) throw new DiagramError('The sequence diagram is too large to draw')
  const idx = new Map(ps.map((p, k) => [p.id, k]))
  const boxes = ps.map(pbox)
  const n = ps.length
  // ---- horizontal: gaps between neighbouring lifelines
  const gap = new Array(n).fill(0)
  for (let k = 1; k < n; k++) gap[k] = (boxes[k - 1].w + boxes[k].w) / 2 + 28
  let leftExtra = 0
  let rightExtra = 0
  const need = (a: number, b: number, v: number) => {
    if (a > b) [a, b] = [b, a]
    if (a === b) return
    let have = 0
    for (let k = a + 1; k <= b; k++) have += gap[k]
    if (have >= v) return
    const add = (v - have) / (b - a)
    for (let k = a + 1; k <= b; k++) gap[k] += add
  }
  const num = (k: number) => (s.autonumber ? textWidth(String(k), 10) + 14 : 0)
  let count = 0
  for (const e of s.events) {
    if (e.t === 'msg') {
      count++
      const a = idx.get(e.from)!
      const b = idx.get(e.to)!
      const tw = Math.max(0, ...lines(e.text).map((l) => textWidth(l, MSG))) + num(count)
      if (a === b) {
        if (a + 1 < n) need(a, a + 1, boxes[a + 1].w / 2 + tw + 44)
        else rightExtra = Math.max(rightExtra, tw + 44 - boxes[a].w / 2)
      } else need(a, b, tw + 30)
    } else if (e.t === 'note') {
      const tw = measure(lines(e.text), MSG).w + 20
      const ks = e.who.map((w) => idx.get(w)!)
      const a = Math.min(...ks)
      const b = Math.max(...ks)
      if (e.pos === 'over') {
        if (a !== b) need(a, b, tw - 50)
      } else if (e.pos === 'left') {
        if (a > 0) need(a - 1, a, tw + 16 + boxes[a - 1].w / 2)
        else leftExtra = Math.max(leftExtra, tw + 16 - boxes[0].w / 2)
      } else if (b + 1 < n) need(b, b + 1, tw + 16 + boxes[b + 1].w / 2)
      else rightExtra = Math.max(rightExtra, tw + 16 - boxes[b].w / 2)
    }
  }
  const cx: number[] = []
  // frames add a margin on the outer lifelines
  const deepest = (() => {
    let d = 0
    let m = 0
    for (const e of s.events) {
      if (e.t === 'block') m = Math.max(m, ++d)
      else if (e.t === 'end') d = Math.max(0, d - 1)
    }
    return m
  })()
  const frameRoom = deepest ? 12 + deepest * 8 : 0
  cx[0] = MARGIN + Math.max(boxes[0].w / 2, leftExtra + boxes[0].w / 2, frameRoom + 10)
  for (let k = 1; k < n; k++) cx[k] = cx[k - 1] + gap[k]
  let width = cx[n - 1] + Math.max(boxes[n - 1].w / 2, rightExtra + boxes[n - 1].w / 2, frameRoom + 10) + MARGIN

  // ---- vertical
  const titleH = s.title ? 34 : 0
  const top = MARGIN + titleH
  const headH = Math.max(...boxes.map((b) => b.h))
  let y = top + headH + 18
  const svgBack = new Svg()
  const svgMid = new Svg()
  const svgFront = new Svg()
  const active: number[][] = ps.map(() => [])
  const bars: { k: number; y0: number; y1: number; depth: number }[] = []
  const frames: Frame[] = []
  const open: Frame[] = []
  const ended = new Map<number, number>()
  const touch = (lo: number, hi: number) => {
    for (const f of open) {
      f.lo = Math.min(f.lo, lo)
      f.hi = Math.max(f.hi, hi)
    }
  }
  const actX = (k: number, side: number) => {
    const d = active[k].length
    return cx[k] + (d ? side * 5 + (d - 1) * 5 : 0)
  }
  const activate = (k: number, at: number) => active[k].push(at)
  const deactivate = (k: number, at: number) => {
    const y0 = active[k].pop()
    if (y0 !== undefined) bars.push({ k, y0, y1: at, depth: active[k].length })
  }
  count = 0
  for (const e of s.events) {
    switch (e.t) {
      case 'msg': {
        count++
        const a = idx.get(e.from)!
        const b = idx.get(e.to)!
        const text = lines(e.text)
        const th = text.length * MLH
        const paint = { stroke: THEME.line, sw: 1.4, dash: e.dashed ? '6 4' : undefined }
        const nw = num(count)
        if (a === b) {
          y += th + 4
          const x0 = actX(a, 1)
          const loopW = 34
          svgMid.poly(
            [
              [x0, y],
              [x0 + loopW, y],
              [x0 + loopW, y + 20],
              [x0 + 2, y + 20],
            ],
            paint,
            false,
          )
          arrowHead(svgMid, e.head, x0, y + 20, -1)
          svgFront.text(x0 + 6 + nw, y - 4 - th / 2, text, { size: MSG })
          if (s.autonumber) numberBadge(svgFront, x0, y, count)
          touch(cx[a] - 10, x0 + loopW + 6 + nw + Math.max(...text.map((l) => textWidth(l, MSG))))
          y += 20
          if (e.activate) activate(b, y)
          if (e.deactivate) deactivate(a, y)
          y += 14
          break
        }
        y += th + 6
        const dir = b > a ? 1 : -1
        if (e.activate) activate(b, y)
        const x1 = actX(a, dir)
        const x2 = actX(b, -dir)
        svgMid.line(x1, y, x2, y, paint)
        arrowHead(svgMid, e.head, x2, y, dir)
        if (e.both) arrowHead(svgMid, e.head, x1, y, -dir)
        svgFront.text((x1 + x2) / 2 + (dir * nw) / 2, y - 5 - th / 2, text, { anchor: 'middle', size: MSG })
        if (s.autonumber) numberBadge(svgFront, x1, y, count)
        if (e.deactivate) deactivate(a, y)
        touch(Math.min(cx[a], cx[b]), Math.max(cx[a], cx[b]))
        y += 14
        break
      }
      case 'act': {
        const k = idx.get(e.who)!
        if (e.on) activate(k, y - 6)
        else deactivate(k, y - 6)
        break
      }
      case 'note': {
        const ks = e.who.map((w) => idx.get(w)!)
        const a = Math.min(...ks)
        const b = Math.max(...ks)
        const text = lines(e.text)
        const t = measure(text, MSG)
        const w = Math.max(t.w + 20, e.pos === 'over' && a !== b ? cx[b] - cx[a] + 50 : 0, 60)
        const h = t.h + 12
        y += 6
        const x = e.pos === 'left' ? cx[a] - 12 - w : e.pos === 'right' ? cx[b] + 12 : (cx[a] + cx[b]) / 2 - w / 2
        svgFront.poly(
          [
            [x, y],
            [x + w - 8, y],
            [x + w, y + 8],
            [x + w, y + h],
            [x, y + h],
          ],
          { fill: THEME.note, stroke: THEME.noteStroke, sw: 1 },
        )
        svgFront.text(x + 10, y + h / 2, text, { size: MSG })
        touch(x, x + w)
        y += h + 8
        break
      }
      case 'block': {
        y += 10
        const f: Frame = { kind: e.kind, label: e.label, fill: e.fill, y0: y, y1: y, lo: Infinity, hi: -Infinity, depth: open.length, elses: [] }
        frames.push(f)
        open.push(f)
        y += e.kind === 'rect' ? 8 : 26
        break
      }
      case 'else': {
        const f = open[open.length - 1]
        if (!f) break
        y += 8
        f.elses.push({ y, label: e.label })
        y += 24
        break
      }
      case 'end': {
        const f = open.pop()
        if (!f) break
        y += 10
        f.y1 = y
        y += 6
        break
      }
      case 'divider': {
        y += 16
        const t = measure(lines(e.text), MSG)
        svgFront.line(MARGIN / 2, y - 2, width - MARGIN / 2, y - 2, { stroke: THEME.muted, sw: 1 }).line(MARGIN / 2, y + 2, width - MARGIN / 2, y + 2, { stroke: THEME.muted, sw: 1 })
        if (e.text) {
          svgFront.rect(width / 2 - t.w / 2 - 10, y - t.h / 2 - 4, t.w + 20, t.h + 8, { fill: '#ffffff', stroke: THEME.muted, sw: 1 }, 3)
          svgFront.text(width / 2, y, lines(e.text), { anchor: 'middle', size: MSG, bold: true })
        }
        y += 22
        break
      }
      case 'delay':
        y += 14
        if (e.text) svgFront.text(width / 2, y, lines(e.text), { anchor: 'middle', size: MSG, italic: true, color: THEME.muted })
        y += 18
        break
      case 'space':
        y += e.h
        break
      case 'destroy': {
        const k = idx.get(e.who)!
        y += 6
        svgFront.line(cx[k] - 8, y - 8, cx[k] + 8, y + 8, { stroke: '#c0392b', sw: 2 }).line(cx[k] - 8, y + 8, cx[k] + 8, y - 8, { stroke: '#c0392b', sw: 2 })
        ended.set(k, y)
        y += 14
        break
      }
    }
  }
  for (let k = 0; k < n; k++) while (active[k].length) deactivate(k, y)
  for (const f of open.splice(0)) f.y1 = y
  y += 14
  const footer = s.footer !== false
  const height = y + (footer ? headH : 0) + MARGIN

  // frames: widths from what they contain (or the whole width when empty)
  for (const f of frames) {
    const pad = 12 + (deepest - f.depth) * 8
    if (f.lo > f.hi) {
      f.lo = cx[0]
      f.hi = cx[n - 1]
    }
    const x0 = Math.max(4, f.lo - pad)
    // wide enough for its title and branch labels (the picture grows if need be)
    const tab = textWidth(f.kind, 12, true) + 16
    const titles = [f.label ? tab + 8 + textWidth(`[${f.label}]`, 12) : tab, ...f.elses.map((e) => 10 + textWidth(`[${e.label}]`, 12))]
    const x1 = Math.max(Math.min(width - 4, f.hi + pad), f.kind === 'rect' ? 0 : x0 + Math.max(...titles) + 10)
    width = Math.max(width, x1 + 4)
    if (f.kind === 'rect') {
      svgBack.rect(x0, f.y0, x1 - x0, f.y1 - f.y0, { fill: f.fill ?? 'rgba(200, 210, 230, 0.35)' }, 2)
      continue
    }
    const frameP = { stroke: THEME.muted, sw: 1.2 }
    svgMid.rect(x0, f.y0, x1 - x0, f.y1 - f.y0, frameP)
    const tw = tab
    svgMid.poly(
      [
        [x0, f.y0],
        [x0 + tw, f.y0],
        [x0 + tw, f.y0 + 12],
        [x0 + tw - 7, f.y0 + 19],
        [x0, f.y0 + 19],
      ],
      { fill: '#eef0f4', stroke: THEME.muted, sw: 1.2 },
    )
    svgMid.text(x0 + 7, f.y0 + 10, f.kind, { size: 12, bold: true })
    if (f.label) svgMid.text(x0 + tw + 8, f.y0 + 11, `[${f.label}]`, { size: 12, color: THEME.ink, italic: true })
    for (const el of f.elses) {
      svgMid.line(x0, el.y, x1, el.y, { ...frameP, dash: '5 4' })
      if (el.label) svgMid.text(x0 + 10, el.y + 12, `[${el.label}]`, { size: 12, italic: true })
    }
  }

  // lifelines, activations, participants
  const out = new Svg()
  const lifeTop = top + headH
  for (let k = 0; k < n; k++) out.line(cx[k], lifeTop, cx[k], ended.get(k) ?? (footer ? y : y - 6), { stroke: '#9aa3b2', sw: 1, dash: '5 4' })
  out.raw(svgBack.body())
  for (const b of bars) {
    const x = cx[b.k] - 5 + b.depth * 5
    out.rect(x, b.y0, 10, Math.max(8, b.y1 - b.y0), { fill: '#f3f4f6', stroke: THEME.stroke, sw: 1 })
  }
  out.raw(svgMid.body())
  out.raw(svgFront.body())
  ps.forEach((p, k) => {
    drawParticipant(out, p, boxes[k], cx[k], top + headH - boxes[k].h)
    if (footer && !ended.has(k)) drawParticipant(out, p, boxes[k], cx[k], y)
  })
  if (s.title) {
    width = Math.max(width, textWidth(s.title, 16, true) + 2 * MARGIN)
    out.text(width / 2, MARGIN + 12, s.title, { anchor: 'middle', size: 16, bold: true })
  }
  return { svg: out.toString(width, height), w: Math.ceil(width), h: Math.ceil(height) }
}

function numberBadge(svg: Svg, x: number, y: number, k: number) {
  const r = Math.max(8, textWidth(String(k), 10) / 2 + 4)
  svg.circle(x, y, r, { fill: THEME.dark })
  svg.text(x, y, String(k), { anchor: 'middle', size: 10, color: '#ffffff', bold: true })
}
