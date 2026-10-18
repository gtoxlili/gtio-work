import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'

// Exercise the language Worker and native asset server locally and after deployment.
const origin = process.env.SITE_ORIGIN
const directory = origin ? null : await mkdtemp(path.join(os.tmpdir(), 'site-assets-'))
const child = origin
  ? null
  : spawn(
      'pnpm',
      ['exec', 'wrangler', 'dev', '--local', '--persist-to', directory, '--ip', '127.0.0.1', '--port', '18793'],
      { detached: true, stdio: 'pipe' },
    )
let output = ''
child?.stdout.on('data', data => {
  output += data
})
child?.stderr.on('data', data => {
  output += data
})
// RFC 9110 section 14.2 permits a server to ignore Range and send the full 200.
// FilmSource.load consumes the complete stream; a partial response must match its byte range.
async function checkRange(response, source, start, end) {
  assert.ok([200, 206].includes(response.status))
  const partial = response.status === 206
  assert.equal(response.headers.get('Content-Range'), partial ? `bytes ${start}-${end}/${source.length}` : null)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), partial ? source.subarray(start, end + 1) : source)
}

const base = origin ?? 'http://127.0.0.1:18793'
const get = (pathname, options = {}) =>
  fetch(`${base}${pathname}`, {
    ...options,
    headers: {
      'Accept-Encoding': 'identity',
      'User-Agent': 'Mozilla/5.0 (compatible; SiteDeployCheck/1.0; +https://www.gtio.work)',
      ...options.headers,
    },
    signal: AbortSignal.timeout(45000),
  })
try {
  let ready = Boolean(origin)
  for (let i = 0; !ready && i < 40; i++) {
    try {
      ready = (await get('/')).ok
    } catch {
      /* workerd is starting */
    }
    if (!ready) await setTimeout(500)
  }
  assert.ok(ready, output)
  let response = await get('/', { headers: { 'Accept-Language': 'zh-CN' } })
  assert.match(await response.text(), /lang="zh-CN"/)
  assert.equal(response.headers.get('Cache-Control'), 'no-cache')
  response = await get('/', { headers: { 'Accept-Language': 'zh-CN', Cookie: 'lang=en' } })
  assert.match(await response.text(), /lang="en"/)
  response = await get('/zh/')
  assert.match(await response.text(), /lang="zh-CN"/)

  const { rev } = JSON.parse(await readFile('src/data/film.json', 'utf8'))
  const pathname = `/film/${rev}/city.json`
  const source = await readFile(`public${pathname}`)
  response = await get(pathname)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Content-Range'), null)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), source)
  assert.match(response.headers.get('Cache-Control'), /immutable/)
  const etag = response.headers.get('ETag')
  assert.ok(etag)
  response = await get(pathname, { headers: { Range: 'bytes=2-5' } })
  await checkRange(response, source, 2, 5)
  response = await get(pathname, { method: 'HEAD' })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), '')
  response = await get(pathname, { headers: { 'If-None-Match': etag } })
  assert.equal(response.status, 304)

  const binary = `/film/${rev}/city.h264`
  const bytes = await readFile(`public${binary}`)
  response = await get(binary, { headers: { Range: 'bytes=0-4095' } })
  await checkRange(response, bytes, 0, 4095)
  response = await get('/film/missing')
  assert.equal(response.status, 404)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  console.log(`Language selection and native Static Assets media delivery passed: ${base}`)
} finally {
  if (child) {
    process.kill(-child.pid, 'SIGTERM')
    await new Promise(resolve => child.once('exit', resolve))
    await rm(directory, { recursive: true, force: true })
  }
}
