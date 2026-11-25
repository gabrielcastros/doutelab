import * as THREE from 'three'
import { zimmCatalog } from './catalog.js'
import { OrbitControls } from './vendor/OrbitControls.js'
import { makeClothMaterial, makeGarment, printArea } from './garment.js'
import { createStudioRenderer, createStudioScene, makePrintTexture } from './studio.js'
import { readArtwork, thumbnail, displayArtwork } from './artwork.js'
import { saveTransfer } from './mockup-transfer.js'
import { artworkLayout, createArtTransform, transformDefaults } from './transform.js'

const $ = id => document.getElementById(id)
const viewButtons = [...document.querySelectorAll('[data-view]')]
const models = $('model')
for (const [index, item] of zimmCatalog.entries()) {
  models.add(new Option(item.label, String(index)))
}
models.selectedIndex = zimmCatalog.findIndex(item => item.label === 'Oversized')
const newSide = () => ({ ...transformDefaults, image: null, kind: '', name: '', thumb: '', revision: 0, history: [] })
const sides = { front: newSide(), back: newSide() }

let activeSide = 'front'
let preview = false
let chosenColor = '#dedbd2'
let pendingAppearance = null
let stage = null

function markPressed(buttons, attribute, value) {
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset[attribute] === value))
}

function canvasOf(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function sampleArt() {
  const canvas = canvasOf(720, 390)
  const ctx = canvas.getContext('2d')
  ctx.strokeStyle = ctx.fillStyle = '#191a20'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.translate(360, 132)
  ctx.rotate(-.075)

  ctx.beginPath()
  ctx.moveTo(-125, -64)
  ctx.bezierCurveTo(-82, -52, -43, -114, 20, -96)
  ctx.bezierCurveTo(62, -82, 76, -59, 127, -61)
  ctx.bezierCurveTo(103, -49, 86, -19, 61, -8)
  ctx.bezierCurveTo(32, 6, 15, 21, 3, 39)
  ctx.bezierCurveTo(-17, 18, -24, 11, -54, -6)
  ctx.bezierCurveTo(-98, -24, -95, -47, -125, -64)
  ctx.fill()

  ctx.fillStyle = '#d64d40'
  ctx.beginPath()
  ctx.ellipse(3, 28, 17, 32, -.2, 0, Math.PI * 2)
  ctx.fill()

  for (const sign of [-1, 1]) {
    ctx.lineWidth = 9
    ctx.beginPath()
    ctx.moveTo(sign * 14, 36)
    ctx.bezierCurveTo(sign * 56, 31, sign * 123, 42, sign * 160, 42)
    ctx.quadraticCurveTo(sign * 179, 44, sign * 173, 66)
    ctx.bezierCurveTo(sign * 168, 87, sign * 182, 106, sign * 183, 125)
    ctx.stroke()
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(sign * 7, 49)
    ctx.bezierCurveTo(sign * 40, 48, sign * 91, 58, sign * 130, 59)
    ctx.quadraticCurveTo(sign * 148, 60, sign * 145, 79)
    ctx.bezierCurveTo(sign * 143, 95, sign * 146, 111, sign * 149, 127)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(sign * 8, 56)
    ctx.bezierCurveTo(sign * 37, 85, sign * 2, 95, sign * 24, 133)
    ctx.stroke()
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = '#191a20'
  ctx.font = 'italic 950 120px Arial Black, Arial, sans-serif'
  ctx.fillText('doutelab', 0, 223, 630)
  return canvas
}

const example = sampleArt()
Object.assign(sides.front, { image: example, kind: 'PNG', name: 'Magnapinna · exemplo', thumb: thumbnail(example) })

function setColor(value, custom = false) {
  chosenColor = value.toLowerCase()
  $('color').value = chosenColor
  const swatches = [...$('fabric-swatches').children]
  markPressed(swatches, 'color', custom ? '' : chosenColor)
  const active = swatches.find(button => button.dataset.color === chosenColor)
  $('fabric-name').textContent = custom ? 'Cor personalizada' : active?.title ?? 'Cor não especificada no catálogo'
  stage?.setColor(chosenColor)
}

function syncFabric(item, initial = false) {
  const swatches = item.colors.map(([name, color]) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'swatch'
    button.style.setProperty('--tone', color)
    button.dataset.color = color
    button.title = name
    button.setAttribute('aria-label', name)
    return button
  })
  $('fabric-swatches').replaceChildren(...swatches)
  $('fabric-source').href = item.url
  const selected = (initial && item.colors.find(([, color]) => color === chosenColor)) || item.colors[0]
  setColor(selected?.[1] ?? '#dedbd2')
}

function syncStatus() {
  const art = sides[activeSide]
  $('transform-status').textContent = art.image ? Math.round(art.scale) + '% · ' + Math.round(art.rotation) + '°' : ''
  $('undo').disabled = !art.history.length
  $('hint').textContent = preview || !art.image
    ? 'Arraste pra girar a camiseta. Use a roda do mouse pra aproximar.'
    : 'Arte pra mover · Cantos pra redimensionar · Alça redonda pra girar'
}

function syncInspector() {
  const art = sides[activeSide]
  $('active-face').textContent = activeSide === 'front' ? 'Frente' : 'Costas'
  $('upload-label').textContent = art.image ? 'Trocar PNG ou SVG' : 'Importar PNG ou SVG'
  $('file-card').hidden = !art.image
  $('art-properties').hidden = !art.image
  $('svg-properties').hidden = art.kind !== 'SVG'
  $('file-name').textContent = art.name
  $('file-name').title = art.name
  $('file-kind').textContent = art.kind
  if (art.thumb) $('art-thumb').src = art.thumb
  else $('art-thumb').removeAttribute('src')
  $('flip').setAttribute('aria-pressed', String(art.flip))
  $('original-color').setAttribute('aria-pressed', String(!art.ink))
  $('art-color').value = art.ink || '#ff665a'
  $('opacity').value = art.opacity
  $('opacity-value').value = art.opacity + '%'
  $('preview').setAttribute('aria-pressed', String(preview))
  $('preview').textContent = preview ? 'Editar' : 'Prévia'
  syncStatus()
}

function showFileError(message) {
  $('file-error').textContent = message
  $('file-error').hidden = !message
}

function snapshot(side) {
  return Object.fromEntries(Object.keys(transformDefaults).map(key => [key, sides[side][key]]))
}

function artworkSnapshot(side) {
  const { image, kind, name, thumb } = sides[side]
  return { ...snapshot(side), image, kind, name, thumb }
}

function applyArt(side, change) {
  if ('image' in change && change.image !== sides[side].image) sides[side].tinted = null
  Object.assign(sides[side], change)
  stage?.updatePrint(side)
  if (side === activeSide) syncStatus()
}

function recordChange(side, previous) {
  const art = sides[side]
  if (Object.keys(previous).every(key => previous[key] === art[key])) return
  if (art.history.length >= 30) art.history.shift()
  art.history.push(previous)
  if (side === activeSide) syncStatus()
}

function finishAppearance() {
  if (!pendingAppearance) return
  const { side, before } = pendingAppearance
  pendingAppearance = null
  recordChange(side, before)
}

function editAppearance(properties, final) {
  stage?.finishGesture()
  if (!pendingAppearance) pendingAppearance = { side: activeSide, before: snapshot(activeSide) }
  applyArt(activeSide, properties)
  if (final) finishAppearance()
  syncInspector()
}

function discreteEdit(properties) {
  finishAppearance()
  stage?.finishGesture()
  const before = snapshot(activeSide)
  applyArt(activeSide, properties)
  recordChange(activeSide, before)
  syncInspector()
}

function undo() {
  finishAppearance()
  stage?.finishGesture()
  const before = sides[activeSide].history.pop()
  if (!before) return
  applyArt(activeSide, before)
  syncInspector()
}

function switchView(view) {
  finishAppearance()
  stage?.finishGesture()
  if (view !== 'quarter' && activeSide !== view) {
    activeSide = view
    showFileError('')
    syncInspector()
  }
  stage?.setView(view)
}

async function importArtwork(file, side) {
  if (!file) return
  const state = sides[side]
  const revision = ++state.revision
  if (side === activeSide) showFileError('')
  try {
    const artwork = await readArtwork(file)
    if (state.revision !== revision) return
    finishAppearance()
    stage?.finishGesture()
    const before = artworkSnapshot(side)
    applyArt(side, { ...transformDefaults, ...artwork })
    recordChange(side, before)
    if (side === activeSide) {
      preview = false
      stage?.setView(side)
      syncInspector()
    }
  } catch (error) {
    if (state.revision === revision && side === activeSide) showFileError(error.message)
  }
}

function initializeStage() {
  const container = $('scene')
  const { renderer, context } = createStudioRenderer({
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.65)
  })
  container.appendChild(renderer.domElement)

  const scene = createStudioScene()
  const camera = new THREE.PerspectiveCamera(34, 1, .05, 30)
  const target = new THREE.Vector3(0, .025, 0)
  const controls = new OrbitControls(camera, container)
  controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
  camera.position.set(0, .26, 4.65)
  controls.target.copy(target)
  controls.enableDamping = true
  controls.dampingFactor = .085
  controls.enablePan = false
  controls.minDistance = 2.35
  controls.maxDistance = 8.1
  controls.minPolarAngle = .035
  controls.maxPolarAngle = Math.PI - .035
  controls.update()

  const textureOf = () => makePrintTexture(canvasOf(1152, 1030), renderer)
  const textures = { front: textureOf(), back: textureOf() }
  const material = makeClothMaterial(textures.front, textures.back)
  let garment
  let fit = 'regular'
  let nextFrame = 0
  let viewAnimation = null
  const dirtyPrints = new Set()
  const manipulation = createArtTransform({
    container, camera, printCenter: printArea.center,
    getProjectionDepth: side => {
      if (fit === 'oversized') return side === 'front' ? .403 : .426
      return fit === 'premium' ? (side === 'front' ? .454 : .429) : .255
    },
    getSelection: () => ({ side: activeSide, art: sides[activeSide], preview }),
    apply: applyArt, begin: snapshot, commit: recordChange
  })

  function render(time) {
    nextFrame = 0
    if (viewAnimation) {
      const progress = Math.min(1, (time - viewAnimation.start) / 300)
      const eased = 1 - (1 - progress) ** 3
      const orbit = new THREE.Spherical().copy(viewAnimation.from)
      orbit.theta += viewAnimation.turn * eased
      orbit.phi = THREE.MathUtils.lerp(orbit.phi, viewAnimation.phi, eased)
      camera.position.setFromSpherical(orbit).add(target)
      if (progress === 1) viewAnimation = null
      else requestRender()
    }
    controls.update()
    flushPrints()
    renderer.render(scene, camera)
    manipulation.render()
  }

  function requestRender() {
    if (!nextFrame) nextFrame = requestAnimationFrame(render)
  }

  function resize() {
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    camera.aspect = width / height
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(17)) / Math.min(1, camera.aspect)))
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    manipulation.resize(width, height)
    requestRender()
  }

  function setView(name) {
    const quarter = { premium: -.91, oversized: .78, regular: .56 }[fit]
    const theta = { front: 0, quarter: activeSide === 'front' ? quarter : Math.PI - quarter, back: Math.PI }[name]
    const phi = Math.PI / 2 - ({ premium: .16, oversized: .12, regular: .053 }[fit])
    const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target))
    const turn = THREE.MathUtils.euclideanModulo(theta - from.theta + Math.PI, 2 * Math.PI) - Math.PI
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      camera.position.setFromSpherical(new THREE.Spherical(from.radius, phi, theta)).add(target)
      viewAnimation = null
    } else {
      viewAnimation = { start: performance.now(), from, turn, phi }
    }
    markPressed(viewButtons, 'view', name)
    requestRender()
  }

  function updatePrint(side) {
    dirtyPrints.add(side)
    requestRender()
  }

  function flushPrints() {
    for (const side of dirtyPrints) paintPrint(side)
    dirtyPrints.clear()
  }

  function snapshotExport() {
    flushPrints()
    camera.updateMatrixWorld()
    const prints = {}
    for (const [side, { image }] of Object.entries(textures)) {
      const canvas = canvasOf(image.width, image.height)
      canvas.getContext('2d').drawImage(image, 0, 0)
      prints[side] = canvas
    }
    return { model: zimmCatalog[models.value], color: chosenColor, camera: camera.clone(), target: target.clone(), prints }
  }

  function paintPrint(side) {
    const art = sides[side]
    const texture = textures[side]
    const canvas = texture.image
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (art.image) {
      const layout = artworkLayout(art)
      const xScale = canvas.width / printArea.width
      const yScale = canvas.height / printArea.height
      ctx.save()
      ctx.translate(canvas.width / 2 + layout.center.x * xScale, canvas.height / 2 - layout.center.y * yScale)
      ctx.scale(xScale, yScale)
      ctx.rotate(-layout.angle)
      if (art.flip) ctx.scale(-1, 1)
      ctx.globalAlpha = art.opacity / 100
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(displayArtwork(art), -layout.width / 2, -layout.height / 2, layout.width, layout.height)
      ctx.restore()
    }
    texture.needsUpdate = true
    if (!context) renderer.setPrint(side, canvas)
  }

  function setModel(value) {
    if (garment) {
      scene.remove(garment)
      garment.traverse(obj => obj.geometry?.dispose())
    }
    const fitChanged = fit !== value.fit
    fit = value.fit
    garment = makeGarment(value, material)
    scene.add(garment)
    if (!context) renderer.setGarment(garment)
    const preset = viewButtons.find(button => button.getAttribute('aria-pressed') === 'true')
    if (fitChanged && preset) setView(preset.dataset.view)
    requestRender()
  }

  controls.addEventListener('change', requestRender)
  controls.addEventListener('start', () => {
    viewAnimation = null
    markPressed(viewButtons, 'view', '')
  })
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault()
    $('graphics-error').textContent = 'A visualização foi interrompida. Recarregue a página pra abrir o editor novamente.'
    $('graphics-error').hidden = false
  })

  setModel(zimmCatalog[models.value])
  updatePrint('front')
  updatePrint('back')
  new ResizeObserver(resize).observe(container)
  resize()

  return {
    setView, setModel, updatePrint, requestRender, snapshotExport, finishGesture: manipulation.finishGesture,
    setColor: value => {
      material.color.set(value)
      if (!context) renderer.setColor(value)
      requestRender()
    }
  }
}

const exportButtons = [...document.querySelectorAll('[data-export]')]
$('send-to-mockups').addEventListener('click', async event => {
  const side = activeSide
  const art = sides[side]
  if (!art.image) return
  const button = event.currentTarget
  button.disabled = true
  try {
    const blob = await new Promise((resolve, reject) => art.image.toBlob(result => {
      if (result) resolve(result)
      else reject(new Error('Não consegui preparar a estampa.'))
    }, 'image/png'))
    await saveTransfer({ blob, name: art.name.replace(/\.(png|svg)$/i, '') + '.png', side })
    location.assign('./mockups.html?arte=1')
  } catch (error) {
    showFileError(error.message)
  } finally {
    button.disabled = false
  }
})

const exportDownload = $('export-download')
for (const button of exportButtons) button.addEventListener('click', async () => {
  const status = $('export-status')
  const progress = message => { status.textContent = message }
  for (const control of exportButtons) control.disabled = true
  progress('Preparando arquivo…')
  try {
    const snapshot = stage.snapshotExport()
    const { exportMockup } = await import('./export.js')
    const { blob, filename } = await exportMockup(button.dataset.export, snapshot, progress)
    if (exportDownload.href) URL.revokeObjectURL(exportDownload.href)
    exportDownload.href = URL.createObjectURL(blob)
    exportDownload.download = filename
    exportDownload.textContent = 'Baixar ' + filename
    exportDownload.hidden = false
    exportDownload.click()
    progress('Arquivo pronto.')
  } catch (error) {
    console.error('Falha ao exportar mockup', error)
    progress('Não consegui gerar o arquivo. Tente de novo.')
  } finally {
    for (const control of exportButtons) control.disabled = false
  }
})

for (const button of viewButtons) button.addEventListener('click', () => switchView(button.dataset.view))
$('fabric-swatches').addEventListener('click', event => {
  const button = event.target.closest('[data-color]')
  if (button) setColor(button.dataset.color)
})
$('color').addEventListener('input', event => setColor(event.target.value, true))
models.addEventListener('change', () => {
  const item = zimmCatalog[models.value]
  stage?.finishGesture()
  stage?.setModel(item)
  syncFabric(item)
})
$('art-file').addEventListener('change', event => {
  importArtwork(event.target.files[0], activeSide)
  event.target.value = ''
})

const dropzone = $('dropzone')
dropzone.addEventListener('dragover', event => {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  dropzone.classList.add('drag-over')
})
dropzone.addEventListener('dragleave', event => {
  if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove('drag-over')
})
dropzone.addEventListener('drop', event => {
  event.preventDefault()
  dropzone.classList.remove('drag-over')
  importArtwork(event.dataTransfer?.files[0], activeSide)
})

for (const type of ['input', 'change']) {
  $('art-color').addEventListener(type, event => editAppearance({ ink: event.target.value }, type === 'change'))
  $('opacity').addEventListener(type, event => editAppearance({ opacity: Number(event.target.value) }, type === 'change'))
}
$('art-color').addEventListener('blur', finishAppearance)
$('opacity').addEventListener('blur', finishAppearance)
$('original-color').addEventListener('click', () => discreteEdit({ ink: '' }))
$('flip').addEventListener('click', () => discreteEdit({ flip: !sides[activeSide].flip }))
$('reset-print').addEventListener('click', () => discreteEdit(transformDefaults))
$('undo').addEventListener('click', undo)
$('preview').addEventListener('click', () => {
  finishAppearance()
  stage?.finishGesture()
  preview = !preview
  syncInspector()
  stage?.requestRender()
})
document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== 'z' ||
      event.target.matches('input, textarea, [contenteditable]')) return
  event.preventDefault()
  undo()
})
$('remove-art').addEventListener('click', () => {
  finishAppearance()
  stage?.finishGesture()
  const state = sides[activeSide]
  const before = artworkSnapshot(activeSide)
  state.revision++
  applyArt(activeSide, { ...transformDefaults, image: null, kind: '', name: '', thumb: '' })
  recordChange(activeSide, before)
  showFileError('')
  syncInspector()
  $('art-file').focus()
})

try {
  stage = initializeStage()
  for (const button of exportButtons) button.disabled = false
} catch (error) {
  console.error('Falha ao iniciar visualização 3D', error)
  $('graphics-error').textContent = 'Não consegui iniciar a visualização 3D. Tente recarregar a página em um navegador atualizado.'
  $('graphics-error').hidden = false
}
syncFabric(zimmCatalog[models.value], true)
syncInspector()
