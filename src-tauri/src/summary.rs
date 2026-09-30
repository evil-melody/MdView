//! AI 文件摘要：抽取正文 → 调 OpenAI 兼容接口 → 落缓存（按 size:mtime 指纹判失效）。
//!
//! 与 `ai_chat_stream` 同属 AI 能力，但走非流式请求 + 并发调度：批量摘要要的是吞吐，
//! 不需要逐字回流。进度通过 Tauri 事件 `ai-sum-progress {id, done, total, path}` 推送。

use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::config::{cache_path, file_fingerprint, now_secs};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::Emitter;

/// 单文件摘要缓存记录（持久化在 config_dir/MdView/summaries.json）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryRecord {
    pub summary: String,
    pub model: String,
    /// 生成时间（unix 秒）
    pub ts: i64,
    /// 生成时的 "size:mtime" 指纹：文件被改动后该记录即失效
    pub fingerprint: String,
}

/// 一次批量任务的单文件结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryResult {
    pub path: String,
    pub summary: String,
    pub error: Option<String>,
    pub cached: bool,
}

/// 送进模型的正文上限（字符数）：足够覆盖文档主旨，又不至于撑爆上下文
const MAX_TEXT_CHARS: usize = 12_000;
/// 并发请求数：批量吞吐与接口限流之间的折中
const CONCURRENCY: usize = 4;

const SYSTEM_PROMPT: &str = "你是文件摘要助手。请用简体中文输出：\
1) 一句话概括（不超过 40 字）；\
2) 3-5 条要点（每行以 - 开头）；\
3) 文末一行「关键词：a、b、c」。\
要求：只依据给定正文，不臆测；不要复述标题；不要使用 Markdown 标题语法。";

pub fn load_cache() -> HashMap<String, SummaryRecord> {
    match fs::read_to_string(cache_path("summaries.json")) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

fn save_cache(cache: &HashMap<String, SummaryRecord>) {
    if let Ok(s) = serde_json::to_string(cache) {
        let _ = fs::write(cache_path("summaries.json"), s);
    }
}

/// 抽取可送模型的正文：office 走已有的 md 转换，其余按 UTF-8 文本读；超限截断。
pub fn extract_text(path: &str) -> Result<String, String> {
    let p = Path::new(path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let raw = match ext.as_str() {
        "docx" => crate::office::docx_to_md(&fs::read(p).map_err(|e| e.to_string())?)?,
        "xlsx" | "xls" => crate::office::xlsx_to_md(&fs::read(p).map_err(|e| e.to_string())?)?,
        "pptx" => crate::office::pptx_to_md(&fs::read(p).map_err(|e| e.to_string())?)?,
        "pdf" => return Err("暂不支持 PDF 摘要".to_string()),
        _ => fs::read_to_string(p).map_err(|e| e.to_string())?,
    };
    let text = raw.trim().to_string();
    if text.is_empty() {
        return Err("文件内容为空".to_string());
    }
    if text.chars().count() > MAX_TEXT_CHARS {
        return Ok(text.chars().take(MAX_TEXT_CHARS).collect());
    }
    Ok(text)
}

fn emit_progress(
    app: &tauri::AppHandle,
    req_id: &str,
    done: usize,
    total: usize,
    path: &str,
    error: Option<String>,
) {
    let _ = app.emit(
        "ai-sum-progress",
        json!({ "id": req_id, "done": done, "total": total, "path": path, "error": error }),
    );
}

/// 批量生成文件摘要：命中缓存直接复用，其余并发请求 AI 接口。
/// 每完成一个文件即写回缓存，中途取消/崩溃已生成部分不丢。
#[tauri::command]
pub async fn summarize_files(
    app_handle: tauri::AppHandle,
    req_id: String,
    paths: Vec<String>,
) -> Result<Vec<SummaryResult>, String> {
    let cfg = crate::config::load_config();
    if !cfg.ai.enabled || cfg.ai.api_key.trim().is_empty() {
        return Err("请先在设置中启用 AI 并配置 API Key".to_string());
    }

    let mut cache = load_cache();
    let total = paths.len();
    let done = Arc::new(AtomicUsize::new(0));
    let mut results: Vec<SummaryResult> = Vec::with_capacity(total);
    let mut pending: Vec<(String, String)> = Vec::new();

    for path in &paths {
        if let Some(rec) = cache.get(path) {
            if !rec.summary.is_empty() && rec.fingerprint == file_fingerprint(path) {
                let d = done.fetch_add(1, Ordering::SeqCst) + 1;
                emit_progress(&app_handle, &req_id, d, total, path, None);
                results.push(SummaryResult {
                    path: path.clone(),
                    summary: rec.summary.clone(),
                    error: None,
                    cached: true,
                });
                continue;
            }
        }
        match extract_text(path) {
            Ok(text) => pending.push((path.clone(), text)),
            Err(e) => {
                let d = done.fetch_add(1, Ordering::SeqCst) + 1;
                emit_progress(&app_handle, &req_id, d, total, path, Some(e.clone()));
                results.push(SummaryResult {
                    path: path.clone(),
                    summary: String::new(),
                    error: Some(e),
                    cached: false,
                });
            }
        }
    }

    let base = if cfg.ai.base_url.trim().ends_with('/') {
        cfg.ai.base_url.trim().to_string()
    } else {
        format!("{}/", cfg.ai.base_url.trim())
    };
    let url = format!("{}chat/completions", base);
    let client = reqwest::Client::new();
    let api_key = cfg.ai.api_key.clone();
    let model = cfg.ai.model.clone();

    let tasks = pending.into_iter().map(|(path, text)| {
        let client = client.clone();
        let url = url.clone();
        let api_key = api_key.clone();
        let model = model.clone();
        let name = Path::new(&path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        async move {
            let body = json!({
                "model": model,
                "messages": [
                    { "role": "system", "content": SYSTEM_PROMPT },
                    { "role": "user", "content": format!("文件名：{}\n\n正文：\n{}", name, text) }
                ],
                "temperature": 0.3,
                "max_tokens": 500,
            });
            let out: Result<String, String> = async {
                let resp = client
                    .post(&url)
                    .bearer_auth(&api_key)
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("请求失败: {}", e))?;
                if !resp.status().is_success() {
                    let code = resp.status().as_u16();
                    let body = resp.text().await.unwrap_or_default();
                    return Err(format!("AI 接口返回 {}: {}", code, body));
                }
                let json = resp
                    .json::<serde_json::Value>()
                    .await
                    .map_err(|e| format!("解析响应失败: {}", e))?;
                let content = json["choices"][0]["message"]["content"]
                    .as_str()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if content.is_empty() {
                    return Err("模型返回空内容".to_string());
                }
                Ok(content)
            }
            .await;
            (path, out)
        }
    });

    let mut stream = Box::pin(futures_util::stream::iter(tasks).buffer_unordered(CONCURRENCY));
    use futures_util::StreamExt;
    while let Some((path, out)) = stream.next().await {
        let (summary, error) = match out {
            Ok(s) => (s, None),
            Err(e) => (String::new(), Some(e)),
        };
        if error.is_none() {
            cache.insert(
                path.clone(),
                SummaryRecord {
                    summary: summary.clone(),
                    model: model.clone(),
                    ts: now_secs(),
                    fingerprint: file_fingerprint(&path),
                },
            );
            save_cache(&cache);
        }
        let d = done.fetch_add(1, Ordering::SeqCst) + 1;
        emit_progress(&app_handle, &req_id, d, total, &path, error.clone());
        results.push(SummaryResult {
            path,
            summary,
            error,
            cached: false,
        });
    }

    Ok(results)
}

/// 读取全部摘要缓存（前端启动时载入，供列表/搜索/树过滤使用）
#[tauri::command]
pub fn load_summaries() -> HashMap<String, SummaryRecord> {
    load_cache()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::PathBuf;

    fn tmp_file(name: &str, body: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("mdview-sum-test-{}-{}", name, now_secs()));
        let mut f = fs::File::create(&p).unwrap();
        f.write_all(body.as_bytes()).unwrap();
        p
    }

    #[test]
    fn extract_text_reads_plain_text() {
        let p = tmp_file("a.md", "# 标题\n\n正文内容");
        let text = extract_text(p.to_str().unwrap()).unwrap();
        assert!(text.contains("正文内容"));
        fs::remove_file(p).ok();
    }

    #[test]
    fn extract_text_truncates_to_limit() {
        let body: String = "あ".repeat(MAX_TEXT_CHARS + 500);
        let p = tmp_file("big.md", &body);
        let text = extract_text(p.to_str().unwrap()).unwrap();
        assert_eq!(text.chars().count(), MAX_TEXT_CHARS);
        fs::remove_file(p).ok();
    }

    #[test]
    fn extract_text_rejects_empty_and_missing() {
        let p = tmp_file("empty.md", "   \n  ");
        assert!(extract_text(p.to_str().unwrap()).is_err());
        fs::remove_file(p).ok();
        assert!(extract_text("/nonexistent/mdview-nope.md").is_err());
    }

    #[test]
    fn fingerprint_changes_on_edit() {
        let p = tmp_file("fp.txt", "v1");
        let before = file_fingerprint(p.to_str().unwrap());
        std::thread::sleep(std::time::Duration::from_millis(1100));
        fs::write(&p, "v2-longer").unwrap();
        let after = file_fingerprint(p.to_str().unwrap());
        assert_ne!(before, after, "文件改动后指纹应变化");
        fs::remove_file(p).ok();
    }
}

/// 清除指定文件的摘要缓存（文件改动后手动重新生成）
#[tauri::command]
pub fn clear_summaries(paths: Vec<String>) -> Result<bool, String> {
    let mut cache = load_cache();
    for p in paths {
        cache.remove(&p);
    }
    save_cache(&cache);
    Ok(true)
}
