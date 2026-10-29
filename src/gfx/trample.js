// Trample: a map round the hero of how far the plants there are pushed over, and which way, so grass, flowers,
// reeds, ferns and bushes bend away from whatever walks through them and lift back up behind it.
//
// A grid of CPT cells a tile that follows the hero. Each cell holds a push (x z, length 0-1): the way the plants
// there lean and how far. Every frame each cell's push eases back toward upright (taking `recover` seconds to
// all but straighten), and whatever is walking through presses it out of the way: away from its middle, and
// along the way it's going. A spinning body (the whirlwind) sweeps the plants round it instead.
//
// `texture` holds the push (r, g); a shader reads it at `view` (the grid's corner in tiles, its width in tiles).
import { Texture } from './materials.js';

const CPT = 4;            // cells a tile
const N = 160;            // cells across (40 tiles)
const MAX_BODIES = 16;    // things pushing through at once

const WGSL = /* wgsl */ `
struct P {
  o: vec4f,    // shift of the grid since last frame (cells, x z), how much of the push is kept this frame, _
  n: vec4f,    // how many bodies
  // each body's two: where it is (cells, x z), its radius (cells), how hard it pushes (0-1); the way it's going
  // (x z, unit or 0), how much it spins the plants round it (0-1), _
  b: array<vec4f, ${MAX_BODIES * 2}>,
}
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> src: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec2f>;
@group(0) @binding(3) var outTex: texture_storage_2d<rgba16float, write>;
const NC = ${N};
@compute @workgroup_size(8, 8) fn step(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(NC) || id.y >= u32(NC)) { return; }
  let c = vec2i(id.xy);
  // last frame's push here (none off the old grid), easing back upright
  let q = c + vec2i(p.o.xy);
  var push = vec2f(0.0);
  if (all(q >= vec2i(0)) && all(q < vec2i(NC))) { push = src[q.y * NC + q.x] * p.o.z; }
  let cf = vec2f(c) + 0.5;
  for (var k = 0; k < i32(p.n.x); k++) {
    let a = p.b[k * 2]; let m = p.b[k * 2 + 1];
    let d = cf - a.xy;
    let l = length(d);
    if (l >= a.z) { continue; }
    // full under its middle, nothing at its edge
    let w = smoothstep(a.z, a.z * 0.35, l) * a.w;
    let out = select(vec2f(0.0), d / l, l > 1e-3);
    // away from it, and on the way it's going, or round it if it spins
    var dir = out + m.xy * 0.8;
    dir = mix(dir, vec2f(-out.y, out.x) + out * 0.3, m.z);
    let dl = length(dir);
    if (dl < 1e-4) { continue; }
    let want = dir / dl * w;
    // the harder push wins; a weaker one only turns it a little
    if (w > length(push)) { push = want; } else { push = mix(push, want, w * 0.25); }
  }
  dst[id.y * u32(NC) + id.x] = push;
  textureStore(outTex, c, vec4f(push, 0.0, 1.0));
}`;

export class Trample {
  constructor(renderer) {
    this.renderer = renderer;
    const device = this.device = renderer.device, B = GPUBufferUsage;
    this.bufs = [0, 1].map(() => device.createBuffer({ size: N * N * 8, usage: B.STORAGE | B.COPY_DST }));
    this.params = device.createBuffer({ size: (2 + MAX_BODIES * 2) * 16, usage: B.UNIFORM | B.COPY_DST });
    this.pdata = new Float32Array((2 + MAX_BODIES * 2) * 4);
    this.tex = device.createTexture({ size: [N, N], format: 'rgba16float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
    const module = device.createShaderModule({ code: WGSL, label: 'trample' });
    if (module.getCompilationInfo) module.getCompilationInfo().then(info => {
      for (const e of info.messages) if (e.type === 'error') console.error(`trample WGSL ${e.lineNum}:${e.linePos} ${e.message}\n` + WGSL.split('\n')[e.lineNum - 1]);
    });
    this.pipeline = device.createComputePipeline({ label: 'trample', layout: 'auto', compute: { module, entryPoint: 'step' } });
    const view = this.tex.createView(), layout = this.pipeline.getBindGroupLayout(0);
    this.groups = [0, 1].map(from => device.createBindGroup({ layout, entries: [
      { binding: 0, resource: { buffer: this.params } }, { binding: 1, resource: { buffer: this.bufs[from] } },
      { binding: 2, resource: { buffer: this.bufs[1 - from] } }, { binding: 3, resource: view }] }));
    this.texture = new Texture();
    this.texture.isViewTexture = true; this.texture.view = this.tex.createView();
    this.view = [0, 0, N / CPT, 0];   // the grid's corner (tiles, x z), its width (tiles)
    this.on = false;
    this.cur = 0; this.origin = null;   // (new buffers start zeroed: upright)
  }
  // step it for this frame: hero [x, z] (tiles: the grid follows them), dt, bodies ({ x, z, radius (tiles),
  // strength (0-1), dir: [x, z] (the way it's going, unit or 0), spin (0-1) }, the most important first),
  // recover (seconds the plants take to all but straighten)
  update({ hero, dt, bodies, recover }) {
    const ox = Math.floor(hero[0] * CPT) - N / 2, oz = Math.floor(hero[1] * CPT) - N / 2;
    const prev = this.origin || [ox, oz];
    const p = this.pdata;
    p.fill(0);
    // (a jump far across, a teleport, starts it afresh)
    const sx = ox - prev[0], sz = oz - prev[1], far = Math.abs(sx) >= N || Math.abs(sz) >= N;
    p.set([far ? N : sx, far ? N : sz, Math.exp(-dt * 4 / Math.max(recover, 0.05)), 0]);
    let n = 0;
    for (const b of bodies) {
      if (n >= MAX_BODIES) break;
      const x = b.x * CPT - ox, z = b.z * CPT - oz, r = b.radius * CPT;
      if (x < -r || z < -r || x > N + r || z > N + r) continue;
      p.set([x, z, r, b.strength, b.dir ? b.dir[0] : 0, b.dir ? b.dir[1] : 0, b.spin || 0, 0], 8 + n * 8);
      n++;
    }
    p[4] = n;
    this.device.queue.writeBuffer(this.params, 0, p);
    this.renderer.compute(enc => {
      const pass = enc.beginComputePass({ label: 'trample' });
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
