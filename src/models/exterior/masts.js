import * as THREE from 'three';
import { V, box, bar, rod, xf, yTube, zTube, xTube, sphere, dome, hRing, lathe, dish, mergeAll, mulberry32, Parts, TAU } from './kit.js';
import { rail, vLadder, whip } from './fittings.js';
import { LAYOUT } from './lines.js';

// Masts and sensors as fitted in 1985 (identities from public sources; shapes from the USN 1983,
// 1985 and 1986 photographs):
//   MR-800 Voskhod "Top Pair": back-to-back pair on the forward tower's conical mast, the large
//     curved lattice reflector (Top Sail type) and the oval lattice dish (Big Net type). Rotates.
//   MR-700 Fregat "Top Steer": smaller back-to-back pair on the aft tower. Rotates.
//   Palm Frond navigation radars: slotted bars on the forward tower yard. Rotate.
//   Side Globe ECM radomes: spheres on brackets stacked at the towers' corners.
//   Yards with signal halyards, the aft lattice mast, whips, the ensign on a gaff.
// Antenna sizes are scaled from the photographs against the 252 m length [E within about 15 %].

// Curved lattice reflector: a cylindrical section concave toward -Z (local), w wide, h tall,
// sagitta s; lattice ground on a tube frame with ribs. Returns { lattice, frame } geometries.
function cylReflector(w, h, s, { ribsX = 4, ribsY = 6, tube = 0.06 } = {}) {
  const nx = 10, ny = 16;
  const z = (y) => -s * (1 - (2 * y / h) ** 2) * -1; // edges forward (negative z) of the vertex
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const x = -w / 2 + (w * i) / nx, y = -h / 2 + (h * j) / ny;
    pos.push(x, y, -s * (2 * y / h) ** 2);
    uv.push(x / 1.2, y / 1.2);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + nx + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const lat = new THREE.BufferGeometry();
  lat.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lat.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  lat.setIndex(idx);
  lat.computeVertexNormals();
  const f = [];
  const P3 = (x, y) => V(x, y, -s * (2 * y / h) ** 2);
  const n = 12;
  for (let j = 0; j < n; j++) {
    const y0 = -h / 2 + (h * j) / n, y1 = -h / 2 + (h * (j + 1)) / n;
    for (const x of [-w / 2, w / 2]) f.push(rod(P3(x, y0), P3(x, y1), tube * 1.3, 5));
    for (let r = 1; r < ribsX; r++) { const x = -w / 2 + (w * r) / ribsX; f.push(rod(P3(x, y0), P3(x, y1), tube * 0.8, 4)); }
  }
  for (let r = 0; r <= ribsY; r++) {
    const y = -h / 2 + (h * r) / ribsY;
    f.push(rod(P3(-w / 2, y), P3(w / 2, y), r === 0 || r === ribsY ? tube * 1.3 : tube * 0.8, 4));
  }
  void z;
  return { lattice: lat, frame: mergeAll(f) };
}

// Elliptic lattice dish (paraboloid) facing -Z, a x b semi-axes, depth d.
function ovalDish(a, b, d, tube = 0.05) {
  const seg = 20, rings = 6;
  const pos = [], uv = [], idx = [];
  for (let r = 0; r <= rings; r++) for (let k = 0; k <= seg; k++) {
    const t = r / rings, ang = (k / seg) * TAU;
    const x = Math.cos(ang) * a * t, y = Math.sin(ang) * b * t;
    pos.push(x, y, -d * t * t);
    uv.push(x / 1.0, y / 1.0);
  }
  for (let r = 0; r < rings; r++) for (let k = 0; k < seg; k++) {
    const p = r * (seg + 1) + k, q = p + seg + 1;
    idx.push(p, q, p + 1, p + 1, q, q + 1);
  }
  const lat = new THREE.BufferGeometry();
  lat.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lat.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  lat.setIndex(idx);
  lat.computeVertexNormals();
  const f = [];
  const rim = (k) => V(Math.cos((k / seg) * TAU) * a, Math.sin((k / seg) * TAU) * b, -d);
  for (let k = 0; k < seg; k++) f.push(rod(rim(k), rim(k + 1), tube * 1.4, 5));
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * TAU;
    let last = V(0, 0, 0);
    for (let r = 1; r <= 4; r++) {
      const t = r / 4, p = V(Math.cos(ang) * a * t, Math.sin(ang) * b * t, -d * t * t);
      f.push(rod(last, p, tube, 4));
      last = p;
    }
  }
  return { lattice: lat, frame: mergeAll(f) };
}

// Doubly curved lattice reflector facing -Z with a shaped outline: half-width at height v (-1..1)
// is w/2 * shape(v); surface z = -(sag v^2 + sagX u^2) (concave toward -Z). Built as the lattice
// ground plus a tube rim, curved ribs on the back (a box girder each, `rib` deep) and horizontal
// back girders: the structure that makes the photographed antennas read as engineered frames.
export function reflector(P, m, { w, h, sag, sagX = 0, shape = () => 1, ribs = 5, girders = 4, rib = 0.32, tube = 0.07 }) {
  const S = (u, v) => {
    const hw = (w / 2) * shape(v), x = u * hw, y = (v * h) / 2;
    return V(x, y, -(sag * v * v + sagX * u * u));
  };
  const back = (u, v, d) => S(u, v).add(V(0, 0, d));
  const nu = 12, nv = 18, pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const p = S(-1 + (2 * i) / nu, -1 + (2 * j) / nv);
    pos.push(p.x, p.y, p.z);
    uv.push(p.x / 1.1, p.y / 1.1);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const q = j * (nu + 1) + i, r = q + nu + 1;
    idx.push(q, q + 1, r, r, q + 1, r + 1);
  }
  const lat = new THREE.BufferGeometry();
  lat.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lat.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  lat.setIndex(idx);
  lat.computeVertexNormals();
  P.add('lattice', lat.applyMatrix4(m), { uv: true });
  const f = [];
  // rim round the outline
  const ring = [];
  for (let j = 0; j <= nv; j++) ring.push(S(1, -1 + (2 * j) / nv));
  for (let i = nu; i >= 0; i--) ring.push(S(-1 + (2 * i) / nu, 1));
  for (let j = nv; j >= 0; j--) ring.push(S(-1, -1 + (2 * j) / nv));
  for (let i = 0; i <= nu; i++) ring.push(S(-1 + (2 * i) / nu, -1));
  for (let k = 0; k < ring.length - 1; k++) if (ring[k].distanceToSquared(ring[k + 1]) > 1e-6) f.push(rod(ring[k], ring[k + 1], tube * 1.3, 5));
  // vertical ribs (box girders following the curve, standing behind the lattice)
  for (let r = 0; r < ribs; r++) {
    const u = -1 + (2 * r) / (ribs - 1);
    for (let j = 0; j < nv; j++) {
      const v0 = -1 + (2 * j) / nv, v1 = -1 + (2 * (j + 1)) / nv;
      const d = rib * (1 - 0.5 * Math.abs(u));
      f.push(bar(back(u * 0.98, v0, d / 2), back(u * 0.98, v1, d / 2), tube * 1.2, d));
    }
  }
  // horizontal back girders and the diagonal bracing between the middle ribs
  for (let g = 0; g < girders; g++) {
    const v = -0.85 + (1.7 * g) / (girders - 1);
    for (let i = 0; i < nu; i++) f.push(bar(back(-1 + (2 * i) / nu, v, rib * 0.6), back(-1 + (2 * (i + 1)) / nu, v, rib * 0.6), tube, tube * 1.4));
  }
  for (let j = 0; j < 6; j++) {
    const v0 = -0.85 + (1.7 * j) / 6, v1 = -0.85 + (1.7 * (j + 1)) / 6;
    f.push(rod(back(-0.5, v0, rib * 0.8), back(0, v1, rib * 0.8), tube * 0.7, 4));
    f.push(rod(back(0.5, v0, rib * 0.8), back(0, v1, rib * 0.8), tube * 0.7, 4));
  }
  P.add('steel', mergeAll(f).applyMatrix4(m), { tint: 0xc4c8c8 });
  return { at: (u, v, d = 0) => back(u, v, d).applyMatrix4(m) };
}

// Elliptic lattice dish facing -Z (a x b semi-axes, depth d) with rim, radial ribs and a ring girder.
export function ovalReflector(P, m, a, b, d, tube = 0.05) {
  const sec = ovalDish(a, b, d, tube);
  P.add('lattice', sec.lattice.applyMatrix4(m), { uv: true });
  P.add('steel', sec.frame.applyMatrix4(m), { tint: 0xc4c8c8 });
  const f = [];
  const pt = (t, ang, off) => V(Math.cos(ang) * a * t, Math.sin(ang) * b * t, -d * t * t + off);
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * TAU;
    for (let r = 0; r < 4; r++) f.push(bar(pt(r / 4, ang, 0.12), pt((r + 1) / 4, ang, 0.12), tube, 0.22));
  }
  for (let k = 0; k < 16; k++) f.push(rod(pt(0.6, (k / 16) * TAU, 0.2), pt(0.6, ((k + 1) / 16) * TAU, 0.2), tube, 4));
  f.push(zTube(0.0, 0.7, 0.35, 0.25, 10));
  P.add('steel', mergeAll(f).applyMatrix4(m), { tint: 0xc4c8c8 });
}

// Pedestal turntable: the fixed drum on the mast head, the gear ring, the rotating platform and the
// boom carrying both reflectors (local origin on the turntable face).
export function turntable(P, r, boomLen, boomH) {
  P.add('paint', yTube(-0.75, -0.05, r * 1.05, r, 24), { tint: 0xe8ecec });
  P.add('dark', hRing(r * 1.02, 0.06, 0, -0.18, 0, 24));
  P.add('dark', yTube(-0.05, 0.05, r * 0.98, r * 0.98, 24), { tint: 0x9aa0a2 });
  P.add('paint', yTube(0.05, 0.55, r * 0.6, r * 0.55, 16));
  // slip-ring housing and the rotary joint on top
  P.add('paint', yTube(0.55, 0.95, r * 0.3, r * 0.3, 12));
  P.add('dark', yTube(0.95, 1.1, r * 0.18, r * 0.18, 10));
  // the boom: a box girder with lightening holes on its sides
  P.add('paint', box(0.9, boomH, boomLen, 0, 0.55 + boomH / 2, 0));
  for (let z = -boomLen / 2 + 0.6; z < boomLen / 2 - 0.4; z += 0.9) for (const s of [-1, 1]) P.add('black', new THREE.CircleGeometry(0.22, 10).applyMatrix4(xf(s * 0.455, 0.55 + boomH / 2, z, 0, s * Math.PI / 2)), { tier: 1 });
  // waveguides running along the boom
  for (const x of [-0.3, 0.3]) P.add('dark', box(0.12, 0.08, boomLen * 0.9, x, 0.6 + boomH + 0.05, 0), { tier: 1, tint: 0xa0a6a8 });
}

// MR-800 Voskhod "Top Pair" on its turntable; local origin on the turntable, main reflector facing -Z.
// Main antenna: the tall curved reflector (Top Sail type, about 10.6 x 6.6 m [P]) with a horizontal
// line feed held low in front (offset feed); back to back with it the oval Big Net-type dish (about
// 6 x 4 m [P]) and its horn on a boom.
export function topPair(M) {
  const g = new THREE.Group();
  g.name = 'MR-800 Top Pair';
  const P = new Parts(M);
  turntable(P, 1.1, 5.4, 0.9);
  // [P: the reflector spans about 41 to 50 m, hanging ahead of the turntable]
  const mm = new THREE.Matrix4().compose(V(0, -0.5, -2.7), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.22, 0, 0)), V(1, 1, 1));
  // outline: full width low down, the top corners rounded off as photographed
  const shape = (v) => (v > 0.45 ? 0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - ((v - 0.45) / 0.55) ** 2)) : 1 - 0.08 * Math.max(0, -v - 0.6));
  const main = reflector(P, mm, { w: 6.8, h: 9.8, sag: 1.4, sagX: 0.25, shape, ribs: 5, girders: 5, rib: 0.38, tube: 0.075 });
  // line feed: a horizontal slotted waveguide across the lower front, on four struts
  const fL = main.at(-0.85, -0.78, -3.6), fR = main.at(0.85, -0.78, -3.6);
  P.add('dark', bar(fL, fR, 0.36, 0.42), { tint: 0xa6acae });
  P.add('dark', bar(fL.clone().add(V(0, 0.25, 0)), fR.clone().add(V(0, 0.25, 0)), 0.1, 0.5), { tier: 1, tint: 0x8d9395 });
  for (const [u, v] of [[-0.95, -1], [0.95, -1], [-0.95, 0.1], [0.95, 0.1]]) {
    const end = v < 0 ? (u < 0 ? fL : fR) : (u < 0 ? fL : fR);
    P.add('steel', rod(main.at(u, v), end, 0.06, 5), { tint: 0xb8bcbc });
  }
  // the feed's waveguide back to the boom
  P.add('dark', bar(fL.clone().lerp(fR, 0.5), V(0, 1.1, -1.5), 0.16, 0.16), { tint: 0x9aa0a2 });
  // braces from the boom to the back of the reflector
  for (const [u, v] of [[-0.6, 0.6], [0.6, 0.6], [-0.6, -0.1], [0.6, -0.1]]) P.add('paint', rod(V(u * 0.6, 1.2, -2.5), main.at(u, v, 0.4), 0.08, 6));
  // Big Net-type dish facing aft, with its horn on a boom
  const sm = new THREE.Matrix4().compose(V(0, 1.5, 2.9), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, Math.PI, 0)), V(1, 1, 1));
  ovalReflector(P, sm, 3.1, 2.05, 0.95);
  const hornAt = V(0, 1.5 - 0.25, 2.9 + 2.75);
  P.add('paint', box(0.3, 0.3, 2.4, 0, 1.1, 2.9 + 1.5));
  P.add('dark', lathe([[0.08, -0.35], [0.16, -0.1], [0.32, 0.25]], 8).applyMatrix4(xf(hornAt.x, hornAt.y, hornAt.z, -Math.PI / 2 - 0.1)), { tint: 0xa0a6a8 });
  for (const [x, y] of [[-2.4, 1.2], [2.4, 1.2]]) P.add('steel', rod(V(x, y + 1.5, 2.9 + 0.95), hornAt, 0.04, 4));
  P.build(g, { name: 'toppair' });
  return g;
}

// MR-700 Fregat "Top Steer" on its turntable (local origin), main reflector facing -Z: a smaller
// curved lattice reflector with a line feed, backed by a small oval dish [P sizes, E detail].
export function topSteer(M) {
  const g = new THREE.Group();
  g.name = 'MR-700 Top Steer';
  const P = new Parts(M);
  turntable(P, 0.75, 3.4, 0.6);
  const mm = new THREE.Matrix4().compose(V(0, 2.3, -1.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.14, 0, 0)), V(1, 1, 1));
  const shape = (v) => 1 - 0.18 * Math.max(0, v - 0.5) * 2;
  const main = reflector(P, mm, { w: 4.6, h: 4.6, sag: 0.65, sagX: 0.12, shape, ribs: 4, girders: 4, rib: 0.26, tube: 0.055 });
  const fL = main.at(-0.85, -0.7, -2.1), fR = main.at(0.85, -0.7, -2.1);
  P.add('dark', bar(fL, fR, 0.26, 0.3), { tint: 0xa6acae });
  for (const u of [-0.95, 0.95]) {
    P.add('steel', rod(main.at(u, -1), u < 0 ? fL : fR, 0.045, 4), { tint: 0xb8bcbc });
    P.add('steel', rod(main.at(u, 0.3), u < 0 ? fL : fR, 0.045, 4), { tint: 0xb8bcbc });
  }
  for (const u of [-0.6, 0.6]) P.add('paint', rod(V(u * 0.4, 1.0, -1.2), main.at(u, 0, 0.3), 0.07, 6));
  const sm = new THREE.Matrix4().compose(V(0, 1.35, 1.75), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, Math.PI, 0)), V(1, 1, 1));
  ovalReflector(P, sm, 1.7, 1.05, 0.5, 0.04);
  P.add('paint', box(0.22, 0.22, 1.5, 0, 1.0, 2.4));
  P.add('dark', lathe([[0.06, -0.25], [0.12, -0.05], [0.22, 0.2]], 8).applyMatrix4(xf(0, 1.2, 3.25, -Math.PI / 2 - 0.08)), { tint: 0xa0a6a8 });
  P.build(g, { name: 'topsteer' });
  return g;
}

// Palm Frond: a slotted waveguide bar with a pedestal (local origin at the pedestal base).
export function palmFrond(M) {
  const g = new THREE.Group();
  g.name = 'Palm Frond';
  const P = new Parts(M);
  P.add('paint', yTube(0, 0.45, 0.22, 0.2, 10));
  P.add('dark', box(0.35, 0.35, 0.4, 0, 0.6, 0));
  P.add('paint', box(3.8, 0.32, 0.22, 0, 0.95, -0.12), { tint: 0xe0e4e4 });
  P.add('dark', box(3.7, 0.12, 0.03, 0, 0.95, -0.24));
  P.build(g, { name: 'palmfrond', shadow: true });
  return g;
}

// Side Globe ECM radome on a short bracket from a wall at (x, y, z), pointing along `out` (x sign).
export function sideGlobe(P, x, y, z, out) {
  P.add('paint', xTube(x, x + out * 1.0, 0.32, 0.32, 10, y - 0.2, z));
  P.add('paint', bar(V(x, y - 1.2, z), V(x + out * 1.0, y - 0.4, z), 0.12), { tier: 1 });
  // Side Globe radomes read the same grey as the paint in the 1985 and 1989 photographs
  P.add('paint', sphere(1.0, x + out * 1.45, y + 0.2, z, 1, 1, 1, 18), { tint: 0xf4f6f4 });
  P.add('paint', yTube(y - 0.9, y - 0.65, 0.5, 0.5, 14, x + out * 1.45, z), { tier: 1 });
  rail(P, [[x + out * 0.4, z - 0.9], [x + out * 2.6, z - 0.9], [x + out * 2.6, z + 0.9], [x + out * 0.4, z + 0.9]], y - 0.65, { h: 0.9 });
  P.add('dark', box(2.2, 0.06, 1.8, x + out * 1.5, y - 0.66, z), { tier: 1 });
}

// Lattice yard across the ship at height y, z, from -half to +half: two chords and diagonals.
export function latticeYard(P, y, z, half, depth = 0.7) {
  for (const dy of [0, depth]) for (const dz of [-0.25, 0.25]) P.add('paint', rod(V(-half, y + dy, z + dz), V(half, y + dy, z + dz), 0.06, 5), { tier: 1 });
  const n = Math.round((2 * half) / 0.9);
  for (let i = 0; i < n; i++) {
    const x0 = -half + (2 * half * i) / n, x1 = -half + (2 * half * (i + 1)) / n;
    P.add('paint', rod(V(x0, y, z - 0.25), V(x1, y + depth, z - 0.25), 0.03, 4), { tier: 2 });
    P.add('paint', rod(V(x0, y + depth, z + 0.25), V(x1, y, z + 0.25), 0.03, 4), { tier: 2 });
    P.add('paint', rod(V(x0, y, z - 0.25), V(x0, y, z + 0.25), 0.025, 4), { tier: 2 });
  }
  // walkway grating on the yard
  P.add('dark', box(2 * half, 0.05, 0.6, 0, y + depth + 0.03, z), { tier: 1, tint: 0xb0b6b8 });
}

export function buildMasts(P, M, root) {
  const rnd = mulberry32(700);
  const radars = [];
  const spin = [];
  const T = LAYOUT.towerFwd;

  // ---- forward: the conical Top Pair mast on the tower cap [P: 37.9 m to the turntable at 46 m]
  const mz = T.mastZ;
  P.add('paint', lathe([[2.7, T.capY + 0.3], [2.2, T.capY + 1.2], [1.6, T.capY + 3.0], [1.15, T.capY + 5.8], [0.9, 45.4], [1.0, 45.6]], 28).translate(0, 0, mz), { tint: 0xf0f2f2 });
  for (const [y, r] of [[39.1, 2.25], [41.0, 1.6], [43.0, 1.32]]) P.add('paint', hRing(r + 0.03, 0.05, 0, y, mz, 24), { tier: 1 });
  vLadder(P, 0, mz + 1.7, T.capY + 2.6, 45.0, [0, 1], { cage: true });
  // small platform round the mast below the turntable
  P.add('dark', yTube(43.0, 43.1, 2.0, 2.0, 20, 0, mz), { tier: 1, tint: 0xb0b6b8 });
  {
    const pts = [];
    for (let k = 0; k <= 20; k++) { const a = (k / 20) * TAU; pts.push([Math.cos(a) * 2.0, mz + Math.sin(a) * 2.0]); }
    rail(P, pts, 43.1, { h: 0.95 });
  }
  const tp = topPair(M);
  tp.position.set(0, 46.2, mz);
  root.add(tp);
  radars.push(tp);
  spin.push({ o: tp, rate: 0.55, phase: 0.4 });
  // lightning rod / masthead pole above the turntable
  P.add('steel', yTube(46.2, 51.4, 0.06, 0.03, 6, 0, mz + 0.0), { tier: 1 });

  // ---- forward tower: yard with Palm Fronds, Side Globes, halyards [1985 bow photograph]
  latticeYard(P, 33.0, 9.0, 13.0);
  for (const s of [-1, 1]) {
    // Palm Frond pedestals near the yard ends, on small platforms
    const px = s * 9.6, pz = 9.0, py = 33.0 + 0.75;
    P.add('dark', box(2.2, 0.06, 1.6, px, py, pz), { tier: 1, tint: 0xb0b6b8 });
    rail(P, [[px - 1.1, pz - 0.8], [px + 1.1, pz - 0.8], [px + 1.1, pz + 0.8], [px - 1.1, pz + 0.8], [px - 1.1, pz - 0.8]], py, { h: 0.9 });
    const pf = palmFrond(M);
    pf.position.set(px, py + 0.05, pz);
    root.add(pf);
    radars.push(pf);
    spin.push({ o: pf, rate: 2.1 + s * 0.15, phase: s });
    // yard-arm lamps and the halyards down to the 01 level
    P.add('lamp', sphere(0.12, s * 12.9, 33.9, 9.0, 1, 1, 1, 8), { tier: 2 });
    for (const dz of [-0.2, 0.2]) P.add('dark', rod(V(s * 12.6, 33.0, 9.0 + dz), V(s * 12.0, LAYOUT.level01 + 0.3, -10 + dz * 10), 0.012, 3), { tier: 2 });
    // Side Globe radomes at the tower's forward corners [three per side visible in 1985]
    for (const [y, z] of [[21.0, 5.2], [24.4, 6.0], [28.2, 6.5], [30.4, 14.6]]) {
      const k = (y - T.base) / (T.top - T.base), hx = 7.4 + (4.7 - 7.4) * k;
      sideGlobe(P, s * (hx - 0.1), y, z, s);
    }
  }
  // signal flags on the forward halyards (a hoist of three), and the ensign gaff on the uptake hood
  {
    const flagGeo = [];
    for (let i = 0; i < 3; i++) flagGeo.push(box(0.02, 0.6, 0.9, -12.4, 30.5 - i * 0.8, 8.6));
    P.add('red', mergeAll(flagGeo), { tier: 2 });
    P.add('paint', bar(V(0, 33.5, 20.4), V(0, 35.2, 24.0), 0.12), { tier: 1 });
  }
  // whips on the tower cap
  for (const [x, z] of [[-5.4, 4.0], [5.4, 4.0], [-5.4, 20.4], [5.4, 20.4]]) whip(P, x, T.capY, z, 6.5 + rnd() * 2, 1, [x * 0.04, 0]);

  // ---- aft tower: Top Steer mast [P: mast 28.5 to 34.7 m at z 36.2]
  const A = LAYOUT.towerAft;
  P.add('paint', lathe([[1.0, A.top], [0.8, A.top + 2.5], [0.55, 31.4], [0.6, 31.6]], 18).translate(0, 0, A.mastZ), { tint: 0xf0f2f2 });
  const ts = topSteer(M);
  ts.position.set(0, 32.1, A.mastZ);
  root.add(ts);
  radars.push(ts);
  spin.push({ o: ts, rate: 0.95, phase: 2.0 });
  // aft tower yard with a diagonal brace [P: 28.3 m, spanning z 30 to 40 seen in profile]
  latticeYard(P, 28.0, 36.2, 8.5, 0.5);
  for (const s of [-1, 1]) {
    P.add('paint', rod(V(s * 2.8, 24.0, 36.2), V(s * 7.5, 28.0, 36.2), 0.09, 5), { tier: 1 });
    sideGlobe(P, s * 4.4, 21.0, 31.5, s);
    sideGlobe(P, s * 3.5, 25.0, 38.6, s);
    whip(P, s * 8.2, 28.5, 36.2, 5, 1, [s * 0.6, 0]);
  }

  // ---- aft lattice mast forward of the aft tower [P: z 27 to 32, 16.4 to 35.5 m]
  {
    const z = LAYOUT.latticeAft.z, y0 = LAYOUT.aftBlock.roof, y1 = LAYOUT.latticeAft.top;
    const leg = (sx, sz, t) => V(sx * (1.6 - 1.2 * t), y0 + (y1 - y0) * t, z + sz * (1.8 - 1.4 * t));
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sz] of corners) P.add('paint', rod(leg(sx, sz, 0), leg(sx, sz, 1), 0.09, 6), { tier: 0 });
    const bays = 9;
    for (let b = 0; b < bays; b++) {
      const t0 = b / bays, t1 = (b + 1) / bays;
      for (let c = 0; c < 4; c++) {
        const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4];
        P.add('paint', rod(leg(ax, az, t0), leg(bx, bz, t1), 0.035, 4), { tier: 1 });
        P.add('paint', rod(leg(ax, az, t1), leg(bx, bz, t1), 0.04, 4), { tier: 1 });
      }
    }
    // the fore-and-aft boom at the top with its antennas [P: z 26.3 to 33.2]
    P.add('paint', rod(V(0, y1, 26.3), V(0, y1, 33.2), 0.09, 6));
    for (const zz of [26.6, 28.4, 30.6, 32.9]) P.add('steel', rod(V(0, y1, zz), V(0, y1 - 1.6, zz), 0.03, 4), { tier: 1 });
    P.add('paint', rod(V(-2.0, y1 - 0.3, 29.6), V(2.0, y1 - 0.3, 29.6), 0.07, 5));
    // platform part way up
    P.add('dark', box(3.4, 0.06, 3.4, 0, y0 + 9.0, z), { tier: 1, tint: 0xb0b6b8 });
    rail(P, [[-1.7, z - 1.7], [1.7, z - 1.7], [1.7, z + 1.7], [-1.7, z + 1.7], [-1.7, z - 1.7]], y0 + 9.0, { h: 0.9 });
    vLadder(P, 0, z + 1.3, y0, y0 + 9.0, [0, 1]);
  }

  // ---- the naval ensign on the gaff, flown at sea (white with a blue foot, red star and emblem)
  const flag = ensign();
  flag.position.set(0, 35.0, 24.1);
  root.add(flag);

  const animate = (time) => {
    for (const s of spin) s.o.rotation.y = s.phase + time * s.rate;
    const p = flag.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = flag.userData.base[i * 3], y = flag.userData.base[i * 3 + 1], k = Math.max(0, x) / 3.0;
      p.setX(i, x);
      p.setZ(i, k * (Math.sin(x * 2.1 - time * 4.2) * 0.32 + Math.sin(x * 4.3 - time * 6.1 + y) * 0.08));
    }
    p.needsUpdate = true;
    flag.geometry.computeVertexNormals();
  };
  return { radars, animate, flag };
}

// The Soviet naval ensign (1950 pattern): white field, blue stripe along the foot, red star and
// hammer and sickle. Drawn, not copied from a photograph.
export function ensign() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#eeeee6'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#2f5d8e'; g.fillRect(0, 190, 512, 66);
  const star = (cx, cy, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.4 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); };
  g.fillStyle = '#c8281e';
  star(120, 85, 52);
  // hammer and sickle, simplified shapes
  g.lineWidth = 16; g.strokeStyle = '#c8281e'; g.lineCap = 'round';
  g.beginPath(); g.arc(330, 92, 52, Math.PI * 0.95, Math.PI * 2.25); g.stroke();
  g.beginPath(); g.moveTo(292, 140); g.lineTo(372, 56); g.stroke();
  g.fillRect(352, 40, 40, 22);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(3.0, 1.5, 16, 6).translate(1.5, -0.75, 0).rotateY(Math.PI / 2);
  // the flag streams aft (+z); keep a base copy for animation in its own (x = along the fly) frame
  geo.rotateY(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.y = -Math.PI / 2; // fly along +Z (aft)
  m.userData.base = Float32Array.from(geo.attributes.position.array);
  m.castShadow = true;
  m.name = 'ensign';
  return m;
}
void dish; void dome; void zTube; void bar;
