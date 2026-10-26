import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Modelling kit for the Kirov bridge, adapted from Drumfire's src/models/kit.js: geometry helpers,
// periodic noise for canvas textures, a merge-per-material part collector and the interior finish
// shader (chipped edges, scuffed low panels, grime in corners).
// Room space: deck at y = 0, forward is -Z, starboard is +X, metres.

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function xf(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  const sc = typeof s === 'number' ? V(s, s, s) : s;
  return new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), sc);
}

// ---------------------------------------------------------------- edge marking

// Per-vertex edge factor (aEdge, 0..1) from the vertex normal in the geometry's own frame, before it
// is placed: normals that point between the principal axes sit on a bevel or a rounded corner, where
// paint is knocked off first. mode 'box' tests all three axes; 'y', 'x', 'z' are for solids of
// revolution about that axis (the side and the caps count as faces, the rounded rims as edges).
export function markEdges(g, mode = 'box', gain = 3.2) {
  const n = g.attributes.normal;
  if (!n) g.computeVertexNormals();
  const nn = g.attributes.normal, e = new Float32Array(nn.count);
  for (let i = 0; i < nn.count; i++) {
    const x = Math.abs(nn.getX(i)), y = Math.abs(nn.getY(i)), z = Math.abs(nn.getZ(i));
    let m;
    if (mode === 'y') m = Math.max(y, Math.hypot(x, z));
    else if (mode === 'x') m = Math.max(x, Math.hypot(y, z));
    else if (mode === 'z') m = Math.max(z, Math.hypot(x, y));
    else m = Math.max(x, y, z);
    e[i] = clamp((1 - m) * gain, 0, 1);
  }
  g.setAttribute('aEdge', new THREE.BufferAttribute(e, 1));
  return g;
}

// ---------------------------------------------------------------- primitives

export const box = (w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) =>
  new THREE.BoxGeometry(w, h, d).applyMatrix4(xf(x, y, z, rx, ry, rz));

// Rounded box with marked edges: the radius is clamped to the smallest half size.
// Small radii get one segment: the bevel still catches light and marks the edge for wear.
export function rbox(w, h, d, r, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = null) {
  const rr = Math.max(0.001, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  const g = new RoundedBoxGeometry(w, h, d, seg ?? (rr >= 0.025 ? 2 : 1), rr);
  return markEdges(g).applyMatrix4(xf(x, y, z, rx, ry, rz));
}

export const sphere = (r, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 14) =>
  new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)).applyMatrix4(xf(x, y, z, 0, 0, 0, V(sx, sy, sz)));

// Tubes along an axis from a0 to a1, radius r0 at a0 and r1 at a1.
export function yTube(y0, y1, r0, r1 = r0, seg = 16, x = 0, z = 0, open = false) {
  const g = markEdges(new THREE.CylinderGeometry(r1, r0, Math.abs(y1 - y0), seg, 1, open), 'y');
  return g.applyMatrix4(xf(x, (y0 + y1) / 2, z, y1 < y0 ? PI : 0));
}
export function zTube(z0, z1, r0, r1 = r0, seg = 16, x = 0, y = 0, open = false) {
  const g = markEdges(new THREE.CylinderGeometry(r1, r0, Math.abs(z1 - z0), seg, 1, open), 'y');
  return g.applyMatrix4(xf(x, y, (z0 + z1) / 2, z1 > z0 ? PI / 2 : -PI / 2));
}
export function xTube(x0, x1, r0, r1 = r0, seg = 16, y = 0, z = 0, open = false) {
  const g = markEdges(new THREE.CylinderGeometry(r1, r0, Math.abs(x1 - x0), seg, 1, open), 'y');
  return g.applyMatrix4(xf((x0 + x1) / 2, y, z, 0, 0, x1 > x0 ? -PI / 2 : PI / 2));
}

// A cylinder between two points.
export function rod(a, b, r, seg = 8) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
  return g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
}

// A bent pipe or cable through points (Catmull-Rom), radius r.
export function pipe(points, r, seg = 8, tubular = null, tension = 0.5) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', tension);
  return new THREE.TubeGeometry(curve, tubular || Math.max(8, Math.round(curve.getLength() / 0.06)), r, seg, false);
}

export const plane = (w, h, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) =>
  new THREE.PlaneGeometry(w, h).applyMatrix4(xf(x, y, z, rx, ry, rz));

export const disc = (r, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 32) =>
  new THREE.CircleGeometry(r, seg).applyMatrix4(xf(x, y, z, rx, ry, rz));

// Lathe edges from the profile: a point where the profile turns sharply is a rim, and every vertex
// of its ring gets the same wear; smooth tapers and domes stay clean.
function latheGeometry(prof, seg) {
  const v = prof.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
  const g = new THREE.LatheGeometry(v, seg), n = v.length;
  const turn = v.map((p, j) => {
    if (j === 0 || j === n - 1) return 0.6;
    const a = v[j].clone().sub(v[j - 1]).normalize(), b = v[j + 1].clone().sub(v[j]).normalize();
    const t = (1 - a.dot(b)) * 2.2;
    return Number.isFinite(t) ? clamp(t, 0, 1) : 0;
  });
  const e = new Float32Array(g.attributes.position.count);
  for (let i = 0; i <= seg; i++) for (let j = 0; j < n; j++) e[i * n + j] = turn[j];
  g.setAttribute('aEdge', new THREE.BufferAttribute(e, 1));
  return g;
}
// Lathe about Y from [radius, y] points (low y first).
export const lathe = (pts, seg = 24) => latheGeometry(pts, seg);
// The same about Z (from [z, r], -z first) and X (from [x, r]).
export const zLathe = (pts, seg = 24) => latheGeometry(pts.map(([z, r]) => [r, z]), seg).rotateX(PI / 2);
export const xLathe = (pts, seg = 24) => latheGeometry(pts.map(([x, r]) => [r, x]), seg).rotateZ(-PI / 2);

// Convex solid through stacked rings of points (same count, ordered round the outline), faces
// turned away from the centroid, normals smoothed below the crease angle (Drumfire's loft).
export function loft(rings, { top = true, bottom = true, crease = PI / 4.5 } = {}) {
  const c = V();
  let n = 0;
  for (const r of rings) for (const p of r) { c.add(p); n++; }
  c.divideScalar(n);
  const out = [], e1 = V(), e2 = V(), m = V();
  const tri = (a, b, d) => {
    e1.subVectors(b, a); e2.subVectors(d, a); e1.cross(e2);
    if (e1.lengthSq() < 1e-14) return;
    m.copy(a).add(b).add(d).divideScalar(3).sub(c);
    if (e1.dot(m) < 0) out.push(a, d, b); else out.push(a, b, d);
  };
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k], B = rings[k + 1];
    for (let i = 0; i < A.length; i++) { const j = (i + 1) % A.length; tri(A[i], A[j], B[j]); tri(A[i], B[j], B[i]); }
  }
  const cap = (R) => { const cc = R.reduce((s, p) => s.add(p), V()).divideScalar(R.length); for (let i = 0; i < R.length; i++) tri(cc, R[i], R[(i + 1) % R.length]); };
  if (top) cap(rings[rings.length - 1]);
  if (bottom) cap(rings[0]);
  const g = toCreasedNormals(new THREE.BufferGeometry().setFromPoints(out), crease);
  g.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  return g;
}

// A rounded rectangle of points in plan (x across, z fore and aft) at height y: for loft rings.
export function planRing(w, d, r, y, zc = 0, n = 6) {
  const pts = [], cx = w / 2 - r, cz = d / 2 - r;
  for (const [sx, sz, a0] of [[1, 1, 0], [-1, 1, PI / 2], [-1, -1, PI], [1, -1, PI * 1.5]]) {
    for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * PI / 2; pts.push(V(sx * cx + Math.cos(a) * r, y, zc + sz * cz + Math.sin(a) * r)); }
  }
  return pts;
}

// Rounded rectangle outline (w by h, corner radius r), centred, counter-clockwise.
export function rrectShape(w, h, r, path = new THREE.Shape()) {
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4);
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

// A rounded-rectangle ring (outer w by h, inner wi by hi) extruded by depth along +Z from z = 0,
// with bevels: window frames, bezels, door frames.
export function rrectRing(w, h, r, wi, hi, ri, depth, bevel = 0.01, curve = 6) {
  const s = rrectShape(w, h, r);
  const hole = rrectShape(wi, hi, ri, new THREE.Path());
  s.holes.push(new THREE.Path(hole.getPoints(Math.max(2, curve - 1)).reverse()));
  if (bevel < 0.005) bevel = 0;
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevel > 0.009 ? 2 : 1, curveSegments: curve, steps: 1 });
  g.translate(0, 0, bevel);
  return markEdges(g, 'z');
}

// A rounded-rectangle slab extruded along +Z from z = 0.
export function rrectSlab(w, h, r, depth, bevel = 0.01, curve = 6) {
  if (bevel < 0.005) bevel = 0;
  const g = new THREE.ExtrudeGeometry(rrectShape(w, h, r), { depth: Math.max(0.001, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevel > 0.009 ? 2 : 1, curveSegments: curve, steps: 1 });
  g.translate(0, 0, bevel);
  return markEdges(g, 'z');
}

// Side profile [z, y] points extruded across x in [-w/2, w/2], with optional bevel (front is -Z).
export function sideProfile(pts, w, bevel = 0, curve = 8) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, w - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: curve });
  g.translate(0, 0, -(w - bevel * 2) / 2);
  markEdges(g, 'z');
  g.rotateY(-PI / 2);
  return g;
}

// Front profile [x, y] points extruded along z from z0 to z1.
export function frontProfile(pts, z0, z1, bevel = 0, curve = 8) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, Math.abs(z1 - z0) - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: curve });
  markEdges(g, 'z');
  return g.translate(0, 0, Math.min(z0, z1) + bevel);
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

// Merge geometries keeping position, normal, uv and aEdge (filled where missing).
export function mergeAll(list) {
  const l = list.map((g) => {
    const c = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv', 'aEdge'].includes(k)) c.deleteAttribute(k);
    if (!c.attributes.normal) c.computeVertexNormals();
    if (!c.attributes.uv) c.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
    if (!c.attributes.aEdge) c.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(c.attributes.position.count), 1));
    return c;
  });
  return mergeGeometries(l, false);
}

// Box-projected UVs (scale metres per tile) so paint and grain run continuously across parts.
export function projectUV(g, scale = 1) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    // the triangle's face normal picks the projection so a face never smears across two axes
    let ax = 0, ay = 0, az = 0;
    for (let k = 0; k < 3; k++) { ax += n.getX(i + k); ay += n.getY(i + k); az += n.getZ(i + k); }
    ax = Math.abs(ax); ay = Math.abs(ay); az = Math.abs(az);
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      let u, v;
      if (ax >= ay && ax >= az) { u = z; v = y; } else if (ay >= az) { u = x; v = z; } else { u = x; v = y; }
      uv[(i + k) * 2] = u / scale;
      uv[(i + k) * 2 + 1] = v / scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Remap a geometry's 0..1 UVs into an atlas rectangle {u0, v0, u1, v1}.
export function atlasUV(g, r) {
  const a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, r.u0 + a.getX(i) * (r.u1 - r.u0), r.v0 + a.getY(i) * (r.v1 - r.v0));
  return g;
}

// ---------------------------------------------------------------- rivets, bolts, handwheels

const _dome = new THREE.SphereGeometry(1, 6, 2, 0, TAU, 0, PI / 2);
// Low domed heads standing on a surface with normal nrm (screw and rivet heads).
export function heads(pts, nrm, r = 0.008, h = 0.55) {
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), nrm.clone().normalize());
  return mergeAll(pts.map((p) => _dome.clone().applyMatrix4(new THREE.Matrix4().compose(p, q, V(r, r * h, r)))));
}
const _hex = new THREE.CylinderGeometry(1, 1, 1, 6);
// Hex bolt heads (flat hexagonal prisms) on a surface with normal nrm.
export function bolts(pts, nrm, r = 0.01, h = 0.008) {
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), nrm.clone().normalize());
  return mergeAll(pts.map((p, i) => _hex.clone().applyMatrix4(new THREE.Matrix4().compose(p.clone().addScaledVector(nrm, h / 2), q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), i * 0.7)), V(r, h, r)))));
}
// Screw heads round a rectangle (w by h) in the plane through c with axes ux, uy and normal nrm.
export function screwFrame(c, ux, uy, w, h, nrm, r = 0.006, nx = 2, ny = 2) {
  const pts = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    if (i > 0 && i < nx - 1 && j > 0 && j < ny - 1) continue;
    pts.push(c.clone().addScaledVector(ux, (nx > 1 ? i / (nx - 1) - 0.5 : 0) * w).addScaledVector(uy, (ny > 1 ? j / (ny - 1) - 0.5 : 0) * h));
  }
  return heads(pts, nrm, r);
}

// Handwheel with its axis along Z (rim, spokes, hub), centred at the origin.
export function handwheel(R, spokes = 5, tube = 0.008, hub = 0.02) {
  const list = [markEdges(new THREE.TorusGeometry(R, tube, 8, 28), 'z', 1.5)];
  list.push(zTube(-hub * 0.8, hub * 1.2, hub, hub * 0.85, 12));
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU + 0.3;
    list.push(rod(V(0, 0, 0), V(Math.cos(a) * R, Math.sin(a) * R, 0), tube * 0.75, 5));
  }
  return mergeAll(list);
}

// Star (lobed) knob outline of n lobes, radius R, lobe depth k.
export function lobedShape(n, R, k = 0.25, seg = 10) {
  const s = new THREE.Shape();
  const N = n * seg;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    const r = R * (1 - k * 0.5 + k * 0.5 * Math.cos(a * n));
    if (i === 0) s.moveTo(r * Math.cos(a), r * Math.sin(a)); else s.lineTo(r * Math.cos(a), r * Math.sin(a));
  }
  return s;
}

// ---------------------------------------------------------------- periodic noise (Drumfire)

const hashI = (x, y, s) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
export { hashI };
// Periodic value noise on a tile: x, y in [0, 1), px by py lattice cells, so textures wrap exactly.
export function pnoise(x, y, px, py, s) {
  const X = x * px, Y = y * py;
  const x0 = Math.floor(X), y0 = Math.floor(Y);
  const fx = X - x0, fy = Y - y0;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const xa = ((x0 % px) + px) % px, xb = (xa + 1) % px, ya = ((y0 % py) + py) % py, yb = (ya + 1) % py;
  const a = hashI(xa, ya, s), b = hashI(xb, ya, s), c = hashI(xa, yb, s), d = hashI(xb, yb, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function pfbm(x, y, px, py, oct, s, gain = 0.5) {
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
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const lin2srgb = (l) => 255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(clamp(l, 0, 1), 1 / 2.4) - 0.055);

// ---------------------------------------------------------------- parts collector

const c3 = new THREE.Color();

// Collects geometry per material key, then merges each key into one mesh. Every geometry gets
// position, normal, uv, color (tint times baked room occlusion), aEdge (paint wear on edges) and
// aH (height above the deck, for the scuffed kick zone), so any set merges.
// Materials with userData.uvScale get box-projected UVs (metres per tile) unless uv: true is passed.
export class Parts {
  constructor(mats, { occlusion = null } = {}) {
    this.mats = mats;
    this.occlusion = occlusion;
    this.lists = new Map();
  }

  add(key, geom, { tint = 0xffffff, uv = false, edge = null } = {}) {
    if (!this.mats[key]) throw new Error(`bridge parts: no material '${key}'`);
    let g = geom.index ? geom.toNonIndexed() : geom.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'aEdge'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const scale = this.mats[key].userData.uvScale;
    if (!uv && scale) projectUV(g, scale);
    if (edge !== null || !g.attributes.aEdge) g.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(n).fill(edge ?? 0), 1));
    const col = new Float32Array(n * 3);
    c3.set(tint);
    for (let i = 0; i < n * 3; i += 3) { col[i] = c3.r; col[i + 1] = c3.g; col[i + 2] = c3.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!this.lists.has(key)) this.lists.set(key, []);
    this.lists.get(key).push(g);
    return this;
  }

  // add a geometry and its mirror image across x = 0
  sym(key, geom, o) {
    this.add(key, geom, o);
    return this.add(key, mirrorX(geom), o);
  }

  get count() {
    let n = 0;
    for (const l of this.lists.values()) for (const g of l) n += g.attributes.position.count / 3;
    return n;
  }

  // Merge each material into one mesh under `parent`. `frame` maps the parent's local space into
  // room space (for the occlusion bake and the deck height) when the parts sit inside a pivot.
  build(parent, { shadow = true, frame = null, occlusion = true, name = '' } = {}) {
    const out = [];
    const p = V();
    for (const [key, list] of this.lists) {
      const g = mergeGeometries(list, false);
      const pos = g.attributes.position, col = g.attributes.color, nrm = g.attributes.normal;
      const ah = new Float32Array(pos.count);
      const nv = V();
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i);
        if (frame) p.applyMatrix4(frame);
        ah[i] = p.y;
        if (occlusion && this.occlusion && !this.mats[key].userData.noAO) {
          nv.fromBufferAttribute(nrm, i);
          if (frame) nv.transformDirection(frame);
          const k = this.occlusion(p, nv);
          col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
        }
      }
      g.setAttribute('aH', new THREE.BufferAttribute(ah, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const m = new THREE.Mesh(g, this.mats[key]);
      m.name = name ? `${name}:${key}` : key;
      m.castShadow = shadow && !this.mats[key].transparent;
      m.receiveShadow = true;
      parent.add(m);
      out.push(m);
      for (const l of list) l.dispose();
    }
    this.lists.clear();
    return out;
  }
}

// ---------------------------------------------------------------- shader patch chaining

// Hooks a patch into onBeforeCompile and the program cache key without being displaced by the ones
// main.js assigns later (patchSceneFog): those assignments are captured and run first (Drumfire).
export function chainPatch(mat, key, patch) {
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
  return mat;
}

const glslColor = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };

// Wear that depends on where a point is, applied after the maps:
//   chips   on marked edges (aEdge) the paint breaks through to an undercoat, then to bare metal
//   scuffs  boots and chairs mark the bottom 0.3 m of panels (aH), dark rubber smears and polish
//   grime   settles in the lowest centimetres and on up-facing ledges
// `wear` is a tiling noise texture (R fine, G mid, B patches) sampled in room space.
export function interiorFinish(mat, key, wear, {
  chip = 0.8, chipColor = 0x6f6a5c, bare = 0x8d8f8c, bareMetal = 0.6, scuff = 0.5, grime = 0.35, dust = 0.25,
  grimeColor = 0x3b3328, dustColor = 0x9c9680, scale = 2.2,
} = {}) {
  mat.userData.wear = wear;
  const code = /* glsl */ `
  {
    vec3 rp = vRoomPos * ${scale.toFixed(3)};
    vec3 an = abs(vRoomNormal);
    // triplanar weights: the room positions pick the right projection on every face
    vec3 tw = pow(an, vec3(4.0)); tw /= (tw.x + tw.y + tw.z + 1e-4);
    vec4 nz = texture2D(uWearMap, rp.xy) * tw.z + texture2D(uWearMap, rp.zy) * tw.x + texture2D(uWearMap, rp.xz) * tw.y;
    float edgeW = vEdge * (0.55 + 0.9 * nz.g);
    float chipA = smoothstep(0.62, 0.68, edgeW * (0.75 + 0.5 * nz.r)) * ${chip.toFixed(3)};
    float bareA = smoothstep(0.8, 0.86, edgeW * (0.7 + 0.6 * nz.r)) * ${chip.toFixed(3)};
    diffuseColor.rgb = mix(diffuseColor.rgb, ${glslColor(chipColor)} * (0.85 + 0.3 * nz.b), chipA);
    diffuseColor.rgb = mix(diffuseColor.rgb, ${glslColor(bare)} * (0.8 + 0.4 * nz.r), bareA);
    roughnessFactor = mix(roughnessFactor, 0.45, bareA);
    metalnessFactor = mix(metalnessFactor, ${bareMetal.toFixed(3)}, bareA);
    // kick zone: rubber smears and polish on vertical faces near the deck
    float low = 1.0 - smoothstep(0.02, 0.32, vH + (nz.b - 0.5) * 0.16);
    float vert = 1.0 - an.y;
    float smear = smoothstep(0.55, 0.75, nz.r * 0.6 + nz.g * 0.6) * low * vert * ${scuff.toFixed(3)};
    diffuseColor.rgb *= 1.0 - smear * 0.45;
    roughnessFactor = mix(roughnessFactor, 0.5, low * vert * ${(scuff * 0.4).toFixed(3)});
    // grime in the last few centimetres and dust on ledges
    float g0 = (1.0 - smoothstep(0.0, 0.06, vH)) * ${grime.toFixed(3)};
    diffuseColor.rgb = mix(diffuseColor.rgb, ${glslColor(grimeColor)}, g0 * (0.6 + 0.4 * nz.b));
    float up = smoothstep(0.7, 0.95, vRoomNormal.y) * step(0.05, vH);
    diffuseColor.rgb = mix(diffuseColor.rgb, ${glslColor(dustColor)}, up * ${dust.toFixed(3)} * (0.3 + 0.7 * nz.b));
  }`;
  chainPatch(mat, key, (shader) => {
    shader.uniforms.uWearMap = { value: wear };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aH;\nattribute float aEdge;\nvarying float vH;\nvarying float vEdge;\nvarying vec3 vRoomPos;\nvarying vec3 vRoomNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = aH;\nvEdge = aEdge;\nvRoomPos = position;\nvRoomNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uWearMap;\nvarying float vH;\nvarying float vEdge;\nvarying vec3 vRoomPos;\nvarying vec3 vRoomNormal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + code);
  });
  return mat;
}
