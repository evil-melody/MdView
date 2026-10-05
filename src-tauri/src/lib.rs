mod commands;
mod config;
mod images;
pub mod office;
mod summary;

use std::sync::Mutex;

use commands::{
    ai_chat_stream, delete_path, index_root, load_config_cmd, read_binary_base64, read_docx_html,
    read_docx_univer, read_file_as_bytes, read_office_md, read_pptx_outline, read_pptx_slide,
    read_pptx_univer, read_text, rename_path,
    replace_pptx_image, save_config_cmd, scan_directory, search_files, toggle_devtools,
    update_pptx_text, write_binary_base64, write_file_bytes, write_office_md, write_text,
};
use images::{
    clear_image_index, find_similar, index_images, load_image_index, remove_image_records,
};
use summary::{clear_summaries, load_summaries, summarize_files};
use tauri::{Emitter, Manager};

/// 冷启动（窗口尚未就绪）期间由系统文件关联触发的打开请求，先缓存，待前端 init 后取走。
struct PendingOpen(Mutex<Vec<String>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingOpen(Mutex::new(Vec::new())))
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            index_root,
            read_text,
            read_binary_base64,
            write_binary_base64,
            toggle_devtools,
            read_office_md,
            write_office_md,
            read_pptx_outline,
            read_pptx_slide,
            read_pptx_univer,
            replace_pptx_image,
            update_pptx_text,
            read_docx_html,
            read_docx_univer,
            read_file_as_bytes,
            write_file_bytes,
            write_text,
            delete_path,
            rename_path,
            search_files,
            load_config_cmd,
            save_config_cmd,
            ai_chat_stream,
            summarize_files,
            load_summaries,
            clear_summaries,
            index_images,
            find_similar,
            load_image_index,
            clear_image_index,
            remove_image_records,
            take_pending_opens,
        ])
        .build(tauri::generate_context!())
        .expect("error while building MdView")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Opened { ref urls } = event {
                // 注意：url.path() 返回 percent-encoded 字符串（中文/空格 → %XX），
                // 直接当文件路径会 os error 2；to_file_path() 才做正确解码
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                if paths.is_empty() {
                    return;
                }
                // 窗口在 build 阶段即已创建，"窗口存在"≠"前端 init 完成"，
                // 仅 emit 会在冷启动时把事件发进空气。改为：一律先入缓冲，
                // 前端 init 后经 take_pending_opens 取走（openTab 按路径去重，
                // 冷热双投递最多激活同一页签，无副作用）；已就绪时再 emit 加速热路径。
                if let Ok(mut g) = app_handle.state::<PendingOpen>().0.lock() {
                    g.extend(paths.clone());
                }
                if app_handle.get_webview_window("main").is_some() {
                    let _ = app_handle.emit("open-file", paths);
                }
            }
            let _ = (&app_handle, &event);
        });
}

/// 前端 init 完成后取走冷启动期间缓存的待打开路径。
#[tauri::command]
fn take_pending_opens(state: tauri::State<PendingOpen>) -> Vec<String> {
    let mut g = state.0.lock().unwrap();
    std::mem::take(&mut *g)
}
