mod commands;
mod models;

use commands::{config, file, snap};
use models::{Config, FileContent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_file,
            open_file_by_path,
            save_file,
            save_file_as,
            save_image,
            read_config,
            write_config,
            trigger_snap_layout,
            open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn open_file(app: tauri::AppHandle) -> Result<Option<FileContent>, String> {
    file::open_file(app).await
}

#[tauri::command]
fn open_file_by_path(path: String) -> Result<FileContent, String> {
    file::open_file_by_path(path)
}

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    file::save_file(path, content)
}

#[tauri::command]
async fn save_file_as(app: tauri::AppHandle, content: String) -> Result<Option<String>, String> {
    file::save_file_as(app, content).await
}

#[tauri::command]
fn save_image(path: String, data: Vec<u8>) -> Result<(), String> {
    file::save_image(path, data)
}

#[tauri::command]
fn read_config() -> Result<Config, String> {
    config::read_config()
}

#[tauri::command]
fn write_config(config: Config) -> Result<(), String> {
    config::write_config(config)
}

#[tauri::command]
fn trigger_snap_layout() -> Result<bool, String> {
    snap::trigger_snap_layout()
}

/// 用系统默认程序打开外部 URL
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
