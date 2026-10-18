import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'

// Exercise HTTP behavior against workerd and its real local R2 implementation.
const directory = await mkdtemp(path.join(os.tmpdir(), 'site-edge-'))
const file = path.join(directory, 'probe.txt')
await writeFile(file, '0123456789abcdef')
const put = spawnSync(
  'pnpm',
  [
    'exec',
    'wrangler',
    'r2',
    'object',
    'put',
    'site-media/film/probe.txt',
    '--local',
    '--persist-to',
    directory,
    '--file',
    file,
  ],
  { stdio: 'pipe' },
)
if (put.status !== 0) throw new Error(put.stderr.toString())
const child = spawn(
  'pnpm',
  ['exec', 'wrangler', 'dev', '--local', '--persist-to', directory, '--ip', '127.0.0.1', '--port', '18793'],
  { detached: true, stdio: 'pipe' },
)
let output = ''
child.stdout.on('data', data => {
  output += data
})
child.stderr.on('data', data => {
  output += data
})
const base = 'http://127.0.0.1:18793'
try {
  let ready = false
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(base)).ok) {
        ready = true
        break
      }
    } catch {
      /* workerd is starting */
    }
    await setTimeout(500)
  }
  assert.ok(ready, output)
  let response = await fetch(base, { headers: { 'Accept-Language': 'zh-CN' } })
  assert.match(await response.text(), /lang="zh-CN"/)
  assert.equal(response.headers.get('Cache-Control'), 'no-cache')
  response = await fetch(base, { headers: { 'Accept-Language': 'zh-CN', Cookie: 'lang=en' } })
  assert.match(await response.text(), /lang="en"/)
  response = await fetch(`${base}/film/probe.txt`, { headers: { Range: 'bytes=2-5' } })
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('Content-Range'), 'bytes 2-5/16')
  assert.equal(await response.text(), '2345')
  response = await fetch(`${base}/film/probe.txt`, { headers: { Range: 'bytes=99-' } })
  assert.equal(response.status, 416)
  assert.equal(response.headers.get('Content-Range'), 'bytes */16')
  response = await fetch(`${base}/film/probe.txt`, { method: 'HEAD' })
  assert.equal(response.headers.get('Content-Length'), '16')
  assert.equal(await response.text(), '')
  response = await fetch(`${base}/film/probe.txt`, { headers: { 'If-None-Match': response.headers.get('ETag') } })
  assert.equal(response.status, 304)
  response = await fetch(`${base}/film/missing`)
  assert.equal(response.status, 404)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  console.log('Language selection and R2 HTTP semantics passed')
} finally {
  process.kill(-child.pid, 'SIGTERM')
  await new Promise(resolve => child.once('exit', resolve))
  await rm(directory, { recursive: true, force: true })
}
