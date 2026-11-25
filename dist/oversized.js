import * as THREE from 'three'
import { makePanelShirt, sampleSection } from './panel-shirt.js'

// Heights, half-widths and front/back depths follow the turntable silhouettes.
const sections = [
  [-1.08, .586, .542, -.496], [-.85, .593, .519, -.485],
  [-.57, .609, .493, -.475], [-.36, .620, .472, -.464],
  [-.10, .595, .438, -.447], [.12, .582, .403, -.427],
  [.30, .592, .389, -.412], [.52, .680, .365, -.386],
  [.69, .754, .301, -.355], [.80, .735, .258, -.326],
  [.90, .663, .223, -.296], [.98, .555, .190, -.264],
  [1.04, .404, .160, -.238], [1.10, .267, .143, -.218]
]
const pit = .12
const shoulder = .80
const smooth = THREE.MathUtils.smoothstep
const mix = THREE.MathUtils.lerp
const bell = x => Math.exp(-x * x)

function torsoPoint(y, fraction, face) {
  const neck = smooth(y, .62, 1.10)
  const seamZ = -.029 - .025 * neck - .016 * Math.sin((y + .25) * 4)
  const depth = face * (sampleSection(sections, y, face > 0 ? 2 : 3) - seamZ)
  const h = THREE.MathUtils.clamp((y - pit) / (shoulder - pit), 0, 1)
  const opening = (face > 0 ? .222 : .210) * 2 * Math.sqrt(h * (1 - h))
  const angle = Math.acos(opening / depth) * fraction
  const sin = Math.sin(angle), cos = Math.cos(angle)
  const x = sampleSection(sections, y, 1) * sin
  const hem = 1 - smooth(y, -1.08, -.73)
  const hemWave = hem * (.067 * cos + .007 * Math.cos(x * 9 + face * .7) - .006 * Math.sin(x * 15))
  const hang = 1 - smooth(y, .56, .98)
  // Broad folds fan out from the dropped shoulders; the back folds hang straighter.
  const foldCenter = face > 0
    ? .32 + .125 * Math.tanh(-y * 1.7) + .042 * Math.sin(y * 3 + x * 4)
    : .30 + .042 * Math.sin(y * 2.7 + x * 2.5)
  const line = Math.abs(x) - foldCenter
  const folds = hang * (.056 * bell((line + .078) / .092) - .058 * bell(line / .075))
  const looseCenter = .026 * Math.cos(x * 13 + y * .86 + face * .64) * hang
  const shoulderFold = -.062 * bell((Math.abs(x) - .525 - .06 * y) / .056) * bell((y - .58) / .28)
  const sideSlack = .022 * Math.sin(5 * y + 3 * sin) * bell((y + .39) / .41) * sin ** 4
  return new THREE.Vector3(
    x + sideSlack,
    y - (face > 0 ? .183 : .018) * neck * cos ** 1.8 + hemWave,
    seamZ + face * cos * (depth * (1 + .30 * sin ** 2 * (1 - neck)) + folds + looseCenter + shoulderFold)
  )
}

const oversized = {
  pit, shoulder, torsoPoint, widthScale: 1.025, depthScale: 1,
  cuffCenter: side => new THREE.Vector3(side * .936, -.043, .012),
  sleeve(root, center, side, angle) {
    const outer = Math.cos(angle), fore = Math.sin(angle), cap = (1 + outer) * .5
    // The cuff is pitched and slightly collapsed in profile at the underarm seam.
    const end = center.clone().add(new THREE.Vector3(
      side * (.211 * outer + .008 * fore), .118 * outer + .018 * fore - .009 * fore ** 2,
      .159 * fore + .078 * outer - .020 * Math.cos(2 * angle + .6)
    ))
    const first = root.clone().add(new THREE.Vector3(
      side * mix(.047, .133, cap), -mix(.038, .148, cap), fore * .019
    ))
    const last = end.clone().add(new THREE.Vector3(
      -side * mix(.025, .109, cap), mix(.110, .210, cap), fore * .013
    ))
    return { first, last, end }
  },
  foldSleeve(p, side, angle, t) {
    const fore = Math.sin(angle), outer = Math.cos(angle)
    const fold = (.029 * Math.sin(3 * angle + .67 * t + side * .15) +
      .014 * Math.sin(5 * angle - .8 * t)) * smooth(t, 0, .34)
    p.x += side * fold * outer
    p.z += fold * fore
    p.y += .013 * Math.sin(3 * angle - .4) * t ** 2
  },
  hemRows: [-1.045, -1.041, -1.037, -1.029, -1.025, -1.021],
  hemShade: y => .076 * bell((y + 1.041) / .0025) + .060 * bell((y + 1.025) / .0025),
  stitchRows: [.935, .940, .945, .953, .958, .963],
  stitchShade: t => .084 * bell((t - .940) / .003) + .066 * bell((t - .958) / .003)
}

export function makeOversized(material) {
  return makePanelShirt(material, oversized)
}
