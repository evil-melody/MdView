//! 相似图片：扫描目录 → 逐张算 dHash（64-bit 感知哈希）→ 按汉明距离分组。
//!
//! dHash 对缩放/压缩/轻度裁剪/水印稳健，是业界（imgdupes / PhotoDemon / 各大图库去重）
//! 通用的重复图检测基线：9x8 灰度缩略图 → 比较每行相邻像素 → 64 bit 指纹。

use crate::config::{cache_path, file_fingerprint, now_secs};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Emitter;

/// 单张图片的索引记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageRecord {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified: String,
    pub width: u32,
    pub height: u32,
    /// dHash 指纹（64 bit）
    pub hash: u64,
    /// 生成时的 size:mtime 指纹，文件改动后需重算
    pub fingerprint: String,
    pub ts: i64,
}

/// 一组相似图片（组内两两汉明距离均不超过阈值，或可通过中间元素连通）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimilarGroup {
    pub items: Vec<ImageRecord>,
    /// 组内最大汉明距离（越小越像）
    pub max_distance: u32,
}

/// 扫描进度事件负载：`img-index-progress`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexProgress {
    pub id: String,
    pub done: usize,
    pub total: usize,
    pub path: String,
}

const IMAGE_EXTS: [&str; 9] = [
    "png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff", "ico",
];

/// 目录递归深度上限（与 scan_directory 保持一致，避免扫描整个磁盘）
const MAX_DEPTH: usize = 6;
/// 每处理这么多张就落一次盘，中断不丢已算结果
const PERSIST_EVERY: usize = 20;
/// 分组时参与比较的图片上限：O(n²) 比较，3000 张约 450 万次汉明距离（毫秒级）
const MAX_COMPARE: usize = 3000;

fn index_file() -> PathBuf {
    cache_path("image-index.json")
}

pub fn load_index() -> HashMap<String, ImageRecord> {
    match fs::read_to_string(index_file()) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

fn save_index(index: &HashMap<String, ImageRecord>) {
    if let Ok(s) = serde_json::to_string(index) {
        let _ = fs::write(index_file(), s);
    }
}

fn is_image(path: &Path) -> bool {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    IMAGE_EXTS.contains(&ext.as_str())
}

fn modified_string(path: &Path) -> String {
    let secs = fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    if secs == 0 {
        return String::new();
    }
    // 与前端 FileEntry.modified 同格式：YYYY-MM-DD HH:MM
    let days = (secs / 86_400) as i64;
    let time_of_day = secs % 86_400;
    let (y, m, d) = civil_from_days(days);
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}",
        y,
        m,
        d,
        time_of_day / 3600,
        (time_of_day % 3600) / 60
    )
}

/// 时间戳（天）→ 年月日：Howard Hinnant 的 civil_from_days 算法（避免引入额外依赖）
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as i64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/**
 * 计算 dHash：缩到 9x8 灰度，逐行比较相邻像素亮度，得到 64 bit 指纹。
 * 亮度差受整体曝光变化影响小，因此比逐像素比对更稳。
 */
pub fn dhash(path: &str) -> Result<(u64, u32, u32), String> {
    use image::imageops::FilterType;
    let img = image::open(path).map_err(|e| format!("解码失败: {}", e))?;
    let (w, h) = (img.width(), img.height());
    let small = image::imageops::resize(&img, 9, 8, FilterType::Triangle);
    let gray = image::imageops::grayscale(&small);
    let mut hash: u64 = 0;
    for y in 0..8u32 {
        for x in 0..8u32 {
            let left = gray.get_pixel(x, y)[0] as u32;
            let right = gray.get_pixel(x + 1, y)[0] as u32;
            if left > right {
                hash |= 1u64 << (y * 8 + x);
            }
        }
    }
    Ok((hash, w, h))
}

fn hamming(a: u64, b: u64) -> u32 {
    (a ^ b).count_ones()
}

fn skip_dir_name(name: &str) -> bool {
    name.starts_with('.')
        || name == "node_modules"
        || name == "target"
        || name == "dist"
        || name == "__pycache__"
        || name == "vendor"
}

fn collect_images(dir: &Path, out: &mut Vec<PathBuf>, depth: usize) {
    if depth > MAX_DEPTH {
        return;
    }
    let mut read = match fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return,
    };
    while let Some(Ok(item)) = read.next() {
        let p = item.path();
        if p.is_dir() {
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if skip_dir_name(name) {
                continue;
            }
            collect_images(&p, out, depth + 1);
        } else if is_image(&p) {
            out.push(p);
        }
    }
}

/**
 * 扫描目录建立图片哈希索引：指纹未变的文件直接复用缓存，只算新增/改动过的。
 * 进度通过 `img-index-progress {id, done, total, path}` 事件推送。
 * 返回索引中的图片总数。
 */
#[tauri::command]
pub async fn index_images(
    app_handle: tauri::AppHandle,
    req_id: String,
    root: String,
) -> Result<usize, String> {
    let root_path = Path::new(&root);
    if !root_path.exists() {
        return Err(format!("目录不存在: {}", root));
    }
    let mut files: Vec<PathBuf> = Vec::new();
    if root_path.is_dir() {
        collect_images(root_path, &mut files, 0);
    } else if is_image(root_path) {
        files.push(root_path.to_path_buf());
    }
    files.sort();

    let mut index = load_index();
    let total = files.len();
    let mut done = 0usize;
    let mut changed = 0usize;

    for f in &files {
        done += 1;
        let path = f.to_string_lossy().to_string();
        let fp = file_fingerprint(&path);
        if let Some(rec) = index.get(&path) {
            if rec.fingerprint == fp {
                let _ = app_handle.emit(
                    "img-index-progress",
                    IndexProgress { id: req_id.clone(), done, total, path },
                );
                continue;
            }
        }
        match dhash(&path) {
            Ok((hash, w, h)) => {
                index.insert(
                    path.clone(),
                    ImageRecord {
                        name: f
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("")
                            .to_string(),
                        size: fs::metadata(f).map(|m| m.len()).unwrap_or(0),
                        modified: modified_string(f),
                        width: w,
                        height: h,
                        hash,
                        fingerprint: fp,
                        ts: now_secs(),
                        path: path.clone(),
                    },
                );
                changed += 1;
                if changed % PERSIST_EVERY == 0 {
                    save_index(&index);
                }
            }
            Err(e) => {
                // 单张解码失败（损坏 / 不支持的编码）不应中断整批扫描
                eprintln!("[image-index] 跳过 {}: {}", path, e);
            }
        }
        let _ = app_handle.emit(
            "img-index-progress",
            IndexProgress { id: req_id.clone(), done, total, path },
        );
    }

    save_index(&index);
    Ok(index.len())
}

/**
 * 相似分组：汉明距离 ≤ 阈值的图片并查集连通，输出成员数 ≥ 2 的组。
 * 阈值经验值：≤ 6 近乎同一张（缩放/压缩），≤ 10 允许轻度裁剪与水印，> 16 基本是误报。
 */
/**
 * 分组核心（纯函数，便于单测）：汉明距离 ≤ 阈值的记录用并查集连通，
 * 只输出成员数 ≥ 2 的组，按「成员多的优先、其次更像的优先」排序。
 */
pub fn group_records(mut records: Vec<ImageRecord>, t: u32) -> Vec<SimilarGroup> {
    if records.len() < 2 {
        return vec![];
    }
    // 超大库截断：优先保留大图（更可能是要找的重复原件）
    if records.len() > MAX_COMPARE {
        records.sort_by(|a, b| b.size.cmp(&a.size));
        records.truncate(MAX_COMPARE);
    }
    records.sort_by(|a, b| a.path.cmp(&b.path));

    let n = records.len();
    let mut parent: Vec<usize> = (0..n).collect();
    fn find(parent: &mut Vec<usize>, i: usize) -> usize {
        let mut r = i;
        while parent[r] != r {
            r = parent[r];
        }
        let mut c = i;
        while parent[c] != r {
            let next = parent[c];
            parent[c] = r;
            c = next;
        }
        r
    }
    for i in 0..n {
        for j in (i + 1)..n {
            if hamming(records[i].hash, records[j].hash) <= t {
                let a = find(&mut parent, i);
                let b = find(&mut parent, j);
                if a != b {
                    parent[a] = b;
                }
            }
        }
    }

    let mut buckets: HashMap<usize, Vec<ImageRecord>> = HashMap::new();
    for i in 0..n {
        buckets
            .entry(find(&mut parent, i))
            .or_default()
            .push(records[i].clone());
    }

    let mut groups: Vec<SimilarGroup> = buckets
        .into_values()
        .filter(|g| g.len() >= 2)
        .map(|items| {
            let mut max_distance = 0u32;
            for i in 0..items.len() {
                for j in (i + 1)..items.len() {
                    max_distance = max_distance.max(hamming(items[i].hash, items[j].hash));
                }
            }
            SimilarGroup { items, max_distance }
        })
        .collect();
    groups.sort_by(|a, b| {
        b.items
            .len()
            .cmp(&a.items.len())
            .then(a.max_distance.cmp(&b.max_distance))
    });
    groups
}

#[tauri::command]
pub fn find_similar(threshold: Option<u32>) -> Result<Vec<SimilarGroup>, String> {
    let t = threshold.unwrap_or(10).min(64);
    let index = load_index();
    Ok(group_records(index.into_values().collect(), t))
}

/// 读取图片索引（前端展示已索引数量 / 判断是否需要先扫描）
#[tauri::command]
pub fn load_image_index() -> HashMap<String, ImageRecord> {
    load_index()
}

/// 移除指定图片的索引记录（文件被删除 / 移出资料库后调用，避免出现在相似分组里）
#[tauri::command]
pub fn remove_image_records(paths: Vec<String>) -> Result<bool, String> {
    let mut index = load_index();
    for p in paths {
        index.remove(&p);
    }
    save_index(&index);
    Ok(true)
}

/// 清空图片索引（换资料库后重建）
#[tauri::command]
pub fn clear_image_index() -> Result<bool, String> {
    save_index(&HashMap::new());
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_png(path: &Path, w: u32, h: u32, gray: u8) {
        let buf = image::RgbImage::from_pixel(w, h, image::Rgb([gray, gray, gray]));
        buf.save_with_format(path, image::ImageFormat::Png).unwrap();
    }

    #[test]
    fn dhash_is_stable_and_size_invariant() {
        let dir = std::env::temp_dir().join(format!("mdview-img-{}", now_secs()));
        fs::create_dir_all(&dir).unwrap();
        let a = dir.join("a.png");
        let b = dir.join("b.png");
        // 同内容不同尺寸：dHash 先缩到 9x8，因此指纹应完全一致
        write_png(&a, 64, 64, 120);
        write_png(&b, 256, 256, 120);
        let (ha, wa, _hua) = dhash(a.to_str().unwrap()).unwrap();
        let (hb, wb, _hub) = dhash(b.to_str().unwrap()).unwrap();
        assert_eq!(wa, 64);
        assert_eq!(wb, 256);
        assert_eq!(ha, hb, "同图不同尺寸的 dHash 应一致");
        fs::remove_dir_all(&dir).ok();
    }

    fn rec(path: &str, hash: u64) -> ImageRecord {
        ImageRecord {
            path: path.to_string(),
            name: path.to_string(),
            size: 1,
            modified: String::new(),
            width: 8,
            height: 8,
            hash,
            fingerprint: String::new(),
            ts: 0,
        }
    }

    #[test]
    fn groups_only_near_duplicates() {
        // a/b 差 1 bit（同一张图重压缩），c 差 20 bit（完全不同的图）
        let records = vec![rec("a", 0), rec("b", 1), rec("c", 0xFFFFF)];
        let groups = group_records(records, 10);
        assert_eq!(groups.len(), 1, "只有 a/b 应成组");
        assert_eq!(groups[0].items.len(), 2);
        assert_eq!(groups[0].max_distance, 1);
    }

    #[test]
    fn wider_threshold_merges_more() {
        let records = vec![rec("a", 0), rec("b", 0b1111)];
        assert!(group_records(records.clone(), 2).is_empty(), "阈值 2 时不该成组");
        assert_eq!(group_records(records, 4)[0].items.len(), 2);
    }

    #[test]
    fn hamming_distance_behaves() {
        assert_eq!(hamming(0b1010, 0b1010), 0);
        assert_eq!(hamming(0b1010, 0b0101), 4);
        assert_eq!(hamming(u64::MAX, 0), 64);
    }

    #[test]
    fn modified_string_formats() {
        let mut p = std::env::temp_dir();
        p.push(format!("mdview-img-mt-{}.png", now_secs()));
        let mut f = fs::File::create(&p).unwrap();
        f.write_all(b"x").unwrap();
        drop(f);
        let s = modified_string(&p);
        assert!(s.len() == 16, "应为 YYYY-MM-DD HH:MM，实际: {}", s);
        fs::remove_file(&p).ok();
    }
}
