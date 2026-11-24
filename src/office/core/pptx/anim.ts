/**
 * PPTX 动画 / 切换：
 * - `p:transition`：slide 级切换，按首个子元素名识别（fade / wipe / push / cut…）；
 * - `p:timing`：识别 presetClass="entr" / "emph" / "exit" 的效果。按 mainSeq 内
 *   cTn[presetClass]（nodeType="clickEffect"）节点的**文档顺序**解析出播放序列
 *   （AnimSeqItem[]），视图据此顺序播放，而非按元素数组顺序。
 *   编辑支持 entrance（appear/fade/wipe）、emphasis（spin/growShrink）、
 *   exit（disappear/fadeOut）。写回整棵 p:timing 按当前（形状 → preset）顺序重建，
 *   结构与 PowerPoint 生成的 mainSeq 一致（每个 clickEffect 一个 click group par）。
 * 诚实边界：不含 motion path（presetClass="path"）、不保留 withEffect/afterEffect
 *   触发分组（统一 clickEffect）、不读取段落级（p:pgRg）动画。
 */
import { getAttr, isNode, kidsOf, local, parseRaw, rootEl, walkOoxml, type RChild, type RNode } from '../raw'
import type { XEl } from '../xml'
import type { AnimPreset, AnimSeqItem } from './types'

export type { AnimPreset } from './types'

/** 编辑支持的全部动画 preset（entrance → emphasis → exit） */
export const ANIM_PRESETS: readonly AnimPreset[] = ['appear', 'fade', 'wipe', 'spin', 'growShrink', 'disappear', 'fadeOut']
/** 编辑支持的切换（写回用） */
export const TRANSITION_KINDS = ['fade', 'wipe', 'push', 'cut'] as const
export type TransitionKind = (typeof TRANSITION_KINDS)[number]

interface PresetDef { id: number; cls: AnimSeqItem['cls']; sub: number }
/** presetID / presetClass / presetSubtype（PowerPoint 动画窗格据此显示效果名） */
const PRESET: Record<AnimPreset, PresetDef> = {
  appear: { id: 1, cls: 'entr', sub: 0 },
  fade: { id: 10, cls: 'entr', sub: 0 },
  wipe: { id: 22, cls: 'entr', sub: 0 },
  spin: { id: 8, cls: 'emph', sub: 0 },
  growShrink: { id: 6, cls: 'emph', sub: 0 },
  disappear: { id: 1, cls: 'exit', sub: 0 },
  fadeOut: { id: 10, cls: 'exit', sub: 0 },
}

/** cls:presetID → preset（读回映射；未建模的同 cls preset 归到该类默认效果） */
const ID_BY_PRESET: Record<string, AnimPreset> = {
  'entr:1': 'appear', 'entr:10': 'fade', 'entr:22': 'wipe',
  'emph:8': 'spin', 'emph:6': 'growShrink', 'emph:26': 'growShrink', 'emph:32': 'growShrink',
  'exit:1': 'disappear', 'exit:10': 'fadeOut', 'exit:2': 'fadeOut', 'exit:22': 'fadeOut', 'exit:30': 'fadeOut', 'exit:23': 'fadeOut',
}
function presetFrom(clsRaw: string | undefined, idRaw: string | undefined): { preset: AnimPreset; cls: AnimSeqItem['cls'] } {
  const cls: AnimSeqItem['cls'] = clsRaw === 'emph' || clsRaw === 'exit' ? clsRaw : 'entr'
  const id = Number(idRaw ?? '1') || 1
  const preset = ID_BY_PRESET[`${cls}:${id}`]
    ?? (cls === 'exit' ? 'fadeOut' : cls === 'emph' ? 'growShrink' : 'appear')
  return { preset, cls }
}

// ---------------------------------------------------------------- 解析（XEl / parser 侧）

/**
 * parseTimeValue（Timing.js:162-174）：非串 → Unspecified（undefined）；
 * 'indefinite' → Indefinite（MAX_SAFE_INTEGER，此处归 Infinity）；否则 parseInt。
 */
export function parseTimeValue(val: string | undefined): number | undefined {
  if (typeof val !== 'string') return undefined
  if (val === 'indefinite') return Infinity
  const n = parseInt(val, 10)
  return Number.isNaN(n) ? undefined : n
}

/** 首个 stCondLst/cond@delay（XEl 子树，文档顺序） */
function firstCondDelayX(n: XEl): string | undefined {
  for (const c of n.c) {
    if (c.n === 'stCondLst') {
      const cond = c.c.find((k) => k.n === 'cond')
      if (cond) return cond.a.delay
    }
    const d = firstCondDelayX(c)
    if (d !== undefined) return d
  }
  return undefined
}

function walkXEls(n: XEl, visit: (x: XEl) => boolean): boolean {
  for (const c of n.c) {
    if (visit(c)) return true
    if (walkXEls(c, visit)) return true
  }
  return false
}

/** 在子树内按文档顺序收集所有带 presetClass 的 cTn（命中后不再下钻同一效果细节）。
 *  dur = clickEffect 自身 @dur（有限值），缺省取子树内最大有限 dur（行为 cTn 的真实时长）；
 *  delay = 首个 stCondLst/cond@delay。二者走 parseTimeValue（indefinite→Infinity、缺省→undefined）。 */
function collectEffectsX(n: XEl, out: AnimSeqItem[]): void {
  for (const c of n.c) {
    if (c.n === 'cTn' && c.a.presetClass) {
      const cls = c.a.presetClass
      // 只建模 entr / emph / exit；path（motion path）/ mediacall 等跳过，不误收成入场动画
      if (cls === 'entr' || cls === 'emph' || cls === 'exit') {
        let spid: number | undefined
        let maxDur = 0
        walkXEls(c, (x) => {
          if (spid === undefined && x.n === 'spTgt' && x.a.spid) spid = Number(x.a.spid)
          if (x.n === 'cTn') {
            const d = parseTimeValue(x.a.dur)
            if (d !== undefined && d !== Infinity && d > maxDur) maxDur = d
          }
          return false
        })
        if (spid !== undefined) {
          const hit = presetFrom(cls, c.a.presetID)
          const own = parseTimeValue(c.a.dur)
          const dur = own !== undefined && own !== Infinity ? own : maxDur || undefined
          out.push({ spid, preset: hit.preset, cls: hit.cls, dur, delay: parseTimeValue(firstCondDelayX(c)) })
        }
      }
      return
    }
    collectEffectsX(c, out)
  }
}

/** 解析 XEl 树的 p:timing：按 mainSeq 内 clickEffect 文档顺序返回效果列表 */
export function parseTimingListX(root: XEl | undefined): AnimSeqItem[] {
  const timing = root?.c.find((c) => c.n === 'timing')
  if (!timing) return []
  // 只取 mainSeq 子树，避免把 interactiveSeq 的触发动画误收成 click 动画
  let mainSeq: XEl | undefined
  const findSeq = (n: XEl): boolean => {
    for (const c of n.c) {
      if (c.n === 'cTn' && c.a.nodeType === 'mainSeq') { mainSeq = c; return true }
      if (findSeq(c)) return true
    }
    return false
  }
  findSeq(timing)
  const out: AnimSeqItem[] = []
  if (mainSeq) collectEffectsX(mainSeq, out)
  else collectEffectsX(timing, out) // 无显式 mainSeq 的简化 timing：全量收集
  return out
}

/** 兼容旧接口：spid → 首个效果 preset（贴到 SlideEl.anim） */
export function parseTimingX(root: XEl | undefined): Map<number, string> {
  const m = new Map<number, string>()
  for (const e of parseTimingListX(root)) if (!m.has(e.spid)) m.set(e.spid, e.preset)
  return m
}

/** 解析 XEl 树的 p:transition：首个子元素名（fade / wipe / push…），没有则 undefined */
export function parseTransitionX(root: XEl | undefined): string | undefined {
  const tr = root?.c.find((c) => c.n === 'transition')
  return tr?.c.find((c) => !!c.n)?.n
}

// ---------------------------------------------------------------- 解析（RNode / 写回侧）

/** 首个 stCondLst/cond@delay（RNode 子树，文档顺序） */
function firstCondDelayR(n: RNode): string | undefined {
  for (const c of kidsOf(n)) {
    if (local(c.q) === 'stCondLst') {
      const cond = kidsOf(c).find((k) => local(k.q) === 'cond')
      if (cond) return getAttr(cond, 'delay')
    }
    const d = firstCondDelayR(c)
    if (d !== undefined) return d
  }
  return undefined
}

/** 解析当前 slide XML 的动画列表（保持 mainSeq clickEffect 时序顺序） */
export function timingListOf(nodes: RChild[]): AnimSeqItem[] {
  const timing = kidsOf(rootEl(nodes), 'timing')[0]
  if (!timing) return []
  let mainSeq: RNode | undefined
  const findSeq = (n: RNode): boolean => {
    for (const c of kidsOf(n)) {
      if (local(c.q) === 'cTn' && getAttr(c, 'nodeType') === 'mainSeq') { mainSeq = c; return true }
      if (findSeq(c)) return true
    }
    return false
  }
  findSeq(timing)
  const out: AnimSeqItem[] = []
  const collect = (n: RNode): void => {
    for (const c of kidsOf(n)) {
      if (local(c.q) === 'cTn' && getAttr(c, 'presetClass')) {
        const cls = getAttr(c, 'presetClass')
        if (cls === 'entr' || cls === 'emph' || cls === 'exit') {
          let spid: string | undefined
          let maxDur = 0
          walkOoxml(c, (x) => {
            if (spid === undefined && local(x.q) === 'spTgt') spid = getAttr(x, 'spid')
            if (local(x.q) === 'cTn') {
              const d = parseTimeValue(getAttr(x, 'dur'))
              if (d !== undefined && d !== Infinity && d > maxDur) maxDur = d
            }
            return false
          })
          if (spid !== undefined) {
            const hit = presetFrom(cls, getAttr(c, 'presetID'))
            const own = parseTimeValue(getAttr(c, 'dur'))
            const dur = own !== undefined && own !== Infinity ? own : maxDur || undefined
            out.push({ spid: Number(spid), preset: hit.preset, cls: hit.cls, dur, delay: parseTimeValue(firstCondDelayR(c)) })
          }
        }
        return
      }
      collect(c)
    }
  }
  if (mainSeq) collect(mainSeq)
  else collect(timing)
  return out
}

// ---------------------------------------------------------------- 写回（生成 p:timing）

/** 单个效果的行为（set / animEffect / animRot / animScale），cTn id 由 `next` 递增 */
function effectBehaviors(spid: number, preset: AnimPreset, next: { n: number }): string {
  const tgt = `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`
  const setVis = (visible: boolean, delay: number): string =>
    `<p:set><p:cBhvr><p:cTn id="${next.n++}" dur="1" fill="hold">` +
    `<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst></p:cTn>${tgt}` +
    `<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>` +
    `<p:to><p:strVal val="${visible ? 'visible' : 'hidden'}"/></p:to></p:set>`
  const animEffect = (transition: 'in' | 'out', filter: string): string =>
    `<p:animEffect transition="${transition}" filter="${filter}"><p:cBhvr>` +
    `<p:cTn id="${next.n++}" dur="500"/>${tgt}</p:cBhvr></p:animEffect>`
  switch (preset) {
    case 'appear':
      return setVis(true, 0)
    case 'fade':
      return setVis(true, 0) + animEffect('in', 'fade')
    case 'wipe':
      return setVis(true, 0) + animEffect('in', 'wipe(up)')
    case 'spin':
      return `<p:animRot by="21600000"><p:cBhvr><p:cTn id="${next.n++}" dur="500" fill="hold"/>${tgt}` +
        `<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>`
    case 'growShrink':
      return `<p:animScale><p:cBhvr><p:cTn id="${next.n++}" dur="500" fill="hold"/>${tgt}</p:cBhvr>` +
        `<p:by x="150000" y="150000"/></p:animScale>`
    case 'disappear':
      return setVis(false, 0)
    case 'fadeOut':
      return animEffect('out', 'fade') + setVis(false, 499)
  }
}

/** 一个效果的 <p:par>（cTn 带 presetID/presetClass/nodeType=clickEffect） */
function effectXml(e: AnimSeqItem, next: { n: number }): string {
  const def = PRESET[e.preset]
  return (
    `<p:par><p:cTn id="${next.n++}" presetID="${def.id}" presetClass="${def.cls}" ` +
    `presetSubtype="${def.sub}" fill="hold" grpId="0" nodeType="clickEffect">` +
    `<p:stCondLst><p:cond delay="0"/></p:stCondLst>` +
    `<p:childTnLst>${effectBehaviors(e.spid, e.preset, next)}</p:childTnLst></p:cTn></p:par>`
  )
}

/** 整棵 p:timing（mainSeq：每次点击触发一个效果，与 PowerPoint 生成的结构对齐）。
 *  list 的顺序 = mainSeq clickEffect 节点顺序 = 播放顺序。 */
function timingXml(list: AnimSeqItem[]): string {
  const next = { n: 3 } // id 1 = tmRoot、2 = mainSeq
  let inner = ''
  for (const e of list) {
    inner +=
      `<p:par><p:cTn id="${next.n++}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>` +
      `<p:par><p:cTn id="${next.n++}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
      effectXml(e, next) +
      `</p:childTnLst></p:cTn></p:par>` +
      `</p:childTnLst></p:cTn></p:par>`
  }
  return (
    `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>` +
    `<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${inner}</p:childTnLst></p:cTn>` +
    `<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>` +
    `<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>` +
    `</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`
  )
}

/** 在 p:sld 的 schema 位置插入子元素：插在最后一个命中 anchor 的元素之后 */
function insertAt(root: RNode, child: RNode, anchors: string[]): void {
  let at = -1
  root.c.forEach((c, i) => {
    if (isNode(c) && anchors.includes(local(c.q))) at = Math.max(at, i)
  })
  root.c.splice(at + 1, 0, child)
  root.self = false
}

/** 设置形状的动画（preset null = 移除）；替换时保留该形状在 clickEffect 序列中的原位置 */
export function applyAnim(nodes: RChild[], top: number, preset: AnimPreset | null): void {
  const root = rootEl(nodes)
  if (!root) return
  const list = timingListOf(nodes)
  const firstIdx = list.findIndex((e) => e.spid === top)
  const kept = list.filter((e) => e.spid !== top)
  if (preset) {
    const item: AnimSeqItem = { spid: top, preset, cls: PRESET[preset].cls }
    const at = firstIdx >= 0 ? list.slice(0, firstIdx).filter((e) => e.spid !== top).length : kept.length
    kept.splice(at, 0, item)
  }
  const timing = kidsOf(root, 'timing')[0]
  if (timing) root.c.splice(root.c.indexOf(timing), 1)
  if (kept.length) insertAt(root, parseRaw(timingXml(kept))[0] as RNode, ['transition', 'clrMapOvr', 'cSld'])
  root.self = false
}

const TRANSITION_XML: Record<string, string> = { fade: '<p:fade/>', wipe: '<p:wipe/>', push: '<p:push dir="u"/>', cut: '<p:cut/>' }

/** 设置 slide 级切换（kind null = 移除） */
export function applyTransition(nodes: RChild[], kind: string | null): void {
  const root = rootEl(nodes)
  if (!root) return
  const tr = kidsOf(root, 'transition')[0]
  if (tr) root.c.splice(root.c.indexOf(tr), 1)
  if (kind && TRANSITION_XML[kind]) {
    insertAt(root, parseRaw(`<p:transition spd="med">${TRANSITION_XML[kind]}</p:transition>`)[0] as RNode, ['clrMapOvr', 'cSld'])
  }
  root.self = false
}
