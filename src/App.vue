<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import Toolbar from './components/Toolbar.vue'
import TitleBar from './components/TitleBar.vue'
import TocSidebar from './components/TocSidebar.vue'
import Editor from './components/Editor.vue'
import StatusBar from './components/StatusBar.vue'
import Icon from './components/Icon.vue'
import { useThemeStore } from './stores/theme'
import { useEditorStore } from './stores/editor'
import { useFileStore } from './stores/file'
import { useShortcuts } from './composables/useShortcuts'
import { useToast } from './composables/useToast'
import { useLightbox } from './composables/useLightbox'
import { extractToc } from './composables/useToc'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { confirm } from '@tauri-apps/plugin-dialog'
import type { AppConfig } from './types'

const themeStore = useThemeStore()
const editorStore = useEditorStore()
const fileStore = useFileStore()
const editorRef = ref<InstanceType<typeof Editor>>()

const { init: initShortcuts, cleanup: cleanupShortcuts } = useShortcuts()
const { toasts } = useToast()
const { lightboxSrc, closeLightbox } = useLightbox()

let configSaveTimer: ReturnType<typeof setTimeout> | null = null

async function loadConfig() {
  const config = await invoke<AppConfig>('read_config')
  themeStore.init(config.theme)
  // 旧配置兼容：read→normal，edit→source
  const legacyMode = config.mode as string
  const mode = legacyMode === 'edit' ? 'source' : legacyMode === 'read' ? 'normal' : config.mode
  editorStore.setMode(mode)
  if (!config.tocExpanded) editorStore.toggleToc()
  editorStore.setFontSize(config.fontSize)
  if (editorStore.showLineNumbers !== config.showLineNumbers) editorStore.toggleLineNumbers()
}

// TOC 提取放在 App 层，与 Editor 挂载解耦
watch(() => fileStore.content, (content) => {
  editorStore.setToc(extractToc(content))
}, { immediate: true })

function handleTocJump(e: Event) {
  const line = (e as CustomEvent).detail as number
  editorRef.value?.scrollToLine(line)
}

async function persistConfig() {
  if (configSaveTimer) clearTimeout(configSaveTimer)
  configSaveTimer = setTimeout(async () => {
    const win = getCurrentWindow()
    const size = await win.innerSize()
    await invoke('write_config', {
      config: {
        theme: themeStore.theme,
        mode: editorStore.mode,
        tocExpanded: editorStore.tocExpanded,
        windowWidth: size.width,
        windowHeight: size.height,
        fontSize: editorStore.fontSize,
        showLineNumbers: editorStore.showLineNumbers,
      },
    })
  }, 800)
}

// 监听变化持久化
watch(
  [() => themeStore.theme, () => editorStore.mode, () => editorStore.tocExpanded,
   () => editorStore.fontSize, () => editorStore.showLineNumbers],
  persistConfig
)

const SUPPORTED_DROP_EXT = ['.md', '.markdown', '.txt']

async function handleDrop(paths: string[]) {
  const mdFile = paths.find(p =>
    SUPPORTED_DROP_EXT.some(ext => p.toLowerCase().endsWith(ext))
  )
  if (!mdFile) return

  if (fileStore.dirty) {
    const confirmed = await confirm('当前文件未保存，确定要打开新文件吗？')
    if (!confirmed) return
  }

  try {
    await fileStore.openPath(mdFile)
  } catch (e) {
    console.error('拖放打开失败:', e)
  }
}

let unlistenDragDrop: (() => void) | null = null

onMounted(async () => {
  await loadConfig()
  initShortcuts()
  window.addEventListener('toc-jump', handleTocJump)

  const win = getCurrentWindow()

  unlistenDragDrop = await win.onDragDropEvent((event) => {
    if (event.payload.type === 'drop') {
      handleDrop(event.payload.paths)
    }
  })

  win.onCloseRequested(async (event) => {
    if (fileStore.dirty) {
      event.preventDefault()
      const confirmed = await confirm('当前文件未保存，确定要关闭吗？')
      if (confirmed) await win.destroy()
    }
  })
})

onUnmounted(() => {
  cleanupShortcuts()
  window.removeEventListener('toc-jump', handleTocJump)
  unlistenDragDrop?.()
})
</script>

<template>
  <div class="app">
    <!-- 自定义标题栏 -->
    <TitleBar />
    <!-- 顶部工具栏 -->
    <Toolbar />
    <div class="body">
      <!-- 目录侧边栏（手动开关） -->
      <TocSidebar />
      <!-- 主内容区 -->
      <main class="main-content">
        <div v-if="!fileStore.path" class="empty-state">
          <Icon name="read" :size="64" />
          <p>暂无打开的文件</p>
          <p class="hint">按 Ctrl+O 打开 Markdown 文件</p>
        </div>
        <Editor v-if="fileStore.path" ref="editorRef" />
      </main>
    </div>
    <!-- 底部状态栏 -->
    <StatusBar />
    <!-- 轻量提示 -->
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div v-for="t in toasts" :key="t.id" class="toast" :class="'toast-' + t.type">
          {{ t.text }}
        </div>
      </TransitionGroup>
    </div>
    <!-- 图片放大查看 -->
    <div v-if="lightboxSrc" class="lightbox" @click="closeLightbox">
      <img :src="lightboxSrc" class="lightbox-img" />
    </div>
  </div>
</template>

<style>
@import './styles/theme.css';

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  background: var(--bg-primary);
}

.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-secondary);
}
.empty-state p { font-size: 14px; }
.empty-state .hint { font-size: 12px; opacity: 0.7; }
.empty-state svg { opacity: 0.4; }

/* --- 轻量提示 --- */
.toast-container {
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 9999;
  pointer-events: none;
}
.toast {
  padding: 8px 16px;
  background: var(--text-primary);
  color: var(--bg-primary);
  border-radius: var(--radius);
  font-size: 13px;
  box-shadow: 0 4px 12px var(--shadow);
}
.toast-success { background: var(--accent); color: #fff; }
.toast-error { background: #dc2626; color: #fff; }
.toast-enter-active, .toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from, .toast-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* --- 图片放大查看 --- */
.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  cursor: zoom-out;
  animation: lightbox-fade 0.2s ease;
}
.lightbox-img {
  max-width: 92vw;
  max-height: 92vh;
  border-radius: 4px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}
@keyframes lightbox-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
