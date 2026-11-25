import assert from 'node:assert/strict'
import * as THREE from '../dist/vendor/three.module.js'
import { makeGarment } from '../dist/garment.js'
import { zimmCatalog } from '../dist/catalog.js'

const geometry=makeGarment(zimmCatalog[1], new THREE.MeshPhysicalMaterial()).children[0].geometry
const positions = geometry.getAttribute('position'), indices=geometry.index.array
const edges=new Map(), a=new THREE.Vector3(), b=new THREE.Vector3(), c=new THREE.Vector3()
for(const key of ['position','normal','color','uv']) assert.ok(geometry.getAttribute(key).array.every(Number.isFinite))
for(let i=0;i<indices.length;i+=3){
  a.fromBufferAttribute(positions,indices[i]);b.fromBufferAttribute(positions,indices[i+1]);c.fromBufferAttribute(positions,indices[i+2])
  assert.ok(b.sub(a).cross(c.sub(a)).length()>1e-11)
  for(let j=0;j<3;j++){
    const a=indices[i+j],b=indices[i+(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join('/')
    const list=edges.get(key)??[]
    list.push(a<b?1:-1);edges.set(key,list)
  }
}
const boundary=new Map()
for(const [key,list] of edges){
  assert.ok(list.length<=2)
  if(list.length===2)assert.equal(list[0]+list[1],0)
  else{
    const [a,b]=key.split('/').map(Number)
    for(const [i,j] of [[a,b],[b,a]]){const nbr=boundary.get(i)??[];nbr.push(j);boundary.set(i,nbr)}
  }
}
const seen=new Set()
let loops=0
for(const [v,n] of boundary){
  assert.equal(n.length,2)
  if(seen.has(v))continue
  loops++
  const queue=[v]
  while(queue.length){const k=queue.pop();if(seen.has(k))continue;seen.add(k);queue.push(...boundary.get(k))}
}
assert.equal(loops,4)
assert.ok(indices.length > 0)
