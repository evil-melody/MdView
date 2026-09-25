mod commands;
mod config;
pub mod office;

use commands::{
    ai_chat_stream, delete_path, index_root, load_config_cmd, read_binary_base64, read_office_md,
    read_text, rename_path, save_config_cmd, scan_directory, search_files, toggle_devtools,
    write_binary_base64, write_office_md, write_text,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            index_root,
            read_text,
            read_binary_base64,
            write_binary_base64,
            toggle_devtools,
            read_office_md,
            write_office_md,
            write_text,
            delete_path,
            rename_path,
            search_files,
            load_config_cmd,
            save_config_cmd,
            ai_chat_stream,
        ])
        .build(tauri::generate_context!())
        .expect("error while building MdView")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { ref urls } = event {
                use tauri::Emitter;
                let paths: Vec<String> = urls
                    .iter()
                    .map(|u| u.path().to_string())
                    .collect();
                let _ = app_handle.emit("open-file", paths);
            }
            let _ = (&app_handle, &event);
        });
}
