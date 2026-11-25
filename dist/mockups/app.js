import { bindShortcuts, describeHandleKeys } from '../shortcuts.js'
import { categories, views, styles, catalog } from './catalog.js'
import {
  finishes, lights, shadows, formats, clamp, exportSize, newProject, createHistory,
  selectedLayer, addLayer, editLayer, duplicateLayer, deleteLayer, moveLayer,
  printAreaOf, rectBetween, validateProject, imageData
} from './state.js'
import { canvasOf, canvasBlob, asDataURL, localImage, loadImage, download, projectLimit } from './files.js'
import { paintScene, preparePhoto, hitsLayer, layerPoint } from './render.js'
import { photoSelection, photoGesture } from './transform.js'
import { createArtToolbar } from '../art-toolbar.js'
import { readArtwork, starterArtworkFile } from '../artwork.js'
import { takeTransfer } from '../mockup-transfer.js'
import { bindInspector, compactEditor } from '../editor-layout.js'

const $ = id => document.getElementById(id)
const canvas = $('scene-canvas')
const overlay = $('selection-canvas')
const stack = $('canvas-stack')
const stage = $('drop-stage')
const zoomButton = $('preview-zoom')
const setInspectorOpen = bindInspector($('mockup-editor'))
const handleBox = $('photo-handles')
const handles = [...handleBox.querySelectorAll('.handle')]
const corners = handles.filter(handle => handle.dataset.gesture === 'scale')
const [rotateHandle, moveHandle] = handles.slice(-2)
const placeToolbar = createArtToolbar($('art-tools'), stage)
const artImages = new Map()
const scenes = new Map(catalog.map(scene => [scene.id, scene]))
const drafts = new Map()
const sceneImages = new WeakMap()
let active, resources, project, history, previewMap, frame
let busy = false
let guides = true
let areaMode = null
let gesture
let pending
let repaint = 0

function status(message, error = false) {
  const line = $($('mockup-editor').hidden ? 'library-status' : 'status')
  line.textContent = message
  line.classList.toggle('error', error)
}

function withLock(callback) {
  if (busy) return
  busy = true
  return Promise.resolve().then(callback).catch(error => {
    status(error.message, true)
  }).finally(() => { busy = false })
}

function options(select, values) {
  for (const [value, label] of Object.entries(values)) select.add(new Option(label, value))
}

function selectValues(id, values, all) {
  if (all) $(id).add(new Option(all, ''))
  for (const value of values) $(id).add(new Option(value, value))
}

options($('finish'), finishes)
options($('format'), formats)
for (const [field, values, all] of [
  ['category', categories, 'Todas as peças'], ['view', views, 'Todas as vistas'], ['style', styles, 'Todas']
]) {
  selectValues('filter-' + field, values, all)
  selectValues('photo-' + field, values)
  $('filter-' + field).addEventListener('change', renderCatalog)
}

for (const [group, values] of [['light', lights], ['shadow', shadows]]) {
  for (const [value, label] of Object.entries(values)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.value = value
    button.textContent = label
    button.addEventListener('click', () => { if (project) commit({ ...project, [group]: value }) })
    $(group + '-options').append(button)
  }
}

function renderCatalog() {
  const list = $('catalog')
  list.replaceChildren()
  const filters = ['category', 'view', 'style'].map(field => [field, $('filter-' + field).value])
  for (const scene of scenes.values()) {
    if (!filters.every(([field, value]) => !value || scene[field] === value)) continue
    const button = document.createElement('button')
    button.className = 'scene-card'
    button.type = 'button'
    button.dataset.sceneId = scene.id
    const thumb = new Image()
    thumb.loading = 'lazy'
    thumb.alt = ''
    thumb.src = scene.photo
    const description = document.createElement('span')
    const name = document.createElement('strong')
    name.textContent = scene.name
    const subtitle = document.createElement('small')
    subtitle.textContent = scene.view + ' · ' + scene.style
    description.append(name, subtitle)
    button.append(thumb, description)
    button.addEventListener('click', () => withLock(() => openScene(scene)))
    list.append(button)
  }
  if (!list.childElementCount) {
    const empty = document.createElement('div')
    empty.className = 'empty-catalog'
    const message = document.createElement('p')
    message.className = 'muted'
    message.setAttribute('role', 'status')
    message.textContent = 'Nenhuma foto com estes filtros.'
    const reset = document.createElement('button')
    reset.type = 'button'
    reset.textContent = 'Limpar filtros'
    reset.addEventListener('click', () => {
      for (const [field] of filters) $('filter-' + field).value = ''
      renderCatalog()
      $('filter-category').focus()
    })
    empty.append(message, reset)
    list.append(empty)
  }
}

function photoMap(images, longSide) {
  const { photo, mask } = images
  const scale = longSide / Math.max(photo.width, photo.height)
  return {
    ...preparePhoto(photo, mask, Math.max(1, Math.round(photo.width * scale)), Math.max(1, Math.round(photo.height * scale))),
    concrete: images.concrete
  }
}

let concrete
let starter
const exampleLayers = new Set()
async function prepareScene(scene) {
  if (sceneImages.has(scene)) return sceneImages.get(scene)
  concrete ??= loadImage(new URL('./assets/concrete-202l.webp', import.meta.url))
  const [photo, mask, background] = await Promise.all([
    loadImage(scene.photo), scene.mask ? loadImage(scene.mask) : null, concrete
  ])
  if (mask && Math.abs(photo.width / photo.height - mask.width / mask.height) > .015) {
    throw new Error('A máscara precisa ter o mesmo enquadramento e proporção da foto.')
  }
  const images = { photo, mask, concrete: background }
  sceneImages.set(scene, images)
  return images
}

async function activate(scene, saved, loaded, addStarter) {
  if (active?.id === scene.id && !saved) return
  const images = loaded ?? await prepareScene(scene)
  const map = photoMap(images, 720)
  const fresh = !saved && !drafts.has(scene.id)
  const defaultArt = fresh && addStarter ? await (starter ??= starterArtworkFile().then(prepareArtwork)) : null
  if (project) {
    finishAdjustment()
    drafts.set(active.id, { project, history })
  }
  const draft = drafts.get(scene.id)
  active = scene
  resources = images
  previewMap = map
  project = saved ?? draft?.project ?? newProject(scene)
  if (defaultArt) {
    project = appendArtwork(project, defaultArt)
    exampleLayers.add(project.selected)
    project = { ...project, selected: null }
  }
  history = saved ? createHistory() : draft?.history ?? createHistory()
  $('shadow-adjustments').open = false
  zoomButton.setAttribute('aria-pressed', 'false')
  gesture = undefined
  setAreaMode(null)
  preview(true)
  renderCatalog()
  status('')
}

function setScreen(sceneId, navigation) {
  const edit = Boolean(sceneId)
  const wasEditing = !$('mockup-editor').hidden
  if (navigation) {
    const url = new URL(location.href)
    url.searchParams.delete('arte')
    if (edit) url.searchParams.set('cena', sceneId)
    else url.searchParams.delete('cena')
    if (url.href !== location.href) window.history[navigation + 'State'](null, '', url)
  }
  $('library-home').hidden = edit
  $('mockup-editor').hidden = !edit
  $('save-project').hidden = !edit
  if (edit) preview()
  else {
    setInspectorOpen(false)
    setAreaMode(null)
    renderCatalog()
  }
  window.scrollTo(0, 0)
  if (edit && !wasEditing && !$('photo-dialog').open) {
    $('scene-name').focus({ preventScroll: true })
  } else if (!edit && wasEditing) {
    const card = [...$('catalog').querySelectorAll('.scene-card')].find(item => item.dataset.sceneId === active?.id)
    const target = card ?? $('library-title')
    target.focus({ preventScroll: true })
  }
}

async function openScene(scene, saved, loaded, navigation = 'push', addStarter = true) {
  await activate(scene, saved, loaded, addStarter)
  setScreen(scene.id, navigation)
}

$('back-library').addEventListener('click', () => setScreen(null, 'push'))
$('mockups-nav').addEventListener('click', event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  setScreen(null, 'push')
})
window.addEventListener('popstate', () => withLock(async () => {
  const scene = scenes.get(new URLSearchParams(location.search).get('cena'))
  if (scene) await openScene(scene, undefined, undefined, '')
  else setScreen(null, '')
}))

function commit(next) {
  if (!project || next === project) return
  finishAdjustment()
  history.record(project)
  project = next
  preview(true)
}

function preview(sync = false) {
  if (sync) syncUI()
  if (!repaint) repaint = requestAnimationFrame(draw)
}

function syncUI() {
  const layer = selectedLayer(project)
  const index = layer ? project.layers.indexOf(layer) : -1
  $('scene-name').textContent = active.name
  $('scene-description').textContent = active.view + ' · ' + active.style + (active.upscaled ? ' · Foto ampliada' : '')
  $('undo').disabled = !history.canUndo
  $('redo').disabled = !history.canRedo
  $('layer-editor').hidden = !layer
  $('svg-color').hidden = layer?.kind !== 'SVG'
  $('svg-ink').value = layer?.ink ?? '#ff665a'
  $('svg-original').setAttribute('aria-pressed', String(!layer?.ink))
  $('empty-layers').hidden = Boolean(project.layers.length)
  $('raise').disabled = index >= project.layers.length - 1
  $('lower').disabled = index <= 0
  $('finish-all').disabled = project.layers.length < 2
  const shadowAdjustments = $('shadow-adjustments')
  shadowAdjustments.hidden = project.shadow === 'none'
  if (shadowAdjustments.hidden) shadowAdjustments.open = false
  $('format').value = project.format
  $('reset-crop').hidden = !layer?.crop
  const area = printAreaOf(project)
  $('print-area-status').textContent = area ? 'Área delimitada na foto' : 'Peça inteira'
  $('reset-zone').hidden = !area
  $('protect-neckline').checked = Boolean(project.protectNeckline)
  $('draw-neckline').hidden = Boolean(active.neckline)
  $('draw-neckline').textContent = project.neckline ? 'Ajustar marcação da gola' : 'Marcar gola na foto'

  const [w, h] = exportSize(project.format, resources.photo.width, resources.photo.height)
  $('export-dimensions').textContent = w + ' × ' + h + ' px'

  const list = $('layer-list')
  const focusedLayer = list.contains(document.activeElement) ? document.activeElement.dataset.layerId : null
  list.replaceChildren()
  for (const item of project.layers.slice().reverse()) {
    const li = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'layer-button'
    button.dataset.layerId = item.id
    button.setAttribute('aria-pressed', String(item.id === project.selected))
    const thumb = new Image()
    thumb.alt = ''
    thumb.src = item.source
    const name = document.createElement('span')
    name.textContent = item.name
    button.append(thumb, name)
    button.addEventListener('click', () => {
      selectLayer(item)
    })
    const remove = $('layer-delete-template').content.firstElementChild.cloneNode(true)
    remove.setAttribute('aria-label', 'Excluir ' + item.name)
    remove.addEventListener('click', () => {
      commit(deleteLayer(project, item.id))
      const nextControl = list.querySelector('.layer-delete') ?? $('add-art')
      nextControl.focus({ preventScroll: true })
    })
    li.append(button, remove)
    list.append(li)
    if (focusedLayer === item.id) button.focus({ preventScroll: true })
  }
  for (const group of ['light', 'shadow']) {
    for (const button of $(group + '-options').children) button.setAttribute('aria-pressed', String(button.dataset.value === project[group]))
  }
  const finish = $('finish')
  finish.options[0].textContent = layer?.kind === 'SVG' ? 'SVG direto' : finishes.direct
  if (layer) finish.value = layer.finish
  updateSliders()
}

function draw() {
  repaint = 0
  if (!project || $('mockup-editor').hidden) return
  const width = stack.clientWidth, height = stack.clientHeight
  if (!width || !height) return
  const scale = Math.min(1, 1120 / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = overlay.width = w
    canvas.height = overlay.height = h
  }
  let composition = { width: w, height: h }
  if (project.format !== 'original') {
    const [exportWidth, exportHeight] = exportSize(project.format, resources.photo.width, resources.photo.height)
    const fit = Math.min(w / exportWidth, h / exportHeight)
    composition = { width: exportWidth * fit, height: exportHeight * fit }
  }
  if (compactEditor.matches && zoomButton.getAttribute('aria-pressed') === 'true') {
    composition.width *= 1.4
    composition.height *= 1.4
  }
  frame = paintScene(canvas, project, previewMap, artImages, active.neckline, composition)
  drawGuides()
}

function traceRect(ctx, rect, mapPoint, color) {
  if (!rect) return
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) =>
    mapPoint(rect.x + x * rect.w / 2, rect.y + y * rect.h / 2))
  traceGuide(ctx, corners, color)
}

function traceGuide(ctx, [first, ...rest], color) {
  ctx.beginPath()
  ctx.moveTo(first.x, first.y)
  for (const point of rest) ctx.lineTo(point.x, point.y)
  ctx.closePath()
  ctx.setLineDash([5, 4])
  ctx.strokeStyle = '#1C1A18'
  ctx.lineWidth = 3.6
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.6
  ctx.stroke()
  ctx.setLineDash([])
}

function drawGuides() {
  if (!frame || $('mockup-editor').hidden) return
  const ctx = overlay.getContext('2d')
  ctx.clearRect(0, 0, overlay.width, overlay.height)
  const selected = selectedLayer(project)
  const layer = guides && !areaMode && selected
  handleBox.hidden = !layer
  if (!layer) placeToolbar(null)
  if (!guides && !areaMode) return

  const toFrame = (x, y) => ({ x: frame.x + x * frame.w, y: frame.y + y * frame.h })
  if (areaMode === 'printArea') {
    const area = areaMode === 'printArea' ? gesture?.rect ?? printAreaOf(project) : printAreaOf(project)
    traceRect(ctx, area, toFrame, '#FEFCEB')
  }
  if (areaMode === 'neckline') {
    const rect = areaMode === 'neckline' ? gesture?.rect ?? project.neckline : project.neckline
    if (rect) traceRect(ctx, rect, toFrame, '#FEFCEB')
    else if (active.neckline) traceGuide(ctx, active.neckline.map(([x, y]) => toFrame(x, y)), '#FEFCEB')
  }
  if (!layer && !(areaMode === 'crop' && selected)) return

  const form = photoSelection(selected, frame.w, frame.h)
  const center = { x: frame.x + form.x, y: frame.y + form.y }
  const projected = (x, y) => {
    const v = form.vector(x, y)
    return { x: center.x + v.x, y: center.y + v.y }
  }
  const crop = areaMode === 'crop' ? gesture?.rect ?? selected.crop : selected.crop
  const cropPoint = (x, y) => projected(x * 2 - 1, y * 2 - 1)
  if (areaMode === 'crop') traceRect(ctx, { x: .5, y: .5, w: 1, h: 1 }, cropPoint, '#FEFCEB')
  traceRect(ctx, crop, cropPoint, '#D74A21')
  if (!layer) return

  const place = (element, pixel) => {
    element.style.left = pixel.x / overlay.width * 100 + '%'
    element.style.top = pixel.y / overlay.height * 100 + '%'
  }
  const points = corners.map(handle => {
    const point = projected(Number(handle.dataset.x), Number(handle.dataset.y))
    place(handle, point)
    return point
  })
  const top = projected(0, -1)
  const normal = form.vector(0, -1)
  const length = Math.hypot(normal.x, normal.y)
  const offset = (compactEditor.matches ? 36 : 24) * overlay.width / Math.max(1, overlay.clientWidth)
  const rotation = { x: top.x + normal.x * offset / length, y: top.y + normal.y * offset / length }
  place(rotateHandle, rotation)
  place(moveHandle, center)
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y)
  ctx.closePath()
  ctx.moveTo(top.x, top.y)
  ctx.lineTo(rotation.x, rotation.y)
  ctx.strokeStyle = '#1C1A18'
  ctx.lineWidth = 3.2
  ctx.stroke()
  ctx.strokeStyle = '#FEFCEB'
  ctx.lineWidth = 1.4
  ctx.stroke()

  const viewport = stage.getBoundingClientRect()
  const photo = overlay.getBoundingClientRect()
  const stageY = y => photo.top - viewport.top + y * photo.height / overlay.height
  const handleYs = [rotation.y, ...points.map(point => point.y)]
  placeToolbar({
    x: photo.left - viewport.left + Math.max(...points.map(point => point.x)) * photo.width / overlay.width,
    y: stageY(Math.min(...handleYs)),
    bottom: stageY(Math.max(...handleYs))
  })
}
new ResizeObserver(() => preview()).observe(stack)
zoomButton.addEventListener('click', () => {
  if (gesture) return
  zoomButton.setAttribute('aria-pressed', String(zoomButton.getAttribute('aria-pressed') !== 'true'))
  preview()
})

for (const heading of document.querySelectorAll('.settings > h2')) {
  heading.addEventListener('click', () => heading.focus())
}

function getPoint(event) {
  const box = overlay.getBoundingClientRect()
  return {
    x: (event.clientX - box.left) * overlay.width / box.width - frame.x,
    y: (event.clientY - box.top) * overlay.height / box.height - frame.y
  }
}

function selectLayer(layer) {
  finishAdjustment()
  if (areaMode) setAreaMode(null)
  project = { ...project, selected: layer?.id ?? null }
  if (layer && !guides) {
    guides = true
    $('toggle-guides').setAttribute('aria-pressed', 'true')
  }
  syncUI()
  drawGuides()
}

stack.addEventListener('pointerdown', event => {
  if (!frame || busy || gesture || event.button !== 0 || !event.isPrimary) return
  const point = getPoint(event)
  const handle = event.target.closest('.handle')
  let transform
  if (!areaMode) {
    const layer = handle ? selectedLayer(project) : project.layers.slice().reverse()
      .find(item => hitsLayer(item, point.x / frame.w, point.y / frame.h, frame.w, frame.h))
    if (!handle) selectLayer(layer)
    if (!layer) return
    const kind = handle?.dataset.gesture ?? 'move'
    const corner = kind === 'scale' ? { x: Number(handle.dataset.x), y: Number(handle.dataset.y) } : null
    transform = photoGesture(layer, kind, point, frame.w, frame.h, corner)
  }
  if (handle) handle.focus({ preventScroll: true })
  event.preventDefault()
  stack.setPointerCapture(event.pointerId)
  gesture = { point, transform, before: project, id: event.pointerId }
})

stage.addEventListener('pointerdown', event => {
  if (event.target === stage && event.button === 0 && project && !areaMode) selectLayer(null)
})

stack.addEventListener('pointermove', event => {
  if (event.pointerId !== gesture?.id) return
  const point = getPoint(event)
  const origin = gesture.point
  if (areaMode) {
    const selected = selectedLayer(project)
    const local = p => areaMode === 'crop' ?
      layerPoint(selected, p.x / frame.w, p.y / frame.h, frame.w, frame.h) :
      { x: p.x / frame.w, y: p.y / frame.h }
    gesture.rect = rectBetween(local(origin), local(point))
    drawGuides()
    return
  } else {
    const change = gesture.transform(point, event.shiftKey)
    if (!change) return
    project = editLayer(project, change)
    updateSliders()
  }
  preview()
})

function finishGesture(event, cancel) {
  if (event.pointerId !== gesture?.id) return
  const { before, rect } = gesture
  gesture = undefined
  if (areaMode) {
    if (cancel) {
      setAreaMode(null)
      return
    }
    if (!rect || rect.w < .02 || rect.h < .02) {
      status('Arraste para marcar uma área maior.', true)
      drawGuides()
      return
    }
    const mode = areaMode
    setAreaMode(null)
    if (mode === 'crop') commit(editLayer(project, { crop: rect }))
    if (mode === 'printArea') commit({ ...project, printArea: rect })
    if (mode === 'neckline') commit({ ...project, neckline: rect, protectNeckline: true })
    status(mode === 'crop' ? 'Estampa recortada.' : 'Área estampável atualizada.')
    return
  }
  if (cancel) project = before
  else if (project !== before) history.record(before)
  preview(true)
}

stack.addEventListener('pointerup', event => finishGesture(event, false))
stack.addEventListener('pointercancel', event => finishGesture(event, true))
stack.addEventListener('lostpointercapture', event => finishGesture(event, true))

for (const handle of handles) {
  handle.addEventListener('keydown', event => {
    const delta = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key]
    const layer = selectedLayer(project)
    if (!delta || !layer) return
    event.preventDefault()
    const amount = event.shiftKey ? 5 : 1
    const kind = handle.dataset.gesture
    if (kind === 'rotate') {
      commit(editLayer(project, { rotation: ((layer.rotation + delta * amount + 540) % 360) - 180 }))
    } else if (kind === 'scale') {
      commit(editLayer(project, { w: clamp(layer.w + .01 * delta * amount, .01, 1.5) }))
    } else {
      const axis = event.key === 'ArrowUp' || event.key === 'ArrowDown' ? 'y' : 'x'
      commit(editLayer(project, { [axis]: clamp(layer[axis] + .01 * delta * amount, 0, 1) }))
    }
  })
}

const areaInstructions = {
  printArea: 'Arraste na foto para marcar a área onde as estampas podem aparecer.',
  neckline: 'Arraste na foto para marcar a gola e o interior que quer proteger.',
  crop: 'Arraste sobre a estampa para selecionar a parte que quer manter.'
}

function setAreaMode(mode) {
  if (areaMode && gesture) gesture = undefined
  areaMode = mode
  overlay.classList.toggle('zone-mode', Boolean(mode))
  $('cancel-area').hidden = !mode
  if (mode) {
    if (compactEditor.matches) setInspectorOpen(false)
    status(areaInstructions[mode])
  }
  drawGuides()
}

$('cancel-area').addEventListener('click', () => {
  setAreaMode(null)
  status('')
})
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.defaultPrevented || $('mockup-editor').hidden || event.target.closest('input, textarea, select, dialog[open], [contenteditable]')) return
  if (areaMode) $('cancel-area').click()
  else if (project && selectedLayer(project)) selectLayer(null)
})
$('draw-zone').addEventListener('click', () => setAreaMode('printArea'))
$('reset-zone').addEventListener('click', () => {
  setAreaMode(null)
  commit({ ...project, printArea: null })
  status('A estampa pode cobrir a peça inteira.')
})
$('draw-neckline').addEventListener('click', () => setAreaMode('neckline'))
$('protect-neckline').addEventListener('change', event => {
  const enabled = event.target.checked
  if (enabled && !active.neckline && !project.neckline) {
    event.target.checked = false
    setAreaMode('neckline')
    return
  }
  setAreaMode(null)
  commit({ ...project, protectNeckline: enabled })
  status(enabled ? 'Gola e interior protegidos.' : 'Proteção da gola removida.')
})
$('crop-art').addEventListener('click', () => setAreaMode('crop'))
$('reset-crop').addEventListener('click', () => {
  setAreaMode(null)
  commit(editLayer(project, { crop: null }))
  status('Recorte removido.')
})
$('toggle-guides').addEventListener('click', () => {
  guides = !guides
  $('toggle-guides').setAttribute('aria-pressed', String(guides))
  drawGuides()
})

const sliders = [
  ['shadow-intensity', 'intensity'], ['shadow-softness', 'softness'],
  ['shadow-x', 'shadowX'], ['shadow-y', 'shadowY'],
  ['crop-zoom', 'zoom'], ['crop-x', 'cropX'], ['crop-y', 'cropY']
]

function updateSliders() {
  for (const [id, key] of sliders) {
    const input = $(id)
    input.value = Math.round(project[key] * 1000) / 10
    input.nextElementSibling.value = input.value + '%'
  }
}

function finishAdjustment() {
  if (!pending) return
  history.record(pending)
  pending = undefined
  syncUI()
}

for (const [id, key] of sliders) {
  const input = $(id)
  input.addEventListener('input', () => {
    if (!project) return
    pending ??= project
    project = { ...project, [key]: Number(input.value) / 100 }
    updateSliders()
    preview()
  })
  input.addEventListener('change', finishAdjustment)
  input.addEventListener('blur', finishAdjustment)
}

$('undo').addEventListener('click', () => {
  finishAdjustment()
  setAreaMode(null)
  project = history.undo(project)
  preview(true)
})
$('redo').addEventListener('click', () => {
  finishAdjustment()
  setAreaMode(null)
  project = history.redo(project)
  preview(true)
})
$('duplicate').addEventListener('click', () => {
  if (project.layers.length >= 16) return status('O projeto comporta até 16 camadas.', true)
  commit(duplicateLayer(project))
})
$('raise').addEventListener('click', () => commit(moveLayer(project, 1)))
$('lower').addEventListener('click', () => commit(moveLayer(project, -1)))
$('delete').addEventListener('click', () => {
  if (project && selectedLayer(project)) commit(deleteLayer(project))
})
$('finish').addEventListener('change', event => commit(editLayer(project, { finish: event.target.value })))
$('finish-all').addEventListener('click', () => {
  const { finish } = selectedLayer(project)
  commit({ ...project, layers: project.layers.map(layer => ({ ...layer, finish })) })
})
$('format').addEventListener('change', event => commit({ ...project, format: event.target.value }))

const inkPicker = $('svg-ink')
inkPicker.addEventListener('input', () => {
  const layer = project && selectedLayer(project)
  if (layer?.kind !== 'SVG' || layer.ink === inkPicker.value) return
  pending ??= project
  project = editLayer(project, { ink: inkPicker.value })
  preview()
})
inkPicker.addEventListener('change', finishAdjustment)
inkPicker.addEventListener('blur', finishAdjustment)
$('svg-original').addEventListener('click', () => {
  if (selectedLayer(project)?.ink) commit(editLayer(project, { ink: undefined }))
})

async function prepareArtwork(file) {
  const artwork = await readArtwork(file)
  const source = await asDataURL(await canvasBlob(artwork.image))
  artImages.set(source, artwork.image)
  return { ...artwork, source }
}

function appendArtwork(doc, { source, name, image, kind }) {
  return addLayer(doc, source, name, image.width, image.height, resources.photo.width / resources.photo.height, kind)
}

async function importArts(files) {
  if (!project) throw new Error('Selecione uma foto antes de adicionar a estampa.')
  if (project.layers.length + files.length > 16) throw new Error('O projeto comporta até 16 camadas.')
  let next = { ...project, layers: project.layers.filter(layer => !exampleLayers.has(layer.id)) }
  for (const file of files) next = appendArtwork(next, await prepareArtwork(file))
  commit(next)
  status(files.length > 1 ? 'Estampas importadas.' : 'Estampa importada.')
}

$('add-art').addEventListener('click', () => $('art-file').click())
$('art-file').addEventListener('change', event => {
  const files = [...event.target.files]
  event.target.value = ''
  if (files.length) withLock(() => importArts(files))
})
stage.addEventListener('dragover', event => {
  event.preventDefault()
  stage.classList.add('drag-over')
})
stage.addEventListener('dragleave', event => {
  if (!stage.contains(event.relatedTarget)) stage.classList.remove('drag-over')
})
stage.addEventListener('drop', event => {
  event.preventDefault()
  stage.classList.remove('drag-over')
  const files = [...event.dataTransfer.files]
  if (files.length) withLock(() => importArts(files))
})

$('add-photo').addEventListener('click', () => $('photo-dialog').showModal())
$('close-photo').addEventListener('click', () => $('photo-dialog').close())
$('photo-form').addEventListener('submit', event => {
  event.preventDefault()
  withLock(async () => {
    const submit = $('confirm-photo')
    submit.disabled = true
    $('photo-error').textContent = ''
    try {
      const file = $('photo-file').files[0]
      const photo = await localImage(file, $('photo-upscale').checked)
      const maskFile = $('mask-file').files[0]
      const mask = maskFile ? (await localImage(maskFile, false)).source : null
      const scene = {
        id: crypto.randomUUID(), version: 1, name: $('photo-name').value.trim() || file.name.replace(/\.[^.]+$/, ''),
        category: $('photo-category').value, view: $('photo-view').value, style: $('photo-style').value,
        zone: { x: .5, y: .5, w: .46, h: .46 }, photo: photo.source, mask, upscaled: photo.upscaled,
        origin: 'Foto local do usuário', usage: 'Uso local', custom: true
      }
      await openScene(scene)
      scenes.set(scene.id, scene)
      for (const field of ['category', 'view', 'style']) $('filter-' + field).value = ''
      renderCatalog()
      $('photo-dialog').close()
      $('scene-name').focus({ preventScroll: true })
      $('photo-form').reset()
      status('Foto adicionada à biblioteca local.')
    } catch (error) {
      $('photo-error').textContent = error.message
    } finally {
      submit.disabled = false
    }
  })
})

$('save-project').addEventListener('click', () => {
  if (!project) return
  const payload = active.custom ? { ...project, customScene: active } : project
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  if (blob.size > projectLimit) return status('O projeto excede 80 MB. Use arquivos de arte menores.', true)
  download(blob, 'doutelab-mockup.json')
  status('Projeto salvo.')
})

$('open-project').addEventListener('click', () => $('project-file').click())
$('project-file').addEventListener('change', event => {
  const file = event.target.files[0]
  event.target.value = ''
  if (!file) return
  withLock(async () => {
    if (file.size > projectLimit) throw new Error('O projeto excede 80 MB.')
    let saved
    try { saved = JSON.parse(await file.text()) } catch { throw new Error('O arquivo de projeto é inválido.') }
    validateProject(saved)
    const { customScene } = saved
    let scene = scenes.get(saved.scene.id)
    if (customScene) {
      if (customScene.id !== saved.scene.id || customScene.version !== saved.scene.version ||
          !imageData.test(customScene.photo) || (customScene.mask && !imageData.test(customScene.mask)) ||
          typeof customScene.name !== 'string' || !categories.includes(customScene.category) ||
          !views.includes(customScene.view) || !styles.includes(customScene.style)) {
        throw new Error('A foto incorporada neste projeto é inválida.')
      }
      scene = { ...customScene, custom: true, neckline: undefined }
      delete saved.customScene
    }
    if (!scene || scene.version !== saved.scene.version) throw new Error('Cena indisponível: ' + saved.scene.id)
    const images = await prepareScene(scene)
    for (const layer of saved.layers) {
      if (!artImages.has(layer.source)) artImages.set(layer.source, await loadImage(layer.source))
    }
    await openScene(scene, saved, images)
    scenes.set(scene.id, scene)
    renderCatalog()
    status('Projeto reaberto.')
  })
})

for (const [format, type] of [['png', 'image/png'], ['jpeg', 'image/jpeg']]) {
  $('export-' + format).addEventListener('click', () => withLock(async () => {
    if (!project) return
    const snapshot = project
    const images = resources
    const neckline = active.neckline
    status('Gerando imagem…')
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
    const [width, height] = exportSize(snapshot.format, images.photo.width, images.photo.height)
    const data = photoMap(images, Math.min(2400, Math.round(Math.max(width, height) * snapshot.zoom)))
    const output = canvasOf(width, height)
    paintScene(output, snapshot, data, artImages, neckline)
    download(await canvasBlob(output, type, .94), 'doutelab-mockup.' + format)
    status('Imagem exportada em ' + width + ' × ' + height + ' px.')
  }))
}

renderCatalog()
withLock(async () => {
  const params = new URLSearchParams(location.search)
  const hasTransfer = params.has('arte')
  if (hasTransfer) {
    const transfer = await takeTransfer().catch(() => null)
    if (transfer?.version === 1) {
      const scene = (transfer.side === 'back' && catalog.find(item => item.view === 'Costas')) || catalog[0]
      await openScene(scene, undefined, undefined, 'replace', false)
      await importArts([new File([transfer.blob], transfer.name, { type: transfer.blob.type })])
    } else {
      setScreen(null, 'replace')
      status('Estampa indisponível. Escolha uma foto e importe a estampa no editor.', true)
    }
    return
  }
  const scene = scenes.get(params.get('cena'))
  if (scene) await openScene(scene, undefined, undefined, '')
  else if (params.has('cena')) {
    setScreen(null, 'replace')
    status('Abra o arquivo de projeto para recuperar a foto local.')
  }
})

describeHandleKeys(handles)
bindShortcuts([
  ['#open-project', 'Mod+O'], ['#save-project', 'Mod+S'],
  ['#undo', 'Mod+Z'], ['#redo', 'Mod+Shift+Z', 'Mod+Y'],
  ['#delete', 'Delete', 'Backspace'], ['#duplicate', 'Mod+D'],
  ['#raise', 'Alt+ArrowUp'], ['#lower', 'Alt+ArrowDown'],
  ['#crop-art', 'C'], ['#reset-crop', 'Shift+C'], ['#toggle-guides', 'G'],
  ['#add-art', 'Mod+I'], ['#add-photo', 'Shift+I'], ['#back-library', 'B'],
  ['#layers-heading', '1'], ['#scene-heading', '2'], ['#export-heading', '3'],
  ['#finish', 'F'], ['#finish-all', 'Shift+F'], ['#svg-ink', 'K'], ['#svg-original', 'Shift+R'],
  ['#format', 'Shift+E'], ['#crop-zoom', 'Z'],
  ['#draw-neckline', 'N'], ['#protect-neckline', 'Shift+N'],
  ['#draw-zone', 'A'], ['#reset-zone', 'Shift+A'], ['#cancel-area', 'Escape'],
  ['#export-png', 'Mod+Shift+E'], ['#export-jpeg', 'Mod+Alt+E']
])
