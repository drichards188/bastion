import * as THREE from 'three';
import { V, box, bar, rod, topProfile, chamferRect, ringAt, loft, mulberry32, projectUV } from '../exterior/kit.js';
import { rail, door, windowRow, louvre, locker, lifeRing } from '../exterior/fittings.js';
import { wallsOf, wallPoint } from '../exterior/walls.js';
import { clutterWall } from '../exterior/clutter.js';

// Deckhouse helpers for Slava's superstructure, the same construction as Kirov's (src/models/
// exterior/superstructure.js): lofted chamfered-plan houses with a darker foot, light grey roofs
// with a coaming, dressed walls (doors, windows, louvres, pipes, lockers), open platforms with
// rails, and a registry of walls for the clutter pass (weld seams, cable trays, boxes, grime).
// Roofs take the light grey 'roof' paint (o.roofKey overrides it).

export const WALLS = [];
const _c = new THREE.Color();
let shadeRnd = mulberry32(31);
export function resetHouses(seed = 31) { WALLS.length = 0; shadeRnd = mulberry32(seed); }

// Plans in chamferRect's winding (negative shoelace area in x, z), so every wall's (u, up, n) basis
// is right-handed and wall fittings face outward. `pair` is reversed in step when given.
export function ccw(plan, pair = null) {
  let a = 0;
  for (let i = 0; i < plan.length; i++) { const [x0, z0] = plan[i], [x1, z1] = plan[(i + 1) % plan.length]; a += x0 * z1 - x1 * z0; }
  if (a <= 0) return pair ? [plan, pair] : plan;
  return pair ? [plan.slice().reverse(), pair.slice().reverse()] : plan.slice().reverse();
}

// Walls of a deckhouse on a chamfered-rectangle plan (or a given plan polygon) from y0 to y1,
// leaning in by `lean` (x) and leanFront / leanAft (z) at the top; a non-skid roof with a coaming.
export function house(P, o) {
  const { x0, x1, z0, z1, y0, y1, c = 0.9, lean = 0, leanZ = 0, roof = true, tint = 0xffffff, key = 'paint', clutter = true, heavy = false, coaming = true } = o;
  const base0 = o.plan || chamferRect(x0, x1, z0, z1, c);
  const top0 = o.topPlan || (o.plan ? o.plan.map(([x, z]) => [x - Math.sign(x) * lean, z]) : chamferRect(x0 + lean, x1 - lean, z0 + (o.leanFront ?? leanZ), z1 - (o.leanAft ?? leanZ), c));
  const [base, top] = ccw(base0, top0);
  const yk = Math.min(y0 + 0.9, y0 + (y1 - y0) * 0.4), k = (yk - y0) / (y1 - y0);
  const mid = base.map(([x, z], i) => [x + (top[i][0] - x) * k, z + (top[i][1] - z) * k]);
  _c.set(tint).multiplyScalar(0.975 + shadeRnd() * 0.04);
  P.add(key, loft([ringAt(base, y0), ringAt(mid, yk), ringAt(top, y1)], { top: false, bottom: false }), { tint: _c.getHex(), shade: (x, y) => (y < y0 + 0.02 ? 0.7 : 1) });
  if (roof) {
    P.add(o.roofKey || 'roof', topProfile(top, y1 - 0.06, y1 + 0.02));
    if (coaming) {
      const cx = (Math.min(...top.map((p) => p[0])) + Math.max(...top.map((p) => p[0]))) / 2;
      const out = top.map(([x, z]) => [x + Math.sign(x - cx) * 0.03, z]);
      P.add(key, loft([ringAt(out, y1 - 0.04), ringAt(out, y1 + 0.14)], { top: false, bottom: false }), { tint: 0xe9ecec, tier: 1 });
    }
  }
  const cx = (Math.min(...base.map((p) => p[0])) + Math.max(...base.map((p) => p[0]))) / 2;
  const cz = (Math.min(...base.map((p) => p[1])) + Math.max(...base.map((p) => p[1]))) / 2;
  const walls = wallsOf(base, top, y0, y1, cx, cz);
  if (clutter) for (const w of walls) WALLS.push({ wall: w, heavy, high: y1 > 17, doors: true });
  return { walls, top, base };
}

// Dress a wall with doors, windows, louvres, pipes and lockers, deterministic per seed.
export function dress(P, w, rnd, o = {}) {
  const h = w.y1 - w.y0;
  if (w.len < 1.6 || h < 1.8) return;
  const { windows = false, round = false, doors = true, vents = true, lockers = true, pipes = true, rings = false, winY = 0.62, winW, winH } = o;
  if (windows && w.len > 3) {
    const n = Math.max(1, Math.floor((w.len - 1.2) / (round ? 1.6 : 2.2)));
    const a = wallPoint(w, 0.12, 0), b = wallPoint(w, 0.88, 0);
    windowRow(P, a, b, w.y0 + h * winY, n, w.u, w.n, { round, w: winW ?? (round ? 0.42 : 0.8), h: winH ?? 0.55 });
  }
  if (doors && w.len > 3.5 && rnd() < 0.75) {
    const t = 0.18 + rnd() * 0.64;
    door(P, wallPoint(w, t, w.y0 + 0.08, 0.0), w.u, w.n);
    if (rings && rnd() < 0.5) lifeRing(P, wallPoint(w, Math.min(0.95, t + 0.14), w.y0 + 1.35), w.u, w.n);
  }
  if (vents && w.len > 2.5 && rnd() < 0.6) louvre(P, wallPoint(w, 0.1 + rnd() * 0.8, w.y0 + h * (windows ? 0.3 : 0.55)), w.u, w.n, { w: 0.7 + rnd() * 0.6, h: 0.5 + rnd() * 0.4 });
  if (pipes && w.len > 3) {
    const t = rnd();
    P.add('paint', rod(wallPoint(w, t, w.y0 + 0.1, 0.12), wallPoint(w, t, w.y1 - 0.2, 0.12), 0.06, 6), { tier: 2 });
    P.add('dark', bar(wallPoint(w, 0.04, w.y1 - 0.35, 0.1), wallPoint(w, 0.96, w.y1 - 0.35, 0.1), 0.08, 0.06), { tier: 2 });
  }
  if (lockers && w.len > 3 && rnd() < 0.45) {
    const p = wallPoint(w, 0.15 + rnd() * 0.7, w.y0, 0.38);
    locker(P, p.x, w.y0, p.z, 0.8 + rnd() * 0.6, 0.6 + rnd() * 0.5, 0.55, Math.atan2(w.u.x, w.u.z) - Math.PI / 2);
  }
}

// Open platform (grating deck with toe board and rail) on brackets.
export function platform(P, x0, x1, z0, z1, y, { railSides = 'nesw', brackets = true, tier = 0, depth = 0.25, toward = null } = {}) {
  P.add('dark', box(x1 - x0, 0.08, z1 - z0, (x0 + x1) / 2, y - 0.04, (z0 + z1) / 2), { tier, tint: 0xb0b6b8 });
  P.add('paint', box(x1 - x0, depth, z1 - z0, (x0 + x1) / 2, y - 0.08 - depth / 2, (z0 + z1) / 2), { tier });
  const runs = { n: [[x0, z0], [x1, z0]], e: [[x1, z0], [x1, z1]], s: [[x1, z1], [x0, z1]], w: [[x0, z1], [x0, z0]] };
  for (const s of railSides) rail(P, runs[s], y);
  if (brackets) {
    const tx = toward ?? 0;
    for (const x of [x0 + 0.3, x1 - 0.3]) for (const z of [z0 + 0.3, z1 - 0.3]) P.add('paint', bar(V(x, y - 0.3, z), V(x + (tx - x) * 0.3, y - 1.8, z), 0.12), { tier: 1 });
  }
}

// Rail along the roof edge of a house (all edges, or those not skipped by `skip([x, z])`).
export function roofRail(P, H, y, { skip = () => false } = {}) {
  const t = H.top;
  for (let i = 0; i < t.length; i++) {
    const a = t[i], b = t[(i + 1) % t.length];
    if (skip([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) continue;
    rail(P, [[a[0] * 0.995, a[1]], [b[0] * 0.995, b[1]]], y + 0.1);
  }
}

// Clutter every wall registered since resetHouses().
export function clutterAll(P, seed = 4466) {
  const r = mulberry32(seed);
  for (const { wall, heavy, high, doors } of WALLS) clutterWall(P, wall, r, { heavy, high, doors });
}

// A geometry with metric box-projected UVs, for material keys the Parts collector does not project.
export function projected(g, scale = 4) {
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.attributes.normal) n.computeVertexNormals();
  projectUV(n, scale);
  return n;
}
