mod commands;
mod config;
pub mod office;

use std::sync::Mutex;

use commands::{
    ai_chat_stream, delete_path, index_root, load_config_cmd, read_binary_base64, read_docx_html,
    read_file_as_bytes, read_office_md, read_pptx_outline, read_pptx_slide, read_text, rename_path,
    replace_pptx_image, save_config_cmd, scan_directory, search_files, toggle_devtools,
    update_pptx_text, write_binary_base64, write_office_md, write_text,
};
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
            replace_pptx_image,
            update_pptx_text,
            read_docx_html,
            read_file_as_bytes,
            write_text,
            delete_path,
            rename_path,
            search_files,
            load_config_cmd,
            save_config_cmd,
            ai_chat_stream,
            take_pending_opens,
        ])
        .build(tauri::generate_context!())
        .expect("error while building MdView")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Opened { ref urls } = event {
                let paths: Vec<String> = urls.iter().map(|u| u.path().to_string()).collect();
                if paths.is_empty() {
                    return;
                }
                // 主窗口已就绪 → 直接广播给前端 open-file 监听器
                if app_handle.get_webview_window("main").is_some() {
                    let _ = app_handle.emit("open-file", paths);
                } else {
                    // 冷启动：窗口尚未创建，缓存待前端 init 后取走（避免事件丢失）
                    if let Ok(mut g) = app_handle.state::<PendingOpen>().0.lock() {
                        g.extend(paths);
                    }
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
