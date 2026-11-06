// Emberwild's sound engine (v892). Everything is synthesized: the recipes (src/sound/recipes.js) are rendered into
// pools of variants by a worker (src/sound/worker.js) when sound first starts, and each play puts a few layers
// together from those pools, a little differently every time (option D). Every sound then goes:
//
//   its layers -> its own brightness (how hard, how far) -> pan -> its group (steps, combat, work, doors, legacy)
//             \-> a send to the room the hero is in (option C: two convolvers, crossfaded as the room changes)
//   groups + room -> low cut -> a touch of saturation -> a mic-like EQ -> glue compression -> limiter -> volume
//
// The last stretch is option E, the "recorded through a mic" chain, set natural and clean (Jordan, 2026-11-06) and
// tunable in T > Sound. The game's old square-wave beeps can be routed through the same room and chain (legacyIn).
//
// Used by index.html (the game) and sounds.html (the sound lab).

import { SOUNDS, SOUND_TUNING, tuneOf, renderLayer } from './recipes.js';
import { ROOMS, renderIR } from './rooms.js';
import { hashStr, clamp } from './dsp.js';

export const SOUND_MIX = {
  engine: 1,       // 1: the new sounds where there are any; 0: the old beeps everywhere (to compare)
  master: 0.9,     // everything
  steps: 0.45,     // each group's level
  combat: 0.9,
  work: 0.85,
  doors: 0.8,
  legacy: 1,       // the old beeps still in use, through the new mix
  legacyRoom: 0.15, // how much of the old beeps goes to the room
  room: 1,         // × every room's own reverb level
  roomFade: 0.5,   // seconds to fade from one room into the next
  near: 3,         // tiles from the hero a sound is at full volume
  fall: 9,         // tiles past that to fall to half
  range: 36,       // tiles: further than this nothing is heard (faded out over its last 40%)
  air: 45,         // tiles over which distance takes the highs away (larger: less)
  pan: 0.75,       // how far a sound at the screen's edge is panned
  variety: 1,      // × each recipe's random re-pitching
  voices: 40,      // sounds at once, at most
  lowCut: 35,      // Hz: the mic chain's low cut
  drive: 0.05,     // saturation mixed in (0 none, 1 all of it)
  presence: 0,   // dB at 3.5 kHz, a mic's presence lift
  airShelf: -2,    // dB above 11 kHz (a mic's gentle top roll-off)
  glue: 1,         // 1: the glue compressor on
  threshold: -18,  // glue compressor threshold (dB) and ratio
  ratio: 2.5,
};

const LAB_KEY = 'emberwild.soundLab';
const GROUPS = ['steps', 'combat', 'work', 'doors', 'legacy'];

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.pools = new Map();   // sound name -> { layer -> [AudioBuffer] }
    this.gen = new Map();     // sound name -> render generation (a retune drops older renders)
    this.last = new Map();    // 'name/layer' -> the variant played last (not played twice running)
    this.irs = new Map();     // room kind -> AudioBuffer
    this.voices = 0;
    this.seedBase = 1;
    this.roomKind = null;
    this.pending = new Map(); // worker job id -> callback
    this.jobId = 1;
    this.todo = 0;
    this.onProgress = null;
    this.onError = null;    // (err) => shown somewhere (the game's error box)
  }

  get ready() { return !!this.ctx; }
  // how many layer variants are still to render
  get rendering() { return this.todo; }

  // Builds the mix on ctx (the game's AudioContext) and starts rendering every sound and the first room.
  start(ctx) {
    if (this.ctx) return;
    this.ctx = ctx;
    const A = ctx, M = SOUND_MIX, g = (v = 1) => { const n = A.createGain(); n.gain.value = v; return n; };
    this.bus = g();
    this.groups = Object.fromEntries(GROUPS.map((n) => { const x = g(); x.connect(this.bus); return [n, x]; }));
    this.legacyIn = g();
    this.legacyIn.connect(this.groups.legacy);
    // the room: two convolvers, one fading in as the other fades out
    this.wetIn = g();
    this.conv = [A.createConvolver(), A.createConvolver()];
    this.convGain = [g(0), g(0)];
    this.conv.forEach((c, i) => { c.normalize = false; this.wetIn.connect(c); c.connect(this.convGain[i]); this.convGain[i].connect(this.bus); });
    this.cur = 0;
    this.legacySend = g(M.legacyRoom);
    this.legacyIn.connect(this.legacySend); this.legacySend.connect(this.wetIn);
    // the mic chain
    this.lowCut = A.createBiquadFilter(); this.lowCut.type = 'highpass'; this.lowCut.Q.value = 0.6;
    this.satDry = g(); this.satWet = g(); this.shaper = A.createWaveShaper(); this.shaper.oversample = '2x';
    this.shaper.curve = satCurve(2.4, 0.08);
    this.presence = A.createBiquadFilter(); this.presence.type = 'peaking'; this.presence.frequency.value = 3500; this.presence.Q.value = 0.8;
    this.airShelf = A.createBiquadFilter(); this.airShelf.type = 'highshelf'; this.airShelf.frequency.value = 11000;
    this.comp = A.createDynamicsCompressor(); this.comp.knee.value = 12; this.comp.attack.value = 0.008; this.comp.release.value = 0.2;
    this.compBy = g();
    this.limiter = A.createDynamicsCompressor(); this.limiter.threshold.value = -1.5; this.limiter.knee.value = 0; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
    this.out = g();
    this.bus.connect(this.lowCut);
    this.lowCut.connect(this.satDry); this.lowCut.connect(this.shaper); this.shaper.connect(this.satWet);
    const sum = g(); this.satDry.connect(sum); this.satWet.connect(sum);
    sum.connect(this.presence); this.presence.connect(this.airShelf);
    this.airShelf.connect(this.comp); this.comp.connect(this.limiter);
    this.airShelf.connect(this.compBy); this.compBy.connect(this.limiter);
    this.limiter.connect(this.out); this.out.connect(A.destination);
    this.mix();
    // the renders
    // (if the worker can't start, or dies, what it still owed is rendered here instead)
    try {
      this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this.#answer(e.data);
      this.worker.onerror = (e) => { e.preventDefault?.(); this.worker = null; const owed = [...this.pending.values()]; this.pending.clear(); for (const p of owed) this.#job(p.msg, p.done); };
    } catch { this.worker = null; }
    for (const name of Object.keys(SOUNDS)) this.#renderSound(name);
    this.setRoom('open');
  }

  // applies SOUND_MIX to the graph (call after changing it)
  mix() {
    if (!this.ctx) return;
    const M = SOUND_MIX, t = this.ctx.currentTime, set = (p, v) => p.setTargetAtTime(v, t, 0.03);
    for (const n of GROUPS) set(this.groups[n].gain, M[n]);
    set(this.legacySend.gain, M.legacyRoom);
    set(this.lowCut.frequency, Math.max(10, M.lowCut));
    const d = clamp(M.drive, 0, 1);
    set(this.satWet.gain, d); set(this.satDry.gain, 1 - d * 0.6);
    set(this.presence.gain, M.presence); set(this.airShelf.gain, M.airShelf);
    this.comp.threshold.value = M.glue > 0.5 ? M.threshold : 0; this.comp.ratio.value = M.glue > 0.5 ? M.ratio : 1;
    set(this.comp.threshold, M.glue > 0.5 ? M.threshold : 0);
    set(this.out.gain, M.master);
    this.#roomLevel();
  }

  // ---- rendering ----
  #job(msg, done) {
    if (this.worker) { const id = this.jobId++; this.pending.set(id, { msg, done }); this.worker.postMessage({ id, ...msg }); return; }
    // no worker: rendered here a little later, one job per tick, so a frame is never held long
    setTimeout(() => {
      if (msg.job === 'layer') done({ data: renderLayer(msg.name, msg.layer, msg.seed, msg.P, msg.sr) });
      else { const [L, R] = renderIR(msg.kind, msg.sr, msg.seed); done({ L, R }); }
    }, 0);
  }
  #answer(m) {
    const p = this.pending.get(m.id);
    this.pending.delete(m.id);
    if (m.error) (this.onError || console.warn)(new Error('Sound render: ' + m.error));
    else if (p) p.done(m);
  }
  #renderSound(name) {
    const S = SOUNDS[name], gen = (this.gen.get(name) || 0) + 1, sr = this.ctx.sampleRate, P = { ...tuneOf(name) };
    this.gen.set(name, gen);
    // (a first render plays as soon as each layer has a variant; a retune swaps the whole new set in once it's done,
    // the old pools playing meanwhile)
    const fresh = {}, first = !this.pools.has(name);
    for (const layer of Object.keys(S.layers)) fresh[layer] = [];
    if (first) this.pools.set(name, fresh);
    let left = 0;
    for (const [layer, L] of Object.entries(S.layers)) {
      for (let v = 0; v < L.n; v++) {
        left++; this.todo++;
        const seed = (hashStr(name + '/' + layer) + v * 7919 + this.seedBase * 104729) >>> 0;
        this.#job({ job: 'layer', name, layer, seed, P, sr }, (m) => {
          this.todo--;
          left--;
          if (this.gen.get(name) === gen) {
            const b = this.ctx.createBuffer(1, m.data.length, sr);
            b.copyToChannel(m.data, 0);
            fresh[layer].push(b);
            if (left === 0) this.pools.set(name, fresh);
          }
          this.onProgress?.(this.todo);
        });
      }
    }
  }
  // re-renders the sounds that read the tuning `key` (a SOUNDS name or a shared tune such as 'door.wood')
  retune(key) {
    if (!this.ctx) return;
    for (const name of Object.keys(SOUNDS)) if (name === key || SOUNDS[name].tune === key) this.#renderSound(name);
  }
  // new random variants of everything (or of one sound's tuning key)
  reroll(key = null) {
    this.seedBase = (this.seedBase * 1103515245 + 12345) & 0x7fffffff || 1;
    if (key) this.retune(key); else for (const name of Object.keys(SOUNDS)) this.#renderSound(name);
  }

  // ---- rooms ----
  setRoom(kind) {
    if (!this.ctx || !ROOMS[kind] || kind === this.roomKind) return;
    this.roomKind = kind;
    const ir = this.irs.get(kind);
    if (ir) { this.#fadeTo(ir); return; }
    this.#job({ job: 'ir', kind, sr: this.ctx.sampleRate, seed: 3 }, (m) => {
      const b = this.ctx.createBuffer(2, m.L.length, this.ctx.sampleRate);
      b.copyToChannel(m.L, 0); b.copyToChannel(m.R, 1);
      this.irs.set(kind, b);
      if (this.roomKind === kind) this.#fadeTo(b);
    });
  }
  #fadeTo(buf) {
    const t = this.ctx.currentTime, nx = 1 - this.cur, tc = Math.max(0.01, SOUND_MIX.roomFade) / 3;
    this.conv[nx].buffer = buf;
    this.convGain[this.cur].gain.setTargetAtTime(0, t, tc);
    this.cur = nx;
    this.#roomLevel(tc);
  }
  #roomLevel(tc = 0.03) {
    if (!this.ctx || !this.roomKind) return;
    const R = ROOMS[this.roomKind];
    this.convGain[this.cur].gain.setTargetAtTime(R.wet * SOUND_MIX.room, this.ctx.currentTime, tc);
  }

  // ---- playing ----
  has(name) { const p = this.pools.get(name); return !!p && Object.values(p).every((l) => l.length); }
  // Plays a sound. o: { dist (tiles from the hero), pan (-1..1), strength (about 0.3-1.5, 1 a normal blow), blunt,
  // leaves, deep, gain }. False if it can't (not started, not rendered yet, too many playing): play the old one then.
  play(name, o = {}) {
    const S = SOUNDS[name], M = SOUND_MIX;
    if (!this.ctx || !S || M.engine < 0.5 || !this.has(name)) return false;
    if (this.voices >= M.voices) return true;
    const A = this.ctx, now = A.currentTime, pool = this.pools.get(name), P = tuneOf(name);
    const dist = Math.max(0, o.dist || 0), s = o.strength ?? 1;
    const level = (o.gain ?? 1) / (1 + Math.max(0, dist - M.near) / Math.max(0.1, M.fall)) * clamp((M.range - dist) / Math.max(0.1, M.range * 0.4), 0, 1);
    if (level < 0.003) return true;
    const vg = A.createGain(); vg.gain.value = level;
    const lp = A.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.value = clamp(20000 * Math.exp(-dist / Math.max(1, M.air)) * (0.45 + 0.55 * clamp(s, 0, 1)), 700, 20000);
    const pan = A.createStereoPanner(); pan.pan.value = clamp((o.pan || 0) * M.pan, -1, 1);
    const send = A.createGain(); send.gain.value = clamp(1 + dist / 40, 1, 1.4);
    vg.connect(lp); lp.connect(pan); pan.connect(this.groups[S.group] || this.groups.work); pan.connect(send); send.connect(this.wetIn);
    let end = 0, any = false;
    for (const c of S.compose(P, o, Math.random)) {
      if (!c || c.gain <= 0) continue;
      const list = pool[c.layer];
      if (!list?.length) continue;
      const key = name + '/' + c.layer;
      let v = Math.floor(Math.random() * list.length);
      if (list.length > 1 && v === this.last.get(key)) v = (v + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
      this.last.set(key, v);
      const src = A.createBufferSource(), sg = A.createGain();
      src.buffer = list[v];
      src.playbackRate.value = clamp(1 + ((c.rate ?? 1) - 1) * M.variety, 0.25, 4);
      sg.gain.value = c.gain * (0.85 + 0.3 * Math.random());
      src.connect(sg); sg.connect(vg);
      const at = now + Math.max(0, c.delay || 0);
      src.start(at);
      end = Math.max(end, at + src.buffer.duration / src.playbackRate.value);
      any = true;
    }
    if (!any) { vg.disconnect(); return false; }
    this.voices++;
    // (the whole voice let go once its last layer and the room's tail have had time to finish)
    setTimeout(() => { this.voices--; pan.disconnect(); send.disconnect(); }, (end - now) * 1000 + 100);
    return true;
  }

  // ---- the lab's tuning, kept in this browser (the game reads it too while T > Sound > use the lab's tuning is on) ----
  static loadLab() { try { return JSON.parse(localStorage.getItem(LAB_KEY) || 'null'); } catch { return null; } }
  static saveLab(data) { try { localStorage.setItem(LAB_KEY, JSON.stringify(data)); } catch { /* storage full or off */ } }
  static clearLab() { try { localStorage.removeItem(LAB_KEY); } catch { /* */ } }
  // applies saved lab tuning onto SOUND_TUNING (and SOUND_MIX if mix too): how many values it changed
  static applyLab(data = SoundEngine.loadLab(), mix = false) {
    if (!data) return 0;
    let n = 0;
    for (const [k, P] of Object.entries(data.tuning || {})) if (SOUND_TUNING[k]) for (const [p, v] of Object.entries(P)) if (p in SOUND_TUNING[k] && typeof v === 'number') { SOUND_TUNING[k][p] = v; n++; }
    if (mix) for (const [p, v] of Object.entries(data.mix || {})) if (p in SOUND_MIX && typeof v === 'number') { SOUND_MIX[p] = v; n++; }
    return n;
  }
}

// tanh soft clip, normalised, with a little asymmetry (even harmonics, like a preamp)
function satCurve(k, asym) {
  const n = 2048, c = new Float32Array(n), nt = Math.tanh(k);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, y = x + asym * (x * x - 1 / 3); c[i] = Math.tanh(k * y) / nt; }
  return c;
}
