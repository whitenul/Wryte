# Wryte

一款精简的轻量 Markdown 编辑器，基于 Tauri 2 + Vue 3 + Rust。**单文件可执行、零系统残留、U盘即插即用**。

## 特性

- 所见即所得实时预览（CodeMirror 6 Decoration 系统，点击即编辑）
- GFM 警告框（callout）、任务列表、删除线、表格、上标/下标、高亮
- 代码块语法高亮（highlight.js）
- Mermaid 图表、KaTeX 数学公式
- TOC 大纲侧边栏，点击跳转
- 明暗主题切换
- 字数 / 行数 / 阅读进度状态栏
- 便携配置：配置文件写在 exe 同目录的 `config.json`，不写注册表、不污染系统目录
- 未保存关闭确认
- Ctrl+点击链接跳转，普通点击进入源码编辑

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl/Cmd + O | 打开文件 |
| Ctrl/Cmd + S | 保存 |
| Ctrl/Cmd + Shift + S | 另存为 |
| Ctrl/Cmd + / | 切换 编辑/预览 |
| Ctrl/Cmd + K | 切换主题 |
| F11 | 全屏 |

支持 `.md` / `.markdown` / `.txt`。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.x（系统 WebView，无 Chromium） |
| 前端 | Vue 3 + TypeScript + Pinia + Vite |
| Markdown 解析 | marked + lezer-markdown |
| 代码高亮 | highlight.js |
| 编辑器 | CodeMirror 6 |
| 图表/公式 | Mermaid + KaTeX |
| 后端 | Rust |

## 开发

需安装 Node.js、pnpm、Rust 工具链、Tauri 2 前置依赖。

```powershell
pnpm install
pnpm tauri dev
```

## 构建

便携单文件可执行程序（推荐，产物为 `src-tauri/target/release/wryte.exe`）：

```powershell
pnpm tauri build --no-bundle
```

完整打包（含安装器）：

```powershell
pnpm tauri build
```

运行 release 产物后，会在 exe 同目录生成 `config.json`，记录主题、模式、TOC 展开、窗口尺寸。删除该文件即恢复默认配置，无任何系统残留。

## 项目结构

```
src-tauri/src/      Rust 后端（文件 IO + 便携配置）
  ├── commands/     file.rs / config.rs
  ├── models.rs     数据结构
  └── lib.rs        命令注册
src/                Vue 前端
  ├── components/   Toolbar / TocSidebar / Editor / TitleBar / StatusBar
  ├── composables/  useLivePreview / useShortcuts / useLightbox
  └── stores/       theme / file / editor
```
