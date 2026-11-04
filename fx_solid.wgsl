
struct PointL { pos: vec4f, color: vec4f }
struct Frame {
  view: mat4x4f,
  proj: mat4x4f,
  viewProj: mat4x4f,
  shadowMat: mat4x4f,
  camPos: vec4f,      // w: 1 for an orthographic camera
  camDir: vec4f,      // the way the camera looks; w: seconds
  fogColor: vec4f,    // w: 1 with haze
  fogRange: vec4f,    // near, far
  hemiSky: vec4f,     // w: 1 with a sky light
  hemiGround: vec4f,
  sunDir: vec4f,      // toward the sun; w: 1 with a sun
  sunColor: vec4f,    // w: 1 when it casts a shadow
  shadow: vec4f,      // bias, normal bias, radius, texel
  cloud: vec4f,       // offset x, y, scale, strength
  cloud2: vec4f,      // cover, softness, shadow strength, point lights
  res: vec4f,         // the target's width and height, and their inverses
  points: array<PointL, 16>,
  giA: vec4f,         // probe lighting: mode (0 off, 1 sky visibility, 2 bounce light), strength, minimum, bias
  giB: vec4f,         // the probe grid: its first column x, z (tiles), columns across, layers
  giC: vec4f,         // the height field: its first texel x, z, texels across
  hazeA: vec4f,       // lit haze (haze.js): on, clear (how much of its dimming the scene behind takes)
  hazeB: vec4f,       // its texels (mosaic pixels) across, down
  post: vec4f,        // eye adaptation on (exposure.js), HDR highlights' peak (× white; 0 without HDR), clip height (see builtinCode)
  bloom: vec4f,       // bloom (bloom.js): strength (0 off), _, its texture coordinates a mosaic pixel (x, y)
  insideA: vec4f,     // the inside fill (renderer.inside): its light (rgb), on (w > 0)
  insideB: vec4f,     // its 32 x 32 tile window's first tile x, z; the heights it lights, from y0 to y1
  insideBits: array<vec4u, 8>,   // which of the window's tiles are inside: bit (z * 32 + x)
  insideC: vec4f,     // (v535) its key light's way (toward it), and the hemisphere's floor-facing share
  insideD: vec4f,     // the key light's share, how far it evens out the light already there
}
struct Obj {
  model: mat4x4f,
  color: vec4f,       // a: opacity
  emissive: vec4f,    // w: 1 when it takes shadows
  pbr: vec4f,         // metalness, roughness, the mesh's objX
}
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSamp: sampler_comparison;
@group(0) @binding(3) var cloudTex: texture_2d<f32>;
@group(0) @binding(4) var linSamp: sampler;
@group(0) @binding(5) var giVisTex: texture_3d<f32>;
@group(0) @binding(6) var giLightTex: texture_3d<f32>;
@group(0) @binding(7) var giHfTex: texture_2d<f32>;
@group(0) @binding(8) var hazeTex: texture_2d<f32>;
@group(0) @binding(9) var<storage, read> eyeState: array<f32, 4>;
@group(0) @binding(10) var bloomTex: texture_2d<f32>;
@group(1) @binding(0) var<uniform> O: Obj;
fn giHfRaw(t: vec2i) -> vec4f { return textureLoad(giHfTex, t, 0); }
fn giHfOrigin() -> vec2i { return vec2i(F.giC.xy); }
fn giHfSize() -> i32 { return i32(F.giC.z); }
fn giStandInLight() -> vec3f { return GI_STAND_IN * (F.hemiSky.rgb + F.hemiGround.rgb); }
fn giGrid() -> vec4i { return vec4i(F.giB); }
fn giVisAt(i: vec3i) -> vec4f { return textureLoad(giVisTex, i, 0); }
fn giLightAt(i: vec3i) -> vec4f { return textureLoad(giLightTex, i, 0); }

const GI_TPT = 2;
const GI_STAND_IN = 0.15;   // the sky an unusable probe is taken to see
fn giLayerH(l: i32) -> f32 { return select(select(select(7.00, 3.20, l == 2), 1.40, l == 1), 0.40, l == 0); }
// the height field at world texel t (outside it: nothing, far below)
fn giHf(t: vec2i) -> vec4f {
  let r = t - giHfOrigin();
  let S = giHfSize();
  if (any(r < vec2i(0)) || any(r >= vec2i(S))) { return vec4f(-1e4, 1.0, 0.0, 1.0); }
  return giHfRaw(((t % S) + S) % S);
}
// a probe column's floor: the highest ground under its tile
fn giColumnBase(c: vec2i) -> f32 {
  let t = c * GI_TPT;
  return max(max(giHf(t).x, giHf(t + vec2i(1, 0)).x), max(giHf(t + vec2i(0, 1)).x, giHf(t + vec2i(1, 1)).x));
}
fn giInBand(s: vec4f, y: f32) -> bool { return y >= s.y && y <= s.z; }
fn giInsideBand(c: vec2i, y: f32) -> bool {
  let t = c * GI_TPT;
  return giInBand(giHf(t), y) || giInBand(giHf(t + vec2i(1, 0)), y) || giInBand(giHf(t + vec2i(0, 1)), y) || giInBand(giHf(t + vec2i(1, 1)), y);
}
fn giSlot(c: vec2i, n: i32) -> vec2i { return ((c % n) + n) % n; }

// the height field's ground at world point xz, bilinear between texel middles, so a wall's or cliff's edge is a
// short ramp rather than a step
fn giGround(xz: vec2f) -> f32 {
  let p = xz * f32(GI_TPT) - 0.5;
  let t = vec2i(floor(p)); let f = p - floor(p);
  let a = mix(giHf(t).x, giHf(t + vec2i(1, 0)).x, f.x);
  let b = mix(giHf(t + vec2i(0, 1)).x, giHf(t + vec2i(1, 1)).x, f.x);
  return mix(a, b, f.y);
}
// The probes' light at q facing n, from the 4 columns round it, two layers each (those either side of q's height
// over that column's floor): each weighted by nearness, less when it's behind the surface, and hardly at all
// when ground lies between them (across a cliff or a wall). Every factor changes smoothly with q, so no column
// drops out at a line on the ground. w = 0 when none is usable.
struct GIOut { w: f32, vis: vec4f, light: vec3f }
fn giGather(q: vec3f, n: vec3f, bounce: bool) -> GIOut {
  var out: GIOut;
  let g = giGrid();
  let gp = q.xz - 0.5;
  let base = vec2i(floor(gp));
  let f = gp - floor(gp);
  var wsum = 0.0;
  for (var i = 0; i < 4; i++) {
    let o = vec2i(i & 1, i >> 1);
    let c = base + o;
    let rel = c - g.xy;
    if (any(rel < vec2i(0)) || any(rel >= vec2i(g.z))) { continue; }
    let floorY = giColumnBase(c);
    if (floorY < -1000.0) { continue; }
    let h = q.y - floorY;
    var wc = select(1.0 - f.x, f.x, o.x == 1) * select(1.0 - f.y, f.y, o.y == 1);
    let hl = clamp(h, giLayerH(0), giLayerH(g.w - 1));
    let pp = vec3f(f32(c.x) + 0.5, floorY + hl, f32(c.y) + 0.5);
    var occ = 0.0;
    for (var j = 1; j < 3; j++) {
      let m = mix(q, pp, f32(j) / 3.0);
      occ = max(occ, smoothstep(0.0, 0.4, giGround(m.xz) - m.y));
    }
    wc *= mix(1.0, 0.005, occ);
    let to = pp - q;
    let wrap = (dot(normalize(to + vec3f(1e-4)), n) + 1.0) * 0.5;
    wc *= wrap * wrap + 0.2;
    var l = 0;
    for (var k = 1; k < g.w - 1; k++) { if (hl >= giLayerH(k)) { l = k; } }
    let t = clamp((hl - giLayerH(l)) / (giLayerH(l + 1) - giLayerH(l)), 0.0, 1.0);
    let s = giSlot(c, g.z);
    for (var e = 0; e < 2; e++) {
      let layer = l + e;
      let w = wc * select(1.0 - t, t, e == 1);
      if (w <= 0.0) { continue; }
      let v = giVisAt(vec3i(s.x, layer, s.y));
      // a probe that can't be used (inside a crown or a roof, or not lit yet) counts as a shaded stand-in, never
      // left out: leaving it out hands its share to the columns round it, and under a small tree (whose column's
      // low probes sit in its crown) the open ground's light would show as a bright square
      if (v.x < 0.0) {
        if (bounce) { out.light += w * giStandInLight(); } else { out.vis += w * vec4f(GI_STAND_IN, 0.0, 0.0, 0.0); }
        wsum += w;
        continue;
      }
      if (bounce) {
        let li = vec3i(s.x * 3, layer, s.y);
        let r = giLightAt(li);
        let gg = giLightAt(li + vec3i(1, 0, 0));
        let bb = giLightAt(li + vec3i(2, 0, 0));
        out.light += w * vec3f(r.x + 2.0 * dot(r.yzw, n), gg.x + 2.0 * dot(gg.yzw, n), bb.x + 2.0 * dot(bb.yzw, n));
      } else {
        out.vis += w * v;
      }
      wsum += w;
    }
  }
  out.w = wsum;
  if (wsum > 1e-6) { out.vis /= wsum; out.light = max(out.light / wsum, vec3f(0.0)); }
  return out;
}


const PI = 3.141592653589793;
fn sat(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }
// toward the eye from a point in the world
fn toEye(w: vec3f) -> vec3f {
  if (F.camPos.w > 0.5) { return -F.camDir.xyz; }
  return normalize(F.camPos.xyz - w);
}
fn viewDepth(w: vec3f) -> f32 { return -(F.view * vec4f(w, 1.0)).z; }
fn fogAmount(depth: f32) -> f32 {
  if (F.fogColor.w < 0.5) { return 0.0; }
  return smoothstep(F.fogRange.x, F.fogRange.y, depth);
}
fn applyFog(c: vec3f, depth: f32) -> vec3f { return mix(c, F.fogColor.rgb, fogAmount(depth)); }
// a face's normal from how its position changes across the screen, turned to face the eye
// a flat surface's normal, facing the camera, from e: the point less the camera's position. The world point itself
// won't do: a thousand tiles out, a float's rounding is a sizeable share of the step between pixels, and the
// normal comes out speckled
fn flatNormal(e: vec3f) -> vec3f {
  var n = normalize(cross(dpdx(e), dpdy(e)));
  let toward = select(-e, -F.camDir.xyz, F.camPos.w > 0.5);
  if (dot(n, toward) < 0.0) { n = -n; }
  return n;
}
// how much of the sun's light the clouds let through at a point on the ground
// lit haze over colour c at mosaic pixel px: what gets through of c, plus the light the haze in front scatters back
fn hazeApply(c: vec3f, px: vec2f) -> vec3f {
  if (F.hazeA.x < 0.5) { return c; }
  let h = textureLoad(hazeTex, clamp(vec2i(px), vec2i(0), vec2i(F.hazeB.xy) - 1), 0);
  // (clear, hazeA.y: 1 the haze dims what's behind it as it should; less, the scene keeps more of its own contrast
  // under the haze's light: the glow added as before, the dimming eased off)
  return c * mix(1.0, h.a, F.hazeA.y) + h.rgb;
}
// the eye's exposure on a colour about to be shown
// the glow bloom spills over a mosaic pixel (px: its whole coordinates), to add after postExpose
fn bloomAt(px: vec2f) -> vec3f {
  if (F.bloom.x <= 0.0) { return vec3f(0.0); }
  return textureSampleLevel(bloomTex, linSamp, (px + 0.5) * F.bloom.zw, 0.0).rgb * F.bloom.x;
}
fn postExpose(c: vec3f) -> vec3f { return select(c, c * eyeState[0], F.post.x > 0.5); }
// a colour as the screen takes it: without HDR clipped at white (as the canvas would); with it, what's over a
// little under white eases off toward the peak (its brightness × white's, put back into the sRGB curve the colours
// are in), so the sun, lava and lit haze glow brighter than white without hard edges
fn postOutput(c: vec3f) -> vec3f {
  if (F.post.y < 1.0) { return clamp(c, vec3f(0.0), vec3f(1.0)); }
  let knee = 0.85; let top = pow(F.post.y, 1.0 / 2.2) - knee;
  let over = max(c - knee, vec3f(0.0));
  return select(max(c, vec3f(0.0)), knee + top * (1.0 - exp(-over / top)), c > vec3f(knee));
}
fn cloudShade(xz: vec2f) -> f32 {
  let n = textureSampleLevel(cloudTex, linSamp, (xz + F.cloud.xy) / F.cloud.z, 0.0).r;
  return 1.0 - F.cloud.w * smoothstep(1.0 - F.cloud2.x - F.cloud2.y, 1.0 - F.cloud2.x + F.cloud2.y, n);
}
var<private> PCF: array<vec2f, 17> = array<vec2f, 17>(
  vec2f(-1.0, -1.0), vec2f(0.0, -1.0), vec2f(1.0, -1.0),
  vec2f(-0.5, -0.5), vec2f(0.0, -0.5), vec2f(0.5, -0.5),
  vec2f(-1.0, 0.0), vec2f(-0.5, 0.0), vec2f(0.0, 0.0), vec2f(0.5, 0.0), vec2f(1.0, 0.0),
  vec2f(-0.5, 0.5), vec2f(0.0, 0.5), vec2f(0.5, 0.5),
  vec2f(-1.0, 1.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0));
// the sun's shadow map at a point: 1 lit, 0 in shadow (and lit past the edge of the map)
fn sunShadow(w: vec3f, n: vec3f) -> f32 {
  if (F.sunColor.w < 0.5) { return 1.0; }
  let sc = F.shadowMat * vec4f(w + n * F.shadow.y, 1.0);
  let s = sc.xyz / sc.w;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) { return 1.0; }
  let z = s.z + F.shadow.x; let r = F.shadow.z * F.shadow.w;
  // (v581) the taps by how far they spread (F.shadow.z, in texels of the map): each is already a 2 x 2 filtered
  // comparison, so within about a texel 17 of them come out nearly the same as 4, and under a third of one, as 1
  if (F.shadow.z < 0.35) { return textureSampleCompareLevel(shadowMap, shadowSamp, s.xy, z); }
  if (F.shadow.z <= 1.0) {
    var s4 = 0.0;
    for (var i = 0; i < 4; i++) { s4 += textureSampleCompareLevel(shadowMap, shadowSamp, s.xy + vec2f(f32(i & 1) - 0.5, f32(i >> 1) - 0.5) * r, z); }
    return s4 * 0.25;
  }
  var sum = 0.0;
  for (var i = 0; i < 17; i++) { sum += textureSampleCompareLevel(shadowMap, shadowSamp, s.xy + PCF[i] * r, z); }
  return sum / 17.0;
}
fn ggx(f0: vec3f, rough: f32, N: vec3f, V: vec3f, L: vec3f) -> vec3f {
  let Hv = normalize(L + V);
  let nl = sat(dot(N, L)); let nv = sat(dot(N, V)); let nh = sat(dot(N, Hv)); let lh = sat(dot(L, Hv));
  let a = rough * rough; let a2 = a * a;
  let fr = exp2((-5.55473 * lh - 6.98316) * lh);
  let Fs = (1.0 - f0) * fr + f0;
  let gv = nl * sqrt(a2 + (1.0 - a2) * nv * nv); let gl = nv * sqrt(a2 + (1.0 - a2) * nl * nl);
  let G = 0.5 / max(gv + gl, 1e-6);
  let d = nh * nh * (a2 - 1.0) + 1.0;
  return Fs * (G * a2 / (PI * d * d));
}
// (v534) the inside fill: a light of its own on everything within the building you're in (its tiles, between two
// heights), whatever the hour, so a house's inside isn't left dark by its roof's shadow and the probes' gloom
// (v535: hemispherical, bright above and dimmer below, with a soft key light from above toward the camera, so it
// models shapes instead of flattening them)
fn insideFill(w: vec3f, N: vec3f) -> vec3f {
  if (F.insideA.w <= 0.0) { return vec3f(0.0); }
  let t = vec2i(floor(w.xz - F.insideB.xy));
  // (2026-11-03, Jordan: a stair tread speckled while you were upstairs: its top sat exactly on the bottom height, so
  // pixel by pixel it fell either side; the bottom now fades in over 0.3 m instead of cutting off)
  if (t.x < 0 || t.y < 0 || t.x > 31 || t.y > 31 || w.y < F.insideB.z - 0.15 || w.y > F.insideB.w) { return vec3f(0.0); }
  let n = u32(t.y * 32 + t.x);
  let word = F.insideBits[n >> 7u][(n >> 5u) & 3u];
  if (((word >> (n & 31u)) & 1u) == 0u) { return vec3f(0.0); }
  let hemi = mix(F.insideC.w, 1.0, 0.5 + 0.5 * N.y);
  let key = 1.6 * max(dot(N, F.insideC.xyz), 0.0);
  return F.insideA.rgb * mix(hemi, key, F.insideD.x) * smoothstep(F.insideB.z - 0.15, F.insideB.z + 0.15, w.y);
}
// the lit colour of a surface at world point w with normal N
fn shadeLit(albedo: vec3f, emissive: vec3f, metal: f32, rough0: f32, w: vec3f, N: vec3f, receive: bool) -> vec3f {
  return shadeLitN(albedo, emissive, metal, rough0, w, N, N, receive);
}
// (Ng: the surface's own normal, for the shadow and GI lookups; N, the one it's lit by, may be bent by a normal map.
// Looked up along a bent normal, the shadow map's bias wanders pixel to pixel and the surface speckles)
fn shadeLitN(albedo: vec3f, emissive: vec3f, metal: f32, rough0: f32, w: vec3f, N: vec3f, Ng: vec3f, receive: bool) -> vec3f {
  let V = toEye(w);
  let diff = albedo * (1.0 - metal);
  let f0 = mix(vec3f(0.04), albedo, metal);
  let rough = clamp(max(rough0, 0.0525), 0.0, 1.0);
  var col = emissive;
  var ambSeen = vec3f(0.0);
  if (F.hemiSky.w > 0.5) {
    var amb = mix(F.hemiGround.rgb, F.hemiSky.rgb, 0.5 * N.y + 0.5);
    if (F.giA.x > 0.5) {
      let g = giGather(w + Ng * F.giA.w, N, F.giA.x > 1.5);
      if (g.w > 1e-6) {
        // sky visibility: the sky's share by what of it the probes see that way, the ground's by how open they are
        var lit = g.light;
        if (F.giA.x < 1.5) {
          lit = F.hemiSky.rgb * sat(g.vis.x + 2.0 * dot(g.vis.yzw, N)) + F.hemiGround.rgb * (0.5 - 0.5 * N.y) * sat(2.0 * g.vis.x);
        }
        amb = max(mix(amb, lit, F.giA.y), amb * F.giA.z);
      }
    }
    col += amb * diff;
    ambSeen = amb;
  }
  // (v535, Jordan: upper floors came out brighter: they already had more light) evened out: only what the fill adds
  // over the light already there, by insideD.y
  let fi = insideFill(w, N);
  col += mix(fi, max(fi - ambSeen, vec3f(0.0)), F.insideD.y) * diff;
  if (F.sunDir.w > 0.5) {
    let L = F.sunDir.xyz;
    var lc = F.sunColor.rgb * cloudShade(w.xz);
    // (v581: not looked up at all once shadows have faded out, cloud2.z 0)
    if (receive && F.cloud2.z > 0.001) { lc *= mix(1.0, sunShadow(w, Ng), F.cloud2.z); }
    let irr = sat(dot(N, L)) * lc;
    col += irr * diff + irr * PI * ggx(f0, rough, N, V, L);
  }
  let np = i32(F.cloud2.w);
  for (var i = 0; i < 16; i++) {
    if (i >= np) { break; }
    let p = F.points[i];
    let d = p.pos.xyz - w; let dist = length(d);
    var att = 1.0;
    if (p.pos.w > 0.0 && p.color.w > 0.0) { att = pow(sat(1.0 - dist / p.pos.w), p.color.w); }
    let L = d / max(dist, 1e-5);
    let irr = sat(dot(N, L)) * p.color.rgb * att;
    col += irr * diff + irr * PI * ggx(f0, rough, N, V, L);
  }
  return col;
}
struct U_ {
  @align(16) now: vec4f,
  @align(16) look: vec4f,
  @align(16) puff: vec4f,
  @align(16) ramps: array<vec4f, 512>,
  @align(16) refr: f32,
  @align(16) base: vec2f,
}
@group(2) @binding(0) var<uniform> U: U_;
@group(2) @binding(1) var tRefrD: texture_depth_2d;
@group(2) @binding(2) var<storage, read> parts: array<FxP>;
struct VIn {
  @location(0) position: vec3f,
}

struct FxP {
  a: vec4f,   // where it is (world), when it's born (the fx clock; it waits till then)
  b: vec4f,   // its velocity, how long it lives (s)
  c: vec4f,   // its anchor (what it's pulled toward and swirls round; a beam's far end), its floor's height
  d: vec4f,   // its size at birth, at death; gravity (× g), drag (1/s)
  e: vec4f,   // pull toward the anchor (1/s²), swirl round it (rad/s), turbulence, bounce (0-1)
  f: vec4f,   // its ramp, where on it at birth and at death (0 dark, 1 bright), opacity
  g: vec4f,   // style (FX), seed (0-1), glow (its own light, × colour), a flame's smoke ramp (any other: 1 = it rides the waves)
  h: vec4f,   // turn (rad), spin (rad/s), stretch (sparks, drops: × speed; rings: thickness), cover (or a flame's morph)
}
fn fxRamp(id: f32, t: f32) -> vec3f {
  let base = i32(id + 0.5) * 8;
  let x = sat(t) * 7.0;
  if (U.look.x > 0.5) { return U.ramps[base + i32(floor(x + 0.5))].rgb; }
  let i = i32(floor(x)); let j = min(i + 1, 7);
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

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f,
  @location(1) col: vec3f,
  @location(2) glow: f32,
  @location(3) fade: f32,
  @location(4) rough: f32,
}
// turn v by angle a about the unit axis n
fn fxTurn(v: vec3f, n: vec3f, a: f32) -> vec3f { return v * cos(a) + cross(n, v) * sin(a) + n * dot(n, v) * (1.0 - cos(a)); }
@vertex fn vs(v: VIn, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  // (the dome mesh draws only domes, from its own slots on: U.base; the gem mesh everything else solid)
  let q = parts[ii + u32(U.base.x)];
  let st = i32(q.g.x + 0.5);
  let k = fxLife(q);
  if (k < 0.0 || st < 8 || st >= 13 || (st == 12) != (U.base.y > 0.5)) { return o; }
  let s = fxSize(q, k);
  var tone = mix(q.f.y, q.f.z, k);
  var glowK = 1.0; var rough = 0.45;
  let sd = q.g.y;
  let axis = normalize(vec3f(fxHash(sd * 13.0) - 0.5, fxHash(sd * 29.0) - 0.5 + 0.01, fxHash(sd * 41.0) - 0.5));
  var p = v.position;
  var fade = 1.0 - smoothstep(0.75, 1.0, k);
  if (st == 8) {
    p = fxTurn(p * vec3f(0.45, 1.4, 0.3) * s, axis, q.h.x);
  } else if (st == 11) {
    p = fxTurn(p * vec3f(1.0, 0.75, 0.9) * s, axis, q.h.x);
  } else if (st == 10) {
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
  } else if (st == 12) {
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
  o.glow = q.g.z * U.look.y * glowK; o.fade = fade * q.f.w; o.rough = rough;
  return o;
}
var<private> BAYER: array<f32, 16> = array<f32, 16>(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  // (it dithers away at the end of its life)
  let c = vec2u(i.pos.xy) % vec2u(4u);
  if (i.fade < (BAYER[c.y * 4u + c.x] + 0.5) / 16.0) { discard; }
  let n = flatNormal(i.w - F.camPos.xyz);
  let col = shadeLit(i.col, i.col * i.glow, 0.0, i.rough, i.w, n, true);
  return vec4f(applyFog(col, viewDepth(i.w)), 1.0);
}