import { categories, views, styles, catalog } from './catalog.js'
import {
  finishes, lights, shadows, formats, clamp, exportSize, newProject, createHistory,
  selectedLayer, addLayer, editLayer, duplicateLayer, deleteLayer, moveLayer, validateProject, imageData
} from './state.js'
import { canvasOf, canvasBlob, asDataURL, localImage, loadImage, download, projectLimit } from './files.js'
import { paintScene, preparePhoto, hitsLayer } from './render.js'
import { photoSelection, photoGesture } from './transform.js'
import { createArtToolbar } from '../art-toolbar.js'
import { readArtwork } from '../artwork.js'
import { takeTransfer } from '../mockup-transfer.js'

const $ = id => document.getElementById(id)
const canvas = $('scene-canvas')
const overlay = $('selection-canvas')
const stack = $('canvas-stack')
const stage = $('drop-stage')
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
let zoneMode = false
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
  ['category', categories, 'Todas as peças'], ['view', views, 'Todas as vistas'], ['style', styles, 'Apresentação']
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
    const empty = document.createElement('p')
    empty.className = 'muted'
    empty.textContent = 'Nenhuma foto com estes filtros.'
    list.append(empty)
  }
}

function photoMap(images, longSide) {
  const { photo, mask } = images
  const scale = longSide / Math.max(photo.width, photo.height)
  return preparePhoto(photo, mask, Math.max(1, Math.round(photo.width * scale)), Math.max(1, Math.round(photo.height * scale)))
}

async function prepareScene(scene) {
  if (sceneImages.has(scene)) return sceneImages.get(scene)
  const [photo, mask] = await Promise.all([loadImage(scene.photo), scene.mask ? loadImage(scene.mask) : null])
  if (mask && Math.abs(photo.width / photo.height - mask.width / mask.height) > .015) {
    throw new Error('A máscara precisa ter o mesmo enquadramento e proporção da foto.')
  }
  const images = { photo, mask }
  sceneImages.set(scene, images)
  return images
}

async function activate(scene, saved, loaded) {
  if (active?.id === scene.id && !saved) return
  const images = loaded ?? await prepareScene(scene)
  const map = photoMap(images, 720)
  if (project) drafts.set(active.id, { project, history })
  const draft = drafts.get(scene.id)
  active = scene
  resources = images
  previewMap = map
  project = saved ?? draft?.project ?? newProject(scene)
  history = saved ? createHistory() : draft?.history ?? createHistory()
  gesture = undefined
  zoneMode = false
  overlay.classList.remove('zone-mode')
  preview(true)
  renderCatalog()
  status('')
}

function setScreen(sceneId, navigation) {
  const edit = Boolean(sceneId)
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
  else renderCatalog()
  window.scrollTo(0, 0)
}

async function openScene(scene, saved, loaded, navigation = 'push') {
  await activate(scene, saved, loaded)
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
  $('empty-layers').hidden = Boolean(project.layers.length)
  $('raise').disabled = index >= project.layers.length - 1
  $('lower').disabled = index <= 0
  $('finish-all').disabled = project.layers.length < 2
  $('shadow-adjustments').hidden = project.shadow === 'none'
  $('format').value = project.format

  const [w, h] = exportSize(project.format, resources.photo.width, resources.photo.height)
  $('export-dimensions').textContent = w + ' × ' + h + ' px'

  const list = $('layer-list')
  list.replaceChildren()
  for (const item of project.layers.slice().reverse()) {
    const li = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'layer-button'
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
    li.append(button)
    list.append(li)
  }
  for (const group of ['light', 'shadow']) {
    for (const button of $(group + '-options').children) button.setAttribute('aria-pressed', String(button.dataset.value === project[group]))
  }
  if (layer) $('finish').value = layer.finish
  updateSliders()
}

function draw() {
  repaint = 0
  if (!project || $('mockup-editor').hidden) return
  const [width, height] = exportSize(project.format, resources.photo.width, resources.photo.height)
  const scale = Math.min(720 / width, 680 / height)
  const w = Math.round(width * scale), h = Math.round(height * scale)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = overlay.width = w
    canvas.height = overlay.height = h
  }
  frame = paintScene(canvas, project, previewMap, artImages)
  drawGuides()
}

function drawGuides() {
  if (!frame || $('mockup-editor').hidden) return
  const ctx = overlay.getContext('2d')
  ctx.clearRect(0, 0, overlay.width, overlay.height)
  const layer = guides && !zoneMode && selectedLayer(project)
  handleBox.hidden = !layer
  if (!layer) placeToolbar(null)
  if (!guides && !zoneMode) return
  if (zoneMode || project.layers.length === 0) {
    const zone = project.zone
    ctx.strokeStyle = '#ff9d85'
    ctx.lineWidth = 1.6
    ctx.setLineDash([5, 4])
    ctx.strokeRect(frame.x + (zone.x - zone.w / 2) * frame.w, frame.y + (zone.y - zone.h / 2) * frame.h,
      zone.w * frame.w, zone.h * frame.h)
    ctx.setLineDash([])
  }
  if (!layer) return

  const form = photoSelection(layer, frame.w, frame.h)
  const center = { x: frame.x + form.x, y: frame.y + form.y }
  const projected = (x, y) => {
    const v = form.vector(x, y)
    return { x: center.x + v.x, y: center.y + v.y }
  }
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
  const offset = 24 * overlay.width / Math.max(1, overlay.clientWidth)
  const rotation = { x: top.x + normal.x * offset / length, y: top.y + normal.y * offset / length }
  place(rotateHandle, rotation)
  place(moveHandle, center)
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y)
  ctx.closePath()
  ctx.moveTo(top.x, top.y)
  ctx.lineTo(rotation.x, rotation.y)
  ctx.strokeStyle = '#ff9d85'
  ctx.lineWidth = 1.4
  ctx.stroke()

  const viewport = stage.getBoundingClientRect()
  const photo = overlay.getBoundingClientRect()
  placeToolbar({
    x: photo.left - viewport.left + Math.max(...points.map(point => point.x)) * photo.width / overlay.width,
    y: photo.top - viewport.top + Math.min(rotation.y, ...points.map(point => point.y)) * photo.height / overlay.height
  })
}
new ResizeObserver(() => drawGuides()).observe(stack)

function controls(panel) {
  for (const button of document.querySelectorAll('[data-panel]')) {
    const current = button.dataset.panel === panel
    button.setAttribute('aria-pressed', String(current))
    $('panel-' + button.dataset.panel).hidden = !current
  }
}

for (const button of document.querySelectorAll('[data-panel]')) {
  button.addEventListener('click', () => {
    zoneMode = false
    overlay.classList.remove('zone-mode')
    controls(button.dataset.panel)
    drawGuides()
  })
}

function getPoint(event) {
  const box = overlay.getBoundingClientRect()
  return {
    x: (event.clientX - box.left) * overlay.width / box.width - frame.x,
    y: (event.clientY - box.top) * overlay.height / box.height - frame.y
  }
}

function selectLayer(layer) {
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
  if (!zoneMode) {
    const layer = handle ? selectedLayer(project) : project.layers.slice().reverse()
      .find(item => hitsLayer(item, point.x / frame.w, point.y / frame.h, frame.w, frame.h))
    if (!handle) selectLayer(layer)
    if (!layer) return
    controls('layers')
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
  if (event.target === stage && event.button === 0 && project && !zoneMode) selectLayer(null)
})

stack.addEventListener('pointermove', event => {
  if (event.pointerId !== gesture?.id) return
  const point = getPoint(event)
  const origin = gesture.point
  if (zoneMode) {
    const x0 = clamp(origin.x / frame.w, 0, 1), y0 = clamp(origin.y / frame.h, 0, 1)
    const x1 = clamp(point.x / frame.w, 0, 1), y1 = clamp(point.y / frame.h, 0, 1)
    project = { ...project, zone: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) } }
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
  const before = gesture.before
  gesture = undefined
  if (cancel || (zoneMode && (project.zone.w < .02 || project.zone.h < .02))) project = before
  if (project !== before) history.record(before)
  if (!cancel && zoneMode) {
    zoneMode = false
    overlay.classList.remove('zone-mode')
    status(project === before ? 'A área é pequena demais.' : 'Área estampável atualizada.', project === before)
  }
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

$('draw-zone').addEventListener('click', () => {
  zoneMode = !zoneMode
  overlay.classList.toggle('zone-mode', zoneMode)
  status(zoneMode ? 'Arraste na foto para marcar a área estampável.' : '')
  drawGuides()
})
$('toggle-guides').addEventListener('click', () => {
  guides = !guides
  $('toggle-guides').setAttribute('aria-pressed', String(guides))
  drawGuides()
})

const sliders = [
  ['layer-size', 'w', true, '%'], ['layer-rotation', 'rotation', true, '°', 1],
  ['layer-x', 'x', true, '%'], ['layer-y', 'y', true, '%'],
  ['shadow-intensity', 'intensity', false, '%'], ['shadow-softness', 'softness', false, '%'],
  ['shadow-x', 'shadowX', false, '%'], ['shadow-y', 'shadowY', false, '%'],
  ['crop-zoom', 'zoom', false, '%'], ['crop-x', 'cropX', false, '%'], ['crop-y', 'cropY', false, '%']
]

function updateSliders() {
  const layer = selectedLayer(project)
  for (const [id, key, isLayer, unit, multiplier = 100] of sliders) {
    const value = (isLayer ? layer : project)?.[key]
    if (value === undefined) continue
    const input = $(id)
    input.value = Math.round(value * multiplier * 10) / 10
    input.nextElementSibling.value = input.value + unit
  }
}

for (const [id, key, isLayer, , multiplier = 100] of sliders) {
  const input = $(id)
  input.addEventListener('input', () => {
    if (!project) return
    pending ??= project
    const value = Number(input.value) / multiplier
    project = isLayer ? editLayer(project, { [key]: value }) : { ...project, [key]: value }
    updateSliders()
    preview()
  })
  const finish = () => {
    if (!pending) return
    history.record(pending)
    pending = undefined
    syncUI()
  }
  input.addEventListener('change', finish)
  input.addEventListener('blur', finish)
}

$('undo').addEventListener('click', () => {
  project = history.undo(project)
  preview(true)
})
$('redo').addEventListener('click', () => {
  project = history.redo(project)
  preview(true)
})
document.addEventListener('keydown', event => {
  if ($('mockup-editor').hidden || !project || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' ||
      event.target.matches('input, textarea, select, [contenteditable]')) return
  event.preventDefault()
  $(event.shiftKey ? 'redo' : 'undo').click()
})
$('duplicate').addEventListener('click', () => {
  if (project.layers.length >= 16) return status('O projeto comporta até 16 camadas.', true)
  commit(duplicateLayer(project))
})
$('raise').addEventListener('click', () => commit(moveLayer(project, 1)))
$('lower').addEventListener('click', () => commit(moveLayer(project, -1)))
$('delete').addEventListener('click', () => commit(deleteLayer(project)))
$('finish').addEventListener('change', event => commit(editLayer(project, { finish: event.target.value })))
$('finish-all').addEventListener('click', () => {
  const { finish } = selectedLayer(project)
  commit({ ...project, layers: project.layers.map(layer => ({ ...layer, finish })) })
})
$('format').addEventListener('change', event => commit({ ...project, format: event.target.value }))

async function importArts(files) {
  if (!project) throw new Error('Selecione uma foto antes de adicionar a estampa.')
  if (project.layers.length + files.length > 16) throw new Error('O projeto comporta até 16 camadas.')
  let next = project
  for (const file of files) {
    const artwork = await readArtwork(file)
    if (artwork.kind !== 'PNG') throw new Error('Importe a estampa em PNG transparente.')
    const source = await asDataURL(await canvasBlob(artwork.image))
    artImages.set(source, artwork.image)
    next = addLayer(next, source, artwork.name, artwork.image.width, artwork.image.height, resources.photo.width / resources.photo.height)
  }
  commit(next)
  controls('layers')
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
      await openScene(scene, newProject(scene))
      scenes.set(scene.id, scene)
      for (const field of ['category', 'view', 'style']) $('filter-' + field).value = ''
      renderCatalog()
      $('photo-dialog').close()
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
      scene = { ...customScene, custom: true }
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
    status('Gerando imagem…')
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
    const [width, height] = exportSize(snapshot.format, images.photo.width, images.photo.height)
    const data = photoMap(images, Math.min(2400, Math.round(Math.max(width, height) * snapshot.zoom)))
    const output = canvasOf(width, height)
    paintScene(output, snapshot, data, artImages)
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
      await openScene(scene, undefined, undefined, 'replace')
      await importArts([new File([transfer.blob], transfer.name, { type: transfer.blob.type })])
    } else {
      setScreen(null, 'replace')
      status('Estampa indisponível. Escolha uma foto e importe o PNG no editor.', true)
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
