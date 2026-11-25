import { compactEditor } from './editor-layout.js'

export function createArtToolbar(element, viewport) {
  const grip = element.querySelector('.tool-grip')
  const dock = document.getElementById('art-tools-dock')
  let anchor
  let offset = { x: 0, y: 0 }
  let position
  let drag

  function layout(target) {
    anchor = target
    element.hidden = !anchor
    if (!anchor || compactEditor.matches) return
    const margin = 8
    const width = element.offsetWidth
    const height = element.offsetHeight
    const proposed = {
      x: anchor.x + 14,
      y: anchor.y - height - 12
    }
    if (proposed.y < margin) proposed.y = anchor.bottom + 12
    position = {
      x: Math.max(margin, Math.min(viewport.clientWidth - width - margin, proposed.x + offset.x)),
      y: Math.max(margin, Math.min(viewport.clientHeight - height - margin, proposed.y + offset.y))
    }
    element.style.left = position.x + 'px'
    element.style.top = position.y + 'px'
    return proposed
  }

  function updateDock() {
    const parent = compactEditor.matches ? dock : viewport
    if (element.parentElement === parent) return
    const focused = element.contains(document.activeElement) ? document.activeElement : null
    drag = undefined
    parent.append(element)
    layout(anchor)
    if (focused && !(compactEditor.matches && focused === grip)) focused.focus({ preventScroll: true })
  }

  updateDock()
  compactEditor.addEventListener('change', updateDock)
  element.addEventListener('pointerdown', event => event.stopPropagation())

  grip.addEventListener('pointerdown', event => {
    if (!anchor || event.button !== 0) return
    event.stopPropagation()
    grip.focus({ preventScroll: true })
    const start = position
    const origin = layout(anchor)
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start, origin, original: offset }
    grip.setPointerCapture(event.pointerId)
  })
  grip.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return
    event.stopPropagation()
    offset = {
      x: drag.start.x - drag.origin.x + event.clientX - drag.x,
      y: drag.start.y - drag.origin.y + event.clientY - drag.y
    }
    layout(anchor)
  })
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    grip.addEventListener(type, event => {
      if (drag?.id !== event.pointerId) return
      if (type === 'pointercancel') offset = drag.original
      drag = undefined
      layout(anchor)
    })
  }
  grip.addEventListener('dblclick', () => {
    offset = { x: 0, y: 0 }
    layout(anchor)
  })
  grip.addEventListener('keydown', event => {
    const vector = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key]
    if (!anchor || (!vector && event.key !== 'Home')) return
    event.preventDefault()
    const origin = layout(anchor)
    offset = vector ? {
      x: position.x - origin.x + vector[0] * 12,
      y: position.y - origin.y + vector[1] * 12
    } : { x: 0, y: 0 }
    layout(anchor)
  })
  return layout
}
