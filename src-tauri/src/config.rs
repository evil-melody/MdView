use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

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
