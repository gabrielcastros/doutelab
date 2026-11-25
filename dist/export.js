import * as THREE from 'three'
import { makeClothMaterial, makeGarment } from './garment.js'
import { createStudioRenderer, createStudioScene, makePrintTexture } from './studio.js'

const gifFrameCount = 56
const gifDelay = 50
const zipImageCount = 5
const xAxis = new THREE.Vector3(1, 0, 0)

function makeCapture(snapshot, width, height, opaque) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const output = canvas.getContext('2d', { willReadFrequently: opaque })
  const stage = createStudioRenderer({ maxPixels: width * height })
  const { renderer, context } = stage
  renderer.setSize(width, height, false)
  const scene = createStudioScene()
  const front = makePrintTexture(snapshot.prints.front, renderer)
  const back = makePrintTexture(snapshot.prints.back, renderer)
  const material = makeClothMaterial(front, back)
  material.color.set(snapshot.color)
  const garment = makeGarment(snapshot.model, material)
  scene.add(garment)
  if (!context) {
    renderer.setGarment(garment)
    renderer.setColor(snapshot.color)
    renderer.setPrint('front', snapshot.prints.front)
    renderer.setPrint('back', snapshot.prints.back)
  }
  const bounds = new THREE.Box3().setFromObject(garment)
  const sphere = bounds.getBoundingSphere(new THREE.Sphere())
  const background = output.createRadialGradient(width * .49, height * .40, 0, width * .49, height * .40, width * .72)
  background.addColorStop(0, '#484b54')
  background.addColorStop(.68, '#33363f')
  background.addColorStop(1, '#25272e')

  return {
    output, canvas, sphere,
    render(camera, xTurn = 0) {
      garment.quaternion.setFromAxisAngle(xAxis, xTurn)
      garment.position.copy(sphere.center).applyQuaternion(garment.quaternion).negate().add(sphere.center)
      renderer.render(scene, camera)
      if (context?.isContextLost()) throw new Error('A renderização foi interrompida.')
      output.clearRect(0, 0, width, height)
      if (opaque) {
        output.fillStyle = background
        output.fillRect(0, 0, width, height)
      }
      output.drawImage(renderer.domElement, 0, 0, width, height)
    },
    dispose() {
      garment.traverse(mesh => mesh.geometry?.dispose())
      front.dispose()
      back.dispose()
      material.bumpMap.dispose()
      material.dispose()
      renderer.dispose?.()
      renderer.forceContextLoss?.()
    }
  }
}

function framing(camera, center, radius, sourceTarget) {
  const orbit = new THREE.Spherical().setFromVector3(camera.position.clone().sub(sourceTarget))
  camera.aspect = 1
  camera.fov = 34
  orbit.radius = Math.max(orbit.radius, radius * 1.10 / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)))
  camera.updateProjectionMatrix()
  return turn => {
    camera.position.setFromSpherical(new THREE.Spherical(orbit.radius, orbit.phi, orbit.theta + turn)).add(center)
    camera.lookAt(center)
  }
}

function encodePng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('O navegador não conseguiu codificar o PNG.'))
    }, 'image/png')
  })
}

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve))
}

async function encodeGif(capture, camera, progress) {
  const { GIFEncoder, applyPalette, quantize } = await import('./vendor/gifenc.js')
  const { width, height } = capture.canvas
  const encoder = GIFEncoder()
  for (let i = 0; i < gifFrameCount; i++) {
    capture.render(camera, Math.PI * 2 * i / gifFrameCount)
    const { data } = capture.output.getImageData(0, 0, width, height)
    const palette = quantize(data, 256)
    const indexed = applyPalette(data, palette)
    encoder.writeFrame(indexed, width, height, { palette, delay: gifDelay, repeat: 0 })
    if ((i + 1) % 4 === 0) {
      progress('Gerando GIF… ' + Math.round(100 * (i + 1) / gifFrameCount) + '%')
      await nextFrame()
    }
  }
  encoder.finish()
  return new Blob([encoder.bytesView()], { type: 'image/gif' })
}

async function encodeZip(capture, camera, orbit, filename, progress) {
  const { zipSync } = await import('./vendor/fflate.js')
  const entries = {}
  for (let i = 0; i < zipImageCount; i++) {
    progress('Renderizando foto ' + (i + 1) + ' de ' + zipImageCount + '…')
    orbit(Math.PI * 2 * i / zipImageCount)
    capture.render(camera)
    const png = await encodePng(capture.canvas)
    entries[filename + '-' + String(i + 1).padStart(2, '0') + '.png'] = new Uint8Array(await png.arrayBuffer())
  }
  return new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' })
}

export async function exportMockup(format, snapshot, progress) {
  const { camera } = snapshot
  const slug = snapshot.model.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
  const filename = 'doutelab-' + slug
  const resolution = format === 'gif' ? 560 : format === 'zip' ? 1200 : 1800
  const aspect = format === 'png' ? camera.aspect : 1
  const capture = makeCapture(
    snapshot,
    Math.max(1, Math.round(resolution * Math.min(aspect, 1))),
    Math.max(1, Math.round(resolution / Math.max(aspect, 1))),
    format === 'gif'
  )
  try {
    let blob
    if (format === 'png') {
      capture.render(camera)
      blob = await encodePng(capture.canvas)
    } else {
      const orbit = framing(camera, capture.sphere.center, capture.sphere.radius, snapshot.target)
      if (format === 'gif') {
        orbit(0)
        blob = await encodeGif(capture, camera, progress)
      } else {
        blob = await encodeZip(capture, camera, orbit, filename, progress)
      }
    }
    return { blob, filename: filename + '.' + format }
  } finally {
    capture.dispose()
  }
}
