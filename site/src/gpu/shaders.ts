/**
 * WGSL for the city.
 *
 * One photograph of the model, displaced by the depth packed into its alpha
 * channel. CITY_MESH_WGSL draws it as a lit mesh and writes view depth to a
 * second target; POST_WGSL reads that depth for the shallow focus. On load,
 * COMPUTE_WGSL and RENDER_WGSL assemble the same image once out of a cloud of
 * particles, then hand over to the mesh and stop.
 */

const COMMON = /* wgsl */ `
fn hash13(n: f32) -> vec3f {
  var p3 = fract(vec3f(n) * vec3f(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

fn gridUV(i: u32, w: f32, h: f32) -> vec2f {
  let n = max(u32(w) * u32(h), 1u);
  let j = i % n;
  let x = f32(j % u32(w)) + 0.5;
  let y = f32(j / u32(w)) + 0.5;
  return vec2f(x / w, y / h);
}

fn cellOf(uv: vec2f, w: f32, h: f32) -> u32 {
  let x = min(u32(uv.x * w), u32(w) - 1u);
  let y = min(u32(uv.y * h), u32(h) - 1u);
  return y * u32(w) + x;
}

fn fitScaleOf(boxW: f32, boxH: f32, aspect: f32) -> f32 {
  return min(boxH, boxW / aspect);
}

fn planePosOf(uv: vec2f, aspect: f32, depth: f32, boxW: f32, boxH: f32, relief: f32) -> vec3f {
  let s = fitScaleOf(boxW, boxH, aspect);
  return vec3f((uv.x - 0.5) * 2.0 * aspect * s, (0.5 - uv.y) * 2.0 * s, (depth - 0.5) * relief * s);
}

// Soft edge so the photograph sits on the board instead of being a hard rectangle.
fn feather(uv: vec2f) -> f32 {
  let d = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  return smoothstep(0.0, 0.05, d);
}

// How far along the entrance one particle is. Staggering by r.y spreads the
// assembly over the picture instead of snapping it into place at once.
fn assembleOf(intro: f32, r: vec3f) -> f32 { return smoothstep(0.0, 1.0, clamp((intro - r.y * 0.55) / 0.45, 0.0, 1.0)); }

// A mesh cell turns opaque exactly as its particle fades out.
fn cellAssembled(assemble: f32) -> f32 { return smoothstep(0.85, 1.0, assemble); }
`

export const COMPUTE_WGSL = /* wgsl */ `
struct U {
  time: f32, dt: f32, intro: f32, count: f32,
  gridW: f32, gridH: f32, aspect: f32, sway: f32,
  boxW: f32, boxH: f32, depth: f32, fade: f32,
};

@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> pos: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> col: array<vec4f>;
@group(0) @binding(3) var samp: sampler;
@group(0) @binding(4) var tex: texture_2d<f32>;

${COMMON}

@compute @workgroup_size(256)
fn step(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u32(u.count)) { return; }

  let p = pos[i];
  let seed = p.w;
  let r = hash13(f32(i) * 0.7318 + 11.0);

  let uv = gridUV(i, u.gridW, u.gridH);
  let texel = textureSampleLevel(tex, samp, uv, 0.0);
  let home = planePosOf(uv, u.aspect, texel.a, u.boxW, u.boxH, u.depth);

  // Where a particle waits before the city exists.
  let cloud = (r * 2.0 - 1.0) * vec3f(1.6 * u.boxW, 1.4 * u.boxH, 0.7);
  let drift = 0.16 * vec3f(
    sin(u.time * 0.31 + seed * 6.2832),
    cos(u.time * 0.23 + seed * 9.4),
    sin(u.time * 0.17 + seed * 4.1));
  let chaos = cloud + drift;

  let assemble = assembleOf(u.intro, r);
  let breathe = u.sway * vec3f(sin(u.time * 0.9 + seed * 12.0), cos(u.time * 0.7 + seed * 8.0), 0.0);
  let goal = mix(chaos, home, assemble) + breathe;
  let k = 1.0 - exp(-u.dt * 12.0);
  pos[i] = vec4f(p.xyz + (goal - p.xyz) * k, seed);

  // Visible while flying, gone once the mesh cell behind it is opaque.
  let alpha = smoothstep(0.0, 0.3, assemble) * (1.0 - cellAssembled(assemble)) * feather(uv);
  col[i] = vec4f(texel.rgb, alpha * u.fade);
}
`

export const RENDER_WGSL = /* wgsl */ `
struct RU {
  view: mat4x4f,
  proj: mat4x4f,
  viewport: vec2f,
  size: f32,
  _p: f32,
  offset: vec2f,
  _p2: vec2f,
};

@group(0) @binding(0) var<uniform> ru: RU;
@group(0) @binding(1) var<storage, read> pos: array<vec4f>;
@group(0) @binding(2) var<storage, read> col: array<vec4f>;

struct VO {
  @builtin(position) p: vec4f,
  @location(0) c: vec4f,
  @location(1) q: vec2f,
  @location(2) z: f32,
};

struct FO {
  @location(0) c: vec4f,
  @location(1) z: vec4f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let q = corners[vi];
  let c = col[ii];
  var o: VO;
  // Invisible particles collapse to a degenerate point: no rasterisation cost.
  if (c.a <= 0.002) {
    o.p = vec4f(0.0, 0.0, 2.0, 1.0);
    o.c = vec4f(0.0);
    o.q = q;
    o.z = 0.0;
    return o;
  }
  let wp = ru.view * vec4f(pos[ii].xyz, 1.0);
  var cp = ru.proj * wp;
  let px = ru.size / ru.viewport * 2.0;
  cp = vec4f(cp.xy + (q * px + ru.offset) * cp.w, cp.zw);
  o.p = cp;
  o.c = c;
  o.q = q;
  o.z = -wp.z;
  return o;
}

@fragment
fn fs(in: VO) -> FO {
  let d = dot(in.q, in.q);
  if (d > 1.0) { discard; }
  let a = in.c.a * (1.0 - smoothstep(0.55, 1.0, d));
  var o: FO;
  o.c = vec4f(in.c.rgb * a, a);
  o.z = vec4f(in.z, 0.0, 0.0, 0.0);
  return o;
}
`

/**
 * The city: one depth-displaced photograph, lit. Normals come from the depth
 * map, so a key light, a rim and a small highlight move over the model as the
 * camera orbits; a soft spotlight follows the current shot; the ultramarine
 * details breathe. The pass also writes view depth for the post pass.
 */
export const CITY_MESH_WGSL = /* wgsl */ `
struct MU {
  view: mat4x4f,
  proj: mat4x4f,
  model: mat4x4f,
  offset: vec2f,
  boxW: f32,
  boxH: f32,
  aspect: f32,
  depth: f32,
  gridW: f32,
  gridH: f32,
  intro: f32,
  fade: f32,
  meshN: f32,
  spotAmt: f32,
  spotR: f32,
  // eye is a vec3f, so it aligns to the next 16 bytes: floats 61..63 are padding.
  eye: vec3f,
  time: f32,
  focus: vec3f,
  _pad1: f32,
};

@group(0) @binding(0) var<uniform> mu: MU;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

${COMMON}

struct VO {
  @builtin(position) p: vec4f,
  @location(0) uv: vec2f,
  @location(1) viewZ: f32,
  @location(2) world: vec3f,
};

struct FO {
  @location(0) c: vec4f,
  @location(1) z: vec4f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VO {
  let n = u32(mu.meshN);
  let quad = vi / 6u;
  let corner = vi % 6u;
  var cx = array<u32, 6>(0u, 1u, 0u, 0u, 1u, 1u);
  var cy = array<u32, 6>(0u, 0u, 1u, 1u, 0u, 1u);
  let qx = quad % n;
  let qy = quad / n;
  let uv = vec2f(f32(qx + cx[corner]) / f32(n), f32(qy + cy[corner]) / f32(n));
  let d = textureSampleLevel(tex, samp, uv, 0.0).a;
  let local = planePosOf(uv, mu.aspect, d, mu.boxW, mu.boxH, mu.depth);
  let wp4 = mu.model * vec4f(local, 1.0);
  let vp = mu.view * wp4;
  var cp = mu.proj * vp;
  cp = vec4f(cp.xy + mu.offset * cp.w, cp.zw);
  var o: VO;
  o.p = cp;
  o.uv = uv;
  o.viewZ = -vp.z;
  o.world = wp4.xyz;
  return o;
}

@fragment
fn fs(in: VO) -> FO {
  let c = textureSample(tex, samp, in.uv);
  let i = cellOf(in.uv, mu.gridW, mu.gridH);
  let r = hash13(f32(i) * 0.7318 + 11.0);
  var a = cellAssembled(assembleOf(mu.intro, r)) * feather(in.uv) * mu.fade;

  // Neighbouring depths: the silhouette cut and the surface normal share them.
  let e = 1.6 / mu.meshN;
  let dl = textureSample(tex, samp, in.uv - vec2f(e, 0.0)).a;
  let dr = textureSample(tex, samp, in.uv + vec2f(e, 0.0)).a;
  let du = textureSample(tex, samp, in.uv - vec2f(0.0, e)).a;
  let dd = textureSample(tex, samp, in.uv + vec2f(0.0, e)).a;
  let jump = max(abs(dr - dl), abs(dd - du));
  // Stretched skirts at depth jumps become matte board instead of a hole, so
  // they take the same dimming as their surroundings.
  let cut = smoothstep(0.09, 0.16, jump);
  if (a < 0.01) { discard; }

  // Normal of the relief (world z = (depth - 0.5) * mu.depth; x spans 2*aspect, y spans 2).
  // The depth map is 8-bit, so a wider stencil and a dead zone keep flat
  // surfaces flat instead of terraced.
  let en = 4.0 / mu.meshN;
  let nl = textureSample(tex, samp, in.uv - vec2f(en, 0.0)).a;
  let nr = textureSample(tex, samp, in.uv + vec2f(en, 0.0)).a;
  let nu = textureSample(tex, samp, in.uv - vec2f(0.0, en)).a;
  let nd = textureSample(tex, samp, in.uv + vec2f(0.0, en)).a;
  let q = 2.5 / 255.0;
  let gu = sign(nr - nl) * max(abs(nr - nl) - q, 0.0);
  let gv = sign(nd - nu) * max(abs(nd - nu) - q, 0.0);
  let dzdu = gu / (2.0 * en) * mu.depth;
  let dzdv = gv / (2.0 * en) * mu.depth;
  let nrm = normalize(vec3f(-dzdu / (2.0 * mu.aspect), dzdv / 2.0, 1.0));
  let L = normalize(vec3f(-0.45, 0.7, 0.6));
  let V = normalize(mu.eye - in.world);
  let H = normalize(L + V);
  let ndl = max(dot(nrm, L), 0.0);
  let spec = pow(max(dot(nrm, H), 0.0), 28.0) * 0.06;
  let rim = pow(1.0 - max(dot(nrm, V), 0.0), 3.0) * 0.08;
  var color = c.rgb * (0.8 + 0.2 * ndl) + vec3f(spec + rim);

  // Spotlight on the current shot: outside it the city dims and cools a little.
  let dxy = length(in.world.xy - mu.focus.xy);
  let inside = 1.0 - smoothstep(mu.spotR, mu.spotR * 2.2, dxy);
  let dim = mix(1.0, mix(0.62, 1.0, inside), mu.spotAmt);
  let gray = dot(color, vec3f(0.3, 0.59, 0.11));
  color = mix(vec3f(gray), color, 1.0 - 0.35 * (1.0 - inside) * mu.spotAmt) * dim;

  // The ultramarine details are the only colour in the model; let them breathe.
  let blueness = clamp((c.b - max(c.r, c.g)) * 4.0, 0.0, 1.0);
  color += vec3f(0.18, 0.28, 1.0) * blueness * (0.16 + 0.12 * sin(mu.time * 2.4 + in.uv.x * 9.0));

  color = mix(color, vec3f(0.906, 0.898, 0.875) * dim, cut);

  var o: FO;
  o.c = vec4f(color * a, a);
  o.z = vec4f(in.viewZ, 0.0, 0.0, 0.0);
  return o;
}
`

/**
 * Post pass over the whole frame: a shallow depth of field around the shot
 * (the miniature look), a soft vignette and a breath of grain.
 */
export const POST_WGSL = /* wgsl */ `
struct PU {
  viewport: vec2f,
  focusZ: f32,
  range: f32,
  maxR: f32,
  time: f32,
  vig: f32,
  grain: f32,
};

@group(0) @binding(0) var<uniform> pu: PU;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var scene: texture_2d<f32>;
@group(0) @binding(3) var zbuf: texture_2d<f32>;

struct VO {
  @builtin(position) p: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var pos = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VO;
  o.p = vec4f(pos[vi], 0.0, 1.0);
  o.uv = vec2f(pos[vi].x * 0.5 + 0.5, 1.0 - (pos[vi].y * 0.5 + 0.5));
  return o;
}

fn noise(p: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let z = textureSample(zbuf, samp, in.uv).r;
  var coc = 0.0;
  if (z > 0.01) {
    coc = clamp(abs(z - pu.focusZ) / pu.range, 0.0, 1.0);
  }
  let radius = coc * coc * pu.maxR;
  var col = textureSample(scene, samp, in.uv).rgb;
  if (radius > 0.6) {
    var taps = array<vec2f, 16>(
      vec2f(-0.94201624, -0.39906216), vec2f(0.94558609, -0.76890725),
      vec2f(-0.09418410, -0.92938870), vec2f(0.34495938, 0.29387760),
      vec2f(-0.91588581, 0.45771432), vec2f(-0.81544232, -0.87912464),
      vec2f(-0.38277543, 0.27676845), vec2f(0.97484398, 0.75648379),
      vec2f(0.44323325, -0.97511554), vec2f(0.53742981, -0.47373420),
      vec2f(-0.26496911, -0.41893023), vec2f(0.79197514, 0.19090188),
      vec2f(-0.24188840, 0.99706507), vec2f(-0.81409955, 0.91437590),
      vec2f(0.19984126, 0.78641367), vec2f(0.14383161, -0.14100790));
    let ang = noise(in.p.xy) * 6.2831853;
    let ca = cos(ang);
    let sa = sin(ang);
    var acc = col;
    var wsum = 1.0;
    for (var k = 0u; k < 16u; k++) {
      let t = taps[k];
      let off = vec2f(ca * t.x - sa * t.y, sa * t.x + ca * t.y) * radius / pu.viewport;
      let s = textureSampleLevel(scene, samp, in.uv + off, 0.0).rgb;
      acc += s;
      wsum += 1.0;
    }
    col = acc / wsum;
  }
  let d = distance(in.uv, vec2f(0.5, 0.5));
  col *= 1.0 - pu.vig * smoothstep(0.45, 0.95, d);
  col += (noise(in.p.xy + vec2f(pu.time * 61.0, pu.time * 37.0)) - 0.5) * pu.grain;
  return vec4f(col, 1.0);
}
`
