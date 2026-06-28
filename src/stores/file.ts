import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { FileContent } from '../types'

export const useFileStore = defineStore('file', () => {
  const path = ref<string | null>(null)
  const content = ref('')
  const dirty = ref(false)
  const isLoading = ref(false)  // 标记正在加载外部文件，避免 updateListener 误设置 dirty

  const fileName = computed(() => {
    if (!path.value) return '未命名'
    return path.value.split(/[\\/]/).pop() ?? '未命名'
  })

  async function open(): Promise<boolean> {
    const result = await invoke<FileContent | null>('open_file')
    if (result) {
      isLoading.value = true
      path.value = result.path
      content.value = result.content
      dirty.value = false
      // isLoading 在 Editor.vue 的 watch 中更新完成后会被设为 false
      return true
    }
    return false
  }

  async function openPath(filePath: string): Promise<boolean> {
    const result = await invoke<FileContent>('open_file_by_path', { path: filePath })
    isLoading.value = true
    path.value = result.path
    content.value = result.content
    dirty.value = false
    return true
  }

  async function save(): Promise<boolean> {
    if (!path.value) return saveAs()
    await invoke('save_file', { path: path.value, content: content.value })
    dirty.value = false
    return true
  }

  async function saveAs(): Promise<boolean> {
    const newPath = await invoke<string | null>('save_file_as', { content: content.value })
    if (newPath) {
      path.value = newPath
      dirty.value = false
      return true
    }
    return false
  }

  function setContent(value: string) {
    // 外部加载时不设置 dirty
    if (isLoading.value) return
    content.value = value
    dirty.value = true
  }

  function setLoadingComplete() {
    isLoading.value = false
  }

  function reset() {
    path.value = null
    content.value = ''
    dirty.value = false
    isLoading.value = false
  }

  return { path, content, dirty, isLoading, fileName, open, openPath, save, saveAs, setContent, setLoadingComplete, reset }
})
