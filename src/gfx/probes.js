// Probe lighting over a height field (global illumination for ground that's a height map, not voxels).
//
// The world is cut into chunks; each gives a block of the height field (rasterChunk: a texel every half tile, the
// ground with what stands on it, one floating layer over it, and their colours). The blocks of the chunks round
// the camera sit in one texture that wraps, GI_WIN chunks across, so moving on only uploads the blocks coming in.
//
// Probes stand in columns, one a tile, at GI_LAYERS heights over their tile's ground, in a grid round the camera
// that also wraps (columns across: enough for the widest zoom). Each frame one compute pass goes over every probe:
// those in the view that aren't lit yet (just come into the grid, or the tuning changed), that stand near ground
// that changed, or (bounce light) whose turn it is, are traced; the rest are copied on. Rays march through the
// height field. Sky visibility (mode 1) keeps what share of each way reaches the sky; bounce light (mode 2) keeps
// the light arriving from each way: the sky's where a ray gets out, and where it meets the ground or a floating
// layer, the light that leaves it: its colour times the sun or moon on it (with a shadow ray), the point lights
// near it and the probes' own light there (so light bounces on), plus what it gives off itself (lava, lamps).
// The pass reads one copy of the probes and writes the other, and the two swap; the shaders that draw read the
// newest (shaders.js, giGather).

import { GI_WGSL, GI_TPT, GI_LAYERS } from './shaders.js';

export const GI_CHUNK = 32;                    // tiles across a chunk
export const GI_BLOCK = GI_CHUNK * GI_TPT;     // height field texels across a chunk
export const GI_WIN = 5;                       // chunks across the height field round the camera
const HF = GI_BLOCK * GI_WIN;
const MAX_DIRTY = 8, MAX_GI_POINTS = 8;
const PARAM_BYTES = 560;

const COMPUTE_WGSL = /* wgsl */ `
struct Point { pos: vec4f, color: vec4f }
struct GIP {
  grid: vec4i,     // first column x, z, columns across, layers
  hf: vec4i,       // the height field's first texel x, z, texels across
  cfg: vec4f,      // sky rays, reach (tiles), light through leaves (per tile), bounce
  cfg2: vec4f,     // mode, generation, this frame's slice, slices
  cfg3: vec4f,     // bounce rays
  view: vec4f,     // the view's middle over the ground x, z, and the way it looks (x, z)
  view2: vec4f,    // half its width and depth (tiles), the top of the world, dirty boxes
  sun: vec4f,      // toward the sun or moon, how much light its shadow takes away
  sunCol: vec4f,   // its light; w: point lights
  sky: vec4f,      // the sky's light
  ground: vec4f,   // the light from below past the height field
  dirty: array<vec4f, ${MAX_DIRTY}>,  // columns x0, z0, x1, z1 to retrace
  points: array<Point, ${MAX_GI_POINTS}>,
}
@group(0) @binding(0) var<uniform> P: GIP;
@group(0) @binding(1) var hfTex: texture_2d<f32>;
@group(0) @binding(2) var groundCol: texture_2d<f32>;
@group(0) @binding(3) var bandCol: texture_2d<f32>;
@group(0) @binding(4) var keyA: texture_3d<i32>;
@group(0) @binding(5) var visA: texture_3d<f32>;
@group(0) @binding(6) var lightA: texture_3d<f32>;
@group(0) @binding(7) var keyB: texture_storage_3d<rgba32sint, write>;
@group(0) @binding(8) var visB: texture_storage_3d<rgba16float, write>;
@group(0) @binding(9) var lightB: texture_storage_3d<rgba16float, write>;

fn giHfRaw(t: vec2i) -> vec4f { return textureLoad(hfTex, t, 0); }
fn giHfOrigin() -> vec2i { return P.hf.xy; }
fn giHfSize() -> i32 { return P.hf.z; }
fn giGrid() -> vec4i { return P.grid; }
fn giVisAt(i: vec3i) -> vec4f { return textureLoad(visA, i, 0); }
fn giLightAt(i: vec3i) -> vec4f { return textureLoad(lightA, i, 0); }
${GI_WGSL}
const PI = 3.141592653589793;

// Where a ray ended: 0 went its whole length, 1 out of the top, 2 out of the height field's side, 4 met the
// ground, 5 met a floating layer; how much light the leaves it went through let by; where, the texel, the normal.
struct Hit { end: u32, light: f32, p: vec3f, n: vec3f, t: vec2i }

fn groundNormal(t: vec2i) -> vec3f {
  let h = giHf(t).x;
  let d = vec4f(giHf(t - vec2i(1, 0)).x, giHf(t + vec2i(1, 0)).x, giHf(t - vec2i(0, 1)).x, giHf(t + vec2i(0, 1)).x);
  let e = clamp(d - h, vec4f(-3.0), vec4f(3.0));
  return normalize(vec3f(e.x - e.y, 1.0, e.z - e.w));
}

fn march(ro: vec3f, rd: vec3f, maxT: f32, leaves: f32) -> Hit {
  var h: Hit;
  h.light = 1.0;
  var t = 0.15;
  var prevY = ro.y;
  for (var i = 0; i < 64; i++) {
    if (t > maxT) { h.end = 0u; return h; }
    let p = ro + rd * t;
    if (p.y > P.view2.z) { h.end = 1u; return h; }
    let tx = vec2i(floor(p.xz * f32(GI_TPT)));
    let r = tx - P.hf.xy;
    if (any(r < vec2i(0)) || any(r >= vec2i(P.hf.z))) { h.end = 2u; return h; }
    let s = giHfRaw(((tx % P.hf.z) + P.hf.z) % P.hf.z);
    let dt = clamp(0.2 + t * 0.06, 0.2, 1.2);
    if (p.y < s.x) { h.end = 4u; h.p = p; h.t = tx; h.n = groundNormal(tx); return h; }
    if (giInBand(s, p.y)) {
      if (s.w < 0.01 || h.light < 0.03) {
        var n = normalize(vec3f(-rd.x, 0.0, -rd.z) + vec3f(1e-4, 0.0, 0.0));
        if (prevY < s.y) { n = vec3f(0.0, -1.0, 0.0); }
        if (prevY > s.z) { n = vec3f(0.0, 1.0, 0.0); }
        h.end = 5u; h.p = p; h.t = tx; h.n = n;
        return h;
      }
      h.light *= pow(leaves, dt);
    }
    prevY = p.y;
    t += dt;
  }
  h.end = 0u;
  return h;
}

// Fibonacci sphere: direction i of n spread evenly all round, turned by spin
fn giDir(i: u32, n: u32, spin: f32) -> vec3f {
  let y = 1.0 - (f32(i) + 0.5) * 2.0 / f32(n);
  let r = sqrt(max(1.0 - y * y, 0.0));
  let phi = f32(i) * 2.39996323 + spin;
  return vec3f(r * cos(phi), y, r * sin(phi));
}

// the light leaving what a ray met (as the drawn colour would be, without the haze)
fn faceLight(h: Hit) -> vec3f {
  let ti = ((h.t % P.hf.z) + P.hf.z) % P.hf.z;
  var a = textureLoad(groundCol, ti, 0);
  if (h.end == 5u) { a = textureLoad(bandCol, ti, 0); }
  let p = h.p + h.n * 0.1;
  var e = vec3f(0.0);
  let L = P.sun.xyz;
  let ndl = dot(h.n, L);
  if (ndl > 0.0 && dot(P.sunCol.rgb, vec3f(1.0)) > 0.0) {
    let s = march(p + h.n * 0.3, L, 30.0, P.cfg.z);
    var lit = s.light;
    if (s.end >= 4u) { lit = 0.0; }
    e += P.sunCol.rgb * ndl * mix(1.0, lit, P.sun.w);
  }
  for (var i = 0; i < i32(P.sunCol.w); i++) {
    let m = P.points[i];
    let d = m.pos.xyz - p;
    let dist = length(d);
    var att = 1.0;
    if (m.pos.w > 0.0) { att = pow(clamp(1.0 - dist / m.pos.w, 0.0, 1.0), max(m.color.w, 0.01)); }
    e += m.color.rgb * att * max(dot(h.n, d / max(dist, 1e-3)), 0.0);
  }
  // the light round about it: the probes' there, or the sky's when there's none
  let g = giGather(p + h.n * 0.4, h.n, true);
  if (g.w > 1e-6) { e += g.light; } else { e += mix(P.ground.rgb, P.sky.rgb, 0.5 * h.n.y + 0.5); }
  return a.rgb * e * P.cfg.w + a.rgb * a.a * 4.0;
}

fn hash2(p: vec2i) -> f32 { return fract(sin(dot(vec2f(p), vec2f(127.1, 311.7))) * 43758.5453); }

@compute @workgroup_size(4, 4, 4)
fn update(@builtin(global_invocation_id) id: vec3u) {
  let N = P.grid.z;
  if (i32(id.x) >= N || i32(id.y) >= P.grid.w || i32(id.z) >= N) { return; }
  let slot = vec2i(id.xz);
  let layer = i32(id.y);
  let vi = vec3i(slot.x, layer, slot.y);
  let li = vec3i(slot.x * 3, layer, slot.y);
  let c = P.grid.xy + giSlot(slot - P.grid.xy, N);
  let gen = i32(P.cfg2.y);
  let k = textureLoad(keyA, vi, 0);
  let same = k.x == c.x && k.y == c.y && k.z == gen && k.w == 1;
  let rel = vec2f(c) + 0.5 - P.view.xy;
  let fwd = P.view.zw;
  let inView = abs(rel.x * fwd.y - rel.y * fwd.x) <= P.view2.x && abs(dot(rel, fwd)) <= P.view2.y;
  var dirty = false;
  for (var i = 0; i < i32(P.view2.w); i++) {
    let d = P.dirty[i];
    let cf = vec2f(c);
    if (cf.x >= d.x && cf.y >= d.y && cf.x < d.z && cf.y < d.w) { dirty = true; }
  }
  let slices = max(i32(P.cfg2.w), 1);
  let refresh = P.cfg2.x > 1.5 && ((c.x * 7 + c.y * 13 + layer * 3) % slices + slices) % slices == i32(P.cfg2.z);
  if (!inView || (same && !dirty && !refresh)) {
    if (same) {
      textureStore(keyB, vi, k);
      textureStore(visB, vi, textureLoad(visA, vi, 0));
      for (var j = 0; j < 3; j++) { textureStore(lightB, li + vec3i(j, 0, 0), textureLoad(lightA, li + vec3i(j, 0, 0), 0)); }
    } else {
      textureStore(keyB, vi, vec4i(0));
      textureStore(visB, vi, vec4f(-1.0, 0.0, 0.0, 0.0));
      for (var j = 0; j < 3; j++) { textureStore(lightB, li + vec3i(j, 0, 0), vec4f(0.0)); }
    }
    return;
  }
  textureStore(keyB, vi, vec4i(c, gen, 1));
  let floorY = giColumnBase(c);
  let y = floorY + giLayerH(layer);
  if (floorY < -1000.0 || giInsideBand(c, y)) {
    textureStore(visB, vi, vec4f(-1.0, 0.0, 0.0, 0.0));
    for (var j = 0; j < 3; j++) { textureStore(lightB, li + vec3i(j, 0, 0), vec4f(0.0)); }
    return;
  }
  let ro = vec3f(f32(c.x) + 0.5, y, f32(c.y) + 0.5);
  let bounce = P.cfg2.x > 1.5;
  let n = u32(max(select(P.cfg.x, P.cfg3.x, bounce), 1.0));
  let spin = hash2(c * 3 + vec2i(layer)) * 6.2832;
  var a = 0.0;
  var b = vec3f(0.0);
  var la = vec3f(0.0);
  var lx = vec3f(0.0);
  var ly = vec3f(0.0);
  var lz = vec3f(0.0);
  for (var i = 0u; i < n; i++) {
    let rd = giDir(i, n, spin);
    let h = march(ro, rd, P.cfg.y, P.cfg.z);
    // out of the top sees the sky; a ray that went its whole length, or out of a side, does if it's heading up
    var v = 0.0;
    if (h.end == 1u) { v = h.light; }
    if (h.end == 0u || h.end == 2u) { v = h.light * smoothstep(-0.1, 0.1, rd.y); }
    a += v;
    b += v * rd;
    if (bounce) {
      var l = P.sky.rgb;
      if (h.end == 0u || h.end == 2u) { l = mix(P.ground.rgb, P.sky.rgb, smoothstep(-0.1, 0.1, rd.y)); }
      if (h.end >= 4u) { l = faceLight(h); }
      l *= h.light;
      la += l; lx += l * rd.x; ly += l * rd.y; lz += l * rd.z;
    }
  }
  let kn = 1.0 / f32(n);
  textureStore(visB, vi, vec4f(a, b) * kn);
  textureStore(lightB, li, vec4f(la.r, lx.r, ly.r, lz.r) * kn);
  textureStore(lightB, li + vec3i(1, 0, 0), vec4f(la.g, lx.g, ly.g, lz.g) * kn);
  textureStore(lightB, li + vec3i(2, 0, 0), vec4f(la.b, lx.b, ly.b, lz.b) * kn);
}
`;

// The probes, their compute pass and the height field round the camera.
export class HeightProbes {
  constructor(device) {
    this.device = device;
    const T = GPUTextureUsage;
    this.hf = device.createTexture({ label: 'gi height field', size: [HF, HF], format: 'rgba32float', usage: T.TEXTURE_BINDING | T.COPY_DST });
    this.gcol = device.createTexture({ label: 'gi ground colour', size: [HF, HF], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST });
    this.gcolView = this.gcol.createView();
    this.bcol = device.createTexture({ label: 'gi layer colour', size: [HF, HF], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST });
    this.hfView = this.hf.createView();
    this.params = device.createBuffer({ label: 'gi params', size: PARAM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const C = GPUShaderStage.COMPUTE, tex = (sampleType, viewDimension = '2d') => ({ visibility: C, texture: { sampleType, viewDimension } });
    const store = format => ({ visibility: C, storageTexture: { access: 'write-only', format, viewDimension: '3d' } });
    this.layout = device.createBindGroupLayout({ label: 'gi', entries: [
      { binding: 0, visibility: C, buffer: { type: 'uniform' } },
      { binding: 1, ...tex('unfilterable-float') }, { binding: 2, ...tex('float') }, { binding: 3, ...tex('float') },
      { binding: 4, ...tex('sint', '3d') }, { binding: 5, ...tex('float', '3d') }, { binding: 6, ...tex('float', '3d') },
      { binding: 7, ...store('rgba32sint') }, { binding: 8, ...store('rgba16float') }, { binding: 9, ...store('rgba16float') },
    ] });
    const module = device.createShaderModule({ label: 'gi probes', code: COMPUTE_WGSL });
    if (module.getCompilationInfo) module.getCompilationInfo().then(info => {
      for (const m of info.messages) if (m.type === 'error') console.error(`GI WGSL ${m.lineNum}:${m.linePos} ${m.message}\n` + COMPUTE_WGSL.split('\n')[m.lineNum - 1]);
    });
    this.pipeline = device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [this.layout] }), compute: { module, entryPoint: 'update' } });
    this.blocks = new Map();   // height field slot -> { cx, cz, version }
    this.dirty = [];
    this.N = 0; this.cur = 0; this.gen = 1; this.frame = 0; this.cfgKey = '';
    this.mode = 0; this.strength = 1; this.minimum = 0; this.bias = 0.3;
    this.grid = [0, 0]; this.hfOrigin = [0, 0];
    this.empty = { h: new Float32Array(GI_BLOCK * GI_BLOCK * 4), g: new Uint8Array(GI_BLOCK * GI_BLOCK * 4), b: new Uint8Array(GI_BLOCK * GI_BLOCK * 4), version: -1 };
    for (let i = 0; i < GI_BLOCK * GI_BLOCK; i++) this.empty.h.set([-1e4, 1, 0, 1], i * 4);
    this._allocate(48);
  }

  _allocate(N) {
    const L = GI_LAYERS.length, T = GPUTextureUsage, dev = this.device;
    if (this.sets) for (const s of this.sets) { s.key.destroy(); s.vis.destroy(); s.light.destroy(); }
    this.N = N;
    const make = (fmt, w) => dev.createTexture({ label: 'gi probes', size: [w, L, N], dimension: '3d', format: fmt, usage: T.TEXTURE_BINDING | T.STORAGE_BINDING });
    this.sets = [0, 1].map(() => ({ key: make('rgba32sint', N), vis: make('rgba16float', N), light: make('rgba16float', N * 3) }));
    for (const s of this.sets) { s.keyV = s.key.createView(); s.visV = s.vis.createView(); s.lightV = s.light.createView(); }
    // pass k reads set k and writes set 1 - k
    this.groups = [0, 1].map(k => {
      const A = this.sets[k], B = this.sets[1 - k];
      return dev.createBindGroup({ layout: this.layout, entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: this.hfView }, { binding: 2, resource: this.gcolView }, { binding: 3, resource: this.bcol.createView() },
        { binding: 4, resource: A.keyV }, { binding: 5, resource: A.visV }, { binding: 6, resource: A.lightV },
        { binding: 7, resource: B.keyV }, { binding: 8, resource: B.visV }, { binding: 9, resource: B.lightV },
      ] });
    });
    this.cur = 0;
    this.gen++;
  }

  // for the renderer: the newest probes and the height field, and the frame's numbers for them
  views() { const s = this.sets[this.cur]; return { vis: s.visV, light: s.lightV, hf: this.hfView, key: this.N + ':' + this.cur }; }
  uniforms() {
    return [this.mode, this.strength, this.minimum, this.bias, this.grid[0], this.grid[1], this.N, GI_LAYERS.length,
      this.hfOrigin[0], this.hfOrigin[1], HF, 0];
  }

  // Each frame, before drawing. f: { mode, strength, minimum, bias, rays, reach, leaves, bounce, bounceRays,
  // perFrame, target: [x, z], radius (tiles the grid must reach out from the target at the widest zoom),
  // view: { x, z, fx, fz, hw, hd } (the view over the ground: its middle, the way it looks, half its width and
  // depth), top (the world's top), sun: { dir, color, shadow }, sky, ground (colours), points: [{ pos, color,
  // distance, decay }], chunk(cx, cz) -> its height field block or null }
  update(f) {
    const mode = Math.round(Math.min(Math.max(f.mode, 0), 2));
    this.mode = mode; this.strength = f.strength; this.minimum = f.minimum; this.bias = f.bias;
    // the height field: the chunks round the camera's
    const ccx = Math.floor(f.target[0] / GI_CHUNK), ccz = Math.floor(f.target[1] / GI_CHUNK), h = Math.floor(GI_WIN / 2);
    this.hfOrigin = [(ccx - h) * GI_BLOCK, (ccz - h) * GI_BLOCK];
    const q = this.device.queue, reach = Math.ceil(f.reach) + 1;
    for (let cz = ccz - h; cz <= ccz + h; cz++) for (let cx = ccx - h; cx <= ccx + h; cx++) {
      const sx = ((cx % GI_WIN) + GI_WIN) % GI_WIN, sz = ((cz % GI_WIN) + GI_WIN) % GI_WIN, slot = sz * GI_WIN + sx;
      const data = f.chunk(cx, cz) || this.empty, had = this.blocks.get(slot);
      if (had && had.cx === cx && had.cz === cz && had.version === data.version && had.data === data) continue;
      this.blocks.set(slot, { cx, cz, version: data.version, data });
      const at = { x: sx * GI_BLOCK, y: sz * GI_BLOCK }, size = [GI_BLOCK, GI_BLOCK];
      q.writeTexture({ texture: this.hf, origin: at }, data.h, { bytesPerRow: GI_BLOCK * 16 }, size);
      q.writeTexture({ texture: this.gcol, origin: at }, data.g, { bytesPerRow: GI_BLOCK * 4 }, size);
      q.writeTexture({ texture: this.bcol, origin: at }, data.b, { bytesPerRow: GI_BLOCK * 4 }, size);
      this.dirty.push([cx * GI_CHUNK - reach, cz * GI_CHUNK - reach, (cx + 1) * GI_CHUNK + reach, (cz + 1) * GI_CHUNK + reach]);
    }
    if (!mode) { this.dirty.length = 0; return; }
    // the grid: grown (never shrunk) to reach the widest view
    const want = Math.min(120, 2 * Math.ceil(f.radius) + 2);
    if (want > this.N) this._allocate(want);
    this.grid = [Math.floor(f.target[0]) - (this.N >> 1), Math.floor(f.target[1]) - (this.N >> 1)];
    const key = [mode, Math.round(f.rays), f.reach, f.leaves, Math.round(f.bounceRays)].join();
    if (key !== this.cfgKey) { this.cfgKey = key; this.gen++; }
    const L = GI_LAYERS.length, slices = Math.max(1, Math.ceil(this.N * this.N * L / Math.max(100, f.perFrame)));
    this.frame++;
    const d = new ArrayBuffer(PARAM_BYTES), I = new Int32Array(d), F = new Float32Array(d);
    I.set([this.grid[0], this.grid[1], this.N, L], 0);
    I.set([this.hfOrigin[0], this.hfOrigin[1], HF, 0], 4);
    F.set([Math.max(1, Math.round(f.rays)), Math.max(1, f.reach), Math.min(Math.max(f.leaves, 0), 1), f.bounce], 8);
    F.set([mode, this.gen, this.frame % slices, slices], 12);
    F.set([Math.max(1, Math.round(f.bounceRays)), 0, 0, 0], 16);
    const v = f.view;
    F.set([v.x, v.z, v.fx, v.fz], 20);
    let dirty = this.dirty.splice(0);
    if (dirty.length > MAX_DIRTY) {
      const rest = dirty.slice(MAX_DIRTY - 1);
      dirty = dirty.slice(0, MAX_DIRTY - 1);
      dirty.push([Math.min(...rest.map(r => r[0])), Math.min(...rest.map(r => r[1])), Math.max(...rest.map(r => r[2])), Math.max(...rest.map(r => r[3]))]);
    }
    F.set([v.hw, v.hd, f.top, dirty.length], 24);
    F.set([...f.sun.dir, f.sun.shadow, ...f.sun.color, Math.min(f.points.length, MAX_GI_POINTS)], 28);
    F.set([...f.sky, 0, ...f.ground, 0], 36);
    dirty.forEach((r, i) => F.set(r, 44 + i * 4));
    f.points.slice(0, MAX_GI_POINTS).forEach((p, i) => F.set([...p.pos, p.distance, ...p.color, p.decay], 44 + MAX_DIRTY * 4 + i * 8));
    q.writeBuffer(this.params, 0, d);
    const enc = this.device.createCommandEncoder({ label: 'gi probes' });
    const pass = enc.beginComputePass({ label: 'gi probes' });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.groups[this.cur]);
    pass.dispatchWorkgroups(Math.ceil(this.N / 4), Math.ceil(L / 4), Math.ceil(this.N / 4));
    pass.end();
    q.submit([enc.finish()]);
    this.cur = 1 - this.cur;
  }
}

// ---- a chunk's block of the height field, worked out from its meshes ----

const SOLID_ABOVE = 0.3;   // a triangle starting no higher than this over the ground stands on it

// The ground: each texel at the highest of the ground triangles over its middle (or of the corners in it).
// parts: [{ geo, color?: [r, g, b] (else the vertex colours), emit?: 0-1 (a quarter of the light it gives off) }]
export function rasterGround(cx, cz, parts) {
  const B = GI_BLOCK, x0 = cx * GI_CHUNK, z0 = cz * GI_CHUNK, h = new Float32Array(B * B).fill(-1e4), c = new Uint8Array(B * B * 4);
  const put = (i, y, r, g, b, e) => { if (y > h[i]) { h[i] = y; c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b; c[i * 4 + 3] = e; } };
  for (const part of parts) eachTri(part, (ax, ay, az, bx, by, bz, qx, qy, qz, r, g, b) => {
    const e = Math.round((part.emit || 0) * 255);
    // corners first, so thin triangles still count
    for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [qx, qy, qz]]) {
      const i = Math.floor((x - x0) * GI_TPT), j = Math.floor((z - z0) * GI_TPT);
      if (i >= 0 && j >= 0 && i < B && j < B) put(j * B + i, y, r, g, b, e);
    }
    const den = (bz - qz) * (ax - qx) + (qx - bx) * (az - qz);
    if (Math.abs(den) < 1e-9) return;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, qx) - x0) * GI_TPT)), i1 = Math.min(B - 1, Math.floor((Math.max(ax, bx, qx) - x0) * GI_TPT));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, qz) - z0) * GI_TPT)), j1 = Math.min(B - 1, Math.floor((Math.max(az, bz, qz) - z0) * GI_TPT));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + (i + 0.5) / GI_TPT, z = z0 + (j + 0.5) / GI_TPT;
      const u = ((bz - qz) * (x - qx) + (qx - bx) * (z - qz)) / den, v = ((qz - az) * (x - qx) + (ax - qx) * (z - qz)) / den, w = 1 - u - v;
      if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
      put(j * B + i, u * ay + v * by + w * qy, r, g, b, e);
    }
  });
  return { h, c };
}

// The things on it: each thing (a run of triangles joined at their corners, as a box, a crown or a roof is
// written) covers the texels under its triangles' bounding boxes. One whose bottom is near the ground under it
// stands on it and raises the ground to its top; one higher up joins the floating layer (letting light through
// if its part `leaks`). parts: [{ geo, leaks?: bool, emit?: 0-1, color?: [r, g, b] }]. Returns the block, ready
// for HeightProbes.
export function rasterChunk(cx, cz, ground, parts, version) {
  const B = GI_BLOCK, x0 = cx * GI_CHUNK, z0 = cz * GI_CHUNK, n = B * B;
  const top = Float32Array.from(ground.h), g = Uint8Array.from(ground.c);
  const lo = new Float32Array(n).fill(1e9), hi = new Float32Array(n).fill(-1e9), leak = new Uint8Array(n).fill(1), bc = new Uint8Array(n * 4);
  const groundAt = (x, z) => {
    const i = Math.min(B - 1, Math.max(0, Math.floor((x - x0) * GI_TPT))), j = Math.min(B - 1, Math.max(0, Math.floor((z - z0) * GI_TPT)));
    return Math.max(ground.h[j * B + i], -100);
  };
  for (const part of parts) {
    const e = Math.round((part.emit || 0) * 255);
    let tris = [], corners = new Set(), lowY = 1e9, lowX = 0, lowZ = 0;
    const flush = () => {
      if (!tris.length) return;
      const stands = lowY <= groundAt(lowX, lowZ) + SOLID_ABOVE;
      for (const t of tris) {
        const [ax, ay, az, bx, by, bz, qx, qy, qz, r, gg, b] = t;
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx, qx) - x0) * GI_TPT)), i1 = Math.min(B - 1, Math.floor((Math.max(ax, bx, qx) - x0) * GI_TPT));
        const j0 = Math.max(0, Math.floor((Math.min(az, bz, qz) - z0) * GI_TPT)), j1 = Math.min(B - 1, Math.floor((Math.max(az, bz, qz) - z0) * GI_TPT));
        const y0 = Math.min(ay, by, qy), y1 = Math.max(ay, by, qy);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = j * B + i;
          if (stands) {
            if (y1 > top[k]) { top[k] = y1; g[k * 4] = r; g[k * 4 + 1] = gg; g[k * 4 + 2] = b; g[k * 4 + 3] = e; }
          } else {
            if (y1 >= hi[k]) { bc[k * 4] = r; bc[k * 4 + 1] = gg; bc[k * 4 + 2] = b; bc[k * 4 + 3] = e; }
            lo[k] = Math.min(lo[k], y0); hi[k] = Math.max(hi[k], y1);
            if (!part.leaks) leak[k] = 0;
          }
        }
      }
      tris = []; corners = new Set(); lowY = 1e9;
    };
    const keyOf = (x, y, z) => (Math.round(x * 256) * 32768 + Math.round((y + 60) * 256)) * 524288 + Math.round(z * 256);
    eachTri(part, (...t) => {
      const ka = keyOf(t[0], t[1], t[2]), kb = keyOf(t[3], t[4], t[5]), kq = keyOf(t[6], t[7], t[8]);
      if (tris.length && !corners.has(ka) && !corners.has(kb) && !corners.has(kq)) flush();
      corners.add(ka); corners.add(kb); corners.add(kq);
      tris.push(t);
      for (let v = 0; v < 9; v += 3) if (t[v + 1] < lowY) { lowY = t[v + 1]; lowX = t[v]; lowZ = t[v + 2]; }
    });
    flush();
  }
  const h = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) {
    const band = hi[k] > lo[k] && hi[k] > top[k];
    h[k * 4] = top[k];
    h[k * 4 + 1] = band ? Math.max(lo[k], top[k]) : 1;
    h[k * 4 + 2] = band ? hi[k] : 0;
    h[k * 4 + 3] = band ? (leak[k] ? 1 : 0) : 1;
  }
  return { h, g, b: bc, version };
}

// every triangle of a part's geometry, with its colour as bytes
function eachTri(part, fn) {
  const geo = part.geo;
  if (!geo || !geo.attributes.position) return;
  const p = geo.attributes.position.array, col = geo.attributes.color ? geo.attributes.color.array : null, idx = geo.index ? geo.index.array : null;
  const count = idx ? idx.length : geo.attributes.position.count, fixed = part.color && part.color.map(v => Math.round(v * 255));
  for (let t = 0; t + 2 < count; t += 3) {
    const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, q = idx ? idx[t + 2] : t + 2;
    let r, g, bl;
    if (fixed) [r, g, bl] = fixed;
    else if (col) {
      r = Math.round((col[a * 3] + col[b * 3] + col[q * 3]) / 3 * 255);
      g = Math.round((col[a * 3 + 1] + col[b * 3 + 1] + col[q * 3 + 1]) / 3 * 255);
      bl = Math.round((col[a * 3 + 2] + col[b * 3 + 2] + col[q * 3 + 2]) / 3 * 255);
    } else r = g = bl = 128;
    fn(p[a * 3], p[a * 3 + 1], p[a * 3 + 2], p[b * 3], p[b * 3 + 1], p[b * 3 + 2], p[q * 3], p[q * 3 + 1], p[q * 3 + 2], Math.min(255, r), Math.min(255, g), Math.min(255, bl));
  }
}
