// The sea's creatures (game v676, Jordan): the gull and the dolphin, as flat-shaded pieces in their own colours.
// Shared by the game (index.html: gulls over the bays and straits, dolphin pods pacing the ship) and the random model
// generator (townsfolk.html), so both show the same shapes. A gull is a body and two wings, each a shoulder piece
// out to the elbow and a forearm piece to the black tip, hinged there so the wing can flap and, gliding, arch; a
// dolphin is its body and a tail hinged at its root, beating up and down. Forward is +z, up +y, its left +x.
import * as GFX from '../gfx/index.js';
import { makeDolphin, poseDolphinSkin, disposeDolphin } from './dolphin.js';
import { gullShape, gullSkin, poseGullSkin } from './gull.js';

export const GULL_COLORS = { white: '#eeeee8', grey: '#a3a9b2', tip: '#25272b', beak: '#e0ac38' };
export const DOLPHIN_COLORS = { back: '#56636f', belly: '#b7c0c6', fins: '#47525d', eye: '#15181b' };
// where the hinges sit: the shoulders off the body's middle, the elbows out along the wing, the tail's root
export const GULL_SHOULDER = [0.06, 0.03, 0.03], GULL_ELBOW = 0.34, DOLPHIN_TAIL = -0.3;

const colorCache = new Map();
const CC = h => { let k = colorCache.get(h); if (!k) { k = new GFX.Color(h); colorCache.set(h, k); } return k; };
let G = null, GP = null;
function prims() {
  if (G) return;
  G = { box: new GFX.BoxGeometry(1, 1, 1), cone4: new GFX.ConeGeometry(0.5, 1, 4), cone6: new GFX.ConeGeometry(0.5, 1, 6),
    ico: new GFX.IcosahedronGeometry(0.5, 0), frust7: new GFX.CylinderGeometry(0.26, 0.5, 1, 7) };
  GP = new Map();
  for (const k in G) GP.set(G[k], (G[k].index ? G[k].toNonIndexed() : G[k]).attributes.position.array);
}
let OUT = null;
const dummy = new GFX.Object3D(), segAxis = new GFX.Vector3(), segDir = new GFX.Vector3();
function tri(a, b, c, col) {
  const k = CC(col);
  OUT.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  OUT.c.push(k.r, k.g, k.b, k.r, k.g, k.b, k.r, k.g, k.b);
}
function emit(geo, color) {
  dummy.updateMatrix();
  const e = dummy.matrix.elements, src = GP.get(geo), k = CC(color);
  for (let i = 0; i < src.length; i += 3) {
    const px = src[i], py = src[i + 1], pz = src[i + 2];
    OUT.p.push(e[0] * px + e[4] * py + e[8] * pz + e[12], e[1] * px + e[5] * py + e[9] * pz + e[13], e[2] * px + e[6] * py + e[10] * pz + e[14]);
    OUT.c.push(k.r, k.g, k.b);
  }
}
function part(geo, color, x, y, z, { rx = 0, ry = 0, rz = 0, s = 1, sx = s, sy = s, sz = s } = {}) {
  dummy.position.set(x, y, z); dummy.quaternion.set(0, 0, 0, 1); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz);
  emit(geo, color);
}
function seg(geo, color, a, b, r) {
  segDir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = segDir.length();
  if (len < 1e-5) return;
  segDir.divideScalar(len);
  segAxis.set(segDir.z, 0, -segDir.x);
  const sl = segAxis.length();
  if (sl < 1e-6) segAxis.set(1, 0, 0); else segAxis.divideScalar(sl);
  dummy.quaternion.setFromAxisAngle(segAxis, Math.acos(Math.max(-1, Math.min(1, segDir.y))));
  dummy.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); dummy.scale.set(r * 2, len, r * 2);
  emit(geo, color);
}
// a flat piece: points [x, z] at height y (or [x, y, z]), as a fan
const flat = (pts, col, y = 0) => { const P = pts.map(p => p.length === 3 ? p : [p[0], y, p[1]]); for (let k = 1; k + 1 < P.length; k++) tri(P[0], P[k], P[k + 1], col); };
function make(fn) {
  OUT = { p: [], c: [] };
  fn();
  const g = new GFX.BufferGeometry();
  g.setAttribute('position', new GFX.BufferAttribute(new Float32Array(OUT.p), 3));
  g.setAttribute('color', new GFX.BufferAttribute(new Float32Array(OUT.c), 3));
  g.computeVertexNormals();
  OUT = null;
  return g;
}

let GEOS = null;
// every piece's geometry, made once: { gBody, gInner: [left, right], gOuter: [left, right], dFront, dTail }
export function seaLifeShapes() {
  if (GEOS) return GEOS;
  prims();
  const { white: W, grey: GR, tip: DK, beak: Y } = GULL_COLORS;
  const gBody = make(() => {
    part(G.ico, W, 0, 0, 0, { sx: 0.17, sy: 0.15, sz: 0.52 });
    // (v680, Jordan) the head carried level, in line with the body
    part(G.ico, W, 0, 0.01, 0.27, { s: 0.15 });
    part(G.cone4, Y, 0, 0, 0.39, { rx: Math.PI / 2, sx: 0.045, sy: 0.12, sz: 0.04 });
    part(G.box, W, 0, 0.01, -0.3, { sx: 0.13, sy: 0.02, sz: 0.16 });
    part(G.box, DK, 0.055, 0.035, 0.31, { s: 0.022 }); part(G.box, DK, -0.055, 0.035, 0.31, { s: 0.022 });
  });
  // a wing from its shoulder (x 0) out to its elbow, and from the elbow to its black tip; grey above, white under
  const inner = [[0, 0.1], [0.34, 0.07], [0.34, -0.1], [0, -0.15]], outer = [[0, 0.07], [0.24, 0.05], [0.24, -0.09], [0, -0.1]], tip = [[0.24, 0.05], [0.42, -0.06], [0.24, -0.09]];
  const side = (pts, s) => pts.map(([x, z]) => [x * s, z]);
  const gInner = [1, -1].map(s => make(() => { const p = side(inner, s); flat(p, GR, 0.006); flat(p, W, -0.006); }));
  const gOuter = [1, -1].map(s => make(() => {
    const p = side(outer, s), t = side(tip, s);
    flat(p, GR, 0.006); flat(p, W, -0.006); flat(t, DK, 0.006); flat(t, DK, -0.006);
  }));
  // the dolphin: grey-blue above, pale under, its body from the tail's root (z -0.3) to its beak (z 1.2), and its
  // tail from there back to the flukes
  const { back: D, belly: P, fins: Dd, eye: E } = DOLPHIN_COLORS;
  const dFront = make(() => {
    part(G.ico, D, 0, 0, 0.3, { sx: 0.44, sy: 0.42, sz: 1.3 });
    part(G.ico, P, 0, -0.07, 0.34, { sx: 0.37, sy: 0.32, sz: 1.12 });
    part(G.ico, D, 0, 0.02, 0.86, { sx: 0.3, sy: 0.28, sz: 0.42 });
    part(G.cone6, Dd, 0, -0.04, 1.1, { rx: Math.PI / 2, sx: 0.12, sy: 0.24, sz: 0.1 });
    part(G.box, E, 0.13, 0.03, 0.92, { s: 0.035 }); part(G.box, E, -0.13, 0.03, 0.92, { s: 0.035 });
    // the dorsal fin, swept back, and the flippers
    flat([[0.012, 0.17, 0.38], [0.012, 0.5, -0.12], [0.012, 0.17, -0.02]], Dd);
    flat([[-0.012, 0.17, 0.38], [-0.012, 0.5, -0.12], [-0.012, 0.17, -0.02]], Dd);
    for (const s of [1, -1]) flat([[0.17 * s, -0.12, 0.6], [0.44 * s, -0.27, 0.32], [0.17 * s, -0.12, 0.38]], Dd);
  });
  const dTail = make(() => {
    seg(G.frust7, D, [0, 0, 0.12], [0, 0.02, -0.78], 0.2);
    for (const s of [1, -1]) flat([[0, 0.02, -0.66], [0.38 * s, 0, -1.0], [0.3 * s, 0.01, -1.06], [0.05 * s, 0.02, -0.88]], Dd);
    flat([[0.05, 0.02, -0.88], [-0.05, 0.02, -0.88], [0, 0.02, -0.66]], Dd);
  });
  GEOS = { gBody, gInner, gOuter, dFront, dTail };
  return GEOS;
}
// a gull: style 1 (v687, the default) one shell weighted to bones (src/sea/gull.js) in skinMat (makeDolphinMat: its
// own normals), style 0 the first one (a body and hinged wing pieces) in mat. { g, style, wings | gull }
export function gullModel(mat, style = 1, skinMat = null) {
  if (style >= 1) {
    const shape = gullShape(), skin = gullSkin(shape), geo = new GFX.BufferGeometry(), n = shape.triangles.length * 3;
    const position = new GFX.BufferAttribute(new Float32Array(n), 3), nrm = new GFX.BufferAttribute(new Float32Array(n), 3);
    geo.setAttribute('position', position); geo.setAttribute('color', new GFX.BufferAttribute(shape.colors, 3)); geo.setAttribute('nrm', nrm);
    const mesh = new GFX.Mesh(geo, skinMat || mat), g = new GFX.Group();
    mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
    g.add(mesh);
    const m = { g, style: 1, gull: { mesh, skin, position, nrm } };
    poseGull(m, 0.3, -0.55);
    return m;
  }
  const S = seaLifeShapes(), g = new GFX.Group(), wings = [];
  g.add(new GFX.Mesh(S.gBody, mat));
  for (const s of [0, 1]) {
    const sd = s ? -1 : 1, sh = new GFX.Group(), el = new GFX.Group();
    sh.position.set(GULL_SHOULDER[0] * sd, GULL_SHOULDER[1], GULL_SHOULDER[2]);
    sh.add(new GFX.Mesh(S.gInner[s], mat));
    el.position.set(GULL_ELBOW * sd, 0, 0);
    el.add(new GFX.Mesh(S.gOuter[s], mat));
    sh.add(el); g.add(sh);
    wings.push([sh, el, sd]);
  }
  return { g, style: 0, wings };
}
// its wings at shoulder and elbow angles (radians, up from level; each wing the same, mirrored); smooth: the shell's
// normals smoothed (else faceted)
export function poseGull(m, shoulder, elbow, smooth = false) {
  if (m.gull) {
    const G = m.gull, pos = poseGullSkin(G.skin, shoulder, elbow), ids = G.skin.shape.triangles, out = G.position.array;
    for (let i = 0; i < ids.length; i++) { const j = ids[i] * 3; out[i * 3] = pos[j]; out[i * 3 + 1] = pos[j + 1]; out[i * 3 + 2] = pos[j + 2]; }
    G.position.needsUpdate = true;
    dolphinNormals(pos, ids, G.nrm.array, smooth); G.nrm.needsUpdate = true;
    return;
  }
  for (const [sh, el, sd] of m.wings) { sh.rotation.z = shoulder * sd; el.rotation.z = elbow * sd; }
}
// done with a sea creature: off the scene, and a skinned one's own buffers freed
export function dropSeaModel(m) {
  if (m.g.parent) m.g.parent.remove(m.g);
  if (m.dolphin) m.dolphin.mesh.geometry.dispose();
  if (m.gull) m.gull.mesh.geometry.dispose();
}
// the wings' angles at a flap's phase ph, flapping by A (0 gliding .. 0.62 full beats), arched by arch and droop
// when gliding (the game's GULLS.arch and droop)
export function gullWings(ph, A, arch, droop) {
  const fk = Math.max(0, Math.min(1, A / 0.62));
  return [(1 - fk) * arch + fk * 0.1 + A * Math.sin(ph), A * 0.75 * Math.sin(ph - 0.7) - (1 - fk) * droop];
}
// (v686, Jordan) the skinned dolphin's own material: lit by a normal per corner (dolphinNormals: each face's own, or
// smoothed over the faces round each vertex), and cut off below the water in the water's mirror pass (post.w)
export function makeDolphinMat() {
  return new GFX.ShaderMaterial({ uniforms: { k: { value: 1 } }, vertexColors: true, side: GFX.DoubleSide, attributes: { nrm: 'vec3f' }, lit: true,
    code: /* wgsl */ `
struct VOut { @builtin(position) pos: vec4f, @location(0) world: vec3f, @location(1) color: vec3f, @location(2) eye: vec3f, @location(3) n: vec3f }
@vertex fn vs(v: VIn) -> VOut {
  let w = (O.model * vec4f(v.position, 1.0)).xyz;
  let n = (O.model * vec4f(v.nrm, 0.0)).xyz;
  return VOut(F.viewProj * vec4f(w, 1.0), w, v.color, w - F.camPos.xyz, n);
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  if (F.post.w > 0.5 && i.world.y < F.post.z) { discard; }
  var N = normalize(i.n);
  let toward = select(-i.eye, -F.camDir.xyz, F.camPos.w > 0.5);
  if (dot(N, toward) < 0.0) { N = -N; }
  let c = shadeLit(i.color, vec3f(0.0), 0.0, 1.0, i.world, N, O.emissive.w > 0.5);
  return vec4f(applyFog(c, viewDepth(i.world)), 1.0);
}`,
  });
}
// a dolphin: style 1 (v685, the default) the delivered skinned dolphin (src/sea/dolphin.js, 3.6 tiles long) in
// skinMat (makeDolphinMat), style 0 the first one (pieces with a hinged tail, 2.3 long) in mat. { g, style, tail | dolphin }
export function dolphinModel(mat, style = 1, skinMat = null) {
  if (style >= 1) {
    const d = makeDolphin(GFX, { material: skinMat || mat });
    d.nrm = new GFX.BufferAttribute(new Float32Array(d.position.array.length), 3);
    d.mesh.geometry.setAttribute('nrm', d.nrm);
    return { g: d.g, style: 1, dolphin: d };
  }
  const S = seaLifeShapes(), g = new GFX.Group(), tail = new GFX.Group();
  g.add(new GFX.Mesh(S.dFront, mat));
  tail.position.set(0, 0, DOLPHIN_TAIL); tail.add(new GFX.Mesh(S.dTail, mat)); g.add(tail);
  return { g, style: 0, tail };
}
let SMOOTH_ACC = null;
// the skinned dolphin's normals from its posed vertices pos (indexed by tris), into out (one per drawn corner):
// faceted, each face's own; smooth, the faces round each vertex added up by their areas
function dolphinNormals(pos, tris, out, smooth) {
  const nt = tris.length / 3;
  if (smooth && (!SMOOTH_ACC || SMOOTH_ACC.length < pos.length)) SMOOTH_ACC = new Float32Array(pos.length);
  const acc = SMOOTH_ACC;
  if (smooth) acc.fill(0, 0, pos.length);
  for (let f = 0; f < nt; f++) {
    const a = tris[f * 3] * 3, b = tris[f * 3 + 1] * 3, c = tris[f * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (smooth) { for (const k of [a, b, c]) { acc[k] += nx; acc[k + 1] += ny; acc[k + 2] += nz; } continue; }
    const l = Math.hypot(nx, ny, nz) || 1;
    for (let k = 0; k < 3; k++) { const o = (f * 3 + k) * 3; out[o] = nx / l; out[o + 1] = ny / l; out[o + 2] = nz / l; }
  }
  if (smooth) for (let i = 0; i < tris.length; i++) {
    const k = tris[i] * 3, l = Math.hypot(acc[k], acc[k + 1], acc[k + 2]) || 1;
    out[i * 3] = acc[k] / l; out[i * 3 + 1] = acc[k + 1] / l; out[i * 3 + 2] = acc[k + 2] / l;
  }
}
// its swimming stroke at `cycles` through it (1 a beat), amp its strength (1 swimming, less in the air); smooth: the
// skinned one's normals smoothed (else faceted)
export function poseDolphinModel(m, cycles, amp = 1, smooth = false) {
  if (m.dolphin) {
    const d = m.dolphin, pos = poseDolphinSkin(d.skin, cycles, amp, 1), ids = d.skin.shape.triangles, out = d.position.array;
    for (let i = 0; i < ids.length; i++) { const j = ids[i] * 3; out[i * 3] = pos[j]; out[i * 3 + 1] = pos[j + 1]; out[i * 3 + 2] = pos[j + 2]; }
    d.position.needsUpdate = true;
    if (d.nrm) { dolphinNormals(pos, ids, d.nrm.array, smooth); d.nrm.needsUpdate = true; }
  } else m.tail.rotation.x = Math.sin(cycles * Math.PI * 2) * 0.32 * amp;
}
// done with it: the skinned one's own buffer freed
export const dropDolphinModel = m => dropSeaModel(m);
