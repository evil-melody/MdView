//! 文本类格式互转（markdown 枢纽的读写两侧）
//!
//! 对齐 InspireLoom `src-tauri/src/services/format_convert/text.rs`，按 MdView
//! 「文档类优先」的矩阵裁剪：md ↔ txt / html，csv → md，md → csv。
//!
//! 设计取舍：
//! - md → html / md → txt 直接复用已依赖的 `pulldown-cmark`（事件流），无新增 crate；
//! - html → md 为**轻量标签映射**（覆盖标题/段落/列表/引用/代码/强调/链接/图片/表格），
//!   非完整 HTML5 解析器 —— 对"网页另存为 HTML 再转回 Markdown"的常见形态够用；
//! - csv 解析为手写状态机（支持双引号包裹与 `""` 转义），不引入 csv crate。

use pulldown_cmark::{html, Event, Options, Parser, Tag, TagEnd};

/// 编辑型 Markdown 解析选项（表格 / 删除线 / 任务列表 / 脚注）。
fn md_options() -> Options {
    let mut o = Options::empty();
    o.insert(Options::ENABLE_TABLES);
    o.insert(Options::ENABLE_STRIKETHROUGH);
    o.insert(Options::ENABLE_TASKLISTS);
    o.insert(Options::ENABLE_FOOTNOTES);
    o
}

/// Markdown -> 独立 HTML 文档（自带基础排版样式，可直接双击打开 / 转 PDF）。
pub fn md_to_html(md: &str) -> String {
    let mut body = String::new();
    html::push_html(&mut body, Parser::new_ext(md, md_options()));
    format!(
        "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n\
<title>Document</title>\n<style>{}</style>\n</head>\n<body>\n{body}\n</body>\n</html>\n",
        HTML_DOC_CSS
    )
}

/// Markdown -> 纯文本：走同一事件流，只保留可见文本，丢弃所有标记。
pub fn md_to_text(md: &str) -> String {
    let mut out = String::new();
    let mut list_depth = 0usize;
    let mut in_code = false;
    for ev in Parser::new_ext(md, md_options()) {
        match ev {
            Event::Start(Tag::Item) => out.push_str(&"  ".repeat(list_depth.saturating_sub(1))),
            Event::End(TagEnd::Item) => out.push('\n'),
            Event::Start(Tag::List(_)) => list_depth += 1,
            Event::End(TagEnd::List(_)) => {
                list_depth = list_depth.saturating_sub(1);
                out.push('\n');
            }
            Event::Start(Tag::CodeBlock(_)) => {
                in_code = true;
                out.push('\n');
            }
            Event::End(TagEnd::CodeBlock) => {
                in_code = false;
                out.push('\n');
            }
            Event::Text(t) => out.push_str(&t),
            Event::Code(t) => out.push_str(&t),
            Event::SoftBreak => out.push(if in_code { '\n' } else { ' ' }),
            Event::HardBreak => out.push('\n'),
            Event::Rule => out.push_str("\n---\n"),
            Event::End(TagEnd::Paragraph) | Event::End(TagEnd::Heading(_)) => {
                out.push_str("\n\n")
            }
            Event::End(TagEnd::TableRow) => out.push('\n'),
            Event::End(TagEnd::TableCell) => out.push('\t'),
            _ => {}
        }
    }
    collapse_blank_lines(&out)
}

/// HTML -> Markdown（轻量标签映射）。
pub fn html_to_md(html_src: &str) -> String {
    let stripped = strip_noise(html_src);
    // code block 先整块摘出：否则 `<pre><code>` 会在围栏里多出一对行内反引号，
    // 且块内缩进/空白会被通用标签替换破坏。
    let (mut s, pre_blocks) = extract_pre_blocks(&stripped);
    s = replace_anchors(&s);
    s = replace_images(&s);
    // 列表先于通用 `<p>`/`\n\n` 替换处理：否则 `<li><p>文字</p></li>` 会被切断成
    // 空 `- ` 标记 + 独立段落，正文与标记脱钩。
    s = replace_lists(&s);
    // 表格整块转 Markdown 管道表格（补 `| --- |` 分隔行，否则 GFM 不渲染）。
    s = replace_tables(&s);

    // 其余标签 -> 标记。
    //
    // 顺序敏感，且每个模式都写成 `<tag>` / `<tag [^>]*>` 两种精确形状，
    // 避免前缀误伤（`<p` 会命中 `<pre>`、`<b` 会命中 `<blockquote>`、`<i` 会命中 `<img>`）。
    s = replace_ci(&s, "<h1[^>]*>", "\n\n# ");
    s = replace_ci(&s, "<h2[^>]*>", "\n\n## ");
    s = replace_ci(&s, "<h3[^>]*>", "\n\n### ");
    s = replace_ci(&s, "<h4[^>]*>", "\n\n#### ");
    s = replace_ci(&s, "<h5[^>]*>", "\n\n##### ");
    s = replace_ci(&s, "<h6[^>]*>", "\n\n###### ");
    s = replace_ci(&s, "</h1>|</h2>|</h3>|</h4>|</h5>|</h6>", "\n\n");
    s = replace_ci(&s, "<blockquote[^>]*>", "\n\n> ");
    s = replace_ci(&s, "</blockquote>", "\n\n");
    s = replace_ci(&s, "<li>|<li [^>]*>", "\n- ");
    s = replace_ci(&s, "</li>", "");
    s = replace_ci(&s, "<ul[^>]*>|</ul>|<ol[^>]*>|</ol>", "\n\n");
    s = replace_ci(&s, "<p>|<p [^>]*>", "\n\n");
    s = replace_ci(&s, "</p>", "\n\n");
    s = replace_ci(&s, "<br[^>]*>", "  \n");
    s = replace_ci(&s, "<hr[^>]*>", "\n\n---\n\n");
    s = replace_ci(&s, "<strong[^>]*>|<b>|<b [^>]*>", "**");
    s = replace_ci(&s, "</strong>|</b>", "**");
    s = replace_ci(&s, "<em[^>]*>|<i>|<i [^>]*>", "*");
    s = replace_ci(&s, "</em>|</i>", "*");
    s = replace_ci(&s, "<del[^>]*>|<s>|<s [^>]*>|</del>|</s>", "~~");
    s = replace_ci(&s, "<code[^>]*>|</code>", "`");
    // 剩余标签一律剥离（保留其文本内容）
    s = replace_ci(&s, "<[^>]*>", "");

    let s = reinsert_pre_blocks(&decode_entities(&s), &pre_blocks);
    collapse_blank_lines(&s)
}

/// 占位符包裹：`\u{0}` 不出现在正常文本里，可安全充当哨兵。
const PRE_SENTINEL: char = '\u{0}';

/// 摘出所有「预格式化」代码块（`<pre>`，或 style 含 `white-space:pre` / `pre-wrap` 的标签，
/// 典型如微信文章用 `<span style="white-space:pre-wrap;...">` 包裹的代码），原位置换成哨兵占位符。
///
/// 采用绝对位置扫描 + 嵌套感知匹配：开标签结束处起逐层找同名闭标签（void 元素不计入深度），
/// 整块（含内部标签）从正文摘除，交由 `code_inner` 净化后塞回围栏，避免换行在通用去标签逻辑里丢失。
fn extract_pre_blocks(s: &str) -> (String, Vec<String>) {
    let mut out = String::new();
    let mut blocks: Vec<String> = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0usize;
    while i < s.len() {
        let Some(lt) = s[i..].find('<').map(|r| i + r) else {
            out.push_str(&s[i..]);
            break;
        };
        // 先把 `<` 之前的普通文本收下
        out.push_str(&s[i..lt]);

        // 引号感知地定位标签结束 `>`
        let Some(gt) = find_tag_end(bytes, lt + 1) else {
            out.push_str(&s[lt..]);
            break;
        };
        let tag = &s[lt..=gt];

        // 闭标签：原样保留给后续通用替换
        if gt > lt && bytes[lt + 1] == b'/' {
            out.push_str(tag);
            i = gt + 1;
            continue;
        }

        // 非标签（如 `<!doctype`、`<?xml`）或普通开标签：原样保留
        let Some(name) = tag_name(tag) else {
            out.push_str(tag);
            i = gt + 1;
            continue;
        };

        // 预格式化代码块：整块摘出
        if is_pre_like(tag) {
            if let Some(close_end) = scan_code_block(s, gt + 1, &name) {
                let inner = &s[gt + 1..close_end];
                let code = code_inner(&name, inner);
                if code.trim().is_empty() {
                    // 空代码块（如微信仅占位用的 white-space:pre-wrap 空 span）：
                    // 不生成围栏，原样保留标签交给后续通用替换处理。
                    out.push_str(tag);
                } else {
                    blocks.push(code);
                    out.push_str(&format!(
                        "{PRE_SENTINEL}MDVPRE{}{PRE_SENTINEL}",
                        blocks.len() - 1
                    ));
                }
                i = close_end;
                continue;
            }
        }

        // 非代码块开标签：原样保留
        out.push_str(tag);
        i = gt + 1;
    }
    (out, blocks)
}

/// 哨兵占位符还原为 Markdown 围栏代码块。
fn reinsert_pre_blocks(s: &str, blocks: &[String]) -> String {
    let mut out = s.to_string();
    for (i, code) in blocks.iter().enumerate() {
        let token = format!("{PRE_SENTINEL}MDVPRE{i}{PRE_SENTINEL}");
        let fenced = format!("\n\n```\n{}\n```\n\n", code.trim_matches('\n'));
        out = out.replace(&token, &fenced);
    }
    out
}

/// 列表专用转换：在通用 `<p>`/`\n\n` 替换之前，把 `<ul>/<ol>` 整块摘出并逐 `<li>`
/// 转 Markdown 标记。列表项**内部**的块级标签（`<p>/<div>/<section>`）只折叠为单空格，
/// 避免 `- ` 标记与正文被 `\n\n` 切断而脱钩（微信文章 `<li><p>文字</p></li>` 的典型坑）。
/// 嵌套列表按层级缩进递归处理。
fn replace_lists(s: &str) -> String {
    replace_lists_inner(s, 0)
}

fn replace_lists_inner(s: &str, depth: usize) -> String {
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0usize;
    while i < s.len() {
        let Some(lt) = s[i..].find('<').map(|r| i + r) else {
            out.push_str(&s[i..]);
            break;
        };
        out.push_str(&s[i..lt]);
        let Some(gt) = find_tag_end(bytes, lt + 1) else {
            out.push_str(&s[lt..]);
            break;
        };
        let tag = &s[lt..=gt];
        let Some(name) = tag_name(tag) else {
            out.push_str(tag);
            i = gt + 1;
            continue;
        };
        if name == "ul" || name == "ol" {
            if let Some(close_end) = scan_code_block(s, gt + 1, &name) {
                let inner = &s[gt + 1..close_end];
                let converted = convert_list_block(inner, name == "ol", depth);
                out.push_str(&converted);
                i = close_end;
                continue;
            }
        }
        out.push_str(tag);
        i = gt + 1;
    }
    out
}

/// 把已摘出的列表内部 HTML 逐 `<li>` 转 Markdown。嵌套列表先递归转换（层级 +1），
/// 列表项内的块级标签折叠为单空格避免脱钩，粘连的嵌套列表拆到独立行以保留层级缩进。
fn convert_list_block(inner: &str, ordered: bool, depth: usize) -> String {
    let indent = "  ".repeat(depth);
    let mut out = String::new();
    let mut counter: usize = 0;
    let mut rest = inner;
    while let Some(li_start) = find_ci(rest, "<li") {
        out.push_str(&rest[..li_start]);
        let Some(gt_rel) = rest[li_start..].find('>') else {
            out.push_str(&rest[li_start..]);
            return out;
        };
        let li_open_end = li_start + gt_rel + 1;
        let Some(li_close_end) = find_matching_close(rest, li_open_end, "li") else {
            out.push_str(&rest[li_start..]);
            return out;
        };
        let li_inner = &rest[li_open_end..li_close_end];
        // 先递归处理项内可能嵌套的列表（按层级缩进）
        let li_inner = replace_lists_inner(li_inner, depth + 1);
        // 再折叠项内块级标签为单空格（防止 - 标记与正文脱钩）
        let li_inner = collapse_list_item_blocks(&li_inner);
        // 把粘连在父项文本后的嵌套列表拆到独立行并整体重排到正确层级缩进
        let nest_indent = "  ".repeat(depth + 1);
        let li_inner = split_nested_list(&li_inner, &nest_indent);
        let li_inner = trim_list_item(&li_inner);
        let marker = if ordered {
            counter += 1;
            format!("{}. ", counter)
        } else {
            "- ".to_string()
        };
        out.push_str(&indent);
        out.push_str(&marker);
        out.push_str(&li_inner);
        out.push('\n');
        rest = &rest[li_close_end..];
    }
    out.push_str(rest);
    out
}

/// 仅裁掉列表项首尾空白，保留内部嵌套列表行的缩进（不能用 `trim()`，否则会把
/// 子项行首的层级缩进一起切掉）。
fn trim_list_item(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut start = 0usize;
    while start < bytes.len() && bytes[start].is_ascii_whitespace() {
        start += 1;
    }
    let mut end = bytes.len();
    while end > start && bytes[end - 1].is_ascii_whitespace() {
        end -= 1;
    }
    s[start..end].to_string()
}

/// 列表项内若有「父项文本 + 内嵌嵌套列表」被空白粘连，拆成两行并整体重排嵌套列表到
/// 正确层级缩进（`nest_indent` 对应 depth+1 的 2 空格），保证子项成为独立且正确缩进的行。
fn split_nested_list(li_inner: &str, nest_indent: &str) -> String {
    let bytes = li_inner.as_bytes();
    let mut i = 0usize;
    let mut marker_start = None;
    while i < li_inner.len() {
        let mut sp = 0usize;
        while i + sp < li_inner.len() && bytes[i + sp] == b' ' {
            sp += 1;
        }
        if sp >= 2 && is_list_marker(&li_inner[i + sp..]) {
            // 标记前（同行）是否有非空白内容
            let before = &li_inner[..i];
            let has_text = before.lines().last().is_some_and(|l| !l.trim().is_empty());
            if has_text {
                marker_start = Some(i + sp);
                break;
            }
        }
        i += 1;
    }
    let m = match marker_start {
        Some(m) => m,
        None => return li_inner.to_string(),
    };
    let head = li_inner[..m].trim_end().to_string();
    let tail = reindent_lines(&li_inner[m..], nest_indent);
    format!("{}\n{}", head, tail)
}

/// 把多行文本每行重排到指定缩进（去掉原前导空白后补 `nest_indent`）。
fn reindent_lines(s: &str, nest_indent: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for line in s.lines() {
        out.push_str(nest_indent);
        out.push_str(line.trim_start());
        out.push('\n');
    }
    out
}

/// 是否列表标记：`- ` 或 `N. `（N 为数字）。
fn is_list_marker(s: &str) -> bool {
    if s.starts_with("- ") {
        return true;
    }
    if let Some(ch) = s.chars().next() {
        if ch.is_ascii_digit() && s.contains(". ") {
            return true;
        }
    }
    false
}

/// 从 `from` 起找与当前 `<name>` 开标签匹配的闭标签（返回其 `>` 之后位置）。
/// 嵌套同名开标签计入深度，避免误取内层闭标签而截断外层（如 `<li>父<ul><li>子…`
/// 误取子的 `</li>`；表格内嵌子表的 `<tr>` 同理）。
fn find_matching_close(s: &str, from: usize, name: &str) -> Option<usize> {
    let lower = s.to_ascii_lowercase();
    let mut depth = 1usize;
    let mut i = from;
    while i < s.len() {
        let pos = i + lower[i..].find('<')?;
        let after = &lower[pos + 1..];
        let is_close = after.starts_with('/');
        let body = if is_close { &after[1..] } else { after };
        if let Some(rest) = body.strip_prefix(name) {
            let boundary = rest
                .chars()
                .next()
                .is_none_or(|c| c == '>' || c == '/' || c.is_whitespace());
            if boundary {
                if is_close {
                    depth -= 1;
                    if depth == 0 {
                        return s[pos..].find('>').map(|g| pos + g + 1);
                    }
                } else {
                    depth += 1;
                }
                i = s[pos..].find('>').map(|g| pos + g + 1).unwrap_or(pos + 1);
                continue;
            }
        }
        i = pos + 1;
    }
    None
}

/// 整块替换 `<table>…</table>` -> GFM 管道表格。
///
/// GFM 要求表头后必须有 `| :--- |` 分隔行才会渲染表格；旧实现只剥标签输出裸行，
/// 表格因此完全不渲染。这里结构化重建：逐 `<tr>` 取行、逐 `<td>/<th>` 取单元格，
/// 首行后补分隔行，单元格压成单行行内片段（`|` 转义，块级标签折空格）。
fn replace_tables(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0usize;
    while i < s.len() {
        let Some(lt) = s[i..].find('<').map(|r| i + r) else {
            out.push_str(&s[i..]);
            break;
        };
        out.push_str(&s[i..lt]);
        let Some(gt) = find_tag_end(bytes, lt + 1) else {
            out.push_str(&s[lt..]);
            break;
        };
        let tag = &s[lt..=gt];
        let Some(name) = tag_name(tag) else {
            out.push_str(tag);
            i = gt + 1;
            continue;
        };
        if name == "table" {
            if let Some(close_end) = scan_code_block(s, gt + 1, "table") {
                let inner = &s[gt + 1..close_end];
                out.push_str(&convert_table(inner));
                i = close_end;
                continue;
            }
        }
        out.push_str(tag);
        i = gt + 1;
    }
    out
}

/// 表格内部 HTML -> GFM 管道表格行。首行无论原本是 `<th>` 表头还是 `<td>` 数据行，
/// 都升级为表头并在其后补 `| :--- |` 分隔行（GFM 无分隔行不渲染；无 `<th>` 时
/// 取首行作表头，与主流转换器行为一致）。
fn convert_table(inner: &str) -> String {
    let rows = collect_rows(inner);
    if rows.is_empty() {
        return String::new();
    }
    let mut out = String::from("\n\n");
    for (idx, row) in rows.iter().enumerate() {
        let cells: Vec<String> = row.iter().map(|c| cell_to_inline(c)).collect();
        out.push('|');
        for cell in &cells {
            out.push(' ');
            out.push_str(cell);
            out.push_str(" |");
        }
        out.push('\n');
        if idx == 0 {
            out.push('|');
            for _ in &cells {
                out.push_str(" :--- |");
            }
            out.push('\n');
        }
    }
    out.push('\n');
    out
}

/// 逐 `<tr>` 切行（深度感知匹配 `</tr>`，内嵌子表的行不计）；畸形 HTML
/// （缺 `</tr>`）退到下一个 `<tr>` 或表尾，不丢内容。
fn collect_rows(inner: &str) -> Vec<Vec<String>> {
    let lower = inner.to_ascii_lowercase();
    let mut rows = Vec::new();
    let mut i = 0usize;
    while i < inner.len() {
        let Some(rel) = lower[i..].find("<tr").map(|r| i + r) else {
            break;
        };
        if !tag_boundary_ok(&inner[rel + 3..]) {
            i = rel + 3;
            continue;
        }
        let Some(gt_rel) = inner[rel..].find('>') else {
            break;
        };
        let open_end = rel + gt_rel + 1;
        let row_end = find_matching_close(inner, open_end, "tr").unwrap_or_else(|| {
            lower[open_end..]
                .find("<tr")
                .map(|r| open_end + r)
                .unwrap_or(inner.len())
        });
        let row_inner = &inner[open_end..row_end];
        let cells = collect_cells(row_inner);
        if !cells.is_empty() {
            rows.push(cells);
        }
        i = row_end.max(open_end);
    }
    rows
}

/// 逐 `<td>/<th>` 切单元格（深度感知匹配闭标签；畸形 HTML 退到下一单元格或行尾）。
fn collect_cells(row_inner: &str) -> Vec<String> {
    let lower = row_inner.to_ascii_lowercase();
    let mut cells = Vec::new();
    let mut i = 0usize;
    while i < row_inner.len() {
        let td = lower[i..].find("<td").map(|r| i + r);
        let th = lower[i..].find("<th").map(|r| i + r);
        let (rel, close_name) = match (td, th) {
            (Some(a), Some(b)) if a <= b => (a, "td"),
            (Some(_), Some(b)) => (b, "th"),
            (Some(a), None) => (a, "td"),
            (None, Some(b)) => (b, "th"),
            (None, None) => break,
        };
        if !tag_boundary_ok(&row_inner[rel + 3..]) {
            i = rel + 3;
            continue;
        }
        let Some(gt_rel) = row_inner[rel..].find('>') else {
            break;
        };
        let open_end = rel + gt_rel + 1;
        let cell_end = find_matching_close(row_inner, open_end, close_name).unwrap_or_else(|| {
            let next_td = lower[open_end..].find("<td").map(|r| open_end + r);
            let next_th = lower[open_end..].find("<th").map(|r| open_end + r);
            match (next_td, next_th) {
                (Some(a), Some(b)) => a.min(b),
                (Some(a), None) | (None, Some(a)) => a,
                (None, None) => row_inner.len(),
            }
        });
        cells.push(row_inner[open_end..cell_end].to_string());
        i = cell_end.max(open_end);
    }
    cells
}

/// 标签名之后是否紧跟合法边界（`>` / 空白），用于排除 `<tdxyz>` 之类误命中。
fn tag_boundary_ok(after: &str) -> bool {
    after
        .chars()
        .next()
        .map(|c| c == '>' || c.is_whitespace())
        .unwrap_or(false)
}

/// 单元格内容 -> 单行行内 Markdown 片段。先递归转内嵌子表，块级标签与 `<br>`
/// 折成空格、换行压平、`|` 转义（GFM 单元格内裸 `|` 会撑破列）；行内标签
/// （`<strong>` 等）保留，交给 `html_to_md` 后续通用替换。
fn cell_to_inline(inner: &str) -> String {
    let s = replace_tables(inner);
    let s = replace_ci(&s, "<br[^>]*>", " ");
    let s = replace_ci(
        &s,
        "<p>|<p [^>]*>|</p>|<div>|<div [^>]*>|</div>|<section>|<section [^>]*>|</section>\
         |<h1[^>]*>|</h1>|<h2[^>]*>|</h2>|<h3[^>]*>|</h3>|<h4[^>]*>|</h4>|<h5[^>]*>|</h5>|<h6[^>]*>|</h6>",
        " ",
    );
    let mut flat = String::with_capacity(s.len());
    let mut prev_space = true; // 吞掉前导空白
    for ch in s.chars() {
        if ch.is_whitespace() {
            if !prev_space {
                flat.push(' ');
                prev_space = true;
            }
        } else {
            flat.push(ch);
            prev_space = false;
        }
    }
    flat.trim().replace('|', "\\|")
}

/// 列表项内部块级标签折叠为单空格（不注入 `\n\n`），其余标签保留交给后续通用转换。
fn collapse_list_item_blocks(s: &str) -> String {
    replace_ci(
        s,
        "<p>|<p [^>]*>|</p>|<div>|<div [^>]*>|</div>|<section>|<section [^>]*>|</section>",
        " ",
    )
}

/// 引号感知地定位标签结束 `>`（属性值中的 `>` 不结束标签）。残缺引号返回 None。
fn find_tag_end(bytes: &[u8], from: usize) -> Option<usize> {
    let mut i = from;
    let mut quote: Option<u8> = None;
    while i < bytes.len() {
        let b = bytes[i];
        match quote {
            Some(q) => {
                if b == q {
                    quote = None;
                }
            }
            None => {
                if b == b'"' || b == b'\'' {
                    quote = Some(b);
                } else if b == b'>' {
                    return Some(i);
                }
            }
        }
        i += 1;
    }
    None
}

/// 取开标签名（小写）；非开标签返回 None。
fn tag_name(open_tag: &str) -> Option<String> {
    let b = open_tag.as_bytes();
    if b.len() < 2 || b[0] != b'<' || b[1] == b'/' {
        return None;
    }
    let mut i = 1usize;
    while i < b.len() && b[i].is_ascii_alphabetic() {
        i += 1;
    }
    if i == 1 {
        return None;
    }
    Some(open_tag[1..i].to_ascii_lowercase())
}

/// void 元素：无闭合标签，嵌套深度不计。
fn is_void_tag(name: &str) -> bool {
    matches!(
        name,
        "img" | "br" | "hr" | "input" | "meta" | "link" | "source" | "area" | "base" | "col"
            | "embed" | "param" | "track" | "wbr"
    )
}

/// 从开标签结束处扫描匹配的同名闭标签，返回闭标签 `>` 之后位置（嵌套计数，void 不计）。
fn scan_code_block(html: &str, open_end: usize, name: &str) -> Option<usize> {
    let lower = html.to_ascii_lowercase();
    let mut depth = 1usize;
    let mut i = open_end;
    while i < html.len() {
        let pos = i + lower[i..].find('<')?;
        let after = &lower[pos + 1..];
        if let Some(rest) = after.strip_prefix('/') {
            if let Some(inner) = rest.strip_prefix(name) {
                let boundary = inner
                    .chars()
                    .next()
                    .map(|c| c == '>' || c.is_whitespace())
                    .unwrap_or(false);
                if boundary {
                    depth -= 1;
                    if depth == 0 {
                        return html[pos..].find('>').map(|g| pos + g + 1);
                    }
                    i = pos + html[pos..].find('>')? + 1;
                    continue;
                }
            }
        } else if let Some(inner) = after.strip_prefix(name) {
            let boundary = inner
                .chars()
                .next()
                .map(|c| c == '>' || c == '/' || c.is_whitespace())
                .unwrap_or(false);
            if boundary && !is_void_tag(name) {
                depth += 1;
            }
        }
        i = pos + 1;
    }
    None
}

/// 是否「预格式化」代码块：`<pre>` 标签，或 style 含 `white-space:pre` / `pre-wrap`。
/// 排除 `white-space:pre-line`（会压平连续空格，破坏代码缩进）。
fn is_pre_like(tag: &str) -> bool {
    let lower = tag.to_ascii_lowercase();
    if lower.starts_with("<pre") {
        return true;
    }
    if let Some(style) = attr_value(tag, "style") {
        if let Some(ws) = white_space_value(&style) {
            return ws == "pre" || ws == "pre-wrap";
        }
    }
    false
}

/// 从 style 属性取 `white-space` 的值（小写，去引号/空白）；无则返回 None。
fn white_space_value(style: &str) -> Option<String> {
    let lower = style.to_ascii_lowercase();
    let mut from = 0usize;
    while from < lower.len() {
        let rel = lower[from..].find("white-space")?;
        let mut k = from + rel + "white-space".len();
        while k < lower.len() && lower.as_bytes()[k].is_ascii_whitespace() {
            k += 1;
        }
        if k >= lower.len() || lower.as_bytes()[k] != b':' {
            from = (k + 1).min(lower.len());
            continue;
        }
        k += 1;
        while k < lower.len() && lower.as_bytes()[k].is_ascii_whitespace() {
            k += 1;
        }
        let vstart = k;
        while k < lower.len() && lower.as_bytes()[k] != b';' {
            k += 1;
        }
        let val = lower[vstart..k]
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .trim()
            .to_string();
        return Some(val);
    }
    None
}

/// 代码块内部净化为 Markdown 围栏内容。
///
/// 行分隔统一用 `<br>`：微信 `<span style="white-space:pre-wrap">` 用它作换行，
/// 部分 `<pre><code>` 内部也用 `<br>` 而非字面换行。因此先转换行、再剥标签 + 解实体，
/// 换行才不会在去标签时丢失；字面换行同样保留。`&nbsp;` 由 `decode_entities` 解成普通空格，
/// 代码缩进随之还原。
fn code_inner(_name: &str, inner: &str) -> String {
    let with_nl = replace_ci(inner, "<br[^>]*>", "\n");
    let stripped = replace_ci(&with_nl, "<[^>]*>", "");
    decode_entities(&stripped)
}

/// CSV -> Markdown 表格（首行作表头）。
pub fn csv_to_md(csv: &str) -> String {
    let rows = parse_csv(csv);
    if rows.is_empty() {
        return String::new();
    }
    let cols = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    let mut out = String::new();
    for (i, row) in rows.iter().enumerate() {
        out.push('|');
        for c in 0..cols {
            out.push(' ');
            out.push_str(row.get(c).map(|s| s.as_str()).unwrap_or(""));
            out.push_str(" |");
        }
        out.push('\n');
        if i == 0 {
            out.push('|');
            for _ in 0..cols {
                out.push_str(" --- |");
            }
            out.push('\n');
        }
    }
    out
}

/// Markdown -> CSV（取首个 Markdown 表格；无表格时按非空行单列输出）。
pub fn md_to_csv(md: &str) -> String {
    let mut table: Vec<Vec<String>> = Vec::new();
    for line in md.lines() {
        let t = line.trim();
        let is_row = t.starts_with('|') && t.ends_with('|') && t.len() > 1;
        if !is_row {
            if !table.is_empty() {
                break;
            }
            continue;
        }
        let cells: Vec<String> = t
            .trim_matches('|')
            .split('|')
            .map(|c| c.trim().to_string())
            .collect();
        // 跳过分隔行 `| --- | --- |`
        if cells
            .iter()
            .all(|c| !c.is_empty() && c.chars().all(|ch| ch == '-' || ch == ':' || ch == ' '))
        {
            continue;
        }
        table.push(cells);
    }
    let mut out = String::new();
    if !table.is_empty() {
        for row in &table {
            out.push_str(
                &row.iter()
                    .map(|c| csv_field(c))
                    .collect::<Vec<_>>()
                    .join(","),
            );
            out.push('\n');
        }
        return out;
    }
    for line in md.lines().map(|l| l.trim()).filter(|l| !l.is_empty()) {
        out.push_str(&csv_field(line));
        out.push('\n');
    }
    out
}

// ---------------------------------------------------------------- helpers

/// CSV 字段转义（含 `,` `"` 换行时用双引号包裹）。
fn csv_field(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

/// 手写 CSV 解析：支持双引号包裹、`""` 转义、字段内换行。
fn parse_csv(input: &str) -> Vec<Vec<String>> {
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if quoted {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    chars.next();
                    field.push('"');
                } else {
                    quoted = false;
                }
            } else {
                field.push(c);
            }
            continue;
        }
        match c {
            '"' => quoted = true,
            ',' => row.push(std::mem::take(&mut field)),
            '\r' => {}
            '\n' => {
                row.push(std::mem::take(&mut field));
                rows.push(std::mem::take(&mut row));
            }
            _ => field.push(c),
        }
    }
    if !field.is_empty() || !row.is_empty() {
        row.push(field);
        rows.push(row);
    }
    rows.retain(|r| !(r.len() == 1 && r[0].trim().is_empty()));
    rows
}

/// 剥离 script / style / 注释 / head，避免把脚本文本混进正文。
fn strip_noise(s: &str) -> String {
    let mut out = s.to_string();
    for (open, close) in [
        ("<script", "</script>"),
        ("<style", "</style>"),
        ("<head", "</head>"),
        ("<noscript", "</noscript>"),
    ] {
        loop {
            let lower = out.to_lowercase();
            let Some(start) = lower.find(open) else { break };
            let Some(rel_end) = lower[start..].find(close) else {
                out.truncate(start);
                break;
            };
            let end = start + rel_end + close.len();
            out.replace_range(start..end, "");
        }
    }
    out
}

/// 整段替换 `<a href="URL">TEXT</a>` -> `[TEXT](URL)`（非贪婪，不支持嵌套 a）。
fn replace_anchors(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(start) = find_ci(rest, "<a ") {
        out.push_str(&rest[..start]);
        let Some(gt_rel) = rest[start..].find('>') else {
            out.push_str(&rest[start..]);
            return out;
        };
        let open_end = start + gt_rel + 1;
        let open_tag = &rest[start..open_end];
        let href = attr_value(open_tag, "href").unwrap_or_default();
        let Some(close_rel) = find_ci(&rest[open_end..], "</a>") else {
            // 无闭合：整段丢弃标签保留内容
            out.push_str(&rest[open_end..]);
            return out;
        };
        let text = &rest[open_end..open_end + close_rel];
        let text = replace_ci(text, "<[^>]*>", "");
        if href.is_empty() || href.starts_with('#') {
            out.push_str(&text);
        } else {
            out.push_str(&format!("[{}]({})", text.trim(), md_link_dest(&href)));
        }
        rest = &rest[open_end + close_rel + "</a>".len()..];
    }
    out.push_str(rest);
    out
}

/// 整段替换 `<img ...>` -> `![alt](src)`。
fn replace_images(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(start) = find_ci(rest, "<img") {
        out.push_str(&rest[..start]);
        let Some(gt_rel) = rest[start..].find('>') else {
            out.push_str(&rest[start..]);
            return out;
        };
        let tag = &rest[start..start + gt_rel + 1];
        let src = attr_value(tag, "src").unwrap_or_default();
        let alt = attr_value(tag, "alt").unwrap_or_default();
        if src.is_empty() {
            out.push_str(&alt);
        } else {
            out.push_str(&format!("![{}]({})", alt, md_link_dest(&src)));
        }
        rest = &rest[start + gt_rel + 1..];
    }
    out.push_str(rest);
    out
}

/// Markdown 链接/图片目标（`(...)` 内）的安全写法。本地相对路径含空格/括号等字符时
/// 做百分号编码——裸目标遇空格即被 CommonMark 截断（前端 `marked` 会因此渲染失败）；
/// 前端 `resolveLocalAssets` 会对每段 `decodeURIComponent` 还原，故本地化图片仍能定位到。
/// 远程 URL / 锚点 / data URI 不含空格，保持原样（避免破坏防盗链 CDN 的大小写签名）。
pub(crate) fn md_link_dest(dest: &str) -> String {
    if dest.starts_with('#')
        || dest.starts_with("data:")
        || dest.starts_with("mailto:")
        || dest.contains("://")
    {
        return dest.to_string();
    }
    let mut out = String::with_capacity(dest.len());
    for c in dest.chars() {
        match c {
            ' ' => out.push_str("%20"),
            '(' => out.push_str("%28"),
            ')' => out.push_str("%29"),
            '<' => out.push_str("%3C"),
            '>' => out.push_str("%3E"),
            _ => out.push(c),
        }
    }
    out
}

/// 从标签文本里取属性值（大小写不敏感，支持单/双引号）。
/// 属性名匹配用 ASCII 小写副本（保持字节对齐），**值一律从原始串切**——
/// URL 大小写敏感（防盗链 CDN 降小写即 404），md 产物里的图片/链接 URL 必须原样。
fn attr_value(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let mut from = 0usize;
    while let Some(rel) = lower[from..].find(name) {
        let idx = from + rel;
        let after = tag[idx + name.len()..].trim_start();
        if let Some(stripped) = after.strip_prefix('=') {
            let v = stripped.trim_start();
            let quote = v.chars().next()?;
            if quote == '"' || quote == '\'' {
                let body = &v[1..];
                let end = body.find(quote)?;
                return Some(body[..end].to_string());
            }
            let end = v.find(|c: char| c.is_whitespace() || c == '>').unwrap_or(v.len());
            return Some(v[..end].to_string());
        }
        from = idx + name.len();
    }
    None
}

fn find_ci(haystack: &str, needle: &str) -> Option<usize> {
    haystack.to_lowercase().find(&needle.to_lowercase())
}

/// 解码常见 HTML 实体：命名实体 + 数字实体（`&#58;` / `&#x3a;`）。
/// 逐段扫描而非整串 replace：`&amp;lt;` 只解一层得 `&lt;`，不会二次解码。
fn decode_entities(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        let tail = &rest[amp..];
        let ent = tail.find(';').map(|i| &tail[..i + 1]).unwrap_or(tail);
        let decoded = numeric_entity(ent).or_else(|| named_entity(ent));
        match decoded {
            Some(ch) => {
                out.push(ch);
                rest = &tail[ent.len()..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// 数字实体 `&#58;` / `&#x3a;` → 对应字符（非法码位返回 None）。
fn numeric_entity(ent: &str) -> Option<char> {
    let body = ent.strip_prefix("&#")?.strip_suffix(';')?;
    let code = if let Some(hex) = body.strip_prefix('x').or_else(|| body.strip_prefix('X')) {
        u32::from_str_radix(hex, 16).ok()?
    } else {
        body.parse::<u32>().ok()?
    };
    char::from_u32(code)
}

/// 命名实体表（`&amp;` 收尾：先解它会把后续实体的 `&` 吞掉）。
fn named_entity(ent: &str) -> Option<char> {
    Some(match ent {
        "&nbsp;" => ' ',
        "&lt;" => '<',
        "&gt;" => '>',
        "&quot;" => '"',
        "&#39;" => '\'',
        "&apos;" => '\'',
        "&mdash;" => '—',
        "&ndash;" => '–',
        "&hellip;" => '…',
        "&amp;" => '&',
        _ => return None,
    })
}

/// 折叠 3 个以上连续换行，并去掉行尾空格。
fn collapse_blank_lines(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut blanks = 0usize;
    for line in s.lines() {
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            blanks += 1;
            if blanks > 1 {
                continue;
            }
        } else {
            blanks = 0;
        }
        out.push_str(trimmed);
        out.push('\n');
    }
    out.trim().to_string()
}

/// 极简大小写不敏感「正则」替换：`pattern` 中的 `[^>]*`、`|` 为唯一支持的通配语法。
///
/// 之所以不用 `regex` crate：本模块只需匹配标签形状，手写可避免为格式转换引入新依赖。
fn replace_ci(input: &str, pattern: &str, replacement: &str) -> String {
    let alts: Vec<&str> = pattern.split('|').collect();
    let mut out = input.to_string();
    for alt in alts {
        while let Some((start, end)) = match_pattern(&out, alt) {
            out.replace_range(start..end, replacement);
        }
    }
    out
}

/// 在 `s` 中查找 `pat`（大小写不敏感），支持 `[^>]*` 通配。返回 (start, end) 字节区间。
///
/// 支持两种形状：纯字面量（`</p>`）与带通配的标签（`<pre[^>]*>`，语义为「吞到最近的 `>`」）。
fn match_pattern(s: &str, pat: &str) -> Option<(usize, usize)> {
    let Some(star) = pat.find("[^>]*") else {
        return find_ci(s, pat).map(|i| (i, i + pat.len()));
    };
    let head = &pat[..star];
    let tail = &pat[star + 5..];
    let mut from = 0usize;
    while let Some(rel) = find_ci(&s[from..], head) {
        let hstart = from + rel;
        let after = hstart + head.len();
        if tail.is_empty() {
            return s[after..].find('>').map(|gt| (hstart, after + gt + 1));
        }
        if let Some(t) = find_ci(&s[after..], tail) {
            return Some((hstart, after + t + tail.len()));
        }
        from = after;
    }
    None
}

/// 导出 HTML 文档的基础排版样式（与预览观感对齐，打印/转 PDF 友好）。
pub(crate) const HTML_DOC_CSS: &str = "body{font-family:-apple-system,'PingFang SC','Helvetica Neue',Arial,sans-serif;\
max-width:820px;margin:40px auto;padding:0 20px;line-height:1.75;color:#24292f;}\
h1,h2{border-bottom:1px solid #e5e7eb;padding-bottom:.3em;}\
code{background:#f3f4f6;padding:.15em .35em;border-radius:4px;font-size:.9em;}\
pre{background:#f6f8fa;padding:12px;border-radius:6px;overflow:auto;}\
pre code{background:none;padding:0;}\
table{border-collapse:collapse;width:100%;}\
th,td{border:1px solid #d0d7de;padding:6px 10px;}\
th{background:#f6f8fa;}\
blockquote{border-left:4px solid #d0d7de;margin:0;padding-left:14px;color:#57606a;}\
img{max-width:100%;}";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn md_to_html_has_headings_and_tables() {
        let html = md_to_html("# 标题\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");
        assert!(html.contains("<h1>标题</h1>"));
        assert!(html.contains("<table>"));
        assert!(html.starts_with("<!DOCTYPE html>"));
    }

    #[test]
    fn md_to_text_drops_markers() {
        let text = md_to_text("# 标题\n\n这是 **粗体** 与 `代码`。\n");
        assert!(text.contains("标题"));
        assert!(text.contains("粗体"));
        assert!(!text.contains('#'));
        assert!(!text.contains('*'));
    }

    #[test]
    fn html_to_md_maps_common_tags() {
        let md = html_to_md(
            "<h2>标题</h2><p>正文 <strong>粗</strong> <a href=\"https://x.dev\">链接</a></p>\
<img src=\"a.png\" alt=\"图\"><ul><li>一</li><li>二</li></ul>",
        );
        assert!(md.contains("## 标题"), "{md}");
        assert!(md.contains("**粗**"), "{md}");
        assert!(md.contains("[链接](https://x.dev)"), "{md}");
        assert!(md.contains("![图](a.png)"), "{md}");
        assert!(md.contains("- 一"), "{md}");
    }

    #[test]
    fn html_to_md_lists_keep_text_attached() {
        // 微信文章典型结构：<li> 内含 <p><span>文字</span></p>，列表项文字不得与
        // `- ` 标记脱钩（曾出现「空 - 标记 + 独立段落」的错乱）。
        let md = html_to_md(
            "<ol><li style=\"x\"><p style=\"y\"><span leaf=\"\">MoE 是什么？</span></p></li>\
             <li style=\"x\"><p style=\"y\"><span leaf=\"\">EP 为什么是 all_to_all？</span></p></li></ol>",
        );
        assert!(md.contains("1. MoE 是什么？"), "{md}");
        assert!(md.contains("2. EP 为什么是 all_to_all？"), "{md}");
        // 不得出现「空 - 标记 + 独立段落」的脱钩形态
        assert!(!md.contains("-\n\nMoE 是什么"), "{md}");
        assert!(!md.contains("1. \n\nMoE 是什么"), "{md}");
    }

    #[test]
    fn html_to_md_ordered_list_numbers() {
        let md = html_to_md(
            "<ol><li><p>第一</p></li><li><p>第二</p></li><li><p>第三</p></li></ol>",
        );
        assert!(md.contains("1. 第一"), "{md}");
        assert!(md.contains("2. 第二"), "{md}");
        assert!(md.contains("3. 第三"), "{md}");
    }

    #[test]
    fn html_to_md_nested_lists_indent() {
        let md = html_to_md(
            "<ul><li>父<p>说明</p><ul><li>子一</li><li>子二</li></ul></li></ul>",
        );
        assert!(md.contains("- 父 说明"), "{md}");
        assert!(md.contains("  - 子一"), "{md}");
        assert!(md.contains("  - 子二"), "{md}");
    }

    #[test]
    fn html_to_md_image_path_with_spaces_wrapped() {
        // 本地化图片路径含空格（标题作 stem 的 `.assets` 路径）时，空格须百分号编码，
        // 否则裸目标遇空格即被 CommonMark 截断，图片渲染失败。
        let md = html_to_md(
            r#"<img src="专家并行（EP）：MoE 与 all_to_all.assets/img-001.jpg" alt="图">"#,
        );
        assert!(
            md.contains("![图](专家并行（EP）：MoE%20与%20all_to_all.assets/img-001.jpg)"),
            "{md}"
        );
        // 无空格的本地路径保持原样
        let md1 = html_to_md(r#"<img src="a.png" alt="图">"#);
        assert!(md1.contains("![图](a.png)"), "{md1}");
        // 远程 URL 不含空格，保持原样（不破坏防盗链 CDN 签名）
        let md2 = html_to_md(r#"<img src="https://mmbiz.qpic.cn/AbCdEf/640" alt="图">"#);
        assert!(md2.contains("![图](https://mmbiz.qpic.cn/AbCdEf/640)"), "{md2}");
    }

    #[test]
    fn html_to_md_table_has_separator_row() {
        // GFM 表格必须有表头分隔行才会渲染；旧实现只剥标签，表格整体丢失。
        let md = html_to_md(
            "<table><tr><th>模型</th><th>参数量</th></tr>\
             <tr><td>MoE</td><td>8B</td></tr><tr><td>Dense</td><td>7B</td></tr></table>",
        );
        assert!(md.contains("| 模型 | 参数量 |"), "{md}");
        assert!(md.contains("| :--- | :--- |"), "{md}");
        assert!(md.contains("| MoE | 8B |"), "{md}");
        assert!(md.contains("| Dense | 7B |"), "{md}");
    }

    #[test]
    fn html_to_md_table_without_th_uses_first_row_as_header() {
        // 全 `<td>` 表（无表头单元格）也须补分隔行，否则不渲染。
        let md = html_to_md(
            "<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>",
        );
        assert!(md.contains("| a | b |"), "{md}");
        assert!(md.contains("| :--- | :--- |"), "{md}");
        assert!(md.contains("| 1 | 2 |"), "{md}");
    }

    #[test]
    fn html_to_md_table_cell_inline_content_stays_on_one_line() {
        // 单元格内 `<br>` / 块级标签 / 实体须压成单行；行内样式交给后续通用替换。
        let md = html_to_md(
            "<table><tr><th>名称</th><th>说明</th></tr>\
             <tr><td><strong>MoE</strong></td><td>专家<br>网络 &amp; 路由</td></tr></table>",
        );
        assert!(md.contains("| **MoE** |"), "{md}");
        assert!(md.contains("| 专家 网络 & 路由 |"), "{md}");
        // 表格行不得被单元格内的块级标签撑出换行
        let row_line = md.lines().find(|l| l.contains("MoE") && l.contains("网络"));
        assert!(row_line.is_some(), "{md}");
    }

    #[test]
    fn html_to_md_table_cell_pipe_escaped() {
        // 单元格内裸 `|` 会撑破 GFM 列，须转义为 `\|`。
        let md = html_to_md("<table><tr><th>a</th></tr><tr><td>x | y</td></tr></table>");
        assert!(md.contains("| x \\| y |"), "{md}");
    }

    #[test]
    fn html_to_md_table_nested_table_flattened() {
        // 单元格内嵌子表：压成单行文本，不得残留裸 `<table>` 标签或撑破外层列。
        let md = html_to_md(
            "<table><tr><th>外</th></tr><tr><td>前缀\
             <table><tr><td>子1</td><td>子2</td></tr></table>后缀</td></tr></table>",
        );
        assert!(!md.contains("<table>"), "{md}");
        assert!(!md.contains("<td>"), "{md}");
        assert!(md.contains("前缀"), "{md}");
        assert!(md.contains("子1"), "{md}");
        assert!(md.contains("后缀"), "{md}");
    }

    #[test]
    fn html_to_md_pre_becomes_fence_without_stray_backticks() {
        let md = html_to_md(
            "<p>前</p><pre><code>let a = 1;\n  let b = 2;</code></pre><p>后</p>",
        );
        assert!(md.contains("```\nlet a = 1;\n  let b = 2;\n```"), "{md}");
        // 围栏内不得出现行内反引号（`<pre><code>` 组合的经典伪影）
        assert!(!md.contains("```\n`"), "{md}");
    }

    #[test]
    fn html_to_md_wechat_code_span_becomes_fenced_block() {
        let md = html_to_md(
            "<p>前</p><span style=\"white-space:pre-wrap;font-family:Monaco;\"><span leaf=\"\">import paddle</span><br  /><span leaf=\"\">num_experts&nbsp;=&nbsp;8</span></span><p>后</p>",
        );
        assert!(md.contains("```"), "{md}");
        assert!(
            md.contains("import paddle\nnum_experts = 8"),
            "代码块内换行应被还原，实际: {md}"
        );
        assert!(!md.contains("<span"), "{md}");
        assert!(!md.contains("<br"), "{md}");
    }

    #[test]
    fn html_to_md_excludes_white_space_pre_line() {
        // 回归：white-space:pre-line 不是代码块（会压平连续空格）
        let md = html_to_md("<p style=\"white-space:pre-line\">a\nb</p>");
        assert!(!md.contains("```"), "{md}");
    }

    #[test]
    fn html_to_md_pre_still_works() {
        // 复刻既有 <pre> 路径断言，确认未被破坏
        let md = html_to_md(
            "<p>前</p><pre><code>let a = 1;\n  let b = 2;</code></pre><p>后</p>",
        );
        assert!(md.contains("```\nlet a = 1;\n  let b = 2;\n```"), "{md}");
        assert!(!md.contains("```\n`"), "{md}");
    }

    #[test]
    fn white_space_value_parses_variants() {
        assert_eq!(
            white_space_value("white-space:pre-wrap;color:red"),
            Some("pre-wrap".to_string())
        );
        assert_eq!(white_space_value("white-space: pre"), Some("pre".to_string()));
        assert_eq!(
            white_space_value("white-space:pre-line"),
            Some("pre-line".to_string())
        );
        assert_eq!(white_space_value("color:red"), None);
    }

    #[test]
    fn html_to_md_strips_script() {
        let md = html_to_md("<p>可见</p><script>var a=1;</script><style>.x{}</style>");
        assert!(md.contains("可见"));
        assert!(!md.contains("var a"));
        assert!(!md.contains(".x{"));
    }

    #[test]
    fn attr_value_preserves_url_case() {
        // 回归：属性值曾被整体降小写（防盗链 CDN 大小写敏感 → 404；URL 改写失配）
        let tag = r#"<img src="https://mmbiz.qpic.cn/sz_mmbiz_jpg/dHwlicgnJnmRy33uk2P3co0MDL3RlBFLli/640?wx_fmt=other">"#;
        assert_eq!(
            attr_value(tag, "src").unwrap(),
            "https://mmbiz.qpic.cn/sz_mmbiz_jpg/dHwlicgnJnmRy33uk2P3co0MDL3RlBFLli/640?wx_fmt=other"
        );
        let anchor = r#"<a href="https://x.dev/AbCdEf">链接</a>"#;
        assert_eq!(attr_value(anchor, "href").unwrap(), "https://x.dev/AbCdEf");
    }

    #[test]
    fn html_to_md_keeps_image_url_case() {
        let md = html_to_md(r#"<p><img src="https://mmbiz.qpic.cn/AbCdEf/640" alt="图"></p>"#);
        assert!(md.contains("https://mmbiz.qpic.cn/AbCdEf/640"), "{}", md);
        assert!(!md.contains("abcdef"), "{}", md);
    }

    #[test]
    fn decode_entities_handles_numeric_entities() {
        assert_eq!(decode_entities("a&#58;b"), "a:b");
        assert_eq!(decode_entities("a&#x3a;b"), "a:b");
        // 只解一层：&amp;lt; → &lt;，不被二次解码
        assert_eq!(decode_entities("&amp;lt;"), "&lt;");
        assert_eq!(decode_entities("&notreal;"), "&notreal;");
    }

    #[test]
    fn csv_roundtrip_through_md() {
        let md = csv_to_md("name,note\nAlice,\"x,y\"\n");
        assert!(md.contains("| name | note |"));
        let csv = md_to_csv(&md);
        assert!(csv.contains("Alice"), "{csv}");
        assert!(csv.contains("\"x,y\""), "{csv}");
    }

    #[test]
    fn md_to_csv_without_table_is_single_column() {
        let csv = md_to_csv("# 标题\n\n第一行\n第二行\n");
        assert_eq!(csv.lines().count(), 3, "{csv}");
    }
}
