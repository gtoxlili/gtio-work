import { COMMON } from '../gpu/shaders'

/**
 * The screen: a plane the size of the frame, displaced by the opening
 * photograph's depth while it assembles and flat once the film takes over.
 * Colour comes from the photograph, or, with `film`, from the decoded frame
 * bound as an external texture.
 */
export function filmMeshWgsl(film: boolean) {
  return /* wgsl */ `
struct MU {
  view: mat4x4f,
  proj: mat4x4f,
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
  time: f32,
  _pad: vec4f,
};

@group(0) @binding(0) var<uniform> mu: MU;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;
${film ? '@group(0) @binding(3) var vid: texture_external;' : ''}

${COMMON}

struct VO {
  @builtin(position) p: vec4f,
  @location(0) uv: vec2f,
  @location(1) viewZ: f32,
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
  let vp = mu.view * vec4f(local, 1.0);
  var cp = mu.proj * vp;
  cp = vec4f(cp.xy + mu.offset * cp.w, cp.zw);
  var o: VO;
  o.p = cp;
  o.uv = uv;
  o.viewZ = -vp.z;
  return o;
}

@fragment
fn fs(in: VO) -> FO {
  ${
    film
      ? 'let c = textureSampleBaseClampToEdge(vid, samp, in.uv).rgb;'
      : 'let c = textureSample(tex, samp, in.uv).rgb;'
  }
  let i = cellOf(in.uv, mu.gridW, mu.gridH);
  let r = hash13(f32(i) * 0.7318 + 11.0);
  let a = cellAssembled(assembleOf(mu.intro, r)) * feather(in.uv) * mu.fade;
  if (a < 0.01) { discard; }
  var o: FO;
  o.c = vec4f(c * a, a);
  o.z = vec4f(in.viewZ, 0.0, 0.0, 0.0);
  return o;
}
`
}
