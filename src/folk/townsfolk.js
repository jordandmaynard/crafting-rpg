// Ambient townsfolk (design study, not in the game yet): a seed makes a design (body, skin, hair, and a cloth item
// in each of the head, torso, legs and feet slots, each in a dyed tint), and the design is built on the hero's rig:
// the same blocky boxes and the same joints (hip, knee, ankle, shoulder, elbow, wrist, waist, neck), in a masculine
// or a feminine build. The same seed always gives the same person, so a design worth keeping is just its number.
//
//   const F = makeFolkKit(GFX);
//   const d = F.design(1234);          // plain data: what they wear and in what colours
//   const f = F.build(d);              // { g, body, chest, head, legL, legR, knees, ankles, armL, armR, elbows, wrists, ... }
//   F.pose(f, 'walk', t);              // idle, walk, talk, wave, carry, sweep
//
// Sizes are the hero's (makeHuman, unscaled, feet on y 0, facing +z), so a townsperson stands as tall as the hero.

// ---------- seeded randomness ----------
export function folkRand(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// a weighted pick from [[value, weight], ...]
const pick = (r, list) => {
  let s = 0; for (const [, w] of list) s += w;
  let u = r() * s;
  for (const [v, w] of list) { u -= w; if (u < 0) return v; }
  return list[list.length - 1][0];
};

// ---------- colours ----------
export const SKIN = ['#f4d4b4', '#ecc49c', '#e0b48a', '#d0a07a', '#b8865e', '#9a6a46', '#7a5034', '#5a3824'];
export const HAIR = { black: '#1c1612', darkBrown: '#36231a', brown: '#5e3a22', chestnut: '#7a4424', auburn: '#94421e', ginger: '#c06a2e',
  blonde: '#d6b066', flaxen: '#e6d6a6', grey: '#8e8c88', white: '#dedcd6' };
// The dyes a town could make: undyed cloth, earth browns, madder reds, weld yellows, woad blues, and a few rarer ones.
// (weights: how often a garment comes out that colour)
export const DYES = {
  linen: ['#dcd0b4', 6], wool: ['#b6a888', 5], oat: ['#c8b48c', 4], brown: ['#6a4a32', 6], umber: ['#4e3826', 4],
  russet: ['#8a3e26', 4], madder: ['#a8302a', 3], rose: ['#c06e66', 2], ochre: ['#c0923a', 3], weld: ['#d0b44c', 2],
  moss: ['#5e6a34', 4], green: ['#3a6438', 3], teal: ['#2e6464', 2], woad: ['#3f6a8a', 4], navy: ['#2a3a5a', 3],
  grey: ['#6c6a66', 4], charcoal: ['#383634', 3], plum: ['#5a3050', 1], lilac: ['#8a7098', 1],
};
const LEATHER = ['#3a2a1e', '#4e3220', '#5e3e26', '#6e4426', '#2c241e'];
const STRAW = '#d8bc72', STRAW_DARK = '#a88a48';
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const rgbHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
// lighter (k > 0) or darker (k < 0)
export const shade = (h, k) => rgbHex(hexRgb(h).map(v => k >= 0 ? v + (1 - v) * k : v * (1 + k)));
// the same dye never comes out quite the same twice: a little lighter or darker, a little warmer or cooler
const jitter = (r, h, amt = 0.07) => {
  const l = (r() * 2 - 1) * amt, w = (r() * 2 - 1) * amt * 0.5, c = hexRgb(h);
  return rgbHex([c[0] * (1 + l + w), c[1] * (1 + l), c[2] * (1 + l - w)]);
};
const dyeList = Object.entries(DYES).map(([k, [, w]]) => [k, w]);
const dye = (r, avoid = []) => { let k; for (let n = 0; n < 8; n++) { k = pick(r, dyeList); if (!avoid.includes(k)) break; } return k; };

// ---------- the design ----------
// What a slot can hold, for each build ([item, weight]). Torso 'dress' also fills the legs with its skirt.
export const SLOTS = {
  head: {
    masc: [['none', 9], ['hood', 3], ['cap', 4], ['strawHat', 3], ['kerchief', 1]],
    fem: [['none', 8], ['hood', 3], ['kerchief', 4], ['coif', 3], ['strawHat', 2], ['cap', 1]],
  },
  torso: {
    masc: [['shirt', 5], ['shortSleeve', 3], ['tunic', 5], ['vest', 4]],
    fem: [['blouse', 3], ['bodice', 5], ['dress', 5], ['tunic', 2], ['shortSleeve', 1]],
  },
  legs: {
    masc: [['trousers', 6], ['breeches', 4]],
    fem: [['skirt', 4], ['longSkirt', 5], ['trousers', 2], ['breeches', 1]],
  },
  feet: {
    masc: [['boots', 5], ['shoes', 4], ['wraps', 2]],
    fem: [['shoes', 5], ['boots', 4], ['wraps', 2]],
  },
};
export const HAIR_STYLES = {
  masc: [['short', 6], ['crop', 4], ['bald', 2], ['shaggy', 3], ['ponytail', 1], ['long', 1]],
  fem: [['long', 5], ['bob', 3], ['bun', 4], ['braid', 4], ['ponytail', 3], ['short', 1]],
};
export function design(seed) {
  const r = folkRand(seed);
  const body = r() < 0.5 ? 'masc' : 'fem';
  const age = pick(r, [['young', 4], ['adult', 6], ['old', 2]]);
  const d = { seed, body, age };
  d.height = 0.95 + r() * 0.1;
  d.build = body === 'masc' ? 0.96 + r() * 0.12 : 0.95 + r() * 0.08;
  d.skin = jitter(r, SKIN[Math.floor(r() * SKIN.length)], 0.03);
  const hk = age === 'old' ? pick(r, [['grey', 5], ['white', 4], ['darkBrown', 1]])
    : pick(r, [['black', 4], ['darkBrown', 5], ['brown', 5], ['chestnut', 3], ['auburn', 2], ['ginger', 1], ['blonde', 2], ['flaxen', 1]]);
  d.hairName = hk; d.hair = jitter(r, HAIR[hk], 0.04);
  d.hairStyle = pick(r, HAIR_STYLES[body]);
  if (age === 'old' && body === 'masc' && r() < 0.35) d.hairStyle = 'bald';
  d.beard = body === 'masc' && age !== 'young' ? pick(r, [['none', 5], ['stubble', 2], ['moustache', 2], ['full', 3]]) : 'none';
  // each slot's item, and its dye (kept apart from its neighbours' so the outfit reads)
  const used = [];
  const cloth = (avoid = used) => { const k = dye(r, avoid); used.push(k); return { dye: k, color: jitter(r, DYES[k][0]) }; };
  d.head = { item: pick(r, SLOTS.head[body]) };
  d.torso = { item: pick(r, SLOTS.torso[body]) };
  d.legs = { item: d.torso.item === 'dress' ? 'dress' : pick(r, SLOTS.legs[body]) };
  d.feet = { item: pick(r, SLOTS.feet[body]) };
  Object.assign(d.torso, cloth());
  // the shirt or blouse under a vest or bodice: mostly undyed
  if (['vest', 'bodice'].includes(d.torso.item)) d.torso.under = r() < 0.7 ? { dye: 'linen', color: jitter(r, DYES.linen[0]) } : cloth();
  d.torso.trim = r() < 0.5 ? shade(d.torso.color, -0.35) : cloth().color;
  if (d.legs.item === 'dress') Object.assign(d.legs, { dye: d.torso.dye, color: d.torso.color });
  else Object.assign(d.legs, cloth());
  d.legs.stockings = r() < 0.6 ? jitter(r, pick(r, [[DYES.linen[0], 3], [DYES.wool[0], 3], [DYES.grey[0], 1], [DYES.umber[0], 1]])) : shade(d.legs.color, -0.25);
  if (d.head.item !== 'none') Object.assign(d.head, d.head.item === 'strawHat' ? { dye: 'straw', color: jitter(r, STRAW, 0.05), band: cloth().color } : cloth());
  d.feet.color = d.feet.item === 'wraps' ? cloth().color : jitter(r, LEATHER[Math.floor(r() * LEATHER.length)], 0.05);
  d.feet.sole = shade(d.feet.color, -0.4);
  d.belt = d.torso.item === 'dress' ? (r() < 0.6 ? { color: cloth().color, sash: true } : null)
    : d.torso.item === 'tunic' || r() < 0.55 ? { color: jitter(r, LEATHER[Math.floor(r() * LEATHER.length)], 0.05), buckle: r() < 0.5 } : null;
  // extras over the slots: an apron, a shawl, a neckerchief
  d.apron = r() < (body === 'fem' ? 0.35 : 0.2) ? { color: r() < 0.6 ? jitter(r, pick(r, [[DYES.linen[0], 3], ['#ece6d8', 2]])) : cloth().color, bib: r() < 0.5 } : null;
  d.shawl = body === 'fem' && d.head.item !== 'hood' && r() < 0.2 ? { color: cloth().color } : null;
  d.neckerchief = body === 'masc' && d.head.item !== 'hood' && r() < 0.18 ? { color: cloth().color } : null;
  d.eyes = pick(r, [['#1e1814', 6], ['#2a3a5a', 2], ['#3a4a2a', 2], ['#4a3020', 2]]);
  return d;
}
// a design in words, for the viewer's readout
export function describe(d) {
  const nice = s => s.replace(/([A-Z])/g, ' $1').toLowerCase();
  const rows = [
    ['Body', `${d.body === 'fem' ? 'feminine' : 'masculine'}, ${d.age}, height ${d.height.toFixed(2)}`],
    ['Hair', `${nice(d.hairStyle)}, ${nice(d.hairName)}${d.beard !== 'none' ? ', ' + nice(d.beard) + (d.beard === 'full' ? ' beard' : '') : ''}`, d.hair],
    ['Head', d.head.item === 'none' ? 'nothing' : `${nice(d.head.item)}${d.head.dye ? ', ' + d.head.dye : ''}`, d.head.color],
    ['Torso', `${nice(d.torso.item)}, ${d.torso.dye}${d.torso.under ? ' over ' + d.torso.under.dye : ''}`, d.torso.color],
    ['Legs', d.legs.item === 'dress' ? 'the dress\'s skirt' : `${nice(d.legs.item)}, ${d.legs.dye}`, d.legs.color],
    ['Feet', `${nice(d.feet.item)}`, d.feet.color],
  ];
  const extra = [d.apron && 'apron', d.shawl && 'shawl', d.neckerchief && 'neckerchief', d.belt && (d.belt.sash ? 'sash' : 'belt')].filter(Boolean);
  if (extra.length) rows.push(['Extras', extra.join(', ')]);
  return rows;
}

// ---------- the build ----------
export function makeFolkKit(GFX) {
  const mats = new Map();
  const mat = c => { let m = mats.get(c); if (!m) { m = new GFX.MeshStandardMaterial({ color: c, flatShading: true, roughness: 1, metalness: 0 }); mats.set(c, m); } return m; };
  const shadowMat = new GFX.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.32, depthWrite: false });
  const shadowGeo = new GFX.CircleGeometry(0.28, 10).rotateX(-Math.PI / 2);

  function build(d) {
    const g = new GFX.Group(), parts = [];
    // (v3: each box a hair bigger than the one before, cycling every 17, in a step that's no round number so it never
    // lands back on the hand-set sizes: two boxes whose faces would lie in one plane never do, so pieces that meet
    // flush don't z-fight. At most 6 mm. Check with the scratchpad's t_zfight.mjs, which scans seeds 1-3000.)
    let nBox = 0;
    const box = (parent, w, h, dd, x, y, z, c, rx = 0, rz = 0, ry = 0) => {
      const e = 0.00037 * (nBox++ % 17);
      const m = new GFX.Mesh(new GFX.BoxGeometry(w + e, h + e, dd + e), mat(c)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); parts.push(m); return m;
    };
    // (v4, Jordan: angled shapes for the feminine build) a tapered block: its bottom face at y0 (width wb, depth db,
    // centred on xb, zb) and its top at y1 (wt, dt, at xt, zt), straight sides between: a box whose top is a different
    // size, or set off, from its bottom. The renderer shades each face flat from its own slope.
    const taper = (parent, y0, y1, [wb, db, xb = 0, zb = 0], [wt, dt, xt = 0, zt = 0], c) => {
      const e = 0.00037 * (nBox++ % 17), geo = new GFX.BoxGeometry(1, 1, 1);
      geo._transform(v => {
        const top = v.y > 0, w = (top ? wt : wb) + e, dd = (top ? dt : db) + e;
        v.set(v.x * w + (top ? xt : xb), top ? y1 + e / 2 : y0 - e / 2, v.z * dd + (top ? zt : zb));
      });
      const m = new GFX.Mesh(geo, mat(c)); parent.add(m); parts.push(m); return m;
    };
    const pivot = (parent, x, y, z) => { const p = new GFX.Group(); p.position.set(x, y, z); parent.add(p); return p; };
    const fem = d.body === 'fem', T = d.torso, L = d.legs, skin = d.skin;
    // the build: shoulders, waist and hips across, the chest's depth, a limb's thickness
    const B = fem ? { sh: 0.24, wa: 0.21, hip: 0.27, dep: 0.15, legX: 0.064, leg: 0.088, arm: 0.068, shoulder: 0.152 }
      : { sh: 0.28, wa: 0.27, hip: 0.29, dep: 0.16, legX: 0.07, leg: 0.1, arm: 0.08, shoulder: 0.175 };
    const skirted = ['skirt', 'longSkirt', 'dress'].includes(L.item);
    const hem = L.item === 'skirt' ? 0.17 : 0.07;
    const upper = T.under ? T.under.color : T.color;      // (the sleeves: the shirt's under a vest or bodice)

    const body = pivot(g, 0, 0, 0);
    // ---- legs: hip, knee, ankle (the hero's joints) ----
    const legL = pivot(body, B.legX, 0.36, 0), legR = pivot(body, -B.legX, 0.36, 0), KNEE = -0.14, ANKLE = -0.3;
    const knees = [], ankles = [];
    const thighC = skirted ? L.stockings : L.color;
    const shinC = skirted || L.item === 'breeches' ? L.stockings : L.color;
    for (const leg of [legL, legR]) {
      box(leg, B.leg, -KNEE, B.leg + 0.01, 0, KNEE / 2, 0, thighC);
      const shin = pivot(leg, 0, KNEE, 0); knees.push(shin);
      box(shin, B.leg - 0.004, 0.12, B.leg + 0.006, 0, -0.04, 0, shinC);
      // breeches end in a band just under the knee
      if (L.item === 'breeches') box(shin, B.leg + 0.008, 0.045, B.leg + 0.018, 0, -0.015, 0, shade(L.color, -0.2));
      const foot = pivot(shin, 0, ANKLE - KNEE, 0); ankles.push(foot);
      const F = d.feet;
      if (F.item === 'boots') {
        box(foot, B.leg + 0.01, 0.13, 0.15, 0, 0.005, 0.015, F.color);
        box(foot, B.leg + 0.025, 0.035, 0.155, 0, 0.06, 0.01, shade(F.color, -0.3));
      } else if (F.item === 'shoes') {
        box(foot, B.leg - 0.006, 0.09, B.leg + 0.004, 0, 0.03, 0, shinC);              // the ankle, in stocking or trouser
        box(foot, B.leg + 0.006, 0.06, 0.15, 0, -0.03, 0.018, F.color);
        box(foot, B.leg + 0.008, 0.015, 0.155, 0, -0.053, 0.018, F.sole);
      } else {
        // cloth foot wraps, bound with two darker bands
        box(foot, B.leg, 0.11, 0.14, 0, -0.005, 0.015, F.color);
        for (const y of [0.0, 0.035]) box(foot, B.leg + 0.006, 0.014, B.leg + 0.012, 0, y, 0, shade(F.color, -0.35));
        box(foot, B.leg + 0.006, 0.014, 0.145, 0, -0.045, 0.015, shade(F.color, -0.35));
      }
    }
    // ---- hips and waist ----
    const hipC = skirted ? L.color : T.item === 'tunic' ? T.color : L.color;
    // the feminine torso narrows from the hips to the waist and widens again to the shoulders; torsoAt(y) gives its
    // width and depth at a height (chest pieces), hipAt(y) the hips'
    const lerp = (a, b, u) => a + (b - a) * u, clampU = u => Math.max(0, Math.min(1, u));
    const HIP = { y0: 0.3, y1: 0.44, w0: B.hip + 0.01, d0: B.dep + 0.02, w1: B.wa - 0.005, d1: B.dep - 0.012 };
    const TOR = { y0: 0.41, y1: 0.67, w0: B.wa - 0.005, d0: B.dep - 0.012, w1: B.sh, d1: B.dep };
    const at = (P, y) => { const u = clampU((y - P.y0) / (P.y1 - P.y0)); return [lerp(P.w0, P.w1, u), lerp(P.d0, P.d1, u)]; };
    const torsoAt = y => at(TOR, y), hipAt = y => at(HIP, y);
    if (fem) taper(body, HIP.y0, HIP.y1, [HIP.w0, HIP.d0], [HIP.w1, HIP.d1], hipC);
    else box(body, B.hip, 0.09, B.dep + 0.01, 0, 0.36, 0, hipC);
    // skirts and the tunic's tails hang in a left and a right half, each swinging with its leg a little (so the
    // legs never come through), a little wider at the hem
    const flaps = [];
    // (v4) each half a tapered block: from the waist, flaring out and forward to the hem, its inner edge on the middle
    // line (the right half a touch deeper where they overlap, so the two never z-fight)
    const SK = { top: fem ? 0.43 : 0.41 };
    const skirtAt = (y, P) => { const u = clampU((SK.top - y) / (SK.top - P.bottom)); return [lerp(P.wt, P.wb, u), lerp(P.dt, P.db, u)]; };
    let skirtP = null;
    const skirtHalves = (color, bottom, flare) => {
      const wt = fem ? hipAt(SK.top)[0] / 2 + 0.012 : B.hip / 2 + 0.008, dt = fem ? hipAt(SK.top)[1] + 0.016 : B.dep + 0.03;
      const P = skirtP = { bottom, wt, dt, wb: wt + flare * 0.5, db: dt + flare };
      for (const s of [1, -1]) {
        const off = 0.05, p = pivot(body, s * off, 0.4, 0); flaps.push(p);
        const dz = s > 0 ? 0.004 : 0, cx = w => s * (w / 2 - off - 0.004);
        const yt = SK.top - 0.4, yb = bottom - 0.4;
        taper(p, yb + 0.02, yt, [P.wb, P.db + dz, cx(P.wb)], [P.wt, P.dt + dz, cx(P.wt)], color);
        // a darker hem band, standing a hair proud of the skirt
        const [w1, d1] = skirtAt(bottom + 0.028, P);
        taper(p, yb, yb + 0.028, [P.wb + 0.006, P.db + 0.006 + dz, cx(P.wb + 0.006)], [w1 + 0.006, d1 + 0.006 + dz, cx(w1 + 0.006)], shade(color, -0.22));
      }
    };
    if (skirted) skirtHalves(L.color, hem, L.item === 'skirt' ? 0.07 : L.item === 'dress' ? 0.12 : 0.1);
    else if (T.item === 'tunic') skirtHalves(T.color, 0.25, 0.02);
    // ---- the chest (the waist pivot) ----
    const chest = pivot(body, 0, 0.42, 0), CH = 0.42;
    const torsoC = T.item === 'vest' || T.item === 'bodice' ? T.under.color : T.color;
    // upper chest across the shoulders, the lower narrower at the waist
    if (fem) {
      // (v4) one tapered block from the waist up to the shoulders, and the bust a wedge on its front: sloping out and
      // down from the chest to an undercut, flat underside
      taper(chest, TOR.y0 - CH, TOR.y1 - CH, [TOR.w0, TOR.d0], [TOR.w1, TOR.d1], torsoC);
      const f0 = torsoAt(0.505)[1] / 2, f1 = torsoAt(0.625)[1] / 2;
      taper(chest, 0.505 - CH, 0.625 - CH, [B.sh - 0.035, 0.07, 0, f0 + 0.03], [B.sh - 0.03, 0.02, 0, f1 - 0.006], torsoC);
    } else {
      box(chest, B.sh, 0.16, B.dep, 0, 0.59 - CH, 0, torsoC);
      box(chest, B.wa, 0.16, B.dep - 0.006, 0, 0.45 - CH, 0, torsoC);
    }
    // the front of the chest at a height (for the pieces laid on it)
    const frontAt = y => (fem ? torsoAt(y)[1] : y > 0.51 ? B.dep : B.dep - 0.006) / 2;
    if (T.item === 'vest') {
      // a sleeveless vest, open down the front over the shirt, with two buttons each side
      for (const s of [1, -1]) {
        // (v3: a hair taller than the shirt under it, so their tops never share a plane)
        box(chest, B.sh / 2 - 0.02, 0.17, B.dep + 0.012, s * (B.sh / 4 + 0.01), 0.593 - CH, 0, T.color);
        box(chest, B.wa / 2 - 0.02, 0.17, B.dep + 0.006, s * (B.wa / 4 + 0.01), 0.45 - CH, 0, T.color);
        for (const y of [0.5, 0.58]) box(chest, 0.018, 0.018, 0.008, s * 0.035, y - CH, B.dep / 2 + 0.009, T.trim);
      }
    } else if (T.item === 'bodice') {
      // a laced bodice from the bust to the waist over a blouse
      if (fem) {
        // (v4) following the torso's taper, up to just under the bust
        const [w0, d0] = torsoAt(0.4), [w1, d1] = torsoAt(0.53);
        taper(chest, 0.4 - CH, 0.53 - CH, [w0 + 0.014, d0 + 0.012], [w1 + 0.014, d1 + 0.012], T.color);
      } else {
        box(chest, B.wa + 0.012, 0.2, B.dep + 0.008, 0, 0.47 - CH, 0, T.color);
        box(chest, B.sh - 0.04, 0.05, B.dep + 0.004, 0, 0.555 - CH, 0, T.color);
      }
      for (const y of [0.42, 0.47, 0.51]) for (const s of [1, -1]) box(chest, 0.05, 0.008, 0.006, 0, y - CH, frontAt(y) + 0.011, T.trim, 0, s * 0.6);
    } else if (T.item === 'dress') {
      // a square neckline in the trim
      box(chest, 0.11, 0.02, 0.006, 0, 0.645 - CH, frontAt(0.645) + 0.003, T.trim);
    } else if (T.item === 'tunic' || T.item === 'shirt') {
      // a slit neck, laced
      box(chest, 0.03, 0.07, 0.006, 0, 0.625 - CH, frontAt(0.625) + 0.003, shade(T.color, -0.3));
    }
    // the bust's front at a height (feminine), for what lies over it
    const bustFront = y => lerp(torsoAt(0.505)[1] / 2 + 0.065, torsoAt(0.625)[1] / 2 + 0.004, clampU((y - 0.505) / 0.12));
    // the skirt's front at a height, for the sash and apron over it
    const skirtFront = y => skirtP ? skirtAt(y, skirtP)[1] / 2 + 0.004 : 0;
    if (d.belt) {
      const bw = fem ? hipAt(0.4)[0] + 0.012 : B.wa + 0.022, bd = fem ? hipAt(0.4)[1] + 0.02 : B.dep + 0.016;
      box(body, bw, d.belt.sash ? 0.05 : 0.04, bd, 0, 0.42, 0, d.belt.color);
      if (d.belt.sash) box(body, 0.04, 0.12, 0.012, B.wa / 4, 0.36, Math.max(bd / 2, skirtFront(0.36)) + 0.008, d.belt.color, skirtP ? -0.08 : 0);
      else if (d.belt.buckle) box(body, 0.04, 0.045, 0.012, 0, 0.42, bd / 2 + 0.006, '#c8a048');
    }
    // the apron: a skirt panel on the body that swings with the leg ahead, and maybe a bib on the chest
    let apron = null;
    if (d.apron) {
      const bottom = skirted ? hem + 0.06 : 0.2;
      if (skirted) {
        // (v4) laid down the skirt's slope, a hair in front of it
        apron = pivot(body, 0, 0.42, 0);
        taper(apron, bottom - 0.42, 0, [B.hip - 0.04, 0.012, 0, skirtFront(bottom) + 0.01], [B.hip - 0.08, 0.012, 0, skirtFront(0.42) + 0.012], d.apron.color);
      } else {
        apron = pivot(body, 0, 0.42, B.dep / 2 + 0.012);
        box(apron, B.hip - 0.06, 0.42 - bottom, 0.012, 0, -(0.42 - bottom) / 2, 0, d.apron.color);
      }
      const [aw, ad] = fem ? torsoAt(0.44) : [B.wa, B.dep];
      box(body, aw + 0.03, 0.02, Math.max(ad + 0.03, skirted ? 2 * skirtFront(0.44) + 0.01 : 0), 0, 0.44, 0, shade(d.apron.color, -0.15));
      if (d.apron.bib) {
        if (fem) {
          // over the bust: flat below it, then up its slope
          taper(chest, 0.45 - CH, 0.505 - CH, [B.wa - 0.06, 0.012, 0, frontAt(0.45) + 0.008], [B.wa - 0.06, 0.012, 0, frontAt(0.505) + 0.008], d.apron.color);
          taper(chest, 0.505 - CH, 0.6 - CH, [B.wa - 0.06, 0.012, 0, bustFront(0.505) + 0.008], [B.wa - 0.07, 0.012, 0, bustFront(0.6) + 0.008], d.apron.color);
        } else box(chest, B.wa - 0.07, 0.16, 0.012, 0, 0.53 - CH, B.dep / 2 + 0.008, d.apron.color);
      }
    }
    // the neck, and a shawl or neckerchief round it
    box(chest, 0.1, 0.06, 0.09, 0, 0.69 - CH, 0, skin);
    if (d.shawl) {
      box(chest, B.sh + 0.05, 0.06, B.dep + 0.05, 0, 0.66 - CH, 0, d.shawl.color);
      box(chest, 0.1, 0.1, 0.012, 0, 0.62 - CH, (fem ? bustFront(0.6) : B.dep / 2) + 0.01, d.shawl.color, 0, Math.PI / 4);
    }
    if (d.neckerchief) {
      box(chest, 0.14, 0.04, 0.12, 0, 0.67 - CH, 0.005, d.neckerchief.color);
      box(chest, 0.06, 0.06, 0.012, 0, 0.635 - CH, 0.065, d.neckerchief.color, 0, Math.PI / 4);
    }
    // ---- the head (a neck pivot) ----
    const head = pivot(chest, 0, 0.7 - CH, 0);
    box(head, 0.19, 0.19, 0.18, 0, 0.1, 0, skin);
    for (const s of [1, -1]) {
      box(head, 0.035, 0.035, 0.01, s * 0.045, 0.11, 0.092, d.eyes);
      // brows in the hair's colour; lashes swept out on the feminine face
      // (v2, Jordan: tilted lashes read as angry brows) the feminine face: a flat lash line on the eye's top edge with a
      // small flick up at the outer corner, and a soft level brow higher up
      if (fem) {
        box(head, 0.042, 0.01, 0.012, s * 0.046, 0.131, 0.094, '#1e1612');
        box(head, 0.01, 0.012, 0.012, s * 0.07, 0.137, 0.094, '#1e1612');
        box(head, 0.042, 0.01, 0.01, s * 0.046, 0.158, 0.093, shade(d.hair, -0.1));
      }
      else box(head, 0.05, 0.014, 0.012, s * 0.045, 0.142, 0.094, shade(d.hair, -0.15));
    }
    if (fem) box(head, 0.04, 0.012, 0.008, 0, 0.05, 0.092, shade(skin, -0.28));
    if (d.age === 'old') for (const s of [1, -1]) box(head, 0.02, 0.008, 0.006, s * 0.072, 0.1, 0.091, shade(skin, -0.15));
    // beards
    const bc = d.age === 'old' ? d.hair : shade(d.hair, -0.05);
    if (d.beard === 'full') {
      box(head, 0.17, 0.07, 0.035, 0, 0.035, 0.08, bc);
      // (the side whiskers' fronts stop short of the face's, v3: flush with it they z-fought)
      for (const s of [1, -1]) box(head, 0.025, 0.1, 0.11, s * 0.088, 0.06, 0.03, bc);
      box(head, 0.08, 0.02, 0.012, 0, 0.068, 0.096, bc);
    } else if (d.beard === 'moustache') box(head, 0.09, 0.022, 0.014, 0, 0.065, 0.095, bc);
    else if (d.beard === 'stubble') box(head, 0.176, 0.06, 0.03, 0, 0.035, 0.078, shade(skin, -0.18));
    // hair, then whatever's on the head over it
    const hat = d.head.item, covered = hat !== 'none', hood = hat === 'hood' || hat === 'coif';
    const hc = d.hair, hs = d.hairStyle;
    const top = (h = 0.06) => { if (!covered) box(head, 0.2, h, 0.196, 0, 0.185 + h / 2, -0.002, hc); };
    const back = (h = 0.15, y = 0.13) => { if (!hood) box(head, 0.2, h, 0.05, 0, y, -0.08, hc); };
    const fringe = () => { if (!covered) box(head, 0.19, 0.03, 0.02, 0, 0.183, 0.095, hc); };
    if (hs === 'short') { top(); back(); }
    else if (hs === 'crop') { top(0.03); back(0.1, 0.15); }
    else if (hs === 'bald') { if (!hood) { box(head, 0.2, 0.05, 0.11, 0, 0.12, -0.035, hc); back(0.06, 0.12); } }
    else if (hs === 'shaggy') {
      top(0.07); back(0.2, 0.1); fringe();
      if (!hood) for (const s of [1, -1]) box(head, 0.03, 0.1, 0.12, s * 0.1, 0.14, -0.02, hc);
    } else if (hs === 'long') {
      top(); back(0.32, 0.04); fringe();
      if (!hood) for (const s of [1, -1]) box(head, 0.035, 0.2, 0.05, s * 0.1, 0.08, 0.03, hc);
    } else if (hs === 'bob') {
      top(); back(0.17, 0.1); fringe();
      if (!hood) for (const s of [1, -1]) box(head, 0.03, 0.15, 0.15, s * 0.1, 0.11, -0.01, hc);
    } else if (hs === 'bun') {
      top(); back(0.13, 0.14);
      if (hat !== 'hood' && hat !== 'strawHat') box(head, 0.1, 0.09, 0.08, 0, hat === 'none' ? 0.2 : 0.17, -0.12, hc);
    } else if (hs === 'braid') {
      top(); back(0.15, 0.13); fringe();
      if (hat !== 'hood') { box(head, 0.045, 0.03, 0.04, 0, 0.07, -0.115, shade(hc, -0.25)); for (let k = 0; k < 3; k++) box(head, 0.05 - k * 0.004, 0.055, 0.045, 0, 0.035 - k * 0.06, -0.115 - k * 0.006, hc, -0.08); }
    } else if (hs === 'ponytail') {
      top(); back(0.13, 0.14);
      if (hat !== 'hood') { box(head, 0.05, 0.03, 0.04, 0, 0.13, -0.11, shade(hc, -0.25)); box(head, 0.06, 0.18, 0.05, 0, 0.03, -0.125, hc, -0.12); }
    }
    const H = d.head;
    if (hat === 'hood') {
      // a cloth hood: crown, back and sides round the face, a point at the back, and a capelet over the shoulders
      box(head, 0.225, 0.05, 0.215, 0, 0.215, -0.008, H.color);
      box(head, 0.225, 0.22, 0.05, 0, 0.1, -0.095, H.color);
      for (const s of [1, -1]) box(head, 0.03, 0.2, 0.2, s * 0.11, 0.11, -0.005, H.color);
      box(head, 0.07, 0.06, 0.07, 0, 0.21, -0.12, shade(H.color, -0.1), 0.5);
      box(chest, B.sh + 0.05, 0.07, B.dep + 0.04, 0, 0.665 - CH, -0.008, H.color);
      box(chest, B.sh - 0.02, 0.05, B.dep + 0.03, 0, 0.62 - CH, -0.005, shade(H.color, -0.15));
    } else if (hat === 'cap') {
      // a soft cloth cap with a short peak
      box(head, 0.212, 0.055, 0.206, 0, 0.225, -0.008, H.color);
      box(head, 0.18, 0.06, 0.18, 0, 0.255, -0.02, shade(H.color, 0.06));
      box(head, 0.17, 0.014, 0.06, 0, 0.2, 0.11, shade(H.color, -0.3));
    } else if (hat === 'strawHat') {
      box(head, 0.36, 0.018, 0.36, 0, 0.205, 0, H.color);
      box(head, 0.36, 0.006, 0.36, 0, 0.196, 0, STRAW_DARK);
      box(head, 0.19, 0.09, 0.19, 0, 0.255, 0, H.color);
      box(head, 0.196, 0.026, 0.196, 0, 0.226, 0, H.band);
    } else if (hat === 'kerchief') {
      // a headscarf tied at the back of the neck, its ends hanging
      box(head, 0.21, 0.045, 0.205, 0, 0.215, -0.006, H.color);
      box(head, 0.21, 0.11, 0.045, 0, 0.16, -0.088, H.color);
      box(head, 0.06, 0.05, 0.04, 0, 0.1, -0.115, shade(H.color, -0.15), 0, Math.PI / 4);
      for (const s of [1, -1]) box(head, 0.03, 0.08, 0.012, s * 0.02, 0.05, -0.12, H.color, 0, s * 0.25);
      for (const s of [1, -1]) box(head, 0.025, 0.06, 0.16, s * 0.102, 0.17, -0.02, H.color);
    } else if (hat === 'coif') {
      // a close linen cap over the ears, tied under the chin
      box(head, 0.21, 0.05, 0.205, 0, 0.215, -0.006, H.color);
      box(head, 0.21, 0.17, 0.045, 0, 0.12, -0.088, H.color);
      for (const s of [1, -1]) box(head, 0.025, 0.15, 0.16, s * 0.103, 0.13, -0.006, H.color);
      box(head, 0.2, 0.025, 0.02, 0, 0.19, 0.09, shade(H.color, -0.1));
    }
    // ---- arms: shoulder, elbow, wrist ----
    const armL = pivot(chest, B.shoulder, 0.64 - CH, 0), armR = pivot(chest, -B.shoulder, 0.64 - CH, 0), ELBOW = -0.1, WRIST = -0.2;
    armL.rotation.order = armR.rotation.order = 'YXZ';
    const elbows = [], wrists = [];
    const shortSleeve = T.item === 'shortSleeve';
    const sleeve = T.item === 'vest' || T.item === 'bodice' ? upper : T.color;
    for (const arm of [armL, armR]) {
      box(arm, B.arm, -ELBOW + 0.02, B.arm + 0.01, 0, ELBOW / 2 + 0.01, 0, sleeve);
      const fore = pivot(arm, 0, ELBOW, 0); elbows.push(fore);
      box(fore, B.arm - 0.004, 0.11, B.arm + 0.006, 0, -0.045, 0, shortSleeve ? skin : sleeve);
      // a turned-back cuff on long sleeves
      if (!shortSleeve) box(fore, B.arm + 0.004, 0.025, B.arm + 0.014, 0, -0.088, 0, T.item === 'dress' ? T.trim : shade(sleeve, -0.12));
      const hand = pivot(fore, 0, WRIST - ELBOW, 0); wrists.push(hand);
      hand.rotation.order = 'XZY';
      box(hand, B.arm - 0.01, 0.065, 0.07, 0, -0.033, 0, skin);
    }
    // ---- props (shown by the poses that use them) ----
    // a broom, held across the body, its pivot in front of the belly so a sweep swings the brush side to side
    const broom = pivot(chest, 0, 0.47 - CH, 0.17), broomTilt = pivot(broom, 0, 0, 0);
    broomTilt.rotation.x = -0.62;
    box(broomTilt, 0.026, 0.95, 0.026, 0, -0.15, 0, '#8a6440');
    box(broomTilt, 0.07, 0.035, 0.05, 0, -0.6, 0, '#5a3a22');
    box(broomTilt, 0.16, 0.14, 0.05, 0, -0.68, 0, STRAW);
    box(broomTilt, 0.17, 0.02, 0.055, 0, -0.64, 0, STRAW_DARK);
    // a crate carried in both arms
    const crate = pivot(chest, 0, 0.47 - CH, 0.21);
    box(crate, 0.3, 0.22, 0.24, 0, 0, 0, '#9a6a3e');
    for (const y of [-0.08, 0.08]) box(crate, 0.31, 0.04, 0.25, 0, y, 0, '#6a4426');
    for (const s of [1, -1]) box(crate, 0.04, 0.23, 0.25, s * 0.13, 0, 0, '#5a3a22');
    broom.visible = crate.visible = false;
    // a soft round shadow on the ground
    const shadow = new GFX.Mesh(shadowGeo, shadowMat); shadow.position.y = 0.004; g.add(shadow);
    g.scale.set(1.12 * d.build * (fem ? 0.98 : 1), 1.12 * d.height * (fem ? 0.97 : 1), 1.12 * d.build);
    return { g, parts, d, body, chest, head, legL, legR, knees, ankles, armL, armR, elbows, wrists, flaps, apron, broom, crate, shadow };
  }
  return { design, build, pose, describe };
}

// ---------- the poses ----------
// The walk is the hero's (legSwing's planted half linear, knees bending on the swing, the foot kept level), a little
// slower and shorter in the step; the rest are made for standing about in town.
export const FOLK_WALK = { rate: 4.2, stride: 0.6, arms: 0.45, knee: 1.4, foot: 0.6, elbow: 0.3, bob: 0.025, twist: 0.08 };
export const ANIMS = ['idle', 'walk', 'talk', 'wave', 'carry', 'sweep'];
function legSwing(ph) {
  const u = ((ph % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), sn = Math.sin(u);
  const w = u > 1.5 * Math.PI ? u - 2 * Math.PI : u;
  return w <= Math.PI / 2 ? w / (Math.PI / 2) : sn;
}
export function pose(f, anim, t) {
  const W = FOLK_WALK, z3 = o => o.rotation.set(0, 0, 0);
  [f.body, f.chest, f.head, f.legL, f.legR, f.armL, f.armR, ...f.knees, ...f.ankles, ...f.elbows, ...f.wrists, ...f.flaps].forEach(z3);
  if (f.apron) z3(f.apron);
  f.broom.rotation.set(0, 0, 0);
  f.broom.visible = anim === 'sweep'; f.crate.visible = anim === 'carry';
  const walking = anim === 'walk' || anim === 'carry';
  let bodyY = Math.sin(t * 1.8) * 0.006;
  if (walking) {
    const ph = t * W.rate;
    f.legL.rotation.x = legSwing(ph) * W.stride;
    f.legR.rotation.x = legSwing(ph + Math.PI) * W.stride;
    const cw = Math.cos(ph);
    f.knees[0].rotation.x = W.knee * Math.max(0, -cw) * 0.6;
    f.knees[1].rotation.x = W.knee * Math.max(0, cw) * 0.6;
    bodyY = Math.abs(Math.cos(ph)) * W.bob;
    f.armL.rotation.set(-Math.sin(ph) * W.arms, 0, 0.06);
    f.armR.rotation.set(Math.sin(ph) * W.arms, 0, -0.06);
    f.elbows[0].rotation.x = f.elbows[1].rotation.x = -W.elbow;
    f.chest.rotation.y = -Math.sin(ph) * W.twist;
    f.head.rotation.y = Math.sin(ph) * W.twist * 0.8;
  } else {
    // standing: breathing, the weight shifting from foot to foot now and then, the head looking about
    const shift = Math.sin(t * 0.35) * 0.03;
    f.body.rotation.z = shift; f.legL.rotation.z = f.legR.rotation.z = -shift;
    f.head.rotation.y = Math.sin(t * 0.47) * 0.35 * Math.max(0, Math.sin(t * 0.21 + 1));
    f.head.rotation.x = Math.sin(t * 0.31) * 0.05;
    f.chest.rotation.x = Math.sin(t * 1.8) * 0.012;
    f.armL.rotation.set(Math.sin(t * 0.9) * 0.03, 0, 0.07);
    f.armR.rotation.set(-Math.sin(t * 0.9) * 0.03, 0, -0.07);
    f.elbows[0].rotation.x = f.elbows[1].rotation.x = -0.12;
  }
  if (anim === 'talk') {
    // hands talking, the right more than the left, nodding as they go
    f.armR.rotation.set(-0.35 + Math.sin(t * 2.3) * 0.15, 0.2, -0.12 - Math.sin(t * 1.3) * 0.08);
    f.elbows[1].rotation.x = -1.1 + Math.sin(t * 3.1) * 0.3;
    f.wrists[1].rotation.z = Math.sin(t * 2.7) * 0.3;
    f.armL.rotation.set(-0.2 + Math.sin(t * 1.7 + 1) * 0.15, -0.1, 0.1);
    f.elbows[0].rotation.x = -0.6 + Math.sin(t * 2.1 + 2) * 0.25;
    f.head.rotation.x = Math.sin(t * 4) * 0.06; f.head.rotation.y = Math.sin(t * 0.6) * 0.15;
    f.chest.rotation.y = Math.sin(t * 0.9) * 0.12;
  } else if (anim === 'wave') {
    // the right hand raised and waving from the elbow, the head tipped
    const up = Math.min(1, (t % 6) / 0.4), down = (t % 6) > 4.5 ? Math.max(0, 1 - ((t % 6) - 4.5) / 0.5) : 1, k = Math.min(up, down);
    f.armR.rotation.set(-0.25 * k, 0, -0.07 - 2.45 * k);
    f.elbows[1].rotation.z = Math.sin(t * 8) * 0.5 * k;
    f.elbows[1].rotation.x = -0.25 * k;
    f.head.rotation.z = -0.1 * k; f.head.rotation.y = 0;
    f.chest.rotation.z = 0.04 * k;
  } else if (anim === 'carry') {
    // the crate in both arms, leaning back a little against its weight
    f.armL.rotation.set(-0.95, 0, -0.02); f.armR.rotation.set(-0.95, 0, 0.02);
    f.elbows[0].rotation.x = f.elbows[1].rotation.x = -0.55;
    f.chest.rotation.x = -0.07; f.chest.rotation.y *= 0.3; f.head.rotation.y *= 0.3;
  } else if (anim === 'sweep') {
    // the broom swung side to side with the shoulders, the right hand high on the handle and the left low
    const s = Math.sin(t * 2.4);
    f.broom.rotation.z = s * 0.35;
    f.chest.rotation.y = s * 0.18; f.chest.rotation.x = 0.1;
    f.armR.rotation.set(-0.55, 0, 0.12); f.elbows[1].rotation.x = -0.95;
    f.armL.rotation.set(-0.8, 0, -0.18); f.elbows[0].rotation.x = -0.45;
    f.head.rotation.x = 0.2; f.head.rotation.y = s * 0.1;
    f.legL.rotation.x = -0.12; f.legR.rotation.x = 0.1; f.knees[0].rotation.x = 0.12; f.knees[1].rotation.x = 0.16;
  }
  f.body.position.y = bodyY;
  // (breathing sinks the body: the legs rise as much, so the feet stay on the ground)
  f.legL.position.y = f.legR.position.y = 0.36 - Math.min(0, bodyY);
  // feet kept level with the ground, and skirts swinging with their legs
  f.ankles[0].rotation.x = -(f.legL.rotation.x + f.knees[0].rotation.x) * FOLK_WALK.foot;
  f.ankles[1].rotation.x = -(f.legR.rotation.x + f.knees[1].rotation.x) * FOLK_WALK.foot;
  if (f.flaps.length) { f.flaps[0].rotation.x = f.legL.rotation.x * 0.55; f.flaps[1].rotation.x = f.legR.rotation.x * 0.55; }
  if (f.apron) f.apron.rotation.x = Math.min(0, f.legL.rotation.x, f.legR.rotation.x) * (f.flaps.length ? 0.55 : 0.9);
}
