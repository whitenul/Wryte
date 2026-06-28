<script setup lang="ts">
import { useFileStore } from '../stores/file'
import { useEditorStore } from '../stores/editor'
import { useThemeStore } from '../stores/theme'
import { showToast } from '../composables/useToast'
import Icon from './Icon.vue'

const fileStore = useFileStore()
const editorStore = useEditorStore()
const themeStore = useThemeStore()

async function handleOpen() {
  const opened = await fileStore.open()
  if (opened) editorStore.setMode('normal')
}

async function handleSave() {
  const ok = await fileStore.save()
  if (ok) showToast('已保存')
}
</script>

<template>
  <!-- 顶部工具栏 -->
  <header class="toolbar" role="toolbar" aria-label="主工具栏">
    <div class="toolbar-group">
      <button class="icon-btn" @click="handleOpen" title="打开 (Ctrl+O)"><Icon name="open" /></button>
      <button class="icon-btn" @click="handleSave" :disabled="!fileStore.dirty" title="保存 (Ctrl+S)"><Icon name="save" /></button>
    </div>
    <div class="toolbar-group">
      <button class="icon-btn" :class="{ active: editorStore.mode === 'normal' }" @click="editorStore.toggleMode" :title="editorStore.mode === 'normal' ? '实时预览 (Ctrl+/)' : '源码模式 (Ctrl+/)'">
        <Icon :name="editorStore.mode === 'normal' ? 'eye' : 'code'" />
      </button>
      <button class="icon-btn" :class="{ active: editorStore.tocExpanded }" @click="editorStore.toggleToc" title="大纲">
        <Icon name="list" />
      </button>
      <button class="icon-btn" :class="{ active: editorStore.showLineNumbers }" @click="editorStore.toggleLineNumbers" title="行号">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="4" height="16" rx="1" />
          <line x1="10" y1="8" x2="20" y2="8" />
          <line x1="10" y1="12" x2="20" y2="12" />
          <line x1="10" y1="16" x2="20" y2="16" />
        </svg>
      </button>
    </div>
    <div class="toolbar-group">
      <button class="icon-btn" @click="themeStore.toggle" title="主题 (Ctrl+K)">
        <Icon :name="themeStore.theme === 'light' ? 'moon' : 'sun'" />
      </button>
    </div>
    <div class="file-name" :class="{ dirty: fileStore.dirty }">
      {{ fileStore.fileName }}{{ fileStore.dirty ? ' •' : '' }}
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-toolbar);
  border-bottom: 1px solid var(--border-color);
}

.toolbar-group {
  display: flex;
  gap: 4px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: calc(var(--radius) - 2px);
  color: var(--text-secondary);
  transition: background 0.18s ease, color 0.18s ease;
}

.icon-btn :deep(svg) {
  width: 22px;
  height: 22px;
}

.icon-btn:hover:not(:disabled) {
  background: var(--accent-soft);
  color: var(--accent);
  border: none;
}

.icon-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.file-name {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-secondary);
}

.file-name.dirty {
  color: var(--accent);
  font-weight: 500;
}
</style>
