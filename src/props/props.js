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
export const CEIL = 2;
// (Jordan) tables stand as low as the crafting tables you build (their top 0.46 over the floor: (0.53 - TABLE_LOW
// 0.26 + 0.035) x STATION_LOOK.size 1.5), and seats are lowered to suit
export const TABLE_TOP = 0.46, SEAT = 0.28;
// (the bar counter's top and a bar stool's seat: as much over a table's and a chair's as a real bar is)
export const BAR_TOP = 0.66, BAR_SEAT = 0.44;         // a story's height (the game's WALL_H): where a hanging prop hangs from
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
const GOLD = '#d8b04a', GOLD_DK = '#a07a28', BRASS = '#b8903a';
const VAULT_STEEL = [['#6a6e78', 'Grey steel'], ['#5a5048', 'Blackened iron'], ['#7a7266', 'Pale iron']];
const VAULT_STONE = [['#8a8496', 'Grey granite'], ['#b0a898', 'Sandstone'], ['#c8c4bc', 'White marble']];
const BAIZE = [['#2e5a3a', 'Green baize'], ['#6a2a2a', 'Red baize'], ['#2a3a5a', 'Blue baize']];
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
  part(G.box, C.wood, 0, H / 2, z - D / 2 + 0.01, { sx: W - 0.04, sy: H - 0.06, sz: 0.02 });
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
// group: where it's listed; tiles [w, d]; wall: backs onto a wall; thin: flat on its wall or slim (a candle stand), walked over (the game);
// hang: hangs from the ceiling (no floor tile);
// use and goes: from the doc; roll(r) -> the seeded look (null: none); build(L, C) draws it (C: the wood's colours);
// describe(L) -> rows [label, value, colour]
export const PROP_GROUPS = ['Beds', 'Seating', 'Tables', 'Storage', 'Kitchen', 'Floor and walls', 'Lights', 'Tavern', 'Bank', 'Guard', 'Outdoor'];
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
      part(G.cyl8, C.wood, 0, SEAT - 0.025, 0, { sx: 0.36, sy: 0.05, sz: 0.36 });
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3 + 0.3;
        seg(G.cyl6, C.dark, [Math.cos(a) * 0.1, SEAT - 0.05, Math.sin(a) * 0.1], [Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16], 0.022);
      }
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3 + 0.3, b = a + Math.PI * 2 / 3, R = 0.14;
        seg(G.cyl6, C.dark, [Math.cos(a) * R, 0.1, Math.sin(a) * R], [Math.cos(b) * R, 0.1, Math.sin(b) * R], 0.012);
      }
    } },
  chair: { name: 'Chair', group: 'Seating', tiles: [1, 1], use: 'Sit', goes: 'Houses, tavern, bank, cartographer',
    build(L, C) {
      // (the seat's top at SEAT; the back's top rail about as far again above it)
      const sx = 0.2, sz = 0.19, seatY = SEAT - 0.025, backH = SEAT + 0.42;
      part(G.box, C.wood, 0, seatY, 0, { sx: 0.46, sy: 0.05, sz: 0.44 });
      for (const a of [-1, 1]) {
        part(G.box, C.dark, a * sx, (seatY - 0.025) / 2, sz, { sx: 0.05, sy: seatY - 0.025, sz: 0.05 });
        part(G.box, C.dark, a * sx, backH / 2, -sz, { sx: 0.05, sy: backH, sz: 0.05 });
        part(G.box, C.dark, a * sx, 0.09, 0, { sx: 0.03, sy: 0.03, sz: sz * 2 - 0.05 });
      }
      part(G.box, C.dark, 0, 0.09, sz, { sx: sx * 2 - 0.05, sy: 0.03, sz: 0.03 });
      for (const y of [SEAT + 0.13, SEAT + 0.25]) part(G.box, C.wood, 0, y, -sz, { sx: sx * 2 - 0.05, sy: 0.07, sz: 0.03 });
      part(G.box, C.dark, 0, backH - 0.03, -sz, { sx: sx * 2 + 0.08, sy: 0.08, sz: 0.06 });
    } },
  bench: { name: 'Long bench', group: 'Seating', tiles: [2, 1], use: 'Sit (two)', goes: 'Tavern, chapel, guard house mess, houses',
    build(L, C) {
      part(G.box, C.wood, 0, SEAT - 0.03, 0, { sx: 1.7, sy: 0.06, sz: 0.32 });
      for (const s of [-1, 1]) {
        part(G.box, C.dark, s * 0.64, (SEAT - 0.06) / 2 + 0.03, 0, { sx: 0.06, sy: SEAT - 0.12, sz: 0.26 });
        part(G.box, C.dark, s * 0.64, 0.03, 0, { sx: 0.1, sy: 0.06, sz: 0.34 });
      }
      part(G.box, C.dark, 0, 0.12, 0, { sx: 1.22, sy: 0.05, sz: 0.04 });
    } },
  roundTable: { name: 'Round table', group: 'Tables', tiles: [1, 1], use: 'Sit, eat', goes: 'Houses, tavern corners',
    build(L, C) {
      part(G.cyl12, C.wood, 0, TABLE_TOP - 0.025, 0, { sx: 0.82, sy: 0.05, sz: 0.82 });
      part(G.cyl12, C.dark, 0, TABLE_TOP - 0.07, 0, { sx: 0.7, sy: 0.04, sz: 0.7 });
      part(G.cyl8, C.dark, 0, (TABLE_TOP - 0.09) / 2 + 0.04, 0, { sx: 0.12, sy: TABLE_TOP - 0.09, sz: 0.12 });
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
        part(G.box, k, 0, TABLE_TOP + 0.004, 0, { sx: 2.4, sy: 0.008, sz: 0.36 });
        for (const s of [-1, 1]) part(G.box, shade(k, 0.8), s * 1.204, TABLE_TOP - 0.032, 0, { sx: 0.008, sy: 0.08, sz: 0.36 });
      }
    } },
  desk: { name: 'Desk with ledger', group: 'Tables', tiles: [2, 1], wall: true, use: 'Work', goes: 'Bank, cartographer, merchant, captain',
    roll: r => ({ cover: pick(r, BOOKS) }),
    describe: L => [['Ledger', 'Leather cover', L.cover]],
    build(L, C) {
      const D = 0.62, z = midZ(1, D), top = TABLE_TOP;
      part(G.box, C.wood, 0, top - 0.025, z, { sx: 1.5, sy: 0.05, sz: D });
      // drawers on the left, two legs on the right
      part(G.box, C.dark, -0.5, (top - 0.05) / 2, z, { sx: 0.46, sy: top - 0.05, sz: D - 0.04 });
      for (let k = 0; k < 2; k++) {
        const y = 0.06 + k * 0.18;
        part(G.box, C.wood, -0.5, y + 0.08, z + D / 2 - 0.005, { sx: 0.4, sy: 0.15, sz: 0.02 });
        part(G.box, '#b8903a', -0.5, y + 0.08, z + D / 2 + 0.01, { sx: 0.06, sy: 0.025, sz: 0.02 });
      }
      for (const dz of [-1, 1]) part(G.box, C.dark, 0.68, (top - 0.05) / 2, z + dz * (D / 2 - 0.04), { sx: 0.06, sy: top - 0.05, sz: 0.06 });
      part(G.box, C.dark, 0.68, 0.1, z, { sx: 0.04, sy: 0.04, sz: D - 0.13 });
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
      // (2026-11-03, Jordan: gaps at its side and back) every stone runs IN back into the wall (the plaster between a
      // timber wall's beams stands back of where the prop's back is), the cheeks' courses sit on one another with
      // their outer faces flush, and a course across behind the lintel closes the cheeks' tops to the hood
      const IN = 0.06, zz = (d, f = 0) => z0 - IN + (d + IN + f) / 2;
      let i = 2;
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { const w = 0.26 + (k % 2) * 0.04; block(s * (0.85 - w / 2), 0.3 + k * 0.2, zz(D - 0.02), w, 0.2, D - 0.02 + IN, i++); }
      part(G.box, '#2a2420', 0, 0.6, z0 + 0.05 - IN / 2, { sx: 1.1, sy: 0.8, sz: 0.1 + IN });      // sooty fireback
      block(0, 1.0975, zz(D - 0.18), 1.7, 0.195, D - 0.18 + IN, i++);                            // (behind the lintel)
      part(G.box, C.dark, 0, 1.1, z + D / 2 - 0.08, { sx: 1.7, sy: 0.16, sz: 0.18 });   // the oak lintel
      // the hood narrowing up to the ceiling
      for (let k = 0; k < 4; k++) { const t = k / 3, d = (D - 0.12) * (1 - t * 0.45); block(0, 1.3 + k * 0.2, zz(d), 1.6 - t * 0.7, 0.21, d + IN, i++); }
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
  candleStand: { name: 'Candle stand', group: 'Lights', tiles: [1, 1], thin: true, use: 'Light', goes: 'Chapel, cathedral, bank, clergy house',
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
  // ---------- (2026-11-02, Jordan) the tavern and inn set ----------
  barCounter: { name: 'Bar counter', group: 'Tavern', tiles: [2, 1], use: 'Work: the innkeeper serves from behind it', goes: 'Tavern (medium town)', bar: true,
    roll: r => barRoll(r, 2), describe: barDescribe, build(L, C) { barCounter(1.9, L, C); } },
  barCounterLong: { name: 'Long bar counter', group: 'Tavern', tiles: [3, 1], use: 'Work: the innkeeper serves from behind it', goes: 'Tavern (large town)', bar: true,
    roll: r => barRoll(r, 3), describe: barDescribe, build(L, C) { barCounter(2.9, L, C); } },
  barStool: { name: 'Bar stool', group: 'Tavern', tiles: [1, 1], use: 'Sit at the bar', goes: 'Tavern',
    build(L, C) {
      const y = BAR_SEAT;
      part(G.cyl12, C.wood, 0, y - 0.03, 0, { sx: 0.38, sy: 0.06, sz: 0.38 });
      part(G.cyl12, C.dark, 0, y - 0.07, 0, { sx: 0.3, sy: 0.03, sz: 0.3 });
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        seg(G.cyl6, C.dark, [Math.cos(a) * 0.1, y - 0.08, Math.sin(a) * 0.1], [Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17], 0.022);
      }
      // the foot ring
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4, b = a + Math.PI / 2, R = 0.155;
        seg(G.cyl6, C.light, [Math.cos(a) * R, 0.17, Math.sin(a) * R], [Math.cos(b) * R, 0.17, Math.sin(b) * R], 0.014);
      }
    } },
  mugShelf: { name: 'Mug and plate shelf', group: 'Tavern', tiles: [1, 1], wall: true, use: 'Show', goes: 'Tavern, behind the bar',
    roll: r => ({ glaze: pick(r, GLAZES), mugs: 3 + Math.floor(r() * 3), gone: Math.floor(r() * 4) }),
    describe: L => [['Crockery', L.glaze[1], L.glaze[0]], ['Tankards', String(L.mugs)]],
    build(L, C) {
      const W = 0.9, zb = backZ(1), D = 0.2, zs = zb + D / 2, g = CC(L.glaze[0]), rim = shade(g, 0.8);
      part(G.box, C.wood, 0, 1.3, zb + 0.01, { sx: W - 0.04, sy: 0.9, sz: 0.02 });
      for (const s of [-1, 1]) part(G.box, C.dark, s * (W / 2 - 0.02), 1.3, zs, { sx: 0.04, sy: 0.9, sz: D });
      part(G.box, C.dark, 0, 1.76, zs + 0.01, { sx: W + 0.04, sy: 0.04, sz: D + 0.04 });
      // plates stood up along the two shelves, behind a rail
      for (const y of [1.12, 1.45]) {
        part(G.box, C.wood, 0, y, zs, { sx: W - 0.06, sy: 0.025, sz: D });
        part(G.box, C.dark, 0, y + 0.07, zs + D / 2 - 0.01, { sx: W - 0.06, sy: 0.015, sz: 0.015 });
        for (let k = 0; k < 4; k++) {
          if (y > 1.3 && k === L.gone) continue;
          const x = -0.3 + k * 0.2;
          part(G.cyl12, g, x, y + 0.12, zb + 0.06, { sx: 0.2, sy: 0.018, sz: 0.2, rx: Math.PI / 2 - 0.22 });
          part(G.cyl12, rim, x, y + 0.12, zb + 0.067, { sx: 0.12, sy: 0.012, sz: 0.12, rx: Math.PI / 2 - 0.22 });
        }
      }
      // a peg rail under them with tankards hung by their handles
      part(G.box, C.dark, 0, 0.92, zb + 0.03, { sx: W - 0.04, sy: 0.07, sz: 0.04 });
      for (let k = 0; k < L.mugs; k++) {
        const x = -0.34 + k * (0.68 / Math.max(1, L.mugs - 1));
        seg(G.cyl6, C.light, [x, 0.92, zb + 0.05], [x, 0.94, zb + 0.13], 0.012);
        tankard(x, 0.69, zb + 0.13, g, rim, Math.PI);
      }
    } },
  keg: { name: 'Keg on a cradle', group: 'Tavern', tiles: [1, 1], use: 'Show; the innkeeper draws from it', goes: 'Tavern, cellars',
    build(L, C) {
      const y = 0.38;
      for (const z of [-0.2, 0.2]) {
        part(G.box, C.dark, 0, 0.09, z, { sx: 0.62, sy: 0.18, sz: 0.1 });
        for (const s of [-1, 1]) part(G.box, C.dark, s * 0.2, 0.2, z, { sx: 0.12, sy: 0.12, sz: 0.1, rz: s * 0.6 });
      }
      barrel([0, y, -0.32], [0, y, 0.32], 0.2, 0.24, shade(C.light, 1.05), { hoops: [0.08, 0.3, 0.7, 0.92] });
      part(G.box, '#b8903a', 0, y - 0.08, 0.35, { sx: 0.04, sy: 0.04, sz: 0.07 });
      part(G.box, '#b8903a', 0, y - 0.13, 0.38, { sx: 0.03, sy: 0.09, sz: 0.03 });
      // a drip bucket under the tap
      barrel([0, 0, 0.4], [0, 0.14, 0.4], 0.07, 0.075, shade(C.wood, 1.1), { hoops: [0.3], n: 1, head: false });
      part(G.cyl8, '#5a3a1e', 0, 0.12, 0.4, { sx: 0.12, sy: 0.01, sz: 0.12 });
    } },
  kegStack: { name: 'Stack of kegs', group: 'Tavern', tiles: [1, 1], use: 'Show (out by the door)', goes: 'Tavern front, dock, cellars',
    roll: r => ({ top: r() < 0.75, turn: (r() - 0.5) * 0.2 }),
    describe: L => [['Kegs', L.top ? 'Three, one on top' : 'Two']],
    build(L, C) {
      const R0 = 0.17, R1 = 0.2, len = 0.64, s = L.turn;
      for (const x of [-0.21, 0.21]) {
        barrel([x + s * 0.1, R1, -len / 2], [x - s * 0.1, R1, len / 2], R0, R1, shade(C.light, x < 0 ? 1.05 : 0.97), { hoops: [0.1, 0.32, 0.68, 0.9] });
        for (const z of [-0.2, 0.2]) part(G.box, C.dark, x + (x < 0 ? -1 : 1) * 0.16, 0.04, z, { sx: 0.06, sy: 0.08, sz: 0.08 });
      }
      part(G.box, C.dark, 0, 0.04, 0, { sx: 0.08, sy: 0.08, sz: 0.5 });
      if (L.top) barrel([0, R1 * 2 + 0.16, -len / 2 + 0.02], [0, R1 * 2 + 0.16, len / 2 - 0.02], R0, R1, shade(C.light, 1.1), { hoops: [0.1, 0.32, 0.68, 0.9] });
    } },
  washstand: { name: 'Washstand', group: 'Tavern', tiles: [1, 1], wall: true, use: 'Show', goes: 'Inn rooms, houses upstairs',
    roll: r => ({ glaze: pick(r, GLAZES), towel: pick(r, DYES) }),
    describe: L => [['Basin and jug', L.glaze[1], L.glaze[0]], ['Towel', L.towel[1], L.towel[0]]],
    build(L, C) {
      const W = 0.62, D = 0.42, z = midZ(1, D), top = 0.52, g = CC(L.glaze[0]);
      part(G.box, C.wood, 0, top - 0.02, z, { sx: W, sy: 0.04, sz: D });
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) part(G.box, C.dark, sa * (W / 2 - 0.04), (top - 0.04) / 2, z + sb * (D / 2 - 0.04), { sx: 0.05, sy: top - 0.04, sz: 0.05 });
      part(G.box, C.wood, 0, 0.12, z, { sx: W - 0.08, sy: 0.03, sz: D - 0.08 });
      part(G.box, C.dark, 0, top + 0.12, backZ(1) + 0.015, { sx: W, sy: 0.22, sz: 0.03 });
      // the basin, the jug stood in it, a towel over the rail at the side
      part(G.cyl12, g, -0.05, top + 0.05, z + 0.02, { sx: 0.34, sy: 0.07, sz: 0.34 });
      part(G.cyl12, '#6a8a9a', -0.05, top + 0.087, z + 0.02, { sx: 0.28, sy: 0.01, sz: 0.28 });
      part(G.cyl8, g, -0.05, top + 0.2, z + 0.02, { sx: 0.13, sy: 0.22, sz: 0.13 });
      part(G.cyl8, g, -0.05, top + 0.33, z + 0.02, { sx: 0.09, sy: 0.05, sz: 0.09 });
      part(G.box, g, -0.05 + 0.08, top + 0.22, z + 0.02, { sx: 0.03, sy: 0.12, sz: 0.02 });
      seg(G.cyl6, C.dark, [W / 2 + 0.02, top - 0.04, z - 0.12], [W / 2 + 0.02, top - 0.04, z + 0.12], 0.012);
      part(G.box, CC(L.towel[0]), W / 2 + 0.025, top - 0.16, z, { sx: 0.02, sy: 0.26, sz: 0.2 });
    } },
  tavernSign: { name: 'Tavern sign', group: 'Tavern', tiles: [1, 1], wall: true, hang: true, outside: true, use: 'Show (outside, by or over the door)', goes: 'Tavern front',
    roll: r => ({ board: pick(r, [['#a07848', 'Weathered oak'], ['#8a6440', 'Old oak'], ['#b08a58', 'Pale pine']]), paint: pick(r, [['#2a1c12', 'Black'], ['#5a2a1a', 'Ox-blood'], ['#3a2a1a', 'Brown'], ['#2a3a24', 'Dark green']]),
      scroll: r() < 0.7, chains: r() < 0.4 }),
    describe: L => [['Board', L.board[1], L.board[0]], ['Keg painted in', L.paint[1], L.paint[0]], ['Bracket', L.scroll ? 'Scrolled iron' : 'Plain iron'], ['Hung by', L.chains ? 'Chains' : 'Ropes']],
    build(L, C) { tavernSign(L, C); } },
  // ---------- (2026-11-03, Jordan) the bank's set: one story of stone, a flat stone roof ----------
  vaultDoor: { name: 'Vault door', group: 'Bank', tiles: [2, 1], wall: true, thin: true, use: 'Show; the player\'s safe storage later', goes: 'Bank, behind the teller counter',
    roll: r => ({ steel: pick(r, VAULT_STEEL), stone: pick(r, VAULT_STONE), dial: r() < 0.6 }),
    describe: L => [['Door', L.steel[1], L.steel[0]], ['Surround', L.stone[1], L.stone[0]], ['Lock', L.dial ? 'A wheel and a brass dial' : 'A wheel']],
    build(L, C) { vaultDoor(L, C); } },
  tellerCounter: { name: 'Teller counter', group: 'Bank', tiles: [3, 1], use: 'Work: the banker serves from behind its grille', goes: 'Bank',
    roll: r => ({ stone: pick(r, VAULT_STONE), bays: r() < 0.5 ? 2 : 3, cover: pick(r, BOOKS), stacks: 2 + Math.floor(r() * 4), bell: r() < 0.6, seed: Math.floor(r() * 1e6) }),
    describe: L => [['Front', L.stone[1], L.stone[0]], ['Windows', `${L.bays} in an iron grille`], ['On the top', `A ledger, ${L.stacks} stacks of coin${L.bell ? ', a bell' : ''}`]],
    build(L, C) { tellerCounter(L, C); } },
  tellerCounter2: { name: 'Teller counter (2)', group: 'Bank', tiles: [2, 1], use: 'Part of the counter across the bank', goes: 'Bank',
    roll: r => ({ stone: pick(r, VAULT_STONE), bays: r() < 0.5 ? 1 : 2, cover: pick(r, BOOKS), stacks: 1 + Math.floor(r() * 2), bell: r() < 0.5, seed: Math.floor(r() * 1e6), w: 2 }),
    describe: L => [['Front', L.stone[1], L.stone[0]], ['Windows', `${L.bays} in an iron grille`]],
    build(L, C) { tellerCounter(L, C); } },
  tellerCounter1: { name: 'Teller counter (1)', group: 'Bank', tiles: [1, 1], use: 'Part of the counter across the bank', goes: 'Bank',
    roll: r => ({ stone: pick(r, VAULT_STONE), bays: 1, cover: pick(r, BOOKS), stacks: 0, bell: false, seed: Math.floor(r() * 1e6), w: 1 }),
    describe: L => [['Front', L.stone[1], L.stone[0]], ['Windows', 'One in an iron grille']],
    build(L, C) { tellerCounter(L, C); } },
  counterGate: { name: 'Counter gate', group: 'Bank', tiles: [1, 1], rug: true, use: 'Walk through: the way behind the counter', goes: 'Bank, in the counter',
    roll: r => ({ swing: r() < 0.5 ? -1 : 1 }),
    describe: L => [['Hinged', L.swing < 0 ? 'Left' : 'Right'], ['Stands', 'Open, swung back behind the counter']],
    build(L, C) { counterGate(L, C); } },
  coinTable: { name: 'Coin table', group: 'Bank', tiles: [1, 1], use: 'Show', goes: 'Bank',
    roll: r => ({ baize: pick(r, BAIZE), tip: (r() - 0.5) * 0.3, stacks: 2 + Math.floor(r() * 4), seed: Math.floor(r() * 1e6) }),
    describe: L => [['Cloth', L.baize[1], L.baize[0]], ['On it', `Brass scales, ${L.stacks} stacks of coin`]],
    build(L, C) { coinTable(L, C); } },
  strongbox: { name: 'Strongbox', group: 'Bank', tiles: [1, 1], wall: true, use: 'Show', goes: 'Bank, along its walls',
    roll: r => ({ paint: wpick(r, PAINTS), big: r() < 0.5, sack: r() < 0.5 }),
    describe: L => [['Wood', L.paint[1], L.paint[2]], ['Size', L.big ? 'Large' : 'Small'], ['Beside it', L.sack ? 'A sack of coin' : 'Nothing']],
    build(L, C) { strongbox(L, C); } },
  bankSign: { name: 'Bank sign', group: 'Bank', tiles: [1, 1], wall: true, hang: true, outside: true, use: 'Show (outside, by the door)', goes: 'Bank front',
    roll: r => ({ board: pick(r, [['#a07848', 'Weathered oak'], ['#8a6440', 'Old oak'], ['#3a3a44', 'Black lacquer']]), paint: pick(r, [['#2a1c12', 'Black'], ['#5a2a1a', 'Ox-blood'], ['#2a3a24', 'Dark green'], ['#24344a', 'Navy']]),
      scroll: r() < 0.8, chains: r() < 0.6 }),
    describe: L => [['Board', L.board[1], L.board[0]], ['A pile of gold coins in a border of', L.paint[1], L.paint[0]], ['Bracket', L.scroll ? 'Scrolled iron' : 'Plain iron'], ['Hung by', L.chains ? 'Chains' : 'Ropes']],
    build(L, C) { tavernSign(L, C, 'coins'); } },
  // ---------- (2026-11-03, Jordan) the guard house: two stories of stone, the barracks upstairs, a training yard beside it ----------
  weaponRack: { name: 'Weapon rack', group: 'Guard', tiles: [2, 1], wall: true, use: 'Show: the watch\'s spears and swords', goes: 'Guard house; its training yard (wooden weapons)',
    roll: r => ({ spears: 2 + Math.floor(r() * 3), swords: 2 + Math.floor(r() * 2), steel: pick(r, BLADES), grip: pick(r, GRIPS), gone: Math.floor(r() * 5) }),
    describe: L => [['Spears', String(L.spears)], ['Swords', String(L.swords)], ['Weapons', L.practice ? 'Wooden, for practice' : L.steel[1], L.practice ? null : L.steel[0]], ['Grips', L.grip[1], L.grip[0]]],
    build(L, C) { weaponRack(L, C); } },
  armorStand: { name: 'Armor stand', group: 'Guard', tiles: [1, 1], use: 'Show: a watchman\'s kit', goes: 'Guard house',
    roll: r => ({ kind: wpick(r, ARMOR_KINDS), helm: wpick(r, [['kettle', 'A kettle hat', 2], ['great', 'A great helm', 1.5], ['cap', 'A steel cap', 2], ['none', 'None', 1]]), tabard: r() < 0.5, dye: pick(r, DYES) }),
    describe: L => [['Armor', L.kind[1], L.kind[2]], ['Helm', L.helm[1]], ['Tabard', L.tabard ? L.dye[1] : 'None', L.tabard ? L.dye[0] : null]],
    build(L, C) { armorStand(L, C); } },
  holdingCell: { name: 'Holding cell', group: 'Guard', tiles: [2, 2], wall: true, use: 'Show: iron bars, a cot and a bucket inside', goes: 'Guard house, in a corner',
    roll: r => ({ door: r() < 0.5 ? -1 : 1, chains: r() < 0.7, straw: Math.floor(r() * 1e6) }),
    describe: L => [['Bars', `Across the front${L.wl ? '' : ', the left side'}${L.wr ? '' : ', the right side'}`], ['Door', L.door < 0 ? 'Hinged left' : 'Hinged right'], ['Wall', L.chains ? 'Shackles on chains' : 'Bare']],
    build(L, C) { holdingCell(L, C); } },
  trainingDummy: { name: 'Training dummy', group: 'Guard', tiles: [1, 1], use: 'Show: a straw man on a post', goes: 'The guard house\'s training yard',
    roll: r => ({ arms: r() < 0.75, shield: r() < 0.4, sack: pick(r, SACKS), lean: (r() - 0.5) * 0.12, turn: (r() - 0.5) * 0.4 }),
    describe: L => [['Sacking', L.sack[1], L.sack[0]], ['Arms', L.arms ? 'A crossbar' : 'None'], ['Shield', L.shield ? 'A wooden one, strapped on' : 'None']],
    build(L, C) { trainingDummy(L, C); } },
  archeryButt: { name: 'Archery butt', group: 'Guard', tiles: [1, 1], use: 'Show: a straw target on a stand', goes: 'The guard house\'s training yard',
    roll(r) { const n = Math.floor(r() * 5), arrows = []; for (let k = 0; k < n; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.3; arrows.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, tx: (r() - 0.5) * 0.3, ty: (r() - 0.5) * 0.3 }); } return { face: wpick(r, BUTT_FACES), arrows, fletch: pick(r, DYES) }; },
    describe: L => [['Face', L.face[1]], ['Arrows in it', String(L.arrows.length)]],
    build(L, C) { archeryButt(L, C); } },
  brazier: { name: 'Brazier', group: 'Guard', tiles: [1, 1], use: 'Light: the watch fire', goes: 'The guard house\'s training yard, its door',
    roll: r => ({ logs: r() < 0.6, at: r() * Math.PI * 2 }),
    describe: L => [['Logs beside it', L.logs ? 'Yes' : 'No']],
    build(L, C) { brazier(L, C); } },
  // ---------- (2026-11-03, Jordan) the outdoor set: streets, the plaza and the yards ----------
  well: { name: 'Well', group: 'Outdoor', tiles: [1, 1], use: 'Show; folk fetch water', goes: 'A hamlet\'s crossroads, a medium town\'s plaza', inGame: true,
    roll: r => ({ roof: wpick(r, WELL_ROOFS), stone: pick(r, FIELDSTONE), bucket: r() < 0.7, crank: r() < 0.5 ? -1 : 1, seed: Math.floor(r() * 1e6) }),
    describe: L => [['Roof', L.roof[1], L.roof[2]], ['Stone', L.stone[1], L.stone[0]], ['Bucket', L.bucket ? 'Hanging, and one on the rim' : 'Hanging'], ['Crank', L.crank < 0 ? 'Left' : 'Right']],
    build(L, C) { well(L, C); } },
  streetBench: { name: 'Street bench', group: 'Outdoor', tiles: [2, 1], use: 'Sit (two)', goes: 'The plaza, by the fountain, along the streets',
    roll: r => ({ ends: wpick(r, [['wood', 'Wooden ends', 3], ['stone', 'Stone ends', 2], ['iron', 'Iron ends', 1]]), stone: pick(r, FIELDSTONE) }),
    describe: L => [['Ends', L.ends[1]], ...(L.ends[0] === 'stone' ? [['Stone', L.stone[1], L.stone[0]]] : [])],
    build(L, C) { streetBench(L, C); } },
  marketStall: { name: 'Market stall', group: 'Outdoor', tiles: [2, 1], use: 'Show; a trader by day', goes: 'The plaza\'s edge (medium and large towns)',
    roll: r => { const a = pick(r, DYES); let b = pick(r, AWNING); for (let k = 0; k < 6 && b[0] === a[0]; k++) b = pick(r, AWNING); return { a, b, goods: wpick(r, STALL_GOODS), crate: r() < 0.7, sack: r() < 0.6, seed: Math.floor(r() * 1e6) }; },
    describe: L => [['Awning', `${L.a[1]} and ${L.b[1].toLowerCase()}`, L.a[0]], ['Selling', L.goods[1], L.goods[2]]],
    build(L, C) { marketStall(L, C); } },
  produce: { name: 'Produce crates', group: 'Outdoor', tiles: [1, 1], use: 'Show', goes: 'Beside the market stalls, shop fronts',
    roll: r => ({ low: wpick(r, STALL_GOODS.filter(g => g[0] !== 'cloth' && g[0] !== 'pots')), high: wpick(r, STALL_GOODS.filter(g => g[0] !== 'cloth' && g[0] !== 'pots')), two: r() < 0.6, basket: r() < 0.7, turn: (r() - 0.5) * 0.3, seed: Math.floor(r() * 1e6) }),
    describe: L => [['Crates', L.two ? `${L.low[1]}, ${L.high[1].toLowerCase()} on top` : L.low[1]], ['Basket', L.basket ? 'Yes' : 'No']],
    build(L, C) { produce(L, C); } },
  noticeBoard: { name: 'Notice board', group: 'Outdoor', tiles: [1, 1], use: 'Show; the crier reads it (later: quests)', goes: 'By the plaza, the guard house',
    roll: r => { const n = 4 + Math.floor(r() * 4), papers = []; for (let k = 0; k < n; k++) papers.push({ x: r(), y: r(), w: 0.13 + r() * 0.07, h: 0.15 + r() * 0.1, rz: (r() - 0.5) * 0.2, tint: pick(r, PAPERS), pin: r() < 0.6, lines: 2 + Math.floor(r() * 3) }); return { papers, roof: r() < 0.75 }; },
    describe: L => [['Notices', String(L.papers.length)], ['Roof', L.roof ? 'Yes' : 'No']],
    build(L, C) { noticeBoard(L, C); } },
  signpost: { name: 'Signpost', group: 'Outdoor', tiles: [1, 1], use: 'Show (the ways out of town)', goes: 'At every way out of a town',
    roll: r => { const n = 2 + Math.floor(r() * 2), a0 = Math.floor(r() * 4), arms = []; for (let k = 0; k < n; k++) arms.push({ a: ((a0 + k * (n > 2 ? 1 : 2)) & 3) * Math.PI / 2 + (r() - 0.5) * 0.5, words: 2 + Math.floor(r() * 3) }); return { arms }; },
    describe: L => [['Arms', String(L.arms.length)]],
    build(L, C) { signpost(L, C); } },
  horseTrough: { name: 'Horse trough', group: 'Outdoor', tiles: [2, 1], use: 'Show', goes: 'Near the ways out of town, the carter\'s',
    roll: r => ({ stone: r() < 0.4, rock: pick(r, FIELDSTONE), pump: r() < 0.5 }),
    describe: L => [['Made of', L.stone ? L.rock[1] : 'Planks'], ['Pump', L.pump ? 'Yes' : 'No']],
    build(L, C) { horseTrough(L, C); } },
  hayBales: { name: 'Hay bales', group: 'Outdoor', tiles: [1, 1], use: 'Show', goes: 'Yards and farms (hamlets, medium towns)',
    roll: r => ({ n: 1 + Math.floor(r() * 3), turn: (r() - 0.5) * 0.4, fresh: r() < 0.5 }),
    describe: L => [['Bales', String(L.n)], ['Hay', L.fresh ? 'This year\'s' : 'Last year\'s']],
    build(L, C) { hayBales(L, C); } },
  rainBarrel: { name: 'Rain barrel', group: 'Outdoor', tiles: [1, 1], wall: true, use: 'Show', goes: 'House corners, every town',
    roll: r => ({ dipper: r() < 0.6, chute: r() < 0.7 }),
    describe: L => [['Chute', L.chute ? 'From the eaves' : 'None'], ['Dipper', L.dipper ? 'Yes' : 'No']],
    build(L, C) { rainBarrel(L, C); } },
  woodpile: { name: 'Woodpile', group: 'Outdoor', tiles: [2, 1], wall: true, use: 'Show', goes: 'Against house walls (fewer in large towns)',
    roll: r => ({ rows: 4 + Math.floor(r() * 2), block: r() < 0.6, roof: r() < 0.6, seed: Math.floor(r() * 1e6) }),
    describe: L => [['Rows of logs', String(L.rows)], ['Chopping block', L.block ? 'Yes, an axe in it' : 'No'], ['Roof', L.roof ? 'A plank lean-to' : 'None']],
    build(L, C) { woodpile(L, C); } },
  washLine: { name: 'Wash line', group: 'Outdoor', tiles: [3, 1], use: 'Show', goes: 'Between houses (hamlets, medium towns)',
    roll: r => { const items = []; let x = -1.12; while (x < 1.0) { const k = wpick(r, WASH), w = k[1] + r() * 0.1; if (x + w > 1.14) break; items.push({ k: k[0], x: x + w / 2, w, h: k[2] + r() * 0.12, c: pick(r, k[0] === 'sheet' ? SHEETS : DYES)[0] }); x += w + 0.06 + r() * 0.1; } return { items }; },
    describe: L => [['Hung out', L.items.map(i => i.k).join(', ')]],
    build(L, C) { washLine(L, C); } },
  handcart: { name: 'Handcart', group: 'Outdoor', tiles: [2, 1], use: 'Show', goes: 'By the market, the carter\'s, the ways out',
    roll: r => ({ load: wpick(r, [['sacks', 'Sacks', 3], ['barrels', 'Barrels', 2], ['hay', 'Hay', 2], ['crates', 'Crates', 2], ['empty', 'Nothing', 1]]), seed: Math.floor(r() * 1e6) }),
    describe: L => [['Load', L.load[1]]],
    build(L, C) { handcart(L, C); } },
  flagpole: { name: 'Flagpole', group: 'Outdoor', tiles: [1, 1], use: 'Show: the town\'s banner', goes: 'The plaza (medium and large towns)',
    roll: r => { const field = pick(r, DYES.filter(d => d[0] !== '#d8ccb0')); let mark = pick(r, BANNER_MARKS); for (let k = 0; k < 6 && mark[0] === field[0]; k++) mark = pick(r, BANNER_MARKS); return { field, mark, sign: pick(r, ['diamond', 'cross', 'sun', 'chevron']), tail: r() < 0.6 }; },
    describe: L => [['Banner', L.field[1], L.field[0]], ['Device', `A ${L.sign} in ${L.mark[1].toLowerCase()}`, L.mark[0]], ['Foot', L.tail ? 'Swallowtail' : 'Square']],
    build(L, C) { flagpole(L, C); } },
  birdBath: { name: 'Bird bath', group: 'Outdoor', tiles: [1, 1], use: 'Show', goes: 'Courtyards and gardens (medium and large towns)',
    roll: r => ({ stone: pick(r, FIELDSTONE), bird: r() < 0.6, birdC: pick(r, BIRDS), at: r() * Math.PI * 2 }),
    describe: L => [['Stone', L.stone[1], L.stone[0]], ['Bird', L.bird ? L.birdC[1] : 'None']],
    build(L, C) { birdBath(L, C); } },
};
// a plain long table: boards along the top, legs at each end and every tile between, an apron and a stretcher
function table(W, D, tiles, C) {
  const top = TABLE_TOP - 0.025, n = 3;
  for (let k = 0; k < n; k++) part(G.box, k % 2 ? C.light : C.wood, 0, top, (k - (n - 1) / 2) * D / n, { sx: W, sy: 0.05, sz: D / n - 0.008 });
  const xs = tiles > 2 ? [-(W / 2 - 0.1), 0, W / 2 - 0.1] : [-(W / 2 - 0.1), W / 2 - 0.1];
  for (const x of xs) for (const s of [-1, 1]) part(G.box, C.dark, x, (top - 0.025) / 2, s * (D / 2 - 0.08), { sx: 0.08, sy: top - 0.025, sz: 0.08 });
  for (const s of [-1, 1]) part(G.box, C.dark, 0, top - 0.065, s * (D / 2 - 0.08), { sx: W - 0.28, sy: 0.08, sz: 0.04 });
  for (const s of [-1, 1]) part(G.box, C.dark, s * (W / 2 - 0.1), top - 0.065, 0, { sx: 0.04, sy: 0.08, sz: D - 0.24 });
  part(G.box, C.dark, 0, 0.1, 0, { sx: W - 0.28, sy: 0.05, sz: 0.05 });
  for (const x of xs) part(G.box, C.dark, x, 0.1, 0, { sx: 0.05, sy: 0.05, sz: D - 0.24 });
}
// one of the shelf's goods standing on y, the shelf's middle at z
function good(g, y, z) {
  const x = g.x, w = g.w;
  if (g.k === 'jar') { const h = 0.14 + g.h * 0.08; part(G.cyl8, g.c, x, y + h / 2, z, { sx: w, sy: h, sz: w }); part(G.cyl8, '#d8ccb0', x, y + h + 0.012, z, { sx: w * 0.85, sy: 0.025, sz: w * 0.85 }); }
  else if (g.k === 'crock') { const h = 0.16 + g.h * 0.08; part(G.cyl8, g.c, x, y + h / 2, z, { sx: w, sy: h, sz: w }); part(G.cyl8, shade(g.c, 0.8), x, y + h, z, { sx: w * 0.7, sy: 0.03, sz: w * 0.7 }); }
  else if (g.k === 'sack') { const h = 0.22 + g.h * 0.1; part(G.box, '#b8a47a', x, y + h * 0.45, z, { sx: w, sy: h * 0.9, sz: 0.22 }); part(G.box, '#a8946a', x, y + h * 0.95, z, { sx: w * 0.5, sy: h * 0.18, sz: 0.12 }); }
  else if (g.k === 'bottle') { const h = 0.18 + g.h * 0.06; part(G.cyl8, g.c, x, y + h * 0.35, z, { sx: w, sy: h * 0.7, sz: w }); part(G.cyl8, g.c, x, y + h * 0.82, z, { sx: w * 0.35, sy: h * 0.3, sz: w * 0.35 }); part(G.cyl8, '#8a6a4a', x, y + h, z, { sx: w * 0.3, sy: 0.03, sz: w * 0.3 }); }
  else if (g.k === 'box') { const h = 0.12 + g.h * 0.12; part(G.box, '#8a6a4a', x, y + h / 2, z, { sx: w, sy: h, sz: 0.24 }); part(G.box, '#6a4a30', x, y + h + 0.006, z, { sx: w + 0.01, sy: 0.02, sz: 0.25 }); }
  else if (g.k === 'bowls') { for (let k = 0; k < 3 + Math.floor(g.h * 3); k++) part(G.cyl12, shade(g.c, k % 2 ? 0.9 : 1), x, y + 0.02 + k * 0.035, z, { sx: w - k * 0.005, sy: 0.035, sz: w - k * 0.005 }); }
  else { part(G.cyl12, '#d8b050', x, y + 0.05, z, { sx: w, sy: 0.1, sz: w }); part(G.cyl12, '#a88030', x, y + 0.1, z, { sx: w * 0.92, sy: 0.006, sz: w * 0.92 }); }
}
// a tankard at (x, y, z) (its foot), its handle toward ry
function tankard(x, y, z, g, rim, ry = 0) {
  part(G.cyl8, g, x, y + 0.065, z, { sx: 0.09, sy: 0.13, sz: 0.09 });
  part(G.cyl8, rim, x, y + 0.128, z, { sx: 0.095, sy: 0.012, sz: 0.095 });
  part(G.box, rim, x + Math.cos(ry) * 0.058, y + 0.07, z - Math.sin(ry) * 0.058, { sx: 0.025, sy: 0.08, sz: 0.018, ry });
}
// the bar: what stands on it and on the shelf behind
function barRoll(r, tiles) {
  const n = 1 + Math.floor(r() * (tiles + 1)), mugs = [];
  for (let k = 0; k < n; k++) mugs.push({ x: (tiles - 0.4) * ((k + 0.5) / n - 0.5) + (r() - 0.5) * 0.12, z: (r() - 0.5) * 0.18, full: r() < 0.6 });
  return { glaze: pick(r, GLAZES), mugs, jug: r() < 0.6 ? (r() - 0.5) * (tiles - 0.6) : null, cloth: r() < 0.5 ? (r() - 0.5) * (tiles - 0.6) : null, bottles: 2 + Math.floor(r() * 4) };
}
function barDescribe(L) { return [['Crockery', L.glaze[1], L.glaze[0]], ['On the bar', `${L.mugs.length} tankard${L.mugs.length > 1 ? 's' : ''}${L.jug != null ? ', a jug' : ''}${L.cloth != null ? ', a cloth' : ''}`]]; }
// a bar counter W long: its front (+z, toward the drinkers) boarded floor to top, a kick board, the top a thick slab
// overhanging the front; behind (-z, the innkeeper's side) open, a shelf of bottles and mugs under the top
function barCounter(W, L, C) {
  const zc = 0.08, D = 0.5, H = BAR_TOP - 0.05, f = zc + D / 2, g = CC(L.glaze[0]), rim = shade(g, 0.8);
  // the carcass: ends, a back rail, the shelf and the floor of it
  for (const s of [-1, 1]) part(G.box, C.dark, s * (W / 2 - 0.03), H / 2, zc, { sx: 0.06, sy: H, sz: D });
  part(G.box, C.wood, 0, H / 2, f - 0.03, { sx: W - 0.1, sy: H, sz: 0.04 });
  part(G.box, C.dark, 0, 0.04, zc - 0.02, { sx: W - 0.08, sy: 0.08, sz: D - 0.06 });
  part(G.box, C.wood, 0, 0.34, zc - 0.03, { sx: W - 0.1, sy: 0.03, sz: D - 0.1 });
  part(G.box, C.dark, 0, H - 0.04, zc - D / 2 + 0.03, { sx: W - 0.06, sy: 0.08, sz: 0.06 });
  // the front: upright boards, each its own shade, framed by a kick board and a rail under the top
  const nb = Math.round(W / 0.19);
  for (let k = 0; k < nb; k++) part(G.box, shade(C.light, 0.86 + 0.16 * ((k * 7) % 5) / 4), -W / 2 + 0.06 + (k + 0.5) * (W - 0.12) / nb, H / 2 + 0.03, f + 0.004, { sx: (W - 0.12) / nb - 0.012, sy: H - 0.16, sz: 0.012 });
  part(G.box, C.dark, 0, 0.06, f + 0.012, { sx: W - 0.04, sy: 0.12, sz: 0.024 });
  part(G.box, C.dark, 0, H - 0.04, f + 0.012, { sx: W - 0.04, sy: 0.07, sz: 0.024 });
  // the top
  part(G.box, C.light, 0, BAR_TOP - 0.025, zc + 0.02, { sx: W + 0.06, sy: 0.05, sz: D + 0.12 });
  // on the shelf behind: bottles and stacked mugs
  for (let k = 0; k < L.bottles; k++) {
    const x = -W / 2 + 0.2 + k * (W - 0.4) / Math.max(1, L.bottles - 1), c = ['#4a6a3a', '#6a4a2a', '#3a4a5a', '#7a6a4a'][k % 4];
    part(G.cyl8, c, x, 0.355 + 0.09, zc - 0.05, { sx: 0.08, sy: 0.18, sz: 0.08 });
    part(G.cyl8, c, x, 0.355 + 0.215, zc - 0.05, { sx: 0.03, sy: 0.07, sz: 0.03 });
  }
  for (const x of [-W / 4, W / 4]) tankard(x + 0.1, 0.355, zc - 0.12, g, rim, Math.PI / 2);
  // on top: tankards (some full, a head of froth), a jug, a cloth
  for (const m of L.mugs) {
    tankard(m.x, BAR_TOP, zc + 0.02 + m.z, g, rim, 0.4);
    if (m.full) part(G.cyl8, '#efe6cc', m.x, BAR_TOP + 0.128, zc + 0.02 + m.z, { sx: 0.075, sy: 0.016, sz: 0.075 });
  }
  if (L.jug != null) { part(G.cyl8, g, L.jug, BAR_TOP + 0.12, zc - 0.08, { sx: 0.16, sy: 0.24, sz: 0.16 }); part(G.cyl8, rim, L.jug, BAR_TOP + 0.26, zc - 0.08, { sx: 0.1, sy: 0.05, sz: 0.1 }); }
  if (L.cloth != null) part(G.box, '#d8ccb0', L.cloth, BAR_TOP + 0.005, zc + 0.1, { sx: 0.3, sy: 0.01, sz: 0.2, ry: 0.3 });
}
// a flat piece standing across the wall (in the y-z plane, from x0 to x1): pts are (z, y) round its edge, fanned
// about (cz, cy); both faces and its edge, laid each way round (it's seen from both sides)
function plateX(pts, cz, cy, x0, x1, color, oz = 0, oy = 0) {
  const P = (p, x) => [x, oy + p[1], oz + p[0]], m0 = [x0, oy + cy, oz + cz], m1 = [x1, oy + cy, oz + cz];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    tri(m1, P(b, x1), P(a, x1), color); tri(m0, P(a, x0), P(b, x0), color);
    tri(P(a, x0), P(b, x1), P(b, x0), color); tri(P(a, x0), P(a, x1), P(b, x1), color);
    tri(P(a, x0), P(b, x0), P(b, x1), color); tri(P(a, x0), P(b, x1), P(a, x1), color);
  }
}
// the tavern sign: an iron bracket out from the wall (its plate on the wall's outer face at -z, the arm along +z), a
// board hung from it across the wall, a keg painted on both faces in a painted border. L.up: hung over the door on
// the story above (lower on its wall), else on the wall beside the door, high
function tavernSign(L, C, emblem = 'keg') {
  const z0 = backZ(1), Ya = L.up ? 0.9 : 1.9, arm = 0.86, B = CC(L.board[0]), K = CC(L.paint[0]);
  // the wall plate, the arm and its brace
  part(G.box, IRON, 0, Ya - 0.18, z0 + 0.015, { sx: 0.09, sy: 0.5, sz: 0.03 });
  for (const y of [Ya + 0.02, Ya - 0.38]) part(G.box, IRON_LT, 0, y, z0 + 0.035, { sx: 0.05, sy: 0.035, sz: 0.02 });
  part(G.box, IRON, 0, Ya, z0 + arm / 2, { sx: 0.035, sy: 0.04, sz: arm });
  part(G.oct, IRON, 0, Ya, z0 + arm + 0.03, { sx: 0.06, sy: 0.08, sz: 0.06 });
  seg(G.box, IRON, [0, Ya - 0.4, z0 + 0.03], [0, Ya - 0.02, z0 + arm * 0.62], 0.016);
  if (L.scroll) {
    // two curls in the bracket's corner and one riding the arm
    const curl = (cz, cy, R, a0, turns) => {
      let p = null;
      for (let k = 0; k <= 10 * turns; k++) {
        const t = k / 10, a = a0 + t * Math.PI * 2, rr = R * (1 - t / (turns + 0.4)), q = [0, cy + Math.sin(a) * rr, cz + Math.cos(a) * rr];
        if (p) seg(G.box, IRON, p, q, 0.009);
        p = q;
      }
    };
    curl(z0 + 0.15, Ya - 0.14, 0.1, Math.PI / 2, 1);
    curl(z0 + 0.36, Ya - 0.08, 0.07, -Math.PI / 2, 1);
    curl(z0 + arm - 0.2, Ya + 0.08, 0.07, -Math.PI / 2, 1);
  }
  // the board hung under the arm, its border and the keg
  const bt = 0.045, bh = 0.46, bw = 0.62, bz = z0 + 0.15 + bw / 2, by = Ya - 0.14 - bh / 2;
  for (const z of [bz - bw / 2 + 0.1, bz + bw / 2 - 0.1]) {
    if (L.chains) for (let k = 0; k < 3; k++) part(G.box, IRON, 0, Ya - 0.03 - k * 0.04, z, { sx: k % 2 ? 0.02 : 0.008, sy: 0.04, sz: k % 2 ? 0.008 : 0.02 });
    else seg(G.cyl6, '#b8a47a', [0, Ya - 0.02, z], [0, by + bh / 2, z], 0.008);
    part(G.box, IRON_LT, 0, by + bh / 2 - 0.015, z, { sx: bt + 0.01, sy: 0.04, sz: 0.03 });
  }
  part(G.box, B, 0, by, bz, { sx: bt, sy: bh, sz: bw });
  for (const s of [-1, 1]) {
    const x = s * (bt / 2 + 0.002), x1 = s * (bt / 2 + 0.006), x2 = s * (bt / 2 + 0.01);
    // the painted border
    for (const [dz, dy, lz, ly] of [[0, bh / 2 - 0.04, bw - 0.08, 0.018], [0, -bh / 2 + 0.04, bw - 0.08, 0.018], [bw / 2 - 0.04, 0, 0.018, bh - 0.08], [-bw / 2 + 0.04, 0, 0.018, bh - 0.08]])
      part(G.box, K, (x + x1) / 2, by + dy, bz + dz, { sx: Math.abs(x1 - x), sy: ly, sz: lz });
    if (emblem === 'coins') { signCoins(s, x, x1, x2, by, bz); continue; }
    // the keg on its side: a bellied outline, darker hoops and stave lines over it, the tap at one end
    plateX([[-0.17, -0.085], [-0.09, -0.115], [0.09, -0.115], [0.17, -0.085], [0.17, 0.085], [0.09, 0.115], [-0.09, 0.115], [-0.17, 0.085]], 0, 0, s < 0 ? x1 : x, s < 0 ? x : x1, K, bz, by - 0.01);
    for (const hz of [-0.12, -0.05, 0.05, 0.12]) part(G.box, IRON, (x1 + x2) / 2 - s * 0.001, by - 0.01, bz + hz, { sx: Math.abs(x2 - x1) + 0.002, sy: Math.abs(hz) > 0.1 ? 0.19 : 0.225, sz: 0.018 });
    for (const sy of [-0.04, 0.04]) part(G.box, shade(B, 0.8), x1, by - 0.01 + sy, bz, { sx: 0.004, sy: 0.008, sz: 0.3 });   // (2 mm proud: the hoops 4)
    part(G.box, '#b8903a', (x + x2) / 2, by - 0.04, bz - 0.19, { sx: Math.abs(x2 - x), sy: 0.03, sz: 0.05 });
    part(G.box, '#b8903a', (x + x2) / 2, by - 0.07, bz - 0.205, { sx: Math.abs(x2 - x), sy: 0.05, sz: 0.02 });
  }
}
// (2026-11-03, Jordan: a bank sign like the tavern's, a pile of coins on it) on face s of the board (x the board's
// face, x1 and x2 a layer and two proud): round coins heaped four, three, two, one, each row a layer prouder than the
// one under it (6 mm) so they overlap without sharing a plane, each a gold disc with a darker rim and a mark stamped in it
function signCoins(s, x, x1, x2, by, bz) {
  const n = 14, R = 0.046, circ = r => Array.from({ length: n }, (_, k) => [Math.cos(k / n * Math.PI * 2) * r, Math.sin(k / n * Math.PI * 2) * r]);
  const rows = [4, 3, 2, 1], dy = 0.068, y0 = by - 0.12;
  rows.forEach((m, k) => {
    const a = x + s * 0.007 * (k + 1), b = a + s * 0.002, c = b + s * 0.002;   // (3 mm between one row's face and the next row's back)
    for (let j = 0; j < m; j++) {
      const z = bz + (j - (m - 1) / 2) * (2 * R + 0.006), y = y0 + k * dy;
      plateX(circ(R), 0, 0, s < 0 ? b : a, s < 0 ? a : b, GOLD_DK, z, y);
      plateX(circ(R * 0.78), 0, 0, s < 0 ? c : b, s < 0 ? b : c, GOLD, z, y);
      part(G.box, GOLD_DK, c + s * 0.0015, y, z, { sx: 0.002, sy: 0.034, sz: 0.008 });
    }
  });
  // two coins fallen flat before the heap, seen edge on
  for (const dz of [-0.215, 0.215]) part(G.box, GOLD, (x + x2) / 2, y0 - 0.05, bz + dz, { sx: Math.abs(x2 - x), sy: 0.012, sz: 0.09 });
}
// a stack of n coins at (x, y, z), its top a little off true
function coinStack(x, y, z, n, r = 0.026) {
  for (let k = 0; k < n; k++) part(G.cyl12, k % 2 ? GOLD : shade(CC(GOLD), 0.9), x + ((k * 7) % 3 - 1) * 0.002, y + 0.006 + k * 0.012, z + ((k * 5) % 3 - 1) * 0.002, { sx: r * 2, sy: 0.011, sz: r * 2 });
}
// the vault door: a round steel door 1.36 across, its middle 0.92 up, in a ring of dark iron, framed in ashlar
// blocks (jambs, a plinth, a lintel with a keystone) against the wall; bolts round its face, a raised inner ring,
// two great hinges on its left, a brass wheel of three spokes in the middle and maybe a dial
function vaultDoor(L, C) {
  const z0 = backZ(1), cy = 0.92, St = CC(L.steel[0]), Sn = CC(L.stone[0]), N = 24;
  const disc = (r) => Array.from({ length: N }, (_, k) => [Math.cos(k / N * Math.PI * 2) * r, Math.sin(k / N * Math.PI * 2) * r]);
  // the surround: each block its own shade
  const blk = (x, y, w, h, k) => part(G.box, shade(Sn, 0.9 + 0.14 * ((k * 7) % 5) / 4), x, y, z0 + 0.06, { sx: w, sy: h, sz: 0.12 });
  blk(0, 0.06, 1.86, 0.12, 0);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) blk(s * 0.82, 0.12 + 0.2 + k * 0.4, k % 2 ? 0.22 : 0.26, 0.392, k + (s > 0 ? 4 : 0));
  blk(0, 1.8, 1.86, 0.16, 9);
  part(G.box, shade(Sn, 1.1), 0, 1.8, z0 + 0.13, { sx: 0.24, sy: 0.2, sz: 0.03 });
  // the iron ring it sits in, the door, the inner ring
  part(G.box, '#26262c', 0, cy, z0 + 0.015, { sx: 1.42, sy: 1.42, sz: 0.03 });
  plate(disc(0.71), 0, 0, z0 + 0.03, z0 + 0.1, shade(CC(IRON), 0.9), 0, cy);
  plate(disc(0.66), 0, 0, z0 + 0.1, z0 + 0.2, St, 0, cy, shade(St, 0.8));
  plate(disc(0.44), 0, 0, z0 + 0.2, z0 + 0.215, shade(St, 1.12), 0, cy);
  plate(disc(0.36), 0, 0, z0 + 0.215, z0 + 0.22, shade(St, 0.92), 0, cy);
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; part(G.oct, shade(St, 0.7), Math.cos(a) * 0.56, cy + Math.sin(a) * 0.56, z0 + 0.21, { sx: 0.04, sy: 0.04, sz: 0.03 }); }
  // the hinges, out over the ring onto the jamb
  for (const y of [cy - 0.38, cy + 0.38]) {
    part(G.box, shade(CC(IRON), 1.2), -0.6, y, z0 + 0.23, { sx: 0.34, sy: 0.12, sz: 0.06 });
    seg(G.cyl8, IRON, [-0.76, y - 0.1, z0 + 0.23], [-0.76, y + 0.1, z0 + 0.23], 0.04);
  }
  // the wheel: a hub, three spokes, a rim of segments, knobs on the rim
  const zw = z0 + 0.28, Rw = 0.27, nb = 12;
  seg(G.cyl8, BRASS, [0, cy, z0 + 0.22], [0, cy, zw + 0.02], 0.05);
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + 0.3; seg(G.cyl6, BRASS, [0, cy, zw], [Math.cos(a) * Rw, cy + Math.sin(a) * Rw, zw], 0.014); part(G.oct, BRASS, Math.cos(a) * (Rw + 0.04), cy + Math.sin(a) * (Rw + 0.04), zw, { s: 0.05 }); }
  for (let k = 0; k < nb; k++) { const a0 = k / nb * Math.PI * 2, a1 = (k + 1) / nb * Math.PI * 2; seg(G.cyl6, BRASS, [Math.cos(a0) * Rw, cy + Math.sin(a0) * Rw, zw], [Math.cos(a1) * Rw, cy + Math.sin(a1) * Rw, zw], 0.016); }
  if (L.dial) { seg(G.cyl12, BRASS, [0.47, cy + 0.12, z0 + 0.2], [0.47, cy + 0.12, z0 + 0.24], 0.06); part(G.box, IRON, 0.47, cy + 0.15, z0 + 0.245, { sx: 0.01, sy: 0.05, sz: 0.008 }); }
}
// the teller counter: a stone front in panels between a plinth and a moulding, a dark wood top, and on it an iron
// grille of bars between posts, a window in each bay (open below an arch, a brass tray through it); behind, open,
// a shelf; on the top the ledger, coin stacks and maybe a bell
// (L.w tiles long, 3 by default; L.line: one piece of a counter across the room, its ends square to its neighbours')
function tellerCounter(L, C) {
  const T = L.w || 3, ln = !!L.line, W = ln ? T : T - 0.1, ov = ln ? 0 : 1, zc = 0.08, D = 0.5, H = BAR_TOP - 0.05, f = zc + D / 2, Sn = CC(L.stone[0]), r = mulberry32(L.seed || 1);
  for (const s of [-1, 1]) part(G.box, shade(Sn, 0.85), s * (W / 2 - 0.04), H / 2, zc, { sx: 0.08, sy: H, sz: D });
  part(G.box, Sn, 0, H / 2, f - 0.04, { sx: W - 0.16, sy: H, sz: 0.06 });
  part(G.box, C.dark, 0, 0.3, zc - 0.03, { sx: W - 0.16, sy: 0.03, sz: D - 0.12 });
  part(G.box, shade(Sn, 0.8), 0, 0.05, f + 0.005, { sx: W + 0.02 * ov, sy: 0.1, sz: 0.03 });
  part(G.box, shade(Sn, 1.08), 0, H - 0.03, f + 0.008, { sx: W + 0.03 * ov, sy: 0.06, sz: 0.036 });
  const np = Math.max(1, Math.round(W * 1.4));
  for (let k = 0; k < np; k++) {
    const w = (W - 0.2) / np, x = -W / 2 + 0.1 + (k + 0.5) * w;
    part(G.box, shade(Sn, 1.06), x, H / 2 + 0.02, f + 0.005, { sx: w - 0.08, sy: H - 0.26, sz: 0.012 });
    part(G.box, shade(Sn, 0.94), x, H / 2 + 0.02, f + 0.013, { sx: w - 0.18, sy: H - 0.36, sz: 0.008 });
  }
  part(G.box, C.dark, 0, BAR_TOP - 0.025, zc + 0.02, { sx: W + 0.06 * ov, sy: 0.05, sz: D + 0.1 });
  // the grille: posts at the ends and between bays, rails top and above the windows, bars between
  const gz = zc + 0.1, gy0 = BAR_TOP, gy1 = 1.55, nb = L.bays, bw = W / nb, wy = gy0 + 0.36;
  for (let k = 0; k <= nb; k++) part(G.box, IRON, -W / 2 + 0.03 + k * (W - 0.06) / nb, (gy0 + gy1) / 2, gz, { sx: 0.05, sy: gy1 - gy0, sz: 0.05 });
  part(G.box, IRON, 0, gy1, gz, { sx: W, sy: 0.05, sz: 0.06 });
  for (let k = 0; k < nb; k++) {
    const x0 = -W / 2 + k * bw, xm = x0 + bw / 2, hw = 0.2;
    // the arch over the window, the bars down to it and down to the top either side
    let p = null;
    for (let j = 0; j <= 8; j++) { const a = Math.PI * j / 8, q = [xm - Math.cos(a) * hw, wy + Math.sin(a) * 0.12, gz]; if (p) seg(G.box, IRON, p, q, 0.012); p = q; }
    for (let x = x0 + 0.09; x < x0 + bw - 0.06; x += 0.075) {
      const dx = Math.abs(x - xm), top = gy1;
      if (dx >= hw && dx < hw + 0.035) continue;   // (none against the window's posts)
      if (dx < hw) { const yb = wy + Math.sqrt(Math.max(0, 1 - (dx / hw) ** 2)) * 0.12; if (top - yb > 0.02) seg(G.cyl6, IRON, [x, yb, gz], [x, top, gz], 0.008); }
      else seg(G.cyl6, IRON, [x, gy0, gz], [x, top, gz], 0.008);
    }
    for (const s of [-1, 1]) part(G.box, IRON, xm + s * hw, (gy0 + wy) / 2, gz, { sx: 0.03, sy: wy - gy0, sz: 0.04 });
    // the tray through the window
    part(G.box, BRASS, xm, gy0 + 0.012, gz, { sx: 0.3, sy: 0.02, sz: 0.24 });
    part(G.box, shade(CC(BRASS), 1.15), xm, gy0 + 0.024, gz, { sx: 0.26, sy: 0.006, sz: 0.2 });
  }
  // behind the grille: the ledger, coin stacks, the bell
  if (T < 2) return;
  part(G.box, L.cover, -W / 2 + bw / 2 + 0.05, gy0 + 0.012, zc - 0.12, { sx: 0.4, sy: 0.02, sz: 0.28, ry: 0.15 });
  part(G.box, '#ece4cc', -W / 2 + bw / 2 + 0.05, gy0 + 0.026, zc - 0.12, { sx: 0.36, sy: 0.008, sz: 0.24, ry: 0.15 });
  for (let k = 0; k < Math.min(L.stacks, Math.floor((W / 2 - 0.45 - (-W / 2 + bw + 0.1)) / 0.16) + 1); k++) coinStack(-W / 2 + bw + 0.1 + k * 0.16 + r() * 0.04, gy0, zc - 0.1 - r() * 0.08, 3 + Math.floor(r() * 6));
  if (L.bell) { part(G.cyl12, BRASS, W / 2 - 0.3, gy0 + 0.006, zc - 0.1, { sx: 0.1, sy: 0.012, sz: 0.1 }); part(G.oct, shade(CC(BRASS), 1.1), W / 2 - 0.3, gy0 + 0.05, zc - 0.1, { sx: 0.08, sy: 0.07, sz: 0.08 }); }
  // the shelf behind: two ledgers lying and a strongbox
  part(G.box, BOOKS[1], -0.6, 0.33, zc - 0.05, { sx: 0.32, sy: 0.05, sz: 0.24 });
  part(G.box, BOOKS[5], -0.6, 0.375, zc - 0.05, { sx: 0.3, sy: 0.04, sz: 0.22 });
  part(G.box, '#4a3422', 0.5, 0.42, zc - 0.05, { sx: 0.36, sy: 0.2, sz: 0.24 });
  for (const x of [0.36, 0.64]) part(G.box, IRON, x, 0.42, zc - 0.05, { sx: 0.03, sy: 0.21, sz: 0.25 });
}
// the gate in the counter: the grille's posts each side (the counter's line, z 0.18) up to its top rail height, a
// short rail across the top, a low wooden leaf with iron bands hung on one post and swung open back behind the counter
function counterGate(L, C) {
  const gz = 0.18, gy1 = 1.55, sw = L.swing, Hl = BAR_TOP - 0.06;
  for (const s of [-1, 1]) part(G.box, IRON, s * 0.47, gy1 / 2, gz, { sx: 0.05, sy: gy1, sz: 0.05 });
  part(G.box, IRON, 0, gy1, gz, { sx: 1, sy: 0.05, sz: 0.06 });
  // the leaf: hung at x = sw * 0.44, swung round to run back along that side
  const x = sw * 0.42, z0 = gz - 0.05, len = 0.84;
  part(G.box, C.wood, x, 0.05 + Hl / 2, z0 - len / 2, { sx: 0.04, sy: Hl, sz: len });
  for (const y of [0.16, Hl - 0.06]) part(G.box, IRON, x, 0.05 + y, z0 - len / 2, { sx: 0.05, sy: 0.04, sz: len + 0.01 });
  part(G.box, C.dark, x, 0.05 + Hl + 0.02, z0 - len / 2, { sx: 0.06, sy: 0.04, sz: len + 0.02 });
  for (const y of [0.2, Hl - 0.1]) part(G.box, IRON_LT, sw * 0.455, 0.05 + y, z0 + 0.01, { sx: 0.03, sy: 0.08, sz: 0.04 });
  part(G.box, BRASS, x - sw * 0.03, 0.05 + Hl * 0.6, z0 - len + 0.06, { sx: 0.02, sy: 0.05, sz: 0.03 });
}
// the coin table: a small square table with a baize top, brass scales on it (a post, a beam tipped a little, two
// pans hung on cords), stacks of coin and a coin bag
function coinTable(L, C) {
  const W = 0.74, top = TABLE_TOP + 0.3, r = mulberry32(L.seed || 1), B = CC(L.baize[0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(G.box, C.dark, sx * (W / 2 - 0.05), (top - 0.04) / 2, sz * (W / 2 - 0.05), { sx: 0.06, sy: top - 0.04, sz: 0.06 });
  for (const s of [-1, 1]) { part(G.box, C.dark, 0, top - 0.1, s * (W / 2 - 0.05), { sx: W - 0.16, sy: 0.08, sz: 0.035 }); part(G.box, C.dark, s * (W / 2 - 0.05), top - 0.1, 0, { sx: 0.035, sy: 0.08, sz: W - 0.16 }); }
  part(G.box, C.wood, 0, top - 0.025, 0, { sx: W, sy: 0.05, sz: W });
  part(G.box, B, 0, top + 0.002, 0, { sx: W - 0.08, sy: 0.006, sz: W - 0.08 });
  // the scales
  const sx0 = -0.1, sz0 = -0.1, ph = 0.34, arm = 0.17, t = L.tip;
  part(G.cyl12, BRASS, sx0, top + 0.012, sz0, { sx: 0.12, sy: 0.02, sz: 0.12 });
  seg(G.cyl6, BRASS, [sx0, top + 0.02, sz0], [sx0, top + ph, sz0], 0.01);
  part(G.oct, BRASS, sx0, top + ph + 0.02, sz0, { s: 0.035 });
  const ends = [-1, 1].map(s => [sx0 + s * arm * Math.cos(t), top + ph + s * arm * Math.sin(t), sz0]);
  seg(G.box, BRASS, ends[0], ends[1], 0.007);
  for (const e of ends) {
    const py = top + 0.12 + (e[1] - top - ph);
    for (const dz of [-0.04, 0.04]) seg(G.cyl6, '#8a7a5a', e, [e[0], py, e[2] + dz], 0.003);
    part(G.cyl12, BRASS, e[0], py, e[2], { sx: 0.11, sy: 0.012, sz: 0.11 });
  }
  coinStack(ends[1][0], top + 0.12 + (ends[1][1] - top - ph), sz0, 2, 0.02);
  for (let k = 0; k < L.stacks; k++) coinStack(0.04 + (k % 2) * 0.1 + r() * 0.03, top + 0.005, 0.05 + Math.floor(k / 2) * 0.09 + r() * 0.02, 2 + Math.floor(r() * 6));
  part(G.oct, '#a88a5a', 0.2, top + 0.07, -0.18, { sx: 0.16, sy: 0.14, sz: 0.14 });
  part(G.cyl6, '#8a6a3a', 0.2, top + 0.14, -0.18, { sx: 0.04, sy: 0.04, sz: 0.04 });
}
// a strongbox against the wall: iron-banded wood on low feet, iron corners, a brass lock plate and a padlock, maybe
// a tied sack of coin beside it
function strongbox(L, C) {
  const W = L.big ? 0.7 : 0.54, D = L.big ? 0.46 : 0.38, H = L.big ? 0.42 : 0.34, z = midZ(1, D), body = L.paint[2] || C.wood, y0 = 0.05;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(G.box, IRON, sx * (W / 2 - 0.04), y0 / 2, z + sz * (D / 2 - 0.04), { sx: 0.06, sy: y0, sz: 0.06 });
  part(G.box, body, 0, y0 + H / 2, z, { sx: W, sy: H, sz: D });
  part(G.box, shade(CC(body), 1.15), 0, y0 + H + 0.025, z, { sx: W + 0.02, sy: 0.05, sz: D + 0.02 });
  for (const x of [-W / 2 + 0.1, 0, W / 2 - 0.1]) if (x) part(G.box, IRON, x, y0 + (H + 0.05) / 2, z, { sx: 0.035, sy: H + 0.062, sz: D + 0.024 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(G.box, IRON_LT, sx * (W / 2 - 0.019), y0 + H + 0.025, z + (sz > 0 ? D / 2 - 0.022 : -D / 2 + 0.035), { sx: 0.07, sy: 0.07, sz: 0.07 });
  part(G.box, BRASS, 0, y0 + H - 0.06, z + D / 2 + 0.008, { sx: 0.12, sy: 0.12, sz: 0.012 });
  seg(G.cyl6, IRON_LT, [-0.03, y0 + H - 0.1, z + D / 2 + 0.03], [0.03, y0 + H - 0.1, z + D / 2 + 0.03], 0.008);
  part(G.box, IRON, 0, y0 + H - 0.16, z + D / 2 + 0.03, { sx: 0.08, sy: 0.07, sz: 0.03 });
  if (L.sack) {
    const x = W / 2 + 0.06;
    part(G.oct, '#a88a5a', x, 0.11, z + 0.05, { sx: 0.15, sy: 0.22, sz: 0.16 });
    part(G.cyl6, '#8a6a3a', x, 0.22, z + 0.05, { sx: 0.05, sy: 0.04, sz: 0.05 });
    coinStack(x - 0.02, 0, z + 0.19, 2, 0.02);
  }
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
  // (each layer's top 4 mm over the one under it, so none fight)
  part(G.box, B, 0, 0.008, 0, { sx: W, sy: 0.016, sz: D });
  part(G.box, A, 0, 0.01, 0, { sx: W - 0.16, sy: 0.02, sz: D - 0.16 });
  part(G.box, F, 0, 0.012, 0, { sx: W - 0.24, sy: 0.024, sz: D - 0.24 });
  const y = 0.026;
  if (p === 'medallion') {
    part(G.box, A, 0, y, 0, { sx: 0.6, sy: 0.004, sz: 0.6, ry: Math.PI / 4 });
    part(G.box, B, 0, y + 0.004, 0, { sx: 0.36, sy: 0.004, sz: 0.36, ry: Math.PI / 4 });
    part(G.box, A, 0, y + 0.008, 0, { sx: 0.14, sy: 0.004, sz: 0.14, ry: Math.PI / 4 });
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

// ---------- the guard house's set (2026-11-03, Jordan) ----------
const BLADES = [['#a8acb8', 'Bright steel'], ['#8a8e98', 'Grey steel'], ['#9a9488', 'Old iron']];
const GRIPS = [['#4a2e1e', 'Brown leather'], ['#2a2420', 'Black leather'], ['#6a2a24', 'Red leather']];
const ARMOR_KINDS = [['chain', 'A mail shirt', '#8a8e98', 3], ['plate', 'A breastplate and pauldrons', '#b0b4bc', 2], ['leather', 'A leather jack', '#6a4a2e', 2]];
const SACKS = [['#b8986a', 'Burlap'], ['#a88a5a', 'Old sacking'], ['#c8b088', 'Pale canvas']];
const BUTT_FACES = [['rings', 'Painted rings', 3], ['bull', 'A black bull\'s-eye', 2], ['straw', 'Bare straw', 1]];
const STRAW = '#c8a868';
// the weapon rack: two posts, a plank base with a slotted foot rail, a top rail the shafts lean in, spears on the left
// half (heads up), swords on the right (points down, hilts up through a slotted rail). L.practice: wooden ones,
// padded spear heads, for the training yard
function weaponRack(L, C) {
  const zb = backZ(1), W = 1.84, H = 1.6, steel = L.practice ? shade(C.light, 1.15) : CC(L.steel[0]), grip = CC(L.grip[0]);
  for (const s of [-1, 1]) {
    part(G.box, C.dark, s * (W / 2 - 0.04), H / 2, zb + 0.06, { sx: 0.07, sy: H, sz: 0.07 });
    part(G.box, C.dark, s * (W / 2 - 0.04), 0.03, zb + 0.15, { sx: 0.09, sy: 0.06, sz: 0.24 });
  }
  part(G.box, C.wood, 0, 0.05, zb + 0.16, { sx: W - 0.1, sy: 0.04, sz: 0.24 });
  part(G.box, C.wood, 0, 0.14, zb + 0.25, { sx: W - 0.1, sy: 0.08, sz: 0.04 });   // (the foot rail the butts stand behind)
  part(G.box, C.wood, 0, 1.3, zb + 0.06, { sx: W - 0.1, sy: 0.06, sz: 0.04 });
  part(G.box, C.wood, W / 4, 0.92, zb + 0.18, { sx: W / 2 - 0.12, sy: 0.04, sz: 0.06 });   // (the sword rail)
  part(G.box, C.dark, W / 4, 0.92, zb + 0.12, { sx: 0.04, sy: 0.04, sz: 0.08 });
  part(G.box, C.dark, W / 2 - 0.06, 0.92, zb + 0.12, { sx: 0.04, sy: 0.04, sz: 0.09 });
  // the spears: shafts from the base up past the top rail, leaning back onto it
  for (let k = 0; k < L.spears; k++) {
    const x = -W / 2 + 0.2 + k * ((W / 2 - 0.3) / Math.max(1, L.spears - 1)), top = 1.84;
    if (k === L.gone && L.spears > 2) continue;   // (one out on the watch)
    seg(G.cyl6, C.light, [x, 0.08, zb + 0.2], [x, top, zb + 0.11], 0.016);
    if (L.practice) { part(G.oct, shade(CC('#d8ccb0'), 0.9), x, top + 0.04, zb + 0.11, { sx: 0.09, sy: 0.11, sz: 0.09 }); continue; }
    part(G.cyl6, IRON, x, top + 0.01, zb + 0.11, { sx: 0.04, sy: 0.06, sz: 0.04 });
    part(G.oct, steel, x, top + 0.12, zb + 0.11, { sx: 0.06, sy: 0.2, sz: 0.022 });
  }
  // the swords: point down on the base, the blade through the rail, guard, grip and pommel above it
  for (let k = 0; k < L.swords; k++) {
    const x = 0.16 + k * ((W / 2 - 0.36) / Math.max(1, L.swords - 1)), z = zb + 0.18;
    part(G.box, steel, x, 0.53, z, { sx: 0.05, sy: 0.86, sz: 0.012 });
    part(G.box, shade(steel, 0.8), x, 0.53, z, { sx: 0.012, sy: 0.84, sz: 0.02 });   // (the fuller's ridge)
    part(G.box, L.practice ? C.dark : IRON_LT, x, 1.0, z, { sx: 0.2, sy: 0.03, sz: 0.035 });
    part(G.cyl6, L.practice ? C.dark : grip, x, 1.1, z, { sx: 0.035, sy: 0.17, sz: 0.035 });
    part(G.oct, L.practice ? C.dark : BRASS, x, 1.2, z, { s: 0.055 });
  }
}
// the armor stand: a cross of feet, a post, a shoulder bar; mail, a breastplate or a leather jack on it, a tabard
// over the front maybe, and a helm on the post's top
function armorStand(L, C) {
  const kind = L.kind[0], A = CC(L.kind[2]), y0 = 0.68, y1 = 1.2;
  for (const a of [0, Math.PI / 2]) part(G.box, C.dark, 0, 0.035, 0, { sx: 0.6, sy: 0.07, sz: 0.08, ry: a + 0.4 });
  part(G.cyl8, C.dark, 0, 0.62, 0, { sx: 0.06, sy: 1.18, sz: 0.06 });
  part(G.box, C.dark, 0, y1 + 0.02, -0.02, { sx: 0.5, sy: 0.05, sz: 0.06 });
  // the body: a tapering stack, chest to waist
  const rows = kind === 'chain' ? 6 : 3;
  for (let k = 0; k < rows; k++) {
    const t0 = k / rows, w = 0.3 + 0.08 * t0, h = (y1 - y0) / rows;
    part(G.box, shade(A, kind === 'chain' ? (k % 2 ? 0.88 : 1) : 1 - k * 0.04), 0, y0 + (k + 0.5) * h, 0, { sx: w, sy: h, sz: 0.2 + 0.03 * t0 });
  }
  if (kind === 'chain') {
    part(G.box, shade(A, 0.8), 0, y0 - 0.1, 0, { sx: 0.38, sy: 0.2, sz: 0.22 });   // (the skirt)
    for (const s of [-1, 1]) part(G.box, shade(A, 0.92), s * 0.24, y1 - 0.12, 0, { sx: 0.1, sy: 0.22, sz: 0.18 });
  } else if (kind === 'plate') {
    seg(G.box, shade(A, 1.15), [0, y0 + 0.06, 0.12], [0, y1 - 0.04, 0.14], 0.02);   // (the ridge down the breastplate)
    for (const s of [-1, 1]) {
      part(G.oct, shade(A, 1.05), s * 0.22, y1 - 0.02, 0, { sx: 0.2, sy: 0.14, sz: 0.24 });
      part(G.box, shade(A, 0.85), s * 0.27, y1 - 0.13, 0, { sx: 0.1, sy: 0.08, sz: 0.2 });
    }
    for (let k = 0; k < 2; k++) part(G.box, shade(A, 0.9 - k * 0.06), 0, y0 - 0.04 - k * 0.07, 0.005 * k, { sx: 0.36 + k * 0.02, sy: 0.07, sz: 0.22 + k * 0.01 });
  } else {
    for (const y of [y0 + 0.1, y0 + 0.3]) part(G.box, shade(A, 0.7), 0, y, 0, { sx: 0.4, sy: 0.03, sz: 0.24 });   // (straps)
    for (const s of [-1, 1]) part(G.box, shade(A, 1.1), s * 0.21, y1 - 0.06, 0, { sx: 0.1, sy: 0.12, sz: 0.2 });
    part(G.box, shade(A, 0.9), 0, y0 - 0.08, 0, { sx: 0.38, sy: 0.16, sz: 0.22 });
  }
  if (L.tabard) {
    const D = CC(L.dye[0]);
    part(G.box, D, 0, y0 + 0.2, 0.125, { sx: 0.24, sy: 0.62, sz: 0.012 });
    part(G.box, D, 0, y0 + 0.2, -0.125, { sx: 0.24, sy: 0.62, sz: 0.012 });
    part(G.box, shade(D, 0.75), 0, y0 + 0.36, 0.136, { sx: 0.1, sy: 0.1, sz: 0.008, rz: Math.PI / 4 });
  }
  // the helm on the post's top
  const hy = y1 + 0.18, h = L.helm[0], S = CC(BLADES[1][0]);
  part(G.cyl8, C.dark, 0, y1 + 0.08, 0, { sx: 0.05, sy: 0.12, sz: 0.05 });
  if (h === 'kettle') {
    part(G.cyl12, S, 0, hy + 0.04, 0, { sx: 0.22, sy: 0.12, sz: 0.24 });
    part(G.oct, S, 0, hy + 0.11, 0, { sx: 0.22, sy: 0.08, sz: 0.24 });
    part(G.cyl12, shade(S, 0.9), 0, hy - 0.02, 0, { sx: 0.38, sy: 0.02, sz: 0.4 });
  } else if (h === 'great') {
    part(G.cyl8, S, 0, hy + 0.05, 0, { sx: 0.22, sy: 0.24, sz: 0.24, ry: Math.PI / 8 });
    part(G.box, '#1a1a1e', 0, hy + 0.08, 0.112, { sx: 0.16, sy: 0.02, sz: 0.01 });
    part(G.box, shade(S, 1.1), 0, hy + 0.02, 0.114, { sx: 0.02, sy: 0.1, sz: 0.012 });
  } else if (h === 'cap') {
    part(G.oct, S, 0, hy + 0.05, 0, { sx: 0.22, sy: 0.2, sz: 0.24 });
    part(G.box, shade(S, 0.9), 0, hy - 0.01, 0.1, { sx: 0.03, sy: 0.12, sz: 0.02 });
  }
}
// the holding cell: iron bars across its front edge and either open side (L.wl, L.wr: a wall stands at that side,
// set by the game), a door of bars in the front with its lock; a cot along the back wall with a straw pallet,
// a bucket, straw on the floor, shackles on chains maybe
function holdingCell(L, C) {
  const zb = backZ(2), zf = 0.9, xs = 0.9, top = 1.92, bar = 0.016;
  const bars = (a, b) => { const n = Math.max(2, Math.round(Math.abs(b - a) / 0.15)); for (let k = 1; k < n; k++) part(G.cyl6, IRON, a + (b - a) * k / n, top / 2, zf, { sx: bar * 2, sy: top, sz: bar * 2 }); };
  // the front: corner posts, rails top, bottom and middle, bars between, the door's frame and lock
  const xl = L.wl ? -1 + WALL_IN + 0.04 : -xs, xr = L.wr ? 1 - WALL_IN - 0.04 : xs;
  for (const x of [xl, xr]) part(G.box, IRON, x, top / 2, zf, { sx: 0.06, sy: top, sz: 0.06 });
  for (const y of [0.05, 1.0, top - 0.03]) part(G.box, IRON_LT, (xl + xr) / 2, y, zf, { sx: xr - xl, sy: 0.04, sz: 0.028 });
  bars(xl, xr);
  const dx = L.door < 0 ? xl + 0.42 : xr - 0.42;
  for (const x of [dx - 0.36, dx + 0.36]) part(G.box, IRON, x, top / 2 - 0.04, zf + 0.022, { sx: 0.04, sy: top - 0.12, sz: 0.012 });
  for (const y of [0.16, top - 0.12]) part(G.box, IRON, dx, y, zf + 0.022, { sx: 0.76, sy: 0.04, sz: 0.012 });
  const hx = L.door < 0 ? dx - 0.36 : dx + 0.36, lx = L.door < 0 ? dx + 0.33 : dx - 0.33;
  for (const y of [0.4, 1.5]) part(G.cyl6, IRON_LT, hx, y, zf + 0.02, { sx: 0.05, sy: 0.12, sz: 0.05 });
  part(G.box, IRON_LT, lx, 1.0, zf + 0.05, { sx: 0.12, sy: 0.16, sz: 0.06 });
  part(G.box, '#1a1a1e', lx, 0.98, zf + 0.082, { sx: 0.02, sy: 0.05, sz: 0.004 });
  // the open sides: posts at the back, rails and bars from the back wall to the front
  for (const [s, wall] of [[-1, L.wl], [1, L.wr]]) {
    if (wall) continue;
    const x = s * xs;
    part(G.box, IRON, x, top / 2, zb + 0.03, { sx: 0.06, sy: top, sz: 0.06 });
    for (const y of [0.05, 1.0, top - 0.03]) part(G.box, IRON_LT, x, y, (zb + zf) / 2, { sx: 0.036, sy: 0.04, sz: zf - zb - 0.06 });
    const n = Math.max(2, Math.round((zf - zb) / 0.15));
    for (let k = 1; k < n; k++) part(G.cyl6, IRON, x, top / 2, zb + (zf - zb) * k / n, { sx: bar * 2, sy: top, sz: bar * 2 });
  }
  // inside: the cot on its legs along the back, a pallet and a rolled blanket, the bucket, straw
  const cx = L.door < 0 ? 0.3 : -0.3, cz = zb + 0.32, cw = 1.2, cd = 0.5, ct = 0.3;
  part(G.box, C.wood, cx, ct, cz, { sx: cw, sy: 0.04, sz: cd });
  for (const a of [-1, 1]) for (const b of [-1, 1]) part(G.box, C.dark, cx + a * (cw / 2 - 0.05), (ct - 0.02) / 2, cz + b * (cd / 2 - 0.05), { sx: 0.05, sy: ct - 0.02, sz: 0.05 });
  part(G.box, CC(STRAW), cx, ct + 0.045, cz, { sx: cw - 0.08, sy: 0.05, sz: cd - 0.06 });
  seg(G.cyl8, CC('#6a5a4a'), [cx + cw / 2 - 0.2, ct + 0.12, cz - 0.18], [cx + cw / 2 - 0.2, ct + 0.12, cz + 0.18], 0.05);
  bucket(-cx * 1.9, 0, zb + 0.95, C, false);
  const r = mulberry32(L.straw | 0);
  for (let k = 0; k < 10; k++) part(G.box, shade(CC(STRAW), 0.75 + r() * 0.3), -0.8 + r() * 1.6, 0.006 + k * 0.0016, zb + 0.6 + r() * 0.9, { sx: 0.12 + r() * 0.12, sy: 0.005, sz: 0.012, ry: r() * Math.PI });
  if (L.chains) for (const x of [-cx - 0.2, -cx + 0.2]) {
    part(G.box, IRON, x, 1.3, zb + 0.02, { sx: 0.06, sy: 0.06, sz: 0.03 });
    for (let k = 0; k < 4; k++) part(G.box, IRON_LT, x, 1.24 - k * 0.07, zb + 0.05, { sx: 0.02, sy: 0.06, sz: k % 2 ? 0.02 : 0.035 });
    part(G.cyl12, IRON, x, 0.93, zb + 0.06, { sx: 0.1, sy: 0.03, sz: 0.1, rx: Math.PI / 2 });
  }
}
// the training dummy: a post on a cross of feet, a straw-stuffed sack for a body bound with rope, a sack head, maybe
// a crossbar for arms with straw bundles at its ends and a wooden shield strapped to one
function trainingDummy(L, C) {
  const S = CC(L.sack[0]), rope = CC(ROPE), lean = L.lean, ry = L.turn;
  for (const a of [0, Math.PI / 2]) part(G.box, C.dark, 0, 0.04, 0, { sx: 0.62, sy: 0.08, sz: 0.1, ry: a + ry });
  for (let k = 0; k < 4; k++) { const a = ry + k * Math.PI / 2 + Math.PI / 4; seg(G.box, C.dark, [Math.sin(a) * 0.04, 0.3, Math.cos(a) * 0.04], [Math.sin(a) * 0.24, 0.06, Math.cos(a) * 0.24], 0.02); }
  const top = [lean * 1.4, 1.62, 0];
  seg(G.box, C.dark, [0, 0.02, 0], top, 0.045);
  const at = y => [lean * y, y, 0];
  // the body
  const b0 = at(0.78), b1 = at(1.3);
  seg(G.cyl12, S, b0, b1, 0.19);
  seg(G.cyl12, shade(S, 0.9), at(0.72), at(0.78), 0.15);
  for (const y of [0.86, 1.06, 1.24]) seg(G.cyl12, rope, at(y - 0.015), at(y + 0.015), 0.2);
  // straw sticking out of the neck and the waist
  for (let k = 0; k < 6; k++) { const a = k * 1.05 + ry; seg(G.box, CC(STRAW), at(1.31), [lean * 1.33 + Math.sin(a) * 0.12, 1.36, Math.cos(a) * 0.12], 0.008); }
  // the head
  const hy = 1.46;
  part(G.oct, S, lean * hy, hy, 0, { sx: 0.24, sy: 0.26, sz: 0.24, ry: ry + 0.3 });
  seg(G.cyl8, rope, at(1.335), at(1.355), 0.06);
  if (L.arms) {
    const ay = 1.2, ax = 0.5;
    seg(G.cyl6, C.light, [lean * ay - ax, ay, 0.0], [lean * ay + ax, ay, 0.0], 0.03);
    for (const s of [-1, 1]) {
      seg(G.cyl8, CC(STRAW), [lean * ay + s * (ax - 0.16), ay, 0], [lean * ay + s * (ax + 0.04), ay, 0], 0.06);
      seg(G.cyl8, rope, [lean * ay + s * (ax - 0.1), ay, 0], [lean * ay + s * (ax - 0.08), ay, 0], 0.066);
    }
    if (L.shield) plate(heater(0.16, 0.2, -0.22), 0, 0, 0.08, 0.12, C.light, lean * ay - ax + 0.12, ay - 0.08, C.dark);
  }
}
// the archery butt: a round straw boss on an easel of two front legs and a back prop, leaning back, its painted face
// to +z in rings (or a bull's-eye, or bare straw), arrows stuck in it
function archeryButt(L, C) {
  const tilt = 0.22, ax = [0, Math.sin(tilt), Math.cos(tilt)], cy = 0.86, cz = 0.0, R = 0.42, th = 0.18;
  const P = (u, v, w) => [u, cy + v * Math.cos(tilt) + w * ax[1], cz - v * Math.sin(tilt) + w * ax[2]];   // (u across, v up the face, w out of it)
  for (const s of [-1, 1]) seg(G.box, C.dark, [s * 0.42, 0, 0.14], [s * 0.3, 1.32, -0.12], 0.028);
  seg(G.box, C.dark, [0, 0, -0.55], [0, 1.2, -0.16], 0.026);
  part(G.box, C.wood, 0, cy - R - 0.02, 0.0, { sx: 0.84, sy: 0.05, sz: 0.1 });
  // the boss: straw bound in coils, its rim rope
  part(G.cyl12, CC(STRAW), ...P(0, 0, 0), { sx: R * 2, sy: th, sz: R * 2, rx: Math.PI / 2 - tilt });
  for (const w of [-th / 2 + 0.03, th / 2 - 0.03]) part(G.cyl12, CC(ROPE), ...P(0, 0, w), { sx: R * 2 + 0.03, sy: 0.02, sz: R * 2 + 0.03, rx: Math.PI / 2 - tilt });
  const face = L.face[0], f0 = th / 2;
  const disc = (rr, k, col) => part(G.cyl12, col, ...P(0, 0, f0 + 0.003 + k * 0.0045), { sx: rr * 2, sy: 0.004, sz: rr * 2, rx: Math.PI / 2 - tilt });
  if (face === 'rings') [[0.38, '#e8e2d2'], [0.3, '#2a2624'], [0.22, '#2f4f8a'], [0.14, '#a03a2a'], [0.07, '#d8b04a']].forEach(([rr, col], k) => disc(rr, k, CC(col)));
  else if (face === 'bull') { disc(0.38, 0, CC('#e8e2d2')); disc(0.12, 1, CC('#2a2624')); }
  // the arrows: shafts out of the face toward the archers, fletched at their ends
  const fl = CC(L.fletch[0]), fw = face === 'straw' ? 0 : face === 'rings' ? 5 : 2;
  for (const a of L.arrows) {
    const p0 = P(a.x, a.y, f0 + fw * 0.0045 - 0.04), d = [ax[0] + a.tx, ax[1] + a.ty, ax[2]], n = Math.hypot(...d), len = 0.5;
    const p1 = [p0[0] + d[0] / n * len, p0[1] + d[1] / n * len, p0[2] + d[2] / n * len];
    seg(G.cyl6, CC('#c8a878'), p0, p1, 0.008);
    const back = t => [p1[0] - d[0] / n * t, p1[1] - d[1] / n * t, p1[2] - d[2] / n * t];
    seg(G.box, fl, back(0.11), back(0.012), 0.022);
  }
}
// the brazier: an iron bowl on three legs, coals in it and a fire over them (in the glow buffer), maybe a few
// logs laid by
function brazier(L, C) {
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI * 2 / 3 + 0.3;
    seg(G.cyl6, IRON, [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], [Math.cos(a) * 0.18, 0.66, Math.sin(a) * 0.18], 0.022);
    part(G.box, IRON, Math.cos(a) * 0.31, 0.015, Math.sin(a) * 0.31, { sx: 0.07, sy: 0.03, sz: 0.07, ry: -a });
  }
  part(G.cyl12, IRON, 0, 0.64, 0, { sx: 0.4, sy: 0.05, sz: 0.4 });
  ring(0.23, 0.71, 12, 0.03, 0.1, IRON);
  ring(0.29, 0.82, 14, 0.03, 0.12, IRON_LT);
  ring(0.31, 0.89, 14, 0.05, 0.025, IRON);
  // the coals and the fire
  const r = mulberry32(7);
  for (let k = 0; k < 9; k++) { const a = k * 0.7, d = 0.06 + (k % 3) * 0.07; part(G.oct, k % 3 ? '#3a2a24' : '#2a2020', Math.cos(a) * d, 0.72 + r() * 0.04, Math.sin(a) * d, { sx: 0.11, sy: 0.07, sz: 0.11, ry: r() * 3 }); }
  for (let k = 0; k < 6; k++) { const a = k * 1.1 + 0.4, d = 0.1 + (k % 2) * 0.06; part(G.oct, '#ff7a30', Math.cos(a) * d, 0.78, Math.sin(a) * d, { sx: 0.08, sy: 0.04, sz: 0.08, into: 'glow' }); }
  for (const [x, z, h, w] of [[0, 0, 0.42, 0.22], [0.1, 0.06, 0.3, 0.14], [-0.1, -0.05, 0.32, 0.15], [0.04, -0.12, 0.24, 0.12], [-0.07, 0.11, 0.26, 0.12]]) {
    part(G.oct, FLAME, x, 0.8 + h / 2, z, { sx: w, sy: h, sz: w, into: 'glow' });
    part(G.oct, FLAME_HOT, x, 0.79 + h * 0.35, z, { sx: w * 0.5, sy: h * 0.5, sz: w * 0.5, into: 'glow' });
  }
  // (two side by side and one on them, toward a corner of the tile clear of the legs)
  if (L.logs) for (const [k, rr, y] of [[0, 0.4, 0.05], [1, 0.505, 0.05], [2, 0.4525, 0.137]]) {
    const a = [Math.PI / 4, Math.PI * 1.25, Math.PI * 1.75][Math.floor(L.at / (Math.PI * 2) * 3) % 3], x = Math.cos(a) * rr, z = Math.sin(a) * rr, h = 0.17 - k * 0.012;
    seg(G.cyl6, shade(C.light, 0.85 + k * 0.08), [x - Math.sin(a) * h, y, z + Math.cos(a) * h], [x + Math.sin(a) * h, y, z - Math.cos(a) * h], 0.05);
  }
}

// ---------- the outdoor set (2026-11-03, Jordan) ----------
const ROPE = '#c4ad7c', WATER = '#2e4a64';
const WELL_ROOFS = [['shingle', 'Oak shingles', '#6e5034', 3], ['slate', 'Slate', '#4e5664', 2], ['thatch', 'Thatch', '#a88c50', 2], ['tile', 'Red clay tiles', '#9a4a36', 2]];
const FIELDSTONE = [['#8a8494', 'Grey fieldstone'], ['#a08e74', 'Sandstone'], ['#7c7a72', 'Granite'], ['#9a9284', 'Limestone']];
const AWNING = [['#e8e0cc', 'White'], ['#d8ccb0', 'Undyed'], ['#c8a048', 'Gold'], ['#2a2624', 'Black']];
const STALL_GOODS = [['apples', 'Apples', '#b83a2a', 2], ['cabbages', 'Cabbages', '#7aa04a', 2], ['bread', 'Bread', '#b07a3a', 2], ['cloth', 'Bolts of cloth', '#6a4a8a', 1],
  ['pots', 'Pots and jugs', '#a86a3a', 1], ['fish', 'Fish', '#9aa8b0', 1], ['herbs', 'Herbs', '#4a7a3a', 1], ['turnips', 'Turnips', '#d8c8d0', 1], ['pears', 'Pears', '#b8b040', 1]];
const PAPERS = ['#e8e0c8', '#ddd2b0', '#f0ead8', '#d8c8a0', '#e0d4bc'];
const WASH = [['sheet', 0.5, 0.55, 2], ['shirt', 0.34, 0.32, 3], ['apron', 0.26, 0.36, 2], ['stockings', 0.14, 0.3, 2], ['cloth', 0.24, 0.22, 2]];
const SHEETS = [['#e8e2d2', 'Linen'], ['#d8ccb0', 'Undyed'], ['#c8d0d8', 'Blued linen']];
const BANNER_MARKS = [['#e8d8a0', 'Pale gold'], ['#e8e2d2', 'White'], ['#c8a048', 'Gold'], ['#2a2624', 'Black'], ['#8a2f2f', 'Red']];
const BIRDS = [['#7a5a3a', 'A sparrow'], ['#5a6a7a', 'A blue tit'], ['#3a3430', 'A blackbird'], ['#8a5a3a', 'A robin']];
// a steady jitter for a prop's own pieces (the same every build of one look)
const jit = (k, s = 0) => { const x = Math.sin((k + 1) * 12.9898 + s * 0.0123) * 43758.5453; return x - Math.floor(x); };
// a slab W across (x) laid from (z0, y0) to (z1, y1), t thick, its middle at x
function slab(color, x, W, z0, y0, z1, y1, t) {
  part(G.box, color, x, (y0 + y1) / 2, (z0 + z1) / 2, { sx: W, sy: t, sz: Math.hypot(z1 - z0, y1 - y0), rx: -Math.atan2(y1 - y0, z1 - z0) });
}
// a roof slope from its ridge (zr, yr) down to its eave (ze, ye), W across, on a dark underlay: n courses of pieces
// (shingles, slates, tiles; one piece the width for thatch), each course a little steeper than the slope so its foot
// stands proud of the next one's head (never in one plane), every other course turned half a piece
function roofSlope(W, zr, yr, ze, ye, n, color, t, { pieces = 0, s = 0, vary = 0.14 } = {}) {
  const dz = ze - zr, dy = ye - yr, L = Math.hypot(dz, dy);
  let nz = -dy / L, ny = dz / L;
  if (ny < 0) { nz = -nz; ny = -ny; }   // (the slope's outward normal, upward)
  slab(shade(color, 0.5), 0, W - 0.03, zr - nz * 0.01, yr - ny * 0.01, ze - nz * 0.01, ye - ny * 0.01, 0.01);
  const pw = W / Math.max(1, pieces);
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, (k - 0.35) / n), b = (k + 1) / n, lift = t * 0.9, o = t / 2;
    const z0 = zr + dz * a + nz * o, y0 = yr + dy * a + ny * o, z1 = zr + dz * b + nz * (o + lift), y1 = yr + dy * b + ny * (o + lift);
    const xs = [], e = W / 2 - (k % 2) * 0.007;   // (every other course a shade narrower: their ends never share a plane)
    if (!pieces) xs.push([-e, e]);
    else if (k % 2) { xs.push([-e, -W / 2 + pw / 2]); for (let j = 0; j < pieces - 1; j++) xs.push([-W / 2 + pw / 2 + j * pw, -W / 2 + pw / 2 + (j + 1) * pw]); xs.push([W / 2 - pw / 2, e]); }
    else for (let j = 0; j < pieces; j++) xs.push([-W / 2 + j * pw, -W / 2 + (j + 1) * pw]);
    xs.forEach(([x0, x1], j) => slab(shade(color, 1 - vary / 2 + jit(k * 31 + j, s) * vary), (x0 + x1) / 2, x1 - x0 - (pieces ? 0.012 : 0), z0, y0, z1, y1, t));
  }
}
// a round wall of stones in courses, each course turned half a stone on the last: R its outer radius, th thick
function stoneRing(R, th, y0, H, courses, n, stone, s = 0) {
  const ch = H / courses, rm = R - th / 2;
  for (let c = 0; c < courses; c++) for (let k = 0; k < n; k++) {
    const a = (k + (c % 2) * 0.5) / n * Math.PI * 2, w = 2 * Math.PI * rm / n - 0.02;
    part(G.box, shade(stone, 0.82 + jit(c * n + k, s) * 0.3), Math.sin(a) * rm, y0 + (c + 0.5) * ch, Math.cos(a) * rm, { sx: w, sy: ch - 0.016, sz: th - jit(c * n + k + 50, s) * 0.025, ry: a });
  }
}
// a ring of n boxes round the y axis at radius rr (a rim, a coping): each w deep, h tall, its middle at y
function ring(rr, y, n, w, h, color, s = -1) {
  for (let k = 0; k < n; k++) {
    const a = (k + 0.5) / n * Math.PI * 2;
    part(G.box, s < 0 ? color : shade(color, 0.9 + jit(k, s) * 0.2), Math.sin(a) * rr, y, Math.cos(a) * rr, { sx: 2 * Math.PI * rr / n + 0.004, sy: h, sz: w, ry: a });
  }
}
// a wooden bucket standing at (x, y, z), its bail up
function bucket(x, y, z, C, full) {
  barrel([x, y, z], [x, y + 0.13, z], 0.062, 0.07, shade(C.light, 1.05), { hoops: [0.22, 0.8], n: 2, head: false });
  if (full) part(G.cyl8, WATER, x, y + 0.134, z, { sx: 0.1, sy: 0.004, sz: 0.1 });
  seg(G.box, IRON, [x - 0.064, y + 0.12, z], [x, y + 0.19, z], 0.005);
  seg(G.box, IRON, [x, y + 0.19, z], [x + 0.064, y + 0.12, z], 0.005);
}
// the well (Jordan: plain beside the fountain): a round wall of fieldstone in three courses on a ring of flagstones, a
// coping, dark water down the shaft, two posts with knee braces carrying a gabled roof (shingles, slate, thatch or
// tiles), a windlass between them with its rope coiled on and a crank, a bucket hung over the water, maybe one on the rim
function well(L, C) {
  const st = CC(L.stone[0]), R = 0.4, th = 0.13, H = 0.5, s = L.seed || 0, rf = CC(L.roof[2]), kind = L.roof[0];
  for (let k = 0; k < 10; k++) { const a = (k + 0.3) / 10 * Math.PI * 2; part(G.box, shade(st, 0.66 + jit(k, s + 3) * 0.16), Math.sin(a) * 0.46, 0.015, Math.cos(a) * 0.46, { sx: 0.27, sy: 0.03, sz: 0.15, ry: a }); }
  stoneRing(R, th, 0.02, H - 0.02, 3, 11, st, s);
  ring(R - th - 0.012, 0.3 + (H - 0.3) / 2, 14, 0.005, H - 0.3, shade(st, 0.36));   // (the shaft, dark behind the stones)
  part(G.cyl12, WATER, 0, 0.3, 0, { sx: (R - th - 0.02) * 2, sy: 0.01, sz: (R - th - 0.02) * 2 });
  ring(R - th / 2 - 0.005, H + 0.03, 12, th + 0.05, 0.06, shade(st, 1.12), s + 9);   // (the coping)
  // the posts on stone pads, tie beams across their tops, knee braces, rafters to a ridge beam
  const px = 0.47, top = 1.44, ridge = 1.86;
  for (const sx of [-1, 1]) {
    const x = sx * px;
    part(G.box, shade(st, 0.8), x, 0.03, 0, { sx: 0.15, sy: 0.06, sz: 0.15 });
    part(G.box, C.dark, x, top / 2, 0, { sx: 0.09, sy: top, sz: 0.09 });
    part(G.box, C.dark, x, top - 0.03, 0, { sx: 0.08, sy: 0.08, sz: 1.16 });
    for (const sz of [-1, 1]) {
      seg(G.box, C.wood, [x, top - 0.32, 0], [x, top - 0.05, sz * 0.27], 0.02);
      seg(G.box, C.wood, [x, top + 0.01, sz * 0.56], [x, ridge, 0], 0.03);
    }
  }
  part(G.box, C.dark, 0, ridge, 0, { sx: 1.2, sy: 0.07, sz: 0.07 });
  // the roof
  const yr = 1.9, ze = 0.62, ye = 1.4, W = 1.26;
  const spec = { shingle: [6, 0.03, { pieces: 8, s }], slate: [7, 0.022, { pieces: 9, s, vary: 0.22 }], tile: [6, 0.04, { pieces: 7, s, vary: 0.18 }], thatch: [3, 0.07, { s, vary: 0.1 }] }[kind] || [6, 0.03, { pieces: 8, s }];
  for (const sz of [-1, 1]) roofSlope(W, 0, yr, sz * ze, ye, spec[0], rf, spec[1], spec[2]);
  if (kind === 'thatch') seg(G.cyl8, shade(rf, 0.8), [-W / 2 - 0.02, yr + 0.04, 0], [W / 2 + 0.02, yr + 0.04, 0], 0.085);
  else if (kind === 'tile') seg(G.cyl8, shade(rf, 0.9), [-W / 2 - 0.02, yr + 0.04, 0], [W / 2 + 0.02, yr + 0.04, 0], 0.05);
  else part(G.box, shade(rf, 0.8), 0, yr + 0.045, 0, { sx: W + 0.04, sy: 0.05, sz: 0.14 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) seg(G.box, C.dark, [sx * (W / 2 + 0.03), yr + 0.03, 0], [sx * (W / 2 + 0.03), ye - 0.02, sz * (ze + 0.02)], 0.02);
  // the windlass: a drum between the posts, the rope wound on it, the axle's ends and the crank
  const wy = 0.98;
  seg(G.cyl12, C.light, [-0.42, wy, 0], [0.42, wy, 0], 0.06);
  seg(G.cyl12, ROPE, [-0.17, wy, 0], [0.17, wy, 0], 0.072);
  for (const x of [-0.12, -0.04, 0.04, 0.12]) seg(G.cyl12, shade(CC(ROPE), 0.75), [x - 0.006, wy, 0], [x + 0.006, wy, 0], 0.077);
  for (const sx of [-1, 1]) seg(G.cyl6, IRON, [sx * 0.42, wy, 0], [sx * 0.56, wy, 0], 0.025);
  const cx = L.crank * 0.56;
  seg(G.box, IRON, [cx, wy, 0], [cx, wy - 0.18, 0.06], 0.016);
  seg(G.cyl6, C.dark, [cx, wy - 0.18, 0.06], [cx + L.crank * 0.11, wy - 0.18, 0.06], 0.018);
  // the bucket hung over the water by its rope, another on the rim
  seg(G.cyl6, ROPE, [0.06, wy - 0.06, 0.05], [0.06, 0.79, 0.05], 0.008);
  bucket(0.06, 0.6, 0.05, C, false);
  if (L.bucket) { const a = 2.3; bucket(Math.sin(a) * 0.35, H + 0.06, Math.cos(a) * 0.35, C, true); }
}
// a bench for the street: three seat slats, two back slats leaning back, ends of wood, stone or iron, a middle leg
function streetBench(L, C) {
  const y = SEAT, W = 1.74, kind = L.ends[0], st = CC(L.stone[0]), iron = kind === 'iron';
  for (let k = 0; k < 3; k++) part(G.box, k % 2 ? C.light : C.wood, 0, y - 0.02, -0.12 + k * 0.125, { sx: W, sy: 0.04, sz: 0.11 });
  for (const yy of [y + 0.15, y + 0.3]) part(G.box, C.wood, 0, yy, -0.188 - (yy - y) * 0.18, { sx: W, sy: 0.1, sz: 0.035, rx: -0.18 });
  const leg = iron ? IRON : C.dark;
  for (const x of [-0.72, 0, 0.72]) {
    const end = x !== 0;
    seg(G.box, leg, [x, 0, -0.16], [x, end ? y + 0.4 : y + 0.36, -0.27], end ? 0.03 : 0.025);   // (the back leg, up the back)
    part(G.box, leg, x, y - 0.065, 0, { sx: 0.06, sy: 0.05, sz: 0.44 });
    if (!end) { part(G.box, leg, x, (y - 0.09) / 2, 0.12, { sx: 0.05, sy: y - 0.09, sz: 0.05 }); continue; }
    if (kind === 'stone') part(G.box, shade(st, 0.95 + x * 0.05), x, (y - 0.09) / 2, 0.03, { sx: 0.17, sy: y - 0.09, sz: 0.42 });
    else part(G.box, leg, x, (y - 0.09) / 2, 0.15, { sx: 0.07, sy: y - 0.09, sz: 0.07 });
    // the arm: a rest over the end on a post from the front
    part(G.box, leg, x, y + 0.08, 0.15, { sx: 0.045, sy: 0.16, sz: 0.045 });
    part(G.box, iron ? IRON : C.light, x, y + 0.18, -0.03, { sx: 0.07, sy: 0.035, sz: 0.42 });
    if (iron) { part(G.oct, IRON, x, 0.02, 0.17, { sx: 0.06, sy: 0.04, sz: 0.08 }); part(G.oct, IRON, x, y + 0.18, 0.2, { sx: 0.05, sy: 0.06, sz: 0.06 }); }
  }
}
// goods heaped in a basket's mouth at (x, y, z), d across
function heap(x, y, z, d, kind, color, r) {
  const c = CC(color), h = d / 2;
  if (kind === 'cabbages') {
    for (const [a, b, yy] of [[-0.3, -0.25, 0], [0.32, -0.15, 0], [-0.05, 0.3, 0], [0, 0, 0.06]]) {
      part(G.oct, shade(c, 0.85 + r() * 0.25), x + a * h, y + 0.05 + yy, z + b * h, { sx: 0.13, sy: 0.11, sz: 0.13, ry: r() * 3 });
      part(G.oct, shade(c, 1.25), x + a * h, y + 0.07 + yy, z + b * h, { sx: 0.08, sy: 0.08, sz: 0.08, ry: r() * 3 });
    }
  } else if (kind === 'bread') {
    for (let k = 0; k < 3; k++) seg(G.cyl8, shade(c, 0.9 + r() * 0.2), [x - 0.08, y + 0.04, z + (k - 1) * h * 0.55], [x + 0.08, y + 0.04 + (k === 1 ? 0.03 : 0), z + (k - 1) * h * 0.55], 0.042);
    part(G.oct, shade(c, 1.1), x + 0.02, y + 0.09, z, { sx: 0.12, sy: 0.07, sz: 0.12 });
  } else if (kind === 'fish') {
    for (let k = 0; k < 4; k++) {
      const zz = z + (k - 1.5) * h * 0.42, xx = x + (k % 2 ? 0.02 : -0.02);
      part(G.oct, shade(c, 0.9 + r() * 0.2), xx, y + 0.025 + (k % 2) * 0.012, zz, { sx: 0.2, sy: 0.04, sz: 0.06 });
      part(G.box, shade(c, 0.75), xx + 0.11, y + 0.025 + (k % 2) * 0.012, zz, { sx: 0.04, sy: 0.012, sz: 0.06 });
    }
  } else if (kind === 'herbs') {
    for (let k = 0; k < 4; k++) {
      const zz = z + (k - 1.5) * h * 0.4;
      seg(G.cyl6, shade(c, 0.85 + r() * 0.3), [x - 0.1, y + 0.03 + (k % 2) * 0.02, zz], [x + 0.08, y + 0.03 + (k % 2) * 0.02, zz + 0.02], 0.03);
      part(G.box, ROPE, x + 0.04, y + 0.03 + (k % 2) * 0.02, zz + 0.01, { sx: 0.015, sy: 0.065, sz: 0.065 });
    }
  } else {
    // round fruit and roots: a ring and one or two on top
    const big = kind === 'turnips' ? 0.085 : 0.072, tall = kind === 'pears' ? 1.3 : 1;
    const spots = [[0, 0, 1], [0.55, 0, 0], [-0.55, 0, 0], [0, 0.55, 0], [0, -0.55, 0], [0.4, 0.4, 0], [-0.4, -0.4, 0], [0.25, -0.1, 2], [-0.2, 0.15, 2]];
    for (const [a, b, lay] of spots) {
      const yy = y + big * 0.5 + (lay === 1 ? 0.02 : lay === 2 ? big * 0.8 : 0);
      part(G.oct, shade(c, 0.85 + r() * 0.3), x + a * h, yy, z + b * h, { sx: big, sy: big * tall, sz: big, ry: r() * 3 });
      if (kind === 'turnips') part(G.oct, '#7a3a6a', x + a * h, yy + big * 0.3, z + b * h, { sx: big * 0.7, sy: big * 0.35, sz: big * 0.7 });
    }
  }
}
// a shallow basket at (x, y, z) d across, heaped
function basket(x, y, z, d, kind, color, r) {
  part(G.cyl12, '#8a6a3a', x, y + 0.05, z, { sx: d, sy: 0.1, sz: d });
  part(G.cyl12, '#6a4a2a', x, y + 0.1, z, { sx: d + 0.025, sy: 0.025, sz: d + 0.025 });
  heap(x, y + 0.1125, z, d - 0.06, kind, color, r);
}
// an open slatted crate w x h x d standing at (x, y, z), filled to the top with the goods
function slatCrate(x, y, z, w, h, d, C, kind, color, r) {
  part(G.box, C.dark, x, y + 0.015, z, { sx: w - 0.02, sy: 0.03, sz: d - 0.02 });
  for (const yy of [0.25, 0.72]) {
    for (const s of [-1, 1]) {
      part(G.box, shade(C.light, 0.95), x, y + h * yy, z + s * (d / 2 - 0.01), { sx: w - 0.02, sy: h * 0.38, sz: 0.02 });
      part(G.box, shade(C.light, 0.88), x + s * (w / 2 - 0.01), y + h * yy, z, { sx: 0.02, sy: h * 0.38, sz: d - 0.06 });
    }
  }
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) part(G.box, C.dark, x + sa * (w / 2 - 0.015), y + h / 2, z + sb * (d / 2 - 0.015), { sx: 0.05, sy: h, sz: 0.05 });
  part(G.box, shade(C.dark, 0.7), x, y + h - 0.05, z, { sx: w - 0.06, sy: 0.02, sz: d - 0.06 });
  if (kind) heap(x, y + h - 0.04, z, Math.min(w, d) - 0.06, kind, color, r);
}
// the market stall: a counter boarded at the front, four posts (taller at the back), a striped awning sloping out over
// the front with pennant flaps along its edge, the wares on the counter, a crate and a sack stowed behind
function marketStall(L, C) {
  const W = 1.86, A = CC(L.a[0]), B = CC(L.b[0]), r = mulberry32(L.seed || 1), kind = L.goods[0], gc = L.goods[2];
  part(G.box, C.wood, 0, 0.27, 0.38, { sx: W - 0.04, sy: 0.42, sz: 0.04 });
  const nb = 9;
  for (let k = 0; k < nb; k++) part(G.box, shade(C.light, 0.84 + 0.18 * jit(k, 5)), -W / 2 + 0.04 + (k + 0.5) * (W - 0.08) / nb, 0.27, 0.406, { sx: (W - 0.08) / nb - 0.012, sy: 0.38, sz: 0.012 });
  for (const s of [-1, 1]) part(G.box, C.dark, s * (W / 2 - 0.02), 0.27, 0.175, { sx: 0.04, sy: 0.42, sz: 0.43 });
  part(G.box, C.dark, 0, 0.04, 0.18, { sx: W - 0.1, sy: 0.08, sz: 0.42 });
  part(G.box, C.light, 0, 0.5, 0.17, { sx: W + 0.04, sy: 0.04, sz: 0.5 });
  // posts and the awning's frame
  for (const s of [-1, 1]) {
    part(G.box, C.dark, s * 0.9, 0.69, 0.45, { sx: 0.07, sy: 1.38, sz: 0.07 });
    part(G.box, C.dark, s * 0.9, 0.8, -0.44, { sx: 0.07, sy: 1.6, sz: 0.07 });
    part(G.box, C.dark, s * 0.9, 1.0, 0.0, { sx: 0.04, sy: 0.04, sz: 0.86 });
  }
  part(G.box, C.dark, 0, 1.36, 0.45, { sx: W + 0.06, sy: 0.05, sz: 0.05 });
  part(G.box, C.dark, 0, 1.585, -0.44, { sx: W + 0.06, sy: 0.05, sz: 0.05 });
  // the awning: stripes from the back down over the front, flaps hanging off its edge
  const n = 8, sw = (W + 0.1) / n, zb = -0.52, yb = 1.635, zf = 0.66, yf = 1.39;
  for (let k = 0; k < n; k++) {
    const x = -(W + 0.1) / 2 + (k + 0.5) * sw, c = k % 2 ? B : A;
    slab(c, x, sw, zb, yb, zf, yf, 0.018);
    plate([[-sw / 2, 0], [0, -0.14], [sw / 2, 0]], 0, -0.04, zf - 0.005, zf + 0.007, c, x, yf - 0.005);
  }
  // the wares
  if (kind === 'cloth') {
    for (let k = 0; k < 5; k++) { const d = DYES[Math.floor(r() * DYES.length)][0]; seg(G.cyl12, d, [-0.75 + k * 0.36, 0.57, 0.02], [-0.75 + k * 0.36, 0.57, 0.36], 0.05); }
    for (let k = 0; k < 2; k++) seg(G.cyl12, DYES[Math.floor(r() * DYES.length)][0], [-0.56 + k * 0.72, 0.66, 0.03], [-0.56 + k * 0.72, 0.66, 0.33], 0.045);
  } else if (kind === 'pots') {
    for (let k = 0; k < 6; k++) {
      const g = CC(GLAZES[Math.floor(r() * GLAZES.length)][0]), hh = 0.1 + r() * 0.08, x = -0.72 + k * 0.29, z = 0.12 + (k % 2) * 0.14;
      part(G.cyl8, g, x, 0.52 + hh / 2, z, { sx: 0.13, sy: hh, sz: 0.13 });
      part(G.cyl8, shade(g, 0.8), x, 0.52 + hh + 0.015, z, { sx: 0.08, sy: 0.03, sz: 0.08 });
    }
  } else for (const x of [-0.58, 0, 0.58]) basket(x, 0.52, 0.18, 0.42, kind, gc, r);
  if (L.crate) slatCrate(-0.45, 0, -0.22, 0.42, 0.3, 0.36, C, kind === 'cloth' || kind === 'pots' ? 'apples' : kind, kind === 'cloth' || kind === 'pots' ? '#b83a2a' : gc, r);
  if (L.sack) { part(G.box, '#b8a47a', 0.45, 0.16, -0.24, { sx: 0.3, sy: 0.32, sz: 0.26, ry: 0.3 }); part(G.box, '#a8946a', 0.45, 0.35, -0.24, { sx: 0.14, sy: 0.07, sz: 0.12, ry: 0.3 }); }
}
// crates of produce, one on another, and a basket beside
function produce(L, C) {
  const r = mulberry32(L.seed || 1);
  slatCrate(-0.1, 0, -0.08, 0.5, 0.3, 0.42, C, L.two ? null : L.low[0], L.low[2], r);
  if (L.two) slatCrate(-0.08 + L.turn * 0.2, 0.3, -0.06, 0.46, 0.26, 0.38, C, L.high[0], L.high[2], r);
  if (L.basket) basket(0.28, 0, 0.27, 0.28, L.low[0], L.low[2], r);
}
// the notice board: a board in a frame on two posts, a little roof over it, notices pinned on in layers
function noticeBoard(L, C) {
  for (const s of [-1, 1]) part(G.box, C.dark, s * 0.4, L.roof ? 0.78 : 0.7, -0.06, { sx: 0.07, sy: L.roof ? 1.56 : 1.4, sz: 0.07 });
  part(G.box, C.wood, 0, 1.04, 0, { sx: 0.86, sy: 0.62, sz: 0.05 });
  for (const s of [-1, 1]) {
    part(G.box, C.dark, 0, 1.04 + s * 0.33, 0.04, { sx: 0.92, sy: 0.05, sz: 0.05 });
    part(G.box, C.dark, s * 0.435, 1.04, 0.04, { sx: 0.05, sy: 0.71, sz: 0.05 });
  }
  if (L.roof) for (const s of [-1, 1]) slab(C.dark, 0, 1.06, -0.03, 1.6, -0.03 + s * 0.27, 1.47, 0.03);
  L.papers.forEach((p, k) => {
    const w = p.w, h = p.h, px = -0.38 + w / 2 + p.x * (0.76 - w), py = 0.76 + h / 2 + p.y * (0.56 - h), z = 0.027 + k * 0.005, cs = Math.cos(p.rz), sn = Math.sin(p.rz);
    part(G.box, p.tint, px, py, z + 0.001, { sx: w, sy: h, sz: 0.002, rz: p.rz });
    for (let j = 0; j < p.lines; j++) {
      const lx = (j === 0 ? 0 : -0.01) * w, ly = h * (0.3 - j * 0.16), lw = w * (j === 0 ? 0.5 : 0.75);
      part(G.box, '#5a5248', px + cs * lx - sn * ly, py + sn * lx + cs * ly, z + 0.003, { sx: lw, sy: 0.012, sz: 0.002, rz: p.rz });
    }
    if (p.pin) part(G.oct, '#9a2a24', px - sn * h * 0.42, py + cs * h * 0.42, z + 0.007, { sx: 0.02, sy: 0.02, sz: 0.012 });
  });
}
// the signpost: a post with a cap, stones round its foot, two or three pointing arms with dark lettering
function signpost(L, C) {
  part(G.box, C.dark, 0, 0.875, 0, { sx: 0.08, sy: 1.75, sz: 0.08 });
  part(G.cone4, C.dark, 0, 1.8, 0, { sx: 0.12, sy: 0.1, sz: 0.12, ry: Math.PI / 4 });
  for (let k = 0; k < 4; k++) { const a = k * 1.7 + 0.3; part(G.oct, shade(CC(STONE), 0.8 + jit(k, 7) * 0.3), Math.cos(a) * 0.1, 0.03, Math.sin(a) * 0.1, { sx: 0.12, sy: 0.07, sz: 0.1, ry: a }); }
  L.arms.forEach((arm, k) => {
    const y = 1.58 - k * 0.2, ry = arm.a, cs = Math.cos(ry), sn = Math.sin(ry), at = (lx, lz) => [cs * lx + sn * lz, -sn * lx + cs * lz];
    const [bx, bz] = at(0.31, 0), [tx, tz] = at(0.56, 0), B = shade(C.light, 0.95 + k * 0.05);
    part(G.box, B, bx, y, bz, { sx: 0.5, sy: 0.12, sz: 0.03, ry });
    part(G.box, B, tx, y, tz, { sx: 0.085, sy: 0.085, sz: 0.03, rz: Math.PI / 4, ry });
    for (const side of [-1, 1]) {
      let u = 0.12;
      for (let j = 0; j < arm.words && u < 0.52; j++) {
        const w = 0.05 + jit(k * 9 + j, 3) * 0.05, [lx, lz] = at(u + w / 2, side * 0.019);
        part(G.box, '#2a2420', lx, y, lz, { sx: w, sy: 0.035, sz: 0.004, ry });
        u += w + 0.03;
      }
    }
  });
}
// a horse trough: planks on two trestles banded in iron, or hewn stone; water in it, maybe a pump at one end
function horseTrough(L, C) {
  const W = 1.7, D = 0.46;
  if (L.stone) {
    const st = CC(L.rock[0]);
    part(G.box, shade(st, 0.85), 0, 0.05, 0, { sx: W, sy: 0.1, sz: D });
    for (const s of [-1, 1]) {
      part(G.box, shade(st, 0.95 + s * 0.04), 0, 0.27, s * (D / 2 - 0.045), { sx: W, sy: 0.34, sz: 0.09 });
      part(G.box, shade(st, 1.0 - s * 0.03), s * (W / 2 - 0.045), 0.27, 0, { sx: 0.09, sy: 0.34, sz: D - 0.18 });
    }
    if (!L.live) part(G.box, WATER, 0, 0.35, 0, { sx: W - 0.18, sy: 0.01, sz: D - 0.18 });   // (L.live: the game's fountain water shader, buildFountains)
  } else {
    for (const x of [-0.6, 0.6]) {
      for (const s of [-1, 1]) seg(G.box, C.dark, [x, 0, s * 0.22], [x, 0.18, s * 0.13], 0.03);
      part(G.box, C.dark, x, 0.17, 0, { sx: 0.06, sy: 0.06, sz: 0.44 });
    }
    part(G.box, C.wood, 0, 0.22, 0, { sx: W, sy: 0.04, sz: D });
    for (const s of [-1, 1]) {
      for (const y of [0.285, 0.375]) part(G.box, y > 0.3 ? C.light : C.wood, 0, y, s * (D / 2 - 0.0175), { sx: W, sy: 0.09, sz: 0.035 });
      part(G.box, C.dark, s * (W / 2 - 0.015), 0.33, 0, { sx: 0.05, sy: 0.22, sz: D - 0.07 });
      part(G.box, IRON, s * 0.42, 0.33, 0, { sx: 0.03, sy: 0.24, sz: D + 0.02 });
    }
    if (!L.live) part(G.box, WATER, 0, 0.37, 0, { sx: W - 0.1, sy: 0.01, sz: D - 0.08 });
  }
  if (L.pump) {
    const x = W / 2 + 0.08, z = -0.12;
    part(G.box, C.dark, x, 0.45, z, { sx: 0.12, sy: 0.9, sz: 0.12 });
    part(G.box, C.dark, x, 0.93, z, { sx: 0.16, sy: 0.06, sz: 0.16 });
    part(G.box, IRON, x - 0.12, 0.66, z, { sx: 0.16, sy: 0.05, sz: 0.05 });
    part(G.box, IRON, x - 0.19, 0.62, z, { sx: 0.03, sy: 0.06, sz: 0.04 });
    seg(G.box, IRON, [x, 0.88, z], [x, 1.02, z + 0.24], 0.012);
  }
}
// hay bales: one, two side by side, or two with one across them, each tied with two bands of twine
function hayBale(x, y, z, ry, fresh) {
  const c = CC(fresh ? '#cfb064' : '#b4a074'), cs = Math.cos(ry), sn = Math.sin(ry);
  part(G.box, c, x, y, z, { sx: 0.6, sy: 0.32, sz: 0.36, ry });
  for (const lx of [-0.16, 0.16]) part(G.box, '#7a5a2a', x + cs * lx, y, z - sn * lx, { sx: 0.03, sy: 0.33, sz: 0.37, ry });
  for (const lx of [-0.3, 0.3]) part(G.box, shade(c, 1.12), x + cs * lx * 1.005, y, z - sn * lx * 1.005, { sx: 0.006, sy: 0.3, sz: 0.34, ry });
}
function hayBales(L) {
  const t = L.turn;
  if (L.n === 1) hayBale(0, 0.16, 0, t, L.fresh);
  else {
    hayBale(0, 0.16, -0.19, t * 0.3, L.fresh); hayBale(0, 0.16, 0.19, -t * 0.3, L.fresh);
    if (L.n === 3) hayBale(0, 0.48, 0, Math.PI / 2 + t, L.fresh);
  }
}
// a rain barrel against the wall on a low stand: open, full nearly to the brim, a chute down from the eaves into it
function rainBarrel(L, C) {
  const zb = backZ(1), zc = zb + 0.27, top = 0.72;
  for (const dz of [-0.12, 0.12]) part(G.box, C.dark, 0, 0.05, zc + dz, { sx: 0.5, sy: 0.1, sz: 0.08 });
  barrel([0, 0.1, zc], [0, top, zc], 0.2, 0.23, C.light, { head: false });
  if (!L.live) part(G.cyl12, WATER, 0, top + 0.006, zc, { sx: 0.36, sy: 0.004, sz: 0.36 });   // (the game draws it in the fountain's water)
  ring(0.188, top + 0.02, 12, 0.024, 0.03, shade(C.light, 0.9), 4);
  if (L.chute) {
    seg(G.box, C.dark, [0.04, 1.9, zb + 0.05], [0.04, 0.84, zc - 0.02], 0.035);
    part(G.box, IRON, 0.04, 1.6, zb + 0.03, { sx: 0.12, sy: 0.03, sz: 0.06 });
  }
  if (L.dipper) { seg(G.cyl6, C.light, [0.06, top - 0.04, zc + 0.02], [0.22, top + 0.16, zc + 0.16], 0.012); part(G.cyl8, C.dark, 0.23, top + 0.17, zc + 0.17, { sx: 0.03, sy: 0.03, sz: 0.03 }); }
}
// a woodpile against the wall: split logs in rows between two pairs of posts on two rails, their ends out, a plank roof
// over it, maybe a chopping block in front with an axe in it
function woodpile(L, C) {
  const zb = backZ(1), D = 0.42, zc = zb + D / 2 + 0.02, r = mulberry32(L.seed || 1), rows = L.rows, top = 0.07 + rows * 0.125 + 0.05;
  for (const s of [-1, 1]) for (const z of [zb + 0.04, zc + D / 2 - 0.03]) part(G.box, C.dark, s * 0.86, top / 2, z, { sx: 0.07, sy: top, sz: 0.07 });
  for (const dz of [-0.14, 0.14]) part(G.box, C.dark, 0, 0.025, zc + dz, { sx: 1.7, sy: 0.05, sz: 0.05 });
  for (let k = 0; k < rows; k++) {
    const odd = k % 2, n = odd ? 6 : 7;
    for (let j = 0; j < n; j++) {
      const x = (odd ? -0.6 : -0.72) + j * 0.24 + (r() - 0.5) * 0.03, y = 0.115 + k * 0.125, rr = 0.058 + r() * 0.01, z1 = zc + D / 2 + (r() - 0.5) * 0.04;
      seg(G.cyl6, shade(CC('#5a4232'), 0.85 + r() * 0.3), [x, y, zc - D / 2], [x, y, z1], rr);
      seg(G.cyl6, shade(CC('#c8a070'), 0.85 + r() * 0.25), [x, y, z1 - 0.002], [x, y, z1 + 0.006], rr - 0.014);
    }
  }
  if (L.roof) roofSlope(1.9, zb + 0.02, top + 0.14, zc + D / 2 + 0.12, top + 0.02, 2, C.wood, 0.03, { pieces: 6, s: 3 });
  if (L.block) {
    part(G.cyl8, C.dark, 0.5, 0.14, 0.3, { sx: 0.3, sy: 0.28, sz: 0.3 });
    part(G.cyl8, shade(CC('#c8a070'), 0.9), 0.5, 0.282, 0.3, { sx: 0.26, sy: 0.004, sz: 0.26 });
    seg(G.cyl6, C.light, [0.5, 0.3, 0.3], [0.6, 0.62, 0.42], 0.016);
    part(G.box, IRON, 0.5, 0.3, 0.3, { sx: 0.04, sy: 0.1, sz: 0.14, ry: 0.7 });
  }
}
// a wash line strung between two posts with crossbars, sagging, the washing pegged out along it
function washLine(L, C) {
  const X = 1.36, Y = 1.5, sag = 0.1, yAt = x => Y - sag * (1 - (x / X) ** 2);
  for (const s of [-1, 1]) {
    part(G.box, C.dark, s * X, 0.8, 0, { sx: 0.07, sy: 1.6, sz: 0.07 });
    part(G.box, C.dark, s * X, 1.55, 0, { sx: 0.06, sy: 0.06, sz: 0.36 });
    part(G.oct, shade(CC(STONE), 0.85), s * X, 0.03, 0, { sx: 0.16, sy: 0.06, sz: 0.14 });
  }
  for (let k = 0; k < 10; k++) { const a = -X + k * X / 5, b = a + X / 5; seg(G.cyl6, ROPE, [a, yAt(a), 0], [b, yAt(b), 0], 0.006); }
  for (const it of L.items) {
    const c = CC(it.c), w = it.w, h = it.h, x = it.x, top = yAt(x) - 0.012, rz = Math.atan(2 * sag * x / (X * X));
    if (it.k === 'shirt') {
      part(G.box, c, x, top - h / 2, 0, { sx: w * 0.62, sy: h, sz: 0.012, rz });
      for (const s of [-1, 1]) part(G.box, c, x + s * w * 0.36, top - 0.07, 0, { sx: w * 0.3, sy: 0.08, sz: 0.012, rz: rz - s * 0.5 });
    } else if (it.k === 'stockings') {
      for (const s of [-1, 1]) part(G.box, c, x + s * w * 0.25, top - h / 2, 0, { sx: w * 0.36, sy: h, sz: 0.012, rz });
    } else if (it.k === 'apron') {
      part(G.box, c, x, top - h * 0.38, 0, { sx: w, sy: h * 0.76, sz: 0.012, rz });
      for (const s of [-1, 1]) part(G.box, shade(c, 0.85), x + s * w * 0.42, top - h * 0.82, 0.006, { sx: 0.025, sy: h * 0.3, sz: 0.012, rz });
    } else part(G.box, c, x, top - h / 2, 0, { sx: w, sy: h, sz: 0.012, rz });
    for (const s of [-1, 1]) part(G.box, '#6a5a44', x + s * w * (it.k === 'stockings' ? 0.25 : 0.34), top + 0.005, 0, { sx: 0.018, sy: 0.05, sz: 0.024 });
  }
}
// a two-wheeled handcart: a plank bed with sides and stakes over an axle, the shafts down to a rest, its load
function handcart(L, C) {
  const R = 0.3, cx = 0.15, r = mulberry32(L.seed || 1);
  for (const z of [-0.4, 0.4]) {
    for (let k = 0; k < 12; k++) {
      const a = (k + 0.5) / 12 * Math.PI * 2;
      part(G.box, C.dark, cx + Math.sin(a) * (R - 0.025), R + Math.cos(a) * (R - 0.025), z, { sx: 2 * Math.PI * (R - 0.025) / 12 + 0.006, sy: 0.045, sz: 0.045, rz: -a });
    }
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; seg(G.box, C.wood, [cx, R, z], [cx + Math.sin(a) * (R - 0.04), R + Math.cos(a) * (R - 0.04), z], 0.012); }
    seg(G.cyl8, C.dark, [cx, R, z - 0.05], [cx, R, z + 0.05], 0.05);
  }
  seg(G.cyl6, IRON, [cx, R, -0.43], [cx, R, 0.43], 0.02);
  for (const z of [-0.2, 0.2]) part(G.box, C.dark, 0.05, R + 0.01, z, { sx: 1.4, sy: 0.05, sz: 0.05 });
  part(G.box, C.wood, 0.05, R + 0.06, 0, { sx: 1.3, sy: 0.05, sz: 0.66 });
  const yb = R + 0.085;
  for (const s of [-1, 1]) {
    part(G.box, C.wood, 0.05, yb + 0.1, s * 0.31, { sx: 1.3, sy: 0.2, sz: 0.035 });
    part(G.box, C.light, 0.05 + s * 0.62, yb + 0.1, 0, { sx: 0.035, sy: 0.2, sz: 0.58 });
    for (const t of [-1, 1]) part(G.box, C.dark, 0.05 + t * 0.63, yb + 0.12, s * 0.31, { sx: 0.05, sy: 0.26, sz: 0.05 });
    seg(G.box, C.dark, [-0.6, yb - 0.02, s * 0.26], [-0.98, 0.3, s * 0.22], 0.022);
    seg(G.box, C.dark, [-0.86, 0.33, s * 0.23], [-0.86, 0, s * 0.25], 0.018);
  }
  const k = L.load[0];
  if (k === 'sacks') for (let j = 0; j < 4; j++) { const x = -0.38 + j * 0.27, z = (r() - 0.5) * 0.2; part(G.box, '#b8a47a', x, yb + 0.12, z, { sx: 0.24, sy: 0.24, sz: 0.4, ry: (r() - 0.5) * 0.4 }); part(G.box, '#a8946a', x, yb + 0.26, z, { sx: 0.1, sy: 0.06, sz: 0.12 }); }
  else if (k === 'barrels') for (const x of [-0.3, 0.32]) barrel([x, yb, 0], [x, yb + 0.38, 0], 0.15, 0.17, shade(C.light, 0.95 + r() * 0.1), {});
  else if (k === 'hay') { part(G.box, '#cfb064', 0.05, yb + 0.16, 0, { sx: 1.16, sy: 0.32, sz: 0.56 }); for (const x of [-0.25, 0.35]) part(G.box, '#7a5a2a', x, yb + 0.16, 0, { sx: 0.03, sy: 0.33, sz: 0.57 }); }
  else if (k === 'crates') { slatCrate(-0.3, yb, 0, 0.44, 0.3, 0.5, C, 'apples', '#b83a2a', r); slatCrate(0.34, yb, 0, 0.44, 0.3, 0.5, C, 'cabbages', '#7aa04a', r); }
}
// a flagpole on a stepped stone foot, a gilt finial, a banner hung from an arm: the field, a band across its head and
// a device, on both faces; its foot square or swallowtailed
function flagpole(L, C) {
  part(G.box, shade(CC(STONE), 0.85), 0, 0.06, 0, { sx: 0.56, sy: 0.12, sz: 0.56 });
  part(G.box, CC(STONE), 0, 0.22, 0, { sx: 0.36, sy: 0.2, sz: 0.36 });
  part(G.cyl8, IRON, 0, 0.36, 0, { sx: 0.12, sy: 0.08, sz: 0.12 });
  seg(G.cyl8, C.light, [0, 0.32, 0], [0, 3.5, 0], 0.035);
  part(G.oct, '#c8a048', 0, 3.57, 0, { sx: 0.1, sy: 0.14, sz: 0.1 });
  seg(G.cyl6, C.dark, [0, 3.32, 0], [0.6, 3.32, 0], 0.018);
  part(G.oct, '#c8a048', 0.61, 3.32, 0, { sx: 0.05, sy: 0.05, sz: 0.05 });
  for (const x of [0.1, 0.31, 0.52]) part(G.box, IRON, x, 3.31, 0, { sx: 0.02, sy: 0.07, sz: 0.045 });
  const F = CC(L.field[0]), M = CC(L.mark[0]), ox = 0.31, oy = 3.29, hw = 0.25, len = 1.2;
  plate(L.tail ? [[-hw, 0], [-hw, -len], [0, -len + 0.22], [hw, -len], [hw, 0]] : [[-hw, 0], [-hw, -len], [hw, -len], [hw, 0]], 0, -len / 2, -0.006, 0.006, F, ox, oy);
  const sign = L.sign, shapes = [[[-hw, -0.08], [-hw, -0.15], [hw, -0.15], [hw, -0.08]]];   // (each counter-clockwise: its faces outward)
  if (sign === 'diamond') shapes.push([[0, -0.4], [-0.13, -0.56], [0, -0.72], [0.13, -0.56]]);
  else if (sign === 'cross') shapes.push([[-0.035, -0.38], [-0.035, -0.76], [0.035, -0.76], [0.035, -0.38]], [[-0.15, -0.53], [-0.15, -0.6], [0.15, -0.6], [0.15, -0.53]]);
  else if (sign === 'sun') { const s = []; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, rr = k % 2 ? 0.08 : 0.14; s.push([-Math.sin(a) * rr, -0.56 + Math.cos(a) * rr]); } shapes.push(s); }
  else shapes.push([[-0.2, -0.66], [0, -0.48], [0, -0.38], [-0.2, -0.56]], [[0, -0.48], [0.2, -0.66], [0.2, -0.56], [0, -0.38]]);
  for (const s of shapes) {
    const cx = s.reduce((a, p) => a + p[0], 0) / s.length, cy = s.reduce((a, p) => a + p[1], 0) / s.length;
    plate(s, cx, cy, 0.006, 0.01, M, ox, oy);
    plate(s, cx, cy, -0.01, -0.006, M, ox, oy);
  }
}
// a bird bath: a stone basin on a pedestal, water in it, maybe a bird on its rim
function birdBath(L) {
  const st = CC(L.stone[0]);
  part(G.box, shade(st, 0.85), 0, 0.04, 0, { sx: 0.34, sy: 0.08, sz: 0.34 });
  part(G.cyl8, st, 0, 0.27, 0, { sx: 0.16, sy: 0.38, sz: 0.16 });
  part(G.cyl8, shade(st, 1.05), 0, 0.47, 0, { sx: 0.24, sy: 0.06, sz: 0.24 });
  part(G.cyl12, shade(st, 0.95), 0, 0.54, 0, { sx: 0.6, sy: 0.08, sz: 0.6 });
  ring(0.27, 0.605, 14, 0.05, 0.05, shade(st, 1.08), 6);
  // (L.live: the game draws the water in its fountain's water shader and the bird alive, birdLive in index.html)
  if (!L.live) part(G.cyl12, WATER, 0, 0.595, 0, { sx: 0.5, sy: 0.01, sz: 0.5 });
  if (L.bird && !L.live) {
    const a = L.at, bx = Math.sin(a) * 0.27, bz = Math.cos(a) * 0.27, ry = a + Math.PI / 2, fx = Math.sin(ry), fz = Math.cos(ry), B = CC(L.birdC[0]);
    part(G.oct, B, bx, 0.67, bz, { sx: 0.07, sy: 0.07, sz: 0.12, ry });
    part(G.oct, shade(B, 1.1), bx + fx * 0.06, 0.71, bz + fz * 0.06, { sx: 0.05, sy: 0.05, sz: 0.05 });
    seg(G.cone4, '#c8a040', [bx + fx * 0.08, 0.71, bz + fz * 0.08], [bx + fx * 0.115, 0.705, bz + fz * 0.115], 0.01);
    part(G.box, shade(B, 0.8), bx - fx * 0.08, 0.68, bz - fz * 0.08, { sx: 0.03, sy: 0.01, sz: 0.07, ry });
    if (L.birdC[1] === 'A robin') part(G.oct, '#d0602a', bx + fx * 0.04, 0.65, bz + fz * 0.04, { sx: 0.05, sy: 0.04, sz: 0.04, ry });
  }
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
