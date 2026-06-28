<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useFileStore } from '../stores/file'

const fileStore = useFileStore()
const scrollTop = ref(0)
const scrollHeight = ref(0)
const clientHeight = ref(0)

// 中英文混合计数：中文按字，英文按词
const wordCount = computed(() => {
  const text = fileStore.content.trim()
  if (!text) return 0
  const cjk = text.match(/[\u4e00-\u9fa5]/g)?.length ?? 0
  const en = text.replace(/[\u4e00-\u9fa5]/g, ' ').trim().split(/\s+/).filter(Boolean).length
  return cjk + en
})

const lineCount = computed(() => fileStore.content.split('\n').length)

const progress = computed(() => {
  if (scrollHeight.value <= clientHeight.value) return 100
  const max = scrollHeight.value - clientHeight.value
  return Math.min(100, Math.round((scrollTop.value / max) * 100))
})

function handleScroll() {
  const main = document.querySelector('.main-content')
  if (main) {
    scrollTop.value = main.scrollTop
    scrollHeight.value = main.scrollHeight
    clientHeight.value = main.clientHeight
  }
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, true)
  handleScroll()
})

onUnmounted(() => window.removeEventListener('scroll', handleScroll, true))
</script>

<template>
  <!-- 状态栏 -->
  <footer class="status-bar" role="contentinfo" aria-label="状态信息">
    <span>{{ wordCount }} 字</span>
    <span>{{ lineCount }} 行</span>
    <span>{{ progress }}%</span>
    <span class="path" v-if="fileStore.path">{{ fileStore.path }}</span>
  </footer>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 12px;
  background: var(--bg-toolbar);
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-secondary);
}

.path {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}
</style>
