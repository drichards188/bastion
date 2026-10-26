import * as THREE from 'three';
import { V, box, rod, bar, xf, hRing, mergeAll, mulberry32, decalTexture } from '../exterior/kit.js';
import { deckHeightAt, deckHalfBeamAt, waterlineHalfBeamAt, keelAt, flareExp, stemZ, QUARTERDECK_STEP, STEM_Z, STERN_Z } from './lines.js';

// Slava's hull: lofted sections with a smooth flared topside (no hard knuckle, unlike Kirov), the
// strong forward sheer, the raked stem with the high anchor pockets close under the deck edge, the
// step down to the quarterdeck and the broad square transom. Hull fittings live here too: the
// portholes, scuppers, hull number and the name on the quarters. Lines and evidence in lines.js.

const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Section fullness: superellipse exponent of the underwater body (6 = flat floor and tight bilge,
// 2 = the fine V of the entry).
function fullness(z) {
  if (z < -70) return 2.0 + smooth(clamp((z + 81.5) / 11.5, 0, 1)) * 1.0;
  if (z < -30) return 3.0 + smooth((z + 70) / 40) * 2.6;
  if (z < 50) return 5.6;
  return 5.6 - smooth(clamp((z - 50) / 43, 0, 1)) * 2.6;
}

const N_UNDER = 9, N_SIDE = 9; // points per half-section below and above the waterline

// Half-section at z (starboard, x >= 0): points from the keel centreline up to the deck edge.
export function sectionAt(z) {
  const D = deckHeightAt(z), B = deckHalfBeamAt(z), W = waterlineHalfBeamAt(z), k = keelAt(z);
  const pts = [];
  if (k < 0) {
    const n = fullness(z);
    for (let i = 0; i < N_UNDER; i++) {
      const t = i / (N_UNDER - 1), a = t * Math.PI / 2;
      pts.push([W * Math.pow(Math.sin(a), 2 / n), k * Math.pow(Math.cos(a), 2 / n)]);
    }
  } else {
    // stem forefoot or transom overhang: the section starts above the waterline
    const x0 = z > 0 ? Math.max(0, W - 0.4) : 0;
    for (let i = 0; i < N_UNDER; i++) {
      const t = i / (N_UNDER - 1);
      const bend = z > 0 ? Math.sin(t * Math.PI / 2) : t;
      pts.push([x0 + (W - x0) * bend, k + (Math.max(k, 0) - k) * t]);
    }
  }
  // the flared topside from the waterline (or the stem's foot) to the deck edge, no crease
  const [x0, y0] = pts[pts.length - 1], ne = flareExp(z);
  for (let i = 1; i <= N_SIDE; i++) {
    const t = i / N_SIDE;
    pts.push([x0 + (B - x0) * Math.pow(t, ne), y0 + (D - y0) * t]);
  }
  return { pts, D, B, W, k };
}

// x of the starboard hull surface at height y (y between keel and deck).
export function hullX(z, y) {
  const { pts, D, B, W } = sectionAt(z);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) {
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      return x0 + (x1 - x0) * t;
    }
  }
  return y > D ? B : W;
}

// Outward unit normal of the hull side at (z, y), starboard (mirror x for port).
export function hullNormal(z, y) {
  const e = 0.25;
  const dxdy = (hullX(z, y + e) - hullX(z, y - e)) / (2 * e);
  const dxdz = (hullX(z + e, y) - hullX(z - e, y)) / (2 * e);
  return V(1, -dxdy, -dxdz).normalize();
}

// The transom plane: its top on the deck at the stern, raked forward 2.6 m to its foot 0.9 m above
// the waterline [P: 1986 broadside].
const TRANSOM_FOOT = { y: 0.9, z: STERN_Z - 2.6 };
export function transomZ(y) {
  const D = deckHeightAt(STERN_Z);
  return STERN_Z - (STERN_Z - TRANSOM_FOOT.z) * clamp((D - y) / (D - TRANSOM_FOOT.y), 0, 1.2);
}

// z stations: 1 m spacing, dense at the stem, the quarterdeck step and the transom.
function stations() {
  const zs = new Set();
  for (let z = -93; z <= 93; z += 1) zs.add(z);
  zs.add(STEM_Z); zs.add(STERN_Z);
  for (let z = -93; z < -82; z += 0.5) zs.add(z);
  for (let d = -0.8; d <= 0.8; d += 0.1) zs.add(+(QUARTERDECK_STEP + d).toFixed(3));
  for (let z = 89; z <= 93; z += 0.5) zs.add(z);
  for (const z of [-93.1, -92.9, -92.75]) zs.add(z);
  return [...zs].sort((a, b) => a - b);
}

// A strip surface through rows of points (rows along z, columns up the section); uv = (z, y) / tile.
function stripGeometry(rows, tile = 8, flip = false) {
  const pos = [], uv = [], idx = [];
  const nc = rows[0].length;
  for (const row of rows) for (const p of row) { pos.push(p.x, p.y, p.z); uv.push(p.z / tile, p.y / tile); }
  for (let r = 0; r < rows.length - 1; r++) for (let c = 0; c < nc - 1; c++) {
    const a = r * nc + c, b = (r + 1) * nc + c;
    if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1);
    else idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Deck grid between the deck edges, with optional rectangular cut-outs [{x0, x1, z0, z1}].
function deckGeometry(zs, holes = []) {
  const pos = [], uv = [], idx = [];
  const zlist = [...new Set([...zs, ...holes.flatMap((h) => [h.z0, h.z1])])].sort((a, b) => a - b);
  for (let i = 0; i < zlist.length - 1; i++) {
    const za = zlist[i], zb = zlist[i + 1], zm = (za + zb) / 2;
    const ba = deckHalfBeamAt(za), bb = deckHalfBeamAt(zb);
    const inBand = holes.filter((h) => zm > h.z0 && zm < h.z1);
    const cols = [...new Set([-1, 1, ...inBand.flatMap((h) => [h.x0, h.x1])])].sort((a, b) => a - b);
    for (let c = 0; c < cols.length - 1; c++) {
      const xm = (cols[c] + cols[c + 1]) / 2;
      if (inBand.some((h) => xm > h.x0 && xm < h.x1)) continue;
      const X = (v, b) => (v === -1 ? -b : v === 1 ? b : clamp(v, -b, b));
      const p = [[X(cols[c], ba), za], [X(cols[c + 1], ba), za], [X(cols[c], bb), zb], [X(cols[c + 1], bb), zb]];
      const base = pos.length / 3;
      for (const [x, z] of p) { pos.push(x, deckHeightAt(z) + 0.01, z); uv.push(x / 4, -z / 4); }
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A flat decal conforming to the hull at (z centre, y centre), size w (along z) x h, side +-1.
export function hullDecal(material, z, y, w, h, side, seg = 24) {
  const g = new THREE.PlaneGeometry(w, h, seg, Math.max(2, seg >> 2));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getY(i);
    const zz = z - u * side, yy = y + v;
    p.setXYZ(i, side * (hullX(zz, yy) + 0.035), yy, zz);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.name = 'decal';
  m.receiveShadow = true;
  m.renderOrder = 1;
  return m;
}

// ---------------------------------------------------------------- build

export function buildHull(P, M, root, { deckHoles = [], hullNumber = '108' } = {}) {
  const zs = stations();
  const rnd = mulberry32(1164);
  // --- plating: both sides, keel to deck edge in one strip; points abaft the raked transom plane
  // are pulled forward onto it
  for (const side of [-1, 1]) {
    const rows = zs.map((z) => sectionAt(z).pts.map(([x, y]) => V(side * x, y, Math.min(z, transomZ(y)))));
    P.add('hullPaint', stripGeometry(rows, 8, side > 0), { uv: true });
  }
  // --- transom: the last section closed by a flat face raked forward toward its foot [P]
  {
    const s = sectionAt(STERN_Z);
    const shape = new THREE.Shape();
    const pts = s.pts;
    shape.moveTo(-pts[pts.length - 1][0], pts[pts.length - 1][1]);
    for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(-pts[i][0], pts[i][1]);
    for (let i = 0; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    const g = new THREE.ShapeGeometry(shape, 4), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, transomZ(p.getY(i)));
    g.computeVertexNormals();
    P.add('hullPaint', g, { tint: 0xe4e8e8 });
    P.add('hullPaint', box(2 * s.B - 0.3, 0.12, 0.14, 0, s.D - 0.06, STERN_Z + 0.05), { tint: 0xe6e8e8 });
  }
  // --- decks
  P.add('deck', deckGeometry(zs, deckHoles), { uv: true });
  // the quarterdeck step: a vertical face looking aft
  {
    const zb = QUARTERDECK_STEP, hi = deckHeightAt(zb - 0.5), lo = deckHeightAt(zb + 0.5), b = deckHalfBeamAt(zb) - 0.3;
    P.add('paint', box(2 * b, hi - lo + 0.02, 0.9, 0, (hi + lo) / 2, zb), { tint: 0xe2e6e6 });
    P.add('deck', box(2 * b, 0.04, 0.9, 0, hi + 0.02, zb));
  }
  // --- deck edge: a gunwale bar following the sheer
  for (const side of [-1, 1]) {
    const pts = zs.filter((z) => z > STEM_Z + 0.4 && z < STERN_Z - 0.1).map((z) => V(side * (deckHalfBeamAt(z) - 0.04), deckHeightAt(z) + 0.06, z));
    for (let i = 0; i < pts.length - 1; i++) P.add('paint', bar(pts[i], pts[i + 1], 0.09, 0.14), { tint: 0xeef0f0 });
  }
  // --- stem bar
  {
    const pts = [];
    for (let y = -1.5; y <= 9.95; y += 0.5) pts.push(V(0, y, stemZ(y) + 0.04));
    for (let i = 0; i < pts.length - 1; i++) P.add('hullPaint', rod(pts[i], pts[i + 1], 0.14, 8), { tint: 0xe4e8e8 });
  }
  // --- hull number (1984 to 1986: 108) [P: digits 3.4 m tall, foot 0.9 m above the waterline,
  // centred at z -24.7 on the 1986 port beam] and the name СЛАВА on the quarters [P: z 73.7 to 77.4, 1.2 m tall, 1.9 m above the waterline]
  {
    const num = new THREE.MeshStandardMaterial({ map: decalTexture(hullNumber, { w: 1024, h: 640, scale: 1.0, family: '"DejaVu Sans Condensed", "Liberation Sans Narrow", "Arial Narrow", sans-serif' }), transparent: true, depthWrite: false, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const side of [-1, 1]) root.add(hullDecal(num, -24.7, 2.6, 7.4, 4.6, side, 32));
    const name = new THREE.MeshStandardMaterial({ map: decalTexture('СЛАВА', { w: 1024, h: 256, scale: 0.8, color: '#e9e8de' }), transparent: true, depthWrite: false, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const side of [-1, 1]) root.add(hullDecal(name, 75.6, 1.95, 4.0, 1.0, side, 16));
  }
  void rnd; void hRing; void mergeAll;
  return { zs };
}
