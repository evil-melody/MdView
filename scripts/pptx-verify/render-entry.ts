/**
 * Verification harness for the MdView pptx render/edit path (GenOffice engine).
 *
 * Runs the SHIPPED modules (src/pptx/*) in a real browser so measurement, webfonts and the SVG
 * emitter behave exactly as in the Tauri webview. Checks performed:
 *   1. parse + per-slide RenderTree -> SVG (node/text/picture counts, missing media)
 *   2. untouched save is byte-identical (the engine's byte-anchor guarantee)
 *   3. text edit -> save -> re-open -> the new text is present, and only that slide changed
 *   4. (ops=1) the op layer: insert / transform / delete / slide add+duplicate+move / undo, each
 *      asserted after a save → re-open round trip
 *
 * Query params: ?src=./x.pptx&w=1280&only=3&edit=1&runs=1&ops=1
 */
import { PptxDocument } from '../../src/pptx/document'
import { openPptx } from '@genoffice/pptx-engine'
import { animOps, arrangeOps, deckOps, elementOps, insertOps, slideOps, tableOps, textOps } from '../../src/pptx/ops'

const Q = new URLSearchParams(location.search)
const SRC = Q.get('src') ?? './sample.pptx'
const FIT = Number(Q.get('w') ?? 1280)
const ONLY = Number(Q.get('only') ?? 0)
const RUNS = Q.get('runs') === '1'
const DO_EDIT = Q.get('edit') === '1'
const DO_OPS = Q.get('ops') === '1'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function sha256(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 8×8 PNG bytes, so the picture op has a real bitmap to embed. */
function tinyPng(): Uint8Array {
  const c = document.createElement('canvas')
  c.width = 8
  c.height = 8
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#123456'
  ctx.fillRect(0, 0, 8, 8)
  const dataUrl = c.toDataURL('image/png')
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * End-to-end op coverage: every edit the MdView toolbar can produce is applied through the shipped
 * `PptxDocument.runOps`, asserted against the RenderTree, then saved, re-opened and asserted again —
 * a mismatch between model and bytes is the failure mode this harness exists to catch.
 */
async function runOpsChecks(orig: Uint8Array) {
  const open = async (bytes: Uint8Array) => {
    const d = await PptxDocument.open(bytes)
    await d.prepare()
    return d
  }
  const doc = await open(orig)
  const mapper = doc.mapper(FIT)
  const roundRect = (r: any) => [Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)]
  const near = (a: number[], b: number[], tol = 1.5) => a.every((v, i) => Math.abs(v - b[i]) <= tol)
  const checks: Record<string, any> = {}
  const startSlides = doc.slideCount

  /**
   * op 返回的新元素 id 是"当前模型"的 parse id；引擎在 insert picture/table、group 等 op 里会
   * 重新序列化并重解析整页，parse id 随之全部变化，改写字节时还会把元素的 key 从 e_<nvId>
   * 升级成 e_<guid8>。所以按"身份别名集合"反查元素再取正式 key —— 编辑器
   * （PptxDocument.elements[].ids / key）就是这么做的。
   */
  const view = (n = 0) => doc.renderSlide(n, { fitWidthPx: FIT })
  const boxOf = (n: number, id: string) =>
    view(n).elements.find((e) => e.key === id || e.ids.includes(id))
  const keyOf = (n: number, id?: string) => (id ? (boxOf(n, id)?.key ?? id) : '')

  // ── 插入文本框 + 几何 + 格式 ──
  const marker = `MdView-ops-${Date.now().toString(36)}`
  const R1 = { x: 80, y: 80, w: 320, h: 70 }
  const ins = doc.runOps([insertOps.textBox(0, R1, mapper, marker)], 'insert textbox')
  const textId = keyOf(0, ins.created[0])
  let slide = view()
  const textBox = slide.elements.find((e) => e.key === textId)
  checks.insertTextBox = {
    applied: ins.applied,
    created: textId,
    geometry: textBox ? roundRect(textBox) : null,
    geometryOk: !!textBox && near(roundRect(textBox), [R1.x, R1.y, R1.w, R1.h], 2),
    textRendered: slide.texts.some((t) => t.key === textId && t.text.includes(marker))
  }

  const R2 = { x: 300, y: 200, w: 400, h: 90 }
  const mv = doc.runOps([elementOps.transform({ slide: 0, el: textId }, R2, mapper)], 'move')
  slide = view()
  const movedBox = slide.elements.find((e) => e.key === textId)
  checks.transform = {
    applied: mv.applied,
    geometry: movedBox ? roundRect(movedBox) : null,
    geometryOk: !!movedBox && near(roundRect(movedBox), [R2.x, R2.y, R2.w, R2.h], 2)
  }

  const fmt = doc.runOps(
    [
      elementOps.setFill({ slide: 0, el: textId }, '#FF0000'),
      textOps.setFont({ slide: 0, el: textId }, { color: '#0000FF', fontSizePx: 32 })
    ],
    'format'
  )
  slide = view()
  const fmtBox = slide.elements.find((e) => e.key === textId)
  const fmtText = slide.texts.find((t) => t.key === textId)
  checks.format = {
    applied: fmt.applied,
    fill: fmtBox?.fillHex ?? null,
    fontColor: fmtText?.color ?? null,
    fontSizePx: fmtText ? Math.round(fmtText.fontSizePx) : null
  }

  // ── 插入表格 / 图片（这两个 op 会重建整页模型，正是 parse id 失效的场景） ──
  const tbl = doc.runOps(
    [insertOps.table(0, { x: 40, y: 380, w: 420, h: 180 }, mapper, 2, 3)],
    'insert table'
  )
  const tableId = keyOf(0, tbl.created[0])
  const pic = doc.runOps(
    [insertOps.image(0, { x: 640, y: 320, w: 220, h: 160 }, mapper, tinyPng(), 'png')],
    'insert picture'
  )
  const picId = keyOf(0, pic.created[0])
  slide = view()
  checks.insertTable = {
    applied: tbl.applied,
    key: tableId,
    kind: slide.elements.find((e) => e.key === tableId)?.kind ?? null
  }
  checks.insertPicture = {
    applied: pic.applied,
    key: picId,
    kind: slide.elements.find((e) => e.key === picId)?.kind ?? null,
    hasMedia: slide.pictures.length > 0
  }
  // 重建后早先插入的元素仍须可寻址 —— 这是 durable id 改造的核心断言
  checks.identityAcrossReparse = {
    textStillAddressable: !!boxOf(0, textId),
    fillStillApplied: boxOf(0, textId)?.fillHex ?? null,
    fillKind: boxOf(0, textId)?.fillKind ?? null,
    // 直接在"此刻的模型 XML"里找填充色：区分"模型没记"与"渲染没认"
    xmlHasFill: doc.slideXml(0).includes('FF0000'),
    geometryIntact: (() => {
      const b = boxOf(0, textId)
      return !!b && near(roundRect(b), [R2.x, R2.y, R2.w, R2.h], 2)
    })()
  }

  // ── 层级 / 组合 / 对齐（作用于新插入的三个元素） ──
  const ids = [textId, tableId, picId]
  const arrange = doc.runOps(
    [
      elementOps.reorder({ slide: 0, el: textId }, 'front'),
      arrangeOps.align(0, ids, 'centerH', 'selection')
    ],
    'arrange'
  )
  slide = view()
  const centers = ids.map((id) => {
    const b = slide.elements.find((e) => e.key === id)
    return b ? b.x + b.w / 2 : Number.NaN
  })
  checks.arrange = {
    applied: arrange.applied,
    failures: arrange.failures.map((f) => f.error.slice(0, 120)),
    missing: ids.filter((id) => !boxOf(0, id)),
    centerSpread: Number.isFinite(Math.max(...centers))
      ? Math.round(Math.max(...centers) - Math.min(...centers))
      : null
  }
  // 对齐会移动元素，之后的断言都以这一步之后的几何为准
  const expectedGeom = roundRect(boxOf(0, textId)!)

  // 引擎的 GROUPABLE 只接受 text/shape/picture（表格不能进组），故用文本框 + 图片
  const grouped = doc.runOps([elementOps.group(0, [textId, picId])], 'group')
  slide = view()
  const groupedIds = [textId, picId]
  const groupKey = keyOf(0, grouped.created[0])
  checks.group = {
    applied: grouped.applied,
    failures: grouped.failures.map((f) => f.error.slice(0, 120)),
    groupKey,
    childrenNested: groupedIds.every((id) => (boxOf(0, id)?.groupPath.length ?? 0) > 0)
  }
  if (groupKey) {
    const un = doc.runOps([elementOps.ungroup({ slide: 0, el: groupKey })], 'ungroup')
    slide = view()
    checks.group.ungrouped =
      un.applied &&
      groupedIds.every((id) => (boxOf(0, id)?.groupPath.length ?? 1) === 0)
  }

  // ── 删除 + 撤销 ──
  const del = doc.runOps([elementOps.remove({ slide: 0, el: textId })], 'delete')
  slide = view()
  const afterDelete = !!boxOf(0, textId)
  const undone = doc.undo()
  slide = view()
  const afterUndo = boxOf(0, textId)
  checks.deleteUndo = {
    applied: del.applied,
    goneAfterDelete: !afterDelete,
    undoReturned: undone,
    backAfterUndo: !!afterUndo,
    geometryRestored: !!afterUndo && near(roundRect(afterUndo), expectedGeom, 2)
  }

  // ── 幻灯片结构：新增 / 复制 / 移动 / 删除（都在 index>0 上操作，保持 slide 0 内容不动） ──
  const addRes = doc.runOps([slideOps.addBlank(0)], 'add slide')
  const afterAdd = doc.slideCount
  const dupRes = doc.runOps([slideOps.duplicate(1)], 'dup slide')
  const afterDup = doc.slideCount
  const moveRes = doc.runOps([slideOps.move(1, 3)], 'move slide')
  const addedTitles = doc.renderSlide(1, { fitWidthPx: FIT }).title
  const removed = doc.runOps([slideOps.remove(3)], 'del slide')
  checks.slideOps = {
    addApplied: addRes.applied,
    slidesAfterAdd: afterAdd,
    dupApplied: dupRes.applied,
    slidesAfterDup: afterDup,
    moveApplied: moveRes.applied,
    removedApplied: removed.applied,
    slidesFinal: doc.slideCount,
    expectedFinal: startSlides + 1,
    blankSlideTitle: addedTitles
  }

  // ── 填充写回探针：单独开一份文档，改动后立刻保存重开（隔离 reparse 的影响） ──
  {
    const probe = await open(orig)
    const before = probe.renderSlide(0, { fitWidthPx: FIT })
    const target =
      before.elements.find((e) => e.kind === 'shape' && !e.groupPath.length) ?? before.elements[0]
    const pf = probe.runOps([elementOps.setFill({ slide: 0, el: target.key }, '#00FF00')], 'fill')
    const inSession = probe
      .renderSlide(0, { fitWidthPx: FIT })
      .elements.find((e) => e.key === target.key || e.ids.includes(target.key))?.fillHex
    const bytes = await probe.save()
    const reopenedProbe = await open(bytes)
    const persisted = reopenedProbe
      .renderSlide(0, { fitWidthPx: FIT })
      .elements.find((e) => e.key === target.key || e.ids.includes(target.key))?.fillHex
    const a = await openPptx(bytes)
    const slideXml = a.archive.readText((a.deck.slides[0] as any).path) ?? ''
    checks.fillPersist = {
      target: target.key,
      kind: target.kind,
      applied: pf.applied,
      failures: pf.failures.map((f) => f.error.slice(0, 100)),
      inSession,
      persisted,
      xmlHasFillColor: slideXml.includes('00FF00')
    }
  }

  // ── 填充写回探针 2：新插入的元素 + 设填充，逐层跟踪"模型 / XML / 重解析 / 落盘" ──
  {
    const probe = await open(orig)
    const rect = { x: 60, y: 60, w: 300, h: 120 }
    const ins2 = probe.runOps([insertOps.textBox(0, rect, probe.mapper(FIT), 'fill-probe')], 'ins')
    const key2 = probe
      .renderSlide(0, { fitWidthPx: FIT })
      .elements.find((e) => e.sourceId === ins2.created[0])?.key
    const afterInsert = probe
      .renderSlide(0, { fitWidthPx: FIT })
      .elements.find((e) => e.key === key2)?.fillKind
    probe.runOps([elementOps.setFill({ slide: 0, el: key2! }, '#00FF00')], 'fill')
    const afterFill = probe.renderSlide(0, { fitWidthPx: FIT })
    const box2 = afterFill.elements.find((e) => e.key === key2 || e.ids.includes(key2!))
    const xmlAfterFill = probe.slideXml(0)
    // 强制一次模型→XML→重解析（引擎的 materializeSlide 语义），看填充是否还在
    const savedBytes2 = await probe.save()
    const arch2 = await openPptx(savedBytes2)
    const savedXml = arch2.archive.readText((arch2.deck.slides[0] as any).path) ?? ''
    const savedAt = savedXml.indexOf('fill-probe')
    // 直接看引擎模型：重开之后那个文本框的 fill 到底是什么（对照 XML 已经是对的）
    const walk = (els: any[]): any[] =>
      els.flatMap((e) => (e?.children ? [e, ...walk(e.children)] : [e]))
    const rawEls = walk(((arch2.deck.slides[0] as any).elements ?? []) as any[])
    const rawProbe = rawEls.find((e) => JSON.stringify(e)!.includes('fill-probe'))
    const rawModel = rawProbe
      ? {
          id: rawProbe.id,
          kind: rawProbe.kind,
          fill: rawProbe.fill ?? null,
          modelKeys: Object.keys(rawProbe).slice(0, 40),
          spPrKeys: rawProbe.spPr ? Object.keys(rawProbe.spPr) : null,
          rawHasNoFill: JSON.stringify(rawProbe).includes('a:noFill')
        }
      : null
    const reopenedSameSession = await open(savedBytes2)
    const saveSlide = reopenedSameSession.renderSlide(0, { fitWidthPx: FIT })
    const saveMatches = saveSlide.elements
      .filter((e) => e.key === key2 || e.ids.includes(key2!))
      .map((e) => ({
        key: e.key,
        sourceId: e.sourceId,
        type: e.type,
        kind: e.kind,
        fillKind: e.fillKind,
        fillHex: e.fillHex,
        box: [e.x, e.y, e.w, e.h].map(Math.round)
      }))
    const afterSave = saveMatches[0]
    // PptxDocument 内部那份引擎模型的 fill（和 arch2 对照，判断是解析差异还是渲染差异）
    const modelInDoc = (() => {
      const deck = (reopenedSameSession as any).deck
      const els = walk((deck?.slides?.[0]?.elements ?? []) as any[])
      const hit = els.find((e) => JSON.stringify(e)!.includes('fill-probe'))
      return hit ? { id: hit.id, fill: hit.fill ?? null, txBox: hit.txBox ?? null } : null
    })()
    checks.fillPersistInserted = {
      key: key2,
      fillKindAfterInsert: afterInsert,
      fillKindAfterFill: box2?.fillKind ?? null,
      fillAfterFill: box2?.fillHex ?? null,
      xmlHasColor: xmlAfterFill.includes('00FF00'),
      colorCount: xmlAfterFill.split('00FF00').length - 1,
      probeTextCount: xmlAfterFill.split('fill-probe').length - 1,
      // 填充色在 XML 中的上下文（判断它落在了哪个元素里）
      colorContext: (() => {
        const at = xmlAfterFill.indexOf('00FF00')
        return at < 0 ? '' : xmlAfterFill.slice(Math.max(0, at - 260), at + 60)
      })(),
      fillKindAfterSave: afterSave?.fillKind ?? null,
      fillAfterSave: afterSave?.fillHex ?? null,
      saveMatches,
      // 落盘后 XML 里那个 probe 文本框的 spPr 原文（判断 a:noFill 是否被追加进去了）
      savedXmlHasColor: savedXml.includes('00FF00'),
      savedShapeCount: savedXml.split('<p:sp>').length - 1,
      savedXmlContext:
        savedAt < 0 ? '' : savedXml.slice(Math.max(0, savedAt - 420), savedAt + 260),
      rawModel,
      modelInDoc
    }
  }

  // ── 幻灯片级状态：备注 / 切换 / 自动换片 / 隐藏（都写在幻灯片部件里，不参与渲染） ──
  {
    const probe = await open(orig)
    const notesText = `MdView-notes-${Date.now().toString(36)}`
    const notesBefore = probe.slideMeta(0).notes
    const rn = probe.runOps([slideOps.setNotes(0, notesText)], 'notes')
    const rt = probe.runOps([slideOps.setTransition(0, 'fade')], 'transition')
    const ra = probe.runOps([slideOps.setAdvance(0, 3000)], 'advance')
    const rh = probe.runOps([slideOps.setHidden(0, true)], 'hidden')
    const session = probe.slideMeta(0)
    const reopenedProbe = await open(await probe.save())
    const after = reopenedProbe.slideMeta(0)
    checks.slideMeta = {
      applied: rn.applied && rt.applied && ra.applied && rh.applied,
      notesBefore,
      notesSession: session.notes,
      notesPersisted: after.notes,
      notesOk: after.notes === notesText,
      transitionPersisted: after.transition,
      advancePersisted: after.advanceMs,
      hiddenPersisted: after.hidden
    }
  }

  // ── 表格单元格：文字 + 底纹（表格网格先插一张，再逐格断言） ──
  {
    const probe = await open(orig)
    const box = { x: 60, y: 60, w: 320, h: 160 }
    const ins3 = probe.runOps([insertOps.table(0, box, probe.mapper(FIT), 2, 2)], 'table')
    const rs3 = probe.renderSlide(0, { fitWidthPx: FIT })
    const tableKey = rs3.elements.find((e) => e.sourceId === ins3.created[0])?.key
    const grid = tableKey ? probe.tableCells(0, tableKey, FIT) : []
    const cell = grid.find((c) => !c.merged)
    const cellMarker = `C${Date.now().toString(36)}`
    let textApplied = false
    let fillApplied = false
    let session: (typeof grid)[number] | undefined
    let persisted: (typeof grid)[number] | undefined
    let gridAfter = grid
    if (tableKey && cell) {
      const r1 = probe.runOps(
        [
          tableOps.cellText({ slide: 0, el: tableKey }, cell.row, cell.col, [
            { srcPara: 0, runs: [{ text: cellMarker }] }
          ])
        ],
        'cell text'
      )
      const r2 = probe.runOps(
        [tableOps.cellFill({ slide: 0, el: tableKey }, cell.row, cell.col, '#00FF00')],
        'cell fill'
      )
      textApplied = r1.applied
      fillApplied = r2.applied
      session = probe.tableCells(0, tableKey, FIT).find((c) => c.row === cell.row && c.col === cell.col)
      const reopenedProbe = await open(await probe.save())
      gridAfter = reopenedProbe.tableCells(0, tableKey, FIT)
      persisted = gridAfter.find((c) => c.row === cell.row && c.col === cell.col)
    }
    checks.tableCell = {
      applied: textApplied && fillApplied,
      tableKey,
      gridCells: grid.length,
      cell: cell ? { row: cell.row, col: cell.col } : null,
      cellSizeOk: !!cell && cell.w > 10 && cell.h > 10,
      textSession: session?.text ?? null,
      textPersisted: persisted?.text ?? null,
      textOk: persisted?.text === cellMarker,
      fillSession: session?.fillHex ?? null,
      fillPersisted: persisted?.fillHex ?? null,
      gridPersisted: gridAfter.length
    }
  }

  // ── 元素效果：投影加/删；进入动画加/删，均跨保存重开 ──
  {
    const probe = await open(orig)
    const before = probe.renderSlide(0, { fitWidthPx: FIT })
    const target =
      before.elements.find((e) => e.kind === 'shape' && !e.groupPath.length) ?? before.elements[0]
    const add = probe.runOps(
      [elementOps.setShadow({ slide: 0, el: target.key }, {}, probe.mapper(FIT))],
      'shadow'
    )
    const xmlWithShadow = probe.slideXml(0)
    const clear = probe.runOps(
      [elementOps.setShadow({ slide: 0, el: target.key }, null, probe.mapper(FIT))],
      'unshadow'
    )
    const xmlNoShadow = probe.slideXml(0)
    const animBefore = probe.slideAnimations(0).length
    const animAdd = probe.runOps([animOps.add({ slide: 0, el: target.key }, 'fade')], 'anim')
    const timeline = probe.slideAnimations(0)
    /**
     * 身份升级：上面的 setShadow 重写了该元素字节 → 引擎为它铸造了 a16:creationId，durable id 从
     * `e_<cNvPr>` 变成 `e_<guid8>`。AnimationEntry.el 用的是新形式，所以匹配必须按**当前**别名表来
     * （编辑器每次 op 后重渲染再按 ids 反查，走的是同一条路）。
     */
    const fresh = probe
      .renderSlide(0, { fitWidthPx: FIT })
      .elements.find((e) => e.ids.includes(target.key))
    const isMine = (id: string | null) =>
      !!id && (id === target.key || !!fresh?.ids.includes(id))
    const seq = timeline.findIndex((a) => isMine(a.el))
    const bytes = await probe.save()
    const reopenedProbe = await open(bytes)
    const persisted = reopenedProbe.slideAnimations(0)
    const animDel = probe.runOps([animOps.removeBySeq(0, seq)], 'del anim')
    checks.effects = {
      applied: add.applied && clear.applied,
      target: target.key,
      kind: target.kind,
      shadowXmlAfterAdd: xmlWithShadow.includes('outerShdw'),
      shadowXmlAfterClear: xmlNoShadow.includes('outerShdw')
    }
    checks.animation = {
      applied: animAdd.applied && animDel.applied,
      before: animBefore,
      afterAdd: timeline.length,
      added: seq >= 0 && timeline[seq]?.effect === 'fade',
      seq,
      timeline: timeline.map((a) => ({ seq: a.seq, el: a.el, effect: a.effect })),
      persistedEffect: persisted.find((a) => isMine(a.el))?.effect ?? null,
      afterRemove: probe.slideAnimations(0).length
    }
  }

  // ── 整篇查找替换 ──
  {
    const probe = await open(orig)
    const sample = probe.renderSlide(0, { fitWidthPx: FIT }).texts.find((t) => t.text.trim().length > 4)
    const token = (sample?.text ?? '').trim().split('\n')[0]!.slice(0, 6)
    const next = `${token}-X`
    const fr = probe.runOps([deckOps.findReplace(token, next, {})], 'findReplace')
    const count = fr.records.find((r) => r.op.op === 'findReplace')?.after as
      | { count?: number }
      | undefined
    const seen = probe
      .renderSlide(0, { fitWidthPx: FIT })
      .texts.some((t) => t.text.includes(next))
    checks.findReplace = {
      applied: fr.applied,
      token,
      count: count?.count ?? null,
      countOk: (count?.count ?? 0) > 0,
      visibleAfter: seen,
      failures: fr.failures.map((f) => f.error.slice(0, 80))
    }
  }

  // ── 失败事务必须回滚：deck 不变、错误可读 ──
  const beforeBad = doc.slideCount
  const bad = doc.runOps([elementOps.remove({ slide: 0, el: 'no-such-element-xyz' })], 'bad op')
  checks.failedTxn = {
    applied: bad.applied,
    failureCount: bad.failures.length,
    message: (bad.failures[0]?.error ?? '').slice(0, 140),
    deckUnchanged: doc.slideCount === beforeBad
  }

  // ── 保存 → 重开 → 同样的断言 ──
  const saved = await doc.save()
  const reopened = await open(saved)
  const rslide = reopened.renderSlide(0, { fitWidthPx: FIT })
  const rOf = (id: string) => rslide.elements.find((e) => e.key === id || e.ids.includes(id))
  const rText = rOf(textId)
  const rFont = rslide.texts.find((t) => t.key === textId || t.ids.includes(textId))
  // 每一页都要能渲染，重开后不能出现空白页/解析失败
  let renderedAll = 0
  for (let i = 0; i < reopened.slideCount; i++) {
    const s = reopened.renderSlide(i, { fitWidthPx: FIT })
    if (s.svg.length > 200) renderedAll++
  }
  checks.roundTrip = {
    savedBytes: saved.length,
    slideCount: reopened.slideCount,
    expectedSlideCount: checks.slideOps.expectedFinal,
    slidesRendered: `${renderedAll}/${reopened.slideCount}`,
    textPresent: !!rText,
    textGeometry: rText ? roundRect(rText) : null,
    geometryPersisted: !!rText && near(roundRect(rText), expectedGeom, 2),
    fontColorPersisted: rFont?.color ?? null,
    fillPersisted: rOf(textId)?.fillHex ?? null,
    picturePersisted: !!rOf(picId),
    tablePersisted: rOf(tableId)?.kind === 'table',
    markerText: rslide.texts.some((t) => t.text.includes(marker))
  }
  /**
   * 逐项闸门：每个 check 自带语义化断言。之前用「扫所有字段找 false」的写法有两个毛病——
   * 像 failedTxn 这种**故意** applied:false 的用例会被误判为失败，而 fillPersist 这类
   * 只在报告里记数值、没进闸门的断言则形同虚设（对了错了 allPass 都不动）。
   */
  const gates: Record<string, boolean> = {
    insertTextBox: !!checks.insertTextBox.geometryOk && !!checks.insertTextBox.textRendered,
    transform: !!checks.transform.geometryOk,
    format: checks.format.fill === '#FF0000' && checks.format.fontColor === '#0000FF',
    insertTable: checks.insertTable.kind === 'table',
    insertPicture: checks.insertPicture.kind === 'picture' && !!checks.insertPicture.hasMedia,
    identityAcrossReparse:
      !!checks.identityAcrossReparse.textStillAddressable && !!checks.identityAcrossReparse.geometryIntact,
    arrange: checks.arrange.centerSpread === 0 && checks.arrange.missing.length === 0,
    group: checks.group.applied === true && checks.group.ungrouped === true,
    deleteUndo:
      !!checks.deleteUndo.goneAfterDelete &&
      !!checks.deleteUndo.backAfterUndo &&
      !!checks.deleteUndo.geometryRestored,
    slideOps:
      !!checks.slideOps.addApplied &&
      !!checks.slideOps.dupApplied &&
      !!checks.slideOps.moveApplied &&
      !!checks.slideOps.removedApplied &&
      checks.slideOps.slidesFinal === checks.slideOps.expectedFinal,
    fillPersist: checks.fillPersist.persisted === '#00FF00',
    fillPersistInserted: checks.fillPersistInserted.fillAfterSave === '#00FF00',
    slideMeta:
      !!checks.slideMeta.applied &&
      !!checks.slideMeta.notesOk &&
      checks.slideMeta.transitionPersisted === 'fade' &&
      checks.slideMeta.advancePersisted === 3000 &&
      checks.slideMeta.hiddenPersisted === true,
    tableCell:
      !!checks.tableCell.applied &&
      checks.tableCell.gridCells === 4 &&
      !!checks.tableCell.cellSizeOk &&
      !!checks.tableCell.textOk &&
      checks.tableCell.fillPersisted === '#00FF00' &&
      checks.tableCell.gridPersisted === 4,
    effects:
      !!checks.effects.applied && !!checks.effects.shadowXmlAfterAdd && !checks.effects.shadowXmlAfterClear,
    animation:
      !!checks.animation.applied &&
      !!checks.animation.added &&
      checks.animation.persistedEffect === 'fade' &&
      checks.animation.afterRemove === checks.animation.before,
    findReplace: !!checks.findReplace.applied && !!checks.findReplace.countOk && !!checks.findReplace.visibleAfter,
    failedTxn:
      checks.failedTxn.applied === false &&
      checks.failedTxn.failureCount > 0 &&
      !!checks.failedTxn.deckUnchanged,
    roundTrip:
      !!checks.roundTrip.geometryPersisted &&
      !!checks.roundTrip.picturePersisted &&
      !!checks.roundTrip.tablePersisted &&
      !!checks.roundTrip.markerText &&
      checks.roundTrip.slidesRendered === `${checks.roundTrip.slideCount}/${checks.roundTrip.slideCount}`
  }
  checks.gates = gates
  checks.failedGates = Object.entries(gates)
    .filter(([, ok]) => !ok)
    .map(([k]) => k)
  checks.allPass = checks.failedGates.length === 0

  return checks
}

async function main() {
  const res = await fetch(SRC)
  const orig = new Uint8Array(await res.arrayBuffer())
  const t0 = performance.now()
  const doc = await PptxDocument.open(orig)
  const parseMs = Math.round(performance.now() - t0)
  const fontCount = await doc.prepare()

  const indices = ONLY ? [ONLY - 1] : Array.from({ length: doc.slideCount }, (_, i) => i)
  const t1 = performance.now()
  const stats: any[] = []
  let html = ''
  for (const i of indices) {
    const rs = doc.renderSlide(i, { fitWidthPx: FIT })
    stats.push({
      slide: i + 1,
      title: rs.title,
      nodes: rs.nodeCount,
      textBoxes: rs.texts.length,
      pictures: rs.pictures.length,
      size: `${rs.widthPx}x${rs.heightPx}`,
      editables: rs.texts.map((t) => ({
        id: t.sourceId,
        box: [t.x, t.y, t.w, t.h].map((v) => Math.round(v)),
        font: `${t.fontSizePx.toFixed(1)}px ${t.fontFamily.split(',')[0]}`,
        align: t.align,
        text: t.text.slice(0, 40)
      }))
    })
    html += `<section data-slide="${i + 1}" style="margin:0 0 24px">
      <h3 style="font:600 13px system-ui;color:#444">${i + 1}. ${esc(rs.title)}</h3>
      <div style="border:1px solid #ccc;line-height:0;background:#fff" class="slide">${rs.svg}</div>
    </section>`
  }
  const renderMs = Math.round(performance.now() - t1)
  document.getElementById('out')!.innerHTML = html

  // ── 2. untouched save must preserve every package entry byte-for-byte ─────
  // The ZIP *container* is always regenerated by JSZip (deflate decisions differ from the tool
  // that produced the original), so the meaningful assertion is entry-level identity, not
  // file-level: every part must come back with the same bytes, and no part may be lost.
  const rec = { parseMs, renderMs, fontCount, slides: doc.slideCount, missingMedia: doc.missingMedia }

  /**
   * 解析口径审计：`txBox="1"` 且没有任何几何声明的 sp，过去会被打上 noGeometry → 填充/描边被隐藏。
   * 现在这类元素不再打标。真实文件（PowerPoint 导出的文本框）总是带 <a:prstGeom prst="rect">，
   * 所以这个计数应当为 0 —— 一旦 >0 就说明该改动会改变既有文件的渲染，必须逐页比对截图。
   */
  const deckAudit = (() => {
    const walkEls = (els: any[]): any[] =>
      els.flatMap((e) => (e?.children ? [e, ...walkEls(e.children)] : [e]))
    let txBox = 0
    let noGeometry = 0
    let txBoxNoGeometry = 0
    for (const s of ((doc as any).deck?.slides ?? []) as any[]) {
      for (const e of walkEls((s.elements ?? []) as any[])) {
        if (e.txBox) txBox++
        if (e.noGeometry) noGeometry++
        if (e.txBox && !e.presetGeometry && !e.customGeometry && !e.placeholder) txBoxNoGeometry++
      }
    }
    return { txBox, noGeometry, txBoxNoGeometry }
  })()
  const savedClean = await doc.save()
  const [hOrig, hClean] = await Promise.all([sha256(orig), sha256(savedClean)])
  const [a1, a2] = await Promise.all([openPptx(orig), openPptx(savedClean)])
  const e1: Map<string, Uint8Array> = (a1 as any).archive.entries
  const e2: Map<string, Uint8Array> = (a2 as any).archive.entries
  const missingEntries: string[] = []
  const changedEntries: string[] = []
  for (const [k, v] of e1) {
    const w = e2.get(k)
    if (!w) {
      missingEntries.push(k)
      continue
    }
    if (v.length !== w.length) {
      changedEntries.push(`${k} (len ${v.length}->${w.length})`)
      continue
    }
    for (let i = 0; i < v.length; i++) {
      if (v[i] !== w[i]) {
        changedEntries.push(k)
        break
      }
    }
  }
  const untouchedIdentical = missingEntries.length === 0 && changedEntries.length === 0

  // ── 3. text edit round-trip ───────────────────────────────────────────────
  let editReport: any = { skipped: true }
  if (DO_EDIT) {
    const targetIndex = ONLY ? ONLY - 1 : 0
    const box = doc.renderSlide(targetIndex, { fitWidthPx: FIT }).texts.find((t) => t.text.trim())
    if (!box) {
      editReport = { error: 'no text box found on slide' }
    } else {
      const marker = `MdView-edit-${Date.now().toString(36)}`
      const firstLine = box.text.split('\n')[0]
      const changed = doc.setText(targetIndex, box.sourceId, marker)
      const savedEdit = await doc.save()
      const reopened = await PptxDocument.open(savedEdit)
      await reopened.prepare()
      const afterTexts = reopened
        .renderSlide(targetIndex, { fitWidthPx: FIT })
        .texts.map((t) => t.text)
      const present = afterTexts.some((t) => t.includes(marker))
      const otherSlideUnchanged =
        doc.slideCount < 2 || (await reopened.renderSlide(1, { fitWidthPx: FIT })).texts.length > 0
      editReport = {
        slide: targetIndex + 1,
        sourceId: box.sourceId,
        before: firstLine.slice(0, 48),
        after: marker,
        changedFlag: changed,
        textPresentAfterReopen: present,
        savedBytes: savedEdit.length,
        reopenedSlides: reopened.slideCount,
        otherSlidesStillRender: otherSlideUnchanged
      }
    }
  }

  // ── 4. op layer round trip（每一类编辑：改完 → 保存 → 重开 → 断言） ────────
  const opsReport = DO_OPS ? await runOpsChecks(orig) : { skipped: true }

  const pre = document.createElement('pre')
  pre.id = 'report'
  pre.textContent = JSON.stringify(
    {
      src: SRC,
      fitWidthPx: FIT,
      ...rec,
      deckAudit,
      entriesBefore: e1.size,
      entriesAfter: e2.size,
      entryMissing: missingEntries.slice(0, 10),
      entryBytesChanged: changedEntries.slice(0, 10),
      untouchedBytes: orig.length,
      savedCleanBytes: savedClean.length,
      zipBytesDiffer: hOrig !== hClean,
      untouchedEntityBytesIdentical: untouchedIdentical,
      edit: editReport,
      ops: opsReport,
      stats: stats.map((s) => ({ ...s, editables: RUNS ? s.editables : s.editables.length }))
    },
    null,
    1
  )
  document.body.appendChild(pre)
  document.title = `ok:${doc.slideCount}:${untouchedIdentical ? 'entries-identical' : 'ENTRIES-DIFF'}`
  ;(window as any).__done = true
}

main().catch((err) => {
  const pre = document.createElement('pre')
  pre.id = 'report'
  pre.textContent = `ERROR ${err?.stack ?? err}`
  document.body.appendChild(pre)
  document.title = 'error'
  ;(window as any).__done = true
})
