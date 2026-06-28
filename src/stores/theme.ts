import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<'light' | 'dark'>('light')

  function applyTheme(value: 'light' | 'dark') {
    theme.value = value
    document.documentElement.dataset.theme = value
  }

  async function toggle() {
    const next = theme.value === 'light' ? 'dark' : 'light'
    applyTheme(next)
  }

  function init(value: 'light' | 'dark') {
    applyTheme(value)
  }

  return { theme, toggle, init }
})
