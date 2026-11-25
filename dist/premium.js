import * as THREE from 'three'
import { makePanelShirt, sampleSection } from './panel-shirt.js'

// Section measurements follow the front and profile views from hem to neck.
// Each row gives the height, half width at the side seam, front and back depths.
const sections = [
  [-1.08, .521, .408, -.359], [-.88, .522, .414, -.366],
  [-.64, .515, .416, -.373], [-.41, .486, .416, -.39],
  [-.16, .502, .415, -.409], [.09, .510, .428, -.425],
  [.32, .514, .455, -.44], [.45, .599, .462, -.455],
  [.61, .722, .439, -.45], [.78, .781, .376, -.412],
  [.89, .708, .317, -.373], [.93, .654, .293, -.353],
  [.985, .560, .261, -.31], [1.048, .404, .217, -.274],
  [1.10, .306, .171, -.245]
]
const pit = .32
const shoulder = .89
const smooth = THREE.MathUtils.smoothstep
const bell = x => Math.exp(-x * x)

function torsoPoint(y, fraction, face) {
  const neck = smooth(y, .62, 1.10)
  const halfWidth = sampleSection(sections, y, 1)
  const seamZ = -.045 - .043 * smooth(y, .28, .93)
  const depth = face * (sampleSection(sections, y, face > 0 ? 2 : 3) - seamZ)
  const h = THREE.MathUtils.clamp((y - pit) / (shoulder - pit), 0, 1)
  const armArc = 2 * Math.sqrt(h * (1 - h))
  const armDepth = (face > 0 ? .252 : .210) * armArc * (1.22 - .59 * h)
  const edgeAngle = Math.acos(armDepth / depth)
  const angle = edgeAngle * fraction
  const x = halfWidth * Math.sin(angle)
  const fullness = .27 * (1 - neck)
  const side = Math.abs(Math.sin(angle))
  const dome = Math.cos(angle)
  const center = dome
  const hem = 1 - smooth(y, -1.08, -.81)
  const neckDrop = face > 0 ? .133 : .012

  // Long flutes run down the back from the shoulder blades. The front has a
  // quieter chest panel, with a short diagonal crease below each armhole.
  const spread = face > 0 ? .015 : .022
  const drift = .32 + .065 * Math.sin(y * 3.1 + x * 3.6) + .037 * Math.sin(x * 4)
  const channel = bell((Math.abs(x) - drift) / .055)
  const ridge = bell((Math.abs(x) - drift - .064) / .058)
  const blade = face < 0 ? .018 * bell((Math.abs(x) - .34) / .18) * bell((y - .53) / .24) : 0
  const hangingFold = face < 0 ? .014 * bell((x - .095 - .050 * y) / .057) *
    (1 - smooth(y, .18, .57)) : 0
  const drape = spread * (ridge - 1.3 * channel) * (1 - neck) + blade + hangingFold
  const armFold = .013 * bell((y - .32 - (Math.abs(x) - .47) * 1.8) / .047) *
    smooth(side, .44, .98)
  const chest = face > 0 ? .027 * bell((y - .42) / .22) *
    (bell((Math.abs(x) - .23) / .17) - .52 * bell(x / .068)) : 0
  const waistFold = .019 * Math.sin(y * 8.4 + fraction * 3.2) *
    bell((y + .42) / .29) * smooth(side, .48, 1)
  const waistLine = y + .44 - 1.16 * (Math.abs(x) - .38) + .09 * x
  const sideTuck = .026 * bell((side - .76) / .20) *
    (bell(waistLine / .077) - .48 * bell((waistLine - .075) / .073))
  return new THREE.Vector3(
    x + Math.sign(x) * waistFold,
    y - neckDrop * neck * center ** 1.65 + .036 * hem * (1 - center ** 1.55) +
      .007 * hem * Math.sin(x * 11 + face * .3),
    seamZ + face * (depth * dome * (1 + fullness * Math.sin(angle) ** 2) + center * (drape + chest - armFold - sideTuck))
  )
}

const premium = {
  pit, shoulder, torsoPoint, widthScale: 1.065, depthScale: 1.045,
  cuffCenter: side => new THREE.Vector3(side * .719, .102 + side * .010, -.09),
  sleeve(root, cuffCenter, side, a, t) {
    const outer = Math.cos(a), fore = Math.sin(a), cap = (1 + outer) * .5
    const end = cuffCenter.clone().add(new THREE.Vector3(
      side * .182 * outer, .046 * outer - .009 * fore, .239 * fore
    ))
    const first = root.clone().add(new THREE.Vector3(
      side * THREE.MathUtils.lerp(.006, .169, cap ** 1.42), -THREE.MathUtils.lerp(.037, .063, cap), fore * .012
    ))
    const last = end.clone().add(new THREE.Vector3(
      -side * THREE.MathUtils.lerp(.009, .052, cap), THREE.MathUtils.lerp(.056, .219, cap), -fore * .008
    ))
    return { end, first, last }
  },
  foldSleeve(p, side, a, t) {
    const outer = Math.cos(a), fore = Math.sin(a), cap = (1 + outer) * .5
    const pleat = .011 * Math.sin(3 * a + 2.8 * t) * Math.sin(Math.PI * t) * (1 - cap)
    // Compressed cloth near the armpit falls into two oblique folds.
    const armCrease = .018 * (bell((a - Math.PI * .75 - t * .52) / .17) -
      .66 * bell((a - Math.PI * .84 - t * .52) / .16)) *
      Math.sin(Math.PI * t) * (1 - t)
    p.z += (pleat - armCrease) * fore
    p.x += side * pleat * outer
  }
}

export function makePremium(material) {
  return makePanelShirt(material, premium)
}
