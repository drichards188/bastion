import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Modelling kit for Kirov's exterior. The geometry helpers and the merge-per-material part collector
// follow Drumfire's src/models/kit.js (same signatures), with what a 252 m ship needs on top:
//   - detail tiers: every part goes into tier 0 (hull and structure, always drawn), 1 (fittings,
//     dropped past MID_RANGE) or 2 (railings, rungs, cables, dropped past NEAR_RANGE). Each tier of
//     a Parts build is one THREE.LOD, so the renderer switches them per frame for free and a far
//     ship costs a handful of draw calls instead of shimmering sub-pixel rods.
//   - metric box-projected UVs per material, so plating seams and rust runs keep their size.
//   - naval textures (painted plating, non-skid deck, flight deck, lattice antennas) and
//     shipFinish(), a shader patch for waterline grime, boot topping, funnel soot, salt and patchy
//     repaint, all keyed to ship-space position.
// Model space: ship-local metres, bow toward -Z, up +Y, starboard +X, design waterline at y = 0.

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;
export const MID_RANGE = 950; // metres: tier 1 hidden beyond
export const NEAR_RANGE = 420; // metres: tier 2 hidden beyond

export function xf(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  const sc = typeof s === 'number' ? V(s, s, s) : s;
  return new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), sc);
}

export const box = (w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => new THREE.BoxGeometry(w, h, d).applyMatrix4(xf(x, y, z, rx, ry, rz));
export const sphere = (r, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 14) =>
  new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)).applyMatrix4(xf(x, y, z, 0, 0, 0, V(sx, sy, sz)));
// Upper hemisphere (domes on radomes and lockers), base at y.
export const dome = (r, x = 0, y = 0, z = 0, seg = 16, sy = 1) =>
  new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 2), 0, TAU, 0, Math.PI / 2).applyMatrix4(xf(x, y, z, 0, 0, 0, V(1, sy, 1)));

export const yTube = (y0, y1, r0, r1 = r0, seg = 14, x = 0, z = 0, open = false) =>
  new THREE.CylinderGeometry(r1, r0, Math.abs(y1 - y0), seg, 1, open).applyMatrix4(xf(x, (y0 + y1) / 2, z, y1 < y0 ? Math.PI : 0));

export function zTube(z0, z1, r0, r1 = r0, seg = 14, x = 0, y = 0, open = false) {
  const g = new THREE.CylinderGeometry(r1, r0, Math.abs(z1 - z0), seg, 1, open);
  return g.applyMatrix4(xf(x, y, (z0 + z1) / 2, z1 > z0 ? Math.PI / 2 : -Math.PI / 2));
}

export function xTube(x0, x1, r0, r1 = r0, seg = 14, y = 0, z = 0, open = false) {
  const g = new THREE.CylinderGeometry(r1, r0, Math.abs(x1 - x0), seg, 1, open);
  return g.applyMatrix4(xf((x0 + x1) / 2, y, z, 0, 0, x1 > x0 ? -Math.PI / 2 : Math.PI / 2));
}

// A cylinder between two points.
const _up = V(0, 1, 0);
export function rod(a, b, r, seg = 6) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, Math.max(1e-4, len), seg, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.normalize());
  return g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
}
// A square-section bar between two points (angle iron, rungs, frames): cheaper than a rod.
export function bar(a, b, w, h = w) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.BoxGeometry(w, Math.max(1e-4, len), h);
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.clone().normalize());
  return g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
}

export const plane = (w, h, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => new THREE.PlaneGeometry(w, h).applyMatrix4(xf(x, y, z, rx, ry, rz));

// Lathe about Y from [radius, y] points.
export const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg);

// Side profile [z, y] points extruded across x in [-w/2, w/2]. Front is -Z.
export function sideProfile(pts, w, x = 0) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -w / 2);
  g.rotateY(-Math.PI / 2);
  return g.translate(x, 0, 0);
}

// Front profile [x, y] points extruded along z in [z0, z1].
export function frontProfile(pts, z0, z1) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.abs(z1 - z0), bevelEnabled: false, curveSegments: 8 });
  return g.translate(0, 0, Math.min(z0, z1));
}

// Top profile [x, z] points extruded up through y in [y0, y1] (plan shapes: deckhouses, platforms).
export function topProfile(pts, y0, y1, holes = []) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.abs(y1 - y0), bevelEnabled: false, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  return g.translate(0, Math.min(y0, y1), 0);
}

// Rectangle with chamfered corners as a plan polygon [x, z] (counter-clockwise seen from above).
export function chamferRect(x0, x1, z0, z1, c = 0.8) {
  const cx = Math.min(c, (x1 - x0) / 2.1), cz = Math.min(c, (z1 - z0) / 2.1);
  return [[x0 + cx, z1], [x1 - cx, z1], [x1, z1 - cz], [x1, z0 + cz], [x1 - cx, z0], [x0 + cx, z0], [x0, z0 + cz], [x0, z1 - cz]];
}

export function mirrorX(g) {
  const m = g.index ? g.toNonIndexed() : g.clone();
  m.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  for (const k of Object.keys(m.attributes)) {
    const at = m.attributes[k], n = at.itemSize, ar = at.array;
    for (let i = 0; i < at.count; i += 3) for (let c = 0; c < n; c++) {
      const j1 = (i + 1) * n + c, j2 = (i + 2) * n + c, t = ar[j1];
      ar[j1] = ar[j2];
      ar[j2] = t;
    }
  }
  return m;
}

// Convex solid through stacked rings of points (same count, ordered round the outline), faces
// oriented away from the centroid: tapered towers, masts, radome drums.
export function loft(rings, { top = true, bottom = true } = {}) {
  const c = new THREE.Vector3();
  let n = 0;
  for (const r of rings) for (const p of r) { c.add(p); n++; }
  c.divideScalar(n);
  const out = [];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), m = new THREE.Vector3();
  const tri = (a, b, d) => {
    e1.subVectors(b, a);
    e2.subVectors(d, a);
    e1.cross(e2);
    if (e1.lengthSq() < 1e-12) return;
    m.copy(a).add(b).add(d).divideScalar(3).sub(c);
    if (e1.dot(m) < 0) out.push(a, d, b); else out.push(a, b, d);
  };
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k], B = rings[k + 1];
    for (let i = 0; i < A.length; i++) {
      const j = (i + 1) % A.length;
      tri(A[i], A[j], B[j]);
      tri(A[i], B[j], B[i]);
    }
  }
  const cap = (R) => { for (let i = 1; i < R.length - 1; i++) tri(R[0], R[i], R[i + 1]); };
  if (top) cap(rings[rings.length - 1]);
  if (bottom) cap(rings[0]);
  const g = new THREE.BufferGeometry().setFromPoints(out);
  g.computeVertexNormals(); // flat: setFromPoints is non-indexed
  return g;
}
export const ringAt = (pts, y) => pts.map(([x, z]) => V(x, y, z));

// Parabolic dish (radius R, depth d) opening toward -Z, thin shell, vertex at the origin.
export function dish(R, d, t = 0.03, seg = 24) {
  const pts = [];
  const n = 8;
  for (let i = n; i >= 0; i--) { const r = (R * i) / n; pts.push([r, d * (r / R) ** 2]); }
  for (let i = 0; i <= n; i++) { const r = (R * i) / n; pts.push([r, d * (r / R) ** 2 + t]); }
  const g = lathe(pts, seg);
  g.rotateX(-Math.PI / 2);
  return g;
}

// Torus helpers: a ring in the XZ plane (horizontal) or facing +Z.
export const hRing = (r, t, x = 0, y = 0, z = 0, seg = 20) => new THREE.TorusGeometry(r, t, 4, seg).applyMatrix4(xf(x, y, z, Math.PI / 2));
export const vRing = (r, t, x = 0, y = 0, z = 0, ry = 0, seg = 16) => new THREE.TorusGeometry(r, t, 4, seg).applyMatrix4(xf(x, y, z, 0, ry));

export const mergeAll = (list) => {
  const l = list.map((g) => { const c = g.index ? g.toNonIndexed() : g.clone(); for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') c.deleteAttribute(k); if (!c.attributes.uv) c.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2)); return c; });
  return mergeGeometries(l, false);
};

// A hanging chain from a to b (links as small rings, alternately turned), sagging by `sag` metres.
const _lk = new THREE.TorusGeometry(0.5, 0.16, 3, 6);
export function chain(a, b, sag = 0.1, link = 0.07) {
  const len = a.distanceTo(b), n = Math.max(2, Math.round(len / (link * 1.6)));
  const at = (t) => a.clone().lerp(b, t).add(V(0, -4 * sag * t * (1 - t), 0));
  const list = [];
  for (let i = 0; i < n; i++) {
    const p = at((i + 0.5) / n), d = at(Math.min(1, (i + 1) / n)).sub(at(Math.max(0, i / n))).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), d).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), (i % 2) * Math.PI / 2));
    list.push(_lk.clone().applyMatrix4(new THREE.Matrix4().compose(p, q, V(link * 1.9, link, link))));
  }
  return mergeAll(list);
}

// Handwheel with its axis along X (valves, hatch dogs), centre at the origin.
export function handwheel(R, spokes = 4, tube = 0.016) {
  const list = [new THREE.TorusGeometry(R, tube, 4, 14).rotateY(Math.PI / 2)];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU;
    list.push(rod(V(0, 0, 0), V(0, Math.cos(a) * R, Math.sin(a) * R), tube * 0.7, 4));
  }
  return mergeAll(list);
}

// ---------------------------------------------------------------- parts collector

const c3 = new THREE.Color();
// Material keys whose parts get metric box-projected UVs: [metres per texture tile].
const PROJECTED = { paint: 4, hullPaint: 8, dark: 4, steel: 4, deck: 4, rubber: 4, canvas: 3, white: 4, rust: 4, black: 4, red: 4, wood: 4, flight: 0 };

// Box-projected UVs (scale metres per tile): u along the dominant tangent, v up for walls, so
// the paint's streaks run down vertical surfaces.
export function projectUV(g, scale = 4) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      let u, v;
      if (nx >= ny && nx >= nz) { u = z; v = y; } else if (ny >= nz) { u = x; v = z; } else { u = x; v = y; }
      uv[(i + k) * 2] = u / scale;
      uv[(i + k) * 2 + 1] = v / scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// Collects geometry per material key and detail tier, then merges each (key, tier) into one mesh.
// Every geometry gets position, normal, uv and a colour (tint), so any set can be merged.
//   P.add(key, geom, { tint, uv: true to keep the geometry's own UVs, tier: 0 | 1 | 2 })
export class Parts {
  constructor(mats, { tier = 0 } = {}) {
    this.mats = mats;
    this.tier = tier; // default tier for adds
    this.lists = new Map();
    this.triangles = 0;
  }

  // shade(x, y, z) optionally multiplies the tint per vertex (contact shadows, fades)
  add(key, geom, { tint = 0xffffff, uv = false, tier = this.tier, shade = null } = {}) {
    // add() takes ownership of geom (pass template.clone() for shared geometry)
    const g = geom.index ? geom.toNonIndexed() : geom;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!uv && PROJECTED[key]) projectUV(g, PROJECTED[key]);
    const col = new Float32Array(g.attributes.position.count * 3);
    c3.set(tint);
    const pa = g.attributes.position;
    for (let i = 0; i < col.length; i += 3) {
      const k = shade ? shade(pa.getX(i / 3), pa.getY(i / 3), pa.getZ(i / 3)) : 1;
      col[i] = c3.r * k; col[i + 1] = c3.g * k; col[i + 2] = c3.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const id = key + '|' + tier;
    if (!this.lists.has(id)) this.lists.set(id, { key, tier, list: [] });
    this.lists.get(id).list.push(g);
    this.triangles += g.attributes.position.count / 3;
    if (geom !== g) geom.dispose?.();
    return this;
  }

  // add a geometry and its mirror image across x = 0
  sym(key, geom, o) {
    this.add(key, mirrorX(geom), o);
    return this.add(key, geom, o);
  }

  // Merge into meshes under `parent`. Tier 0 meshes go straight in; tiers 1 and 2 go into one
  // THREE.LOD each (empty beyond their range). `shadow` false for parts too thin to matter.
  build(parent, { name = 'parts', shadow = true, lod = true } = {}) {
    const out = [];
    const holders = new Map();
    for (const { key, tier, list } of this.lists.values()) {
      const g = mergeGeometries(list, false);
      for (const l of list) l.dispose();
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mat = this.mats[key];
      if (!mat) throw new Error('Parts: no material ' + key);
      const m = new THREE.Mesh(g, mat);
      m.name = `${name}:${key}${tier ? ':t' + tier : ''}`;
      m.castShadow = shadow && !mat.transparent && key !== 'glass';
      m.receiveShadow = true;
      let target = parent;
      if (tier > 0 && lod) {
        if (!holders.has(tier)) {
          const l = new THREE.LOD();
          l.name = `${name}:lod${tier}`;
          const near = new THREE.Group();
          l.addLevel(near, 0);
          l.addLevel(new THREE.Object3D(), tier === 1 ? MID_RANGE : NEAR_RANGE);
          parent.add(l);
          holders.set(tier, near);
        }
        target = holders.get(tier);
      }
      target.add(m);
      out.push(m);
    }
    this.lists.clear();
    return out;
  }
}

// ---------------------------------------------------------------- procedural textures

const canvasTex = (c, { srgb = true, repeat = true, aniso = 8 } = {}) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  return t;
};

// Periodic value noise on a tile (x, y in [0, 1), px by py cells) so textures wrap exactly.
const hashI = (x, y, s) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
function pnoise(x, y, px, py, s) {
  const X = x * px, Y = y * py;
  const x0 = Math.floor(X), y0 = Math.floor(Y);
  const fx = X - x0, fy = Y - y0;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const xa = ((x0 % px) + px) % px, xb = (xa + 1) % px, ya = ((y0 % py) + py) % py, yb = (ya + 1) % py;
  const a = hashI(xa, ya, s), b = hashI(xb, ya, s), c = hashI(xa, yb, s), d = hashI(xb, yb, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function pfbm(x, y, px, py, oct, s, gain = 0.5) {
  let a = 1, sum = 0, n = 0;
  for (let o = 0; o < oct; o++) {
    sum += a * pnoise(x, y, px, py, s + o * 17);
    n += a;
    a *= gain;
    px *= 2;
    py *= 2;
  }
  return sum / n;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lin2srgb = (l) => 255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(Math.max(0, l), 1 / 2.4) - 0.055);
export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Height field (size x size, tiling) to a tangent-space normal map canvas.
function normalCanvas(h, size, strength) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5, dy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
    const nx = -dx * strength, ny = dy * strength, l = 1 / Math.hypot(nx, ny, 1);
    const i = (y * size + x) * 4;
    img.data[i] = (nx * l * 0.5 + 0.5) * 255;
    img.data[i + 1] = (ny * l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (l * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function toCanvases(size, alb, rr, rg, rb) {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const cvA = mk(), cvR = mk();
  const ctxA = cvA.getContext('2d'), ctxR = cvR.getContext('2d');
  const imA = ctxA.createImageData(size, size), imR = ctxR.createImageData(size, size);
  const N = size * size;
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < 3; c++) imA.data[i * 4 + c] = lin2srgb(Math.min(1, alb[i * 3 + c]));
    imA.data[i * 4 + 3] = 255;
    imR.data[i * 4] = rr[i] * 255;
    imR.data[i * 4 + 1] = rg[i] * 255;
    imR.data[i * 4 + 2] = rb[i] * 255;
    imR.data[i * 4 + 3] = 255;
  }
  ctxA.putImageData(imA, 0, 0);
  ctxR.putImageData(imR, 0, 0);
  return [cvA, cvR];
}

// Painted welded plating, one tile (tile metres given by the UV scale of the material key):
//   map    near-white albedo multiplied by the material colour: faint repaint patches, rust runs
//          from pinholes and seams running DOWN the tile, salt bloom, chipped paint with primer
//   rough  R vertical streak noise, G roughness, B patchy noise (read by shipFinish)
//   normal butt and seam welds (raised bead), the slight dishing of plate between stiffeners
//          ("hungry horse"), paint drips and a fine grain
// `plates` gives the panel layout in tile fractions: [rows, butts per row, stiffeners per butt].
const paintCache = new Map();
export function paintTextures(variant = 'super', size = 512) {
  if (paintCache.has(variant)) return paintCache.get(variant);
  const hull = variant === 'hull';
  const rnd = mulberry32(hull ? 65 : 1144);
  const N = size * size;
  const alb = new Float32Array(N * 3), rr = new Float32Array(N), rg = new Float32Array(N), rb = new Float32Array(N), ht = new Float32Array(N);
  const rows = hull ? 4 : 2, butts = hull ? 1 : 1, stiff = hull ? 10 : 6;
  const rowOff = Array.from({ length: rows }, () => rnd());
  // rust sources: pinholes and weld spots that bleed downward
  const runs = Array.from({ length: hull ? 7 : 4 }, () => ({ x: rnd(), y: rnd() * 0.9, w: 0.002 + rnd() * 0.0035, len: 0.12 + rnd() * 0.45, k: 0.2 + rnd() * 0.45 }));
  const rust = [0.42, 0.25, 0.14], primer = [0.36, 0.2, 0.15], salt = [1.06, 1.06, 1.03];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const u = px / size, v = py / size, i = py * size + px; // v grows DOWN the canvas = down the wall
    let r = 0.93, g = 0.94, b = 0.95;
    // repaint patches: rectangles of slightly different grey, as touched-up panels look
    const pr = Math.floor(v * rows), pu = (u + rowOff[pr] / butts) * butts;
    const panel = hashI(Math.floor(pu) % butts, pr, 7);
    const shade = 1 + (panel - 0.5) * 0.06 + (pfbm(u, v, 3, 3, 3, 11) - 0.5) * 0.08;
    r *= shade; g *= shade; b *= shade * (1 + (panel - 0.5) * 0.02);
    // fine mottling of the paint film
    const fine = (pfbm(u, v, 64, 64, 2, 21) - 0.5) * 0.05 + (pnoise(u, v, 220, 220, 23) - 0.5) * 0.035;
    r += fine; g += fine; b += fine;
    // vertical grime streaks (rain washing dirt down the wall)
    const streak = pfbm(u, v, 48, 2, 3, 31);
    const sk = 1 - sstep(0.52, 0.8, streak) * (hull ? 0.12 : 0.09);
    r *= sk; g *= sk; b *= sk * 0.995;
    // rust runs: a dark source spot, then a tapering orange-brown run downwards
    let rustA = 0;
    for (const q of runs) {
      let dx = Math.abs(u - q.x); dx = Math.min(dx, 1 - dx);
      let dy = v - q.y; if (dy < -0.5) dy += 1;
      if (dy < -0.01 || dy > q.len) continue;
      const wob = (pnoise(u, v, 4, 40, 41) - 0.5) * 0.006;
      const w = q.w * (1 + dy * 4) + wob;
      const a = (1 - sstep(w * 0.3, w, dx)) * (1 - dy / q.len) ** 1.4 * q.k;
      rustA = Math.max(rustA, a * (0.6 + 0.4 * pnoise(u, v, 30, 120, 43)));
    }
    // plate seams: horizontal welds between strakes, vertical butts brick-offset per strake
    const lineY = Math.min(v * rows - pr, pr + 1 - v * rows) * (size / rows);
    const kx = Math.round(pu);
    const lineX = Math.abs(pu - kx) * (size / butts);
    const seam = lineY < 1.2 || lineX < 1.2 ? 1 : 0;
    // rust bleeds from the bottom edge of seams a little
    if (lineY < 6 && v * rows - pr < 0.5 && pnoise(u, v, 30, 4, 47) > 0.62) rustA = Math.max(rustA, 0.25 * (1 - lineY / 6));
    // chips: primer showing at a few spots, more near seams
    const nearSeam = Math.min(lineY, lineX);
    // chips: rare, small and soft-edged (primer and rust showing where paint has flaked), mostly
    // along seams and edges; the 1985 photographs show a ship five years in service, not a wreck
    const chipMask = pfbm(u, v, 8, 8, 2, 51) * (1 + 0.9 * Math.max(0, 1 - nearSeam / 8));
    const chip = pnoise(u, v, 170, 170, 53);
    const chipped = sstep(0.0, 0.06, chipMask - 0.7) * sstep(0.0, 0.05, chip - 0.78);
    // salt bloom: whitish dry patches (stronger low on the hull)
    const saltA = sstep(0.6, 0.78, pfbm(u, v, 5, 3, 3, 61)) * (hull ? 0.16 : 0.08);
    r = r + (salt[0] - r) * saltA; g = g + (salt[1] - g) * saltA; b = b + (salt[2] - b) * saltA;
    if (chipped > 0) { const k = chipped * 0.5; r = r * (1 - k) + primer[0] * k; g = g * (1 - k) + primer[1] * k; b = b * (1 - k) + primer[2] * k; }
    r = r + (rust[0] - r) * rustA; g = g + (rust[1] - g) * rustA; b = b + (rust[2] - b) * rustA;
    if (seam) { r *= 0.82; g *= 0.82; b *= 0.83; }
    alb[i * 3] = r; alb[i * 3 + 1] = g; alb[i * 3 + 2] = b;
    rr[i] = streak;
    rg[i] = Math.min(1, 0.62 + (pfbm(u, v, 6, 6, 2, 71) - 0.5) * 0.16 + rustA * 0.3 + chipped * 0.1 + saltA * 0.4);
    rb[i] = pfbm(u, v, 6, 6, 3, 81);
    // height: dishing between stiffeners (frames run vertically), weld beads, chips, drips
    const sv = (u * butts * stiff) % 1;
    const dish = -Math.sin(sv * Math.PI) * 0.35 * (0.6 + 0.4 * Math.sin((v * rows % 1) * Math.PI));
    const bead = lineY < 2.2 || lineX < 2.2 ? 0.9 * (1 - Math.min(lineY, lineX) / 2.2) : 0;
    const drip = sstep(0.72, 0.9, pfbm(u, v, 70, 3, 2, 91)) * 0.25;
    ht[i] = dish + bead + drip - chipped * 0.2 + (pnoise(u, v, 160, 160, 93) - 0.5) * 0.18;
  }
  const [cvA, cvR] = toCanvases(size, alb, rr, rg, rb);
  const out = { map: canvasTex(cvA), rough: canvasTex(cvR, { srgb: false }), normal: canvasTex(normalCanvas(ht, size, hull ? 1.3 : 1.6), { srgb: false }) };
  paintCache.set(variant, out);
  return out;
}

// Non-skid deck paint over welded deck plate (4 m tile): grit speckle, plate seams, worn walkway
// patches showing lighter undercoat, scuffs, rust spots round fittings, dark grime in the seams.
let deckSet;
export function deckTextures(size = 512) {
  if (deckSet) return deckSet;
  const N = size * size;
  const alb = new Float32Array(N * 3), rr = new Float32Array(N), rg = new Float32Array(N), rb = new Float32Array(N), ht = new Float32Array(N);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const u = px / size, v = py / size, i = py * size + px;
    const grit = pnoise(u, v, 256, 256, 101), grit2 = pnoise(u, v, 180, 180, 103);
    let k = 0.94 + (grit - 0.5) * 0.16 + (pfbm(u, v, 4, 4, 3, 105) - 0.5) * 0.14;
    const wear = sstep(0.55, 0.75, pfbm(u, v, 3, 5, 3, 107));
    let r = k, g = k, b = k;
    // worn paint: lighter, slightly greyer where boots and gear scrape it
    r += wear * 0.1; g += wear * 0.13; b += wear * 0.15;
    const scuff = sstep(0.7, 0.85, pfbm(u, v, 20, 3, 2, 109)) * 0.08;
    r -= scuff; g -= scuff; b -= scuff;
    // rust spots
    const rs = sstep(0.74, 0.86, pfbm(u, v, 10, 10, 3, 111));
    r = r * (1 - rs * 0.4) + 0.62 * rs * 0.4; g = g * (1 - rs * 0.45) + 0.36 * rs * 0.45; b = b * (1 - rs * 0.5) + 0.22 * rs * 0.5;
    // deck plate seams every 2 m along, 1.6 m across (brick offset)
    const row = Math.floor(v * 2.5), off = (row % 2) * 0.5;
    const ly = Math.min((v * 2.5) % 1, 1 - (v * 2.5) % 1) * (size / 2.5);
    const lx = Math.min((u * 2 + off) % 1, 1 - (u * 2 + off) % 1) * (size / 2);
    const seam = ly < 1.1 || lx < 1.1;
    if (seam) { r *= 0.7; g *= 0.68; b *= 0.68; }
    alb[i * 3] = r; alb[i * 3 + 1] = g; alb[i * 3 + 2] = b;
    rr[i] = pfbm(u, v, 30, 30, 2, 113);
    rg[i] = Math.min(1, 0.86 + (grit2 - 0.5) * 0.12 - wear * 0.12 + rs * 0.05);
    rb[i] = pfbm(u, v, 5, 5, 3, 115);
    ht[i] = (grit - 0.5) * 0.9 + (grit2 - 0.5) * 0.5 + (seam ? 0.6 : 0) - wear * 0.2;
  }
  const [cvA, cvR] = toCanvases(size, alb, rr, rg, rb);
  deckSet = { map: canvasTex(cvA), rough: canvasTex(cvR, { srgb: false }), normal: canvasTex(normalCanvas(ht, size, 2.2), { srgb: false }) };
  return deckSet;
}

// Bare/dark steel and rubber: fine grain normal and the finish map layout (R streaks, G rough, B patches).
let grainSet;
export function grainTextures(size = 256) {
  if (grainSet) return grainSet;
  const N = size * size, ht = new Float32Array(N);
  const cvR = document.createElement('canvas');
  cvR.width = cvR.height = size;
  const ctxR = cvR.getContext('2d');
  const imR = ctxR.createImageData(size, size);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const u = px / size, v = py / size, i = py * size + px;
    const scratch = pnoise(u, v, 6, 140, 201) * 0.6 + pnoise(u, v, 9, 90, 202) * 0.4;
    ht[i] = (pfbm(u, v, 40, 40, 3, 211) - 0.5) * 0.9 + (scratch - 0.5) * 0.7;
    imR.data[i * 4] = pfbm(u, v, 24, 3, 3, 221) * 255;
    imR.data[i * 4 + 1] = (0.8 + pfbm(u, v, 30, 30, 2, 231) * 0.2) * 255;
    imR.data[i * 4 + 2] = pfbm(u, v, 5, 5, 4, 241) * 255;
    imR.data[i * 4 + 3] = 255;
  }
  ctxR.putImageData(imR, 0, 0);
  grainSet = { rough: canvasTex(cvR, { srgb: false }), normal: canvasTex(normalCanvas(ht, size, 1.0), { srgb: false }) };
  return grainSet;
}

// Lattice antenna mesh (Top Pair, Top Steer reflectors): thin bars on a transparent ground. The
// bars cover enough of the texel area that far mip levels keep a believable grey haze.
let latticeTex;
export function latticeTexture() {
  if (latticeTex) return latticeTex;
  const s = 256, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, s, s);
  g.strokeStyle = 'rgba(255,255,255,1)';
  // expanded-metal style mesh: about 45 % cover, so far mip levels average to a solid grey like
  // the photographed reflectors
  const n = 8, cell = s / n;
  g.lineWidth = 5;
  for (let i = 0; i <= n; i++) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, s); g.stroke();
    g.beginPath(); g.moveTo(0, i * cell); g.lineTo(s, i * cell); g.stroke();
  }
  g.lineWidth = 2.5;
  for (let i = 0; i < n; i++) {
    g.beginPath(); g.moveTo(i * cell + cell / 2, 0); g.lineTo(i * cell + cell / 2, s); g.stroke();
    g.beginPath(); g.moveTo(0, i * cell + cell / 2); g.lineTo(s, i * cell + cell / 2); g.stroke();
  }
  latticeTex = canvasTex(cv, { srgb: true });
  return latticeTex;
}

// Flight deck (tile = whole deck, w x l metres): non-skid grey-green, the landing circle and
// markings in white and yellow, as photographed from the port quarter in 1986 (shapes simplified).
export function flightDeckTexture(w, l) {
  const ppm = 24, W = Math.round(w * ppm), H = Math.round(l * ppm);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const r = mulberry32(44);
  g.fillStyle = '#7b7f78';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26000; i++) {
    const k = r();
    g.fillStyle = k > 0.5 ? `rgba(30,34,30,${0.05 + r() * 0.08})` : `rgba(210,210,200,${0.03 + r() * 0.05})`;
    g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 3);
  }
  // tyre and skid marks
  g.strokeStyle = 'rgba(25,25,22,0.18)';
  for (let i = 0; i < 40; i++) { g.lineWidth = 2 + r() * 5; g.beginPath(); const x = W * (0.3 + r() * 0.4), y = H * (0.25 + r() * 0.5); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 80, y + (r() - 0.5) * 120); g.stroke(); }
  const m = (v) => v * ppm;
  g.strokeStyle = '#e6e3d4'; g.fillStyle = '#e6e3d4';
  g.lineWidth = m(0.3);
  // landing circle (centred on the elevator's aft half) and the alignment line
  const cx = W / 2, cy = m(l * 0.58);
  g.beginPath(); g.arc(cx, cy, m(3.4), Math.PI * 0.15, Math.PI * 1.85); g.stroke();
  g.setLineDash([m(1.2), m(0.8)]);
  g.beginPath(); g.moveTo(cx, m(1)); g.lineTo(cx, H - m(1)); g.stroke();
  g.setLineDash([]);
  // the octagonal safety outline round the landing spot
  g.lineWidth = m(0.25);
  const ox = m(5.2), oy0 = m(l * 0.3), oy1 = m(l * 0.86);
  g.beginPath(); g.moveTo(cx - ox, oy0 + m(2)); g.lineTo(cx - ox + m(2), oy0); g.lineTo(cx + ox - m(2), oy0); g.lineTo(cx + ox, oy0 + m(2)); g.lineTo(cx + ox, oy1 - m(2)); g.lineTo(cx + ox - m(2), oy1); g.lineTo(cx - ox + m(2), oy1); g.lineTo(cx - ox, oy1 - m(2)); g.closePath(); g.stroke();
  // deck-edge warning stripes forward, yellow/black
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#c9a443' : '#2d302c'; g.fillRect(i * W / 16, 0, W / 16 + 1, m(0.5)); }
  g.fillStyle = '#e6e3d4';
  g.fillRect(m(1.2), m(1.5), m(0.25), H - m(3));
  g.fillRect(W - m(1.45), m(1.5), m(0.25), H - m(3));
  const t = canvasTex(cv, { repeat: false });
  return t;
}

// Window glass seen from outside (one pane, UV 0..1): the dark room behind with a lighter band at
// the top where the sky reflects, a soft diagonal highlight, a darker rim where the frame shades the
// glass, faint salt haze at the bottom. Mapped per pane on windows and portholes.
let windowTex;
export function windowTexture() {
  if (windowTex) return windowTex;
  const s = 128, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, s);
  bg.addColorStop(0, '#55666e');
  bg.addColorStop(0.28, '#26333a');
  bg.addColorStop(0.75, '#141c20');
  bg.addColorStop(1, '#232b2c');
  g.fillStyle = bg;
  g.fillRect(0, 0, s, s);
  // something of the room: a lit overhead lamp and a dark bulkhead shape inside
  g.fillStyle = 'rgba(200,190,150,0.12)';
  g.fillRect(s * 0.2, s * 0.32, s * 0.25, s * 0.05);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(s * 0.55, s * 0.45, s * 0.3, s * 0.55);
  // diagonal highlight
  g.save();
  g.translate(s / 2, s / 2);
  g.rotate(-0.6);
  const hl = g.createLinearGradient(-s, 0, s, 0);
  hl.addColorStop(0.42, 'rgba(255,255,255,0)');
  hl.addColorStop(0.5, 'rgba(230,240,245,0.22)');
  hl.addColorStop(0.58, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.fillRect(-s, -s, 2 * s, 2 * s);
  g.restore();
  // rim shading and salt haze
  const rim = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s * 0.72);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = rim;
  g.fillRect(0, 0, s, s);
  const haze = g.createLinearGradient(0, s * 0.8, 0, s);
  haze.addColorStop(0, 'rgba(200,205,200,0)');
  haze.addColorStop(1, 'rgba(200,205,200,0.18)');
  g.fillStyle = haze;
  g.fillRect(0, 0, s, s);
  windowTex = canvasTex(cv, { repeat: false });
  return windowTex;
}

// Decal: text on a transparent canvas (hull number, name), sized to the plane's aspect.
export function decalTexture(text, { w = 1024, h = 512, color = '#f2f1ea', shadow = null, font = 'bold', family = '"DejaVu Sans Condensed", "Arial Narrow", sans-serif', scale = 0.9 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.font = `${font} ${Math.round(h * scale)}px ${family}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (shadow) { g.fillStyle = shadow; g.fillText(text, w / 2 + h * 0.03, h / 2 + h * 0.03, w * 0.98); }
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2, w * 0.98);
  // weather the paint: a few scuffed pixels
  const r = mulberry32(text.length * 31);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.5})`; g.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 3); }
  g.globalCompositeOperation = 'source-over';
  const t = canvasTex(cv, { repeat: false });
  return t;
}

// ---------------------------------------------------------------- ship finish shader

// Hooks a patch into a material's onBeforeCompile and program cache key without disturbing the
// ones assigned later (shaderlib's patchMaterial, applied by patchSceneFog after the model is built):
// the later assignments are captured and run first, then this patch (as in Drumfire's kit).
function chainPatch(mat, key, patch) {
  let outer = null, outerKey = null;
  Object.defineProperty(mat, 'onBeforeCompile', {
    configurable: true,
    get: () => (shader, renderer) => { if (outer) outer(shader, renderer); patch(shader); },
    set: (f) => { outer = f; },
  });
  Object.defineProperty(mat, 'customProgramCacheKey', {
    configurable: true,
    get: () => () => (outerKey ? outerKey() : '') + '|' + key,
    set: (f) => { outerKey = f; },
  });
}

const glslColor = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };

// Soot sources (uptake exhausts) in ship space: [x, y, z, radius]. Shared by every finished material.
export const SOOT = [];
const sootUniform = { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, -999, 0, 1)) };
export function setSoot(list) {
  SOOT.length = 0;
  list.slice(0, 4).forEach((s, i) => { SOOT.push(s); sootUniform.value[i].set(s[0], s[1], s[2], s[3]); });
}

// Weathering keyed to where a point is on the ship (object space = ship space for merged parts):
//   hull:      waterline grime from 0.4 to 2.5 m, the white boot-top line and red antifouling
//   soot:      darkening round the uptake openings, heaviest on up- and aft-facing surfaces
//   salt:      whitish bloom on up-facing surfaces, a little dust grey
//   patches:   large, faint repaint patches so 8 m texture tiles do not read as a pattern
// The material needs a roughnessMap laid out like paintTextures' (R streaks, G rough, B patches).
// `uniforms` ({ inverse, soot }, from shipUniforms()) gives a second ship its own world-to-ship
// matrix and soot sources; by default every material shares Kirov's.
export function shipFinish(mat, key, { hull = false, soot = 1, salt = 0.35, patches = 1, grime = 1, uniforms = null } = {}) {
  chainPatch(mat, 'ship-' + key, (shader) => {
    shader.uniforms.uSoot = uniforms ? uniforms.soot : sootUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vExtShipPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvExtShipPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    // ship space: undo the ship's world transform with the inverse given by the group (set per frame)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vExtShipPos;
uniform vec4 uSoot[4];
uniform mat4 uShipInverse;
float shHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float shNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(shHash(i), shHash(i + vec3(1,0,0)), f.x), mix(shHash(i + vec3(0,1,0)), shHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(shHash(i + vec3(0,0,1)), shHash(i + vec3(1,0,1)), f.x), mix(shHash(i + vec3(0,1,1)), shHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    vec3 sp = (uShipInverse * vec4(vExtShipPos, 1.0)).xyz;
    vec4 fin = texture2D( roughnessMap, vRoughnessMapUv );
    vec3 wn = normalize( mat3( uShipInverse ) * inverseTransformDirection( normal, viewMatrix ) );
    ${patches > 0 ? `
    float pa = shNoise(sp * vec3(0.06, 0.12, 0.035)) * 0.65 + shNoise(sp * vec3(0.2, 0.3, 0.16)) * 0.35;
    diffuseColor.rgb *= 1.0 + (pa - 0.5) * ${(0.12 * patches).toFixed(3)};` : ''}
    ${hull ? `
    float wl = sp.y + (fin.r - 0.5) * 0.7 + (shNoise(sp * vec3(0.0, 0.0, 0.25) + 3.0) - 0.5) * 0.6;
    float grimeA = ${(0.55 * grime).toFixed(3)} * (1.0 - smoothstep(0.45, 2.6, wl)) * smoothstep(0.2, 0.55, sp.y) * (0.6 + 0.6 * fin.b);
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3(0.20, 0.21, 0.16), grimeA );
    roughnessFactor = mix( roughnessFactor, 0.95, grimeA );
    float boot = smoothstep(0.02, 0.06, sp.y) * (1.0 - smoothstep(0.40, 0.44, sp.y));
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3(0.80, 0.80, 0.76), boot * 0.85 );
    float anti = 1.0 - smoothstep(0.0, 0.04, sp.y);
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3(0.30, 0.11, 0.08), anti );` : ''}
    ${soot > 0 ? `
    float sootA = 0.0;
    for (int i = 0; i < 4; i++) {
      vec3 d = sp - uSoot[i].xyz;
      float r = uSoot[i].w;
      float fall = 1.0 - smoothstep(0.0, r, length(d * vec3(1.0, 1.6, 0.8)));
      sootA = max(sootA, fall * (0.55 + 0.45 * max(wn.y, 0.0) + 0.3 * max(wn.z, 0.0)));
    }
    sootA *= ${(0.85 * soot).toFixed(3)} * (0.65 + 0.7 * fin.b);
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3(0.07, 0.07, 0.065), clamp(sootA, 0.0, 0.85) );
    roughnessFactor = mix( roughnessFactor, 1.0, sootA );
    metalnessFactor *= 1.0 - sootA;` : ''}
    ${salt > 0 ? `
    float saltA = ${(salt).toFixed(3)} * smoothstep(0.55, 0.95, wn.y) * (0.4 + 0.6 * fin.b) * smoothstep(0.3, 0.8, shNoise(sp * vec3(0.18, 0.18, 0.12)));
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3(0.62, 0.62, 0.60), clamp(saltA, 0.0, 0.35) );` : ''}
  }`);
    shader.uniforms.uShipInverse = uniforms ? uniforms.inverse : shipInverse;
  });
  return mat;
}
// World-to-ship matrix shared by every finished material; the exterior updates it each frame.
export const shipInverse = { value: new THREE.Matrix4() };

// A separate set of finish uniforms for another ship: { inverse, soot, setSoot(list) }.
export function shipUniforms() {
  const u = { inverse: { value: new THREE.Matrix4() }, soot: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, -999, 0, 1)) } };
  u.setSoot = (list) => list.slice(0, 4).forEach((s, i) => u.soot.value[i].set(s[0], s[1], s[2], s[3]));
  return u;
}
