import * as THREE from 'three';
import {
  V, PI, TAU, clamp, lerp, sstep, xf, box, rbox, yTube, zTube, xTube, rod, pipe, plane, lathe, rrectShape, rrectRing, rrectSlab,
  lobedShape, markEdges, mergeAll, projectUV, heads, screwFrame, mulberry32, loft,
} from './kit.js';
import { CEIL, ROOF, WALL_T, SILL_Y, SILL_D, LOWER_D, OUTLINE, SEGMENTS, FOOTPRINTS, ZA, PLAN, WINFRAME } from './layout.js';
import { stencilArt, placardArt } from './art.js';

// The bridge shell: bulkheads with their window bays and doors, the timber sill and the panelled
// face under it, corner posts, the perforated overhead with its lights and cable runs, the deck.
// Window bays follow refs/photos/kirov-bridge-controls-reference.jpg: each opening in its own deep
// cast frame with a rubber seal, cream five-lobed dog knobs on swing bolts, a sloped ledge below.

// ---------------------------------------------------------------- frames

// Segment frame: local x along the wall from a to b, y up, z inward from the inner face. T(g) puts
// a geometry built in the frame into the room; on a raked wall (the active plan's rake for segment
// i) it first leans the geometry out above the sill (see bender).
export function segmentFrame(seg, i = -1) {
  const [ax, az] = seg.a, [bx, bz] = seg.b;
  const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
  const nx = -dz, nz = dx;
  const m = new THREE.Matrix4().makeBasis(V(dx, 0, dz), V(0, 1, 0), V(nx, 0, nz)).setPosition(ax, 0, az);
  const f = { m, len, d: V(dx, 0, dz), n: V(nx, 0, nz) };
  const bend = i >= 0 ? bender(f, i) : null;
  f.T = bend ? (g) => bend.geom(g).applyMatrix4(m) : (g) => g.applyMatrix4(m);
  f.bend = bend;
  return f;
}

// The rake of a plan's windowed faces: above PLAN.rakeFrom the wall leans out, reaching the plan's
// top outline at PLAN.rakeTo. The displacement interpolates the two corners' offsets along the wall,
// so neighbouring faces meet at the corners; normals follow the deformation's cofactor matrix.
function bender(f, i) {
  const r = PLAN?.rake?.[i];
  if (!r) return null;
  const tan = ([ox, oz]) => ox * f.d.x + oz * f.d.z, out = ([ox, oz]) => -(ox * f.n.x + oz * f.n.z);
  const tA = tan(r.a), tB = tan(r.b), oA = out(r.a), oB = out(r.b), L = f.len, y0 = PLAN.rakeFrom, y1 = PLAN.rakeTo;
  const at = (u, y) => {
    const k = clamp((y - y0) / (y1 - y0), 0, 1), kp = y > y0 && y < y1 ? 1 / (y1 - y0) : 0, q = clamp(u / L, 0, 1);
    return { k, kp, t: tA + (tB - tA) * q, o: oA + (oB - oA) * q };
  };
  return {
    // displaced point (segment frame) and the lean of the wall there (radians about the wall's x)
    point(u, y, z) { const a = at(u, y); return V(u + a.k * a.t, y, z - a.k * a.o); },
    lean(u, y) { const a = at(u, y + 0.01); return -Math.atan(a.kp * a.o); },
    geom(g) {
      const p = g.attributes.position, n = g.attributes.normal;
      for (let v = 0; v < p.count; v++) {
        const u = p.getX(v), y = p.getY(v), z = p.getZ(v), a = at(u, y);
        p.setXYZ(v, u + a.k * a.t, y, z - a.k * a.o);
        if (!n) continue;
        // J = [[1 + k dt/du, kp t, 0], [0, 1, 0], [-k do/du, -kp o, 1]]; n' = cof(J) n
        const ja = 1 + (a.k * (tB - tA)) / L, jb = a.kp * a.t, jc = -(a.k * (oB - oA)) / L, je = -a.kp * a.o;
        const nx = n.getX(v), ny = n.getY(v), nz = n.getZ(v);
        const qx = nx - jc * nz, qy = -jb * nx + ja * ny - (ja * je - jb * jc) * nz, qz = ja * nz;
        const l = Math.hypot(qx, qy, qz) || 1;
        n.setXYZ(v, qx / l, qy / l, qz / l);
      }
      p.needsUpdate = true;
      return g;
    },
  };
}

// The active layout's segment frames, rebuilt when the layout changes.
let _segFor = null, _segCache = null;
export function segs() {
  if (_segFor !== SEGMENTS) { _segCache = SEGMENTS.map((s, i) => segmentFrame(s, i)); _segFor = SEGMENTS; }
  return _segCache;
}

// Signed distance (plan) from a point to the outline, positive inside, and the nearest segment.
export function wallDistance(x, z) {
  let best = 1e9, idx = -1;
  const fr = segs();
  for (let i = 0; i < SEGMENTS.length; i++) {
    const s = SEGMENTS[i], f = fr[i];
    const px = x - s.a[0], pz = z - s.a[1];
    const u = clamp(px * f.d.x + pz * f.d.z, 0, f.len);
    const d = px * f.n.x + pz * f.n.z; // along the inward normal
    const ex = px - f.d.x * u, ez = pz - f.d.z * u;
    const dist = Math.abs(d) > 0 ? Math.sign(d) * Math.hypot(ex, ez) : 0;
    if (Math.abs(dist) < Math.abs(best)) { best = dist; idx = i; }
  }
  return { d: best, seg: idx };
}

// Baked room occlusion for vertex colours: corners, the sill's overhang, furniture contact.
export function roomOcclusion(p, n) {
  let k = 1;
  const { d, seg } = wallDistance(p.x, p.z);
  const ny = n.y;
  const inside = d > -0.02;
  if (!inside) return 1; // the outer skin
  if (ny > 0.5) k *= 1 - 0.42 * Math.exp(-Math.max(0, d) / 0.26) * (p.y < 0.4 ? 1 : 0.45);
  if (ny < -0.5) k *= 1 - 0.32 * Math.exp(-Math.max(0, d) / 0.34);
  if (Math.abs(ny) < 0.7) {
    k *= 1 - 0.34 * Math.exp(-Math.max(0, p.y) / 0.2);
    k *= 1 - 0.28 * Math.exp(-Math.max(0, CEIL - p.y) / 0.22);
    if (d < 0.3) k *= 1 - 0.12 * (1 - d / 0.3); // in the wall's own plane, near the corner posts
  }
  // the timber sill shades the panelled face under it and the deck at its foot
  if (seg >= 0 && SEGMENTS[seg].sill && p.y < SILL_Y - 0.02 && d < SILL_D + 0.5) {
    const under = 1 - sstep(SILL_D - 0.05, SILL_D + 0.5, d);
    k *= 1 - 0.38 * under * (0.55 + 0.45 * sstep(0.0, SILL_Y, SILL_Y - p.y));
  }
  // contact shadows round the furniture bases
  for (const f of FOOTPRINTS) {
    const dx = Math.max(0, Math.abs(p.x - f.x) - f.hx), dz = Math.max(0, Math.abs(p.z - f.z) - f.hz);
    const dd = Math.hypot(dx, dz);
    if (dd > 0.9 || p.y > f.h) continue;
    k *= 1 - (f.k ?? 0.42) * Math.exp(-dd / 0.2) * Math.exp(-Math.max(0, p.y) / 0.3);
  }
  return clamp(k, 0.25, 1);
}

// ---------------------------------------------------------------- polygon helpers

// Clip a convex polygon [[x, z]] against the (convex, clockwise in screen) outline.
function clipToOutline(poly, outline = null) {
  if (outline) return clipToPoints(poly, outline);
  let out = poly;
  const fr = segs();
  for (let i = 0; i < SEGMENTS.length; i++) {
    const s = SEGMENTS[i], f = fr[i];
    const side = ([x, z]) => (x - s.a[0]) * f.n.x + (z - s.a[1]) * f.n.z;
    const inp = out;
    out = [];
    for (let k = 0; k < inp.length; k++) {
      const A = inp[k], B = inp[(k + 1) % inp.length], sa = side(A), sb = side(B);
      if (sa >= 0) out.push(A);
      if ((sa >= 0) !== (sb >= 0)) { const t = sa / (sa - sb); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
    }
    if (out.length < 3) return [];
  }
  return out;
}

// Clip against any convex outline of [x, z] points (ordered as OUTLINE).
function clipToPoints(poly, pts) {
  let out = poly;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], L = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / L, nz = (bx - ax) / L;
    const side = ([x, z]) => (x - ax) * nx + (z - az) * nz;
    const inp = out;
    out = [];
    for (let k = 0; k < inp.length; k++) {
      const A = inp[k], B = inp[(k + 1) % inp.length], sa = side(A), sb = side(B);
      if (sa >= 0) out.push(A);
      if ((sa >= 0) !== (sb >= 0)) { const t = sa / (sa - sb); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
    }
    if (out.length < 3) return [];
  }
  return out;
}

// The room outline at height y on a raked plan: the corners carry their rake offsets (null: no plan).
export function outlineAt(y) {
  if (!PLAN) return null;
  const k = clamp((y - PLAN.rakeFrom) / (PLAN.rakeTo - PLAN.rakeFrom), 0, 1);
  return OUTLINE.map(([x, z], i) => [x + PLAN.corner[i][0] * k, z + PLAN.corner[i][1] * k]);
}

// Half width of a convex outline at z (for ribs that span it).
function halfWidthAt(pts, z) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    if ((az - z) * (bz - z) > 0 || az === bz) continue;
    const x = ax + ((z - az) / (bz - az)) * (bx - ax);
    lo = Math.min(lo, x); hi = Math.max(hi, x);
  }
  return hi > lo ? (hi - lo) / 2 : 0;
}

// Horizontal grid of clipped cells at height y, facing up (sign 1) or down (-1); cells jittered.
function gridSurface(cell, y, sign, { jitter = 0, seed = 1, uvFn = null, outline = null, extent = [-8, 8, -5, 5] } = {}) {
  const r = mulberry32(seed), pos = [], uv = [];
  for (let x = extent[0]; x < extent[1]; x += cell) for (let z = extent[2]; z < extent[3]; z += cell) {
    const poly = clipToOutline([[x, z], [x + cell, z], [x + cell, z + cell], [x, z + cell]], outline);
    if (!poly.length) continue;
    const dy = (r() - 0.5) * jitter, tx = (r() - 0.5) * jitter * 1.5, tz = (r() - 0.5) * jitter * 1.5;
    const cx = x + cell / 2, cz = z + cell / 2;
    const yy = (px, pz) => y + dy + tx * (px - cx) + tz * (pz - cz);
    for (let k = 1; k < poly.length - 1; k++) {
      const tri = sign > 0 ? [poly[0], poly[k + 1], poly[k]] : [poly[0], poly[k], poly[k + 1]];
      for (const [px, pz] of tri) {
        pos.push(px, yy(px, pz), pz);
        uv.push(...(uvFn ? uvFn(px, pz) : [px, pz]));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- shared small castings

let _knob;
// The cream five-lobed dog knob seen on every window, with its domed boss; axis +Z, face at z = 0.
function dogKnob() {
  if (_knob) return _knob;
  const star = new THREE.ExtrudeGeometry(lobedShape(5, 0.056, 0.46, 6), { depth: 0.018, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.007, bevelSegments: 1, curveSegments: 4 });
  markEdges(star, 'z', 2);
  const boss = markEdges(new THREE.LatheGeometry([[0.0001, 0.038], [0.014, 0.036], [0.022, 0.03], [0.025, 0.02], [0.025, 0.0]].map(([r, y]) => new THREE.Vector2(r, y)), 12), 'y').rotateX(PI / 2);
  _knob = mergeAll([star.translate(0, 0, -0.025), boss]);
  return _knob;
}

// Cream window-heater junction box (cast, round, with a black rotary switch) as on the mullions.
function heaterBox(P, T, x, y, z, seed) {
  P.add('cream', T(lathe([[0.0001, 0], [0.058, 0], [0.062, 0.006], [0.062, 0.05], [0.056, 0.062], [0.03, 0.068], [0.0001, 0.068]], 20).rotateX(PI / 2).translate(x, y, z)));
  P.add('cream', T(rbox(0.05, 0.03, 0.05, 0.01, x, y - 0.075, z + 0.025))); // conduit gland
  P.add('black', T(zTube(z + 0.066, z + 0.096, 0.016, 0.014, 12, x, y)));
  P.add('black', T(rbox(0.012, 0.05, 0.022, 0.004, x, y, z + 0.1)));
  P.add('steel', T(heads([V(x - 0.04, y + 0.03, z + 0.064), V(x + 0.04, y - 0.03, z + 0.064)], V(0, 0, 1), 0.006)));
}

// ---------------------------------------------------------------- window bays

// Window bay proportions: Kirov's broad cast frames, or the narrower frames of a plan's tight rows.
const BAY_KIROV = { reveal: 0.08, ring: 0.28, ringR: 0.22, sash: 0.05, sashR: 0.14, sashIn: 0.1, sashInR: 0.08, seal0: 0.088, seal1: 0.108, glass: 0.09, hinge: 0.05, dog: 0.085, hullRing: 0.22, hullR: 0.2, brow: 0.36 };
const BAY_TIGHT = { reveal: 0.06, ring: 0.16, ringR: 0.14, sash: 0.035, sashR: 0.11, sashIn: 0.08, sashInR: 0.065, seal0: 0.07, seal1: 0.088, glass: 0.075, hinge: 0.035, dog: 0.055, hullRing: 0.14, hullR: 0.12, brow: 0.22 };

function windowBay(ctx, seg, f, win, idx) {
  const { P, glass, wipers, atlas } = ctx;
  const m = f.m, T = f.T, B = PLAN ? BAY_TIGHT : BAY_KIROV;
  const W = win.w, H = win.h, cx = win.u, cy = win.y0 + H / 2;
  // reveal liner through the bulkhead: grey outer half, green inner half
  P.add('hull', T(rrectRing(W + B.reveal, H + B.reveal, 0.15, W, H, 0.11, WALL_T / 2 + 0.01, 0.006).translate(cx, cy, -WALL_T - 0.01)));
  P.add('green', T(rrectRing(W + B.reveal, H + B.reveal, 0.15, W, H, 0.11, WALL_T / 2 + 0.01, 0.006).translate(cx, cy, -WALL_T / 2)));
  P.add('green', T(rrectRing(W + B.ring, H + B.ring, B.ringR, W + 0.02, H + 0.02, 0.12, 0.06, 0.012).translate(cx, cy, 0)));
  // hinged sash and its seal; the glass sits in it
  P.add('green', T(rrectRing(W + B.sash, H + B.sash, B.sashR, W - B.sashIn, H - B.sashIn, B.sashInR, 0.045, 0.008).translate(cx, cy, 0.055)));
  P.add('rubber', T(rrectRing(W - B.seal0, H - B.seal0, 0.085, W - B.seal1, H - B.seal1, 0.072, 0.012, 0, 4).translate(cx, cy, 0.09)));
  const gs = rrectShape(W - B.glass, H - B.glass, 0.075), gg = new THREE.ShapeGeometry(gs, 8);
  const gu = gg.attributes.uv, gp = gg.attributes.position;
  for (let i = 0; i < gu.count; i++) gu.setXY(i, gp.getX(i) / (W - B.glass) + 0.5, gp.getY(i) / (H - B.glass) + 0.5);
  glass.push(T(gg.translate(cx, cy, 0.075)));
  // hinge knuckles on the sash's left edge
  for (const yy of [-H * 0.36, H * 0.36]) {
    P.add('green', T(yTube(cy + yy - 0.06, cy + yy + 0.06, 0.022, 0.022, 12, cx - W / 2 - B.hinge, 0.11)));
    P.add('steel', T(yTube(cy + yy - 0.075, cy + yy + 0.075, 0.008, 0.008, 8, cx - W / 2 - B.hinge, 0.11)));
  }
  // dogs: lug on the frame, swing bolt over the sash, cream knob (three on a plan's narrow frames)
  const knob = dogKnob();
  const dogs = PLAN
    ? [[W / 2 + B.dog, H * 0.26], [W / 2 + B.dog, -H * 0.26], [0, -H / 2 - B.dog]]
    : [[W / 2 + 0.085, H * 0.3], [W / 2 + 0.085, -H * 0.3], [-W / 2 - 0.085, H * 0.06], [0, -H / 2 - 0.085], [0, H / 2 + 0.085]];
  dogs.forEach(([dx, dy], k) => {
    const x = cx + dx, y = cy + dy, ang = Math.atan2(dy, dx) + (k % 2 ? 0.25 : -0.2);
    P.add('green', T(rbox(0.06, 0.06, 0.05, 0.012, x, y, 0.08, 0, 0, ang)));
    P.add('steel', T(zTube(0.08, 0.15, 0.009, 0.009, 6, x, y)));
    P.add('black', T(box(0.075, 0.022, 0.012, x - Math.cos(ang) * 0.03, y - Math.sin(ang) * 0.03, 0.112, 0, 0, ang)));
    P.add('cream', T(knob.clone().applyMatrix4(xf(x, y, 0.175, 0, 0, k * 0.9))));
  });
  // sloped ledge from the frame's foot down onto the sill (the photographs' green trough)
  const y1 = win.y0 - 0.14, y2 = SILL_Y + 0.004;
  if (seg.sill && y1 > y2 + 0.02) P.add('green', T(sidePlate(W + 0.3, [[0.0, y1 + 0.01], [0.075, y1], [0.2, y2], [0.0, y2]], cx)));
  // outside: frame flange on the hull skin, eyebrow, wiper motor
  P.add('hull', T(rrectRing(W + B.hullRing, H + B.hullRing, B.hullR, W, H, 0.11, 0.035, 0.006).translate(cx, cy, -WALL_T - 0.045)));
  P.add('hull', T(rbox(W + B.brow, 0.025, 0.16, 0.008, cx, win.y0 + H + 0.16, -WALL_T - 0.08, -0.25)));
  P.add('hull', T(rbox(0.16, 0.11, 0.09, 0.02, cx, win.y0 - 0.1, -WALL_T - 0.06)));
  if (f.bend) {
    // on a raked face the wiper pivots on the leaning glass
    const pv = f.bend.point(cx, win.y0 - 0.03, -WALL_T - 0.115);
    wipers.push({ m: m.clone().multiply(xf(pv.x, pv.y, pv.z, f.bend.lean(cx, win.y0 + H / 2), 0, 0)), len: H * 0.82, phase: idx * 0.37 });
  } else wipers.push({ m: m.clone().multiply(xf(cx, win.y0 - 0.03, -WALL_T - 0.115)), len: H * 0.82, phase: idx * 0.37 });
  // stencilled frame number (as photographed: red figures on the frames)
  if (idx % 2 === 0) {
    const r = stencilArt(atlas, String(120 + idx * 7), { w: 160, h: 64, seed: idx + 11 });
    ctx.decal(T(plane(0.1, 0.04, cx + W / 2 + 0.09, cy + H * 0.05, 0.063, 0, 0, PI / 2)), r);
  }
}

// A plate in the wall's (z, y) profile extruded along x, centred on cx.
function sidePlate(w, pts, cx) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  markEdges(g, 'z');
  return g.translate(0, 0, -w / 2).rotateY(-PI / 2).applyMatrix4(xf(cx, 0, 0));
}

// Wall face (inner green or outer hull) as a gridded plane with rectangular openings cut out.
function wallFace(P, key, T, len, y0, y1, holes, z, facing, cell = 0.36, ext = null) {
  // split the wall into columns at the holes' edges, then rows within each column
  const u0 = ext ? -ext[0] : 0, u1 = ext ? len + ext[1] : len;
  const xs = new Set([u0, u1]);
  for (const h of holes) { xs.add(clamp(h.x0, u0, u1)); xs.add(clamp(h.x1, u0, u1)); }
  const cols = [...xs].sort((a, b) => a - b);
  for (let i = 0; i < cols.length - 1; i++) {
    const a = cols[i], b = cols[i + 1];
    if (b - a < 1e-3) continue;
    const mid = (a + b) / 2;
    const cut = holes.filter((h) => mid > h.x0 && mid < h.x1).sort((p, q) => p.y0 - q.y0);
    let y = y0;
    const spans = [];
    for (const h of cut) { if (h.y0 > y) spans.push([y, h.y0]); y = Math.max(y, h.y1); }
    if (y1 > y) spans.push([y, y1]);
    // a raked wall bends at the rake line: keep a row boundary there
    if (PLAN) for (let k = spans.length - 1; k >= 0; k--) { const [ya, yb] = spans[k], yr = PLAN.rakeFrom; if (yr > ya + 1e-3 && yr < yb - 1e-3) spans.splice(k, 1, [ya, yr], [yr, yb]); }
    for (const [ya, yb] of spans) {
      if (yb - ya < 1e-3) continue;
      const g = new THREE.PlaneGeometry(b - a, yb - ya, Math.max(1, Math.ceil((b - a) / cell)), Math.max(1, Math.ceil((yb - ya) / cell)));
      if (facing < 0) g.rotateY(PI);
      g.translate(mid, (ya + yb) / 2, z);
      P.add(key, T(g));
    }
  }
}

// ---------------------------------------------------------------- doors

function sideDoor(ctx, f, door) {
  const { P, glass, atlas } = ctx;
  const m = f.m, T = (g) => g.applyMatrix4(m);
  const W = door.w, H = door.h, cx = door.u, cy = door.sill + H / 2;
  P.add('hull', T(rrectRing(W + 0.08, H + 0.08, 0.14, W, H, 0.1, WALL_T / 2 + 0.01, 0.006).translate(cx, cy, -WALL_T - 0.01)));
  P.add('green', T(rrectRing(W + 0.08, H + 0.08, 0.14, W, H, 0.1, WALL_T / 2 + 0.01, 0.006).translate(cx, cy, -WALL_T / 2)));
  P.add('green', T(rrectRing(W + 0.3, H + 0.3, 0.24, W + 0.02, H + 0.02, 0.12, 0.07, 0.014).translate(cx, cy, 0)));
  // coaming (the raised threshold) under the opening
  P.add('green', T(rbox(W + 0.3, door.sill, WALL_T + 0.2, 0.03, cx, door.sill / 2, -WALL_T / 2 + 0.02)));
  P.add('steel', T(rbox(W + 0.1, 0.012, WALL_T + 0.12, 0.004, cx, door.sill + 0.004, -WALL_T / 2 + 0.02)));
  // the leaf: hull grey outside, green inside, stiffened, with six dogs and a deadlight port
  P.add('hull', T(rrectSlab(W + 0.03, H + 0.03, 0.11, 0.04, 0.008).translate(cx, cy, -0.1)));
  P.add('green', T(rrectSlab(W + 0.03, H + 0.03, 0.11, 0.035, 0.008).translate(cx, cy, -0.062)));
  P.add('rubber', T(rrectRing(W + 0.05, H + 0.05, 0.12, W - 0.02, H - 0.02, 0.1, 0.012, 0.002).translate(cx, cy, -0.03)));
  for (const yy of [-H * 0.28, 0, H * 0.28]) P.add('green', T(rbox(W - 0.12, 0.05, 0.035, 0.01, cx, cy + yy, -0.02)));
  P.add('green', T(rbox(0.05, H - 0.2, 0.03, 0.01, cx - W * 0.28, cy, -0.02)));
  P.add('green', T(rbox(0.05, H - 0.2, 0.03, 0.01, cx + W * 0.28, cy, -0.02)));
  // dogs: spindle through the frame, lever on the inside
  for (const [dx, dy, a] of [[-W / 2 - 0.08, H * 0.32, 0.5], [-W / 2 - 0.08, -H * 0.3, -0.5], [W / 2 + 0.08, H * 0.32, PI - 0.5], [W / 2 + 0.08, -H * 0.3, PI + 0.5], [0, H / 2 + 0.08, -PI / 2 + 0.3], [0, -H / 2 - 0.08, PI / 2 - 0.3]]) {
    const x = cx + dx, y = cy + dy;
    P.add('steel', T(zTube(0.02, 0.1, 0.014, 0.014, 10, x, y)));
    P.add('black', T(rbox(0.15, 0.028, 0.02, 0.008, x + Math.cos(a) * 0.065, y + Math.sin(a) * 0.065, 0.1, 0, 0, a)));
    P.add('black', T(rbox(0.05, 0.034, 0.03, 0.01, x + Math.cos(a) * 0.13, y + Math.sin(a) * 0.13, 0.1, 0, 0, a)));
  }
  // centre handle and the round deadlight
  P.add('steel', T(rod(V(cx + 0.22, cy - 0.12, 0.0), V(cx + 0.22, cy + 0.12, 0.0), 0.012, 8)));
  for (const s of [-1, 1]) P.add('steel', T(zTube(-0.03, 0.01, 0.014, 0.014, 8, cx + 0.22, cy + s * 0.12)));
  const py = cy + H * 0.33;
  P.add('brass', T(lathe([[0.1, 0], [0.122, 0], [0.126, 0.012], [0.12, 0.022], [0.1, 0.024]], 28).rotateX(PI / 2).translate(cx, py, -0.03)));
  const gl = new THREE.CircleGeometry(0.1, 24);
  const gu = gl.attributes.uv;
  for (let i = 0; i < gu.count; i++) gu.setXY(i, gu.getX(i) * 0.4 + 0.3, gu.getY(i) * 0.4 + 0.5);
  glass.push(T(gl.translate(cx, py, -0.04)));
  ctx.label(T(plane(0.34, 0.07, cx, cy + H * 0.12, -0.022)), placardArt(atlas, ['ЗАДРАИТЬ ПО Б/Т'], { w: 384, h: 80, bg: '#d7d0b2', ink: '#7b1f16', border: '#7b1f16', screws: false }));
}

// ---------------------------------------------------------------- the shell

export function buildShell(ctx) {
  const { P, atlas } = ctx;
  const rnd = mulberry32(1144);
  SEGMENTS.forEach((seg, si) => {
    const f = segs()[si], m = f.m, T = f.T;
    const holes = [];
    for (const w of seg.windows) holes.push({ x0: w.u - w.w / 2 - 0.02, x1: w.u + w.w / 2 + 0.02, y0: w.y0 - 0.02, y1: w.y0 + w.h + 0.02 });
    if (seg.door) holes.push({ x0: seg.door.u - seg.door.w / 2 - 0.02, x1: seg.door.u + seg.door.w / 2 + 0.02, y0: seg.door.sill, y1: seg.door.sill + seg.door.h + 0.02 });
    for (const o of seg.openings || []) holes.push({ x0: o.u - o.w / 2, x1: o.u + o.w / 2, y0: o.y0, y1: o.y0 + o.h });
    // inner face to the overhead, outer skin to the roof; the end ribs close the thickness
    wallFace(P, 'green', T, f.len, 0, CEIL + 0.04, holes, 0, 1);
    if (PLAN) {
      // on a plan the outer skins run on to the outer corners (the mitre of each turn)
      const fr = segs(), n = fr.length, turn = (p, q) => Math.acos(clamp(p.n.dot(q.n), -1, 1));
      const ext = [WALL_T * Math.tan(turn(fr[(si + n - 1) % n], f) / 2), WALL_T * Math.tan(turn(f, fr[(si + 1) % n]) / 2)];
      wallFace(P, 'hull', T, f.len, -0.05, ROOF, holes, -WALL_T, -1, 0.9, ext);
    } else wallFace(P, 'hull', T, f.len, -0.05, ROOF, holes, -WALL_T, -1, 0.9);
    if (!seg.aft) P.add('hull', T(box(f.len + 0.3, 0.06, WALL_T + 0.08, f.len / 2, ROOF - 0.03, -WALL_T / 2 + 0.02)));
    seg.windows.forEach((w, k) => windowBay(ctx, seg, f, w, si * 10 + k));
    if (seg.door) sideDoor(ctx, f, seg.door);
    // panel joints: screwed battens up the plated bulkheads, broken round the openings
    if (seg.name !== 'front') {
      for (let u = 0.55; u < f.len - 0.3; u += 1.05) {
        const near = holes.filter((h) => u > h.x0 - 0.16 && u < h.x1 + 0.16);
        const spans = [];
        let y = seg.sill && seg.sill.some(([a, b]) => u > a && u < b) ? SILL_Y + 0.02 : 0.1;
        for (const h of near.sort((p, q) => p.y0 - q.y0)) { if (h.y0 - 0.16 > y + 0.1) spans.push([y, h.y0 - 0.16]); y = Math.max(y, h.y1 + 0.16); }
        if (CEIL - 0.06 > y + 0.1) spans.push([y, CEIL - 0.06]);
        for (const [y0, y1] of spans) {
          P.add('green', T(rbox(0.05, y1 - y0, 0.012, 0.004, u, (y0 + y1) / 2, 0.006)));
          const pts = [];
          for (let yy = y0 + 0.08; yy < y1 - 0.04; yy += 0.3) pts.push(V(u, yy, 0.012));
          if (pts.length) P.add('steel', T(heads(pts, V(0, 0, 1), 0.005)));
        }
      }
    }
    // pilasters between neighbouring windows carry the heater boxes and conduit
    for (let k = 0; k < seg.windows.length - 1; k++) {
      const a = seg.windows[k], b = seg.windows[k + 1], u = (a.u + b.u) / 2, gap = b.u - a.u - a.w - (PLAN ? WINFRAME.ring + 0.02 : 0.3);
      if (gap < 0.06) continue;
      const yb = SILL_Y + 0.02, yt = a.y0 + a.h + 0.16;
      P.add('green', T(rbox(gap + 0.04, yt - yb, 0.075, 0.02, u, (yb + yt) / 2, 0.035)));
      if ((si + k) % 2 === 0) heaterBox(P, T, u, a.y0 + a.h * 0.62, 0.075, si * 7 + k);
      P.add('cream', T(zTube(0.075, 0.1, 0.012, 0.012, 8, u - 0.03, a.y0 + 0.18)));
      P.add('steel', T(pipe([V(u + 0.035, yt - 0.02, 0.085), V(u + 0.035, a.y0 + a.h * 0.7, 0.085), V(u + 0.01, a.y0 + a.h * 0.62 - 0.08, 0.1)], 0.009, 6)));
    }
    // the timber sill, its brackets, and the panelled face under it
    for (const [u0, u1] of seg.sill || []) {
      const L = u1 - u0, uc = (u0 + u1) / 2;
      const sill = rbox(L + 0.02, 0.048, SILL_D, 0.014, 0, 0, 0);
      projectUV(sill, 2.0);
      // the wood's grain runs along the sill whatever the wall's heading: UVs made in wall space
      P.add('wood', T(sill.translate(uc, SILL_Y - 0.024, SILL_D / 2)), { uv: true });
      P.add('green', T(rbox(L, 0.03, 0.05, 0.008, uc, SILL_Y - 0.065, SILL_D - 0.06)));
      // panelled face
      P.add('green', T(plane(L, SILL_Y - 0.13, uc, (SILL_Y - 0.13) / 2 + 0.08, LOWER_D)));
      P.add('darkGreen', T(rbox(L, 0.09, 0.03, 0.008, uc, 0.045, LOWER_D + 0.012)));
      P.add('rubber', T(box(L, 0.012, 0.02, uc, 0.006, LOWER_D + 0.03)));
      const nPanels = Math.max(1, Math.round(L / 0.82));
      for (let k = 0; k < nPanels; k++) {
        const pu = u0 + (k + 0.5) * (L / nPanels), pw = L / nPanels - 0.08, ph = SILL_Y - 0.32;
        P.add('green', T(rbox(pw, ph, 0.02, 0.012, pu, 0.17 + ph / 2, LOWER_D + 0.008)));
        P.add('steel', T(screwFrame(V(pu, 0.17 + ph / 2, LOWER_D + 0.019), V(1, 0, 0), V(0, 1, 0), pw - 0.05, ph - 0.05, V(0, 0, 1), 0.006, 3, 2)));
        if (k % 2 === 1) { // heater grille behind louvres
          for (let j = 0; j < 7; j++) P.add('darkGreen', T(box(pw * 0.6, 0.008, 0.016, pu, 0.3 + j * 0.035, LOWER_D + 0.02, -0.5)));
          P.add('void', T(plane(pw * 0.6, 0.25, pu, 0.4, LOWER_D + 0.011)));
        } else {
          P.add('steel', T(rbox(0.1, 0.018, 0.02, 0.006, pu, 0.17 + ph - 0.07, LOWER_D + 0.03)));
        }
      }
      // end caps close the space between the panelled face and the wall
      for (const ue of [u0, u1]) P.add('green', T(box(0.02, SILL_Y - 0.05, LOWER_D, ue, (SILL_Y - 0.05) / 2, LOWER_D / 2)));
      // cable run in the knee space shows under the sill's nose
      P.add('cable', T(xTube(u0 + 0.05, u1 - 0.05, 0.016, 0.016, 6, SILL_Y - 0.1, LOWER_D + 0.035)));
    }
    // header: cable tray and bundle under the overhead (the front carries the instrument row instead)
    if (!seg.aft && seg.name !== 'front') {
      const yT = CEIL - 0.12;
      P.add('alu', T(box(f.len - 0.3, 0.008, 0.16, f.len / 2, yT - 0.035, 0.2)));
      P.add('alu', T(box(f.len - 0.3, 0.05, 0.006, f.len / 2, yT - 0.01, 0.28)));
      for (let k = 0; k < 4; k++) P.add('cable', T(xTube(0.2, f.len - 0.2, 0.012 + (k % 2) * 0.004, 0.012 + (k % 2) * 0.004, 6, yT - 0.018 + (k >> 1) * 0.022, 0.15 + (k % 2) * 0.05)));
      for (let u = 0.4; u < f.len - 0.3; u += 0.6) {
        P.add('green', T(box(0.03, 0.12, 0.2, u, yT + 0.035, 0.11)));
        P.add('steel', T(box(0.028, 0.008, 0.18, u, yT - 0.008, 0.2)));
      }
    }
  });
  // corner posts where the walls meet (on a raked plan they lean with the corner)
  for (let i = 1; i < OUTLINE.length - 1; i++) {
    const [x, z] = OUTLINE[i], prev = segs()[i - 1].n, next = segs()[i].n;
    const bis = prev.clone().add(next).normalize();
    if (PLAN) { P.add('green', leaningPost(x, z, bis, PLAN.corner[i])); continue; }
    const g = rbox(0.34, CEIL, 0.16, 0.03, 0, CEIL / 2, 0);
    P.add('green', g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(bis.x, bis.z)).setPosition(x + bis.x * 0.06, 0, z + bis.z * 0.06)));
  }
  for (const [x, z] of [OUTLINE[0], OUTLINE[OUTLINE.length - 1]]) P.add('green', rbox(0.2, CEIL, 0.2, 0.03, x + Math.sign(-x) * 0.08, CEIL / 2, z - 0.08));
  if (PLAN) buildPlanOverhead(ctx, rnd); else buildOverhead(ctx, rnd);
  if (PLAN?.aftSkin) buildAftSkin(ctx, PLAN.aftSkin);
}

// A corner post on a raked plan: upright to the rake line, then leaning with the corner's offset.
function leaningPost(x, z, bis, off) {
  const a = Math.atan2(bis.x, bis.z), ca = Math.cos(a), sa = Math.sin(a);
  const ring = (y, k) => [[-0.17, -0.08], [0.17, -0.08], [0.17, 0.08], [-0.17, 0.08]].map(([px, pz]) =>
    V(x + bis.x * 0.06 + px * ca + pz * sa + off[0] * k, y, z + bis.z * 0.06 - px * sa + pz * ca + off[1] * k));
  const kTop = clamp((CEIL + 0.04 - PLAN.rakeFrom) / (PLAN.rakeTo - PLAN.rakeFrom), 0, 1);
  return loft([ring(0, 0), ring(PLAN.rakeFrom, 0), ring(CEIL + 0.04, kTop)], { crease: PI / 6 });
}

// The level aft of a plan's room: only an outer skin with round ports (dark behind), the side walls
// continuing the room's, chamfered after corners and the after wall (the exterior's slabs close it).
function buildAftSkin(ctx, A) {
  const { P, glass } = ctx;
  const z0 = A.z0, z1 = A.z1, xs = A.xs, c = A.cut;
  const walls = [
    { a: [xs, z0], b: [xs, z1 - c], ports: true }, { a: [xs, z1 - c], b: [xs - c, z1] }, { a: [xs - c, z1], b: [-xs + c, z1] },
    { a: [-xs + c, z1], b: [-xs, z1 - c] }, { a: [-xs, z1 - c], b: [-xs, z0], ports: true },
  ];
  for (const w of walls) {
    // the frame's inward normal points into the level; the skin's face is the plane itself
    const f = segmentFrame(w);
    const T = (g) => g.applyMatrix4(f.m);
    const ports = w.ports ? A.ports.map((pz) => Math.abs(pz - w.a[1])) : [];
    const holes = ports.map((u) => ({ x0: u - A.portR, x1: u + A.portR, y0: A.portY - A.portR, y1: A.portY + A.portR }));
    wallFace(P, 'hull', T, f.len, -0.05, ROOF, holes, 0, -1, 0.9);
    P.add('void', T(plane(f.len, ROOF, f.len / 2, ROOF / 2, 0.6)));
    for (const u of ports) {
      P.add('hull', T(rrectRing(A.portR * 2 + 0.2, A.portR * 2 + 0.2, A.portR + 0.1, A.portR * 2, A.portR * 2, A.portR - 0.001, 0.05, 0.008, 10).translate(u, A.portY, -0.03)));
      P.add('brass', T(lathe([[A.portR, 0], [A.portR + 0.025, 0], [A.portR + 0.03, 0.012], [A.portR + 0.02, 0.02]], 24).rotateX(-PI / 2).translate(u, A.portY, -0.03)));
      P.add('void', T(new THREE.CircleGeometry(A.portR, 20).translate(u, A.portY, 0.25)));
      const gl = new THREE.CircleGeometry(A.portR, 20);
      const gu = gl.attributes.uv;
      for (let i = 0; i < gu.count; i++) gu.setXY(i, gu.getX(i) * 0.4 + 0.3, gu.getY(i) * 0.4 + 0.5);
      glass.push(T(gl.rotateY(PI).translate(u, A.portY, -0.01)));
    }
  }
}

// ---------------------------------------------------------------- overhead

function buildOverhead(ctx, rnd) {
  const { P, lamps } = ctx;
  // perforated panels: 0.6 m cells, each a hair out of true
  P.add('ceiling', gridSurface(0.6, CEIL, -1, { jitter: 0.006, seed: 7 }), { uv: false });
  // backing over the panels (seen through the perforations at grazing angles) and the roof plate
  P.add('void', gridSurface(1.0, CEIL + 0.03, -1, { seed: 8 }));
  P.add('hull', gridSurface(2.0, ROOF - 0.002, 1, { seed: 9 }));
  // transverse ribs every 1.2 m and longitudinal bands
  for (let z = -4.2; z < ZA - 0.2; z += 1.2) {
    const xHalf = z < -3.0 ? 6.0 + (z + 4.42) / 1.42 * 1.75 : 7.75;
    P.add('cream', rbox(xHalf * 2 - 0.1, 0.03, 0.07, 0.01, 0, CEIL - 0.012, z));
  }
  for (const x of [-4.2, 4.2]) P.add('cream', rbox(0.06, 0.022, ZA + 4.2, 0.008, x, CEIL - 0.008, (ZA - 4.2) / 2));
  // dome lights in square bezels (as photographed), and the conduit feeding them
  const lightAt = [[-4.6, -2.2], [0, -2.2], [4.6, -2.2], [-4.6, 1.2], [0, 1.2], [4.6, 1.2]];
  for (const [x, z] of lightAt) {
    P.add('cream', rbox(0.42, 0.05, 0.42, 0.012, x, CEIL - 0.022, z));
    P.add('steel', lathe([[0.15, 0], [0.16, 0.004], [0.16, 0.02], [0.15, 0.026]], 28).translate(x, CEIL - 0.07, z));
    P.add('lamp', lathe([[0.0001, -0.075], [0.06, -0.07], [0.11, -0.05], [0.145, -0.02], [0.152, 0.0]], 28).translate(x, CEIL - 0.045, z));
    lamps.push(V(x, CEIL - 0.13, z));
  }
  const conduit = (pts) => P.add('cream', pipe(pts.map(([x, y, z]) => V(x, y, z)), 0.014, 6));
  conduit([[-7.2, CEIL - 0.04, -2.2], [-4.85, CEIL - 0.04, -2.2]]);
  conduit([[-4.35, CEIL - 0.04, -2.2], [-0.25, CEIL - 0.04, -2.2]]);
  conduit([[0.25, CEIL - 0.04, -2.2], [4.35, CEIL - 0.04, -2.2]]);
  conduit([[-4.6, CEIL - 0.04, -1.95], [-4.6, CEIL - 0.04, 0.95]]);
  conduit([[4.6, CEIL - 0.04, -1.95], [4.6, CEIL - 0.04, 0.95]]);
  for (let x = -7; x < 7.2; x += 0.6) P.add('steel', box(0.02, 0.03, 0.04, x, CEIL - 0.03, -2.2));
  // threaded hanger rods and clamps left from earlier fittings (they hang in the photographs)
  for (let i = 0; i < 9; i++) {
    const x = -6.5 + i * 1.6 + (rnd() - 0.5) * 0.5, z = -3.6 + rnd() * (ZA + 3.0), l = 0.12 + rnd() * 0.18;
    P.add('steel', yTube(CEIL - l, CEIL, 0.007, 0.007, 6, x, z));
    P.add('steel', rbox(0.05, 0.02, 0.03, 0.005, x, CEIL - l + 0.02, z));
  }
  // ventilation diffusers and the loudspeaker
  for (const [x, z] of [[-2.3, 0.2], [2.3, 0.2]]) {
    P.add('alu', lathe([[0.0001, -0.07], [0.06, -0.068], [0.12, -0.05], [0.16, -0.02], [0.18, 0]], 24).translate(x, CEIL, z));
    for (let k = 1; k < 4; k++) P.add('alu', lathe([[0.05 * k, -0.075 + k * 0.012], [0.05 * k + 0.02, -0.07 + k * 0.012]], 24).translate(x, CEIL, z));
  }
  P.add('cream', rbox(0.34, 0.24, 0.16, 0.03, -5.4, CEIL - 0.32, -3.65, 0.35, 0.5, 0));
  P.add('black', box(0.26, 0.16, 0.01, -5.37, CEIL - 0.34, -3.555, 0.35, 0.5, 0));
  // the overhead dome (lamp housing) near the aft bulkhead, as in the visit photographs
  P.add('steel', lathe([[0.0001, -0.1], [0.06, -0.095], [0.1, -0.07], [0.12, -0.03], [0.13, 0]], 20).translate(1.2, CEIL, ZA - 0.4));
}

// The overhead for a raked plan: the panels reach the leaning walls (the outline at each height),
// ribs span whatever width the plan has there, lights and fittings stand on a plan-sized grid.
const PLAN_EXTENT = [-8, 8, -6.5, 6.5];
export const planLights = () => [[-2.9, -2.9], [0, -2.9], [2.9, -2.9], [-3.6, 0.4], [0, 0.4], [3.6, 0.4], [-2.6, 3.4], [2.6, 3.4]];
function buildPlanOverhead(ctx, rnd) {
  const { P, lamps } = ctx;
  const inside = (x, z, m = 0.3) => wallDistance(x, z).d > m;
  P.add('ceiling', gridSurface(0.6, CEIL, -1, { jitter: 0.006, seed: 7, outline: outlineAt(CEIL), extent: PLAN_EXTENT }), { uv: false });
  P.add('void', gridSurface(1.0, CEIL + 0.03, -1, { seed: 8, outline: outlineAt(CEIL + 0.03), extent: PLAN_EXTENT }));
  P.add('hull', gridSurface(2.0, ROOF - 0.002, 1, { seed: 9, outline: outlineAt(ROOF), extent: PLAN_EXTENT }));
  const top = outlineAt(CEIL);
  const zMin = Math.min(...top.map((p) => p[1]));
  for (let z = zMin + 0.4; z < ZA - 0.2; z += 1.2) {
    const h = halfWidthAt(top, z);
    if (h > 0.3) P.add('cream', rbox(h * 2 - 0.1, 0.03, 0.07, 0.01, 0, CEIL - 0.012, z));
  }
  for (const x of [-3.2, 3.2]) P.add('cream', rbox(0.06, 0.022, ZA - zMin - 0.4, 0.008, x, CEIL - 0.008, (ZA + zMin) / 2 + 0.1));
  for (const [x, z] of planLights()) {
    P.add('cream', rbox(0.42, 0.05, 0.42, 0.012, x, CEIL - 0.022, z));
    P.add('steel', lathe([[0.15, 0], [0.16, 0.004], [0.16, 0.02], [0.15, 0.026]], 28).translate(x, CEIL - 0.07, z));
    P.add('lamp', lathe([[0.0001, -0.075], [0.06, -0.07], [0.11, -0.05], [0.145, -0.02], [0.152, 0.0]], 28).translate(x, CEIL - 0.045, z));
    lamps.push(V(x, CEIL - 0.13, z));
  }
  // conduit along the light rows, with saddles
  const conduit = (pts) => P.add('cream', pipe(pts.map(([x, y, z]) => V(x, y, z)), 0.014, 6));
  for (const z of [-2.9, 0.4]) {
    const h = halfWidthAt(top, z) - 0.25;
    conduit([[-h, CEIL - 0.04, z], [h, CEIL - 0.04, z]]);
    for (let x = -h + 0.3; x < h; x += 0.6) P.add('steel', box(0.02, 0.03, 0.04, x, CEIL - 0.03, z));
  }
  conduit([[0, CEIL - 0.04, -2.65], [0, CEIL - 0.04, 0.15]]);
  // hanger rods, diffusers, the loudspeaker on the port chamfer side and the overhead dome
  for (let i = 0; i < 10; i++) {
    const x = -5.8 + i * 1.3 + (rnd() - 0.5) * 0.5, z = -4.0 + rnd() * (ZA + 3.6), l = 0.1 + rnd() * 0.14;
    if (!inside(x, z)) continue;
    P.add('steel', yTube(CEIL - l, CEIL, 0.007, 0.007, 6, x, z));
    P.add('steel', rbox(0.05, 0.02, 0.03, 0.005, x, CEIL - l + 0.02, z));
  }
  for (const [x, z] of [[-1.8, 1.9], [1.8, 1.9]]) {
    P.add('alu', lathe([[0.0001, -0.07], [0.06, -0.068], [0.12, -0.05], [0.16, -0.02], [0.18, 0]], 24).translate(x, CEIL, z));
    for (let k = 1; k < 4; k++) P.add('alu', lathe([[0.05 * k, -0.075 + k * 0.012], [0.05 * k + 0.02, -0.07 + k * 0.012]], 24).translate(x, CEIL, z));
  }
  P.add('cream', rbox(0.34, 0.24, 0.16, 0.03, -4.9, CEIL - 0.3, -1.9, 0.35, 0.75, 0));
  P.add('black', box(0.26, 0.16, 0.01, -4.84, CEIL - 0.32, -1.83, 0.35, 0.75, 0));
  P.add('steel', lathe([[0.0001, -0.1], [0.06, -0.095], [0.1, -0.07], [0.12, -0.03], [0.13, 0]], 20).translate(1.2, CEIL, ZA - 0.4));
}

// ---------------------------------------------------------------- the deck

// The deck as its own mesh: room-mapped linoleum (UV over the whole room) and a tiling grain on uv1.
export function buildDeck(material) {
  const g = PLAN
    ? gridSurface(0.35, 0, 1, { uvFn: (x, z) => [(x + 8) / 16, 1 - (z + 5) / 10], extent: PLAN_EXTENT })
    : gridSurface(0.35, 0, 1, { uvFn: (x, z) => [(x + 8) / 16, 1 - (z + 5) / 10] });
  const pos = g.attributes.position, n = pos.count;
  const uv1 = new Float32Array(n * 2), col = new Float32Array(n * 3), ah = new Float32Array(n), ae = new Float32Array(n);
  const p = V(), up = V(0, 1, 0);
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    uv1[i * 2] = p.x / 0.6;
    uv1[i * 2 + 1] = p.z / 0.6;
    const k = roomOcclusion(p, up);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aH', new THREE.BufferAttribute(ah, 1));
  g.setAttribute('aEdge', new THREE.BufferAttribute(ae, 1));
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'bridge:deck';
  mesh.receiveShadow = true;
  // coving strip (aluminium) along every bulkhead foot
  return mesh;
}
