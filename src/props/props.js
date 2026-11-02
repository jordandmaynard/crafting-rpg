// (2026-11-02, Jordan) Town props, the shared indoor set from the "Town props by building" doc: furniture, storage,
// kitchen things, wall hangings and lights that most town buildings use. Each is built from boxes, cylinders and
// segments with the game's part/seg kit, so it can go into a chunk's merged static buffers later (no draw calls of its
// own). Shown in the random model generator (townsfolk.html) to be tweaked before any of it goes into the game.
//
// A prop stands on whole tiles: tiles [w, d] = w tiles across (x) by d deep (z), centred on the origin, the floor at
// y 0, its front toward +z. A wall prop (wall: true) has its back to a wall along the -z edge, its back WALL_IN in from
// the edge (where a wall's inner face stands). Props with seeded looks roll them in roll(r) (mulberry32: append new
// rolls at the END of a prop's roll, or kept seeds change); the rest look the same every seed. Woods (pine, oak, dark
// oak) are picked by the town's size, not the seed: rough pine in hamlets, oak in medium towns, dark oak in large.
import * as GFX from '../gfx/index.js';

export const WALL_IN = 0.13;   // a wall's half thickness: a wall prop's back stands this far in from its tile edge
export const CEIL = 2;         // a story's height (the game's WALL_H): where a hanging prop hangs from
export const WOODS = {
  pine: { name: 'Pine', tier: 'Hamlet', wood: '#9a7048', dark: '#5e4028', light: '#b88a5a' },
  oak: { name: 'Oak', tier: 'Medium town', wood: '#6a4a30', dark: '#43301f', light: '#8a6440' },
  darkOak: { name: 'Dark oak', tier: 'Large town', wood: '#4a3424', dark: '#2a1c12', light: '#6a4a30' },
};
// the game's bed blankets (index.html BLANKETS, same order), with names
export const BLANKETS = [['#8a2f2f', 'Madder red'], ['#2f4f8a', 'Woad blue'], ['#3f6a3a', 'Moss green'], ['#7a5a2a', 'Ochre'], ['#6a3a6a', 'Plum'],
  ['#2f6a6a', 'Teal'], ['#9a6a3a', 'Russet'], ['#5a5a7a', 'Slate'], ['#8a7a4a', 'Straw'], ['#4a3a5a', 'Damson'], ['#a04a3a', 'Brick'], ['#3a5a3a', 'Fern']];
const DYES = [['#8a2f2f', 'Madder red'], ['#2f4f8a', 'Woad blue'], ['#3f6a3a', 'Moss green'], ['#b08a3a', 'Weld yellow'], ['#6a3a6a', 'Plum'],
  ['#2f6a6a', 'Teal'], ['#9a5a32', 'Russet'], ['#d8ccb0', 'Undyed wool'], ['#2a2624', 'Black'], ['#a04a3a', 'Brick'], ['#c8a048', 'Gold'], ['#5a4a3a', 'Umber']];
const PAINTS = [['plain', 'Bare wood', null, 4], ['red', 'Madder red', '#7a2e26', 1], ['blue', 'Woad blue', '#34506e', 1], ['green', 'Moss green', '#3e5a36', 1], ['ochre', 'Ochre', '#8a6a2e', 1]];
const GLAZES = [['#e8e0cc', 'White tin glaze'], ['#c89a62', 'Honey glaze'], ['#5a7a5a', 'Green glaze'], ['#4a6a8a', 'Blue and white'], ['#8a5a3a', 'Brown slipware']];
const BOOKS = ['#6a2a24', '#2a3a5a', '#3a4a2a', '#5a3a1e', '#7a5a2a', '#2a2420', '#4a2a3a', '#8a6a4a', '#3a2a1e', '#5a1e1e', '#24343a'];
const IRON = '#2e2e34', IRON_LT = '#5a5a64', STONE = '#8a8276', CANDLE = '#ece4cc', FLAME = '#ffc860', FLAME_HOT = '#fff0b0', BONE = '#d8ceb0';

// ---------- the mesh kit (the game's own part/seg, as src/boats/brig.js copies it) ----------
const colorCache = new Map();
const CC = h => { let k = colorCache.get(h); if (!k) { k = new GFX.Color(h); colorCache.set(h, k); } return k; };
const shade = (c, f) => { const k = (typeof c === 'string' ? CC(c) : c).clone().multiplyScalar(f); k.r = Math.min(1, k.r); k.g = Math.min(1, k.g); k.b = Math.min(1, k.b); return k; };
const col = c => typeof c === 'string' ? CC(c) : c;
let G = null, GP = null;
function prims() {
  if (G) return;
  G = { box: new GFX.BoxGeometry(1, 1, 1), cone4: new GFX.ConeGeometry(0.5, 1, 4), cyl6: new GFX.CylinderGeometry(0.5, 0.5, 1, 6),
    cyl8: new GFX.CylinderGeometry(0.5, 0.5, 1, 8), cyl12: new GFX.CylinderGeometry(0.5, 0.5, 1, 12), oct: new GFX.OctahedronGeometry(0.5, 0) };
  GP = new Map();
  for (const k in G) GP.set(G[k], (G[k].index ? G[k].toNonIndexed() : G[k]).attributes.position.array);
}
class Buf {
  constructor() { this.p = []; this.c = []; }
  geometry() {
    if (!this.p.length) return null;
    const g = new GFX.BufferGeometry();
    g.setAttribute('position', new GFX.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('color', new GFX.BufferAttribute(new Float32Array(this.c), 3));
    g.computeVertexNormals();
    return g;
  }
}
let OUT = null, GLOW = null, OZ = 0;   // (OZ: a shift along z for everything drawn, set by a prop that sits off its tiles' middle)
const dummy = new GFX.Object3D(), segAxis = new GFX.Vector3(), segDir = new GFX.Vector3();
function tri(a, b, c, color, into) {
  const o = into === 'glow' ? GLOW : OUT, k = col(color);
  o.p.push(a[0], a[1], a[2] + OZ, b[0], b[1], b[2] + OZ, c[0], c[1], c[2] + OZ);
  for (let i = 0; i < 3; i++) o.c.push(k.r, k.g, k.b);
}
function emit(geo, color, into) {
  dummy.updateMatrix();
  const o = into === 'glow' ? GLOW : OUT, e = dummy.matrix.elements, src = GP.get(geo), k = col(color);
  const det = e[0] * (e[5] * e[10] - e[6] * e[9]) - e[4] * (e[1] * e[10] - e[2] * e[9]) + e[8] * (e[1] * e[6] - e[2] * e[5]);
  const sw = det < 0 ? [0, 1, -1] : [0, 0, 0];
  for (let i0 = 0; i0 < src.length; i0 += 3) {
    const i = i0 + sw[(i0 / 3) % 3] * 3, px = src[i], py = src[i + 1], pz = src[i + 2];
    o.p.push(e[0] * px + e[4] * py + e[8] * pz + e[12], e[1] * px + e[5] * py + e[9] * pz + e[13], e[2] * px + e[6] * py + e[10] * pz + e[14] + OZ);
    o.c.push(k.r, k.g, k.b);
  }
}
function part(geo, color, x, y, z, { ry = 0, rx = 0, rz = 0, s = 1, sx = s, sy = s, sz = s, into } = {}) {
  dummy.position.set(x, y, z); dummy.quaternion.set(0, 0, 0, 1); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz);
  emit(geo, color, into);
}
function seg(geo, color, a, b, r, into) {
  segDir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = segDir.length();
  if (len < 1e-5) return;
  segDir.divideScalar(len);
  segAxis.set(segDir.z, 0, -segDir.x);
  const sl = segAxis.length();
  if (sl < 1e-6) segAxis.set(1, 0, 0); else segAxis.divideScalar(sl);
  dummy.quaternion.setFromAxisAngle(segAxis, Math.acos(Math.max(-1, Math.min(1, segDir.y))));
  dummy.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); dummy.scale.set(r * 2, len, r * 2);
  emit(geo, color, into);
}
// a flat plate standing on the wall, facing +z: a polygon (x, y points round its edge, star-shaped about its first
// point's... about cx, cy) from z0 to z1, its front and back fanned from the middle, its edge walled
function plate(pts, cx, cy, z0, z1, color, ox = 0, oy = 0, edge = color) {
  const P = (p, z) => [ox + p[0], oy + p[1], z], m0 = [ox + cx, oy + cy, z0], m1 = [ox + cx, oy + cy, z1];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    tri(m1, P(a, z1), P(b, z1), color); tri(m0, P(b, z0), P(a, z0), color);
    tri(P(a, z0), P(b, z0), P(b, z1), edge); tri(P(a, z0), P(b, z1), P(a, z1), edge);
  }
}
// a barrel from a to b (its ends), r at the ends and rm at the belly: stepped staves in sections, iron hoops, lighter heads
function barrel(a, b, r, rm, wood, { hoops = [0.1, 0.32, 0.68, 0.9], n = 6, head = true } = {}) {
  const L = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, rr = r + (rm - r) * Math.sin(Math.PI * (t0 + t1) / 2);
    seg(G.cyl12, shade(wood, i % 2 ? 1 : 0.94), L(t0), L(t1), rr);
  }
  for (const t of hoops) { const rr = r + (rm - r) * Math.sin(Math.PI * t) + 0.012; seg(G.cyl12, IRON, L(t - 0.022), L(t + 0.022), rr); }
  if (head) for (const t of [0, 1]) seg(G.cyl12, shade(wood, 1.3), L(t === 0 ? -0.004 : 0.996), L(t === 0 ? 0.004 : 1.004), r - 0.02);
}
// a candle at (x, y, z) standing h tall, its flame in the glow buffer
function candle(x, y, z, h = 0.14, r = 0.022) {
  part(G.cyl8, CANDLE, x, y + h / 2, z, { sx: r * 2, sy: h, sz: r * 2 });
  part(G.oct, FLAME, x, y + h + 0.035, z, { sx: 0.035, sy: 0.075, sz: 0.035, into: 'glow' });
  part(G.oct, FLAME_HOT, x, y + h + 0.028, z, { sx: 0.018, sy: 0.04, sz: 0.018, into: 'glow' });
}
// the back of a wall prop on tiles d deep, and its middle's z for a body `depth` deep
const backZ = d => -d / 2 + WALL_IN;
const midZ = (d, depth) => backZ(d) + depth / 2;
// a box carcass (bookcase, shelf, cupboard top): sides, top, bottom, back; shelves at the heights given
function carcass(W, D, H, z, C, shelves) {
  part(G.box, C.wood, 0, H / 2, z - D / 2 + 0.01, { sx: W - 0.04, sy: H, sz: 0.02 });
  for (const s of [-1, 1]) part(G.box, C.dark, s * (W / 2 - 0.02), H / 2, z, { sx: 0.04, sy: H, sz: D });
  part(G.box, C.dark, 0, H - 0.02, z, { sx: W + 0.04, sy: 0.04, sz: D + 0.03 });
  part(G.box, C.dark, 0, 0.04, z, { sx: W, sy: 0.08, sz: D });
  for (const y of shelves) part(G.box, C.wood, 0, y, z, { sx: W - 0.06, sy: 0.03, sz: D - 0.02 });
}
const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
const wpick = (r, list) => { const tot = list.reduce((s, x) => s + x[x.length - 1], 0); let u = r() * tot; for (const x of list) { u -= x[x.length - 1]; if (u <= 0) return x; } return list[list.length - 1]; };
export function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// the bed's mattress, pillow and turned-down blanket on a frame whose top is at y `top` (the game's townBed)
function bedding(top, W, L, blanket) {
  part(G.box, '#e8e2d2', 0, top + 0.07, 0, { sx: W - 0.06, sy: 0.14, sz: L - 0.14 });
  part(G.box, '#f4f0e6', 0, top + 0.18, -L / 2 + 0.3, { sx: W - 0.24, sy: 0.1, sz: 0.3 });
  const b = CC(blanket), bl = L * 0.64, bc = L / 2 - 0.07 - bl / 2;
  part(G.box, b, 0, top + 0.155, bc, { sx: W + 0.02, sy: 0.03, sz: bl });
  for (const sa of [-1, 1]) part(G.box, shade(b, 0.85), sa * (W / 2 + 0.005), top + 0.04, bc, { sx: 0.025, sy: 0.24, sz: bl });
  part(G.box, shade(b, 1.25), 0, top + 0.175, bc - bl / 2 + 0.07, { sx: W + 0.03, sy: 0.03, sz: 0.14 });
}
// a shield's outline (a heater): flat top, straight sides, curving to a point; w half width, h0 top, h1 point
const heater = (w, h0, h1) => { const c = [[-w, h0], [-w, 0], [-w * 0.9, h1 * 0.36], [-w * 0.6, h1 * 0.7], [-w * 0.3, h1 * 0.91], [0, h1]]; return [...c, ...c.slice(0, -1).reverse().map(([x, y]) => [-x, y])]; };

// ---------- the props ----------
// group: where it's listed; tiles [w, d]; wall: backs onto a wall; hang: hangs from the ceiling (no floor tile);
// use and goes: from the doc; roll(r) -> the seeded look (null: none); build(L, C) draws it (C: the wood's colours);
// describe(L) -> rows [label, value, colour]
export const PROP_GROUPS = ['Beds', 'Seating', 'Tables', 'Storage', 'Kitchen', 'Floor and walls', 'Lights'];
export const PROPS = {
  bed: { name: 'Bed', group: 'Beds', tiles: [1, 2], wall: true, use: 'Sit, sleep', goes: 'Every house; inn rooms', inGame: true,
    roll: r => ({ blanket: pick(r, BLANKETS) }),
    describe: L => [['Blanket', L.blanket[1], L.blanket[0]]],
    build(L, C) {
      // (as the game's townBed: head against the wall at -z, the frame filling its two tiles; shifted a little off
      // the wall so the headboard clears the wall's inner face, and 4 cm shorter to fit)
      OZ = 0.08;
      const W = 0.86, Lg = 1.86, legH = 0.16, frameY = legH;
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) part(G.box, C.dark, sa * (W / 2 - 0.05), legH / 2, sb * (Lg / 2 - 0.05), { sx: 0.08, sy: legH, sz: 0.08 });
      part(G.box, C.wood, 0, frameY + 0.06, 0, { sx: W, sy: 0.12, sz: Lg });
      part(G.box, C.wood, 0, 0.47, -Lg / 2 + 0.04, { sx: W + 0.04, sy: 0.94, sz: 0.08 });
      part(G.box, C.dark, 0, 0.96, -Lg / 2 + 0.04, { sx: W + 0.1, sy: 0.06, sz: 0.12 });
      part(G.box, C.wood, 0, 0.34, Lg / 2 - 0.04, { sx: W + 0.04, sy: 0.4, sz: 0.08 });
      bedding(frameY + 0.12, W, Lg, L.blanket[0]);
    } },
  bunk: { name: 'Bunk bed', group: 'Beds', tiles: [1, 2], wall: true, use: 'Sleep (two folk)', goes: 'Guard house barracks, dock crew loft',
    roll: r => ({ low: pick(r, BLANKETS), high: pick(r, BLANKETS) }),
    describe: L => [['Lower', L.low[1], L.low[0]], ['Upper', L.high[1], L.high[0]]],
    build(L, C) {
      OZ = 0.08;
      const W = 0.86, Lg = 1.86, H = 1.78, lowY = 0.16, highY = 1.02;
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) part(G.box, C.dark, sa * (W / 2 - 0.04), H / 2, sb * (Lg / 2 - 0.04), { sx: 0.08, sy: H, sz: 0.08 });
      for (const y of [lowY, highY]) {
        part(G.box, C.wood, 0, y + 0.06, 0, { sx: W - 0.02, sy: 0.12, sz: Lg - 0.04 });
        for (const sb of [-1, 1]) part(G.box, C.wood, 0, y + 0.3, sb * (Lg / 2 - 0.04), { sx: W - 0.08, sy: 0.3, sz: 0.05 });
      }
      part(G.box, C.dark, 0, H - 0.03, -Lg / 2 + 0.04, { sx: W + 0.04, sy: 0.06, sz: 0.1 });
      bedding(lowY + 0.12, W - 0.04, Lg - 0.08, L.low[0]);
      bedding(highY + 0.12, W - 0.04, Lg - 0.08, L.high[0]);
      // the upper bunk's guard rail on the open side (toward the wall's side stays open: it's along a wall at -x
      // only in a corner), and the ladder at the foot
      part(G.box, C.wood, W / 2 - 0.03, highY + 0.42, -0.15, { sx: 0.05, sy: 0.06, sz: Lg - 0.7 });
      for (const z of [-0.6, 0.3]) part(G.box, C.wood, W / 2 - 0.03, highY + 0.28, z, { sx: 0.04, sy: 0.28, sz: 0.04 });
      const lx = W / 2 + 0.03;
      for (const z of [0.42, 0.78]) part(G.box, C.dark, lx, (highY + 0.4) / 2, z, { sx: 0.05, sy: highY + 0.4, sz: 0.05 });
      for (let k = 1; k <= 4; k++) part(G.box, C.wood, lx, k * 0.27, 0.6, { sx: 0.04, sy: 0.04, sz: 0.36 });
    } },
  stool: { name: 'Stool', group: 'Seating', tiles: [1, 1], use: 'Sit', goes: 'Houses, tavern bar, workshops',
    build(L, C) {
      part(G.cyl8, C.wood, 0, 0.43, 0, { sx: 0.36, sy: 0.05, sz: 0.36 });
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3 + 0.3;
        seg(G.cyl6, C.dark, [Math.cos(a) * 0.1, 0.41, Math.sin(a) * 0.1], [Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17], 0.022);
      }
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3 + 0.3, b = a + Math.PI * 2 / 3, R = 0.14;
        seg(G.cyl6, C.dark, [Math.cos(a) * R, 0.16, Math.sin(a) * R], [Math.cos(b) * R, 0.16, Math.sin(b) * R], 0.012);
      }
    } },
  chair: { name: 'Chair', group: 'Seating', tiles: [1, 1], use: 'Sit', goes: 'Houses, tavern, bank, cartographer',
    build(L, C) {
      const sx = 0.2, sz = 0.19, seatY = 0.45;
      part(G.box, C.wood, 0, seatY, 0, { sx: 0.46, sy: 0.05, sz: 0.44 });
      for (const a of [-1, 1]) {
        part(G.box, C.dark, a * sx, seatY / 2, sz, { sx: 0.05, sy: seatY, sz: 0.05 });
        part(G.box, C.dark, a * sx, 0.52, -sz, { sx: 0.05, sy: 1.04, sz: 0.05 });
        part(G.box, C.dark, a * sx, 0.14, 0, { sx: 0.03, sy: 0.03, sz: sz * 2 });
      }
      part(G.box, C.dark, 0, 0.14, sz, { sx: sx * 2, sy: 0.03, sz: 0.03 });
      for (const y of [0.64, 0.79]) part(G.box, C.wood, 0, y, -sz, { sx: sx * 2, sy: 0.07, sz: 0.03 });
      part(G.box, C.dark, 0, 0.98, -sz, { sx: sx * 2 + 0.08, sy: 0.08, sz: 0.06 });
    } },
  bench: { name: 'Long bench', group: 'Seating', tiles: [2, 1], use: 'Sit (two)', goes: 'Tavern, chapel, guard house mess, houses',
    build(L, C) {
      part(G.box, C.wood, 0, 0.44, 0, { sx: 1.7, sy: 0.06, sz: 0.32 });
      for (const s of [-1, 1]) {
        part(G.box, C.dark, s * 0.64, 0.21, 0, { sx: 0.06, sy: 0.42, sz: 0.26 });
        part(G.box, C.dark, s * 0.64, 0.03, 0, { sx: 0.1, sy: 0.06, sz: 0.34 });
      }
      part(G.box, C.dark, 0, 0.16, 0, { sx: 1.28, sy: 0.06, sz: 0.04 });
    } },
  roundTable: { name: 'Round table', group: 'Tables', tiles: [1, 1], use: 'Sit, eat', goes: 'Houses, tavern corners',
    build(L, C) {
      part(G.cyl12, C.wood, 0, 0.72, 0, { sx: 0.82, sy: 0.05, sz: 0.82 });
      part(G.cyl12, C.dark, 0, 0.68, 0, { sx: 0.7, sy: 0.04, sz: 0.7 });
      part(G.cyl8, C.dark, 0, 0.35, 0, { sx: 0.12, sy: 0.68, sz: 0.12 });
      for (const ry of [Math.PI / 4, -Math.PI / 4]) part(G.box, C.dark, 0, 0.04, 0, { sx: 0.62, sy: 0.07, sz: 0.08, ry });
    } },
  longTable: { name: 'Long table', group: 'Tables', tiles: [2, 1], use: 'Sit, eat (four)', goes: 'Houses, tavern, guard house mess',
    build(L, C) { table(1.76, 0.82, 2, C); } },
  feastTable: { name: 'Feast table', group: 'Tables', tiles: [3, 1], use: 'Sit, eat (four to six)', goes: 'Large tavern, clergy house refectory',
    roll: r => ({ runner: r() < 0.7 ? pick(r, DYES) : null }),
    describe: L => [['Runner', L.runner ? L.runner[1] : 'None', L.runner?.[0]]],
    build(L, C) {
      table(2.76, 0.9, 3, C);
      if (L.runner) {
        const k = CC(L.runner[0]);
        part(G.box, k, 0, 0.778, 0, { sx: 2.4, sy: 0.008, sz: 0.36 });
        for (const s of [-1, 1]) part(G.box, shade(k, 0.8), s * 1.2, 0.74, 0, { sx: 0.008, sy: 0.08, sz: 0.36 });
      }
    } },
  desk: { name: 'Desk with ledger', group: 'Tables', tiles: [2, 1], wall: true, use: 'Work', goes: 'Bank, cartographer, merchant, captain',
    roll: r => ({ cover: pick(r, BOOKS) }),
    describe: L => [['Ledger', 'Leather cover', L.cover]],
    build(L, C) {
      const D = 0.62, z = midZ(1, D), top = 0.76;
      part(G.box, C.wood, 0, top - 0.025, z, { sx: 1.5, sy: 0.05, sz: D });
      // drawers on the left, two legs on the right
      part(G.box, C.dark, -0.5, (top - 0.05) / 2, z, { sx: 0.46, sy: top - 0.05, sz: D - 0.04 });
      for (let k = 0; k < 3; k++) {
        const y = 0.12 + k * 0.22;
        part(G.box, C.wood, -0.5, y + 0.08, z + D / 2 - 0.01, { sx: 0.4, sy: 0.18, sz: 0.02 });
        part(G.box, '#b8903a', -0.5, y + 0.08, z + D / 2 + 0.005, { sx: 0.06, sy: 0.025, sz: 0.02 });
      }
      for (const dz of [-1, 1]) part(G.box, C.dark, 0.68, (top - 0.05) / 2, z + dz * (D / 2 - 0.04), { sx: 0.06, sy: top - 0.05, sz: 0.06 });
      part(G.box, C.dark, 0.68, 0.12, z, { sx: 0.04, sy: 0.04, sz: D - 0.1 });
      // the open ledger, ink and a quill, a candle
      part(G.box, L.cover, 0.05, top + 0.01, z + 0.05, { sx: 0.5, sy: 0.02, sz: 0.34 });
      for (const s of [-1, 1]) part(G.box, '#e4d8b8', 0.05 + s * 0.12, top + 0.03, z + 0.05, { sx: 0.23, sy: 0.02, sz: 0.31, rz: s * 0.06 });
      part(G.cyl8, '#1e1a1a', 0.42, top + 0.035, z - 0.1, { sx: 0.07, sy: 0.07, sz: 0.07 });
      seg(G.box, '#ece8dc', [0.42, top + 0.06, z - 0.1], [0.5, top + 0.24, z - 0.16], 0.01);
      part(G.cyl8, '#b8903a', 0.6, top + 0.01, z - 0.12, { sx: 0.1, sy: 0.02, sz: 0.1 });
      candle(0.6, top + 0.02, z - 0.12, 0.12);
    } },
  wardrobe: { name: 'Wardrobe', group: 'Storage', tiles: [1, 1], wall: true, use: 'Show', goes: 'Bedrooms, upstairs in two-story houses',
    build(L, C) {
      const W = 0.92, D = 0.55, H = 1.85, z = midZ(1, D), f = z + D / 2;
      part(G.box, C.wood, 0, H / 2 + 0.04, z, { sx: W, sy: H - 0.08, sz: D });
      part(G.box, C.dark, 0, H + 0.02, z + 0.01, { sx: W + 0.06, sy: 0.08, sz: D + 0.05 });
      part(G.box, C.dark, 0, 0.06, z + 0.01, { sx: W + 0.03, sy: 0.08, sz: D + 0.03 });
      for (const s of [-1, 1]) {
        part(G.box, C.light, s * W / 4, 0.98, f + 0.008, { sx: W / 2 - 0.06, sy: 1.6, sz: 0.016 });
        for (const y of [0.55, 1.4]) part(G.box, C.wood, s * W / 4, y, f + 0.018, { sx: W / 2 - 0.16, sy: y < 1 ? 0.6 : 0.62, sz: 0.012 });
        part(G.cyl8, '#b8903a', s * 0.05, 1.0, f + 0.03, { sx: 0.035, sy: 0.03, sz: 0.035, rx: Math.PI / 2 });
      }
      part(G.box, C.dark, 0, 0.98, f + 0.01, { sx: 0.015, sy: 1.6, sz: 0.02 });
    } },
  chest: { name: 'Chest', group: 'Storage', tiles: [1, 1], use: 'Show (at a bed\'s foot)', goes: 'Beside beds, all town sizes',
    roll: r => ({ paint: wpick(r, PAINTS) }),
    describe: L => [['Paint', L.paint[1], L.paint[2]]],
    build(L, C) {
      const W = 0.82, D = 0.46, H = 0.4, body = L.paint[2] || C.wood;
      part(G.box, body, 0, H / 2 + 0.03, 0, { sx: W, sy: H - 0.06, sz: D });
      part(G.box, L.paint[2] ? shade(body, 1.2) : C.light, 0, H + 0.03, 0, { sx: W + 0.03, sy: 0.08, sz: D + 0.03 });
      part(G.box, C.dark, 0, 0.03, 0, { sx: W + 0.02, sy: 0.06, sz: D + 0.02 });
      for (const x of [-0.27, 0.27]) {
        part(G.box, IRON, x, H / 2 + 0.04, D / 2 + 0.012, { sx: 0.05, sy: H, sz: 0.012 });
        part(G.box, IRON, x, H / 2 + 0.04, -D / 2 - 0.012, { sx: 0.05, sy: H, sz: 0.012 });
        part(G.box, IRON, x, H + 0.075, 0, { sx: 0.05, sy: 0.012, sz: D + 0.05 });
      }
      part(G.box, IRON_LT, 0, H - 0.04, D / 2 + 0.016, { sx: 0.09, sy: 0.11, sz: 0.012 });
      for (const s of [-1, 1]) part(G.box, IRON, s * (W / 2 + 0.015), H * 0.6, 0, { sx: 0.02, sy: 0.04, sz: 0.16 });
    } },
  crate: { name: 'Crate', group: 'Storage', tiles: [1, 1], wall: true, use: 'Show; the hero\'s crate stores 10', goes: 'Stores, dock, workshops', inGame: true,
    build(L, C) {
      // (as the game's crate, CRATE_SIZE 0.72, its own planks' colours)
      const S = 0.72, H2 = S * 0.8, wood = '#a8784a', dark = '#6a4428', z = midZ(1, S);
      part(G.box, wood, 0, H2 / 2, z, { sx: S - 0.02, sy: H2 - 0.02, sz: S - 0.02 });
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) part(G.box, dark, sa * (S / 2 - 0.035), H2 / 2, z + sb * (S / 2 - 0.035), { sx: 0.07, sy: H2, sz: 0.07 });
      for (const yy of [0.035, H2 - 0.035]) for (const sa of [-1, 1]) {
        part(G.box, dark, sa * (S / 2 - 0.03), yy, z, { sx: 0.06, sy: 0.07, sz: S });
        part(G.box, dark, 0, yy, z + sa * (S / 2 - 0.03), { sx: S, sy: 0.07, sz: 0.06 });
      }
      for (const sb of [-1, 1]) part(G.box, dark, 0, H2 / 2, z + sb * (S / 2 - 0.005), { sx: S * 0.95, sy: 0.06, sz: 0.02, rz: 0.72 });
      for (const sa of [-1, 1]) part(G.box, dark, sa * (S / 2 - 0.005), H2 / 2, z, { sx: S * 0.95, sy: 0.06, sz: 0.02, ry: Math.PI / 2, rz: 0.72 });
      for (let k = -1; k <= 1; k++) part(G.box, k ? wood : '#b88a58', 0, H2 + 0.005, z + k * S * 0.28, { sx: S - 0.1, sy: 0.02, sz: S * 0.27 });
    } },
  barrel: { name: 'Barrel', group: 'Storage', tiles: [1, 1], use: 'Show', goes: 'Tavern, cellars, dock, carter\'s yard',
    build(L, C) { barrel([0, 0, 0], [0, 0.9, 0], 0.26, 0.31, shade(C.light, 1.05)); } },
  barrelRack: { name: 'Barrel rack with taps', group: 'Storage', tiles: [2, 1], wall: true, use: 'Work: the innkeeper draws ale', goes: 'Tavern, innkeeper\'s house',
    build(L, C) {
      const z0 = backZ(1) + 0.04, z1 = z0 + 0.78, zm = (z0 + z1) / 2, cy = 0.62;
      for (const sx of [-0.94, 0.94]) for (const z of [z0 + 0.04, z1 - 0.04]) part(G.box, C.dark, sx, 0.2, z, { sx: 0.07, sy: 0.4, sz: 0.07 });
      for (const z of [z0 + 0.04, z1 - 0.04]) part(G.box, C.dark, 0, 0.36, z, { sx: 1.95, sy: 0.08, sz: 0.08 });
      for (const x of [-0.62, 0, 0.62]) {
        for (const z of [z0 + 0.04, z1 - 0.04]) for (const s of [-1, 1]) part(G.box, C.wood, x + s * 0.2, 0.43, z, { sx: 0.1, sy: 0.08, sz: 0.09, rz: s * 0.5 });
        barrel([x, cy, z0], [x, cy, z1], 0.24, 0.28, shade(C.light, 1.05), { hoops: [0.08, 0.3, 0.7, 0.92] });
        part(G.box, '#b8903a', x, cy - 0.12, z1 + 0.03, { sx: 0.04, sy: 0.04, sz: 0.06 });
        part(G.box, '#b8903a', x, cy - 0.16, z1 + 0.055, { sx: 0.03, sy: 0.08, sz: 0.03 });
      }
    } },
  shelf: { name: 'Tall shelf', group: 'Storage', tiles: [1, 1], wall: true, use: 'Show', goes: 'Every shop, kitchens',
    roll(r) {
      // each shelf filled left to right with goods: jars, crocks, sacks, bottles, boxes, bowls, cheeses
      const KINDS = [['jar', 3], ['crock', 2], ['sack', 2], ['bottle', 2], ['box', 2], ['bowls', 1], ['cheese', 1]];
      const W = { jar: 0.13, crock: 0.2, sack: 0.24, bottle: 0.08, box: 0.22, bowls: 0.18, cheese: 0.2 };
      const shelves = [];
      for (let s = 0; s < 4; s++) {
        const row = []; let x = -0.38 + r() * 0.05;
        while (true) {
          const k = wpick(r, KINDS)[0], w = W[k] * (0.85 + r() * 0.3);
          if (x + w > 0.38) break;
          row.push({ k, x: x + w / 2, w, c: k === 'jar' || k === 'bottle' ? pick(r, ['#6a8a6a', '#8a6a3a', '#4a6a7a', '#a89a7a', '#5a3a2a']) : k === 'crock' || k === 'bowls' ? pick(r, GLAZES)[0] : null, h: r() });
          x += w + 0.02 + r() * 0.05;
        }
        shelves.push(row);
      }
      return { shelves };
    },
    describe: L => [['Goods', `${L.shelves.reduce((n, s) => n + s.length, 0)} things on 4 shelves`]],
    build(L, C) {
      const W = 0.9, D = 0.36, H = 1.8, z = midZ(1, D), ys = [0.08, 0.5, 0.92, 1.34];
      carcass(W, D, H, z, C, ys.slice(1));
      L.shelves.forEach((row, s) => { const y = ys[s] + (s ? 0.015 : 0.04); for (const g of row) good(g, y, z); });
    } },
  bookcase: { name: 'Bookcase', group: 'Storage', tiles: [1, 1], wall: true, use: 'Show', goes: 'Clergy house, cartographer, bank, elder',
    roll(r) {
      const shelves = [];
      for (let s = 0; s < 4; s++) {
        const row = []; let x = -0.39;
        while (x < 0.36) {
          if (r() < 0.06) { x += 0.06 + r() * 0.1; continue; }   // (a gap)
          if (r() < 0.08 && x < 0.2) {                           // (a pile lying flat)
            const n = 2 + Math.floor(r() * 3), w = 0.18 + r() * 0.06;
            for (let k = 0; k < n; k++) row.push({ flat: true, x: x + w / 2, w, t: 0.035 + r() * 0.02, d: 0.2 + r() * 0.04, c: pick(r, BOOKS), k });
            x += w + 0.02; continue;
          }
          const w = 0.035 + r() * 0.035, h = 0.2 + r() * 0.13;
          row.push({ x: x + w / 2, w, h, d: 0.19 + r() * 0.06, c: pick(r, BOOKS), band: r() < 0.4 });
          x += w + 0.004;
        }
        if (row.length && !row[row.length - 1].flat && r() < 0.5 && row[row.length - 1].x < 0.24) row[row.length - 1].lean = 0.3 + r() * 0.2;
        shelves.push(row);
      }
      return { shelves };
    },
    describe: L => [['Books', `${L.shelves.reduce((n, s) => n + s.length, 0)} on 4 shelves`]],
    build(L, C) {
      const W = 0.9, D = 0.34, H = 1.8, z = midZ(1, D), ys = [0.08, 0.5, 0.92, 1.34];
      carcass(W, D, H, z, C, ys.slice(1));
      L.shelves.forEach((row, s) => {
        const y = ys[s] + (s ? 0.015 : 0.04);
        let pile = 0;
        for (const b of row) {
          if (b.flat) { if (b.k === 0) pile = y; part(G.box, b.c, b.x, pile + b.t / 2, z, { sx: b.w, sy: b.t, sz: b.d }); pile += b.t; continue; }
          const rz = b.lean || 0, bx = b.x + (rz ? Math.sin(rz) * b.h / 2 : 0), by = y + Math.cos(rz) * b.h / 2;
          part(G.box, b.c, bx, by, z, { sx: b.w, sy: b.h, sz: b.d, rz: -rz });
          if (b.band) part(G.box, '#c8a048', bx, by + b.h * 0.3, z + b.d / 2 + 0.002, { sx: b.w + 0.002, sy: 0.015, sz: 0.004, rz: -rz });
        }
      });
    } },
  hearth: { name: 'Cooking hearth', group: 'Kitchen', tiles: [2, 1], wall: true, use: 'Work: cooking; light', goes: 'Every house kitchen, tavern, bakery',
    build(L, C) {
      const z0 = backZ(1), D = 0.72, z = z0 + D / 2;
      // stone courses: each block its own shade
      const block = (x, y, zz, sx, sy, sz, i) => part(G.box, shade(STONE, 0.86 + 0.18 * ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1), x, y, zz, { sx, sy, sz });
      block(0, 0.1, z + 0.02, 1.7, 0.2, D + 0.04, 1);                 // the hearthstone
      let i = 2;
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) block(s * 0.68, 0.32 + k * 0.2, z, 0.26 + (k % 2) * 0.04, 0.19, D - 0.04, i++);
      part(G.box, '#2a2420', 0, 0.62, z0 + 0.06, { sx: 1.1, sy: 0.85, sz: 0.1 });      // sooty fireback
      part(G.box, C.dark, 0, 1.1, z + D / 2 - 0.08, { sx: 1.7, sy: 0.16, sz: 0.18 });   // the oak lintel
      // the hood narrowing up to the ceiling
      for (let k = 0; k < 4; k++) { const t = k / 3; block(0, 1.3 + k * 0.2, z0 + (D - 0.12) * (1 - t * 0.45) / 2, 1.6 - t * 0.7, 0.21, (D - 0.12) * (1 - t * 0.45), i++); }
      // the fire: crossed logs, embers, flames
      for (const s of [-1, 1]) seg(G.cyl6, '#3a2618', [-0.32 * s, 0.24, z - 0.12], [0.3 * s, 0.3, z + 0.1], 0.05);
      part(G.box, '#ff6a2a', 0, 0.22, z, { sx: 0.6, sy: 0.03, sz: 0.36, into: 'glow' });
      for (const [x, h, zz] of [[-0.12, 0.3, -0.02], [0.1, 0.36, 0.03], [0, 0.44, -0.06], [0.22, 0.24, -0.04], [-0.24, 0.22, 0.05]]) {
        part(G.oct, FLAME, x, 0.3 + h / 2, z + zz, { sx: 0.12, sy: h, sz: 0.12, into: 'glow' });
        part(G.oct, FLAME_HOT, x, 0.28 + h * 0.35, z + zz, { sx: 0.06, sy: h * 0.6, sz: 0.06, into: 'glow' });
      }
      // a pot hung from an iron crane swung out from the left cheek
      seg(G.cyl6, IRON, [-0.52, 0.3, z - 0.1], [-0.52, 1.0, z - 0.1], 0.015);
      seg(G.cyl6, IRON, [-0.52, 0.95, z - 0.1], [0.02, 0.95, z - 0.02], 0.014);
      seg(G.cyl6, IRON, [0.02, 0.95, z - 0.02], [0.02, 0.72, z - 0.02], 0.008);
      part(G.cyl8, '#24242a', 0.02, 0.62, z - 0.02, { sx: 0.3, sy: 0.2, sz: 0.3 });
      part(G.cyl8, '#34343a', 0.02, 0.725, z - 0.02, { sx: 0.32, sy: 0.02, sz: 0.32 });
    } },
  cupboard: { name: 'Cupboard with crockery', group: 'Kitchen', tiles: [1, 1], wall: true, use: 'Show', goes: 'Kitchens, tavern',
    roll: r => ({ glaze: pick(r, GLAZES), mugs: 2 + Math.floor(r() * 3) }),
    describe: L => [['Crockery', L.glaze[1], L.glaze[0]], ['Mugs', String(L.mugs)]],
    build(L, C) {
      const W = 0.9, D = 0.46, z = midZ(1, D), f = z + D / 2, low = 0.86;
      // the closed cupboard below
      part(G.box, C.wood, 0, low / 2, z, { sx: W, sy: low, sz: D });
      part(G.box, C.dark, 0, low + 0.02, z + 0.01, { sx: W + 0.04, sy: 0.04, sz: D + 0.03 });
      for (const s of [-1, 1]) {
        part(G.box, C.light, s * W / 4, low / 2 + 0.02, f + 0.008, { sx: W / 2 - 0.06, sy: low - 0.16, sz: 0.016 });
        part(G.cyl8, '#b8903a', s * 0.06, low / 2 + 0.05, f + 0.025, { sx: 0.03, sy: 0.025, sz: 0.03, rx: Math.PI / 2 });
      }
      // the open rack above: a back board, two shallow shelves with a rail, plates stood up along them
      const zb = backZ(1), Ds = 0.2, zs = zb + Ds / 2;
      part(G.box, C.wood, 0, 1.35, zb + 0.01, { sx: W - 0.04, sy: 0.92, sz: 0.02 });
      for (const s of [-1, 1]) part(G.box, C.dark, s * (W / 2 - 0.02), 1.35, zs, { sx: 0.04, sy: 0.92, sz: Ds });
      part(G.box, C.dark, 0, 1.82, zs + 0.01, { sx: W + 0.04, sy: 0.04, sz: Ds + 0.04 });
      const g = CC(L.glaze[0]), rim = shade(g, 0.8);
      for (const y of [1.18, 1.52]) {
        part(G.box, C.wood, 0, y, zs, { sx: W - 0.06, sy: 0.025, sz: Ds });
        part(G.box, C.dark, 0, y + 0.07, zs + Ds / 2 - 0.01, { sx: W - 0.06, sy: 0.015, sz: 0.015 });
        for (let k = 0; k < 4; k++) {
          const x = -0.3 + k * 0.2;
          part(G.cyl12, g, x, y + 0.12, zb + 0.06, { sx: 0.2, sy: 0.018, sz: 0.2, rx: Math.PI / 2 - 0.22 });
          part(G.cyl12, rim, x, y + 0.12, zb + 0.067, { sx: 0.12, sy: 0.012, sz: 0.12, rx: Math.PI / 2 - 0.22 });
        }
      }
      // mugs on the cupboard's top
      for (let k = 0; k < L.mugs; k++) {
        const x = -0.3 + k * 0.17;
        part(G.cyl8, g, x, low + 0.1, z + 0.05, { sx: 0.08, sy: 0.12, sz: 0.08 });
        part(G.box, rim, x + 0.05, low + 0.1, z + 0.05, { sx: 0.025, sy: 0.07, sz: 0.015 });
      }
    } },
  washtub: { name: 'Washtub', group: 'Kitchen', tiles: [1, 1], use: 'Work: washing', goes: 'Houses, tannery yard',
    build(L, C) {
      barrel([0, 0, 0], [0, 0.34, 0], 0.32, 0.34, shade(C.light, 1.05), { hoops: [0.2, 0.8], n: 2, head: false });
      part(G.cyl12, '#5a6e78', 0, 0.28, 0, { sx: 0.6, sy: 0.02, sz: 0.6 });
      part(G.cyl12, shade(C.light, 0.9), 0, 0.01, 0, { sx: 0.64, sy: 0.02, sz: 0.64 });
      // a washboard leant in it and a cake of soap on the rim
      part(G.box, C.wood, 0.05, 0.42, -0.12, { sx: 0.3, sy: 0.55, sz: 0.03, rx: -0.35 });
      for (let k = 0; k < 6; k++) part(G.box, C.light, 0.05, 0.3 + k * 0.05, -0.1 + k * 0.018, { sx: 0.26, sy: 0.015, sz: 0.02, rx: -0.35 });
      part(G.box, '#e8dcc0', 0.22, 0.355, 0.2, { sx: 0.08, sy: 0.04, sz: 0.05, ry: 0.5 });
    } },
  rug: { name: 'Rug', group: 'Floor and walls', tiles: [2, 2], use: 'Walk over (no collision)', goes: 'Houses, bank, clergy house', rug: true,
    roll: rugRoll, describe: rugDescribe, build(L) { rug(1.7, 1.7, L); } },
  runner: { name: 'Long rug', group: 'Floor and walls', tiles: [2, 3], use: 'Walk over (no collision)', goes: 'Large houses, tavern, bank', rug: true,
    roll: rugRoll, describe: rugDescribe, build(L) { rug(1.7, 2.7, L); } },
  tapestry: { name: 'Tapestry', group: 'Floor and walls', tiles: [2, 1], wall: true, hang: true, use: 'Show (on the wall, no floor tile)', goes: 'Large houses, tavern, guard house, bank',
    roll(r) {
      const field = pick(r, DYES); let border = pick(r, DYES), motif = pick(r, DYES);
      for (let k = 0; k < 6 && border[0] === field[0]; k++) border = pick(r, DYES);
      for (let k = 0; k < 6 && (motif[0] === field[0]); k++) motif = pick(r, DYES);
      return { field, border, motif, design: wpick(r, [['tree', 'A tree', 2], ['lozenges', 'Three lozenges', 2], ['sun', 'A sun', 1.5], ['bands', 'Bands', 1.5], ['stag', 'A stag\'s head', 1]]) };
    },
    describe: L => [['Design', L.design[1]], ['Field', L.field[1], L.field[0]], ['Border', L.border[1], L.border[0]], ['Motif', L.motif[1], L.motif[0]]],
    build(L, C) {
      const z = backZ(1) + 0.012, W = 1.5, y0 = 0.5, y1 = 1.84, ym = (y0 + y1) / 2, F = CC(L.field[0]), B = CC(L.border[0]), M = CC(L.motif[0]);
      seg(G.cyl8, C.dark, [-W / 2 - 0.1, y1 + 0.04, z + 0.02], [W / 2 + 0.1, y1 + 0.04, z + 0.02], 0.022);
      for (const s of [-1, 1]) part(G.oct, '#b8903a', s * (W / 2 + 0.12), y1 + 0.04, z + 0.02, { s: 0.07 });
      part(G.box, B, 0, ym, z, { sx: W, sy: y1 - y0, sz: 0.014 });
      part(G.box, F, 0, ym, z + 0.006, { sx: W - 0.16, sy: y1 - y0 - 0.16, sz: 0.008 });
      const f = z + 0.012, d = L.design[0];
      if (d === 'tree') {
        part(G.box, shade(M, 0.7), 0, y0 + 0.42, f, { sx: 0.1, sy: 0.5, sz: 0.006 });
        for (const [x, y, s] of [[0, 1.4, 0.55], [-0.2, 1.22, 0.4], [0.2, 1.22, 0.4]]) part(G.box, M, x, y, f + 0.001, { sx: s * 0.7, sy: s * 0.7, sz: 0.006, rz: Math.PI / 4 });
      } else if (d === 'lozenges') {
        for (const x of [-0.4, 0, 0.4]) part(G.box, M, x, ym, f, { sx: 0.22, sy: 0.22, sz: 0.006, rz: Math.PI / 4 });
      } else if (d === 'sun') {
        part(G.cyl12, M, 0, ym, f, { sx: 0.4, sy: 0.006, sz: 0.4, rx: Math.PI / 2 });
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; part(G.box, M, Math.cos(a) * 0.32, ym + Math.sin(a) * 0.32, f, { sx: 0.16, sy: 0.05, sz: 0.006, rz: a }); }
      } else if (d === 'bands') {
        for (const x of [-0.42, -0.14, 0.14, 0.42]) part(G.box, M, x, ym, f, { sx: 0.1, sy: y1 - y0 - 0.16, sz: 0.006 });
      } else {
        part(G.box, M, 0, ym - 0.05, f, { sx: 0.2, sy: 0.32, sz: 0.006 });
        part(G.box, M, 0, ym - 0.24, f, { sx: 0.12, sy: 0.14, sz: 0.006, rz: Math.PI / 4 });
        for (const s of [-1, 1]) {
          seg(G.box, M, [s * 0.08, ym + 0.08, f], [s * 0.36, ym + 0.46, f], 0.025);
          seg(G.box, M, [s * 0.22, ym + 0.27, f], [s * 0.38, ym + 0.2, f], 0.02);
          seg(G.box, M, [s * 0.3, ym + 0.37, f], [s * 0.24, ym + 0.52, f], 0.02);
        }
      }
      for (let k = 0; k < 9; k++) part(G.box, B, -W / 2 + 0.1 + k * (W - 0.2) / 8, y0 - 0.05, z, { sx: 0.03, sy: 0.1, sz: 0.012 });
    } },
  antlers: { name: 'Antlers', group: 'Floor and walls', tiles: [1, 1], wall: true, hang: true, use: 'Show (on the wall)', goes: 'Hunting lodge, tavern, elder, large houses',
    roll: r => ({ tines: 3 + Math.floor(r() * 3) }),
    describe: L => [['Points', `${L.tines} a side`]],
    build(L, C) {
      const z = backZ(1), y = 1.32, A = '#c8b896';
      plate(heater(0.17, 0.16, -0.2), 0, 0, z, z + 0.035, C.light, 0, y, C.dark);
      part(G.box, BONE, 0, y + 0.02, z + 0.1, { sx: 0.12, sy: 0.12, sz: 0.14 });
      part(G.box, BONE, 0, y - 0.07, z + 0.17, { sx: 0.07, sy: 0.08, sz: 0.12, rx: 0.3 });
      for (const s of [-1, 1]) {
        const pts = [[s * 0.05, y + 0.07, z + 0.1], [s * 0.2, y + 0.16, z + 0.14], [s * 0.3, y + 0.32, z + 0.13], [s * 0.3, y + 0.52, z + 0.1], [s * 0.22, y + 0.66, z + 0.08]];
        for (let k = 0; k < pts.length - 1; k++) seg(G.cyl6, A, pts[k], pts[k + 1], 0.024 - k * 0.003);
        for (let k = 0; k < L.tines - 1; k++) {
          const p = pts[Math.min(pts.length - 1, 1 + k)];
          seg(G.cyl6, A, p, [p[0] - s * 0.06, p[1] + 0.13, p[2] + 0.06], 0.013);
        }
      }
    } },
  shield: { name: 'Wall shield', group: 'Floor and walls', tiles: [1, 1], wall: true, hang: true, use: 'Show (on the wall), the town\'s colours', goes: 'Guard house, tavern, large houses, bank',
    roll(r) {
      const field = pick(r, DYES); let charge = pick(r, DYES);
      for (let k = 0; k < 8 && charge[0] === field[0]; k++) charge = pick(r, DYES);
      return { field, charge, division: wpick(r, [['plain', 'Plain with a boss', 1], ['pale', 'Per pale', 2], ['fess', 'A fess', 2], ['quarterly', 'Quarterly', 1.5], ['chevron', 'A chevron', 1.5]]), swords: r() < 0.5 };
    },
    describe: L => [['Division', L.division[1]], ['Field', L.field[1], L.field[0]], ['Charge', L.charge[1], L.charge[0]], ['Swords', L.swords ? 'Crossed behind' : 'None']],
    build(L, C) {
      const z = backZ(1), y = 1.35, w = 0.27, F = CC(L.field[0]), K = CC(L.charge[0]);
      if (L.swords) for (const s of [-1, 1]) {
        seg(G.box, '#a8acb8', [s * 0.42, y - 0.42, z + 0.03], [-s * 0.36, y + 0.42, z + 0.03], 0.018);
        seg(G.box, '#6a5a3a', [s * 0.42, y - 0.42, z + 0.03], [s * 0.5, y - 0.52, z + 0.03], 0.02);
        seg(G.box, '#b8903a', [s * 0.36 - 0.05, y - 0.4, z + 0.03], [s * 0.36 + 0.05, y - 0.32, z + 0.03], 0.016);
      }
      plate(heater(w + 0.025, 0.345, -0.355), 0, 0, z + 0.05, z + 0.09, IRON_LT, 0, y, IRON);
      plate(heater(w, 0.32, -0.33), 0, 0, z + 0.09, z + 0.1, F, 0, y);
      const d = L.division[0], f0 = z + 0.1, f1 = z + 0.106, S = heater(w, 0.32, -0.33);
      if (d === 'pale') plate(S.filter(p => p[0] >= 0).concat([[0, -0.33]]), w / 2, 0, f0, f1, K, 0, y);
      else if (d === 'fess') plate([[-w, 0.15], [-w, 0.02], [w, 0.02], [w, 0.15]], 0, 0.085, f0, f1, K, 0, y);
      else if (d === 'quarterly') {
        plate([[-w, 0.32], [-w, 0], [0, 0], [0, 0.32]], -w / 2, 0.16, f0, f1, K, 0, y);
        plate([[0, 0], ...S.filter(p => p[0] > 0 && p[1] <= 0)], w * 0.45, -0.12, f0, f1, K, 0, y);
      } else if (d === 'chevron') {
        for (const s of [-1, 1]) seg(G.box, K, [0, y + 0.08, f0 + 0.003], [s * (w - 0.01), y - 0.16, f0 + 0.003], 0.04);
      } else part(G.cyl12, IRON_LT, 0, y + 0.02, f0 + 0.02, { sx: 0.13, sy: 0.04, sz: 0.13, rx: Math.PI / 2 });
    } },
  wallMap: { name: 'Wall map', group: 'Floor and walls', tiles: [1, 1], wall: true, hang: true, use: 'Show (on the wall)', goes: 'Cartographer, captain\'s office, guard house, tavern',
    roll(r) {
      const lands = [];
      const n = 2 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) {
        const cx = -0.22 + r() * 0.44, cy = -0.12 + r() * 0.24, R = 0.06 + r() * 0.1, m = 9, pts = [];
        for (let i = 0; i < m; i++) { const a = i / m * Math.PI * 2, rr = R * (0.7 + r() * 0.5); pts.push([cx + Math.cos(a) * rr * 1.3, cy + Math.sin(a) * rr]); }
        lands.push({ cx, cy, pts });
      }
      return { lands, route: [0, 1].map(() => [-0.3 + r() * 0.6, -0.15 + r() * 0.3]) };
    },
    describe: L => [['Lands', `${L.lands.length} islands and coasts`]],
    build(L, C) {
      const z = backZ(1), y = 1.4, W = 0.8, H = 0.56;
      part(G.box, C.dark, 0, y, z + 0.015, { sx: W + 0.08, sy: H + 0.08, sz: 0.03 });
      part(G.box, '#d8c8a0', 0, y, z + 0.032, { sx: W, sy: H, sz: 0.006 });
      part(G.box, '#a8b8b0', 0, y, z + 0.036, { sx: W - 0.06, sy: H - 0.06, sz: 0.002 });
      for (const ld of L.lands) plate(ld.pts, ld.cx, ld.cy, z + 0.037, z + 0.04, '#8a9a68', 0, y, '#5a6a48');
      const [a, b] = L.route;
      for (let k = 0; k < 7; k += 2) {
        const t0 = k / 7, t1 = (k + 1) / 7;
        seg(G.box, '#8a2a24', [a[0] + (b[0] - a[0]) * t0, y + a[1] + (b[1] - a[1]) * t0, z + 0.042], [a[0] + (b[0] - a[0]) * t1, y + a[1] + (b[1] - a[1]) * t1, z + 0.042], 0.006);
      }
      part(G.box, '#8a2a24', b[0], y + b[1], z + 0.043, { sx: 0.03, sy: 0.03, sz: 0.004, rz: Math.PI / 4 });
    } },
  candleStand: { name: 'Candle stand', group: 'Lights', tiles: [1, 1], use: 'Light', goes: 'Chapel, cathedral, bank, clergy house',
    build() {
      for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; seg(G.cyl6, IRON, [0, 0.16, 0], [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2], 0.014); }
      seg(G.cyl6, IRON, [0, 0.14, 0], [0, 1.22, 0], 0.016);
      part(G.cyl8, IRON, 0, 0.7, 0, { sx: 0.06, sy: 0.05, sz: 0.06 });
      part(G.box, IRON, 0, 1.22, 0, { sx: 0.4, sy: 0.025, sz: 0.025 });
      for (const x of [-0.2, 0, 0.2]) {
        part(G.cyl8, IRON_LT, x, 1.24 + (x ? 0 : 0.06), 0, { sx: 0.08, sy: 0.015, sz: 0.08 });
        if (!x) seg(G.cyl6, IRON, [0, 1.22, 0], [0, 1.24 + 0.06, 0], 0.012);
        candle(x, 1.25 + (x ? 0 : 0.06), 0, x ? 0.14 : 0.18);
      }
    } },
  chandelier: { name: 'Chandelier', group: 'Lights', tiles: [2, 2], hang: true, use: 'Light (hangs from the ceiling, no floor tile)', goes: 'Tavern, cathedral, bank',
    build() {
      const top = CEIL, ringY = 1.62, R = 0.45;
      part(G.box, IRON, 0, top - 0.02, 0, { sx: 0.12, sy: 0.04, sz: 0.12 });
      for (let k = 0; k < 6; k++) {
        const y0 = top - 0.04 - k * 0.06;
        part(G.box, IRON, 0, y0 - 0.03, 0, { sx: k % 2 ? 0.012 : 0.04, sy: 0.06, sz: k % 2 ? 0.04 : 0.012 });
      }
      seg(G.cyl6, IRON, [0, top - 0.4, 0], [0, ringY - 0.06, 0], 0.02);
      part(G.oct, IRON, 0, ringY - 0.08, 0, { s: 0.09 });
      const n = 6;
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, b = (k + 1) / n * Math.PI * 2, p = [Math.cos(a) * R, ringY, Math.sin(a) * R];
        seg(G.box, IRON, p, [Math.cos(b) * R, ringY, Math.sin(b) * R], 0.016);
        seg(G.cyl6, IRON, [0, ringY - 0.06, 0], p, 0.01);
        seg(G.cyl6, IRON, [0, top - 0.4, 0], [p[0], ringY + 0.01, p[2]], 0.005);
        part(G.cyl8, IRON_LT, p[0], ringY + 0.02, p[2], { sx: 0.07, sy: 0.012, sz: 0.07 });
        candle(p[0], ringY + 0.025, p[2], 0.12, 0.02);
      }
    } },
};
// a plain long table: boards along the top, legs at each end and every tile between, an apron and a stretcher
function table(W, D, tiles, C) {
  const top = 0.74, n = 3;
  for (let k = 0; k < n; k++) part(G.box, k % 2 ? C.light : C.wood, 0, top, (k - (n - 1) / 2) * D / n, { sx: W, sy: 0.05, sz: D / n - 0.008 });
  const xs = tiles > 2 ? [-(W / 2 - 0.1), 0, W / 2 - 0.1] : [-(W / 2 - 0.1), W / 2 - 0.1];
  for (const x of xs) for (const s of [-1, 1]) part(G.box, C.dark, x, (top - 0.025) / 2, s * (D / 2 - 0.08), { sx: 0.08, sy: top - 0.025, sz: 0.08 });
  for (const s of [-1, 1]) part(G.box, C.dark, 0, top - 0.08, s * (D / 2 - 0.08), { sx: W - 0.2, sy: 0.08, sz: 0.04 });
  for (const s of [-1, 1]) part(G.box, C.dark, s * (W / 2 - 0.1), top - 0.08, 0, { sx: 0.04, sy: 0.08, sz: D - 0.2 });
  part(G.box, C.dark, 0, 0.14, 0, { sx: W - 0.2, sy: 0.05, sz: 0.05 });
  for (const x of xs) part(G.box, C.dark, x, 0.14, 0, { sx: 0.05, sy: 0.05, sz: D - 0.16 });
}
// one of the shelf's goods standing on y, the shelf's middle at z
function good(g, y, z) {
  const x = g.x, w = g.w;
  if (g.k === 'jar') { const h = 0.14 + g.h * 0.08; part(G.cyl8, g.c, x, y + h / 2, z, { sx: w, sy: h, sz: w }); part(G.cyl8, '#d8ccb0', x, y + h + 0.012, z, { sx: w * 0.85, sy: 0.025, sz: w * 0.85 }); }
  else if (g.k === 'crock') { const h = 0.16 + g.h * 0.08; part(G.cyl8, g.c, x, y + h / 2, z, { sx: w, sy: h, sz: w }); part(G.cyl8, shade(g.c, 0.8), x, y + h, z, { sx: w * 0.7, sy: 0.03, sz: w * 0.7 }); }
  else if (g.k === 'sack') { const h = 0.22 + g.h * 0.1; part(G.box, '#b8a47a', x, y + h * 0.45, z, { sx: w, sy: h * 0.9, sz: 0.22 }); part(G.box, '#a8946a', x, y + h * 0.95, z, { sx: w * 0.5, sy: h * 0.18, sz: 0.12 }); }
  else if (g.k === 'bottle') { const h = 0.18 + g.h * 0.06; part(G.cyl8, g.c, x, y + h * 0.35, z, { sx: w, sy: h * 0.7, sz: w }); part(G.cyl8, g.c, x, y + h * 0.82, z, { sx: w * 0.35, sy: h * 0.3, sz: w * 0.35 }); part(G.cyl8, '#8a6a4a', x, y + h, z, { sx: w * 0.3, sy: 0.03, sz: w * 0.3 }); }
  else if (g.k === 'box') { const h = 0.12 + g.h * 0.12; part(G.box, '#8a6a4a', x, y + h / 2, z, { sx: w, sy: h, sz: 0.24 }); part(G.box, '#6a4a30', x, y + h - 0.01, z, { sx: w + 0.01, sy: 0.02, sz: 0.25 }); }
  else if (g.k === 'bowls') { for (let k = 0; k < 3 + Math.floor(g.h * 3); k++) part(G.cyl12, shade(g.c, k % 2 ? 0.9 : 1), x, y + 0.02 + k * 0.035, z, { sx: w - k * 0.005, sy: 0.035, sz: w - k * 0.005 }); }
  else { part(G.cyl12, '#d8b050', x, y + 0.05, z, { sx: w, sy: 0.1, sz: w }); part(G.cyl12, '#a88030', x, y + 0.1, z, { sx: w * 0.92, sy: 0.006, sz: w * 0.92 }); }
}
// the rugs: a field inside a border, a pattern on the field, fringes on the short ends
function rugRoll(r) {
  const field = pick(r, DYES); let border = pick(r, DYES), accent = pick(r, DYES);
  for (let k = 0; k < 8 && border[0] === field[0]; k++) border = pick(r, DYES);
  for (let k = 0; k < 8 && (accent[0] === field[0]); k++) accent = pick(r, DYES);
  return { field, border, accent, pattern: wpick(r, [['medallion', 'Medallion', 3], ['stripes', 'Stripes', 2], ['lozenges', 'Row of lozenges', 2], ['plain', 'Plain field', 1]]) };
}
function rugDescribe(L) { return [['Pattern', L.pattern[1]], ['Field', L.field[1], L.field[0]], ['Border', L.border[1], L.border[0]], ['Pattern colour', L.accent[1], L.accent[0]]]; }
function rug(W, D, L) {
  const F = CC(L.field[0]), B = CC(L.border[0]), A = CC(L.accent[0]), p = L.pattern[0];
  part(G.box, B, 0, 0.008, 0, { sx: W, sy: 0.016, sz: D });
  part(G.box, F, 0, 0.012, 0, { sx: W - 0.24, sy: 0.016, sz: D - 0.24 });
  part(G.box, A, 0, 0.011, 0, { sx: W - 0.16, sy: 0.016, sz: D - 0.16 });
  part(G.box, F, 0, 0.0125, 0, { sx: W - 0.24, sy: 0.016, sz: D - 0.24 });
  const y = 0.021;
  if (p === 'medallion') {
    part(G.box, A, 0, y, 0, { sx: 0.6, sy: 0.004, sz: 0.6, ry: Math.PI / 4 });
    part(G.box, B, 0, y + 0.002, 0, { sx: 0.36, sy: 0.004, sz: 0.36, ry: Math.PI / 4 });
    part(G.box, A, 0, y + 0.004, 0, { sx: 0.14, sy: 0.004, sz: 0.14, ry: Math.PI / 4 });
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) part(G.box, A, sa * (W / 2 - 0.3), y, sb * (D / 2 - 0.3), { sx: 0.16, sy: 0.004, sz: 0.16, ry: Math.PI / 4 });
  } else if (p === 'stripes') {
    const n = Math.round((D - 0.3) / 0.3);
    for (let k = 0; k < n; k++) part(G.box, k % 2 ? B : A, 0, y, -D / 2 + 0.3 + (k + 0.5) * (D - 0.6) / n, { sx: W - 0.24, sy: 0.004, sz: 0.06 });
  } else if (p === 'lozenges') {
    const n = Math.max(2, Math.round((D - 0.4) / 0.42));
    for (let k = 0; k < n; k++) part(G.box, k % 2 ? B : A, 0, y, -D / 2 + 0.2 + (k + 0.5) * (D - 0.4) / n, { sx: 0.26, sy: 0.004, sz: 0.26, ry: Math.PI / 4 });
  }
  for (const s of [-1, 1]) for (let k = 0; k < 14; k++) part(G.box, '#e0d4b8', -W / 2 + 0.06 + k * (W - 0.12) / 13, 0.005, s * (D / 2 + 0.04), { sx: 0.025, sy: 0.006, sz: 0.08 });
}

// ---------- the API ----------
export const PROP_IDS = Object.keys(PROPS);
export const seeded = id => !!PROPS[id].roll;
// a prop's look from a seed (null for one with no seeded looks)
export function rollProp(id, seed) {
  const P = PROPS[id];
  if (!P.roll) return null;
  const h = [...id].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) | 0, 7);
  return Object.assign({ seed }, P.roll(mulberry32(((seed | 0) * 7919 + 1013) ^ h)));
}
export function describeProp(id, L, wood) {
  const P = PROPS[id], [w, d] = P.tiles;
  const rows = [['Tiles', `${w} x ${d}${P.wall ? ', against a wall' : ''}${P.hang ? ', no floor tile' : ''}`], ['Use', P.use], ['Goes in', P.goes]];
  if (!P.rug && !P.hang || id === 'tapestry' || id === 'antlers' || id === 'shield' || id === 'wallMap') rows.push(['Wood', `${WOODS[wood].name} (${WOODS[wood].tier.toLowerCase()})`]);
  if (L && P.describe) rows.push(...P.describe(L));
  return rows;
}
// the prop's shapes: { solid, glow } geometries (glow null when it has no flames)
export function buildProp(id, L, wood = 'oak') {
  prims();
  const W = WOODS[wood], C = { wood: CC(W.wood), dark: CC(W.dark), light: CC(W.light) };
  OUT = new Buf(); GLOW = new Buf();
  try { PROPS[id].build(L, C); return { solid: OUT.geometry(), glow: GLOW.geometry() }; } finally { OUT = GLOW = null; OZ = 0; }
}
// the tiles a prop stands on, for the viewer: a floor of tiles a margin round its footprint, the footprint lighter,
// grid lines between, and (for a wall prop) the wall behind it
export function propStage(id, { wall = true, margin = 1 } = {}) {
  prims();
  const P = PROPS[id], [w, d] = P.tiles;
  OUT = new Buf(); GLOW = new Buf();
  try {
    for (let a = -margin; a < w + margin; a++) for (let b = -margin; b < d + margin; b++) {
      const on = a >= 0 && a < w && b >= 0 && b < d, x = -w / 2 + a + 0.5, z = -d / 2 + b + 0.5;
      if (P.wall && wall && b < 0) continue;
      part(G.box, on ? (P.hang ? '#5a5048' : '#6a5e50') : '#3a3430', x, -0.03, z, { sx: 0.97, sy: 0.06, sz: 0.97 });
    }
    if (P.wall && wall) {
      part(G.box, '#8a7c6a', 0, CEIL / 2, -d / 2, { sx: w + margin * 2, sy: CEIL, sz: WALL_IN * 2 });
      part(G.box, '#5a4a38', 0, 0.06, -d / 2 + WALL_IN + 0.01, { sx: w + margin * 2, sy: 0.12, sz: 0.02 });
    }
    return OUT.geometry();
  } finally { OUT = GLOW = null; }
}
