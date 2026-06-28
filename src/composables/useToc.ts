import type { TocItem } from '../types'

/** 移除常见 markdown 行内标记，用于 TOC 显示与 id 生成 */
function stripInlineMarks(text: string): string {
  return text.replace(/[*_`~\[\]]/g, '').trim()
}

/** 生成锚点 id，保留中文与单词字符 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

/**
 * 从 Markdown 源码提取标题大纲
 *
 * @param content - Markdown 原文
 * @returns 标题条目数组，line 为 0-based 源码行号
 */
export function extractToc(content: string): TocItem[] {
  const lines = content.split('\n')
  const toc: TocItem[] = []
  const re = /^(#{1,6})\s+(.+?)\s*#*\s*$/
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re)
    if (m) {
      const level = m[1].length
      const text = stripInlineMarks(m[2])
      toc.push({ level, text, id: slugify(text), line: i })
    }
  }
  return toc
}
