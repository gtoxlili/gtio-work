import { COMPUTE_WGSL, POST_WGSL, RENDER_WGSL } from '../gpu/shaders'
import { filmMeshWgsl } from './shaders'

export type Layout = {
  /** how much of the viewport's half-height the frame fills */
  fh: number
  /** how much of the viewport's half-width it may fill */
  fw: number
  /** clip-space offset of the frame (pushes it beside the text) */
  offsetX: number
  offsetY: number
  /** depth relief of the opening photograph, relative to its half-height */
  depth: number
}

type FrameState = {
  /** the decoded frame to show, or null to keep showing the opening photograph */
  frame: VideoFrame | null
  /** 0..1 assembly of the opening photograph from dust */
  intro: number
  /** 0..1 overall opacity */
  fade: number
  pointer: [number, number]
  layout: Layout
}

const N = 262_144
const WG = 256
const FOV = (30 * Math.PI) / 180
const TAN = Math.tan(FOV / 2)
const S = 1

/**
 * The screen the film plays on. On load the opening photograph assembles out
 * of particles onto a shallow relief; the relief then flattens and every frame
 * the page scrubs to is drawn in its place. A post pass adds the vignette and
 * the grain.
 */
export class FilmScreen {
  private device!: GPUDevice
  private ctx!: GPUCanvasContext
  private format!: GPUTextureFormat
  private compute!: GPUComputePipeline
  private render!: GPURenderPipeline
  private mesh!: GPURenderPipeline
  private meshFilm: GPURenderPipeline | null = null
  private post!: GPURenderPipeline
  private uBuf!: GPUBuffer
  private ruBuf!: GPUBuffer
  private muBuf!: GPUBuffer
  private puBuf!: GPUBuffer
  private posBuf!: GPUBuffer
  private colBuf!: GPUBuffer
  private sampler!: GPUSampler
  private renderBG!: GPUBindGroup
  private computeBG: GPUBindGroup | null = null
  private meshBG: GPUBindGroup | null = null
  private postBG: GPUBindGroup | null = null
  private sceneTex: GPUTexture | null = null
  private zTex: GPUTexture | null = null
  private depthTex: GPUTexture | null = null
  private tex: GPUTexture | null = null
  private aspect = 1.818
  private gridW = 690
  private gridH = 379
  private uData = new Float32Array(12)
  private ruData = new Float32Array(40)
  private meshData = new Float32Array(56)
  private postData = new Float32Array(8)
  private meshN = 384
  private width = 1
  private height = 1
  private lastTime = 0
  private time = 0
  private relief = 1
  private smoothPointer: [number, number] = [0, 0]
  private lastFrame: VideoFrame | null = null

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
    this.meshN = window.innerWidth < 880 ? 256 : 384

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
    const targets: GPUColorTargetState[] = [{ format: 'rgba8unorm', blend }, { format: 'r16float' }]
    const renderModule = d.createShaderModule({ code: RENDER_WGSL })
    this.render = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: renderModule, entryPoint: 'vs' },
      fragment: { module: renderModule, entryPoint: 'fs', targets },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
    })
    const meshDesc = (module: GPUShaderModule): GPURenderPipelineDescriptor => ({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    })
    this.mesh = d.createRenderPipeline(meshDesc(d.createShaderModule({ code: filmMeshWgsl(false) })))
    const postModule = d.createShaderModule({ code: POST_WGSL })
    this.post = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: postModule, entryPoint: 'vs' },
      fragment: { module: postModule, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    })
    const shaderError = await d.popErrorScope()
    if (shaderError) throw new Error(shaderError.message)
    // The film variant in its own scope: a WebGPU without external textures
    // keeps the opening photograph rather than losing the page.
    d.pushErrorScope('validation')
    const withFilm = d.createRenderPipeline(meshDesc(d.createShaderModule({ code: filmMeshWgsl(true) })))
    this.meshFilm = (await d.popErrorScope()) ? null : withFilm

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
    this.muBuf = d.createBuffer({
      size: this.meshData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
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

  /** Whether frames can be bound at all on this device. */
  get playsFilm() {
    return this.meshFilm !== null
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

  /** The opening photograph, its depth packed in alpha. It is also frame 0 of the film. */
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
    bmp.close()
    this.tex = tex
    this.aspect = width / height
    this.gridW = Math.round(Math.sqrt(N * this.aspect))
    this.gridH = Math.floor(N / this.gridW)
    this.computeBG = null
    this.meshBG = null
  }

  private fitDistance(L: Layout) {
    const va = this.width / this.height
    return Math.max(S / (L.fh * TAN), (S * this.aspect) / (L.fw * TAN * va))
  }

  frame(state: FrameState) {
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.lastTime) / 1000)
    this.lastTime = now
    this.time += dt
    const L = state.layout
    if (!this.tex) return

    // A fixed camera at the distance where the frame fits its box; the pointer
    // tilts it a little. The relief settles flat once the photograph has assembled.
    const sp = this.smoothPointer
    sp[0] += (state.pointer[0] - sp[0]) * Math.min(1, dt * 3)
    sp[1] += (state.pointer[1] - sp[1]) * Math.min(1, dt * 3)
    const reliefGoal = state.intro >= 1 ? 0 : 1
    this.relief += (reliefGoal - this.relief) * Math.min(1, dt * 1.2)
    const dist = this.fitDistance(L)
    const yaw = sp[0] * 0.04 + Math.sin(this.time * 0.17) * 0.006
    const pitch = -sp[1] * 0.025
    const eye: Vec3 = [Math.sin(yaw) * dist, -Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist]
    const view = lookAt(eye, [0, 0, 0], [0, 1, 0])
    const proj = perspective(FOV, this.width / this.height, 0.05, 100)
    const depth = L.depth * this.relief

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
      u[10] = depth
      u[11] = state.fade
      this.device.queue.writeBuffer(this.uBuf, 0, u)
      const ru = this.ruData
      ru.set(view, 0)
      ru.set(proj, 16)
      ru[32] = this.width
      ru[33] = this.height
      const pitchPx = (this.height * (S / (dist * TAN))) / this.gridH
      ru[34] = Math.max(1, pitchPx * 1.12)
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
    md[32] = L.offsetX
    md[33] = L.offsetY
    md[34] = this.aspect * S
    md[35] = S
    md[36] = this.aspect
    md[37] = depth
    md[38] = this.gridW
    md[39] = this.gridH
    md[40] = state.intro
    md[41] = state.fade
    md[42] = this.meshN
    md[43] = this.time
    this.device.queue.writeBuffer(this.muBuf, 0, md)

    const pu = this.postData
    pu[0] = this.width
    pu[1] = this.height
    pu[2] = dist
    pu[3] = 1e6 // no depth of field: the footage brings its own focus
    pu[4] = 0
    pu[5] = this.time
    pu[6] = 0.2
    pu[7] = 0.024
    this.device.queue.writeBuffer(this.puBuf, 0, pu)

    // The frame to show: the decoded one when the device can bind it, else the
    // opening photograph. The last good frame stays up while the next decodes.
    let filmBG: GPUBindGroup | null = null
    const vf = state.frame ?? this.lastFrame
    if (vf && this.meshFilm && !introActive) {
      try {
        filmBG = this.device.createBindGroup({
          layout: this.meshFilm.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: this.muBuf } },
            { binding: 1, resource: this.sampler },
            { binding: 2, resource: this.tex.createView() },
            { binding: 3, resource: this.device.importExternalTexture({ source: vf }) },
          ],
        })
        this.lastFrame = vf
      } catch (err) {
        console.warn('frame texture unavailable', err)
        this.meshFilm = null
      }
    }
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
    if (filmBG && this.meshFilm) {
      rp.setPipeline(this.meshFilm)
      rp.setBindGroup(0, filmBG)
    } else {
      rp.setPipeline(this.mesh)
      rp.setBindGroup(0, this.meshBG)
    }
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
    this.lastFrame = null
    this.device?.destroy()
  }
}

type Vec3 = [number, number, number]

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
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
