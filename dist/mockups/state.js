export const finishes = {
  dtg: 'DTG', plastisol: 'Plastisol', water: 'À base d’água', puff: 'Puff', worn: 'Desgastado'
}

export const lights = {
  original: 'Original', studio: 'Estúdio', golden: 'Dourada', cool: 'Fria', dramatic: 'Dramática'
}

export const shadows = {
  none: 'Sem sombra adicional', window: 'Janela', diffuse: 'Janela difusa', blinds: 'Persiana', branches: 'Galhos'
}

export const formats = {
  original: 'Proporção original', horizontal: 'Horizontal · 1920 × 1080', vertical: 'Vertical · 1080 × 1920'
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export function dimensions(width, height, minSide = 0) {
  const ratio = Math.max(1, minSide / Math.min(width, height))
  return [Math.round(width * ratio), Math.round(height * ratio)]
}

export function exportSize(format, width, height) {
  if (format === 'horizontal') return [1920, 1080]
  if (format === 'vertical') return [1080, 1920]
  return dimensions(width, height, Math.min(1920 / Math.max(width, height) * Math.min(width, height), 1080))
}

export function newProject(scene) {
  return {
    version: 1, scene: { id: scene.id, version: scene.version }, layers: [], selected: null,
    zone: { ...scene.zone }, light: 'original', shadow: 'none',
    intensity: .55, softness: .35, shadowX: 0, shadowY: 0,
    format: 'original', zoom: 1, cropX: 0, cropY: 0
  }
}

export function createHistory() {
  const undo = [], redo = []
  return {
    get canUndo() { return undo.length > 0 },
    get canRedo() { return redo.length > 0 },
    record(previous) {
      undo.push(previous)
      if (undo.length > 24) undo.shift()
      redo.length = 0
    },
    undo(project) {
      if (!undo.length) return project
      redo.push(project)
      return undo.pop()
    },
    redo(project) {
      if (!redo.length) return project
      undo.push(project)
      return redo.pop()
    }
  }
}

export function selectedLayer(project) {
  return project.layers.find(layer => layer.id === project.selected)
}

export function addLayer(project, source, name, width, height, sceneAspect) {
  const { zone } = project
  const aspect = width / height
  const w = Math.min(zone.w * .64, zone.h * aspect / sceneAspect * .64)
  const layer = {
    id: crypto.randomUUID(), name, source, width, height, finish: 'dtg',
    x: zone.x, y: zone.y, w, rotation: 0, seed: Math.floor(Math.random() * 65536)
  }
  return { ...project, layers: [...project.layers, layer], selected: layer.id }
}

export function editLayer(project, change) {
  return {
    ...project,
    layers: project.layers.map(layer => layer.id === project.selected ? { ...layer, ...change } : layer)
  }
}

export function duplicateLayer(project) {
  const index = project.layers.findIndex(layer => layer.id === project.selected)
  if (index < 0) return project
  const original = project.layers[index]
  const copy = {
    ...original, id: crypto.randomUUID(), name: original.name + ' · cópia',
    x: clamp(original.x + .018, 0, 1), y: clamp(original.y + .018, 0, 1)
  }
  const layers = project.layers.slice()
  layers.splice(index + 1, 0, copy)
  return { ...project, layers, selected: copy.id }
}

export function moveLayer(project, amount) {
  const index = project.layers.findIndex(layer => layer.id === project.selected)
  const next = index + amount
  if (index < 0 || next < 0 || next >= project.layers.length) return project
  const layers = project.layers.slice()
  ;[layers[index], layers[next]] = [layers[next], layers[index]]
  return { ...project, layers }
}

export function deleteLayer(project) {
  return { ...project, selected: null, layers: project.layers.filter(layer => layer.id !== project.selected) }
}

export const imageData = /^data:image\/(png|jpeg|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/
const within = (value, min, max) => Number.isFinite(value) && value >= min && value <= max

export function validateProject(project) {
  if (!project || project.version !== 1) throw new Error('A versão deste projeto é incompatível.')
  const { scene, zone, layers } = project
  const invalid = () => new Error('O arquivo de projeto está incompleto ou inválido.')
  if (!scene || typeof scene.id !== 'string' || scene.version !== 1 || !zone ||
      !within(zone.x, 0, 1) || !within(zone.y, 0, 1) || !within(zone.w, .02, 1) || !within(zone.h, .02, 1) ||
      !Object.hasOwn(lights, project.light) || !Object.hasOwn(shadows, project.shadow) ||
      !Object.hasOwn(formats, project.format) || !within(project.intensity, 0, 1) || !within(project.softness, 0, 1) ||
      !within(project.shadowX, -.5, .5) || !within(project.shadowY, -.5, .5) ||
      !within(project.cropX, -1, 1) || !within(project.cropY, -1, 1) || !within(project.zoom, 1, 2) ||
      !Array.isArray(layers) || layers.length > 16) throw invalid()
  const ids = new Set()
  for (const layer of layers) {
    if (!layer || typeof layer.id !== 'string' || ids.has(layer.id) || typeof layer.name !== 'string' ||
        !imageData.test(layer.source) || !Object.hasOwn(finishes, layer.finish) ||
        !within(layer.width, 1, 12000) || !within(layer.height, 1, 12000) ||
        !within(layer.x, 0, 1) || !within(layer.y, 0, 1) || !within(layer.w, .01, 1.5) ||
        !within(layer.rotation, -180, 180) || !within(layer.seed, 0, 65535)) throw invalid()
    ids.add(layer.id)
  }
  if (project.selected !== null && !ids.has(project.selected)) throw invalid()
  return project
}
