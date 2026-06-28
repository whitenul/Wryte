import { useFileStore } from '../stores/file'
import { useEditorStore } from '../stores/editor'
import { useThemeStore } from '../stores/theme'
import { bold, italic } from './useFormat'
import { showToast } from './useToast'

/** 键盘快捷键组合式函数，返回 init/cleanup 用于挂载与卸载 */
export function useShortcuts() {
  const fileStore = useFileStore()
  const editorStore = useEditorStore()
  const themeStore = useThemeStore()

  async function handler(e: KeyboardEvent) {
    const ctrl = e.ctrlKey || e.metaKey

    // Ctrl+O 打开
    if (ctrl && e.key === 'o') {
      e.preventDefault()
      const opened = await fileStore.open()
      if (opened) editorStore.setMode('normal')
      return
    }
    // Ctrl+S 保存
    if (ctrl && e.key === 's' && !e.shiftKey) {
      e.preventDefault()
      const ok = await fileStore.save()
      if (ok) showToast('已保存')
      return
    }
    // Ctrl+Shift+S 另存为
    if (ctrl && e.shiftKey && e.key === 'S') {
      e.preventDefault()
      await fileStore.saveAs()
      return
    }
    // Ctrl+B 加粗 / Ctrl+I 斜体
    if (ctrl && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault()
      bold()
      return
    }
    if (ctrl && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault()
      italic()
      return
    }
    // Ctrl+/ 切换 normal/source 模式
    if (ctrl && e.key === '/') {
      e.preventDefault()
      editorStore.toggleMode()
      return
    }
    // Ctrl+= 放大字体 / Ctrl+- 缩小字体 / Ctrl+0 重置
    if (ctrl && (e.key === '=' || e.key === '+')) {
      e.preventDefault()
      editorStore.setFontSize(editorStore.fontSize + 1)
      return
    }
    if (ctrl && e.key === '-') {
      e.preventDefault()
      editorStore.setFontSize(editorStore.fontSize - 1)
      return
    }
    if (ctrl && e.key === '0') {
      e.preventDefault()
      editorStore.setFontSize(15)
      return
    }
    // Ctrl+K 切换明暗主题
    if (ctrl && e.key === 'k') {
      e.preventDefault()
      await themeStore.toggle()
      return
    }
  }

  function init() {
    window.addEventListener('keydown', handler)
  }

  function cleanup() {
    window.removeEventListener('keydown', handler)
  }

  return { init, cleanup }
}
