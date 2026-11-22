<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="MdView：本地文件与 Markdown 一体化工作台，多页签预览编辑，Office 三格式由统一引擎原生编辑并写回原文件">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" alt="Tauri 2">
  <img src="https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white" alt="Vue 3">
  <img src="https://img.shields.io/badge/Rust-stable-DEA584?logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/Office-内核内置-7C5CFF" alt="Office 内核内置">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License">
</p>

**一个窗口管完本地资料库**：扫描目录、分类检索、多页签打开，Markdown / Word / Excel / PPT / PDF / 图片直接预览与编辑，保存写回原文件。文件内容不上传；链接导入与可选的 AI 能力才走网络。

<p align="center">
  <img src="./assets/readme/workflow.svg" width="100%" alt="工作流：扫描索引 → 多页签常驻 → 编辑与写回 → 本地智能，文件内容不上传">
</p>

## 一眼看懂

| 你想做的事 | MdView 怎么做 |
|---|---|
| 打开一堆本地文件 | 多资料库目录递归索引、13 类分类导航、最近更新、文件名与内容搜索 |
| 写 Markdown | 预览 / 编辑 / 脑图三模式，mermaid、markmap、粘贴截图、查找替换、大纲跳转 |
| 改 Word / Excel / PPT | `docx / xlsx / pptx` 统一走项目内置 Office 内核（Vue 视图 + Worker 流式解析），三格式可编辑并配 Ribbon 工具栏，导出字节直接覆盖原路径 |
| 改 PDF | 非扫描件可点选改文字、粘贴 / 复制 / 提取图片；新字沿用文档自带字体、原墨色与原基线，只重绘改动字符；保存直接覆盖原 PDF，扫描件只读 |
| 看图片 / 音视频 | 内嵌预览，图片滚轮缩放与拖拽平移 |
| 长行看着累 | 内容区右键「内容自动换行」开关，CodeMirror / 文本 / 代码预览 / Markdown / Word / PPT / 表格 / PDF 输入框统一生效，偏好本地持久化 |
| 改 HTML | 原生 iframe 预览 + CodeMirror 编辑，压缩源码自动排版 |
| 换个格式 | 以 Markdown 为枢纽的转格式矩阵，PDF 走前端所见即所得导出 |
| 找重复图片 | Rust 端 dHash 感知哈希本地归组，不依赖 AI |
| 让 AI 帮忙 | 可选 OpenAI 兼容接口：流式摘要 / 打标 / 解读、批量摘要缓存 |
| 打开超大 SQL / 日志 | 超过 5 MB 不再报「文件过大」：Rust 按 512 KB 字节区间读、前端跨块拼 UTF-8，CodeMirror 分片追加流式只读预览，带进度条 |
| 反复切大文件页签 | 每个页签常驻一个引擎实例；大纲 / Markdown 渲染结果按页签缓存，隐藏态不触发分页重测量，保存后指纹基线同步，往返切换只切显示 |

## 这是什么

MdView 是 Tauri 2 桌面应用：Vue 3 前端负责界面与编辑器，Rust 后端负责文件扫描、索引、Office→Markdown 枢纽、图片指纹、AI 流式代理与网页导入。所有文件操作在本机完成；配置文件与缓存落在 `config_dir/MdView/`。

Office 与 PDF 的预览 / 编辑不经过 Rust 的 Markdown 枢纽——前端引擎直接读写字节，保存覆盖原路径。Rust 的 `office.rs` 仍服务于批量 AI 摘要、格式转换与搜索内容抽取。

---

## 功能全景

### 资料库与文件管理

- **多资料库目录**：侧栏、首页、资料库弹窗三处添加；移除需二次确认且只注销不删盘；树节点 ✕ 快捷移除
- **扫描与索引**：单层目录扫描 + 全库递归索引（深度上限 6，跳过 `.` / `node_modules` / `target` / `dist` / `vendor`）；隐藏文件与内部临时产物自动过滤
- **分类导航**：Markdown / 文档 / 表格 / 演示 / PDF / 图片 / 文本 / 代码 / 配置 / 压缩包 / 音视频 / 其他，带计数；最近更新取前 200
- **搜索**：文件名 + 正文 `contains` 扫描（搜索深度上限 12），结果并入 AI 摘要文本命中；侧栏树输入即过滤（220ms 防抖、渲染上限 400）
- **新建文件**：8 种类型（md / txt / json / yaml / toml / ini / html / sh），大小写不敏感查重，默认落当前目录，创建后直接进编辑
- **链接导入文章**：贴入网页链接生成 `.md` 或 `.html`；正文图片本地化到 `<文档名>.assets/`（60 张 / 20MB 上限），附件按白名单与 40 / 100 / 500MB 分级限制，微信视频号链接转为离线可播放块；HTML 模式保留原页面内联样式
- **另存为**：原生保存弹窗，落盘后页签跟随新文件（Office 文件不提供此按钮）
- **右键菜单**：打开 / 打开所在目录 / 在 Finder 中显示 / 复制路径 / 转格式… / 删除（二次确认）
- **打开方式**：Finder 拖入文件、系统文件关联冷启动（md / markdown / mdx / txt / pptx）、首页快捷入口
- **联动**：右侧增删改、新建、另存为、粘贴截图、转换后左侧树自动重扫并保留展开态；激活页签自动展开目录链并滚动高亮
- **外部改动同步**：每 3 秒按 `size:mtime` 指纹轮询当前页签；有未保存改动时只打标点不覆盖，手动 / 自动刷新后清标点；侧栏整体刷新 + 页头 ↻ 刷新文档
- **页签条**：横向滚轮滚动、无原生滚动条、左右淡出提示；脏 / 外部变更标点；右键「关闭 / 关闭其他 / 关闭右侧 / 全部关闭」，批量关闭脏页签一次确认

### 预览与编辑

| 格式 | 预览 | 编辑 | 实现 |
|---|---|---|---|
| Markdown / 文本 | ✅ | ✅ | marked + DOMPurify；预览态可所见即所得编辑，编辑态左 textarea + 右实时预览、双向滚动同步 |
| mermaid / markmap | ✅ | — | 流程图随主题重渲染；除 ` ```mermaid ` 外，` ```flowchart TB ` / ` ```graph ` / ` ```sequenceDiagram ` 等标注（含内容开头关键字）也按 mermaid 渲染；脑图一键生成，大纲侧栏点击跳转 |
| 数学公式（块级 `$…$`） | ✅ | — | KaTeX 渲染 `$$ C = \frac{a}{b} $$` 之类块级公式，独立居中块；源码中的 `$$` 与 mermaid/pre 代码块先做占位保护，不会误伤 |
| 代码 / 配置 / HTML | ✅ | ✅ | CodeMirror：行号、语法高亮、补全、括号匹配、查找替换、Tab 缩进、字数统计；HTML 另有格式化按钮与压缩源码自动排版 |
| 超大文本（> 5 MB，含 `.sql`） | ✅ 流式只读 | — | Rust `read_file_range` 按 512 KB 字节区间读原始字节 → `TextDecoder(stream)` 跨块拼 UTF-8 → CodeMirror 分片追加；跳过语法解析、只读、带进度条，不写盘 |
| Word `docx` | ✅ | ✅ | 内置内核：流式块树 + 分页虚拟渲染；文本、字体、段落、列表、表格均可编辑 |
| Excel `xlsx` | ✅ | ✅ | 内置内核：二维虚拟网格 + 单元格 / 公式 / 格式写入 |
| PPT `pptx` | ✅ | ✅ | 内置内核：幻灯片按需取页 + 左侧列表 / 幻灯片浏览真实缩略图（复用舞台画布逐页 RPC）+ 文本形状编辑 / 增删页 |
| `csv / tsv` | ✅ | ✅ | 与 xlsx 同走内置表格引擎（内核以工作簿流式打开），单元格可编辑，保存写回原分隔符文本（不变 xlsx） |
| PDF | ✅ | ✅ | pdfjs 单页渲染 + 文本层 + pdf-lib 增量写回：文字点选修改（复用原字体 / 墨色 / 基线，只重绘改动字符）、图片粘贴 / 复制 / 提取，保存直接覆盖原文件；扫描件只读 |
| 图片 | ✅ | — | 滚轮缩放 0.1–10×、拖拽平移、双击复位、适应 / 1:1 |
| 音视频 | ✅ | — | 原生 `<audio>` / `<video>` |
| 压缩包 | ❌ | — | 暂不支持预览 |

> Markdown 预览中的代码块只输出转义文本，无语法着色；语法高亮由代码 / HTML 文件的 CodeMirror 提供。

- **粘贴截图**：编辑态 `⌘V` 贴入剪贴板图片，存为同目录 `image-<时间戳>.png` 并插入相对路径引用
- **查找 / 替换**：预览态 DOM 高亮跳转、编辑态文本选区（输入即自动定位首个命中并滚动到视野，上一个 / 下一个 / 替换当前 / 全部、区分大小写）；计数实时显示「当前 / 总数」。内容区右键菜单含「全选（编辑器内）」，Ctrl/⌘+A 焦点在内容区时也只在编辑器内选全，不会选中应用外壳
- **HTML 预览**：Rust 把本地资源内联为 `data:` URI，前端以 `srcdoc` 同源 iframe 渲染；iframe 内 `Ctrl+S` / `Ctrl+F` 转发到主窗口；保存后强制重载
- **超大文本流式预览**：文件超过 5 MB 不再拒绝打开。Rust `read_file_range` 用 `Seek` 按字节区间读（单次上限 1 MB），走 Tauri 原始字节通道；前端 `TextDecoder.decode(bytes, { stream: true })` 跨块拼接，被分片切开的 UTF-8 汉字不会变成替换符。每 512 KB 追加一次并让出主线程，CodeMirror 关掉语法解析与编辑能力（`readOnly` + `editable:false`），带加载进度；正文不进页签 `content`，`Ctrl/⌘+S` 明确提示「不写盘」，刷新只自增 `streamRev` 让编辑器从头重读，隐藏另存为 / 转格式 / AI / 查找栏。检出 NUL 字节判定为二进制并停止
- **PPT 缩略图**：左侧列表与「幻灯片浏览」不再是页码占位。共用 `OfficeSlideCanvas.vue` 渲染形状 / 文本 / 图片，按 `pptx.slide` 逐页 RPC 按需取模型，缓存后按容器宽度缩放；结构变更清空缓存，浏览视图隐藏舞台并放大缩略图网格
- **Word / PPT 右键菜单**：文档区右键——复制 / 剪切 / 粘贴、加粗 / 倾斜 / 下划线 / 清除格式、新建批注、插入链接（编辑态）；幻灯片舞台右键——新建 / 复制 / 删除 / 隐藏幻灯片、上移 / 下移，选中形状时为「删除形状」。均随视口边缘夹紧
- **表格右键菜单**：单元格右键弹出 Office 风格上下文菜单——上 / 下插行、左 / 右插列、删除行列、复制 / 粘贴（系统剪贴板 + 进程内副本兜底，跨格复制为 TSV、粘贴按网格还原）、清除内容；行头 / 列头右键有各自的插删与隐藏菜单。操作走内核 `xlsx.sheetOp`，可撤销。菜单靠近视口边缘时自动夹紧；`Ctrl/⌘+Z` 撤销、`Ctrl/⌘+Shift+Z` / `Ctrl+Y` 重做、`Ctrl/⌘+A` 全选（只选表格，不碰应用外壳，Esc 回到单格）；页签栏「＋ 行」在表格末尾追加一行
- **表格网格**：Excel 式无限行列——数据区外铺空白行 / 列，滚动近边缘自动延伸；行头 / 列头点击选中整行 / 整列（高亮）；冻结窗格真实渲染（冻结行 / 列钉住 + 边界线，`数据` 页签冻结后滚动仍然保持）；查找 / 替换为右上角悬浮条（计数「当前 / 总数」、上一个 / 下一个跳转选中、全部替换），不再依赖 WebView 不支持的 `window.prompt`——所有 Office 输入框（重命名工作表、自定义格式、链接、批注、替代文字等）统一走内嵌模态输入

### Office 三格式引擎

`docx / xlsx / pptx` 共用一条链路。**内核源码已内置在 `src/office/`，视图层全部是 Vue，无运行时依赖、无 React、无外部 npm 包**；MIT 许可与版权声明见 `src/office/LICENSE`。

```
readFileBytes → Blob → DocumentClient.open()
   → Vite inline Worker：懒 ZIP / SAX 流式解析 / 按需 RPC
   → Vue 视图：分页虚拟渲染（Word）、二维虚拟网格（Excel）、按需取页（PPT）
   → client.call('save') → Uint8Array → writeFileBytes(原路径)
```

| 层 | 位置 | 职责 |
|---|---|---|
| 内核 | `src/office/core/`（约 50k 行） | ZIP / OPC / OOXML 解析、格式转换、脏块写回、公式与编辑 RPC |
| 编辑逻辑 | `src/office/view/`（约 3.8k 行纯 TS） | 富文本输入控制器、段落 / 表格编辑、撤销重做、几何与网格轴 |
| 视图 | `src/office/components/` | 三套 Vue 组件 + 共用幻灯片画布 `OfficeSlideCanvas.vue` + Ribbon 工具条，样式集中在独立 CSS 文件 |
| 工具条配置 | `src/office/ribbon.ts` | 声明式 Ribbon：按格式定义选项卡 / 分组 / 按钮，只描述命令名与参数 |
| 宿主 | `src/components/OfficeEngineHost.vue` | 打开 / 刷新 / 保存，按格式切换视图，向 MdView 暴露 `save()` |

- **Ribbon 工具栏**：MdView 顶部页签栏 / 保存 / 转格式 / AI 助手 / 刷新管文件级操作；`OfficeToolbar.vue` 按 `ribbon.ts` 渲染文档内命令，命令经视图 `defineExpose` 防腐层执行，工具条不碰内核。只读页签只保留「视图」选项卡
  - **Word**：开始 / 插入 / 布局 / 审阅 / 视图 5 个选项卡。字体字号、样式与对齐列表、颜色、表格行列与合并边框、图片链接、页眉页脚 / 页码 / 首页不同、纸张页边距分栏、修订与批注、缩放与阅读模式。交互还原：文本选区格式 / 格式刷 / Ctrl+B·I·U·Z、拖放插入、表格列边界拖动改列宽（写回 `docx.table`）、点图片出 8 手柄缩放（角等比 / 边单轴，写回 `docx.edit`）、文档区右键菜单
  - **Excel**：开始 / 插入 / 公式 / 数据 / 工作表 / 视图 6 个选项卡。20 种数字格式、边框线型、合并旋转、行列显隐与行高列宽、排序填充、冻结窗格、134 个公式函数目录、公式重算、分类汇总 / 数据透视表 / 自动筛选、工作表增删 / 重命名 / 移动 / 切换、网格线与缩放。选区按 Excel 操作还原：鼠标拖选、Shift 扩展、Ctrl/⌘ 加选多区、行列头拖选、选区外框四边拖动搬移内容、右下角填充柄向下/向右填充、名称框显示 `A1:E7` 并支持输入跳转、方向键 / Shift+方向 / Enter / Tab / Delete / F2 / Ctrl+C·V·Z；格式、合并、填充、排序、行高列宽、清除内容等命令对整个选区（含加选区）生效
  - **Excel 插图（1:1 落文件）**：新增「插入」选项卡——「图片」选文件（超 480×360 等比缩放）、「图表」对选区数据出柱形 / 条形 / 折线 / 饼图（Office 默认配色 SVG → PNG）；`Ctrl/⌘+V` 粘贴剪贴板图片直接落在当前单元格。全部经 `xlsx.image` 写成**真实 OOXML drawing**（`xl/media/` + `xl/drawings/drawingN.xml` twoCellAnchor），保存后用真实 Office 打开呈现同一位置同一尺寸；编辑器内经 `xlsx.drawings` 读回锚点几何（与网格同一套 colPx/rowPx 数学，隐藏行列同步塌缩）、`client.mediaUrl` 渲染 blob 图层，undo/redo、行列宽高变更后图层自动刷新。冒烟 v24 全链路验证：写入 → save → 重新打开 → 几何逐像素一致 → 视图渲染
  - **PPT**：开始 / 插入 / 视图 3 个选项卡。30 种形状、文本框 / 图片 / 直线、形状层级与填充线条虚线、幻灯片增删复制隐藏与移动、普通 / 浏览 / 放映视图、缩放与适应窗口。交互还原：第一次点击选中形状（文本层不抢焦点）、拖动搬移、选中外框 8 手柄缩放、⌘/Shift 多选、方向键微调（Shift ×10）、Delete 删除、⌘D 复制、⌘A 全选、Escape 取消、多选按外接矩形对齐、就地文本编辑
  - 分类汇总 / 数据透视表 / 自动筛选在「数据」选项卡为可用按钮：内核无聚合 RPC，走 `xlsx.block` 读全表 → 前端聚合 → `xlsx.set` 写回静态结果，筛选复用 `sheetOp hideRows`；结果是值而非可刷新透视对象，上限 5000 行。自动识别数据边界与分组列 / 数值列（光标停在空白列也不会误指向空列），结果写在数据区紧邻下方或右侧；写入是单次 `xlsx.set`，Ctrl/⌘+Z 一步恢复；无数据或列范围错误只弹可关闭的提示，不再产生常驻的「编辑器异常」横幅。图表编辑与动画内核无能力，未配置按钮、不放假按钮
- **紧凑布局**：Ribbon 固定约 68px（选项卡 26px + 命令区 41px），命令单行横排、分组名置于底部，不显示原生滚动条；窗口放不下时左右箭头 + 边缘淡出 + 滚轮横向滚动（与顶部页签条一致），下拉 Teleport 到 `body` + fixed 定位，不受工具条裁剪
- **版式还原**：Word 页面宽高 / 页边距 / 默认字体字号取自 `DocxMeta` 与 `sectPr`，列表制表位 36pt、编号不继承负缩进，分页用可见块 DOM 实测高度逐轮收敛；PPT 画布外层占缩放后尺寸、内层按左上角缩放，隐藏页签恢复时由 `ResizeObserver` 重算
- **隐藏态不干活**：Word 的 `ResizeObserver` 在 `display:none` 时不把视口高度写成 0，`measure()` 也跳过隐藏根节点，避免每次切回来都重新分页并触发多轮高度收敛
- **自动换行**：内容区右键菜单切换，偏好存 `mdview-wrap`；CodeMirror 用 `Compartment` 动态重配置，textarea / `<pre>` / Markdown / Word 段落 / PPT 文本 / 表格单元格 / PDF 输入框统一跟随
- **快捷键归属**：`Ctrl/Cmd+S` 归 MdView；编辑区 `Ctrl/Cmd+F` 不抢占页签与文件树；工具条用 `click` 触发，Word 编辑器在命令前后用 `pendingSel` 保存 / 恢复光标
- **页签常驻**：每个打开过的 Office / PDF 页签保留一个宿主实例（`v-show` 切换）。切换不销毁 Worker、不重读磁盘、不重新解析；常驻集合内容未变时不赋新引用，`ref` 回调按路径缓存，避免全量 patch
- **切页签防重活**：大纲按 `content` 引用缓存且 Office 页签直接跳过全量 `marked.parse`；`MdPreview` 按文档缓存解析 + 净化结果，回到同一文档一次注入而非逐帧重放；保存后 `await` 更新指纹基线、轮询在保存期间跳过，杜绝 3 秒后把刚写盘的文件误判为外部变更而重读重解析
- **刷新语义**：`officeRev` 变化时重读磁盘并重建文档；关闭页签才销毁实例
- **字节写回**：内核导出编辑后的 OOXML，经 Tauri 原始字节通道覆盖原路径；保存后用新字节重建文档，视图与磁盘一致
- **大文件**：Worker 解析不阻塞主线程，DOM 只保留可见页 / 可见行列，首屏耗时与文档长度解耦

### Office 工具栏逐按钮审计（2026-11-14）

范围：`ribbon.ts` 三格式共 13 选项卡 / 37 分组 / 193 个可点项（145 按钮 + 34 下拉 + 9 色板 + 5 开关），98 个唯一命令。链路：`ribbon.ts` → `OfficeToolbar.vue` → 视图 `defineExpose({ commands })` → `DocumentClient.call` → `worker/engine.ts`。运行时逐 tab 点击 151 个非菜单按钮：`xlsx 62 / docx 62 / pptx 27`、44 个下拉/色板，**0 禁用、0「命令未接入」、0 页面报错**；44 个弹板再逐项点击 581 个选项（含 134 个公式函数 / 70 个特殊符号），581 次命令分发、0 空项、0 报错（2 个「插入图片」项会拉起系统文件选择器，跳过）。

| 类别 | 数量 | 处置 |
|---|---|---|
| 有效（含依赖选区 / 选中形状） | 78 | 保留；形状类未选中时宿主提示「请先选中形状」 |
| 纯 UI 状态（缩放 / 视图 / 阅读模式 / 查找条 / 格式刷取样） | 17 | 本就不写内核，保留 |
| 空操作 / 无反馈 | 3 → 0 | 边框色补 `border:'all'`；批注列表弹只读列表；说明文字换成 3 个真按钮 |
| `B/I/U/S` 二次点击不能取消 | 1 组 → 0 | `format` 翻转布尔标记，内核 `derive` 对 `false` 清除 |
| `unsupported` 占位 | 1 → 0 | 「说明」组改为「分析」组：分类汇总 / 数据透视表 / 自动筛选 |

本轮一并修复：**冻结首行**滚动后冻结行数据不加载、预渲染行越进冻结区（`loadVisible` 单独取冻结行块 + 冻结时取消向上缓冲）；**Word / PPT 双右键菜单**（视图 `@contextmenu.stop` + 外壳 `pane-body` 对 Office 区域不叠加 `ctx-menu`）。

### Office 鼠标交互还原与 1:1 差距（2026-11-14 二轮）

| 格式 | 本轮补齐 | 仍非 1:1（内核能力 / 工作量） |
|---|---|---|
| Excel | 拖选范围、Shift 扩展、⌘/Ctrl 加选、行列头拖选、外框拖动搬移、填充柄、名称框跳转、方向键 / Delete / F2、格式与合并等命令作用整区；分类汇总自动推断数据边界与字段、结果紧邻数据区、一次 `xlsx.set` 可一步撤销、无数据改可关闭提示；插入图片 / 粘贴剪贴板图片 / 选区数据出图表（柱·条·折·饼），写成真实 OOXML drawing 落文件、重开 1:1 呈现（`xlsx.image` / `xlsx.drawings`）；浮动图片单击选中 + 8 手柄缩放 / 拖动吸附格线 / Delete 删除 / Esc 取消，走 `xlsx.drawingOp` 写回 twoCellAnchor、可撤销、保存重开同位同尺寸；合并单元格渲染（锚格撑满跨行列、命中/选区吸附锚格）；自动筛选 Office 式面板（升序降序 / 文本·数字筛选二级菜单 / 值勾选清单，全部自绘控件）；分类汇总与数据透视 Office 式对话框（字段 / 聚合方式 / 汇总项自绘选择）；原生图表 part（`xl/charts/chartN.xml` + drawing `graphicFrame`，Office 配色 SVG 渲染，源数据改可 `xlsx.chartRefresh` 重算写回）；条件格式（cellIs / containsText / top10 / colorScale / dataBar 5 种 + `styles.xml` 的 dxf，视图叠加底色 / 数据条，不盖选区 overlay）；数据验证（list 下拉 + whole / decimal / date / textLength 校验提示，全部自绘控件）；切片器（真实 `slicerCache` / `slicer` part + `extLst` 挂接，视图字段值按钮组选值即时筛选）；可刷新透视（pivotCache / pivotTable part + 交叉表单元格，源数据改可 `xlsx.pivotRefresh` 重算）；ribbon 新增「条件格式 / 数据验证 / 切片器 / 刷新图表 / 刷新透视」入口；填充柄支持向上 / 左填充（内核 `fill` 四向，按拖拽起点判定方向）；⌘ 加选每区各自绘制外框、跨冻结线选区外框按冻结线拆段；选区外框拖动搬移保留公式与样式（`translateFormula` 随搬移平移 + xf 样式，可撤销）；「序列…」对话框（等差 / 等比 / 日期〔工作日跳周末、月年溢出回退月末〕/ 自动填充 / 步长 / 终止值，全自绘控件、单步撤销）；自动填充选项浮标（复制单元格 / 以序列方式填充 / 仅填充格式 / 不带格式填充）；1904 日期系统校准（`date1904` 分支贯穿 dateToSerial / serialToDate / editor.dateSerial，1900 闰年边界 serial 60 折叠、02-28→59 与 03-01→61 严格互逆，工作日两套 serial%7 基准）；可刷新序列对象（`SeriesFeature` 存私有 sidecar，新增 `xlsx.seriesRefresh` / `xlsx.seriesList`，源格改后刷新重算、单步 undo/redo、rewrite 不丢定义）；ribbon 新增「刷新序列」入口；按用户报障修复：筛选「全选」不还原（内核取消隐藏时回传默认行高 + 视图 unhide 上界改用内核总行数）、Ctrl+A 全选（此前被输入框与筛选面板守卫吞掉）、左上角行列头交叉格点击全选、筛选面板原生 input 换自绘控件；单元格选中态直接敲键盘即进编辑态（替换式预填、IME 组合输入不抢键、多格选区填满整片、提交走 `xlsx.set` 可撤销）；冻结列水平滚动不抖动（流式 progress 增量消息不带 `frozen` 会把冻结列数清零 → 改视图本地 state 同源、`gridPos` 视口坐标与内容坐标分离、冻结区与滚动区不重叠无缝拼接）；**ribbon 按 Excel 桌面版 1:1 还原**（8 tab：开始 / 插入 / 绘图 / 页面布局 / 公式 / 数据 / 审阅 / 视图，共 193 按钮 = A 级 137 真实现 + B 级 56 灰显并 title 说明不支持原因，A 级行为收在 `view/xlsx/ribbon-extra.ts`，覆盖页面设置落 `pageSetup`/`pageMargins`、定义名称、保护工作表、缩进、财务函数、统计等）；按用户报障修复切格丢编辑（根因：切格路径置 `editing=false` 令 `<input>` 在 blur 前卸载 → 提交从未触发；新增 `flushEdit()` 在选区变更 / Shift 扩展 / 换表前同步 `commitEdit`，输入格 19 项断言含重开与 undo）；序列公式化全链路（`core/xlsx/seriesformula.ts` 把第六批纯函数层接入真实写入：等差 `=A1+1` / 等比 `=A1*2` / 日期日 `=A1+1` 保留 numFmt、月年锚定 `EDATE(A1,n)` 避免链式月末回退、fillSeries 写 `=G2+2`，全相对引用落盘 `<f>` + `T_NUM` 缓存值；源格改自动跟随、单步 undo/redo、save→重开一致，对话框与填充柄两路径均接） | 工作日日期序列保留静态值（公式引擎无 WORKDAY）；默认 copyValues 数值填充仍静态（Excel 语义），仅 fillSeries 写公式；sidecar「刷新序列」与公式共存（公式自动跟随、sidecar 保可重建定义）；1904 只冒烟 yyyy-mm-dd numFmt；冻结列钉住为 JS 补偿（`left += scrollLeft`）而非原生 sticky 四面板，快速滚动理论上有 1 帧未补偿中间态；B 级 56 项（Power Query / 3D 模型 / 图标 / 地图 / 迷你图 / 建议图表 / 录制宏等）仅灰显说明、无实现 |
| Word | 真·查找替换栏（CSS Custom Highlight API 高亮、n/m 命中计数、↑↓ 跳转滚动定位、替换当前 / 全部替换、Esc 关闭）；表格列边界拖动改列宽（`docx.table`）、行下边界拖动改行高（`w:trHeight` 落文件、重开保留）、图片选中 8 手柄缩放（`docx.edit`）、首次点击形状不进文本编辑（PPT 同理）、右键菜单复制 / 剪切改为不破坏选区；图片 4 种环绕（四周 / 紧密 / 衬于文字下 / 浮于文字上）+ 相对页 / 栏 / 段落位置 + 拖动改绝对坐标，真实 `wp:anchor` 落文件、重开一致、视图 float+shape-outside 绕排；长表格按行跨页拆分（续页重复 `tblHeader` 表头行、接同一列宽与边框）；图片旋转手柄（`a:xfrm/@rot` 落盘、选中框与手柄随转、可撤销）；修订持久化基础版（修订开关下键入 → `w:ins`、删除 → `w:del`/`w:delText`，渲染下划线 / 删除线 + 作者色，save→重开保留，接受 / 拒绝与上 / 下条修订可用）；页眉页脚渲染与双击编辑（`header*/footer*` part 自动创建、titlePg 首页变体、PAGE/NUMPAGES 字段按页展开，写回重开一致）；分栏渲染（`w:cols` → CSS columns，块 `break-inside: avoid`）；图片裁剪（`a:srcRect` per-mille 全链路：解析 → 四边中点手柄拖动实时预览 → 写回 → 裁剪壳渲染，可撤销，ribbon 新增「裁剪」入口）；even 奇偶页变体（`w:evenAndOddHeaders` + `headerReference type="even"`，按页号切换 default / first / even，双击偶数页编辑 even part，save→重开一致）；修订 moveFrom / moveTo（剪切+粘贴路径，成对 `w:moveFrom` / `w:moveTo` + 四种 Range 标记，渲染「移动来源 / 移动目标」，accept / reject 成对处理）；分栏栏感知（`view/docx/cols.ts` 纯几何栏索引 + 段落定位校正 + 栏命中高亮）；按用户报障修复布局 tab 无效（根因：视图从未注册 `editor.onPage`，`paged()` 的 `this.onPage?.(res.page)` 为空操作 → `meta.page` 不更新 → 页宽/页高/页边距/栏数全部停在旧值；现接 `onPage` + `onError` 上抛，横向/分栏/页边距真实生效并落盘 `w:pgSz`/`w:pgMar`/`w:cols`，无 sectPr 空文档自建 sectPr）；run 级格式修订 `w:rPrChange`（`view/docx/fmtchange.ts`：`FmtChange` 挂 run 的 `fc`，改格式留痕、旧 rPr 快照写回、accept 丢弃 / reject 成对还原，渲染作者色左竖线 + hover「格式已更改」，id 走 `nextTrackId++`；覆盖空差集撤销、多次改动重算不累加、渲染与写回成对还原三边界）；按用户报障加固表格工具栏与图片链路（`view/docx/selcache.ts` pointerdown 捕获阶段同步快照选区，`view/docx/imagepaste.ts` paste 事件兜底 + preventDefault 防重复插入，兼容 WKWebView 对 paste 的 beforeinput 不带 `dataTransfer.files`；表格 15 按钮逐项可观察效果、剪贴板图片落单元格真实 drawing、save→重开一致）；段落级格式修订 `w:pPrChange`（`view/docx/pprchange.ts` 捕获旧 pPr 快照 + 相对增量，`<w:pPrChange w:id w:author w:date>` 注入为 `w:pPr` 最后子元素，id 走 `nextTrackId++`；setPara/indent/insertPageBreak/pasteRich/restyle 全入口挂钩，accept 丢弃 / reject 成对还原，渲染作者色左边线 + hover「段落格式已更改」；额外把纯格式 label 列入 UNTRACKED 消除伪 del+ins） | 分栏光标仅段落级校正，不保证字符级精确；移动修订仅覆盖剪切+粘贴、限纯文本单段源选区与 collapsed 目标，不含完整拖动搬移路径；段落格式修订 numPr 完整语义降级（只重建 ilvl 保留 base）、右缩进/悬挂/tabs/keepNext 无编辑器入口故不追踪、每段落仅留一个 pPrChange；表格单元格段落逻辑可用但未自动化验证；页眉页脚编辑仅文本行（沿用原行对齐/加粗/字号）；写回会把不等宽栏统一成等宽；加粗→取消加粗后落盘留显式 `<w:b w:val="0"/>`（视觉等价初始） |
| PPT | 形状选中 / 拖动 / 8 手柄缩放、⌘ 多选、方向键微调、Delete、⌘D、⌘A、Escape、多形状按外接矩形对齐、分布命令（ribbon 暂无按钮）；旋转手柄（单形状绕中心旋转、选中框与 8 手柄随转、Shift 吸附 15° 倍数、松手写回 `a:xfrm rot`、可撤销）；母版 / 主题编辑（切换 slideLayout、编辑 `a:clrScheme` 全部配色键即时反映到 schemeClr 形状、母版背景 solidFill 编辑，真实 part 落盘、重开一致）；框选矩形套选（空白处拖拽矩形、松手套选相交形状，与 ⌘/Shift 多选并存）；对齐吸附线（搬移时边 / 中心与其他形状或画布对齐 ≤6px 显示参考线并吸附）；多形状整体旋转（各形状 rot += Δ 且中心绕多选外接矩形公共中心旋转，走既有 xfrm ShapeOp 可撤销）；演讲者备注（notesSlide 解析 / 底部可折叠自绘面板 / 写回，无 part 自动创建 + rels + Content_Types）；表格单元格编辑（双击就地编辑 `a:t`、右键增删行列）；动画 / 切换基础版（`p:transition` + `p:timing` entrance appear/fade/wipe，CSS 序列播放、演示模式切换播放，右键编辑写回 mainSeq 结构）；SmartArt（dgm data part 节点树 + 父子树形连线降级渲染，双击编辑写回 `dgm:t`、跨 part undo）；notesMaster 新建（无 notesMaster 时建 part + rels + Content_Types + `presentation.xml` notesMasterIdLst 登记，unzip 交叉引用合规）；动画 emphasis / exit（7 preset：entr appear·fade·wipe + emph spin·growShrink + exit disappear·fadeOut）+ 严格 clickEffect 顺序（按 mainSeq 文档顺序播放）；合并单元格表格行列增删修正（逻辑列槽位模型兼容 gridSpan+hMerge 与仅 gridSpan 两种 OOXML 表示，增删后每行逻辑列数恒等于 tblGrid）；ribbon 新增「动画」组（出现动画 / 移除动画 / 播放动画 / 切换效果）；按用户报障修复：插入文本框双击就地编辑（`shapeText` 走 `editSlide` 保 undo，`contenteditable` 仅编辑态挂载、纯文本节点不用 v-html、文字层 pointer-events 分级解决「一拖就动」，a:t 转义 `& < >`）；左侧缩略图右键菜单（13 项接真实命令，复制 / 删除 / 隐藏 / 移动 / 切换等）；左侧缩略图拖拽重排（pointer 4px 阈值 + 插入位置指示线 + `pptx.slides move{from,to}`，DOM 与落盘顺序一致、no-op 边界、单击/右键不破坏）；幻灯片图片粘贴与菜单插入统一走 `insertImageBlob`（document 级 paste 只取 image Blob 不抢文本输入、自然比例 60% 限幅 + 就近定位，`ppt/media` 真实落盘、save→重开可见）；原生图表数据编辑（`core/pptx/chart.ts` 解析 `ppt/charts/chartN.xml` 的 c:ser/c:cat/c:val，5 种引用形态 strRef/numRef/multiLvlStrRef/strLit/numLit 全支持、缓存值渲染；`view/pptx/chart.ts` SVG 自绘柱/折线/饼 + 轴刻度图例；双击/右键「编辑图表数据」开自绘面板，走 `pptx.shapes` 的 `chartData` op 把缓存点与 c:f 及 embedded xlsx 源单元格双写、点数变化 retarget 区域、单步 undo） | 形状布尔运算；图表不支持 3D / 组合图 / 次坐标轴 / 数据标签逐项格式化 / chart style-colors part / 趋势线误差线（渲染结构一致非像素级）；SmartArt 真实 layout1.xml 布局算法 / quickStyle / 富文本样式；动画 path / mediacall 未支持、clickEffect 严格顺序仅覆盖 entrance；`mc:AlternateContent` 包裹的切换不识别；继承占位符实例化未做；PPT ribbon 无表格组（表格入口在画布右键 `tableRow`/`tableCol`，新增「插入表格」按钮需先扩内核 insert op） |

完整 1:1 还原是分阶段工程：Office 桌面端的命令面约数千项。本轮按「选区 / 拖动 / 多选 / 键盘 / 右键 / 工具栏作用范围 / 渲染持久化 / 工具栏结构还原」这类高频交互补齐；第三批覆盖 PPT 多形状整体旋转 / 演讲者备注 / 表格单元格编辑 / SmartArt 降级渲染 / 动画切换，Word 页眉页脚分栏 / 图片裁剪，Excel 填充序列对话框与自动填充选项；第四批覆盖 PPT notesMaster / 动画 emphasis·exit / 合并表格增删，Word even 页眉 / 移动修订 / 分栏栏感知，Excel 1904 校准 / 可刷新序列对象；第五~七批按用户报障与截图修复：Excel 筛选全选还原 / Ctrl+A / 左上角全选 / 直接键入 / 冻结列抖动、Word 布局 tab 无效、PPT 缩略图右键与文本框编辑，并补 Word run 级格式修订、Excel ribbon 按桌面版 8 tab / 193 按钮 1:1 还原（137 真实现 + 56 明确灰显，消灭「点了没反应」）；第八批按用户报障修复：Excel 切格丢编辑、PPT 缩略图拖拽重排 + 图片粘贴/插入、Word 表格 15 按钮选区加固 + 图片粘贴（含单元格内）落盘。第九批补齐三项 1:1 遗留：PPT 原生图表数据编辑（解析 + SVG 渲染 + 自绘面板 + 缓存/源单元格双写）、Word 段落级 `w:pPrChange`、Excel 序列公式化全链路（公式落 `<f>` + 源格改自动跟随）。第十批按用户截图报障修复 Excel 贴图与渲染：粘贴 / 插入图片锚定到当前单元格（读自然尺寸等比限幅，落真实 OOXML oneCellAnchor、save→重开同位）；8 手柄缩放全程等比（`object-fit: contain` + 按原始宽高比联动另一边，杜绝拖角压窄），四向手柄拖动与格线吸附保留比例；渲染对齐桌面版（工作簿默认字体 `font 0` 落到网格根，未指定字体的格继承而不再回退 UI 字体；列宽按 Excel MDW 公式 `Truncate((256*w+INT(128/MDW))/256*MDW)` 换算，默认列宽同步；合并区四边框从各边实际格合成，不再只看锚格）。样式与图片工具抽到 `view/xlsx/cellstyle.ts`、`view/xlsx/image.ts` 保持单文件 ≤2000。下一批优先项：PPT 形状布尔运算 / SmartArt 真实布局 / 动画 path·mediacall，Word 移动修订完整拖动路径 / 分栏字符级光标 / 段落 numPr 完整语义，Excel 冻结列原生 sticky 四面板 / 工作日序列公式化（引擎补 WORKDAY）。分布命令已放在 `OfficeSlideView.commands.distribute`，需 ribbon 补按钮才暴露给用户。

如实保留的边界：Word 修订为 run 级 ins/del + 剪切粘贴 moveFrom/moveTo + run 级格式 rPrChange + 段落级 pPrChange（不含完整拖动搬移路径、作者单一）；分栏光标为段落级校正非字符级；页眉页脚 even 变体已做、HF 编辑仅文本行；`decimals` 固定覆盖 `0.0 / 0.00`，不按当前 numFmt 增量；`recalc` 实为重载工作表；mac 上 Ctrl+click 归系统右键，加选统一用 ⌘；PPT 复制后保留原选区索引，不自动跳到新副本；SmartArt 只做节点树降级布局，动画覆盖 7 种 preset（entrance / emphasis / exit）不含 path·mediacall；原生图表不支持 3D/组合图/次坐标轴；Word 表格合并/拆分需对应选区状态、底纹/边框/插表为二级菜单需点选项；Excel 的图表 / 条件格式 / 数据验证 / 切片器 / 透视 / 序列用私有 sidecar（`xl/mdview/features.json`）辅助存储交互元数据，真实 Office 打开并另存会丢弃该 sidecar，导致 MdView 再打开这些交互状态丢失（真实 OOXML part 仍在，Office 仍能识别）；序列已公式化（源格改自动跟随），但工作日序列仍为静态值。

> 已知边界：协同编辑 RPC 未接 UI；Word 长表跨页仅覆盖单栏整表超高场景，tight 绕排为矩形近似；PPT 文本编辑按段落重建，段内多样式会合并；HTML iframe 内右键由其自身文档处理，自动换行开关不作用于跨文档内容。

### PDF 在线编辑

`pdfjs-dist` 渲染当前页、提取文本层、识别扫描件；`pdf-lib` 只在原字节上叠加改动。保存经同一条原始字节通道 **覆盖原路径**，未改动页仍是原来的矢量文字，可选中、可搜索。

```
readFileBytes → pdfjs 单页渲染 + 文本层命中框（记录字体族 / 字号 / 基线 / 墨色）
   → SVG 覆盖层：文字替换 / 图片对象（拖动 · 缩放 · 删除）
   → pdf-lib 叠加：白块只遮变化字符 + 原字体新文字 + 图片
   → Uint8Array → writeFileBytes(原路径)
```

- **字体保真**：pdfjs 把文档内嵌字体注册进 `document.fonts`，家族名即 `TextItem.fontName`。写回时复用该字体与真实字号 / 基线，并从页面渲染像素采样原墨色（不是纯黑）；编辑态 SVG 预览用同一套字体与颜色，所见即所得
- **最小覆盖**：按原文与新文的公共前后缀求差，白块只遮真正变化的字符区间，未改动字符仍是原 PDF 矢量文字，不做整行重绘。整行改写或新字更宽时退回整行覆盖，字形依旧沿用原字体
- **文字**：点页面文字块改内容，中文可直接编辑；文档用标准 14 字体 / Type3 等未注册字体时退回系统中文字体，仍能正常写入
- **图片**：`Ctrl/⌘+V` 粘贴剪贴板图片、工具条「插入图片」选文件；选中后可拖动、右下角缩放、`Delete` 删除、「复制图片」写回剪贴板
- **内嵌图片**：「页面图片」提取本页原有图片，可「复制」出来或「插入」一个副本进页面
- **扫描件**：前 3 页无文本层即判只读，隐藏编辑工具条；`save()` 返回空，不落盘
- **页签常驻**：与 Office 一致用 `v-show` 切换，不重解析；`pdfRev` 变化时重读磁盘
- **防误写**：PDF 隐藏「另存为 / 转格式 / AI 助手」；无改动时 `Ctrl/⌘+S` 不写盘，避免文本通道把二进制写成空文件
- **WebView 兼容**：`pdfjs-dist` 锁在 4.x（4.10.38）。6.x 依赖 `Map.getOrInsertComputed` / `Float16Array` 等 Tauri WebView 尚未提供的 API，会抛 `TypeError: ... is not a function` 导致 PDF 打不开

### 格式转换

以 Markdown 为枢纽，入口为页头「转格式」按钮与右键菜单，产物落盘后自动打开为新页签。

| 源 | 可转目标 |
|---|---|
| `md` | txt · html · docx · xlsx · pptx · pdf |
| `txt` | md · html · docx |
| `html` | md · txt |
| `csv` | md · xlsx |
| `docx` | md · txt · html · xlsx · pptx |
| `xlsx` | md · csv · docx · pptx |
| `pptx` | md · txt · docx · xlsx |

> PDF 目标由前端 `marked → html2canvas → jsPDF` 所见即所得导出，仅支持 md 源，产物为位图、文字不可选。

### AI 助手（可选）

- 对接任意 **OpenAI 兼容接口**：多 profile 配置（base_url / api_key / model），可分别指派 chat 能力
- 右下角悬浮窗 **流式输出**：智能摘要 · 生成标签 · 内容解读（单文档任务）
- **批量 AI 摘要**：4 并发，docx / xlsx / xls / pptx 经 Rust 枢纽转 Markdown 后摘要，12K 字符截断；结果按 `size:mtime` 指纹缓存于 `summaries.json`，支持一键重算、首行悬浮预览
- **搜索并入摘要**：摘要文本也参与子串命中，正文没有的关键词也可能搜到
- 未配置 AI 时相关操作会提示并打开设置

### 相似图片（本地归组，与 AI 无关）

- Rust 端 `images.rs` 递归扫描 9 种图片扩展名，计算 **9×8 灰度 dHash**（64 bit），每 20 张落盘缓存，按 `size:mtime` 复用
- 并查集按汉明距离 ≤ 阈值连通（滑杆 0–20，默认 10，比较上限 3000），只输出成员 ≥2 的分组
- 工具页：索引计数与进度、可释放空间估算、分组卡片（缩略图 / 尺寸 / 体积 / 路径）、点击打开、单张删除后自动重算

### 体验

- 深色 / 浅色主题一键切换（mermaid 与 Office 引擎同步重渲染）
- 首页统计与快捷入口、帮助页、侧栏拖拽调宽 / 收起 / 边缘悬浮展开
- 文件浏览器网格 / 列表视图、面包屑、行内重命名、全局超薄透明滚动条、toast 与统一确认弹窗
- 快捷键：`Ctrl/Cmd+S` 保存、`Ctrl/Cmd+F` 查找、`Esc` 关闭查找、查找栏 `Enter` / `Shift+Enter`、`⌘+Shift+I` / `F12` 打开 WebView 调试器

---

## 为什么切大文件页签不卡

旧链路给 Office 宿主绑了 `:key="文件路径"`，每次切页签都销毁实例：重读整个文件、重建编辑器与 Worker、重新解析并分页。第一版用 `v-show` 常驻实例解决了这一层，但往返仍会卡约 3 秒——重活其实散在另外四条路径上。

| 根因 | 触发时机 | 修复 |
|---|---|---|
| `headings` computed 每次切页签跑全量 `marked.parse`；Office 页签的 md 枢纽内容可达 5 MB，解析结果还被丢弃 | 每次往返 2 次 | 按 `content` 引用缓存，Office 页签直接返回空大纲 |
| `MdPreview` 全量解析 + 净化 + 按 48 KB 分片逐帧注入（5 MB ≈ 105 帧 ≈ 1.8 s） | Office ↔ 非 Office 往返，组件销毁重建 | 按文档缓存解析 / 净化结果，命中缓存一次注入 |
| Word 的 `ResizeObserver` 隐藏期把视口高写成 0，恢复时触发全量分页 + DOM 实测块高逐轮收敛 | 每次切回 Office | 隐藏期不写 0、等值不写，`measure()` 跳过隐藏根节点 |
| 保存后 `void updateFingerprint()` 未 await，下一轮 3 s 轮询把刚写盘的文件误判为外部变更 → 真重读 6 MB 并重建 Worker | 保存后切页签 | `await` 指纹基线；轮询在保存期间跳过 |

现在 `PreviewPane.vue` 为每个访问过的 Office / PDF 页签保留一个宿主实例，切页签只做 CSS `display` 切换：不销毁 Worker、不重读盘、不重新解析、不重跑全文渲染。实例只在首次成为激活页签时创建（隐藏态首次挂载会把块高读成 0）；常驻集合内容未变时不赋新引用，`ref` 回调按路径缓存，避免全量 patch。`editable` / `theme` 由 props 驱动，`officeRev` / `pdfRev` 变化才重读磁盘。

本机无头 Chrome 实测：全量 Markdown 渲染单次 **2 MB 167 ms / 5 MB 349 ms**（修复前一次往返要付 2 次）；两个常驻宿主连续四次往返切换 **7 / 32 / 33 / 33 ms**，文档根节点身份不变，0 报错；6.0 MB docx 隐藏→恢复 **26 ms**，对照 destroy + remount 为 57 ms。真实 Tauri 环境还省掉一次 6 MB IPC 读盘与 Worker 启动，差距更大。

> 上限：实例数 = 打开过的 Office / PDF 页签数，未设 LRU，多开大文档内存线性增长；宿主一次读全量字节，峰值内存 ≈ 文件大小。保存后重建视图会重置光标 / 滚动位置。

---

## 超大文本为什么不卡

旧逻辑对超过 5 MB 的文本直接弹「文件过大，暂不支持预览」，71 MB 的 `.sql` 完全打不开。现在改为「大文件不拒绝、只读流式装载」：

| 环节 | 做法 |
|---|---|
| 打开 | `entry.size > 5 MB` 时只建页签（`stream: true` + 指纹基线），正文不读、不进 `content`，避免整文件 JSON IPC 与全量 `innerHTML` |
| 读盘 | Rust `read_file_range` 用 `File::seek` 跳到 offset，单次最多读 1 MB，返回 `tauri::ipc::Response` 原始字节 |
| 解码 | `TextDecoder('utf-8')` 配 `decode(bytes, { stream: true })`，跨分片的多字节字符保留到下一块，收尾再 `decode()` 冲刷 |
| 挂载 | 每 512 KB `view.dispatch` 追加一次，`setTimeout(0)` 让出主线程保证可滚动；跳过 Lezer 语法解析、补全、括号匹配与 history |
| 防误写 | `readOnly` + `editable:false`；保存入口直接返回提示；刷新只自增 `streamRev` 触发从头重读，不重读全文进内存 |

本机无头 Chrome 实测：**6 MB / 71 MB SQL** 均完整装载（71 MB → 74,448,886 字符 / 744,490 行），分片边界处的 UTF-8 汉字「界」无替换符，进度条走完显示「加载完成」，只读态 `contenteditable=false`，0 控制台报错。同批验证 PPT 普通视图 4 张缩略图各自渲染不同页码、均有画布与缩放矩阵，切到幻灯片浏览后舞台隐藏、缩略图从 77px 放大到 154px，0 报错。

> 边界：流式页签为只读，不能编辑、不写盘，也不参与查找 / 转格式 / AI 摘要；整份文本仍在 CodeMirror 文档树内，超大文件内存随体积线性增长；按 NUL 字节判二进制，含 NUL 的文本会被拦下。

---

## 快速开始

环境：**Node.js ≥ 20**、**Rust 工具链**、Tauri 2 系统依赖（见 [Tauri 前置条件](https://tauri.app/start/prerequisites/)）。

```bash
npm install
npm run app:dev      # 开发模式，热更新
npm run app:build    # 打包发布
```

| 命令 | 作用 |
|---|---|
| `npm run dev` | 仅启动 Vite 前端 |
| `npm run build` | `vue-tsc --noEmit` + `vite build`，产物 `dist/` |
| `npm run preview` | 预览前端构建 |
| `npm run app` | tauri CLI 入口 |
| `npm run app:dev` | 桌面开发模式 |
| `npm run app:build` | 桌面打包 |

桌面包位于 `src-tauri/target/release/bundle/`，当前版本 **1.0.8**（macOS 产出 `.app` / `.dmg`，Windows 产出 `.msi`）。版本号在 `src-tauri/Cargo.toml` 与 `package.json` 各有一处，后者用于侧栏显示。

### Windows 打包

Tauri 2 的 Windows 构建必须在 Windows 主机或 Windows CI 上执行——macOS / Linux 无法交叉编译出可执行文件（需 MSVC 工具链与 WebView2 运行时）。

环境：Node.js ≥ 20、Rust 工具链（`stable-msvc`）、[Visual Studio 生成工具](https://visualstudio.microsoft.com/zh-hans/downloads/) 勾选「使用 C++ 的桌面开发」、[WebView2 运行时](https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/)（Windows 11 已内置）。

```powershell
npm install
npm run app:build
```

产物位于 `src-tauri/target/release/bundle/msi/`。`tauri.conf.json` 的 `bundle.targets` 是全局的 `["dmg", "app", "msi"]`，无按平台覆盖段；需要 `.exe` 安装器可把 `"nsis"` 加入该数组。

未签名的 `.msi` 首次运行会被 SmartScreen 拦截。如需消除警告，准备代码签名证书后设置 `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 再打包。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri 2（Rust：文件扫描 / 索引 / 搜索 / 配置 / AI 流式 / 网页导入 / 图片指纹 / 格式转换 / 字节区间读取） |
| 前端 | Vue 3 + Vite 6 + TypeScript |
| Markdown | marked + DOMPurify + mermaid + markmap |
| 编辑器 | CodeMirror 6（代码 / HTML / 超大文本流式只读）、textarea（Markdown）、内置 Office 内核 + Vue 3 视图（Office 三格式）、pdfjs + pdf-lib（PDF） |
| Office / PDF 读写 | 前端 `readFileBytes` / `readFileRange` / `writeFileBytes` 原始字节通道；Rust `office.rs` 的 Office↔Markdown 枢纽供摘要 / 转换 / 检索抽取 |
| PDF | `pdfjs-dist` 渲染 / 文本层 / 内嵌字体与图片提取、扫描件识别、墨色采样；`pdf-lib` 最小覆盖叠加改动并覆盖写回 |
| 图片 | `image` crate + dHash（Rust 端索引） |
| AI | `reqwest` SSE 流式代理，OpenAI 兼容 `chat/completions` |

Rust 命令分散在 `commands.rs`、`summary.rs`、`images.rs`、`convert/commands.rs`、`web_import/`、`lib.rs`，共 40 个；Office 主流程只用到 `read_file_as_bytes` / `write_file_bytes` / `read_office_md`，超大文本流式预览走 `read_file_range`。

### 目录结构

```
MdView
├── src/
│   ├── components/          # 页签、预览路由、编辑器、侧栏、AI、相似图片、各类弹窗
│   │   ├── PreviewPane.vue       # 多格式预览 / 编辑路由 + Office 页签常驻 + 超大文本流式分支
│   │   ├── OfficeEngineHost.vue  # 内置 Office 内核宿主（三格式共用）
│   │   ├── PdfEditor.vue         # PDF 编辑器（pdfjs 渲染 + pdf-lib 写回）
│   │   ├── MdPreview.vue / MindmapView.vue
│   │   ├── CodeEditor.vue        # CodeMirror：常规编辑 + 超大文本字节区间流式只读
│   │   └── BinaryViewer.vue / AiDrawer.vue / SimilarImages.vue / Sidebar.vue
│   ├── api.ts  store.ts  App.vue
│   ├── office/                       # 内置 Office 内核 + Vue 视图（MIT，见 LICENSE）
│   │   ├── core/  collab/  view/    # OOXML 解析 / 编辑 RPC / 富文本控制逻辑
│   │   ├── components/              # Word / Excel / PPT 三套 Vue 视图 + 共用幻灯片画布 OfficeSlideCanvas + OfficeIcon + Ribbon 工具条
│   │   ├── ribbon.ts  icons.ts       # 声明式工具条配置 + 图标路径表
│   │   ├── client.ts  docx-render.ts  media.ts  office-views.css
│   ├── utils/pdfEdit.ts                 # PDF 文本层 / 图片提取 / 增量写回纯逻辑
│   ├── utils/  styles/  composables/useWrap.ts   # 自动换行全局偏好
│   ├── docx/  pptx/  vendor/genoffice/   # 旧引擎封装，已不接主流程
│   └── __devtest__/                     # 开发期验证 harness
├── src-tauri/src/
│   ├── commands.rs  lib.rs  config.rs
│   ├── office.rs        # Office↔Markdown 枢纽 + 转换（3184 行）
│   ├── images.rs        # dHash 相似图片索引
│   ├── summary.rs       # 批量 AI 摘要 + 缓存
│   ├── convert/         # 转格式矩阵与序列化
│   └── web_import/      # 链接抓取、正文提取、资源本地化、视频号
├── docs/                # 检索方案、知识库设计、GenOffice 支持计划、UI 稿
├── scripts/             # 旧引擎验证 harness
└── assets/readme/       # README 视觉素材
```

---

## 已知边界

- **检索**：为逐文件 `contains` 扫描，无倒排索引、无向量库。「语义检索」实为 AI 摘要文本的子串命中，不是 embedding。`docs/lancedb-hybrid-search-plan.md`（LanceDB + bge-m3）与 `docs/knowledge-base-design.md`（SQLite FTS5，暂不做向量）两份设计并存，**均未落地**。`embedding_profile` / `vlm_profile` 仅为配置占位。
- **AI**：无批量打标命令；PDF 不支持摘要；md → PDF 导出为位图、文字不可选。
- **旧版二进制格式**：`.doc` / `.xls` / `.ppt` 及其模板（`.dot` / `.xlt` / `.pot` / `.pps`）由纯前端内核解析 CFB 复合文档后转 OOXML 打开，可预览可编辑；OOXML 模板（`.dotx` / `.xltx` / `.potx` / `.ppsx`）、ODF（`.odt` / `.ods` / `.odp` 及模板 / flat XML 变体）、RTF 同样走 Office 引擎。Word 6.0 / 95 及更早版本不支持；`.doc` 编辑保存后内容为 OOXML（按内容嗅探打开）。Rust 枢纽读 `.doc` 成 Markdown 仍会失败，调用处已吞掉，不影响预览。
- **PDF 编辑**：覆盖式文字编辑，不做版式重排；只有变化的字符被白块遮住并以位图重绘，未改动字符仍是原矢量文字，被遮的旧字符仍留在文本层（复制全文会带出）；标准 14 字体 / Type3 等未注册字体回退到系统中文字体，字形与原文档会有差异；「页面图片」只提取当前页；扫描件只读；无 OCR / 全文索引。
- **自动换行**：右键菜单替换了编辑器区系统菜单（复制 / 粘贴仍用 `Ctrl/⌘+C / V`）；Excel 单元格换行仍由 Ribbon 的格式命令控制，属于单元格属性而非软换行；PDF 页面画布本身不含文本行。
- **压缩包**：明确不支持预览。
- **体积上限**：常规文本全量可编辑上限 5MB（超过自动转流式只读预览，不拒绝打开）；索引深度 6、搜索深度 12、图片分组比较上限 3000。流式页签只读、不参与查找 / 转格式 / AI 摘要，详见「超大文本为什么不卡」。
- **Office / PDF 内核**：实例未设 LRU，多开大文档内存线性增长；宿主一次读全量字节；保存后重建视图会重置光标 / 滚动位置。`pdfjs-dist` 4.10.38 仍依赖 ES2024 `Promise.withResolvers`，Safari 17.4 / Chrome 119 之前的 WebView 需自行 polyfill。
- **旧代码**：`DocToolbar.vue`、`DocxInlineEditor.vue`、`OfficeSheetEditor.vue`、`PptxInlineEditor.vue`、`UniverDocEditor.vue` / `UniverSlideEditor.vue`、`src/docx`、`src/pptx`、`src/vendor/genoffice` 及若干旧 Tauri 命令已不接主流程，保留作回退参考；仓库内 `dist/` 为旧构建快照。
- AI 凭证需由用户在设置中自行配置与核对，密钥不存于应用外。

## License

[MIT](./LICENSE)
