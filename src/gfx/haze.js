// Lit haze, marched per pixel.
//
// The game draws at a low mosaic resolution, so a ray can be marched through the air for every mosaic pixel, out to
// that pixel's own depth: nothing is shared between neighbouring pixels, so the haze can't smear across an edge,
// and the steps fall evenly with no random jitter, so there's no dithering. Each frame, after the scene is drawn
// (so the sun's shadow map is fresh), two compute passes run:
//
// - ground: over the GI height field window, each texel's bare ground (the lowest within three tiles, as the
//   height field's ground has trunks, walls and rocks standing on it: going by that, a tall trunk would have
//   ground-thick haze all the way up it) and lava's light, blurred (what the ground within a few tiles gives off,
//   falling away with distance), so a step reads both in one lookup;
// - march: for each mosaic pixel, the stretch of its ray between `top` and `bottom` (world y) and nearer than what
//   it sees, cut into `steps` steps (crowded low down where the haze is thick: see warpW). At each step's ends,
//   how much haze (thickest on the ground under it, thinning with height, stirred by slow drifting wisps) and
//   the light it scatters toward the camera: the sun's or moon's through its shadow map (so tall trees and
//   buildings throw shafts) and the clouds, more forward than back
//   (Henyey-Greenstein); the sky's, by what the GI probes say reaches there (all the light arriving with bounce
//   light; read at the ends and middle of the stretch and blended between, as it changes slowly), or half the sky
//   and half the ground without them; the point lights' (lamps, the torch), unshadowed; and lava's glow. It keeps
//   the light gathered and how much of what's behind gets through, which the outline pass lays over the picture
//   (shaders.js, hazeApply).

import { MAX_POINTS } from './shaders.js';

const PARAM_BYTES = 256;
const OUT_FORMAT = 'rgba16float';
const NOISE = 32;   // the wisps' value-noise lattice: a repeating 3D texture of random values this many a side

const COMMON = /* wgsl */ `
struct HP {
  cn: array<vec4f, 4>,  // the view's corners on the near plane: top left, top right, bottom left, bottom right
  cf: array<vec4f, 4>,  // and on the far plane
  dims: vec4f,          // mosaic pixels across, down, scene samples a mosaic pixel (each way), steps
  range: vec4f,         // the camera's near and far, the top and bottom of the air (world y)
  dens: vec4f,          // density (a tile), height it thins over (tiles), what's left high up, ground where unknown
  light: vec4f,         // sun, forward scattering (g), sky, lamps
  more: vec4f,          // lava, wisps, wisp size (tiles), seconds
  tint: vec4f,          // the haze's colour; w: how much of the light it scatters toward the camera is added (lift)
  wind: vec4f,          // the wisps' drift (tiles a second)
  glow: vec4f,          // tiles lava's glow fades over, upward; how much of the sun's light shadows take out; and
                        // how much of the sky's (for shafts with more contrast)
}
@group(2) @binding(0) var<uniform> H: HP;
`;

const GLOW_WGSL = /* wgsl */ `
${COMMON}
@group(2) @binding(1) var groundCol: texture_2d<f32>;
@group(2) @binding(2) var glowOut: texture_storage_2d<${OUT_FORMAT}, write>;
// each texel of the window: what the ground within four and a half tiles gives off, read a tile apart, less with
// distance (measured from this texel itself, so the glow eases smoothly across a tile rather than stepping at its
// edges, which showed as stripes rising off lava); and the lowest ground within three tiles (very low where none is
// known)
@compute @workgroup_size(8, 8, 1)
fn glow(@builtin(global_invocation_id) id: vec3u) {
  let S = giHfSize();
  if (S <= 0 || i32(id.x) >= S || i32(id.y) >= S) { return; }
  let o = giHfOrigin();
  let t = o + (((vec2i(id.xy) - o) % S) + S) % S;   // the world texel in this slot
  var sum = vec3f(0.0);
  var low = 1e4;
  let here = (vec2f(t) + 0.5) / f32(GI_TPT);
  let tile = vec2i(floor(here));
  for (var j = -5; j <= 5; j++) {
    for (var i = -5; i <= 5; i++) {
      if (H.more.x > 0.0) {
        // each tile's middle texel, weighed by a smooth bump 4.5 tiles round this texel (as much in all as before)
        let u = (tile + vec2i(i, j)) * GI_TPT + GI_TPT / 2;
        let r = u - o;
        let d = (vec2f(u) + 0.5) / f32(GI_TPT) - here;
        let w = max(1.0 - dot(d, d) / 20.25, 0.0);
        if (w > 0.0 && all(r >= vec2i(0)) && all(r < vec2i(S))) {
          let c = textureLoad(groundCol, ((u % S) + S) % S, 0);
          sum += c.rgb * c.a * 0.49 * w * w;
        }
      }
      if (abs(i) <= 3 && abs(j) <= 3) {
        let u = t + vec2i(i, j) * GI_TPT;
        let r = u - o;
        if (all(r >= vec2i(0)) && all(r < vec2i(S))) {
          let g = giHfRaw(((u % S) + S) % S).x;
          if (g > -1000.0) { low = min(low, g); }
        }
      }
    }
  }
  textureStore(glowOut, vec2i(id.xy), vec4f(sum, select(low, -1e4, low > 9999.0)));
}
`;

const MARCH_WGSL = /* wgsl */ `
${COMMON}
@group(2) @binding(1) var sceneDepth: texture_depth_2d;
@group(2) @binding(2) var glowTex: texture_2d<f32>;
@group(2) @binding(3) var hazeOut: texture_storage_2d<${OUT_FORMAT}, write>;
@group(2) @binding(4) var noiseTex: texture_3d<f32>;
@group(2) @binding(5) var noiseSamp: sampler;
// smooth value noise in one lookup: the lattice is the texture, and reading it at the smoothstepped place inside
// the cell makes the hardware's trilinear blend the smooth one (8 lattice values without 8 hashes)
fn noise3(p: vec3f) -> f32 {
  let f = p - floor(p);
  let u = floor(p) + f * f * (3.0 - 2.0 * f) + 0.5;
  return textureSampleLevel(noiseTex, noiseSamp, u / ${NOISE}.0, 0.0).r;
}
// the bare ground under xz, from the ground pass (where the height field reaches)
fn groundAt(xz: vec2f) -> f32 {
  let S = giHfSize();
  if (S <= 0) { return H.dens.w; }
  let g = textureSampleLevel(glowTex, linSamp, xz * f32(GI_TPT) / f32(S), 0.0).a;
  return select(g, H.dens.w, g < -1000.0);
}
// the wisps at p: what share of the haze's thickness is left there (1 without them)
fn wispAt(p: vec3f) -> f32 {
  if (H.more.y <= 0.0) { return 1.0; }
  let q = (p - H.wind.xyz * H.more.w) / max(H.more.z, 0.5);
  let n = 0.65 * noise3(q) + 0.35 * noise3(q * 2.3 + 17.0);
  return max(1.0 - H.more.y + H.more.y * 2.0 * n, 0.0);
}
// Where the steps fall: evenly in a measure that runs WARP_A + exp(-u) along the stretch, u its height over the
// ground (in the haze's thinning heights), u0 + beta s at s (0 to 1 along it). So the steps crowd low down where
// the haze is thick, and still come every so often in the thin air above, for the shafts. The same for every
// pixel looking through the same air: no jitter. warpW is the measure up to s, warpD its rate there.
const WARP_A = 0.3;
fn warpW(s: f32, u0: f32, beta: f32) -> f32 {
  if (abs(beta) < 1e-4) { return (WARP_A + exp(-u0)) * s; }
  return WARP_A * s + (exp(-u0) - exp(-max(u0 + beta * s, -10.0))) / beta;
}
fn warpD(s: f32, u0: f32, beta: f32) -> f32 { return WARP_A + exp(-max(u0 + beta * s, -10.0)); }
// the sun's shadow at p: one tap (the comparison sampler's own 2 × 2 filtering), none off the map
fn shadowAt(p: vec3f) -> f32 {
  if (F.sunColor.w < 0.5) { return 1.0; }
  let sc = F.shadowMat * vec4f(p, 1.0);
  let s = sc.xyz / sc.w;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) { return 1.0; }
  return textureSampleCompareLevel(shadowMap, shadowSamp, s.xy, s.z + F.shadow.x);
}
// a probe's light in every direction at once (its spherical harmonics' constant term): with sky visibility, the
// sky's by the share of it seen and the ground's by how open it is; with bounce light, all that arrives
fn probeLight(c: vec2i, layer: i32, plain: vec3f) -> vec3f {
  let g = giGrid();
  let rel = c - g.xy;
  if (any(rel < vec2i(0)) || any(rel >= vec2i(g.z))) { return plain; }
  let s = giSlot(c, g.z);
  let v = giVisAt(vec3i(s.x, layer, s.y));
  // one that can't be used (inside a crown or a roof, or not lit yet): a fixed, shaded stand-in, never left out,
  // so the light never jumps where a column changes
  if (v.x < 0.0) { return 0.3 * (F.hemiSky.rgb + F.hemiGround.rgb); }
  if (F.giA.x > 1.5) {
    let li = vec3i(s.x * 3, layer, s.y);
    return max(vec3f(giLightAt(li).x, giLightAt(li + vec3i(1, 0, 0)).x, giLightAt(li + vec3i(2, 0, 0)).x), vec3f(0.0));
  }
  return F.hemiSky.rgb * v.x + F.hemiGround.rgb * 0.5 * sat(2.0 * v.x);
}
// the sky's light in the air at p: the probes of the four columns round it, two heights each, blended by
// nearness alone (no surface to face, no wall to test), so it changes smoothly everywhere
fn ambientAt(p: vec3f) -> vec3f {
  let plain = 0.5 * (F.hemiSky.rgb + F.hemiGround.rgb);
  if (F.giA.x < 0.5) { return plain; }
  let L = giGrid().w;
  let gp = p.xz - 0.5;
  let base = vec2i(floor(gp));
  let f = gp - floor(gp);
  var sum = vec3f(0.0);
  for (var i = 0; i < 4; i++) {
    let o = vec2i(i & 1, i >> 1);
    let c = base + o;
    let w = select(1.0 - f.x, f.x, o.x == 1) * select(1.0 - f.y, f.y, o.y == 1);
    let floorY = giColumnBase(c);
    if (floorY < -1000.0) { sum += w * plain; continue; }
    let h = p.y - floorY;
    let hl = clamp(h, giLayerH(0), giLayerH(L - 1));
    var l = 0;
    for (var k = 1; k < L - 1; k++) { if (hl >= giLayerH(k)) { l = k; } }
    let t = clamp((hl - giLayerH(l)) / (giLayerH(l + 1) - giLayerH(l)), 0.0, 1.0);
    // a column standing on something taller than p (a trunk, a wall) has its probes up on top, in other light:
    // the further below them, the more the shaded stand-in takes over
    let low = smoothstep(-2.0, 0.0, h);
    sum += w * mix(0.3 * (F.hemiSky.rgb + F.hemiGround.rgb), mix(probeLight(c, l, plain), probeLight(c, l + 1, plain), t), low);
  }
  return mix(plain, sum, F.giA.y);
}
// lava's glow at p, over ground g: the blurred map at the ground under it, fading upward
fn glowAt(p: vec3f, g: f32) -> vec3f {
  let S = giHfSize();
  if (S <= 0) { return vec3f(0.0); }
  let r = vec2i(floor(p.xz * f32(GI_TPT))) - giHfOrigin();
  if (any(r < vec2i(1)) || any(r >= vec2i(S - 1))) { return vec3f(0.0); }
  let c = textureSampleLevel(glowTex, linSamp, p.xz * f32(GI_TPT) / f32(S), 0.0).rgb;
  return c * exp(-max(p.y - g, 0.0) / max(H.glow.x, 0.1));
}
@compute @workgroup_size(8, 8, 1)
fn march(@builtin(global_invocation_id) id: vec3u) {
  let res = vec2u(H.dims.xy);
  if (id.x >= res.x || id.y >= res.y) { return; }
  let uv = (vec2f(id.xy) + 0.5) / H.dims.xy;
  let a = mix(mix(H.cn[0].xyz, H.cn[1].xyz, uv.x), mix(H.cn[2].xyz, H.cn[3].xyz, uv.x), uv.y);
  let b = mix(mix(H.cf[0].xyz, H.cf[1].xyz, uv.x), mix(H.cf[2].xyz, H.cf[3].xyz, uv.x), uv.y);
  let near = H.range.x; let far = H.range.y;
  // how far along the ray (0 near plane, 1 far) what this pixel sees lies: its middle sample's depth
  let ss = i32(H.dims.z);
  let dsz = vec2i(textureDimensions(sceneDepth));
  let dd = textureLoad(sceneDepth, min(vec2i(id.xy) * ss + ss / 2, dsz - 1), 0);
  var tS = dd;
  if (F.camPos.w < 0.5) {
    let z = dd * 2.0 - 1.0;
    let D = 2.0 * near * far / (far + near - z * (far - near));
    tS = (D - near) / (far - near);
  }
  // the stretch of the ray in the air
  var t0 = 0.0; var t1 = tS;
  if (abs(b.y - a.y) > 1e-6) {
    let tA = (H.range.z - a.y) / (b.y - a.y); let tB = (H.range.w - a.y) / (b.y - a.y);
    t0 = max(min(tA, tB), 0.0); t1 = min(max(tA, tB), tS);
  } else if (a.y > H.range.z || a.y < H.range.w) { t1 = 0.0; }
  if (t1 <= t0) { textureStore(hazeOut, vec2i(id.xy), vec4f(0.0, 0.0, 0.0, 1.0)); return; }
  let n = max(i32(H.dims.w), 1);
  let pa = mix(a, b, t0); let seg = mix(a, b, t1) - pa; let len = length(seg);
  let V = normalize(a - b);
  // the sun's share, the same all along the ray but for shadow and cloud
  var sunC = vec3f(0.0);
  if (F.sunDir.w > 0.5 && H.light.x > 0.0) {
    let g = clamp(H.light.y, -0.95, 0.95);
    let c = dot(-F.sunDir.xyz, V);
    sunC = F.sunColor.rgb * (1.0 - g * g) / pow(max(1.0 + g * g - 2.0 * g * c, 1e-4), 1.5) * H.light.x;
  }
  // the sky's light is read every few steps (at knots along the stretch) and blended between
  let useSky = F.hemiSky.w > 0.5 && H.light.z > 0.0;
  let K = max(n / 4, 1);
  var knot = -1;
  var ambA = vec3f(0.0); var ambB = vec3f(0.0);
  let np = i32(F.cloud2.w);
  // the lamps whose reach this pixel's stretch of ray passes through (a lamp with a reach and a falloff gives
  // nothing beyond it), so the steps only add those
  var lamps = 0u;
  if (H.light.w > 0.0) {
    let sl = max(dot(seg, seg), 1e-8);
    for (var j = 0; j < ${MAX_POINTS}; j++) {
      if (j >= np) { break; }
      let pl = F.points[j];
      let h = clamp(dot(pl.pos.xyz - pa, seg) / sl, 0.0, 1.0);
      if (pl.pos.w <= 0.0 || pl.color.w <= 0.0 || length(pa + seg * h - pl.pos.xyz) < pl.pos.w) { lamps |= 1u << u32(j); }
    }
  }
  // the steps' spacing, from the ground where the stretch ends (see warpW)
  let hh = max(H.dens.y, 0.05);
  let gEnd = groundAt(pa.xz + seg.xz);
  let u0 = clamp((pa.y - gEnd) / hh, -10.0, 60.0);
  let beta = clamp(seg.y / hh, -200.0, 200.0);
  let total = warpW(1.0, u0, beta);
  // The light and the haze are read at the steps' ends and blended across each step: the light evenly, the
  // haze's thinning with height exactly (its mean over the step), so neither shows as bands between steps.
  var S = vec3f(0.0);
  var T = 1.0;
  var sP = 0.0; var uP = 0.0; var wP = 1.0; var LP = vec3f(0.0);
  for (var i = 0; i <= n; i++) {
    var s = 0.0;
    if (i == n) { s = 1.0; }
    else if (i > 0) {
      // where the measure reaches i/n of its whole (Newton, from the last end)
      let aim = total * f32(i) / f32(n);
      s = sP;
      for (var it = 0; it < 3; it++) { s = clamp(s - (warpW(s, u0, beta) - aim) / warpD(s, u0, beta), sP, 1.0); }
    }
    let p = pa + seg * s;
    let g = groundAt(p.xz);
    let u = max(p.y - g, 0.0) / hh;
    let w = wispAt(p);
    var L = vec3f(0.0);
    if (useSky) {
      let kf = s * f32(K);
      let ki = min(i32(floor(kf)), K - 1);
      if (ki != knot) {
        if (ki == knot + 1) { ambA = ambB; } else { ambA = ambientAt(pa + seg * (f32(ki) / f32(K))) * H.light.z; }
        ambB = ambientAt(pa + seg * (f32(ki + 1) / f32(K))) * H.light.z;
        knot = ki;
      }
      L = mix(ambA, ambB, kf - f32(ki));
      if (H.glow.z > 0.0 && F.sunDir.w > 0.5) { L *= mix(1.0, shadowAt(p), H.glow.z); }
    }
    if (any(sunC > vec3f(0.0))) { L += sunC * cloudShade(p.xz) * mix(1.0, shadowAt(p), H.glow.y); }
    if (lamps != 0u) {
      for (var j = 0; j < ${MAX_POINTS}; j++) {
        if (((lamps >> u32(j)) & 1u) == 0u) { continue; }
        let pl = F.points[j];
        let dist = length(pl.pos.xyz - p);
        var att = 1.0;
        if (pl.pos.w > 0.0 && pl.color.w > 0.0) { att = pow(sat(1.0 - dist / pl.pos.w), pl.color.w); }
        L += pl.color.rgb * att * H.light.w;
      }
    }
    if (H.more.x > 0.0) { L += glowAt(p, g) * H.more.x; }
    if (i > 0) {
      // the step from the last end to this one: exp(-u)'s mean over it (u runs straight between its ends)
      var e = exp(-0.5 * (u + uP));
      if (abs(u - uP) > 1e-3) { e = (exp(-uP) - exp(-u)) / (u - uP); }
      let k = H.dens.x * mix(e, 1.0, H.dens.z) * 0.5 * (w + wP);
      // what the step scatters toward the camera, less what it loses again before it leaves the step
      let t = exp(-k * len * (s - sP));
      S += T * H.tint.rgb * 0.5 * (L + LP) * (1.0 - t);
      T *= t;
    }
    sP = s; uP = u; wP = w; LP = L;
  }
  textureStore(hazeOut, vec2i(id.xy), vec4f(S * H.tint.w, T));
}
`;

export class LitHaze {
  // renderer: the gfx renderer; its frame (the camera's, the sun and its shadow map, the lights, the GI) lights it
  constructor(renderer) {
    this.renderer = renderer;
    const device = this.device = renderer.device, C = GPUShaderStage.COMPUTE;
    this.params = device.createBuffer({ size: PARAM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.bglGlow = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'uniform' } },
      { binding: 1, visibility: C, texture: { sampleType: 'float' } },
      { binding: 2, visibility: C, storageTexture: { access: 'write-only', format: OUT_FORMAT } },
    ] });
    this.bglMarch = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'uniform' } },
      { binding: 1, visibility: C, texture: { sampleType: 'depth' } },
      { binding: 2, visibility: C, texture: { sampleType: 'float' } },
      { binding: 3, visibility: C, storageTexture: { access: 'write-only', format: OUT_FORMAT } },
      { binding: 4, visibility: C, texture: { sampleType: 'float', viewDimension: '3d' } },
      { binding: 5, visibility: C, sampler: { type: 'filtering' } },
    ] });
    // the wisps' noise lattice (repeating)
    this.noise = device.createTexture({ label: 'haze noise', size: [NOISE, NOISE, NOISE], dimension: '3d', format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    const lattice = new Uint8Array(NOISE * NOISE * NOISE);
    let seed = 0x9e3779b9;
    for (let i = 0; i < lattice.length; i++) {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      lattice[i] = ((t ^ (t >>> 14)) >>> 0) & 255;
    }
    device.queue.writeTexture({ texture: this.noise }, lattice, { bytesPerRow: NOISE, rowsPerImage: NOISE }, [NOISE, NOISE, NOISE]);
    this.noiseView = this.noise.createView({ dimension: '3d' });
    this.noiseSamp = device.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat', magFilter: 'linear', minFilter: 'linear' });
    const empty = device.createBindGroupLayout({ entries: [] });
    this.emptyBG = device.createBindGroup({ layout: empty, entries: [] });
    const pipe = (code, label, entryPoint, bgl) => {
      code = renderer.preludeCode() + code;
      const module = device.createShaderModule({ code, label });
      if (module.getCompilationInfo) module.getCompilationInfo().then(info => {
        for (const e of info.messages) if (e.type === 'error') console.error(`${label} WGSL ${e.lineNum}:${e.linePos} ${e.message}\n` + code.split('\n')[e.lineNum - 1]);
      });
      return device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [renderer.bglFrame, empty, bgl] }), compute: { module, entryPoint } });
    };
    this.glowPipe = pipe(GLOW_WGSL, 'haze glow', 'glow', this.bglGlow);
    this.marchPipe = pipe(MARCH_WGSL, 'haze march', 'march', this.bglMarch);
    this.dims = [0, 0]; this.glowSize = 0;
    this.on = false; this.key = 0;
    this._marchKey = ''; this._glowKey = '';
    this._v = [];
  }

  _allocate(X, Y) {
    if (this.out) this.out.destroy();
    this.out = this.device.createTexture({ label: 'haze', size: [X, Y], format: OUT_FORMAT, usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
    this.outView = this.out.createView();
    this.dims = [X, Y]; this.key++; this._marchKey = '';
  }
  _allocateGlow(S) {
    if (this.glowTex) this.glowTex.destroy();
    this.glowTex = this.device.createTexture({ label: 'haze glow', size: [S, S], format: OUT_FORMAT, usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
    this.glowView = this.glowTex.createView();
    this.glowSize = S; this._marchKey = ''; this._glowKey = '';
  }
  // what drawing reads: the haze a mosaic pixel (or null with it off) and the frame's hazeA, hazeB
  view() { return this.on ? this.outView : null; }
  uniforms() { return [this.on ? 1 : 0, 0, 0, 0, this.dims[0], this.dims[1], 0, 0]; }

  // Each frame, after the scene is drawn and before what reads it. f: { on, camera, res: [x, y] (mosaic pixels),
  // ss (scene samples a mosaic pixel, each way), depth ({ view, id }: the scene's depth), steps, top, bottom (world
  // y the air runs between), density, height, floor, ground (y where the height field doesn't reach), sun,
  // forward, sky, lamps, lava, lavaHeight, shafts (how much of the sun's light shadows take out), shadeSky (and
  // how much of the sky's), wisps, wispSize, wind: [x, y, z], tint: [r, g, b], lift (0-1: how much of the
  // light the haze scatters toward the camera it adds; under 1, shadows stay darker while far things still
  // fade), groundColour (the GI's ground colour view, or null), hfSize (its texels across) }
  update(f) {
    this.on = !!f.on;
    if (!this.on) return;
    const X = Math.max(1, f.res[0] | 0), Y = Math.max(1, f.res[1] | 0);
    if (X !== this.dims[0] || Y !== this.dims[1]) this._allocate(X, Y);
    const S = Math.max(1, f.hfSize | 0);
    if (S !== this.glowSize) this._allocateGlow(S);
    const cam = f.camera, d = new Float32Array(PARAM_BYTES / 4);
    cam.updateMatrixWorld();
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([x, y], i) => {
      const a = (this._v[i] = this._v[i] || cam.position.clone()).set(x, y, -1).unproject(cam);
      const b = (this._v[i + 4] = this._v[i + 4] || cam.position.clone()).set(x, y, 1).unproject(cam);
      d.set([a.x, a.y, a.z, 0], i * 4); d.set([b.x, b.y, b.z, 0], 16 + i * 4);
    });
    d.set([X, Y, Math.max(1, Math.round(f.ss)), Math.max(1, Math.round(f.steps))], 32);
    d.set([cam.near, cam.far, f.top, f.bottom], 36);
    d.set([f.density, f.height, f.floor, f.ground], 40);
    d.set([f.sun, f.forward, f.sky, f.lamps], 44);
    d.set([f.lava, f.wisps, f.wispSize, performance.now() / 1000], 48);
    d.set([...f.tint, f.lift ?? 1], 52);
    d.set([...f.wind, 0], 56);
    d.set([f.lavaHeight, f.shafts, f.shadeSky, 0], 60);
    this.device.queue.writeBuffer(this.params, 0, d);
    const ground = !!f.groundColour;
    if (ground && this._glowKey !== String(this.glowSize)) {
      this._glowKey = String(this.glowSize);
      this.glowBG = this.device.createBindGroup({ layout: this.bglGlow, entries: [
        { binding: 0, resource: { buffer: this.params } }, { binding: 1, resource: f.groundColour }, { binding: 2, resource: this.glowView }] });
    }
    const mk = this.key + ':' + this.glowSize + ':' + f.depth.id;
    if (this._marchKey !== mk) {
      this._marchKey = mk;
      this.marchBG = this.device.createBindGroup({ layout: this.bglMarch, entries: [
        { binding: 0, resource: { buffer: this.params } }, { binding: 1, resource: f.depth.view },
        { binding: 2, resource: this.glowView }, { binding: 3, resource: this.outView },
        { binding: 4, resource: this.noiseView }, { binding: 5, resource: this.noiseSamp }] });
    }
    // (two passes, so the profiler times the ground and the march apart)
    this.renderer.compute((enc, frameBG, frameOff) => {
      if (ground) {
        const pass = enc.beginComputePass({ label: 'lit haze ground' });
        pass.setBindGroup(0, frameBG, [frameOff]);
        pass.setBindGroup(1, this.emptyBG);
        pass.setPipeline(this.glowPipe);
        pass.setBindGroup(2, this.glowBG);
        pass.dispatchWorkgroups(Math.ceil(S / 8), Math.ceil(S / 8), 1);
        pass.end();
      }
      const pass = enc.beginComputePass({ label: 'lit haze march' });
      pass.setBindGroup(0, frameBG, [frameOff]);
      pass.setBindGroup(1, this.emptyBG);
      pass.setPipeline(this.marchPipe);
      pass.setBindGroup(2, this.marchBG);
      pass.dispatchWorkgroups(Math.ceil(X / 8), Math.ceil(Y / 8), 1);
      pass.end();
    });
  }
}
