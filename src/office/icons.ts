/**
 * Ribbon 图标：24×24 线性路径，按命令名映射；未命中回退到通用文本图标。
 * 图形数据集中在此，组件只负责渲染，避免模板里散落 SVG。
 */
export const ICONS: Record<string, string[]> = {
  undo: ['M9 14 4 9l5-5', 'M4 9h9a6 6 0 1 1 0 12h-2'],
  redo: ['M15 14l5-5-5-5', 'M20 9h-9a6 6 0 1 0 0 12h2'],
  painter: ['M4 4h11v6H4z', 'M9 10v4a3 3 0 0 0 6 0v-4', 'M12 17v3'],
  clear: ['M5 7h14', 'M9 7V4h6v3', 'M7 7l1 13h8l1-13'],
  copy: ['M8 8h12v12H8z', 'M4 16V4h12'],
  font: ['M5 19 10 5h1l5 14', 'M7 14h7'],
  size: ['M4 19 9 5h1l5 14', 'M6 14h7', 'M17 10h4', 'M19 8v4'],
  bold: ['M7 5h6a3.5 3.5 0 0 1 0 7H7z', 'M7 12h7a3.5 3.5 0 0 1 0 7H7z'],
  italic: ['M10 5h8', 'M6 19h8', 'M14 5 10 19'],
  underline: ['M7 4v8a5 5 0 0 0 10 0V4', 'M5 20h14'],
  strike: ['M5 12h14', 'M9 7a4 4 0 0 1 7-1', 'M8 17a4 4 0 0 0 8-1'],
  sup: ['M5 15 9 9l4 6', 'M15 6h5', 'M15 9h4'],
  sub: ['M5 9 9 15l4-6', 'M15 17h5', 'M15 20h4'],
  color: ['M12 3a9 9 0 1 0 0 18h1.4a2 2 0 0 0 1.4-3.4 2 2 0 0 1 1.4-3.4H19a2 2 0 0 0 2-2A9 9 0 0 0 12 3z', 'M7 9h.01', 'M10 6h.01', 'M15 7h.01', 'M17 11h.01'],
  highlight: ['M4 21h16', 'M8 17h8', 'M9 4l8 8-4 4-8-8z'],
  'align-left': ['M4 6h16', 'M4 10h10', 'M4 14h16', 'M4 18h10'],
  'align-center': ['M4 6h16', 'M7 10h10', 'M4 14h16', 'M7 18h10'],
  'align-right': ['M4 6h16', 'M10 10h10', 'M4 14h16', 'M10 18h10'],
  justify: ['M4 6h16', 'M4 10h16', 'M4 14h16', 'M4 18h16'],
  style: ['M4 5h16v14H4z', 'M7 9h10', 'M7 13h7'],
  line: ['M4 6h16', 'M4 12h16', 'M4 18h16', 'M18 4v4', 'M18 16v4'],
  list: ['M9 6h12', 'M9 12h12', 'M9 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  numbered: ['M9 6h12', 'M9 12h12', 'M9 18h12', 'M4 5h1v4', 'M4 12h2l-2 3h2'],
  indent: ['M4 6h16', 'M4 12h9', 'M4 18h16', 'M14 10l3 2-3 2'],
  find: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M16 16l4 4'],
  'select-all': ['M4 4h16v16H4z', 'M8 8h8v8H8z'],
  table: ['M3 5h18v14H3z', 'M3 10h18', 'M3 15h18', 'M9 5v14', 'M15 5v14'],
  row: ['M3 5h18v14H3z', 'M3 12h18', 'M6 8h2', 'M6 16h2'],
  column: ['M3 5h18v14H3z', 'M12 5v14', 'M8 8v2', 'M16 8v2'],
  merge: ['M3 6h18v12H3z', 'M8 12h8', 'M12 8v8'],
  border: ['M4 4h16v16H4z', 'M12 4v16', 'M4 12h16'],
  shade: ['M4 4h16v16H4z', 'M4 14l5-5 4 4 3-3 4 4'],
  image: ['M3 5h18v14H3z', 'M7 15l3-3 3 3 3-4 4 5', 'M8 9h.01'],
  link: ['M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1', 'M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1'],
  'page-break': ['M6 3h9l4 4v14H6z', 'M3 12h4', 'M17 12h4', 'M15 3v5h4'],
  header: ['M5 3h14v18H5z', 'M8 7h8', 'M8 11h5'],
  footer: ['M5 3h14v18H5z', 'M8 16h8', 'M8 12h5'],
  paper: ['M6 3h9l4 4v14H6z', 'M15 3v5h4', 'M9 12h6', 'M9 16h6'],
  margin: ['M4 4h16v16H4z', 'M8 8h8v8H8z'],
  columns: ['M4 5h7v14H4z', 'M13 5h7v14h-7z'],
  tracking: ['M3 12h4l2-5 3 10 2-5h7'],
  comment: ['M4 4h16v12H9l-5 4z', 'M8 9h8', 'M8 12h5'],
  zoom: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M16 16l4 4', 'M8 11h6', 'M11 8v6'],
  view: ['M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  fit: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  formula: ['M5 20 9 4', 'M9 11h7', 'M6 15h6', 'M15 8l4 8', 'M14 12h6'],
  sum: ['M6 4h12l-7 8 7 8H6l7-8z'],
  sort: ['M7 4v16', 'M4 17l3 3 3-3', 'M17 20V4', 'M14 7l3-3 3 3'],
  freeze: ['M12 3v18', 'M3 12h18'],
  grid: ['M3 3h18v18H3z', 'M3 9h18', 'M3 15h18', 'M9 3v18', 'M15 3v18'],
  sheet: ['M4 3h16v18H4z', 'M4 9h16', 'M10 9v12'],
  percent: ['M6 18 18 6', 'M7 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z', 'M17 13a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'],
  currency: ['M12 3v18', 'M7 7h10', 'M7 11h10', 'M16 7l-4 5 4 5'],
  wrap: ['M4 6h16', 'M4 12h12a3 3 0 0 1 0 6h-3', 'M15 15l-2 3 2 3'],
  shape: ['M4 6h10l6 6-10 6-6-6z', 'M4 6l6 6 10 0'],
  order: ['M7 4h12v12H7z', 'M4 8h11v11H4z'],
  slide: ['M3 4h18v12H3z', 'M12 16v4', 'M8 20h8'],
  present: ['M3 5h18v11H3z', 'M12 16v3', 'M8 20h8', 'M10 9l2 3 2-3'],
  rotate: ['M12 4a8 8 0 1 1-8 8', 'M4 4v5h5'],
  anchor: ['M4 5h16', 'M4 19h16', 'M8 9h8v6H8z'],
  symbol: ['M6 6h12v12H6z', 'M9 12h6', 'M12 9v6'],
  note: ['M5 4h14v16H5z', 'M8 8h8', 'M8 12h8'],
  generic: ['M4 6h16', 'M4 12h16', 'M4 18h10']
}

const BY_CMD: Record<string, string> = {
  undo: 'undo', redo: 'redo', painter: 'painter', copyFormat: 'copy', clearFormat: 'clear',
  setFont: 'font', setSize: 'size', format: 'font', toggle: 'bold', sup: 'sup', sub: 'sub',
  setColor: 'color', setHighlight: 'highlight', applyStyle: 'style', setLine: 'line',
  setAlign: 'align-left', toggleList: 'list', indent: 'indent', find: 'find', replace: 'find',
  selectAll: 'select-all', insertTable: 'table', tableOp: 'row', mergeCells: 'merge',
  unmergeCell: 'merge', distributeColumns: 'column', setCellShade: 'shade', setCellBorders: 'border',
  setCellVAlign: 'anchor', insertImage: 'image', replaceImage: 'image', insertLink: 'link',
  insertPageBreak: 'page-break', setHeader: 'header', setFooter: 'footer', pageNumber: 'header',
  clearHeader: 'header', clearFooter: 'footer', setPage: 'paper', tracking: 'tracking',
  gotoChange: 'find', reviewChange: 'tracking', addComment: 'comment', listComments: 'comment',
  updateStyle: 'style', deleteSelection: 'clear', setZoom: 'zoom', readMode: 'view',
  fitWidth: 'fit', rows: 'row', merge: 'merge', toggleWrap: 'wrap', decimals: 'size',
  rowHeight: 'row', colWidth: 'column', freeze: 'freeze', fillDir: 'sort', sort: 'sort',
  clearCells: 'clear', insertFunc: 'formula', focusFormula: 'formula', recalc: 'rotate',
  bookOp: 'sheet', switchSheet: 'sheet', gridlines: 'grid', addSlide: 'slide',
  duplicate: 'copy', deleteSlide: 'clear', moveSlide: 'sort', hidden: 'view',
  insertShape: 'shape', order: 'order', duplicateShape: 'copy', deleteShape: 'clear',
  shapeFill: 'shade', shapeLine: 'border', shapeLineWidth: 'line', shapeDash: 'line',
  slideBg: 'shade', anchor: 'anchor', setView: 'view', fit: 'fit', presentFrom: 'present',
  alignOn: 'align-center', imageScale: 'image', setAltText: 'comment', insertText: 'symbol',
  unsupported: 'note', unsupportedInfo: 'note'
}

const BY_LABEL: [RegExp, string][] = [
  [/^[BIUS]$/, 'bold'], [/左|居左/, 'align-left'], [/^中$|居中/, 'align-center'], [/右|居右/, 'align-right'], [/两端/, 'justify'],
  [/百分|%/, 'percent'], [/货币|¥|\$/, 'currency'], [/千分位/, 'size'], [/缩放/, 'zoom'], [/视图|阅读|浏览|放映|普通/, 'view'],
  [/网格线/, 'grid'], [/形状/, 'shape'], [/冻结/, 'freeze'], [/数字格式|行距|线型|边框|边框线/, 'border'],
  [/查找|替换/, 'find'], [/批注|修订|审阅/, 'comment'], [/图片|插图/, 'image'], [/表格/, 'table'],
  [/上标/, 'sup'], [/下标/, 'sub'], [/全选/, 'select-all'], [/样式/, 'style'], [/字号|字体/, 'font'],
  [/工作表|切换/, 'sheet'], [/Σ|函数|公式|SUM|IF|VLOOKUP/, 'formula'], [/升序|降序|排序|填充/, 'sort'],
  [/旋转|合并/, 'merge'], [/纸张|页边距|分栏|纵向|横向/, 'paper'], [/页眉|页脚|页码/, 'header'],
  [/上移|下移|左移|右移|置于|层/, 'order'], [/颜色|填充|底纹|背景/, 'color'], [/高亮/, 'highlight'],
  [/符号/, 'symbol'], [/链接/, 'link'], [/缩放|适应/, 'fit'], [/新建|复制|删除/, 'copy']
]

const BY_TEXT: Record<string, string> = {
  B: 'bold', I: 'italic', U: 'underline', S: 'strike',
  左: 'align-left', 中: 'align-center', 右: 'align-right', 两端: 'justify',
  上: 'align-left', 下: 'align-right', '•': 'list', '1.': 'numbered',
  '↶': 'undo', '↷': 'redo', '🖌': 'painter', '⌫': 'clear',
  '⇤': 'indent', '⇥': 'indent', '%': 'percent'
}

/** 标签精确匹配优先（同一命令多种按钮），其次命令名，再关键词，最后通用图标 */
export function iconFor(cmd: string, label: string): string[] {
  const key = BY_TEXT[label] ?? BY_CMD[cmd] ?? BY_LABEL.find(([re]) => re.test(label))?.[1] ?? 'generic'
  return ICONS[key] ?? ICONS.generic
}
