import * as THREE from 'three';
import { V, box, bar, rod, xf, yTube, xTube, topProfile, chamferRect, ringAt, loft, mulberry32, sphere, hRing } from '../exterior/kit.js';
import { rail, ladder, vLadder, door, windowRow, louvre, liferaftRack, whip, onWall } from '../exterior/fittings.js';
import { wallsOf, wallPoint } from '../exterior/walls.js';
import { platformUnderside } from '../exterior/clutter.js';
import { motorLaunch, workBoat, boatCradle, boatCrane } from '../exterior/boats.js';
import { deckHeightAt, LAYOUT } from './lines.js';
import { WALLS, resetHouses, house, dress, platform, roofRail, clutterAll, projected, ccw } from './houses.js';

// Slava's superstructure, bow to stern, as photographed in 1983 to 1986 (USN; refs/README.md):
//   - the narrow centreline house between the two Bazalt banks, from abaft the gun to the main
//     block, carrying the tandem AK-630 pair, the RBU-6000s and the forward Bass Tilt; outboard of
//     it the containers' inclined support webs with their walk-through openings;
//   - above the after two pairs, the bridge block (02, 03 and navigation-bridge levels, the bridge
//     faceted and its windows raked out) and on its roof the faceted pylon foremast and the lattice
//     mast;
//   - the main-mast block with the AK-630 sponsons and the stacked Side Globe radomes, the uptake
//     casing of the gas turbines, the boat crane and the boats;
//   - the two raised Fort plinths, the aft block with the Top Dome house and the hangar door, the
//     hangar lid between the Osa drums and the raised helicopter pad over the quarterdeck.
// z ranges and heights [P] from the 1986 broadside; plan widths [A] or [E] (lines.js).

const D = deckHeightAt;
const L = LAYOUT;
// z of the doors from the bridge to its wings (SLAVA_BRIDGE.wingDoorZ)
export const SLAVA_WING_DOOR_Z = -25.7;
const DEG = Math.PI / 180;

// A flat plate in the (z, y) plane at x, from a [z, y] outline with optional holes, thickness t.
function sidePlate(outline, holes, x, t = 0.22) {
  const s = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 4 });
  // shape x -> ship z, shape y -> ship y, extrusion -> ship x
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, x - t / 2, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  return g;
}

// Opening outline in (z, y): level bottom from z0 to z1, top sloping from yt0 to yt1, rounded corners.
function opening(z0, z1, yb0, yt0, yb1, yt1, r = 0.35) {
  const pts = [], n = 4;
  const arc = (cz, cy, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; pts.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  arc(z1 - r, yb1 + r, -Math.PI / 2);
  arc(z1 - r, yt1 - r, 0);
  arc(z0 + r, yt0 - r, Math.PI / 2);
  arc(z0 + r, yb0 + r, Math.PI);
  return pts;
}

// Dome-topped radome column (MR-123 Bass Tilt) standing on y0 at (x, z).
function bassTilt(P, x, y0, z, { col = 0.5, r = 0.95, h = 1.3, railed = true } = {}) {
  P.add('paint', yTube(y0, y0 + col, r * 0.75, r * 0.8, 16, x, z), { tint: 0xe9ecec });
  P.add('paint', yTube(y0 + col, y0 + col + 0.12, r * 1.08, r * 1.08, 18, x, z), { tint: 0xd5d9d9 });
  P.add('radome', yTube(y0 + col + 0.12, y0 + col + 0.12 + h, r, r, 18, x, z));
  P.add('radome', sphere(r, x, y0 + col + 0.12 + h, z, 1, 0.75, 1, 18));
  if (railed) rail(P, [[x - r - 0.5, z - r - 0.5], [x + r + 0.5, z - r - 0.5], [x + r + 0.5, z + r + 0.5], [x - r - 0.5, z + r + 0.5]], y0, { h: 0.9, closed: true });
}

// Points round a circle (plan), for rails.
const circlePts = (cx, cz, r, a0 = 0, a1 = Math.PI * 2, n = 20) => Array.from({ length: n + 1 }, (_, k) => { const a = a0 + ((a1 - a0) * k) / n; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; });

// "Rum Tub" EW radome: a tall half-drum facing outboard (+side), its curved face gridded, on a
// bracketed platform (local origin at the platform's inboard edge on the roof at (x, y, z)).
function rumTub(P, x, y, z, side, { w = 2.4, h = 2.2, r = 1.0 } = {}) {
  const cx = x + side * (r + 0.3);
  P.add('dark', box(r * 2 + 0.6, 0.08, w + 0.6, cx, y - 0.04, z), { tint: 0xb0b6b8 });
  P.add('paint', box(r * 2 + 0.6, 0.25, w + 0.6, cx, y - 0.2, z), { tier: 0 });
  for (const dz of [-w / 2, w / 2]) P.add('paint', bar(V(cx + side * r, y - 0.3, z + dz), V(x, y - 1.9, z + dz), 0.14), { tier: 1 });
  const g = new THREE.CylinderGeometry(r, r, h, 16, 1, false, side > 0 ? 0 : Math.PI, Math.PI).applyMatrix4(xf(cx, y + h / 2 + 0.05, z, 0, 0, 0, V(1, 1, w / (2 * r))));
  P.add('radome', g);
  for (let k = 1; k < 5; k++) P.add('dark', new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.04, 16, 1, true, side > 0 ? 0 : Math.PI, Math.PI).applyMatrix4(xf(cx, y + 0.05 + (h * k) / 5, z, 0, 0, 0, V(1, 1, w / (2 * r)))), { tier: 2 });
  P.add('paint', box(0.12, h + 0.2, w, cx, y + h / 2 + 0.05, z), { tint: 0xd8dcdc });
  P.add('paint', box(r * 2 + 0.2, 0.12, w + 0.2, cx + side * 0.0, y + h + 0.1, z), { tier: 1, tint: 0xe4e8e8 });
  rail(P, [[cx - (r + 0.3), z - w / 2 - 0.3], [cx + (r + 0.3), z - w / 2 - 0.3], [cx + (r + 0.3), z + w / 2 + 0.3], [cx - (r + 0.3), z + w / 2 + 0.3]].map(([px, pz]) => [px, pz]), y, { h: 0.9 });
}

// Window row on a raked (leaning) wall: panes in frames laid in the face's true plane, not
// vertical, so they sit flush on the bridge front that leans out toward the roof.
function rakedWindowRow(P, w, y, n, { w: pw = 0.82, h: ph = 0.95, t0 = null, t1 = null } = {}) {
  const e1 = w.B.clone().sub(w.A), e2 = w.At.clone().sub(w.A);
  const nt = e1.clone().cross(e2).normalize();
  if (nt.dot(w.n) < 0) nt.negate();
  const up = nt.clone().cross(w.u).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(w.u.clone(), up, nt));
  const put = (key, g, c, o) => P.add(key, g.applyMatrix4(new THREE.Matrix4().compose(c, q, V(1, 1, 1))), o);
  const a = t0 ?? 0.5 / n, b = t1 ?? 1 - 0.5 / n;
  for (let i = 0; i < n; i++) {
    const c = wallPoint(w, n === 1 ? (a + b) / 2 : a + ((b - a) * i) / (n - 1), y, 0.0);
    put('glass', new THREE.PlaneGeometry(pw, ph).translate(0, 0, 0.03), c.clone(), { tier: 1, uv: true });
    const t = 0.08, d = 0.12;
    put('paint', box(pw + 2 * t, t, d, 0, ph / 2 + t / 2, d / 2), c.clone(), { tier: 1, tint: 0xe2e6e6 });
    put('paint', box(pw + 2 * t, t, d, 0, -ph / 2 - t / 2, d / 2), c.clone(), { tier: 1, tint: 0xd5d9d9 });
    for (const sx of [-1, 1]) put('paint', box(t, ph, d, sx * (pw / 2 + t / 2), 0, d / 2), c.clone(), { tier: 1, tint: 0xdde1e1 });
    // wiper arm across the lower half of the pane
    put('black', box(0.03, ph * 0.55, 0.03, pw * 0.15, -ph * 0.15, 0.06).applyMatrix4(xf(0, 0, 0, 0, 0, 0.5)), c.clone(), { tier: 2 });
  }
}

// bridgeInterior: true leaves the navigation-bridge level open inside the SLAVA_BRIDGE envelope
// (no walls, glazing or bridge clutter there; the floor slab stays under 17.4 m and the roof slab
// above 20.1 m) for a walk-in room that carries its own skin. The wings and the wing doors stay.
export function buildSuperstructure(P, M, { bridgeInterior = false } = {}) {
  const rnd = mulberry32(11641983);
  resetHouses(31);
  const parts = { sockets: {} };
  const H = L.fwdHouse, BB = L.bridgeBlock;

  // ===================================== centreline house between the Bazalt banks
  {
    // front part: the forward AK-630 deck [P: front z -58.1, roof 12.0 m], chamfered front corners
    const a = house(P, { plan: [[-1.4, H.z0], [1.4, H.z0], [H.x, H.z0 + 1.9], [H.x, -52.5], [-H.x, -52.5], [-H.x, H.z0 + 1.9]], y0: D(-55) - 0.05, y1: H.roof0, tint: 0xf0f2f2, heavy: true });
    for (const w of a.walls) dress(P, w, rnd, { windows: false, lockers: false, doors: Math.abs(w.n.x) > 0.9, rings: true });
    // the raised after part for the second AK-630 [P: roof 13.6 m, z -52.5 to -46.4]
    const b = house(P, { x0: -H.x + 0.6, x1: H.x - 0.6, z0: -52.5, z1: -46.4, y0: D(-50) - 0.05, y1: H.roof1, c: 0.6, tint: 0xeef1f1 });
    for (const w of b.walls) dress(P, w, rnd, { windows: Math.abs(w.n.x) > 0.9, round: true, lockers: false });
    // the long part aft to the bridge block, the RBU-6000 deck [P: roof 12.2 m]
    const c = house(P, { x0: -H.x, x1: H.x, z0: -52.5, z1: BB.z0 - 1.7, y0: D(-40) - 0.05, y1: H.roof2, c: 0.4, tint: 0xf1f3f3 });
    for (const w of c.walls) dress(P, w, rnd, { windows: Math.abs(w.n.x) > 0.9 && rnd() < 0.6, round: true });
    // under the bridge block and aft to the main block: the lower storey between the containers
    const d = house(P, { x0: -H.x, x1: H.x, z0: BB.z0 - 1.75, z1: H.z1, y0: D(-20) - 0.05, y1: H.roof2, c: 0.3, tint: 0xeff1f1, roof: true, coaming: false });
    for (const w of d.walls) dress(P, w, rnd, { windows: Math.abs(w.n.x) > 0.9 && rnd() < 0.5, round: true, lockers: false });
    roofRail(P, a, H.roof0, { skip: ([, z]) => z > -53 });
    roofRail(P, b, H.roof1);
    for (const s of [-1, 1]) rail(P, [[s * H.x, -46.4], [s * H.x, BB.z0 - 1.9]], H.roof2 + 0.1);
    // AK-630 base rings and the forward Bass Tilt on its pedestal [P: z -36, 15.0 to 17.3 m]
    for (const [z, y] of [[-54.0, H.roof0], [-48.5, H.roof1]]) P.add('dark', yTube(y, y + 0.06, 1.15, 1.15, 20, 0, z), { tint: 0xa0a6a8 });
    // (to starboard of the centreline, as the Ustinov 1988 aerial shows it)
    P.add('paint', yTube(H.roof2, 15.0, 0.55, 0.6, 14, 1.7, -36.0), { tint: 0xeceff0 });
    P.add('dark', box(2.0, 0.08, 2.0, 1.7, 15.0 - 0.04, -36.0), { tint: 0xb0b6b8 });
    bassTilt(P, 1.7, 15.0, -36.0, { col: 0.3, r: 0.8, h: 1.05 });
    vLadder(P, 2.4, -35.0, H.roof2, 15.0, [0, 1]);
    // RBU-6000 hoist trunks under the launchers (the launchers themselves are the weapons module's)
    for (const s of [-1, 1]) P.add('paint', yTube(H.roof2, H.roof2 + 0.35, 1.1, 1.1, 18, s * 1.6, -40.5), { tint: 0xe2e6e6 });
    // the open deck between the bridge block and the main block, over the fourth pair's rear ends,
    // on pillars [A: Ustinov 1988 aerial]
    P.add('roof', box(12.6, 0.12, 5.2, 0, H.roof2 - 0.06, -8.3));
    P.add('paint', box(12.6, 0.35, 5.2, 0, H.roof2 - 0.3, -8.3), { tint: 0xe2e6e6 });
    for (const s of [-1, 1]) {
      rail(P, [[s * 6.3, -10.9], [s * 6.3, -5.7]], H.roof2);
      for (const z of [-10.6, -6.0]) P.add('paint', yTube(D(z), H.roof2 - 0.4, 0.14, 0.14, 8, s * 5.9, z), { tier: 0 });
    }
  }

  // ===================================== Bazalt support webs (both sides, four pairs)
  {
    const B = L.bazalt, th = B.incline * DEG, tan = Math.tan(th), half = B.dia / 2;
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const zf = B.z0 + i * B.pitch, zr = zf + B.length * Math.cos(th);
      const under = (z) => B.yFront - (z - zf) * tan - half / Math.cos(th) - 0.04; // container underside
      for (const ax of [B.xOut, B.xIn]) {
        const x = side * ax, out = ax === B.xOut;
        const z0 = zf - 0.15, z1 = Math.min(zr - 0.6, zf + 11.2), yd0 = D(z0), yd1 = D(z1);
        const outline = [[z0, yd0], [z1, yd1], [z1, under(z1)], [zf + 1.3, under(zf + 1.3)], [zf + 0.8, under(zf + 0.8) + 0.25], [z0, under(z0) + 0.25]];
        const hole = out ? opening(zf + 2.0, zf + 6.6, yd0 + 0.18, under(zf + 2.0) - 0.6, D(zf + 6.6) + 0.18, under(zf + 6.6) - 0.55, 0.3)
          : opening(zf + 1.8, zf + 8.6, yd0 + 0.2, under(zf + 1.8) - 0.5, D(zf + 8.6) + 0.2, under(zf + 8.6) - 0.45, 0.3);
        P.add('paint', sidePlate(outline, [hole], x, out ? 0.24 : 0.2), { tint: out ? 0xf0f2f2 : 0xd8dcdc, shade: (px, py) => (py < yd0 + 0.05 ? 0.72 : 1) });
        // the dark inside of the opening: a recess plate 0.8 m inboard
        if (out) P.add('black', sidePlate(outline.slice(0, 2).concat([[z1, yd1 + 2.0], [z0, yd0 + 2.6]]), [], x - side * 1.1, 0.05), { tint: 0x8a8e8e });
        // saddles under the container shaped to its belly, and the hold-down straps over it
        for (const zs of [zf + 1.0, zf + 8.4]) {
          const yc = B.yFront - (zs - zf) * tan;
          P.add('dark', new THREE.CylinderGeometry(half + 0.08, half + 0.08, 0.45, 18, 1, true, Math.PI * 0.6, Math.PI * 0.8).applyMatrix4(xf(x, yc, zs, th - Math.PI / 2, 0, 0)), { tier: 1, tint: 0x9aa0a2 });
        }
        // the girder flange along the web's top edge
        P.add('paint', bar(V(x, under(zf + 1.3) + 0.02, zf + 1.3), V(x, under(z1) + 0.02, z1), 0.42, 0.08), { tint: 0xe6eaea });
        // web stiffeners on the outboard face
        if (out) for (const zz of [zf + 1.4, zf + 7.4, zf + 10.4]) P.add('paint', box(0.1, Math.max(0.3, under(zz) - D(zz) - 0.1), 0.18, x + side * 0.15, (under(zz) + D(zz)) / 2, zz), { tier: 1, tint: 0xe0e4e4 });
      }
      // a cross girder at the front leg tying the pair to the centreline house
      P.add('paint', box(Math.abs(B.xOut - H.x) + 0.2, 0.45, 0.5, side * (B.xOut + H.x) / 2, B.yFront - 1.15, zf + 0.4), { tint: 0xe2e6e6 });
      // ladder up the front leg to the container tops (maintenance)
      vLadder(P, side * (B.xOut + 0.3), zf + 0.9, D(zf + 0.9), B.yFront - 1.0, [side, 0], { cage: false });
    }
    // the closing fairing abaft the fourth pair, rising aft to the main block [P: z -7.1 to -4.3]
    for (const side of [-1, 1]) {
      const z0 = -7.1, z1 = -4.3;
      const outline = [[z0, D(z0)], [z1 + 1.0, D(z1)], [z1 + 1.0, 11.7], [z1, 11.7], [z0 + 0.4, 8.0], [z0, 8.0]];
      P.add('paint', sidePlate(outline, [], side * 6.9, 0.3), { tint: 0xf0f2f2 });
    }
  }

  // ===================================== bridge block
  {
    // 02 level over the containers [P: 12.2 to 14.9 m, front z -33.5]
    const l2 = house(P, { x0: -BB.x02, x1: BB.x02, z0: -33.5, z1: BB.z1, y0: BB.base, y1: BB.level1, c: 1.3, tint: 0xf0f2f2, heavy: true });
    for (const w of l2.walls) dress(P, w, rnd, { windows: true, round: true, winY: 0.45, doors: w.n.z > 0.5 });
    platformUnderside(P, -BB.x02, BB.x02, -33.5, BB.z1, BB.base + 0.05, null);
    // 03 level [P: windows at 16.1 m, front z -32.2]
    const l3 = house(P, { x0: -BB.x03, x1: BB.x03, z0: -32.2, z1: BB.z1, y0: BB.level1, y1: bridgeInterior ? BB.deck - 0.08 : BB.deck, c: 1.6, tint: 0xeef1f1, heavy: true, coaming: !bridgeInterior });
    for (const w of l3.walls) dress(P, w, rnd, { windows: true, round: true, winY: 0.5, doors: Math.abs(w.n.x) > 0.9 });
    // the navigation bridge: faceted plan, front raked out 0.8 m at the roof [P]
    const F0 = BB.z0, ch = 2.95, xf0 = BB.xFront, xs = BB.x, za = BB.zBridgeAft;
    const plan = [[-xf0, F0], [xf0, F0], [xs, F0 + ch], [xs, za - 1.2], [xs - 1.2, za], [-xs + 1.2, za], [-xs, za - 1.2], [-xs, F0 + ch]];
    const topPlan = [[-xf0 - 0.3, F0 - 0.8], [xf0 + 0.3, F0 - 0.8], [xs, F0 + ch - 0.25], [xs, za - 1.2], [xs - 1.2, za], [-xs + 1.2, za], [-xs, za - 1.2], [-xs, F0 + ch - 0.25]];
    // the deck slab of the bridge level overhanging the 03 level, with its dark underside (kept
    // under the room's floor when the interior is open)
    const slabTop = bridgeInterior ? BB.deck - 0.06 : BB.deck + 0.02;
    P.add('paint', topProfile(plan, BB.deck - 0.28, slabTop), { tint: 0xe4e8e8, shade: (x, y) => (y < BB.deck - 0.1 ? 0.55 : 1) });
    let br;
    if (!bridgeInterior) {
      br = house(P, { plan, topPlan, y0: BB.deck, y1: BB.roof, tint: 0xf3f5f5, heavy: true, clutter: false });
    } else {
      // only the roof slab above the room, its coaming and the walls' outlines for the fittings
      P.add('paint', topProfile(topPlan, BB.roof, BB.roof + 0.1), { tint: 0xe4e8e8 });
      P.add('roof', topProfile(topPlan, BB.roof + 0.1, BB.roof + 0.16));
      P.add('paint', loft([ringAt(topPlan, BB.roof + 0.1), ringAt(topPlan, BB.roof + 0.28)], { top: false, bottom: false }), { tint: 0xe9ecec, tier: 1 });
      const [pb, pt] = ccw(plan, topPlan);
      br = { top: pt, walls: wallsOf(pb, pt, BB.deck, BB.roof, 0, (F0 + za) / 2) };
    }
    const roofY = bridgeInterior ? BB.roof + 0.16 : BB.roof;
    for (const w of br.walls) {
      const front = w.n.z < -0.3, side = Math.abs(w.n.x) > 0.9;
      // windows round the front and the forward part of the sides, portholes further aft, and the
      // door to the wing [P]
      if (side) door(P, V(Math.sign(w.n.x) * (xs + 0.01), BB.deck + 0.02, SLAVA_WING_DOOR_Z), V(0, 0, -Math.sign(w.n.x)), V(Math.sign(w.n.x), 0, 0), { h: 1.8 });
      if (bridgeInterior) continue;
      if (front) {
        rakedWindowRow(P, w, 18.8, Math.max(3, Math.round(w.len / 1.06)));
      } else if (side) {
        const sx = Math.sign(w.n.x), u = w.u, n = w.n;
        for (const z of [-28.3, -27.4, -24.1, -23.2, -22.3]) windowRow(P, V(sx * xs, 0, z), V(sx * xs, 0, z), 18.85, 1, u, n, { w: 0.8, h: 0.9 });
        windowRow(P, V(sx * xs, 0, -21.0), V(sx * xs, 0, -11.0), 18.9, 7, u, n, { round: true, w: 0.42 });
      }
      WALLS.push({ wall: w, heavy: false, high: true, doors: false });
    }
    // sun visor over the front windows
    for (const w of br.walls) if (w.n.z < -0.3) P.add('paint', bar(wallPoint(w, 0.01, 19.62, 0.32), wallPoint(w, 0.99, 19.62, 0.32), 0.08, 0.62), { tier: 1, tint: 0xe4e8e8 });
    roofRail(P, br, roofY);
    // bridge wings: open platforms outboard of the bridge sides with spray screens [P: z -27.5 to -24]
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -(xs + 1.4) : xs, x1 = s < 0 ? -xs : xs + 1.4, z0 = -27.6, z1 = -23.8;
      P.add('roof', box(1.4, 0.12, z1 - z0, (x0 + x1) / 2, BB.deck - 0.06, (z0 + z1) / 2));
      P.add('paint', box(1.4, 0.3, z1 - z0, (x0 + x1) / 2, BB.deck - 0.27, (z0 + z1) / 2), { tint: 0xe4e8e8 });
      P.add('paint', box(0.08, 1.0, z1 - z0, s * (xs + 1.4), BB.deck + 0.5, (z0 + z1) / 2), { tint: 0xeef0f0 });
      P.add('paint', box(1.4, 1.0, 0.08, (x0 + x1) / 2, BB.deck + 0.5, z0), { tint: 0xeef0f0 });
      rail(P, [[s * (xs + 1.4), z1], [s * xs, z1]], BB.deck);
      for (const z of [z0 + 0.4, z1 - 0.4]) P.add('paint', bar(V(s * (xs + 1.2), BB.deck - 0.4, z), V(s * (BB.x03 + 0.05), BB.deck - 1.9, z), 0.14), { tier: 1 });
      P.add('dark', yTube(BB.deck, BB.deck + 1.1, 0.12, 0.12, 8, s * (xs + 0.7), -26.9), { tier: 1 });
      P.add('dark', sphere(0.2, s * (xs + 0.7), BB.deck + 1.25, -26.9, 1, 0.7, 1, 10), { tier: 1 });
      parts.sockets['bridgeWing' + (s < 0 ? 'Port' : 'Stbd')] = V(s * (xs + 0.7), BB.deck, -25.7);
      // MR-123 radomes for the midships AK-630s on brackets under the bridge level's after sides
      // [P: z -15.8 to -13.5, 13.0 to 16.5 m]
      const bx = s * 6.2;
      P.add('paint', box(2.4, 0.3, 2.4, bx, 12.85, -14.3), { tint: 0xe6eaea });
      for (const dz of [-0.9, 0.9]) P.add('paint', bar(V(bx + s * 0.6, 12.7, -14.3 + dz), V(s * BB.x02, 11.3, -14.3 + dz), 0.14), { tier: 1 });
      bassTilt(P, bx, 13.0, -14.3, { col: 0.25, r: 0.9, h: 1.4, railed: false });
      // ladders between the levels
      ladder(P, V(s * (BB.x02 + 0.5), BB.base, -23.0), V(s * (BB.x02 + 0.5), BB.level1, -20.2));
      ladder(P, V(s * (BB.x03 + 0.5), BB.level1, -19.0), V(s * (BB.x03 + 0.5), BB.deck, -16.2));
      // a liferaft rack and a life ring on the 02-level deck edge
      liferaftRack(P, V(s * (BB.x02 + 0.2), BB.level1, -29.5), Math.PI / 2, 1, 3);
    }
    parts.sockets.bridge = V(0, BB.deck, BB.z0);
  }

  // ===================================== foremast: the faceted pylon on the bridge roof
  {
    const F = L.foremast;
    const r0 = chamferRect(-F.x0, F.x0, F.z0, F.z1, 1.2);
    const rm = chamferRect(-F.xm, F.xm, F.zm0, F.zm1, 0.8);
    const r1 = chamferRect(-F.x1, F.x1, F.zt0, F.zt1, 0.45);
    P.add('paint', loft([ringAt(r0, F.base), ringAt(rm, 25.5), ringAt(r1, F.top)], { top: false, bottom: false }), { tint: 0xf1f3f3 });
    for (const w of wallsOf(r0, rm, F.base, 25.5, 0, -16)) WALLS.push({ wall: w, heavy: true, high: true, doors: w.n.z > 0.5 });
    for (const w of wallsOf(rm, r1, 25.5, F.top, 0, -14.6)) WALLS.push({ wall: w, heavy: true, high: true, doors: false });
    P.add('roof', topProfile(r1, F.top - 0.05, F.top + 0.02));
    // Top Steer pedestal [P: turntable at 32.0 m over z -14.6]
    P.add('paint', yTube(F.top, F.topSteerY - 0.75, 0.9, 0.75, 18, 0, F.topSteerZ), { tint: 0xeef0f0 });
    // the Front Door panel: a large shallow aperture in the forward face [P: 21.0 to 25.0 m]
    {
      const k = (y) => (y - F.base) / (25.5 - F.base);
      const zf = (y) => F.z0 + (F.zm0 - F.z0) * k(y);
      const y0 = 21.0, y1 = 25.0, hw = 1.9;
      const nrm = V(0, (zf(y1) - zf(y0)) / (y1 - y0), -1).normalize();
      const c = V(0, (y0 + y1) / 2, (zf(y0) + zf(y1)) / 2 - 0.05);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), nrm.clone().negate());
      const panel = (w, h, d, dz, key, tint) => P.add(key, new THREE.BoxGeometry(w, h, d).applyMatrix4(new THREE.Matrix4().compose(c.clone().addScaledVector(nrm, dz), q, V(1, 1, 1))), { tint });
      panel(2 * hw + 0.3, y1 - y0 + 0.3, 0.12, 0.04, 'paint', 0xdfe3e3);
      panel(2 * hw, y1 - y0, 0.08, 0.12, 'dark', 0x8a9294);
      for (let i = 0; i < 6; i++) {
        const yy = y0 + 0.33 + i * 0.67;
        P.add('steel', bar(V(-hw + 0.1, yy, zf(yy) - 0.22), V(hw - 0.1, yy, zf(yy) - 0.22), 0.05, 0.04), { tier: 2 });
      }
    }
    // galleries round the pylon front and back at 26.0 m, with rails and ladders
    {
      const y = 26.0, k = (y - F.base) / (25.5 - F.base), zfr = F.z0 + (F.zm0 - F.z0) * Math.min(1, k), zbk = F.z1 + (F.zm1 - F.z1) * Math.min(1, k);
      platform(P, -F.xm - 1.0, F.xm + 1.0, zfr - 1.6, zfr + 0.1, y, { railSides: 'nwe', depth: 0.2, brackets: true });
      platform(P, -F.xm - 0.8, F.xm + 0.8, zbk - 0.1, zbk + 1.5, y, { railSides: 'swe', depth: 0.2, brackets: true });
      for (const s of [-1, 1]) vLadder(P, s * 2.3, F.z1 + 0.3, F.base, y, [0, 1]);
      door(P, V(0, y, zbk + 0.02), V(-1, 0, 0), V(0, 0, 1), { h: 1.7 });
      parts.sockets.foreGallery = V(0, y, zfr - 0.8);
      roofRail(P, { top: r1 }, F.top);
    }
    // the windows high on the pylon front (the combat information spaces)
    windowRow(P, V(-1.4, 0, F.zm0 + 0.35), V(1.4, 0, F.zm0 + 0.35), 27.3, 3, V(1, 0, 0), V(0, 0.45, -1).normalize(), { w: 0.5, h: 0.4, round: true });
    parts.sockets.topSteer = V(0, F.topSteerY, F.topSteerZ);
  }

  // ===================================== main-mast block, AK-630 sponsons, Side Globes
  {
    const MB = L.mainBlock;
    // 01 level from abaft the fourth pair to the uptake casing [P: 6.0 to 8.9 m]
    const m1 = house(P, { x0: -7.2, x1: 7.2, z0: MB.z01, z1: MB.z1, y0: D(0) - 0.05, y1: MB.sponson, c: 0.8, tint: 0xf0f2f2 });
    for (const w of m1.walls) dress(P, w, rnd, { windows: false, doors: true, rings: true });
    // the walk-through bay at its forward end [P: z -4 to +1.7, 6.8 to 8.4 m]
    for (const s of [-1, 1]) {
      P.add('black', box(0.05, 1.6, 5.4, s * 7.23, D(0) + 1.05, -1.2), { tier: 0, tint: 0x8a8e8e });
      P.add('paint', box(0.22, 0.4, 5.8, s * 7.3, D(0) + 2.0, -1.2), { tier: 1, tint: 0xe6eaea });
    }
    // the block under the main mast [P: z -4.5 to 10.6, roof 14.8 m]
    const m2 = house(P, { x0: -MB.x, x1: MB.x, z0: MB.z0, z1: MB.z1, y0: MB.sponson, y1: MB.roof, c: 1.0, lean: 0.25, tint: 0xeef1f1, heavy: true });
    for (const w of m2.walls) dress(P, w, rnd, { windows: Math.abs(w.n.x) > 0.9 && rnd() < 0.6, round: true });
    roofRail(P, m1, MB.sponson, { skip: ([x, z]) => Math.abs(x) < 7 && z > MB.z0 - 0.1 && z < MB.z1 });
    roofRail(P, m2, MB.roof, { skip: ([, z]) => z > 10 });
    // liferaft racks along the 01-level deck edge between the sponsons [A: Ustinov 1988]
    for (const s of [-1, 1]) for (const z of [-2.2, 0.6, 5.9]) liferaftRack(P, V(s * 6.9, MB.sponson, z), 0, 1, 2);
    // AK-630 sponsons [P z: 3.4 and 9.0; x estimated]: round platforms with base rings
    for (const s of [-1, 1]) for (const z of [3.4, 9.0]) {
      P.add('paint', yTube(MB.sponson - 0.9, MB.sponson, 1.45, 1.45, 22, s * 8.4, z), { tint: 0xe8ecec });
      P.add('roof', yTube(MB.sponson - 0.02, MB.sponson + 0.01, 1.42, 1.42, 22, s * 8.4, z));
      P.add('dark', yTube(MB.sponson, MB.sponson + 0.06, 1.1, 1.1, 20, s * 8.4, z), { tint: 0xa0a6a8 });
      rail(P, circlePts(s * 8.4, z, 1.4, s > 0 ? -Math.PI / 2 : Math.PI / 2, s > 0 ? Math.PI / 2 : Math.PI * 1.5, 12), MB.sponson, { h: 0.9 });
      for (const dz of [-0.8, 0.8]) P.add('paint', bar(V(s * 9.4, MB.sponson - 0.85, z + dz), V(s * 7.25, MB.sponson - 2.3, z + dz), 0.14), { tier: 1 });
    }
    // the main mast: a tapering cylinder from the block roof to the Top Pair turntable [P]
    const MM = L.mainMast;
    P.add('paint', yTube(MB.roof, MM.top - 0.6, MM.r0, MM.r1, 24, 0, MM.z), { tint: 0xf2f4f4 });
    for (const y of [17.5, 21.0, 24.5]) P.add('paint', hRing(MM.r0 + (MM.r1 - MM.r0) * (y - MB.roof) / (MM.top - MB.roof) + 0.03, 0.05, 0, y, MM.z, 24), { tier: 1 });
    vLadder(P, 0, MM.z + 1.15, MB.roof, MM.top - 1.0, [0, 1]);
    P.add('dark', yTube(MM.top - 1.65, MM.top - 1.58, 2.1, 2.1, 22, 0, MM.z), { tier: 1, tint: 0xb0b6b8 });
    rail(P, circlePts(0, MM.z, 2.1), MM.top - 1.58, { h: 0.95 });
    parts.sockets.topPair = V(0, MM.top, MM.z);
    // the Side Globe stacks: four large radomes each side, two on outriggers from the block's side
    // and two on the mast [P: centres at 11.1, 13.2, 17.0 and 18.9 m over z 7.8; A: Ustinov 1988]
    for (const s of [-1, 1]) {
      const fx = s * (MB.x + 0.9);
      for (const y of [11.1, 13.2]) {
        P.add('paint', bar(V(s * (MB.x - 0.2), y - 0.7, MM.z), V(fx - s * 0.6, y - 0.4, MM.z), 0.18), { tier: 0 });
        P.add('paint', sphere(0.82, fx + s * 0.25, y, MM.z, 1, 1, 1, 18), { tint: 0xf4f6f4 });
      }
      for (const y of [17.0, 18.9]) {
        const x = s * (MM.r0 + 1.4);
        P.add('paint', xTube(s * MM.r0, x - s * 0.5, 0.16, 0.16, 8, y - 0.5, MM.z), { tier: 0 });
        P.add('paint', sphere(0.8, x, y, MM.z, 1, 1, 1, 18), { tint: 0xf4f6f4 });
        P.add('dark', box(1.8, 0.06, 1.8, x, y - 0.85, MM.z), { tier: 1, tint: 0xb0b6b8 });
      }
      // Rum Tub EW radomes on bracketed platforms at the block's roof edge, fore and aft of the
      // Side Globe column [P: Marshal Ustinov 1989]
      for (const z of [3.6, 12.0]) rumTub(P, s * (MB.x - 0.4), MB.roof, z, s);
      // the small domed radome on the block's forward corner [P: z -4.3, 12.3 to 13.6 m]
      P.add('paint', yTube(MB.sponson, 12.2, 0.32, 0.32, 10, s * 5.8, -3.9), { tier: 0 });
      P.add('radome', sphere(0.65, s * 5.8, 12.75, -3.9, 1, 0.9, 1, 14));
    }
  }

  // ===================================== uptake casing (the gas turbines' uptakes in one block)
  // [P: 1986 broadside: the casing proper z 14.6 to 25.0 with its aft face raked, top 18.2 m under
  // a black cap with a brim; a lower forward section to 14.2 m, z 11.4 to 14.6, with two large
  // grille frames; two bands of intake grilles low along the casing's sides]
  {
    const U = L.funnel;
    // the lower forward section (intake trunks with the big grille frames)
    const lo = house(P, { x0: -U.x + 0.3, x1: U.x - 0.3, z0: U.z0, z1: U.zc + 0.5, y0: D(12) - 0.05, y1: U.low, c: 0.4, tint: 0xeef0f0, clutter: false });
    for (const s of [-1, 1]) {
      const x = s * (U.x - 0.3 + 0.02);
      for (const [z0, z1] of [[U.z0 + 0.25, U.z0 + 1.65], [U.z0 + 1.8, U.zc + 0.35]]) {
        const zc = (z0 + z1) / 2, w = z1 - z0;
        P.add('dark', box(0.06, U.low - D(12) - 1.0, w, x, (U.low + D(12)) / 2, zc), { tint: 0x7c8486 });
        P.add('paint', box(0.14, U.low - D(12) - 0.8, 0.12, x, (U.low + D(12)) / 2, z0), { tier: 1, tint: 0xdde1e1 });
        P.add('paint', box(0.14, U.low - D(12) - 0.8, 0.12, x, (U.low + D(12)) / 2, z1), { tier: 1, tint: 0xdde1e1 });
        for (let y = D(12) + 0.7; y < U.low - 0.5; y += 0.26) P.add('paint', box(0.1, 0.05, w - 0.1, x + s * 0.03, y, zc), { tier: 2, tint: 0xc8cdcd });
        for (const y of [D(12) + 0.45, (U.low + D(12)) / 2, U.low - 0.45]) P.add('paint', box(0.16, 0.12, w + 0.12, x, y, zc), { tier: 1, tint: 0xdde1e1 });
      }
    }
    roofRail(P, lo, U.low, { skip: ([, z]) => z > U.zc });
    // the casing: vertical sides, the aft face raked forward 0.5 m toward the top, a slight batter
    const base = chamferRect(-U.x, U.x, U.zc, U.z1, 0.6), top = chamferRect(-U.x + 0.15, U.x - 0.15, U.zc + 0.2, U.z1 - 0.5, 0.5);
    P.add('paint', loft([ringAt(base, D(18) - 0.05), ringAt(base, U.low), ringAt(top, U.top - 0.4)], { top: false, bottom: false }), { tint: 0xf0f2f2, shade: (x, y) => (y > U.top - 1.2 ? 0.93 : 1) });
    for (const w of wallsOf(base, top, D(18), U.top - 0.4, 0, 20)) WALLS.push({ wall: w, heavy: true, high: false, doors: w.n.z > 0.5 });
    // intake grilles in two bands low on both sides [P: 8.8 to 10.7 m and 11.1 to 11.8 m]
    for (const s of [-1, 1]) {
      const x = s * (U.x + 0.02);
      for (let z = U.zc + 0.8; z < U.z1 - 0.9; z += 1.5) {
        for (const [y0, y1] of [[8.8, 10.7], [11.1, 11.8]]) {
          P.add('dark', box(0.05, y1 - y0, 1.2, x, (y0 + y1) / 2, z), { tier: 0, tint: 0x6e7678 });
          for (let y = y0 + 0.12; y < y1 - 0.05; y += 0.17) P.add('paint', box(0.1, 0.04, 1.15, x + s * 0.03, y, z), { tier: 2, tint: 0xc8cdcd });
        }
      }
      P.add('paint', box(0.12, 0.14, U.z1 - U.zc - 1.0, x, 12.0, (U.zc + U.z1) / 2), { tier: 1, tint: 0xe2e6e6 });
      vLadder(P, s * (U.x + 0.05), U.z1 - 0.7, D(25), U.top - 0.4, [s, 0]);
    }
    // the black cap with its overhanging brim, and the uptake mouths under a grating [P, A]
    const cap = chamferRect(-U.x + 0.05, U.x - 0.05, U.zc + 0.1, U.z1 - 0.35, 0.5), brim = chamferRect(-U.x - 0.1, U.x + 0.1, U.zc, U.z1 + 0.9, 0.6);
    P.add('black', loft([ringAt(cap, U.top - 0.42), ringAt(cap, U.top)], { top: false, bottom: false }), { tint: 0x7a7e7e });
    P.add('black', topProfile(brim, U.top - 0.5, U.top - 0.4), { tint: 0x8a8e8e });
    P.add('black', topProfile(chamferRect(-U.x + 0.4, U.x - 0.4, U.zc + 0.4, U.z1 - 0.7, 0.4), U.top - 0.35, U.top - 0.3), { tint: 0x555858 });
    for (let z = U.zc + 0.7; z < U.z1 - 0.7; z += 0.9) P.add('dark', box(2 * U.x - 0.9, 0.08, 0.1, 0, U.top - 0.05, z), { tier: 1, tint: 0x6a6e6e });
    for (let x = -U.x + 0.9; x < U.x - 0.5; x += 1.8) P.add('dark', box(0.1, 0.08, U.z1 - U.zc - 1.2, x, U.top - 0.05, (U.zc + U.z1) / 2), { tier: 1, tint: 0x6a6e6e });
    parts.soot = [0, U.top + 1.0, (U.zc + U.z1) / 2 + 2, 8];
  }

  // ===================================== boat crane and the boats
  {
    // the boat crane abaft the casing, its jib stowed rising forward to the casing's aft face, and
    // the tall king post beside it with its stays [P: 1986 broadside: jib head z 25.5 at 12.8 m,
    // post z 30 to 31.5 to 16.2 m]
    boatCrane(P, 0.0, D(L.crane.z), L.crane.z, 0, { jib: 5.6, luff: 0.42, post: 3.6 });
    {
      const kz = L.crane.z + 1.2, ky = D(kz);
      P.add('paint', yTube(ky, 16.2, 0.32, 0.22, 10, 1.6, kz));
      P.add('paint', rod(V(1.6, 15.6, kz), V(1.6, 15.6, kz - 2.2), 0.12, 6), { tier: 1 });
      for (const [dx, dz] of [[2.6, 2.4], [-1.0, 2.6]]) P.add('steel', rod(V(1.6, 15.9, kz), V(1.6 + dx, D(kz + dz) + 0.1, kz + dz), 0.02, 3), { tier: 2 });
      P.add('steel', rod(V(1.6, 15.5, kz - 2.2), V(1.6, 11.0, kz - 2.2), 0.02, 3), { tier: 2 });
      P.add('dark', box(0.3, 0.45, 0.25, 1.6, 10.8, kz - 2.2), { tier: 1 });
    }
    boatCradle(P, -7.6, D(32.5) + 0.55, 32.5, 0, 8.6, 2.6, 1.3);
    motorLaunch(P, -7.6, D(32.5) + 0.55, 32.5, 0, { L: 8.6, B: 2.6 });
    boatCradle(P, 7.9, D(16) + 0.55, 16.0, 0, 8.6, 2.6, 1.3);
    motorLaunch(P, 7.9, D(16) + 0.55, 16.0, 0, { L: 8.6, B: 2.6 });
    boatCradle(P, 7.7, D(30) + 0.45, 30.5, 0, 6.0, 2.1, 1.0);
    workBoat(P, 7.7, D(30) + 0.45, 30.5, 0, { L: 6.0, B: 2.1 });
  }

  // ===================================== Fort plinths: two raised stadiums [A, P aboard 1989]
  // In the 1984 frame from above they read as light as the roofs (light grey), not the weather
  // deck's red-brown they wear on Marshal Ustinov and Slava in 1989: painted grey for 1985.
  {
    const F = L.fort.plinth, y0 = D(40) - 0.02, y1 = D(40) + F.h;
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -F.x1 : F.x0, x1 = s < 0 ? -F.x0 : F.x1, r = (x1 - x0) / 2, cx = (x0 + x1) / 2;
      const plan = [...circlePts(cx, F.z0 + r, r, Math.PI, Math.PI * 2, 12), ...circlePts(cx, F.z1 - r, r, 0, Math.PI, 12)];
      P.add('roof', projected(topProfile(plan.slice().reverse(), y0, y1), 4), { uv: true });
      for (let k = 0; k < plan.length; k++) {
        const a = plan[k], b = plan[(k + 1) % plan.length];
        P.add('paint', rod(V(a[0], y1 - 0.04, a[1]), V(b[0], y1 - 0.04, b[1]), 0.06, 5), { tier: 1, tint: 0xd8dcdc });
      }
    }
    // the canvas-covered gear on the strip between the plinths [A: Ustinov 1988]
    for (const [z, l] of [[36.6, 4.2], [43.4, 3.6]]) P.add('canvas', box(1.2, 0.8, l, 0, y0 + 0.4, z), { tier: 1, tint: 0xb8bcb0 });
  }

  // ===================================== aft block, Top Dome house, hangar, pad
  {
    const A = L.aftBlock, PD = L.heliPad, HG = L.hangar;
    const a1 = house(P, { x0: -A.x, x1: A.x, z0: A.z0, z1: A.zWide, y0: D(56) - 0.05, y1: A.roof, c: 1.4, lean: 0.15, tint: 0xf1f3f3, heavy: true });
    for (const w of a1.walls) dress(P, w, rnd, { windows: Math.abs(w.n.x) > 0.9 || w.n.z < -0.9, winY: 0.32, rings: true });
    // the narrower hangar part abaft it, its roof sloping down to the lid [P: slope z 64.2 to 70.6]
    const hx = HG.x + 0.2;
    const hp = house(P, { plan: [[-hx, A.zWide - 0.2], [hx, A.zWide - 0.2], [hx, A.z1], [-hx, A.z1]], y0: D(64) - 0.05, y1: A.roof, tint: 0xeef1f1, heavy: true });
    for (const w of hp.walls) if (Math.abs(w.n.x) > 0.9) dress(P, w, rnd, { windows: false, lockers: false });
    {
      const yb = PD.y, hd = hx - 0.35;
      // side cheeks under the slope, then the door panel between its frames
      for (const s of [-1, 1]) {
        P.add('paint', sidePlate([[A.z1, D(A.z1)], [A.zSlope, D(A.zSlope)], [A.zSlope, yb], [A.z1, A.roof]], [], s * (hx - 0.06), 0.12), { tint: 0xe8ecec, shade: (px, py) => (py < D(66) + 0.05 ? 0.72 : 1) });
        const g = new THREE.BufferGeometry().setFromPoints(s < 0
          ? [V(-hx, A.roof, A.z1), V(-hd, A.roof, A.z1), V(-hx, yb, A.zSlope), V(-hd, A.roof, A.z1), V(-hd, yb, A.zSlope), V(-hx, yb, A.zSlope)]
          : [V(hd, A.roof, A.z1), V(hx, A.roof, A.z1), V(hd, yb, A.zSlope), V(hx, A.roof, A.z1), V(hx, yb, A.zSlope), V(hd, yb, A.zSlope)]);
        g.computeVertexNormals();
        P.add('paint', g, { tint: 0xe4e8e8 });
        door(P, V(s * (hx - 0.05), D(67.5) + 0.05, 67.5), V(0, 0, -s), V(s, 0, 0), { h: 1.75 });
      }
      const door0 = new THREE.BufferGeometry().setFromPoints([V(-hd, A.roof, A.z1), V(hd, A.roof, A.z1), V(-hd, yb, A.zSlope), V(hd, A.roof, A.z1), V(hd, yb, A.zSlope), V(-hd, yb, A.zSlope)]);
      door0.computeVertexNormals();
      P.add('paint', door0, { tint: 0xcdd2d3 });
      for (let k = 1; k < 7; k++) { const t = k / 7; P.add('dark', box(2 * hd - 0.2, 0.06, 0.08, 0, A.roof + (yb - A.roof) * t + 0.04, A.z1 + (A.zSlope - A.z1) * t + 0.03), { tier: 1 }); }
      for (const s of [-1, 1]) P.add('dark', bar(V(s * hd, A.roof, A.z1), V(s * hd, yb, A.zSlope), 0.1, 0.1), { tier: 1 });
      // the long boom stowed along the slope's port side [P: 1986 broadside]
      P.add('steel', rod(V(-hx - 0.3, A.roof + 0.6, A.zWide - 4.0), V(-hx - 0.3, yb + 0.6, A.zSlope + 1.5), 0.12, 6), { tint: 0xc8cccc });
    }
    roofRail(P, a1, A.roof, { skip: ([x, z]) => z > A.zWide - 0.5 && Math.abs(x) < hx + 0.5 });
    // the main-deck liferaft row along the block's sides [A: Ustinov 1988, seven canisters]
    for (const s of [-1, 1]) for (const z of [51.6, 54.1, 56.6, 59.1]) liferaftRack(P, V(s * (A.x + 0.75), D(z), z), Math.PI / 2, 1, 2);
    // Top Dome house [P: z 55.7 to 59.3, 11.5 to 15.3 m]
    // [P: Marshal Ustinov 1989: a chamfered box with doors on its sides and a railed top round the
    // director's base ring]
    const td = house(P, { x0: -2.9, x1: 2.9, z0: 55.3, z1: 59.9, y0: A.roof, y1: L.topDome.top, c: 0.8, tint: 0xe9ecec });
    for (const w of td.walls) dress(P, w, rnd, { windows: false, lockers: false, vents: false, doors: true });
    rail(P, chamferRect(-2.9, 2.9, 55.3, 59.9, 0.8), L.topDome.top, { closed: true });
    vLadder(P, 2.95, 58.9, A.roof, L.topDome.top, [1, 0]);
    // the base plinth's red-brown band (photographed at the house's foot on Marshal Ustinov, 1989)
    P.add('plinth', projected(loft([ringAt(chamferRect(-2.95, 2.95, 55.25, 59.95, 0.8), A.roof), ringAt(chamferRect(-2.95, 2.95, 55.25, 59.95, 0.8), A.roof + 0.35)], { top: false, bottom: false }), 4), { uv: true });
    // Pop Group pedestals at the block's after corners [A: Ustinov 1988]
    for (const s of [-1, 1]) {
      P.add('paint', yTube(A.roof, A.roof + 0.6, 0.9, 1.0, 16, s * 4.8, 61.4), { tint: 0xe6eaea });
      P.add('roof', yTube(A.roof + 0.58, A.roof + 0.62, 0.88, 0.88, 16, s * 4.8, 61.4));
    }
    // the hangar lid between the Osa drums, at the pad's level [A]
    house(P, { x0: -HG.x, x1: HG.x, z0: A.zSlope - 0.05, z1: PD.z0 + 0.3, y0: D(71) - 0.05, y1: PD.y, c: 0.25, tint: 0xe8ecec, roof: true, coaming: false });
    // the pad: chamfered forward corners, on a central ramp housing and edge pillars [A: Ustinov
    // 1988: the quarterdeck stays open under the pad's sides]
    {
      const x = PD.x, c = 2.6, z0 = PD.z0, z1 = PD.z1;
      const oct = [[-x + c, z0], [x - c, z0], [x, z0 + c], [x, z1 - 0.6], [x - 0.6, z1], [-x + 0.6, z1], [-x, z1 - 0.6], [-x, z0 + c]];
      P.add('paint', topProfile(oct, PD.y - 0.32, PD.y - 0.02), { tint: 0xd8dcdc, shade: (px, py) => (py < PD.y - 0.2 ? 0.6 : 1) });
      parts.padOutline = oct;
      rail(P, oct, PD.y, { closed: true, h: 1.0 });
      const ph = house(P, { x0: -3.2, x1: 3.2, z0, z1: z1 - 2.5, y0: D(83) - 0.05, y1: PD.y - 0.3, c: 0.5, tint: 0xe6eaea, roof: false });
      for (const w of ph.walls) dress(P, w, rnd, { windows: false, vents: true, lockers: false, pipes: false });
      for (const s of [-1, 1]) {
        P.add('paint', box(0.3, 0.45, z1 - z0 - 1.0, s * (x - 0.4), PD.y - 0.5, (z0 + z1) / 2 + 0.3), { tint: 0xc8cdcd });
        for (let z = z0 + 2.5; z < z1 - 0.5; z += 4.2) {
          P.add('paint', yTube(D(z), PD.y - 0.7, 0.16, 0.16, 8, s * (x - 0.6), z), { tier: 0 });
          P.add('paint', bar(V(s * (x - 0.6), PD.y - 0.75, z), V(s * 3.2, PD.y - 1.4, z), 0.12), { tier: 1 });
        }
        // the folded safety-net frames along the pad's edges
        for (let z = z0 + 3; z < z1 - 0.5; z += 2.0) P.add('steel', rod(V(s * (x + 0.05), PD.y - 0.25, z), V(s * (x + 0.3), PD.y + 0.85, z), 0.03, 4), { tier: 2 });
      }
      // the helicopter control post: a small glazed cab at the pad's forward starboard corner [A]
      P.add('paint', box(1.8, 2.0, 1.8, x - 2.0, PD.y + 1.0, z0 + 1.6), { tint: 0xe9ecec });
      P.add('glass', box(1.5, 0.6, 0.04, x - 2.0, PD.y + 1.45, z0 + 0.68), { tier: 1 });
      P.add('glass', box(0.04, 0.6, 1.4, x - 2.92, PD.y + 1.45, z0 + 1.6), { tier: 1 });
    }
  }

  // ===================================== whips along the blocks
  for (const s of [-1, 1]) {
    for (const z of [-56, -47]) whip(P, s * 3.0, H.roof0, z, 7 + rnd() * 2);
    for (const z of [-28, -12.5]) whip(P, s * 6.8, BB.roof, z, 8 + rnd() * 2);
    for (const z of [51, 61]) whip(P, s * (L.aftBlock.x - 0.4), L.aftBlock.roof, z, 9 + rnd() * 2);
  }

  clutterAll(P);
  return parts;
}
void onWall;
