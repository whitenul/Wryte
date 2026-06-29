mod commands;
mod models;

use commands::{config, file, snap};
use models::{Config, FileContent};
use std::path::PathBuf;
use std::sync::Mutex;

static TEMP_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                use tauri::WebviewWindowBuilder;
                use tauri::WebviewUrl;

                let temp_base = std::env::temp_dir();
                let unique_id = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs();
                let temp_dir = temp_base.join(format!("Wryte_temp_{}", unique_id));

                std::fs::create_dir_all(&temp_dir).expect("无法创建临时目录");

                *TEMP_DIR.lock().unwrap() = Some(temp_dir.clone());

                // 创建webview窗口,设置数据目录为临时目录
                let _window = WebviewWindowBuilder::new(
                    app,
                    "main",
                    WebviewUrl::App("index.html".into()),
                )
                .title("Wryte")
                .inner_size(900.0, 650.0)
                .min_inner_size(400.0, 300.0)
                .resizable(true)
                .decorations(false)
                .visible(true)
                .data_directory(temp_dir)
                .build()
                .expect("无法创建窗口");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    #[cfg(target_os = "windows")]
                    {
                        // 清理临时目录
                        let temp_dir = TEMP_DIR.lock().unwrap().clone();
                        if let Some(dir) = temp_dir {
                            std::fs::remove_dir_all(&dir).ok();
                        }

                        // 清理AppData目录(WebView2强制创建的部分)
                        let local_app_data = std::env::var("LOCALAPPDATA").expect("无法获取LOCALAPPDATA");
                        let app_wryte_dir = PathBuf::from(local_app_data).join("app.wryte");
                        if app_wryte_dir.exists() {
                            std::fs::remove_dir_all(&app_wryte_dir).ok();
                        }
                    }
                }
            }
        })
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
