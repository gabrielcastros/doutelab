import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8'
}
const source = new URL('../dist/', import.meta.url)
const output = process.argv[2]
if (!output) throw new Error('Informe o diretório de saída do Worker.')
const html = await readFile(new URL('index.html', source), 'utf8')
const map = html.match(/<script type="importmap">([^<]+)<\/script>/)?.[1]
if (!map) throw new Error('Import map ausente.')
const hash = createHash('sha256').update(map).digest('base64')
const policy = [
  "default-src 'none'", `script-src 'self' 'sha256-${hash}'`,
  "style-src 'self'", "img-src 'self' blob: data:", "connect-src 'self'",
  "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'"
].join('; ')
const assets = {}
for (const entry of (await readdir(source, { recursive: true })).sort()) {
  const type = types[entry.slice(entry.lastIndexOf('.'))]
  if (!type || entry.startsWith('server/')) continue
  const bytes = await readFile(new URL(entry, source))
  assets['/' + entry] = { type, body: gzipSync(bytes).toString('base64') }
}

await mkdir(output, { recursive: true })
await writeFile(output + '/index.js', `const assets = ${JSON.stringify(assets)}
const policy = ${JSON.stringify(policy)}

export default {
  fetch(request) {
    const path = new URL(request.url).pathname
    const file = assets[path === '/' ? '/index.html' : path]
    const headers = {
      'Content-Security-Policy': policy,
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-cache'
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } })
    }
    if (!file) return new Response(null, { status: 404, headers })
    const body = request.method === 'HEAD' ? null : new Blob([
      Uint8Array.from(atob(file.body), character => character.charCodeAt(0))
    ]).stream().pipeThrough(new DecompressionStream('gzip'))
    return new Response(body, { headers: { ...headers, 'Content-Type': file.type } })
  }
}
`)
