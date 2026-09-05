/**
 * The film as a stream of frames the page can scrub.
 *
 * The footage is one H.264 elementary stream (Annex B, no B-frames, a keyframe
 * every few frames) plus a small index of packet sizes. The whole file streams
 * in the background into one buffer; any frame whose bytes have arrived can be
 * decoded on demand with WebCodecs, from its group's keyframe forward. Decoded
 * frames stay in a small window around the one being shown.
 */
export type FilmIndex = {
  /** WebCodecs codec string the stream decodes with */
  codec: string
  w: number
  h: number
  fps: number
  /** byte size of every packet, in order; one packet is one frame */
  sizes: number[]
  /** frame indices that start a group (keyframes) */
  keys: number[]
}

type Group = { key: number; end: number }

export class FilmSource {
  readonly index: FilmIndex
  readonly total: number
  private offsets: number[]
  private buf: Uint8Array
  private loaded = 0
  private frames = new Map<number, VideoFrame>()
  private decoder: VideoDecoder | null = null
  private decoding: Promise<void> | null = null
  private groupOf: Int32Array
  private wanted = 0
  private lastWanted = 0
  private outputTo = new Map<number, number>()
  private dead = false
  onProgress: ((loaded: number, total: number) => void) | null = null

  constructor(index: FilmIndex) {
    this.index = index
    this.total = index.sizes.length
    this.offsets = new Array(this.total + 1)
    let o = 0
    for (let i = 0; i < this.total; i++) {
      this.offsets[i] = o
      o += index.sizes[i]
    }
    this.offsets[this.total] = o
    this.buf = new Uint8Array(o)
    // Which group (by keyframe position in `keys`) each frame belongs to.
    this.groupOf = new Int32Array(this.total)
    let g = -1
    for (let i = 0; i < this.total; i++) {
      if (g + 1 < index.keys.length && index.keys[g + 1] === i) g++
      this.groupOf[i] = g
    }
  }

  static supported() {
    return typeof VideoDecoder !== 'undefined'
  }

  /** Whether this browser decodes the given codec at all. */
  static async decodes(codec: string) {
    if (!FilmSource.supported()) return false
    try {
      return (await VideoDecoder.isConfigSupported({ codec })).supported === true
    } catch {
      return false
    }
  }

  /** Stream the file into memory. Resolves when the last byte is in. */
  async load(url: string) {
    const res = await fetch(url)
    if (!res.ok || !res.body) throw new Error(`film ${res.status}`)
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done || this.dead) break
      if (this.loaded + value.byteLength > this.buf.byteLength) throw new Error('film longer than its index')
      this.buf.set(value, this.loaded)
      this.loaded += value.byteLength
      this.onProgress?.(this.loaded, this.buf.byteLength)
    }
  }

  /** How far the stream has arrived, as the last frame whose bytes are complete. */
  get available() {
    let lo = 0
    let hi = this.total
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.offsets[mid] <= this.loaded) lo = mid
      else hi = mid - 1
    }
    return lo - 1
  }

  private group(i: number): Group {
    const g = this.groupOf[i]
    const key = this.index.keys[g]
    const end = g + 1 < this.index.keys.length ? this.index.keys[g + 1] : this.total
    return { key, end }
  }

  private ensureDecoder() {
    if (this.decoder && this.decoder.state !== 'closed') return this.decoder
    const d = new VideoDecoder({
      output: frame => {
        // Frames come back in decode order, which is display order here.
        const i = this.outputTo.get(frame.timestamp)
        this.outputTo.delete(frame.timestamp)
        if (i === undefined || this.dead) {
          frame.close()
          return
        }
        this.frames.get(i)?.close()
        this.frames.set(i, frame)
      },
      error: err => {
        console.warn('film decoder', err)
        this.decoder = null
      },
    })
    d.configure({ codec: this.index.codec, optimizeForLatency: true })
    this.decoder = d
    return d
  }

  /**
   * The frame to show for index `i`: the exact one when it is decoded, else the
   * nearest decoded neighbour while its group decodes. Null before anything
   * has been decoded at all.
   */
  frame(i: number): VideoFrame | null {
    i = Math.max(0, Math.min(this.total - 1, Math.round(i)))
    if (i !== this.wanted) this.lastWanted = this.wanted
    this.wanted = i
    const exact = this.frames.get(i)
    if (exact) {
      this.prefetch(i)
      return exact
    }
    this.schedule()
    let best: VideoFrame | null = null
    let dist = Number.POSITIVE_INFINITY
    for (const [k, f] of this.frames) {
      const d = Math.abs(k - i)
      if (d < dist) {
        dist = d
        best = f
      }
    }
    return best
  }

  /** Decode the wanted frame's group, then whatever is wanted by then. */
  private schedule() {
    if (this.decoding || this.dead) return
    const i = this.wanted
    if (i > this.available) return
    const { key, end } = this.group(i)
    if (this.frames.has(i)) return
    this.decoding = this.decodeGroup(key, end)
      .catch(err => console.warn('film group', err))
      .finally(() => {
        this.decoding = null
        this.evict()
        if (!this.frames.has(this.wanted)) this.schedule()
      })
  }

  /** With the shown frame in hand, quietly decode the next group in the direction of travel. */
  private prefetch(i: number) {
    if (this.decoding || this.dead) return
    const { key, end } = this.group(i)
    const backwards = this.wanted < this.lastWanted
    const target = backwards ? key - 1 : end
    if (target < 0 || target >= this.total || target > this.available || this.frames.has(target)) return
    const next = this.group(target)
    this.decoding = this.decodeGroup(next.key, next.end)
      .catch(() => {})
      .finally(() => {
        this.decoding = null
        this.evict()
      })
  }

  private async decodeGroup(key: number, end: number) {
    const d = this.ensureDecoder()
    for (let k = key; k < end; k++) {
      if (this.frames.has(k)) continue
      const data = this.buf.subarray(this.offsets[k], this.offsets[k + 1])
      // Timestamps are only labels here; microseconds keep them distinct.
      const timestamp = k * 1_000_000
      this.outputTo.set(timestamp, k)
      d.decode(new EncodedVideoChunk({ type: k === key ? 'key' : 'delta', timestamp, data }))
    }
    await d.flush()
  }

  /** Keep the shown frame's group and its neighbours; close everything else. */
  private evict() {
    const keep = 3 * (this.index.keys.length > 1 ? this.index.keys[1] - this.index.keys[0] : 12)
    for (const [k, f] of this.frames) {
      if (Math.abs(k - this.wanted) > keep) {
        f.close()
        this.frames.delete(k)
      }
    }
  }

  destroy() {
    this.dead = true
    for (const f of this.frames.values()) f.close()
    this.frames.clear()
    try {
      this.decoder?.close()
    } catch {}
    this.decoder = null
  }
}
