// Eye adaptation: the exposure eases toward what suits how bright the picture is, as eyes adjust stepping from a
// dark wood out onto a sunlit plain.
//
// Each frame, after the scene and the lit haze are worked out and before the outline pass shows them, two compute
// passes run. The first reads every mosaic pixel as it will be shown (the scene, with the haze over it), and each
// workgroup adds up the log of its brightness, weighted toward the middle of the screen where the hero is. The
// second adds those up into the picture's average brightness (geometric mean), works out the exposure that brings
// it to `target` (kept between `darkest` and `brightest`), and moves the exposure it keeps toward that, in log
// steps, `toDark` a second when the picture got brighter and `toLight` when it got darker. The exposure stays on the
// GPU, where the outline pass reads it (shaders.js, postExpose): nothing waits on a read back. read() fetches it
// for showing, now and then.

const GROUP = 16, MAX_GROUPS = 4096;

const COMMON = /* wgsl */ `
struct EP {
  dims: vec4f,     // mosaic pixels across, down, scene samples a mosaic pixel (each way), workgroups
  aim: vec4f,      // target brightness, darkest and brightest exposure, middle weighting
  rate: vec4f,     // toDark, toLight (a second), seconds since last frame, 1 with the haze over the scene
}
@group(0) @binding(0) var<uniform> E: EP;
`;

const MEASURE_WGSL = /* wgsl */ `
${COMMON}
@group(0) @binding(1) var scene: texture_2d<f32>;
@group(0) @binding(2) var haze: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> partial: array<vec2f>;
var<workgroup> acc: array<vec2f, ${GROUP * GROUP}>;
@compute @workgroup_size(${GROUP}, ${GROUP}, 1)
fn measure(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) li: u32, @builtin(workgroup_id) wg: vec3u,
           @builtin(num_workgroups) nw: vec3u) {
  var v = vec2f(0.0);
  let res = vec2u(E.dims.xy);
  if (id.x < res.x && id.y < res.y) {
    let ss = i32(E.dims.z);
    let sz = vec2i(textureDimensions(scene));
    var c = textureLoad(scene, min(vec2i(id.xy) * ss + ss / 2, sz - 1), 0).rgb;
    if (E.rate.w > 0.5) { let h = textureLoad(haze, vec2i(id.xy), 0); c = c * h.a + h.rgb; }
    let lum = max(dot(c, vec3f(0.2126, 0.7152, 0.0722)), 1e-3);
    let d = (vec2f(id.xy) + 0.5) / E.dims.xy * 2.0 - 1.0;
    let w = mix(1.0, max(1.0 - 0.5 * dot(d, d), 0.0), E.aim.w);
    v = vec2f(log(lum) * w, w);
  }
  acc[li] = v;
  workgroupBarrier();
  for (var s = ${GROUP * GROUP / 2}u; s > 0u; s = s >> 1u) {
    if (li < s) { acc[li] += acc[li + s]; }
    workgroupBarrier();
  }
  if (li == 0u) { partial[wg.y * nw.x + wg.x] = acc[0]; }
}
`;

const ADAPT_WGSL = /* wgsl */ `
${COMMON}
@group(0) @binding(1) var<storage, read> partial: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> state: array<f32, 4>;   // exposure, brightness, 1 once set, aim
var<workgroup> acc: array<vec2f, 256>;
@compute @workgroup_size(256, 1, 1)
fn adapt(@builtin(local_invocation_index) li: u32) {
  let n = u32(E.dims.w);
  var v = vec2f(0.0);
  for (var i = li; i < n; i += 256u) { v += partial[i]; }
  acc[li] = v;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s = s >> 1u) {
    if (li < s) { acc[li] += acc[li + s]; }
    workgroupBarrier();
  }
  if (li != 0u) { return; }
  let bright = exp(acc[0].x / max(acc[0].y, 1e-6));
  let aim = clamp(E.aim.x / bright, E.aim.y, max(E.aim.y, E.aim.z));
  var e = log(aim);
  if (state[2] > 0.5) {
    let was = log(max(state[0], 1e-4));
    let rate = select(E.rate.y, E.rate.x, e < was);
    e = was + (e - was) * (1.0 - exp(-E.rate.z * rate));
  }
  state[0] = exp(e); state[1] = bright; state[2] = 1.0; state[3] = aim;
}
`;

export class EyeAdaptation {
  constructor(renderer) {
    this.renderer = renderer;
    const device = this.device = renderer.device, C = GPUShaderStage.COMPUTE, B = GPUBufferUsage;
    this.params = device.createBuffer({ size: 48, usage: B.UNIFORM | B.COPY_DST });
    this.partial = device.createBuffer({ size: MAX_GROUPS * 8, usage: B.STORAGE });
    this.state = device.createBuffer({ size: 16, usage: B.STORAGE | B.COPY_SRC | B.COPY_DST });
    device.queue.writeBuffer(this.state, 0, new Float32Array([1, 0.3, 0, 1]));
    this.bglMeasure = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'uniform' } },
      { binding: 1, visibility: C, texture: { sampleType: 'unfilterable-float' } },
      { binding: 2, visibility: C, texture: { sampleType: 'unfilterable-float' } },
      { binding: 3, visibility: C, buffer: { type: 'storage' } },
    ] });
    this.bglAdapt = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'uniform' } },
      { binding: 1, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: C, buffer: { type: 'storage' } },
    ] });
    const pipe = (code, label, entryPoint, bgl) => {
      const module = device.createShaderModule({ code, label });
      if (module.getCompilationInfo) module.getCompilationInfo().then(info => {
        for (const e of info.messages) if (e.type === 'error') console.error(`${label} WGSL ${e.lineNum}:${e.linePos} ${e.message}\n` + code.split('\n')[e.lineNum - 1]);
      });
      return device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }), compute: { module, entryPoint } });
    };
    this.measurePipe = pipe(MEASURE_WGSL, 'eye measure', 'measure', this.bglMeasure);
    this.adaptPipe = pipe(ADAPT_WGSL, 'eye adapt', 'adapt', this.bglAdapt);
    this.adaptBG = device.createBindGroup({ layout: this.bglAdapt, entries: [
      { binding: 0, resource: { buffer: this.params } }, { binding: 1, resource: { buffer: this.partial } }, { binding: 2, resource: { buffer: this.state } }] });
    this.blank = device.createTexture({ size: [1, 1], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING }).createView();
    this.on = false; this.exposure = 1; this.brightness = 0; this.aim = 1;
    this._key = ''; this._reading = null; this._was = 0;
  }
  // the buffer drawing reads the exposure from (state[0]), and whether to use it
  buffer() { return this.state; }

  // Each frame, after the scene (and haze) are worked out. f: { on, scene ({ view, id }: the scene's colour),
  // haze ({ view, id }, or null), res: [x, y] (mosaic pixels), ss (scene samples a mosaic pixel, each way),
  // target, darkest, brightest, middle (0 the whole screen alike, 1 mostly the middle), toDark, toLight }
  update(f) {
    const was = this.on;
    this.on = !!f.on;
    const now = performance.now(), dt = this._was ? Math.min(0.25, (now - this._was) / 1000) : 0;
    this._was = now;
    if (!this.on) { if (was) this.device.queue.writeBuffer(this.state, 8, new Float32Array([0])); return; }
    const X = Math.max(1, f.res[0] | 0), Y = Math.max(1, f.res[1] | 0);
    // one mosaic pixel in four each way would do as well on a big screen; keep the workgroups in bounds
    const gx = Math.ceil(X / GROUP), gy = Math.ceil(Y / GROUP);
    if (gx * gy > MAX_GROUPS) return;
    this.device.queue.writeBuffer(this.params, 0, new Float32Array([X, Y, Math.max(1, Math.round(f.ss)), gx * gy,
      f.target, f.darkest, f.brightest, f.middle, f.toDark, f.toLight, dt, f.haze ? 1 : 0]));
    const key = f.scene.id + ':' + (f.haze ? f.haze.id : '-');
    if (key !== this._key) {
      this._key = key;
      this.measureBG = this.device.createBindGroup({ layout: this.bglMeasure, entries: [
        { binding: 0, resource: { buffer: this.params } }, { binding: 1, resource: f.scene.view },
        { binding: 2, resource: f.haze ? f.haze.view : this.blank }, { binding: 3, resource: { buffer: this.partial } }] });
    }
    this.renderer.compute(enc => {
      const pass = enc.beginComputePass({ label: 'eye adaptation' });
      pass.setPipeline(this.measurePipe);
      pass.setBindGroup(0, this.measureBG);
      pass.dispatchWorkgroups(gx, gy, 1);
      pass.setPipeline(this.adaptPipe);
      pass.setBindGroup(0, this.adaptBG);
      pass.dispatchWorkgroups(1, 1, 1);
      pass.end();
    });
  }
  // fetch the exposure and the brightness it measured (into .exposure, .brightness, .aim), without stalling;
  // resolves once they're in
  read() {
    if (this._reading) return this._reading;
    const buf = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.state, 0, buf, 0, 16);
    this.device.queue.submit([enc.finish()]);
    this._reading = buf.mapAsync(GPUMapMode.READ).then(() => {
      const d = new Float32Array(buf.getMappedRange());
      this.exposure = d[0]; this.brightness = d[1]; this.aim = d[3];
      buf.unmap(); buf.destroy(); this._reading = null;
    }, err => { console.warn('eye read', err); this._reading = null; });
    return this._reading;
  }
}
