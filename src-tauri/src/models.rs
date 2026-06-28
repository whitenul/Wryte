use serde::{Deserialize, Serialize};

/// 文件内容与路径
#[derive(Serialize, Deserialize, Clone)]
pub struct FileContent {
    pub path: String,
    pub content: String,
}

/// 应用配置（便携存储）
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub theme: String,
    pub mode: String,
    pub toc_expanded: bool,
    pub window_width: f64,
    pub window_height: f64,
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    #[serde(default = "default_show_line_numbers")]
    pub show_line_numbers: bool,
}

fn default_font_size() -> u32 {
    15
}

fn default_show_line_numbers() -> bool {
    true
}

impl Default for Config {
    fn default() -> Self {
        Self {
            theme: "light".to_string(),
            mode: "read".to_string(),
            toc_expanded: true,
            window_width: 900.0,
            window_height: 650.0,
            font_size: default_font_size(),
            show_line_numbers: default_show_line_numbers(),
        }
    }
}
