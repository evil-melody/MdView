use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelProfile {
    pub id: String,
    /// 展示名，如「对话主力」「VL 视觉」
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    pub enabled: bool,
    /// 模型配置列表（每个含独立 Base URL / Key / 模型名）
    #[serde(default)]
    pub profiles: Vec<ModelProfile>,
    /// 对话 / 摘要使用的 profile id
    #[serde(default)]
    pub chat_profile: String,
    /// Embedding（向量化 / 检索）使用的 profile id
    #[serde(default)]
    pub embedding_profile: String,
    /// 视觉(VL) 使用的 profile id
    #[serde(default)]
    pub vlm_profile: String,
    // ---- 旧版单模型字段：仅用于读取旧 config.json 迁移到 profiles，不再作为运行时来源 ----
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
}

impl AiConfig {
    /// 迁移与自愈：旧单模型字段 → 生成第一个 profile；角色绑定指向已删除项时回退。
    pub fn normalize(&mut self) {
        if self.profiles.is_empty() && !self.base_url.trim().is_empty() {
            let id = format!("p{}", now_secs());
            self.profiles.push(ModelProfile {
                id: id.clone(),
                name: if self.model.trim().is_empty() {
                    "默认模型".to_string()
                } else {
                    self.model.trim().to_string()
                },
                base_url: self.base_url.clone(),
                api_key: self.api_key.clone(),
                model: self.model.clone(),
            });
            self.chat_profile = id;
        }
        if !self.profiles.is_empty()
            && (self.chat_profile.is_empty()
                || !self.profiles.iter().any(|p| p.id == self.chat_profile))
        {
            self.chat_profile = self.profiles[0].id.clone();
        }
    }

    /// 解析某角色当前生效的配置：按 id 精确匹配 → 对话配置 → 第一个
    pub fn resolve_profile(&self, role_id: &str) -> Option<&ModelProfile> {
        self.profiles
            .iter()
            .find(|p| p.id == role_id)
            .or_else(|| self.profiles.iter().find(|p| p.id == self.chat_profile))
            .or_else(|| self.profiles.first())
    }
}

impl Default for AiConfig {
    fn default() -> Self {
        AiConfig {
            enabled: false,
            profiles: Vec::new(),
            chat_profile: String::new(),
            embedding_profile: String::new(),
            vlm_profile: String::new(),
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
    let mut cfg = match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    };
    cfg.ai.normalize();
    cfg
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
