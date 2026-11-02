// The Kinghaven merchant brig (v498, in the game since; its own module since v511) and its liveries (v511, Jordan):
// the hull's lower strakes and the deck in a wood stain each, the painted band (and the transom) in a paint with a
// trim colour for its pinstripe and gilt, the sails' cloth, and the emblem on them: a shape in a field colour with a
// smaller charge of it in another. Every colour is muted, as painted or stained wood and dyed canvas are; a livery is
// rolled from a seed (rollLivery), so a liked one can be had again. Shared by the game (index.html) and the random
// model generator (townsfolk.html): the shapes come out the same in both.
import * as GFX from '../gfx/index.js';

// the hull's size and the deck's fittings, as the game's BOAT has them (the game spreads these into BOAT)
export const BRIG_SHAPE = {
  stern: -4.2, bow: 4.6, mid: -0.6, beam: 1.35, free: 0.75, gangV: -0.2, wheelV: -3.2,
  helmP: 0.45, helmFront: -3.42, rampV: -2.6, rampU: 0.42, wheelY: 0.85, wheelR: 0.26,
  // (v517, Jordan: the sails a quarter bigger) h: the mast's height, sh: the height its sails were first cut for,
  // sailK: the sails' size over that (the masts stand taller to carry them)
  masts: [{ v: 1.7, h: 8.0, sh: 7.0, w: 3.2 }, { v: -1.0, h: 8.8, sh: 7.8, w: 3.6 }], sailK: 1.25,
  // the cathead the anchor hangs from (its beam's underside, where the chain comes out; v521: a beam out over the rail),
  // the anchor's ring top when stowed, clear of the water, and its turn about the vertical, so its arms and stock
  // stand off the hull's flare
  hawse: [1.1, 0.56, 3.4], anchorUp: 0.48, anchorTurn: 0.9,
};
// the deck's half width along the boat (to the bulwarks' inner face), the bulwarks' height over the deck, the keel
export function hullHB(B, v) {
  if (v <= B.mid) { const t = Math.min(1, (B.mid - v) / (B.mid - B.stern)); return B.beam * (1 - 0.26 * t * t); }
  const t = Math.min(1, (v - B.mid) / (B.bow - B.mid));
  return Math.max(0.04, B.beam * Math.pow(1 - t * t, 0.62));
}
export const hullGH = v => 0.42 + 0.35 * Math.max(0, (v - 1.5) / 3.1) ** 2 + 0.18 * Math.max(0, (-v - 2.8) / 1.4);
export const hullKeel = (B, v) => -B.free - 0.85 + 0.75 * Math.max(0, (v - 2.4) / 2.2) ** 2;
// a mast's two yards: [height, width, how far its sail hangs] (the lower sail stops clear over your head)
// (v517: sailK times the first cut; the lower sail's foot stays 2.1 over the deck, the upper's 0.3 over the lower yard)
export const brigYards = (m, k = BRIG_SHAPE.sailK) => {
  const sh = m.sh || m.h, lh = (sh * 0.5 - 2.1) * k, uh = (sh * 0.32 - 0.3) * k, ly = 2.1 + lh, uy = ly + 0.3 + uh;
  return [[ly, m.w * k, lh], [uy, m.w * 0.74 * k, uh]];
};

// ---------- liveries ----------
// stains: [id, name, colour]; the hull's strakes darken from it down to the keel, the deck's boards are it and a
// shade darker (rails, masts and the helm deck are of the deck's wood). paints: the band under the rail and the
// transom. trims: the pinstripe, the gilt and the brass. cloths: the sails. pennants: the swallowtail.
export const STAINS = [
  ['oak', 'Oak', '#92613e'], ['pine', 'Honey pine', '#ad8656'], ['teak', 'Teak', '#9c6b3c'], ['walnut', 'Walnut', '#6c4831'],
  ['cedar', 'Cedar', '#a05a3c'], ['mahogany', 'Mahogany', '#7c4130'], ['drift', 'Weathered grey', '#857d72'], ['tar', 'Tarred', '#433832'],
];
export const DECKS = [
  ['oak', 'Oak', '#8a6a44'], ['pine', 'Honey pine', '#a88a5e'], ['teak', 'Teak', '#93703f'], ['walnut', 'Walnut', '#6b5039'],
  ['cedar', 'Cedar', '#94634a'], ['mahogany', 'Mahogany', '#7a4a37'], ['drift', 'Weathered grey', '#8e877b'], ['ash', 'Scrubbed ash', '#a99a7c'],
];
export const PAINTS = [
  ['forest', 'Forest green', '#395749'], ['oxblood', 'Oxblood', '#6b2e29'], ['navy', 'Navy', '#2f3e53'], ['ochre', 'Ochre', '#977838'],
  ['slate', 'Slate', '#4d585e'], ['teal', 'Deep teal', '#2f5755'], ['black', 'Black', '#2c2927'], ['cream', 'Cream', '#c6b996'],
  ['brick', 'Brick red', '#83452f'], ['plum', 'Plum', '#4e3547'], ['sage', 'Sage', '#677659'], ['dove', 'Dove grey', '#87877d'],
];
export const TRIMS = [
  ['gold', 'Gilt', '#b8923a'], ['cream', 'Cream', '#d3c7a3'], ['red', 'Red ochre', '#94432f'], ['white', 'Bone white', '#cdc6b5'],
  ['black', 'Black', '#2c2a28'], ['verdigris', 'Verdigris', '#5d8676'], ['blue', 'Faded blue', '#5a6e85'],
];
export const CLOTHS = [
  ['canvas', 'Canvas', '#e8dcc0', 4], ['bleached', 'Bleached', '#ede7d8', 2], ['tan', 'Tanned', '#c6a273', 2], ['barked', 'Tan-bark red', '#a9654a', 1.5],
  ['ochre', 'Ochre', '#c49f5a', 1], ['grey', 'Weathered grey', '#b8b3a6', 1], ['dun', 'Dun', '#d2c098', 1.5],
];
export const PENNANTS = [['red', 'Red', '#a8322a'], ['blue', 'Blue', '#3a5276'], ['green', 'Green', '#3f6a4c'], ['gold', 'Gold', '#b8923a'], ['black', 'Black', '#2c2927'], ['white', 'White', '#d8d2c2']];
// (v513, Jordan) the sails' cloth: dyed cloths beside the plain ones, seams running down or across (or none), and a
// pattern over it in a second dye: [id, name, colour]; patterns are made of the sail's cells (see buildBrig)
export const CLOTHS_DYED = [
  ['tarred', 'Tarred black', '#4d4844', 1], ['indigo', 'Indigo-dyed', '#6f7891', 1], ['rust', 'Rust', '#a35e44', 1],
  ['sea', 'Sea green', '#8c9f8f', 1], ['saffron', 'Saffron', '#cca552', 1], ['rose', 'Faded rose', '#b38c80', 1],
];
export const SEAMS = [['vertical', 'Seams down', 3], ['horizontal', 'Seams across', 2], ['none', 'Seamless', 2]];
export const SAIL_DYES = [
  ['rust', 'Rust red', '#9a4c35'], ['indigo', 'Faded indigo', '#4f5d78'], ['moss', 'Moss', '#66704a'], ['ochre', 'Ochre', '#b38a45'],
  ['charcoal', 'Charcoal', '#45423f'], ['cream', 'Cream', '#e6dcc2'], ['barked', 'Tan-bark', '#a9654a'], ['sea', 'Sea green', '#5e7d72'],
  ['wine', 'Wine', '#6a3438'], ['bleached', 'Bleached', '#ede7d8'],
];
// each pattern: which cells (i across 0..13, j down 0..13 over the cloth, above the foot band) take the second dye
export const SAIL_PATTERNS = {
  plain: { name: 'Plain', w: 4, at: () => false },
  pales: { name: 'Stripes down', w: 1.6, at: i => (i >> 1) % 2 === 1 },
  pale: { name: 'Broad stripe down', w: 1, at: i => i >= 5 && i <= 8 },
  bars: { name: 'Stripes across', w: 1.6, at: (i, j) => (j >> 1) % 2 === 1 },
  fess: { name: 'Broad band across', w: 1, at: (i, j) => j >= 5 && j <= 8 },
  chief: { name: 'Dyed head', w: 0.8, at: (i, j) => j < 3 },
  halved: { name: 'Halved', w: 0.8, at: i => i < 7 },
  quartered: { name: 'Quartered', w: 1, at: (i, j) => (i < 7) !== (j < 7) },
  checky: { name: 'Checked', w: 0.6, at: (i, j) => ((i >> 1) + (j >> 1)) % 2 === 1 },
  bordure: { name: 'Bordered', w: 1, at: (i, j) => i === 0 || i === 13 || j === 0 },
};
// the emblems (v513: on the two tallest sails only, bigger, each with a rim of its charge's colour): a few convex
// pieces each (x across, y down, about -1..1) for its field, and for a charge over it. The rim is the field grown a little.
const ngon = (n, r, a0 = 0, cx = 0, cy = 0) => Array.from({ length: n }, (_, k) => { const a = a0 + k / n * Math.PI * 2; return [cx + Math.sin(a) * r, cy - Math.cos(a) * r]; });
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const star = (r, k, cx = 0, cy = 0, n = 5) => { const out = [ngon(n, r * k, Math.PI / n, cx, cy)]; for (let j = 0; j < n; j++) { const a = j / n * Math.PI * 2, b = a + Math.PI / n, c = a - Math.PI / n; out.push([[cx + Math.sin(a) * r, cy - Math.cos(a) * r], [cx + Math.sin(b) * r * k, cy - Math.cos(b) * r * k], [cx + Math.sin(c) * r * k, cy - Math.cos(c) * r * k]]); } return out; };
// a ring round a convex shape: the band between it scaled by s0 and by s1 (about cx, cy), a quad an edge
const ring = (poly, s0, s1, cx = 0, cy = 0) => poly.map((p, k) => { const q = poly[(k + 1) % poly.length], at = (v, s) => [cx + (v[0] - cx) * s, cy + (v[1] - cy) * s]; return [at(p, s1), at(q, s1), at(q, s0), at(p, s0)]; });
// rays round a disc: n of them, long and short by turns
const rays = (r0, long, short, n, w) => Array.from({ length: n }, (_, j) => {
  const a = j / n * Math.PI * 2, R = j % 2 ? short : long, h = Math.PI / n * w;
  return [[Math.sin(a) * R, -Math.cos(a) * R], [Math.sin(a + h) * r0, -Math.cos(a + h) * r0], [Math.sin(a - h) * r0, -Math.cos(a - h) * r0]];
});
// a compass rose's points: kites from the middle out to each tip, the four great ones longer
const rose = (big, small, waist) => Array.from({ length: 8 }, (_, j) => {
  const a = j * Math.PI / 4, p = (t, r) => [Math.sin(t) * r, -Math.cos(t) * r];
  return [[0, 0], p(a - Math.PI / 8, waist), p(a, j % 2 ? small : big), p(a + Math.PI / 8, waist)];
});
// a chevron's two arms, its point at (0, top), the arms out to +-x1, w thick
const chevron = (x1, top, w) => [[[-x1, top + x1], [0, top], [0, top + w], [-x1, top + x1 + w]], [[0, top], [x1, top + x1], [x1, top + x1 + w], [0, top + w]]];
// a crescent opening to the right: the disc R less a disc r set over by off, in slices down it
const crescent = (R, r, off, n) => {
  const yi = Math.sqrt(Math.max(0, R * R - ((R * R - r * r + off * off) / (2 * off)) ** 2)), out = [];
  const L = y => [-Math.sqrt(Math.max(0, R * R - y * y)), y], Rt = y => [off - Math.sqrt(Math.max(0, r * r - y * y)), y];
  for (let k = 0; k < n; k++) {
    const y0 = -yi * Math.cos(Math.PI * k / n), y1 = -yi * Math.cos(Math.PI * (k + 1) / n);
    out.push([L(y0), Rt(y0), Rt(y1), L(y1)]);
  }
  return out;
};
const LOZ = [[0, -1], [0.7, 0], [0, 1], [-0.7, 0]];
export const EMBLEMS = {
  diamond: { name: 'Lozenge', field: [LOZ], charge: [...ring(LOZ, 0.58, 0.72), LOZ.map(([x, y]) => [x * 0.26, y * 0.26])] },
  roundel: { name: 'Compass roundel', field: [ngon(32, 0.9)], charge: [...ring(ngon(32, 1), 0.7, 0.78), ...rose(0.64, 0.4, 0.12)] },
  star: { name: 'Star', field: star(1, 0.42, 0, 0.08), charge: star(0.42, 0.42, 0, 0.08) },
  chevron: { name: 'Chevrons', field: [...chevron(0.9, -0.92, 0.34), ...chevron(0.9, -0.28, 0.34)], charge: [...chevron(0.78, -0.79, 0.08), ...chevron(0.78, -0.15, 0.08)] },
  sun: { name: 'Sun', field: [ngon(28, 0.52), ...rays(0.49, 1, 0.74, 16, 0.62)], charge: [...ring(ngon(24, 1), 0.3, 0.38), ngon(18, 0.17)] },
  // (the star in the crescent's arms is of its field, rimmed, so it never fades into the cloth)
  crescent: { name: 'Crescent and star', field: [...crescent(0.92, 0.74, 0.4, 18), ...star(0.3, 0.42, 0.42, 0.04)].map(q => q.map(([x, y]) => [x + 0.1, y])), charge: [] },
  anchor: { name: 'Anchor', field: [...ring(ngon(14, 1, 0, 0, 0), 0.13, 0.25).map(q => q.map(([x, y]) => [x, y - 0.74])), rect(-0.08, -0.52, 0.08, 0.82), rect(-0.46, -0.42, 0.46, -0.3),
    ...Array.from({ length: 12 }, (_, k) => { const p = (a, r) => [Math.sin(a) * r, 0.12 - Math.cos(a) * r], a = Math.PI * (0.6 + 0.8 * k / 12), b = Math.PI * (0.6 + 0.8 * (k + 1) / 12); return [p(a, 0.76), p(b, 0.76), p(b, 0.62), p(a, 0.62)]; }),
    [[0.8, -0.02], [0.86, 0.4], [0.52, 0.3]], [[-0.8, -0.02], [-0.52, 0.3], [-0.86, 0.4]]], charge: [] },
  // (v511's cross, saltire and two bars are gone: a seed that rolled one takes another emblem)
  cross: { name: 'Cross', gone: true }, saltire: { name: 'Saltire', gone: true }, bars: { name: 'Two bars', gone: true },
  none: { name: 'Plain', field: [], charge: [] },
};
// (the first roll keeps v511's weights so other seeds keep theirs; the gone ones roll again from EMBLEM_AGAIN)
const EMBLEM_W = [['diamond', 3], ['roundel', 2], ['cross', 1.5], ['saltire', 1.2], ['star', 1.5], ['chevron', 1.2], ['bars', 1], ['sun', 1], ['none', 0.8]];
const EMBLEM_AGAIN = [['crescent', 2], ['anchor', 2], ['diamond', 1], ['roundel', 1], ['star', 1], ['chevron', 1], ['sun', 1], ['none', 0.4]];
// a convex piece grown by d all round (corners sharper than 120 degrees bevelled, so a star's points stay short)
export function growPiece(poly0, d) {
  const poly = poly0.filter((p, k) => { const q = poly0[(k + 1) % poly0.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-6; }), n = poly.length;
  if (n < 3) return poly;
  let A = 0; for (let k = 0; k < n; k++) { const p = poly[k], q = poly[(k + 1) % n]; A += p[0] * q[1] - q[0] * p[1]; }
  const s = A > 0 ? 1 : -1;
  const nrm = k => { const p = poly[k], q = poly[(k + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy); return [s * dy / L, -s * dx / L]; };
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = nrm((k + n - 1) % n), b = nrm(k), p = poly[k], dot = a[0] * b[0] + a[1] * b[1];
    if (dot > -0.5) { const t = d / (1 + dot); out.push([p[0] + (a[0] + b[0]) * t, p[1] + (a[1] + b[1]) * t]); }
    else { out.push([p[0] + a[0] * d, p[1] + a[1] * d], [p[0] + b[0] * d, p[1] + b[1] * d]); }
  }
  return out;
}
// (v513, Jordan) every boat its name
const SHIP = {
  adj: ['Grey', 'Salt', 'Silver', 'Wandering', 'Restless', 'Drowned', 'Gilded', 'Black', 'Morning', 'Evening', 'Hollow', 'Lucky', 'Weeping', 'Laughing',
    'Crimson', 'Last', 'Lonely', 'Merry', 'Swift', 'Wild', 'Faithful', 'Sleeping', 'Golden', 'Starlit', 'Storm-born', 'Briny', 'Thrice-drowned', 'Lantern-lit', 'Far-faring', 'Moonlit'],
  noun: ['Gull', 'Heron', 'Kestrel', 'Cormorant', 'Petrel', 'Albatross', 'Maiden', 'Widow', 'Siren', 'Selkie', 'Leviathan', 'Wyrm', 'Kraken', 'Mermaid',
    'Lantern', 'Tide', 'Rose', 'Duchess', 'Pilgrim', 'Rover', 'Hart', 'Swan', 'Otter', 'Conch', 'Crown', 'Fortune', 'Wanderer', 'Herald', 'Bell', 'Oyster'],
  who: ['Maren', 'Tobin', 'Elsbeth', 'Aldric', 'Wenna', 'Corwin', 'Isolde', 'Bram', 'Hesper', 'Rowan', 'Edda', 'Garrick', 'Liesl', 'Osric', 'Thessaly', 'Alba', 'Old Jory', 'Mother Brine'],
  owns: ['Fortune', 'Promise', 'Lantern', 'Folly', 'Luck', 'Revenge', 'Rose', 'Pride', 'Delight', 'Hope', 'Lament', 'Wager', 'Secret', 'Daughter'],
  title: ['Pride', 'Star', 'Queen', 'Lady', 'Spirit', 'Wrath', 'Light', 'Jewel', 'Song', 'Ghost', 'Bride', 'Herald'],
  place: ['Kinghaven', 'the Westmere', 'Saltreach', 'the Shallows', 'Gullcliff', 'the Nine Isles', 'Mornhold', 'the Deep', 'Brineholt', 'Stormwatch', 'the Sunken Bell', 'Thornmouth', 'the Far Shoals', 'Ashport'],
  head: ['Storm', 'Brine', 'Wave', 'Tide', 'Gale', 'Mist', 'Salt', 'Foam', 'Star', 'Moon', 'Dawn', 'Sea', 'Wind', 'Spray', 'Kelp', 'Squall', 'Swell', 'Reef'],
  tail: ['runner', 'caller', 'singer', 'breaker', 'dancer', 'wyrm', 'maiden', 'rider', 'strider', 'whisper', 'warden', 'seeker', 'song', 'chaser', 'heart', 'wing', 'drake', 'mare'],
};
function shipName(r) {
  const pick = list => list[Math.floor(r() * list.length) % list.length], u = r();
  if (u < 0.36) return `The ${pick(SHIP.adj)} ${pick(SHIP.noun)}`;
  if (u < 0.56) return `${pick(SHIP.who)}'s ${pick(SHIP.owns)}`;
  if (u < 0.76) return `${pick(SHIP.title)} of ${pick(SHIP.place)}`;
  return pick(SHIP.head) + pick(SHIP.tail);
}
const hexRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const far = (a, b, d) => { const x = hexRGB(a), y = hexRGB(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) > d; };
export function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
// a livery from a seed: { seed, hull, deck, paint, trim, cloth, emblem, field, charge, pennant }, each an [id, name, colour]
// (the emblem its id). (Append any new rolls at the end, or every kept seed changes.)
export function rollLivery(seed) {
  const r = mulberry32((seed | 0) * 7919 + 1013);
  const pick = list => list[Math.floor(r() * list.length) % list.length];
  const wpick = list => { const tot = list.reduce((s, x) => s + x[x.length - 1], 0); let u = r() * tot; for (const x of list) { u -= x[x.length - 1]; if (u <= 0) return x; } return list[list.length - 1]; };
  const hull = pick(STAINS);
  // (the deck most often of the hull's own wood, scrubbed paler sometimes; never tarred)
  const same = DECKS.find(d => d[0] === hull[0]);
  const deck = same && r() < 0.55 ? same : pick(DECKS);
  const paint = pick(PAINTS);
  let trim = pick(TRIMS); for (let n = 0; n < 8 && !far(trim[2], paint[2], 70); n++) trim = pick(TRIMS);
  const cloth = wpick(CLOTHS);
  let emblem = wpick(EMBLEM_W)[0];
  // the field: often the hull's paint; never lost against the cloth. The charge: clear of the field.
  const all = [...PAINTS, ...TRIMS];
  let field = r() < 0.5 ? paint : pick(all); for (let n = 0; n < 12 && !far(field[2], cloth[2], 95); n++) field = pick(all);
  let charge = r() < 0.5 ? trim : pick(all); for (let n = 0; n < 12 && !far(charge[2], field[2], 80); n++) charge = pick(all);
  const pennant = pick(PENNANTS);
  // (v515, Jordan: rolled after all of v511's, so those stay as they were) an emblem that's gone rolls again; a
  // dyed cloth now and then (the emblem's colours picked again if they'd be lost on it); the seams, a pattern in a
  // second dye, and the boat's name
  if (EMBLEMS[emblem].gone || (emblem === 'diamond' && r() < 0.4)) emblem = wpick(EMBLEM_AGAIN)[0];   // (fewer lozenges than v511's)
  let cloth2 = cloth;
  if (r() < 0.3) {
    cloth2 = wpick(CLOTHS_DYED);
    for (let n = 0; n < 12 && !far(field[2], cloth2[2], 95); n++) field = pick(all);
    for (let n = 0; n < 12 && !far(charge[2], field[2], 80); n++) charge = pick(all);
  }
  const seams = wpick(SEAMS);
  const pattern = wpick(Object.entries(SAIL_PATTERNS).map(([id, P]) => [id, P.w]))[0];
  let dye = r() < 0.25 ? paint : pick(SAIL_DYES);
  for (let n = 0; n < 16 && !(far(dye[2], cloth2[2], 75) && (emblem === 'none' || far(dye[2], field[2], 55))); n++) dye = pick(SAIL_DYES);
  const name = shipName(r);
  return { seed: seed | 0, hull, deck, paint, trim, cloth: cloth2, emblem, field, charge, pennant, seams, pattern, dye, name };
}
// the livery as rows for a panel: [what, its name, its colour]
export const describeLivery = L => [
  ['Hull', L.hull[1] + ' stain', L.hull[2]], ['Deck', L.deck[1], L.deck[2]], ['Paint', L.paint[1], L.paint[2]], ['Trim', L.trim[1], L.trim[2]],
  ['Sails', L.cloth[1] + (L.seams ? ', ' + L.seams[1].toLowerCase() : ''), L.cloth[2]],
  ...(L.pattern && L.pattern !== 'plain' ? [['Pattern', `${SAIL_PATTERNS[L.pattern].name} in ${L.dye[1].toLowerCase()}`, L.dye[2]]] : []), ['Emblem', EMBLEMS[L.emblem].name + (L.emblem === 'none' ? '' : ` in ${L.field[1].toLowerCase()}`), L.emblem === 'none' ? null : L.field[2]],
  ...(L.emblem === 'none' ? [] : [['Charge', L.charge[1], L.charge[2]]]), ['Pennant', L.pennant[1], L.pennant[2]],
];
// a short name for the livery: its paint and its emblem
export const liveryName = L => `${L.paint[1]} and ${L.trim[1].toLowerCase()}${L.emblem === 'none' ? '' : ', ' + EMBLEMS[L.emblem].name.toLowerCase()}`;

// ---------- the mesh kit (the game's own part/seg/quad/tri, so the shapes match) ----------
const colorCache = new Map();
const CC = h => { let k = colorCache.get(h); if (!k) { k = new GFX.Color(h); colorCache.set(h, k); } return k; };
const shade = (c, f) => { const k = (typeof c === 'string' ? CC(c) : c).clone().multiplyScalar(f); k.r = Math.min(1, k.r); k.g = Math.min(1, k.g); k.b = Math.min(1, k.b); return k; };
const hash = (a, b, k) => { const s = Math.sin(a * 12.9898 + b * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
let G = null, GP = null;
function prims() {
  if (G) return;
  G = { box: new GFX.BoxGeometry(1, 1, 1), cone4: new GFX.ConeGeometry(0.5, 1, 4), cyl6: new GFX.CylinderGeometry(0.5, 0.5, 1, 6),
    cyl8: new GFX.CylinderGeometry(0.5, 0.5, 1, 8), oct: new GFX.OctahedronGeometry(0.5, 0), frust7: new GFX.CylinderGeometry(0.26, 0.5, 1, 7) };
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
let OUT = null;
const dummy = new GFX.Object3D(), segAxis = new GFX.Vector3(), segDir = new GFX.Vector3();
const col = c => typeof c === 'string' ? CC(c) : c;
function tri(a, b, c, ca, cb = ca, cc = ca) {
  const p = OUT.p, k = OUT.c; ca = col(ca); cb = col(cb); cc = col(cc);
  p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  k.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
}
function quad(a, b, c, d, ca, cb = ca, cc = cb, cd = ca) { tri(a, b, c, ca, cb, cc); tri(a, c, d, ca, cc, cd); }
function emit(geo, color) {
  dummy.updateMatrix();
  const e = dummy.matrix.elements, src = GP.get(geo), k = col(color), p = OUT.p, cl = OUT.c;
  const det = e[0] * (e[5] * e[10] - e[6] * e[9]) - e[4] * (e[1] * e[10] - e[2] * e[9]) + e[8] * (e[1] * e[6] - e[2] * e[5]);
  const sw = det < 0 ? [0, 1, -1] : [0, 0, 0];
  for (let i0 = 0; i0 < src.length; i0 += 3) {
    const i = i0 + sw[(i0 / 3) % 3] * 3, px = src[i], py = src[i + 1], pz = src[i + 2];
    p.push(e[0] * px + e[4] * py + e[8] * pz + e[12], e[1] * px + e[5] * py + e[9] * pz + e[13], e[2] * px + e[6] * py + e[10] * pz + e[14]);
    cl.push(k.r, k.g, k.b);
  }
}
function part(geo, color, x, y, z, { ry = 0, rx = 0, rz = 0, s = 1, sx = s, sy = s, sz = s } = {}) {
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

// ---------- the sails' smooth shading ----------
// the sail's cloth as made, z (its belly) over x across and y down from the yard
export const BRIG_SAIL_Z = (x, y) => { const v = -y, u = x / (0.94 + 0.06 * v) + 0.5; return 0.3 * (1 - (2 * u - 1) ** 2) * Math.sin(Math.PI * v); };
// each corner of a sail's mesh its slope (dz/dx, dz/dy) on the smooth surface z(x, y) it was cut from
export function sailSlopes(geo, zf) {
  if (!geo) return;
  const p = geo.attributes.position.array, n = p.length / 3, sg = new Float32Array(n * 2), e = 1e-3;
  for (let k = 0; k < n; k++) {
    const x = p[k * 3], y = Math.min(-e, Math.max(-1 + e, p[k * 3 + 1]));
    sg[k * 2] = (zf(x + e, y) - zf(x - e, y)) / (2 * e);
    sg[k * 2 + 1] = (zf(x, y + e) - zf(x, y - e)) / (2 * e);
  }
  geo.setAttribute('sg', new GFX.BufferAttribute(sg, 2));
}
// (v506) the sails' material: shaded smooth (each corner's normal from the sail's curve) and fluttering in the wind
// like the wheat. windV: the wind's uniform ({ value: { x, y, z, w } }: its way, lean, phase); U.fl: flutter, speed.
export function makeSailMat(windV) {
  const U = { windV, fl: { value: { x: 0.06, y: 4, z: 0, w: 0 } } };
  const mat = new GFX.ShaderMaterial({ uniforms: U, vertexColors: true, side: GFX.DoubleSide, attributes: { sg: 'vec2f' }, lit: true,
    code: /* wgsl */ `
struct VOut { @builtin(position) pos: vec4f, @location(0) world: vec3f, @location(1) color: vec3f, @location(2) eye: vec3f, @location(3) n: vec3f }
@vertex fn vs(v: VIn) -> VOut {
  let M = O.model;
  let c0 = M[0].xyz; let c1 = M[1].xyz; let c2 = M[2].xyz;
  // (the sail's local x across (-0.5..0.5), y down from the yard (0..-1), z its belly; a furled sail barely moves)
  let lx = v.position.x; let ly = -v.position.y;
  let ph = U.windV.w * U.fl.y + M[3].x * 0.37 + M[3].z * 0.53;
  let a1 = ph * 1.0 + lx * 7.0 - ly * 2.0;
  let a2 = ph * 1.63 - lx * 11.0 + ly * 3.5 + 1.3;
  let s = 0.65 * sin(a1) + 0.35 * sin(a2);
  let sx = 0.65 * 7.0 * cos(a1) - 0.35 * 11.0 * cos(a2);
  let sy = -0.65 * 2.0 * cos(a1) + 0.35 * 3.5 * cos(a2);
  let A = U.fl.x * smoothstep(0.0, 1.0, length(c1));
  let d = A * ly * s;
  // the slope of the cloth (its own curve, as made, and the flutter's) gives the normal; turned into the world by the
  // inverse transpose of the sail's turn and stretch
  let gx = v.sg.x + A * ly * sx;
  let gy = v.sg.y - A * (s + ly * sy);
  let nl = vec3f(-gx, -gy, 1.0);
  let n = c0 * (nl.x / dot(c0, c0)) + c1 * (nl.y / max(dot(c1, c1), 1e-6)) + c2 * (nl.z / dot(c2, c2));
  let w = (M * vec4f(v.position.x, v.position.y, v.position.z + d, 1.0)).xyz;
  return VOut(F.viewProj * vec4f(w, 1.0), w, v.color, w - F.camPos.xyz, n);
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  var N = normalize(i.n);
  let toward = select(-i.eye, -F.camDir.xyz, F.camPos.w > 0.5);
  if (dot(N, toward) < 0.0) { N = -N; }
  let c = shadeLit(i.color, vec3f(0.0), 0.0, 1.0, i.world, N, O.emissive.w > 0.5);
  return vec4f(applyFog(c, viewDepth(i.world)), 1.0);
}`,
  });
  return { mat, U };
}

// ---------- the name on the transom (v519) ----------
// (Jordan) the boat's name painted across the transom's band in the map's book font (Spectral) with a round black
// stroke, as the map's names are: drawn on a canvas into a texture, on a quad of its own (NAME_PLATE, transom space)
export const NAME_PLATE = { hw: 0.88, y0: 0.05, y1: 0.53, W: 512, H: 140, weight: 600, stroke: 0.22, spacing: 0.04 };
const nameInk = hex => { const [r, g, b] = hexRGB(hex); return 0.299 * r + 0.587 * g + 0.114 * b > 95 ? hex : '#e6dcc2'; };
function drawName(data, name, ink) {
  const P = NAME_PLATE, cv = document.createElement('canvas'); cv.width = P.W; cv.height = P.H;
  const ctx = cv.getContext('2d'), font = px => `${P.weight} ${px}px Spectral, Georgia, serif`;
  // one line, or two split at the space that comes out most even, whichever lets the letters be biggest
  const fit = lines => {
    let px = 100; ctx.font = font(px); ctx.letterSpacing = `${P.spacing * px}px`;
    const wide = Math.max(...lines.map(t => ctx.measureText(t).width)) + px * P.stroke * 1.2;
    return Math.min(px * (P.W - 8) / wide, (P.H - 6) / (lines.length * 1.02 + 0.08));
  };
  let lines = [name];
  const words = name.split(' ');
  for (let m = 1; m < words.length; m++) { const two = [words.slice(0, m).join(' '), words.slice(m).join(' ')]; if (fit(two) > fit(lines)) lines = two; }
  const px = fit(lines);
  ctx.font = font(px); ctx.letterSpacing = `${P.spacing * px}px`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.lineWidth = px * P.stroke;
  const lh = px * 1.02, top = P.H / 2 - (lines.length - 1) * lh / 2 + px * 0.04;
  lines.forEach((t, k) => { ctx.strokeStyle = '#000'; ctx.strokeText(t, P.W / 2, top + k * lh); });
  lines.forEach((t, k) => { ctx.fillStyle = ink; ctx.fillText(t, P.W / 2, top + k * lh); });
  data.set(ctx.getImageData(0, 0, P.W, P.H).data);
}
// the name's texture: drawn now, and again once the book font has loaded (canvas text falls back until then)
export function nameTexture(name, inkHex) {
  if (typeof document === 'undefined') return null;
  const P = NAME_PLATE, data = new Uint8Array(P.W * P.H * 4), ink = nameInk(inkHex);
  const tex = new GFX.DataTexture(data, P.W, P.H);
  drawName(data, name, ink);
  const f = `${P.weight} 48px Spectral`;
  if (document.fonts && !document.fonts.check(f)) document.fonts.load(f).then(() => { drawName(data, name, ink); tex.needsUpdate = true; }, () => 0);
  return tex;
}
// the plate's material: the name's pixels lit as the hull is, nothing drawn where it's clear
export function makeNameMat(tex) {
  return new GFX.ShaderMaterial({ uniforms: { tName: { value: tex } }, attributes: { nUV: 'vec2f' }, side: GFX.DoubleSide, lit: true, code: /* wgsl */ `
struct VOut { @builtin(position) pos: vec4f, @location(0) world: vec3f, @location(1) eye: vec3f, @location(2) uv: vec2f }
@vertex fn vs(v: VIn) -> VOut {
  let w = (O.model * vec4f(v.position, 1.0)).xyz;
  return VOut(F.viewProj * vec4f(w, 1.0), w, w - F.camPos.xyz, v.nUV);
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let t = textureSample(tName, tNameS, i.uv);
  if (t.a < 0.5) { discard; }
  let c = shadeLit(t.rgb, vec3f(0.0), 0.0, 1.0, i.world, flatNormal(i.eye), O.emissive.w > 0.5);
  return vec4f(applyFog(c, viewDepth(i.world)), 1.0);
}` });
}

// ---------- the brig's shapes in a livery ----------
// { hull, glow, sail, sailE (with the emblem), wheel, furl, anchor, chain, plank }: geometries, the sails with their slopes (sailSlopes)
export function buildBrig(L, B = BRIG_SHAPE) {
  prims();
  const made = {}, HB = v => hullHB(B, v), GH = hullGH, KEEL = v => hullKeel(B, v);
  const hs = (a, b, k) => hash(a, b, k + (L.seed % 9973) * 0.137);
  // the woods: the hull's stain darkening down its strakes (as oak's did, in linear light), the deck's for its
  // boards, rails, masts and helm deck
  const hullC = L.hull[2], deckC = L.deck[2];
  const C = {
    wood: shade(deckC, 0.87), dark: shade(hullC, 0.24), edge: shade(hullC, 0.28), cap: shade(deckC, 1.5),
    paint: CC(L.paint[2]), band: null, gold: CC(L.trim[2]), iron: CC('#2e2e34'), rope: CC('#494135'),
    canvas: CC(L.cloth[2]), canvasShade: shade(L.cloth[2], 0.9),
  };
  // (the sail's foot: a band of its paint, lightened toward the cloth)
  C.band = CC(L.paint[2]).clone().lerp(C.canvas, 0.22);
  const strakes = [C.paint, shade(hullC, 1), shade(hullC, 0.77), shade(hullC, 0.61), shade(hullC, 0.41), shade(hullC, 0.24)];
  const boardA = shade(deckC, 1), boardB = shade(deckC, 0.77), bed = shade(deckC, 0.19);
  const post = shade(deckC, 0.58), rail = shade(deckC, 1), cleat = shade(deckC, 0.77), rampSide = shade(deckC, 0.44);
  const take = (name, fn) => { OUT = new Buf(); try { fn(); made[name] = OUT.geometry(); } finally { OUT = null; } };
  // A thin ribbon wrapped around the existing collision outline; no textures.
  const sidePoint = (v, y) => {
    const hb = HB(v), ky = KEEL(v);
    const sec = [[hb + 0.055, GH(v)], [hb + 0.04, 0],
      [hb * 0.99, ky * 0.18], [hb * 0.91, ky * 0.36],
      [hb * 0.78, ky * 0.54], [hb * 0.5, ky * 0.78], [0, ky]];
    for (let j = 0; j < sec.length - 1; j++) if (y >= sec[j + 1][1]) {
      const t = (y - sec[j][1]) / (sec[j + 1][1] - sec[j][1]);
      return sec[j][0] + (sec[j + 1][0] - sec[j][0]) * t;
    }
    return 0;
  };
  // (v499, Jordan) the decks' boards as the wood floor's: a quarter tile apart, 0.215 wide over a dark bed 0.02
  // under them (so the seams outline as the floor's do), in the deck's two tones; boards along the boat, from v a
  // to b, at heights ya to yb, between lo(v) and hi(v) across
  const boards = (a, b, ya, yb, lo, hi) => {
    quad([lo(a), ya - 0.02, a], [lo(b), yb - 0.02, b], [hi(b), yb - 0.02, b], [hi(a), ya - 0.02, a], bed);
    for (let q = -7; q < 7; q++) {
      const l = q * 0.25 + 0.0175, r = (q + 1) * 0.25 - 0.0175;
      const al = Math.max(lo(a), l), ar = Math.min(hi(a), r), bl = Math.max(lo(b), l), br = Math.min(hi(b), r);
      if (ar - al < 1e-4 && br - bl < 1e-4) continue;
      const w0 = Math.max(0, ar - al), w1 = Math.max(0, br - bl);
      quad([al, ya, a], [bl, yb, b], [bl + w1, yb, b], [al + w0, ya, a],
        shade(q & 1 ? boardA : boardB, 0.92 + hs(q, Math.floor(Math.min(a, b) - B.stern), 499) * 0.14));
    }
  };
  take('hull', () => {
    // Exact gangway stations make both 0.7 m rail openings explicit.
    const vs = Array.from({ length: 25 }, (_, k) => B.stern + (B.bow - B.stern) * k / 24);
    vs.push(B.gangV - 0.35, B.gangV + 0.35);
    vs.sort((a, b) => a - b);
    const gap = (a, b) => a >= B.gangV - 0.350001 && b <= B.gangV + 0.350001;
    const ys = v => [GH(v), 0, ...[0.18, 0.36, 0.54, 0.78, 1].map(f => KEEL(v) * f)];
    for (let k = 0; k < vs.length - 1; k++) {
      const a = vs[k], b = vs[k + 1], ya = ys(a), yb = ys(b), open = gap(a, b);
      if (b - a < 1e-6) continue;
      for (const s of [-1, 1]) {
        for (let j = 0; j < ya.length - 1; j++) {
          if (j === 0 && open) continue;
          const p = (v, y) => [s * sidePoint(v, y), y, v];
          quad(p(a, ya[j]), p(b, yb[j]), p(b, yb[j + 1]), p(a, ya[j + 1]), shade(strakes[j], 0.94 + hs(k, j + (s > 0 ? 11 : 0), 496) * 0.1));
        }
        // Narrow dark seams, broad readable strakes below the paint.
        for (let j = 2; j < ya.length - 1; j++) {
          const p = (v, y) => [s * (sidePoint(v, y) + 0.004), y, v];
          quad(p(a, ya[j] + 0.009), p(b, yb[j] + 0.009), p(b, yb[j] - 0.009), p(a, ya[j] - 0.009), C.dark);
        }
        if (!open) {
          // Inner bulwark and cap close the shell's thickness.
          const ha = HB(a), hb = HB(b), ga = GH(a), gb = GH(b);
          quad([s * ha, 0, a], [s * hb, 0, b], [s * hb, gb, b], [s * ha, ga, a], C.wood);
          quad([s * ha, ga, a], [s * hb, gb, b], [s * (hb + 0.055), gb, b], [s * (ha + 0.055), ga, a], C.cap);
          seg(G.box, C.cap, [s * (ha + 0.04), ga, a], [s * (hb + 0.04), gb, b], 0.035);
          // One continuous pinstripe below the cap.
          quad([s * (sidePoint(a, ga - 0.09) + 0.004), ga - 0.09, a], [s * (sidePoint(b, gb - 0.09) + 0.004), gb - 0.09, b],
            [s * (sidePoint(b, gb - 0.12) + 0.004), gb - 0.12, b], [s * (sidePoint(a, ga - 0.12) + 0.004), ga - 0.12, a], C.gold);
        }
      }
      // the deck's boards, as the wood floor's (v499)
      boards(a, b, 0, 0, v => -HB(v), v => HB(v));
    }
    // Close rail ends without putting a threshold across either gangway.
    for (const v of [B.gangV - 0.35, B.gangV + 0.35]) for (const s of [-1, 1]) {
      const h = HB(v), y = GH(v);
      quad([s * h, 0, v], [s * (h + 0.04), 0, v], [s * (h + 0.055), y, v], [s * h, y, v], C.cap);
    }
    // Raised external ribs echo the half-timbered buildings. They stay outside the deck.
    for (const v of [-3.9, -2.9, -1.9, -0.9, 0.65, 1.7, 2.7, 3.55]) for (const s of [-1, 1]) {
      const y = GH(v), low = -0.67;
      seg(G.box, C.edge, [s * (sidePoint(v, low) + 0.015), low, v], [s * (sidePoint(v, y - 0.04) + 0.015), y - 0.04, v], 0.023);
    }
    // Solid transom, restrained stern lights, and a carved diamond crest.
    const st = B.stern;
    for (const v of [st, B.bow]) {
      const levels = ys(v);
      for (let j = 0; j < levels.length - 1; j++) {
        const u = sidePoint(v, levels[j]), l = sidePoint(v, levels[j + 1]);
        quad([-u, levels[j], v], [u, levels[j], v], [l, levels[j + 1], v], [-l, levels[j + 1], v], strakes[j]);
      }
    }
    part(G.box, C.cap, 0, GH(st), st, { sx: HB(st) * 2 + 0.11, sy: 0.065, sz: 0.065 });
    for (const x of [-0.57, 0.57]) {
      part(G.box, C.dark, x, -0.25, st - 0.018, { sx: 0.38, sy: 0.31, sz: 0.035 });
      part(G.box, '#718b83', x, -0.25, st - 0.04, { sx: 0.29, sy: 0.22, sz: 0.016 });
      part(G.box, C.gold, x, -0.25, st - 0.055, { sx: 0.027, sy: 0.23, sz: 0.02 });
      part(G.box, C.gold, x, -0.25, st - 0.055, { sx: 0.29, sy: 0.025, sz: 0.02 });
    }
    // (v518/v519, Jordan) the boat's name goes across the transom's band where the diamond crest was ('name', below);
    // with no name (or nowhere to draw it), the crest
    if (!L.name || typeof document === 'undefined') part(G.box, C.gold, 0, 0.19, st - 0.045, { sx: 0.19, sy: 0.19, sz: 0.035, rz: Math.PI / 4 });
    // Stem and compact bowsprit; no furniture on the walking plane.
    seg(G.box, C.dark, [0, KEEL(B.bow), B.bow], [0, GH(B.bow) + 0.2, B.bow + 0.055], 0.035);
    const sprit = [0, 1.7, B.bow + 1.65];
    seg(G.cyl8, C.cap, [0, 0.7, B.bow - 0.3], sprit, 0.065);
    for (const m of B.masts) {
      seg(G.frust7, C.wood, [0, -0.25, m.v], [0, m.h, m.v], 0.155);
      // Mast partners fit comfortably within the existing radius-0.42 obstacle.
      part(G.cyl8, C.dark, 0, 0.09, m.v, { sx: 0.48, sy: 0.18, sz: 0.48 });
      for (const y of [0.32, m.h * 0.59, m.h * 0.85]) part(G.cyl8, C.iron, 0, y, m.v, { sx: y < 1 ? 0.31 : 0.22, sy: 0.055, sz: y < 1 ? 0.31 : 0.22 });
      part(G.box, C.dark, 0, m.h * 0.64, m.v, { sx: 0.65, sy: 0.09, sz: 0.5 });
      for (const [y, w] of brigYards(m)) {
        seg(G.cyl8, C.dark, [-w / 2, y, m.v + 0.14], [w / 2, y, m.v + 0.14], 0.055);
        for (const s of [-1, 1]) seg(G.cyl6, C.rope, [0, y + 0.6, m.v], [s * w * 0.46, y, m.v + 0.14], 0.01);
      }
      for (const s of [-1, 1]) for (const dv of [-0.26, 0.2]) {
        const v = m.v + dv;
        seg(G.cyl6, C.rope, [s * (HB(v) + 0.05), GH(v), v], [0, m.h * 0.86, m.v], 0.012);
      }
      part(G.oct, C.gold, 0, m.h + 0.04, m.v, { sx: 0.14, sy: 0.19, sz: 0.14 });
    }
    const [fore, main] = B.masts;
    for (const [a, b] of [[[0, fore.h, fore.v], sprit], [[0, main.h, main.v], [0, fore.h * 0.82, fore.v]], [[0, main.h, main.v], [0, B.helmP + 0.6, B.stern + 0.08]]])
      seg(G.cyl6, C.rope, a, b, 0.012);
    // Swallowtail pennant, faceted rather than textured.
    const pn = L.pennant[2];
    quad([0, main.h, main.v], [0, main.h - 0.36, main.v], [0.06, main.h - 0.31, main.v - 0.62], [0.06, main.h - 0.03, main.v - 0.62], CC(pn));
    tri([0.06, main.h - 0.03, main.v - 0.62], [0.06, main.h - 0.17, main.v - 0.62], [0, main.h - 0.06, main.v - 1.04], shade(pn, 1.15));
    tri([0.06, main.h - 0.17, main.v - 0.62], [0.06, main.h - 0.31, main.v - 0.62], [0, main.h - 0.36, main.v - 1.04], shade(pn, 0.86));
    // the wheel's post
    part(G.box, C.dark, 0, B.wheelY / 2, B.wheelV, { sx: 0.13, sy: B.wheelY, sz: 0.13 });
    // (v496, Jordan) the helm deck behind the wheel: planked, a step face between the ramps (behind the wheel), a
    // ramp up to it either side of the wheel, and a rail round its stern and sides
    const P = B.helmP, F = B.helmFront, RV = B.rampV, RU = B.rampU;
    const hvs = [B.stern, (B.stern + F) / 2, F];
    for (let k = 0; k + 1 < hvs.length; k++) boards(hvs[k], hvs[k + 1], P, P, v => -HB(v), v => HB(v));
    quad([-RU, 0, F], [RU, 0, F], [RU, P, F], [-RU, P, F], post);
    part(G.box, rail, 0, P - 0.015, F + 0.02, { sx: RU * 2, sy: 0.04, sz: 0.05 });
    for (const sg of [-1, 1]) {
      // the ramp's top, boarded as the deck (v499) and cleated, and its inner side down to the deck
      boards(F, RV, P, 0, sg > 0 ? () => RU : v => -HB(v), sg > 0 ? v => HB(v) : () => -RU);
      for (let c = 1; c < 5; c++) { const t = c / 5, v = F + (RV - F) * t, y = P * (1 - t) + 0.02, hb = HB(v); seg(G.box, cleat, [sg * (RU + 0.04), y, v], [sg * (hb - 0.04), y, v], 0.025); }
      tri([sg * RU, 0, RV], [sg * RU, P, F], [sg * RU, 0, F], rampSide);
      part(G.box, rail, sg * RU, P / 2, F + 0.03, { sx: 0.06, sy: P, sz: 0.06 });
    }
    // its rail: posts round the stern and down each side to the platform's front
    const TR = P + 0.36, rails = [];
    for (const sg of [-1, 1]) { rails.push([]); for (const v of [F, (F + B.stern) / 2, B.stern + 0.08]) rails[rails.length - 1].push([sg * (HB(v) - 0.03), v]); }
    for (const side of rails) {
      for (const [u, v] of side) seg(G.box, post, [u, P, v], [u, TR, v], 0.05);
      for (let k = 0; k + 1 < side.length; k++) seg(G.box, rail, [side[k][0], TR, side[k][1]], [side[k + 1][0], TR, side[k + 1][1]], 0.05);
    }
    seg(G.box, rail, [rails[0][2][0], TR, rails[0][2][1]], [rails[1][2][0], TR, rails[1][2][1]], 0.05);
    // (the backstay comes down to a post at the rail's middle, clear over the head of whoever's at the wheel)
    seg(G.box, post, [0, P, B.stern + 0.08], [0, TR + 0.25, B.stern + 0.08], 0.06);
    // Lanterns sit over the stern rail, behind the permitted walking region.
    for (const s of [-1, 1]) {
      const x = s * 0.86, z = st - 0.025, y = GH(st) + 0.25;
      seg(G.box, C.iron, [x, GH(st), z], [x, y + 0.28, z], 0.019);
      part(G.box, '#d3ab5f', x, y, z, { sx: 0.14, sy: 0.19, sz: 0.14 });
      for (const dy of [-0.12, 0.12]) part(G.box, C.iron, x, y + dy, z, { sx: 0.19, sy: 0.045, sz: 0.19 });
      part(G.cone4, C.iron, x, y + 0.18, z, { sx: 0.23, sy: 0.12, sz: 0.23, ry: Math.PI / 4 });
    }
    // the cathead: a beam out over the bow's rail (v521: up from under the rail and out further, so the anchor hangs
    // clear of the water and the hull)
    part(G.box, C.dark, (0.68 + B.hawse[0] + 0.08) / 2, B.hawse[1] + 0.06, B.hawse[2], { sx: B.hawse[0] + 0.08 - 0.68, sy: 0.12, sz: 0.14 });
    part(G.box, C.dark, B.hawse[0] + 0.05, B.hawse[1] + 0.13, B.hawse[2], { sx: 0.06, sy: 0.04, sz: 0.16 });
  });
  // (v499, Jordan) the stern lanterns' glass, lit while you're at the wheel: drawn over the glass in its own glowing material
  take('glow', () => {
    for (const s of [-1, 1]) part(G.box, '#ffffff', s * 0.86, GH(B.stern) + 0.25, B.stern - 0.025, { sx: 0.15, sy: 0.2, sz: 0.15 });
  });
  // (v515, Jordan) the sails: 14 cells across, 14 down over the cloth and the foot band under them; the seams shade
  // every other cell down or across (or none), and the pattern dyes the cells it takes. Two shapes: 'sail' plain, and
  // 'sailE' with the emblem, for the two tallest sails (brigModel)
  const nu = 14, nv = 14, rowV = j => j < nv ? j / nv * 0.875 : j === nv ? 0.875 : 1;
  // Top edge stays exactly y=0, bottom exactly y=-1, for the furl animation.
  const pt = (u, v, offset = 0) => [(u - 0.5) * (0.94 + 0.06 * v), -v, 0.3 * (1 - (2 * u - 1) ** 2) * Math.sin(Math.PI * v) + offset];
  const PAT = SAIL_PATTERNS[L.pattern] || SAIL_PATTERNS.plain, dye = L.dye ? CC(L.dye[2]) : null, seam = L.seams ? L.seams[0] : 'vertical';
  const cellC = (i, j) => {
    if (j === nv) return C.band;
    const k = seam === 'vertical' ? (i % 2 ? 1 : 0.9) : seam === 'horizontal' ? (j % 2 ? 1 : 0.9) : 0.96;
    return shade(dye && PAT.at(i, j) ? dye : C.canvas, k * (0.97 + j * 0.003));
  };
  const cloth = () => {
    for (let i = 0; i < nu; i++) for (let j = 0; j <= nv; j++)
      quad(pt(i / nu, rowV(j)), pt((i + 1) / nu, rowV(j)), pt((i + 1) / nu, rowV(j + 1)), pt(i / nu, rowV(j + 1)), cellC(i, j));
  };
  take('sail', cloth);
  take('sailE', () => {
    cloth();
    // The emblem, clipped onto each cloth triangle so it follows the sail's curve (a flat decal would cut through
    // its belly): each convex piece of its rim, its field, then its charge, a little proud of the cloth on both faces
    const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const piece = (poly0, color, offset) => {
      if (poly0.length < 3) return;
      // (each piece wound the way the clip takes as inside)
      let area = 0; for (let k = 0; k < poly0.length; k++) area += cross([0, 0], poly0[k], poly0[(k + 1) % poly0.length]);
      const shape = area < 0 ? [...poly0].reverse() : poly0;
      let x0 = 1, x1 = 0, y0 = 1, y1 = 0; for (const [x, y] of shape) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      for (let i = 0; i < nu; i++) for (let j = 0; j <= nv; j++) {
        if ((i + 1) / nu < x0 || i / nu > x1 || rowV(j + 1) < y0 || rowV(j) > y1) continue;
        const a = [i / nu, rowV(j)], b = [(i + 1) / nu, rowV(j)], c = [(i + 1) / nu, rowV(j + 1)], d = [i / nu, rowV(j + 1)];
        for (const uv of [[a, b, c], [a, c, d]]) {
          let poly = uv;
          for (let k = 0; k < shape.length && poly.length; k++) {
            const p = shape[k], q = shape[(k + 1) % shape.length], next = [];
            for (let n = 0; n < poly.length; n++) {
              const u = poly[n], v = poly[(n + 1) % poly.length], du = cross(p, q, u), dv = cross(p, q, v);
              if (du >= 0) next.push(u);
              if ((du >= 0) !== (dv >= 0)) { const t = du / (du - dv); next.push([u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]); }
            }
            poly = next;
          }
          if (poly.length < 3) continue;
          const abc = uv.map(p => pt(...p)), denom = cross(...uv);
          const surface = p => {
            const w0 = cross(uv[1], uv[2], p) / denom, w1 = cross(uv[2], uv[0], p) / denom, w2 = 1 - w0 - w1;
            return abc[0].map((n, k) => n * w0 + abc[1][k] * w1 + abc[2][k] * w2 + (k === 2 ? offset : 0));
          };
          for (let k = 1; k + 1 < poly.length; k++) tri(surface(poly[0]), surface(poly[k]), surface(poly[k + 1]), color);
        }
      }
    };
    // (big on the tall sails: 0.6 of the cloth's height; across, squeezed so its shapes come out as wide as tall on
    // those sails, which are wider than they hang)
    const tall = B.masts.map(m => brigYards(m)[1]), fix = tall.reduce((s, [, w, h]) => s + h / (w * 0.95), 0) / tall.length;
    const E = EMBLEMS[L.emblem] && !EMBLEMS[L.emblem].gone ? EMBLEMS[L.emblem] : EMBLEMS.diamond, R = 0.3;
    const toUV = poly => poly.map(([x, y]) => [0.5 + x * R * fix, 0.44 + y * R]);
    const rimC = CC(L.charge[2]), fieldC = CC(L.field[2]);
    for (const face of [-1, 1]) {
      for (const p of E.field) piece(toUV(growPiece(p, 0.08)), rimC, face * 0.004);
      for (const p of E.field) piece(toUV(p), fieldC, face * 0.008);
      for (const p of E.charge) piece(toUV(p), rimC, face * 0.012);
    }
  });
  take('wheel', () => {
    const R = B.wheelR, Rh = R + 0.1, wp = (a, r) => [Math.cos(a) * r, Math.sin(a) * r, 0];
    for (let k = 0; k < 12; k++) seg(G.box, C.cap, wp(k * Math.PI / 6, R), wp((k + 1) * Math.PI / 6, R), 0.0225);
    for (let k = 0; k < 8; k++) seg(G.cyl6, C.wood, wp(k * Math.PI / 4, 0.035), wp(k * Math.PI / 4, Rh), 0.021);
    part(G.cyl8, C.gold, 0, 0, 0, { sx: 0.1, sy: 0.07, sz: 0.1, rx: Math.PI / 2 });
  });
  take('furl', () => {
    part(G.cyl8, C.canvasShade, 0, 0, 0, { sx: 1, sy: 1, sz: 1, rz: Math.PI / 2 });
    for (const x of [-0.32, 0, 0.32]) part(G.cyl8, C.rope, x, 0, 0, { sx: 1.035, sy: 0.025, sz: 1.035, rz: Math.PI / 2 });
  });
  take('anchor', () => {
    // Ring top at the local origin; all metal hangs below it.
    for (let k = 0; k < 8; k++) { const p = a => [Math.cos(a) * 0.065, -0.065 + Math.sin(a) * 0.065, 0]; seg(G.cyl6, C.iron, p(k * Math.PI / 4), p((k + 1) * Math.PI / 4), 0.013); }
    seg(G.cyl6, C.iron, [0, -0.12, 0], [0, -0.85, 0], 0.035);
    part(G.box, C.dark, 0, -0.23, 0, { sx: 0.055, sy: 0.065, sz: 0.52 });
    for (const s of [-1, 1]) {
      seg(G.cyl6, C.iron, [0, -0.85, 0], [s * 0.32, -0.72, 0], 0.035);
      seg(G.cyl6, C.iron, [s * 0.32, -0.72, 0], [s * 0.4, -0.54, 0], 0.032);
      part(G.cone4, C.iron, s * 0.38, -0.57, 0, { sx: 0.18, sy: 0.2, sz: 0.12, rz: -s * 0.4 });
    }
  });
  // (v517, Jordan) one link of the anchor chain, its top at the origin, CHAIN.pitch long: an oval of iron in the xy
  // plane (hangChain turns every other one a quarter round)
  take('chain', () => {
    const { len, wide, wire } = CHAIN, n = 10, r = (wide - wire) / 2, mid = (len - wire) / 2;
    const at = k => { const t = k / n * Math.PI * 2; return [Math.sin(t) * r, -mid + Math.cos(t) * mid, 0]; };
    for (let k = 0; k < n; k++) seg(G.box, C.iron, at(k), at(k + 1), wire);
  });
  take('plank', () => {
    // No raised rungs: the entire walking surface is flush at local y=0.
    part(G.box, C.dark, 0.5, -0.059, 0, { sx: 1, sy: 0.062, sz: 0.62 });
    for (let j = 0; j < 4; j++) part(G.box, shade(deckC, j % 2 ? 1.52 : 1.8), 0.5, -0.014, -0.2325 + j * 0.155, { sx: 1, sy: 0.028, sz: 0.145 });
  });
  sailSlopes(made.sail, BRIG_SAIL_Z); sailSlopes(made.sailE, BRIG_SAIL_Z);
  // (v519) the name's plate: a quad over the transom's band, a hair proud of it, mapped to the name's texture (seen
  // from astern, so its u runs toward -x); its texture and material ride along with the shapes
  made.nameTex = L.name ? nameTexture(L.name, L.trim[2]) : null;
  if (made.nameTex) {
    const P = NAME_PLATE, z = B.stern - 0.012, g = new GFX.BufferGeometry();
    g.setAttribute('position', new GFX.BufferAttribute(new Float32Array([P.hw, P.y1, z, -P.hw, P.y1, z, -P.hw, P.y0, z, P.hw, P.y1, z, -P.hw, P.y0, z, P.hw, P.y0, z]), 3));
    g.setAttribute('nUV', new GFX.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 2));
    made.name = g; made.nameMat = makeNameMat(made.nameTex);
  }
  return made;
}

// (v517) the anchor chain: links len long (pitch apart, so each runs through the next), wide across, of wire this thick
export const CHAIN = { len: 0.13, pitch: 0.095, wide: 0.075, wire: 0.018 };
const chainAt = new GFX.Matrix4();
// the chain hung from the hawse down `len` to the anchor's ring: enough links for it, every other one turned a quarter
export function hangChain(chainM, len) {
  const n = Math.max(0, Math.ceil(Math.max(0, len - CHAIN.len * 0.5) / CHAIN.pitch));
  chainM.reserve(n);
  for (let i = 0; i < n; i++) {
    const y = -i * CHAIN.pitch;
    if (i % 2) chainAt.set(0, 0, 1, 0, 0, 1, 0, y, -1, 0, 0, 0, 0, 0, 0, 1); else chainAt.set(1, 0, 0, 0, 0, 1, 0, y, 0, 0, 1, 0, 0, 0, 0, 1);
    chainM.setMatrixAt(i, chainAt);
  }
  chainM.count = n; chainM.needsUpdate = true;
}
// a boat's model from its shapes S: hull, a sail and furl roll on each yard, anchor and chain, gangplank, wheel, the
// lanterns' glass; mats { boat, sail, glow }. Returns { g, sails, furls, anchorM, chainM, plankG, plankM, wheelM, glowM }.
export function brigModel(S, B, mats) {
  const g = new GFX.Group();
  const lit = m => { m.castShadow = m.receiveShadow = true; return m; };
  const mesh = geo => lit(new GFX.Mesh(geo, mats.boat));
  g.add(mesh(S.hull));
  const sails = [], furls = [];
  // (v515: the emblem on the two tallest sails only)
  const hs = B.masts.flatMap(m => brigYards(m).map(y => y[2])).sort((a, b) => b - a), tallest = hs[Math.min(1, hs.length - 1)];
  for (const m of B.masts) for (const [y, w, hgt] of brigYards(m)) {
    const s = lit(new GFX.Mesh(hgt >= tallest && S.sailE ? S.sailE : S.sail, mats.sail)); s.position.set(0, y - 0.04, m.v + 0.2); s.scale.set(w, hgt, 1); s.userData.h0 = hgt; g.add(s); sails.push(s);
    const f = mesh(S.furl); f.position.set(0, y - 0.07, m.v + 0.22); f.scale.set(w * 0.94, 0.2, 0.2); g.add(f); furls.push(f);
  }
  const anchorM = mesh(S.anchor); anchorM.position.set(B.hawse[0], B.anchorUp, B.hawse[2]); anchorM.rotation.y = B.anchorTurn; g.add(anchorM);
  const chainM = lit(new GFX.InstancedMesh(S.chain, mats.boat, 64)); chainM.position.set(...B.hawse); g.add(chainM);
  hangChain(chainM, B.hawse[1] - B.anchorUp);
  const plankG = new GFX.Group(), plankM = mesh(S.plank); plankG.add(plankM); g.add(plankG);
  const wheelM = mesh(S.wheel); wheelM.position.set(0, B.wheelY, B.wheelV - 0.1); g.add(wheelM);
  // (v519) the name across the transom
  const nameM = S.name && S.nameMat ? new GFX.Mesh(S.name, S.nameMat) : null;
  if (nameM) { nameM.receiveShadow = true; g.add(nameM); }
  const glowM = S.glow && mats.glow ? new GFX.Mesh(S.glow, mats.glow) : null;
  if (glowM) { glowM.visible = false; g.add(glowM); }
  return { g, sails, furls, anchorM, chainM, plankG, plankM, wheelM, glowM };
}
