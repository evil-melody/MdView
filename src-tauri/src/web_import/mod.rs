//! 根据链接导入文章：抓取网页 → 提取正文 → 生成 md / html → 图片本地化 → 落盘。
//!
//! 设计取舍（对齐 MdView「零新依赖」纪律）：
//! - HTML 解析全部手写：大小写不敏感查找 + 嵌套感知标签扫描（同名标签计深度，
//!   void 元素不计），不引入 regex / scraper / html2md 等 crate；
//! - 正文 → Markdown 复用 `convert::text::html_to_md`，HTML 文档样式复用其
//!   `HTML_DOC_CSS`（提为 pub(crate)）；
//! - 公众号（mp.weixin.qq.com）现代模板正文藏在 JS 字符串 `content_noencode`，
//!   提取算法自 InspireLoom `services/wechat.rs` 移植（纯 std 字符串操作）。
//!   **只借算法，不照搬其缺陷**：历史实现把 cgiData.cdn_url 封面图无脑拼到
//!   标题上方，普通图文文档顶部会多出不属于正文的封面图——本模块封面图一律
//!   不进正文，正文图保持原位置原顺序；仅「幻灯片多图」模板的 picture_page_info_list
//!   图才是正文本体，按原顺序接在标题之后；
//! - 资源本地化在 HTML 层改写引用（图片 + 附件），md / html 两种输出自然继承；
//!   收集 / 下载 / 改写系列拆至 `assets` 子模块（本文件逼近 2000 行上限）。

pub mod assets;

use assets::{build_client, localize_images, sanitize_stem};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::Path;

use crate::convert::text::{html_to_md, HTML_DOC_CSS};

/// 导入结果：产物路径 / 标题 / 本地化图片数。
#[derive(Debug, Serialize)]
pub struct ImportArticleResult {
    pub path: String,
    pub title: String,
    pub images: usize,
}

/// 根据链接导入文章命令：抓取 → 提取 → 本地化 → 落盘，返回产物路径。
#[tauri::command]
pub async fn import_article_from_url(
    url: String,
    dir: String,
    format: String,
    name: Option<String>,
) -> Result<ImportArticleResult, String> {
    let url = url.trim().to_string();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("链接必须以 http:// 或 https:// 开头".to_string());
    }
    if format != "md" && format != "html" {
        return Err(format!("不支持的输出格式: {}（仅支持 md / html）", format));
    }
    let dir = dir.trim().trim_end_matches('/').to_string();
    if dir.is_empty() {
        return Err("保存目录不能为空".to_string());
    }
    if !Path::new(&dir).is_dir() {
        return Err(format!("保存目录不存在或不是目录: {}", dir));
    }

    // ---- 抓取页面（浏览器 UA + 30s 总超时）----
    let client = build_client()?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!(
            "页面返回 HTTP {}，抓取失败",
            resp.status().as_u16()
        ));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取页面失败: {}", e))?;
    let html = String::from_utf8_lossy(&bytes).to_string();

    let is_wechat = url.contains("mp.weixin.qq.com");
    let title = extract_title(&html, is_wechat);

    // ---- 正文提取 + 懒加载图片提升 ----
    let mut content = extract_body(&html, is_wechat)?;
    content = rewrite_lazy_images(&content);

    // ---- 公众号幻灯片多图模板：这些图就是正文，按原顺序接在标题之后 ----
    if is_wechat && is_picture_page_article(&html) {
        let slides = extract_wechat_picture_page_urls(&html);
        if !slides.is_empty() {
            let mut head = String::new();
            for u in slides {
                head.push_str(&format!(
                    "<p style=\"text-align:center\"><img src=\"{}\"></p>",
                    u
                ));
            }
            content = format!("{}{}", head, content);
        }
    }

    // ---- 文件名：用户指定 > 网页标题 > 兜底 ----
    let stem = pick_stem(name.as_deref().unwrap_or_default(), &title);

    // ---- 图片本地化（HTML 层改写 src，md / html 自然继承）----
    let (content, images) = localize_images(&client, &url, &content, &stem, &dir).await;

    // ---- 组装输出并落盘 ----
    let (ext, output) = if format == "html" {
        ("html", build_html(&title, &content, &url, &dir, &stem))
    } else {
        ("md", build_md(&title, &content, &url))
    };
    let path = unique_path(&dir, &stem, ext)?;
    fs::write(&path, output).map_err(|e| format!("写入文件失败: {}", e))?;

    let result_title = if title.trim().is_empty() {
        stem
    } else {
        title
    };
    Ok(ImportArticleResult {
        path,
        title: result_title,
        images,
    })
}

// ================================================================ 标题 / 正文提取

/// 标题：公众号 `#activity-name` → `<h1>` → `<title>`；非微信从 `<h1>` 起。
fn extract_title(html: &str, is_wechat: bool) -> String {
    if is_wechat {
        let t = extract_element_by_id(html, "activity-name")
            .map(|inner| element_text(&inner))
            .unwrap_or_default();
        if !t.is_empty() {
            return t;
        }
    }
    for tag in ["h1", "title"] {
        let t = extract_element(html, tag)
            .map(|inner| element_text(&inner))
            .unwrap_or_default();
        if !t.is_empty() {
            return t;
        }
    }
    String::new()
}

/// 正文提取：公众号 cgiData → `#js_content`；通用 `#js_content` → `<article>` →
/// `<body>` → 整页。返回 inner HTML。
fn extract_body(html: &str, is_wechat: bool) -> Result<String, String> {
    if is_wechat {
        // 现代模板正文为空，真实内容在 JS 字符串里；空串视为未提取到
        if let Some(cgi) = extract_wechat_cgi_content(html) {
            if !cgi.trim().is_empty() {
                return Ok(cgi);
            }
        }
        if let Some(js) = extract_element_by_id(html, "js_content") {
            return Ok(js);
        }
        return Err("页面未提取到正文内容（可能需在浏览器中完成验证或登录）".to_string());
    }
    if let Some(js) = extract_element_by_id(html, "js_content") {
        return Ok(js);
    }
    if let Some(art) = extract_element(html, "article") {
        return Ok(art);
    }
    if let Some(body) = extract_element(html, "body") {
        return Ok(body);
    }
    Ok(html.to_string())
}

/// 元素纯文本：去标签 + 解实体 + 折叠空白。
fn element_text(inner_html: &str) -> String {
    let text = replace_ci(inner_html, "<[^>]*>", "");
    collapse_ws(&decode_entities(&text))
}

/// 按 id 提取元素 inner HTML（嵌套感知）。
fn extract_element_by_id(html: &str, id: &str) -> Option<String> {
    let attr_pos = find_id_attr(html, id)?;
    // 回退到所属开标签的 '<'
    let lt = html[..attr_pos].rfind('<')?;
    let open_tag = &html[lt..];
    let gt_rel = open_tag.find('>')?;
    let name = tag_name(&open_tag[..gt_rel + 1])?;
    let open_end = lt + gt_rel + 1;
    scan_element(html, open_end, &name).map(|(inner, _)| inner)
}

/// 按标签名提取首个元素 inner HTML（嵌套感知）。
fn extract_element(html: &str, tag: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let needle = format!("<{}", tag);
    let mut from = 0usize;
    while let Some(rel) = lower[from..].find(&needle) {
        let pos = from + rel;
        from = pos + needle.len();
        let after = &lower[pos + needle.len()..];
        // 只认开标签：后随 '>' 或空白（排除 </tag 与 <tagxxx 前缀误伤）
        if after.starts_with('>') || after.starts_with(char::is_whitespace) {
            let gt_rel = html[pos..].find('>')?;
            return scan_element(html, pos + gt_rel + 1, tag).map(|(inner, _)| inner);
        }
    }
    None
}

/// 从开标签结束后扫描匹配的闭标签，返回 (inner HTML, 闭标签结束位置)。
/// 同名标签计深度；void 元素不计。
fn scan_element(html: &str, open_end: usize, name: &str) -> Option<(String, usize)> {
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
                        let gt_rel = html[pos..].find('>')?;
                        let close_end = pos + gt_rel + 1;
                        return Some((html[open_end..pos].to_string(), close_end));
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
            if boundary && !is_void(name) {
                depth += 1;
            }
        }
        i = pos + 1;
    }
    None
}

/// 查找 id 属性（大小写不敏感，支持单双引号与裸值），返回 `id=` 的字节位置。
/// 前边界校验：`data-id=` 等不会误命中。
fn find_id_attr(html: &str, id: &str) -> Option<usize> {
    let lower = html.to_ascii_lowercase();
    let mut from = 0usize;
    while from + 3 <= lower.len() {
        let rel = lower[from..].find("id=")?;
        let idx = from + rel;
        from = idx + 3;
        if idx > 0 && is_attr_char(lower.as_bytes()[idx - 1]) {
            continue;
        }
        let rest = &html[idx + 3..];
        let rest_trim = rest.trim_start();
        let quote = rest_trim.chars().next()?;
        let value = if quote == '"' || quote == '\'' {
            let body = &rest_trim[quote.len_utf8()..];
            let end = body.find(quote)?;
            &body[..end]
        } else {
            let end = rest_trim
                .find(|c: char| c.is_whitespace() || c == '>')
                .unwrap_or(rest_trim.len());
            &rest_trim[..end]
        };
        if value == id {
            return Some(idx);
        }
    }
    None
}

/// 从开标签文本取标签名（小写）；闭标签 / 非标签返回 None。
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
fn is_void(name: &str) -> bool {
    matches!(
        name,
        "img"
            | "br"
            | "hr"
            | "input"
            | "meta"
            | "link"
            | "source"
            | "area"
            | "base"
            | "col"
            | "embed"
            | "param"
            | "track"
            | "wbr"
    )
}

// ================================================================ 公众号提取（移植）

/// 解码 JS 字符串字面量转义序列。
///
/// 处理 `\xHH`（两位 16 进制）、`\uHHHH`（四位）、`\n` `\r` `\t` `\0` `\\` `\'` `\"`；
/// 未知转义（`\q` `\+`）原样保留，不 panic。HTML 实体由 `decode_entities` 接力。
///
/// 背景：WeChat MP `#js_article` 模板通过 `window.cgiData.content_noencode`（JS
/// 字符串字面量）携带正文，静态 HTML 抓取只看得到 JS 转义文本。
fn decode_js_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('x') => {
                let mut hex = String::with_capacity(2);
                for _ in 0..2 {
                    if let Some(h) = chars.next() {
                        hex.push(h);
                    } else {
                        break;
                    }
                }
                match u8::from_str_radix(&hex, 16) {
                    Ok(n) => out.push(n as char),
                    Err(_) => {
                        out.push('\\');
                        out.push('x');
                        out.push_str(&hex);
                    }
                }
            }
            Some('u') => {
                let mut hex = String::with_capacity(4);
                for _ in 0..4 {
                    if let Some(h) = chars.next() {
                        hex.push(h);
                    } else {
                        break;
                    }
                }
                match u32::from_str_radix(&hex, 16).ok().and_then(char::from_u32) {
                    Some(ch) => out.push(ch),
                    None => {
                        out.push('\\');
                        out.push('u');
                        out.push_str(&hex);
                    }
                }
            }
            Some('n') => out.push('\n'),
            Some('r') => out.push('\r'),
            Some('t') => out.push('\t'),
            Some('\\') => out.push('\\'),
            Some('\'') => out.push('\''),
            Some('"') => out.push('"'),
            Some('0') => out.push('\0'),
            Some(other) => {
                out.push('\\');
                out.push(other);
            }
            None => out.push('\\'),
        }
    }
    out
}

/// 在 JS 字符串体内扫描匹配的结束引号（跳过 `\` 转义），返回字节偏移。
fn scan_js_string_end(bytes: &[u8], quote: u8) -> Option<usize> {
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            i += 2;
            continue;
        }
        if bytes[i] == quote {
            return Some(i);
        }
        i += 1;
    }
    None
}

/// 从公众号静态 HTML 抓取 `cgiData.content_noencode` 并 JS 解码，返回真实 HTML。
/// 支持 `content_noencode:` 与 `"content_noencode":` 两种 key 形态、单双引号值。
/// 非公众号页面 / 字段缺失 → None。
fn extract_wechat_cgi_content(html: &str) -> Option<String> {
    let key = "content_noencode";
    let key_pos = html.find(key)?;
    let mut cursor = &html[key_pos + key.len()..];
    // 跳过包围 key 的引号（`"content_noencode":` 形态）
    if let Some(stripped) = cursor.strip_prefix('"').or_else(|| cursor.strip_prefix('\'')) {
        cursor = stripped;
    }
    let after_colon = cursor.trim_start().strip_prefix(':')?;
    let body_start = after_colon.trim_start();
    let value = js_string_value(body_start)?;
    Some(decode_js_string(value))
}

/// 读取 JS 字符串字面量的值内容（单/双引号），无引号包裹返回 None。
fn js_string_value(body_start: &str) -> Option<&str> {
    for quote in ['\'', '"'] {
        if let Some(stripped) = body_start.strip_prefix(quote) {
            let end = scan_js_string_end(stripped.as_bytes(), quote as u8)?;
            return Some(&stripped[..end]);
        }
    }
    None
}

/// 判定「幻灯片多图」模板（`item_show_type == 8`）。
///
/// 手写匹配（不用 regex）：找 `item_show_type` 后跳过 `[:=]` 与引号空白取数字。
/// 只有该模板的正文图才藏在 `picture_page_info_list` 里；普通图文（0/1/…）同名
/// 数组是图片查看器用的全量图，与正文 `<img>` 重复，误注入会让文档顶部多出
/// 一串重复图且顺序与正文不一致（历史缺陷）。
fn is_picture_page_article(html: &str) -> bool {
    let Some(pos) = html.find("item_show_type") else {
        return false;
    };
    let rest = html[pos + "item_show_type".len()..].trim_start();
    // 跳过任意混合的 `:` `=` 引号空白（兼容 `item_show_type: 8` 与 `"item_show_type": 8`）
    let rest = rest.trim_start_matches(|c| matches!(c, ':' | '=' | '\'' | '"') || c.is_whitespace());
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse::<u32>().map(|v| v == 8).unwrap_or(false)
}

/// 解码 JS 字符串后再反复解 HTML 实体到稳定点。
/// `picture_page_info_list` 里的 `&` 被多重转义（`&` → `\x26amp;` → `&amp;`），
/// 单次解码会残留 `&amp;`，导致 CDN URL 与正文图不等价。
fn decode_js_string_entities(raw: &str) -> String {
    let mut s = decode_js_string(raw);
    for _ in 0..3 {
        let next = decode_entities(&s);
        if next == s {
            break;
        }
        s = next;
    }
    s
}

/// 提取公众号「幻灯片多图」文章的全部图 URL（`picture_page_info_list[*].cdn_url`）。
///
/// 这些图就是正文：按原顺序接在标题之后。规则：按出现顺序返回；`http://` 升
/// `https://`；跳过已知占位（pic_blank.gif 等）；去重；非公众号页面 / 字段缺失
/// → 空 Vec。与普通图文的 `<img>` 互不重复（仅 type 8 才进入）。
fn extract_wechat_picture_page_urls(html: &str) -> Vec<String> {
    if !is_picture_page_article(html) {
        return Vec::new();
    }
    let key = "picture_page_info_list";
    let Some(key_pos) = html.find(key) else {
        return Vec::new();
    };
    let bytes = html.as_bytes();
    // key 之后定位匹配的 '['，再循环到对应的 ']'
    let Some(mut cursor) = skip_key_colon(bytes, key_pos + key.len(), bytes.len()) else {
        return Vec::new();
    };
    while cursor < bytes.len()
        && (bytes[cursor].is_ascii_whitespace() || bytes[cursor] == b'{' || bytes[cursor] == b'[')
        && bytes[cursor] != b']'
    {
        cursor += 1;
    }
    let Some(array_close) = find_array_close(bytes, cursor) else {
        return Vec::new();
    };

    let mut out: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut i = cursor;
    while i + 7 <= array_close {
        // 手写匹配 cdn_url 键（容忍引号/空白，避免为几处匹配引入 regex crate）
        if !bytes[i..].starts_with(b"cdn_url") {
            i += 1;
            continue;
        }
        let Some(after_colon) = skip_key_colon(bytes, i + 7, array_close) else {
            i += 1;
            continue;
        };
        let mut j = after_colon;
        while j < array_close && (bytes[j] as char).is_ascii_whitespace() {
            j += 1;
        }
        if j >= array_close {
            break;
        }
        let quote = bytes[j];
        if quote != b'\'' && quote != b'"' {
            i = j;
            continue;
        }
        j += 1;
        let value_start = j;
        let Some(rel_end) = scan_js_string_end(&bytes[value_start..array_close], quote) else {
            i = value_start;
            continue;
        };
        let value_end = value_start + rel_end;
        let decoded = decode_js_string_entities(&html[value_start..value_end]);
        let url = if decoded.starts_with("https://") {
            decoded
        } else if let Some(rest) = decoded.strip_prefix("http://") {
            format!("https://{}", rest)
        } else {
            i = value_end + 1;
            continue;
        };
        let path = url.split('?').next().unwrap_or(url.as_str());
        if !url.is_empty()
            && !path.contains("pic_blank.gif")
            && !path.contains("pic_loading.gif")
            && !path.contains("pic_placeholder")
            && seen.insert(url.clone())
        {
            out.push(url);
        }
        i = value_end + 1;
    }
    out
}

/// 跳过键名后的引号与空白，要求紧跟 `':'`，返回冒号后一字节位置。
/// 兼容 `cdn_url:` / `"cdn_url":` / `'cdn_url' :` 三种 JS 字面量形态。
fn skip_key_colon(bytes: &[u8], mut i: usize, end: usize) -> Option<usize> {
    while i < end && (bytes[i].is_ascii_whitespace() || bytes[i] == b'"' || bytes[i] == b'\'') {
        i += 1;
    }
    if i < end && bytes[i] == b':' {
        Some(i + 1)
    } else {
        None
    }
}

/// 在含 `'['` 的字节序列中找匹配的 `']'`（粗略兼容 JS 数组，不解转义）。
fn find_array_close(bytes: &[u8], from: usize) -> Option<usize> {
    let mut depth = 0usize;
    let mut i = from;
    while i < bytes.len() {
        match bytes[i] {
            b'[' => depth += 1,
            b']' => {
                if depth == 0 {
                    return Some(i);
                }
                depth -= 1;
            }
            _ => {}
        }
        i += 1;
    }
    None
}

// ================================================================ 懒加载图片

/// 懒加载图片提升：`src` 为空时把 `data-src` 写回为正式 src。
/// 逐 `<img` 找 `>`（手写，无 regex）：剥掉占位 src 与 data-src 后，在 '>' 前
/// 插入真实地址；data-src 也为空则原样保留。
fn rewrite_lazy_images(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut rest = html;
    while let Some(start) = find_ci(rest, "<img") {
        out.push_str(&rest[..start]);
        let Some(gt_rel) = find_tag_end(rest.as_bytes(), start)
            .map(|i| i - start)
            .or_else(|| rest[start..].find('>'))
        else {
            out.push_str(&rest[start..]);
            return out;
        };
        let tag_end = start + gt_rel + 1;
        let tag = &rest[start..tag_end];
        let src = attr_value(tag, "src").unwrap_or_default();
        let data_src = attr_value(tag, "data-src").unwrap_or_default();
        if src.trim().is_empty() && !data_src.trim().is_empty() {
            let mut new_tag = remove_attrs(tag, &["src", "data-src"]);
            let insert_at = new_tag.len().saturating_sub(1);
            new_tag.insert_str(insert_at, &format!(" src=\"{}\"", data_src));
            out.push_str(&new_tag);
        } else {
            out.push_str(tag);
        }
        rest = &rest[tag_end..];
    }
    out.push_str(rest);
    out
}

/// 从标签中剔除指定属性（大小写不敏感；前边界校验，`src` 不误伤 `data-src`）。
/// 引号感知切分：属性值中的空白不会把标签切坏；未命中属性时字节级还原。
fn remove_attrs(tag: &str, names: &[&str]) -> String {
    let Some(gt) = tag.find('>') else {
        return tag.to_string();
    };
    let mut out = String::with_capacity(tag.len());
    out.push_str(&tag[..tag_name_end(tag, gt)]);
    let mut cursor = tag_name_end(tag, gt);
    for (aname, _, _, end) in attrs_of(tag, gt) {
        if names.contains(&aname.as_str()) {
            cursor = end; // 连同属性前的空白一并丢弃
            continue;
        }
        out.push_str(&tag[cursor..end]);
        cursor = end;
    }
    out.push_str(&tag[cursor..gt]);
    out.push_str(&tag[gt..]);
    out
}

/// 标签名结束位置（`<` 后首个空白 / '>' / '/' 之前）。
fn tag_name_end(tag: &str, gt: usize) -> usize {
    let bytes = tag.as_bytes();
    let mut i = 1usize;
    while i < gt && !bytes[i].is_ascii_whitespace() && bytes[i] != b'>' && bytes[i] != b'/' {
        i += 1;
    }
    i
}

/// 标签属性条目：属性名（小写）+ 可选值（原样，含引号）+ 整条属性字节区间
/// （start 含前导空白，便于整条剔除/保留时连同空白一起处理）。
type AttrEntry<'a> = (String, Option<&'a str>, usize, usize);

/// 引号感知的属性迭代：按空白切分，但引号内的空白 / '>' / 引号不切分；
/// 容忍 `name = "v"` 的空格形态。返回 Vec 以避免生命周期外泄。
fn attrs_of(tag: &str, gt: usize) -> Vec<AttrEntry<'_>> {
    let bytes = tag.as_bytes();
    let mut out: Vec<AttrEntry<'_>> = Vec::new();
    let mut i = tag_name_end(tag, gt);
    while i < gt {
        let start = i;
        while i < gt && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= gt {
            break;
        }
        // 属性名：非空白 / '=' / '>' 的连续串
        let name_start = i;
        while i < gt && !bytes[i].is_ascii_whitespace() && bytes[i] != b'=' && bytes[i] != b'>' {
            i += 1;
        }
        if i == name_start {
            i += 1; // 孤立 '=' 等异常字符，跳过
            continue;
        }
        let name = tag[name_start..i].to_ascii_lowercase();
        // 跳过 '=' 前后的空白
        let mut j = i;
        while j < gt && bytes[j].is_ascii_whitespace() {
            j += 1;
        }
        let value = if j < gt && bytes[j] == b'=' {
            j += 1;
            while j < gt && bytes[j].is_ascii_whitespace() {
                j += 1;
            }
            if j < gt && (bytes[j] == b'"' || bytes[j] == b'\'') {
                let quote = bytes[j];
                let vstart = j;
                j += 1;
                while j < gt && bytes[j] != quote {
                    j += 1;
                }
                if j < gt {
                    j += 1; // 含收尾引号
                }
                Some(&tag[vstart..j])
            } else {
                let vstart = j;
                while j < gt && !bytes[j].is_ascii_whitespace() {
                    j += 1;
                }
                Some(&tag[vstart..j])
            }
        } else {
            None
        };
        out.push((name, value, start, j));
        i = j;
    }
    out
}

/// 属性值（含引号）去引号 + 解实体 + 去空白后是否 `javascript:` 协议。
/// 覆盖 `javascript:`、`" JavaScript:…"`（引号内前导空格）、`javascript&#58;` 等变形。
fn is_javascript_url(value: Option<&str>) -> bool {
    let Some(v) = value else {
        return false;
    };
    let inner = v.trim().trim_matches(|c| c == '"' || c == '\'');
    decode_entities(inner)
        .to_ascii_lowercase()
        .trim_start()
        .starts_with("javascript:")
}

// ================================================================ HTML 净化

/// HTML 输出前净化：剥 script/style/noscript 整块、HTML 注释、on* 事件属性、
/// `javascript:` 的 href/src。**内联 style 属性全部保留**（样式还原关键）。
fn sanitize_html(html: &str) -> String {
    let stripped = strip_blocks(html);
    let mut out = String::with_capacity(stripped.len());
    let mut rest = stripped.as_str();
    while let Some(lt) = rest.find('<') {
        out.push_str(&rest[..lt]);
        let after = &rest[lt..];
        // 引号感知找标签结束；残缺引号回退到朴素查找
        let Some(gt_rel) = find_tag_end(after.as_bytes(), 0).or_else(|| after.find('>')) else {
            out.push_str(after);
            return out;
        };
        let tag = &after[..gt_rel + 1];
        if is_real_tag(tag) {
            out.push_str(&sanitize_tag(tag));
        } else {
            out.push_str(tag);
        }
        rest = &after[gt_rel + 1..];
    }
    out.push_str(rest);
    out
}

/// 剥除整块：script / style / noscript（大小写不敏感）+ HTML 注释。
fn strip_blocks(html: &str) -> String {
    let mut out = html.to_string();
    for (open, close) in [
        ("<script", "</script>"),
        ("<style", "</style>"),
        ("<noscript", "</noscript>"),
    ] {
        loop {
            let lower = out.to_ascii_lowercase();
            let Some(start) = lower.find(open) else {
                break;
            };
            let Some(rel_end) = lower[start..].find(close) else {
                out.truncate(start);
                break;
            };
            out.replace_range(start..start + rel_end + close.len(), "");
        }
    }
    while let Some(start) = out.find("<!--") {
        let Some(rel) = out[start..].find("-->") else {
            out.truncate(start);
            break;
        };
        out.replace_range(start..start + rel + 3, "");
    }
    out
}

/// 是否真实标签起点（`<` 后跟字母或 `/`；排除 `<!`、`< ` 等文本尖括号）。
fn is_real_tag(tag: &str) -> bool {
    let b = tag.as_bytes();
    b.len() >= 2 && (b[1].is_ascii_alphabetic() || b[1] == b'/')
}

/// 标签级净化：剥 on* 事件属性；`javascript:` 的 href/src 置空。其余属性
/// （含 style）原样保留。属性切分引号感知，`href=" JavaScript:…"` 不绕过。
fn sanitize_tag(tag: &str) -> String {
    let Some(gt) = tag.find('>') else {
        return tag.to_string();
    };
    let name_end = tag_name_end(tag, gt);
    let mut out = String::with_capacity(tag.len());
    out.push_str(&tag[..name_end]);
    let mut cursor = name_end;
    for (aname, value, start, end) in attrs_of(tag, gt) {
        // on* 事件属性整体剥除
        if aname.starts_with("on") && aname.len() > 2 {
            cursor = end;
            continue;
        }
        // javascript: 协议的 href/src 置空
        if (aname == "href" || aname == "src") && is_javascript_url(value) {
            out.push_str(&tag[cursor..start]);
            out.push_str(&aname);
            out.push_str("=\"\"");
            cursor = end;
            continue;
        }
        out.push_str(&tag[cursor..end]);
        cursor = end;
    }
    out.push_str(&tag[cursor..gt]);
    out.push_str(&tag[gt..]);
    out
}

/// 找标签结束 '>'（引号感知：属性值中的 '>' 不结束标签）。
/// 引号未闭合（残缺 HTML）时返回 None，由调用方回退到朴素查找。
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

// ================================================================ 输出组装

/// HTML 文本/属性转义（& < > "）。
fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// 组装 HTML 输出：标题 + 净化后的正文 + 来源脚注，复用 HTML_DOC_CSS 排版。
///
/// 本地化图片等附件保持【相对路径】引用（`<stem>.assets/…`，与落盘目录同名）：HTML 经
/// 前端 `convertFileSrc` 加载后，iframe 以文档为 base 直接解析相对路径，无需再 absolutize
/// 成 `asset://`。`dir` / `stem` 仅保留历史签名，当前不再参与改写。
fn build_html(title: &str, body: &str, url: &str, _dir: &str, _stem: &str) -> String {
    let t = escape_html(title);
    let u = escape_html(url);
    // 相对引用保持原样：`<stem>.assets/…` 由前端加载时按文档 base 解析
    let body = sanitize_html(body);
    format!(
        "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>{}</title>\
<style>{} img{{max-width:100%;height:auto;display:block;margin:16px auto;}}</style></head>\
<body><h1>{}</h1>{}<p style=\"color:#888;font-size:13px\">来源：<a href=\"{}\">{}</a></p></body></html>",
        t, HTML_DOC_CSS, t, body, u, u
    )
}

/// 组装 Markdown 输出（html_to_md 内部已剥 script/style）。
fn build_md(title: &str, body: &str, url: &str) -> String {
    let mut s = String::new();
    if !title.trim().is_empty() {
        s.push_str(&format!("# {}\n\n", title.trim()));
    }
    s.push_str(&html_to_md(body));
    s.push_str(&format!("\n\n> 来源: {}\n", url));
    s
}

// ================================================================ 文件名

/// 文件名主干：用户输入优先，否则取网页标题净化；都空则兜底 imported-article。
/// 净化走 assets 模块的 `sanitize_stem`（与本地化落盘目录名同源，保证 `<stem>.assets/`
/// 目录名与 HTML 内引用一致）。
/// 文件名优先级：用户显式指定（非空）> 网页标题 > 兜底。空名 / 纯符号名视为「未指定」，
/// 回退到标题——避免 `sanitize_stem("")` 的 "doc" 兜底把文件名强行写成 doc。
fn pick_stem(name: &str, title: &str) -> String {
    let n = name.trim();
    if !n.is_empty() {
        let custom = sanitize_stem(n);
        if !custom.is_empty() {
            return custom;
        }
    }
    let from_title = sanitize_stem(title);
    if !from_title.is_empty() {
        return from_title;
    }
    "imported-article".to_string()
}

/// 落盘路径：重名冲突追加 `-1`、`-2`…（fs::metadata 探测，上限 100）。
fn unique_path(dir: &str, stem: &str, ext: &str) -> Result<String, String> {
    let base = format!("{}/{}.{}", dir, stem, ext);
    if fs::metadata(&base).is_err() {
        return Ok(base);
    }
    for i in 1..=100 {
        let cand = format!("{}/{}-{}.{}", dir, stem, i, ext);
        if fs::metadata(&cand).is_err() {
            return Ok(cand);
        }
    }
    Err(format!("「{}.{}」同名文件过多，请重命名后再试", stem, ext))
}

// ================================================================ 手写 helpers
// （风格照抄 convert::text，避免为格式转换引入新依赖）

/// 属性名字符：字母数字与 `-` `_` `:`（用于前边界校验）。
fn is_attr_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b':'
}

/// 从标签文本取属性值（大小写不敏感，支持单/双引号与裸值）。
/// 属性名前边界校验：`src` 不会误匹配 `data-src` 里的 `src`。
/// **值一律从原始串切**：URL 大小写敏感（mmbiz CDN 降小写即 400），
/// 且 HTML 里的原始大小写串是 src 原位改写的匹配目标，降小写会静默失配。
fn attr_value(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let mut from = 0usize;
    while let Some(rel) = lower[from..].find(name) {
        let idx = from + rel;
        from = idx + name.len();
        if idx > 0 && is_attr_char(lower.as_bytes()[idx - 1]) {
            continue;
        }
        let after = tag[idx + name.len()..].trim_start();
        let Some(v) = after.strip_prefix('=') else {
            continue;
        };
        let v = v.trim_start();
        let Some(quote) = v.chars().next() else {
            continue;
        };
        if quote == '"' || quote == '\'' {
            let body = &v[quote.len_utf8()..];
            let end = body.find(quote)?;
            return Some(body[..end].to_string());
        }
        let end = v
            .find(|c: char| c.is_whitespace() || c == '>')
            .unwrap_or(v.len());
        return Some(v[..end].to_string());
    }
    None
}

/// 大小写不敏感查找，返回字节偏移。
fn find_ci(haystack: &str, needle: &str) -> Option<usize> {
    haystack
        .to_ascii_lowercase()
        .find(&needle.to_ascii_lowercase())
}

/// 解码常见 HTML 实体：命名实体 + 数字实体（`&#58;` / `&#x3a;`）。
/// 逐段扫描而非整串 replace：`&amp;lt;` 只解一层得 `&lt;`，不会二次解码。
/// 数字实体必须支持——否则 `href="javascript&#58;alert(1)"` 可绕过净化。
fn decode_entities(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        let tail = &rest[amp..];
        let ent = tail.find(';').map(|i| &tail[..i + 1]).unwrap_or(tail);
        let decoded = parse_numeric_entity(ent).or_else(|| named_entity(ent));
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
fn parse_numeric_entity(ent: &str) -> Option<char> {
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

/// 折叠连续空白为单个空格（标题 / 元素文本用）。
fn collapse_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// 极简大小写不敏感「正则」替换：`pattern` 中 `[^>]*`、`|` 为唯一通配语法。
/// 与 convert::text 同口径，本模块只需匹配标签形状。
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

/// 在 `s` 中查找 `pat`（大小写不敏感），支持 `[^>]*` 通配，返回 (start, end)。
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_md_and_html_restore_lists_and_image_paths() {
        // 集成（自包含，无网络/无临时文件）：正文含 `<li><p>` 有序列表、带空格的
        // 本地化图片路径、以及 `<table>` 表格；build_md 应还原列表标记、补 GFM
        // 表头分隔行、图片空格百分号编码；build_html 保留内联样式与图片 src（相对引用）、
        // 不残留会造成横向不换行的 nowrap。这三条正是真实导入链路保存产物所走的函数。
        let body = "<ol><li><p>问题一？</p></li><li><p>问题二？</p></li></ol>\
<p><img src=\"标题 与 副标题.assets/img-001.jpg\" alt=\"图\"></p>\
<table><tr><th>模型</th><th>参数量</th></tr>\
<tr><td>MoE</td><td>8B</td></tr><tr><td>Dense</td><td>7B</td></tr></table>";
        let url = "https://example.com/a";

        let md = build_md("测试标题", body, url);
        assert!(md.contains("1. 问题一？"), "有序列表文字应紧跟标记: {md}");
        assert!(md.contains("2. 问题二？"), "{md}");
        assert!(!md.contains("1. \n\n问题一"), "不应有脱钩: {md}");
        assert!(
            md.contains("![图](标题%20与%20副标题.assets/img-001.jpg)"),
            "图片空格应百分号编码: {md}"
        );
        // 表格：表头 + 分隔行 + 数据行
        assert!(md.contains("| 模型 | 参数量 |"), "表格表头: {md}");
        assert!(md.contains("| :--- | :--- |"), "表格须补 GFM 分隔行: {md}");
        assert!(md.contains("| MoE | 8B |"), "表格数据行: {md}");
        assert!(md.contains("| Dense | 7B |"), "表格数据行: {md}");
        assert!(md.starts_with("# 测试标题"), "{md}");
        assert!(md.contains("> 来源: https://example.com/a"), "{md}");

        let html = build_html("测试标题", body, url, "/Users/tatsuma/Documents/本地知识库", "标题 与 副标题");
        assert!(html.contains("<h1>测试标题</h1>"), "{html}");
        // HTML 本地图片保持相对路径引用（<stem>.assets/…），由前端按文档 base 解析，
        // 不再 absolutize 成 asset:// 绝对 URL，也不对空格做百分号编码。
        assert!(!html.contains("asset://localhost/"), "HTML 本地图片应为相对路径，而非 asset:// 绝对 URL: {html}");
        assert!(html.contains(".assets/img-001.jpg"), "图片引用应保留: {html}");
        assert!(html.contains("标题 与 副标题.assets/img-001.jpg"), "图片引用应为相对路径（保留原始中文/空格）: {html}");
        assert!(!html.contains("%20"), "相对路径不应再对空格做百分号编码: {html}");
        assert!(!html.contains("white-space: nowrap"), "{html}");
    }

    // ---------------- JS 字符串解码 ----------------

    #[test]
    fn decode_js_string_handles_escapes() {
        assert_eq!(decode_js_string("a\\x41b"), "aAb");
        assert_eq!(decode_js_string("\\u4e16\\u754c"), "世界");
        assert_eq!(decode_js_string("a\\nb"), "a\nb");
        assert_eq!(decode_js_string("a\\\\b"), "a\\b");
        // 未知转义原样保留
        assert_eq!(decode_js_string("a\\qb"), "a\\qb");
        // 非法 hex 原样保留
        assert_eq!(decode_js_string("\\xZZ"), "\\xZZ");
    }

    // ---------------- 公众号正文提取 ----------------

    #[test]
    fn extract_wechat_cgi_content_reads_js_string() {
        // 双引号值 + 带引号 key 变体
        let html = r#"<script>var cgiData = {"content_noencode": "<p>你好\u4e16\u754c</p>"};</script>"#;
        assert_eq!(
            extract_wechat_cgi_content(html).unwrap(),
            "<p>你好世界</p>"
        );
        // 单引号值 + 裸 key
        let html2 = "var cgiData = {content_noencode: '<p>x</p>'};";
        assert_eq!(extract_wechat_cgi_content(html2).unwrap(), "<p>x</p>");
        // 缺失字段
        assert!(extract_wechat_cgi_content("<html><body>无</body></html>").is_none());
    }

    #[test]
    fn is_picture_page_article_detects_type_8() {
        assert!(is_picture_page_article("var x = {item_show_type: 8};"));
        assert!(is_picture_page_article("var x = {item_show_type: '8'};"));
        assert!(!is_picture_page_article("var x = {item_show_type: 0};"));
        assert!(!is_picture_page_article("no such field here"));
    }

    #[test]
    fn extract_wechat_picture_page_urls_orders_dedups_upgrades() {
        let html = r#"<script>var cgiData = {
            item_show_type: 8,
            picture_page_info_list: [
                {cdn_url: "http://mmbiz.qpic.cn/a.png"},
                {cdn_url: "https://mmbiz.qpic.cn/b.png"},
                {cdn_url: "http://mmbiz.qpic.cn/a.png"},
                {cdn_url: "https://mmbiz.qpic.cn/pic_blank.gif"}
            ]
        };</script>"#;
        let urls = extract_wechat_picture_page_urls(html);
        assert_eq!(
            urls,
            vec![
                "https://mmbiz.qpic.cn/a.png".to_string(),
                "https://mmbiz.qpic.cn/b.png".to_string()
            ]
        );
        // 非多图模板：同名数组也不注入（历史缺陷回归）
        let plain = html.replace("item_show_type: 8", "item_show_type: 0");
        assert!(extract_wechat_picture_page_urls(&plain).is_empty());
    }

    // ---------------- 元素提取 ----------------

    #[test]
    fn extract_element_handles_nesting() {
        let html = r#"<div class="wrap"><div id="js_content"><p>一</p><div><p>二</p></div></div></div>"#;
        let inner = extract_element_by_id(html, "js_content").unwrap();
        assert_eq!(inner, "<p>一</p><div><p>二</p></div>");

        let html2 = r#"<article><h2>标题</h2><section><p>内容</p></section></article>"#;
        let inner2 = extract_element(html2, "article").unwrap();
        assert!(inner2.contains("<h2>标题</h2>"));
        assert!(inner2.contains("<section><p>内容</p></section>"));
    }

    #[test]
    fn extract_title_prefers_activity_name() {
        let html = r#"<html><head><title>网页标题</title></head><body><h1 id="activity-name">活动名称</h1><h1>第一个 H1</h1></body></html>"#;
        assert_eq!(extract_title(html, true), "活动名称");
        let html2 = r#"<html><head><title>网页标题</title></head><body><h1>普通标题</h1></body></html>"#;
        assert_eq!(extract_title(html2, false), "普通标题");
        assert_eq!(extract_title("<title>仅标题</title>", false), "仅标题");
    }

    #[test]
    fn pick_stem_uses_title_when_name_empty() {
        // 导入对话框留空时，文件名应取网页标题，而非 sanitize_stem("") 的 "doc" 兜底
        assert_eq!(pick_stem("", "面试官如何做全链路资源隔离"), "面试官如何做全链路资源隔离");
        assert_eq!(pick_stem("   ", "活动名称"), "活动名称");
        // 用户显式指定名仍优先
        assert_eq!(pick_stem("我的笔记", "网页标题"), "我的笔记");
        // 名与标题皆空：sanitize_stem("") 兜底下落到 "doc"（总要有文件名）
        assert_eq!(pick_stem("", ""), "doc");
        // 纯符号名经 sanitize 兜底层为 "doc"（极端边界，非用户报告场景）
        assert_eq!(pick_stem("###", "正文标题"), "doc");
    }

    #[test]
    fn extract_body_falls_back_chain() {
        let html = r#"<body><article><p>文章内容</p></article></body>"#;
        assert_eq!(extract_body(html, false).unwrap(), "<p>文章内容</p>");
        let html2 = r#"<body><div id="js_content"><p>JS 正文</p></div></body>"#;
        assert_eq!(extract_body(html2, false).unwrap(), "<p>JS 正文</p>");
        let html3 = "<html><body><p>整页</p></body></html>";
        assert!(extract_body(html3, false).unwrap().contains("整页"));
        // 微信页面无正文容器 → Err
        assert!(extract_body("<html><body>验证页面</body></html>", true).is_err());
    }

    // ---------------- 懒加载图片 ----------------

    #[test]
    fn rewrite_lazy_images_promotes_data_src() {
        let html = r#"<p><img data-src="https://mmbiz.qpic.cn/real.png" src=""></p><img src="keep.png">"#;
        let out = rewrite_lazy_images(html);
        assert!(out.contains("https://mmbiz.qpic.cn/real.png"));
        // 不残留 data-src
        assert!(!out.contains("data-src"));
        assert!(out.contains("keep.png"));
    }

    #[test]
    fn lazy_promotion_handles_space_in_value_and_quoted_gt() {
        // 属性值含空格时引号感知切分不能把标签切坏
        let html = r#"<img data-src="https://mmbiz.qpic.cn/a b.png" alt="x>y" src="">"#;
        let out = rewrite_lazy_images(html);
        assert!(out.contains("https://mmbiz.qpic.cn/a b.png"), "{}", out);
        assert!(out.contains("alt=\"x>y\""), "{}", out);
        assert!(!out.contains("data-src"), "{}", out);
    }

    // ---------------- HTML 净化 ----------------

    #[test]
    fn sanitize_html_strips_dangerous_parts() {
        let html = r#"<p style="color:red" onclick="evil()">文本</p><script>alert(1)</script><a href="javascript:alert(1)">链接</a><style>.x{}</style><!-- c --><img src="a.png" onerror="x()">"#;
        let out = sanitize_html(html);
        // 内联 style 保留
        assert!(out.contains("<p style=\"color:red\">文本</p>"), "{}", out);
        assert!(!out.contains("onclick"));
        assert!(!out.contains("alert"));
        assert!(!out.contains("<script"));
        assert!(!out.contains("<style"));
        assert!(!out.contains("<!--"));
        // javascript: 置空，正常 src 保留
        assert!(out.contains("href=\"\""), "{}", out);
        assert!(out.contains("src=\"a.png\""), "{}", out);
        assert!(!out.contains("onerror"));
    }

    #[test]
    fn sanitize_neutralizes_quoted_space_and_entity_javascript() {
        // 回归（QA 实测）：引号内前导空格曾被空白切分绕过；数字实体 &#58; 同样绕过
        let html = r#"<a href=" JavaScript:alert(1)">x</a><a href="javascript&#58;alert(2)">y</a><a href="javascript&#x3a;alert(3)">z</a>"#;
        let out = sanitize_html(html);
        assert!(!out.contains("javascript"), "{}", out);
        assert!(!out.contains("JavaScript"), "{}", out);
        assert_eq!(out.matches("href=\"\"").count(), 3, "{}", out);
        // 正常 href 不受影响
        let ok = sanitize_html(r#"<a href="https://x.dev/a?b=1&c=2">ok</a>"#);
        assert!(ok.contains("href=\"https://x.dev/a?b=1&c=2\""), "{}", ok);
    }

    #[test]
    fn sanitize_keeps_quoted_gt_and_spaces_around_eq() {
        let html = r#"<img alt="a>b" src = "x.png" ><p>t</p>"#;
        let out = sanitize_html(html);
        assert!(out.contains("alt=\"a>b\""), "{}", out);
        assert!(out.contains("src = \"x.png\""), "{}", out);
        assert!(out.contains("<p>t</p>"), "{}", out);
    }

    // ---------------- 文件名 ----------------

    #[test]
    fn sanitize_stem_keeps_cjk_and_strips_illegal() {
        // 与 assets.rs 同源的 ASCII 安全 slug（亦用于文件名主干 pick_stem 与本地化落盘
        // stem，保证 `<stem>.assets/` 目录名与 HTML 引用一致）：保留中文与字母数字；
        // 空格 / 连字符转下划线；其余特殊符号（含 . : / ？ 等）去除；折叠连续下划线 +
        // trim；为空则回退 "doc"。
        assert_eq!(sanitize_stem("报告/最终:版？"), "报告最终版");
        assert_eq!(sanitize_stem("a<b>c|d"), "abcd");
        assert_eq!(sanitize_stem("readme.md"), "readmemd");
        assert_eq!(sanitize_stem("page.html"), "pagehtml");
        // 空格 / 连字符转下划线并折叠连续下划线
        assert_eq!(sanitize_stem("my  file--name"), "my_file_name");
        // 空白 / 纯特殊符号 → 空 → 回退 "doc"
        assert_eq!(sanitize_stem("  "), "doc");
        assert_eq!(sanitize_stem("..."), "doc");
        // 中文目录名不再截断
        let long: String = "长".repeat(100);
        assert_eq!(sanitize_stem(&long), long);
    }

    #[test]
    fn unique_path_appends_suffix_on_conflict() {
        let dir = std::env::temp_dir().join(format!("mdview-import-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let dir_str = dir.to_str().unwrap();
        let p1 = unique_path(dir_str, "文章", "md").unwrap();
        fs::write(&p1, "x").unwrap();
        let p2 = unique_path(dir_str, "文章", "md").unwrap();
        assert!(p2.ends_with("文章-1.md"), "{}", p2);
        fs::write(&p2, "x").unwrap();
        let p3 = unique_path(dir_str, "文章", "md").unwrap();
        assert!(p3.ends_with("文章-2.md"), "{}", p3);
        let _ = fs::remove_dir_all(&dir);
    }

    // ---------------- 反缺陷回归 ----------------

    #[test]
    fn cover_image_never_moves_above_title() {
        // 公众号普通图文：封面在 cgiData.cdn_url，正文容器不含封面 img。
        // 历史缺陷把封面拼到标题上方；本模块封面一律不进正文。
        let cover = "https://mmbiz.qpic.cn/mmbiz_png/COVER/640?wx_fmt=png";
        let html = format!(
            r#"<html><head><title>网页标题</title></head><body>
            <h1 id="activity-name">文章标题</h1>
            <div id="js_content"><p>第一段</p><p>第二段</p></div>
            <script>var cgiData = {{"cdn_url": "{}", "item_show_type": 0, "content_noencode": ""}};</script>
            </body></html>"#,
            cover
        );
        let title = extract_title(&html, true);
        let body = extract_body(&html, true).unwrap();
        let md = build_md(&title, &body, "https://mp.weixin.qq.com/s/abc");
        assert!(md.starts_with("# 文章标题"), "{}", md);
        assert!(md.contains("第一段"));
        assert!(!md.contains(cover), "封面图不得出现在正文: {}", md);
        let html_out = build_html(&title, &body, "https://mp.weixin.qq.com/s/abc", "", "");
        assert!(!html_out.contains(cover), "封面图不得出现在 HTML: {}", html_out);
    }

    #[test]
    fn slides_go_after_title_as_body() {
        // 幻灯片多图模板：图即正文，接在标题之后、正文之前
        let cover = "https://mmbiz.qpic.cn/slide1.png";
        let html = format!(
            r#"<html><body>
            <h1 id="activity-name">幻灯片标题</h1>
            <div id="js_content"><p>脚注文字</p></div>
            <script>var cgiData = {{"item_show_type": 8, "picture_page_info_list": [{{"cdn_url": "{}"}}]}};</script>
            </body></html>"#,
            cover
        );
        let title = extract_title(&html, true);
        let body = extract_body(&html, true).unwrap();
        let mut content = body;
        if is_picture_page_article(&html) {
            let mut head = String::new();
            for u in extract_wechat_picture_page_urls(&html) {
                head.push_str(&format!(
                    "<p style=\"text-align:center\"><img src=\"{}\"></p>",
                    u
                ));
            }
            content = format!("{}{}", head, content);
        }
        let md = build_md(&title, &content, "https://mp.weixin.qq.com/s/abc");
        let img_pos = md.find(cover).unwrap();
        let title_pos = md.find("# 幻灯片标题").unwrap();
        let text_pos = md.find("脚注文字").unwrap();
        assert!(title_pos < img_pos && img_pos < text_pos, "{}", md);
        assert!(md.contains(&format!("![]({})", cover)), "{}", md);
    }

    // ---------------- 输出结构 ----------------

    #[test]
    fn decode_entities_handles_numeric_entities() {
        assert_eq!(decode_entities("a&#58;b"), "a:b");
        assert_eq!(decode_entities("a&#x3a;b"), "a:b");
        assert_eq!(decode_entities("&#39;"), "'");
        // 只解一层：&amp;lt; → &lt;，不被二次解码
        assert_eq!(decode_entities("&amp;lt;"), "&lt;");
        assert_eq!(decode_entities("&notreal;"), "&notreal;");
        assert_eq!(decode_entities("AT&T"), "AT&T");
    }

    #[test]
    fn mixed_case_image_url_survives_into_outputs() {
        // 端到端（纯函数段）：公众号现代模板正文 <img> 只有 data-src，
        // 混合大小写 mmbiz URL 必须原样活到 md / html 产物——
        // 下载（CDN 大小写敏感）与 src 原位改写都依赖原始大小写。
        let url_mixed =
            "https://mmbiz.qpic.cn/sz_mmbiz_jpg/dHwlicgnJnmRy33uk2P3co0MDL3RlBFLli/640?wx_fmt=other&from=appmsg";
        let html = format!(
            r#"<h1 id="activity-name">混合大小写</h1><div id="js_content"><p>正文</p><img data-src="{}" src=""></div>"#,
            url_mixed
        );
        let title = extract_title(&html, true);
        let body = extract_body(&html, true).unwrap();
        let content = rewrite_lazy_images(&body);
        let md = build_md(&title, &content, "https://mp.weixin.qq.com/s/x");
        assert!(md.contains(url_mixed), "{}", md);
        let html_out = build_html(&title, &content, "https://mp.weixin.qq.com/s/x", "", "");
        assert!(html_out.contains(url_mixed), "{}", html_out);
    }

    #[test]
    fn md_output_structure() {
        let md = build_md("标题", "<p>正文</p><img src=\"a.png\">", "https://x.dev/a");
        assert!(md.starts_with("# 标题\n\n"), "{}", md);
        assert!(md.contains("正文"));
        assert!(md.contains("![](a.png)"), "{}", md);
        assert!(md.ends_with("> 来源: https://x.dev/a\n"), "{}", md);
    }

    #[test]
    fn html_output_structure() {
        let html = build_html("标题", "<p>正文</p>", "https://x.dev/a", "", "");
        assert!(html.starts_with("<!doctype html>"), "{}", html);
        assert!(html.contains("<title>标题</title>"), "{}", html);
        assert!(html.contains("<h1>标题</h1>"), "{}", html);
        assert!(html.contains("<p>正文</p>"), "{}", html);
        assert!(
            html.contains("来源：<a href=\"https://x.dev/a\">https://x.dev/a</a>"),
            "{}",
            html
        );
        // 标题/URL 进 HTML 前转义
        let escaped = build_html("a<b&c", "<p>x</p>", "https://x.dev/a?b=1&c=2", "", "");
        assert!(escaped.contains("<title>a&lt;b&amp;c</title>"), "{}", escaped);
        assert!(
            escaped.contains("href=\"https://x.dev/a?b=1&amp;c=2\""),
            "{}",
            escaped
        );
    }
}
