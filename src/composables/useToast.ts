import { ref } from 'vue'

interface ToastMsg {
  id: number
  text: string
  type: 'success' | 'error' | 'info'
}

const toasts = ref<ToastMsg[]>([])
let nextId = 0

/** 显示轻量提示，默认 2s 自动消失 */
export function showToast(text: string, type: ToastMsg['type'] = 'success', duration = 2000) {
  const id = nextId++
  toasts.value.push({ id, text, type })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, duration)
}

export function useToast() {
  return { toasts }
}
