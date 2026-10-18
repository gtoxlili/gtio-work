import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

const account = process.env.CLOUDFLARE_ACCOUNT_ID
if (!account) throw new Error('CLOUDFLARE_ACCOUNT_ID is required')
const headers = {
  'X-Auth-Key': process.env.CLOUDFLARE_API_KEY,
  'X-Auth-Email': process.env.CLOUDFLARE_EMAIL,
  'Content-Type': 'application/json',
}
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/site-media`
const existing = await fetch(endpoint, { headers })
if (existing.status === 404) {
  const response = await fetch(endpoint.slice(0, -'/site-media'.length), {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'site-media' }),
  })
  if (!response.ok) throw new Error(`R2 creation failed: ${await response.text()}`)
} else if (!existing.ok) {
  throw new Error(`R2 lookup failed: ${await existing.text()}`)
}

async function upload(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, file.name)
    if (file.isDirectory()) {
      await upload(filename)
      continue
    }
    if (/\.(br|gz)$/.test(file.name)) continue
    const key = path.relative('dist', filename).split(path.sep).join('/')
    const type = file.name.endsWith('.json')
      ? 'application/json'
      : file.name.endsWith('.mp4')
        ? 'video/mp4'
        : 'application/octet-stream'
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'wrangler',
        'r2',
        'object',
        'put',
        `site-media/${key}`,
        '--remote',
        '--file',
        filename,
        '--content-type',
        type,
        '--cache-control',
        'public, max-age=31536000, immutable',
      ],
      { stdio: 'inherit' },
    )
    if (result.status !== 0) throw new Error(`R2 upload failed: ${key}`)
  }
}
await upload('dist/film')
