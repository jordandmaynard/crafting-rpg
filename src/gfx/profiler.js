// GPU profiling panel (Crafting and Conquest's, after space-miner's): while it's open, every pass writes GPU timestamps (when the browser
// exposes timestamp-query). Results are read back without stalling (skipped while a readback is in flight) and
// smoothed. Also shows the frame rate, the CPU (JavaScript) time per part of the frame and the GPU the browser
// picked.

const MAX_PASSES = 48;
const SMOOTH = 0.1; // share of each new reading in the running average

export class GpuProfiler {
  constructor(device, adapterInfo) {
    this.device = device;
    this.info = adapterInfo;
    this.mode = ''; // set by the game: what's being drawn (resolution, mosaic, post)
    // (v775) the panel's sections folded shut, by heading: a click on a heading ([data-fold]) toggles it (fold());
    // onFold, if set, is told after (the game keeps them)
    this.folded = new Set();
    this.onFold = null;
    this.hasTimestamps = device.features.has('timestamp-query');
    this.on = false;
    this.names = [];       // this frame's timed passes, in order
    this.pending = false;  // a readback is in flight
    this.ema = new Map();  // pass name -> smoothed ms
    this.order = [];
    this.cpu = new Map();  // CPU lap name -> smoothed ms
    this.lapT = 0;
    this.frameMs = 16.7;
    this.cpuMs = 0;
    this.lastT = 0;
    this.shown = 0;
    this.doneMs = 0;        // smoothed: from the frame's last submit to the GPU reporting all its work done
    this.donePending = false;
    this.doneSeen = false;
    if (this.hasTimestamps) {
      this.qs = device.createQuerySet({ type: 'timestamp', count: MAX_PASSES * 2 });
      this.resolveBuf = device.createBuffer({ size: MAX_PASSES * 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      this.readBuf = device.createBuffer({ size: MAX_PASSES * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    }
  }

  get timing() { return this.on && this.hasTimestamps && !this.pending; }

  // timestampWrites for one pass, or undefined when not profiling. Passes sharing a name add up.
  tsw(name) {
    if (!this.timing || this.names.length >= MAX_PASSES) return undefined;
    const i = this.names.length;
    this.names.push(name);
    return { querySet: this.qs, beginningOfPassWriteIndex: i * 2, endOfPassWriteIndex: i * 2 + 1 };
  }

  // One row for a run of `count` passes: the first writes the start time, the last the end (a pass in the middle
  // gets no timestampWrites at all: WebGPU rejects one with neither index). Returns each pass's timestampWrites.
  chain(name, count) {
    const out = new Array(count).fill(undefined);
    if (!this.timing || this.names.length >= MAX_PASSES || count < 1) return out;
    const i = this.names.length;
    this.names.push(name);
    if (count === 1) return [{ querySet: this.qs, beginningOfPassWriteIndex: i * 2, endOfPassWriteIndex: i * 2 + 1 }];
    out[0] = { querySet: this.qs, beginningOfPassWriteIndex: i * 2 };
    out[count - 1] = { querySet: this.qs, endOfPassWriteIndex: i * 2 + 1 };
    return out;
  }

  // Before encoder.finish(): copies this frame's timestamps out for reading.
  resolve(encoder) {
    this.frameNames = null;
    const n = this.names.length;
    if (!n) return;
    encoder.resolveQuerySet(this.qs, 0, n * 2, this.resolveBuf, 0);
    encoder.copyBufferToBuffer(this.resolveBuf, 0, this.readBuf, 0, n * 16);
    this.frameNames = this.names;
    this.names = [];
  }

  // After submit.
  read() {
    const names = this.frameNames;
    this.frameNames = null;
    if (!names) return;
    this.pending = true;
    this.readBuf.mapAsync(GPUMapMode.READ, 0, names.length * 16).then(() => {
      const t = new BigInt64Array(this.readBuf.getMappedRange(0, names.length * 16).slice(0));
      this.readBuf.unmap();
      this.pending = false;
      if (!this.on) return;
      const sums = new Map();
      names.forEach((nm, i) => {
        const ms = Math.max(0, Number(t[i * 2 + 1] - t[i * 2]) / 1e6);
        sums.set(nm, (sums.get(nm) ?? 0) + ms);
      });
      // Passes that only run some frames (the caustics by day, a probe update) count as 0 on frames without them.
      for (const nm of new Set([...this.ema.keys(), ...sums.keys()])) {
        const ms = sums.get(nm) ?? 0, prev = this.ema.get(nm);
        this.ema.set(nm, prev === undefined ? ms : prev + (ms - prev) * SMOOTH);
      }
      for (const nm of sums.keys()) if (!this.order.includes(nm)) this.order.push(nm);
    }, () => { this.pending = false; });
  }

  // After the frame's last submit: when the GPU (and the browser's GPU process before it) has finished everything
  // sent so far. One watch at a time; it covers the queue's backlog too, so it grows when frames pile up.
  watchDone() {
    if (this.donePending || !this.device.queue.onSubmittedWorkDone) return;
    this.donePending = true;
    const t0 = performance.now();
    this.device.queue.onSubmittedWorkDone().then(() => {
      const ms = performance.now() - t0;
      this.doneMs = this.doneSeen ? this.doneMs + (ms - this.doneMs) * SMOOTH : ms;
      this.doneSeen = true;
      this.donePending = false;
    }, () => { this.donePending = false; });
  }

  // A lap with part of its time split out into a row of its own (the encode's wait for the screen's image)
  lapSplit(name, partName, partMs) {
    const t = performance.now();
    if (this.on && name) {
      const ms = t - this.lapT, part = Math.min(ms, Math.max(0, partMs));
      for (const [nm, v] of [[name, ms - part], [partName, part]]) {
        const p = this.cpu.get(nm);
        this.cpu.set(nm, p === undefined ? v : p + (v - p) * SMOOTH);
      }
    }
    this.lapT = t;
    this.spikes?.lap(name);
  }

  // CPU side: time since the previous lap (JavaScript only), smoothed. lap(null) just starts the clock.
  lap(name) {
    const t = performance.now();
    if (this.on && name) {
      const ms = t - this.lapT, p = this.cpu.get(name);
      this.cpu.set(name, p === undefined ? ms : p + (ms - p) * SMOOTH);
    }
    this.lapT = t;
    this.spikes?.lap(name); // (spike capture's rows: see spikes.js)
  }

  // (v764) CPU time spent outside the frame (another requestAnimationFrame loop, such as the potions' slosh): a row
  // of its own in the "Between frames" table, smoothed like the laps
  outside(name, ms) {
    if (!this.on) return;
    this.out = this.out || new Map();
    const p = this.out.get(name);
    this.out.set(name, p === undefined ? ms : p + (ms - p) * SMOOTH);
  }

  // (v768) a count for each frame (sends to the GPU, canvases drawn, KB uploaded): a row of its own in the "Each
  // frame" table, smoothed like the laps
  fold(name) {
    if (this.folded.has(name)) this.folded.delete(name); else this.folded.add(name);
    this.shown = 0;   // (drawn again on the next frame)
    if (this.onFold) this.onFold(this.folded);
  }
  count(name, n) {
    if (!this.on) return;
    this.cnt = this.cnt || new Map();
    const p = this.cnt.get(name);
    this.cnt.set(name, p === undefined ? n : p + (n - p) * SMOOTH);
  }

  toggle() {
    this.on = !this.on;
    this.ema.clear();
    this.cpu.clear();
    if (this.out) this.out.clear();
    if (this.cnt) this.cnt.clear();
    this.order = [];
    this.shown = 0;
    this.doneSeen = false;
    return this.on;
  }

  // Once per frame, at its end: frame rate and CPU time, and the panel's contents 4 times a second.
  frame(frameStart, now, panel, extra) {
    const dt = this.lastT ? now - this.lastT : 16.7;
    this.lastT = now;
    this.frameMs += (dt - this.frameMs) * SMOOTH;
    this.cpuMs += (performance.now() - frameStart - this.cpuMs) * SMOOTH;
    if (!this.on || now - this.shown < 250) return;
    this.shown = now;
    // (v775) each section foldable by its heading; a folded one keeps its heading, with its total when it has one
    const F = this.folded;
    const headRow = (head, unit, sum, cols) => F.has(head)
      ? `<tr class="pfold" data-fold="${head}"><th>▸ ${head}</th><th>${sum === undefined ? '' : `<b>${sum.toFixed(2)}</b>`}</th>${cols > 2 ? '<th></th>' : ''}</tr>`
      : `<tr class="pfold" data-fold="${head}"><th>▾ ${head}</th><th>${unit}</th>${cols > 2 ? '<th></th>' : ''}</tr>`;
    const table = (head, unit, rows, sumLabel, sum) => {
      if (F.has(head)) return `<table>${headRow(head, unit, sum, 3)}</table>`;
      const max = Math.max(0.001, ...rows.map((r) => r[1]));
      return `<table>${headRow(head, unit, sum, 3)}` +
        rows.map(([nm, ms]) => `<tr><td>${nm}</td><td><b>${ms.toFixed(2)}</b></td><td class="ptrack"><span class="pbar" style="width:${(ms / max * 100).toFixed(1)}%"></span></td></tr>`).join('') +
        `<tr class="gsum"><td>${sumLabel}</td><td><b>${sum.toFixed(2)}</b></td><td></td></tr></table>`;
    };
    const plain = (head, unit, rows, digits, note) => F.has(head) ? `<table>${headRow(head, unit, undefined, 2)}</table>`
      : `<table>${headRow(head, unit, undefined, 2)}` + rows.map(([nm, v]) => `<tr><td>${nm}</td><td><b>${typeof v === 'number' ? v.toFixed(digits) : v}</b></td></tr>`).join('') + '</table>' +
        (note ? `<div class="gnote">${note}</div>` : '');
    const rows = this.order.map((nm) => [nm, this.ema.get(nm) || 0]);
    const gpuTotal = rows.reduce((a, r) => a + r[1], 0);
    const i = this.info ?? {};
    const gpuName = [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(' · ') || 'not reported by the browser';
    const between = [...(this.out || [])];
    between.push(['idle (main thread waiting)', Math.max(0, this.frameMs - this.cpuMs - [...(this.out || new Map()).values()].reduce((a, v) => a + v, 0))]);
    between.push(['GPU done, after last submit', this.doneSeen ? this.doneMs : '…']);
    // (v775) the counts in groups by what they're of, each its own section: encode parts, recorded draw lists, overdraw
    const groups = new Map([['Each frame', []], ['Encode, by part (ms)', []], ['Recorded draw lists', []], ['Moving objects (in ½ s)', []], ['Overdraw', []]]);
    for (const [nm, n] of this.cnt || []) {
      const g = nm.startsWith('encode:') ? 'Encode, by part (ms)' : nm.startsWith('overdraw:') ? 'Overdraw' : nm.startsWith('moving:') ? 'Moving objects (in ½ s)' : /recorded/.test(nm) ? 'Recorded draw lists' : 'Each frame';
      groups.get(g).push([nm.replace(/^(encode|overdraw|moving): /, ''), n]);
    }
    const NOTES = { 'Each frame': "Work the pass timers can't see: each send to the GPU and each canvas drawn has its own cost in the browser's GPU process, and uploads cross to the GPU before the passes can run." };
    panel.innerHTML =
      `<div class="ptitle">${(1000 / this.frameMs).toFixed(0)} fps · ${this.frameMs.toFixed(1)} ms/frame</div>` +
      `<div class="gpu-name">GPU: ${gpuName}${i.isFallbackAdapter ? ' (software fallback)' : ''}</div>` +
      `<div class="gpu-name">Drawing: ${this.mode}</div>` +
      (this.hasTimestamps
        ? table('GPU pass', 'GPU ms', rows, 'All passes', gpuTotal)
        : `<div class="gnote">This browser doesn't expose GPU timestamps (timestamp-query), so only frame timing is shown.</div>`) +
      table('CPU (JavaScript)', 'CPU ms', [...this.cpu], 'All CPU', this.cpuMs) +
      plain('Between frames', 'ms', between, 2, 'GPU done: from the last submit until the GPU has finished it, counting driver work the pass timers miss. Longer than the frame means the GPU side is the bottleneck.') +
      [...groups].filter(([, r]) => r.length).map(([g, r]) => plain(g, g === 'Encode, by part (ms)' ? 'ms' : 'count', r, g === 'Encode, by part (ms)' ? 2 : 1, NOTES[g])).join('') +
      `<div class="gnote">${extra}` +
      (this.hasTimestamps ? ' Chrome rounds GPU times to 0.1 ms unless chrome://flags "WebGPU Developer Features" is on.' : '') + '</div>';
  }
}
