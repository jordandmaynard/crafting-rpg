// Drift: a map round the hero of where the deep snow and sand have been pushed aside, so whatever walks through
// leaves a trench behind it, with what it pushed out heaped into a rim along either side, that slowly fills back in.
//
// A grid of CPT cells a tile that follows the hero, as the trample map does (src/gfx/trample.js). Each cell holds
// how far the snow or sand there is pressed down (0 untouched, 1 down to the ground) and how high it's heaped
// (0-1 of a rim's full height). Every frame both ease back toward 0 (all the way in `recover` seconds), and each
// body walking through presses a round hollow (full under its middle, gone at its edge) and heaps a ring round it.
//
// `texture` holds them (r pressed, g heaped); a shader reads it at `view` (the grid's corner in tiles, its width).
import { Texture } from './materials.js';

const CPT = 6;            // cells a tile
const N = 288;            // cells across (48 tiles)
const MAX_BODIES = 32;

const WGSL = /* wgsl */ `
struct P {
  o: vec4f,    // shift of the grid since last frame (cells, x z), how much eases back this frame, _
  n: vec4f,    // how many bodies
  b: array<vec4f, ${MAX_BODIES}>,   // each body: where it is (cells, x z), its radius (cells), how hard it presses (0-1)
}
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> src: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec2f>;
@group(0) @binding(3) var outTex: texture_storage_2d<rgba16float, write>;
const NC = ${N};
@compute @workgroup_size(8, 8) fn step(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(NC) || id.y >= u32(NC)) { return; }
  let c = vec2i(id.xy);
  let q = c + vec2i(p.o.xy);
  var s = vec2f(0.0);
  if (all(q >= vec2i(0)) && all(q < vec2i(NC))) { s = max(src[q.y * NC + q.x] - vec2f(p.o.z), vec2f(0.0)); }
  let cf = vec2f(c) + 0.5;
  for (var k = 0; k < i32(p.n.x); k++) {
    let a = p.b[k];
    let l = length(cf - a.xy);
    if (l >= a.z * 1.9) { continue; }
    // the hollow under it, and the heap pushed out round it
    s.x = max(s.x, smoothstep(a.z, a.z * 0.45, l) * a.w);
    s.y = max(s.y, smoothstep(a.z * 0.6, a.z * 1.05, l) * (1.0 - smoothstep(a.z * 1.05, a.z * 1.9, l)) * a.w);
  }
  dst[id.y * u32(NC) + id.x] = s;
  textureStore(outTex, c, vec4f(s, 0.0, 1.0));
}`;

export class Drift {
  constructor(renderer) {
    this.renderer = renderer;
    const device = this.device = renderer.device, B = GPUBufferUsage;
    this.bufs = [0, 1].map(() => device.createBuffer({ size: N * N * 8, usage: B.STORAGE | B.COPY_DST }));
    this.params = device.createBuffer({ size: (2 + MAX_BODIES) * 16, usage: B.UNIFORM | B.COPY_DST });
    this.pdata = new Float32Array((2 + MAX_BODIES) * 4);
    this.tex = device.createTexture({ size: [N, N], format: 'rgba16float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
    const module = device.createShaderModule({ code: WGSL, label: 'drift' });
    if (module.getCompilationInfo) module.getCompilationInfo().then(info => {
      for (const e of info.messages) if (e.type === 'error') console.error(`drift WGSL ${e.lineNum}:${e.linePos} ${e.message}\n` + WGSL.split('\n')[e.lineNum - 1]);
    });
    this.pipeline = device.createComputePipeline({ label: 'drift', layout: 'auto', compute: { module, entryPoint: 'step' } });
    const view = this.tex.createView(), layout = this.pipeline.getBindGroupLayout(0);
    this.groups = [0, 1].map(from => device.createBindGroup({ layout, entries: [
      { binding: 0, resource: { buffer: this.params } }, { binding: 1, resource: { buffer: this.bufs[from] } },
      { binding: 2, resource: { buffer: this.bufs[1 - from] } }, { binding: 3, resource: view }] }));
    this.texture = new Texture();
    this.texture.isViewTexture = true; this.texture.view = this.tex.createView();
    this.view = [0, 0, N / CPT, 0];   // the grid's corner (tiles, x z), its width (tiles)
    this.on = false;
    this.cur = 0; this.origin = null;
  }
  // step it for this frame: hero [x, z] (tiles: the grid follows them), dt, bodies ({ x, z, radius (tiles),
  // strength (0-1) }, the most important first), recover (seconds a trench takes to fill back in)
  update({ hero, dt, bodies, recover }) {
    const ox = Math.floor(hero[0] * CPT) - N / 2, oz = Math.floor(hero[1] * CPT) - N / 2;
    const prev = this.origin || [ox, oz];
    const p = this.pdata;
    p.fill(0);
    const sx = ox - prev[0], sz = oz - prev[1], far = Math.abs(sx) >= N || Math.abs(sz) >= N;
    p.set([far ? N : sx, far ? N : sz, dt / Math.max(recover, 0.5), 0]);
    let n = 0;
    for (const b of bodies) {
      if (n >= MAX_BODIES) break;
      const x = b.x * CPT - ox, z = b.z * CPT - oz, r = b.radius * CPT;
      if (x < -2 * r || z < -2 * r || x > N + 2 * r || z > N + 2 * r) continue;
      p.set([x, z, r, b.strength], 8 + n * 4);
      n++;
    }
    p[4] = n;
    this.device.queue.writeBuffer(this.params, 0, p);
    this.renderer.compute(enc => {
      const pass = enc.beginComputePass({ label: 'drift' });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.groups[this.cur]);
      pass.dispatchWorkgroups(Math.ceil(N / 8), Math.ceil(N / 8));
      pass.end();
    });
    this.cur = 1 - this.cur;
    this.origin = [ox, oz];
    this.view[0] = ox / CPT; this.view[1] = oz / CPT;
    this.on = true;
  }
}
