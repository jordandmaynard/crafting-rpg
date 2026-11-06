// The places sounds are heard in (v892, option C of the sound plan): an impulse response generated for each kind of
// place, played through a convolver, chosen by where the hero stands (index.html soundRoom) and crossfaded as you go
// from one to the next. Each is a few early reflections (the ground, trees, walls: a little different in each ear)
// and then a diffuse tail whose highs die sooner than its lows, darkening as it fades.
//
// pre: seconds before anything comes back; er: [count, from s, to s, level] early reflections; tail: its level, rtLo
// and rtHi: seconds for the lows and the highs to fall 60 dB; start: when the tail builds in (s); dark: Hz the tail is
// darkened to by its end; boxy: [Hz, dB] a small room's colour; wet: how much of every sound goes to this room.

import { Kit, clamp } from './dsp.js';

export const ROOMS = {
  open: { label: 'Open ground', pre: 0.003, er: [2, 0.004, 0.012, 0.45], tail: 0.12, rtLo: 0.8, rtHi: 0.3, start: 0.07, dark: 2500, len: 1.1, wet: 0.22 },
  forest: { label: 'Forest', pre: 0.004, er: [14, 0.008, 0.07, 0.32], tail: 0.45, rtLo: 1.0, rtHi: 0.45, start: 0.02, dark: 3800, len: 1.4, wet: 0.32 },
  street: { label: 'Town street', pre: 0.006, er: [7, 0.015, 0.2, 0.55], tail: 0.4, rtLo: 1.3, rtHi: 0.7, start: 0.035, dark: 5000, len: 1.7, wet: 0.32 },
  snow: { label: 'Snowfield (deadened)', pre: 0.004, er: [2, 0.005, 0.02, 0.18], tail: 0.1, rtLo: 0.45, rtHi: 0.18, start: 0.03, dark: 2200, len: 0.7, wet: 0.14 },
  woodRoom: { label: 'Wooden room', pre: 0.001, er: [12, 0.002, 0.018, 0.55], tail: 0.6, rtLo: 0.5, rtHi: 0.3, start: 0.006, dark: 6000, len: 0.9, wet: 0.42, boxy: [240, 4] },
  stoneRoom: { label: 'Stone room', pre: 0.002, er: [12, 0.003, 0.026, 0.55], tail: 0.75, rtLo: 1.1, rtHi: 0.8, start: 0.008, dark: 8000, len: 1.5, wet: 0.5, boxy: [320, 2] },
  hall: { label: 'Stone hall (cathedral)', pre: 0.012, er: [16, 0.015, 0.09, 0.45], tail: 1, rtLo: 3.2, rtHi: 2.2, start: 0.02, dark: 7000, len: 3.8, wet: 0.65 },
};

// the impulse response of a room: [left, right] Float32Arrays at sr
export function renderIR(kind, sr, seed = 1) {
  const R = ROOMS[kind] || ROOMS.open, k = new Kit(sr, seed * 7919 + kind.length), n = Math.round(R.len * sr), out = [];
  for (let ch = 0; ch < 2; ch++) {
    const d = new Float32Array(n);
    // early reflections: short darkened clicks, louder first
    const [cnt, lo, hi, lvl] = R.er;
    const taps = Array.from({ length: cnt }, () => k.r(lo, hi)).sort((a, b) => a - b);
    taps.forEach((t, j) => {
      const i0 = Math.round((R.pre + t) * sr), amp = lvl * Math.pow(0.82, j) * k.r(0.6, 1) * (k.chance(0.5) ? 1 : -1), w = 2 + Math.round(k.r(2, 8));
      for (let q = 0; q < w * 6 && i0 + q < n; q++) d[i0 + q] += amp * Math.exp(-q / w);
    });
    // the tail: lows and highs fading at their own rates, darkened as it goes, built in from `start`
    const kc = 1 - Math.exp(-2 * Math.PI * 1500 / sr), dLo = -6.9078 / R.rtLo, dHi = -6.9078 / R.rtHi;
    let lp = 0, dk = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr - R.pre, w = k.rand() * 2 - 1;
      if (t < 0) continue;
      lp += kc * (w - lp);
      const v = lp * Math.exp(dLo * t) + (w - lp) * Math.exp(dHi * t);
      const fc = R.dark + (14000 - R.dark) * Math.exp(-t * 3 / R.len);
      dk += (1 - Math.exp(-2 * Math.PI * fc / sr)) * (v - dk);
      const build = clamp((t - R.start * 0.3) / Math.max(0.001, R.start), 0, 1);
      d[i] += R.tail * 0.3 * dk * build;
    }
    if (R.boxy) k.filter(d, 'peak', R.boxy[0], 1, R.boxy[1]);
    const f = Math.round(Math.min(0.15, R.len * 0.2) * sr);
    for (let i = 0; i < f; i++) d[n - 1 - i] *= i / f;
    out.push(d);
  }
  // scaled to a set energy, so a room's level is its `wet` (applied by the engine), not how long it is
  let e = 0;
  for (const d of out) for (let i = 0; i < d.length; i++) e += d[i] * d[i];
  const g = 0.6 / Math.sqrt(e / 2 || 1);
  for (const d of out) for (let i = 0; i < d.length; i++) d[i] *= g;
  return out;
}
