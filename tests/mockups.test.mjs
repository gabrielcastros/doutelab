import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import {
  dimensions, exportSize, newProject, addLayer, editLayer, moveLayer, duplicateLayer, deleteLayer,
  selectedLayer, createHistory, validateProject, finishes, lights, shadows
} from '../dist/mockups/state.js'
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

test('layer order, finish, duplicate, delete and history survive serializing the project', () => {
  const first = addLayer(newProject(reference), png, 'Front', 16, 8, 1)
  const original = selectedLayer(first)
  const pair = editLayer(duplicateLayer(first), { finish: 'puff' })
  const copy = selectedLayer(pair)
  assert.notEqual(copy.id, original.id)
  assert.notEqual(copy.x, original.x)
  assert.equal(pair.layers[0].finish, 'dtg')
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

test('masked artwork, all five finishes and 25 combinations render deterministically', async () => {
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
  assert.equal(inks.size, 5)
  const variations = new Set()
  for (const light of Object.keys(lights)) {
    for (const shadow of Object.keys(shadows)) {
      variations.add(render({ ...project, light, shadow }).toString('base64'))
    }
  }
  assert.equal(variations.size, 25)
  assert.deepEqual(render(project), gold)
})
