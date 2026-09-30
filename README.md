<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="MdView — 本地文件与 Markdown 一体化工作台，支持预览、编辑、脑图与 Office 原生编辑">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" alt="Tauri 2">
  <img src="https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white" alt="Vue 3">
  <img src="https://img.shields.io/badge/Rust-stable-DEA584?logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License">
</p>

---

## 这是什么

**MdView** 是一个纯本地的桌面文件工作台：把你的资料库目录索引成可分类浏览的文件库，Markdown / Word / Excel / PPT / PDF / 图片在一个窗口内预览、编辑与管理，并可选接入远程 AI（OpenAI 兼容接口）做流式摘要、批量打标与相似图片归组。不依赖任何在线服务，文件不出本机。

<p align="center">
  <img src="./assets/readme/workflow.svg" width="100%" alt="工作流：扫描资料库 → 分类导航 → 多页签预览编辑 → 保存写回原格式，全程可调用远程 AI">
</p>

## 功能

### Markdown 工作台
- **预览 / 编辑 / 脑图** 三模式页签，随时切换
- GFM 语法、代码高亮、**Mermaid 图表**实时渲染
- **Markmap 思维导图**一键生成，大纲导航跳转
- **粘贴截图**：编辑态 `⌘V` 直接贴入剪贴板图片，自动存为文档同目录 `image-<时间戳>.png` 并插入相对路径引用（对标 Typora / Obsidian）
- 本地图片相对路径自动解析，离线可用

### 全格式文件支持
| 类型 | 预览 | 编辑 | 引擎 / 说明 |
|---|---|---|---|
| Markdown / 文本 / 代码 | ✅ | ✅ | marked 渲染 + CodeMirror 高亮编辑 |
| Word（docx） | ✅ 富渲染 | ✅ **原生编辑** | 自研 `DocxInlineEditor` + GenOffice docx-engine，**字节保真**写回 `.docx`，含图片 / 表格 / 分页符；**Word Ribbon 工具栏**（开始 / 插入选项卡、字体 / 段落 / 样式 / 上标下标 / 字体色 / 高亮） |
| Excel（xlsx / csv） | ✅ 富渲染 | ✅ **原生编辑** | Univer 表格，值 / 公式 / 样式 / 列宽往返 |
| PPT（pptx） | ✅ | ✅ **原生编辑** | GenOffice pptx-engine，文字编辑 + 图片替换 + 失焦自动保存 |
| PDF | ✅ | — | 只读预览 |
| 图片（png / jpg / svg…） | ✅ | — | 滚轮缩放、拖拽平移、双击复位 |
| HTML | ✅ | ✅ 文本 | WebView 原生渲染（脚本与相对资源照常加载）+ 文本编辑 |
| 音视频 / 压缩包 | ✅ | — | 内嵌播放 / 解包浏览 |

> Office 预览 / 编辑统一走自建渲染内核，已规避第三方预览组件硬编码双 Vue 实例导致的运行时崩溃（实例 `update` 失败 / `vnode.shapeFlag` / `emitsOptions` 级联崩溃）。

### 文件管理
- 多资料库目录管理，自动扫描索引，隐藏文件过滤
- **新建文件**：侧栏资料库标题栏 / 文件浏览器工具栏进入，弹窗选类型（Markdown · 纯文本 · JSON · YAML · TOML · INI · HTML · Shell）与文件名，默认落当前打开目录（可改到其它位置），创建后直接进入编辑
- **另存为**：原生保存弹窗另选位置，落盘后页签跟随新文件
- **分类导航**：Markdown / 文档 / 表格 / 演示 / PDF / 图片 / 代码 / 配置 / 压缩包 / 音视频
- 文件名与内容全文检索、最近更新列表、多页签并行打开
- 右键菜单：Finder 中显示 / 复制路径 / 删除（二次确认）
- **左右联动**：右侧增删改 / 新建 / 另存为 / 粘贴截图后，左侧资料库树自动重扫并保留展开态；标题栏刷新按钮可整体重扫（树 + 列表 + 索引），覆盖在应用外改动文件的场景

### 相似图片（本地智能归组）
- Rust 端 `images.rs` 递归扫描图片，计算 **dHash** 9×8 灰度指纹（缓存按指纹复用，每 20 张落盘）
- 前端「相似图片」工具页：索引计数 + 阈值滑杆（0–20，默认 10）+ 分组卡片（缩略图 / 尺寸 / 体积 / 路径，点击打开、单张删除）+ 可释放空间估算；删除后自动刷新分组

### AI 助手（可选）
- 对接任意 **OpenAI 兼容接口**（base_url + api_key + model）
- 右下角悬浮窗，**流式输出**：文件摘要 · 自动打标 · 内容解读
- **批量 AI 摘要**：文件浏览器工具栏「✨ AI 摘要 / ↻ 重算」一键生成，摘要首行展示（悬浮看全文），缓存按 `size:mtime` 指纹判失效
- **语义检索**：文件树过滤与搜索命中**包含摘要语义**（正文没有的关键词也能命中）

### 体验
- 深色 / 浅色主题一键切换
- 多页签、大纲侧栏、全局超薄透明滚动条
- `⌘+Shift+I` / `F12` 打开 WebView 调试器（开发构建）

## 快速开始

环境要求：**Node.js ≥ 20**、**Rust 工具链**（含 Tauri 2 系统依赖，参考 [Tauri 前置条件](https://tauri.app/start/prerequisites/)）。

```bash
# 安装依赖
npm install

# 开发模式（热更新）
npm run app:dev

# 打包发布（产出 .app / .dmg）
npm run app:build
```

打包产物位于 `src-tauri/target/release/bundle/`。

## Windows 打包

Tauri 2 的 Windows 构建**必须在 Windows 主机（或 Windows CI）上执行**——macOS / Linux 无法交叉编译出 Windows 可执行文件（需要 MSVC 工具链与 WebView2 运行时）。在 Windows 上按以下步骤构建：

### 环境要求
- **Node.js ≥ 20**
- **Rust 工具链**：`rustup` 安装时勾选 **MSVC 构建工具**（或 `rustup toolchain install stable-msvc`）
- **Microsoft C++ 生成工具（MSVC）**：安装 [Visual Studio 生成工具](https://visualstudio.microsoft.com/zh-hans/downloads/)，勾选「使用 C++ 的桌面开发」
- **WebView2 运行时**：Windows 11 已内置；Windows 10 需在[微软官网](https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/)安装（Tauri 2 渲染依赖）

### 构建
```powershell
# 安装依赖
npm install

# 打包发布（产出 .msi 安装包）
npm run app:build
```

产物位于 `src-tauri/target/release/bundle/msi/MdView_1.0.2_x64_en-US.msi`，双击即装。

> 安装包版本号取自 `src-tauri/Cargo.toml` 的 `[package] version`（`tauri.conf.json` 未声明 `version` 时按官方规则回落到 Cargo.toml）。改版本只需改 Cargo.toml 一处。

### 说明与可选加固
- **跨平台产物差异**：macOS 产出 `.app / .dmg`，Windows 产出 `.msi`（已在 `tauri.conf.json` 的 `bundle.windows.targets` 中配置），两者互不兼容，需各自在对应系统打包。
- **安装包签名（可选）**：未签名的 `.msi` 在首次运行时会被 SmartScreen 拦截。如需消除警告，准备代码签名证书后设置环境变量再打包：
  ```powershell
  $env:TAURI_SIGNING_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY----- ..."
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "你的密钥密码"
  npm run app:build
  ```
  正式发布建议同时做 [Microsoft 智能屏幕](https://learn.microsoft.com/zh-cn/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/) 信任的 EV 代码签名证书。
- **NSIS 安装包（可选）**：若偏好 `.exe` 安装器，将 `tauri.conf.json` 中 `bundle.windows.targets` 改为 `["nsis", "msi"]` 即可。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri 2（Rust 后端：commands 文件扫描 / 索引 / Office 读写 / 图片指纹） |
| 前端 | Vue 3 + Vite 6 + TypeScript |
| Markdown | marked + DOMPurify + mermaid + markmap |
| Word 编辑 | 自研 `DocxInlineEditor` + GenOffice docx-engine（OOXML 块树 + 脏块重写，字节保真） |
| PPT 编辑 | GenOffice pptx-engine（纯 TS，字节保留） |
| 表格编辑 | Univer Sheets + exceljs 桥接 |
| 图片归组 | `image` crate + dHash 指纹（Rust 端索引） |
| Office 解析 | mammoth（docx→HTML 兜底）、SheetJS（xlsx）、vue-files-preview（PDF / 音视频） |

> Univer 同时内置文档 / 幻灯片编辑器组件（实验性，未接入主预览流）；当前文档走自研 `DocxInlineEditor`，演示走 GenOffice pptx-engine。

## 目录结构

```
MdView
├── src/                      # Vue 前端
│   ├── components/           # 页签 / 编辑器 / 工具栏 / AI 抽屉 / 相似图片等组件
│   │   ├── DocxInlineEditor.vue   # docx 自研渲染 + 编辑（GenOffice 引擎）
│   │   ├── DocToolbar.vue         # Word Ribbon 工具栏
│   │   ├── PptxInlineEditor.vue   # pptx 原生编辑（GenOffice 引擎）
│   │   ├── OfficeSheetEditor.vue  # xlsx 表格编辑（Univer）
│   │   ├── MdPreview.vue / MindmapView.vue
│   │   ├── PreviewPane.vue         # 多格式预览 / 编辑路由
│   │   ├── SimilarImages.vue       # 相似图片工具页
│   │   ├── AiDrawer.vue            # AI 悬浮窗
│   │   └── FileTree.vue / FileBrowser.vue / Sidebar.vue
│   ├── docx/  pptx/         # Office 解析 / 渲染 / 保存引擎封装
│   ├── vendor/genoffice/     # GenOffice docx/pptx 引擎（vendored）
│   ├── utils/  styles/  composables/
├── src-tauri/               # Rust 后端
│   ├── commands.rs          # Tauri commands 入口
│   ├── office.rs            # Office 读写为 Markdown 枢纽 + 转换
│   ├── images.rs            # 相似图片 dHash 索引
│   ├── summary.rs           # 批量 AI 摘要 + 缓存
│   └── config.rs / lib.rs / main.rs
├── scripts/                 # docx/pptx 字节保真验证 harness
└── assets/readme/           # README 视觉素材
```

## 已知边界

- **OCR / 扫描转换**：规划中，尚未实现（计划：本地离线 OCR → 图片转 docx → PDF 转 Word）。
- **旧版二进制格式**（`.doc` / `.xls` / `.ppt`）：上游引擎不支持，UI 提示「另存为新格式」后编辑。
- **PDF 编辑**：当前仅只读预览，编辑为远期规划。
- 所有涉及 AI 凭证的操作需由用户在设置中自行配置与核对，密钥不存于应用外。

## License

[MIT](./LICENSE)
