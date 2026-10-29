// Ripples: a small sheet of water simulated round the hero, so wading through still water sends real waves out
// from them, which run on, spread, bounce off the banks and die away.
//
// A height field on a grid of CPT cells a tile that follows the hero, stepped RATE times a second by the damped
// wave equation (leapfrog: each cell keeps its height now and a step ago). Cells that aren't water (the game says
// which tiles are, site()) are banks: the waves reflect off them. Near the grid's edge the waves are damped away.
// The hero stirs it two ways: their body pushes the water aside as it moves (the height under it moves with it,
// so walking pushes up a bow wave and leaves a trough), and their legs work it up and down, sending rings out.
//
// `texture` holds the heights a step ago and now (r, g); a shader reads it at `view` (the grid's corner in tiles,
// its width in tiles, and how far the time is between those two steps) and mixes the two, so the waves move
// smoothly between steps.
import { Texture } from './materials.js';

const CPT = 16;           // cells a tile
const N = 160;            // cells across (10 tiles)
const RATE = 60;          // steps a second
const MAX_STEPS = 3;      // steps in one frame, at most (a slow frame drops the rest)
const SITE = Math.ceil(N / CPT) + 2;   // tiles across the site map
const EDGE = 12;          // cells over which the grid's edge damps the waves away

const WGSL = /* wgsl */ `
struct P {
  o: vec4f,    // shift of the grid since its last step (cells, x z), wave speed² (cells a step), damping a step
  s0: vec4f,   // the body: where it was a step ago, where it is now (cells, x z, x z)
  s1: vec4f,   // how much water it moved a step ago, now; the legs' stirring now; its radius (cells)
  g: vec4f,    // the grid's corner (cells), the site map's corner (tiles)
}
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> src: array<vec2f>;          // height now, a step ago
@group(0) @binding(2) var<storage, read_write> dst: array<vec2f>;
@group(0) @binding(3) var<storage, read> site: array<u32>;           // 1 for a water tile
@group(0) @binding(4) var outTex: texture_storage_2d<rgba16float, write>;
const NC = ${N};
fn wet(c: vec2i) -> bool {
  let t = vec2i(floor((p.g.xy + vec2f(c) + 0.5) / ${CPT}.0)) - vec2i(p.g.zw);
  if (any(t < vec2i(0)) || any(t >= vec2i(${SITE}))) { return false; }
  return site[t.y * ${SITE} + t.x] != 0u;
}
// last step's state at a cell of this step's grid (0 off it)
fn state(c: vec2i) -> vec2f {
  let q = c + vec2i(p.o.xy);
  if (any(q < vec2i(0)) || any(q >= vec2i(NC))) { return vec2f(0.0); }
  return src[q.y * NC + q.x];
}
// a neighbour's height: a bank gives back the cell's own (the wave reflects), off the grid is still water
fn nb(c: vec2i, h: f32) -> f32 {
  if (any(c < vec2i(0)) || any(c >= vec2i(NC))) { return 0.0; }
  if (!wet(c)) { return h; }
  return state(c).x;
}
fn body(c: vec2f, at: vec2f) -> f32 { let d = c - at; return exp(-dot(d, d) / (p.s1.w * p.s1.w)); }
@compute @workgroup_size(8, 8) fn step(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(NC) || id.y >= u32(NC)) { return; }
  let c = vec2i(id.xy);
  var now = vec2f(0.0);
  if (wet(c)) {
    let s = state(c);
    let h = s.x;
    let lap = nb(c + vec2i(1, 0), h) + nb(c - vec2i(1, 0), h) + nb(c + vec2i(0, 1), h) + nb(c - vec2i(0, 1), h) - 4.0 * h;
    let e = f32(min(min(c.x, c.y), min(NC - 1 - c.x, NC - 1 - c.y)));
    let damp = p.o.w * mix(0.85, 1.0, smoothstep(0.0, ${EDGE}.0, e));
    let cf = vec2f(c);
    // the water the body moved: what's under it now in, what was under it a step ago out
    let moved = p.s1.y * body(cf, p.s0.zw) - p.s1.x * body(cf, p.s0.xy);
    let next = h + (h - s.y) * damp + p.o.z * lap + moved + p.s1.z * body(cf, p.s0.zw);
    now = vec2f(next, h + moved);
  }
  dst[id.y * u32(NC) + id.x] = now;
  textureStore(outTex, c, vec4f(state(c).x * f32(wet(c)), now.x, 0.0, 1.0));
}`;

export class Ripples {
  constructor(renderer) {
    this.renderer = renderer;
    const device = this.device = renderer.device, B = GPUBufferUsage;
    const bytes = N * N * 8;
    this.bufs = [0, 1].map(() => device.createBuffer({ size: bytes, usage: B.STORAGE | B.COPY_DST }));
    this.site = device.createBuffer({ size: SITE * SITE * 4, usage: B.STORAGE | B.COPY_DST });
    this.siteData = new Uint32Array(SITE * SITE);
    this.params = [...Array(MAX_STEPS)].map(() => device.createBuffer({ size: 64, usage: B.UNIFORM | B.COPY_DST }));
    this.pdata = new Float32Array(16);
    this.tex = device.createTexture({ size: [N, N], format: 'rgba16float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
    const module = device.createShaderModule({ code: WGSL, label: 'ripples' });
    if (module.getCompilationInfo) module.getCompilationInfo().then(info => {
      for (const e of info.messages) if (e.type === 'error') console.error(`ripples WGSL ${e.lineNum}:${e.linePos} ${e.message}\n` + WGSL.split('\n')[e.lineNum - 1]);
    });
    this.pipeline = device.createComputePipeline({ label: 'ripples', layout: 'auto', compute: { module, entryPoint: 'step' } });
    const view = this.tex.createView(), layout = this.pipeline.getBindGroupLayout(0);
    // [step k][which buffer holds the state]
    this.groups = this.params.map(pb => [0, 1].map(from => device.createBindGroup({ layout, entries: [
      { binding: 0, resource: { buffer: pb } }, { binding: 1, resource: { buffer: this.bufs[from] } },
      { binding: 2, resource: { buffer: this.bufs[1 - from] } }, { binding: 3, resource: { buffer: this.site } },
      { binding: 4, resource: view }] })));
    this.texture = new Texture();
    this.texture.isViewTexture = true; this.texture.view = this.tex.createView();
    this.view = [0, 0, N / CPT, 0];   // the grid's corner (tiles, x z), its width (tiles), time between its last two steps
    this.on = false;
    this.cur = 0; this.origin = null; this.acc = 0; this.last = null; this.moved = 0; this.phase = 0; this.wasOn = false;
  }
  // step it for this frame: on (any water round the hero), hero [x, z] (tiles), body (how much water the body
  // moves: 0 out of it), stir (the legs' stirring), speed (tiles a second the waves run), fade (how fast they
  // die, a second), site(tx, tz) (true for a water tile)
  update({ on, hero, dt, body, stir, speed, fade, site }) {
    this.on = on;
    if (!on) { this.wasOn = false; return; }
    const d = this.device, r = this.renderer;
    if (!this.wasOn) {   // starting again: from still water, here
      this.wasOn = true; this.acc = 0; this.origin = null; this.last = null;
      r.compute(enc => { for (const b of this.bufs) enc.clearBuffer(b); });
    }
    this.acc = Math.min(this.acc + dt * RATE, MAX_STEPS + 1);
    const steps = Math.min(MAX_STEPS, Math.floor(this.acc));
    this.acc -= steps;
    if (steps) {
      const hx = hero[0] * CPT, hz = hero[1] * CPT;
      const ox = Math.floor(hx) - N / 2, oz = Math.floor(hz) - N / 2;
      const prev = this.origin || [ox, oz];
      const tx = Math.floor(ox / CPT), tz = Math.floor(oz / CPT);
      for (let j = 0; j < SITE; j++) for (let i = 0; i < SITE; i++) this.siteData[j * SITE + i] = site(tx + i, tz + j) ? 1 : 0;
      d.queue.writeBuffer(this.site, 0, this.siteData);
      const from = this.last && Math.hypot(hx - this.last[0], hz - this.last[1]) < CPT ? this.last : [hx, hz];
      const c2 = Math.min(0.45, (speed * CPT / RATE) ** 2), damp = Math.exp(-fade / RATE), rad = 0.16 * CPT;
      const p = this.pdata;
      for (let k = 0; k < steps; k++) {
        const u = (k + 1) / steps, a = [from[0] + (hx - from[0]) * u, from[1] + (hz - from[1]) * u];
        const b = k ? [from[0] + (hx - from[0]) * k / steps, from[1] + (hz - from[1]) * k / steps] : from;
        const sh = k ? [0, 0] : [ox - prev[0], oz - prev[1]];
        this.phase = (this.phase + 2 * Math.PI * 3 / RATE) % (2 * Math.PI);
        p.set([sh[0], sh[1], c2, damp,
          b[0] - ox - 0.5, b[1] - oz - 0.5, a[0] - ox - 0.5, a[1] - oz - 0.5,
          this.moved, body, stir * body * Math.sin(this.phase), rad,
          ox, oz, tx, tz]);
        d.queue.writeBuffer(this.params[k], 0, p);
        this.moved = body;
      }
      r.compute(enc => {
        const pass = enc.beginComputePass({ label: 'swamp wake' });
        pass.setPipeline(this.pipeline);
        for (let k = 0; k < steps; k++) {
          pass.setBindGroup(0, this.groups[k][this.cur]);
          pass.dispatchWorkgroups(Math.ceil(N / 8), Math.ceil(N / 8));
          this.cur = 1 - this.cur;
        }
        pass.end();
      });
      this.origin = [ox, oz]; this.last = [hx, hz];
    }
    // (nothing to draw until its first step)
    const o = this.origin;
    if (!o) { this.on = false; return; }
    this.view[0] = o[0] / CPT; this.view[1] = o[1] / CPT; this.view[3] = this.acc;
  }
}
