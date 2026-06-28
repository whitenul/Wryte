import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window'
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'

interface MonitorArea {
  x: number
  y: number
  width: number
  height: number
}

async function getWorkArea(): Promise<MonitorArea | null> {
  const monitor = await currentMonitor()
  if (!monitor) return null
  return {
    x: monitor.position.x,
    y: monitor.position.y,
    width: monitor.size.width,
    height: monitor.size.height,
  }
}

/** 应用窗口到指定区域（x, y, w, h 均为物理像素） */
async function snapTo(x: number, y: number, w: number, h: number) {
  const win = getCurrentWindow()
  await win.setFullscreen(false)
  await win.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)))
  await win.setSize(new PhysicalSize(Math.round(w), Math.round(h)))
}

/** 按相对位置吸附：col/row 为 0/1 指定左/右、上/下，colSpan/rowSpan 为占用的格数 */
async function snapGrid(area: MonitorArea, col: number, row: number, colSpan = 1, rowSpan = 1) {
  const cellW = area.width / 2
  const cellH = area.height / 2
  await snapTo(
    area.x + col * cellW,
    area.y + row * cellH,
    cellW * colSpan,
    cellH * rowSpan,
  )
}

export async function snapLeftHalf() {
  const area = await getWorkArea()
  if (area) await snapGrid(area, 0, 0, 1, 2)
}

export async function snapRightHalf() {
  const area = await getWorkArea()
  if (area) await snapGrid(area, 1, 0, 1, 2)
}

export async function snapTopLeft() {
  const area = await getWorkArea()
  if (area) await snapGrid(area, 0, 0)
}

export async function snapTopRight() {
  const area = await getWorkArea()
  if (area) await snapGrid(area, 1, 0)
}

export async function snapBottomLeft() {
  const area = await getWorkArea()
  if (area) await snapGrid(area, 0, 1)
}

export async function snapBottomRight() {
  const area = await getWorkArea()
  if (area) await snapGrid(area, 1, 1)
}
