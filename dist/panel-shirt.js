import * as THREE from 'three'

const armRows = 32
const columns = 72
const lowerRows = 46
const tau = 2 * Math.PI
const smooth = THREE.MathUtils.smoothstep
const mix = THREE.MathUtils.lerp
const bell = x => Math.exp(-x * x)

export function sampleSection(sections, y, field) {
  let i = 0
  while (i < sections.length - 2 && y > sections[i + 1][0]) i++
  const a = sections[i], b = sections[i + 1]
  const before = sections[Math.max(0, i - 1)], after = sections[Math.min(sections.length - 1, i + 2)]
  const span = b[0] - a[0]
  const t = (y - a[0]) / span
  const slopeA = (b[field] - before[field]) / (b[0] - before[0])
  const slopeB = (after[field] - a[field]) / (after[0] - a[0])
  return mix(a[field], b[field], t * t * (3 - 2 * t)) +
    span * t * (1 - t) * ((1 - t) * slopeA - t * slopeB)
}

function cubic(a, b, c, d, t) {
  const s = 1 - t
  return a.clone().multiplyScalar(s ** 3).addScaledVector(b, 3 * s * s * t)
    .addScaledVector(c, 3 * s * t * t).addScaledVector(d, t ** 3)
}

export function makePanelShirt(material, pattern) {
  const { pit, shoulder, torsoPoint } = pattern
  const points = [], shades = [], indices = []
  function vertex(p, shade = 1) {
    points.push(p)
    shades.push(shade)
    return points.length - 1
  }
  function quad(a, b, c, d, reverse = false) {
    if (reverse) indices.push(a, d, b, b, d, c)
    else indices.push(a, b, d, b, c, d)
  }
  function joinRings(first, second, reverse = false) {
    for (let i = 0; i < first.length; i++) {
      const j = (i + 1) % first.length
      quad(first[i], first[j], second[j], second[i], reverse)
    }
  }

  const levels = []
  for (let i = 0; i < lowerRows; i++) levels.push(mix(-1.08, pit, i / lowerRows))
  for (let i = 0; i <= armRows; i++) {
    levels.push(mix(pit, shoulder, (1 - Math.cos(Math.PI * i / armRows)) * .5))
  }
  for (let i = 1; i <= 20; i++) levels.push(mix(shoulder, 1.10, i / 20))

  if (pattern.hemRows) levels.splice(1, 0, ...pattern.hemRows)
  levels.sort((a, b) => a - b)
  const openingStart = levels.indexOf(pit)
  const front = [], back = []
  for (const [r, y] of levels.entries()) {
    const hemShade = pattern.hemShade?.(y) ?? 0
    const fronts = [], backs = []
    for (let c = 0; c <= columns; c++) {
      const f = 2 * c / columns - 1
      const edge = c === 0 || c === columns
      const outsideOpening = r <= openingStart || r >= openingStart + armRows
      const seam = 1 - .045 * smooth(Math.abs(f), .966, 1) * (1 - smooth(y, shoulder, 1.05))
      const underarm = .12 * smooth(Math.abs(f), .70, 1) * bell((y - pit) / .155)
      fronts.push(vertex(torsoPoint(y, f, 1), seam - underarm - hemShade))
      backs.push(edge && outsideOpening ? fronts[c] : vertex(torsoPoint(y, f, -1), seam - underarm - hemShade))
      if (r && c) {
        quad(front[r - 1][c - 1], front[r - 1][c], fronts[c], fronts[c - 1])
        quad(back[r - 1][c - 1], back[r - 1][c], backs[c], backs[c - 1], true)
      }
    }
    front.push(fronts)
    back.push(backs)
  }

  function perimeter(row) {
    return front[row].concat(back[row].slice(1, -1).reverse())
  }
  function binding(base, profile, reverse = false) {
    let previous = base
    for (const [radialScale, lift, shade] of profile) {
      const ring = base.map((id, i) => {
        const p = points[id].clone()
        p.x *= radialScale
        p.z = -.065 + (p.z + .065) * radialScale
        p.y += lift * (1 + .14 * Math.cos(tau * i / base.length - Math.PI / 2))
        return vertex(p, shade)
      })
      joinRings(previous, ring, reverse)
      previous = ring
    }
  }

  binding(perimeter(levels.length - 1), [
    [1.003, .002, .88], [.998, .006, .95], [.970, .016, .97],
    [.933, .035, .96], [.919, .041, .99], [.906, .040, .96],
    [.900, .034, .88], [.908, .018, .86], [.937, .002, .89]
  ])
  binding(perimeter(0), [[1, -.004, .96], [.990, -.006, .90], [.987, .016, .92]], true)

  for (const side of [-1, 1]) {
    const c = side > 0 ? columns : 0
    const opening = []
    for (let i = armRows; i >= 0; i--) opening.push(front[openingStart + i][c])
    for (let i = 1; i < armRows; i++) opening.push(back[openingStart + i][c])
    let previous = opening
    const cuffCenter = pattern.cuffCenter(side)
    const cuff = []
    const steps = [0.006, 0.016, 0.026, ...Array.from({ length: 32 }, (_, i) => (i + 1) / 32)]
    if (pattern.stitchRows) steps.push(...pattern.stitchRows)
    steps.sort((a, b) => a - b)
    for (const t of steps) {
      const stitchShade = pattern.stitchShade?.(t) ?? 0
      const ring = opening.map((id, i) => {
        const a = tau * i / opening.length
        const cap = (1 + Math.cos(a)) * .5
        const root = points[id]
        const { first, last, end } = pattern.sleeve(root, cuffCenter, side, a, t)
        const p = cubic(root, first, last, end, t)
        if (t < .04) {
          const next = points[opening[(i + 1) % opening.length]]
          const prev = points[opening[(i + opening.length - 1) % opening.length]]
          const normal = next.clone().sub(prev).cross(first.clone().sub(root)).normalize()
          p.addScaledVector(normal, side * .0048 * bell((t - .016) / .007))
        }
        pattern.foldSleeve(p, side, a, t)
        if (t === 1) cuff.push(p)
        const occlusion = .16 * (1 - cap) ** 2 * (1 - t) ** 2
        return vertex(p, 1 - occlusion - stitchShade - .094 * bell((t - .006) / .006))
      })
      joinRings(previous, ring, side < 0)
      previous = ring
    }
    for (const [scale, dy, shade] of [[.998, -.004, .96], [.973, -.006, .92], [.969, .017, .89]]) {
      const ring = cuff.map(p => {
        const v = p.clone().sub(cuffCenter).multiplyScalar(scale).add(cuffCenter)
        v.y += dy
        return vertex(v, shade)
      })
      joinRings(previous, ring, side < 0)
      previous = ring
    }
  }

  // The fit is calibrated in silhouette space against the front and side plates.
  for (const p of points) {
    p.x *= pattern.widthScale
    p.z *= pattern.depthScale
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(p => [p.x, p.y, p.z]), 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(shades.flatMap(v => [v, v, v]), 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(points.flatMap(p => [p.x + .22 * p.z, p.y * .5]), 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const group = new THREE.Group()
  group.add(new THREE.Mesh(geometry, material))
  return group
}
