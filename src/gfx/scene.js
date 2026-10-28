// The scene graph: objects with a place, a turn and a size, nested in groups; meshes, cameras, lights and
// haze. Each object's matrix is made from its position, rotation (or quaternion, kept in step) and scale,
// and its world matrix from its parents'.
import { Vector2, Vector3, Color, Euler, Quaternion, Matrix4 } from './math.js';

export class Layers {
  constructor() { this.mask = 1; }
  set(n) { this.mask = (1 << n) >>> 0; }
  enable(n) { this.mask |= 1 << n; }
  enableAll() { this.mask = 0xffffffff; }
  disable(n) { this.mask &= ~(1 << n); }
  test(l) { return (this.mask & l.mask) !== 0; }
}

let objectId = 0;
const _q = new Quaternion(), _v = new Vector3(), _m = new Matrix4(), _target = new Vector3(), _pos = new Vector3();
export class Object3D {
  constructor() {
    this.id = objectId++;
    this.parent = null;
    this.children = [];
    this.up = new Vector3(0, 1, 0);
    this.position = new Vector3();
    this.rotation = new Euler();
    this.quaternion = new Quaternion();
    this.scale = new Vector3(1, 1, 1);
    this.rotation._onChange = () => this.quaternion.setFromEuler(this.rotation, false);
    this.quaternion._onChange = () => this.rotation.setFromQuaternion(this.quaternion, undefined, false);
    this.matrix = new Matrix4();
    this.matrixWorld = new Matrix4();
    this.matrixAutoUpdate = true;
    this.layers = new Layers();
    this.visible = true;
    this.castShadow = false;
    this.receiveShadow = false;
    this.frustumCulled = true;
    this.renderOrder = 0;
    this.userData = {};
  }
  add(...objs) {
    for (const o of objs) {
      if (o === this) continue;
      if (o.parent) o.parent.remove(o);
      o.parent = this;
      this.children.push(o);
    }
    return this;
  }
  remove(...objs) {
    for (const o of objs) {
      const i = this.children.indexOf(o);
      if (i !== -1) { o.parent = null; this.children.splice(i, 1); }
    }
    return this;
  }
  traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
  updateMatrix() { this.matrix.compose(this.position, this.quaternion, this.scale); }
  updateMatrixWorld() {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.parent) this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    else this.matrixWorld.copy(this.matrix);
    for (const c of this.children) c.updateMatrixWorld();
  }
  // this object's world matrix brought up to date along with every parent's, but not its children's
  _updateUp() {
    if (this.parent) this.parent._updateUp();
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.parent) this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    else this.matrixWorld.copy(this.matrix);
  }
  getWorldPosition(out) { this._updateUp(); return out.setFromMatrixPosition(this.matrixWorld); }
  getWorldQuaternion(out) { this._updateUp(); this.matrixWorld.decompose(_pos, out, _v); return out; }
  getWorldScale(out) { this._updateUp(); this.matrixWorld.decompose(_pos, _q, out); return out; }
  getWorldDirection(out) { this._updateUp(); const e = this.matrixWorld.elements; return out.set(e[8], e[9], e[10]).normalize(); }
  // turn to face a point (cameras and lights point their -z at it, everything else its +z)
  lookAt(x, y, z) {
    if (x.isVector3) _target.copy(x); else _target.set(x, y, z);
    this._updateUp();
    _pos.setFromMatrixPosition(this.matrixWorld);
    if (this.isCamera || this.isLight) _m.lookAt(_pos, _target, this.up); else _m.lookAt(_target, _pos, this.up);
    this.quaternion.setFromRotationMatrix(_m);
    if (this.parent) {
      this.parent.matrixWorld.decompose(_v, _q, _pos);
      this.quaternion.premultiply(_q.invert());
    }
  }
}
Vector3.prototype.isVector3 = true;

export class Group extends Object3D {}

export class Scene extends Object3D {
  constructor() { super(); this.fog = null; this.overrideMaterial = null; }
}
Scene.prototype.isScene = true;

export class Mesh extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}
Mesh.prototype.isMesh = true;

// distance haze: none nearer than `near`, all of it past `far` (eased between)
export class Fog {
  constructor(color, near = 1, far = 1000) { this.color = new Color(color); this.near = near; this.far = far; }
}

export class Camera extends Object3D {
  constructor() {
    super();
    this.matrixWorldInverse = new Matrix4();
    this.projectionMatrix = new Matrix4();
    this.projectionMatrixInverse = new Matrix4();
  }
  updateMatrixWorld() { super.updateMatrixWorld(); this.matrixWorldInverse.copy(this.matrixWorld).invert(); }
  _updateUp() { super._updateUp(); this.matrixWorldInverse.copy(this.matrixWorld).invert(); }
  getWorldDirection(out) { this._updateUp(); const e = this.matrixWorld.elements; return out.set(-e[8], -e[9], -e[10]).normalize(); }
}
Camera.prototype.isCamera = true;

export class OrthographicCamera extends Camera {
  constructor(left = -1, right = 1, top = 1, bottom = -1, near = 0.1, far = 2000) {
    super();
    Object.assign(this, { left, right, top, bottom, near, far, zoom: 1 });
    this.updateProjectionMatrix();
  }
  updateProjectionMatrix() {
    const dx = (this.right - this.left) / (2 * this.zoom), dy = (this.top - this.bottom) / (2 * this.zoom);
    const cx = (this.right + this.left) / 2, cy = (this.top + this.bottom) / 2;
    this.projectionMatrix.makeOrthographic(cx - dx, cx + dx, cy + dy, cy - dy, this.near, this.far);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}
OrthographicCamera.prototype.isOrthographicCamera = true;

export class PerspectiveCamera extends Camera {
  constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
    super();
    Object.assign(this, { fov, aspect, near, far, zoom: 1 });
    this.updateProjectionMatrix();
  }
  updateProjectionMatrix() {
    const top = this.near * Math.tan(Math.PI / 180 * 0.5 * this.fov) / this.zoom, height = 2 * top, width = this.aspect * height;
    this.projectionMatrix.makePerspective(-0.5 * width, 0.5 * width, top, top - height, this.near, this.far);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}
PerspectiveCamera.prototype.isPerspectiveCamera = true;

export class Light extends Object3D {
  constructor(color, intensity = 1) { super(); this.color = new Color(color); this.intensity = intensity; }
}
Light.prototype.isLight = true;

// sky light from above shading to ground light from below
export class HemisphereLight extends Light {
  constructor(skyColor, groundColor, intensity) {
    super(skyColor, intensity);
    this.groundColor = new Color(groundColor);
    this.position.set(0, 1, 0);
  }
}
HemisphereLight.prototype.isHemisphereLight = true;

// light from one direction, from its position toward its target's, with a shadow map over an orthographic
// view along it
export class DirectionalLight extends Light {
  constructor(color, intensity) {
    super(color, intensity);
    this.position.set(0, 1, 0);
    this.target = new Object3D();
    this.shadow = {
      mapSize: new Vector2(512, 512), camera: new OrthographicCamera(-5, 5, 5, -5, 0.5, 500),
      bias: 0, normalBias: 0, radius: 1, matrix: new Matrix4(),
    };
  }
}
DirectionalLight.prototype.isDirectionalLight = true;

// light from a point, falling to nothing at `distance` (0: never), as (1 - d / distance) ^ decay
export class PointLight extends Light {
  constructor(color, intensity, distance = 0, decay = 1) { super(color, intensity); this.distance = distance; this.decay = decay; }
}
PointLight.prototype.isPointLight = true;
