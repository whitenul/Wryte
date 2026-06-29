<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted, nextTick } from 'vue'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import 'katex/dist/katex.min.css'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { search, searchKeymap, gotoLine } from '@codemirror/search'
import { invoke } from '@tauri-apps/api/core'
import { useFileStore } from '../stores/file'
import { useEditorStore } from '../stores/editor'
import { useThemeStore } from '../stores/theme'
import { setEditorView } from '../composables/useFormat'
import { livePreview } from '../composables/useLivePreview'
import { showToast } from '../composables/useToast'
import { InlineMath, BlockMath, FootnoteRef, FootnoteDef, Highlight } from '../composables/useMarkdownExt'
import FormatBar from './FormatBar.vue'

const fileStore = useFileStore()
const editorStore = useEditorStore()
const themeStore = useThemeStore()
const container = ref<HTMLElement>()
let view: EditorView | null = null

// 动态切换 live preview 扩展，无需重建编辑器
const livePreviewCompartment = new Compartment()

// 行号显示动态切换
const lineNumbersCompartment = new Compartment()

// 光标颜色随主题动态切换，CSS 变量方案在 CM6 中优先级不足，改用 Compartment 硬编码
const cursorCompartment = new Compartment()
function cursorTheme() {
  const color = themeStore.theme === 'dark' ? '#ffffff' : '#2d2a26'
  return EditorView.theme({
    '.cm-cursor': { borderLeft: `1.2px solid ${color} !important` },
  })
}

// CSS 变量驱动主题，明暗切换自动跟随，无需重建编辑器
const cmTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' },
  '.cm-gutters': { backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: 'none' },
  '.cm-content': {
    padding: '56px 64px 120px',
    caretColor: 'var(--cursor-color)',
    fontSize: '16px',
    lineHeight: '1.8',
    fontFamily: 'var(--font-sans)',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-sans)',
    fontSize: '16px',
    lineHeight: '1.8',
  },
  '.cm-activeLine': { backgroundColor: 'var(--surface-2)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--surface-2)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--accent-soft) !important' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--accent-soft) !important' },
  '.cm-panels': { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' },
  '.cm-panels input': { backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' },
  '.cm-searchMatch': { backgroundColor: 'var(--accent-soft)' },
  '.cm-searchMatch-selected': { backgroundColor: 'var(--accent) !important', color: '#fff' },
  '.cm-cursor': { display: 'none !important' },
})

// 词内字符：字母、数字、下划线、中文
const WORD_CHAR_RE = /[\w\u4e00-\u9fa5]/
const isWordChar = (c: string): boolean => c.length === 1 && WORD_CHAR_RE.test(c)

// 通用配对符自动补全
// 无选区：插入 open + close，光标居中
// 有选区：在选区两端包裹 open / close，选区保留
// 已有紧邻的闭符号则跳过（直接移动光标），避免重复插入
// skipInWord：前一个字符是词内字符则跳过（用于 */_/~ 智能补全）
// onlyAtBoundary：前后任一是词内字符都跳过（用于引号等更保守场景）
function insertPair(open: string, close: string, opts?: { skipInWord?: boolean; onlyAtBoundary?: boolean }) {
  return (view: EditorView): boolean => {
    const { from, to } = view.state.selection.main
    if (from === to) {
      const prev = from > 0 ? view.state.sliceDoc(from - 1, from) : ''
      const next = view.state.sliceDoc(to, to + 1)
      if (opts?.skipInWord && isWordChar(prev)) return false
      if (opts?.onlyAtBoundary && (isWordChar(prev) || isWordChar(next))) return false
    }
    if (from === to && view.state.sliceDoc(to, to + close.length) === close) {
      view.dispatch({ selection: { anchor: to + close.length } })
      return true
    }
    if (from === to) {
      view.dispatch({
        changes: { from, to, insert: open + close },
        selection: { anchor: from + open.length },
      })
    } else {
      const selected = view.state.sliceDoc(from, to)
      view.dispatch({
        changes: { from, to, insert: open + selected + close },
        selection: { anchor: from + open.length, head: from + open.length + selected.length },
      })
    }
    return true
  }
}

// Markdown 强调符号智能补全（*/_/~）
// - 词内不补全（避免破坏单词）
// - 紧邻后一个 open 字符则跳过
// - 双侧都有 open：插入 open+open（变成 ****）
// - 单侧有 open：插入单个 open（合并成对）
// - 默认：插入成对，光标居中
function mdEmphasis(open: string) {
  return (view: EditorView): boolean => {
    const { from, to } = view.state.selection.main
    if (from !== to) return false
    const prev = from > 0 ? view.state.sliceDoc(from - 1, from) : ''
    const next = view.state.sliceDoc(to, to + 1)
    if (WORD_CHAR_RE.test(prev)) return false
    if (next === open) {
      view.dispatch({ selection: { anchor: to + 1 } })
      return true
    }
    let insert: string
    if (prev === open && next === open) insert = open + open
    else if (prev === open || next === open) insert = open
    else insert = open + open
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + 1 },
    })
    return true
  }
}

// 跳过一次光标紧邻的闭符号
function skipClose(close: string) {
  return (view: EditorView): boolean => {
    const { head } = view.state.selection.main
    if (view.state.sliceDoc(head, head + 1) === close) {
      view.dispatch({ selection: { anchor: head + 1 } })
      return true
    }
    return false
  }
}

const bracketKeymap = keymap.of([
  // 括号类
  { key: '(', run: insertPair('(', ')') },
  { key: '[', run: insertPair('[', ']') },
  { key: '{', run: insertPair('{', '}') },
  { key: ')', run: skipClose(')') },
  { key: ']', run: skipClose(']') },
  { key: '}', run: skipClose('}') },
  // Markdown 强调（*/_/~ 智能配对）
  { key: '*', run: mdEmphasis('*') },
  { key: '_', run: mdEmphasis('_') },
  { key: '~', run: mdEmphasis('~') },
  // 行内代码 `` ` ``：仅前一个字符是词内字符时跳过（避免破坏单词）
  { key: '`', run: insertPair('`', '`', { skipInWord: true }) },
  // 引号：前后任一是词内字符都跳过，避免破坏缩写（don't）和单词开头（"hello）
  { key: '"', run: insertPair('"', '"', { onlyAtBoundary: true }) },
  { key: "'", run: insertPair("'", "'", { onlyAtBoundary: true }) },
])

function createView() {
  if (!container.value) return
  view = new EditorView({
    state: EditorState.create({
      doc: fileStore.content,
      extensions: [
        history(),
        bracketKeymap,
        keymap.of([{ key: 'Mod-g', run: gotoLine }, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        search(),
        markdown({ base: markdownLanguage, extensions: [InlineMath, BlockMath, FootnoteRef, FootnoteDef, Highlight] }),
        cmTheme,
        cursorCompartment.of(cursorTheme()),
        lineNumbersCompartment.of(editorStore.showLineNumbers ? lineNumbers() : []),
        EditorView.lineWrapping,
        EditorView.scrollMargins.of((view) => {
          const h = view.scrollDOM.clientHeight
          return { top: Math.min(h * 0.3, 180), bottom: Math.min(h * 0.2, 120), left: 0, right: 0 }
        }),
        livePreviewCompartment.of(editorStore.mode === 'normal' ? livePreview() : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            fileStore.setContent(update.state.doc.toString())
          }
        }),
      ],
    }),
    parent: container.value,
  })
  setEditorView(view)
}

// scroll spy：滚动时更新 TOC active 项
let scrollRaf = 0
let scrollSpyDisabled = false
function handleScroll() {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0
    if (!view || scrollSpyDisabled) return
    const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop)
    const lineNum = view.state.doc.lineAt(block.from).number
    const line0 = lineNum - 1
    let active: { id: string } | null = null
    for (const item of editorStore.toc) {
      if (item.line <= line0) active = item
      else break
    }
    editorStore.setActiveTocId(active?.id ?? null)
  })
}

// 粘贴图片：剪贴板图片保存到 md 同目录并插入图片语法
async function handlePaste(e: ClipboardEvent) {
  if (!view || !fileStore.path) return
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (!item.type.startsWith('image/')) continue
    e.preventDefault()
    const blob = item.getAsFile()
    if (!blob) continue
    const buffer = await blob.arrayBuffer()
    const ext = blob.type.split('/')[1]?.split('+')[0] || 'png'
    const fileName = `image-${Date.now()}.${ext}`
    const dir = fileStore.path.replace(/[\\/][^\\/]+$/, '')
    const fullPath = `${dir}/${fileName}`
    try {
      await invoke('save_image', { path: fullPath, data: Array.from(new Uint8Array(buffer)) })
      const insert = `![](./${fileName})`
      const { head } = view.state.selection.main
      view.dispatch({
        changes: { from: head, to: head, insert },
        selection: { anchor: head + insert.length },
      })
      showToast('图片已插入')
    } catch {
      showToast('图片保存失败', 'error')
    }
    return
  }
}

onMounted(() => {
  createView()
  // DOM 布局完成后强制刷新一次 decorations，避免初始渲染时语法树/viewport 未就绪导致 widget 不显示
  nextTick(() => {
    requestAnimationFrame(() => {
      if (view) view.dispatch({})
    })
  })
  view?.scrollDOM.addEventListener('scroll', handleScroll)
  container.value?.addEventListener('paste', handlePaste, true)
})

onUnmounted(() => {
  view?.scrollDOM.removeEventListener('scroll', handleScroll)
  container.value?.removeEventListener('paste', handlePaste, true)
  view?.destroy()
  setEditorView(null)
})

// 外部内容变化时同步（如打开新文件）
watch(() => fileStore.content, (newContent) => {
  if (view && view.state.doc.toString() !== newContent) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newContent },
    })
  }
  if (fileStore.isLoading) {
    fileStore.setLoadingComplete()
  }
})

// 模式切换时重新配置 live preview 扩展
// 切换前后 widget 的增减会让可视行高变化，导致滚动位置漂移，需要保存并恢复
watch(() => editorStore.mode, (mode) => {
  if (!view) return
  const scrollTop = view.scrollDOM.scrollTop
  const anchor = view.state.selection.main.head
  view.dispatch({
    effects: livePreviewCompartment.reconfigure(mode === 'normal' ? livePreview() : []),
  })
  // 等下一帧 layout 完成后再恢复滚动位置
  requestAnimationFrame(() => {
    if (!view) return
    view.scrollDOM.scrollTop = scrollTop
    // 顺手把光标也移回原位，避免被 reconfigure 清掉
    view.dispatch({ selection: { anchor } })
  })
})

// 行号显示切换
watch(() => editorStore.showLineNumbers, (show) => {
  if (!view) return
  view.dispatch({
    effects: lineNumbersCompartment.reconfigure(show ? lineNumbers() : []),
  })
})

// 主题切换时重新配置 cursor 颜色
watch(() => themeStore.theme, () => {
  if (!view) return
  view.dispatch({
    effects: cursorCompartment.reconfigure(cursorTheme()),
  })
})

// 滚动到指定行（0-based），供 TocSidebar 跳转调用
function scrollToLine(line: number) {
  if (!view) return
  // 跳转时临时禁用scroll spy，避免滚动过程中activeId频繁更新导致样式变化
  scrollSpyDisabled = true
  const docLines = view.state.doc.lines
  const oneBased = Math.max(1, Math.min(line + 1, docLines))
  const targetLine = view.state.doc.line(oneBased)
  view.dispatch({
    effects: EditorView.scrollIntoView(targetLine.from, { y: 'start' }),
  })
  view.focus()
  // 300ms后恢复scroll spy
  setTimeout(() => { scrollSpyDisabled = false }, 300)
}

defineExpose({ scrollToLine })
</script>

<template>
  <div class="editor-wrap">
    <FormatBar />
    <div class="editor-center">
      <div class="editor-container" ref="container"></div>
    </div>
  </div>
</template>

<style scoped>
.editor-wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-center {
  flex: 1;
  overflow: hidden;
  display: flex;
  justify-content: center;
  background: var(--bg-primary);
}

.editor-container {
  width: 100%;
  max-width: 1040px;
  height: 100%;
}

.editor-container :deep(.cm-editor) {
  height: 100%;
}

.editor-container :deep(.cm-scroller) {
  overflow: auto;
}

.editor-container :deep(.cm-line) {
  padding: 0;
}

/* --- live preview 渲染样式 --- */
.editor-container :deep(.cm-h1) {
  font-size: 2em;
  font-weight: 800;
  line-height: 1.25;
  margin: 1.2em 0 0.5em;
  padding-bottom: 0.3em;
  border-bottom: 2px solid var(--border-color);
  letter-spacing: -0.01em;
}
.editor-container :deep(.cm-h2) {
  font-size: 1.55em;
  font-weight: 700;
  line-height: 1.3;
  margin: 1.1em 0 0.45em;
  padding-bottom: 0.25em;
  border-bottom: 1px solid var(--border-color);
  letter-spacing: -0.005em;
}
.editor-container :deep(.cm-h3) {
  font-size: 1.28em;
  font-weight: 700;
  line-height: 1.35;
  margin: 1em 0 0.4em;
}
.editor-container :deep(.cm-h4) {
  font-size: 1.12em;
  font-weight: 600;
  margin: 0.9em 0 0.35em;
}
.editor-container :deep(.cm-h5) {
  font-size: 1em;
  font-weight: 600;
  margin: 0.8em 0 0.3em;
}
.editor-container :deep(.cm-h6) {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0.8em 0 0.3em;
}

.editor-container :deep(.cm-strong) { font-weight: 700; }
.editor-container :deep(.cm-em) { font-style: italic; }

.editor-container :deep(.cm-code) {
  font-family: var(--font-mono);
  background: var(--surface-2);
  padding: 0.15em 0.45em;
  border-radius: 5px;
  font-size: 0.87em;
}

.editor-container :deep(.cm-codeblock) {
  font-family: Consolas, "Cascadia Code", "SFMono-Regular", "Courier New", monospace;
  font-size: 0.87em;
  font-weight: 600;
  background: var(--bg-secondary);
  padding-left: 0;
  padding-right: 0;
}

.editor-container :deep(.cm-blockquote) {
  border-left: 4px solid var(--accent);
  padding: 0 16px 0 20px;
  color: var(--text-secondary);
  font-style: normal;
  background: var(--callout-note-bg);
}
.editor-container :deep(.cm-blockquote-first) {
  padding-top: 12px;
  border-radius: 0 8px 0 0;
}
.editor-container :deep(.cm-blockquote-last) {
  padding-bottom: 12px;
  border-radius: 0 0 8px 0;
}
.editor-container :deep(.cm-blockquote-first.cm-blockquote-last) {
  border-radius: 0 8px 8px 0;
}

.editor-container :deep(.cm-link) {
  color: var(--accent);
  text-decoration: none;
  cursor: pointer;
}
.editor-container :deep(.cm-url) {
  color: var(--text-secondary);
  font-size: 0.85em;
}

.editor-container :deep(.cm-hr-wrapper) {
  display: inline-block;
  padding: 24px 0;
  width: 100%;
  vertical-align: top;
}
.editor-container :deep(.cm-hr) {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-color), transparent);
  margin: 0;
}

/* --- 行内数学公式 --- */
.editor-container :deep(.cm-inline-math) {
  font-family: var(--font-serif);
  font-style: italic;
}

/* --- 块级数学公式 --- */
.editor-container :deep(.cm-block-math) {
  text-align: center;
  overflow-x: auto;
  padding: 20px 0;
}

/* --- 脚注引用 --- */
.editor-container :deep(.cm-footnote-ref) {
  color: var(--accent);
  font-size: 0.85em;
  vertical-align: super;
}

/* --- 空 block widget（脚注定义占位）--- */
.editor-container :deep(.cm-null-block) {
  height: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

/* --- 列表标记（项目符号 / 序号）--- */
.editor-container :deep(.cm-list-mark) {
  display: inline-block;
  width: 1.4em;
  margin-left: -1.4em;
  color: var(--text-secondary);
  text-align: center;
}

/* --- 删除线 --- */
.editor-container :deep(.cm-strikethrough) {
  text-decoration: line-through;
  color: var(--text-secondary);
}

/* --- 任务列表 checkbox --- */
.editor-container :deep(.cm-task-mark) {
  display: inline-block;
  width: 1.4em;
  margin-left: -1.4em;
  text-align: center;
  vertical-align: middle;
}
.editor-container :deep(.cm-task-mark input[type="checkbox"]) {
  -webkit-appearance: none;
  appearance: none;
  width: 15px;
  height: 15px;
  border: 1.5px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  cursor: pointer;
  vertical-align: middle;
  position: relative;
  transition: background 0.15s, border-color 0.15s;
}
.editor-container :deep(.cm-task-mark input[type="checkbox"]:hover) {
  border-color: var(--accent);
}
.editor-container :deep(.cm-task-mark input[type="checkbox"]:checked) {
  background: var(--accent);
  border-color: var(--accent);
}
.editor-container :deep(.cm-task-mark input[type="checkbox"]:checked::after) {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 4px;
  height: 8px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

/* --- 下标和上标 --- */
.editor-container :deep(.cm-sub) {
  font-size: 0.75em;
  vertical-align: sub;
  line-height: 0;
}
.editor-container :deep(.cm-sup) {
  font-size: 0.75em;
  vertical-align: super;
  line-height: 0;
}

/* --- HTML 行内标签 --- */
.editor-container :deep(.cm-html-u) { text-decoration: underline; }
.editor-container :deep(.cm-html-mark) { background: var(--highlight-bg); padding: 0 2px; border-radius: 2px; }
.editor-container :deep(.cm-html-kbd) {
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 2px 6px;
}

/* --- 表格 --- */
.editor-container :deep(.cm-table-wrapper) {
  padding: 24px 0;
  margin: 0;
}
.editor-container :deep(.cm-table) {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.95em;
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid var(--border-color);
}
.editor-container :deep(.cm-table th),
.editor-container :deep(.cm-table td) {
  border: 1px solid var(--border-color);
  padding: 8px 14px;
  text-align: left;
  caret-color: var(--cursor-color);
  outline: none;
}
.editor-container :deep(.cm-table th:focus),
.editor-container :deep(.cm-table td:focus) {
  background: var(--surface-2);
  box-shadow: inset 0 0 0 2px var(--accent);
}
.editor-container :deep(.cm-table .cm-table-header th) {
  background: var(--bg-secondary);
  font-weight: 600;
}
.editor-container :deep(.cm-table .cm-table-alt) {
  background: var(--surface-2);
}

/* --- 图片 --- */
.editor-container :deep(.cm-img-wrapper) {
  display: inline-block;
  padding: 24px 0;
  margin: 0;
  vertical-align: top;
}
.editor-container :deep(.cm-img) {
  max-width: 100%;
  display: block;
  margin: 0;
  border-radius: var(--radius);
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

/* --- 代码块 widget（highlight.js）--- */
.editor-container :deep(.cm-codeblock-wrapper) {
  padding: 24px 0;
  margin: 0;
}
.editor-container :deep(.cm-codeblock-widget) {
  background: var(--bg-secondary);
  padding: 16px 18px;
  border-radius: 0 0 var(--radius) var(--radius);
  overflow-x: auto;
  font-family: Consolas, "Cascadia Code", "SFMono-Regular", "Courier New", monospace;
  font-size: 0.87em;
  font-weight: 600;
  line-height: 1.7;
  border: 1px solid var(--border-color);
  border-top: none;
  margin: 0;
  transition: max-height 0.25s ease;
}
/* 折叠状态：仅显示前 10 行，渐隐收尾 */
.editor-container :deep(.cm-codeblock-widget.cm-codeblock-folded) {
  max-height: calc(1.7em * 10 + 32px);
  position: relative;
}
.editor-container :deep(.cm-codeblock-widget.cm-codeblock-folded::after) {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 48px;
  background: linear-gradient(to bottom, transparent, var(--bg-secondary));
  pointer-events: none;
}
.editor-container :deep(.cm-codeblock-widget code) {
  background: none;
  padding: 0;
}
.editor-container :deep(.cm-codeblock-widget .hljs) { color: var(--text-primary); }
.editor-container :deep(.cm-codeblock-widget .hljs-comment) { color: var(--code-comment); font-style: italic; }
.editor-container :deep(.cm-codeblock-widget .hljs-quote) { color: var(--code-comment); font-style: italic; }
.editor-container :deep(.cm-codeblock-widget .hljs-keyword) { color: var(--code-keyword); }
.editor-container :deep(.cm-codeblock-widget .hljs-selector-tag) { color: var(--code-keyword); }
.editor-container :deep(.cm-codeblock-widget .hljs-type) { color: var(--code-keyword); }
.editor-container :deep(.cm-codeblock-widget .hljs-string) { color: var(--code-string); }
.editor-container :deep(.cm-codeblock-widget .hljs-attr) { color: var(--code-string); }
.editor-container :deep(.cm-codeblock-widget .hljs-template-tag) { color: var(--code-string); }
.editor-container :deep(.cm-codeblock-widget .hljs-number) { color: var(--code-number); }
.editor-container :deep(.cm-codeblock-widget .hljs-literal) { color: var(--code-number); }
.editor-container :deep(.cm-codeblock-widget .hljs-variable) { color: var(--code-variable); }
.editor-container :deep(.cm-codeblock-widget .hljs-title) { color: var(--code-title); font-weight: 600; }
.editor-container :deep(.cm-codeblock-widget .hljs-section) { color: var(--code-title); font-weight: 600; }
.editor-container :deep(.cm-codeblock-widget .hljs-built_in) { color: var(--code-keyword); }
.editor-container :deep(.cm-codeblock-widget .hljs-name) { color: var(--code-keyword); }
.editor-container :deep(.cm-codeblock-widget .hljs-tag) { color: var(--code-keyword); }
.editor-container :deep(.cm-codeblock-widget .hljs-attribute) { color: var(--code-title); }
.editor-container :deep(.cm-codeblock-widget .hljs-meta) { color: var(--code-comment); }

/* --- Typora 风格代码块头部：始终可见 --- */
.editor-container :deep(.cm-codeblock-header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-bottom: none;
  border-radius: var(--radius) var(--radius) 0 0;
  font-size: 0.78em;
  user-select: none;
  transition: background 0.15s ease;
}
.editor-container :deep(.cm-codeblock-wrapper:hover .cm-codeblock-header) {
  background: var(--surface-2);
}
.editor-container :deep(.cm-codeblock-wrapper:focus-within .cm-codeblock-header) {
  border-color: var(--accent);
}
.editor-container :deep(.cm-codeblock-lang-group) {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
}
.editor-container :deep(.cm-codeblock-dot) {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.05);
}
.editor-container :deep(.cm-codeblock-lang) {
  text-transform: lowercase;
}
.editor-container :deep(.cm-codeblock-actions) {
  display: flex;
  align-items: center;
  gap: 4px;
}
.editor-container :deep(.cm-codeblock-fold),
.editor-container :deep(.cm-codeblock-copy) {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 0.95em;
  font-family: inherit;
  transition: background 0.15s ease, color 0.15s ease;
}
.editor-container :deep(.cm-codeblock-fold:hover),
.editor-container :deep(.cm-codeblock-copy:hover) {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-primary);
}
.editor-container :deep(.cm-codeblock-copy-done) {
  color: var(--success-color);
}

/* --- 高亮 ==text== --- */
.editor-container :deep(.cm-highlight) {
  background: var(--highlight-bg, #fef08a);
  padding: 0.1em 0.25em;
  border-radius: 3px;
}

/* --- 表格内数学公式 --- */
.editor-container :deep(.cm-cell-math) {
  display: inline-block;
  cursor: pointer;
  border-radius: 3px;
  padding: 0 2px;
  transition: background 0.15s;
}
.editor-container :deep(.cm-cell-math:hover) {
  background: var(--bg-hover, rgba(0, 0, 0, 0.05));
}
.editor-container :deep(.cm-cell-math-editing) {
  background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  outline: 1px dashed var(--accent);
  outline-offset: 1px;
  cursor: text;
}
.editor-container :deep(.cm-cell-mark-editing) {
  font-style: normal !important;
  font-weight: normal !important;
  text-decoration: none !important;
  background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  outline: 1px dashed var(--accent);
  outline-offset: 1px;
  cursor: text;
  font-family: var(--font-mono);
}
.editor-container :deep(.cm-cell-image) {
  max-width: 100%;
  max-height: 80px;
  vertical-align: middle;
  cursor: pointer;
  border-radius: 4px;
}
.editor-container :deep(.cm-cell-image-editing) {
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  outline: 1px dashed var(--accent);
  outline-offset: 1px;
  padding: 1px 4px;
  border-radius: 3px;
  cursor: text;
  display: inline-block;
  word-break: break-all;
}

/* --- GFM 警告框 callout --- */
.editor-container :deep(.cm-callout) {
  padding: 0 16px 0 20px;
  font-style: normal;
}
.editor-container :deep(.cm-callout-first) {
  padding-top: 14px;
  border-radius: 0 8px 0 0;
}
.editor-container :deep(.cm-callout-last) {
  padding-bottom: 14px;
  border-radius: 0 0 8px 0;
}
.editor-container :deep(.cm-callout-first.cm-callout-last) {
  border-radius: 0 8px 8px 0;
}
.editor-container :deep(.cm-callout-note) {
  border-left-color: var(--callout-note-border);
  background: var(--callout-note-bg);
}
.editor-container :deep(.cm-callout-tip) {
  border-left-color: var(--callout-tip-border);
  background: var(--callout-tip-bg);
}
.editor-container :deep(.cm-callout-important) {
  border-left-color: var(--callout-important-border);
  background: var(--callout-important-bg);
}
.editor-container :deep(.cm-callout-warning) {
  border-left-color: var(--callout-warning-border);
  background: var(--callout-warning-bg);
}
.editor-container :deep(.cm-callout-caution) {
  border-left-color: var(--callout-caution-border);
  background: var(--callout-caution-bg);
}
.editor-container :deep(.cm-callout-title) {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 0.92em;
  padding: 2px 0 6px;
  color: var(--text-primary);
  user-select: none;
}
.editor-container :deep(.cm-callout-icon) {
  font-size: 1.05em;
  line-height: 1;
}
.editor-container :deep(.cm-callout-type) {
  letter-spacing: 0.02em;
}
.editor-container :deep(.cm-callout-title-note) { color: var(--callout-note-border); }
.editor-container :deep(.cm-callout-title-tip) { color: var(--callout-tip-border); }
.editor-container :deep(.cm-callout-title-important) { color: var(--callout-important-border); }
.editor-container :deep(.cm-callout-title-warning) { color: var(--callout-warning-border); }
.editor-container :deep(.cm-callout-title-caution) { color: var(--callout-caution-border); }

/* --- mermaid 图表 --- */
.editor-container :deep(.cm-mermaid-wrapper) {
  padding: 16px 0;
  text-align: center;
  overflow-x: auto;
}
.editor-container :deep(.cm-mermaid-wrapper svg) {
  max-width: 100%;
  height: auto;
}

/* block widget 在引用内时，自身模拟引用边框和缩进（widget 替换整行后 line decoration 不显示） */
.editor-container :deep(.cm-widget-in-quote) {
  border-left: 4px solid var(--accent);
  padding-left: 20px;
  padding-right: 16px;
  background: var(--callout-note-bg);
}
.editor-container :deep(.cm-widget-in-callout) {
  padding-left: 16px;
  padding-right: 16px;
}
.editor-container :deep(.cm-widget-in-callout-note) {
  border-left-color: var(--callout-note-border);
  background: var(--callout-note-bg);
}
.editor-container :deep(.cm-widget-in-callout-tip) {
  border-left-color: var(--callout-tip-border);
  background: var(--callout-tip-bg);
}
.editor-container :deep(.cm-widget-in-callout-important) {
  border-left-color: var(--callout-important-border);
  background: var(--callout-important-bg);
}
.editor-container :deep(.cm-widget-in-callout-warning) {
  border-left-color: var(--callout-warning-border);
  background: var(--callout-warning-bg);
}
.editor-container :deep(.cm-widget-in-callout-caution) {
  border-left-color: var(--callout-caution-border);
  background: var(--callout-caution-bg);
}

/* 引用内 block widget 文字色重置 */
.editor-container :deep(.cm-blockquote .cm-codeblock-widget),
.editor-container :deep(.cm-blockquote .cm-table-wrapper),
.editor-container :deep(.cm-blockquote .cm-block-math),
.editor-container :deep(.cm-blockquote .cm-mermaid-wrapper) {
  color: var(--text-primary);
  font-style: normal;
}

/* 列表项间距 */
.editor-container :deep(.cm-list-mark) {
  color: var(--text-secondary);
}

/* 段落间距：通过空行高度控制段落呼吸感 */
.editor-container :deep(.cm-line:empty) {
  min-height: 0.4em;
}
</style>
