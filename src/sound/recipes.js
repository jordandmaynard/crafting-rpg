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
        rnd() < 0.85 ? { layer: 'leaves', gain: P.leaves, delay: 0.015 + 0.03 * rnd(), rate: 0.9 + 0.2 * rnd() } : null,
      ];
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
  // The door in the game eases open or shut in about a quarter of a second (most of the way in 0.23 s), so the close's
  // slam lands at P.slamAt. o.leaves: 2 for a pair of doors (each leaf its own creak or groan and its own slam).
  'door.wood.open': {
    label: 'Wooden door opens', group: 'doors', tune: 'door.wood',
    layers: {
      latch: { n: 4, render: (k, P) => woodLatch(k, P) },
      creak: { n: 5, render: (k, P) => woodCreak(k, P, 0.5) },
    },
    compose: (P, o, rnd) => [
      { layer: 'latch', gain: P.latch, delay: 0, rate: 0.95 + 0.1 * rnd() },
      rnd() < P.creakChance ? { layer: 'creak', gain: P.creak, delay: 0.03 + 0.02 * rnd(), rate: 0.92 + 0.16 * rnd() } : null,
    ],
  },
  'door.wood.close': {
    label: 'Wooden door shuts', group: 'doors', tune: 'door.wood',
    layers: {
      creak: { n: 5, render: (k, P) => woodCreak(k, P, 0.24) },
      slam: { n: 6, render(k, P) {
        const sec = 0.5, out = k.buf(sec);
        k.add(out, strike(k, 0.0016, k.modes(k.near(P.panelHz, 0.1), PLANK, P.panelRing, { damp: 0.7, tilt: 0.35, scatter: 0.06 }), sec, { grit: 0.3, bounces: 3, spread: 0.004 }), 1);
        k.add(out, thud(k, 170, 0.06, sec), P.thud);
        k.grains(out, { count: 7, t0: 0.004, spread: 0.07, lo: 2000, hi: 5200, dur: [0.006, 0.025], kind: 'ping', pow: 1.4, gain: P.rattle });
        return k.norm(out);
      } },
      latch: { n: 4, render: (k, P) => woodLatch(k, P) },
    },
    compose: (P, o, rnd) => [
      rnd() < P.creakChance ? { layer: 'creak', gain: P.creak * 0.8, delay: 0, rate: 0.95 + 0.1 * rnd() } : null,
      { layer: 'slam', gain: P.slam, delay: P.slamAt * (0.93 + 0.1 * rnd()), rate: 0.95 + 0.1 * rnd() },
      { layer: 'latch', gain: P.latch * 0.7, delay: P.slamAt + 0.006, rate: 0.95 + 0.1 * rnd() },
    ],
  },
  'door.metal.open': {
    label: 'Metal double doors open', group: 'doors', tune: 'door.metal',
    layers: {
      clank: { n: 4, render: (k, P) => metalClank(k, P) },
      groan: { n: 5, render: (k, P) => metalGroan(k, P, 0.6) },
    },
    compose(P, o, rnd) {
      const L = [{ layer: 'clank', gain: P.clank, delay: 0, rate: 0.95 + 0.1 * rnd() }];
      for (let j = 0; j < (o.leaves ?? 2); j++) L.push({ layer: 'groan', gain: P.groan * (j ? 0.8 : 1), delay: 0.04 + j * (0.03 + 0.06 * rnd()), rate: j ? 1.04 + 0.04 * rnd() : 0.96 + 0.04 * rnd() });
      return L;
    },
  },
  'door.metal.close': {
    label: 'Metal double doors shut', group: 'doors', tune: 'door.metal',
    layers: {
      groan: { n: 5, render: (k, P) => metalGroan(k, P, 0.3) },
      clang: { n: 6, render(k, P) {
        const sec = Math.max(0.4, P.ringDecay * 1.6), out = k.buf(sec);
        k.add(out, strike(k, 0.0006, k.modes(k.near(P.ringHz, 0.08), PLATE, P.ringDecay, { damp: 0.55, tilt: 0.45, scatter: 0.03, extra: { drift: 0.003, beat: 1.4 } }), sec, { grit: 0.2, bounces: 2, spread: 0.002, jitter: 0.015 }), 1);
        k.add(out, thud(k, 150, 0.08, sec), P.thud);
        return k.norm(out);
      } },
      clank: { n: 4, render: (k, P) => metalClank(k, P) },
    },
    compose(P, o, rnd) {
      const n = o.leaves ?? 2, L = [];
      for (let j = 0; j < n; j++) L.push({ layer: 'groan', gain: P.groan * 0.8 * (j ? 0.8 : 1), delay: j * 0.02 * rnd(), rate: j ? 1.04 : 0.97 });
      for (let j = 0; j < n; j++) L.push({ layer: 'clang', gain: P.clang * (j ? 0.75 : 1), delay: P.slamAt + j * P.slamGap * (0.6 + 0.8 * rnd()), rate: j ? 0.96 + 0.03 * rnd() : 1 + 0.03 * rnd() });
      L.push({ layer: 'clank', gain: P.clank * 0.8, delay: P.slamAt + (n - 1) * P.slamGap + 0.03, rate: 0.95 + 0.1 * rnd() });
      return L;
    },
  },
};

// a wooden door's iron latch: the bar lifting (a small clink) and dropping back a moment later
function woodLatch(k, P) {
  const out = k.buf(0.2), ms = k.scatterModes(5, 2000, 5500, 0.015, 0.06, { drift: 0.002 });
  k.add(out, strike(k, 0.00015, ms, 0.12, { grit: 0.3, bounces: 1, spread: 0.001 }), 1);
  k.add(out, strike(k, 0.00015, ms, 0.12, { grit: 0.3, bounces: 2, spread: 0.0015 }), k.r(0.5, 0.8), k.r(0.04, 0.08));
  return k.norm(out);
}
// the hinges creaking as the door swings (sec long): a stick-slip that speeds up and slows as the door moves, through
// the door's panel (low) and the hinge pin (high)
function woodCreak(k, P, sec) {
  const r0 = k.near(P.creakRate, 0.3), ex = k.stickSlip(sec, (t) => r0 * (0.35 + 1.3 * Math.sin(Math.PI * clamp(t / sec, 0, 1))), (t) => Math.pow(Math.sin(Math.PI * clamp(t / sec, 0, 1)), 0.6), { jitter: 0.3 });
  const out = k.modal(ex, [...k.modes(k.near(P.panelHz * 2, 0.1), PLANK, 0.06, { damp: 0.6, tilt: 0.4, scatter: 0.1 }), ...k.scatterModes(4, 700, 1800, 0.02, 0.05)], sec + 0.1);
  return k.norm(out);
}
// a heavy latch or bar on metal doors: a clank that rings a little
function metalClank(k, P) {
  const sec = 0.45, out = k.buf(sec);
  k.add(out, strike(k, 0.0003, k.scatterModes(8, 600, 3200, 0.08, 0.35, { drift: 0.004, beat: 1.5 }), sec, { grit: 0.3, bounces: 2, spread: 0.0015 }), 1);
  k.add(out, thud(k, 220, 0.02, sec), 0.5);
  return k.norm(out);
}
// a heavy metal leaf's hinge: a low groan (a slow ratchet of slips through the leaf), and a squeal that comes and goes
function metalGroan(k, P, sec) {
  const r0 = k.near(P.groanRate, 0.25), env = (t) => Math.pow(Math.sin(Math.PI * clamp(t / sec, 0, 1)), 0.5);
  const ex = k.stickSlip(sec, (t) => r0 * (0.6 + 0.8 * Math.sin(Math.PI * clamp(t / sec, 0, 1))), env, { jitter: 0.35, sharp: 0.0003 });
  const out = k.norm(k.modal(ex, k.modes(k.near(P.ringHz * 0.5, 0.1), PLATE, 0.18, { damp: 0.5, tilt: 0.5, scatter: 0.04, extra: { drift: 0.002, beat: 1 } }), sec + 0.25));
  if (P.squeal > 0) {
    const f = k.near(P.squealHz, 0.2), sq = k.stickSlip(sec, (t) => f * (1 + 0.04 * Math.sin(Math.PI * 3 * t / sec)), (t) => env(t) * clamp(Math.sin(Math.PI * (t / sec - 0.15) * 1.4), 0, 1), { jitter: 0.04, sharp: 0.00008 });
    k.add(out, k.norm(k.bp(sq, f * 2, 3)), P.squeal);
  }
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
  'door.wood': { latch: 0.5, creak: 0.55, creakChance: 0.8, creakRate: 140, panelHz: 95, panelRing: 0.16, slam: 1, slamAt: 0.21, thud: 0.9, rattle: 0.2 },
  'door.metal': { clank: 0.7, groan: 0.7, groanRate: 45, squeal: 0.25, squealHz: 650, ringHz: 320, ringDecay: 0.9, clang: 1, slamAt: 0.2, slamGap: 0.035, thud: 0.8 },
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
  'door.wood': [['latch', 'Latch', 0, 1.5, 0.01], ['creak', 'Hinge creak', 0, 1.5, 0.01], ['creakChance', 'Creak: chance', 0, 1, 0.01], ['creakRate', 'Creak: slips a second (low groans, high squeaks)', 30, 600, 1], ['panelHz', 'Door panel pitch (Hz)', 40, 300, 1], ['panelRing', 'Panel ring (s)', 0.03, 0.5, 0.005], ['slam', 'Slam', 0, 1.5, 0.01], ['slamAt', 'Slam lands after (s)', 0.05, 0.5, 0.005], ['thud', 'Slam thud', 0, 1.5, 0.01], ['rattle', 'Latch rattle', 0, 1, 0.01]],
  'door.metal': [['clank', 'Latch clank', 0, 1.5, 0.01], ['groan', 'Hinge groan', 0, 1.5, 0.01], ['groanRate', 'Groan: slips a second', 10, 200, 1], ['squeal', 'Hinge squeal', 0, 1, 0.01], ['squealHz', 'Squeal pitch (Hz)', 200, 1600, 5], ['ringHz', 'Leaf pitch (Hz)', 80, 900, 1], ['ringDecay', 'Leaf ring (s)', 0.1, 3, 0.01], ['clang', 'Clang', 0, 1.5, 0.01], ['slamAt', 'Clang lands after (s)', 0.05, 0.5, 0.005], ['slamGap', 'Gap between the two leaves (s)', 0, 0.15, 0.001], ['thud', 'Clang thud', 0, 1.5, 0.01]],
};

// renders one variant of one layer (a Float32Array, peak 0.9), the same every time for that seed
export function renderLayer(name, layer, seed, P, sr) {
  const k = new Kit(sr, seed);
  let b = SOUNDS[name].layers[layer].render(k, P);
  b = k.finish(k.trim(b));
  return k.norm(b, 0.9);
}
