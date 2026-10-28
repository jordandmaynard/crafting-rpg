// Vertex data, and the primitive shapes the game builds its props and creatures from. The shapes are laid
// out point for point as the game's first renderer laid them out (the same corners, the same order, faces
// wound counter-clockwise seen from outside), so everything baked from them comes out the same.
import { Vector3 } from './math.js';

export class BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.version = 0; }
  get count() { return this.array.length / this.itemSize; }
  set needsUpdate(v) { if (v) this.version++; }
}
export class Float32BufferAttribute extends BufferAttribute {
  constructor(array, itemSize) { super(array instanceof Float32Array ? array : new Float32Array(array), itemSize); }
}

let geometryId = 0;
export class BufferGeometry {
  constructor() { this.id = geometryId++; this.attributes = {}; this.index = null; this.boundingSphere = null; this._onDispose = null; }
  setAttribute(name, attr) { this.attributes[name] = attr; this.boundingSphere = null; return this; }
  getAttribute(name) { return this.attributes[name]; }
  setIndex(index) {
    if (Array.isArray(index)) index = new BufferAttribute(new (maxOf(index) > 65535 ? Uint32Array : Uint16Array)(index), 1);
    this.index = index;
    return this;
  }
  // every triangle's corners written out in full, sharing none
  toNonIndexed() {
    if (!this.index) return this;
    const out = new BufferGeometry(), idx = this.index.array;
    for (const name in this.attributes) {
      const a = this.attributes[name], s = a.itemSize, src = a.array, dst = new src.constructor(idx.length * s);
      for (let i = 0; i < idx.length; i++) for (let k = 0; k < s; k++) dst[i * s + k] = src[idx[i] * s + k];
      out.setAttribute(name, new BufferAttribute(dst, s));
    }
    return out;
  }
  // the shading works out each face's normal as it draws, so nothing is stored
  computeVertexNormals() { return this; }
  computeBoundingSphere() {
    const p = this.attributes.position;
    if (!p || !p.count) { this.boundingSphere = { x: 0, y: 0, z: 0, r: 0 }; return this.boundingSphere; }
    const a = p.array;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < a.length; i += 3) {
      const x = a[i], y = a[i + 1], z = a[i + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    let r2 = 0;
    for (let i = 0; i < a.length; i += 3) { const dx = a[i] - cx, dy = a[i + 1] - cy, dz = a[i + 2] - cz, d = dx * dx + dy * dy + dz * dz; if (d > r2) r2 = d; }
    this.boundingSphere = { x: cx, y: cy, z: cz, r: Math.sqrt(r2) };
    return this.boundingSphere;
  }
  _transform(fn) {
    const p = this.attributes.position;
    // a shape's shared corners (boxes are cached by size) are copied before they're moved
    if (p._shared) { this.setAttribute('position', new BufferAttribute(p.array.slice(), 3)); if (this.index) this.index = new BufferAttribute(this.index.array.slice(), 1); }
    const a = this.attributes.position.array, v = new Vector3();
    for (let i = 0; i < a.length; i += 3) { fn(v.set(a[i], a[i + 1], a[i + 2])); a[i] = v.x; a[i + 1] = v.y; a[i + 2] = v.z; }
    this.attributes.position.needsUpdate = true; this.boundingSphere = null;
    return this;
  }
  rotateX(t) { const c = Math.cos(t), s = Math.sin(t); return this._transform(v => v.set(v.x, c * v.y - s * v.z, s * v.y + c * v.z)); }
  rotateY(t) { const c = Math.cos(t), s = Math.sin(t); return this._transform(v => v.set(c * v.x + s * v.z, v.y, -s * v.x + c * v.z)); }
  rotateZ(t) { const c = Math.cos(t), s = Math.sin(t); return this._transform(v => v.set(c * v.x - s * v.y, s * v.x + c * v.y, v.z)); }
  translate(x, y, z) { return this._transform(v => v.set(v.x + x, v.y + y, v.z + z)); }
  scale(x, y, z) { return this._transform(v => v.set(v.x * x, v.y * y, v.z * z)); }
  dispose() { if (this._onDispose) this._onDispose(this); }
}
const maxOf = a => { let m = 0; for (const v of a) if (v > m) m = v; return m; };
const build = (geo, pos, idx) => {
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  if (idx) geo.setIndex(idx);
  return geo;
};

// boxes with the same sides share their corner data
const boxCache = new Map();
export class BoxGeometry extends BufferGeometry {
  constructor(width = 1, height = 1, depth = 1) {
    super();
    const key = width + ',' + height + ',' + depth;
    let c = boxCache.get(key);
    if (!c) {
      const pos = [], idx = [];
      let n = 0;
      const plane = (u, v, w, udir, vdir, W, Hh, D) => {
        const v3 = {};
        for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix < 2; ix++) {
          v3[u] = (ix * W - W / 2) * udir; v3[v] = (iy * Hh - Hh / 2) * vdir; v3[w] = D / 2;
          pos.push(v3.x, v3.y, v3.z);
        }
        const a = n, b = n + 2, cc = n + 3, d = n + 1;
        idx.push(a, b, d, b, cc, d);
        n += 4;
      };
      plane('z', 'y', 'x', -1, -1, depth, height, width);
      plane('z', 'y', 'x', 1, -1, depth, height, -width);
      plane('x', 'z', 'y', 1, 1, width, depth, height);
      plane('x', 'z', 'y', 1, -1, width, depth, -height);
      plane('x', 'y', 'z', 1, -1, width, height, depth);
      plane('x', 'y', 'z', -1, -1, width, height, -depth);
      c = { position: new Float32BufferAttribute(pos, 3), index: new BufferAttribute(new Uint16Array(idx), 1) };
      c.position._shared = true;
      boxCache.set(key, c);
    }
    this.setAttribute('position', c.position);
    this.index = c.index;
    this.parameters = { width, height, depth };
  }
}

export class CylinderGeometry extends BufferGeometry {
  constructor(radiusTop = 1, radiusBottom = 1, height = 1, radialSegments = 8, heightSegments = 1, openEnded = false, thetaStart = 0, thetaLength = Math.PI * 2) {
    super();
    const pos = [], idx = [], rows = [];
    let index = 0;
    const half = height / 2;
    for (let y = 0; y <= heightSegments; y++) {
      const row = [], v = y / heightSegments, radius = v * (radiusBottom - radiusTop) + radiusTop;
      for (let x = 0; x <= radialSegments; x++) {
        const t = x / radialSegments * thetaLength + thetaStart;
        pos.push(radius * Math.sin(t), -v * height + half, radius * Math.cos(t));
        row.push(index++);
      }
      rows.push(row);
    }
    for (let x = 0; x < radialSegments; x++) for (let y = 0; y < heightSegments; y++) {
      const a = rows[y][x], b = rows[y + 1][x], c = rows[y + 1][x + 1], d = rows[y][x + 1];
      idx.push(a, b, d, b, c, d);
    }
    const cap = top => {
      const sign = top ? 1 : -1, radius = top ? radiusTop : radiusBottom, c0 = index;
      for (let x = 1; x <= radialSegments; x++) { pos.push(0, half * sign, 0); index++; }
      const e0 = index;
      for (let x = 0; x <= radialSegments; x++) {
        const t = x / radialSegments * thetaLength + thetaStart;
        pos.push(radius * Math.sin(t), half * sign, radius * Math.cos(t)); index++;
      }
      for (let x = 0; x < radialSegments; x++) {
        const c = c0 + x, i = e0 + x;
        if (top) idx.push(i, i + 1, c); else idx.push(i + 1, i, c);
      }
    };
    if (!openEnded) { if (radiusTop > 0) cap(true); if (radiusBottom > 0) cap(false); }
    build(this, pos, idx);
  }
}
export class ConeGeometry extends CylinderGeometry {
  constructor(radius = 1, height = 1, radialSegments = 8, heightSegments = 1, openEnded = false, thetaStart = 0, thetaLength = Math.PI * 2) {
    super(0, radius, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength);
  }
}

// the regular solids, each face cut no finer (detail 0), its corners pushed out to the radius
class PolyhedronGeometry extends BufferGeometry {
  constructor(verts, faces, radius) {
    super();
    const pos = [], v = k => new Vector3(verts[k * 3], verts[k * 3 + 1], verts[k * 3 + 2]).normalize().multiplyScalar(radius);
    for (let i = 0; i < faces.length; i += 3) {
      const a = v(faces[i]), b = v(faces[i + 1]), c = v(faces[i + 2]);
      for (const p of [b, c, a]) pos.push(p.x, p.y, p.z);
    }
    build(this, pos);
  }
}
const PHI = (1 + Math.sqrt(5)) / 2;
export class IcosahedronGeometry extends PolyhedronGeometry {
  constructor(radius = 1) {
    const t = PHI;
    super([-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1],
      [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
        3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1], radius);
  }
}
export class OctahedronGeometry extends PolyhedronGeometry {
  constructor(radius = 1) {
    super([1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1], [0, 2, 4, 0, 4, 3, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 3, 1, 3, 4, 1, 4, 2], radius);
  }
}
export class DodecahedronGeometry extends PolyhedronGeometry {
  constructor(radius = 1) {
    const t = PHI, r = 1 / t;
    super([-1, -1, -1, -1, -1, 1, -1, 1, -1, -1, 1, 1, 1, -1, -1, 1, -1, 1, 1, 1, -1, 1, 1, 1,
      0, -r, -t, 0, -r, t, 0, r, -t, 0, r, t, -r, -t, 0, -r, t, 0, r, -t, 0, r, t, 0, -t, 0, -r, t, 0, -r, -t, 0, r, t, 0, r],
    [3, 11, 7, 3, 7, 15, 3, 15, 13, 7, 19, 17, 7, 17, 6, 7, 6, 15, 17, 4, 8, 17, 8, 10, 17, 10, 6, 8, 0, 16, 8, 16, 2, 8, 2, 10,
      0, 12, 1, 0, 1, 18, 0, 18, 16, 6, 10, 2, 6, 2, 13, 6, 13, 15, 2, 16, 18, 2, 18, 3, 2, 3, 13, 18, 1, 9, 18, 9, 11, 18, 11, 3,
      4, 14, 12, 4, 12, 0, 4, 0, 8, 11, 9, 5, 11, 5, 19, 11, 19, 7, 19, 5, 14, 19, 14, 4, 19, 4, 17, 1, 12, 14, 1, 14, 5, 1, 5, 9], radius);
  }
}

// flat shapes in the xy plane, facing +z
export class CircleGeometry extends BufferGeometry {
  constructor(radius = 1, segments = 8, thetaStart = 0, thetaLength = Math.PI * 2) {
    super();
    const pos = [0, 0, 0], idx = [];
    for (let s = 0; s <= segments; s++) { const a = thetaStart + s / segments * thetaLength; pos.push(radius * Math.cos(a), radius * Math.sin(a), 0); }
    for (let i = 1; i <= segments; i++) idx.push(i, i + 1, 0);
    build(this, pos, idx);
  }
}
export class RingGeometry extends BufferGeometry {
  constructor(innerRadius = 0.5, outerRadius = 1, thetaSegments = 8, phiSegments = 1, thetaStart = 0, thetaLength = Math.PI * 2) {
    super();
    const pos = [], idx = [];
    let radius = innerRadius;
    const step = (outerRadius - innerRadius) / phiSegments;
    for (let j = 0; j <= phiSegments; j++) {
      for (let i = 0; i <= thetaSegments; i++) { const a = thetaStart + i / thetaSegments * thetaLength; pos.push(radius * Math.cos(a), radius * Math.sin(a), 0); }
      radius += step;
    }
    for (let j = 0; j < phiSegments; j++) {
      const level = j * (thetaSegments + 1);
      for (let i = 0; i < thetaSegments; i++) {
        const s = i + level, a = s, b = s + thetaSegments + 1, c = s + thetaSegments + 2, d = s + 1;
        idx.push(a, b, d, b, c, d);
      }
    }
    build(this, pos, idx);
  }
}
export class PlaneGeometry extends BufferGeometry {
  constructor(width = 1, height = 1) {
    super();
    const pos = [];
    for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix < 2; ix++) pos.push(ix * width - width / 2, -(iy * height - height / 2), 0);
    build(this, pos, [0, 2, 1, 2, 3, 1]);
  }
}
// a profile of points (x out from the axis, y up) spun round the y axis
export class LatheGeometry extends BufferGeometry {
  constructor(points, segments = 12, phiStart = 0, phiLength = Math.PI * 2) {
    super();
    const pos = [], idx = [], n = points.length;
    for (let i = 0; i <= segments; i++) {
      const phi = phiStart + i / segments * phiLength, s = Math.sin(phi), c = Math.cos(phi);
      for (const p of points) pos.push(p.x * s, p.y, p.x * c);
    }
    for (let i = 0; i < segments; i++) for (let j = 0; j < n - 1; j++) {
      const base = j + i * n, a = base, b = base + n, c = base + n + 1, d = base + 1;
      idx.push(a, b, d, b, c, d);
    }
    build(this, pos, idx);
  }
}
