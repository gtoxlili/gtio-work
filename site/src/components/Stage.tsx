import { useEffect, useRef, useState } from 'react'
import { chapters } from '../chapters'
import { hero } from '../content/copy'
import { shots } from '../content/shots'
import manifest from '../data/images.json'
import { CityModel, type Layout } from '../gpu/city'
import { useT } from '../lang'
import { readScroll, textPresence } from '../scroll'
import { Picture } from './Picture'

type Manifest = Record<string, { width: number; height: number; widths: number[]; gpu: { w: number; h: number } }>
const images = manifest as Manifest

/** Where the model sits. Beside the text on desktop, above it when narrow. */
function layoutFor(vw: number): Layout {
  if (vw < 880) {
    return { fh: 0.38, fw: 0.9, offsetX: 0, offsetY: 0.5, depth: 0.7 }
  }
  // The text column ends around 46vw. Centre the model in what is left.
  const left = 0.46 * 2 - 1 + 0.06
  const right = 0.96
  return { fh: 0.74, fw: (right - left) / 2, offsetX: (left + right) / 2, offsetY: -0.02, depth: 0.75 }
}

/**
 * The fixed canvas behind everything, and the one animation loop. Reads the
 * scroll model, drives the camera, and sets the opacity of each chapter's text,
 * the rail and the counter. Without WebGPU, or under reduced motion, the same
 * photograph pans and zooms to the same shots instead.
 */
export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stillRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'pending' | 'gpu' | 'still'>('pending')
  const t = useT()

  useEffect(() => {
    const canvas = canvasRef.current!
    const still = stillRef.current!
    const root = document.documentElement
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const useGpu = CityModel.supported() && !reduced
    let city: CityModel | null = null
    const shotList = chapters.map(c => shots[c.slug] ?? shots.hero)
    let alive = true
    let raf = 0
    let introStart = 0
    let pointer: [number, number] = [0, 0]
    let chapterH = 1
    let releaseRaw = Number.POSITIVE_INFINITY
    let lastChapter = -1

    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-chapter]'))
    const panels = sections.map(s => s.querySelector<HTMLElement>('.panel'))
    const stillImg = still.querySelector<HTMLElement>('.still img')
    const counter = document.getElementById('chapter-counter')
    const rail = Array.from(document.querySelectorAll<HTMLElement>('[data-rail]'))
    const railBox = document.querySelector<HTMLElement>('.rail')

    const measure = () => {
      chapterH = sections[0]?.offsetHeight || window.innerHeight * 1.6
      const lastSection = sections[sections.length - 1]
      if (lastSection) {
        const bottom = lastSection.getBoundingClientRect().bottom + window.scrollY
        releaseRaw = (bottom - window.innerHeight) / chapterH
      }
      if (city) city.resize(canvas)
    }

    const onMove = (e: PointerEvent) => {
      pointer = [(e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1]
    }

    const loop = () => {
      if (!alive) return
      const m = readScroll(chapters.length, chapterH, releaseRaw)
      const layout = layoutFor(m.vw)

      // Each panel fades on its own progress through its chapter.
      for (let i = 0; i < sections.length; i++) {
        const local = i === 0 ? Math.max(m.raw, 0.2) : m.raw - i
        const last = i === chapters.length - 1
        const p = last ? textPresence(Math.min(local, 0.45)) : textPresence(local)
        const el = panels[i]
        if (!el) continue
        el.style.opacity = String(p)
        el.style.transform = `translateY(${(1 - p) * 14}px)`
        el.style.visibility = p <= 0.01 ? 'hidden' : 'visible'
      }
      if (railBox) railBox.style.opacity = String(m.fade)
      if (m.chapter !== lastChapter) {
        lastChapter = m.chapter
        if (counter)
          counter.textContent = `${String(m.chapter + 1).padStart(2, '0')} / ${String(chapters.length).padStart(2, '0')}`
        for (const r of rail) r.toggleAttribute('data-active', Number(r.dataset.rail) === m.chapter)
      }

      if (city) {
        const intro = introStart === 0 ? 0 : Math.min(1, (performance.now() - introStart) / 2600)
        if (m.fade > 0.001) {
          canvas.style.opacity = '1'
          city.frame({ raw: m.raw, intro: ease(intro), fade: m.fade, pointer, layout })
        } else {
          canvas.style.opacity = '0'
        }
      } else {
        // Flat fallback: pan and zoom the photograph to the same shot.
        still.style.opacity = String(m.fade)
        const flat = CityModel.flatShot(shotList, m.raw)
        if (stillImg) {
          stillImg.style.transformOrigin = `${flat.u * 100}% ${flat.v * 100}%`
          stillImg.style.transform = `translate(${(0.5 - flat.u) * 100}%, ${(0.5 - flat.v) * 100}%) scale(${flat.zoom})`
        }
      }
      raf = requestAnimationFrame(loop)
    }

    const start = async () => {
      measure()
      if (useGpu) {
        try {
          const c = new CityModel(shotList)
          await c.init(canvas)
          const tex = textureOf('city')
          await c.load(tex.url, tex.width, tex.height)
          if (!alive) return
          city = c
          root.classList.add('gpu')
          introStart = performance.now()
        } catch (err) {
          console.warn('WebGPU unavailable, falling back to stills', err)
          city = null
        }
      }
      if (!city) root.classList.add('nogpu')
      setMode(city ? 'gpu' : 'still')
      root.classList.add('stage-ready')
      window.addEventListener('pointermove', onMove, { passive: true })
      raf = requestAnimationFrame(loop)
    }

    const ro = new ResizeObserver(measure)
    ro.observe(document.body)
    window.addEventListener('resize', measure)
    start()

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('pointermove', onMove)
      city?.destroy()
    }
  }, [])

  return (
    <div className="stage" aria-hidden="true">
      <canvas ref={canvasRef} className="stage-canvas" />
      <div ref={stillRef} className="stage-stills">
        <div className="still" data-on="">
          <Picture slug="city" alt="" sizes="(max-width: 880px) 100vw, 60vw" priority={mode === 'still'} />
        </div>
        <p className="stage-caption">{t(hero.caption)}</p>
      </div>
    </div>
  )
}

function textureOf(slug: string) {
  const g = images[slug]?.gpu ?? { w: 512, h: 512 }
  return { slug, url: `/gpu/${slug}.webp`, width: g.w, height: g.h }
}

function ease(x: number) {
  return 1 - (1 - x) ** 3
}
