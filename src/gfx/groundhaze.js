// Ground haze: a thin, liquid haze lying on the ground, that flows round trees and rocks, swirls, and parts
// round the hero as they walk through it. Neon Haze's ground haze (after Strata Digger's), on uneven ground.
//
// A 2D fluid sim (compute) on a grid of CPT cells a tile that follows the camera's target holds the air's velocity
// and the haze. Each frame it advects (semi-Lagrangian, reading last frame's grid at its old place so the grid
// can scroll), eases the air back to the wind and the haze back to a patchy resting field that drifts with it, adds
// the hero's wake, puts back the swirls the grid smears away (vorticity confinement), and makes the flow
// incompressible (Jacobi pressure solve, then projection). Air coming in at the grid's edge is resting air.
//
// Where it lies comes from a site map the game fills round the camera (site(): a texel every half tile): the
// ground's height (water and lava surfaces included), what's solid (the haze flows round it), how much haze rests
// there (0 where there's none: the game sets it by biome) and its colour. The grid's cells read it.
//
// It's drawn by `mesh`, stacked slices that follow the ground, `height` thick, lit as the scene is (sky and GI
// probes, the sun or moon through its shadow, the lamps and the torch) and fogged. Beyond the grid the slices draw
// the resting field. Put the mesh where it's drawn after the hero (so the haze swirls round their feet).

import { Mesh } from './scene.js';
import { BufferGeometry, Float32BufferAttribute } from './geometry.js';
import { ShaderMaterial, Texture, NormalBlending, DoubleSide } from './materials.js';

const CPT = 4;            // sim cells a tile
const GRID = 192;         // sim cells across (48 tiles), round the camera's target
const JACOBI = 20;        // pressure solver iterations (pairs of passes)
const MAX_DT = 1 / 30;    // the sim never steps further than this in one frame
const CELL_BYTES = 32;    // two vec4f
export const GROUND_HAZE_SITE = 128;   // site map texels across (64 tiles)
export const GROUND_HAZE_SITE_TPT = 2; // site map texels a tile
const DRAW_TILES = 56;    // tiles across the drawn slices
const DRAW_VPT = 4;       // their vertices a tile (fine enough to follow the site map's bends closely)

const NOISE = /* wgsl */ `
fn ghPcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn ghHash(i: vec2f) -> f32 {
  let u = bitcast<vec2u>(vec2i(i));
  return f32(ghPcg(u.x ^ ghPcg(u.y + 0x9e3779b9u))) / 4294967295.0;
}
fn ghNoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ghHash(i), ghHash(i + vec2f(1.0, 0.0)), u.x), mix(ghHash(i + vec2f(0.0, 1.0)), ghHash(i + vec2f(1.0, 1.0)), u.x), u.y);
}
// the resting haze's patches: amount × (1 ± patchiness), drifting with the wind
fn ghPatches(wp: vec2f, wind: vec2f, t: f32, amount: f32, patchy: f32, freq: f32) -> f32 {
  let q = (wp - wind * t) * freq;
  let n = ghNoise(q) * 0.65 + ghNoise(q * 2.3 + vec2f(7.1, 3.7)) * 0.35;
  return amount * max(0.0, 1.0 + patchy * (n * 2.0 - 1.0));
}
`;

const SIM_WGSL = /* wgsl */ `
struct GH {
  g0: vec4f,   // grid origin (cells), width, height (cells)
  g1: vec4f,   // origin shift since last frame (cells), dt, time
  p0: vec4f,   // resting haze amount, patchiness, patch frequency (a tile), relax rate (a second)
  p1: vec4f,   // wind (tiles a second, x z), air settling rate (a second), swirl
  p2: vec4f,   // haze swept aside round the hero a second (whirling), flags (4: fill with resting haze), _, _
  pl0: vec4f,  // hero position xz, velocity xz
  pl1: vec4f,  // wake radius (tiles), drag, haze cleared a tile walked, the air spun round the hero (tiles a second)
  s0: vec4f,   // site map: first texel x, z, texels across, texels a tile
}
struct Cell {
  a: vec4f,    // velocity xz (tiles a second), haze, _
  b: vec4f,    // x: pressure (kept as the next solve's first guess)
}
@group(0) @binding(0) var<uniform> hu: GH;
@group(0) @binding(1) var<storage, read_write> simA: array<Cell>;   // the state
@group(0) @binding(2) var<storage, read_write> simB: array<Cell>;   // advection target
@group(0) @binding(3) var<storage, read_write> aux: array<vec4f>;   // divergence, curl, pressure (odd Jacobi steps)
@group(0) @binding(4) var outState: texture_storage_2d<rgba16float, write>;   // haze, _, velocity xz
@group(0) @binding(5) var siteTex: texture_2d<f32>;                           // ground, solid, resting share, _
const CPM = ${CPT}.0;
${NOISE}

fn siteTexel(t: vec2i) -> vec4f {
  let r = t - vec2i(hu.s0.xy);
  if (any(r < vec2i(0)) || any(r >= vec2i(i32(hu.s0.z)))) { return vec4f(0.0); }
  return textureLoad(siteTex, r, 0);
}
// how much haze rests at wp (bilinear over the site map), with its drifting patches
fn hazeRest(wp: vec2f) -> f32 {
  let p = wp * hu.s0.w - 0.5;
  let i = vec2i(floor(p)); let f = p - floor(p);
  let m = mix(mix(siteTexel(i).z, siteTexel(i + vec2i(1, 0)).z, f.x), mix(siteTexel(i + vec2i(0, 1)).z, siteTexel(i + vec2i(1, 1)).z, f.x), f.y);
  if (m <= 0.0) { return 0.0; }
  return ghPatches(wp, hu.p1.xy, hu.g1.w, hu.p0.x * m, hu.p0.y, hu.p0.z);
}

fn dims() -> vec2i { return vec2i(i32(hu.g0.z), i32(hu.g0.w)); }
fn idx(c: vec2i) -> u32 { return u32(c.y * i32(hu.g0.z) + c.x); }
fn cellWorld(c: vec2f, origin: vec2f) -> vec2f { return (origin + c + 0.5) / CPM; }
fn outside(c: vec2i) -> bool { let d = dims(); return c.x < 0 || c.y < 0 || c.x >= d.x || c.y >= d.y; }
fn solid(c: vec2i) -> bool { return siteTexel(vec2i(floor(cellWorld(vec2f(c), hu.g0.xy) * hu.s0.w))).y > 0.5; }

// bilinear sample of last frame's state at cell coordinates of the old grid; outside it, resting air
fn oldCell(cf: vec2f) -> Cell {
  let oldOrigin = hu.g0.xy - hu.g1.xy;
  let i0 = vec2i(floor(cf));
  let f = cf - floor(cf);
  var r: Cell;
  r.a = vec4f(0.0); r.b = vec4f(0.0);
  for (var k = 0; k < 4; k++) {
    let c = i0 + vec2i(k % 2, k / 2);
    let w = select(1.0 - f.x, f.x, k % 2 == 1) * select(1.0 - f.y, f.y, k / 2 == 1);
    var t: Cell;
    if (outside(c)) {
      let wo = cellWorld(vec2f(c), oldOrigin);
      t.a = vec4f(hu.p1.xy, hazeRest(wo), 0.0); t.b = vec4f(0.0);
    } else {
      t = simA[idx(c)];
    }
    r.a += t.a * w; r.b += t.b * w;
  }
  return r;
}

@compute @workgroup_size(8, 8) fn advect(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  if (outside(c)) { return; }
  let wp = cellWorld(vec2f(c), hu.g0.xy);
  let rest = hazeRest(wp);
  let flags = u32(hu.p2.y);
  var o: Cell;
  let wall = solid(c);
  if (wall || (flags & 4u) != 0u) {
    // inside something solid the air is still, at the resting haze
    o.a = vec4f(select(hu.p1.xy, vec2f(0.0), wall), rest, 0.0); o.b = vec4f(0.0);
    simB[idx(c)] = o;
    return;
  }
  let dt = hu.g1.z;
  let oc = vec2f(c) + hu.g1.xy;                       // this cell in last frame's grid
  let src = oc - oldCell(oc).a.xy * dt * CPM;
  let s = oldCell(src);
  var vel = s.a.xy;
  let haze = s.a.z + (rest - s.a.z) * (1.0 - exp(-hu.p0.w * dt));   // drifts back to the resting haze
  vel = mix(vel, hu.p1.xy, 1.0 - exp(-hu.p1.z * dt));               // the air settles back to the wind
  // the hero's wake: they drag the air along and sweep the haze aside
  let rel = wp - hu.pl0.xy;
  let w = exp(-dot(rel, rel) / max(hu.pl1.x * hu.pl1.x, 1e-4));
  var h = haze;
  if (w > 0.01) {
    let walked = length(hu.pl0.zw) * dt;
    vel = mix(vel, hu.pl0.zw, clamp(w * hu.pl1.y, 0.0, 1.0));
    h *= exp(-hu.pl1.z * walked * w);
    // whirling: the air spun round them and the haze swept out, standing still or not
    if (hu.pl1.w > 0.0) {
      let r = length(rel);
      vel = mix(vel, vec2f(-rel.y, rel.x) / max(r, 1e-3) * hu.pl1.w * min(r / max(hu.pl1.x * 0.5, 1e-3), 1.0), clamp(w, 0.0, 1.0));
      h *= exp(-hu.p2.x * dt * w);
    }
  }
  let vm = length(vel);
  if (vm > 12.0) { vel *= 12.0 / vm; }
  o.a = vec4f(vel, max(h, 0.0), 0.0);
  o.b = vec4f(s.b.x, 0.0, 0.0, 0.0);
  simB[idx(c)] = o;
}

fn velB(c: vec2i) -> vec2f {
  let q = clamp(c, vec2i(0), dims() - 1);
  if (solid(q)) { return vec2f(0.0); }
  return simB[idx(q)].a.xy;
}
fn velA(c: vec2i) -> vec2f {
  let q = clamp(c, vec2i(0), dims() - 1);
  if (solid(q)) { return vec2f(0.0); }
  return simA[idx(q)].a.xy;
}

@compute @workgroup_size(8, 8) fn curl(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  if (outside(c)) { return; }
  aux[idx(c)].y = 0.5 * ((velB(c + vec2i(1, 0)).y - velB(c - vec2i(1, 0)).y) - (velB(c + vec2i(0, 1)).x - velB(c - vec2i(0, 1)).x));
}
fn curlAt(c: vec2i) -> f32 { return abs(aux[idx(clamp(c, vec2i(0), dims() - 1))].y); }

// vorticity confinement: puts back the curls the grid smears away; writes the result back to simA
@compute @workgroup_size(8, 8) fn vorticity(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  if (outside(c)) { return; }
  var o = simB[idx(c)];
  if (!solid(c)) {
    let g = vec2f(curlAt(c + vec2i(1, 0)) - curlAt(c - vec2i(1, 0)), curlAt(c + vec2i(0, 1)) - curlAt(c - vec2i(0, 1))) * 0.5;
    let gl = length(g);
    if (gl > 1e-5) {
      let n = g / gl;
      let w = aux[idx(c)].y;
      o.a = vec4f(o.a.xy + vec2f(n.y * w, -n.x * w) * hu.p1.w * (4.0 / CPM) * hu.g1.z, o.a.zw);
    }
  }
  simA[idx(c)] = o;
}

@compute @workgroup_size(8, 8) fn divergence(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  if (outside(c)) { return; }
  aux[idx(c)].x = 0.5 * (velA(c + vec2i(1, 0)).x - velA(c - vec2i(1, 0)).x + velA(c + vec2i(0, 1)).y - velA(c - vec2i(0, 1)).y);
}

// a neighbour's pressure; solid cells and the grid's edge mirror this cell's
fn pressureA(c: vec2i, own: f32) -> f32 {
  if (outside(c) || solid(c)) { return own; }
  return simA[idx(c)].b.x;
}
fn pressureX(c: vec2i, own: f32) -> f32 {
  if (outside(c) || solid(c)) { return own; }
  return aux[idx(c)].z;
}
@compute @workgroup_size(8, 8) fn jacobiAX(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  if (outside(c)) { return; }
  let own = simA[idx(c)].b.x;
  let sum = pressureA(c + vec2i(1, 0), own) + pressureA(c - vec2i(1, 0), own) + pressureA(c + vec2i(0, 1), own) + pressureA(c - vec2i(0, 1), own);
  aux[idx(c)].z = (sum - aux[idx(c)].x) * 0.25;
}
@compute @workgroup_size(8, 8) fn jacobiXA(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  if (outside(c)) { return; }
  let own = aux[idx(c)].z;
  let sum = pressureX(c + vec2i(1, 0), own) + pressureX(c - vec2i(1, 0), own) + pressureX(c + vec2i(0, 1), own) + pressureX(c - vec2i(0, 1), own);
  simA[idx(c)].b.x = (sum - aux[idx(c)].x) * 0.25;
}

// takes away the pressure gradient, then publishes the haze and the velocity for drawing
@compute @workgroup_size(8, 8) fn project(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  if (outside(c)) { return; }
  let i = idx(c);
  var a = simA[i].a;
  if (solid(c)) {
    a = vec4f(0.0, 0.0, a.zw);
  } else {
    let own = simA[i].b.x;
    a = vec4f(a.xy - 0.5 * vec2f(pressureA(c + vec2i(1, 0), own) - pressureA(c - vec2i(1, 0), own),
                                 pressureA(c + vec2i(0, 1), own) - pressureA(c - vec2i(0, 1), own)), a.zw);
  }
  simA[i].a = a;
  textureStore(outState, c, vec4f(a.z, 0.0, a.x, a.y));
}
`;

// the slices: lit and fogged as the scene is (shaders.js's prelude), drawn with plain alpha blending
const DRAW_WGSL = /* wgsl */ `
const CPM = ${CPT}.0;
${NOISE}
struct VOut { @builtin(position) pos: vec4f, @location(0) world: vec3f, @location(1) slice: f32 }
fn siteAt(xz: vec2f) -> vec4f { return textureSampleLevel(siteTex, siteTexS, (xz * U.site.w - U.site.xy) / U.site.z, 0.0); }
@vertex fn vs(v: VIn) -> VOut {
  let w = (O.model * vec4f(v.position.x, 0.0, v.position.z, 1.0)).xyz;
  let y = siteAt(w.xz).x + U.look.x * 2.0 * (v.slice + 0.5) / U.look.z;
  let p = vec3f(w.x, y, w.z);
  return VOut(F.viewProj * vec4f(p, 1.0), p, v.slice);
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let wp = i.world.xz;
  let site = siteAt(wp);
  if (site.z < 0.003) { discard; }
  // Each slice's shell is a surface the eye's line of sight can cross more than once where it folds (over a crest, down
  // into a canyon). Each crossing into the layer is drawn with only the haze between it and where the line of sight
  // leaves the layer again (or meets the ground), so the haze along a line of sight adds up to what it really goes
  // through: never doubled where the shell folds over, never missing behind a crest it only clips.
  //
  // The tests run from where this pixel's line of sight crosses the slice as laid over the site map, the surface they
  // test against, not from the flat triangle, which strays from it: found from the drawn point by a few steps of
  // Newton's method along the line of sight. (The point straight above or below the drawn one left wedge-shaped holes
  // along cliffs, where the triangles cut a bend's corner.)
  let V = toEye(i.world);
  let hs = U.look.x * 2.0 * (i.slice + 0.5) / U.look.z;
  var s = 0.0;
  for (var k = 0; k < 4; k++) {
    let q = i.world + V * s;
    let f = q.y - siteAt(q.xz).x - hs;
    let q2 = q + V * 0.02;
    let d = (q2.y - siteAt(q2.xz).x - hs - f) / 0.02;
    if (abs(d) < 0.05) { break; }
    s = clamp(s - f / d, -0.6, 0.6);
  }
  let o = i.world + V * s;
  // A line of sight that runs on under the surface toward the eye is leaving the layer here, not entering it: the
  // underside of a fold, drawn by nothing. Faded out over a narrow band rather than cut off: where the shell runs
  // nearly along the line of sight a hard cut flips pixel by pixel, and speckles.
  let o2 = o + V * 0.03;
  let rise = ((o2.y - siteAt(o2.xz).x) - (o.y - siteAt(o.xz).x)) / 0.03;
  let keep = smoothstep(0.0, 0.1, rise);
  if (keep < 0.002) { discard; }
  // How much of the layer the line of sight goes through from here: on, away from the eye, as far as it would go down
  // to the ground under a level layer, or until it leaves the layer. Past a cliff's edge it clips only the layer's
  // corner, and taken as the whole layer that corner showed as a solid lip floating over the edge. (Reaching the
  // ground first, in front of a rise, it's had all the layer there is.)
  var through = 1.0;
  let L = hs / max(V.y, 0.25);
  var was = 0.0;
  for (var k = 1; k <= 16; k++) {
    let p = o - V * (L * f32(k) / 16.0);
    let g = siteAt(p.xz).x;
    if (p.y < g) { break; }
    let d = g + hs - p.y;   // how deep in the layer
    if (d < 0.0) { through = (f32(k - 1) + was / max(was - d, 1e-5)) / 16.0; break; }
    was = d;
  }
  // inside the grid the sim, easing near its edge into the resting haze that lies beyond
  let uv = (wp * CPM - U.grid.xy) / U.grid.zw;
  let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)) * U.grid.z / CPM;
  let inside = smoothstep(0.0, max(U.rest.w, 0.01), edge);
  var haze = 0.0;
  if (inside < 1.0) { haze = ghPatches(wp, U.wind.xy, U.wind.z, U.rest.x * site.z, U.rest.y, U.rest.z); }
  if (inside > 0.0) {
    haze = mix(haze, textureSampleLevel(stateTex, stateTexS, uv, 0.0).x, inside);
  }
  let H = max(U.look.x, 0.02);
  // by the slice's height over the ground (as laid out, not as its flat triangles happen to cross a slope)
  let sigma = haze * exp(-2.0 * (i.slice + 0.5) / U.look.z) * U.look.y;
  // the eye's path through the slice, taken as a level layer over the ground whatever the slice's own tilt: measured
  // across the tilted shell it grows without bound where the shell turns edge-on (rolling over a crest), and its rim
  // shows as a bright line
  let path = (2.0 * H / U.look.z) / max(V.y, 0.25);
  let alpha = (1.0 - exp(-sigma * path * through)) * keep;
  if (alpha < 0.002) { discard; }
  let tint = textureSampleLevel(tintTex, tintTexS, (wp * U.site.w - U.site.xy) / U.site.z, 0.0).rgb;
  let c = shadeLit(tint, vec3f(0.0), 0.0, 1.0, i.world, vec3f(0.0, 1.0, 0.0), true) * U.look.w;
  return vec4f(applyFog(c, viewDepth(i.world)), alpha);
}
`;

// a texture made on the GPU here, for a ShaderMaterial to read (the renderer takes its view as it is)
class ViewTexture extends Texture {
  constructor(view) { super(); this.isViewTexture = true; this.view = view; }
}

export class GroundHaze {
  constructor(renderer) {
    this.renderer = renderer;
    const device = this.device = renderer.device, B = GPUBufferUsage, T = GPUTextureUsage, C = GPUShaderStage.COMPUTE;
    this.params = device.createBuffer({ size: 128, usage: B.UNIFORM | B.COPY_DST });
    const storage = size => device.createBuffer({ size, usage: B.STORAGE });
    this.simA = storage(GRID * GRID * CELL_BYTES); this.simB = storage(GRID * GRID * CELL_BYTES); this.aux = storage(GRID * GRID * 16);
    const tex = (n, format, usage) => device.createTexture({ size: [n, n], format, usage });
    this.stateTex = tex(GRID, 'rgba16float', T.STORAGE_BINDING | T.TEXTURE_BINDING);
    this.siteTex = tex(GROUND_HAZE_SITE, 'rgba16float', T.TEXTURE_BINDING | T.COPY_DST);
    this.tintTex = tex(GROUND_HAZE_SITE, 'rgba8unorm', T.TEXTURE_BINDING | T.COPY_DST);
    const layout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'uniform' } },
      ...[1, 2, 3].map(binding => ({ binding, visibility: C, buffer: { type: 'storage' } })),
      { binding: 4, visibility: C, storageTexture: { access: 'write-only', format: 'rgba16float' } },
      { binding: 5, visibility: C, texture: { sampleType: 'unfilterable-float' } },
    ] });
    this.simBG = device.createBindGroup({ layout, entries: [
      { binding: 0, resource: { buffer: this.params } }, { binding: 1, resource: { buffer: this.simA } },
      { binding: 2, resource: { buffer: this.simB } }, { binding: 3, resource: { buffer: this.aux } },
      { binding: 4, resource: this.stateTex.createView() }, { binding: 5, resource: this.siteTex.createView() }] });
    const module = device.createShaderModule({ code: SIM_WGSL, label: 'ground haze sim' });
    if (module.getCompilationInfo) module.getCompilationInfo().then(info => {
      for (const e of info.messages) if (e.type === 'error') console.error(`ground haze WGSL ${e.lineNum}:${e.linePos} ${e.message}\n` + SIM_WGSL.split('\n')[e.lineNum - 1]);
    });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    this.passes = Object.fromEntries(['advect', 'curl', 'vorticity', 'divergence', 'jacobiAX', 'jacobiXA', 'project'].map(entryPoint =>
      [entryPoint, device.createComputePipeline({ label: 'ground haze ' + entryPoint, layout: pl, compute: { module, entryPoint } })]));

    const view = t => new ViewTexture(t.createView());
    const V2 = (x, y, z, w) => ({ x, y, z, w });
    this.material = new ShaderMaterial({
      uniforms: {
        stateTex: { value: view(this.stateTex) }, siteTex: { value: view(this.siteTex) }, tintTex: { value: view(this.tintTex) },
        grid: { value: V2(0, 0, GRID, GRID) },          // sim grid origin (cells), cells across
        site: { value: V2(0, 0, GROUND_HAZE_SITE, GROUND_HAZE_SITE_TPT) },   // site map first texel x, z, texels across, a tile
        look: { value: V2(0.2, 1, 4, 1) },              // height, density, slices, brightness
        rest: { value: V2(1, 0.4, 0.25, 3) },           // resting amount, patchiness, patch frequency, grid edge blend (tiles)
        wind: { value: V2(0, 0, 0, 0) },                // wind xz, seconds
      },
      attributes: { slice: 'f32' }, code: DRAW_WGSL,
      transparent: true, blending: NormalBlending, depthWrite: false, side: DoubleSide,
    });
    this.mesh = new Mesh(new BufferGeometry(), this.material);
    this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.slices = 0;
    this.origin = null; this.time = 0; this.heroWas = null;
    this.on = false;
  }
  // the slices: a grid of DRAW_TILES tiles a side, DRAW_VPT vertices a tile, once for each slice
  _build(slices) {
    this.slices = slices;
    const n = DRAW_TILES * DRAW_VPT, h = DRAW_TILES / 2, pos = [], sl = [], idx = [];
    for (let s = 0; s < slices; s++) {
      const base = pos.length / 3;
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { pos.push(i / DRAW_VPT - h, 0, j / DRAW_VPT - h); sl.push(s); }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = base + j * (n + 1) + i;
        idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('slice', new Float32BufferAttribute(sl, 1));
    g.setIndex(idx);
    this.mesh.geometry = g;
  }
  // The site map round the camera, from the game (on moving on, or when what's there changed). origin: its first
  // texel [x, z] (GROUND_HAZE_SITE_TPT a tile); site: Float32Array of GROUND_HAZE_SITE² × 4 (ground y, solid 0/1,
  // resting share 0-1, _); tint: Uint8Array of GROUND_HAZE_SITE² × 4 (the haze's colour)
  setSite(origin, site, tint) {
    const n = GROUND_HAZE_SITE, half = new Uint16Array(n * n * 4);
    for (let k = 0; k < half.length; k++) half[k] = toHalf(site[k]);
    const q = this.device.queue;
    q.writeTexture({ texture: this.siteTex }, half, { bytesPerRow: n * 8 }, [n, n]);
    q.writeTexture({ texture: this.tintTex }, tint, { bytesPerRow: n * 4 }, [n, n]);
    this.siteOrigin = origin;
    const s = this.material.uniforms.site.value; s.x = origin[0]; s.y = origin[1];
  }

  // Each frame, before drawing. f: { on, target: [x, z] (the camera's), hero: [x, z], dt, amount, patchiness,
  // patchSize (tiles), relax, wind: [x, z] (tiles a second), settle, swirl, wakeRadius, wakeDrag, wakeClear, spin
  // (tiles a second the air's spun round the hero, whirling), spinClear (haze swept aside round them a second),
  // height, density, slices, brightness }
  update(f) {
    this.on = !!f.on && !!this.siteOrigin;
    this.mesh.visible = this.on;
    if (!this.on) { this.heroWas = null; return; }
    const slices = Math.max(1, Math.min(16, Math.round(f.slices)));
    if (slices !== this.slices) this._build(slices);
    const dt = Math.min(Math.max(f.dt, 0), MAX_DT);
    this.time += f.dt;
    // the grid follows the camera's target in whole cells; the sim reads last frame's grid shifted
    const origin = [Math.round(f.target[0] * CPT - GRID / 2), Math.round(f.target[1] * CPT - GRID / 2)];
    const first = !this.origin;
    const shift = first ? [0, 0] : [origin[0] - this.origin[0], origin[1] - this.origin[1]];
    this.origin = origin;
    const flags = first ? 4 : 0;
    const vel = this.heroWas && f.dt > 0 ? [(f.hero[0] - this.heroWas[0]) / f.dt, (f.hero[1] - this.heroWas[1]) / f.dt] : [0, 0];
    if (Math.hypot(vel[0], vel[1]) > 30) vel[0] = vel[1] = 0;   // a teleport, not a walk
    this.heroWas = [f.hero[0], f.hero[1]];
    const freq = 1 / Math.max(f.patchSize, 0.5), so = this.siteOrigin;
    this.device.queue.writeBuffer(this.params, 0, new Float32Array([
      origin[0], origin[1], GRID, GRID, shift[0], shift[1], dt, this.time,
      f.amount, f.patchiness, freq, f.relax, f.wind[0], f.wind[1], f.settle, f.swirl,
      f.spinClear || 0, flags, 0, 0, f.hero[0], f.hero[1], vel[0], vel[1],
      f.wakeRadius, f.wakeDrag, f.wakeClear, f.spin || 0, so[0], so[1], GROUND_HAZE_SITE, GROUND_HAZE_SITE_TPT]));
    const U = this.material.uniforms;
    Object.assign(U.grid.value, { x: origin[0], y: origin[1] });
    Object.assign(U.look.value, { x: f.height, y: f.density, z: slices, w: f.brightness });
    Object.assign(U.rest.value, { x: f.amount, y: f.patchiness, z: freq });
    Object.assign(U.wind.value, { x: f.wind[0], y: f.wind[1], z: this.time });
    // the slices' vertices stay put in the world (whole steps of their spacing), so their shape doesn't shift as the
    // grid moves on
    const snap = v => Math.round(v * DRAW_VPT) / DRAW_VPT;
    this.mesh.position.set(snap((origin[0] + GRID / 2) / CPT), 0, snap((origin[1] + GRID / 2) / CPT));
    const n = Math.ceil(GRID / 8);
    this.renderer.compute(enc => {
      const pass = enc.beginComputePass({ label: 'ground haze' });
      pass.setBindGroup(0, this.simBG);
      const run = name => { pass.setPipeline(this.passes[name]); pass.dispatchWorkgroups(n, n); };
      run('advect'); run('curl'); run('vorticity'); run('divergence');
      for (let i = 0; i < JACOBI; i++) { run('jacobiAX'); run('jacobiXA'); }
      run('project');
      pass.end();
    });
  }
}

// a float as a half float's bits
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
function toHalf(v) {
  f32[0] = v;
  const x = u32[0], s = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 112, m = x & 0x7fffff;
  if (e <= 0) return s;
  if (e >= 31) return s | 0x7c00;
  return s | (e << 10) | (m >>> 13);
}
