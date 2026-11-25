import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    const source = specifier === 'three'
      ? new URL('../dist/vendor/three.module.js', import.meta.url).href
      : specifier
    return nextResolve(source, context)
  }
})
