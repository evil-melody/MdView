use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    pub enabled: bool,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

impl Default for AiConfig {
    fn default() -> Self {
        AiConfig {
            enabled: false,
            base_url: "https://api.openai.com/v1".to_string(),
            api_key: String::new(),
            model: "gpt-4o-mini".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub scan_roots: Vec<String>,
    pub ai: AiConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            scan_roots: Vec::new(),
            ai: AiConfig::default(),
        }
    }
}

fn config_path() -> PathBuf {
    let mut dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("MdView");
    fs::create_dir_all(&dir).ok();
    dir.push("config.json");
    dir
}

pub fn load_config() -> AppConfig {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

pub fn save_config(cfg: &AppConfig) -> Result<(), String> {
    let path = config_path();
    let s = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&path, s).map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// 当前 unix 秒（摘要/索引写入时间戳）
pub fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/**
 * 文件内容指纹：`size:mtime(秒)`。任一变化即视为内容可能已变——
 * AI 摘要、图片哈希等派生数据都靠它判断缓存是否失效。
 */
pub fn file_fingerprint(path: &str) -> String {
    match fs::metadata(path) {
        Ok(m) => {
            let mt = m
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            format!("{}:{}", m.len(), mt)
        }
        Err(_) => String::new(),
    }
}

/// 派生数据缓存统一落在 config_dir/MdView/<name>（如 summaries.json / image-index.json）
pub fn cache_path(name: &str) -> PathBuf {
    let mut dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("MdView");
    fs::create_dir_all(&dir).ok();
    dir.push(name);
    dir
}
