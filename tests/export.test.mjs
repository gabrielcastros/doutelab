import assert from 'node:assert/strict'
import { loadImage } from '@napi-rs/canvas'
import { unzipSync } from '../dist/vendor/fflate.js'
import { test } from 'node:test'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from '../dist/vendor/three.module.js'
import { exportMockup } from '../dist/export.js'
import { makeGarment } from '../dist/garment.js'
import { zimmCatalog } from '../dist/catalog.js'

globalThis.requestAnimationFrame = fn => setImmediate(fn)
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas')
    const canvas = createCanvas(300, 150)
    const getContext = canvas.getContext.bind(canvas)
    canvas.getContext = (type, options) => type === '2d' ? getContext(type, options) : null
    canvas.toBlob = callback => callback(new Blob([canvas.toBuffer('image/png')], { type: 'image/png' }))
    return canvas
  }
}

assert.deepEqual(zimmCatalog.map(model => model.label), ['Premium', 'Oversized', 'Estonada'])
for (const model of zimmCatalog) {
  const garment = makeGarment(model, new THREE.MeshPhysicalMaterial())
  for (const mesh of garment.children) {
    for (const key of ['position', 'normal', 'color']) assert.ok(mesh.geometry.getAttribute(key).array.every(Number.isFinite))
  }
}
const front = createCanvas(300, 270)
const back = createCanvas(300, 270)
for (const [canvas, color] of [[front, '#f44326'], [back, '#1ee871']]) {
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(99, 80, 102, 57)
}
const camera = new THREE.PerspectiveCamera(34, 1.3, .05, 30)
const target = new THREE.Vector3(0, .025, 0)
camera.position.set(1.36, .6, 4.65)
camera.lookAt(target)

async function capture(format) {
  const { blob, filename } = await exportMockup(format, {
    model: zimmCatalog[1], color: '#dedbd2', target, camera: camera.clone(), prints: { front, back }
  }, () => {})
  assert.equal(filename, 'doutelab-oversized.' + format)
  return blob
}

test('PNG export has the expected framing, transparent background and garment', async () => {
  const blob = await capture('png')
  assert.equal(blob.type, 'image/png')
  const png = await loadImage(Buffer.from(await blob.arrayBuffer()))
  assert.equal(png.width, 1800)
  assert.equal(png.height, 1385)
  const ctx = createCanvas(png.width, png.height).getContext('2d')
  ctx.drawImage(png, 0, 0)
  assert.equal(ctx.getImageData(0, 0, 1, 1).data[3], 0)
  assert.equal(ctx.getImageData(900, 692, 1, 1).data[3], 255)
})

test('ZIP export has five distinct square PNG views', async () => {
  const blob = await capture('zip')
  assert.equal(blob.type, 'application/zip')
  const entries = Object.entries(unzipSync(new Uint8Array(await blob.arrayBuffer())))
  assert.equal(entries.length, 5)
  const views = new Set()
  for (const [index, [name, bytes]] of entries.entries()) {
    assert.equal(name, 'doutelab-oversized-0' + (index + 1) + '.png')
    const image = await loadImage(Buffer.from(bytes))
    assert.equal(image.width, 1200)
    assert.equal(image.height, 1200)
    views.add(Buffer.from(bytes).toString('base64'))
  }
  assert.equal(views.size, 5)
})

test('GIF export has a 560 × 560 canvas and a complete animated stream', async () => {
  const blob = await capture('gif')
  assert.equal(blob.type, 'image/gif')
  const bytes = Buffer.from(await blob.arrayBuffer())
  assert.equal(bytes.toString('ascii', 0, 6), 'GIF89a')
  assert.equal(bytes.readUInt16LE(6), 560)
  assert.equal(bytes.readUInt16LE(8), 560)
  assert.equal(bytes.at(-1), 0x3b)
})
