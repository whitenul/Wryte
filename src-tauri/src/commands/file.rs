use std::fs;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use crate::models::FileContent;

/// 支持的文件扩展名
const SUPPORTED_EXTENSIONS: &[&str] = &["md", "markdown", "txt"];

/// 打开文件对话框并读取内容
///
/// 用户取消时返回 Ok(None)。
pub async fn open_file(app: AppHandle) -> Result<Option<FileContent>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("Markdown", SUPPORTED_EXTENSIONS)
        .blocking_pick_file();

    match path {
        Some(file_path) => {
            let path_str = file_path.to_string();
            let content = fs::read_to_string(&path_str)
                .map_err(|e| format!("读取文件失败: {}", e))?;
            Ok(Some(FileContent { path: path_str, content }))
        }
        None => Ok(None),
    }
}

/// 保存内容到指定路径
pub fn save_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("保存文件失败: {}", e))
}

/// 按指定路径读取文件（用于拖放打开）
///
/// 路径扩展名必须在 SUPPORTED_EXTENSIONS 内。
pub fn open_file_by_path(path: String) -> Result<FileContent, String> {
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    if !SUPPORTED_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("不支持的文件类型: .{}", ext));
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("读取文件失败: {}", e))?;
    Ok(FileContent { path, content })
}

/// 另存为对话框并保存
pub async fn save_file_as(app: AppHandle, content: String) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md"])
        .set_file_name("untitled.md")
        .blocking_save_file();

    match path {
        Some(file_path) => {
            let path_str = file_path.to_string();
            fs::write(&path_str, &content).map_err(|e| format!("保存文件失败: {}", e))?;
            Ok(Some(path_str))
        }
        None => Ok(None),
    }
}

/// 保存图片二进制数据到指定路径
///
/// 用于编辑器粘贴图片功能，自动创建父目录。
pub fn save_image(path: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    fs::write(&path, data).map_err(|e| format!("保存图片失败: {}", e))
}
