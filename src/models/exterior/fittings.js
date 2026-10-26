import * as THREE from 'three';
import { V, box, rod, bar, xf, yTube, zTube, xTube, hRing, vRing, sphere, dome, lathe, chain, handwheel, mergeAll, chamferRect, ringAt, loft, TAU } from './kit.js';

// Small fittings shared by hull and superstructure, all written into a Parts collector (P) at
// ship-space positions. Sizes follow Soviet practice where photographs show them (1.1 m rails
// with three courses, oval watertight doors with six dogs, mushroom and gooseneck vents,
// cylindrical PSN liferaft canisters in racks of six); anything else is a stated estimate.

// --------------------------------------------------------------- railings

// Railing along a polyline of [x, z] points at deck height y (number or function of x, z):
// stanchions every `pitch` m, a top rail and two lower courses (wire in service, drawn as thin bars).
export function rail(P, pts, y, { h = 1.1, pitch = 1.5, tier = 2, key = 'paint', closed = false } = {}) {
  const Y = typeof y === 'function' ? y : () => y;
  const path = closed ? [...pts, pts[0]] : pts;
  for (let i = 0; i < path.length - 1; i++) {
    const [x0, z0] = path[i], [x1, z1] = path[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.05) continue;
    const n = Math.max(1, Math.round(len / pitch));
    for (let k = 0; k <= n; k++) {
      if (k === 0 && i > 0) continue;
      const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, yy = Y(x, z);
      P.add(key, bar(V(x, yy, z), V(x, yy + h, z), 0.045), { tier });
    }
    const a = (dy) => V(x0, Y(x0, z0) + dy, z0), b = (dy) => V(x1, Y(x1, z1) + dy, z1);
    P.add(key, rod(a(h), b(h), 0.028, 5), { tier });
    for (const dy of [h * 0.66, h * 0.33]) P.add('steel', bar(a(dy), b(dy), 0.016), { tier });
  }
}

// Rail round a rectangle (plan corners x0..x1, z0..z1), leaving `gaps` as [[side, from, to]] where
// side is 'n' (forward edge z0), 's' (aft edge z1), 'e' (+x), 'w' (-x).
export function rectRail(P, x0, x1, z0, z1, y, opt = {}) {
  const sides = opt.sides || 'nesw';
  const runs = { n: [[x0, z0], [x1, z0]], e: [[x1, z0], [x1, z1]], s: [[x1, z1], [x0, z1]], w: [[x0, z1], [x0, z0]] };
  for (const s of sides) rail(P, runs[s], y, opt);
}

// --------------------------------------------------------------- ladders

// Inclined ladder (companion) from a (foot) to b (head), width w, with handrails.
export function ladder(P, a, b, { w = 0.7, tier = 1 } = {}) {
  const d = b.clone().sub(a), len = d.length();
  const side = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(w / 2);
  for (const s of [-1, 1]) {
    P.add('steel', bar(a.clone().addScaledVector(side, s), b.clone().addScaledVector(side, s), 0.05, 0.22), { tier, tint: 0xb8bcbe });
    P.add('paint', rod(a.clone().addScaledVector(side, s * 1.05).add(V(0, 0.9, 0)), b.clone().addScaledVector(side, s * 1.05).add(V(0, 0.9, 0)), 0.025, 4), { tier: 2 });
  }
  const n = Math.max(2, Math.round(len / 0.28));
  for (let i = 1; i < n; i++) {
    const p = a.clone().lerp(b, i / n);
    P.add('dark', bar(p.clone().sub(side), p.clone().add(side), 0.05, 0.16), { tier: 2 });
  }
}

// Vertical ladder up a wall at (x, z), from y0 to y1, rungs facing along `facing` (unit [x, z]);
// a safety cage over 3 m.
export function vLadder(P, x, z, y0, y1, facing = [1, 0], { cage = true, tier = 2 } = {}) {
  const [fx, fz] = facing, sx = -fz * 0.22, sz = fx * 0.22, off = 0.18;
  const bx = x + fx * off, bz = z + fz * off;
  for (const s of [-1, 1]) P.add('steel', bar(V(bx + sx * s, y0, bz + sz * s), V(bx + sx * s, y1 + 0.9, bz + sz * s), 0.04), { tier });
  for (let y = y0 + 0.3; y < y1 + 0.1; y += 0.3) P.add('steel', bar(V(bx - sx, y, bz - sz), V(bx + sx, y, bz + sz), 0.025), { tier });
  if (cage && y1 - y0 > 3) {
    for (let y = y0 + 2.4; y < y1 + 0.9; y += 1.1) {
      const g = new THREE.TorusGeometry(0.38, 0.018, 3, 10, Math.PI).applyMatrix4(xf(bx + fx * 0.3, y, bz + fz * 0.3, Math.PI / 2, 0, -Math.atan2(fz, fx)));
      P.add('steel', g, { tier });
    }
    for (const a of [-0.8, 0, 0.8]) {
      const cx = bx + fx * (0.3 + Math.cos(a) * 0.38) - fz * Math.sin(a) * 0.38, cz = bz + fz * (0.3 + Math.cos(a) * 0.38) + fx * Math.sin(a) * 0.38;
      P.add('steel', bar(V(cx, y0 + 2.4, cz), V(cx, y1 + 0.9, cz), 0.02), { tier });
    }
  }
}

// --------------------------------------------------------------- doors, windows, ports

// Basis on a wall: origin c, along u (unit, horizontal), outward normal n.
const basis = (u, n) => {
  const m = new THREE.Matrix4().makeBasis(u.clone(), V(0, 1, 0), n.clone());
  return new THREE.Quaternion().setFromRotationMatrix(m);
};
// Add a geometry built in wall space (x along the wall, y up, z out of the wall) at c on the wall.
export function onWall(P, key, geom, c, u, n, o = {}) {
  const q = basis(u, n);
  P.add(key, geom.applyMatrix4(new THREE.Matrix4().compose(c, q, V(1, 1, 1))), o);
}

// Watertight door: rounded-corner leaf in a coaming frame, six dogs and a handle; door sill at y.
export function door(P, c, u, n, { w = 0.8, h = 1.75, tier = 1 } = {}) {
  const leaf = new THREE.Shape();
  const r = 0.22, x0 = -w / 2, x1 = w / 2, y1 = h;
  leaf.moveTo(x0 + r, 0); leaf.lineTo(x1 - r, 0); leaf.quadraticCurveTo(x1, 0, x1, r); leaf.lineTo(x1, y1 - r); leaf.quadraticCurveTo(x1, y1, x1 - r, y1);
  leaf.lineTo(x0 + r, y1); leaf.quadraticCurveTo(x0, y1, x0, y1 - r); leaf.lineTo(x0, r); leaf.quadraticCurveTo(x0, 0, x0 + r, 0);
  const frame = new THREE.ExtrudeGeometry(leaf, { depth: 0.06, bevelEnabled: false, curveSegments: 3 });
  onWall(P, 'paint', frame.scale(1.12, 1.06, 1).translate(0, -0.05, 0), c.clone(), u, n, { tier, tint: 0xdfe3e3 });
  const l = new THREE.ExtrudeGeometry(leaf, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 3 });
  onWall(P, 'paint', l.translate(0, 0, 0.06), c.clone(), u, n, { tier, tint: 0xc9cfd0 });
  for (const [dx, dy] of [[-1, 0.25], [-1, 0.5], [-1, 0.75], [1, 0.25], [1, 0.5], [1, 0.75]]) {
    onWall(P, 'steel', box(0.12, 0.05, 0.06, dx * (w / 2 - 0.04), dy * h, 0.16), c.clone(), u, n, { tier: 2 });
  }
  onWall(P, 'steel', box(0.05, 0.28, 0.05, w * 0.3, h * 0.5, 0.17), c.clone(), u, n, { tier: 2 });
}

// Window or scuttle row along a wall: rectangles with frames (rect) or round ports (round).
export function windowRow(P, a, b, y, n, u, nrm, { w = 0.9, h = 0.65, round = false, tier = 1, frame = true } = {}) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const c = a.clone().lerp(b, t);
    c.y = y;
    if (round) {
      onWall(P, 'glass', new THREE.CircleGeometry(w / 2, 14).translate(0, 0, 0.03), c.clone(), u, nrm, { tier, uv: true });
      if (frame) onWall(P, 'steel', new THREE.TorusGeometry(w / 2 + 0.035, 0.045, 4, 14).translate(0, 0, 0.05), c.clone(), u, nrm, { tier: 1, tint: 0xb0b6b8 });
    } else {
      // pane (UVs 0..1 on its face, for the glass texture) set back inside a frame proud of the wall
      onWall(P, 'glass', new THREE.PlaneGeometry(w, h).translate(0, 0, 0.025), c.clone(), u, nrm, { tier, uv: true });
      if (frame) {
        const t = 0.07, d = 0.1;
        onWall(P, 'paint', box(w + 2 * t, t, d, 0, h / 2 + t / 2, d / 2), c.clone(), u, nrm, { tier: 1, tint: 0xe2e6e6 });
        onWall(P, 'paint', box(w + 2 * t, t, d, 0, -h / 2 - t / 2, d / 2), c.clone(), u, nrm, { tier: 1, tint: 0xd5d9d9 });
        for (const sx of [-1, 1]) onWall(P, 'paint', box(t, h, d, sx * (w / 2 + t / 2), 0, d / 2), c.clone(), u, nrm, { tier: 1, tint: 0xdde1e1 });
        // rain visor above
        onWall(P, 'paint', box(w + 0.28, 0.04, 0.24, 0, h / 2 + 0.17, 0.12), c.clone(), u, nrm, { tier: 2 });
      }
    }
  }
}

// Louvred vent grille on a wall: frame and slats.
export function louvre(P, c, u, n, { w = 1.0, h = 0.8, tier = 1 } = {}) {
  onWall(P, 'dark', box(w, h, 0.05, 0, 0, 0.02), c.clone(), u, n, { tier });
  for (let y = -h / 2 + 0.08; y < h / 2 - 0.04; y += 0.1) {
    onWall(P, 'paint', box(w - 0.06, 0.035, 0.1, 0, y, 0.07).applyMatrix4(xf(0, 0, 0, -0.5, 0, 0)), c.clone(), u, n, { tier: 2 });
  }
  onWall(P, 'paint', box(w + 0.1, h + 0.1, 0.04, 0, 0, 0.01), c.clone(), u, n, { tier: 1, tint: 0xd8dcdc });
}

// --------------------------------------------------------------- deck gear

// Mushroom ventilator head on deck at (x, y, z).
export function mushroom(P, x, y, z, r = 0.35, h = 0.9, tier = 1) {
  P.add('paint', yTube(y, y + h, r * 0.45, r * 0.45, 10, x, z), { tier });
  P.add('paint', lathe([[0, 0], [r, 0], [r, 0.06], [r * 0.8, 0.18], [0, 0.26]], 12).translate(x, y + h, z), { tier });
}
// Gooseneck vent: pipe turning down.
export function gooseneck(P, x, y, z, r = 0.15, h = 0.8, ry = 0, tier = 2) {
  const g = mergeAll([
    yTube(0, h, r, r, 8),
    new THREE.TorusGeometry(r * 2, r, 6, 8, Math.PI).applyMatrix4(xf(r * 2, h, 0)),
    yTube(h - 0.25, h, r, r, 8, r * 4, 0),
  ]);
  P.add('paint', g.applyMatrix4(xf(x, y, z, 0, ry)), { tier });
}
// Pair of mooring bollards on a base plate.
export function bollard(P, x, y, z, ry = 0, tier = 1) {
  const g = mergeAll([
    box(1.3, 0.08, 0.55, 0, 0.04, 0),
    yTube(0.08, 0.6, 0.18, 0.16, 10, -0.38, 0), yTube(0.08, 0.6, 0.18, 0.16, 10, 0.38, 0),
    yTube(0.6, 0.66, 0.24, 0.24, 10, -0.38, 0), yTube(0.6, 0.66, 0.24, 0.24, 10, 0.38, 0),
  ]);
  P.add('dark', g.applyMatrix4(xf(x, y, z, 0, ry)), { tier, tint: 0xaaaaaa });
}
// Closed fairlead (panama chock) at the deck edge.
export function fairlead(P, x, y, z, ry = 0, tier = 1) {
  const g = mergeAll([box(0.9, 0.18, 0.25, 0, 0.09, 0), new THREE.TorusGeometry(0.28, 0.09, 5, 10).applyMatrix4(xf(0, 0.42, 0)), box(0.12, 0.3, 0.2, -0.36, 0.25, 0), box(0.12, 0.3, 0.2, 0.36, 0.25, 0)]);
  P.add('dark', g.applyMatrix4(xf(x, y, z, 0, ry)), { tier, tint: 0xa0a0a0 });
}
// Capstan / windlass head: drum with whelps on a base.
export function capstan(P, x, y, z, r = 0.55, tier = 0) {
  P.add('dark', yTube(y, y + 0.25, r * 1.35, r * 1.35, 18, x, z), { tier, tint: 0xa8a8a8 });
  P.add('dark', lathe([[r * 1.0, 0], [r * 0.82, 0.15], [r * 0.75, 0.5], [r * 0.85, 0.65], [r * 1.05, 0.72], [0, 0.78]], 16).translate(x, y + 0.25, z), { tier, tint: 0xb8b8b8 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    P.add('dark', box(0.06, 0.45, 0.12, x + Math.cos(a) * r * 0.82, y + 0.55, z + Math.sin(a) * r * 0.82, 0, -a), { tier: 1 });
  }
}
// Flush deck hatch with coaming and dogs.
export function hatch(P, x, y, z, w = 1.2, l = 1.0, tier = 1) {
  P.add('paint', box(w + 0.16, 0.22, l + 0.16, x, y + 0.11, z), { tier, tint: 0xd5d9d9 });
  P.add('paint', box(w, 0.06, l, x, y + 0.25, z), { tier, tint: 0xbfc5c6 });
  for (const s of [-1, 1]) P.add('steel', box(0.06, 0.06, 0.16, x + s * w * 0.32, y + 0.31, z), { tier: 2 });
}
// Deck locker: a box with a pitched lid.
export function locker(P, x, y, z, w = 1.0, h = 0.8, d = 0.6, ry = 0, tier = 1) {
  P.add('paint', box(w, h, d, 0, h / 2, 0).applyMatrix4(xf(x, y, z, 0, ry)), { tier, tint: 0xe0e4e4 });
  P.add('paint', box(w + 0.06, 0.05, d + 0.06, 0, h + 0.02, 0).applyMatrix4(xf(x, y, z, 0, ry)), { tier: 2 });
  P.add('steel', box(0.15, 0.06, 0.04, 0, h * 0.7, d / 2 + 0.02).applyMatrix4(xf(x, y, z, 0, ry)), { tier: 2 });
}
// Life ring in a wall bracket (orange with white bands is post-war standard; Soviet rings were
// orange-red with white bands).
export function lifeRing(P, c, u, n, tier = 1) {
  onWall(P, 'orange', new THREE.TorusGeometry(0.33, 0.08, 6, 14).translate(0, 0, 0.12), c.clone(), u, n, { tier });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    onWall(P, 'white', box(0.1, 0.18, 0.18, Math.cos(a) * 0.33, Math.sin(a) * 0.33, 0.12, 0, 0, a), c.clone(), u, n, { tier: 2 });
  }
}
// Rack of PSN liferaft canisters: rows x cols white cylinders lying across a cradle, axis along `u`.
export function liferaftRack(P, c, ry, rows = 2, cols = 3, tier = 1) {
  const list = [], frame = [];
  const L = 1.25, R = 0.3;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const y = 0.35 + r * 0.66, z = (k - (cols - 1) / 2) * 0.7;
    list.push(xTube(-L / 2, L / 2, R, R, 12, y, z));
    // two straps and the end bands
    for (const x of [-0.3, 0.3]) frame.push(new THREE.TorusGeometry(R + 0.01, 0.022, 3, 12).applyMatrix4(xf(x, y, z, 0, Math.PI / 2)));
  }
  for (const x of [-L / 2 + 0.1, L / 2 - 0.1]) {
    frame.push(box(0.06, rows * 0.66 + 0.1, cols * 0.7, x, (rows * 0.66 + 0.1) / 2, 0));
  }
  frame.push(box(L, 0.06, cols * 0.7, 0, 0.03, 0));
  const m = xf(c.x, c.y, c.z, 0, ry);
  P.add('white', mergeAll(list).applyMatrix4(m), { tier });
  P.add('steel', mergeAll(frame).applyMatrix4(m), { tier: 2, tint: 0x9aa0a2 });
}

// --------------------------------------------------------------- boats and cranes

// Ship's launch, about L m long, in a cradle: white hull with a sheer, cabin, canvas, rubbing strake.
// Origin at the keel bottom amidships, bow toward -Z in boat space.
export function boatGeometry(L = 9.5, B = 2.7, D = 1.4) {
  const rings = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n, z = -L / 2 + t * L;
    // plan: fine bow, fuller stern with a transom
    const half = B / 2 * (t < 0.6 ? Math.sin((t / 0.6) * Math.PI / 2) ** 0.7 : 1 - (t - 0.6) * 0.25);
    const sheer = D + (1 - t) ** 3 * 0.45;
    const ring = [];
    const m = 8;
    for (let k = 0; k <= m; k++) {
      const a = (k / m) * Math.PI; // 0 starboard gunwale -> pi port gunwale, through the keel
      const x = Math.cos(a) * half * (0.6 + 0.4 * Math.sin(a) ** 0.3) ;
      const y = sheer - Math.sin(a) * (sheer * (0.95 - 0.25 * (1 - t)));
      ring.push(V(x, Math.max(0, y), z));
    }
    rings.push(ring);
  }
  // build an open-topped strip and a deck lid
  const pos = [];
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < rings[i].length - 1; k++) {
    const a = rings[i][k], b = rings[i + 1][k], c = rings[i][k + 1], d = rings[i + 1][k + 1];
    pos.push(a, c, b, b, c, d);
  }
  const hull = new THREE.BufferGeometry().setFromPoints(pos);
  hull.computeVertexNormals();
  const deckPts = rings.map((r) => [r[0].x, r[0].z]);
  const deckShape = [...deckPts.map(([x, z]) => [x, z]), ...deckPts.slice().reverse().map(([x, z]) => [-x, z])];
  return { hull, deck: deckShape, L, B, D };
}

export function boat(P, x, y, z, ry = 0, { L = 9.5, B = 2.7, tier = 0, canvas = true } = {}) {
  const g = boatGeometry(L, B);
  const m = xf(x, y, z, 0, ry);
  P.add('white', g.hull.applyMatrix4(m), { tier });
  // deck/canvas cover over the gunwale, cabin aft, windscreen
  const shape = new THREE.Shape(g.deck.map(([bx, bz]) => new THREE.Vector2(bx * 0.97, -bz)));
  const lid = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, g.D + 0.02, 0);
  P.add(canvas ? 'canvas' : 'white', lid.applyMatrix4(m), { tier });
  P.add('white', box(B * 0.72, 0.85, L * 0.32, 0, g.D + 0.45, L * 0.08).applyMatrix4(m), { tier });
  P.add('glass', box(B * 0.66, 0.32, 0.05, 0, g.D + 0.62, L * 0.08 - L * 0.16 - 0.01).applyMatrix4(m), { tier: 1 });
  P.add('dark', box(B * 0.74, 0.06, L * 0.34, 0, g.D + 0.9, L * 0.08).applyMatrix4(m), { tier: 1 });
  // rubbing strake and keel
  P.add('dark', box(0.1, 0.12, L * 0.9, B / 2 - 0.02, g.D - 0.1, 0).applyMatrix4(m), { tier: 1 });
  P.add('dark', box(0.1, 0.12, L * 0.9, -B / 2 + 0.02, g.D - 0.1, 0).applyMatrix4(m), { tier: 1 });
  // cradle chocks
  for (const cz of [-L * 0.28, L * 0.28]) P.add('dark', box(B * 0.9, 0.35, 0.3, 0, -0.1, cz).applyMatrix4(m), { tier: 1 });
}

// Pedestal crane with a box jib, stowed along `ry` and luffed down by `luff`; heel at (x, y, z).
export function crane(P, x, y, z, ry, { jib = 14, luff = -0.18, post = 3.0, tier = 0 } = {}) {
  const m = xf(x, y, z, 0, ry);
  P.add('paint', yTube(0, post, 0.75, 0.65, 14).applyMatrix4(m), { tier });
  P.add('paint', box(1.8, 1.6, 2.4, 0, post + 0.8, 0.4).applyMatrix4(m), { tier }); // slewing house
  P.add('glass', box(1.2, 0.5, 0.04, 0, post + 1.1, -0.81).applyMatrix4(m), { tier: 1 });
  // jib: tapering box girder with lightening holes suggested by dark side panels
  const a = V(0, post + 1.2, -0.5), dir = V(0, Math.sin(luff), -Math.cos(luff));
  const b = a.clone().addScaledVector(dir, jib);
  const jg = mergeAll([bar(a, b, 0.7, 0.9).applyMatrix4(new THREE.Matrix4())]);
  P.add('paint', jg.applyMatrix4(m), { tier });
  P.add('dark', yTube(-0.5, 0.2, 0.18, 0.18, 8, 0, 0).applyMatrix4(xf(b.x, b.y, b.z)).applyMatrix4(m), { tier: 1 });
  // hook block and the fall
  P.add('steel', rod(b.clone().add(V(0, -0.3, 0)), b.clone().add(V(0, -2.2, 0)), 0.03, 4).applyMatrix4(m), { tier: 2 });
  P.add('dark', box(0.35, 0.5, 0.25, b.x, b.y - 2.4, b.z).applyMatrix4(m), { tier: 1 });
}

// --------------------------------------------------------------- antennas

// Whip antenna with its base insulator.
export function whip(P, x, y, z, h = 10, tier = 1, lean = [0, 0]) {
  P.add('white', yTube(y, y + 0.6, 0.12, 0.09, 8, x, z), { tier });
  P.add('steel', rod(V(x, y + 0.6, z), V(x + lean[0], y + h, z + lean[1]), 0.028, 4), { tier: 2 });
}
void sphere; void dome; void zTube; void hRing; void vRing; void chain; void handwheel; void chamferRect; void ringAt; void loft;
