import { dimensions, imageData } from './state.js'

export const projectLimit = 80 * 1024 * 1024

export function canvasOf(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export function canvasBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('Não consegui codificar a imagem.')),
    type, quality
  ))
}

export function asDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Não consegui ler este arquivo.'))
    reader.readAsDataURL(blob)
  })
}

export async function loadImage(source) {
  const image = new Image()
  image.src = source
  try {
    await image.decode()
  } catch {
    throw new Error('Não consegui abrir a imagem. Confira o formato e tente novamente.')
  }
  if (image.naturalWidth * image.naturalHeight > 48_000_000 ||
      Math.max(image.naturalWidth, image.naturalHeight) > 12000) {
    throw new Error('A imagem excede o tamanho suportado.')
  }
  return image
}

export async function localImage(file, upscale) {
  if (!file?.size || file.size > 24 * 1024 * 1024) {
    throw new Error('Escolha uma imagem de até 24 MB.')
  }
  const original = await asDataURL(file)
  if (!imageData.test(original)) throw new Error('Escolha um PNG, JPEG, WebP ou AVIF.')
  const image = await loadImage(original)
  const [width, height] = dimensions(image.width, image.height, upscale ? 1000 : 0)
  if (width * height > 48_000_000 || Math.max(width, height) > 12000) {
    throw new Error('A proporção da foto é grande demais para a ampliação.')
  }
  if (width === image.width && height === image.height) return { source: original, image, upscaled: false }
  const canvas = canvasOf(width, height)
  const context = canvas.getContext('2d')
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  const source = await asDataURL(await canvasBlob(canvas, 'image/webp', .98))
  return { source, image: await loadImage(source), upscaled: true }
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
