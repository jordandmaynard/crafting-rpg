// Bloom: a soft glow spilling out round whatever's brighter than `threshold` (the sun's ring in the haze, lava,
// lamps, bright shafts), as light scatters in a lens or an eye.
//
// Each frame, after the lit haze and the eye adaptation and before the outline pass shows the picture, three
// compute passes run at half the mosaic's size each way. The first reads the picture as it will be shown (the
// scene, with the haze over it and the eye's exposure), two by two mosaic pixels to a texel, and keeps only what's
// over the threshold, eased in over `knee` so nothing pops. The other two blur that, across and then down, with a
// Gaussian `size` mosaic pixels wide. The outline pass adds it back, `strength` of it (shaders.js, bloomAt).

const GROUP = 8, MAX_R = 48;

const COMMON = /* wgsl */ `
struct BP {
  dims: vec4f,     // mosaic pixels across, down, scene samples a mosaic pixel (each way), 1 with the haze over it
  cut: vec4f,      // threshold, knee, blur's sigma (texels), 1 with the eye's exposure
  size: vec4f,     // texels across, down
}
@group(0) @binding(0) var<uniform> B: BP;
`;

const PREFILTER_WGSL = /* wgsl */ `
${COMMON}
@group(0) @binding(1) var scene: texture_2d<f32>;
@group(0) @binding(2) var haze: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> eye: array<f32, 4>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(${GROUP}, ${GROUP}, 1)
fn prefilter(@builtin(global_invocation_id) id: vec3u) {
  if (f32(id.x) >= B.size.x || f32(id.y) >= B.size.y) { return; }
  let res = vec2i(B.dims.xy); let ss = i32(B.dims.z); let sz = vec2i(textureDimensions(scene));
  var c = vec3f(0.0);
  for (var j = 0; j < 2; j++) {
    for (var k = 0; k < 2; k++) {
      let p = min(vec2i(id.xy) * 2 + vec2i(k, j), res - 1);
      var s = textureLoad(scene, min(p * ss + ss / 2, sz - 1), 0).rgb;
      if (B.dims.w > 0.5) { let h = textureLoad(haze, p, 0); s = s * h.a + h.rgb; }
      c += s;
    }
  }
  c *= 0.25;
  if (B.cut.w > 0.5) { c *= eye[0]; }
  // the brightest channel, so deep red lava glows as well as white light does
  let l = max(max(c.r, c.g), c.b); let kn = max(B.cut.y, 1e-4);
  var soft = clamp(l - B.cut.x + kn, 0.0, 2.0 * kn);
  soft = soft * soft / (4.0 * kn);
  textureStore(dst, vec2i(id.xy), vec4f(c * max(soft, l - B.cut.x) / max(l, 1e-4), 1.0));
}
`;

const BLUR_WGSL = /* wgsl */ `
${COMMON}
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<rgba16float, write>;
fn blur(id: vec2i, d: vec2i) {
  let size = vec2i(B.size.xy);
  if (id.x >= size.x || id.y >= size.y) { return; }
  let s = max(B.cut.z, 0.3);
  let r = min(i32(ceil(s * 3.0)), ${MAX_R});
  var sum = vec3f(0.0); var ws = 0.0;
  for (var i = -r; i <= r; i++) {
    let w = exp(-f32(i * i) / (2.0 * s * s));
    sum += textureLoad(src, clamp(id + d * i, vec2i(0), size - 1), 0).rgb * w;
    ws += w;
  }
  textureStore(dst, id, vec4f(sum / ws, 1.0));
}
@compute @workgroup_size(${GROUP}, ${GROUP}, 1)
fn across(@builtin(global_invocation_id) id: vec3u) { blur(vec2i(id.xy), vec2i(1, 0)); }
@compute @workgroup_size(${GROUP}, ${GROUP}, 1)
fn down(@builtin(global_invocation_id) id: vec3u) { blur(vec2i(id.xy), vec2i(0, 1)); }
`;

export class Bloom {
  constructor(renderer) {
    this.renderer = renderer;
    const device = this.device = renderer.device, C = GPUShaderStage.COMPUTE;
    this.params = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const tex = { sampleType: 'unfilterable-float' }, out = { access: 'write-only', format: 'rgba16float' };
    this.bglPre = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'uniform' } },
      { binding: 1, visibility: C, texture: tex },
      { binding: 2, visibility: C, texture: tex },
      { binding: 3, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: C, storageTexture: out },
    ] });
    this.bglBlur = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'uniform' } },
      { binding: 1, visibility: C, texture: tex },
      { binding: 2, visibility: C, storageTexture: out },
    ] });
    const mod = (code, label) => {
      const module = device.createShaderModule({ code, label });
      if (module.getCompilationInfo) module.getCompilationInfo().then(info => {
        for (const e of info.messages) if (e.type === 'error') console.error(`${label} WGSL ${e.lineNum}:${e.linePos} ${e.message}\n` + code.split('\n')[e.lineNum - 1]);
      });
      return module;
    };
    const pipe = (module, entryPoint, bgl) => device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }), compute: { module, entryPoint } });
    const blur = mod(BLUR_WGSL, 'bloom blur');
    this.prePipe = pipe(mod(PREFILTER_WGSL, 'bloom prefilter'), 'prefilter', this.bglPre);
    this.acrossPipe = pipe(blur, 'across', this.bglBlur);
    this.downPipe = pipe(blur, 'down', this.bglBlur);
    this.blank = device.createTexture({ size: [1, 1], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING }).createView();
    this.blankEye = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });
    this.on = false; this.strength = 0; this.dims = [0, 0]; this.key = 0; this._preKey = '';
  }
  _allocate(w, h) {
    if (this.texA) { this.texA.destroy(); this.texB.destroy(); }
    const make = () => this.device.createTexture({ size: [w, h], format: 'rgba16float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
    this.texA = make(); this.texB = make();
    this.viewA = this.texA.createView(); this.viewB = this.texB.createView();
    this.dims = [w, h]; this.key++; this._preKey = '';
    const bg = (from, to) => this.device.createBindGroup({ layout: this.bglBlur, entries: [
      { binding: 0, resource: { buffer: this.params } }, { binding: 1, resource: from }, { binding: 2, resource: to }] });
    this.acrossBG = bg(this.viewA, this.viewB);
    this.downBG = bg(this.viewB, this.viewA);
  }
  // what drawing reads: the glow (or null with it off) and the frame's bloom numbers
  view() { return this.on ? this.viewA : null; }
  uniforms() { return this.on ? [this.strength, 0, 1 / (2 * this.dims[0]), 1 / (2 * this.dims[1])] : [0, 0, 0, 0]; }

  // Each frame, after the haze and the eye adaptation. f: { on, scene ({ view, id }: the scene's colour), haze
  // ({ view, id }, or null), eye (its state buffer, or null), res: [x, y] (mosaic pixels), ss (scene samples a
  // mosaic pixel, each way), threshold, knee, size (the blur's sigma, mosaic pixels), strength }
  update(f) {
    this.on = !!f.on && f.strength > 0;
    if (!this.on) return;
    this.strength = f.strength;
    const X = Math.max(1, f.res[0] | 0), Y = Math.max(1, f.res[1] | 0), w = Math.ceil(X / 2), h = Math.ceil(Y / 2);
    if (w !== this.dims[0] || h !== this.dims[1]) this._allocate(w, h);
    this.device.queue.writeBuffer(this.params, 0, new Float32Array([X, Y, Math.max(1, Math.round(f.ss)), f.haze ? 1 : 0,
      f.threshold, f.knee, Math.max(0.3, f.size / 2), f.eye ? 1 : 0, w, h, 0, 0]));
    const key = this.key + ':' + f.scene.id + ':' + (f.haze ? f.haze.id : '-') + ':' + (f.eye ? 'e' : '-');
    if (key !== this._preKey) {
      this._preKey = key;
      this.preBG = this.device.createBindGroup({ layout: this.bglPre, entries: [
        { binding: 0, resource: { buffer: this.params } }, { binding: 1, resource: f.scene.view },
        { binding: 2, resource: f.haze ? f.haze.view : this.blank }, { binding: 3, resource: { buffer: f.eye || this.blankEye } },
        { binding: 4, resource: this.viewA }] });
    }
    const gx = Math.ceil(w / GROUP), gy = Math.ceil(h / GROUP);
    this.renderer.compute(enc => {
      const pass = enc.beginComputePass({ label: 'bloom' });
      pass.setPipeline(this.prePipe); pass.setBindGroup(0, this.preBG); pass.dispatchWorkgroups(gx, gy, 1);
      pass.setPipeline(this.acrossPipe); pass.setBindGroup(0, this.acrossBG); pass.dispatchWorkgroups(gx, gy, 1);
      pass.setPipeline(this.downPipe); pass.setBindGroup(0, this.downBG); pass.dispatchWorkgroups(gx, gy, 1);
      pass.end();
    });
  }
}
