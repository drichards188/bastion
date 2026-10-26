import * as THREE from 'three';
import { V, box, rod, bar, xf, yTube, zTube, xTube, hRing, vRing, sphere, chain, mergeAll, mulberry32, decalTexture, TAU } from './kit.js';
import { deckHeightAt, deckHalfBeamAt, waterlineHalfBeamAt, keelAt, knuckleAt, stemZ, FORECASTLE_BREAK, QUARTERDECK_STEP } from './lines.js';

// Kirov's hull: lofted sections with a hard knuckle, the stepped sheer of forecastle, main deck and
// quarterdeck, the raked stem and the broad transom with the variable-depth-sonar recess, plus the
// hull's own fittings (hawse pockets and anchors, portholes, scuppers, the hull number, star and
// name). Lines and evidence in lines.js.

const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Section fullness: superellipse exponent of the underwater body (6 = flat floor and tight bilge
// amidships, 2 = the fine V of the entry).
function fullness(z) {
  if (z < -95) return 2.0 + smooth(clamp((z + 111) / 16, 0, 1)) * 1.2;
  if (z < -40) return 3.2 + smooth((z + 95) / 55) * 2.8;
  if (z < 70) return 6.0;
  return 6.0 - smooth(clamp((z - 70) / 50, 0, 1)) * 3.0;
}

// Fraction of the deck-edge overhang taken below the knuckle: small amidships (near-upright lower
// side, flared upper strake), larger forward where the whole bow flares.
function knuckleFrac(z) {
  if (z < -100) return 0.72;
  if (z < -60) return 0.72 - smooth((z + 100) / 40) * 0.32;
  return 0.4 + smooth(clamp((z - 80) / 30, 0, 1)) * 0.1;
}

const N_LOW = 13, N_UP = 5; // points per half-section below and above the knuckle

// Half-section at z (starboard, x >= 0): lower points keel -> knuckle, upper knuckle -> deck edge.
export function sectionAt(z) {
  const D = deckHeightAt(z), B = deckHalfBeamAt(z), W = waterlineHalfBeamAt(z), k = keelAt(z);
  let K = knuckleAt(z);
  // near the stem the knuckle runs out into the flare: fade the crease
  const crease = smooth(clamp((z + 124) / 12, 0, 1));
  const fk = knuckleFrac(z);
  let Bk = W + (B - W) * fk;
  // keep the knuckle above the keel/stem line and below the deck
  K = clamp(K, Math.max(k + 0.05, 0.3), D - 0.4);
  // blend toward the straight chord where the crease fades
  const chordX = W + (B - W) * (K / Math.max(D, 0.01));
  Bk = Bk * crease + chordX * (1 - crease);
  const lower = [];
  if (k < 0) {
    // underwater: superellipse quadrant from the keel centreline to the waterline
    const n = fullness(z);
    const nUnder = 8;
    for (let i = 0; i < nUnder; i++) {
      const t = i / (nUnder - 1); // 0 keel centre -> 1 waterline
      const a = t * Math.PI / 2;
      const cx = Math.sin(a), cy = Math.cos(a);
      const x = W * Math.pow(cx, 2 / n);
      const y = k * Math.pow(cy, 2 / n);
      lower.push([x, y]);
    }
    for (let i = 1; i <= N_LOW - nUnder; i++) {
      const t = i / (N_LOW - nUnder);
      lower.push([W + (Bk - W) * t, K * t]);
    }
  } else {
    // stem forefoot or transom overhang: the section starts above the waterline
    const x0 = z > 0 ? Math.max(0, W - 0.6) * smooth(clamp((z - 110) / 14, 0, 1)) : 0;
    for (let i = 0; i < N_LOW; i++) {
      const t = i / (N_LOW - 1);
      const bend = z > 0 ? Math.sin(t * Math.PI / 2) : t; // the transom bottom rounds up into the side
      lower.push([x0 + (Bk - x0) * bend, k + (K - k) * t]);
    }
  }
  const upper = [];
  for (let i = 0; i < N_UP; i++) {
    const t = i / (N_UP - 1);
    // the flared strake is slightly convex, as a rolled plate is
    const bulge = Math.sin(t * Math.PI) * 0.06 * (B - Bk);
    upper.push([Bk + (B - Bk) * t + bulge, K + (D - K) * t]);
  }
  return { lower, upper, D, B, W, K, Bk, k };
}

// x of the starboard hull surface at height y (y between keel and deck).
export function hullX(z, y) {
  const s = sectionAt(z);
  const pts = [...s.lower, ...s.upper.slice(1)];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) {
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      return x0 + (x1 - x0) * t;
    }
  }
  return y > s.D ? s.B : s.W;
}

// Outward unit normal of the hull side at (z, y), starboard (mirror x for port).
export function hullNormal(z, y) {
  const e = 0.25;
  const dxdy = (hullX(z, y + e) - hullX(z, y - e)) / (2 * e);
  const dxdz = (hullX(z + e, y) - hullX(z - e, y)) / (2 * e);
  // surface x = f(y, z): normal ~ (1, -df/dy, -df/dz)
  return V(1, -dxdy, -dxdz).normalize();
}

// z stations: 1 m spacing, dense at the stem, the deck breaks and the transom.
function stations() {
  const zs = new Set();
  for (let z = -126; z <= 126; z += 1) zs.add(z);
  for (let z = -126; z < -110; z += 0.5) zs.add(z);
  for (const b of [FORECASTLE_BREAK, QUARTERDECK_STEP]) for (let d = -1.0; d <= 1.0; d += 0.125) zs.add(+(b + d).toFixed(3));
  for (let z = 118; z <= 126; z += 0.5) zs.add(z);
  for (const z of [-125.75, -125.5, -125.25]) zs.add(z);
  return [...zs].sort((a, b) => a - b);
}

// A strip surface through rows of points (rows along z, columns across); uv = (z, arc length) / tile.
function stripGeometry(rows, tile = 8, flip = false) {
  const pos = [], uv = [], idx = [];
  const nc = rows[0].length;
  for (let r = 0; r < rows.length; r++) {
    let arc = 0;
    for (let c = 0; c < nc; c++) {
      const p = rows[r][c];
      if (c > 0) arc += p.distanceTo(rows[r][c - 1]);
      pos.push(p.x, p.y, p.z);
      // u along the ship, v up the side: plating seams run along the hull, streaks run down
      uv.push(p.z / tile, p.y / tile);
    }
  }
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
    // x breakpoints as fractions across: deck edges plus hole edges
    const xs = [-1, 1];
    for (const h of inBand) xs.push(h.x0, h.x1);
    const cols = [...new Set(xs)].sort((a, b) => a - b);
    for (let c = 0; c < cols.length - 1; c++) {
      const xm = (cols[c] + cols[c + 1]) / 2;
      if (inBand.some((h) => xm > h.x0 && xm < h.x1)) continue;
      // columns at +-1 mean the deck edge; others are absolute x
      const X = (v, b) => (v === -1 ? -b : v === 1 ? b : clamp(v, -b, b));
      const p = [
        [X(cols[c], ba), za], [X(cols[c + 1], ba), za], [X(cols[c], bb), zb], [X(cols[c + 1], bb), zb],
      ];
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

// Place a flat decal conforming to the hull at (z centre, y centre), size w (along z) x h, side +-1.
export function hullDecal(material, z, y, w, h, side, seg = 24) {
  const g = new THREE.PlaneGeometry(w, h, seg, Math.max(2, seg >> 2));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getY(i);
    const zz = z - u * side, yy = y + v; // plane x runs aft on starboard so text reads bow-to-stern correctly from outside
    const x = hullX(zz, yy) + 0.035;
    p.setXYZ(i, side * x, yy, zz);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.name = 'decal';
  m.receiveShadow = true;
  m.renderOrder = 1;
  return m;
}

// ---------------------------------------------------------------- build

export function buildHull(P, M, root, { deckHoles = [] } = {}) {
  const zs = stations();
  const rnd = mulberry32(1144);
  // --- hull plating: both sides, lower (keel to knuckle) and upper (knuckle to deck edge) strips
  for (const side of [-1, 1]) {
    const low = [], up = [];
    for (const z of zs) {
      const s = sectionAt(z);
      low.push(s.lower.map(([x, y]) => V(side * x, y, z)));
      up.push(s.upper.map(([x, y]) => V(side * x, y, z)));
    }
    // rows run along +z and columns up the section: starboard needs the flipped winding to face out
    const flip = side > 0;
    P.add('hullPaint', stripGeometry(low, 8, flip), { uv: true });
    P.add('hullPaint', stripGeometry(up, 8, flip), { uv: true, tint: 0xf4f6f6 });
  }
  // --- transom: the section at z = 126 closed by a flat face, with the VDS recess cut as an inset
  {
    const s = sectionAt(126);
    const pts = [...s.lower, ...s.upper.slice(1)];
    const shape = new THREE.Shape();
    shape.moveTo(-pts[pts.length - 1][0], pts[pts.length - 1][1]);
    for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(-pts[i][0], pts[i][1]);
    for (let i = 0; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    // VDS (Horse Tail) door recess, 1986 stern-quarter photograph: about 5.4 m wide, nearly full height
    const rw = 2.7, ry0 = 0.6, ry1 = 6.4;
    const hole = new THREE.Path([new THREE.Vector2(-rw, ry0), new THREE.Vector2(rw, ry0), new THREE.Vector2(rw, ry1), new THREE.Vector2(-rw, ry1)]);
    shape.holes.push(hole);
    const g = new THREE.ShapeGeometry(shape, 4).applyMatrix4(xf(0, 0, 126));
    P.add('hullPaint', g);
    // recess walls and the closed sonar doors set 1.4 m in
    const dz = 1.4;
    P.add('hullPaint', box(0.2, ry1 - ry0, dz, -rw, (ry0 + ry1) / 2, 126 - dz / 2), { tint: 0xd8dcdc });
    P.add('hullPaint', box(0.2, ry1 - ry0, dz, rw, (ry0 + ry1) / 2, 126 - dz / 2), { tint: 0xd8dcdc });
    P.add('hullPaint', box(rw * 2, 0.2, dz, 0, ry1, 126 - dz / 2), { tint: 0x9aa0a0 });
    P.add('hullPaint', box(rw * 2, 0.2, dz, 0, ry0, 126 - dz / 2), { tint: 0xc8cccc });
    P.add('hullPaint', box(rw * 2, ry1 - ry0, 0.15, 0, (ry0 + ry1) / 2, 126 - dz), { tint: 0xc2c8c8 });
    // door leaves, hinge line and the round emblem on the doors
    P.add('dark', box(0.08, ry1 - ry0 - 0.3, 0.08, 0, (ry0 + ry1) / 2, 126 - dz + 0.1), { tier: 1 });
    for (const sx of [-1, 1]) for (const yy of [ry0 + 0.8, ry1 - 0.8]) P.add('steel', box(0.5, 0.18, 0.12, sx * (rw - 0.4), yy, 126 - dz + 0.12), { tier: 1 });
    P.add('steel', new THREE.CylinderGeometry(0.75, 0.75, 0.06, 24).applyMatrix4(xf(1.2, 3.4, 126 - dz + 0.12, Math.PI / 2)), { tier: 1, tint: 0xc0c4c4 });
    P.add('dark', hRing(0.62, 0.05, 0, 0, 0, 24).applyMatrix4(xf(1.2, 3.4, 126 - dz + 0.16, Math.PI / 2)), { tier: 1 });
    // transom edge flat bar
    P.add('hullPaint', box(2 * s.B - 0.4, 0.12, 0.14, 0, s.D - 0.06, 126.05), { tint: 0xe6e8e8 });
  }
  // --- decks: one grid following the stepped sheer; grey bulkhead faces cover the two breaks
  P.add('deck', deckGeometry(zs, deckHoles), { uv: true });
  for (const [zb, hi, lo] of [[FORECASTLE_BREAK, deckHeightAt(FORECASTLE_BREAK - 0.6), deckHeightAt(FORECASTLE_BREAK + 0.6)], [QUARTERDECK_STEP, deckHeightAt(QUARTERDECK_STEP - 0.6), deckHeightAt(QUARTERDECK_STEP + 0.6)]]) {
    const b = deckHalfBeamAt(zb) - 0.45;
    const forward = zb < 0; // the face looks aft at the forecastle break, aft at the quarterdeck step too
    const zf = zb + 0.56;
    // a solid block over the sloped break: vertical grey face aft, deck on top
    P.add('paint', box(2 * b, hi - lo + 0.02, 1.12, 0, (hi + lo) / 2, zb), { tint: 0xe2e6e6 });
    P.add('deck', box(2 * b, 0.04, 1.12, 0, hi + 0.02, zb));
    // the step edge: a rounded nosing bar
    P.add('paint', xTube(-b, b, 0.09, 0.09, 6, hi + 0.02, zf - 0.08), { tier: 1 });
    // doors and round hatch rims in the quarterdeck step face (1986 photograph)
    if (!forward) {
      for (const x of [-9, -5.5, 2, 6.5]) {
        P.add('dark', box(0.75, 1.5, 0.05, x, lo + 0.85, zf + 0.07), { tier: 1 });
      }
      for (const x of [-7.2, -3.2, 4.4]) P.add('steel', vRing(0.35, 0.05, x, lo + 1.2, zf + 0.08, 0, 14), { tier: 1 });
    }
  }
  // --- deck edge: a gunwale bar and the waterway angle, following the sheer
  for (const side of [-1, 1]) {
    const pts = zs.filter((z) => z > -125.6 && z < 125.9).map((z) => V(side * (deckHalfBeamAt(z) - 0.04), deckHeightAt(z) + 0.06, z));
    for (let i = 0; i < pts.length - 1; i += 1) {
      P.add('paint', bar(pts[i], pts[i + 1], 0.09, 0.14), { tint: 0xeef0f0 });
    }
    // knuckle ledge: the photographed knuckle reads as a projecting strake with a lit top and a
    // dark shadow line under it, so it is a real ledge (0.22 m out, 0.2 m deep), not just a crease
    for (let i = 0; i < zs.length - 1; i++) {
      const za = zs[i], zb = zs[i + 1];
      if (za < -123 || zb > 125.5) continue;
      const a = sectionAt(za), b = sectionAt(zb);
      const ledge = (sa, z, dx, dy) => V(side * (sa.Bk + dx), sa.K + dy, z);
      const quad = (p0, p1, p2, p3) => {
        const g = new THREE.BufferGeometry().setFromPoints(side > 0 ? [p0, p1, p2, p2, p1, p3] : [p0, p2, p1, p2, p3, p1]);
        g.computeVertexNormals();
        return g;
      };
      // top (sloping out and down) and the outer face; the underside is in shadow
      P.add('hullPaint', quad(ledge(a, za, 0, 0.12), ledge(b, zb, 0, 0.12), ledge(a, za, 0.22, 0.02), ledge(b, zb, 0.22, 0.02)), { tint: 0xeef1f1 });
      P.add('hullPaint', quad(ledge(a, za, 0.22, 0.02), ledge(b, zb, 0.22, 0.02), ledge(a, za, 0.2, -0.16), ledge(b, zb, 0.2, -0.16)), { tint: 0xc9cfcf });
      P.add('hullPaint', quad(ledge(a, za, 0.2, -0.16), ledge(b, zb, 0.2, -0.16), ledge(a, za, 0, -0.2), ledge(b, zb, 0, -0.2)), { tint: 0x7d8586 });
    }
  }
  // --- forecastle bulwark at the stem (solid plating rising to the stem head) with a hawse fairlead
  for (const side of [-1, 1]) {
    const rows = [];
    for (let z = -126; z <= -116; z += 0.5) {
      const h = 0.55 * smooth(clamp((-116 - z) / 10, 0, 1)) + 0.04;
      const b = deckHalfBeamAt(z), d = deckHeightAt(z);
      rows.push([V(side * b, d, z), V(side * (b + 0.02 + h * 0.08), d + h, z)]);
    }
    P.add('hullPaint', stripGeometry(rows, 8, side > 0), { uv: true, tint: 0xf0f2f2 });
    // inner face of the bulwark, darker in shadow
    const inner = rows.map(([a, b]) => [V(a.x - side * 0.12, a.y, a.z), V(b.x - side * 0.12, b.y, b.z)]);
    P.add('hullPaint', stripGeometry(inner, 8, side < 0), { uv: true, tint: 0xc9cfcf });
  }
  // stem bar: the rounded stem casting from the forefoot to the stem head
  {
    const pts = [];
    for (let y = -2; y <= 13.1; y += 0.8) {
      const z = stemZ(y);
      pts.push(V(0, y, z + 0.05));
    }
    pts.push(V(0, 13.7, -126.1));
    for (let i = 0; i < pts.length - 1; i++) P.add('hullPaint', rod(pts[i], pts[i + 1], 0.16, 8), { tint: 0xe4e8e8 });
  }

  // --- hawse pockets and anchors (1985 bow photograph: large recessed pockets close under the deck
  // edge just aft of the stem; Frunze 1989 in harbour shows the same pair)
  for (const side of [-1, 1]) {
    // [P: 1985 bow photograph, the pockets sit just aft of the stem, about 2.4 m under the deck edge]
    const z = -121.4, y = deckHeightAt(z) - 2.4;
    const x = hullX(z, y), n = hullNormal(z, y);
    n.x *= side;
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
    const at = (dx, dy, dn) => V(side * x, y, z).add(V(0, dy, -dx * side).applyQuaternion(new THREE.Quaternion())).addScaledVector(n, dn);
    // the pocket: a dark recessed oval with a heavy rim
    const pocket = new THREE.CircleGeometry(1.0, 20).applyMatrix4(new THREE.Matrix4().compose(V(side * x, y, z).addScaledVector(n, 0.04), q, V(1.45, 1.3, 1)));
    P.add('black', pocket);
    // the bolster: a heavy rounded lip, deepest at the top where the pocket is cut under the deck edge
    const rim = new THREE.TorusGeometry(1.0, 0.16, 6, 24).applyMatrix4(new THREE.Matrix4().compose(V(side * x, y, z).addScaledVector(n, 0.1), q, V(1.5, 1.35, 1)));
    P.add('hullPaint', rim, { tint: 0xe8ecec });
    // the stockless anchor drawn up into the pocket: shank, crown and two flukes
    const ap = V(side * x, y - 0.1, z).addScaledVector(n, 0.25);
    const anchor = mergeAll([
      box(0.32, 1.7, 0.26, 0, 0.15, 0),
      box(1.5, 0.42, 0.34, 0, -0.75, 0),
      box(0.42, 0.75, 0.3, -0.62, -0.55, 0, 0, 0, 0.5),
      box(0.42, 0.75, 0.3, 0.62, -0.55, 0, 0, 0, -0.5),
      sphere(0.24, 0, 1.0, 0),
    ]).applyMatrix4(new THREE.Matrix4().compose(ap, q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -side * 0.25)), V(1, 1, 1)));
    P.add('black', anchor, { tint: 0x8a8a8a });
    // the chain on deck: from the hawse pipe deck plate to the windlass gypsy
    const deckP = V(side * 1.6, deckHeightAt(-119.5) + 0.05, -119.5);
    P.add('steel', new THREE.CylinderGeometry(0.55, 0.62, 0.22, 16).applyMatrix4(xf(deckP.x, deckP.y + 0.08, deckP.z)), { tier: 1, tint: 0x7a7f80 });
    P.add('dark', chain(V(deckP.x, deckP.y + 0.22, deckP.z), V(side * 2.0, deckHeightAt(-108) + 0.55, -108.6), 0.05, 0.11), { tier: 1 });
    // chain stopper on the run
    P.add('steel', box(0.55, 0.35, 0.9, side * 2.1, deckHeightAt(-112) + 0.2, -112), { tier: 1, tint: 0x6d7375 });
    void at;
  }
  // red star on each bow (1985 bow photograph), close under the deck edge
  {
    const starTex = starTexture();
    const mat = new THREE.MeshStandardMaterial({ map: starTex, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const side of [-1, 1]) root.add(hullDecal(mat, -112.5, deckHeightAt(-112.5) - 1.2, 1.4, 1.4, side, 6));
  }
  // hull number 065 [P: centred about z -88.5, digits about 4.3 m tall and 6.8 m across the three,
  // their foot about 2.9 m above the waterline: ratios on the anchored 1985 bow photograph] and the name aft
  {
    const num = new THREE.MeshStandardMaterial({ map: decalTexture('065', { w: 1024, h: 768, scale: 1.0, family: '"DejaVu Sans Condensed", "Liberation Sans Narrow", "Arial Narrow", sans-serif' }), transparent: true, depthWrite: false, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const side of [-1, 1]) root.add(hullDecal(num, -88.5, 5.0, 7.0, 5.9, side, 32));
    const name = new THREE.MeshStandardMaterial({ map: decalTexture('КИРОВ', { w: 1024, h: 256, scale: 0.85, color: '#e9e8de' }), transparent: true, depthWrite: false, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const side of [-1, 1]) root.add(hullDecal(name, 114, 5.6, 5.6, 1.4, side, 16));
  }

  // --- portholes: two irregular rows along the main-deck length [P: about 8.3 m and 5.5 m]
  for (const side of [-1, 1]) {
    for (const [y0, z0, z1, step] of [[8.25, -66, 80, 5.2], [5.35, -60, 76, 6.1], [10.6, -112, -76, 6.5]]) {
      for (let z = z0; z < z1; z += step * (0.7 + rnd() * 0.6)) {
        if (rnd() < 0.18) continue;
        const y = y0 + (z < -70 ? deckHeightAt(z) - 12 : 0);
        porthole(P, side, z, y);
      }
    }
    // scuppers at the deck edge, with the rust runs they leave
    for (let z = -64; z < 120; z += 7 + rnd() * 5) {
      if (Math.abs(z - QUARTERDECK_STEP) < 2) continue;
      const y = deckHeightAt(z) - 0.35;
      const x = hullX(z, y);
      P.add('black', box(0.06, 0.16, 0.55, side * (x + 0.02), y, z), { tier: 1 });
    }
  }

  // --- accommodation ladder stowed along the port side aft (1986 stern-quarter photograph)
  {
    const z0 = 106, z1 = 117, y = deckHeightAt(110) - 0.9;
    const x = -(hullX(110, y) + 0.25);
    P.add('steel', box(0.12, 0.7, z1 - z0, x, y, (z0 + z1) / 2), { tier: 1, tint: 0x8d9496 });
    for (let z = z0 + 0.4; z < z1; z += 0.45) P.add('steel', box(0.25, 0.06, 0.06, x - 0.06, y + 0.2, z), { tier: 2 });
    P.add('steel', box(0.5, 0.12, 1.4, x + 0.12, y + 0.45, z0 - 0.4), { tier: 1 });
  }
  return { zs };
}

function porthole(P, side, z, y) {
  const x = hullX(z, y);
  const n = hullNormal(z, y);
  n.x *= side;
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
  const c = V(side * x, y, z);
  P.add('glass', new THREE.CircleGeometry(0.19, 12).applyMatrix4(new THREE.Matrix4().compose(c.clone().addScaledVector(n, 0.025), q, V(1, 1, 1))), { tier: 1, uv: true });
  P.add('steel', new THREE.TorusGeometry(0.21, 0.035, 4, 12).applyMatrix4(new THREE.Matrix4().compose(c.clone().addScaledVector(n, 0.03), q, V(1, 1, 1))), { tier: 1, tint: 0xa8aeb0 });
  // rain eyebrow over the scuttle
  P.add('hullPaint', new THREE.TorusGeometry(0.3, 0.03, 3, 10, Math.PI).applyMatrix4(new THREE.Matrix4().compose(c.clone().addScaledVector(n, 0.05), q, V(1, 1, 1))), { tier: 2 });
}

let starTex;
function starTexture() {
  if (starTex) return starTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  const star = (r, color) => {
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.4 : r;
      g.lineTo(128 + Math.cos(a) * rr, 132 + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  };
  star(118, '#f0ede0');
  star(100, '#b3261d');
  starTex = new THREE.CanvasTexture(cv);
  starTex.colorSpace = THREE.SRGBColorSpace;
  starTex.anisotropy = 8;
  return starTex;
}
void TAU; void yTube; void zTube;
