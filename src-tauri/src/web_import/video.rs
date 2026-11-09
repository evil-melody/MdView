//! 微信视频号（`<iframe class="video_iframe">`）本地化。
//!
//! 微信文章的视频框只有 `data-src`、没有 `src`（播放地址由页面 JS 惰性注入），
//! 所以静态 HTML 里的视频框必然空白。这里把它换成可离线的播放块：
//! - 封面 `data-cover`（URL 编码）下载后内联成 `data:` URI；
//! - mp4 需要文章 URL 里的 `token`（只有从微信客户端内复制出的链接才带）才能调
//!   `get_mp_video_play_url` 拿到地址；拿不到就只出封面 + 「在浏览器中播放」降级块。
//!
//! 放在 `assets.rs` 是因为它已 1700+ 行、单文件上限 2000 行；本模块**复用** assets
//! 的下载与规范化函数，不另造 HTTP 客户端。
//!
//! 解析 / 生成替换块的部分是纯函数（无 IO），便于单测；网络部分只在上层编排函数里。

use std::fs;

use super::{attr_value, decode_entities, escape_html, find_ci, find_tag_end};
use super::assets::{download_resource, mime_for_ext, normalize_resource_url, url_ext};

/// 播放地址接口（实测：匿名 token 为空时只回 `base_resp.ret=0`、无地址；
/// `cgi-bin/video` 分支回 `invalid session`——故必须有 token）。
const PLAY_URL_API: &str = "https://mp.weixin.qq.com/mp/videoplayer";

/// 公众号文章地址主机串：本地文档没有命令入参的 page_url，用它从 HTML 里回找文章 URL
/// （导入链路写的来源脚注 / canonical / 正文链接都带），再从中取 token。
const ARTICLE_HOST: &str = "mp.weixin.qq.com";

/// 封面内联上限：封面是 jpeg/webp 小图，超限说明拿错了东西，直接放弃内联。
const MAX_COVER_BYTES: usize = 6 * 1024 * 1024;

/// 可当作视频落盘的扩展名（其余 ext 一律拒绝，防把 json/html 错误体当视频存盘）。
const VIDEO_EXTS: &[&str] = &["mp4", "mov", "webm", "mkv", "m4v"];

/// 一条 `class` 含 `video_iframe` 的 iframe：`[start, end)` 覆盖 `<iframe…>…</iframe>` 整段。
struct VideoIframe {
    start: usize,
    end: usize,
    /// 播放器地址（`data-src`，已解 HTML 实体）
    player_url: String,
    /// 视频号 ID：`data-mpvid` 优先，退回 `data-src` 的 `vid=`
    vid: String,
    /// 封面地址（`data-cover`，解实体 + URL 解码）
    cover_url: String,
    /// 宽高比（`data-ratio`，w/h）
    ratio: Option<f64>,
}

/// 一条视频的本地化落地结果：`poster_uri` = 内联的 `data:` 封面；
/// `mp4_src` = 写进 `<video src>` 的地址（相对 `<stem>.media/…`，由后续内联步骤处理）。
pub(crate) struct VideoLocal {
    poster_uri: Option<String>,
    mp4_src: Option<String>,
}

/// 从 HTML 扫描微信视频号 iframe（字节索引均取自 ASCII 定界符，切片必落字符边界）。
fn parse_wechat_videos(html: &str) -> Vec<VideoIframe> {
    let mut out = Vec::new();
    let mut from = 0usize;
    while let Some(rel) = html[from..].find("<iframe") {
        let start = from + rel;
        let gt = match find_tag_end(html.as_bytes(), start)
            .or_else(|| html[start..].find('>').map(|i| start + i))
        {
            Some(g) => g,
            None => break,
        };
        let tag = &html[start..=gt];
        from = gt + 1;
        let class = decode_entities(&attr_value(tag, "class").unwrap_or_default());
        if !class
            .split(|c: char| c.is_whitespace() || c == ';')
            .any(|t| t.eq_ignore_ascii_case("video_iframe"))
        {
            continue;
        }
        let player_url = decode_entities(&attr_value(tag, "data-src").unwrap_or_default())
            .trim()
            .to_string();
        let mut vid = decode_entities(&attr_value(tag, "data-mpvid").unwrap_or_default())
            .trim()
            .to_string();
        if vid.is_empty() {
            vid = query_param(&player_url, "vid").unwrap_or_default();
        }
        // 既无 vid 也无播放器地址 → 无法播放也无法跳转，保留原结构
        if vid.is_empty() && player_url.is_empty() {
            continue;
        }
        let cover_raw = decode_entities(&attr_value(tag, "data-cover").unwrap_or_default());
        let cover_url = percent_decode(cover_raw.trim()).trim().to_string();
        let ratio = attr_value(tag, "data-ratio")
            .map(|s| decode_entities(&s))
            .and_then(|s| s.trim().parse::<f64>().ok())
            .filter(|r| *r > 0.0 && r.is_finite());
        // 整段替换含闭标签；找不到 `</iframe>`（残缺 HTML）就只替换开标签。
        // ponytail: 尾串全扫 O(n)，微信正文的 iframe 数个位，代价可忽略。
        let tail = &html[gt + 1..];
        let end = match find_ci(tail, "</iframe>") {
            Some(i) => gt + 1 + i + "</iframe>".len(),
            None => gt + 1,
        };
        out.push(VideoIframe {
            start,
            end,
            player_url,
            vid,
            cover_url,
            ratio,
        });
        from = end;
    }
    out
}

/// 生成一条视频的替换块（纯函数）。有本地 mp4 → `<video>`；否则 → fallback 容器，
/// 封面存在与否决定其中是否含 `<img>`。`data-ratio` 转成的内联 `style` 是唯一例外：
/// 替换块跨文档渲染、外部样式表不可控，比例只能随行带上。
fn render_video_block(v: &VideoIframe, mp4_src: Option<&str>, poster_uri: Option<&str>) -> String {
    match mp4_src {
        Some(src) => {
            // 微信的 data-ratio 即 w/h，正好是 CSS aspect-ratio 的取值：
            // 元数据未加载前先把版面撑住，避免加载完跳动
            let style = match v.ratio {
                Some(r) => format!(" style=\"aspect-ratio:{:.4}\"", r),
                None => String::new(),
            };
            // data: URI 只含 base64 字母表，无需 HTML 转义（16MB 串转三遍纯属浪费）
            let poster = poster_uri
                .map(|p| format!(" poster=\"{p}\""))
                .unwrap_or_default();
            format!(
                "<video class=\"mdview-video\"{style} src=\"{}\"{poster} controls preload=\"metadata\" playsinline data-mdview-vid=\"{}\"></video>",
                escape_html(src),
                escape_html(&v.vid)
            )
        }
        None => {
            // fallback 容器刻意不带 aspect-ratio：里面还有文字，固定比例会把它们挤出盒子
            let img = poster_uri
                .map(|p| format!("<img class=\"mdview-video-poster\" src=\"{p}\" alt=\"视频封面\">"))
                .unwrap_or_default();
            format!(
                "<div class=\"mdview-video-fallback\">{img}<a class=\"mdview-video-link\" href=\"{}\" target=\"_blank\" rel=\"noopener\">在浏览器中播放</a><span class=\"mdview-video-hint\">微信视频号需登录态，无法本地化</span></div>",
                escape_html(&v.player_url)
            )
        }
    }
}

/// 按 `parse_wechat_videos` 的出现顺序把 iframe 整段换成播放块（纯函数，无 IO）。
/// `locals` 越界 / 缺项一律按「无本地资源」降级，绝不 panic。
fn replace_wechat_videos(html: &str, locals: &[VideoLocal]) -> String {
    let vids = parse_wechat_videos(html);
    if vids.is_empty() {
        return html.to_string();
    }
    let mut out = String::with_capacity(html.len());
    let mut last = 0usize;
    for (i, v) in vids.iter().enumerate() {
        let l = locals.get(i);
        out.push_str(&html[last..v.start]);
        out.push_str(&render_video_block(
            v,
            l.and_then(|x| x.mp4_src.as_deref()),
            l.and_then(|x| x.poster_uri.as_deref()),
        ));
        last = v.end;
    }
    out.push_str(&html[last..]);
    out
}

/// 从 URL 的 query 取参数（原样返回，不解百分号——token/vid 都是纯 ASCII 值）。
fn query_param(url: &str, key: &str) -> Option<String> {
    let q = url.split_once('?')?.1;
    for pair in q.split('&') {
        let (k, val) = match pair.split_once('=') {
            Some(x) => x,
            None => continue,
        };
        if k == key && !val.is_empty() {
            return Some(val.to_string());
        }
    }
    None
}
/// 百分号解码（无 url crate，与 assets.rs 的手写 URL 处理同纪律）。
/// UTF-8 续字节恒 ≥0x80，故 `b[i]==b'%'` 处必是字符边界，切片安全。
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(b.len());
    let mut i = 0usize;
    while i < b.len() {
        if b[i] == b'%' && i + 3 <= b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// 从 HTML 里回找公众号文章 URL：优先带 `token=` 的那条（只有客户端内复制的链接才有），
/// 否则取第一条指向 mp.weixin.qq.com 的绝对地址。定界符全是 ASCII → 字节偏移即字符边界。
fn find_article_url(html: &str) -> Option<String> {
    const DELIMS: [char; 8] = ['\'', '"', '<', '>', ' ', '\t', '\n', '\r'];
    let mut first: Option<String> = None;
    let mut from = 0usize;
    while let Some(rel) = html[from..].find(ARTICLE_HOST) {
        let hit = from + rel;
        from = hit + ARTICLE_HOST.len();
        // 向左跳到本条地址的起始定界符，再在其中定位 scheme；无 scheme（协议相对写法）不收
        let ls = html[..hit].rfind(DELIMS).map(|i| i + 1).unwrap_or(0);
        let val_start = match html[ls..hit].rfind("http") {
            Some(k) => ls + k,
            None => continue,
        };
        let tail = &html[val_start..];
        let val = match tail.find(DELIMS) {
            Some(e) => &tail[..e],
            None => tail,
        };
        let url = decode_entities(val);
        if url.contains("token=") {
            return Some(url);
        }
        if first.is_none() {
            first = Some(url);
        }
    }
    first
}

/// 文章 URL + 播放接口所需 token：先 `token`，退 `wxtoken`；都没有返回 None
/// （微信实测匿名调用只回 `base_resp`、无播放地址，省掉一次注定空手而归的请求）。
fn resolve_article(html: &str, page_url: Option<&str>) -> (Option<String>, Option<String>) {
    let url = match page_url {
        Some(u) if u.contains(ARTICLE_HOST) => Some(u.to_string()),
        _ => find_article_url(html),
    };
    let token = url
        .as_deref()
        .and_then(|u| query_param(u, "token").or_else(|| query_param(u, "wxtoken")));
    (url, token)
}

/// 容错解析播放接口响应：字段结构未公开且随版本变化，故遍历整棵 JSON 树，
/// 收任何「路径带视频扩展名」或「键名含 url 的 http 地址」的字符串值。
fn collect_strings(node: &serde_json::Value, key: Option<&str>, out: &mut Vec<String>) {
    match node {
        serde_json::Value::Object(map) => {
            for (k, v) in map {
                collect_strings(v, Some(k), out)
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr {
                collect_strings(v, key, out)
            }
        }
        serde_json::Value::String(s) => {
            if !s.starts_with("http") {
                return;
            }
            let strong = url_ext(s)
                .map(|e| VIDEO_EXTS.contains(&e.as_str()))
                .unwrap_or(false);
            let weak = key
                .map(|k| k.to_ascii_lowercase().contains("url"))
                .unwrap_or(false);
            if strong || weak {
                out.push(s.clone());
            }
        }
        _ => {}
    }
}

/// 下载封面并内联为 `data:` URI。失败返回 None（调用方降级，绝不中断本地化）。
async fn fetch_cover(
    client: &reqwest::Client,
    referer: Option<&str>,
    cover_url: &str,
) -> Option<String> {
    if cover_url.is_empty() {
        return None;
    }
    // 与图片链路同规则：http → https、相对地址按文章 URL join
    let url = normalize_resource_url(cover_url, referer)?;
    let (bytes, ext) = download_resource(client, referer, &url).await?;
    if bytes.len() > MAX_COVER_BYTES {
        return None;
    }
    let mime = mime_for_ext(&ext)?;
    if !mime.starts_with("image/") {
        return None;
    }
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    Some(format!("data:{};base64,{}", mime, b64))
}

/// 取播放地址并下载 mp4 到 `<dir>/<stem>.media/<vid>.<ext>`，返回 HTML 内相对路径。
/// 无 token / 接口无地址 / 下载失败 → None（封面 fallback）。幂等：目标已存在则跳过下载。
async fn fetch_mp4(
    client: &reqwest::Client,
    referer: Option<&str>,
    dir: &str,
    stem: &str,
    token: &str,
    v: &VideoIframe,
) -> Option<String> {
    if v.vid.is_empty() {
        return None;
    }
    let api = format!(
        "{}?action=get_mp_video_play_url&vid={}&token={}&f=json",
        PLAY_URL_API, v.vid, token
    );
    // 复用 download_resource：同样是带 Referer 的 8s GET，只是拿到的是 JSON 体
    let (body, _) = download_resource(client, referer, &api).await?;
    let json: serde_json::Value = serde_json::from_slice(&body).ok()?;
    let mut candidates = Vec::new();
    collect_strings(&json, None, &mut candidates);
    // 优先只试「扩展名是视频」的候选，避免把分享图 / 接口里的无关 url 字段当视频下载
    let strong: Vec<String> = candidates
        .iter()
        .filter(|s| {
            url_ext(s)
                .map(|e| VIDEO_EXTS.contains(&e.as_str()))
                .unwrap_or(false)
        })
        .cloned()
        .collect();
    if !strong.is_empty() {
        candidates = strong;
    }
    let media_dir = format!("{}/{}.media", dir, stem);
    for cand in candidates {
        let Some((bytes, ext)) = download_resource(client, referer, &cand).await else {
            continue;
        };
        if !VIDEO_EXTS.contains(&ext.as_str()) {
            continue;
        }
        let fname = format!("{}.{}", sanitize_vid(&v.vid), ext);
        let path = format!("{}/{}", media_dir, fname);
        if fs::metadata(&path).is_err() {
            if fs::create_dir_all(&media_dir).is_err() || fs::write(&path, &bytes).is_err() {
                continue;
            }
        }
        return Some(format!("{}.media/{}", stem, fname));
    }
    None
}

/// vid → 安全文件名片段（复用 stem slug 规则，防 `..` / 斜杠 / 空格进出路径）。
fn sanitize_vid(vid: &str) -> String {
    super::assets::sanitize_stem(vid)
}

/// 本地化 HTML 中的微信视频号：封面内联 `data:`，有 token 才尝试下载 mp4。
/// 幂等（已含 `mdview-video` 标记即跳过）；一切网络 / 解析失败都降级成 fallback，
/// 绝不返回错误、绝不让整个本地化流程失败。
pub(crate) async fn localize_wechat_videos(
    client: &reqwest::Client,
    html: &str,
    dir: &str,
    stem: &str,
    page_url: Option<&str>,
) -> String {
    if html.contains("mdview-video") {
        return html.to_string();
    }
    let vids = parse_wechat_videos(html);
    if vids.is_empty() {
        return html.to_string();
    }
    let (article_url, token) = resolve_article(html, page_url);
    let mut locals = Vec::with_capacity(vids.len());
    for v in &vids {
        let poster_uri = fetch_cover(client, article_url.as_deref(), &v.cover_url).await;
        let mp4_src = match token.as_deref() {
            Some(t) => fetch_mp4(client, article_url.as_deref(), dir, stem, t, v).await,
            None => None,
        };
        locals.push(VideoLocal {
            poster_uri,
            mp4_src,
        });
    }
    replace_wechat_videos(html, &locals)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 用户提供的真实微信文章视频框（`data-cover` 为整串 URL 编码）。
    const WX_SNIPPET: &str = r#"<section nodeleaf=""><iframe class="video_iframe rich_pages" data-src="https://mp.weixin.qq.com/mp/readtemplate?t=pages/video_player_tmpl&amp;action=mpvideo&amp;auto=0&amp;vid=wxv_4752019837638672386" data-mpvid="wxv_4752019837638672386" data-vidtype="2" data-cover="http%3A%2F%2Fmmbiz.qpic.cn%2Fsz_mmbiz_jpg%2FAAAaBBBccc%2Fcover.jpg%3Fwx_fmt%3Djpeg" data-ratio="1.7777777777777777" data-w="1920"></iframe></section>"#;

    fn poster_local() -> VideoLocal {
        VideoLocal {
            poster_uri: Some("data:image/jpeg;base64,QUJDRA==".to_string()),
            mp4_src: None,
        }
    }

    #[test]
    fn parses_vid_cover_and_entity_decoded_player_url() {
        let vids = parse_wechat_videos(WX_SNIPPET);
        assert_eq!(vids.len(), 1);
        let v = &vids[0];
        assert_eq!(v.vid, "wxv_4752019837638672386");
        assert_eq!(
            v.cover_url,
            "http://mmbiz.qpic.cn/sz_mmbiz_jpg/AAAaBBBccc/cover.jpg?wx_fmt=jpeg"
        );
        // `&amp;` 必须解成 `&`，否则拼不出可点开的播放器地址
        assert!(v.player_url.contains("&action=mpvideo"));
        assert!(!v.player_url.contains("&amp;"));
        assert!(v.ratio.unwrap() > 1.77 && v.ratio.unwrap() < 1.78);
        // 替换区间覆盖整段 <iframe …></iframe>
        let span = &WX_SNIPPET[v.start..v.end];
        assert!(span.starts_with("<iframe") && span.ends_with("</iframe>"));
        assert_eq!(&WX_SNIPPET[..v.start], "<section nodeleaf=\"\">");
        assert_eq!(&WX_SNIPPET[v.end..], "</section>");
    }

    #[test]
    fn no_token_falls_back_to_link_and_drops_iframe() {
        // 本地文档没有 page_url，HTML 内也只有 readtemplate 地址 → 取不到 token
        assert!(resolve_article(WX_SNIPPET, None).1.is_none());
        let out = replace_wechat_videos(WX_SNIPPET, &[]);
        assert!(!out.contains("<iframe"));
        assert!(out.contains("mdview-video-fallback"));
        assert!(out.contains("在浏览器中播放"));
        // 无封面可下时不含 <img>
        assert!(!out.contains("<img"));
        // href 里的 & 重新转义回 &amp;，区间外的 <section> 保留
        assert!(out.contains("href=\"https://mp.weixin.qq.com/mp/readtemplate?t=pages/video_player_tmpl&amp;action=mpvideo"));
        assert!(out.starts_with("<section nodeleaf=\"\">") && out.ends_with("</section>"));
    }

    #[test]
    fn poster_only_fallback_keeps_image() {
        let out = replace_wechat_videos(WX_SNIPPET, &[poster_local()]);
        assert!(!out.contains("<iframe"));
        assert!(out.contains("<img class=\"mdview-video-poster\" src=\"data:image/jpeg;base64,QUJDRA==\""));
    }

    #[test]
    fn local_mp4_renders_video_with_ratio_style_and_missing_local_degrades() {
        let mp4 = VideoLocal {
            poster_uri: Some("data:image/jpeg;base64,QUJDRA==".to_string()),
            mp4_src: Some("doc.media/wxv_4752019837638672386.mp4".to_string()),
        };
        let out = replace_wechat_videos(WX_SNIPPET, &[mp4]);
        assert!(!out.contains("<iframe"));
        assert!(out.contains("<video class=\"mdview-video\" style=\"aspect-ratio:1.7778\""));
        assert!(out.contains("src=\"doc.media/wxv_4752019837638672386.mp4\""));
        assert!(out.contains("poster=\"data:image/jpeg;base64,QUJDRA==\""));
        assert!(out.contains("data-mdview-vid=\"wxv_4752019837638672386\""));
        // locals 少于解析数 → 缺项降级为 fallback，不 panic
        let short = replace_wechat_videos(WX_SNIPPET, &[]);
        assert!(short.contains("mdview-video-fallback"));
    }

    #[test]
    fn non_video_iframe_is_untouched() {
        let other = "<iframe class=\"rich_pages\" data-src=\"https://x/y\"></iframe>";
        assert!(parse_wechat_videos(other).is_empty());
        assert!(parse_wechat_videos("<p>no iframe here</p>").is_empty());
        // 残缺 HTML（无闭标签）也只替换开标签，不吞后续内容
        let broken = "<section><iframe class=\"video_iframe\" data-mpvid=\"wxv_1\"><p>keep</p>";
        let out = replace_wechat_videos(broken, &[]);
        assert!(!out.contains("<iframe"));
        assert!(out.contains("<p>keep</p>"));
    }

    #[test]
    fn percent_decode_and_query_param_and_article_token() {
        assert_eq!(
            percent_decode("http%3A%2F%2Fmmbiz.qpic.cn%2Fa.jpg%3Fwx_fmt%3Djpeg"),
            "http://mmbiz.qpic.cn/a.jpg?wx_fmt=jpeg"
        );
        assert_eq!(percent_decode("100%zz"), "100%zz");
        assert_eq!(query_param("https://x/s?a=1&token=42&b=2", "token").as_deref(), Some("42"));
        assert_eq!(query_param("https://x/s?a=1", "token"), None);
        // 客户端内复制的链接带 token
        let html = "<link rel=\"canonical\" href=\"https://mp.weixin.qq.com/s?__biz=MzA5&amp;token=123456&amp;lang=zh_CN\">";
        assert_eq!(resolve_article(html, None).1.as_deref(), Some("123456"));
        assert_eq!(
            resolve_article(html, Some("https://mp.weixin.qq.com/s?wxtoken=789"))
                .1
                .as_deref(),
            Some("789")
        );
        // 只有 readtemplate 播放器地址（无 token）时不该误命中
        assert_eq!(resolve_article(WX_SNIPPET, None).1, None);
    }

    #[test]
    fn video_url_extraction_is_shape_tolerant() {
        // 猜测的两种返回形态都要能取到地址；匿名形态无地址 → 空
        let j: serde_json::Value = serde_json::from_str(
            r#"{"base_resp":{"ret":0},"video_infos":[{"urlinfo":[{"video_url":"https://v.weixin.qq.com/c.mp4?token=x","thumb":"https://m.mb.jpg"}]}]}"#,
        )
        .unwrap();
        let mut out = Vec::new();
        collect_strings(&j, None, &mut out);
        assert!(out.contains(&"https://v.weixin.qq.com/c.mp4?token=x".to_string()));
        let anon: serde_json::Value =
            serde_json::from_str(r#"{"base_resp":{"exportkey_token":"","ret":0}}"#).unwrap();
        let mut out2 = Vec::new();
        collect_strings(&anon, None, &mut out2);
        assert!(out2.is_empty());
    }

    #[test]
    fn sanitize_vid_blocks_path_traversal() {
        assert_eq!(sanitize_vid("wxv_4752019837638672386"), "wxv_4752019837638672386");
        // 越界字符全部被吃掉：既无路径分隔符也无点，拼不出 `..` 或隐藏文件
        let evil = sanitize_vid("../../etc/passwd");
        assert!(!evil.contains('/') && !evil.contains('\\') && !evil.contains('.'));
    }
}
