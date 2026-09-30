// @ts-nocheck
import './core-ops'
import './text-ops'
import './element-ops'
import './insert-ops'
import './table-ops'
import './slide-ops'
import './arrange-ops'
import './animation-ops'
// MdView: equation-ops 未 vendored —— 它依赖 @genoffice/docx-engine/math（1115 行 + xml-utils
// 链），而 MdView 的 pptx 编辑器不提供公式插入入口。移除这两个 import 后，op 词汇表里
// insertEquation 只有文档没有 handler（dryRun 才会暴露），其余 op 全部可用。
export { listSlideAnimations, type AnimationEntry } from './animation-ops'
export { runTxn, type TxnRequest, type TxnResult, type OpFailure } from './executor'
export { normalizeLengthUnits, parseLength } from './units'
export {
  elementDurableId,
  GuidedError,
  opNames,
  register,
  resolveGroupChildId,
  slideDurableId,
  type Op,
  type OpRecord,
  type OpTarget,
} from './registry'
