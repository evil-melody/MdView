//! 资源本地化引擎：收集 HTML 资源引用 → 下载 → 类型检测 → 原位 URL 改写。
//!
//! 从 `web_import/mod.rs` 拆出（mod.rs 1902 行逼近 2000 上限）：资源收集 /
//! 规范化 / 类型检测 / 下载 / URL 改写系列整体**移动**到此（零复制），外加
//! 本地文档远程资源拉取的三个命令（`localize_md_html` / `localize_html_file` /
//! `file_fingerprint`，前端并行开发依赖其契约）。
//!
//! 设计取舍（延续 mod.rs「零新依赖」纪律）：
//! - 相对 URL join 手写（origin 拼接 + `.`/`..` 段解析），不引 url crate；
//! - 附件收集走 `<a href>` 扩展名白名单，导航链接 / 锚点 / 协议链接一律跳过；
//! - 图片与附件分别限额 / 命名（`img-NNN.ext` / `att-NNN.ext`），同落
//!   `<dir>/<stem>.assets/`；
//! - 幂等：目标文件已存在则跳过下载直接改写（URL 带扩展名时可预检）。

use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::Path;

use super::{attr_value, decode_entities, find_tag_end, tag_name};

/// 浏览器 UA：公众号对无 UA 的请求返回环境安全验证页，拿不到正文；
/// 部分 CDN 同样对无 UA 的附件请求返回 403。
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/// 本地化图片上限：张数 / 总字节（超出则保留远程 URL）
const MAX_IMAGES: usize = 60;
const MAX_TOTAL_BYTES: usize = 20 * 1024 * 1024;

/// 本地化附件上限：个数 / 单文件字节 / 总字节防呆闸（超限保留远程 URL）
const MAX_ATTACHMENTS: usize = 40;
const MAX_ATTACHMENT_BYTES: usize = 100 * 1024 * 1024;
const MAX_ATTACHMENT_TOTAL: usize = 500 * 1024 * 1024;

/// 下载并发（分块 join_all，futures-util 已在依赖中）
const DOWNLOAD_CONCURRENCY: usize = 4;

/// `<a href>` 附件扩展名白名单：导航链接 / 页面不收集，只收真实附件。
const ATTACHMENT_EXTS: &[&str] = &[
    "pdf", "zip", "rar", "7z", "mp4", "mov", "webm", "mkv", "mp3", "wav", "ogg", "flac", "m4a",
    "doc", "docx", "xls", "xlsx", "ppt", "pptx",     "txt", "csv", "json", "epub", "apk", "dmg", "exe",
];

/// 资源目录名 / 文件名主干的 ASCII 安全 slug（与 import 链路 `pick_stem` 共用，保证
/// 落盘目录 `<stem>.assets/` 与 HTML 内引用 `<stem>.assets/…` 完全一致）：
/// 保留字母数字、中文与已有下划线；空格 / 连字符 / 其它空白统一转下划线；其余特殊符号
/// （`. , : ;` 及中文标点等）去除；折叠连续下划线、首尾 trim；结果为空则回退 "doc"，
/// 避免产生空目录名。幂等：对已 slug 化的串再跑一遍结果不变。
pub(crate) fn sanitize_stem(stem: &str) -> String {
    let mut out = String::with_capacity(stem.len());
    for c in stem.chars() {
        if c.is_alphanumeric() || c == '_' {
            // 含 ASCII 字母数字、中文（Han 等 Unicode 字母数字）与已有下划线
            out.push(c);
        } else if c.is_whitespace() || c == '-' {
            out.push('_');
        }
        // 其余特殊符号丢弃
    }
    // 折叠连续下划线
    let mut collapsed = String::with_capacity(out.len());
    let mut prev = false;
    for c in out.chars() {
        if c == '_' {
            if prev {
                continue;
            }
            prev = true;
        } else {
            prev = false;
        }
        collapsed.push(c);
    }
    let trimmed = collapsed.trim_matches('_').trim().to_string();
    if trimmed.is_empty() {
        // 净结果为空（入参全为特殊符号 / 空白）→ 回退安全常量，避免产生空目录名
        "doc".to_string()
    } else {
        trimmed
    }
}

// ================================================================ 收集

/// 资源种类：图片（`img-NNN.ext`）与附件（`att-NNN.ext`）限额 / 命名不同。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RefKind {
    Image,
    Attachment,
}

/// 一条资源引用：HTML 中的原始字符串（原位替换目标）+ 规范化 URL（下载去重）。
struct ResourceRef {
    raw: String,
    url: String,
    kind: RefKind,
}

/// 收集 HTML 中的资源引用（图片 + 附件），按 URL 去重保序：
/// - `<img src>`：跳过 data:/空 src/占位图（pic_blank 等）
/// - `<a href>`：扩展名白名单过滤；跳过 `#`/`javascript:`/`mailto:`/`data:`/空
/// - `<video src>` `<audio src>` `<source src>` `<embed src>` `<object data>`
///
/// 相对 URL 在 base 已知时相对页面 URL join；base=None 只收绝对 http(s)。
fn collect_resource_refs(html: &str, base: Option<&str>) -> Vec<ResourceRef> {
    let mut out: Vec<ResourceRef> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut rest = html;
    while let Some(start) = rest.find('<') {
        let Some(gt_rel) = find_tag_end(rest.as_bytes(), start)
            .map(|i| i - start)
            .or_else(|| rest[start..].find('>'))
        else {
            break;
        };
        let tag = &rest[start..start + gt_rel + 1];
        let Some(name) = tag_name(tag) else {
            // 文本尖括号 / `<!` / `</`：只前进过这个 '<'，
            // 避免把后面的真标签一起吞掉（`a < b <img …>` 场景）
            rest = &rest[start + 1..];
            continue;
        };
        rest = &rest[start + gt_rel + 1..];
        let (attr, kind) = match name.as_str() {
            "img" => ("src", RefKind::Image),
            "a" => ("href", RefKind::Attachment),
            "video" | "audio" | "source" | "embed" => ("src", RefKind::Attachment),
            "object" => ("data", RefKind::Attachment),
            _ => continue,
        };
        let raw = attr_value(tag, attr).unwrap_or_default();
        let raw = raw.trim().to_string();
        if raw.is_empty() || raw.starts_with("data:") {
            continue;
        }
        let Some(url) = normalize_resource_url(&raw, base) else {
            continue;
        };
        // 占位图（微信等）；附件白名单已天然排除这类
        let path = url.split('?').next().unwrap_or(url.as_str());
        if path.contains("pic_blank.gif")
            || path.contains("pic_loading.gif")
            || path.contains("pic_placeholder")
        {
            continue;
        }
        if kind == RefKind::Attachment && !is_attachment_url(&url) {
            continue;
        }
        if seen.insert(url.clone()) {
            out.push(ResourceRef { raw, url, kind });
        }
    }
    out
}

/// 是否附件白名单扩展名（按 URL 路径判定，query 不算）。
fn is_attachment_url(url: &str) -> bool {
    match url_ext(url) {
        Some(ext) => ATTACHMENT_EXTS.contains(&ext.as_str()),
        None => false,
    }
}

/// 手写相对 URL join（无 url crate）：origin 拼接 + `.`/`..` 段解析。
/// base 须含路径（`scheme://host/...`）；fragment 由调用方先行剥除。
fn join_url(base: &str, rel: &str) -> Option<String> {
    // 防御：rel 实为绝对地址时原样返回（正常流程已在调用前分流）
    if rel.contains("://") {
        return Some(rel.to_string());
    }
    let scheme_end = base.find("://")?;
    let after = &base[scheme_end + 3..];
    let path_start = scheme_end + 3 + after.find('/')?;
    let origin = &base[..path_start];
    let base_dir = &base[path_start..];
    // 根相对（/x）→ 相对 origin；否则拼到 base 所在目录
    let combined = if rel.starts_with('/') {
        rel.to_string()
    } else {
        let dir_end = base_dir.rfind('/').map(|i| i + 1).unwrap_or(0);
        format!("{}{}", &base_dir[..dir_end], rel)
    };
    let combined = combined.split('#').next().unwrap_or(&combined);
    let (path_part, query) = match combined.find('?') {
        Some(i) => (&combined[..i], &combined[i..]),
        None => (combined, ""),
    };
    let mut segs: Vec<&str> = Vec::new();
    for seg in path_part.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                segs.pop();
            }
            s => segs.push(s),
        }
    }
    Some(format!("{}/{}{}", origin, segs.join("/"), query))
}

/// 规范化资源 URL：解实体 → 去 fragment → 协议分流。
/// - `https://` 原样；`http://` / `//` 升 https（与图片链路同规则）
/// - `data:` / `javascript:` / `mailto:` / `tel:` 等 → None（跳过）
/// - 相对 URL → base join；base=None 表示只收绝对地址（本地文档场景）
pub(crate) fn normalize_resource_url(raw: &str, base: Option<&str>) -> Option<String> {
    let decoded = decode_entities(raw);
    let u = decoded.trim().split('#').next().unwrap_or(&decoded).trim();
    if u.is_empty() {
        return None;
    }
    let lower = u.to_ascii_lowercase();
    if lower.starts_with("data:")
        || lower.starts_with("javascript:")
        || lower.starts_with("mailto:")
        || lower.starts_with("tel:")
    {
        return None;
    }
    if lower.starts_with("https://") {
        return Some(u.to_string());
    }
    if lower.starts_with("http://") {
        return Some(format!("https://{}", &u[7..]));
    }
    if u.starts_with("//") {
        return Some(format!("https:{}", u));
    }
    // 其余带协议的（ftp: 等）不收
    if has_scheme(u) {
        return None;
    }
    let base = base?;
    let joined = join_url(base, u)?;
    // base 可能是 http://（用户导入的链接），统一升 https 与图片链路一致
    if let Some(rest) = joined.strip_prefix("http://") {
        Some(format!("https://{}", rest))
    } else {
        Some(joined)
    }
}

/// URL 路径中的「干净」扩展名（query 不算；≤5 位字母数字），否则 None。
pub(crate) fn url_ext(url: &str) -> Option<String> {
    let path = url.split('?').next().unwrap_or(url);
    let dot = path.rfind('.')?;
    let ext = &path[dot + 1..];
    if !ext.is_empty() && ext.len() <= 5 && ext.bytes().all(|b| b.is_ascii_alphanumeric()) {
        Some(ext.to_ascii_lowercase())
    } else {
        None
    }
}

// ================================================================ 类型检测

/// 扩展名判定：URL 路径扩展名 → content-type → 魔数；兜底 bin；svg 保持 svg。
fn detect_ext(url: &str, content_type: Option<&str>, bytes: &[u8]) -> String {
    if let Some(ext) = url_ext(url) {
        return ext;
    }
    if let Some(ct) = content_type {
        let ct = ct.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
        let mapped = match ct.as_str() {
            // 图片
            "image/png" => Some("png"),
            "image/jpeg" | "image/jpg" => Some("jpg"),
            "image/gif" => Some("gif"),
            "image/webp" => Some("webp"),
            "image/svg+xml" => Some("svg"),
            "image/bmp" => Some("bmp"),
            "image/x-icon" | "image/vnd.microsoft.icon" => Some("ico"),
            // 文档 / 压缩
            "application/pdf" => Some("pdf"),
            "application/json" => Some("json"),
            "text/plain" => Some("txt"),
            "text/html" => Some("html"),
            "application/msword" => Some("doc"),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => Some("docx"),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => Some("xlsx"),
            "application/vnd.openxmlformats-officedocument.presentationml.presentation" => Some("pptx"),
            "application/zip" | "application/x-zip-compressed" | "application/x-zip" => Some("zip"),
            // 视频
            "video/mp4" => Some("mp4"),
            "video/quicktime" => Some("mov"),
            "video/webm" => Some("webm"),
            "video/x-matroska" => Some("mkv"),
            // 音频
            "audio/mpeg" | "audio/mp3" => Some("mp3"),
            "audio/wav" | "audio/x-wav" | "audio/vnd.wave" => Some("wav"),
            "audio/ogg" => Some("ogg"),
            "audio/flac" => Some("flac"),
            _ => None,
        };
        if let Some(e) = mapped {
            return e.to_string();
        }
    }
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        return "png".to_string();
    }
    if bytes.starts_with(&[0x47, 0x49, 0x46, 0x38]) {
        return "gif".to_string();
    }
    if bytes.starts_with(&[0x52, 0x49, 0x46, 0x46])
        && bytes.len() >= 12
        && bytes[8..12] == b"WEBP"[..]
    {
        return "webp".to_string();
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return "jpg".to_string();
    }
    // 附件魔数
    if bytes.starts_with(b"%PDF") {
        return "pdf".to_string();
    }
    if bytes.starts_with(&[0x50, 0x4B, 0x03, 0x04]) {
        return "zip".to_string();
    }
    if bytes.starts_with(b"ID3")
        || (bytes.len() >= 2 && bytes[0] == 0xFF && (bytes[1] & 0xE0) == 0xE0)
    {
        return "mp3".to_string();
    }
    if bytes.len() >= 8 && bytes[4..8] == b"ftyp"[..] {
        return "mp4".to_string();
    }
    "bin".to_string()
}

// ================================================================ 下载

/// 下载单个资源（图片或附件）：带 `Referer: <页面url>` + `Accept: */*`（防盗链），
/// 单请求 8s 超时；content-length 预检 + 读后复核双保险，单文件超
/// MAX_ATTACHMENT_BYTES 返回 None。失败静默返回 None（调用方保留远程 URL）。
/// 返回 (字节, 扩展名)。
pub(crate) async fn download_resource(
    client: &reqwest::Client,
    page_url: Option<&str>,
    url: &str,
) -> Option<(Vec<u8>, String)> {
    let mut req = client
        .get(url)
        .header("Accept", "*/*")
        .timeout(std::time::Duration::from_secs(8));
    if let Some(referer) = page_url {
        req = req.header("Referer", referer);
    }
    let resp = req.send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    // 单文件上限（content-length 预检，避免拉爆内存）
    if let Some(len) = resp.content_length() {
        if len > MAX_ATTACHMENT_BYTES as u64 {
            return None;
        }
    }
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let bytes = resp.bytes().await.ok()?;
    if bytes.is_empty() || bytes.len() > MAX_ATTACHMENT_BYTES {
        return None;
    }
    let ext = detect_ext(url, content_type.as_deref(), &bytes);
    Some((bytes.to_vec(), ext))
}

// ================================================================ 本地化内核

/// 本地化产物：改写后的 HTML + 新下载的图片/附件数 + 收集到的引用总数
/// （skipped 由 collected - downloaded 推得，含已存在 / 失败 / 超限额）。
struct LocalizeOutcome {
    html: String,
    images: usize,
    attachments: usize,
    collected: usize,
}

/// 本地化上下文：产物目录信息 + 页面 URL（Referer / 相对 join 用）。
struct LocalizeCtx<'a> {
    stem: &'a str,
    assets_dir: String,
    page_url: Option<&'a str>,
}

/// 单组（图片或附件）的本地化：幂等预检（URL 带扩展名且已落盘 → 跳过下载直接
/// 改写）→ 分块并发下载 → 落盘 → 收集 (raw, 相对路径) 替换。超总预算即止，
/// 剩余保留远程 URL。assets 目录首个成功下载才创建。返回本组新下载数。
async fn localize_group(
    client: &reqwest::Client,
    ctx: &LocalizeCtx<'_>,
    refs: &[&ResourceRef],
    prefix: &str,
    total_cap: usize,
    replacements: &mut Vec<(String, String)>,
) -> usize {
    // 幂等预检：URL 带扩展名时目标文件名可预知，已存在则不下载
    let mut pending: Vec<(&ResourceRef, usize)> = Vec::new();
    for (i, r) in refs.iter().copied().enumerate() {
        let idx = i + 1;
        if let Some(ext) = url_ext(&r.url) {
            let fname = format!("{}-{:03}.{}", prefix, idx, ext);
            if fs::metadata(format!("{}/{}", ctx.assets_dir, fname)).is_ok() {
                replacements.push((r.raw.clone(), format!("{}.assets/{}", ctx.stem, fname)));
                continue;
            }
        }
        pending.push((r, idx));
    }

    let mut downloaded = 0usize;
    let mut total = 0usize;
    let mut dir_ready = false;
    'outer: for chunk in pending.chunks(DOWNLOAD_CONCURRENCY) {
        let outs = futures_util::future::join_all(
            chunk
                .iter()
                .map(|(r, _)| download_resource(client, ctx.page_url, &r.url)),
        )
        .await;
        for ((r, idx), o) in chunk.iter().zip(outs) {
            let Some((bytes, ext)) = o else { continue };
            if total + bytes.len() > total_cap {
                break 'outer; // 超总预算即止，剩余保留远程
            }
            total += bytes.len();
            let fname = format!("{}-{:03}.{}", prefix, idx, ext);
            let path = format!("{}/{}", ctx.assets_dir, fname);
            if !dir_ready {
                if fs::create_dir_all(&ctx.assets_dir).is_err() {
                    break 'outer;
                }
                dir_ready = true;
            }
            if fs::metadata(&path).is_ok() {
                // 并发 / 重复引用竞态兜底：已落盘则不重复写、不计新下载
                replacements.push((r.raw.clone(), format!("{}.assets/{}", ctx.stem, fname)));
                continue;
            }
            if fs::write(&path, &bytes).is_err() {
                continue;
            }
            downloaded += 1;
            replacements.push((r.raw.clone(), format!("{}.assets/{}", ctx.stem, fname)));
        }
    }
    downloaded
}

/// 本地化内核：收集 html 中的远程资源 → 下载到 `<dir>/<stem>.assets/` → 原位改写。
///
/// - base: 页面 URL（相对资源 join + Referer）；None 表示只收绝对 http(s)
/// - 图片与附件分别限额 / 命名（img-NNN / att-NNN）。
async fn localize_html_core(
    client: &reqwest::Client,
    html: &str,
    dir: &str,
    stem: &str,
    base: Option<&str>,
) -> LocalizeOutcome {
    let refs = collect_resource_refs(html, base);
    let collected = refs.len();
    if refs.is_empty() {
        return LocalizeOutcome {
            html: html.to_string(),
            images: 0,
            attachments: 0,
            collected: 0,
        };
    }
    let img_refs: Vec<&ResourceRef> = refs
        .iter()
        .filter(|r| r.kind == RefKind::Image)
        .take(MAX_IMAGES)
        .collect();
    let att_refs: Vec<&ResourceRef> = refs
        .iter()
        .filter(|r| r.kind == RefKind::Attachment)
        .take(MAX_ATTACHMENTS)
        .collect();
    let ctx = LocalizeCtx {
        stem,
        assets_dir: format!("{}/{}.assets", dir, stem),
        page_url: base,
    };
    let mut replacements: Vec<(String, String)> = Vec::new();
    let images = localize_group(
        client,
        &ctx,
        &img_refs,
        "img",
        MAX_TOTAL_BYTES,
        &mut replacements,
    )
    .await;
    let attachments = localize_group(
        client,
        &ctx,
        &att_refs,
        "att",
        MAX_ATTACHMENT_TOTAL,
        &mut replacements,
    )
    .await;
    LocalizeOutcome {
        html: apply_replacements(html, &replacements),
        images,
        attachments,
        collected,
    }
}

/// 把 (raw, 相对路径) 替换应用到 HTML：按 raw 长度降序，防短串是长串子串错替。
fn apply_replacements(html: &str, replacements: &[(String, String)]) -> String {
    let mut sorted: Vec<&(String, String)> = replacements.iter().collect();
    sorted.sort_by_key(|(raw, _)| std::cmp::Reverse(raw.len()));
    let mut out = html.to_string();
    for (raw, rel) in sorted {
        out = out.replace(raw.as_str(), rel.as_str());
    }
    out
}

/// 图片 / 附件本地化（URL 导入链路）：下载正文资源到 `<dir>/<stem>.assets/` 并把
/// HTML 引用改写为相对路径。返回 (改写后的 HTML, 本地化图片张数)。
pub(crate) async fn localize_images(
    client: &reqwest::Client,
    page_url: &str,
    html: &str,
    stem: &str,
    dir: &str,
) -> (String, usize) {
    let outcome = localize_html_core(client, html, dir, stem, Some(page_url)).await;
    (outcome.html, outcome.images)
}

// ================================================================ scheme 判定

/// 判定是否带协议 scheme（`http:` / `data:` / `asset:` / `mailto:` 等），不含 `C:\` 之类。
/// 本地绝对路径（`/Users/...`）不含 scheme；供 `normalize_resource_url` 分流协议引用。
fn has_scheme(v: &str) -> bool {
    match v.find(':') {
        Some(i) if i > 0 && i < 32 => v[..i]
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'-' || b == b'.'),
        _ => false,
    }
}

// ================================================================ 本地文档命令

/// `localize_md_html` 结果：改写后的 HTML + 新下载数 + 跳过数。
/// skipped = 收集到的引用中未产生新下载的数量（已存在 / 失败 / 超限额）。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizeHtmlResult {
    html: String,
    downloaded: usize,
    skipped: usize,
}

/// `localize_html_file` 结果。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizeFileResult {
    /// 本地化后的 HTML 全文：前端以 `srcdoc` 注入 iframe，使 iframe 与 App 同源
    /// （继承 `tauri://localhost`），从而（1）编码后的 `asset://` 子资源能正常加载
    /// （跨域 asset:// iframe 的子资源请求会被 403，这是早期图片空白的根因）；
    /// （2）父窗口可直接读 iframe DOM 做 Ctrl+F 查找高亮。
    html: String,
    /// 落盘临时文件路径（非隐藏，位于文档同目录）：保留以备外部直接打开，前端改用 srcdoc 后不再依赖。
    temp_path: Option<String>,
    downloaded: usize,
    skipped: usize,
}

/// 本地化命令共用的 HTTP 客户端（浏览器 UA + 30s 总超时；单请求 8s 在
/// download_resource 内设置）。
pub(crate) fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {}", e))
}

/// doc_path → (所在目录, 文件名主干)：剥掉扩展名（.md / .html / 其他）。
fn split_doc_path(doc_path: &str) -> Result<(String, String), String> {
    let p = Path::new(doc_path);
    let file = p
        .file_name()
        .ok_or_else(|| format!("无效的文档路径: {}", doc_path))?
        .to_string_lossy()
        .to_string();
    let raw_stem = match file.rsplit_once('.') {
        Some((s, _)) if !s.is_empty() => s.to_string(),
        _ => file,
    };
    // ASCII 安全 slug：下载目录名 `<stem>.assets/` 与 HTML 内引用 `<stem>.assets/…`
    // 必须完全一致（同一 stem）；此处统一 slug 化，import 链路 `pick_stem` 亦同源。
    let stem = sanitize_stem(&raw_stem);
    let dir = p
        .parent()
        .filter(|d| !d.as_os_str().is_empty())
        .map(|d| d.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string());
    Ok((dir, stem))
}

/// 把本地文档 HTML 里的远程资源拉取到 `<doc_path 目录>/<stem>.assets/` 并原位改写
/// 为相对路径。幂等：目标文件已存在则跳过下载直接改写。
#[tauri::command]
pub async fn localize_md_html(
    html: String,
    doc_path: String,
) -> Result<LocalizeHtmlResult, String> {
    let (dir, stem) = split_doc_path(&doc_path)?;
    let client = build_client()?;
    let outcome = localize_html_core(&client, &html, &dir, &stem, None).await;
    let downloaded = outcome.images + outcome.attachments;
    Ok(LocalizeHtmlResult {
        html: outcome.html,
        downloaded,
        skipped: outcome.collected.saturating_sub(downloaded),
    })
}

/// 在 HTML 里注入一段「保存桥接」脚本：预览 iframe 经 `asset://localhost` 加载，
/// 与父窗口（`tauri://localhost` / dev 的 http）跨域，无法由父窗口直接注入 Ctrl/Cmd+S
/// 监听，故在文档内预埋脚本，捕获快捷键后通过 `postMessage` 通知父窗口保存。仅插入一次；
/// 优先放在 `</head>` 之前，无 `</head>` 结构则放文档最前（脚本仍生效）。
///
/// 本地资源引用（相对路径 / 绝对本地路径 / `file://`）由 `embed_resources_as_data_uri`
/// 统一内联为 `data:` URI（读盘后以 base64 直嵌 HTML，彻底绕开 `asset://` 与 `file://`
/// 的限制），效果与 Chrome 打开本地文件一致。仅远程 http(s) 资源由 `localize_html_core`
/// 下载到本地并改相对路径、再随之内联。
fn inject_save_bridge(html: &str) -> String {
    // 同源 srcdoc iframe 内预埋：Ctrl/Cmd+S 转发父窗口保存；Ctrl/Cmd+F 转发父窗口打开查找栏。
    // iframe 聚焦时按键被其吃掉，父 window 收不到，故在文档内捕获后 postMessage 给父窗口。
    const BRIDGE: &str = "<script>(function(){addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&(e.key==='s'||e.key==='S'||e.code==='KeyS')){e.preventDefault();try{parent.postMessage({__mdview:'save'},'*')}catch(_){}}if((e.ctrlKey||e.metaKey)&&(e.key==='f'||e.key==='F'||e.code==='KeyF')){e.preventDefault();try{parent.postMessage({__mdview:'find'},'*')}catch(_){}}}})})();</script>";
    if html.contains("__mdview") {
        return html.to_string();
    }
    // 优先插在 </head> 之前；无 head 结构则放文档最前（脚本仍生效）
    if let Some(pos) = find_ci(html, "</head>") {
        let mut out = String::with_capacity(html.len() + BRIDGE.len());
        out.push_str(&html[..pos]);
        out.push_str(BRIDGE);
        out.push_str(&html[pos..]);
        out
    } else {
        format!("{}{}", BRIDGE, html)
    }
}

/// 大小写不敏感查找 ASCII 子串，返回其起始字节下标（needle 限 ASCII）。
fn find_ci(haystack: &str, needle: &str) -> Option<usize> {
    let h = haystack.as_bytes();
    let n = needle.as_bytes();
    if n.is_empty() || n.len() > h.len() {
        return None;
    }
    let mut i = 0;
    while i + n.len() <= h.len() {
        let mut ok = true;
        for k in 0..n.len() {
            let a = h[i + k];
            let b = n[k];
            let a_lo = if a.is_ascii_uppercase() { a + 32 } else { a };
            let b_lo = if b.is_ascii_uppercase() { b + 32 } else { b };
            if a_lo != b_lo {
                ok = false;
                break;
            }
        }
        if ok {
            return Some(i);
        }
        i += 1;
    }
    None
}

// ===================== 本地引用 → data: URI 内联 =====================
//
// 目标：HTML 预览不再依赖 Tauri 的 `asset://` 协议（跨域 iframe 子资源会被 403，且用户明确
// 拒绝该方案），也绕开 WebView 不支持 `file://` 的硬限制。做法：把本地图片 / 音视频 / PDF 等
// 资源读取为字节、以 `data:<mime>;base64,<...>` 直接内联进 HTML，再经前端 `srcdoc` 同源渲染——
// 效果与 Chrome 打开本地 HTML 完全一致（图片照常显示），且 iframe 与 App 同源，父窗口可直接读
// DOM 做 Ctrl+F 查找高亮。

/// 可被内联的资源扩展名 → MIME（仅这些会读盘内联；其余本地引用原样保留）。
pub(crate) fn mime_for_ext(ext: &str) -> Option<&'static str> {
    let m = match ext.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "ogg" | "ogv" => "video/ogg",
        "mov" => "video/quicktime",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "oga" => "audio/ogg",
        "pdf" => "application/pdf",
        "css" => "text/css",
        _ => return None,
    };
    Some(m)
}

/// 内联体积上限：超过则不内联（避免超大视频/PDF 把整页撑爆），原样保留引用。
const EMBED_MAX_BYTES: u64 = 12 * 1024 * 1024;

/// 把 HTML 内【本地】资源引用（相对路径 / 绝对本地路径 / `file://`）就地内联为 `data:` URI。
/// 远程 http(s) 已由 `localize_html_core` 下载到 `<stem>.assets/` 并改相对路径，故此处一并内联。
/// 仅 src/href/data/poster 属性；data:/blob:/http(s):/asset:/锚点/协议链接 跳过。
/// 返回 (改写后 HTML, 内联成功数)。
///
/// ⚠️ UTF-8 安全：HTML 含中文等多字节字符，必须以「字符索引」扫描并据此切分原 `&str`，
/// 绝不能按字节游标直接 `&html[byte..]`（会落在多字节字符中间 → panic）。
fn embed_resources_as_data_uri(html: &str, dir: &str) -> (String, usize) {
    const ATTRS: &[&str] = &["src", "href", "data", "poster"];
    let dir = dir.trim_end_matches(['/', '\\']);
    // 字符索引 → 字节偏移表，保证后续所有切片都落在字符边界
    let chars: Vec<char> = html.chars().collect();
    let mut byte_starts: Vec<usize> = Vec::with_capacity(chars.len() + 1);
    let mut byte = 0usize;
    for c in &chars {
        byte_starts.push(byte);
        byte += c.len_utf8();
    }
    byte_starts.push(byte); // = html.len()，作为末位越界哨兵
    // 前缀匹配用：取从 ci 起到串尾的切片（starts_with 只查前缀，无界安全）
    let slice_from = |ci: usize| -> &str { &html[byte_starts[ci]..] };
    // 范围切片用：取 [from, to) 字符区间对应的 &str（务必带结束界，否则会重复吐出整段尾部）
    let slice_range = |from: usize, to: usize| -> &str {
        &html[byte_starts[from]..byte_starts[to]]
    };

    let mut out = String::with_capacity(html.len());
    let mut last = 0usize; // 字符索引
    let mut i = 0usize;
    let mut embedded = 0usize;
    while i < chars.len() {
        let mut hit_attr: Option<&str> = None;
        for a in ATTRS {
            if slice_from(i).starts_with(*a) {
                hit_attr = Some(a);
                break;
            }
        }
        if let Some(attr) = hit_attr {
            let a_chars = attr.chars().count();
            let mut j = i + a_chars;
            // 跳过属性名后的空白
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
            }
            // 必须有 '='
            if j < chars.len() && chars[j] == '=' {
                j += 1;
                while j < chars.len() && chars[j].is_whitespace() {
                    j += 1;
                }
                if j < chars.len() && (chars[j] == '"' || chars[j] == '\'') {
                    let q = chars[j];
                    let val_start = j + 1;
                    let mut val_end = val_start;
                    while val_end < chars.len() && chars[val_end] != q {
                        val_end += 1;
                    }
                    // 属性值按字符索引精确切分（重建为 String，内容无损耗）
                    let val: String = chars[val_start..val_end].iter().collect();
                    if let Some(data_uri) = resolve_and_embed(&val, dir) {
                        out.push_str(slice_range(last, i));
                        out.push_str(attr);
                        out.push('=');
                        out.push(q);
                        out.push_str(&data_uri);
                        out.push(q);
                        last = val_end + 1;
                        i = val_end + 1;
                        embedded += 1;
                        continue;
                    }
                }
            }
            i += 1;
            continue;
        }
        i += 1;
    }
    out.push_str(slice_range(last, chars.len()));
    (out, embedded)
}

/// 单个属性值：若是可内联的本地文件 → 读盘返回 `data:` URI；否则返回 None（原样保留）。
fn resolve_and_embed(val: &str, dir: &str) -> Option<String> {
    let v = val.trim();
    if v.is_empty() {
        return None;
    }
    // 跳过：协议引用 / 协议相对(//) / 锚点 / 已是 data: 或 blob:
    if has_scheme(v)
        || v.starts_with("//")
        || v.starts_with('#')
        || v.starts_with("data:")
        || v.starts_with("blob:")
    {
        return None;
    }
    // file:// → 剥离协议；其余按本地路径处理（相对 join dir / 绝对原样）
    let p = v
        .strip_prefix("file://")
        .map(|r| r.strip_prefix("localhost").unwrap_or(r))
        .unwrap_or(v);
    let abs = if p.starts_with('/') || is_windows_abs(p) {
        p.to_string()
    } else {
        format!("{}/{}", dir, p)
    };
    let abs = normalize_path(&abs);
    let ext = std::path::Path::new(&abs)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let mime = mime_for_ext(ext)?;
    let meta = fs::metadata(&abs).ok()?;
    if !meta.is_file() || meta.len() == 0 || meta.len() > EMBED_MAX_BYTES {
        return None;
    }
    let bytes = fs::read(&abs).ok()?;
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    Some(format!("data:{};base64,{}", mime, b64))
}

/// Windows 绝对路径判定（`C:\` / `C:/` 等）。
fn is_windows_abs(p: &str) -> bool {
    p.len() >= 3
        && p.as_bytes()[1] == b':'
        && (p.as_bytes()[2] == b'/' || p.as_bytes()[2] == b'\\')
}

/// 规范化路径：剥离 `.`、回退 `..`、合并重复 `/`，保留首部 `/`（绝对路径）。
fn normalize_path(p: &str) -> String {
    let mut stack: Vec<&str> = Vec::new();
    for seg in p.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                stack.pop();
            }
            s => stack.push(s),
        }
    }
    let joined = stack.join("/");
    if p.starts_with('/') {
        format!("/{}", joined)
    } else {
        joined
    }
}

// （原 absolutize_local_refs / absolutize_one 已移除：HTML 预览改用 `data:` 内联，
// 见上方 embed_resources_as_data_uri / resolve_and_embed，彻底绕开 asset:// 与 file:// 限制。）

/// 读本地 HTML 文档 → 下载其中远程资源（http(s) 图片/附件）到
/// `<dir>/<stem>.assets/` 并原位改相对路径 → 把【全部本地引用】内联为 `data:` URI
/// （图片/音视频/PDF 读盘后以 base64 直嵌进 HTML）→ 注入 Ctrl/Cmd+S 桥接脚本 →
/// 写同目录临时文件 `<stem>.localized.html`，并把完整 HTML 经 `html` 字段返回前端。
///
/// 设计取舍：HTML 预览**不再使用 `asset://localhost`**（跨域 iframe 子资源会被 403，且用户
/// 明确拒绝），也绕开 WebView 不支持 `file://` 的硬限制。内联后的 HTML 由前端以 `srcdoc`
/// 同源渲染，图片显示效果与 Chrome 打开本地文件完全一致，且父窗口可直接读 DOM 做 Ctrl+F 查找。
/// 磁盘原文档保持不动（可移植）。
#[tauri::command]
pub async fn localize_html_file(doc_path: String) -> Result<LocalizeFileResult, String> {
    let bytes = fs::read(&doc_path).map_err(|e| format!("读取文件失败: {}", e))?;
    let html = String::from_utf8_lossy(&bytes).to_string();
    let (dir, stem) = split_doc_path(&doc_path)?;
    let client = build_client()?;
    let outcome = localize_html_core(&client, &html, &dir, &stem, None).await;
    let downloaded = outcome.images + outcome.attachments;
    // 微信视频号 iframe → 播放块（必须在 data: 内联之前：内联的封面已就位，落盘的相对
    // mp4 交给下一步 embed_resources_as_data_uri 读盘内联；且此时 iframe 已消失，
    // collect_resource_refs 也不会把 `<video>` 的相对引用再当成远端附件去下载）
    let with_videos =
        super::video::localize_wechat_videos(&client, &outcome.html, &dir, &stem, None).await;
    // 远程资源已下载到本地（相对引用）；再把【全部本地引用】内联为 data: URI，
    // 经前端 srcdoc 同源渲染即可显示（不依赖 asset://，绕开 WebView 不支持 file:// 的限制）
    let mut localized = embed_resources_as_data_uri(&with_videos, &dir).0;
    // 注入保存桥接（Ctrl/Cmd+S → postMessage 父窗口），同源 srcdoc iframe 也能保存
    localized = inject_save_bridge(&localized);
    let path = Path::new(&dir).join(format!("{}.localized.html", stem));
    let path_str = path.to_string_lossy().to_string();
    fs::write(&path, &localized).map_err(|e| format!("写入本地化文件失败: {}", e))?;
    Ok(LocalizeFileResult {
        html: localized,
        temp_path: Some(path_str),
        downloaded,
        skipped: outcome.collected.saturating_sub(downloaded),
    })
}

/// 文件内容指纹 `size:mtime`（包装 config::file_fingerprint）；不存在返回 None。
#[tauri::command]
pub fn file_fingerprint(path: String) -> Option<String> {
    let fp = crate::config::file_fingerprint(&path);
    if fp.is_empty() {
        None
    } else {
        Some(fp)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::rewrite_lazy_images;

    // ---------------- 收集：全标签 + 相对 join + 跳过规则 ----------------

    #[test]
    fn collect_resource_refs_covers_all_tags_and_relative_join() {
        let html = concat!(
            r#"<img src="https://a.dev/1.png">"#,
            r#"<img src="data:image/png;base64,xx">"#,
            r#"<img>"#,
            r#"<img src="https://a.dev/pic_blank.gif">"#,
            r#"<a href="https://a.dev/doc.pdf">pdf</a>"#,
            r#"<a href="report.zip">zip</a>"#,
            r#"<a href="page.html">not attach</a>"#,
            r##"<a href="#top">锚</a>"##,
            r#"<a href="javascript:go()">js</a>"#,
            r#"<a href="mailto:x@y.dev">mail</a>"#,
            r#"<video src="https://a.dev/v.mp4"></video>"#,
            r#"<audio src="https://a.dev/a.mp3"></audio>"#,
            r#"<source src="https://a.dev/s.webm">"#,
            r#"<embed src="https://a.dev/e.mkv">"#,
            r#"<object data="https://a.dev/o.pdf"></object>"#,
        );
        // base=None：只收绝对 http(s)；非白名单扩展名 / 锚点 / 协议链接全跳过
        let refs = collect_resource_refs(html, None);
        let urls: Vec<&str> = refs.iter().map(|r| r.url.as_str()).collect();
        assert_eq!(
            urls,
            vec![
                "https://a.dev/1.png",
                "https://a.dev/doc.pdf",
                "https://a.dev/v.mp4",
                "https://a.dev/a.mp3",
                "https://a.dev/s.webm",
                "https://a.dev/e.mkv",
                "https://a.dev/o.pdf",
            ]
        );
        assert_eq!(refs[0].kind, RefKind::Image);
        assert_eq!(refs[1].kind, RefKind::Attachment);
        // base 已知：相对 URL join 到页面同目录
        let refs2 = collect_resource_refs(html, Some("https://a.dev/dir/page.html"));
        assert!(
            refs2.iter().any(|r| r.url == "https://a.dev/dir/report.zip"),
            "{:?}",
            refs2.iter().map(|r| &r.url).collect::<Vec<_>>()
        );
        // 上跳 / 根相对 / 点段
        let html2 = r#"<a href="../up/x.pdf">a</a><a href="/root/y.mp4">b</a><img src="./z.png">"#;
        let refs3 = collect_resource_refs(html2, Some("https://a.dev/dir/sub/page.html"));
        let urls3: Vec<&str> = refs3.iter().map(|r| r.url.as_str()).collect();
        assert_eq!(
            urls3,
            vec![
                "https://a.dev/dir/up/x.pdf",
                "https://a.dev/root/y.mp4",
                "https://a.dev/dir/sub/z.png",
            ]
        );
        // 去重：同 URL 两次只收一次
        let refs4 =
            collect_resource_refs(r#"<img src="https://a.dev/1.png"><img src="https://a.dev/1.png">"#, None);
        assert_eq!(refs4.len(), 1);
    }

    #[test]
    fn join_url_resolves_relative_segments() {
        assert_eq!(
            join_url("https://x.dev/a/b/page.html", "img/1.png").unwrap(),
            "https://x.dev/a/b/img/1.png"
        );
        assert_eq!(
            join_url("https://x.dev/a/b/page.html", "../1.png").unwrap(),
            "https://x.dev/a/1.png"
        );
        assert_eq!(
            join_url("https://x.dev/a/b/page.html", "/root/1.png").unwrap(),
            "https://x.dev/root/1.png"
        );
        // 点段解析：`..` 抵消前一段（y 被抵消，x 保留）
        assert_eq!(
            join_url("https://x.dev/a/b/page.html", "./x/./y/../z.png").unwrap(),
            "https://x.dev/a/b/x/z.png"
        );
        // query 保留、fragment 剥除
        assert_eq!(
            join_url("https://x.dev/a/b/page.html", "1.png?x=1#f").unwrap(),
            "https://x.dev/a/b/1.png?x=1"
        );
        // base 无路径 → 无法解析
        assert!(join_url("https://x.dev", "x.png").is_none());
        // 绝对地址原样（防御分支）
        assert_eq!(
            join_url("https://x.dev/a/", "https://y.dev/b.png").unwrap(),
            "https://y.dev/b.png"
        );
    }

    #[test]
    fn collect_resource_refs_dedups_and_skips_placeholders() {
        let html = r#"<img src="https://a.dev/1.png"><img src="https://a.dev/1.png"><img src="https://a.dev/pic_blank.gif"><img src="data:image/png;base64,xx"><img><img src="//b.dev/2.png">"#;
        let refs = collect_resource_refs(html, None);
        assert_eq!(refs.len(), 2);
        assert_eq!(refs[0].url, "https://a.dev/1.png");
        assert_eq!(refs[1].url, "https://b.dev/2.png");
    }

    #[test]
    fn attr_value_and_lazy_promotion_preserve_url_case() {
        // 回归（QA 实测）：mmbiz CDN 大小写敏感，属性值曾被整体降小写 → 404 + 改写失配
        let tag = r#"<img data-src="https://mmbiz.qpic.cn/sz_mmbiz_jpg/dHwlicgnJnmRy33uk2P3co0MDL3RlBFLli/640?wx_fmt=other&amp;from=appmsg" src="">"#;
        assert_eq!(
            attr_value(tag, "data-src").unwrap(),
            "https://mmbiz.qpic.cn/sz_mmbiz_jpg/dHwlicgnJnmRy33uk2P3co0MDL3RlBFLli/640?wx_fmt=other&amp;from=appmsg"
        );
        // 空 src 不得被 data-src 里的 "src" 误命中
        assert_eq!(attr_value(tag, "src").unwrap(), "");
        let out = rewrite_lazy_images(tag);
        assert!(out.contains("dHwlicgnJnmRy33uk2P3co0MDL3RlBFLli"), "{}", out);
        assert!(!out.contains("dhwlicgnjnmry"), "{}", out);
        // raw / url 同源保持大小写（raw 是原位改写目标）
        let refs = collect_resource_refs(&out, None);
        assert_eq!(refs.len(), 1);
        assert_eq!(
            refs[0].url,
            "https://mmbiz.qpic.cn/sz_mmbiz_jpg/dHwlicgnJnmRy33uk2P3co0MDL3RlBFLli/640?wx_fmt=other&from=appmsg"
        );
        assert_eq!(
            refs[0].raw,
            "https://mmbiz.qpic.cn/sz_mmbiz_jpg/dHwlicgnJnmRy33uk2P3co0MDL3RlBFLli/640?wx_fmt=other&amp;from=appmsg"
        );
    }

    // ---------------- 图片 URL 与魔数 ----------------

    #[test]
    fn normalize_resource_url_rules() {
        // base=None（图片 / 本地文档链路）：// 补 https:，http:// 升 https，
        // 相对路径 / data / javascript / mailto / 其他协议一律跳过
        assert_eq!(
            normalize_resource_url("//mmbiz.qpic.cn/a.png", None).unwrap(),
            "https://mmbiz.qpic.cn/a.png"
        );
        assert_eq!(
            normalize_resource_url("http://mmbiz.qpic.cn/a.png", None).unwrap(),
            "https://mmbiz.qpic.cn/a.png"
        );
        assert_eq!(
            normalize_resource_url("https://x/a.png", None).unwrap(),
            "https://x/a.png"
        );
        assert!(normalize_resource_url("/relative/a.png", None).is_none());
        assert!(normalize_resource_url("data:image/png;base64,xx", None).is_none());
        assert!(normalize_resource_url("javascript:go()", None).is_none());
        assert!(normalize_resource_url("mailto:a@b.dev", None).is_none());
        assert!(normalize_resource_url("ftp://x.dev/y.zip", None).is_none());
        // 带 base：相对 URL join，fragment 剥除，query 保留
        assert_eq!(
            normalize_resource_url("a.png", Some("https://x.dev/d/p.html")).unwrap(),
            "https://x.dev/d/a.png"
        );
        assert_eq!(
            normalize_resource_url("a.png?x=1#frag", Some("https://x.dev/d/p.html")).unwrap(),
            "https://x.dev/d/a.png?x=1"
        );
        // base 为 http:// 时 join 结果升 https
        assert_eq!(
            normalize_resource_url("a.png", Some("http://x.dev/d/p.html")).unwrap(),
            "https://x.dev/d/a.png"
        );
    }

    #[test]
    fn detect_ext_prefers_url_then_content_type_then_magic() {
        assert_eq!(detect_ext("https://x.dev/a/b.png?x=1", None, &[]), "png");
        assert_eq!(
            detect_ext("https://x.dev/640", Some("image/webp"), &[]),
            "webp"
        );
        let png = [0x89u8, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        assert_eq!(detect_ext("https://x.dev/mmbiz/640", None, &png), "png");
        assert_eq!(
            detect_ext("https://x.dev/x", None, &[0xFF, 0xD8, 0xFF, 0xE0]),
            "jpg"
        );
        let webp = [
            0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50,
        ];
        assert_eq!(detect_ext("https://x.dev/x", None, &webp), "webp");
        // 兜底 bin
        assert_eq!(detect_ext("https://x.dev/x", None, &[1, 2, 3]), "bin");
    }

    #[test]
    fn detect_ext_covers_attachment_content_types_and_magic() {
        // content-type 映射（附件）
        assert_eq!(detect_ext("https://x.dev/f", Some("application/pdf"), &[]), "pdf");
        assert_eq!(detect_ext("https://x.dev/f", Some("video/mp4"), &[]), "mp4");
        assert_eq!(detect_ext("https://x.dev/f", Some("video/quicktime"), &[]), "mov");
        assert_eq!(detect_ext("https://x.dev/f", Some("video/x-matroska"), &[]), "mkv");
        assert_eq!(detect_ext("https://x.dev/f", Some("audio/mpeg"), &[]), "mp3");
        assert_eq!(detect_ext("https://x.dev/f", Some("audio/wav"), &[]), "wav");
        assert_eq!(detect_ext("https://x.dev/f", Some("audio/flac"), &[]), "flac");
        assert_eq!(detect_ext("https://x.dev/f", Some("application/x-zip-compressed"), &[]), "zip");
        assert_eq!(detect_ext("https://x.dev/f", Some("application/json"), &[]), "json");
        assert_eq!(detect_ext("https://x.dev/f", Some("text/plain; charset=utf-8"), &[]), "txt");
        assert_eq!(detect_ext("https://x.dev/f", Some("text/html"), &[]), "html");
        assert_eq!(detect_ext("https://x.dev/f", Some("application/msword"), &[]), "doc");
        assert_eq!(detect_ext("https://x.dev/f", Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), &[]), "xlsx");
        // 未知 content-type → 继续走魔数
        assert_eq!(detect_ext("https://x.dev/f", Some("application/octet-stream"), &[]), "bin");
        // 魔数（附件）
        assert_eq!(detect_ext("https://x.dev/f", None, b"%PDF-1.4"), "pdf");
        assert_eq!(detect_ext("https://x.dev/f", None, &[0x50, 0x4B, 0x03, 0x04, 1, 2]), "zip");
        assert_eq!(detect_ext("https://x.dev/f", None, b"ID3\x03\x00"), "mp3");
        assert_eq!(detect_ext("https://x.dev/f", None, &[0xFF, 0xFB, 0x90, 0x00]), "mp3");
        let mp4 = [0, 0, 0, 0x18, b'f', b't', b'y', b'p', 1, 2, 3, 4];
        assert_eq!(detect_ext("https://x.dev/f", None, &mp4), "mp4");
        // 兜底 bin
        assert_eq!(detect_ext("https://x.dev/f", None, &[1, 2, 3]), "bin");
    }

    // ---------------- 本地化改写（纯函数段；真实网络下载测不了，略） ----------------

    #[test]
    fn localize_rewrite_pipeline_pure_part() {
        // localize_md_html 纯函数段：收集 → 按组命名 → 原位改写（下载略）
        let html = r#"<p><img src="https://a.dev/1.png"><a href="https://a.dev/doc.pdf">pdf</a></p>"#;
        let refs = collect_resource_refs(html, None);
        assert_eq!(refs.len(), 2);
        let mut img_idx = 0usize;
        let mut att_idx = 0usize;
        let plan: Vec<(String, String)> = refs
            .iter()
            .map(|r| {
                let (prefix, ext, idx) = match r.kind {
                    RefKind::Image => {
                        img_idx += 1;
                        ("img", "png", img_idx)
                    }
                    RefKind::Attachment => {
                        att_idx += 1;
                        ("att", "pdf", att_idx)
                    }
                };
                (r.raw.clone(), format!("readme.assets/{}-{:03}.{}", prefix, idx, ext))
            })
            .collect();
        let out = apply_replacements(html, &plan);
        assert!(out.contains("readme.assets/img-001.png"), "{out}");
        assert!(out.contains("readme.assets/att-001.pdf"), "{out}");
        assert!(!out.contains("https://a.dev"), "{out}");
    }

    #[test]
    fn apply_replacements_sorts_by_raw_len_desc() {
        // 短串是长串子串时必须先替长串，防错替
        let html = r#"<img src="https://a.dev/x.png"><img src="https://a.dev/x.png?big=1">"#;
        let plan = vec![
            ("https://a.dev/x.png".to_string(), "a.assets/img-001.png".to_string()),
            (
                "https://a.dev/x.png?big=1".to_string(),
                "a.assets/img-002.png".to_string(),
            ),
        ];
        let out = apply_replacements(html, &plan);
        assert!(out.contains("a.assets/img-001.png"), "{out}");
        assert!(out.contains("a.assets/img-002.png"), "{out}");
    }

    // ---------------- scheme 判定（has_scheme，供 normalize_resource_url 分流） ----------------

    #[test]
    fn has_scheme_detects_protocol_but_not_local_paths() {
        // has_scheme 用于 normalize_resource_url 分流协议引用：远程 / data / asset 含
        // scheme；本地绝对路径（/Users/...）不含 scheme。
        assert!(!has_scheme("/Users/me/x.jpg"));
        assert!(has_scheme("https://a.b/c"));
        assert!(has_scheme("data:image/png;base64,AAA"));
        assert!(has_scheme("asset://localhost/x"));
    }

    // ---------------- sanitize_stem（ASCII 安全 slug；落盘目录名与 HTML 引用一致） ----------------

    #[test]
    fn sanitize_stem_slug_rules() {
        // 空格 / 连字符转下划线；中文保留；特殊符号（. ! # 等）去除；折叠连续下划线 + trim
        assert_eq!(sanitize_stem("标题 与 副标题"), "标题_与_副标题");
        assert_eq!(sanitize_stem("My-File Name"), "My_File_Name");
        assert_eq!(sanitize_stem("a!!b##c"), "abc");
        assert_eq!(sanitize_stem("  __trim__  "), "trim");
        assert_eq!(sanitize_stem("中文.标点！"), "中文标点");
        // 结果为空 → 回退 "doc"
        assert_eq!(sanitize_stem(""), "doc");
        assert_eq!(sanitize_stem("...!!!..."), "doc");
        // 幂等：已 slug 化再跑一遍不变
        assert_eq!(sanitize_stem("标题_与_副标题"), "标题_与_副标题");
        // 与 import 链路 pick_stem / 本地化落盘 stem 同源：目录名与引用一致由调用方保证
        let s = sanitize_stem("我的 笔记 #1");
        assert_eq!(s, "我的_笔记_1");
    }

    // ---------------- 文件指纹命令 ----------------

    #[test]
    fn file_fingerprint_command_wraps_config() {
        let dir = std::env::temp_dir().join(format!("mdview-fp-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("a.txt");
        fs::write(&file, "hello").unwrap();
        let fp = file_fingerprint(file.to_str().unwrap().to_string()).expect("存在文件应有指纹");
        assert!(fp.starts_with("5:"), "size:mtime 前缀: {fp}");
        // 内容变化（size 变）→ 指纹变化
        fs::write(&file, "hello world").unwrap();
        let fp2 = file_fingerprint(file.to_str().unwrap().to_string()).unwrap();
        assert_ne!(fp, fp2);
        // 不存在 → None
        assert!(file_fingerprint(dir.join("nope.txt").to_str().unwrap().to_string()).is_none());
        let _ = fs::remove_dir_all(&dir);
    }
}

// ================================================================ 边界单测（Tess 追加）
// 仅新增独立 #[cfg(test)] 模块；不修改任何实现代码，也不改动既有 `mod tests` 断言。
// 覆盖目标（brief-tester.md success_criteria）：相对 URL join 边界（spec 基 URL）、
// detect_ext content-type/魔数/兜底、collect 跳过规则与去重保序、命名生成 img-NNN/att-NNN。

#[cfg(test)]
mod tests_boundary {
    use super::*;

    const SPEC_BASE: &str = "http://example.com/a/b/c.html";

    // ---------------- 相对 URL join（手写段解析；spec 基 URL） ----------------

    #[test]
    fn join_url_relative_segments_with_spec_base() {
        // 直接走 join_url（返回仍为 http，升级 https 由 normalize_resource_url 负责）
        assert_eq!(join_url(SPEC_BASE, "./x").unwrap(), "http://example.com/a/b/x");
        assert_eq!(
            join_url(SPEC_BASE, "./a/./b").unwrap(),
            "http://example.com/a/b/a/b"
        );
        assert_eq!(join_url(SPEC_BASE, "../x").unwrap(), "http://example.com/a/x");
        assert_eq!(join_url(SPEC_BASE, "../../x").unwrap(), "http://example.com/x");
        assert_eq!(
            join_url(SPEC_BASE, "/abs/path").unwrap(),
            "http://example.com/abs/path"
        );
        // 查询保留、锚点剥除
        assert_eq!(
            join_url(SPEC_BASE, "./x?q=1").unwrap(),
            "http://example.com/a/b/x?q=1"
        );
        assert_eq!(
            join_url(SPEC_BASE, "./x#frag").unwrap(),
            "http://example.com/a/b/x"
        );
        assert_eq!(
            join_url(SPEC_BASE, "/abs/path?q=1#f").unwrap(),
            "http://example.com/abs/path?q=1"
        );
    }

    #[test]
    fn normalize_resource_url_spec_base_upgrades_http_and_handles_schemes() {
        // 带 base（http 页面）→ join 后整体升 https；各种相对段
        assert_eq!(
            normalize_resource_url("./x", Some(SPEC_BASE)).unwrap(),
            "https://example.com/a/b/x"
        );
        assert_eq!(
            normalize_resource_url("./a/./b", Some(SPEC_BASE)).unwrap(),
            "https://example.com/a/b/a/b"
        );
        assert_eq!(
            normalize_resource_url("../x", Some(SPEC_BASE)).unwrap(),
            "https://example.com/a/x"
        );
        assert_eq!(
            normalize_resource_url("../../x", Some(SPEC_BASE)).unwrap(),
            "https://example.com/x"
        );
        assert_eq!(
            normalize_resource_url("/abs/path", Some(SPEC_BASE)).unwrap(),
            "https://example.com/abs/path"
        );
        // 域名根相对 //cdn/x → 协议相对：升 https 且落到 cdn 域（非 example.com 子路径）
        assert_eq!(
            normalize_resource_url("//cdn/x", Some(SPEC_BASE)).unwrap(),
            "https://cdn/x"
        );
        // 查询保留 + 锚点剥除（端到端）
        assert_eq!(
            normalize_resource_url("./x?q=1#frag", Some(SPEC_BASE)).unwrap(),
            "https://example.com/a/b/x?q=1"
        );
        // base=None 时不收相对 URL
        assert!(normalize_resource_url("./x", None).is_none());
    }

    // ---------------- detect_ext 边界（attachment content-type / 魔数 / 兜底） ----------------

    #[test]
    fn detect_ext_attachment_content_types_mapped() {
        // office 系列 + 音频/视频 content-type 映射（spec 明确要求）
        assert_eq!(detect_ext("https://x/f", Some("audio/ogg"), &[]), "ogg");
        assert_eq!(detect_ext("https://x/f", Some("video/webm"), &[]), "webm");
        assert_eq!(
            detect_ext(
                "https://x/f",
                Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                &[]
            ),
            "docx"
        );
        assert_eq!(
            detect_ext(
                "https://x/f",
                Some("application/vnd.openxmlformats-officedocument.presentationml.presentation"),
                &[]
            ),
            "pptx"
        );
        assert_eq!(
            detect_ext(
                "https://x/f",
                Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                &[]
            ),
            "xlsx"
        );
        assert_eq!(detect_ext("https://x/f", Some("video/quicktime"), &[]), "mov");
        assert_eq!(detect_ext("https://x/f", Some("video/mp4"), &[]), "mp4");
        assert_eq!(detect_ext("https://x/f", Some("audio/mpeg"), &[]), "mp3");
        assert_eq!(detect_ext("https://x/f", Some("audio/wav"), &[]), "wav");
        assert_eq!(detect_ext("https://x/f", Some("application/zip"), &[]), "zip");
        assert_eq!(detect_ext("https://x/f", Some("application/json"), &[]), "json");
        assert_eq!(detect_ext("https://x/f", Some("text/plain"), &[]), "txt");
    }

    #[test]
    fn detect_ext_fallback_is_bin_not_jpg() {
        // 未知 content-type + 非任何魔数字节 → 兜底 bin（不是 jpg / 不是其它）
        assert_eq!(
            detect_ext("https://x/f", Some("application/octet-stream"), &[0, 1, 2]),
            "bin"
        );
        assert_eq!(detect_ext("https://x/f", None, &[0x00, 0x01, 0x02, 0x03]), "bin");
        // 关键回归：未知类型绝不能回退成 jpg（旧实现 bug）
        assert_ne!(
            detect_ext("https://x/f", Some("application/octet-stream"), &[0, 1, 2]),
            "jpg"
        );
    }

    #[test]
    fn detect_ext_magic_requires_min_length_or_matches() {
        // %PDF / PK / ID3 / ftyp 魔数
        assert_eq!(detect_ext("https://x/f", None, b"%PDF-1.7"), "pdf");
        assert_eq!(
            detect_ext("https://x/f", None, &[0x50, 0x4B, 0x03, 0x04, 0x01]),
            "zip"
        );
        assert_eq!(detect_ext("https://x/f", None, b"ID3\x03\x00\x00\x00"), "mp3");
        // ftyp 魔数需 bytes.len() >= 8 且偏移 4..8 == "ftyp"
        let mp4 = [0u8, 0, 0, 0x18, b'f', b't', b'y', b'p', 1, 2, 3, 4];
        assert_eq!(detect_ext("https://x/f", None, &mp4), "mp4");
        // 仅有 "ftyp" 四字节但不足 8 字节 → 不命中 → bin
        assert_eq!(detect_ext("https://x/f", None, b"ftyp"), "bin");
    }

    // ---------------- collect_resource_refs 跳过规则 + 去重保序 ----------------

    #[test]
    fn collect_resource_refs_skips_all_placeholder_variants() {
        // 三种占位图（pic_blank / pic_loading / pic_placeholder）均须跳过
        let html = concat!(
            r#"<img src="https://a.dev/pic_blank.gif">"#,
            r#"<img src="https://a.dev/x/pic_loading.gif?t=1">"#,
            r#"<img src="https://a.dev/img/pic_placeholder.png">"#,
            r#"<img src="https://a.dev/real.png">"#,
        );
        let refs = collect_resource_refs(html, None);
        let urls: Vec<&str> = refs.iter().map(|r| r.url.as_str()).collect();
        assert_eq!(urls, vec!["https://a.dev/real.png"]);
    }

    #[test]
    fn collect_resource_refs_dedup_preserves_order() {
        // 去重保序：重复项移除、首见顺序保留
        let html = concat!(
            r#"<img src="https://a.dev/1.png">"#,
            r#"<img src="https://a.dev/2.png">"#,
            r#"<img src="https://a.dev/1.png">"#,
            r#"<a href="https://a.dev/1.png">dup</a>"#,
        );
        let refs = collect_resource_refs(html, None);
        let urls: Vec<&str> = refs.iter().map(|r| r.url.as_str()).collect();
        assert_eq!(urls, vec!["https://a.dev/1.png", "https://a.dev/2.png"]);
        assert_eq!(refs[0].kind, RefKind::Image);
        assert_eq!(refs[1].kind, RefKind::Image);
    }

    #[test]
    fn collect_resource_refs_relative_join_across_all_tags() {
        // 各媒体标签的相对 URL 都能 join 到 spec 基 URL 同目录（端到端 collect）
        let html = concat!(
            r#"<img src="img1.png">"#,
            r#"<video src="vid.mp4">"#,
            r#"<audio src="aud.mp3">"#,
            r#"<source src="s.webm">"#,
            r#"<embed src="e.mkv">"#,
            r#"<object data="o.pdf">"#,
            r#"<a href="file.pdf">link</a>"#,
        );
        let refs = collect_resource_refs(html, Some(SPEC_BASE));
        let urls: Vec<&str> = refs.iter().map(|r| r.url.as_str()).collect();
        assert_eq!(
            urls,
            vec![
                "https://example.com/a/b/img1.png",
                "https://example.com/a/b/vid.mp4",
                "https://example.com/a/b/aud.mp3",
                "https://example.com/a/b/s.webm",
                "https://example.com/a/b/e.mkv",
                "https://example.com/a/b/o.pdf",
                "https://example.com/a/b/file.pdf",
            ]
        );
    }

    // ---------------- url_ext 边界（命名依赖：扩展名抽取） ----------------

    #[test]
    fn url_ext_boundaries() {
        assert_eq!(url_ext("https://x/a.PNG?x=1"), Some("png".to_string())); // 大小写 lower
        assert_eq!(url_ext("https://x/a.png?x=1"), Some("png".to_string())); // query 不算
        assert_eq!(url_ext("https://x/a.tar.gz"), Some("gz".to_string())); // 取最后一段
        assert_eq!(url_ext("https://x/a.b"), Some("b".to_string()));
        assert_eq!(url_ext("https://x/a"), None); // 无扩展名
        assert_eq!(url_ext("https://x/a."), None); // 尾部点 → 空 ext
        assert_eq!(url_ext("https://x/a.verylongext"), None); // 超 5 位
        assert_eq!(url_ext("https://x/a.12345"), Some("12345".to_string())); // 恰好 5 位
        assert_eq!(url_ext("https://x/a.123456"), None); // 6 位超限
    }

    // ---------------- 命名生成 img-NNN / att-NNN（零填充 + 分组序号） ----------------

    #[test]
    fn naming_generates_zero_padded_img_and_att_sequences() {
        // 复刻 localize_group 的 idx 规则（idx = 组内序号从 1；格式 {prefix}-{:03}.{ext}），
        // 验证改写后 HTML 出现 img-001..NNN / att-001..NNN 且零填充为 3 位。
        let html = concat!(
            r#"<img src="https://a.dev/i1.png">"#,
            r#"<img src="https://a.dev/i2.png">"#,
            r#"<img src="https://a.dev/i3.png">"#,
            r#"<a href="https://a.dev/f1.pdf">p1</a>"#,
            r#"<a href="https://a.dev/f2.zip">p2</a>"#,
            r#"<video src="https://a.dev/v1.mp4"></video>"#,
        );
        let refs = collect_resource_refs(html, None);
        let mut img_idx = 0usize;
        let mut att_idx = 0usize;
        let plan: Vec<(String, String)> = refs
            .iter()
            .map(|r| match r.kind {
                RefKind::Image => {
                    img_idx += 1;
                    (
                        r.raw.clone(),
                        format!(
                            "doc.assets/img-{:03}.{}",
                            img_idx,
                            url_ext(&r.url).unwrap_or_else(|| "bin".to_string())
                        ),
                    )
                }
                RefKind::Attachment => {
                    att_idx += 1;
                    (
                        r.raw.clone(),
                        format!(
                            "doc.assets/att-{:03}.{}",
                            att_idx,
                            url_ext(&r.url).unwrap_or_else(|| "bin".to_string())
                        ),
                    )
                }
            })
            .collect();
        let out = apply_replacements(html, &plan);
        assert!(out.contains("doc.assets/img-001.png"), "{out}");
        assert!(out.contains("doc.assets/img-002.png"), "{out}");
        assert!(out.contains("doc.assets/img-003.png"), "{out}");
        assert!(out.contains("doc.assets/att-001.pdf"), "{out}");
        assert!(out.contains("doc.assets/att-002.zip"), "{out}");
        assert!(out.contains("doc.assets/att-003.mp4"), "{out}");
        // 零填充：不应出现未补零的 img-1 / att-1
        assert!(!out.contains("doc.assets/img-1."), "{out}");
        assert!(!out.contains("doc.assets/att-1."), "{out}");
        // 所有原始远程 URL 均被替换
        assert!(!out.contains("https://a.dev"), "{out}");
    }

    #[test]
    fn naming_zero_pads_to_three_digits_for_tenth() {
        // 第 10 项应为 img-010（确认 :03 零填充），防止编号错位
        let mut html = String::new();
        for i in 1..=12u32 {
            html.push_str(&format!("<img src=\"https://a.dev/i{}.png\">", i));
        }
        let refs = collect_resource_refs(&html, None);
        let plan: Vec<(String, String)> = refs
            .iter()
            .enumerate()
            .map(|(i, r)| (r.raw.clone(), format!("doc.assets/img-{:03}.png", i + 1)))
            .collect();
        let out = apply_replacements(&html, &plan);
        assert!(out.contains("doc.assets/img-009.png"), "{out}");
        assert!(out.contains("doc.assets/img-010.png"), "{out}");
        assert!(out.contains("doc.assets/img-011.png"), "{out}");
        assert!(out.contains("doc.assets/img-012.png"), "{out}");
    }
}

// ================================================================ sanitize_stem 边界单测（Tess 第二轮追加）
// 独立 #[cfg(test)] 模块；不修改实现、不改动既有测试（含 mod tests 内既有 sanitize_stem_slug_rules）。
// 预期行为（assets.rs:45-82 文档 + 实现）：保留字母数字/中文/已有下划线；空格/连字符/空白转下划线；
// 其余特殊符号（. , : ; / ( ) 及中文标点等）去除；折叠连续下划线、首尾 trim；空/全符号回退 "doc"；幂等。

#[cfg(test)]
mod tests_sanitize {
    use super::*;

    // ---------------- 保留 + 空格/连字符转下划线 ----------------

    #[test]
    fn sanitize_stem_keeps_chinese_and_maps_space_hyphen_to_underscore() {
        // 纯中文保留（不转义、不丢字）
        assert_eq!(sanitize_stem("中文文档"), "中文文档");
        assert_eq!(sanitize_stem("我的笔记"), "我的笔记");
        // 空格转下划线
        assert_eq!(sanitize_stem("My Doc Name"), "My_Doc_Name");
        // 连字符转下划线
        assert_eq!(sanitize_stem("a-b-c"), "a_b_c");
        // 混合：空格与连字符并存
        assert_eq!(sanitize_stem("My-File Name"), "My_File_Name");
    }

    // ---------------- 特殊符号去除 + 连续下划线折叠 ----------------

    #[test]
    fn sanitize_stem_symbols_removed_and_underscore_collapsed() {
        // 圆括号 / 句号去除（无空格则不产生下划线）
        assert_eq!(sanitize_stem("报告(2024).final"), "报告2024final");
        // 斜杠 / 冒号去除
        assert_eq!(sanitize_stem("a/b:c"), "abc");
        // 分号去除
        assert_eq!(sanitize_stem("test;x"), "testx");
        // 句号去除（连续多个）
        assert_eq!(sanitize_stem("a.b.c"), "abc");
        // 多个分隔符叠加 → 连续下划线折叠为单下划线
        assert_eq!(sanitize_stem("a__b--c"), "a_b_c");
        // 前后空白/连字符 → 折叠 + trim
        assert_eq!(sanitize_stem(" -a- "), "a");
    }

    // ---------------- 空 / 全符号回退 doc ----------------

    #[test]
    fn sanitize_stem_all_symbols_or_empty_fallback_doc() {
        assert_eq!(sanitize_stem(""), "doc");
        // 仅斜杠
        assert_eq!(sanitize_stem("///"), "doc");
        // 仅井号
        assert_eq!(sanitize_stem("###"), "doc");
        // 仅空白
        assert_eq!(sanitize_stem("   "), "doc");
        // 仅连字符
        assert_eq!(sanitize_stem("- - -"), "doc");
        // 仅符号（含中文标点）
        assert_eq!(sanitize_stem("...!!!..."), "doc");
    }

    // ---------------- 一致性：同 stem 既用于目录名也用于 HTML 引用 ----------------

    #[test]
    fn sanitize_stem_consistency_between_assets_dir_and_html_ref() {
        // 脏 stem 经 sanitize 后，落盘目录 `<stem>.assets/` 与 HTML 内引用须用同一主干；
        // 且 sanitize_stem 幂等（已 slug 化再跑不变），调用方重复 sanitize 安全。
        let raw = "我的 报告 (Final) #2";
        let s = sanitize_stem(raw);
        assert_eq!(s, "我的_报告_Final_2");
        // 目录名与 HTML 引用共享同一 sanitized stem
        let dir = format!("{}.assets", s);
        let html = format!("<img src=\"{}.assets/img-001.png\">", s);
        assert!(html.contains(&format!("{}/", dir)), "{} | {}", html, dir);
        // 幂等
        assert_eq!(sanitize_stem(&s), s);
        // 与本地化落盘 stem 同源：split_doc_path 也用 sanitize_stem（见 assets.rs:601）
        assert_eq!(sanitize_stem(&sanitize_stem(raw)), s);
    }
}

#[cfg(test)]
mod tests_html_localize {
    use super::*;

    #[test]
    fn inject_save_bridge_inserts_before_head_close() {
        let html = "<html><head><title>x</title></head><body><img src='a.png'></body></html>";
        let out = inject_save_bridge(html);
        assert!(out.contains("__mdview"), "应注入保存桥接脚本");
        assert!(
            out.find("__mdview").unwrap() < out.find("</head>").unwrap(),
            "桥接脚本应插在 </head> 之前"
        );
    }

    #[test]
    fn inject_save_bridge_no_head_prepends() {
        let html = "<body><img src='a.png'></body>";
        let out = inject_save_bridge(html);
        assert!(
            out.starts_with("<script>"),
            "无 </head> 时应把桥接脚本前置到文档最前"
        );
        assert!(out.contains("__mdview"), "应注入保存桥接脚本");
    }

    #[test]
    fn inject_save_bridge_idempotent() {
        let once = inject_save_bridge("<head></head><body></body>");
        let twice = inject_save_bridge(&once);
        // 桥接 IIFE 每次注入只出现一次（save/find 共用同一段脚本，故用脚本特征串计数，
        // 不能用 __mdview——该串在脚本内出现两次：save 与 find 各一处）
        assert_eq!(
            twice.matches("addEventListener('keydown'").count(),
            1,
            "重复注入应保持单次"
        );
    }

    #[test]
    fn collect_resource_refs_skips_local_refs() {
        // 本地相对 / 绝对 / 锚点引用不应被收集（只有绝对 http(s) 才收集 → 下载改写）；
        // 未收集即不会被 localize_html_core 改写，本地引用改由 embed_resources_as_data_uri
        // 统一内联为 data: URI（读盘后以 base64 直嵌 HTML，绕开 asset:// 与 file://）。
        let html = "<img src='doc.assets/a.png'><img src='/abs/x.png'><img src='file:///x/y.png'><a href='#top'>t</a>";
        let refs = collect_resource_refs(html, None);
        assert!(refs.is_empty(), "本地引用不应被收集");
        // 绝对 http(s) 仍被收集（需下载到本地）
        let remote = collect_resource_refs(r#"<img src="https://a.dev/1.png">"#, None);
        assert_eq!(remote.len(), 1, "远程 http(s) 应被收集");
    }

    // ---------------- 本地引用 → data: URI 内联 ----------------

    const EMBED_DIR: &str = "/Users/tatsuma/Documents/本地知识库";

    #[test]
    fn embed_skips_scheme_data_anchor_and_missing() {
        // http(s)/data:/锚点/不存在的本地文件 都不应内联，原样保留
        assert_eq!(
            embed_resources_as_data_uri(r#"<img src="https://a.dev/1.png">"#, EMBED_DIR).0,
            r#"<img src="https://a.dev/1.png">"#
        );
        assert_eq!(
            embed_resources_as_data_uri(r#"<img src="data:image/png;base64,xx">"#, EMBED_DIR).0,
            r#"<img src="data:image/png;base64,xx">"#
        );
        assert_eq!(
            embed_resources_as_data_uri(r##"<a href="#top">x</a>"##, EMBED_DIR).0,
            r##"<a href="#top">x</a>"##
        );
        // 不存在的本地文件 → 原样保留（不内联）
        let (out, n) = embed_resources_as_data_uri(r#"<img src="/no/such/file.png">"#, EMBED_DIR);
        assert_eq!(out, r#"<img src="/no/such/file.png">"#);
        assert_eq!(n, 0);
    }

    #[test]
    fn embed_relative_local_image_to_data_uri() {
        // 相对本地图片 → 读盘内联为 data: URI（真实临时文件走完整读盘校验）
        let tmp = std::env::temp_dir().join(format!("mdview_embed_{}", std::process::id()));
        let _ = fs::create_dir_all(&tmp);
        let img = tmp.join("img-001.png");
        fs::write(&img, [0x89u8, 0x50, 0x4E, 0x47]).unwrap(); // PNG 头
        let dir = tmp.to_string_lossy().to_string();
        let (out, n) = embed_resources_as_data_uri(r#"<img src="img-001.png">"#, &dir);
        assert!(out.contains("data:image/png;base64,"), "应内联为 data: URI：{}", out);
        assert_eq!(n, 1);
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn embed_non_whitelist_ext_kept() {
        // 非白名单扩展名（如 .md 链接）不内联，原样保留
        let (out, n) = embed_resources_as_data_uri(
            r#"<a href="doc.assets/notes.md">x</a><img src="missing.png">"#,
            EMBED_DIR,
        );
        assert!(out.contains(r#"href="doc.assets/notes.md""#), "非白名单应保留：{}", out);
        assert_eq!(n, 0);
    }

    // ---------------- embed 的 UTF-8 安全（中文等多字节路径/正文） ----------------

    #[test]
    fn embed_handles_multibyte_html_without_panic() {
        // 回归（真实故障）：HTML 含中文等「多字节字符」时，旧的字节游标切片会落在
        // 多字节字符中间 → panic，进而 localize_html_file 失败、前端回退 asset:// → 图片 403。
        // 用自包含临时 PNG + 含中文正文/路径的 HTML 验证：不 panic、相对图片内联为 data: URI。
        let tmp = std::env::temp_dir().join(format!("mdview_embed_mb_{}", std::process::id()));
        let _ = fs::create_dir_all(&tmp);
        let img = tmp.join("图-01.png");
        fs::write(&img, [0x89u8, 0x50, 0x4E, 0x47]).unwrap();
        let dir = tmp.to_string_lossy().to_string();
        // 正文含中文，且相对引用名也含中文（双重多字节路径）
        let html = concat!(
            "<html><body>",
            "<h1>中文标题与说明文字</h1>",
            r#"<img src="图-01.png">"#,
            "</body></html>",
        );
        let (out, n) = embed_resources_as_data_uri(html, &dir);
        assert!(
            out.contains("data:image/png;base64,"),
            "中文 HTML 下也应内联本地图片：{}",
            out
        );
        assert_eq!(n, 1);
        let _ = fs::remove_dir_all(&tmp);
    }
}
