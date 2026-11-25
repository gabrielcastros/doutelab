import * as THREE from 'three'
import { createSoftwareRenderer } from './software-renderer.js'

export function createStudioRenderer({ pixelRatio = 1, maxPixels } = {}) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('webgl2', {
    antialias: true, alpha: true, powerPreference: 'high-performance'
  })
  if (!context) return { renderer: createSoftwareRenderer(maxPixels), context }

  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(pixelRatio)
  return { renderer, context }
}

export function createStudioScene() {
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#faf9f8', '#b2b4b9', 2.35))
  for (const [intensity, position] of [
    [.64, [-3, 4, 4]], [.41, [3, 1.4, 3]],
    [.62, [2, 3, -4]], [.34, [-3, 1.2, -3]]
  ]) {
    const light = new THREE.DirectionalLight('#fffdfb', intensity)
    light.position.set(...position)
    scene.add(light)
  }
  return scene
}

export function makePrintTexture(canvas, renderer) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  if (renderer.isWebGLRenderer) texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
  return texture
}
