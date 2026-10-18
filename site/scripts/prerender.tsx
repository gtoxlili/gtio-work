/**
 * After `vite build`, render the app to static HTML for both languages and
 * publish the result as Cloudflare static assets.
 *
 * Produces dist/index.en.html, dist/index.zh.html and dist/index.html (= en).
 * The Worker picks the language by cookie, then Accept-Language.
 *
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'

const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'dist')

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
    console.log(`prerendered index.${lang}.html`)
  }

  // `/` serves index.html when neither cookie nor Accept-Language says zh.
  const en = await readFile(path.join(dist, 'index.en.html'))
  await writeFile(path.join(dist, 'index.html'), en)
} finally {
  await vite.close()
}
