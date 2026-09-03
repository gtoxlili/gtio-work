/**
 * After `vite build`, render the app to static HTML for both languages and
 * pre-compress the result.
 *
 * Produces dist/index.en.html, dist/index.zh.html and dist/index.html (= en).
 * nginx picks between them by cookie then Accept-Language (deploy/www.conf).
 *
 * Compression lives here rather than in the Vite build: this step rewrites
 * dist/index.html, so a `.br` written during the build would be a stale shell
 * that `brotli_static` would then serve forever.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { brotliCompress, gzip, constants as zlibConstants } from 'node:zlib'
import { createServer } from 'vite'

const brotliCompressAsync = promisify(brotliCompress)
const gzipAsync = promisify(gzip)

const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'dist')

async function compress(file: string) {
  const buf = await readFile(file)
  const [br, gz] = await Promise.all([
    brotliCompressAsync(buf, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: buf.byteLength,
      },
    }),
    gzipAsync(buf, { level: 9 }),
  ])
  await Promise.all([
    br.byteLength < buf.byteLength ? writeFile(`${file}.br`, br) : Promise.resolve(),
    gz.byteLength < buf.byteLength ? writeFile(`${file}.gz`, gz) : Promise.resolve(),
  ])
  return { raw: buf.byteLength, br: br.byteLength }
}

const vite = await createServer({
  root,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const { render, head } = (await vite.ssrLoadModule('/src/entry-server.tsx')) as {
    render: (lang: 'en' | 'zh') => string
    head: (lang: 'en' | 'zh') => string
  }
  const template = await readFile(path.join(dist, 'index.html'), 'utf8')
  if (!template.includes('<!--app-html-->')) throw new Error('template lost the <!--app-html--> marker')

  for (const lang of ['en', 'zh'] as const) {
    const html = template
      .replace('<html lang="en">', `<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}">`)
      .replace('<!--app-head-->', head(lang))
      .replace('<!--app-html-->', render(lang))
    const file = path.join(dist, `index.${lang}.html`)
    await writeFile(file, html)
    const { raw, br } = await compress(file)
    console.log(`prerendered index.${lang}.html (${(raw / 1024).toFixed(1)} kB → ${(br / 1024).toFixed(1)} kB br)`)
  }

  // `/` serves index.html when neither cookie nor Accept-Language says zh.
  const en = await readFile(path.join(dist, 'index.en.html'))
  await writeFile(path.join(dist, 'index.html'), en)
  await compress(path.join(dist, 'index.html'))
} finally {
  await vite.close()
}
