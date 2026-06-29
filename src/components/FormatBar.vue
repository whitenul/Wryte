<script setup lang="ts">
import {
  bold, italic, strikethrough, underline, code,
  heading1, heading2, heading3,
  quote, codeBlock, list, taskList,
  link, image, table,
} from '../composables/useFormat'
import Icon from './Icon.vue'
</script>

<template>
  <!-- 编辑模式格式化工具栏 -->
  <div class="format-bar" role="toolbar" aria-label="格式化">
    <!-- 行内格式 -->
    <button class="fmt-btn" @click="bold" title="加粗 (Ctrl+B)"><b>B</b></button>
    <button class="fmt-btn" @click="italic" title="斜体 (Ctrl+I)"><i>I</i></button>
    <button class="fmt-btn" @click="strikethrough" title="删除线"><s>S</s></button>
    <button class="fmt-btn" @click="underline" title="下划线"><u>U</u></button>
    <button class="fmt-btn code" @click="code" title="行内代码">&lt;/&gt;</button>
    <span class="sep" />
    <!-- 标题 -->
    <button class="fmt-btn" @click="heading1" title="标题1">H1</button>
    <button class="fmt-btn" @click="heading2" title="标题2">H2</button>
    <button class="fmt-btn" @click="heading3" title="标题3">H3</button>
    <span class="sep" />
    <!-- 块级 -->
    <button class="fmt-btn" @click="quote" title="引用">"</button>
    <button class="fmt-btn code" @click="codeBlock" title="代码块">{ }</button>
    <button class="fmt-btn" @click="list" title="无序列表">•</button>
    <button class="fmt-btn" @click="taskList" title="任务列表">☐</button>
    <span class="sep" />
    <!-- 插入 -->
    <button class="fmt-btn" @click="link" title="链接"><Icon name="link" :size="16" /></button>
    <button class="fmt-btn" @click="image" title="图片">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    </button>
    <button class="fmt-btn" @click="table" title="表格">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="15" y1="3" x2="15" y2="21" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.format-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 10px;
  background: var(--bg-toolbar);
  border-bottom: 1px solid var(--border-color);
}
.fmt-btn {
  min-width: 26px;
  height: 26px;
  padding: 0 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: calc(var(--radius) - 4px);
  color: var(--text-secondary);
  font-size: 13px;
  font-family: "SFMono-Regular", Consolas, monospace;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.fmt-btn:hover {
  background: var(--accent-soft);
  color: var(--accent);
}
.fmt-btn.code { font-size: 11px; }
.sep {
  width: 1px;
  height: 18px;
  background: var(--border-color);
  margin: 0 4px;
}
</style>
