// Renders the sound engine's buffers off the page's thread (v892), so building a few hundred variants never costs a
// frame. Messages: { id, job: 'layer', name, layer, seed, P, sr } -> { id, data }; { id, job: 'ir', kind, sr, seed }
// -> { id, L, R }. Each answer's arrays are transferred, not copied.
import { renderLayer } from './recipes.js';
import { renderIR } from './rooms.js';

self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.job === 'layer') {
      const data = renderLayer(m.name, m.layer, m.seed, m.P, m.sr);
      self.postMessage({ id: m.id, data }, [data.buffer]);
    } else if (m.job === 'ir') {
      const [L, R] = renderIR(m.kind, m.sr, m.seed);
      self.postMessage({ id: m.id, L, R }, [L.buffer, R.buffer]);
    }
  } catch (err) {
    self.postMessage({ id: m.id, error: String(err && err.stack || err) });
  }
};
