import * as THREE from 'three'
import { makeOversized } from './oversized.js'
import { makePremium } from './premium.js'

const columns = 96
const rows = 64
const sleeveBottom = 42
const sleeveTop = 58
const armHalfWidth = 9

export const printArea = { width: 3.4, height: 3.04, center: .04 }

const regular = { waist: .65, height: 2.21, depth: .237, sleeve: .88, cuff: .186, drop: .34, collar: .232, neckDip: .205 }
const measurements = {
  regular
}

const finishes = {
  cotton: { roughness: .96, sheen: .12, bump: .0025, mottling: .018, edgeFade: 0 },
  washed: { roughness: .99, sheen: .08, bump: .0035, mottling: .14, edgeFade: .18 }
}

function clothPoint(row, column, size) {
  // Both meshes sample the same rounded armhole perimeter.
  const center = column < columns / 2 ? columns / 4 : columns * 3 / 4
  const armHeight = (sleeveTop - sleeveBottom) / 2
  const armCenter = (sleeveTop + sleeveBottom) / 2
  const u = (column - center) / armHalfWidth
  const v = (row - armCenter) / armHeight
  const corner = THREE.MathUtils.smoothstep(Math.abs(u * v), .42, 1) *
    (1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(u), Math.abs(v)), 1, 1.55))
  const t = (row - corner * v * 1.45) / rows
  const angle = 2 * Math.PI * (column - corner * u * 1.6) / columns - Math.PI / 2
  const co = Math.cos(angle)
  const si = Math.sin(angle)
  const neck = THREE.MathUtils.smoothstep(t, .64, 1)
  const shoulder = Math.max(0, (t - .75) / .25) ** 2.45
  const bodyWidth = size.waist * (1 - .029 * Math.sin(Math.PI * t) + .037 * Math.sin(Math.PI * t / 2) ** 5)
  const width = THREE.MathUtils.lerp(bodyWidth, size.collar, shoulder)
  const frontNeck = Math.max(0, si) ** 2.45 * size.neckDip + Math.max(0, -si) ** 2 * .078
  const shoulderLift = .014 * co ** 2 * Math.sin(Math.PI * shoulder)
  const neckShoulderBlend = .054 * co ** 6 * (Math.max(0, t - .91) / .09) ** 3
  const hemWave = (.014 * Math.cos(angle * 3 + .35) + .009 * Math.sin(angle * 7)) * (1 - t) ** 7
  const folds = (.015 * Math.sin(angle * 7 + .6 + t * 2.3) + .009 * Math.sin(angle * 13 - t * 5.5)) *
    (1 - neck) * (.45 + .55 * (1 - t))
  const sideCrease = .015 * Math.sin(angle * 4 + t * 7) * Math.sin(Math.PI * t) ** 2
  const section = si * (1 + .16 * co ** 2 * (1 - neck))
  const collarDepth = size.collar * (si >= 0 ? .72 : .58)

  return new THREE.Vector3(
    co * (width + folds) + .009 * Math.sin(Math.PI * t),
    -1.075 + size.height * t - frontNeck * neck + shoulderLift - neckShoulderBlend + hemWave,
    section * (THREE.MathUtils.lerp(size.depth, collarDepth, neck) + folds + sideCrease)
  )
}

function fabricShade(point, finish, seam, shadow) {
  const { x, y, z } = point
  // Variation at several scales gives a faded wash without a repeating tile.
  const clouds = Math.sin(x * 17 + y * 10 + Math.sin(y * 18 - z * 9) * 1.6) *
    Math.cos(y * 13 - z * 14 + Math.sin(x * 15) * 1.7)
  const flecks = Math.sin(x * 83 + y * 44 + z * 36) * Math.cos(y * 65 - x * 48)
  return shadow + finish.mottling * (clouds * .8 + flecks * .33) +
    finish.edgeFade * seam * (1 + clouds * .35)
}

function bodyShade(row, column, point, finish) {
  const neck = Math.exp(-(((rows - row) / 1.2) ** 2))
  const hem = Math.exp(-((row / 1.9) ** 2))
  const armX = Math.min(Math.abs(column - columns / 4), Math.abs(column - columns * 3 / 4))
  const armY = Math.abs(row - (sleeveTop + sleeveBottom) / 2)
  const arm = Math.max(armX / armHalfWidth, armY / ((sleeveTop - sleeveBottom) / 2))
  const seam = Math.max(hem, neck, Math.exp(-(((arm - 1) * 19) ** 2)) * .43)
  return fabricShade(point, finish, seam, 1 - .07 * seam)
}

const collarRings = [
  { contraction: .025, lift: .006, brightness: .98 },
  { contraction: .055, lift: .008, brightness: .94 },
  { contraction: .077, lift: .004, brightness: .88 },
  { contraction: .086, lift: -.007, brightness: .81 },
  { contraction: .079, lift: -.019, brightness: .78 }
]

function smoothWrap(geometry, segments, rings) {
  const normals = geometry.getAttribute('normal')
  const average = new THREE.Vector3()
  const edge = new THREE.Vector3()
  for (let row = 0; row < rings; row++) {
    const lo = row * (segments + 1)
    const hi = lo + segments
    average.fromBufferAttribute(normals, lo).add(edge.fromBufferAttribute(normals, hi)).normalize()
    normals.setXYZ(lo, average.x, average.y, average.z)
    normals.setXYZ(hi, average.x, average.y, average.z)
  }
}

function buildBody(size, material, finish) {
  const pos = [], shades = [], uv = [], index = []
  const lastRow = rows + collarRings.length
  for (let row = 0; row <= lastRow; row++) {
    for (let col = 0; col <= columns; col++) {
      const point = clothPoint(Math.min(row, rows), col, size)
      let shade = bodyShade(Math.min(row, rows), col, point, finish)
      const collar = collarRings[row - rows - 1]
      if (collar) {
        point.x *= 1 - collar.contraction
        point.z *= 1 - collar.contraction
        point.y += collar.lift
        shade *= collar.brightness + .013 * Math.cos(col * Math.PI / 2)
      }
      pos.push(point.x, point.y, point.z)
      shades.push(shade, shade, shade)
      uv.push(col / columns, row / rows)
    }
  }

  for (let row = 0; row < lastRow; row++) {
    for (let col = 0; col < columns; col++) {
      if (row >= sleeveBottom && row < sleeveTop &&
          [columns / 4, columns * 3 / 4].some(c => col >= c - armHalfWidth && col < c + armHalfWidth)) continue

      const a = row * (columns + 1) + col
      const b = a + columns + 1
      index.push(a, b, b + 1, a, b + 1, a + 1)
    }
  }

  const geometry = clothGeometry(pos, shades, uv, index)
  smoothWrap(geometry, columns, lastRow + 1)
  return new THREE.Mesh(geometry, material)
}

function opening(center) {
  const start = center - armHalfWidth
  const end = center + armHalfWidth
  const ring = []
  for (let col = start; col < end; col++) ring.push([sleeveBottom, col])
  for (let row = sleeveBottom; row < sleeveTop; row++) ring.push([row, end])
  for (let col = end; col > start; col--) ring.push([sleeveTop, col])
  for (let row = sleeveTop; row > sleeveBottom; row--) ring.push([row, start])
  return ring
}

function smoothArmhole(body, sleeve, openingRows) {
  const bodyNormals = body.geometry.getAttribute('normal')
  const sleeveNormals = sleeve.geometry.getAttribute('normal')
  const bodyNormal = new THREE.Vector3()
  const sleeveNormal = new THREE.Vector3()
  for (const [i, [row, col]] of openingRows.entries()) {
    const index = row * (columns + 1) + col
    bodyNormal.fromBufferAttribute(bodyNormals, index)
    sleeveNormal.fromBufferAttribute(sleeveNormals, i)
    bodyNormal.add(sleeveNormal).normalize()
    bodyNormals.setXYZ(index, bodyNormal.x, bodyNormal.y, bodyNormal.z)
    sleeveNormals.setXYZ(i, bodyNormal.x, bodyNormal.y, bodyNormal.z)
    if (i === 0) sleeveNormals.setXYZ(openingRows.length, bodyNormal.x, bodyNormal.y, bodyNormal.z)
  }
}

function buildSleeve(size, side, material, finish, body) {
  const coordinates = opening(side > 0 ? columns / 4 : columns * 3 / 4)
  const ring = coordinates.map(([row, col]) => clothPoint(row, col, size))
  const baseCenter = ring.reduce((p, v) => p.add(v), new THREE.Vector3()).divideScalar(ring.length)
  const cuffCenter = new THREE.Vector3(side * size.sleeve, size.drop, -.015)
  const cuffUp = new THREE.Vector3(side * .85, .527, 0)
  const pos = [], shades = [], uv = [], index = []
  const tubeSteps = 22
  const drape = cuffCenter.clone().sub(baseCenter).normalize()
  const halfHeight = (size.height / rows) * (sleeveTop - sleeveBottom) / 2

  for (let row = 0; row <= tubeSteps; row++) {
    const t = row / tubeSteps
    for (let col = 0; col <= ring.length; col++) {
      const start = ring[col % ring.length]
      const angle = Math.atan2((start.y - baseCenter.y) / halfHeight, (start.z - baseCenter.z) / (size.depth * .72))
      const bend = Math.sin(Math.PI * t)
      const fabric = 1 + .032 * Math.sin(angle * 5 + t * 3) + .023 * Math.sin(angle * 8 - t * 5)
      const end = cuffCenter.clone()
        .addScaledVector(cuffUp, Math.sin(angle) * size.cuff * fabric)
        .add(new THREE.Vector3(0, 0, Math.cos(angle) * size.cuff * .83 * fabric))
      const shoulder = start.clone().add(new THREE.Vector3(side * .107, -.035 - .025 * Math.cos(angle) ** 2, 0))
      const beforeCuff = end.clone().addScaledVector(drape, -.14)
      const rest = 1 - t
      const p = start.clone().multiplyScalar(rest ** 3)
        .addScaledVector(shoulder, 3 * rest ** 2 * t)
        .addScaledVector(beforeCuff, 3 * rest * t ** 2)
        .addScaledVector(end, t ** 3)
      p.y += bend * Math.sin(angle * 2 + side * .17) * .026
      p.z += bend * Math.cos(angle * 4 + side * .23) * .021
      const cuffSeam = Math.exp(-(((1 - t) * 15) ** 2))
      const join = Math.exp(-((t * 14) ** 2)) * .65
      const seam = Math.max(cuffSeam, join)
      const shade = fabricShade(p, finish, seam, 1 - .12 * seam)
      pos.push(p.x, p.y, p.z)
      shades.push(shade, shade, shade)
      uv.push(col / ring.length, t * .45)
    }
  }

  const ringWidth = ring.length + 1
  const first = new THREE.Vector3().fromArray(pos)
  const along = new THREE.Vector3().fromArray(pos, 3 * ringWidth).sub(first)
  const around = new THREE.Vector3().fromArray(pos, 3).sub(first)
  const radial = first.clone().sub(baseCenter).setX(0)
  const reverse = along.cross(around).dot(radial) < 0

  for (let row = 0; row < tubeSteps; row++) {
    for (let col = 0; col < ring.length; col++) {
      const a = row * ringWidth + col
      const b = a + ringWidth
      if (reverse) index.push(a, b + 1, b, a, a + 1, b + 1)
      else index.push(a, b, b + 1, a, b + 1, a + 1)
    }
  }

  const geometry = clothGeometry(pos, shades, uv, index)
  smoothWrap(geometry, ring.length, tubeSteps + 1)
  const sleeve = new THREE.Mesh(geometry, material)
  smoothArmhole(body, sleeve, coordinates)
  return sleeve
}

function clothGeometry(pos, shades, uv, index) {
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geom.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3))
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geom.setIndex(index)
  geom.computeVertexNormals()
  return geom
}

function makeWeave() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 96
  const ctx = canvas.getContext('2d')
  const pixels = ctx.createImageData(96, 96)
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 96; x++) {
      const i = 4 * (y * 96 + x)
      const level = 126 + 18 * Math.cos(x * Math.PI / 2) + 16 * Math.cos(y * Math.PI / 2 + (x & 1) * .4)
      pixels.data.set([level, level, level, 255], i)
    }
  }
  ctx.putImageData(pixels, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(5, 5)
  return texture
}

export function makeClothMaterial(front, back) {
  const material = new THREE.MeshPhysicalMaterial({
    color: '#dedbd2', vertexColors: true, roughness: .89,
    side: THREE.DoubleSide, specularIntensity: .27, sheen: .12, sheenColor: '#c8beb3', sheenRoughness: .92,
    bumpMap: makeWeave(), bumpScale: .006
  })

  material.onBeforeCompile = shader => {
    shader.uniforms.frontPrint = { value: front }
    shader.uniforms.backPrint = { value: back }
    shader.uniforms.printPlane = { value: new THREE.Vector3(printArea.width, printArea.height, printArea.center) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 garmentPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ngarmentPosition = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 garmentPosition;\nuniform sampler2D frontPrint;\nuniform sampler2D backPrint;\nuniform vec3 printPlane;')
      .replace('#include <map_fragment>', `
        #include <map_fragment>
        vec2 printUV = vec2(garmentPosition.x, garmentPosition.y - printPlane.z) / printPlane.xy + 0.5;
        vec4 art;
        if (garmentPosition.z >= 0.0) {
          art = texture2D(frontPrint, printUV);
        } else {
          art = texture2D(backPrint, vec2(1.0 - printUV.x, printUV.y));
        }
        float frontFacingPrint = smoothstep(0.0, 0.052, abs(garmentPosition.z));
        diffuseColor.rgb = mix(diffuseColor.rgb, art.rgb * clamp(vColor.rgb, 0.90, 1.03), art.a * frontFacingPrint * float(gl_FrontFacing));
        if (!gl_FrontFacing) diffuseColor.rgb *= .64;
      `)
  }

  return material
}

export function makeGarment(model, material) {
  const finish = finishes[model.finish]
  material.roughness = finish.roughness
  material.sheen = finish.sheen
  material.bumpScale = finish.bump
  if (model.fit === 'oversized') return makeOversized(material)
  if (model.fit === 'premium') return makePremium(material)
  const size = measurements[model.fit]
  const group = new THREE.Group()
  const body = buildBody(size, material, finish)
  group.add(body, buildSleeve(size, -1, material, finish, body), buildSleeve(size, 1, material, finish, body))
  return group
}
