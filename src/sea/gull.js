// (game v687, Jordan) The gull as one closed shell weighted to bones, built the way the delivered dolphin is
// (src/sea/dolphin.js): rings lofted from the beak to the tail, the wings grown out of patches taken out of the body's
// sides (their roots share the body's edges), eyes inset into the head. Five bones: body, and on each side a
// shoulder (inner wing) and an elbow (forearm and hand) parented to it, all turning about z (forward), so the wing
// can beat and, gliding, arch: up from the shoulder, down from the elbow. Y up, +Z forward, its left +X; tiles.
let GULL_SHAPE = null;

export const GULL_BONES = Object.freeze([
  { name: 'body', parent: -1, pivot: [0, 0, 0], side: 0 },
  { name: 'shoulder_left', parent: 0, pivot: [0.09, 0.02, 0.05], side: 1 },
  { name: 'elbow_left', parent: 1, pivot: [0.42, 0.02, 0.03], side: 1 },
  { name: 'shoulder_right', parent: 0, pivot: [-0.09, 0.02, 0.05], side: -1 },
  { name: 'elbow_right', parent: 3, pivot: [-0.42, 0.02, 0.03], side: -1 },
]);
export const GULL_PALETTE = { white: '#eeeee8', mantle: '#a3a9b2', underwing: '#e2e3df', tip: '#25272b', beak: '#e0ac38', eye: '#1a1c1f' };

export function gullShape() {
  if (GULL_SHAPE) return GULL_SHAPE;
  const vertices = [], polygons = [], weights = [], tags = [];
  const N = 12, TAU = Math.PI * 2;
  const vertex = (p, w, tag = 'body') => { const id = vertices.length; vertices.push(p); weights.push(w); tags.push(tag); return id; };
  // z, half-width, half-height, the middle's height: beak, head (carried level, v680), neck, body, tail
  const stations = [
    [0.45, 0.012, 0.011, 0.004], [0.41, 0.02, 0.02, 0.004], [0.37, 0.03, 0.03, 0.008],
    [0.34, 0.055, 0.055, 0.012], [0.3, 0.072, 0.07, 0.016], [0.25, 0.074, 0.07, 0.014], [0.2, 0.064, 0.058, 0.004],
    [0.14, 0.085, 0.075, -0.004], [0.06, 0.1, 0.085, -0.008], [-0.03, 0.1, 0.08, -0.01], [-0.13, 0.084, 0.064, -0.006],
    [-0.23, 0.06, 0.04, 0.002], [-0.31, 0.05, 0.02, 0.01], [-0.37, 0.075, 0.012, 0.012],
  ];
  const rings = stations.map(([z, w, h, cy]) => Array.from({ length: N }, (_, j) => {
    const t = j / N * TAU;
    return vertex([w * Math.cos(t), cy + h * Math.sin(t), z], [[0, 1]], z > 0.36 ? 'beak' : 'body');
  }));
  const cells = [];
  for (let i = 0; i < rings.length - 1; i++) {
    cells[i] = [];
    for (let j = 0; j < N; j++) {
      cells[i][j] = polygons.length;
      polygons.push({ ids: [rings[i][j], rings[i + 1][j], rings[i + 1][(j + 1) % N], rings[i][(j + 1) % N]], tag: stations[i][0] > 0.36 ? 'beak' : 'body' });
    }
  }
  // (the beak's tip hooked down a little)
  const tip = vertex([0, -0.006, 0.47], [[0, 1]], 'beak'), notch = vertex([0, 0.012, -0.4], [[0, 1]], 'body');
  for (let j = 0; j < N; j++) {
    polygons.push({ ids: [tip, rings[0][(j + 1) % N], rings[0][j]], tag: 'beak' });
    polygons.push({ ids: [notch, rings.at(-1)[j], rings.at(-1)[(j + 1) % N]], tag: 'body' });
  }
  // a wing grown out of a patch of the side: the patch's faces go, and its rim is carried out through the steps
  // (each { at, scale, w: its weights }) to a point at the tip
  const extend = (i0, i1, j0, j1, steps, tipAt, tipW, tag) => {
    const id = (i, j) => rings[i][(j + N) % N], loop = [];
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) polygons[cells[i][(j + N) % N]] = null;
    for (let i = i0; i < i1; i++) loop.push(id(i, j0));
    for (let j = j0; j < j1; j++) loop.push(id(i1, j));
    for (let i = i1; i > i0; i--) loop.push(id(i, j1));
    for (let j = j1; j > j0; j--) loop.push(id(i0, j));
    const c = [0, 0, 0];
    for (const k of loop) for (let a = 0; a < 3; a++) c[a] += vertices[k][a] / loop.length;
    const src = loop.map(k => vertices[k]);
    let prev = loop;
    for (const { at, scale, w } of steps) {
      const next = src.map(p => vertex(p.map((v, a) => at[a] + (v - c[a]) * scale[a]), w, tag));
      for (let j = 0; j < prev.length; j++) polygons.push({ ids: [prev[j], next[j], next[(j + 1) % next.length], prev[(j + 1) % prev.length]], tag });
      prev = next;
    }
    const end = vertex(tipAt, tipW, tag);
    for (let j = 0; j < prev.length; j++) polygons.push({ ids: [prev[j], end, prev[(j + 1) % prev.length]], tag });
  };
  // (rings 7..9: z 0.14 to -0.03; the side's faces j -1..1 on the left, 5..7 on the right)
  for (const s of [1, -1]) {
    const sh = s > 0 ? 1 : 3, el = sh + 1;
    extend(7, 9, s > 0 ? -1 : 5, s > 0 ? 1 : 7, [
      // (a herring gull's: wings about 2.3 times its length, broad at the arm, the hand long, narrow and swept
      // back to a point)
      { at: [s * 0.2, 0.022, 0.06], scale: [0.4, 0.28, 1.2], w: [[0, 0.35], [sh, 0.65]] },
      { at: [s * 0.42, 0.022, 0.035], scale: [0.3, 0.2, 1.12], w: [[sh, 0.5], [el, 0.5]] },
      { at: [s * 0.62, 0.018, -0.01], scale: [0.25, 0.16, 0.9], w: [[el, 1]] },
      { at: [s * 0.8, 0.012, -0.075], scale: [0.18, 0.11, 0.55], w: [[el, 1]] },
      { at: [s * 0.92, 0.008, -0.13], scale: [0.1, 0.07, 0.28], w: [[el, 1]] },
    ], [s * 1.0, 0.005, -0.19], [[el, 1]], 'wing');
  }
  // eyes inset into the head, a little up the sides
  for (const j of [1, N / 2 - 1]) {
    const index = cells[4][j], face = polygons[index], p = face.ids.map(k => vertices[k]), c = [0, 0, 0];
    for (const v of p) for (let a = 0; a < 3; a++) c[a] += v[a] / 4;
    const inner = p.map(v => vertex(v.map((n, a) => c[a] + (n - c[a]) * 0.4), [[0, 1]], 'eye'));
    polygons[index] = null;
    for (let k = 0; k < 4; k++) polygons.push({ ids: [face.ids[k], face.ids[(k + 1) % 4], inner[(k + 1) % 4], inner[k]], tag: 'body' });
    polygons.push({ ids: inner, tag: 'eye' });
  }
  const triangles = [], faceTags = [];
  for (const f of polygons) if (f) for (let j = 1; j + 1 < f.ids.length; j++) { triangles.push(f.ids[0], f.ids[j], f.ids[j + 1]); faceTags.push(f.tag); }
  // drop the patches' unused vertices
  const used = new Uint8Array(vertices.length), remap = new Uint16Array(vertices.length);
  for (const k of triangles) used[k] = 1;
  let count = 0;
  for (let k = 0; k < vertices.length; k++) if (used[k]) { remap[k] = count; vertices[count] = vertices[k]; weights[count] = weights[k]; tags[count] = tags[k]; count++; }
  vertices.length = weights.length = tags.length = count;
  for (let k = 0; k < triangles.length; k++) triangles[k] = remap[triangles[k]];
  // every face wound the same way round (out), across the whole shell
  const edgeFaces = new Map(), key = (a, b) => a < b ? a * 65536 + b : b * 65536 + a;
  for (let f = 0; f < triangles.length / 3; f++) for (let k = 0; k < 3; k++) {
    const a = triangles[f * 3 + k], b = triangles[f * 3 + (k + 1) % 3], e = key(a, b);
    if (!edgeFaces.has(e)) edgeFaces.set(e, []);
    edgeFaces.get(e).push([f, a]);
  }
  const flip = new Int8Array(triangles.length / 3).fill(-1), queue = [0]; flip[0] = 0;
  for (let q = 0; q < queue.length; q++) {
    const f = queue[q];
    for (let k = 0; k < 3; k++) {
      const a = triangles[f * 3 + k], b = triangles[f * 3 + (k + 1) % 3];
      for (const [g, u] of edgeFaces.get(key(a, b))) if (g !== f && flip[g] < 0) { flip[g] = flip[f] ^ (a === u ? 1 : 0); queue.push(g); }
    }
  }
  for (let f = 0; f < flip.length; f++) if (flip[f]) [triangles[f * 3 + 1], triangles[f * 3 + 2]] = [triangles[f * 3 + 2], triangles[f * 3 + 1]];
  let volume = 0;
  for (let f = 0; f < triangles.length; f += 3) {
    const a = vertices[triangles[f]], b = vertices[triangles[f + 1]], c = vertices[triangles[f + 2]];
    volume += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  if (volume < 0) for (let f = 0; f < triangles.length; f += 3) [triangles[f + 1], triangles[f + 2]] = [triangles[f + 2], triangles[f + 1]];
  // colours by face: the wings grey above (white under, the hand black), the mantle grey across the back between
  // them, the beak yellow, the eyes dark, the rest white
  const hex = h => [16, 8, 0].map(k => ((parseInt(h.slice(1), 16) >> k) & 255) / 255), P = {};
  for (const k in GULL_PALETTE) P[k] = hex(GULL_PALETTE[k]);
  const colors = new Float32Array(triangles.length * 3);
  for (let f = 0; f < faceTags.length; f++) {
    const p = [0, 1, 2].map(k => vertices[triangles[f * 3 + k]]), tag = faceTags[f];
    const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2], vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, up = ny / (Math.hypot(nx, ny, nz) || 1);
    const x = Math.abs(p[0][0] + p[1][0] + p[2][0]) / 3, z = (p[0][2] + p[1][2] + p[2][2]) / 3;
    let col = tag === 'eye' ? P.eye : tag === 'beak' ? P.beak : P.white;
    if (tag === 'wing') col = x > 0.8 ? P.tip : up > 0 ? P.mantle : P.underwing;
    else if (tag === 'body' && up > 0.55 && z < 0.12 && z > -0.2) col = P.mantle;
    const vary = tag === 'eye' ? 1 : 0.98 + ((f * 37 + 17) % 9) * 0.005;
    for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) colors[f * 9 + k * 3 + a] = col[a] * vary;
  }
  const boneIndices = new Uint8Array(count * 2), boneWeights = new Float32Array(count * 2);
  weights.forEach((ws, i) => ws.forEach(([b, w], k) => { boneIndices[i * 2 + k] = b; boneWeights[i * 2 + k] = w; }));
  return GULL_SHAPE = { positions: new Float32Array(vertices.flat()), triangles: new Uint16Array(triangles), colors, boneIndices, boneWeights, faceTags,
    vertexCount: count, triangleCount: triangles.length / 3, bones: GULL_BONES };
}

export function gullSkin(shape = gullShape()) {
  return { shape, positions: shape.positions.slice(), matrices: GULL_BONES.map(() => new Float64Array(12)), local: new Float64Array(12) };
}
function mulAffine(out, a, b) {
  for (let r = 0; r < 3; r++) {
    const j = r * 4;
    out[j] = a[j] * b[0] + a[j + 1] * b[4] + a[j + 2] * b[8];
    out[j + 1] = a[j] * b[1] + a[j + 1] * b[5] + a[j + 2] * b[9];
    out[j + 2] = a[j] * b[2] + a[j + 1] * b[6] + a[j + 2] * b[10];
    out[j + 3] = a[j] * b[3] + a[j + 1] * b[7] + a[j + 2] * b[11] + a[j + 3];
  }
}
// the wings at shoulder and elbow angles (radians, up from level, each side mirrored), the shell skinned to them
export function poseGullSkin(skin, shoulder, elbow) {
  const l = skin.local;
  for (let i = 0; i < GULL_BONES.length; i++) {
    const B = GULL_BONES[i], [x, y, z] = B.pivot, ang = i === 0 ? 0 : (i === 1 || i === 3 ? shoulder : elbow) * B.side, c = Math.cos(ang), s = Math.sin(ang);
    l.fill(0);
    l[0] = c; l[1] = -s; l[4] = s; l[5] = c; l[10] = 1;   // (about z: +x up toward +y)
    l[3] = x - (l[0] * x + l[1] * y); l[7] = y - (l[4] * x + l[5] * y); l[11] = 0;
    if (B.parent < 0) skin.matrices[i].set(l); else mulAffine(skin.matrices[i], skin.matrices[B.parent], l);
  }
  const { positions: rest, boneIndices: bi, boneWeights: bw } = skin.shape, out = skin.positions;
  for (let i = 0; i < rest.length / 3; i++) {
    const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
    let px = 0, py = 0, pz = 0;
    for (let j = 0; j < 2; j++) {
      const w = bw[i * 2 + j]; if (w === 0) continue;
      const m = skin.matrices[bi[i * 2 + j]];
      px += w * (m[0] * x + m[1] * y + m[2] * z + m[3]); py += w * (m[4] * x + m[5] * y + m[6] * z + m[7]); pz += w * (m[8] * x + m[9] * y + m[10] * z + m[11]);
    }
    out[i * 3] = px; out[i * 3 + 1] = py; out[i * 3 + 2] = pz;
  }
  return out;
}
