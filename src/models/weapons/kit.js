import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { globalUniforms } from '../../shaderlib.js';

// Modelling kit for Kirov's weapons. The geometry helpers and the merge-per-material part collector
// are adapted from Drumfire's src/models/kit.js (same signatures, so a part written there reads the
// same here). Additions for a warship: instanced part sets for the repeated launchers and guns, the
// naval paint and non-skid deck textures, indicator lamps, and the deck cut-outs that let a hatch
// open onto a real well instead of onto the deck plating.
// Model space: ship-local, bow toward -Z, up +Y, starboard +X, metres, design waterline at Y = 0.

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export function xf(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  const sc = typeof s === 'number' ? V(s, s, s) : s;
  return new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), sc);
}

export const box = (w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => new THREE.BoxGeometry(w, h, d).applyMatrix4(xf(x, y, z, rx, ry, rz));
// (one segment per rounded edge, 108 triangles; Drumfire uses two, which is 300 on a small fitting)
export const rbox = (w, h, d, r, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 1) =>
  new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)).applyMatrix4(xf(x, y, z, rx, ry, rz));
export const sphere = (r, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 14) =>
  new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)).applyMatrix4(xf(x, y, z, 0, 0, 0, V(sx, sy, sz)));

// Tubes along an axis from a0 to a1; radius r0 at a0 and r1 at a1 (a cone when they differ).
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
export function rod(a, b, r, seg = 8) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
  return g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
}

// Lathe about Y from [radius, y] points.
export const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg);

// Surface of revolution about the Z axis from [z, r] pairs listed from low z to high z. Normals face out.
export function zLathe(pts, seg = 28) {
  const g = new THREE.LatheGeometry(pts.map(([z, r]) => new THREE.Vector2(Math.max(r, 1e-4), z)), seg);
  return g.rotateX(Math.PI / 2);
}

// Side profile [z, y] points extruded across x in [-w/2, w/2]. Front is -Z.
export function sideProfile(pts, w, bevel = 0) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: w - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -(w - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

// Top profile [x, z] points extruded up through y in [y0, y1] (plan shapes: hatches, plates).
export function topProfile(pts, y0, y1, holes = []) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.abs(y1 - y0), bevelEnabled: false, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  return g.translate(0, Math.min(y0, y1), 0);
}

// Plan outline of a stadium (a rectangle with semicircular ends) along Z: length L, width W.
export function stadium(L, W, seg = 10, x = 0, z = 0) {
  const r = W / 2, h = Math.max(0, L / 2 - r), pts = [];
  for (let i = 0; i <= seg; i++) { const a = Math.PI + (i / seg) * Math.PI; pts.push([x + Math.cos(a) * r, z - h + Math.sin(a) * r]); }
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI; pts.push([x + Math.cos(a) * r, z + h + Math.sin(a) * r]); }
  return pts;
}

// Plan outline of a rectangle with rounded corners (radius rc), centred on (x, z).
export function roundRect(w, d, rc, seg = 4, x = 0, z = 0) {
  const pts = [], cs = [[w / 2 - rc, d / 2 - rc, 0], [-w / 2 + rc, d / 2 - rc, 1], [-w / 2 + rc, -d / 2 + rc, 2], [w / 2 - rc, -d / 2 + rc, 3]];
  for (const [cx, cz, k] of cs) for (let i = 0; i <= seg; i++) { const a = (k + i / seg) * Math.PI / 2; pts.push([x + cx + Math.cos(a) * rc, z + cz + Math.sin(a) * rc]); }
  return pts;
}

export const circle = (r, seg = 24, x = 0, z = 0) => Array.from({ length: seg }, (_, i) => [x + Math.cos((i / seg) * TAU) * r, z + Math.sin((i / seg) * TAU) * r]);

// A flat ring (annulus) lying in the XZ plane at y, thickness t upward.
export const ringPlate = (r0, r1, y, t, seg = 32) => topProfile(circle(r1, seg), y, y + t, [circle(r0, seg).reverse()]);

export function mirrorX(g) {
  const m = g.clone();
  m.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  if (m.index) {
    const a = m.index.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    return m;
  }
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
// oriented away from the centroid. For radome housings, tapered casings and fairings.
export function loft(rings, { top = true, bottom = true } = {}) {
  const c = V();
  let n = 0;
  for (const r of rings) for (const p of r) { c.add(p); n++; }
  c.divideScalar(n);
  const out = [], e1 = V(), e2 = V(), m = V();
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
  g.computeVertexNormals();
  return g;
}
export const ringAt = (pts, y) => pts.map(([x, z]) => V(x, y, z));

// Parabolic dish (radius R, depth d) opening toward -Z, thin shell, centred at the vertex.
export function dish(R, d, t = 0.03, seg = 24) {
  const pts = [], n = 8;
  for (let i = n; i >= 0; i--) { const r = (R * i) / n; pts.push([r, d * (r / R) ** 2]); }
  for (let i = 0; i <= n; i++) { const r = (R * i) / n; pts.push([r, d * (r / R) ** 2 + t]); }
  return lathe(pts, seg).rotateX(-Math.PI / 2);
}

// Turn a surface inside out (reverse the winding, negate the normals): the lining of a well or a
// tube seen from inside.
export function inside(geom) {
  const g = geom.index ? geom.toNonIndexed() : geom.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position.array, n = g.attributes.normal.array, uv = g.attributes.uv?.array;
  for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) { const t = p[i + 3 + c]; p[i + 3 + c] = p[i + 6 + c]; p[i + 6 + c] = t; const u = n[i + 3 + c]; n[i + 3 + c] = n[i + 6 + c]; n[i + 6 + c] = u; }
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  if (uv) for (let i = 0; i < uv.length; i += 6) for (let c = 0; c < 2; c++) { const t = uv[i + 2 + c]; uv[i + 2 + c] = uv[i + 4 + c]; uv[i + 4 + c] = t; }
  return g;
}

export function mergeAll(list) {
  const l = list.map((g) => {
    const c = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') c.deleteAttribute(k);
    if (!c.attributes.uv) c.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
    return c;
  });
  return mergeGeometries(l, false);
}

// Bolt heads: low domes standing on a surface with normal `nrm`, one merged geometry.
const _bolt = new THREE.SphereGeometry(1, 5, 2, 0, TAU, 0, Math.PI / 2); // a low dome, 15 triangles
export function bolts(pts, nrm, r = 0.025, h = 0.6) {
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), nrm.clone().normalize());
  return mergeAll(pts.map((p) => _bolt.clone().applyMatrix4(new THREE.Matrix4().compose(p, q, V(r, r * h, r)))));
}
export function boltRow(a, b, spacing, nrm, r = 0.025) {
  const n = Math.max(1, Math.round(a.distanceTo(b) / spacing)), pts = [];
  for (let i = 0; i <= n; i++) pts.push(a.clone().lerp(b, i / n));
  return bolts(pts, nrm, r);
}
// Bolts round a plan outline [[x, z], ...] at height y, inset toward its centroid.
export function boltOutline(poly, y, inset, spacing, r = 0.025) {
  const c = poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
  const pts = [];
  let carry = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let s = carry; s < len; s += spacing) {
      const t = s / len, px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t;
      const dx = c[0] - px, dz = c[1] - pz, dl = Math.hypot(dx, dz) || 1;
      pts.push(V(px + (dx / dl) * inset, y, pz + (dz / dl) * inset));
    }
    carry = (carry + Math.ceil((len - carry) / spacing) * spacing) - len;
  }
  return bolts(pts, V(0, 1, 0), r);
}

// Handwheel with its axis along X (centre at the origin): rim, spokes, hub, one turning handle.
export function handwheel(R, spokes = 5, tube = 0.018, hub = 0.04) {
  const list = [new THREE.TorusGeometry(R, tube, 6, 20).rotateY(Math.PI / 2), xTube(-hub, hub * 1.4, hub, hub * 0.8, 10)];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU + 0.3;
    list.push(rod(V(0, 0, 0), V(0, Math.cos(a) * R, Math.sin(a) * R), tube * 0.7, 5));
  }
  list.push(xTube(0, 0.14, tube, tube, 6, Math.cos(0.3) * R, Math.sin(0.3) * R));
  return mergeAll(list);
}

// ---------------------------------------------------------------- part collectors

const _c3 = new THREE.Color();

// Collects geometry per material key, then merges each key into one mesh (Drumfire's Parts). Every
// geometry gets position, normal, uv and a colour tint, so any set can be merged. `tint` darkens a
// part (well interiors, the far end of a tube) without a separate material.
export class Parts {
  constructor(mats) {
    this.mats = mats;
    this.lists = new Map();
  }

  add(key, geom, { tint = 0xffffff, uvScale = key === 'deck' ? 1.5 : 4 } = {}) {
    if (!geom) return this;
    let g = geom.index ? geom.toNonIndexed() : geom.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    projectUV(g, uvScale);
    const col = new Float32Array(g.attributes.position.count * 3);
    _c3.set(tint);
    for (let i = 0; i < col.length; i += 3) { col[i] = _c3.r; col[i + 1] = _c3.g; col[i + 2] = _c3.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!this.lists.has(key)) this.lists.set(key, []);
    this.lists.get(key).push(g);
    return this;
  }

  // a geometry and its mirror image across x = 0
  sym(key, geom, o) {
    this.add(key, geom, o);
    return this.add(key, mirrorX(geom), o);
  }

  // all geometry so far, transformed by a matrix (a part placed at one mount of many)
  transform(m) {
    for (const list of this.lists.values()) for (const g of list) g.applyMatrix4(m);
    return this;
  }

  // copies of all geometry so far, transformed by m, appended to another collector (the static
  // parts of one mount placed at each of its positions)
  copyInto(dst, m) {
    for (const [key, list] of this.lists) {
      if (!dst.lists.has(key)) dst.lists.set(key, []);
      for (const g of list) dst.lists.get(key).push(g.clone().applyMatrix4(m));
    }
    return dst;
  }

  // move all geometry into another collector (emptying this one)
  moveInto(dst) {
    for (const [key, list] of this.lists) {
      if (!dst.lists.has(key)) dst.lists.set(key, []);
      dst.lists.get(key).push(...list);
    }
    this.lists.clear();
    return dst;
  }

  dispose() {
    for (const list of this.lists.values()) for (const g of list) g.dispose();
    this.lists.clear();
  }

  empty() { return this.lists.size === 0; }

  // Merge each material into one mesh under `parent`.
  build(parent, { shadow = true, order = 0, name = '' } = {}) {
    const out = [];
    for (const [key, list] of this.lists) {
      const g = mergeGeometries(list, false);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.mats[key]);
      m.name = name ? `${name}:${key}` : key;
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.renderOrder = order;
      parent.add(m);
      out.push(m);
      for (const l of list) l.dispose();
    }
    this.lists.clear();
    return out;
  }

  // One InstancedMesh per material, `count` copies of the part, each placed by setMatrix(i, m).
  instanced(parent, count, { shadow = true, order = 0, name = '' } = {}) {
    const meshes = [];
    for (const [key, list] of this.lists) {
      const g = mergeGeometries(list, false);
      const im = new THREE.InstancedMesh(g, this.mats[key], count);
      im.name = name ? `${name}:${key}` : key;
      im.castShadow = shadow;
      im.receiveShadow = true;
      im.renderOrder = order;
      // instances spread far beyond the template's bounding sphere
      im.frustumCulled = false;
      parent.add(im);
      meshes.push(im);
      for (const l of list) l.dispose();
    }
    this.lists.clear();
    return new InstanceSet(meshes, count);
  }
}

const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

// The instances of one moving part across all its mounts: one matrix per mount, shared by every
// material's InstancedMesh. hide(i) collapses an instance (a round that has left its cell).
export class InstanceSet {
  constructor(meshes, count) {
    this.meshes = meshes;
    this.count = count;
    this.visible = new Array(count).fill(true);
    this.matrices = Array.from({ length: count }, () => new THREE.Matrix4());
  }

  set(i, m) {
    this.matrices[i].copy(m);
    const out = this.visible[i] ? m : _zero;
    for (const im of this.meshes) { im.setMatrixAt(i, out); im.instanceMatrix.needsUpdate = true; }
  }

  show(i, on) {
    if (this.visible[i] === on) return;
    this.visible[i] = on;
    this.set(i, this.matrices[i]);
  }
}

// Box-projected UVs (scale metres per tile) so the paint grain is continuous in metres on any part.
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

// ---------------------------------------------------------------- textures

// Periodic value noise (Drumfire kit): x, y in [0, 1) tile units over px by py lattice cells.
const hashI = (x, y, s) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
function pnoise(x, y, px, py, s) {
  const X = x * px, Y = y * py, x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const xa = ((x0 % px) + px) % px, xb = (xa + 1) % px, ya = ((y0 % py) + py) % py, yb = (ya + 1) % py;
  const a = hashI(xa, ya, s), b = hashI(xb, ya, s), c = hashI(xa, yb, s), d = hashI(xb, yb, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function pfbm(x, y, px, py, oct, s, gain = 0.5) {
  let a = 1, sum = 0, n = 0;
  for (let o = 0; o < oct; o++) { sum += a * pnoise(x, y, px, py, s + o * 17); n += a; a *= gain; px *= 2; py *= 2; }
  return sum / n;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lin2srgb = (l) => 255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);

const canvasTex = (c, { srgb = true } = {}) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
};

function normalCanvas(h, size, strength) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5, dy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
    const nx = -dx * strength, ny = dy * strength, l = 1 / Math.hypot(nx, ny, 1), i = (y * size + x) * 4;
    img.data[i] = (nx * l * 0.5 + 0.5) * 255;
    img.data[i + 1] = (ny * l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (l * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// A 4 m tile of painted, welded ship steel: plates about 2 m by 1.3 m with weld seams, a soft
// mottle of repainting, salt and rust streaks running down from the seams, chipped edges. The albedo
// is a neutral grey multiplied by each material's colour, so one tile serves every painted grey.
// Returns { map, rough, normal }.
const paintSets = {};
export function paintTextures(size = 512, seams = true) {
  const key = `${size}:${seams}`;
  if (paintSets[key]) return paintSets[key];
  const N = size * size, alb = new Float32Array(N), rus = new Float32Array(N), rg = new Float32Array(N), ht = new Float32Array(N);
  const rows = 3, cols = 2;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const u = px / size, v = py / size, i = py * size + px;
    // weld seams: horizontal every 1/3 tile, vertical every half tile, offset per row
    const row = Math.floor(v * rows), off = (row % 2) * 0.25;
    const sy = Math.min(v * rows - row, row + 1 - v * rows) * (size / rows);
    const ux = ((u + off) * cols) % 1, sx = Math.min(ux, 1 - ux) * (size / cols);
    const seam = Math.min(sy, sx);
    const bead = seams && seam < 1.6 ? 1 : 0, nearSeam = seams ? sstep(14, 0, seam) : 0.25;
    // repaint mottle, and the slight oil-canning of thin plates between the frames
    const mottle = pfbm(u, v, 3, 3, 4, 11);
    let k = 0.93 + (mottle - 0.5) * 0.12 + (pfbm(u, v, 90, 90, 2, 12) - 0.5) * 0.05;
    // salt and rust runs, strongest just under the seams
    const runs = sstep(0.58, 0.85, pfbm(u, v, 48, 2, 3, 13));
    const below = sy < size / rows * 0.6 && v * rows - row < 0.5 ? 1 : 0.4;
    const rust = runs * below * 0.55 + nearSeam * sstep(0.62, 0.8, pfbm(u, v, 20, 20, 2, 14)) * 0.6;
    k *= 1 - runs * 0.06;
    // chipped paint at the seams shows primer
    const chip = nearSeam * sstep(0.7, 0.78, pnoise(u, v, 120, 120, 15) * 0.6 + pnoise(u, v, 260, 260, 16) * 0.4);
    if (bead) k *= 0.82;
    alb[i] = k * (1 - chip * 0.35);
    rus[i] = Math.min(1, rust + chip * 0.8);
    rg[i] = 0.62 + mottle * 0.12 + runs * 0.1 + chip * 0.2 - bead * 0.05;
    ht[i] = (pfbm(u, v, 128, 128, 2, 17) - 0.5) * 0.3 + bead * 1.1 - chip * 0.5 + (mottle - 0.5) * 0.6;
  }
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const cvA = mk(), cvR = mk(), ctxA = cvA.getContext('2d'), ctxR = cvR.getContext('2d');
  const imA = ctxA.createImageData(size, size), imR = ctxR.createImageData(size, size);
  // rust tone mixed into the grey: a warm brown that reads under any paint colour
  for (let i = 0; i < N; i++) {
    const g = alb[i], r = rus[i];
    imA.data[i * 4] = lin2srgb(Math.min(1, g * (1 - r) + 0.42 * r));
    imA.data[i * 4 + 1] = lin2srgb(Math.min(1, g * (1 - r) + 0.25 * r));
    imA.data[i * 4 + 2] = lin2srgb(Math.min(1, g * (1 - r) + 0.15 * r));
    imA.data[i * 4 + 3] = 255;
    imR.data[i * 4] = imR.data[i * 4 + 2] = 0;
    imR.data[i * 4 + 1] = Math.min(255, rg[i] * 255);
    imR.data[i * 4 + 3] = 255;
  }
  ctxA.putImageData(imA, 0, 0);
  ctxR.putImageData(imR, 0, 0);
  paintSets[key] = { map: canvasTex(cvA), rough: canvasTex(cvR, { srgb: false }), normal: canvasTex(normalCanvas(ht, size, 1.2), { srgb: false }) };
  return paintSets[key];
}

// Non-skid deck coating (the photographs show the launcher fields as dark as the deck round them):
// a gritty matt surface with scuffs and darker footpaths. Returns { map, rough, normal }.
let deckSet;
export function deckTextures(size = 256) {
  if (deckSet) return deckSet;
  const N = size * size, alb = new Float32Array(N), ht = new Float32Array(N);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const u = px / size, v = py / size, i = py * size + px;
    const grit = pnoise(u, v, 160, 160, 31), big = pfbm(u, v, 3, 3, 3, 32);
    alb[i] = 0.86 + (grit - 0.5) * 0.12 + (big - 0.5) * 0.1 - sstep(0.62, 0.78, pfbm(u, v, 5, 5, 2, 33)) * 0.06;
    ht[i] = (grit - 0.5) * 0.9 + (pnoise(u, v, 60, 60, 34) - 0.5) * 0.25;
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), im = ctx.createImageData(size, size);
  for (let i = 0; i < N; i++) {
    const g = lin2srgb(Math.min(1, alb[i]));
    im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = g;
    im.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  deckSet = { map: canvasTex(cv), normal: canvasTex(normalCanvas(ht, size, 1.6), { srgb: false }) };
  return deckSet;
}

// A missile body's finish: satin paint, faint longitudinal panel lines and access-panel screws.
let skinSet;
export function skinTextures(size = 256) {
  if (skinSet) return skinSet;
  const N = size * size, ht = new Float32Array(N), alb = new Float32Array(N);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const u = px / size, v = py / size, i = py * size + px;
    const lineU = Math.min((u * 4) % 1, 1 - (u * 4) % 1) * size / 4, lineV = Math.min((v * 2) % 1, 1 - (v * 2) % 1) * size / 2;
    const line = Math.min(lineU, lineV) < 0.8 ? 1 : 0;
    const screw = (lineV < 5 && Math.abs(((u * 32) % 1) - 0.5) < 0.06) ? 1 : 0;
    alb[i] = 0.95 + (pfbm(u, v, 4, 4, 3, 41) - 0.5) * 0.06 - line * 0.18 - screw * 0.2;
    ht[i] = -line * 0.8 + screw * 0.6 + (pnoise(u, v, 100, 100, 42) - 0.5) * 0.1;
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), im = ctx.createImageData(size, size);
  for (let i = 0; i < N; i++) {
    const g = lin2srgb(Math.min(1, alb[i]));
    im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = g;
    im.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  skinSet = { map: canvasTex(cv), normal: canvasTex(normalCanvas(ht, size, 1), { srgb: false }) };
  return skinSet;
}

// ---------------------------------------------------------------- materials

const std = (color, rough = 0.7, metal = 0.1, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, vertexColors: true, ...extra });
let matSet;

// The weapons' shared material set. Painted greys follow the exterior's Soviet naval light grey,
// the launcher lids the deck's red-brown non-skid; the missiles' finishes come from the public
// colour photographs of museum rounds (P-700 light grey, 5V55 off-white, 9M33 white).
export function weaponMats() {
  if (matSet) return matSet;
  const paint = paintTextures(), cast = paintTextures(256, false), deck = deckTextures(), skin = skinTextures();
  const painted = (color, rough = 1, extra = {}, tex = paint) => {
    const m = std(color, rough, 0.12, { map: tex.map, roughnessMap: tex.rough, normalMap: tex.normal, ...extra });
    m.normalScale.set(0.6, 0.6);
    return m;
  };
  const skinned = (color, rough, metal = 0.05) => {
    const m = std(color, rough, metal, { map: skin.map, normalMap: skin.normal });
    m.normalScale.set(0.5, 0.5);
    return m;
  };
  const deckMat = std(0x7a5446, 0.95, 0.02, { map: deck.map, normalMap: deck.normal });
  deckMat.normalScale.set(0.45, 0.45);
  matSet = {
    paint: painted(0xa9b6b8), // light grey: mounts, casings, lids that are not on the deck
    paintCast: painted(0xa9b6b8, 1, {}, cast), // the same grey on cast and moulded housings (no weld seams)
    paintMid: painted(0x8a989c), // shadowed and recessed paint, bases and coamings
    paintDark: painted(0x5d6a6e), // the insides of wells and housings
    deck: deckMat, // red-brown non-skid, as the deck the lids sit flush with
    steel: std(0x7d8589, 0.38, 0.75), // bare and greased steel: rams, hinge pins, rails, bores
    darkSteel: std(0x2b3134, 0.55, 0.55), // blackened gun steel, mechanism, rotor
    dark: std(0x161b1d, 0.85, 0.1), // tube interiors, slots, shadowed openings
    rubber: std(0x1a1e20, 0.95, 0),
    radome: std(0xd9dcd3, 0.55, 0.0), // fibreglass radomes
    radomeTan: std(0xc4ad86, 0.6, 0.0), // the 4R33's tan dielectric faces (Frunze, 1985, in colour)
    glass: std(0x1d2a31, 0.08, 0.6, { envMapIntensity: 2 }),
    missile: skinned(0xc2c7c1, 0.5), // P-700 light grey
    missileWhite: skinned(0xe2e3dc, 0.45), // 5V55 and 9M33 off-white
    missileDark: skinned(0x3f4747, 0.6), // nose radomes, dielectric panels, nozzles
    brass: std(0xa5823e, 0.35, 0.85),
    soot: std(0x22201d, 1, 0),
    water: std(0x10282a, 0.04, 0.0, { envMapIntensity: 1.5 }), // sea water standing in a flooded tube
  };
  return matSet;
}

// Indicator lamp colours: a mount's safe, ready and armed lights.
export const LAMP = { off: 0x2a2a26, safe: 0x2fd067, ready: 0xffb21e, armed: 0xff2a1a };

// Every indicator lamp on every mount in one InstancedMesh: a small lens in its housing, coloured
// per instance (instance colours above 1 bloom). add() returns the lamp's index.
export class LampSet {
  constructor(parent, max = 64) {
    // a small lens dome, visible from any direction above the deck
    const g = mergeAll([new THREE.SphereGeometry(0.09, 8, 3, 0, TAU, 0, Math.PI / 2), new THREE.CylinderGeometry(0.1, 0.1, 0.03, 8)]);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true }), max);
    this.mesh.name = 'weapon-lamps';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.max = max;
    this.colors = [];
    this.c = new THREE.Color();
    parent.add(this.mesh);
  }

  add(matrix) {
    const i = this.mesh.count++;
    this.mesh.setMatrixAt(i, matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colors.push(-1);
    this.set(i, LAMP.off);
    return i;
  }

  move(i, matrix) {
    this.mesh.setMatrixAt(i, matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // colour and brightness (blink by passing a lower k)
  set(i, hex, k = 1) {
    const key = hex * 8 + Math.round(k * 7);
    if (this.colors[i] === key) return;
    this.colors[i] = key;
    const lit = hex !== LAMP.off;
    this.c.setHex(hex).multiplyScalar(lit ? 2.5 * k + 0.15 : 0.6);
    this.mesh.setColorAt(i, this.c);
    this.mesh.instanceColor.needsUpdate = true;
  }
}
// ---------------------------------------------------------------- deck cut-outs

// The exterior's deck is one continuous plating. Where a launcher opens onto a well below deck, the
// deck must not be drawn over the opening, or an open hatch would look onto flat plating. These
// cut-outs patch the exterior's materials to discard fragments inside the openings: each hole is a
// vertical prism in ship space (a stadium or circle in plan, from yBottom to yTop), tested only near
// the deck. The ship's inverse world matrix is a uniform the weapons update every frame.
export class DeckCutouts {
  constructor(max = 48) {
    this.max = max;
    this.holes = [];
    // per hole: (x, z, half-width across, half-length along) and (yBottom, yTop, corner radius, 0)
    this.uA = Array.from({ length: max }, () => new THREE.Vector4());
    this.uB = Array.from({ length: max }, () => new THREE.Vector4());
    this.uniforms = { uCutA: { value: this.uA }, uCutB: { value: this.uB }, uCutN: { value: 0 }, uShipInv: { value: new THREE.Matrix4() }, uCutBox: { value: new THREE.Vector4() } };
    this.patched = new WeakSet();
  }

  // A rounded rectangle in plan: centre (x, z), length L along Z, width W across, corner radius
  // (W / 2, the default, makes a stadium; with L = W a circle).
  add(x, z, L, W, yBottom, yTop, corner = W / 2) {
    if (this.holes.length >= this.max) return;
    this.holes.push({ x, z, hx: W / 2, hz: L / 2, r: Math.min(corner, W / 2, L / 2), yBottom, yTop });
    this._sync();
  }

  _sync() {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    this.holes.forEach((h, i) => {
      this.uA[i].set(h.x, h.z, h.hx, h.hz);
      this.uB[i].set(h.yBottom, h.yTop, h.r, 0);
      x0 = Math.min(x0, h.x - h.hx); x1 = Math.max(x1, h.x + h.hx);
      z0 = Math.min(z0, h.z - h.hz); z1 = Math.max(z1, h.z + h.hz);
    });
    this.uniforms.uCutN.value = this.holes.length;
    this.uniforms.uCutBox.value.set(x0, x1, z0, z1);
  }

  // Patch the materials of every mesh under `root` whose bounds reach the openings (the exterior's
  // deck, whatever material it is drawn with). `root` must be in ship space.
  apply(root) {
    const box = new THREE.Box3(), cut = new THREE.Box3();
    const [x0, x1, z0, z1] = this.uniforms.uCutBox.value.toArray();
    const y0 = Math.min(...this.holes.map((h) => h.yBottom)), y1 = Math.max(...this.holes.map((h) => h.yTop));
    cut.min.set(x0, y0, z0); cut.max.set(x1, y1, z1);
    root.updateWorldMatrix(true, true);
    const inv = root.matrixWorld.clone().invert();
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
      if (!box.intersectsBox(cut)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) this.patch(m);
    });
  }

  update(shipMatrixWorld) {
    this.uniforms.uShipInv.value.copy(shipMatrixWorld).invert();
  }

  // Patch a material (once). It keeps the project's fog uniforms (shaderlib's patchSceneFog skips a
  // material already marked patched) and any onBeforeCompile the exterior gave it.
  patch(mat) {
    if (!mat || this.patched.has(mat) || mat.isShaderMaterial || !(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial)) return;
    this.patched.add(mat);
    const prev = mat.userData.patched ? mat.onBeforeCompile : null, prevKey = mat.userData.patched ? mat.customProgramCacheKey?.() : 'fog';
    const U = this.uniforms, max = this.max;
    mat.onBeforeCompile = (shader, renderer) => {
      if (prev) prev(shader, renderer); else Object.assign(shader.uniforms, globalUniforms);
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uShipInv;\nvarying vec3 vShipPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n{\n  vec4 wpc = vec4( transformed, 1.0 );\n  #ifdef USE_INSTANCING\n  wpc = instanceMatrix * wpc;\n  #endif\n  vShipPos = ( uShipInv * modelMatrix * wpc ).xyz;\n}');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform vec4 uCutA[${max}];\nuniform vec4 uCutB[${max}];\nuniform int uCutN;\nuniform vec4 uCutBox;\nvarying vec3 vShipPos;`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if ( vShipPos.x > uCutBox.x && vShipPos.x < uCutBox.y && vShipPos.z > uCutBox.z && vShipPos.z < uCutBox.w ) {
    for ( int i = 0; i < ${max}; i++ ) {
      if ( i >= uCutN ) break;
      vec4 a = uCutA[i]; vec4 b = uCutB[i];
      if ( vShipPos.y < b.x || vShipPos.y > b.y ) continue;
      vec2 q = abs( vShipPos.xz - a.xy ) - ( a.zw - b.z );
      if ( length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - b.z < 0.0 ) discard;
    }
  }`);
    };
    mat.customProgramCacheKey = () => `${prevKey}|deckcut${max}`;
    mat.userData.patched = true;
    mat.needsUpdate = true;
  }
}
