//! 格式转换命令（对齐 InspireLoom `src-tauri/src/commands/format_convert.rs`，
//! 但 MdView 是纯本地文件工作台，因此只暴露「本地文件 -> 落盘」形态，无 KB 落库）。

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::command;

/// 本地文件转换结果。
#[derive(Serialize)]
pub struct ConvertFileResult {
    pub output_path: String,
    pub format: String,
    pub is_text: bool,
}

/// 转换本地文件为指定格式并落盘。
///
/// - `output_path`：显式选择的目标路径（前端「另存为式」弹窗）。提供时直接写该路径。
/// - `output_dir`：兜底目录。未提供 `output_path` 时写到该目录（默认源同目录），
///   自动以 `{stem}.{ext}` 命名。
///
/// 走 `spawn_blocking`：转换含整文件读写与手写 OOXML 打包，属 CPU/IO 密集，
/// 放在主线程会阻塞 WebView 事件循环。
#[command]
pub async fn convert_file_format(
    input_path: String,
    target_ext: String,
    output_path: Option<String>,
    output_dir: Option<String>,
) -> Result<ConvertFileResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        convert_core(input_path, target_ext, output_path, output_dir)
    })
    .await
    .map_err(|e| format!("转换任务失败：{e}"))?
}

/// 转换核心（同步）。pdf 目标会被后端明确拒绝，交由前端「所见即所得」导出。
pub(crate) fn convert_core(
    input_path: String,
    target_ext: String,
    output_path: Option<String>,
    output_dir: Option<String>,
) -> Result<ConvertFileResult, String> {
    let from = Path::new(&input_path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("txt")
        .to_lowercase();
    let to = target_ext.trim_start_matches('.').to_lowercase();

    let out = crate::convert::convert(&read_bytes(&input_path)?, &from, &to)?;

    let out_path = resolve_output(&input_path, &to, output_path, output_dir)?;
    std::fs::write(&out_path, &out.data).map_err(|e| format!("写入文件失败：{e}"))?;

    Ok(ConvertFileResult {
        output_path: out_path,
        format: to,
        is_text: out.is_text,
    })
}

/// 给定源格式，返回可转换的目标扩展名列表（前端候选下拉）。
#[command]
pub fn supported_convert_targets(from_format: String) -> Vec<String> {
    crate::convert::supported_targets(&from_format)
}

// ---------------------------------------------------------------- helpers

fn read_bytes(path: &str) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|e| format!("读取文件失败：{e}"))
}

fn resolve_output(
    input_path: &str,
    to: &str,
    output_path: Option<String>,
    output_dir: Option<String>,
) -> Result<String, String> {
    if let Some(p) = output_path {
        return Ok(p);
    }
    let p = Path::new(input_path);
    let stem = p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("converted")
        .to_string();
    let dir = output_dir
        .or_else(|| {
            p.parent()
                .map(|pp| pp.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| ".".to_string());
    let path: PathBuf = Path::new(&dir).join(format!("{stem}.{to}"));
    Ok(path.to_string_lossy().to_string())
}
