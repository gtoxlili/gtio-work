/**
 * Turns the film's opening frame (art/raw/hero.png) into the responsive AVIF and
 * WebP set under public/img that the still fallback and the OG image use, and
 * writes src/data/images.json with their dimensions.
 *
 * The texture the particle opening samples is not made here: the film build
 * writes public/gpu/hero.webp from the same frame, with its depth in alpha.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const rawDir = path.resolve(root, '../art/raw')
const imgDir = path.resolve(root, 'public/img')
const dataFile = path.resolve(root, 'src/data/images.json')
const WIDTHS = [480, 768, 1024, 1536]

fs.mkdirSync(imgDir, { recursive: true })
const manifest: Record<string, { width: number; height: number; widths: number[] }> = {}

const KEEP = new Set(['hero'])
const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.png') && KEEP.has(f.replace(/\.png$/, '')))
for (const file of files) {
  const slug = file.replace(/\.png$/, '')
  const src = path.join(rawDir, file)
  const meta = await sharp(src).metadata()
  const w = meta.width!
  const h = meta.height!
  const widths = Array.from(new Set(WIDTHS.filter(x => x < w).concat([w]))).sort((a, b) => a - b)

  for (const width of widths) {
    const avif = path.join(imgDir, `${slug}-${width}.avif`)
    const webp = path.join(imgDir, `${slug}-${width}.webp`)
    if (!fs.existsSync(avif)) await sharp(src).resize({ width }).avif({ quality: 58, effort: 6 }).toFile(avif)
    if (!fs.existsSync(webp)) await sharp(src).resize({ width }).webp({ quality: 80, effort: 5 }).toFile(webp)
  }

  manifest[slug] = { width: w, height: h, widths }
  console.log(`${slug}: ${w}x${h} -> ${widths.join(', ')}`)
}

if (fs.existsSync(path.join(rawDir, 'hero.png'))) {
  await sharp(path.join(rawDir, 'hero.png'))
    .resize({ width: 1200, height: 630, fit: 'cover', position: 'centre' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path.join(imgDir, 'og.jpg'))
}

fs.writeFileSync(dataFile, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`manifest: ${Object.keys(manifest).length} images`)
