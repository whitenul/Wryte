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
      <button class="icon-btn" @click="handleOpen" title="打开 (Ctrl+O)"><Icon name="open" :size="22" /></button>
      <button class="icon-btn" @click="handleSave" :disabled="!fileStore.dirty" title="保存 (Ctrl+S)"><Icon name="save" :size="22" /></button>
    </div>
    <div class="toolbar-group">
      <button class="icon-btn" :class="{ active: editorStore.mode === 'normal' }" @click="editorStore.toggleMode" :title="editorStore.mode === 'normal' ? '实时预览 (Ctrl+/)' : '源码模式 (Ctrl+/)'">
        <Icon :name="editorStore.mode === 'normal' ? 'eye' : 'code'" :size="22" />
      </button>
      <button class="icon-btn" :class="{ active: editorStore.tocExpanded }" @click="editorStore.toggleToc" title="大纲">
        <Icon name="list" :size="22" />
      </button>
      <button class="icon-btn" :class="{ active: editorStore.showLineNumbers }" @click="editorStore.toggleLineNumbers" title="行号">
        <Icon name="list-numbers" :size="22" />
      </button>
    </div>
    <div class="toolbar-group">
      <button class="icon-btn" @click="themeStore.toggle" title="主题 (Ctrl+K)">
        <Icon :name="themeStore.theme === 'light' ? 'moon' : 'sun'" :size="22" />
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
  transition: background var(--transition-fast), color var(--transition-fast);
}

.icon-btn:hover:not(:disabled) {
  background: var(--accent-soft);
  color: var(--accent);
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
