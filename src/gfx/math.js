// Vectors, colours, rotations and matrices for the scene graph. They keep the shapes and habits of the ones
// the game was first written against (column-major matrices, XYZ Euler angles, colours taken as given with
// no colour management), so the game code reads the same.

export class Vector2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
  copy(v) { this.x = v.x; this.y = v.y; return this; }
  clone() { return new Vector2(this.x, this.y); }
}

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(s) { this.x = this.y = this.z = s; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addVectors(a, b) { this.x = a.x + b.x; this.y = a.y + b.y; this.z = a.z + b.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  divideScalar(s) { return this.multiplyScalar(1 / s); }
  negate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v) { return this.crossVectors(this, v); }
  crossVectors(a, b) {
    const ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
    this.x = ay * bz - az * by; this.y = az * bx - ax * bz; this.z = ax * by - ay * bx;
    return this;
  }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  length() { return Math.sqrt(this.lengthSq()); }
  normalize() { return this.divideScalar(this.length() || 1); }
  distanceToSquared(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return dx * dx + dy * dy + dz * dz; }
  distanceTo(v) { return Math.sqrt(this.distanceToSquared(v)); }
  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  equals(v) { return v.x === this.x && v.y === this.y && v.z === this.z; }
  applyMatrix4(m) {
    const x = this.x, y = this.y, z = this.z, e = m.elements;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return this;
  }
  // a direction through the matrix's rotation and scale, then made unit length
  transformDirection(m) {
    const x = this.x, y = this.y, z = this.z, e = m.elements;
    this.x = e[0] * x + e[4] * y + e[8] * z;
    this.y = e[1] * x + e[5] * y + e[9] * z;
    this.z = e[2] * x + e[6] * y + e[10] * z;
    return this.normalize();
  }
  applyQuaternion(q) {
    const x = this.x, y = this.y, z = this.z, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return this;
  }
  // world to normalised device coordinates (x, y, z all -1 .. 1) and back
  project(camera) { return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix); }
  unproject(camera) { return this.applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld); }
  setFromMatrixPosition(m) { const e = m.elements; this.x = e[12]; this.y = e[13]; this.z = e[14]; return this; }
  setFromMatrixColumn(m, i) { const e = m.elements; this.x = e[i * 4]; this.y = e[i * 4 + 1]; this.z = e[i * 4 + 2]; return this; }
}

// colours by name the game uses ('#rrggbb', '#rgb', 0xrrggbb, or another colour), with no conversion
export class Color {
  constructor(r, g, b) {
    this.r = 1; this.g = 1; this.b = 1;
    if (g !== undefined && b !== undefined) this.setRGB(r, g, b);
    else if (r !== undefined) this.set(r);
  }
  set(v) {
    if (v && v.isColor) return this.copy(v);
    if (typeof v === 'number') return this.setHex(v);
    if (typeof v === 'string') return this.setStyle(v);
    return this;
  }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
  setHex(h) { h = Math.floor(h); this.r = (h >> 16 & 255) / 255; this.g = (h >> 8 & 255) / 255; this.b = (h & 255) / 255; return this; }
  setStyle(s) {
    let m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) return this.setHex(parseInt(m[1], 16));
    m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
    if (m) return this.setRGB(parseInt(m[1] + m[1], 16) / 255, parseInt(m[2] + m[2], 16) / 255, parseInt(m[3] + m[3], 16) / 255);
    m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(s);
    if (m) return this.setRGB(+m[1] / 255, +m[2] / 255, +m[3] / 255);
    if (s === 'white') return this.setRGB(1, 1, 1);
    if (s === 'black') return this.setRGB(0, 0, 0);
    console.warn('Color: unknown colour', s);
    return this;
  }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  clone() { return new Color(this.r, this.g, this.b); }
  add(c) { this.r += c.r; this.g += c.g; this.b += c.b; return this; }
  multiply(c) { this.r *= c.r; this.g *= c.g; this.b *= c.b; return this; }
  multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
  lerp(c, t) { this.r += (c.r - this.r) * t; this.g += (c.g - this.g) * t; this.b += (c.b - this.b) * t; return this; }
  lerpColors(a, b, t) { this.r = a.r + (b.r - a.r) * t; this.g = a.g + (b.g - a.g) * t; this.b = a.b + (b.b - a.b) * t; return this; }
  equals(c) { return c.r === this.r && c.g === this.g && c.b === this.b; }
  getHex() {
    const k = v => Math.max(0, Math.min(255, Math.round(v * 255)));
    return k(this.r) << 16 ^ k(this.g) << 8 ^ k(this.b);
  }
  getHexString() { return ('000000' + this.getHex().toString(16)).slice(-6); }
}
Color.prototype.isColor = true;

export class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { this._x = x; this._y = y; this._z = z; this._w = w; this._onChange = null; }
  get x() { return this._x; } set x(v) { this._x = v; this._changed(); }
  get y() { return this._y; } set y(v) { this._y = v; this._changed(); }
  get z() { return this._z; } set z(v) { this._z = v; this._changed(); }
  get w() { return this._w; } set w(v) { this._w = v; this._changed(); }
  _changed() { if (this._onChange) this._onChange(); }
  set(x, y, z, w) { this._x = x; this._y = y; this._z = z; this._w = w; this._changed(); return this; }
  copy(q) { this._x = q.x; this._y = q.y; this._z = q.z; this._w = q.w; this._changed(); return this; }
  clone() { return new Quaternion(this._x, this._y, this._z, this._w); }
  setFromAxisAngle(axis, angle) {
    const h = angle / 2, s = Math.sin(h);
    return this.set(axis.x * s, axis.y * s, axis.z * s, Math.cos(h));
  }
  setFromEuler(e, update = true) {
    const c1 = Math.cos(e._x / 2), c2 = Math.cos(e._y / 2), c3 = Math.cos(e._z / 2);
    const s1 = Math.sin(e._x / 2), s2 = Math.sin(e._y / 2), s3 = Math.sin(e._z / 2);
    let x, y, z, w;
    switch (e._order) {
      case 'XYZ': x = s1 * c2 * c3 + c1 * s2 * s3; y = c1 * s2 * c3 - s1 * c2 * s3; z = c1 * c2 * s3 + s1 * s2 * c3; w = c1 * c2 * c3 - s1 * s2 * s3; break;
      case 'YXZ': x = s1 * c2 * c3 + c1 * s2 * s3; y = c1 * s2 * c3 - s1 * c2 * s3; z = c1 * c2 * s3 - s1 * s2 * c3; w = c1 * c2 * c3 + s1 * s2 * s3; break;
      case 'ZXY': x = s1 * c2 * c3 - c1 * s2 * s3; y = c1 * s2 * c3 + s1 * c2 * s3; z = c1 * c2 * s3 + s1 * s2 * c3; w = c1 * c2 * c3 - s1 * s2 * s3; break;
      case 'ZYX': x = s1 * c2 * c3 - c1 * s2 * s3; y = c1 * s2 * c3 + s1 * c2 * s3; z = c1 * c2 * s3 - s1 * s2 * c3; w = c1 * c2 * c3 + s1 * s2 * s3; break;
      case 'YZX': x = s1 * c2 * c3 + c1 * s2 * s3; y = c1 * s2 * c3 + s1 * c2 * s3; z = c1 * c2 * s3 - s1 * s2 * c3; w = c1 * c2 * c3 - s1 * s2 * s3; break;
      case 'XZY': x = s1 * c2 * c3 - c1 * s2 * s3; y = c1 * s2 * c3 - s1 * c2 * s3; z = c1 * c2 * s3 + s1 * s2 * c3; w = c1 * c2 * c3 + s1 * s2 * s3; break;
    }
    this._x = x; this._y = y; this._z = z; this._w = w;
    if (update) this._changed();
    return this;
  }
  setFromRotationMatrix(m) {
    const te = m.elements, m11 = te[0], m12 = te[4], m13 = te[8], m21 = te[1], m22 = te[5], m23 = te[9], m31 = te[2], m32 = te[6], m33 = te[10];
    const trace = m11 + m22 + m33;
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      this._w = 0.25 / s; this._x = (m32 - m23) * s; this._y = (m13 - m31) * s; this._z = (m21 - m12) * s;
    } else if (m11 > m22 && m11 > m33) {
      const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
      this._w = (m32 - m23) / s; this._x = 0.25 * s; this._y = (m12 + m21) / s; this._z = (m13 + m31) / s;
    } else if (m22 > m33) {
      const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
      this._w = (m13 - m31) / s; this._x = (m12 + m21) / s; this._y = 0.25 * s; this._z = (m23 + m32) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
      this._w = (m21 - m12) / s; this._x = (m13 + m31) / s; this._y = (m23 + m32) / s; this._z = 0.25 * s;
    }
    this._changed();
    return this;
  }
  multiply(q) { return this.multiplyQuaternions(this, q); }
  premultiply(q) { return this.multiplyQuaternions(q, this); }
  multiplyQuaternions(a, b) {
    const qax = a._x, qay = a._y, qaz = a._z, qaw = a._w, qbx = b._x, qby = b._y, qbz = b._z, qbw = b._w;
    this._x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    this._y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    this._z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    this._w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;
    this._changed();
    return this;
  }
  invert() { this._x = -this._x; this._y = -this._y; this._z = -this._z; this._changed(); return this; }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export class Euler {
  constructor(x = 0, y = 0, z = 0, order = 'XYZ') { this._x = x; this._y = y; this._z = z; this._order = order; this._onChange = null; }
  get x() { return this._x; } set x(v) { this._x = v; this._changed(); }
  get y() { return this._y; } set y(v) { this._y = v; this._changed(); }
  get z() { return this._z; } set z(v) { this._z = v; this._changed(); }
  get order() { return this._order; } set order(v) { this._order = v; this._changed(); }
  _changed() { if (this._onChange) this._onChange(); }
  set(x, y, z, order = this._order) { this._x = x; this._y = y; this._z = z; this._order = order; this._changed(); return this; }
  copy(e) { this._x = e._x; this._y = e._y; this._z = e._z; this._order = e._order; this._changed(); return this; }
  clone() { return new Euler(this._x, this._y, this._z, this._order); }
  setFromRotationMatrix(m, order = this._order, update = true) {
    const te = m.elements, m11 = te[0], m12 = te[4], m13 = te[8], m21 = te[1], m22 = te[5], m23 = te[9], m31 = te[2], m32 = te[6], m33 = te[10];
    switch (order) {
      case 'XYZ':
        this._y = Math.asin(clamp(m13, -1, 1));
        if (Math.abs(m13) < 0.9999999) { this._x = Math.atan2(-m23, m33); this._z = Math.atan2(-m12, m11); } else { this._x = Math.atan2(m32, m22); this._z = 0; }
        break;
      case 'YXZ':
        this._x = Math.asin(-clamp(m23, -1, 1));
        if (Math.abs(m23) < 0.9999999) { this._y = Math.atan2(m13, m33); this._z = Math.atan2(m21, m22); } else { this._y = Math.atan2(-m31, m11); this._z = 0; }
        break;
      default:
        // the game only turns things in XYZ and YXZ order
        this._y = Math.asin(clamp(m13, -1, 1));
        if (Math.abs(m13) < 0.9999999) { this._x = Math.atan2(-m23, m33); this._z = Math.atan2(-m12, m11); } else { this._x = Math.atan2(m32, m22); this._z = 0; }
    }
    this._order = order;
    if (update) this._changed();
    return this;
  }
  setFromQuaternion(q, order, update) { return this.setFromRotationMatrix(_m1.makeRotationFromQuaternion(q), order, update); }
}

export class Matrix4 {
  constructor() { this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  set(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44) {
    const te = this.elements;
    te[0] = n11; te[4] = n12; te[8] = n13; te[12] = n14;
    te[1] = n21; te[5] = n22; te[9] = n23; te[13] = n24;
    te[2] = n31; te[6] = n32; te[10] = n33; te[14] = n34;
    te[3] = n41; te[7] = n42; te[11] = n43; te[15] = n44;
    return this;
  }
  identity() { return this.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1); }
  copy(m) { const a = this.elements, b = m.elements; for (let i = 0; i < 16; i++) a[i] = b[i]; return this; }
  clone() { return new Matrix4().copy(this); }
  multiply(m) { return this.multiplyMatrices(this, m); }
  premultiply(m) { return this.multiplyMatrices(m, this); }
  multiplyMatrices(a, b) {
    const ae = a.elements, be = b.elements, te = this.elements;
    const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12], a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
    const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14], a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];
    const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12], b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
    const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14], b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];
    te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41; te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43; te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
    te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41; te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43; te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
    te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41; te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43; te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
    te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41; te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43; te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
    return this;
  }
  determinant() {
    const te = this.elements;
    const n11 = te[0], n12 = te[4], n13 = te[8], n14 = te[12], n21 = te[1], n22 = te[5], n23 = te[9], n24 = te[13];
    const n31 = te[2], n32 = te[6], n33 = te[10], n34 = te[14], n41 = te[3], n42 = te[7], n43 = te[11], n44 = te[15];
    return n41 * (+n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34)
      + n42 * (+n11 * n23 * n34 - n11 * n24 * n33 + n14 * n21 * n33 - n13 * n21 * n34 + n13 * n24 * n31 - n14 * n23 * n31)
      + n43 * (+n11 * n24 * n32 - n11 * n22 * n34 - n14 * n21 * n32 + n12 * n21 * n34 + n14 * n22 * n31 - n12 * n24 * n31)
      + n44 * (-n13 * n22 * n31 - n11 * n23 * n32 + n11 * n22 * n33 + n13 * n21 * n32 - n12 * n21 * n33 + n12 * n23 * n31);
  }
  invert() {
    const te = this.elements;
    const n11 = te[0], n21 = te[1], n31 = te[2], n41 = te[3], n12 = te[4], n22 = te[5], n32 = te[6], n42 = te[7];
    const n13 = te[8], n23 = te[9], n33 = te[10], n43 = te[11], n14 = te[12], n24 = te[13], n34 = te[14], n44 = te[15];
    const t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
    const t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
    const t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
    const t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
    if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    const d = 1 / det;
    te[0] = t11 * d;
    te[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * d;
    te[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * d;
    te[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * d;
    te[4] = t12 * d;
    te[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * d;
    te[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * d;
    te[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * d;
    te[8] = t13 * d;
    te[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * d;
    te[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * d;
    te[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * d;
    te[12] = t14 * d;
    te[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * d;
    te[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * d;
    te[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * d;
    return this;
  }
  makeRotationFromQuaternion(q) { return this.compose(_zero, q, _one); }
  compose(p, q, s) {
    const te = this.elements, x = q._x, y = q._y, z = q._z, w = q._w;
    const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2, sx = s.x, sy = s.y, sz = s.z;
    te[0] = (1 - (yy + zz)) * sx; te[1] = (xy + wz) * sx; te[2] = (xz - wy) * sx; te[3] = 0;
    te[4] = (xy - wz) * sy; te[5] = (1 - (xx + zz)) * sy; te[6] = (yz + wx) * sy; te[7] = 0;
    te[8] = (xz + wy) * sz; te[9] = (yz - wx) * sz; te[10] = (1 - (xx + yy)) * sz; te[11] = 0;
    te[12] = p.x; te[13] = p.y; te[14] = p.z; te[15] = 1;
    return this;
  }
  decompose(p, q, s) {
    const te = this.elements;
    let sx = Math.hypot(te[0], te[1], te[2]);
    const sy = Math.hypot(te[4], te[5], te[6]), sz = Math.hypot(te[8], te[9], te[10]);
    if (this.determinant() < 0) sx = -sx;
    p.x = te[12]; p.y = te[13]; p.z = te[14];
    _m1.copy(this);
    const ix = 1 / sx, iy = 1 / sy, iz = 1 / sz, me = _m1.elements;
    me[0] *= ix; me[1] *= ix; me[2] *= ix; me[4] *= iy; me[5] *= iy; me[6] *= iy; me[8] *= iz; me[9] *= iz; me[10] *= iz;
    q.setFromRotationMatrix(_m1);
    s.x = sx; s.y = sy; s.z = sz;
    return this;
  }
  // a rotation that points -z (or +z for things that aren't cameras) from eye toward target
  lookAt(eye, target, up) {
    const te = this.elements;
    _z.subVectors(eye, target);
    if (_z.lengthSq() === 0) _z.z = 1;
    _z.normalize();
    _x.crossVectors(up, _z);
    if (_x.lengthSq() === 0) {
      if (Math.abs(up.z) === 1) _z.x += 0.0001; else _z.z += 0.0001;
      _z.normalize(); _x.crossVectors(up, _z);
    }
    _x.normalize(); _y.crossVectors(_z, _x);
    te[0] = _x.x; te[4] = _y.x; te[8] = _z.x;
    te[1] = _x.y; te[5] = _y.y; te[9] = _z.y;
    te[2] = _x.z; te[6] = _y.z; te[10] = _z.z;
    return this;
  }
  makePerspective(left, right, top, bottom, near, far) {
    const x = 2 * near / (right - left), y = 2 * near / (top - bottom);
    const a = (right + left) / (right - left), b = (top + bottom) / (top - bottom), c = -(far + near) / (far - near), d = -2 * far * near / (far - near);
    return this.set(x, 0, a, 0, 0, y, b, 0, 0, 0, c, d, 0, 0, -1, 0);
  }
  makeOrthographic(left, right, top, bottom, near, far) {
    const w = 1 / (right - left), h = 1 / (top - bottom), p = 1 / (far - near);
    return this.set(2 * w, 0, 0, -(right + left) * w, 0, 2 * h, 0, -(top + bottom) * h, 0, 0, -2 * p, -(far + near) * p, 0, 0, 0, 1);
  }
  getMaxScaleOnAxis() {
    const te = this.elements;
    return Math.sqrt(Math.max(te[0] * te[0] + te[1] * te[1] + te[2] * te[2], te[4] * te[4] + te[5] * te[5] + te[6] * te[6], te[8] * te[8] + te[9] * te[9] + te[10] * te[10]));
  }
}
const _m1 = new Matrix4(), _zero = new Vector3(), _one = new Vector3(1, 1, 1), _x = new Vector3(), _y = new Vector3(), _z = new Vector3();

export class Plane {
  constructor(normal = new Vector3(1, 0, 0), constant = 0) { this.normal = normal; this.constant = constant; }
  distanceToPoint(p) { return this.normal.dot(p) + this.constant; }
}
export class Ray {
  constructor(origin = new Vector3(), direction = new Vector3(0, 0, -1)) { this.origin = origin; this.direction = direction; }
  // where the ray meets the plane, or null if it runs alongside it or away from it
  intersectPlane(plane, out) {
    const den = plane.normal.dot(this.direction);
    if (den === 0) return plane.distanceToPoint(this.origin) === 0 ? out.copy(this.origin) : null;
    const t = -(this.origin.dot(plane.normal) + plane.constant) / den;
    return t >= 0 ? out.copy(this.origin).addScaledVector(this.direction, t) : null;
  }
}

// the six planes of a camera's view, for leaving out what it can't see
export class Frustum {
  // (v786: the planes also kept as one flat run, f, for sphereClass)
  constructor() { this.planes = []; for (let i = 0; i < 6; i++) this.planes.push(new Float64Array(4)); this.f = new Float64Array(24); }
  setFromProjectionMatrix(m) {
    const e = m.elements;
    const rows = [[e[0], e[4], e[8], e[12]], [e[1], e[5], e[9], e[13]], [e[2], e[6], e[10], e[14]], [e[3], e[7], e[11], e[15]]];
    const set = (p, s, r) => {
      for (let k = 0; k < 4; k++) p[k] = rows[3][k] + s * rows[r][k];
      const l = Math.hypot(p[0], p[1], p[2]) || 1;
      for (let k = 0; k < 4; k++) p[k] /= l;
    };
    set(this.planes[0], 1, 0); set(this.planes[1], -1, 0); set(this.planes[2], 1, 1);
    set(this.planes[3], -1, 1); set(this.planes[4], 1, 2); set(this.planes[5], -1, 2);
    for (let i = 0; i < 6; i++) this.f.set(this.planes[i], i * 4);
    return this;
  }
  intersectsSphere(x, y, z, r) {
    for (const p of this.planes) if (p[0] * x + p[1] * y + p[2] * z + p[3] < -r) return false;
    return true;
  }
  // (v786) a sphere in view (2), out of it but within m of it (1), or further out (0), in one look at the planes
  sphereClass(x, y, z, r, m = 0) {
    const f = this.f, far = -(r + m);
    let near = false;
    for (let i = 0; i < 24; i += 4) {
      const d = f[i] * x + f[i + 1] * y + f[i + 2] * z + f[i + 3];
      if (d < far) return 0;
      if (d < -r) near = true;
    }
    return near ? 1 : 2;
  }
}
