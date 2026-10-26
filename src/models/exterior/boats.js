import * as THREE from 'three';
import { V, box, bar, rod, xf, yTube, zTube, xTube, sphere, mergeAll } from './kit.js';

// Ship's boats and the boat cranes amidships, from the 1983 port-amidships and the 1985 bow
// photographs: white motor launches with a raised cabin and a row of windows, a smaller open boat
// under a canvas cover, both in cradles with gripes on the 01-level boat deck, and two pedestal
// cranes on the aft block whose box jibs rise forward over the boat bays. Hull lines, cabin
// proportions and crane details are reconstructions at the photographs' resolution [E].

// Boat hull as a lofted shell: stations from the stem (t = 0) to the transom (t = 1). Origin at the
// keel amidships, bow toward -Z. Returns { hull, deckEdge(t) }.
function hullShell(L, B, D, { fine = 0.55, transom = 0.72 } = {}) {
  const n = 16, m = 10;
  const half = (t) => (B / 2) * (t < fine ? Math.sin((t / fine) * Math.PI / 2) ** 0.75 : 1 - ((t - fine) / (1 - fine)) * (1 - transom) * 0.5);
  const sheer = (t) => D + (1 - t) ** 2.4 * 0.5; // the bow rises
  const keelY = (t) => (t < 0.12 ? (0.12 - t) * 2.5 : 0); // forefoot curving up into the stem
  const rings = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, z = -L / 2 + t * L, hw = Math.max(0.02, half(t)), sh = sheer(t), k = keelY(t);
    const ring = [];
    for (let j = 0; j <= m; j++) {
      // round from the starboard gunwale (j = 0) through the keel (j = m / 2) to port (j = m)
      const a = (j / m) * Math.PI;
      const sx = Math.cos(a), sy = Math.sin(a);
      // V bottom forward, firm round bilge aft
      const vee = 1 - t;
      const x = sx * hw * (1 - 0.15 * sy * sy * (1 - vee));
      const y = sh - sy * (sh - k) * (0.6 + 0.4 * (1 - Math.abs(sx) ** (1.5 + vee * 2)));
      ring.push(V(x, Math.max(k, y), z));
    }
    rings.push(ring);
  }
  // indexed so the shell shades smoothly; the transom is a separate flat plate
  const pos = [], idx = [];
  for (const r of rings) for (const p of r) pos.push(p.x, p.y, p.z);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a = i * (m + 1) + j, b = a + m + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  shell.setIndex(idx);
  shell.computeVertexNormals();
  const tr = rings[n], tp = [];
  for (let j = 1; j < m - 1; j++) tp.push(tr[0], tr[j + 1], tr[j]);
  const plate = new THREE.BufferGeometry().setFromPoints(tp);
  plate.computeVertexNormals();
  const g = mergeAll([shell, plate]);
  return { hull: g, half, sheer, rings, n, m };
}

// Deck or cover over the gunwales, following the sheer, as a strip across.
function coverGeometry(sh, L, inset = 0.04, lift = 0.02) {
  const pos = [];
  for (let i = 0; i < sh.n; i++) {
    const a = sh.rings[i], b = sh.rings[i + 1];
    const p = (r, s) => V(s * Math.max(0, Math.abs(r[0].x) - inset), r[0].y + lift, r[0].z);
    pos.push(p(a, 1), p(a, -1), p(b, 1), p(b, 1), p(a, -1), p(b, -1));
  }
  const g = new THREE.BufferGeometry().setFromPoints(pos);
  g.computeVertexNormals();
  return g;
}

// Motor launch with a cabin amidships and a row of windows (the photographed white launches).
export function motorLaunch(P, x, y, z, ry = 0, { L = 9.5, B = 2.8, D = 1.35, tier = 0 } = {}) {
  const m = xf(x, y, z, 0, ry);
  const sh = hullShell(L, B, D);
  P.add('white', sh.hull.applyMatrix4(m), { tier });
  P.add('white', coverGeometry(sh, L).applyMatrix4(m), { tier, tint: 0xe4e6e0 });
  // rubbing strake (dark) and boot line (red) along the hull
  for (const s of [-1, 1]) {
    for (let i = 1; i < sh.n; i++) {
      const a = sh.rings[i][s > 0 ? 0 : sh.m], b = sh.rings[i + 1][s > 0 ? 0 : sh.m];
      P.add('dark', bar(a.clone().add(V(s * 0.03, -0.12, 0)), b.clone().add(V(s * 0.03, -0.12, 0)), 0.07, 0.1).applyMatrix4(m), { tier: 1 });
    }
  }
  // keel bar and stem
  P.add('dark', box(0.12, 0.12, L * 0.85, 0, 0.0, L * 0.05).applyMatrix4(m), { tier: 1 });
  // the cabin: from 0.22 L to 0.62 L, its front sloping back, a slightly crowned roof
  const c0 = -L / 2 + L * 0.24, c1 = -L / 2 + L * 0.64, cw = B * 0.78, cy = D + 0.15, ch = 1.05;
  const prof = [[c1, cy], [c0 + 0.25, cy], [c0, cy + 0.25], [c0 + 0.35, cy + ch], [c1, cy + ch]];
  const shape = new THREE.Shape(prof.map(([pz, py]) => new THREE.Vector2(pz, py)));
  const cab = new THREE.ExtrudeGeometry(shape, { depth: cw, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 });
  cab.translate(0, 0, -cw / 2).rotateY(-Math.PI / 2);
  P.add('white', cab.applyMatrix4(m), { tier });
  P.add('white', box(cw + 0.06, 0.06, c1 - c0 - 0.2, 0, cy + ch + 0.06, (c0 + c1) / 2 + 0.1).applyMatrix4(m), { tier: 1, tint: 0xd9dbd5 });
  // window row on both sides and the windscreen
  const nw = 5;
  for (const s of [-1, 1]) for (let i = 0; i < nw; i++) {
    const wz = c0 + 0.6 + (i * (c1 - c0 - 0.9)) / (nw - 1);
    P.add('glass', box(0.03, 0.38, 0.5, s * (cw / 2 + 0.055), cy + ch * 0.62, wz).applyMatrix4(m), { tier: 1 });
  }
  for (const s of [-1, 0, 1]) P.add('glass', box(cw * 0.3, 0.34, 0.03, s * cw * 0.32, cy + ch * 0.66, c0 + 0.2 + 0.03).applyMatrix4(xf(0, 0, 0, -0.55)).applyMatrix4(m), { tier: 1 });
  // a handrail on the cabin roof, a small mast with its light, an exhaust
  for (const s of [-1, 1]) P.add('steel', rod(V(s * cw * 0.42, cy + ch + 0.2, c0 + 0.6), V(s * cw * 0.42, cy + ch + 0.2, c1 - 0.3), 0.025, 4).applyMatrix4(m), { tier: 2 });
  P.add('steel', yTube(cy + ch, cy + ch + 1.2, 0.04, 0.03, 6, 0, c0 + 0.9).applyMatrix4(m), { tier: 2 });
  P.add('lamp', sphere(0.06, 0, cy + ch + 1.25, c0 + 0.9, 1, 1, 1, 6).applyMatrix4(m), { tier: 2 });
  P.add('dark', yTube(cy + ch, cy + ch + 0.45, 0.09, 0.09, 8, cw * 0.25, c1 - 0.4).applyMatrix4(m), { tier: 2 });
  // fenders hung along the sides and the cockpit coaming aft
  for (const s of [-1, 1]) for (const fz of [-L * 0.2, 0, L * 0.2]) P.add('rubber', yTube(D - 0.75, D - 0.25, 0.12, 0.12, 8, s * (B / 2 + 0.08), fz).applyMatrix4(m), { tier: 2 });
  P.add('white', box(B * 0.8, 0.3, 0.06, 0, D + 0.15, L * 0.36).applyMatrix4(m), { tier: 1 });
}

// Open workboat under a canvas cover with a ridge (the smaller boats in the photographs).
export function workBoat(P, x, y, z, ry = 0, { L = 6.5, B = 2.2, D = 1.0, tier = 0 } = {}) {
  const m = xf(x, y, z, 0, ry);
  const sh = hullShell(L, B, D, { fine: 0.5, transom: 0.8 });
  P.add('white', sh.hull.applyMatrix4(m), { tier });
  // the cover: two sloping planes over a ridge pole, lashed along the gunwales
  const pos = [];
  for (let i = 0; i < sh.n; i++) {
    const a = sh.rings[i], b = sh.rings[i + 1];
    const ridge = (r) => V(0, r[0].y + 0.4, r[0].z), side = (r, s) => V(s * Math.abs(r[0].x) * 1.02, r[0].y + 0.02, r[0].z);
    pos.push(side(a, 1), ridge(a), side(b, 1), side(b, 1), ridge(a), ridge(b));
    pos.push(ridge(a), side(a, -1), ridge(b), ridge(b), side(a, -1), side(b, -1));
  }
  const cov = new THREE.BufferGeometry().setFromPoints(pos);
  cov.computeVertexNormals();
  P.add('canvas', cov.applyMatrix4(m), { tier });
  for (const s of [-1, 1]) for (let i = 1; i < sh.n; i++) {
    const a = sh.rings[i][s > 0 ? 0 : sh.m], b = sh.rings[i + 1][s > 0 ? 0 : sh.m];
    P.add('dark', bar(a.clone().add(V(s * 0.03, -0.08, 0)), b.clone().add(V(s * 0.03, -0.08, 0)), 0.06, 0.08).applyMatrix4(m), { tier: 1 });
  }
}

// Cradle under a boat of length L (keel at y): two chocks shaped to the hull, a base frame and two
// gripes (straps) over the boat.
export function boatCradle(P, x, y, z, ry, L, B, D) {
  const m = xf(x, y, z, 0, ry);
  for (const cz of [-L * 0.28, L * 0.25]) {
    P.add('paint', box(B * 0.95, 0.5, 0.35, 0, -0.1, cz).applyMatrix4(m), { tint: 0xd8dcdc });
    for (const s of [-1, 1]) P.add('paint', box(0.25, 0.75, 0.35, s * B * 0.42, 0.25, cz).applyMatrix4(m), { tint: 0xd8dcdc });
    P.add('dark', box(B * 0.98, 0.04, 0.12, 0, D + 0.62, cz).applyMatrix4(m), { tier: 2 });
    for (const s of [-1, 1]) P.add('dark', box(0.04, D + 0.9, 0.12, s * (B / 2 + 0.06), D * 0.3, cz).applyMatrix4(m), { tier: 2 });
  }
  P.add('paint', box(0.25, 0.25, L * 0.7, 0, -0.45, 0).applyMatrix4(m), { tier: 1 });
}

// Pedestal crane: pedestal and slewing platform with the cab, a tapering box jib with lightening
// holes rising along `ry` (0 = forward) at `luff` rad, a luffing ram, the head sheaves, falls and
// the hook. Heel at (x, y, z) = top of the deck it stands on.
export function boatCrane(P, x, y, z, ry, { jib = 17, luff = 0.27, post = 1.4, tier = 0 } = {}) {
  const m = xf(x, y, z, 0, ry);
  const add = (key, g, o = {}) => P.add(key, g.applyMatrix4(m), { tier, ...o });
  add('paint', yTube(0, post, 0.85, 0.75, 16));
  add('dark', yTube(post - 0.12, post, 1.05, 1.05, 18), { tint: 0x9aa0a2 });
  add('paint', box(2.0, 0.35, 3.0, 0, post + 0.17, 0.5));
  // cab on the slewing platform, glazed forward and to the sides
  add('paint', box(1.5, 1.7, 1.8, -0.55, post + 1.2, 1.2), { tint: 0xe9ecec });
  add('glass', box(1.2, 0.6, 0.03, -0.55, post + 1.55, 0.29));
  add('glass', box(0.03, 0.6, 1.2, -1.31, post + 1.55, 1.2));
  add('paint', box(1.7, 0.08, 2.0, -0.55, post + 2.08, 1.2), { tier: 1 });
  // machinery house and counterweight aft
  add('paint', box(1.6, 1.2, 1.4, 0.45, post + 0.95, 1.8), { tint: 0xdde1e1 });
  add('dark', box(1.7, 0.7, 0.6, 0.45, post + 0.7, 2.6), { tint: 0x8a9092 });
  // the jib: tapering box girder in segments, lightening holes along both sides
  const heel = V(0.35, post + 0.9, -0.3), dir = V(0, Math.sin(luff), -Math.cos(luff));
  const seg = 8;
  for (let i = 0; i < seg; i++) {
    const a = heel.clone().addScaledVector(dir, (jib * i) / seg), b = heel.clone().addScaledVector(dir, (jib * (i + 1)) / seg);
    const k = 1 - (i + 0.5) / seg * 0.45;
    add('paint', bar(a, b, 0.62 * k, 0.85 * k));
    if (i > 0 && i < seg - 1) {
      const c = a.clone().lerp(b, 0.5);
      for (const s of [-1, 1]) add('black', new THREE.CircleGeometry(0.22 * k, 10).applyMatrix4(new THREE.Matrix4().compose(c.clone().add(V(s * (0.31 * k + 0.005), 0, 0)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s * Math.PI / 2, 0)), V(1, 1, 1))), { tier: 1 });
    }
  }
  const head = heel.clone().addScaledVector(dir, jib);
  add('steel', xTube(-0.25, 0.25, 0.3, 0.3, 12, head.y, head.z), { tier: 1 });
  // luffing ram from the platform to a third of the way up the jib
  const ramTop = heel.clone().addScaledVector(dir, jib * 0.3).add(V(0, -0.35, 0));
  add('steel', rod(V(0.35, post + 0.35, -0.9), ramTop, 0.13, 8), { tier: 1, tint: 0xaab0b2 });
  add('paint', rod(V(0.35, post + 0.35, -0.9), V(0.35, post + 0.35, -0.9).lerp(ramTop, 0.55), 0.18, 8), { tier: 1 });
  // falls and hook block hanging from the head, made fast to an eye on the deck below
  const hook = head.clone().add(V(0, -2.8, 0));
  add('steel', rod(head.clone().add(V(0.08, -0.25, 0)), hook.clone().add(V(0.08, 0.3, 0)), 0.02, 3), { tier: 2 });
  add('steel', rod(head.clone().add(V(-0.08, -0.25, 0)), hook.clone().add(V(-0.08, 0.3, 0)), 0.02, 3), { tier: 2 });
  add('dark', box(0.32, 0.55, 0.22, hook.x, hook.y, hook.z), { tier: 1 });
  add('orange', box(0.34, 0.12, 0.24, hook.x, hook.y + 0.32, hook.z), { tier: 2 });
  return head.applyMatrix4(m);
}
void zTube; void mergeAll;
