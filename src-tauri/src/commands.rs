use chrono::{DateTime, Local};
use serde::Serialize;
use std::fs;
use std::path::Path;

use crate::config::{load_config, save_config, AppConfig, ChatMessage};

#[derive(Debug, Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub ext: String,
    pub size: u64,
    pub modified: String,
    pub kind: String,
}

fn classify(path: &Path) -> String {
    if path.is_dir() {
        return "folder".to_string();
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "md" | "markdown" | "mdx" => "markdown",
        "txt" | "text" => "text",
        "json" | "yaml" | "yml" | "toml" | "ini" | "cfg" | "conf" => "config",
        "js" | "ts" | "tsx" | "jsx" | "vue" | "rs" | "go" | "py" | "c" | "cpp" | "h" | "java" | "css" | "scss" | "html" => "code",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" | "ico" => "image",
        "pdf" => "pdf",
        "doc" | "docx" => "document",
        "xls" | "xlsx" | "csv" => "sheet",
        "ppt" | "pptx" => "slide",
        "mp3" | "wav" | "flac" | "m4a" => "audio",
        "mp4" | "mov" | "webm" | "avi" => "video",
        "zip" | "tar" | "gz" | "rar" | "7z" => "archive",
        _ => "other",
    }
    .to_string()
}

fn to_entry(path: &Path) -> Option<FileEntry> {
    let meta = fs::metadata(path).ok()?;
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
    // 隐藏文件/目录（.DS_Store 等）不进文件列表
    if name.starts_with('.') {
        return None;
    }
    let modified: String = meta
        .modified()
        .ok()
        .and_then(|t| {
            let dt: DateTime<Local> = t.into();
            Some(dt.format("%Y-%m-%d %H:%M").to_string())
        })
        .unwrap_or_default();
    Some(FileEntry {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir: meta.is_dir(),
        ext: path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase(),
        size: meta.len(),
        modified,
        kind: classify(path),
    })
}

#[tauri::command]
pub fn scan_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    let mut entries: Vec<FileEntry> = Vec::new();
    if p.is_dir() {
        let mut read = fs::read_dir(p).map_err(|e| e.to_string())?;
        while let Some(Ok(item)) = read.next() {
            if let Some(e) = to_entry(&item.path()) {
                entries.push(e);
            }
        }
    } else if let Some(e) = to_entry(p) {
        entries.push(e);
    }
    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            return b.is_dir.cmp(&a.is_dir);
        }
        a.name.to_lowercase().cmp(&b.name.to_lowercase())
    });
    Ok(entries)
}

#[tauri::command]
pub fn read_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 读取二进制文件，base64 编码返回（前端 mammoth / SheetJS / fflate 解析 docx/xlsx/pptx 用）
#[tauri::command]
pub fn read_binary_base64(path: String) -> Result<String, String> {
    use base64::Engine as _;
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(data))
}

/// 将 base64 内容写为二进制文件（office 原生编辑保存路径：前端导出 docx/xlsx 字节落盘）
#[tauri::command]
pub fn write_binary_base64(path: String, contents: String) -> Result<bool, String> {
    use base64::Engine as _;
    let data = base64::engine::general_purpose::STANDARD
        .decode(contents)
        .map_err(|e| format!("base64 解码失败: {}", e))?;
    fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(true)
}

/// 切换 Webview 调试器（前端 Cmd+Shift+I / F12 触发，排查渲染问题用）。
/// 仅 debug 构建生效（tauri release 默认禁用 devtools）；release 调用为 no-op。
#[tauri::command]
pub fn toggle_devtools(window: tauri::WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

/// docx / xlsx / xls -> Markdown（Markdown 枢纽编辑，自 InspireLoom office.rs 移植）
#[tauri::command]
pub fn read_office_md(path: String) -> Result<String, String> {
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "docx" => crate::office::docx_to_md(&data),
        "xlsx" | "xls" => crate::office::xlsx_to_md(&data),
        _ => Err(format!("不支持的编辑格式: {ext}")),
    }
}

/// Markdown 写回 docx / xlsx
#[tauri::command]
pub fn write_office_md(path: String, md: String) -> Result<bool, String> {
    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let bytes = match ext.as_str() {
        "docx" => crate::office::md_to_docx(&md)?,
        "xlsx" => crate::office::md_to_xlsx(&md)?,
        _ => return Err(format!("不支持的写入格式: {ext}")),
    };
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn write_text(path: String, content: String) -> Result<bool, String> {
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn delete_path(path: String) -> Result<bool, String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
pub fn rename_path(path: String, new_name: String) -> Result<String, String> {
    let p = Path::new(&path);
    let parent = p.parent().ok_or("无效路径")?;
    let new_path = parent.join(new_name);
    fs::rename(p, &new_path).map_err(|e| e.to_string())?;
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn search_files(root: String, query: String, recursive: bool) -> Result<Vec<FileEntry>, String> {
    let q = query.to_lowercase();
    let mut results: Vec<FileEntry> = Vec::new();
    if q.is_empty() {
        return Ok(results);
    }
    let text_exts = ["md", "markdown", "txt", "text", "json", "yaml", "yml", "toml", "ini", "conf", "rs", "go", "py", "js", "ts", "vue", "css", "html", "log"];

    fn walk(
        dir: &Path,
        q: &str,
        recursive: bool,
        text_exts: &[&str],
        results: &mut Vec<FileEntry>,
        depth: usize,
    ) {
        if depth > 12 {
            return;
        }
        let mut read = match fs::read_dir(dir) {
            Ok(r) => r,
            Err(_) => return,
        };
        while let Some(Ok(item)) = read.next() {
            let p = item.path();
            let meta = match fs::metadata(&p) {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_dir() {
                if recursive {
                    walk(&p, q, recursive, text_exts, results, depth + 1);
                }
                continue;
            }
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
            let mut hit = name.contains(q);
            if !hit {
                let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                if text_exts.contains(&ext.as_str()) {
                    if let Ok(content) = fs::read_to_string(&p) {
                        if content.to_lowercase().contains(q) {
                            hit = true;
                        }
                    }
                }
            }
            if hit {
                if let Some(e) = crate::commands::to_entry_public(&p) {
                    results.push(e);
                }
            }
        }
    }

    let root_path = Path::new(&root);
    if root_path.is_file() {
        if let Some(e) = to_entry_public(root_path) {
            results.push(e);
        }
    } else {
        walk(root_path, &q, recursive, &text_exts, &mut results, 0);
    }
    results.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(results)
}

pub fn to_entry_public(path: &Path) -> Option<FileEntry> {
    to_entry(path)
}

fn skip_dir_name(name: &str) -> bool {
    name.starts_with('.')
        || name == "node_modules"
        || name == "target"
        || name == "dist"
        || name == "__pycache__"
        || name == "vendor"
}

#[tauri::command]
pub fn index_root(root: String) -> Result<Vec<FileEntry>, String> {
    let root_path = Path::new(&root);
    if !root_path.is_dir() {
        return Err(format!("不是目录: {}", root));
    }
    let mut results: Vec<FileEntry> = Vec::new();
    fn walk(dir: &Path, results: &mut Vec<FileEntry>, depth: usize) {
        if depth > 6 {
            return;
        }
        let mut read = match fs::read_dir(dir) {
            Ok(r) => r,
            Err(_) => return,
        };
        while let Some(Ok(item)) = read.next() {
            let p = item.path();
            let meta = match fs::metadata(&p) {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_dir() {
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if skip_dir_name(name) {
                    continue;
                }
                walk(&p, results, depth + 1);
            } else if let Some(e) = to_entry(&p) {
                results.push(e);
            }
        }
    }
    walk(root_path, &mut results, 0);
    Ok(results)
}

#[tauri::command]
pub fn load_config_cmd() -> AppConfig {
    load_config()
}

#[tauri::command]
pub fn save_config_cmd(config: AppConfig) -> Result<bool, String> {
    save_config(&config)?;
    Ok(true)
}

/// AI 流式对话：按 SSE `data: {choices[0].delta.content}` 增量发射 Tauri 事件。
/// 事件：`ai-chunk {id, delta}`、`ai-done {id}`、`ai-error {id, message}`。
/// 返回完整 content（仅给调用方兜底，前端主用事件驱动）。
#[tauri::command]
pub async fn ai_chat_stream(
    app_handle: tauri::AppHandle,
    req_id: String,
    messages: Vec<ChatMessage>,
    base_url: String,
    api_key: String,
    model: String,
) -> Result<String, String> {
    use futures_util::StreamExt;
    use tauri::Emitter;

    let base = if base_url.trim().ends_with('/') {
        base_url.trim().to_string()
    } else {
        format!("{}/", base_url.trim())
    };
    let url = format!("{}chat/completions", base);

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "messages": messages.iter().map(|m| serde_json::json!({"role": m.role, "content": m.content})).collect::<Vec<_>>(),
        "temperature": 0.3,
        "stream": true,
    });
    let resp = client
        .post(&url)
        .bearer_auth(&api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            let msg = format!("请求失败: {}", e);
            let _ = app_handle.emit("ai-error", serde_json::json!({ "id": req_id, "message": msg }));
            msg
        })?;

    if !resp.status().is_success() {
        let code = resp.status().as_u16();
        let txt = resp.text().await.unwrap_or_default();
        let msg = format!("AI 接口返回 {}: {}", code, txt);
        let _ = app_handle.emit("ai-error", serde_json::json!({ "id": req_id, "message": msg }));
        return Err(msg);
    }

    let mut full_content = String::new();
    let mut raw_body = String::new();
    let mut sse_buffer = String::new();
    let mut stream = resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| {
            let msg = format!("读取流失败: {}", e);
            let _ = app_handle.emit("ai-error", serde_json::json!({ "id": req_id, "message": msg }));
            msg
        })?;
        let text = String::from_utf8_lossy(&chunk);
        raw_body.push_str(&text);
        sse_buffer.push_str(&text);
        while let Some(nl) = sse_buffer.find('\n') {
            let line = sse_buffer[..nl].trim_end_matches('\r').to_string();
            sse_buffer = sse_buffer[nl + 1..].to_string();
            if !line.starts_with("data: ") {
                continue;
            }
            let json_str = &line[6..];
            if json_str == "[DONE]" {
                continue;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_str) {
                if let Some(delta) = json["choices"][0]["delta"]["content"].as_str() {
                    if !delta.is_empty() {
                        full_content.push_str(delta);
                        let _ = app_handle.emit(
                            "ai-chunk",
                            serde_json::json!({ "id": req_id, "delta": delta }),
                        );
                    }
                }
            }
        }
    }
    // 残留最后一行
    let last = sse_buffer.trim();
    if last.starts_with("data: ") && last.len() > 6 && &last[6..] != "[DONE]" {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&last[6..]) {
            if let Some(delta) = json["choices"][0]["delta"]["content"].as_str() {
                if !delta.is_empty() {
                    full_content.push_str(delta);
                    let _ = app_handle.emit(
                        "ai-chunk",
                        serde_json::json!({ "id": req_id, "delta": delta }),
                    );
                }
            }
        }
    }

    // 非标准 SSE 兜底（某些 proxy 把 stream 请求按普通 JSON 返回）
    if full_content.is_empty() && !raw_body.trim().is_empty() {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw_body) {
            if let Some(content) = json["choices"][0]["message"]["content"].as_str() {
                if !content.is_empty() {
                    full_content.push_str(content);
                    let _ = app_handle.emit(
                        "ai-chunk",
                        serde_json::json!({ "id": req_id, "delta": content }),
                    );
                }
            }
        }
    }

    let _ = app_handle.emit("ai-done", serde_json::json!({ "id": req_id }));
    Ok(full_content)
}
