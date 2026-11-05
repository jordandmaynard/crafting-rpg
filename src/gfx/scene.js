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
// (v776) updateMatrixWorld's tally, for the profiler: objects looked at, and those whose world matrix was made anew
export const MATRIX_STATS = { seen: 0, made: 0, still: 0 };
const _q = new Quaternion(), _v = new Vector3(), _m = new Matrix4(), _target = new Vector3(), _pos = new Vector3();
const _was = new Float64Array(16);   // (v781: _updateUp's world matrix before)
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
    // (v776: updateMatrixWorld's record of what its matrices were made from, set here so every object keeps one shape)
    this._mc = undefined; this._mm = undefined; this._mwV = 0; this._mwP = undefined; this._mwPV = -1; this._mwS = 0; this._mwH = false;
    // (v795) matrixStill: set by its maker on an object that, with all under it, is never moved again once added (the
    // world's chunk meshes): the scene's pass then leaves it and all under it once made, while its parent stays put.
    // Adding to or taking from it (or anything under it) has it looked at again; moving it means clearing matrixStill
    this.matrixStill = false; this._stillOK = false;
  }
  add(...objs) {
    for (const o of objs) {
      if (o === this) continue;
      if (o.parent) o.parent.remove(o);
      o.parent = this;
      this.children.push(o);
      this._unstill();
    }
    return this;
  }
  remove(...objs) {
    for (const o of objs) {
      const i = this.children.indexOf(o);
      if (i !== -1) { o.parent = null; this.children.splice(i, 1); this._unstill(); }
    }
    return this;
  }
  traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
  updateMatrix() { this.matrix.compose(this.position, this.quaternion, this.scale); }
  // (v776, Jordan: most of the world never moves, and the whole scene's matrices were made anew every frame, 0.8 ms)
  // Only what changed is worked out again: the matrix when the position, turn or size differ from when it was last
  // made (or, set by hand, when its numbers differ), the world matrix when that did or the parent's world matrix
  // (its _mwV, a count of its changes) or the parent itself did. The result is the same as making them all.
  // (v778, Jordan's G: 1,766 of the 1,955 made anew each frame were the hero's, most of them gear worn by nobody: every
  // part's hidden piece, silhouette and shadow copy) hidden: from the scene's own pass (Scene.updateMatrixWorld), a
  // hidden mesh with nothing under it is left until it shows; its matrices are made then, as nothing draws it meanwhile.
  // A call on an object of its own (a rig being built) still makes every one. One left is marked _mwH, and the
  // renderer's walks bring it up to date if it's shown before the next pass. Not one hidden that still casts (castHidden)
  // (v780: nor did v778 save much, as most of them were under hidden groups, the weapons in every metal waiting in the
  // hand: a hidden group is left now too, with all under it, as neither walk goes into one)
  // (v795) this and everything over it looked at again in the next pass (see matrixStill)
  _unstill() { for (let o = this; o; o = o.parent) o._stillOK = false; }
  updateMatrixWorld(hidden = false) {
    if (hidden && !this.visible && !this.castHidden) { this._mwH = true; return; }
    this._mwH = false;
    let moved = false;
    if (this.matrixAutoUpdate) {
      const p = this.position, q = this.quaternion, s = this.scale, c = this._mc;
      if (c === undefined || c[0] !== p.x || c[1] !== p.y || c[2] !== p.z || c[3] !== q._x || c[4] !== q._y || c[5] !== q._z || c[6] !== q._w
        || c[7] !== s.x || c[8] !== s.y || c[9] !== s.z) {
        this._mc = [p.x, p.y, p.z, q._x, q._y, q._z, q._w, s.x, s.y, s.z];
        this.updateMatrix(); moved = true;
      }
    } else {
      const e = this.matrix.elements, c = this._mm;
      if (c === undefined) { this._mm = e.slice(); moved = true; }
      else for (let i = 0; i < 16; i++) if (c[i] !== e[i]) { for (let j = 0; j < 16; j++) c[j] = e[j]; moved = true; break; }
    }
    const par = this.parent;
    MATRIX_STATS.seen++;
    if (moved || this._mwV === 0 || this._mwP !== par || (par !== null && par._mwV !== this._mwPV)) {
      if (par) this.matrixWorld.multiplyMatrices(par.matrixWorld, this.matrix);
      else this.matrixWorld.copy(this.matrix);
      this._mwP = par; this._mwPV = par ? par._mwV : 0; this._mwV++;
      MATRIX_STATS.made++;
    }
    const ch = this.children;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (c._stillOK && c.matrixStill && c._mwP === this && c._mwPV === this._mwV) { MATRIX_STATS.still++; continue; }
      c.updateMatrixWorld(hidden);
    }
    if (this.matrixStill) this._stillOK = true;
  }
  // this object's world matrix brought up to date along with every parent's, but not its children's (counted as a
  // change, so updateMatrixWorld redoes them)
  // (v781: counted as a change only if it is one; before, every getWorldPosition counted one all the way up to the
  // scene, so the next pass made every world matrix in it again)
  _updateUp() {
    if (this.parent) this.parent._updateUp();
    if (this.matrixAutoUpdate) this.updateMatrix();
    const w = this.matrixWorld.elements;
    for (let i = 0; i < 16; i++) _was[i] = w[i];
    if (this.parent) this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    else this.matrixWorld.copy(this.matrix);
    let same = this._mwV !== 0;
    for (let i = 0; i < 16 && same; i++) if (_was[i] !== w[i]) same = false;
    this._mwP = this.parent; this._mwPV = this.parent ? this.parent._mwV : 0;
    if (!same) this._mwV++;
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
  updateMatrixWorld() { super.updateMatrixWorld(true); }
}
Scene.prototype.isScene = true;

export class Mesh extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}
Mesh.prototype.isMesh = true;

// one mesh drawn many times in a single call: copy i placed by matrix i (after the mesh's own), the first `count`
// of them. Set the matrices with setMatrixAt, then needsUpdate. Never culled: its copies may be anywhere.
export class InstancedMesh extends Mesh {
  constructor(geometry, material, max = 16) {
    super(geometry, material);
    this.count = 0; this.instanceMatrix = new Float32Array(Math.max(1, max) * 16); this.instanceVersion = 0;
    this.frustumCulled = false;
  }
  get max() { return this.instanceMatrix.length / 16; }
  // room for at least n copies, keeping those set
  reserve(n) {
    if (n <= this.max) return;
    let m = this.max; while (m < n) m *= 2;
    const a = new Float32Array(m * 16); a.set(this.instanceMatrix); this.instanceMatrix = a;
  }
  setMatrixAt(i, m) { this.instanceMatrix.set(m.elements, i * 16); }
  set needsUpdate(v) { if (v) this.instanceVersion++; }
}
InstancedMesh.prototype.isInstancedMesh = true;

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
