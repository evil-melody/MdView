/**
 * Ribbon 命令选区兜底。
 *
 * RichInput.sel() 在选区变化后靠 requestAnimationFrame 才刷新 lastSel；点 ribbon 按钮 /
 * 弹出菜单 / 原生文件选择器时 contenteditable 会失焦，实时选区可能为空或落到正文段落，
 * 于是 tableOp/mergeCells/insertImages 等命令静默早退。这里在 pointerdown 捕获阶段
 * （任何控件抢焦点之前）同步快照最后一个有效选区，命令据此兜底。
 */
import type { Sel } from '../edit/rich'

export interface SelSource {
  readSel(): Sel | null
  lastSel: Sel | null
}

export class SelSnapshot {
  private cached: Sel | null = null
  private readonly onDown = (e: PointerEvent) => {
    if (!e.isTrusted) return
    const live = this.src.readSel()
    if (live) this.cached = live
    else if (this.src.lastSel) this.cached = this.src.lastSel
  }

  constructor(private readonly src: SelSource) {
    document.addEventListener('pointerdown', this.onDown, true)
  }

  /** 实时选区不可用（或不在表格单元格内）时用它兜底 */
  fallback(): Sel | null {
    return this.cached
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.onDown, true)
  }
}
