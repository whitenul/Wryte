<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../stores/editor'
import type { TocItem } from '../types'

const editorStore = useEditorStore()

interface VisibleEntry {
  item: TocItem
  hasChildren: boolean
  collapsed: boolean
}

// 根据 collapsedTocIds 计算可见项，跳过已折叠标题的后代
const visibleToc = computed<VisibleEntry[]>(() => {
  const result: VisibleEntry[] = []
  const collapsedLevels: number[] = []
  const toc = editorStore.toc
  for (let i = 0; i < toc.length; i++) {
    const item = toc[i]
    while (collapsedLevels.length && item.level <= collapsedLevels[collapsedLevels.length - 1]) {
      collapsedLevels.pop()
    }
    if (collapsedLevels.length) continue
    let hasChildren = false
    for (let j = i + 1; j < toc.length; j++) {
      if (toc[j].level <= item.level) break
      hasChildren = true
      break
    }
    const collapsed = editorStore.collapsedTocIds.includes(item.id)
    result.push({ item, hasChildren, collapsed })
    if (collapsed) collapsedLevels.push(item.level)
  }
  return result
})

function jump(item: TocItem) {
  window.dispatchEvent(new CustomEvent('toc-jump', { detail: item.line }))
}
</script>

<template>
  <!-- 大纲侧边栏 -->
  <aside class="toc-sidebar" v-if="editorStore.tocExpanded && editorStore.toc.length" aria-label="大纲导航">
    <div class="toc-header">大纲</div>
    <nav class="toc-list">
      <div
        v-for="entry in visibleToc"
        :key="entry.item.id"
        class="toc-item"
        :class="['toc-level-' + entry.item.level, { active: entry.item.id === editorStore.activeTocId }]"
      >
        <button
          v-if="entry.hasChildren"
          class="toc-toggle"
          :aria-label="entry.collapsed ? '展开' : '折叠'"
          :aria-expanded="!entry.collapsed"
          @click.stop="editorStore.toggleTocCollapse(entry.item.id)"
        >
          {{ entry.collapsed ? '▶' : '▼' }}
        </button>
        <a
          class="toc-link"
          :title="entry.item.text"
          @click="jump(entry.item)"
        >
          {{ entry.item.text }}
        </a>
      </div>
    </nav>
  </aside>
</template>

<style scoped>
.toc-sidebar {
  width: 220px;
  border-right: 1px solid var(--border-color);
  background: var(--bg-secondary);
  overflow-y: auto;
  padding: 12px 0;
  flex-shrink: 0;
}

.toc-header {
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0 16px 8px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 8px;
}

.toc-list {
  display: flex;
  flex-direction: column;
}

.toc-item {
  display: flex;
  align-items: center;
  margin: 0 4px;
  border-radius: calc(var(--radius) - 4px);
  transition: background 0.1s, color 0.1s;
}

.toc-item:hover {
  background: var(--accent-soft);
}

.toc-item.active {
  background: var(--accent-soft);
}

.toc-toggle {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  padding: 0;
  margin-left: 4px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 8px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toc-toggle:hover {
  background: transparent;
  color: var(--accent);
  border: none;
}

.toc-link {
  flex: 1;
  padding: 4px 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toc-item.active .toc-link {
  color: var(--accent);
  font-weight: 500;
}

.toc-level-1 .toc-link { padding-left: 4px; }
.toc-level-2 .toc-link { padding-left: 20px; }
.toc-level-3 .toc-link { padding-left: 36px; }
.toc-level-4 .toc-link { padding-left: 52px; }
.toc-level-5 .toc-link { padding-left: 68px; }
.toc-level-6 .toc-link { padding-left: 84px; }
</style>
