mod commands;
mod config;
pub mod convert;
mod images;
pub mod office;
mod summary;
mod web_import;

use std::sync::Mutex;

use commands::{
    ai_chat_stream, delete_path, index_root, load_config_cmd, read_binary_base64, read_docx_html,
    read_docx_univer, read_file_as_bytes, read_file_range, read_office_md, read_pptx_outline,
    read_pptx_slide, read_pptx_univer, read_text, rename_path,
    replace_pptx_image, save_config_cmd, scan_directory, search_files, toggle_devtools,
    transcode_image, update_pptx_text, write_binary_base64, write_file_bytes, write_office_md, write_text,
};
use convert::commands::{convert_file_format, supported_convert_targets};
use images::{
    clear_image_index, find_similar, index_images, load_image_index, remove_image_records,
};
use summary::{clear_summaries, load_summaries, summarize_files};
use tauri::{Emitter, Manager};

/// 冷启动（窗口尚未就绪）期间由系统文件关联触发的打开请求，先缓存，待前端 init 后取走。
struct PendingOpen(Mutex<Vec<String>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingOpen(Mutex::new(Vec::new())));

    // macOS 默认菜单的 Edit 子菜单含预定义 Undo/Redo：muda 给它们注册原生加速键
    // ⌘Z / ⇧⌘Z / ⌘Y（muda predefined.rs:306）。AppKit 在 performKeyEquivalent: 阶段
    // 先于 WKWebView 派发 JS keydown 截获按键，路由到 NSUndoManager——而本项目三视图
    // 全用自维护 history（XlsxEditor.undoStack / DocxEditor.history / undoShapes），
    // NSUndoManager 一无所知 → 跨 Word/Excel/PPT 一致的撤销失效。
    // 修复：挂自定义菜单，Edit 子菜单只保留 Cut/Copy/Paste/SelectAll 预定义项
    // （原生 selector 对 contenteditable 有效），撤销/重做由 JS 层键盘处理消费。
    #[cfg(target_os = "macos")]
    {
        use tauri::menu::{Menu, PredefinedMenuItem, Submenu};
        builder = builder.menu(|handle| {
            let pkg = handle.package_info().name.clone();
            let app_sub = Submenu::with_items(
                handle,
                pkg,
                true,
                &[
                    &PredefinedMenuItem::about(handle, None, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::services(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::hide(handle, None)?,
                    &PredefinedMenuItem::hide_others(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::quit(handle, None)?,
                ],
            )?;
            // Edit：默认项减去 Undo/Redo（其余 Cut/Copy/Paste/SelectAll 原样保留——
            // 原生 selector 对 WKWebView 输入框/选区有效，且与升级前行为一致）
            let edit_sub = Submenu::with_items(
                handle,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::cut(handle, None)?,
                    &PredefinedMenuItem::copy(handle, None)?,
                    &PredefinedMenuItem::paste(handle, None)?,
                    &PredefinedMenuItem::select_all(handle, None)?,
                ],
            )?;
            let file_sub = Submenu::with_items(
                handle,
                "File",
                true,
                &[&PredefinedMenuItem::close_window(handle, None)?],
            )?;
            let view_sub = Submenu::with_items(
                handle,
                "View",
                true,
                &[&PredefinedMenuItem::fullscreen(handle, None)?],
            )?;
            // Window/Help 沿用默认 id（tao 按 id 识别系统窗口菜单）
            let window_sub = Submenu::with_id_and_items(
                handle,
                tauri::menu::WINDOW_SUBMENU_ID,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(handle, None)?,
                    &PredefinedMenuItem::maximize(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::close_window(handle, None)?,
                ],
            )?;
            let help_sub =
                Submenu::with_id_and_items(handle, tauri::menu::HELP_SUBMENU_ID, "Help", true, &[])?;
            Menu::with_items(handle, &[&app_sub, &file_sub, &edit_sub, &view_sub, &window_sub, &help_sub])
        });
    }

    builder
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
            transcode_image,
            read_file_range,
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
            convert_file_format,
            supported_convert_targets,
            take_pending_opens,
            web_import::import_article_from_url,
            web_import::assets::localize_md_html,
            web_import::assets::localize_html_file,
            web_import::assets::file_fingerprint,
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
