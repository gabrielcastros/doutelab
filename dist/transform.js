import * as THREE from 'three'
import { createArtToolbar } from './art-toolbar.js'

const worldX = 1.36
const worldY = 1.20
const lift = .275

export const transformDefaults = { scale: 100, rotation: 0, x: 0, y: 0, opacity: 100, flip: false, ink: '' }

const clamp = THREE.MathUtils.clamp
const radians = THREE.MathUtils.degToRad
const degrees = THREE.MathUtils.radToDeg

function rotate(x, y, angle) {
  const c = Math.cos(angle), s = Math.sin(angle)
  return new THREE.Vector2(c * x - s * y, s * x + c * y)
}

export function artworkLayout(art) {
  const { width, height } = art.image
  const factor = 1.08 * art.scale / (100 * Math.max(width, height * .75))
  return {
    center: new THREE.Vector2(art.x * worldX / 100, lift + art.y * worldY / 100),
    width: width * factor,
    height: height * factor,
    angle: -radians(art.rotation)
  }
}

const positionBounds = { x: [-112, 112], y: [-115, 100] }

function boundedPosition(center) {
  return {
    x: clamp(center.x * 100 / worldX, ...positionBounds.x),
    y: clamp((center.y - lift) * 100 / worldY, ...positionBounds.y)
  }
}

const wrapAngle = angle => THREE.MathUtils.euclideanModulo(angle + 180, 360) - 180
const vectorAt = (x, y, layout) => rotate(x * layout.width / 2, y * layout.height / 2, layout.angle)

export function createArtTransform({ container, camera, printCenter, getProjectionDepth, getSelection, getArtwork, select, apply, begin, commit }) {
  const overlay = document.getElementById('transform')
  const canvas = document.getElementById('selection')
  const placeToolbar = createArtToolbar(document.getElementById('art-tools'), container)
  const ctx = canvas.getContext('2d')
  const handles = [...overlay.querySelectorAll('.handle')]
  const corners = handles.filter(handle => handle.dataset.gesture === 'scale')
  const [rotateHandle, moveHandle] = handles.slice(-2)
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const point = new THREE.Vector3()
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1))
  let drag = null
  let viewportWidth = 1, viewportHeight = 1, ratio = 1

  function facing(side) {
    const sign = side === 'front' ? 1 : -1
    return sign * camera.position.z / Math.hypot(camera.position.x, camera.position.z) > .48
  }

  function projected(p, side) {
    const sign = side === 'front' ? 1 : -1
    point.set(sign * p.x, p.y + printCenter, sign * getProjectionDepth(side)).project(camera)
    return new THREE.Vector2((point.x * .5 + .5) * viewportWidth, (.5 - point.y * .5) * viewportHeight)
  }

  function toArtPoint(event, side) {
    const { left, top, width, height } = container.getBoundingClientRect()
    const sign = side === 'front' ? 1 : -1
    ndc.set((event.clientX - left) / width * 2 - 1, 1 - (event.clientY - top) / height * 2)
    ray.setFromCamera(ndc, camera)
    plane.constant = -sign * getProjectionDepth(side)
    const hit = ray.ray.intersectPlane(plane, point)
    return hit ? new THREE.Vector2(hit.x * sign, hit.y - printCenter) : null
  }

  function setHandle(handle, position) {
    handle.style.left = position.x + 'px'
    handle.style.top = position.y + 'px'
  }

  function render() {
    const { side, art, preview } = getSelection()
    const visible = !preview && !!art.image && facing(side)
    overlay.hidden = !visible
    if (!visible) {
      placeToolbar(null)
      container.classList.remove('on-art')
      return
    }

    camera.updateMatrixWorld()
    const form = artworkLayout(art)
    const points = corners.map(handle => {
      const p = vectorAt(Number(handle.dataset.x), Number(handle.dataset.y), form).add(form.center)
      const pixel = projected(p, side)
      setHandle(handle, pixel)
      return pixel
    })
    const top = projected(vectorAt(0, 1, form).add(form.center), side)
    const center = projected(form.center, side)
    const outward = top.clone().sub(center).normalize()
    const rotation = top.clone().addScaledVector(outward, 30)
    placeToolbar({
      x: Math.max(...points.map(pixel => pixel.x)),
      y: Math.min(rotation.y, ...points.map(pixel => pixel.y))
    })
    setHandle(rotateHandle, rotation)
    setHandle(moveHandle, center)
    const diagonal = points[2].clone().sub(points[0])
    const slope = Math.abs(diagonal.x) < .01 ? 1 : Math.sign(diagonal.x * diagonal.y)
    corners.forEach((el, index) => {
      el.style.cursor = (index % 2 === 0 ? slope : -slope) > 0 ? 'nwse-resize' : 'nesw-resize'
    })

    ctx.clearRect(0, 0, viewportWidth, viewportHeight)
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (const p of points.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.closePath()
    ctx.moveTo(top.x, top.y)
    ctx.lineTo(rotation.x, rotation.y)
    ctx.strokeStyle = '#261c23cc'
    ctx.lineWidth = 3.2
    ctx.stroke()
    ctx.strokeStyle = '#ff8f72'
    ctx.lineWidth = 1.4
    ctx.stroke()
  }

  function resize(width, height) {
    viewportWidth = width
    viewportHeight = height
    ratio = Math.min(window.devicePixelRatio || 1, 1.7)
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  function inside(point, form) {
    const delta = point.clone().sub(form.center)
    const local = rotate(delta.x, delta.y, -form.angle)
    return Math.abs(local.x) <= form.width / 2 && Math.abs(local.y) <= form.height / 2
  }

  function hitsArtwork(point, form, art) {
    if (!inside(point, form) || art.opacity === 0) return false
    const delta = point.clone().sub(form.center)
    const local = rotate(delta.x, delta.y, -form.angle)
    const u = .5 + (art.flip ? -local.x : local.x) / form.width
    const v = .5 - local.y / form.height
    const x = clamp(Math.floor(u * art.image.width), 0, art.image.width - 1)
    const y = clamp(Math.floor(v * art.image.height), 0, art.image.height - 1)
    return art.image.getContext('2d').getImageData(x, y, 1, 1).data[3] > 8
  }

  function down(event) {
    if (event.button !== 0 || !event.isPrimary || drag || event.target.closest('.art-tools')) return
    const handle = event.target.closest('.handle')
    const selected = getSelection().side
    const side = handle || facing(selected) ? selected : selected === 'front' ? 'back' : 'front'
    const art = getArtwork(side)
    camera.updateMatrixWorld()
    const start = art.image && facing(side) ? toArtPoint(event, side) : null
    const form = start ? artworkLayout(art) : null
    if (!start || (!handle && !hitsArtwork(start, form, art))) {
      select(null)
      return
    }
    select(side)
    if (handle) handle.focus({ preventScroll: true })

    const gesture = handle?.dataset.gesture ?? 'move'
    drag = {
      pointer: event.pointerId, side, gesture, form, start,
      scale: art.scale, rotation: art.rotation, previous: begin(side)
    }
    if (gesture === 'scale') {
      const v = vectorAt(Number(handle.dataset.x), Number(handle.dataset.y), form)
      const corner = form.center.clone().add(v)
      drag.anchor = form.center.clone().sub(v)
      drag.diagonal = v.multiplyScalar(2)
      drag.offset = start.clone().sub(corner)
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    container.setPointerCapture(event.pointerId)
    container.classList.add('dragging-art')
  }

  function move(event) {
    const { side } = getSelection()
    if (!drag) {
      const candidate = facing(side) ? side : side === 'front' ? 'back' : 'front'
      const artwork = getArtwork(candidate)
      const point = artwork.image && facing(candidate) ? toArtPoint(event, candidate) : null
      container.classList.toggle('on-art', Boolean(point && inside(point, artworkLayout(artwork))))
      return
    }
    if (drag.pointer !== event.pointerId || drag.side !== side) return
    const current = toArtPoint(event, side)
    if (!current) return
    const { gesture, form, start } = drag
    if (gesture === 'move') {
      apply(side, boundedPosition(form.center.clone().add(current.sub(start))))
    } else if (gesture === 'scale') {
      const { anchor, diagonal, offset, scale } = drag
      const delta = current.sub(offset).sub(anchor)
      const factor = clamp(delta.dot(diagonal) / diagonal.lengthSq(), 15 / scale, 300 / scale)
      const center = anchor.clone().addScaledVector(diagonal, factor / 2)
      apply(side, { scale: scale * factor, ...boundedPosition(center) })
    } else {
      const a = start.clone().sub(form.center)
      const b = current.sub(form.center)
      if (b.lengthSq() < .00025) return
      const delta = Math.atan2(a.cross(b), a.dot(b))
      const angle = wrapAngle(drag.rotation - degrees(delta))
      apply(side, { rotation: event.shiftKey ? Math.round(angle / 15) * 15 : angle })
    }
    event.stopImmediatePropagation()
  }

  function end(event) {
    if (event && drag?.pointer !== event.pointerId) return
    if (!drag) return
    const { side, previous, pointer } = drag
    drag = null
    if (container.hasPointerCapture(pointer)) container.releasePointerCapture(pointer)
    container.classList.remove('dragging-art')
    if (event?.type === 'pointercancel') apply(side, previous)
    else commit(side, previous)
  }

  container.addEventListener('pointerdown', down, true)
  container.addEventListener('pointermove', move, true)
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    container.addEventListener(type, end, true)
  }

  for (const handle of handles) {
    handle.addEventListener('keydown', event => {
      const delta = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key]
      if (!delta) return
      const { art, side } = getSelection()
      if (!art.image) return
      event.preventDefault()
      const previous = begin(side)
      const amount = event.shiftKey ? 5 : 1
      if (handle.dataset.gesture === 'move') {
        const key = ['ArrowLeft', 'ArrowRight'].includes(event.key) ? 'x' : 'y'
        apply(side, { [key]: clamp(art[key] + delta * amount, ...positionBounds[key]) })
      } else if (handle.dataset.gesture === 'scale') {
        apply(side, { scale: clamp(art.scale + delta * amount, 15, 300) })
      } else {
        apply(side, { rotation: wrapAngle(art.rotation + delta * amount) })
      }
      commit(side, previous)
    })
  }

  return { resize, render, finishGesture: () => end() }
}
