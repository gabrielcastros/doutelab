const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10]
const svgNamespace = 'http://www.w3.org/2000/svg'
const maxArtworkSize = 2048
const maxFileSize = 24 * 1024 * 1024

function canvasOf(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export function thumbnail(image) {
  const canvas = canvasOf(76, 76)
  const ratio = Math.min(68 / image.width, 68 / image.height)
  const w = image.width * ratio
  const h = image.height * ratio
  canvas.getContext('2d').drawImage(image, (76 - w) / 2, (76 - h) / 2, w, h)
  return canvas.toDataURL()
}

function svgLength(raw) {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(px|in|cm|mm|pt|pc)?$/i.exec((raw ?? '').trim())
  if (!match) return 0
  const factors = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16 }
  return Number(match[1]) * factors[(match[2] ?? 'px').toLowerCase()]
}

function safeSvg(source) {
  if (/<!\s*(?:DOCTYPE|ENTITY)|<\?xml-stylesheet/i.test(source)) {
    throw new Error('Exporte um SVG independente, sem referências externas.')
  }
  const dom = new DOMParser().parseFromString(source, 'image/svg+xml')
  const svg = dom.documentElement
  if (dom.querySelector('parsererror') || svg.namespaceURI !== svgNamespace || svg.localName !== 'svg') {
    throw new Error('Não consegui abrir esse SVG. Tente exportar a arte novamente.')
  }

  const excluded = new Set(['script', 'foreignObject', 'animate', 'animateTransform', 'animateMotion', 'set', 'discard'])
  function hasExternalPaint(value) {
    return /@import/i.test(value) || [...value.matchAll(/url\(\s*(['"]?)([^)]+?)\1\s*\)/gi)]
      .some(match => !match[2].trim().startsWith('#') && !/^data:image\/(png|jpeg|webp);base64,/i.test(match[2].trim()))
  }
  for (const node of [svg, ...svg.querySelectorAll('*')]) {
    if (node.namespaceURI !== svgNamespace || excluded.has(node.localName)) {
      node.remove()
      continue
    }
    if (node.localName === 'style' && hasExternalPaint(node.textContent)) {
      throw new Error('Exporte um SVG com todos os recursos incorporados.')
    }
    for (const attribute of [...node.attributes]) {
      const { localName, value } = attribute
      if (/^on/i.test(localName) || attribute.name === 'xml:base') {
        node.removeAttributeNode(attribute)
        continue
      }
      const bundled = value.trim().startsWith('#') || /^data:image\/(png|jpeg|webp);base64,/i.test(value.trim())
      if ((localName === 'href' && value.trim() && !bundled) || hasExternalPaint(value)) {
        throw new Error('Exporte um SVG com todos os recursos incorporados.')
      }
    }
  }

  const viewBox = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  const hasBox = viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0
  const declaredWidth = svgLength(svg.getAttribute('width'))
  const declaredHeight = svgLength(svg.getAttribute('height'))
  const w = declaredWidth > 0 ? declaredWidth : hasBox && declaredHeight > 0 ? declaredHeight * viewBox[2] / viewBox[3] : hasBox ? viewBox[2] : 0
  const h = declaredHeight > 0 ? declaredHeight : hasBox && declaredWidth > 0 ? declaredWidth * viewBox[3] / viewBox[2] : hasBox ? viewBox[3] : 0
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error('O SVG precisa de dimensões ou de um viewBox válido.')
  }
  if (!hasBox) svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h)
  const resize = Math.min(1, maxArtworkSize / Math.max(w, h))
  const width = Math.max(1, Math.round(w * resize)), height = Math.max(1, Math.round(h * resize))
  svg.setAttribute('width', width)
  svg.setAttribute('height', height)
  const content = new XMLSerializer().serializeToString(svg)
  return { blob: new Blob([content], { type: 'image/svg+xml' }), width, height }
}

export async function readArtwork(file) {
  if (file.size > maxFileSize) throw new Error('Use um arquivo de até 24 MB.')
  const prefix = new Uint8Array(await file.slice(0, 24).arrayBuffer())
  const isPNG = pngSignature.every((value, i) => prefix[i] === value)
  let blob = file, width, height, kind

  if (isPNG) {
    if (prefix.length < 24 || String.fromCharCode(...prefix.slice(12, 16)) !== 'IHDR') {
      throw new Error('O cabeçalho deste PNG está incompleto.')
    }
    const info = new DataView(prefix.buffer)
    const w = info.getUint32(16), h = info.getUint32(20)
    if (!w || !h || w > 12000 || h > 12000 || w * h > 48_000_000) {
      throw new Error('A imagem é grande demais. Tente uma resolução menor.')
    }
    const resize = Math.min(1, maxArtworkSize / Math.max(w, h))
    width = Math.max(1, Math.round(w * resize))
    height = Math.max(1, Math.round(h * resize))
    blob = file.slice(0, file.size, 'image/png')
    kind = 'PNG'
  } else if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') {
    if (file.size > 5 * 1024 * 1024) throw new Error('Use um SVG de até 5 MB.')
    ;({ blob, width, height } = safeSvg(await file.text()))
    kind = 'SVG'
  } else {
    throw new Error('Escolha um arquivo PNG ou SVG.')
  }

  const url = URL.createObjectURL(blob)
  const image = new Image()
  try {
    image.src = url
    await image.decode()
    const canvas = canvasOf(width, height)
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, width, height)
    return { image: canvas, kind, name: file.name, thumb: thumbnail(canvas) }
  } catch {
    throw new Error('Não consegui renderizar a estampa. Tente exportar o arquivo novamente.')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function displayArtwork(art) {
  if (art.kind !== 'SVG' || !art.ink) return art.image
  if (art.tinted?.color === art.ink) return art.tinted.canvas
  const source = art.image
  const canvas = art.tinted?.canvas ?? canvasOf(source.width, source.height)
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = art.ink
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.globalCompositeOperation = 'source-over'
  art.tinted = { color: art.ink, canvas }
  return canvas
}

export async function starterArtworkFile() {
  const response = await fetch(new URL('./assets/design-here.png', import.meta.url))
  if (!response.ok) throw new Error('Não consegui abrir a estampa inicial.')
  return new File([await response.blob()], 'design-here.png', { type: 'image/png' })
}
