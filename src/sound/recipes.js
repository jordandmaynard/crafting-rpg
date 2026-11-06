// The pilot sounds (v892, Jordan's list): an axe on a tree; footsteps on grass, cobblestone, snow and sand (dirt and
// wooden floors too, so walking indoors doesn't go silent); a sword on flesh (wolves, boars) and on cloth or leather
// (bandits, goblins); a wooden door and metal double doors opening and closing.
//
// Each sound is LAYERS (a strike's bite, the body that rings, the debris after it), each layer rendered into a pool of
// variants by its render(k, P) from a Kit (src/sound/dsp.js) and P, its tuning. compose(P, o, rnd) says, each time the
// sound plays, which layers go in, how loud, how late and how far re-pitched, so no two plays are the same (option D).
// SOUND_TUNING holds every tuning value, and SOUND_SPEC the lab's sliders for them (sounds.html): a change re-renders
// that sound's pools. Jordan's pastes from the lab become these defaults.

import { clamp, Kit } from './dsp.js';

// ---- shared pieces ----
// a dull low thud: brown noise low-passed at f, falling in tau seconds
// (high-passed at 45 Hz: brown noise's rumble below that is felt by the compressor more than heard)
const thud = (k, f, tau, sec = tau * 6) => k.norm(k.decay(k.hp(k.lp(k.lp(k.brown(sec), f), f), 45), tau, 0.0015));
// a strike through a material
const strike = (k, dur, modes, sec, o = {}) => k.norm(k.modal(k.contact(dur, o), modes, sec, { jitter: o.jitter ?? 0.03 }));
// wood's partials (irregular, damped hard at the top), stone's, and a cast metal leaf's (a free plate's ratios)
const WOOD = [1, 2.32, 3.9, 5.3, 7.6, 10.1, 13.4];
const PLANK = [1, 2.7, 4.2, 6.1, 8.9, 12.2];
const STONE = [1, 1.62, 2.31, 3.1, 4.4, 5.9];
const PLATE = [1, 1.58, 2.76, 3.9, 5.4, 7.2, 8.9, 11.3];
const BONE = [1, 1.93, 2.84, 4.1, 5.6];

// a step: the heel, then the toe a moment later and softer, each made by one(k, scale)
function heelToe(k, P, one, sec) {
  const out = k.buf(sec);
  k.add(out, one(k, 1), 1, 0);
  k.add(out, one(k, 0.55), k.r(0.35, 0.6), k.r(0.045, 0.085) * (P.gap ?? 1));
  return out;
}

// ---- a tree falling (v894-895): three weights of tree, each modelled on one of Jordan's reference recordings ----
// light: Tree Fall A (a thin trunk: a crack and a second snap, a thin bright tearing, no rush, a short crash);
// mid: Tree Fall E; heavy: Tree Fall D (a big trunk: dense, darker tearing over a steady low groan, a longer rush, and
// a landing of three hits as the trunk and then the crown come down, with a long low rumble). Every value here scales
// the tree tuning (SOUND_TUNING.tree), so the lab's sliders move all three together.
const TREE_HEFT = {
  L: { hz: 1.45, bounce: 0.1, crack: { spread: 0.2, grains: 0.8, level: 1 }, tear: { sec: 2.2, level: 0.3, snaps: 3.5, bedHz: 2500, bed: 0.8, bedWander: 0.55, groan: 0.15, rumble: 0, early: 0.35 }, rush: null,
    crash: { sec: 0.9, level: 0.55, snap: 0.2, snapHi: 5000, body: 0.55, wood: 0.5, debris: 0.45, debrisTau: 0.13, debrisLo: 600, debrisHi: 3000, thudHz: 170, thudTau: 0.04, thudCut: 90, ring: 0.05, grains: 0.5, grainHi: 4000, spread: 0.06, rumble: 0, rumbleTau: 0.05, settle: 1.2, settleLo: 800, settleHi: 3500, tailSnaps: 14, tailHi: 5000, tailLen: 0.6, hits: [[0, 1], [0.07, 0.6]] } },
  M: { hz: 1, bounce: 0.6, crack: { spread: 0.24, grains: 1, level: 1.9, hi: 14000, again: 0.5 }, tear: { sec: 2.4, level: 1.5, snaps: 1, snapHi: 12000, bedHz: 1000, bed: 1, groan: 1, rumble: 1, early: 0 }, rush: { len: 0.7, level: 1, build: 0.35 },
    crash: { sec: 1.6, level: 1, snap: 0.8, snapTau: 0.01, body: 1.4, wood: 0.5, debris: 0.4, debrisTau: 0.08, debrisHi: 1800, air: 0.5, thudHz: 110, thudTau: 0.05, ring: 0.06, grains: 0.3, spread: 0.1, rumble: 1, rumbleTau: 0.25, bed: 0.08, bedTau: 0.25, tailSnaps: 9, tailLen: 0.7, settle: 0.4, hits: [[0, 1]] } },
  H: { hz: 0.72, bounce: 0.8, crack: { spread: 0.32, grains: 1.3, level: 1.9, hi: 14000 }, tear: { sec: 2.8, level: 1.1, snaps: 1.2, snapHi: 12000, bedHz: 2200, bed: 1.1, groan: 1.4, rumble: 1.5, early: 0 }, rush: { len: 1, level: 0.35 },
    crash: { sec: 1.8, level: 1.1, snap: 0.5, snapLast: 1, boom: 0.5, boomTo: 58, body: 0.9, wood: 0.9, debris: 0.7, debrisTau: 0.15, debrisLo: 200, debrisHi: 1200, air: 0.5, thudHz: 85, thudTau: 0.09, ring: 0.04, quietHits: 0.3, grains: 0.4, grainAt: 0.13, grainHi: 4000, spread: 0.2, rumble: 1.1, rumbleTau: 0.32, bed: 0.25, bedTau: 0.4, tailSnaps: 90, tailLen: 1, settle: 0.8, hits: [[0, 0.7], [0.06, 0.85], [0.13, 1]] } },
};
// the crack as it gives: a hard knock into the trunk's partials and a burst of splinters (as bright for every size of
// tree: the recordings' are)
const treeCrack = (H) => ({ n: 4, render(k, P) {
  const sec = H.crack.spread + 0.1, out = k.buf(sec);
  k.add(out, strike(k, 0.0003, k.modes(k.near(P.trunkHz * 2.6, 0.12), WOOD, 0.07, { damp: 0.7, tilt: 0.35, scatter: 0.08 }), sec, { grit: 0.5, bounces: 2, spread: 0.003 }), 0.7);
  k.grains(out, { count: Math.round(P.crackGrains * H.crack.grains), t0: 0.002, spread: H.crack.spread, density: (u) => Math.min(1, u * 20) * Math.pow(1 - u, 1.6), lo: 300, hi: H.crack.hi || 9000, q: 0.9, dur: [0.0008, 0.006], pow: 1.6, clump: 0.4 });
  k.grains(out, { count: 26, t0: 0.003, spread: H.crack.spread * 0.8, lo: 400, hi: 3400, dur: [0.004, 0.014], kind: 'ping', pow: 1.8, gain: 0.7 });
  k.add(out, thud(k, 130, 0.05, sec), 0.4);
  return k.norm(out);
} });
// fibres tearing while it goes over (v903, on the judge's reading): a continuous, softly surging tearing bed (filtered
// noise: it never drops out between snaps), with a few larger snaps a second over it in clusters (5-10/s: dense tiny
// grains read as popcorn or fire), the hinge's groan and the trunk's weight working on it (a low, uneven rumble)
const treeTear = (H) => ({ n: 3, render(k, P) {
  const T = H.tear, sec = T.sec, out = k.buf(sec);
  if (P.bed > 0) {
    const bed = k.mul(k.lp(k.bp(k.pink(sec), T.bedHz, 0.4), T.bedHz * 6), k.wander(sec, 3, T.bedWander || 0.35));
    k.add(out, k.norm(bed), P.bed * T.bed * 0.5);
  }
  k.grains(out, { count: Math.round(P.snaps * T.snaps * sec), t0: 0, spread: sec, density: () => 1, lo: 300, hi: T.snapHi || 6000, q: 0.9, dur: [0.003, 0.012], pow: T.bedWander ? 2 : 1.2, clump: 0.55 });
  k.grains(out, { count: Math.round(P.snaps * T.snaps * sec * 0.3), t0: 0, spread: sec, density: () => 1, lo: 400, hi: 2400, dur: [0.004, 0.016], kind: 'ping', pow: 1.6, gain: 0.6 });
  const r0 = k.near(28, 0.2), ex = k.stickSlip(sec, (t) => r0 * (0.8 + 0.5 * t), (t) => Math.min(1, t * 4), { jitter: 0.5, sharp: 0.0006 });
  k.add(out, k.norm(k.modal(ex, k.modes(k.near(P.trunkHz * H.hz, 0.1), WOOD, 0.12, { damp: 0.6, tilt: 0.6, scatter: 0.08 }), sec)), P.groan * T.groan * 0.6);
  if (T.rumble > 0) k.add(out, k.norm(k.mul(k.hp(k.lp(k.lp(k.brown(sec), 130), 130), 40), k.wander(sec, 7, 0.8))), P.groan * 0.4 * T.rumble);
  return k.norm(out);
} });
// the crown's weight coming down: a dark roar (low-passed ~800 Hz) and the lows swelling into the landing
const treeRush = (H) => ({ n: 3, render(k, P) {
  const sec = H.rush.len, out = k.buf(sec), u = (t) => clamp(t / sec, 0, 1);
  const air = k.lp(k.filter(k.pink(sec), 'lp', (t) => 300 + 500 * u(t), 0.7), 800);
  k.mul(air, k.wander(sec, 14, 0.5));
  k.shape(air, (t) => Math.pow(u(t), 1.5));
  k.add(out, k.norm(air), 0.8);
  // (v903) branches crashing in the crown just before the trunk hits: dark snaps (300-1500 Hz) swelling over the last quarter second
  if (H.rush.build) k.grains(out, { count: Math.round(40 * H.rush.build), t0: Math.max(0, sec - 0.28), spread: Math.min(sec, 0.28), density: (u) => u * u, lo: 300, hi: 1500, q: 0.9, dur: [0.003, 0.012], pow: 1.4, gain: 0.4, clump: 0.4 });
  k.add(out, k.norm(k.shape(k.mul(k.hp(k.lp(k.lp(k.brown(sec), 220), 220), 40), k.wander(sec, 9, 0.4)), (t) => Math.pow(u(t), 1.4))), 1.4);
  return k.norm(out);
} });
// the landing (v903): for each hit a thud, the 80-250 Hz body and a 200-1000 Hz wooden body, the trunk knocking (a
// short ring: a long one hummed), a crack of air; then branches and debris settling, a broadband noise decaying over
// a quarter to two thirds of a second by size (the recordings' 0.27 / 0.38 / 0.67 s to -30 dB), a few snaps in it
const treeCrash = (H) => ({ n: 4, render(k, P) {
  const C = H.crash, sec = C.sec, out = k.buf(sec);
  C.hits.forEach(([at, lv], hi) => {
    const t0 = at * k.r(0.8, 1.2), last = hi === C.hits.length - 1;
    k.add(out, k.hp(thud(k, C.thudHz, C.thudTau, sec - t0), C.thudCut || 55), lv, t0);
    if (C.boom) k.add(out, boom(k, 75, C.boomTo || 40, C.thudTau * 1.2, sec - t0), C.boom * lv, t0);   // (a heavy trunk's weight: 40-150 Hz)
    k.add(out, k.norm(k.decay(k.hp(k.lp(k.lp(k.brown(sec - t0), 260), 260), 80), 0.05 + 0.02 * H.crash.level, 0.002)), C.body * lv, t0);
    k.add(out, k.norm(k.decay(k.bp(k.pink(sec - t0), C.woodHz || 500, 0.5), 0.04 + 0.02 * H.crash.level, 0.001)), C.wood * lv, t0);
    k.add(out, strike(k, 0.006, k.modes(k.near(P.trunkHz * H.hz * 1.5, 0.12), WOOD, C.ring, { damp: 0.7, tilt: 0.5, scatter: 0.08 }), sec - t0, { grit: 0.5, bounces: 2, spread: 0.01 }), 0.6 * lv * (last || !C.quietHits ? 1 : C.quietHits), t0);
    // the crack of it (a heavy tree's only on the last hit, the crown's: one short crack, not a smear)
    if (!C.snapLast || last) k.add(out, k.norm(k.decay(k.lp(k.white(0.2), C.snapHi || 9000), C.snapTau || (C.snapLast ? 0.012 : 0.025), 0.0006)), (C.snap ?? 0.45) * lv, t0);
  });
  // splinters' air (5-16 kHz) over the strike: without it a big tree's landing sounded muffled
  if (C.air) k.add(out, k.norm(k.mul(k.decay(k.lp(k.hp(k.white(0.3), 5000), 16000), 0.03, 0.0005), k.wander(0.3, 40, 0.6))), C.air, C.snapLast ? C.hits[C.hits.length - 1][0] : 0);
  const deb = k.decay(k.lp(k.hp(k.pink(sec), C.debrisLo || 250), C.debrisHi || 4000), C.debrisTau, 0.004);
  k.add(out, k.norm(k.mul(deb, k.wander(sec, 20, 0.5))), C.debris);
  // the long settling after a big tree: a faint broadband bed (150 Hz-6 kHz) over the rumble, so the tail is not only bass
  if (C.bed) k.add(out, k.norm(k.mul(k.decay(k.lp(k.hp(k.pink(sec), 150), 6000), C.bedTau, 0.01), k.wander(sec, 12, 0.5))), C.bed);
  k.grains(out, { count: Math.round(P.crashGrains * C.grains), t0: C.grainAt || 0, spread: C.spread, lo: 300, hi: C.grainHi || 6000, q: 1, dur: [0.002, 0.01], pow: 1.4, gain: 0.6, clump: 0.4 });
  k.add(out, k.hp(thud(k, 70, C.rumbleTau, sec), 45), P.rumble * C.rumble);
  // (v903) wooden debris snapping and rattling as it settles, ~25 dB under the rumble, over most of a second
  if (C.tailSnaps) k.grains(out, { count: C.tailSnaps, t0: 0.05, spread: Math.min(C.tailLen, sec - 0.06), density: (u) => Math.pow(1 - u, 1.3), lo: 1000, hi: C.tailHi || 12000, q: 1, dur: [0.001, 0.006], pow: 1.8, gain: 0.07, clump: 0.4 });
  k.grains(out, { count: Math.round(10 * C.settle), t0: 0.12, spread: sec * 0.5, density: (u) => Math.pow(1 - u, 1.5), lo: C.settleLo || 300, hi: C.settleHi || 3000, q: 1, dur: [0.002, 0.008], pow: 1.6, gain: 0.15 });
  return k.norm(out);
} });
const treeBounce = (H) => ({ n: 3, render(k, P) {
  const sec = 0.5, out = k.buf(sec);
  k.add(out, strike(k, 0.004, k.modes(k.near(P.trunkHz * H.hz * 1.3, 0.12), WOOD, 0.15, { damp: 0.7, tilt: 0.5, scatter: 0.08 }), sec, { grit: 0.4, bounces: 1, spread: 0.006 }), 1);
  k.add(out, thud(k, 150 * H.hz, 0.05, sec), 0.7);
  return k.norm(out);
} });
const treeLayers = (parts) => Object.fromEntries(Object.entries(TREE_HEFT).flatMap(([c, H]) => Object.entries(parts).filter(([, f]) => f(H)).map(([name, f]) => [name + c, f(H)])));
// how much of each weight a tree of heft h (0 light .. 0.5 mid .. 1 heavy) is: equal-power blends of the nearest two
function heftMix(P, o) {
  const h = clamp((o.heft ?? 0.5) + (P.heftShift || 0), 0, 1);
  return [['L', clamp(1 - h * 2, 0, 1)], ['M', 1 - Math.abs(h - 0.5) * 2], ['H', clamp(h * 2 - 1, 0, 1)]].filter(([, w]) => w > 0.03).map(([c, w]) => [c, Math.sqrt(w)]);
}


export const SOUNDS = {
  // ---------------------------------------------------------------- axe on a tree
  chop: {
    label: 'Axe on a tree', group: 'work',
    layers: {
      // the blade biting in: a very short, very bright contact, the fibres parting, the axe head's faint ring
      bite: { n: 6, render(k, P) {
        const out = k.buf(0.12);
        k.add(out, k.norm(k.decay(k.hp(k.white(0.03), 2600), 0.0028, 0.0002)), 1);
        k.add(out, strike(k, P.biteMs / 1000, k.scatterModes(6, 2400, 7200, 0.02, 0.07, { drift: 0.002 }), 0.12, { grit: 0.3, bounces: 0 }), P.headRing);
        return out;
      } },
      // the trunk's knock: a duller contact into wood partials, a low thud under it and the crunch of the cut
      body: { n: 6, render(k, P) {
        const sec = 0.35, out = k.buf(sec), base = k.near(P.trunkHz, 0.12);
        k.add(out, strike(k, P.bodyMs / 1000, k.modes(base, WOOD, P.trunkRing, { damp: 0.75, tilt: 0.35, scatter: 0.07 }), sec, { grit: 0.35, bounces: 1, spread: 0.0015 }), 1);
        k.add(out, thud(k, 260, 0.03, sec), P.thud);
        const cr = k.bp(k.pink(0.08), k.r(1500, 2400), 0.8);
        k.add(out, k.norm(k.decay(k.mul(cr, k.wander(0.08, 90, 0.4)), 0.014, 0.0008)), P.crunch, 0.001);
        return out;
      } },
      // splinters: a few tiny ringing ticks and grit, thinning out over a tenth of a second
      debris: { n: 8, render(k, P) {
        const out = k.buf(0.2);
        k.grains(out, { count: Math.round(P.splinters), t0: 0.003, spread: 0.12, lo: 1600, hi: 6000, dur: [0.0015, 0.005], kind: 'ping', pow: 2, clump: 0.35 });
        k.grains(out, { count: Math.round(P.splinters * 0.8), t0: 0.002, spread: 0.06, lo: 1800, hi: 5000, q: 1.2, dur: [0.0006, 0.002], pow: 2.5, gain: 0.35 });
        return k.norm(out);
      } },
      // the canopy shivering after the blow: a rustle of leaves that swells and settles
      leaves: { n: 4, render(k, P) {
        const len = P.leavesLen, out = k.buf(len + 0.05);
        k.grains(out, { count: Math.round(160 * len), t0: 0.02, spread: len, density: (u) => Math.min(1, u * 5) * Math.pow(1 - u, 1.2), lo: 2500, hi: 9500, q: 0.8, dur: [0.002, 0.009], pow: 1.6, clump: 0.2 });
        const bed = k.hp(k.pink(len + 0.05), 3000);
        k.shape(bed, (t) => (t < 0.02 ? 0 : Math.sin(Math.PI * clamp((t - 0.02) / len, 0, 1)) ** 2 * 0.25));
        k.add(out, bed, 1);
        return k.norm(out);
      } },
    },
    compose(P, o, rnd) {
      const s = o.strength ?? 1;
      return [
        { layer: 'bite', gain: 0.75 * (0.6 + 0.4 * s), delay: 0, rate: 0.96 + 0.08 * rnd() },
        { layer: 'body', gain: 1, delay: 0.0006, rate: 0.95 + 0.1 * rnd() },
        { layer: 'debris', gain: P.splinterGain * (0.5 + 0.6 * s), delay: 0.002, rate: 0.9 + 0.2 * rnd() },
        !o.bare && rnd() < 0.85 ? { layer: 'leaves', gain: P.leaves, delay: 0.015 + 0.03 * rnd(), rate: 0.9 + 0.2 * rnd() } : null,
      ];
    },
  },

  // ---------------------------------------------------------------- a tree falling (v894-895)
  // Modelled on Jordan's reference recordings (Tree Fall A, E and D: a light, a middling and a heavy tree; the pieces
  // and weights above, TREE_HEFT). tree.fall plays as the tree starts to go (o.land: seconds until it lands, the
  // game's estimate; o.heft: how heavy, 0..1), its tearing cut off and its rush ending at the landing; tree.land plays
  // when it actually hits the ground. A light tree also snaps a second time just after it gives.
  'tree.fall': {
    label: 'Tree falls (crack, tearing, rush)', group: 'work', tune: 'tree',
    layers: treeLayers({ crack: treeCrack, tear: treeTear, rush: (H) => H.rush && treeRush(H) }),
    compose(P, o, rnd) {
      const land = Math.max(0.3, o.land ?? 1.9), out = [];
      for (const [c, w] of heftMix(P, o)) {
        const H = TREE_HEFT[c];
        out.push({ layer: 'crack' + c, gain: P.crack * H.crack.level * w, delay: 0, rate: 0.95 + 0.1 * rnd() });
        if (H.crack.again) out.push({ layer: 'crack' + c, gain: P.crack * H.crack.level * H.crack.again * w, delay: Math.min(land * 0.4, 0.2 + 0.1 * rnd()), rate: 1 + 0.1 * rnd() });
        if (c === 'L') out.push({ layer: 'crackL', gain: P.crack * w * 0.9, delay: Math.min(land * 0.4, 0.22 + 0.1 * rnd()), rate: 1 + 0.15 * rnd() });
        out.push({ layer: 'tear' + c, gain: P.tear * H.tear.level * w, delay: 0.06, rate: 0.95 + 0.1 * rnd(), dur: Math.max(0.15, land - 0.06 + 0.04 - (H.tear.early || 0) * Math.min(1, land / 1.8)) });
        if (H.rush && !o.bare) {   // (v898: a bare tree, o.bare, has no crown to rush through the air)
          const len = H.rush.len, rd = Math.max(0.06, land - len);
          out.push({ layer: 'rush' + c, gain: P.rush * H.rush.level * w, delay: rd, rate: 1, offset: len - (land - rd), dur: land - rd + 0.03 });
        }
      }
      return out;
    },
  },
  'tree.land': {
    label: 'Tree lands (crash)', group: 'work', tune: 'tree',
    layers: treeLayers({ crash: treeCrash, bounce: treeBounce }),
    compose(P, o, rnd) {
      const out = [];
      for (const [c, w] of heftMix(P, o)) {
        out.push({ layer: 'crash' + c, gain: P.crash * TREE_HEFT[c].crash.level * w, delay: 0, rate: 0.95 + 0.1 * rnd() });
        if (P.bounce > 0) out.push({ layer: 'bounce' + c, gain: P.bounce * TREE_HEFT[c].bounce * w, delay: P.bounceAt * (0.85 + 0.3 * rnd()), rate: 0.95 + 0.1 * rnd() });
      }
      return out;
    },
  },

  // ---------------------------------------------------------------- footsteps
  'step.grass': {
    label: 'Footstep: grass', group: 'steps',
    layers: {
      step: { n: 12, render(k, P) {
        return heelToe(k, P, (k, s) => {
          const out = k.buf(0.2);
          k.add(out, thud(k, 240, 0.022, 0.15), P.thud * s);
          k.grains(out, { count: Math.round(40 * s), t0: 0.002, spread: P.len, lo: 1500, hi: 5000, q: 0.8, dur: [0.003, 0.012], pow: 1.6, gain: P.swish * s, clump: 0.15 });
          k.grains(out, { count: Math.round(6 * s), t0: 0.004, spread: 0.06, lo: 1600, hi: 4200, dur: [0.001, 0.003], kind: 'ping', pow: 2, gain: P.stems * s });
          return out;
        }, 0.32);
      } },
    },
    compose: (P, o, rnd) => [{ layer: 'step', gain: 1, delay: 0, rate: 0.94 + 0.12 * rnd() }],
  },
  'step.cobble': {
    label: 'Footstep: cobblestone', group: 'steps',
    layers: {
      step: { n: 12, render(k, P) {
        return heelToe(k, P, (k, s) => {
          const out = k.buf(0.12), base = k.near(P.stoneHz, 0.15);
          k.add(out, strike(k, k.r(0.0006, 0.0011), k.modes(base, STONE, 0.02, { damp: 0.5, tilt: 0.4, scatter: 0.12 }), 0.12, { grit: 0.45, bounces: 2, spread: 0.0018 }), P.click * s);
          k.add(out, thud(k, 190, 0.014, 0.1), P.thud * s);
          k.grains(out, { count: Math.round(10 * s), t0: 0.001, spread: 0.05, lo: 4000, hi: 11000, q: 1.2, dur: [0.0004, 0.0018], pow: 2.2, gain: P.grit * s });
          return out;
        }, 0.24);
      } },
      // a scuff now and then: the sole dragging on the stone
      scuff: { n: 4, render(k, P) {
        const sec = 0.12, n = k.bp(k.white(sec), k.r(2500, 4000), 0.7);
        k.mul(n, k.wander(sec, 120, 0.8));
        k.env(n, [[0, 0], [0.015, 1], [sec, 0]]);
        k.grains(n, { count: 18, t0: 0, spread: sec, lo: 3000, hi: 9000, dur: [0.0004, 0.0015], pow: 2, gain: 0.8, density: () => 1 });
        return k.norm(n);
      } },
    },
    compose: (P, o, rnd) => [
      { layer: 'step', gain: 1, delay: 0, rate: 0.95 + 0.1 * rnd() },
      rnd() < P.scuffChance ? { layer: 'scuff', gain: P.scuff, delay: 0.03 + 0.04 * rnd(), rate: 0.9 + 0.2 * rnd() } : null,
    ],
  },
  'step.snow': {
    label: 'Footstep: snow', group: 'steps',
    layers: {
      step: { n: 12, render(k, P) {
        return heelToe(k, P, (k, s) => {
          const len = P.len, out = k.buf(len + 0.06);
          // the crust giving under the boot: a dense, clumped crackle, swelling then settling
          k.grains(out, { count: Math.round(110 * s), t0: 0.003, spread: len, density: (u) => Math.pow(Math.sin(Math.PI * u), 0.7), lo: 500, hi: 2600, q: 2, dur: [0.0007, 0.003], pow: 2, clump: 0.5, gain: P.crunch * s });
          // cold snow's squeak: a few small tonal pings
          k.grains(out, { count: Math.round(10 * s), t0: 0.01, spread: len * 0.8, lo: 900, hi: 1900, dur: [0.002, 0.006], kind: 'ping', pow: 1.5, gain: P.squeak * s, density: (u) => Math.sin(Math.PI * u) });
          k.add(out, thud(k, 200, 0.035, len), P.thud * s);
          return out;
        }, P.len * 1.6 + 0.12);
      } },
    },
    compose: (P, o, rnd) => [{ layer: 'step', gain: 1, delay: 0, rate: (0.94 + 0.12 * rnd()) * (o.deep ? 0.88 : 1) }],
  },
  'step.sand': {
    label: 'Footstep: sand', group: 'steps',
    layers: {
      step: { n: 12, render(k, P) {
        return heelToe(k, P, (k, s) => {
          const len = P.len, out = k.buf(len + 0.06);
          k.add(out, thud(k, 220, 0.028, len), P.thud * s);
          // dry grains shifting: a fine hiss of very small grains, quick to start and slow to settle
          k.grains(out, { count: Math.round(150 * s), t0: 0.002, spread: len, lo: 2200, hi: 5500, q: 1, dur: [0.0008, 0.003], pow: 1.8, gain: P.hiss * s, clump: 0.25 });
          // the foot sliding a little as the sand gives
          const sl = k.filter(k.pink(len), 'bp', (t) => 2600 - 1500 * t / len, 0.9);
          k.env(sl, [[0, 0], [0.02, 1], [len * 0.7, 0.3], [len, 0]]);
          k.add(out, k.norm(sl), P.slide * s, 0.005);
          return out;
        }, P.len * 1.6 + 0.12);
      } },
    },
    compose: (P, o, rnd) => [{ layer: 'step', gain: 1, delay: 0, rate: (0.94 + 0.12 * rnd()) * (o.deep ? 0.9 : 1) }],
  },
  'step.dirt': {
    label: 'Footstep: dirt and gravel (roads, the wastes)', group: 'steps',
    layers: {
      step: { n: 12, render(k, P) {
        return heelToe(k, P, (k, s) => {
          const out = k.buf(0.16);
          k.add(out, thud(k, 250, 0.026, 0.14), P.thud * s);
          k.grains(out, { count: Math.round(14 * s), t0: 0.002, spread: 0.08, lo: 1200, hi: 3800, dur: [0.001, 0.004], kind: 'ping', pow: 2, gain: P.gravel * s });
          k.grains(out, { count: Math.round(40 * s), t0: 0.001, spread: 0.07, lo: 1500, hi: 6000, q: 1.1, dur: [0.0005, 0.002], pow: 2, gain: P.grit * s });
          return out;
        }, 0.28);
      } },
    },
    compose: (P, o, rnd) => [{ layer: 'step', gain: 1, delay: 0, rate: 0.94 + 0.12 * rnd() }],
  },
  'step.wood': {
    label: 'Footstep: wooden floor', group: 'steps',
    layers: {
      step: { n: 12, render(k, P) {
        return heelToe(k, P, (k, s) => {
          const sec = 0.2, out = k.buf(sec), base = k.near(P.plankHz, 0.12);
          k.add(out, strike(k, k.r(0.001, 0.0016), [...k.modes(base, PLANK, P.ring, { damp: 0.7, tilt: 0.4, scatter: 0.08 }), [k.near(115, 0.1), P.ring * 0.8, 0.9]], sec, { grit: 0.3, bounces: 1, spread: 0.002 }), P.knock * s);
          k.add(out, thud(k, 200, 0.02, sec), P.thud * s);
          return out;
        }, 0.34);
      } },
      // a board creaking under the weight, now and then
      creak: { n: 4, render(k, P) {
        const sec = 0.14, rate = k.r(260, 480), ex = k.stickSlip(sec, (t) => rate * (0.8 + 0.4 * t / sec), (t) => Math.sin(Math.PI * t / sec), { jitter: 0.2 });
        return k.norm(k.modal(ex, k.scatterModes(5, 500, 1600, 0.02, 0.05), sec + 0.05));
      } },
    },
    compose: (P, o, rnd) => [
      { layer: 'step', gain: 1, delay: 0, rate: 0.95 + 0.1 * rnd() },
      rnd() < P.creakChance ? { layer: 'creak', gain: P.creak, delay: 0.02 + 0.06 * rnd(), rate: 0.9 + 0.2 * rnd() } : null,
    ],
  },

  // ---------------------------------------------------------------- weapon hits
  // o.blunt: 0 a blade (sword, axe, spear), 1 a blunt blow (hammer, fists); o.strength: how hard (about 0.5-1.5)
  'hit.flesh': {
    label: 'Hit: flesh (wolves, boars)', group: 'combat',
    layers: {
      // the blow landing in a body: a soft, wide contact into the body's low cavity, a heavy thud
      body: { n: 6, render(k, P) {
        const sec = 0.3, out = k.buf(sec);
        k.add(out, strike(k, P.bodyMs / 1000, k.modes(k.near(P.bodyHz, 0.12), [1, 1.7, 2.6, 3.8], 0.07, { damp: 0.5, tilt: 0.6, scatter: 0.08 }), sec, { grit: 0.5, bounces: 1, spread: 0.004 }), 1);
        k.add(out, thud(k, 380, 0.035, sec), 0.9);
        return k.norm(out);
      } },
      // wet: a few squelching bursts, the hide and fur rustling
      wet: { n: 8, render(k, P) {
        const out = k.buf(0.18);
        let t = 0;
        for (let j = 0, m = 1 + Math.floor(k.r(0, 2)); j < m; j++) {
          const d = k.r(0.004, 0.009), b = k.decay(k.bp(k.white(d * 5), k.r(450, 1000), k.r(1.2, 2)), d, 0.0008);
          k.add(out, k.norm(b), k.r(0.5, 1) / (1 + j * 0.4), t);
          t += k.r(0.004, 0.014);
        }
        k.add(out, k.norm(k.decay(k.lp(k.pink(0.15), 800), 0.022, 0.001)), 0.3);
        k.grains(out, { count: 30, t0: 0, spread: 0.05, lo: 2000, hi: 6500, q: 0.8, dur: [0.001, 0.004], pow: 1.8, gain: P.fur });
        return k.norm(out);
      } },
      // the blade: a fast slice through the air into the cut
      blade: { n: 6, render(k, P) {
        const sec = 0.06, n = k.filter(k.white(sec), 'bp', (t) => 6500 - 4000 * t / sec, 1.2);
        k.env(n, [[0, 0], [0.004, 1], [sec * 0.75, 0.15], [sec, 0]]);
        return k.norm(n);
      } },
    },
    compose(P, o, rnd) {
      const s = o.strength ?? 1, bl = o.blunt ?? 0;
      return [
        { layer: 'body', gain: (0.85 + 0.35 * bl) * (0.7 + 0.3 * s), delay: 0.002, rate: 0.92 + 0.16 * rnd() },
        { layer: 'wet', gain: P.wet * (1 - 0.4 * bl), delay: 0.003 + 0.004 * rnd(), rate: 0.9 + 0.2 * rnd() },
        bl < 0.5 ? { layer: 'blade', gain: P.blade, delay: 0, rate: 0.92 + 0.16 * rnd() } : null,
      ];
    },
  },
  'hit.padded': {
    label: 'Hit: cloth and leather (bandits, goblins)', group: 'combat',
    layers: {
      body: { n: 6, render(k, P) {
        const sec = 0.28, out = k.buf(sec);
        k.add(out, strike(k, P.bodyMs / 1000, k.modes(k.near(P.bodyHz, 0.12), [1, 1.8, 2.7, 3.9], 0.06, { damp: 0.5, tilt: 0.6, scatter: 0.08 }), sec, { grit: 0.5, bounces: 1, spread: 0.003 }), 1);
        k.add(out, thud(k, 420, 0.03, sec), 0.8);
        return k.norm(out);
      } },
      // leather's slap and the cloth over it: a quick mid smack, then a short breathy rustle of fabric
      surface: { n: 8, render(k, P) {
        const out = k.buf(0.16);
        k.add(out, k.norm(k.decay(k.bp(k.white(0.04), k.r(1100, 1800), 1.3), 0.007, 0.0004)), P.slap);
        k.add(out, k.norm(k.decay(k.lp(k.white(0.05), 700), 0.014, 0.0005)), P.slap * 0.6);
        const cloth = k.hp(k.lp(k.pink(0.14), 3800), 300);
        k.add(out, k.norm(k.decay(cloth, 0.035, 0.002)), P.cloth, 0.002);
        k.grains(out, { count: 18, t0: 0.002, spread: 0.06, lo: 1200, hi: 4500, q: 0.9, dur: [0.002, 0.006], pow: 1.8, gain: P.cloth * 0.4 });
        return k.norm(out);
      } },
      // a blade through cloth: fibres snapping in a quick, clumped tear, over the slice
      blade: { n: 6, render(k, P) {
        const out = k.buf(0.09);
        k.grains(out, { count: 28, t0: 0.001, spread: 0.04, density: (u) => 1 - u * 0.7, lo: 1800, hi: 5500, q: 1.3, dur: [0.0004, 0.0018], pow: 1.8, clump: 0.6 });
        const sl = k.filter(k.white(0.05), 'bp', (t) => 6000 - 50000 * t, 1.2);
        k.env(sl, [[0, 0], [0.003, 1], [0.04, 0.1], [0.05, 0]]);
        k.add(out, k.norm(sl), 0.5);
        return k.norm(out);
      } },
    },
    compose(P, o, rnd) {
      const s = o.strength ?? 1, bl = o.blunt ?? 0;
      return [
        { layer: 'body', gain: (0.85 + 0.35 * bl) * (0.7 + 0.3 * s), delay: 0.002, rate: 0.92 + 0.16 * rnd() },
        { layer: 'surface', gain: 1, delay: 0.0015 * rnd(), rate: 0.92 + 0.16 * rnd() },
        bl < 0.5 ? { layer: 'blade', gain: P.blade, delay: 0, rate: 0.92 + 0.16 * rnd() } : null,
      ];
    },
  },
  'hit.bone': {
    label: 'Hit: bone (skeletons)', group: 'combat',
    layers: {
      body: { n: 6, render(k, P) {
        const sec = 0.2, out = k.buf(sec);
        k.add(out, strike(k, 0.0004, k.modes(k.near(P.boneHz, 0.15), BONE, 0.035, { damp: 0.6, tilt: 0.4, scatter: 0.12 }), sec, { grit: 0.4, bounces: 2, spread: 0.002 }), 1);
        k.add(out, thud(k, 400, 0.015, sec), 0.4);
        return k.norm(out);
      } },
      rattle: { n: 6, render(k, P) {
        const out = k.buf(0.25);
        k.grains(out, { count: 14, t0: 0.01, spread: 0.18, lo: 1200, hi: 4200, dur: [0.002, 0.007], kind: 'ping', pow: 1.6, clump: 0.3 });
        return k.norm(out);
      } },
    },
    compose: (P, o, rnd) => [
      { layer: 'body', gain: 0.8 + 0.3 * (o.strength ?? 1), delay: 0, rate: 0.92 + 0.16 * rnd() },
      { layer: 'rattle', gain: P.rattle, delay: 0.004, rate: 0.9 + 0.2 * rnd() },
    ],
  },

  // ---------------------------------------------------------------- doors
  // (v898, Jordan: no creaks at all; a click as one opens, like a latch unlatching, and a deep, short thud as it
  // shuts, with bass like the trees'; v899: the open is a lock's two clicks, a metal pair's shut two clangs apart) The door in the game eases open or shut in about a quarter of a second (most of
  // the way in 0.23 s), so the shut's thud lands at P.slamAt. o.leaves: 2 for a pair of doors (a thud for each leaf).
  'door.wood.open': {
    label: 'Wooden door opens', group: 'doors', tune: 'door.wood',
    layers: { latch: { n: 5, render: (k, P) => latchClick(k, P, false) } },
    compose: (P, o, rnd) => [{ layer: 'latch', gain: P.latch, delay: 0, rate: 0.95 + 0.1 * rnd() }],
  },
  'door.wood.close': {
    label: 'Wooden door shuts', group: 'doors', tune: 'door.wood',
    layers: { slam: { n: 6, render: (k, P) => doorThud(k, P, false) } },
    compose: (P, o, rnd) => [{ layer: 'slam', gain: P.slam, delay: Math.max(0, P.slamAt * (0.93 + 0.1 * rnd()) - DOOR_PRE), rate: 0.95 + 0.1 * rnd() }],
  },
  'door.metal.open': {
    label: 'Metal double doors open', group: 'doors', tune: 'door.metal',
    layers: { clank: { n: 5, render: (k, P) => latchClick(k, P, true) } },
    compose: (P, o, rnd) => [{ layer: 'clank', gain: P.clank, delay: 0, rate: 0.95 + 0.1 * rnd() }],
  },
  'door.metal.close': {
    label: 'Metal double doors shut', group: 'doors', tune: 'door.metal',
    layers: { slam: { n: 6, render: (k, P) => doorThud(k, P, true) } },
    compose(P, o, rnd) {
      const n = o.leaves ?? 2, L = [];
      for (let j = 0; j < n; j++) L.push({ layer: 'slam', gain: P.slam * (j ? 0.8 : 1), delay: Math.max(0, P.slamAt + j * P.slamGap * (0.85 + 0.3 * rnd()) - DOOR_PRE), rate: j ? 0.96 + 0.03 * rnd() : 1 + 0.03 * rnd() });
      return L;
    },
  },
};

// a clean low boom: a sine falling from f0 to f1 Hz, dying in tau seconds (the bass of a thud, clear on headphones)
function boom(k, f0, f1, tau, sec) {
  const b = k.buf(sec), sr = k.sr;
  let ph = 0;
  for (let i = 0; i < b.length; i++) { const t = i / sr; ph += (f1 + (f0 - f1) * Math.exp(-t / (tau * 0.6))) / sr; b[i] = Math.sin(2 * Math.PI * ph) * Math.exp(-t / tau) * Math.min(1, t / 0.002); }
  return b;
}
// (v901-902) a lock opening, modelled on Jordan's reference (a door lock unlocking, its first second) and reworked on
// an independent judge's reading of it (v902): the key working the wards, a bright scrape running under a run of
// short, bright clicks that grow louder (0, 19, 63, 93, 110, 171 ms), then the bolt's crack at 208 ms, the loudest:
// a bright burst (2-10 kHz, ~15 ms) with a broad mid body and a few quick, sparse steel partials, no re-strike, then
// a smooth mid-band decay (300-1500 Hz, -20 dB at 100 ms, -31 at 200 ms). Mostly shaped noise rather than tuned
// resonances: tuned ones made it a wooden "tok". Metal doors' is lower and a little longer. P.lockGap stretches the
// timing; P.latchHz is the top of the steel partials.
const LOCK_CLICKS = [[0, 0.03], [0.019, 0.056], [0.063, 0.18], [0.093, 0.14], [0.110, 0.35], [0.171, 0.32]];
function lockBurst(k, f, q, tau, len) { return k.norm(k.decay(k.bp(k.white(len), f, q), tau, 0.0003)); }
function latchClick(k, P, metal) {
  const sec = 0.6, out = k.buf(sec), g = P.lockGap, lo = metal ? 0.75 : 1, hit = 0.208 * g * k.r(0.95, 1.05);
  // the key scraping the wards: bright, uneven, under the clicks until the bolt goes
  const scrape = k.mul(k.lp(k.lp(k.bp(k.white(hit), 2000 * lo, 0.7), 4500), 4500), k.wander(hit, 60, 0.8));
  k.shape(scrape, (t) => (0.4 + 0.6 * t / hit) * Math.min(1, t / 0.01) * Math.min(1, (hit - t) / 0.005));
  k.add(out, k.norm(scrape), P.scrape * 0.07);
  // the clicks: short bright bursts (10-20 ms), louder toward the bolt
  for (const [t, lv] of LOCK_CLICKS) {
    const len = k.r(0.01, 0.02), at = t * g * k.r(0.92, 1.08);
    k.add(out, lockBurst(k, k.r(1200, 2600) * lo, 0.8, len / 2.5, len * 1.5), lv * k.r(0.9, 1.1) * 0.75, at);
    // (each with a little body: the plug and pins knocking in the case, damped)
    k.add(out, lockBurst(k, k.r(300, 800) * lo, 1.6, 0.006, 0.04), lv * k.r(0.85, 1.1) * 0.8, at);
    k.add(out, lockBurst(k, k.r(3500, 5000), 0.9, 0.0012, 0.01), lv * 0.12 * P.snap, at);
    // (and the steel's ting, a narrow ring at 3.7-4.4 kHz: the reference's lead-in has it)
    k.add(out, lockBurst(k, k.r(3700, 4400) * Math.sqrt(lo), 5, 0.004, 0.02), lv * 0.3 * P.snap, at);
  }
  // the bolt: a bright crack, a broad mid body, a few quick steel partials, the door knocking under it
  k.add(out, k.norm(k.decay(k.lp(k.lp(k.hp(k.white(0.04), 1800), 6000), 6000), 0.004, 0.0002)), P.snap * 0.8, hit);
  k.add(out, lockBurst(k, 1700 * lo, 0.6, 0.012, 0.06), 0.8, hit);
  // (a low-mid clunk of the lock's case, not a sub thud)
  k.add(out, lockBurst(k, 300 * lo, 1.2, 0.02, 0.12), 0.6, hit);
  k.add(out, strike(k, 0.0002, k.scatterModes(5, 3000 * lo, P.latchHz * 2, 0.02, 0.06, { drift: 0.002 }), 0.2, { grit: 0.4, bounces: 0 }), 0.3, hit);
  // the parts settling: a smooth mid-band decay with a few faint ticks in it
  const tl = sec - hit, tail = k.decay(k.lp(k.lp(k.bp(k.white(tl), 650 * lo, 0.7), 1400), 1400), metal ? 0.09 : 0.075, 0.003);
  for (let q = 0; q < 8; q++) { const t = k.r(0.02, 0.3); k.add(tail, lockBurst(k, k.r(800, 1800) * lo, 0.8, 0.001, 0.008), 0.12 * Math.exp(-t / 0.12) * k.r(0.3, 1), t); }
  k.add(out, k.norm(tail), 0.35 * P.rattle, hit + 0.004);
  k.hp(out, 140);
  k.shape(out, (t) => Math.min(1, t / 0.005));
  return k.norm(out);
}
// a door shutting (v903, on Jordan's two references, mainly the slammed one, and reworked over rounds with an
// independent judge): the air it pushes ahead of it (a low whump), the latch bolt hitting the strike plate ~0.155 s
// before it seats (a 15-20 ms broadband burst, a woody knock, a ~120 Hz thump), a 30-40 ms bright swell as it rides the plate, then
// the edge meeting the frame: a crack rising over 10 ms and holding ~25 ms (peak near 1.3 kHz), the panel's mid knock,
// and the low body ~15 ms behind it: a ladder of panel modes (58, 103, 179, 234, 305 Hz) peaking ~70 ms in; one tap
// in the frame near 90 ms and the latch springing home ~0.14 s on. Rendered with DOOR_PRE seconds before the impact;
// compose starts it that much earlier. Metal doors: the leaf clangs too (a big plate's beating partials, a bright edge).
const DOOR_PRE = 0.18;
function doorThud(k, P, metal) {
  const pre = DOOR_PRE, sec = pre + (metal ? Math.max(0.5, P.ringDecay * 1.4) : 0.5), out = k.buf(sec), body = k.buf(sec - pre);
  // the air ahead of it
  const air = k.lp(k.lp(k.pink(pre + 0.03), 250), 250);
  k.shape(air, (t) => clamp((t - 0.02) / 0.03, 0, 1) * (0.6 + 0.4 * clamp(t / pre, 0, 1)) * (t > pre ? Math.max(0, 1 - (t - pre) / 0.03) : 1));
  k.add(out, k.norm(air), P.whump);
  const airMid = k.lp(k.bp(k.pink(pre + 0.03), 600, 0.6), 1500);   // (the reference's air reaches 250-1000 Hz, ~15 dB down)
  k.shape(airMid, (t) => clamp((t - 0.02) / 0.03, 0, 1) * Math.max(0, 1 - Math.max(0, t - pre + 0.06) / 0.08));
  k.add(out, k.norm(airMid), P.whump * 0.04);
  // the latch bolt riding over the strike plate: two quick bright clicks
  // (the handle or the edge brushing the frame as it comes in, then the bolt over the plate)
  // (v903, the judge: a 15-20 ms broadband burst whose highs die ~30 dB over 100 ms, not a dry tick; then, instead
  // of a second tick, a 30-40 ms bright swell into the slam as the bolt rides the plate)
  const lh = k.decay(k.mul(k.lp(k.lp(k.hp(k.white(0.15), metal ? 900 : 700), 5000), 9000), k.wander(0.15, 120, 0.5)), 0.016, 0.0003), lt = pre - 0.155 * k.r(0.95, 1.05);
  k.add(out, k.norm(lh), P.latchClick, lt);
  // (and the door's woody knock with it: 300 Hz-1 kHz, and a low thump ~120 Hz)
  k.add(out, k.norm(k.decay(k.bp(k.white(0.06), 600, 1), 0.01, 0.0005)), P.latchClick * 0.6, lt);
  k.add(out, k.norm(k.decay(k.bp(k.pink(0.15), 120, 1.5), 0.03, 0.002)), P.latchClick * 0.8, lt);
  const sw = k.r(0.03, 0.04), swell = k.mul(k.lp(k.hp(k.white(sw), 2000), 12000), k.wander(sw, 200, 0.6));
  k.shape(swell, (t) => Math.pow(10, (-38 + 14 * t / sw) / 20) / 0.063);
  k.add(out, swell, P.latchClick * 0.22, pre - sw);
  // the edge meeting the frame: a broadband crack
  // (v903, the judge: rising over ~10 ms, holding ~25 ms, then decaying; a peak near 1.3 kHz; little above 8 kHz)
  const crack = k.norm(k.lp(k.hp(k.white(0.12), 700), 6000));
  k.add(crack, k.norm(k.bp(k.white(0.12), 1300, 3)), 0.5);
  k.add(crack, k.norm(k.bp(k.pink(0.12), 350, 0.8)), 0.7);   // (with a 200-600 Hz body)
  k.shape(crack, (t) => (t < 0.01 ? t / 0.01 : t < 0.035 ? 1 : Math.exp(-(t - 0.035) / 0.018)));
  k.add(out, k.norm(crack), P.knock, pre - 0.004);
  // the door tapping once in its frame near 90 ms (~-19 dB; a cluster of rattles clattered)
  k.add(out, k.norm(k.decay(k.lp(k.hp(k.white(0.03), 2000), 9000), 0.004, 0.0002)), 0.11 * P.knock, pre + 0.09 * k.r(0.95, 1.05));
  // the panel's mid-band knock right behind it (250-1000 Hz), then the low body ~15 ms behind it, peaking ~40 ms after the knock
  k.add(out, k.norm(k.decay(k.bp(k.pink(sec - pre), 500, 0.7), P.len * 0.4, 0.002)), P.mid, pre + 0.006);
  const bd = k.r(0.012, 0.022), bs = sec - pre - bd;
  k.add(body, boom(k, P.thudHz * 1.6, P.thudHz * 0.75, P.len, bs), P.boom * 0.4, bd);
  // (v903, the judge: a ladder of low panel modes, not one sub boom: 58, 103, 179, 234, 305 Hz at 0, -7, -7, -14,
  // -13 dB in the reference, swelling over ~70 ms)
  const ladder = k.buf(bs), sr = k.sr, fs = P.thudHz / 70;
  for (const [f, db, tau] of [[58, 0, 1.75], [103, -5, 1.4], [179, -6, 1.1], [234, -8, 0.9], [305, -7, 0.8]]) {
    const hz = f * fs * k.r(0.96, 1.04), a = Math.pow(10, db / 20), tt = P.len * tau, ph = k.r(0, 6.28);
    for (let i = 0; i < ladder.length; i++) { const t = i / sr; ladder[i] += a * Math.sin(2 * Math.PI * hz * t + ph) * (1 - Math.exp(-t / 0.03)) * Math.exp(-t / tt - Math.max(0, t - 0.4) / 0.05); }
  }
  k.add(body, k.norm(ladder), P.boom, bd);
  k.add(body, thud(k, P.thudHz * 1.4, P.len * 0.8, bs), P.thud, bd);
  k.add(body, k.norm(k.decay(k.hp(k.lp(k.lp(k.brown(bs), 260), 260), 80), P.len * 0.8, 0.003)), P.body, bd);
  if (metal) {
    k.add(body, strike(k, 0.0006, k.modes(k.near(P.ringHz, 0.08), PLATE, P.ringDecay, { damp: 0.5, tilt: 0.4, scatter: 0.03, extra: { drift: 0.003, beat: 1.4 } }), bs, { grit: 0.25, bounces: 2, spread: 0.002, jitter: 0.015 }), P.ring, bd);
    k.add(body, strike(k, 0.0003, k.scatterModes(6, 1200, 4200, 0.05, 0.2, { drift: 0.003, beat: 1.5 }), bs, { grit: 0.3, bounces: 1, spread: 0.001 }), P.edge);
  } else k.add(body, strike(k, 0.002, k.modes(k.near(P.panelHz, 0.1), PLANK, P.panelRing, { damp: 0.75, tilt: 0.4, scatter: 0.06 }), bs, { grit: 0.3, bounces: 1, spread: 0.003 }), P.panel, bd);
  // the latch springing home and the door rattling in its frame a moment after
  const rb = k.r(0.13, 0.16);
  k.add(body, k.norm(k.decay(k.lp(k.hp(k.white(0.06), 500), 5000), 0.01, 0.0005)), P.rebound * 0.63, rb);
  k.add(body, k.norm(k.decay(k.lp(k.brown(0.2), 200), 0.04, 0.003)), P.rebound * 0.6, rb);
  k.add(out, body, 1, pre);
  k.shape(out, (t) => Math.min(1, (sec - t) / 0.02));
  return k.norm(out);
}

// ---- tuning ----
export const SOUND_TUNING = {
  chop: { biteMs: 0.22, headRing: 0.12, trunkHz: 150, trunkRing: 0.09, bodyMs: 1.1, thud: 0.6, crunch: 0.25, splinters: 10, splinterGain: 0.25, leaves: 0.05, leavesLen: 0.5 },
  'step.grass': { thud: 0.7, swish: 0.3, stems: 0.25, len: 0.12, gap: 1 },
  'step.cobble': { stoneHz: 1400, click: 0.8, thud: 0.9, grit: 0.12, scuff: 0.2, scuffChance: 0.15, gap: 1 },
  'step.snow': { crunch: 1, squeak: 0.25, thud: 0.5, len: 0.16, gap: 1 },
  'step.sand': { thud: 0.7, hiss: 0.3, slide: 0.2, len: 0.2, gap: 1 },
  'step.dirt': { thud: 0.9, gravel: 0.3, grit: 0.12, gap: 1 },
  'step.wood': { plankHz: 210, ring: 0.07, knock: 0.8, thud: 0.6, creak: 0.25, creakChance: 0.12, gap: 1 },
  'hit.flesh': { bodyHz: 85, bodyMs: 4, wet: 0.18, fur: 0.12, blade: 0.22 },
  'hit.padded': { bodyHz: 95, bodyMs: 3, slap: 0.8, cloth: 0.25, blade: 0.22 },
  'hit.bone': { boneHz: 900, rattle: 0.35 },
  tree: { trunkHz: 65, crack: 1, crackGrains: 220, tear: 0.9, snaps: 7, bed: 0.6, groan: 0.7, rush: 1.2, crash: 1.4, crashGrains: 140, rumble: 0.6, bounce: 0.35, bounceAt: 0.14, heftShift: 0 },
  'door.wood': { latch: 0.7, latchHz: 4000, lockGap: 1, scrape: 1, snap: 1, rattle: 1, slam: 1, slamAt: 0.21, boom: 0.9, thud: 0.8, body: 0.7, thudHz: 70, len: 0.09, knock: 1.6, whump: 0.15, latchClick: 0.4, mid: 0.45, rebound: 0.35, panel: 0.35, panelHz: 95, panelRing: 0.05 },
  'door.metal': { clank: 0.8, latchHz: 3200, lockGap: 1, scrape: 1, snap: 1, rattle: 1, slam: 1, slamAt: 0.2, slamGap: 0.07, boom: 0.7, thud: 0.5, body: 0.5, thudHz: 60, len: 0.1, knock: 1.6, whump: 0.15, latchClick: 0.45, mid: 0.35, rebound: 0.35, ring: 1, ringHz: 320, ringDecay: 0.6, edge: 0.5 },
};
// the tuning object a sound reads (doors share theirs between opening and shutting)
export const tuneOf = (name) => SOUND_TUNING[SOUNDS[name].tune || name];

// the lab's sliders: [key, label, min, max, step] for each tuning object
export const SOUND_SPEC = {
  chop: [
    ['biteMs', 'Blade bite: contact length (ms; shorter is brighter)', 0.05, 2, 0.01],
    ['headRing', 'Axe head ring', 0, 1, 0.01],
    ['trunkHz', 'Trunk pitch (Hz)', 60, 400, 1],
    ['trunkRing', 'Trunk ring (s)', 0.02, 0.4, 0.005],
    ['bodyMs', 'Trunk knock: contact length (ms)', 0.2, 5, 0.05],
    ['thud', 'Low thud', 0, 1.5, 0.01],
    ['crunch', 'Crunch of the cut', 0, 1.5, 0.01],
    ['splinters', 'Splinters (count)', 0, 40, 1],
    ['splinterGain', 'Splinters: level', 0, 1.5, 0.01],
    ['leaves', 'Leaves shiver: level', 0, 1, 0.01],
    ['leavesLen', 'Leaves shiver: length (s)', 0.1, 1.5, 0.01],
  ],
  'step.grass': [['thud', 'Thud', 0, 1.5, 0.01], ['swish', 'Blades swishing', 0, 1.5, 0.01], ['stems', 'Stems snapping', 0, 1, 0.01], ['len', 'Swish length (s)', 0.03, 0.3, 0.005], ['gap', 'Heel to toe gap (×)', 0.3, 2, 0.01]],
  'step.cobble': [['stoneHz', 'Stone pitch (Hz)', 500, 3500, 10], ['click', 'Heel click', 0, 1.5, 0.01], ['thud', 'Thud', 0, 1.5, 0.01], ['grit', 'Grit', 0, 1, 0.01], ['scuff', 'Scuff: level', 0, 1, 0.01], ['scuffChance', 'Scuff: chance a step', 0, 1, 0.01], ['gap', 'Heel to toe gap (×)', 0.3, 2, 0.01]],
  'step.snow': [['crunch', 'Crunch', 0, 1.5, 0.01], ['squeak', 'Squeak', 0, 1, 0.01], ['thud', 'Thud', 0, 1.5, 0.01], ['len', 'Crunch length (s)', 0.05, 0.4, 0.005], ['gap', 'Heel to toe gap (×)', 0.3, 2, 0.01]],
  'step.sand': [['thud', 'Thud', 0, 1.5, 0.01], ['hiss', 'Grains hiss', 0, 1.5, 0.01], ['slide', 'Slide', 0, 1, 0.01], ['len', 'Length (s)', 0.05, 0.5, 0.005], ['gap', 'Heel to toe gap (×)', 0.3, 2, 0.01]],
  'step.dirt': [['thud', 'Thud', 0, 1.5, 0.01], ['gravel', 'Gravel', 0, 1, 0.01], ['grit', 'Grit', 0, 1, 0.01], ['gap', 'Heel to toe gap (×)', 0.3, 2, 0.01]],
  'step.wood': [['plankHz', 'Plank pitch (Hz)', 80, 600, 1], ['ring', 'Plank ring (s)', 0.01, 0.3, 0.005], ['knock', 'Knock', 0, 1.5, 0.01], ['thud', 'Thud', 0, 1.5, 0.01], ['creak', 'Board creak: level', 0, 1, 0.01], ['creakChance', 'Board creak: chance a step', 0, 1, 0.01], ['gap', 'Heel to toe gap (×)', 0.3, 2, 0.01]],
  'hit.flesh': [['bodyHz', 'Body pitch (Hz)', 40, 250, 1], ['bodyMs', 'Contact length (ms; longer is duller)', 1, 12, 0.1], ['wet', 'Wet', 0, 1.5, 0.01], ['fur', 'Fur and hide', 0, 1, 0.01], ['blade', 'Blade slice', 0, 1.5, 0.01]],
  'hit.padded': [['bodyHz', 'Body pitch (Hz)', 40, 250, 1], ['bodyMs', 'Contact length (ms)', 1, 12, 0.1], ['slap', 'Leather slap', 0, 1.5, 0.01], ['cloth', 'Cloth', 0, 1.5, 0.01], ['blade', 'Blade tearing cloth', 0, 1.5, 0.01]],
  'hit.bone': [['boneHz', 'Bone pitch (Hz)', 300, 2500, 10], ['rattle', 'Rattle', 0, 1, 0.01]],
  tree: [['trunkHz', 'Trunk pitch (Hz)', 30, 200, 1], ['crack', 'Crack as it gives', 0, 1.5, 0.01], ['crackGrains', 'Crack: splinters (count)', 20, 600, 1], ['tear', 'Tearing while it falls', 0, 1.5, 0.01], ['snaps', 'Tearing: snaps a second', 1, 30, 1], ['bed', 'Tearing: the continuous tearing under the snaps', 0, 2, 0.01], ['groan', 'Tearing: low groan', 0, 1.5, 0.01], ['rush', 'Rush through the air into the landing', 0, 1.5, 0.01], ['crash', 'Crash on landing', 0, 1.5, 0.01], ['crashGrains', 'Crash: branches breaking (count)', 0, 500, 1], ['rumble', 'Crash: low rumble after', 0, 1.5, 0.01], ['bounce', 'Bounce knock', 0, 1, 0.01], ['bounceAt', 'Bounce: after (s)', 0.05, 0.4, 0.005], ['heftShift', 'Every tree lighter (-) or heavier (+)', -0.5, 0.5, 0.01]],
  'door.wood': [['latch', 'Lock opening', 0, 1.5, 0.01], ['latchHz', 'Lock: top of its steel partials (Hz)', 800, 6000, 10], ['lockGap', 'Lock: timing (× slower)', 0.3, 3, 0.01], ['scrape', 'Lock: key scraping between clicks', 0, 3, 0.01], ['snap', 'Lock: bright snap of each click', 0, 3, 0.01], ['rattle', 'Lock: parts rattling after the bolt', 0, 3, 0.01], ['slam', 'Thud (shutting)', 0, 1.5, 0.01], ['slamAt', 'Thud lands after (s)', 0.05, 0.5, 0.005], ['boom', 'Thud: low boom', 0, 1.5, 0.01], ['thud', 'Thud: dull thump', 0, 1.5, 0.01], ['body', 'Thud: body (80-250 Hz)', 0, 1.5, 0.01], ['thudHz', 'Thud pitch (Hz)', 35, 160, 1], ['len', 'Thud length (s)', 0.03, 0.3, 0.005], ['knock', 'Thud: crack of the edge on the frame', 0, 1.5, 0.01], ['panel', 'Panel knock', 0, 1.5, 0.01], ['panelHz', 'Panel pitch (Hz)', 40, 300, 1], ['panelRing', 'Panel ring (s)', 0.02, 0.3, 0.005], ['whump', 'Shut: the air it pushes ahead of it', 0, 1, 0.01], ['latchClick', 'Shut: latch clicking over the plate', 0, 1.5, 0.01], ['mid', 'Thud: 250-500 Hz body', 0, 1.5, 0.01], ['rebound', 'Shut: rebound rattle after', 0, 1, 0.01]],
  'door.metal': [['clank', 'Lock opening', 0, 1.5, 0.01], ['latchHz', 'Lock: top of its steel partials (Hz)', 800, 6000, 10], ['lockGap', 'Lock: timing (× slower)', 0.3, 3, 0.01], ['scrape', 'Lock: key scraping between clicks', 0, 3, 0.01], ['snap', 'Lock: bright snap of each click', 0, 3, 0.01], ['rattle', 'Lock: parts rattling after the bolt', 0, 3, 0.01], ['slam', 'Thud (shutting)', 0, 1.5, 0.01], ['slamAt', 'Thud lands after (s)', 0.05, 0.5, 0.005], ['slamGap', 'Gap between the two leaves (s)', 0, 0.15, 0.001], ['boom', 'Thud: low boom', 0, 1.5, 0.01], ['thud', 'Thud: dull thump', 0, 1.5, 0.01], ['body', 'Thud: body (80-250 Hz)', 0, 1.5, 0.01], ['thudHz', 'Thud pitch (Hz)', 35, 160, 1], ['len', 'Thud length (s)', 0.03, 0.3, 0.005], ['knock', 'Thud: crack of the edge on the frame', 0, 1.5, 0.01], ['ring', 'Leaf ring', 0, 1.5, 0.01], ['ringHz', 'Leaf pitch (Hz)', 80, 900, 1], ['ringDecay', 'Leaf ring (s)', 0.05, 1.5, 0.01], ['edge', 'Leaf edge clang (bright)', 0, 1.5, 0.01], ['whump', 'Shut: the air it pushes ahead of it', 0, 1, 0.01], ['latchClick', 'Shut: latch clicking over the plate', 0, 1.5, 0.01], ['mid', 'Thud: 250-500 Hz body', 0, 1.5, 0.01], ['rebound', 'Shut: rebound rattle after', 0, 1, 0.01]],
};

// renders one variant of one layer (a Float32Array, peak 0.9), the same every time for that seed
export function renderLayer(name, layer, seed, P, sr) {
  const k = new Kit(sr, seed);
  let b = SOUNDS[name].layers[layer].render(k, P);
  b = k.finish(k.trim(b));
  return k.norm(b, 0.9);
}
