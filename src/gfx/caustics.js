// Water caustics by area-ratio splatting (after Evan Wallace, as in Ultra-Water): a grid over one tile of
// the wave pattern has the sun refracted through the waves' slopes at each of its points, and lands on a bed
// `depth` under the surface. Each landed triangle adds the ratio of the area it had to the area it covers, so
// light the waves gather into a smaller patch shines brighter and the pattern averages 1: it only moves the
// sun's light about. The tile repeats, so the grid is drawn three by three times over, shifted a tile each way,
// for what lands across an edge.
import { Texture, RepeatWrapping, LinearFilter } from './materials.js';

const SIZE = 512;        // texels a side of the repeating tile
const CELLS = 192;       // grid cells a side

const WGSL = /* wgsl */ `
struct P {
  sun: vec4f,        // toward the sun (xyz)
  drift: vec4f,      // the two wave layers' offsets (in wave-texture uvs)
  look: vec4f,       // slope strength, depth (tiles of the pattern), _, _
}
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var tWave: texture_2d<f32>;
@group(0) @binding(2) var tWaveS: sampler;
struct VOut { @builtin(position) pos: vec4f, @location(0) old: vec2f, @location(1) now: vec2f }
// the wave texture's slope, smoothly: a cubic B-spline over its texels in four bilinear taps. (Read plainly, the
// slope bends only at texel edges, and the light it focuses comes out in texel-sized blocks.)
fn smoothSlope(uv: vec2f) -> vec2f {
  let size = vec2f(textureDimensions(tWave));
  let st = uv * size - 0.5;
  let i = floor(st); let f = st - i;
  let f2 = f * f; let f3 = f2 * f;
  let w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  let w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  let w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  let w3 = f3 / 6.0;
  let s0 = w0 + w1; let s1 = w2 + w3;
  let o0 = (i - 0.5 + w1 / s0) / size; let o1 = (i + 1.5 + w3 / s1) / size;
  let t = (textureSampleLevel(tWave, tWaveS, vec2f(o0.x, o0.y), 0.0).rg * s0.x + textureSampleLevel(tWave, tWaveS, vec2f(o1.x, o0.y), 0.0).rg * s1.x) * s0.y
        + (textureSampleLevel(tWave, tWaveS, vec2f(o0.x, o1.y), 0.0).rg * s0.x + textureSampleLevel(tWave, tWaveS, vec2f(o1.x, o1.y), 0.0).rg * s1.x) * s1.y;
  return t * 2.0 - 1.0;
}
// the waves' slope at a point of the tile: the water's two layers of slope noise (here both lined up with the
// tile, so the pattern repeats with it)
fn slope(q: vec2f) -> vec2f {
  return smoothSlope(q + p.drift.xy) * 0.6 + smoothSlope(q * 2.0 - p.drift.zw) * 0.4;
}
// where light through the surface at q lands on the bed, against where it lands through still water
fn land(q: vec2f) -> vec2f {
  let s = slope(q) * p.look.x;
  let n = normalize(vec3f(-s.x, 1.0, -s.y));
  let L = -normalize(p.sun.xyz);
  let r = refract(L, n, 1.0 / 1.333);
  let r0 = refract(L, vec3f(0.0, 1.0, 0.0), 1.0 / 1.333);
  return q + (r.xz / max(-r.y, 0.05) - r0.xz / max(-r0.y, 0.05)) * p.look.y;
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  let N = ${CELLS}u;
  let cell = vi / 6u; let corner = vi % 6u;
  let cx = cell % N; let cy = cell / N;
  var ox = array<u32, 6>(0u, 1u, 0u, 1u, 1u, 0u);
  var oy = array<u32, 6>(0u, 0u, 1u, 0u, 1u, 1u);
  let q = vec2f(f32(cx + ox[corner]), f32(cy + oy[corner])) / f32(N);
  let shift = vec2f(f32(ii % 3u) - 1.0, f32(ii / 3u) - 1.0);
  let at = land(q) + shift;
  var o: VOut;
  o.pos = vec4f(at.x * 2.0 - 1.0, 1.0 - at.y * 2.0, 0.0, 1.0);
  o.old = q; o.now = at;
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let before = length(dpdx(i.old)) * length(dpdy(i.old));
  let after = length(dpdx(i.now)) * length(dpdy(i.now));
  return vec4f(min(before / max(after, 1e-9), 16.0), 0.0, 0.0, 1.0);
}`;

export class Caustics {
  constructor(renderer, waveTex) {
    this.renderer = renderer;
    const device = this.device = renderer.device, T = GPUTextureUsage;
    this.tex = device.createTexture({ size: [SIZE, SIZE], format: 'r16float', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
    this.target = this.tex.createView();
    this.params = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.data = new Float32Array(12);
    const module = device.createShaderModule({ code: WGSL, label: 'caustics' });
    if (module.getCompilationInfo) module.getCompilationInfo().then(info => {
      for (const e of info.messages) if (e.type === 'error') console.error(`caustics WGSL ${e.lineNum}:${e.linePos} ${e.message}\n` + WGSL.split('\n')[e.lineNum - 1]);
    });
    const add = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
    this.pipeline = device.createRenderPipeline({
      label: 'caustics', layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: 'r16float', blend: { color: add, alpha: add } }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
    this.waveTex = waveTex;
    this.bindGroup = null; this.bindId = null;
    // what the water samples: repeating, smooth
    this.texture = new Texture();
    this.texture.isViewTexture = true; this.texture.view = this.tex.createView();
    this.texture.wrapS = this.texture.wrapT = RepeatWrapping; this.texture.magFilter = this.texture.minFilter = LinearFilter;
    this.on = false;
  }
  // splat this frame's caustics: sun (toward it), the two layers' drift, slope strength, bed depth (in tiles of
  // the pattern)
  update({ on, sun, drift, strength, depth }) {
    this.on = on;
    if (!on) return;
    const r = this.renderer, w = r._texture(this.waveTex);
    if (!this.bindGroup || this.bindId !== w.id) {
      this.bindGroup = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: this.params } }, { binding: 1, resource: w.view }, { binding: 2, resource: w.sampler }] });
      this.bindId = w.id;
    }
    const d = this.data;
    d.set([sun[0], sun[1], sun[2], 0, drift[0], drift[1], drift[2], drift[3], strength, depth, 0, 0]);
    this.device.queue.writeBuffer(this.params, 0, d);
    r.compute(enc => {
      const pass = enc.beginRenderPass({ label: 'caustics', colorAttachments: [{ view: this.target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.draw(CELLS * CELLS * 6, 9);
      pass.end();
    });
  }
}
