// The WebGPU renderer. Each render(scene, camera) draws the scene into the current target (a render target,
// or the canvas): the sun's shadow map first if it's due, then everything the camera's layers can see, its
// solid things nearest first, then its see-through things farthest first, each in renderOrder. A frame's
// passes are recorded into one command buffer and sent when one draws into the canvas (or, failing that,
// once the frame's code has run).
//
// Uniforms: one Frame block per pass and one Obj block per object drawn, written into big buffers at
// 256-byte steps and picked out with dynamic offsets; ShaderMaterials keep their own block and textures.
// An InstancedMesh (scene.js) draws its first `count` copies in one call, each placed by its matrix in a
// vertex buffer stepped once a copy (the built-in materials and the shadow pass only). A ShaderMaterial mesh
// whose geometry has an `instanceCount` is drawn that many times over, its shader telling the copies apart by
// @builtin(instance_index) (none at 0).
// Projections are kept as the scene graph makes them (z from -1 to 1) and squeezed to WebGPU's 0 to 1 here.
import { Matrix4, Vector3, Frustum, Color } from './math.js';
import { PRELUDE, builtinCode, MAX_POINTS, FRAME_BYTES, OBJ_BYTES } from './shaders.js';
import * as M from './materials.js';

const DEPTH = 'depth32float';
const COLOR_RT = 'rgba16float';   // render targets keep light brighter than white, for eye adaptation and HDR
const OBJ_PAGE = 4096;             // object blocks per uniform buffer
const FRAME_SLOTS = 64;
const SHADOW_FORMAT = 'depth32float';

// z from -1 .. 1 to 0 .. 1, and the shadow map's x, y to texture coordinates (v down)
const ZFIX = new Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const UVFIX = new Matrix4().set(0.5, 0, 0, 0.5, 0, -0.5, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1);
const BLEND_FACTOR = {
  [M.ZeroFactor]: 'zero', [M.OneFactor]: 'one', [M.SrcColorFactor]: 'src', [M.OneMinusSrcColorFactor]: 'one-minus-src',
  [M.SrcAlphaFactor]: 'src-alpha', [M.OneMinusSrcAlphaFactor]: 'one-minus-src-alpha', [M.DstAlphaFactor]: 'dst-alpha',
  [M.OneMinusDstAlphaFactor]: 'one-minus-dst-alpha', [M.DstColorFactor]: 'dst', [M.OneMinusDstColorFactor]: 'one-minus-dst',
};
const DEPTH_FUNC = ['never', 'always', 'less', 'less-equal', 'equal', 'greater-equal', 'greater', 'not-equal'];
// an instanced mesh's matrices: a mat4 a copy, its columns at locations 8 to 11
const INSTANCE_LAYOUT = { arrayStride: 64, stepMode: 'instance', attributes: [0, 1, 2, 3].map(k => ({ shaderLocation: 8 + k, offset: k * 16, format: 'float32x4' })) };
const ATTR_FORMAT = { f32: ['float32', 4], vec2f: ['float32x2', 8], vec3f: ['float32x3', 12], vec4f: ['float32x4', 16] };

const texOf = (mat, n) => mat.textures[n] || mat.uniforms[n].value;

export async function createRenderer() {
  if (!navigator.gpu) throw new Error('This browser has no WebGPU.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter was found.');
  // timestamp-query, where the browser has it, lets the profiler (G) time each pass
  const device = await adapter.requestDevice({ requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : [] });
  device.lost.then(info => console.error('WebGPU device lost:', info.message));
  device.addEventListener && device.addEventListener('uncapturederror', e => console.error('WebGPU:', e.error.message));
  const r = new Renderer(device);
  r.adapterInfo = adapter.info || null;
  return r;
}

class Renderer {
  constructor(device) {
    this.device = device;
    const cv = this.domElement = document.createElement('canvas');
    this.context = cv.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device, format: this.format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    this.shadowMap = { enabled: true, autoUpdate: true, needsUpdate: false, type: 1 };
    this.autoClear = true;
    this.clearColor = new Color(0, 0, 0); this.clearAlpha = 1;
    this.target = null;
    this.clouds = null;
    this.info = { draws: 0, passes: 0 };
    this._time0 = performance.now();
    this._frustum = new Frustum(); this._m = new Matrix4(); this._vp = new Matrix4(); this._v = new Vector3(); this._v2 = new Vector3();
    this._pipelines = new Map(); this._modules = new Map();
    this._bufs = new WeakMap(); this._texs = new WeakMap(); this._rts = new WeakMap(); this._mats = new WeakMap(); this._snaps = new WeakMap();
    this.profiler = null;   // a GpuProfiler: each pass is timed under passName (render), its label (compute) or its kind
    this.passName = '';
    this._trash = [];       // textures dropped mid-frame, destroyed once the frame that may use them is sent
    this._freed = new FinalizationRegistry(b => b.destroy());
    this._frameNo = 0; this._enc = null; this._pendingClear = null; this._canvasTex = null; this._flushQueued = false;

    const U = GPUBufferUsage, S = GPUShaderStage;
    this.bglFrame = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: S.VERTEX | S.FRAGMENT | S.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: FRAME_BYTES } },
      { binding: 1, visibility: S.FRAGMENT | S.COMPUTE, texture: { sampleType: 'depth' } },
      { binding: 2, visibility: S.FRAGMENT | S.COMPUTE, sampler: { type: 'comparison' } },
      { binding: 3, visibility: S.FRAGMENT | S.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 4, visibility: S.FRAGMENT | S.COMPUTE, sampler: { type: 'filtering' } },
      { binding: 5, visibility: S.FRAGMENT | S.COMPUTE, texture: { sampleType: 'float', viewDimension: '3d' } },
      { binding: 6, visibility: S.FRAGMENT | S.COMPUTE, texture: { sampleType: 'float', viewDimension: '3d' } },
      { binding: 7, visibility: S.FRAGMENT | S.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
      { binding: 8, visibility: S.FRAGMENT | S.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 9, visibility: S.FRAGMENT | S.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 10, visibility: S.FRAGMENT | S.COMPUTE, texture: { sampleType: 'float' } },
    ] });
    this.bglFrameShadow = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: S.VERTEX, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: FRAME_BYTES } }] });
    this.bglObj = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: S.VERTEX | S.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: OBJ_BYTES } }] });
    this.layoutMain = device.createPipelineLayout({ bindGroupLayouts: [this.bglFrame, this.bglObj] });
    this.layoutShadow = device.createPipelineLayout({ bindGroupLayouts: [this.bglFrameShadow, this.bglObj] });

    this.frameBuf = device.createBuffer({ size: FRAME_BYTES * FRAME_SLOTS, usage: U.UNIFORM | U.COPY_DST });
    this.frameData = new Float32Array(FRAME_BYTES * FRAME_SLOTS / 4);
    this.frameSlot = 0;
    this.objPages = []; this.objSlot = 0;

    this.shadowSize = 0; this.shadowTex = null;
    this.shadowSamp = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.linSamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });
    this.white = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: this.white }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 4 }, [1, 1]);
    // stand-ins for the probe lighting's textures while there's none
    const T = GPUTextureUsage;
    this.noGI = {
      vis: device.createTexture({ size: [1, 1, 1], dimension: '3d', format: 'rgba16float', usage: T.TEXTURE_BINDING }).createView(),
      light: device.createTexture({ size: [3, 1, 1], dimension: '3d', format: 'rgba16float', usage: T.TEXTURE_BINDING }).createView(),
      hf: device.createTexture({ size: [1, 1], format: 'rgba32float', usage: T.TEXTURE_BINDING }).createView(),
    };
    this.noHaze = device.createTexture({ size: [1, 1], format: 'rgba16float', usage: T.TEXTURE_BINDING }).createView();
    this.haze = null; this._lastFrameOff = 0;
    this.noEye = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.noEye, 0, new Float32Array([1, 0, 0, 1]));
    this.eye = null; this.hdr = false; this.hdrPeak = 0; this.bloom = null;
    this.gi = null;
    this._ensureShadow(512);
    this._frameBG = null; this._frameBGKey = '';
    this.frameBGShadow = device.createBindGroup({ layout: this.bglFrameShadow, entries: [{ binding: 0, resource: { buffer: this.frameBuf, size: FRAME_BYTES } }] });
    this._canvasDepth = null;
  }

  // ---- the three-like surface the game calls ----
  setPixelRatio() {}
  getPixelRatio() { return 1; }
  setSize(w, h) { this.domElement.width = Math.max(1, w | 0); this.domElement.height = Math.max(1, h | 0); }
  setClearColor(c, a = 1) { this.clearColor.set(c); this.clearAlpha = a; }
  setRenderTarget(rt) { this._runPendingClear(); this.target = rt || null; }
  getRenderTarget() { return this.target; }
  // clear the current target's colour and depth (done as the next pass on it begins)
  clear() { this._runPendingClear(); this._pendingClear = { target: this.target, color: [this.clearColor.r, this.clearColor.g, this.clearColor.b, this.clearAlpha] }; }
  // the clouds' texture and settings, as { tCloud, cloudOff, cloudScale, cloudAmt, cloudCover, cloudSoft, shadowAmt } of { value }
  setClouds(u) { this.clouds = u; }
  // probe lighting (probes.js): something with views() -> { vis, light, hf, key } and uniforms() -> 12 numbers
  // (the frame's giA, giB, giC), or null
  setGI(gi) { this.gi = gi; this._frameBGKey = ''; }
  // lit haze (haze.js): something with view() -> its texture (a texel a mosaic pixel) or null, uniforms() -> 8
  // numbers (the frame's hazeA, hazeB) and key, or null
  setHaze(h) { this.haze = h; this._frameBGKey = ''; }
  // eye adaptation (exposure.js): something with buffer() -> its state (the exposure first) and on, or null
  setEye(e) { this.eye = e; this._frameBGKey = ''; }
  // bloom (bloom.js): something with view() -> its glow (or null) and uniforms() -> 4 numbers (the frame's bloom)
  // and key, or null
  setBloom(b) { this.bloom = b; this._frameBGKey = ''; }
  // HDR output: on an HDR display, a float canvas whose values above 1 show brighter than white; peak: the
  // brightest highlights, × white's brightness. Off: the usual canvas, everything over white clipped.
  setHDR(on, peak = 3) {
    on = !!on;
    this.hdrPeak = on ? Math.max(1, peak) : 0;
    if (on === this.hdr) return;
    this.hdr = on;
    this.format = on ? 'rgba16float' : navigator.gpu.getPreferredCanvasFormat();
    const cfg = { device: this.device, format: this.format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC };
    if (on) cfg.toneMapping = { mode: 'extended' };
    this.context.configure(cfg);
    this._canvasTex = null;
  }
  // the WGSL every pipeline starts with, for compute passes that read the frame
  preludeCode() { return PRELUDE; }
  // record compute work into this frame, after what's been drawn so far: cb(encoder, the frame's bind group, the
  // offset of the last render's frame in it). The bind group leaves the haze out, so a pass can write it.
  compute(cb) {
    this._runPendingClear();
    if (!this._enc) { this._enc = this.device.createCommandEncoder(); this._frameNo++; }
    cb(this._timedEncoder(this._enc), this._frameBindGroup(true), this._lastFrameOff);
  }
  // the profiler's timestamps for a pass named name, or undefined when it isn't timing
  _tsw(name) { return this.profiler ? this.profiler.tsw(name) : undefined; }
  // the encoder, or while profiling, one whose passes each write timestamps under their label
  _timedEncoder(enc) {
    if (!this.profiler || !this.profiler.timing) return enc;
    const r = this;
    return new Proxy(enc, { get(t, k) {
      if (k === 'beginRenderPass' || k === 'beginComputePass') return d => t[k](Object.assign({}, d, { timestampWrites: r._tsw(d.label || (k === 'beginRenderPass' ? 'render pass' : 'compute pass')) }));
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    } });
  }
  // the frame's end: send what's left, then the profiler's timestamps
  endFrame() {
    this.flush();
    this.passName = '';
    const p = this.profiler;
    if (!p || !p.names.length) return;
    const enc = this.device.createCommandEncoder();
    p.resolve(enc);
    this.device.queue.submit([enc.finish()]);
    p.read();
  }
  // a copy of a render target's colour and depth as they stand at this point in the frame, for a later pass to
  // read what lies behind it (the water, the bed under it): { color, depth } textures, kept while the size holds
  snapshot(rt) {
    this._targetViews(rt);
    const g = this._rts.get(rt), w = Math.max(1, rt.width | 0), h = Math.max(1, rt.height | 0), T = GPUTextureUsage;
    let s = this._snaps.get(rt);
    if (!s || s.src !== g) {
      if (s) this._trash.push(s.colorT, s.depthT);
      const colorT = this.device.createTexture({ size: [w, h], format: COLOR_RT, usage: T.TEXTURE_BINDING | T.COPY_DST });
      const depthT = this.device.createTexture({ size: [w, h], format: DEPTH, usage: T.TEXTURE_BINDING | T.COPY_DST });
      const tex = (t, depth) => { const x = new M.Texture(); x.isViewTexture = true; x.isDepthTexture = depth; x.view = t.createView(); return x; };
      s = { src: g, colorT, depthT, color: tex(colorT, false), depth: tex(depthT, true) };
      this._snaps.set(rt, s);
    }
    this._runPendingClear();
    if (!this._enc) { this._enc = this.device.createCommandEncoder(); this._frameNo++; }
    this._enc.copyTextureToTexture({ texture: g.color }, { texture: s.colorT }, [w, h]);
    this._enc.copyTextureToTexture({ texture: g.depth }, { texture: s.depthT }, [w, h]);
    return s;
  }
  // a texture's GPU view (a render target's too), and an id that changes when the view does
  textureView(t) { const g = this._texture(t); return { view: g.view, id: g.id }; }

  render(scene, camera) {
    const dev = this.device;
    if (!this._enc) { this._enc = dev.createCommandEncoder(); this._frameNo++; this.info.draws = 0; this.info.passes = 0; }
    if (this.autoClear && !this._pendingClear) this.clear();
    if (scene.matrixAutoUpdate !== false) scene.updateMatrixWorld();
    if (!camera.parent) camera.updateMatrixWorld();
    const lights = this._gatherLights(scene);
    if (lights.sun && lights.sun.castShadow && this.shadowMap.enabled && (this.shadowMap.autoUpdate || this.shadowMap.needsUpdate)) {
      this._renderShadow(scene, camera, lights.sun);
      this.shadowMap.needsUpdate = false;
    }
    const tgt = this._targetViews(this.target);
    const frameOff = this._writeFrame(camera, lights, scene, tgt);
    this._lastFrameOff = frameOff;
    const list = this._collect(scene, camera);
    const clear = this._pendingClear && this._pendingClear.target === this.target ? this._pendingClear : null;
    this._pendingClear = null;
    const pass = this._enc.beginRenderPass({
      colorAttachments: [{ view: tgt.color, loadOp: clear ? 'clear' : 'load', storeOp: 'store', clearValue: clear ? clear.color : undefined }],
      depthStencilAttachment: { view: tgt.depth, depthLoadOp: clear ? 'clear' : 'load', depthStoreOp: 'store', depthClearValue: 1 },
      timestampWrites: this._tsw(this.passName || 'scene'),
    });
    this.info.passes++;
    pass.setBindGroup(0, this._frameBindGroup(), [frameOff]);
    const override = scene.overrideMaterial;
    let lastPipe = null;
    for (const it of list) {
      const mesh = it.mesh, mat = override || mesh.material;
      if (!mat.colorWrite && !mat.depthWrite) continue;
      const geo = mesh.geometry, kind = override && override.isMeshNormalMaterial ? 'normal' : mat.isShaderMaterial ? 'shader' : mat.isMeshStandardMaterial ? 'std' : 'basic';
      const hasColor = kind !== 'normal' && mat.vertexColors && !!geo.attributes.color, inst = !!mesh.isInstancedMesh;
      if (inst && kind === 'shader') continue;
      const pipe = this._pipeline(kind, mat, hasColor, tgt.format, inst);
      if (!pipe) continue;
      if (pipe !== lastPipe) { pass.setPipeline(pipe); lastPipe = pipe; }
      const [bg, off] = this._writeObj(mesh, mat);
      pass.setBindGroup(1, bg, [off]);
      if (kind === 'shader') pass.setBindGroup(2, this._materialBindGroup(mat));
      const slot = this._bindGeometry(pass, geo, kind === 'shader' ? mat : null, hasColor);
      if (!slot) continue;
      if (inst) pass.setVertexBuffer(slot, this._instanceBuffer(mesh));
      this._draw(pass, geo, inst ? mesh.count : geo.instanceCount ?? 1);
    }
    pass.end();
    if (!this.target) this.flush();
    else this._queueFlush();
  }

  // send the frame's work
  flush() {
    if (!this._enc) return;
    this._runPendingClear();
    const q = this.device.queue;
    if (this.frameSlot) q.writeBuffer(this.frameBuf, 0, this.frameData, 0, this.frameSlot * FRAME_BYTES / 4);
    for (const p of this.objPages) if (p.used) { q.writeBuffer(p.buf, 0, p.data, 0, p.used * OBJ_BYTES / 4); p.used = 0; }
    q.submit([this._enc.finish()]);
    for (const t of this._trash) t.destroy();
    this._trash.length = 0;
    this._enc = null; this.frameSlot = 0; this.objSlot = 0; this._canvasTex = null;
  }
  // the canvas's pixels as RGBA bytes (for tests), after drawing a frame into it
  async readPixels() {
    this.flush();
    const tex = this._lastCanvasTex;
    if (!tex) return null;
    const half = tex.format === 'rgba16float', bpp = half ? 8 : 4;
    const w = tex.width, h = tex.height, row = Math.ceil(w * bpp / 256) * 256, dev = this.device;
    const buf = dev.createBuffer({ size: row * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = dev.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [w, h]);
    dev.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange()), out = new Uint8Array(w * h * 4), bgra = tex.format.startsWith('bgra');
    // a half float, clipped to 0-1, as a byte
    const f16 = (lo, hi) => { const b = hi << 8 | lo, e = (b >> 10) & 31, m = b & 1023, v = e ? (1 + m / 1024) * 2 ** (e - 15) : m / 1024 * 2 ** -14;
      return b & 0x8000 ? 0 : Math.min(255, Math.round(v * 255)); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = y * row + x * bpp, d = (y * w + x) * 4;
      if (half) { for (let c = 0; c < 4; c++) out[d + c] = f16(src[s + c * 2], src[s + c * 2 + 1]); continue; }
      out[d] = src[s + (bgra ? 2 : 0)]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + (bgra ? 0 : 2)]; out[d + 3] = src[s + 3];
    }
    buf.unmap(); buf.destroy();
    return { width: w, height: h, data: out };
  }

  // ---- internals ----
  _queueFlush() {
    if (this._flushQueued) return;
    this._flushQueued = true;
    queueMicrotask(() => { this._flushQueued = false; this.flush(); });
  }
  // a clear asked for with nothing drawn after it: run it as an empty pass
  _runPendingClear() {
    const c = this._pendingClear;
    if (!c) return;
    this._pendingClear = null;
    if (!this._enc) { this._enc = this.device.createCommandEncoder(); this._frameNo++; }
    const tgt = this._targetViews(c.target);
    this._enc.beginRenderPass({
      colorAttachments: [{ view: tgt.color, loadOp: 'clear', storeOp: 'store', clearValue: c.color }],
      depthStencilAttachment: { view: tgt.depth, depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 1 },
      timestampWrites: this._tsw('clear'),
    }).end();
    if (!c.target) this.flush(); else this._queueFlush();
  }
  _gatherLights(scene) {
    const L = { hemi: null, sun: null, points: [] };
    scene.traverse(o => {
      if (!o.isLight || !o.visible) return;
      if (o.isHemisphereLight) { if (!L.hemi) L.hemi = o; }
      else if (o.isDirectionalLight) { if (!L.sun) L.sun = o; }
      else if (o.isPointLight && L.points.length < MAX_POINTS) L.points.push(o);
    });
    return L;
  }
  _ensureShadow(size) {
    if (size === this.shadowSize) return;
    if (this.shadowTex) this.shadowTex.destroy();
    this.shadowSize = size;
    this.shadowTex = this.device.createTexture({ size: [size, size], format: SHADOW_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.shadowView = this.shadowTex.createView();
    this._frameBGKey = '';
  }
  _frameBindGroup(noHaze = false) {
    const ct = this.clouds && this.clouds.tCloud && this.clouds.tCloud.value, cloud = ct ? this._texture(ct) : null;
    const gv = this.gi ? this.gi.views() : null;
    const hv = this.haze && !noHaze ? this.haze.view() : null, eb = this.eye && !noHaze ? this.eye.buffer() : null;
    const bv = this.bloom && !noHaze ? this.bloom.view() : null;
    const key = this.shadowSize + ':' + (cloud ? cloud.id : 'w') + ':' + (gv ? gv.key : '-') + ':' + (hv ? this.haze.key : '-') + ':' + (eb ? 'e' : '-') +
      ':' + (bv ? this.bloom.key : '-');
    const C = noHaze ? (this._frameBGc = this._frameBGc || { key: '', bg: null }) : null;
    if (C ? key !== C.key : key !== this._frameBGKey) {
      if (C) C.key = key; else this._frameBGKey = key;
      const bg = this.device.createBindGroup({ layout: this.bglFrame, entries: [
        { binding: 0, resource: { buffer: this.frameBuf, size: FRAME_BYTES } },
        { binding: 1, resource: this.shadowView },
        { binding: 2, resource: this.shadowSamp },
        { binding: 3, resource: cloud ? cloud.view : this.white.createView() },
        { binding: 4, resource: this.linSamp },
        { binding: 5, resource: gv ? gv.vis : this.noGI.vis },
        { binding: 6, resource: gv ? gv.light : this.noGI.light },
        { binding: 7, resource: gv ? gv.hf : this.noGI.hf },
        { binding: 8, resource: hv || this.noHaze },
        { binding: 9, resource: { buffer: eb || this.noEye } },
        { binding: 10, resource: bv || this.noHaze },
      ] });
      if (C) C.bg = bg; else this._frameBG = bg;
    }
    return C ? C.bg : this._frameBG;
  }
  _frameSlotAlloc() {
    if (this.frameSlot >= FRAME_SLOTS) this.flush();
    if (!this._enc) { this._enc = this.device.createCommandEncoder(); this._frameNo++; }
    return this.frameSlot++;
  }
  _setMat(d, o, m) { const e = m.elements; for (let i = 0; i < 16; i++) d[o + i] = e[i]; }
  _writeFrame(camera, L, scene, tgt) {
    const slot = this._frameSlotAlloc(), d = this.frameData, o = slot * FRAME_BYTES / 4, m = this._m;
    m.multiplyMatrices(ZFIX, camera.projectionMatrix);
    this._setMat(d, o, camera.matrixWorldInverse);
    this._setMat(d, o + 16, m);
    this._vp.multiplyMatrices(m, camera.matrixWorldInverse);
    this._setMat(d, o + 32, this._vp);
    const sun = L.sun, shadowOn = !!(sun && sun.castShadow && this.shadowMap.enabled);
    this._setMat(d, o + 48, sun ? sun.shadow.matrix : m.identity());
    const cw = camera.matrixWorld.elements;
    d[o + 64] = cw[12]; d[o + 65] = cw[13]; d[o + 66] = cw[14]; d[o + 67] = camera.isOrthographicCamera ? 1 : 0;
    const dir = this._v.set(-cw[8], -cw[9], -cw[10]).normalize();
    d[o + 68] = dir.x; d[o + 69] = dir.y; d[o + 70] = dir.z; d[o + 71] = (performance.now() - this._time0) / 1000;
    const fog = scene.fog;
    if (fog) { d[o + 72] = fog.color.r; d[o + 73] = fog.color.g; d[o + 74] = fog.color.b; d[o + 75] = 1; d[o + 76] = fog.near; d[o + 77] = fog.far; }
    else d[o + 75] = 0;
    const h = L.hemi;
    if (h) {
      d[o + 80] = h.color.r * h.intensity; d[o + 81] = h.color.g * h.intensity; d[o + 82] = h.color.b * h.intensity; d[o + 83] = 1;
      d[o + 84] = h.groundColor.r * h.intensity; d[o + 85] = h.groundColor.g * h.intensity; d[o + 86] = h.groundColor.b * h.intensity;
    } else d[o + 83] = 0;
    if (sun) {
      const sp = this._v.setFromMatrixPosition(sun.matrixWorld), tp = this._v2.setFromMatrixPosition(sun.target.matrixWorld);
      sp.sub(tp).normalize();
      d[o + 88] = sp.x; d[o + 89] = sp.y; d[o + 90] = sp.z; d[o + 91] = 1;
      d[o + 92] = sun.color.r * sun.intensity; d[o + 93] = sun.color.g * sun.intensity; d[o + 94] = sun.color.b * sun.intensity; d[o + 95] = shadowOn ? 1 : 0;
      d[o + 96] = sun.shadow.bias; d[o + 97] = sun.shadow.normalBias; d[o + 98] = sun.shadow.radius; d[o + 99] = 1 / this.shadowSize;
    } else { d[o + 91] = 0; d[o + 95] = 0; }
    const C = this.clouds;
    if (C) {
      d[o + 100] = C.cloudOff.value.x; d[o + 101] = C.cloudOff.value.y; d[o + 102] = C.cloudScale.value; d[o + 103] = C.tCloud.value ? C.cloudAmt.value : 0;
      d[o + 104] = C.cloudCover.value; d[o + 105] = C.cloudSoft.value; d[o + 106] = C.shadowAmt ? C.shadowAmt.value : 1;
    } else { d[o + 102] = 1; d[o + 103] = 0; d[o + 106] = 1; }
    d[o + 107] = L.points.length;
    d[o + 108] = tgt.width; d[o + 109] = tgt.height; d[o + 110] = 1 / tgt.width; d[o + 111] = 1 / tgt.height;
    for (let i = 0; i < L.points.length; i++) {
      const p = L.points[i], q = o + 112 + i * 8, e = p.matrixWorld.elements;
      d[q] = e[12]; d[q + 1] = e[13]; d[q + 2] = e[14]; d[q + 3] = p.distance;
      d[q + 4] = p.color.r * p.intensity; d[q + 5] = p.color.g * p.intensity; d[q + 6] = p.color.b * p.intensity; d[q + 7] = p.decay;
    }
    const g = this.gi ? this.gi.uniforms() : null, go = o + 112 + MAX_POINTS * 8;
    for (let i = 0; i < 12; i++) d[go + i] = g ? g[i] : 0;
    const hz = this.haze && this.haze.view() ? this.haze.uniforms() : null;
    for (let i = 0; i < 8; i++) d[go + 12 + i] = hz ? hz[i] : 0;
    d[go + 20] = this.eye && this.eye.on ? 1 : 0; d[go + 21] = this.hdrPeak; d[go + 22] = 0; d[go + 23] = 0;
    const bl = this.bloom && this.bloom.view() ? this.bloom.uniforms() : null;
    for (let i = 0; i < 4; i++) d[go + 24 + i] = bl ? bl[i] : 0;
    return slot * FRAME_BYTES;
  }
  _writeObj(mesh, mat) {
    if (this.objSlot >= this.objPages.length * OBJ_PAGE) {
      const buf = this.device.createBuffer({ size: OBJ_PAGE * OBJ_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      this.objPages.push({ buf, data: new Float32Array(OBJ_PAGE * OBJ_BYTES / 4), used: 0,
        bg: this.device.createBindGroup({ layout: this.bglObj, entries: [{ binding: 0, resource: { buffer: buf, size: OBJ_BYTES } }] }) });
    }
    const page = this.objPages[Math.floor(this.objSlot / OBJ_PAGE)], k = this.objSlot % OBJ_PAGE;
    this.objSlot++; page.used = k + 1;
    const d = page.data, o = k * OBJ_BYTES / 4;
    this._setMat(d, o, mesh.matrixWorld);
    const c = mat.color;
    if (c) { d[o + 16] = c.r; d[o + 17] = c.g; d[o + 18] = c.b; } else { d[o + 16] = d[o + 17] = d[o + 18] = 1; }
    d[o + 19] = mat.opacity;
    const e = mat.emissive, ei = mat.emissiveIntensity ?? 1;
    if (e) { d[o + 20] = e.r * ei; d[o + 21] = e.g * ei; d[o + 22] = e.b * ei; } else { d[o + 20] = d[o + 21] = d[o + 22] = 0; }
    d[o + 23] = mesh.receiveShadow ? 1 : 0;
    d[o + 24] = mat.metalness ?? 0; d[o + 25] = mat.roughness ?? 1;
    return [page.bg, k * OBJ_BYTES];
  }
  // what the camera's layers can see, sorted for drawing
  _collect(scene, camera) {
    const fr = this._frustum.setFromProjectionMatrix(this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const opaque = [], clear = [], override = scene.overrideMaterial, vp = this._m, v = this._v;
    const visit = o => {
      if (!o.visible) return;
      if (o.isMesh && o.layers.test(camera.layers) && !(o.isInstancedMesh && !o.count)) {
        const mat = override || o.material;
        if (mat && mat.visible && (!o.frustumCulled || this._inFrustum(o, fr))) {
          const e = o.matrixWorld.elements;
          v.set(e[12], e[13], e[14]).applyMatrix4(vp);
          (mat.transparent ? clear : opaque).push({ mesh: o, z: v.z, order: o.renderOrder, mid: mat.id });
        }
      }
      for (const c of o.children) visit(c);
    };
    visit(scene);
    opaque.sort((a, b) => a.order - b.order || a.mid - b.mid || a.z - b.z);
    clear.sort((a, b) => a.order - b.order || b.z - a.z);
    return opaque.concat(clear);
  }
  _inFrustum(mesh, fr) {
    const geo = mesh.geometry;
    if (!geo || !geo.attributes.position) return false;
    const s = geo.boundingSphere || geo.computeBoundingSphere(), e = mesh.matrixWorld.elements;
    const x = e[0] * s.x + e[4] * s.y + e[8] * s.z + e[12], y = e[1] * s.x + e[5] * s.y + e[9] * s.z + e[13], z = e[2] * s.x + e[6] * s.y + e[10] * s.z + e[14];
    return fr.intersectsSphere(x, y, z, s.r * mesh.matrixWorld.getMaxScaleOnAxis());
  }
  // (casters are the meshes on the camera's layers, or on shadowLayers when that's set)
  _renderShadow(scene, camera, sun) {
    const sh = sun.shadow, cam = sh.camera;
    this._ensureShadow(Math.max(1, sh.mapSize.x | 0));
    cam.position.setFromMatrixPosition(sun.matrixWorld);
    cam.updateMatrix();
    cam.matrixWorld.copy(cam.matrix);
    cam.lookAt(this._v.setFromMatrixPosition(sun.target.matrixWorld));
    cam.updateMatrixWorld();
    const pm = this._m.multiplyMatrices(ZFIX, cam.projectionMatrix), vp = this._vp.multiplyMatrices(pm, cam.matrixWorldInverse);
    sh.matrix.multiplyMatrices(UVFIX, vp);
    const slot = this._frameSlotAlloc(), d = this.frameData, o = slot * FRAME_BYTES / 4;
    this._setMat(d, o, cam.matrixWorldInverse); this._setMat(d, o + 16, pm); this._setMat(d, o + 32, vp);
    const fr = this._frustum.setFromProjectionMatrix(new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const casters = [];
    const visit = o => {
      if (!o.visible) return;
      if (o.isMesh && o.castShadow && o.layers.test(this.shadowLayers || camera.layers) && o.material && !(o.isInstancedMesh && !o.count) && (!o.frustumCulled || this._inFrustum(o, fr))) casters.push(o);
      for (const c of o.children) visit(c);
    };
    visit(scene);
    const pass = this._enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: this.shadowView, depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 1 }, timestampWrites: this._tsw('shadow map') });
    this.info.passes++;
    pass.setBindGroup(0, this.frameBGShadow, [slot * FRAME_BYTES]);
    let last = null;
    for (const mesh of casters) {
      const mat = mesh.material, inst = !!mesh.isInstancedMesh, pipe = this._shadowPipeline(mat.side, inst);
      if (pipe !== last) { pass.setPipeline(pipe); last = pipe; }
      const [bg, off] = this._writeObj(mesh, mat);
      pass.setBindGroup(1, bg, [off]);
      const slot = this._bindGeometry(pass, mesh.geometry, null, false, true);
      if (!slot) continue;
      if (inst) pass.setVertexBuffer(slot, this._instanceBuffer(mesh));
      this._draw(pass, mesh.geometry, inst ? mesh.count : 1);
    }
    pass.end();
  }
  _draw(pass, geo, copies = 1) {
    if (!copies) return;
    this.info.draws++;
    if (geo.index) pass.drawIndexed(geo.index.count, copies);
    else pass.draw(geo.attributes.position.count, copies);
  }
  // an instanced mesh's matrices, sent again when they've changed (only the copies drawn)
  _instanceBuffer(mesh) {
    let b = this._bufs.get(mesh);
    const arr = mesh.instanceMatrix;
    if (!b || b.size < arr.byteLength) {
      if (b) { this._freed.unregister(b); b.buf.destroy(); }
      b = { buf: this.device.createBuffer({ size: arr.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }), size: arr.byteLength, version: -1, count: -1 };
      this._bufs.set(mesh, b);
      this._freed.register(mesh, b.buf, b);
    }
    if (b.version !== mesh.instanceVersion || b.count !== mesh.count) {
      this.device.queue.writeBuffer(b.buf, 0, arr.buffer, arr.byteOffset, Math.min(arr.length, mesh.count * 16) * 4);
      b.version = mesh.instanceVersion; b.count = mesh.count;
    }
    return b.buf;
  }
  // upload (or refresh) a vertex or index array
  _buffer(attr, usage) {
    let b = this._bufs.get(attr);
    if (b && b.version === attr.version && b.length === attr.array.length) return b.buf;
    const arr = attr.array, bytes = Math.ceil(arr.byteLength / 4) * 4;
    if (!b || b.size < bytes) {
      if (b) b.buf.destroy();
      const buf = this.device.createBuffer({ size: Math.max(4, bytes), usage: usage | GPUBufferUsage.COPY_DST });
      b = { buf, size: Math.max(4, bytes) };
      this._bufs.set(attr, b);
      this._freed.register(attr, buf, b);
    }
    if (arr.byteLength % 4) { const pad = new Uint8Array(bytes); pad.set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)); this.device.queue.writeBuffer(b.buf, 0, pad); }
    else this.device.queue.writeBuffer(b.buf, 0, arr.buffer, arr.byteOffset, arr.byteLength);
    b.version = attr.version; b.length = arr.length;
    return b.buf;
  }
  // binds a geometry's vertex buffers (and index); gives the next free vertex buffer slot, or 0 for nothing to draw
  _bindGeometry(pass, geo, shaderMat, hasColor, positionOnly = false) {
    if (!geo._onDispose) geo._onDispose = g => this._disposeGeometry(g);
    const pos = geo.attributes.position;
    if (!pos || !pos.count) return 0;
    pass.setVertexBuffer(0, this._buffer(pos, GPUBufferUsage.VERTEX));
    let slot = 1;
    if (!positionOnly) {
      if (hasColor) pass.setVertexBuffer(slot++, this._buffer(geo.attributes.color, GPUBufferUsage.VERTEX));
      if (shaderMat) for (const name in shaderMat.attributes) {
        const a = geo.attributes[name];
        if (!a) { console.warn('missing attribute', name); return 0; }
        pass.setVertexBuffer(slot++, this._buffer(a, GPUBufferUsage.VERTEX));
      }
    }
    if (geo.index) pass.setIndexBuffer(this._buffer(geo.index, GPUBufferUsage.INDEX), geo.index.array instanceof Uint32Array ? 'uint32' : 'uint16');
    return slot;
  }
  _disposeGeometry(g) {
    for (const k in g.attributes) {
      const a = g.attributes[k];
      if (a._shared) continue;
      const b = this._bufs.get(a);
      if (b) { this._freed.unregister(b); b.buf.destroy(); this._bufs.delete(a); }
    }
    if (g.index && !g.attributes.position._shared) { const b = this._bufs.get(g.index); if (b) { this._freed.unregister(b); b.buf.destroy(); this._bufs.delete(g.index); } }
  }
  // the colour and depth views to draw into, made (or remade, after a resize) as needed
  _targetViews(rt) {
    const dev = this.device;
    if (!rt) {
      if (!this._canvasTex) { this._canvasTex = this.context.getCurrentTexture(); this._lastCanvasTex = this._canvasTex; }
      const t = this._canvasTex, w = t.width, h = t.height;
      if (!this._canvasDepth || this._canvasDepth.width !== w || this._canvasDepth.height !== h) {
        if (this._canvasDepth) this._canvasDepth.destroy();
        this._canvasDepth = dev.createTexture({ size: [w, h], format: DEPTH, usage: GPUTextureUsage.RENDER_ATTACHMENT });
        this._canvasDepthView = this._canvasDepth.createView();
      }
      return { color: t.createView(), depth: this._canvasDepthView, format: this.format, width: w, height: h };
    }
    let g = this._rts.get(rt);
    if (!g || g.version !== rt.version) {
      if (g) this._trash.push(g.color, g.depth);
      const w = Math.max(1, rt.width | 0), h = Math.max(1, rt.height | 0), T = GPUTextureUsage;
      const color = dev.createTexture({ size: [w, h], format: COLOR_RT, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING | T.COPY_SRC });
      const depth = dev.createTexture({ size: [w, h], format: DEPTH, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING | T.COPY_SRC });
      g = { color, depth, colorView: color.createView(), depthView: depth.createView(), version: rt.version, id: Math.random() };
      this._rts.set(rt, g);
    }
    return { color: g.colorView, depth: g.depthView, format: COLOR_RT, width: rt.width, height: rt.height };
  }
  // a texture's GPU copy and its sampler
  _texture(t) {
    if (t.isViewTexture) return { view: t.view, sampler: this._sampler(t), id: 'v' + t.id };
    if (t.isRenderTargetTexture || t.isDepthTexture) {
      const rt = t.target;
      this._targetViews(rt);
      const g = this._rts.get(rt);
      return { view: t.isDepthTexture ? g.depthView : g.colorView, sampler: this._sampler(t), id: g.id + (t.isDepthTexture ? 'd' : 'c') };
    }
    let g = this._texs.get(t);
    if (!g || g.version !== t.version) {
      const { data, width, height } = t.image;
      if (!g || g.w !== width || g.h !== height) {
        if (g) g.tex.destroy();
        const tex = this.device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
        g = { tex, view: tex.createView(), w: width, h: height, id: Math.random() };
        this._texs.set(t, g);
      }
      // only the parts that changed, when it says which (regions: [x, y, w, h], emptied once sent)
      if (t.regions && t.regions.length && g.version >= 0) for (const [x, y, w, h] of t.regions) this.device.queue.writeTexture({ texture: g.tex, origin: [x, y] }, data, { offset: (y * width + x) * 4, bytesPerRow: width * 4 }, [w, h]);
      else this.device.queue.writeTexture({ texture: g.tex }, data, { bytesPerRow: width * 4 }, [width, height]);
      if (t.regions) t.regions.length = 0;
      g.version = t.version;
      g.sampler = this._sampler(t);
    }
    return g;
  }
  _sampler(t) {
    const key = t.wrapS + ':' + t.wrapT + ':' + t.magFilter + ':' + t.minFilter;
    this._samplers = this._samplers || new Map();
    let s = this._samplers.get(key);
    if (!s) {
      const wrap = w => w === M.RepeatWrapping ? 'repeat' : 'clamp-to-edge', filt = f => f === M.NearestFilter ? 'nearest' : 'linear';
      s = this.device.createSampler({ addressModeU: wrap(t.wrapS), addressModeV: wrap(t.wrapT), magFilter: filt(t.magFilter), minFilter: filt(t.minFilter) });
      this._samplers.set(key, s);
    }
    return s;
  }
  _module(code) {
    let m = this._modules.get(code);
    if (!m) {
      m = this.device.createShaderModule({ code });
      this._modules.set(code, m);
      if (m.getCompilationInfo) m.getCompilationInfo().then(info => {
        for (const msg of info.messages) if (msg.type === 'error') console.error(`WGSL ${msg.lineNum}:${msg.linePos} ${msg.message}\n` + code.split('\n')[msg.lineNum - 1]);
      });
    }
    return m;
  }
  // a material with keepAlpha blends its colour as usual but leaves the target's alpha as it was (the outline
  // pass reads that alpha as a mark: grass, deep snow)
  _blend(mat) {
    const b = this._blendOf(mat);
    if (b && mat.keepAlpha) b.alpha = { srcFactor: 'zero', dstFactor: 'one', operation: 'add' };
    return b;
  }
  _blendOf(mat) {
    if (mat.blending === M.NoBlending || (mat.blending === M.NormalBlending && !mat.transparent)) return undefined;
    if (mat.blending === M.AdditiveBlending) return { color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' } };
    if (mat.blending === M.CustomBlending) {
      const c = { srcFactor: BLEND_FACTOR[mat.blendSrc], dstFactor: BLEND_FACTOR[mat.blendDst], operation: 'add' };
      return { color: c, alpha: { srcFactor: c.srcFactor.replace('src', 'src-alpha').replace('src-alpha-alpha', 'src-alpha').replace('dst', 'dst-alpha').replace('dst-alpha-alpha', 'dst-alpha'), dstFactor: c.dstFactor.replace(/^src$/, 'src-alpha').replace(/^one-minus-src$/, 'one-minus-src-alpha').replace(/^dst$/, 'dst-alpha').replace(/^one-minus-dst$/, 'one-minus-dst-alpha'), operation: 'add' } };
    }
    return { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } };
  }
  _pipeline(kind, mat, hasColor, format, inst = false) {
    const blend = kind === 'normal' ? undefined : this._blend(mat);
    const cull = kind === 'normal' ? 'none' : mat.side === M.DoubleSide ? 'none' : mat.side === M.BackSide ? 'front' : 'back';
    const depthCompare = !mat.depthTest ? 'always' : kind === 'normal' ? 'less-equal' : DEPTH_FUNC[mat.depthFunc] || 'less-equal';
    const depthWrite = kind === 'normal' ? true : !!mat.depthWrite;
    const writeMask = kind === 'normal' || mat.colorWrite ? GPUColorWrite.ALL : 0;
    const prog = kind === 'shader' ? 'shader' + mat.id : kind;
    const key = [prog, hasColor, inst, JSON.stringify(blend || 0), cull, depthCompare, depthWrite, writeMask, format].join('|');
    let p = this._pipelines.get(key);
    if (p !== undefined) return p;
    const buffers = [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }];
    if (hasColor) buffers.push({ arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] });
    let code, layout = this.layoutMain;
    if (kind === 'shader') {
      const info = this._materialInfo(mat);
      code = info.code;
      layout = info.layout;
      let loc = 2;
      for (const name in mat.attributes) { const [f, s] = ATTR_FORMAT[mat.attributes[name]]; buffers.push({ arrayStride: s, attributes: [{ shaderLocation: loc++, offset: 0, format: f }] }); }
    } else code = builtinCode(kind, hasColor, inst);
    if (inst) buffers.push(INSTANCE_LAYOUT);
    const module = this._module(code);
    try {
      p = this.device.createRenderPipeline({
        layout,
        vertex: { module, entryPoint: 'vs', buffers },
        fragment: { module, entryPoint: 'fs', targets: [{ format, blend, writeMask }] },
        primitive: { topology: 'triangle-list', cullMode: cull, frontFace: 'ccw' },
        depthStencil: { format: DEPTH, depthCompare, depthWriteEnabled: depthWrite },
      });
    } catch (err) { console.error('pipeline', kind, err); p = null; }
    this._pipelines.set(key, p);
    return p;
  }
  _shadowPipeline(side, inst = false) {
    const cull = side === M.DoubleSide ? 'none' : side === M.BackSide ? 'back' : 'front', key = 'shadow|' + cull + '|' + inst;
    let p = this._pipelines.get(key);
    if (p) return p;
    p = this.device.createRenderPipeline({
      layout: this.layoutShadow,
      vertex: { module: this._module(builtinCode('shadow', false, inst)), entryPoint: 'vs', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }].concat(inst ? [INSTANCE_LAYOUT] : []) },
      primitive: { topology: 'triangle-list', cullMode: cull, frontFace: 'ccw' },
      depthStencil: { format: SHADOW_FORMAT, depthCompare: 'less-equal', depthWriteEnabled: true },
    });
    this._pipelines.set(key, p);
    return p;
  }
  // a ShaderMaterial's uniform block, bindings and full WGSL, worked out once
  _materialInfo(mat) {
    let info = this._mats.get(mat);
    if (info) return info;
    // textures can be given among the uniforms, as three takes them, or apart in `textures`
    const isTex = n => { const v = mat.uniforms[n].value; return !!(v && v.isTexture); };
    const names = Object.keys(mat.uniforms).filter(n => !isTex(n)), fields = [];
    let slots = 0;
    const kinds = names.map(n => {
      const v = mat.uniforms[n].value;
      const t = typeof v === 'number' || typeof v === 'boolean' ? 'f32' : v.isColor || v.isVector3 ? 'vec3f' : v.elements ? 'mat4x4f' : v.w !== undefined ? 'vec4f' : 'vec2f';
      fields.push(`  @align(16) ${n}: ${t},`);
      const at = slots; slots += t === 'mat4x4f' ? 4 : 1;
      return { n, t, at };
    });
    const texNames = Object.keys(mat.textures).concat(Object.keys(mat.uniforms).filter(isTex)), S = GPUShaderStage, entries = [], decl = [];
    let b = 0;
    if (names.length) { entries.push({ binding: b, visibility: S.VERTEX | S.FRAGMENT, buffer: { type: 'uniform' } }); decl.push(`struct U_ {\n${fields.join('\n')}\n}\n@group(2) @binding(${b++}) var<uniform> U: U_;`); }
    const texBind = [];
    for (const n of texNames) {
      const t = texOf(mat, n), depth = !!t.isDepthTexture;
      entries.push({ binding: b, visibility: S.VERTEX | S.FRAGMENT, texture: { sampleType: depth ? 'depth' : 'float' } });
      decl.push(`@group(2) @binding(${b}) var ${n}: ${depth ? 'texture_depth_2d' : 'texture_2d<f32>'};`);
      texBind.push({ n, b: b++, depth });
      if (!depth) {
        entries.push({ binding: b, visibility: S.VERTEX | S.FRAGMENT, sampler: { type: 'filtering' } });
        decl.push(`@group(2) @binding(${b}) var ${n}S: sampler;`);
        texBind.push({ n, b: b++, sampler: true });
      }
    }
    const vin = ['  @location(0) position: vec3f,'];
    if (mat.vertexColors) vin.push('  @location(1) color: vec3f,');
    let loc = 2;
    for (const n in mat.attributes) vin.push(`  @location(${loc++}) ${n}: ${mat.attributes[n]},`);
    const code = PRELUDE + decl.join('\n') + `\nstruct VIn {\n${vin.join('\n')}\n}\n` + mat.code;
    const bgl = this.device.createBindGroupLayout({ entries });
    info = { code, kinds, slots, texBind, bgl, layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bglFrame, this.bglObj, bgl] }),
      buf: names.length ? this.device.createBuffer({ size: Math.max(16, slots * 16), usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }) : null,
      data: new Float32Array(Math.max(4, slots * 4)), frame: -1, bg: null, bgKey: '' };
    this._mats.set(mat, info);
    return info;
  }
  _materialBindGroup(mat) {
    const info = this._materialInfo(mat);
    if (info.frame !== this._frameNo && info.buf) {
      info.frame = this._frameNo;
      const d = info.data;
      for (const { n, t, at } of info.kinds) {
        const v = mat.uniforms[n].value, o = at * 4;
        if (t === 'f32') d[o] = +v;
        else if (t === 'vec2f') { d[o] = v.x; d[o + 1] = v.y; }
        else if (t === 'vec3f') { if (v.isColor) { d[o] = v.r; d[o + 1] = v.g; d[o + 2] = v.b; } else { d[o] = v.x; d[o + 1] = v.y; d[o + 2] = v.z; } }
        else if (t === 'vec4f') { d[o] = v.x; d[o + 1] = v.y; d[o + 2] = v.z; d[o + 3] = v.w; }
        else this._setMat(d, o, v);
      }
      this.device.queue.writeBuffer(info.buf, 0, d);
    }
    const res = info.texBind.map(tb => { const t = this._texture(texOf(mat, tb.n)); return tb.sampler ? t.sampler : t.view; });
    const key = info.texBind.map(tb => tb.sampler ? '' : this._texture(texOf(mat, tb.n)).id).join(',');
    if (!info.bg || key !== info.bgKey) {
      info.bgKey = key;
      const entries = [];
      if (info.buf) entries.push({ binding: 0, resource: { buffer: info.buf } });
      info.texBind.forEach((tb, k) => entries.push({ binding: tb.b, resource: res[k] }));
      info.bg = this.device.createBindGroup({ layout: info.bgl, entries });
    }
    return info.bg;
  }
}
