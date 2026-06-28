import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { EditorMode, TocItem } from '../types'

export const useEditorStore = defineStore('editor', () => {
  const mode = ref<EditorMode>('normal')
  const tocExpanded = ref(true)
  const toc = ref<TocItem[]>([])
  const fontSize = ref(15)
  const showLineNumbers = ref(true)
  const activeTocId = ref<string | null>(null)
  const collapsedTocIds = ref<string[]>([])

  function toggleMode() {
    mode.value = mode.value === 'normal' ? 'source' : 'normal'
  }

  function setMode(value: EditorMode) {
    mode.value = value
  }

  function toggleToc() {
    tocExpanded.value = !tocExpanded.value
  }

  function setToc(items: TocItem[]) {
    toc.value = items
  }

  function setFontSize(size: number) {
    fontSize.value = Math.max(10, Math.min(28, size))
  }

  function toggleLineNumbers() {
    showLineNumbers.value = !showLineNumbers.value
  }

  function setActiveTocId(id: string | null) {
    activeTocId.value = id
  }

  function toggleTocCollapse(id: string) {
    const idx = collapsedTocIds.value.indexOf(id)
    if (idx >= 0) collapsedTocIds.value.splice(idx, 1)
    else collapsedTocIds.value.push(id)
  }

  return {
    mode, tocExpanded, toc, fontSize, showLineNumbers, activeTocId, collapsedTocIds,
    toggleMode, setMode, toggleToc, setToc, setFontSize, toggleLineNumbers, setActiveTocId, toggleTocCollapse,
  }
})
