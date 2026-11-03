// The sea's creatures (game v676, Jordan): the gull and the dolphin, as flat-shaded pieces in their own colours.
// Shared by the game (index.html: gulls over the bays and straits, dolphin pods pacing the ship) and the random model
// generator (townsfolk.html), so both show the same shapes. A gull is a body and two wings, each a shoulder piece
// out to the elbow and a forearm piece to the black tip, hinged there so the wing can flap and, gliding, arch; a
// dolphin is its body and a tail hinged at its root, beating up and down. Forward is +z, up +y, its left +x.
import * as GFX from '../gfx/index.js';

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
// a gull in mat: { g, wings: [[shoulder, elbow, side 1 left / -1 right], ...] }
export function gullModel(mat) {
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
  return { g, wings };
}
// its wings at shoulder and elbow angles (radians, up from level; each wing the same, mirrored)
export function poseGull(m, shoulder, elbow) { for (const [sh, el, sd] of m.wings) { sh.rotation.z = shoulder * sd; el.rotation.z = elbow * sd; } }
// the wings' angles at a flap's phase ph, flapping by A (0 gliding .. 0.62 full beats), arched by arch and droop
// when gliding (the game's GULLS.arch and droop)
export function gullWings(ph, A, arch, droop) {
  const fk = Math.max(0, Math.min(1, A / 0.62));
  return [(1 - fk) * arch + fk * 0.1 + A * Math.sin(ph), A * 0.75 * Math.sin(ph - 0.7) - (1 - fk) * droop];
}
// a dolphin in mat: { g, tail } (tail's rotation.x beats it)
export function dolphinModel(mat) {
  const S = seaLifeShapes(), g = new GFX.Group(), tail = new GFX.Group();
  g.add(new GFX.Mesh(S.dFront, mat));
  tail.position.set(0, 0, DOLPHIN_TAIL); tail.add(new GFX.Mesh(S.dTail, mat)); g.add(tail);
  return { g, tail };
}
