import { useEffect, useRef, useState } from 'react'
import { chapters } from '../chapters'
import { hero } from '../content/copy'
import filmMeta from '../data/film.json'
import { FilmScreen, type Layout } from '../film/screen'
import { type FilmIndex, FilmSource } from '../film/source'
import { useT } from '../lang'
import { readScroll, textPresence } from '../scroll'
import { Picture } from './Picture'

/** Where the frame sits. Beside the text on desktop, above it when narrow. */
function layoutFor(vw: number): Layout {
  if (vw < 880) {
    return { fh: 0.38, fw: 0.9, offsetX: 0, offsetY: 0.5, depth: 0.5 }
  }
  const left = 0.46 * 2 - 1 + 0.06
  const right = 0.96
  return { fh: 0.74, fw: (right - left) / 2, offsetX: (left + right) / 2, offsetY: -0.02, depth: 0.55 }
}

type Mode = 'pending' | 'gpu' | 'canvas' | 'video' | 'still'

/**
 * The fixed canvas behind everything, and the one animation loop. Scroll
 * position is time in the film: the loop reads it, asks the source for that
 * frame, draws it, and sets the opacity of each chapter's text, the rail and
 * the counter.
 *
 * Four ways to show a frame, best first: WebGPU (with the particle opening),
 * a 2D canvas, a video element seeking the same footage, and the still
 * photograph for browsers that decode nothing or ask for reduced motion.
 */
export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const flatRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const stillRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<Mode>('pending')
  const t = useT()

  useEffect(() => {
    const canvas = canvasRef.current!
    const flat = flatRef.current!
    const video = videoRef.current!
    const still = stillRef.current!
    const root = document.documentElement
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const narrow = window.innerWidth < 880
    // Content-addressed: a recut is a new path, so nothing has to be purged.
    const base = `/film/${filmMeta.rev}/${narrow ? 'city-768' : 'city'}`
    let screen: FilmScreen | null = null
    let source: FilmSource | null = null
    let alive = true
    let raf = 0
    let introStart = 0
    let pointer: [number, number] = [0, 0]
    let chapterH = 1
    let releaseRaw = Number.POSITIVE_INFINITY
    let lastChapter = -1
    let lastDrawn = -1
    let seeking = false
    let current: Mode = 'pending'

    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-chapter]'))
    const panels = sections.map(s => s.querySelector<HTMLElement>('.panel'))
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
      if (screen) screen.resize(canvas)
    }

    const onMove = (e: PointerEvent) => {
      pointer = [(e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1]
    }

    const loop = () => {
      if (!alive) return
      const m = readScroll(chapters.length, chapterH, releaseRaw)
      const layout = layoutFor(m.vw)

      for (let i = 0; i < sections.length; i++) {
        const local = Math.min(1, Math.max(0, m.raw - i))
        const p = textPresence(i, i === 0 ? Math.max(local, 0) : local)
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

      if (current === 'gpu' && screen) {
        const intro = introStart === 0 ? 0 : Math.min(1, (performance.now() - introStart) / 2600)
        if (m.fade > 0.001) {
          canvas.style.opacity = '1'
          const frame = intro >= 1 && source ? source.frame(m.frame) : null
          screen.frame({ frame, intro: ease(intro), fade: m.fade, pointer, layout })
        } else {
          canvas.style.opacity = '0'
        }
      } else if (current === 'canvas' && source) {
        flat.style.opacity = String(m.fade)
        const frame = source.frame(m.frame)
        if (frame && m.frame !== lastDrawn) {
          const g = flat.getContext('2d')
          if (g) {
            if (flat.width !== frame.displayWidth) {
              flat.width = frame.displayWidth
              flat.height = frame.displayHeight
            }
            g.drawImage(frame, 0, 0)
            lastDrawn = m.frame
            flat.classList.add('on')
          }
        }
      } else if (current === 'video') {
        video.style.opacity = String(m.fade)
        // One seek at a time; the element catches up when the scroll pauses.
        const target = Math.round(m.frame) / filmMeta.fps
        if (!seeking && Math.abs(video.currentTime - target) > 0.5 / filmMeta.fps) {
          seeking = true
          video.currentTime = target
        }
      } else if (current === 'still') {
        still.style.opacity = String(m.fade)
      }
      raf = requestAnimationFrame(loop)
    }

    const startSource = async () => {
      // AV1 is half the bytes; H.264 decodes everywhere WebCodecs exists.
      const av1 = await FilmSource.decodes('av01.0.08M.08')
      const stream = av1 ? `${base}.av1` : `${base}.h264`
      const index = (await (await fetch(`${stream}.json`)).json()) as FilmIndex
      const s = new FilmSource(index)
      source = s
      s.load(stream).catch(err => console.warn('film stream', err))
    }

    const start = async () => {
      measure()
      const canDecode = !reduced && FilmSource.supported()
      if (!reduced && FilmScreen.supported()) {
        try {
          const sc = new FilmScreen()
          await sc.init(canvas)
          await sc.load('/gpu/hero.webp', filmMeta.w, filmMeta.h)
          if (!alive) return
          screen = sc
          current = 'gpu'
          root.classList.add('gpu')
          introStart = performance.now()
          if (canDecode && sc.playsFilm) startSource().catch(err => console.warn('film', err))
        } catch (err) {
          console.warn('WebGPU unavailable, falling back', err)
          screen = null
        }
      }
      if (!screen) {
        root.classList.add('nogpu')
        if (canDecode) {
          current = 'canvas'
          await startSource().catch(err => {
            console.warn('film', err)
            current = 'still'
          })
        } else if (!reduced) {
          current = 'video'
          video.addEventListener('seeked', () => {
            seeking = false
            video.classList.add('on')
          })
          video.src = `/film/${filmMeta.rev}/city.mp4`
          video.load()
        } else {
          current = 'still'
        }
      }
      setMode(current)
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
      source?.destroy()
      screen?.destroy()
    }
  }, [])

  return (
    <div className="stage" aria-hidden="true">
      <canvas ref={canvasRef} className="stage-canvas" />
      <div className="stage-flat">
        <canvas ref={flatRef} className="stage-frame" width={filmMeta.w} height={filmMeta.h} />
        <video ref={videoRef} className="stage-frame" muted playsInline preload="auto" />
      </div>
      <div ref={stillRef} className="stage-stills">
        <div className="still" data-on="">
          <Picture slug="hero" alt="" sizes="(max-width: 880px) 100vw, 60vw" priority={mode === 'still'} />
        </div>
        <p className="stage-caption">{t(hero.caption)}</p>
      </div>
    </div>
  )
}

function ease(x: number) {
  return 1 - (1 - x) ** 3
}
