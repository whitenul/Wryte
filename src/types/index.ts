/** 文件内容与路径 */
export interface FileContent {
  path: string
  content: string
}

/** 应用配置 */
export interface AppConfig {
  theme: 'light' | 'dark'
  mode: 'normal' | 'source'
  tocExpanded: boolean
  windowWidth: number
  windowHeight: number
  fontSize: number
  showLineNumbers: boolean
}

/** TOC 条目 */
export interface TocItem {
  level: number
  text: string
  id: string
  line: number
}

/** 编辑模式：normal=实时预览，source=纯源码 */
export type EditorMode = 'normal' | 'source'
