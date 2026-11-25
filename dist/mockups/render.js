import { displayArtwork } from '../artwork.js'
import { canvasOf } from './files.js'
import { clamp, printAreaOf } from './state.js'

const tintedArtwork = new WeakMap()
const linear = Float32Array.from({ length: 256 }, (_, i) =>
  i < 11 ? i / 3294.6 : ((i / 255 + .055) / 1.055) ** 2.4)
const srgb = Uint8Array.from({ length: 8193 }, (_, i) => {
  const value = i / 8192
  return Math.round(255 * (value < .003131 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055))
})
const toRGB = value => srgb[Math.round(clamp(value, 0, 1) * 8192)]

function luminance(data, offset) {
  return .2126 * linear[data[offset]] + .7152 * linear[data[offset + 1]] + .0722 * linear[data[offset + 2]]
}

export function preparePhoto(photo, mask, width, height) {
  const canvas = canvasOf(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(photo, 0, 0, width, height)
  const textile = context.getImageData(0, 0, width, height).data

  let hasAlpha = false
  let visible = false
  for (let i = 3; i < textile.length; i += 4) {
    if (textile[i] < 250) hasAlpha = true
    if (textile[i] > 0) visible = true
  }
  if (!visible) throw new Error('A foto não tem nenhum pixel visível.')

  const alpha = new Uint8Array(width * height)
  if (mask) {
    context.clearRect(0, 0, width, height)
    context.drawImage(mask, 0, 0, width, height)
    const pixels = context.getImageData(0, 0, width, height).data
    for (let i = 0; i < alpha.length; i++) {
      const j = i * 4
      alpha[i] = Math.max(pixels[j], pixels[j + 1], pixels[j + 2]) * pixels[j + 3] / 255
    }
  } else {
    // Transparent product photos already have an exact contour. For opaque photos,
    // infer dark fabric against a light field and let the user supply a precise mask.
    for (let i = 0; i < alpha.length; i++) {
      const j = i * 4
      const tone = Math.max(textile[j], textile[j + 1], textile[j + 2])
      alpha[i] = hasAlpha ? textile[j + 3] : 255 * clamp((190 - tone) / 36, 0, 1)
    }
  }

  const folds = new Float32Array(width * height)
  const detail = new Float32Array(width * height)
  const lowScale = Math.min(1, 60 / Math.max(width, height))
  const low = canvasOf(Math.max(1, Math.round(width * lowScale)), Math.max(1, Math.round(height * lowScale)))
  low.getContext('2d').drawImage(photo, 0, 0, low.width, low.height)
  context.clearRect(0, 0, width, height)
  context.drawImage(low, 0, 0, width, height)
  const blurred = context.getImageData(0, 0, width, height).data
  let total = 0, count = 0
  for (let i = 0; i < folds.length; i++) {
    const j = i * 4
    folds[i] = luminance(blurred, j)
    detail[i] = clamp((luminance(textile, j) + .008) / (folds[i] + .008), .55, 1.5)
    if (alpha[i] > 245) {
      total += folds[i]
      count++
    }
  }
  if (!count) throw new Error('Não encontrei o tecido. Use uma foto recortada ou adicione uma máscara.')
  return { width, height, textile, alpha, folds, detail, reference: Math.max(.008, total / count) }
}

const inkProfiles = {
  dtg: { opacity: .97, fold: .7, texture: .7, gloss: 0 },
  plastisol: { opacity: 1, fold: .48, texture: .3, gloss: .11 },
  water: { opacity: .79, fold: .8, texture: .86, gloss: 0 },
  puff: { opacity: 1, fold: .48, texture: .35, gloss: .08 },
  worn: { opacity: .94, fold: .76, texture: .78, gloss: 0 }
}

export function layerSize(layer, width, height) {
  const w = layer.w * width
  return [w, w * layer.height / layer.width]
}

export function layerPoint(layer, x, y, width, height) {
  const [w, h] = layerSize(layer, width, height)
  const radians = layer.rotation * Math.PI / 180
  const dx = (x - layer.x) * width
  const dy = (y - layer.y) * height
  const u = (dx * Math.cos(radians) + dy * Math.sin(radians)) / w + .5
  const v = (dy * Math.cos(radians) - dx * Math.sin(radians)) / h + .5
  return { x: u, y: v }
}

export function hitsLayer(layer, x, y, width, height) {
  const point = layerPoint(layer, x, y, width, height)
  const rect = layer.crop ?? { x: .5, y: .5, w: 1, h: 1 }
  return Math.abs(point.x - rect.x) <= rect.w / 2 && Math.abs(point.y - rect.y) <= rect.h / 2
}

function buildInk(layer, image, width, height) {
  const [w, h] = layerSize(layer, width, height)
  const radians = layer.rotation * Math.PI / 180
  const cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians))
  const radiusX = (cos * w + sin * h) / 2 + width * .025
  const radiusY = (sin * w + cos * h) / 2 + height * .025
  const cx = layer.x * width, cy = layer.y * height
  const left = Math.max(0, Math.floor(cx - radiusX)), top = Math.max(0, Math.floor(cy - radiusY))
  const right = Math.min(width, Math.ceil(cx + radiusX)), bottom = Math.min(height, Math.ceil(cy + radiusY))
  const canvas = canvasOf(right - left, bottom - top)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.translate(cx - left, cy - top)
  context.rotate(radians)
  if (layer.crop) {
    const { x, y, w: fractionX, h: fractionY } = layer.crop
    context.beginPath()
    context.rect((x - .5 - fractionX / 2) * w, (y - .5 - fractionY / 2) * h, fractionX * w, fractionY * h)
    context.clip()
  }
  context.drawImage(image, -w / 2, -h / 2, w, h)
  return { left, top, right, bottom, stride: canvas.width, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data }
}

function applyInk(data, map, alpha, area, layer, image) {
  const { width, height, folds, detail, reference } = map
  const { left, top, right, bottom, stride, pixels } = buildInk(layer, image, width, height)
  const profile = inkProfiles[layer.finish]
  const startX = area ? Math.max(left, Math.floor((area.x - area.w / 2) * width)) : left
  const startY = area ? Math.max(top, Math.floor((area.y - area.h / 2) * height)) : top
  const endX = area ? Math.min(right, Math.ceil((area.x + area.w / 2) * width)) : right
  const endY = area ? Math.min(bottom, Math.ceil((area.y + area.h / 2) * height)) : bottom
  const step = Math.max(1, Math.round(width / 300))
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const i = y * width + x
      if (!alpha[i]) continue
      if (layer.finish === 'direct') {
        const ink = ((y - top) * stride + x - left) * 4
        const opacity = pixels[ink + 3] * alpha[i] / 65025
        const target = i * 4
        for (let k = 0; k < 3; k++) data[target + k] = data[target + k] * (1 - opacity) + pixels[ink + k] * opacity
        continue
      }
      const gradientX = (folds[y * width + Math.min(x + step, width - 1)] - folds[y * width + Math.max(0, x - step)]) / reference
      const gradientY = (folds[Math.min(y + step, height - 1) * width + x] - folds[Math.max(y - step, 0) * width + x]) / reference
      const u = x - left + clamp(gradientX * .22, -.005, .005) * width
      const v = y - top + clamp(gradientY * .16, -.004, .004) * height
      if (u < 0 || v < 0 || u >= stride - 1 || v >= bottom - top - 1) continue
      const ix = Math.floor(u), iy = Math.floor(v)
      const j = (iy * stride + ix) * 4
      const fx = u - ix, fy = v - iy
      const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy]
      const samples = [j, j + 4, j + stride * 4, j + stride * 4 + 4]
      let coverage = 0, red = 0, green = 0, blue = 0
      for (let k = 0; k < 4; k++) {
        const pixel = samples[k]
        const weight = weights[k] * pixels[pixel + 3] / 255
        coverage += weight
        red += linear[pixels[pixel]] * weight
        green += linear[pixels[pixel + 1]] * weight
        blue += linear[pixels[pixel + 2]] * weight
      }
      if (coverage < .001) continue
      let opacity = alpha[i] / 255 * profile.opacity * coverage
      if (layer.finish === 'worn') {
        const sx = x / width, sy = y / height
        const crack = Math.sin(sx * 196 + Math.sin(sy * 61 + layer.seed) * 2.5)
        const fleck = Math.sin(sx * 649 + sy * 477 + layer.seed) * Math.cos(sy * 863 - sx * 734)
        if (Math.abs(crack) < .065 && Math.sin(sy * 173 + layer.seed) > .15) opacity *= .13
        opacity *= clamp(.94 + fleck * .38, .5, 1)
      }
      const fold = clamp(Math.sqrt((folds[i] + .008) / (reference + .008)), .35, 1.46)
      const tone = (1 + (fold - 1) * profile.fold) * (1 + (detail[i] - 1) * profile.texture)
      let relief = 0
      if (layer.finish === 'puff') {
        const bevel = Math.max(1, Math.round(width / 600))
        const above = pixels[Math.max(j % (stride * 4), j - stride * 4 * bevel) + 3] / 255
        const below = pixels[Math.min(j + stride * 4 * bevel, pixels.length - stride * 4 + j % (stride * 4)) + 3] / 255
        relief = (below - above) * .14
      }
      const sheen = profile.gloss * Math.max(0, fold - .75) + relief
      const color = [red, green, blue]
      const offset = i * 4
      for (let k = 0; k < 3; k++) {
        const ink = clamp(color[k] / coverage * tone + sheen, 0, 1)
        data[offset + k] = toRGB(linear[data[offset + k]] * (1 - opacity) + ink * opacity)
      }
    }
  }
}

function projection(kind, x, y, softness) {
  const edge = (distance, width) => clamp((width - distance) / (.007 + softness * .067) + .5, 0, 1)
  const u = x + y * .27
  const v = y - x * .17
  if (kind === 'window' || kind === 'diffuse') {
    const frame = Math.max(Math.abs(u - .36) - .23, Math.abs(v - .50) - .33)
    const bar = Math.min(Math.abs(u - .36), Math.abs(v - .50))
    return Math.max(1 - edge(frame, 0), edge(bar, kind === 'diffuse' ? .026 : .014)) * (kind === 'diffuse' ? .57 : .82)
  }
  if (kind === 'blinds') {
    const line = Math.abs((((v * 15) % 1) + 1) % 1 - .5) / 15
    return edge(line, .014)
  }
  const trunk = Math.abs(u - .28 - Math.sin(v * 9) * .13)
  const limb = Math.abs(Math.sin(v * 18 + u * 6)) * .1
  const leaves = Math.abs(Math.sin(u * 167 + v * 59) * Math.cos(v * 112 - u * 52))
  return Math.max(edge(trunk, .013), edge(limb, .008) * edge(trunk, .18),
    clamp((leaves - .47) * 3, 0, 1) * edge(trunk, .21) * .58)
}

export function photoFrame(project, sourceWidth, sourceHeight, width, height) {
  const scale = Math.min(width / sourceWidth, height / sourceHeight) * project.zoom
  const w = sourceWidth * scale, h = sourceHeight * scale
  return {
    x: (width - w) / 2 + project.cropX * width * .5,
    y: (height - h) / 2 + project.cropY * height * .5,
    w, h
  }
}

function printableMask(map, project, neckline) {
  const { width, height, alpha } = map
  const rect = project.neckline
  if (!project.protectNeckline || (!rect && !neckline?.length)) return alpha

  const context = canvasOf(width, height).getContext('2d', { willReadFrequently: true })
  if (rect) {
    context.fillRect((rect.x - rect.w / 2) * width, (rect.y - rect.h / 2) * height, rect.w * width, rect.h * height)
  } else {
    context.beginPath()
    const [[x, y], ...points] = neckline
    context.moveTo(x * width, y * height)
    for (const [u, v] of points) context.lineTo(u * width, v * height)
    context.closePath()
    context.fill()
  }
  const excluded = context.getImageData(0, 0, width, height).data
  return Uint8Array.from(alpha, (value, i) => Math.round(value * (1 - excluded[i * 4 + 3] / 255)))
}

export function paintScene(canvas, project, map, artwork, neckline, composition = canvas) {
  const { width, height, textile, alpha } = map
  const medium = canvasOf(width, height)
  const context = medium.getContext('2d')
  const pixels = context.createImageData(width, height)
  const { data } = pixels
  data.set(textile)
  for (let i = 0; i < alpha.length; i++) {
    const j = i * 4
    if (alpha[i] === 255 || data[j + 3] !== 255) continue
    const low = Math.min(data[j], data[j + 1], data[j + 2])
    const high = Math.max(data[j], data[j + 1], data[j + 2])
    const paleNeutral = clamp((low - 194) / 31, 0, 1) * clamp((24 - high + low) / 16, 0, 1)
    data[j + 3] *= 1 - paleNeutral * (1 - alpha[i] / 255)
  }

  if (project.layers.length) {
    const area = printAreaOf(project)
    const mask = printableMask(map, project, neckline)
    for (const layer of project.layers) {
      const image = artwork.get(layer.source)
      if (!image) continue
      if (layer.kind !== 'SVG' || !layer.ink) {
        applyInk(data, map, mask, area, layer, image)
        continue
      }
      let art = tintedArtwork.get(image)
      if (!art) {
        art = { image, kind: 'SVG' }
        tintedArtwork.set(image, art)
      }
      art.ink = layer.ink
      applyInk(data, map, mask, area, layer, displayArtwork(art))
    }
  }

  context.putImageData(pixels, 0, 0)
  const output = canvas.getContext('2d')
  if (map.concrete) {
    const image = map.concrete
    const scale = Math.max(canvas.width / image.width, canvas.height / image.height)
    const width = image.width * scale, height = image.height * scale
    output.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
  } else {
    output.fillStyle = '#e9e7e2'
    output.fillRect(0, 0, canvas.width, canvas.height)
  }

  const left = (canvas.width - composition.width) / 2
  const top = (canvas.height - composition.height) / 2
  const frame = photoFrame(project, width, height, composition.width, composition.height)
  frame.x += left
  frame.y += top
  output.save()
  output.beginPath()
  output.rect(left, top, composition.width, composition.height)
  output.clip()
  output.imageSmoothingQuality = 'high'
  output.drawImage(medium, frame.x, frame.y, frame.w, frame.h)
  output.restore()

  if (project.light !== 'original' || project.shadow !== 'none') {
    const { width, height } = canvas
    const lit = output.getImageData(0, 0, width, height)
    const { data } = lit
    const gains = {
      original: [1, 1, 1], studio: [1.09, 1.09, 1.1], golden: [1.2, 1.02, .73],
      cool: [.84, 1.03, 1.18], dramatic: [1.02, .99, .97]
    }[project.light]
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const j = (y * width + x) * 4
        const u = clamp((x - left) / composition.width, 0, 1)
        const v = clamp((y - top) / composition.height, 0, 1)
        let exposure = 1
        if (project.light === 'studio') exposure = 1.06 - Math.hypot(u - .46, v - .38) * .15
        if (project.light === 'dramatic') exposure = 1.26 - clamp(u * .64 + v * .25, 0, .83)
        if (project.shadow !== 'none') {
          const softness = project.shadow === 'diffuse' ? Math.max(.65, project.softness) : project.softness
          exposure *= 1 - project.intensity * .82 *
            projection(project.shadow, u - project.shadowX, v - project.shadowY, softness)
        }
        for (let k = 0; k < 3; k++) data[j + k] = toRGB(linear[data[j + k]] * exposure * gains[k])
      }
    }
    output.putImageData(lit, 0, 0)
  }

  return frame
}
