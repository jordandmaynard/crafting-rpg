// Spike capture (the G panel's, from Crafting and Conquest): while it's on, the game's main objects' methods are timed (wrapped, see watch) and
// each frame's calls build a tree under the frame's CPU laps (the profiler's rows). A frame whose CPU time passes
// SPIKE_TUNING.ms is kept (the last SPIKE_TUNING.keep of them), and with SPIKE_TUNING.pause on the game stops on
// it (until Resume), so the slow frame's tree can be opened down to the call that took the time. Off, nothing's
// wrapped and it costs nothing. (Timing a call adds a little to it: a method called very often in a frame isn't timed
// after that frame, see SPIKE_TUNING.hot, so the times stay true.)

export const SPIKE_TUNING = {
  ms: 30,    // a frame's CPU (JavaScript) ms that counts as a spike
  keep: 8,   // spikes kept
  pause: 1,  // stop the game on a spike (1) or carry on (0)
  minMs: 0.05, // calls shorter than this (in all) left out of a kept tree
  hot: 3000, // a method called more than this many times in a frame isn't timed after (its time counts as its caller's)
};

const node = (name) => ({ name, ms: 0, n: 0, kids: new Map() });

export class SpikeRecorder {
  constructor() {
    this.on = false;
    this.holding = false;   // the game stopped on a spike (see SPIKE_TUNING.pause)
    this.spikes = [];       // kept: { ms, gap, clock, tree }, newest last
    this.shownSpike = null; // the one shown in the panel
    this.wrapped = [];      // { obj, k, f, own, calls } to put back
    this.hot = [];          // the names of methods called too often to time
    this.sources = () => []; // [object, label] pairs to time (the game's)
    this.root = null;
    this.top = null;
    this.seg = null;
    this.segT = 0;
    this.lastFrame = 0;
    this.changed = false;
  }

  toggle() {
    this.on = !this.on;
    if (this.on) for (const [obj, label] of this.sources()) this.watch(obj, label);
    else this.unwatch();
    this.root = this.top = this.seg = null;
    this.holding = false;
    this.changed = true;
    return this.on;
  }

  // Wraps every method of obj (its own and its classes'), each call timed as a child of whatever's running.
  watch(obj, label) {
    if (!obj || typeof obj !== 'object' || this.wrapped.some((w) => w[0] === obj)) return;
    const rec = this, seen = new Set();
    for (let o = obj; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      for (const k of Object.getOwnPropertyNames(o)) {
        if (k === 'constructor' || seen.has(k)) continue;
        seen.add(k);
        const d = Object.getOwnPropertyDescriptor(o, k);
        if (!d || typeof d.value !== 'function' || (o === obj && !d.writable)) continue;
        const f = d.value, name = `${label}.${k}`, w = { obj, k, f, own: Object.prototype.hasOwnProperty.call(obj, k), calls: 0, name };
        obj[k] = function (...args) {
          const parent = rec.top;
          w.calls++;
          if (!parent) return f.apply(this, args);
          let n = parent.kids.get(name);
          if (!n) parent.kids.set(name, (n = node(name)));
          rec.top = n;
          const t = performance.now();
          try { return f.apply(this, args); } finally { n.ms += performance.now() - t; n.n++; rec.top = parent; }
        };
        this.wrapped.push(w);
      }
    }
  }

  unwatch() {
    for (const w of this.wrapped.splice(0)) this.restore(w);
    this.hot = [];
  }
  restore({ obj, k, f, own }) {
    if (own) obj[k] = f;
    else delete obj[k];
  }

  // A part of a function the game can't wrap (update's parts): enter(name) ... exit().
  enter(name) {
    const parent = this.top;
    if (!parent) return;
    let n = parent.kids.get(name);
    if (!n) parent.kids.set(name, (n = node(name)));
    n.t0 = performance.now();
    n.up = parent;
    this.top = n;
  }
  exit() {
    const n = this.top;
    if (!n?.up) return;
    n.ms += performance.now() - n.t0;
    n.n++;
    this.top = n.up;
    n.up = null;
  }

  // The frame's start, and each profiler lap after (name null: time no row counts, shown as "(between laps)").
  begin() {
    if (!this.on) return;
    this.root = node('frame');
    this.segT = performance.now();
    this.seg = this.top = node('');
  }
  lap(name) {
    if (!this.on || !this.root) return;
    const t = performance.now(), s = this.seg;
    s.name = name ?? '(between laps)';
    const old = this.root.kids.get(s.name);
    if (old) { old.ms += t - this.segT; old.n++; for (const [k, v] of s.kids) merge(old, k, v); }
    else { s.ms = t - this.segT; s.n = 1; this.root.kids.set(s.name, s); }
    this.segT = t;
    this.seg = this.top = node('');
  }
  // The frame's end: kept if its CPU time was a spike. Returns true when one was kept.
  end(cpuMs, now, clock) {
    const gap = this.lastFrame ? now - this.lastFrame : 0;
    this.lastFrame = now;
    if (!this.on || !this.root) return false;
    this.lap(null); // (what ran after the last lap)
    const hot = this.hot.length;
    if (this.wrapped.some((w) => w.calls > SPIKE_TUNING.hot)) {
      this.wrapped = this.wrapped.filter((w) => {
        if (w.calls <= SPIKE_TUNING.hot) return true;
        this.restore(w);
        this.hot.push(w.name);
        return false;
      });
    }
    for (const w of this.wrapped) w.calls = 0;
    const root = this.root;
    this.root = this.top = this.seg = null;
    if (cpuMs < SPIKE_TUNING.ms || this.holding) return false; // (stopped on one: that one stays shown)
    root.ms = cpuMs;
    root.n = 1;
    const spike = { ms: cpuMs, gap, clock, tree: freeze(root), slowed: this.hot.slice(hot) };
    this.spikes.push(spike);
    while (this.spikes.length > Math.max(1, SPIKE_TUNING.keep)) this.spikes.shift();
    this.shownSpike = spike;
    if (SPIKE_TUNING.pause >= 0.5) this.holding = true;
    this.changed = true;
    return true;
  }

  // The panel's spike part (built only when something changed, so its open rows stay open).
  html(clockText) {
    this.changed = false;
    const btn = (act, text) => `<button data-spike="${act}">${text}</button>`;
    let h = `<div class="spike-head"><b>Spike capture</b> ${btn('toggle', this.on ? 'On' : 'Off')}` +
      (this.holding ? btn('resume', 'Resume game') : '') + (this.spikes.length ? btn('clear', 'Clear') : '') + '</div>';
    if (!this.on && !this.spikes.length) {
      return h + `<div class="gnote">On: frames over ${SPIKE_TUNING.ms} ms of CPU are kept, with every call's time` +
        `${SPIKE_TUNING.pause >= 0.5 ? ', and the game stops on one' : ''} (T > Spike capture).</div>`;
    }
    h += '<div class="spike-list">' + this.spikes.map((s, i) =>
      `<button data-spike="show" data-i="${i}" class="${s === this.shownSpike ? 'on' : ''}">${s.ms.toFixed(0)} ms · ${clockText(s.clock)}</button>`).join('') + '</div>';
    const s = this.shownSpike;
    if (!s) return h + `<div class="gnote">Waiting for a frame over ${SPIKE_TUNING.ms} ms…</div>`;
    h += `<div class="gnote">CPU ${s.ms.toFixed(1)} ms; ${s.gap.toFixed(0)} ms since the frame before. ` +
      'Each row: total ms (own ms, outside its calls) and calls. A gap far over the CPU time is the browser (garbage collection, the GPU): see DevTools > Performance.' +
      (s.slowed.length ? ` This frame's slower for timing ${s.slowed.join(', ')} (not timed from now on).` : '') +
      (this.hot.length ? ` Not timed (called too often, their time counted in their callers'): ${this.hot.join(', ')}.` : '') + '</div>';
    const row = (n, parentMs, depth) => {
      const self = n.ms - n.kids.reduce((a, k) => a + k.ms, 0);
      const pct = Math.min(100, (n.ms / Math.max(1e-3, parentMs)) * 100);
      const label = `<span class="sn">${n.name}</span><span class="sm"><b>${n.ms.toFixed(2)}</b>` +
        `${n.kids.length ? ` (${Math.max(0, self).toFixed(2)})` : ''}${n.n > 1 ? ` ×${n.n}` : ''}</span>` +
        `<span class="ptrack"><span class="pbar" style="width:${pct.toFixed(1)}%"></span></span>`;
      if (!n.kids.length) return `<div class="sleaf">${label}</div>`;
      const open = depth < 1 || n.ms > s.ms * 0.25;
      return `<details${open ? ' open' : ''}><summary>${label}</summary>${n.kids.map((k) => row(k, n.ms, depth + 1)).join('')}</details>`;
    };
    return h + `<div class="spike-tree">${s.tree.kids.map((k) => row(k, s.ms, 0)).join('')}</div>`;
  }

  // The panel's buttons (data-spike): returns true when the panel's to be built again.
  click(el) {
    const act = el.dataset.spike;
    if (act === 'toggle') this.toggle();
    else if (act === 'resume') this.holding = false;
    else if (act === 'clear') { this.spikes = []; this.shownSpike = null; this.holding = false; }
    else if (act === 'show') this.shownSpike = this.spikes[+el.dataset.i] ?? null;
    this.changed = true;
  }
}

function merge(into, k, v) {
  const o = into.kids.get(k);
  if (!o) { into.kids.set(k, v); return; }
  o.ms += v.ms;
  o.n += v.n;
  for (const [kk, vv] of v.kids) merge(o, kk, vv);
}

// Plain rows, slowest first, the very short calls left out.
function freeze(n) {
  return {
    name: n.name, ms: n.ms, n: n.n,
    kids: [...n.kids.values()].filter((k) => k.ms >= SPIKE_TUNING.minMs).sort((a, b) => b.ms - a.ms).map(freeze),
  };
}
