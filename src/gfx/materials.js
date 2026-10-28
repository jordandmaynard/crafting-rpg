// Materials say how a mesh is drawn: lit (standard), unlit (basic), its own WGSL (shader), or as its
// surface normals (for the crease outline). Also textures and the render targets drawn into.
import { Color } from './math.js';

export const FrontSide = 0, BackSide = 1, DoubleSide = 2;
export const NoBlending = 0, NormalBlending = 1, AdditiveBlending = 2, CustomBlending = 5;
export const AddEquation = 100;
export const ZeroFactor = 200, OneFactor = 201, SrcColorFactor = 202, OneMinusSrcColorFactor = 203, SrcAlphaFactor = 204, OneMinusSrcAlphaFactor = 205,
  DstAlphaFactor = 206, OneMinusDstAlphaFactor = 207, DstColorFactor = 208, OneMinusDstColorFactor = 209;
export const NeverDepth = 0, AlwaysDepth = 1, LessDepth = 2, LessEqualDepth = 3, EqualDepth = 4, GreaterEqualDepth = 5, GreaterDepth = 6, NotEqualDepth = 7;
export const RepeatWrapping = 1000, ClampToEdgeWrapping = 1001;
export const NearestFilter = 1003, LinearFilter = 1006;
export const RGBAFormat = 1023, UnsignedByteType = 1009, UnsignedIntType = 1014, FloatType = 1015;

let materialId = 0;
export class Material {
  constructor() {
    this.id = materialId++;
    this.transparent = false; this.opacity = 1; this.side = FrontSide;
    this.depthTest = true; this.depthWrite = true; this.depthFunc = LessEqualDepth; this.colorWrite = true;
    this.blending = NormalBlending; this.blendSrc = SrcAlphaFactor; this.blendDst = OneMinusSrcAlphaFactor; this.blendEquation = AddEquation;
    this.vertexColors = false; this.fog = true; this.visible = true;
  }
  setValues(o) {
    if (!o) return this;
    for (const k in o) {
      const v = o[k];
      if (this[k] && this[k].isColor) this[k].set(v); else this[k] = v;
    }
    return this;
  }
  clone() {
    const m = new this.constructor();
    for (const k in this) {
      if (k === 'id') continue;
      const v = this[k];
      m[k] = v && v.isColor ? v.clone() : v;
    }
    return m;
  }
  dispose() {}
}

// lit: the sky's light, the sun's (dimmed by its shadow and the clouds), point lights, each face shaded flat
export class MeshStandardMaterial extends Material {
  constructor(o) {
    super();
    this.color = new Color(1, 1, 1); this.emissive = new Color(0, 0, 0); this.emissiveIntensity = 1;
    this.roughness = 1; this.metalness = 0; this.flatShading = true;
    this.setValues(o);
  }
}
MeshStandardMaterial.prototype.isMeshStandardMaterial = true;

export class MeshBasicMaterial extends Material {
  constructor(o) { super(); this.color = new Color(1, 1, 1); this.setValues(o); }
}
MeshBasicMaterial.prototype.isMeshBasicMaterial = true;

export class MeshNormalMaterial extends Material {
  constructor(o) { super(); this.setValues(o); }
}
MeshNormalMaterial.prototype.isMeshNormalMaterial = true;

// A material with its own WGSL. `uniforms` is { name: { value } } (numbers, Vector2/3, Color, Matrix4),
// read each frame into the struct U; `textures` is { name: texture } (or a texture among the uniforms),
// bound as texture_2d (or texture_depth_2d for a depth texture) beside a sampler of its own, `nameS`;
// `attributes` is { name: 'f32' | 'vec2f' | 'vec3f' }, the extra per-vertex data the shader reads, in order
// after position (and colour, with vertexColors). The code gives a vertex function `vs` and a fragment
// function `fs`, and can use everything in the renderer's shared WGSL (the frame F, the object O, lighting,
// shadows, clouds and haze).
export class ShaderMaterial extends Material {
  constructor(o) {
    super();
    this.uniforms = {}; this.textures = {}; this.attributes = {}; this.code = ''; this.fog = false;
    this.setValues(o);
  }
}
ShaderMaterial.prototype.isShaderMaterial = true;

export const BasicShadowMap = 0, PCFShadowMap = 1, PCFSoftShadowMap = 2;

let textureId = 0;
export class Texture {
  constructor() { this.id = textureId++; this.wrapS = this.wrapT = ClampToEdgeWrapping; this.magFilter = this.minFilter = LinearFilter; this.version = 0; }
  set needsUpdate(v) { if (v) this.version++; }
  dispose() {}
}
Texture.prototype.isTexture = true;
// pixels from an array (RGBA bytes)
export class DataTexture extends Texture {
  constructor(data, width, height) { super(); this.image = { data, width, height }; }
}
export class DepthTexture extends Texture {
  constructor(width, height) { super(); this.isDepthTexture = true; this.image = { width, height }; this.type = UnsignedIntType; }
}
// an image drawn into instead of the screen: its colour (texture) and depth (depthTexture, if it's to be read)
export class WebGLRenderTarget {
  constructor(width = 1, height = 1, o = {}) {
    this.width = width; this.height = height;
    this.texture = new Texture(); this.texture.isRenderTargetTexture = true; this.texture.target = this;
    this.texture.magFilter = o.magFilter ?? LinearFilter; this.texture.minFilter = o.minFilter ?? LinearFilter;
    this.depthBuffer = o.depthBuffer !== false;
    this._depthTexture = null; this.version = 0;
  }
  get depthTexture() { return this._depthTexture; }
  set depthTexture(t) { this._depthTexture = t; if (t) t.target = this; }
  setSize(w, h) { if (w !== this.width || h !== this.height) { this.width = w; this.height = h; this.version++; } }
  dispose() {}
}
export { WebGLRenderTarget as RenderTarget };
