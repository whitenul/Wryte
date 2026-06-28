use std::fs;
use std::path::PathBuf;
use crate::models::Config;

/// 获取配置文件路径（exe 同目录）
fn config_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("无法获取 exe 目录")?;
    Ok(dir.join("config.json"))
}

/// 读取配置
///
/// 文件不存在或损坏时返回默认配置。
pub fn read_config() -> Result<Config, String> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(Config::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    match serde_json::from_str::<Config>(&content) {
        Ok(config) => Ok(config),
        Err(_) => {
            // 配置损坏，回退默认并覆盖
            let default = Config::default();
            let _ = write_config(default.clone());
            Ok(default)
        }
    }
}

/// 写入配置
pub fn write_config(config: Config) -> Result<(), String> {
    let path = config_path()?;
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| format!("写入配置失败: {}", e))
}
