// Lit haze in froxels: the air in front of the camera cut into cells, a grid across the screen by slices of depth.
//
// Each frame, after the scene is drawn (so the sun's shadow map is fresh), two compute passes run. The first
// lights every cell: how much haze is there (thickest on the ground, thinning with height over it, stirred by slow
// drifting wisps), and the light it scatters toward the camera: the sun's or moon's through its shadow map (so tall
// trees and buildings throw shafts through it) and the clouds, mostly forward (Henyey-Greenstein); the sky's, by
// what the GI probes say reaches that point (all the light arriving there with bounce light), or half the sky and
// half the ground without them; the point lights' (lamps, the torch), unshadowed; and lava's glow, from the
// emission in the GI height field's ground colours round the point. The second walks each column of cells from the
// camera out, adding up the light scattered back and how much gets through, and keeps both at every slice. Drawing
// then reads that at a pixel's depth (shaders.js, hazeApply): what's behind dims by what gets through and the
// haze's own light goes on top.
//
// Slices run evenly in depth over just the air the view looks through near the ground: from where the view's
// corners come down through `top` above the target to where they meet `bottom` below it. Nearer than that there's
// no haze; past it, the last slice's.

import { MAX_POINTS } from './shaders.js';

const PARAM_BYTES = 256;
const SCAT_FORMAT = 'rgba16float';

const COMMON = /* wgsl */ `
struct HP {
  cn: array<vec4f, 4>,  // the view's corners on the near plane: top left, top right, bottom left, bottom right
  cf: array<vec4f, 4>,  // and on the far plane
  dims: vec4f,          // cells across, down, slices
  range: vec4f,         // the camera's near and far, the slices' first and last depth
  dens: vec4f,          // density (a tile), height it thins over (tiles), what's left high up, ground where unknown
  light: vec4f,         // sun, forward scattering (g), sky, lamps
  more: vec4f,          // lava, wisps, wisp size (tiles), seconds
  tint: vec4f,          // the haze's colour
  wind: vec4f,          // the wisps' drift (tiles a second)
}
fn cellRay(uv: vec2f) -> array<vec3f, 2> {
  let a = mix(mix(H.cn[0].xyz, H.cn[1].xyz, uv.x), mix(H.cn[2].xyz, H.cn[3].xyz, uv.x), uv.y);
  let b = mix(mix(H.cf[0].xyz, H.cf[1].xyz, uv.x), mix(H.cf[2].xyz, H.cf[3].xyz, uv.x), uv.y);
  return array<vec3f, 2>(a, b);
}
`;

const LIGHT_WGSL = /* wgsl */ `
@group(2) @binding(0) var<uniform> H: HP;
@group(2) @binding(1) var scatOut: texture_storage_3d<${SCAT_FORMAT}, write>;
@group(2) @binding(2) var groundCol: texture_2d<f32>;
${COMMON}
fn hash3(p: vec3i) -> f32 {
  var h = (u32(p.x) * 73856093u) ^ (u32(p.y) * 19349663u) ^ (u32(p.z) * 83492791u);
  h = (h ^ (h >> 13u)) * 1274126177u;
  return f32(h & 0xffffu) / 65535.0;
}
fn noise3(p: vec3f) -> f32 {
  let i = vec3i(floor(p)); let f = p - floor(p); let u = f * f * (3.0 - 2.0 * f);
  let a = mix(mix(hash3(i), hash3(i + vec3i(1, 0, 0)), u.x), mix(hash3(i + vec3i(0, 1, 0)), hash3(i + vec3i(1, 1, 0)), u.x), u.y);
  let b = mix(mix(hash3(i + vec3i(0, 0, 1)), hash3(i + vec3i(1, 0, 1)), u.x), mix(hash3(i + vec3i(0, 1, 1)), hash3(i + vec3i(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z);
}
// the ground under xz, from the GI height field (where it reaches)
fn groundAt(xz: vec2f) -> f32 {
  if (giHfSize() <= 0) { return H.dens.w; }
  let g = giGround(xz);
  return select(g, H.dens.w, g < -1000.0);
}
// the sun's shadow at p: one tap (the comparison sampler's own 2 × 2 filtering), none off the map
fn shadowAt(p: vec3f) -> f32 {
  if (F.sunColor.w < 0.5) { return 1.0; }
  let sc = F.shadowMat * vec4f(p, 1.0);
  let s = sc.xyz / sc.w;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) { return 1.0; }
  return textureSampleCompareLevel(shadowMap, shadowSamp, s.xy, s.z + F.shadow.x);
}
// lava's glow at p: what the ground round about gives off, falling away with distance
fn glowAt(p: vec3f) -> vec3f {
  let S = giHfSize();
  if (S <= 0) { return vec3f(0.0); }
  var sum = vec3f(0.0);
  for (var j = -2; j <= 2; j++) {
    for (var i = -2; i <= 2; i++) {
      let xz = floor(p.xz) + vec2f(f32(i), f32(j)) + 0.5;
      let t = vec2i(floor(xz * f32(GI_TPT)));
      let r = t - giHfOrigin();
      if (any(r < vec2i(0)) || any(r >= vec2i(S))) { continue; }
      let c = textureLoad(groundCol, ((t % S) + S) % S, 0);
      if (c.a <= 0.0) { continue; }
      let d = p - vec3f(xz.x, giHf(t).x, xz.y);
      sum += c.rgb * c.a / (1.0 + dot(d, d));
    }
  }
  return sum;
}
@compute @workgroup_size(4, 4, 4)
fn light(@builtin(global_invocation_id) id: vec3u) {
  let D = vec3u(H.dims.xyz);
  if (any(id >= D)) { return; }
  let uv = (vec2f(id.xy) + 0.5) / H.dims.xy;
  let ray = cellRay(uv);
  let depth = H.range.z + (f32(id.z) + 0.5) * (H.range.w - H.range.z) / H.dims.z;
  let p = mix(ray[0], ray[1], (depth - H.range.x) / (H.range.y - H.range.x));
  let V = normalize(ray[0] - ray[1]);
  // how much haze
  let over = max(p.y - groundAt(p.xz), 0.0);
  var dens = H.dens.x * mix(exp(-over / max(H.dens.y, 0.05)), 1.0, H.dens.z);
  if (H.more.y > 0.0) {
    let q = (p - H.wind.xyz * H.more.w) / max(H.more.z, 0.5);
    let n = 0.65 * noise3(q) + 0.35 * noise3(q * 2.3 + 17.0);
    dens *= max(1.0 - H.more.y + H.more.y * 2.0 * n, 0.0);
  }
  // the light it scatters toward the camera (phases scaled so even scattering is 1)
  var L = vec3f(0.0);
  if (F.sunDir.w > 0.5 && H.light.x > 0.0) {
    let g = clamp(H.light.y, -0.95, 0.95);
    let c = dot(-F.sunDir.xyz, V);
    let hg = (1.0 - g * g) / pow(max(1.0 + g * g - 2.0 * g * c, 1e-4), 1.5);
    L += F.sunColor.rgb * cloudShade(p.xz) * mix(1.0, shadowAt(p), F.cloud2.z) * hg * H.light.x;
  }
  if (F.hemiSky.w > 0.5 && H.light.z > 0.0) {
    var amb = 0.5 * (F.hemiSky.rgb + F.hemiGround.rgb);
    if (F.giA.x > 0.5) {
      let gg = giGather(p, vec3f(0.0), F.giA.x > 1.5);
      if (gg.w > 1e-6) {
        let lit = select(F.hemiSky.rgb * gg.vis.x + F.hemiGround.rgb * 0.5 * sat(2.0 * gg.vis.x), gg.light, F.giA.x > 1.5);
        amb = mix(amb, lit, F.giA.y);
      }
    }
    L += amb * H.light.z;
  }
  if (H.light.w > 0.0) {
    let np = i32(F.cloud2.w);
    for (var i = 0; i < ${MAX_POINTS}; i++) {
      if (i >= np) { break; }
      let pl = F.points[i];
      let dist = length(pl.pos.xyz - p);
      var att = 1.0;
      if (pl.pos.w > 0.0 && pl.color.w > 0.0) { att = pow(sat(1.0 - dist / pl.pos.w), pl.color.w); }
      L += pl.color.rgb * att * H.light.w;
    }
  }
  if (H.more.x > 0.0) { L += glowAt(p) * H.more.x; }
  textureStore(scatOut, id, vec4f(H.tint.rgb * L * dens, dens));
}
`;

const INTEGRATE_WGSL = /* wgsl */ `
@group(0) @binding(0) var<uniform> H: HP;
@group(0) @binding(1) var scatIn: texture_3d<f32>;
@group(0) @binding(2) var sumOut: texture_storage_3d<${SCAT_FORMAT}, write>;
${COMMON}
@compute @workgroup_size(8, 8, 1)
fn integrate(@builtin(global_invocation_id) id: vec3u) {
  let D = vec3u(H.dims.xyz);
  if (id.x >= D.x || id.y >= D.y) { return; }
  let ray = cellRay((vec2f(id.xy) + 0.5) / H.dims.xy);
  // world distance a slice spans along this cell's ray
  let ds = length(ray[1] - ray[0]) / (H.range.y - H.range.x) * (H.range.w - H.range.z) / H.dims.z;
  var S = vec3f(0.0);
  var T = 1.0;
  for (var z = 0u; z < D.z; z++) {
    let s = textureLoad(scatIn, vec3u(id.xy, z), 0);
    let k = max(s.a, 0.0);
    let t = exp(-k * ds);
    // the light scattered over the slice, less what's lost again before it leaves the slice
    let part = select(s.rgb * ds, s.rgb * (1.0 - t) / k, k > 1e-5);
    S += T * part;
    T *= t;
    textureStore(sumOut, vec3u(id.xy, z), vec4f(S, T));
  }
}
`;

export class FroxelHaze {
  // renderer: the gfx renderer; its frame (the camera's, the sun and its shadow map, the lights, the GI) lights it
  constructor(renderer) {
    this.renderer = renderer;
    const device = this.device = renderer.device, S = GPUShaderStage;
    this.params = device.createBuffer({ size: PARAM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.bglLight = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: S.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: S.COMPUTE, storageTexture: { access: 'write-only', format: SCAT_FORMAT, viewDimension: '3d' } },
      { binding: 2, visibility: S.COMPUTE, texture: { sampleType: 'float' } },
    ] });
    this.bglSum = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: S.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: S.COMPUTE, texture: { sampleType: 'unfilterable-float', viewDimension: '3d' } },
      { binding: 2, visibility: S.COMPUTE, storageTexture: { access: 'write-only', format: SCAT_FORMAT, viewDimension: '3d' } },
    ] });
    const empty = device.createBindGroupLayout({ entries: [] });
    this.emptyBG = device.createBindGroup({ layout: empty, entries: [] });
    const mod = (code, label) => {
      const m = device.createShaderModule({ code, label });
      if (m.getCompilationInfo) m.getCompilationInfo().then(info => {
        for (const e of info.messages) if (e.type === 'error') console.error(`${label} WGSL ${e.lineNum}:${e.linePos} ${e.message}\n` + code.split('\n')[e.lineNum - 1]);
      });
      return m;
    };
    this.lightPipe = device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [renderer.bglFrame, empty, this.bglLight] }),
      compute: { module: mod(renderer.preludeCode() + LIGHT_WGSL, 'haze light'), entryPoint: 'light' } });
    this.sumPipe = device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [this.bglSum] }),
      compute: { module: mod(INTEGRATE_WGSL, 'haze sum'), entryPoint: 'integrate' } });
    this.dims = [0, 0, 0];
    this.on = false; this.z0 = 1; this.z1 = 2; this.key = 0;
    this._lightBG = null; this._lightKey = '';
    this._v = [0, 1, 2, 3, 4, 5, 6, 7].map(() => null);
  }

  _allocate(X, Y, Z) {
    if (this.scat) { this.scat.destroy(); this.sum.destroy(); }
    const T = GPUTextureUsage, dev = this.device, size = [X, Y, Z];
    this.scat = dev.createTexture({ label: 'haze light', size, dimension: '3d', format: SCAT_FORMAT, usage: T.STORAGE_BINDING | T.TEXTURE_BINDING });
    this.sum = dev.createTexture({ label: 'haze sum', size, dimension: '3d', format: SCAT_FORMAT, usage: T.STORAGE_BINDING | T.TEXTURE_BINDING });
    this.sumView = this.sum.createView();
    this.sumBG = dev.createBindGroup({ layout: this.bglSum, entries: [
      { binding: 0, resource: { buffer: this.params } }, { binding: 1, resource: this.scat.createView() }, { binding: 2, resource: this.sumView }] });
    this.scatView = this.scat.createView();
    this.dims = [X, Y, Z]; this.key++; this._lightKey = '';
  }
  // what drawing reads: the summed volume (or null with the haze off) and the frame's hazeA, hazeB
  view() { return this.on ? this.sumView : null; }
  uniforms() { return [this.on ? 1 : 0, this.z0, this.z1, this.dims[2], this.dims[0], this.dims[1], 0, 0]; }

  // Each frame, after the scene is drawn and before what reads it. f: { on, camera, cells: [across, down],
  // slices, top, bottom (world y the slices run between), density, height, floor, ground (y where the height
  // field doesn't reach), sun, forward, sky, lamps, lava, wisps, wispSize, wind: [x, y, z], tint: [r, g, b],
  // groundColour (the GI's ground colour view, or null) }
  update(f) {
    this.on = !!f.on;
    if (!this.on) return;
    const X = Math.max(1, Math.min(256, f.cells[0] | 0)), Y = Math.max(1, Math.min(256, f.cells[1] | 0)), Z = Math.max(8, Math.min(128, f.slices | 0));
    if (X !== this.dims[0] || Y !== this.dims[1] || Z !== this.dims[2]) this._allocate(X, Y, Z);
    const cam = f.camera, d = new Float32Array(PARAM_BYTES / 4);
    cam.updateMatrixWorld();
    const near = cam.near, far = cam.far, corners = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
    let z0 = far, z1 = near;
    corners.forEach(([x, y], i) => {
      const a = (this._v[i] = this._v[i] || cam.position.clone()).set(x, y, -1).unproject(cam);
      const b = (this._v[i + 4] = this._v[i + 4] || cam.position.clone()).set(x, y, 1).unproject(cam);
      d.set([a.x, a.y, a.z, 0], i * 4); d.set([b.x, b.y, b.z, 0], 16 + i * 4);
      // where this corner's ray comes down through the top and the bottom, as depths
      const at = yy => Math.abs(b.y - a.y) < 1e-6 ? (a.y > yy ? 1 : 0) : Math.min(Math.max((yy - a.y) / (b.y - a.y), 0), 1);
      z0 = Math.min(z0, near + at(f.top) * (far - near));
      z1 = Math.max(z1, near + at(f.bottom) * (far - near));
    });
    if (z1 < z0 + 1) z1 = z0 + 1;
    this.z0 = z0; this.z1 = z1;
    d.set([X, Y, Z, 0], 32);
    d.set([near, far, z0, z1], 36);
    d.set([f.density, f.height, f.floor, f.ground], 40);
    d.set([f.sun, f.forward, f.sky, f.lamps], 44);
    d.set([f.lava, f.wisps, f.wispSize, performance.now() / 1000], 48);
    d.set([...f.tint, 0], 52);
    d.set([...f.wind, 0], 56);
    this.device.queue.writeBuffer(this.params, 0, d);
    const gk = this.key + ':' + (f.groundColour ? f.groundColourKey || 'g' : 'w');
    if (this._lightKey !== gk) {
      this._lightKey = gk;
      const gc = f.groundColour || this.renderer.white.createView();
      this._lightBG = this.device.createBindGroup({ layout: this.bglLight, entries: [
        { binding: 0, resource: { buffer: this.params } }, { binding: 1, resource: this.scatView }, { binding: 2, resource: gc }] });
    }
    this.renderer.compute((enc, frameBG, frameOff) => {
      const pass = enc.beginComputePass({ label: 'haze' });
      pass.setPipeline(this.lightPipe);
      pass.setBindGroup(0, frameBG, [frameOff]);
      pass.setBindGroup(1, this.emptyBG);
      pass.setBindGroup(2, this._lightBG);
      pass.dispatchWorkgroups(Math.ceil(X / 4), Math.ceil(Y / 4), Math.ceil(Z / 4));
      pass.setPipeline(this.sumPipe);
      pass.setBindGroup(0, this.sumBG);
      pass.dispatchWorkgroups(Math.ceil(X / 8), Math.ceil(Y / 8), 1);
      pass.end();
    });
  }
}
