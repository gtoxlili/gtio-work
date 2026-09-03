/**
 * Turns art/raw/*.png into
 *   - responsive AVIF + WebP sets under public/img (for the static fallback and OG),
 *   - one RGBA WebP per picture under public/gpu with the depth map packed into alpha
 *     (what the particle shader samples),
 * and writes src/data/images.json with dimensions.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const rawDir = path.resolve(root, '../art/raw')
const depthDir = path.resolve(root, '../art/depth')
const imgDir = path.resolve(root, 'public/img')
const gpuDir = path.resolve(root, 'public/gpu')
const dataFile = path.resolve(root, 'src/data/images.json')
const WIDTHS = [480, 768, 1024, 1536]
const GPU_HEIGHT = 1024

fs.mkdirSync(imgDir, { recursive: true })
fs.mkdirSync(gpuDir, { recursive: true })
const manifest: Record<string, { width: number; height: number; widths: number[]; gpu: { w: number; h: number } }> = {}

// Only the pictures the page still uses: the one city model.
const KEEP = new Set(['city'])
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

  // GPU texture: colour at GPU_HEIGHT rows, depth (near = bright) in alpha.
  const gw = Math.round((w / h) * GPU_HEIGHT)
  const gh = GPU_HEIGHT
  const gpuOut = path.join(gpuDir, `${slug}.webp`)
  const depthSrc = path.join(depthDir, `${slug}.png`)
  const rgb = await sharp(src).resize(gw, gh).removeAlpha().raw().toBuffer()
  let depth: Buffer
  if (fs.existsSync(depthSrc)) {
    depth = await sharp(depthSrc).resize(gw, gh).greyscale().raw().toBuffer()
  } else {
    depth = Buffer.alloc(gw * gh, 128)
    console.warn(`no depth map for ${slug}, using flat`)
  }
  const rgba = Buffer.alloc(gw * gh * 4)
  for (let i = 0; i < gw * gh; i++) {
    rgba[i * 4] = rgb[i * 3]
    rgba[i * 4 + 1] = rgb[i * 3 + 1]
    rgba[i * 4 + 2] = rgb[i * 3 + 2]
    rgba[i * 4 + 3] = depth[i]
  }
  await sharp(rgba, { raw: { width: gw, height: gh, channels: 4 } })
    .webp({ quality: 84, alphaQuality: 90, effort: 5 })
    .toFile(gpuOut)

  manifest[slug] = { width: w, height: h, widths, gpu: { w: gw, h: gh } }
  console.log(
    `${slug}: ${w}x${h} -> ${widths.join(', ')} | gpu ${gw}x${gh} ${(fs.statSync(gpuOut).size / 1024).toFixed(0)} kB`,
  )
}

if (fs.existsSync(path.join(rawDir, 'city.png'))) {
  await sharp(path.join(rawDir, 'city.png'))
    .resize({ width: 1200, height: 630, fit: 'cover', position: 'centre' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path.join(imgDir, 'og.jpg'))
}

fs.writeFileSync(dataFile, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`manifest: ${Object.keys(manifest).length} images`)
