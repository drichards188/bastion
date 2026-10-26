import * as THREE from 'three';
import { V, box, bar, rod, xf, yTube, zTube, xTube, topProfile, chamferRect, ringAt, loft, mergeAll, mulberry32, sphere, hRing } from './kit.js';
import { rail, ladder, vLadder, door, windowRow, louvre, mushroom, gooseneck, locker, lifeRing, liferaftRack, boat, crane, whip, onWall } from './fittings.js';
import { deckHeightAt, deckHalfBeamAt, LAYOUT } from './lines.js';
import { wallsOf, wallPoint } from './walls.js';
import { clutterWall, platformUnderside } from './clutter.js';
import { motorLaunch, workBoat, boatCradle, boatCrane } from './boats.js';

// Kirov's superstructure: the stepped forward block with the navigation bridge, the pyramidal forward
// tower (mast and uptake in one, with the separate aft uptake trunk), the boat bays amidships, and
// the aft block with its tower and director houses. Plan and heights from the 1983 port-beam and
// port-amidships frames [P] (z ranges and heights), widths from the 1985 foredeck and 1986 stern
// photographs and the 1989 colour frames [E where only one side is seen].
// The walk-in bridge (separate module) fills BRIDGE_BOX; nothing here intrudes into it.

// The bridge room's envelope (local x +-7.9, y -0.05..2.6, z -4.95..2.9 at BRIDGE_ANCHOR
// (0, 20.5, -12.55)): the room carries its own outer skin and roof; the exterior closes round it.
export const BRIDGE_BOX = { x0: -7.95, x1: 7.95, y0: 20.45, y1: 23.1, z0: -17.55, z1: -9.6 };

// ---------------------------------------------------------------- deckhouse helper

// Every wall built in this pass, for the clutter pass at the end: { wall, heavy, high, doors }.
const WALLS = [];
const _c = new THREE.Color();
let shadeRnd = mulberry32(31);

// Walls of a deckhouse on a chamfered-rectangle plan from y0 to y1, leaning in by `lean` (x) and
// `leanZ` at the top; a red-brown roof deck with a coaming; returns the walls for dressing.
// The walls get a third ring 0.9 m up so the base can be shaded darker (contact shadow where the
// wall meets the deck), and each house a slightly different shade of the same paint.
function house(P, o) {
  const { x0, x1, z0, z1, y0, y1, c = 0.9, lean = 0, leanZ = 0, roof = true, tint = 0xffffff, key = 'paint', clutter = true, heavy = false } = o;
  const base = chamferRect(x0, x1, z0, z1, c);
  const top = chamferRect(x0 + lean, x1 - lean, z0 + (o.leanFront ?? leanZ), z1 - (o.leanAft ?? leanZ), c);
  const yk = Math.min(y0 + 0.9, y0 + (y1 - y0) * 0.4), k = (yk - y0) / (y1 - y0);
  const mid = base.map(([x, z], i) => [x + (top[i][0] - x) * k, z + (top[i][1] - z) * k]);
  _c.set(tint).multiplyScalar(0.975 + shadeRnd() * 0.04);
  P.add(key, loft([ringAt(base, y0), ringAt(mid, yk), ringAt(top, y1)], { top: false, bottom: false }), { tint: _c.getHex(), shade: (x, y) => (y < y0 + 0.02 ? 0.7 : 1) });
  if (roof) {
    P.add('deck', topProfile(top, y1 - 0.06, y1 + 0.02));
    // coaming round the roof edge
    const out = top.map(([x, z]) => [x + Math.sign(x) * 0.03, z]);
    P.add(key, loft([ringAt(out, y1 - 0.04), ringAt(out, y1 + 0.14)], { top: false, bottom: false }), { tint: 0xe9ecec, tier: 1 });
  }
  const walls = wallsOf(base, top, y0, y1, (x0 + x1) / 2, (z0 + z1) / 2);
  if (clutter) for (const w of walls) WALLS.push({ wall: w, heavy, high: y1 > 19, doors: true });
  return { walls, top, base };
}

// Dress a wall with doors, windows, louvres, pipes and lockers, deterministic per seed.
function dress(P, w, rnd, o = {}) {
  const h = w.y1 - w.y0;
  if (w.len < 1.6 || h < 1.8) return;
  const { windows = false, round = false, doors = true, vents = true, lockers = true, pipes = true, rings = false } = o;
  // windows: a row high on the wall
  if (windows && w.len > 4) {
    const n = Math.max(1, Math.floor((w.len - 1.5) / (round ? 1.6 : 2.4)));
    const a = wallPoint(w, 0.12, 0), b = wallPoint(w, 0.88, 0);
    windowRow(P, a, b, w.y0 + h * 0.62, n, w.u, w.n, { round, w: round ? 0.42 : 0.85, h: 0.6 });
  }
  // doors at deck level on longer walls
  if (doors && w.len > 3.5 && rnd() < 0.75) {
    const t = 0.18 + rnd() * 0.64;
    door(P, wallPoint(w, t, w.y0 + 0.08, 0.0), w.u, w.n);
    if (rings && rnd() < 0.5) lifeRing(P, wallPoint(w, Math.min(0.95, t + 0.14), w.y0 + 1.35), w.u, w.n);
  }
  if (vents && w.len > 2.5 && rnd() < 0.6) {
    louvre(P, wallPoint(w, 0.1 + rnd() * 0.8, w.y0 + h * (windows ? 0.3 : 0.55)), w.u, w.n, { w: 0.7 + rnd() * 0.6, h: 0.5 + rnd() * 0.4 });
  }
  // a vertical down-pipe and a cable tray under the roof edge
  if (pipes && w.len > 3) {
    const t = rnd();
    const p0 = wallPoint(w, t, w.y0 + 0.1, 0.12), p1 = wallPoint(w, t, w.y1 - 0.2, 0.12);
    P.add('paint', rod(p0, p1, 0.06, 6), { tier: 2 });
    const c0 = wallPoint(w, 0.04, w.y1 - 0.35, 0.1), c1 = wallPoint(w, 0.96, w.y1 - 0.35, 0.1);
    P.add('dark', bar(c0, c1, 0.08, 0.06), { tier: 2 });
  }
  if (lockers && w.len > 3 && rnd() < 0.45) {
    const p = wallPoint(w, 0.15 + rnd() * 0.7, w.y0, 0.38);
    locker(P, p.x, w.y0, p.z, 0.8 + rnd() * 0.6, 0.6 + rnd() * 0.5, 0.55, Math.atan2(w.u.x, w.u.z) - Math.PI / 2);
  }
}

// Open platform (grating deck with toe board and rail) on brackets.
function platform(P, x0, x1, z0, z1, y, { railSides = 'nesw', brackets = true, tier = 0, depth = 0.25 } = {}) {
  P.add('dark', box(x1 - x0, 0.08, z1 - z0, (x0 + x1) / 2, y - 0.04, (z0 + z1) / 2), { tier, tint: 0xb0b6b8 });
  P.add('paint', box(x1 - x0, depth, z1 - z0, (x0 + x1) / 2, y - 0.08 - depth / 2, (z0 + z1) / 2), { tier });
  const runs = { n: [[x0, z0], [x1, z0]], e: [[x1, z0], [x1, z1]], s: [[x1, z1], [x0, z1]], w: [[x0, z1], [x0, z0]] };
  for (const s of railSides) rail(P, runs[s], y);
  if (brackets) {
    for (const x of [x0 + 0.3, x1 - 0.3]) for (const z of [z0 + 0.3, z1 - 0.3]) {
      P.add('paint', bar(V(x, y - 0.3, z), V(x * 0.7, y - 1.8, z), 0.12), { tier: 1 });
    }
  }
}

// Rail along the roof edge of a house (all edges, or those facing away from `skip` normals).
function roofRail(P, H, y, { skip = () => false } = {}) {
  const t = H.top;
  for (let i = 0; i < t.length; i++) {
    const a = t[i], b = t[(i + 1) % t.length];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (skip(mid)) continue;
    rail(P, [[a[0] * 0.995, a[1]], [b[0] * 0.995, b[1]]], y + 0.1);
  }
}

// ---------------------------------------------------------------- build

export function buildSuperstructure(P, M) {
  const rnd = mulberry32(19851030);
  WALLS.length = 0;
  shadeRnd = mulberry32(31);
  const D = deckHeightAt;
  const L = LAYOUT;
  const parts = { sockets: {} };

  // ===================================== forward block
  // 01 level: full-width deckhouse with the oval-cut side screens [P: 9.3 to 12.9 m, from z -34]
  const t1 = house(P, { x0: -12.7, x1: 12.7, z0: L.superFront, z1: 5.0, y0: D(-20) - 0.05, y1: L.level01, c: 2.6, leanFront: 0.9, leanAft: 0, tint: 0xf2f4f4 });
  for (const w of t1.walls) {
    const side = Math.abs(w.n.x) > 0.9;
    if (side) {
      // the long side screens with big oval openings and doors behind (1983 port-amidships frame)
      const n = 11;
      for (let i = 0; i < n; i++) {
        const t = 0.06 + (i / (n - 1)) * 0.46;
        const c = wallPoint(w, w.n.x > 0 ? 1 - t : t, w.y0 + 2.15, 0.03);
        onWall(P, 'glass', new THREE.CircleGeometry(0.5, 14).applyMatrix4(xf(0, 0, 0, 0, 0, 0, V(1.0, 0.62, 1))), c, w.u, w.n, { tier: 1 });
        onWall(P, 'paint', new THREE.TorusGeometry(0.5, 0.05, 3, 14).applyMatrix4(xf(0, 0, 0.02, 0, 0, 0, V(1.0, 0.62, 1))), c, w.u, w.n, { tier: 2 });
      }
      dress(P, w, rnd, { doors: true, windows: false, vents: true, rings: true });
    } else dress(P, w, rnd, { windows: true, round: true });
  }
  // 02 level
  // 02 level: full width aft of z -22.8, narrowed forward of it so the Osa bays at the 01-level
  // corners (MOUNTS.osa, +-9.6 at z -27) stand in open recesses with 3.5 m clear round them for
  // the launcher's rise and train (1985 foredeck photograph: the bays sit in the corners).
  const t2 = house(P, { x0: -10.8, x1: 10.8, z0: -22.8, z1: 4.0, y0: L.level01, y1: L.level02, c: 1.2, lean: 0.15, tint: 0xeef1f1 });
  for (const w of t2.walls) dress(P, w, rnd, { windows: Math.abs(w.n.z) > 0.9 || rnd() < 0.5 });
  const t2f = house(P, { x0: -6.1, x1: 6.1, z0: -31.0, z1: -22.6, y0: L.level01, y1: L.level02, c: 1.4, lean: 0.12, leanFront: 0.8, leanAft: 0, tint: 0xeef1f1 });
  for (const w of t2f.walls) dress(P, w, rnd, { windows: true, lockers: false });
  // 03 level: only the after part, just ahead of the bridge face, so the sight line from the
  // bridge windows down to the Granit and Fort hatches stays clear (the bridge-view limit:
  // y < 22.25 - 0.36 x distance ahead of the eye at z about -15)
  const t3 = house(P, { x0: -8.6, x1: 8.6, z0: -22.4, z1: 4.0, y0: L.level02, y1: L.level03, c: 1.4, lean: 0.12, leanFront: 0.6, leanAft: 0, tint: 0xf4f6f6 });
  for (const w of t3.walls) dress(P, w, rnd, { windows: rnd() < 0.6 });
  // forward director pedestals on the 02-level roof at the sides, for the two 4R33 (Osa)
  // directors [P: directors at z -33 to -27 in the 1983 frame; identity estimated]
  for (const s of [-1, 1]) {
    const x = s * 6.0, z = -30.5;
    // pedestal 2.2 x 2.0 m, overhanging the narrowed 02 level on brackets, kept 3.5 m from the bay
    P.add('paint', box(2.2, 1.15, 2.0, x, L.level02 + 0.575, z), { tint: 0xe8ecec });
    P.add('deck', box(2.2, 0.04, 2.0, x, L.level02 + 1.17, z));
    for (const dz of [-0.8, 0.8]) P.add('paint', bar(V(x + s * 1.0, L.level02 - 0.05, z + dz), V(s * 6.0, L.level02 - 1.3, z + dz), 0.12), { tier: 1 });
    rail(P, [[x - 1.1, z - 1.0], [x + 1.1, z - 1.0], [x + 1.1, z + 1.0], [x - 1.1, z + 1.0]], L.level02 + 1.15, { h: 0.9 });
    ladder(P, V(x - s * 2.6, L.level02, z + 0.6), V(x - s * 1.1, L.level02 + 1.15, z + 0.6));
    parts.sockets['osaDirector' + (s < 0 ? 'Port' : 'Stbd')] = V(x, L.level02 + 1.15, z);
  }
  // 04 level below the bridge [P: block face continuous from 15.6 m to the 24.6 m roof at z -17.5]
  const t4 = house(P, { x0: -8.6, x1: 8.6, z0: -18.6, z1: 4.0, y0: L.level03, y1: BRIDGE_BOX.y0 - 0.02, c: 1.0, leanFront: 0.5, leanAft: 0, tint: 0xf0f2f2, roof: false });
  for (const w of t4.walls) dress(P, w, rnd, { windows: true, doors: Math.abs(w.n.x) > 0.9 });
  // bridge deck slab (under the walk-in room) and the wings at the bridge level
  P.add('deck', box(17.2, 0.12, 22, 0, BRIDGE_BOX.y0 - 0.06, -7.0));
  // the block round and behind the room: walls aft of the room and the roof slab above it
  house(P, { x0: -8.1, x1: 8.1, z0: BRIDGE_BOX.z1 + 0.02, z1: 4.0, y0: BRIDGE_BOX.y0, y1: L.bridgeRoof, c: 0.8, tint: 0xf3f5f5, roof: false });
  P.add('deck', topProfile(chamferRect(-8.15, 8.15, -17.65, 4.0, 0.7), BRIDGE_BOX.y1 + 0.02, L.bridgeRoof));
  P.add('paint', loft([ringAt(chamferRect(-8.2, 8.2, -17.7, 4.05, 0.7), BRIDGE_BOX.y1), ringAt(chamferRect(-8.2, 8.2, -17.7, 4.05, 0.7), L.bridgeRoof + 0.18)], { top: false, bottom: false }), { tint: 0xe6eaea });
  // bridge wings: open platforms with spray screens, meeting the room's side doors (local z -1.6)
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -12.0 : 7.95, x1 = s < 0 ? -7.95 : 12.0;
    P.add('deck', box(x1 - x0, 0.12, 6.8, (x0 + x1) / 2, BRIDGE_BOX.y0 - 0.06, -14.4));
    P.add('paint', box(x1 - x0, 0.45, 6.8, (x0 + x1) / 2, BRIDGE_BOX.y0 - 0.35, -14.4), { tint: 0xe4e8e8 });
    // spray screen (solid bulwark) round the outer end, rail on top
    const xo = s * 12.0;
    P.add('paint', box(0.1, 1.05, 6.8, xo, BRIDGE_BOX.y0 + 0.52, -14.4), { tint: 0xeef0f0 });
    P.add('paint', box(x1 - x0, 1.05, 0.1, (x0 + x1) / 2, BRIDGE_BOX.y0 + 0.52, -17.8), { tint: 0xeef0f0 });
    P.add('paint', rod(V(xo, BRIDGE_BOX.y0 + 1.1, -17.8), V(xo, BRIDGE_BOX.y0 + 1.1, -11.0), 0.05, 6), { tier: 1 });
    rail(P, [[xo, -11.0], [s * 8.6, -11.0]], BRIDGE_BOX.y0);
    // brackets under the wing
    for (const z of [-17.3, -11.5]) P.add('paint', bar(V(s * 11.6, BRIDGE_BOX.y0 - 0.5, z), V(s * 8.7, BRIDGE_BOX.y0 - 2.6, z), 0.16), { tier: 0 });
    // pelorus / sight stand and searchlight on the wing
    P.add('dark', yTube(BRIDGE_BOX.y0, BRIDGE_BOX.y0 + 1.1, 0.12, 0.12, 8, s * 11.0, -16.8), { tier: 1 });
    P.add('dark', sphere(0.2, s * 11.0, BRIDGE_BOX.y0 + 1.25, -16.8, 1, 0.7, 1, 10), { tier: 1 });
    P.add('dark', yTube(BRIDGE_BOX.y0, BRIDGE_BOX.y0 + 0.9, 0.15, 0.15, 8, s * 11.4, -12.0), { tier: 1 });
    P.add('steel', zTube(-12.4, -11.6, 0.36, 0.32, 14, s * 11.4, BRIDGE_BOX.y0 + 1.25), { tier: 1, tint: 0x9aa2a4 });
    P.add('glass', new THREE.CircleGeometry(0.31, 14).applyMatrix4(xf(s * 11.4, BRIDGE_BOX.y0 + 1.25, -12.41, 0, Math.PI)), { tier: 1 });
    parts.sockets['bridgeWing' + (s < 0 ? 'Port' : 'Stbd')] = V(s * 10.6, BRIDGE_BOX.y0, -15.6);
  }
  // exterior face of the bridge front: window frames and visors above the room's own glazing
  {
    const zf = BRIDGE_BOX.z0 - 0.05;
    P.add('paint', box(16.4, 0.12, 0.9, 0, BRIDGE_BOX.y1 + 0.05, zf - 0.35), { tint: 0xe2e6e6 }); // sun visor ledge
    for (let i = 0; i <= 10; i++) {
      const x = -7.9 + i * 1.58;
      P.add('paint', bar(V(x, BRIDGE_BOX.y1 + 0.05, zf - 0.6), V(x, BRIDGE_BOX.y1 - 0.15, zf - 0.05), 0.05, 0.05), { tier: 2 });
    }
    // wipers' motor boxes over every second window
    for (let i = 0; i < 10; i += 2) P.add('dark', box(0.3, 0.16, 0.12, -7.1 + i * 1.58, BRIDGE_BOX.y1 - 0.2, zf - 0.08), { tier: 2 });
  }
  // 03-level open deck between the director platform and the bridge face: the DF pole mast [P z -24]
  {
    // the profile photograph cannot show its x: placed to port, clear of the bridge's centre view
    // it stands on the 02-level roof just ahead of the 03 level
    const z = -24.6, y = L.level02, px = -5.0;
    P.add('paint', yTube(y, y + 1.6, 0.3, 0.26, 10, px, z));
    P.add('steel', yTube(y + 1.6, 25.3, 0.1, 0.06, 8, px, z), { tier: 1 });
    P.add('steel', new THREE.TorusGeometry(0.55, 0.03, 4, 16).applyMatrix4(xf(px, 25.6, z, 0, Math.PI / 2)), { tier: 1 });
    P.add('steel', new THREE.TorusGeometry(0.55, 0.03, 4, 16).applyMatrix4(xf(px, 25.6, z)), { tier: 1 });
    // liferaft racks on the 03 deck sides
    for (const s of [-1, 1]) liferaftRack(P, V(s * 7.2, y, -20.6), 0, 2, 3);
    rail(P, [[-8.4, -21.8], [8.4, -21.8]], y);
    for (const s of [-1, 1]) rail(P, [[s * 6.25, -22.7], [s * 10.6, -22.7]], L.level02 + 0.1);
  }
  // 01- and 02-level roof rails, liferaft racks and vents on the open decks
  roofRail(P, t1, L.level01, { skip: ([x, z]) => Math.abs(x) < 10.5 && z > -31.5 });
  roofRail(P, t2, L.level02, { skip: ([x, z]) => Math.abs(x) < 8.4 && z > -24.5 });
  roofRail(P, t2f, L.level02, { skip: ([x, z]) => z > -23 });
  for (const s of [-1, 1]) {
    for (const z of [-20.0, -14]) liferaftRack(P, V(s * 11.6, L.level01, z), 0, 2, 3);
    for (const z of [-20.5, -11, -3]) mushroom(P, s * 9.8, L.level02, z, 0.32, 0.8);
    gooseneck(P, s * 11.9, L.level01, -6, 0.12, 0.75, s > 0 ? 0 : Math.PI);
    // inclined ladders between the levels
    ladder(P, V(s * 11.5, L.level01, -1.0), V(s * 9.9, L.level02, 1.6));
    ladder(P, V(s * 10.3, L.level02, -15.0), V(s * 8.5, L.level03, -15.0));
  }

  // ===================================== forward tower: mast and uptake in one pyramid
  {
    const T = L.towerFwd;
    const r0 = chamferRect(-7.4, 7.4, 3.6, T.z1, 1.6);
    const r1 = chamferRect(-4.7, 4.7, 5.4, 15.9, 1.0);
    P.add('paint', loft([ringAt(r0, T.base), ringAt(r1, T.top)], { top: false, bottom: false }), { tint: 0xf1f3f3 });
    for (const w of wallsOf(r0, r1, T.base, T.top, 0, 9.9)) if (w.n.z < 0.5) WALLS.push({ wall: w, heavy: true, high: true, doors: false });
    // upper section: narrower, the front chamfering back under the cap [P]
    const r2 = chamferRect(-3.9, 3.9, 7.4, 15.4, 0.9);
    // the upper section stands in the cap's shadow and the uptake's soot: darker toward the top [P]
    P.add('paint', loft([ringAt(r1, T.top), ringAt(r2, T.capY - 0.45)], { top: false, bottom: false }), { tint: 0xeef1f1, shade: (x, y) => (y > T.top + 1 ? 0.62 : 1) });
    for (const w of wallsOf(r1, r2, T.top, T.capY - 0.45, 0, 10.6)) if (w.n.z < 0.5) WALLS.push({ wall: w, heavy: true, high: true, doors: false });
    // the cap: a light platform (not a slab) on brackets, with its overhang fore and aft
    // [P: z 3.2 to 21.2 at about 37.5 m]
    const cap = chamferRect(-5.6, 5.6, T.capZ0, T.capZ1, 1.6);
    P.add('paint', topProfile(cap, T.capY - 0.45, T.capY - 0.06), { tint: 0xe5e9e9, shade: (x, y) => (y < T.capY - 0.3 ? 0.55 : 1) });
    P.add('deck', topProfile(chamferRect(-5.5, 5.5, T.capZ0 + 0.1, T.capZ1 - 0.1, 1.5), T.capY - 0.06, T.capY));
    P.add('paint', topProfile(r2, T.capY - 0.06, T.capY + 0.35), { tint: 0xdfe3e3 }); // the tower's head through the platform
    roofRail(P, { top: cap }, T.capY);
    for (const s of [-1, 1]) for (const z of [4.0, 6.5, 16.5, 19.5]) P.add('paint', bar(V(s * 5.0, T.capY - 0.5, z), V(s * 3.7, T.capY - 2.6, Math.min(Math.max(z, 8.0), 15.0)), 0.14), { tier: 1 });
    for (const s of [-1, 1]) for (const z of [4.6, 19.0]) P.add('paint', bar(V(s * 5.2, T.capY - 0.5, z), V(s * 3.9, T.capY - 0.5, Math.min(Math.max(z, 8.0), 15.0)), 0.18), { tier: 0 });
    // ribbed drums at both ends of the cap [P: 37.9 to 39.0 m]
    for (const z of [5.6, 16.3]) {
      P.add('paint', yTube(T.capY, T.capY + 1.15, 1.15, 1.15, 20, 0, z), { tint: 0xe9ecec });
      for (let k = 0; k < 6; k++) P.add('paint', hRing(1.18, 0.045, 0, T.capY + 0.12 + k * 0.18, z, 22), { tier: 1, tint: 0xd8dcdc });
      P.add('paint', yTube(T.capY + 1.15, T.capY + 1.3, 0.9, 0.6, 16, 0, z), { tier: 1 });
    }
    // walk-round catwalks on the tower faces at about 25 m and 31.5 m (1985 bow photograph)
    for (const y of [25.2, T.top]) {
      const k = (y - T.base) / (T.top - T.base);
      const hx = 7.4 + (4.7 - 7.4) * k + 1.3, z0 = 3.6 + (5.4 - 3.6) * k - 1.2, z1 = T.z1 + 0.2;
      for (const s of [-1, 1]) platform(P, s < 0 ? -hx : hx - 1.3, s < 0 ? -hx + 1.3 : hx, z0 + 1.2, z1, y, { railSides: s < 0 ? 'w' : 'e', brackets: true, tier: 0, depth: 0.18 });
      platform(P, -hx + 1.3, hx - 1.3, z0, z0 + 1.2, y, { railSides: 'n', brackets: false, tier: 0, depth: 0.18 });
    }
    // tower face detail: doors at the catwalks, louvres, ladders up the side
    const faces = [
      { A: V(-7.4, T.base, 3.6 + 1.6), B: V(-4.7, T.top, 5.4 + 1.0), n: V(-1, 0.16, 0) },
    ];
    void faces;
    for (const s of [-1, 1]) {
      vLadder(P, s * 5.2, 17.2, 25.2, T.top, [s, 0]);
      for (const [y, z] of [[26.0, 9.0], [27.5, 13.0], [32.3, 12.0]]) {
        const k = (y - T.base) / (T.top - T.base), x = s * (7.4 + (4.7 - 7.4) * k + 0.05);
        door(P, V(x, y - 0.75, z), V(0, 0, s), V(s, 0, 0), { h: 1.6 });
      }
      for (const [y, z] of [[20.0, 7.5], [22.5, 12.5], [29.0, 7.5]]) {
        const k = (y - T.base) / (T.top - T.base), x = s * (7.4 + (4.7 - 7.4) * k + 0.04);
        louvre(P, V(x, y, z), V(0, 0, s), V(s, 0.15, 0).normalize(), { w: 1.4, h: 0.9 });
      }
    }
    // front-face windows (the tower holds offices and the combat information spaces)
    windowRow(P, V(-3, 0, 4.4), V(3, 0, 4.4), 28.3, 4, V(1, 0, 0), V(0, 0, -1), { w: 0.6, h: 0.45, round: true });
    // the aft uptake trunk, separate from the tower with a slot between [P: z 16.8 to 21.2]
    const u = L.uptakeFwd;
    const f0 = chamferRect(-2.5, 2.5, 16.8, 19.8, 0.7), f1 = chamferRect(-2.2, 2.2, 16.8, 21.2, 0.7);
    P.add('paint', loft([ringAt(f0, T.base), ringAt(f1, u.top)], { top: false, bottom: false }), { tint: 0xeaeded });
    for (const w of wallsOf(f0, f1, T.base, u.top, 0, 18.6)) if (Math.abs(w.n.x) > 0.7) WALLS.push({ wall: w, heavy: true, high: true, doors: false });
    // its hood: rising to the cap, open aft (soot-darkened mouth)
    const f2 = chamferRect(-2.2, 2.2, 16.8, 19.4, 0.6);
    P.add('paint', loft([ringAt(f1, u.top), ringAt(f2, T.capY - 1.4)], { top: false, bottom: false }), { tint: 0xe2e6e6 });
    P.add('black', box(3.6, 3.6, 0.05, 0, u.top + 1.9, 20.6, -0.5), { tier: 0 });
    for (let k = 0; k < 5; k++) P.add('dark', box(3.7, 0.07, 0.6, 0, u.top + 0.5 + k * 0.7, 20.5 - k * 0.32), { tier: 1 });
    parts.sootFwd = [0, u.top + 2.5, 21.0, 9];
    // ties between the trunk and the tower in the slot
    for (const y of [20, 25, 30]) P.add('paint', box(3.0, 0.3, 0.8, 0, y, 16.5), { tier: 1 });
  }

  // ===================================== midships: liferaft galleries, boats, cranes, Bass Tilts
  // [P: 1985 bow and 1983 port-amidships photographs] Outboard of a narrow 01-level deckhouse, a
  // gallery on the main deck with big arched openings holding rows of liferaft canisters; its roof is
  // the boat deck (about 11.4 m), where the white launches sit in cradles. The two Bass Tilt columns
  // are staggered: port abreast the forward tower (z 4.3), starboard 10 m further aft (z 14.5).
  {
    const m1 = house(P, { x0: -9.2, x1: 9.2, z0: 5.0, z1: 22.0, y0: D(12) - 0.05, y1: 12.6, c: 0.8, tint: 0xeff2f2 });
    for (const w of m1.walls) dress(P, w, rnd, { windows: false, doors: true });
    const gy0 = D(14) - 0.03, gy1 = 11.4, gz0 = 5.4, gz1 = 22.0;
    for (const s of [-1, 1]) {
      const xo = s * 13.85, xi = s * 9.2;
      // outer face with the arched openings, cut from one plate
      const plate = new THREE.Shape([new THREE.Vector2(gz0, gy0), new THREE.Vector2(gz1, gy0), new THREE.Vector2(gz1, gy1), new THREE.Vector2(gz0, gy1)]);
      const arches = [[gz0 + 0.7, gz0 + 7.6], [gz0 + 8.6, gz1 - 0.7]];
      for (const [a0, a1] of arches) {
        const r = 1.0, top = gy1 - 0.35, bot = gy0 + 0.45;
        const h = new THREE.Path();
        h.moveTo(a0, bot); h.lineTo(a1, bot); h.lineTo(a1, top - r); h.quadraticCurveTo(a1, top, a1 - r, top); h.lineTo(a0 + r, top); h.quadraticCurveTo(a0, top, a0, top - r); h.lineTo(a0, bot);
        plate.holes.push(h);
      }
      const face = new THREE.ExtrudeGeometry(plate, { depth: 0.14, bevelEnabled: false, curveSegments: 5 });
      face.rotateY(-Math.PI / 2).translate(xo + (s > 0 ? 0.14 : 0), 0, 0);
      P.add('paint', face, { tint: 0xeef0f0 });
      // the gallery's roof (the boat deck) with its coaming and rail
      P.add('deck', box(Math.abs(xo - xi), 0.2, gz1 - gz0, (xo + xi) / 2, gy1 + 0.1, (gz0 + gz1) / 2));
      P.add('paint', box(0.1, 0.35, gz1 - gz0, xo + s * 0.05, gy1 + 0.1, (gz0 + gz1) / 2), { tint: 0xe6eaea });
      rail(P, [[xo, gz0], [xo, gz1]], gy1 + 0.2);
      // the dark interior: back wall shadowed, deckhead frames, liferaft canisters in rows
      P.add('paint', box(0.05, gy1 - gy0, gz1 - gz0, xi + s * 0.03, (gy0 + gy1) / 2, (gz0 + gz1) / 2), { tint: 0x5e6566 });
      P.add('paint', box(Math.abs(xo - xi), 0.04, gz1 - gz0, (xo + xi) / 2, gy1 - 0.02, (gz0 + gz1) / 2), { tier: 1, tint: 0x6a7172 });
      for (let z = gz0 + 1.2; z < gz1 - 0.5; z += 1.6) P.add('paint', box(Math.abs(xo - xi), 0.2, 0.12, (xo + xi) / 2, gy1 - 0.12, z), { tier: 2, tint: 0x80888a });
      for (const [a0, a1] of arches) for (let z = a0 + 0.8; z < a1 - 0.6; z += 2.25) liferaftRack(P, V(s * 12.2, gy0, z), Math.PI / 2, 2, 3);
      // boats on the boat deck
      const big = s < 0 ? 11.0 : 8.6, small = s < 0 ? 18.4 : 19.4;
      boatCradle(P, s * 11.55, gy1 + 0.55, big, 0, 9.5, 2.8, 1.35);
      motorLaunch(P, s * 11.55, gy1 + 0.55, big, 0, { L: 9.5, B: 2.8 });
      boatCradle(P, s * 11.6, gy1 + 0.5, small, 0, 6.2, 2.2, 1.0);
      workBoat(P, s * 11.6, gy1 + 0.5, small, 0, { L: 6.2, B: 2.2 });
      // Bass Tilt column [P: port column z 1.5 to 5.6, dome top 18.6 m; starboard from the bow photo]
      const cx = s * 12.0, cz = s < 0 ? 4.3 : 14.5;
      P.add('paint', yTube(D(cz), 16.0, 1.05, 1.05, 20, cx, cz), { tint: 0xeef0f0 });
      P.add('paint', yTube(16.0, 16.15, 1.25, 1.25, 20, cx, cz), { tint: 0xd8dcdc });
      P.add('radome', yTube(16.15, 17.5, 1.1, 1.1, 20, cx, cz));
      P.add('radome', sphere(1.1, cx, 17.5, cz, 1, 1.0, 1, 20), { tier: 0 });
      for (let k = 1; k < 4; k++) P.add('paint', hRing(1.06, 0.035, cx, D(cz) + k * 1.6, cz, 20), { tier: 2 });
      vLadder(P, cx + s * 1.05, cz, D(cz), 16.0, [s, 0]);
      platform(P, cx - 1.4, cx + 1.4, cz - 1.4, cz + 1.4, 16.0, { railSides: 'nesw', brackets: false, depth: 0.15 });
      platformUnderside(P, cx - 1.4, cx + 1.4, cz - 1.4, cz + 1.4, 16.0, null);
    }
    // boat cranes on the aft block's 01-level roof, jibs stowed rising forward over the boat bays
    // [P: heel about z 44, head about z 27 at 17.6 m in both the 1983 and 1985 frames]
    for (const s of [-1, 1]) boatCrane(P, s * 9.5, 11.9, 44.5, 0, { jib: 16.5, luff: 0.27, post: 1.0 });
  }

  // ===================================== aft block
  {
    // [P: 1986 stern quarter: main-deck walkways about 4 m wide either side of the aft block]
    const a1 = house(P, { x0: -10.4, x1: 10.4, z0: 22.0, z1: 68.0, y0: D(40) - 0.05, y1: 11.9, c: 2.0, tint: 0xf1f3f3 });
    for (const w of a1.walls) dress(P, w, rnd, { windows: Math.abs(w.n.x) > 0.9 && rnd() < 0.5, round: true, rings: true });
    const a2 = house(P, { x0: -8.8, x1: 8.8, z0: 22.5, z1: 58.0, y0: 11.9, y1: 14.4, c: 1.6, lean: 0.12, tint: 0xeef1f1 });
    for (const w of a2.walls) dress(P, w, rnd, { windows: rnd() < 0.6 });
    const a3 = house(P, { x0: -7.5, x1: 7.5, z0: 23.5, z1: 56.5, y0: 14.4, y1: L.aftBlock.roof, c: 1.4, lean: 0.1, tint: 0xf3f5f5 });
    for (const w of a3.walls) dress(P, w, rnd, { windows: rnd() < 0.5 });
    roofRail(P, a1, 11.9, { skip: ([x, z]) => Math.abs(x) < 8.6 && z < 58.5 });
    roofRail(P, a2, 14.4, { skip: ([x, z]) => Math.abs(x) < 7.3 && z < 57 });
    roofRail(P, a3, L.aftBlock.roof);
    for (const s of [-1, 1]) {
      for (const z of [26, 34, 50]) liferaftRack(P, V(s * 9.4, 11.9, z), 0, 2, 3);
      for (const z of [30, 44, 53]) mushroom(P, s * 8.0, 14.4, z, 0.3, 0.75);
      ladder(P, V(s * 9.7, 11.9, 54.0), V(s * 8.3, 14.4, 56.5));
      ladder(P, V(s * 8.2, 14.4, 25.0), V(s * 6.9, L.aftBlock.roof, 27.2));
      // aft Bass Tilt radomes on sponsons abreast the aft Top Dome
      const cx = s * 9.4, cz = 45.4;
      platform(P, cx - 1.5, cx + 1.5, cz - 1.5, cz + 1.5, 17.2, { railSides: s < 0 ? 'nsw' : 'nes', depth: 0.25 });
      P.add('paint', yTube(11.9, 17.1, 0.9, 0.9, 16, cx, cz)); // column from the 01-level roof
      P.add('radome', yTube(17.2, 18.5, 1.1, 1.1, 20, cx, cz));
      P.add('radome', sphere(1.1, cx, 18.5, cz, 1, 1, 1, 20));
    }
    // forward AK-100 barbette at the aft end of the 01 level [P: base 11.9 to 12.2 m, z 64.5]
    P.add('paint', yTube(11.9, LAYOUT.ak100Fwd.top, 3.1, 3.1, 32, 0, LAYOUT.ak100Fwd.z), { tint: 0xe4e8e8 });
    P.add('deck', yTube(LAYOUT.ak100Fwd.top - 0.02, LAYOUT.ak100Fwd.top + 0.01, 3.05, 3.05, 32, 0, LAYOUT.ak100Fwd.z));
    // the curved splinter screen round its after half
    P.add('paint', new THREE.CylinderGeometry(3.25, 3.25, 1.1, 32, 1, true, Math.PI * 0.55, Math.PI * 0.9).applyMatrix4(xf(0, LAYOUT.ak100Fwd.top + 0.55, LAYOUT.ak100Fwd.z)), { tint: 0xe9ecec });
    // aft AK-100 barbette on the main deck [P: top 10.0 m at z 76.5], with its screen
    P.add('paint', yTube(D(76.5) - 0.05, LAYOUT.ak100Aft.top, 3.0, 3.1, 32, 0, LAYOUT.ak100Aft.z), { tint: 0xe4e8e8 });
    P.add('deck', yTube(LAYOUT.ak100Aft.top - 0.02, LAYOUT.ak100Aft.top + 0.01, 2.95, 2.95, 32, 0, LAYOUT.ak100Aft.z));
    P.add('paint', new THREE.CylinderGeometry(3.3, 3.3, 1.2, 32, 1, true, Math.PI * 0.6, Math.PI * 0.8).applyMatrix4(xf(0, LAYOUT.ak100Aft.top + 0.6, LAYOUT.ak100Aft.z)), { tint: 0xe9ecec });
    rail(P, [[-3.2, 73.0], [-3.4, 76.5], [-3.2, 80.0], [0, 79.8], [3.2, 80.0], [3.4, 76.5], [3.2, 73.0]], LAYOUT.ak100Aft.top);

    // aft tower [P: base z 30.5 to 40.7 at 16.4 m, top 28.5 m]
    const T = L.towerAft;
    const b0 = chamferRect(-6.0, 6.0, T.z0, T.z1, 1.4), b1 = chamferRect(-2.9, 2.9, 33.8, 38.6, 0.7);
    P.add('paint', loft([ringAt(b0, L.aftBlock.roof), ringAt(b1, T.top)], { top: false, bottom: false }), { tint: 0xf0f2f2 });
    for (const w of wallsOf(b0, b1, L.aftBlock.roof, T.top, 0, 35.6)) WALLS.push({ wall: w, heavy: true, high: true, doors: false });
    P.add('deck', topProfile(b1, T.top - 0.05, T.top));
    roofRail(P, { top: b1 }, T.top);
    // its uptake: the exhaust leaves through louvres in the tower's aft face, hence the soot
    P.add('black', box(3.0, 2.0, 0.05, 0, 25.8, 39.6, 0.35), { tier: 0 });
    parts.sootAft = [0, 26.5, 40.0, 7];
    for (const s of [-1, 1]) {
      platform(P, s < 0 ? -5.6 : 3.4, s < 0 ? -3.4 : 5.6, 32.0, 38.0, 23.0, { railSides: s < 0 ? 'nws' : 'nes', depth: 0.18 });
      vLadder(P, s * 4.6, 38.5, L.aftBlock.roof, 23.0, [0, 1]);
      door(P, V(s * 4.15, 23.0, 35.0), V(0, 0, s), V(s, 0.25, 0).normalize(), { h: 1.55 });
    }
    // aft Top Dome house: platform at 20 m and the director box to 23.7 m [P z 42 to 48.5]
    const h1 = house(P, { x0: -4.2, x1: 4.2, z0: 41.5, z1: 49.0, y0: L.aftBlock.roof, y1: 20.0, c: 0.9, tint: 0xeef1f1 });
    for (const w of h1.walls) dress(P, w, rnd, { windows: false, lockers: false });
    platform(P, -5.4, 5.4, 41.0, 49.6, 20.0, { railSides: 'nesw', brackets: true, depth: 0.2 });
    house(P, { x0: -2.8, x1: 2.8, z0: 43.0, z1: 47.8, y0: 20.0, y1: MOUNT_Y.fortAft, c: 0.6, tint: 0xe9ecec });
    // Kite Screech platform [P: z 51 to 55, 17.3 m]
    const k1 = house(P, { x0: -3.0, x1: 3.0, z0: 51.0, z1: 56.0, y0: L.aftBlock.roof, y1: 17.3, c: 0.6, tint: 0xeef1f1 });
    void k1;
    rail(P, [[-3, 51], [3, 51], [3, 56], [-3, 56], [-3, 51]], 17.3);
  }

  // ===================================== forward Top Dome house on the bridge roof
  // [P: the dome's centre at about 29.4 m over z -3.5; the house under it carries three vertical
  // drums on its forward face (1985 bow photograph)]
  {
    const H = house(P, { x0: -3.2, x1: 3.2, z0: -7.0, z1: 0.2, y0: L.bridgeRoof, y1: MOUNT_Y.fortFwd, c: 0.7, tint: 0xe9ecec });
    for (const w of H.walls) dress(P, w, rnd, { windows: false, lockers: false, doors: Math.abs(w.n.x) > 0.9 });
    for (const x of [-1.6, 0, 1.6]) {
      P.add('paint', yTube(L.bridgeRoof, MOUNT_Y.fortFwd - 0.3, 0.55, 0.55, 14, x, -7.5), { tint: 0xe2e6e6 });
      P.add('paint', yTube(MOUNT_Y.fortFwd - 0.3, MOUNT_Y.fortFwd - 0.1, 0.62, 0.62, 14, x, -7.5), { tier: 1 });
    }
    rail(P, [[-3.2, -7.0], [-3.2, 0.2], [3.2, 0.2], [3.2, -7.0]], MOUNT_Y.fortFwd);
    vLadder(P, 3.25, -2.0, L.bridgeRoof, MOUNT_Y.fortFwd, [1, 0]);
  }
  roofRail(P, { top: chamferRect(-8.0, 8.0, -17.5, 3.8, 0.7) }, L.bridgeRoof);

  // ===================================== quarterdeck: AK-630 platforms, capstans
  {
    const y = L.quarterPlatforms.top;
    for (const s of [-1, 1]) {
      const xa = s < 0 ? -12.6 : 8.4, xb = s < 0 ? -8.4 : 12.6;
      const Q = L.quarterPlatforms;
      const H = house(P, { x0: xa, x1: xb, z0: Q.z0, z1: Q.z1, y0: D(92) - 0.05, y1: y, c: 0.8, tint: 0xeef1f1 });
      for (const w of H.walls) dress(P, w, rnd, { windows: false, lockers: false, pipes: false });
      rail(P, [[xa, Q.z1], [xb, Q.z1]], y);
      rail(P, [[s < 0 ? xa : xb, Q.z0], [s < 0 ? xa : xb, Q.z1]], y);
      rail(P, [[s < 0 ? xb : xa, Q.z0 + 1.5], [s < 0 ? xb : xa, Q.z1]], y);
      ladder(P, V(s * 9.6, D(101.8), 101.8), V(s * 9.6, y, Q.z1));
    }
  }

  // ===================================== whips along the decks and on the blocks
  for (const s of [-1, 1]) {
    for (const z of [-32.5, -20, -8]) whip(P, s * 12.3, L.level01, z, 9 + rnd() * 3);
    for (const z of [24, 33, 52, 60]) whip(P, s * 10.1, 11.9, z, 10 + rnd() * 3);
    for (const z of [26, 55]) whip(P, s * 8.5, 14.4, z, 8 + rnd() * 2);
  }
  // ===================================== clutter on every wall built above
  {
    const crnd = mulberry32(4466);
    for (const { wall, heavy, high, doors } of WALLS) clutterWall(P, wall, crnd, { heavy, high, doors });
  }
  return parts;
}

// Pedestal tops for the two Top Domes (MOUNTS.directors.fortFwd / fortAft).
export const MOUNT_Y = { fortFwd: 27.1, fortAft: 23.7 };
void mergeAll; void xTube; void deckHalfBeamAt;
