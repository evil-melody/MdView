/**
 * PPTX 演讲者备注：`ppt/notesSlides/notesSlideN.xml`，文本在 body 占位符（p:ph type="body"）的
 * DrawingML 段落里。编辑写回该 part；不存在时新建 part + rels + Content_Types 登记。
 * 第四批：包内没有 notesMaster 时按 OOXML 新建 `ppt/notesMasters/notesMasterN.xml`
 * （+ 指向 theme 的 rels + Content_Types Override），并在 presentation.xml 的
 * `notesMasterIdLst` 登记、presentation.xml.rels 补 notesMaster 关系；notesSlide rels
 * 一定补一条 notesMaster 关系。保证新建备注后 save→重开、包结构合规。
 */
import { dirOf, OpcPackage, relOfType, relativeTarget, relsPathFor, type Rels } from '../opc'
import { clone, el, escText, getAttr, isNode, kidOf, kidsOf, local, parseRaw, prefixOf, relIdAttrs, rootEl, serialize, walkOoxml, type RChild, type RNode } from '../raw'
import { kid, kids, path, textOf, type XEl } from '../xml'
import type { SlideModel } from './types'
import type { PptxPresentation } from './parser'

const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NOTES_REL = RNS + '/notesSlide'
const NOTESMASTER_REL = RNS + '/notesMaster'
const THEME_REL = RNS + '/theme'
const SLIDE_REL = RNS + '/slide'
const NOTES_CT = 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml'
const NOTES_MASTER_CT = 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml'
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'

/** body 占位符的纯文本（XEl / parser 侧）：段落以 \n 连接（与视图内容编辑器的行语义一致） */
function bodyLinesX(sp: XEl): string {
  return kids(kid(sp, 'txBody'), 'p')
    .map((p) =>
      p.c
        .map((c) => {
          if (c.n === 'r' || c.n === 'fld') return textOf(kid(c, 't'))
          if (c.n === 'br') return '\n'
          return ''
        })
        .join(''),
    )
    .join('\n')
}

function phTypeX(sp: XEl): string {
  return path(sp, 'nvSpPr', 'nvPr', 'ph')?.a.type ?? ''
}

function phTypeR(sp: RNode): string {
  const ph = kidOf(kidOf(kidOf(sp, 'nvSpPr'), 'nvPr'), 'ph')
  return ph ? getAttr(ph, 'type') ?? '' : ''
}

/** 读取一页的备注文本；没有 notesSlide part 时返回 undefined */
export async function readNotes(pkg: OpcPackage, slidePath: string, slideRels: Rels): Promise<string | undefined> {
  const rel = relOfType(slideRels, 'notesSlide')
  if (!rel || rel.external || !pkg.has(rel.target)) return undefined
  const root = await pkg.xml(rel.target)
  if (!root) return undefined
  const tree = path(root, 'cSld', 'spTree')
  if (!tree) return undefined
  let fallback = ''
  for (const sp of kids(tree, 'sp')) {
    if (phTypeX(sp) === 'body') return bodyLinesX(sp)
    const txt = bodyLinesX(sp)
    if (txt && !fallback) fallback = txt
  }
  return fallback
}

/** 重建（或创建）body 占位符的段落：一行一段，保留首个 run 的 rPr 作模板 */
function writeBodyParas(sp: RNode, text: string, A: string): void {
  let tx = kidOf(sp, 'txBody')
  if (!tx) {
    tx = el('p:txBody', {}, [el(A + 'bodyPr'), el(A + 'lstStyle')])
    sp.c.push(tx)
    sp.self = false
  }
  const paras = kidsOf(tx, 'p')
  let rPr: RNode | undefined
  for (const p of paras) {
    rPr = kidOf(kidsOf(p, 'r')[0], 'rPr')
    if (rPr) break
  }
  const endR = paras.map((p) => kidsOf(p, 'endParaRPr')[0]).find(Boolean)
  const out = text.split('\n').map((line) => {
    const p = el(A + 'p')
    if (line) p.c.push(el(A + 'r', {}, [rPr ? clone(rPr) : el(A + 'rPr', { lang: 'en-US', dirty: '0' }), el(A + 't', {}, [escText(line)])]))
    p.c.push(endR ? clone(endR) : el(A + 'endParaRPr', { lang: 'en-US', dirty: '0' }))
    return p
  })
  tx.c = [...tx.c.filter((c) => !(isNode(c) && local(c.q) === 'p')), ...out]
  tx.self = false
}

const notesXml = (text: string) => {
  const paras = text
    .split('\n')
    .map((line) =>
      line
        ? `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escText(line)}</a:t></a:r></a:p>`
        : '<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>',
    )
    .join('')
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<p:notes xmlns:a="${NS_A}" xmlns:r="${RNS}" xmlns:p="${NS_P}"><p:cSld><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>` +
    `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>` +
    `<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>` +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`
  )
}

/** 文档里 DrawingML 内容的前缀（找不到时回退 a:） */
function aPrefix(nodes: RChild[]): string {
  let a = ''
  for (const n of nodes) {
    if (!isNode(n)) continue
    walkOoxml(n, (c) => {
      if (!a && /:(off|ext|t|p|bodyPr|rPr)$/.test(c.q)) a = prefixOf(c.q)
      return !!a
    })
  }
  return a || 'a:'
}

/** 最小合法的 p:notesMaster：cSld（空 spTree）+ clrMap（PowerPoint 必需） */
function notesMasterXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<p:notesMaster xmlns:a="${NS_A}" xmlns:r="${RNS}" xmlns:p="${NS_P}">` +
    `<p:cSld><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    `</p:spTree></p:cSld>` +
    `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    `</p:notesMaster>`
  )
}

/** 找包内已有的 theme part（notesMaster rels 复用它：多个 part 指向同一 theme 合法） */
async function existingThemePart(pkg: OpcPackage, mainPath: string): Promise<string | undefined> {
  const presRels = await pkg.rels(mainPath)
  const direct = relOfType(presRels, 'theme')
  if (direct && !direct.external && pkg.has(direct.target)) return direct.target
  const sm = relOfType(presRels, 'slideMaster')
  if (sm && !sm.external && pkg.has(sm.target)) {
    const t = relOfType(await pkg.rels(sm.target), 'theme')
    if (t && !t.external && pkg.has(t.target)) return t.target
  }
  for (let i = 1; i <= 30; i++) {
    const p = `ppt/theme/theme${i}.xml`
    if (pkg.has(p)) return p
  }
  return undefined
}

/** 在 presentation.xml 登记 notesMasterIdLst（不存在 / 空时补），schema 位置在 sldMasterIdLst 后、sldIdLst 前 */
async function registerNotesMasterId(pres: PptxPresentation, rid: string): Promise<void> {
  const main = pres.mainPath
  const before = await pres.pkg.text(main)
  const nodes = parseRaw(before)
  const root = rootEl(nodes)
  if (!root) return
  const P = prefixOf(root.q)
  const lst = kidsOf(root, 'notesMasterIdLst')[0]
  if (lst && kidsOf(lst, 'notesMasterId').length) return // 已登记，幂等
  const newLst = el(P + 'notesMasterIdLst', {}, [el(P + 'notesMasterId', relIdAttrs(root, 'id', rid))])
  if (lst) root.c.splice(root.c.indexOf(lst), 1)
  let at = -1
  root.c.forEach((c, i) => { if (isNode(c) && local(c.q) === 'sldMasterIdLst') at = i })
  if (at >= 0) root.c.splice(at + 1, 0, newLst)
  else {
    const sld = root.c.findIndex((c) => isNode(c) && local(c.q) === 'sldIdLst')
    root.c.splice(sld >= 0 ? sld : root.c.length, 0, newLst)
  }
  root.self = false
  pres.pkg.setPart(main, serialize(nodes))
}

/** 确保包内存在 notesMaster，返回其 part 路径。优先级：
 *  ① presentation.xml.rels 已有 notesMaster 关系且 part 在 → 直接复用；
 *  ② 包里已有 notesMaster part（关系缺失）→ 补关系 + notesMasterIdLst 登记后复用；
 *  ③ 全新创建 part + rels（指向现有 theme）+ Content_Types Override + presentation 关系/登记。 */
async function ensureNotesMaster(pres: PptxPresentation): Promise<string> {
  const pkg = pres.pkg
  const main = pres.mainPath
  const rel = relOfType(await pkg.rels(main), 'notesMaster')
  if (rel && !rel.external && pkg.has(rel.target)) return rel.target
  for (let i = 1; i <= 30; i++) {
    const p = `ppt/notesMasters/notesMaster${i}.xml`
    if (!pkg.has(p)) continue
    const rid = await pkg.addRel(main, NOTESMASTER_REL, p)
    await registerNotesMasterId(pres, rid)
    return p
  }
  const path = pkg.freeName('ppt/notesMasters', 'notesMaster', 'xml')
  pkg.setPart(path, notesMasterXml())
  await pkg.setContentType(path, NOTES_MASTER_CT)
  const theme = await existingThemePart(pkg, main)
  let relsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  if (theme) relsXml += `<Relationship Id="rId1" Type="${THEME_REL}" Target="${relativeTarget(dirOf(path), theme)}"/>`
  relsXml += `</Relationships>`
  pkg.setPart(relsPathFor(path), relsXml)
  const rid = await pkg.addRel(main, NOTESMASTER_REL, path)
  await registerNotesMasterId(pres, rid)
  return path
}

/** 写回一页的演讲者备注（无 notesSlide 时创建 part + rels + Content_Types，并确保 notesMaster），返回刷新后的页模型 */
export async function setNotes(pres: PptxPresentation, index: number, text: string): Promise<SlideModel> {
  const info = pres.meta.slides[index]
  if (!info) throw new Error(`No slide #${index}`)
  const rels = await pres.pkg.rels(info.path)
  const rel = relOfType(rels, 'notesSlide')
  if (rel && !rel.external && pres.pkg.has(rel.target)) {
    const before = await pres.pkg.text(rel.target)
    const nodes = parseRaw(before)
    const tree = kidOf(kidOf(rootEl(nodes), 'cSld'), 'spTree')
    let body: RNode | undefined
    if (tree) {
      for (const sp of kidsOf(tree, 'sp')) if (phTypeR(sp) === 'body') { body = sp; break }
      if (!body) {
        // 极少数 notesSlide 没有 body 占位符：补一个最小的
        body = parseRaw(
          `<p:sp><p:nvSpPr><p:cNvPr id="99" name="Notes Placeholder"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>` +
          `<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/></p:txBody></p:sp>`,
        )[0] as RNode
        tree.c.push(body)
        tree.self = false
      }
    }
    if (body) writeBodyParas(body, text, aPrefix(nodes))
    const after = serialize(nodes)
    if (after !== before) {
      pres.pkg.setPart(rel.target, after)
      pres.touched = true
    }
  } else {
    const p = pres.pkg.freeName('ppt/notesSlides', 'notesSlide', 'xml')
    pres.pkg.setPart(p, notesXml(text))
    await pres.pkg.setContentType(p, NOTES_CT)
    // 第四批：确保 notesMaster（无则新建全套），notesSlide rels 一定补 notesMaster 关系
    const nm = await ensureNotesMaster(pres)
    let relsXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${SLIDE_REL}" Target="${relativeTarget(dirOf(p), info.path)}"/>` +
      `<Relationship Id="rId2" Type="${NOTESMASTER_REL}" Target="${relativeTarget(dirOf(p), nm)}"/>`
    relsXml += `</Relationships>`
    pres.pkg.setPart(relsPathFor(p), relsXml)
    await pres.pkg.addRel(info.path, NOTES_REL, p)
    pres.touched = true
  }
  return pres.slide(index)
}
