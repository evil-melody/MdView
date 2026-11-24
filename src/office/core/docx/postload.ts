/**
 * PostLoadPrepare 二段装配（路线图 P7）。sdkjs 来源：word/Editor/Serialize2.js:8166-8340
 * （PostLoadPrepare 全函数）+ :8149-8163（PostLoadPrepareCheckStylesRecursion 灰标法）。
 *
 * sdkjs 全函数六件事；MdView 的读取模型（StyleSheet 单源吃 styles.xml，无「引擎既有样式
 * + 文档读出样式」双源合并）让三件事天然作废、三件事保留：
 *
 *  作废（双源合并产物 / 非 OOXML 面）：
 *   - 同名样式删除 + oIdRenameMap 重映射（BasedOn/Next/Link 指向替换，:8191-8258）；
 *   - 编号重映射（updateNumPrLinks，:8171）——MdView numbering.ts 直读 numbering.xml 单源；
 *   - qFormat 补齐（CurFileVersion<2，:8175-8178）——.docser 版本门控，OOXML 面不存在
 *     （compat.ts 头注已裁决）；脚注/尾注重置（:8317-8340）——MdView 不建模脚注内容。
 *
 *  保留 1：四个缺省样式补建（:8281-8312）。sdkjs 按归一化名字（:8188 toLowerCase+去空白）
 *  查快照，缺失则 new CStyle + Create*：
 *     - "Normal"（paragraph）：CreateNormal = SetQFormat(true)（Styles.js:6728-6731）；
 *     - "Default Paragraph Font"（character）：uiPriority 1 + semiHidden +
 *       unhideWhenUsed（:6735-6740）；
 *     - "No List"（numbering）：uiPriority 99 + semiHidden + unhideWhenUsed（:6744-6749）；
 *     - "Normal Table"（table）：uiPriority 99 + semiHidden + unhideWhenUsed + tblCellMar
 *       左右 108dxa=5.4pt（Create_NormalTable :792-824）。
 *  **Normal Table 不可省**——表距是两层语义（Get_Pr case styletype_Table :8116-8148）：
 *     种子 = Default.TablePr.InitDefault(mode)（compat 门控，≤Word12 → 0.5pt；否则 5.4pt）
 *     → 链 merge（无 tblStyle 时 StyleId 落 Default.Table = Normal Table，其 tblCellMar
 *       5.4pt 覆盖种子）。
 *     推论：无样式表恒 5.4pt（Normal Table 赢种子）；**自定义表样式缺 cellMar** 时才吃到
 *     compat 种子（Word12 文档 → 0.5pt）。MdView 接线 = 种子 compat 化（parser.ts:615）
 *     + Normal Table 缺失时注入（本函数）——两层缺一层就分歧。
 *  sdkjs 构造器永远预建 Normal Table（:7365-7367）且快照含它，PostLoad 实际只补其余三个；
 *  MdView 无构造器预建，四个全走 ensure——终态等价。
 *  ponytail 残余：sdkjs 保存时把引擎全部内置样式（Table Grid/Plain Table 1~5/Grid Table…）
 *  写回 styles.xml；MdView 写回只含文件原有+编辑器新增。内置样式全量写回属写回保真议题，
 *  不在 P7 计算面范围。
 *
 *  保留 2：灰标法环检测（:8149-8163 直译）。三色语义（逐行核对原文）：
 *     `if (0 != stylesGrey)` —— **undefined（未访问）与 1（visiting）都进分支**，
 *     0（done）整体跳过；
 *     进分支后 `if (1 == stylesGrey) Set_BasedOn(null)` —— **切断只发生在 visiting 态**
 *     （递归途中重入 = 环成员），不是 done 态；
 *     else（未访问）：BasedOn 存在 → 标 1 → 递归 BasedOn → 标 0；BasedOn 为 null → 直接标 0。
 *  轨迹：A→B→A 环 → visit A(1) → visit B(1) → 重入 A=visiting → **切 A.BasedOn** → B 标 0
 *  → A 标 0；终态 A.BasedOn=null、B.BasedOn=A（链 B→A→∅ 有限）。第三方 C→A：A 已 done(0)
 *  时 visit C 递归到 A 整体跳过，C.BasedOn=A 保留——环已在 A 处切断，C 的链有限无需再切。
 *  灰标法的职责 = 每个环恰好切断一处（最先被重入的成员），其余保留。
 *  本函数纯函数化：返回需切断的 styleId 集合，接线方（StyleSheet）据此把对应 def 的
 *  basedOn 视为 undefined（计算面断链；文件面透传不动）。
 */
import type { XEl } from '../xml'

/** XEl 构造（本地名口径，与 parseXml 产物同构——StyleSheet.readDef 读的全是本地名） */
function xe(n: string, a: Record<string, string> = {}, c: XEl[] = []): XEl {
  return { n, a, c, t: '' }
}

/** sdkjs :8188 名字归一化 */
export function normStyleName(name: string): string {
  return name.toLowerCase().replace(/\s/g, '')
}

export interface DefaultStyleSpec {
  id: string
  type: 'paragraph' | 'character' | 'numbering' | 'table'
  name: string
  el: XEl
}

/**
 * 文档样式表缺失的缺省样式合成（形态逐条对 Styles.js Create* 系列）。
 * existingNames = styles.xml 全部 w:style 的 w:name @val 原文（本函数内部归一化）。
 */
export function missingDefaultStyles(existingNames: Iterable<string>): DefaultStyleSpec[] {
  const have = new Set([...existingNames].map(normStyleName))
  const out: DefaultStyleSpec[] = []
  const add = (id: string, type: DefaultStyleSpec['type'], name: string, children: XEl[]) => {
    if (have.has(normStyleName(name))) return
    out.push({
      id,
      type,
      name,
      el: xe('style', { type, styleId: id, default: '1' }, [xe('name', { val: name }), ...children]),
    })
  }
  // Normal：qFormat（CreateNormal，Styles.js:6728-6731）
  add('normal', 'paragraph', 'Normal', [xe('qFormat')])
  // Default Paragraph Font：uiPriority 1 + semiHidden + unhideWhenUsed（:6735-6740）
  add('DefaultParagraphFont', 'character', 'Default Paragraph Font', [
    xe('uiPriority', { val: '1' }),
    xe('semiHidden'),
    xe('unhideWhenUsed'),
  ])
  // No List：uiPriority 99 + semiHidden + unhideWhenUsed（:6744-6749）
  add('NoList', 'numbering', 'No List', [
    xe('uiPriority', { val: '99' }),
    xe('semiHidden'),
    xe('unhideWhenUsed'),
  ])
  // Normal Table：uiPriority 99 + semiHidden + unhideWhenUsed + tblCellMar 左右 108dxa
  // =5.4pt（Create_NormalTable :792-824；1.9mm ≈ 5.4pt，dxa=pt*20）
  add('NormalTable', 'table', 'Normal Table', [
    xe('uiPriority', { val: '99' }),
    xe('semiHidden'),
    xe('unhideWhenUsed'),
    xe('tblPr', {}, [
      xe('tblCellMar', {}, [
        xe('top', { w: '0', type: 'dxa' }),
        xe('left', { w: '108', type: 'dxa' }),
        xe('bottom', { w: '0', type: 'dxa' }),
        xe('right', { w: '108', type: 'dxa' }),
      ]),
    ]),
  ])
  return out
}

/**
 * 灰标法环检测（:8149-8163 直译，纯函数化）。
 * links：styleId → basedOn（undefined = 无 BasedOn）。basedOn 指向不在表内的 id 时按
 * sdkjs 同径（styles[stId] 为 null → 什么都不做，不标灰）——本实现等价：缺失 id 的
 * grey 状态不影响切断集合（无 BasedOn 可切，重入也无操作）。
 * 返回需切断 BasedOn 的 styleId 集合。
 */
export function cutBasedOnCycles(links: Map<string, string | undefined>): Set<string> {
  const grey = new Map<string, number>()
  const cut = new Set<string>()
  const visit = (stId: string): void => {
    const g = grey.get(stId)
    if (g === 0) return // done：整体跳过（0 != stylesGrey 为假）
    if (g === 1) {
      // visiting：重入 = 环成员，切断（Set_BasedOn(null)）
      cut.add(stId)
      return
    }
    // 未访问：标 1 → 递归 BasedOn → 标 0；BasedOn 缺失（undefined 或不在表内）→ 标 0 即止
    const basedOn = links.get(stId)
    if (basedOn !== undefined && links.has(basedOn)) {
      grey.set(stId, 1)
      visit(basedOn)
      grey.set(stId, 0)
    } else {
      grey.set(stId, 0)
    }
  }
  for (const stId of links.keys()) visit(stId)
  return cut
}