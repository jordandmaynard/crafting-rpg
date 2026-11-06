// The sound engine's building blocks (v892): plain functions over Float32Arrays at a sample rate, with a seeded random
// source so a variant renders the same every time. Nothing here touches Web Audio, so it runs in the render worker
// (src/sound/worker.js) as well as on the page.
//
// The idea (Jordan's pick, options A and B of the sound plan): build sounds from what is struck and what strikes it,
// not from tones. A strike is an EXCITATION (a short pulse, shorter and brighter the harder the striker, landing as a
// small cluster of bounces rather than one perfect click) run through a MATERIAL (a bank of decaying resonances, each a
// little detuned, metal ones beating in pairs and falling in pitch as they fade). Loose stuff (grass, gravel, snow,
// sand, splinters, cloth fibres) is a cloud of GRAINS: many tiny events, clumped and uneven, most small and a few big.
// Friction (hinges, creaks) is STICK-SLIP: an uneven train of tiny slips through the material.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// mulberry32: small, fast and good enough for sound
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashStr = (s) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);

export class Kit {
  constructor(sr, seed) {
    this.sr = sr;
    this.rand = rng(seed);
  }
  r(a, b) { return a + (b - a) * this.rand(); }
  // a random value spread round m by a share s (m × (1 ± s))
  near(m, s) { return m * (1 + (this.rand() * 2 - 1) * s); }
  pick(list) { return list[Math.floor(this.rand() * list.length)]; }
  chance(p) { return this.rand() < p; }
  buf(sec) { return new Float32Array(Math.max(1, Math.round(sec * this.sr))); }
  at(sec) { return Math.round(sec * this.sr); }

  // ---- sources ----
  white(sec) { const b = this.buf(sec); for (let i = 0; i < b.length; i++) b[i] = this.rand() * 2 - 1; return b; }
  // pink (Paul Kellet's economy filter): what most natural noise is closer to than white
  pink(sec) {
    const b = this.buf(sec);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < b.length; i++) {
      const w = this.rand() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      b[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    return b;
  }
  brown(sec) {
    const b = this.buf(sec);
    let y = 0;
    for (let i = 0; i < b.length; i++) { y = y * 0.996 + (this.rand() * 2 - 1) * 0.08; b[i] = y; }
    return b;
  }
  // a slowly wandering value round 1 (± depth), changing about `rate` times a second: real decays and textures wobble
  wander(sec, rate, depth) {
    const b = this.buf(sec), k = 1 - Math.exp(-TAU * rate / this.sr);
    let y = 0, goal = 0, next = 0;
    for (let i = 0; i < b.length; i++) {
      if (i >= next) { goal = this.rand() * 2 - 1; next = i + Math.round(this.sr / Math.max(0.1, rate) * this.r(0.5, 1.5)); }
      y += (goal - y) * k;
      b[i] = 1 + depth * y;
    }
    return b;
  }

  // ---- filters (in place) ----
  // a biquad: lp, hp, bp (constant peak), peak (gain dB) or lowshelf / highshelf; f in Hz or a function of seconds
  filter(b, type, f, q = 0.707, dB = 0) {
    const sr = this.sr, fixed = typeof f === 'number';
    let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const set = (hz) => {
      const w = TAU * clamp(hz, 10, sr * 0.45) / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q), A = Math.pow(10, dB / 40);
      let a0;
      if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
      else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
      else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
      else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
      else {
        const s2 = 2 * Math.sqrt(A) * al, lo = type === 'lowshelf';
        if (lo) { b0 = A * ((A + 1) - (A - 1) * cs + s2); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - s2); a0 = (A + 1) + (A - 1) * cs + s2; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - s2; }
        else { b0 = A * ((A + 1) + (A - 1) * cs + s2); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s2); a0 = (A + 1) - (A - 1) * cs + s2; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s2; }
      }
      b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    };
    if (fixed) set(f);
    for (let i = 0; i < b.length; i++) {
      if (!fixed && (i & 15) === 0) set(f(i / sr));
      const x = b[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      b[i] = y;
    }
    return b;
  }
  lp(b, f, q) { return this.filter(b, 'lp', f, q); }
  hp(b, f, q) { return this.filter(b, 'hp', f, q); }
  bp(b, f, q) { return this.filter(b, 'bp', f, q); }

  // ---- envelopes (in place) ----
  // a fast attack (seconds), then a fall to 1/e every tau seconds, starting at delay
  decay(b, tau, attack = 0.0005, delay = 0) {
    const sr = this.sr;
    for (let i = 0; i < b.length; i++) {
      const t = i / sr - delay;
      b[i] *= t < 0 ? 0 : t < attack ? t / attack : Math.exp(-(t - attack) / tau);
    }
    return b;
  }
  shape(b, fn) { for (let i = 0; i < b.length; i++) b[i] *= fn(i / this.sr); return b; }
  // straight lines through [[seconds, level], ...]
  env(b, pts) {
    let k = 1;
    return this.shape(b, (t) => {
      if (t <= pts[0][0]) return pts[0][1];
      while (k < pts.length - 1 && t > pts[k][0]) k++;
      const [t0, v0] = pts[k - 1], [t1, v1] = pts[k];
      return t >= t1 ? v1 : v0 + (v1 - v0) * (t - t0) / (t1 - t0);
    });
  }
  mul(b, m) { for (let i = 0; i < b.length && i < m.length; i++) b[i] *= m[i]; return b; }
  gain(b, g) { for (let i = 0; i < b.length; i++) b[i] *= g; return b; }

  // ---- mixing ----
  add(dst, src, gain = 1, at = 0) {
    const o = Math.round(at * this.sr);
    for (let i = Math.max(0, -o); i < src.length && i + o < dst.length; i++) dst[i + o] += src[i] * gain;
    return dst;
  }
  peak(b) { let m = 0; for (let i = 0; i < b.length; i++) { const a = Math.abs(b[i]); if (a > m) m = a; } return m; }
  norm(b, to = 1) { const m = this.peak(b); if (m > 0) this.gain(b, to / m); return b; }
  // soft clip (tanh, normalised so drive changes colour more than level); asym > 0 bends one side harder (even harmonics)
  saturate(b, drive = 1, asym = 0) {
    if (drive <= 0) return b;
    const k = 1 + drive * 3, n = Math.tanh(k);
    for (let i = 0; i < b.length; i++) { const x = b[i] + asym * b[i] * b[i]; b[i] = Math.tanh(k * x) / n; }
    return b;
  }

  // ---- strikes ----
  // The contact of a strike: a half-sine pulse `dur` seconds long (a hard steel edge 0.1-0.3 ms, a boot 1-3 ms, a paw or
  // a body 3-8 ms), roughened with noise by `grit` (0-1), landing as a cluster of `bounces` smaller re-contacts a
  // fraction of a millisecond to a few apart. Its spectrum falls off above about 1/dur, which is what makes a soft
  // striker dark and a hard one bright, with no filter needed.
  contact(dur, { grit = 0.2, bounces = 2, spread = 0.002, len = 0.06 } = {}) {
    const b = this.buf(Math.max(len, dur * 4 + spread * 2)), sr = this.sr;
    const one = (at, d, amp) => {
      const n = Math.max(2, Math.round(d * sr)), o = Math.round(at * sr);
      for (let i = 0; i < n && o + i < b.length; i++) {
        const s = Math.sin(Math.PI * i / n);
        b[o + i] += amp * (s * (1 - grit) + grit * s * (this.rand() * 2 - 1) * 1.6);
      }
    };
    one(0, dur, 1);
    let t = 0;
    for (let k = 0; k < bounces; k++) { t += this.r(0.2, 1) * spread; one(t, dur * this.r(0.6, 1.4), this.r(0.15, 0.55) / (k + 1)); }
    return b;
  }

  // A material ringing: a bank of resonances excited by `ex`. Each mode is [Hz, t60 seconds, amplitude] and may carry
  // { drift } (a share its pitch is raised by at full swing, falling as it fades: metal) and { beat } (Hz: a twin mode
  // that far off, so the two pulse against each other). Every mode's frequency is jittered by `jitter` (a share), so
  // no two strikes ring quite alike. Returns a new buffer `sec` long.
  modal(ex, modes, sec, { jitter = 0.02 } = {}) {
    const sr = this.sr, out = this.buf(sec), n = out.length;
    const one = (f0, t60, amp, drift) => {
      const r = Math.exp(-6.9078 / (Math.max(0.002, t60) * sr));
      let w = TAU * clamp(f0, 20, sr * 0.45) / sr, c1 = 2 * r * Math.cos(w), c2 = r * r, g = Math.sin(w);
      let y1 = 0, y2 = 0, env = 1;
      for (let i = 0; i < n; i++) {
        if (drift && (i & 31) === 0) {
          env = Math.pow(r, i);
          w = TAU * clamp(f0 * (1 + drift * env), 20, sr * 0.45) / sr; c1 = 2 * r * Math.cos(w); g = Math.sin(w);
        }
        const y = (i < ex.length ? ex[i] * g : 0) + c1 * y1 - c2 * y2;
        y2 = y1; y1 = y;
        out[i] += amp * y;
        if (i > ex.length && Math.abs(y) < 1e-7 && Math.abs(y2) < 1e-7) break;
      }
    };
    for (const m of modes) {
      const [f, t60, amp = 1] = m, o = m[3] || {};
      const fj = f * (1 + (this.rand() * 2 - 1) * jitter), tj = t60 * this.r(0.85, 1.15);
      one(fj, tj, amp, o.drift || 0);
      if (o.beat) one(fj + o.beat * this.r(0.6, 1.4), tj * 0.9, amp * this.r(0.5, 0.9), o.drift || 0);
    }
    return out;
  }

  // A material's mode list from a recipe: `base` Hz, `ratios` (its partials over the base), t60 of the lowest `t60`,
  // higher ones dying faster by `damp` (t60 / ratio^damp), amplitudes falling by `tilt` (1 / ratio^tilt), each ratio
  // jittered by `scatter` (a share: wood and stone are irregular). extra: options carried on every mode (drift, beat).
  modes(base, ratios, t60, { damp = 0.6, tilt = 0.5, scatter = 0.04, extra = null } = {}) {
    return ratios.map((q) => {
      const rq = q * (1 + (this.rand() * 2 - 1) * scatter);
      return [base * rq, t60 / Math.pow(rq, damp), this.r(0.6, 1) / Math.pow(rq, tilt), extra ? { ...extra, beat: extra.beat ? extra.beat * this.r(0.5, 1.5) : 0 } : undefined];
    });
  }
  // scattered inharmonic partials over [lo, hi] Hz (metal clinks and rattles, small stones)
  scatterModes(count, lo, hi, t60lo, t60hi, extra) {
    const m = [];
    for (let k = 0; k < count; k++) m.push([this.r(lo, hi), this.r(t60lo, t60hi), this.r(0.3, 1), extra]);
    return m;
  }

  // ---- loose stuff ----
  // A cloud of grains added into `out`: `count` tiny events over [t0, t0 + spread] seconds, placed by `density(u)`
  // (u 0..1 across the spread; default a quick rise and a long fall), clumped (`clump`: the chance a grain follows the
  // last within a couple of milliseconds), each one either a burst of band-passed noise (`kind` 'noise') or a tiny
  // ringing ping ('ping'), its centre in [lo, hi] Hz, `dur` [min, max] seconds, its level random^pow (high pow: most
  // grains small, a few big, as real crunches are). Returns out.
  grains(out, { count, t0 = 0, spread = 0.1, density = null, lo = 1000, hi = 5000, q = 1.5, dur = [0.001, 0.004], pow = 2.5, gain = 1, kind = 'noise', clump = 0.3, env = null }) {
    const sr = this.sr, dens = density || ((u) => Math.min(1, u * 8) * Math.pow(1 - u, 1.5));
    // the placement: rejection sampling against the density
    const times = [];
    let last = -1;
    for (let k = 0, guard = 0; k < count && guard < count * 40; guard++) {
      let t;
      if (last >= 0 && this.rand() < clump) t = last + this.r(0.0002, 0.0025);
      else { const u = this.rand(); if (this.rand() > dens(u)) continue; t = t0 + u * spread; }
      times.push(t); last = t; k++;
    }
    for (const t of times) {
      const d = this.r(dur[0], dur[1]), f = Math.exp(this.r(Math.log(lo), Math.log(hi))), a = Math.pow(this.rand(), pow) * gain * (env ? env(t) : 1);
      if (a < 1e-4) continue;
      let g;
      if (kind === 'ping') g = this.modal(this.contact(0.00012, { grit: 0.5, bounces: 0, len: 0.002 }), [[f, d * 3, 1]], d * 4, { jitter: 0 });
      else g = this.decay(this.filter(this.white(d * 5), 'bp', f, q), d, 0.0002);
      this.norm(g);
      this.add(out, g, a * (this.rand() < 0.5 ? 1 : -1), t);
    }
    return out;
  }

  // ---- friction ----
  // Stick-slip: a door's hinge, a creaking trunk. An uneven train of tiny slips at `rate(t)` Hz (a function of seconds),
  // each slip's size wandering, with `jitter` (share) in its timing; the train is shaped by env(t). At low rates it's a
  // ratchet of clicks (a groan); as the rate climbs into the hundreds it turns into a squeal at that pitch. Returns
  // the slips alone (an excitation): run it through modal() for the body that sings.
  stickSlip(sec, rate, env, { jitter = 0.25, sharp = 0.00015 } = {}) {
    const b = this.buf(sec), sr = this.sr, w = this.wander(sec, 6, 0.5), sl = Math.max(1, Math.round(sharp * sr));
    let ph = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / sr, rr = Math.max(0, rate(t));
      ph += rr * (1 + (this.rand() * 2 - 1) * jitter) / sr;
      if (ph >= 1) {
        ph -= Math.floor(ph);
        const a = env(t) * w[i] * this.r(0.5, 1);
        for (let j = 0; j < sl * 2 && i + j < b.length; j++) b[i + j] += a * (j < sl ? 1 : -1) * (1 - j / (sl * 2));
      }
    }
    return b;
  }

  // ---- finishing ----
  // a short fade at the end and at the start (no clicks), DC removed
  finish(b, fadeIn = 0.0005, fadeOut = 0.005) {
    const fi = Math.min(b.length, Math.round(fadeIn * this.sr)), fo = Math.min(b.length, Math.round(fadeOut * this.sr));
    for (let i = 0; i < fi; i++) b[i] *= i / fi;
    for (let i = 0; i < fo; i++) b[b.length - 1 - i] *= i / fo;
    let x1 = 0, y1 = 0;
    for (let i = 0; i < b.length; i++) { const y = b[i] - x1 + 0.9995 * y1; x1 = b[i]; y1 = y; b[i] = y; }
    for (let i = 0; i < b.length; i++) if (!Number.isFinite(b[i])) b[i] = 0;
    return b;
  }
  // trims trailing near-silence (below -70 dB of the peak), keeping a short tail
  trim(b) {
    const m = this.peak(b) * 3e-4;
    let n = b.length;
    while (n > 1 && Math.abs(b[n - 1]) < m) n--;
    return b.slice(0, Math.min(b.length, n + Math.round(0.01 * this.sr)));
  }
}
