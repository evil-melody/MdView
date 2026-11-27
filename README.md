<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="MdView：本地文件与 Markdown 一体化工作台，多页签预览编辑，Office 三格式由统一引擎原生编辑并写回原文件">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" alt="Tauri 2">
  <img src="https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white" alt="Vue 3">
  <img src="https://img.shields.io/badge/Rust-stable-DEA584?logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/Office-内核内置-7C5CFF" alt="Office 内核内置">
  <img src="https://img.shields.io/badge/license-AGPL--3.0-green" alt="AGPL-3.0 License">
</p>

**一个窗口管完本地资料库**：扫描目录、分类检索、多页签打开，Markdown / Word / Excel / PPT / PDF / 图片直接预览与编辑，保存写回原文件。文件内容不上传；链接导入与可选的 AI 能力才走网络。

<p align="center">
  <img src="./assets/readme/workflow.svg" width="100%" alt="工作流：扫描索引 → 多页签常驻 → 编辑与写回 → 本地智能，文件内容不上传">
</p>

## 一眼看懂

| 你想做的事 | MdView 怎么做 |
|---|---|
| 打开一堆本地文件 | 多资料库目录递归索引、13 类分类导航、最近更新、文件名与内容搜索 |
| 写 Markdown | 预览 / 编辑 / 脑图三模式，mermaid、markmap、KaTeX 公式、粘贴截图、查找替换、大纲跳转 |
| 改 Word / Excel / PPT | `docx / xlsx / pptx` 统一走内置 Office 内核（Vue 视图 + Worker 流式解析），三格式可编辑并配 Ribbon 工具栏，导出字节直接覆盖原路径 |
| 改 PDF | 非扫描件可点选改文字、粘贴 / 复制 / 提取图片；新字沿用文档自带字体、原墨色与原基线，只重绘改动字符；保存直接覆盖原 PDF |
| 看图片 / 音视频 | 内嵌预览，图片滚轮缩放与拖拽平移 |
| 换个格式 | 以 Markdown 为枢纽的转格式矩阵，PDF 走前端所见即所得导出 |
| 找重复图片 | Rust 端 dHash 感知哈希本地归组，不依赖 AI |
| 让 AI 帮忙 | 可选 OpenAI 兼容接口：流式摘要 / 打标 / 解读、批量摘要缓存 |
| 打开超大 SQL / 日志 | 超过 5 MB 流式只读预览：按 512 KB 字节区间读、跨块拼 UTF-8、分片追加，带进度条 |
| 反复切大文件页签 | 每个页签常驻一个引擎实例，切换只切显示：不重读盘、不重解析、不重排 |

## 这是什么

MdView 是 Tauri 2 桌面应用：Vue 3 前端负责界面与编辑器，Rust 后端负责文件扫描、索引、Office→Markdown 枢纽、图片指纹、AI 流式代理、网页导入与进程外引擎桥。所有文件操作在本机完成；配置文件与缓存落在 `config_dir/MdView/`。

Office 与 PDF 的预览 / 编辑不经过 Rust 的 Markdown 枢纽——前端内核直接读写字节，保存覆盖原路径。Rust 的 `office.rs` 服务于批量 AI 摘要、格式转换与搜索内容抽取。

---

## 功能模块

### 资料库与文件管理

- **多资料库目录**：侧栏、首页、资料库弹窗三处添加；移除需二次确认且只注销不删盘
- **扫描与索引**：单层目录扫描 + 全库递归索引（深度上限 6，跳过 `.` / `node_modules` / `target` / `dist` / `vendor`）；隐藏文件与临时产物自动过滤
- **分类导航**：Markdown / 文档 / 表格 / 演示 / PDF / 图片 / 文本 / 代码 / 配置 / 压缩包 / 音视频 / 其他，带计数；最近更新取前 200
- **搜索**：文件名 + 正文 `contains` 扫描（深度上限 12），AI 摘要文本并入命中；侧栏树输入即过滤
- **新建文件**：11 种类型（md / txt / json / yaml / toml / ini / html / sh + docx / xlsx / pptx）；Office 空白文档由内核 `core/blank.ts` 生成最小 OOXML 包，落盘即开即编
- **链接导入文章**：网页链接生成 `.md` 或 `.html`；正文图片本地化到 `<文档名>.assets/`，微信视频号链接转为离线可播放块
- **外部改动同步**：每 3 秒按 `size:mtime` 指纹轮询当前页签；有未保存改动时只打标点不覆盖
- **页签条**：横向滚轮滚动、脏 / 外部变更标点、右键批量关闭一次确认
- **打开方式**：Finder 拖入、系统文件关联冷启动、右键菜单（打开所在目录 / 复制路径 / 转格式 / 删除）

### 预览与编辑

| 格式 | 预览 | 编辑 | 实现 |
|---|---|---|---|
| Markdown / 文本 | ✅ | ✅ | marked + DOMPurify；预览态所见即所得编辑，编辑态双栏实时预览、滚动同步 |
| mermaid / markmap | ✅ | — | 流程图随主题重渲染；`flowchart` / `graph` / `sequenceDiagram` 等标注同样按 mermaid；脑图一键生成、大纲跳转 |
| 数学公式 | ✅ | — | KaTeX 渲染块级 `$$…$$`，源码 `$$` 与代码块占位保护 |
| 代码 / 配置 / HTML | ✅ | ✅ | CodeMirror 6：行号、高亮、补全、括号匹配、查找替换、代码折叠（JSON 等大文件按键/数组折叠）；HTML 压缩源码自动排版 |
| 超大文本（> 5 MB） | ✅ 流式只读 | — | Rust 字节区间读 → `TextDecoder(stream)` 跨块拼 UTF-8 → 分片追加，跳过语法解析 |
| Word `docx` | ✅ | ✅ | 内置内核：流式块树 + 自算分页虚拟渲染 |
| Excel `xlsx` | ✅ | ✅ | 内置内核：二维虚拟网格 + 单元格 / 公式 / 格式写入 |
| PPT `pptx` | ✅ | ✅ | 内置内核：按需取页 + 左侧真实缩略图 + 形状 / 文本编辑 |
| `csv / tsv` | ✅ | ✅ | 与 xlsx 同走表格引擎，保存写回原分隔符文本 |
| PDF | ✅ | ✅ | pdfjs 渲染 + 文本层命中 + pdf-lib 增量写回，覆盖原文件；扫描件只读 |
| 图片 | ✅ | — | 滚轮缩放 0.1–10×、拖拽平移、双击复位 |
| 音视频 | ✅ | — | 原生 `<audio>` / `<video>` |

- **粘贴截图**：编辑态 `⌘V` 存为同目录 png 并插入相对路径引用
- **查找 / 替换**：预览态 DOM 高亮跳转、编辑态选区定位；计数「当前 / 总数」
- **HTML 预览**：Rust 把本地资源内联为 `data:` URI，同源 iframe 渲染，快捷键转发主窗口
- **Office 右键菜单**：Word / PPT / 表格各有 Office 风格的上下文菜单（格式、插删行列、剪贴板读写、清除内容），全部自绘控件，随视口边缘夹紧
- **表格网格**：Excel 式无限行列、冻结窗格真实渲染、名称框跳转；所有输入框走内嵌模态，不依赖 WebView 不支持的 `window.prompt`

### Office 引擎

`docx / xlsx / pptx` 共用一条链路。**内核源码内置在 `src/office/`，视图层全部是 Vue，无运行时依赖、无 React、无外部 npm Office 包**（MIT 子许可见 `src/office/LICENSE`）。

```
readFileBytes → Blob → DocumentClient.open()
   → Vite Worker（真同源 URL，非 inline）：懒 ZIP / SAX 流式解析 / 按需 RPC
   → Vue 视图：分页虚拟渲染（Word）、二维虚拟网格（Excel）、按需取页（PPT）
   → client.call('save') → Uint8Array → writeFileBytes(原路径)
```

> Worker 用真 URL 而非 `?worker&inline`：inline 产物是 `data:text/javascript` worker，origin 为 null，字体资源（`fonts.wasm` 与 TTF）在 Worker 内不可达，xlsx 列宽度量直接断链。字体加载在主线程走 script 标签、在 Worker 走 fetch + 垫片，两条路都有探针钉住（x25 主线程 / x26 Worker 通道）。

| 层 | 位置 | 职责 |
|---|---|---|
| 内核 | `src/office/core/`（约 58k 行 TS） | ZIP / OPC / OOXML 解析、脏块写回、公式与编辑 RPC |
| 字体内核 | `src/office/core/font/` + `public/fonts/` | 自算度量：vendored `fonts.wasm`（FreeType + HarfBuzz + libhyphen，3.6MB）TS 封装、576pt 归一化测量、贪心断行 + 230 条禁则；Carlito（≡Calibri）随包 |
| 编辑逻辑 | `src/office/view/`（约 6.8k 行纯 TS） | 富文本输入控制器、段落 / 表格编辑、撤销重做、几何轴 |
| 视图 | `src/office/components/` | 三套 Vue 组件 + 共用幻灯片画布 + Ribbon 工具条 |
| 工具条配置 | `src/office/ribbon.ts` | 声明式 Ribbon：只描述命令名与参数，视图 `defineExpose` 防腐层执行 |
| 宿主 | `src/components/OfficeEngineHost.vue` | 打开 / 刷新 / 保存，按格式切换视图 |

**Ribbon 工具栏**：三格式共 16 选项卡 / 59 分组 / 266 个可点项（Excel 193→198：插图组补插入图表、获取数据组补三类刷新、汇总组补大纲级别；另修「清除」误删数据为清筛选、「隐藏批注」假开关接真命令），另有 56 个灰显占位（全部在 Excel，title 注明不支持原因，不放假按钮）。

- **Word**：开始 / 插入 / 布局 / 审阅 / 视图 5 选项卡——样式与对齐、表格行列合并、页眉页脚 / 页码、纸张页边距分栏、修订与批注、图片环绕与裁剪
- **Excel**：按桌面版还原 8 选项卡 / 198 项（含插入图表 / 图表·透视·序列刷新 / 大纲级别入口）——选区体系（拖选 / Shift 扩展 / ⌘ 加选 / 行列头 / 外框拖动搬移 / 填充柄四向 / 名称框）、133 函数目录与活公式（`<f>` 落盘、源格改跟随）、Office 式插入函数向导（类别→函数→参数→实时求值→确定写入，非模态可拖网格取参）、分类汇总 / 数据透视 / 自动筛选、条件格式 / 数据验证 / 切片器、原生图表 part、图片真实 OOXML drawing（浮图 twoCellAnchor 等比缩放不缩水、格内图 oneCellAnchor 撑大宿主）
- **PPT**：开始 / 插入 / 视图 3 选项卡——30 种形状、多选 / 对齐 / 分布 / 旋转 / 框选套选、母版与主题编辑、动画 7 preset（出现 / 强调 / 退出）+ 切换效果、演讲者备注、SmartArt 降级渲染、图表数据编辑（缓存点与 embedded xlsx 双写）
- **格式覆盖面**：OOXML 三件套及模板、ODF（odt / ods / odp 及 flat 变体）、RTF；`.doc / .xls / .ppt` 旧版二进制由内核解析 CFB 复合文档后转 OOXML 打开，可编可存
- **写回语义**：编辑导出 OOXML 覆盖原路径；未触碰部件字节恒等透传；保存后用新字节重建文档。图表 / 条件格式 / 透视 / 序列是可刷新对象（`xlsx.chartRefresh` / `pivotRefresh` / `seriesRefresh`）
- **页签常驻**：每个访问过的 Office / PDF 页签保留一个宿主实例，`v-show` 切换不销毁 Worker、不重读盘；大纲与渲染结果按页签缓存，隐藏态不触发重排

### Craft 双引擎 sidecar

 vendored 两个纯 Rust clean-room 办公引擎于 `src-tauri/vendor/`（MIT OR Apache-2.0）：

- **gridcraft**（Excel 克隆）：514 工作表函数、数据透视、原生图表、条件格式、动态数组；所有用户动作是 JSON 命令
- **wordcraft**（Word 克隆）：完整排版内核、分页、PDF / PNG 渲染、多格式读写（docx / doc / odt / rtf / pdf…）

桥接方式：Rust `craft.rs` spawn `<bin> mcp`（MCP stdio JSON-RPC 2.0：initialize → tools/call），暴露 `craft_call` / `craft_status` Tauri 命令；前端 `core/craft.ts` 提供类型化通道（gridcraft 22 工具 / wordcraft 18 工具）。两仓各自 patch 不同 egui fork，进程内不可共存，故一律进程外。**当前形态**：桥与契约探针已落地、双轨并存——TS 内核承担选区 / 编辑 / 渲染主流程，Craft 通道供 514 函数目录、透视 / 图表与排版内核等重能力按需接入，视图层消费逐步推进。

### PDF 在线编辑

`pdfjs-dist` 渲染当前页、提取文本层、识别扫描件；`pdf-lib` 只在原字节上叠加改动。保存经同一条原始字节通道 **覆盖原路径**，未改动页仍是原来的矢量文字，可选中、可搜索。

```
readFileBytes → pdfjs 单页渲染 + 文本层命中框（字体族 / 字号 / 基线 / 墨色）
   → SVG 覆盖层：文字替换 / 图片对象（拖动 · 缩放 · 删除）
   → pdf-lib 叠加：白块只遮变化字符 + 原字体新文字 + 图片
   → Uint8Array → writeFileBytes(原路径)
```

- **字体保真**：文档内嵌字体注册进 `document.fonts`，写回复用原字体 / 字号 / 基线，墨色从页面像素采样（不是纯黑）
- **最小覆盖**：按公共前后缀求差，白块只遮真正变化的字符区间，不做整行重绘
- **图片**：粘贴 / 插入 / 拖动 / 缩放 / 删除 / 复制回剪贴板；「页面图片」提取本页原有图片
- **扫描件**：前 3 页无文本层即判只读；`save()` 不落盘
- **兼容**：`pdfjs-dist` 锁 4.x——6.x 依赖 Tauri WebView 尚未提供的 API

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

> PDF 目标由前端 `marked → html2canvas → jsPDF` 所见即所得导出，仅支持 md 源，产物为位图。

### AI 助手（可选）

- 任意 **OpenAI 兼容接口**：多 profile（base_url / api_key / model），Rust `reqwest` SSE 流式代理
- 右下角悬浮窗流式输出：摘要 / 打标 / 解读；批量摘要 4 并发、按 `size:mtime` 指纹缓存
- 摘要文本并入搜索命中；未配置时提示并打开设置

### 相似图片（本地，与 AI 无关）

- Rust 端递归扫描 9 种图片扩展名，计算 9×8 灰度 **dHash**（64 bit），按指纹落盘缓存
- 并查集按汉明距离 ≤ 阈值连通（滑杆 0–20），只输出成员 ≥2 的分组
- 工具页：可释放空间估算、分组卡片、点击打开、单张删除自动重算

### 体验

- 深色 / 浅色主题一键切换（mermaid 与 Office 引擎同步重渲染）
- 内容区右键「自动换行」全局开关（CodeMirror / 文本 / Markdown / Word / PPT / 表格 / PDF 统一生效，偏好持久化）
- 首页统计与快捷入口、帮助页、侧栏拖拽调宽 / 收起、网格 / 列表视图、全局超薄滚动条
- 快捷键：`Ctrl/Cmd+S` 保存、`Ctrl/Cmd+F` 查找、`Esc` 关闭查找栏

---

## 构成

### 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri 2（Rust：扫描 / 索引 / 搜索 / 配置 / AI 流式 / 网页导入 / 图片指纹 / 格式转换 / 字节区间读 / Craft 桥） |
| 前端 | Vue 3 + Vite 6 + TypeScript |
| Markdown | marked + DOMPurify + mermaid + markmap + KaTeX |
| 编辑器 | CodeMirror 6（代码 / HTML / 流式只读）、内置 Office 内核 + Vue 视图（三格式）、pdfjs + pdf-lib（PDF） |
| 字节通道 | 前端 `readFileBytes` / `readFileRange` / `writeFileBytes`（Tauri 原始字节，不过 JSON IPC） |
| 进程外引擎 | gridcraft / wordcraft（纯 Rust，MCP stdio JSON-RPC sidecar） |
| 图片 | `image` crate + dHash |
| AI | `reqwest` SSE 流式代理 |

### 三条数据链路

1. **前端字节链**（Office / PDF 主流程）：`readFileBytes` → Worker 内核解析 / 编辑 → `save()` 出 Uint8Array → `writeFileBytes` 覆盖原路径。Rust 只搬运字节，不参与文档语义。
2. **Rust 枢纽链**（摘要 / 转换 / 检索）：`office.rs` 把 docx / xlsx / pptx / 旧二进制转 Markdown，供批量 AI 摘要、转格式矩阵与正文搜索抽取。
3. **Craft sidecar 链**（重引擎能力）：前端 `core/craft.ts` → Tauri `craft_call` → `craft.rs` 长连接 → 子进程 MCP 工具面。子进程崩溃自动重连，请求不悬挂。

Rust 命令共 43 个，分布在 `commands.rs`、`summary.rs`、`images.rs`、`convert/`、`craft.rs`、`web_import/`、`lib.rs`。

### 目录结构

```
MdView
├── src/
│   ├── components/          # 页签、预览路由、编辑器、侧栏、AI、相似图片、各类弹窗
│   │   ├── PreviewPane.vue       # 多格式预览 / 编辑路由 + 页签常驻 + 流式分支
│   │   ├── OfficeEngineHost.vue  # 内置 Office 内核宿主（三格式共用）
│   │   ├── PdfEditor.vue         # pdfjs 渲染 + pdf-lib 写回
│   │   └── CodeEditor.vue / MdPreview.vue / MindmapView.vue / Sidebar.vue …
│   ├── api.ts  store.ts  App.vue
│   ├── office/                       # 内置 Office 内核 + Vue 视图（MIT，见 office/LICENSE）
│   │   ├── core/  collab/  view/    # OOXML 解析 / 编辑 RPC / 富文本控制（core 约 58k 行）
│   │   ├── core/font/               # 字体度量内核：fonts.wasm TS 封装 / 断行 / 禁则表
│   │   ├── core/craft.ts            # Craft 双引擎前端桥（类型化通道）
│   │   ├── components/              # 三套视图 + 共用画布 + Ribbon
│   │   └── ribbon.ts  icons.ts      # 声明式工具条 + 图标表
│   ├── utils/pdfEdit.ts             # PDF 文本层 / 增量写回纯逻辑
│   └── __devtest__/                 # 开发期验证 harness
├── src-tauri/src/
│   ├── commands.rs  lib.rs  config.rs
│   ├── office.rs        # Office↔Markdown 枢纽
│   ├── craft.rs         # Craft sidecar 桥（MCP stdio JSON-RPC）
│   ├── images.rs  summary.rs  convert/  web_import/
│   └── vendor/          # gridcraft / wordcraft 引擎源码（独立构建，进程外）
├── docs/                # 差距矩阵、检索与知识库设计、UI 稿
└── assets/readme/       # README 视觉素材
```

工程纪律与逐阶段取证记录见 [`docs/onlyoffice-fidelity-gap.md`](docs/onlyoffice-fidelity-gap.md)（保真差距矩阵与路线图）。

---

## 对比业界

### 定位差异

MdView 不替代完整 Office 套件（无宏、协作 UI 未接、高级图表受限），它的生态位是：**本地资料库工作流 + Office 级保真的轻量编辑 + 真实 OOXML 写回**，且文件内容不出本机。

### 横向对比

| 项目 | 许可证 | 形态 | Office 保真路径 | OOXML 真实写回 | 运行重量 |
|---|---|---|---|---|---|
| **MdView** | AGPL-3.0 | Tauri 2 本地桌面 | TS 内核自算排版（fonts.wasm 逐字簇度量） | ✅ 原文件覆盖写回，未触碰部件字节恒等 | 单机零服务器，安装包级 |
| OnlyOffice | AGPL-3.0 | Web 套件 + 桌面编辑器 | sdkjs（TS/C++）自算 | ✅ | 协作需 DocumentServer |
| Collabora Online | MPL-2.0 | Web（LOKit WASM） | LibreOffice C++ 整编 WASM | ✅ | 服务器 + 数十 MB WASM 首屏 |
| Univer | Apache-2.0 | 可嵌入 SDK / Web | 自有快照数据模型 | △ OOXML 走导入 / 导出转换 | npm 依赖体系 |
| Luckysheet | MIT | Web 画布表格 | 自有 JSON 模型 | △ 经 LuckyExcel 导出 | 单前端库 |
| SheetJS (CE) | Apache-2.0 | 解析库 | 无渲染层 | 解析 / 写出，CE 不求值公式 | npm 库 |
| mammoth.js | BSD-2 | docx→HTML 转换 | 语义化转换，设计性丢弃版式 | ❌ 只读 | npm 库 |
| Obsidian | 闭源免费 | Electron 知识库 | Office 靠插件只读预览（docx-preview 等） | ❌ | 客户端，Electron 体积 |

### MdView 的具体优势

1. **自算排版，精度可控**：与 ONLYOFFICE sdkjs 同路线——行宽、断行、分页、分栏、列宽结算全部内核自算，不借浏览器原生排版（mammoth / docx-preview 一类转换方案版式即丢），也不把整套 C++ 编进 WASM（Collabora 数十 MB 首屏）。字体度量用 FreeType + HarfBuzz wasm（3.6MB）逐字簇 shaping，连字 / kerning 与实渲对齐。
2. **真实 OOXML 写回，不是导入导出**：编辑即修改原文件的部件（styles / drawings / charts / pivot 都是标准 part），未触碰内容字节恒等；存回后真 Office / WPS 打开无损。自有模型类产品（Univer / Luckysheet）的 OOXML 往返必然经过一次有损转换。
3. **本地优先**：文件内容不上传、零遥测、离线完整可用；对比需要 DocumentServer / COOL 服务器的 Web 套件。
4. **零运行时外部依赖**：Office 内核是仓库内 TS 源码 + Vue DOM 视图，无 React、无 CDN、无 npm Office 包——审计面与升级面都收敛在自己手里。
5. **比 Electron 轻**：Tauri 2 + Rust 壳，内存与包体显著小于同类桌面方案（Obsidian / OnlyOffice 桌面编辑器）。
6. **双引擎储备**：gridcraft / wordcraft 两个纯 Rust clean-room 引擎经 sidecar 桥就位（514 函数 / 透视 / 图表 / 排版内核），TS 轨与 Craft 轨并存，重能力按需接入而非推倒重写。
7. **工作流完整度**：Office 之外还覆盖 PDF 增量编辑（原字体 / 墨色 / 基线只重绘变化字符）、Markdown 枢纽转格式矩阵、dHash 相似图片、链接文章导入、可选 AI 摘要——是「资料库工作台」，不是单点查看器。

---

## 快速开始

环境：**Node.js ≥ 20**、**Rust 工具链**、Tauri 2 系统依赖（见 [Tauri 前置条件](https://tauri.app/start/prerequisites/)）。

```bash
npm install
npm run app:dev      # 开发模式，热更新
npm run app:build    # 打包发布（macOS .app/.dmg，Windows .msi）
```

| 命令 | 作用 |
|---|---|
| `npm run dev` | 仅启动 Vite 前端 |
| `npm run build` | `vue-tsc --noEmit` + `vite build` |
| `npm run app:dev` / `app:build` | 桌面开发 / 打包 |

桌面包位于 `src-tauri/target/release/bundle/`，当前版本 **1.1.0**。Windows 构建须在 Windows 主机执行（MSVC 工具链 + WebView2 运行时）；未签名 `.msi` 首次运行会被 SmartScreen 拦截，配置 `TAURI_SIGNING_PRIVATE_KEY` 后打包可消除。

Craft sidecar 需单独构建两个 vendored 引擎（各自独立 Cargo 树）：

```bash
cd src-tauri/vendor/gridcraft && cargo build --release   # 产出 gridcraft-cli
cd src-tauri/vendor/wordcraft && cargo build --release   # 产出 wordcraft-cli
```

也可用环境变量 `MDVIEW_GRIDCRAFT_BIN` / `MDVIEW_WORDCRAFT_BIN` 指向任意位置的二进制。未构建 sidecar 时应用照常运行，Craft 通道报错上抛、不影响主流程。

## 已知边界

- **检索**：逐文件 `contains` 扫描，无倒排索引 / 向量库；「语义检索」是 AI 摘要文本的子串命中
- **Office**：Word 修订作者单一、页眉页脚编辑仅文本行、分栏光标段落级；PPT 文本编辑按段落重建、编辑态与显示态逐 run 同构渲染，但**提交后多 run 塌缩为首 run 格式**（内核 `setShapeText` 既有语义，逐 run 持久化留 PptxEditor 接入升级路径）、SmartArt 为节点树降级渲染、形状布尔运算未做；Excel 的图表 / 条件格式 / 透视 / 序列的交互元数据存于私有 sidecar part，真实 Office 另存会丢弃（标准 part 不受影响）；`.doc` 编辑保存后内容为 OOXML；Word 6.0 / 95 及更早不支持。三件套的 Ctrl+F 打开当前文档查找栏；多页签常驻的隐藏实例不抢键盘焦点；Word 格式刷与表格跨格删除、PPT 浏览/放映视图的键盘语义已按桌面版对齐
- **macOS 撤销**：原生菜单不提供 Undo/Redo 项（Tauri 默认菜单的预定义项会在 `performKeyEquivalent:` 阶段截走 ⌘Z/⇧⌘Z 交给 NSUndoManager，画布与自维护历史拿不到键）——三视图撤销重做统一走 JS 键盘链（⌘Z / ⇧⌘Z / ⌘Y）
- **Craft sidecar**：视图层消费逐步推进，当前主流程仍走 TS 内核
- **PDF**：覆盖式文字编辑不做版式重排；被白块遮的旧字符仍在文本层（复制全文会带出）；扫描件只读；无 OCR
- **体积**：常规文本可编辑上限 5 MB（超出转流式只读，不拒绝打开）；流式页签不参与查找 / 转格式 / AI；Office / PDF 页签实例未设 LRU，多开大文档内存线性增长
- **压缩包**：不支持预览
- **兼容**：`pdfjs-dist` 4.10.38 依赖 ES2024 API，旧 WebView 需 polyfill；macOS 上 Ctrl+click 归系统右键，加选统一 ⌘
- **旧代码**：`src/docx`、`src/pptx`、`src/vendor/genoffice` 及若干旧编辑器已不接主流程，保留作回退参考
- AI 凭证由用户在设置中自行配置，密钥不离开本机

## License

仓库根的 [`LICENSE`](./LICENSE) 为 **AGPL-3.0**。选此许可的理由是具体的：本项目的高保真内核逐式移植自 ONLYOFFICE sdkjs，而 sdkjs 本身是 AGPL-3.0——派生作品以 AGPL 收敛是不留后路的保守解。

内置 Office 内核 `src/office/` 中的第三方派生段单独以 MIT 子许可（见 [`src/office/LICENSE`](src/office/LICENSE)），vendored 的 gridcraft / wordcraft 各自保留 MIT OR Apache-2.0 双许可声明；整仓仍按 AGPL-3.0 分发。

**作为桌面应用的含义**：AGPL-3.0 的远程网络交互条款（§13）只在软件通过网络向远端用户提供交互时触发。MdView 是本地桌面程序、文件内容不上传，正常分发形态下与 GPLv3 行为一致；若日后作为网络服务对外提供交互界面，则须按 §13 向远端用户开放完整源代码。
