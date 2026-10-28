// The WGSL every pipeline shares, and the built-in materials' shaders.
//
// Lit surfaces are shaded as the game's first renderer shaded them, with no colour management (colours go
// in and come out as given): the sky's light (a hemisphere, ground colour below to sky colour above) on the
// diffuse colour; the sun's (or moon's) light, dimmed by cloud shadow and by its own shadow map (17 taps of
// percentage-closer filtering, spread by the shadow's radius, taking away `shadowAmt` of the light), as
// Lambert diffuse plus a GGX specular lobe; point lights the same way, falling to nothing at their distance;
// emissive on top; then linear distance haze, eased (smoothstep) between its near and far. Faces are shaded
// flat, their normal worked out from the screen-space change in position, always facing the camera.

export const MAX_POINTS = 8;
export const FRAME_BYTES = 768;   // the Frame struct (704 bytes), padded to the uniform offset alignment
export const OBJ_BYTES = 256;     // the Obj struct (112 bytes), likewise

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
}
struct Obj {
  model: mat4x4f,
  color: vec4f,       // a: opacity
  emissive: vec4f,    // w: 1 when it takes shadows
  pbr: vec4f,         // metalness, roughness
}
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSamp: sampler_comparison;
@group(0) @binding(3) var cloudTex: texture_2d<f32>;
@group(0) @binding(4) var linSamp: sampler;
@group(1) @binding(0) var<uniform> O: Obj;

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
fn flatNormal(w: vec3f) -> vec3f {
  var n = normalize(cross(dpdx(w), dpdy(w)));
  if (dot(n, toEye(w)) < 0.0) { n = -n; }
  return n;
}
// how much of the sun's light the clouds let through at a point on the ground
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
// the lit colour of a surface at world point w with normal N
fn shadeLit(albedo: vec3f, emissive: vec3f, metal: f32, rough0: f32, w: vec3f, N: vec3f, receive: bool) -> vec3f {
  let V = toEye(w);
  let diff = albedo * (1.0 - metal);
  let f0 = mix(vec3f(0.04), albedo, metal);
  let rough = clamp(max(rough0, 0.0525), 0.0, 1.0);
  var col = emissive;
  if (F.hemiSky.w > 0.5) { col += mix(F.hemiGround.rgb, F.hemiSky.rgb, 0.5 * N.y + 0.5) * diff; }
  if (F.sunDir.w > 0.5) {
    let L = F.sunDir.xyz;
    var lc = F.sunColor.rgb * cloudShade(w.xz);
    if (receive) { lc *= mix(1.0, sunShadow(w, N), F.cloud2.z); }
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

// the built-in materials, with or without a colour per vertex
export function builtinCode(kind, hasColor) {
  const vin = `struct VIn { @location(0) position: vec3f, ${hasColor ? '@location(1) color: vec3f,' : ''} }`;
  const col = hasColor ? 'v.color' : 'vec3f(1.0)';
  if (kind === 'shadow') return PRELUDE_SHADOW + `
struct VIn { @location(0) position: vec3f }
@vertex fn vs(v: VIn) -> @builtin(position) vec4f { return F.viewProj * (O.model * vec4f(v.position, 1.0)); }`;
  if (kind === 'normal') return PRELUDE + `
${vin}
struct VOut { @builtin(position) pos: vec4f, @location(0) vp: vec3f }
@vertex fn vs(v: VIn) -> VOut {
  let mv = F.view * (O.model * vec4f(v.position, 1.0));
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
struct VOut { @builtin(position) pos: vec4f, @location(0) world: vec3f, @location(1) color: vec3f }
@vertex fn vs(v: VIn) -> VOut {
  let w = O.model * vec4f(v.position, 1.0);
  return VOut(F.viewProj * w, w.xyz, ${col});
}`;
  if (kind === 'basic') return head + `
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  return vec4f(applyFog(O.color.rgb * i.color, viewDepth(i.world)), O.color.a);
}`;
  return head + `
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let N = flatNormal(i.world);
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
