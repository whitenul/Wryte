<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import {
  snapLeftHalf, snapRightHalf,
  snapTopLeft, snapTopRight,
  snapBottomLeft, snapBottomRight,
} from '../composables/useWindowSnap'
import appIconUrl from '../assets/icon.png'

const win = getCurrentWindow()
const isMaximized = ref(false)

// --- 窗口拖动 ---
function handleDrag(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('button')) return
  win.startDragging()
}

function handleDblClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('button')) return
  win.toggleMaximize()
}

// --- 右键系统菜单 ---
const ctxMenuVisible = ref(false)

function showContextMenu(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('button')) return
  e.preventDefault()
  ctxMenuVisible.value = true
}

// --- Snap Layouts ---
// Windows 11: 悬停调用后端模拟 Win+Z 触发系统原生 Snap flyout
// 其他平台: 后端返回 false，fallback 显示自定义 Snap 预设面板
const snapVisible = ref(false)
let snapTimer: ReturnType<typeof setTimeout> | null = null

function onSnapEnter() {
  if (snapTimer) clearTimeout(snapTimer)
  snapTimer = setTimeout(async () => {
    try {
      const triggered = await invoke<boolean>('trigger_snap_layout')
      if (!triggered) snapVisible.value = true
    } catch {
      snapVisible.value = true
    }
  }, 500)
}

function onSnapLeave() {
  if (snapTimer) clearTimeout(snapTimer)
  snapTimer = setTimeout(() => { snapVisible.value = false }, 200)
}

async function applySnap(fn: () => Promise<void>) {
  await fn()
  snapVisible.value = false
}

// --- 全局点击关闭菜单 ---
function onGlobalClick() {
  ctxMenuVisible.value = false
}

// --- 最大化状态同步 ---
async function syncMaximized() {
  isMaximized.value = await win.isMaximized()
}

let unlisten: (() => void) | null = null

onMounted(async () => {
  await syncMaximized()
  unlisten = await win.onResized(syncMaximized)
  window.addEventListener('click', onGlobalClick)
})

onUnmounted(() => {
  unlisten?.()
  window.removeEventListener('click', onGlobalClick)
})
</script>

<template>
  <div class="titlebar" @mousedown="handleDrag" @dblclick="handleDblClick" @contextmenu="showContextMenu">
    <div class="title-left">
      <img class="app-icon" :src="appIconUrl" alt="Wryte" width="16" height="16">
      <span class="title">Wryte</span>
    </div>
    <div class="window-controls">
      <button class="ctrl-btn" @click="win.minimize()" title="最小化" aria-label="最小化">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <div class="snap-wrapper" @mouseenter="onSnapEnter" @mouseleave="onSnapLeave">
        <button class="ctrl-btn" @click="win.toggleMaximize()" :title="isMaximized ? '还原' : '最大化'" :aria-label="isMaximized ? '还原' : '最大化'">
          <svg v-if="isMaximized" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="11" height="11" rx="1" />
            <path d="M5 15V5a1 1 0 0 1 1-1h10" />
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="5" y="5" width="14" height="14" rx="1" />
          </svg>
        </button>
        <!-- Snap Layouts 预设面板 -->
        <div v-if="snapVisible" class="snap-panel" @click.stop>
          <div class="snap-group">
            <button class="snap-btn" title="左半屏" @click="applySnap(snapLeftHalf)">
              <span class="snap-icon left-half" />
            </button>
            <button class="snap-btn" title="右半屏" @click="applySnap(snapRightHalf)">
              <span class="snap-icon right-half" />
            </button>
          </div>
          <div class="snap-group">
            <button class="snap-btn" title="左上" @click="applySnap(snapTopLeft)">
              <span class="snap-icon top-left" />
            </button>
            <button class="snap-btn" title="右上" @click="applySnap(snapTopRight)">
              <span class="snap-icon top-right" />
            </button>
            <button class="snap-btn" title="左下" @click="applySnap(snapBottomLeft)">
              <span class="snap-icon bottom-left" />
            </button>
            <button class="snap-btn" title="右下" @click="applySnap(snapBottomRight)">
              <span class="snap-icon bottom-right" />
            </button>
          </div>
        </div>
      </div>
      <button class="ctrl-btn close" @click="win.close()" title="关闭" aria-label="关闭">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </div>

    <!-- 右键系统菜单 -->
    <div v-if="ctxMenuVisible" class="ctx-menu" @click.stop>
      <button class="ctx-item" @click="win.toggleMaximize(); ctxMenuVisible = false">
        {{ isMaximized ? '还原' : '最大化' }}
      </button>
      <button class="ctx-item" @click="win.minimize(); ctxMenuVisible = false">最小化</button>
      <div class="ctx-sep" />
      <button class="ctx-item danger" @click="win.close()">关闭</button>
    </div>
  </div>
</template>

<style scoped>
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  padding: 0 6px 0 12px;
  background: var(--bg-toolbar);
  border-bottom: 1px solid var(--border-color);
  user-select: none;
  position: relative;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.app-icon {
  display: block;
  border-radius: 2px;
}

.title {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.window-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}

.ctrl-btn {
  width: 36px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  transition: background 0.15s ease, color 0.15s ease;
}

.ctrl-btn:hover {
  background: var(--surface-2);
  color: var(--text-primary);
  border: none;
}

.ctrl-btn.close:hover {
  background: #e81123;
  color: #fff;
}

/* --- Snap Layouts 面板 --- */
.snap-wrapper {
  position: relative;
}

.snap-panel {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  padding: 8px;
  background: var(--bg-toolbar);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px var(--shadow);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.snap-group {
  display: flex;
  gap: 4px;
}

.snap-group:last-child {
  gap: 3px;
}

.snap-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0;
}

.snap-btn:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
}

.snap-icon {
  display: block;
  width: 16px;
  height: 11px;
  background: var(--border-color);
  border-radius: 1px;
  position: relative;
  overflow: hidden;
}

.snap-icon::after {
  content: '';
  position: absolute;
  background: var(--accent);
  border-radius: 1px;
}

.snap-btn:hover .snap-icon {
  background: var(--surface-2);
}

.snap-btn:hover .snap-icon::after {
  opacity: 0.6;
}

.snap-icon.left-half::after { top: 0; left: 0; width: 50%; height: 100%; }
.snap-icon.right-half::after { top: 0; right: 0; width: 50%; height: 100%; }
.snap-icon.top-left::after { top: 0; left: 0; width: 50%; height: 50%; }
.snap-icon.top-right::after { top: 0; right: 0; width: 50%; height: 50%; }
.snap-icon.bottom-left::after { bottom: 0; left: 0; width: 50%; height: 50%; }
.snap-icon.bottom-right::after { bottom: 0; right: 0; width: 50%; height: 50%; }

/* --- 右键菜单 --- */
.ctx-menu {
  position: absolute;
  top: 100%;
  left: 12px;
  margin-top: 2px;
  padding: 4px;
  background: var(--bg-toolbar);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px var(--shadow);
  z-index: 1000;
  min-width: 120px;
}

.ctx-item {
  width: 100%;
  text-align: left;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 13px;
}

.ctx-item:hover {
  background: var(--accent-soft);
  color: var(--accent);
  border: none;
}

.ctx-item.danger:hover {
  background: #e81123;
  color: #fff;
}

.ctx-sep {
  height: 1px;
  background: var(--border-color);
  margin: 2px 0;
}
</style>
