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

**MdView** 是一个纯本地的桌面文件工作台：把你的资料库目录索引成可分类浏览的文件库，Markdown / Word / Excel / PPT / PDF / 图片在一个窗口内预览、编辑与管理，并可选接入远程 AI（OpenAI 兼容接口）做流式摘要与打标。不依赖任何在线服务，文件不出本机。

<p align="center">
  <img src="./assets/readme/workflow.svg" width="100%" alt="工作流：扫描资料库 → 分类导航 → 多页签预览编辑 → 保存写回原格式，全程可调用远程 AI">
</p>

## 功能

### Markdown 工作台
- **预览 / 编辑 / 脑图** 三模式页签，随时切换
- GFM 语法、代码高亮、**Mermaid 图表**实时渲染
- **Markmap 思维导图**一键生成，大纲导航跳转
- 本地图片相对路径自动解析，离线可用

### 全格式文件支持
| 类型 | 预览 | 编辑 | 说明 |
|---|---|---|---|
| Markdown / 文本 / 代码 | ✅ | ✅ | 语法渲染 + 文本编辑 |
| Word（docx） | ✅ 富渲染 | ✅ 原生编辑 | canvas-editor，保存写回 docx，**保留图片与格式** |
| Excel（xlsx / csv） | ✅ 富渲染 | ✅ 原生编辑 | Univer 表格，值 / 公式 / 样式 / 列宽往返 |
| PPT（pptx） | ✅ | — | 只读预览 |
| PDF | ✅ | — | 只读预览 |
| 图片（png / jpg / svg…） | ✅ | — | 滚轮缩放、拖拽平移、双击复位 |
| HTML | ✅ | — | WebView 原生渲染，脚本与相对资源照常加载 |
| 音视频 / 压缩包 | ✅ | — | 内嵌播放 / 解包浏览 |

### 文件管理
- 多资料库目录管理，自动扫描索引，隐藏文件过滤
- **分类导航**：Markdown / 文档 / 表格 / 演示 / PDF / 图片 / 代码 / 配置 / 压缩包 / 音视频
- 文件名与内容全文检索、最近更新列表、多页签并行打开
- 右键菜单：Finder 中显示 / 复制路径 / 删除（二次确认）

### AI 助手（可选）
- 对接任意 **OpenAI 兼容接口**（base_url + api_key + model）
- 右下角悬浮窗，**流式输出**：文件摘要 · 自动打标 · 内容解读

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

产物位于 `src-tauri/target/release/bundle/msi/MdView_0.1.0_x64_en-US.msi`，双击即装。

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
| 桌面框架 | Tauri 2（Rust 后端，commands 文件扫描 / 读写 / Office 转换） |
| 前端 | Vue 3 + Vite 6 + TypeScript |
| Markdown | marked + DOMPurify + mermaid + markmap |
| Word 编辑 | canvas-editor + plugin-docx（OOXML 导入导出） |
| 表格编辑 | Univer Sheets + exceljs 桥接 |
| Office 解析 | mammoth（docx→HTML）、SheetJS（xlsx） |

## 目录结构

```
MdView
├── src/                  # Vue 前端
│   ├── components/       # 页签、编辑器、AI 抽屉等组件
│   ├── utils/            # Markdown 解析 / viewer 分流
│   └── styles/           # 主题变量与全局样式
├── src-tauri/            # Rust 后端（扫描 / 索引 / Office 读写）
└── assets/readme/        # README 视觉素材
```

## License

[MIT](./LICENSE)
