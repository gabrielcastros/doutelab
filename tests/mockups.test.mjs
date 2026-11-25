import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import {
  dimensions, exportSize, newProject, addLayer, editLayer, moveLayer, duplicateLayer, deleteLayer,
  selectedLayer, createHistory, validateProject, finishes, lights, shadows
} from '../dist/mockups/state.js'
import { photoGesture, photoSelection } from '../dist/mockups/transform.js'
import { preparePhoto, paintScene } from '../dist/mockups/render.js'

globalThis.document = { createElement: () => createCanvas(1, 1) }
const reference = {
  id: 'cotton', version: 1, zone: { x: .5, y: .5, w: .57, h: .53 }
}
const png = 'data:image/png;base64,AA=='

test('preserves aspect ratio when upscaling and provides both Full HD orientations', () => {
  assert.deepEqual(dimensions(554, 554, 1000), [1000, 1000])
  assert.deepEqual(dimensions(635, 865, 1000), [1000, 1362])
  assert.deepEqual(dimensions(1200, 1500, 1000), [1200, 1500])
  assert.deepEqual(exportSize('horizontal', 600, 500), [1920, 1080])
  assert.deepEqual(exportSize('vertical', 600, 500), [1080, 1920])
  assert.deepEqual(exportSize('original', 1800, 1200), [1800, 1200])
})

test('a new mockup starts with the diffuse window shadow settings', () => {
  const { shadow, intensity, softness, shadowX, shadowY } = newProject(reference)
  assert.deepEqual({ shadow, intensity, softness, shadowX, shadowY }, {
    shadow: 'diffuse', intensity: .6, softness: 1, shadowX: 0, shadowY: 0
  })
})

test('layer order, finish, duplicate, delete and history survive serializing the project', () => {
  const first = addLayer(newProject(reference), png, 'Front', 16, 8, 1)
  const original = selectedLayer(first)
  const pair = editLayer(duplicateLayer(first), { finish: 'puff' })
  const copy = selectedLayer(pair)
  assert.notEqual(copy.id, original.id)
  assert.notEqual(copy.x, original.x)
  assert.equal(pair.layers[0].finish, 'direct')
  const swapped = moveLayer(pair, -1)
  assert.deepEqual(swapped.layers.map(layer => layer.id), [copy.id, original.id])
  const history = createHistory()
  history.record(swapped)
  const deleted = deleteLayer(swapped)
  assert.equal(deleted.selected, null)
  assert.deepEqual(history.undo(deleted), swapped)
  assert.deepEqual(history.redo(swapped), deleted)
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(swapped))), swapped)
  assert.throws(() => validateProject({ ...swapped, layer: null, light: 'missing' }), /inválido/)
})

test('masked artwork, all six finish options and 25 combinations render deterministically', async () => {
  const photo = await loadImage(new URL('../dist/mockups/assets/camiseta-estonada.webp', import.meta.url))
  const map = preparePhoto(photo, null, 160, 160)
  assert.equal(map.alpha[0], 0)
  assert.ok(map.alpha[80 * 160 + 80] > 240)
  const artwork = createCanvas(80, 30)
  artwork.getContext('2d').fillStyle = '#ff9d50'
  artwork.getContext('2d').fillRect(0, 0, 80, 30)
  const images = new Map([[png, artwork]])
  const stage = createCanvas(160, 160)
  const initial = newProject(reference)
  const project = addLayer(initial, png, 'Print', 80, 30, 1)
  const render = doc => { paintScene(stage, doc, map, images); return stage.toBuffer('image/png') }
  const gold = render(project)
  const base = render(initial)
  assert.notDeepEqual(gold, base)
  const measure = stage.getContext('2d')
  const background = measure.getImageData(0, 0, 1, 1).data
  render(project)
  assert.deepEqual(measure.getImageData(0, 0, 1, 1).data, background)
  const inks = new Set(Object.keys(finishes).map(finish =>
    render(editLayer(project, { finish })).toString('base64')))
  assert.equal(inks.size, 6)
  const variations = new Set()
  for (const light of Object.keys(lights)) {
    for (const shadow of Object.keys(shadows)) {
      variations.add(render({ ...project, light, shadow }).toString('base64'))
    }
  }
  assert.equal(variations.size, 25)
  assert.deepEqual(render(project), gold)
})

test('mouse movement, corner scaling and rotation use photo coordinates', () => {
  const layer = { x: .5, y: .5, w: .4, width: 100, height: 50, rotation: 0 }
  const form = photoSelection(layer, 500, 500)
  const corner = form.vector(1, 1)
  const bottomRight = { x: form.x + corner.x, y: form.y + corner.y }
  const resize = photoGesture(layer, 'scale', bottomRight, 500, 500, { x: 1, y: 1 })
  const larger = { ...layer, ...resize({ x: 450, y: 350 }) }
  assert.ok(larger.w > layer.w)
  const anchored = photoSelection(larger, 500, 500)
  const topLeft = anchored.vector(-1, -1)
  assert.ok(Math.abs(anchored.x + topLeft.x - 150) < 1e-9)
  assert.ok(Math.abs(anchored.y + topLeft.y - 200) < 1e-9)
  const rotate = photoGesture(layer, 'rotate', { x: 250, y: 150 }, 500, 500)
  assert.equal(rotate({ x: 350, y: 250 }).rotation, 90)
  assert.equal(rotate({ x: 300, y: 150 }, true).rotation, 30)
  const move = photoGesture(layer, 'move', { x: 250, y: 250 }, 500, 500)
  assert.deepEqual(move({ x: 300, y: 125 }), { x: .6, y: .25 })
})

test('direct PNG uses the artwork pixels without cloth warping or ink treatment', () => {
  const width = 80, height = 80
  const garment = createCanvas(width, height)
  const cloth = garment.getContext('2d')
  const gradient = cloth.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#0a0a0a')
  gradient.addColorStop(1, '#707070')
  cloth.fillStyle = gradient
  cloth.fillRect(0, 0, width, height)
  const map = preparePhoto(garment, null, width, height)
  const ink = createCanvas(16, 16)
  const inkContext = ink.getContext('2d')
  inkContext.fillStyle = '#22a8ed'
  inkContext.fillRect(0, 0, 8, 16)
  const project = addLayer({ ...newProject(reference), shadow: 'none' }, png, 'Direct', 16, 16, 1)
  const stage = createCanvas(width, height)
  paintScene(stage, project, map, new Map([[png, ink]]))
  const ctx = stage.getContext('2d')
  assert.deepEqual([...ctx.getImageData(35, 40, 1, 1).data], [34, 168, 237, 255])
  assert.deepEqual([...ctx.getImageData(46, 40, 1, 1).data], [...cloth.getImageData(46, 40, 1, 1).data])
})

test('full fabric, legacy area, collar protection and art crop render independently', async () => {
  const size = 100
  const garment = createCanvas(size, size)
  const cloth = garment.getContext('2d')
  cloth.fillStyle = '#1b1b1b'
  cloth.fillRect(15, 10, 70, 80)
  const map = preparePhoto(garment, null, size, size)
  map.concrete = await loadImage(new URL('../dist/mockups/assets/concrete-202l.webp', import.meta.url))
  const ink = createCanvas(size, size)
  ink.getContext('2d').fillStyle = '#ff0000'
  ink.getContext('2d').fillRect(0, 0, size, size)
  const artwork = new Map([[png, ink]])
  const stage = createCanvas(size, size)
  const doc = editLayer(addLayer({ ...newProject(reference), shadow: 'none' }, png, 'Full', size, size, 1), { w: 1 })
  const render = (overrides = {}, neckline) => paintScene(stage, { ...doc, ...overrides }, map, artwork, neckline)
  const rgb = (x, y) => [...stage.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3)]
  const inkRGB = [255, 0, 0]
  const clothRGB = [27, 27, 27]
  render()
  assert.deepEqual(rgb(18, 70), inkRGB)
  assert.deepEqual(rgb(50, 15), inkRGB)
  assert.ok(rgb(2, 45).every(channel => channel >= 182 && channel <= 242))
  assert.ok(new Set(Array.from({ length: 12 }, (_, x) => rgb(x, 45).join(','))).size > 1)
  render({ printArea: undefined })
  assert.deepEqual(rgb(18, 70), clothRGB)
  render({ printArea: { x: .5, y: .5, w: .4, h: .4 } })
  assert.deepEqual(rgb(50, 50), inkRGB)
  assert.deepEqual(rgb(25, 50), clothRGB)
  render({ protectNeckline: true }, [[.4, .1], [.6, .1], [.6, .2], [.4, .2]])
  assert.deepEqual(rgb(50, 15), clothRGB)
  assert.deepEqual(rgb(65, 15), inkRGB)
  render({ protectNeckline: true, neckline: { x: .72, y: .28, w: .1, h: .1 } })
  assert.deepEqual(rgb(72, 28), clothRGB)
  const cropped = editLayer(doc, { crop: { x: .25, y: .5, w: .5, h: 1 }, rotation: 90 })
  render(cropped)
  assert.deepEqual(rgb(64, 30), inkRGB)
  assert.deepEqual(rgb(64, 70), clothRGB)
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(cropped))), cropped)
  assert.throws(() => validateProject({ ...doc, printArea: { x: .5, y: .5, w: 0, h: .4 } }), /inválido/)
})
