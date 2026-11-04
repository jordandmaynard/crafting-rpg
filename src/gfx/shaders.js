// The WGSL every pipeline shares, and the built-in materials' shaders.
//
// Lit surfaces are shaded as the game's first renderer shaded them, with no colour management (colours go
// in and come out as given): the sky's light (a hemisphere, ground colour below to sky colour above) on the
// diffuse colour; the sun's (or moon's) light, dimmed by cloud shadow and by its own shadow map (17 taps of
// percentage-closer filtering, spread by the shadow's radius, taking away `shadowAmt` of the light), as
// Lambert diffuse plus a GGX specular lobe; point lights the same way, falling to nothing at their distance;
// emissive on top; then linear distance haze, eased (smoothstep) between its near and far. Faces are shaded
// flat, their normal worked out from the screen-space change in position, always facing the camera.
// With probe lighting on (probes.js), the sky's light comes from the probes round the point instead: how much of
// the sky they see, or (bounce light) all the light arriving there, the sky's and what the ground and things
// round about give back.

export const MAX_POINTS = 16;
export const FRAME_BYTES = 1280;  // the Frame struct (1264 bytes: 16 point lights since v411, the inside fill since v534), padded to the uniform offset alignment
export const OBJ_BYTES = 256;     // the Obj struct (112 bytes), likewise

// Probe lighting's shared WGSL, for the shaders that draw and the compute pass that lights the probes (each
// gives the accessors giHfRaw, giHfOrigin, giHfSize, giGrid, giVisAt, giLightAt and giStandInLight). The height
// field holds, a texel every half tile: the ground with whatever stands on it, the bottom and top of one floating
// layer over it (tree crowns, roofs; bottom > top when there's none) and how much light that lets through (0
// none: roofs). Probes stand in columns, one a tile, at GI_LAYERS heights over the highest ground under their
// tile, kept in a grid round the camera that wraps (a column's slot is its x, z modulo the grid). A probe's sky
// visibility is order-1 spherical harmonics (a, b: the sky seen that way, facing n, is about a + 2 b·n), its light
// the same in each colour, three texels across. A probe that's unusable (in the floating layer, or not lit yet)
// has a < 0, and is read as a shaded stand-in (GI_STAND_IN of the sky; giStandInLight).
export const GI_TPT = 2;                       // height field texels a tile
export const GI_LAYERS = [0.4, 1.4, 3.2, 7];   // probe heights over the ground
export const GI_WGSL = /* wgsl */ `
const GI_TPT = ${GI_TPT};
const GI_STAND_IN = 0.15;   // the sky an unusable probe is taken to see
fn giLayerH(l: i32) -> f32 { return select(select(select(${GI_LAYERS[3].toFixed(2)}, ${GI_LAYERS[2].toFixed(2)}, l == 2), ${GI_LAYERS[1].toFixed(2)}, l == 1), ${GI_LAYERS[0].toFixed(2)}, l == 0); }
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
    let floorY = giFloor(c);
    if (floorY < -1000.0) { continue; }
    let h = q.y - floorY;
    var wc = select(1.0 - f.x, f.x, o.x == 1) * select(1.0 - f.y, f.y, o.y == 1);
    let hl = clamp(h, giLayerH(0), giLayerH(g.w - 1));
    let pp = vec3f(f32(c.x) + 0.5, floorY + hl, f32(c.y) + 0.5);
    // (v773, Jordan's pick: one look halfway along, was two at a third and two thirds: 16 reads a pixel fewer; the
    // light at a wall's or cliff's foot may sit a little differently)
    let m = mix(q, pp, 0.5);
    let occ = smoothstep(0.0, 0.4, giGround(m.xz) - m.y);
    wc *= mix(1.0, 0.005, occ);
    let to = pp - q;
    let wrap = (dot(normalize(to + vec3f(1e-4)), n) + 1.0) * 0.5;
    wc *= wrap * wrap + 0.2;
    var l = 0;
    for (var k = 1; k < g.w - 1; k++) { if (hl >= giLayerH(k)) { l = k; } }
    let t = clamp((hl - giLayerH(l)) / (giLayerH(l + 1) - giLayerH(l)), 0.0, 1.0);
    let s = giSlot(c, g.z);   // (the probe column's slot; giFloor finds the same one)
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
`;

export const PRELUDE = /* wgsl */ `
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
  points: array<PointL, ${MAX_POINTS}>,
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
// (v772) a probe column's floor, as giColumnBase finds it: stored by the probes' pass in the layer past the last
// (high and low halves, so it's as exact as the height field), one read in place of four; a column outside the grid
// has no slot of its own and is worked out as before
fn giFloor(c: vec2i) -> f32 {
  let g = giGrid(); let rel = c - g.xy;
  if (any(rel < vec2i(0)) || any(rel >= vec2i(g.z))) { return giColumnBase(c); }
  let s = giSlot(c, g.z);
  let f = textureLoad(giVisTex, vec3i(s.x, g.w, s.y), 0);
  return f.x + f.y;
}
${GI_WGSL}

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
  for (var i = 0; i < ${MAX_POINTS}; i++) {
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
`;

// the built-in materials, with or without a colour per vertex, and drawn once or as copies (inst: each copy placed
// by its own matrix, after the object's)
const INST_IN = '@location(8) i0: vec4f, @location(9) i1: vec4f, @location(10) i2: vec4f, @location(11) i3: vec4f,';
// clip: drop whatever lies below the frame's post.z in the world (renderer.clipBelow: the game's water mirror)
export function builtinCode(kind, hasColor, inst = false, clip = false) {
  const cut = clip ? 'if (i.world.y < F.post.z) { discard; }' : '';
  const vin = `struct VIn { @location(0) position: vec3f, ${hasColor ? '@location(1) color: vec3f,' : ''} ${inst ? INST_IN : ''} }`;
  const col = hasColor ? 'v.color' : 'vec3f(1.0)';
  const model = inst ? '(O.model * mat4x4f(v.i0, v.i1, v.i2, v.i3))' : 'O.model';
  if (kind === 'shadow') return PRELUDE_SHADOW + `
struct VIn { @location(0) position: vec3f, ${inst ? INST_IN : ''} }
@vertex fn vs(v: VIn) -> @builtin(position) vec4f { return F.viewProj * (${model} * vec4f(v.position, 1.0)); }`;
  if (kind === 'normal') return PRELUDE + `
${vin}
struct VOut { @builtin(position) pos: vec4f, @location(0) vp: vec3f }
@vertex fn vs(v: VIn) -> VOut {
  let mv = F.view * (${model} * vec4f(v.position, 1.0));
  return VOut(F.proj * mv, mv.xyz);
}
// the surface's normal in view space, as a colour
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  var n = normalize(cross(dpdx(i.vp), dpdy(i.vp)));
  let toward = select(-i.vp, vec3f(0.0, 0.0, 1.0), F.camPos.w > 0.5);
  if (dot(n, toward) < 0.0) { n = -n; }
  return vec4f(n * 0.5 + 0.5, 1.0);
}`;
  const head = PRELUDE + `
${vin}
// (v777: @invariant, so a depth pre-pass of these and their own draw land on the same depth to the bit)
struct VOut { @builtin(position) @invariant pos: vec4f, @location(0) world: vec3f, @location(1) color: vec3f, @location(2) eye: vec3f }
@vertex fn vs(v: VIn) -> VOut {
  let w = ${model} * vec4f(v.position, 1.0);
  return VOut(F.viewProj * w, w.xyz, ${col}, w.xyz - F.camPos.xyz);
}`;
  if (kind === 'basic') return head + `
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  ${cut}
  return vec4f(applyFog(O.color.rgb * i.color, viewDepth(i.world)), O.color.a);
}`;
  return head + `
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  ${cut}
  let N = flatNormal(i.eye);
  let c = shadeLit(O.color.rgb * i.color, O.emissive.rgb, O.pbr.x, O.pbr.y, i.world, N, O.emissive.w > 0.5);
  return vec4f(applyFog(c, viewDepth(i.world)), O.color.a);
}`;
}
// the shadow pass binds only the frame (its view is the light's), so the shadow map it draws into isn't bound
const PRELUDE_SHADOW = /* wgsl */ `
struct Frame { view: mat4x4f, proj: mat4x4f, viewProj: mat4x4f }
struct Obj { model: mat4x4f }
@group(0) @binding(0) var<uniform> F: Frame;
@group(1) @binding(0) var<uniform> O: Obj;
`;
