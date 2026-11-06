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
import { PRELUDE, builtinCode, MAX_POINTS, FRAME_BYTES, OBJ_BYTES, GI_GROUND_HEAD, GI_GROUND_FAST } from './shaders.js';

// (v774) the overdraw view's: one added per draw, whatever was there
const OD_BLEND = { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };
// a material's code with its fragment function fs kept (as fs_body, run for its cuts and discards) and a new fs that
// gives 1/64 in red for each pixel it's run on
export function overdrawCode(code) {
  const m = /@fragment\s+fn\s+fs\s*\(/.exec(code);
  if (!m) return code;
  let k = m.index + m[0].length, depth = 1;
  while (k < code.length && depth > 0) { if (code[k] === '(') depth++; else if (code[k] === ')') depth--; k++; }
  const params = code.slice(m.index + m[0].length, k - 1);
  const names = params.split(',').map(p => (/(\w+)\s*:\s*[^:]*$/.exec(p) || [])[1]).filter(Boolean);
  // (only an entry point's parameters and result may carry @location / @builtin: taken off fs_body's)
  const bare = t => t.replace(/@(location|builtin|interpolate|invariant)(\([^)]*\))?\s*/g, '');
  const open = code.indexOf('{', k);
  return code.slice(0, m.index) + 'fn fs_body(' + bare(params) + ')' + bare(code.slice(k, open)) + code.slice(open) +
    `\n@fragment fn fs(${params}) -> @location(0) vec4f { _ = fs_body(${names.join(', ')}); return vec4f(1.0 / 64.0, 0.0, 0.0, 0.0); }\n`;
}
import * as M from './materials.js';

const DEPTH = 'depth32float';
const COLOR_RT = 'rgba16float';   // render targets keep light brighter than white, for eye adaptation and HDR
// (a target's colorFormat overrides it, set before it's first drawn: 'rgba8unorm' halves a phone's memory traffic
// when nothing needs light over white: no eye adaptation, HDR or bloom)
const OBJ_PAGE = 4096;             // object blocks per uniform buffer
const FRAME_SLOTS = 64;
// (v769) recorded draw lists (render bundles): at most this many kept (each its own frame slot, after FRAME_SLOTS)
const BUNDLE_SLOTS = 32;
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
  // (v793) float32-filterable, where it's there, lets the GI's ground heights be read blended in one look (see _module)
  const device = await adapter.requestDevice({ requiredFeatures: ['timestamp-query', 'float32-filterable'].filter(f => adapter.features.has(f)) });
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
    this.info = { draws: 0, passes: 0, submits: 0, canvases: 0, upKB: 0, replayed: 0, recorded: 0, tWalk: 0, tShadow: 0, tRender: 0 };
    // (v768) every send to the GPU and every upload counted, whoever makes it (the game, the GI probes, the potion
    // squares), for the G panel's per-frame counts: work the pass timers can't see
    {
      const q = device.queue, info = this.info, sub = q.submit.bind(q), wb = q.writeBuffer.bind(q), wt = q.writeTexture.bind(q);
      q.submit = (cbs) => { info.submits++; return sub(cbs); };
      q.writeBuffer = (buf, off, data, dOff, size) => {
        const el = data.BYTES_PER_ELEMENT || 1;
        info.upKB += (size !== undefined ? size * el : data.byteLength - (dOff || 0) * el) / 1024;
        return size !== undefined ? wb(buf, off, data, dOff, size) : dOff !== undefined ? wb(buf, off, data, dOff) : wb(buf, off, data);
      };
      q.writeTexture = (dst, data, layout, size) => {
        const h = size[1] ?? size.height ?? 1, d = size[2] ?? size.depthOrArrayLayers ?? 1;
        info.upKB += (layout.bytesPerRow ? layout.bytesPerRow * ((layout.rowsPerImage ?? h) * (d - 1) + h) : data.byteLength - (layout.offset || 0)) / 1024;
        return wt(dst, data, layout, size);
      };
    }
    // (v768) while set, renders into a canvas target wait for the next flush() instead of each sending at once, so a
    // run of them (the potion squares) goes to the GPU in one send
    this.holdFlush = false;
    // (v769) recorded draw lists: each render's opaque draws are recorded once into a render bundle and replayed in
    // later frames while the same meshes stay in view, instead of every draw being encoded anew each frame (see
    // _bundled). Off: every draw is encoded each frame, as before.
    this.bundles = true;
    // (v774) overdraw view: while set, every draw with colour adds 1/64 to the red of its target (additive, depth tested
    // as usual) instead of its colour, through its own fragment code (so cuts and discards still apply): the red, times
    // 64, is how many times each pixel was lit. Recorded lists are left alone meanwhile
    this.overdraw = false;
    // (v776) depth pre-pass: while set, draws write depth only (their own vertex code, a fragment that does nothing,
    // no colour), so a later render of the same meshes lights only what ends up in front. The material's vertex
    // position must be @invariant, so both come out the same to the bit (buildMat's is)
    this.depthPrepass = false;
    this.bundleMargin = 4;   // (world units: how far out of view a mesh is still recorded, see _walk)
    this.sendAfterShadow = false;   // (v795, see render)
    this.shareWalk = true;   // (v795) the camera's walk of the scene done with the shadow map's search for casters (see _renderShadow)
    this._chans = new Map(); this._chanIds = new WeakMap(); this._chanN = 0; this._flushNo = 0; this._walkNo = 0;
    this._time0 = performance.now();
    this._frustum = new Frustum(); this._frustumSh = new Frustum(); this._mSh = new Matrix4(); this._m = new Matrix4(); this._vp = new Matrix4(); this._v = new Vector3(); this._v2 = new Vector3();
    this._pipelines = new Map(); this._modules = new Map();
    this._bufs = new WeakMap(); this._texs = new WeakMap(); this._rts = new WeakMap(); this._mats = new WeakMap(); this._snaps = new WeakMap();
    this.profiler = null;   // a GpuProfiler: each pass is timed under passName (render), its label (compute) or its kind
    this.passName = '';
    this._trash = [];       // textures and buffers dropped mid-frame, destroyed once the frame that may use them is sent
    this._freed = new FinalizationRegistry(b => b.destroy());
    this._frameNo = 0; this._keepFrame = false; this._enc = null; this._pendingClear = null; this._canvasTex = null; this._flushQueued = false;

    const U = GPUBufferUsage, S = GPUShaderStage;
    // (v793) the GI height field read blended by the texture unit (giGround), when float textures can be filtered
    this.hfFilter = !!(device.features && device.features.has('float32-filterable'));
    this.bglFrame = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: S.VERTEX | S.FRAGMENT | S.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: FRAME_BYTES } },
      { binding: 1, visibility: S.FRAGMENT | S.COMPUTE, texture: { sampleType: 'depth' } },
      { binding: 2, visibility: S.FRAGMENT | S.COMPUTE, sampler: { type: 'comparison' } },
      { binding: 3, visibility: S.FRAGMENT | S.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 4, visibility: S.FRAGMENT | S.COMPUTE, sampler: { type: 'filtering' } },
      { binding: 5, visibility: S.FRAGMENT | S.COMPUTE, texture: { sampleType: 'float', viewDimension: '3d' } },
      { binding: 6, visibility: S.FRAGMENT | S.COMPUTE, texture: { sampleType: 'float', viewDimension: '3d' } },
      { binding: 7, visibility: S.FRAGMENT | S.COMPUTE, texture: { sampleType: this.hfFilter ? 'float' : 'unfilterable-float' } },
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

    // (v769: BUNDLE_SLOTS more at the end, one for each recorded draw list's frame, see _bundled)
    this.frameBuf = device.createBuffer({ size: FRAME_BYTES * (FRAME_SLOTS + BUNDLE_SLOTS), usage: U.UNIFORM | U.COPY_DST });
    this.frameData = new Float32Array(FRAME_BYTES * (FRAME_SLOTS + BUNDLE_SLOTS) / 4);
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
    this.eye = null; this.hdr = false; this._hdrAsk = false; this.hdrRefused = false; this.hdrPeak = 0; this.bloom = null;
    this.clipBelow = null;
    // the inside fill (see insideFill): null, or { r, g, b (its light; 0 = off), x0, z0 (the window's first tile), y0, y1,
    // bits: a Uint32Array(32), the window's 32 x 32 tiles a bit each, row by row; key [x, y, z] toward its key light,
    // keyShare, ground (the hemisphere's floor-facing share), even (0..1: only what it adds over the light there),
    // clouds (v861: 1, no cloud shadows within the window's tiles, from y0 up to cloudTop) }
    this.inside = null;   // a world height: the plain and lit materials draw nothing below it while set (a water mirror)
    this.gi = null;
    this._frameBGs = new Map();   // (v771) frame bind groups by what they bind, so a set the probes swap back to is the same object
    this._ensureShadow(512);
    this.frameBGShadow = device.createBindGroup({ layout: this.bglFrameShadow, entries: [{ binding: 0, resource: { buffer: this.frameBuf, size: FRAME_BYTES } }] });
    this._canvasDepth = null;
  }

  // ---- the three-like surface the game calls ----
  setPixelRatio() {}
  getPixelRatio() { return 1; }
  // (only on a change: setting a canvas's size, even to what it is, throws its picture away, and the page can show
  // that blank for a frame)
  setSize(w, h) {
    const W = Math.max(1, w | 0), H = Math.max(1, h | 0), el = this.domElement;
    if (el.width !== W) el.width = W;
    if (el.height !== H) el.height = H;
  }
  setClearColor(c, a = 1) { this.clearColor.set(c); this.clearAlpha = a; }
  setRenderTarget(rt) { this._runPendingClear(); this.target = rt || null; }
  // a second canvas to draw into, see-through where nothing is drawn (the inventory's character view): hand it to
  // setRenderTarget like a render target; each render into it goes to the page as it's sent
  canvasTarget(canvas) {
    const context = canvas.getContext('webgpu');
    context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' });
    if (!this._liveCanvases) this._liveCanvases = new Set();
    return { isCanvasTarget: true, canvas, context, tex: null, depth: null, depthView: null, get width() { return canvas.width; }, get height() { return canvas.height; } };
  }
  getRenderTarget() { return this.target; }
  // clear the current target's colour and depth (done as the next pass on it begins)
  clear() { this._runPendingClear(); this._pendingClear = { target: this.target, color: [this.clearColor.r, this.clearColor.g, this.clearColor.b, this.clearAlpha] }; }
  // the clouds' texture and settings, as { tCloud, cloudOff, cloudScale, cloudAmt, cloudCover, cloudSoft, shadowAmt } of { value }
  setClouds(u) { this.clouds = u; }
  // probe lighting (probes.js): something with views() -> { vis, light, hf, key } and uniforms() -> 12 numbers
  // (the frame's giA, giB, giC), or null
  setGI(gi) { this.gi = gi; this._frameBGs.clear(); }
  // lit haze (haze.js): something with view() -> its texture (a texel a mosaic pixel) or null, uniforms() -> 8
  // numbers (the frame's hazeA, hazeB) and key, or null
  setHaze(h) { this.haze = h; this._frameBGs.clear(); }
  // eye adaptation (exposure.js): something with buffer() -> its state (the exposure first) and on, or null
  setEye(e) { this.eye = e; this._frameBGs.clear(); }
  // bloom (bloom.js): something with view() -> its glow (or null) and uniforms() -> 4 numbers (the frame's bloom)
  // and key, or null
  setBloom(b) { this.bloom = b; this._frameBGs.clear(); }
  // HDR output: on an HDR display, a float canvas whose values above 1 show brighter than white; peak: the
  // brightest highlights, × white's brightness. Off: the usual canvas, everything over white clipped.
  // (v886) If the browser doesn't take the float canvas's 'extended' tone mapping, it goes back to the usual canvas
  // and hdrRefused is set: hdr false, hdrPeak 0, so the picture gets the no-HDR output, not HDR's clipped at white.
  setHDR(on, peak = 3) {
    on = !!on;
    if (on !== !!this._hdrAsk) {
      this._hdrAsk = on; this.hdrRefused = false;
      this._configureCanvas(on);
      const c = on && this.context.getConfiguration ? this.context.getConfiguration() : null;
      if (c && !(c.toneMapping && c.toneMapping.mode === 'extended')) { this.hdrRefused = true; this._configureCanvas(false); }
      this.hdr = on && !this.hdrRefused;
    }
    this.hdrPeak = this.hdr ? Math.max(1, peak) : 0;
  }
  _configureCanvas(hdr) {
    this.format = hdr ? 'rgba16float' : navigator.gpu.getPreferredCanvasFormat();
    const cfg = { device: this.device, format: this.format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC };
    if (hdr) cfg.toneMapping = { mode: 'extended' };
    this.context.configure(cfg);
    this._canvasTex = null;
  }
  // what the browser made of the canvas: its format and tone mapping ('extended' = values over 1 reach an HDR
  // display; 'standard' or none = the browser ignored the HDR request and clips at white)
  hdrState() {
    const c = this.context.getConfiguration ? this.context.getConfiguration() : null;
    return { format: c ? c.format : this.format, toneMapping: c && c.toneMapping ? c.toneMapping.mode || 'standard' : (c ? 'none reported' : 'unknown'), refused: !!this.hdrRefused };
  }
  // the WGSL every pipeline starts with, for compute passes that read the frame
  preludeCode() { return PRELUDE; }
  // record compute work into this frame, after what's been drawn so far: cb(encoder, the frame's bind group, the
  // offset of the last render's frame in it). The bind group leaves the haze out, so a pass can write it.
  // a new command encoder; true when it starts a new frame (_frameNo: the scene walk, lights, material numbers and
  // recorded lists' checks are once a frame), false when it carries on one sent early (sendEarly)
  _newEnc() {
    this._enc = this.device.createCommandEncoder();
    if (this._keepFrame) { this._keepFrame = false; return false; }
    this._frameNo++;
    return true;
  }
  // (v789) send what's encoded so far, so the GPU starts on it while the rest of the frame is encoded; the frame
  // goes on as the same frame (no new scene walk, lights or once-a-frame uploads)
  sendEarly() {
    if (!this._enc) return;
    this._keepFrame = true;
    this.flush();
    this.info.early = (this.info.early || 0) + 1;
  }
  compute(cb) {
    this._runPendingClear();
    this._closePass();
    if (!this._enc) this._newEnc();
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
    this._keepFrame = false;
    this.passName = '';
    const p = this.profiler;
    if (p && p.on) p.watchDone();
    if (!p || !p.names.length) return;
    const enc = this.device.createCommandEncoder();
    p.resolve(enc);
    this.device.queue.submit([enc.finish()]);
    p.read();
  }
  // a copy of a render target's colour and depth as they stand at this point in the frame, for a later pass to
  // read what lies behind it (the water, the bed under it): { color, depth } textures, kept while the size holds
  // (color false: the depth only, for soft particles when nothing reads the colour)
  snapshot(rt, color = true) {
    this._targetViews(rt);
    const g = this._rts.get(rt), w = Math.max(1, rt.width | 0), h = Math.max(1, rt.height | 0), T = GPUTextureUsage;
    let s = this._snaps.get(rt);
    if (!s || s.src !== g) {
      if (s) this._trash.push(s.colorT, s.depthT);
      const colorT = this.device.createTexture({ size: [w, h], format: rt.colorFormat || COLOR_RT, usage: T.TEXTURE_BINDING | T.COPY_DST });
      const depthT = this.device.createTexture({ size: [w, h], format: DEPTH, usage: T.TEXTURE_BINDING | T.COPY_DST });
      const tex = (t, depth) => { const x = new M.Texture(); x.isViewTexture = true; x.isDepthTexture = depth; x.view = t.createView(); return x; };
      s = { src: g, colorT, depthT, color: tex(colorT, false), depth: tex(depthT, true) };
      this._snaps.set(rt, s);
    }
    this._runPendingClear();
    this._closePass();
    if (!this._enc) this._newEnc();
    if (color) this._enc.copyTextureToTexture({ texture: g.color }, { texture: s.colorT }, [w, h]);
    this._enc.copyTextureToTexture({ texture: g.depth }, { texture: s.depthT }, [w, h]);
    return s;
  }
  // a texture's GPU view (a render target's too), and an id that changes when the view does
  textureView(t) { const g = this._texture(t); return { view: g.view, id: g.id }; }

  render(scene, camera) {
    const dev = this.device, tR0 = performance.now();
    if (!this._enc && this._newEnc()) { this.info.draws = 0; this.info.passes = 0; }
    if (this.autoClear && !this._pendingClear) this.clear();
    if (scene.matrixAutoUpdate !== false) scene.updateMatrixWorld();
    if (!camera.parent) camera.updateMatrixWorld();
    const lights = this.lightsOverride || this._gatherLights(scene);
    if (lights.sun && lights.sun.castShadow && this.shadowMap.enabled && (this.shadowMap.autoUpdate || this.shadowMap.needsUpdate)) {
      const t0 = performance.now();
      this._renderShadow(scene, camera, lights.sun);
      this.info.tShadow += performance.now() - t0;
      this.shadowMap.needsUpdate = false;
      // (v795) sendAfterShadow: the shadow map goes to the GPU now, as sendEarly does (the same frame), so the GPU draws
      // it while this render and those after it are encoded; a clear waiting for this render's target is kept for it
      if (this.sendAfterShadow) {
        const pc = this._pendingClear; this._pendingClear = null;
        this.sendEarly();
        this._pendingClear = pc;
        this._newEnc();
      }
    }
    const tgt = this._targetViews(this.target);
    const frameOff = this._writeFrame(camera, lights, scene, tgt);
    this._lastFrameOff = frameOff;
    const list = this._collect(scene, camera);
    const clear = this._pendingClear && this._pendingClear.target === this.target ? this._pendingClear : null;
    this._pendingClear = null;
    // with mergePasses, a render into the same target as the one before it, with nothing in between (no copy,
    // compute, shadow map, clear or send), carries on in the same render pass: a tiled (phone) GPU then doesn't write
    // the whole picture and depth out to memory and read them back between them. Its profiler row joins the pass's.
    const name = this.passName || 'scene';
    let open = this._open, pass;
    if (open && this.mergePasses && !clear && open.target === this.target && open.color === tgt.color && open.enc === this._enc) {
      pass = open.pass;
      const p = this.profiler;
      if (open.ts >= 0 && p && p.names[open.ts] !== undefined && !p.names[open.ts].endsWith(name)) p.names[open.ts] += ' + ' + name;
    } else {
      this._closePass();
      const ts = this._tsw(name);
      pass = this._enc.beginRenderPass({
        colorAttachments: [{ view: tgt.color, loadOp: clear ? 'clear' : 'load', storeOp: 'store', clearValue: clear ? clear.color : undefined }],
        depthStencilAttachment: { view: tgt.depth, depthLoadOp: clear ? 'clear' : 'load', depthStoreOp: 'store', depthClearValue: 1 },
        timestampWrites: ts,
      });
      this.info.passes++; this.info.passTotal = (this.info.passTotal || 0) + 1;
      this._open = open = { pass, target: this.target, color: tgt.color, enc: this._enc, ts: ts && this.profiler ? this.profiler.names.length - 1 : -1 };
    }
    pass.setBindGroup(0, this._frameBindGroup(), [frameOff]);
    const override = scene.overrideMaterial, clip = this.clipBelow != null;
    let lastPipe = null, one = 0;
    const drawList = items => {
      for (const it of items) {
        const mesh = it.mesh, mat = override || mesh.material;
        if (!mat.colorWrite && !mat.depthWrite) continue;
        const geo = mesh.geometry, kind = override && override.isMeshNormalMaterial ? 'normal' : mat.isShaderMaterial ? 'shader' : mat.isMeshStandardMaterial ? 'std' : 'basic';
        const hasColor = kind !== 'normal' && mat.vertexColors && !!geo.attributes.color, inst = !!mesh.isInstancedMesh;
        if (inst && kind === 'shader') continue;
        const pipe = this._pipeline(kind, mat, hasColor, tgt.format, inst, clip && (kind === 'basic' || kind === 'std'));
        if (!pipe) continue;
        if (pipe !== lastPipe) { pass.setPipeline(pipe); lastPipe = pipe; }
        const [bg, off] = this._writeObj(mesh, mat);
        pass.setBindGroup(1, bg, [off]);
        if (kind === 'shader') pass.setBindGroup(2, this._materialBindGroup(mat));
        const slot = this._bindGeometry(pass, geo, kind === 'shader' ? mat : null, hasColor);
        if (!slot) continue;
        if (inst) pass.setVertexBuffer(slot, this._instanceBuffer(mesh));
        this._draw(pass, geo, inst ? mesh.count : geo.instanceCount ?? 1);
        one++;
      }
    };
    // (v769) with recorded draw lists, what comes before the list is drawn first, then the list (a bundle), then the rest
    const B = this.bundles && !this.overdraw && !override && !this.target?.isCanvasTarget ? this._bundled(list, tgt, frameOff, clip, camera) : null;
    if (B) {
      drawList(B.pre);
      pass.executeBundles([B.bundle]);
      pass.setBindGroup(0, this._frameBindGroup(), [frameOff]); lastPipe = null;   // (a bundle leaves the pass's state cleared)
      drawList(B.rest);
    } else drawList(list);
    // (v821) the draws encoded one by one (not in a recorded list), by the render's pass name, for the G panel
    if (one) { const O = this.info.oneBy || (this.info.oneBy = new Map()); O.set(name, (O.get(name) || 0) + one); }
    if (!this.mergePasses) this._closePass();
    this.info.tRender += performance.now() - tR0;
    if (!this.target || (this.target.isCanvasTarget && !this.holdFlush)) this.flush();
    else this._queueFlush();
  }

  // (v769) Recorded draw lists. A render's opaque, plain draws (no instancing, no override, depth tested) are recorded
  // into a render bundle with their own object blocks (a buffer of the list's) and a frame slot of their own (after
  // FRAME_SLOTS), then replayed in later frames for as long as every mesh to be drawn is in the recording and every
  // mesh in the recording is still as recorded: in the scene and showing (this frame's walk marked it), on the
  // camera's layers and through the render's filter, with the same material, pipeline, material bind group,
  // geometry and buffers (no attribute changed). Meshes recorded but now just out of view are drawn anyway (the GPU
  // clips them) until a fifth of the list is like that. Each frame the list's frame is written afresh, and the object
  // blocks (matrices, colours) of the meshes that moved or changed (v795: only those), so moving and changing meshes are
  // right; what's saved is the encoding of every draw. A list is recorded again when anything differs. Returns { pre, bundle, rest }: draw pre the usual way, then
  // the bundle, then rest; or null to draw the whole list the usual way.
  _bundled(list, tgt, frameOff, clip, camera) {
    const ids = this._chanIds, idOf = o => { let v = ids.get(o); if (v === undefined) { v = ++this._chanN; ids.set(o, v); } return v; };
    const f = this.drawFilter;
    const key = idOf(camera) + '|' + camera.layers.mask + '|' + (f ? idOf(f) : 0) + '|' + tgt.format + '|' + (clip ? 1 : 0);
    // (what comes before the first draw that can be recorded, pre, is drawn the usual way before the bundle; from
    // there the bundle takes what can be recorded up to the first draw whose look depends on what was drawn before it
    // (see-through, not writing or not testing depth, another depth test), and everything from that one on is drawn
    // after the bundle, in order, so a draw like the hero's see-through silhouette (drawn first by its renderOrder, where
    // something nearer already stands) still comes before what it's meant to. Draws of nothing (no colour, no depth)
    // are left out: they draw nothing.)
    const pre = [], elig = [], rest = [];
    let i = 0, cutOrder = Infinity;
    const now = performance.now(), bundleable = (m, mat) => !m.isInstancedMesh && m.geometry.instanceCount == null && !mat.noBundle && !(m._bunSkip > now) && this._orderSafe(mat);
    for (; i < list.length; i++) { const m = list[i].mesh; if (bundleable(m, m.material)) break; pre.push(list[i]); }
    for (; i < list.length; i++) {
      const it = list[i], m = it.mesh, mat = m.material;
      if (!mat.colorWrite && !mat.depthWrite) continue;
      if (!this._orderSafe(mat)) { cutOrder = it.order; break; }
      (bundleable(m, mat) ? elig : rest).push(it);
    }
    for (; i < list.length; i++) rest.push(list[i]);
    if (elig.length < 4) return null;
    let ch = this._chans.get(key);
    if (!ch) {
      if (this._chans.size >= BUNDLE_SLOTS) { for (const c of this._chans.values()) if (c.objBuf) this._trash.push(c.objBuf); this._chans.clear(); }
      const used = new Set([...this._chans.values()].map(c => c.slot));
      let slot = 0; while (used.has(slot)) slot++;
      ch = { slot, bundle: null, bgs: new Map(), items: [], index: new Map(), objBuf: null, objBG: null, objCap: 0, objData: null, frameBG: null, flush: -1, stamp: 0, format: tgt.format };
      this._chans.set(key, ch);
    }
    // (the same list twice in one send would share its frame and object blocks: the second is drawn the usual way)
    if (ch.flush === this._flushNo) return null;
    ch.flush = this._flushNo;
    const frameBG = this._frameBindGroup(), L = camera.layers, wn = this._lastWalk;
    // the frame, copied to the list's own slot
    const fo = (FRAME_SLOTS + ch.slot) * FRAME_BYTES;
    this.frameData.copyWithin(fo / 4, frameOff / 4, frameOff / 4 + FRAME_BYTES / 4);
    this.device.queue.writeBuffer(this.frameBuf, fo, this.frameData, fo / 4, FRAME_BYTES / 4);
    // can the recording be replayed?
    let ok = !!ch.bundle, why = ch.bundle ? '' : 'first';
    if (ok) {
      const st = ++ch.stamp;
      for (const it of elig) { const r = ch.index.get(it.mesh); if (!r) { ok = false; why = 'new'; break; } r.seen = st; }
      if (ok) {
        let extra = 0;
        for (const r of ch.items) {
          const m = r.mesh;
          if (r.seen !== st) {
            if (m._wv !== wn || !m.layers.test(L) || (f && !f(m)) || (m._wn !== wn && ++extra * 5 > ch.items.length)) { ok = false; why = 'gone'; break; }
          }
          // (a mesh that changed is drawn the usual way for a while, so one changing every frame doesn't make the
          // whole list be recorded again every frame)
          if (!this._bundleSame(r, m, tgt.format, clip)) { ok = false; why = 'changed'; m._bunSkip = now + 4000; break; }
        }
      }
    }
    if (!ok) { const W = this.info.why || (this.info.why = {}); W[why] = (W[why] || 0) + 1; }
    if (ok) {
      // (v795) only the object blocks that changed since they were last sent: a matrix when the mesh moved (its _mwV,
      // as in _bundledShadow), the material's numbers when one of them differs; sent in runs (a gap of a few unchanged
      // ones is sent along)
      const d = ch.objData, q = this.device.queue, W = OBJ_BYTES / 4;
      let lo = -1, hi = -1, sent = 0;
      for (const r of ch.items) {
        const m = r.mesh, v = m._mwV, o = r.k * W;
        let up = this._objRest(d, o, m, r.mat);
        if (v !== r.mv || v === 0) { r.mv = v; this._setMat(d, o, m.matrixWorld); up = true; }
        if (!up) continue;
        sent++;
        if (lo < 0) lo = hi = r.k;
        else if (r.k - hi > 8) { q.writeBuffer(ch.objBuf, lo * OBJ_BYTES, d, lo * W, (hi - lo + 1) * W); lo = hi = r.k; }
        else hi = r.k;
      }
      if (lo >= 0) q.writeBuffer(ch.objBuf, lo * OBJ_BYTES, d, lo * W, (hi - lo + 1) * W);
      this.info.objSent = (this.info.objSent || 0) + sent; this.info.objKept = (this.info.objKept || 0) + ch.items.length - sent;
      this.info.draws += ch.items.length;
      // (the frame's bind group takes turns between a few (the probe light's two sets): the same list is kept recorded
      // with each, and one not seen yet is recorded from the same list)
      let b = ch.bgs.get(frameBG);
      if (!b) { b = this._encodeItems(ch, frameBG, fo, tgt.format); if (ch.bgs.size >= 4) ch.bgs.clear(); ch.bgs.set(frameBG, b); const W = this.info.why || (this.info.why = {}); W.frame = (W.frame || 0) + 1; this.info.recorded++; }
      else this.info.replayed++;
      ch.bundle = b;
      return { pre, bundle: b, rest };
    }
    // record it afresh: what's to be drawn, and what's just out of view on these layers and through the filter (see _walk)
    // (less a mesh just found changing: drawn the usual way, after the bundle)
    for (let j = elig.length - 1; j >= 0; j--) if (elig[j].mesh._bunSkip > now) rest.unshift(elig.splice(j, 1)[0]);
    const dev = this.device, todo = elig.map(it => it.mesh);
    { const inList = new Set(todo);
      for (const m of this._lastNear) {
        const mat = m.material;
        if (!inList.has(m) && m.layers.test(L) && (!f || f(m)) && !m.isInstancedMesh && this._orderSafe(mat) && m.geometry.instanceCount == null && !mat.noBundle
          && !(m._bunSkip > now) && m.renderOrder - (mat.drawFirst ? 0.5 : 0) < cutOrder) todo.push(m);
      } }
    if (ch.objCap < todo.length) {
      if (ch.objBuf) this._trash.push(ch.objBuf);
      ch.objCap = Math.ceil(todo.length * 1.25 / 64) * 64;
      ch.objBuf = dev.createBuffer({ size: ch.objCap * OBJ_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      ch.objData = new Float32Array(ch.objCap * OBJ_BYTES / 4);
      ch.objBG = dev.createBindGroup({ layout: this.bglObj, entries: [{ binding: 0, resource: { buffer: ch.objBuf, size: OBJ_BYTES } }] });
    }
    const be = dev.createRenderBundleEncoder({ colorFormats: [tgt.format], depthStencilFormat: DEPTH, sampleCount: 1 });
    be.setBindGroup(0, frameBG, [fo]);
    const items = [], index = new Map(), d = ch.objData;
    let lastPipe = null;
    for (const mesh of todo) {
      const mat = mesh.material, geo = mesh.geometry;
      const kind = mat.isShaderMaterial ? 'shader' : mat.isMeshStandardMaterial ? 'std' : 'basic';
      const hasColor = mat.vertexColors && !!geo.attributes.color;
      const pipe = this._pipeline(kind, mat, hasColor, tgt.format, false, clip && (kind === 'basic' || kind === 'std'));
      if (!pipe) continue;
      const k = items.length;
      if (pipe !== lastPipe) { be.setPipeline(pipe); lastPipe = pipe; }
      this._objData(d, k * OBJ_BYTES / 4, mesh, mat);
      be.setBindGroup(1, ch.objBG, [k * OBJ_BYTES]);
      const mbg = kind === 'shader' ? this._materialBindGroup(mat) : null;
      if (mbg) be.setBindGroup(2, mbg);
      const slot = this._bindGeometry(be, geo, kind === 'shader' ? mat : null, hasColor);
      if (!slot) { lastPipe = null; continue; }   // (nothing drawn: the slot's block is left unused)
      this._draw(be, geo, 1);
      const attrs = [geo.attributes.position];
      if (hasColor) attrs.push(geo.attributes.color);
      if (kind === 'shader') for (const n in mat.attributes) attrs.push(geo.attributes[n]);
      if (geo.index) attrs.push(geo.index);
      const r = { mesh, mat, geo, pipe, mbg, kind, hasColor, mv: mesh._mwV, attrs, gbs: attrs.map(a => a._gb), vers: attrs.map(a => a.version), lens: attrs.map(a => a.array.length), k, seen: 0 };
      items.push(r); index.set(mesh, r);
    }
    // (an item skipped above leaves its block to the next: the blocks run 0 to items.length - 1)
    ch.bundle = be.finish(); ch.items = items; ch.index = index; ch.frameBG = frameBG;
    ch.bgs = new Map([[frameBG, ch.bundle]]);
    if (items.length) dev.queue.writeBuffer(ch.objBuf, 0, d, 0, items.length * OBJ_BYTES / 4);
    this.info.recorded++;
    return { pre, bundle: ch.bundle, rest };
  }
  // (v770) a recorded list's items (already checked as they stand) encoded again into a bundle with frame bind group bg
  _encodeItems(ch, bg, fo, format) {
    const be = this.device.createRenderBundleEncoder({ colorFormats: [format], depthStencilFormat: DEPTH, sampleCount: 1 });
    be.setBindGroup(0, bg, [fo]);
    let last = null;
    for (const r of ch.items) {
      if (r.pipe !== last) { be.setPipeline(r.pipe); last = r.pipe; }
      be.setBindGroup(1, ch.objBG, [r.k * OBJ_BYTES]);
      if (r.mbg) be.setBindGroup(2, r.mbg);
      this._bindGeometry(be, r.geo, r.kind === 'shader' ? r.mat : null, r.hasColor);
      if (r.geo.index) be.drawIndexed(r.geo.index.count, 1); else be.draw(r.geo.attributes.position.count, 1);
    }
    return be.finish();
  }
  // (v769) the shadow map's casters as a recorded draw list, as _bundled does for a render: plain casters (no
  // instancing) recorded once and replayed while the same ones cast. Returns the rest.
  // (v786: those with shadow code of their own too (built pieces, folk), with their material's bind group; and a
  // replay sends only the matrices of the casters that moved since, the shadow map's object block being the matrix alone)
  _bundledShadow(pass, casters, frameOff, swn, SL, near) {
    const key = 'shadow|' + SL.mask;
    const elig = [], rest = [];
    const now = performance.now();
    for (const m of casters) (!m.isInstancedMesh && !(m._bunSkip > now) ? elig : rest).push(m);
    if (elig.length < 4) return casters;
    let ch = this._chans.get(key);
    if (!ch) {
      if (this._chans.size >= BUNDLE_SLOTS) { for (const c of this._chans.values()) if (c.objBuf) this._trash.push(c.objBuf); this._chans.clear(); }
      const used = new Set([...this._chans.values()].map(c => c.slot));
      let slot = 0; while (used.has(slot)) slot++;
      ch = { slot, bundle: null, items: [], index: new Map(), objBuf: null, objBG: null, objCap: 0, objData: null, flush: -1, stamp: 0 };
      this._chans.set(key, ch);
    }
    if (ch.flush === this._flushNo) return casters;
    ch.flush = this._flushNo;
    const fo = (FRAME_SLOTS + ch.slot) * FRAME_BYTES;
    this.frameData.copyWithin(fo / 4, frameOff / 4, frameOff / 4 + FRAME_BYTES / 4);
    this.device.queue.writeBuffer(this.frameBuf, fo, this.frameData, fo / 4, FRAME_BYTES / 4);
    let ok = !!ch.bundle, why = ch.bundle ? '' : 'first';
    if (ok) {
      const st = ++ch.stamp;
      for (const m of elig) { const r = ch.index.get(m); if (!r) { ok = false; why = 'new'; break; } r.seen = st; }
      if (ok) {
        let extra = 0;
        for (const r of ch.items) {
          const m = r.mesh, mat = m.material;
          if (r.seen !== st && (m._sv !== swn || (m._sn !== swn && ++extra * 5 > ch.items.length))) { ok = false; why = 'gone'; break; }
          // (v786: the side drawn, not the pipeline looked up again: the same material and side make the same pipeline)
          let same = !(mat !== r.mat || m.geometry !== r.geo || m.isInstancedMesh || (mat.shadowSide ?? mat.side) !== r.side || !!mat.shadowCode !== r.own);
          if (same && r.own) {
            // (once a frame for each material, as in _bundleSame: it sends the material's numbers too)
            if (mat._bgF !== this._frameNo) { mat._bgF = this._frameNo; mat._bgV = this._materialBindGroup(mat); }
            if (mat._bgV !== r.mbg) same = false;
          }
          const A = r.attrs;
          for (let j = 0; same && j < A.length; j++) { const a = A[j]; if (a._gb !== r.gbs[j] || a.version !== r.vers[j] || a.array.length !== r.lens[j]) same = false; }
          if (!same) { ok = false; why = 'changed'; m._bunSkip = now + 4000; break; }
        }
      }
    }
    if (!ok) { const W = this.info.why || (this.info.why = {}); W[why] = (W[why] || 0) + 1; }
    if (ok) {
      // (v786) only the moved casters' matrices, sent in runs (a gap of a few unchanged ones is sent along)
      const d = ch.objData, q = this.device.queue, W = OBJ_BYTES / 4;
      let lo = -1, hi = -1, sent = 0;
      for (const r of ch.items) {
        const v = r.mesh._mwV;
        if (v === r.mv && v !== 0) continue;
        r.mv = v; this._setMat(d, r.k * W, r.mesh.matrixWorld); sent++;
        if (lo < 0) lo = hi = r.k;
        else if (r.k - hi > 8) { q.writeBuffer(ch.objBuf, lo * OBJ_BYTES, d, lo * W, (hi - lo + 1) * W); lo = hi = r.k; }
        else hi = r.k;
      }
      if (lo >= 0) q.writeBuffer(ch.objBuf, lo * OBJ_BYTES, d, lo * W, (hi - lo + 1) * W);
      this.info.shMoved = (this.info.shMoved || 0) + sent;
      pass.executeBundles([ch.bundle]);
      this.info.replayed++; this.info.draws += ch.items.length;
      return rest;
    }
    const dev = this.device;
    for (let j = elig.length - 1; j >= 0; j--) if (elig[j]._bunSkip > now) rest.push(elig.splice(j, 1)[0]);
    // (and the casters just out of the sun's view: see _renderShadow)
    for (const m of near) if (!(m._bunSkip > now)) elig.push(m);
    if (ch.objCap < elig.length) {
      if (ch.objBuf) this._trash.push(ch.objBuf);
      ch.objCap = Math.ceil(elig.length * 1.25 / 64) * 64;
      ch.objBuf = dev.createBuffer({ size: ch.objCap * OBJ_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      ch.objData = new Float32Array(ch.objCap * OBJ_BYTES / 4);
      ch.objBG = dev.createBindGroup({ layout: this.bglObj, entries: [{ binding: 0, resource: { buffer: ch.objBuf, size: OBJ_BYTES } }] });
    }
    const be = dev.createRenderBundleEncoder({ colorFormats: [], depthStencilFormat: SHADOW_FORMAT, sampleCount: 1 });
    be.setBindGroup(0, this.frameBGShadow, [fo]);
    const items = [], index = new Map(), d = ch.objData;
    let last = null;
    for (const mesh of elig) {
      const mat = mesh.material, geo = mesh.geometry, own = !!mat.shadowCode, side = mat.shadowSide ?? mat.side;
      const pipe = own ? this._shadowPipelineMat(mat) : this._shadowPipeline(side, false);
      if (!pipe) continue;
      const k = items.length;
      if (pipe !== last) { be.setPipeline(pipe); last = pipe; }
      this._setMat(d, k * OBJ_BYTES / 4, mesh.matrixWorld);
      be.setBindGroup(1, ch.objBG, [k * OBJ_BYTES]);
      let mbg = null;
      if (own) {
        if (mat._bgF !== this._frameNo) { mat._bgF = this._frameNo; mat._bgV = this._materialBindGroup(mat); }
        mbg = mat._bgV; be.setBindGroup(2, mbg);
      }
      if (!(own ? this._bindGeometry(be, geo, mat, !!mat.vertexColors) : this._bindGeometry(be, geo, null, false, true))) { last = null; continue; }
      this._draw(be, geo, 1);
      const attrs = [geo.attributes.position];
      if (own) { if (mat.vertexColors) attrs.push(geo.attributes.color); for (const n in mat.attributes) attrs.push(geo.attributes[n]); }
      if (geo.index) attrs.push(geo.index);
      const r = { mesh, mat, geo, pipe, side, own, mbg, mv: mesh._mwV, attrs, gbs: attrs.map(a => a._gb), vers: attrs.map(a => a.version), lens: attrs.map(a => a.array.length), k, seen: 0 };
      items.push(r); index.set(mesh, r);
    }
    ch.bundle = be.finish(); ch.items = items; ch.index = index;
    if (items.length) dev.queue.writeBuffer(ch.objBuf, 0, d, 0, items.length * OBJ_BYTES / 4);
    pass.executeBundles([ch.bundle]);
    this.info.recorded++;
    return rest;
  }
  // (v769) a material whose draws look the same whatever was drawn before them: solid, writing depth and keeping
  // the nearest (less or less-equal)
  _orderSafe(mat) {
    return !mat.transparent && mat.depthTest && mat.depthWrite && (mat.depthFunc === M.LessEqualDepth || mat.depthFunc === M.LessDepth || mat.depthFunc === undefined);
  }
  // is recorded item r still what mesh m would draw now?
  _bundleSame(r, m, format, clip) {
    const mat = m.material;
    if (mat !== r.mat || m.geometry !== r.geo || !mat.visible || !this._orderSafe(mat)) return false;
    const hasColor = mat.vertexColors && !!r.geo.attributes.color;
    if (hasColor !== r.hasColor) return false;
    if (this._pipeline(r.kind, mat, hasColor, format, false, clip && (r.kind === 'basic' || r.kind === 'std')) !== r.pipe) return false;
    if (r.mbg) {
      // (once a frame for each material: it sends the material's numbers too)
      if (mat._bgF !== this._frameNo) { mat._bgF = this._frameNo; mat._bgV = this._materialBindGroup(mat); }
      if (mat._bgV !== r.mbg) return false;
    }
    const A = r.attrs;
    for (let j = 0; j < A.length; j++) { const a = A[j]; if (a._gb !== r.gbs[j] || a.version !== r.vers[j] || a.array.length !== r.lens[j]) return false; }
    return true;
  }
  // end the render pass left open for the next render to carry on in (see mergePasses)
  _closePass() {
    const o = this._open;
    if (!o) return;
    this._open = null;
    o.pass.end();
  }
  // send the frame's work
  flush() {
    this._closePass();
    if (!this._enc) return;
    this._runPendingClear();
    const q = this.device.queue;
    if (this.frameSlot) q.writeBuffer(this.frameBuf, 0, this.frameData, 0, this.frameSlot * FRAME_BYTES / 4);
    for (const p of this.objPages) if (p.used) { q.writeBuffer(p.buf, 0, p.data, 0, p.used * OBJ_BYTES / 4); p.used = 0; }
    q.submit([this._enc.finish()]);
    this._flushNo++;
    for (const t of this._trash) t.destroy();
    this._trash.length = 0;
    this._enc = null; this.frameSlot = 0; this.objSlot = 0; this._canvasTex = null;
    if (this._liveCanvases) { for (const c of this._liveCanvases) c.tex = null; this._liveCanvases.clear(); }
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
    this._closePass();
    if (!this._enc) this._newEnc();
    const tgt = this._targetViews(c.target);
    this._enc.beginRenderPass({
      colorAttachments: [{ view: tgt.color, loadOp: 'clear', storeOp: 'store', clearValue: c.color }],
      depthStencilAttachment: { view: tgt.depth, depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 1 },
      timestampWrites: this._tsw('clear'),
    }).end();
    if (!c.target || c.target.isCanvasTarget) this.flush(); else this._queueFlush();
  }
  // (found once a frame: every render in it shares them)
  _gatherLights(scene) {
    if (this._lights && this._lights.frame === this._frameNo && this._lights.scene === scene) return this._lights.L;
    const L = { hemi: null, sun: null, points: [] };
    this._lights = { frame: this._frameNo, scene, L };
    scene.traverse(o => {
      if (!o.isLight || !o.visible) return;
      if (o._mwH) o.updateMatrixWorld();   // (v780: shown since the scene's matrix pass left it hidden)
      if (o.isHemisphereLight) { if (!L.hemi) L.hemi = o; }
      else if (o.isDirectionalLight) { if (!L.sun) L.sun = o; }
      else if (o.isPointLight && L.points.length < MAX_POINTS) L.points.push(o);
    });
    return L;
  }
  _ensureShadow(size) {
    if (size === this.shadowSize) return;
    if (this.shadowTex) this._trash.push(this.shadowTex);
    this.shadowSize = size;
    this.shadowTex = this.device.createTexture({ size: [size, size], format: SHADOW_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.shadowView = this.shadowTex.createView();
    this._frameBGs.clear();
  }
  _frameBindGroup(noHaze = false) {
    const ct = this.clouds && this.clouds.tCloud && this.clouds.tCloud.value, cloud = ct ? this._texture(ct) : null;
    const gv = this.gi ? this.gi.views() : null;
    const hv = this.haze && !noHaze ? this.haze.view() : null, eb = this.eye && !noHaze ? this.eye.buffer() : null;
    const bv = this.bloom && !noHaze ? this.bloom.view() : null;
    const key = this.shadowSize + ':' + (cloud ? cloud.id : 'w') + ':' + (gv ? gv.key : '-') + ':' + (hv ? this.haze.key : '-') + ':' + (eb ? 'e' : '-') +
      ':' + (bv ? this.bloom.key : '-');
    // (v771) kept by key, not only the last one: the probes swap between two texture sets frame to frame, and a new
    // bind group each time made every recorded draw list (bundles are tied to the bind group) encode again
    const k = (noHaze ? 'n' : 'h') + key;
    let bg = this._frameBGs.get(k);
    if (!bg) {
      if (this._frameBGs.size >= 16) this._frameBGs.clear();
      bg = this.device.createBindGroup({ layout: this.bglFrame, entries: [
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
      this._frameBGs.set(k, bg);
    }
    return bg;
  }
  _frameSlotAlloc() {
    if (this.frameSlot >= FRAME_SLOTS) this.flush();
    if (!this._enc) this._newEnc();
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
    // (lightsOverride.plain: a studio shot, the character view, lit by its own lights only: no fog, cloud shade,
    // probe light or haze from wherever the scene's camera happens to be)
    const plain = !!L.plain, fog = plain ? null : scene.fog;
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
    const C = plain ? null : this.clouds;
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
    const g = this.gi && !plain ? this.gi.uniforms() : null, go = o + 112 + MAX_POINTS * 8;
    for (let i = 0; i < 12; i++) d[go + i] = g ? g[i] : 0;
    const hz = !plain && this.haze && this.haze.view() ? this.haze.uniforms() : null;
    for (let i = 0; i < 8; i++) d[go + 12 + i] = hz ? hz[i] : 0;
    d[go + 20] = this.eye && this.eye.on && !plain ? 1 : 0;   // (and no eye: the studio shot is the same by day and night)
    d[go + 21] = plain ? 0 : this.hdrPeak; d[go + 22] = this.clipBelow ?? 0; d[go + 23] = this.clipBelow != null ? 1 : 0;   // (post.w: clipping, for ShaderMaterials that honour it)   // (the character view's canvas is plain sRGB: no HDR)
    const bl = this.bloom && this.bloom.view() ? this.bloom.uniforms() : null;
    for (let i = 0; i < 4; i++) d[go + 24 + i] = bl ? bl[i] : 0;
    const ins = plain ? null : this.inside, du = this._frameU || (this._frameU = new Uint32Array(d.buffer, d.byteOffset, d.length));
    // (v861: the window is also written while only the clouds are kept out of it, ins.clouds, the fill off or faded)
    const fillOn = ins && (ins.r > 0 || ins.g > 0 || ins.b > 0);
    if (ins && (fillOn || ins.clouds > 0)) {
      d[go + 28] = ins.r; d[go + 29] = ins.g; d[go + 30] = ins.b; d[go + 31] = fillOn ? 1 : 0;
      d[go + 32] = ins.x0; d[go + 33] = ins.z0; d[go + 34] = ins.y0; d[go + 35] = ins.y1;
      for (let i = 0; i < 32; i++) du[go + 36 + i] = ins.bits[i];
      const kd = ins.key || [0, 1, 0];
      d[go + 68] = kd[0]; d[go + 69] = kd[1]; d[go + 70] = kd[2]; d[go + 71] = ins.ground ?? 1;
      d[go + 72] = ins.keyShare ?? 0; d[go + 73] = ins.even ?? 0; d[go + 74] = ins.clouds ?? 0; d[go + 75] = ins.cloudTop ?? ins.y1;
    } else { d[go + 31] = 0; d[go + 74] = 0; }
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
    this._objData(page.data, k * OBJ_BYTES / 4, mesh, mat);
    return [page.bg, k * OBJ_BYTES];
  }
  // a mesh's object block (its matrix and material numbers) into d at o
  _objData(d, o, mesh, mat) {
    this._setMat(d, o, mesh.matrixWorld);
    this._objRest(d, o, mesh, mat);
  }
  // (v795) the block's material numbers (all but the matrix) into d at o; true if any differ from what was there
  _objRest(d, o, mesh, mat) {
    const t = this._objT || (this._objT = new Float32Array(12));
    const c = mat.color;
    if (c) { t[0] = c.r; t[1] = c.g; t[2] = c.b; } else { t[0] = t[1] = t[2] = 1; }
    t[3] = mat.opacity;
    const e = mat.emissive, ei = mat.emissiveIntensity ?? 1;
    if (e) { t[4] = e.r * ei; t[5] = e.g * ei; t[6] = e.b * ei; } else { t[4] = t[5] = t[6] = 0; }
    t[7] = mesh.receiveShadow ? 1 : 0;
    t[8] = mat.metalness ?? 0; t[9] = mat.roughness ?? 1;
    t[10] = mesh.objX ?? 0; t[11] = 0;   // (objX: a number of the mesh's own for its ShaderMaterial, O.pbr.z)
    let changed = false;
    for (let i = 0; i < 12; i++) if (d[o + 16 + i] !== t[i]) { d[o + 16 + i] = t[i]; changed = true; }
    return changed;
  }
  // what the camera's layers can see, sorted for drawing
  // What a render draws: the scene is walked once a frame for a camera (every layer, culled and sorted), and each
  // render takes the meshes on its camera's layers from that, in the same order. (A scene with an override
  // material is walked for each render, as before.)
  _collect(scene, camera) {
    if (scene.overrideMaterial) return this._walk(scene, camera, true);
    // (kept for each camera drawn this frame, so a second camera's render between two of the first's, such as the
    // game's mirrored water camera, doesn't make the scene be walked again for the first)
    const S = this._seenFor(scene);
    let c = S.by.get(camera);
    if (!c) { const t0 = performance.now(); c = { list: this._walk(scene, camera, false), walk: this._walkNo }; S.by.set(camera, c); this.info.tWalk += performance.now() - t0; }
    this._lastWalk = c.walk; this._lastNear = c.list.near || [];
    const out = [], L = camera.layers;
    // (drawFilter: when set, only what it passes is drawn: the profiler's split of one render into parts)
    const f = this.drawFilter;
    for (const it of c.list) if (it.mesh.layers.test(L) && (!f || f(it.mesh))) out.push(it);
    return out;
  }
  // this frame's walks of the scene, by camera
  _seenFor(scene) {
    let S = this._seen;
    if (!S || S.frame !== this._frameNo || S.scene !== scene) S = this._seen = { frame: this._frameNo, scene, by: new Map() };
    return S;
  }
  // (v795) sh: the shadow map's search for casters (see _renderShadow) done in the same pass over the scene, when set:
  // { fr, swn, SL, margin, casters, near }. What each finds is as if walked apart: the camera's walk doesn't go into a
  // hidden object, the casters' goes into one that still casts (castHidden).
  _walk(scene, camera, layered, sh = null) {
    const fr = this._frustum.setFromProjectionMatrix(this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    // (v769) every mesh this walk finds showing, in view or not, is marked with its number (_wv): a recorded draw
    // list may go on drawing one that's just out of view, but never one that's hidden or gone from the scene
    const wn = layered ? -1 : ++this._walkNo, near = [];
    const opaque = [], clear = [], override = scene.overrideMaterial, vp = this._m, v = this._v;
    const sfr = sh && sh.fr, swn = sh ? sh.swn : 0, SL = sh && sh.SL, sm = sh ? sh.margin : 0, casters = sh && sh.casters, sNear = sh && sh.near;
    const visit = (o, show) => {
      if (!o.visible) { if (!sh || !o.castHidden) return; show = false; }
      // (v778) a mesh the scene's matrix pass left while hidden (scene.js _mwH), shown since: its matrices made now
      if (o._mwH) o.updateMatrixWorld();
      if (sh && o.isMesh && o.castShadow && o.layers.test(SL) && o.material && !(o.isInstancedMesh && !o.count)) {
        o._sv = swn;
        const cls = !o.frustumCulled ? 2 : this._frustumClass(o, sfr, o.isInstancedMesh ? 0 : sm);
        if (cls === 2) casters.push(o);
        else if (cls === 1) { o._sn = swn; sNear.push(o); }
      }
      if (show && o.isMesh && (!layered || o.layers.test(camera.layers)) && !(o.isInstancedMesh && !o.count)) {
        const mat = override || o.material;
        if (mat && mat.visible && wn >= 0) o._wv = wn;
        // (v769) just out of view (within bundleMargin of it): kept in a recorded draw list (marked _wn and listed in
        // near), so one coming into view as the camera moves is already recorded
        // (v786: in view, near or out found in one look, the mesh's world sphere kept from frame to frame)
        const cls = !mat || !mat.visible ? 0 : !o.frustumCulled ? 2 : this._frustumClass(o, fr, wn >= 0 && this.bundles && !mat.transparent ? this.bundleMargin : 0);
        if (cls === 1) { o._wn = wn; near.push(o); }
        else if (cls === 2) {
          const e = o.matrixWorld.elements;
          v.set(e[12], e[13], e[14]).applyMatrix4(vp);
          // (drawFirst: opaque things drawn before the rest at their renderOrder, as roofs are, so what they cover fails
          // the depth test before it's shaded)
          (mat.transparent ? clear : opaque).push({ mesh: o, z: v.z, order: o.renderOrder - (mat.drawFirst ? 0.5 : 0), mid: mat.id });
        }
      }
      const ch = o.children;
      for (let i = 0; i < ch.length; i++) visit(ch[i], show);
    };
    visit(scene, true);
    opaque.sort((a, b) => a.order - b.order || a.mid - b.mid || a.z - b.z);
    clear.sort((a, b) => a.order - b.order || b.z - a.z);
    const out = opaque.concat(clear);
    out.near = near;
    return out;
  }
  _inFrustum(mesh, fr, extra = 0) {
    const w = this._worldSphere(mesh);
    return !!w && fr.sphereClass(w.x, w.y, w.z, w.r + extra, 0) === 2;
  }
  // (v786) in view (2), just out of it (within m: 1) or out (0), in one look
  _frustumClass(mesh, fr, m = 0) {
    const w = this._worldSphere(mesh);
    return w ? fr.sphereClass(w.x, w.y, w.z, w.r, m) : 0;
  }
  // (v786) a mesh's bounding sphere in the world, kept until it moves (its _mwV, scene.js) or its geometry's sphere is
  // another (a new geometry, or one worked out again); null without positions
  _worldSphere(mesh) {
    const geo = mesh.geometry;
    if (!geo || !geo.attributes.position) return null;
    const s = geo.boundingSphere || geo.computeBoundingSphere(), v = mesh._mwV;
    let w = mesh._ws;
    if (w && w.v === v && w.s === s && v !== 0) return w;
    if (!w) w = mesh._ws = { v: 0, s: null, x: 0, y: 0, z: 0, r: 0 };
    const e = mesh.matrixWorld.elements;
    w.x = e[0] * s.x + e[4] * s.y + e[8] * s.z + e[12]; w.y = e[1] * s.x + e[5] * s.y + e[9] * s.z + e[13]; w.z = e[2] * s.x + e[6] * s.y + e[10] * s.z + e[14];
    w.r = s.r * mesh.matrixWorld.getMaxScaleOnAxis(); w.v = v; w.s = s;
    return w;
  }
  // (casters are the meshes on the camera's layers, or on shadowLayers when that's set)
  _renderShadow(scene, camera, sun) {
    this._closePass();
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
    const fr = this._frustumSh.setFromProjectionMatrix(this._mSh.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const casters = [], near = [], swn = ++this._walkNo, SL = this.shadowLayers || camera.layers;
    // (castHidden: a hidden mesh that still casts, e.g. an upper story hidden while you're under it)
    // (v769: every caster found, in the sun's view or not, is marked _sv with this walk's number, for _bundledShadow)
    const I = this.info, t0 = performance.now(), margin = this.bundles ? this.bundleMargin : 0;
    // (v795) when this render's camera hasn't walked the scene yet this frame, its walk is done now along with this one
    // (one pass over the scene, not two), and kept for its render, as _collect would
    const seen = this._seenFor(scene);
    if (this.shareWalk && !scene.overrideMaterial && !seen.by.has(camera)) {
      const list = this._walk(scene, camera, false, { fr, swn, SL, margin, casters, near });
      seen.by.set(camera, { list, walk: this._walkNo });
      I.shared = (I.shared || 0) + 1;
    } else {
      const visit = o => {
        if (!o.visible && !o.castHidden) return;
        if (o._mwH) o.updateMatrixWorld();
        if (o.isMesh && o.castShadow && o.layers.test(SL) && o.material && !(o.isInstancedMesh && !o.count)) {
          o._sv = swn;
          // (v786: in view, near or out in one look, as in _walk)
          const cls = !o.frustumCulled ? 2 : this._frustumClass(o, fr, o.isInstancedMesh ? 0 : margin);
          if (cls === 2) casters.push(o);
          else if (cls === 1) { o._sn = swn; near.push(o); }
        }
        const ch = o.children;
        for (let i = 0; i < ch.length; i++) visit(ch[i]);
      };
      visit(scene);
    }
    const t1 = performance.now();
    // (v786, for the G rows: the casters found, the recorded list's time, and the time and count of those drawn one by one)
    I.tShFind = (I.tShFind || 0) + t1 - t0;
    I.casters = casters.length; if (this.keepCasters) this.lastCasters = casters;
    const pass = this._enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: this.shadowView, depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 1 }, timestampWrites: this._tsw('shadow map') });
    this.info.passes++; this.info.passTotal = (this.info.passTotal || 0) + 1;
    let rest = casters;
    if (this.bundles) rest = this._bundledShadow(pass, casters, slot * FRAME_BYTES, swn, SL, near);
    const t2 = performance.now();
    I.tShList = (I.tShList || 0) + t2 - t1;
    I.shOne = (I.shOne || 0) + rest.length;
    pass.setBindGroup(0, this.frameBGShadow, [slot * FRAME_BYTES]);
    let last = null;
    for (const mesh of rest) {
      const mat = mesh.material, inst = !!mesh.isInstancedMesh, own = !inst && !!mat.shadowCode;
      const pipe = own ? this._shadowPipelineMat(mat) : this._shadowPipeline(mat.shadowSide ?? mat.side, inst);
      if (!pipe) continue;
      if (pipe !== last) { pass.setPipeline(pipe); last = pipe; }
      const [bg, off] = this._writeObj(mesh, mat);
      pass.setBindGroup(1, bg, [off]);
      if (own) pass.setBindGroup(2, this._materialBindGroup(mat));
      const slot = own ? this._bindGeometry(pass, mesh.geometry, mat, !!mat.vertexColors) : this._bindGeometry(pass, mesh.geometry, null, false, true);
      if (!slot) continue;
      if (inst) pass.setVertexBuffer(slot, this._instanceBuffer(mesh));
      this._draw(pass, mesh.geometry, inst ? mesh.count : 1);
    }
    pass.end();
    I.tShOne = (I.tShOne || 0) + performance.now() - t2;
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
      if (b) { this._freed.unregister(b); this._trash.push(b.buf); }
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
    if (b && b.version === attr.version && b.length === attr.array.length) { attr._gb = b; return b.buf; }
    const arr = attr.array, bytes = Math.ceil(arr.byteLength / 4) * 4;
    if (!b || b.size < bytes) {
      if (b) { this._freed.unregister(b); this._trash.push(b.buf); }
      const buf = this.device.createBuffer({ size: Math.max(4, bytes), usage: usage | GPUBufferUsage.COPY_DST });
      b = { buf, size: Math.max(4, bytes) };
      this._bufs.set(attr, b);
      this._freed.register(attr, buf, b);
    }
    if (arr.byteLength % 4) { const pad = new Uint8Array(bytes); pad.set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)); this.device.queue.writeBuffer(b.buf, 0, pad); }
    else this.device.queue.writeBuffer(b.buf, 0, arr.buffer, arr.byteOffset, arr.byteLength);
    b.version = attr.version; b.length = arr.length;
    attr._gb = b;
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
      a._gb = null;
    }
    if (g.index && !g.attributes.position._shared) { const b = this._bufs.get(g.index); if (b) { this._freed.unregister(b); b.buf.destroy(); this._bufs.delete(g.index); } g.index._gb = null; }
  }
  // the colour and depth views to draw into, made (or remade, after a resize) as needed
  _targetViews(rt) {
    const dev = this.device;
    if (rt && rt.isCanvasTarget) {
      if (!rt.tex) { const t0 = performance.now(); rt.tex = rt.context.getCurrentTexture(); this.info.canvases++; this.info.texWait = (this.info.texWait || 0) + performance.now() - t0; this._liveCanvases.add(rt); }
      const t = rt.tex, w = t.width, h = t.height;
      if (!rt.depth || rt.depth.width !== w || rt.depth.height !== h) {
        if (rt.depth) this._trash.push(rt.depth);
        rt.depth = dev.createTexture({ size: [w, h], format: DEPTH, usage: GPUTextureUsage.RENDER_ATTACHMENT });
        rt.depthView = rt.depth.createView();
      }
      return { color: t.createView(), depth: rt.depthView, format: this.format, width: w, height: h };
    }
    if (!rt) {
      if (!this._canvasTex) { const t0 = performance.now(); this._canvasTex = this.context.getCurrentTexture(); this.info.canvases++; this.info.texWait = (this.info.texWait || 0) + performance.now() - t0; this._lastCanvasTex = this._canvasTex; }
      const t = this._canvasTex, w = t.width, h = t.height;
      if (!this._canvasDepth || this._canvasDepth.width !== w || this._canvasDepth.height !== h) {
        if (this._canvasDepth) this._trash.push(this._canvasDepth);
        this._canvasDepth = dev.createTexture({ size: [w, h], format: DEPTH, usage: GPUTextureUsage.RENDER_ATTACHMENT });
        this._canvasDepthView = this._canvasDepth.createView();
      }
      return { color: t.createView(), depth: this._canvasDepthView, format: this.format, width: w, height: h };
    }
    let g = this._rts.get(rt);
    if (!g || g.version !== rt.version) {
      if (g) this._trash.push(g.color, g.depth);
      const w = Math.max(1, rt.width | 0), h = Math.max(1, rt.height | 0), T = GPUTextureUsage;
      const color = dev.createTexture({ size: [w, h], format: rt.colorFormat || COLOR_RT, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING | T.COPY_SRC });
      const depth = dev.createTexture({ size: [w, h], format: DEPTH, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING | T.COPY_SRC });
      g = { color, depth, colorView: color.createView(), depthView: depth.createView(), version: rt.version, id: Math.random() };
      this._rts.set(rt, g);
    }
    return { color: g.colorView, depth: g.depthView, format: rt.colorFormat || COLOR_RT, width: rt.width, height: rt.height };
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
        if (g) this._trash.push(g.tex);
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
    // (shadowTaps 5: the sun's shadow from 5 of the 17 PCF taps, for phones; set before the first draw)
    if (this.shadowTaps === 5) code = code.replace('for (var i = 0; i < 17; i++) { sum += textureSampleCompareLevel(shadowMap, shadowSamp, s.xy + PCF[i] * r, z); }\n  return sum / 17.0;',
      [3, 5, 8, 11, 13].map(i => `sum += textureSampleCompareLevel(shadowMap, shadowSamp, s.xy + PCF[${i}] * r * 1.4, z);`).join(' ') + '\n  return sum / 5.0;');
    // (v793, same look) the GI's ground height at a point (giGround, 4 texel reads blended by hand) read in one
    // look blended by the texture unit, where the four texels are all in the height field's window (the same ring
    // the reads wrap round: the sampler repeats); at its edge, the reads as before
    if (this.hfFilter) code = code.replace(GI_GROUND_HEAD, GI_GROUND_HEAD + GI_GROUND_FAST);
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
  // (v589) the pipeline for a draw, remembered on its material: every draw used to build the full key below (the blend
  // worked out afresh, JSON.stringify, a join) just to look it up, a good share of the frame's encoding time. The
  // memo is kept by kind/colour/copies/clip and target format, and checked against the material's settings the key
  // is made from, so changing any of them still finds (or makes) the right pipeline.
  _pipeline(kind, mat, hasColor, format, inst = false, clip = false) {
    const memo = mat._pipeMemo || (mat._pipeMemo = new Map());
    let byFmt = memo.get(format);
    if (!byFmt) memo.set(format, byFmt = []);
    const k = (kind === 'shader' ? 0 : kind === 'std' ? 1 : kind === 'basic' ? 2 : 3) | (hasColor ? 4 : 0) | (inst ? 8 : 0) | (clip ? 16 : 0) | (this.overdraw ? 32 : 0) | (this.depthPrepass ? 64 : 0);
    const e = byFmt[k];
    if (e && e.blending === mat.blending && e.blendSrc === mat.blendSrc && e.blendDst === mat.blendDst && e.keepAlpha === mat.keepAlpha
      && e.transparent === mat.transparent && e.side === mat.side && e.depthTest === mat.depthTest && e.depthFunc === mat.depthFunc
      && e.depthWrite === mat.depthWrite && e.colorWrite === mat.colorWrite) return e.p;
    const p = this._pipelineKeyed(kind, mat, hasColor, format, inst, clip);
    byFmt[k] = { p, blending: mat.blending, blendSrc: mat.blendSrc, blendDst: mat.blendDst, keepAlpha: mat.keepAlpha, transparent: mat.transparent,
      side: mat.side, depthTest: mat.depthTest, depthFunc: mat.depthFunc, depthWrite: mat.depthWrite, colorWrite: mat.colorWrite };
    return p;
  }
  _pipelineKeyed(kind, mat, hasColor, format, inst = false, clip = false) {
    const blend = kind === 'normal' ? undefined : this._blend(mat);
    const cull = kind === 'normal' ? 'none' : mat.side === M.DoubleSide ? 'none' : mat.side === M.BackSide ? 'front' : 'back';
    const depthCompare = !mat.depthTest ? 'always' : kind === 'normal' ? 'less-equal' : DEPTH_FUNC[mat.depthFunc] || 'less-equal';
    const depthWrite = kind === 'normal' ? true : !!mat.depthWrite;
    const pre = this.depthPrepass && kind !== 'normal';
    const writeMask = pre ? 0 : kind === 'normal' || mat.colorWrite ? GPUColorWrite.ALL : 0;
    const prog = kind === 'shader' ? 'shader' + mat.id : kind;
    const od = this.overdraw && !pre && kind !== 'normal' && writeMask !== 0;
    const key = [prog, hasColor, inst, JSON.stringify(blend || 0), cull, depthCompare, depthWrite, writeMask, format, clip, od, pre].join('|');
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
    } else code = builtinCode(kind, hasColor, inst, clip);
    if (od) code = overdrawCode(code);
    if (pre) code += '\n@fragment fn fs_prepass() -> @location(0) vec4f { return vec4f(0.0); }\n';
    if (inst) buffers.push(INSTANCE_LAYOUT);
    const module = this._module(code);
    try {
      p = this.device.createRenderPipeline({
        layout,
        vertex: { module, entryPoint: 'vs', buffers },
        fragment: { module, entryPoint: pre ? 'fs_prepass' : 'fs', targets: [{ format, blend: pre ? undefined : od ? OD_BLEND : blend, writeMask }] },
        primitive: { topology: 'triangle-list', cullMode: cull, frontFace: 'ccw' },
        depthStencil: { format: DEPTH, depthCompare, depthWriteEnabled: pre || depthWrite },
      });
    } catch (err) { console.error('pipeline', kind, err); p = null; }
    this._pipelines.set(key, p);
    return p;
  }
  // a ShaderMaterial with shadowCode (its own vertex function vs, returning the clip position) is drawn into the
  // shadow map with that, its uniforms and every attribute bound as for the material itself (buildMat: the walls
  // the cutaway lowers cast a lowered shadow)
  _shadowPipelineMat(mat) {
    // (shadowSide: the side the shadow map draws, when it isn't the material's own: buildMat culls back faces on
    // screen but casts from both, as it always has)
    const side = mat.shadowSide ?? mat.side;
    const cull = side === M.DoubleSide ? 'none' : side === M.BackSide ? 'back' : 'front', key = 'shadowM|' + mat.id + '|' + cull;
    let p = this._pipelines.get(key);
    if (p !== undefined) return p;
    const info = this._materialInfo(mat);
    const buffers = [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }];
    if (mat.vertexColors) buffers.push({ arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] });
    let loc = 2;
    for (const name in mat.attributes) { const [f, s] = ATTR_FORMAT[mat.attributes[name]]; buffers.push({ arrayStride: s, attributes: [{ shaderLocation: loc++, offset: 0, format: f }] }); }
    try {
      p = this.device.createRenderPipeline({
        layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bglFrameShadow, this.bglObj, info.bgl] }),
        vertex: { module: this._module(builtinCode('shadow', false, false).replace(/struct VIn[\s\S]*$/, '') + info.head + mat.shadowCode), entryPoint: 'vs', buffers },
        // (shadowFrag: the shadowCode also has a fragment function fs, with no outputs, that may discard: a felled
        // tree's dissolving leaves)
        ...(mat.shadowFrag ? { fragment: { module: this._module(builtinCode('shadow', false, false).replace(/struct VIn[\s\S]*$/, '') + info.head + mat.shadowCode), entryPoint: 'fs', targets: [] } } : {}),
        primitive: { topology: 'triangle-list', cullMode: cull, frontFace: 'ccw' },
        depthStencil: { format: SHADOW_FORMAT, depthCompare: 'less-equal', depthWriteEnabled: true },
      });
    } catch (err) { console.error('shadow pipeline', err); p = null; }
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
      // (a Float32Array is an array of vec4f, its length a multiple of 4)
      const arr = v instanceof Float32Array;
      const t = arr ? `array<vec4f, ${v.length >> 2}>` : typeof v === 'number' || typeof v === 'boolean' ? 'f32' : v.isColor || v.isVector3 ? 'vec3f' : v.elements ? 'mat4x4f' : v.w !== undefined ? 'vec4f' : 'vec2f';
      fields.push(`  @align(16) ${n}: ${t},`);
      const at = slots; slots += arr ? v.length >> 2 : t === 'mat4x4f' ? 4 : 1;
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
    // (storage: { name: { buffer (a GPUBuffer), type (its WGSL type, e.g. 'array<FxP>') } }, read-only buffers the
    // shader reads, the particles' (particles.js); the code declares any struct they hold)
    const stoBind = [];
    for (const n in mat.storage || {}) {
      entries.push({ binding: b, visibility: S.VERTEX | S.FRAGMENT, buffer: { type: 'read-only-storage' } });
      decl.push(`@group(2) @binding(${b}) var<storage, read> ${n}: ${mat.storage[n].type};`);
      stoBind.push({ n, b: b++ });
    }
    const vin = ['  @location(0) position: vec3f,'];
    if (mat.vertexColors) vin.push('  @location(1) color: vec3f,');
    let loc = 2;
    for (const n in mat.attributes) vin.push(`  @location(${loc++}) ${n}: ${mat.attributes[n]},`);
    const head = decl.join('\n') + `\nstruct VIn {\n${vin.join('\n')}\n}\n`;
    const code = PRELUDE + head + mat.code;
    const bgl = this.device.createBindGroupLayout({ entries });
    info = { code, head, kinds, slots, texBind, stoBind, bgl, layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bglFrame, this.bglObj, bgl] }),
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
        if (v instanceof Float32Array) d.set(v, o);
        else if (t === 'f32') d[o] = +v;
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
      for (const sb of info.stoBind) entries.push({ binding: sb.b, resource: { buffer: mat.storage[sb.n].buffer } });
      info.bg = this.device.createBindGroup({ layout: info.bgl, entries });
    }
    return info.bg;
  }
}
