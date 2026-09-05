/**
 * One scroll model for the whole page. Scroll position is time in the film:
 * every chapter section spends its first part dwelling on its building (the
 * text is up) and the rest flying to the next one. The hero holds its opening
 * photograph, then dives into the city.
 */
import film from './data/film.json'

/** fraction of a chapter section spent on its dwell */
const DWELL = 0.55
/** fraction of the hero section that holds the opening photograph */
const HOLD = 0.3

type ScrollModel = {
  raw: number
  /** which chapter's text and rail mark are current */
  chapter: number
  /** frame of the film for this scroll position */
  frame: number
  /** canvas opacity, 0 once the page has moved past the last chapter */
  fade: number
  vh: number
  vw: number
}

type Range = [number, number]
type Chapter = { slug: string; dwell: Range; flight: Range }
const chapters = film.chapters as Chapter[]

/**
 * `releaseRaw` is where the last chapter's panel unpins, measured in chapter
 * units; the canvas fades out from there.
 */
export function readScroll(chapterCount: number, chapterHeight: number, releaseRaw: number): ScrollModel {
  const vh = window.innerHeight
  const vw = window.innerWidth
  const last = chapterCount - 1
  const raw = chapterHeight > 0 ? window.scrollY / chapterHeight : 0
  const fade = 1 - smooth(releaseRaw, releaseRaw + 0.4, raw)
  const prog = Math.min(Math.max(raw, 0), last + 1 - 1e-6)
  // The counter and rail flip halfway through a flight.
  const chapter = Math.min(last, Math.floor(prog + (1 - DWELL) / 2))
  return { raw, chapter, frame: frameAt(prog), fade, vh, vw }
}

/** The film frame for a position in chapter units. */
function frameAt(prog: number): number {
  const i = Math.min(chapters.length - 1, Math.max(0, Math.floor(prog)))
  const local = Math.min(1, Math.max(0, prog - i))
  const c = chapters[i]
  if (i === 0) {
    if (local < HOLD) return c.dwell[0]
    return lerp(c.flight, (local - HOLD) / (1 - HOLD))
  }
  if (local < DWELL) return lerp(c.dwell, local / DWELL)
  return lerp(c.flight, (local - DWELL) / (1 - DWELL))
}

function lerp([a, b]: Range, t: number) {
  return a + (Math.max(b - 1, a) - a) * clamp(t)
}

/** Text visibility for chapter `i` at progress `local` (0..1 inside its section). */
export function textPresence(i: number, local: number) {
  if (i === 0) return 1 - smooth(HOLD - 0.02, HOLD + 0.2, local)
  const enter = smooth(0.0, 0.07, local)
  const exit = 1 - smooth(DWELL - 0.1, DWELL - 0.02, local)
  return Math.min(enter, exit)
}

function smooth(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

function clamp(x: number) {
  return Math.min(Math.max(x, 0), 1)
}
