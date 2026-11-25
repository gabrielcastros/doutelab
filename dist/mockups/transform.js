import { layerSize } from './render.js'
import { clamp } from './state.js'

const radians = degrees => degrees * Math.PI / 180
const degrees = radians => radians * 180 / Math.PI
const wrap = angle => ((angle + 180) % 360 + 360) % 360 - 180

export function photoSelection(layer, width, height) {
  const [w, h] = layerSize(layer, width, height)
  const angle = radians(layer.rotation)
  return {
    x: layer.x * width, y: layer.y * height,
    vector(x, y) {
      const dx = x * w / 2, dy = y * h / 2
      return {
        x: dx * Math.cos(angle) - dy * Math.sin(angle),
        y: dx * Math.sin(angle) + dy * Math.cos(angle)
      }
    }
  }
}

export function photoGesture(layer, kind, start, width, height, corner) {
  const form = photoSelection(layer, width, height)
  const initial = Math.atan2(start.y - form.y, start.x - form.x)
  const v = corner ? form.vector(corner.x, corner.y) : null
  return (point, shift) => {
    if (kind === 'scale') {
      const factor = clamp(1 + ((point.x - start.x) * v.x + (point.y - start.y) * v.y) /
        (2 * (v.x * v.x + v.y * v.y)), .01 / layer.w, 1.5 / layer.w)
      return {
        w: layer.w * factor,
        x: clamp((form.x + v.x * (factor - 1)) / width, 0, 1),
        y: clamp((form.y + v.y * (factor - 1)) / height, 0, 1)
      }
    }
    if (kind === 'rotate') {
      const dx = point.x - form.x, dy = point.y - form.y
      if (Math.hypot(dx, dy) < 3) return null
      const angle = layer.rotation + degrees(Math.atan2(dy, dx) - initial)
      return { rotation: wrap(shift ? Math.round(angle / 15) * 15 : angle) }
    }
    return {
      x: clamp(layer.x + (point.x - start.x) / width, 0, 1),
      y: clamp(layer.y + (point.y - start.y) / height, 0, 1)
    }
  }
}
