// Particles for spells and the world's effects: sparks, embers, glints, smoke, flame, rings and pools on the
// ground, beams, and solid bits (shards, chunks, drops, crystals that grow out of the ground), all stepped on the
// GPU and drawn in two calls.
//
// The particles live in one storage buffer, a ring of slots. The CPU only ever writes a slot when it spawns a
// particle there (where, how fast, how long it lives, how it moves and looks); a compute pass then steps every
// live one each frame: gravity, drag, a pull toward its anchor, a swirl round it, turbulence, the wind, and a
// bounce off its own floor. Two meshes read the same buffer, drawn once a slot (instance_index): the see-through
// one (everything soft or glowing, blended premultiplied, so a particle can add light, cover what's behind it,
// or both), and the solid one (shards and the like: opaque, lit, outlined, dithering away at the end).
//
// Colour comes from ramps: up to 64 of RAMP_N colours each, dark to bright, a particle walking along its ramp from
// tone0 to tone1 over its life (fire cooling, frost paling). With `look.steps` the ramp is read in hard steps,
// not blended, for the flat-shaded look.
//
// On top of that, FxRunner plays effects: an effect is a list of phases (charge, release, spread, hold, fade...),
// each lasting a while, with emitters that fire a burst as it begins or spawn at a rate through it, lights that
// flare or swell, and events (for the game: strike now, shake, hit-stop). A phase can loop until the effect is
// told to stop (a campfire, a poison cloud, a channelled beam). See FxRunner for the emitter fields.
import { ShaderMaterial, DataTexture, CustomBlending, OneFactor, OneMinusSrcAlphaFactor, AddEquation, DoubleSide } from './materials.js';
import { BufferGeometry, Float32BufferAttribute } from './geometry.js';
import { Mesh } from './scene.js';
import { Color } from './math.js';

export const RAMP_N = 8, MAX_RAMPS = 64;
const FLOATS = 32;   // a particle's record: 8 vec4f
// how each particle is drawn
export const FX = { GLOW: 0, SPARK: 1, GLINT: 2, PUFF: 3, FLAME: 4, RING: 5, DISC: 6, BEAM: 7, SHARD: 8, CRYSTAL: 9, DROP: 10, CHUNK: 11, DOME: 12, SMOKE: 13, PLUS: 14, LEAF: 15, COIN: 16 };
// (the solid styles: SOLID_FROM up to, not with, SOLID_TO, and LEAF, v829, and COIN, v840)
const SOLID_FROM = 8, SOLID_TO = 13;
const isSolid = st => (st >= SOLID_FROM && st < SOLID_TO) || st === FX.LEAF || st === FX.COIN;

// the particle record, shared by the compute pass and both draws
const STRUCT = /* wgsl */ `
struct FxP {
  a: vec4f,   // where it is (world), when it's born (the fx clock; it waits till then)
  b: vec4f,   // its velocity, how long it lives (s)
  c: vec4f,   // its anchor (what it's pulled toward and swirls round; a beam's far end), its floor's height
  d: vec4f,   // its size at birth, at death; gravity (× g), drag (1/s)
  e: vec4f,   // pull toward the anchor (1/s²), swirl round it (rad/s), turbulence, bounce (0-1)
  f: vec4f,   // its ramp, where on it at birth and at death (0 dark, 1 bright), opacity
  g: vec4f,   // style (FX), seed (0-1), glow (its own light, × colour), a flame's smoke ramp (any other: 1 = it rides the waves)
  h: vec4f,   // turn (rad), spin (rad/s), stretch (sparks, drops: × speed; rings: thickness), cover (or a flame's morph)
}`;

const SIM_WGSL = STRUCT + /* wgsl */ `
struct SimU { t: vec4f, wind: vec4f, wave: vec4f }   // t: now, dt, turbulence scale, g; wind: x y z, gust; wave: see waveAt
@group(0) @binding(0) var<uniform> S: SimU;
@group(0) @binding(1) var<storage, read_write> P: array<FxP>;
fn h3(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }
// smooth value noise
fn vnoise(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  let a = mix(mix(h3(i), h3(i + vec3f(1.0, 0.0, 0.0)), u.x), mix(h3(i + vec3f(0.0, 1.0, 0.0)), h3(i + vec3f(1.0, 1.0, 0.0)), u.x), u.y);
  let b = mix(mix(h3(i + vec3f(0.0, 0.0, 1.0)), h3(i + vec3f(1.0, 0.0, 1.0)), u.x), mix(h3(i + vec3f(0.0, 1.0, 1.0)), h3(i + vec3f(1.0, 1.0, 1.0)), u.x), u.y);
  return mix(a, b, u.z);
}
// the rippling surface a particle that rides the waves sits on, over its floor: three crossing sines (wave: their
// height, their length, their phase), the same as the lava's surface (index.html, lavaMat)
fn waveAt(xz: vec2f) -> f32 {
  let p = xz / max(S.wave.y, 0.05);
  let a1 = dot(p, vec2f(0.8, 0.6) * 1.9) + S.wave.z * 1.1;
  let a2 = dot(p, vec2f(-0.45, 0.9) * 2.7) - S.wave.z * 1.4;
  let a3 = dot(p, vec2f(0.95, -0.3) * 3.6) + S.wave.z * 1.9;
  return S.wave.x * (sin(a1) + 0.6 * sin(a2) + 0.35 * sin(a3)) / 1.95;
}
@compute @workgroup_size(64) fn step(@builtin(global_invocation_id) id: vec3u) {
  let n = arrayLength(&P);
  if (id.x >= n) { return; }
  var q = P[id.x];
  let age = S.t.x - q.a.w;
  if (age < 0.0 || age > q.b.w || q.b.w <= 0.0) { return; }
  let dt = S.t.y;
  let st = i32(q.g.x + 0.5);
  // (riding the waves: its floor rises and falls with them)
  let ride = st != ${FX.FLAME} && q.g.w > 0.5;
  let floorY = q.c.w + select(0.0, waveAt(q.a.xz), ride);
  // crystals, pools, rings and domes stand where they were put (on the waves, if they ride them)
  if (st == ${FX.CRYSTAL} || st == ${FX.DISC} || st == ${FX.RING} || st == ${FX.DOME}) {
    if (ride) { q.a.y = floorY; P[id.x] = q; }
    return;
  }
  var p = q.a.xyz; var v = q.b.xyz;
  let onFloor = p.y <= floorY + 0.002;
  // gravity (negative: it rises), and the wind on what's light (smoke, embers, sparks a little)
  v.y -= q.d.z * S.t.w * dt;
  let windK = select(0.25, 1.0, st == ${FX.PUFF} || st == ${FX.FLAME} || st == ${FX.GLOW} || st == ${FX.SMOKE} || st == ${FX.LEAF});
  v += S.wind.xyz * windK * dt * select(1.0, 0.0, onFloor);
  // pulled toward its anchor
  if (q.e.x != 0.0) {
    let d = q.c.xyz - p; let l = length(d);
    if (l > 1e-3) { v += d / l * q.e.x * dt * min(1.0, l * 2.0); }
  }
  // turbulence: a slowly changing push from a noise field it drifts through
  if (q.e.z > 0.0) {
    let s = p * S.t.z + vec3f(q.g.y * 17.0, S.t.x * 0.35, q.g.y * 5.0);
    let w = vec3f(vnoise(s), vnoise(s + vec3f(19.1, 7.3, 3.7)), vnoise(s + vec3f(5.2, 31.7, 11.3))) - 0.5;
    v += w * 2.0 * q.e.z * dt * 6.0;
  }
  v *= exp(-q.d.w * dt);
  p += v * dt;
  // swirling round the anchor's upright axis
  if (q.e.y != 0.0) {
    let ang = q.e.y * dt; let cs = cos(ang); let sn = sin(ang);
    let r = p.xz - q.c.xz;
    p = vec3f(q.c.x + r.x * cs - r.y * sn, p.y, q.c.z + r.x * sn + r.y * cs);
    v = vec3f(v.x * cs - v.z * sn, v.y, v.x * sn + v.z * cs);
  }
  // its floor: it bounces, skids and comes to rest
  if (p.y < floorY) {
    p.y = floorY;
    if (v.y < 0.0) {
      v.y = -v.y * q.e.w;
      v.x *= 0.55; v.z *= 0.55;
      q.h.y *= 0.5;
      if (v.y < 0.35) { v.y = 0.0; }
    }
  }
  if (onFloor && v.y <= 0.0) { v.x *= exp(-6.0 * dt); v.z *= exp(-6.0 * dt); q.h.y *= exp(-5.0 * dt); }
  q.h.x += q.h.y * dt;
  // (v840) a coin come to rest on its floor stops flipping and settles flat, face up or face down, whichever is nearer
  if (st == ${FX.COIN} && p.y <= floorY + 0.002 && v.y == 0.0) {
    q.h.y *= exp(-12.0 * dt);
    q.h.x = mix(q.h.x, round(q.h.x / 3.14159265) * 3.14159265, 1.0 - exp(-14.0 * dt));
  }
  q.a = vec4f(p, q.a.w); q.b = vec4f(v, q.b.w);
  P[id.x] = q;
}`;

// what both draws share: the particle's age, its ramp and size over its life
const DRAW_COMMON = STRUCT + /* wgsl */ `
fn fxRamp(id: f32, t: f32) -> vec3f {
  let base = i32(id + 0.5) * ${RAMP_N};
  let x = sat(t) * ${RAMP_N - 1}.0;
  if (U.look.x > 0.5) { return U.ramps[base + i32(floor(x + 0.5))].rgb; }
  let i = i32(floor(x)); let j = min(i + 1, ${RAMP_N - 1});
  return mix(U.ramps[base + i].rgb, U.ramps[base + j].rgb, fract(x));
}
fn fxHash(x: f32) -> f32 { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }
// how far through its life (0-1), or -1 when it isn't alive
fn fxLife(q: FxP) -> f32 {
  let age = U.now.x - q.a.w;
  if (q.b.w <= 0.0 || age < 0.0 || age > q.b.w) { return -1.0; }
  return age / q.b.w;
}
// its size, quick to grow and slow to finish
fn fxSize(q: FxP, k: f32) -> f32 { return mix(q.d.x, q.d.y, 1.0 - (1.0 - k) * (1.0 - k)) * U.look.z; }
`;

// the see-through draw: one camera-facing (or ground-lying) quad a particle
const CLEAR_WGSL = DRAW_COMMON + /* wgsl */ `
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) st: i32,
  @location(2) col: vec3f,     // its ramp colour now
  @location(3) a: f32,         // opacity now
  @location(4) wpos: vec3f,    // its middle
  @location(5) pix: vec3f,     // this corner, in the world
  @location(6) glow: f32,
  @location(7) cover: f32,
  @location(8) extra: f32,     // a ring's thickness, a glint's twinkle, a flame's heat
  @location(9) rad: f32,       // a ball's radius (puffs and flames: see fs), else 0
  @location(10) nz: vec3f,     // its seed, how far through its life, its turn (a puff's lumps)
}
@vertex fn vs(v: VIn, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  let q = parts[ii];
  let st = i32(q.g.x + 0.5);
  let k = fxLife(q);
  if (k < 0.0 || (st >= ${SOLID_FROM} && st < ${SOLID_TO}) || st == ${FX.LEAF} || st == ${FX.COIN}) { return o; }
  let corner = v.position.xy;
  let right = vec3f(F.view[0][0], F.view[1][0], F.view[2][0]);
  let up = vec3f(F.view[0][1], F.view[1][1], F.view[2][1]);
  let at = q.a.xyz;
  var size = fxSize(q, k);
  var w = at + (right * corner.x + up * corner.y) * size;
  var fade = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.6, 1.0, k));
  var tone = mix(q.f.y, q.f.z, k);
  var cover = q.h.w;
  var extra = 0.0;
  var ramp = q.f.x;
  if (st == ${FX.SPARK}) {
    // stretched along the way it's going, as seen
    let vel = q.b.xyz; let sp = length(vel);
    let dir = select(up, vel / max(sp, 1e-4), sp > 1e-3);
    let eye = toEye(at);
    var side = cross(dir, eye);
    if (length(side) < 1e-4) { side = right; }
    side = normalize(side);
    let len = size * (1.0 + q.h.z * sp);
    w = at + side * corner.x * size * 0.5 + dir * (corner.y - 1.0) * len;
    fade = 1.0 - smoothstep(0.5, 1.0, k);
    cover = 0.0;
  } else if (st == ${FX.GLINT}) {
    // a twinkle: it swells and shrinks a few times over its life
    let tw = 0.55 + 0.45 * sin(k * 18.0 + q.g.y * 40.0);
    w = at + (right * corner.x + up * corner.y) * size * tw;
    extra = tw; cover = 0.0;
  } else if (st == ${FX.GLOW} || st == ${FX.PLUS}) {
    cover = 0.0;
  } else if (st == ${FX.SMOKE}) {
    // (v616, Jordan: smoke as Crafting and Conquest draws it) a soft smoke sprite (one of four, by its seed) on a card
    // turned to us round the upright, spinning by its turn; fading in over its first tenth and out over the rest
    let view = toEye(at);
    var rt = cross(vec3f(0.0, 1.0, 0.0), view);
    if (length(rt) < 1e-3) { rt = right; }
    rt = normalize(rt);
    let upc = cross(view, rt);
    let cs = cos(q.h.x); let sn = sin(q.h.x);
    let c2 = vec2f(corner.x * cs - corner.y * sn, corner.x * sn + corner.y * cs);
    w = at + (rt * c2.x + upc * c2.y) * size;
    fade = min(1.0, k * 10.0) * pow(1.0 - k, 1.5);
    extra = floor(fract(q.g.y * 7.31) * 4.0);
  } else if (st == ${FX.FLAME}) {
    // hot and self-lit at first; past its morph it's smoke, lit like any puff, on its smoke ramp
    let m = q.h.w;
    let smoke = m > 0.0 && k > m;
    extra = select(1.0, 0.0, smoke);
    cover = select(0.3, 1.0, smoke);
    if (smoke) { ramp = q.g.w; tone = mix(0.7, 0.25, (k - m) / max(1.0 - m, 1e-3)); size = size * (1.0 + (k - m) * 1.2); }
    w = at + (right * corner.x + up * corner.y) * size;
    fade = smoothstep(0.0, 0.05, k) * (1.0 - smoothstep(select(0.5, 0.55, smoke), 1.0, k));
  } else if (st == ${FX.RING} || st == ${FX.DISC}) {
    // lying on the ground, turned by its turn
    let cs = cos(q.h.x); let sn = sin(q.h.x);
    let c2 = vec2f(corner.x * cs - corner.y * sn, corner.x * sn + corner.y * cs);
    w = at + vec3f(c2.x * size, 0.03, c2.y * size);
    extra = q.h.z;
    fade = smoothstep(0.0, 0.04, k) * (1.0 - smoothstep(select(0.35, 0.5, st == ${FX.DISC}), 1.0, k));
  } else if (st == ${FX.BEAM}) {
    // from where it is to its anchor, as wide as its size, facing us
    let p1 = q.c.xyz;
    let d = p1 - at; let l = length(d);
    let dir = d / max(l, 1e-4);
    var side = cross(dir, toEye(at));
    if (length(side) < 1e-4) { side = right; }
    side = normalize(side);
    w = mix(at, p1, corner.y * 0.5 + 0.5) + side * corner.x * size * 0.5;
    // (it flickers)
    fade = (1.0 - smoothstep(0.4, 1.0, k)) * (0.65 + 0.35 * fxHash(floor(U.now.x * 30.0) + q.g.y * 91.0));
    cover = 0.0;
  }
  o.pos = F.viewProj * vec4f(w, 1.0);
  o.uv = corner; o.st = st; o.wpos = at; o.pix = w; o.rad = 0.0; o.nz = vec3f(q.g.y, k, q.h.x);
  // (v615, Jordan: the smoke cut off along straight lines by the wall or roof behind it) a puff or a flame is a ball,
  // not its flat card: the card, square-on to us and leaning back as we look down, ran into a wall or roof the ball
  // was only near and was cut along the line they crossed. So its depth is the ball's front (nothing just behind
  // the ball hides any of it) and the fragment shader works out how much of the ball's depth there lies in front of
  // what's behind it (see fs)
  if (st == ${FX.PUFF} || st == ${FX.FLAME} || st == ${FX.SMOKE}) {
    let f = F.viewProj * vec4f(at + toEye(at) * size, 1.0);
    o.pos.z = clamp(f.z / f.w, 0.0, 1.0) * o.pos.w;
    o.pix = at; o.rad = size;
  }
  o.col = fxRamp(ramp, tone);
  let fog = 1.0 - fogAmount(viewDepth(at));
  o.a = fade * q.f.w * fog;
  o.glow = q.g.z * U.look.y; o.cover = cover; o.extra = extra;
  return o;
}
// (v745) smooth value noise and a few octaves of it, for a puff's and smoke's lumps
fn pHash(p: vec3f) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}
fn pNoise(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  let a = mix(mix(pHash(i), pHash(i + vec3f(1.0, 0.0, 0.0)), u.x), mix(pHash(i + vec3f(0.0, 1.0, 0.0)), pHash(i + vec3f(1.0, 1.0, 0.0)), u.x), u.y);
  let b = mix(mix(pHash(i + vec3f(0.0, 0.0, 1.0)), pHash(i + vec3f(1.0, 0.0, 1.0)), u.x), mix(pHash(i + vec3f(0.0, 1.0, 1.0)), pHash(i + vec3f(1.0, 1.0, 1.0)), u.x), u.y);
  return mix(a, b, u.z);
}
fn pFbm(p: vec3f) -> f32 { return (pNoise(p) * 0.57 + pNoise(p * 2.03 + vec3f(5.1, 1.7, 9.3)) * 0.29 + pNoise(p * 4.11 + vec3f(2.3, 7.9, 4.4)) * 0.14); }
// (v768) pNoise's slope at p, worked out from its eight corners at once (the same corners pNoise mixes): one call
// does what three more pNoise calls a step apart did
fn pNoiseD(p: vec3f) -> vec3f {
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f); let du = 6.0 * f * (1.0 - f);
  let a = pHash(i); let b = pHash(i + vec3f(1.0, 0.0, 0.0)); let c = pHash(i + vec3f(0.0, 1.0, 0.0)); let d = pHash(i + vec3f(1.0, 1.0, 0.0));
  let e = pHash(i + vec3f(0.0, 0.0, 1.0)); let g = pHash(i + vec3f(1.0, 0.0, 1.0)); let h = pHash(i + vec3f(0.0, 1.0, 1.0)); let k = pHash(i + vec3f(1.0, 1.0, 1.0));
  let k1 = b - a; let k2 = c - a; let k3 = e - a; let k4 = a - b - c + d; let k5 = a - c - e + h; let k6 = a - b - e + g;
  let k7 = -a + b + c - d + e - g - h + k;
  return du * vec3f(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z, k2 + k4 * u.x + k5 * u.z + k7 * u.x * u.z, k3 + k5 * u.y + k6 * u.x + k7 * u.x * u.y);
}
// pFbm's slope at p
fn pFbmD(p: vec3f) -> vec3f {
  return pNoiseD(p) * 0.57 + pNoiseD(p * 2.03 + vec3f(5.1, 1.7, 9.3)) * (0.29 * 2.03) + pNoiseD(p * 4.11 + vec3f(2.3, 7.9, 4.4)) * (0.14 * 4.11);
}
// (v745, Jordan: smoke and dust lit as round balls, not in bands, lumpy only in their normals) the normal of a ball
// at card point c (-1 to 1 across it, as seen), turned into the world, bent by the slopes of a few octaves of noise
// over it: lumps fixed to the ball in the world (they don't swim as the camera turns), its own by its seed (nz.x),
// churning slowly over its life (nz.y). Only the light changes: its outline and thickness are as before
fn puffNormal(c: vec2f, nz: vec3f) -> vec3f {
  let right = vec3f(F.view[0][0], F.view[1][0], F.view[2][0]);
  let up = vec3f(F.view[0][1], F.view[1][1], F.view[2][1]);
  let back = vec3f(F.view[0][2], F.view[1][2], F.view[2][2]);
  let n = normalize(right * c.x + up * c.y + back * sqrt(max(1.0 - dot(c, c), 0.0)));
  let P = U.puff;
  if (P.x <= 0.0) { return n; }
  let p = n * max(P.z, 0.1) + vec3f(nz.x * 37.0, nz.x * 11.0 + nz.y * 0.9, nz.x * 23.0);
  // (v768: the slope worked out directly, not from four pFbm calls a step apart: a quarter of the noise work)
  let g = pFbmD(p);
  return normalize(n - (g - dot(g, n) * n) * P.x * 0.35);
}
// the light a soft volume at w gets, from the way n faces (sky, ground, the sun through its shadow, lamps)
fn fxLight(w: vec3f, n: vec3f) -> vec3f {
  var l = mix(F.hemiGround.rgb, F.hemiSky.rgb, 0.5 + 0.5 * n.y);
  if (F.sunDir.w > 0.5) {
    var s = sat(dot(n, F.sunDir.xyz) * 0.6 + 0.4);
    if (U.look.w > 0.5) { s = floor(s * U.look.w + 0.5) / U.look.w; }
    l += F.sunColor.rgb * cloudShade(w.xz) * sunShadow(w, vec3f(0.0, 1.0, 0.0)) * s;
  }
  let np = i32(F.cloud2.w);
  for (var i = 0; i < ${16}; i++) {
    if (i >= np) { break; }
    let p = F.points[i];
    let d = p.pos.xyz - w; let dist = length(d);
    var att = 1.0;
    if (p.pos.w > 0.0 && p.color.w > 0.0) {
      if (dist >= p.pos.w) { continue; }   // (v768: out of its reach it adds nothing)
      att = pow(sat(1.0 - dist / p.pos.w), p.color.w);
    }
    l += p.color.rgb * att * sat(dot(n, d / max(dist, 1e-4)) * 0.5 + 0.5);
  }
  return l;
}
// soft where it meets what's behind it: how much of it shows at this pixel (1 with no depth to read)
fn fxSoft(pos: vec2f, pix: vec3f, rad: f32, r2: f32) -> f32 {
  if (U.refr <= 0.5) { return 1.0; }
  let dims = vec2i(textureDimensions(tRefrD));
  let zb = textureLoad(tRefrD, clamp(vec2i(pos), vec2i(0), dims - 1), 0);
  let P = F.proj;
  let vb = (P[3][2] - zb * P[3][3]) / (zb * P[2][3] - P[2][2]);
  let vz = (F.view * vec4f(pix, 1.0)).z;
  if (rad > 0.0) {
    // a ball: of its depth here (front to back, half of it each side of its middle), the share in front of what's
    // behind it, softened a little more for a small one
    let th = sqrt(max(1.0 - r2, 0.0)) * rad + 0.04;
    return smoothstep(0.0, 1.0, sat((vz + th - vb) / (2.0 * th)));
  }
  return smoothstep(0.0, 0.3, vz - vb);
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let uv = i.uv; let r2 = dot(uv, uv);
  var m = 0.0;            // how much of it is here
  var lit = vec3f(0.0);   // what it shows (before its opacity)
  let st = i.st;
  if (st == ${FX.GLOW}) {
    if (r2 > 1.0) { discard; }
    m = exp(-r2 * 4.0) * (1.0 - r2);
    lit = mix(i.col, vec3f(1.0), exp(-r2 * 30.0) * 0.6) * i.glow;
  } else if (st == ${FX.SPARK}) {
    // a hot head at the front, the tail cooling behind
    let t = uv.y * 0.5 + 0.5;
    m = (1.0 - uv.x * uv.x) * pow(t, 1.5);
    lit = mix(i.col, vec3f(1.0), t * t * 0.7) * i.glow;
  } else if (st == ${FX.GLINT}) {
    let ax = abs(uv.x); let ay = abs(uv.y);
    m = max(exp(-ax * 14.0) * (1.0 - ay), exp(-ay * 14.0) * (1.0 - ax)) + exp(-r2 * 10.0);
    if (r2 > 1.0) { m *= 0.0; }
    lit = mix(i.col, vec3f(1.0), 0.5) * i.glow;
  } else if (st == ${FX.PUFF} || st == ${FX.FLAME}) {
    if (r2 > 1.0) { discard; }
    m = pow(1.0 - r2, 1.5);
    // (v768) hidden or see-through here: nothing to light (the soft fade is taken now, not after the lighting)
    m *= fxSoft(i.pos.xy, i.pix, i.rad, r2);
    if (m * i.a < 1e-4) { discard; }
    let hot = st == ${FX.FLAME} && i.extra > 0.5;
    if (hot) {
      lit = mix(i.col, vec3f(1.0), exp(-r2 * 6.0) * 0.35) * max(i.glow, 1.0);
    } else {
      // lit as a ball: its face toward us from the corner, turned into the world, lumpy in its normals
      lit = i.col * fxLight(i.wpos, puffNormal(uv, i.nz)) + i.col * i.glow;
    }
  } else if (st == ${FX.SMOKE}) {
    // its sprite's grey (the four in a 2 x 2 atlas, a texel in from each cell's edge), rounded off toward its edge;
    // (v745, Jordan) lit as a lumpy ball, as the dust puffs are: the card turns by its turn, so the ball's point here
    // is the corner turned the same way
    let cell = vec2f(i.extra % 2.0, floor(i.extra / 2.0));
    let tuv = clamp(vec2f(uv.x, -uv.y) * 0.5 + 0.5, vec2f(1.0 / 128.0), vec2f(1.0 - 1.0 / 128.0));
    let spr = textureSampleLevel(tSmoke, tSmokeS, (cell + tuv) * 0.5, 0.0).r;
    m = spr * smoothstep(1.0, 0.6, sqrt(r2));
    // (v768) the card's empty corners, the sprite's clear parts and wherever it's hidden: nothing to light
    m *= fxSoft(i.pos.xy, i.pix, i.rad, r2);
    if (m * i.a < 1e-4) { discard; }
    let cs = cos(i.nz.z); let sn = sin(i.nz.z);
    lit = i.col * fxLight(i.wpos, puffNormal(vec2f(uv.x * cs - uv.y * sn, uv.x * sn + uv.y * cs), i.nz)) + i.col * i.glow;
  } else if (st == ${FX.PLUS}) {
    // (v753) a plus sign facing us, crisp, its middle brighter (a heal's)
    let ax = abs(uv.x); let ay = abs(uv.y);
    let arm = 0.3; let len = 0.9;
    let inA = (1.0 - smoothstep(arm - 0.06, arm, ax)) * (1.0 - smoothstep(len - 0.08, len, ay));
    let inB = (1.0 - smoothstep(arm - 0.06, arm, ay)) * (1.0 - smoothstep(len - 0.08, len, ax));
    m = max(inA, inB);
    if (m <= 0.0) { discard; }
    lit = mix(i.col, vec3f(1.0), exp(-r2 * 12.0) * 0.45) * max(i.glow, 1.0);
  } else if (st == ${FX.RING}) {
    let d = sqrt(r2);
    if (d > 1.0) { discard; }
    let th = max(i.extra, 0.02);
    m = 1.0 - smoothstep(0.0, th * 0.5, abs(d - (1.0 - th * 0.5)));
    lit = i.col * (fxLight(i.wpos, vec3f(0.0, 1.0, 0.0)) * i.cover + i.glow);
  } else if (st == ${FX.DISC}) {
    if (r2 > 1.0) { discard; }
    m = (1.0 - r2) * (1.0 - r2);
    lit = i.col * (fxLight(i.wpos, vec3f(0.0, 1.0, 0.0)) * i.cover + i.glow);
  } else {
    // a beam: a white core in a coloured sheath
    let x = abs(uv.x);
    m = exp(-x * x * 5.0) * (1.0 - smoothstep(0.85, 1.0, abs(uv.y)));
    lit = mix(i.col, vec3f(1.0), exp(-x * x * 40.0)) * i.glow;
  }
  // soft where it meets what's behind it (puffs, flames and smoke took theirs above)
  if (st != ${FX.RING} && st != ${FX.DISC} && st != ${FX.PUFF} && st != ${FX.FLAME} && st != ${FX.SMOKE}) { m *= fxSoft(i.pos.xy, i.pix, i.rad, r2); }
  let al = sat(m * i.a);
  return vec4f(lit * al, al * i.cover);
}`;

// the solid draw: a small eight-faced gem a particle, shaped by its style
const SOLID_WGSL = DRAW_COMMON + /* wgsl */ `
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f,
  @location(1) col: vec3f,
  @location(2) glow: f32,
  @location(3) fade: f32,
  @location(4) rough: f32,
  @location(5) metal: f32,
}
// turn v by angle a about the unit axis n
fn fxTurn(v: vec3f, n: vec3f, a: f32) -> vec3f { return v * cos(a) + cross(n, v) * sin(a) + n * dot(n, v) * (1.0 - cos(a)); }
@vertex fn vs(v: VIn, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  // (the dome mesh draws only domes, from its own slots on: U.base, y 1; the coin mesh only coins, y 2; the gem mesh
  // everything else solid, y 0)
  let q = parts[ii + u32(U.base.x)];
  let st = i32(q.g.x + 0.5);
  let k = fxLife(q);
  let pool = select(select(0, 1, st == ${FX.DOME}), 2, st == ${FX.COIN});
  if (k < 0.0 || ((st < ${SOLID_FROM} || st >= ${SOLID_TO}) && st != ${FX.LEAF} && st != ${FX.COIN}) || pool != i32(U.base.y + 0.5)) { return o; }
  let s = fxSize(q, k);
  var tone = mix(q.f.y, q.f.z, k);
  var glowK = 1.0; var rough = 0.45; var metal = 0.0;
  let sd = q.g.y;
  let axis = normalize(vec3f(fxHash(sd * 13.0) - 0.5, fxHash(sd * 29.0) - 0.5 + 0.01, fxHash(sd * 41.0) - 0.5));
  var p = v.position;
  var fade = 1.0 - smoothstep(0.75, 1.0, k);
  if (st == ${FX.COIN}) {
    // (v840) a coin: a flat disc (stretch: its thickness for its radius) flipping end over end about a level axis
    // turned by its seed, set up by its thickness so it lies on the ground once it settles flat (see the sim); metal,
    // its shine and roughness from U.coin, dithering out over the last part of its life (U.coin.w: from how far on)
    let ax = vec3f(cos(sd * 6.283), 0.0, sin(sd * 6.283));
    let th = max(q.h.z, 0.04);
    p = fxTurn(p * vec3f(s, s * th, s), ax, q.h.x) + vec3f(0.0, s * th, 0.0);
    metal = U.coin.x; rough = U.coin.y;
    fade = 1.0 - smoothstep(U.coin.w, 1.0, k);
  } else if (st == ${FX.SHARD}) {
    p = fxTurn(p * vec3f(0.45, 1.4, 0.3) * s, axis, q.h.x);
  } else if (st == ${FX.CHUNK}) {
    p = fxTurn(p * vec3f(1.0, 0.75, 0.9) * s, axis, q.h.x);
  } else if (st == ${FX.LEAF}) {
    // (v829) a leaf: a thin lozenge (stretch: how wide, for its length; 0 = 0.55), rocking side to side and
    // tumbling as it flutters, swaying a little as it drifts, shrinking away at the end (no dither)
    let age = U.now.x - q.a.w;
    let wid = select(0.55, q.h.z, q.h.z > 0.0);
    let sh = 1.0 - smoothstep(0.8, 1.0, k);
    let air = select(1.0, 0.0, abs(q.b.y) < 1e-4 && length(q.b.xz) < 0.05);
    var lp = p * vec3f(wid, 0.06, 1.0) * s * sh;
    lp = fxTurn(lp, vec3f(0.0, 0.0, 1.0), 0.7 * sin(age * 5.3 + sd * 31.0) * air);
    p = fxTurn(lp, axis, q.h.x) + vec3f(sin(age * 3.1 + sd * 17.0), 0.0, cos(age * 2.7 + sd * 23.0)) * 0.07 * air;
    rough = 0.8;
    fade = 1.0;
  } else if (st == ${FX.DROP}) {
    let vel = q.b.xyz; let sp = length(vel);
    let dir = select(vec3f(0.0, 1.0, 0.0), vel / max(sp, 1e-4), sp > 0.2);
    // (resting on the ground, a flat bead)
    let rest = sp < 0.2 && abs(q.b.y) < 1e-4;
    var lp = p * vec3f(0.6, 1.0 + q.h.z * sp, 0.6) * s;
    if (rest) { lp = p * vec3f(1.3, 0.25, 1.3) * s; }
    // (its long way along the way it's going)
    let t = normalize(cross(vec3f(0.0, 1.0, 0.0), dir) + vec3f(1e-4, 0.0, 0.0));
    let b = cross(dir, t);
    p = select(t * lp.x + dir * lp.y + b * lp.z, lp, rest);
  } else if (st == ${FX.DOME}) {
    // a dome swelling up out of a surface (a bubble of lava, of mud), wobbling, bulging up more as it grows, its
    // skin thinning and glowing hotter toward the end; then it bursts, collapsing in the last tenth of its life
    let gr = sqrt(sat(k / 0.9));
    let pop = 1.0 - smoothstep(0.9, 1.0, k);
    let wob = 1.0 + 0.06 * sin(U.now.x * 23.0 + sd * 40.0) * gr;
    let r = s * gr * wob * pop;
    let hgt = r * (0.5 + 0.45 * gr) * (1.0 + 0.04 * sin(U.now.x * 31.0 + sd * 17.0));
    p = vec3f(p.x * r, p.y * hgt, p.z * r);
    let lh = sat(v.position.y);
    tone = mix(q.f.y, q.f.z, lh);
    glowK = mix(1.5, 0.6, lh) * (1.0 + 1.8 * smoothstep(0.62, 0.9, k));
    rough = 0.22;
    fade = 1.0;
  } else {
    // a crystal out of the ground: it shoots up overshooting, stands, and sinks back at the end
    let g = sat(k / 0.12);
    let c1 = 2.6; let c3 = c1 + 1.0;
    let gm = g - 1.0;
    let grow = 1.0 + c3 * gm * gm * gm + c1 * gm * gm;
    let sink = 1.0 - smoothstep(0.72, 1.0, k);
    let h = s * grow * sink;
    let lean = vec3f(fxHash(sd * 7.0) - 0.5, 0.0, fxHash(sd * 11.0) - 0.5) * 0.9;
    let up = normalize(vec3f(0.0, 1.0, 0.0) + lean);
    var lp = vec3f(p.x * 0.32 * s * sink, (p.y + 1.0) * 0.5 * h, p.z * 0.32 * s * sink);
    lp = fxTurn(lp, vec3f(0.0, 1.0, 0.0), sd * 6.283);
    let t = normalize(cross(up, vec3f(0.0, 0.0, 1.0)));
    let b = cross(t, up);
    p = t * lp.x + up * lp.y + b * lp.z - up * 0.05 * s;
    fade = 1.0;
  }
  let w = q.a.xyz + p;
  o.pos = F.viewProj * vec4f(w, 1.0);
  o.w = w;
  o.col = fxRamp(q.f.x, tone);
  o.glow = q.g.z * U.look.y * glowK; o.fade = fade * q.f.w; o.rough = rough; o.metal = metal;
  return o;
}
var<private> BAYER: array<f32, 16> = array<f32, 16>(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  // (it dithers away at the end of its life)
  let c = vec2u(i.pos.xy) % vec2u(4u);
  if (i.fade < (BAYER[c.y * 4u + c.x] + 0.5) / 16.0) { discard; }
  let n = flatNormal(i.w - F.camPos.xyz);
  var col = shadeLit(i.col, i.col * i.glow, i.metal, i.rough, i.w, n, true);
  // (v840) metal (coins) mirrors the sky above and the ground below, so a face catches the light as it turns (there's
  // no picture of the world round it to mirror): U.coin.z how much
  if (i.metal > 0.0) {
    let R = reflect(-toEye(i.w), n);
    let env = mix(F.hemiGround.rgb, F.hemiSky.rgb * 1.6, smoothstep(-0.25, 0.35, R.y));
    col += i.col * i.metal * env * U.coin.z;
  }
  return vec4f(applyFog(col, viewDepth(i.w)), 1.0);
}`;

// a quad's six corners (the see-through draw) and an eight-faced gem's (the solid one)
function quadGeo() {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  return g;
}
function gemGeo() {
  const T = [0, 1, 0], B = [0, -1, 0], R = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]], pos = [];
  for (let k = 0; k < 4; k++) {
    const a = R[k], b = R[(k + 1) % 4];
    pos.push(...T, ...b, ...a, ...B, ...a, ...b);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}
// a low dome: rings of a sphere from a little under its equator (a skirt hidden under the surface) up to the top
function domeGeo(seg = 10) {
  const el = [-0.45, 0, 0.42, 0.85, 1.2, Math.PI / 2], pos = [];
  const P = (j, k) => { const e = el[j], a = k / seg * Math.PI * 2; return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)]; };
  for (let j = 0; j < el.length - 1; j++) for (let k = 0; k < seg; k++) {
    const a = P(j, k), b = P(j, k + 1), c = P(j + 1, k + 1), d = P(j + 1, k);
    if (j < el.length - 2) pos.push(...a, ...b, ...c, ...a, ...c, ...d); else pos.push(...a, ...b, ...c);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

// (v840) a coin: a flat twelve-sided cylinder, radius 1, from y -1 to 1 (squashed to its thickness in the shader)
function coinGeo(seg = 12) {
  const pos = [], P = (k, y) => { const a = k / seg * Math.PI * 2; return [Math.cos(a), y, Math.sin(a)]; };
  for (let k = 0; k < seg; k++) {
    const a0 = P(k, 1), a1 = P(k + 1, 1), b0 = P(k, -1), b1 = P(k + 1, -1);
    pos.push(0, 1, 0, ...a1, ...a0, 0, -1, 0, ...b0, ...b1, ...a0, ...a1, ...b1, ...a0, ...b1, ...b0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

// The particle pool. opts: { cap (see-through slots), solidCap (solid slots), domeCap (dome slots), coinCap (coin slots), shared: uniforms
// to share with the game ({ tRefrD, refr }: the depth behind, for soft edges) }. clearMesh, solidMesh and domeMesh
// go into the scene where the game wants them drawn. wave: [height, length, phase] of the surface particles that
// ride the waves sit on (see waveAt).
export class FxParticles {
  constructor(renderer, { cap = 8192, solidCap = 1024, domeCap = 128, coinCap = 512, shared = {} } = {}) {
    this.renderer = renderer;
    const dev = this.device = renderer.device, B = GPUBufferUsage;
    this.cap = cap; this.solidCap = solidCap; this.domeCap = domeCap; this.coinCap = coinCap;
    const n = cap + solidCap + domeCap + coinCap;
    this.data = new Float32Array(n * FLOATS);
    this.buf = dev.createBuffer({ size: n * FLOATS * 4, usage: B.STORAGE | B.COPY_DST });
    this.simU = dev.createBuffer({ size: 48, usage: B.UNIFORM | B.COPY_DST });
    this.simData = new Float32Array(12);
    const module = dev.createShaderModule({ code: SIM_WGSL, label: 'fx sim' });
    if (module.getCompilationInfo) module.getCompilationInfo().then(info => {
      for (const e of info.messages) if (e.type === 'error') console.error(`fx sim WGSL ${e.lineNum}:${e.linePos} ${e.message}\n` + SIM_WGSL.split('\n')[e.lineNum - 1]);
    });
    this.pipeline = dev.createComputePipeline({ label: 'fx sim', layout: 'auto', compute: { module, entryPoint: 'step' } });
    this.group = dev.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.simU } }, { binding: 1, resource: { buffer: this.buf } }] });
    this.now = 0;
    this.next = 0; this.nextSolid = 0; this.nextDome = 0; this.nextCoin = 0;
    this.dirty = [];          // [first slot, last slot] ranges to send
    this.clearUntil = 0; this.solidUntil = 0; this.domeUntil = 0; this.coinUntil = 0;   // the fx clock by which every particle of each kind is gone
    this.gravity = 9; this.turbScale = 0.9; this.wind = [0, 0, 0]; this.wave = [0, 1, 0];
    // ramps: names to ids, and their colours for the shaders
    this.rampIds = new Map(); this.rampData = new Float32Array(MAX_RAMPS * RAMP_N * 4);
    this.look = { x: 1, y: 1, z: 1, w: 3 };   // hard ramp steps (1) or blended (0); glow ×; size ×; light bands on soft volumes (0 smooth)
    this.puff = { x: 6, y: 0, z: 1.1, w: 0 };
    this.coin = { x: 0.7, y: 0.28, z: 1, w: 0.7 };   // (v840) coins: metalness, roughness, how much they mirror the sky, where they start to dither out (life 0-1)   // puffs' and smoke's lumps (in their normals only): how much they bend the light, _, how many across, _
    const U = {
      now: { value: { x: 0, y: 0, z: 0, w: 0 } }, look: { value: this.look }, puff: { value: this.puff }, coin: { value: this.coin }, ramps: { value: this.rampData },
      tRefrD: shared.tRefrD || { value: null }, refr: shared.refr || { value: 0 }, base: { value: { x: 0, y: 0 } },
    };
    this.uniforms = U;
    // (the smoke sprites, 4 in a 2 x 2 atlas: white until loadSmoke has them)
    this.smokeTex = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.clearMat = new ShaderMaterial({ uniforms: Object.assign({}, U, { tSmoke: { value: this.smokeTex } }), code: CLEAR_WGSL, transparent: true, depthWrite: false, side: DoubleSide,
      blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor });
    this.clearMat.keepAlpha = true;
    this.clearMat.storage = { parts: { buffer: this.buf, type: 'array<FxP>' } };
    this.solidMat = new ShaderMaterial({ uniforms: U, code: SOLID_WGSL, side: DoubleSide });
    this.solidMat.storage = { parts: { buffer: this.buf, type: 'array<FxP>' } };
    // (the domes: the same shader over their own slots, base.y 1)
    this.domeMat = new ShaderMaterial({ uniforms: Object.assign({}, U, { base: { value: { x: cap + solidCap, y: 1 } } }), code: SOLID_WGSL, side: DoubleSide });
    this.domeMat.storage = { parts: { buffer: this.buf, type: 'array<FxP>' } };
    // (the coins: the same again over theirs, base.y 2)
    this.coinMat = new ShaderMaterial({ uniforms: Object.assign({}, U, { base: { value: { x: cap + solidCap + domeCap, y: 2 } } }), code: SOLID_WGSL, side: DoubleSide });
    this.coinMat.storage = { parts: { buffer: this.buf, type: 'array<FxP>' } };
    const qg = quadGeo(); qg.instanceCount = n;
    const gg = gemGeo(); gg.instanceCount = n;
    this.clearMesh = new Mesh(qg, this.clearMat); this.clearMesh.frustumCulled = false;
    this.solidMesh = new Mesh(gg, this.solidMat); this.solidMesh.frustumCulled = false;
    const dg = domeGeo(); dg.instanceCount = domeCap;
    this.domeMesh = new Mesh(dg, this.domeMat); this.domeMesh.frustumCulled = false;
    this.domeMesh.castShadow = false; this.domeMesh.visible = false;
    const cg = coinGeo(); cg.instanceCount = coinCap;
    this.coinMesh = new Mesh(cg, this.coinMat); this.coinMesh.frustumCulled = false;
    this.coinMesh.castShadow = false; this.coinMesh.visible = false;
    this.clearMesh.castShadow = this.solidMesh.castShadow = false;
    this.clearMesh.visible = this.solidMesh.visible = false;
    this.ramp('white', ['#3a3a40', '#6a6a72', '#9a9aa2', '#c0c0c8', '#dadae0', '#ececf0', '#f6f6f8', '#ffffff']);
  }
  // a ramp by name: dark to bright colours (any number, resampled to RAMP_N); returns its id. Given again, it's replaced
  ramp(name, cols) {
    let id = this.rampIds.get(name);
    if (cols) {
      if (id === undefined) { id = this.rampIds.size; if (id >= MAX_RAMPS) { console.warn('fx: too many ramps'); return 0; } this.rampIds.set(name, id); }
      const c = new Color();
      for (let k = 0; k < RAMP_N; k++) {
        const x = cols.length === 1 ? 0 : k / (RAMP_N - 1) * (cols.length - 1), i = Math.floor(x), f = x - i;
        const a = c.set(cols[i]).clone(), b = new Color().set(cols[Math.min(cols.length - 1, i + 1)]);
        const o = (id * RAMP_N + k) * 4;
        this.rampData[o] = a.r + (b.r - a.r) * f; this.rampData[o + 1] = a.g + (b.g - a.g) * f; this.rampData[o + 2] = a.b + (b.b - a.b) * f; this.rampData[o + 3] = 1;
      }
    }
    return id ?? 0;
  }
  // a ramp from one colour: from its shadow up to a pale version of it (for a tint given as a single colour)
  tint(hex) {
    const name = 'tint:' + hex;
    if (this.rampIds.has(name)) return this.rampIds.get(name);
    const c = new Color().set(hex), cols = [];
    for (let k = 0; k < RAMP_N; k++) {
      const t = k / (RAMP_N - 1), dark = 0.35 + 0.65 * Math.min(1, t * 1.6), pale = Math.max(0, t - 0.6) * 0.8;
      const ch = v => Math.round(255 * Math.min(1, v * dark + (1 - v * dark) * pale)).toString(16).padStart(2, '0');
      cols.push('#' + ch(c.r) + ch(c.g) + ch(c.b));
    }
    return this.ramp(name, cols);
  }
  // the SMOKE style's four sprites (grey images, all one size), laid into the 2 x 2 atlas the shader reads
  async loadSmoke(urls) {
    const imgs = await Promise.all(urls.map(async u => {
      const res = await fetch(u);
      if (!res.ok) throw new Error(`Couldn't load ${u} (${res.status})`);
      return createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    }));
    const S = imgs[0].width, cv = new OffscreenCanvas(S * 2, S * 2), ctx = cv.getContext('2d', { willReadFrequently: true });
    imgs.forEach((im, k) => ctx.drawImage(im, (k % 2) * S, Math.floor(k / 2) * S, S, S));
    const px = ctx.getImageData(0, 0, S * 2, S * 2).data;
    this.smokeTex.image = { data: new Uint8Array(px.buffer.slice(0)), width: S * 2, height: S * 2 };
    this.smokeTex.needsUpdate = true;
  }
  // spawn one particle. p: { style, x, y, z, vx, vy, vz, life, delay, ax, ay, az (anchor), floor, size0, size1,
  // grav, drag, pull, swirl, turb, bounce, ramp (id), tone0, tone1, alpha, glow, ramp2 (a flame's smoke), ride (it sits
  // on the rippling surface `wave` over its floor), rot, spin, stretch, cover (or morph, for a flame) }
  spawn(p) {
    const solid = isSolid(p.style), dome = p.style === FX.DOME, coin = p.style === FX.COIN;
    let slot;
    if (coin) { slot = this.cap + this.solidCap + this.domeCap + this.nextCoin; this.nextCoin = (this.nextCoin + 1) % this.coinCap; }
    else if (dome) { slot = this.cap + this.solidCap + this.nextDome; this.nextDome = (this.nextDome + 1) % this.domeCap; }
    else if (solid) { slot = this.cap + this.nextSolid; this.nextSolid = (this.nextSolid + 1) % this.solidCap; }
    else { slot = this.next; this.next = (this.next + 1) % this.cap; }
    const d = this.data, o = slot * FLOATS, born = this.now + (p.delay || 0), life = Math.max(0.01, p.life || 1);
    d[o] = p.x; d[o + 1] = p.y; d[o + 2] = p.z; d[o + 3] = born;
    d[o + 4] = p.vx || 0; d[o + 5] = p.vy || 0; d[o + 6] = p.vz || 0; d[o + 7] = life;
    d[o + 8] = p.ax ?? p.x; d[o + 9] = p.ay ?? p.y; d[o + 10] = p.az ?? p.z; d[o + 11] = p.floor ?? -1e9;
    d[o + 12] = p.size0 ?? 0.1; d[o + 13] = p.size1 ?? p.size0 ?? 0.1; d[o + 14] = p.grav || 0; d[o + 15] = p.drag || 0;
    d[o + 16] = p.pull || 0; d[o + 17] = p.swirl || 0; d[o + 18] = p.turb || 0; d[o + 19] = p.bounce || 0;
    d[o + 20] = p.ramp || 0; d[o + 21] = p.tone0 ?? 1; d[o + 22] = p.tone1 ?? 0.3; d[o + 23] = p.alpha ?? 1;
    d[o + 24] = p.style; d[o + 25] = Math.random(); d[o + 26] = p.glow || 0; d[o + 27] = p.style === FX.FLAME ? p.ramp2 || 0 : p.ride ? 1 : 0;
    d[o + 28] = p.rot ?? Math.random() * 6.283; d[o + 29] = p.spin || 0; d[o + 30] = p.stretch || 0; d[o + 31] = p.cover ?? (p.style === FX.FLAME ? 0 : 1);
    const last = this.dirty[this.dirty.length - 1];
    if (last && last[1] === slot - 1) last[1] = slot; else this.dirty.push([slot, slot]);
    const end = born + life;
    if (coin) this.coinUntil = Math.max(this.coinUntil, end);
    else if (dome) this.domeUntil = Math.max(this.domeUntil, end);
    else if (solid) this.solidUntil = Math.max(this.solidUntil, end); else this.clearUntil = Math.max(this.clearUntil, end);
    return slot;
  }
  // how many slots a kind has free before the oldest are taken over (only roughly: a count of what may still live)
  get busy() { return this.now < this.clearUntil || this.now < this.solidUntil || this.now < this.domeUntil || this.now < this.coinUntil; }
  // step everything by dt seconds (0 holds them still): send the new ones, then the compute pass
  update(dt) {
    this.now += dt;
    const q = this.device.queue;
    for (const [a, b] of this.dirty) q.writeBuffer(this.buf, a * FLOATS * 4, this.data, a * FLOATS, (b - a + 1) * FLOATS);
    this.dirty.length = 0;
    const U = this.uniforms;
    U.now.value.x = this.now;
    this.clearMesh.visible = this.now < this.clearUntil;
    this.solidMesh.visible = this.now < this.solidUntil;
    this.domeMesh.visible = this.now < this.domeUntil;
    this.coinMesh.visible = this.now < this.coinUntil;
    if (!this.busy || dt <= 0) return;
    const s = this.simData;
    s[0] = this.now; s[1] = Math.min(dt, 0.05); s[2] = this.turbScale; s[3] = this.gravity;
    s[4] = this.wind[0]; s[5] = this.wind[1]; s[6] = this.wind[2];
    s[8] = this.wave[0]; s[9] = this.wave[1]; s[10] = this.wave[2];
    q.writeBuffer(this.simU, 0, s);
    const n = this.cap + this.solidCap + this.domeCap + this.coinCap;
    this.renderer.compute(enc => {
      const pass = enc.beginComputePass({ label: 'fx particles' });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.group);
      pass.dispatchWorkgroups(Math.ceil(n / 64));
      pass.end();
    });
  }
  // every live particle gone at once
  clear() {
    this.data.fill(0);
    this.device.queue.writeBuffer(this.buf, 0, this.data);
    this.dirty.length = 0; this.clearUntil = this.solidUntil = this.domeUntil = this.coinUntil = 0;
  }
}

// ---------- Effects ----------
// An effect: { phases: [phase...], scale? }. A phase: { name, dur (s), loop? (repeats till stop()), emit: [emitter...],
// light?: { at, color, k: [at its start, at its end], range }, flash?: { at, color, k, range, life } (a light that
// flares as it begins and dies away), event?: a name the game hears as it begins (with the effect), shake?: how
// hard the view shakes as it begins, stop?: hit-stop seconds as it begins }.
//
// An emitter places particles round a point of the effect, in its own frame (x to its right, y up, z ahead, ×
// its scale): { style ('spark', 'puff'... or FX.*), count (a burst as the phase begins) or rate (a second, through
// the phase; [from, to] eases across it), at: [x, y, z] or 'target' (o.target), shape, velocity, and how they
// live and look }. Any number can be a range [lo, hi], picked afresh each particle.
//   shape: 'point' | { sphere: r } | { ring: r, y?, arc?: [a0, a1] (rad, 0 = ahead) } | { disc: r } | { box: [x, y, z] }
//     | { line: length } (ahead), with grow: true to scale its size by how far through the phase it is (a
//     spreading front)
//   velocity: out (away from the shape's middle), up, ahead, jitter (any way), gather (toward the anchor, timed
//     to reach it as it dies, × this), inherit? (the effect's own motion)
//   anchor: [x, y, z] (local) or 'target' (pull, swirl and a beam's end; the emitter's point when not given)
//   life, delay, size: [at birth, at death] (each a number or range), grav (× g: negative rises), drag, pull,
//   swirl, turb, bounce, ramp (name), tone: [at birth, at death], alpha, glow, spin, stretch, cover (0-1: how much
//   it hides what's behind; 0 = light only), morph (a flame turning to smoke this far through its life), smoke
//   (the ramp it turns to), floor: true (it lands on the ground under it), onGround: true (it's put on the ground)
// Special emitters: { bolt: { from, to, jag, segments, forks, width, life, every } } draws jagged beams, re-rolled
// `every` seconds through the phase.
const STYLE = { glow: FX.GLOW, spark: FX.SPARK, glint: FX.GLINT, puff: FX.PUFF, flame: FX.FLAME, ring: FX.RING, disc: FX.DISC,
  beam: FX.BEAM, shard: FX.SHARD, crystal: FX.CRYSTAL, drop: FX.DROP, chunk: FX.CHUNK, smoke: FX.SMOKE, plus: FX.PLUS, leaf: FX.LEAF, coin: FX.COIN };
const pick = v => Array.isArray(v) ? v[0] + Math.random() * (v[1] - v[0]) : v;

// A phase can also move: { move: { from, to, arc } } carries its 'head' point from one to the other across the phase
// (a thrown fireball, a falling meteor); emitters and lights at 'head' follow it.
// game: { ground(x, z) -> y, onEvent(name, fx, phase), shake(amount), hitStop(s), sound(name) }; density (× counts, rates)
export class FxRunner {
  constructor(parts, game = {}) {
    this.parts = parts; this.game = game;
    this.live = [];
    this.lights = [];   // this frame's lights the effects want: { x, y, z, color, k, range }
    this.density = 1;
  }
  // play effect def at o: { x, y, z, dir (yaw: ahead is (sin, cos)), scale, target: {x, y, z}, ramp (a ramp
  // name every emitter uses instead of its own), follow?: () => ({ x, y, z, dir }) (it moves with something) }
  play(def, o = {}) {
    const fx = { def, o: Object.assign({ x: 0, y: 0, z: 0, dir: 0, scale: def.scale || 1 }, o), t: 0, phase: -1, pt: 0, stopping: false, done: false,
      acc: [], flashes: [], bolts: [] };
    this.live.push(fx);
    this._enter(fx, 0);
    return { stop: () => { fx.stopping = true; }, get done() { return fx.done; }, fx };
  }
  stopAll() { for (const fx of this.live) fx.stopping = true; }
  // the effect's frame: a local point (x right, y up, z ahead, × scale) in the world
  _world(fx, l) {
    const o = fx.o, s = o.scale, c = Math.cos(o.dir), n = Math.sin(o.dir);
    return [o.x + (l[0] * c + l[2] * n) * s, o.y + l[1] * s, o.z + (-l[0] * n + l[2] * c) * s];
  }
  _dirWorld(fx, l) {
    const c = Math.cos(fx.o.dir), n = Math.sin(fx.o.dir);
    return [l[0] * c + l[2] * n, l[1], -l[0] * n + l[2] * c];
  }
  // a point of the effect: a local [x, y, z], 'target', 'head' (where a phase's move has got to), or { t: [x, y, z] }
  // (that far off the target, in the world's own axes, × scale)
  _point(fx, at) {
    const t = fx.o.target || fx.o, s = fx.o.scale;
    if (at === 'target') return [t.x, t.y, t.z];
    if (at === 'head') return fx.head ? fx.head.slice() : [fx.o.x, fx.o.y, fx.o.z];
    if (at && at.t) return [t.x + at.t[0] * s, t.y + at.t[1] * s, t.z + at.t[2] * s];
    return this._world(fx, at || [0, 0, 0]);
  }
  _enter(fx, i) {
    const ph = fx.def.phases;
    if (i >= ph.length) { fx.done = true; return; }
    fx.phase = i; fx.pt = 0;
    const p = ph[i];
    // (a phase that moves: its head goes from one point to another across it, arcing up by `arc` at the middle)
    fx.move = p.move ? { from: this._point(fx, p.move.from), to: this._point(fx, p.move.to || 'target'), arc: (p.move.arc || 0) * fx.o.scale } : null;
    if (fx.move) fx.head = fx.move.from.slice();
    fx.acc = (p.emit || []).map(() => 0);
    fx.bolts = (p.emit || []).map(() => 0);
    (p.emit || []).forEach((e, k) => { if (e.count) this._emit(fx, e, Math.round(pick(e.count) * this.density), 0); if (e.bolt) { this._bolt(fx, e); fx.bolts[k] = 0; } });
    if (p.flash) fx.flashes.push({ ...p.flash, t: 0, at: this._point(fx, p.flash.at) });
    if (p.event && this.game.onEvent) this.game.onEvent(p.event, fx, p);
    if (p.shake && this.game.shake) this.game.shake(p.shake);
    if (p.stop && this.game.hitStop) this.game.hitStop(p.stop);
    if (p.sfx && this.game.sound) this.game.sound(p.sfx);
  }
  update(dt) {
    this.lights.length = 0;
    for (const fx of this.live) {
      if (fx.done) continue;
      if (fx.o.follow) Object.assign(fx.o, fx.o.follow());
      fx.t += dt; fx.pt += dt;
      const p = fx.def.phases[fx.phase], dur = Math.max(1e-3, p.dur || 0), u = Math.min(1, fx.pt / dur);
      if (fx.move) {
        const m = fx.move;
        for (let k = 0; k < 3; k++) fx.head[k] = m.from[k] + (m.to[k] - m.from[k]) * u;
        fx.head[1] += m.arc * 4 * u * (1 - u);
      }
      // spawning through the phase
      (p.emit || []).forEach((e, k) => {
        if (e.rate) {
          const r = Array.isArray(e.rate) ? e.rate[0] + (e.rate[1] - e.rate[0]) * u : e.rate;
          fx.acc[k] += r * dt * this.density;
          const n = Math.floor(fx.acc[k]);
          if (n > 0) { fx.acc[k] -= n; this._emit(fx, e, n, u); }
        }
        if (e.bolt && e.bolt.every) { fx.bolts[k] += dt; if (fx.bolts[k] >= e.bolt.every) { fx.bolts[k] = 0; this._bolt(fx, e); } }
      });
      if (p.light) {
        const L = p.light, k = Array.isArray(L.k) ? L.k[0] + (L.k[1] - L.k[0]) * u : L.k;
        const at = this._point(fx, L.at);
        this.lights.push({ x: at[0], y: at[1], z: at[2], color: L.color, k: k * (L.flicker ? 1 - L.flicker * Math.random() : 1), range: L.range || 4 });
      }
      if (fx.pt >= dur) {
        if (p.loop && !fx.stopping) { fx.pt -= dur; this._enter(fx, fx.phase); }
        else if (p.loop && fx.stopping) this._enter(fx, fx.phase + 1);
        else this._enter(fx, fx.phase + 1);
      }
    }
    // flares: bright at once, dying away by the square of what's left
    for (const fx of this.live) {
      for (const f of fx.flashes) {
        f.t += dt;
        const left = 1 - f.t / (f.life || 0.3);
        if (left > 0) this.lights.push({ x: f.at[0], y: f.at[1], z: f.at[2], color: f.color, k: f.k * left * left, range: f.range || 5 });
      }
      fx.flashes = fx.flashes.filter(f => f.t < (f.life || 0.3));
    }
    this.live = this.live.filter(fx => !fx.done || fx.flashes.length);
  }
  // n particles from emitter e, u through its phase
  _emit(fx, e, n, u) {
    const P = this.parts, o = fx.o, s = o.scale, style = typeof e.style === 'number' ? e.style : STYLE[e.style] ?? FX.GLOW;
    const ramp = P.ramp(o.ramp || e.ramp || 'white'), smoke = e.smoke ? P.ramp(e.smoke) : P.ramp('smoke') || 0;
    const base = this._point(fx, e.at);
    const anchorW = e.anchor === 'target' ? this._point(fx, 'target') : e.anchor ? this._world(fx, e.anchor) : base;
    const sh = e.shape || 'point', grow = sh.grow ? Math.max(0.02, u) : 1;
    const ground = o.ground || this.game.ground;   // (o.ground: a ground of its own, such as the water's surface)
    for (let i = 0; i < n; i++) {
      // where in its shape (local, about its middle), and the way out of the middle
      let lx = 0, ly = 0, lz = 0, ox = 0, oy = 0, oz = 0;
      if (sh.sphere !== undefined) {
        const r = pick(sh.sphere) * grow, a = Math.random() * 6.283, y = Math.random() * 2 - 1, q = Math.sqrt(1 - y * y);
        ox = Math.cos(a) * q; oy = y; oz = Math.sin(a) * q; lx = ox * r; ly = oy * r; lz = oz * r;
      } else if (sh.ring !== undefined || sh.disc !== undefined) {
        const arc = sh.arc || [0, 6.283], a = arc[0] + Math.random() * (arc[1] - arc[0]);
        const r = (sh.ring !== undefined ? pick(sh.ring) : pick(sh.disc) * Math.sqrt(Math.random())) * grow;
        ox = Math.sin(a); oz = Math.cos(a); lx = ox * r; lz = oz * r; ly = sh.y !== undefined ? pick(sh.y) : 0;
      } else if (sh.box) {
        lx = (Math.random() - 0.5) * sh.box[0]; ly = (Math.random() - 0.5) * sh.box[1]; lz = (Math.random() - 0.5) * sh.box[2];
        const l = Math.hypot(lx, ly, lz) || 1; ox = lx / l; oy = ly / l; oz = lz / l;
      } else if (sh.line !== undefined) {
        lz = Math.random() * pick(sh.line) * grow; oz = 1;
      }
      // world spot and the way out
      const dw = this._dirWorld(fx, [lx, ly, lz]), ow = this._dirWorld(fx, [ox, oy, oz]), fw = this._dirWorld(fx, [0, 0, 1]);
      const x = base[0] + dw[0] * s, z = base[2] + dw[2] * s;
      let y = base[1] + dw[1] * s;
      const gy = ground ? ground(x, z) : -1e9;
      if (e.onGround && ground) y = gy + (sh.y !== undefined ? pick(sh.y) * s : 0);
      // its velocity
      const out = pick(e.out ?? 0) * s, up = pick(e.up ?? 0) * s, ahead = pick(e.ahead ?? 0) * s, jit = pick(e.jitter ?? 0) * s;
      let vx = ow[0] * out + fw[0] * ahead, vy = ow[1] * out + up, vz = ow[2] * out + fw[2] * ahead;
      if (jit) { const a = Math.random() * 6.283, yy = Math.random() * 2 - 1, q = Math.sqrt(1 - yy * yy); vx += Math.cos(a) * q * jit; vy += yy * jit; vz += Math.sin(a) * q * jit; }
      const life = pick(e.life ?? 1);
      if (e.gather) { const g = pick(e.gather); vx += (anchorW[0] - x) / life * g; vy += (anchorW[1] - y) / life * g; vz += (anchorW[2] - z) / life * g; }
      // (size: a number, or [at birth, at death], each of those a number or a range)
      const size = e.size === undefined ? [0.1, 0.1] : Array.isArray(e.size) ? e.size : [e.size, e.size];
      const tone = e.tone || [1, 0.3];
      P.spawn({
        style, x, y, z, vx, vy, vz, life, delay: pick(e.delay ?? 0),
        ax: anchorW[0], ay: anchorW[1], az: anchorW[2], floor: e.floor || e.onGround ? gy : -1e9,
        size0: pick(size[0]) * s, size1: pick(size[1]) * s, grav: pick(e.grav ?? 0), drag: pick(e.drag ?? 0),
        pull: pick(e.pull ?? 0), swirl: pick(e.swirl ?? 0), turb: pick(e.turb ?? 0), bounce: pick(e.bounce ?? 0),
        ramp, tone0: pick(tone[0]), tone1: pick(tone[1]), alpha: pick(e.alpha ?? 1), glow: pick(e.glow ?? 0), ramp2: smoke,
        rot: e.rot !== undefined ? pick(e.rot) + o.dir : undefined, spin: pick(e.spin ?? 0), stretch: pick(e.stretch ?? 0),
        cover: style === FX.FLAME ? pick(e.morph ?? 0) : pick(e.cover ?? 1),
      });
    }
  }
  // jagged beams from one point to another, forking
  _bolt(fx, e) {
    const b = e.bolt, P = this.parts, s = fx.o.scale, ramp = P.ramp(fx.o.ramp || e.ramp || 'white');
    const from = this._point(fx, b.from), to = this._point(fx, b.to || 'target');
    const seg = (a, c, n, jag, width, depth) => {
      let prev = a;
      for (let k = 1; k <= n; k++) {
        const t = k / n, j = k === n ? 0 : jag * s * Math.sin(t * Math.PI);
        const pt = [a[0] + (c[0] - a[0]) * t + (Math.random() - 0.5) * 2 * j, a[1] + (c[1] - a[1]) * t + (Math.random() - 0.5) * j, a[2] + (c[2] - a[2]) * t + (Math.random() - 0.5) * 2 * j];
        P.spawn({ style: FX.BEAM, x: prev[0], y: prev[1], z: prev[2], ax: pt[0], ay: pt[1], az: pt[2], life: pick(b.life ?? 0.12), size0: width * s, size1: width * s * 0.6,
          ramp, tone0: 1, tone1: 0.6, alpha: 1, glow: pick(e.glow ?? 3) });
        // a fork off this joint, now and then
        if (depth < 1 && k < n && Math.random() < (b.forks ?? 0.25)) {
          const l = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) * (1 - t) * 0.5;
          const end = [pt[0] + (Math.random() - 0.5) * l, pt[1] - Math.random() * l * 0.8, pt[2] + (Math.random() - 0.5) * l];
          seg(pt, end, Math.max(2, Math.round(n / 3)), jag * 0.6, width * 0.5, depth + 1);
        }
        prev = pt;
      }
    };
    seg(from, to, b.segments || 8, b.jag ?? 0.4, b.width ?? 0.12, 0);
  }
}

// (the WGSL, for checking outside a browser)
export const FX_WGSL = { sim: SIM_WGSL, clear: CLEAR_WGSL, solid: SOLID_WGSL };
