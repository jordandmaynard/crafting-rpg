// Ragdolls for the fallen (v604), ported from Jordan's crafting-and-conquest src/ragdoll.js, where dying villagers
// tumble. The body (hips, torso and head) is one rigid box that falls, bounces and slides on the ground; the arms and
// legs are damped ball joints pinned to their shoulders and hips, swinging forward and back and out to the side with
// the body's motion and gravity, within joint limits, their tips stopped by the ground (and propping the body up on
// it). Emberwild's people also bend at the knee and elbow, so each limb carries a damped hinge below its ball joint,
// lagging behind the swing and folding under gravity within its own limits. Now and then the head pops off and
// tumbles on its own, and whatever was in their hands falls and scatters, each a box of its own.
//
// Collision is points on the boxes against the ground: crafting-and-conquest's voxels become a height field here
// (ground(x, z)), a point under it pushed out along the ground's normal (on a cliff, mostly sideways) with an
// impulse that bounces a little and rubs with friction. Water (water(x, z), its surface or -Infinity) slows what
// sinks into it and holds it up a little.
//
// Everything is in world units; the caller describes the body (shape, below) already scaled to the person.

// (v622: Jordan's tuning from T > Ragdolls)
export const RAGDOLL = {
  gravity: 11,        // tiles per second² (crafting-and-conquest's 22 voxels, its villagers about twice as tall)
  bounce: 0.33,       // how much of the speed into the ground bounces back
  friction: 0.36,      // (crafting-and-conquest's 0.11 slid them down Emberwild's ramps, which are smooth slopes, not voxel steps)
  // Per weapon: tiles per second the killing blow knocks the body away from the attacker and up, and radians per
  // second it tips the body over by (the fists' and anything else's are `fist`).
  swordKick: 3, swordLift: 2.7, swordSpin: 5.7,
  bowKick: 3.3, bowLift: 1.2, bowSpin: 9.7,
  spearKick: 2.8, spearLift: 3.6, spearSpin: 5.1,
  axeKick: 5.9, axeLift: 4.4, axeSpin: 7.7,
  hammerKick: 7.3, hammerLift: 4.6, hammerSpin: 8,
  fistKick: 1.8, fistLift: 0.9, fistSpin: 4,
  limbSpring: 1.6,    // how much the limbs pull back towards hanging straight (a little muscle left)
  limbDamping: 1.7,
  bendSpring: 3,      // and the knees and elbows towards a little bend
  bendDamping: 2.5,
  headPop: 0.08,      // the chance the head comes off
  popSpeed: 3.9,      // tiles per second it flies up at
  scatter: 1.7,       // tiles per second a dropped weapon is flung about at
  itemFriction: 0.44, // and how it grips the ground
};

const SUBSTEPS = 4;
const SKIN = 0.004;

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

// Rotates v by the unit quaternion q = [x, y, z, w] (or by its inverse).
function rot(q, v, inverse = false) {
  const [x, y, z] = inverse ? [-q[0], -q[1], -q[2]] : q, w = q[3];
  const t = scale(cross([x, y, z], v), 2);
  return add(add(v, scale(t, w)), cross([x, y, z], t));
}

// Points to collide: a box's corners, edge midpoints and face centres.
function boxPoints(half, centre = [0, 0, 0]) {
  const out = [];
  for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) for (const k of [-1, 0, 1]) {
    if (!i && !j && !k) continue;
    out.push([centre[0] + i * half[0], centre[1] + j * half[1], centre[2] + k * half[2]]);
  }
  return out;
}

class Body {
  constructor(world, pos, q, half, points, friction = () => RAGDOLL.friction) {
    this.world = world;
    this.friction = friction;
    this.grip = 5; // how fast touching the ground damps its spin
    this.pos = pos;
    this.q = q;
    this.v = [0, 0, 0];
    this.w = [0, 0, 0];
    // (no thinner than 0.12 across for its spin: a thin haft's tiny inertia about its length turned every contact into
    // a jitter on its edge that never settled)
    const [a, b, c] = half.map(h => 2 * Math.max(h, 0.06));
    this.invI = [12 / (b * b + c * c), 12 / (a * a + c * c), 12 / (a * a + b * b)]; // a unit mass's, in the box's frame
    this.points = points;
    this.still = 0;
    this.asleep = false;
    this.landed = null; // called with how hard it hit, now and then, when it lands (a thud)
    this.quiet = 0;
    this.size = 2 * Math.max(...half); // (across)
  }

  invIw(v) {
    const l = rot(this.q, v, true);
    return rot(this.q, [l[0] * this.invI[0], l[1] * this.invI[1], l[2] * this.invI[2]]);
  }

  impulse(j, r) {
    this.v = add(this.v, j);
    this.w = add(this.w, this.invIw(cross(r, j)));
  }

  // Is the point at r (in the box's frame) under the ground?
  inside(r) {
    const p = add(this.pos, rot(this.q, r));
    return p[1] < this.world.ground(p[0], p[2]);
  }

  // The point at r (in the box's frame), if it's under the ground: its offset from the centre in the world, the
  // ground's normal there and how far in along it it is.
  probe(r) {
    const rr = rot(this.q, r), p = add(this.pos, rr), G = this.world.ground;
    const g = G(p[0], p[2]);
    // (a point resting on the ground counts as touching it, a hair over it included, so a body lying still isn't
    // pushed off and dropped back every substep)
    if (!(p[1] < g + SKIN)) return null;
    const e = 0.06, gx = (G(p[0] + e, p[2]) - G(p[0] - e, p[2])) / (2 * e), gz = (G(p[0], p[2] + e) - G(p[0], p[2] - e)) / (2 * e);
    const nl = Math.hypot(gx, 1, gz), n = [-gx / nl, 1 / nl, -gz / nl];
    return { rr, n, depth: Math.min(0.5, Math.max(0, g - p[1]) * n[1]) };
  }

  // The impulse at a contact that stops it moving into the ground (bouncing back a little when it hit hard, if
  // `bounce`) and rubs with friction. `share` scales it (a limb tip passes on only part of its knock).
  resolve({ rr, n }, share = 1, bounce = true) {
    const vp = add(this.v, cross(this.w, rr)), vn = dot(vp, n);
    if (vn >= 0) return;
    const k = 1 + dot(n, cross(this.invIw(cross(rr, n)), rr));
    const j = (-(1 + (bounce && vn < -0.5 ? RAGDOLL.bounce : 0)) * vn / k) * share;
    this.impulse(scale(n, j), rr);
    const vp2 = add(this.v, cross(this.w, rr));
    const vt = add(vp2, scale(n, -dot(vp2, n))), sp = len(vt);
    if (sp > 1e-6) {
      const t = scale(vt, 1 / sp);
      const kt = 1 + dot(t, cross(this.invIw(cross(rr, t)), rr));
      this.impulse(scale(t, -Math.min(sp / kt, this.friction() * j)), rr);
    }
  }

  // One point's contact on its own (a limb tip): pushed out and stopped. Returns whether it touched.
  contact(r, share = 1) {
    const c = this.probe(r);
    if (!c) return false;
    this.pos = add(this.pos, scale(c.n, c.depth + 1e-4));
    this.resolve(c, share);
    return true;
  }

  // Gravity and motion for one substep (contacts come after).
  move(h) {
    const T = RAGDOLL;
    this.quiet -= h;
    this.v[1] -= T.gravity * h;
    if (this.pos[1] < this.world.water(this.pos[0], this.pos[2])) { // sinks slowly through the water
      this.v = scale(this.v, 1 - Math.min(1, 4 * h));
      this.w = scale(this.w, 1 - Math.min(1, 3 * h));
      this.v[1] += T.gravity * 0.8 * h;
    }
    this.w = scale(this.w, 1 - 0.3 * h);
    this.pos = add(this.pos, scale(this.v, h));
    const [x, y, z, w] = this.q, [ax, ay, az] = this.w, k = 0.5 * h;
    const q = [x + k * (ax * w + ay * z - az * y), y + k * (ay * w + az * x - ax * z),
      z + k * (az * w + ax * y - ay * x), w - k * (ax * x + ay * y + az * z)];
    const ql = Math.hypot(...q);
    this.q = q.map(c => c / ql);
  }

  // All the points touching at once: out by the deepest along each way out, then a few passes of impulses over them
  // together, so a box resting on a face sits still instead of rocking from corner to corner. Touching the ground
  // also damps its spin a little, so it comes to rest rather than rocking on its corners.
  collide(h) {
    const cs = [];
    for (const r of this.points) { const c = this.probe(r); if (c) cs.push(c); }
    if (!cs.length) return;
    if (this.landed && this.quiet <= 0) {
      let hit = 0;
      for (const c of cs) hit = Math.max(hit, -dot(add(this.v, cross(this.w, c.rr)), c.n));
      if (hit > 1.5) { this.quiet = 0.15; this.landed(hit); }
    }
    let deep = 0, dn = null;
    for (const c of cs) if (c.depth > deep) { deep = c.depth; dn = c.n; }
    if (dn) this.pos = add(this.pos, scale(dn, deep + 1e-4));
    for (let i = 0; i < 4; i++) for (const c of cs) this.resolve(c, 1, i === 0);
    this.w = scale(this.w, 1 - Math.min(1, this.grip * h));
  }

  // Asleep once it's lain still for a moment (its spin measured by how fast its corners move: a thin dropped weapon
  // rocks on its edge too little to see, for ever).
  settle(h) {
    this.still = len(this.v) < 0.25 && len(this.w) * this.size < 0.6 ? this.still + h : 0;
    if (this.still > 0.4) { this.asleep = true; this.v = [0, 0, 0]; this.w = [0, 0, 0]; }
  }
}

// Rz(roll) * Rx(ang) * v: a limb's pose (a swing about the body's x, negative forward, then a roll about its z,
// positive out to the body's left, +x). The rig's limbs take it as Euler order 'ZYX'.
const limbRot = (v, ang, roll = 0) => {
  const c = Math.cos(ang), s = Math.sin(ang), cr = Math.cos(roll), sr = Math.sin(roll);
  const y = c * v[1] - s * v[2];
  return [cr * v[0] - sr * y, sr * v[0] + cr * y, s * v[1] + c * v[2]];
};

// A limb pointing along d (in the body's frame) as a swing and a roll, whichever of the two ways to it sits better in
// the joint's limits.
function limbAngles(d, lo, hi, rlo, rhi) {
  const a = Math.asin(Math.max(-1, Math.min(1, d[2])));
  const out = (t, r) => Math.max(0, lo - t, t - hi) + Math.max(0, rlo - r, r - rhi);
  const A = [-a, Math.atan2(d[0], -d[1])], B = [-Math.PI + a, Math.atan2(-d[0], d[1])];
  return out(...B) < out(...A) - 1e-6 ? B : A;
}

export class Ragdoll {
  // world: { ground(x, z), water(x, z) }. shape (world units, the body's frame: feet at 0, facing +z, left +x):
  //   bodyY, bodyHalf: the body box's centre height and half size (its centre is the centre of mass);
  //   headY, headHalf: the head's box (collides with the body until it pops off);
  //   limbs: [{ pivot: [x, y, z], len, lo, hi, rlo, rhi, upper, bend: [lo, hi, rest], dir }]: each limb's ball joint,
  //     its reach, swing and roll limits, how far down it the knee or elbow is, that hinge's limits and resting bend,
  //     and the way it pointed (in the body's frame) as the blow fell, with `bendNow` its bend then.
  // at: { pos (the feet), yaw, from (where the blow came from), weapon }. held: [{ centre, half, q }] what's in the
  // hands to drop: its box's centre (in the body's frame from the feet), half size, and turn (in the body's frame).
  constructor(world, shape, at, held = []) {
    const T = RAGDOLL;
    this.world = world;
    this.shape = shape;
    const q = [0, Math.sin(at.yaw / 2), 0, Math.cos(at.yaw / 2)];
    const feet = at.pos[1];
    this.popped = Math.random() < T.headPop;
    const points = boxPoints(shape.bodyHalf);
    if (!this.popped) points.push(...boxPoints(shape.headHalf, [0, shape.headY - shape.bodyY, 0]));
    const b = this.body = new Body(world, [at.pos[0], feet + shape.bodyY, at.pos[2]], q, shape.bodyHalf, points);
    // Knocked away from the blow, tipping over that way.
    let dx = at.pos[0] - at.from[0], dz = at.pos[2] - at.from[2];
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-3) { dx /= dl; dz /= dl; } else { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); }
    const wp = T[at.weapon + 'Kick'] === undefined ? 'fist' : at.weapon;
    const kick = T[wp + 'Kick'], lift = T[wp + 'Lift'], spin = T[wp + 'Spin'];
    b.v = [dx * kick, lift, dz * kick];
    b.w = [dz * spin + (Math.random() - 0.5), (Math.random() - 0.5) * 2, -dx * spin + (Math.random() - 0.5)];
    // Each limb starts as it was (as near as its limits allow), set flailing out a little, some one way and some the
    // other, so no two falls look alike.
    this.limbs = shape.limbs.map(L => {
      const [th, rb] = limbAngles(L.dir || [0, -1, 0], L.lo, L.hi, L.rlo, L.rhi);
      const [blo, bhi] = L.bend;
      return {
        ...L, pivot: sub(L.pivot, [0, shape.bodyY, 0]), th: Math.max(L.lo, Math.min(L.hi, th)), om: 0,
        rb: Math.max(L.rlo, Math.min(L.rhi, rb)), or: (Math.random() - 0.5) * 4 + Math.sign(L.pivot[0]) * 1.5,
        k: Math.max(blo, Math.min(bhi, L.bendNow || 0)), kom: 0, vp: null, wa: null, wz: null, lastOm: 0,
      };
    });
    if (this.popped) {
      const hh = shape.headHalf;
      this.head = new Body(world, [at.pos[0], feet + shape.headY, at.pos[2]], q.slice(), hh, boxPoints(hh));
      const a = Math.random() * Math.PI * 2;
      this.head.v = [b.v[0] + Math.cos(a) * 0.75, T.popSpeed * (0.8 + 0.4 * Math.random()), b.v[2] + Math.sin(a) * 0.75];
      this.head.w = [0, 0, 0].map(() => (Math.random() - 0.5) * 16);
    }
    // Each thing held becomes a box round it, starting where it was in the fist.
    this.items = held.map(({ centre, half, q: iq0 }) => {
      const iq = qmul(b.q, iq0 || [0, 0, 0, 1]);
      const h = half.map(v => Math.max(0.02, v));
      const body = new Body(world, add([at.pos[0], feet, at.pos[2]], rot(b.q, centre)), iq, h, boxPoints(h), () => T.itemFriction);
      const a = Math.random() * Math.PI * 2;
      body.v = [b.v[0] + Math.cos(a) * T.scatter, lift + Math.random() * T.scatter, b.v[2] + Math.sin(a) * T.scatter];
      body.w = [0, 0, 0].map(() => (Math.random() - 0.5) * 12);
      body.grip = 25; // thin things rattle on their edges otherwise
      return { body };
    });
  }

  get asleep() { return this.body.asleep && this.loose().every(o => o.asleep); }

  step(dt) {
    dt = Math.min(dt, 1 / 20);
    const h = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      const b = this.body;
      if (!b.asleep) {
        b.move(h);
        this.limbStep(h);
        b.collide(h);
        b.settle(h);
      }
      for (const o of this.loose()) {
        if (o.asleep) continue;
        o.move(h);
        o.collide(h);
        o.settle(h);
      }
    }
  }

  // Each limb swings on its ball joint as a rod hanging from it: forward and back about the body's x (turned by its
  // roll) and out to the side about the body's z, pulled by gravity less the pivot's acceleration, left behind as the
  // body turns, damped, and held within its limits. A tip in the ground moves to the nearest pose that clears it, or
  // (with nowhere to go) stops and pushes the body off it. Below it the knee or elbow folds the same way about the
  // swing's axis, lagging behind the swing, and stops where its tip would go into the ground.
  limbStep(h) {
    const T = RAGDOLL, b = this.body;
    const az = rot(b.q, [0, 0, 1]), wz = dot(b.w, az);
    for (const l of this.limbs) {
      const rp = rot(b.q, l.pivot), vp = add(b.v, cross(b.w, rp));
      let acc = l.vp ? scale(sub(vp, l.vp), 1 / h) : [0, 0, 0];
      const al = len(acc);
      if (al > 40) acc = scale(acc, 40 / al);
      l.vp = vp;
      const g = [-acc[0], -T.gravity - acc[1], -acc[2]];
      const ax = rot(b.q, [Math.cos(l.rb), Math.sin(l.rb), 0]), wa = dot(b.w, ax);
      const torque = scale(cross(rot(b.q, limbRot([0, -1, 0], l.th, l.rb)), g), 1.5 / l.len);
      const turnedA = l.wa === null ? 0 : wa - l.wa, turnedZ = l.wz === null ? 0 : wz - l.wz;
      l.wa = wa;
      l.wz = wz;
      l.om += (dot(torque, ax) - T.limbSpring * l.th - T.limbDamping * l.om) * h - turnedA;
      l.or += (dot(torque, az) - T.limbSpring * l.rb - T.limbDamping * l.or) * h - turnedZ;
      l.th += l.om * h;
      l.rb += l.or * h;
      if (l.th < l.lo) { l.th = l.lo; if (l.om < 0) l.om *= -0.2; }
      if (l.th > l.hi) { l.th = l.hi; if (l.om > 0) l.om *= -0.2; }
      if (l.rb < l.rlo) { l.rb = l.rlo; if (l.or < 0) l.or *= -0.2; }
      if (l.rb > l.rhi) { l.rb = l.rhi; if (l.or > 0) l.or *= -0.2; }
      const tip = (th, rb) => add(l.pivot, limbRot([0, -l.len, 0], th, rb));
      if (b.inside(tip(l.th, l.rb))) {
        let free = null;
        for (let k = 1; k <= 30 && free === null; k++) {
          const d = k * 0.05;
          for (const [a, r] of [[l.th + d, l.rb], [l.th - d, l.rb], [l.th, l.rb + d], [l.th, l.rb - d]]) {
            if (a >= l.lo && a <= l.hi && r >= l.rlo && r <= l.rhi && !b.inside(tip(a, r))) { free = [a, r]; break; }
          }
        }
        if (free === null) b.contact(tip(l.th, l.rb), 0.5);
        else [l.th, l.rb] = free;
        l.om = 0;
        l.or = 0;
      }
      // the knee or elbow: the lower part as a rod hanging from the hinge, about the same axis
      const [blo, bhi, rest] = l.bend, lower = l.len - l.upper;
      const lt = rot(b.q, limbRot([0, -1, 0], l.th + l.k, l.rb));
      const kt = dot(cross(lt, g), ax) * 1.5 / lower;
      l.kom += (kt - T.bendSpring * (l.k - rest) - T.bendDamping * l.kom) * h - (l.om - l.lastOm) * 0.6 - turnedA * 0.4;
      l.lastOm = l.om;
      const k0 = l.k;
      l.k += l.kom * h;
      if (l.k < blo) { l.k = blo; if (l.kom < 0) l.kom *= -0.2; }
      if (l.k > bhi) { l.k = bhi; if (l.kom > 0) l.kom *= -0.2; }
      const ktip = add(add(l.pivot, limbRot([0, -l.upper, 0], l.th, l.rb)), limbRot([0, -lower, 0], l.th + l.k, l.rb));
      if (b.inside(ktip)) { l.k = k0; l.kom = 0; }
    }
  }

  // A blast at p flings the body, its head and what it dropped away from it (and up), waking them if they'd settled.
  blast(p, speed) {
    if (speed <= 0) return;
    for (const o of [this.body, ...this.loose()]) {
      const d = sub(o.pos, p), l = len(d) || 1;
      o.v = add(o.v, [d[0] / l * speed, (Math.max(0, d[1] / l) * 0.5 + 0.6) * speed, d[2] / l * speed]);
      o.w = add(o.w, [0, 0, 0].map(() => (Math.random() - 0.5) * speed));
      o.asleep = false;
      o.still = 0;
    }
  }

  // What tumbles on its own: the head, if it's come off, and what was held.
  loose() { return this.head ? [this.head, ...this.items.map(it => it.body)] : this.items.map(it => it.body); }

  // Where the feet's frame is now: the body's frame moved down from its centre to the feet ({ pos, q }).
  frame() {
    const b = this.body;
    return { pos: sub(b.pos, rot(b.q, [0, this.shape.bodyY, 0])), q: b.q };
  }
}

export { Body, boxPoints, rot, qmul, limbRot, limbAngles };
