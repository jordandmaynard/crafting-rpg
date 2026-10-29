// Ripples: a small sheet of water simulated round the hero, so wading through still water sends real waves out
// from them, which run on, spread, bounce off the banks and die away.
//
// A height field on a grid of CPT cells a tile that follows the hero, stepped RATE times a second by the damped
// wave equation (leapfrog: each cell keeps its height now and a step ago). Cells that aren't water (the game says
// which tiles are, site()) are banks: the waves reflect off them. Near the grid's edge the waves are damped away.
// Whatever wades in it (the hero, and foes near them, up to MAX_BODIES) stirs it two ways: its body pushes the
// water aside as it moves (the height under it moves with it, so walking pushes up a bow wave and leaves a
// trough), and its legs work it up and down as it walks, sending rings out. Standing still, it settles.
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
const MAX_BODIES = 8;     // waders stirring it at once
const STIR_HZ = 3;        // how fast their legs work the water
const WALK = 1.5;         // tiles a second at which they work it fully (standing still, not at all)

const WGSL = /* wgsl */ `
struct P {
  o: vec4f,    // shift of the grid since its last step (cells, x z), wave speed² (cells a step), damping a step
  g: vec4f,    // the grid's corner (cells), the site map's corner (tiles)
  n: vec4f,    // how many bodies
  // each body's two: where it was a step ago, where it is now (cells, x z, x z); how much water it moved a
  // step ago, now, its legs' stirring now, its radius (cells)
  b: array<vec4f, ${MAX_BODIES * 2}>,
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
fn body(c: vec2f, at: vec2f, r: f32) -> f32 { let d = c - at; return exp(-dot(d, d) / (r * r)); }
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
    // the water the bodies moved (what's under each now in, what was under it a step ago out), and their stirring
    var moved = 0.0; var stir = 0.0;
    for (var k = 0; k < i32(p.n.x); k++) {
      let at = p.b[k * 2]; let m = p.b[k * 2 + 1];
      let now = body(cf, at.zw, m.w);
      moved += m.y * now - m.x * body(cf, at.xy, m.w);
      stir += m.z * now;
    }
    let next = h + (h - s.y) * damp + p.o.z * lap + moved + stir;
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
    this.params = [...Array(MAX_STEPS)].map(() => device.createBuffer({ size: (3 + MAX_BODIES * 2) * 16, usage: B.UNIFORM | B.COPY_DST }));
    this.pdata = new Float32Array((3 + MAX_BODIES * 2) * 4);
    this.bodies = new Map();   // key: { last (cells), moved, phase }
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
    this.cur = 0; this.origin = null; this.acc = 0; this.wasOn = false;
  }
  // step it for this frame: on (any water round the hero), hero [x, z] (tiles: the grid follows them), bodies
  // (what wades: { key, x, z (tiles), amount (how much water it moves: 0 out of the water), radius (tiles) }, the
  // most important first), stir (how hard legs work the water, against amount), speed (tiles a second the waves
  // run), fade (how fast they die, a second), site(tx, tz) (true for a water tile)
  update({ on, hero, dt, bodies, stir, speed, fade, site }) {
    this.on = on;
    if (!on) { this.wasOn = false; return; }
    const d = this.device, r = this.renderer;
    if (!this.wasOn) {   // starting again: from still water, here
      this.wasOn = true; this.acc = 0; this.origin = null; this.bodies.clear();
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
      // this frame's waders, and any that just left (they take their water with them, then they're gone)
      const list = [], seen = new Set();
      for (const b of bodies) {
        if (list.length >= MAX_BODIES) break;
        const x = b.x * CPT, z = b.z * CPT;
        if (Math.abs(x - hx) > N / 2 + CPT || Math.abs(z - hz) > N / 2 + CPT) continue;
        let st = this.bodies.get(b.key);
        if (!st) { st = { last: [x, z], moved: 0, phase: Math.random() * 6.3 }; this.bodies.set(b.key, st); }
        seen.add(b.key);
        list.push({ st, now: [x, z], amount: b.amount, rad: b.radius * CPT });
      }
      for (const [key, st] of this.bodies) {
        if (seen.has(key)) continue;
        if (!st.moved || list.length >= MAX_BODIES) { this.bodies.delete(key); continue; }
        list.push({ st, now: st.last, amount: 0, rad: st.rad });
      }
      // legs work the water only while they walk: full at WALK tiles a second, easing in and out
      for (const w of list) {
        const st = w.st, moved = Math.hypot(w.now[0] - st.last[0], w.now[1] - st.last[1]);
        if (moved > CPT) st.last = w.now;   // (it jumped: no wave)
        st.rad = w.rad;
        const go = moved > CPT ? 0 : Math.min(1, moved / CPT / (steps / RATE) / WALK);
        st.walk = (st.walk || 0) + (go - (st.walk || 0)) * Math.min(1, dt * 6);
      }
      const c2 = Math.min(0.45, (speed * CPT / RATE) ** 2), damp = Math.exp(-fade / RATE);
      const p = this.pdata;
      for (let k = 0; k < steps; k++) {
        const sh = k ? [0, 0] : [ox - prev[0], oz - prev[1]];
        p.fill(0);
        p.set([sh[0], sh[1], c2, damp, ox, oz, tx, tz, list.length, 0, 0, 0]);
        list.forEach((w, j) => {
          const st = w.st, f = st.last, u = (k + 1) / steps, v = k / steps, o = 12 + j * 8;
          st.phase = (st.phase + 2 * Math.PI * STIR_HZ / RATE) % (2 * Math.PI);
          p.set([f[0] + (w.now[0] - f[0]) * v - ox - 0.5, f[1] + (w.now[1] - f[1]) * v - oz - 0.5,
            f[0] + (w.now[0] - f[0]) * u - ox - 0.5, f[1] + (w.now[1] - f[1]) * u - oz - 0.5,
            k ? w.amount : st.moved, w.amount, stir * w.amount * st.walk * Math.sin(st.phase), w.rad], o);
        });
        d.queue.writeBuffer(this.params[k], 0, p);
      }
      for (const w of list) { w.st.last = w.now; w.st.moved = w.amount; }
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
      this.origin = [ox, oz];
    }
    // (nothing to draw until its first step)
    const o = this.origin;
    if (!o) { this.on = false; return; }
    this.view[0] = o[0] / CPT; this.view[1] = o[1] / CPT; this.view[3] = this.acc;
  }
}
