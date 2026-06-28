import { Decoration, WidgetType, EditorView } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { EditorState, StateField } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { marked } from 'marked'
import hljs from 'highlight.js/lib/common'
import katex from 'katex'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { useFileStore } from '../stores/file'
import { useEditorStore } from '../stores/editor'
import { openLightbox } from './useLightbox'

// --- 分割线 widget ---
// wrapper 用 padding 代替 margin，避免 margin collapse 穿透 .cm-line 导致 heightmap 偏移
class HrWidget extends WidgetType {
  constructor(private from: number) { super() }
  eq(other: HrWidget): boolean { return this.from === other.from }
  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span')
    wrapper.className = 'cm-hr-wrapper'
    wrapper.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      view.focus()
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true })
    })
    const hr = document.createElement('hr')
    hr.className = 'cm-hr'
    wrapper.appendChild(hr)
    return wrapper
  }
}

// --- 行内数学公式 widget（KaTeX 渲染）---
class InlineMathWidget extends WidgetType {
  constructor(private tex: string, private from: number) { super() }
  eq(other: InlineMathWidget): boolean {
    return this.tex === other.tex && this.from === other.from
  }
  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-inline-math'
    span.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      view.focus()
      view.dispatch({ selection: { anchor: this.from + 1 }, scrollIntoView: true })
    })
    try {
      katex.render(this.tex, span, { throwOnError: false, displayMode: false })
    } catch {
      span.textContent = this.tex
    }
    return span
  }
}

// --- 块级数学公式 widget（KaTeX 渲染）---
class BlockMathWidget extends WidgetType {
  constructor(
    private tex: string,
    private blockFrom: number,
    private inQuote: boolean = false,
    private calloutType: string | null = null,
  ) { super() }
  eq(other: BlockMathWidget): boolean {
    return this.tex === other.tex && this.blockFrom === other.blockFrom
      && this.inQuote === other.inQuote && this.calloutType === other.calloutType
  }
  toDOM(view: EditorView): HTMLElement {
    const div = document.createElement('div')
    let cls = 'cm-block-math'
    if (this.inQuote) cls += ' cm-widget-in-quote'
    if (this.calloutType) cls += ` cm-widget-in-callout cm-widget-in-callout-${this.calloutType.toLowerCase()}`
    div.className = cls
    div.dataset.blockFrom = String(this.blockFrom)
    div.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      view.focus()
      view.dispatch({ selection: { anchor: this.blockFrom + 1 }, scrollIntoView: true })
    })
    try {
      katex.render(this.tex, div, { throwOnError: false, displayMode: true })
    } catch {
      div.textContent = this.tex
    }
    return div
  }
}

// --- 列表标记 widget（项目符号 / 序号）---
class ListMarkWidget extends WidgetType {
  constructor(private text: string) { super() }
  eq(other: ListMarkWidget): boolean { return this.text === other.text }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-list-mark'
    span.textContent = this.text
    return span
  }
}

// --- 任务列表 checkbox widget ---
class TaskMarkWidget extends WidgetType {
  constructor(private checked: boolean, private pos: number) { super() }
  eq(other: TaskMarkWidget): boolean {
    return this.checked === other.checked && this.pos === other.pos
  }
  toDOM(view: EditorView): HTMLElement {
    const label = document.createElement('label')
    label.className = 'cm-task-mark'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = this.checked
    input.tabIndex = -1
    input.addEventListener('mousedown', (e) => {
      e.preventDefault()
    })
    input.addEventListener('change', () => {
      // 切换 [ ] ↔ [x]
      const newMark = input.checked ? '[x]' : '[ ]'
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 3, insert: newMark },
      })
    })
    label.appendChild(input)
    return label
  }
  ignoreEvent(): boolean { return false }
}

// --- 行内内容渲染：marked + KaTeX 公式支持 ---
function renderInline(text: string): string {
  const parts: string[] = []
  const mathRe = /\$([^\s$][^$]*?[^\s$])\$/g
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = mathRe.exec(text)) !== null) {
    if (m.index > lastIdx) {
      parts.push(markedParseInlineSafe(text.slice(lastIdx, m.index)))
    }
    try {
      const html = katex.renderToString(m[1], { throwOnError: false, displayMode: false })
      parts.push(`<span class="cm-cell-math" contenteditable="false" data-tex="${escapeAttr(m[1])}">${html}</span>`)
    } catch {
      parts.push(m[0])
    }
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < text.length) {
    parts.push(markedParseInlineSafe(text.slice(lastIdx)))
  }
  return parts.join('')
}

function markedParseInlineSafe(s: string): string {
  const placeholders: string[] = []
  const ph = (i: number) => `\x00PH${i}\x00`
  const protect = (html: string) => {
    const i = placeholders.length
    placeholders.push(html)
    return ph(i)
  }
  let t = s
  t = t.replace(/<\/?(?:u|mark|kbd|sup|sub|s|del|br|em|strong|code)\s*\/?>/gi, (m) => protect(m))
  t = t.replace(/==([^=\n]+)==/g, (_, content) => protect(`<mark class="cm-highlight">${content}</mark>`))
  t = t.replace(/\^([^^\s][^^]*?)\^(?!\^)/g, (_, content) => protect(`<sup>${content}</sup>`))
  t = t.replace(/(?<!~)~([^~\s][^~\n]*?)~(?!~)/g, (_, content) => protect(`<sub>${content}</sub>`))
  let result = marked.parseInline(t) as string
  result = result.replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, url, content) => `<span class="cm-link" data-url="${escapeAttr(url)}">${content}</span>`)
  result = result.replace(/\x00PH(\d+)\x00/g, (_, i) => placeholders[Number(i)])
  return result
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// --- 表格 widget（单元格可编辑）---
// 用 wrapper 包裹 table，wrapper 的 padding 代替 margin
class TableWidget extends WidgetType {
  // 记录用户点击的单元格，widget 重建后自动聚焦，避免双击
  static focusedCell: { row: number; col: number } | null = null
  constructor(
    private source: string,
    private blockFrom: number,
    private inQuote: boolean = false,
    private calloutType: string | null = null,
  ) { super() }
  eq(other: TableWidget): boolean {
    return this.source === other.source && this.blockFrom === other.blockFrom
      && this.inQuote === other.inQuote && this.calloutType === other.calloutType
  }
  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div')
    let wrapCls = 'cm-table-wrapper'
    if (this.inQuote) wrapCls += ' cm-widget-in-quote'
    if (this.calloutType) wrapCls += ` cm-widget-in-callout cm-widget-in-callout-${this.calloutType.toLowerCase()}`
    wrapper.className = wrapCls
    const table = document.createElement('table')
    table.className = 'cm-table'
    table.dataset.blockFrom = String(this.blockFrom)
    const lines = this.source.split('\n').filter(l => l.trim())
    let rowIdx = 0
    for (const rawLine of lines) {
      // 移除引用内表格每行开头的 > 标记，避免被当作单元格内容显示
      const line = rawLine.replace(/^>\s?/, '')
      if (/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line)) continue
      const tr = document.createElement('tr')
      if (rowIdx === 0) {
        tr.className = 'cm-table-header'
      } else if (rowIdx % 2 === 0) {
        tr.className = 'cm-table-alt'
      }
      rowIdx++
      const cells = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|')
      for (const cell of cells) {
        const td = document.createElement(tr.className === 'cm-table-header' ? 'th' : 'td')
        td.contentEditable = 'true'
        td.innerHTML = renderInline(cell.trim())
        tr.appendChild(td)
      }
      table.appendChild(tr)
    }
    // mousedown 记录用户点击的单元格位置，blur 后 widget 重建时自动聚焦
    table.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement
      const cell = target.closest('th, td') as HTMLTableCellElement | null
      if (cell) {
        TableWidget.focusedCell = { row: (cell.parentElement as HTMLTableRowElement).rowIndex, col: cell.cellIndex }
      }
    })
    // widget 重建后自动聚焦到用户点击的单元格
    if (TableWidget.focusedCell) {
      const { row, col } = TableWidget.focusedCell
      const rows = table.querySelectorAll('tr')
      const targetRow = rows[row] as HTMLTableRowElement | undefined
      const targetCell = targetRow?.querySelectorAll('th, td')[col] as HTMLElement | undefined
      if (targetCell) {
        requestAnimationFrame(() => {
          // widget 可能已被重新创建，检查节点是否仍在 DOM 中
          if (!targetCell.isConnected) return
          targetCell.focus()
          const selection = window.getSelection()
          const range = document.createRange()
          range.selectNodeContents(targetCell)
          range.collapse(false)
          selection?.removeAllRanges()
          selection?.addRange(range)
        })
      }
      TableWidget.focusedCell = null
    }
    // blur 时同步单元格内容到源码（capture 模式捕获子元素 blur）
    table.addEventListener('blur', () => {
      this.syncToSource(view, table)
    }, true)
    // Ctrl/Cmd+点击链接时用系统浏览器打开
    table.addEventListener('click', (e) => {
      if (!e.ctrlKey && !e.metaKey) return
      const target = e.target as HTMLElement
      const link = target.closest('.cm-link') as HTMLElement | null
      if (!link) return
      const url = link.dataset.url
      if (!url) return
      e.preventDefault()
      e.stopPropagation()
      if (url.startsWith('#')) return
      invoke('open_url', { url })
    })
    wrapper.appendChild(table)
    return wrapper
  }
  // 忽略 widget 内事件，让浏览器处理 contenteditable 编辑
  ignoreEvent(): boolean { return true }
  private syncToSource(view: EditorView, table: HTMLTableElement) {
    const origLines = this.source.split('\n')
    // 检测引用前缀（如 "> "），编辑回写时保留
    const quotePrefix = /^(\s*>\s?)/.exec(origLines[0])?.[1] || ''
    // 保留原始分隔行（含对齐方式），移除引用前缀后匹配
    let separatorLine = '|------|------|'
    for (const line of origLines) {
      const stripped = line.trim().replace(/^>\s?/, '')
      if (/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(stripped)) {
        separatorLine = line
        break
      }
    }
    // 重建表格源码：header + separator + body，保留引用前缀
    const newLines: string[] = []
    const rows = Array.from(table.querySelectorAll('tr'))
    rows.forEach((row, idx) => {
      const cells = Array.from(row.querySelectorAll('th, td'))
      const cellContents = cells.map(c => {
        // 克隆节点，将 KaTeX math spans 还原为 $tex$ 文本，避免 textContent 丢失公式源码
        const clone = c.cloneNode(true) as HTMLElement
        clone.querySelectorAll('.cm-cell-math').forEach(el => {
          const tex = el.getAttribute('data-tex') || ''
          el.replaceWith(document.createTextNode('$' + tex + '$'))
        })
        return ' ' + (clone.textContent || '').trim() + ' '
      })
      newLines.push(quotePrefix + '|' + cellContents.join('|') + '|')
      if (idx === 0) newLines.push(separatorLine)
    })
    const newSource = newLines.join('\n')
    // 内容无变化时不 dispatch，避免不必要的 widget 重建和页面跳动
    if (newSource === this.source) return
    // dispatch 前记录滚动位置，dispatch 后恢复，避免页面跳动
    const scrollTop = view.scrollDOM.scrollTop
    view.dispatch({
      changes: { from: this.blockFrom, to: this.blockFrom + this.source.length, insert: newSource },
    })
    view.scrollDOM.scrollTop = scrollTop
  }
}

// --- 图片 widget ---
// wrapper 用 padding 代替 margin，避免 margin collapse 穿透 .cm-line 导致 heightmap 偏移
class ImageWidget extends WidgetType {
  constructor(private src: string, private alt: string, private from: number) { super() }
  eq(other: ImageWidget): boolean {
    return this.src === other.src && this.alt === other.alt && this.from === other.from
  }
  ignoreEvent(): boolean { return false }
  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span')
    wrapper.className = 'cm-img-wrapper'
    wrapper.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      view.focus()
      view.dispatch({ selection: { anchor: this.from + 1 }, scrollIntoView: true })
    })
    wrapper.addEventListener('dblclick', (e) => {
      e.preventDefault()
      e.stopPropagation()
      openLightbox(this.src)
    })
    const img = document.createElement('img')
    img.src = this.src
    img.alt = this.alt
    img.className = 'cm-img'
    img.draggable = false
    img.addEventListener('load', () => view.requestMeasure())
    wrapper.appendChild(img)
    return wrapper
  }
}

// --- 换行 widget ---
class BrWidget extends WidgetType {
  eq(): boolean { return true }
  toDOM(): HTMLElement { return document.createElement('br') }
}

// --- 空 block widget（用于移除整行，不留空行）---
class NullBlockWidget extends WidgetType {
  eq(): boolean { return true }
  toDOM(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'cm-null-block'
    return el
  }
}

/** HTML 行内标签对应的样式类名 */
function getHtmlTagClass(name: string): string | null {
  switch (name) {
    case 'u': return 'cm-html-u'
    case 'mark': return 'cm-html-mark'
    case 'kbd': return 'cm-html-kbd'
    case 'sup': return 'cm-sup'
    case 'sub': return 'cm-sub'
    case 'em': return 'cm-em'
    case 'strong': return 'cm-strong'
    case 'code': return 'cm-code'
    default: return null
  }
}

// --- 代码块 widget（highlight.js 高亮）---
// 用 wrapper 包裹 pre，wrapper 的 padding 代替 margin，避免 block widget 垂直 margin 不被 heightmap 计入导致光标偏移
class CodeBlockWidget extends WidgetType {
  constructor(
    private source: string,
    private blockFrom: number,
    private inQuote: boolean = false,
    private calloutType: string | null = null,
  ) { super() }
  eq(other: CodeBlockWidget): boolean {
    return this.source === other.source && this.blockFrom === other.blockFrom
      && this.inQuote === other.inQuote && this.calloutType === other.calloutType
  }
  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div')
    let wrapClass = 'cm-codeblock-wrapper'
    if (this.inQuote) wrapClass += ' cm-widget-in-quote'
    if (this.calloutType) wrapClass += ` cm-widget-in-callout cm-widget-in-callout-${this.calloutType.toLowerCase()}`
    wrapper.className = wrapClass
    wrapper.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      view.focus()
      view.dispatch({ selection: { anchor: this.blockFrom + 1 }, scrollIntoView: true })
    })
    const pre = document.createElement('pre')
    pre.className = 'cm-codeblock-widget hljs'
    pre.dataset.blockFrom = String(this.blockFrom)
    const code = document.createElement('code')
    const m = /^\s*(?:>\s?)?```[^\S\n]*(\S*)/m.exec(this.source)
    const lang = m?.[1] || ''
    // 移除每行开头的引用前缀 > ，再提取围栏内容
    const stripped = this.source.split('\n').map(l => l.replace(/^\s*(?:>\s?)?/, '')).join('\n')
    const rawBody = stripped.replace(/^```[^\n]*\n?/, '').replace(/\n?```\s*$/, '')
    const body = rawBody
    if (lang && hljs.getLanguage(lang)) {
      code.className = `language-${lang}`
      code.textContent = body
      pre.appendChild(code)
      hljs.highlightElement(code)
    } else {
      code.className = 'hljs'
      code.innerHTML = hljs.highlightAuto(body).value
      pre.appendChild(code)
    }
    wrapper.appendChild(pre)
    return wrapper
  }
}

// --- mermaid 图表 widget（动态加载 mermaid 异步渲染）---
class MermaidWidget extends WidgetType {
  constructor(
    private source: string,
    private blockFrom: number,
    private inQuote: boolean = false,
    private calloutType: string | null = null,
  ) { super() }
  eq(other: MermaidWidget): boolean {
    return this.source === other.source && this.blockFrom === other.blockFrom
      && this.inQuote === other.inQuote && this.calloutType === other.calloutType
  }
  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div')
    let cls = 'cm-mermaid-wrapper'
    if (this.inQuote) cls += ' cm-widget-in-quote'
    if (this.calloutType) cls += ` cm-widget-in-callout cm-widget-in-callout-${this.calloutType.toLowerCase()}`
    wrapper.className = cls
    wrapper.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      view.focus()
      view.dispatch({ selection: { anchor: this.blockFrom + 1 }, scrollIntoView: true })
    })
    wrapper.textContent = '渲染中…'
    const stripped = this.source.split('\n').map(l => l.replace(/^\s*(?:>\s?)?/, '')).join('\n')
    const body = stripped.replace(/^```mermaid[^\n]*\n?/, '').replace(/\n?```\s*$/, '')
    const isDark = document.documentElement.dataset.theme === 'dark'
    import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' })
      try {
        const id = 'm' + Math.random().toString(36).slice(2, 10)
        const { svg } = await mermaid.render(id, body)
        wrapper.innerHTML = svg
        view.requestMeasure()
      } catch {
        wrapper.textContent = body
      }
    })
    return wrapper
  }
}

interface DecoEntry { from: number; to: number; deco: Decoration }

function replaceMarkWithSpace(state: EditorState, from: number, to: number): { from: number; to: number } {
  let end = to
  const lineEnd = state.doc.lineAt(from).to
  while (end < lineEnd && state.doc.sliceString(end, end + 1) === ' ') {
    end++
  }
  return { from, to: end }
}

function resolveImgSrc(url: string): string {
  let trimmed = url.trim().replace(/^<|>$/g, '')
  if (/^(https?:|data:|asset:|blob:)/.test(trimmed)) return trimmed
  trimmed = trimmed.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(trimmed)) return convertFileSrc(trimmed)
  if (/^\//.test(trimmed)) return convertFileSrc(trimmed)
  const fileStore = useFileStore()
  const filePath = fileStore.path
  if (filePath) {
    const dir = filePath.replace(/[\\/][^\\/]+$/, '').replace(/\\/g, '/')
    // 移除相对路径标记 ./ 和 .，规范化路径
    const normalized = trimmed.replace(/^\.\/|^\.$/, '')
    const abs = dir + '/' + normalized
    return convertFileSrc(abs)
  }
  return trimmed
}

function buildDecorations(state: EditorState): DecorationSet {
  const entries: DecoEntry[] = []
  const headings: { from: number; level: number }[] = []
  // 记录 block widget 覆盖的范围，用于跳过手动图片扫描，避免 decoration 重叠
  const blockRanges: { from: number; to: number }[] = []
  // HTML 行内标签开标签栈，用于匹配闭标签并对内容应用样式
  const htmlTagStack: { name: string; from: number; to: number }[] = []
  // 已匹配的 HTML 标签对列表，遍历结束后统一处理
  const htmlTagPairs: { name: string; openFrom: number; openTo: number; closeFrom: number; closeTo: number }[] = []
  const head = state.selection.main.head

  // 检测指定位置所在行是否在 blockquote 内，返回 callout 类型（null 表示普通引用，undefined 表示不在引用内）
  function getQuoteInfo(pos: number): { inQuote: boolean; calloutType: string | null } {
    const line = state.doc.lineAt(pos)
    if (!/^\s*>/.test(line.text)) return { inQuote: false, calloutType: null }
    // 查找引用块的起始行（向上找不以 > 开头的行或文档开头）
    let firstLine = line.number
    while (firstLine > 1) {
      const prev = state.doc.line(firstLine - 1)
      if (!/^\s*>/.test(prev.text)) break
      firstLine--
    }
    const firstText = state.doc.line(firstLine).text.replace(/^\s*>\s?/, '')
    const calloutMatch = /^\[!(\w+)\]/.exec(firstText)
    return { inQuote: true, calloutType: calloutMatch ? calloutMatch[1] : null }
  }

  // 预扫描所有脚注引用 [^id] 的范围，用于过滤 lezer 错误解析的 Superscript/Link 节点
  const footnoteRefRanges: { from: number; to: number }[] = []
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i)
    const fnRegex = /\[\^(\w+)\]/g
    let m
    while ((m = fnRegex.exec(line.text)) !== null) {
      const defCheck = /^\[\^(\w+)\]:\s/.test(line.text)
      if (defCheck) break
      const from = line.from + m.index
      const to = from + m[0].length
      footnoteRefRanges.push({ from, to })
    }
  }
  function rangeOverlapsFootnote(from: number, to: number): boolean {
    return footnoteRefRanges.some(r => !(to <= r.from || from >= r.to))
  }

  // 跟踪当前是否在"源码模式的代码块"内（即光标在代码块中，显示源码而非 widget）
  // 此时需要跳过代码块内部的所有行内 Markdown 装饰
  let inSourceCodeBlock = false
  let codeBlockFrom = -1
  let codeBlockTo = -1

  syntaxTree(state).iterate({
    enter(node) {
      // 进入 FencedCode 时检查是否显示源码模式
      if (node.name === 'FencedCode') {
        const startLine = state.doc.lineAt(node.from).from
        const endLine = state.doc.lineAt(node.to).to
        const inside = head >= startLine && head <= endLine
        if (inside) {
          inSourceCodeBlock = true
          codeBlockFrom = node.from
          codeBlockTo = node.to
          // 源码模式：添加行背景样式
          let pos = node.from
          while (pos <= node.to) {
            const line = state.doc.lineAt(pos)
            entries.push({ from: line.from, to: line.from, deco: Decoration.line({ class: 'cm-codeblock' }) })
            if (line.to >= node.to) break
            pos = line.to + 1
          }
          return false  // 跳过子节点，避免装饰代码内容
        } else {
          // 渲染模式：用 widget 替换整个块（从行首到行尾，包含引用前缀 >）
          const fullSrc = state.doc.sliceString(startLine, endLine)
          const qi = getQuoteInfo(startLine)
          const langMatch = /^\s*(?:>\s?)?```[^\S\n]*(\S*)/m.exec(fullSrc)
          const lang = langMatch?.[1] || ''
          if (lang.toLowerCase() === 'mermaid') {
            entries.push({ from: startLine, to: endLine, deco: Decoration.replace({ widget: new MermaidWidget(fullSrc, startLine, qi.inQuote, qi.calloutType), block: true }) })
          } else {
            entries.push({ from: startLine, to: endLine, deco: Decoration.replace({ widget: new CodeBlockWidget(fullSrc, startLine, qi.inQuote, qi.calloutType), block: true }) })
          }
          blockRanges.push({ from: startLine, to: endLine })
          return false  // 跳过子节点，不需要内部装饰
        }
      }

      // 在源码模式代码块内，跳过所有其他装饰
      if (inSourceCodeBlock && node.from >= codeBlockFrom && node.from < codeBlockTo) {
        return
      }

      // 脚注引用范围由手动扫描统一处理，跳过 lezer 错误解析的节点
      // Superscript 会将 [^1]...[^note2] 中的两个 ^ 错误配对为 ^...^ 上标
      if (rangeOverlapsFootnote(node.from, node.to)
        && (node.name === 'Superscript' || node.name === 'SuperscriptMark'
          || node.name === 'Subscript' || node.name === 'SubscriptMark'
          || node.name === 'Link' || node.name === 'LinkMark'
          || node.name === 'URL')) {
        return false
      }

      const m = /^ATXHeading(\d)$/.exec(node.name)
      if (m) {
        headings.push({ from: node.from, level: parseInt(m[1]) })
      }

      switch (node.name) {
        case 'HeaderMark':
        case 'QuoteMark': {
          // 聚焦回退：光标在所属块内时显示标记
          const parent = node.node.parent
          if (parent && head >= parent.from && head <= parent.to) break
          const r = replaceMarkWithSpace(state, node.from, node.to)
          entries.push({ from: r.from, to: r.to, deco: Decoration.replace({}) })
          break
        }
        case 'ListMark': {
          const r = replaceMarkWithSpace(state, node.from, node.to)
          const markText = state.doc.sliceString(node.from, node.to)
          const ordered = markText.match(/^(\d+)\.$/)
          const display = ordered ? `${ordered[1]}.` : '•'
          entries.push({ from: r.from, to: r.to, deco: Decoration.replace({ widget: new ListMarkWidget(display) }) })
          break
        }
        case 'TaskMarker': {
          const markText = state.doc.sliceString(node.from, node.to)
          const checked = /^\[\s*x\s*\]$/i.test(markText)
          entries.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget: new TaskMarkWidget(checked, node.from) }) })
          break
        }
        case 'EmphasisMark':
        case 'CodeMark':
        case 'LinkMark':
        case 'StrikethroughMark':
        case 'SubscriptMark':
        case 'SuperscriptMark':
        case 'HighlightMark': {
          // 聚焦回退：光标在所属格式节点内时显示标记，否则隐藏
          const parent = node.node.parent
          if (parent && head >= parent.from && head <= parent.to) break
          entries.push({ from: node.from, to: node.to, deco: Decoration.replace({}) })
          break
        }
        // InlineMathMark 不处理：widget 覆盖 $ 或光标在内时 $ 自然显示
        case 'FootnoteRefMark':
          // 脚注引用改用手动正则扫描处理，lezer 节点跳过
          break
        case 'FootnoteDefMark':
          entries.push({ from: node.from, to: node.to, deco: Decoration.replace({}) })
          break

        case 'InlineMath': {
          // 光标在公式内时不渲染 widget，显示源码可编辑
          if (head >= node.from && head <= node.to) break
          const src = state.doc.sliceString(node.from, node.to)
          const tex = src.slice(1, -1)  // 去掉首尾 $
          entries.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget: new InlineMathWidget(tex, node.from) }) })
          break
        }

        case 'BlockMath': {
          const startLine = state.doc.lineAt(node.from).from
          const endLine = state.doc.lineAt(node.to).to
          const inside = head >= startLine && head <= endLine
          if (!inside) {
            const fullSrc = state.doc.sliceString(startLine, endLine)
            const qi = getQuoteInfo(startLine)
            const stripped = fullSrc.split('\n').map(l => l.replace(/^\s*(?:>\s?)?/, '')).join('\n')
            const lines = stripped.split('\n')
            const tex = lines.slice(1, -1).join('\n')
            entries.push({ from: startLine, to: endLine, deco: Decoration.replace({ widget: new BlockMathWidget(tex, startLine, qi.inQuote, qi.calloutType), block: true }) })
            blockRanges.push({ from: startLine, to: endLine })
            return false
          }
          break
        }

        case 'FootnoteRef':
          // 脚注引用改用手动正则扫描处理，lezer 节点跳过
          break

        case 'FootnoteDef': {
          // 用 block widget 移除整行，不留空行
          const startLine = state.doc.lineAt(node.from).from
          const endLine = state.doc.lineAt(node.to).to
          entries.push({ from: startLine, to: endLine, deco: Decoration.replace({ widget: new NullBlockWidget(), block: true }) })
          blockRanges.push({ from: startLine, to: endLine })
          return false
        }

        case 'StrongEmphasis':
          entries.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-strong' }) })
          break
        case 'Emphasis':
          entries.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-em' }) })
          break
        case 'Strikethrough':
          entries.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-strikethrough' }) })
          break
        case 'Highlight':
          entries.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-highlight' }) })
          break
        case 'Subscript':
          entries.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-sub' }) })
          break
        case 'Superscript':
          entries.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-sup' }) })
          break
        case 'InlineCode':
          entries.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-code' }) })
          break

        case 'ATXHeading1':
        case 'ATXHeading2':
        case 'ATXHeading3':
        case 'ATXHeading4':
        case 'ATXHeading5':
        case 'ATXHeading6': {
          const level = node.name.slice(-1)
          entries.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: `cm-h${level}` }) })
          break
        }

        case 'Blockquote': {
          const firstLine = state.doc.lineAt(node.from).text
          const calloutMatch = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.exec(firstLine)
          const calloutType = calloutMatch ? calloutMatch[1].toUpperCase() : null
          const cursorInside = head >= node.from && head <= node.to
          // 计算 blockquote 内的行数，用于第一行/最后一行样式
          let totalLines = 0
          {
            let p = node.from
            while (p <= node.to) {
              totalLines++
              const ln = state.doc.lineAt(p)
              if (ln.to >= node.to) break
              p = ln.to + 1
            }
          }
          let pos = node.from
          let lineIdx = 0
          while (pos <= node.to) {
            const line = state.doc.lineAt(pos)
            const isFirstCalloutLine = calloutType && lineIdx === 0
            if (isFirstCalloutLine && !cursorInside) {
              entries.push({ from: line.from, to: line.to, deco: Decoration.replace({ widget: new NullBlockWidget(), block: true }) })
              blockRanges.push({ from: line.from, to: line.to })
            } else {
              let lineClass = calloutType
                ? `cm-blockquote cm-callout cm-callout-${calloutType.toLowerCase()}`
                : 'cm-blockquote'
              if (calloutType) {
                const visibleIdx = cursorInside ? lineIdx : lineIdx - 1
                const visibleTotal = cursorInside ? totalLines : totalLines - 1
                if (visibleIdx === 0) lineClass += ' cm-callout-first'
                if (visibleIdx === visibleTotal - 1) lineClass += ' cm-callout-last'
              }
              entries.push({ from: line.from, to: line.from, deco: Decoration.line({ class: lineClass }) })
            }
            if (line.to >= node.to) break
            pos = line.to + 1
            lineIdx++
          }
          break
        }

        case 'Table': {
          const startLine = state.doc.lineAt(node.from).from
          const startLineNum = state.doc.lineAt(node.from).number
          // 扫描表格行，直到非表格行（移除引用前缀 > 后判断），避免引用内表格行未被包含
          let endLineNum = startLineNum
          for (let i = startLineNum; i <= state.doc.lines; i++) {
            const rawText = state.doc.line(i).text.trim()
            if (rawText === '') break
            // 移除引用前缀 > 后再判断是否是表格行
            const text = rawText.replace(/^>\s?/, '')
            if (!text.startsWith('|') && !/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(text)) break
            endLineNum = i
          }
          const endLine = state.doc.line(endLineNum).to
          // 表格始终用 widget 渲染，单元格可编辑，blur 时同步源码
          const src = state.doc.sliceString(startLine, endLine)
          const qi = getQuoteInfo(startLine)
          entries.push({ from: startLine, to: endLine, deco: Decoration.replace({ widget: new TableWidget(src, startLine, qi.inQuote, qi.calloutType), block: true }) })
          blockRanges.push({ from: startLine, to: endLine })
          return false
        }

        case 'Link': {
          // 脚注引用 [^id] 由手动扫描处理，跳过 Link mark 避免冲突
          const linkSrc = state.doc.sliceString(node.from, node.to)
          if (/^\[\^\w+\]$/.test(linkSrc)) break
          entries.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-link' }) })
          break
        }
        case 'URL': {
          const parent = node.node.parent
          if (parent?.name === 'Link') {
            // 光标在 Link 内时显示 URL（聚焦回退），否则隐藏
            if (head >= parent.from && head <= parent.to) break
            entries.push({ from: node.from, to: node.to, deco: Decoration.replace({}) })
          } else if (parent?.name === 'Image') {
            // 图片整体由 Image widget 处理
          } else {
            entries.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-url' }) })
          }
          break
        }
        case 'Image': {
          const src = state.doc.sliceString(node.from, node.to)
          const im = /^!\[([^\]]*)\]\(\s*((?:[^()"']+|"[^"]*"|'[^']*'|\((?:[^()]|\([^()]*\))*\))+)\s*\)$/.exec(src)
          if (im) {
            const inner = im[2].trim()
            let url = inner
            const titlePat = /\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))\s*$/
            const tm = titlePat.exec(inner)
            if (tm) url = inner.slice(0, tm.index).trim()
            entries.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget: new ImageWidget(resolveImgSrc(url), im[1], node.from) }) })
          }
          break
        }
        case 'HTMLTag': {
          const text = state.doc.sliceString(node.from, node.to).trim()
          // <br> 或 <br/>
          if (/^<br\s*\/?>$/i.test(text)) {
            entries.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget: new BrWidget() }) })
            break
          }
          // 开标签 <tag>：压栈（记录完整位置信息），不立即添加 decoration
          const openMatch = /^<(\w+)\s*>$/.exec(text)
          if (openMatch) {
            htmlTagStack.push({ name: openMatch[1].toLowerCase(), from: node.from, to: node.to })
            break
          }
          // 闭标签 </tag>：匹配最近的开标签，记录标签对信息
          const closeMatch = /^<\/(\w+)\s*>$/.exec(text)
          if (closeMatch) {
            const name = closeMatch[1].toLowerCase()
            for (let i = htmlTagStack.length - 1; i >= 0; i--) {
              if (htmlTagStack[i].name === name) {
                const openTag = htmlTagStack[i]
                htmlTagPairs.push({
                  name,
                  openFrom: openTag.from,
                  openTo: openTag.to,
                  closeFrom: node.from,
                  closeTo: node.to,
                })
                htmlTagStack.splice(i, 1)
                break
              }
            }
            break
          }
          // 其他自闭合标签，隐藏
          entries.push({ from: node.from, to: node.to, deco: Decoration.replace({}) })
          break
        }
        case 'HorizontalRule':
          entries.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget: new HrWidget(node.from) }) })
          break
      }
    },
  })

  // 处理 HTML 标签对：光标在标签对内时显示标签源码，否则隐藏标签；内容样式始终应用
  for (const pair of htmlTagPairs) {
    const cursorInside = head >= pair.openFrom && head <= pair.closeTo
    if (!cursorInside) {
      entries.push({ from: pair.openFrom, to: pair.openTo, deco: Decoration.replace({}) })
      entries.push({ from: pair.closeFrom, to: pair.closeTo, deco: Decoration.replace({}) })
    }
    const className = getHtmlTagClass(pair.name)
    if (className) {
      entries.push({ from: pair.openTo, to: pair.closeFrom, deco: Decoration.mark({ class: className }) })
    }
  }
  // 隐藏未匹配的开标签（输入中状态）
  for (const tag of htmlTagStack) {
    entries.push({ from: tag.from, to: tag.to, deco: Decoration.replace({}) })
  }

  // 手动扫描 $$...$$ 块（lezer 解析可能不可靠，作为 fallback）
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i)
    const lineStripped = line.text.replace(/^\s*(?:>\s?)?/, '').trim()
    if (lineStripped !== '$$') continue
    const startLineFrom = line.from
    // 跳过已被 block widget 覆盖的范围（lezer 已解析的 BlockMath）
    if (blockRanges.some(r => startLineFrom >= r.from && startLineFrom <= r.to)) continue

    // 找到结束 $$
    let endLineNum = -1
    for (let j = i + 1; j <= state.doc.lines; j++) {
      const endStripped = state.doc.line(j).text.replace(/^\s*(?:>\s?)?/, '').trim()
      if (endStripped === '$$') {
        endLineNum = j
        break
      }
    }
    if (endLineNum === -1) continue

    const endLine = state.doc.line(endLineNum)
    const endLineTo = endLine.to
    const inside = head >= startLineFrom && head <= endLineTo
    if (!inside) {
      const qi = getQuoteInfo(startLineFrom)
      const fullSrc = state.doc.sliceString(startLineFrom, endLineTo)
      const stripped = fullSrc.split('\n').map(l => l.replace(/^\s*(?:>\s?)?/, '')).join('\n')
      const lines = stripped.split('\n')
      const tex = lines.slice(1, -1).join('\n')
      entries.push({ from: startLineFrom, to: endLineTo, deco: Decoration.replace({ widget: new BlockMathWidget(tex, startLineFrom, qi.inQuote, qi.calloutType), block: true }) })
      blockRanges.push({ from: startLineFrom, to: endLineTo })
    }
    i = endLineNum
  }

  // 手动扫描脚注引用 [^id]：三段式 decoration（隐藏 [^、上标 id、隐藏 ]），互不重叠
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i)
    if (blockRanges.some(r => line.from >= r.from && line.to <= r.to)) continue
    const text = line.text
    // 跳过脚注定义行
    if (/^\[\^(\w+)\]:\s/.test(text)) continue
    const fnRegex = /\[\^(\w+)\]/g
    let match
    while ((match = fnRegex.exec(text)) !== null) {
      const from = line.from + match.index
      const to = from + match[0].length
      // 光标在脚注内时不处理，显示源码可编辑
      if (head >= from && head <= to) continue
      // 隐藏 [^
      entries.push({ from, to: from + 2, deco: Decoration.replace({}) })
      // id 上标样式
      entries.push({ from: from + 2, to: to - 1, deco: Decoration.mark({ class: 'cm-footnote-ref' }) })
      // 隐藏 ]
      entries.push({ from: to - 1, to, deco: Decoration.replace({}) })
    }
  }

  // 手动扫描脚注定义（fallback，确保 lezer 未解析的 [^id]: text 也被移除）
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i)
    if (blockRanges.some(r => line.from >= r.from && line.to <= r.to)) continue
    if (!/^\[\^(\w+)\]:\s/.test(line.text)) continue
    // 跳过已被 FootnoteDef 处理的行
    const covered = entries.some(e => e.from <= line.from && e.to >= line.to)
    if (covered) continue
    entries.push({ from: line.from, to: line.to, deco: Decoration.replace({ widget: new NullBlockWidget(), block: true }) })
    blockRanges.push({ from: line.from, to: line.to })
  }

  // 手动扫描行首 > 引用标记（lezer 在列表内嵌套引用时可能未解析 QuoteMark）
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i)
    if (blockRanges.some(r => line.from >= r.from && line.to <= r.to)) continue
    const m = /^(\s*)>\s?/.exec(line.text)
    if (!m) continue
    const markFrom = line.from + m[1].length
    const markTo = line.from + m[0].length
    // 跳过已被 lezer QuoteMark 处理的位置
    const alreadyProcessed = entries.some(e => e.from <= markFrom && e.to >= markTo)
    if (alreadyProcessed) continue
    // 光标在该行时不隐藏，显示源码可编辑
    if (head >= line.from && head <= line.to) continue
    entries.push({ from: markFrom, to: markTo, deco: Decoration.replace({}) })
  }

  // 手动扫描图片（lezer 无法解析路径含空格的 ![alt](path) 和带标题图片）
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i)
    // 跳过被 block widget 覆盖的行（代码块、表格、数学块），避免 decoration 重叠
    if (blockRanges.some(r => line.from >= r.from && line.to <= r.to)) continue
    const text = line.text
    const imgRegex = /!\[([^\]]*)\]\(((?:[^()"']+|"[^"]*"|'[^']*'|\((?:[^()]|\([^()]*\))*\))+)\)/g
    let match
    while ((match = imgRegex.exec(text)) !== null) {
      const from = line.from + match.index
      const to = from + match[0].length
      const alreadyProcessed = entries.some(e => e.from === from && e.to === to)
      if (!alreadyProcessed) {
        const inner = match[2].trim()
        let url = inner
        const titlePat = /\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))\s*$/
        const tm = titlePat.exec(inner)
        if (tm) url = inner.slice(0, tm.index).trim()
        entries.push({
          from,
          to,
          deco: Decoration.replace({ widget: new ImageWidget(resolveImgSrc(url), match[1], from) })
        })
      }
    }
  }

  // 树形缩进
  headings.sort((a, b) => a.from - b.from)
  let currentLevel = 0
  let hIdx = 0
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i)
    let lineLevel = 0
    if (hIdx < headings.length && headings[hIdx].from >= line.from && headings[hIdx].from <= line.to) {
      lineLevel = headings[hIdx].level
      currentLevel = lineLevel
      hIdx++
    }

    let indent = 0
    if (lineLevel > 0) {
      indent = (lineLevel - 1) * 16
    } else if (currentLevel > 0) {
      indent = (currentLevel - 1) * 16 + 12
    }

    if (indent > 0) {
      entries.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({ attributes: { style: `padding-left: ${indent}px` } }),
      })
    }
  }

  // 移除被 block widget 覆盖的行上的 line decoration，避免与 widget 样式冲突
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.from === e.to && blockRanges.some(r => e.from >= r.from && e.from < r.to)) {
      entries.splice(i, 1)
    }
  }

  entries.sort((a, b) => a.from - b.from || a.to - b.to)
  return Decoration.set(entries.map(e => e.deco.range(e.from, e.to)), true)
}

/** 实时预览扩展 */
export function livePreview() {
  return [
    StateField.define<DecorationSet>({
      create(state) {
        return buildDecorations(state)
      },
      update(deco, tr) {
        if (!tr.docChanged && !tr.selection) {
          const oldTreeLen = syntaxTree(tr.startState).length
          const newTreeLen = syntaxTree(tr.state).length
          if (oldTreeLen === newTreeLen) return deco
        }
        return buildDecorations(tr.state)
      },
      provide: f => EditorView.decorations.from(f)
    }),
    // Ctrl/Cmd+点击链接时用系统默认浏览器打开
    EditorView.domEventHandlers({
      click(e, view) {
        if (!e.ctrlKey && !e.metaKey) return false
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
        if (pos == null) return false
        // 遍历语法树查找包含点击位置的 Link 节点
        const linkInfo: { url: string | null; end: number } = { url: null, end: 0 }
        syntaxTree(view.state).iterate({
          enter(n) {
            if (linkInfo.url) return false
            if (n.name === 'Link' && pos >= n.from && pos <= n.to) {
              linkInfo.end = n.to
              let child = n.node.firstChild
              while (child) {
                if (child.name === 'URL') {
                  linkInfo.url = view.state.doc.sliceString(child.from, child.to)
                  return false
                }
                child = child.nextSibling
              }
            }
          },
        })
        if (linkInfo.url) {
          const u: string = linkInfo.url
          e.preventDefault()
          // 锚点链接：页内跳转到对应标题行
          if (u.startsWith('#')) {
            const anchor = u.slice(1)
            const editorStore = useEditorStore()
            const item = editorStore.toc.find(t => t.id === anchor)
            if (item) {
              const lineNum = Math.min(item.line + 1, view.state.doc.lines)
              const targetLine = view.state.doc.line(lineNum)
              view.dispatch({ selection: { anchor: targetLine.from } })
              window.dispatchEvent(new CustomEvent('toc-jump', { detail: item.line }))
              return true
            }
            return false
          }
          // 外部链接：移动光标离开 Link 避免聚焦回退显示源码，再用系统浏览器打开
          view.dispatch({ selection: { anchor: Math.min(linkInfo.end, view.state.doc.length) } })
          invoke('open_url', { url: u })
          return true
        }
        return false
      },
    }),
  ]
}
