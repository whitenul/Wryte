import type { EditorView } from '@codemirror/view'

let view: EditorView | null = null

/** Editor.vue 挂载/卸载时注册或清除 EditorView 引用 */
export function setEditorView(v: EditorView | null) {
  view = v
}

function dispatchWrap(before: string, after: string = before, placeholder = '') {
  if (!view) return
  const state = view.state
  const sel = state.selection.main
  const selected = state.sliceDoc(sel.from, sel.to)
  const text = selected || placeholder
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: before + text + after },
    selection: { anchor: sel.from + before.length, head: sel.from + before.length + text.length },
  })
  view.focus()
}

function dispatchLinePrefix(prefix: string) {
  if (!view) return
  const state = view.state
  const sel = state.selection.main
  const line = state.doc.lineAt(sel.from)
  const current = line.text
  const has = current.startsWith(prefix)
  const newText = has ? current.slice(prefix.length) : prefix + current
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: newText },
  })
  view.focus()
}

// --- 行内格式 ---
export function bold() { dispatchWrap('**', '**', '粗体') }
export function italic() { dispatchWrap('*', '*', '斜体') }
export function strikethrough() { dispatchWrap('~~', '~~', '删除线') }
export function underline() { dispatchWrap('<u>', '</u>', '下划线') }
export function code() { dispatchWrap('`', '`', '代码') }

// --- 标题 ---
export function heading1() { dispatchLinePrefix('# ') }
export function heading2() { dispatchLinePrefix('## ') }
export function heading3() { dispatchLinePrefix('### ') }

// --- 块级 ---
export function quote() { dispatchLinePrefix('> ') }
export function codeBlock() { dispatchWrap('```\n', '\n```', '代码块') }
export function list() { dispatchLinePrefix('- ') }
export function taskList() { dispatchLinePrefix('- [ ] ') }

// --- 插入 ---
export function link() {
  if (!view) return
  const sel = view.state.selection.main
  const text = view.state.sliceDoc(sel.from, sel.to) || '链接文字'
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: `[${text}](url)` },
    selection: { anchor: sel.from + text.length + 3, head: sel.from + text.length + 6 },
  })
  view.focus()
}

export function image() {
  if (!view) return
  const sel = view.state.selection.main
  const text = view.state.sliceDoc(sel.from, sel.to) || '图片描述'
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: `![${text}](url)` },
    selection: { anchor: sel.from + text.length + 4, head: sel.from + text.length + 7 },
  })
  view.focus()
}

export function table() {
  if (!view) return
  const sel = view.state.selection.main
  const tableText = '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |'
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: tableText },
  })
  view.focus()
}
