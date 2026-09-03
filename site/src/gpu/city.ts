import type { Shot } from '../content/shots'
import { CITY_MESH_WGSL, COMPUTE_WGSL, POST_WGSL, RENDER_WGSL } from './shaders'

export type Layout = {
  /** how much of the viewport's half-height the whole city fills at zoom 1 */
  fh: number
  /** how much of the viewport's half-width it may fill */
  fw: number
  /** clip-space offset of the frame (pushes the scene beside the text) */
  offsetX: number
  offsetY: number
  /** depth relief, relative to the model's half-height */
  depth: number
}

export type FrameState = {
  raw: number // continuous chapter index, unclamped
  intro: number // 0..1 assembly of the city from dust
  fade: number // 0..1 overall opacity
  pointer: [number, number]
  layout: Layout
}

const N = 262_144
const WG = 256
const FOV = (30 * Math.PI) / 180
const TAN = Math.tan(FOV / 2)
/** the model's half-height in world units */
const S = 1
/** where inside a chapter the camera rests on its shot */
const CENTRE = 0.35
/** how far either side of the centre the camera only orbits (no flight) */
const DWELL = 0.15
/** orbit swing across a dwell, radians (each side) */
const ORBIT = 0.16
/** how far a flight pulls back, as a fraction of the fit distance */
const PULL = 0.45

/**
 * One city, one camera. The photograph is a depth-displaced mesh and every
 * chapter is a shot on it. Scrolling flies the camera between shots, pulling
 * back on the way, and inside a chapter each tick of the wheel orbits the
 * model. On load the city assembles out of particles once.
 */
export class CityModel {
  private device!: GPUDevice
  private ctx!: GPUCanvasContext
  private format!: GPUTextureFormat
  private compute!: GPUComputePipeline
  private render!: GPURenderPipeline
  private mesh!: GPURenderPipeline
  private uBuf!: GPUBuffer
  private ruBuf!: GPUBuffer
  private muBuf!: GPUBuffer
  private post!: GPURenderPipeline
  private puBuf!: GPUBuffer
  private postBG: GPUBindGroup | null = null
  private sceneTex: GPUTexture | null = null
  private zTex: GPUTexture | null = null
  private posBuf!: GPUBuffer
  private colBuf!: GPUBuffer
  private sampler!: GPUSampler
  private depthTex: GPUTexture | null = null
  private renderBG!: GPUBindGroup
  private computeBG: GPUBindGroup | null = null
  private meshBG: GPUBindGroup | null = null
  private tex: GPUTexture | null = null
  private aspect = 1.5
  private gridW = 627
  private gridH = 418
  private depthMap: { w: number; h: number; data: Uint8ClampedArray } | null = null
  private uData = new Float32Array(12)
  private ruData = new Float32Array(40)
  private meshData = new Float32Array(72)
  private postData = new Float32Array(8)
  private meshN = 512
  private width = 1
  private height = 1
  private lastTime = 0
  private time = 0
  private smoothPointer: [number, number] = [0, 0]
  private shots: Shot[]

  constructor(shots: Shot[]) {
    this.shots = shots
  }

  static supported() {
    return typeof navigator !== 'undefined' && 'gpu' in navigator
  }

  async init(canvas: HTMLCanvasElement) {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) throw new Error('no adapter')
    this.device = await adapter.requestDevice()
    this.ctx = canvas.getContext('webgpu')!
    this.format = navigator.gpu.getPreferredCanvasFormat()
    this.ctx.configure({ device: this.device, format: this.format, alphaMode: 'opaque' })
    this.meshN = window.innerWidth < 880 ? 320 : 512

    const d = this.device
    const blend: GPUBlendState = {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    }
    d.pushErrorScope('validation')
    this.compute = d.createComputePipeline({
      layout: 'auto',
      compute: { module: d.createShaderModule({ code: COMPUTE_WGSL }), entryPoint: 'step' },
    })
    // The scene renders off screen (colour + view depth), then a post pass
    // composes it onto the canvas.
    const targets: GPUColorTargetState[] = [{ format: 'rgba8unorm', blend }, { format: 'r16float' }]
    const renderModule = d.createShaderModule({ code: RENDER_WGSL })
    this.render = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: renderModule, entryPoint: 'vs' },
      fragment: { module: renderModule, entryPoint: 'fs', targets },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
    })
    const meshModule = d.createShaderModule({ code: CITY_MESH_WGSL })
    this.mesh = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: meshModule, entryPoint: 'vs' },
      fragment: { module: meshModule, entryPoint: 'fs', targets },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    })
    const postModule = d.createShaderModule({ code: POST_WGSL })
    this.post = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: postModule, entryPoint: 'vs' },
      fragment: { module: postModule, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    })
    const shaderError = await d.popErrorScope()
    if (shaderError) throw new Error(shaderError.message)

    const init = new Float32Array(N * 4)
    for (let i = 0; i < N; i++) {
      init[i * 4] = (Math.random() * 2 - 1) * 3.2
      init[i * 4 + 1] = (Math.random() * 2 - 1) * 2.2
      init[i * 4 + 2] = (Math.random() * 2 - 1) * 1.2
      init[i * 4 + 3] = Math.random()
    }
    this.posBuf = d.createBuffer({ size: init.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    d.queue.writeBuffer(this.posBuf, 0, init)
    this.colBuf = d.createBuffer({ size: N * 16, usage: GPUBufferUsage.STORAGE })
    this.uBuf = d.createBuffer({ size: this.uData.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.ruBuf = d.createBuffer({
      size: this.ruData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.muBuf = d.createBuffer({ size: 288, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.puBuf = d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.sampler = d.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
    this.renderBG = d.createBindGroup({
      layout: this.render.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.ruBuf } },
        { binding: 1, resource: { buffer: this.posBuf } },
        { binding: 2, resource: { buffer: this.colBuf } },
      ],
    })
    this.resize(canvas)
    this.lastTime = performance.now()
  }

  resize(canvas: HTMLCanvasElement) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    if (this.width !== w || this.height !== h || !this.depthTex) {
      this.width = w
      this.height = h
      this.depthTex?.destroy()
      this.sceneTex?.destroy()
      this.zTex?.destroy()
      const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
      this.depthTex = this.device.createTexture({
        size: [w, h],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      })
      this.sceneTex = this.device.createTexture({ size: [w, h], format: 'rgba8unorm', usage })
      this.zTex = this.device.createTexture({ size: [w, h], format: 'r16float', usage })
      this.postBG = this.device.createBindGroup({
        layout: this.post.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.puBuf } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: this.sceneTex.createView() },
          { binding: 3, resource: this.zTex.createView() },
        ],
      })
    }
  }

  /** Decode the city photograph (depth packed in alpha) and keep a CPU copy of the depth for framing. */
  async load(url: string, width: number, height: number) {
    const blob = await (await fetch(url)).blob()
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
    const tex = this.device.createTexture({
      size: [bmp.width, bmp.height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    })
    this.device.queue.copyExternalImageToTexture({ source: bmp }, { texture: tex, premultipliedAlpha: false }, [
      bmp.width,
      bmp.height,
    ])
    // A small CPU copy of the depth channel, so a shot can focus on a roof, not the ground under it.
    const cw = 192
    const ch = Math.round((cw * height) / width)
    const c = document.createElement('canvas')
    c.width = cw
    c.height = ch
    const g = c.getContext('2d', { willReadFrequently: true })
    if (g) {
      g.drawImage(bmp, 0, 0, cw, ch)
      this.depthMap = { w: cw, h: ch, data: g.getImageData(0, 0, cw, ch).data }
    }
    bmp.close()
    this.tex = tex
    this.aspect = width / height
    this.gridW = Math.round(Math.sqrt(N * this.aspect))
    this.gridH = Math.floor(N / this.gridW)
    this.computeBG = null
    this.meshBG = null
  }

  ready() {
    return this.tex !== null
  }

  private depthAt(u: number, v: number) {
    const m = this.depthMap
    if (!m) return 0.5
    const x = Math.min(m.w - 1, Math.max(0, Math.round(u * (m.w - 1))))
    const y = Math.min(m.h - 1, Math.max(0, Math.round(v * (m.h - 1))))
    return m.data[(y * m.w + x) * 4 + 3] / 255
  }

  /** World point on the model for a shot. */
  private targetOf(shot: Shot, L: Layout): Vec3 {
    const z = (this.depthAt(shot.u, shot.v) - 0.5) * L.depth * S
    return [(shot.u - 0.5) * 2 * this.aspect * S, (0.5 - shot.v) * 2 * S, z]
  }

  /** Camera distance at which the whole city fits the layout box. */
  private fitDistance(L: Layout) {
    const va = this.width / this.height
    return Math.max(S / (L.fh * TAN), (S * this.aspect) / (L.fw * TAN * va))
  }

  private poseOf(shot: Shot, L: Layout): [Vec3, Vec3] {
    const T = this.targetOf(shot, L)
    const dist = this.fitDistance(L) / shot.zoom
    const E = offsetEye(T, dist, shot.yaw, shot.pitch)
    return [E, T]
  }

  /**
   * Scroll to shot coordinate and orbit angle. Inside a dwell the coordinate
   * holds and the orbit follows the wheel. Between dwells the camera eases
   * across while the orbit unwinds, so the next dwell starts where this one
   * left off rather than jumping.
   */
  private mapScroll(raw: number): [number, number] {
    const last = this.shots.length - 1
    const u = Math.min(Math.max(raw - CENTRE, -CENTRE), last + 0.6)
    const base = Math.floor(u)
    const g = u - base
    if (base < 0) return [0, clampAbs(u / DWELL, 1) * ORBIT]
    if (base >= last) return [last, clampAbs(g / DWELL, 1) * ORBIT]
    if (g <= DWELL) return [base, (g / DWELL) * ORBIT]
    if (g >= 1 - DWELL) return [base + 1, ((g - 1) / DWELL) * ORBIT]
    const f = smootherstep((g - DWELL) / (1 - 2 * DWELL))
    return [base + f, ORBIT - 2 * ORBIT * f]
  }

  /** The same mapping for the flat fallback, as uv and zoom. */
  static flatShot(shots: Shot[], raw: number): { u: number; v: number; zoom: number } {
    const last = shots.length - 1
    const u = Math.min(Math.max(raw - CENTRE, 0), last)
    const base = Math.floor(u)
    const g = u - base
    let f = 0
    if (g > DWELL && g < 1 - DWELL) f = smootherstep((g - DWELL) / (1 - 2 * DWELL))
    else if (g >= 1 - DWELL) f = 1
    const a = shots[base]
    const b = shots[Math.min(base + 1, last)]
    return { u: a.u + (b.u - a.u) * f, v: a.v + (b.v - a.v) * f, zoom: a.zoom + (b.zoom - a.zoom) * f }
  }

  frame(state: FrameState) {
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.lastTime) / 1000)
    this.lastTime = now
    this.time += dt
    const L = state.layout
    if (!this.tex) return

    // Spline through the shot poses, with a pulled-back waypoint between each
    // pair so the camera arcs rather than skimming the model.
    const [s, orbit] = this.mapScroll(state.raw)
    const dFit = this.fitDistance(L)
    const eyes: Vec3[] = []
    const tgts: Vec3[] = []
    let prev: [Vec3, Vec3] | null = null
    for (const shot of this.shots) {
      const pose = this.poseOf(shot, L)
      if (prev) {
        const [E0, T0] = prev
        const [E1, T1] = pose
        const mid: Vec3 = [(T0[0] + T1[0]) / 2, (T0[1] + T1[1]) / 2, (T0[2] + T1[2]) / 2]
        const far = Math.hypot(T1[0] - T0[0], T1[1] - T0[1])
        const back = Math.min(1, far / (2 * S)) * PULL * dFit
        eyes.push([(E0[0] + E1[0]) / 2, (E0[1] + E1[1]) / 2 + back * 0.25, (E0[2] + E1[2]) / 2 + back])
        tgts.push(mid)
      }
      eyes.push(pose[0])
      tgts.push(pose[1])
      prev = pose
    }
    const sp = this.smoothPointer
    sp[0] += (state.pointer[0] - sp[0]) * Math.min(1, dt * 3)
    sp[1] += (state.pointer[1] - sp[1]) * Math.min(1, dt * 3)
    const tgt = catmull(tgts, s * 2)
    const eye0 = catmull(eyes, s * 2)
    const yaw = orbit + sp[0] * 0.05 + Math.sin(this.time * 0.17) * 0.012
    const rel0 = sub(eye0, tgt)
    const rel = rotY(rel0, yaw)
    const eye: Vec3 = [tgt[0] + rel[0], tgt[1] + rel[1] - sp[1] * 0.03 * len(rel), tgt[2] + rel[2]]
    const view = lookAt(eye, tgt, [0, 1, 0])
    const va = this.width / this.height
    const proj = perspective(FOV, va, 0.05, 100)
    const dCur = len(rel)

    const enc = this.device.createCommandEncoder()
    const introActive = state.intro < 1

    if (introActive) {
      const u = this.uData
      u[0] = this.time
      u[1] = dt
      u[2] = state.intro
      u[3] = N
      u[4] = this.gridW
      u[5] = this.gridH
      u[6] = this.aspect
      u[7] = 0.0035
      u[8] = this.aspect * S
      u[9] = S
      u[10] = L.depth
      u[11] = state.fade
      this.device.queue.writeBuffer(this.uBuf, 0, u)
      const ru = this.ruData
      ru.set(view, 0)
      ru.set(proj, 16)
      ru[32] = this.width
      ru[33] = this.height
      const pitch = (this.height * (S / (dCur * TAN))) / this.gridH
      ru[34] = Math.max(1, pitch * 1.12)
      ru[36] = L.offsetX
      ru[37] = L.offsetY
      this.device.queue.writeBuffer(this.ruBuf, 0, ru)
      if (!this.computeBG) {
        this.computeBG = this.device.createBindGroup({
          layout: this.compute.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: this.uBuf } },
            { binding: 1, resource: { buffer: this.posBuf } },
            { binding: 2, resource: { buffer: this.colBuf } },
            { binding: 3, resource: this.sampler },
            { binding: 4, resource: this.tex.createView() },
          ],
        })
      }
      const cp = enc.beginComputePass()
      cp.setPipeline(this.compute)
      cp.setBindGroup(0, this.computeBG)
      cp.dispatchWorkgroups(Math.ceil(N / WG))
      cp.end()
    }

    const md = this.meshData
    md.set(view, 0)
    md.set(proj, 16)
    md.set(IDENTITY, 32)
    md[48] = L.offsetX
    md[49] = L.offsetY
    md[50] = this.aspect * S
    md[51] = S
    md[52] = this.aspect
    md[53] = L.depth
    md[54] = this.gridW
    md[55] = this.gridH
    md[56] = state.intro
    md[57] = state.fade
    md[58] = this.meshN
    md[64] = eye[0]
    md[65] = eye[1]
    md[66] = eye[2]
    md[67] = this.time
    md[68] = tgt[0]
    md[69] = tgt[1]
    md[70] = tgt[2]
    const zoomCur = dFit / dCur
    md[59] = smoothstep(1.25, 1.9, zoomCur)
    md[60] = 0.42
    this.device.queue.writeBuffer(this.muBuf, 0, md)

    // Depth of field: focus on the shot, a range that narrows as the camera closes in.
    const pu = this.postData
    pu[0] = this.width
    pu[1] = this.height
    pu[2] = dCur
    pu[3] = dCur * (0.55 - 0.3 * smoothstep(1.0, 2.4, zoomCur))
    pu[4] = 7 * Math.min(2, window.devicePixelRatio || 1) * 0.5 * (this.width > 1600 ? 1.4 : 1)
    pu[5] = this.time
    pu[6] = 0.22
    pu[7] = 0.028
    this.device.queue.writeBuffer(this.puBuf, 0, pu)
    if (!this.meshBG) {
      this.meshBG = this.device.createBindGroup({
        layout: this.mesh.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.muBuf } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: this.tex.createView() },
        ],
      })
    }

    const rp = enc.beginRenderPass({
      colorAttachments: [
        {
          view: this.sceneTex!.createView(),
          clearValue: { r: 0.906, g: 0.898, b: 0.875, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
        {
          view: this.zTex!.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depthTex!.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    })
    rp.setPipeline(this.mesh)
    rp.setBindGroup(0, this.meshBG)
    rp.draw(6 * this.meshN * this.meshN)
    if (introActive) {
      rp.setPipeline(this.render)
      rp.setBindGroup(0, this.renderBG)
      rp.draw(6, N)
    }
    rp.end()

    const pp = enc.beginRenderPass({
      colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store' }],
    })
    pp.setPipeline(this.post)
    pp.setBindGroup(0, this.postBG!)
    pp.draw(3)
    pp.end()
    this.device.queue.submit([enc.finish()])
  }

  destroy() {
    this.device?.destroy()
  }
}

// --- small vector / matrix helpers (column-major mat4) ------------------------
type Vec3 = [number, number, number]

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

function offsetEye(T: Vec3, dist: number, yaw: number, pitch: number): Vec3 {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cp = Math.cos(pitch)
  const spx = Math.sin(pitch)
  // start at (0, 0, dist), tilt by pitch about X, then swing by yaw about Y
  const y = -spx * dist
  const z = cp * dist
  return [T[0] + sy * z, T[1] + y, T[2] + cy * z]
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
function len(a: Vec3) {
  return Math.hypot(a[0], a[1], a[2])
}
function norm(a: Vec3): Vec3 {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
function rotY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]]
}
function clampAbs(x: number, m: number) {
  return Math.min(Math.max(x, -m), m)
}
function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}
function smootherstep(x: number) {
  const t = Math.min(Math.max(x, 0), 1)
  return t * t * t * (t * (t * 6 - 15) + 10)
}
function catmull(pts: Vec3[], s: number): Vec3 {
  const n = pts.length
  const i = Math.min(Math.max(Math.floor(s), 0), n - 1)
  const t = Math.min(Math.max(s - i, 0), 1)
  const p0 = pts[Math.max(i - 1, 0)]
  const p1 = pts[i]
  const p2 = pts[Math.min(i + 1, n - 1)]
  const p3 = pts[Math.min(i + 2, n - 1)]
  const out: Vec3 = [0, 0, 0]
  for (let c = 0; c < 3; c++) {
    out[c] =
      0.5 *
      (2 * p1[c] +
        (-p0[c] + p2[c]) * t +
        (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t +
        (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t * t * t)
  }
  return out
}
function lookAt(eye: Vec3, target: Vec3, up: Vec3) {
  const z = norm(sub(eye, target))
  const x = norm(cross(up, z))
  const y = cross(z, x)
  const m = new Float32Array(16)
  m[0] = x[0]
  m[1] = y[0]
  m[2] = z[0]
  m[4] = x[1]
  m[5] = y[1]
  m[6] = z[1]
  m[8] = x[2]
  m[9] = y[2]
  m[10] = z[2]
  m[12] = -dot(x, eye)
  m[13] = -dot(y, eye)
  m[14] = -dot(z, eye)
  m[15] = 1
  return m
}
function perspective(fov: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fov / 2)
  const nf = 1 / (near - far)
  const m = new Float32Array(16)
  m[0] = f / aspect
  m[5] = f
  m[10] = (far + near) * nf
  m[11] = -1
  m[14] = 2 * far * near * nf
  return m
}
