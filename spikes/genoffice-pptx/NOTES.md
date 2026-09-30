# GenOffice PPTX 引擎接入验证（MdView spike）

目标：用 [genspark-ai/genoffice](https://github.com/genspark-ai/genoffice) 的 TS 引擎替换 MdView 自研
Rust PPTX 渲染，先验证 **显示（渲染）** 保真度，再谈编辑（写回）。

## 结论

可行，且保真度显著优于自研 `office.rs`：真实 Slidesgo 模板 73 页在浏览器栈内
**解析 44ms + 首屏 6 页渲染 <100ms，缺失媒体 0**，slideLayout/slideMaster 继承、`cxnSp`
连接线、嵌套 group、表格、图片 `srcRect` 裁剪、项目符号/悬挂缩进、超链接着色全部还原。

架构选择：**保留 Tauri + Vue 外壳，只取 GenOffice 的纯 TS 包**，抛弃其 Electron/React 应用层
（`apps/*`、`packages/ui`）。License = Apache-2.0，可嵌入（保留 NOTICE）。

## 用到的包（均为纯 TS，Electron-free）

| 包 | 作用 |
|---|---|
| `@genoffice/pptx-engine` | OOXML 解析：继承链（master→layout→slide）、rels、`cxnSp`、custGeom、表格、媒体 |
| `@genoffice/pptx-render` | 生成 **RenderTree**（像素坐标 + 解析后样式 + 文本度量），零 Node 依赖 |
| `@genoffice/pptx-ops` | 编辑/写回操作层（本 spike 未接，下一阶段） |

`pptx-render` 产出 RenderTree，官方 `apps/slides` 用 react-konva 把它画到 canvas；
本 spike 写了一个约 400 行的 **SVG 发射器**（`src/svg.ts`）替代 Konva —— 更轻、可直接进
Tauri webview，且便于靠 DOM 断言做自动验证。

## 集成中踩到的 5 个坑（按严重度）

1. **`Buffer` 只能按文件注入，不能全局 inject。**
   engine 有 84 处 `Buffer`。用 esbuild `inject` 全局替换会把 JSZip 的
   `support.nodebuffer = typeof Buffer !== 'undefined'` 变成真，浏览器里误走 Node 解码分支
   → **archive 条目全空**（报 `missing ppt/presentation.xml`）。
   正解：`onLoad` 只对 `genoffice/packages/*/src/*.ts` 前置 `const Buffer = 自定义 shim`。

2. **度量字体栈必须与绘制字体栈完全一致。**
   canvas 用 `21.3px "Montserrat"`（缺失→sans-serif），SVG 用 `font-family="Montserrat"`
   （缺失→文档默认 serif）；或者 webfont 在度量之后才真正加载 → 引擎烘定的 run advance
   与实际字形宽度不符 → **词间空格被"吞"、文字重叠**。
   正解：`src/fonts.ts` 单一字体栈（`"X", "Helvetica Neue", Arial, sans-serif`）同时喂给
   `ctx.font` 与 `font-family`，并在布局前显式 `document.fonts.load()` 每个字重（`ready`
   不够，Google Fonts 是懒加载）。

3. **`pptx-render` 的 run 坐标是连续递增的，不要自行累加。**
   每个 run 绝对 x 已含前序 advance（`292.25 + 75.05 = 367.30` 是空格 run 的起点）。发射器
   逐 run 输出 `<text x=...>` 即可，重复累加会产生大间隔。

4. **图片是"嵌套 `<svg viewBox>` + 1×1 `<image>` 拉伸"实现 `srcRect` 裁剪。**
   页面 CSS 若写成 `.canvas svg { width:100% }`，会把嵌套 svg 也撑到整页尺寸 → 图片层错位。
   必须用 `.canvas > svg`。

5. **图片节点必须显式 `translate(box.x, box.y)`。**
   `pivotWrap` 只处理旋转/翻转；遗漏平移会让每张图片落到画布原点、压住文字首字符。

## 验证方式

- `browser-test.html?only=N&w=1400` —— 单页放大渲染（headless Chrome 截图肉眼验收）
- `browser-test.html?only=N&runs=1` —— 把 RenderTree 的节点 box + run 级几何 dump 到 DOM，
  用于**数据级**验证（比肉眼快且不会误判）
- 命令行：
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --allow-file-access-from-files --virtual-time-budget=40000 --dump-dom "file://…/browser-test.html?only=7&w=1400&runs=1"`
- 证据图见 `evidence/`（slide 1/2/3/7/10）

## 下一阶段（编辑/写回）待做

1. 把 RenderTree → 可编辑 DOM 的映射接上 `pptx-ops`，写回保持未修改部件字节级不变。
2. 字体改为**随包内置**（FontFace + opentype 度量），去掉对 Google Fonts 的运行时依赖。
3. 与 MdView 现有 `PptxInlineEditor` 的交互（图片替换、文本编辑）对齐接口。
4. 大文件（130MB+）按页懒渲染：RenderTree 只保留当前页 + 邻页。
