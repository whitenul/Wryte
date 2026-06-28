import { ref } from 'vue'

const lightboxSrc = ref<string | null>(null)

/** 打开图片放大查看 */
export function openLightbox(src: string) {
  lightboxSrc.value = src
}

/** 关闭图片放大 */
export function closeLightbox() {
  lightboxSrc.value = null
}

export function useLightbox() {
  return { lightboxSrc, openLightbox, closeLightbox }
}
