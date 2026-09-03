/**
 * One scroll model for the whole page. It decides which two pictures are on
 * stage and how far the hand-off between them has run, how present each
 * chapter's text is, and when the canvas lets go at the end. Everything reads
 * from here inside a single requestAnimationFrame.
 */

/** Where inside a chapter its picture is whole, in chapter units. */
const CENTRE = 0.35
/** Slack either side of a centre where the picture stays whole. */
const DEAD = 0.03

export type ScrollModel = {
  /** index of the picture on stage, or the one leaving it */
  a: number
  /** 0 = picture a is whole; 1 = picture a + 1 is whole */
  t: number
  raw: number
  chapter: number
  /** canvas opacity, 0 once the page has moved past the last chapter */
  fade: number
  vh: number
  vw: number
}

/**
 * `releaseRaw` is where the last chapter's panel unpins, measured in chapter
 * units; the canvas fades out from there.
 */
export function readScroll(chapterCount: number, chapterHeight: number, releaseRaw: number): ScrollModel {
  const vh = window.innerHeight
  const vw = window.innerWidth
  const last = chapterCount - 1
  const raw = chapterHeight > 0 ? window.scrollY / chapterHeight : 0
  // The clamp sits at the last chapter's own centre, not at its start, so its
  // picture can finish arriving.
  const prog = Math.min(Math.max(raw, 0), last + CENTRE)
  const v = prog - CENTRE
  const a = Math.max(0, Math.floor(v))
  const f = v - Math.floor(v)
  const t = v < 0 ? 0 : clamp((f - DEAD) / (1 - 2 * DEAD))
  const fade = 1 - smooth(releaseRaw, releaseRaw + 0.4, raw)
  // The counter and rail flip at the midpoint between two centres.
  return { a, t, raw, chapter: Math.min(last, Math.floor(prog + 0.15)), fade, vh, vw }
}

/** Text visibility for a chapter at progress `local` (0..1 inside the chapter). */
export function textPresence(local: number) {
  // Text is there while its picture is whole: it arrives as the picture
  // finishes condensing and leaves as the picture starts to break up.
  const enter = smooth(0.06, 0.2, local)
  const exit = 1 - smooth(0.5, 0.64, local)
  return Math.min(enter, exit)
}

export function smooth(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

function clamp(x: number) {
  return Math.min(Math.max(x, 0), 1)
}
