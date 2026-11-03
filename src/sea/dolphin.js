// (game v685, Jordan) The dolphin from Jordan's dolphin-game-code delivery (art/deliveries/dolphin-game-code.zip), as
// delivered: one closed shell, six weighted bones skinned on the CPU each frame (see HANDOFF.md in the zip).
// Emberwild dolphin. Y up, +Z nose/forward, metres/tiles, like BOAT.
// Authored as a single indexed shell: no boxes, spheres, cones or overlapping fins.
// The immutable rest shell is cached. Six weighted bones deform existing buffers.
// The render buffer repeats triangle corners only for crisp per-face vertex colors.
let DOLPHIN_SHAPE = null;

export const DOLPHIN_BONES = Object.freeze([
  { name: 'body', parent: -1, pivot: [0, 0, 0], axis: 'x' },
  { name: 'tail_base', parent: 0, pivot: [0, -0.03, -0.42], axis: 'x' },
  { name: 'tail_mid', parent: 1, pivot: [0, -0.02, -0.99], axis: 'x' },
  { name: 'flukes', parent: 2, pivot: [0, 0.015, -1.43], axis: 'x' },
  { name: 'flipper_right', parent: 0, pivot: [0.27, -0.15, 0.47], axis: 'z' },
  { name: 'flipper_left', parent: 0, pivot: [-0.27, -0.15, 0.47], axis: 'z' }
]);

export function dolphinShape() {
  if (DOLPHIN_SHAPE) return DOLPHIN_SHAPE;
  const vertices = [], polygons = [], weights = [], tags = [];
  const N = 20, TAU = Math.PI * 2;
  const vertex = (p, w, tag = 'body') => {
    const id = vertices.length; vertices.push(p); weights.push(w); tags.push(tag); return id;
  };
  // z, half-width, half-height, vertical centre: the beak, melon, torso and peduncle.
  const stations = [
    [1.62, .025, .026, .055], [1.56, .065, .045, .06],
    [1.40, .095, .065, .065], [1.22, .12, .09, .07],
    [1.10, .18, .145, .10], [1.00, .25, .23, .11],
    [.86, .30, .30, .10], [.68, .345, .335, .07],
    [.45, .37, .36, .025], [.20, .37, .35, 0],
    [-.04, .36, .345, -.015], [-.30, .325, .31, -.025],
    [-.56, .275, .26, -.035], [-.80, .22, .21, -.04],
    [-1.0, .165, .17, -.035], [-1.18, .115, .13, -.02],
    [-1.36, .075, .10, -.005], [-1.52, .055, .075, .01],
    [-1.64, .05, .045, .025]
  ];
  const spineWeights = z => {
    const centers = [.1, -.65, -1.12, -1.58];
    if (z >= centers[0]) return [[0, 1]];
    for (let j = 0; j < 3; j++) if (z >= centers[j + 1]) {
      let t = (centers[j] - z) / (centers[j] - centers[j + 1]);
      t = t * t * (3 - 2 * t);
      return [[j, 1 - t], [j + 1, t]];
    }
    return [[3, 1]];
  };
  const rings = stations.map(([z, w, h, cy]) => Array.from({ length: N }, (_, j) => {
    const theta = j / N * TAU;
    return vertex([w * Math.cos(theta), cy + h * Math.sin(theta), z], spineWeights(z));
  }));
  const cells = [];
  for (let i = 0; i < rings.length - 1; i++) {
    cells[i] = [];
    for (let j = 0; j < N; j++) {
      const f = [rings[i][j], rings[i + 1][j], rings[i + 1][(j + 1) % N], rings[i][(j + 1) % N]];
      cells[i][j] = polygons.length; polygons.push({ ids: f, tag: 'body' });
    }
  }
  const nose = vertex([0, .055, 1.645], [[0, 1]], 'nose');
  const notch = vertex([0, .025, -1.715], [[3, 1]], 'tail_notch');
  for (let j = 0; j < N; j++) {
    polygons.push({ ids: [nose, rings[0][(j + 1) % N], rings[0][j]], tag: 'nose' });
    polygons.push({ ids: [notch, rings.at(-1)[j], rings.at(-1)[(j + 1) % N]], tag: 'tail_notch' });
  }
  // Remove a rectangular skin patch, then extend its boundary into a tapered fin.
  // Every root edge is shared with the torso; there is no second enclosed object.
  const extendFin = (i0, i1, j0, j1, steps, tip, tag, bone = null) => {
    const loop = [];
    const id = (i, j) => rings[i][(j + N) % N];
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) polygons[cells[i][(j + N) % N]] = null;
    for (let i = i0; i < i1; i++) loop.push(id(i, j0));
    for (let j = j0; j < j1; j++) loop.push(id(i1, j));
    for (let i = i1; i > i0; i--) loop.push(id(i, j1));
    for (let j = j1; j > j0; j--) loop.push(id(i0, j));
    const centre = [0, 0, 0];
    for (const k of loop) for (let a = 0; a < 3; a++) centre[a] += vertices[k][a] / loop.length;
    const source = loop.map(k => vertices[k]);
    let previous = loop;
    for (const { at, scale, blend = 0 } of steps) {
      const next = source.map((p, j) => {
        const w = bone === null ? weights[loop[j]] : [[0, 1 - blend], [bone, blend]];
        return vertex(p.map((v, a) => at[a] + (v - centre[a]) * scale[a]), w, tag);
      });
      for (let j = 0; j < previous.length; j++) polygons.push({ ids: [previous[j], next[j], next[(j + 1) % next.length], previous[(j + 1) % previous.length]], tag });
      previous = next;
    }
    const w = bone === null ? spineWeights(centre[2]) : [[bone, 1]];
    const end = vertex(tip, w, tag);
    for (let j = 0; j < previous.length; j++) polygons.push({ ids: [previous[j], end, previous[(j + 1) % previous.length]], tag });
  };
  extendFin(9, 12, 4, 6, [
    { at: [0, .48, -.20], scale: [.50, .30, .65] },
    { at: [0, .66, -.28], scale: [.20, .10, .22] }
  ], [0, .79, -.48], 'dorsal');
  for (const side of [1, -1]) {
    extendFin(7, 9, side > 0 ? 17 : 11, side > 0 ? 19 : 13, [
      { at: [side * .51, -.20, .34], scale: [.35, .40, .78], blend: .65 },
      { at: [side * .76, -.31, .055], scale: [.12, .18, .33], blend: 1 }
    ], [side * .88, -.37, -.14], side > 0 ? 'flipper_right' : 'flipper_left', side > 0 ? 4 : 5);
    extendFin(16, 18, side > 0 ? 18 : 8, side > 0 ? 22 : 12, [
      { at: [side * .23, .025, -1.55], scale: [.30, .55, 1.25] },
      { at: [side * .46, .035, -1.72], scale: [.10, .25, .90] }
    ], [side * .66, .035, -1.94], 'flukes');
  }
  // Inset eyes replace faces of the shell; they are not floating eyeball primitives.
  for (const j of [0, 9]) {
    const index = cells[6][j], face = polygons[index];
    const p = face.ids.map(k => vertices[k]), centre = [0, 0, 0];
    for (const v of p) for (let a = 0; a < 3; a++) centre[a] += v[a] / 4;
    const inner = p.map(v => vertex(v.map((n, a) => centre[a] + (n - centre[a]) * .34), [[0, 1]], 'eye'));
    polygons[index] = null;
    for (let k = 0; k < 4; k++) polygons.push({ ids: [face.ids[k], face.ids[(k + 1) % 4], inner[(k + 1) % 4], inner[k]], tag: 'body' });
    polygons.push({ ids: inner, tag: 'eye' });
  }
  const triangles = [], faceTags = [];
  for (const face of polygons) if (face) {
    for (let j = 1; j + 1 < face.ids.length; j++) {
      triangles.push(face.ids[0], face.ids[j], face.ids[j + 1]); faceTags.push(face.tag);
    }
  }
  // Patch interiors were removed when the fins were extended. Drop their unused vertices.
  const used = new Uint8Array(vertices.length), remap = new Uint16Array(vertices.length);
  for (const k of triangles) used[k] = 1;
  let count = 0;
  for (let k = 0; k < vertices.length; k++) if (used[k]) {
    remap[k] = count; vertices[count] = vertices[k]; weights[count] = weights[k]; tags[count] = tags[k]; count++;
  }
  vertices.length = weights.length = tags.length = count;
  for (let k = 0; k < triangles.length; k++) triangles[k] = remap[triangles[k]];
  // Orient the entire manifold consistently, including every branching fin.
  const edgeFaces = new Map();
  for (let f = 0; f < triangles.length / 3; f++) for (let k = 0; k < 3; k++) {
    const a = triangles[f * 3 + k], b = triangles[f * 3 + (k + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`;
    if (!edgeFaces.has(key)) edgeFaces.set(key, []);
    edgeFaces.get(key).push([f, a, b]);
  }
  const flip = new Int8Array(triangles.length / 3).fill(-1), queue = [0]; flip[0] = 0;
  for (let q = 0; q < queue.length; q++) {
    const f = queue[q];
    for (let k = 0; k < 3; k++) {
      const a = triangles[f * 3 + k], b = triangles[f * 3 + (k + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`;
      for (const [g, u] of edgeFaces.get(key)) if (g !== f && flip[g] < 0) {
        flip[g] = flip[f] ^ (a === u ? 1 : 0); queue.push(g);
      }
    }
  }
  for (let f = 0; f < flip.length; f++) if (flip[f]) [triangles[f * 3 + 1], triangles[f * 3 + 2]] = [triangles[f * 3 + 2], triangles[f * 3 + 1]];
  let volume = 0;
  for (let f = 0; f < triangles.length; f += 3) {
    const a = vertices[triangles[f]], b = vertices[triangles[f + 1]], c = vertices[triangles[f + 2]];
    volume += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  if (volume < 0) for (let f = 0; f < triangles.length; f += 3) [triangles[f + 1], triangles[f + 2]] = [triangles[f + 2], triangles[f + 1]];
  const hex = h => [16, 8, 0].map(k => ((parseInt(h.slice(1), 16) >> k) & 255) / 255);
  const palette = { back: hex('#526f7b'), side: hex('#79979e'), belly: hex('#c4d2cb'), fin: hex('#587a86'), eye: hex('#14242b'), mouth: hex('#344f5a') };
  const colors = new Float32Array(triangles.length * 3);
  for (let f = 0; f < faceTags.length; f++) {
    const ids = triangles.slice(f * 3, f * 3 + 3), p = ids.map(k => vertices[k]);
    const y = p.reduce((s, v) => s + v[1], 0) / 3, z = p.reduce((s, v) => s + v[2], 0) / 3;
    const tag = faceTags[f];
    let col = tag === 'eye' ? palette.eye : tag === 'dorsal' || tag === 'flukes' || tag.startsWith('flipper') ? palette.fin : y > .22 ? palette.back : y < -.13 ? palette.belly : palette.side;
    // A fine mouth line is colored into the beak's side faces.
    if (tag === 'body' && z > 1.12 && y < .072 && y > .04 && Math.abs(p.reduce((s, v) => s + v[0], 0) / 3) > .06) col = palette.mouth;
    const variation = tag === 'eye' ? 1 : .97 + ((f * 37 + 17) % 11) * .006;
    for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) colors[f * 9 + k * 3 + a] = col[a] * variation;
  }
  const boneIndices = new Uint8Array(vertices.length * 2), boneWeights = new Float32Array(vertices.length * 2);
  weights.forEach((ws, i) => ws.forEach(([b, w], k) => { boneIndices[i * 2 + k] = b; boneWeights[i * 2 + k] = w; }));
  return DOLPHIN_SHAPE = {
    positions: new Float32Array(vertices.flat()), triangles: new Uint16Array(triangles),
    colors, boneIndices, boneWeights, faceTags,
    vertexCount: vertices.length, triangleCount: triangles.length / 3, bones: DOLPHIN_BONES
  };
}

export function dolphinSkin(shape = dolphinShape()) {
  return { shape, positions: shape.positions.slice(), matrices: Array.from({ length: 6 }, () => new Float64Array(12)), local: new Float64Array(12), angles: new Float64Array(6) };
}

function multiplyAffine(out, a, b) {
  for (let r = 0; r < 3; r++) {
    const j = r * 4;
    out[j] = a[j] * b[0] + a[j + 1] * b[4] + a[j + 2] * b[8];
    out[j + 1] = a[j] * b[1] + a[j + 1] * b[5] + a[j + 2] * b[9];
    out[j + 2] = a[j] * b[2] + a[j + 1] * b[6] + a[j + 2] * b[10];
    out[j + 3] = a[j] * b[3] + a[j + 1] * b[7] + a[j + 2] * b[11] + a[j + 3];
  }
}

// Animate weighted bones, then skin the single shell. No geometry/array allocation here.
export function poseDolphinSkin(skin, seconds, amplitude = 1, cyclesPerSecond = .85) {
  const p = seconds * Math.PI * 2 * cyclesPerSecond, a = skin.angles;
  a[0] = Math.sin(p - .8) * .025 * amplitude;
  a[1] = Math.sin(p) * .12 * amplitude;
  a[2] = Math.sin(p - .65) * .22 * amplitude;
  a[3] = Math.sin(p - 1.3) * .24 * amplitude;
  a[4] = (.055 + Math.sin(p - .7) * .065) * amplitude;
  a[5] = -a[4];
  const l = skin.local;
  for (let i = 0; i < DOLPHIN_BONES.length; i++) {
    const bone = DOLPHIN_BONES[i], [x, y, z] = bone.pivot, c = Math.cos(a[i]), s = Math.sin(a[i]);
    l.fill(0);
    if (bone.axis === 'x') { l[0] = 1; l[5] = c; l[6] = -s; l[9] = s; l[10] = c; }
    else { l[0] = c; l[1] = -s; l[4] = s; l[5] = c; l[10] = 1; }
    l[3] = x - (l[0] * x + l[1] * y + l[2] * z);
    l[7] = y - (l[4] * x + l[5] * y + l[6] * z);
    l[11] = z - (l[8] * x + l[9] * y + l[10] * z);
    if (bone.parent < 0) skin.matrices[i].set(l);
    else multiplyAffine(skin.matrices[i], skin.matrices[bone.parent], l);
  }
  const { positions: rest, boneIndices: bi, boneWeights: bw } = skin.shape, out = skin.positions;
  for (let i = 0; i < rest.length / 3; i++) {
    const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
    let px = 0, py = 0, pz = 0;
    for (let j = 0; j < 2; j++) {
      const w = bw[i * 2 + j]; if (w === 0) continue;
      const m = skin.matrices[bi[i * 2 + j]];
      px += w * (m[0] * x + m[1] * y + m[2] * z + m[3]);
      py += w * (m[4] * x + m[5] * y + m[6] * z + m[7]);
      pz += w * (m[8] * x + m[9] * y + m[10] * z + m[11]);
    }
    out[i * 3] = px; out[i * 3 + 1] = py; out[i * 3 + 2] = pz;
  }
  return skin.positions;
}

// Use with the game's GFX namespace and (optionally) its flatMat()/shadowy() material.
export function makeDolphin(GFX, { material = null, phase = 0 } = {}) {
  const shape = dolphinShape(), skin = dolphinSkin(shape), geometry = new GFX.BufferGeometry();
  const position = new GFX.BufferAttribute(new Float32Array(shape.triangles.length * 3), 3);
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', new GFX.BufferAttribute(shape.colors, 3));
  const ownsMaterial = !material;
  material ||= new GFX.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, side: GFX.DoubleSide });
  const mesh = new GFX.Mesh(geometry, material), g = new GFX.Group();
  mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
  g.add(mesh);
  const dolphin = { g, mesh, skin, position, phase, ownsMaterial };
  poseDolphin(dolphin, 0, 0);
  return dolphin;
}

export function poseDolphin(dolphin, seconds, amplitude = 1, cyclesPerSecond = .85) {
  const positions = poseDolphinSkin(dolphin.skin, seconds + dolphin.phase, amplitude, cyclesPerSecond);
  const ids = dolphin.skin.shape.triangles, out = dolphin.position.array;
  for (let i = 0; i < ids.length; i++) {
    const j = ids[i] * 3; out[i * 3] = positions[j]; out[i * 3 + 1] = positions[j + 1]; out[i * 3 + 2] = positions[j + 2];
  }
  dolphin.position.needsUpdate = true;
  // GFX computes flat face lighting from derivatives of the deformed positions.
  return dolphin;
}

export function disposeDolphin(dolphin) {
  if (dolphin.g.parent) dolphin.g.parent.remove(dolphin.g);
  dolphin.mesh.geometry.dispose();
  if (dolphin.ownsMaterial) dolphin.mesh.material.dispose();
}
