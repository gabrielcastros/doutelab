import * as THREE from 'three'
import { printArea } from './garment.js'

export function createSoftwareRenderer(maxPixels = 420_000) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: true })
  const viewProjection = new THREE.Matrix4()
  const transform = new THREE.Matrix4()
  const normalTransform = new THREE.Matrix3()
  const prints = {}
  let fabric = [222, 219, 210]
  let meshes = []
  let frame, depth

  function setSize(width, height) {
    const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)))
    canvas.width = Math.max(1, Math.floor(width * scale))
    canvas.height = Math.max(1, Math.floor(height * scale))
    frame = ctx.createImageData(canvas.width, canvas.height)
    depth = new Float32Array(canvas.width * canvas.height)
  }

  function setGarment(group) {
    meshes = group.children.map(mesh => {
      const { attributes, index } = mesh.geometry
      const { position, normal, color } = attributes
      return {
        mesh,
        positions: position.array,
        normals: normal.array,
        colors: color.array,
        triangles: index.array,
        projected: new Float32Array(position.count * 4)
      }
    })
  }

  function setColor(hex) {
    fabric = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16))
  }

  function setPrint(side, source) {
    prints[side] = source.getContext('2d').getImageData(0, 0, source.width, source.height)
  }

  function render(scene, camera) {
    if (!frame) return
    camera.updateMatrixWorld()
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    scene.updateMatrixWorld()
    const { width, height } = canvas
    const rgba = frame.data
    rgba.fill(0)
    depth.fill(Number.POSITIVE_INFINITY)

    for (const { mesh, positions, normals, colors, triangles, projected } of meshes) {
      const m = transform.multiplyMatrices(viewProjection, mesh.matrixWorld).elements
      const n = normalTransform.getNormalMatrix(mesh.matrixWorld).elements
      for (let i = 0, p = 0; i < positions.length; i += 3, p += 4) {
        const x = positions[i], y = positions[i + 1], z = positions[i + 2]
        const invW = 1 / (x * m[3] + y * m[7] + z * m[11] + m[15])
        projected[p] = ((x * m[0] + y * m[4] + z * m[8] + m[12]) * invW * .5 + .5) * width
        projected[p + 1] = (.5 - (x * m[1] + y * m[5] + z * m[9] + m[13]) * invW * .5) * height
        projected[p + 2] = (x * m[2] + y * m[6] + z * m[10] + m[14]) * invW
        projected[p + 3] = invW
      }

      for (let tri = 0; tri < triangles.length; tri += 3) {
        const ai = triangles[tri], bi = triangles[tri + 1], ci = triangles[tri + 2]
        const a = ai * 4, b = bi * 4, c = ci * 4
        const ax = projected[a], ay = projected[a + 1]
        const bx = projected[b], by = projected[b + 1]
        const cx = projected[c], cy = projected[c + 1]
        const area = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if (Math.abs(area) < .025 || projected[a + 3] <= 0 || projected[b + 3] <= 0 || projected[c + 3] <= 0) continue
        const left = Math.max(0, Math.floor(Math.min(ax, bx, cx)))
        const right = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)))
        const top = Math.max(0, Math.floor(Math.min(ay, by, cy)))
        const bottom = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)))
        const ap = ai * 3, bp = bi * 3, cp = ci * 3

        const isOutside = area < 0
        const sign = isOutside ? 1 : -1
        const lights = [ap, bp, cp].map(p => {
          const x = normals[p], y = normals[p + 1], z = normals[p + 2]
          const nx = sign * (n[0] * x + n[3] * y + n[6] * z)
          const ny = sign * (n[1] * x + n[4] * y + n[7] * z)
          const nz = sign * (n[2] * x + n[5] * y + n[8] * z)
          const diffuse = .79 + .20 * nz ** 2 + .075 * ny - .037 * nx * nz
          return diffuse * (isOutside ? 1 : .66)
        })

        for (let py = top; py <= bottom; py++) {
          const sampleY = py + .5 - cy
          for (let px = left; px <= right; px++) {
            const sampleX = px + .5 - cx
            const u = ((by - cy) * sampleX + (cx - bx) * sampleY) / area
            const v = ((cy - ay) * sampleX + (ax - cx) * sampleY) / area
            const w = 1 - u - v
            if (u < -.00001 || v < -.00001 || w < -.00001) continue
            const pixel = py * width + px
            const z = u * projected[a + 2] + v * projected[b + 2] + w * projected[c + 2]
            if (z >= depth[pixel]) continue
            depth[pixel] = z
            const ua = u * projected[a + 3], vb = v * projected[b + 3], wc = w * projected[c + 3]
            const wt = 1 / (ua + vb + wc)
            const wx = (ua * positions[ap] + vb * positions[bp] + wc * positions[cp]) * wt
            const wy = (ua * positions[ap + 1] + vb * positions[bp + 1] + wc * positions[cp + 1]) * wt
            const wz = (ua * positions[ap + 2] + vb * positions[bp + 2] + wc * positions[cp + 2]) * wt
            const light = (ua * lights[0] + vb * lights[1] + wc * lights[2]) * wt
            const fabricShade = (ua * colors[ap] + vb * colors[bp] + wc * colors[cp]) * wt
            const inkShade = Math.min(1.03, Math.max(.90, fabricShade))
            const texture = isOutside && (wz >= 0 ? prints.front : prints.back)
            let opacity = 0, index = 0
            if (texture) {
              const tx = Math.floor(texture.width * (.5 + (wz >= 0 ? wx : -wx) / printArea.width))
              const ty = Math.floor(texture.height * (.5 - (wy - printArea.center) / printArea.height))
              if (tx >= 0 && tx < texture.width && ty >= 0 && ty < texture.height) {
                index = (ty * texture.width + tx) * 4
                const fade = Math.min(1, Math.abs(wz) / .052)
                opacity = texture.data[index + 3] / 255 * fade
              }
            }
            const out = pixel * 4
            for (let channel = 0; channel < 3; channel++) {
              const ink = opacity ? texture.data[index + channel] : 0
              rgba[out + channel] = (fabric[channel] * fabricShade * (1 - opacity) + ink * inkShade * opacity) * light
            }
            rgba[out + 3] = 255
          }
        }
      }
    }

    ctx.putImageData(frame, 0, 0)
  }

  return { domElement: canvas, setSize, setGarment, setColor, setPrint, render }
}
